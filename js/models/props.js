// 场景道具：树木、建筑、家具（家园装饰）
import { THREE, cbox, box, cyl, frustum, gable, sph, torus, group, mat, glow, textPlane } from '../core/kit.js';
import { Momo } from './character.js';
import { cropModel } from './items.js';
import { HOUSE_FURNITURE_BUILD } from './house-furniture.js';
import { buildYardBuilding } from './yard-building.js';

const PHOTO_THEMES = [
  { id: 'sunset', sky: '#bfe6ff', hill: '#98de9b', sun: '#ffe066' },
  { id: 'sakura', sky: '#ffd6e5', hill: '#8fd9a8', sun: '#fff3b0' },
  { id: 'starry', sky: '#3b4371', hill: '#5c7a99', sun: '#f6d365' },
  { id: 'meadow', sky: '#ffe5b4', hill: '#e8a87c', sun: '#ff7f50' },
];
const photoThemeIndex = (v) => v === undefined ? 0 : (Number.isSafeInteger(v) && v >= 0 && v <= 20) ? v % PHOTO_THEMES.length : PHOTO_THEMES.findIndex(t => t.id === v);

const TRUNK = '#b98b6b', WOOD = '#d2a67e', WOOD_D = '#b3855f', STONE = '#f1e9df', STONE_D = '#ddd2c5', WHITE = '#ffffff';
const LEAF = '#8fd694', LEAF_L = '#a9e3a0', LEAF_D = '#72c58a';
const WATER = mat('#9be0f0', { rough: 0.15, opacity: 0.85 });
const ns = { cast: false, receive: false };
const WIN = () => glow('#fff6d6', '#ffcf7a', 0.12, 2.2);
const LAMP = () => glow('#fff3c4', '#ffc864', 0.1, 3);

// 只提供显式的户外季节标记；材质由 SeasonSystem 独立持有，不能改 kit 的共用材质。
function seasonalPlant(g, kind, from) {
  g.userData.seasonalPlant = kind;
  g.children.slice(from).forEach((mesh, tone) => {
    mesh.userData.seasonalLeaf = { kind, tone: tone % 3, pine: kind === 'pine' };
  });
  return g;
}

// ————————————————— 植物 —————————————————
export function treeRound(s = 1, leaf = LEAF, leaf2 = LEAF_L) {
  const g = group();
  g.add(box(0.36, 1.2, 0.36, TRUNK, 0, 0, 0, { r: 0.1 }));
  g.add(cbox(1.7, 1.5, 1.7, leaf, 0, 1.8, 0, { r: 0.5 }));
  g.add(cbox(1.1, 0.95, 1.1, leaf2, 0.22, 2.65, 0.12, { r: 0.36 }));
  g.add(cbox(0.7, 0.6, 0.7, leaf2, -0.7, 1.5, 0.45, { r: 0.24 }));
  g.scale.setScalar(s);
  return seasonalPlant(g, 'round', 1);
}
export function treeSakura(s = 1) {
  const g = group();
  g.add(box(0.4, 1.4, 0.4, '#a9806a', 0, 0, 0, { r: 0.1 }));
  g.add(cbox(0.2, 0.8, 0.2, '#a9806a', 0.36, 1.35, 0, { r: 0.06, rz: -0.8 }));
  g.add(cbox(1.8, 1.3, 1.8, '#ffc2d6', 0, 2.1, 0, { r: 0.5 }));
  g.add(cbox(1.3, 1.05, 1.3, '#ffd6e3', -0.75, 2.7, 0.25, { r: 0.4 }));
  g.add(cbox(1.2, 0.95, 1.2, '#ffb3cb', 0.8, 2.55, -0.2, { r: 0.38 }));
  g.add(cbox(0.9, 0.75, 0.9, '#ffe3ec', 0.1, 3.25, 0.1, { r: 0.3 }));
  g.add(cbox(0.6, 0.5, 0.6, '#ffd6e3', 0.85, 1.7, 0.6, { r: 0.2 }));
  g.scale.setScalar(s);
  return seasonalPlant(g, 'sakura', 2);
}
export function treePine(s = 1) {
  const g = group();
  g.add(box(0.3, 0.7, 0.3, TRUNK, 0, 0, 0, { r: 0.08 }));
  g.add(frustum(0.5, 1.7, 1.1, '#7ccfa0', 0, 0.6, 0));
  g.add(frustum(0.35, 1.35, 1.0, '#8bd8aa', 0, 1.4, 0));
  g.add(frustum(0.04, 1.0, 1.0, '#9be0b6', 0, 2.15, 0));
  g.scale.setScalar(s);
  return seasonalPlant(g, 'pine', 1);
}
export function bush(color = LEAF, s = 1) {
  const g = group();
  g.add(cbox(1, 0.7, 1, color, 0, 0.33, 0, { r: 0.28 }));
  g.add(cbox(0.6, 0.5, 0.6, LEAF_L, 0.45, 0.25, 0.3, { r: 0.2 }));
  g.scale.setScalar(s);
  return seasonalPlant(g, 'bush', 0);
}
export function rock(s = 1) {
  const g = group();
  g.add(cbox(0.9, 0.6, 0.8, '#d9d3dc', 0, 0.25, 0, { r: 0.22, ry: 0.4 }));
  g.add(cbox(0.5, 0.36, 0.5, '#e6e1e8', 0.5, 0.15, 0.25, { r: 0.14 }));
  g.scale.setScalar(s);
  return g;
}
export function cloud(s = 1) {
  const m = mat('#ffffff', { rough: 1, emissive: '#ffffff', ei: 0.25 });
  const g = group();
  g.add(cbox(3.2, 1.2, 1.8, m, 0, 0, 0, { r: 0.55, ...ns }));
  g.add(cbox(1.8, 1.3, 1.6, m, -0.5, 0.75, 0, { r: 0.55, ...ns }));
  g.add(cbox(1.4, 0.9, 1.4, m, 1.0, 0.5, 0.1, { r: 0.42, ...ns }));
  g.scale.setScalar(s);
  return g;
}

// ————————————————— 通用建筑零件 —————————————————
function windowBox(w, hgt, frame = WHITE) {
  const g = group();
  g.add(cbox(w + 0.2, hgt + 0.2, 0.1, frame, 0, 0, 0, { r: 0.05 }));
  g.add(cbox(w, hgt, 0.12, WIN(), 0, 0, 0.01, { r: 0.04, ...ns }));
  g.add(cbox(0.06, hgt, 0.14, frame, 0, 0, 0.01, ns));
  g.add(cbox(w, 0.06, 0.14, frame, 0, 0, 0.01, ns));
  return g;
}
function flowerBox(w, cols = ['#ff8fb1', '#ffe27a', '#ffffff']) {
  const g = group();
  g.add(cbox(w, 0.2, 0.26, WOOD, 0, 0, 0, { r: 0.05 }));
  const n = Math.round(w / 0.24);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    g.add(cbox(0.2, 0.16, 0.2, LEAF, x, 0.14, 0, { r: 0.06 }));
    g.add(cbox(0.13, 0.12, 0.13, cols[i % cols.length], x, 0.26, 0.02, { r: 0.045 }));
  }
  return g;
}
function door(w = 1, hgt = 1.7, color = '#c98e6b', frame = WHITE) {
  const g = group();
  g.add(box(w + 0.24, hgt + 0.14, 0.12, frame, 0, 0, 0, { r: 0.06 }));
  g.add(box(w, hgt, 0.16, color, 0, 0, 0.01, { r: 0.07 }));
  g.add(cbox(w * 0.5, hgt * 0.26, 0.18, WIN(), 0, hgt * 0.72, 0.01, { r: 0.05, ...ns }));
  g.add(cbox(0.09, 0.09, 0.09, '#ffd76a', w * 0.32, hgt * 0.45, 0.1, { r: 0.04 }));
  return g;
}
function roofSlabs(g, w, hgt, d, y, color, wall, wallW) {
  const a = Math.atan2(hgt, w / 2), L = Math.hypot(w / 2, hgt) + 0.35;
  if (wall) g.add(gable(wallW, (hgt * wallW) / w - 0.02, d - 0.9, wall, 0, y - 0.02, 0));
  g.add(cbox(L, 0.26, d, color, -w / 4 - 0.1, y + hgt / 2 - 0.08, 0, { r: 0.09, rz: a }));
  g.add(cbox(L, 0.26, d, color, w / 4 + 0.1, y + hgt / 2 - 0.08, 0, { r: 0.09, rz: -a }));
  g.add(cbox(0.36, 0.3, d + 0.06, color, 0, y + hgt + 0.02, 0, { r: 0.1 }));
  // 积雪是屋顶上方的独立薄层，保留墙壁、招牌和屋檐的原色。
  g.children.slice(-3).forEach((mesh) => { mesh.userData.seasonalRoof = true; });
}
function awning(w, depth, c1, c2, n = 7) {
  const g = group();
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? c2 : c1;
    const x = -w / 2 + sw * (i + 0.5);
    g.add(cbox(sw + 0.005, 0.09, depth, col, x, 0, depth / 2 - 0.05, { r: 0.03, rx: 0.42 }));
    g.add(cbox(sw - 0.02, 0.24, 0.07, col, x, -depth * 0.2 - 0.12, depth * 0.91 - 0.05, { r: 0.03 }));
  }
  return g;
}
function signBoard(text, bg, color = '#ffffff', hgt = 0.62) {
  const g = group();
  const t = textPlane(text, { color, height: hgt * 0.74, size: 72 });
  const w = t.userData.width + 0.7;
  g.add(cbox(w, hgt + 0.26, 0.16, bg, 0, 0, 0, { r: 0.08 }));
  g.add(cbox(w + 0.14, hgt + 0.4, 0.1, WHITE, 0, 0, -0.03, { r: 0.1 }));
  t.position.z = 0.09;
  g.add(t);
  g.userData.width = w;
  return g;
}
export function streetLamp() {
  const g = group();
  g.add(box(0.34, 0.16, 0.34, '#7d6b8c', 0, 0, 0, { r: 0.05 }));
  g.add(box(0.11, 2.3, 0.11, '#7d6b8c', 0, 0.1, 0, { r: 0.04 }));
  g.add(cbox(0.5, 0.09, 0.09, '#7d6b8c', 0.2, 2.34, 0, { r: 0.03 }));
  g.add(cbox(0.3, 0.07, 0.3, '#7d6b8c', 0.42, 2.26, 0, { r: 0.03 }));
  g.add(cbox(0.24, 0.3, 0.24, LAMP(), 0.42, 2.08, 0, { r: 0.08, ...ns }));
  return g;
}

export function signPlan() {
  const g = group();
  for (const sx of [-1, 1]) g.add(box(0.14, 1.9, 0.14, WOOD_D, sx * 0.9, 0, 0, { r: 0.04 }));
  g.add(cbox(2.4, 1.2, 0.14, '#fffaf2', 0, 1.6, 0, { r: 0.1 }));
  g.add(cbox(2.52, 1.32, 0.08, '#ffb3cb', 0, 1.6, -0.04, { r: 0.12 }));
  const t1 = textPlane('新街区', { size: 80, color: '#cf4f7e', height: 0.42 });
  t1.position.set(0, 1.82, 0.09);
  const t2 = textPlane('规划中', { size: 64, color: '#9a8290', height: 0.28 });
  t2.position.set(0, 1.32, 0.09);
  g.add(t1, t2);
  return g;
}

