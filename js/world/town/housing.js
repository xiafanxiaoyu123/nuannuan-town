// 家园、室内和院界的构建/重建；保持房间坐标对象、门线、碰撞登记及原资源释放顺序。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE, cbox, box, slab, group, mat, rboxGeo, textPlane, disposeSceneResources } from '../../core/kit.js';
import * as P from '../../models/props.js';
import { fx } from '../../core/fx.js';
import { S, bus } from '../../core/state.js';
import { YARDS, HOUSES } from '../../data.js';
import { seeded, popIn } from '../../core/util.js';
import { housePlan } from '../house-plan.js';
import { partitionBatches } from '../partitions.js';
import { BUILD_HOME_DOCK } from '../build-constants.js';
import { HOME, LOT, HOUSE_POS, TOWN_HOUSE, RLOT, RC, DOORS, RECYCLE, sdRR } from './layout.js';

export function buildHome(town) {
  const sc = town.scene;
  // 岛体
  sc.add(town.seasons.registerGround(slab(HOME.w, HOME.d, HOME.r, 1, '#a5df8c', HOME.cx, -1.12, HOME.cz, { bevel: 0.12, cast: false })));
  sc.add(slab(HOME.w + 3.4, HOME.d + 3.4, HOME.r + 1.7, 0.6, '#fff0d4', HOME.cx, -1.32, HOME.cz, { bevel: 0.2, cast: false }));
  sc.add(slab(HOME.w + 9, HOME.d + 9, HOME.r + 4.5, 0.3, '#b9ecf2', HOME.cx, -1.3, HOME.cz, { bevel: 0.1, cast: false, receive: false }));
  sc.add(town.seasons.registerGround(slab(LOT.cols + 1, LOT.rows + 1, 1.6, 0.012, '#b3e69b', LOT.x0 + LOT.cols / 2, 0.0, LOT.z0 + LOT.rows / 2, { bevel: 0.012, cast: false }), { patch: true }));
  // 房子
  town.houseHolder = group(HOUSE_POS.x, 0, HOUSE_POS.z);
  sc.add(town.houseHolder);
  town.houseRect = town.addRect(0, 0, 0, 0, 'house');
  town.rebuildHouse();
  town.houseSign(HOUSE_POS.x + 4.6, HOUSE_POS.z + 3.2, 'houseSignYard');
  town.inter.push({ id: 'yardDoor', x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5, r: 1.9, label: '回屋里', act: () => bus.emit('travel', 'house'), marker: town.marker(HOUSE_POS.x, 3.3, HOUSE_POS.z + 3, '#ff8fb1') });
  // 回收小铺（农场旁）
  town.recycle = town.place(P.shopRecycle(), RECYCLE.x, RECYCLE.z);
  town.addRect(RECYCLE.x - 2.7, RECYCLE.x + 2.7, RECYCLE.z - 1.9, RECYCLE.z + 1.5);
  town.inter.push({ id: 'recycle', x: RECYCLE.x - 0.9, z: RECYCLE.z + 2.4, r: 2, label: '回收小铺 · 卖作物与闲置家具', act: () => bus.emit('openRecycle'), marker: town.marker(RECYCLE.x - 0.9, 3.4, RECYCLE.z + 1.8, '#6fcf9f') });
  // 小镇里的小屋（正门）
  town.townHouseHolder = group(TOWN_HOUSE.x, 0, TOWN_HOUSE.z);
  sc.add(town.townHouseHolder);
  town.townHouseRect = town.addRect(0, 0, 0, 0, 'house');
  town.rebuildHouse();
  town.houseSign(TOWN_HOUSE.x - 4.6, TOWN_HOUSE.z + 3.6, 'houseSignTown');
  town.inter.push({ id: 'home', x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3, r: 1.9, label: '回家 · 进屋', act: () => bus.emit('travel', 'house'), marker: town.marker(TOWN_HOUSE.x, 3.3, TOWN_HOUSE.z + 2.9, '#ff8fb1') });
  town.buildRoom();
  // 院子外圈的树
  const rnd = seeded(515);
  for (let i = 0, n = 0; i < 500 && n < 34; i++) {
    const x = HOME.cx - HOME.w / 2 + rnd() * HOME.w, z = HOME.cz - HOME.d / 2 + rnd() * HOME.d;
    if (sdRR(x, z, HOME) > -1.5 || town.inLot(x, z, 1.4) || town.blocked(x, z, 2.2)) continue;
    if (x < LOT.x0 + 1 && Math.abs(z - BUILD_HOME_DOCK.z) < 4.5) continue;
    if (z > HOME.cz + 8 && rnd() < 0.7) continue;
    const k = rnd();
    const m = k < 0.3 ? P.treeSakura(0.9 + rnd() * 0.3) : k < 0.55 ? P.treePine(0.9 + rnd() * 0.4) : P.treeRound(0.9 + rnd() * 0.4);
    town.place(m, x, z, rnd() * 6);
    town.addCircle(x, z, 0.5);
    n++;
  }
}

