// 原六位居民的常驻活动。与旧委托/好友/剧情分账，不伪造原作角色内容。
import { S, bus, save, stat, getStat, addCoins, styleBonus } from '../core/state.js';
import { CLOTH, SETS, STYLES, SHOPS, CROP } from '../data.js';
import { FISH } from '../models/items.js';
import { plotStage, treeInfo } from '../world/farm.js';
import { PROJECT } from './data.js';
import { RESIDENTS, residentById } from './people.js';
import { gameDayKey } from '../core/gametime.js';

const DAY_STATS = ['plays', 'watered', 'harvested', 'fish_caught', 'npc_talk', 'reqs', 'bread_perfect'];
const dayKey = gameDayKey; // 居民日常按小镇的日子算
const TASKS = {
  man: { title: '小满的试烤记录', intro: '不必抢着出炉。先把两份面包烤到金色区间，我帮你记下今天的手感。', steps: [{ key: 'bread_perfect', need: 2, text: '完美出炉两份面包' }], reward: { coins: 90 } },
  he: { title: '青禾的巡田手记', intro: '先看看哪块田渴了，再收一回成熟的作物或果子。照顾好它们，下一茬会更有盼头。', steps: [{ key: 'watered', need: 2, text: '完成两次浇水' }, { key: 'harvested', need: 1, text: '收获一次作物或果子' }], reward: { seed: 'tulip', n: 2, coins: 0 } },
  shi: { title: '石头的今日鱼讯', intro: '先钓两条。下次见面，聊聊今天的收获。', steps: [{ key: 'fish_caught', need: 2, text: '成功钓到两条鱼' }], reward: { coins: 70 } },
};
const TITLES = { xu: '阿絮的搭配点评', nuo: '小桃的穿搭剪报册', qi: '七弦的月下小演出' };
export const PERFORMANCE_SECONDS = 6;
let performing = null, installed = false;

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

export function initResidents() {
  current();
  if (installed) return;
  installed = true;
  bus.on('beforeStat', current); // 午夜后第一笔活动也计入当天
  bus.on('reset', () => { performing = null; current(); });
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
      if (id === 'he') out.field = fieldNotes();
      if (id === 'shi') out.fish = FISH.map((f) => ({ id: f.id, name: f.name, count: S.live.book.fish[f.id] || 0 }));
      if (id === 'man') out.shop = { ...S.shops.bakery, todayPerfect: delta('bread_perfect') };
      return out;
    }
    if (id === 'xu') return { ...out, kind: 'review', review: review(), history: [...r.reviews] };
    if (id === 'nuo') { const set = wornSet(); return { ...out, kind: 'album', set, recorded: !!(set && r.album[set]), items: Object.entries(r.album).map(([id, item]) => ({ id, name: SETS[id]?.name || id, ...item })) }; }
    return { ...out, kind: 'poem', night: night(), completed: r.performed === r.day, preview: poem(), history: [...r.poems], duration: PERFORMANCE_SECONDS };
  },
  start(id) {
    const d = this.data(id); if (!d || d.kind !== 'task' || d.state !== 'offer') return false;
    current().tasks[id] = { base: Object.fromEntries(TASKS[id].steps.map((s) => [s.key, getStat(s.key)])), claimed: false };
    save(); bus.emit('residentActivity'); return true;
  },
  claim(id) {
    const d = this.data(id); if (!d || d.kind !== 'task' || d.state !== 'ready') return null;
    const r = current(), task = r.tasks[id];
    if (!task || d.day !== r.day || task.claimed) return null;
    task.claimed = true;
    if (d.reward.seed) { S.seeds[d.reward.seed] = (S.seeds[d.reward.seed] || 0) + d.reward.n; bus.emit('seed', S.seed); }
    if (d.reward.coins) addCoins(d.reward.coins, 'live');
    stat('resident_activities'); save(); bus.emit('residentActivity');
    return { ...d.reward, name: d.reward.seed ? `${CROP[d.reward.seed].name}种子 ×${d.reward.n}` : `${d.reward.coins} 噗灵` };
  },
  saveReview() {
    const r = current(), data = review(), entry = { day: r.day, outfit: data.outfit, lines: data.lines };
    const i = r.reviews.findIndex((x) => x.day === r.day);
    if (i >= 0) r.reviews[i] = entry; else r.reviews.unshift(entry);
    r.reviews = r.reviews.slice(0, 7); save(); bus.emit('residentActivity'); return entry;
  },
  showOutfit() {
    const r = current(), id = wornSet();
    if (!id) return { ok: false, note: '还不是完整的三件套；可以先把初始套装展示给小桃。' };
    if (r.album[id]) return { ok: false, note: '这一套已经贴进剪报册啦，不会重复发奖励。' };
    r.album[id] = { day: r.day, outfit: outfitCopy() };
    addCoins(40, 'live'); stat('resident_activities'); save(); bus.emit('residentActivity');
    return { ok: true, coins: 40, note: `小桃记下了「${SETS[id].name}」：+40 噗灵` };
  },
  beginPerformance() {
    const r = current(); if (!night() || performing) return null;
    performing = { day: r.day, started: performance.now(), poem: poem(), replay: r.performed === r.day };
    return performing;
  },
  cancelPerformance(token) { if (token && performing === token) performing = null; },
  finishPerformance(token) {
    if (!token || performing !== token || performance.now() - token.started < PERFORMANCE_SECONDS * 1000) return null;
    performing = null;
    const r = current(); if (token.day !== r.day) return null;
    if (r.performed === r.day) return { coins: 0, replay: true, poem: token.poem };
    r.performed = r.day; r.poems.unshift(token.poem); r.poems = r.poems.slice(0, 7);
    addCoins(50, 'live'); stat('resident_activities'); save(); bus.emit('residentActivity');
    return { coins: 50, replay: false, poem: token.poem };
  },
};
