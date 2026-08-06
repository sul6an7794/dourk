// جسر بسيط لخصم/التحقق من رصيد التذاكر أثناء لعبة جارية (مو بس عند إنشاء غرفة جديدة) —
// مثلًا "إعادة اللعبة" بمافيا تخصم تذكرة زي أي غرفة جديدة تمامًا، لكن بدون تحويل لصفحة
// المنصة (نفس الجلسة). يُعرَّض عبر global.__DOURK_PLATFORM__.credits (انظر platform-global.js)
// عشان أي لعبة تقدر تستدعيه بسطر واحد بدون اعتمادية مباشرة على db/auth تبع وصّلها.

const ROOM_COST = 1;

function createBridge(db) {
  async function charge(uid, reason) {
    if (!uid) return false;
    const user = db.getUserById(uid);
    if (!user) return false;
    if ((user.credits || 0) < ROOM_COST) return false;
    await db.addCredits(uid, -ROOM_COST, reason);
    return true;
  }

  async function balance(uid) {
    if (!uid) return null;
    const user = db.getUserById(uid);
    return user ? (user.credits || 0) : null;
  }

  // لعبة "وصّلها" تعطي أول تذكرة جولات تعريفية ثابتة (نفس الجولات لكل مستخدم جديد)، والتذاكر
  // اللي بعدها جولات عشوائية من باقي المخزون — يمنع فتح حسابات وهمية متعددة عشان تشوف نفس
  // مخزون الجولات الكامل مجانًا (كل حساب جديد يشوف فقط الجولات التعريفية الثابتة، لا أكثر).
  // نتحقق عبر سجل حركة الرصيد الحقيقي (server-side)، لا عبر أي قيمة يرسلها العميل نفسه.
  async function hasPlayedWslhaBefore(uid) {
    if (!uid) return true; // بدون هوية، ما نمنح أي وضع "أول مرة" تفضيلي
    const log = db.getCreditLog(uid, 1000);
    return log.some((e) => e.reason === 'wslha-room-create');
  }

  return { charge, balance, hasPlayedWslhaBefore };
}

module.exports = { createBridge, ROOM_COST };
