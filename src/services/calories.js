// Simple Hebrew food calorie estimator
const FOOD_DB = [
  // חלבונים
  { keys: ['חזה עוף', 'עוף'],        cal: 165, per: 100, unit: 'g' },
  { keys: ['בשר בקר', 'בקר', 'בשר'], cal: 250, per: 100, unit: 'g' },
  { keys: ['סלמון', 'דג סלמון'],      cal: 208, per: 100, unit: 'g' },
  { keys: ['טונה'],                   cal: 130, per: 100, unit: 'g' },
  { keys: ['דג'],                     cal: 140, per: 100, unit: 'g' },
  { keys: ['ביצה', 'ביצים'],          cal: 78,  per: 1,   unit: 'unit' },
  { keys: ['גבינה צהובה'],            cal: 350, per: 100, unit: 'g' },
  { keys: ['גבינה לבנה', 'גבינה'],    cal: 100, per: 100, unit: 'g' },
  { keys: ['קוטג'],                   cal: 72,  per: 100, unit: 'g' },
  { keys: ['יוגורט'],                 cal: 60,  per: 100, unit: 'g' },
  { keys: ['חלב'],                    cal: 42,  per: 100, unit: 'g' },

  // פחמימות
  { keys: ['אורז'],                   cal: 130, per: 100, unit: 'g' },
  { keys: ['פסטה', 'ספגטי'],          cal: 160, per: 100, unit: 'g' },
  { keys: ['לחם'],                    cal: 80,  per: 1,   unit: 'slice' },
  { keys: ['פיתה'],                   cal: 165, per: 1,   unit: 'unit' },
  { keys: ['תפוח אדמה', 'תפו"א'],     cal: 87,  per: 100, unit: 'g' },
  { keys: ['בטטה'],                   cal: 90,  per: 100, unit: 'g' },
  { keys: ['שיבולת שועל', 'קוואקר'],  cal: 370, per: 100, unit: 'g' },
  { keys: ['קינואה'],                 cal: 120, per: 100, unit: 'g' },
  { keys: ['לחמנייה'],                cal: 140, per: 1,   unit: 'unit' },

  // ירקות
  { keys: ['סלט ירקות', 'סלט'],       cal: 25,  per: 100, unit: 'g' },
  { keys: ['עגבנייה', 'עגבניות'],     cal: 18,  per: 1,   unit: 'unit' },
  { keys: ['מלפפון', 'מלפפונים'],     cal: 15,  per: 1,   unit: 'unit' },
  { keys: ['אבוקדו'],                 cal: 160, per: 1,   unit: 'unit' },
  { keys: ['ברוקולי'],                cal: 34,  per: 100, unit: 'g' },
  { keys: ['גזר'],                    cal: 41,  per: 100, unit: 'g' },

  // פירות
  { keys: ['בננה'],                   cal: 89,  per: 1,   unit: 'unit' },
  { keys: ['תפוח'],                   cal: 52,  per: 1,   unit: 'unit' },
  { keys: ['תפוז'],                   cal: 47,  per: 1,   unit: 'unit' },
  { keys: ['ענבים'],                  cal: 67,  per: 100, unit: 'g' },
  { keys: ['תמר', 'תמרים'],           cal: 277, per: 100, unit: 'g' },

  // חטיפים ומתוקים
  { keys: ['שוקולד'],                 cal: 545, per: 100, unit: 'g' },
  { keys: ['חומוס'],                  cal: 166, per: 100, unit: 'g' },
  { keys: ['טחינה'],                  cal: 570, per: 100, unit: 'g' },
  { keys: ['אגוזים', 'שקדים'],        cal: 580, per: 100, unit: 'g' },
  { keys: ['פלאפל'],                  cal: 330, per: 100, unit: 'g' },

  // שתייה
  { keys: ['קפה שחור', 'קפה'],        cal: 5,   per: 1,   unit: 'unit' },
  { keys: ['קפה עם חלב', 'לאטה'],     cal: 80,  per: 1,   unit: 'unit' },
  { keys: ['מיץ תפוזים', 'מיץ'],      cal: 90,  per: 200, unit: 'g' },

  // ארוחות מוכנות
  { keys: ['פיצה'],                   cal: 266, per: 100, unit: 'g' },
  { keys: ['שווארמה'],                cal: 280, per: 100, unit: 'g' },
  { keys: ['בורגר', 'המבורגר'],       cal: 295, per: 100, unit: 'g' },
  { keys: ['שניצל'],                  cal: 230, per: 100, unit: 'g' },
];

