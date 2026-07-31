const db = require('./db');

// حالة الغرف تُحفظ في الذاكرة (مؤقتة بطبيعتها) — فقط الحسابات والجولات والصور تُحفظ في data.json.
const rooms = new Map(); // roomCode -> room

const ALLOWED_SIZES = [3, 6, 9, 12, 15];
const TEAM_SIZE = 3;
const ABANDONED_GRACE_MS = 20 * 60 * 1000; // 20 دقيقة بدون أي لاعب متصل قبل ما نحذف الغرفة نهائيًا

function touch(room) { room.lastActivityAt = Date.now(); }

// أمان: نشيل < > من اسم اللاعب/الفريق حتى لو الواجهة الحالية تعرضها بأمان — طبقة حماية
// إضافية تمنع حقن HTML لو أي كود مستقبلي عرض الاسم بطريقة غير آمنة (innerHTML مثلًا).
function sanitizeDisplayName(raw) {
  return String(raw || '').replace(/[<>]/g, '').trim().slice(0, 30);
}

function genCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function loadPlayableRounds() {
  return db
    .getRounds()
    .map((r) => ({
      id: r.id,
      hint: r.hint,
      answers: r.answers,
      hintPlayerIndex: r.hintPlayerIndex || 1,
      images: r.images.map((i) => i.url),
    }))
    // بالضبط 3 صور (صورة لكل لاعب بالفريق) — جولة بأقل من 3 تعني نفس الصورة تتكرر
    // لأكثر من لاعب (idx % images.length) فتنكسر فكرة اللعبة الأساسية بصمت.
    .filter((r) => r.images.length === TEAM_SIZE);
}

function makeTeam(index) {
  return {
    index,
    name: '',
    players: [], // { id, socketId, name, isCaptain }
    nextPlayerId: 1, // معرّف ثابت لكل لاعب داخل الفريق (يبقى نفسه حتى بعد استرجاع مكانه بعد انقطاع)
    roundIndex: 0,
    score: 0,
    elapsed: 0,
    locked: 0,
    wrongCount: 0, // عدد الإجابات الخاطئة في الجولة الحالية (لكشف التلميح بعد 3)
    started: false,
    timer: null,
    lockTimer: null,
    // أجهزة (deviceId) اتطردت من هذا الفريق — نمنع رجوعها التلقائي فقط (عند تحديث الصفحة أو
    // إعادة الاتصال)، بدون ما نمنع رجوعها لو ضغطت على الفريق يدويًا من جديد (مسموح).
    kickedDeviceIds: new Set(),
  };
}

