// 小镇主场景：海岛、建筑、昼夜、玩家控制、NPC、氛围
import { THREE, mergeStatic, cbox, box, cyl, slab, group, mat, glowMats, rboxGeo, textPlane, disposeSceneResources } from '../core/kit.js';
import * as P from '../models/props.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../models/character.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { S, bus, save, stat, addCoins, FRIEND_AT } from '../core/state.js';
import { YARDS, CLOTH, SETS, STYLES, HOMES, HOUSES, DECO } from '../data.js';
import { RESIDENTS as NPCS, RESIDENT_LAYOUT } from '../live/people.js';
import { reqOf } from '../core/requests.js';
import { clamp, lerp, damp, rand, pick, seeded, angleLerp, popIn } from '../core/util.js';
import { Farm } from './farm.js';
import { DecorSys } from './decor.js';
import { SeasonSystem } from './seasons.js';
import { controls, daySeconds, creativeTimePaused } from '../core/preferences.js';
import { outfitFx } from '../live/effects.js';
import { housePlan } from './house-plan.js';
import { PartitionSystem, partitionBatches } from './partitions.js';
import { ScenePerformance } from './scene-performance.js';
import { festivalDialogue } from '../live/festival-dialogue.js';
import { YARD_LEVEL_HEIGHT, isYardStructure, isBuildRoof, yardLevel, yardFootprint, yardSurfaceAt, yardStepAllowed, yardMoveAllowed } from './yard-building.js';
import { BUILD_ISLAND, BUILD_LOT, BUILD_HOME_DOCK, BUILD_DOCK, BUILD_SPAWN } from './build-constants.js';
import { installBuildIsland } from './build-island.js';

export const ISLAND = { w: 90, d: 42, r: 9 }; // 东西各扩出一截：西边是居民区，东边留给以后的新街区
// 家园是远离小镇的一座独立大岛，整片院子都是可布置的网格
export const HOME = { cx: -500, cz: 0, w: 54, d: 42, r: 9 };
export const LOT = { x0: HOME.cx - 19, z0: HOME.cz - 15, cols: 38, rows: 26 };
const HOUSE_POS = { x: HOME.cx, z: LOT.z0 + 3 };
// 小屋在小镇西侧；进屋是独立的室内空间；穿过后门是后院（上面那座大岛）
export const TOWN_HOUSE = { x: -20, z: -9.5 };
export const RLOT = { x0: 489, z0: -7.5, cols: 22, rows: 15 };
const RC = { x: RLOT.x0 + RLOT.cols / 2, z: RLOT.z0 + RLOT.rows / 2 };
// 各区域之间的门：[所在区域][要去的区域] → 门的位置
export const DOORS = {
  town: { house: { x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3 }, home: { x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3 } },
  house: { town: { x: RC.x, z: RLOT.z0 + RLOT.rows - 0.4 }, home: { x: RC.x, z: RLOT.z0 + 0.9 } },
  home: { house: { x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5 }, town: { x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5 } },
  build: { home: BUILD_DOCK, house: BUILD_DOCK, town: BUILD_DOCK },
};
DOORS.home.build = BUILD_HOME_DOCK; DOORS.house.build = DOORS.house.home; DOORS.town.build = DOORS.town.house;
export const RECYCLE = { x: LOT.x0 + 5, z: LOT.z0 + 3 };
const PLAZA = { x: 6, z: 4, r: 6.2 };
const PATHS = [
  [-21, -19, -7.4, 5], [-21, 2, 3, 5], [5, 7, -8.5, 0], [-9.5, 19.5, -10.3, -8.3],
  [-7.7, -5.7, -11.2, -9.5], [2.7, 4.7, -11.9, -9.5], [12.9, 14.9, -11.4, -9.5],
  [10, 23, 3, 5], [21, 23, 1.2, 4], [5, 7, 8, 19.6],
  // 西边住宅区：主路向西延伸，北侧再开一条樱花巷
  [-42.6, -21, 3, 5], [-42.6, -21, -6.7, -4.9], [-43.4, -41.6, -6.7, 5],
  // 东边：主路通到预留地
  [23, 34, 3, 5],
];
const PIER = [5, 7, 19, 27];

function sdRR(x, z, isl) {
  const hx = isl.w / 2 - isl.r, hz = isl.d / 2 - isl.r;
  const qx = Math.abs(x - (isl.cx || 0)) - hx, qz = Math.abs(z - (isl.cz || 0)) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - isl.r;
}
const sdIsland = (x, z) => sdRR(x, z, ISLAND);

