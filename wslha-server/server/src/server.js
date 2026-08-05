require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./db');
const { seedDefaults } = require('./seed');
const adminRoutes = require('./routes/admin');
const { registerSocket } = require('./socket');
const { rateLimit } = require('./rateLimit');
const { sweepAbandonedRooms } = require('./rooms');

// أمان: نحصر CORS على أصل الموقع الفعلي بدل السماح لأي موقع (*) بمناداة الـAPI.
function parseAllowedOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw === '*') return '*';
  const list = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return list.length <= 1 ? (list[0] || false) : list;
}

const ALLOWED_ORIGIN = parseAllowedOrigin(process.env.ALLOWED_ORIGIN || 'https://dourk.sa,https://www.dourk.sa');
const PORT = process.env.PORT || 3001;

function createApp() {
  const app = express();
  // خلف بروكسي (Render/Railway) — يخلي req.protocol = https حتى تطلع روابط الصور بـ https وما تنكسر بصفحة https.
  // هوب وحدة بس (مو true/غير محدود) — يمنع تزوير X-Forwarded-For من التحكم بـreq.ip المستخدم بتحديد المعدّل.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ترويسات أمان أساسية
  const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // ملاحظة أمان: 'unsafe-eval' لازم لأن محرّك الواجهة (support.js) يشغّل منطق المكوّن عبر new Function(...)
    // (الكود مخزَّن كنص داخل <script type="text/x-dc"> غير قابل للتنفيذ المباشر من المتصفح، ثم يُترجم وقت التشغيل).
    // 'unsafe-inline' مو لازمة لأي script-src فعليًا: كل الأحداث onClick/onInput مربوطة عبر {{ }} وتتحوّل لمعالجات
    // React حقيقية، مو سمات HTML خام، وكل ملفات الجافاسكربت خارجية (src=) — تأكدنا بالفحص المباشر.
    "script-src 'self' 'unsafe-eval' blob: https://cdn.socket.io https://cdnjs.cloudflare.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss: ws:",
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
  ].join('; ');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.set('Content-Security-Policy', CSP);
    next();
  });

  app.use(cors({ origin: ALLOWED_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  // الواجهة (ملف HTML المستقل) تُخدَّم من نفس السيرفر — نشر كخدمة واحدة، وبدون مشاكل CORS.
  const publicDir = path.join(__dirname, '..', 'public');
  // خطوط ثمانية: ملفات ثابتة لا تتغيّر إلا باسم جديد — كاش طويل المدى يمنع طلب
  // إعادة التحقق (revalidation) من السيرفر بكل تحميل صفحة، وهو اللي كان يسبب
  // وميض تبديل الخط عند كل تحديث (font-display ما يفيد لو الخط يوصل متأخر بسبب
  // جولة شبكة revalidation في كل مرة).
  app.use('/fonts', express.static(path.join(publicDir, 'fonts'), { maxAge: '1y', immutable: true }));
  app.use(express.static(publicDir));
  // توافق مع صور قديمة مخزّنة محليًا (إن وُجدت)
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/health', (req, res) => res.json({ ok: true }));
  // حد عام واسع لكل نقاط /api كطبقة أمان إضافية (فوق الحدود الأضيق الخاصة بالدخول/التسجيل والإدارة).
  app.use('/api', rateLimit(300, 5 * 60 * 1000, 'api'));
  // إدارة محتوى وصّلها فقط (جولات/صور) — الدخول/الحسابات صارت ملك المنصة على /api/auth و/api/admin.
  app.use('/api/wslha-admin', adminRoutes);

  // خدمة الصور المرفوعة من طبقة التخزين (MongoDB أو الملف المحلي).
  app.get('/img/*', async (req, res) => {
    try {
      const img = await db.getImage(req.params[0]);
      if (!img) return res.status(404).json({ error: 'الصورة غير موجودة' });
      // أمان: لا نخدّم إلا أنواع صور آمنة؛ أي شيء آخر (يشمل SVG القديم المخزَّن قبل رفض رفعه)
      // يُنزَّل كملف بدل تنفيذه بالمتصفح — SVG قد يحتوي <script> ينفّذ فعليًا لو خُدِّم inline.
      const isSafeImage = /^image\//.test(img.contentType || '') && img.contentType !== 'image/svg+xml';
      const ct = isSafeImage ? img.contentType : 'application/octet-stream';
      if (ct === 'application/octet-stream') res.set('Content-Disposition', 'attachment');
      res.set('Content-Type', ct);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(img.data);
    } catch (e) {
      res.status(500).json({ error: 'خطأ في تحميل الصورة' });
    }
  });

  // الصفحة الرئيسية: واجهة اللعبة
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // شبكة أمان: أي خطأ غير متوقع يرجع JSON بدل صفحة HTML (يمنع كسر الواجهة)
  app.use((req, res) => {
    res.status(404).json({ error: 'الصفحة غير موجودة' });
  });
  app.use((err, req, res, next) => {
    // لو وصّلها شغّالة جوا عملية دورك الموحّدة، نسجّل الخطأ بسجل المنصة المركزي (نفس سجل
    // مافيا والمنصة نفسها) — لو شغّالة لحالها (تطوير محلي)، نكتفي بـconsole.error عادي.
    if (global.__DOURK_PLATFORM__ && global.__DOURK_PLATFORM__.errors) {
      global.__DOURK_PLATFORM__.errors.log('wslha', err, { path: req.originalUrl, method: req.method });
    } else {
      console.error(err);
    }
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'صار خطأ من عندنا، حاول مرة ثانية' });
  });

  return app;
}

// ملاحظة: تشغيل هذا الملف مستقلًا (بدون المرور بـ platform-server) يعني عدم وجود
// global.__DOURK_PLATFORM__ إطلاقًا — لوحة إدارة المحتوى (/api/wslha-admin) ترفض كل الطلبات
// بـ 401 لأن requireAdmin بـ routes/admin.js يعتمد على الجسر المشترك. متوقّع، مو خلل.
async function start(port = PORT) {
  await db.init(); // يهيّئ التخزين (MongoDB أو ملف محلي) ويحمّل البيانات
  await seedDefaults(); // يضيف الجولات الافتراضية فقط لو ما فيه أي جولات

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: ALLOWED_ORIGIN } });
  registerSocket(io);

  // تنظيف دوري للغرف المهجورة (كل لاعبيها غير متصلين لمدة طويلة) — يمنع تراكمها بالذاكرة للأبد.
  const roomSweepTimer = setInterval(sweepAbandonedRooms, 5 * 60 * 1000);
  if (roomSweepTimer.unref) roomSweepTimer.unref();
  server.on('close', () => clearInterval(roomSweepTimer));

  server.listen(port, () => {
    console.log('Team Quest server running on http://localhost:' + server.address().port);
  });

  server.io = io;
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('فشل بدء السيرفر:', err);
    process.exit(1);
  });
}

module.exports = { createApp, start, ALLOWED_ORIGIN };
