// 已摆家具的直接拖动：只预览，松手后一次性记账；取消不会先拆家具或改库存。
import { disposeSceneResources } from '../../core/kit.js';
import { S, bus, save } from '../../core/state.js';
import { audio } from '../../core/audio.js';
import { buildDecor } from '../../models/props.js';
import { YARD_LEVEL_HEIGHT, isYardStructure, yardLevel } from '../yard-building.js';

const copy = value => JSON.parse(JSON.stringify(value));

// 可编辑模型优先，格子仅作地毯等薄物件的兜底；自由建造按当前楼层射线选择。
export function furnitureAt(decor, event) {
  const hit = decor.pickBuildObject(event.clientX, event.clientY);
  if (hit || decor.cfg.freeBuild || !decor.cursor) return hit;
  const tile = decor.cellKey(Math.floor(decor.cursor.fx), Math.floor(decor.cursor.fz));
  return decor.occ.get(tile) || decor.occUnder.get(tile) || null;
}

export function prepareFurnitureDrag(decor, event) {
  if (decor.sel || decor.floorSel || decor.wallSel || !decor.cursor) return;
  const rec = furnitureAt(decor, event);
  if (!rec) return;
  decor.furnitureDrag = {
    rec, origin: copy(rec.e), start: { ...decor.cursor }, previousFocus: decor.focus,
    pointerId: event.pointerId, threshold: event.pointerType === 'mouse' ? 10 : 24,
    active: false, blocked: false, target: null, ok: false, preview: null,
  };
  try { decor.town.canvasCapture?.(event.pointerId); } catch (_) { /* 旧浏览器 */ }
}

function sourceCurrent(decor, drag) {
  const e = drag.rec.e, old = drag.origin;
  return decor.entries.includes(drag.rec) && S[decor.pk].includes(e) &&
    e.id === old.id && e.gx === old.gx && e.gz === old.gz && e.rot === old.rot && yardLevel(e) === yardLevel(old);
}

function beginFurnitureDrag(decor, drag) {
  if (!sourceCurrent(decor, drag)) return false;
  if (decor.cropLocked(drag.rec.e)) return decor.refuse('田里还有作物，先收获后再移动');
  if (!decor.canRemove(drag.rec)) return decor.refuse(decor.placementError || '请先收回依赖这件建筑的物件');
  const id = drag.rec.e.id;
  const preview = decor.cfg.key === 'house' && id !== 'fence' ? decor.houseObject(id) : buildDecor(id);
  preview.userData?.applyVariant?.(drag.rec.e);
  if (id === 'fence') preview.position.set(0, 0, -.5);
  preview.traverse(object => { if (object.isMesh) object.castShadow = false; });
  drag.preview = preview;
  drag.visible = drag.rec.obj.visible;
  drag.rec.obj.visible = false;
  drag.active = true;
  decor.ghostHolder.add(preview);
  decor.ghostTick = preview.userData.tick;
  decor.ghostIsStructure = isYardStructure(id);
  decor.ghostHolder.position.y = 0;
  // 拖动时只显示落点提示，避免操作条挡住手指；结束后再恢复/选择家具。
  decor.setFocus(null);
  return true;
}

