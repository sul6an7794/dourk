process.env.MAFIA_REVEAL_MS = '3000';
process.env.MAFIA_NIGHT_MS = '600';
process.env.MAFIA_DEATH_REVEAL_MS = '200';
process.env.MAFIA_DAY_MS = '250';
process.env.MAFIA_VOTE_MS = '400';
process.env.MAFIA_DEFENSE_MS = '300';
// لازم أقصر من أقصر مهلة مرحلة فوق (DEATH_REVEAL_MS=200) — بدونها كان تأخير البوت
// الافتراضي (حتى 1800ms) يفوّت مهل المراحل المضغوطة هذي، فتتكرر جولات فاضية بلا
// حسم وتُفلّت اللعبة أحيانًا فوق مهلة الاختبار الخارجية (20-25 ثانية) بلا أي سبب حقيقي.
process.env.MAFIA_BOT_DELAY_MIN = '5';
process.env.MAFIA_BOT_DELAY_MAX = '40';

const test = require('node:test');
const assert = require('node:assert');
const { io: ioClient } = require('socket.io-client');
const { startServer } = require('../src/server');
const roomsMod = require('../src/rooms');

setTimeout(() => {
  console.error('FORCE EXIT: العملية علقت بعد المهلة الأمنية');
  process.exit(1);
}, 45000).unref();

function clearAllRooms() {
  for (const [code, room] of roomsMod.rooms) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    roomsMod.rooms.delete(code);
  }
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test('جولة كاملة عبر Socket.io حتى نهاية اللعبة بقواعد Playable v3', async () => {
  const server = startServer(0);
  let clients = [];
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;

    const COUNT = 6;
    clients = Array.from({ length: COUNT }, (_, i) => {
      const c = {
        id: `p${i}`,
        socket: ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: `p${i}` } }),
        role: null,
        players: [],
        votedRound: 0,
        round: 1,
      };
      return c;
    });

    await Promise.all(clients.map((c) => waitFor(c.socket, 'connect')));

    clients.forEach((c) => {
      c.socket.on('roleAssigned', ({ role }) => { c.role = role; });
      c.socket.on('nightRole', ({ night, targets, round }) => {
        c.round = round;
        if (night === 'kill' && targets[0]) {
          c.socket.emit('mafiaPick', { targetId: targets[0].id }, () => {
            c.socket.emit('confirmKill', {}, () => {});
          });
        } else if (night === 'protect') {
          c.socket.emit('doctorProtect', { targetId: c.id }, () => {});
        } else if (night === 'check' && targets[0]) {
          c.socket.emit('sheikhCheck', { targetId: targets[0].id }, () => {
            c.socket.emit('nightReady');
          });
        } else if (night === 'steal' && targets[0]) {
          c.socket.emit('thiefSteal', { targetId: targets[0].id }, () => {});
        } else if (night === 'decoy') {
          c.socket.emit('nightReady');
        }
      });
      c.socket.on('roomUpdate', (state) => {
        c.players = state.players;
        const me = state.players.find((p) => p.id === c.id);
        const alive = me && me.alive;
        if (state.phase === 'reveal') c.socket.emit('revealDone');
        if (state.phase === 'deathReveal' && alive) c.socket.emit('deathRevealReady');
        if (state.phase === 'day' && alive) c.socket.emit('dayReady');
        if (state.phase === 'vote' && alive && c.votedRound !== state.round) {
          c.votedRound = state.round;
          const target = state.players.find((p) => p.alive && p.id !== c.id);
          if (target) c.socket.emit('voteToggle', { targetId: target.id }, () => {});
        }
      });
    });

    const gameOverPromise = waitFor(clients[0].socket, 'gameOver');

    const createResult = await emitAck(clients[0].socket, 'createRoom', { name: 'القائد' });
    assert.ok(createResult.ok, createResult.error);
    for (let i = 1; i < COUNT; i++) {
      const res = await emitAck(clients[i].socket, 'joinRoom', { roomCode: createResult.roomCode, name: `لاعب${i}` });
      assert.ok(res.ok, res.error);
    }

    const startResult = await emitAck(clients[0].socket, 'startGame', {});
    assert.ok(startResult.ok, startResult.error);

    const result = await Promise.race([
      gameOverPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت المهلة قبل نهاية اللعبة')), 20000)),
    ]);

    assert.ok(['mafia', 'town'].includes(result.winner));
    assert.ok(result.winReason.length > 0);
    assert.ok(result.round >= 1);
    assert.ok(Array.isArray(result.winnerCards) && result.winnerCards.length > 0);
    assert.strictEqual(result.roles.length, COUNT);
  } finally {
    clients.forEach((c) => c.socket.close());
    clearAllRooms();
    server.io.close();
    server.close();
    server.unref();
  }
});