export function rebuildHouse(town) {
  for (const [hh, pos, rect] of [[town.houseHolder, HOUSE_POS, town.houseRect], [town.townHouseHolder, TOWN_HOUSE, town.townHouseRect]]) {
    if (!hh) continue;
    town.seasons.clearSubtree(hh);
    while (hh.children.length) { const old=hh.children[0];hh.remove(old);disposeSceneResources(old); }
    const m = P.house(S.house);
    // 加入已更新世界矩阵的容器之前测局部边界，父坐标只在下面加一次。
    const b = new THREE.Box3().setFromObject(m);
    hh.add(m);
    Object.assign(rect, { x0: pos.x + Math.max(b.min.x, -3.9) + 0.25, x1: pos.x + Math.min(b.max.x, 4.1) - 0.25, z0: pos.z + b.min.z, z1: pos.z + 2.25 });
    town.seasons.scanTrees(hh);
  }
  if (town.roomRoot && town.roomLevel !== S.house) {
    town.updateRoomPlan(); town.buildRoom();
    town.decors?.house.resizeRoom(town.roomBlocked());
    town.partitions?.rebuild();
    if (town.zone === 'house') { town.resolve(town.pos, .36); town.camSnap = true; }
    bus.emit('houseResized', town.roomPlan);
  }
}

export function updateRoomPlan(town) {
  const p = town.roomPlan = housePlan(S.house);
  Object.assign(RLOT, {x0:p.x0,z0:p.z0,cols:p.cols,rows:p.rows});
  RC.x=p.centerX; RC.z=p.centerZ;
  // 原有门线保持在 x=500，向东和向南加建，旧家具和地板不用搬动。
  DOORS.house.home.x=DOORS.house.town.x=500;
  DOORS.house.home.z=p.z0+.9; DOORS.house.town.z=p.z0+p.rows-.4;
}

export function roomBlocked(town) {
  return [[0,1,1,3],[RLOT.cols-2,RLOT.cols-1,1,3],[10,11,0,0],[10,11,RLOT.rows-1,RLOT.rows-1]];
}