// 不改变原模型的变换/碰撞/占格；ghost 不进入静态家具批次，拖动中无需重建批次。
export function updateFurnitureDrag(decor) {
  const drag = decor.furnitureDrag;
  if (!drag?.active) return false;
  if (!sourceCurrent(decor, drag)) { cancelFurnitureDrag(decor); return false; }
  const e = drag.origin, cursor = decor.cursor;
  const gx = cursor ? Math.round(e.gx + cursor.fx - drag.start.fx) : e.gx;
  const gz = cursor ? Math.round(e.gz + cursor.fz - drag.start.fz) : e.gz;
  const [w, d] = decor.size(e.id, e.rot);
  drag.target = { ...e, gx, gz };
  drag.ok = !!cursor && decor.canPlace(e.id, gx, gz, e.rot, drag.rec);
  decor.ghost.visible = true;
  decor.ghost.position.set(decor.lot.x0 + gx + w / 2,
    yardLevel(e) * YARD_LEVEL_HEIGHT + (decor.ghostIsStructure ? 0 : .05), decor.lot.z0 + gz + d / 2);
  decor.ghostHolder.rotation.y = e.rot * Math.PI / 2;
  if (drag.preview._furnitureShape) decor.applyHouseFit(drag.preview, drag.target, decor.houseWalls(), true);
  decor.plate.scale.set(w * .96, d * .96, 1);
  decor.plate.material.color.setHex(drag.ok ? 0x7fe0a0 : 0xff7f8f);
  const stamp = `${drag.ok}|${decor.placementError}`;
  if (stamp !== drag.stamp) { drag.stamp = stamp; bus.emit('decorPreview'); }
  return true;
}

export function moveFurnitureDrag(decor) {
  const drag = decor.furnitureDrag;
  if (!drag) return false;
  if (!drag.active && !drag.blocked && decor.dragDistance > drag.threshold) {
    if (!beginFurnitureDrag(decor, drag)) drag.blocked = true;
  }
  if (drag.active) updateFurnitureDrag(decor);
  return true; // 有候选家具时不把同一手势解释成平移镜头。
}

export function cancelFurnitureDrag(decor) {
  const drag = decor.furnitureDrag;
  if (!drag) return false;
  decor.furnitureDrag = null;
  if (!drag.active) return false;
  drag.rec.obj.visible = drag.visible;
  decor.ghostHolder.remove(drag.preview);
  disposeSceneResources(drag.preview);
  decor.ghostTick = null;
  decor.ghostIsStructure = false;
  decor.ghostHolder.position.y = .12;
  decor.setFocus(decor.entries.includes(drag.previousFocus) ? drag.previousFocus : null);
  bus.emit('decorPreview');
  return true;
}

export function finishFurnitureDrag(decor, event) {
  const drag = decor.furnitureDrag;
  if (!drag) return false;
  if (!drag.active) { decor.furnitureDrag = null; return drag.blocked; }
  // 捕获指针只为了收到结束事件；松手落在工具栏/屏幕外仍取消。
  const inside = document.elementFromPoint(event.clientX, event.clientY) === decor.town.inputCanvas;
  decor.cursor = decor.tileAt(event);
  updateFurnitureDrag(decor);
  const target = drag.target;
  const valid = inside && drag.ok && sourceCurrent(decor, drag) &&
    !decor.cropLocked(drag.rec.e) && decor.canRemove(drag.rec) &&
    decor.canPlace(target.id, target.gx, target.gz, target.rot, drag.rec);
  const reason = decor.placementError;
  cancelFurnitureDrag(decor);
  if (!valid) {
    if (inside) { audio.sfx('error'); decor.refuse(reason || '这里放不下，家具已回到原位'); }
    return true;
  }
  const e = drag.rec.e;
  if (e.gx === target.gx && e.gz === target.gz) { decor.setFocus(drag.rec); return true; }
  const before = decor.snapshot();
  if (decor.focus === drag.rec) decor.setFocus(null);
  decor.removeObj(drag.rec);
  // 保留原存档项和顺序（包括灯开关等字段）；移动不经过仓库，也不增加购买费用。
  e.gx = target.gx; e.gz = target.gz;
  const next = decor.addObj(e, false);
  const placement = { id: e.id, e: copy(e), zone: decor.cfg.key };
  const edit = decor.recordEdit(before, '移动家具', { placements: [placement] });
  bus.emit('decorPlaced', { ...placement, obj: next.obj, provisional: true, editId: edit.id });
  audio.sfx('place');
  save();
  decor.setFocus(next);
  bus.emit('decorChanged');
  return true;
}
