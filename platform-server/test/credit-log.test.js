const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي.
const TEST_DATA_PATH = path.join(__dirname, '.tmp-credit-log-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.ACCOUNTS_DATA_PATH = TEST_DATA_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

const db = require('../src/db');

test.before(async () => { await db.init(); });
test.after(() => { try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {} });

test('إنشاء حساب جديد يسجّل تذكرة البداية بسجل التدقيق', async () => {
  const user = await db.insertUser({ username: 'clog_signup', phone: '+966500000001' });
  const log = db.getCreditLog(user.id);
  assert.equal(log.length, 1);
  assert.equal(log[0].delta, 1);
  assert.equal(log[0].reason, 'signup-bonus');
  assert.equal(log[0].balanceAfter, 1);
});

test('addCredits يسجّل الخصم/الإضافة مع السبب والرصيد بعده', async () => {
  const user = await db.insertUser({ username: 'clog_add', phone: '+966500000002' });
  await db.addCredits(user.id, -1, 'mafia-room-create');
  await db.addCredits(user.id, 1, 'expired-ticket-refund');
  const log = db.getCreditLog(user.id);
  assert.equal(log.length, 3, 'تذكرة التسجيل + خصم + استرجاع');
  assert.equal(log[0].reason, 'expired-ticket-refund');
  assert.equal(log[0].delta, 1);
  assert.equal(log[0].balanceAfter, 1);
  assert.equal(log[1].reason, 'mafia-room-create');
  assert.equal(log[1].delta, -1);
  assert.equal(log[1].balanceAfter, 0);
});

test('setUserCredits (ضبط المشرف اليدوي) يسجّل الفرق فقط لا القيمة المطلقة', async () => {
  const user = await db.insertUser({ username: 'clog_admin', phone: '+966500000003' });
  await db.setUserCredits(user.id, 5, 'admin-adjustment');
  const log = db.getCreditLog(user.id);
  assert.equal(log[0].delta, 4, 'الرصيد كان 1، صار 5، فالفرق 4');
  assert.equal(log[0].balanceAfter, 5);
});

test('setUserCredits يسجّل هوية المشرف الفعلي اللي نفّذ التعديل', async () => {
  const admin = await db.insertUser({ username: 'clog_admin_actor', phone: '+966500000103' });
  const user = await db.insertUser({ username: 'clog_admin_target', phone: '+966500000104' });
  await db.setUserCredits(user.id, 9, 'admin-adjustment', admin.id);
  const log = db.getCreditLog(user.id);
  assert.equal(log[0].adminId, admin.id);
});

test('setUserCredits بدون تغيير فعلي ما يضيف سجل جديد', async () => {
  const user = await db.insertUser({ username: 'clog_nochange', phone: '+966500000004' });
  const before = db.getCreditLog(user.id).length;
  await db.setUserCredits(user.id, 1, 'admin-adjustment'); // نفس الرصيد الحالي (1)
  assert.equal(db.getCreditLog(user.id).length, before);
});

test('getCreditLog يعزل سجل كل مستخدم عن غيره ويرجع الأحدث أولًا', async () => {
  const a = await db.insertUser({ username: 'clog_a', phone: '+966500000005' });
  const b = await db.insertUser({ username: 'clog_b', phone: '+966500000006' });
  await db.addCredits(a.id, 5, 'test');
  const logA = db.getCreditLog(a.id);
  const logB = db.getCreditLog(b.id);
  assert.equal(logA.length, 2);
  assert.equal(logB.length, 1);
  assert.equal(logA[0].delta, 5, 'أحدث عملية أول عنصر');
});
