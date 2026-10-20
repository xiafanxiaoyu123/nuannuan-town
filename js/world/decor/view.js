// 装修视图：相机、工具选择和虚影。预览材质独立克隆，切换选择释放旧预览。
import { disposeSceneResources } from '../../core/kit.js';
import { buildDecor } from '../../models/props.js';
import { bus } from '../../core/state.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/util.js';
import { YARD_LEVEL_HEIGHT, maxBuildBaseLevel, isYardStructure, isBuildRoof, yardLevel } from '../yard-building.js';
import { updateFurnitureDrag } from './dragging.js';

/** @param {import('../decor.js').DecorSys} decor */
export function panBy(decor, dx, dz) {
  const mx = Math.max(0, decor.lot.cols / 2 - 6), mz = Math.max(0, decor.lot.rows / 2 - 4);
  decor.pan.x = clamp(decor.pan.x + dx, -mx, mx);
  decor.pan.z = clamp(decor.pan.z + dz, -mz, mz);
}

/** @param {import('../decor.js').DecorSys} decor */
export function setCameraMode(decor, mode = 'place') {
  mode = ['place', 'orbit', 'pan'].includes(mode) ? mode : 'place';
  if (mode !== 'place') decor.cancelPointer();
  decor.cameraMode = mode;
  decor.updateGhost();
  bus.emit('decorCamera', mode);
}

/** @param {import('../decor.js').DecorSys} decor */
export function toggleCamera(decor) { decor.setCameraMode(decor.cameraMode === 'place' ? 'orbit' : 'place'); }

/** @param {import('../decor.js').DecorSys} decor */
export function rotateView(decor, step = Math.PI / 2) {
  decor.viewYaw += step;
  bus.emit('decorCamera', decor.cameraMode);
}

/** @param {import('../decor.js').DecorSys} decor */
export function toggleTopView(decor) {
  decor.viewPitch = decor.viewPitch > 1.18 ? 1.0 : 1.34;
  bus.emit('decorCamera', decor.cameraMode);
}

/** @param {import('../decor.js').DecorSys} decor */
export function resetView(decor) {
  decor.viewYaw = 0.25;
  decor.viewPitch = 1.0;
  decor.zoom = decor.cfg.zoom;
  const bounds = decor.cfg.bounds?.();
  if (bounds) decor.zoom = Math.max(decor.cfg.zoom, (bounds.x1 + 1) * 1.2);
  // 重置视角聚焦已解锁庭院；尚未购买东侧扩建时不把镜头移进荒地。
  decor.pan.x = bounds ? (bounds.x1 + 1 - decor.lot.cols) / 2 : 0;
  decor.pan.z = bounds ? (bounds.z1 + 1 - decor.lot.rows) / 2 : 0;
  decor.cameraMode = 'place';
  bus.emit('decorCamera', decor.cameraMode);
}

/** @param {import('../decor.js').DecorSys} decor */
export function zoomBy(decor, delta) { decor.zoom = clamp(decor.zoom + delta, 20, decor.cfg.key === 'home' ? Math.max(62, decor.lot.cols * 1.3) : 62); }

/** @param {import('../decor.js').DecorSys} decor */
export function panCameraBy(decor, dx, dz) {
  const k = decor.zoom / 620;
  const sx = -dx * k, sz = -dz * k * 1.3;
  const c = Math.cos(decor.viewYaw), s = Math.sin(decor.viewYaw);
  decor.panBy(sx * c - sz * s, sx * s + sz * c);
}

/** @param {import('../decor.js').DecorSys} decor */
export function select(decor, id) {
  if (id && decor.cfg.freeBuild && decor.buildLevel > maxBuildBaseLevel(id)) {
    decor.setBuildLevel(maxBuildBaseLevel(id));
    bus.emit('toast', id === 'yard_stairs' ? '房屋最多3楼，已切到2楼搭建通往3楼的阶梯' : '房屋最多3楼，已切换到该物件可用的楼层');
  }
  if (id === 'yard_foundation' && decor.buildLevel) decor.setBuildLevel(0);
  if (isBuildRoof(id) && decor.buildLevel === 0) { decor.setBuildLevel(1); bus.emit('toast','已切换到2楼高度，为1楼房间封顶'); }
  decor.cancelPointer();
  decor.finishStroke();
  decor.pendingMove = null;
  decor.sel = id;
  decor.wallSel = null;
  decor.pickupMode = false;
  decor.isDown = false;
  decor.pointerStart = null;
  if (id) decor.floorSel = null;
  if (decor.focus) { decor.focus = null; bus.emit('decorFocus', null); }
  while (decor.ghostHolder.children.length) { const old = decor.ghostHolder.children[0]; decor.ghostHolder.remove(old); disposeSceneResources(old); }
  decor.ghostTick = null;
  decor.ghostIsStructure = isYardStructure(id);
  // Building previews show their actual joins. The furniture hover animation
  // moves every stair tread through neighbouring faces and makes seams flash.
  decor.ghostHolder.position.y = decor.ghostIsStructure ? 0 : .12;
  if (id) {
    const m = decor.cfg.key==='house'&&id!=='fence' ? decor.houseObject(id) : buildDecor(id);
    if(id==='fence')m.position.set(0,0,-.5);
    const previewMaterials = new Map();
    const previewMaterial = material => {
      if (!previewMaterials.has(material)) {
        const clone = material.clone();
        // Preview-only bias also resolves coplanar faces when hovering over an
        // existing building. Never change the cached materials of placed parts.
        clone.polygonOffset = true; clone.polygonOffsetFactor = -2; clone.polygonOffsetUnits = -2;
        previewMaterials.set(material, clone);
      }
      return previewMaterials.get(material);
    };
    m.traverse((c) => {
      if (!c.isMesh) return;
      c.castShadow = false;
      if (decor.ghostIsStructure) {
        c.receiveShadow = false;
        c.material = Array.isArray(c.material) ? c.material.map(previewMaterial) : previewMaterial(c.material);
      }
    });
    decor.ghostHolder.add(m);
    decor.ghostTick = m.userData.tick;
  }
  decor.ghost.visible = false;
  decor.updateGhost();
  bus.emit('decorSel', id);
}

