// 可组合的室内厨房 / 卫浴。正面统一朝 +Z，全部落地、不依赖墙面或外部贴图。
// 复用 kit 的缓存几何与材质，小配件不投影，保持手机端低多边形风格。
import { cbox, box, cyl, torus, group, mat } from '../core/kit.js';

const CREAM = '#fff6e8', WHITE = '#fffdf8', MINT = '#abd9c5', MINT_D = '#83bca6';
const PINK = '#f5b5c9', GOLD = '#d6b17b', DARK = '#586879', WOOD = '#d4aa83';
const ns = { cast: false, receive: false };
const metal = () => mat('#becdd2', { rough: 0.36, metal: 0.35 });
const glass = () => mat('#c8eaf0', { rough: 0.24, opacity: 0.26 });
const water = () => mat('#b5e6ee', { rough: 0.3 });

function handle(g, x, y, z, vertical = false) {
  g.add(cbox(vertical ? 0.045 : 0.23, vertical ? 0.24 : 0.045, 0.055, GOLD, x, y, z, { r: 0.018, ...ns }));
}
function cabinet(w = 1.86, d = 0.86, color = MINT) {
  const g = group();
  g.add(box(w - 0.12, 0.12, d - 0.08, MINT_D, 0, 0, 0, { r: 0.025 }));
  g.add(box(w - 0.04, 0.69, d - 0.04, CREAM, 0, 0.12, 0, { r: 0.045 }));
  const count = w > 1 ? 2 : 1, doorW = (w - 0.13) / count;
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * (doorW + 0.025);
    g.add(cbox(doorW, 0.58, 0.045, color, x, 0.46, d / 2 - 0.005, { r: 0.025 }));
    handle(g, x, 0.65, d / 2 + 0.025);
  }
  g.add(box(w, 0.09, d, WHITE, 0, 0.81, 0, { r: 0.035 }));
  return g;
}
function faucet(g, x, y, z, scale = 1) {
  const f = group(x, y, z), m = metal();
  f.add(cyl(0.045, 0.06, 0.05, m, 0, 0, 0, { seg: 8 }));
  f.add(box(0.055, 0.28, 0.055, m, 0, 0.035, 0, { r: 0.018 }));
  f.add(cbox(0.055, 0.055, 0.23, m, 0, 0.29, 0.09, { r: 0.018 }));
  f.add(box(0.055, 0.07, 0.055, m, 0, 0.22, 0.19, { r: 0.018 }));
  f.add(cbox(0.14, 0.035, 0.035, m, 0.06, 0.16, 0, { r: 0.012, ...ns }));
  f.scale.setScalar(scale); g.add(f);
}
function basin(g, x, y, z, w = 0.88, d = 0.54) {
  // 外沿和凹入底层分开，保留洗手池的可辨识开口。
  const edge = 0.065;
  g.add(cbox(w, 0.055, d, water(), x, y - 0.025, z, { r: 0.1 }));
  for (const side of [-1, 1]) {
    g.add(cbox(w, 0.1, edge, WHITE, x, y + 0.025, z + side * (d / 2 - edge / 2), { r: 0.025 }));
    g.add(cbox(edge, 0.1, d - edge, WHITE, x + side * (w / 2 - edge / 2), y + 0.025, z, { r: 0.025 }));
  }
  g.add(cyl(0.045, 0.045, 0.006, DARK, x, y + 0.005, z, { seg: 8, ...ns }));
}
function towel(g, x, y, z, color, w = 0.42) {
  g.add(cbox(w, 0.12, 0.28, color, x, y, z, { r: 0.045 }));
  g.add(cbox(w - 0.045, 0.018, 0.012, WHITE, x, y - 0.015, z + 0.143, { r: 0.006, ...ns }));
}
function jar(g, x, y, z, color, h = 0.2) {
  g.add(cyl(0.09, 0.09, h, color, x, y, z, { seg: 10 }));
  g.add(cyl(0.095, 0.095, 0.035, WOOD, x, y + h, z, { seg: 10, ...ns }));
}

