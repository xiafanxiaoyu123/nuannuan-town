// 石头的真实收线见闻：纯记录、文案与存档契约，不访问游戏或存储。
import { FISH } from './fish-catalog.js';

const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));
const FOCUSES = {
  steady: { title: '留意收线', detail: '看这条鱼怎样游，试着稳住；离开绿条后接回来，也值得记下。' },
  curious: { title: '留意水下见闻', detail: '若遇到宝箱，自己决定专心收鱼还是试着捞宝；没有遇到也能完成。' },
};
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => plain(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const focusValid = v => typeof v === 'string' && Object.hasOwn(FOCUSES, v);
const fishValid = v => typeof v === 'string' && Object.hasOwn(FISH_BY_ID, v);
const safe = n => Number.isSafeInteger(n) && n >= 0;
const OUTCOME_KEYS = ['fishId', 'quickHook', 'minProgress', 'perfect', 'reelMs', 'treasureSeen', 'decision', 'treasureGot', 'momoAssisted'];

export function fishingOutcomeError(value) {
  if (!exact(value, OUTCOME_KEYS)) return '收线见闻字段不完整或含未知字段';
  if (!fishValid(value.fishId)) return '鱼种无效';
  if (['quickHook', 'perfect', 'treasureSeen', 'treasureGot', 'momoAssisted'].some(k => typeof value[k] !== 'boolean')) return '收线标记必须为布尔值';
  if (!Number.isFinite(value.minProgress) || value.minProgress < 0 || value.minProgress > 1 || !safe(value.reelMs)) return '收线过程数值无效';
  if (!['none', 'skip', 'try'].includes(value.decision)) return '宝箱选择无效';
  if (!value.treasureSeen && (value.decision !== 'none' || value.treasureGot) || value.decision === 'skip' && value.treasureGot) return '宝箱见闻与实际选择不一致';
  return null;
}
export function fishingJournalError(value) {
  if (!exact(value, ['id', 'focus', 'catches'])) return '鱼讯字段不完整或含未知字段';
  if (typeof value.id !== 'string' || value.id.length > 80 || !/^fj_[a-z0-9]+_[a-z0-9]+$/.test(value.id)) return '鱼讯标识无效';
  if (!focusValid(value.focus)) return '观察方向无效';
  if (!Array.isArray(value.catches) || value.catches.length > 2) return '鱼讯最多记录两条成功样本';
  for (const item of value.catches) { const error = fishingOutcomeError(item); if (error) return error; }
  return null;
}
export function fishingNotesError(value) {
  if (!Array.isArray(value) || value.length > 7) return '鱼讯回访最多保存七页';
  const days = new Set();
  for (const note of value) {
    if (!exact(note, ['day', 'focus', 'catch']) || typeof note.day !== 'string' || !note.day.length || note.day.length > 80 || days.has(note.day) || !focusValid(note.focus)) return '鱼讯回访日期或方向无效';
    const error = fishingOutcomeError(note.catch); if (error) return error;
    days.add(note.day);
  }
  return null;
}
export function createFishingJournal(focus, id) {
  const journal = { id, focus, catches: [] };
  return fishingJournalError(journal) ? null : journal;
}
export function fishingFocus(focus) { return focusValid(focus) ? { focus, ...FOCUSES[focus] } : null; }

const SWIM = { smooth: '它游得平缓，适合顺着它的节奏跟随。', sink: '它常往下沉，收线时要给绿条留一点回落的余地。', float: '它爱往上游，轻轻跟上比急着追更从容。', mixed: '它会上下改变方向，需要边看边调整。', dart: '它会突然窜动，错开后再接回来也是一种耐心。' };
export function fishingSampleView(sample, focus, index = 0) {
  const fish = FISH_BY_ID[sample.fishId], lines = [SWIM[fish.ai]];
  const technique = sample.perfect ? '这次全程保持在收线条内。' : sample.minProgress <= .12 ? '进度一度很低，你还是把这条鱼接了回来。' : '它离开过收线条，你调整后把它收了回来。';
  const treasure = !sample.treasureSeen ? '这竿没有遇见宝箱，鱼本身就是完整的见闻。'
    : sample.decision === 'skip' ? '看见宝箱后，你选择专心收鱼，让这条鱼先平安上岸。'
    : sample.decision === 'try' ? sample.treasureGot ? '你选择试着捞宝，鱼和宝箱都带回了岸边。' : '你试着捞宝；箱子没有带回来，但鱼收好了。'
    : sample.treasureGot ? '收线途中顺带带回了宝箱；这竿没有另作取舍。' : '水下出现过宝箱；你没有另作取舍，最后把鱼收好了。';
  if (focus === 'curious') lines.push(treasure, technique); else lines.push(technique, treasure);
  if (sample.quickHook) lines.push('咬钩时，你很快接住了这次机会。');
  if (sample.momoAssisted) lines.push('大喵也帮忙稳住了一段，这份见闻记着你们一起的努力。');
  return { index, fishId: fish.id, name: fish.name, title: FOCUSES[focus].title + ' · ' + fish.name, lines };
}
export function fishingJournalView(task, notes = []) {
  const journal = task?.journal, legacy = !!task && !journal;
  const history = notes.map(note => { const sample = fishingSampleView(note.catch, note.focus); return { day: note.day, focus: note.focus, fishId: sample.fishId, title: sample.title, lines: sample.lines }; });
  const state = task?.claimed ? 'claimed' : journal?.catches.length === 2 ? 'ready' : 'doing';
  return {
    choices: Object.entries(FOCUSES).map(([focus, value]) => ({ focus, ...value })), legacy,
    plan: journal ? { id: journal.id, focus: journal.focus, title: FOCUSES[journal.focus].title, state, cur: journal.catches.length, need: 2,
      catches: journal.catches.map((sample, index) => fishingSampleView(sample, journal.focus, index)),
      message: state === 'claimed' ? '你选中的见闻与今天的70噗灵反馈已经收好。' : state === 'ready' ? '两条见闻都在这里。选一条最想讲的，再收好今天的鱼讯。' : '从开始观察之后的咬钩算起，成功收回两条鱼；可以分几次来钓。' } : null,
    notes: history, response: history.length ? `上回你带来的${history[0].title.split(' · ')[1]}，我还记得。${history[0].lines.slice(1).join('')}` : '',
  };
}
