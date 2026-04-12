const WEIGHT_PATTERN = /(\d{2,3}[.,]\d{1,2}|\d{2,3})\s*(?:קג|ק"ג|ק'ג|קילו|קילוגרם|kg)?/i;
const TARGET_PATTERN = /(?:מטרה|יעד|target)[:\s]+(\d{2,3}[.,]?\d{0,2})/i;

function parseMessage(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Detect prefix type
  const weightPrefix  = /^(?:משקל|weight)\s*[:：]\s*/i;
  const workoutPrefix = /^(?:אימון|workout|אמרן)\s*[:：]\s*/i;
  const foodPrefix    = /^(?:אכול|אכלתי|אכילה|food|ארוחה)\s*[:：]\s*/i;
  const targetPrefix  = /^(?:מטרה|יעד|target)\s*[:：]\s*/i;

  if (weightPrefix.test(trimmed)) {
    const body = trimmed.replace(weightPrefix, '').trim();
    return parseWeightValue(body, 'weight');
  }

  if (workoutPrefix.test(trimmed)) {
    const body = trimmed.replace(workoutPrefix, '').trim();
    return { type: 'workout', text: body };
  }

  if (foodPrefix.test(trimmed)) {
    const body = trimmed.replace(foodPrefix, '').trim();
    return { type: 'food', text: body };
  }

  if (targetPrefix.test(trimmed)) {
    const body = trimmed.replace(targetPrefix, '').trim();
    return parseWeightValue(body, 'target');
  }

  // No prefix — try to detect weight (legacy support)
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
