const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { attachSocketHandlers } = require('./socket');
const { sweepAbandonedRooms } = require('./rooms');

const PORT = process.env.PORT || 3500;
// أمان: لا نفتح CORS/سوكيت لأي أصل افتراضيًا (يمنع مواقع خارجية من فتح اتصال سوكيت حي
// بالنيابة عن زائر الموقع). لو ALLOWED_ORIGIN غير مضبوط، نقتصر على نفس الأصل فقط.
function parseAllowedOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw === '*') return '*';
  const list = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return list.length <= 1 ? (list[0] || false) : list;
}

let ALLOWED_ORIGIN = parseAllowedOrigin(process.env.ALLOWED_ORIGIN);
if (!ALLOWED_ORIGIN) {
  ALLOWED_ORIGIN = false;
  console.warn('⚠️  ALLOWED_ORIGIN غير مضبوط — السوكيت مقصور على نفس الأصل فقط. اضبطه في بيئة الإنتاج لو الواجهة على أصل مختلف.');
}

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}

function startServer(port = PORT) {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    path: '/mafia/socket.io/',
    cors: { origin: ALLOWED_ORIGIN },
  });

  attachSocketHandlers(io);
  const sweepInterval = setInterval(sweepAbandonedRooms, 5 * 60 * 1000);
  server.on('close', () => clearInterval(sweepInterval));

  server.listen(port, () => {
    console.log(`مافيا — الخادم يعمل على http://localhost:${server.address().port}`);
  });

  server.io = io;
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
