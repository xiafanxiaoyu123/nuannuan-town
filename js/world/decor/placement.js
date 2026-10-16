// 放置规则：区域与占格、作物保护、楼层支撑和连接吸附。只返回/记录原有放置判定。
import { DECO } from '../../data.js';
import { S, bus } from '../../core/state.js';
import { MAX_YARD_LEVEL, isYardStructure, isBuildEdge, isBuildRoof, buildCells, yardLevel, yardCellKey, validateYardLayout } from '../yard-building.js';
import { buildSnapCandidates } from '../build-connections.js';

const key = (x, z) => x + ',' + z;

/** @param {import('../decor.js').DecorSys} decor */
export function inBounds(decor, x, z) {
  const b = decor.cfg.bounds ? decor.cfg.bounds() : null;
  return x >= 0 && z >= 0 && x <= (b ? b.x1 : decor.lot.cols - 1) && z <= (b ? b.z1 : decor.lot.rows - 1);
}

/** @param {import('../decor.js').DecorSys} decor */
export function size(decor, id, rot) {
  const [w, d] = DECO[id].size;
  return rot % 2 ? [d, w] : [w, d];
}

/** @param {import('../decor.js').DecorSys} decor */
export function layerOf(decor, id) { return id === 'yard_slab' ? decor.occPlanes : id === 'yard_foundation' ? decor.occFoundations : isBuildEdge(id) ? decor.occEdges : isBuildRoof(id) ? decor.occCaps : DECO[id]?.under ? decor.occUnder : decor.occ; }

/** @param {import('../decor.js').DecorSys} decor */
export function cellKey(decor, x, z, level = decor.buildLevel) { return decor.cfg.freeBuild ? yardCellKey(x, z, level) : key(x, z); }

/** @param {import('../decor.js').DecorSys} decor */
export function fitsZone(decor, e) {
  if (!DECO[e?.id]) return false;
  if (decor.cfg.freeBuild) return !['plot','bigplot','pond'].includes(e.id);
  if (isYardStructure(e.id) || yardLevel(e)) return false;
  return decor.cfg.key === 'home' ? !DECO[e.id].indoorOnly : !DECO[e.id].outdoorOnly;
}

/** @param {import('../decor.js').DecorSys} decor */
export function validateYard(decor, placed) { return validateYardLayout(placed, DECO, { zone: decor.cfg.key, freeBuild: !!decor.cfg.freeBuild, inBounds: (x, z) => decor.inBounds(x, z), blocked: decor.blockedTiles }); }

