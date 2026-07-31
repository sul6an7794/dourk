const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { getActiveRoomsStats } = require('../rooms');
const { compressImage } = require('../images');
const { rateLimit } = require('../rateLimit');

const adminLimit = rateLimit(120, 60 * 1000, 'admin'); // 120 طلب بالدقيقة لكل IP — كافٍ للاستخدام العادي، يمنع إساءة الاستخدام
const uploadLimit = rateLimit(30, 5 * 60 * 1000, 'admin-upload'); // رفع الصور أثقل، حد أضيق له
// كل جولة تحتاج بالضبط صورة واحدة لكل لاعب بالفريق (TEAM_SIZE = 3 بـ rooms.js) — لا فائدة من صور زايدة.
const MAX_IMAGES_PER_ROUND = 3;

// تحقق هوية/إشراف عبر الجسر المشترك بدل استيراد auth.js مباشرة — auth.js صار ملك
// platform-server، ووصّلها ما يعتمد عليه إلا عبر global.__DOURK_PLATFORM__ (نفس نمط مافيا).
function requireAdmin(req, res, next) {
  const bridge = global.__DOURK_PLATFORM__ && global.__DOURK_PLATFORM__.auth;
  const user = bridge ? bridge.verifyFromCookieHeader(req.headers.cookie) : null;
  if (!user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (!user.isAdmin) return res.status(403).json({ error: 'هذه الصفحة للمشرفين فقط' });
  req.user = user;
  next();
}

router.use(adminLimit, requireAdmin);

function toApiRound(r) {
  return {
    id: r.id,
    hint: r.hint,
    answers: r.answers,
    question: r.question || '',
    hintPlayerIndex: r.hintPlayerIndex || 1,
    category: r.category || '',
    images: r.images,
  };
}

router.get('/rounds', (req, res) => {
  res.json(db.getRounds().map(toApiRound));
});

router.post('/rounds', async (req, res) => {
  const { hint, answers, hintPlayerIndex, category, question } = req.body || {};
  // الإجابة إجبارية (إجابة واحدة على الأقل). التلميح اختياري، وإذا تُرك فاضي فلا تلميح لهذي الجولة.
  const list = String(answers || '')
    .split('،')
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) {
    return res.status(400).json({ error: 'الإجابة مطلوبة (إجابة واحدة على الأقل)' });
  }
  const round = await db.insertRound({
    hint: String(hint || '').trim(),
    answers: list,
    hintPlayerIndex,
    category: String(category || '').trim(),
    question: String(question || '').trim(),
  });
  res.json(toApiRound(round));
});

// تعديل جولة موجودة — تعديل جزئي: أي حقل يُترك بلا إرسال يبقى كما هو.
router.patch('/rounds/:id', async (req, res) => {
  const round = db.getRound(req.params.id);
  if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
  const { category, hint, question, answers } = req.body || {};
  const fields = {};
  if (category !== undefined) fields.category = category;
  if (hint !== undefined) fields.hint = hint;
  if (question !== undefined) fields.question = question;
  if (answers !== undefined) {
    const list = String(answers || '').split('،').join(',').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return res.status(400).json({ error: 'الإجابة مطلوبة (إجابة واحدة على الأقل)' });
    fields.answers = list;
  }
  const updated = await db.updateRound(req.params.id, fields);
  res.json(toApiRound(updated));
});

router.delete('/rounds/:id', async (req, res) => {
  await db.deleteRound(req.params.id);
  res.json({ ok: true });
});

// نقل جولة لأعلى/لأسفل في ترتيب اللعب — يبدّل موقعها مع الجولة المجاورة فقط.
router.patch('/rounds/:id/move', async (req, res) => {
  const { direction } = req.body || {};
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'اتجاه غير صالح' });
  const rounds = await db.moveRound(req.params.id, direction);
  if (!rounds) return res.status(400).json({ error: 'تعذّر نقل الجولة (ربما بالطرف بالفعل)' });
  res.json(rounds.map(toApiRound));
});

