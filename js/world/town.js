// 小镇场景兼容入口：持有原状态字段，显式编排构建、生命周期与每帧职责。
import { THREE } from '../core/kit.js';
import { audio } from '../core/audio.js';
import { S, bus } from '../core/state.js';
import { YARDS } from '../data.js';
import { Farm } from './farm.js';
import { DecorSys } from './decor.js';
import { SeasonSystem } from './seasons.js';
import { housePlan } from './house-plan.js';
import { PartitionSystem } from './partitions.js';
import { ScenePerformance } from './scene-performance.js';
import { BUILD_LOT } from './build-constants.js';
import { installBuildIsland } from './build-island.js';
import { LOT, RLOT } from './town/layout.js';
import { buildIsland, optimizeStatic, place, marker, buildTown } from './town/scenery.js';
import { buildHome, rebuildHouse, updateRoomPlan, roomBlocked, buildRoom, houseSign, rebuildYard } from './town/housing.js';
import { buildLights, buildSky, buildAmbient, applySky, updateAmbient } from './town/environment.js';
import { onPath, inLot, blocked, addRect, addCircle, setZone, wallPoint, groundPoint, walkPoint, yardHeightAt, moveOnYard, resolve } from './town/navigation.js';
import { bindInput, noInput, isActive, setModal, allInter, findInter, interact, updatePrompts } from './town/input.js';
import { buildActors, talk, refreshReqMarks, updateNpcs } from './town/residents.js';
import { act, face, refreshOutfit, celebrate, updatePlayer } from './town/player.js';
import { resetCam, updateBuildRoofView, updateCamera, updatePostProcessing } from './town/camera.js';

export { ISLAND, HOME, LOT, TOWN_HOUSE, RLOT, DOORS, RECYCLE } from './town/layout.js';

