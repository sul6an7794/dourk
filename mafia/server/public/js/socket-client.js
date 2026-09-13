const MafiaSocket = (() => {
  function getDeviceId() {
    let id = localStorage.getItem('mafia_device_id');
    if (!id) {
      id = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('mafia_device_id', id);
    }
    return id;
  }

  // نفس الأصل (dourk.sa) مع المنصة، فـlocalStorage مشترك — نقرأ المصدر التسويقي اللي app.js
  // خزّنه بأول زيارة (لو موجود) بدل ما نطلب من المستخدم أي شي إضافي.
  function getUtmSource() {
    try {
      const raw = localStorage.getItem('dourk_utm');
      if (!raw) return null;
      const { v, t } = JSON.parse(raw);
      if (!v || Date.now() - t > 30 * 24 * 60 * 60 * 1000) return null;
      return v;
    } catch (e) { return null; }
  }

  const socket = io({ path: '/mafia/socket.io/', auth: { deviceId: getDeviceId(), utm: getUtmSource() } });

  function emitAck(event, payload, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ error: 'ما وصل رد من الخادم، تحقق من اتصالك وحاول مرة ثانية' });
      }, timeoutMs);
      socket.emit(event, payload, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res || { error: 'لا استجابة من الخادم' });
      });
    });
  }

  return { socket, deviceId: getDeviceId(), emitAck };
})();
