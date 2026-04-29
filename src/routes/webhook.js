const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { parseMessage, formatWeight } = require('../services/parser');
const { sendMessage, extractMessage, downloadMedia } = require('../services/whatsapp');
const { estimateCalories, detectWorkoutType } = require('../services/calories');

function loadUsersFromEnv() {
  const map = {};
  (process.env.USERS || '').split(',').forEach(pair => {
    const [phone, name] = pair.split(':').map(s => s.trim());
    if (phone && name) map[phone] = name;
  });
  return map;
}

async function getOrCreateUser(phone, whatsappName) {
  const name = loadUsersFromEnv()[phone] || whatsappName || `משתמש (${phone.slice(-4)})`;
  await db.run(
    `INSERT INTO users (phone,name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name`,
    [phone, name]
  );
  return db.q1('SELECT * FROM users WHERE phone=?', [phone]);
}

// GET /webhook — Meta verification handshake
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] אומת ע"י Meta ✅');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /webhook — incoming messages
router.post('/', async (req, res) => {
  // עונים ל-Meta רק אחרי שסיימנו לעבד (Vercel מוריד את הפונקציה מיד אחרי res)
  try {
    const msg = extractMessage(req.body);
    if (!msg) return res.sendStatus(200);

    const user       = await getOrCreateUser(msg.from, msg.senderName);
    const recordedAt = msg.timestamp;

    // ── תמונת אוכל ──────────────────────────────────────────────
    if (msg.type === 'image') {
      console.log(`[Webhook] תמונה מ-${msg.from}`);
      try {
        const imageData = await downloadMedia(msg.mediaId);
        await db.run(
          'INSERT INTO food_photos (user_phone,image_data,mime_type,caption,recorded_at) VALUES (?,?,?,?,?)',
          [msg.from, imageData, msg.mimeType || 'image/jpeg', msg.caption || null, recordedAt]
        );
        await sendMessage(msg.from, `📸 תמונה נשמרה ביומן האכילה שלך!`);
      } catch (err) {
        console.error('[Webhook] שגיאה בשמירת תמונה:', err.message);
        await sendMessage(msg.from, `❌ לא הצלחנו לשמור את התמונה`);
      }
      return res.sendStatus(200);
    }

    console.log(`[Webhook] הודעה מ-${msg.from}: "${msg.text}"`);
    const parsed = parseMessage(msg.text);

    if (!parsed) {
      await sendMessage(msg.from,
        `שלום ${user.name} 👋\n\nשלח/י:\n• *משקל:* 74.5\n• *אימון:* ריצה\n• *אכלתי:* עוף ואורז\n\nקיצורים: מ: ס: א:`
      );
      return res.sendStatus(200);
    }

    if (parsed.type === 'weight') {
      await db.run(
        'INSERT INTO weight_entries (user_phone,weight,note,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [msg.from, parsed.weight, parsed.note || null, msg.text, recordedAt]
      );
      const prev = await db.q('SELECT * FROM weight_entries WHERE user_phone=? ORDER BY recorded_at DESC LIMIT 2', [msg.from]);
      let reply = `✅ משקל נרשם: ${formatWeight(parsed.weight)}\n📅 ${new Date(recordedAt).toLocaleDateString('he-IL')}`;
      if (prev.length >= 2) {
        const d = (parsed.weight - prev[1].weight).toFixed(1);
        reply += `\n${d > 0 ? '⬆️' : d < 0 ? '⬇️' : '➡️'} שינוי: ${d > 0 ? '+' : ''}${d} ק"ג`;
      }
      const u = await db.q1('SELECT * FROM users WHERE phone=?', [msg.from]);
      if (u?.target_weight) {
        const t = (parsed.weight - u.target_weight).toFixed(1);
        reply += t > 0 ? `\n🎯 נותרו ${t} ק"ג ליעד` : `\n🏆 הגעת ליעד!`;
      }
      await sendMessage(msg.from, reply);
      console.log(`[Webhook] משקל נשמר: ${parsed.weight} עבור ${msg.from}`);

    } else if (parsed.type === 'target') {
      await db.run('UPDATE users SET target_weight=? WHERE phone=?', [parsed.weight, msg.from]);
      await sendMessage(msg.from, `🎯 יעד עודכן: ${formatWeight(parsed.weight)}`);

    } else if (parsed.type === 'workout') {
      const wt = detectWorkoutType(parsed.text);
      await db.run(
        'INSERT INTO workouts (user_phone,type,description,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [msg.from, wt.type, parsed.text, msg.text, recordedAt]
      );
      await sendMessage(msg.from, `${wt.emoji} אימון נרשם: ${wt.type}`);

    } else if (parsed.type === 'food') {
      const { total, breakdown } = estimateCalories(parsed.text);
      await db.run(
        'INSERT INTO food_entries (user_phone,description,calories,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [msg.from, parsed.text, total, msg.text, recordedAt]
      );
      const lines = breakdown.map(b => `• ${b.item}: ~${b.cal} קל`).join('\n');
      await sendMessage(msg.from, `🍽️ ארוחה נרשמה!\n${lines}\n\n🔥 סה"כ: ~${total} קלוריות`);
    }
  } catch (err) {
    console.error('[Webhook] שגיאה:', err.message);
  }
  res.sendStatus(200);
});

module.exports = router;
