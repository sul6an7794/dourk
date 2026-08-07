const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي (نفس أسلوب اختبارات وصّلها).
const TEST_DATA_PATH = path.join(__dirname, '.tmp-admin-routes-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.ACCOUNTS_DATA_PATH = TEST_DATA_PATH;
process.env.ANALYTICS_DATA_PATH = path.join(__dirname, '.tmp-admin-routes-test-analytics.json');
process.env.ERROR_LOG_PATH = path.join(__dirname, '.tmp-admin-routes-test-errors.jsonl');
process.env.STATS_DATA_PATH = path.join(__dirname, '.tmp-admin-routes-test-stats.json');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.ALLOWED_ORIGIN = '*';
process.env.ADMIN_BOOTSTRAP_USERNAME = 'owner';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-bootstrap-token-admin-routes';

const { start } = require('../src/server');

const authentica = require('../src/authentica');
authentica.sendOtp = async () => ({ success: true });
authentica.verifyOtp = async () => ({ status: true });

let server;
let baseUrl;
let adminToken;
let adminUser;
let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  return '+9665' + String(Date.now()).slice(-7) + String(phoneSeq).padStart(2, '0');
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function register(username, extra) {
  const phone = nextPhone();
  await fetch(`${baseUrl}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ phone, otp: '000000', username }, extra || {})),
  });
  return res.json();
}

test.before(async () => {
  server = await start(0);
  baseUrl = `http://localhost:${server.address().port}`;
  // مشرف بوتستراب واحد يُنشأ مرة وحدة بس ويُعاد استخدامه بكل الاختبارات — البوتستراب نفسه
  // يمنح الصلاحية فقط لو ما فيه أي مشرف بالنظام أصلًا، فمحاولة ثانية بعد وجود مشرف تفشل بصمت.
  const { token, user } = await register('owner', { bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN });
  adminToken = token;
  adminUser = user;
});

test.after(async () => {
  server.wslhaIo.close();
  server.mafiaIo.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.ANALYTICS_DATA_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.ERROR_LOG_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.STATS_DATA_PATH); } catch (e) {}
});

test('البوتستراب فعلًا منح صلاحية مشرف للحساب الأول', () => {
  assert.equal(adminUser.isAdmin, true);
});

test('GET /api/admin/users بدون تسجيل دخول يُرفض بـ 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(res.status, 401);
});

test('GET /api/admin/users بحساب عادي (غير مشرف) يُرفض بـ 403', async () => {
  const { token } = await register('عادي');
  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders(token) });
  assert.equal(res.status, 403);
});

test('GET /api/admin/users بحساب مشرف يرجع القائمة كاملة', async () => {
  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders(adminToken) });
  assert.equal(res.status, 200);
  const users = await res.json();
  assert.ok(Array.isArray(users));
  assert.ok(users.some((u) => u.id === adminUser.id));
});

test('PATCH /users/:id: المشرف ما يقدر يزيل صلاحية المشرف عن نفسه', async () => {
  const res = await fetch(`${baseUrl}/api/admin/users/${adminUser.id}`, {
    method: 'PATCH', headers: authHeaders(adminToken), body: JSON.stringify({ isAdmin: false }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /إزالة صلاحية المشرف عن نفسك/);
});

test('PATCH /users/:id: قيمة رصيد غير صحيحة (سالبة/غير رقمية) تُرفض', async () => {
  const { user: target } = await register('مستخدم1');
  const negative = await fetch(`${baseUrl}/api/admin/users/${target.id}`, {
    method: 'PATCH', headers: authHeaders(adminToken), body: JSON.stringify({ credits: -5 }),
  });
  assert.equal(negative.status, 400);
  const nonNumeric = await fetch(`${baseUrl}/api/admin/users/${target.id}`, {
    method: 'PATCH', headers: authHeaders(adminToken), body: JSON.stringify({ credits: 'كذا' }),
  });
  assert.equal(nonNumeric.status, 400);
});

test('PATCH /users/:id: تعديل رصيد صحيح ينجح وينعكس على المستخدم', async () => {
  const { user: target } = await register('مستخدم2');
  const res = await fetch(`${baseUrl}/api/admin/users/${target.id}`, {
    method: 'PATCH', headers: authHeaders(adminToken), body: JSON.stringify({ credits: 7 }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.credits, 7);
});

test('DELETE /users/:id: المشرف ما يقدر يحذف حسابه هو', async () => {
  const res = await fetch(`${baseUrl}/api/admin/users/${adminUser.id}`, { method: 'DELETE', headers: authHeaders(adminToken) });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /حذف حسابك أنت/);
});

test('DELETE /users/:id: المشرف يقدر يحذف حساب مستخدم ثاني، ويختفي من القائمة بعدها', async () => {
  const { user: target } = await register('مستخدم3');
  const del = await fetch(`${baseUrl}/api/admin/users/${target.id}`, { method: 'DELETE', headers: authHeaders(adminToken) });
  assert.equal(del.status, 200);
  const list = await (await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders(adminToken) })).json();
  assert.equal(list.some((u) => u.id === target.id), false);
});
