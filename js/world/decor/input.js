// 装修输入：键盘/指针路由、拖动门限、隔断捕获和取消。具体家具动作委托 editing。
import { clamp } from '../../core/util.js';
import { YARD_LEVEL_HEIGHT, yardLevel } from '../yard-building.js';
import { app } from '../../core/app.js';
import { placeSelection, pickSelection } from './editing.js';
import { prepareFurnitureDrag, moveFurnitureDrag, finishFurnitureDrag, cancelFurnitureDrag } from './dragging.js';

/** @param {import('../decor.js').DecorSys} decor */
export function onKey(decor, e) {
  if (decor.furnitureDrag?.active || decor.furnitureDrag?.blocked) {
    if (e.code === 'Escape' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ')) { e.preventDefault(); decor.cancelPointer(); }
    return;
  }
  if (decor.cameraMode !== 'place') {
    if (e.code === 'Escape') { e.preventDefault(); decor.setCameraMode('place'); }
    return;
  }
  if(decor.town.partitions?.drag?.decor===decor&&((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'||e.code==='Escape')){e.preventDefault();decor.cancelPointer();return;}
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); decor.undo(); return; }
  if (e.code === 'KeyR') { if (decor.focus) decor.focusRotate(); else decor.rotate(); }
  if ((e.code === 'Delete' || e.code === 'Backspace') && decor.focus) decor.focusStore(false);
  if (e.code === 'Escape') { if (decor.focus) decor.setFocus(null); else if (decor.sel || decor.floorSel || decor.wallSel || decor.pickupMode) decor.selectFloor(null); else decor.exit(); }
}

/** @param {import('../decor.js').DecorSys} decor */
export function tileAt(decor, e) {
  const ps=decor.town.partitions;
  if(['move','erase'].includes(decor.wallSel)&&!ps?.drag){
    const hit=decor.town.wallPoint(e.clientX,e.clientY);
    if(hit){const cursor={fx:hit.x-decor.lot.x0,fz:hit.z-decor.lot.z0,height:hit.y};if(ps.nearest(cursor)>=0)return cursor;}
  }
  const p = decor.town.groundPoint(e.clientX, e.clientY,ps?.drag?.decor===decor?ps.drag.height:decor.buildLevel * YARD_LEVEL_HEIGHT);
  return p ? { fx: p.x - decor.lot.x0, fz: p.z - decor.lot.z0 } : null;
}

/** @param {import('../decor.js').DecorSys} decor */
export function pickBuildObject(decor, cx,cy) {
  const entries=decor.entries.filter(rec=>rec.obj.visible&&yardLevel(rec.e)===decor.buildLevel);
  for(const rec of entries)rec.obj.updateMatrixWorld(true);
  const hits=app.ray(cx,cy,decor.town.camera).intersectObjects(entries.map(rec=>rec.obj),true);
  for(const hit of hits){let obj=hit.object;while(obj&&obj.parent!==decor.town.scene)obj=obj.parent;const rec=entries.find(rec=>rec.obj===obj);if(rec)return rec;}
  return null;
}

/** @param {import('../decor.js').DecorSys} decor */
export function cancelPointer(decor) {
  cancelFurnitureDrag(decor);
  decor.town.partitions?.cancel(decor);decor.isDown=false;decor.pointerStart=null;decor.last=null;
}

/** @param {import('../decor.js').DecorSys} decor */
export function onDown(decor, e) {
  if (!decor.active || decor.town.zone !== decor.cfg.key || (e.button !== undefined && e.button !== 0)) return;
  if (decor.furnitureDrag) decor.cancelPointer();
  decor.isDown = true;
  decor.pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  decor.dragDistance = 0;
  decor.last = { x: e.clientX, y: e.clientY };
  decor.cursor = decor.tileAt(e);
  if (decor.cameraMode !== 'place') {
    try { decor.town.canvasCapture?.(e.pointerId); } catch (_) { /* 旧浏览器 */ }
    decor.updateGhost();
    return;
  }
  if(decor.wallSel&&decor.town.partitions.begin(decor)){
    try{decor.town.canvasCapture?.(e.pointerId);}catch(_){}return;
  }
  prepareFurnitureDrag(decor, e);
  if (decor.floorSel && decor.continuous) { decor.finishStroke(); decor.stroke = { before: decor.snapshot(), cost: 0, count: 0, changed: false }; }
  if (decor.floorSel && decor.continuous) decor.paint();
  else decor.updateGhost();
}

/** @param {import('../decor.js').DecorSys} decor */
export function onMove(decor, e) {
  if (!decor.active || decor.town.zone !== decor.cfg.key) return;
  if (decor.isDown && decor.pointerStart && decor.pointerStart.id !== e.pointerId) return;
  if (decor.isDown && decor.pointerStart) decor.dragDistance = Math.max(decor.dragDistance, Math.hypot(e.clientX - decor.pointerStart.x, e.clientY - decor.pointerStart.y));
  const viewMode = decor.cameraMode;
  if (viewMode === 'orbit' && decor.isDown && decor.last) {
    decor.viewYaw -= (e.clientX - decor.last.x) * 0.006;
    decor.viewPitch = clamp(decor.viewPitch + (e.clientY - decor.last.y) * 0.0045, 0.56, 1.42);
    decor.last = { x: e.clientX, y: e.clientY };
    decor.updateGhost();
    return;
  }
  if (viewMode === 'pan' && decor.isDown && decor.last) {
    decor.panCameraBy(e.clientX - decor.last.x, e.clientY - decor.last.y);
    decor.last = { x: e.clientX, y: e.clientY };
    decor.updateGhost();
    return;
  }
  if (viewMode !== 'place') return;
  decor.cursor = decor.tileAt(e);
  if (decor.isDown && moveFurnitureDrag(decor)) return;
  if (decor.isDown && decor.floorSel && decor.continuous) decor.paint();
  else if (decor.isDown && !decor.sel && !decor.wallSel && decor.last) {
    // 没选东西时拖动 = 平移镜头
    const k = decor.zoom / 620;
    decor.panBy(-(e.clientX - decor.last.x) * k, -(e.clientY - decor.last.y) * k * 1.3);
    decor.last = { x: e.clientX, y: e.clientY };
  }
  decor.updateGhost();
}

/** @param {import('../decor.js').DecorSys} decor */
export function onUp(decor, e, moved) {
  const wasDown = decor.isDown && decor.pointerStart && decor.pointerStart.id === e.pointerId;
  decor.isDown = false;
  decor.pointerStart = null;
  decor.finishStroke();
  if (!wasDown || !decor.active || decor.town.zone !== decor.cfg.key) return;
  if (decor.cameraMode !== 'place') return;
  if (finishFurnitureDrag(decor, e)) return;
  if(decor.town.partitions?.drag?.decor===decor){
    const hit=document.elementFromPoint(e.clientX,e.clientY);
    if(hit!==decor.town.inputCanvas){decor.cancelPointer();return;}
    decor.cursor=decor.tileAt(e);decor.town.partitions.end(decor);return;
  }
  if (Math.max(moved || 0, decor.dragDistance || 0) > (e.pointerType === 'mouse' ? 10 : 24)) return;
  decor.cursor = decor.tileAt(e);
  if (!decor.cursor) return;
  if(decor.wallSel){decor.town.partitions.edit(decor);return;}
  if (decor.floorSel) { if (!decor.continuous) decor.paint(); return; }
  if (decor.sel) placeSelection(decor);
  else if (decor.pickupMode) pickSelection(decor, e);
}