// ————————————————— 居民的小屋 —————————————————
// 六位居民六种房型：面包房 / 花房 / 两层小楼 / 渔夫木屋 / 糖果屋 / 诗人的圆塔。
// 占地都在 4.4 × 3.6 以内，门统一在 (-0.75, 1.55)，方便小镇统一处理门口的互动。
export function cottage(o = {}) {
  const g = group();
  const wall = o.wall || '#fff4e4', roof = o.roof || '#ff9fbd', dc = o.door || '#e08fa8';
  const kind = o.kind || 'plain';
  const DX = -0.75;
  const addDoor = (z = 1.55, y = 0.24, hgt = 1.55) => { const d = door(0.9, hgt, dc); d.position.set(DX, y, z); g.add(d); g.add(box(1.3, 0.14, 0.6, STONE, DX, 0.08, z + 0.4, { r: 0.05 })); };
  const win = (x, y, z, w = 0.9, hgt = 0.8) => { const m = windowBox(w, hgt); m.position.set(x, y, z); g.add(m); return m; };
  const plate = (y = 2.12, z = 1.6) => {
    if (!o.name) return;
    g.add(cbox(1.5, 0.46, 0.08, '#fffaf2', DX, y, z, { r: 0.1 }));
    g.add(cbox(1.58, 0.54, 0.05, dc, DX, y, z - 0.03, { r: 0.12 }));
    const t = textPlane(o.name, { size: 72, color: '#5b4252', height: 0.3 });
    t.position.set(DX, y, z + 0.06);
    g.add(t);
  };
  g.add(box(4.3, 0.26, 3.5, STONE_D, 0, 0, 0, { r: 0.1 }));

  if (kind === 'bakery') {
    // 面包房：矮胖的奶油色小屋，条纹遮阳棚，冒烟的大烟囱，窗下一筐刚出炉的面包
    g.add(box(4.0, 2.0, 3.1, wall, 0, 0.22, 0, { r: 0.14 }));
    roofSlabs(g, 4.8, 1.5, 3.9, 2.18, roof, wall, 4.0);
    g.add(box(0.8, 1.9, 0.8, '#e9cdb4', 1.25, 2.6, -0.5, { r: 0.1 }));
    g.add(box(0.96, 0.2, 0.96, '#c98e6b', 1.25, 4.5, -0.5, { r: 0.07 }));
    const puffs = [0, 1, 2].map((i) => { const p = sph(0.2, '#ffffff', 1.25, 4.9, -0.5, { cast: false }); p.material = mat('#ffffff', { transparent: true, opacity: 0.85 }); g.add(p); return p; });
    g.userData.tick = (time) => puffs.forEach((p, i) => { const u = (time * 0.35 + i / 3) % 1; p.position.set(1.25 + Math.sin(time + i * 2) * 0.12 + u * 0.25, 4.8 + u * 1.4, -0.5); p.scale.setScalar(0.6 + u * 0.9); p.material.opacity = 0.85 * (1 - u); });
    addDoor();
    win(0.95, 1.3, 1.55, 1.2, 0.8);
    const aw = awning(1.7, 0.8, roof, '#ffffff', 5);
    aw.position.set(0.95, 2.0, 1.56);
    g.add(aw);
    g.add(box(1.5, 0.12, 0.5, WOOD, 0.95, 0.72, 1.8, { r: 0.04 }));
    for (const [x, c, rz] of [[0.5, '#e8b866', 0.3], [0.8, '#f2c879', -0.2], [1.1, '#dba556', 0.25], [1.4, '#f2c879', -0.3]]) g.add(cbox(0.2, 0.42, 0.2, c, x, 1.02, 1.8, { r: 0.09, rz }));
    g.add(cbox(0.6, 0.6, 0.1, '#e8b866', DX, 2.75, 1.58, { r: 0.28 }));
    plate(2.08);
  } else if (kind === 'greenhouse') {
    // 花房：小屋旁边接一间玻璃暖房，屋顶长着草，门上爬着藤，满地花盆
    g.add(box(2.5, 2.2, 3.1, wall, -0.85, 0.22, 0, { r: 0.13 }));
    roofSlabs(g, 3.1, 1.5, 3.8, 2.38, roof, wall, 2.5);
    g.children.slice(-4).forEach((m) => (m.position.x -= 0.85));
    for (const [x, z] of [[-1.5, 0.6], [-0.9, -0.5], [-0.3, 0.9], [-1.2, -1.0]]) g.add(cbox(0.3, 0.3, 0.3, '#ffe27a', x, 3.35 - Math.abs(x + 0.85) * 0.9, z, { r: 0.1 }));
    const glassM = mat('#d8f3ee', { transparent: true, opacity: 0.55, rough: 0.2 });
    g.add(box(1.7, 1.9, 2.7, glassM, 1.25, 0.22, 0.1, { r: 0.06, cast: false }));
    g.add(cbox(1.84, 0.1, 2.84, '#ffffff', 1.25, 2.14, 0.1, { r: 0.04 }));
    for (const x of [0.42, 1.25, 2.08]) g.add(box(0.08, 1.9, 0.08, '#ffffff', x, 0.22, 1.45));
    for (const z of [-1.2, 1.45]) g.add(cbox(1.74, 0.08, 0.08, '#ffffff', 1.25, 1.2, z));
    for (const [x, z, c, hh] of [[0.9, 0.7, '#ff8fb1', 0.7], [1.6, 0.5, '#c9b6f2', 0.9], [1.2, -0.3, '#ffe27a', 0.6], [1.7, -0.7, '#ff9f7a', 0.8]]) {
      g.add(box(0.3, 0.26, 0.3, '#f4b99a', x, 0.24, z, { r: 0.07 }));
      g.add(cbox(0.36, hh, 0.36, '#7fcf8f', x, 0.5 + hh / 2, z, { r: 0.13 }));
      g.add(cbox(0.2, 0.2, 0.2, c, x, 0.6 + hh, z, { r: 0.08 }));
    }
    addDoor();
    for (let i = 0; i < 6; i++) { const t = i / 5; g.add(cbox(0.24, 0.22, 0.2, i % 2 ? '#7fcf8f' : '#9fdc9c', DX - 0.62 + t * 1.24, 1.95 + Math.sin(t * Math.PI) * 0.32, 1.62, { r: 0.08 })); }
    g.add(cbox(0.16, 0.16, 0.16, '#ff8fb1', DX, 2.36, 1.7, { r: 0.06 }));
    plate(2.75);
  } else if (kind === 'townhouse') {
    // 两层小楼：瘦高，二楼有阳台，屋檐下挂着一串布料彩旗，门头一个大蝴蝶结
    g.add(box(3.3, 2.1, 3.0, wall, -0.2, 0.22, 0, { r: 0.12 }));
    g.add(box(3.5, 0.2, 3.2, roof, -0.2, 2.3, 0, { r: 0.07 }));
    g.add(box(3.1, 1.9, 2.8, wall, -0.2, 2.46, -0.1, { r: 0.12 }));
    roofSlabs(g, 3.9, 1.5, 3.5, 4.34, roof, wall, 3.1);
    g.children.slice(-4).forEach((m) => { m.position.x -= 0.2; m.position.z -= 0.1; });
    g.add(box(1.7, 0.12, 0.9, '#fffaf2', 0.65, 2.42, 1.55, { r: 0.05 }));
    for (let i = 0; i < 5; i++) g.add(box(0.08, 0.5, 0.08, '#ffffff', -0.1 + i * 0.38, 2.5, 1.94, { r: 0.03 }));
    g.add(cbox(1.74, 0.09, 0.1, '#ffffff', 0.65, 3.06, 1.94, { r: 0.04 }));
    win(0.65, 3.35, 1.31, 0.8, 0.9);
    win(-1.0, 3.35, 1.31, 0.6, 0.7);
    win(0.75, 1.3, 1.51, 0.9, 0.9);
    addDoor(1.51);
    g.add(cbox(0.5, 0.34, 0.1, dc, DX - 0.24, 2.05, 1.6, { r: 0.12, rz: 0.5 }), cbox(0.5, 0.34, 0.1, dc, DX + 0.24, 2.05, 1.6, { r: 0.12, rz: -0.5 }), cbox(0.2, 0.22, 0.14, '#ffffff', DX, 2.05, 1.62, { r: 0.08 }));
    ['#ff9fbd', '#ffe27a', '#9fe0c5', '#b9a4f2', '#8fd0f5'].forEach((c, i) => g.add(cbox(0.26, 0.34, 0.04, c, 1.55, 0.9 + i * 0.01, 1.9 - i * 0.02, { r: 0.04 })) && (g.children[g.children.length - 1].position.x = 1.25 + i * 0.16));
    g.add(box(0.9, 0.6, 0.5, WOOD, 1.6, 0.24, 1.75, { r: 0.06 }));
    plate(2.62, 1.56);
  } else if (kind === 'cabin') {
    // 渔夫木屋：一层层木板墙，单坡屋顶，门口晒着鱼，墙边靠着一条小船
    for (let i = 0; i < 5; i++) g.add(box(3.9, 0.44, 3.0, i % 2 ? '#c9a27a' : '#b88f66', 0, 0.22 + i * 0.42, 0, { r: 0.08 }));
    g.add(cbox(4.6, 0.24, 3.8, roof, 0, 2.62, 0.1, { r: 0.08, rx: 0.16 }));
    g.add(cbox(4.7, 0.12, 0.3, '#ffffff', 0, 2.38, 1.98, { r: 0.05 }));
    addDoor();
    win(0.95, 1.35, 1.52, 0.8, 0.7);
    g.add(cbox(1.0, 1.0, 0.12, '#ffffff', 0.95, 1.35, 1.6, { r: 0.5 }), cbox(0.74, 0.74, 0.14, '#7fc4f5', 0.95, 1.35, 1.62, { r: 0.37 }));
    for (const sx of [-1, 1]) g.add(box(0.1, 1.5, 0.1, WOOD_D, 1.55 + sx * 0.55, 0.2, 2.1));
    g.add(cbox(1.3, 0.07, 0.07, WOOD_D, 1.55, 1.66, 2.1));
    ['#8fd0f5', '#ffb38a', '#9fe0c5'].forEach((c, i) => g.add(cbox(0.16, 0.42, 0.08, c, 1.15 + i * 0.4, 1.4, 2.1, { r: 0.06 })));
    const boat = group(-2.05, 0.2, 0.2);
    boat.add(cbox(0.5, 0.36, 2.2, '#7fc4f5', 0, 0.9, 0, { r: 0.16 }), cbox(0.4, 0.1, 2.0, '#ffffff', 0.08, 1.08, 0, { r: 0.04 }));
    boat.rotation.z = -0.35;
    g.add(boat);
    g.add(cyl(0.3, 0.3, 0.6, '#b0855a', 1.85, 0.22, -1.1, { seg: 12 }));
    plate(2.08);
  } else if (kind === 'candy') {
    // 糖果屋：圆滚滚的粉色小屋，圆顶上顶着一颗星星，窗户是一颗爱心，墙上贴满海报
    g.add(box(3.7, 2.0, 3.0, wall, 0, 0.22, 0, { r: 0.34 }));
    g.add(cbox(4.1, 1.5, 3.4, roof, 0, 2.7, 0, { r: 0.7 }));
    g.add(cbox(2.6, 1.0, 2.2, '#ffffff', 0, 3.5, 0, { r: 0.5 }));
    g.add(cbox(1.5, 0.7, 1.3, roof, 0, 4.1, 0, { r: 0.35 }));
    g.add(box(0.08, 0.7, 0.08, '#ffffff', 0, 4.4, 0));
    const star = cbox(0.5, 0.5, 0.14, mat('#ffd76a', { emissive: '#ffd76a', ei: 0.5 }), 0, 5.3, 0, { r: 0.1, rz: Math.PI / 4 });
    g.add(star);
    g.userData.tick = (time) => { star.rotation.y = time * 1.5; star.position.y = 5.3 + Math.sin(time * 2) * 0.08; };
    for (const [x, c] of [[-1.5, '#ffe27a'], [-0.5, '#ffffff'], [0.5, '#9fe0c5'], [1.5, '#c9b6f2']]) g.add(sph(0.2, c, x, 2.6, 1.62));
    addDoor(1.52);
    g.add(cbox(0.9, 0.9, 0.1, '#ffffff', 0.95, 1.4, 1.52, { r: 0.3, rz: Math.PI / 4 }));
    g.add(cbox(0.42, 0.42, 0.14, '#ff6f91', 0.76, 1.52, 1.55, { r: 0.2 }), cbox(0.42, 0.42, 0.14, '#ff6f91', 1.14, 1.52, 1.55, { r: 0.2 }), cbox(0.48, 0.48, 0.14, '#ff6f91', 0.95, 1.3, 1.55, { r: 0.08, rz: Math.PI / 4 }));
    for (const [x, y, c, rz] of [[1.75, 1.5, '#ff9fbd', 0.1], [1.72, 0.9, '#8fd0f5', -0.12]]) g.add(cbox(0.06, 0.5, 0.42, c, x + 0.12, y, 0.4, { r: 0.03, rx: rz }));
    plate(2.1, 1.58);
  } else if (kind === 'tower') {
    // 诗人的圆塔：细高的圆塔配尖顶和小旗，旁边一间小门厅，门口挂着灯笼
    g.add(cyl(1.45, 1.55, 4.2, wall, 0.75, 0.22, -0.2, { seg: 20 }));
    g.add(cyl(1.62, 1.62, 0.2, roof, 0.75, 4.42, -0.2, { seg: 20 }));
    g.add(cyl(0.05, 1.75, 2.0, roof, 0.75, 4.6, -0.2, { seg: 20 }));
    g.add(box(0.07, 0.9, 0.07, '#ffffff', 0.75, 6.5, -0.2));
    const flag = cbox(0.6, 0.34, 0.04, dc, 1.06, 7.2, -0.2, { r: 0.03 });
    g.add(flag);
    g.userData.tick = (time) => { flag.rotation.y = Math.sin(time * 2.2) * 0.35; };
    for (const [y, a] of [[1.6, 0.5], [3.2, -0.3]]) { const w = windowBox(0.6, 0.8); w.position.set(0.75 + Math.sin(a) * 1.52, y, -0.2 + Math.cos(a) * 1.52); w.rotation.y = a; g.add(w); }
    g.add(box(2.0, 1.9, 2.2, wall, -0.95, 0.22, 0.45, { r: 0.12 }));
    g.add(cbox(2.3, 0.2, 2.5, roof, -0.95, 2.2, 0.45, { r: 0.08 }));
    g.add(cbox(1.7, 0.3, 1.9, roof, -0.95, 2.42, 0.45, { r: 0.12 }));
    addDoor(1.56);
    for (const sx of [-1, 1]) { g.add(box(0.05, 0.3, 0.05, '#8a6a3a', DX + sx * 0.75, 1.75, 1.72)); g.add(cbox(0.22, 0.3, 0.22, LAMP(), DX + sx * 0.75, 1.6, 1.72, { r: 0.08, ...ns })); }
    g.add(box(0.5, 0.5, 0.5, '#c9a27a', 1.7, 0.24, 1.5, { r: 0.1 }));
    g.add(cbox(0.42, 0.52, 0.14, '#b0763c', 1.7, 1.1, 1.55, { r: 0.18, rx: -0.25 }), cbox(0.1, 0.7, 0.08, '#8a5a2b', 1.7, 1.62, 1.42, { rx: -0.25 }));
    plate(2.72, 1.6);
  } else {
    g.add(box(3.9, 2.2, 3.1, wall, 0, 0.22, 0, { r: 0.13 }));
    roofSlabs(g, 4.7, 1.7, 3.9, 2.38, roof, wall, 3.9);
    addDoor();
    win(0.95, 1.4, 1.55);
    plate();
  }
  return g;
}

// ————————————————— 暖暖的家（三个等级）—————————————————
export function house(tier = 1) {
  const g = group();
  if (tier === 1) {
    g.add(box(5.5, 0.3, 4.5, STONE_D, 0, 0, 0, { r: 0.1 }));
    g.add(box(5, 2.6, 4, '#fff4e4', 0, 0.25, 0, { r: 0.14 }));
    roofSlabs(g, 6, 2.1, 4.9, 2.8, '#ff9fbd', '#fff4e4', 5);
    g.add(box(0.6, 1.5, 0.6, '#f2e2d2', 1.5, 3.4, -0.8, { r: 0.08 }));
    g.add(box(0.76, 0.2, 0.76, '#e58aa7', 1.5, 4.85, -0.8, { r: 0.06 }));
    const d = door(1, 1.75, '#e08fa8');
    d.position.set(0, 0.28, 2.0);
    g.add(d);
    for (const sx of [-1, 1]) {
      const w = windowBox(0.85, 0.85);
      w.position.set(sx * 1.6, 1.65, 2.0);
      g.add(w);
      const fb = flowerBox(1.05);
      fb.position.set(sx * 1.6, 1.0, 2.12);
      g.add(fb);
    }
    const ww = windowBox(0.7, 0.7);
    ww.position.set(0, 3.65, 1.62);
    g.add(ww);
    g.add(cbox(0.3, 0.26, 0.05, '#ff6f91', 0, 2.75, 2.07, { r: 0.1, rz: Math.PI / 4 }));
    g.add(box(1.5, 0.16, 0.7, STONE, 0, 0.1, 2.5, { r: 0.06 }));
  } else if (tier === 2) {
    g.add(box(6.6, 0.3, 4.8, STONE_D, 0, 0, 0, { r: 0.1 }));
    g.add(box(6.1, 2.8, 4.2, '#fff8ee', 0, 0.25, 0, { r: 0.14 }));
    g.add(box(6.3, 0.22, 4.4, '#ffd6e3', 0, 3.0, 0, { r: 0.08 }));
    g.add(box(4.2, 2.2, 3.6, '#fff8ee', -0.7, 3.15, -0.1, { r: 0.12 }));
    roofSlabs(g, 5.2, 1.9, 4.4, 5.3, '#ff8fb1', '#fff8ee', 4.2);
    g.children.slice(-4).forEach((m) => (m.position.x -= 0.7));
    // 阳台
    g.add(box(1.9, 0.14, 1.3, '#ffe9f0', 2.15, 3.2, 1.3, { r: 0.05 }));
    for (let i = 0; i < 5; i++) g.add(box(0.09, 0.6, 0.09, WHITE, 1.35 + i * 0.4, 3.3, 1.88, { r: 0.03 }));
    g.add(cbox(1.9, 0.1, 0.12, WHITE, 2.15, 3.94, 1.88, { r: 0.04 }));
    const fb2 = flowerBox(1.5, ['#ff8fb1', '#c9b6f2', '#ffffff']);
    fb2.position.set(2.15, 3.42, 2.0);
    g.add(fb2);
    // 圆塔
    g.add(cyl(1.05, 1.05, 4.6, '#fff1f5', 3.05, 0.25, -1.2, { seg: 20 }));
    g.add(cyl(0.04, 1.35, 1.7, '#ff8fb1', 3.05, 4.85, -1.2, { seg: 20 }));
    g.add(sph(0.14, '#ffd76a', 3.05, 6.6, -1.2));
    const d = door(1.1, 1.85, '#e77fa0');
    d.position.set(0, 0.28, 2.1);
    g.add(d);
    for (const [x, y] of [[-2, 1.7], [2, 1.7], [-1.6, 4.25], [0.2, 4.25]]) {
      const w = windowBox(0.9, 0.95);
      w.position.set(x, y, y > 3 ? 1.7 : 2.1);
      g.add(w);
      if (y < 3) {
        const fb = flowerBox(1.1, ['#ffe27a', '#ff8fb1', '#ffffff']);
        fb.position.set(x, 1.02, 2.22);
        g.add(fb);
      }
    }
    g.add(awningSmall('#ff8fb1', '#ffffff'));
    g.add(box(1.8, 0.16, 0.8, STONE, 0, 0.1, 2.6, { r: 0.06 }));
  } else {
    g.add(box(7.4, 0.36, 5, STONE_D, 0, 0, 0, { r: 0.12 }));
    g.add(box(5.2, 3.6, 4, '#fffaf4', 0, 0.3, 0, { r: 0.16 }));
    g.add(box(5.5, 0.26, 4.3, '#ffe9a8', 0, 3.85, 0, { r: 0.08 }));
    for (let i = 0; i < 5; i++) g.add(box(0.62, 0.5, 0.5, '#fffaf4', -2.2 + i * 1.1, 4.05, 1.85, { r: 0.1 }));
    g.add(box(3, 2.4, 3, '#fffaf4', 0, 4.05, -0.3, { r: 0.14 }));
    g.add(frustum(0.1, 3.6, 2.4, '#ff8fb1', 0, 6.45, -0.3));
    g.add(box(0.07, 1.1, 0.07, '#ffd76a', 0, 8.8, -0.3));
    g.add(cbox(0.6, 0.36, 0.04, '#ff6f91', 0.34, 9.65, -0.3, { r: 0.02 }));
    for (const sx of [-1, 1]) {
      g.add(cyl(1.15, 1.2, 5.6, '#fff1f5', sx * 3, 0.3, 0.6, { seg: 22 }));
      g.add(cyl(1.3, 1.3, 0.3, '#ffe9a8', sx * 3, 5.8, 0.6, { seg: 22 }));
      g.add(cyl(0.04, 1.45, 2.3, sx < 0 ? '#b9a4f2' : '#8fd0f5', sx * 3, 6.1, 0.6, { seg: 22 }));
      g.add(sph(0.16, '#ffd76a', sx * 3, 8.45, 0.6));
      const w1 = windowBox(0.6, 0.9);
      w1.position.set(sx * 3, 3.9, 1.76);
      g.add(w1);
      const w2 = windowBox(0.6, 0.9);
      w2.position.set(sx * 3, 1.9, 1.76);
      g.add(w2);
    }
    // 云朵装饰
    const cm = mat('#ffffff', { rough: 1, emissive: '#ffffff', ei: 0.2 });
    for (const [x, y, z, s] of [[-2.3, 0.5, 2.3, 1], [2.5, 0.45, 2.4, 0.8], [-1.2, 4.3, 1.4, 0.6]]) {
      g.add(cbox(1.2 * s, 0.6 * s, 0.8 * s, cm, x, y, z, { r: 0.28 * s }));
      g.add(cbox(0.7 * s, 0.6 * s, 0.7 * s, cm, x - 0.3 * s, y + 0.35 * s, z, { r: 0.28 * s }));
    }
    const d = door(1.3, 2.1, '#e77fa0', '#ffe9a8');
    d.position.set(0, 0.32, 2.02);
    g.add(d);
    g.add(cbox(0.6, 0.52, 0.08, glow('#ffd1df', '#ff8fb1', 0.3, 2.2), 0, 3.1, 2.03, { r: 0.2, rz: Math.PI / 4 }));
    for (const sx of [-1, 1]) {
      const w = windowBox(0.75, 1.1);
      w.position.set(sx * 1.6, 2.0, 2.02);
      g.add(w);
      const w3 = windowBox(0.6, 0.8);
      w3.position.set(sx * 0.75, 5.2, 1.22);
      g.add(w3);
    }
    g.add(box(2.2, 0.18, 0.9, '#ffe9f0', 0, 0.1, 2.7, { r: 0.07 }));
  }
  return g;
}
function awningSmall(c1, c2) {
  const a = awning(1.9, 0.9, c1, c2, 5);
  a.position.set(0, 2.45, 2.12);
  return a;
}