// الغرفة الواحدة تنقسم لعدة فرق (كل فريق 3 لاعبين). كل فريق يبدأ ويلعب لحاله
// بدون أي ارتباط ببقية فرق نفس الغرفة.
function createRoom(io, socket, { maxPlayers }) {
  const code = genCode();
  const mp = ALLOWED_SIZES.includes(Number(maxPlayers)) ? Number(maxPlayers) : 3;
  const numTeams = Math.max(1, Math.floor(mp / TEAM_SIZE));
  const room = {
    code,
    maxPlayers: mp,
    teams: Array.from({ length: numTeams }, (_, i) => makeTeam(i)),
    rounds: loadPlayableRounds(),
    results: [], // نتائج الفرق المنتهية داخل هذه الغرفة
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.register(code, 'wslha');
  socket.join(code);
  socket.data.roomCode = code;
  return room;
}

function getRoom(code) {
  return rooms.get(String(code || '').trim());
}

function teamSummary(room) {
  return room.teams.map((t) => ({
    index: t.index,
    name: t.name,
    count: t.players.length,
    max: TEAM_SIZE,
    full: t.players.length >= TEAM_SIZE,
    started: t.started,
    players: t.players.map((p) => ({ id: p.id, name: p.name, isCaptain: p.isCaptain, connected: p.connected !== false })),
  }));
}

function broadcastLobby(io, room) {
  io.to(room.code).emit('lobby', { roomCode: room.code, teams: teamSummary(room) });
}

// تسجيل نتيجة فريق انتهى، وبثّ لوحة ترتيب فرق الغرفة (الأعلى نقاطًا ثم الأسرع).
function recordResult(room, team) {
  room.results = (room.results || []).filter((r) => r.index !== team.index);
  room.results.push({
    index: team.index,
    name: team.name || 'فريق ' + (team.index + 1),
    score: team.score,
    elapsed: team.elapsed,
  });
}
function roomResultsPayload(room) {
  const teams = (room.results || [])
    .slice()
    .sort((a, b) => b.score - a.score || a.elapsed - b.elapsed)
    .map((r) => ({ index: r.index, name: r.name, score: r.score, elapsed: r.elapsed }));
  return { roomCode: room.code, teams, totalRounds: room.rounds.length };
}
function broadcastRoomResults(io, room) {
  io.to(room.code).emit('roomResults', roomResultsPayload(room));
}

// لاعب يختار فريقًا (أو ينضم لفريق فيه أعضاء وفاضي مكان فيه).
// أول من يدخل فريقًا فاضيًا يصبح قائده ويسمّيه.
// إذا كان جهازه (deviceId) نفس جهاز عضو منقطع الاتصال بهذا الفريق، يسترجع مكانه بدل الانضمام كلاعب جديد.
function chooseTeam(io, socket, { roomCode, teamIndex, teamName, name, resume }) {
  const room = getRoom(roomCode);
  if (!room) return { error: 'لم يتم العثور على الغرفة' };
  const team = room.teams[Number(teamIndex)];
  if (!team) return { error: 'فريق غير موجود' };

  // محاولة رجوع تلقائي (بعد تحديث الصفحة أو إعادة اتصال) لجهاز مطرود من هذا الفريق — نرفضها
  // بصمت بدل ما نرجّعه للفريق تلقائيًا. لو رجع بنفسه وضغط على الفريق يدويًا (بدون علم resume)
  // فهذا مسار مختلف كليًا (بالأسفل) ويُسمح له ينضم عادي.
  if (resume && socket.data.deviceId && team.kickedDeviceIds.has(socket.data.deviceId)) {
    return { error: 'kicked' };
  }

  const currentRoomCode = socket.data.roomCode;
  const currentTeamIndex = socket.data.teamIndex;
  if (currentTeamIndex != null) {
    if (String(currentRoomCode) !== room.code || Number(currentTeamIndex) !== team.index) {
      return { error: 'غادر فريقك الحالي قبل الانضمام إلى فريق آخر' };
    }
    const currentPlayer = team.players.find((p) => p.socketId === socket.id);
    if (currentPlayer) {
      return { ok: true, teamIndex: team.index, isCaptain: currentPlayer.isCaptain, teams: teamSummary(room) };
    }
  }
  if (currentRoomCode && String(currentRoomCode) !== room.code && socket.leave) socket.leave(String(currentRoomCode));

  touch(room);
  const deviceId = socket.data.deviceId;
  const ghost = deviceId ? team.players.find((p) => p.deviceId === deviceId && p.connected === false) : null;
  if (ghost) {
    ghost.socketId = socket.id;
    ghost.connected = true;
    const cleanReclaimName = sanitizeDisplayName(name);
    if (cleanReclaimName) ghost.name = cleanReclaimName;
    socket.join(room.code);
    socket.join(room.code + ':' + team.index);
    socket.data.roomCode = room.code;
    socket.data.teamIndex = team.index;
    broadcastLobby(io, room);
    if (team.started) {
      // الفريق كان قد بدأ اللعب أثناء انقطاعه — نعيد له صورته وحالة الجولة الحالية بدل تصفيرها.
      const src = playerImageFor(room, team, ghost);
      const round = room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)];
      const hintIdx = (round && round.hintPlayerIndex) || 1;
      const playerPos = team.players.findIndex((p) => p.socketId === ghost.socketId);
      const hint = round && playerPos + 1 === hintIdx ? round.hint || '' : '';
      io.to(socket.id).emit('yourImage', { src, hint });
    }
    return {
      ok: true,
      teamIndex: team.index,
      isCaptain: ghost.isCaptain,
      teams: teamSummary(room),
      reclaimed: true,
      started: team.started,
      roundIndex: team.roundIndex,
      score: team.score,
      elapsed: team.elapsed,
      lockedSeconds: team.locked,
    };
  }

  if (team.started) return { error: 'هذا الفريق بدأ اللعب بالفعل' };
  if (team.players.length >= TEAM_SIZE) return { error: 'الفريق مكتمل' };

  const isCaptain = team.players.length === 0;
  if (isCaptain) team.name = sanitizeDisplayName(teamName) || 'فريق ' + (team.index + 1);
  const id = team.nextPlayerId++;
  team.players.push({ id, socketId: socket.id, name: sanitizeDisplayName(name) || 'لاعب', isCaptain, deviceId, connected: true });

  socket.join(room.code);
  socket.join(room.code + ':' + team.index);
  socket.data.roomCode = room.code;
  socket.data.teamIndex = team.index;

  broadcastLobby(io, room);
  return { ok: true, teamIndex: team.index, isCaptain, teams: teamSummary(room) };
}

