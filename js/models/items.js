// 小物件：作物、甜点、花朵、金币 —— 既用于场景，也用于渲染 UI 图标
import { cbox, box, cyl, frustum, torus, sph, group, mat } from '../core/kit.js';
import { CROP } from '../data.js';

const ns = { cast: false, receive: false };
const WHITE = '#ffffff';

// ————————————————— 作物 —————————————————
function leafPair(g, color, y = 0, s = 1) {
  g.add(cbox(0.22 * s, 0.05 * s, 0.13 * s, color, -0.11 * s, y + 0.1 * s, 0, { r: 0.02 * s, rz: -0.5 }));
  g.add(cbox(0.22 * s, 0.05 * s, 0.13 * s, color, 0.11 * s, y + 0.1 * s, 0, { r: 0.02 * s, rz: 0.5 }));
  g.add(cbox(0.04 * s, 0.14 * s, 0.04 * s, color, 0, y + 0.05 * s, 0));
}
const fruitModel = (c) => {
  const g = group();
  g.add(cbox(0.42, 0.4, 0.42, c.color, 0, 0.22, 0, { r: 0.17 }));
  g.add(cbox(0.06, 0.14, 0.06, '#8a5a2b', 0, 0.46, 0, { r: 0.02 }));
  g.add(cbox(0.2, 0.06, 0.12, c.leaf, 0.1, 0.5, 0, { r: 0.03, rz: 0.4 }));
  return g;
};
const CROP_BUILD = {
  apple: fruitModel, peach: fruitModel, orange: fruitModel, cherry: fruitModel, lemon: fruitModel,
  radish(c, ripe) {
    const g = group();
    for (const [x, z, r] of [[-0.08, 0, 0.3], [0.08, 0.03, -0.3], [0, -0.06, 0]]) g.add(cbox(0.1, 0.42, 0.06, c.leaf, x, 0.34, z, { r: 0.03, rz: r }));
    g.add(cbox(0.3, 0.26, 0.3, ripe ? c.color : '#ffd0de', 0, 0.1, 0, { r: 0.1 }));
    return g;
  },
  strawberry(c, ripe) {
    const g = group();
    g.add(cbox(0.56, 0.3, 0.56, c.leaf, 0, 0.16, 0, { r: 0.12 }));
    g.add(cbox(0.34, 0.2, 0.34, '#96d68d', 0.06, 0.36, -0.04, { r: 0.08 }));
    if (ripe) for (const [x, y, z] of [[-0.2, 0.2, 0.26], [0.22, 0.3, 0.18], [0.0, 0.14, 0.3], [-0.26, 0.3, -0.1], [0.27, 0.16, -0.14]]) {
      g.add(cbox(0.15, 0.17, 0.15, c.color, x, y, z, { r: 0.055 }));
      g.add(cbox(0.1, 0.035, 0.1, '#7cc77a', x, y + 0.09, z, { r: 0.01 }));
    }
    else for (const [x, y, z] of [[-0.2, 0.3, 0.22], [0.22, 0.34, 0.1]]) g.add(cbox(0.1, 0.05, 0.1, WHITE, x, y, z, { r: 0.02 }));
    return g;
  },
  tulip(c, ripe) {
    const g = group();
    const cols = [c.color, '#ff8fb1', '#ffd24f'];
    [[-0.17, 0.05, 0.5], [0.16, -0.04, 0.6], [0, 0.12, 0.7]].forEach(([x, z, hgt], i) => {
      g.add(box(0.05, hgt, 0.05, c.leaf, x, 0, z));
      g.add(cbox(0.08, 0.3, 0.14, c.leaf, x + 0.07, 0.17, z, { r: 0.03, rz: -0.35 }));
      if (ripe) {
        g.add(cbox(0.19, 0.2, 0.19, cols[i], x, hgt + 0.08, z, { r: 0.07 }));
        g.add(cbox(0.08, 0.08, 0.2, cols[i], x, hgt + 0.2, z, { r: 0.03 }));
      } else g.add(cbox(0.1, 0.13, 0.1, '#b9e3a0', x, hgt + 0.04, z, { r: 0.04 }));
    });
    return g;
  },
  pumpkin(c, ripe) {
    const g = group();
    g.add(cbox(0.5, 0.06, 0.4, c.leaf, -0.2, 0.05, 0.16, { r: 0.02, ry: 0.5 }));
    g.add(cbox(0.4, 0.06, 0.36, c.leaf, 0.26, 0.05, -0.2, { r: 0.02, ry: -0.3 }));
    const col = ripe ? c.color : '#b9e3a0', s = ripe ? 1 : 0.6;
    g.add(cbox(0.58 * s, 0.44 * s, 0.58 * s, col, 0, 0.24 * s, 0, { r: 0.17 * s }));
    g.add(cbox(0.3 * s, 0.46 * s, 0.6 * s, ripe ? '#ffab63' : '#c9ecb0', 0, 0.24 * s, 0, { r: 0.14 * s }));
    g.add(cbox(0.09, 0.14, 0.09, '#7cb86f', 0, 0.5 * s, 0, { r: 0.03, rz: 0.2 }));
    return g;
  },
  sunflower(c, ripe) {
    const g = group();
    g.add(box(0.07, 0.95, 0.07, c.leaf, 0, 0, 0));
    g.add(cbox(0.3, 0.06, 0.16, c.leaf, -0.16, 0.4, 0, { r: 0.02, rz: -0.4 }));
    g.add(cbox(0.3, 0.06, 0.16, c.leaf, 0.16, 0.58, 0, { r: 0.02, rz: 0.4 }));
    const hd = group(0, 1.02, 0.05);
    if (ripe) {
      hd.add(cbox(0.48, 0.48, 0.08, c.color, 0, 0, 0, { r: 0.05 }));
      hd.add(cbox(0.48, 0.48, 0.08, c.color, 0, 0, 0, { r: 0.05, rz: Math.PI / 4 }));
      hd.add(cbox(0.28, 0.28, 0.12, '#a9764f', 0, 0, 0.01, { r: 0.09 }));
    } else hd.add(cbox(0.22, 0.22, 0.14, '#b9e3a0', 0, 0, 0, { r: 0.07 }));
    hd.rotation.x = -0.3;
    g.add(hd);
    return g;
  },
  rose(c, ripe) {
    const g = group();
    g.add(cbox(0.54, 0.5, 0.54, c.leaf, 0, 0.27, 0, { r: 0.14 }));
    g.add(cbox(0.36, 0.3, 0.36, '#86d08a', 0.05, 0.6, 0, { r: 0.1 }));
    const m = mat(c.color, { emissive: c.color, ei: 0.35, rough: 0.5 });
    if (ripe) for (const [x, y, z] of [[-0.18, 0.5, 0.24], [0.22, 0.36, 0.22], [0.02, 0.8, 0.05], [0.25, 0.66, -0.12], [-0.25, 0.3, -0.16]]) {
      g.add(cbox(0.19, 0.17, 0.19, m, x, y, z, { r: 0.065 }));
      g.add(cbox(0.1, 0.08, 0.1, '#e3ccff', x, y + 0.07, z, { r: 0.03 }));
    }
    else g.add(cbox(0.1, 0.1, 0.1, '#e3ccff', 0.02, 0.78, 0.05, { r: 0.03 }));
    return g;
  },
  wheat(c, ripe) {
    const g = group();
    const stalkCol = ripe ? '#e8bc52' : c.leaf, headCol = ripe ? c.color : '#b9e3a0';
    [[-0.14, -0.05, 0.62, 0.12], [0, 0.08, 0.74, 0], [0.15, -0.04, 0.66, -0.12]].forEach(([x, z, hgt, rz]) => {
      g.add(box(0.045, hgt, 0.045, stalkCol, x, 0, z, { rz }));
      g.add(cbox(0.12, 0.28, 0.12, headCol, x - Math.sin(rz) * hgt * 0.6, hgt + 0.06, z, { r: 0.05, rz }));
      if (ripe) g.add(cbox(0.08, 0.12, 0.08, '#ffe794', x - Math.sin(rz) * hgt * 0.6, hgt + 0.22, z, { r: 0.03, rz }));
    });
    return g;
  },
  blueberry(c, ripe) {
    const g = group();
    g.add(cbox(0.54, 0.36, 0.54, c.leaf, 0, 0.2, 0, { r: 0.14 }));
    g.add(cbox(0.36, 0.24, 0.36, '#88d49e', -0.04, 0.42, 0.03, { r: 0.1 }));
    if (ripe) for (const [x, y, z] of [[-0.18, 0.24, 0.24], [0.2, 0.32, 0.18], [0.02, 0.48, 0.12], [-0.22, 0.34, -0.12], [0.22, 0.2, -0.16]]) {
      g.add(cbox(0.14, 0.14, 0.14, c.color, x, y, z, { r: 0.06 }));
      g.add(cbox(0.06, 0.03, 0.06, '#b8dcff', x, y + 0.07, z, { r: 0.015 }));
    } else for (const [x, y, z] of [[-0.16, 0.32, 0.2], [0.18, 0.36, 0.12]]) {
      g.add(cbox(0.09, 0.09, 0.09, '#d6f5d6', x, y, z, { r: 0.04 }));
    }
    return g;
  },
  cotton(c, ripe) {
    const g = group();
    g.add(box(0.06, 0.46, 0.06, '#8a6a55', 0, 0, 0));
    g.add(cbox(0.42, 0.22, 0.42, c.leaf, 0, 0.18, 0, { r: 0.09 }));
    for (const [x, y, z] of [[-0.15, 0.38, 0.1], [0.16, 0.44, -0.06], [0, 0.56, 0.04]]) {
      g.add(cbox(0.14, 0.08, 0.14, '#8a6a55', x, y - 0.07, z, { r: 0.03 }));
      if (ripe) {
        g.add(cbox(0.24, 0.22, 0.24, c.color, x, y + 0.05, z, { r: 0.1 }));
        g.add(cbox(0.16, 0.14, 0.16, WHITE, x + 0.03, y + 0.12, z, { r: 0.07 }));
      } else {
        g.add(cbox(0.14, 0.14, 0.14, '#b9e3a0', x, y + 0.02, z, { r: 0.06 }));
      }
    }
    return g;
  },
  moonflower(c, ripe) {
    const g = group();
    g.add(box(0.06, 0.72, 0.06, c.leaf, 0, 0, 0));
    g.add(cbox(0.28, 0.06, 0.16, c.leaf, -0.14, 0.32, 0, { r: 0.02, rz: -0.38 }));
    g.add(cbox(0.28, 0.06, 0.16, c.leaf, 0.14, 0.46, 0, { r: 0.02, rz: 0.38 }));
    const m = mat(c.color, { emissive: c.color, ei: ripe ? 0.5 : 0.15, rough: 0.4 });
    if (ripe) {
      g.add(cbox(0.36, 0.22, 0.36, m, 0, 0.76, 0, { r: 0.11 }));
      g.add(cbox(0.24, 0.18, 0.24, '#dce6ff', 0, 0.88, 0, { r: 0.08, ry: Math.PI / 4 }));
      g.add(cbox(0.12, 0.12, 0.12, mat('#fff3b0', { emissive: '#ffe066', ei: 0.7 }), 0, 0.96, 0, { r: 0.05 }));
    } else {
      g.add(cbox(0.18, 0.22, 0.18, '#c5d4ff', 0, 0.74, 0, { r: 0.07 }));
    }
    return g;
  },
};
// stage: 0 刚播种 1 发芽 2 生长 3 成熟
export function cropModel(id, stage) {
  const c = CROP[id];
  const g = group();
  if (stage <= 0) {
    g.add(cbox(0.16, 0.08, 0.16, '#8a6a55', 0, 0.03, 0, { r: 0.04 }));
  } else if (stage === 1) {
    leafPair(g, c.leaf, 0, 1.1);
  } else {
    const m = CROP_BUILD[id](c, stage >= 3);
    if (stage === 2) m.scale.setScalar(0.72);
    g.add(m);
  }
  return g;
}
export function cropIcon(id) {
  const g = CROP_BUILD[id](CROP[id], true);
  return g;
}
export function seedBag(id) {
  const c = CROP[id];
  const g = group();
  g.add(cbox(0.5, 0.6, 0.2, '#fff3e2', 0, 0.3, 0, { r: 0.07 }));
  g.add(cbox(0.52, 0.1, 0.22, '#e6cfae', 0, 0.56, 0, { r: 0.03 }));
  g.add(cbox(0.26, 0.26, 0.04, c.color, 0, 0.27, 0.1, { r: 0.09 }));
  g.add(cbox(0.12, 0.06, 0.04, c.leaf, 0.04, 0.42, 0.1, { r: 0.02, rz: 0.4 }));
  return g;
}

