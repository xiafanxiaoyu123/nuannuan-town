// 装修事务：延迟购买结算、历史撤销和布局方案。金额/库存差量与提交事件在这里保持原有顺序。
import { DECO, FLOOR } from '../../data.js';
import { S, bus, spend, stat, save } from '../../core/state.js';
import { MAX_YARD_LEVEL, isYardStructure, yardLevel } from '../yard-building.js';
import { LOCAL_PLAY } from '../../core/local-play-mode.js';

const key = (x, z) => x + ',' + z;
const copy = value => JSON.parse(JSON.stringify(value));
let editSerial = 0;

/** @param {import('../decor.js').DecorSys} decor */
export function snapshot(decor) { return { placed: copy(S[decor.pk]), floor: copy(S[decor.fk]), walls: decor.cfg.key==='house'?copy(S.wallsIn||[]):[], inventory: { ...S.decor } }; }

/** @param {import('../decor.js').DecorSys} decor */
export function commitEdit(decor, edit) {
  for (const [name, n] of Object.entries(edit.stats)) if (n) stat(name, n);
  if (edit.placements.length) bus.emit('decorEditCommitted', { editId: edit.id, placements: copy(edit.placements) });
}

/** @param {import('../decor.js').DecorSys} decor */
export function clearHistory(decor, commit = true) {
  decor.cancelPointer();
  const old = decor.history.splice(0); decor.pendingMove = null;
  if (commit) for (const edit of old) decor.commitEdit(edit);
  decor.editEvent();
}

/** @param {import('../decor.js').DecorSys} decor */
export function recordEdit(decor, before, label, { cost = 0, deferredCost = 0, stats = {}, placements = [], merge = null } = {}) {
  const after = decor.snapshot(), delta = {};
  for (const id of new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory)])) {
    const n = (after.inventory[id] || 0) - (before.inventory[id] || 0); if (n) delta[id] = n;
  }
  const edit = { id: ++editSerial, label, before: { placed: before.placed, floor: before.floor, walls: before.walls }, after: { placed: after.placed, floor: after.floor, walls: after.walls }, delta, cost, deferredCost, stats, placements };
  if (merge && decor.history.at(-1) === merge) {
    merge.after = edit.after; merge.cost += cost; merge.deferredCost = (merge.deferredCost || 0) + edit.deferredCost;
    for (const [id, n] of Object.entries(delta)) merge.delta[id] = (merge.delta[id] || 0) + n;
    for (const [id, n] of Object.entries(stats)) merge.stats[id] = (merge.stats[id] || 0) + n;
    merge.placements.push(...placements); decor.editEvent(); return merge;
  }
  decor.history.push(edit);
  if (decor.history.length > 30) decor.commitEdit(decor.history.shift());
  decor.editEvent(); return edit;
}