export function buildRoom(town) {
  if (town.roomRoot) {
    town.scene.remove(town.roomRoot); disposeSceneResources(town.roomRoot);
    town.rects=town.rects.filter(r=>!town.roomRects.includes(r));
    town.inter=town.inter.filter(i=>!['backDoor','frontDoor','closet','blueprint'].includes(i.id));
    for(const m of town.roomMarkers){town.scene.remove(m);disposeSceneResources(m);}
    town.markers=town.markers.filter(m=>!town.roomMarkers.includes(m));
  }
  const oldRects=new Set(town.rects),oldMarkers=new Set(town.markers||[]);
  const sc = town.roomRoot = group(), W = RLOT.cols, D = RLOT.rows, x0 = RLOT.x0, z0 = RLOT.z0;
  sc.name='player-house-interior'; town.scene.add(sc);town.roomLevel=S.house;
  sc.add(slab(70, 50, 3, 0.3, '#d9c3ad', RC.x, -0.52, RC.z, { bevel: 0.1, cast: false }));
  sc.add(box(W + 0.6, 0.3, D + 2.2, '#e6c79c', RC.x, -0.3, RC.z + 0.8, { r: 0.06, cast: false }));
  for (let i = 0; i < W; i += 2) sc.add(box(0.06, 0.01, D, '#cfa97a', x0 + i, 0.0, RC.z, { cast: false }));
  // 三面墙 + 墙裙
  town.roomWallShell=group();town.roomWallShell.name='house-wall-shell';
  for(const mesh of partitionBatches([],town.roomPlan,{shell:true}))town.roomWallShell.add(mesh);
  sc.add(town.roomWallShell);
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
  town.inter.push({ id: 'backDoor', x: 500, z: z0 + 0.9, r: 1.7, label: '去后院 · 菜地与回收小铺', act: () => bus.emit('travel', 'home'), marker: town.marker(500, 4.3, z0 + 0.5, '#6fcf9f') });
  town.inter.push({ id: 'frontDoor', x: 500, z: z0 + D - 0.3, r: 1.5, label: '出门 · 去花愿小镇', act: () => bus.emit('travel', 'town'), marker: town.marker(500, 2.2, z0 + D + 0.4, '#7fc4f5') });
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
  town.addRect(x0, x0 + 1.75, z0 + 1.1, z0 + 3.9);
  town.inter.push({ id: 'closet', x: x0 + 2.4, z: z0 + 2.5, r: 1.7, label: '衣橱 · 换装', act: () => bus.emit('openCloset'), marker: town.marker(x0 + 1.2, 4.1, z0 + 2.5, '#ff8fb1') });
  const bd = group(x0 + W - 0.9, 0, z0 + 2.5);
  bd.add(box(0.2, 2.2, 2.4, '#d2a67e', 0.2, 0.9, 0, { r: 0.05 }));
  bd.add(box(0.1, 1.8, 2.0, '#fffaf3', 0.08, 1.1, 0, { r: 0.03, cast: false }));
  bd.add(cbox(0.06, 0.6, 0.8, '#ff9fbd', 0.02, 2.2, 0, { r: 0.02, cast: false }));
  bd.add(cbox(0.06, 0.5, 0.5, '#fff3c4', 0.02, 1.7, 0, { r: 0.02, cast: false }));
  bd.add(box(0.5, 0.9, 1.6, '#fff6ea', -0.1, 0, 0, { r: 0.08 }));
  bd.rotation.y = 0;
  sc.add(bd);
  town.addRect(x0 + W - 1.5, x0 + W, z0 + 1.2, z0 + 3.8);
  town.inter.push({ id: 'blueprint', x: x0 + W - 2.3, z: z0 + 2.5, r: 1.7, label: '房屋蓝图 · 升级与装修', act: () => bus.emit('openHome') });
  // 室内常亮的暖光
  for (const lx of [RC.x - 5, RC.x + 5]) {
    const l = new THREE.PointLight(0xffe6cc, 5, 26, 1.3);
    l.position.set(lx, 4.6, RC.z + 1);
    sc.add(l);
    sc.add(cbox(0.04, 1.2, 0.04, '#d9cfc5', lx, 5.6, RC.z + 1, { cast: false }));
    sc.add(cbox(0.9, 0.5, 0.9, mat('#fff3c4', { emissive: '#ffd27a', ei: 1.3 }), lx, 4.8, RC.z + 1, { r: 0.22, cast: false }));
  }
  town.roomRects=town.rects.filter(r=>!oldRects.has(r));
  town.roomMarkers=(town.markers||[]).filter(m=>!oldMarkers.has(m));
}

export function houseSign(town, x, z, id) {
  const sign = group(x, 0, z);
  sign.add(box(0.16, 1.5, 0.16, '#c9a27a', 0, 0, 0, { r: 0.05 }), box(1.9, 0.9, 0.14, '#fff4e0', 0, 1.1, 0, { r: 0.1 }), box(2.02, 0.12, 0.2, '#ffc94d', 0, 2.0, 0, { r: 0.05 }));
  const txt = textPlane('升级', { size: 96, color: '#b3741a', height: 0.56 });
  txt.position.set(0, 1.55, 0.09);
  sign.add(txt);
  town.scene.add(sign);
  town.addRect(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 'sign');
  const mk = town.marker(x, 3.1, z, '#ffc94d');
  town.inter.push({ id, x, z: z + 1, r: 1.7, marker: mk, act: () => bus.emit('openHome'),
    label: () => { const n = HOUSES[S.house]; return n ? `升级房子 ·「${n.name}」${n.price.toLocaleString()} 噗灵` : '看看我的家（已是最高级）'; } });
}

