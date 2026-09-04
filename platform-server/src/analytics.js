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

function load() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('تعذّر قراءة سجل التحليلات، بدأنا من جديد:', e.message);
  }
  return { days: {} };
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

function track(event) {
  if (!EVENTS.includes(event)) return;
  const key = todayKey();
  if (useMongo()) {
    getModel().updateOne({ _id: key }, { $inc: { [event]: 1 } }, { upsert: true })
      .catch((e) => console.error('تعذّر تسجيل التحليلة بـMongoDB:', e.message));
    return;
  }
  if (!state.days[key]) state.days[key] = {};
  state.days[key][event] = (state.days[key][event] || 0) + 1;
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

module.exports = { track, getSummary, EVENTS };