function playerImageFor(room, team, player) {
  const round = team.roundIndex != null ? room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)] : null;
  if (!round || !round.images.length) return null;
  const idx = team.players.findIndex((p) => p.socketId === player.socketId);
  return round.images[idx % round.images.length];
}

function sendImages(io, room, team) {
  const round = room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)];
  const hintIdx = (round && round.hintPlayerIndex) || 1;
  team.players.forEach((p, i) => {
    const src = playerImageFor(room, team, p);
    // التلميح يروح فقط للاعب المحدد بالجولة (حسب ترتيب انضمامه للفريق) — باقي لاعبي الفريق لا يستلمون شي.
    const hint = round && i + 1 === hintIdx ? round.hint || '' : '';
    io.to(p.socketId).emit('yourImage', { src, hint });
  });
}

function getTeamForSocket(socket) {
  const code = socket.data.roomCode;
  const idx = socket.data.teamIndex;
  if (code == null || idx == null) return {};
  const room = getRoom(code);
  if (!room) return {};
  return { room, team: room.teams[idx] };
}

// اللعبة (لهذا الفريق فقط) لا تبدأ إلا لو اكتمل الفريق بـ3 لاعبين —
// بدون أي شرط على باقي فرق نفس الغرفة.
function startGame(io, socket) {
  const { room, team } = getTeamForSocket(socket);
  if (!room || !team) return { ok: false, error: 'لم يتم العثور على الفريق' };
  touch(room);
  if (team.started) return { ok: true };
  if (socket.id !== getCaptainSocketId(team)) {
    return { ok: false, error: 'القائد فقط يبدأ اللعبة' };
  }
  if (team.players.length < TEAM_SIZE) {
    return { ok: false, error: 'الفريق غير مكتمل — يحتاج ' + TEAM_SIZE + ' لاعبين لبدء اللعبة' };
  }
  if (!room.rounds.length) {
    return { ok: false, error: 'لا توجد جولات متاحة — أضف جولة وصور من لوحة التحكم' };
  }

  team.started = true;
  team.roundIndex = 0;
  team.score = 0;
  team.elapsed = 0;
  team.locked = 0;
  team.wrongCount = 0;

  const teamChannel = room.code + ':' + team.index;
  io.to(teamChannel).emit('gameStarted', { roundIndex: 0, score: 0, elapsed: 0 });
  sendImages(io, room, team);

  clearInterval(team.timer);
  team.timer = setInterval(() => {
    team.elapsed += 1;
    io.to(teamChannel).emit('state', {
      roundIndex: team.roundIndex,
      score: team.score,
      elapsed: team.elapsed,
      lockedSeconds: team.locked,
    });
  }, 1000);
  if (team.timer.unref) team.timer.unref(); // ما يمنع خروج العملية (مفيد بالاختبارات الآلية، بدون أي أثر بالتشغيل العادي)
  return { ok: true };
}

