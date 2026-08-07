const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// عزل بيانات الاختبار عن ملف data.json الحقيقي (نفس أسلوب اختبارات وصّلها).
const TEST_DATA_PATH = path.join(__dirname, '.tmp-platform-test-data.json');
try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
process.env.ACCOUNTS_DATA_PATH = TEST_DATA_PATH;
process.env.ANALYTICS_DATA_PATH = path.join(__dirname, '.tmp-rooms-route-test-analytics.json');
process.env.ERROR_LOG_PATH = path.join(__dirname, '.tmp-rooms-route-test-errors.jsonl');
process.env.STATS_DATA_PATH = path.join(__dirname, '.tmp-rooms-route-test-stats.json');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.ALLOWED_ORIGIN = '*';

const { start } = require('../src/server');

// نفس نسخة الوحدة المخبّأة (module cache) اللي routes/auth.js يستدعيها — نستبدل دواله بنسخ
// وهمية بدل ما نتصل فعليًا بـ Authentica (خدمة SMS حقيقية) أثناء الاختبارات الآلية.
const authentica = require('../src/authentica');
authentica.sendOtp = async () => ({ success: true });
authentica.verifyOtp = async () => ({ status: true });

let server;
let baseUrl;
let testPhoneSeq = 0;
function nextTestPhone() {
  testPhoneSeq += 1;
  return '+9665' + String(Date.now()).slice(-7) + String(testPhoneSeq).padStart(2, '0');
}

