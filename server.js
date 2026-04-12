require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { init } = require('./src/database/db');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', require('./src/routes/api'));

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