// 昼夜关键帧
const C = (h) => new THREE.Color(h);
const SKY = [
  { t: 0.0, top: C('#9ec9ff'), bot: C('#ffdbe6'), sun: C('#ffd9b8'), si: 2.2, hs: C('#fff4f0'), hg: C('#ffd9c8'), hi: 1.0, n: 0.2 },
  { t: 0.1, top: C('#79c2ff'), bot: C('#dff3ff'), sun: C('#fff4e0'), si: 2.7, hs: C('#f4fbff'), hg: C('#ffe2cf'), hi: 1.2, n: 0 },
  { t: 0.56, top: C('#79c2ff'), bot: C('#dff3ff'), sun: C('#fff4e0'), si: 2.7, hs: C('#f4fbff'), hg: C('#ffe2cf'), hi: 1.2, n: 0 },
  { t: 0.68, top: C('#8f9df2'), bot: C('#ffc6a6'), sun: C('#ffae78'), si: 2.2, hs: C('#ffe2e2'), hg: C('#ffc9b8'), hi: 0.95, n: 0.4 },
  { t: 0.77, top: C('#2a2e6e'), bot: C('#7377c4'), sun: C('#aebaff'), si: 1.0, hs: C('#99a4ff'), hg: C('#5a579c'), hi: 0.8, n: 1 },
  { t: 0.93, top: C('#2a2e6e'), bot: C('#7377c4'), sun: C('#aebaff'), si: 1.0, hs: C('#99a4ff'), hg: C('#5a579c'), hi: 0.8, n: 1 },
  { t: 1.0, top: C('#9ec9ff'), bot: C('#ffdbe6'), sun: C('#ffd9b8'), si: 2.2, hs: C('#fff4f0'), hg: C('#ffd9c8'), hi: 1.0, n: 0.2 },
];

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

  // ——————————————————— 构建 ———————————————————
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffe9da, 1.9);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 3);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(app.shadowSize, app.shadowSize);
    const c = s.shadow.camera;
    c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 90;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.05;
    this.scene.add(this.hemi, s, s.target);
    this.nightLights = [[6, 3.4, 4], [HOUSE_POS.x, 3, HOUSE_POS.z + 4], [-5, 3.2, -9], [14.5, 3.2, -9], [22, 3.2, 3]].map(([x, y, z]) => {
      const l = new THREE.PointLight(0xffc98a, 0, 18, 1.5);
      l.position.set(x, y, z);
      this.scene.add(l);
      return l;
    });
  }

  buildSky() {
    this.skyU = { top: { value: C('#79c2ff') }, bot: { value: C('#dff3ff') } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top, bot; varying vec3 vP;
          void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bot, top, smoothstep(-0.02, 0.55, h)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
      })
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;
    this.scene.fog = new THREE.Fog(0xdff3ff, 80, 260);
    // 星星
    const n = 260, pos = new Float32Array(n * 3);
    const rnd = seeded(99);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 300;
      pos[i * 3 + 1] = Math.sin(e) * 300;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    // 月亮 / 太阳只做成天空里的一个发光方块
    this.moon = cbox(14, 14, 14, new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false, transparent: true }), -150, 170, -200, { r: 4, cast: false, receive: false });
    this.scene.add(this.moon);
  }

  buildIsland() {
    const sc = this.scene;
    sc.add(this.seasons.registerGround(slab(ISLAND.w, ISLAND.d, ISLAND.r, 1, '#a5df8c', 0, -1.12, 0, { bevel: 0.12, cast: false })));
    sc.add(slab(ISLAND.w + 3.4, ISLAND.d + 3.4, ISLAND.r + 1.7, 0.6, '#fff0d4', 0, -1.32, 0, { bevel: 0.2, cast: false }));
    sc.add(slab(ISLAND.w + 9, ISLAND.d + 9, ISLAND.r + 4.5, 0.3, '#b9ecf2', 0, -1.3, 0, { bevel: 0.1, cast: false, receive: false }));
    // 水面
    this.waterU = {
      time: { value: 0 }, colA: { value: C('#a6ecf2') }, colB: { value: C('#6fcdf0') }, foam: { value: C('#ffffff') },
      horizon: { value: C('#dff3ff') }, cam: { value: new THREE.Vector2() }, ctr: { value: new THREE.Vector2() }, hsz: { value: new THREE.Vector2(ISLAND.w / 2 - ISLAND.r, ISLAND.d / 2 - ISLAND.r) }, rad: { value: ISLAND.r },
    };
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.ShaderMaterial({
        uniforms: this.waterU, transparent: true,
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `
          uniform float time, rad; uniform vec3 colA, colB, foam, horizon; uniform vec2 cam, hsz, ctr; varying vec3 vW;
          float sdRR(vec2 p){ vec2 q = abs(p) - hsz; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - rad; }
          void main(){
            float d = sdRR(vW.xz - ctr);
            vec3 c = mix(colB, colA, smoothstep(12.0, 1.0, d));
            float wob = sin(vW.x * 0.35 + time * 0.7) * 0.25 + sin(vW.z * 0.4 - time * 0.5) * 0.25;
            float ring = smoothstep(0.86, 0.97, sin((d + wob) * 1.25 - time * 1.1)) * smoothstep(9.0, 2.5, d);
            float edge = smoothstep(2.35 + wob * 0.6, 2.05 + wob * 0.6, d);
            c = mix(c, foam, clamp(ring * 0.5 + edge * 0.9, 0.0, 1.0));
            float sp = sin(vW.x * 0.9 + time * 0.8) * sin(vW.z * 1.1 - time * 0.6) * sin((vW.x + vW.z) * 0.37 + time * 0.3);
            c += foam * smoothstep(0.86, 1.0, sp) * 0.22;
            float dist = length(vW.xz - cam);
            c = mix(c, horizon, smoothstep(70.0, 230.0, dist));
            gl_FragColor = vec4(c, 0.93);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.72;
    sc.add(water);

    // 道路与广场
    const top = (w, d, r, color, x, z, y, th = 0.04) => slab(w, d, r, th, color, x, y - th - 0.012, z, { bevel: 0.012, cast: false });
    const rnd = seeded(4);
    for (let i = 0; i < 16; i++) {
      const x = (rnd() - 0.5) * (ISLAND.w - 8), z = -17 + rnd() * 34;
      if (sdIsland(x, z) < -5) sc.add(this.seasons.registerGround(top(3 + rnd() * 4, 2.4 + rnd() * 3, 1.1, '#b3e69b', x, z, 0.012, 0.012), { patch: true }));
    }
    for (const [x0, x1, z0, z1] of PATHS) sc.add(top(x1 - x0, z1 - z0, 0.7, '#fbeed8', (x0 + x1) / 2, (z0 + z1) / 2, 0.05));
    const disc = (r, color, y) => {
      const m = cyl(r, r, 0.04, color, PLAZA.x, y - 0.04, PLAZA.z, { seg: 48, cast: false });
      sc.add(m);
    };
    disc(PLAZA.r, '#fbeed8', 0.055);
    disc(5.3, '#ffdbe6', 0.062);
    disc(4.95, '#fbeed8', 0.069);
    disc(3.6, '#fff6e6', 0.076);
    // 广场地砖花纹
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      sc.add(cbox(0.5, 0.03, 0.5, i % 2 ? '#ffc9d9' : '#fff3c4', PLAZA.x + Math.cos(a) * 4.28, 0.08, PLAZA.z + Math.sin(a) * 4.28, { r: 0.01, ry: -a + Math.PI / 4, cast: false }));
    }
    // 码头
    for (let i = 0; i < 9; i++) sc.add(box(2.3, 0.14, 0.82, i % 2 ? '#d9b08a' : '#cfa37c', 6, -0.08, 19.4 + i * 0.88, { r: 0.04 }));
    for (const z of [20.5, 23.5, 26.6]) for (const x of [4.9, 7.1]) sc.add(box(0.26, 1.5, 0.26, '#b3855f', x, -0.9, z, { r: 0.07 }));
    this.boat = P.boat();
    this.boat.position.set(10.5, -0.7, 25);
    this.boat.rotation.y = 0.5;
    sc.add(this.boat);
  }

  // 把小镇里的建筑、摊位等「大件」里不会动的零件合并掉，减少绘制次数。
  // 哪些零件会动：先看模型自己登记在 userData 里的节点，再把所有动画跑几个时间点，凡是位置 / 朝向 / 显隐变过的都保留。
  optimizeStatic() {
    // town 自己持有、并在 update 里直接摆弄的对象（大喵、玩家、云、气球、标记圈……）一律不合并，否则会冻住动作、换装后留下旧模型
    const owned = new Set([this.momo?.root, this.player?.root, this.ring, this.balloon, this.sky, this.stars, this.moon, ...(this.clouds || [])].filter(Boolean));
    const roots = this.scene.children.filter((o) => {
      if (owned.has(o)) return false;
      if (!o.isGroup || !o.visible || o.userData.merged || o.userData.noMerge || o.userData.seasonalPlant || o.name || Math.abs(o.position.x) > 120) return false;
      if (o === this.townHouseHolder || o === this.roomRoot || o === this.yardFx) return false;
      let n = 0, bad = false;
      o.traverse((m) => { if (m.isMesh) n++; if (m.userData.noMerge || m.userData.seasonalPlant || m.isInstancedMesh) bad = true; });
      return n >= 12 && !bad;
    });
    if (!roots.length) return 0;
    const nodes = [];
    for (const r of roots) r.traverse((o) => { if (o !== r) nodes.push(o); });
    const snap = () => nodes.map((o) => [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z, o.visible]);
    const base = snap(), moved = new Set();
    const t0 = performance.now() / 1000;
    for (const dtm of [0.37, 1.91, 5.3, 11.7]) {
      for (const f of this.ticks) { try { f(t0 + dtm, 0.016); } catch (e) { /* 个别动画依赖别的状态，跳过 */ } }
      const cur = snap();
      cur.forEach((v, i) => { if (v.some((x, k) => (typeof x === 'number' ? Math.abs(x - base[i][k]) > 1e-6 : x !== base[i][k]))) moved.add(nodes[i]); });
    }
    let total = 0;
    for (const r of roots) {
      const keep = [...moved].filter((o) => { for (let p = o; p; p = p.parent) if (p === r) return true; return false; });
      const reg = (v) => { if (v && v.isObject3D) keep.push(v); else if (Array.isArray(v)) v.forEach(reg); };
      Object.values(r.userData).forEach(reg);
      total += mergeStatic(r, keep);
    }
    this.renderOptimizer?.invalidateBounds();
    return total;
  }
  onPath(x, z, m = 0.3) {
    for (const [x0, x1, z0, z1] of PATHS) if (x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) return true;
    return Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + m;
  }
  inLot(x, z, m = 0) {
    return x > LOT.x0 - m && x < LOT.x0 + LOT.cols + m && z > LOT.z0 - m && z < LOT.z0 + LOT.rows + m;
  }
  blocked(x, z, m = 0.4) {
    for (const r of this.rects) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true;
    for (const c of this.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
    return false;
  }
  addRect(x0, x1, z0, z1, tag) {
    const r = { x0, x1, z0, z1, tag };
    this.rects.push(r);
    return r;
  }
  addCircle(x, z, r, tag) {
    this.circles.push({ x, z, r, tag });
  }
  place(obj, x, z, ry = 0, y = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.scene.add(obj);
    this.seasons.scanTrees(obj);
    if (obj.userData.tick) this.ticks.push((time,dt) => { if (Math.abs(obj.position.x-this.pos.x)<180) obj.userData.tick(time,dt); });
    return obj;
  }
  marker(x, y, z, color = '#ff8fb1') {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }));
    m.position.set(x, y, z);
    m.scale.set(0.8, 1.15, 0.8);
    m.userData.baseY = y;
    this.scene.add(m);
    (this.markers = this.markers || []).push(m);
    return m;
  }

  buildTown() {
    // 店铺
    this.cafe = this.place(P.shopCafe(), -5, -13.5);
    this.addRect(-8.5, -1.5, -16.2, -10.9);
    this.addCircle(-9.9, -10.1, 1.5);
    this.addCircle(-8.3, -10.3, 0.5);
    this.flower = this.place(P.shopFlower(), 5.5, -14);
    this.addRect(2.2, 8.8, -16.6, -11.5);
    this.addRect(5.3, 8.3, -11.4, -10.05);
    this.addCircle(2, -11.1, 0.55);
    this.addCircle(9.1, -11.1, 0.55);
    this.tailor = this.place(P.shopTailor(), 15.5, -13.5);
    this.addRect(12.2, 18.8, -16.1, -11);
    this.addCircle(19.3, -11, 0.7);
    this.boutique = this.place(P.shopBoutique(), 22, -1);
    this.addRect(18.6, 25.4, -3.6, 1.5);
    this.windmill = this.place(P.windmill(), 26, -13.5, -0.5);
    this.addCircle(26, -13.5, 2.1);
    // 居民的家：六栋小屋，门口可以拜访（看委托）
    this.homeMarks = {};
    for (const n of NPCS) {
      const hm = HOMES[n.id];
      this.place(P.cottage({ ...hm, name: n.name }), hm.x, hm.z);
      this.addRect(hm.x - 2.15, hm.x + 2.15, hm.z - 1.75, hm.z + 1.75);
      const dx = hm.x - 0.75, dz = hm.z + 2.7;
      this.homeMarks[n.id] = this.marker(dx, 3.0, hm.z + 2.0, STYLES[n.like].color);
      this.inter.push({ id: 'home_' + n.id, x: dx, z: dz, r: 1.7, label: () => `拜访${n.name}的家`, sub: n.job, act: () => bus.emit('openReq', n.id), marker: this.homeMarks[n.id] });
    }
    // 东边的预留地：一片平整的空地和一块规划牌，以后的新街区放这里
    this.scene.add(slab(12.5, 19, 2, 0.03, '#b9e9a4', 36, -0.02, 1.5, { bevel: 0.012, cast: false }));
    for (const [x, z] of [[30, -7.8], [42, -7.8], [30, 10.8], [42, 10.8]]) { this.scene.add(box(0.14, 0.9, 0.14, '#ffffff', x, 0, z, { r: 0.04 })); this.scene.add(cbox(0.24, 0.24, 0.24, '#ffb3cb', x, 1.0, z, { r: 0.08 })); }
    this.fountain = this.place(P.fountainBig(), PLAZA.x, PLAZA.z);
    this.addCircle(PLAZA.x, PLAZA.z, 2.85);

    // 互动点
    const shopDoor = (id, x, z, label, color) => {
      const mk = this.marker(x, 3.1, z + 0.9, color);
      this.inter.push({ id, x, z: z + 1.2, r: 2, label, act: () => bus.emit('openShop', id), marker: mk });
    };
    shopDoor('cafe', -6.7, -11, '进入 甜心咖啡屋', '#ff8fb1');
    shopDoor('flower', 3.7, -11.6, '进入 花语小筑', '#7fd9a0');
    shopDoor('tailor', 13.9, -11.1, '进入 星梦裁缝铺', '#b9a4f2');
    this.inter.push({ id: 'boutique', x: 22, z: 2.6, r: 2, label: '逛逛 搭配小屋', act: () => bus.emit('openBoutique'), marker: this.marker(22, 3.1, 2.2, '#ffd24f') });
    this.inter.push({ id: 'fish', x: 6, z: 24.6, r: 2.4, label: '进入 悠然钓场', act: () => bus.emit('openShop', 'fish'), marker: this.marker(6, 2.6, 25.6, '#7fc4f5') });
    this.inter.push({ id: 'fountain', x: PLAZA.x, z: PLAZA.z, r: 4, label: '许愿喷泉 · 投一枚硬币 (5)', act: () => bus.emit('wish') });

    // 广场长椅、路灯、彩旗
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = PLAZA.x + Math.cos(a) * 5.15, z = PLAZA.z + Math.sin(a) * 5.15;
      this.place(P.DECOR_BUILD.bench(), x, z, Math.atan2(PLAZA.x - x, PLAZA.z - z));
      this.addCircle(x, z, 0.8);
    }
    const posts = [[-0.6, -2.4], [12.6, -2.4], [12.6, 10.4], [-0.6, 10.4]];
    for (const [x, z] of posts) {
      this.scene.add(box(0.16, 4, 0.16, '#ffffff', x, 0, z, { r: 0.05 }));
      this.scene.add(cbox(0.3, 0.3, 0.3, '#ffd24f', x, 4.1, z, { r: 0.1 }));
      this.addCircle(x, z, 0.25);
    }
    this.scene.add(P.bunting(-0.6, 3.9, -2.4, 12.6, 3.9, -2.4, 13));
    this.scene.add(P.bunting(12.6, 3.9, -2.4, 12.6, 3.9, 10.4, 13));
    this.scene.add(P.bunting(-0.6, 3.9, 10.4, -0.6, 3.9, -2.4, 13));
    this.scene.add(P.bunting(-1.6, 4.3, -10.9, 2.3, 4.3, -11.3, 5));
    this.scene.add(P.bunting(8.7, 4.3, -11.3, 12.3, 4.3, -10.9, 5));
    for (const [x, z, ry] of [[-12.5, 2.3, 0], [-4, 5.7, Math.PI], [3, -7.5, 0], [9, -7.5, Math.PI], [-9, -7.6, 0], [20.2, -7.6, Math.PI], [16, 5.7, Math.PI], [4.2, 13, 0], [7.8, 17.5, Math.PI], [-18.2, -6.2, Math.PI]]) {
      this.place(P.streetLamp(), x, z, ry);
      this.addCircle(x, z, 0.25);
    }

    // 树木花草
    const rnd = seeded(20260);
    const trees = [];
    const tryTree = (x, z, kind, s) => {
      if (sdIsland(x, z) > -1.6 || this.onPath(x, z, 1.4) || this.blocked(x, z, 1.5) || this.inLot(x, z, 1.2)) return false;
      if (Math.abs(x - TOWN_HOUSE.x) < 5.6 && z < -4.5) return false;
      for (const hm of Object.values(HOMES)) if (Math.abs(x - hm.x) < 2.9 && z > hm.z && z < hm.z + 5) return false; // 居民家门口不种树
      if (x > 29 && x < 42.5 && z > -9 && z < 12) return false; // 东边的预留地保持空旷
      if (x > 4 && x < 8 && z > 17) return false;
      for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 2.6) return false;
      const m = kind === 'sakura' ? P.treeSakura(s) : kind === 'pine' ? P.treePine(s) : P.treeRound(s, pick2(rnd, ['#8fd694', '#9ddc9c', '#84cf96']), '#b1e8a8');
      this.place(m, x, z, rnd() * 6.28);
      this.addCircle(x, z, 0.5);
      trees.push({ x, z, m, ph: rnd() * 6 });
      return true;
    };
    const pick2 = (r, a) => a[Math.floor(r() * a.length)];
    // 手工点位
    [[-10.5, -4.2, 'sakura', 1.05], [0.6, -4.5, 'sakura', 0.95], [12.4, -4.6, 'sakura', 1], [-13.5, 12.5, 'sakura', 1.1], [15.5, 11.5, 'sakura', 1.05], [-2.5, 10.5, 'round', 1], [27, 8, 'round', 1.1], [-27.5, 13.5, 'round', 1.1], [17.5, -6, 'round', 0.9], [-13, -8.5, 'round', 1], [28, 0.5, 'sakura', 0.9]].forEach(([x, z, k, s]) => tryTree(x, z, k, s));
    for (let i = 0; i < 620 && trees.length < 64; i++) {
      const x = (rnd() - 0.5) * (ISLAND.w - 2), z = -20 + rnd() * 40;
      const sd = sdIsland(x, z);
      if (sd < -6.5 && rnd() < 0.85) continue;
      if (z > 9 && rnd() < 0.75) continue; // 南侧留空，避免挡镜头
      const kind = z < -15 ? (rnd() < 0.7 ? 'pine' : 'round') : rnd() < 0.25 ? 'sakura' : rnd() < 0.3 ? 'pine' : 'round';
      tryTree(x, z, kind, 0.85 + rnd() * 0.45);
    }
    this.trees = trees;
    for (let i = 0, n = 0; i < 420 && n < 36; i++) {
      const x = (rnd() - 0.5) * (ISLAND.w - 4), z = -19 + rnd() * 38;
      if (sdIsland(x, z) > -1.3 || this.onPath(x, z, 0.9) || this.blocked(x, z, 1) || this.inLot(x, z, 0.8)) continue;
      if (rnd() < 0.3) { this.place(P.rock(0.6 + rnd() * 0.5), x, z, rnd() * 6); this.addCircle(x, z, 0.5); }
      else { this.place(P.bush(pick2(rnd, ['#8fd694', '#a3e0a0', '#ffc2d6']), 0.7 + rnd() * 0.5), x, z, rnd() * 6); this.addCircle(x, z, 0.55); }
      n++;
    }
    // 草丛与小花（实例化）
    const tuftG = rboxGeo(0.1, 0.3, 0.1, 0.04);
    const tufts = new THREE.InstancedMesh(tuftG, mat('#86d07a'), 1300);
    const flowers = new THREE.InstancedMesh(rboxGeo(0.17, 0.14, 0.17, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 320);
    const d = new THREE.Object3D(), col = new THREE.Color();
    const fcols = ['#ff9fbd', '#ffffff', '#ffe27a', '#c9b6f2', '#ffb38a'];
    let ti = 0, fi = 0;
    for (let i = 0; i < 5600 && ti < 1300; i++) {
      const x = (rnd() - 0.5) * (ISLAND.w - 1), z = -20.5 + rnd() * 41;
      if (sdIsland(x, z) > -0.6 || this.onPath(x, z, 0.25) || this.blocked(x, z, 0.1) || this.inLot(x, z, 0.3)) continue;
      const cluster = rnd() < 0.3;
      for (let k = 0; k < 3 && ti < 1300; k++) {
        d.position.set(x + (rnd() - 0.5) * 0.3, 0.1, z + (rnd() - 0.5) * 0.3);
        d.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
        d.scale.setScalar(0.6 + rnd() * 0.8);
        d.updateMatrix();
        tufts.setMatrixAt(ti++, d.matrix);
      }
      if (cluster && fi < 318) {
        const c = fcols[Math.floor(rnd() * fcols.length)];
        for (let k = 0; k < 3 && fi < 320; k++) {
          d.position.set(x + (rnd() - 0.5) * 0.9, 0.2 + rnd() * 0.08, z + (rnd() - 0.5) * 0.9);
          d.rotation.set(0, rnd() * 3, 0);
          d.scale.setScalar(0.8 + rnd() * 0.5);
          d.updateMatrix();
          flowers.setMatrixAt(fi, d.matrix);
          flowers.setColorAt(fi++, col.set(c));
        }
      }
    }
    tufts.count = ti;
    flowers.count = fi;
    tufts.receiveShadow = flowers.receiveShadow = true;
    this.scene.add(tufts, flowers);
    this.seasons.registerGround(tufts, { vegetation: true });
    this.seasons.registerFlowers(flowers);
  }

  buildHome() {
    const sc = this.scene;
    // 岛体
    sc.add(this.seasons.registerGround(slab(HOME.w, HOME.d, HOME.r, 1, '#a5df8c', HOME.cx, -1.12, HOME.cz, { bevel: 0.12, cast: false })));
    sc.add(slab(HOME.w + 3.4, HOME.d + 3.4, HOME.r + 1.7, 0.6, '#fff0d4', HOME.cx, -1.32, HOME.cz, { bevel: 0.2, cast: false }));
    sc.add(slab(HOME.w + 9, HOME.d + 9, HOME.r + 4.5, 0.3, '#b9ecf2', HOME.cx, -1.3, HOME.cz, { bevel: 0.1, cast: false, receive: false }));
    sc.add(this.seasons.registerGround(slab(LOT.cols + 1, LOT.rows + 1, 1.6, 0.012, '#b3e69b', LOT.x0 + LOT.cols / 2, 0.0, LOT.z0 + LOT.rows / 2, { bevel: 0.012, cast: false }), { patch: true }));
    // 房子
    this.houseHolder = group(HOUSE_POS.x, 0, HOUSE_POS.z);
    sc.add(this.houseHolder);
    this.houseRect = this.addRect(0, 0, 0, 0, 'house');
    this.rebuildHouse();
    this.houseSign(HOUSE_POS.x + 4.6, HOUSE_POS.z + 3.2, 'houseSignYard');
    this.inter.push({ id: 'yardDoor', x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5, r: 1.9, label: '回屋里', act: () => bus.emit('travel', 'house'), marker: this.marker(HOUSE_POS.x, 3.3, HOUSE_POS.z + 3, '#ff8fb1') });
    // 回收小铺（农场旁）
    this.recycle = this.place(P.shopRecycle(), RECYCLE.x, RECYCLE.z);
    this.addRect(RECYCLE.x - 2.7, RECYCLE.x + 2.7, RECYCLE.z - 1.9, RECYCLE.z + 1.5);
    this.inter.push({ id: 'recycle', x: RECYCLE.x - 0.9, z: RECYCLE.z + 2.4, r: 2, label: '回收小铺 · 卖作物与闲置家具', act: () => bus.emit('openRecycle'), marker: this.marker(RECYCLE.x - 0.9, 3.4, RECYCLE.z + 1.8, '#6fcf9f') });
    // 小镇里的小屋（正门）
    this.townHouseHolder = group(TOWN_HOUSE.x, 0, TOWN_HOUSE.z);
    sc.add(this.townHouseHolder);
    this.townHouseRect = this.addRect(0, 0, 0, 0, 'house');
    this.rebuildHouse();
    this.houseSign(TOWN_HOUSE.x - 4.6, TOWN_HOUSE.z + 3.6, 'houseSignTown');
    this.inter.push({ id: 'home', x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3, r: 1.9, label: '回家 · 进屋', act: () => bus.emit('travel', 'house'), marker: this.marker(TOWN_HOUSE.x, 3.3, TOWN_HOUSE.z + 2.9, '#ff8fb1') });
    this.buildRoom();
    // 院子外圈的树
    const rnd = seeded(515);
    for (let i = 0, n = 0; i < 500 && n < 34; i++) {
      const x = HOME.cx - HOME.w / 2 + rnd() * HOME.w, z = HOME.cz - HOME.d / 2 + rnd() * HOME.d;
      if (sdRR(x, z, HOME) > -1.5 || this.inLot(x, z, 1.4) || this.blocked(x, z, 2.2)) continue;
      if (x < LOT.x0 + 1 && Math.abs(z - BUILD_HOME_DOCK.z) < 4.5) continue;
      if (z > HOME.cz + 8 && rnd() < 0.7) continue;
      const k = rnd();
      const m = k < 0.3 ? P.treeSakura(0.9 + rnd() * 0.3) : k < 0.55 ? P.treePine(0.9 + rnd() * 0.4) : P.treeRound(0.9 + rnd() * 0.4);
      this.place(m, x, z, rnd() * 6);
      this.addCircle(x, z, 0.5);
      n++;
    }
  }
  rebuildHouse() {
    for (const [hh, pos, rect] of [[this.houseHolder, HOUSE_POS, this.houseRect], [this.townHouseHolder, TOWN_HOUSE, this.townHouseRect]]) {
      if (!hh) continue;
      this.seasons.clearSubtree(hh);
      while (hh.children.length) { const old=hh.children[0];hh.remove(old);disposeSceneResources(old); }
      const m = P.house(S.house);
      // 加入已更新世界矩阵的容器之前测局部边界，父坐标只在下面加一次。
      const b = new THREE.Box3().setFromObject(m);
      hh.add(m);
      Object.assign(rect, { x0: pos.x + Math.max(b.min.x, -3.9) + 0.25, x1: pos.x + Math.min(b.max.x, 4.1) - 0.25, z0: pos.z + b.min.z, z1: pos.z + 2.25 });
      this.seasons.scanTrees(hh);
    }
    if (this.roomRoot && this.roomLevel !== S.house) {
      this.updateRoomPlan(); this.buildRoom();
      this.decors?.house.resizeRoom(this.roomBlocked());
      this.partitions?.rebuild();
      if (this.zone === 'house') { this.resolve(this.pos, .36); this.camSnap = true; }
      bus.emit('houseResized', this.roomPlan);
    }
  }

  updateRoomPlan() {
    const p = this.roomPlan = housePlan(S.house);
    Object.assign(RLOT, {x0:p.x0,z0:p.z0,cols:p.cols,rows:p.rows});
    RC.x=p.centerX; RC.z=p.centerZ;
    // 原有门线保持在 x=500，向东和向南加建，旧家具和地板不用搬动。
    DOORS.house.home.x=DOORS.house.town.x=500;
    DOORS.house.home.z=p.z0+.9; DOORS.house.town.z=p.z0+p.rows-.4;
  }
  roomBlocked() { return [[0,1,1,3],[RLOT.cols-2,RLOT.cols-1,1,3],[10,11,0,0],[10,11,RLOT.rows-1,RLOT.rows-1]]; }

  // 小屋的室内：一整间可以自由布置的大房间
  buildRoom() {
    if (this.roomRoot) {
      this.scene.remove(this.roomRoot); disposeSceneResources(this.roomRoot);
      this.rects=this.rects.filter(r=>!this.roomRects.includes(r));
      this.inter=this.inter.filter(i=>!['backDoor','frontDoor','closet','blueprint'].includes(i.id));
      for(const m of this.roomMarkers){this.scene.remove(m);disposeSceneResources(m);}
      this.markers=this.markers.filter(m=>!this.roomMarkers.includes(m));
    }
    const oldRects=new Set(this.rects),oldMarkers=new Set(this.markers||[]);
    const sc = this.roomRoot = group(), W = RLOT.cols, D = RLOT.rows, x0 = RLOT.x0, z0 = RLOT.z0;
    sc.name='player-house-interior'; this.scene.add(sc);this.roomLevel=S.house;
    sc.add(slab(70, 50, 3, 0.3, '#d9c3ad', RC.x, -0.52, RC.z, { bevel: 0.1, cast: false }));
    sc.add(box(W + 0.6, 0.3, D + 2.2, '#e6c79c', RC.x, -0.3, RC.z + 0.8, { r: 0.06, cast: false }));
    for (let i = 0; i < W; i += 2) sc.add(box(0.06, 0.01, D, '#cfa97a', x0 + i, 0.0, RC.z, { cast: false }));
    // 三面墙 + 墙裙
    this.roomWallShell=group();this.roomWallShell.name='house-wall-shell';
    for(const mesh of partitionBatches([],this.roomPlan,{shell:true}))this.roomWallShell.add(mesh);
    sc.add(this.roomWallShell);
    // 窗户与窗帘
    for (const wx of [x0 + 5, x0 + W - 5]) {
      sc.add(cbox(3, 2.2, 0.16, '#ffffff', wx, 3.1, z0 - 0.02, { r: 0.07 }));
      sc.add(cbox(2.7, 1.9, 0.18, mat('#cfeaff', { emissive: '#bfe2ff', ei: 0.5, rough: 0.4 }), wx, 3.1, z0 - 0.01, { r: 0.05, cast: false }));
      sc.add(cbox(0.08, 1.9, 0.2, '#ffffff', wx, 3.1, z0, { cast: false }));
      for (const sx of [-1, 1]) sc.add(cbox(0.6, 2.6, 0.16, '#ffb3cb', wx + sx * 1.7, 3.1, z0 + 0.1, { r: 0.08 }));
      sc.add(cbox(4.2, 0.2, 0.26, '#ffffff', wx, 4.5, z0 + 0.1, { r: 0.07 }));
    }
    // 后门（通往后院）与前门（通往小镇）
    sc.add(box(1.8, 3, 0.2, '#ffffff', 500, 0, z0 - 0.02, { r: 0.07 }));
    sc.add(box(1.5, 2.8, 0.24, '#8fd9a8', 500, 0, z0, { r: 0.08 }));
    sc.add(cbox(0.8, 0.8, 0.26, mat('#dff5e6', { emissive: '#bfe8cf', ei: 0.5 }), 500, 2.0, z0, { r: 0.1, cast: false }));
    sc.add(cbox(0.12, 0.12, 0.12, '#ffd76a', 500 + 0.5, 1.3, z0 + 0.16, { r: 0.05 }));
    const t1 = textPlane('后院', { color: '#ffffff', bg: '#5fbf85', height: 0.42, size: 56 });
    t1.position.set(500, 3.5, z0 + 0.12);
    sc.add(t1);
    sc.add(box(2.4, 0.06, 1.3, '#ff9fbd', 500, 0, z0 + D + 0.4, { r: 0.03, cast: false }));
    sc.add(box(2.0, 0.07, 0.9, '#ffd0de', 500, 0, z0 + D + 0.4, { r: 0.03, cast: false }));
    for (const sx of [-1, 1]) sc.add(box(0.3, 1.5, 0.3, '#ffffff', 500 + sx * 1.5, 0, z0 + D + 0.5, { r: 0.08 }));
    this.inter.push({ id: 'backDoor', x: 500, z: z0 + 0.9, r: 1.7, label: '去后院 · 菜地与回收小铺', act: () => bus.emit('travel', 'home'), marker: this.marker(500, 4.3, z0 + 0.5, '#6fcf9f') });
    this.inter.push({ id: 'frontDoor', x: 500, z: z0 + D - 0.3, r: 1.5, label: '出门 · 去花愿小镇', act: () => bus.emit('travel', 'town'), marker: this.marker(500, 2.2, z0 + D + 0.4, '#7fc4f5') });
    // 固定的衣橱（换装）和房屋蓝图（升级）
    const wd = group(x0 + 0.95, 0, z0 + 2.5);
    wd.add(box(1.5, 3.2, 2.6, '#fff6ea', 0, 0, 0, { r: 0.1 }));
    wd.add(box(1.6, 0.2, 2.7, '#ff9fbd', 0, 3.2, 0, { r: 0.07 }));
    for (const sz of [-1, 1]) {
      wd.add(box(0.08, 2.7, 1.1, '#ffd9e4', 0.74, 0.25, sz * 0.62, { r: 0.03 }));
      wd.add(cbox(0.1, 0.24, 0.08, '#ffd76a', 0.8, 1.6, sz * 0.14, { r: 0.03 }));
    }
    wd.add(cbox(0.1, 0.5, 0.46, '#ff6f91', 0.78, 2.5, 0, { r: 0.1, rx: Math.PI / 4 }));
    sc.add(wd);
    this.addRect(x0, x0 + 1.75, z0 + 1.1, z0 + 3.9);
    this.inter.push({ id: 'closet', x: x0 + 2.4, z: z0 + 2.5, r: 1.7, label: '衣橱 · 换装', act: () => bus.emit('openCloset'), marker: this.marker(x0 + 1.2, 4.1, z0 + 2.5, '#ff8fb1') });
    const bd = group(x0 + W - 0.9, 0, z0 + 2.5);
    bd.add(box(0.2, 2.2, 2.4, '#d2a67e', 0.2, 0.9, 0, { r: 0.05 }));
    bd.add(box(0.1, 1.8, 2.0, '#fffaf3', 0.08, 1.1, 0, { r: 0.03, cast: false }));
    bd.add(cbox(0.06, 0.6, 0.8, '#ff9fbd', 0.02, 2.2, 0, { r: 0.02, cast: false }));
    bd.add(cbox(0.06, 0.5, 0.5, '#fff3c4', 0.02, 1.7, 0, { r: 0.02, cast: false }));
    bd.add(box(0.5, 0.9, 1.6, '#fff6ea', -0.1, 0, 0, { r: 0.08 }));
    bd.rotation.y = 0;
    sc.add(bd);
    this.addRect(x0 + W - 1.5, x0 + W, z0 + 1.2, z0 + 3.8);
    this.inter.push({ id: 'blueprint', x: x0 + W - 2.3, z: z0 + 2.5, r: 1.7, label: '房屋蓝图 · 升级与装修', act: () => bus.emit('openHome') });
    // 室内常亮的暖光
    for (const lx of [RC.x - 5, RC.x + 5]) {
      const l = new THREE.PointLight(0xffe6cc, 5, 26, 1.3);
      l.position.set(lx, 4.6, RC.z + 1);
      sc.add(l);
      sc.add(cbox(0.04, 1.2, 0.04, '#d9cfc5', lx, 5.6, RC.z + 1, { cast: false }));
      sc.add(cbox(0.9, 0.5, 0.9, mat('#fff3c4', { emissive: '#ffd27a', ei: 1.3 }), lx, 4.8, RC.z + 1, { r: 0.22, cast: false }));
    }
    this.roomRects=this.rects.filter(r=>!oldRects.has(r));
    this.roomMarkers=(this.markers||[]).filter(m=>!oldMarkers.has(m));
  }

  buildActors() {
    this.player = new Character(outfitToLook(S.outfit));
    this.pos = new THREE.Vector3(TOWN_HOUSE.x, 0, TOWN_HOUSE.z + 4.4);
    this.zone = 'town';
    this.player.root.position.copy(this.pos);
    this.scene.add(this.player.root);
    this.momo = new Momo();
    this.momo.setCloak?.(S.momoCloak);
    this.momo.root.position.set(this.pos.x + 1.1, 0, this.pos.z + 0.3);
    this.scene.add(this.momo.root);
    // 点击移动的落点圈
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 28), new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.09;
    this.scene.add(this.ring);
    // 路人
    const N = { W1: [-30, 4], W2: [-39, 4], L1: [-20, -5.8], L2: [-30, -5.8], L3: [-39, -5.8], X1: [30, 4], A: [-20, 4], B: [-10, 4], C: [-0.8, 4], P1: [6, -2.9], P2: [12.8, 4], P3: [6, 10.9], Nn: [6, -9.3], W: [-6.7, -9.3], M: [3.7, -9.3], E: [13.9, -9.3], EE: [19, -9.3], Q: [22, 4], Sp: [6, 17.5] };
    const E = [['A', 'B'], ['A', 'W1'], ['W1', 'W2'], ['A', 'L1'], ['L1', 'L2'], ['L2', 'L3'], ['L3', 'W2'], ['Q', 'X1'], ['B', 'C'], ['C', 'P1'], ['C', 'P3'], ['P1', 'P2'], ['P2', 'P3'], ['P1', 'Nn'], ['Nn', 'W'], ['Nn', 'M'], ['Nn', 'E'], ['E', 'EE'], ['P2', 'Q'], ['P3', 'Sp']];
    const adj = {};
    for (const [a, b] of E) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
    this.nav = { N, adj };
    this.npcs = NPCS.map((def) => {
      const layout = RESIDENT_LAYOUT[def.id], node = layout.node;
      const ch = new Character(randomNpcLook(layout.look));
      ch.root.position.set(N[node][0] + rand(-0.5, 0.5), 0, N[node][1] + rand(-0.5, 0.5));
      this.scene.add(ch.root);
      // 头顶的委托标记：金色「!」= 有新委托，绿色 = 可以交付
      const mk = group(0, 2.75, 0);
      const mm = new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0xffc94d, emissiveIntensity: 0.7, roughness: 0.35 });
      mk.add(new THREE.Mesh(rboxGeo(0.16, 0.42, 0.16, 0.06), mm), new THREE.Mesh(rboxGeo(0.16, 0.16, 0.16, 0.06), mm));
      mk.children[0].position.y = 0.34;
      mk.visible = false;
      ch.root.add(mk);
      return { ch, mk, mm, def, node, prev: null, target: null, wait: rand(0, 3), speed: rand(1.5, 2.1), greet: 0, follow: 0, busy: 0, off: [rand(-0.6, 0.6), rand(-0.6, 0.6)] };
    });
  }

  buildAmbient() {
    const rnd = seeded(77);
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = P.cloud(1.2 + rnd() * 1.6);
      c.position.set(-90 + rnd() * 180, 15 + rnd() * 9, -70 + rnd() * 90);
      c.userData.sp = 0.5 + rnd() * 0.7;
      this.scene.add(c);
      this.clouds.push(c);
    }
    this.balloon = P.balloonAir();
    this.balloon.position.set(-38, 15, -34);
    this.balloon.scale.setScalar(1.4);
    this.scene.add(this.balloon);
    // 花瓣、落叶和雪花统一由四季系统维护。
    // 蝴蝶
    this.bflies = [];
    const bc = ['#ffe27a', '#ffffff', '#c9b6f2', '#8fd0f5', '#ff9fbd'];
    for (let i = 0; i < 7; i++) {
      const g = group();
      const m = mat(bc[i % bc.length], { side: THREE.DoubleSide, emissive: bc[i % bc.length], ei: 0.3 });
      const l = group(0, 0, 0, cbox(0.16, 0.012, 0.2, m, -0.08, 0, 0, { r: 0.005, cast: false }));
      const r = group(0, 0, 0, cbox(0.16, 0.012, 0.2, m, 0.08, 0, 0, { r: 0.005, cast: false }));
      g.add(l, r);
      this.scene.add(g);
      this.bflies.push({ g, l, r, cx: -24 + rnd() * 48, cz: -6 + rnd() * 20, rad: 1 + rnd() * 2, ph: rnd() * 6, sp: 0.5 + rnd() * 0.6 });
    }
  }

  // ——————————————————— 输入 ———————————————————
  bindInput() {
    const MOVE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    window.addEventListener('keydown', (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (!this.active || e.repeat) return;
      if (MOVE[e.code]) { this.keys.add(e.code); this.moveTo = null; e.preventDefault(); }
      if (this.noInput()) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { this.interact(); e.preventDefault(); }
      if (this.decor.active) this.decor.onKey(e);
      else if (/^Digit[1-6]$/.test(e.code)) this.farm.pickSeed(Number(e.code.slice(5)) - 1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const cv = app.canvas;
    this.inputCanvas=cv;
    cv.addEventListener('contextmenu', e => { if (this.decor.active) e.preventDefault(); });
    // 指针：单指点击 = 走过去；开启视角模式后单指拖动 = 转动视角；双指捏合 = 缩放（装修模式下单指拖动仍是平移 / 摆放）
    const pts = new Map();
    let down = null, pinch = null;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    const drop = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    cv.addEventListener('pointerdown', (e) => {
      if (this.noInput()) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        // 第二根手指落下：改为缩放，取消这次点击 / 拖动
        if (down && this.decor.active) this.decor.cancelPointer();
        down = null;
        pinch = { d: spread(), zoom: this.decor.active ? this.decor.zoom : this.zoom };
        return;
      }
      this.peekHold = false;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, cam: false };
      if (this.decor.active) this.decor.onDown(e);
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.noInput()) return;
      const pt = pts.get(e.pointerId);
      if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
      if (pinch && pts.size >= 2) {
        const z = pinch.zoom * (pinch.d / spread());
        if (this.decor.active) this.decor.zoom = clamp(z, 20, 62);
        else this.zoom = clamp(z, 13, 38);
        return;
      }
      if (this.decor.active) return this.decor.onMove(e);
      if (down && down.id === e.pointerId) {
        // 只有开着视角模式时，拖动才算转镜头；平时手指的小幅滑动仍然当作点击
        if (this.camFree && !down.cam && !down.block && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.cam = true;
        if (down.cam && this.camFree && !this.peekHold) {
          // 视角模式：自由转动，水平不设限
          const sensitivity = controls().cameraSensitivity;
          this.camYaw -= (e.clientX - down.lx) * 0.0055 * sensitivity;
          this.camPitch = clamp(this.camPitch + (e.clientY - down.ly) * 0.0045 * sensitivity, -1.1, 0.78);
        }
        down.lx = e.clientX; down.ly = e.clientY;
      }
    });
    this.canvasCapture=id=>cv.setPointerCapture?.(id);
    window.addEventListener('pointercancel', (e) => { drop(e); if (down && down.id === e.pointerId) { down = null; this.decor.cancelPointer(); } });
    window.addEventListener('pointerup', (e) => { if (e.target !== cv) { drop(e); if (down && down.id === e.pointerId) { down = null; this.decor.cancelPointer(); } } });
    cv.addEventListener('pointerup', (e) => {
      const wasPinch = !!pinch;
      drop(e);
      if (wasPinch || this.noInput() || !down || down.id !== e.pointerId) { if (down && down.id === e.pointerId) down = null; if(this.decor.active)this.decor.cancelPointer();return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), cam = down.cam || down.block;
      down = null;
      if (this.decor.active) return this.decor.onUp(e, moved);
      // 手指点屏幕很难完全不动：触屏放宽到 26 像素以内都算点击（鼠标仍是 10）
      if (cam || moved > (e.pointerType === 'mouse' ? 10 : 26)) return;
      const p = this.walkPoint(e.clientX, e.clientY);
      if (!p) return;
      // 彩蛋入口：预留地东南角的小木桩，连续点 10 下
      if (this.zone === 'town' && Math.hypot(p.x - 42, p.z - 10.8) < 1.5) {
        const now = performance.now();
        this.secretN = now - (this.secretT || 0) < 1500 ? this.secretN + 1 : 1;
        this.secretT = now;
        if (this.secretN >= 5) fx.sparkle(this.scene, new THREE.Vector3(42, 1.2, 10.8), 3, ['#ffd24f', '#ffffff']);
        if (this.secretN >= 10) { this.secretN = 0; this.moveTo = null; bus.emit('cheat'); return; }
      }
      // 点到互动点附近：走过去并触发
      let hit = null;
      for (const it of this.allInter()) if (Math.hypot(it.x - p.x, it.z - p.z) < 1.6) hit = it;
      this.moveTo = { x: p.x, z: p.z, hit, stuck: 0 };
      this.ring.position.set(p.x, p.y + 0.09, p.z);
      this.ringT = 0;
    });
    cv.addEventListener('wheel', (e) => {
      if (this.noInput()) return;
      if (this.decor.active) this.decor.zoom = clamp(this.decor.zoom + Math.sign(e.deltaY) * 3, 20, 62);
      else this.zoom = clamp(this.zoom + Math.sign(e.deltaY) * 2, 13, 38);
    }, { passive: true });
  }
  resetCam() {
    this.camYaw = 0;
    this.camPitch = 0;
    this.zoom = 28;
  }
  // 家门口的告示牌：升级房子的入口放在最显眼的地方
  houseSign(x, z, id) {
    const sign = group(x, 0, z);
    sign.add(box(0.16, 1.5, 0.16, '#c9a27a', 0, 0, 0, { r: 0.05 }), box(1.9, 0.9, 0.14, '#fff4e0', 0, 1.1, 0, { r: 0.1 }), box(2.02, 0.12, 0.2, '#ffc94d', 0, 2.0, 0, { r: 0.05 }));
    const txt = textPlane('升级', { size: 96, color: '#b3741a', height: 0.56 });
    txt.position.set(0, 1.55, 0.09);
    sign.add(txt);
    this.scene.add(sign);
    this.addRect(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 'sign');
    const mk = this.marker(x, 3.1, z, '#ffc94d');
    this.inter.push({ id, x, z: z + 1, r: 1.7, marker: mk, act: () => bus.emit('openHome'),
      label: () => { const n = HOUSES[S.house]; return n ? `升级房子 ·「${n.name}」${n.price.toLocaleString()} 噗灵` : '看看我的家（已是最高级）'; } });
  }
  // 后院的可用范围随扩建等级变大：范围外是长满野草的荒地，用白栅栏隔开，栅栏边立一块扩建告示牌
  rebuildYard(animate) {
    if (this.yardFx) {
      this.seasons.clearSubtree(this.yardFx);
      this.scene.remove(this.yardFx);
      disposeSceneResources(this.yardFx);
      for (const r of this.yardRects) this.rects.splice(this.rects.indexOf(r), 1);
      this.inter = this.inter.filter((i) => i.id !== 'yardSign');
      if (this.yardMarker) { this.scene.remove(this.yardMarker); disposeSceneResources(this.yardMarker); this.markers.splice(this.markers.indexOf(this.yardMarker), 1); this.yardMarker = null; }
    }
    const g = (this.yardFx = group());
    this.yardRects = [];
    this.scene.add(g);
    const Y = YARDS[(S.yardLv || 1) - 1], next = YARDS[S.yardLv || 1];
    const east = Y.x1 < LOT.cols - 1, south = Y.z1 < LOT.rows - 1;
    if (!east && !south) return;
    const xb = LOT.x0 + Y.x1 + 1.3, zb = LOT.z0 + Y.z1 + 1.3;
    const xW = HOME.cx - HOME.w / 2 + 1.2, xE = HOME.cx + HOME.w / 2 - 1.2, zN = HOME.cz - HOME.d / 2 + 1.2, zS = HOME.cz + HOME.d / 2 - 1.2;
    // 栅栏：立柱用实例化网格，横杆是两根长条
    const runs = [];
    if (east) runs.push({ ax: 'z', at: xb, a: zN, b: south ? zb : zS });
    if (south) runs.push({ ax: 'x', at: zb, a: xW, b: east ? xb : xE });
    const posts = [], postKeys = new Set();
    for (const r of runs) {
      const len = r.b - r.a, n = Math.round(len / 1.3);
      for (let i = 0; i <= n; i++) {
        const t = r.a + (len * i) / n, point = r.ax === 'z' ? [r.at, t] : [t, r.at], key = point.map(v => v.toFixed(3)).join(',');
        // 东侧与南侧栅栏的交点只保留一根立柱，避免转角处重叠闪烁。
        if (!postKeys.has(key)) { postKeys.add(key); posts.push(point); }
      }
      for (const y of [0.34, 0.72]) g.add(r.ax === 'z' ? box(0.1, 0.12, len, '#fffaf2', r.at, y, (r.a + r.b) / 2, { r: 0.04 }) : box(len, 0.12, 0.1, '#fffaf2', (r.a + r.b) / 2, y, r.at, { r: 0.04 }));
      this.yardRects.push(r.ax === 'z' ? this.addRect(r.at - 0.25, r.at + 0.25, r.a - 3, r.b + 0.25, 'yard') : this.addRect(r.a - 3, r.b + 0.25, r.at - 0.25, r.at + 0.25, 'yard'));
    }
    const pm = new THREE.InstancedMesh(rboxGeo(0.24, 1.02, 0.24, 0.07), mat('#fffaf2'), posts.length);
    const cap = new THREE.InstancedMesh(rboxGeo(0.34, 0.14, 0.34, 0.05), mat('#ffb3cb'), posts.length);
    const d = new THREE.Object3D();
    posts.forEach(([x, z], i) => {
      d.position.set(x, 0.51, z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); pm.setMatrixAt(i, d.matrix);
      d.position.y = 1.08; d.updateMatrix(); cap.setMatrixAt(i, d.matrix);
    });
    pm.castShadow = cap.castShadow = true;
    g.add(pm, cap);
    // 荒地：还没扩建到的格子里长满野草和野花
    const rnd = seeded(4242), fl = S.floor || {};
    const tuft = new THREE.InstancedMesh(rboxGeo(0.13, 0.42, 0.13, 0.04), mat('#8fd480'), 1400);
    const bloom = new THREE.InstancedMesh(rboxGeo(0.2, 0.2, 0.2, 0.06), mat('#ffffff'), 220);
    const col = new THREE.Color(), bc = ['#fff3a8', '#ffffff', '#ffc2d6', '#d9c8ff'];
    let ti = 0, bi = 0;
    for (let x = 0; x < LOT.cols; x++) for (let z = 0; z < LOT.rows; z++) {
      const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      if ((x <= Y.x1 && z <= Y.z1) || fl[x + ',' + z]) continue;
      const wx = LOT.x0 + x + 0.5, wz = LOT.z0 + z + 0.5;
      if (Math.abs(wx - xb) < 0.9 || Math.abs(wz - zb) < 0.9) continue;
      const k = 1 + Math.floor(r1 * 3);
      for (let j = 0; j < k && ti < 1400; j++) {
        d.position.set(wx + (((r2 * (j + 1) * 7.3) % 1) - 0.5) * 0.9, 0.2, wz + (((r3 * (j + 2) * 5.1) % 1) - 0.5) * 0.9);
        d.rotation.set(0, r4 * 6 + j, (r2 - 0.5) * 0.5);
        d.scale.set(1, 0.6 + ((r1 * (j + 3) * 3.7) % 1) * 1.1, 1);
        d.updateMatrix(); tuft.setMatrixAt(ti++, d.matrix);
      }
      if (r4 < 0.16 && bi < 220) {
        d.position.set(wx + (r2 - 0.5) * 0.7, 0.5 + r3 * 0.2, wz + (r1 - 0.5) * 0.7); d.rotation.set(0, r3 * 3, 0); d.scale.setScalar(0.7 + r2 * 0.5);
        d.updateMatrix(); bloom.setMatrixAt(bi, d.matrix); bloom.setColorAt(bi++, col.set(bc[Math.floor(r1 * 4)]));
      }
      if (r3 < 0.022) { const b = r1 < 0.5 ? P.bush('#6fb565', 0.8 + r2 * 0.5) : P.rock(0.7 + r2 * 0.6); b.position.set(wx, 0, wz); b.rotation.y = r4 * 6; g.add(b); }
    }
    tuft.count = ti; bloom.count = bi;
    tuft.receiveShadow = bloom.receiveShadow = true;
    g.add(tuft, bloom);
    this.seasons.registerGround(tuft, { vegetation: true });
    this.seasons.registerFlowers(bloom);
    this.seasons.scanTrees(g);
    // 告示牌：站在栅栏内侧，靠近小路
    const sx = south ? LOT.x0 + 21.6 : xb - 1.3, sz = south ? zb - 1.3 : LOT.z0 + 10.5;
    const sign = group(sx, 0, sz);
    sign.add(box(0.16, 1.5, 0.16, '#c9a27a', 0, 0, 0, { r: 0.05 }), box(1.9, 0.9, 0.14, '#fff4e0', 0, 1.1, 0, { r: 0.1 }), box(2.02, 0.12, 0.2, '#ffb3cb', 0, 2.0, 0, { r: 0.05 }));
    const txt = textPlane('扩建', { size: 96, color: '#cf4f7e', height: 0.56 });
    txt.position.set(0, 1.55, 0.09);
    sign.add(txt);
    if (!south) sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    this.yardRects.push(this.addRect(sx - 0.3, sx + 0.3, sz - 0.3, sz + 0.3, 'yard'));
    this.yardMarker = this.marker(sx, 3.1, sz, '#ffc94d');
    this.inter.push({ id: 'yardSign', x: south ? sx : sx - 1, z: south ? sz - 1 : sz, r: 2, label: next ? `扩建院子 · 下一级「${next.name}」` : '院子', act: () => bus.emit('openYard') });
    // 扩建动画会先把整组栅栏缩到很小；场景裁剪器如果在这一帧缓存了这个
    // 临时包围盒，动画结束后就会继续把已经恢复到正常尺寸的栅栏裁掉。
    // 动画期间把院界视为全局根节点，结束后清除标记并刷新包围盒缓存。
    if (animate) {
      g.userData.renderGlobal = true;
      const appear = popIn(g, 0.6);
      appear.promise.then(() => {
        if (g.userData.renderGlobal) delete g.userData.renderGlobal;
        this.renderOptimizer?.invalidateBounds();
      });
      fx.confetti(this.scene, new THREE.Vector3(sx, 3, sz), 60);
    }
    this.renderOptimizer?.invalidateBounds();
  }
  // 当前所在区域的装修系统（室内 / 后院各一套）
  get canDecorate() {
    return this.zone === 'house' || this.zone === 'home' || (this.zone === 'build' && S.buildQuest?.stage === 3 && S.buildQuest?.rewarded === true);
  }
  get decor() {
    return this.decors[this.zone] || this.decors.home;
  }
  setZone(zone, x, z) {
    if (zone === 'build' && (S.buildQuest?.stage !== 3 || S.buildQuest?.rewarded !== true)) { bus.emit('note', '先到后院码头完成「海风里的空白蓝图」'); return false; }
    const from = this.zone;
    if (zone !== from) for (const d of Object.values(this.decors)) if (d.active && d.exit() === false) return false;
    this.zone = zone;
    const isl = zone === 'build' ? BUILD_ISLAND : zone === 'home' ? HOME : ISLAND;
    if (x === undefined) {
      // 从哪扇门进来，就出现在对应的门口
      if (zone === 'town') { x = TOWN_HOUSE.x; z = TOWN_HOUSE.z + 4.4; }
      else if (zone === 'home') { x = HOUSE_POS.x; z = HOUSE_POS.z + 4.6; }
      else if (zone === 'build') { x = BUILD_SPAWN.x; z = BUILD_SPAWN.z; }
      else { x = 500; z = from === 'home' ? RLOT.z0 + 2.2 : RLOT.z0 + RLOT.rows - 1.8; }
    }
    this.pos.set(x, 0, z);
    this.momo.root.position.set(x + 1, 0, z + 0.4);
    this.moveTo = null;
    this.camSnap = true;
    this.waterU.ctr.value.set(isl.cx || 0, isl.cz || 0);
    this.waterU.hsz.value.set(isl.w / 2 - isl.r, isl.d / 2 - isl.r);
    this.waterU.rad.value = isl.r;
    bus.emit('zoneChanged', zone);
    return true;
  }
  noInput() {
    return !this.active || this.modal || this.camMode === 'title';
  }
  // 玩家正在操作或镜头在动：动静分档帧率要按满帧跑
  isActive() {
    return this.keys.size > 0 || !!(this.stick.x || this.stick.y) || !!this.moveTo || !!this.cine || this.camMode !== 'play' || this.photoOn || this.player.targetMove > 0.01;
  }
  setModal(on) {
    this.modal = on;
    this.frozen = on || this.camMode !== 'play';
    if (on) { this.keys.clear(); this.moveTo = null; }
  }
  wallPoint(cx,cy){
    if(!this.partitions)return null;this.partitions.root.updateMatrixWorld(true);
    return app.ray(cx,cy,this.camera).intersectObjects(this.partitions.root.children,true)[0]?.point||null;
  }
  groundPoint(cx, cy, height=0) {
    const rc = app.ray(cx, cy, this.camera);
    const t = (height-rc.ray.origin.y) / rc.ray.direction.y;
    if (!(t > 0)) return null;
    return rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
  }
  walkPoint(cx, cy) {
    if (this.zone === 'build') {
      const targets = this.decors.build.entries.filter(rec => ['yard_slab','yard_stairs','yard_foundation','yard_roof_flat'].includes(rec.e.id) && rec.obj.visible).map(rec => rec.obj);
      for (const obj of targets) obj.updateMatrixWorld(true);
      const hit = app.ray(cx, cy, this.camera).intersectObjects(targets, true)[0];
      if (hit) return hit.point;
    }
    return this.groundPoint(cx, cy);
  }
  yardHeightAt(x, z, currentY = this.pos?.y || 0) { return this.zone === 'build' ? yardSurfaceAt(S.buildPlaced || [], DECO, x - BUILD_LOT.x0, z - BUILD_LOT.z0, currentY) : 0; }
  moveOnYard(dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let step = 0; step < n; step++) {
      const ox = this.pos.x, oz = this.pos.z, oy = this.pos.y;
      const from = { x: ox - BUILD_LOT.x0, z: oz - BUILD_LOT.z0, y: oy };
      const allowed = p => yardMoveAllowed(S.buildPlaced || [], DECO, from, { x: p.x - BUILD_LOT.x0, z: p.z - BUILD_LOT.z0, y: p.y });
      const attempt = (sx, sz) => {
        const target = this.pos.clone().set(ox + sx, this.yardHeightAt(ox + sx, oz + sz, oy), oz + sz);
        if (!allowed(target)) return false;
        this.resolve(target, 0.36);
        target.y = this.yardHeightAt(target.x, target.z, oy);
        if (!allowed(target)) return false;
        this.pos.copy(target); return true;
      };
      if (!attempt(dx / n, dz / n)) {
        if (!attempt(dx / n, 0)) attempt(0, dz / n);
      }
    }
  }

  allInter() {
    const list = this.inter.slice();
    // 走到居民身边可以搭话
    if (this.zone === 'town') for (const n of this.npcs) {
      const p = n.ch.root.position;
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 2.3) { n.it = n.it || { id: 'npc_' + n.def.id, r: 2.3, prio: -0.4, label: () => (n.rs === 'ready' ? `把东西交给${n.def.name}` : n.rs === 'offer' ? `${n.def.name}好像有事想拜托你` : `和${n.def.name}聊聊`), sub: n.def.job, act: () => (n.rs === 'ready' || n.rs === 'offer' ? bus.emit('openReq', n.def.id) : this.talk(n)) }; n.it.x = p.x; n.it.z = p.z; list.push(n.it); }
    }
    const f = this.pos.y < 0.4 ? this.farm.interactable(this.pos.x, this.pos.z) : null;
    if (f) list.push(f);
    // 展示可以跨区域，因此收回入口也必须在小镇、室内和后院都可用。
    if (!this.decor.active && !this.photoOn && this.farm) {
      const carry = this.farm.carry;
      // The dedicated HUD button is always available. Keep the general
      // interaction prompt free for nearby residents, doors and crops.
      if (carry) list.push({ id: 'giantCarry', x: this.pos.x, z: this.pos.z, r: 1.8, prio: -10, label: '收起巨大作物', sub: '保留摆件，停止展示', act: () => this.farm.stowCarry() });
      else if (this.zone === 'home' && this.farm.hasGiant()) list.push({ id: 'giantShow', x: this.pos.x, z: this.pos.z, r: 1.8, prio: 2, label: '拿起巨大作物炫耀', sub: '带着它在小镇里走走', act: () => this.farm.showOff() });
    }
    return list;
  }
  findInter() {
    let best = null, bd = 1e9;
    for (const it of this.allInter()) {
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      if (d < it.r && d - (it.prio || 0) < bd) { bd = d - (it.prio || 0); best = it; }
    }
    return best;
  }
  interact() {
    if (this.frozen || this.lock > 0 || this.decor.active) return;
    const it = this.cur;
    if (!it || !it.act) return;
    it.act();
  }
  act(pose, dur = 0.6) {
    this.player.setPose(pose);
    this.lock = dur;
    this.moveTo = null;
  }
  face(x, z) {
    this.faceTarget = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  // ——————————————————— 每帧 ———————————————————
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
  refreshOutfit() {
    this.player.setLook(outfitToLook(this.farm?.harvestLook || S.outfit));
    this.momo.setCloak?.(S.momoCloak);
  }
  setMode(mode) {
    this.camMode = mode;
    this.frozen = mode !== 'play' || !!this.modal;
    if (mode === 'play') this.player.setPose('idle');
  }
  celebrate() {
    this.player.setPose('cheer');
    this.lock = 1.4;
    fx.confetti(this.scene, this.pos.clone().setY(1.5), 36);
  }

  resolve(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const c of this.rects) {
        if (c.y0 !== undefined && (p.y + 1.65 <= c.y0 + 0.03 || p.y >= c.y1 - (c.walkable ? .25 : .03))) continue;
        const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1);
        let dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 1e-8) {
            // 在盒子内部：推向最近的边
            const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
          } else {
            const d = Math.sqrt(d2);
            p.x = nx + (dx / d) * r;
            p.z = nz + (dz / d) * r;
          }
        }
      }
      for (const c of this.circles) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-5) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
      }
    }
    // 额外登记的室内（比如诺诺伊的家）：走不出房间的范围
    const room = this.rooms && this.rooms[this.zone];
    if (room) { p.x = clamp(p.x, room.x0, room.x1); p.z = clamp(p.z, room.z0, room.z1); return; }
    // 岛屿边界（码头除外）
    if (this.zone === 'house') {
      p.x = clamp(p.x, RLOT.x0 + 0.45, RLOT.x0 + RLOT.cols - 0.45);
      p.z = clamp(p.z, RLOT.z0 + 0.45, RLOT.z0 + RLOT.rows + 0.3);
      return;
    }
    const home = this.zone === 'home' || this.zone === 'build';
    const sdIsland = home ? (x, z) => sdRR(x, z, this.zone === 'build' ? BUILD_ISLAND : HOME) : (x, z) => sdRR(x, z, ISLAND);
    const onPier = !home && p.x > PIER[0] + 0.3 && p.x < PIER[1] - 0.3 && p.z > PIER[2] && p.z < PIER[3] - 0.5;
    if (!onPier) {
      const sd = sdIsland(p.x, p.z);
      if (sd > -0.9) {
        const e = 0.05;
        const gx = sdIsland(p.x + e, p.z) - sdIsland(p.x - e, p.z), gz = sdIsland(p.x, p.z + e) - sdIsland(p.x, p.z - e);
        const gl = Math.hypot(gx, gz) || 1;
        if (home || !(p.x > PIER[0] + 0.3 && p.x < PIER[1] - 0.3 && p.z > 15)) {
          p.x -= (gx / gl) * (sd + 0.9);
          p.z -= (gz / gl) * (sd + 0.9);
        }
      }
    } else p.x = clamp(p.x, PIER[0] + 0.45, PIER[1] - 0.45);
  }

  updatePlayer(dt) {
    const pl = this.player;
    if (this.zone === 'build') {
      const surface = this.yardHeightAt(this.pos.x, this.pos.z, this.pos.y);
      // A tall stair side is a movement blocker, never an upward snap target.
      if (surface <= this.pos.y || yardStepAllowed(this.pos.y, surface)) this.pos.y = surface;
    }
    let mx = 0, mz = 0;
    if (this.lock > 0) {
      this.lock -= dt;
      if (this.lock <= 0) pl.setPose('idle');
    } else if (this.decor.active && !this.modal) {
      const k = this.keys;
      const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const iy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      this.decor.panBy(ix * 16 * dt, iy * 16 * dt);
    } else if (!this.frozen && !this.decor.active) {
      const k = this.keys;
      const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.stick.x;
      const iy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.stick.y;
      if (ix || iy) {
        if (this.stick.x || this.stick.y) this.moveTo = null;
        const yaw = this.rig.yaw;
        mx = -Math.sin(yaw) * iy + Math.cos(yaw) * ix;
        mz = -Math.cos(yaw) * iy - Math.sin(yaw) * ix;
      } else if (this.moveTo) {
        const t = this.moveTo;
        const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
        const stop = t.hit ? Math.max(0.6, t.hit.r * 0.55) : 0.15;
        if (d < stop || t.stuck > 0.5) {
          this.moveTo = null;
          if (t.hit && d < t.hit.r + 0.4) { this.cur = this.findInter() || this.cur; if (this.cur && this.cur.id === t.hit.id) this.interact(); }
        } else { mx = dx / d; mz = dz / d; }
      }
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      const sp = 5.6 * (1 + outfitFx(S.outfit, 'trip'));
      const ox = this.pos.x, oz = this.pos.z;
      if (this.zone === 'build') this.moveOnYard(mx * sp * dt, mz * sp * dt);
      else {
        this.pos.x += mx * sp * dt;
        this.pos.z += mz * sp * dt;
        this.resolve(this.pos, 0.36);
      }
      const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      if (this.moveTo) this.moveTo.stuck += moved < sp * dt * 0.25 ? dt : -this.moveTo.stuck;
      this.faceTarget = Math.atan2(mx, mz);
      pl.targetMove = 1;
      this.stepAcc += dt;
      if (this.stepAcc > 0.27) {
        this.stepAcc = 0;
        audio.sfx('step');
        fx.burst(this.scene, this.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), { n: 2, colors: ['#ffffff', '#eef9e2'], speed: 0.5, up: 0.9, gravity: 1.6, life: 0.45, size: 0.5 });
      }
    } else pl.targetMove = 0;
    if (this.faceTarget !== undefined) pl.root.rotation.y = angleLerp(pl.root.rotation.y, this.faceTarget, 1 - Math.exp(-13 * dt));
    pl.root.position.copy(this.pos);
    pl.update(dt);

    // 大喵跟随；在后院时它会自己去给缺水的田浇水
    const m = this.momo, mp = m.root.position;
    let bx = this.pos.x - Math.sin(pl.root.rotation.y) * 1.0 + Math.cos(pl.root.rotation.y) * 0.7;
    let bz = this.pos.z - Math.cos(pl.root.rotation.y) * 1.0 - Math.sin(pl.root.rotation.y) * 0.7;
    if (this.zone === 'home' && !this.decor.active && S.settings.momoWater !== false) {
      this.momoCd = (this.momoCd || 0) - dt;
      let job = this.momoJob;
      if (job && (!this.farm.thirsty(job) || Math.hypot(job.obj.position.x - this.pos.x, job.obj.position.z - this.pos.z) > 16)) job = this.momoJob = null;
      if (!job && this.momoCd <= 0) { job = this.momoJob = this.farm.thirstyNear(this.pos.x, this.pos.z, 12); this.momoT = 0; }
      if (job) {
        const jp = job.obj.position, off = job.e.id === 'bigplot' ? 1.9 : 1.4;
        bx = jp.x + off; bz = jp.z + 0.2;
        if (Math.hypot(bx - mp.x, bz - mp.z) < 0.6) {
          m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(jp.x - mp.x, jp.z - mp.z), 1 - Math.exp(-10 * dt));
          if ((this.momoT += dt) > 0.7) {
            if (this.farm.applyWater(job)) { audio.sfx('water'); fx.hearts(this.scene, mp.clone().setY(1.3), 2); stat('momo_water'); stat('watered'); } // 大喵浇的也算在暖暖的浇水次数里
            this.momoJob = null;
            this.momoCd = 1.6;
          }
        }
      }
    } else this.momoJob = null;
    const dx = bx - mp.x, dz = bz - mp.z, d = Math.hypot(dx, dz);
    if (d > 0.5) {
      const sp = Math.min(7.5, d * 3.2);
      mp.x += (dx / d) * sp * dt;
      mp.z += (dz / d) * sp * dt;
      m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
      m.targetMove = clamp(sp / 4);
    } else {
      m.targetMove = 0;
      m.root.rotation.y = angleLerp(m.root.rotation.y, Math.atan2(this.pos.x - mp.x, this.pos.z - mp.z), 1 - Math.exp(-4 * dt));
    }
    mp.y = this.yardHeightAt(mp.x, mp.z);
    m.update(dt);
  }

  // 和居民聊天：第一次自我介绍；聊熟了会送礼；每个人还藏着自己的小彩蛋
  talk(n) {
    const d = n.def, st = (S.npc[d.id] = S.npc[d.id] || { t: 0 });
    const p = n.ch.root.position, night = this.night > 0.6;
    const say = (text, o = {}) => bus.emit('bubble', { obj: n.ch.root, name: d.name, text, life: o.life || 4.2, tone: STYLES[d.like].color });
    const coins = (v) => { addCoins(v, 'npc'); const sp = app.project(p.clone().setY(2.5), this.camera); bus.emit('float', { sx: sp.x, sy: sp.y, text: '+' + v, cls: 'coin' }); };
    const worn = Object.values(S.outfit).map((id) => CLOTH[id]).filter((c) => c && c.set);
    const fullSet = worn.length >= 3 && worn[0].set !== 'reunion' && worn.every((c) => c.set === worn[0].set) ? worn[0].set : null; // 初始套装不算
    const likeN = Object.values(S.outfit).filter((id) => CLOTH[id] && CLOTH[id].style === d.like).length;
    const before = st.t;
    st.t += 1 + outfitFx(S.outfit, 'heart');
    n.busy = 4.2;
    this.face(p.x, p.z);
    audio.sfx('pop', Math.random() * 3);
    let pose = 'wave';
    if (before < 1 && st.t >= 1) say(d.hello, { life: 5.4 });
    else if (before < 3 && st.t >= 3) { say(d.gift); coins(60); fx.hearts(this.scene, p.clone().setY(2), 5); pose = 'cheer'; }
    else if (before < FRIEND_AT && st.t >= FRIEND_AT) {
      say(d.friend, { life: 5.4 });
      coins(300);
      fx.confetti(this.scene, p.clone().setY(2.6), 40);
      fx.hearts(this.scene, p.clone().setY(2), 8);
      audio.sfx('fanfare');
      pose = 'cheer';
      bus.emit('note', `和${d.name}成为了好朋友！`);
    } else if (fullSet && !(S.npc._sets || []).includes(fullSet)) {
      // 彩蛋：穿齐一整套
      (S.npc._sets = S.npc._sets || []).push(fullSet);
      say(`哇——是一整套「${SETS[fullSet].name}」！${SETS[fullSet].anchor.split(' · ')[0]}也太好看了吧！`, { life: 5.4 });
      coins(80);
      fx.sparkle(this.scene, this.pos.clone().setY(1.6), 16, ['#ffffff', '#ffd24f', '#ff9fbd']);
      pose = 'cheer';
      stat('egg_set');
    } else if (d.egg === 'night' && night && !st.secret) {
      // 彩蛋：七弦只在夜里讲的秘密
      st.secret = 1;
      say(d.night[0], { life: 6.5 });
      stat('egg_night');
    } else if (d.egg === 'fan' && st.t >= 2 && n.follow <= 0 && Math.random() < 0.5) {
      // 彩蛋：小粉丝会跟着你走一段
      say('可、可以跟着你走一会儿吗！我保证不捣乱！');
      n.follow = 14;
      fx.hearts(this.scene, p.clone().setY(2), 6);
      stat('egg_fan');
    } else if (likeN >= 3 && Date.now() - (st.liked || 0) > 240000) {
      // 彩蛋：穿了对方偏爱的风格
      st.liked = Date.now();
      say(`你今天这身「${STYLES[d.like].name}」风，完全长在我的审美上！这个送你～`);
      coins(30);
      fx.hearts(this.scene, p.clone().setY(2), 6);
      pose = 'cheer';
      stat('egg_like');
    } else {
      const pool = night ? d.night.concat(d.lines.slice(0, 2)) : d.lines;
      const holiday=festivalDialogue(d.id);
      let line = holiday || pick(pool);
      if (!holiday && line === st.last) line = pool[(pool.indexOf(line) + 1) % pool.length];
      st.last = line;
      say(line);
    }
    n.ch.setPose(pose);
    n.pose = pose;
    stat('npc_talk');
    save();
  }
  // 居民头顶和家门口的委托标记
  refreshReqMarks() {
    for (const n of this.npcs) {
      const s = (n.rs = reqOf(n.def.id).state);
      n.mk.visible = s === 'offer' || s === 'ready';
      n.mm.color.setHex(s === 'ready' ? 0x5fd08f : 0xffc94d);
      n.mm.emissive.setHex(s === 'ready' ? 0x5fd08f : 0xffc94d);
      const hm = this.homeMarks[n.def.id];
      hm.material.color.set(s === 'ready' ? '#5fd08f' : s === 'offer' ? '#ffc94d' : '#d9cfc9');
      hm.material.emissive.set(s === 'ready' ? '#5fd08f' : s === 'offer' ? '#ffc94d' : '#d9cfc9');
      hm.material.emissiveIntensity = s === 'offer' || s === 'ready' ? 0.9 : 0.15;
    }
  }
  updateNpcs(dt) {
    const { N, adj } = this.nav;
    const visible = this.zone === 'town' || this.camMode === 'title';
    if ((this.reqT = (this.reqT || 0) - dt) <= 0) { this.reqT = 1; this.refreshReqMarks(); }
    if (visible) for (const n of this.npcs) { n.mk.position.y = 2.75 + Math.sin(app.time * 4 + n.speed * 9) * 0.08; n.mk.rotation.y = app.time * 2 - n.ch.root.rotation.y; }
    for (const n of this.npcs) {
      const p = n.ch.root.position;
      const dp = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      n.greet -= dt;
      n.busy -= dt;
      if (n.follow > 0 && this.zone === 'town') {
        // 小粉丝跟随中：追着暖暖跑，保持一步的距离
        n.follow -= dt;
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        if (dp > 1.7) { const sp = Math.min(6.2, 2 + dp * 1.6); p.x += (dx / dp) * sp * dt; p.z += (dz / dp) * sp * dt; n.ch.targetMove = 1; } else n.ch.targetMove = 0;
        n.ch.setPose(n.busy > 0 ? n.pose : 'idle');
        n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
        if ((n.heartT = (n.heartT || 0) - dt) <= 0) { n.heartT = 1.6; fx.hearts(this.scene, p.clone().setY(1.9), 2); }
        if (n.follow <= 0) {
          bus.emit('bubble', { obj: n.ch.root, name: n.def.name, text: '今天超开心！下次再一起走吧！', life: 3.6, tone: STYLES[n.def.like].color });
          // 回到离自己最近的路口继续散步
          let best = null, bd = 1e9;
          for (const [k, [nx, nz]] of Object.entries(N)) { const dd = Math.hypot(nx - p.x, nz - p.z); if (dd < bd) { bd = dd; best = k; } }
          n.node = best; n.prev = null; n.target = best; n.wait = 0; n.off = [0, 0];
        }
      } else if (dp < 2.1 && !this.frozen) {
        n.ch.targetMove = 0;
        n.ch.setPose(n.busy > 0 ? n.pose : 'wave');
        n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(this.pos.x - p.x, this.pos.z - p.z), 1 - Math.exp(-8 * dt));
        if (n.greet <= 0 && n.busy <= 0) { n.greet = 14; fx.hearts(this.scene, p.clone().setY(1.9), 3); audio.sfx('pop', Math.random() * 3); const met = S.npc[n.def.id]; bus.emit('bubble', { obj: n.ch.root, name: n.def.name, text: met ? pick(['又见面啦！', '嗨，暖暖！', '今天也很好看！', '大喵也来啦？']) : '你好呀～', life: 2.4, tone: STYLES[n.def.like].color }); }
      } else {
        n.ch.setPose('idle');
        if (n.wait > 0) { n.wait -= dt; n.ch.targetMove = 0; }
        else {
          if (!n.target) {
            const opts = adj[n.node].filter((x) => x !== n.prev);
            n.target = pick(opts.length ? opts : adj[n.node]);
          }
          const [tx, tz] = N[n.target];
          const dx = tx + n.off[0] - p.x, dz = tz + n.off[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 0.3) { n.prev = n.node; n.node = n.target; n.target = null; n.wait = Math.random() < 0.45 ? rand(1.5, 5) : 0; }
          else {
            p.x += (dx / d) * n.speed * dt;
            p.z += (dz / d) * n.speed * dt;
            n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
            n.ch.targetMove = 0.55;
          }
        }
      }
      if (visible) n.ch.update(dt);
    }
  }

  applySky(dt) {
    if (this.camMode !== 'title' && !(creativeTimePaused() && (this.camMode === 'decor' || this.photoOn))) {
      const c = S.clock + dt / daySeconds(), days = Math.floor(c);
      // 昼夜走完一圈（清晨 5 点）就是小镇新的一天
      S.clock = c % 1;
      if (days > 0) { S.gday = (S.gday || 0) + days; save(); bus.emit('newDay', S.gday); }
    }
    const t = S.clock;
    let i = 0;
    while (i < SKY.length - 2 && t > SKY[i + 1].t) i++;
    const a = SKY[i], b = SKY[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t));
    this.skyU.top.value.lerpColors(a.top, b.top, k);
    this.skyU.bot.value.lerpColors(a.bot, b.bot, k);
    this.sun.color.lerpColors(a.sun, b.sun, k);
    this.sun.intensity = lerp(a.si, b.si, k);
    this.hemi.color.lerpColors(a.hs, b.hs, k);
    this.hemi.groundColor.lerpColors(a.hg, b.hg, k);
    this.hemi.intensity = lerp(a.hi, b.hi, k);
    const n = (this.night = lerp(a.n, b.n, k));
    this.scene.fog.color.copy(this.skyU.bot.value);
    this.waterU.horizon.value.copy(this.skyU.bot.value);
    this.waterU.colA.value.set('#a6ecf2').lerp(C('#6c7fd6'), n * 0.8);
    this.waterU.colB.value.set('#6fcdf0').lerp(C('#3c4aa6'), n * 0.85);
    this.waterU.foam.value.set('#ffffff').lerp(C('#c2c8ff'), n * 0.6);
    this.stars.material.opacity = clamp((n - 0.5) * 2);
    this.moon.material.opacity = clamp((n - 0.4) * 1.8);
    // 夜景保留温暖的灯光层次，但压低店铺与路灯的峰值，避免移动网页夜间泛白刺眼。
    for (const g of glowMats) g.m.emissiveIntensity = lerp(g.day, g.night * 0.78, clamp(n * 1.2));
    for (const l of this.nightLights) l.intensity = clamp(n * 1.2) * 18;
    // 太阳方位随时间缓慢移动
    const sx = lerp(-16, 14, clamp(t / 0.72));
    this.sunOff = this.sunOff || new THREE.Vector3();
    this.sunOff.set(n > 0.9 ? -10 : sx, 24, 13);
    app.bloom.strength = this.active ? 0.2 + n * 0.3 : app.bloom.strength;
  }

  updateBuildRoofView() {
    const decor = this.decors?.build;
    if (!decor) return;
    const level = Math.floor((this.pos.y + .2) / YARD_LEVEL_HEIGHT);
    const x = this.pos.x - BUILD_LOT.x0, z = this.pos.z - BUILD_LOT.z0;
    const inBuild = this.zone === 'build', isRoof = isBuildRoof;
    let roofCovered = false, covered = false, onStairs = false;
    if (inBuild && !decor.active) for (const e of decor.structures) {
      if (!isRoof(e.id) && e.id !== 'yard_slab' && e.id !== 'yard_stairs') continue;
      const f = yardFootprint(e, DECO);
      if (x < f.x0 || x >= f.x1 || z < f.z0 || z >= f.z1) continue;
      const base = yardLevel(e) * YARD_LEVEL_HEIGHT;
      if (e.id === 'yard_stairs') {
        // Keep the cutaway while crossing an open stairwell. Walking underneath
        // an upstairs stair does not count as climbing that stair.
        if (this.pos.y > base + .01 && this.pos.y <= base + YARD_LEVEL_HEIGHT + .25) onStairs = true;
      } else if (yardLevel(e) > level) {
        covered = true;
        if (isRoof(e.id)) roofCovered = true;
      }
    }
    // Photography keeps its existing roof-only view; first-person/selfie and
    // fixed-tripod shots must not unexpectedly lose the upper building facade.
    const cutaway = inBuild && !this.photoOn && (decor.active || covered || onStairs);
    const cutLevel = decor.active ? decor.buildLevel : level;
    this.buildCutawayLevel = cutaway ? cutLevel : null;
    let changed = false;
    for (const rec of decor.entries) {
      const roofHidden = isRoof(rec.e.id) && inBuild && (decor.active ? this.buildRoofsHidden : roofCovered && yardLevel(rec.e) > level);
      // In the editor the explicit roof button takes priority over sectioning:
      // "show roofs" must still reveal the facade even while editing floor one.
      const aboveCut = cutaway && yardLevel(rec.e) > cutLevel && !(decor.active && isRoof(rec.e.id));
      const visible = !roofHidden && !aboveCut;
      if (rec.obj.visible !== visible) { rec.obj.visible = visible; changed = true; }
    }
    if (changed) this.renderOptimizer?.invalidateDecor();
  }
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

    // 互动提示
    // 入床后由 UI 的专用操作条提供“睡到明早 / 下床”两个并列按钮，
    // 不再让通用单按钮提示抢走焦点或只显示其中一个。
    const it = this.frozen || this.decor.active || this.homeInteractions?.bedState ? null : this.findInter();
    const label = it ? (typeof it.label === 'function' ? it.label() : it.label) : null;
    if (it !== this.cur || label !== this.curLabel) {
      this.cur = it;
      this.curLabel = label;
      bus.emit('prompt', it ? { label, disabled: !it.act, sub: typeof it.sub === 'function' ? it.sub() : it.sub } : null);
    }
    const zone = !this.frozen ? this.farm.zoneAt(this.pos.x, this.pos.z) : null;
    if (zone !== this.farmZone) { this.farmZone = zone; bus.emit('zone', zone); }

    // 镜头
    const g = this.goal, r = this.rig;
    if (this.camMode === 'title') {
      g.y = 0;
      g.x = -2; g.z = -1; g.dist = 50; g.pitch = 0.6; g.yaw = 0.52 + Math.sin(time * 0.12) * 0.28;
    } else if (this.camMode === 'decor') {
      g.y = this.decor.buildLevel * YARD_LEVEL_HEIGHT;
      const dl = this.decor.lot;
      g.x = dl.x0 + dl.cols / 2 + this.decor.pan.x;
      g.z = dl.z0 + dl.rows / 2 + this.decor.cfg.dz + this.decor.pan.z;
      g.dist = this.decor.zoom;
      g.pitch = this.decor.viewPitch ?? 1.0;
      g.yaw = this.decor.viewYaw ?? 0.25;
    } else {
      g.y = this.pos.y;
      g.x = this.pos.x; g.z = this.pos.z; g.dist = this.zoom; g.pitch = 0.74 + this.camPitch; g.yaw = 0.52 + this.camYaw;
    }
    const kk = this.camSnap ? 1 : 1 - Math.exp(-(this.camMode === 'play' ? 5 : 2.6) * dt);
    this.camSnap = false;
    for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'dist']) r[key] += (g[key] - r[key]) * kk;
    // 彩蛋：镜头真的钻到人物脚下、开始往上看时 —— 不可以，弹回去（这次拖动作废，松手再拖才继续）
    if (this.camMode === 'play' && !this.peekHold && r.pitch < -0.13) {
      this.peekHold = true;
      this.camPitch = -0.3;
      bus.emit('peek');
    }
    const cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
    this.camera.position.set(r.x + Math.sin(r.yaw) * cp * r.dist, 1 + r.y + sp * r.dist, r.z + Math.cos(r.yaw) * cp * r.dist);
    this.camera.lookAt(r.x, 1 + r.y, r.z);
    if (this.cine) this.cine(time, dt, this.camera);
    this.sun.target.position.set(r.x, 0, r.z);
    this.sun.position.set(r.x + this.sunOff.x, this.sunOff.y, r.z + this.sunOff.z);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.waterU.time.value = time;
    this.waterU.cam.value.set(r.x, r.z);

    // 氛围动画
    for (const c of this.clouds) {
      // 云跟着镜头所在的岛走
      c.userData.ox = c.userData.ox ?? c.position.x;
      c.userData.oz = c.userData.oz ?? c.position.z;
      c.userData.ox += c.userData.sp * dt;
      if (c.userData.ox > 100) c.userData.ox = -100;
      c.position.x = r.x + c.userData.ox;
      c.position.z = (this.zone === 'home' ? HOME.cz : 0) + c.userData.oz;
    }
    this.balloon.position.set(-38 + Math.sin(time * 0.05) * 14, 15 + Math.sin(time * 0.4) * 0.8, -34 + Math.cos(time * 0.04) * 6);
    this.balloon.rotation.y = time * 0.1;
    this.boat.position.y = -0.72 + Math.sin(time * 1.2) * 0.07;
    this.boat.rotation.z = Math.sin(time * 0.9) * 0.05;
    this.windmill.userData.blades.rotation.z = -time * 0.7;
    this.cafe.userData.spin.rotation.y = Math.sin(time * 0.6) * 0.3;
    const st = this.cafe.userData.steam;
    st.children.forEach((m, i) => {
      const u = (time * 0.4 + i / 3) % 1;
      m.position.y = u * 1.3;
      m.position.x = (i - 1) * 0.25 + Math.sin(time * 2 + i) * 0.1;
      m.scale.setScalar(0.5 + u * 0.9);
      m.material.opacity = 0.7 * (1 - u);
    });
    this.flower.userData.spin2.rotation.z = time * 0.3;
    this.tailor.userData.spin3.rotation.z = Math.sin(time * 0.8) * 0.25;
    this.boutique.userData.bob.position.y = 7.3 + Math.sin(time * 1.6) * 0.12;
    this.boutique.userData.bob.rotation.y = Math.sin(time * 0.8) * 0.25;
    if (this.markers) for (const m of this.markers) {
      m.position.y = m.userData.baseY + Math.sin(time * 2.4 + m.position.x) * 0.16;
      m.rotation.y = time * 1.6;
      m.visible = this.camMode === 'play';
    }
    if (this.zone === 'town' || this.camMode === 'title') for (const t of this.trees) t.m.rotation.z = Math.sin(time * 0.9 + t.ph) * 0.012;
    this.seasons.update(dt, time);
    for (const b of this.bflies) {
      const a = time * b.sp + b.ph;
      b.g.position.set(b.cx + Math.cos(a) * b.rad, 0.8 + Math.sin(a * 2.3) * 0.35, b.cz + Math.sin(a * 1.3) * b.rad);
      b.g.rotation.y = -a + Math.PI / 2;
      const f = Math.sin(time * 18 + b.ph) * 0.9;
      b.l.rotation.z = f;
      b.r.rotation.z = -f;
      b.g.visible = this.night < 0.6 && this.seasons.current !== 'winter' && (this.zone === 'town' || this.zone === 'home' || this.camMode === 'title');
    }
    if (this.ringT !== undefined) {
      this.ringT += dt;
      const u = clamp(this.ringT / 0.6);
      this.ring.material.opacity = this.moveTo ? 0.9 * (1 - u * 0.5) : Math.max(0, this.ring.material.opacity - dt * 3);
      this.ring.scale.setScalar(1 + Math.sin(this.ringT * 8) * 0.08);
    }
    // 移轴焦点跟随主角在屏幕上的高度
    const sp2 = app.project(this.pos, this.camera);
    app.finish.uniforms.focus.value = damp(app.finish.uniforms.focus.value, this.camMode === 'play' ? 1 - sp2.y / app.height : 0.5, 4, dt);
    // 拍照时关掉移轴模糊，整张画面都要清楚
    if (this.photoOn) app.finish.uniforms.amount.value = 0;
    else app.finish.uniforms.amount.value = damp(app.finish.uniforms.amount.value, this.camMode === 'decor' ? 1.2 : 3.2, 4, dt);
  }
}
