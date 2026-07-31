// دفتر تذاكر غرف مافيا: المنصة تخصم التذكرة وتصدر "تذكرة غرفة" لمرة واحدة صالحة لوقت قصير،
// ومافيا لازم تتحقق منها قبل إنشاء الغرفة فعليًا. هذا يمنع اثنين من العيوب دفعة وحدة:
// 1) فتح /mafia/ مباشرة وإنشاء غرفة بدون ما يمر أحد بخصم التذكرة عبر المنصة.
// 2) خسارة التذكرة بدون استرجاع لو المستخدم قفل التبويب قبل ما تُنشأ الغرفة فعليًا (نرجّعها تلقائيًا بعد انتهاء الصلاحية).
// تُعرَّض عبر global.__DOURK_PLATFORM__.tickets (انظر platform-global.js) عشان مافيا تقدر
// تتحقق منها بسطر واحد بدون أي اعتمادية مباشرة على مجلد platform-server أو وصّلها — لو الـ
// global غير موجود (تشغيل مافيا لحالها) يتجاهل التحقق تلقائيًا فتبقى مستقلة تمامًا كما كانت.

const crypto = require('crypto');

function createLedger(ttlMs = 60 * 1000) {
  const pending = new Map(); // jti -> { uid, expiresAt }

  function issue(uid) {
    const jti = crypto.randomBytes(16).toString('hex');
    pending.set(jti, { uid, expiresAt: Date.now() + ttlMs });
    return jti;
  }

  // استخدام لمرة واحدة: أول نجاح يحذفها، أي محاولة إعادة استخدام (نسخ الرابط، تبويبين) تُرفض.
  function redeem(jti) {
    const entry = pending.get(jti);
    if (!entry) return null;
    pending.delete(jti);
    if (entry.expiresAt < Date.now()) return null;
    return entry.uid;
  }

  // تذاكر ما انفكّت خلال المهلة (تبويب أُغلق قبل إنشاء الغرفة) تُسترجع تلقائيًا للمستخدم.
  async function sweepExpired(db) {
    const now = Date.now();
    for (const [jti, entry] of pending) {
      if (entry.expiresAt <= now) {
        pending.delete(jti);
        await db.addCredits(entry.uid, 1, 'expired-ticket-refund');
      }
    }
  }

  function startSweep(db, intervalMs = 15 * 1000) {
    return setInterval(() => { sweepExpired(db).catch((e) => console.error('فشل استرجاع تذاكر منتهية:', e)); }, intervalMs);
  }

  // للحفظ الدوري على القرص (نفس فكرة room-snapshots.js) — لو السيرفر انطفى (نشر جديد، تحطم)
  // بين خصم تذكرة وإصدارها وبين إنشاء الغرفة الفعلي، كانت التذكرة المعلّقة تضيع نهائيًا بدون
  // استرجاع لأنها ما كانت محفوظة إلا بالذاكرة. نحفظها كلها كما هي (حتى لو منتهية الصلاحية
  // وقت الحفظ) — بعد الاستعادة، دورة sweepExpired الطبيعية تسترجع رصيد أي تذكرة فاتها وقتها.
  function serialize() {
    return [...pending].map(([jti, entry]) => ({ jti, uid: entry.uid, expiresAt: entry.expiresAt }));
  }
  function restore(list) {
    if (!Array.isArray(list)) return 0;
    for (const item of list) {
      if (item && item.jti && item.uid != null) pending.set(item.jti, { uid: item.uid, expiresAt: item.expiresAt });
    }
    return list.length;
  }

  return { issue, redeem, sweepExpired, startSweep, serialize, restore, _size: () => pending.size };
}

const defaultLedger = createLedger();

module.exports = Object.assign({ createLedger }, defaultLedger);
