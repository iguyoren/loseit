const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { sendMessage } = require('../services/whatsapp');

// ── helpers ───────────────────────────────────────────────────────
// תאריך היום בישראל (IDT = UTC+3)
function todayIsrael() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// מי נשקל היום — מחזיר מפה phone → weight
async function getWeighedToday() {
  const today = todayIsrael();
  const rows = await db.q(
    `SELECT DISTINCT ON (user_phone) user_phone, weight
     FROM weight_entries
     WHERE SUBSTRING(recorded_at,1,10) = $1
     ORDER BY user_phone, recorded_at DESC`,
    [today]
  );
  const map = {};
  rows.forEach(r => { map[r.user_phone] = r.weight; });
  return map;
}

// ── GET /api/cron/morning-reminder ────────────────────────────────
// Vercel Cron: 0 2 * * *  →  ~06:00 IDT
router.get('/morning-reminder', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.init();
    const users     = await db.q('SELECT phone, name FROM users ORDER BY id');
    if (!users.length) return res.json({ ok: true, sent: 0 });

    // מי כבר נשקל אתמול (בשעות הבוקר המוקדמות לרוב עוד אף אחד לא נשקל —
    // אז נציג סיכום יום אתמול)
    const yesterday = new Date(Date.now() + 3*60*60*1000 - 24*60*60*1000)
                        .toISOString().slice(0, 10);
    const rowsYest = await db.q(
      `SELECT DISTINCT ON (user_phone) user_phone, weight
       FROM weight_entries
       WHERE SUBSTRING(recorded_at,1,10) = $1
       ORDER BY user_phone, recorded_at DESC`,
      [yesterday]
    );
    const weighedYest = {};
    rowsYest.forEach(r => { weighedYest[r.user_phone] = r.weight; });

    // בניית שורת סיכום אתמול
    let yesterdayLine = '';
    if (rowsYest.length) {
      const lines = users.map(u =>
        weighedYest[u.phone] !== undefined
          ? `✅ ${u.name} — ${weighedYest[u.phone].toFixed(1)} ק"ג`
          : `❌ ${u.name}`
      );
      yesterdayLine = `\n\n📊 אתמול:\n${lines.join('\n')}`;
    }

    const results = [];
    for (const user of users) {
      const msg = `בוקר טוב ${user.name} 🌅\nהגיע זמן להישקל!${yesterdayLine}`;
      try {
        await sendMessage(user.phone, msg);
        results.push({ phone: user.phone, name: user.name, status: 'sent' });
      } catch (err) {
        results.push({ phone: user.phone, name: user.name, status: 'failed', error: err.message });
      }
    }
    res.json({ ok: true, sent: results.length, users: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cron/evening-reminder ───────────────────────────────
// Vercel Cron: 0 18 * * *  →  ~22:00 IDT
router.get('/evening-reminder', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.init();
    const users      = await db.q('SELECT phone, name FROM users ORDER BY id');
    if (!users.length) return res.json({ ok: true, sent: 0 });

    const weighedToday = await getWeighedToday();

    // מי נשקל / לא נשקל
    const weighed    = users.filter(u => weighedToday[u.phone] !== undefined);
    const notWeighed = users.filter(u => weighedToday[u.phone] === undefined);

    if (!notWeighed.length) {
      return res.json({ ok: true, sent: 0, message: 'כולם נשקלו היום 🎉' });
    }

    // שורת "נשקלו היום" לתוספת בהודעה
    let weighedLine = '';
    if (weighed.length) {
      weighedLine = '\n\n✅ נשקלו היום: ' +
        weighed.map(u => `${u.name} (${weighedToday[u.phone].toFixed(1)})`).join(', ');
    }

    const results = [];
    for (const user of notWeighed) {
      const msg = `היי ${user.name} 😅\nעוד לא נשקלת היום!\nאל תשכח לשקול לפני השינה 🌙${weighedLine}`;
      try {
        await sendMessage(user.phone, msg);
        results.push({ phone: user.phone, name: user.name, status: 'sent' });
      } catch (err) {
        results.push({ phone: user.phone, name: user.name, status: 'failed', error: err.message });
      }
    }
    res.json({ ok: true, sent: results.length, skipped: weighed.length, users: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cron/sync-garmin ─────────────────────────
// Vercel Cron: 0 21 * * *  →  ~00:00 IDT (סנכרון בחצות)
router.get('/sync-garmin', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD || !process.env.GARMIN_PHONE) {
    return res.json({ ok: false, message: 'Garmin credentials not configured' });
  }

  try {
    await db.init();
    const { getStepsRange } = require('../services/garmin');
    const phone = process.env.GARMIN_PHONE;

    // סנכרן 7 ימים אחרונים
    const today = new Date(Date.now() + 3*60*60*1000).toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() + 3*60*60*1000 - 7*86400000).toISOString().slice(0, 10);

    const steps = await getStepsRange(weekAgo, today);
    let upserted = 0;
    for (const day of steps) {
      if (!day.date || !day.steps) continue;
      await db.run(
        `INSERT INTO daily_steps (user_phone,date,steps,distance_km,calories)
         VALUES (?,?,?,?,?)
         ON CONFLICT(user_phone,date) DO UPDATE SET steps=excluded.steps, distance_km=excluded.distance_km, calories=excluded.calories`,
        [phone, day.date, day.steps, day.distance_km, day.calories]
      );
      upserted++;
    }
    console.log(`[Garmin] סונכרנו ${upserted} ימים`);
    res.json({ ok: true, upserted, days: steps });
  } catch (err) {
    console.error('[Garmin] שגיאה:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