function getCaptainSocketId(team) {
  const c = team.players.find((p) => p.isCaptain);
  return c && c.socketId;
}

function submitAnswer(io, socket, answer) {
  const { room, team } = getTeamForSocket(socket);
  if (!room || !team) return { error: 'لم يتم العثور على الفريق' };
  touch(room);
  if (socket.id !== getCaptainSocketId(team)) {
    return { error: 'القائد فقط يرسل الإجابة' };
  }
  if (team.locked > 0) {
    return { correct: false, locked: true, lockedSeconds: team.locked };
  }
  const round = room.rounds[Math.min(team.roundIndex, room.rounds.length - 1)];
  if (!round) return { error: 'لا توجد جولة حالية' };

  const ans = String(answer || '').trim().toLowerCase();
  // مطابقة جزئية مسموحة فقط لو الجزء الأقصر يغطي 80% على الأقل من الكلمة (يمنع قبول إجابة قصيرة أو ناقصة كإجابة صحيحة).
  const fuzzyMatch = (a, b) => {
    if (a === b) return true;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length < 2) return false;
    return longer.includes(shorter) && shorter.length >= longer.length * 0.8;
  };
  const ok =
    round.answers.length === 0
      ? ans.length >= 2
      : ans.length >= 2 && round.answers.some((a) => fuzzyMatch(String(a).trim().toLowerCase(), ans));

  const teamChannel = room.code + ':' + team.index;

  if (ok) {
    team.score += 1;
    team.roundIndex += 1;
    if (team.roundIndex >= room.rounds.length) {
      clearInterval(team.timer);
      team.timer = null;
      team.started = false;
      recordResult(room, team);
      io.to(teamChannel).emit('finished', { score: team.score, results: roomResultsPayload(room) });
      broadcastRoomResults(io, room);
    } else {
      team.wrongCount = 0; // جولة جديدة — نعيد العدّاد ونخفي التلميح
      io.to(socket.id).emit('correct', {});
      io.to(teamChannel).emit('hint', { text: '' });
      sendImages(io, room, team);
    }
    return { ok: true, correct: true };
  }

  team.wrongCount = (team.wrongCount || 0) + 1;
  team.locked = 15;
  clearInterval(team.lockTimer);
  io.to(teamChannel).emit('locked', { lockedSeconds: team.locked });
  team.lockTimer = setInterval(() => {
    team.locked -= 1;
    io.to(teamChannel).emit('locked', { lockedSeconds: team.locked });
    if (team.locked <= 0) {
      clearInterval(team.lockTimer);
      team.lockTimer = null;
      // كشف التلميح عند انتهاء قفل الإجابة الخاطئة الثالثة (مو فورًا)
      if (team.wrongCount >= 3 && round.hint) io.to(teamChannel).emit('hint', { text: round.hint });
    }
  }, 1000);
  if (team.lockTimer.unref) team.lockTimer.unref();
  return { ok: true, correct: false, lockedSeconds: team.locked };
}

