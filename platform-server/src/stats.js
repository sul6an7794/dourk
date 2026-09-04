const fs = require('fs');
const path = require('path');

// إحصائيات شخصية لكل لاعب مسجّل دخول عبر اللعبتين — مجمّعة فقط (مافيا: توزيع الأدوار
// ونسبة الفوز، وصّلها: نسبة الحل بدون تلميح ومتوسط وقت الحل). تخزين مزدوج (نفس نمط db.js
// بالضبط): MongoDB لو MONGODB_URI مضبوط (ينجو من إعادة النشر)، وإلا ملف محلي (يُمسح بكل
// نشر — يكفي للتطوير المحلي والاختبارات الآلية فقط).
const DATA_PATH = process.env.STATS_DATA_PATH || path.join(__dirname, '..', 'data', 'stats.json');
const RECENT_LIMIT = 10;

let state = load();
let saveTimer = null;
let MafiaStat = null;
let WslhaStat = null;

function useMongo() {
  return !!process.env.MONGODB_URI;
}

function models() {
  if (!MafiaStat) {
    const mongoose = require('mongoose');
    const schema = () => new mongoose.Schema({ _id: String }, { strict: false, versionKey: false });
    MafiaStat = mongoose.model('m_stats_mafia', schema(), 'stats_mafia');
    WslhaStat = mongoose.model('m_stats_wslha', schema(), 'stats_wslha');
  }
  return { MafiaStat, WslhaStat };
}

function load() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('تعذّر قراءة سجل الإحصائيات، بدأنا من جديد:', e.message);
  }
  return { mafia: {}, wslha: {} };
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('تعذّر حفظ سجل الإحصائيات:', e.message);
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

const defaultMafia = () => ({ gamesPlayed: 0, wins: 0, evil: 0, good: 0, neutral: 0, recent: [] });
const defaultWslha = () => ({ roundsPlayed: 0, hintRounds: 0, totalElapsedSeconds: 0, recent: [] });

function recordMafia(uid, alignment, won) {
  if (!uid) return;
  if (useMongo()) {
    const { MafiaStat: M } = models();
    const inc = { gamesPlayed: 1 };
    if (won) inc.wins = 1;
    if (alignment === 'evil' || alignment === 'good' || alignment === 'neutral') inc[alignment] = 1;
    M.updateOne(
      { _id: String(uid) },
      { $inc: inc, $push: { recent: { $each: [{ won: !!won, at: Date.now() }], $position: 0, $slice: RECENT_LIMIT } } },
      { upsert: true }
    ).catch((e) => console.error('تعذّر تسجيل إحصائية مافيا بـMongoDB:', e.message));
    return;
  }
  const rec = state.mafia[uid] || defaultMafia();
  rec.gamesPlayed += 1;
  if (won) rec.wins += 1;
  if (alignment === 'evil' || alignment === 'good' || alignment === 'neutral') rec[alignment] += 1;
  rec.recent.unshift({ won: !!won, at: Date.now() });
  rec.recent = rec.recent.slice(0, RECENT_LIMIT);
  state.mafia[uid] = rec;
  scheduleSave();
}

async function getMafia(uid) {
  if (useMongo()) {
    const { MafiaStat: M } = models();
    const doc = await M.findById(String(uid)).lean();
    if (!doc) return defaultMafia();
    return {
      gamesPlayed: doc.gamesPlayed || 0,
      wins: doc.wins || 0,
      evil: doc.evil || 0,
      good: doc.good || 0,
      neutral: doc.neutral || 0,
      recent: doc.recent || [],
    };
  }
  return state.mafia[uid] || defaultMafia();
}

// يُستدعى مرة واحدة لكل عضو بالفريق عند إنهاء الجلسة كاملة (كل الجولات) — roundsPlayed/
// totalElapsedSeconds محسوبة من نتيجة الجلسة نفسها، hintRounds من عدد الجولات اللي احتاجت تلميح.
function recordWslha(uid, roundsPlayed, hintRounds, totalElapsedSeconds) {
  if (!uid || !roundsPlayed) return;
  if (useMongo()) {
    const { WslhaStat: W } = models();
    W.updateOne(
      { _id: String(uid) },
      {
        $inc: { roundsPlayed, hintRounds, totalElapsedSeconds },
        $push: { recent: { $each: [{ roundsPlayed, hintRounds, elapsedSeconds: totalElapsedSeconds, at: Date.now() }], $position: 0, $slice: RECENT_LIMIT } },
      },
      { upsert: true }
    ).catch((e) => console.error('تعذّر تسجيل إحصائية وصّلها بـMongoDB:', e.message));
    return;
  }
  const rec = state.wslha[uid] || defaultWslha();
  rec.roundsPlayed += roundsPlayed;
  rec.hintRounds += hintRounds;
  rec.totalElapsedSeconds += totalElapsedSeconds;
  rec.recent.unshift({ roundsPlayed, hintRounds, elapsedSeconds: totalElapsedSeconds, at: Date.now() });
  rec.recent = rec.recent.slice(0, RECENT_LIMIT);
  state.wslha[uid] = rec;
  scheduleSave();
}

async function getWslha(uid) {
  if (useMongo()) {
    const { WslhaStat: W } = models();
    const doc = await W.findById(String(uid)).lean();
    if (!doc) return defaultWslha();
    return {
      roundsPlayed: doc.roundsPlayed || 0,
      hintRounds: doc.hintRounds || 0,
      totalElapsedSeconds: doc.totalElapsedSeconds || 0,
      recent: doc.recent || [],
    };
  }
  return state.wslha[uid] || defaultWslha();
}

module.exports = { recordMafia, getMafia, recordWslha, getWslha };
