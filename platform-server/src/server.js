require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
// أمان: لا نفتح CORS/سوكيت لأي أصل افتراضيًا. لو ALLOWED_ORIGIN غير مضبوط، نقتصر على
// نفس الأصل (false) بدل السماح لأي موقع خارجي يفتح اتصال سوكيت حي بالنيابة عن زائر الموقع.
let ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
if (!ALLOWED_ORIGIN) {
  ALLOWED_ORIGIN = false;
  console.warn('⚠️  ALLOWED_ORIGIN غير مضبوط — السوكيت مقصور على نفس الأصل فقط. اضبطه في بيئة الإنتاج لو الواجهة على أصل مختلف.');
}

const MAFIA_DIR = path.join(__dirname, '..', '..', 'mafia', 'server');
const WSLHA_DIR = path.join(__dirname, '..', '..', 'wslha-server', 'server');

// حسابات المنصة (مستخدمين/تذاكر/دخول) — ملك platform-server نفسه، لا يعتمد على أي لعبة.
// يبقى شغّال حتى لو انحذفت لعبة وصّلها أو مافيا لاحقًا.
const accountsDb = require('./db');
// لازم يتسجّل قبل أي require للعبتين — كل وحدة منهم تتحقق من وجود global.__DOURK_PLATFORM__
// وقت إنشاء الغرفة/إعادة اللعبة (واجهة موحّدة واحدة بدل singletons مبعثرة).
require('./platform-global').install(accountsDb);

const { createApp: mafiaCreateApp } = require(path.join(MAFIA_DIR, 'src', 'server.js'));
const { attachSocketHandlers: attachMafiaSocket } = require(path.join(MAFIA_DIR, 'src', 'socket.js'));
const mafiaRooms = require(path.join(MAFIA_DIR, 'src', 'rooms.js'));
const { sweepAbandonedRooms: sweepMafiaRooms } = mafiaRooms;

// قاعدة محتوى وصّلها (الجولات/الصور فقط، لا حسابات) — تبقى ملك وصّلها نفسها.
const wslhaContentDb = require(path.join(WSLHA_DIR, 'src', 'db.js'));
const { seedDefaults } = require(path.join(WSLHA_DIR, 'src', 'seed.js'));
const { createApp: wslhaCreateApp } = require(path.join(WSLHA_DIR, 'src', 'server.js'));
const { registerSocket: registerWslhaSocket } = require(path.join(WSLHA_DIR, 'src', 'socket.js'));
const wslhaRooms = require(path.join(WSLHA_DIR, 'src', 'rooms.js'));
const { sweepAbandonedRooms: sweepWslhaRooms } = wslhaRooms;

const registry = require('./rooms-registry');
const ticketLedger = require('./ticket-ledger');
const roomsRoute = require('./routes/rooms');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const roomSnapshots = require('./room-snapshots');

const PLATFORM_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // الواجهة الحالية تستخدم معالجات onclick مضمّنة؛ إبقاؤها هنا يمنع كسر المنصة أثناء الانتقال التدريجي للمعالجات الخارجية.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.socket.io https://cdnjs.cloudflare.com https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss: ws:",
  // ختم "متجر موثّق" (المركز السعودي للأعمال) بفوتر الصفحة الرئيسية — iframe نبنيه بأنفسنا لضبط اتجاه انبثاق تفاصيله.
  "frame-src 'self' https://eauthenticate.saudibusiness.gov.sa",
  "frame-ancestors 'self'",
].join('; ');