test('القائد + بوتات فقط: اللعبة تكتمل آليًا حتى النهاية دون أي إجراء من اللاعبين الآخرين', async () => {
  const server = startServer(0);
  let clients = [];
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;

    const host = { socket: ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: 'host1' } }) };
    clients = [host.socket];
    await waitFor(host.socket, 'connect');

    const createResult = await emitAck(host.socket, 'createRoom', { name: 'القائد' });
    assert.ok(createResult.ok, createResult.error);

    const addBotsResult = await emitAck(host.socket, 'addBots', { count: 5 });
    assert.ok(addBotsResult.ok, addBotsResult.error);
    assert.strictEqual(addBotsResult.added, 5);

    host.socket.on('roomUpdate', (state) => {
      if (state.phase === 'reveal') host.socket.emit('revealDone');
    });

    const gameOverPromise = waitFor(host.socket, 'gameOver');

    const startResult = await emitAck(host.socket, 'startGame', {});
    assert.ok(startResult.ok, startResult.error);

    const result = await Promise.race([
      gameOverPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت المهلة قبل نهاية اللعبة')), 25000)),
    ]);

    assert.ok(['mafia', 'town'].includes(result.winner));
    assert.strictEqual(result.roles.length, 6);
  } finally {
    clients.forEach((c) => c.close());
    clearAllRooms();
    server.io.close();
    server.close();
    server.unref();
  }
});

test('إعادة الاتصال أثناء الجولة تعيد الدور والمرحلة والدفتر للاعب العائد', async () => {
  const server = startServer(0);
  let sockets = [];
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;

    sockets = Array.from({ length: 6 }, (_, i) => ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: `r${i}` } }));
    await Promise.all(sockets.map((s) => waitFor(s, 'connect')));

    const createResult = await emitAck(sockets[0], 'createRoom', { name: 'القائد' });
    assert.ok(createResult.ok, createResult.error);
    for (let i = 1; i < 6; i++) {
      const res = await emitAck(sockets[i], 'joinRoom', { roomCode: createResult.roomCode, name: `لاعب${i}` });
      assert.ok(res.ok, res.error);
    }

    const firstRolePromise = waitFor(sockets[5], 'roleAssigned');
    const startResult = await emitAck(sockets[0], 'startGame', {});
    assert.ok(startResult.ok, startResult.error);
    const firstRole = await firstRolePromise;

    sockets[5].close();
    const rejoined = ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: 'r5' } });
    sockets.push(rejoined);
    await waitFor(rejoined, 'connect');

    const roleAgainPromise = waitFor(rejoined, 'roleAssigned');
    const rejoinAck = await emitAck(rejoined, 'joinRoom', { roomCode: createResult.roomCode, name: 'لاعب5' });
    assert.ok(rejoinAck.ok, rejoinAck.error);

    const roleAgain = await Promise.race([
      roleAgainPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('لم يصل الدور بعد إعادة الاتصال')), 3000)),
    ]);

    assert.strictEqual(roleAgain.role.id, firstRole.role.id);
    assert.ok(roleAgain.card.endsWith('.png'));
    assert.ok(Array.isArray(roleAgain.presentCards) && roleAgain.presentCards.length > 0);
  } finally {
    sockets.forEach((s) => s.close());
    clearAllRooms();
    server.io.close();
    server.close();
    server.unref();
  }
});
