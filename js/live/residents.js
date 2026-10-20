// 原六位居民的常驻活动。与旧委托/好友/剧情分账，不伪造原作角色内容。
import { S, bus, save, flushSave, getStat, styleBonus, checkAch } from '../core/state.js';
import { CLOTH, SETS, STYLES, SHOPS, CROP, FRUIT } from '../data.js';
import { FISH } from '../shared/fish-catalog.js';
import { createFishingJournal, fishingFocus, fishingOutcomeError, fishingJournalView } from '../shared/fishing-journal.js';
import { plotStage, plotRemain, treeInfo } from '../world/farm.js';
import { PROJECT } from './data.js';
import { RESIDENTS, residentById } from './people.js';
import { gameDayKey } from '../core/gametime.js';
import { ACHS } from '../shared/progression.js';
import { LISTEN_DURATION_MS, performanceThemeFor, createPerformanceSession, advancePerformanceSession, respondPerformanceSession, performanceSessionView, performancePoem, performanceRevisit } from '../shared/resident-performance.js';
import { createFieldPlan, advanceFieldPlan, fieldworkView } from '../shared/resident-fieldwork.js';

const DAY_STATS = ['plays', 'watered', 'harvested', 'fish_caught', 'npc_talk', 'reqs', 'bread_perfect'];
const dayKey = gameDayKey; // 居民日常按小镇的日子算
const TASKS = {
  man: { title: '小满的试烤记录', intro: '不必抢着出炉。先把两份面包烤到金色区间，我帮你记下今天的手感。', steps: [{ key: 'bread_perfect', need: 2, text: '完美出炉两份面包' }], reward: { coins: 90 } },
  he: { title: '青禾的巡田手记', intro: '先看看哪块田渴了，再收一回成熟的作物或果子。照顾好它们，下一茬会更有盼头。', steps: [{ key: 'watered', need: 2, text: '完成两次浇水' }, { key: 'harvested', need: 1, text: '收获一次作物或果子' }], reward: { seed: 'tulip', n: 2, coins: 0 } },
  shi: { title: '石头的今日鱼讯', intro: '先钓两条。下次见面，聊聊今天的收获。', steps: [{ key: 'fish_caught', need: 2, text: '成功钓到两条鱼' }], reward: { coins: 70 } },
};
const TITLES = { xu: '阿絮的搭配点评', nuo: '小桃的穿搭剪报册', qi: '七弦的月下小演出' };
export const PERFORMANCE_SECONDS = LISTEN_DURATION_MS / 1000;
let performing = null, installed = false, emptyTarget = null;
let fishingTokens = new WeakMap(), fishingSequence = 0;
function activeFishingObservation(token) {
  if (!token || typeof token !== 'object') return null;
  const session = fishingTokens.get(token);
  if (!session || session.source !== S || session.day !== dayKey()) return null;
  const task = current().tasks.shi;
  return !task?.claimed && task?.journal?.id === session.id && task.journal.catches.length < 2 ? { session, task } : null;
}

