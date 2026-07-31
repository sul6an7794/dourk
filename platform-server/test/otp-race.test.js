const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي (نفس أسلوب اختبارات وصّلها).
const TEST_DATA_PATH = path.join(__dirname, '.tmp-otp-race-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.ACCOUNTS_DATA_PATH = TEST_DATA_PATH;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.ALLOWED_ORIGIN = '*';

const { start } = require('../src/server');

const authentica = require('../src/authentica');
authentica.sendOtp = async () => ({ success: true });
authentica.verifyOtp = async () => ({ status: true });

let server;
let baseUrl;

test.before(async () => {
  server = await start(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  server.wslhaIo.close();
  server.mafiaIo.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
});

test('otp/verify: طلبان متزامنان لنفس رقم الجوال ينتجان حسابًا واحدًا فقط بدون تكرار', async () => {
  const phone = '+96650' + String(Date.now()).slice(-8);
  await fetch(`${baseUrl}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  // نطلق الطلبين بنفس اللحظة تقريبًا (بدون await بينهما) لمحاكاة ضغطتين سريعتين على نفس الرقم.
  const verify = () => fetch(`${baseUrl}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: '000000', username: 'سباق' }),
  }).then((r) => r.json());

  const [a, b] = await Promise.all([verify(), verify()]);

  assert.equal(a.user.id, b.user.id, 'الطلبان لازم يرجّعان نفس معرّف المستخدم (حساب واحد فقط)');
  // بالضبط واحد من الطلبين هو اللي أنشأ الحساب فعليًا؛ الثاني لازم يكتشف إنه موجود.
  assert.equal([a.isNew, b.isNew].filter(Boolean).length, 1, 'isNew لازم يكون true لطلب واحد بالضبط');
});