test.before(async () => {
  server = await start(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  // socket.io يبقي مؤقّتات ping/pong لكل عميل متصل حتى لو انقطع الاتصال الخام — لازم نقفل
  // كل Server تبعه صراحة أول، وإلا الإغلاق يتعلّق دقيقة كاملة لين تنتهي المؤقّتات لحالها.
  server.wslhaIo.close();
  server.mafiaIo.close();
  // fetch() المدمجة (undici) تبقي اتصالات keep-alive خاملة مفتوحة لإعادة استخدامها —
  // server.close() وحده ينتظرها للأبد لأنه ما يقفل أي اتصال قائم بنفسه. لازم نقفلها بالقوة.
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  try { fs.unlinkSync(TEST_DATA_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.ANALYTICS_DATA_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.ERROR_LOG_PATH); } catch (e) {}
  try { fs.unlinkSync(process.env.STATS_DATA_PATH); } catch (e) {}
});

// دخول اختباري عبر تدفّق OTP الحقيقي (طلب رمز ثم تحقق) — authentica.js مُستبدَل أعلاه بنسخة
// وهمية دائمة النجاح، فأي رمز "otp" هنا يُقبل. رقم جوال فريد لكل استدعاء يضمن حسابًا جديدًا.
async function register(username) {
  const phone = nextTestPhone();
  await fetch(`${baseUrl}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: '000000', username }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

test('POST /api/rooms/mafia بدون تسجيل دخول يُرفض بـ 401', async () => {
  const res = await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST' });
  assert.equal(res.status, 401);
});

test('حساب جديد يبدأ برصيد تذكرة واحدة، وإنشاء غرفة مافيا يخصمها ويصدر تذكرة غرفة صالحة', async () => {
  const { status, body } = await register('route_credit_' + Date.now());
  assert.equal(status, 200);
  assert.equal(body.user.credits, 1);

  const res = await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST', headers: authHeaders(body.token) });
  const created = await res.json();
  assert.equal(res.status, 200);
  assert.equal(created.ok, true);
  assert.equal(created.credits, 0);
  assert.ok(created.rt && created.rt.length > 0, 'لازم يرجع رمز تذكرة غرفة صالح');
});

test('إنشاء غرفة مافيا برصيد صفر يُرفض بـ 402 قبل ما يوصل مافيا أصلًا', async () => {
  const { body } = await register('route_zero_' + Date.now());
  await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST', headers: authHeaders(body.token) }); // يستهلك التذكرة الوحيدة
  const res2 = await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST', headers: authHeaders(body.token) });
  const body2 = await res2.json();
  assert.equal(res2.status, 402);
  assert.ok(body2.error);
});

test('تذكرة الغرفة الصادرة تُستخدم فعليًا في سيرفر مافيا وتُرفض إعادة استخدامها', async () => {
  const { body } = await register('route_redeem_' + Date.now());
  const created = await (await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST', headers: authHeaders(body.token) })).json();

  const first = global.__DOURK_PLATFORM__.tickets.redeem(created.rt);
  assert.equal(first, body.user.id, 'أول استخدام يرجع نفس معرّف المستخدم');

  const second = global.__DOURK_PLATFORM__.tickets.redeem(created.rt);
  assert.equal(second, null, 'إعادة استخدام نفس التذكرة تُرفض');
});

test('GET /api/rooms/:code لكود غير موجود يرجع 404', async () => {
  const res = await fetch(`${baseUrl}/api/rooms/000000`);
  assert.equal(res.status, 404);
});

test('GET /api/rooms/:code يرجع اللعبة الصحيحة بعد تسجيلها بالسجل المشترك', async () => {
  global.__DOURK_PLATFORM__.rooms.register('654321', 'wslha');
  const res = await fetch(`${baseUrl}/api/rooms/654321`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.game, 'wslha');
});

test('فتح مافيا مباشرة بدون تذكرة صادرة من المنصة يُرفض عند إنشاء الغرفة', async () => {
  const { io } = require('socket.io-client');
  const socket = io(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: 'route-bypass-test' } });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  const res = await new Promise((resolve) => socket.emit('createRoom', { name: 'متسلل' }, resolve));
  socket.close();
  assert.ok(res.error, 'لازم يرفض إنشاء الغرفة بدون rt صالح');
});

// إعادة اللعبة (newGame) لازم تخصم تذكرة زي إنشاء غرفة جديدة تمامًا، من نفس حساب صاحب الغرفة،
// بدون تحويل لصفحة المنصة. نستخدم نفس وحدات مافيا/db تبع السيرفر المُركَّب مباشرة (نفس الـ singleton)
// عشان نفرض حالة "انتهت اللعبة" بدل تشغيل جولة كاملة.
const mafiaRooms = require(path.join(__dirname, '..', '..', 'mafia', 'server', 'src', 'rooms.js'));
const accountsDb = require('../src/db');
const { io: ioClient } = require('socket.io-client');

// مافيا الحين تتحقق من هوية حقيقية (كوكي الجلسة الموقّع) قبل أي خصم/عرض رصيد — مو deviceId
// اللي أي متصفح يخترعه بنفسه. لازم نمرر نفس كوكي المنصة (wsl_token) يدويًا هنا زي ما يسويه
// متصفح حقيقي تلقائيًا، وإلا كل عمليات الخصم بالاختبارات تصير "مجانية" لأن الهوية ما تتطابق.
async function createMafiaRoomForUser(uname) {
  const { body } = await register(uname);
  const created = await (await fetch(`${baseUrl}/api/rooms/mafia`, { method: 'POST', headers: authHeaders(body.token) })).json();
  const socket = ioClient(baseUrl, {
    path: '/mafia/socket.io/',
    auth: { deviceId: uname + '-dev' },
    extraHeaders: { Cookie: 'wsl_token=' + body.token },
  });
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject); });
  const joined = await new Promise((resolve) => socket.emit('createRoom', { name: uname, rt: created.rt }, resolve));
  return { socket, uid: body.user.id, roomCode: joined.roomCode, deviceId: uname + '-dev' };
}

test('newGame تخصم تذكرة أخرى من صاحب الغرفة لو عنده رصيد', async () => {
  const { socket, uid, roomCode } = await createMafiaRoomForUser('rematch_ok_' + Date.now());
  mafiaRooms.getRoom(roomCode).phase = 'gameover';
  await accountsDb.addCredits(uid, 1); // تعويض الرصيد بعد ما استُهلك بإنشاء الغرفة، عشان نختبر خصم إعادة اللعبة تحديدًا

  const res = await new Promise((resolve) => socket.emit('newGame', {}, resolve));
  socket.close();
  assert.equal(res.ok, true);
  assert.equal(accountsDb.getUserById(uid).credits, 0, 'لازم تُخصم تذكرة إعادة اللعبة أيضًا');
});

test('newGame تُرفض لو رصيد صاحب الغرفة صفر', async () => {
  const { socket, uid, roomCode } = await createMafiaRoomForUser('rematch_zero_' + Date.now());
  mafiaRooms.getRoom(roomCode).phase = 'gameover';
  // الرصيد صفر بعد إنشاء الغرفة (تذكرة البداية الوحيدة) — ما نعوّضه هذي المرة.

  const res = await new Promise((resolve) => socket.emit('newGame', {}, resolve));
  socket.close();
  assert.ok(res.error, 'لازم يرفض إعادة اللعبة بدون رصيد');
  assert.equal(accountsDb.getUserById(uid).credits, 0);
});

test('ضغطتان سريعتان على newGame تخصمان تذكرة واحدة بس (قفل ضد التكرار)', async () => {
  const { socket, uid, roomCode } = await createMafiaRoomForUser('rematch_double_' + Date.now());
  mafiaRooms.getRoom(roomCode).phase = 'gameover';
  await accountsDb.addCredits(uid, 2); // رصيد يكفي تذكرتين، عشان لو انخصمت تذكرتان غلط نلاحظه

  const [res1, res2] = await Promise.all([
    new Promise((resolve) => socket.emit('newGame', {}, resolve)),
    new Promise((resolve) => socket.emit('newGame', {}, resolve)),
  ]);
  socket.close();
  const oks = [res1, res2].filter((r) => r.ok).length;
  assert.equal(oks, 1, 'لازم وحدة بس من الطلبين تنجح');
  assert.equal(accountsDb.getUserById(uid).credits, 1, 'تذكرة وحدة بس تُخصم مو تذكرتين');
});

test('انتقال القيادة بعد مغادرة صاحب الغرفة يخلي إعادة اللعبة مجانية (بدل خصم حساب غادر)', async () => {
  const { socket: hostSocket, uid, roomCode } = await createMafiaRoomForUser('rematch_transfer_' + Date.now());
  const secondDeviceId = 'second-player-dev-' + Date.now();
  const second = ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId: secondDeviceId } });
  await new Promise((resolve, reject) => { second.on('connect', resolve); second.on('connect_error', reject); });
  const joinRes = await new Promise((resolve) => second.emit('joinRoom', { roomCode, name: 'لاعب٢' }, resolve));
  assert.ok(joinRes.ok);

  assert.equal(mafiaRooms.getRoom(roomCode).platformUid, uid, 'قبل المغادرة يبقى معرّف صاحب الغرفة الأصلي');

  // القائد الأصلي يغادر صراحة — القيادة تنتقل للاعب الثاني، ومعرّف حساب المنصة لازم يُمسح.
  const leaveRes = await new Promise((resolve) => { hostSocket.emit('leaveRoom'); setTimeout(resolve, 100); });
  hostSocket.close();

  const room = mafiaRooms.getRoom(roomCode);
  assert.equal(room.hostId, secondDeviceId, 'القيادة انتقلت للاعب الثاني');
  assert.equal(room.platformUid, null, 'معرّف حساب المنصة الأصلي لازم يُمسح بعد انتقال القيادة');

  room.phase = 'gameover';
  const creditsBefore = accountsDb.getUserById(uid).credits;
  const newGameRes = await new Promise((resolve) => second.emit('newGame', {}, resolve));
  second.close();
  assert.equal(newGameRes.ok, true, 'القائد الجديد يقدر يعيد اللعبة بدون تذكرة');
  assert.equal(accountsDb.getUserById(uid).credits, creditsBefore, 'حساب القائد الأصلي (الغادر) ما ينخصم منه شي');
  void leaveRes;
});

test('myCredits يرجع الرصيد الحالي لصاحب الغرفة فقط', async () => {
  const { socket, uid } = await createMafiaRoomForUser('mycredits_' + Date.now());
  await accountsDb.addCredits(uid, 3);
  const res = await new Promise((resolve) => socket.emit('myCredits', {}, resolve));
  socket.close();
  assert.equal(res.credits, 3);
});

// deviceId يرسله المتصفح نفسه بدون أي تحقق من السيرفر — أي حد يعرف/يخمّن deviceId صاحب
// الغرفة يقدر ينتحل شخصيته بمعنى "أنا القائد". نتأكد إن هذا الانتحال ما يكفي وحده لا لرؤية
// رصيد حساب حقيقي ولا لخصم تذكرة منه — لازم كوكي الجلسة الحقيقي المطابق كمان.
test('انتحال deviceId القائد بدون كوكي جلسة صحيح ما يكشف الرصيد ولا يخصم من حساب الضحية', async () => {
  const { socket: hostSocket, uid, roomCode, deviceId } = await createMafiaRoomForUser('impersonation_' + Date.now());
  await accountsDb.addCredits(uid, 5);

  const impostor = ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId } }); // نفس deviceId، بدون كوكي
  await new Promise((resolve, reject) => { impostor.on('connect', resolve); impostor.on('connect_error', reject); });
  // "إعادة اتصال" بنفس deviceId — من منظور السيرفر ما فيه فرق بينه وبين صاحب الجهاز الحقيقي يرجع من تبويب جديد.
  const rejoin = await new Promise((resolve) => impostor.emit('joinRoom', { roomCode, name: 'منتحل' }, resolve));
  assert.ok(rejoin.ok, 'الانتحال ينجح على مستوى اللعبة العادية (نفس deviceId)');

  const creditsRes = await new Promise((resolve) => impostor.emit('myCredits', {}, resolve));
  assert.equal(creditsRes.credits, null, 'المنتحل ما يشوف الرصيد الحقيقي');

  const creditsBefore = accountsDb.getUserById(uid).credits;
  mafiaRooms.getRoom(roomCode).phase = 'gameover';
  const newGameRes = await new Promise((resolve) => impostor.emit('newGame', {}, resolve));
  impostor.close();
  hostSocket.close();
  assert.equal(newGameRes.ok, true, 'إعادة اللعبة تنجح (صلاحية اللعب العادية ما تغيّرت)');
  assert.equal(accountsDb.getUserById(uid).credits, creditsBefore, 'لكن حساب الضحية الحقيقي ما ينخصم منه شي');
});
