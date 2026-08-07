const MIN_PLAYERS = require('./roles').MIN_PLAYERS;
const MAX_PLAYERS = require('./roles').MAX_PLAYERS;

const ABANDONED_ROOM_MS = 20 * 60 * 1000;
// لو صاحب الغرفة انقطع فجأة (إغلاق تبويب، تحطم) وباقي اللاعبين متصلين، ما فيه أي تحويل
// قيادة تلقائي إلا عند مغادرة صريحة — فتفضل الغرفة عالقة للأبد (ما أحد يقدر يبدأ لعبة
// جديدة، وsweepAbandonedRooms ما يمسحها لأنه فيه لاعبين متصلين). هذي مهلة سماح قبل ما ننقل
// القيادة تلقائيًا لأول لاعب متصل غيره.
const HOST_DISCONNECT_GRACE_MS = 45 * 1000;
const CODE_CHARS = '0123456789';

const rooms = new Map();

const BOT_NAMES = ['نورة', 'ريم', 'ماجد', 'سارة', 'خالد', 'لولوة', 'فهد', 'منال', 'عبدالله', 'هدى', 'تركي', 'جواهر'];

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function freshGameState() {
  return {
    phase: 'lobby',
    round: 1,
    deadlineTs: null,
    phaseTimer: null,

    flavors: new Map(),
    revealDone: new Set(),

    mafiaPicks: new Map(),
    killConfirmed: false,
    pendingKillId: null,
    mafiaLastTargetId: null,
    doctorPickId: null,
    doctorLastPickId: null,
    sheikhCheckId: null,
    thiefPickId: null,
    nightDone: new Set(),

    sheikhNotebooks: new Map(),
    stolenVoterId: null,
    curseNight: false,
    curseNextNight: false,
    shiftTwist: false,
    fighterUsed: false,
    thiefUsed: false,
    fighterGuardActive: false,
    jokerEliminated: false,

    lastKilledId: null,
    savedId: null,
    dayReady: new Set(),
    deathRevealReady: new Set(),

    votes: new Map(),
    pardonRequests: new Set(),
    executeRequests: new Set(),
    accusedId: null,
    defenseExecute: new Set(),
    defenseChange: new Set(),
    expelStampId: null,
    expelInProgress: false,

    log: [],
    winner: null,
    winReason: '',
    gameOverResult: null,
  };
}

function createRoom(hostId, hostName, platformUid) {
  const code = generateCode();
  const room = Object.assign({
    code,
    hostId,
    // معرّف حساب منصة دورك لصاحب الغرفة (لو الغرفة اتنشأت عبر المنصة) — نحتاجه عشان
    // نخصم تذكرة كل مرة يُعاد فيها اللعب بنفس الغرفة، بدون ما نطلب رمز تذكرة جديد.
    platformUid: platformUid || null,
    players: new Map(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    revealTeamOnExpel: false,
    // مدة التصويت بالمللي ثانية — يحددها القائد باللوبي قبل بدء اللعبة (null = افتراضي الخادم).
    voteMs: null,
    hostGraceTimer: null,
  }, freshGameState());
  room.players.set(hostId, makePlayer(hostId, hostName, platformUid));
  rooms.set(code, room);
  if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.register(code, 'mafia');
  return room;
}

function resetRoomForNewGame(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  Object.assign(room, freshGameState());
  for (const p of room.players.values()) {
    p.alive = true;
    p.roleId = null;
    p.spectator = false;
    p.deathTitle = null;
    p.deathReason = null;
  }
}

function makePlayer(id, name, platformUid) {
  return {
    id,
    name,
    socketId: null,
    connected: true,
    alive: true,
    roleId: null,
    spectator: false,
    deathTitle: null,
    deathReason: null,
    isBot: false,
    // حساب منصة دورك لهذا اللاعب تحديدًا (لو مسجّل دخول) — يُستخدم فقط لتسجيل إحصائياته
    // الشخصية عند انتهاء اللعبة. الضيوف بدون حساب ببساطة قيمتها null فتُستثنى من التسجيل.
    platformUid: platformUid || null,
  };
}

function addBotPlayers(room, count) {
  const used = new Set([...room.players.values()].map((p) => p.name));
  const available = BOT_NAMES.filter((n) => !used.has(n));
  const room_max = MAX_PLAYERS - room.players.size;
  const n = Math.max(0, Math.min(count, available.length, room_max));
  const added = [];
  for (let i = 0; i < n; i++) {
    const id = 'bot-' + Math.random().toString(36).slice(2, 9);
    const player = makePlayer(id, available[i]);
    player.isBot = true;
    room.players.set(id, player);
    added.push(id);
  }
  room.lastActivityAt = Date.now();
  return added;
}

function removeBotPlayers(room) {
  for (const [id, p] of room.players) {
    if (p.isBot) room.players.delete(id);
  }
  room.lastActivityAt = Date.now();
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function joinRoom(code, playerId, name, platformUid) {
  const room = getRoom(code);
  if (!room) return { error: 'الغرفة غير موجودة' };
  if (room.phase !== 'lobby') return { error: 'الجولة بدأت بالفعل' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'الغرفة ممتلئة' };
  room.players.set(playerId, makePlayer(playerId, name, platformUid));
  room.lastActivityAt = Date.now();
  return { room };
}

function leaveRoom(room, playerId) {
  room.players.delete(playerId);
  if (room.hostId === playerId) {
    // نفضّل أول لاعب متصل فعليًا (نفس تصفية migrateHostToConnectedPlayer) — لو اخترنا أول
    // عنصر بالـMap بلا تصفية، ممكن نعطي الاستضافة للاعب منقطع الاتصال فعلًا (رقم إدراجه
    // بالـMap أسبق)، فتفضل الغرفة عالقة برضو (ما أحد يقدر يبدأ لعبة) لحد ما تنتهي مهلة الهجر.
    const next = [...room.players.values()].find((p) => p.connected);
    room.hostId = next ? next.id : null;
    // القائد الجديد ما مرّ بخصم تذكرة أبدًا (الانضمام مجاني ومجهول)، فما فيه طريقة نعرف
    // حسابه بالمنصة. نفضّل نخلي "لعبة جديدة" مجانية له بدل خصمها غلط من حساب القائد اللي غادر.
    room.platformUid = null;
  }
  room.lastActivityAt = Date.now();
  if (room.players.size === 0) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    rooms.delete(room.code);
    if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.unregister(room.code);
  }
}

// ينقل القيادة لأول لاعب متصل غير القائد الحالي، بدون ما يشيله من الغرفة (بعكس leaveRoom) —
// يُستخدم لما القائد يبقى منقطعًا لفترة طويلة (انظر HOST_DISCONNECT_GRACE_MS) بدل ما تفضل
// الغرفة عالقة للأبد. يرجع true لو صار فيه نقل فعلي.
function migrateHostToConnectedPlayer(room) {
  const current = room.players.get(room.hostId);
  if (current && current.connected) return false;
  const next = [...room.players.values()].find((p) => p.connected && p.id !== room.hostId);
  if (!next) return false;
  room.hostId = next.id;
  room.platformUid = null;
  return true;
}

function alivePlayers(room) {
  return [...room.players.values()].filter((p) => p.alive);
}

function sweepAbandonedRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyConnected && now - room.lastActivityAt > ABANDONED_ROOM_MS) {
      if (room.phaseTimer) clearTimeout(room.phaseTimer);
      rooms.delete(code);
      if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.unregister(code);
    }
  }
}