/** @param {import('../decor.js').DecorSys} decor */
export function selectFloor(decor, id) {
  decor.select(null);
  if (id && decor.buildLevel) decor.setBuildLevel(0);
  decor.floorSel = id;
  bus.emit('decorSel', null);
}

/** @param {import('../decor.js').DecorSys} decor */
export function selectWall(decor, kind) {
  decor.selectFloor(null);
  if(decor.cfg.key!=='house'||!decor.town.partitions?.enabled)return decor.refuse('升级到云朵城堡后解锁隔断');
  if(!['wall','door','move','erase'].includes(kind))return false;
  decor.town.partitions.moveTurns=0;decor.wallSel=kind;decor.wallStatus='';decor.updateGhost();bus.emit('decorSel',null);bus.emit('decorChanged');return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function setContinuous(decor, on) {
  decor.cancelPointer();
  decor.finishStroke();
  decor.continuous = !!on;
  decor.isDown = false;
  decor.pointerStart = null;
  bus.emit('decorSel', decor.sel);
  bus.emit('decorChanged');
}

/** @param {import('../decor.js').DecorSys} decor */
export function setPickupMode(decor, on) {
  decor.selectFloor(null);
  decor.pickupMode = !!on;
  bus.emit('decorSel', null);
  bus.emit('decorChanged');
}

/** @param {import('../decor.js').DecorSys} decor */
export function rotate(decor) {
  if(decor.wallSel&&decor.wallSel!=='erase'){decor.town.partitions.rotate(decor);decor.updateGhost();bus.emit('decorSel',null);return;}
  if (!decor.sel) return;
  decor.rot = (decor.rot + 1) % 4;
  audio.sfx('tab');
  decor.updateGhost();
}

/** @param {import('../decor.js').DecorSys} decor */
export function setFocus(decor, rec) {
  decor.focus = rec || null;
  decor.updateGhost();
  bus.emit('decorFocus', decor.focus);
}

/** @param {import('../decor.js').DecorSys} decor */
export function updateGhost(decor) {
  if (updateFurnitureDrag(decor)) return;
  if (decor.cameraMode !== 'place') {
    decor.ghost.visible = false;
    if (decor.town.partitions) decor.town.partitions.preview.visible = false;
    return;
  }
  decor.town.partitions?.updatePreview(decor);
  if(decor.wallSel){decor.ghost.visible=false;return;}
  const a = decor.anchor();
  if (!a) {
    decor.snapJoined=false;
    decor.previewStamp=null;
    // 没在摆东西：如果点选了一件家具，就把底板借来做高亮
    const f = decor.focus;
    decor.ghost.visible = !!f;
    if (f) {
      const [w, d] = decor.size(f.e.id, f.e.rot);
      decor.ghost.position.set(decor.lot.x0 + f.e.gx + w / 2, 0.03 + yardLevel(f.e) * YARD_LEVEL_HEIGHT, decor.lot.z0 + f.e.gz + d / 2);
      decor.plate.scale.set(w * 1.04, d * 1.04, 1);
      decor.plate.material.color.setHex(0xffc94d);
    }
    return;
  }
  decor.ghost.visible = true;
  decor.ghost.position.set(decor.lot.x0 + a.gx + a.w / 2, (decor.ghostIsStructure ? 0 : .03) + decor.buildLevel * YARD_LEVEL_HEIGHT, decor.lot.z0 + a.gz + a.d / 2);
  const ghostRot=a.rot===undefined?decor.rot:a.rot;
  if(decor.sel==='fence')decor.rot=ghostRot;
  decor.ghostHolder.rotation.y = (ghostRot * Math.PI) / 2;
  if(decor.cfg.key==='house'&&decor.ghostHolder.children[0]?._furnitureShape){
    decor.applyHouseFit(decor.ghostHolder.children[0],{id:decor.sel,gx:a.gx,gz:a.gz,rot:ghostRot},decor.houseWalls(),true);
  }
  decor.plate.scale.set(a.w * 0.96, a.d * 0.96, 1);
  const ok = decor.canPlace(decor.sel, a.gx, a.gz, decor.rot);
  decor.snapJoined=!!a.joined;
  const previewStamp = `${ok}|${decor.placementError}|${decor.supportDistance}|${decor.snapJoined}`;
  if (decor.cfg.freeBuild && previewStamp !== decor.previewStamp) { decor.previewStamp = previewStamp; bus.emit('decorPreview'); }
  decor.plate.material.color.setHex(ok ? decor.cfg.freeBuild && decor.supportDistance >= 4 ? 0xffca66 : 0x7fe0a0 : 0xff7f8f);
  decor.ghostOk = ok;
}