// ————————————————— 咖啡屋甜点 —————————————————
export const FOODS = [
  { id: 'coffee', name: '拿铁', price: 6 },
  { id: 'cake', name: '草莓蛋糕', price: 8 },
  { id: 'donut', name: '甜甜圈', price: 7 },
  { id: 'tea', name: '珍珠奶茶', price: 9 },
  { id: 'macaron', name: '马卡龙', price: 10 },
  { id: 'sundae', name: '樱桃圣代', price: 12 },
];
export const FOOD_BUILD = {
  coffee() {
    const g = group();
    g.add(cyl(0.34, 0.3, 0.05, WHITE, 0, 0, 0, { seg: 20 }));
    g.add(cyl(0.24, 0.18, 0.3, '#ffd0de', 0, 0.05, 0, { seg: 20 }));
    g.add(cyl(0.21, 0.21, 0.02, '#c99466', 0, 0.345, 0, { seg: 20, ...ns }));
    g.add(cbox(0.13, 0.02, 0.13, '#fff3e2', 0, 0.36, 0, { r: 0.009, ry: Math.PI / 4, ...ns }));
    g.add(torus(0.1, 0.03, '#ffd0de', 0.27, 0.2, 0));
    return g;
  },
  cake() {
    const g = group();
    g.add(cyl(0.36, 0.33, 0.04, WHITE, 0, 0, 0, { seg: 20 }));
    g.add(box(0.4, 0.12, 0.34, '#ffe7b8', 0, 0.04, 0, { r: 0.03 }));
    g.add(box(0.4, 0.05, 0.34, '#ff8fa6', 0, 0.16, 0, { r: 0.015 }));
    g.add(box(0.4, 0.12, 0.34, '#ffe7b8', 0, 0.21, 0, { r: 0.03 }));
    g.add(box(0.43, 0.08, 0.37, WHITE, 0, 0.32, 0, { r: 0.035 }));
    g.add(cbox(0.14, 0.15, 0.14, '#f2546b', 0.03, 0.47, 0.02, { r: 0.055 }));
    g.add(cbox(0.08, 0.03, 0.08, '#7cc77a', 0.03, 0.555, 0.02, { r: 0.01 }));
    return g;
  },
  donut() {
    const g = group();
    g.add(cyl(0.36, 0.33, 0.04, WHITE, 0, 0, 0, { seg: 20 }));
    const d = group(0, 0.16, 0);
    d.add(torus(0.17, 0.1, '#f3c88e', 0, 0, 0, { rx: Math.PI / 2 }));
    d.add(torus(0.17, 0.085, '#ff8fb1', 0, 0.035, 0, { rx: Math.PI / 2 }));
    const sp = ['#ffffff', '#ffe27a', '#8fd0f5', '#ffffff', '#9fe0c5', '#ffe27a'];
    sp.forEach((c, i) => {
      const a = (i / sp.length) * Math.PI * 2 + 0.3;
      d.add(cbox(0.06, 0.02, 0.025, c, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17, { r: 0.008, ry: a * 2.3, ...ns }));
    });
    g.add(d);
    return g;
  },
  tea() {
    const g = group();
    g.add(cyl(0.2, 0.15, 0.5, mat('#f1d3b0', { rough: 0.35 }), 0, 0, 0, { seg: 18 }));
    g.add(cyl(0.17, 0.155, 0.1, '#6b4a3a', 0, 0.005, 0, { seg: 18 }));
    g.add(cyl(0.215, 0.215, 0.045, WHITE, 0, 0.5, 0, { seg: 18 }));
    g.add(cbox(0.05, 0.42, 0.05, '#ff8fb1', 0.05, 0.6, 0, { r: 0.02, rz: -0.15 }));
    g.add(cbox(0.14, 0.12, 0.02, '#ff8fb1', 0, 0.27, 0.18, { r: 0.05, rz: Math.PI / 4, ...ns }));
    return g;
  },
  macaron() {
    const g = group();
    g.add(cyl(0.36, 0.33, 0.04, WHITE, 0, 0, 0, { seg: 20 }));
    const one = (c, x, y, z, rz = 0) => {
      const m = group(x, y, z);
      m.add(cyl(0.15, 0.15, 0.075, c, 0, 0, 0, { seg: 16 }));
      m.add(cyl(0.135, 0.135, 0.04, '#fff6ea', 0, 0.075, 0, { seg: 16 }));
      m.add(cyl(0.15, 0.15, 0.075, c, 0, 0.115, 0, { seg: 16 }));
      m.rotation.z = rz;
      return m;
    };
    g.add(one('#ffb3cb', -0.13, 0.04, 0.06));
    g.add(one('#b9e8c9', 0.15, 0.04, -0.05));
    g.add(one('#d3c3f7', 0.02, 0.24, 0.02, 0.12));
    return g;
  },
  sundae() {
    const g = group();
    g.add(cyl(0.16, 0.16, 0.04, '#cfeaff', 0, 0, 0, { seg: 16 }));
    g.add(cyl(0.04, 0.04, 0.14, '#cfeaff', 0, 0.04, 0, { seg: 10 }));
    g.add(cyl(0.26, 0.1, 0.24, mat('#dff3ff', { rough: 0.2, opacity: 0.92 }), 0, 0.18, 0, { seg: 18 }));
    g.add(cbox(0.3, 0.24, 0.3, '#fff6ea', 0, 0.5, 0, { r: 0.11 }));
    g.add(cbox(0.22, 0.2, 0.22, '#ffc2d6', -0.03, 0.68, 0.02, { r: 0.09 }));
    g.add(sph(0.065, mat('#e8425e', { rough: 0.3 }), -0.02, 0.83, 0.02));
    g.add(cbox(0.02, 0.1, 0.02, '#7a5a3a', 0.0, 0.9, 0.02, { rz: -0.3, ...ns }));
    g.add(cbox(0.05, 0.3, 0.02, '#f3c88e', 0.13, 0.66, -0.06, { r: 0.008, rz: -0.4 }));
    return g;
  },
};

