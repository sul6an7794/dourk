const fs = require('fs');
const path = require('path');

// سجل أخطاء داخلي بسيط: يخزّن آخر الأخطاء بالذاكرة (للقراءة الفورية) ويضيفها بملف محلي
// (سطر JSON لكل خطأ) — بدون قاعدة بيانات خارجية أو خدمة طرف ثالث. مصمم للتشخيص وقت
// الحاجة، لا لتحليلات دقيقة — لو المنصة كبرت لدرجة يصعب متابعتها كذا، وقتها ننتقل لخدمة
// متخصصة (Sentry مثلًا).
const LOG_PATH = process.env.ERROR_LOG_PATH || path.join(__dirname, '..', 'data', 'error-log.jsonl');
const MAX_MEMORY = 200;
const TELEGRAM_MIN_GAP_MS = 10 * 60 * 1000; // ما نرسل نفس الخطأ بالضبط تيليجرام أكثر من مرة كل ١٠ دقايق — يمنع إغراق الشات لو خطأ يتكرر بسرعة.

const recent = [];
const lastTelegramSentAt = new Map();

function appendToFile(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error('تعذّر كتابة سجل الأخطاء بالملف:', e.message);
  }
}

async function sendTelegramAlert(entry) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const key = entry.source + ':' + entry.message.slice(0, 120);
  const last = lastTelegramSentAt.get(key) || 0;
  if (Date.now() - last < TELEGRAM_MIN_GAP_MS) return;
  lastTelegramSentAt.set(key, Date.now());
  const text = `🔴 خطأ بـ${entry.source}\n${entry.message}`.slice(0, 3900);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error('تعذّر إرسال تنبيه تيليجرام:', e.message);
  }
}

// source: من أي تطبيق صار الخطأ ('platform' / 'wslha' / 'mafia') — يساعد تعرف بسرعة وش المتأثر.
function logError(source, err, context) {
  const entry = {
    at: new Date().toISOString(),
    source: source || 'platform',
    message: (err && err.message) || String(err),
    stack: (err && err.stack) || null,
    context: context || null,
  };
  console.error(`[${entry.source}]`, entry.message);
  recent.push(entry);
  if (recent.length > MAX_MEMORY) recent.shift();
  appendToFile(entry);
  sendTelegramAlert(entry).catch(() => {});
  return entry;
}

function getRecentErrors(limit = 50) {
  return recent.slice(-limit).reverse();
}

module.exports = { logError, getRecentErrors };
