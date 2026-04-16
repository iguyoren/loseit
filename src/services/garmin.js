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
async function getStepsForDate(dateStr) {
  const client = await getClient();
  const date   = new Date(dateStr + 'T12:00:00');
  const stats  = await client.getDailySteps(date, date);
  if (!stats || !stats.length) return null;
  const day = stats[0];
  return {
    date:           dateStr,
    steps:          day.totalSteps          || 0,
    distance_km:    day.totalDistance != null ? +(day.totalDistance / 1000).toFixed(2) : null,
    active_minutes: day.activeKilocalories  != null ? null : null,  // not always available
    calories:       day.activeKilocalories  || null,
  };
}

// מחזיר רשימת צעדים לטווח תאריכים
async function getStepsRange(startDate, endDate) {
  const client = await getClient();
  const from   = new Date(startDate + 'T12:00:00');
  const to     = new Date(endDate   + 'T12:00:00');
  const stats  = await client.getDailySteps(from, to);
  return (stats || []).map(day => ({
    date:        day.calendarDate || day.startGMT?.slice(0, 10),
    steps:       day.totalSteps   || 0,
    distance_km: day.totalDistance != null ? +(day.totalDistance / 1000).toFixed(2) : null,
    calories:    day.activeKilocalories || null,
  })).filter(d => d.date);
}

module.exports = { getStepsForDate, getStepsRange };
