// 小镇岛体、街区与固定景物的构建，以及静态合批；场景对象仍由 Town 持有。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE, mergeStatic, cbox, box, cyl, slab, mat, rboxGeo } from '../../core/kit.js';
import * as P from '../../models/props.js';
import { bus } from '../../core/state.js';
import { STYLES, HOMES } from '../../data.js';
import { RESIDENTS as NPCS } from '../../live/people.js';
import { seeded } from '../../core/util.js';
import { ISLAND, TOWN_HOUSE, PLAZA, PATHS, sdIsland } from './layout.js';

const C = (h) => new THREE.Color(h);

export function buildIsland(town) {
  const sc = town.scene;
  sc.add(town.seasons.registerGround(slab(ISLAND.w, ISLAND.d, ISLAND.r, 1, '#a5df8c', 0, -1.12, 0, { bevel: 0.12, cast: false })));
  sc.add(slab(ISLAND.w + 3.4, ISLAND.d + 3.4, ISLAND.r + 1.7, 0.6, '#fff0d4', 0, -1.32, 0, { bevel: 0.2, cast: false }));
  sc.add(slab(ISLAND.w + 9, ISLAND.d + 9, ISLAND.r + 4.5, 0.3, '#b9ecf2', 0, -1.3, 0, { bevel: 0.1, cast: false, receive: false }));
  // 水面
  town.waterU = {
    time: { value: 0 }, colA: { value: C('#a6ecf2') }, colB: { value: C('#6fcdf0') }, foam: { value: C('#ffffff') },
    horizon: { value: C('#dff3ff') }, cam: { value: new THREE.Vector2() }, ctr: { value: new THREE.Vector2() }, hsz: { value: new THREE.Vector2(ISLAND.w / 2 - ISLAND.r, ISLAND.d / 2 - ISLAND.r) }, rad: { value: ISLAND.r },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.ShaderMaterial({
      uniforms: town.waterU, transparent: true,
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
  // 同一片海面随镜头平移，家园与工坊岛也有完整海面；不新增绘制或重新计算包围盒。
  water.userData.renderGlobal = true;
  town.water = water;
  sc.add(water);

  // 道路与广场
  const top = (w, d, r, color, x, z, y, th = 0.04) => slab(w, d, r, th, color, x, y - th - 0.012, z, { bevel: 0.012, cast: false });
  const rnd = seeded(4);
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * (ISLAND.w - 8), z = -17 + rnd() * 34;
    if (sdIsland(x, z) < -5) sc.add(town.seasons.registerGround(top(3 + rnd() * 4, 2.4 + rnd() * 3, 1.1, '#b3e69b', x, z, 0.012, 0.012), { patch: true }));
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
  town.boat = P.boat();
  town.boat.position.set(10.5, -0.7, 25);
  town.boat.rotation.y = 0.5;
  sc.add(town.boat);
}

export function optimizeStatic(town) {
  // town 自己持有、并在 update 里直接摆弄的对象（大喵、玩家、云、气球、标记圈……）一律不合并，否则会冻住动作、换装后留下旧模型
  const owned = new Set([town.momo?.root, town.player?.root, town.ring, town.balloon, town.sky, town.stars, town.moon, ...(town.clouds || [])].filter(Boolean));
  const roots = town.scene.children.filter((o) => {
    if (owned.has(o)) return false;
    if (!o.isGroup || !o.visible || o.userData.merged || o.userData.noMerge || o.userData.seasonalPlant || o.name || Math.abs(o.position.x) > 120) return false;
    if (o === town.townHouseHolder || o === town.roomRoot || o === town.yardFx) return false;
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
    for (const f of town.ticks) { try { f(t0 + dtm, 0.016); } catch (e) { /* 个别动画依赖别的状态，跳过 */ } }
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
  town.renderOptimizer?.invalidateBounds();
  return total;
}

export function place(town, obj, x, z, ry = 0, y = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  town.scene.add(obj);
  town.seasons.scanTrees(obj);
  if (obj.userData.tick) town.ticks.push((time,dt) => { if (Math.abs(obj.position.x-town.pos.x)<180) obj.userData.tick(time,dt); });
  return obj;
}

export function marker(town, x, y, z, color = '#ff8fb1') {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }));
  m.position.set(x, y, z);
  m.scale.set(0.8, 1.15, 0.8);
  m.userData.baseY = y;
  town.scene.add(m);
  (town.markers = town.markers || []).push(m);
  return m;
}

export function buildTown(town) {
  // 店铺
  town.cafe = town.place(P.shopCafe(), -5, -13.5);
  town.addRect(-8.5, -1.5, -16.2, -10.9);
  town.addCircle(-9.9, -10.1, 1.5);
  town.addCircle(-8.3, -10.3, 0.5);
  town.flower = town.place(P.shopFlower(), 5.5, -14);
  town.addRect(2.2, 8.8, -16.6, -11.5);
  town.addRect(5.3, 8.3, -11.4, -10.05);
  town.addCircle(2, -11.1, 0.55);
  town.addCircle(9.1, -11.1, 0.55);
  town.tailor = town.place(P.shopTailor(), 15.5, -13.5);
  town.addRect(12.2, 18.8, -16.1, -11);
  town.addCircle(19.3, -11, 0.7);
  town.boutique = town.place(P.shopBoutique(), 22, -1);
  town.addRect(18.6, 25.4, -3.6, 1.5);
  town.windmill = town.place(P.windmill(), 26, -13.5, -0.5);
  town.addCircle(26, -13.5, 2.1);
  // 居民的家：六栋小屋，门口可以拜访（看委托）
  town.homeMarks = {};
  for (const n of NPCS) {
    const hm = HOMES[n.id];
    town.place(P.cottage({ ...hm, name: n.name }), hm.x, hm.z);
    town.addRect(hm.x - 2.15, hm.x + 2.15, hm.z - 1.75, hm.z + 1.75);
    const dx = hm.x - 0.75, dz = hm.z + 2.7;
    town.homeMarks[n.id] = town.marker(dx, 3.0, hm.z + 2.0, STYLES[n.like].color);
    town.inter.push({ id: 'home_' + n.id, x: dx, z: dz, r: 1.7, label: () => `拜访${n.name}的家`, sub: n.job, act: () => bus.emit('openReq', n.id), marker: town.homeMarks[n.id] });
  }
  // 东边的预留地：一片平整的空地和一块规划牌，以后的新街区放这里
  town.scene.add(slab(12.5, 19, 2, 0.03, '#b9e9a4', 36, -0.02, 1.5, { bevel: 0.012, cast: false }));
  for (const [x, z] of [[30, -7.8], [42, -7.8], [30, 10.8], [42, 10.8]]) { town.scene.add(box(0.14, 0.9, 0.14, '#ffffff', x, 0, z, { r: 0.04 })); town.scene.add(cbox(0.24, 0.24, 0.24, '#ffb3cb', x, 1.0, z, { r: 0.08 })); }
  town.fountain = town.place(P.fountainBig(), PLAZA.x, PLAZA.z);
  town.addCircle(PLAZA.x, PLAZA.z, 2.85);

  // 互动点
  const shopDoor = (id, x, z, label, color) => {
    const mk = town.marker(x, 3.1, z + 0.9, color);
    town.inter.push({ id, x, z: z + 1.2, r: 2, label, act: () => bus.emit('openShop', id), marker: mk });
  };
  shopDoor('cafe', -6.7, -11, '进入 甜心咖啡屋', '#ff8fb1');
  shopDoor('flower', 3.7, -11.6, '进入 花语小筑', '#7fd9a0');
  shopDoor('tailor', 13.9, -11.1, '进入 星梦裁缝铺', '#b9a4f2');
  town.inter.push({ id: 'boutique', x: 22, z: 2.6, r: 2, label: '逛逛 搭配小屋', act: () => bus.emit('openBoutique'), marker: town.marker(22, 3.1, 2.2, '#ffd24f') });
  town.inter.push({ id: 'fish', x: 6, z: 24.6, r: 2.4, label: '进入 悠然钓场', act: () => bus.emit('openShop', 'fish'), marker: town.marker(6, 2.6, 25.6, '#7fc4f5') });
  town.inter.push({ id: 'fountain', x: PLAZA.x, z: PLAZA.z, r: 4, label: '许愿喷泉 · 投一枚硬币 (5)', act: () => bus.emit('wish') });

  // 广场长椅、路灯、彩旗
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = PLAZA.x + Math.cos(a) * 5.15, z = PLAZA.z + Math.sin(a) * 5.15;
    const bench = P.DECOR_BUILD.bench();
    mergeStatic(bench); // 固定场景零件共用原材质；可编辑家具仍保留各自模型。
    town.place(bench, x, z, Math.atan2(PLAZA.x - x, PLAZA.z - z));
    town.addCircle(x, z, 0.8);
  }
  const posts = [[-0.6, -2.4], [12.6, -2.4], [12.6, 10.4], [-0.6, 10.4]];
  for (const [x, z] of posts) {
    town.scene.add(box(0.16, 4, 0.16, '#ffffff', x, 0, z, { r: 0.05 }));
    town.scene.add(cbox(0.3, 0.3, 0.3, '#ffd24f', x, 4.1, z, { r: 0.1 }));
    town.addCircle(x, z, 0.25);
  }
  town.scene.add(P.bunting(-0.6, 3.9, -2.4, 12.6, 3.9, -2.4, 13));
  town.scene.add(P.bunting(12.6, 3.9, -2.4, 12.6, 3.9, 10.4, 13));
  town.scene.add(P.bunting(-0.6, 3.9, 10.4, -0.6, 3.9, -2.4, 13));
  town.scene.add(P.bunting(-1.6, 4.3, -10.9, 2.3, 4.3, -11.3, 5));
  town.scene.add(P.bunting(8.7, 4.3, -11.3, 12.3, 4.3, -10.9, 5));
  for (const [x, z, ry] of [[-12.5, 2.3, 0], [-4, 5.7, Math.PI], [3, -7.5, 0], [9, -7.5, Math.PI], [-9, -7.6, 0], [20.2, -7.6, Math.PI], [16, 5.7, Math.PI], [4.2, 13, 0], [7.8, 17.5, Math.PI], [-18.2, -6.2, Math.PI]]) {
    const lamp = P.streetLamp();
    mergeStatic(lamp); // 保留灯罩的发光材质引用与独立阴影标志。
    town.place(lamp, x, z, ry);
    town.addCircle(x, z, 0.25);
  }

  // 树木花草
  const rnd = seeded(20260);
  const trees = [];
  const tryTree = (x, z, kind, s) => {
    if (sdIsland(x, z) > -1.6 || town.onPath(x, z, 1.4) || town.blocked(x, z, 1.5) || town.inLot(x, z, 1.2)) return false;
    if (Math.abs(x - TOWN_HOUSE.x) < 5.6 && z < -4.5) return false;
    for (const hm of Object.values(HOMES)) if (Math.abs(x - hm.x) < 2.9 && z > hm.z && z < hm.z + 5) return false; // 居民家门口不种树
    if (x > 29 && x < 42.5 && z > -9 && z < 12) return false; // 东边的预留地保持空旷
    if (x > 4 && x < 8 && z > 17) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 2.6) return false;
    const m = kind === 'sakura' ? P.treeSakura(s) : kind === 'pine' ? P.treePine(s) : P.treeRound(s, pick2(rnd, ['#8fd694', '#9ddc9c', '#84cf96']), '#b1e8a8');
    town.place(m, x, z, rnd() * 6.28);
    town.addCircle(x, z, 0.5);
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
  town.trees = trees;
  for (let i = 0, n = 0; i < 420 && n < 36; i++) {
    const x = (rnd() - 0.5) * (ISLAND.w - 4), z = -19 + rnd() * 38;
    if (sdIsland(x, z) > -1.3 || town.onPath(x, z, 0.9) || town.blocked(x, z, 1) || town.inLot(x, z, 0.8)) continue;
    if (rnd() < 0.3) { town.place(P.rock(0.6 + rnd() * 0.5), x, z, rnd() * 6); town.addCircle(x, z, 0.5); }
    else { town.place(P.bush(pick2(rnd, ['#8fd694', '#a3e0a0', '#ffc2d6']), 0.7 + rnd() * 0.5), x, z, rnd() * 6); town.addCircle(x, z, 0.55); }
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
    if (sdIsland(x, z) > -0.6 || town.onPath(x, z, 0.25) || town.blocked(x, z, 0.1) || town.inLot(x, z, 0.3)) continue;
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
  town.scene.add(tufts, flowers);
  town.seasons.registerGround(tufts, { vegetation: true });
  town.seasons.registerFlowers(flowers);
}