function current() {
  const r = S.live.residents, day = dayKey();
  if (r.day !== day) {
    r.day = day; r.base = Object.fromEntries(DAY_STATS.map((key) => [key, getStat(key)])); r.tasks = {};
    save();
  }
  return r;
}
const delta = (key) => Math.max(0, getStat(key) - (current().base[key] || 0));
const night = () => S.clock >= 0.75 && S.clock < 0.95;
const outfitCopy = () => ({ ...S.outfit });
function wornSet() {
  const cats = ['hair', 'dress', 'shoes'], parts = cats.map((cat) => CLOTH[S.outfit[cat]]);
  if (!parts.every((c, i) => c && c.cat === cats[i] && S.owned.includes(c.id))) return null;
  const id = parts[0].set;
  return id && SETS[id] && parts.every((c) => c.set === id) ? id : null;
}
function fieldNotes() {
  const plots = S.placed.filter((p) => p.id === 'plot' || p.id === 'bigplot');
  let empty = 0, thirsty = 0, ripe = 0;
  for (const e of plots) {
    const p = S.farm[e.gx + ',' + e.gz];
    if (!p) { empty++; continue; }
    if (p.tree) { const t = treeInfo(p); if (t.ripe) ripe++; else if (t.thirsty) thirsty++; }
    else if (plotStage(p) >= 3) ripe++;
    else if (!p.watered) thirsty++;
  }
  return { plots: plots.length, empty, thirsty, ripe };
}
function fieldSnapshots() {
  return S.placed.filter(p => p.id === 'plot' || p.id === 'bigplot').map((e, index) => {
    const plotKey = e.gx + ',' + e.gz, p = S.farm[plotKey];
    let action = e.id === 'bigplot' ? 'plantTree' : 'plant', remain = 0;
    if (p?.tree) { const info = treeInfo(p); remain = info.remain; action = info.ripe ? 'pickFruit' : info.thirsty ? 'water' : 'wait'; }
    else if (p) { remain = plotRemain(p); action = plotStage(p) >= 3 ? 'harvest' : !p.watered ? 'water' : 'wait'; }
    let planting;
    if (!p) {
      const item = e.id === 'bigplot' ? FRUIT[S.sapling] || FRUIT.apple : CROP[S.seed];
      const free = e.id === 'plot' && (S.seeds[item.id] || 0) > 0, cost = free ? 0 : e.id === 'bigplot' ? item.price : item.seed;
      planting = { name: item.name + (e.id === 'bigplot' ? '树苗' : ''), free, cost, shortage: Math.max(0, cost - S.coins) };
    }
    return { plotKey, plotId: e.id, ordinal: index + 1, plantId: p?.tree || p?.crop || null, plantedAt: p?.t0 ?? null, action, remain, planting };
  });
}
function rememberEmptyTarget(force = false) {
  const task = S.live.residents.tasks.he, plan = task?.plan;
  if (!plan || task.claimed || plan.route !== 'empty' || plan.phase !== 'active') { emptyTarget = null; return; }
  if (!force && emptyTarget?.source === S && emptyTarget.key === plan.target.plotKey && emptyTarget.plotId === plan.target.plotId) return;
  emptyTarget = { source: S, key: plan.target.plotKey, plotId: plan.target.plotId, entry: S.placed.find(e => e.id === plan.target.plotId && e.gx + ',' + e.gz === plan.target.plotKey) };
}
const activityFailure = (reason, message) => ({ ok: false, reason, message, note: message });
// 日常记录和已有奖励在同一份存档里提交，反馈必须排在落盘之后。
function commitActivity(change, reward = false) {
  const source = S, fields = ['live', 'coins', 'stats', 'ach', 'seeds'];
  const before = fields.map(key => ({ key, value: source[key], exists: Object.hasOwn(source, key) }));
  const draft = { live: { ...source.live, residents: JSON.parse(JSON.stringify(source.live.residents)) }, coins: source.coins, stats: { ...source.stats }, ach: { ...source.ach }, seeds: { ...source.seeds } };
  const result = change(draft); if (!result?.ok) return result;
  for (const key of fields) source[key] = draft[key];
  let saved = false;
  try { if (reward) checkAch(true); saved = flushSave(); } catch (_) { saved = false; }
  if (!saved) {
    for (const { key, value, exists } of before) { if (exists) source[key] = value; else delete source[key]; }
    return activityFailure('save', '这次记录还没有保存成功。可以释放设备空间或结束装修后，再试一次；反馈还没有领取。');
  }
  if (result.coins) bus.emit('coins', source.coins, result.coins, 'live');
  if (source === S && result.seed) bus.emit('seed', source.seed);
  const previousAch = before.find(x => x.key === 'ach').value;
  for (const a of ACHS) if (source === S && !previousAch?.[a.id] && source.ach[a.id]) bus.emit('ach', a);
  if (source === S) bus.emit('residentActivity');
  return result;
}
function applyActivityReward(draft, reward) {
  const coins = draft.coins + (reward.coins || 0), earned = (draft.stats.earned || 0) + (reward.coins || 0), activities = (draft.stats.resident_activities || 0) + 1;
  const seeds = reward.seed ? (draft.seeds[reward.seed] || 0) + reward.n : 0;
  if (![coins, earned, activities, seeds].every(n => Number.isSafeInteger(n) && n >= 0)) return false;
  draft.coins = coins; if (reward.coins) draft.stats.earned = earned;
  draft.stats.resident_activities = activities; if (reward.seed) draft.seeds[reward.seed] = seeds;
  return true;
}
function review() {
  const counts = Object.fromEntries(Object.keys(STYLES).map((key) => [key, 0]));
  for (const id of Object.values(S.outfit)) if (id !== 'a_none' && id !== 'b_none' && CLOTH[id]) counts[CLOTH[id].style]++;
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const shops = Object.values(SHOPS).filter((sh) => sh.id !== 'bakery' || S.live.project.phase >= PROJECT.phases.length).map((sh) => ({ id: sh.id, name: sh.name, pct: styleBonus(sh.id).pct }));
  const best = [...shops].sort((a, b) => b.pct - a.pct)[0], set = wornSet();
  const lines = [`这身以${STYLES[top].name}为主，${counts[top]}件单品在呼应同一种风格。`];
  if (best?.pct) lines.push(`若今天去${best.name}，现有服饰加成为 +${best.pct}%。`);
  else lines.push('混搭也有自己的意思，不必为了点评硬买一整套。');
  lines.push(set ? `发型、衣裙和鞋组成了「${SETS[set].name}」。` : '主件还不是同一套；喜欢混搭的话，也不用急着换。');
  return { counts, shops, set, outfit: outfitCopy(), lines };
}
function poem() {
  const counts = Object.fromEntries(DAY_STATS.map((key) => [key, delta(key)]));
  let lines;
  if (counts.harvested || counts.watered) lines = ['你把一滴水递给泥土，', '泥土把明天轻轻收好。', '月光不催促花开，', '也请你不必赶路。'];
  else if (counts.fish_caught) lines = ['浮漂把水面的光拨开，', '你把耐心留在岸边。', '今晚不必追赶星星，', '它们正沿着涟漪走来。'];
  else if (counts.plays) lines = ['灯火记下忙碌的脚步，', '晚风替你翻过一页。', '把今天的掌声收进口袋，', '明天再慢慢启程。'];
  else lines = ['还没写完的愿望，', '可以先放在月光下。', '没有赶路的这个晚上，', '也值得留下一首歌。'];
  return { day: dayKey(), counts, lines };
}