// ————————————————— 店铺 —————————————————
export function shopCafe() {
  const g = group();
  g.add(box(7, 0.3, 5.4, STONE_D, 0, 0, 0, { r: 0.1 }));
  g.add(box(6.5, 3.5, 5, '#fff6ea', 0, 0.25, 0, { r: 0.16 }));
  g.add(box(6.9, 0.4, 5.4, '#ff9fbd', 0, 3.7, 0, { r: 0.14 }));
  g.add(box(6.5, 0.22, 5, '#ffe4ec', 0, 4.05, 0, { r: 0.08 }));
  g.add(box(6.52, 0.7, 5.02, '#ffd0de', 0, 0.25, 0, { r: 0.12 }));
  const a = awning(5.6, 1.5, '#ff9fbd', '#ffffff', 9);
  a.position.set(0, 2.75, 2.5);
  g.add(a);
  const d = door(1.1, 1.9, '#f58aa9');
  d.position.set(-1.7, 0.28, 2.5);
  g.add(d);
  const w = windowBox(2.6, 1.3);
  w.position.set(1.2, 1.75, 2.5);
  g.add(w);
  const fb = flowerBox(2.8, ['#ff8fb1', '#ffffff', '#ffe27a']);
  fb.position.set(1.2, 0.9, 2.62);
  g.add(fb);
  const s = signBoard('甜心咖啡屋', '#f0679a');
  s.position.set(0, 3.9, 2.72);
  g.add(s);
  // 屋顶的大咖啡杯
  const cup = group(1.6, 4.27, -0.6);
  cup.add(cyl(1.0, 1.0, 0.12, WHITE, 0, 0, 0, { seg: 28 }));
  cup.add(cyl(0.72, 0.52, 1.0, '#ffffff', 0, 0.12, 0, { seg: 28 }));
  cup.add(cyl(0.62, 0.62, 0.06, '#b9825c', 0, 1.09, 0, { seg: 28, ...ns }));
  cup.add(cbox(0.26, 0.22, 0.03, '#fff3e2', 0, 1.12, 0, { r: 0.1, rx: Math.PI / 2, ...ns }));
  cup.add(torus(0.28, 0.08, WHITE, 0.82, 0.65, 0));
  cup.add(cbox(0.5, 0.2, 0.05, '#ff9fbd', 0, 0.62, 0.64, { r: 0.09 }));
  g.add(cup);
  g.userData.spin = cup;
  // 蒸汽
  const steam = group(1.6, 5.6, -0.6);
  for (let i = 0; i < 3; i++) steam.add(cbox(0.2, 0.2, 0.2, mat('#ffffff', { opacity: 0.7 }), (i - 1) * 0.3, i * 0.1, 0, { r: 0.08, ...ns }));
  g.add(steam);
  g.userData.steam = steam;
  // 露天座位
  const t = group(-4.9, 0, 3.4);
  t.add(cyl(0.7, 0.7, 0.1, WHITE, 0, 0.85, 0));
  t.add(cyl(0.08, 0.08, 0.85, '#d9cfc5', 0, 0, 0));
  t.add(cyl(0.05, 0.05, 2.5, '#d9cfc5', 0, 0.9, 0));
  for (let i = 0; i < 8; i++) {
    const m = frustum(0.02, 0.9, 0.55, i % 2 ? '#ff9fbd' : WHITE, 0, 2.75, 0);
    m.geometry = wedgeGeo();
    m.rotation.y = (i / 8) * Math.PI * 2;
    t.add(m);
  }
  for (const sx of [-1, 1]) {
    t.add(box(0.55, 0.1, 0.55, '#ffd0de', sx * 1.1, 0.5, 0, { r: 0.04 }));
    t.add(box(0.08, 0.5, 0.08, WHITE, sx * 1.1, 0, 0));
    t.add(box(0.1, 0.6, 0.55, '#ffd0de', sx * 1.34, 0.55, 0, { r: 0.04 }));
  }
  t.add(cyl(0.12, 0.09, 0.16, WHITE, 0.2, 0.95, 0.1, { seg: 12 }));
  g.add(t);
  // 小黑板
  const bd = group(-3.3, 0, 3.3);
  bd.add(cbox(0.9, 1.2, 0.08, '#6b5a66', 0, 0.62, 0, { r: 0.04, rx: -0.2 }));
  bd.add(cbox(0.7, 0.9, 0.02, '#4a3d47', 0, 0.64, 0.05, { r: 0.02, rx: -0.2, ...ns }));
  bd.add(cbox(0.4, 0.06, 0.02, '#ffc2d6', 0, 0.85, 0.02, { rx: -0.2, ...ns }));
  bd.add(cbox(0.5, 0.05, 0.02, WHITE, 0, 0.65, 0.065, { rx: -0.2, ...ns }));
  bd.add(cbox(0.3, 0.05, 0.02, WHITE, -0.1, 0.5, 0.095, { rx: -0.2, ...ns }));
  bd.rotation.y = 0.3;
  g.add(bd);
  return g;
}
let _wedge;
function wedgeGeo() {
  if (_wedge) return _wedge;
  const s = new THREE.Shape();
  const a = Math.PI / 8, r = 1.5;
  s.moveTo(0, 0);
  s.lineTo(Math.sin(-a) * r, Math.cos(-a) * r);
  s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  s.closePath();
  _wedge = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  _wedge.rotateX(-Math.PI / 2 - 0.32);
  _wedge.translate(0, 0.25, 0);
  return _wedge;
}

export function shopFlower() {
  const g = group();
  g.add(box(6.6, 0.3, 5.2, STONE_D, 0, 0, 0, { r: 0.1 }));
  g.add(box(6, 3, 4.6, '#f0faf1', 0, 0.25, 0, { r: 0.16 }));
  g.add(box(6.02, 0.7, 4.62, '#c9ecd2', 0, 0.25, 0, { r: 0.12 }));
  roofSlabs(g, 7, 2.3, 5.4, 3.2, '#7fcf9a', '#f0faf1', 6);
  const a = awning(4.6, 1.3, '#8fd9a8', '#ffffff', 7);
  a.position.set(0.3, 2.65, 2.3);
  g.add(a);
  const d = door(1.1, 1.85, '#6fbf8c');
  d.position.set(-1.8, 0.28, 2.3);
  g.add(d);
  const w = windowBox(2.4, 1.2);
  w.position.set(1.1, 1.7, 2.3);
  g.add(w);
  const s = signBoard('花语小筑', '#5fbf85');
  s.position.set(0, 4.15, 2.62);
  s.scale.setScalar(0.9);
  g.add(s);
  // 屋顶大雏菊
  const fl = group(0, 5.9, 0.4);
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * Math.PI * 2;
    fl.add(cbox(0.42, 0.42, 0.16, WHITE, Math.sin(an) * 0.52, Math.cos(an) * 0.52, 0, { r: 0.14, rz: -an }));
  }
  fl.add(cbox(0.56, 0.56, 0.24, '#ffd24f', 0, 0, 0.02, { r: 0.2 }));
  g.add(fl);
  g.add(box(0.12, 0.6, 0.12, '#6fbf8c', 0, 5.2, 0.4));
  g.userData.spin2 = fl;
  // 门前花架
  const cols = ['#ff8fb1', '#ffd24f', '#c9b6f2', '#ff9d6e', '#ffffff', '#8ec5f2'];
  const stand = group(1.3, 0, 3.5);
  stand.add(box(3, 0.45, 0.7, WOOD, 0, 0, 0, { r: 0.06 }));
  stand.add(box(3, 0.45, 0.6, WOOD_D, 0, 0.45, -0.45, { r: 0.06 }));
  for (let i = 0; i < 6; i++) {
    const x = -1.2 + i * 0.48, back = i % 2;
    const y = back ? 0.9 : 0.45, z = back ? -0.45 : 0.02;
    stand.add(cyl(0.2, 0.15, 0.34, i % 3 ? '#fff6ea' : '#cfe9f7', x, y, z, { seg: 12 }));
    stand.add(cbox(0.36, 0.26, 0.36, LEAF, x, y + 0.42, z, { r: 0.1 }));
    stand.add(cbox(0.22, 0.2, 0.22, cols[i], x - 0.07, y + 0.62, z + 0.04, { r: 0.08 }));
    stand.add(cbox(0.17, 0.16, 0.17, cols[i], x + 0.1, y + 0.56, z - 0.06, { r: 0.06 }));
  }
  g.add(stand);
  for (const x of [-3.5, 3.6]) {
    const p = group(x, 0, 2.9);
    p.add(cyl(0.42, 0.32, 0.6, '#f4c9a8', 0, 0, 0, { seg: 14 }));
    p.add(cbox(0.9, 0.8, 0.9, LEAF_D, 0, 1.0, 0, { r: 0.3 }));
    p.add(cbox(0.24, 0.2, 0.24, '#ff8fb1', 0.3, 1.36, 0.3, { r: 0.08 }));
    p.add(cbox(0.2, 0.2, 0.2, '#ffffff', -0.32, 1.1, 0.4, { r: 0.08 }));
    p.add(cbox(0.2, 0.2, 0.2, '#ffe27a', 0.1, 0.9, 0.46, { r: 0.08 }));
    g.add(p);
  }
  return g;
}

export function shopTailor() {
  const g = group();
  g.add(box(6.6, 0.3, 5.2, STONE_D, 0, 0, 0, { r: 0.1 }));
  g.add(box(6, 3.3, 4.6, '#f4effd', 0, 0.25, 0, { r: 0.16 }));
  g.add(box(6.02, 0.7, 4.62, '#ddd1fa', 0, 0.25, 0, { r: 0.12 }));
  g.add(frustum(5.2, 6.8, 1.5, '#b9a4f2', 0, 3.5, 0, { sz: 0.8 }));
  g.add(box(5.2, 0.2, 4.1, '#cdbdf7', 0, 5.0, 0, { r: 0.08 }));
  const a = awning(2.2, 1.1, '#b9a4f2', '#ffffff', 5);
  a.position.set(-1.6, 2.7, 2.3);
  g.add(a);
  const d = door(1.1, 1.9, '#9d86e0');
  d.position.set(-1.6, 0.28, 2.3);
  g.add(d);
  // 橱窗 + 人台
  g.add(cbox(2.6, 2.2, 0.12, WHITE, 1.3, 1.7, 2.3, { r: 0.08 }));
  g.add(cbox(2.36, 1.96, 0.14, WIN(), 1.3, 1.7, 2.3, { r: 0.06, ...ns }));
  const mq = group(1.3, 0.9, 2.45);
  mq.add(box(0.08, 0.5, 0.08, '#d9cfc5', 0, 0, 0));
  mq.add(frustum(0.42, 0.8, 0.6, '#ff9fbd', 0, 0.3, 0, { sz: 0.6 }));
  mq.add(box(0.4, 0.4, 0.24, '#ffd0de', 0, 0.9, 0, { r: 0.08 }));
  mq.add(sph(0.1, '#d9cfc5', 0, 1.42, 0));
  g.add(mq);
  const s = signBoard('星梦裁缝铺', '#8f76dc');
  s.position.set(0, 4.25, 2.55);
  s.scale.setScalar(0.88);
  s.rotation.x = -0.2;
  g.add(s);
  // 屋顶的线轴与纽扣
  const sp = group(-1.3, 5.2, -0.3);
  sp.add(cyl(0.7, 0.7, 0.14, WOOD, 0, 0, 0, { seg: 20 }));
  sp.add(cyl(0.5, 0.5, 1.0, '#ff9fbd', 0, 0.14, 0, { seg: 20 }));
  sp.add(cyl(0.7, 0.7, 0.14, WOOD, 0, 1.14, 0, { seg: 20 }));
  g.add(sp);
  const bt = group(1.5, 5.95, -0.2);
  bt.add(cyl(0.75, 0.75, 0.16, '#8fd0f5', 0, -0.08, 0, { seg: 24 }));
  bt.add(torus(0.7, 0.09, '#a9dcf7', 0, 0, 0, { rx: Math.PI / 2 }));
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) bt.add(cyl(0.09, 0.09, 0.18, '#5aa9d6', x, -0.085, z, { seg: 8, ...ns }));
  bt.rotation.x = Math.PI / 2 - 0.3;
  g.add(bt);
  g.userData.spin3 = bt;
  // 布料卷
  const rolls = group(3.7, 0, 2.6);
  ['#ffb3cb', '#b9a4f2', '#9fe0c5', '#ffe27a'].forEach((c, i) => rolls.add(cyl(0.18, 0.18, 1.5 - i * 0.15, c, (i % 2) * 0.3, 0, -i * 0.28, { seg: 12, rz: 0.12 * (i % 2 ? 1 : -1) })));
  g.add(rolls);
  return g;
}

export function shopBoutique() {
  const g = group();
  g.add(box(6.8, 0.3, 5.2, STONE_D, 0, 0, 0, { r: 0.1 }));
  g.add(box(6.2, 3.4, 4.6, '#fff1f5', 0, 0.25, 0, { r: 0.16 }));
  g.add(box(6.22, 0.7, 4.62, '#ffd9e4', 0, 0.25, 0, { r: 0.12 }));
  g.add(box(6.6, 0.36, 5, '#ffe9a8', 0, 3.6, 0, { r: 0.12 }));
  g.add(box(4.6, 1.5, 3.6, '#fff1f5', 0, 3.9, 0, { r: 0.14 }));
  g.add(frustum(2.2, 5, 1.3, '#ff8fb1', 0, 5.35, 0, { sz: 0.78 }));
  g.add(box(2.2, 0.16, 1.75, '#ffb3cb', 0, 6.65, 0, { r: 0.06 }));
  // 大蝴蝶结招牌
  const bow = group(0, 7.3, 0.2);
  bow.add(cbox(1.2, 0.9, 0.4, '#ff6f91', -0.68, 0, 0, { r: 0.2, rz: 0.3 }));
  bow.add(cbox(1.2, 0.9, 0.4, '#ff6f91', 0.68, 0, 0, { r: 0.2, rz: -0.3 }));
  bow.add(cbox(0.5, 0.6, 0.5, '#ffd76a', 0, 0, 0, { r: 0.18 }));
  g.add(bow);
  g.userData.bob = bow;
  const a = awning(5.6, 1.3, '#ffb3cb', '#fff6b8', 9);
  a.position.set(0, 2.75, 2.3);
  g.add(a);
  const d = door(1.2, 1.9, '#ff8fb1', '#ffe9a8');
  d.position.set(0, 0.28, 2.3);
  g.add(d);
  for (const sx of [-1, 1]) {
    g.add(cbox(1.7, 2, 0.12, WHITE, sx * 2, 1.6, 2.3, { r: 0.08 }));
    g.add(cbox(1.5, 1.8, 0.14, WIN(), sx * 2, 1.6, 2.3, { r: 0.06, ...ns }));
    const mq = group(sx * 2, 0.85, 2.45);
    mq.add(box(0.07, 0.4, 0.07, '#d9cfc5', 0, 0, 0));
    mq.add(frustum(0.4, 0.78, 0.55, sx < 0 ? '#9fe0c5' : '#b9a4f2', 0, 0.25, 0, { sz: 0.6 }));
    mq.add(box(0.38, 0.38, 0.22, sx < 0 ? '#ffffff' : '#ffe9a8', 0, 0.8, 0, { r: 0.08 }));
    mq.add(sph(0.09, '#d9cfc5', 0, 1.28, 0));
    g.add(mq);
    const w = windowBox(0.8, 0.7);
    w.position.set(sx * 1.2, 4.65, 1.82);
    g.add(w);
  }
  const s = signBoard('搭配小屋', '#f0679a');
  s.position.set(0, 3.82, 2.55);
  s.scale.setScalar(0.85);
  g.add(s);
  return g;
}

