// 区域入口、几何边界、射线落点和建造岛楼梯通行；不拥有另一份位置或碰撞状态。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { app } from '../../core/app.js';
import { S, bus } from '../../core/state.js';
import { DECO } from '../../data.js';
import { clamp } from '../../core/util.js';
import { yardSurfaceAt, yardMoveAllowed } from '../yard-building.js';
import { BUILD_ISLAND, BUILD_LOT, BUILD_SPAWN } from '../build-constants.js';
import { ISLAND, HOME, LOT, HOUSE_POS, TOWN_HOUSE, RLOT, PLAZA, PATHS, PIER, sdRR } from './layout.js';

export function onPath(town, x, z, m = 0.3) {
  for (const [x0, x1, z0, z1] of PATHS) if (x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) return true;
  return Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + m;
}

export function inLot(town, x, z, m = 0) {
  return x > LOT.x0 - m && x < LOT.x0 + LOT.cols + m && z > LOT.z0 - m && z < LOT.z0 + LOT.rows + m;
}

export function blocked(town, x, z, m = 0.4) {
  for (const r of town.rects) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true;
  for (const c of town.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
  return false;
}

export function addRect(town, x0, x1, z0, z1, tag) {
  const r = { x0, x1, z0, z1, tag };
  town.rects.push(r);
  return r;
}

export function addCircle(town, x, z, r, tag) {
  town.circles.push({ x, z, r, tag });
}

export function setZone(town, zone, x, z) {
  if (zone === 'build' && (S.buildQuest?.stage !== 3 || S.buildQuest?.rewarded !== true)) { bus.emit('note', '先到后院码头完成「海风里的空白蓝图」'); return false; }
  const from = town.zone;
  if (zone !== from) for (const d of Object.values(town.decors)) if (d.active && d.exit() === false) return false;
  town.zone = zone;
  const isl = zone === 'build' ? BUILD_ISLAND : zone === 'home' ? HOME : ISLAND;
  if (x === undefined) {
    // 从哪扇门进来，就出现在对应的门口
    if (zone === 'town') { x = TOWN_HOUSE.x; z = TOWN_HOUSE.z + 4.4; }
    else if (zone === 'home') { x = HOUSE_POS.x; z = HOUSE_POS.z + 4.6; }
    else if (zone === 'build') { x = BUILD_SPAWN.x; z = BUILD_SPAWN.z; }
    else { x = 500; z = from === 'home' ? RLOT.z0 + 2.2 : RLOT.z0 + RLOT.rows - 1.8; }
  }
  town.pos.set(x, 0, z);
  town.momo.root.position.set(x + 1, 0, z + 0.4);
  town.moveTo = null;
  town.camSnap = true;
  town.waterU.ctr.value.set(isl.cx || 0, isl.cz || 0);
  town.waterU.hsz.value.set(isl.w / 2 - isl.r, isl.d / 2 - isl.r);
  town.waterU.rad.value = isl.r;
  bus.emit('zoneChanged', zone);
  return true;
}

export function wallPoint(town, cx,cy) {
  if(!town.partitions)return null;town.partitions.root.updateMatrixWorld(true);
  return app.ray(cx,cy,town.camera).intersectObjects(town.partitions.root.children,true)[0]?.point||null;
}

export function groundPoint(town, cx, cy, height=0) {
  const rc = app.ray(cx, cy, town.camera);
  const t = (height-rc.ray.origin.y) / rc.ray.direction.y;
  if (!(t > 0)) return null;
  return rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
}

export function walkPoint(town, cx, cy) {
  if (town.zone === 'build') {
    const targets = town.decors.build.entries.filter(rec => ['yard_slab','yard_stairs','yard_foundation','yard_roof_flat'].includes(rec.e.id) && rec.obj.visible).map(rec => rec.obj);
    for (const obj of targets) obj.updateMatrixWorld(true);
    const hit = app.ray(cx, cy, town.camera).intersectObjects(targets, true)[0];
    if (hit) return hit.point;
  }
  return town.groundPoint(cx, cy);
}

export function yardHeightAt(town, x, z, currentY = town.pos?.y || 0) {
  return town.zone === 'build' ? yardSurfaceAt(S.buildPlaced || [], DECO, x - BUILD_LOT.x0, z - BUILD_LOT.z0, currentY) : 0;
}

export function moveOnYard(town, dx, dz) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let step = 0; step < n; step++) {
    const ox = town.pos.x, oz = town.pos.z, oy = town.pos.y;
    const from = { x: ox - BUILD_LOT.x0, z: oz - BUILD_LOT.z0, y: oy };
    const allowed = p => yardMoveAllowed(S.buildPlaced || [], DECO, from, { x: p.x - BUILD_LOT.x0, z: p.z - BUILD_LOT.z0, y: p.y });
    const attempt = (sx, sz) => {
      const target = town.pos.clone().set(ox + sx, town.yardHeightAt(ox + sx, oz + sz, oy), oz + sz);
      if (!allowed(target)) return false;
      town.resolve(target, 0.36);
      target.y = town.yardHeightAt(target.x, target.z, oy);
      if (!allowed(target)) return false;
      town.pos.copy(target); return true;
    };
    if (!attempt(dx / n, dz / n)) {
      if (!attempt(dx / n, 0)) attempt(0, dz / n);
    }
  }
}

export function resolve(town, p, r) {
  for (let it = 0; it < 2; it++) {
    for (const c of town.rects) {
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
    for (const c of town.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
  }
  // 额外登记的室内（比如诺诺伊的家）：走不出房间的范围
  const room = town.rooms && town.rooms[town.zone];
  if (room) { p.x = clamp(p.x, room.x0, room.x1); p.z = clamp(p.z, room.z0, room.z1); return; }
  // 岛屿边界（码头除外）
  if (town.zone === 'house') {
    p.x = clamp(p.x, RLOT.x0 + 0.45, RLOT.x0 + RLOT.cols - 0.45);
    p.z = clamp(p.z, RLOT.z0 + 0.45, RLOT.z0 + RLOT.rows + 0.3);
    return;
  }
  const home = town.zone === 'home' || town.zone === 'build';
  const sdIsland = home ? (x, z) => sdRR(x, z, town.zone === 'build' ? BUILD_ISLAND : HOME) : (x, z) => sdRR(x, z, ISLAND);
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