// يشيل اللاعب فعليًا من الفريق (يُستدعى لمغادرة صريحة، أو لانقطاع أثناء لعبة بدأت فعلًا).
function removePlayerFromTeam(io, room, team, socketId) {
  team.players = team.players.filter((p) => p.socketId !== socketId);
  if (!team.players.length) {
    clearInterval(team.timer);
    clearInterval(team.lockTimer);
    team.timer = null;
    team.lockTimer = null;
    team.name = '';
    team.started = false;
    team.roundIndex = 0;
    team.score = 0;
    team.elapsed = 0;
    team.locked = 0;
  } else if (!team.players.some((p) => p.isCaptain)) {
    team.players[0].isCaptain = true;
    // العميل يخزّن دوره (قائد/عضو) محليًا وقت الانضمام ولا يحدّثه تلقائيًا من بث اللوبي
    // العام (الأسماء/الأدوار بالقائمة تتحدث، لكن زر «ابدأ اللعبة» يعتمد على state.role
    // المحلي) — نبلّغ القائد الجديد مباشرة عشان يظهر له الزر فورًا.
    io.to(team.players[0].socketId).emit('captainPromoted', {});
  }

  const anyPlayers = room.teams.some((t) => t.players.length > 0);
  if (!anyPlayers) {
    room.teams.forEach((t) => {
      clearInterval(t.timer);
      clearInterval(t.lockTimer);
    });
    rooms.delete(room.code);
    if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.unregister(room.code);
    return;
  }
  broadcastLobby(io, room);
}

// انقطاع الاتصال (إغلاق التبويب، تحديث الصفحة، ضعف الشبكة...):
// نُبقي اللاعب محجوز مكانه عند أي انقطاع حتى أثناء الجولة؛ هذا مهم للجوال، ويتيح استعادة
// الصورة والحالة نفسها عبر نفس deviceId بدل كسر الجولة بسبب تقطع الشبكة.
function leave(io, socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = getRoom(code);
  if (!room) return;

  const idx = socket.data.teamIndex;
  if (idx == null || !room.teams[idx]) return;
  const team = room.teams[idx];
  const player = team.players.find((p) => p.socketId === socket.id);
  if (!player) return;

  player.connected = false;
  if (player.isCaptain) {
    const replacement = team.players.find((p) => p.id !== player.id && p.connected !== false);
    if (replacement) {
      player.isCaptain = false;
      replacement.isCaptain = true;
      io.to(replacement.socketId).emit('captainPromoted', {});
    }
  }
  touch(room); // نبدأ عدّاد السماح من لحظة الانقطاع نفسها (مو من آخر نشاط أقدم)
  broadcastLobby(io, room);
}

// مغادرة صريحة (زر «مغادرة الغرفة») — يحرر مكان اللاعب فعليًا بغض النظر عن حالة الفريق.
function leaveTeam(io, socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = getRoom(code);
  if (!room) return;
  const idx = socket.data.teamIndex;
  if (idx == null || !room.teams[idx]) return;
  removePlayerFromTeam(io, room, room.teams[idx], socket.id);
  if (socket.leave) {
    socket.leave(code);
    socket.leave(code + ':' + idx);
  }
  socket.data.roomCode = null;
  socket.data.teamIndex = null;
}

// القائد يطرد عضوًا من فريقه قبل بدء اللعبة فقط. يعيد { ok } أو { error }.
function kickPlayer(io, socket, { playerId }) {
  const code = socket.data.roomCode;
  if (!code) return { error: 'لست داخل غرفة' };
  const room = getRoom(code);
  if (!room) return { error: 'لم يتم العثور على الغرفة' };
  const idx = socket.data.teamIndex;
  if (idx == null || !room.teams[idx]) return { error: 'لم يتم العثور على الفريق' };
  const team = room.teams[idx];
  if (socket.id !== getCaptainSocketId(team)) return { error: 'القائد فقط يقدر يطرد لاعبين' };
  if (team.started) return { error: 'ما تقدر تطرد لاعب بعد بدء اللعبة' };
  const target = team.players.find((p) => p.id === Number(playerId));
  if (!target) return { error: 'اللاعب غير موجود' };
  if (target.isCaptain) return { error: 'ما تقدر تطرد نفسك — استخدم مغادرة الغرفة' };
  if (target.deviceId) team.kickedDeviceIds.add(target.deviceId);
  if (target.connected !== false) io.to(target.socketId).emit('kicked', {});
  removePlayerFromTeam(io, room, team, target.socketId);
  return { ok: true };
}

