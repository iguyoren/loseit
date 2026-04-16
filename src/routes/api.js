const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { estimateCalories, estimateCaloriesAsync } = require('../services/calories');

// ── Users ──────────────────────────────────────────────
router.get('/users', async (req, res) => {
  res.json(await db.q('SELECT * FROM users ORDER BY name'));
});

router.post('/users', async (req, res) => {
  const { phone, name } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'Missing phone or name' });
  await db.run(`INSERT INTO users (phone,name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name`, [phone, name]);
  res.json({ ok: true });
});

router.put('/users/:phone/target', async (req, res) => {
  await db.run('UPDATE users SET target_weight=? WHERE phone=?',
    [parseFloat(req.body.target_weight), req.params.phone]);
  res.json({ ok: true });
});

// ── Stats ──────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  res.json(await db.q(`
    SELECT u.phone, u.name, u.target_weight,
      COUNT(we.id) as total_entries,
      MIN(we.weight) as min_weight, MAX(we.weight) as max_weight, AVG(we.weight) as avg_weight,
      MAX(we.recorded_at) as last_entry
    FROM users u LEFT JOIN weight_entries we ON u.phone=we.user_phone
    GROUP BY u.phone, u.name, u.target_weight
  `));
});

// ── Weight entries ─────────────────────────────────────
router.get('/entries', async (req, res) => {
  const { phone, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit) || 100, 500);
  if (phone) {
    res.json(await db.q(
      `SELECT we.*,u.name FROM weight_entries we JOIN users u ON we.user_phone=u.phone
       WHERE we.user_phone=? ORDER BY we.recorded_at DESC LIMIT ?`, [phone, lim]));
  } else {
    res.json(await db.q(
      `SELECT we.*,u.name FROM weight_entries we JOIN users u ON we.user_phone=u.phone
       ORDER BY we.recorded_at DESC LIMIT ?`, [lim]));
  }
});

router.post('/entries', async (req, res) => {
  const { user_phone, weight, note } = req.body;
  if (!user_phone || !weight) return res.status(400).json({ error: 'Missing fields' });
  const w = parseFloat(weight);
  if (isNaN(w) || w < 30 || w > 300) return res.status(400).json({ error: 'Invalid weight' });
  const r = await db.run(
    'INSERT INTO weight_entries (user_phone,weight,note,raw_message,recorded_at) VALUES (?,?,?,?,?) RETURNING id',
    [user_phone, w, note || null, null, new Date().toISOString()]);
  res.json({ id: r.lastInsertRowid, weight: w });
});

router.delete('/entries/:id', async (req, res) => {
  await db.run('DELETE FROM weight_entries WHERE id=?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.put('/entries/:id', async (req, res) => {
  const { weight, note } = req.body;
  const w = parseFloat(weight);
  if (isNaN(w) || w < 30 || w > 300) return res.status(400).json({ error: 'Invalid weight' });
  await db.run('UPDATE weight_entries SET weight=?, note=? WHERE id=?',
    [w, note || null, parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ── Workouts ───────────────────────────────────────────
router.get('/workouts', async (req, res) => {
  const { phone, limit = 100 } = req.query;
  res.json(await db.q('SELECT * FROM workouts WHERE user_phone=? ORDER BY recorded_at DESC LIMIT ?',
    [phone || '', Math.min(parseInt(limit)||100,500)]));
});

router.get('/workouts-range', async (req, res) => {
  const { phone, from, to } = req.query;
  if (!phone||!from||!to) return res.status(400).json({ error: 'Missing params' });
  res.json(await db.q(
    `SELECT * FROM workouts WHERE user_phone=?
     AND SUBSTRING(recorded_at,1,10) BETWEEN ? AND ? ORDER BY recorded_at`,
    [phone, from, to]));
});

router.delete('/workouts/:id', async (req, res) => {
  await db.run('DELETE FROM workouts WHERE id=?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ── Food ───────────────────────────────────────────────
router.get('/food', async (req, res) => {
  const { phone, limit = 100 } = req.query;
  res.json(await db.q('SELECT * FROM food_entries WHERE user_phone=? ORDER BY recorded_at DESC LIMIT ?',
    [phone||'', Math.min(parseInt(limit)||100,500)]));
});

router.post('/food', async (req, res) => {
  const { user_phone, description, calories, date } = req.body;
  if (!user_phone || !description) return res.status(400).json({ error: 'Missing fields' });
  // Use provided date or now
  const ts = date ? new Date(date + 'T12:00:00.000Z').toISOString() : new Date().toISOString();
  const r = await db.run(
    'INSERT INTO food_entries (user_phone,description,calories,raw_message,recorded_at) VALUES (?,?,?,?,?) RETURNING id',
    [user_phone, description, parseInt(calories)||0, null, ts]);
  res.json({ id: r.lastInsertRowid });
});

router.delete('/food/:id', async (req, res) => {
  await db.run('DELETE FROM food_entries WHERE id=?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.put('/food/:id', async (req, res) => {
  const { description, calories } = req.body;
  await db.run('UPDATE food_entries SET description=?, calories=? WHERE id=?',
    [description, parseInt(calories)||0, parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ── Estimate calories breakdown (with online fallback) ─
router.post('/estimate', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ total: 0, breakdown: [] });
  try {
    const result = await estimateCaloriesAsync(text);
    res.json(result);
  } catch (err) {
    res.json(estimateCalories(text));
  }
});

// ── Calendar ───────────────────────────────────────────
router.get('/calendar', async (req, res) => {
  const { phone, year, month } = req.query;
  if (!phone||!year||!month) return res.status(400).json({ error: 'Missing params' });
  const ym = `${year}-${String(month).padStart(2,'0')}`;

  const [weights, workouts, foods] = await Promise.all([
    db.q(`SELECT SUBSTRING(we.recorded_at,1,10) as day, we.user_phone, u.name, we.weight, we.recorded_at as weight_time, we.note as weight_note, we.id as weight_id
          FROM weight_entries we JOIN users u ON we.user_phone=u.phone
          WHERE we.user_phone=? AND SUBSTRING(we.recorded_at,1,7)=? ORDER BY we.recorded_at`,
      [phone, ym]),
    db.q(`SELECT * FROM workouts WHERE user_phone=? AND SUBSTRING(recorded_at,1,7)=? ORDER BY recorded_at`,
      [phone, ym]),
    db.q(`SELECT * FROM food_entries WHERE user_phone=? AND SUBSTRING(recorded_at,1,7)=? ORDER BY recorded_at`,
      [phone, ym]),
  ]);

  const days = {};
  weights.forEach(w  => {
    const d=w.day;
    if(!days[d]) days[d]={date:d,weights:[],workouts:[],foods:[],totalCalories:0};
    days[d].weights.push({weight:w.weight,time:w.weight_time,note:w.weight_note,id:w.weight_id});
  });
  workouts.forEach(w => { const d=w.recorded_at.slice(0,10); if(!days[d]) days[d]={date:d,weights:[],workouts:[],foods:[],totalCalories:0}; days[d].workouts.push({type:w.type,description:w.description,id:w.id}); });
  foods.forEach(f    => { const d=f.recorded_at.slice(0,10); if(!days[d]) days[d]={date:d,weights:[],workouts:[],foods:[],totalCalories:0}; days[d].foods.push({description:f.description,calories:f.calories,id:f.id}); days[d].totalCalories+=(f.calories||0); });

  res.json(Object.values(days).sort((a,b)=>a.date.localeCompare(b.date)));
});

// ── Ingest (called by local WhatsApp bot) ──────────────
router.post('/ingest', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });

  const { type, phone, name, data, recorded_at } = req.body;
  if (!type || !phone) return res.status(400).json({ error: 'Missing fields' });

  // Upsert user
  await db.run(`INSERT INTO users (phone,name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name`,
    [phone, name || phone]);

  if (type === 'weight') {
    await db.run('INSERT INTO weight_entries (user_phone,weight,note,raw_message,recorded_at) VALUES (?,?,?,?,?)',
      [phone, data.weight, data.note||null, data.raw||null, recorded_at]);
  } else if (type === 'workout') {
    await db.run('INSERT INTO workouts (user_phone,type,description,raw_message,recorded_at) VALUES (?,?,?,?,?)',
      [phone, data.type, data.description||null, data.raw||null, recorded_at]);
  } else if (type === 'food') {
    await db.run('INSERT INTO food_entries (user_phone,description,calories,raw_message,recorded_at) VALUES (?,?,?,?,?)',
      [phone, data.description, data.calories||0, data.raw||null, recorded_at]);
  } else if (type === 'target') {
    await db.run('UPDATE users SET target_weight=? WHERE phone=?', [data.weight, phone]);
  }

  res.json({ ok: true });
});

// ── Send test message ──────────────────────────────────
router.post('/send-message', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'Missing phone or text' });
  const { sendMessage } = require('../services/whatsapp');
  await sendMessage(phone, text);
  res.json({ ok: true });
});

module.exports = router;
