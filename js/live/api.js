// 新系统接口层：长期进度在 S.live，规则与强化在本局小游戏实例中。
// 界面只通过 live 查询和操作；保留原交接文档定义的返回结构。
// 全部奖励入真实存档；阶段奖励和签到送的都是能摆、能穿的实物。
import { S, bus, save, getStat, addCoins, checkQuest, FRIEND_AT, beauty, spend } from '../core/state.js';
import { SIGNIN, MODIFIERS, PERKS, SET_EFFECTS, BEAUTY_REWARDS, PROJECT, STORIES, VISIT_LINES, FESTIVALS } from './data.js';
import { createDailyService } from '../features/daily/service.js';
import { SETS, CLOTH, CLOTHES, CROPS, FRUITS, DECOR } from '../data.js';
import { RESIDENTS as NPCS } from './people.js';
import { FISH, FLOWERS } from '../models/items.js';
import { outfitFx, festivalAt } from './effects.js';
import { gameDayKey, gameDayNo } from '../core/gametime.js';
import { addFertilizer, migrateMarketOrders } from '../shared/save-compat.js';

// 日期按本地日历计算，不能用 UTC 截日期；昨天也用日历减一天，兼容夏令时
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dateKey(new Date());
// 保留旧接口入口；服务每次从 live binding 读取 S，换档后不会继续写旧对象。
const dailyService = createDailyService({ getState: () => S, getStat, save, addCoins, bus });
export function initDaily() { dailyService.init(); }

const BOOK_TABS = [
  { id: 'fish', name: '鱼', reward: 500, items: FISH.map((f) => ({ id: f.id, name: f.name, kind: 'fish', hint: f.fest ? `${FESTIVALS.find((x) => x.id === f.fest).name}期间在钓场钓到` : '在悠然钓场钓到', optional: !!f.fest })) },
  { id: 'crop', name: '作物与果子', reward: 600, items: [...CROPS, ...FRUITS].map((c) => ({ id: c.id, name: c.name, kind: 'crop', hint: '在后院收获' })) },
  { id: 'set', name: '套装', reward: 1500, items: Object.entries(SETS).map(([id, s]) => ({ id, name: s.name, kind: 'set', hint: '集齐发型、裙装、鞋' })) },
  { id: 'npc', name: '居民', reward: 800, items: NPCS.map((n) => ({ id: n.id, name: n.name, kind: 'npc', hint: '成为好朋友' })) },
  { id: 'flower', name: '花', reward: 600, items: FLOWERS.slice(0, 4).flatMap((f) => [4, 5].map((lv) => ({ id: f.id + ':' + lv, name: f.name + (lv === 4 ? '花束' : '花篮'), kind: 'flower', hint: '在花店合成到 Lv.' + lv }))) },
];
function recordFound(kind, id, n = 1, silent = false) {
  const tab = BOOK_TABS.find((t) => t.id === kind), item = tab && tab.items.find((i) => i.id === id);
  if (!item || !Number.isFinite(n) || n <= 0) return false;
  const found = S.live.book[kind], first = !found[id];
  found[id] = (found[id] || 0) + n;
  save();
  if (first && !silent) bus.emit('bookFound', item.name);
  bus.emit('liveBook');
  return first;
}
function syncBook(silent = false) {
  for (const id of Object.keys(SETS)) {
    if (!S.live.book.set[id] && ['hair', 'dress', 'shoes'].every((cat) => CLOTHES.some((c) => c.set === id && c.cat === cat && S.owned.includes(c.id)))) recordFound('set', id, 1, silent);
  }
  for (const n of NPCS) if (!S.live.book.npc[n.id] && (S.npc[n.id]?.t || 0) >= FRIEND_AT) recordFound('npc', n.id, 1, silent);
  // 老档无法还原已经卖掉的收获，只补记仍在背包中的、能确认拥有的作物
  for (const [id, n] of Object.entries(S.crops)) if (n > 0 && !S.live.book.crop[id]) recordFound('crop', id, n, silent);
}
let bookReady = false;
export function initBook() {
  syncBook(true);
  if (bookReady) return;
  bookReady = true;
  bus.on('found', recordFound);
  bus.on('collection', () => syncBook());
  bus.on('quest', () => syncBook()); // 聊天/委托改变好感后，沿原统计刷新链检查朋友
}

