const fs = require('fs');
const path = require('path');

// تخزين محتوى لعبة وصّلها فقط (جولات مصوّرة + صورها) — حسابات المستخدمين والتذاكر انتقلت
// بالكامل لـ platform-server (ملكها الآن)، مستقلة تمامًا عن هذا الملف.
// التخزين: الحالة تُحفظ في الذاكرة (state) للقراءة المتزامنة السريعة، والكتابة تتم
// بشكل **ذري لكل عنصر** (مستند مستقل لكل جولة/صورة) — فلا يوجد "حفظ للكل"
// يمكن أن يدوس على البيانات. يمنع فقدان البيانات نهائيًا.
// يقبل مسار بديل عبر متغيّر بيئة (تستخدمه الاختبارات الآلية حتى لا تلمس ملف البيانات الحقيقي).
const DATA_PATH = process.env.WSL_DATA_PATH || path.join(__dirname, '..', 'data.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function defaultState() {
  return {
    rounds: [], round_images: [],
    nextIds: { rounds: 1, round_images: 1 },
  };
}
let state = defaultState();
let backend = null;

function guessType(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[ext] ||
    'application/octet-stream'
  );
}
// أمان: يمنع path traversal — المسار الناتج يجب أن يبقى داخل مجلد uploads.
function safeUploadPath(key) {
  const full = path.resolve(UPLOADS_DIR, key);
  const root = path.resolve(UPLOADS_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

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
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
  },
  async nextId(kind) {
    const id = state.nextIds[kind] || 1;
    state.nextIds[kind] = id + 1;
    return id;
  },
  async putRound() { this._save(); },
  async delRound() { this._save(); },
  async putImageMeta() { this._save(); },
  async putImagesMeta() { this._save(); },
  async delImageMeta() { this._save(); },
  async delImagesMetaForRound() { this._save(); },
  async saveImage(key, buffer) {
    const full = safeUploadPath(key);
    if (!full) return;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  },
  async getImage(key) {
    const full = safeUploadPath(key);
    if (!full || !fs.existsSync(full)) return null;
    return { data: fs.readFileSync(full), contentType: guessType(key) };
  },
  async delImageFile(key) {
    const full = safeUploadPath(key);
    if (!full) return;
    try { fs.unlinkSync(full); } catch (e) {}
  },
  async delImagesFiles(prefix) {
    try { fs.rmSync(path.join(UPLOADS_DIR, prefix), { recursive: true, force: true }); } catch (e) {}
  },
};