async function start(port = PORT) {
  await accountsDb.init();
  await wslhaContentDb.init();
  await seedDefaults();
  const previousSnapshot = roomSnapshots.load();
  if (previousSnapshot) {
    const restoredWslha = wslhaRooms.restoreActiveRooms(previousSnapshot.wslha);
    const restoredMafia = mafiaRooms.restoreLobbies(previousSnapshot.mafia);
    if (restoredWslha || restoredMafia) console.log(`استُعيدت ${restoredWslha + restoredMafia} غرفة من آخر تشغيل.`);
  }

  const app = express();
  // أمان: نثق بهوب وحدة بس (بروكسي Render نفسه)، لا بسلسلة هوبات غير محدودة —
  // يمنع عميل خبيث من حقن عناوين IP مزيّفة بترويسة X-Forwarded-For والتحكم بـreq.ip.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.set('Content-Security-Policy', PLATFORM_CSP);
    if (req.secure || process.env.NODE_ENV === 'production') {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // تحليل جسم JSON — لازم قبل أي مسار /api يقرأ req.body (auth/admin/rooms هنا على المنصة
  // نفسها الآن، مو بره داخل تطبيق فرعي مثل وصّلها اللي كان يوفّرها ضمنيًا سابقًا).
  app.use(express.json({ limit: '1mb' }));

  // واجهة المنصة (الرئيسية): اختيار اللعبة، الحساب، التذاكر، الملف الشخصي.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // صفحة وصّلها الفعلية تُخدَّم صراحة هنا — سيرفر وصّلها نفسه (بالأسفل) يُركَّب على الجذر
  // لخدمة أصوله المطلقة المسار (خطوط، صور، ملفات مساعدة) كما هي، فيحتاج مسار صريح لصفحته.
  const wslhaIndex = path.join(WSLHA_DIR, 'public', 'index.html');
  app.get(['/wslha', '/wslha/'], (req, res) => res.sendFile(wslhaIndex));

  // رابط أقصر وأوضح للوحة تحكم وصّلها بدل /wslha?admin=1 — نفس صفحة وصّلها بالضبط، تُخدَّم
  // مباشرة (لا إعادة توجيه) حتى يبقى شريط العنوان /admin نفسه بعد فتح اللوحة.
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile(wslhaIndex));

  // حسابات/دخول/إدارة مستخدمين — ملك المنصة نفسها، مشتركة لكل الألعاب، تعمل حتى لو انحذفت
  // أي لعبة لاحقًا (لا تعتمد على مجلد وصّلها أو مافيا إطلاقًا).
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  // تسجيل/دخول/تذاكر/إدارة — مسار موحّد لكل اللعبتين، قبل تركيب أي سيرفر لعبة.
  app.use('/api/rooms', roomsRoute);

  // مافيا: أصولها كلها مسارات نسبية، فتُركَّب بأمان تحت بادئة فرعية.
  app.use('/mafia', mafiaCreateApp());

  // وصّلها: أصولها (خطوط، ملفات مساعدة، /img، /uploads) مسارات مطلقة من الجذر، فتُركَّب على الجذر
  // كاملة. عندها فقط /api/wslha-admin لإدارة محتواها الخاص (الجولات/الصور) — لا تلمس /api/auth
  // ولا /api/admin إطلاقًا بعد الآن.
  app.use(wslhaCreateApp());

  // شبكة أمان أخيرة: أي خطأ يوصل هنا عبر next(err) (من asyncHandler بمسارات auth/admin/rooms)
  // يرجع JSON مهذّب بدل صفحة HTML افتراضية من Express — وبدونها أصلًا الاستثناء غير المُمسوك
  // كان يُسقط عملية Node بالكامل لكل المستخدمين دفعة وحدة.
  app.use((err, req, res, next) => {
    console.error('خطأ غير متوقع بمسار API:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'خطأ غير متوقع بالسيرفر' });
  });

  const server = http.createServer(app);

  const wslhaIo = new Server(server, { cors: { origin: ALLOWED_ORIGIN } });
  registerWslhaSocket(wslhaIo);

  const mafiaIo = new Server(server, { path: '/mafia/socket.io/', cors: { origin: ALLOWED_ORIGIN } });
  attachMafiaSocket(mafiaIo);

  const wslhaSweep = setInterval(sweepWslhaRooms, 5 * 60 * 1000);
  const mafiaSweep = setInterval(sweepMafiaRooms, 5 * 60 * 1000);
  const registrySweep = registry.startSweep();
  const ticketSweep = ticketLedger.startSweep(accountsDb);
  const snapshotRooms = () => {
    try {
      roomSnapshots.save({
        wslha: wslhaRooms.snapshotActiveRooms(),
        mafia: mafiaRooms.snapshotLobbies(),
      });
    } catch (error) {
      // تعطل مساحة التخزين لا ينبغي أن يوقف لعبة جارية؛ المحاولة التالية قد تنجح بعد عودة القرص.
      console.error('تعذّر حفظ لقطة الغرف:', error.message);
    }
  };
  const snapshotTimer = setInterval(snapshotRooms, 10 * 1000);
  if (snapshotTimer.unref) snapshotTimer.unref();
  server.on('close', () => {
    snapshotRooms();
    clearInterval(wslhaSweep);
    clearInterval(mafiaSweep);
    clearInterval(registrySweep);
    clearInterval(ticketSweep);
    clearInterval(snapshotTimer);
  });

  server.listen(port, () => {
    console.log(`دورك — المنصة الموحّدة تعمل على http://localhost:${server.address().port}`);
  });

  // نعرّضهم على الكائن المُرجَّع عشان مين يوقف السيرفر (زي الاختبارات) يقدر يقفلهم صراحة قبل
  // httpServer.close() — بدونه socket.io يبقي مؤقّتات ping/pong لكل عميل شغّالة لين تنتهي
  // لحالها (لين ٣٠+ ثانية)، فيتعلّق الإغلاق النظيف بدون داعي.
  server.wslhaIo = wslhaIo;
  server.mafiaIo = mafiaIo;

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('فشل بدء سيرفر المنصة:', err);
    process.exit(1);
  });
}

module.exports = { start };