export function windmill() {
  const g = group();
  g.add(frustum(1.7, 2.8, 5, '#fff6ea', 0, 0, 0));
  g.add(frustum(1.9, 1.9, 0.3, '#ffd0de', 0, 5, 0));
  g.add(frustum(0.1, 2.3, 1.6, '#ff9fbd', 0, 5.3, 0));
  const d = door(0.8, 1.4, '#f58aa9');
  d.position.set(0, 0, 1.33);
  d.rotation.x = -0.11;
  g.add(d);
  const w = windowBox(0.6, 0.6);
  w.position.set(0, 3.2, 1.07);
  w.rotation.x = -0.11;
  g.add(w);
  const blades = group(0, 4.6, 1.25);
  blades.add(cyl(0.22, 0.22, 0.5, '#f0679a', 0, -0.25, 0, { seg: 12, rx: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) {
    const b = group();
    b.add(cbox(0.14, 3.2, 0.1, WOOD, 0, 1.6, 0.2, { r: 0.04 }));
    b.add(cbox(0.9, 2.3, 0.06, i % 2 ? '#fff6ea' : '#ffd0de', 0.42, 2.0, 0.2, { r: 0.03 }));
    b.rotation.z = (i * Math.PI) / 2;
    blades.add(b);
  }
  g.add(blades);
  g.userData.blades = blades;
  return g;
}

export function fountainBig() {
  const g = group();
  g.add(cyl(2.5, 2.7, 0.55, STONE, 0, 0, 0, { seg: 32 }));
  g.add(cyl(2.2, 2.2, 0.1, WATER, 0, 0.5, 0, { seg: 32, cast: false }));
  g.add(cyl(0.5, 0.7, 1.3, STONE, 0, 0.3, 0, { seg: 16 }));
  g.add(cyl(1.3, 0.6, 0.35, STONE, 0, 1.6, 0, { seg: 24 }));
  g.add(cyl(1.15, 1.15, 0.08, WATER, 0, 1.92, 0, { seg: 24, cast: false }));
  g.add(cyl(0.22, 0.3, 0.9, STONE, 0, 1.9, 0, { seg: 12 }));
  const star = group(0, 3.2, 0);
  star.add(cbox(0.5, 0.5, 0.2, glow('#ffe89a', '#ffd24f', 0.3, 2.5), 0, 0, 0, { r: 0.06, rz: Math.PI / 4 }));
  star.add(cbox(0.5, 0.5, 0.2, glow('#ffe89a', '#ffd24f', 0.3, 2.5), 0, 0, 0, { r: 0.06 }));
  g.add(star);
  g.userData.star = star;
  // 水滴
  const drops = [];
  const dm = mat('#c9f1fb', { rough: 0.1, opacity: 0.9 });
  for (let i = 0; i < 28; i++) {
    const m = cbox(0.11, 0.11, 0.11, dm, 0, 0, 0, { r: 0.04, ...ns });
    m.userData = { a: (i / 28) * Math.PI * 2, t: i / 28, sp: 0.8 + (i % 5) * 0.06 };
    g.add(m);
    drops.push(m);
  }
  g.userData.tick = (t) => {
    star.rotation.y = t * 0.8;
    star.position.y = 3.2 + Math.sin(t * 2) * 0.08;
    for (const m of drops) {
      const u = (t * m.userData.sp * 0.6 + m.userData.t) % 1;
      const r = 0.25 + u * 1.5;
      m.position.set(Math.cos(m.userData.a) * r, 2.75 + Math.sin(u * Math.PI) * 0.6 - u * 2.1, Math.sin(m.userData.a) * r);
      m.scale.setScalar(u > 0.95 ? 0.001 : 1 - u * 0.4);
    }
  };
  return g;
}

export function shippingBox() {
  const g = group();
  g.add(box(1.5, 0.9, 1.1, WOOD, 0, 0, 0, { r: 0.08 }));
  g.add(cbox(1.56, 0.12, 1.16, WOOD_D, 0, 0.3, 0, { r: 0.04 }));
  g.add(cbox(1.56, 0.12, 1.16, WOOD_D, 0, 0.75, 0, { r: 0.04 }));
  g.add(cbox(1.5, 0.1, 1.1, WOOD_D, 0, 1.3, -0.72, { r: 0.04, rx: 1.1 }));
  g.add(cbox(0.4, 0.34, 0.4, '#ff9a4a', -0.35, 1.0, 0.1, { r: 0.13 }));
  g.add(cbox(0.3, 0.3, 0.3, '#f2546b', 0.2, 0.98, 0.2, { r: 0.1 }));
  g.add(cbox(0.3, 0.26, 0.3, '#ff7f9f', 0.4, 0.96, -0.2, { r: 0.1 }));
  g.add(cbox(0.3, 0.2, 0.3, LEAF, -0.1, 0.95, -0.25, { r: 0.08 }));
  const t = textPlane('出货箱', { color: '#ffffff', bg: '#f0679a', height: 0.36, size: 56 });
  t.position.set(0, 0.52, 0.565);
  g.add(t);
  return g;
}

export function boat() {
  const g = group();
  g.add(frustum(2.6, 1.8, 0.7, '#fff6ea', 0, 0, 0, { sz: 0.5 }));
  g.add(frustum(2.7, 2.7, 0.12, '#ff9fbd', 0, 0.7, 0, { sz: 0.5 }));
  g.add(box(0.1, 2.6, 0.1, WOOD_D, 0, 0.6, 0));
  const sail = gable(1.6, 2.1, 0.06, '#ffffff', 0.45, 0.95, 0);
  sail.scale.x = 0.6;
  g.add(sail);
  g.add(cbox(0.4, 0.24, 0.04, '#ff6f91', 0.2, 3.25, 0, { r: 0.02 }));
  return g;
}

export function balloonAir() {
  const g = group();
  const cols = ['#ff9fbd', '#fff6ea', '#ffe27a', '#fff6ea', '#b9a4f2', '#fff6ea'];
  for (let i = 0; i < 6; i++) {
    const m = cbox(0.95, 3.4, 3.4, cols[i], 0, 3.4, 0, { r: 0.45, ...ns });
    m.position.x = (i - 2.5) * 0.56;
    m.scale.y = m.scale.z = 1 - Math.abs(i - 2.5) * 0.1;
    g.add(m);
  }
  g.add(box(1, 0.7, 1, WOOD, 0, 0, 0, { r: 0.12, ...ns }));
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) g.add(box(0.04, 1.4, 0.04, WOOD_D, x, 0.6, z, ns));
  return g;
}

// 三角彩旗串（两点之间）
export function bunting(ax, ay, az, bx, by, bz, n = 9) {
  const g = group();
  const cols = ['#ff9fbd', '#ffe27a', '#9fe0c5', '#b9a4f2', '#8fd0f5'];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.9;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t - sag, z = az + (bz - az) * t;
    if (i > 0 && i < n) {
      const f = frustum(0.4, 0.01, 0.42, cols[i % cols.length], x, y - 0.42, z, { sz: 0.12, ...ns });
      f.position.y = y - 0.21;
      f.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      g.add(f);
    }
    if (i < n) {
      const t2 = (i + 1) / n;
      const x2 = ax + (bx - ax) * t2, y2 = ay + (by - ay) * t2 - Math.sin(t2 * Math.PI) * 0.9, z2 = az + (bz - az) * t2;
      const len = Math.hypot(x2 - x, y2 - y, z2 - z);
      const seg = cbox(0.03, 0.03, len, '#ffffff', (x + x2) / 2, (y + y2) / 2, (z + z2) / 2, { r: 0.01, ...ns });
      seg.lookAt(x2, y2, z2);
      g.add(seg);
    }
  }
  return g;
}

// ————————————————— 家园装饰（家具）—————————————————
// 每个函数返回以占地中心为原点的 Group；userData.tick(t) 为可选动画
export const DECOR_BUILD = {
  stone() {
    const g = group();
    g.add(cbox(0.42, 0.08, 0.4, STONE, -0.2, 0.03, -0.2, { r: 0.03, ry: 0.2, cast: false }));
    g.add(cbox(0.36, 0.08, 0.36, '#e6dcd0', 0.22, 0.03, -0.16, { r: 0.03, ry: -0.3, cast: false }));
    g.add(cbox(0.4, 0.08, 0.36, '#e6dcd0', -0.18, 0.03, 0.24, { r: 0.03, ry: -0.1, cast: false }));
    g.add(cbox(0.4, 0.08, 0.42, STONE, 0.22, 0.03, 0.22, { r: 0.03, ry: 0.15, cast: false }));
    return g;
  },
  fence() {
    const g = group();
    // 栅栏段以格线为端点：相邻直段共享同一根立柱，横竖段在角点重合，
    // 任意按格摆放时不会留下肉眼可见的断口。
    for (const x of [-0.5, 0.5]) {
      g.add(box(0.13, 0.62, 0.08, WHITE, x, 0, 0, { r: 0.03 }));
      g.add(frustum(0.02, 0.13, 0.1, WHITE, x, 0.62, 0, { sz: 0.6 }));
    }
    g.add(cbox(1.04, 0.08, 0.05, '#f3ece6', 0, 0.22, 0, { r: 0.02 }));
    g.add(cbox(1.04, 0.08, 0.05, '#f3ece6', 0, 0.48, 0, { r: 0.02 }));
    return g;
  },
  pot() {
    const g = group();
    g.add(frustum(0.5, 0.36, 0.4, '#f4b99a', 0, 0, 0));
    g.add(cbox(0.56, 0.1, 0.56, '#f7c9ae', 0, 0.42, 0, { r: 0.03 }));
    g.add(cbox(0.5, 0.3, 0.5, LEAF, 0, 0.58, 0, { r: 0.13 }));
    for (const [x, y, z] of [[-0.14, 0.82, 0.1], [0.15, 0.78, -0.08], [0.02, 0.9, -0.02]]) {
      g.add(cbox(0.2, 0.08, 0.2, WHITE, x, y, z, { r: 0.03 }));
      g.add(cbox(0.09, 0.1, 0.09, '#ffd24f', x, y + 0.02, z, { r: 0.03 }));
    }
    return g;
  },
  tulips() {
    const g = group();
    g.add(box(0.92, 0.24, 0.92, WOOD, 0, 0, 0, { r: 0.06 }));
    g.add(box(0.8, 0.06, 0.8, '#9c7458', 0, 0.21, 0, { r: 0.02 }));
    const cols = ['#ff8fb1', '#ffd24f', '#ff9d6e', '#c9b6f2', '#ffffff'];
    let i = 0;
    for (const x of [-0.24, 0, 0.24]) for (const z of [-0.24, 0, 0.24]) {
      const hgt = 0.3 + ((i * 7) % 3) * 0.06;
      g.add(box(0.045, hgt, 0.045, '#7cc77a', x, 0.25, z));
      g.add(cbox(0.15, 0.17, 0.15, cols[i % cols.length], x, 0.25 + hgt + 0.06, z, { r: 0.05 }));
      i++;
    }
    return g;
  },
  mushroom() {
    const g = group();
    const cap = glow('#ff9fbd', '#ff7fa8', 0.1, 1.8);
    g.add(box(0.26, 0.4, 0.26, '#fff6ea', 0, 0, 0, { r: 0.1 }));
    g.add(cbox(0.72, 0.36, 0.72, cap, 0, 0.55, 0, { r: 0.17 }));
    for (const [x, z] of [[-0.2, 0.2], [0.22, 0.05], [0, -0.22]]) g.add(cbox(0.14, 0.06, 0.14, WHITE, x, 0.73, z, { r: 0.03, ...ns }));
    g.add(box(0.14, 0.22, 0.14, '#fff6ea', 0.36, 0, 0.26, { r: 0.05 }));
    g.add(cbox(0.3, 0.16, 0.3, glow('#ffe27a', '#ffd24f', 0.1, 1.8), 0.36, 0.28, 0.26, { r: 0.07 }));
    return g;
  },
  mailbox() {
    const g = group();
    g.add(box(0.12, 0.85, 0.12, WHITE, 0, 0, 0, { r: 0.04 }));
    g.add(cbox(0.46, 0.4, 0.62, '#ff8fb1', 0, 1.02, 0, { r: 0.14 }));
    g.add(cbox(0.2, 0.18, 0.04, '#ffffff', 0, 1.02, 0.31, { r: 0.07, rz: Math.PI / 4 }));
    g.add(cbox(0.05, 0.26, 0.14, '#ffd76a', 0.25, 1.14, 0.1, { r: 0.02 }));
    return g;
  },
  lamp() {
    const g = group();
    g.add(box(0.3, 0.14, 0.3, WHITE, 0, 0, 0, { r: 0.05 }));
    g.add(box(0.1, 1.5, 0.1, WHITE, 0, 0.1, 0, { r: 0.04 }));
    g.add(cbox(0.36, 0.08, 0.36, WHITE, 0, 1.62, 0, { r: 0.03 }));
    g.add(cbox(0.3, 0.34, 0.3, LAMP(), 0, 1.83, 0, { r: 0.1, ...ns }));
    g.add(frustum(0.08, 0.42, 0.16, '#ff9fbd', 0, 2.0, 0));
    return g;
  },
  pinwheel() {
    const g = group();
    g.add(box(0.07, 1.3, 0.07, WHITE, 0, 0, 0));
    const w = group(0, 1.3, 0.08);
    const cols = ['#ff8fb1', '#ffe27a', '#9fe0c5', '#8fd0f5', '#c9b6f2', '#ffb38a'];
    cols.forEach((c, i) => {
      const b = group();
      b.add(cbox(0.2, 0.4, 0.04, c, 0.06, 0.22, 0, { r: 0.02, rz: -0.25 }));
      b.rotation.z = (i / cols.length) * Math.PI * 2;
      w.add(b);
    });
    w.add(cbox(0.1, 0.1, 0.08, WHITE, 0, 0, 0.02, { r: 0.04 }));
    g.add(w);
    g.userData.tick = (t) => (w.rotation.z = -t * 3);
    return g;
  },
  birdhouse() {
    const g = group();
    g.add(box(0.1, 1.2, 0.1, WOOD_D, 0, 0, 0, { r: 0.03 }));
    g.add(box(0.5, 0.42, 0.44, '#fff6ea', 0, 1.2, 0, { r: 0.06 }));
    g.add(cbox(0.4, 0.07, 0.56, '#8fd0f5', -0.14, 1.72, 0, { r: 0.03, rz: 0.75 }));
    g.add(cbox(0.4, 0.07, 0.56, '#8fd0f5', 0.14, 1.72, 0, { r: 0.03, rz: -0.75 }));
    g.add(cyl(0.08, 0.08, 0.04, '#6b5a66', 0, 1.42, 0.22, { seg: 10, rx: Math.PI / 2, ...ns }));
    const bird = group(0.02, 1.92, 0);
    bird.add(cbox(0.18, 0.15, 0.22, '#ffd24f', 0, 0, 0, { r: 0.06 }));
    bird.add(cbox(0.06, 0.04, 0.06, '#ff9a4a', 0, 0, 0.13, { r: 0.015 }));
    g.add(bird);
    g.userData.tick = (t) => {
      bird.position.y = 1.92 + Math.abs(Math.sin(t * 5)) * 0.05;
      bird.rotation.y = Math.sin(t * 0.8) * 0.8;
    };
    return g;
  },
  bench() {
    const g = group();
    for (const sx of [-1, 1]) {
      g.add(box(0.1, 0.42, 0.5, WHITE, sx * 0.78, 0, 0, { r: 0.03 }));
      g.add(box(0.1, 0.5, 0.1, WHITE, sx * 0.78, 0.4, -0.2, { r: 0.03 }));
    }
    for (let i = 0; i < 3; i++) g.add(cbox(1.8, 0.07, 0.15, i % 2 ? '#ffd0de' : '#ffb3cb', 0, 0.44, -0.17 + i * 0.17, { r: 0.03 }));
    g.add(cbox(1.8, 0.14, 0.06, '#ffb3cb', 0, 0.68, -0.23, { r: 0.03 }));
    g.add(cbox(1.8, 0.14, 0.06, '#ffd0de', 0, 0.86, -0.25, { r: 0.03 }));
    return g;
  },
  tree() {
    const g = treeRound(0.62, '#9fdc9a', '#b9eaae');
    return group(0, 0, 0, g);
  },
  catstatue() {
    const g = group();
    g.add(box(0.74, 0.22, 0.74, STONE, 0, 0, 0, { r: 0.06 }));
    // 与随行大喵共用造型：白毛、黄兜帽、猫耳、红领结和半睁眼。
    // 仅保留静态模型，不登记 update / tick，不创建第二只随行角色。
    const momo = new Momo();
    momo.root.name = 'momo-statue';
    momo.root.position.y = 0.225;
    momo.root.scale.setScalar(1.08);
    g.add(momo.root);
    return g;
  },
  picnic() {
    const g = group();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.add(cbox(0.46, 0.04, 0.46, (i + j) % 2 ? '#ff9fbd' : '#fff6ea', -0.69 + i * 0.46, 0.02, -0.69 + j * 0.46, { r: 0.01, cast: false }));
    g.add(box(0.5, 0.3, 0.36, WOOD, -0.4, 0.04, -0.3, { r: 0.06 }));
    g.add(torus(0.18, 0.03, WOOD_D, -0.4, 0.36, -0.3, {}));
    g.add(cbox(0.2, 0.16, 0.2, '#f2546b', 0.3, 0.12, 0.2, { r: 0.07 }));
    g.add(cyl(0.2, 0.2, 0.04, WHITE, 0.3, 0.04, -0.4, { seg: 14 }));
    g.add(cbox(0.2, 0.12, 0.14, '#ffe27a', 0.3, 0.14, -0.4, { r: 0.04 }));
    g.add(cyl(0.07, 0.06, 0.18, '#9fe0c5', -0.2, 0.04, 0.4, { seg: 10 }));
    g.add(cyl(0.07, 0.06, 0.18, '#ffb3cb', 0.6, 0.04, 0.5, { seg: 10 }));
    return g;
  },
  sakura() {
    const g = group();
    g.add(treeSakura(0.9));
    for (const [x, z] of [[-0.6, 0.7], [0.7, 0.4], [0.1, -0.7], [-0.5, -0.4], [0.5, 0.85]]) g.add(cbox(0.12, 0.03, 0.1, '#ffc2d6', x, 0.02, z, { r: 0.01, ry: x * 5, ...ns }));
    return g;
  },
  arch() {
    const g = group();
    for (const sx of [-1, 1]) {
      g.add(box(0.14, 2.1, 0.5, WHITE, sx * 0.85, 0, 0, { r: 0.04 }));
      for (let i = 0; i < 5; i++) {
        g.add(cbox(0.3, 0.28, 0.3, i % 2 ? LEAF : LEAF_D, sx * 0.87, 0.3 + i * 0.42, i % 2 ? 0.18 : -0.16, { r: 0.1 }));
        g.add(cbox(0.16, 0.16, 0.16, i % 2 ? '#ff8fb1' : '#ffffff', sx * 0.95, 0.42 + i * 0.42, i % 2 ? 0.26 : -0.2, { r: 0.06 }));
      }
    }
    g.add(cbox(2.0, 0.14, 0.56, WHITE, 0, 2.15, 0, { r: 0.05 }));
    for (let i = 0; i < 6; i++) {
      const x = -0.75 + i * 0.3;
      g.add(cbox(0.36, 0.3, 0.42, i % 2 ? LEAF : LEAF_D, x, 2.34, (i % 2 ? 0.08 : -0.08), { r: 0.11 }));
      g.add(cbox(0.17, 0.17, 0.17, ['#ff8fb1', '#ffffff', '#ff6f91'][i % 3], x + 0.04, 2.44, 0.26, { r: 0.06 }));
    }
    return g;
  },
  swing() {
    const g = group();
    for (const sx of [-1, 1]) {
      // 支脚向外分开、上端汇到横梁；只有座椅绕横梁摆动。
      g.add(cbox(0.12, 2.3, 0.12, WHITE, sx * 0.85, 1.1, 0.32, { r: 0.04, rx: -0.3 }));
      g.add(cbox(0.12, 2.3, 0.12, WHITE, sx * 0.85, 1.1, -0.32, { r: 0.04, rx: 0.3 }));
      g.add(cbox(0.22, 0.2, 0.22, '#ff8fb1', sx * 0.85, 2.3, 0, { r: 0.08 }));
    }
    g.add(cbox(1.9, 0.12, 0.12, WHITE, 0, 2.2, 0, { r: 0.04 }));
    for (let i = 0; i < 5; i++) g.add(cbox(0.24, 0.2, 0.22, i % 2 ? LEAF : '#ffc2d6', -0.6 + i * 0.3, 2.3, 0, { r: 0.08 }));
    const seat = group(0, 2.2, 0);
    seat.add(cbox(0.03, 1.5, 0.03, '#d9cfc5', -0.42, -0.75, 0, ns));
    seat.add(cbox(0.03, 1.5, 0.03, '#d9cfc5', 0.42, -0.75, 0, ns));
    seat.add(cbox(1.0, 0.08, 0.4, '#ffd0de', 0, -1.52, 0, { r: 0.03 }));
    g.add(seat);
    g.userData.tick = (t) => (seat.rotation.x = Math.sin(t * 1.6) * 0.28);
    return g;
  },
  teaset() {
    const g = group();
    g.add(cyl(0.62, 0.62, 0.08, WHITE, 0, 0.72, 0, { seg: 24 }));
    g.add(cyl(0.66, 0.7, 0.3, '#ffd0de', 0, 0.44, 0, { seg: 24 }));
    g.add(cyl(0.07, 0.07, 0.72, WHITE, 0, 0, 0, { seg: 10 }));
    g.add(cyl(0.3, 0.3, 0.05, WHITE, 0, 0, 0, { seg: 14 }));
    g.add(cyl(0.14, 0.11, 0.2, '#fff6ea', 0, 0.8, 0, { seg: 12 }));
    g.add(cbox(0.1, 0.05, 0.05, '#fff6ea', 0.18, 0.92, 0, { r: 0.02 }));
    g.add(cyl(0.16, 0.16, 0.03, '#ffb3cb', -0.3, 0.8, 0.2, { seg: 12 }));
    g.add(cbox(0.14, 0.1, 0.12, '#fff3e2', -0.3, 0.87, 0.2, { r: 0.03 }));
    g.add(cbox(0.06, 0.06, 0.06, '#f2546b', -0.3, 0.94, 0.2, { r: 0.02 }));
    g.add(cyl(0.07, 0.05, 0.1, WHITE, 0.3, 0.8, -0.24, { seg: 10 }));
    for (const [x, z, ry] of [[-0.85, 0, Math.PI / 2], [0.85, 0, -Math.PI / 2]]) {
      const c = group(x, 0, z);
      c.rotation.y = ry;
      c.add(box(0.46, 0.08, 0.46, '#ffb3cb', 0, 0.42, 0, { r: 0.03 }));
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) c.add(box(0.06, 0.42, 0.06, WHITE, lx, 0, lz));
      c.add(box(0.46, 0.5, 0.07, WHITE, 0, 0.5, -0.2, { r: 0.03 }));
      c.add(cbox(0.2, 0.18, 0.08, '#ffb3cb', 0, 0.82, -0.2, { r: 0.07, rz: Math.PI / 4 }));
      g.add(c);
    }
    return g;
  },
  fountain() {
    const g = group();
    g.add(cyl(0.92, 0.98, 0.36, STONE, 0, 0, 0, { seg: 24 }));
    g.add(cyl(0.8, 0.8, 0.08, WATER, 0, 0.32, 0, { seg: 24, cast: false }));
    g.add(cyl(0.16, 0.22, 0.8, STONE, 0, 0.2, 0, { seg: 12 }));
    g.add(cyl(0.46, 0.2, 0.18, STONE, 0, 1.0, 0, { seg: 16 }));
    g.add(cyl(0.4, 0.4, 0.05, WATER, 0, 1.16, 0, { seg: 16, cast: false }));
    const heart = group(0, 1.5, 0);
    const hm = glow('#ffb3cb', '#ff7fa8', 0.25, 2);
    heart.add(cbox(0.2, 0.2, 0.12, hm, 0, 0, 0, { r: 0.04, rz: Math.PI / 4 }));
    heart.add(cbox(0.17, 0.17, 0.12, hm, -0.07, 0.07, 0, { r: 0.07 }));
    heart.add(cbox(0.17, 0.17, 0.12, hm, 0.07, 0.07, 0, { r: 0.07 }));
    g.add(heart);
    const drops = [];
    const dm = mat('#c9f1fb', { rough: 0.1, opacity: 0.9 });
    for (let i = 0; i < 12; i++) {
      const m = cbox(0.07, 0.07, 0.07, dm, 0, 0, 0, { r: 0.025, ...ns });
      m.userData = { a: (i / 12) * Math.PI * 2, t: i / 12 };
      g.add(m);
      drops.push(m);
    }
    g.userData.tick = (t) => {
      heart.rotation.y = t;
      for (const m of drops) {
        const u = (t * 0.6 + m.userData.t) % 1;
        const r = 0.1 + u * 0.55;
        m.position.set(Math.cos(m.userData.a) * r, 1.25 + Math.sin(u * Math.PI) * 0.3 - u * 0.85, Math.sin(m.userData.a) * r);
      }
    };
    return g;
  },
  carousel() {
    const g = group();
    g.add(cyl(1.4, 1.45, 0.24, '#ffe9f0', 0, 0, 0, { seg: 28 }));
    g.add(cyl(1.3, 1.3, 0.06, '#ffd76a', 0, 0.22, 0, { seg: 28 }));
    g.add(cyl(0.2, 0.2, 2.2, '#fff6ea', 0, 0.24, 0, { seg: 14 }));
    const top = group(0, 2.4, 0);
    top.add(cyl(1.5, 1.5, 0.2, '#ffe9a8', 0, 0, 0, { seg: 28 }));
    for (let i = 0; i < 12; i++) {
      const w = frustum(0.02, 0.9, 0.55, i % 2 ? '#ff8fb1' : WHITE, 0, 0, 0);
      w.geometry = roofWedge();
      w.position.y = 0.2;
      w.rotation.y = (i / 12) * Math.PI * 2;
      top.add(w);
    }
    top.add(sph(0.14, glow('#ffe89a', '#ffd24f', 0.3, 2.5), 0, 1.18, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      top.add(cbox(0.1, 0.1, 0.1, glow('#fff3c4', '#ffc864', 0.2, 3), Math.sin(a) * 1.5, 0.02, Math.cos(a) * 1.5, { r: 0.04, ...ns }));
    }
    g.add(top);
    const ring = group(0, 0, 0);
    const cols = ['#ffffff', '#ffd0de', '#cfe9f7', '#fff3c4'];
    const horses = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const hgrp = group(Math.sin(a) * 0.92, 0, Math.cos(a) * 0.92);
      hgrp.rotation.y = a + Math.PI / 2;
      hgrp.add(cbox(0.04, 2.1, 0.04, '#ffd76a', 0, 1.3, 0, ns));
      const hs = group(0, 0.9, 0);
      hs.add(cbox(0.22, 0.24, 0.5, cols[i], 0, 0, 0, { r: 0.08 }));
      hs.add(cbox(0.18, 0.3, 0.2, cols[i], 0, 0.2, 0.24, { r: 0.07, rx: 0.4 }));
      hs.add(cbox(0.16, 0.16, 0.26, cols[i], 0, 0.33, 0.36, { r: 0.06 }));
      hs.add(cbox(0.06, 0.26, 0.08, '#ff8fb1', 0, 0.3, 0.16, { r: 0.02, rx: 0.4 }));
      hs.add(cbox(0.24, 0.07, 0.2, '#ff8fb1', 0, 0.13, 0, { r: 0.03 }));
      for (const [lx, lz] of [[-0.07, 0.17], [0.07, 0.17], [-0.07, -0.17], [0.07, -0.17]]) hs.add(cbox(0.07, 0.24, 0.07, cols[i], lx, -0.2, lz, { r: 0.025 }));
      hgrp.add(hs);
      ring.add(hgrp);
      horses.push(hs);
    }
    g.add(ring);
    g.userData.tick = (t) => {
      ring.rotation.y = t * 0.7;
      top.rotation.y = t * 0.7;
      horses.forEach((hs, i) => (hs.position.y = 0.95 + Math.sin(t * 2.4 + i * 1.6) * 0.2));
    };
    return g;
  },
};
let _rw;
function roofWedge() {
  if (_rw) return _rw;
  const a = Math.PI / 12, r = 1.6, hgt = 0.95;
  const g = new THREE.BufferGeometry();
  const p = [0, hgt, 0, Math.sin(-a) * r, 0, Math.cos(-a) * r, Math.sin(a) * r, 0, Math.cos(a) * r];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  _rw = g;
  return g;
}