const performanceVisible = () => (typeof document === 'undefined' || !document.hidden && (!document.hasFocus || document.hasFocus()))
  && (typeof window === 'undefined' || !(window.innerHeight > window.innerWidth));
const performanceFailure = (reason, message, retryable = false) => ({ ok: false, reason, retryable, message });
function activePerformance(token) {
  if (!token || performing?.token !== token) return null;
  if (performing.source !== S || performing.day !== dayKey()) { performing = null; return null; }
  return performing;
}
function tickPerformanceSession(session, active) {
  const now = performance.now(), visible = active === true && performanceVisible();
  session.play = advancePerformanceSession(session.play, now - session.last, session.active && visible);
  session.last = now; session.active = visible;
}
function viewPerformance(session) {
  const view = performanceSessionView(session.play), poemView = session.play.phase === 'ready' ? performancePoem(session.poem, session.play) : JSON.parse(JSON.stringify(session.poem));
  return { ...view, active: session.active && performanceVisible(), replay: session.replay, poem: poemView, lines: [...poemView.lines] };
}
function commitPerformance(session) {
  const source = session.source, r = source.live.residents, resultPoem = performancePoem(session.poem, session.play);
  if (r.performed === session.day) return { ok: true, coins: 0, replay: true, poem: resultPoem };
  const coins = source.coins + 50, earned = (source.stats.earned || 0) + 50, activities = (source.stats.resident_activities || 0) + 1;
  if (![coins, earned, activities].every(value => Number.isSafeInteger(value) && value >= 0)) return performanceFailure('capacity', '当前数值已到存档上限，这段演出还没有结算。', true);
  const fields = ['live', 'coins', 'stats', 'ach'], before = fields.map(key => ({ key, value: source[key], exists: Object.hasOwn(source, key) })), previousAch = source.ach;
  source.live = { ...source.live, residents: { ...r, performed: session.day, poems: [resultPoem, ...r.poems].slice(0, 7) } };
  source.coins = coins; source.stats = { ...source.stats, earned, resident_activities: activities }; source.ach = { ...source.ach };
  let saved = false;
  try { checkAch(true); saved = flushSave(); } catch (_) { saved = false; }
  if (!saved) {
    for (const { key, value, exists } of before) { if (exists) source[key] = value; else delete source[key]; }
    return performanceFailure('save', '这张诗签还没有保存成功。演出已听完，释放设备空间或结束装修后，可以再试着收好。', true);
  }
  bus.emit('coins', source.coins, 50, 'live');
  for (const achievement of ACHS) if (source === S && !previousAch?.[achievement.id] && source.ach[achievement.id]) bus.emit('ach', achievement);
  if (source === S) bus.emit('residentActivity');
  return { ok: true, coins: 50, replay: false, poem: resultPoem };
}