export function rebuildYard(town, animate) {
  if (town.yardFx) {
    town.seasons.clearSubtree(town.yardFx);
    town.scene.remove(town.yardFx);
    disposeSceneResources(town.yardFx);
    for (const r of town.yardRects) town.rects.splice(town.rects.indexOf(r), 1);
    town.inter = town.inter.filter((i) => i.id !== 'yardSign');
    if (town.yardMarker) { town.scene.remove(town.yardMarker); disposeSceneResources(town.yardMarker); town.markers.splice(town.markers.indexOf(town.yardMarker), 1); town.yardMarker = null; }
  }
  const g = (town.yardFx = group());
  town.yardRects = [];
  town.scene.add(g);
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
    town.yardRects.push(r.ax === 'z' ? town.addRect(r.at - 0.25, r.at + 0.25, r.a - 3, r.b + 0.25, 'yard') : town.addRect(r.a - 3, r.b + 0.25, r.at - 0.25, r.at + 0.25, 'yard'));
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
  // 荒地：保持固定实例预算，并把草均匀分布到扩大的整片待开放区域。
  const rnd = seeded(4242), fl = S.floor || {};
  const tuft = new THREE.InstancedMesh(rboxGeo(0.13, 0.42, 0.13, 0.04), mat('#8fd480'), 1400);
  const bloom = new THREE.InstancedMesh(rboxGeo(0.2, 0.2, 0.2, 0.06), mat('#ffffff'), 220);
  const col = new THREE.Color(), bc = ['#fff3a8', '#ffffff', '#ffc2d6', '#d9c8ff'];
  let ti = 0, bi = 0;
  const grassDensity = Math.min(1, 1400 / Math.max(1, (LOT.cols * LOT.rows - (Y.x1 + 1) * (Y.z1 + 1)) * 2.1));
  for (let x = 0; x < LOT.cols; x++) for (let z = 0; z < LOT.rows; z++) {
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    if ((x <= Y.x1 && z <= Y.z1) || fl[x + ',' + z]) continue;
    const wx = LOT.x0 + x + 0.5, wz = LOT.z0 + z + 0.5;
    if (Math.abs(wx - xb) < 0.9 || Math.abs(wz - zb) < 0.9) continue;
    const k = 1 + Math.floor(r1 * 3);
    for (let j = 0; j < k && ti < 1400 && r4 < grassDensity; j++) {
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
  town.seasons.registerGround(tuft, { vegetation: true });
  town.seasons.registerFlowers(bloom);
  town.seasons.scanTrees(g);
  // 告示牌：站在栅栏内侧，靠近小路
  const sx = south ? LOT.x0 + 21.6 : xb - 1.3, sz = south ? zb - 1.3 : LOT.z0 + 10.5;
  const sign = group(sx, 0, sz);
  sign.add(box(0.16, 1.5, 0.16, '#c9a27a', 0, 0, 0, { r: 0.05 }), box(1.9, 0.9, 0.14, '#fff4e0', 0, 1.1, 0, { r: 0.1 }), box(2.02, 0.12, 0.2, '#ffb3cb', 0, 2.0, 0, { r: 0.05 }));
  const txt = textPlane('扩建', { size: 96, color: '#cf4f7e', height: 0.56 });
  txt.position.set(0, 1.55, 0.09);
  sign.add(txt);
  if (!south) sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  town.yardRects.push(town.addRect(sx - 0.3, sx + 0.3, sz - 0.3, sz + 0.3, 'yard'));
  town.yardMarker = town.marker(sx, 3.1, sz, '#ffc94d');
  town.inter.push({ id: 'yardSign', x: south ? sx : sx - 1, z: south ? sz - 1 : sz, r: 2, label: next ? `扩建院子 · 下一级「${next.name}」` : '院子', act: () => bus.emit('openYard') });
  // 扩建动画会先把整组栅栏缩到很小；场景裁剪器如果在这一帧缓存了这个
  // 临时包围盒，动画结束后就会继续把已经恢复到正常尺寸的栅栏裁掉。
  // 动画期间把院界视为全局根节点，结束后清除标记并刷新包围盒缓存。
  if (animate) {
    g.userData.renderGlobal = true;
    const appear = popIn(g, 0.6);
    appear.promise.then(() => {
      if (g.userData.renderGlobal) delete g.userData.renderGlobal;
      town.renderOptimizer?.invalidateBounds();
    });
    fx.confetti(town.scene, new THREE.Vector3(sx, 3, sz), 60);
  }
  town.renderOptimizer?.invalidateBounds();
}