Object.assign(DECOR_BUILD, {
  // 田地：2×2 格，作物由 farm.js 种在上面
  bigplot() {
    const g = group();
    g.add(box(2.92, 0.16, 2.92, '#dcb590', 0, 0, 0, { r: 0.06 }));
    const soil = box(2.62, 0.2, 2.62, '#b08566', 0, 0.02, 0, { r: 0.08 });
    g.add(soil);
    for (const [x, z] of [[-1.31, -1.31], [1.31, -1.31], [-1.31, 1.31], [1.31, 1.31]]) g.add(box(0.2, 0.4, 0.2, '#c9a27a', x, 0, z, { r: 0.05 }));
    // 中间一圈树坑，图标上一眼能和普通田区分开
    g.add(cbox(1.5, 0.05, 1.5, '#9c7458', 0, 0.235, 0, { r: 0.6, cast: false }), cbox(1.1, 0.05, 1.1, '#b08566', 0, 0.245, 0, { r: 0.5, cast: false }));
    g.userData.soil = soil;
    return g;
  },
  sprinkler() {
    // 占 2×2：石头底座 + 一圈水槽 + 中间旋转的喷头
    const g = group();
    g.add(box(1.86, 0.14, 1.86, '#cfd9e2', 0, 0, 0, { r: 0.08 }));
    g.add(box(1.5, 0.1, 1.5, '#9fd6f2', 0, 0.12, 0, { r: 0.3, cast: false }));
    g.add(box(0.7, 0.26, 0.7, '#b9c8d6', 0, 0.12, 0, { r: 0.12 }));
    g.add(box(0.2, 0.9, 0.2, '#dfe8ef', 0, 0.36, 0, { r: 0.05 }));
    const head = group(0, 1.32, 0);
    head.add(cbox(1.2, 0.12, 0.16, '#7fc4f5', 0, 0, 0, { r: 0.05 }), cbox(0.16, 0.12, 1.2, '#7fc4f5', 0, 0, 0, { r: 0.05 }), cbox(0.3, 0.22, 0.3, '#ffffff', 0, 0.03, 0, { r: 0.1 }));
    for (const [x, z] of [[0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62]]) head.add(cbox(0.13, 0.13, 0.13, '#cfeeff', x, 0.05, z, { r: 0.045 }));
    g.add(head);
    g.userData.tick = (time) => { head.rotation.y = time * 2.4; };
    return g;
  },
  plot() {
    const g = group();
    g.add(box(1.92, 0.16, 1.92, '#dcb590', 0, 0, 0, { r: 0.06 }));
    const soil = box(1.66, 0.2, 1.66, '#b08566', 0, 0.02, 0, { r: 0.07 });
    g.add(soil);
    for (const x of [-0.56, -0.19, 0.19, 0.56]) g.add(cbox(0.1, 0.03, 1.4, '#9c7458', x, 0.225, 0, { r: 0.012, cast: false }));
    g.userData.soil = soil;
    return g;
  },
  bed() {
    const g = group();
    g.add(box(1.8, 0.4, 2.8, '#fff6ea', 0, 0, 0, { r: 0.1 }));
    g.add(box(1.7, 0.26, 2.6, '#ffffff', 0, 0.4, 0.05, { r: 0.1 }));
    g.add(box(1.72, 0.2, 1.7, '#ffb3cb', 0, 0.56, 0.5, { r: 0.09 }));
    g.add(box(1.74, 0.06, 0.3, '#ffffff', 0, 0.72, -0.3, { r: 0.03 }));
    g.add(box(1.9, 1.3, 0.24, '#ff9fbd', 0, 0, -1.32, { r: 0.12 }));
    g.add(cbox(0.5, 0.44, 0.1, '#ffd0de', 0, 1.2, -1.2, { r: 0.16, rz: Math.PI / 4 }));
    for (const sx of [-1, 1]) g.add(cbox(0.66, 0.2, 0.46, '#ffffff', sx * 0.42, 0.76, -0.9, { r: 0.09 }));
    return g;
  },
  sofa() {
    const g = group();
    g.add(box(2.8, 0.5, 0.86, '#fff1e2', 0, 0.1, 0, { r: 0.14 }));
    g.add(box(2.8, 0.8, 0.26, '#ffe2cf', 0, 0.4, -0.32, { r: 0.12 }));
    for (const sx of [-1, 1]) g.add(box(0.3, 0.66, 0.9, '#ffe2cf', sx * 1.3, 0.1, 0, { r: 0.12 }));
    for (const [x, c] of [[-0.7, '#ffb3cb'], [0.7, '#b9a4f2']]) g.add(cbox(0.5, 0.44, 0.2, c, x, 0.82, -0.12, { r: 0.1, rx: -0.2 }));
    for (const x of [-1.2, 1.2]) g.add(box(0.12, 0.12, 0.12, '#b98b6b', x, 0, 0.3));
    return g;
  },
  coffee() {
    const g = group();
    g.add(box(1.7, 0.1, 0.8, '#ffffff', 0, 0.42, 0, { r: 0.05 }));
    for (const [x, z] of [[-0.7, -0.28], [0.7, -0.28], [-0.7, 0.28], [0.7, 0.28]]) g.add(box(0.09, 0.42, 0.09, '#d2a67e', x, 0, z, { r: 0.03 }));
    g.add(cyl(0.14, 0.1, 0.2, '#ffd0de', -0.4, 0.52, 0, { seg: 12 }));
    g.add(cbox(0.4, 0.05, 0.3, '#b9a4f2', 0.35, 0.55, 0.05, { r: 0.02, ry: 0.3 }));
    return g;
  },
  bookshelf() {
    const g = group();
    g.add(box(1.8, 2.6, 0.5, '#d2a67e', 0, 0, 0, { r: 0.06 }));
    const cols = ['#ff8fb1', '#8fd0f5', '#ffe27a', '#9fe0c5', '#b9a4f2', '#ffb38a'];
    for (let r = 0; r < 3; r++) {
      g.add(box(1.6, 0.7, 0.1, '#b3855f', 0, 0.15 + r * 0.82, 0.2, { r: 0.02, cast: false }));
      for (let i = 0; i < 6; i++) g.add(box(0.2, 0.5 + ((i + r) % 3) * 0.06, 0.3, cols[(i + r * 2) % 6], -0.62 + i * 0.25, 0.16 + r * 0.82, 0.12, { r: 0.03 }));
    }
    return g;
  },
  vanity() {
    const g = group();
    g.add(box(1.7, 0.8, 0.6, '#ffffff', 0, 0, 0, { r: 0.08 }));
    g.add(box(1.74, 0.08, 0.64, '#ffd0de', 0, 0.8, 0, { r: 0.03 }));
    // 镜子：底座 + 支杆 + 圆镜框，镜面是贴在镜框正面的一层
    g.add(cbox(0.5, 0.06, 0.2, '#ffd76a', 0, 0.91, -0.18, { r: 0.025 }));
    g.add(cbox(0.07, 0.2, 0.07, '#ffd76a', 0, 1.0, -0.2, { r: 0.02 }));
    const mir = group(0, 1.56, -0.2);
    const fr = cyl(0.5, 0.5, 0.07, '#ffd76a', 0, 0, 0, { seg: 28 }); fr.rotation.x = Math.PI / 2; fr.position.set(0, 0, 0);
    const gl = cyl(0.42, 0.42, 0.02, mat('#dff3ff', { rough: 0.1, emissive: '#cfeaff', ei: 0.3 }), 0, 0, 0, { seg: 28, cast: false }); gl.rotation.x = Math.PI / 2; gl.position.set(0, 0, 0.05);
    mir.add(fr, gl);
    mir.add(cbox(0.16, 0.05, 0.02, '#ffffff', -0.14, 0.14, 0.066, { r: 0.01, rz: 0.6, opacity: 0.7, cast: false }));
    g.add(mir);
    for (const [x, c] of [[-0.5, '#ff8fb1'], [-0.3, '#b9a4f2'], [0.5, '#9fe0c5']]) g.add(box(0.12, 0.22, 0.12, c, x, 0.88, 0.1, { r: 0.04 }));
    for (const x of [-0.4, 0.4]) g.add(cbox(0.14, 0.06, 0.04, '#ffd76a', x, 0.45, 0.31, { r: 0.02 }));
    return g;
  },
  rug() {
    const g = group();
    g.add(box(2.8, 0.04, 1.8, '#ffd0de', 0, 0, 0, { r: 0.02, cast: false }));
    g.add(box(2.4, 0.045, 1.4, '#fff6ea', 0, 0, 0, { r: 0.02, cast: false }));
    g.add(cbox(0.7, 0.05, 0.7, '#ffb3cb', 0, 0.03, 0, { r: 0.02, ry: Math.PI / 4, cast: false }));
    return g;
  },
  plant() {
    const g = group();
    g.add(frustum(0.5, 0.36, 0.44, '#ffffff', 0, 0, 0));
    g.add(box(0.07, 0.7, 0.07, '#7cc77a', 0, 0.4, 0));
    for (const [x, y, z, r] of [[-0.28, 0.9, 0, 0.5], [0.3, 1.05, 0.05, -0.5], [0, 1.3, -0.1, 0.1], [0.1, 0.75, 0.25, -0.2]]) g.add(cbox(0.46, 0.08, 0.36, '#6fc587', x, y, z, { r: 0.03, rz: r }));
    return g;
  },
  floorlamp() {
    const g = group();
    g.add(cyl(0.28, 0.3, 0.06, '#ffffff', 0, 0, 0, { seg: 16 }));
    g.add(box(0.07, 1.7, 0.07, '#ffd76a', 0, 0.05, 0));
    g.add(frustum(0.4, 0.66, 0.5, glow('#fff3c4', '#ffd27a', 0.8, 2.2), 0, 1.7, 0));
    return g;
  },
  desk() {
    const g = group();
    g.add(box(1.8, 0.1, 0.8, '#f3dcc0', 0, 0.78, 0, { r: 0.04 }));
    for (const sx of [-1, 1]) g.add(box(0.1, 0.78, 0.7, '#d2a67e', sx * 0.8, 0, 0, { r: 0.03 }));
    g.add(box(0.5, 0.36, 0.06, '#5c4558', 0.3, 0.9, -0.2, { r: 0.03, rx: -0.15 }));
    g.add(box(0.5, 0.04, 0.34, '#d9cfc5', 0.3, 0.88, 0.1, { r: 0.015 }));
    g.add(cyl(0.1, 0.08, 0.2, '#ff9fbd', -0.5, 0.88, -0.1, { seg: 10 }));
    g.add(box(0.03, 0.26, 0.03, '#8fd0f5', -0.5, 0.98, -0.1, { rz: 0.2 }));
    return g;
  },
  chair() {
    const g = group();
    g.add(box(0.56, 0.1, 0.56, '#ffb3cb', 0, 0.46, 0, { r: 0.05 }));
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) g.add(box(0.07, 0.46, 0.07, '#ffffff', x, 0, z));
    g.add(box(0.56, 0.6, 0.08, '#ffffff', 0, 0.56, -0.24, { r: 0.04 }));
    return g;
  },
  piano() {
    const g = group();
    g.add(box(1.8, 0.9, 1.5, '#ffffff', 0, 0.5, -0.1, { r: 0.12 }));
    g.add(box(1.7, 0.1, 0.4, '#fffdf8', 0, 0.86, 0.72, { r: 0.03 }));
    for (let i = 0; i < 9; i++) g.add(box(0.07, 0.04, 0.22, '#3d3550', -0.72 + i * 0.18, 0.96, 0.66, { cast: false }));
    g.add(box(1.84, 0.08, 1.54, '#ffd0de', 0, 1.4, -0.1, { r: 0.04, rx: -0.5 }));
    for (const [x, z] of [[-0.75, 0.5], [0.75, 0.5], [0, -0.7]]) g.add(box(0.12, 0.5, 0.12, '#ffd76a', x, 0, z, { r: 0.04 }));
    g.add(box(0.8, 0.1, 0.4, '#ffb3cb', 0, 0.44, 1.3, { r: 0.04 }));
    for (const x of [-0.3, 0.3]) g.add(box(0.07, 0.44, 0.07, '#ffffff', x, 0, 1.3));
    return g;
  },
  // 云朵飘窗：加厚坐垫、靠枕与小窗框，作为室内休闲角落。
  windowseat() {
    const g = group();
    g.add(box(1.85, 0.48, 0.82, '#fff6ea', 0, 0.12, 0, { r: 0.13 }));
    g.add(box(1.72, 0.18, 0.75, '#cfe6fb', 0, 0.42, 0.02, { r: 0.12 }));
    g.add(box(1.9, 0.9, 0.14, '#dfe8ef', 0, 0.58, -0.34, { r: 0.06 }));
    for (const [x, c] of [[-0.56, '#ffb3cb'], [0.56, '#b9a4f2']]) g.add(cbox(0.42, 0.28, 0.14, c, x, 0.65, -0.21, { r: 0.08, rz: x < 0 ? -0.12 : 0.12 }));
    g.add(box(1.95, 0.08, 0.08, '#ffffff', 0, 1.08, 0.22, { r: 0.03 }));
    return g;
  },
  // 花漾茶车：可移动的小车、双层托盘和一壶热茶。
  teacart() {
    const g = group();
    for (const x of [-0.34, 0.34]) g.add(box(0.08, 0.9, 0.08, '#d2a67e', x, 0, 0));
    g.add(box(0.82, 0.08, 0.52, '#fff6ea', 0, 0.42, 0, { r: 0.05 }));
    g.add(box(0.72, 0.06, 0.44, '#ffd0de', 0, 0.12, 0, { r: 0.04 }));
    g.add(cyl(0.13, 0.11, 0.16, '#ffffff', -0.16, 0.55, 0.02, { seg: 12 }));
    g.add(cbox(0.05, 0.03, 0.08, '#b9a4f2', -0.16, 0.65, 0.08, { r: 0.02 }));
    g.add(cyl(0.07, 0.07, 0.28, '#ffffff', 0.18, 0.55, -0.08, { seg: 12 }));
    g.add(cbox(0.06, 0.08, 0.06, '#ffb3cb', 0.18, 0.7, -0.08, { r: 0.02 }));
    for (const x of [-0.42, 0.42]) g.add(cyl(0.1, 0.1, 0.06, '#d2a67e', x, -0.03, 0.24, { seg: 12, rx: Math.PI / 2 }));
    return g;
  },
  // 星光八音盒：旋转底座、玻璃罩与会闪烁的小星星。
  musicbox() {
    const g = group();
    g.add(box(0.82, 0.22, 0.82, '#b9a4f2', 0, 0.1, 0, { r: 0.1 }));
    g.add(cbox(0.55, 0.6, 0.55, mat('#dff3ff', { transparent: true, opacity: 0.5, rough: 0.1 }), 0, 0.45, 0, { r: 0.25, cast: false }));
    const star = cbox(0.18, 0.18, 0.08, glow('#ffe27a', '#ffd24f', 0.5, 2.2), 0, 0.52, 0.02, { r: 0.03, rz: Math.PI / 4, cast: false });
    g.add(star);
    g.add(torus(0.27, 0.025, '#ffd76a', 0, 0.23, 0, { rx: Math.PI / 2 }));
    g.userData.tick = (t) => { star.rotation.y = t * 1.5; star.position.y = 0.52 + Math.sin(t * 2.4) * 0.04; };
    return g;
  },
  catbed() {
    const g = group();
    g.add(cyl(0.48, 0.5, 0.26, '#f6c544', 0, 0, 0, { seg: 18 }));
    g.add(cyl(0.38, 0.38, 0.1, '#fffdf8', 0, 0.2, 0, { seg: 18 }));
    for (const sx of [-1, 1]) g.add(frustum(0.04, 0.2, 0.2, '#f6c544', sx * 0.3, 0.26, -0.3, { sz: 0.5 }));
    g.add(cbox(0.16, 0.14, 0.16, '#e8425e', 0.3, 0.33, 0.2, { r: 0.06 }));
    return g;
  },
  fireplace() {
    const g = group();
    g.add(box(1.9, 1.5, 0.6, '#f1e9df', 0, 0, 0, { r: 0.08 }));
    g.add(box(2.1, 0.14, 0.72, '#ffffff', 0, 1.5, 0, { r: 0.05 }));
    g.add(box(1.1, 0.9, 0.3, '#5c4558', 0, 0, 0.18, { r: 0.06, cast: false }));
    const fm = glow('#ffb347', '#ff7a3c', 1.6, 2.6);
    const fl = group(0, 0.1, 0.3);
    fl.add(cbox(0.4, 0.5, 0.14, fm, 0, 0.25, 0, { r: 0.1, cast: false }));
    fl.add(cbox(0.24, 0.3, 0.14, glow('#ffe27a', '#ffd24f', 1.8, 2.8), 0.02, 0.2, 0.03, { r: 0.08, cast: false }));
    g.add(fl);
    g.add(cbox(0.3, 0.3, 0.2, '#ff8fb1', -0.6, 1.8, 0, { r: 0.1 }));
    g.add(cbox(0.2, 0.4, 0.2, '#9fe0c5', 0.6, 1.84, 0, { r: 0.07 }));
    g.userData.tick = (t) => { fl.scale.y = 1 + Math.sin(t * 9) * 0.14; fl.scale.x = 1 + Math.sin(t * 7 + 1) * 0.08; };
    return g;
  },
  dining() {
    const g = group();
    // 两把椅子朝向桌心；桌子留出椅背空间，整套家具仍在旧存档的 2×2 占地内。
    g.add(box(1.6, 0.1, 1.2, '#ffffff', 0, 0.74, 0, { r: 0.08 }));
    g.add(box(0.2, 0.74, 0.2, '#d2a67e', 0, 0, 0, { r: 0.06 }));
    g.add(box(0.78, 0.02, 0.78, '#ffd0de', 0, 0.84, 0, { r: 0.01, cast: false, ry: Math.PI / 4 }));
    g.add(cyl(0.12, 0.09, 0.26, '#8fd0f5', 0, 0.85, 0, { seg: 10 }));
    g.add(cbox(0.2, 0.16, 0.2, '#ff8fb1', 0, 1.2, 0, { r: 0.07 }));
    for (const [z, ry] of [[0.6, Math.PI], [-0.6, 0]]) {
      const c = DECOR_BUILD.chair();
      c.position.set(0, 0, z);
      c.rotation.y = ry;
      g.add(c);
    }
    return g;
  },
  tv() {
    const g = group();
    g.add(box(1.8, 0.5, 0.5, '#fff6ea', 0, 0, 0, { r: 0.07 }));
    for (const x of [-0.45, 0.45]) g.add(cbox(0.7, 0.3, 0.04, '#ffd0de', x, 0.25, 0.26, { r: 0.04 }));
    g.add(box(1.3, 0.8, 0.1, '#3d3550', 0, 0.56, 0, { r: 0.05 }));
    g.add(box(1.16, 0.66, 0.11, glow('#bfe0fb', '#8fd0f5', 0.9, 1.6), 0, 0.63, 0.01, { r: 0.03, cast: false }));
    return g;
  },
});

