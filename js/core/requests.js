// 居民委托：每位居民同一时间有一个委托，接下 → 完成条件 → 回去交付，冷却一会儿后换下一个
import { S, bus, save, addCoins, stat, getStat, FRIEND_AT } from './state.js';
import { REQS, CROP, CLOTH, STYLES, SHOPS } from '../data.js';
import { RESIDENTS as NPCS } from '../live/people.js';
import { outfitFx } from '../live/effects.js';

const COOL = 90 * 1000; // 交付后隔这么久（真实时间）出现下一个委托
const isNight = () => S.clock >= 0.75 && S.clock < 0.95;
const R = () => (S.req = S.req || {});

// 某位居民当前的委托状态：offer 可接 / active 进行中 / ready 可交付 / cool 暂时没有
export function reqOf(id) {
  const st = (R()[id] = R()[id] || { i: 0, done: 0 });
  const list = REQS[id], def = list[st.i % list.length];
  const round = Math.floor(st.i / list.length);
  const base = Math.round((def.reward * (1 + round * 0.2)) / 10) * 10;
  const reward = Math.round(base * (1 + outfitFx(S.outfit, 'floral')));
  const need = def.n || 1;
  let cur = 0, state = 'offer';
  if (st.until && Date.now() < st.until) state = 'cool';
  else if (st.acc) {
    if (def.type === 'deliver') cur = S.crops[def.crop] || 0;
    else if (def.type === 'stat') cur = getStat(def.stat) - (st.base || 0);
    else if (def.type === 'score') cur = st.prog || 0;
    else if (def.type === 'wear') cur = Object.values(S.outfit).filter((c) => CLOTH[c] && CLOTH[c].style === def.style).length;
    else if (def.type === 'night') cur = isNight() ? 1 : 0;
    state = cur >= need ? 'ready' : 'active';
  }
  return { id, npc: NPCS.find((n) => n.id === id), def, st, state, cur: Math.max(0, Math.min(cur, need)), need, reward, wait: st.until ? Math.max(0, Math.ceil((st.until - Date.now()) / 1000)) : 0 };
}
export function acceptReq(id) {
  const r = reqOf(id);
  if (r.state !== 'offer') return false;
  r.st.acc = 1;
  r.st.prog = 0;
  if (r.def.type === 'stat') r.st.base = getStat(r.def.stat);
  save();
  bus.emit('req');
  return true;
}
export function turnInReq(id) {
  const r = reqOf(id);
  if (r.state !== 'ready') return 0;
  if (r.def.type === 'deliver') { S.crops[r.def.crop] -= r.need; if (S.crops[r.def.crop] <= 0) delete S.crops[r.def.crop]; }
  const st = r.st;
  st.acc = 0; st.prog = 0; st.base = 0;
  st.i++; st.done++;
  st.until = Date.now() + COOL;
  // 帮忙会拉近关系：相当于多聊了两次；刚好跨过「好朋友」的门槛时，留到下次聊天再触发那份礼物
  const f = (S.npc[id] = S.npc[id] || { t: 0 });
  const gain = 2 * (1 + outfitFx(S.outfit, 'heart'));
  f.t = f.t < FRIEND_AT ? Math.min(FRIEND_AT - 1, f.t + gain) : f.t + gain;
  addCoins(r.reward, 'req');
  stat('reqs');
  save();
  bus.emit('req');
  return r.reward;
}
// 打完一局工：更新「单局营业额」类委托的进度
bus.on('played', ({ id, total }) => {
  let hit = false;
  for (const n of NPCS) {
    const st = R()[n.id];
    if (!st || !st.acc) continue;
    const def = REQS[n.id][st.i % REQS[n.id].length];
    if (def.type === 'score' && def.shop === id && total > (st.prog || 0)) { st.prog = total; hit = true; }
  }
  if (hit) { save(); bus.emit('req'); }
});
export const activeReqs = () => NPCS.map((n) => reqOf(n.id)).filter((r) => r.state === 'active' || r.state === 'ready');
export const reqPeople = () => NPCS.filter((n) => R()[n.id] && R()[n.id].done > 0).length;