// ————————————————— 花店的花 —————————————————
export const FLOWERS = [
  { id: 'rose', name: '玫瑰', color: '#f2546b' },
  { id: 'daisy', name: '雏菊', color: '#ffffff' },
  { id: 'tulip', name: '郁金香', color: '#ffb347' },
  { id: 'lavender', name: '薰衣草', color: '#b79cf0' },
  { id: 'sunflower', name: '向日葵', color: '#ffd24f' },
  { id: 'bluebell', name: '蓝风铃', color: '#7fc4f5' },
];
const STEM = '#7cc77a';
export const FLOWER_BUILD = {
  rose(c) {
    const g = stem(0.62);
    g.add(cbox(0.3, 0.26, 0.3, c, 0, 0.74, 0, { r: 0.1 }));
    g.add(cbox(0.2, 0.2, 0.2, '#ff7f8f', 0.02, 0.84, 0.01, { r: 0.07, ry: 0.6 }));
    g.add(cbox(0.1, 0.1, 0.1, '#ffb0b8', 0.02, 0.93, 0.01, { r: 0.03, ry: 0.2 }));
    return g;
  },
  daisy(c) {
    const g = stem(0.62);
    const hd = group(0, 0.72, 0.03);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      hd.add(cbox(0.14, 0.14, 0.05, c, Math.sin(a) * 0.17, Math.cos(a) * 0.17, 0, { r: 0.045, rz: -a }));
    }
    hd.add(cbox(0.18, 0.18, 0.09, '#ffd24f', 0, 0, 0.01, { r: 0.07 }));
    hd.rotation.x = -0.5;
    g.add(hd);
    return g;
  },
  tulip(c) {
    const g = stem(0.6);
    g.add(cbox(0.26, 0.28, 0.26, c, 0, 0.74, 0, { r: 0.1 }));
    g.add(cbox(0.1, 0.1, 0.28, '#ffc977', 0, 0.9, 0, { r: 0.04 }));
    g.add(cbox(0.28, 0.1, 0.1, '#ffc977', 0, 0.9, 0, { r: 0.04 }));
    return g;
  },
  lavender(c) {
    const g = stem(0.5);
    for (let i = 0; i < 5; i++) g.add(cbox(0.17 - i * 0.02, 0.1, 0.17 - i * 0.02, i % 2 ? '#c9b3f7' : c, 0, 0.52 + i * 0.1, 0, { r: 0.04, ry: i * 0.6 }));
    return g;
  },
  sunflower(c) {
    const g = stem(0.6);
    const hd = group(0, 0.74, 0.04);
    hd.add(cbox(0.4, 0.4, 0.07, c, 0, 0, 0, { r: 0.05 }));
    hd.add(cbox(0.4, 0.4, 0.07, c, 0, 0, 0, { r: 0.05, rz: Math.PI / 4 }));
    hd.add(cbox(0.24, 0.24, 0.1, '#a9764f', 0, 0, 0.01, { r: 0.08 }));
    hd.rotation.x = -0.4;
    g.add(hd);
    return g;
  },
  bluebell(c) {
    const g = stem(0.66);
    g.add(cbox(0.24, 0.05, 0.05, STEM, 0.1, 0.66, 0, { r: 0.02, rz: -0.3 }));
    for (const [x, y] of [[0.2, 0.52], [-0.02, 0.66], [0.1, 0.4]]) {
      g.add(frustum(0.1, 0.22, 0.18, c, x, y - 0.09, 0));
      g.add(cbox(0.06, 0.05, 0.06, '#fff6b8', x, y - 0.1, 0, { r: 0.02 }));
    }
    return g;
  },
};
function stem(hgt) {
  const g = group();
  g.add(box(0.05, hgt, 0.05, STEM, 0, 0, 0));
  g.add(cbox(0.16, 0.05, 0.1, STEM, 0.09, hgt * 0.45, 0, { r: 0.02, rz: 0.5 }));
  return g;
}
export function flowerModel(id) {
  const f = FLOWERS.find((x) => x.id === id);
  return FLOWER_BUILD[id](f.color);
}