// ---------- Backend: MongoDB (مجموعات مستقلة + عدّاد ذري + ترحيل آمن) ----------
function makeMongoBackend(uri) {
  const mongoose = require('mongoose');
  const flex = (coll) => mongoose.model('m_' + coll, new mongoose.Schema({ _id: Number }, { strict: false, versionKey: false, id: false }), coll);
  const Round = flex('rounds');
  const ImageMeta = flex('round_images');
  const Counter = mongoose.model('m_counters', new mongoose.Schema({ _id: String, seq: Number }, { versionKey: false }), 'counters');
  const ImageBlob = mongoose.model('m_images', new mongoose.Schema({ _id: String, contentType: String, data: Buffer }, { versionKey: false }), 'images');
  const Legacy = mongoose.model('m_appstate', new mongoose.Schema({ _id: String, json: String }, { versionKey: false }), 'appstate');

  const clean = (arr) => arr.map((d) => { const o = Object.assign({}, d); delete o._id; return o; });

  return {
    async connect() {
      // حارس: قاعدة حسابات المنصة ممكن تكون فتحت نفس الاتصال أصلًا بنفس العملية — تجنّب فتح اتصال مزدوج.
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      }
    },
    async loadAll() {
      // ترحيل لمرة واحدة: لو مجموعة rounds فاضية والنسخة القديمة (appstate) موجودة → استوردها.
      const count = await Round.estimatedDocumentCount();
      if (count === 0) {
        const legacy = await Legacy.findById('state').lean();
        if (legacy && legacy.json) {
          try {
            const s = JSON.parse(legacy.json);
            if (Array.isArray(s.rounds) && s.rounds.length)
              await Round.insertMany(s.rounds.map((r) => Object.assign({}, r, { _id: r.id })), { ordered: false }).catch(() => {});
            if (Array.isArray(s.round_images) && s.round_images.length)
              await ImageMeta.insertMany(s.round_images.map((i) => Object.assign({}, i, { _id: i.id })), { ordered: false }).catch(() => {});
            const ni = s.nextIds || {};
            for (const k of ['rounds', 'round_images'])
              await Counter.updateOne({ _id: k }, { $set: { seq: Math.max(0, (ni[k] || 1) - 1) } }, { upsert: true });
            console.log('✅ تم ترحيل بيانات جولات وصّلها القديمة للتصميم الجديد (النسخة القديمة محفوظة كنسخة احتياطية).');
          } catch (e) {
            console.error('تنبيه: فشل ترحيل بيانات الجولات القديمة:', e.message);
          }
        }
      }
      const [rounds, images, counters] = await Promise.all([
        Round.find().lean(), ImageMeta.find().lean(), Counter.find().lean(),
      ]);
      const nextIds = { rounds: 1, round_images: 1 };
      for (const c of counters) nextIds[c._id] = (c.seq || 0) + 1;
      return { rounds: clean(rounds), round_images: clean(images), nextIds };
    },
    async nextId(kind) {
      const r = await Counter.findOneAndUpdate({ _id: kind }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return r.seq;
    },
    async putRound(r) { await Round.updateOne({ _id: r.id }, { $set: r }, { upsert: true }); },
    async delRound(id) { await Round.deleteOne({ _id: id }); },
    async putImageMeta(i) { await ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true }); },
    async putImagesMeta(list) { await Promise.all(list.map((i) => ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true }))); },
    async delImageMeta(id) { await ImageMeta.deleteOne({ _id: id }); },
    async delImagesMetaForRound(rid) { await ImageMeta.deleteMany({ round_id: rid }); },
    async saveImage(key, buffer, contentType) {
      await ImageBlob.updateOne({ _id: key }, { $set: { contentType: contentType || guessType(key), data: buffer } }, { upsert: true });
    },
    async getImage(key) {
      const d = await ImageBlob.findById(key).lean();
      if (!d) return null;
      const data = Buffer.isBuffer(d.data) ? d.data : Buffer.from(d.data.buffer || d.data);
      return { data, contentType: d.contentType };
    },
    async delImageFile(key) { await ImageBlob.deleteOne({ _id: key }); },
    async delImagesFiles(prefix) {
      const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await ImageBlob.deleteMany({ _id: new RegExp('^' + esc) });
    },
    // استرجاع يدوي من النسخة القديمة (appstate) — upsert آمن (لا يكرّر)، ويرجّع تقريرًا.
    async recoverFromLegacy() {
      const legacy = await Legacy.findById('state').lean();
      if (!legacy || !legacy.json) return { legacyFound: false, rounds: 0, images: 0 };
      const s = JSON.parse(legacy.json);
      const report = {
        legacyFound: true,
        rounds: (s.rounds || []).length,
        images: (s.round_images || []).length,
      };
      for (const r of s.rounds || []) await Round.updateOne({ _id: r.id }, { $set: r }, { upsert: true });
      for (const i of s.round_images || []) await ImageMeta.updateOne({ _id: i.id }, { $set: i }, { upsert: true });
      const maxId = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
      for (const [k, arr] of [['rounds', s.rounds || []], ['round_images', s.round_images || []]]) {
        const cur = await Counter.findById(k).lean();
        const want = Math.max(maxId(arr), (s.nextIds || {})[k] ? (s.nextIds[k] - 1) : 0, cur ? cur.seq : 0);
        await Counter.updateOne({ _id: k }, { $set: { seq: want } }, { upsert: true });
      }
      return report;
    },
  };
}

