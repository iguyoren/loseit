const WEIGHT_PATTERN = /(\d{2,3}[.,]\d{1,2}|\d{2,3})\s*(?:קג|ק"ג|ק'ג|קילו|קילוגרם|kg)?/i;
const TARGET_PATTERN = /(?:מטרה|יעד|target)[:\s]+(\d{2,3}[.,]?\d{0,2})/i;

// Short prefix aliases:
//   מ:  → weight if content is numeric, else food
//   ס:  → workout (ספורט)
function parseMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Full prefixes
  const weightPrefix  = /^(?:משקל|weight)\s*[:：]\s*/i;
  const workoutPrefix = /^(?:אימון|workout|אמרן|ספורט)\s*[:：]\s*/i;
  const foodPrefix    = /^(?:אכול|אכלתי|אכילה|food|ארוחה)\s*[:：]\s*/i;
  const targetPrefix  = /^(?:מטרה|יעד|target)\s*[:：]\s*/i;

  // Short aliases
  const shortWeight  = /^מ\s*[:：]\s*/;   // מ: → weight (if numeric)
  const shortWorkout = /^ס\s*[:：]\s*/;   // ס: → workout (ספורט)
  const shortFood    = /^א\s*[:：]\s*/;   // א: → food (אוכל)

  if (weightPrefix.test(trimmed)) {
    return parseWeightValue(trimmed.replace(weightPrefix, '').trim(), 'weight');
  }
  if (workoutPrefix.test(trimmed)) {
    return { type: 'workout', text: trimmed.replace(workoutPrefix, '').trim() };
  }
  if (foodPrefix.test(trimmed)) {
    return { type: 'food', text: trimmed.replace(foodPrefix, '').trim() };
  }
  if (targetPrefix.test(trimmed)) {
    return parseWeightValue(trimmed.replace(targetPrefix, '').trim(), 'target');
  }

  // Short aliases
  if (shortWorkout.test(trimmed)) {
    const body = trimmed.replace(shortWorkout, '').trim();
    return { type: 'workout', text: body || 'ספורט' };
  }
  if (shortFood.test(trimmed)) {
    const body = trimmed.replace(shortFood, '').trim();
    return { type: 'food', text: body };
  }
  if (shortWeight.test(trimmed)) {
    const body = trimmed.replace(shortWeight, '').trim();
    // If body starts with a number → weight; otherwise → food
    if (WEIGHT_PATTERN.test(body) && /^\d/.test(body)) {
      return parseWeightValue(body, 'weight');
    }
    return { type: 'food', text: body };
  }

  // No prefix — try to detect weight from plain number (legacy support)
  return parseWeightValue(trimmed, 'weight');
}

function parseWeightValue(text, type) {
  const targetMatch = text.match(TARGET_PATTERN);
  if (targetMatch) {
    const w = parseFloat(targetMatch[1].replace(',', '.'));
    return isValidWeight(w) ? { type: 'target', weight: w } : null;
  }

  const match = text.match(WEIGHT_PATTERN);
  if (!match) return null;
  const w = parseFloat(match[1].replace(',', '.'));
  if (!isValidWeight(w)) return null;

  const after = text.slice(text.indexOf(match[0]) + match[0].length).trim();
  const note  = after.length > 0 && after.length < 100 ? after : null;
  return { type, weight: w, note };
}

function isValidWeight(w) {
  return !isNaN(w) && w >= 30 && w <= 300;
}

function formatWeight(w) {
  return `${w.toFixed(1)} ק"ג`;
}

module.exports = { parseMessage, formatWeight };