function serializeRoom(room, defaultVoteMs) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    deadlineTs: room.deadlineTs,
    revealTeamOnExpel: room.revealTeamOnExpel,
    voteMs: room.voteMs || defaultVoteMs || null,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      alive: p.alive,
      isBot: p.isBot,
    })),
  };
}

// نحتفظ بكل الغرف عند إعادة التشغيل، لكن أي لعبة جارية ترجع إلى اللوبي مع نفس اللاعبين والكود.
// استئناف مرحلة ليلية بنصف أحداثها قد يفسد النتيجة، أما الرجوع للوبي فيحفظ المجموعة ويمنحهم بداية واضحة.
function snapshotLobbies() {
  return [...rooms.values()]
    .map((room) => ({
      code: room.code,
      hostId: room.hostId,
      platformUid: room.platformUid,
      createdAt: room.createdAt,
      revealTeamOnExpel: room.revealTeamOnExpel,
      voteMs: room.voteMs,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        isBot: !!player.isBot,
        platformUid: player.platformUid || null,
      })),
    }));
}

function restoreLobbies(snapshot) {
  if (!Array.isArray(snapshot)) return 0;
  let restored = 0;
  for (const raw of snapshot) {
    if (!raw || !/^\d{6}$/.test(String(raw.code || '')) || rooms.has(String(raw.code))) continue;
    const room = Object.assign({
      code: String(raw.code),
      hostId: raw.hostId || null,
      platformUid: raw.platformUid || null,
      players: new Map(),
      createdAt: raw.createdAt || Date.now(),
      lastActivityAt: Date.now(),
      revealTeamOnExpel: !!raw.revealTeamOnExpel,
      voteMs: raw.voteMs || null,
    }, freshGameState());
    for (const source of raw.players || []) {
      if (!source || !source.id) continue;
      const player = makePlayer(source.id, source.name, source.platformUid);
      player.isBot = !!source.isBot;
      player.connected = false;
      room.players.set(player.id, player);
    }
    if (!room.players.size || !room.hostId || !room.players.has(room.hostId)) continue;
    rooms.set(room.code, room);
    if (global.__DOURK_PLATFORM__) global.__DOURK_PLATFORM__.rooms.register(room.code, 'mafia');
    restored += 1;
  }
  return restored;
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  HOST_DISCONNECT_GRACE_MS,
  rooms,
  createRoom,
  resetRoomForNewGame,
  getRoom,
  joinRoom,
  leaveRoom,
  migrateHostToConnectedPlayer,
  alivePlayers,
  sweepAbandonedRooms,
  serializeRoom,
  addBotPlayers,
  removeBotPlayers,
  snapshotLobbies,
  restoreLobbies,
};