export function coinModel() {
  const g = group();
  const m = mat('#ffd24f', { rough: 0.3, metal: 0.5, emissive: '#ffb300', ei: 0.25 });
  g.add(cyl(0.2, 0.2, 0.06, m, 0, -0.03, 0, { seg: 18, rx: Math.PI / 2 }));
  g.add(cbox(0.14, 0.14, 0.08, mat('#fff0a8', { rough: 0.3, metal: 0.4, emissive: '#ffd24f', ei: 0.3 }), 0, 0, 0, { r: 0.03, rz: Math.PI / 4 }));
  return g;
}
export function waterCan() {
  const g = group();
  g.add(cyl(0.2, 0.2, 0.34, '#8fd0f5', 0, 0, 0, { seg: 14 }));
  g.add(cbox(0.3, 0.06, 0.06, '#8fd0f5', 0.3, 0.24, 0, { r: 0.02, rz: 0.5 }));
  g.add(cbox(0.1, 0.1, 0.12, '#cfeaff', 0.44, 0.32, 0, { r: 0.03 }));
  g.add(torus(0.12, 0.025, '#6bb8e6', -0.2, 0.2, 0));
  return g;
}

// ————————————————— 花店合成链：嫩芽 → 花苞 → 鲜花 → 花束 → 花篮 —————————————————
export function mergeModel(id, lv) {
  const g = group();
  if (id === 'ribbon') {
    // 包装链：丝带 → 蝴蝶结 → 礼盒
    if (lv === 1) {
      g.add(cyl(0.3, 0.3, 0.08, '#fff6ea', 0, 0, 0, { seg: 16 }));
      g.add(cyl(0.24, 0.24, 0.34, '#ff8fb1', 0, 0.08, 0, { seg: 16 }));
      g.add(cyl(0.3, 0.3, 0.08, '#fff6ea', 0, 0.42, 0, { seg: 16 }));
      g.add(cbox(0.3, 0.05, 0.12, '#ff8fb1', 0.3, 0.2, 0.1, { r: 0.02, rz: -0.4 }));
    } else if (lv === 2) {
      g.add(cbox(0.36, 0.3, 0.14, '#ff8fb1', -0.2, 0.36, 0, { r: 0.08, rz: 0.3 }));
      g.add(cbox(0.36, 0.3, 0.14, '#ff8fb1', 0.2, 0.36, 0, { r: 0.08, rz: -0.3 }));
      g.add(cbox(0.16, 0.2, 0.17, '#ffd76a', 0, 0.36, 0, { r: 0.05 }));
      g.add(cbox(0.12, 0.34, 0.08, '#ff8fb1', -0.1, 0.12, 0, { r: 0.03, rz: -0.25 }));
      g.add(cbox(0.12, 0.34, 0.08, '#ff8fb1', 0.1, 0.12, 0, { r: 0.03, rz: 0.25 }));
    } else {
      g.add(box(0.62, 0.44, 0.62, '#cfe0ff', 0, 0, 0, { r: 0.06 }));
      g.add(box(0.68, 0.14, 0.68, '#a9bdf7', 0, 0.42, 0, { r: 0.05 }));
      g.add(box(0.14, 0.58, 0.64, '#ff8fb1', 0, 0, 0, { r: 0.02 }));
      g.add(box(0.64, 0.58, 0.14, '#ff8fb1', 0, 0, 0, { r: 0.02 }));
      g.add(cbox(0.24, 0.18, 0.12, '#ff8fb1', -0.13, 0.66, 0, { r: 0.06, rz: 0.3 }));
      g.add(cbox(0.24, 0.18, 0.12, '#ff8fb1', 0.13, 0.66, 0, { r: 0.06, rz: -0.3 }));
    }
    return g;
  }
  const f = FLOWERS.find((x) => x.id === id);
  if (lv === 1) {
    g.add(cbox(0.5, 0.16, 0.5, '#a97c5f', 0, 0.08, 0, { r: 0.07 }));
    leafPair(g, STEM, 0.14, 1.8);
    g.add(cbox(0.13, 0.13, 0.13, f.color, 0, 0.5, 0, { r: 0.045 }));
  } else if (lv === 2) {
    g.add(box(0.06, 0.5, 0.06, STEM, 0, 0, 0));
    g.add(cbox(0.2, 0.06, 0.12, STEM, 0.11, 0.22, 0, { r: 0.02, rz: 0.5 }));
    g.add(cbox(0.2, 0.06, 0.12, STEM, -0.11, 0.32, 0, { r: 0.02, rz: -0.5 }));
    g.add(cbox(0.22, 0.1, 0.22, STEM, 0, 0.5, 0, { r: 0.04 }));
    g.add(cbox(0.2, 0.26, 0.2, f.color, 0, 0.63, 0, { r: 0.08 }));
  } else if (lv === 3) {
    g.add(flowerModel(id));
  } else if (lv === 4) {
    g.add(frustum(0.62, 0.14, 0.56, '#fff3e2', 0, 0, 0));
    g.add(cbox(0.28, 0.12, 0.1, '#ff8fb1', 0, 0.16, 0.2, { r: 0.04 }));
    for (const [x, z, r] of [[-0.17, 0, 0.28], [0.17, 0, -0.28], [0, 0.08, 0]]) {
      const m = flowerModel(id);
      m.position.set(x, 0.12, z);
      m.rotation.z = r;
      m.scale.setScalar(0.85);
      g.add(m);
    }
  } else {
    g.add(cyl(0.46, 0.34, 0.36, '#d2a67e', 0, 0, 0, { seg: 14 }));
    g.add(cyl(0.48, 0.48, 0.06, '#b3855f', 0, 0.34, 0, { seg: 14 }));
    g.add(torus(0.44, 0.04, '#b3855f', 0, 0.4, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const m = flowerModel(id);
      m.position.set(Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2);
      m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      m.scale.setScalar(0.8);
      g.add(m);
    }
    g.add(cbox(0.14, 0.12, 0.08, '#ffd76a', -0.09, 0.2, 0.46, { r: 0.04, rz: 0.3 }));
    g.add(cbox(0.14, 0.12, 0.08, '#ffd76a', 0.09, 0.2, 0.46, { r: 0.04, rz: -0.3 }));
  }
  return g;
}

// ————————————————— 钓场的鱼 —————————————————
export const FISH = [
  { id: 'silver', name: '小银鱼', price: 12, diff: 0.6, ai: 'smooth', color: '#cfe0ee', fin: '#9fb8cf', w: 34 },
  { id: 'whisker', name: '胡须鱼', price: 20, diff: 0.9, ai: 'sink', color: '#f3b27a', fin: '#d98a4a', w: 28, whisker: true },
  { id: 'puffer', name: '泡泡河豚', price: 26, diff: 1.0, ai: 'float', color: '#ffe9a8', fin: '#f0b85a', w: 16, shape: 'puffer', belly: '#fffaf0' },
  { id: 'blue', name: '蓝鳍鱼', price: 30, diff: 1.2, ai: 'mixed', color: '#7fc4f5', fin: '#3f73c4', w: 20 },
  { id: 'koi', name: '锦鲤', price: 38, diff: 1.35, ai: 'smooth', color: '#fffdf8', fin: '#ff8a5c', w: 12, shape: 'koi', patch: '#ff7a4d', patch2: '#3d3550' },
  { id: 'stripe', name: '彩纹鱼', price: 44, diff: 1.5, ai: 'dart', color: '#ff9fbd', fin: '#b9a4f2', w: 12, stripe: '#ffffff' },
  { id: 'lantern', name: '灯笼鱼', price: 56, diff: 1.7, ai: 'sink', color: '#6a58a0', fin: '#463a78', w: 8, shape: 'lantern', lamp: '#ffe27a' },
  { id: 'gold', name: '金鳞鱼', price: 72, diff: 1.9, ai: 'float', color: '#ffd24f', fin: '#f0a53a', w: 6, glow: true },
  { id: 'moon', name: '月光鳐', price: 96, diff: 2.1, ai: 'mixed', color: '#cfd9ff', fin: '#9fb0f0', w: 3, shape: 'ray', glow: true },
  // 节日限定：只有对应节日期间才会上钩
  { id: 'f_sakura', name: '樱花鲷', price: 60, diff: 1.4, ai: 'smooth', color: '#ffc2d6', fin: '#ff8fb1', w: 12, fest: 'sakura', petal: '#ffffff' },
  { id: 'f_summer', name: '西瓜鱼', price: 60, diff: 1.4, ai: 'dart', color: '#7ccf7a', fin: '#3f9a52', w: 12, fest: 'summer', stripe: '#3f9a52', belly: '#ff7f8f' },
  { id: 'f_harvest', name: '南瓜鱼', price: 60, diff: 1.4, ai: 'float', color: '#f6a03c', fin: '#d97b1e', w: 12, fest: 'harvest', shape: 'puffer', smooth: true, stem: '#6fae5a', belly: '#ffd08a' },
  { id: 'f_snow', name: '雪花鱼', price: 60, diff: 1.4, ai: 'mixed', color: '#eaf6ff', fin: '#9fd6f2', w: 12, fest: 'snow', flake: '#ffffff', glow: true },
];
export function fishModel(id) {
  const f = FISH.find((x) => x.id === id);
  const g = group();
  const m = f.glow ? mat(f.color, { rough: 0.3, metal: 0.4, emissive: f.color, ei: 0.3 }) : mat(f.color, { rough: 0.5 });
  const eyes = (x, y, zz, s = 1) => { for (const sz of [-1, 1]) {
    g.add(cbox(0.07 * s, 0.07 * s, 0.02, '#ffffff', x, y, sz * zz, { r: 0.02, ...ns }));
    g.add(cbox(0.04 * s, 0.04 * s, 0.025, '#3d3550', x + 0.01, y, sz * (zz + 0.005), { r: 0.012, ...ns }));
  } };
  if (f.shape === 'puffer') {
    // 圆滚滚的身子，小小的鳍
    g.add(cbox(0.56, 0.52, 0.5, m, 0, 0, 0, { r: 0.22 }));
    g.add(cbox(0.4, 0.2, 0.42, f.belly, 0.02, -0.17, 0, { r: 0.1 }));
    g.add(cbox(0.1, 0.07, 0.14, f.fin, 0.3, -0.08, 0, { r: 0.03 }));
    g.add(frustum(0.04, 0.2, 0.18, f.fin, -0.36, 0, 0, { sz: 0.3, rz: -Math.PI / 2 }));
    for (const sz of [-1, 1]) g.add(cbox(0.12, 0.1, 0.04, f.fin, -0.02, -0.05, sz * 0.27, { r: 0.03, rz: 0.4 }));
    if (f.smooth) {
      for (const x of [-0.14, 0.02, 0.18]) g.add(cbox(0.03, 0.5, 0.51, f.fin, x, 0.005, 0, { r: 0.012 }));
      g.add(cbox(0.08, 0.14, 0.08, f.stem, 0, 0.3, 0, { r: 0.03, rz: 0.25 }));
      g.add(cbox(0.16, 0.04, 0.1, f.stem, 0.1, 0.3, 0, { r: 0.02 }));
    } else {
      for (const [x, y, z] of [[0, 0.29, 0], [-0.18, 0.24, 0.12], [0.16, 0.24, -0.12], [-0.05, 0.1, 0.27], [0.12, 0.05, -0.27], [-0.2, 0, -0.26], [0.2, 0.12, 0.26]]) g.add(cbox(0.06, 0.06, 0.06, f.fin, x, y, z, { r: 0.012, rz: 0.78, rx: 0.78 }));
    }
    eyes(0.22, 0.1, 0.25, 1.25);
    return g;
  }
  if (f.shape === 'ray') {
    // 扁扁的身子，两片大翼，细长的尾巴
    g.add(cbox(0.6, 0.12, 0.44, m, 0, 0, 0, { r: 0.06 }));
    for (const sz of [-1, 1]) {
      g.add(cbox(0.46, 0.07, 0.34, m, -0.04, 0.01, sz * 0.34, { r: 0.035, ry: sz * 0.45 }));
      g.add(cbox(0.2, 0.05, 0.14, f.fin, -0.1, 0.02, sz * 0.56, { r: 0.025, ry: sz * 0.7 }));
    }
    g.add(cbox(0.56, 0.035, 0.035, f.fin, -0.55, 0.02, 0, { r: 0.015 }));
    const st = mat('#ffffff', { emissive: '#fff6c9', ei: 0.9 });
    for (const [x, z] of [[0.08, 0.1], [-0.1, -0.12], [-0.02, 0.3], [0.02, -0.32], [0.16, -0.06]]) g.add(cbox(0.05, 0.02, 0.05, st, x, 0.07, z, { r: 0.008, ry: 0.78, ...ns }));
    for (const sz of [-1, 1]) g.add(cbox(0.05, 0.03, 0.05, '#3d3550', 0.22, 0.07, sz * 0.12, { r: 0.012, ...ns }));
    g.rotation.x = 0.5; // 稍微朝镜头倾一点，看得见背上的星点
    const wrap = group(); wrap.add(g);
    return wrap;
  }
  const long = f.shape === 'koi' ? 1.2 : 1;
  g.add(cbox(0.7 * long, 0.4, 0.26, m, 0, 0, 0, { r: 0.13 }));
  g.add(cbox(0.3, 0.3, 0.22, m, 0.42 * long, 0, 0, { r: 0.1 }));
  g.add(frustum(0.06, 0.36, 0.3, f.fin, -0.52 * long, -0.15, 0, { sz: 0.25, rz: -Math.PI / 2 }));
  g.add(cbox(0.24, 0.14, 0.06, f.fin, -0.05, 0.25, 0, { r: 0.03, rz: -0.25 }));
  g.add(cbox(0.16, 0.1, 0.04, f.fin, 0.1, -0.12, 0.14, { r: 0.03, rz: 0.5 }));
  eyes(0.44 * long, 0.05, 0.115);
  if (f.stripe) for (const x of [-0.18, 0.04]) g.add(cbox(0.07, 0.41, 0.27, f.stripe, x, 0, 0, { r: 0.02 }));
  if (f.whisker) for (const sz of [-1, 1]) g.add(cbox(0.16, 0.015, 0.015, '#8a5a3a', 0.6, -0.08, sz * 0.09, { rz: -0.4, ...ns }));
  if (f.belly && !f.shape) g.add(cbox(0.5, 0.14, 0.27, f.belly, 0.02, -0.14, 0, { r: 0.05 }));
  if (f.shape === 'koi') {
    g.add(cbox(0.26, 0.2, 0.27, f.patch, 0.12, 0.11, 0, { r: 0.06 }));
    g.add(cbox(0.2, 0.22, 0.27, f.patch, -0.3, 0.02, 0, { r: 0.06 }));
    g.add(cbox(0.12, 0.12, 0.27, f.patch2, -0.08, -0.06, 0, { r: 0.04 }));
    g.add(cbox(0.16, 0.14, 0.23, f.patch, 0.5, 0.08, 0, { r: 0.05 }));
    for (const sz of [-1, 1]) g.add(cbox(0.2, 0.012, 0.012, '#ff8a5c', 0.66, -0.09, sz * 0.08, { rz: -0.5, ...ns }));
  }
  if (f.shape === 'lantern') {
    // 额前挑着一盏小灯，嘴里一排小尖牙
    g.add(cbox(0.03, 0.26, 0.03, f.fin, 0.4, 0.28, 0, { r: 0.012, rz: -0.5 }));
    g.add(cbox(0.03, 0.03, 0.03, f.fin, 0.5, 0.4, 0, { r: 0.012 }));
    g.add(cbox(0.13, 0.13, 0.13, mat(f.lamp, { emissive: f.lamp, ei: 1.4 }), 0.6, 0.36, 0, { r: 0.05, ...ns }));
    for (const z of [-0.07, 0, 0.07]) g.add(cbox(0.04, 0.06, 0.04, '#ffffff', 0.55, -0.1, z, { r: 0.01, ...ns }));
    for (const x of [-0.2, 0.02]) g.add(cbox(0.05, 0.05, 0.27, '#9f8fe0', x, 0.02, 0, { r: 0.02 }));
  }
  if (f.petal) for (const [x, y, c] of [[-0.16, 0.06, f.petal], [0.06, -0.04, f.fin], [0.22, 0.1, f.petal], [-0.3, -0.06, f.fin]]) g.add(cbox(0.1, 0.1, 0.275, c, x, y, 0, { r: 0.045, rz: 0.6 }));
  if (f.flake) {
    const fm = mat(f.flake, { emissive: '#cfeeff', ei: 0.7 });
    for (const rz of [0, Math.PI / 3, -Math.PI / 3]) g.add(cbox(0.24, 0.035, 0.275, fm, -0.04, 0.02, 0, { r: 0.012, rz }));
    g.add(cbox(0.08, 0.08, 0.28, f.fin, -0.04, 0.02, 0, { r: 0.02, rz: 0.78 }));
  }
  return g;
}
