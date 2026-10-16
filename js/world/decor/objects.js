// 场景对象：家具贴墙适配、碰撞矩形、占用层以及模型创建/释放。状态重建沿用存档顺序。
import { THREE, group, disposeSceneResources } from '../../core/kit.js';
import { buildDecor } from '../../models/props.js';
import { DECO } from '../../data.js';
import { S } from '../../core/state.js';
import { popIn, tween, ease } from '../../core/util.js';
import { YARD_LEVEL_HEIGHT, isYardStructure, isBuildEdge, buildEdges, buildCollisionRects, yardLevel } from '../yard-building.js';
import { LOCAL_PLAY } from '../../core/local-play-mode.js';
import { housePlan } from '../house-plan.js';
import { furnitureFit } from '../furniture-fit.js';

const copy = value => JSON.parse(JSON.stringify(value));
const furnitureBounds = new Map();
const measureFurniture = model => {
  const b = new THREE.Box3().setFromObject(model, true);
  return { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z };
};


/** @param {import('../decor.js').DecorSys} decor */
export function houseWalls(decor) { return housePlan(S.house).canPartition ? S.wallsIn || [] : []; }

/** @param {import('../decor.js').DecorSys} decor */
export function houseFit(decor, e, walls = decor.houseWalls(), obj = null) {
  let bounds = obj?._furnitureShape?.bounds || furnitureBounds.get(e.id);
  if (!bounds) {
    const model = buildDecor(e.id); bounds = measureFurniture(model);
    furnitureBounds.set(e.id, bounds); disposeSceneResources(model);
  }
  return furnitureFit(e, DECO[e.id], bounds, walls, decor.lot);
}

/** @param {import('../decor.js').DecorSys} decor */
export function houseObject(decor, id) {
  const model = buildDecor(id), obj = group(), bounds = measureFurniture(model);
  furnitureBounds.set(id, bounds);
  obj.add(model); obj.userData = { ...model.userData };
  // 独立外层承接出现动画，内层保留贴墙适配，避免动画结束把尺寸写回 1。
  obj._furnitureShape = { model, bounds, scale: model.scale.clone() };
  return obj;
}

/** @param {import('../decor.js').DecorSys} decor */
export function applyHouseFit(decor, obj, e, walls = decor.houseWalls(), preview = false) {
  const fit = decor.houseFit(e, walls, obj), shape = obj._furnitureShape;
  shape.model.scale.set(shape.scale.x * fit.scaleX, shape.scale.y, shape.scale.z * fit.scaleZ);
  const [w,d] = decor.size(e.id,e.rot), a=e.rot*Math.PI/2;
  if (preview) {
    // 虚影已经由 ghostHolder 旋转；世界偏移先逆旋转回它的局部坐标。
    obj.position.x=fit.offsetX*Math.cos(a)-fit.offsetZ*Math.sin(a);
    obj.position.z=fit.offsetX*Math.sin(a)+fit.offsetZ*Math.cos(a);
  } else {
    obj.position.x=decor.lot.x0+e.gx+w/2+fit.offsetX;
    obj.position.z=decor.lot.z0+e.gz+d/2+fit.offsetZ;
  }
  obj.userData.furnitureFit=fit;
  return fit;
}

// 只把本次操作的适配结果转为碰撞矩形，不计算适配、不缓存，也不修改模型或存档。
function collisionRectsFromFit(decor, e, fit) {
  if(e.id==='picnic'||DECO[e.id].flat)return [];
  if(e.id==='fence'){
    const [w,d]=decor.size(e.id,e.rot);
    return [{x0:decor.lot.x0+e.gx+.12,x1:decor.lot.x0+e.gx+w-.12,z0:decor.lot.z0+e.gz+.12,z1:decor.lot.z0+e.gz+d-.12}];
  }
  const [w,d]=decor.size(e.id,e.rot);
  const x=decor.lot.x0+e.gx+w/2+fit.offsetX,z=decor.lot.z0+e.gz+d/2+fit.offsetZ;
  if(e.id==='arch'||e.id==='swing')return [-1,1].map(s=>e.rot%2===0
    ?{x0:x+(s*.85-.2)*fit.scaleX,x1:x+(s*.85+.2)*fit.scaleX,z0:z-.3*fit.scaleZ,z1:z+.3*fit.scaleZ}
    :{x0:x-.3*fit.scaleZ,x1:x+.3*fit.scaleZ,z0:z+(s*.85-.2)*fit.scaleX,z1:z+(s*.85+.2)*fit.scaleX});
  return [fit.adapted ? fit.rect : {x0:x-w/2+.12,x1:x+w/2-.12,z0:z-d/2+.12,z1:z+d/2-.12}];
}

