const rooms = require('./rooms');
const game = require('./game');
const { ROLES, isEvil, roleAlignment } = require('./roles');
const { createSocketLimiter } = require('./rateLimit');

const allow = createSocketLimiter({ windowMs: 10000, max: 40 });
const JOIN_ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_BAD_JOIN_CODES = 5;
const badJoinAttempts = new Map();
// مفاتيحها (IP+deviceId) ما تُحذف إلا عند نجاح انضمام (clearBadJoin) — محاولات فاشلة متكررة
// بلا نجاح أبدًا تبقى بالذاكرة للأبد بدون هذا التنظيف الدوري.
const badJoinSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of badJoinAttempts) {
    if (now - entry.windowStart > JOIN_ATTEMPT_WINDOW_MS) badJoinAttempts.delete(key);
  }
}, 10 * 60 * 1000);
if (badJoinSweepTimer.unref) badJoinSweepTimer.unref();

function joinAttemptKey(socket, deviceId) {
  const address = socket.handshake.address || (socket.conn && socket.conn.remoteAddress) || 'unknown';
  return `${address}|${deviceId || socket.id}`;
}

function badJoinStatus(key) {
  const now = Date.now();
  const entry = badJoinAttempts.get(key);
  if (!entry || now - entry.windowStart > JOIN_ATTEMPT_WINDOW_MS) {
    return { blocked: false, remainingMs: 0 };
  }
  if (entry.count >= MAX_BAD_JOIN_CODES) {
    return { blocked: true, remainingMs: JOIN_ATTEMPT_WINDOW_MS - (now - entry.windowStart) };
  }
  return { blocked: false, remainingMs: 0 };
}

function recordBadJoin(key) {
  const now = Date.now();
  const entry = badJoinAttempts.get(key);
  if (!entry || now - entry.windowStart > JOIN_ATTEMPT_WINDOW_MS) {
    badJoinAttempts.set(key, { windowStart: now, count: 1 });
    return;
  }
  entry.count += 1;
}

function clearBadJoin(key) {
  badJoinAttempts.delete(key);
}

