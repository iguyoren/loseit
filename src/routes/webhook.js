const express = require('express');
const router = express.Router();
const { stmts } = require('../database/db');
const { parseWeight, formatWeight } = require('../services/parser');
const { sendMessage, extractMessage } = require('../services/whatsapp');

// Load user mapping from env: "phone:name,phone:name"
function loadUsersFromEnv() {
  const raw = process.env.USERS || '';
  const map = {};
  raw.split(',').forEach(pair => {
    const [phone, name] = pair.split(':').map(s => s.trim());
    if (phone && name) map[phone] = name;
  });
  return map;
}

function getOrCreateUser(phone, whatsappName) {
  const userMap = loadUsersFromEnv();
  const name = userMap[phone] || whatsappName || `משתמש (${phone.slice(-4)})`;

  stmts.upsertUser.run(phone, name);
  return stmts.getUserByPhone.get(phone);
}

// GET /webhook — Meta verification handshake
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Verified by Meta');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /webhook — incoming messages
router.post('/', async (req, res) => {
  // Acknowledge immediately (Meta requires quick 200)
  res.sendStatus(200);

  const msg = extractMessage(req.body);
  if (!msg) return;

  console.log(`[Webhook] Message from ${msg.from}: "${msg.text}"`);

  const user = getOrCreateUser(msg.from, msg.senderName);
  const parsed = parseWeight(msg.text);

  if (!parsed) {
    await sendMessage(
      msg.from,
      `שלום ${user.name} 👋\n\nשלח/י את המשקל שלך בפורמט:\n• 75.5\n• 75.5 קג\n\nלהגדרת יעד: *מטרה: 70*`
    );
    return;
  }

  const recordedAt = msg.timestamp;

  if (parsed.type === 'target') {
    stmts.updateTargetWeight.run(parsed.weight, msg.from);
    await sendMessage(
      msg.from,
      `✅ יעד משקל עודכן ל-${formatWeight(parsed.weight)}, ${user.name}!`
    );
    return;
  }

  // Save weight entry
  stmts.insertEntry.run(
    msg.from,
    parsed.weight,
    parsed.note || null,
    msg.text,
    recordedAt
  );

  // Build response
  const prev = stmts.getEntriesByUser.all(msg.from, 2);
  let reply = `✅ נרשם: ${formatWeight(parsed.weight)}\n📅 ${new Date(recordedAt).toLocaleDateString('he-IL')}`;

  if (prev.length >= 2) {
    const diff = (parsed.weight - prev[1].weight).toFixed(1);
    const arrow = diff > 0 ? '⬆️' : diff < 0 ? '⬇️' : '➡️';
    reply += `\n${arrow} שינוי: ${diff > 0 ? '+' : ''}${diff} ק"ג`;
  }

  const updatedUser = stmts.getUserByPhone.get(msg.from);
  if (updatedUser?.target_weight) {
    const toGoal = (parsed.weight - updatedUser.target_weight).toFixed(1);
    if (toGoal > 0) {
      reply += `\n🎯 נותרו ${toGoal} ק"ג ליעד`;
    } else {
      reply += `\n🏆 הגעת ליעד!`;
    }
  }

  await sendMessage(msg.from, reply);
});

module.exports = router;