// 美化度阶段奖励的三件摆设
Object.assign(DECOR_BUILD, {
  // 大喵的小窝：黄色猫耳小木屋，门口一只小鱼碗
  momohut() {
    const g = group();
    g.add(cbox(0.86, 0.1, 0.86, '#f3d9a0', 0, 0, 0, { r: 0.04 }));
    g.add(box(0.74, 0.5, 0.7, '#fff6e6', 0, 0.1, -0.02, { r: 0.08 }));
    g.add(box(0.34, 0.36, 0.06, '#7a5a46', 0, 0.1, 0.33, { r: 0.1 }));
    g.add(gable(0.92, 0.36, 0.86, '#f6c544', 0, 0.6, -0.02));
    for (const sx of [-1, 1]) g.add(frustum(0.03, 0.2, 0.26, '#f6c544', sx * 0.26, 0.86, 0.1, { sz: 0.5 }));
    g.add(cbox(0.2, 0.1, 0.06, '#e8425e', 0, 0.58, 0.42, { r: 0.04 }));
    g.add(cbox(0.08, 0.08, 0.07, '#ffffff', 0, 0.58, 0.425, { r: 0.03 }));
    g.add(cyl(0.13, 0.1, 0.08, '#8fd0f5', 0.34, 0.1, 0.36, { seg: 12 }));
    g.add(cbox(0.1, 0.03, 0.05, '#ff9fbd', 0.34, 0.18, 0.36, { r: 0.012 }));
    return g;
  },
  // 金色许愿喷泉：双层水盘，顶上一颗会转的星
  goldfountain() {
    const g = group();
    const gold = mat('#f2c85a', { rough: 0.28, metal: 0.55 }), gold2 = mat('#ffe9a8', { rough: 0.25, metal: 0.5 });
    g.add(cyl(0.94, 1.0, 0.34, gold, 0, 0, 0, { seg: 24 }));
    g.add(cyl(0.98, 0.98, 0.06, gold2, 0, 0.3, 0, { seg: 24 }));
    g.add(cyl(0.82, 0.82, 0.08, WATER, 0, 0.3, 0, { seg: 24, cast: false }));
    g.add(cyl(0.14, 0.2, 0.82, gold, 0, 0.2, 0, { seg: 12 }));
    g.add(cyl(0.5, 0.2, 0.16, gold2, 0, 0.98, 0, { seg: 16 }));
    g.add(cyl(0.44, 0.44, 0.05, WATER, 0, 1.12, 0, { seg: 16, cast: false }));
    g.add(cyl(0.08, 0.12, 0.4, gold, 0, 1.12, 0, { seg: 10 }));
    g.add(cyl(0.24, 0.1, 0.1, gold2, 0, 1.5, 0, { seg: 12 }));
    const star = group(0, 1.86, 0);
    const sm = glow('#fff3a8', '#ffd24f', 0.5, 2.4);
    for (const rz of [0, Math.PI / 4]) star.add(cbox(0.24, 0.24, 0.1, sm, 0, 0, 0, { r: 0.03, rz }));
    g.add(star);
    const drops = [];
    const dm = mat('#fff3c4', { rough: 0.1, opacity: 0.9, emissive: '#ffe27a', ei: 0.4 });
    for (let i = 0; i < 14; i++) {
      const m = cbox(0.07, 0.07, 0.07, dm, 0, 0, 0, { r: 0.025, ...ns });
      m.userData = { a: (i / 14) * Math.PI * 2, t: i / 14 };
      g.add(m);
      drops.push(m);
    }
    g.userData.tick = (t) => {
      star.rotation.y = t * 1.2;
      star.position.y = 1.86 + Math.sin(t * 2) * 0.04;
      for (const m of drops) {
        const u = (t * 0.6 + m.userData.t) % 1, r = 0.1 + u * 0.6;
        m.position.set(Math.cos(m.userData.a) * r, 1.3 + Math.sin(u * Math.PI) * 0.36 - u * 0.9, Math.sin(m.userData.a) * r);
      }
    };
    return g;
  },
  // 风向标：金色小公鸡跟着风转
  vane() {
    const g = group();
    const gold = mat('#f2c85a', { rough: 0.3, metal: 0.5 });
    g.add(cyl(0.2, 0.26, 0.12, STONE_D, 0, 0, 0, { seg: 12 }));
    g.add(cyl(0.035, 0.035, 1.5, '#8a8f9c', 0, 0.1, 0, { seg: 8 }));
    for (const [w, d, t] of [[0.6, 0.04, 'N'], [0.04, 0.6, 'E']]) g.add(cbox(w, 0.04, d, '#8a8f9c', 0, 1.2, 0, { r: 0.015 }));
    for (const [x, z] of [[0.33, 0], [-0.33, 0], [0, 0.33], [0, -0.33]]) g.add(cbox(0.09, 0.09, 0.09, gold, x, 1.17, z, { r: 0.03 }));
    const top = group(0, 1.62, 0);
    top.add(cbox(0.7, 0.04, 0.04, gold, 0, 0, 0, { r: 0.015 }));
    top.add(frustum(0.02, 0.14, 0.18, gold, 0.42, -0.07, 0, { sz: 0.3, rz: -Math.PI / 2 }));
    top.add(cbox(0.3, 0.24, 0.07, gold, -0.06, 0.16, 0, { r: 0.08 }));
    top.add(cbox(0.14, 0.14, 0.07, gold, 0.1, 0.34, 0, { r: 0.05 }));
    top.add(cbox(0.08, 0.05, 0.05, '#f0935a', 0.2, 0.33, 0, { r: 0.015 }));
    top.add(cbox(0.1, 0.07, 0.05, '#e8425e', 0.1, 0.44, 0, { r: 0.02 }));
    top.add(cbox(0.2, 0.2, 0.05, gold, -0.28, 0.24, 0, { r: 0.03, rz: 0.5 }));
    g.add(top);
    g.userData.tick = (t) => { top.rotation.y = Math.sin(t * 0.5) * 1.1 + Math.sin(t * 1.7) * 0.25; };
    return g;
  },
});