// 阶段奖励里的实物：摆设直接进仓库；地面材质靠「已领取」解锁。每个阶段只补发一次
function grantMile(i) {
  const m = BEAUTY_REWARDS[i], g = S.live.granted;
  if (!m || !m.decor || g['mile' + i]) return false;
  g['mile' + i] = 1;
  S.decor[m.decor] = (S.decor[m.decor] || 0) + 1;
  bus.emit('decorChanged');
  return true;
}
// 上个版本先发了噗灵、没给实物的老存档：进游戏时补上
export function initGrants() {
  let n = 0;
  for (const i of S.live.miles) if (grantMile(i)) n++;
  if (n) { save(); bus.emit('note', `补发了 ${n} 件阶段奖励的摆设，已放进装修仓库`); }
}
export const floorUnlocked = (f) => f.mile === undefined || S.live.miles.includes(f.mile);

function syncStory(id) {
  const s = STORIES[id];
  if (!s) return null;
  const was = S.live.story[id] || 0;
  const cur = Math.min(s.chapters.length, Math.max(was, Math.floor((S.req?.[id]?.done || 0) / 2)));
  if (cur !== was) {
    S.live.story[id] = cur;
    save();
    if (cur < s.chapters.length) bus.emit('storyProgress', { id, title: s.title, chapter: s.chapters[cur - 1] });
  }
  if (cur >= s.chapters.length && !S.live.storyClaimed[id]) {
    S.live.storyClaimed[id] = true; // 发奖前记账，打开面板或刷新都不能再次领取
    addCoins(500, 'live');
    save();
    bus.emit('storyReward', { id, title: s.title, coins: 500 });
  }
  return { ...s, reward: '500 噗灵', cur };
}
let storiesReady = false;
export function initStories() {
  for (const id of Object.keys(STORIES)) syncStory(id);
  if (storiesReady) return;
  storiesReady = true;
  bus.on('req', () => { for (const id of Object.keys(STORIES)) syncStory(id); });
}

