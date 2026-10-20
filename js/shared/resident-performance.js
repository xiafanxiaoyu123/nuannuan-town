// The moonlit song has no new currency or inventory. These are pure session rules.
export const LISTEN_DURATION_MS = 6000;
export const PERFORMANCE_ROUNDS = 3;
export const PERFORMANCE_ACCEPT_LOW = .4;
export const PERFORMANCE_ACCEPT_HIGH = .85;
const THEMES = {
  garden: { title: '泥土与月光', cycleMs: 2600, notes: [[60,64,67],[64,67,69],[67,64,60]], endings: [
    { id: 'garden_wait', text: '也请你不必赶路。' }, { id: 'garden_bloom', text: '我想陪明天的花再等一会儿。' }] },
  fishing: { title: '岸边的微光', cycleMs: 2400, notes: [[62,69,67],[65,69,72],[69,65,62]], endings: [
    { id: 'fishing_ripple', text: '它们正沿着涟漪走来。' }, { id: 'fishing_star', text: '我把一颗星轻轻放回水面。' }] },
  work: { title: '灯火下的脚步', cycleMs: 2200, notes: [[60,67,72],[64,69,72],[67,64,60]], endings: [
    { id: 'work_lantern', text: '明天再慢慢启程。' }, { id: 'work_rest', text: '今夜先让掌心和灯火一起歇歇。' }] },
  quiet: { title: '愿望留在晚风里', cycleMs: 2800, notes: [[57,64,69],[60,64,67],[64,60,57]], endings: [
    { id: 'quiet_wish', text: '也值得留下一首歌。' }, { id: 'quiet_stay', text: '我愿意在这里再听一阵晚风。' }] },
};
const copy = value => JSON.parse(JSON.stringify(value));
export const performanceThemeFor = (counts = {}) => counts.harvested || counts.watered ? 'garden' : counts.fish_caught ? 'fishing' : counts.plays ? 'work' : 'quiet';
export function getPerformanceTheme(id) { return Object.hasOwn(THEMES, id) ? copy(THEMES[id]) : null; }
export function createPerformanceSession(mode, theme) {
  if (!['listen', 'echo'].includes(mode) || !Object.hasOwn(THEMES, theme)) return null;
  return { mode, theme, phase: mode, activeMs: 0, round: 0, roundMs: 0, selectedEnding: null, feedback: '' };
}
export function advancePerformanceSession(state, elapsedMs, active) {
  const dt = active && Number.isFinite(elapsedMs) ? Math.max(0, Math.min(250, elapsedMs)) : 0;
  if (!dt || !['listen', 'echo'].includes(state.phase)) return state;
  const next = { ...state, activeMs: state.activeMs + dt };
  if (state.mode === 'listen') {
    next.activeMs = Math.min(LISTEN_DURATION_MS, next.activeMs);
    if (next.activeMs >= LISTEN_DURATION_MS) next.phase = 'ready';
  } else next.roundMs = (next.roundMs + dt) % THEMES[state.theme].cycleMs;
  return next;
}
export function respondPerformanceSession(state, action) {
  if (!action || typeof action !== 'object') return { state, accepted: false, message: '等这句的光圈亮起来，再轻轻回应。' };
  if (action.type === 'echo' && state.phase === 'echo') {
    const progress = state.roundMs / THEMES[state.theme].cycleMs;
    if (progress < PERFORMANCE_ACCEPT_LOW || progress > PERFORMANCE_ACCEPT_HIGH) {
      const message = '没关系，再等这一圈；七弦会陪你重来。';
      return { state: { ...state, feedback: message }, accepted: false, message };
    }
    const round = state.round + 1, message = round === PERFORMANCE_ROUNDS ? '三句都接住了。为今晚挑一句结尾吧。' : '七弦听到了你的回应，下一句慢慢来。';
    return { state: { ...state, round, roundMs: 0, phase: round === PERFORMANCE_ROUNDS ? 'ending' : 'echo', feedback: message }, accepted: true, message };
  }
  if (action.type === 'ending' && state.phase === 'ending') {
    const ending = THEMES[state.theme].endings.find(value => value.id === action.id);
    if (ending) return { state: { ...state, selectedEnding: ending.id, phase: 'ready', feedback: '这句结尾，就留给今晚的自己。' }, accepted: true, message: '这句结尾，就留给今晚的自己。' };
  }
  return { state, accepted: false, message: '先把这一段听完，再留下一句结尾。' };
}
export function performanceSessionView(state) {
  const theme = THEMES[state.theme];
  return { ...state, title: theme.title, durationMs: state.mode === 'listen' ? LISTEN_DURATION_MS : null, total: PERFORMANCE_ROUNDS,
    cycleMs: theme.cycleMs, cycleProgress: state.roundMs / theme.cycleMs, acceptLow: PERFORMANCE_ACCEPT_LOW, acceptHigh: PERFORMANCE_ACCEPT_HIGH,
    callNotes: [...(theme.notes[state.round] || [])], endings: copy(theme.endings) };
}
export function performancePoem(base, state) {
  const poem = copy(base), metadata = { mode: state.mode, theme: state.theme };
  if (state.mode === 'echo') {
    const ending = THEMES[state.theme].endings.find(value => value.id === state.selectedEnding);
    if (!ending || state.phase !== 'ready') return null;
    poem.lines = [...poem.lines.slice(0, 3), ending.text]; metadata.ending = ending.id;
  }
  poem.performance = metadata;
  return poem;
}
// Existing poems have no metadata. Explicit new metadata is strict and self-consistent.
export function performanceMetadataError(poem) {
  if (!Object.hasOwn(poem, 'performance')) return null;
  const value = poem.performance;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '演出记忆应为记录对象';
  if (!['listen', 'echo'].includes(value.mode) || !Object.hasOwn(THEMES, value.theme)) return '演出方式或诗签主题无效';
  const fields = value.mode === 'echo' ? ['mode', 'theme', 'ending'] : ['mode', 'theme'];
  if (Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) return '演出记忆字段不完整或包含未知字段';
  if (!poem.counts || performanceThemeFor(poem.counts) !== value.theme) return '诗签主题与当日见闻不一致';
  if (value.mode === 'echo') {
    const ending = THEMES[value.theme].endings.find(item => item.id === value.ending);
    if (!ending || !Array.isArray(poem.lines) || poem.lines.length !== 4 || poem.lines[3] !== ending.text) return '呼应诗签的结尾无效';
  }
  return null;
}
export function performanceRevisit(poem) {
  if (!poem?.lines?.length) return '今晚的曲子还空着，等你带一点见闻过来。';
  if (poem.performance?.mode === 'echo' && !performanceMetadataError(poem)) return `我还记得你留下的那句：「${poem.lines.at(-1)}」今晚也想把心事唱给月光听吗？`;
  return `上次我们把「${poem.lines.at(-1)}」留在了诗签里。再坐一会儿，听听今晚的风吧。`;
}
