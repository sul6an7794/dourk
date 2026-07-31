const test = require('node:test');
const assert = require('node:assert');
const { createLedger } = require('../src/ticket-ledger');

test('issue ثم redeem مرة وحدة يرجع نفس المستخدم', () => {
  const ledger = createLedger(60 * 1000);
  const jti = ledger.issue(42);
  assert.strictEqual(ledger.redeem(jti), 42);
});

test('redeem ثانية لنفس التذكرة تُرفض (منع إعادة الاستخدام)', () => {
  const ledger = createLedger(60 * 1000);
  const jti = ledger.issue(7);
  assert.strictEqual(ledger.redeem(jti), 7);
  assert.strictEqual(ledger.redeem(jti), null);
});

test('تذكرة غير موجودة أو فارغة تُرفض', () => {
  const ledger = createLedger(60 * 1000);
  assert.strictEqual(ledger.redeem('not-a-real-jti'), null);
  assert.strictEqual(ledger.redeem(undefined), null);
});

test('تذكرة منتهية الصلاحية تُرفض عند redeem', async () => {
  const ledger = createLedger(5); // 5ms فقط
  const jti = ledger.issue(1);
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(ledger.redeem(jti), null);
});

test('sweepExpired يسترجع الرصيد تلقائيًا للتذاكر المنتهية غير المستخدمة', async () => {
  const ledger = createLedger(5);
  ledger.issue(99);
  assert.strictEqual(ledger._size(), 1);
  await new Promise((r) => setTimeout(r, 20));
  const refunded = [];
  const fakeDb = { addCredits: async (uid, delta) => { refunded.push([uid, delta]); } };
  await ledger.sweepExpired(fakeDb);
  assert.deepStrictEqual(refunded, [[99, 1]]);
  assert.strictEqual(ledger._size(), 0);
});

test('sweepExpired لا يمس تذاكر لسا صالحة', async () => {
  const ledger = createLedger(60 * 1000);
  ledger.issue(5);
  const refunded = [];
  const fakeDb = { addCredits: async (uid, delta) => { refunded.push([uid, delta]); } };
  await ledger.sweepExpired(fakeDb);
  assert.deepStrictEqual(refunded, []);
  assert.strictEqual(ledger._size(), 1);
});

test('serialize/restore: تذكرة معلّقة تنجو من إعادة تشغيل السيرفر وتبقى قابلة للاستخدام', () => {
  const before = createLedger(60 * 1000);
  const jti = before.issue(11);
  const snapshot = before.serialize();

  // محاكاة إعادة تشغيل السيرفر — دفتر جديد كليًا، ما يعرف شي عن التذكرة إلا من اللقطة.
  const after = createLedger(60 * 1000);
  const restoredCount = after.restore(snapshot);

  assert.strictEqual(restoredCount, 1);
  assert.strictEqual(after.redeem(jti), 11);
});

test('serialize/restore: تذكرة انتهت صلاحيتها أثناء إعادة التشغيل تُسترجع بالسويب الطبيعي بدل ما تضيع', async () => {
  const before = createLedger(5); // 5ms فقط
  before.issue(22);
  await new Promise((r) => setTimeout(r, 20)); // تنتهي صلاحيتها قبل ما نحفظ اللقطة (محاكاة توقف طويل)
  const snapshot = before.serialize();

  const after = createLedger(5);
  after.restore(snapshot);
  assert.strictEqual(after._size(), 1, 'التذكرة المنتهية تبقى بالدفتر بعد الاستعادة (لا تُحذف بصمت)');

  const refunded = [];
  const fakeDb = { addCredits: async (uid, delta) => { refunded.push([uid, delta]); } };
  await after.sweepExpired(fakeDb);
  assert.deepStrictEqual(refunded, [[22, 1]], 'السويب الطبيعي بعد الاستعادة يسترجع الرصيد بدل ما يضيع للأبد');
});
