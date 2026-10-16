// 装修入口：保留现有 DecorSys 方法与字段；具名模块处理事务、场景对象、规则、视图和输入。
import { THREE, group, rboxGeo } from '../core/kit.js';
import { DECO, FLOORS } from '../data.js';
import { S, bus, save, flushSave } from '../core/state.js';
import { yardLevel } from './yard-building.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { floorTex } from './decor/surfaces.js';
export { floorTex } from './decor/surfaces.js';
import * as transactions from './decor/transactions.js';
import * as placement from './decor/placement.js';
import * as objects from './decor/objects.js';
import * as surfaces from './decor/surfaces.js';
import * as view from './decor/view.js';
import * as editing from './decor/editing.js';
import * as input from './decor/input.js';

const key = (x, z) => x + ',' + z;

/**
 * 所有可变装修状态仍由本实例持有，UI/Town/隔断可继续访问原有字段和方法。
 * 下方显式委托便于查找职责；模块不回写 prototype，也不引入第二份会话状态。
 */
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
    this.furnitureDrag = null; // 未提交的直接拖动，仅持有预览，不改存档和库存。
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
      this.cancelPointer();
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

  get canUndo() { return this.active && this.town.zone === this.cfg.key && !!(this.furnitureDrag?.active || this.history.length || this.stroke || this.town.partitions?.drag?.decor===this); }
  get undoLabel() { return this.furnitureDrag?.active ? '正在拖动的家具' : this.town.partitions?.drag?.decor===this?'正在拖动的隔断':this.stroke ? '铺地' : this.history.at(-1)?.label || ''; }
  snapshot() { return transactions.snapshot(this); }
  editEvent() { bus.emit('decorHistoryChanged', this); }
  commitEdit(edit) { return transactions.commitEdit(this, edit); }
  clearHistory(commit = true) { return transactions.clearHistory(this, commit); }
  recordEdit(before, label, options = {}) { return transactions.recordEdit(this, before, label, options); }

  // 提交本次装修会话里新购家具的总价。silent 用于 pagehide，不能弹交互式提示。
  commitPendingCost(silent = false) { return transactions.commitPendingCost(this, silent); }
  finishStroke() { return transactions.finishStroke(this); }
  cropLocked(e) { return placement.cropLocked(this, e); }
  cropSafe(placed) { return placement.cropSafe(this, placed); }
  refuse(message) { bus.emit('toast', message, { dedupeKey: 'decor-refuse:' + message }); return false; }
  rebuildObjects(placed, floor, walls=[]) { return objects.rebuildObjects(this, placed, floor, walls); }
  undo() { return transactions.undo(this); }

  layoutSlots() { return transactions.layoutSlots(this); }
  saveLayout(slot, name) { return transactions.saveLayout(this, slot, name); }
  deleteLayout(slot) { return transactions.deleteLayout(this, slot); }
  validateLayout(plan, checkSupply = true) { return transactions.validateLayout(this, plan, checkSupply); }
  previewLayout(slot) { return transactions.previewLayout(this, slot); }
  applyLayout(slot) { return transactions.applyLayout(this, slot); }

  // 可布置范围：整块地，或配置里给的动态边界（后院随扩建等级变大）
  resizeRoom(blocked) { return surfaces.resizeRoom(this, blocked); }
  inBounds(x, z) { return placement.inBounds(this, x, z); }
  rebuildGrid() { return surfaces.rebuildGrid(this); }
  rebuildFloor() { return surfaces.rebuildFloor(this); }
  paint() { return surfaces.paint(this); }

  size(id, rot) { return placement.size(this, id, rot); }
  layerOf(id) { return placement.layerOf(this, id); }
  cellKey(x, z, level = this.buildLevel) { return placement.cellKey(this, x, z, level); }
  fitsZone(e) { return placement.fitsZone(this, e); }
  validateYard(placed) { return placement.validateYard(this, placed); }
  setBuildLevel(level) { return placement.setBuildLevel(this, level); }
  canRemove(rec) { return placement.canRemove(this, rec); }
  canPlace(id, gx, gz, rot, ignore = null, level = ignore ? yardLevel(ignore.e) : this.buildLevel) { return placement.canPlace(this, id, gx, gz, rot, ignore, level); }
  fenceOffset(rot) { return placement.fenceOffset(this, rot); }
  fenceAnchor() { return placement.fenceAnchor(this); }
  houseWalls() { return objects.houseWalls(this); }
  houseFit(e, walls = this.houseWalls(), obj = null) { return objects.houseFit(this, e, walls, obj); }
  houseObject(id) { return objects.houseObject(this, id); }
  applyHouseFit(obj, e, walls = this.houseWalls(), preview = false) { return objects.applyHouseFit(this, obj, e, walls, preview); }
  houseCollisionRects(e, walls = this.houseWalls()) { return objects.houseCollisionRects(this, e, walls); }
  refreshFurnitureFits() { return objects.refreshFurnitureFits(this); }
  addObj(e, animate = true) { return objects.addObj(this, e, animate); }
  removeObj(rec) { return objects.removeObj(this, rec); }

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
    this.cancelPointer();
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
  panBy(dx, dz) { return view.panBy(this, dx, dz); }
  setCameraMode(mode = 'place') { return view.setCameraMode(this, mode); }
  toggleCamera() { return view.toggleCamera(this); }
  rotateView(step = Math.PI / 2) { return view.rotateView(this, step); }
  toggleTopView() { return view.toggleTopView(this); }
  resetView() { return view.resetView(this); }
  zoomBy(delta) { return view.zoomBy(this, delta); }
  panCameraBy(dx, dz) { return view.panCameraBy(this, dx, dz); }
  select(id) { return view.select(this, id); }
  selectFloor(id) { return view.selectFloor(this, id); }
  selectWall(kind) { return view.selectWall(this, kind); }
  setContinuous(on) { return view.setContinuous(this, on); }
  setPickupMode(on) { return view.setPickupMode(this, on); }
  rotate() { return view.rotate(this); }
  onKey(e) { return input.onKey(this, e); }
  tileAt(e) { return input.tileAt(this, e); }
  pickBuildObject(cx,cy) { return input.pickBuildObject(this, cx, cy); }
  cancelPointer() { return input.cancelPointer(this); }
  onDown(e) { return input.onDown(this, e); }
  onMove(e) { return input.onMove(this, e); }
  anchor() { return placement.anchor(this); }
  // 点选一件已经摆好的家具：脚下亮起金色底板，界面上弹出操作条
  setFocus(rec) { return view.setFocus(this, rec); }
  focusMove() { return editing.focusMove(this); }
  focusRotate() { return editing.focusRotate(this); }
  replaceBuildWall(id) { return editing.replaceBuildWall(this, id); }
  focusStore(sell) { return editing.focusStore(this, sell); }
  // 把一件摆件从场景和存档里拿掉（不决定它的去向）
  takeOut(rec) { return editing.takeOut(this, rec); }
  updateGhost() { return view.updateGhost(this); }
  onUp(e, moved) { return input.onUp(this, e, moved); }
  // 把所有摆件收回仓库
  storeAll() { return editing.storeAll(this); }
  // 换了存档（重新开始）之后，按新存档重建场景里的摆件和地面
  reload() { return objects.reload(this); }
  resetFloor() { return surfaces.resetFloor(this); }
  update(dt, time) {
    for (const r of this.entries) if (r.tick) r.tick(time, dt);
    if (this.ghost.visible) {
      if (!this.ghostIsStructure && !this.furnitureDrag?.active) this.ghostHolder.position.y = 0.12 + Math.sin(time * 5) * 0.05;
      this.ghostTick && this.ghostTick(time, dt);
    }
  }
}