// نخزّن الصورة في الذاكرة ثم نكتبها عبر طبقة التخزين (MongoDB أو ملف محلي).
// الحد 12MB لكل صورة حتى تبقى ضمن حد مستند MongoDB (16MB).
// أمان: نقبل صورًا فقط (نمنع رفع ملفات قد تُخدَّم كـ HTML/سكربت).
// SVG مرفوض صراحة: قد يحتوي <script> ينفّذ فعليًا لو فُتح رابط الصورة مباشرة أو ضمن iframe/object.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // بعض المتصفحات (خصوصًا بويندوز) ما تتعرّف على نوع HEIC/HEIF فتبلّغ عنه بصيغة عامة
    // (application/octet-stream) بدل image/heic — نقبله بامتداد الملف بدل الاعتماد على
    // الترويسة وحدها، بما إن compressImage صار يدعم تحويله فعليًا.
    const isHeicExt = /\.(heic|heif)$/i.test(file.originalname || '');
    if ((/^image\//.test(file.mimetype) && file.mimetype !== 'image/svg+xml') || isHeicExt) cb(null, true);
    else cb(new Error('يُسمح بالصور فقط (SVG غير مسموح لأسباب أمنية)'));
  },
});

router.post('/rounds/:id/images', uploadLimit, (req, res) => {
  upload.array('images', 12)(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'حجم الصورة كبير جدًا (الحد الأقصى 12MB لكل صورة)'
          : 'فشل رفع الصور: ' + (err.message || 'خطأ غير معروف');
      return res.status(400).json({ error: msg });
    }
    try {
      const roundId = req.params.id;
      const round = db.getRound(roundId);
      if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
      // كل جولة تحتاج بالضبط صورة واحدة لكل لاعب بالفريق (٣ لاعبين) — لا فائدة من صور زايدة.
      if ((round.images || []).length + (req.files || []).length > MAX_IMAGES_PER_ROUND) {
        return res.status(400).json({ error: 'الحد الأقصى ' + MAX_IMAGES_PER_ROUND + ' صور لكل جولة (صورة لكل لاعب)' });
      }
      for (const f of req.files || []) {
        // نضغط الصورة (تصغير + JPEG)؛ لو تعذّر نخزّن الأصل كما هو.
        let buf = f.buffer;
        let contentType = f.mimetype || 'image/jpeg';
        let ext = path.extname(f.originalname) || '.jpg';
        const compressed = await compressImage(f.buffer);
        if (compressed) {
          buf = compressed.buffer;
          contentType = compressed.contentType;
          ext = compressed.ext;
        }
        const filename = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        const key = 'rounds/' + roundId + '/' + filename;
        await db.saveImage(key, buf, contentType);
        // مسار نسبي (بدون اسم النطاق) — يشتغل بأي نطاق يخدم الموقع، حتى لو تغيّر لاحقًا
        // (خزّناه سابقًا مطلقًا وسبّب انكسار كل صور الجولات القديمة عند تغيير النطاق).
        const url = '/img/' + key;
        await db.insertRoundImage(roundId, { filename, url });
      }
      res.json(toApiRound(db.getRound(roundId)));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خطأ غير متوقع أثناء حفظ الصور' });
    }
  });
});

// تغيير أي لاعب يستلم صورة معيّنة (1 = أول لاعب، 2 = ثاني لاعب، ...). الافتراضي تلقائي بحسب ترتيب الرفع.
router.patch('/rounds/:id/images/:imageId', async (req, res) => {
  const round = db.getRound(req.params.id);
  if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
  const { playerIndex } = req.body || {};
  await db.setImagePosition(req.params.id, req.params.imageId, playerIndex);
  res.json(toApiRound(db.getRound(req.params.id)));
});

// حذف صورة واحدة من الجولة (بدل حذف الجولة كاملة لتصحيح صورة واحدة بالغلط).
router.delete('/rounds/:id/images/:imageId', async (req, res) => {
  const round = db.getRound(req.params.id);
  if (!round) return res.status(404).json({ error: 'الجولة غير موجودة' });
  await db.deleteRoundImage(req.params.id, req.params.imageId);
  res.json(toApiRound(db.getRound(req.params.id)));
});

router.get('/stats', (req, res) => {
  const live = getActiveRoomsStats();
  res.json({
    activeRooms: live.activeRooms,
    totalPlayers: live.totalPlayers,
    rounds: db.getRoundsCount(),
  });
});

module.exports = router;
