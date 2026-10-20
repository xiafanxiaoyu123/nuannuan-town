// 只描述一次演奏/停留的过程，不读存档，不发奖。
const CLOCK_MARKS = [[0, 5], [.1, 7], [.56, 17], [.75, 19.5], [.95, 28], [1, 29]];
export function gameClockHour(clock = 0) {
  const c = Math.max(0, Math.min(1, Number.isFinite(clock) ? clock : 0));
  const next = CLOCK_MARKS.findIndex(mark => c < mark[0]);
  const i = next < 1 ? CLOCK_MARKS.length - 1 : next;
  const [a, ha] = CLOCK_MARKS[i - 1], [b, hb] = CLOCK_MARKS[i];
  return (ha + (c - a) / (b - a) * (hb - ha)) % 24;
}

// 弹错音可以继续练习；正确音中只要混入一次试听，就不是完整手弹。
export function createMelodyAttempt(keys) {
  const notes = [...keys];
  let index = 0, manual = true;
  return {
    get index() { return index; },
    reset() { index = 0; manual = true; },
    press(key, byHand) {
      if (!notes.length || key !== notes[index]) return { matched: false, complete: false, manual: false };
      manual = manual && byHand === true;
      index++;
      if (index < notes.length) return { matched: true, complete: false, manual: false };
      const result = { matched: true, complete: true, manual };
      index = 0; manual = true;
      return result;
    },
  };
}
