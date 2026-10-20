// Cooking progress and technique are separate: finishing a step earns progress,
// while the accepted input determines its technique points. No runtime state here.
export function cookingQuality(task = {}) {
  const technique = Object.hasOwn(task, 'technique') ? task.technique : (task.operation ?? 0);
  const plating = task.plating ?? 0, primeRatio = task.primeRatio ?? 0;
  if (!Number.isSafeInteger(technique) || technique < 0 || technique > 40 || !Number.isSafeInteger(plating) || plating < 0 || plating > 20 || !Number.isFinite(primeRatio) || primeRatio < 0 || primeRatio > 1) throw new Error('料理品质参数无效');
  const ingredientBonus = Math.round(8 * primeRatio), score = 32 + ingredientBonus + technique + plating;
  return { score, quality: score >= 85 ? 'fine' : score >= 60 ? 'tasty' : 'normal', technique, ingredientBonus };
}

export function stirQuality(round, heat) {
  const center = Number.isInteger(round) ? [38, 62, 38, 62][round] : undefined;
  if (center === undefined || !Number.isFinite(heat)) return { center: null, low: null, high: null, perfectLow: null, perfectHigh: null, accepted: false, perfect: false, points: 0 };
  const distance = Math.abs(heat - center), accepted = distance <= 18, perfect = accepted && distance <= 7;
  return { center, low: center - 18, high: center + 18, perfectLow: center - 7, perfectHigh: center + 7, accepted, perfect, points: accepted ? (perfect ? 7 : 5) : 0 };
}

export function flipQuality(phase) {
  const accepted = Number.isFinite(phase) && phase >= .38 && phase <= .78;
  const perfect = accepted && phase >= .50 && phase <= .66;
  return { accepted, perfect, points: accepted ? (perfect ? 14 : 10) : 0 };
}

export function layerQuality(index, xRatio, yRatio) {
  const maximum = Number.isInteger(index) ? [9, 10, 9][index] : undefined;
  if (maximum === undefined || !Number.isFinite(xRatio) || !Number.isFinite(yRatio) || xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return { perfect: false, points: 0 };
  const perfect = Math.hypot((xRatio - .5) * 2, (yRatio - .5) * 2) <= .55;
  return { perfect, points: perfect ? maximum : maximum - 3 };
}
