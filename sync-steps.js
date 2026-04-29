/**
 * sync-steps.js — מסנכרן צעדים מגארמין ודוחף לשרת LoseIt
 * הרצה: node sync-steps.js
 * להגדיר ב-Windows Task Scheduler לפעם ביום (למשל 23:00)
 */

const { GarminConnect } = require('garmin-connect');
const https = require('https');

const GARMIN_EMAIL    = 'iguyoren@gmail.com';
const GARMIN_PASSWORD = 'Guy123456';
const API_URL         = 'https://loseit-beta.vercel.app/api/steps/push';
const API_KEY         = 'loseit_steps_push';
const DAYS_BACK       = 30; // כמה ימים אחורה לסנכרן

async function main() {
  console.log('[Garmin Sync] מתחבר...');
  const client = new GarminConnect({ username: GARMIN_EMAIL, password: GARMIN_PASSWORD });
  await client.login();
  console.log('[Garmin Sync] מחובר ✓');

  const today   = new Date();
  const results = [];

  for (let i = 0; i < DAYS_BACK; i++) {
    const d    = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);

    try {
      const steps = await client.getSteps(d);
      if (steps != null) {
        results.push({
          date,
          steps,
          distance_km: steps ? +(steps * 0.00075).toFixed(2) : null,
        });
        console.log(`  ${date}: ${steps} צעדים`);
      }
    } catch(e) {
      console.error(`  ${date}: שגיאה —`, e.message);
    }
  }

  console.log(`[Garmin Sync] דוחף ${results.length} ימים לשרת...`);

  // POST לשרת
  const body = JSON.stringify({ days: results });
  const url  = new URL(API_URL);

  const req = https.request({
    hostname: url.hostname,
    path:     url.pathname,
    method:   'POST',
    headers:  {
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key':      API_KEY,
    },
  }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const json = JSON.parse(data);
      console.log(`[Garmin Sync] ✅ עודכנו ${json.upserted} ימים בשרת`);
    });
  });

  req.on('error', e => console.error('[Garmin Sync] שגיאת רשת:', e.message));
  req.write(body);
  req.end();
}

main().catch(e => console.error('[Garmin Sync] שגיאה:', e.message));