/** @param {import('../decor.js').DecorSys} decor */
export function commitPendingCost(decor, silent = false) {
  if (LOCAL_PLAY) { decor.pendingCost = 0; return true; }
  const n = Math.max(0, Math.round(decor.pendingCost || 0));
  if (!n) return true;
  if (S.coins < n) {
    if (!silent) decor.refuse(`家具总计需要 ${n} 噗灵，还差 ${n - S.coins}；请收回部分家具后再完成装修`);
    return false;
  }
  if (!spend(n)) return false;
  decor.pendingCost = 0;
  bus.emit('decorChanged');
  return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function finishStroke(decor) {
  const stroke = decor.stroke; decor.stroke = null;
  if (stroke?.changed) decor.recordEdit(stroke.before, '铺地', { cost: stroke.cost, stats: { floored: stroke.count } });
}

/** @param {import('../decor.js').DecorSys} decor */
export function undo(decor) {
  if (decor.furnitureDrag?.active) { decor.cancelPointer(); return true; }
  if(decor.town.partitions?.drag?.decor===decor){decor.cancelPointer();return true;}
  decor.finishStroke();
  if (!decor.canUndo) return false;
  const edit = decor.history.at(-1);
  if (JSON.stringify(S[decor.pk]) !== JSON.stringify(edit.after.placed) || JSON.stringify(S[decor.fk]) !== JSON.stringify(edit.after.floor)) return decor.refuse('布局已经变化，这一步不能撤销');
  if(decor.cfg.key==='house'&&JSON.stringify(S.wallsIn||[])!==JSON.stringify(edit.after.walls||[]))return decor.refuse('隔断已经变化，这一步不能撤销');
  if (!decor.cropSafe(edit.before.placed)) return decor.refuse('这块田已经种上作物，先收获后再撤销');
  if (!LOCAL_PLAY) for (const [id, n] of Object.entries(edit.delta)) if ((S.decor[id] || 0) - n < 0) return decor.refuse('需要收回的家具已在别处使用，暂时不能撤销');
  const valid = decor.validateLayout({ version: 1, zone: decor.cfg.key, name: '', ...edit.before }, false);
  if (!valid.ok) return decor.refuse(valid.error);
  decor.rebuildObjects(edit.before.placed, edit.before.floor, edit.before.walls||[]);
  if (!LOCAL_PLAY) for (const [id, n] of Object.entries(edit.delta)) S.decor[id] = (S.decor[id] || 0) - n;
  if (edit.deferredCost) decor.pendingCost = Math.max(0, decor.pendingCost - edit.deferredCost);
  const immediateCost = edit.cost - (edit.deferredCost || 0);
  if (!LOCAL_PLAY && immediateCost) { S.coins += immediateCost; bus.emit('coins', S.coins, immediateCost, 'decorRefund'); }
  decor.history.pop(); decor.pendingMove = null;
  bus.emit('decorUndone', { editId: edit.id });
  save(); decor.editEvent(); bus.emit('decorChanged'); return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function layoutSlots(decor) {
  if (!S.decorLayouts || typeof S.decorLayouts !== 'object' || Array.isArray(S.decorLayouts)) S.decorLayouts = {};
  for (const zone of ['house', 'home', 'build']) if (!Array.isArray(S.decorLayouts[zone])) S.decorLayouts[zone] = [null, null, null];
  return S.decorLayouts[decor.cfg.key];
}

/** @param {import('../decor.js').DecorSys} decor */
export function saveLayout(decor, slot, name) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, error: '没有这个方案位置' };
  decor.finishStroke();
  const plan = { version: 1, zone: decor.cfg.key, name: String(name || '方案 ' + (slot + 1)).trim().slice(0, 20) || '方案 ' + (slot + 1), placed: copy(S[decor.pk]), floor: copy(S[decor.fk]) };
  if(decor.cfg.key==='house')plan.walls=copy(S.wallsIn||[]);
  const result = decor.validateLayout(plan, false); if (!result.ok) return result;
  decor.layoutSlots()[slot] = plan; save(); bus.emit('decorLayoutsChanged', decor); return { ok: true, plan };
}