export const HOUSE_FURNITURE_BUILD = {
  kitchen_counter() {
    const g = cabinet();
    g.add(cbox(0.5, 0.035, 0.34, WOOD, -0.4, 0.92, 0.06, { r: 0.045 }));
    g.add(cbox(0.16, 0.035, 0.12, WOOD, -0.7, 0.92, 0.06, { r: 0.035 }));
    jar(g, 0.55, 0.9, -0.17, PINK); jar(g, 0.28, 0.9, -0.17, MINT_D, 0.16);
    return g;
  },
  kitchen_sink() {
    const g = cabinet(); basin(g, -0.28, 0.94, 0.03, 0.95, 0.54); faucet(g, -0.28, 0.9, -0.31);
    for (let i = 0; i < 4; i++) g.add(cbox(0.025, 0.015, 0.4, '#c5d6cf', 0.42 + i * 0.1, 0.91, 0.03, { r: 0.006, ...ns }));
    g.add(box(0.1, 0.16, 0.1, PINK, 0.73, 0.9, -0.26, { r: 0.025 }));
    g.add(cbox(0.12, 0.035, 0.045, WHITE, 0.75, 1.09, -0.26, { r: 0.012, ...ns }));
    return g;
  },
  kitchen_stove() {
    const g = cabinet(0.88, 0.86, CREAM);
    g.add(cbox(0.7, 0.36, 0.045, DARK, 0, 0.43, 0.45, { r: 0.045 }));
    g.add(cbox(0.58, 0.23, 0.025, '#91b5bf', 0, 0.41, 0.478, { r: 0.03, ...ns }));
    handle(g, 0, 0.64, 0.49);
    for (const x of [-0.25, 0, 0.25]) g.add(cyl(0.035, 0.035, 0.035, GOLD, x, 0.735, 0.45, { rx: Math.PI / 2, seg: 8, ...ns }));
    g.add(cbox(0.77, 0.025, 0.73, DARK, 0, 0.914, 0, { r: 0.025 }));
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) {
      g.add(cyl(0.125, 0.125, 0.015, '#b1c0c7', x, 0.93, z, { seg: 12, ...ns }));
      g.add(cyl(0.08, 0.08, 0.018, DARK, x, 0.945, z, { seg: 10, ...ns }));
    }
    g.add(cyl(0.14, 0.12, 0.16, PINK, -0.2, 0.964, -0.2, { seg: 12 }));
    g.add(cyl(0.15, 0.15, 0.025, CREAM, -0.2, 1.124, -0.2, { seg: 12 }));
    g.add(cbox(0.07, 0.04, 0.05, GOLD, -0.2, 1.17, -0.2, { r: 0.015, ...ns }));
    return g;
  },
  kitchen_fridge() {
    const g = group(); g.add(box(0.78, 0.1, 0.72, MINT_D, 0, 0, 0));
    g.add(box(0.87, 1.8, 0.83, CREAM, 0, 0.1, 0, { r: 0.09 }));
    g.add(cbox(0.79, 0.52, 0.07, MINT, 0, 1.58, 0.426, { r: 0.055 }));
    g.add(cbox(0.79, 1.13, 0.07, MINT, 0, 0.72, 0.426, { r: 0.055 }));
    handle(g, -0.26, 1.55, 0.48, true); handle(g, -0.26, 1.1, 0.48, true);
    g.add(cbox(0.18, 0.2, 0.012, WHITE, 0.14, 1.03, 0.47, { r: 0.012, rz: -0.1, ...ns }));
    g.add(cbox(0.06, 0.06, 0.025, PINK, 0.13, 1.13, 0.483, { r: 0.02, ...ns }));
    return g;
  },
  kitchen_pantry() {
    const g = group(); g.add(box(0.78, 0.11, 0.7, WOOD, 0, 0, 0));
    g.add(box(0.88, 0.86, 0.78, CREAM, 0, 0.11, 0, { r: 0.055 }));
    for (const x of [-0.405, 0.405]) g.add(box(0.07, 1.0, 0.78, CREAM, x, 0.97, 0, { r: 0.025 }));
    g.add(box(0.88, 0.07, 0.78, CREAM, 0, 1.9, 0, { r: 0.025 }));
    g.add(cbox(0.74, 0.75, 0.045, PINK, 0, 0.55, 0.4, { r: 0.025 })); handle(g, 0, 0.8, 0.45);
    g.add(cbox(0.73, 0.95, 0.04, '#e7dcc8', 0, 1.44, -0.36, { r: 0.02 }));
    for (const y of [1.03, 1.45, 1.87]) g.add(cbox(0.78, 0.055, 0.72, WHITE, 0, y, 0, { r: 0.018 }));
    for (const [x, y, color] of [[-0.2, 1.06, MINT_D], [0.18, 1.06, PINK], [-0.2, 1.48, PINK], [0.18, 1.48, MINT]]) jar(g, x, y, 0.29, color, 0.23);
    return g;
  },
  kitchen_hutch() {
    const g = cabinet();
    // 支撑背板一直连接到底柜，旋转 / 离墙摆放仍是完整独立家具。
    g.add(box(1.8, 1.35, 0.08, CREAM, 0, 0.9, -0.37, { r: 0.03 }));
    for (const x of [-0.86, 0.86]) g.add(box(0.07, 1.38, 0.07, GOLD, x, 0.89, -0.28, { r: 0.015 }));
    g.add(box(1.84, 0.62, 0.5, CREAM, 0, 1.64, -0.14, { r: 0.045 }));
    for (const x of [-0.45, 0.45]) {
      g.add(cbox(0.84, 0.5, 0.04, MINT, x, 1.95, 0.13, { r: 0.025 })); handle(g, x, 1.79, 0.17);
    }
    for (const x of [-0.56, 0.42]) jar(g, x, 0.9, -0.12, x < 0 ? PINK : MINT_D, 0.21);
    return g;
  },
  kitchen_microwave() {
    const g = cabinet(0.88, 0.84, PINK);
    g.add(box(0.8, 0.43, 0.64, CREAM, 0, 0.9, 0, { r: 0.055 }));
    g.add(cbox(0.5, 0.29, 0.035, DARK, -0.105, 1.115, 0.33, { r: 0.025 }));
    g.add(cbox(0.39, 0.2, 0.018, '#95b8be', -0.105, 1.115, 0.354, { r: 0.015, ...ns }));
    g.add(cbox(0.055, 0.25, 0.06, GOLD, 0.17, 1.115, 0.37, { r: 0.018, ...ns }));
    g.add(cbox(0.1, 0.045, 0.02, MINT_D, 0.29, 1.23, 0.34, { r: 0.008, ...ns }));
    for (const y of [1.08, 1.17]) g.add(cbox(0.055, 0.055, 0.02, GOLD, 0.29, y, 0.34, { r: 0.015, ...ns }));
    return g;
  },
  kitchen_island() {
    const g = cabinet(1.8, 1.26, MINT);
    g.add(box(1.92, 0.07, 1.68, WHITE, 0, 0.9, 0.12, { r: 0.055 }));
    g.add(cbox(0.55, 0.035, 0.38, WOOD, -0.4, 0.985, 0.08, { r: 0.06 }));
    g.add(cyl(0.2, 0.13, 0.12, PINK, 0.38, 0.97, 0.04, { seg: 12 }));
    for (const [x, z, color] of [[0.31, 0.03, '#f09d83'], [0.45, 0.04, '#edc46a'], [0.38, -0.06, '#9bca86']]) g.add(cbox(0.14, 0.13, 0.14, color, x, 1.12, z, { r: 0.055 }));
    return g;
  },
  bath_toilet() {
    const g = group();
    g.add(box(0.4, 0.28, 0.56, WHITE, 0, 0, 0.08, { r: 0.12 }));
    g.add(cbox(0.64, 0.31, 0.74, WHITE, 0, 0.34, 0.07, { r: 0.13 }));
    g.add(cbox(0.45, 0.035, 0.5, '#b3cbd1', 0, 0.505, 0.14, { r: 0.12 }));
    const seat = torus(0.235, 0.055, CREAM, 0, 0.55, 0.14, { rx: Math.PI / 2 }); seat.scale.set(1, 1.25, 0.6); g.add(seat);
    g.add(box(0.65, 0.67, 0.22, PINK, 0, 0.27, -0.31, { r: 0.065 }));
    g.add(cbox(0.69, 0.055, 0.25, WHITE, 0, 0.955, -0.31, { r: 0.025 }));
    g.add(cbox(0.12, 0.025, 0.07, metal(), 0.16, 0.995, -0.3, { r: 0.018, ...ns }));
    return g;
  },
  bath_vanity() {
    const g = cabinet(1.86, 0.86, PINK); basin(g, 0, 0.95, 0.03, 1, 0.55); faucet(g, 0, 0.9, -0.31, 0.9);
    g.add(box(1.77, 1.25, 0.07, MINT, 0, 0.9, -0.39, { r: 0.035 }));
    g.add(cbox(1.41, 0.94, 0.06, WHITE, 0, 1.61, -0.33, { r: 0.07 }));
    g.add(cbox(1.23, 0.76, 0.025, '#b8dce2', 0, 1.61, -0.285, { r: 0.055 }));
    g.add(cbox(0.045, 0.45, 0.009, '#e9f8f6', -0.38, 1.66, -0.267, { r: 0.01, rz: -0.35, ...ns }));
    g.add(cbox(0.025, 0.32, 0.009, '#e9f8f6', -0.27, 1.69, -0.267, { r: 0.008, rz: -0.35, ...ns }));
    jar(g, -0.73, 0.9, 0.03, MINT, 0.16); towel(g, 0.73, 0.97, 0.02, MINT, 0.27);
    return g;
  },
  bath_shower() {
    const g = group();
    g.add(box(1.76, 0.16, 1.76, WHITE, 0, 0, 0, { r: 0.09 }));
    g.add(box(1.56, 0.035, 1.56, '#d9eee8', 0, 0.16, 0, { r: 0.06 }));
    g.add(cyl(0.09, 0.09, 0.008, metal(), 0.35, 0.197, 0.35, { seg: 10, ...ns }));
    g.add(box(1.7, 2.16, 0.06, MINT, 0, 0.16, -0.83, { r: 0.025 }));
    for (const x of [-0.83, 0.83]) {
      g.add(box(0.055, 2.2, 0.055, WHITE, x, 0.16, 0.82, { r: 0.012 }));
      g.add(box(0.025, 2.06, 1.55, glass(), x, 0.22, 0, { cast: false }));
    }
    for (const side of [-1, 1]) {
      g.add(cbox(1.76, 0.055, 0.055, WHITE, 0, 2.35, side * 0.83, { r: 0.018 }));
      g.add(cbox(0.055, 0.055, 1.76, WHITE, side * 0.83, 2.35, 0, { r: 0.018 }));
    }
    g.add(box(1.55, 2.05, 0.022, glass(), 0, 0.22, 0.82, { cast: false }));
    handle(g, 0.49, 1.21, 0.87, true);
    g.add(box(0.05, 1.65, 0.05, metal(), 0, 0.5, -0.73, { r: 0.015 }));
    g.add(cbox(0.05, 0.05, 0.48, metal(), 0, 2.15, -0.52, { r: 0.015 }));
    g.add(cbox(0.36, 0.055, 0.28, DARK, 0, 2.12, -0.26, { r: 0.04 }));
    g.add(cbox(0.28, 0.06, 0.055, metal(), 0, 0.92, -0.67, { r: 0.015 }));
    g.add(cbox(0.32, 0.05, 0.2, WHITE, -0.5, 0.86, -0.66, { r: 0.025 }));
    jar(g, -0.5, 0.89, -0.66, PINK, 0.2);
    return g;
  },
  bath_tub() {
    const g = group();
    for (const x of [-0.53, 0.53]) for (const z of [-0.93, 0.93]) g.add(box(0.17, 0.17, 0.17, GOLD, x, 0, z, { r: 0.045 }));
    g.add(box(1.52, 0.22, 2.42, PINK, 0, 0.13, 0, { r: 0.1 }));
    for (const x of [-0.72, 0.72]) g.add(box(0.17, 0.48, 2.46, PINK, x, 0.24, 0, { r: 0.08 }));
    for (const z of [-1.17, 1.17]) g.add(box(1.52, 0.48, 0.17, PINK, 0, 0.24, z, { r: 0.08 }));
    g.add(cbox(1.24, 0.04, 2.1, water(), 0, 0.56, 0, { r: 0.12, cast: false }));
    for (const x of [-0.72, 0.72]) g.add(cbox(0.2, 0.09, 2.48, WHITE, x, 0.73, 0, { r: 0.045 }));
    for (const z of [-1.17, 1.17]) g.add(cbox(1.52, 0.09, 0.2, WHITE, 0, 0.73, z, { r: 0.045 }));
    faucet(g, 0, 0.76, -1.17, 1.1);
    g.add(cbox(0.56, 0.18, 0.3, MINT, 0, 0.76, 0.99, { r: 0.08 }));
    for (const [x, z, s] of [[-0.36, -0.55, 0.18], [-0.18, -0.67, 0.13], [0.22, 0.43, 0.14]]) g.add(cbox(s, s * 0.55, s, WHITE, x, 0.62, z, { r: s * 0.3, ...ns }));
    return g;
  },
  bath_washer() {
    const g = group(); g.add(box(0.78, 0.08, 0.72, MINT_D, 0, 0, 0));
    g.add(box(0.89, 0.89, 0.82, CREAM, 0, 0.08, 0, { r: 0.065 }));
    g.add(cbox(0.75, 0.15, 0.04, MINT, 0, 0.84, 0.43, { r: 0.025 }));
    g.add(cbox(0.22, 0.065, 0.025, DARK, -0.18, 0.84, 0.46, { r: 0.015, ...ns }));
    g.add(cyl(0.05, 0.05, 0.025, GOLD, 0.25, 0.8275, 0.46, { rx: Math.PI / 2, seg: 10, ...ns }));
    g.add(cyl(0.26, 0.26, 0.035, DARK, 0, 0.4625, 0.43, { rx: Math.PI / 2, seg: 18 }));
    g.add(cyl(0.2, 0.2, 0.035, '#95bbc9', 0, 0.4625, 0.455, { rx: Math.PI / 2, seg: 18 }));
    g.add(torus(0.255, 0.043, MINT, 0, 0.48, 0.47));
    g.add(cbox(0.14, 0.06, 0.035, WHITE, 0.07, 0.36, 0.48, { r: 0.025, rz: 0.2, ...ns }));
    towel(g, 0, 1.03, 0, PINK, 0.58); towel(g, 0, 1.15, 0, MINT, 0.52);
    return g;
  },
  bath_towelrack() {
    const g = group();
    for (const x of [-0.34, 0.34]) {
      g.add(cbox(0.18, 0.07, 0.64, WOOD, x, 0.035, 0, { r: 0.025 }));
      g.add(box(0.045, 1.18, 0.045, GOLD, x, 0.07, -0.13, { r: 0.012 }));
      g.add(box(0.045, 0.86, 0.045, GOLD, x, 0.07, 0.22, { r: 0.012 }));
    }
    for (const [y, z, color] of [[1.23, -0.13, MINT], [0.91, 0.22, PINK]]) {
      g.add(cbox(0.74, 0.045, 0.045, GOLD, 0, y, z, { r: 0.012 }));
      g.add(cbox(0.49, 0.47, 0.035, color, 0, y - 0.2, z + 0.035, { r: 0.014 }));
      g.add(cbox(0.46, 0.035, 0.008, WHITE, 0, y - 0.36, z + 0.056, { r: 0.008, ...ns }));
    }
    return g;
  },
  bath_laundrybasket() {
    const g = group();
    g.add(box(0.63, 0.57, 0.63, WOOD, 0, 0, 0, { r: 0.11 }));
    for (const y of [0.14, 0.27, 0.4, 0.53]) for (const side of [-1, 1]) {
      g.add(cbox(0.57, 0.025, 0.012, '#edcc9e', 0, y, side * 0.316, { r: 0.006, ...ns }));
      g.add(cbox(0.012, 0.025, 0.57, '#edcc9e', side * 0.316, y, 0, { r: 0.006, ...ns }));
    }
    g.add(cbox(0.51, 0.025, 0.51, '#ad896c', 0, 0.575, 0, { r: 0.07 }));
    for (const x of [-0.32, 0.32]) {
      const h = torus(0.1, 0.025, WOOD, x, 0.51, 0, { ry: Math.PI / 2 }); g.add(h);
    }
    towel(g, -0.05, 0.61, 0, MINT, 0.43); towel(g, 0.04, 0.7, 0.03, PINK, 0.35);
    return g;
  },
};

// 门把手仍在其占地内，靠墙与相邻家具并排时不会额外穿出网格。
for (const [id, build] of Object.entries(HOUSE_FURNITURE_BUILD)) {
  HOUSE_FURNITURE_BUILD[id] = () => {
    const g = build();
    for (const part of g.children) part.position.z -= 0.03;
    g.userData.indoorOnly = true;
    return g;
  };
}
