const { GarminConnect } = require('garmin-connect');

// מטמון חיבור — למנוע login חוזר בכל request
let _client = null;
let _lastLogin = 0;
const SESSION_TTL = 55 * 60 * 1000; // 55 דקות

async function getClient() {
  const now = Date.now();
  if (_client && (now - _lastLogin) < SESSION_TTL) return _client;

  const email    = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error('GARMIN_EMAIL / GARMIN_PASSWORD לא מוגדרים');

  const client = new GarminConnect({ username: email, password });
  await client.login();
  _client    = client;
  _lastLogin = now;
  console.log('[Garmin] התחברות הצליחה');
  return client;
}

// מחזיר צעדים ליום ספציפי (YYYY-MM-DD)
// משתמש ב-getSteps(date) שמחזיר מספר שלם של צעדים
async function getStepsForDate(dateStr) {
  const client = await getClient();
  const steps  = await client.getSteps(new Date(dateStr + 'T12:00:00'));
  if (steps == null) return null;
  return {
    date:        dateStr,   // ← string YYYY-MM-DD ולא Date object
    steps:       steps || 0,
    distance_km: steps ? +(steps * 0.00075).toFixed(2) : null,
    calories:    null,
  };
}

// מחזיר רשימת צעדים לטווח תאריכים (לולאה יומית)
async function getStepsRange(startDate, endDate) {
  const client  = await getClient();
  const results = [];
  const start   = new Date(startDate + 'T12:00:00');
  const end     = new Date(endDate   + 'T12:00:00');

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const steps = await client.getSteps(new Date(d));
      results.push({
        date:        dateStr,
        steps:       steps || 0,
        distance_km: steps ? +(steps * 0.00075).toFixed(2) : null,
        calories:    null,
      });
    } catch(e) {
      console.error(`[Garmin] שגיאה ל-${dateStr}:`, e.message);
    }
  }
  return results;
}

module.exports = { getStepsForDate, getStepsRange };
