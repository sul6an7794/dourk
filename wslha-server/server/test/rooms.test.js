const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي.
const TEST_DATA_PATH = path.join(__dirname, '.tmp-rooms-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.WSL_DATA_PATH = TEST_DATA_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

const db = require('../src/db');
const rooms = require('../src/rooms');

function makeMockIo() {
  const emitted = [];
  return {
    to(target) {
      return { emit(event, payload) { emitted.push({ target, event, payload }); } };
    },
    emitted,
  };
}
function makeMockSocket(id, deviceId) {
  return { id, data: { deviceId: deviceId || null }, join() {} };
}

test.before(async () => {
  await db.init();
  const round = await db.insertRound({ hint: 'اختبار', answers: ['كلب', 'قطة'], category: '' });
  await db.insertRoundImage(round.id, { filename: 'a.jpg', url: 'https://example.com/a.jpg' });
  await db.insertRoundImage(round.id, { filename: 'b.jpg', url: 'https://example.com/b.jpg' });
  await db.insertRoundImage(round.id, { filename: 'c.jpg', url: 'https://example.com/c.jpg' });
});
test.after(() => { try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {} });

function setupFullTeam(prefix) {
  const io = makeMockIo();
  const cap = makeMockSocket(prefix + '-cap', prefix + '-dev-cap');
  const room = rooms.createRoom(io, cap, { maxPlayers: 3 });
  const capRes = rooms.chooseTeam(io, cap, { roomCode: room.code, teamIndex: 0, teamName: 'ف', name: 'قائد' });
  const m1 = makeMockSocket(prefix + '-m1', prefix + '-dev-m1');
  rooms.chooseTeam(io, m1, { roomCode: room.code, teamIndex: 0, name: 'عضو1' });
  const m2 = makeMockSocket(prefix + '-m2', prefix + '-dev-m2');
  const m2Res = rooms.chooseTeam(io, m2, { roomCode: room.code, teamIndex: 0, name: 'عضو2' });
  return { io, room, cap, m1, m2, capRes, m2Res };
}

test('chooseTeam: أول لاعب يصير قائدًا، والفريق يمتلئ عند 3 لاعبين', () => {
  const { room } = setupFullTeam('t1');
  const team = room.teams[0];
  assert.equal(team.players.length, 3);
  assert.equal(team.players[0].isCaptain, true);
  assert.equal(team.players[1].isCaptain, false);
});

test('chooseTeam: الفريق يرفض عضوًا رابعًا لو مكتمل', () => {
  const { io, room } = setupFullTeam('t2');
  const extra = makeMockSocket('t2-extra', 't2-dev-extra');
  const res = rooms.chooseTeam(io, extra, { roomCode: room.code, teamIndex: 0, name: 'زائد' });
  assert.equal(res.error, 'الفريق مكتمل');
});

test('chooseTeam: اللاعب لا يشغل مقعدين في فريقين مختلفين', () => {
  const io = makeMockIo();
  const player = makeMockSocket('multi-seat', 'multi-seat-device');
  const room = rooms.createRoom(io, player, { maxPlayers: 6 });
  const first = rooms.chooseTeam(io, player, { roomCode: room.code, teamIndex: 0, teamName: 'الأول', name: 'لاعب' });
  assert.equal(first.ok, true);
  const second = rooms.chooseTeam(io, player, { roomCode: room.code, teamIndex: 1, teamName: 'الثاني', name: 'لاعب' });
  assert.match(second.error, /غادر فريقك الحالي/);
  assert.equal(room.teams[1].players.length, 0);
});

test('انقطاع اتصال قبل بدء اللعبة: اللاعب يبقى محجوزًا (غير محذوف) بعلامة غير متصل', () => {
  const { io, room, m1 } = setupFullTeam('t3');
  rooms.leave(io, m1);
  const team = room.teams[0];
  assert.equal(team.players.length, 3, 'اللاعب المنقطع يبقى بالمصفوفة');
  const disconnected = team.players.find((p) => p.name === 'عضو1');
  assert.equal(disconnected.connected, false);
});

test('انقطاع اتصال أثناء اللعبة: اللاعب يبقى لاستعادة مكانه وتنتقل القيادة لعضو متصل', () => {
  const { io, room, cap, m1 } = setupFullTeam('t3-live');
  assert.equal(rooms.startGame(io, cap).ok, true);
  rooms.leave(io, cap);
  const team = room.teams[0];
  assert.equal(team.players.length, 3);
  assert.equal(team.players.find((p) => p.name === 'قائد').connected, false);
  assert.equal(team.players.find((p) => p.socketId === m1.id).isCaptain, true);
});

test('استرجاع المكان: عضو منقطع يرجع بنفس مكانه عبر نفس deviceId', () => {
  const { io, room, m1 } = setupFullTeam('t4');
  rooms.leave(io, m1);
  const m1Again = makeMockSocket('t4-m1-new-socket', 't4-dev-m1');
  const res = rooms.chooseTeam(io, m1Again, { roomCode: room.code, teamIndex: 0, name: 'عضو1' });
  assert.equal(res.ok, true);
  assert.equal(res.reclaimed, true);
  const team = room.teams[0];
  assert.equal(team.players.length, 3, 'ما ينضاف كلاعب جديد، يرجع لنفس المكان');
  const reclaimed = team.players.find((p) => p.name === 'عضو1');
  assert.equal(reclaimed.connected, true);
  assert.equal(reclaimed.socketId, 't4-m1-new-socket');
});

test('kickPlayer: القائد يقدر يطرد عضوًا قبل بدء اللعبة، ويتحرر مكانه فعليًا', () => {
  const { io, room, cap, m2Res } = setupFullTeam('t5');
  const targetId = m2Res.teams[0].players.find((p) => p.name === 'عضو2').id;
  const res = rooms.kickPlayer(io, cap, { playerId: targetId });
  assert.equal(res.ok, true);
  const team = room.teams[0];
  assert.equal(team.players.length, 2);
  assert.equal(team.players.some((p) => p.name === 'عضو2'), false);
});

test('kickPlayer: غير القائد ما يقدر يطرد', () => {
  const { io, room, m1, m2Res } = setupFullTeam('t6');
  const targetId = m2Res.teams[0].players.find((p) => p.name === 'عضو2').id;
  const res = rooms.kickPlayer(io, m1, { playerId: targetId });
  assert.match(res.error, /القائد فقط/);
});

test('kickPlayer: القائد ما يقدر يطرد نفسه', () => {
  const { io, cap, capRes } = setupFullTeam('t7');
  const capId = capRes.teams[0].players.find((p) => p.isCaptain).id;
  const res = rooms.kickPlayer(io, cap, { playerId: capId });
  assert.match(res.error, /تطرد نفسك/);
});

test('kickPlayer: يُرفض بعد بدء اللعبة', () => {
  const { io, room, cap, m2Res } = setupFullTeam('t8');
  rooms.startGame(io, cap);
  const targetId = m2Res.teams[0].players.find((p) => p.name === 'عضو2').id;
  const res = rooms.kickPlayer(io, cap, { playerId: targetId });
  assert.match(res.error, /بعد بدء اللعبة/);
});

test('kickPlayer: جهاز مطرود يُرفض تلقائيًا لو حاول رجوع resume، بس يقدر ينضم يدويًا من جديد', () => {
  const { io, room, cap, m2Res } = setupFullTeam('t9');
  const targetId = m2Res.teams[0].players.find((p) => p.name === 'عضو2').id;
  rooms.kickPlayer(io, cap, { playerId: targetId });

  // محاولة رجوع تلقائي (نفس deviceId، بسوكيت جديد بعد تحديث الصفحة) — لازم تُرفض بصمت.
  const resumeSocket = makeMockSocket('t9-m2-new-socket', 't9-dev-m2');
  const resumeRes = rooms.chooseTeam(io, resumeSocket, { roomCode: room.code, teamIndex: 0, name: 'عضو2', resume: true });
  assert.equal(resumeRes.error, 'kicked');
  assert.equal(room.teams[0].players.length, 2);

  // نفس الجهاز يضغط يدويًا على الفريق من جديد (بدون علم resume) — لازم يُسمح له ينضم عادي.
  const manualRes = rooms.chooseTeam(io, resumeSocket, { roomCode: room.code, teamIndex: 0, name: 'عضو2' });
  assert.equal(manualRes.ok, true);
  assert.equal(room.teams[0].players.length, 3);
});

test('submitAnswer: يقبل الإجابة الصحيحة الكاملة (مطابقة تامة)', () => {
  const { io, room, cap } = setupFullTeam('t9');
  rooms.startGame(io, cap);
  const res = rooms.submitAnswer(io, cap, 'كلب');
  assert.equal(res.correct, true);
});

test('submitAnswer: يرفض إجابة قصيرة جدًا (حرف أو حرفين) حتى لو كانت جزء من الإجابة الصحيحة', () => {
  const { io, room, cap } = setupFullTeam('t10');
  rooms.startGame(io, cap);
  const res = rooms.submitAnswer(io, cap, 'ك');
  assert.equal(res.correct, false);
});

test('submitAnswer: يرفض إجابة جزئية أقل من 80% من طول الكلمة الصحيحة', () => {
  const { io, room, cap } = setupFullTeam('t11');
  rooms.startGame(io, cap);
  // "قط" طولها 2 من "قطة" (طول 3) = 66% تقريبًا، أقل من 80%
  const res = rooms.submitAnswer(io, cap, 'قط');
  assert.equal(res.correct, false);
});

test('submitAnswer: القائد فقط يقدر يرسل الإجابة', () => {
  const { io, room, cap, m1 } = setupFullTeam('t12');
  rooms.startGame(io, cap);
  const res = rooms.submitAnswer(io, m1, 'كلب');
  assert.match(res.error, /القائد فقط/);
});

test('startGame: القائد فقط يقدر يبدأ الجولة', () => {
  const { io, cap, m1 } = setupFullTeam('t13');
  const denied = rooms.startGame(io, m1);
  assert.match(denied.error, /القائد فقط/);
  assert.equal(rooms.startGame(io, cap).ok, true);
});