// روابط الصور كانت تُخزَّن كاملة (مع اسم النطاق وقت الرفع) — أي تغيير نطاق لاحقًا (زي
// التحويل من دومين لآخر) يكسر كل صور الجولات القديمة فورًا لأنها تفضل تشاور على
// النطاق القديم الميت (بالإدارة وأثناء اللعب الفعلي، لأن نفس الرابط يُرسَل للاعبين).
// نحوّلها لمسار نسبي مرة وحدة عند التشغيل حتى تشتغل بأي نطاق مستقبلًا.
async function migrateAbsoluteImageUrls() {
  const abs = state.round_images.filter((i) => /^https?:\/\//.test(i.url || ''));
  if (!abs.length) return;
  for (const img of abs) {
    img.url = img.url.replace(/^https?:\/\/[^/]+/, '');
  }
  await backend.putImagesMeta(abs);
  console.log('تم تحويل ' + abs.length + ' رابط صورة من مطلق إلى نسبي (توافق مع تغيير النطاق).');
}

// ---------- التهيئة ----------
async function init() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    backend = makeMongoBackend(uri);
    await backend.connect();
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('تخزين محتوى وصّلها: MongoDB (مجموعات مستقلة، دائم) ✅');
  } else {
    backend = fileBackend;
    const loaded = await backend.loadAll();
    state = loaded || defaultState();
    console.log('تخزين محتوى وصّلها: ملف data.json محلي (مؤقت) — اضبط MONGODB_URI للتخزين الدائم.');
  }
  await migrateAbsoluteImageUrls();
}

// ---- استرجاع البيانات القديمة من النسخة الاحتياطية (appstate) ----
async function recoverFromLegacy() {
  const hasMongoUri = !!process.env.MONGODB_URI;
  const uriLen = (process.env.MONGODB_URI || '').length;
  if (!backend || !backend.recoverFromLegacy) {
    return { storage: 'file (مؤقت!)', hasMongoUri, uriLen, note: 'السيرفر لا يستخدم MongoDB — تحقق من متغيّر MONGODB_URI في Render' };
  }
  const report = await backend.recoverFromLegacy();
  const loaded = await backend.loadAll();
  if (loaded) state = loaded; // تحديث الذاكرة بالبيانات المستعادة
  report.storage = 'mongodb';
  report.hasMongoUri = hasMongoUri;
  report.nowRounds = state.rounds.length;
  return report;
}

// ---- تخزين/جلب الصور ----
function saveImage(key, buffer, contentType) { return backend.saveImage(key, buffer, contentType); }
function getImage(key) { return backend.getImage(key); }

// ---- الصور المرتبطة بجولة ----
function getRoundImages(roundId) {
  return state.round_images
    .filter((i) => i.round_id === Number(roundId))
    .sort((a, b) => (a.position || a.id) - (b.position || b.id))
    .map((i, idx) => ({ id: i.id, url: i.url, playerIndex: i.position || idx + 1 }));
}
async function insertRoundImage(roundId, { filename, url }) {
  const rid = Number(roundId);
  const count = state.round_images.filter((i) => i.round_id === rid).length;
  const id = await backend.nextId('round_images');
  const img = { id, round_id: rid, filename, url, position: count + 1, created_at: new Date().toISOString() };
  state.round_images.push(img);
  await backend.putImageMeta(img);
  return img;
}
async function setImagePosition(roundId, imageId, newPosition) {
  const rid = Number(roundId);
  const list = state.round_images.filter((i) => i.round_id === rid).sort((a, b) => (a.position || a.id) - (b.position || b.id));
  const target = list.find((i) => i.id === Number(imageId));
  if (!target) return;
  const rest = list.filter((i) => i.id !== target.id);
  let pos = Math.floor(Number(newPosition));
  if (!Number.isFinite(pos) || pos < 1) pos = 1;
  if (pos > rest.length + 1) pos = rest.length + 1;
  rest.splice(pos - 1, 0, target);
  rest.forEach((img, i) => { img.position = i + 1; });
  await backend.putImagesMeta(rest);
}