/** @param {import('../decor.js').DecorSys} decor */
export function deleteLayout(decor, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return false;
  decor.layoutSlots()[slot] = null; save(); bus.emit('decorLayoutsChanged', decor); return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function validateLayout(decor, plan, checkSupply = true) {
  const fail = error => ({ ok: false, error, missing: [], missingCount: 0, cost: 0, furnitureCount: Array.isArray(plan?.placed) ? plan.placed.length : 0 });
  if (!plan || plan.version !== 1 || plan.zone !== decor.cfg.key || !Array.isArray(plan.placed) || !plan.floor || typeof plan.floor !== 'object' || Array.isArray(plan.floor)) return fail('方案损坏或不属于这里');
  const capacity = decor.lot.cols * decor.lot.rows;
  if (plan.placed.length > capacity * (decor.cfg.freeBuild ? (MAX_YARD_LEVEL + 1) * 6 : 1) || Object.keys(plan.floor).length > capacity) return fail('方案超出房间范围');
  const occupied = new Set(), occupiedUnder = new Set(), need = {}, supply = { ...S.decor };
  if (decor.cfg.freeBuild) {
    const yard = decor.validateYard(plan.placed);
    if (!yard.ok) return fail(yard.error);
  }
  for (const e of S[decor.pk]) supply[e.id] = (supply[e.id] || 0) + 1;
  for (const e of plan.placed) {
    if (!e || !Object.hasOwn(DECO, e.id) || !Number.isInteger(e.gx) || !Number.isInteger(e.gz) || !Number.isInteger(e.rot) || e.rot < 0 || e.rot > 3) return fail('方案里有无效家具');
    if (!decor.fitsZone(e)) return fail('这个物件不适合当前区域，请在建造岛搭建筑、在房间里放厨卫家具');
    if (decor.cfg.key === 'house' && (isYardStructure(e.id) || yardLevel(e) !== 0 || DECO[e.id].outdoorOnly)) return fail('院子建筑仅限室外使用');
    const [w, d] = decor.size(e.id, e.rot);
    for (let x = e.gx; x < e.gx + w; x++) for (let z = e.gz; z < e.gz + d; z++) {
      const k = decor.cellKey(x, z, yardLevel(e));
      const used = DECO[e.id].under ? occupiedUnder : occupied;
      if (!decor.inBounds(x, z) || decor.blockedTiles.has(key(x, z)) || !decor.cfg.freeBuild && used.has(k)) return fail('方案里有家具重叠、挡住固定建筑或超出当前范围');
      used.add(k);
    }
    need[e.id] = (need[e.id] || 0) + 1;
  }
  let cost = 0, floorCount = 0;
  for (const [k, id] of Object.entries(plan.floor)) {
    const [x, z] = k.split(',').map(Number), f = FLOOR[id];
    if (!/^\d+,\d+$/.test(k) || !Number.isInteger(x) || !Number.isInteger(z) || key(x,z) !== k || !decor.inBounds(x,z) || decor.blockedTiles.has(k) || !Object.hasOwn(FLOOR,id) || !f || f.erase) return fail('方案里有无效或越界地板');
    if (S[decor.fk][k] !== id) { cost += f.price || 0; floorCount++; }
  }
  if (!decor.cropSafe(plan.placed)) return fail('有作物的田必须留在原处；请先收获，果树田需要保留');
  if(decor.cfg.key==='house'&&decor.town.partitions){const walls=decor.town.partitions.validate(plan.walls||[],{placed:plan.placed});if(!walls.ok)return fail(walls.error);}
  if (LOCAL_PLAY) cost = 0;
  const missing = LOCAL_PLAY ? [] : Object.entries(need).filter(([id,n]) => n > (supply[id] || 0)).map(([id,n]) => ({id, name: DECO[id].name, count: n - (supply[id] || 0)}));
  const result = { ok: true, cost, floorCount, furnitureCount: plan.placed.length, wallCount:plan.walls?.length||0, missing, missingCount: missing.reduce((n,m)=>n+m.count,0), need, supply };
  if (checkSupply && missing.length) return { ...result, ok: false, error: '缺少家具：' + missing.map(m => m.name + ' ×' + m.count).join('、') };
  if (!LOCAL_PLAY && checkSupply && S.coins - (decor.pendingCost || 0) < cost) return { ...result, ok: false, error: '铺地需要 ' + cost + ' 噗灵，还差 ' + (cost - (S.coins - (decor.pendingCost || 0))) };
  return result;
}

/** @param {import('../decor.js').DecorSys} decor */
export function previewLayout(decor, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, error: '没有这个方案位置' };
  return decor.validateLayout(decor.layoutSlots()[slot]);
}

/** @param {import('../decor.js').DecorSys} decor */
export function applyLayout(decor, slot) {
  if (!decor.active || decor.town.zone !== decor.cfg.key) return { ok: false, error: '请先在这里开启装修' };
  const result = decor.previewLayout(slot); if (!result.ok) return result;
  decor.finishStroke();
  const plan = decor.layoutSlots()[slot], before = decor.snapshot();
  if (!LOCAL_PLAY && result.cost && (S.coins - (decor.pendingCost || 0) < result.cost || !spend(result.cost))) return { ...result, ok: false, error: '噗灵不够' };
  if (!LOCAL_PLAY) for (const [id, n] of Object.entries(result.supply)) S.decor[id] = n - (result.need[id] || 0);
  decor.rebuildObjects(plan.placed, plan.floor, plan.walls||[]);
  const edit = decor.recordEdit(before, '应用方案', { cost: result.cost, stats: { floored: result.floorCount } });
  decor.pendingMove = null; save(); bus.emit('decorChanged'); bus.emit('decorLayoutApplied', { editId: edit.id, zone: decor.cfg.key });
  return result;
}