export const live = {
  // ——— 每日订单 ———
  daily() { return dailyService.daily(); },
  claimDaily(id) { return dailyService.claimDaily(id); },
  claimChest() { return dailyService.claimChest(); },

  // ——— 七日签到 ———
  signin() {
    const now = new Date(), date = dateKey(now), sign = S.live.sign;
    now.setDate(now.getDate() - 1);
    const claimedToday = sign.last === date;
    const day = claimedToday ? sign.streak : sign.last === dateKey(now) ? sign.streak % 7 + 1 : 1;
    return { day, claimedToday, rewards: SIGNIN };
  },
  claimSignin() {
    const s = this.signin();
    if (s.claimedToday) return null;
    const r = SIGNIN[s.day - 1];
    S.live.sign = { last: today(), streak: s.day };
    if (r.item === 'seed') { S.seeds.rose = (S.seeds.rose || 0) + 2; bus.emit('seed', S.seed); }
    if (r.item === 'decor') { S.decor.sakura = (S.decor.sakura || 0) + 1; bus.emit('decorChanged'); }
    // 七日星发夹只送一次，不替玩家自动换装；以后再签满七天，这一格只发噗灵
    if (r.item === 'cloth' && !S.owned.includes('a_seven')) { S.owned.push('a_seven'); bus.emit('collection'); }
    addCoins(r.coins, 'live');
    if (r.item === 'cloth') checkQuest();
    save();
    bus.emit('liveDaily');
    return r;
  },

  // ——— 关卡特殊规则 ———
  // 这里只选择规则，各小游戏在开局固定规则后读取相应参数
  modifierFor(shopId, stage) {
    const list = MODIFIERS[shopId];
    if (!list || !stage) return null;
    if (stage % 3 === 0) return list[(stage / 3 - 1) % list.length];
    const seed = gameDayNo() + stage * 7 + shopId.length;
    return seed % 3 === 0 ? list[seed % list.length] : null;
  },

  // ——— 无尽模式强化 ———
  rollPerks(shopId) {
    const pool = PERKS.filter((p) => p.shops === 'all' || p.shops.includes(shopId)), out = [];
    while (out.length < 3 && pool.length) {
      let r = Math.random() * pool.reduce((n, p) => n + (p.rare ? 0.25 : 1), 0), i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].rare ? 0.25 : 1; if (r < 0) break; }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  },
  applyPerk(g, perk) {
    const p = PERKS.find((x) => x.id === perk?.id);
    if (!g || g.dead || !g.endless || g.state !== 'play' || !p || (p.shops !== 'all' && !p.shops.includes(g.id))) return false;
    if (g.perks.interest) g.addScore(g.score * 0.05); // 先结算之前选到的利息，本次首次选择不立刻生息
    g.slow = p.id === 'slow'; // 放慢只持续到下一次选择
    g.perks[p.id] = (g.perks[p.id] || 0) + 1;
    if (p.id === 'shield') g.shield = 1;
    if (p.id === 'heal') { g.lives = Math.min(g.maxLives, g.lives + 1); g.renderLives(); }
    if (p.id === 'gold') g.goldUntil = g.elapsed + 30;
    if (p.id === 'combo') g.comboGuard = 1;
    if (p.id === 'patient') for (const c of g.customers) {
      if (!c || c.state !== 'wait') continue;
      if (Number.isFinite(c.max)) c.patience = c.max;
      if (Number.isFinite(c.patMax)) c.pat = c.patMax;
      if (c.pt) c.pt.style.transform = 'scaleX(1)';
    }
    if (p.id === 'seedrain') { const f = g.gens.flower; f.max += 3; f.n = f.max; f.cd = 0; g.renderPips(); }
    if (p.id === 'bigbar') g.barH = Math.min(1, g.barH * 1.2); // 收线条最多填满整条轨道
    if (p.id === 'lure') g.lure = 3;
    g.setRhythmRate?.(g.slow ? 0.8 : 1); // 裁缝不用压力驱动音符，音乐与谱面必须一起降速
    return true;
  },

  // ——— 图鉴 ———
  book() {
    syncBook();
    return BOOK_TABS.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i, found: !!S.live.book[t.id][i.id] })), claimed: !!S.live.book.claimed[t.id] }));
  },
  claimBook(tabId) {
    const t = this.book().find((x) => x.id === tabId);
    if (!t || t.claimed || t.items.some((i) => !i.found && !i.optional)) return 0;
    S.live.book.claimed[tabId] = true;
    addCoins(t.reward, 'live');
    save();
    bus.emit('liveBook');
    return t.reward;
  },

  // ——— 套装效果 ———
  fx(key, outfit = S.outfit) { return outfitFx(outfit, key); },
  setEffect(outfit = S.outfit) {
    const parts = ['hair', 'dress', 'shoes'].map((k) => CLOTH[outfit[k]]).filter(Boolean);
    const cnt = {};
    for (const c of parts) if (c.set) cnt[c.set] = (cnt[c.set] || 0) + 1;
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (!best || !SET_EFFECTS[best[0]]) return null;
    return { set: best[0], name: SETS[best[0]].name, pieces: best[1], need: 3, active: best[1] >= 3, effect: SET_EFFECTS[best[0]] };
  },

  // ——— 美化度阶段奖励 ———
  milestones(beautyNow = beauty()) { return BEAUTY_REWARDS.map((m, i) => ({ ...m, reached: beautyNow >= m.need, claimed: S.live.miles.includes(i) })); },
  claimMilestone(i) {
    const m = Number.isInteger(i) && BEAUTY_REWARDS[i];
    if (!m || S.live.miles.includes(i) || beauty() < m.need) return 0;
    S.live.miles.push(i);
    grantMile(i);
    addCoins(m.coins, 'live');
    save();
    bus.emit('liveMilestones');
    return m.coins;
  },

  // ——— 新店建造 ———
  project() { const p = S.live.project; return { ...PROJECT, phase: p.phase, paid: p.paid, done: p.phase >= PROJECT.phases.length }; },
  fund(amount) {
    const p = S.live.project, ph = PROJECT.phases[p.phase];
    if (!ph || !Number.isInteger(amount) || amount <= 0) return this.project();
    const payment = Math.min(amount, ph.cost - p.paid);
    if (payment <= 0 || !spend(payment)) return this.project();
    p.paid += payment;
    if (p.paid >= ph.cost) { p.paid = 0; p.phase++; }
    save();
    bus.emit('liveProject');
    return this.project();
  },

  // ——— 节日 ———
  festival(md) { return festivalAt(md); },

  // ——— 居民来访 ———
  // 查询不抽签；只有真正进入后院时才传 entering，避免每帧/开面板反复抽30%概率
  visit(beautyNow = beauty(), entering = false) {
    const unlock = BEAUTY_REWARDS.findIndex((m) => m.unlock === 'visit');
    if (!S.live.miles.includes(unlock)) return null;
    const day = gameDayKey(); // 来访按小镇的日子算
    if (S.live.visit.day !== day) {
      if (!entering || Math.random() >= 0.3) return null;
      const top = [...NPCS].sort((a, b) => (S.npc[b.id]?.t || 0) - (S.npc[a.id]?.t || 0)).slice(0, 3);
      const npc = top[Math.floor(Math.random() * top.length)];
      S.live.visit = { day, npc: npc.id, claimed: false, beauty: Math.max(0, beautyNow) };
      save();
    }
    const v = S.live.visit, npc = NPCS.find((n) => n.id === v.npc);
    if (v.claimed || !npc) return null;
    const line = [...VISIT_LINES].reverse().find((l) => v.beauty >= l.min) || VISIT_LINES[0];
    return { npc, line: line.text, score: Math.min(5, 1 + Math.floor(v.beauty / 200)), gift: { name: '噗灵小礼物', coins: 120 } };
  },
  acceptVisit() {
    if (!this.visit()) return false;
    S.live.visit.claimed = true;
    addCoins(120, 'live');
    save();
    return true;
  },

  // ——— 居民剧情 ———
  story(npcId) { return syncStory(npcId); },

  // ——— 大喵今日迎宾礼 (H5) ———
  welcome() {
    const d = today();
    if (!S.live.welcome || S.live.welcome.date !== d) {
      const seedPool = CROPS.slice(0, 6);
      const dayHash = Number(d.replace(/-/g, '')) || 1;
      const seed = seedPool[dayHash % seedPool.length];
      S.live.welcome = { date: d, claimed: false, coins: 80, seedId: seed.id, seedName: `${seed.name}种子 ×1` };
    }
    return S.live.welcome;
  },
  claimWelcome() {
    const w = this.welcome();
    if (w.claimed) return null;
    w.claimed = true;
    addCoins(w.coins, 'live');
    if (w.seedId) {
      S.seeds[w.seedId] = (S.seeds[w.seedId] || 0) + 1;
      bus.emit('seed', S.seed);
    }
    addFertilizer(S);
    save();
    bus.emit('liveDaily');
    return w;
  },

  // ——— 每日闪购橱窗 (H1) ———
  spotlight() {
    const d = today();
    if (!S.live.spotlight || S.live.spotlight.date !== d || !Array.isArray(S.live.spotlight.items)) {
      const daySeed = Number(d.replace(/-/g, '')) || 20261017;
      const clothPool = CLOTHES.filter((c) => c.price > 0 && !S.owned.includes(c.id));
      const cPick = (clothPool.length ? clothPool : CLOTHES.filter((c) => c.price > 0))[daySeed % Math.max(1, clothPool.length || CLOTHES.length)];
      const decorPool = DECOR.filter((x) => x.price > 0 && !x.mile);
      const dPick = decorPool[(daySeed * 3 + 7) % decorPool.length];
      const sPick = CROPS[(daySeed * 5 + 2) % CROPS.length];
      const items = [];
      if (cPick) items.push({ kind: 'cloth', id: cPick.id, name: cPick.name, orig: cPick.price, price: Math.max(40, Math.round(cPick.price * 0.78)), bought: S.owned.includes(cPick.id) });
      if (dPick) items.push({ kind: 'decor', id: dPick.id, name: dPick.name, orig: dPick.price, price: Math.max(30, Math.round(dPick.price * 0.8)), bought: false });
      if (sPick) items.push({ kind: 'seed', id: sPick.id, name: `${sPick.name}种子 ×3`, count: 3, orig: sPick.seed * 3, price: Math.max(12, Math.round(sPick.seed * 3 * 0.75)), bought: false });
      S.live.spotlight = { date: d, items };
    } else {
      for (const it of S.live.spotlight.items) {
        if (it.kind === 'cloth' && S.owned.includes(it.id)) it.bought = true;
      }
    }
    return S.live.spotlight;
  },
  buySpotlight(idx) {
    const sp = this.spotlight();
    const it = sp.items[idx];
    if (!it || it.bought) return null;
    if (it.kind === 'cloth' && S.owned.includes(it.id)) { it.bought = true; return null; }
    if (!spend(it.price)) return null;
    it.bought = true;
    if (it.kind === 'cloth') {
      if (!S.owned.includes(it.id)) S.owned.push(it.id);
      bus.emit('collection');
      checkQuest();
    } else if (it.kind === 'decor') {
      S.decor[it.id] = (S.decor[it.id] || 0) + 1;
      bus.emit('decorChanged');
    } else if (it.kind === 'seed') {
      S.seeds[it.id] = (S.seeds[it.id] || 0) + (it.count || 3);
      bus.emit('seed', S.seed);
    }
    save();
    bus.emit('liveDaily');
    return it;
  },

  // ——— 周末小镇集市周常单 (H4) ———
  market() {
    const now = new Date();
    const weekKey = `${now.getFullYear()}-W${String(Math.ceil((now.getDate() + 6 - now.getDay()) / 7)).padStart(2, '0')}-${now.getMonth() + 1}`;
    if (!S.live.market || S.live.market.week !== weekKey || !Array.isArray(S.live.market.orders)) {
      S.live.market = {
        week: weekKey,
        orders: [
          { id: 'mk_work', title: '集市帮工周记', desc: '本周累计完成 5 局任意小游戏', stat: 'plays', base: getStat('plays'), need: 5, coins: 260, seed: 'wheat', seedCount: 2, claimed: false },
          { id: 'mk_harvest', title: '田园鲜果篮', desc: '本周累计收获 8 株后院作物或果子', stat: 'harvested', base: getStat('harvested'), need: 8, coins: 240, seed: 'moonflower', seedCount: 1, claimed: false },
          { id: 'mk_fish', title: '河畔渔歌补给', desc: '本周累计在钓场钓起 4 条鱼', stat: 'fish_caught', base: getStat('fish_caught'), need: 4, coins: 220, decor: 'step_moss', claimed: false },
        ],
      };
    }
    // 同一会话里恢复/替换旧数据后也沿用幂等迁移，不必等重启才修正别名。
    const compatible = migrateMarketOrders(S);
    if (compatible !== S) S.live.market = compatible.live.market;
    const orders = S.live.market.orders.map((o) => {
      const cur = (o.carriedProgress || 0) + Math.max(0, getStat(o.stat) - (o.base || 0));
      return { ...o, cur, done: cur >= o.need };
    });
    return { week: weekKey, orders };
  },
  claimMarket(id) {
    const m = this.market();
    const idx = S.live.market.orders.findIndex((o) => o.id === id);
    const view = m.orders[idx];
    if (!view || !view.done || view.claimed) return null;
    S.live.market.orders[idx].claimed = true;
    addCoins(view.coins, 'live');
    if (view.seed) {
      S.seeds[view.seed] = (S.seeds[view.seed] || 0) + (view.seedCount || 1);
      bus.emit('seed', S.seed);
    }
    if (view.decor) {
      S.decor[view.decor] = (S.decor[view.decor] || 0) + 1;
      bus.emit('decorChanged');
    }
    save();
    bus.emit('liveDaily');
    return view;
  },
};