// ---- الجولات ----
// ترتيب العرض/اللعب: حسب position (يحدده المشرف بأزرار النقل)، وللجولات القديمة قبل
// وجود الحقل نرجع لترتيب الإنشاء (id) — نفس فكرة position||id المستخدمة بصور الجولة.
function getRounds() {
  return state.rounds
    .slice()
    .sort((a, b) => (a.position || a.id) - (b.position || b.id))
    .map((r) => ({ ...r, images: getRoundImages(r.id) }));
}
function getRound(id) {
  const r = state.rounds.find((x) => x.id === Number(id));
  if (!r) return null;
  return { ...r, images: getRoundImages(r.id) };
}
function getRoundsCount() { return state.rounds.length; }
async function insertRound({ hint, answers, hintPlayerIndex, category, question, showLetters }) {
  const idx = Number(hintPlayerIndex);
  const id = await backend.nextId('rounds');
  const maxPos = state.rounds.reduce((m, r) => Math.max(m, r.position || r.id || 0), 0);
  const round = {
    id,
    hint,
    answers,
    hintPlayerIndex: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 1,
    category: String(category || '').trim(),
    question: String(question || '').trim(),
    // يظهر حرف (A/B/C) بزاوية صورة كل لاعب حسب ترتيبه بالفريق — يفيد جولات "الاختلاف" اللي
    // الجواب فيها "مين عنده الصورة المختلفة" بدل وصف محتواها. اختياري، مو كل الجولات تحتاجه.
    showLetters: !!showLetters,
    position: maxPos + 1,
    created_at: new Date().toISOString(),
  };
  state.rounds.push(round);
  await backend.putRound(round);
  return { ...round, images: [] };
}
// نقل جولة لأعلى/لأسفل بترتيب العرض — تبديل موقعها مع الجولة المجاورة فقط (بدل حقل ترتيب كامل)،
// نفس فكرة setImagePosition لكن بمقايضة بسيطة (لا حاجة لنقل لموقع عشوائي هنا).
async function moveRound(id, direction) {
  const rid = Number(id);
  const list = state.rounds.slice().sort((a, b) => (a.position || a.id) - (b.position || b.id));
  const idx = list.findIndex((r) => r.id === rid);
  if (idx === -1) return null;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return null;
  const a = list[idx];
  const b = list[swapIdx];
  const posA = a.position || a.id;
  const posB = b.position || b.id;
  a.position = posB;
  b.position = posA;
  await backend.putRound(a);
  await backend.putRound(b);
  return getRounds();
}
// تحديث جزئي: كل حقل يُمرَّر فقط لو المشرف عدّله فعليًا (undefined = خلّه كما هو).
async function updateRound(id, fields) {
  const round = state.rounds.find((r) => r.id === Number(id));
  if (!round) return null;
  if (fields.category !== undefined) round.category = String(fields.category || '').trim();
  if (fields.hint !== undefined) round.hint = String(fields.hint || '').trim();
  if (fields.question !== undefined) round.question = String(fields.question || '').trim();
  if (fields.answers !== undefined) round.answers = fields.answers;
  if (fields.showLetters !== undefined) round.showLetters = !!fields.showLetters;
  await backend.putRound(round);
  return { ...round, images: getRoundImages(round.id) };
}
async function deleteRound(id) {
  const rid = Number(id);
  state.rounds = state.rounds.filter((r) => r.id !== rid);
  state.round_images = state.round_images.filter((i) => i.round_id !== rid);
  await backend.delRound(rid);
  await backend.delImagesMetaForRound(rid);
  if (backend.delImagesFiles) backend.delImagesFiles('rounds/' + rid + '/').catch(() => {});
}
// حذف صورة واحدة من جولة (بدل حذف الجولة كاملة) — تُعاد ترقيم مواقع الباقيات حتى لا تصير فجوة برقم اللاعب.
async function deleteRoundImage(roundId, imageId) {
  const rid = Number(roundId);
  const iid = Number(imageId);
  const img = state.round_images.find((i) => i.id === iid && i.round_id === rid);
  if (!img) return false;
  state.round_images = state.round_images.filter((i) => i.id !== iid);
  await backend.delImageMeta(iid);
  if (backend.delImageFile) await backend.delImageFile('rounds/' + rid + '/' + img.filename).catch(() => {});
  const rest = state.round_images.filter((i) => i.round_id === rid).sort((a, b) => (a.position || a.id) - (b.position || b.id));
  rest.forEach((im, idx) => { im.position = idx + 1; });
  await backend.putImagesMeta(rest);
  return true;
}

module.exports = {
  init,
  recoverFromLegacy,
  saveImage,
  getImage,
  getRounds,
  getRound,
  getRoundsCount,
  insertRound,
  updateRound,
  moveRound,
  deleteRound,
  insertRoundImage,
  setImagePosition,
  deleteRoundImage,
};
