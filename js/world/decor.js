// 家园装修：整片院子都是网格，可以摆家具、也可以给任意格子铺不同材质的地面
import { THREE, group, rboxGeo, disposeSceneResources } from '../core/kit.js';
import { buildDecor } from '../models/props.js';
import { DECO, FLOORS, FLOOR } from '../data.js';
import { S, bus, spend, stat, save, flushSave, addCoins, decorSellPrice } from '../core/state.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { popIn, clamp, tween, ease } from '../core/util.js';
import { YARD_LEVEL_HEIGHT, MAX_YARD_LEVEL, maxBuildBaseLevel, isYardStructure, isBuildEdge, isBuildRoof, buildCells, buildEdges, buildCollisionRects, yardLevel, yardCellKey, validateYardLayout } from './yard-building.js';
import { buildSnapCandidates } from './build-connections.js';
import { app } from '../core/app.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { housePlan } from './house-plan.js';
import { furnitureFit } from './furniture-fit.js';

const key = (x, z) => x + ',' + z;
const copy = (v) => JSON.parse(JSON.stringify(v));
let editSerial = 0;
const furnitureBounds = new Map();
const measureFurniture = model => {
  const b = new THREE.Box3().setFromObject(model, true);
  return { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z };
};

// 地面材质的贴图：直接用 canvas 画出砖缝 / 木纹 / 卵石
const texCache = {};
export function floorTex(id) {
  if (texCache[id]) return texCache[id];
  const f = FLOOR[id];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = f.color;
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = f.line;
  x.fillStyle = f.line;
  x.lineWidth = 3;
  if (id === 'stone') {
    x.strokeRect(2, 2, 60, 60);
    x.beginPath(); x.moveTo(2, 34); x.lineTo(62, 30); x.moveTo(30, 2); x.lineTo(34, 32); x.moveTo(22, 32); x.lineTo(20, 62); x.stroke();
  } else if (id === 'wood') {
    for (const y of [0, 21, 43]) x.fillRect(0, y, 64, 2.5);
    for (const [px, py] of [[20, 2], [48, 23], [12, 45]]) x.fillRect(px, py, 2, 19);
  } else if (id === 'brick') {
    for (let r = 0; r < 4; r++) { x.fillRect(0, r * 16, 64, 2.5); for (let k = 0; k < 3; k++) x.fillRect(((r % 2) * 16 + k * 32) % 64, r * 16, 2.5, 16); }
  } else if (id === 'pebble') {
    x.fillStyle = f.color2;
    for (const [px, py, r] of [[14, 14, 10], [44, 12, 8], [30, 34, 11], [10, 46, 8], [52, 46, 10], [34, 56, 6], [56, 28, 6]]) { x.beginPath(); x.ellipse(px, py, r, r * 0.8, 0.4, 0, 7); x.fill(); x.stroke(); }
  } else if (id === 'mosaic') {
    // 一圈圈卵石拼出的花：中心一颗，外面两圈交替颜色
    x.lineWidth = 1.5;
    const dot = (px, py, r, c) => { x.fillStyle = c; x.beginPath(); x.ellipse(px, py, r, r * 0.86, 0.3, 0, 7); x.fill(); x.stroke(); };
    dot(32, 32, 6, '#ffe27a');
    for (let i = 0; i < 6; i++) dot(32 + Math.cos((i * Math.PI) / 3) * 13, 32 + Math.sin((i * Math.PI) / 3) * 13, 5.4, i % 2 ? f.color3 : f.color2);
    for (let i = 0; i < 12; i++) dot(32 + Math.cos((i * Math.PI) / 6 + 0.26) * 25, 32 + Math.sin((i * Math.PI) / 6 + 0.26) * 25, 4.6, i % 3 === 0 ? f.color3 : i % 3 === 1 ? '#ffffff' : f.color2);
    for (const [px, py] of [[4, 4], [60, 4], [4, 60], [60, 60]]) dot(px, py, 4, '#ffffff');
  } else if (id === 'tile') {
    x.strokeRect(1.5, 1.5, 61, 61);
    x.fillStyle = f.color2;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(32 + Math.cos((i * Math.PI) / 2) * 11, 32 + Math.sin((i * Math.PI) / 2) * 11, 9, 9, 0, 0, 7); x.fill(); }
    x.fillStyle = '#ffe27a';
    x.beginPath(); x.arc(32, 32, 6, 0, 7); x.fill();
  } else {
    x.globalAlpha = 0.5;
    for (const [px, py] of [[12, 16], [40, 10], [52, 40], [22, 46], [34, 28]]) x.fillRect(px, py, 5, 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[id] = { tex: t, url: c.toDataURL() };
  return texCache[id];
}

export class DecorSys {
  constructor(town, cfg) {
    this.town = town;
    this.cfg = cfg;
    this.lot = cfg.lot;
    this.pk = cfg.placedKey;
    this.fk = cfg.floorKey;
    const LOT = cfg.lot;
    this.active = false;
    this.pan = { x: 0, z: 0 };
    this.zoom = cfg.zoom;
    // 装修相机和摆放相机分开：place 才接受落点，orbit / pan 只改变观察范围。
    this.cameraMode = 'place';
    this.viewYaw = 0.25;
    this.viewPitch = 1.0;
    this.sel = null;
    this.focus = null; // 点选中的已摆放家具（等待选择：移动 / 旋转 / 收起 / 卖掉）
    this.floorSel = null;
    this.continuous = false;
    this.pickupMode = false;
    // 家具购买采用“装修会话结算”：摆放时只累计预览费用，点击完成/离开装修时一次性扣除。
    // 地板仍按格即时结算，pendingCost 只记录没有库存、需要购买的家具。
    this.pendingCost = 0;
    this.rot = 0;
    this.buildLevel = 0;
    this.history = [];
    this.stroke = null;
    this.pendingMove = null;
    this.entries = [];
    this.structures = [];
    this.occ = new Map();
    // 地毯这类「铺在地上」的摆件单独占一层：它们之间不能重叠，但上面可以再放家具
    this.occUnder = new Map();
    this.occPlanes = new Map(); this.occEdges = new Map(); this.occCaps = new Map(); this.occFoundations = new Map();
    this.blockedTiles = new Set();
    const block = (x0, x1, z0, z1) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.blockedTiles.add(key(x, z)); };
    for (const r of cfg.blocked) block(...r);
    if (!S[this.pk]) S[this.pk] = [];
    if (!S[this.fk]) S[this.fk] = cfg.defaultFloor();

    // 网格提示（装修时显示）
    const n = cfg.maxCells || LOT.cols * LOT.rows;
    this.grid = new THREE.InstancedMesh(rboxGeo(0.92, 0.02, 0.92, 0.009), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }), n);
    this.grid.visible = false;
    this.rebuildGrid();
    town.scene.add(this.grid);

    // 地面层：每种材质一个 InstancedMesh
    this.floorMeshes = {};
    const fg = new THREE.BoxGeometry(1, 0.07, 1);
    for (const f of FLOORS) {
      if (f.erase) continue;
      const m = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ map: floorTex(f.id).tex, roughness: 0.9 }), n);
      m.receiveShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      town.scene.add(m);
      this.floorMeshes[f.id] = m;
    }
    this.rebuildFloor();

    this.ghost = group();
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x7fe0a0, transparent: true, opacity: 0.6, depthWrite: false }));
    this.plate.rotation.x = -Math.PI / 2;
    this.plate.position.y = 0.12;
    this.ghostHolder = group();
    this.ghost.add(this.plate, this.ghostHolder);
    this.ghost.visible = false;
    town.scene.add(this.ghost);
    this.cursor = null;
    const release = () => { this.finishStroke(); this.cancelPointer(); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', () => {
      this.finishStroke();
      const ok = this.commitPendingCost(true);
      if (!ok) return; // 未结算的临时家具不写入存档，避免绕过最终扣款。
      this.clearHistory(true);
      globalThis.__nuannuanDecorTransaction = false;
      flushSave();
    });
    // 已凭当前美化度拿到不可逆进度时提交装修，避免领奖后退回购买成本。
    const rewardBarrier = () => { if (this.history.length || this.stroke) { this.finishStroke(); this.clearHistory(true); } };
    bus.on('ach', a => { if (a.stat === 'beauty') rewardBarrier(); });
    bus.on('questDone', q => { if (q.stat === 'beauty') rewardBarrier(); });
    bus.on('liveMilestones', rewardBarrier);

    // 固定建筑的位置变动后，压在下面的旧摆件收回仓库
    // Preserve save order: rebuilding models must not dirty a freshly synced save.
    S[this.pk] = S[this.pk].filter((e) => {
      if (!this.fitsZone(e)) {
        if (!LOCAL_PLAY && DECO[e.id]) S.decor[e.id] = (S.decor[e.id] || 0) + 1;
        return false;
      }
      const [w, d2] = this.size(e.id, e.rot);
      for (let x = e.gx; x < e.gx + w; x++) for (let z = e.gz; z < e.gz + d2; z++) {
        if (x < 0 || z < 0 || x >= LOT.cols || z >= LOT.rows || this.blockedTiles.has(key(x, z)) || !this.cfg.freeBuild && this.layerOf(e.id).has(this.cellKey(x, z, yardLevel(e)))) {
          if (!LOCAL_PLAY && e.id !== 'plot') S.decor[e.id] = (S.decor[e.id] || 0) + 1;
          return false;
        }
      }
      this.addObj(e, false);
      return true;
    });
  }

  get canUndo() { return this.active && this.town.zone === this.cfg.key && !!(this.history.length || this.stroke || this.town.partitions?.drag?.decor===this); }
  get undoLabel() { return this.town.partitions?.drag?.decor===this?'正在拖动的隔断':this.stroke ? '铺地' : this.history.at(-1)?.label || ''; }
  snapshot() { return { placed: copy(S[this.pk]), floor: copy(S[this.fk]), walls: this.cfg.key==='house'?copy(S.wallsIn||[]):[], inventory: { ...S.decor } }; }
  editEvent() { bus.emit('decorHistoryChanged', this); }
  commitEdit(edit) {
    for (const [name, n] of Object.entries(edit.stats)) if (n) stat(name, n);
    if (edit.placements.length) bus.emit('decorEditCommitted', { editId: edit.id, placements: copy(edit.placements) });
  }
  clearHistory(commit = true) {
    this.cancelPointer();
    const old = this.history.splice(0); this.pendingMove = null;
    if (commit) for (const edit of old) this.commitEdit(edit);
    this.editEvent();
  }
  recordEdit(before, label, { cost = 0, deferredCost = 0, stats = {}, placements = [], merge = null } = {}) {
    const after = this.snapshot(), delta = {};
    for (const id of new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory)])) {
      const n = (after.inventory[id] || 0) - (before.inventory[id] || 0); if (n) delta[id] = n;
    }
    const edit = { id: ++editSerial, label, before: { placed: before.placed, floor: before.floor, walls: before.walls }, after: { placed: after.placed, floor: after.floor, walls: after.walls }, delta, cost, deferredCost, stats, placements };
    if (merge && this.history.at(-1) === merge) {
      merge.after = edit.after; merge.cost += cost; merge.deferredCost = (merge.deferredCost || 0) + edit.deferredCost;
      for (const [id, n] of Object.entries(delta)) merge.delta[id] = (merge.delta[id] || 0) + n;
      for (const [id, n] of Object.entries(stats)) merge.stats[id] = (merge.stats[id] || 0) + n;
      merge.placements.push(...placements); this.editEvent(); return merge;
    }
    this.history.push(edit);
    if (this.history.length > 30) this.commitEdit(this.history.shift());
    this.editEvent(); return edit;
  }

  // 提交本次装修会话里新购家具的总价。silent 用于 pagehide，不能弹交互式提示。
  commitPendingCost(silent = false) {
    if (LOCAL_PLAY) { this.pendingCost = 0; return true; }
    const n = Math.max(0, Math.round(this.pendingCost || 0));
    if (!n) return true;
    if (S.coins < n) {
      if (!silent) this.refuse(`家具总计需要 ${n} 噗灵，还差 ${n - S.coins}；请收回部分家具后再完成装修`);
      return false;
    }
    if (!spend(n)) return false;
    this.pendingCost = 0;
    bus.emit('decorChanged');
    return true;
  }
  finishStroke() {
    const stroke = this.stroke; this.stroke = null;
    if (stroke?.changed) this.recordEdit(stroke.before, '铺地', { cost: stroke.cost, stats: { floored: stroke.count } });
  }
  cropLocked(e) { return this.cfg.key === 'home' && (e.id === 'plot' || e.id === 'bigplot') && this.town.farm.hasCrop(e); }
  cropSafe(placed) {
    return S[this.pk].filter(e => this.cropLocked(e)).every(e => placed.some(p => p.id === e.id && p.gx === e.gx && p.gz === e.gz && p.rot === e.rot));
  }
  refuse(message) { bus.emit('toast', message, { dedupeKey: 'decor-refuse:' + message }); return false; }
  rebuildObjects(placed, floor, walls=[]) {
    this.selectFloor(null);
    for (const rec of [...this.entries]) this.removeObj(rec);
    S[this.pk] = copy(placed); S[this.fk] = copy(floor);
    for (const e of S[this.pk]) this.addObj(e, false);
    this.rebuildFloor();
    if(this.cfg.key==='house'){S.wallsIn=copy(walls);this.town.partitions?.rebuild();}
  }
  undo() {
    if(this.town.partitions?.drag?.decor===this){this.cancelPointer();return true;}
    this.finishStroke();
    if (!this.canUndo) return false;
    const edit = this.history.at(-1);
    if (JSON.stringify(S[this.pk]) !== JSON.stringify(edit.after.placed) || JSON.stringify(S[this.fk]) !== JSON.stringify(edit.after.floor)) return this.refuse('布局已经变化，这一步不能撤销');
    if(this.cfg.key==='house'&&JSON.stringify(S.wallsIn||[])!==JSON.stringify(edit.after.walls||[]))return this.refuse('隔断已经变化，这一步不能撤销');
    if (!this.cropSafe(edit.before.placed)) return this.refuse('这块田已经种上作物，先收获后再撤销');
    if (!LOCAL_PLAY) for (const [id, n] of Object.entries(edit.delta)) if ((S.decor[id] || 0) - n < 0) return this.refuse('需要收回的家具已在别处使用，暂时不能撤销');
    const valid = this.validateLayout({ version: 1, zone: this.cfg.key, name: '', ...edit.before }, false);
    if (!valid.ok) return this.refuse(valid.error);
    this.rebuildObjects(edit.before.placed, edit.before.floor, edit.before.walls||[]);
    if (!LOCAL_PLAY) for (const [id, n] of Object.entries(edit.delta)) S.decor[id] = (S.decor[id] || 0) - n;
    if (edit.deferredCost) this.pendingCost = Math.max(0, this.pendingCost - edit.deferredCost);
    const immediateCost = edit.cost - (edit.deferredCost || 0);
    if (!LOCAL_PLAY && immediateCost) { S.coins += immediateCost; bus.emit('coins', S.coins, immediateCost, 'decorRefund'); }
    this.history.pop(); this.pendingMove = null;
    bus.emit('decorUndone', { editId: edit.id });
    save(); this.editEvent(); bus.emit('decorChanged'); return true;
  }

  layoutSlots() {
    if (!S.decorLayouts || typeof S.decorLayouts !== 'object' || Array.isArray(S.decorLayouts)) S.decorLayouts = {};
    for (const zone of ['house', 'home', 'build']) if (!Array.isArray(S.decorLayouts[zone])) S.decorLayouts[zone] = [null, null, null];
    return S.decorLayouts[this.cfg.key];
  }
  saveLayout(slot, name) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, error: '没有这个方案位置' };
    this.finishStroke();
    const plan = { version: 1, zone: this.cfg.key, name: String(name || '方案 ' + (slot + 1)).trim().slice(0, 20) || '方案 ' + (slot + 1), placed: copy(S[this.pk]), floor: copy(S[this.fk]) };
    if(this.cfg.key==='house')plan.walls=copy(S.wallsIn||[]);
    const result = this.validateLayout(plan, false); if (!result.ok) return result;
    this.layoutSlots()[slot] = plan; save(); bus.emit('decorLayoutsChanged', this); return { ok: true, plan };
  }
  deleteLayout(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return false;
    this.layoutSlots()[slot] = null; save(); bus.emit('decorLayoutsChanged', this); return true;
  }
  validateLayout(plan, checkSupply = true) {
    const fail = error => ({ ok: false, error, missing: [], missingCount: 0, cost: 0, furnitureCount: Array.isArray(plan?.placed) ? plan.placed.length : 0 });
    if (!plan || plan.version !== 1 || plan.zone !== this.cfg.key || !Array.isArray(plan.placed) || !plan.floor || typeof plan.floor !== 'object' || Array.isArray(plan.floor)) return fail('方案损坏或不属于这里');
    const capacity = this.lot.cols * this.lot.rows;
    if (plan.placed.length > capacity * (this.cfg.freeBuild ? (MAX_YARD_LEVEL + 1) * 6 : 1) || Object.keys(plan.floor).length > capacity) return fail('方案超出房间范围');
    const occupied = new Set(), occupiedUnder = new Set(), need = {}, supply = { ...S.decor };
    if (this.cfg.freeBuild) {
      const yard = this.validateYard(plan.placed);
      if (!yard.ok) return fail(yard.error);
    }
    for (const e of S[this.pk]) supply[e.id] = (supply[e.id] || 0) + 1;
    for (const e of plan.placed) {
      if (!e || !Object.hasOwn(DECO, e.id) || !Number.isInteger(e.gx) || !Number.isInteger(e.gz) || !Number.isInteger(e.rot) || e.rot < 0 || e.rot > 3) return fail('方案里有无效家具');
      if (!this.fitsZone(e)) return fail('这个物件不适合当前区域，请在建造岛搭建筑、在房间里放厨卫家具');
      if (this.cfg.key === 'house' && (isYardStructure(e.id) || yardLevel(e) !== 0 || DECO[e.id].outdoorOnly)) return fail('院子建筑仅限室外使用');
      const [w, d] = this.size(e.id, e.rot);
      for (let x = e.gx; x < e.gx + w; x++) for (let z = e.gz; z < e.gz + d; z++) {
        const k = this.cellKey(x, z, yardLevel(e));
        const used = DECO[e.id].under ? occupiedUnder : occupied;
        if (!this.inBounds(x, z) || this.blockedTiles.has(key(x, z)) || !this.cfg.freeBuild && used.has(k)) return fail('方案里有家具重叠、挡住固定建筑或超出当前范围');
        used.add(k);
      }
      need[e.id] = (need[e.id] || 0) + 1;
    }
    let cost = 0, floorCount = 0;
    for (const [k, id] of Object.entries(plan.floor)) {
      const [x, z] = k.split(',').map(Number), f = FLOOR[id];
      if (!/^\d+,\d+$/.test(k) || !Number.isInteger(x) || !Number.isInteger(z) || key(x,z) !== k || !this.inBounds(x,z) || this.blockedTiles.has(k) || !Object.hasOwn(FLOOR,id) || !f || f.erase) return fail('方案里有无效或越界地板');
      if (S[this.fk][k] !== id) { cost += f.price || 0; floorCount++; }
    }
    if (!this.cropSafe(plan.placed)) return fail('有作物的田必须留在原处；请先收获，果树田需要保留');
    if(this.cfg.key==='house'&&this.town.partitions){const walls=this.town.partitions.validate(plan.walls||[],{placed:plan.placed});if(!walls.ok)return fail(walls.error);}
    if (LOCAL_PLAY) cost = 0;
    const missing = LOCAL_PLAY ? [] : Object.entries(need).filter(([id,n]) => n > (supply[id] || 0)).map(([id,n]) => ({id, name: DECO[id].name, count: n - (supply[id] || 0)}));
    const result = { ok: true, cost, floorCount, furnitureCount: plan.placed.length, wallCount:plan.walls?.length||0, missing, missingCount: missing.reduce((n,m)=>n+m.count,0), need, supply };
    if (checkSupply && missing.length) return { ...result, ok: false, error: '缺少家具：' + missing.map(m => m.name + ' ×' + m.count).join('、') };
    if (!LOCAL_PLAY && checkSupply && S.coins - (this.pendingCost || 0) < cost) return { ...result, ok: false, error: '铺地需要 ' + cost + ' 噗灵，还差 ' + (cost - (S.coins - (this.pendingCost || 0))) };
    return result;
  }
  previewLayout(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, error: '没有这个方案位置' };
    return this.validateLayout(this.layoutSlots()[slot]);
  }
  applyLayout(slot) {
    if (!this.active || this.town.zone !== this.cfg.key) return { ok: false, error: '请先在这里开启装修' };
    const result = this.previewLayout(slot); if (!result.ok) return result;
    this.finishStroke();
    const plan = this.layoutSlots()[slot], before = this.snapshot();
    if (!LOCAL_PLAY && result.cost && (S.coins - (this.pendingCost || 0) < result.cost || !spend(result.cost))) return { ...result, ok: false, error: '噗灵不够' };
    if (!LOCAL_PLAY) for (const [id, n] of Object.entries(result.supply)) S.decor[id] = n - (result.need[id] || 0);
    this.rebuildObjects(plan.placed, plan.floor, plan.walls||[]);
    const edit = this.recordEdit(before, '应用方案', { cost: result.cost, stats: { floored: result.floorCount } });
    this.pendingMove = null; save(); bus.emit('decorChanged'); bus.emit('decorLayoutApplied', { editId: edit.id, zone: this.cfg.key });
    return result;
  }

  // 可布置范围：整块地，或配置里给的动态边界（后院随扩建等级变大）
  resizeRoom(blocked) {
    this.finishStroke();this.clearHistory(true);this.cfg.blocked=blocked;this.blockedTiles.clear();
    for(const [x0,x1,z0,z1]of blocked)for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)this.blockedTiles.add(key(x,z));
    this.rebuildGrid();this.rebuildFloor();this.pan.x=this.pan.z=0;this.updateGhost();
  }
  inBounds(x, z) {
    const b = this.cfg.bounds ? this.cfg.bounds() : null;
    return x >= 0 && z >= 0 && x <= (b ? b.x1 : this.lot.cols - 1) && z <= (b ? b.z1 : this.lot.rows - 1);
  }
  rebuildGrid() {
    const d = new THREE.Object3D(), LOT = this.lot;
    let gi = 0;
    for (let x = 0; x < LOT.cols; x++) for (let z = 0; z < LOT.rows; z++) {
      if (this.blockedTiles.has(key(x, z)) || !this.inBounds(x, z)) continue;
      d.position.set(LOT.x0 + x + 0.5, 0.1 + this.buildLevel * YARD_LEVEL_HEIGHT, LOT.z0 + z + 0.5);
      d.updateMatrix();
      this.grid.setMatrixAt(gi++, d.matrix);
    }
    this.grid.count = gi;
    this.grid.instanceMatrix.needsUpdate = true;
    this.grid.computeBoundingSphere();
  }
  rebuildFloor() {
    const d = new THREE.Object3D();
    const cnt = {};
    for (const [k, id] of Object.entries(S[this.fk])) {
      const m = this.floorMeshes[id];
      if (!m) continue;
      const [x, z] = k.split(',').map(Number);
      d.position.set(this.lot.x0 + x + 0.5, 0.012, this.lot.z0 + z + 0.5);
      d.rotation.y = ((x * 7 + z * 13) % 4) * (Math.PI / 2) * (id === 'wood' || id === 'brick' ? 0 : 1);
      d.updateMatrix();
      cnt[id] = cnt[id] || 0;
      m.setMatrixAt(cnt[id]++, d.matrix);
    }
    for (const [id, m] of Object.entries(this.floorMeshes)) { m.count = cnt[id] || 0; m.instanceMatrix.needsUpdate = true; }
  }
  paint() {
    if (!this.active || this.town.zone !== this.cfg.key || !this.cursor || !this.floorSel) return;
    if (this.buildLevel) return this.refuse('铺地仅用于地面；上层请摆放楼板或地毯');
    const gx = Math.floor(this.cursor.fx), gz = Math.floor(this.cursor.fz);
    if (!this.inBounds(gx, gz) || this.blockedTiles.has(key(gx, gz))) return;
    const f = FLOOR[this.floorSel], k = key(gx, gz);
    const before = this.stroke ? null : this.snapshot();
    const cost = !LOCAL_PLAY && !f.erase && S[this.fk][k] !== f.id ? f.price || 0 : 0;
    if (f.erase) { if (!S[this.fk][k]) return; delete S[this.fk][k]; audio.sfx('remove'); }
    else {
      if (S[this.fk][k] === f.id) return;
      if (!LOCAL_PLAY && f.price && (S.coins - (this.pendingCost || 0) < f.price || !spend(f.price))) {
        if (S.coins - (this.pendingCost || 0) < f.price) bus.emit('poor', f.price - (S.coins - (this.pendingCost || 0)));
        this.isDown = false; return;
      }
      S[this.fk][k] = f.id;
      audio.sfx('place');
    }
    this.rebuildFloor();
    if (this.stroke) { this.stroke.changed = true; this.stroke.cost += cost; if (!f.erase) this.stroke.count++; }
    else this.recordEdit(before, f.erase ? '擦除地板' : '铺地', { cost, stats: f.erase ? {} : { floored: 1 } });
    save();
    if (!this.continuous) this.selectFloor(null);
    bus.emit('decorChanged');
  }

  size(id, rot) {
    const [w, d] = DECO[id].size;
    return rot % 2 ? [d, w] : [w, d];
  }
  layerOf(id) { return id === 'yard_slab' ? this.occPlanes : id === 'yard_foundation' ? this.occFoundations : isBuildEdge(id) ? this.occEdges : isBuildRoof(id) ? this.occCaps : DECO[id]?.under ? this.occUnder : this.occ; }
  cellKey(x, z, level = this.buildLevel) { return this.cfg.freeBuild ? yardCellKey(x, z, level) : key(x, z); }
  fitsZone(e) {
    if (!DECO[e?.id]) return false;
    if (this.cfg.freeBuild) return !['plot','bigplot','pond'].includes(e.id);
    if (isYardStructure(e.id) || yardLevel(e)) return false;
    return this.cfg.key === 'home' ? !DECO[e.id].indoorOnly : !DECO[e.id].outdoorOnly;
  }
  validateYard(placed) { return validateYardLayout(placed, DECO, { zone: this.cfg.key, freeBuild: !!this.cfg.freeBuild, inBounds: (x, z) => this.inBounds(x, z), blocked: this.blockedTiles }); }
  setBuildLevel(level) {
    if (!this.cfg.freeBuild || !Number.isInteger(level) || level < 0 || level > MAX_YARD_LEVEL) return false;
    this.cancelPointer(); this.finishStroke(); this.setFocus(null);
    this.buildLevel = level; this.cursor = null;
    if (level) this.floorSel = null;
    this.rebuildGrid(); this.updateGhost();
    bus.emit('decorLevel', level); bus.emit('decorChanged'); return true;
  }
  canRemove(rec) {
    if (!this.cfg.freeBuild) return true;
    const result = this.validateYard(S[this.pk].filter(e => e !== rec.e));
    this.placementError = result.error || ''; return result.ok;
  }
  canPlace(id, gx, gz, rot, ignore = null, level = ignore ? yardLevel(ignore.e) : this.buildLevel) {
    this.placementError = '';
    this.supportDistance = 0;
    if (!DECO[id]) return false;
    if (this.cfg.freeBuild) {
      const next = S[this.pk].filter(e => e !== ignore?.e);
      const result = this.validateYard([...next, { id, gx, gz, rot, level }]);
      this.placementError = result.error || '';
      const distances=isBuildRoof(id)?result.roofSupportMap:result.supportMap;
      this.supportDistance = Math.max(0,...buildCells({id,gx,gz,rot,level},DECO).map(([x,z])=>distances?.[yardCellKey(x,z,level)]||0));
      return result.ok;
    }
    if (!this.fitsZone({id,level})) { this.placementError = isYardStructure(id) ? '请前往独立建造岛搭建建筑' : '这件家具只能在室内摆放'; return false; }
    const [w, d] = this.size(id, rot);
    for (let x = gx; x < gx + w; x++) for (let z = gz; z < gz + d; z++) {
      if (!this.inBounds(x, z)) return false;
      const layer = this.layerOf(id);
      if (this.blockedTiles.has(key(x, z)) || (layer.has(this.cellKey(x, z, level)) && layer.get(this.cellKey(x, z, level)) !== ignore)) return false;
    }
    if(this.cfg.key==='house'&&this.town.partitions&&!this.town.partitions.fitsFurniture({id,gx,gz,rot}))return false;
    return true;
  }
  fenceOffset(rot) {
    // 栅栏是沿格线摆放的边，不以格子中心为视觉中心。
    // 返回未旋转的局部偏移；addObj 会随段落方向一起旋转。
    return { x: 0, z: -.5 };
  }
  fenceAnchor() {
    const cursor=this.cursor,base={gx:Math.round(cursor.fx-.5),gz:Math.round(cursor.fz-.5)};
    const fences=S[this.pk].filter(e=>e.id==='fence' && yardLevel(e) === this.buildLevel),ends=[];
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
        if(this.inBounds(c.gx,c.gz))candidates.push({...c,joins,distance});
      }
    }
    candidates.sort((a,b)=>b.joins-a.joins||a.distance-b.distance||((a.rot-this.rot+4)%4)-((b.rot-this.rot+4)%4));
    return {...(candidates[0]||{...base,rot:this.rot}),w:1,d:1};
  }
  houseWalls() { return housePlan(S.house).canPartition ? S.wallsIn || [] : []; }
  houseFit(e, walls = this.houseWalls(), obj = null) {
    let bounds = obj?._furnitureShape?.bounds || furnitureBounds.get(e.id);
    if (!bounds) {
      const model = buildDecor(e.id); bounds = measureFurniture(model);
      furnitureBounds.set(e.id, bounds); disposeSceneResources(model);
    }
    return furnitureFit(e, DECO[e.id], bounds, walls, this.lot);
  }
  houseObject(id) {
    const model = buildDecor(id), obj = group(), bounds = measureFurniture(model);
    furnitureBounds.set(id, bounds);
    obj.add(model); obj.userData = { ...model.userData };
    // 独立外层承接出现动画，内层保留贴墙适配，避免动画结束把尺寸写回 1。
    obj._furnitureShape = { model, bounds, scale: model.scale.clone() };
    return obj;
  }
  applyHouseFit(obj, e, walls = this.houseWalls(), preview = false) {
    const fit = this.houseFit(e, walls, obj), shape = obj._furnitureShape;
    shape.model.scale.set(shape.scale.x * fit.scaleX, shape.scale.y, shape.scale.z * fit.scaleZ);
    const [w,d] = this.size(e.id,e.rot), a=e.rot*Math.PI/2;
    if (preview) {
      // 虚影已经由 ghostHolder 旋转；世界偏移先逆旋转回它的局部坐标。
      obj.position.x=fit.offsetX*Math.cos(a)-fit.offsetZ*Math.sin(a);
      obj.position.z=fit.offsetX*Math.sin(a)+fit.offsetZ*Math.cos(a);
    } else {
      obj.position.x=this.lot.x0+e.gx+w/2+fit.offsetX;
      obj.position.z=this.lot.z0+e.gz+d/2+fit.offsetZ;
    }
    obj.userData.furnitureFit=fit;
    return fit;
  }
  houseCollisionRects(e, walls = this.houseWalls()) {
    if(e.id==='picnic'||DECO[e.id].flat)return [];
    if(e.id==='fence'){
      const [w,d]=this.size(e.id,e.rot);
      return [{x0:this.lot.x0+e.gx+.12,x1:this.lot.x0+e.gx+w-.12,z0:this.lot.z0+e.gz+.12,z1:this.lot.z0+e.gz+d-.12}];
    }
    const fit=this.houseFit(e,walls),[w,d]=this.size(e.id,e.rot);
    const x=this.lot.x0+e.gx+w/2+fit.offsetX,z=this.lot.z0+e.gz+d/2+fit.offsetZ;
    if(e.id==='arch'||e.id==='swing')return [-1,1].map(s=>e.rot%2===0
      ?{x0:x+(s*.85-.2)*fit.scaleX,x1:x+(s*.85+.2)*fit.scaleX,z0:z-.3*fit.scaleZ,z1:z+.3*fit.scaleZ}
      :{x0:x-.3*fit.scaleZ,x1:x+.3*fit.scaleZ,z0:z+(s*.85-.2)*fit.scaleX,z1:z+(s*.85+.2)*fit.scaleX});
    return [fit.adapted ? fit.rect : {x0:x-w/2+.12,x1:x+w/2-.12,z0:z-d/2+.12,z1:z+d/2-.12}];
  }
  refreshFurnitureFits() {
    if(this.cfg.key!=='house')return;
    for(const rec of this.entries){
      if(!rec.obj._furnitureShape)continue;
      this.applyHouseFit(rec.obj,rec.e);
      for(const r of rec.rect||[]){const i=this.town.rects.indexOf(r);if(i>=0)this.town.rects.splice(i,1);}
      rec.rect=this.houseCollisionRects(rec.e).map(r=>this.town.addRect(r.x0,r.x1,r.z0,r.z1,'decor'));
    }
    this.connectionRevision=(this.connectionRevision||0)+1;
    this.town.renderOptimizer?.invalidateDecor();
    this.town.renderOptimizer?.invalidateBounds();
  }
  addObj(e, animate = true) {
    const [w, d] = this.size(e.id, e.rot);
    const obj = this.cfg.key==='house'&&e.id!=='fence' ? this.houseObject(e.id) : buildDecor(e.id);
    const x = this.lot.x0 + e.gx + w / 2, z = this.lot.z0 + e.gz + d / 2;
    const off=e.id==='fence'?this.fenceOffset(e.rot):{x:0,z:0};
    const angle=(e.rot*Math.PI)/2;
    const ox=off.x*Math.cos(angle)+off.z*Math.sin(angle),oz=-off.x*Math.sin(angle)+off.z*Math.cos(angle);
    const baseY = this.cfg.freeBuild ? yardLevel(e) * YARD_LEVEL_HEIGHT : 0;
    obj.position.set(x+ox, baseY + (isYardStructure(e.id) ? 0 : 0.05), z+oz);
    obj.rotation.y = (e.rot * Math.PI) / 2;
    if(obj._furnitureShape)this.applyHouseFit(obj,e);
    this.town.scene.add(obj);
    this.town.seasons.scanTrees(obj);
    const rec = { e, obj, rect: null, tick: obj.userData.tick };
    if (isYardStructure(e.id)) rec.rect = buildCollisionRects(e, DECO, this.lot).map(r => Object.assign(this.town.addRect(r.x0,r.x1,r.z0,r.z1,'building'),r));
    if (e.id !== 'picnic' && !DECO[e.id].flat && !isYardStructure(e.id)) {
      if (this.cfg.key==='house') {
        rec.rect=this.houseCollisionRects(e).map(r=>this.town.addRect(r.x0,r.x1,r.z0,r.z1,'decor'));
      } else if (e.id === 'arch' || e.id === 'swing') {
        // 拱门与秋千中间可以穿过
        rec.rect = [];
        const horiz = e.rot % 2 === 0;
        for (const s of [-1, 1]) rec.rect.push(horiz ? this.town.addRect(x + s * 0.85 - 0.2, x + s * 0.85 + 0.2, z - 0.3, z + 0.3, 'decor') : this.town.addRect(x - 0.3, x + 0.3, z + s * 0.85 - 0.2, z + s * 0.85 + 0.2, 'decor'));
      } else rec.rect = [this.town.addRect(x - w / 2 + 0.12, x + w / 2 - 0.12, z - d / 2 + 0.12, z + d / 2 - 0.12, 'decor')];
    }
    if (rec.rect && this.cfg.freeBuild && !isYardStructure(e.id)) {
      const box = new THREE.Box3().setFromObject(obj);
      for (const rect of rec.rect) { rect.y0 = baseY; rect.y1 = Math.max(baseY + 0.1, box.max.y); }
    }
    if (isBuildEdge(e.id)) for (const k of buildEdges(e)) this.occEdges.set(k,rec);
    else for (let ix = e.gx; ix < e.gx + w; ix++) for (let iz = e.gz; iz < e.gz + d; iz++) this.layerOf(e.id).set(this.cellKey(ix, iz, yardLevel(e)), rec);
    this.entries.push(rec);
    this.connectionRevision=(this.connectionRevision||0)+1;
    if (isYardStructure(e.id)) this.structures.push(e);
    if (animate) {
      if(this.cfg.key==='house'){
        obj.scale.setScalar(.001);
        tween({dur:.45,ease:ease.outCubic,update:k=>obj.scale.setScalar(Math.max(.001,k))});
      }else popIn(obj, 0.45);
    }
    return rec;
  }
  removeObj(rec) {
    this.connectionRevision=(this.connectionRevision||0)+1;
    const structure = this.structures.indexOf(rec.e);
    if (structure >= 0) this.structures.splice(structure, 1);
    this.town.seasons.clearSubtree(rec.obj);
    this.town.scene.remove(rec.obj);
    disposeSceneResources(rec.obj);
    if (rec.rect) for (const r of rec.rect) {
      const i = this.town.rects.indexOf(r);
      if (i >= 0) this.town.rects.splice(i, 1);
    }
    for (const layer of [this.occ, this.occUnder, this.occPlanes, this.occEdges, this.occCaps, this.occFoundations]) for (const [k, v] of [...layer]) if (v === rec) layer.delete(k);
    const i = this.entries.indexOf(rec);
    if (i >= 0) this.entries.splice(i, 1);
  }

  enter() {
    if (this.active) return false;
    if ((this.cfg.key !== 'house' && this.cfg.key !== 'home' && !this.cfg.freeBuild) || this.town.zone !== this.cfg.key) return false;
    this.active = true;
    this.pendingCost = 0;
    this.cameraMode = 'place';
    this.resetView();
    globalThis.__nuannuanDecorTransaction = true;
    this.clearHistory(true);
    this.continuous = false;
    this.pickupMode = false;
    this.isDown = false;
    this.pointerStart = null;
    this.cursor = null;
    this.selectFloor(null);
    this.grid.visible = true;
    this.pan.x = this.pan.z = 0;
    this.panBy(this.town.pos.x - (this.lot.x0 + this.lot.cols / 2), this.town.pos.z - (this.lot.z0 + this.lot.rows / 2) - this.cfg.dz);
    this.town.setMode('decor');
    this.town.moveTo = null;
    bus.emit('decorMode', true);
    return true;
  }
  exit() {
    if (!this.active) return;
    this.finishStroke();
    // 最终确认才统一扣除本次新购家具费用；金币不足时留在装修模式，避免半成品存档。
    if (!this.commitPendingCost()) return false;
    this.clearHistory(true);
    globalThis.__nuannuanDecorTransaction = false;
    this.active = false;
    this.cameraMode = 'place';
    this.isDown = false;
    this.pointerStart = null;
    this.continuous = false;
    this.pickupMode = false;
    this.setFocus(null);
    this.grid.visible = false;
    this.selectFloor(null);
    this.town.setMode('play');
    this.town.resolve(this.town.pos, 0.36);
    bus.emit('decorMode', false);
    save();
    return true;
  }
  panBy(dx, dz) {
    const mx = Math.max(0, this.lot.cols / 2 - 6), mz = Math.max(0, this.lot.rows / 2 - 4);
    this.pan.x = clamp(this.pan.x + dx, -mx, mx);
    this.pan.z = clamp(this.pan.z + dz, -mz, mz);
  }
  setCameraMode(mode = 'place') {
    mode = ['place', 'orbit', 'pan'].includes(mode) ? mode : 'place';
    if (mode !== 'place') this.cancelPointer();
    this.cameraMode = mode;
    this.updateGhost();
    bus.emit('decorCamera', mode);
  }
  toggleCamera() { this.setCameraMode(this.cameraMode === 'place' ? 'orbit' : 'place'); }
  rotateView(step = Math.PI / 2) {
    this.viewYaw += step;
    bus.emit('decorCamera', this.cameraMode);
  }
  toggleTopView() {
    this.viewPitch = this.viewPitch > 1.18 ? 1.0 : 1.34;
    bus.emit('decorCamera', this.cameraMode);
  }
  resetView() {
    this.viewYaw = 0.25;
    this.viewPitch = 1.0;
    this.zoom = this.cfg.zoom;
    this.pan.x = this.pan.z = 0;
    this.cameraMode = 'place';
    bus.emit('decorCamera', this.cameraMode);
  }
  zoomBy(delta) { this.zoom = clamp(this.zoom + delta, 20, 62); }
  panCameraBy(dx, dz) {
    const k = this.zoom / 620;
    const sx = -dx * k, sz = -dz * k * 1.3;
    const c = Math.cos(this.viewYaw), s = Math.sin(this.viewYaw);
    this.panBy(sx * c - sz * s, sx * s + sz * c);
  }
  select(id) {
    if (id && this.cfg.freeBuild && this.buildLevel > maxBuildBaseLevel(id)) {
      this.setBuildLevel(maxBuildBaseLevel(id));
      bus.emit('toast', id === 'yard_stairs' ? '房屋最多3楼，已切到2楼搭建通往3楼的阶梯' : '房屋最多3楼，已切换到该物件可用的楼层');
    }
    if (id === 'yard_foundation' && this.buildLevel) this.setBuildLevel(0);
    if (isBuildRoof(id) && this.buildLevel === 0) { this.setBuildLevel(1); bus.emit('toast','已切换到2楼高度，为1楼房间封顶'); }
    this.cancelPointer();
    this.finishStroke();
    this.pendingMove = null;
    this.sel = id;
    this.wallSel = null;
    this.pickupMode = false;
    this.isDown = false;
    this.pointerStart = null;
    if (id) this.floorSel = null;
    if (this.focus) { this.focus = null; bus.emit('decorFocus', null); }
    while (this.ghostHolder.children.length) { const old = this.ghostHolder.children[0]; this.ghostHolder.remove(old); disposeSceneResources(old); }
    this.ghostTick = null;
    this.ghostIsStructure = isYardStructure(id);
    // Building previews show their actual joins. The furniture hover animation
    // moves every stair tread through neighbouring faces and makes seams flash.
    this.ghostHolder.position.y = this.ghostIsStructure ? 0 : .12;
    if (id) {
      const m = this.cfg.key==='house'&&id!=='fence' ? this.houseObject(id) : buildDecor(id);
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
        if (this.ghostIsStructure) {
          c.receiveShadow = false;
          c.material = Array.isArray(c.material) ? c.material.map(previewMaterial) : previewMaterial(c.material);
        }
      });
      this.ghostHolder.add(m);
      this.ghostTick = m.userData.tick;
    }
    this.ghost.visible = false;
    this.updateGhost();
    bus.emit('decorSel', id);
  }
  selectFloor(id) {
    this.select(null);
    if (id && this.buildLevel) this.setBuildLevel(0);
    this.floorSel = id;
    bus.emit('decorSel', null);
  }
  selectWall(kind) {
    this.selectFloor(null);
    if(this.cfg.key!=='house'||!this.town.partitions?.enabled)return this.refuse('升级到云朵城堡后解锁隔断');
    if(!['wall','door','move','erase'].includes(kind))return false;
    this.town.partitions.moveTurns=0;this.wallSel=kind;this.wallStatus='';this.updateGhost();bus.emit('decorSel',null);bus.emit('decorChanged');return true;
  }
  setContinuous(on) {
    this.cancelPointer();
    this.finishStroke();
    this.continuous = !!on;
    this.isDown = false;
    this.pointerStart = null;
    bus.emit('decorSel', this.sel);
    bus.emit('decorChanged');
  }
  setPickupMode(on) {
    this.selectFloor(null);
    this.pickupMode = !!on;
    bus.emit('decorSel', null);
    bus.emit('decorChanged');
  }
  rotate() {
    if(this.wallSel&&this.wallSel!=='erase'){this.town.partitions.rotate(this);this.updateGhost();bus.emit('decorSel',null);return;}
    if (!this.sel) return;
    this.rot = (this.rot + 1) % 4;
    audio.sfx('tab');
    this.updateGhost();
  }
  onKey(e) {
    if (this.cameraMode !== 'place') {
      if (e.code === 'Escape') { e.preventDefault(); this.setCameraMode('place'); }
      return;
    }
    if(this.town.partitions?.drag?.decor===this&&((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'||e.code==='Escape')){e.preventDefault();this.cancelPointer();return;}
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.undo(); return; }
    if (e.code === 'KeyR') { if (this.focus) this.focusRotate(); else this.rotate(); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && this.focus) this.focusStore(false);
    if (e.code === 'Escape') { if (this.focus) this.setFocus(null); else if (this.sel || this.floorSel || this.wallSel || this.pickupMode) this.selectFloor(null); else this.exit(); }
  }
  tileAt(e) {
    const ps=this.town.partitions;
    if(['move','erase'].includes(this.wallSel)&&!ps?.drag){
      const hit=this.town.wallPoint(e.clientX,e.clientY);
      if(hit){const cursor={fx:hit.x-this.lot.x0,fz:hit.z-this.lot.z0,height:hit.y};if(ps.nearest(cursor)>=0)return cursor;}
    }
    const p = this.town.groundPoint(e.clientX, e.clientY,ps?.drag?.decor===this?ps.drag.height:this.buildLevel * YARD_LEVEL_HEIGHT);
    return p ? { fx: p.x - this.lot.x0, fz: p.z - this.lot.z0 } : null;
  }
  pickBuildObject(cx,cy) {
    const entries=this.entries.filter(rec=>rec.obj.visible&&yardLevel(rec.e)===this.buildLevel);
    for(const rec of entries)rec.obj.updateMatrixWorld(true);
    const hits=app.ray(cx,cy,this.town.camera).intersectObjects(entries.map(rec=>rec.obj),true);
    for(const hit of hits){let obj=hit.object;while(obj&&obj.parent!==this.town.scene)obj=obj.parent;const rec=entries.find(rec=>rec.obj===obj);if(rec)return rec;}
    return null;
  }
  cancelPointer(){
    this.town.partitions?.cancel(this);this.isDown=false;this.pointerStart=null;this.last=null;
  }
  onDown(e) {
    if (!this.active || this.town.zone !== this.cfg.key || (e.button !== undefined && e.button !== 0)) return;
    this.isDown = true;
    this.pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.dragDistance = 0;
    this.last = { x: e.clientX, y: e.clientY };
    this.cursor = this.tileAt(e);
    if (this.cameraMode !== 'place') {
      try { this.town.canvasCapture?.(e.pointerId); } catch (_) { /* 旧浏览器 */ }
      this.updateGhost();
      return;
    }
    if(this.wallSel&&this.town.partitions.begin(this)){
      try{this.town.canvasCapture?.(e.pointerId);}catch(_){}return;
    }
    if (this.floorSel && this.continuous) { this.finishStroke(); this.stroke = { before: this.snapshot(), cost: 0, count: 0, changed: false }; }
    if (this.floorSel && this.continuous) this.paint();
    else this.updateGhost();
  }
  onMove(e) {
    if (!this.active || this.town.zone !== this.cfg.key) return;
    if (this.isDown && this.pointerStart && this.pointerStart.id !== e.pointerId) return;
    if (this.isDown && this.pointerStart) this.dragDistance = Math.max(this.dragDistance, Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y));
    const viewMode = this.cameraMode;
    if (viewMode === 'orbit' && this.isDown && this.last) {
      this.viewYaw -= (e.clientX - this.last.x) * 0.006;
      this.viewPitch = clamp(this.viewPitch + (e.clientY - this.last.y) * 0.0045, 0.56, 1.42);
      this.last = { x: e.clientX, y: e.clientY };
      this.updateGhost();
      return;
    }
    if (viewMode === 'pan' && this.isDown && this.last) {
      this.panCameraBy(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last = { x: e.clientX, y: e.clientY };
      this.updateGhost();
      return;
    }
    if (viewMode !== 'place') return;
    this.cursor = this.tileAt(e);
    if (this.isDown && this.floorSel && this.continuous) this.paint();
    else if (this.isDown && !this.sel && !this.wallSel && this.last) {
      // 没选东西时拖动 = 平移镜头
      const k = this.zoom / 620;
      this.panBy(-(e.clientX - this.last.x) * k, -(e.clientY - this.last.y) * k * 1.3);
      this.last = { x: e.clientX, y: e.clientY };
    }
    this.updateGhost();
  }
  anchor() {
    if (!this.cursor || !this.sel) return null;
    if(this.sel==='fence')return this.fenceAnchor();
    const [w, d] = this.size(this.sel, this.rot);
    if (this.cfg.freeBuild && isYardStructure(this.sel)) {
      const cacheKey=`${this.connectionRevision||0}|${this.sel}|${this.rot}|${this.buildLevel}|${this.cursor.fx.toFixed(3)}|${this.cursor.fz.toFixed(3)}`;
      if(this.connectionCache?.key===cacheKey)return this.connectionCache.anchor;
      const candidates=buildSnapCandidates(S[this.pk],DECO,this.sel,this.rot,this.cursor.fx,this.cursor.fz,this.buildLevel);
      const anchor=candidates.slice(0,4).find(candidate=>this.canPlace(this.sel,candidate.gx,candidate.gz,this.rot))||{gx:Math.round(this.cursor.fx-w/2),gz:Math.round(this.cursor.fz-d/2),w,d,rot:this.rot};
      this.connectionCache={key:cacheKey,anchor};return anchor;
    }
    return { gx: Math.round(this.cursor.fx - w / 2), gz: Math.round(this.cursor.fz - d / 2), w, d, rot:this.rot };
  }
  // 点选一件已经摆好的家具：脚下亮起金色底板，界面上弹出操作条
  setFocus(rec) {
    this.focus = rec || null;
    this.updateGhost();
    bus.emit('decorFocus', this.focus);
  }
  focusMove() {
    const rec = this.focus;
    if (!rec) return;
    if (!S[this.pk].includes(rec.e)) { this.reload(); return this.refuse('家具已刷新，请重新选择'); }
    if (this.cropLocked(rec.e)) return this.refuse('田里还有作物，不能移动');
    if (!this.canRemove(rec)) return this.refuse(this.placementError || '请先收回依赖这件建筑的物件');
    const before = this.snapshot();
    const { id, rot } = rec.e;
    this.takeOut(rec);
    if (!LOCAL_PLAY) S.decor[id] = (S.decor[id] || 0) + 1;
    audio.sfx('remove');
    this.rot = rot;
    this.buildLevel = yardLevel(rec.e); this.rebuildGrid();
    this.select(id);
    this.cursor = { fx: rec.e.gx + this.size(id, rot)[0] / 2, fz: rec.e.gz + this.size(id, rot)[1] / 2 };
    this.updateGhost();
    this.pendingMove = this.recordEdit(before, '移动家具');
    this.pendingMove.moveId = id;
    this.pendingMove.entry=copy(rec.e);
    save();
    bus.emit('decorChanged');
  }
  focusRotate() {
    const rec = this.focus;
    if (!rec) return;
    if (!S[this.pk].includes(rec.e)) { this.reload(); return this.refuse('家具已刷新，请重新选择'); }
    if (this.cropLocked(rec.e)) return this.refuse('田里还有作物，不能旋转');
    const before = this.snapshot();
    const e = rec.e, old = e.rot;
    // 原地转 90°；转过去放不下就再转，最多转一圈
    let rot = old, ok = false;
    for (let i = 0; i < 4 && !ok; i++) { rot = (rot + 1) % 4; ok = this.canPlace(e.id, e.gx, e.gz, rot, rec); }
    if (!ok || rot === old) { audio.sfx('error'); return this.refuse('旁边太挤了，转不过来——先把它移到宽敞一点的地方'); }
    this.takeOut(rec);
    e.rot = ok ? rot : old;
    S[this.pk].push(e);
    const nr = this.addObj(e, false);
    audio.sfx('tab'); this.recordEdit(before, '旋转家具', { stats: { rotated: 1 } });
    save();
    this.setFocus(nr);
  }
  replaceBuildWall(id) {
    const rec=this.focus, kinds=['yard_wall','yard_door','yard_window'];
    if(!this.active||!this.cfg.freeBuild||!rec||!S[this.pk].includes(rec.e)||!kinds.includes(id)||!kinds.includes(rec.e.id)||id===rec.e.id)return false;
    if(!this.canPlace(id,rec.e.gx,rec.e.gz,rec.e.rot,rec))return this.refuse(this.placementError);
    const owned=LOCAL_PLAY||(S.decor[id]||0)>0,cost=owned?0:DECO[id].price;
    if(!LOCAL_PLAY&&this.pendingCost+cost>S.coins)return this.refuse('更换墙体的金币不足，请先收回未结算物件');
    this.finishStroke();
    const before=this.snapshot(),entry={...rec.e,id},oldId=rec.e.id;
    // Validate the complete replacement before removing anything. Rooms and
    // upper-floor support never pass through an invalid intermediate state.
    this.takeOut(rec);
    if(!LOCAL_PLAY){S.decor[oldId]=(S.decor[oldId]||0)+1;if(owned)S.decor[id]--;else this.pendingCost+=cost;}
    S[this.pk].push(entry);
    const next=this.addObj(entry,false),placement={id,e:copy(entry),zone:this.cfg.key};
    const edit=this.recordEdit(before,'更换墙体',{cost,deferredCost:cost,placements:[placement]});
    bus.emit('decorPlaced',{...placement,obj:next.obj,provisional:true,editId:edit.id});
    this.setFocus(next);audio.sfx('place');save();bus.emit('decorChanged');return true;
  }
  focusStore(sell) {
    const rec = this.focus;
    if (!rec) return;
    if (!S[this.pk].includes(rec.e)) { this.reload(); return this.refuse('家具已刷新，请重新选择'); }
    if (this.cropLocked(rec.e)) return this.refuse('田里还有作物，不能收回或卖出');
    if (!this.canRemove(rec)) return this.refuse(this.placementError || '请先收回依赖这件建筑的物件');
    this.finishStroke();
    if (!LOCAL_PLAY && sell && this.pendingCost > 0 && S.coins + decorSellPrice(rec.e.id) < this.pendingCost) {
      return this.refuse(`待结算家具需 ${this.pendingCost} 噗灵，卖出后仍差 ${this.pendingCost - S.coins - decorSellPrice(rec.e.id)}，请先撤销未付款家具`);
    }
    const before = this.snapshot();
    if (sell) this.clearHistory(true);
    const id = rec.e.id, pos = rec.obj.position.clone();
    this.takeOut(rec);
    if (sell) {
      const v = LOCAL_PLAY ? 0 : decorSellPrice(id);
      addCoins(v, 'recycle');
      audio.sfx('coin');
      stat('recycled');
      fx.sparkle(this.town.scene, pos.setY(0.8), 10, ['#ffd24f', '#ffffff']);
      bus.emit('note', LOCAL_PLAY ? `已移除「${DECO[id].name}」，本地试玩仍可无限取用` : `卖掉了「${DECO[id].name}」 +${v}`);
      bus.emit('toast', '卖出不能撤销，之前的装修操作已完成');
    } else {
      if (!LOCAL_PLAY) S.decor[id] = (S.decor[id] || 0) + 1;
      audio.sfx('remove');
      this.recordEdit(before, '收回家具');
    }
    save();
    this.setFocus(null);
    bus.emit('decorChanged');
  }
  // 把一件摆件从场景和存档里拿掉（不决定它的去向）
  takeOut(rec) {
    const i = S[this.pk].indexOf(rec.e);
    if (i < 0) return false;
    this.removeObj(rec);
    S[this.pk].splice(i, 1);
    if (this.focus === rec) this.setFocus(null);
    return true;
  }
  updateGhost() {
    if (this.cameraMode !== 'place') {
      this.ghost.visible = false;
      if (this.town.partitions) this.town.partitions.preview.visible = false;
      return;
    }
    this.town.partitions?.updatePreview(this);
    if(this.wallSel){this.ghost.visible=false;return;}
    const a = this.anchor();
    if (!a) {
      this.snapJoined=false;
      this.previewStamp=null;
      // 没在摆东西：如果点选了一件家具，就把底板借来做高亮
      const f = this.focus;
      this.ghost.visible = !!f;
      if (f) {
        const [w, d] = this.size(f.e.id, f.e.rot);
        this.ghost.position.set(this.lot.x0 + f.e.gx + w / 2, 0.03 + yardLevel(f.e) * YARD_LEVEL_HEIGHT, this.lot.z0 + f.e.gz + d / 2);
        this.plate.scale.set(w * 1.04, d * 1.04, 1);
        this.plate.material.color.setHex(0xffc94d);
      }
      return;
    }
    this.ghost.visible = true;
    this.ghost.position.set(this.lot.x0 + a.gx + a.w / 2, (this.ghostIsStructure ? 0 : .03) + this.buildLevel * YARD_LEVEL_HEIGHT, this.lot.z0 + a.gz + a.d / 2);
    const ghostRot=a.rot===undefined?this.rot:a.rot;
    if(this.sel==='fence')this.rot=ghostRot;
    this.ghostHolder.rotation.y = (ghostRot * Math.PI) / 2;
    if(this.cfg.key==='house'&&this.ghostHolder.children[0]?._furnitureShape){
      this.applyHouseFit(this.ghostHolder.children[0],{id:this.sel,gx:a.gx,gz:a.gz,rot:ghostRot},this.houseWalls(),true);
    }
    this.plate.scale.set(a.w * 0.96, a.d * 0.96, 1);
    const ok = this.canPlace(this.sel, a.gx, a.gz, this.rot);
    this.snapJoined=!!a.joined;
    const previewStamp = `${ok}|${this.placementError}|${this.supportDistance}|${this.snapJoined}`;
    if (this.cfg.freeBuild && previewStamp !== this.previewStamp) { this.previewStamp = previewStamp; bus.emit('decorPreview'); }
    this.plate.material.color.setHex(ok ? this.cfg.freeBuild && this.supportDistance >= 4 ? 0xffca66 : 0x7fe0a0 : 0xff7f8f);
    this.ghostOk = ok;
  }
  onUp(e, moved) {
    const wasDown = this.isDown && this.pointerStart && this.pointerStart.id === e.pointerId;
    this.isDown = false;
    this.pointerStart = null;
    this.finishStroke();
    if (!wasDown || !this.active || this.town.zone !== this.cfg.key) return;
    if (this.cameraMode !== 'place') return;
    if(this.town.partitions?.drag?.decor===this){
      const hit=document.elementFromPoint(e.clientX,e.clientY);
      if(hit!==this.town.inputCanvas){this.cancelPointer();return;}
      this.cursor=this.tileAt(e);this.town.partitions.end(this);return;
    }
    if (Math.max(moved || 0, this.dragDistance || 0) > (e.pointerType === 'mouse' ? 10 : 24)) return;
    this.cursor = this.tileAt(e);
    if (!this.cursor) return;
    if(this.wallSel){this.town.partitions.edit(this);return;}
    if (this.floorSel) { if (!this.continuous) this.paint(); return; }
    if (this.sel) {
      this.updateGhost();
      const a = this.anchor();
      if (!a || !this.ghostOk) { audio.sfx('error'); if (this.placementError) this.refuse(this.placementError); return; }
      const def = DECO[this.sel];
      const before = this.snapshot(), id = this.sel;
      const moving = this.pendingMove && this.pendingMove.moveId === id && this.history.at(-1) === this.pendingMove ? this.pendingMove : null;
      const fromInventory = LOCAL_PLAY || (S.decor[id] || 0) > 0;
      const cost = fromInventory ? 0 : def.price;
      if (!LOCAL_PLAY) {
        if ((S.decor[this.sel] || 0) > 0) S.decor[this.sel]--;
        else if (def.only) { this.select(null); bus.emit('note', `「${def.name}」是礼物，仓库里的已经摆完了`); return; }
        else if (this.pendingCost + def.price > S.coins) { this.refuse(`当前装修待结算已达 ${this.pendingCost} 噗灵，再放置需要 ${def.price}，金币不够`); return; }
      }
      if (!fromInventory) this.pendingCost += def.price;
      const entry = { ...(moving?.entry||{}), id: this.sel, gx: a.gx, gz: a.gz, rot: a.rot===undefined?this.rot:a.rot };
      if (this.cfg.freeBuild) entry.level = this.buildLevel;
      S[this.pk].push(entry);
      const rec = this.addObj(entry);
      audio.sfx('place');
      fx.sparkle(this.town.scene, rec.obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 8);
      const placement = { id, e: copy(entry), zone: this.cfg.key };
      const edit = this.recordEdit(before, moving ? '移动家具' : '放置家具', { cost, deferredCost: moving ? 0 : cost, stats: moving ? {} : { placed: 1 }, placements: [placement], merge: moving });
      this.pendingMove = null;
      bus.emit('decorPlaced', { ...placement, obj: rec.obj, provisional: true, editId: edit.id });
      save();
      if (!this.continuous) this.select(null);
      else this.updateGhost();
      bus.emit('decorChanged');
    } else if (this.pickupMode) {
      // 先明确开启整理模式，再选择已摆好的家具，防止放完后的第二次误触进入操作条。
      // 先拿上面的家具；这一格只有地毯时才拿地毯
      const tile = this.cellKey(Math.floor(this.cursor.fx), Math.floor(this.cursor.fz));
      const rec = this.cfg.freeBuild ? this.pickBuildObject(e.clientX,e.clientY) : this.occ.get(tile) || this.occUnder.get(tile);
      if (!rec) { if (this.focus) { audio.sfx('tab'); this.setFocus(null); } return; }
      if (rec.e.id === 'plot' && this.town.farm.hasCrop(rec.e)) { audio.sfx('error'); bus.emit('toast', '这块田里还有作物，先收获了再动它'); return; }
      if (rec.e.id === 'bigplot' && this.town.farm.hasCrop(rec.e)) {
        // 种着果树的田挪不动：给一个铲除入口，铲掉之后田就空了，可以随便搬
        audio.sfx('tab');
        bus.emit('shovelTree', rec);
        return;
      }
      audio.sfx('tab');
      this.setFocus(rec === this.focus ? null : rec);
    }
  }
  // 把所有摆件收回仓库
  storeAll() {
    this.finishStroke();
    const before = this.snapshot();
    this.selectFloor(null);
    for (const rec of [...this.entries]) {
      if (this.cropLocked(rec.e)) continue;
      if (!this.takeOut(rec)) continue;
      if (!LOCAL_PLAY) S.decor[rec.e.id] = (S.decor[rec.e.id] || 0) + 1;
    }
    if (JSON.stringify(before.placed) !== JSON.stringify(S[this.pk])) this.recordEdit(before, '收回家具');
    save();
    bus.emit('decorChanged');
  }
  // 换了存档（重新开始）之后，按新存档重建场景里的摆件和地面
  reload() {
    this.stroke = null; this.clearHistory(false);
    this.selectFloor(null);
    this.continuous = false;
    this.pendingCost = 0;
    globalThis.__nuannuanDecorTransaction = Object.values(this.town.decors || {}).some(d => d.active);
    for (const rec of [...this.entries]) this.removeObj(rec);
    if (!S[this.pk]) S[this.pk] = [];
    if (!S[this.fk]) S[this.fk] = this.cfg.defaultFloor();
    S[this.pk] = S[this.pk].filter(e => {
      if (!this.fitsZone(e)) {
        if (!LOCAL_PLAY && DECO[e.id]) S.decor[e.id] = (S.decor[e.id] || 0) + 1;
        return false;
      }
      this.addObj(e, false); return true;
    });
    this.rebuildFloor();
    if(this.cfg.key==='house')this.town.partitions?.rebuild();
  }
  resetFloor() {
    this.finishStroke(); this.clearHistory(true);
    S[this.fk] = this.cfg.defaultFloor();
    this.rebuildFloor();
  }
  update(dt, time) {
    for (const r of this.entries) if (r.tick) r.tick(time, dt);
    if (this.ghost.visible) {
      if (!this.ghostIsStructure) this.ghostHolder.position.y = 0.12 + Math.sin(time * 5) * 0.05;
      this.ghostTick && this.ghostTick(time, dt);
    }
  }
}
