const fs = require('fs');
const path = require('path');

// عدّادات زيارات وقمع تحويل مجمّعة فقط (أرقام يومية بلا أي ربط بهوية شخص أو كوكي تتبع) —
// نفس فلسفة سجل الأخطاء (error-log.js): داخلي بالكامل، بدون خدمة تحليلات خارجية.
// تخزين مزدوج (نفس نمط db.js بالضبط): MongoDB لو MONGODB_URI مضبوط (ينجو من إعادة النشر)،
// وإلا ملف محلي (يُمسح بكل نشر — يكفي للتطوير المحلي والاختبارات الآلية فقط).
const DATA_PATH = process.env.ANALYTICS_DATA_PATH || path.join(__dirname, '..', 'data', 'analytics.json');

// خطوات القمع الأساسية: من زيارة الصفحة الرئيسية إلى بدء لعبة فعلية.
const EVENTS = ['page_view', 'otp_requested', 'signup_completed', 'room_created', 'game_started'];

let state = load();
let saveTimer = null;
let AnalyticsDay = null;
let AnalyticsSource = null;

function useMongo() {
  return !!process.env.MONGODB_URI;
}

function getModel() {
  if (!AnalyticsDay) {
    const mongoose = require('mongoose');
    const schema = new mongoose.Schema({ _id: String }, { strict: false, versionKey: false });
    AnalyticsDay = mongoose.model('m_analytics_days', schema, 'analytics_days');
  }
  return AnalyticsDay;
}

// وثيقة واحدة لكل مصدر تسويقي (_id = المصدر نفسه بعد التنظيف)، وبداخلها عدّاد يومي متداخل
// بنفس شكل m_analytics_days — يسمح نعرف "أي مصدر (تيك توك/حملة معيّنة) جاب زوار تحوّلوا
// فعليًا للعب" بدل الاكتفاء بأرقام إجمالية بلا مصدر.
function getSourceModel() {
  if (!AnalyticsSource) {
    const mongoose = require('mongoose');
    const schema = new mongoose.Schema({ _id: String }, { strict: false, versionKey: false });
    AnalyticsSource = mongoose.model('m_analytics_sources', schema, 'analytics_sources');
  }
  return AnalyticsSource;
}

function load() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('تعذّر قراءة سجل التحليلات، بدأنا من جديد:', e.message);
  }
  return { days: {}, sources: {} };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('تعذّر حفظ سجل التحليلات:', e.message);
  }
}

// تأجيل الحفظ الفعلي بالملف بضع ثواني — يمنع كتابة الملف كامل بكل حدث لو صارت دفعة
// أحداث متقاربة (أرقام تقريبية بطبيعتها، ما تحتاج دقة "فورًا على القرص").
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// مصدر تسويقي (utm_source أو "utm_source:utm_campaign") قادم من رابط خارجي — غير موثوق
// بالكامل (أي حد يقدر يحط أي قيمة براوت العنوان)، فننظّفه بشدة قبل ما يصير _id بـMongoDB
// أو مفتاح كائن بالذاكرة: أحرف/أرقام/شرطات فقط، طول محدود.
function sanitizeSource(raw) {
  if (!raw) return null;
  const clean = String(raw).toLowerCase().replace(/[^a-z0-9_:-]/g, '').slice(0, 40);
  return clean || null;
}

function track(event, source) {
  if (!EVENTS.includes(event)) return;
  const key = todayKey();
  if (useMongo()) {
    getModel().updateOne({ _id: key }, { $inc: { [event]: 1 } }, { upsert: true })
      .catch((e) => console.error('تعذّر تسجيل التحليلة بـMongoDB:', e.message));
  } else {
    if (!state.days[key]) state.days[key] = {};
    state.days[key][event] = (state.days[key][event] || 0) + 1;
    scheduleSave();
  }

  const src = sanitizeSource(source);
  if (!src) return;
  if (useMongo()) {
    getSourceModel().updateOne({ _id: src }, { $inc: { [`${key}.${event}`]: 1 } }, { upsert: true })
      .catch((e) => console.error('تعذّر تسجيل مصدر التحليلة بـMongoDB:', e.message));
    return;
  }
  if (!state.sources) state.sources = {};
  if (!state.sources[src]) state.sources[src] = {};
  if (!state.sources[src][key]) state.sources[src][key] = {};
  state.sources[src][key][event] = (state.sources[src][key][event] || 0) + 1;
  scheduleSave();
}

function dayKeys(days) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// آخر N يوم (بترتيب الأحدث أولًا)، كل الأحداث معبّأة بصفر لو ما صار شي بذاك اليوم —
// يسهّل عرضها كجدول/رسم بياني بدون فحص "موجود أو لا" بكل خلية.
async function getSummary(days = 14) {
  const keys = dayKeys(days);
  if (useMongo()) {
    const docs = await getModel().find({ _id: { $in: keys } }).lean();
    const byKey = Object.fromEntries(docs.map((d) => [d._id, d]));
    return keys.map((key) => Object.assign({ date: key }, Object.fromEntries(EVENTS.map((e) => [e, (byKey[key] && byKey[key][e]) || 0]))));
  }
  return keys.map((key) => {
    const dayData = state.days[key] || {};
    return Object.assign({ date: key }, Object.fromEntries(EVENTS.map((e) => [e, dayData[e] || 0])));
  });
}

// إجمالي كل مصدر عبر آخر N يوم، مرتب تنازليًا حسب الحسابات المكتملة (أهم مؤشر تحويل حقيقي
// لا مجرد مشاهدات) — يفيد يقارن أداء رابط تيك توك/حملة مقابل غيرها بسرعة.
async function getSourceSummary(days = 14) {
  const keys = dayKeys(days);
  const sumDays = (dayMap) => {
    const totals = Object.fromEntries(EVENTS.map((e) => [e, 0]));
    for (const key of keys) {
      const day = dayMap[key];
      if (!day) continue;
      for (const e of EVENTS) totals[e] += day[e] || 0;
    }
    return totals;
  };
  let rows;
  if (useMongo()) {
    const docs = await getSourceModel().find({}).lean();
    rows = docs.map((d) => Object.assign({ source: d._id }, sumDays(d)));
  } else {
    const sources = state.sources || {};
    rows = Object.keys(sources).map((src) => Object.assign({ source: src }, sumDays(sources[src])));
  }
  return rows
    .filter((r) => EVENTS.some((e) => r[e] > 0))
    .sort((a, b) => b.signup_completed - a.signup_completed || b.page_view - a.page_view);
}

module.exports = { track, getSummary, getSourceSummary, EVENTS };