// تنظيف دوري للغرف "المهجورة": كل لاعبيها غير متصلين (حتى لو ما زالوا محجوزين بمصفوفة اللاعبين
// بفضل ميزة عدم الطرد الفوري)، ومر عليها وقت سماح كافٍ بدون أي نشاط. يمنع تراكم غرف بالذاكرة للأبد.
function sweepAbandonedRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasConnected = room.teams.some((t) => t.players.some((p) => p.connected !== false));
    if (hasConnected) continue;
    const idleFor = now - (room.lastActivityAt || 0);
    if (idleFor < ABANDONED_GRACE_MS) continue;
    room.teams.forEach((t) => {
      clearInterval(t.timer);
      clearInterval(t.lockTimer);
    });
    rooms.delete(code);
    if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.unregister(code);
  }
}

function getActiveRoomsStats() {
  let totalPlayers = 0;
  for (const r of rooms.values()) {
    for (const t of r.teams) totalPlayers += t.players.length;
  }
  return { activeRooms: rooms.size, totalPlayers };
}

function restoreTeamTimers(team) {
  if (team.started) {
    team.timer = setInterval(() => { team.elapsed += 1; }, 1000);
    if (team.timer.unref) team.timer.unref();
  }
  if (team.locked > 0) {
    team.lockTimer = setInterval(() => {
      team.locked -= 1;
      if (team.locked <= 0) {
        clearInterval(team.lockTimer);
        team.lockTimer = null;
      }
    }, 1000);
    if (team.lockTimer.unref) team.lockTimer.unref();
  }
}

function snapshotActiveRooms() {
  return [...rooms.values()].map((room) => ({
    code: room.code,
    maxPlayers: room.maxPlayers,
    rounds: room.rounds,
    results: room.results || [],
    lastActivityAt: room.lastActivityAt,
    teams: room.teams.map((team) => ({
      ...team,
      timer: null,
      lockTimer: null,
      players: team.players.map((player) => ({ ...player, socketId: null, connected: false })),
    })),
  }));
}

function restoreActiveRooms(snapshot) {
  if (!Array.isArray(snapshot)) return 0;
  let restored = 0;
  for (const rawRoom of snapshot) {
    if (!rawRoom || !/^\d{6}$/.test(String(rawRoom.code || ''))) continue;
    const rawTeams = Array.isArray(rawRoom.teams) ? rawRoom.teams : [];
    const room = {
      code: String(rawRoom.code),
      maxPlayers: ALLOWED_SIZES.includes(Number(rawRoom.maxPlayers)) ? Number(rawRoom.maxPlayers) : 3,
      rounds: Array.isArray(rawRoom.rounds) ? rawRoom.rounds : [],
      results: Array.isArray(rawRoom.results) ? rawRoom.results : [],
      lastActivityAt: Date.now(),
      teams: rawTeams.map((rawTeam, index) => {
        const team = Object.assign(makeTeam(index), rawTeam, {
          index,
          timer: null,
          lockTimer: null,
          players: (rawTeam.players || []).map((player) => ({ ...player, socketId: null, connected: false })),
        });
        restoreTeamTimers(team);
        return team;
      }),
    };
    if (!room.teams.length) continue;
    rooms.set(room.code, room);
    if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.register(room.code, 'wslha');
    restored += 1;
  }
  return restored;
}

module.exports = {
  createRoom,
  chooseTeam,
  teamSummary,
  broadcastLobby,
  startGame,
  submitAnswer,
  leave,
  leaveTeam,
  kickPlayer,
  getRoom,
  getActiveRoomsStats,
  sweepAbandonedRooms,
  snapshotActiveRooms,
  restoreActiveRooms,
};
