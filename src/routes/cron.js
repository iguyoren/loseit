const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { sendMessage } = require('../services/whatsapp');

// GET /api/cron/morning-reminder
// מופעל ע"י Vercel Cron כל בוקר ב-06:00 שעון ישראל (03:00 UTC)
router.get('/morning-reminder', async (req, res) => {
  // אבטחה — רק Vercel יכול לקרוא ל-endpoint הזה
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await db.init();
    const users = await db.q('SELECT phone, name FROM users ORDER BY id');

    if (!users.length) {
      return res.json({ ok: true, sent: 0, message: 'No users found' });
    }

    const results = [];
    for (const user of users) {
      const msg = `בוקר טוב ${user.name}\nהגיע זמן להישקל`;
      try {
        await sendMessage(user.phone, msg);
        results.push({ phone: user.phone, name: user.name, status: 'sent' });
        console.log(`[Cron] ✅ תזכורת נשלחה ל-${user.name} (${user.phone})`);
      } catch (err) {
        results.push({ phone: user.phone, name: user.name, status: 'failed', error: err.message });
        console.error(`[Cron] ❌ שגיאה בשליחה ל-${user.name} (${user.phone}): ${err.message}`);
      }
    }

    res.json({ ok: true, sent: results.length, users: results });
  } catch (err) {
    console.error('[Cron] שגיאה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
