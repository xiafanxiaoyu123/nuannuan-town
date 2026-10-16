// 家具动作：移动、旋转、替换、收回和卖出。通过 DecorSys 的事务接口记录可撤销变更。
import { THREE } from '../../core/kit.js';
import { DECO } from '../../data.js';
import { S, bus, stat, save, addCoins, decorSellPrice } from '../../core/state.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/fx.js';
import { yardLevel } from '../yard-building.js';
import { LOCAL_PLAY } from '../../core/local-play-mode.js';
import { SWATCHABLE_IDS, SWATCH_FAMILIES } from '../../shared/home-themes.js';
import { furnitureAt } from './dragging.js';

const copy = value => JSON.parse(JSON.stringify(value));

/** @param {import('../decor.js').DecorSys} decor */
export function focusSwatch(decor) {
  const rec = decor.focus;
  if (!rec || !SWATCHABLE_IDS.has(rec.e.id)) return false;
  if (!S[decor.pk].includes(rec.e)) { decor.reload(); return decor.refuse('家具已刷新，请重新选择'); }
  decor.finishStroke();
  const before = decor.snapshot();
  const nextIdx = ((Number(rec.e.swatch) || 0) + 1) % SWATCH_FAMILIES.length;
  if (nextIdx === 0) delete rec.e.swatch;
  else rec.e.swatch = nextIdx;
  rec.obj.userData?.applyVariant?.(rec.e);
  decor.town.renderOptimizer?.invalidateDecor();
  audio.sfx('tab');
  fx.sparkle(decor.town.scene, rec.obj.position.clone().setY(0.8), 6, ['#ffd24f', SWATCH_FAMILIES[nextIdx].color]);
  decor.recordEdit(before, '家具换色');
  save();
  decor.setFocus(rec);
  bus.emit('toast', `已切换为「${SWATCH_FAMILIES[nextIdx].name}」配色`);
  bus.emit('decorChanged');
  return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function focusMove(decor) {
  const rec = decor.focus;
  if (!rec) return;
  if (!S[decor.pk].includes(rec.e)) { decor.reload(); return decor.refuse('家具已刷新，请重新选择'); }
  if (decor.cropLocked(rec.e)) return decor.refuse('田里还有作物，不能移动');
  if (!decor.canRemove(rec)) return decor.refuse(decor.placementError || '请先收回依赖这件建筑的物件');
  const before = decor.snapshot();
  const { id, rot } = rec.e;
  decor.takeOut(rec);
  if (!LOCAL_PLAY) S.decor[id] = (S.decor[id] || 0) + 1;
  audio.sfx('remove');
  decor.rot = rot;
  decor.buildLevel = yardLevel(rec.e); decor.rebuildGrid();
  decor.select(id);
  decor.cursor = { fx: rec.e.gx + decor.size(id, rot)[0] / 2, fz: rec.e.gz + decor.size(id, rot)[1] / 2 };
  decor.updateGhost();
  decor.pendingMove = decor.recordEdit(before, '移动家具');
  decor.pendingMove.moveId = id;
  decor.pendingMove.entry=copy(rec.e);
  save();
  bus.emit('decorChanged');
}

/** @param {import('../decor.js').DecorSys} decor */
export function focusRotate(decor) {
  const rec = decor.focus;
  if (!rec) return;
  if (!S[decor.pk].includes(rec.e)) { decor.reload(); return decor.refuse('家具已刷新，请重新选择'); }
  if (decor.cropLocked(rec.e)) return decor.refuse('田里还有作物，不能旋转');
  const before = decor.snapshot();
  const e = rec.e, old = e.rot;
  // 原地转 90°；转过去放不下就再转，最多转一圈
  let rot = old, ok = false;
  for (let i = 0; i < 4 && !ok; i++) { rot = (rot + 1) % 4; ok = decor.canPlace(e.id, e.gx, e.gz, rot, rec); }
  if (!ok || rot === old) { audio.sfx('error'); return decor.refuse('旁边太挤了，转不过来——先把它移到宽敞一点的地方'); }
  decor.takeOut(rec);
  e.rot = ok ? rot : old;
  S[decor.pk].push(e);
  const nr = decor.addObj(e, false);
  audio.sfx('tab'); decor.recordEdit(before, '旋转家具', { stats: { rotated: 1 } });
  save();
  decor.setFocus(nr);
}

/** @param {import('../decor.js').DecorSys} decor */
export function replaceBuildWall(decor, id) {
  const rec=decor.focus, kinds=['yard_wall','yard_door','yard_window'];
  if(!decor.active||!decor.cfg.freeBuild||!rec||!S[decor.pk].includes(rec.e)||!kinds.includes(id)||!kinds.includes(rec.e.id)||id===rec.e.id)return false;
  if(!decor.canPlace(id,rec.e.gx,rec.e.gz,rec.e.rot,rec))return decor.refuse(decor.placementError);
  const owned=LOCAL_PLAY||(S.decor[id]||0)>0,cost=owned?0:DECO[id].price;
  if(!LOCAL_PLAY&&decor.pendingCost+cost>S.coins)return decor.refuse('更换墙体的金币不足，请先收回未结算物件');
  decor.finishStroke();
  const before=decor.snapshot(),entry={...rec.e,id},oldId=rec.e.id;
  // Validate the complete replacement before removing anything. Rooms and
  // upper-floor support never pass through an invalid intermediate state.
  decor.takeOut(rec);
  if(!LOCAL_PLAY){S.decor[oldId]=(S.decor[oldId]||0)+1;if(owned)S.decor[id]--;else decor.pendingCost+=cost;}
  S[decor.pk].push(entry);
  const next=decor.addObj(entry,false),placement={id,e:copy(entry),zone:decor.cfg.key};
  const edit=decor.recordEdit(before,'更换墙体',{cost,deferredCost:cost,placements:[placement]});
  bus.emit('decorPlaced',{...placement,obj:next.obj,provisional:true,editId:edit.id});
  decor.setFocus(next);audio.sfx('place');save();bus.emit('decorChanged');return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function focusStore(decor, sell) {
  const rec = decor.focus;
  if (!rec) return;
  if (!S[decor.pk].includes(rec.e)) { decor.reload(); return decor.refuse('家具已刷新，请重新选择'); }
  if (decor.cropLocked(rec.e)) return decor.refuse('田里还有作物，不能收回或卖出');
  if (!decor.canRemove(rec)) return decor.refuse(decor.placementError || '请先收回依赖这件建筑的物件');
  decor.finishStroke();
  if (!LOCAL_PLAY && sell && decor.pendingCost > 0 && S.coins + decorSellPrice(rec.e.id) < decor.pendingCost) {
    return decor.refuse(`待结算家具需 ${decor.pendingCost} 噗灵，卖出后仍差 ${decor.pendingCost - S.coins - decorSellPrice(rec.e.id)}，请先撤销未付款家具`);
  }
  const before = decor.snapshot();
  if (sell) decor.clearHistory(true);
  const id = rec.e.id, pos = rec.obj.position.clone();
  decor.takeOut(rec);
  if (sell) {
    const v = LOCAL_PLAY ? 0 : decorSellPrice(id);
    addCoins(v, 'recycle');
    audio.sfx('coin');
    stat('recycled');
    fx.sparkle(decor.town.scene, pos.setY(0.8), 10, ['#ffd24f', '#ffffff']);
    bus.emit('note', LOCAL_PLAY ? `已移除「${DECO[id].name}」，本地试玩仍可无限取用` : `卖掉了「${DECO[id].name}」 +${v}`);
    bus.emit('toast', '卖出不能撤销，之前的装修操作已完成');
  } else {
    if (!LOCAL_PLAY) S.decor[id] = (S.decor[id] || 0) + 1;
    audio.sfx('remove');
    decor.recordEdit(before, '收回家具');
  }
  save();
  decor.setFocus(null);
  bus.emit('decorChanged');
}

/** @param {import('../decor.js').DecorSys} decor */
export function takeOut(decor, rec) {
  const i = S[decor.pk].indexOf(rec.e);
  if (i < 0) return false;
  decor.removeObj(rec);
  S[decor.pk].splice(i, 1);
  if (decor.focus === rec) decor.setFocus(null);
  return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function storeAll(decor) {
  decor.finishStroke();
  const before = decor.snapshot();
  decor.selectFloor(null);
  for (const rec of [...decor.entries]) {
    if (decor.cropLocked(rec.e)) continue;
    if (!decor.takeOut(rec)) continue;
    if (!LOCAL_PLAY) S.decor[rec.e.id] = (S.decor[rec.e.id] || 0) + 1;
  }
  if (JSON.stringify(before.placed) !== JSON.stringify(S[decor.pk])) decor.recordEdit(before, '收回家具');
  save();
  bus.emit('decorChanged');
}

// 指针确认合法落点后执行一次放置；移动合并历史、待结算金额与事件顺序保持在同一动作内。
/** @param {import('../decor.js').DecorSys} decor */
export function placeSelection(decor) {
  decor.updateGhost();
  const a = decor.anchor();
  if (!a || !decor.ghostOk) { audio.sfx('error'); if (decor.placementError) decor.refuse(decor.placementError); return; }
  const def = DECO[decor.sel];
  const before = decor.snapshot(), id = decor.sel;
  const moving = decor.pendingMove && decor.pendingMove.moveId === id && decor.history.at(-1) === decor.pendingMove ? decor.pendingMove : null;
  const fromInventory = LOCAL_PLAY || (S.decor[id] || 0) > 0;
  const cost = fromInventory ? 0 : def.price;
  if (!LOCAL_PLAY) {
    if ((S.decor[decor.sel] || 0) > 0) S.decor[decor.sel]--;
    else if (def.only) { decor.select(null); bus.emit('note', `「${def.name}」是礼物，仓库里的已经摆完了`); return; }
    else if (decor.pendingCost + def.price > S.coins) { decor.refuse(`当前装修待结算已达 ${decor.pendingCost} 噗灵，再放置需要 ${def.price}，金币不够`); return; }
  }
  if (!fromInventory) decor.pendingCost += def.price;
  const entry = { ...(moving?.entry||{}), id: decor.sel, gx: a.gx, gz: a.gz, rot: a.rot===undefined?decor.rot:a.rot };
  if (decor.cfg.freeBuild) entry.level = decor.buildLevel;
  S[decor.pk].push(entry);
  const rec = decor.addObj(entry);
  audio.sfx('place');
  fx.sparkle(decor.town.scene, rec.obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 8);
  const placement = { id, e: copy(entry), zone: decor.cfg.key };
  const edit = decor.recordEdit(before, moving ? '移动家具' : '放置家具', { cost, deferredCost: moving ? 0 : cost, stats: moving ? {} : { placed: 1 }, placements: [placement], merge: moving });
  decor.pendingMove = null;
  bus.emit('decorPlaced', { ...placement, obj: rec.obj, provisional: true, editId: edit.id });
  save();
  if (!decor.continuous) decor.select(null);
  else decor.updateGhost();
  bus.emit('decorChanged');
}

// 整理模式才选择已放置物；有作物的普通田拒绝，果树田仍走原铲除入口。
/** @param {import('../decor.js').DecorSys} decor */
export function pickSelection(decor, e) {
  // 先明确开启整理模式，再选择已摆好的家具，防止放完后的第二次误触进入操作条。
  // 先拿上面的家具；这一格只有地毯时才拿地毯
  const rec = furnitureAt(decor, e);
  if (!rec) { if (decor.focus) { audio.sfx('tab'); decor.setFocus(null); } return; }
  if (rec.e.id === 'plot' && decor.town.farm.hasCrop(rec.e)) { audio.sfx('error'); bus.emit('toast', '这块田里还有作物，先收获了再动它'); return; }
  if (rec.e.id === 'bigplot' && decor.town.farm.hasCrop(rec.e)) {
    // 种着果树的田挪不动：给一个铲除入口，铲掉之后田就空了，可以随便搬
    audio.sfx('tab');
    bus.emit('shovelTree', rec);
    return;
  }
  audio.sfx('tab');
  decor.setFocus(rec === decor.focus ? null : rec);
}
