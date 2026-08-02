const fs = require('fs');
const path = require('path');

// تخزين حسابات المنصة (مستخدمين + سجل تدقيق التذاكر) فقط — مستقل تمامًا عن أي لعبة، حتى
// لو انحذفت لعبة وصّلها أو مافيا لاحقًا يبقى هذا شغّال. محتوى الألعاب (جولات/صور وصّلها) له
// قاعدته الخاصة جوا مجلد وصّلها نفسه.
// الحالة تُحفظ بالذاكرة للقراءة المتزامنة السريعة، والكتابة تتم بشكل ذري لكل مستند.
// يقبل مسار بديل عبر متغيّر بيئة (تستخدمه الاختبارات الآلية حتى لا تلمس ملف البيانات الحقيقي).
const DATA_PATH = process.env.ACCOUNTS_DATA_PATH || path.join(__dirname, '..', 'data', 'accounts.json');
const STARTING_CREDITS = 1; // رصيد البداية لكل حساب جديد: تذكرة مجانية واحدة

function defaultState() {
  return {
    users: [],
    credit_log: [], // سجل تدقيق لكل تغيير برصيد التذاكر (لمين، كم، ليش) — انظر logCredit/getCreditLog
    nextIds: { users: 1, credit_log: 1 },
  };
}
let state = defaultState();
let backend = null;

// ---------- Backend: ملف محلي (عملية واحدة، لا تزامن — حفظ الملف كامل بسيط وآمن) ----------
const fileBackend = {
  async connect() {},
  async loadAll() {
    if (fs.existsSync(DATA_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      } catch (e) {
        /* ملف تالف — نبدأ من جديد */
      }
    }
    return null;
  },
  _save() {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
  },
  async nextId(kind) {
    const id = state.nextIds[kind] || 1;
    state.nextIds[kind] = id + 1;
    return id;
  },
  async putUser() { this._save(); },
  async delUser() { this._save(); },
  async putCreditLog() { this._save(); },
};

// ---------- Backend: MongoDB (مجموعات مستقلة + عدّاد ذري + ترحيل آمن) ----------
function makeMongoBackend(uri) {
  const mongoose = require('mongoose');
  // فهرس فريد على phone (تسجيل الدخول بالجوال).
  const userSchema = new mongoose.Schema({ _id: Number }, { strict: false, versionKey: false, id: false });
  userSchema.index({ phone: 1 }, { unique: true, sparse: true });
  const User = mongoose.model('m_users', userSchema, 'users');
  const CreditLog = mongoose.model('m_credit_log', new mongoose.Schema({ _id: Number }, { strict: false, versionKey: false, id: false }), 'credit_log');
  // نفس اسم مجموعة counters المستخدم بقاعدة محتوى وصّلها — آمن، مفاتيح العدّاد ('users'/'credit_log'
  // مقابل 'rounds'/'round_images') ما تتصادم أبدًا حتى لو الوحدتان تتصلان بنفس القاعدة.
  const Counter = mongoose.model('m_counters', new mongoose.Schema({ _id: String, seq: Number }, { versionKey: false }), 'counters');
  const Legacy = mongoose.model('m_appstate', new mongoose.Schema({ _id: String, json: String }, { versionKey: false }), 'appstate');

  const clean = (arr) => arr.map((d) => { const o = Object.assign({}, d); delete o._id; return o; });

  return {
    async connect() {
      // حارس: قاعدة محتوى وصّلها ممكن تكون فتحت نفس الاتصال أصلًا بنفس العملية — تجنّب فتح اتصال مزدوج.
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      }
    },
    async loadAll() {
      // ترحيل لمرة واحدة: لو مجموعة users فاضية والنسخة القديمة (appstate) موجودة → استوردها.
      const count = await User.estimatedDocumentCount();
      if (count === 0) {
        const legacy = await Legacy.findById('state').lean();
        if (legacy && legacy.json) {
          try {
            const s = JSON.parse(legacy.json);
            if (Array.isArray(s.users) && s.users.length)
              await User.insertMany(s.users.map((u) => Object.assign({}, u, { _id: u.id })), { ordered: false }).catch(() => {});
            const ni = s.nextIds || {};
            await Counter.updateOne({ _id: 'users' }, { $set: { seq: Math.max(0, (ni.users || 1) - 1) } }, { upsert: true });
            console.log('✅ تم ترحيل بيانات الحسابات القديمة للتصميم الجديد (النسخة القديمة محفوظة كنسخة احتياطية).');
          } catch (e) {
            console.error('تنبيه: فشل ترحيل بيانات الحسابات القديمة:', e.message);
          }
        }
      }
      const [users, counters, creditLog] = await Promise.all([
        User.find().lean(), Counter.find().lean(), CreditLog.find().lean(),
      ]);
      const nextIds = { users: 1, credit_log: 1 };
      for (const c of counters) nextIds[c._id] = (c.seq || 0) + 1;
      return { users: clean(users), credit_log: clean(creditLog), nextIds };
    },
    async nextId(kind) {
      const r = await Counter.findOneAndUpdate({ _id: kind }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return r.seq;
    },
    async putUser(u) { await User.updateOne({ _id: u.id }, { $set: u }, { upsert: true }); },
    async delUser(id) { await User.deleteOne({ _id: id }); },
    async putCreditLog(entry) { await CreditLog.updateOne({ _id: entry.id }, { $set: entry }, { upsert: true }); },
  };
}

