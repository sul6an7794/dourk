const fs = require('fs');
const path = require('path');
const geoip = require('geoip-lite');

// سجل آخر الزيارات (IP + دولة + تصنيف مبدئي: حقيقي/بوت/محاولة فحص) — لمساعدة المشرف
// يفهم مصدر الزوار بسرعة. نفس نمط analytics.js/stats.js: Mongo لو متاح (يبقى بعد النشر)
// وإلا ملف محلي. التصنيف استدلالي بحت (User-Agent + مسار الطلب + معدّل الطلبات) وليس
// دقيقًا 100% — زائر حقيقي وراء VPN/بروكسي قد يُصنَّف بالخطأ، والهدف مؤشر أولي للفحص
// اليدوي، لا حكم نهائي.
const DATA_PATH = process.env.VISITORS_DATA_PATH || path.join(__dirname, '..', 'data', 'visitors.json');
const MAX_ENTRIES = 500;

// مسارات شائعة في محاولات الفحص/الاختراق الآلي (سكانرات تبحث عن ثغرات معروفة بمواقع
// ووردبريس/PHP قديمة — موقعنا Node بحت فما عنده أي من هالمسارات أصلًا، فطلبها مؤشر فحص).
const PROBE_PATH_RE = /\.(env|git|php)|wp-admin|wp-login|wp-content|xmlrpc\.php|\.\.\/|\/etc\/passwd|<script|union(\s|%20)+select|\/vendor\/|phpmyadmin|\.aws\/credentials/i;
const BOT_UA_RE = /bot|crawler|spider|curl\/|wget|python-requests|scrapy|headlesschrome|phantomjs|go-http-client|libwww-perl|bingpreview|facebookexternalhit/i;

let state = load();
let saveTimer = null;
let VisitLog = null;

// نافذة معدّل بسيطة بالذاكرة لكل IP — كثرة الطلبات بوقت قصير من نفس العنوان مؤشر فحص
// آلي حتى لو الـUser-Agent شكله طبيعي.
const RATE_WINDOW_MS = 10 * 1000;
const RATE_THRESHOLD = 15;
const rateBuckets = new Map();
function isRapid(ip) {
  const now = Date.now();
  let rec = rateBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, rec);
  }
  rec.count += 1;
  return rec.count > RATE_THRESHOLD;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
}, 60 * 1000).unref?.();

function useMongo() {
  return !!process.env.MONGODB_URI;
}

function getModel() {
  if (!VisitLog) {
    const mongoose = require('mongoose');
    const schema = new mongoose.Schema({ _id: String, entries: { type: [Object], default: [] } }, { strict: false, versionKey: false });
    VisitLog = mongoose.model('m_visitors_log', schema, 'visitors_log');
  }
  return VisitLog;
}

function load() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('تعذّر قراءة سجل الزوار، بدأنا من جديد:', e.message);
  }
  return { entries: [] };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('تعذّر حفظ سجل الزوار:', e.message);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

function classify({ ip, userAgent, path: reqPath, rapid }) {
  if (PROBE_PATH_RE.test(reqPath)) return { label: 'attack_probe', reason: 'مسار يشبه محاولة فحص/اختراق آلي' };
  if (BOT_UA_RE.test(userAgent || '')) return { label: 'bot', reason: 'وكيل مستخدم يعرّف نفسه كبوت/أداة آلية' };
  if (rapid) return { label: 'rapid_requests', reason: 'عدد طلبات كبير خلال ثوانٍ من نفس العنوان' };
  if (!userAgent) return { label: 'suspicious', reason: 'بدون وكيل مستخدم إطلاقًا' };
  return { label: 'real', reason: null };
}

function countryOf(ip) {
  try {
    const g = geoip.lookup(ip);
    return (g && g.country) || null;
  } catch (e) {
    return null;
  }
}

// الموقع خلف Cloudflare (مؤكد: ترويسة Server: cloudflare + CF-RAY بكل رد) — يعني req.ip
// (المعتمد بـrateLimit.js لأغراض أمنية) غالبًا يرجّع عنوان هوب وسيط لا عنوان الزائر
// الحقيقي، فتحديد الدولة عليه يفشل غالبًا. CF-Connecting-IP هي الترويسة اللي Cloudflare
// نفسه يضبطها بعنوان الزائر الحقيقي دائمًا لأي طلب فعليًا مرّ عبره. نستخدمها هنا فقط
// لغرض العرض/تصنيف استدلالي غير أمني (لا حظر تلقائي مبني عليها) — لو حد قدر يوصل
// للسيرفر مباشرة متجاوزًا Cloudflare لقدر يزوّرها، لكن هذا لا يؤثر إلا على دقة لوحة
// التحكم لا على أي قرار أمني فعلي (rateLimit.js يبقى يعتمد فقط على req.ip الموثوق).
// عناوين IP داخلية (شبكة Render نفسها بتفحص "هل السيرفر حي؟" بمسارات ما نعرفها/نتحكم فيها،
// أو أي بنية تحتية أخرى) — مو زوار حقيقيين أبدًا، وتصنيفها "حقيقي" بجدول الزوار مضلِّل.
// دفاع إضافي بعد استثناء /health و/api/health صراحة بـserver.js، لأي مسار داخلي مستقبلي
// ما فكرنا فيه.
const PRIVATE_IP_RE = /^(::ffff:)?(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)|^::1$/;

function recordVisit(req, reqPath) {
  const ip = req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown';
  if (PRIVATE_IP_RE.test(ip)) return;
  const userAgent = req.headers['user-agent'] || '';
  const rapid = isRapid(ip);
  const { label, reason } = classify({ ip, userAgent, path: reqPath, rapid });
  const entry = {
    at: new Date().toISOString(),
    ip,
    country: countryOf(ip),
    path: reqPath,
    userAgent: userAgent.slice(0, 200),
    label,
    reason,
  };
  if (useMongo()) {
    getModel().updateOne(
      { _id: 'log' },
      { $push: { entries: { $each: [entry], $position: 0, $slice: MAX_ENTRIES } } },
      { upsert: true }
    ).catch((e) => console.error('تعذّر تسجيل زيارة بـMongoDB:', e.message));
    return;
  }
  state.entries.unshift(entry);
  if (state.entries.length > MAX_ENTRIES) state.entries.length = MAX_ENTRIES;
  scheduleSave();
}

async function getVisitors(limit = 100) {
  const n = Math.max(1, Math.min(MAX_ENTRIES, limit));
  if (useMongo()) {
    const doc = await getModel().findById('log').lean();
    return ((doc && doc.entries) || []).slice(0, n);
  }
  return state.entries.slice(0, n);
}

module.exports = { recordVisit, getVisitors };
