const fs = require('fs');
const path = require('path');

// عدّادات زيارات وقمع تحويل مجمّعة فقط (أرقام يومية بلا أي ربط بهوية شخص أو كوكي تتبع) —
// نفس فلسفة سجل الأخطاء (error-log.js): داخلي بالكامل، بدون خدمة تحليلات خارجية.
const DATA_PATH = process.env.ANALYTICS_DATA_PATH || path.join(__dirname, '..', 'data', 'analytics.json');

// خطوات القمع الأساسية: من زيارة الصفحة الرئيسية إلى بدء لعبة فعلية.
const EVENTS = ['page_view', 'otp_requested', 'signup_completed', 'room_created', 'game_started'];

let state = load();
let saveTimer = null;

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
  if (!state.days[key]) state.days[key] = {};
  state.days[key][event] = (state.days[key][event] || 0) + 1;
  scheduleSave();
}

// آخر N يوم (بترتيب الأحدث أولًا)، كل الأحداث معبّأة بصفر لو ما صار شي بذاك اليوم —
// يسهّل عرضها كجدول/رسم بياني بدون فحص "موجود أو لا" بكل خلية.
function getSummary(days = 14) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayData = state.days[key] || {};
    out.push(Object.assign({ date: key }, Object.fromEntries(EVENTS.map((e) => [e, dayData[e] || 0]))));
  }
  return out;
}

module.exports = { track, getSummary, EVENTS };
