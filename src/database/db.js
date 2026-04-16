const { neon } = require('@neondatabase/serverless');

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let _sql;
function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = neon(url);
  }
  return _sql;
}

async function init() {
  // Neon DB "נרדם" אחרי חוסר פעילות — מנסים עד 3 פעמים עם השהייה
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _initOnce();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`[DB] ניסיון ${attempt} נכשל, מנסה שוב...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function _initOnce() {
  const sql = getDb();
  await sql.query(`CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    phone         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    target_weight REAL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS weight_entries (
    id          SERIAL PRIMARY KEY,
    user_phone  TEXT NOT NULL,
    weight      REAL NOT NULL,
    note        TEXT,
    raw_message TEXT,
    recorded_at TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS workouts (
    id          SERIAL PRIMARY KEY,
    user_phone  TEXT NOT NULL,
    type        TEXT NOT NULL,
    description TEXT,
    raw_message TEXT,
    recorded_at TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS food_entries (
    id          SERIAL PRIMARY KEY,
    user_phone  TEXT NOT NULL,
    description TEXT NOT NULL,
    calories    INTEGER,
    raw_message TEXT,
    recorded_at TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
}

// Run a query, return all rows
async function q(query, params = []) {
  const sql = getDb();
  const rows = await sql.query(toPostgres(query), params);
  return rows;
}

// Run a query, return first row or null
async function q1(query, params = []) {
  const rows = await q(query, params);
  return rows[0] || null;
}

// Run INSERT/UPDATE/DELETE
async function run(query, params = []) {
  const rows = await q(query, params);
  // For RETURNING id queries, rows[0].id holds the new id
  return { lastInsertRowid: rows[0]?.id || null, rowsAffected: rows.length };
}

module.exports = { init, q, q1, run };
