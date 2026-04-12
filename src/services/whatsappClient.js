const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const db     = require('../database/db');
const { parseMessage, formatWeight } = require('./parser');
const { estimateCalories, detectWorkoutType } = require('./calories');

let currentQR = null;
let isReady   = false;

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
  await db.run(`INSERT INTO users (phone,name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name`, [phone, name]);
  return db.q1('SELECT * FROM users WHERE phone=?', [phone]);
}

function getStatus() { return { isReady, currentQR }; }

function startWhatsAppClient(targetGroupName) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './data/.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', async qr => {
    currentQR = await QRCode.toDataURL(qr);
    isReady = false;
    console.log(`\n📱 QR מוכן — פתח http://localhost:${process.env.PORT||3002}/qr-page\n`);
  });

  client.on('ready', async () => {
    currentQR = null; isReady = true;
    console.log('\n✅ ווטצאפ מחובר!\n');
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === targetGroupName);
    if (!group) {
      const list = chats.filter(c=>c.isGroup).map(c=>`  • ${c.name}`).join('\n');
      console.log(`⚠️  קבוצה "${targetGroupName}" לא נמצאה.\nקבוצות:\n${list||'  (אין)'}\n`);
    } else {
      console.log(`👥 מאזין לקבוצה: "${group.name}"\n`);
    }
  });

  client.on('message_create', async msg => {
    let chat;
    try { chat = await msg.getChat(); } catch { return; }
    if (!chat.isGroup) return;
    if (targetGroupName && chat.name !== targetGroupName) return;

    const contact = await msg.getContact();
    const phone   = contact.number || msg.from.replace(/@[cg]\.us$/,'');
    const user    = await getOrCreateUser(phone, contact.pushname || contact.name);
    const recordedAt = new Date(msg.timestamp * 1000).toISOString();
    const canReply   = !msg.fromMe;
    const parsed     = parseMessage(msg.body);
    if (!parsed) return;

    if (parsed.type === 'weight') {
      await db.run('INSERT INTO weight_entries (user_phone,weight,note,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [phone, parsed.weight, parsed.note||null, msg.body, recordedAt]);
      console.log(`[משקל] ${user.name}: ${parsed.weight} ק"ג`);
      if (canReply) {
        const prev = await db.q(`SELECT * FROM weight_entries WHERE user_phone=? ORDER BY recorded_at DESC LIMIT 2`, [phone]);
        let reply = `✅ משקל נרשם: ${formatWeight(parsed.weight)}\n📅 ${new Date(recordedAt).toLocaleDateString('he-IL')}`;
        if (prev.length >= 2) { const d=(parsed.weight-prev[1].weight).toFixed(1); reply+=`\n${d>0?'⬆️':d<0?'⬇️':'➡️'} שינוי: ${d>0?'+':''}${d} ק"ג`; }
        const u = await db.q1('SELECT * FROM users WHERE phone=?', [phone]);
        if (u?.target_weight) { const t=(parsed.weight-u.target_weight).toFixed(1); reply+=t>0?`\n🎯 נותרו ${t} ק"ג ליעד`:`\n🏆 הגעת ליעד!`; }
        await msg.reply(reply);
      }
    } else if (parsed.type === 'target') {
      await db.run('UPDATE users SET target_weight=? WHERE phone=?', [parsed.weight, phone]);
      if (canReply) await msg.reply(`🎯 יעד עודכן: ${formatWeight(parsed.weight)}`);
    } else if (parsed.type === 'workout') {
      const wt = detectWorkoutType(parsed.text);
      await db.run('INSERT INTO workouts (user_phone,type,description,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [phone, wt.type, parsed.text, msg.body, recordedAt]);
      console.log(`[אימון] ${user.name}: ${wt.emoji} ${wt.type}`);
      if (canReply) await msg.reply(`${wt.emoji} אימון נרשם: ${wt.type}`);
    } else if (parsed.type === 'food') {
      const { total, breakdown } = estimateCalories(parsed.text);
      await db.run('INSERT INTO food_entries (user_phone,description,calories,raw_message,recorded_at) VALUES (?,?,?,?,?)',
        [phone, parsed.text, total, msg.body, recordedAt]);
      console.log(`[אוכל] ${user.name}: ${total} קל`);
      if (canReply) {
        const lines = breakdown.map(b=>`• ${b.item}: ~${b.cal} קל`).join('\n');
        await msg.reply(`🍽️ ארוחה נרשמה!\n${lines}\n\n🔥 סה"כ: ~${total} קלוריות`);
      }
    }
  });

  client.on('auth_failure', () => console.error('❌ אימות נכשל'));
  client.on('disconnected', r => { isReady=false; console.log('⚠️  התנתק:', r); });
  client.initialize();
  return client;
}

module.exports = { startWhatsAppClient, getStatus };