export class Town {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 700);
    this.baseFov = 30;
    this.refAspect = 1.25;
    this.maxFov = 46;
    this.post = { tilt: 3.2, vig: 0.2, bloom: 0.2 };
    this.rects = [];
    this.circles = [];
    this.inter = [];
    this.ticks = [];
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.rooms = {}; // 额外的室内区域：名字 → 可走动的范围 // 手机上的移动轮盘：x 右为正，y 上为正
    this.rig = { x: 0, y: 0, z: 0, yaw: 0.52, pitch: 0.74, dist: 26 };
    this.goal = { ...this.rig };
    this.camMode = 'title';
    this.frozen = true;
    this.lock = 0;
    this.moveTo = null;
    this.dynFps = true;
    this.night = 0;
    this.stepAcc = 0;
    this.active = false;
    this.zoom = 28;
    this.camYaw = 0; // 玩家拖动产生的视角偏移（关掉视角模式后保持不变）
    this.camPitch = 0;
    this.camFree = false; // 视角模式：开着的时候拖动画面才会转动镜头
    this.updateRoomPlan();

    this.seasons = new SeasonSystem(this);
    this.buildLights();
    this.buildSky();
    this.buildIsland();
    this.buildTown();
    this.buildHome();
    this.buildActors();
    this.buildAmbient();
    this.farm = new Farm(this);
    this.decors = {
      home: new DecorSys(this, {
        key: 'home', lot: LOT, placedKey: 'placed', floorKey: 'floor', zoom: 46, dz: 3,
        bounds: () => YARDS[(S.yardLv || 1) - 1],
        blocked: [[14, 23, 0, 6], [1, 8, 0, 5]],
        defaultFloor: () => {
          const f = {};
          for (let z = 7; z < 17; z++) for (const x of [18, 19]) f[x + ',' + z] = 'sand';
          for (let x = 3; x < 18; x++) f[x + ',7'] = 'sand';
          return f;
        },
      }),
      house: new DecorSys(this, {
        key: 'house', lot: RLOT, placedKey: 'placedIn', floorKey: 'floorIn', zoom: 30, dz: 1.5, indoor: true,
        blocked: this.roomBlocked(), maxCells: housePlan(3).area,
        defaultFloor: () => ({}),
      }),
      build: new DecorSys(this, {
        key: 'build', freeBuild: true, lot: BUILD_LOT, placedKey: 'buildPlaced', floorKey: 'buildFloor',
        zoom: 48, dz: 0, blocked: [], defaultFloor: () => ({}),
      }),
    };
    this.partitions = new PartitionSystem(this);
    this.rebuildYard();
    this.buildIslandPort = installBuildIsland(this);
    this.bindInput();
    this.applySky(0);
    for (const obj of [this.sky,this.stars,this.moon,...this.clouds]) obj.userData.renderGlobal=true;
    this.renderOptimizer = new ScenePerformance(this);
    bus.on('decorChanged', () => this.renderOptimizer.invalidateDecor());
    for (const event of ['houseResized','partitionChanged']) bus.on(event, () => this.renderOptimizer.invalidateBounds());
  }

  // 构建与重建：入口保持兼容，构造顺序仍由上面的 constructor 明确编排。
  buildIsland() { return buildIsland(this); }
  optimizeStatic() { return optimizeStatic(this); }
  place(obj, x, z, ry = 0, y = 0) { return place(this, obj, x, z, ry, y); }
  marker(x, y, z, color = '#ff8fb1') { return marker(this, x, y, z, color); }
  buildTown() { return buildTown(this); }
  buildHome() { return buildHome(this); }
  rebuildHouse() { return rebuildHouse(this); }
  updateRoomPlan() { return updateRoomPlan(this); }
  roomBlocked() { return roomBlocked(this); }
  buildRoom() { return buildRoom(this); }
  houseSign(x, z, id) { return houseSign(this, x, z, id); }
  rebuildYard(animate) { return rebuildYard(this, animate); }
  buildLights() { return buildLights(this); }
  buildSky() { return buildSky(this); }
  buildAmbient() { return buildAmbient(this); }
  applySky(dt) { return applySky(this, dt); }
  buildActors() { return buildActors(this); }

  // 区域、碰撞与输入。
  onPath(x, z, m = 0.3) { return onPath(this, x, z, m); }
  inLot(x, z, m = 0) { return inLot(this, x, z, m); }
  blocked(x, z, m = 0.4) { return blocked(this, x, z, m); }
  addRect(x0, x1, z0, z1, tag) { return addRect(this, x0, x1, z0, z1, tag); }
  addCircle(x, z, r, tag) { return addCircle(this, x, z, r, tag); }
  setZone(zone, x, z) { return setZone(this, zone, x, z); }
  wallPoint(cx,cy) { return wallPoint(this, cx, cy); }
  groundPoint(cx, cy, height=0) { return groundPoint(this, cx, cy, height); }
  walkPoint(cx, cy) { return walkPoint(this, cx, cy); }
  yardHeightAt(x, z, currentY = this.pos?.y || 0) { return yardHeightAt(this, x, z, currentY); }
  moveOnYard(dx, dz) { return moveOnYard(this, dx, dz); }
  resolve(p, r) { return resolve(this, p, r); }
  bindInput() { return bindInput(this); }
  noInput() { return noInput(this); }
  isActive() { return isActive(this); }
  setModal(on) { return setModal(this, on); }
  allInter() { return allInter(this); }
  findInter() { return findInter(this); }
  interact() { return interact(this); }

  // 角色、居民和镜头。
  act(pose, dur = 0.6) { return act(this, pose, dur); }
  face(x, z) { return face(this, x, z); }
  refreshOutfit() { return refreshOutfit(this); }
  celebrate() { return celebrate(this); }
  updatePlayer(dt) { return updatePlayer(this, dt); }
  talk(n) { return talk(this, n); }
  refreshReqMarks() { return refreshReqMarks(this); }
  updateNpcs(dt) { return updateNpcs(this, dt); }
  resetCam() { return resetCam(this); }
  updateBuildRoofView() { return updateBuildRoofView(this); }

  // 当前区域与场景生命周期仍由 Town 直接管理。
  get canDecorate() {
    return this.zone === 'house' || this.zone === 'home' || (this.zone === 'build' && S.buildQuest?.stage === 3 && S.buildQuest?.rewarded === true);
  }
  get decor() {
    return this.decors[this.zone] || this.decors.home;
  }
  onEnter() {
    this.active = true;
    this.keys.clear();
    audio.startMusic('town');
    this.refreshOutfit();
  }
  onExit() {
    this.farm.clearCarry();
    this.farm.clearHarvestLook?.();
    this.active = false;
    this.keys.clear();
    bus.emit('prompt', null);
  }
  setMode(mode) {
    this.camMode = mode;
    this.frozen = mode !== 'play' || !!this.modal;
    if (mode === 'play') this.player.setPose('idle');
  }

  // 每帧顺序是行为契约：不要将镜头、提示或氛围提前到角色/装修更新之前。
  update(dt, time) {
    this.applySky(dt);
    this.updatePlayer(dt);
    // 居民的散步与计时继续，只暂停远处看不到的骨骼/头顶标记动画。
    this.updateNpcs(dt);
    this.farm.update(dt, time);
    if (this.zone === 'home') this.decors.home.update(dt, time);
    if (this.zone === 'house') this.decors.house.update(dt, time);
    if (this.zone === 'build') this.decors.build.update(dt, time);
    this.updateBuildRoofView();
    for (const f of this.ticks) f(time, dt);
    updatePrompts(this);
    updateCamera(this, dt, time);
    updateAmbient(this, dt, time);
    updatePostProcessing(this, dt);
  }
}