// ---------- التهيئة ----------
async function init() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    backend = makeMongoBackend(uri);
    await backend.connect();
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('تخزين الحسابات: MongoDB (مجموعات مستقلة، دائم) ✅');
  } else {
    // بدون MONGODB_URI، التخزين ملف محلي على قرص الحاوية — لا ينجو من إعادة نشر عادية على
    // استضافة بحاويات مؤقتة (Render وغيرها). قبول هذا صامتًا بالإنتاج يعني احتمال ضياع كل
    // الحسابات والأرصدة بصمت تام عند أول نشر جديد (خطأ إملائي بمتغيّر البيئة، أو نسيان
    // ضبطه أصلًا) — بلا أي خطأ إقلاع يلفت الانتباه. نوقف الإقلاع صراحة بدل تحذير سهل التفويت،
    // مع مخرج صريح (ALLOW_LOCAL_ACCOUNTS_STORAGE=1) لو التخزين المحلي مقصود فعلاً (قرص دائم مثلًا).
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_ACCOUNTS_STORAGE !== '1') {
      throw new Error(
        'MONGODB_URI غير مضبوط بالإنتاج — التخزين المحلي (accounts.json) لا ينجو من إعادة النشر ' +
        'ويعني خطر ضياع كل الحسابات والأرصدة بصمت. اضبط MONGODB_URI، أو مرّر ' +
        'ALLOW_LOCAL_ACCOUNTS_STORAGE=1 صراحة لو التخزين المحلي مقصود فعلاً.'
      );
    }
    backend = fileBackend;
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('تخزين الحسابات: ملف accounts.json محلي (مؤقت) — اضبط MONGODB_URI للتخزين الدائم.');
  }
  // ترحيل لتسجيل الدخول برقم الجوال: أي حساب قديم بدون phone (نظام اسم المستخدم/كلمة المرور
  // القديم) يُحذف تلقائيًا — لا يوجد مسار ربط/ترحيل، القرار كان حذف الحسابات القديمة.
  const legacy = state.users.filter((u) => !u.phone);
  for (const u of legacy) {
    state.users = state.users.filter((x) => x.id !== u.id);
    await backend.delUser(u.id).catch(() => {});
  }
  if (legacy.length) console.log(`تم حذف ${legacy.length} حساب قديم (بدون رقم جوال) عند بدء التشغيل.`);

  // ترقية: ضمان وجود حقل الرصيد للحسابات القديمة
  for (const u of state.users) {
    if (typeof u.credits !== 'number') { u.credits = STARTING_CREDITS; await backend.putUser(u).catch(() => {}); }
  }
  // ترقية: بيانات قديمة من قبل إضافة سجل تدقيق التذاكر ما فيها الحقل أصلًا
  if (!Array.isArray(state.credit_log)) state.credit_log = [];
  if (!state.nextIds) state.nextIds = {};
  if (!state.nextIds.credit_log) state.nextIds.credit_log = 1;
}

