require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { init, q } = require('./src/database/db');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// ── Access logger — רושם כניסות לאתר (רק דפי HTML, לא assets) ──
app.use((req, res, next) => {
  const skip = req.path.startsWith('/api') || req.path.startsWith('/webhook') ||
               /\.(js|css|png|jpg|ico|svg|woff|woff2|ttf)$/.test(req.path);
  if (!skip) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    q('INSERT INTO access_logs (ip, user_agent, path) VALUES (?,?,?)', [ip, ua, req.path]).catch(() => {});
  }
  next();
});

// ── Login logger endpoint ──────────────────────────────────────────
app.post('/api/log-login', express.json(), async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  const { user_name } = req.body;
  if (user_name) {
    await q('INSERT INTO access_logs (ip, user_agent, path, user_name) VALUES (?,?,?,?)',
      [ip, ua, '/login', user_name]).catch(() => {});
  }
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api',        require('./src/routes/api'));
app.use('/webhook',    require('./src/routes/webhook'));
app.use('/api/cron',   require('./src/routes/cron'));

// QR page (local only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/qr-page', require('./src/routes/qr'));
}

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Init DB then start
init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 LoseIt פועל על http://localhost:${PORT}`);
    console.log(`📊 דשבורד:  http://localhost:${PORT}\n`);
  });

  // Start WhatsApp bot only when running locally
  if (process.env.NODE_ENV !== 'production' && process.env.GROUP_NAME) {
    const { startWhatsAppClient } = require('./src/services/whatsappClient');
    startWhatsAppClient(process.env.GROUP_NAME);
  }
}).catch(err => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});

module.exports = app; // needed for Vercel