export function initResidents() {
  if (performing && performing.source !== S) performing = null;
  current();
  rememberEmptyTarget();
  if (installed) return;
  installed = true;
  bus.on('beforeStat', current); // 午夜后第一笔活动也计入当天
  bus.on('reset', () => { performing = null; fishingTokens = new WeakMap(); current(); rememberEmptyTarget(true); });
  bus.on('stateReplaced', () => { performing = null; fishingTokens = new WeakMap(); rememberEmptyTarget(true); });
  bus.on('farmAction', event => {
    if (event?.source !== S) return;
    const r = current(), task = r.tasks.he;
    if (!task?.plan || task.claimed) return;
    const next = advanceFieldPlan(task.plan, event);
    if (next === task.plan) return;
    // 农田动作已经修改同一个S；与原动作共用延迟存档，不单独回滚手记进度。
    task.plan = next; save(); bus.emit('residentActivity');
  });
  bus.on('decorChanged', () => {
    const task = current().tasks.he;
    if (task?.plan?.route !== 'empty' || task.plan.phase !== 'active' || task.claimed || task.plan.invalid) return;
    rememberEmptyTarget();
    const target = S.placed.find(e => e.id === task.plan.target.plotId && e.gx + ',' + e.gz === task.plan.target.plotKey);
    if (!target || target !== emptyTarget?.entry) { task.plan.invalid = true; save(); bus.emit('residentActivity'); }
  });
}
export const residentLife = {
  pending() { return Object.keys(TASKS).filter((id) => this.data(id).state === 'ready').length; },
  list() { return RESIDENTS.map((n) => ({ id: n.id, name: n.name, title: TASKS[n.id]?.title || TITLES[n.id] })); },
  data(id) {
    const npc = residentById(id); if (!npc) return null;
    const r = current(), d = TASKS[id], out = { id, npc, day: r.day, title: d?.title || TITLES[id] };
    if (d) {
      const task = r.tasks[id], locked = id === 'man' && S.live.project.phase < PROJECT.phases.length;
      const steps = d.steps.map((s) => ({ ...s, cur: task ? Math.min(s.need, Math.max(0, getStat(s.key) - (task.base?.[s.key] ?? getStat(s.key)))) : 0 }));
      const done = steps.every((s) => s.cur >= s.need);
      Object.assign(out, { kind: 'task', intro: d.intro, steps, reward: { ...d.reward }, state: locked ? 'locked' : task?.claimed ? 'claimed' : task ? done ? 'ready' : 'doing' : 'offer' });
      if (id === 'he') {
        rememberEmptyTarget();
        out.field = fieldNotes(); out.fieldwork = fieldworkView(task, fieldSnapshots(), r.fieldNotes || []);
        if (task?.plan) { out.steps = out.fieldwork.plan.steps; out.state = out.fieldwork.plan.state; }
      }
      if (id === 'shi') {
        out.fish = FISH.map((f) => ({ id: f.id, name: f.name, count: S.live.book.fish[f.id] || 0 }));
        out.fishingJournal = fishingJournalView(task, r.fishingNotes || []);
        if (task?.journal) { out.state = out.fishingJournal.plan.state; out.steps = [{ key: 'fish_caught', need: 2, cur: task.journal.catches.length, text: '观察并成功收回两条鱼' }]; }
      }
      if (id === 'man') out.shop = { ...S.shops.bakery, todayPerfect: delta('bread_perfect') };
      return out;
    }
    if (id === 'xu') return { ...out, kind: 'review', review: review(), history: [...r.reviews] };
    if (id === 'nuo') { const set = wornSet(); return { ...out, kind: 'album', set, recorded: !!(set && r.album[set]), items: Object.entries(r.album).map(([id, item]) => ({ id, name: SETS[id]?.name || id, ...item })) }; }
    return { ...out, kind: 'poem', night: night(), completed: r.performed === r.day, preview: poem(), history: [...r.poems], duration: PERFORMANCE_SECONDS, recentResponse: performanceRevisit(r.poems[0]) };
  },
  start(id) {
    const d = this.data(id); if (!d || d.kind !== 'task' || d.state !== 'offer') return activityFailure('state', '这份记录当前不能重新开始。');
    if (id === 'he') return activityFailure('target', '先选一种巡田路线和一块真实的田，再开始记录。');
    if (id === 'shi') return activityFailure('focus', '先选一个观察方向，再开始今天的真实鱼讯。');
    return commitActivity(draft => { draft.live.residents.tasks[id] = { base: Object.fromEntries(TASKS[id].steps.map(s => [s.key, getStat(s.key)])), claimed: false }; return { ok: true, message: '今天的记录已经开始。' }; });
  },
  startFieldwork(route, key) {
    const d = this.data('he');
    if (!['offer', 'doing'].includes(d.state) || d.fieldwork.legacy) return activityFailure('state', d.fieldwork.legacy ? '这份旧巡田记录仍按两次浇水、一次收获完成；下一天再选新路线。' : '这页手记已经完成，先收好今天的反馈。');
    const plan = createFieldPlan(route, key, fieldSnapshots());
    if (!plan) return activityFailure('target', '这块田已经变化，请重新选一块适合当前路线的田。');
    const result = commitActivity(draft => { draft.live.residents.tasks.he = { base: {}, claimed: false, plan }; return { ok: true, message: '青禾记下了这块田，先前的动作不会计入这页新手记。' }; });
    if (result.ok) rememberEmptyTarget(true);
    return result;
  },
  startFishingJournal(focus) {
    const d = this.data('shi');
    if (!['offer', 'doing'].includes(d.state) || d.fishingJournal.legacy) return activityFailure('state', d.fishingJournal.legacy ? '这份旧鱼讯仍按两条鱼完成；下一天再选择观察方向。' : '今天的鱼讯已经完成，先收好见闻。');
    const journal = createFishingJournal(focus, `fj_${Date.now().toString(36)}_${(++fishingSequence).toString(36)}`);
    if (!journal) return activityFailure('focus', '请选择有效的观察方向。');
    return commitActivity(draft => { draft.live.residents.tasks.shi = { base: {}, claimed: false, journal }; return { ok: true, message: '石头记下了这个方向，从下一次咬钩开始观察；之前的鱼不会补进这页。' }; });
  },
  beginFishingObservation(expectedSource = S) {
    if (expectedSource !== S) return null;
    const r = current(), task = r.tasks.shi;
    if (!task?.journal || task.claimed || task.journal.catches.length >= 2) return null;
    const token = Object.freeze({});
    fishingTokens.set(token, { source: S, day: r.day, id: task.journal.id });
    return token;
  },
  fishingObservationState(token) {
    const active = activeFishingObservation(token);
    if (!active) return null;
    const { focus } = active.task.journal; return { focus, title: fishingFocus(focus).title };
  },
  cancelFishingObservation(token) { return !!token && typeof token === 'object' && fishingTokens.delete(token); },
  finishFishingObservation(token, outcome) {
    const active = activeFishingObservation(token);
    if (!active) return { ...activityFailure('stale', '观察方向、日期或存档已经变化，这条见闻不会串到新记录。'), changed: false };
    const error = fishingOutcomeError(outcome);
    if (error) return { ...activityFailure('outcome', error), changed: false };
    fishingTokens.delete(token);
    active.task.journal.catches.push({ ...outcome });
    // 成功收鱼已经发生；与鱼数、图鉴和发现一起保存，不能单独回滚见闻。
    save();
    return { ok: true, changed: true, message: '这条收线见闻已加入当前记录。' };
  },
  claim(id, options) {
    const d = this.data(id); if (!d || d.kind !== 'task' || d.state !== 'ready') return activityFailure('state', '这份记录还没有完成，或今天已经领取。');
    const r = current(), task = r.tasks[id];
    if (!task || d.day !== r.day || task.claimed) return activityFailure('state', '记录已经变化，请重新查看。');
    const sample = options?.sample;
    if (id === 'shi' && task.journal && (!Number.isInteger(sample) || sample < 0 || sample >= task.journal.catches.length)) return activityFailure('sample', '请明确选一条想留给石头的见闻。');
    return commitActivity(draft => {
      if (!applyActivityReward(draft, d.reward)) return activityFailure('capacity', '当前数值已到存档上限，这次反馈还没有领取。');
      const resident = draft.live.residents, done = resident.tasks[id]; done.claimed = true;
      if (id === 'shi' && done.journal) resident.fishingNotes = [{ day: resident.day, focus: done.journal.focus, catch: { ...done.journal.catches[sample] } }, ...(resident.fishingNotes || []).filter(n => n.day !== resident.day)].slice(0, 7);
      if (id === 'he' && done.plan) resident.fieldNotes = [{ day: resident.day, route: done.plan.route, target: done.plan.target, result: done.plan.result }, ...(resident.fieldNotes || []).filter(n => n.day !== resident.day)].slice(0, 7);
      return { ok: true, ...d.reward, name: d.reward.seed ? `${CROP[d.reward.seed].name}种子 ×${d.reward.n}` : `${d.reward.coins} 噗灵`, message: '今日记录与反馈已经收好。' };
    }, true);
  },
  saveReview() {
    const r = current(), data = review(), entry = { day: r.day, outfit: data.outfit, lines: data.lines };
    return commitActivity(draft => { const reviews = draft.live.residents.reviews, i = reviews.findIndex(x => x.day === r.day);
      if (i >= 0) reviews[i] = entry; else reviews.unshift(entry);
      draft.live.residents.reviews = reviews.slice(0, 7); return { ok: true, ...entry, message: '阿絮记下了今天这身搭配，稍后也可以再来更新点评。' }; });
  },
  showOutfit() {
    const r = current(), id = wornSet();
    if (!id) return activityFailure('outfit', '还不是完整的三件套；可以先把初始套装展示给小桃。');
    if (r.album[id]) return activityFailure('recorded', '这一套已经贴进剪报册啦，不会重复发奖励。');
    return commitActivity(draft => {
      if (!applyActivityReward(draft, { coins: 40 })) return activityFailure('capacity', '当前数值已到存档上限，这页剪报还没有收好。');
      draft.live.residents.album[id] = { day: r.day, outfit: outfitCopy() };
      const note = `小桃记下了「${SETS[id].name}」：+40 噗灵`;
      return { ok: true, coins: 40, note, message: note };
    }, true);
  },
  beginPerformance(mode = 'listen') {
    if (performing && (performing.source !== S || performing.day !== dayKey())) performing = null;
    const r = current(); if (!night() || performing) return null;
    const base = poem(), play = createPerformanceSession(mode, performanceThemeFor(base.counts));
    if (!play) return null;
    const token = Object.freeze({});
    performing = { token, source: S, day: r.day, last: performance.now(), active: false, poem: base, replay: r.performed === r.day, play };
    return token;
  },
  cancelPerformance(token) { if (token && performing?.token === token) performing = null; },
  performanceState(token) { const session = activePerformance(token); return session ? viewPerformance(session) : null; },
  tickPerformance(token, { active = false } = {}) {
    const session = activePerformance(token); if (!session) return null;
    tickPerformanceSession(session, active); return viewPerformance(session);
  },
  respondPerformance(token, action) {
    const session = activePerformance(token);
    if (!session) return performanceFailure('stale', '进度或日期已变化，请重新开始这段夜曲。');
    tickPerformanceSession(session, session.active);
    if (!session.active) return { ...performanceFailure('paused', '回到夜曲里，再慢慢回应。'), accepted: false, state: viewPerformance(session) };
    const result = respondPerformanceSession(session.play, action); session.play = result.state;
    return { ok: true, accepted: result.accepted, message: result.message, state: viewPerformance(session) };
  },
  finishPerformance(token) {
    const session = activePerformance(token);
    if (!session) return performanceFailure('stale', '进度或日期已变化，请重新开始这段夜曲。');
    if (session.play.phase !== 'ready') return performanceFailure('incomplete', '这一段还没听完，慢慢来就好。');
    const result = commitPerformance(session);
    if (result.ok && performing === session) performing = null;
    return result;
  },
};