/** @param {import('../decor.js').DecorSys} decor */
export function houseCollisionRects(decor, e, walls = decor.houseWalls()) {
  // 公共查询仍按调用方指定的墙体重新计算；地毯/野餐垫和栅栏沿用原特殊分支。
  const fit = e.id==='picnic'||DECO[e.id].flat||e.id==='fence' ? null : decor.houseFit(e,walls);
  return collisionRectsFromFit(decor,e,fit);
}

/** @param {import('../decor.js').DecorSys} decor */
export function refreshFurnitureFits(decor) {
  if(decor.cfg.key!=='house')return;
  for(const rec of decor.entries){
    if(!rec.obj._furnitureShape)continue;
    const fit=decor.applyHouseFit(rec.obj,rec.e);
    for(const r of rec.rect||[]){const i=decor.town.rects.indexOf(r);if(i>=0)decor.town.rects.splice(i,1);}
    rec.rect=collisionRectsFromFit(decor,rec.e,fit).map(r=>decor.town.addRect(r.x0,r.x1,r.z0,r.z1,'decor'));
  }
  decor.connectionRevision=(decor.connectionRevision||0)+1;
  decor.town.renderOptimizer?.invalidateDecor();
  decor.town.renderOptimizer?.invalidateBounds();
}

/** @param {import('../decor.js').DecorSys} decor */
export function addObj(decor, e, animate = true) {
  const [w, d] = decor.size(e.id, e.rot);
  const obj = decor.cfg.key==='house'&&e.id!=='fence' ? decor.houseObject(e.id) : buildDecor(e.id);
  obj.userData?.applyVariant?.(e);
  const x = decor.lot.x0 + e.gx + w / 2, z = decor.lot.z0 + e.gz + d / 2;
  const off=e.id==='fence'?decor.fenceOffset(e.rot):{x:0,z:0};
  const angle=(e.rot*Math.PI)/2;
  const ox=off.x*Math.cos(angle)+off.z*Math.sin(angle),oz=-off.x*Math.sin(angle)+off.z*Math.cos(angle);
  const baseY = decor.cfg.freeBuild ? yardLevel(e) * YARD_LEVEL_HEIGHT : 0;
  obj.position.set(x+ox, baseY + (isYardStructure(e.id) ? 0 : 0.05), z+oz);
  obj.rotation.y = (e.rot * Math.PI) / 2;
  const fit=obj._furnitureShape?decor.applyHouseFit(obj,e):null;
  decor.town.scene.add(obj);
  decor.town.seasons.scanTrees(obj);
  const rec = { e, obj, rect: null, tick: obj.userData.tick };
  if (isYardStructure(e.id)) rec.rect = buildCollisionRects(e, DECO, decor.lot).map(r => Object.assign(decor.town.addRect(r.x0,r.x1,r.z0,r.z1,'building'),r));
  if (e.id !== 'picnic' && !DECO[e.id].flat && !isYardStructure(e.id)) {
    if (decor.cfg.key==='house') {
      rec.rect=collisionRectsFromFit(decor,e,fit).map(r=>decor.town.addRect(r.x0,r.x1,r.z0,r.z1,'decor'));
    } else if (e.id === 'arch' || e.id === 'swing') {
      // 拱门与秋千中间可以穿过
      rec.rect = [];
      const horiz = e.rot % 2 === 0;
      for (const s of [-1, 1]) rec.rect.push(horiz ? decor.town.addRect(x + s * 0.85 - 0.2, x + s * 0.85 + 0.2, z - 0.3, z + 0.3, 'decor') : decor.town.addRect(x - 0.3, x + 0.3, z + s * 0.85 - 0.2, z + s * 0.85 + 0.2, 'decor'));
    } else rec.rect = [decor.town.addRect(x - w / 2 + 0.12, x + w / 2 - 0.12, z - d / 2 + 0.12, z + d / 2 - 0.12, 'decor')];
  }
  if (rec.rect && decor.cfg.freeBuild && !isYardStructure(e.id)) {
    const box = new THREE.Box3().setFromObject(obj);
    for (const rect of rec.rect) { rect.y0 = baseY; rect.y1 = Math.max(baseY + 0.1, box.max.y); }
  }
  if (isBuildEdge(e.id)) for (const k of buildEdges(e)) decor.occEdges.set(k,rec);
  else for (let ix = e.gx; ix < e.gx + w; ix++) for (let iz = e.gz; iz < e.gz + d; iz++) decor.layerOf(e.id).set(decor.cellKey(ix, iz, yardLevel(e)), rec);
  decor.entries.push(rec);
  decor.connectionRevision=(decor.connectionRevision||0)+1;
  if (isYardStructure(e.id)) decor.structures.push(e);
  if (animate) {
    if(decor.cfg.key==='house'){
      obj.scale.setScalar(.001);
      tween({dur:.45,ease:ease.outCubic,update:k=>obj.scale.setScalar(Math.max(.001,k))});
    }else popIn(obj, 0.45);
  }
  return rec;
}