// ---- المستخدمون ---- (قراءة متزامنة من الذاكرة، كتابة ذرية للمستند)
function getUserByUsername(username) { return state.users.find((u) => u.username === username) || null; }
function getUserByPhone(phone) { return state.users.find((u) => u.phone === phone) || null; }
function getUserById(id) { return state.users.find((u) => u.id === Number(id)) || null; }
function getUsersCount() { return state.users.length; }
// عدد المستخدمين اللي انضموا برابط دعوة هذا المستخدم — يُعرض بصفحة الحساب.
function getReferredCount(userId) { return state.users.filter((u) => u.referred_by === Number(userId)).length; }
function getAllUsers() {
  return state.users
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((u) => ({ id: u.id, username: u.username, phone: u.phone || '', isAdmin: !!u.is_admin, credits: u.credits || 0, created_at: u.created_at }));
}
// سجل تدقيق التذاكر: كل تغيير برصيد أي مستخدم (ليش، كم، والرصيد بعده) — عشان لو مستخدم
// سأل "ليش انخصمت مني تذكرة" يكون فيه جواب فعلي بدل رقم رصيد خام بدون تاريخ.
// adminId: هوية المشرف اللي نفّذ التغيير فعليًا (لو صادر من لوحة تحكم، مو من النظام نفسه
// كمكافأة تسجيل جديد مثلًا) — بدونه، نزاع "مين صفّر رصيد هذا المستخدم" غير قابل للحل لو فيه
// أكثر من مشرف واحد؛ السجل كان يوثّق "مشرف ما، بوقت ما" فقط بلا هوية فعلية.
async function logCredit(userId, delta, reason, balanceAfter, adminId) {
  const id = await backend.nextId('credit_log');
  const entry = { id, userId: Number(userId), delta, reason: reason || null, balanceAfter, adminId: adminId != null ? Number(adminId) : null, at: new Date().toISOString() };
  state.credit_log.push(entry);
  await backend.putCreditLog(entry);
  return entry;
}
function getCreditLog(userId, limit = 50) {
  return state.credit_log
    .filter((e) => e.userId === Number(userId))
    .slice(-limit)
    .reverse();
}
async function insertUser({ username, phone, is_admin, referred_by }) {
  const id = await backend.nextId('users');
  const user = { id, username, phone, is_admin: is_admin ? 1 : 0, credits: STARTING_CREDITS, referred_by: referred_by != null ? Number(referred_by) : null, created_at: new Date().toISOString() };
  state.users.push(user);
  await backend.putUser(user);
  await logCredit(id, STARTING_CREDITS, 'signup-bonus', STARTING_CREDITS);
  return user;
}
async function updateUserFields(id, fields) {
  const u = getUserById(id);
  if (!u) return null;
  if (fields.username) u.username = fields.username;
  if (fields.phone) u.phone = fields.phone;
  await backend.putUser(u);
  return u;
}
async function addCredits(id, delta, reason) {
  const u = getUserById(id);
  if (!u) return null;
  u.credits = Math.max(0, (u.credits || 0) + delta);
  await logCredit(id, delta, reason, u.credits);
  await backend.putUser(u);
  return u.credits;
}
async function setUserAdmin(id, isAdmin) {
  const u = getUserById(id);
  if (!u) return null;
  u.is_admin = isAdmin ? 1 : 0;
  await backend.putUser(u);
  return u;
}
async function setUserCredits(id, credits, reason, adminId) {
  const u = getUserById(id);
  if (!u) return null;
  const n = Math.floor(Number(credits));
  const newCredits = Number.isFinite(n) && n >= 0 ? n : 0;
  const delta = newCredits - (u.credits || 0);
  u.credits = newCredits;
  if (delta !== 0) await logCredit(id, delta, reason || 'admin-set', u.credits, adminId);
  await backend.putUser(u);
  return u;
}
async function deleteUser(id) {
  const rid = Number(id);
  const before = state.users.length;
  state.users = state.users.filter((u) => u.id !== rid);
  const changed = state.users.length !== before;
  if (changed) await backend.delUser(rid);
  return changed;
}

module.exports = {
  init,
  getUserByUsername,
  getUserByPhone,
  getUserById,
  getAllUsers,
  updateUserFields,
  addCredits,
  getCreditLog,
  setUserAdmin,
  setUserCredits,
  deleteUser,
  getUsersCount,
  getReferredCount,
  insertUser,
};
