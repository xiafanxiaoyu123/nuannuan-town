// 室内家具临墙的展示适配。只改变水平展示尺寸，不改存档格子、价格或通行规则。
// bounds 始终来自原始模型；不要拿已经适配过的包围盒反复计算。
import { wallJunctions } from './partition-geometry.js';

const WALL_HALF = 0.3, GAP = 0.01, EPS = 1e-7;
const intersects = (a, b) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function rotatedBounds(b, rot) {
  if (rot === 1) return { x0: b.z0, x1: b.z1, z0: -b.x1, z1: -b.x0 };
  if (rot === 2) return { x0: -b.x1, x1: -b.x0, z0: -b.z1, z1: -b.z0 };
  if (rot === 3) return { x0: -b.z1, x1: -b.z0, z0: b.x0, z1: b.x1 };
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
}

function wallObstacles(walls, plan) {
  const out = [], ox = plan.x0, oz = plan.z0;
  for (const w of walls) {
    const x = ox + w.gx, z = oz + w.gz;
    // 门中间保留洞口。门洞前后的操作/通行净空仍由 fitsFurniture 检查。
    const parts = w.kind === 'door' ? [[0, .22], [1.78, 2]] : [[0, 1]];
    for (const [a, b] of parts) out.push(w.axis === 'x'
      ? { x0: x + a, x1: x + b, z0: z - WALL_HALF, z1: z + WALL_HALF }
      : { x0: x - WALL_HALF, x1: x + WALL_HALF, z0: z + a, z1: z + b });
  }
  // 两段墙的端头交汇处有实心补角，不能只判断一段墙的长度范围。
  for (const p of wallJunctions(walls)) out.push({ x0: ox + p.x - WALL_HALF, x1: ox + p.x + WALL_HALF, z0: oz + p.z - WALL_HALF, z1: oz + p.z + WALL_HALF });
  // 外墙的室内面位于格线，和以格线为中心的自建墙不同；房屋正面开口不加假墙。
  out.push(
    { x0: ox - .6, x1: ox, z0: oz - .3, z1: oz + plan.rows + .3 },
    { x0: ox + plan.cols, x1: ox + plan.cols + .6, z0: oz - .3, z1: oz + plan.rows + .3 },
    { x0: ox - .6, x1: ox + plan.cols + .6, z0: oz - .6, z1: oz }
  );
  return out;
}

/**
 * scaleX/Z 是模型本地轴的相对缩放，offsetX/Z 是相对格中心的世界轴平移。
 * rect 为最终世界包围盒。只在原展示盒与墙相交时适配，离墙不改变巨大作物等外观。
 * 此函数不负责放置合法性；骑墙、堵门等情况继续使用现有 fitsFurniture 校验。
 */
export function furnitureFit(e, definition, bounds, walls = [], plan) {
  const rot = ((Number(e.rot) || 0) % 4 + 4) % 4;
  const [a, b] = definition.size, [w, d] = rot % 2 ? [b, a] : [a, b];
  const footprint = { x0: plan.x0 + e.gx, x1: plan.x0 + e.gx + w, z0: plan.z0 + e.gz, z1: plan.z0 + e.gz + d };
  const cx = (footprint.x0 + footprint.x1) / 2, cz = (footprint.z0 + footprint.z1) / 2;
  const rb = rotatedBounds(bounds, rot);
  const original = { x0: cx + rb.x0, x1: cx + rb.x1, z0: cz + rb.z0, z1: cz + rb.z1 };
  const obstacles = wallObstacles(walls, plan);
  const unchanged = { scaleX: 1, scaleZ: 1, offsetX: 0, offsetZ: 0, rect: original, adapted: false, narrow: false };
  if (!obstacles.some(obstacle => intersects(original, obstacle))) return unchanged;

  // 适配后的家具保持在自己的格子内，不把避墙偏移传给相邻格子的家具。
  const available = { x0: footprint.x0 + GAP, x1: footprint.x1 - GAP, z0: footprint.z0 + GAP, z1: footprint.z1 - GAP };
  let invalidCore = false;
  for (const obstacle of obstacles) {
    if (!intersects(footprint, obstacle)) continue;
    const cuts = [];
    if (obstacle.x0 <= footprint.x0 + EPS && obstacle.x1 < footprint.x1 - EPS) cuts.push({ key: 'x0', value: obstacle.x1 + GAP, depth: obstacle.x1 - footprint.x0 });
    if (obstacle.x1 >= footprint.x1 - EPS && obstacle.x0 > footprint.x0 + EPS) cuts.push({ key: 'x1', value: obstacle.x0 - GAP, depth: footprint.x1 - obstacle.x0 });
    if (obstacle.z0 <= footprint.z0 + EPS && obstacle.z1 < footprint.z1 - EPS) cuts.push({ key: 'z0', value: obstacle.z1 + GAP, depth: obstacle.z1 - footprint.z0 });
    if (obstacle.z1 >= footprint.z1 - EPS && obstacle.z0 > footprint.z0 + EPS) cuts.push({ key: 'z1', value: obstacle.z0 - GAP, depth: footprint.z1 - obstacle.z0 });
    // 墙段端头/凸角可能只吃进格角；选择切掉最少空间的一侧已足够躲开该实体。
    cuts.sort((left, right) => left.depth - right.depth);
    const cut = cuts[0];
    if (!cut) { invalidCore = true; continue; }
    available[cut.key] = cut.key.endsWith('0') ? Math.max(available[cut.key], cut.value) : Math.min(available[cut.key], cut.value);
  }
  // 非法穿墙芯交由原规则拒绝，不把红色预览硬压成倒置或零尺寸模型。
  if (invalidCore || available.x1 <= available.x0 + EPS || available.z1 <= available.z0 + EPS) return { ...unchanged, narrow: true };

  const worldScaleX = Math.min(1, (available.x1 - available.x0) / Math.max(EPS, rb.x1 - rb.x0));
  const worldScaleZ = Math.min(1, (available.z1 - available.z0) / Math.max(EPS, rb.z1 - rb.z0));
  // 先保留原尺寸与中心；只有对应方向放不下时才缩小，移到最近的合法中心。
  const px = clamp(cx, available.x0 - rb.x0 * worldScaleX, available.x1 - rb.x1 * worldScaleX);
  const pz = clamp(cz, available.z0 - rb.z0 * worldScaleZ, available.z1 - rb.z1 * worldScaleZ);
  return {
    scaleX: rot % 2 ? worldScaleZ : worldScaleX,
    scaleZ: rot % 2 ? worldScaleX : worldScaleZ,
    offsetX: px - cx, offsetZ: pz - cz,
    rect: { x0: px + rb.x0 * worldScaleX, x1: px + rb.x1 * worldScaleX, z0: pz + rb.z0 * worldScaleZ, z1: pz + rb.z1 * worldScaleZ },
    adapted: true,
    narrow: Math.min(worldScaleX, worldScaleZ) < .65,
  };
}
