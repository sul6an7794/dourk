const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

// عزل بيانات الاختبار عن ملف data.json الحقيقي (نفس أسلوب اختبارات rooms.test.js).
const TEST_DATA_PATH = path.join(__dirname, '.tmp-admin-routes-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.WSL_DATA_PATH = TEST_DATA_PATH;

const db = require('../src/db');
const { createApp } = require('../src/server');

let server;
let baseUrl;

// يحاكي جسر المصادقة المشترك مع platform-server (global.__DOURK_PLATFORM__.auth) — routes/admin.js
// ما عنده أي منطق مصادقة خاص فيه، كله يعتمد على هذا الجسر. نتحكم بردّه حسب كل اختبار
// (بلا مستخدم، مستخدم عادي، أو مشرف) عبر رأس اختباري بسيط بدل تزوير كوكي JWT حقيقي.
function installAuthBridge() {
  global.__DOURK_PLATFORM__ = {
    auth: {
      verifyFromCookieHeader(cookieHeader) {
        if (cookieHeader === 'test_user=admin') return { id: 1, username: 'مشرف', isAdmin: true };
        if (cookieHeader === 'test_user=normal') return { id: 2, username: 'عادي', isAdmin: false };
        return null;
      },
    },
  };
}

const ADMIN_COOKIE = { Cookie: 'test_user=admin' };
const NORMAL_COOKIE = { Cookie: 'test_user=normal' };

test.before(async () => {
  await db.init();
  installAuthBridge();
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  delete global.__DOURK_PLATFORM__;
  await new Promise((resolve) => server.close(resolve));
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
});

test('GET /api/wslha-admin/rounds بدون كوكي جلسة يُرفض بـ 401', async () => {
  const res = await fetch(`${baseUrl}/api/wslha-admin/rounds`);
  assert.equal(res.status, 401);
});

test('GET /api/wslha-admin/rounds بحساب عادي (غير مشرف) يُرفض بـ 403', async () => {
  const res = await fetch(`${baseUrl}/api/wslha-admin/rounds`, { headers: NORMAL_COOKIE });
  assert.equal(res.status, 403);
});

test('GET /api/wslha-admin/rounds بحساب مشرف يرجع القائمة (فاضية مبدئيًا)', async () => {
  const res = await fetch(`${baseUrl}/api/wslha-admin/rounds`, { headers: ADMIN_COOKIE });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(await res.json()));
});

test('POST /api/wslha-admin/rounds: إنشاء جولة بدون إجابات يُرفض بـ 400', async () => {
  const res = await fetch(`${baseUrl}/api/wslha-admin/rounds`, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ADMIN_COOKIE),
    body: JSON.stringify({ hint: 'بلا إجابة' }),
  });
  assert.equal(res.status, 400);
});

test('POST /api/wslha-admin/rounds: إنشاء جولة صحيحة ينجح، وPATCH يعدّلها جزئيًا', async () => {
  const created = await (await fetch(`${baseUrl}/api/wslha-admin/rounds`, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ADMIN_COOKIE),
    body: JSON.stringify({ hint: 'تلميح', answers: 'جواب1، جواب2', category: 'تجربة' }),
  })).json();
  assert.equal(created.answers.length, 2);

  const updated = await (await fetch(`${baseUrl}/api/wslha-admin/rounds/${created.id}`, {
    method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, ADMIN_COOKIE),
    body: JSON.stringify({ hint: 'تلميح معدّل' }),
  })).json();
  assert.equal(updated.hint, 'تلميح معدّل');
  assert.equal(updated.answers.length, 2, 'answers ما لازم تتأثر بتعديل حقل ثاني (تعديل جزئي فعلي)');
});

test('DELETE /api/wslha-admin/rounds/:id يحذف الجولة فعليًا', async () => {
  const created = await (await fetch(`${baseUrl}/api/wslha-admin/rounds`, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ADMIN_COOKIE),
    body: JSON.stringify({ hint: '', answers: 'حذف', category: '' }),
  })).json();
  const del = await fetch(`${baseUrl}/api/wslha-admin/rounds/${created.id}`, { method: 'DELETE', headers: ADMIN_COOKIE });
  assert.equal(del.status, 200);
  const list = await (await fetch(`${baseUrl}/api/wslha-admin/rounds`, { headers: ADMIN_COOKIE })).json();
  assert.equal(list.some((r) => r.id === created.id), false);
});

test('POST /api/wslha-admin/rounds/:id/images: رفض تجاوز الحد الأقصى 3 صور حتى لو حاول متجاوزًا مباشرة', async () => {
  const round = await (await fetch(`${baseUrl}/api/wslha-admin/rounds`, {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ADMIN_COOKIE),
    body: JSON.stringify({ hint: '', answers: 'صور', category: '' }),
  })).json();

  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  function makeForm() {
    const fd = new FormData();
    for (let i = 0; i < 4; i += 1) fd.append('images', new Blob([pngBytes], { type: 'image/png' }), `p${i}.png`);
    return fd;
  }
  const res = await fetch(`${baseUrl}/api/wslha-admin/rounds/${round.id}/images`, {
    method: 'POST', headers: ADMIN_COOKIE, body: makeForm(),
  });
  assert.equal(res.status, 400, 'رفع 4 صور دفعة وحدة (أكثر من 3) لازم يُرفض حتى لو الجولة كانت فاضية');
  const body = await res.json();
  assert.match(body.error, /الحد الأقصى/);
});
