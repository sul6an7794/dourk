const fs = require('fs');
const path = require('path');

// إحصائيات شخصية لكل لاعب مسجّل دخول عبر اللعبتين — مجمّعة فقط (مافيا: توزيع الأدوار
// ونسبة الفوز، وصّلها: نسبة الحل بدون تلميح ومتوسط وقت الحل). نفس فلسفة analytics.js:
// ملف JSON داخلي، بلا خدمة خارجية. اللاعبون الضيوف (بدون حساب) ببساطة ما تُسجَّل لهم بيانات.
const DATA_PATH = process.env.STATS_DATA_PATH || path.join(__dirname, '..', 'data', 'stats.json');
const RECENT_LIMIT = 10;

let state = load();
let saveTimer = null;

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

function recordMafia(uid, alignment, won) {
  if (!uid) return;
  const rec = state.mafia[uid] || { gamesPlayed: 0, wins: 0, evil: 0, good: 0, neutral: 0, recent: [] };
  rec.gamesPlayed += 1;
  if (won) rec.wins += 1;
  if (alignment === 'evil' || alignment === 'good' || alignment === 'neutral') rec[alignment] += 1;
  rec.recent.unshift({ won: !!won, at: Date.now() });
  rec.recent = rec.recent.slice(0, RECENT_LIMIT);
  state.mafia[uid] = rec;
  scheduleSave();
}

function getMafia(uid) {
  return state.mafia[uid] || { gamesPlayed: 0, wins: 0, evil: 0, good: 0, neutral: 0, recent: [] };
}

// يُستدعى مرة واحدة لكل عضو بالفريق عند إنهاء الجلسة كاملة (كل الجولات) — roundsPlayed/
// avgElapsedSeconds محسوبة من نتيجة الجلسة نفسها، hintRounds من عدد الجولات اللي احتاجت تلميح.
function recordWslha(uid, roundsPlayed, hintRounds, totalElapsedSeconds) {
  if (!uid || !roundsPlayed) return;
  const rec = state.wslha[uid] || { roundsPlayed: 0, hintRounds: 0, totalElapsedSeconds: 0, recent: [] };
  rec.roundsPlayed += roundsPlayed;
  rec.hintRounds += hintRounds;
  rec.totalElapsedSeconds += totalElapsedSeconds;
  rec.recent.unshift({ roundsPlayed, hintRounds, elapsedSeconds: totalElapsedSeconds, at: Date.now() });
  rec.recent = rec.recent.slice(0, RECENT_LIMIT);
  state.wslha[uid] = rec;
  scheduleSave();
}

function getWslha(uid) {
  return state.wslha[uid] || { roundsPlayed: 0, hintRounds: 0, totalElapsedSeconds: 0, recent: [] };
}

module.exports = { recordMafia, getMafia, recordWslha, getWslha };