function botDelay(min = 400, max = 1800) {
  return min + Math.random() * (max - min);
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// أمان: نشيل < > حتى لو الواجهة الحالية تعرض الأسماء بأمان (textContent) — طبقة حماية
// إضافية تمنع حقن HTML لو أي كود مستقبلي عرض الاسم بطريقة غير آمنة (innerHTML مثلًا).
function sanitizeName(raw) {
  const name = String(raw || '').replace(/[<>]/g, '').trim().slice(0, 20);
  return name || 'لاعب';
}

function getRoomForSocket(socket) {
  if (!socket.data.roomCode) return null;
  return rooms.getRoom(socket.data.roomCode);
}

function emitTo(io, player, event, payload) {
  if (player && player.socketId) io.to(player.socketId).emit(event, payload);
}

function broadcastRoomUpdate(io, room) {
  io.to(room.code).emit('roomUpdate', rooms.serializeRoom(room, game.VOTE_MS));
}

function broadcastLog(io, room) {
  io.to(room.code).emit('logUpdate', { log: room.log });
}

function broadcastVotes(io, room) {
  const votes = {};
  for (const [voterId, targetId] of room.votes) votes[voterId] = targetId;
  const vc = game.voteCounts(room);
  const raw = {};
  for (const [id, n] of vc.raw) raw[id] = n;
  io.to(room.code).emit('votesUpdate', { votes, raw, accusedId: vc.accused, pardons: room.pardonRequests.size, executes: room.executeRequests.size });
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

function setPhase(io, room, phase, ms, onTimeout) {
  clearPhaseTimer(room);
  room.phase = phase;
  room.deadlineTs = ms ? Date.now() + ms : null;
  broadcastRoomUpdate(io, room);
  if (ms && onTimeout) {
    room.phaseTimer = setTimeout(() => {
      if (rooms.getRoom(room.code)) onTimeout();
    }, ms);
  }
}

function rolePayload(room, player) {
  const role = ROLES[player.roleId];
  return {
    role: { id: role.id, label: role.label, team: role.team, alignment: roleAlignment(role.id), night: role.night },
    card: game.playerCard(room, player),
    presentCards: game.presentCardFiles(room),
  };
}

function sendRole(io, room, player) {
  emitTo(io, player, 'roleAssigned', rolePayload(room, player));
}

function sendRoleChange(io, room, player) {
  emitTo(io, player, 'roleChanged', rolePayload(room, player));
}

function mafiaPartners(room, player) {
  if (!game.isMafiaKiller(player.roleId)) return [];
  return game.aliveMafias(room).filter((m) => m.id !== player.id).map((m) => ({ id: m.id, name: m.name }));
}

function sendNightRole(io, room, player) {
  const night = player.alive ? game.nightRoleFor(room, player) : 'dead';
  const alive = rooms.alivePlayers(room);
  const killTargets = alive.filter((p) => !isEvil(p.roleId) && p.id !== room.mafiaLastTargetId);
  const protectTargets = alive.filter((p) => p.id !== room.doctorLastPickId);
  emitTo(io, player, 'nightRole', {
    night,
    round: room.round,
    partners: mafiaPartners(room, player),
    targets: alive
      .filter((p) => {
        if (night === 'kill') return killTargets.some((target) => target.id === p.id);
        if (night === 'check' || night === 'steal') return p.id !== player.id;
        if (night === 'protect') return protectTargets.length === 0 || protectTargets.some((target) => target.id === p.id);
        return true;
      })
      .map((p) => ({ id: p.id, name: p.name })),
    checked: night === 'check'
      ? [...(room.sheikhNotebooks.get(player.id) || new Map())].map(([id, evil]) => ({ id, isEvil: evil }))
      : [],
    fighterUsed: room.fighterUsed,
  });
}

function sendNotebook(io, room, player) {
  if (player.roleId !== 'sheikh') return;
  const notebook = room.sheikhNotebooks.get(player.id) || new Map();
  emitTo(io, player, 'sheikhNotebook', {
    checks: [...notebook].map(([id, evil]) => {
      const target = room.players.get(id);
      return { id, name: target ? target.name : '', isEvil: evil };
    }),
  });
}

function beginNightFlow(io, room) {
  game.beginNight(room);
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const night = game.nightRoleFor(room, p);
    if (night === 'curse') room.nightDone.add(p.id);
  }
  setPhase(io, room, 'night', game.NIGHT_MS, () => resolveNightFlow(io, room));
  for (const p of room.players.values()) sendNightRole(io, room, p);
  scheduleBotNightActions(io, room);
}

function checkNightComplete(io, room) {
  if (room.phase === 'night' && game.allNightDone(room)) resolveNightFlow(io, room);
}

function resolveNightFlow(io, room) {
  if (room.phase !== 'night') return;
  clearPhaseTimer(room);
  const result = game.resolveNight(room);
  broadcastLog(io, room);

  const win = game.winCheck(room);

  if (result.outcome === 'killed') {
    const victim = room.players.get(result.victimId);
    emitTo(io, victim, 'youDied', {
      deathTitle: victim.deathTitle,
      deathReason: victim.deathReason,
      card: game.playerCard(room, victim),
      team: ROLES[victim.roleId].team,
      alignment: roleAlignment(victim.roleId),
    });
    room.deathRevealReady.clear();
    setPhase(io, room, 'deathReveal', game.DEATH_REVEAL_MS, () => afterDeathReveal(io, room, win));
    io.to(room.code).emit('deathReveal', { name: victim.name });
    scheduleBotDeathReady(io, room);
    return;
  }

  if (result.outcome === 'shift' && result.shiftedId) {
    const shifted = room.players.get(result.shiftedId);
    if (shifted) sendRoleChange(io, room, shifted);
    io.to(room.code).emit('cardsUpdate', { presentCards: game.presentCardFiles(room) });
  }

  if (win) { gameOverFlow(io, room, win.w, win.why); return; }
  io.to(room.code).emit('nightOutcome', { outcome: result.outcome });
  toDayFlow(io, room);
}

function afterDeathReveal(io, room, win) {
  if (room.phase !== 'deathReveal') return;
  if (win) { gameOverFlow(io, room, win.w, win.why); return; }
  toDayFlow(io, room);
}

function toDayFlow(io, room) {
  room.dayReady.clear();
  setPhase(io, room, 'day', game.DAY_MS, () => toVoteFlow(io, room));
  io.to(room.code).emit('dayInfo', { event: game.dayEvent(room), log: room.log });
  for (const p of room.players.values()) sendNotebook(io, room, p);
  scheduleBotDayReady(io, room);
}

function toVoteFlow(io, room) {
  if (room.phase !== 'day') return;
  setPhase(io, room, 'vote', room.voteMs || game.VOTE_MS, () => endVoteFlow(io, room));
  const stolen = room.stolenVoterId ? room.players.get(room.stolenVoterId) : null;
  if (stolen) emitTo(io, stolen, 'voteBlocked', {});
  broadcastVotes(io, room);
  scheduleBotVotes(io, room);
}

function endVoteFlow(io, room) {
  if (room.phase !== 'vote') return;
  clearPhaseTimer(room);
  const vc = game.voteCounts(room);
  if (vc.accused && vc.max > 1) {
    defenseFlow(io, room, vc.accused);
  } else {
    game.logPardon(room, vc.tied);
    broadcastLog(io, room);
    nextRound(io, room);
  }
}

function defenseFlow(io, room, accusedId) {
  room.accusedId = accusedId;
  room.defenseExecute.clear();
  room.defenseChange.clear();
  setPhase(io, room, 'defense', game.DEFENSE_MS, () => expelFlow(io, room, accusedId));
  const accused = room.players.get(accusedId);
  io.to(room.code).emit('defenseStarted', { accusedId, accusedName: accused ? accused.name : '' });
  scheduleBotDefense(io, room);
}

function expelFlow(io, room, accusedId) {
  if (room.expelInProgress) return;
  const accused = room.players.get(accusedId);
  if (!accused || !accused.alive) return;
  room.expelInProgress = true;
  clearPhaseTimer(room);
  room.expelStampId = accusedId;
  io.to(room.code).emit('expelStamp', { playerId: accusedId });
  room.phaseTimer = setTimeout(() => {
    if (!rooms.getRoom(room.code)) return;
    const result = game.expel(room, accusedId);
    broadcastLog(io, room);
    if (!result) {
      room.expelInProgress = false;
      return;
    }
    if (result && result.spared) {
      const revealed = room.players.get(accusedId);
      io.to(room.code).emit('princessRevealed', {
        playerId: accusedId,
        name: revealed ? revealed.name : '',
        roleLabel: result.roleLabel,
        card: result.card,
        team: revealed ? ROLES[revealed.roleId].team : 'خير',
        alignment: revealed ? roleAlignment(revealed.roleId) : 'good',
      });
    } else {
      const expelled = room.players.get(accusedId);
      emitTo(io, expelled, 'youDied', {
        deathTitle: expelled.deathTitle,
        deathReason: expelled.deathReason,
        card: game.playerCard(room, expelled),
        team: ROLES[expelled.roleId].team,
        alignment: roleAlignment(expelled.roleId),
      });
    }
    const win = game.winCheck(room);
    if (win) {
      const why = result && result.wasEvil
        ? `أقصت المدينة ${room.players.get(accusedId).name} — وكان من العصابة فعلًا.`
        : win.why;
      gameOverFlow(io, room, win.w, why);
      return;
    }
    nextRound(io, room);
  }, 1600);
}

function nextRound(io, room) {
  room.round += 1;
  beginNightFlow(io, room);
}

function gameOverFlow(io, room, winner, why) {
  clearPhaseTimer(room);
  const result = game.finishGame(room, winner, why);
  room.deadlineTs = null;
  io.to(room.code).emit('gameOver', result);
  broadcastRoomUpdate(io, room);
  recordGameStats(room, result);
}

// إحصائيات شخصية لكل لاعب مسجّل حساب فعليًا بدورك (الضيوف بدون حساب يُستثنون تلقائيًا —
// platformUid يبقى null لهم). البوتات ما عندها platformUid أصلًا فتُستثنى بنفس الطريقة.
function recordGameStats(room, result) {
  if (!global.__DOURK_PLATFORM__) return;
  for (const r of result.roles) {
    const player = room.players.get(r.playerId);
    if (!player || !player.platformUid) continue;
    global.__DOURK_PLATFORM__.stats.recordMafia(player.platformUid, r.alignment, r.won);
  }
}

function resendState(io, room, playerId) {
  const player = room.players.get(playerId);
  if (!player || !player.roleId) return;
  sendRole(io, room, player);
  broadcastLog(io, room);
  sendNotebook(io, room, player);
  if (!player.alive) {
    emitTo(io, player, 'youDied', {
      deathTitle: player.deathTitle,
      deathReason: player.deathReason,
      card: game.playerCard(room, player),
      team: ROLES[player.roleId].team,
      alignment: roleAlignment(player.roleId),
    });
  }
  if (room.phase === 'night') sendNightRole(io, room, player);
  if (room.phase === 'day') emitTo(io, player, 'dayInfo', { event: game.dayEvent(room), log: room.log });
  if (room.phase === 'vote') {
    broadcastVotes(io, room);
    if (room.stolenVoterId === playerId) emitTo(io, player, 'voteBlocked', {});
  }
  if (room.phase === 'defense' && room.accusedId) {
    const accused = room.players.get(room.accusedId);
    emitTo(io, player, 'defenseStarted', { accusedId: room.accusedId, accusedName: accused ? accused.name : '' });
  }
  if (room.phase === 'gameover' && room.gameOverResult) {
    emitTo(io, player, 'gameOver', room.gameOverResult);
  }
}

function handleDisconnectOrLeave(io, socket, { explicit }) {
  const room = getRoomForSocket(socket);
  if (!room) return;
  const playerId = socket.data.playerId;
  const player = room.players.get(playerId);
  if (!player) return;

  // لعبة جارية فعليًا (بعد اللوبي، قبل النهاية): مغادرة صريحة تُعامَل كانقطاع اتصال بحت
  // (يبقى بقائمة اللاعبين، بس غير متصل) بدل حذفه كليًا — عشان لو تحدد الفائز لاحقًا يُحسب
  // له إحصائياته الشخصية بغض النظر إنه غادر أو لا. الحذف الكامل يبقى فقط قبل بدء اللعبة
  // (لوبي) أو بعد انتهائها (gameover) حيث ما فيه نتيجة معلّقة يحتاجها.
  const gameInProgress = room.phase !== 'lobby' && room.phase !== 'gameover';
  if (explicit && !gameInProgress) {
    const roomCode = room.code;
    socket.leave(roomCode);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    rooms.leaveRoom(room, playerId);
    if (rooms.getRoom(roomCode)) broadcastRoomUpdate(io, room);
    return;
  }
  if (player.socketId === socket.id) {
    if (explicit) {
      // مغادرة صريحة أثناء لعبة جارية: يسيب غرفة السوكيت فعليًا (ما يستقبل بث بعدها)، بس
      // يبقى داخل room.players (غير متصل) حتى تُحسب نتيجته لو انتهت اللعبة لاحقًا.
      socket.leave(room.code);
      socket.data.roomCode = null;
      socket.data.playerId = null;
    }
    player.connected = false;
    room.lastActivityAt = Date.now();
    // انقطاع القائد تحديدًا (بعكس أي عضو ثاني) — بدون هذا، أي انقطاع مفاجئ لصاحب الغرفة
    // (تحطم تبويب، إغلاق الجوال) يعلّق الغرفة للأبد: ما أحد يقدر يبدأ لعبة جديدة، وما فيه
    // تنظيف تلقائي طالما فيه لاعبين ثانين متصلين. بعد مهلة سماح ننقل القيادة تلقائيًا.
    if (room.hostId === playerId) {
      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = setTimeout(() => {
        room.hostGraceTimer = null;
        const stillRoom = rooms.getRoom(room.code);
        if (!stillRoom) return;
        if (rooms.migrateHostToConnectedPlayer(stillRoom)) broadcastRoomUpdate(io, stillRoom);
      }, rooms.HOST_DISCONNECT_GRACE_MS);
    }
    broadcastRoomUpdate(io, room);
  }
}

function majorityOf(count) {
  return Math.floor(count / 2) + 1;
}

function botTimer(room, fn, delay) {
  const id = setTimeout(() => {
    if (rooms.getRoom(room.code)) fn();
  }, delay);
  return id;
}

function aliveBots(room) {
  return rooms.alivePlayers(room).filter((p) => p.isBot);
}

function scheduleBotRevealDone(io, room) {
  for (const bot of aliveBots(room)) {
    botTimer(room, () => {
      if (room.phase !== 'reveal') return;
      room.revealDone.add(bot.id);
      const allDone = rooms.alivePlayers(room).every((p) => room.revealDone.has(p.id));
      if (allDone) beginNightFlow(io, room);
    }, botDelay());
  }
}

function runBotNightAction(io, room, player) {
  if (room.phase !== 'night' || !player.alive) return;
  const night = game.nightRoleFor(room, player);
  try {
    if (night === 'kill') {
      const targets = rooms.alivePlayers(room).filter((p) => p.id !== player.id && !isEvil(p.roleId) && p.id !== room.mafiaLastTargetId);
      if (targets.length) {
        const target = rand(targets);
        game.submitMafiaPick(room, player.id, target.id);
        try { game.confirmKill(room, player.id); } catch (e) { /* awaiting partner match */ }
      }
    } else if (night === 'protect') {
      let targets = rooms.alivePlayers(room);
      const freshTargets = targets.filter((p) => p.id !== room.doctorLastPickId);
      if (freshTargets.length) targets = freshTargets;
      if (targets.length) game.submitProtect(room, player.id, rand(targets).id);
    } else if (night === 'check') {
      const notebook = room.sheikhNotebooks.get(player.id) || new Map();
      const targets = rooms.alivePlayers(room).filter((p) => p.id !== player.id && !notebook.has(p.id));
      if (targets.length) game.submitCheck(room, player.id, rand(targets).id);
      game.markNightReady(room, player.id);
    } else if (night === 'steal') {
      const targets = rooms.alivePlayers(room).filter((p) => p.id !== player.id);
      if (targets.length) game.submitSteal(room, player.id, rand(targets).id);
    } else if (night === 'fighter') {
      if (!room.fighterUsed && Math.random() < 0.35) game.activateFighterGuard(room, player.id);
      else game.markNightReady(room, player.id);
    } else {
      game.markNightReady(room, player.id);
    }
  } catch (err) { /* ignore invalid bot action */ }
  checkNightComplete(io, room);
}

function scheduleBotNightActions(io, room) {
  for (const bot of aliveBots(room)) {
    botTimer(room, () => runBotNightAction(io, room, bot), botDelay());
  }
}

function scheduleBotDeathReady(io, room) {
  for (const bot of aliveBots(room)) {
    botTimer(room, () => {
      if (room.phase !== 'deathReveal') return;
      room.deathRevealReady.add(bot.id);
      const allReady = rooms.alivePlayers(room).every((p) => room.deathRevealReady.has(p.id));
      if (allReady) {
        const win = game.winCheck(room);
        clearPhaseTimer(room);
        afterDeathReveal(io, room, win);
      }
    }, botDelay());
  }
}

function scheduleBotDayReady(io, room) {
  for (const bot of aliveBots(room)) {
    botTimer(room, () => {
      if (room.phase !== 'day') return;
      room.dayReady.add(bot.id);
      const allReady = rooms.alivePlayers(room).every((p) => room.dayReady.has(p.id));
      if (allReady) {
        clearPhaseTimer(room);
        toVoteFlow(io, room);
      }
    }, botDelay());
  }
}

function scheduleBotVotes(io, room) {
  for (const bot of aliveBots(room)) {
    if (bot.id === room.stolenVoterId) continue;
    botTimer(room, () => {
      if (room.phase !== 'vote') return;
      const vc = game.voteCounts(room);
      let candidates = rooms.alivePlayers(room).filter((p) => p.id !== bot.id);
      if (isEvil(bot.roleId)) candidates = candidates.filter((p) => !isEvil(p.roleId));
      if (!candidates.length) return;
      let target;
      if (vc.accused && candidates.some((p) => p.id === vc.accused) && Math.random() < 0.6) target = room.players.get(vc.accused);
      else target = rand(candidates);
      try {
        game.toggleVote(room, bot.id, target.id);
        broadcastVotes(io, room);
      } catch (err) { /* ignore */ }
    }, botDelay());
  }
}

function scheduleBotDefense(io, room) {
  for (const bot of aliveBots(room)) {
    if (bot.id === room.accusedId) continue;
    botTimer(room, () => {
      if (room.phase !== 'defense') return;
      const choice = Math.random() < 0.7 ? 'execute' : 'change';
      if (choice === 'execute') { room.defenseExecute.add(bot.id); room.defenseChange.delete(bot.id); }
      else { room.defenseChange.add(bot.id); room.defenseExecute.delete(bot.id); }
      const jury = rooms.alivePlayers(room).filter((p) => p.id !== room.accusedId).length;
      io.to(room.code).emit('defenseUpdate', { executes: room.defenseExecute.size, changes: room.defenseChange.size, jury });
      if (room.defenseExecute.size >= majorityOf(jury)) {
        expelFlow(io, room, room.accusedId);
      } else if (room.defenseChange.size >= majorityOf(jury)) {
        room.accusedId = null;
        setPhase(io, room, 'vote', room.voteMs || game.VOTE_MS, () => endVoteFlow(io, room));
        broadcastVotes(io, room);
        scheduleBotVotes(io, room);
      }
    }, botDelay());
  }
}

function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    const deviceId = socket.handshake.auth && socket.handshake.auth.deviceId;

    // هوية حقيقية من كوكي جلسة دورك (لو متاحة) — منفصلة تمامًا عن deviceId اللي يبقى أساس
    // صلاحيات اللعب العادية (قائد/طرد/بدء) كما هو. deviceId يقدر أي متصفح يخترعه بنفسه،
    // فما نثق فيه لأي إجراء يلمس تذاكر/فلوس — تلك تتحقق من هذي الهوية الحقيقية تحديدًا.
    socket.data.platformUserId = (global.__DOURK_PLATFORM__ && global.__DOURK_PLATFORM__.auth)
      ? (global.__DOURK_PLATFORM__.auth.verifyFromCookieHeader(socket.handshake.headers.cookie) || {}).id || null
      : null;

    // Promise.resolve().then(...) يلتقط الأخطاء المتزامنة وغير المتزامنة بنفس الطريقة —
    // يسمح لمعالِجات مثل newGame تتحقق من رصيد التذاكر (خصم غير متزامن) قبل تنفيذ الإجراء.
    const inRoom = (fn) => (payload, cb) => {
      const room = getRoomForSocket(socket);
      if (!room) { cb && cb({ error: 'لست داخل غرفة' }); return; }
      Promise.resolve()
        .then(() => fn(room, payload || {}, cb))
        .catch((err) => { cb && cb({ error: err.message }); });
    };

    socket.on('createRoom', (payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة، حاول بعد قليل' });
      try {
        if (!deviceId) throw new Error('معرّف الجهاز مفقود');
        if (socket.data.roomCode) throw new Error('غادر غرفتك الحالية قبل إنشاء غرفة جديدة');
        // لو اللعبة تعمل ضمن منصة دورك (مسجّلة عبر global)، لازم تذكرة غرفة صادرة من المنصة —
        // يمنع إنشاء غرفة مجانًا بفتح /mafia/ مباشرة بدون المرور بخصم التذاكر.
        let platformUid = null;
        if (global.__DOURK_PLATFORM__) {
          platformUid = global.__DOURK_PLATFORM__.tickets.redeem(payload && payload.rt);
          if (!platformUid) throw new Error('لازم تنشئ الغرفة من منصة دورك حتى تُخصم التذكرة');
        }
        const name = sanitizeName(payload && payload.name);
        const room = rooms.createRoom(deviceId, name, platformUid);
        room.players.get(deviceId).socketId = socket.id;
        socket.data.roomCode = room.code;
        socket.data.playerId = deviceId;
        socket.join(room.code);
        cb && cb({ ok: true, roomCode: room.code, playerId: deviceId });
        broadcastRoomUpdate(io, room);
        if (global.__DOURK_PLATFORM__ && global.__DOURK_PLATFORM__.analytics) global.__DOURK_PLATFORM__.analytics.track('room_created');
      } catch (err) {
        cb && cb({ error: err.message });
      }
    });

    socket.on('joinRoom', (payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة، حاول بعد قليل' });
      try {
        if (!deviceId) throw new Error('معرّف الجهاز مفقود');
        const code = String((payload && payload.roomCode) || '').replace(/\D/g, '').slice(0, 6);
        const name = sanitizeName(payload && payload.name);
        if (code.length !== 6) throw new Error('أدخل كود الغرفة من 6 أرقام');
        const joinKey = joinAttemptKey(socket, deviceId);
        const status = badJoinStatus(joinKey);
        if (status.blocked) throw new Error(`محاولات كثيرة لكود الغرفة، انتظر ${Math.ceil(status.remainingMs / 1000)} ثانية`);
        const room = rooms.getRoom(code);
        if (!room) {
          recordBadJoin(joinKey);
          throw new Error('الغرفة غير موجودة');
        }
        if (socket.data.roomCode && socket.data.roomCode !== room.code) {
          throw new Error('غادر غرفتك الحالية قبل الانضمام إلى غرفة أخرى');
        }
        clearBadJoin(joinKey);

        const existing = room.players.get(deviceId);
        if (existing) {
          // فصل السوكيت القديم فعليًا لو كان لا يزال متصلًا — بدون هذا، تبويب/اتصال سابق
          // لنفس الجهاز يبقى قادرًا يرسل أفعال (تصويت، قتل ليلي...) بالتوازي مع الاتصال
          // الجديد كنفس اللاعب، لأن socket.data.playerId يبقى صالحًا عليه رغم ما عاد "الحقيقي".
          if (existing.socketId && existing.socketId !== socket.id) {
            const staleSocket = io.sockets.sockets.get(existing.socketId);
            if (staleSocket) staleSocket.disconnect(true);
          }
          existing.connected = true;
          existing.socketId = socket.id;
          if (name) existing.name = name;
          // رجع القائد قبل ما تنتهي مهلة السماح (انظر handleDisconnectOrLeave) — نلغي نقل
          // القيادة المجدول، يبقى هو القائد.
          if (room.hostId === deviceId && room.hostGraceTimer) {
            clearTimeout(room.hostGraceTimer);
            room.hostGraceTimer = null;
          }
        } else {
          const result = rooms.joinRoom(code, deviceId, name, socket.data.platformUserId);
          if (result.error) throw new Error(result.error);
          room.players.get(deviceId).socketId = socket.id;
        }
        socket.data.roomCode = room.code;
        socket.data.playerId = deviceId;
        socket.join(room.code);
        cb && cb({ ok: true, roomCode: room.code, playerId: deviceId });
        broadcastRoomUpdate(io, room);
        resendState(io, room, deviceId);
      } catch (err) {
        cb && cb({ error: err.message });
      }
    });

    socket.on('startGame', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يبدأ اللعبة');
      game.startGame(room);
      for (const p of room.players.values()) sendRole(io, room, p);
      room.revealDone.clear();
      setPhase(io, room, 'reveal', game.REVEAL_MS, () => beginNightFlow(io, room));
      scheduleBotRevealDone(io, room);
      if (global.__DOURK_PLATFORM__ && global.__DOURK_PLATFORM__.analytics) global.__DOURK_PLATFORM__.analytics.track('game_started');
      cb && cb({ ok: true });
    }));

    socket.on('addBots', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يضيف بوتات');
      if (room.phase !== 'lobby') throw new Error('لا يمكن إضافة بوتات بعد بدء اللعبة');
      const count = Math.max(0, Math.min(Number(payload.count) || 0, rooms.MAX_PLAYERS));
      const added = rooms.addBotPlayers(room, count);
      broadcastRoomUpdate(io, room);
      cb && cb({ ok: true, added: added.length });
    }));

    socket.on('removeBots', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يحذف البوتات');
      if (room.phase !== 'lobby') throw new Error('لا يمكن حذف البوتات بعد بدء اللعبة');
      rooms.removeBotPlayers(room);
      broadcastRoomUpdate(io, room);
      cb && cb({ ok: true });
    }));

    // القائد يطرد لاعبًا من اللوبي فقط (قبل بدء اللعبة) — قبل هذا، لاعب مزعج/غير نشط باللوبي
    // ما فيه طريقة لإزالته سوى مغادرته هو بنفسه أو انتظار مهلة هجر الغرفة (20 دقيقة).
    socket.on('kickPlayer', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يقدر يطرد لاعبين');
      if (room.phase !== 'lobby') throw new Error('ما تقدر تطرد لاعب بعد بدء اللعبة');
      const targetId = payload && payload.playerId;
      if (!targetId || targetId === room.hostId) throw new Error('لاعب غير صالح للطرد');
      const target = room.players.get(targetId);
      if (!target) throw new Error('اللاعب غير موجود');
      const targetSocketId = target.socketId;
      room.players.delete(targetId);
      room.lastActivityAt = Date.now();
      if (targetSocketId) {
        io.to(targetSocketId).emit('kicked', {});
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.leave(room.code);
          targetSocket.data.roomCode = null;
          targetSocket.data.playerId = null;
        }
      }
      broadcastRoomUpdate(io, room);
      cb && cb({ ok: true });
    }));

    socket.on('setExpelReveal', inRoom((room, payload, cb) => {
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يغيّر هذا الخيار');
      if (room.phase !== 'lobby') throw new Error('لا يمكن تغيير هذا الخيار بعد بدء اللعبة');
      room.revealTeamOnExpel = !!payload.enabled;
      broadcastRoomUpdate(io, room);
      cb && cb({ ok: true });
    }));

    // مدة التصويت (بالثواني) — يحددها القائد باللوبي. حد أدنى/أقصى معقول يمنع قيمة
    // عبثية (صفر، أو ساعات) تكسر إيقاع اللعبة.
    socket.on('setVoteDuration', inRoom((room, payload, cb) => {
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يغيّر هذا الخيار');
      if (room.phase !== 'lobby') throw new Error('لا يمكن تغيير هذا الخيار بعد بدء اللعبة');
      const seconds = Number(payload.seconds);
      if (!Number.isFinite(seconds) || seconds < 15 || seconds > 180) {
        throw new Error('مدة التصويت لازم تكون بين 15 و180 ثانية');
      }
      room.voteMs = Math.round(seconds) * 1000;
      broadcastRoomUpdate(io, room);
      cb && cb({ ok: true });
    }));

    socket.on('revealDone', inRoom((room) => {
      if (room.phase !== 'reveal') return;
      room.revealDone.add(socket.data.playerId);
      const allDone = rooms.alivePlayers(room).every((p) => room.revealDone.has(p.id));
      if (allDone) beginNightFlow(io, room);
    }));

    socket.on('mafiaPick', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      game.submitMafiaPick(room, socket.data.playerId, payload.targetId);
      const me = room.players.get(socket.data.playerId);
      for (const partner of game.aliveMafias(room)) {
        if (partner.id !== me.id) {
          emitTo(io, partner, 'partnerPick', { name: me.name, targetId: payload.targetId });
        }
      }
      cb && cb({ ok: true });
    }));

    socket.on('confirmKill', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      game.confirmKill(room, socket.data.playerId);
      cb && cb({ ok: true });
      checkNightComplete(io, room);
    }));

    socket.on('doctorProtect', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      game.submitProtect(room, socket.data.playerId, payload.targetId);
      cb && cb({ ok: true });
      checkNightComplete(io, room);
    }));

    socket.on('sheikhCheck', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      const result = game.submitCheck(room, socket.data.playerId, payload.targetId);
      const target = room.players.get(result.targetId);
      cb && cb({ ok: true, targetId: result.targetId, name: target.name, isEvil: result.isEvil });
    }));

    socket.on('thiefSteal', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      game.submitSteal(room, socket.data.playerId, payload.targetId);
      cb && cb({ ok: true });
      checkNightComplete(io, room);
    }));

    socket.on('fighterGuard', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'night') throw new Error('ليست مرحلة الليل');
      game.activateFighterGuard(room, socket.data.playerId);
      cb && cb({ ok: true });
      checkNightComplete(io, room);
    }));

    socket.on('nightReady', inRoom((room) => {
      if (!allow(socket.id)) return;
      if (room.phase !== 'night') return;
      game.markNightReady(room, socket.data.playerId);
      checkNightComplete(io, room);
    }));

    socket.on('deathRevealReady', inRoom((room) => {
      if (room.phase !== 'deathReveal') return;
      room.deathRevealReady.add(socket.data.playerId);
      const allReady = rooms.alivePlayers(room).every((p) => room.deathRevealReady.has(p.id));
      if (allReady) {
        const win = game.winCheck(room);
        clearPhaseTimer(room);
        afterDeathReveal(io, room, win);
      }
    }));

    socket.on('dayReady', inRoom((room) => {
      if (!allow(socket.id)) return;
      if (room.phase !== 'day') return;
      room.dayReady.add(socket.data.playerId);
      const allReady = rooms.alivePlayers(room).every((p) => room.dayReady.has(p.id));
      if (allReady) {
        clearPhaseTimer(room);
        toVoteFlow(io, room);
      }
    }));

    socket.on('voteToggle', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'vote') throw new Error('ليست مرحلة التصويت');
      game.toggleVote(room, socket.data.playerId, payload.targetId !== undefined ? payload.targetId : null);
      cb && cb({ ok: true });
      broadcastVotes(io, room);
    }));

    socket.on('pardonRequest', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'vote') throw new Error('ليست مرحلة التصويت');
      const me = room.players.get(socket.data.playerId);
      if (!me || !me.alive) throw new Error('لا يمكنك المشاركة');
      if (room.pardonRequests.has(me.id)) room.pardonRequests.delete(me.id);
      else { room.pardonRequests.add(me.id); room.executeRequests.delete(me.id); }
      cb && cb({ ok: true });
      broadcastVotes(io, room);
      if (room.pardonRequests.size >= majorityOf(rooms.alivePlayers(room).length)) {
        clearPhaseTimer(room);
        game.logPardon(room, false);
        broadcastLog(io, room);
        nextRound(io, room);
      }
    }));

    socket.on('executeRequest', inRoom((room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'vote') throw new Error('ليست مرحلة التصويت');
      const me = room.players.get(socket.data.playerId);
      if (!me || !me.alive) throw new Error('لا يمكنك المشاركة');
      if (!room.votes.has(me.id)) throw new Error('صوّت أولًا');
      if (room.executeRequests.has(me.id)) room.executeRequests.delete(me.id);
      else { room.executeRequests.add(me.id); room.pardonRequests.delete(me.id); }
      cb && cb({ ok: true });
      broadcastVotes(io, room);
      const vc = game.voteCounts(room);
      if (vc.accused && room.executeRequests.size >= majorityOf(rooms.alivePlayers(room).length)) {
        clearPhaseTimer(room);
        defenseFlow(io, room, vc.accused);
      }
    }));

    socket.on('defenseChoice', inRoom((room, payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ error: 'طلبات كثيرة' });
      if (room.phase !== 'defense') throw new Error('ليست مرحلة الدفاع');
      const me = room.players.get(socket.data.playerId);
      if (!me || !me.alive || me.id === room.accusedId) throw new Error('لا يمكنك المشاركة');
      if (payload.choice === 'execute') { room.defenseExecute.add(me.id); room.defenseChange.delete(me.id); }
      else { room.defenseChange.add(me.id); room.defenseExecute.delete(me.id); }
      cb && cb({ ok: true });
      const jury = rooms.alivePlayers(room).filter((p) => p.id !== room.accusedId).length;
      io.to(room.code).emit('defenseUpdate', { executes: room.defenseExecute.size, changes: room.defenseChange.size, jury });
      if (room.defenseExecute.size >= majorityOf(jury)) {
        expelFlow(io, room, room.accusedId);
      } else if (room.defenseChange.size >= majorityOf(jury)) {
        room.accusedId = null;
        setPhase(io, room, 'vote', room.voteMs || game.VOTE_MS, () => endVoteFlow(io, room));
        broadcastVotes(io, room);
        // كانت منسية هنا (موجودة بالمسار المكافئ للبوتات scheduleBotDefense) — بدونها، لو
        // دفاع بشري (مو بوت) هو اللي رجّع التصويت، البوتات ما تصوّت أبدًا بالتصويت الجديد
        // وتعتمد الجولة كاملة على انتهاء مهلة VOTE_MS بصمت البوتات.
        scheduleBotVotes(io, room);
      }
    }));

    socket.on('newGame', inRoom(async (room, _payload, cb) => {
      if (!allow(socket.id)) throw new Error('طلبات كثيرة');
      if (room.hostId !== socket.data.playerId) throw new Error('القائد فقط يعيد اللعبة');
      if (room.phase !== 'gameover') throw new Error('اللعبة لم تنتهِ بعد');
      // قفل بسيط ضد ضغطة مزدوجة (نقرتين سريعتين قبل ما يرجع الرد الأول): بدونه ممكن تُخصم
      // تذكرتان لعملية وحدة لأن room.phase يبقى 'gameover' لين ينتهي الخصم ويُعاد ضبط الغرفة.
      if (room._newGamePending) throw new Error('طلب إعادة اللعبة قيد التنفيذ بالفعل');
      room._newGamePending = true;
      try {
        // إعادة اللعبة تكلّف تذكرة زي إنشاء غرفة جديدة تمامًا — تُخصم من حساب صاحب الغرفة
        // مباشرة بدون تحويل لصفحة المنصة (نفس الجلسة، نفس الغرفة). deviceId (اللي يحدد
        // room.hostId) أي متصفح يقدر يخترعه، فما نخصم فلوس أحد إلا لو الهوية الحقيقية
        // (من كوكي الجلسة الموقّع) تطابق فعليًا صاحب الغرفة — غير كذا نخليها مجانية بدل
        // ما نخصم من حساب شخص ثاني بالغلط أو ننخدع بادّعاء deviceId مزوّر.
        if (global.__DOURK_PLATFORM__ && room.platformUid && socket.data.platformUserId === room.platformUid) {
          const charged = await global.__DOURK_PLATFORM__.credits.charge(room.platformUid, 'mafia-rematch:' + room.code);
          if (!charged) throw new Error('رصيدك من التذاكر انتهى — ارجع لمنصة دورك لشراء المزيد');
        }
        rooms.resetRoomForNewGame(room);
        broadcastRoomUpdate(io, room);
        cb && cb({ ok: true });
      } finally {
        room._newGamePending = false;
      }
    }));

    // يسمح لصاحب الغرفة (لو أُنشئت عبر المنصة) يشوف رصيده الحالي قبل ما يضغط "لعبة جديدة" —
    // بدون كذا يُفاجأ بالرفض بعد الضغط لأن واجهة مافيا أصلًا ما تعرض تذاكر. نفس شرط الهوية
    // الحقيقية المستخدم بـ newGame: ما نعرض رصيد أي حساب إلا لصاحبه الفعلي المسجّل دخوله.
    socket.on('myCredits', inRoom(async (room, _payload, cb) => {
      if (!allow(socket.id)) return cb && cb({ credits: null });
      const owns = global.__DOURK_PLATFORM__ && room.platformUid && socket.data.platformUserId === room.platformUid;
      if (!owns) { cb && cb({ credits: null }); return; }
      const credits = await global.__DOURK_PLATFORM__.credits.balance(room.platformUid);
      cb && cb({ credits });
    }));

    socket.on('leaveRoom', () => {
      handleDisconnectOrLeave(io, socket, { explicit: true });
    });

    socket.on('disconnect', () => {
      // مباشرة هنا لا داخل handleDisconnectOrLeave — تلك تخرج فورًا لو السوكيت ما انضم لغرفة
      // أصلًا، فيفضل قيد الحد الأقصى (hits) لهذا socket.id بالذاكرة للأبد (كل اتصال جديد له
      // معرّف فريد ما يتكرر، فتكبر الخريطة بلا حدود مع الوقت لأي عملية تشتغل طويلًا).
      allow.cleanup(socket.id);
      handleDisconnectOrLeave(io, socket, { explicit: false });
    });
  });
}

module.exports = { attachSocketHandlers };