const GRAM_PATTERN  = /(\d+)\s*(?:גר(?:ם|')?|ג'|gram|g\b)/i;
const UNIT_PATTERN  = /(\d+)\s*(?:יחידות?|חתיכות?|כוסות?|כוס|כפות?|כפיות?)/i;
const NUMBER_BEFORE = /^(\d+)\s+/;

function estimateCalories(text) {
  if (!text) return { total: 0, breakdown: [] };

  const items = text.split(/[,،\n]+/).map(s => s.trim()).filter(Boolean);
  let total = 0;
  const breakdown = [];

  for (const item of items) {
    const result = estimateItem(item);
    if (result) {
      total += result.cal;
      breakdown.push({ item, cal: result.cal, note: result.note });
    } else {
      breakdown.push({ item, cal: 0, note: 'לא זוהה' });
    }
  }

  return { total: Math.round(total), breakdown };
}

function estimateItem(text) {
  const lower = text.toLowerCase();

  // Find matching food
  let match = null;
  for (const food of FOOD_DB) {
    if (food.keys.some(k => lower.includes(k.toLowerCase()))) {
      match = food;
      break;
    }
  }
  if (!match) return null;

  // Try to extract quantity
  let quantity = 1;
  let note = '';

  if (match.unit === 'g') {
    const gramMatch = text.match(GRAM_PATTERN);
    if (gramMatch) {
      quantity = parseInt(gramMatch[1]) / match.per;
      note = `${gramMatch[1]}ג`;
    } else {
      // Default: assume 150g serving
      quantity = 150 / match.per;
      note = '~150ג';
    }
  } else {
    const unitMatch = text.match(UNIT_PATTERN) || text.match(NUMBER_BEFORE);
    if (unitMatch) {
      quantity = parseInt(unitMatch[1]);
      note = `×${quantity}`;
    } else {
      quantity = 1;
      note = '×1';
    }
  }

  const cal = Math.round(match.cal * quantity);
  return { cal, note };
}

function detectWorkoutType(text) {
  const lower = text.toLowerCase();
  const types = [
    { keys: ['ריצה', 'ריץ'],          type: 'ריצה',        emoji: '🏃' },
    { keys: ['חדר כושר', 'כושר', 'ג\'ים', 'gym'], type: 'חדר כושר', emoji: '💪' },
    { keys: ['ספינינג', 'אופניים'],    type: 'ספינינג',     emoji: '🚴' },
    { keys: ['שחייה', 'בריכה'],        type: 'שחייה',       emoji: '🏊' },
    { keys: ['יוגה'],                  type: 'יוגה',         emoji: '🧘' },
    { keys: ['הליכה', 'הלכתי'],        type: 'הליכה',        emoji: '🚶' },
    { keys: ['כדורגל', 'כדורסל', 'טניס'], type: 'ספורט קבוצתי', emoji: '⚽' },
    { keys: ['פילאטיס'],               type: 'פילאטיס',      emoji: '🤸' },
    { keys: ['אין', 'לא'],             type: 'לא אימון',     emoji: '❌' },
  ];

  for (const t of types) {
    if (t.keys.some(k => lower.includes(k))) return t;
  }
  return { type: text.slice(0, 30), emoji: '🏋️' };
}

module.exports = { estimateCalories, detectWorkoutType };