/** @param {import('../decor.js').DecorSys} decor */
export function setBuildLevel(decor, level) {
  if (!decor.cfg.freeBuild || !Number.isInteger(level) || level < 0 || level > MAX_YARD_LEVEL) return false;
  decor.cancelPointer(); decor.finishStroke(); decor.setFocus(null);
  decor.buildLevel = level; decor.cursor = null;
  if (level) decor.floorSel = null;
  decor.rebuildGrid(); decor.updateGhost();
  bus.emit('decorLevel', level); bus.emit('decorChanged'); return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function canRemove(decor, rec) {
  if (!decor.cfg.freeBuild) return true;
  const result = decor.validateYard(S[decor.pk].filter(e => e !== rec.e));
  decor.placementError = result.error || ''; return result.ok;
}

/** @param {import('../decor.js').DecorSys} decor */
export function canPlace(decor, id, gx, gz, rot, ignore = null, level = ignore ? yardLevel(ignore.e) : decor.buildLevel) {
  decor.placementError = '';
  decor.supportDistance = 0;
  if (!DECO[id]) return false;
  if (decor.cfg.freeBuild) {
    const next = S[decor.pk].filter(e => e !== ignore?.e);
    const result = decor.validateYard([...next, { id, gx, gz, rot, level }]);
    decor.placementError = result.error || '';
    const distances=isBuildRoof(id)?result.roofSupportMap:result.supportMap;
    decor.supportDistance = Math.max(0,...buildCells({id,gx,gz,rot,level},DECO).map(([x,z])=>distances?.[yardCellKey(x,z,level)]||0));
    return result.ok;
  }
  if (!decor.fitsZone({id,level})) { decor.placementError = isYardStructure(id) ? '请前往独立建造岛搭建建筑' : '这件家具只能在室内摆放'; return false; }
  const [w, d] = decor.size(id, rot);
  for (let x = gx; x < gx + w; x++) for (let z = gz; z < gz + d; z++) {
    if (!decor.inBounds(x, z)) return false;
    const layer = decor.layerOf(id);
    if (decor.blockedTiles.has(key(x, z)) || (layer.has(decor.cellKey(x, z, level)) && layer.get(decor.cellKey(x, z, level)) !== ignore)) return false;
  }
  if(decor.cfg.key==='house'&&decor.town.partitions&&!decor.town.partitions.fitsFurniture({id,gx,gz,rot}))return false;
  return true;
}

/** @param {import('../decor.js').DecorSys} decor */
export function fenceOffset(decor, rot) {
  // 栅栏是沿格线摆放的边，不以格子中心为视觉中心。
  // 返回未旋转的局部偏移；addObj 会随段落方向一起旋转。
  return { x: 0, z: -.5 };
}

/** @param {import('../decor.js').DecorSys} decor */
export function fenceAnchor(decor) {
  const cursor=decor.cursor,base={gx:Math.round(cursor.fx-.5),gz:Math.round(cursor.fz-.5)};
  const fences=S[decor.pk].filter(e=>e.id==='fence' && yardLevel(e) === decor.buildLevel),ends=[];
  for(const e of fences){
    const p=e.rot%2?[[e.gx,e.gz],[e.gx,e.gz+1]]:[[e.gx,e.gz],[e.gx+1,e.gz]];
    ends.push(...p.map(([x,z])=>({x,z})));
  }
  const candidates=[];
  for(const rot of [0,1,2,3]){
    const cells=[];
    for(const p of ends){
      if(Math.hypot(cursor.fx-p.x,cursor.fz-p.z)>.86)continue;
      for(const end of [0,1])cells.push({gx:rot%2?p.x:p.x-(end?1:0),gz:rot%2?p.z-(end?1:0):p.z,rot});
    }
    cells.push({gx:base.gx,gz:base.gz,rot});
    for(const c of cells){
      const ep=c.rot%2?[[c.gx,c.gz],[c.gx,c.gz+1]]:[[c.gx,c.gz],[c.gx+1,c.gz]];
      const joins=ep.reduce((n,[x,z])=>n+ends.some(p=>p.x===x&&p.z===z),0);
      const distance=Math.hypot(cursor.fx-(c.gx+.5),cursor.fz-(c.gz+.5));
      if(decor.inBounds(c.gx,c.gz))candidates.push({...c,joins,distance});
    }
  }
  candidates.sort((a,b)=>b.joins-a.joins||a.distance-b.distance||((a.rot-decor.rot+4)%4)-((b.rot-decor.rot+4)%4));
  return {...(candidates[0]||{...base,rot:decor.rot}),w:1,d:1};
}

/** @param {import('../decor.js').DecorSys} decor */
export function anchor(decor) {
  if (!decor.cursor || !decor.sel) return null;
  if(decor.sel==='fence')return decor.fenceAnchor();
  const [w, d] = decor.size(decor.sel, decor.rot);
  if (decor.cfg.freeBuild && isYardStructure(decor.sel)) {
    const cacheKey=`${decor.connectionRevision||0}|${decor.sel}|${decor.rot}|${decor.buildLevel}|${decor.cursor.fx.toFixed(3)}|${decor.cursor.fz.toFixed(3)}`;
    if(decor.connectionCache?.key===cacheKey)return decor.connectionCache.anchor;
    const candidates=buildSnapCandidates(S[decor.pk],DECO,decor.sel,decor.rot,decor.cursor.fx,decor.cursor.fz,decor.buildLevel);
    const anchor=candidates.slice(0,4).find(candidate=>decor.canPlace(decor.sel,candidate.gx,candidate.gz,decor.rot))||{gx:Math.round(decor.cursor.fx-w/2),gz:Math.round(decor.cursor.fz-d/2),w,d,rot:decor.rot};
    decor.connectionCache={key:cacheKey,anchor};return anchor;
  }
  return { gx: Math.round(decor.cursor.fx - w / 2), gz: Math.round(decor.cursor.fz - d / 2), w, d, rot:decor.rot };
}

/** @param {import('../decor.js').DecorSys} decor */
export function cropLocked(decor, e) { return decor.cfg.key === 'home' && (e.id === 'plot' || e.id === 'bigplot') && decor.town.farm.hasCrop(e); }

/** @param {import('../decor.js').DecorSys} decor */
export function cropSafe(decor, placed) {
  return S[decor.pk].filter(e => decor.cropLocked(e)).every(e => placed.some(p => p.id === e.id && p.gx === e.gx && p.gz === e.gz && p.rot === e.rot));
}