// 诺诺伊家的特有家具与玩偶：只送不卖
Object.assign(DECOR_BUILD, {
  // 纸鹤风铃：小木架上挂着一串折纸鹤
  n_mobile() {
    const g = group();
    g.add(cyl(0.26, 0.3, 0.08, '#d2a67e', 0, 0, 0, { seg: 14 }));
    g.add(box(0.06, 1.7, 0.06, '#c99d77', 0, 0.08, 0, { r: 0.02 }));
    g.add(cbox(0.7, 0.05, 0.05, '#c99d77', 0.26, 1.72, 0, { r: 0.02 }));
    const spin = group(0.5, 1.7, 0);
    spin.add(torus(0.24, 0.018, '#d9b46a', 0, -0.08, 0, { rx: Math.PI / 2 }));
    const birds = [];
    ['#ffffff', '#ffe9a8', '#ffc2d6', '#cfe6fb', '#ffffff'].forEach((c, i) => {
      const a = (i / 5) * Math.PI * 2, len = 0.3 + (i % 3) * 0.14;
      const b = group(Math.cos(a) * 0.24, -0.08 - len, Math.sin(a) * 0.24);
      b.add(cbox(0.01, len, 0.01, '#d9b46a', 0, 0, 0, ns));
      b.add(cbox(0.16, 0.05, 0.06, c, 0, -0.03, 0, { r: 0.015 }));
      b.add(cbox(0.07, 0.02, 0.2, c, 0, 0, 0, { r: 0.008, rx: 0.3 }));
      b.add(cbox(0.08, 0.03, 0.03, c, 0.1, 0.03, 0, { r: 0.01, rz: 0.7 }));
      spin.add(b); birds.push(b);
    });
    g.add(spin);
    g.userData.tick = (t) => { spin.rotation.y = t * 0.5; birds.forEach((b, i) => { b.rotation.z = Math.sin(t * 1.4 + i) * 0.15; }); };
    return g;
  },
  // 愿望瓶小夜灯：玻璃瓶里一团暖光，瓶口系着红绳
  n_lamp() {
    const g = group();
    g.add(cyl(0.2, 0.24, 0.07, '#d2a67e', 0, 0, 0, { seg: 12 }));
    g.add(cyl(0.2, 0.2, 0.36, mat('#dff3ff', { rough: 0.1, opacity: 0.45 }), 0, 0.07, 0, { seg: 12, cast: false }));
    g.add(cyl(0.1, 0.19, 0.12, mat('#dff3ff', { rough: 0.1, opacity: 0.45 }), 0, 0.43, 0, { seg: 12, cast: false }));
    g.add(cyl(0.1, 0.1, 0.07, '#b3855f', 0, 0.55, 0, { seg: 10 }));
    g.add(torus(0.105, 0.016, '#e8425e', 0, 0.52, 0, { rx: Math.PI / 2 }));
    const core = cbox(0.16, 0.16, 0.16, glow('#fff3c4', '#ffd76a', 0.9, 2.6), 0, 0.2, 0, { r: 0.06, ...ns });
    g.add(core);
    for (const [x, y, z] of [[0.07, 0.34, 0.03], [-0.06, 0.3, -0.05], [0.02, 0.4, -0.06]]) g.add(cbox(0.04, 0.04, 0.04, glow('#ffffff', '#fff3a8', 1, 2), x, y, z, { r: 0.012, ...ns }));
    g.userData.tick = (t) => { core.position.y = 0.2 + Math.sin(t * 1.6) * 0.03; core.rotation.y = t; };
    return g;
  },
  // 大喵玩偶：坐着的布偶，黄色猫耳兜帽和红领结
  n_momo() {
    const g = group(0, 0.21, 0);
    g.add(cbox(0.5, 0.42, 0.42, '#fffdf8', 0, 0, 0, { r: 0.16 }));
    g.add(cbox(0.56, 0.44, 0.48, '#fffdf8', 0, 0.36, 0, { r: 0.18 }));
    g.add(cbox(0.6, 0.3, 0.5, '#f6c544', 0, 0.56, -0.03, { r: 0.14 }));
    for (const sx of [-1, 1]) {
      g.add(frustum(0.04, 0.2, 0.2, '#f6c544', sx * 0.2, 0.68, -0.02, { sz: 0.5 }));
      g.add(cbox(0.07, 0.035, 0.02, '#5b4a48', sx * 0.12, 0.52, 0.245, { r: 0.012, ...ns }));
      g.add(cbox(0.14, 0.14, 0.16, '#fffdf8', sx * 0.24, 0.02, 0.2, { r: 0.06 }));
      g.add(cbox(0.12, 0.2, 0.12, '#fffdf8', sx * 0.3, 0.2, 0.08, { r: 0.05 }));
    }
    g.add(cbox(0.06, 0.03, 0.02, '#e88a7a', 0, 0.44, 0.245, { r: 0.01, ...ns }));
    g.add(cbox(0.2, 0.1, 0.06, '#e8425e', 0, 0.36, 0.23, { r: 0.04 }));
    g.add(cbox(0.1, 0.1, 0.03, '#b98b6b', 0, 0.16, 0.215, { r: 0.012, rz: 0.78, ...ns }));
    const w = group(); w.add(g);
    return w;
  },
  // 齿轮工具架：洞洞板上挂着扳手、锤子和几枚会转的齿轮
  n_shelf() {
    const g = group();
    for (const sx of [-1, 1]) g.add(box(0.07, 1.5, 0.07, '#a67c58', sx * 0.4, 0, 0, { r: 0.02 }));
    g.add(box(0.86, 0.9, 0.05, '#e9dcc6', 0, 0.56, 0, { r: 0.02 }));
    g.add(cbox(0.9, 0.06, 0.26, '#c99d77', 0, 0.44, 0.1, { r: 0.02 }));
    const gears = [];
    for (const [x, y, r, c] of [[-0.2, 1.14, 0.13, '#d9b46a'], [0.02, 1.02, 0.1, '#cfd6e0'], [0.22, 1.2, 0.09, '#d9b46a']]) {
      const w = group(x, y, 0.05);
      w.add(cyl(r, r, 0.05, mat(c, { rough: 0.3, metal: 0.5 }), 0, -0.025, 0, { seg: 10, rx: Math.PI / 2 }));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; w.add(cbox(0.05, 0.05, 0.05, c, Math.cos(a) * (r + 0.02), Math.sin(a) * (r + 0.02), 0, { r: 0.01, rz: a })); }
      g.add(w); gears.push(w);
    }
    g.add(cbox(0.05, 0.3, 0.04, '#cfd6e0', -0.26, 0.66, 0.05, { r: 0.015, rz: 0.2 }));
    g.add(cbox(0.12, 0.08, 0.04, '#cfd6e0', -0.29, 0.84, 0.05, { r: 0.02, rz: 0.2 }));
    g.add(cbox(0.04, 0.28, 0.04, '#a67c58', 0.24, 0.66, 0.05, { r: 0.012 }));
    g.add(cbox(0.16, 0.09, 0.07, '#8a8f9c', 0.24, 0.83, 0.05, { r: 0.02 }));
    for (const [x, c] of [[-0.26, '#e8425e'], [-0.06, '#7fc4f5'], [0.14, '#ffd76a']]) g.add(cbox(0.14, 0.14, 0.14, c, x, 0.5, 0.12, { r: 0.04 }));
    g.userData.tick = (t) => gears.forEach((w, i) => { w.rotation.z = t * (i % 2 ? -1.2 : 0.9); });
    return g;
  },
  // 花格屏风：三扇，木框里是镂空的格子和一片浅色纱
  n_screen() {
    const g = group();
    const PW = 0.52, HH = 1.86, FR = '#a67c58', LAT = '#c99d77';
    const panel = () => {
      const p = group();
      for (const x of [0, PW]) p.add(box(0.055, HH, 0.055, FR, x, 0, 0, { r: 0.018 }));
      for (const y of [0.1, 0.62, HH - 0.03]) p.add(cbox(PW, 0.055, 0.05, FR, PW / 2, y, 0, { r: 0.015 }));
      p.add(cbox(PW - 0.06, 0.46, 0.028, '#f6e6d0', PW / 2, 0.36, 0, { r: 0.008 }));
      p.add(cbox(0.13, 0.13, 0.034, '#e8425e', PW / 2, 0.36, 0, { r: 0.02, rz: Math.PI / 4 }));
      p.add(cbox(PW - 0.06, HH - 0.7, 0.014, mat('#fff8ee', { opacity: 0.62 }), PW / 2, (HH + 0.62) / 2 - 0.02, 0, { cast: false }));
      for (const x of [PW / 3, (PW * 2) / 3]) p.add(cbox(0.022, HH - 0.7, 0.03, LAT, x, (HH + 0.62) / 2 - 0.02, 0, { cast: false }));
      for (const y of [0.95, 1.28, 1.6]) p.add(cbox(PW - 0.06, 0.022, 0.03, LAT, PW / 2, y, 0, { cast: false }));
      return p;
    };
    // 沿着折线一扇扇接起来，折角一正一反
    let x = -0.95, z = 0.1;
    [0.42, -0.42, 0.42, -0.42].forEach((ang) => {
      const p = panel();
      p.position.set(x, 0, z);
      p.rotation.y = ang;
      g.add(p);
      x += Math.cos(ang) * PW; z -= Math.sin(ang) * PW;
    });
    return g;
  },
  // 纸鹤玩偶：软乎乎的白色布纸鹤，腮上两点红晕
  n_crane() {
    const g = group(0, 0.13, 0);
    g.add(cbox(0.56, 0.3, 0.34, '#ffffff', 0, 0.02, 0, { r: 0.13 }));
    g.add(cbox(0.16, 0.44, 0.16, '#ffffff', 0.26, 0.2, 0, { r: 0.07, rz: -0.5 }));
    g.add(cbox(0.2, 0.18, 0.18, '#ffffff', 0.42, 0.54, 0, { r: 0.07 }));
    g.add(cbox(0.14, 0.06, 0.07, '#ffd76a', 0.56, 0.6, 0, { r: 0.02 }));
    g.add(cbox(0.14, 0.34, 0.12, '#f3f0ea', -0.3, 0.22, 0, { r: 0.05, rz: 0.6 }));
    for (const sz of [-1, 1]) {
      g.add(cbox(0.34, 0.07, 0.3, '#f3f0ea', -0.02, 0.24, sz * 0.26, { r: 0.03, rx: -sz * 0.5 }));
      g.add(cbox(0.03, 0.03, 0.02, '#5b4a48', 0.47, 0.64, sz * 0.095, { r: 0.01, ...ns }));
      g.add(cbox(0.05, 0.03, 0.02, '#ffb3cb', 0.42, 0.58, sz * 0.095, { r: 0.01, ...ns }));
    }
    const w = group(); w.add(g);
    return w;
  },
  // 诺诺伊的工作台：台钳、图纸、台灯和一只修到一半的小纸鹤
  n_bench() {
    const g = group();
    g.add(box(1.8, 0.1, 0.8, '#c99d77', 0, 0.74, 0, { r: 0.03 }));
    for (const [x, z] of [[-0.8, 0.3], [0.8, 0.3], [-0.8, -0.3], [0.8, -0.3]]) g.add(box(0.1, 0.76, 0.1, '#a67c58', x, 0, z, { r: 0.03 }));
    g.add(box(1.5, 0.06, 0.6, '#b3855f', 0, 0.2, 0, { r: 0.02 }));
    g.add(box(0.4, 0.26, 0.4, '#3d4f7a', -0.5, 0.26, 0, { r: 0.05 }));
    g.add(cbox(0.6, 0.02, 0.44, '#cfe6fb', 0.1, 0.845, 0.04, { r: 0.008, ry: 0.15 }));
    for (const [x, z, w] of [[0.02, 0.0, 0.3], [0.12, 0.1, 0.2], [0.2, -0.08, 0.24]]) g.add(cbox(w, 0.006, 0.012, '#ffffff', x, 0.858, z, { ry: 0.15, ...ns }));
    g.add(cbox(0.2, 0.14, 0.16, '#8a8f9c', -0.68, 0.84, 0.18, { r: 0.03 }));
    g.add(cbox(0.06, 0.1, 0.24, '#5b6272', -0.68, 0.98, 0.18, { r: 0.02 }));
    g.add(cyl(0.08, 0.1, 0.04, '#e8425e', 0.68, 0.84, -0.2, { seg: 10 }));
    g.add(cbox(0.03, 0.4, 0.03, '#e8425e', 0.68, 0.88, -0.2, { rz: 0.3 }));
    g.add(cbox(0.2, 0.08, 0.14, '#e8425e', 0.58, 1.26, -0.2, { r: 0.04, rz: 0.3 }));
    g.add(cbox(0.12, 0.03, 0.1, glow('#fff3c4', '#ffd76a', 0.6, 2.2), 0.56, 1.22, -0.2, { r: 0.01, ...ns }));
    g.add(cbox(0.26, 0.08, 0.12, '#ffffff', -0.2, 0.86, -0.18, { r: 0.03 }));
    g.add(cbox(0.14, 0.04, 0.04, '#ffffff', -0.06, 0.94, -0.18, { r: 0.012, rz: 0.7 }));
    g.add(cbox(0.12, 0.012, 0.22, '#ffffff', -0.2, 0.91, -0.18, { r: 0.006 }));
    const gm = mat('#d9b46a', { rough: 0.3, metal: 0.5 });
    for (const [x, z] of [[0.36, 0.24], [0.5, 0.16]]) g.add(cyl(0.07, 0.07, 0.03, gm, x, 0.84, z, { seg: 8 }));
    return g;
  },
  // 拼布懒人沙发：一只大大的豆袋，几块不同花色的布拼起来
  n_bean() {
    const g = group(0, 0.2, 0);
    g.add(cbox(1.1, 0.4, 1.0, '#ffd0de', 0, 0, 0, { r: 0.18 }));
    g.add(cbox(1.0, 0.56, 0.5, '#ffc2d6', 0, 0.26, -0.3, { r: 0.2 }));
    g.add(cbox(0.5, 0.06, 0.46, '#cfe6fb', -0.24, 0.38, 0.16, { r: 0.03 }));
    g.add(cbox(0.46, 0.06, 0.46, '#ffe9a8', 0.26, 0.38, 0.16, { r: 0.03 }));
    g.add(cbox(0.42, 0.06, 0.26, '#c9ecd2', -0.2, 0.55, -0.3, { r: 0.03 }));
    g.add(cbox(0.4, 0.06, 0.26, '#ffffff', 0.24, 0.55, -0.3, { r: 0.03 }));
    g.add(cbox(0.34, 0.3, 0.14, '#fff6ea', 0.0, 0.48, -0.08, { r: 0.1, rx: -0.3 }));
    g.add(cbox(0.1, 0.1, 0.02, '#e8425e', 0, 0.5, 0.0, { r: 0.02, rz: 0.78, rx: -0.3 }));
    const w = group(); w.add(g);
    return w;
  },
});