/** @param {import('../decor.js').DecorSys} decor */
export function removeObj(decor, rec) {
  decor.connectionRevision=(decor.connectionRevision||0)+1;
  const structure = decor.structures.indexOf(rec.e);
  if (structure >= 0) decor.structures.splice(structure, 1);
  decor.town.seasons.clearSubtree(rec.obj);
  decor.town.scene.remove(rec.obj);
  disposeSceneResources(rec.obj);
  if (rec.rect) for (const r of rec.rect) {
    const i = decor.town.rects.indexOf(r);
    if (i >= 0) decor.town.rects.splice(i, 1);
  }
  for (const layer of [decor.occ, decor.occUnder, decor.occPlanes, decor.occEdges, decor.occCaps, decor.occFoundations]) for (const [k, v] of [...layer]) if (v === rec) layer.delete(k);
  const i = decor.entries.indexOf(rec);
  if (i >= 0) decor.entries.splice(i, 1);
}

/** @param {import('../decor.js').DecorSys} decor */
export function rebuildObjects(decor, placed, floor, walls=[]) {
  decor.selectFloor(null);
  for (const rec of [...decor.entries]) decor.removeObj(rec);
  S[decor.pk] = copy(placed); S[decor.fk] = copy(floor);
  for (const e of S[decor.pk]) decor.addObj(e, false);
  decor.rebuildFloor();
  if(decor.cfg.key==='house'){S.wallsIn=copy(walls);decor.town.partitions?.rebuild();}
}

/** @param {import('../decor.js').DecorSys} decor */
export function reload(decor) {
  decor.stroke = null; decor.clearHistory(false);
  decor.selectFloor(null);
  decor.continuous = false;
  decor.pendingCost = 0;
  globalThis.__nuannuanDecorTransaction = Object.values(decor.town.decors || {}).some(d => d.active);
  for (const rec of [...decor.entries]) decor.removeObj(rec);
  if (!S[decor.pk]) S[decor.pk] = [];
  if (!S[decor.fk]) S[decor.fk] = decor.cfg.defaultFloor();
  S[decor.pk] = S[decor.pk].filter(e => {
    if (!decor.fitsZone(e)) {
      if (!LOCAL_PLAY && DECO[e.id]) S.decor[e.id] = (S.decor[e.id] || 0) + 1;
      return false;
    }
    decor.addObj(e, false); return true;
  });
  decor.rebuildFloor();
  if(decor.cfg.key==='house')decor.town.partitions?.rebuild();
}
