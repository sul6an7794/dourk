const test = require('node:test');
const assert = require('node:assert');
const rooms = require('../src/rooms');
const game = require('../src/game');

test('مغادرة آخر لاعب تحذف الغرفة نهائيًا', () => {
  const room = rooms.createRoom('host1', 'القائد');
  const code = room.code;
  assert.ok(rooms.getRoom(code));

  rooms.leaveRoom(room, 'host1');

  assert.strictEqual(rooms.getRoom(code), null);
});

test('مغادرة القائد تنقل القيادة للاعب التالي دون حذف الغرفة', () => {
  const room = rooms.createRoom('host1', 'القائد');
  rooms.joinRoom(room.code, 'p2', 'لاعب٢');

  rooms.leaveRoom(room, 'host1');

  assert.strictEqual(rooms.getRoom(room.code), room);
  assert.strictEqual(room.hostId, 'p2');
});

test('مغادرة القائد صراحةً تتجاوز لاعبًا منقطعًا وتختار أول لاعب متصل فعليًا', () => {
  const room = rooms.createRoom('host1', 'القائد');
  rooms.joinRoom(room.code, 'p2-disconnected', 'لاعب منقطع');
  rooms.joinRoom(room.code, 'p3-connected', 'لاعب متصل');
  // p2 انضم أولًا (أسبق بالـMap) لكنه منقطع فعليًا — القيادة يجب تروح لـp3 لا p2،
  // وإلا تفضل الغرفة عالقة (ما أحد يقدر يبدأ لعبة) لحد ما ينتهي وقت الهجر.
  room.players.get('p2-disconnected').connected = false;

  rooms.leaveRoom(room, 'host1');

  assert.strictEqual(room.hostId, 'p3-connected');
});

test('migrateHostToConnectedPlayer: ما يسوي شي لو القائد لسا متصل', () => {
  const room = rooms.createRoom('host1', 'القائد');
  rooms.joinRoom(room.code, 'p2', 'لاعب٢');
  const migrated = rooms.migrateHostToConnectedPlayer(room);
  assert.strictEqual(migrated, false);
  assert.strictEqual(room.hostId, 'host1');
});

test('migrateHostToConnectedPlayer: ينقل القيادة لأول لاعب متصل لو القائد منقطع (بدون ما يشيله من الغرفة)', () => {
  const room = rooms.createRoom('host1', 'القائد');
  rooms.joinRoom(room.code, 'p2', 'لاعب٢');
  rooms.joinRoom(room.code, 'p3', 'لاعب٣');
  room.players.get('host1').connected = false;

  const migrated = rooms.migrateHostToConnectedPlayer(room);

  assert.strictEqual(migrated, true);
  assert.strictEqual(room.hostId, 'p2');
  // القائد القديم يبقى بالغرفة (منقطع فقط) — بعكس leaveRoom اللي يشيله كليًا.
  assert.strictEqual(room.players.has('host1'), true);
});

test('migrateHostToConnectedPlayer: ما يسوي شي لو ما فيه أي لاعب ثاني متصل (كل اللاعبين منقطعين)', () => {
  const room = rooms.createRoom('host1', 'القائد');
  rooms.joinRoom(room.code, 'p2', 'لاعب٢');
  room.players.get('host1').connected = false;
  room.players.get('p2').connected = false;

  const migrated = rooms.migrateHostToConnectedPlayer(room);

  assert.strictEqual(migrated, false);
  assert.strictEqual(room.hostId, 'host1');
});

test('لعبة جديدة تعيد الغرفة للوبي وتصفّر كل حالة الجولة مع بقاء اللاعبين', () => {
  const room = rooms.createRoom('h', 'القائد');
  for (const id of ['a', 'b', 'c', 'd', 'e']) rooms.joinRoom(room.code, id, id);
  game.startGame(room);
  room.players.get('a').alive = false;
  game.addLog(room, 'حدث', '#FFF');
  game.finishGame(room, 'town', 'سبب');

  rooms.resetRoomForNewGame(room);

  assert.strictEqual(room.phase, 'lobby');
  assert.strictEqual(room.players.size, 6);
  assert.strictEqual(room.players.get('a').alive, true);
  assert.strictEqual(room.players.get('a').roleId, null);
  assert.strictEqual(room.log.length, 0);
  assert.strictEqual(room.gameOverResult, null);
});

test('خيار الإعلان عن الفريق عند الإقصاء يُعطّل افتراضيًا ويبقى اختياره بعد لعبة جديدة', () => {
  const room = rooms.createRoom('h', 'القائد');
  assert.strictEqual(room.revealTeamOnExpel, false);
  assert.strictEqual(rooms.serializeRoom(room).revealTeamOnExpel, false);

  room.revealTeamOnExpel = true;
  rooms.resetRoomForNewGame(room);
  assert.strictEqual(room.revealTeamOnExpel, true);
});

test('إضافة وحذف البوتات يظهر في serializeRoom بحقل isBot', () => {
  const room = rooms.createRoom('h', 'القائد');
  const added = rooms.addBotPlayers(room, 3);
  assert.strictEqual(added.length, 3);
  assert.strictEqual(room.players.size, 4);
  const serialized = rooms.serializeRoom(room);
  assert.strictEqual(serialized.players.filter((p) => p.isBot).length, 3);

  rooms.removeBotPlayers(room);
  assert.strictEqual(room.players.size, 1);
});

test('إعادة تشغيل الخادم تحفظ غرفة جارية وتعيدها للوبي بنفس الكود واللاعبين', () => {
  const room = rooms.createRoom('restart-host', 'القائد');
  for (const id of ['restart-a', 'restart-b', 'restart-c', 'restart-d', 'restart-e']) rooms.joinRoom(room.code, id, id);
  game.startGame(room);
  const snapshot = rooms.snapshotLobbies();
  rooms.rooms.delete(room.code);

  assert.strictEqual(rooms.restoreLobbies(snapshot), 1);
  const restored = rooms.getRoom(room.code);
  assert.ok(restored);
  assert.strictEqual(restored.phase, 'lobby');
  assert.strictEqual(restored.players.size, 6);
  rooms.rooms.delete(room.code);
});
