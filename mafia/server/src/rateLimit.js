function createSocketLimiter({ windowMs = 10000, max = 20 } = {}) {
  const hits = new Map();

  const allow = function allow(socketId) {
    const now = Date.now();
    const entry = hits.get(socketId);
    if (!entry || now - entry.windowStart > windowMs) {
      hits.set(socketId, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
  // كل اتصال Socket.IO جديد ياخذ socket.id فريد ما يتكرر أبدًا — بدون تنظيف عند الانقطاع،
  // خريطة hits تكبر بلا حدود مدى عمر العملية (تسرّب ذاكرة بطيء على سيرفر يشتغل طويلًا).
  allow.cleanup = (socketId) => { hits.delete(socketId); };
  return allow;
}

module.exports = { createSocketLimiter };
