const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات هذا الملف عن باقي ملفات الاختبار — نحتاج ترتيب/عدد جولات معروف بالضبط
// عشان نفحص منطق "أول تذكرة = جولات ثابتة، باقي التذاكر = عشوائي من الباقي" بدقة.
const TEST_DATA_PATH = path.join(__dirname, '.tmp-rounds-session-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.WSL_DATA_PATH = TEST_DATA_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.WSLHA_ROUNDS_PER_SESSION = '5'; // عدد صغير يسهّل الفحص بدل الافتراضي 15

const db = require('../src/db');
const rooms = require('../src/rooms');

function makeMockIo() {
  return { to() { return { emit() {} }; } };
}
function makeMockSocket(id) {
  return { id, data: {}, join() {} };
}

const TOTAL_ROUNDS = 20; // أكبر من WSLHA_ROUNDS_PER_SESSION (5) بوضوح — يفصل "أول 5" عن "الباقي"

test.before(async () => {
  await db.init();
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const round = await db.insertRound({ hint: 'ت' + i, answers: ['اجابة' + i], category: '' });
    await db.insertRoundImage(round.id, { filename: 'a' + i + '.jpg', url: 'https://example.com/a' + i + '.jpg' });
    await db.insertRoundImage(round.id, { filename: 'b' + i + '.jpg', url: 'https://example.com/b' + i + '.jpg' });
    await db.insertRoundImage(round.id, { filename: 'c' + i + '.jpg', url: 'https://example.com/c' + i + '.jpg' });
  }
});
test.after(() => { try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {} });

test('isFirstGame=true: يرجع أول 5 جولات بالضبط بترتيب المخزون (ثابتة، غير عشوائية)', () => {
  const io = makeMockIo();
  const socket = makeMockSocket('first-game-socket');
  const room = rooms.createRoom(io, socket, { maxPlayers: 3, isFirstGame: true });
  assert.equal(room.rounds.length, 5);
  const allRounds = db.getRounds();
  const expectedFirstFive = allRounds.slice(0, 5).map((r) => r.id);
  assert.deepEqual(room.rounds.map((r) => r.id), expectedFirstFive);
});

test('isFirstGame=false: يرجع 5 جولات من غير الجولات الخمس التعريفية الأولى فقط', () => {
  const io = makeMockIo();
  const socket = makeMockSocket('second-game-socket');
  const room = rooms.createRoom(io, socket, { maxPlayers: 3, isFirstGame: false });
  assert.equal(room.rounds.length, 5);
  const allRounds = db.getRounds();
  const introRoundIds = new Set(allRounds.slice(0, 5).map((r) => r.id));
  for (const r of room.rounds) {
    assert.ok(!introRoundIds.has(r.id), `جولة تعريفية (${r.id}) ظهرت لتذكرة مو أول مرة`);
  }
});

test('isFirstGame=false مرتين متتاليتين: التوزيع عشوائي (مو نفس الترتيب دايمًا)', () => {
  const io = makeMockIo();
  const results = [];
  for (let i = 0; i < 8; i++) {
    const socket = makeMockSocket('rand-check-' + i);
    const room = rooms.createRoom(io, socket, { maxPlayers: 3, isFirstGame: false });
    results.push(room.rounds.map((r) => r.id).join(','));
  }
  const uniqueOrders = new Set(results);
  assert.ok(uniqueOrders.size > 1, 'توقعنا اختلاف بترتيب/محتوى العيّنة عبر عدة تذاكر متتالية، طلعت كلها متطابقة');
});

test('isFirstGame غير محدد (undefined): يرجع للسلوك القديم — عيّنة من كل المخزون بما فيه الجولات التعريفية', () => {
  const io = makeMockIo();
  const socket = makeMockSocket('unknown-first-game-socket');
  const room = rooms.createRoom(io, socket, { maxPlayers: 3 });
  assert.equal(room.rounds.length, 5);
  // لا نتحقق من محتوى معيّن (عشوائي بطبيعته) — بس نتأكد إنه ما رمى خطأ ورجع العدد الصحيح.
});