// 新增的庭院与室内家具：保持 1～2 格占地，模型轮廓留出正面通道，避免扩建后再次堵门。
Object.assign(DECOR_BUILD, {
  hammock() {
    const g = group();
    for (const x of [-0.78, 0.78]) {
      g.add(box(0.12, 1.42, 0.12, WOOD_D, x, 0.68, 0, { r: 0.04 }));
      g.add(cbox(0.34, 0.1, 0.34, '#ffd0de', x, 1.42, 0, { r: 0.05 }));
    }
    const cloth = cbox(1.32, 0.12, 0.5, '#ffb3cb', 0, 0.78, 0, { r: 0.14, rz: -0.06 });
    g.add(cloth);
    for (const x of [-0.68, 0.68]) g.add(cbox(0.05, 0.08, 0.08, '#ffffff', x, 1.12, 0, { r: 0.02 }));
    return g;
  },
  pond() {
    const g = group();
    g.add(box(1.86, 0.12, 1.86, '#c9a27a', 0, 0.03, 0, { r: 0.16 }));
    g.add(cbox(1.56, 0.06, 1.42, mat('#9be0f0', { rough: 0.12, opacity: 0.9 }), 0, 0.14, 0, { r: 0.34, cast: false, receive: false }));
    for (const [x, z, s] of [[-0.45, -0.18, 0.24], [0.35, 0.36, 0.2], [0.5, -0.45, 0.16]]) {
      const leaf = cbox(s, 0.035, s, '#8fd694', x, 0.19, z, { r: s * 0.35, ry: 0.35, cast: false });
      g.add(leaf);
    }
    g.add(cbox(0.12, 0.36, 0.12, '#72c58a', -0.42, 0.34, 0.32, { r: 0.05 }), cbox(0.22, 0.16, 0.22, '#ffd0de', -0.42, 0.56, 0.32, { r: 0.12 }));
    return g;
  },
  garden_table() {
    const g = group();
    g.add(cyl(0.72, 0.72, 0.12, '#d2a67e', 0, 0.8, 0, { seg: 18 }), cyl(0.16, 0.16, 0.78, WOOD_D, 0, 0.4, 0, { seg: 12 }));
    for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) {
      const c = DECOR_BUILD.chair(); c.position.set(x, 0, z); c.scale.setScalar(0.82); g.add(c);
    }
    g.add(cbox(0.22, 0.16, 0.22, '#ffb3cb', 0, 0.93, 0, { r: 0.06 }), cbox(0.14, 0.22, 0.14, '#9be0f0', 0, 1.08, 0, { r: 0.05 }));
    return g;
  },
  wardrobe() {
    const g = group();
    // box 的 y 是底部高度，门板/装饰的 y 是中心高度。
    g.add(box(1.74, 2.55, 0.58, '#fff6ea', 0, 0, 0, { r: 0.08 }), cbox(1.58, 2.18, 0.08, '#ffd0de', 0, 1.28, -0.31, { r: 0.03, cast: false }));
    g.add(cbox(0.04, 2.2, 0.05, '#f2a0bb', 0, 1.27, -0.36, { r: 0.01 }), cbox(0.08, 0.08, 0.08, '#ffd76a', -0.18, 1.26, -0.4, { r: 0.03 }), cbox(0.08, 0.08, 0.08, '#ffd76a', 0.18, 1.26, -0.4, { r: 0.03 }));
    g.add(cbox(0.66, 0.18, 0.04, '#ffffff', 0, 2.05, -0.4, { r: 0.02, cast: false }), cbox(0.18, 0.3, 0.04, '#b9a4f2', -0.42, 1.18, -0.4, { r: 0.02, cast: false }), cbox(0.18, 0.28, 0.04, '#9fe0c5', 0.42, 1.2, -0.4, { r: 0.02, cast: false }));
    return g;
  },
  ottoman() {
    const g = group();
    g.add(cbox(0.78, 0.42, 0.72, '#cfe6fb', 0, 0.28, 0, { r: 0.17 }), cbox(0.58, 0.09, 0.56, '#ffd0de', 0, 0.5, -0.02, { r: 0.14 }));
    for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) g.add(cbox(0.08, 0.12, 0.08, '#ffffff', x, 0.05, z, { r: 0.03 }));
    return g;
  },
  sideboard() {
    const g = group();
    g.add(box(1.8, 0.78, 0.6, '#fff6ea', 0, 0.38, 0, { r: 0.06 }), box(1.9, 0.1, 0.68, '#ffd0de', 0, 0.82, 0, { r: 0.04 }));
    for (const x of [-0.62, 0, 0.62]) {
      g.add(box(0.48, 0.52, 0.05, '#ffffff', x, 0.38, -0.33, { r: 0.025, cast: false }), cbox(0.06, 0.06, 0.04, '#ffd76a', x, 0.4, -0.38, { r: 0.02 }));
    }
    g.add(cbox(0.34, 0.16, 0.28, '#b9a4f2', -0.48, 0.96, 0, { r: 0.06 }), cbox(0.22, 0.24, 0.22, '#9fe0c5', 0.12, 1.0, 0, { r: 0.05 }), cbox(0.18, 0.2, 0.18, '#ffb3cb', 0.48, 0.98, 0, { r: 0.05 }));
    return g;
  },
  // 甜心蜂箱（I2）：奶油黄圆角层叠木箱与蜂蜜滴落装饰，带两只轻盈环绕的小蜜蜂
  beehive() {
    const g = group();
    for (const [x, z] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) g.add(box(0.08, 0.28, 0.08, WOOD_D, x, 0, z, { r: 0.02 }));
    g.add(box(0.68, 0.32, 0.58, '#fff4d2', 0, 0.24, 0, { r: 0.08 }));
    g.add(box(0.62, 0.3, 0.54, '#ffe596', 0, 0.54, 0, { r: 0.08 }));
    g.add(cbox(0.76, 0.16, 0.66, '#f6b94e', 0, 0.88, 0, { r: 0.07 }));
    g.add(cbox(0.16, 0.16, 0.06, '#5b4232', 0, 0.44, 0.28, { r: 0.07 }));
    g.add(cbox(0.24, 0.06, 0.14, WOOD, 0, 0.33, 0.32, { r: 0.02 }));
    const bees = [-1, 1].map((s, i) => {
      const b = group(s * 0.38, 0.95 + i * 0.14, 0.18);
      b.add(cbox(0.11, 0.08, 0.08, '#ffd24f', 0, 0, 0, { r: 0.035 }));
      b.add(cbox(0.03, 0.085, 0.085, '#4a3b32', 0, 0, 0, { r: 0.01 }));
      b.add(cbox(0.05, 0.04, 0.13, WHITE, 0, 0.05, 0, { r: 0.015, ...ns }));
      g.add(b);
      return b;
    });
    g.userData.tick = (t) => bees.forEach((b, i) => {
      const a = t * 2.2 + i * Math.PI;
      b.position.set(Math.cos(a) * 0.38, 0.96 + Math.sin(t * 4 + i) * 0.06, Math.sin(a) * 0.34);
      b.rotation.y = -a;
    });
    return g;
  },
  // 大喵稻草人（I2）：戴草帽、穿背带裤的圆角方块大喵守护者
  scarecrow() {
    const g = group();
    g.add(cyl(0.28, 0.32, 0.08, WOOD_D, 0, 0, 0, { seg: 14 }));
    g.add(box(0.09, 1.35, 0.09, WOOD, 0, 0.06, 0, { r: 0.03 }));
    g.add(cbox(0.92, 0.08, 0.08, WOOD, 0, 0.92, 0, { r: 0.03 }));
    g.add(cbox(0.46, 0.44, 0.32, '#8fb8ed', 0, 0.78, 0, { r: 0.12 }));
    g.add(cbox(0.52, 0.22, 0.24, '#ff9fbd', 0, 0.94, 0, { r: 0.08 }));
    g.add(cbox(0.44, 0.38, 0.38, '#fffaf2', 0, 1.24, 0, { r: 0.14 }));
    for (const sx of [-1, 1]) {
      g.add(frustum(0.03, 0.14, 0.14, '#f6c85f', sx * 0.15, 1.44, 0, { sz: 0.6 }));
      g.add(cbox(0.05, 0.03, 0.02, '#4a3b32', sx * 0.1, 1.26, 0.195, { r: 0.01, ...ns }));
      g.add(cbox(0.06, 0.03, 0.02, '#ffb3cb', sx * 0.15, 1.2, 0.195, { r: 0.01, ...ns }));
    }
    g.add(cyl(0.38, 0.42, 0.06, '#f2cc76', 0, 1.42, 0, { seg: 16 }));
    g.add(cyl(0.22, 0.25, 0.16, '#f2cc76', 0, 1.48, 0, { seg: 16 }));
    g.add(cyl(0.23, 0.255, 0.04, '#e84868', 0, 1.49, 0, { seg: 16 }));
    return g;
  },
  // 青苔汀步石（J2）：自然错落的圆润石板配嫩绿青苔，under 层可走人可叠放
  step_moss() {
    const g = group();
    g.add(cbox(0.56, 0.045, 0.44, STONE, -0.08, 0.022, -0.06, { r: 0.14, ry: 0.2, ...ns }));
    g.add(cbox(0.38, 0.04, 0.32, STONE_D, 0.18, 0.02, 0.18, { r: 0.11, ry: -0.35, ...ns }));
    g.add(cbox(0.18, 0.05, 0.14, LEAF, -0.22, 0.03, 0.12, { r: 0.05, ...ns }));
    g.add(cbox(0.14, 0.045, 0.12, LEAF_L, 0.22, 0.028, -0.14, { r: 0.04, ...ns }));
    return g;
  },
  // 大喵圆绒垫（J2，1×1）
  rug_cat() {
    const g = group();
    g.add(cyl(0.44, 0.44, 0.03, '#fff6e4', 0, 0, 0, { seg: 20, ...ns }));
    g.add(cyl(0.38, 0.38, 0.034, '#ffe5a3', 0, 0.002, 0, { seg: 20, ...ns }));
    for (const sx of [-1, 1]) {
      g.add(cbox(0.16, 0.032, 0.16, '#f6c85f', sx * 0.26, 0.016, -0.28, { r: 0.05, ry: sx * 0.35, ...ns }));
      g.add(cbox(0.08, 0.036, 0.05, '#ff9fbd', sx * 0.18, 0.019, 0.06, { r: 0.02, ...ns }));
    }
    return g;
  },
  // 云朵长绒毯（J2，2×1）
  rug_cloud() {
    const g = group();
    g.add(cbox(1.76, 0.03, 0.84, '#d8eeff', 0, 0.015, 0, { r: 0.26, ...ns }));
    g.add(cbox(1.52, 0.035, 0.64, WHITE, 0, 0.019, 0, { r: 0.22, ...ns }));
    for (const x of [-0.46, 0, 0.46]) g.add(cbox(0.46, 0.038, 0.46, '#fffaf4', x, 0.021, 0, { r: 0.18, ...ns }));
    return g;
  },
  // 花瓣茶几毯（J2，2×2）
  rug_petal() {
    const g = group();
    g.add(cbox(1.82, 0.028, 1.82, '#ffd6e5', 0, 0.014, 0, { r: 0.36, ...ns }));
    g.add(cbox(1.48, 0.032, 1.48, '#fff3f7', 0, 0.018, 0, { r: 0.28, ...ns }));
    g.add(cyl(0.32, 0.32, 0.036, '#ffe27a', 0, 0.002, 0, { seg: 18, ...ns }));
    return g;
  },
  // 樱花编织大毯（J2，3×3）
  rug_sakura() {
    const g = group();
    g.add(cbox(2.82, 0.028, 2.82, '#ffc2d6', 0, 0.014, 0, { r: 0.32, ...ns }));
    g.add(cbox(2.48, 0.032, 2.48, '#fff7fa', 0, 0.017, 0, { r: 0.24, ...ns }));
    g.add(cbox(1.68, 0.035, 1.68, '#ffe6ef', 0, 0.019, 0, { r: 0.18, ...ns }));
    for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) {
      g.add(cbox(0.24, 0.038, 0.24, '#ff8fb1', x, 0.021, z, { r: 0.08, ry: Math.PI / 4, ...ns }));
    }
    return g;
  },
  // 玻璃插花瓶（J3，1×1）：通透圆角玻璃瓶 + 原木小底座 + 可切换插花
  flower_vase() {
    const g = group();
    g.add(cyl(0.26, 0.28, 0.06, WOOD, 0, 0, 0, { seg: 16 }));
    const glass = mat('#d8f2ff', { rough: 0.15, opacity: 0.72, transparent: true });
    g.add(cyl(0.18, 0.22, 0.34, glass, 0, 0.06, 0, { seg: 16 }));
    g.add(cyl(0.12, 0.18, 0.14, glass, 0, 0.4, 0, { seg: 16 }));
    g.add(torus(0.12, 0.025, '#ffffff', 0, 0.54, 0, { rx: Math.PI / 2 }));
    const holder = group(0, 0.18, 0);
    holder.name = 'vase-flower-holder';
    holder.add(vaseBouquet('rose'));
    g.add(holder);
    return g;
  },
  // 回忆画架（J3，1×1）：原木三角画架 + 暖暖小镇风景相框（支持切换画作主题）
  photo_frame() {
    const g = group();
    for (const sx of [-1, 1]) g.add(box(0.06, 1.38, 0.06, WOOD_D, sx * 0.26, 0, 0.08, { r: 0.02, rz: -sx * 0.08, rx: -0.14 }));
    g.add(box(0.06, 1.32, 0.06, WOOD_D, 0, 0, -0.24, { r: 0.02, rx: 0.24 }));
    g.add(cbox(0.72, 0.06, 0.12, WOOD, 0, 0.58, 0.14, { r: 0.02 }));
    const canvas = group(0, 0.92, 0.08);
    canvas.name = 'frame-canvas';
    canvas.rotation.x = -0.14;
    canvas.add(cbox(0.68, 0.56, 0.06, '#fff8ee', 0, 0, 0, { r: 0.04 }));
    const sky = cbox(0.58, 0.46, 0.02, '#bfe6ff', 0, 0, 0.032, { r: 0.02, ...ns });
    sky.name = 'frame-sky';
    const hill = cbox(0.56, 0.18, 0.025, '#98de9b', 0, -0.13, 0.036, { r: 0.02, ...ns });
    hill.name = 'frame-hill';
    const sun = cbox(0.14, 0.14, 0.03, '#ffe066', 0.16, 0.1, 0.04, { r: 0.05, ...ns });
    sun.name = 'frame-sun';
    canvas.add(sky, hill, sun);
    g.add(canvas);
    return g;
  },
});

// 巨大作物摆件共用成熟作物模型，缩放只发生在摆件本身，不复制纹理或材质。
for (const cropId of ['pumpkin', 'sunflower', 'rose', 'moonflower']) DECOR_BUILD['giant_' + cropId] = () => {
  const g = group();
  const base = cbox(0.72, 0.12, 0.72, '#d2a67e', 0, 0.06, 0, { r: 0.08 });
  const crop = cropModel(cropId, 3);
  crop.position.y = 0.08;
  crop.scale.setScalar(2.45);
  g.add(base, crop);
  g.userData.giantCrop = cropId;
  return g;
};

export function buildDecor(id) {
  const g = id.startsWith('yard_') ? buildYardBuilding(id) : (HOUSE_FURNITURE_BUILD[id] || DECOR_BUILD[id])();
  g.userData.decorId = id;
  g.userData.applyVariant = (entry) => applyDecorVariant(g, entry);
  return g;
}

const VASE_TONES = {
  daisy: ['#ffffff', '#ffd34e'],
  tulip: ['#ff8fb1', '#ff5d88'],
  lavender: ['#b9a4f2', '#957be3'],
  rose: ['#f2546b', '#ffd6e2'],
  sunflower: ['#ffd24f', '#7a4d2b'],
  wreath: ['#ff9fbd', '#ffe27a'],
};
function vaseBouquet(kind = 'rose') {
  const [c1, c2] = VASE_TONES[kind] || VASE_TONES.rose;
  const g = group();
  for (const [dx, dz, hgt, col] of [[-0.06, 0.03, 0.42, c1], [0.06, -0.03, 0.46, c2], [0, 0.05, 0.38, c1]]) {
    g.add(box(0.035, hgt, 0.035, LEAF_D, dx, 0, dz, { r: 0.01 }));
    g.add(cbox(0.14, 0.12, 0.14, col, dx, hgt + 0.04, dz, { r: 0.05 }));
  }
  return g;
}

// 为摆件应用色盘换色（J4）、花瓶插花（J3）或画架主题（J3），复用 mat 缓存材质以支持静态合批。
const SWATCH_HEX = [null, '#ff9fbd', '#8fd6b8'];
export function applyDecorVariant(root, entry) {
  if (!root || !entry) return;
  if (entry.id === 'flower_vase' && entry.flower) {
    let holder = null;
    root.traverse((n) => { if (n.name === 'vase-flower-holder') holder = n; });
    if (holder && VASE_TONES[entry.flower] && holder.userData.flowerId !== entry.flower) {
      holder.clear();
      holder.add(vaseBouquet(entry.flower));
      holder.userData.flowerId = entry.flower;
    }
  }
  if (entry.id === 'photo_frame' && entry.photo !== undefined) {
    const theme = PHOTO_THEMES[photoThemeIndex(entry.photo)];
    if (theme) root.traverse((n) => {
      if (n.name === 'frame-sky') n.material = mat(theme.sky, { rough: 0.6 });
      if (n.name === 'frame-hill') n.material = mat(theme.hill, { rough: 0.6 });
      if (n.name === 'frame-sun') n.material = mat(theme.sun, { emissive: theme.sun, ei: 0.35 });
    });
  }
  const swatchIdx = Number(entry.swatch || 0);
  const target = root._furnitureShape?.model || root;
  if ((target.userData.appliedSwatch || 0) === swatchIdx) return;
  target.userData.appliedSwatch = swatchIdx;
  const toneHex = SWATCH_HEX[swatchIdx];
  const mainTone = toneHex ? new THREE.Color(toneHex) : null;
  target.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material?.color) return;
    if (!mesh.userData._origMat) mesh.userData._origMat = mesh.material;
    if (!mainTone) {
      mesh.material = mesh.userData._origMat;
      return;
    }
    const baseMat = mesh.userData._origMat;
    const hsl = {};
    baseMat.color.getHSL(hsl);
    if (hsl.s > 0.14 && hsl.l > 0.25 && hsl.l < 0.94) {
      const hex = '#' + new THREE.Color(baseMat.color).lerp(mainTone, 0.58).getHexString();
      mesh.material = mat(hex, { rough: baseMat.roughness, metal: baseMat.metalness, opacity: baseMat.opacity, side: baseMat.side });
    }
  });
}

// 农场旁的回收小铺：收作物和闲置家具
export function shopRecycle() {
  const g = group();
  g.add(box(5.6, 0.26, 3.8, STONE_D, 0, 0, -0.2, { r: 0.1 }));
  g.add(box(5, 2.6, 3, '#f3fbf4', 0, 0.22, -0.3, { r: 0.14 }));
  g.add(box(5.02, 0.6, 3.02, '#bfe8cf', 0, 0.22, -0.3, { r: 0.1 }));
  roofSlabs(g, 5.8, 1.7, 3.8, 2.75, '#6fcf9f', '#f3fbf4', 5);
  const a = awning(3.2, 1.1, '#6fcf9f', '#ffffff', 5);
  a.position.set(0.6, 2.2, 1.2);
  g.add(a);
  const d = door(0.9, 1.6, '#4fb98a');
  d.position.set(-1.6, 0.24, 1.2);
  g.add(d);
  // 收货柜台与台秤
  g.add(box(2.6, 0.9, 0.7, WOOD, 0.7, 0.2, 1.5, { r: 0.07 }));
  g.add(box(2.8, 0.1, 0.9, WOOD_D, 0.7, 1.1, 1.5, { r: 0.04 }));
  g.add(box(0.5, 0.14, 0.4, '#d9dfe8', 1.3, 1.2, 1.5, { r: 0.04 }));
  g.add(cyl(0.3, 0.3, 0.05, '#eef2f6', 1.3, 1.5, 1.5, { seg: 16 }));
  g.add(box(0.06, 0.2, 0.06, '#aab4c0', 1.3, 1.32, 1.5));
  g.add(cbox(0.3, 0.26, 0.3, '#ff9a4a', 1.3, 1.68, 1.5, { r: 0.1 }));
  g.add(cbox(0.24, 0.2, 0.24, '#f2546b', 0.2, 1.3, 1.5, { r: 0.08 }));
  g.add(cbox(0.2, 0.16, 0.2, '#ffd24f', 0.5, 1.28, 1.6, { r: 0.07 }));
  // 麻袋与木箱
  for (const [x, z, c] of [[2.6, 1.6, '#e9d8b5'], [3.0, 1.0, '#dcc79c']]) {
    g.add(cbox(0.6, 0.7, 0.5, c, x, 0.35, z, { r: 0.2 }));
    g.add(cbox(0.2, 0.12, 0.2, '#b98b6b', x, 0.76, z, { r: 0.05 }));
  }
  g.add(box(0.8, 0.6, 0.7, WOOD, -2.9, 0, 1.3, { r: 0.06 }));
  g.add(cbox(0.36, 0.3, 0.36, LEAF, -2.9, 0.75, 1.3, { r: 0.1 }));
  const s = signBoard('回收小铺', '#3fa77a');
  s.position.set(0, 3.2, 1.72);
  s.scale.setScalar(0.72);
  g.add(s);
  // 屋顶的循环箭头标志
  const mk = group(0, 5.0, 0.2);
  for (let i = 0; i < 3; i++) {
    const b = group();
    b.add(cbox(0.7, 0.2, 0.2, '#ffffff', 0, 0.42, 0, { r: 0.07 }));
    b.add(frustum(0.02, 0.36, 0.3, '#ffffff', 0.42, 0.27, 0, { sz: 0.55, rz: -Math.PI / 2 }));
    b.rotation.z = (i / 3) * Math.PI * 2;
    mk.add(b);
  }
  g.add(mk);
  g.userData.tick = (t) => (mk.rotation.z = -t * 0.8);
  return g;
}
