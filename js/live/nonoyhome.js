// 诺诺伊的家：小岛西南角的一座小屋。外面是一栋带小花园的红顶木屋，从门口进去是单独的室内（和暖暖的家一样）。
// 屋里摆的特有家具和玩偶，就是亲密度会陆续送给暖暖的那几件。每到小镇的晚上，诺诺伊会从大纸鹤那边回到家里。
import { THREE, cbox, box, cyl, gable, slab, group, mat, glow, textPlane } from '../core/kit.js';
import { S, bus } from '../core/state.js';
import { buildDecor } from '../models/props.js';
import { DOORS } from '../world/town.js';
import { visitors } from './visitors.js';

export const NHOME = { x: -36, z: 13.2, w: 6, d: 4.6 }; // 小屋在岛上的位置和占地
export const NROOM = { cx: 1000, cz: 0, w: 14, d: 11 }; // 室内放在很远的地方，进门时切过去
const ENTRY = { x: -0.4, w: 2.6 };
const PARTITION = { x: -1.2, d: 3.4 };
const LOW_SHELF = { x: 4.3, z: 1.1, w: 2.7, d: 0.5 };
const ZONE = 'nhome';
const ns = { cast: false, receive: false };
const WALL = '#fff3e6', TRIM = '#e9b9a2', WOOD = '#c99d77', WOOD_D = '#a67c58', RED = '#d9584a', RED_D = '#b8433a';
// 晚上（黄昏快结束到清晨）在家，其余时间在大纸鹤旁
export const nonoyAtHome = () => S.clock >= 0.72 || S.clock < 0.06;

// ————— 外观：红顶小木屋 + 小花园 —————
function cottage() {
  const g = group();
  const { w, d } = NHOME, hw = w / 2, hd = d / 2, H = 2.7, TOP = 0.3 + H;
  g.add(box(w + 0.7, 0.3, d + 0.7, '#e4dcd2', 0, 0, 0, { r: 0.08 }));
  g.add(box(w, H, d, '#fff6ea', 0, 0.3, 0, { r: 0.08 }));
  g.add(box(w + 0.04, 0.6, d + 0.04, '#f3d9c4', 0, 0.3, 0, { r: 0.08, cast: false }));
  // 木框架：四角立柱 + 檐下一圈横梁
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.26, H, 0.26, WOOD_D, sx * (hw - 0.02), 0.3, sz * (hd - 0.02), { r: 0.05 }));
  g.add(box(w + 0.1, 0.16, d + 0.1, WOOD_D, 0, TOP - 0.1, 0, { r: 0.04 }));
  // 屋顶：正面是三角山墙，红瓦屋面向两边挑出；山墙外沿一道白色封檐板
  const mainRoof = gable(w + 1.3, 2.5, d + 1.0, RED, 0, TOP, 0);
  mainRoof.userData.seasonalRoof = { gable: true }; g.add(mainRoof);
  g.add(gable(w + 0.2, 2.06, d + 1.06, '#fff6ea', 0, TOP, 0));
  const roofRidge = cbox(0.26, 0.2, d + 1.3, RED_D, 0, TOP + 2.5, 0, { r: 0.07 });
  roofRidge.userData.seasonalRoof = true; g.add(roofRidge);
  const slope = Math.atan2(2.5, (w + 1.3) / 2), len = Math.hypot(2.5, (w + 1.3) / 2);
  for (const sx of [-1, 1]) {
    g.add(cbox(len + 0.1, 0.12, 0.14, '#ffffff', sx * (w + 1.3) / 4, TOP + 1.25 + 0.04, hd + 0.58, { r: 0.03, rz: -sx * slope }));
    for (const k of [0.34, 0.68]) g.add(cbox(0.1, 0.06, d + 1.04, RED_D, sx * ((w + 1.3) / 2) * k, TOP + 2.5 * (1 - k) + 0.05, 0, { r: 0.02, rz: -sx * slope, cast: false }));
  }
  // 山墙上的圆窗，屋脊上一只跟着风转的小纸鹤
  const rw = cyl(0.5, 0.5, 0.1, '#ffffff', 0, 0, 0, { seg: 20 }); rw.rotation.x = Math.PI / 2; rw.position.set(0, TOP + 0.9, hd + 0.5); g.add(rw);
  const rg = cyl(0.4, 0.4, 0.04, glow('#dff3ff', '#ffe9b8', 0.35, 2.0), 0, 0, 0, { seg: 20, cast: false }); rg.rotation.x = Math.PI / 2; rg.position.set(0, TOP + 0.9, hd + 0.61); g.add(rg);
  g.add(cbox(0.06, 0.8, 0.05, '#ffffff', 0, TOP + 0.9, hd + 0.66, ns)); g.add(cbox(0.8, 0.06, 0.05, '#ffffff', 0, TOP + 0.9, hd + 0.66, ns));
  const bird = group(0, TOP + 2.62, hd + 0.3);
  bird.add(box(0.05, 0.36, 0.05, '#8a8f9c', 0, 0, 0, ns));
  bird.add(cbox(0.4, 0.12, 0.14, '#ffffff', 0, 0.46, 0, { r: 0.03 })); bird.add(cbox(0.2, 0.05, 0.05, '#ffffff', 0.26, 0.58, 0, { r: 0.015, rz: 0.7 })); bird.add(cbox(0.2, 0.05, 0.05, '#ffffff', -0.26, 0.56, 0, { r: 0.015, rz: -0.6 }));
  for (const sz of [-1, 1]) bird.add(cbox(0.22, 0.03, 0.3, '#ffffff', 0, 0.52, sz * 0.18, { r: 0.01, rx: -sz * 0.4 }));
  g.add(bird);
  // 门：圆角红门、门上的小雨棚、两级台阶、两盏壁灯
  g.add(box(1.7, 0.14, 0.9, '#d6ccc0', 0, 0, hd + 0.75, { r: 0.05 }));
  g.add(box(1.3, 0.3, 0.6, '#e4dcd2', 0, 0, hd + 0.55, { r: 0.05 }));
  g.add(box(1.16, 2.0, 0.12, WOOD_D, 0, 0.3, hd + 0.02, { r: 0.05 }));
  g.add(box(0.94, 1.86, 0.14, RED, 0, 0.3, hd + 0.05, { r: 0.3 }));
  g.add(cbox(0.36, 0.36, 0.06, glow('#fff3c4', '#ffd76a', 0.4, 2.0), 0, 1.72, hd + 0.13, { r: 0.16, ...ns }));
  g.add(cbox(0.09, 0.09, 0.09, '#ffd76a', 0.3, 1.2, hd + 0.14, { r: 0.04 }));
  const porchRoof = gable(1.8, 0.5, 0.8, RED_D, 0, 2.36, hd + 0.4);
  porchRoof.userData.seasonalRoof = { gable: true }; g.add(porchRoof);
  for (const sx of [-1, 1]) { g.add(cbox(0.06, 0.56, 0.06, WOOD_D, sx * 0.78, 2.16, hd + 0.4, { r: 0.02, rx: 0.9 })); g.add(cbox(0.2, 0.05, 0.2, WOOD_D, sx * 0.98, 1.98, hd + 0.16, { r: 0.02 })); g.add(cbox(0.16, 0.24, 0.16, glow('#fff3c4', '#ffc864', 0.4, 2.6), sx * 0.98, 1.82, hd + 0.16, { r: 0.05 })); }
  // 窗：白窗框、绿色百叶、窗下花箱；正面两扇，两侧各一扇
  const win = (x, y, z, ry = 0) => {
    const wg = group(x, y, z); wg.rotation.y = ry;
    wg.add(cbox(1.1, 1.1, 0.1, '#ffffff', 0, 0, 0, { r: 0.05 }));
    wg.add(cbox(0.92, 0.92, 0.1, glow('#dff3ff', '#ffe9b8', 0.35, 2.0), 0, 0, 0.02, { r: 0.04, cast: false }));
    wg.add(cbox(0.05, 0.92, 0.12, '#ffffff', 0, 0, 0.03, ns)); wg.add(cbox(0.92, 0.05, 0.12, '#ffffff', 0, 0, 0.03, ns));
    for (const sx of [-1, 1]) { wg.add(cbox(0.3, 1.14, 0.07, '#7fb7a3', sx * 0.72, 0, 0.02, { r: 0.03 })); for (let i = 0; i < 4; i++) wg.add(cbox(0.24, 0.035, 0.08, '#6aa390', sx * 0.72, -0.36 + i * 0.24, 0.03, ns)); }
    wg.add(cbox(1.3, 0.24, 0.3, WOOD, 0, -0.74, 0.14, { r: 0.05 }));
    ['#ff9fbd', '#ffe27a', '#ffffff', '#ff9fbd', '#c9b6f2'].forEach((c, i) => { wg.add(cbox(0.2, 0.2, 0.2, c, -0.48 + i * 0.24, -0.54, 0.16, { r: 0.08 })); wg.add(cbox(0.12, 0.1, 0.12, '#8fd694', -0.42 + i * 0.24, -0.62, 0.24, { r: 0.04 })); });
    g.add(wg);
  };
  win(-1.85, 1.72, hd + 0.06); win(1.85, 1.72, hd + 0.06); win(hw + 0.06, 1.72, 0.2, Math.PI / 2); win(-hw - 0.06, 1.72, 0.2, -Math.PI / 2);
  // 檐下挂一排发光的愿望瓶
  for (let i = 0; i < 7; i++) { const x = -2.4 + i * 0.8; if (Math.abs(x) < 1.1) continue; g.add(cbox(0.012, 0.3, 0.012, '#d9b46a', x, TOP - 0.28, hd + 0.44, ns)); g.add(cbox(0.13, 0.18, 0.13, glow('#fff3c4', ['#ffd76a', '#ff9fbd', '#9fe0c5'][i % 3], 0.5, 2.4), x, TOP - 0.5, hd + 0.44, { r: 0.05, ...ns })); }
  // 烟囱和炊烟
  g.add(box(0.6, 1.9, 0.6, '#e9b9a2', 1.9, TOP + 0.3, -0.7, { r: 0.06 }));
  g.add(box(0.74, 0.16, 0.74, '#d98f7a', 1.9, TOP + 2.2, -0.7, { r: 0.05 }));
  const puffs = [];
  for (let i = 0; i < 3; i++) { const p = cbox(0.34, 0.3, 0.34, mat('#ffffff', { opacity: 0.8 }), 1.9, 0, -0.7, { r: 0.13, ...ns }); p.userData.k = i / 3; g.add(p); puffs.push(p); }
  // 小花园：白栅栏、踏脚石、信箱、名牌、花丛
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) { const x = sx * (1.3 + i * 0.6); g.add(box(0.12, 0.62, 0.08, '#ffffff', x, 0, hd + 2.3, { r: 0.03 })); g.add(cbox(0.13, 0.13, 0.08, '#ffffff', x, 0.64, hd + 2.3, { r: 0.02, rz: Math.PI / 4 })); }
    g.add(cbox(2.7, 0.07, 0.05, '#ffffff', sx * 2.5, 0.24, hd + 2.3, { r: 0.02 })); g.add(cbox(2.7, 0.07, 0.05, '#ffffff', sx * 2.5, 0.48, hd + 2.3, { r: 0.02 }));
    for (let i = 0; i < 3; i++) { const bx = sx * (1.7 + i * 0.8), bz = hd + 1.2 + (i % 2) * 0.5; g.add(cbox(0.6, 0.44, 0.6, i % 2 ? '#8fd694' : '#a9e3a0', bx, 0.2, bz, { r: 0.18 })); for (let k = 0; k < 3; k++) g.add(cbox(0.14, 0.14, 0.14, ['#ff9fbd', '#ffe27a', '#ffffff'][(i + k) % 3], bx - 0.18 + k * 0.18, 0.46, bz + 0.1 - (k % 2) * 0.2, { r: 0.05 })); }
  }
  for (let i = 0; i < 3; i++) g.add(cyl(0.34, 0.36, 0.06, '#f1e9df', (i % 2 ? 0.14 : -0.14), 0.0, hd + 1.5 + i * 0.62, { seg: 10, cast: false }));
  const sign = group(1.15, 0, hd + 2.5);
  sign.add(box(0.1, 1.1, 0.1, WOOD_D, 0, 0, 0, { r: 0.03 }));
  sign.add(cbox(1.38, 0.56, 0.06, RED, 0, 0.92, 0, { r: 0.1 })); sign.add(cbox(1.26, 0.44, 0.08, '#fff6ea', 0, 0.92, 0.02, { r: 0.07 }));
  const tx = textPlane('诺诺伊的家', { color: '#a53023', height: 0.22, size: 48 }); tx.position.set(0, 0.92, 0.07); sign.add(tx);
  sign.rotation.y = -0.15; g.add(sign);
  const mail = group(-1.1, 0, hd + 2.5);
  mail.add(box(0.08, 0.9, 0.08, WOOD_D, 0, 0, 0, { r: 0.02 })); mail.add(cbox(0.36, 0.26, 0.5, RED, 0, 1.0, 0, { r: 0.1 })); mail.add(cbox(0.04, 0.2, 0.04, '#ffd76a', 0.2, 1.12, 0.1, ns)); mail.add(cbox(0.14, 0.1, 0.03, '#ffd76a', 0.2, 1.2, 0.16, ns));
  g.add(mail);
  g.userData.dyn = [bird, ...puffs];
  g.userData.tick = (time) => {
    bird.rotation.y = Math.sin(time * 0.6) * 0.8;
    for (const p of puffs) { const u = (time * 0.18 + p.userData.k) % 1; p.position.set(1.9 + Math.sin(u * 5) * 0.2 + u * 0.5, TOP + 2.5 + u * 1.8, -0.7); p.scale.setScalar(0.5 + u * 0.9); p.material.opacity = 0.8 * (1 - u); }
  };
  return g;
}

// ————— 室内 —————
function interior() {
  const g = group();
  const { w, d } = NROOM, x0 = -w / 2, z0 = -d / 2;
  // 屋外垫一大块暖色的地，镜头里不露出海面
  g.add(slab(46, 34, 3, 0.3, '#e9d5c0', 0, -0.36, 0, { bevel: 0.1, cast: false }));
  for (let i = 0; i < 10; i++) g.add(box(w, 0.06, d / 10 - 0.02, i % 2 ? '#e3bd92' : '#dcb388', 0, -0.04, z0 + (i + 0.5) * (d / 10), { cast: false }));
  // 北墙和西墙是整面的；南墙、东墙只留矮矮一截，镜头从东南看进来
  const wall = (ww, hh, dd, x, z) => { g.add(box(ww, hh, dd, WALL, x, 0, z, { r: 0.04 })); g.add(box(ww + 0.02, 0.5, dd + 0.02, TRIM, x, 0, z, { r: 0.04 })); g.add(box(ww + 0.04, 0.08, dd + 0.04, '#ffffff', x, 0.5, z, { r: 0.02, cast: false })); };
  wall(w + 0.6, 3.4, 0.3, 0, z0 - 0.15);
  wall(0.3, 3.4, d + 0.3, x0 - 0.15, 0);
  const leftDoor = ENTRY.x - ENTRY.w / 2, rightDoor = ENTRY.x + ENTRY.w / 2;
  for (const [ww, dd, x, z] of [[0.3, d + 0.3, -x0 + 0.15, 0], [leftDoor - x0, 0.3, (x0 + leftDoor) / 2, -z0 + 0.15], [-x0 - rightDoor, 0.3, (-x0 + rightDoor) / 2, -z0 + 0.15]]) { g.add(box(ww, 0.5, dd, TRIM, x, 0, z, { r: 0.05 })); g.add(box(ww + 0.06, 0.08, dd + 0.06, '#ffffff', x, 0.5, z, { r: 0.03, cast: false })); }
  g.add(box(w + 0.7, 0.16, 0.42, '#d98f7a', 0, 3.4, z0 - 0.15, { r: 0.04 }));
  g.add(box(0.42, 0.16, d + 0.4, '#d98f7a', x0 - 0.15, 3.4, 0, { r: 0.04 }));
  // 北墙：两扇亮着的窗 + 窗帘；一排相框
  for (const x of [-4.8, 3.4]) {
    g.add(cbox(1.5, 1.3, 0.1, '#ffffff', x, 2.0, z0 + 0.04, { r: 0.05 }));
    g.add(cbox(1.3, 1.1, 0.1, glow('#dff3ff', '#ffe9b8', 0.4, 1.8), x, 2.0, z0 + 0.06, { r: 0.04, cast: false }));
    g.add(cbox(0.06, 1.1, 0.12, '#ffffff', x, 2.0, z0 + 0.07, ns)); g.add(cbox(1.3, 0.06, 0.12, '#ffffff', x, 2.0, z0 + 0.07, ns));
    for (const sx of [-1, 1]) g.add(cbox(0.34, 1.5, 0.1, '#ffc2d6', x + sx * 0.82, 2.0, z0 + 0.1, { r: 0.06 }));
    g.add(cbox(2.1, 0.1, 0.14, WOOD_D, x, 2.8, z0 + 0.1, { r: 0.03 }));
  }
  [['#ffe9a8', -0.6, 2.3, 0.5, 0.62], ['#cfe6fb', 0.05, 2.1, 0.42, 0.5], ['#ffc2d6', 0.62, 2.36, 0.4, 0.4]].forEach(([c, x, y, ww, hh]) => {
    g.add(cbox(ww + 0.1, hh + 0.1, 0.06, WOOD_D, x, y, z0 + 0.05, { r: 0.02 }));
    g.add(cbox(ww, hh, 0.06, c, x, y, z0 + 0.065, { r: 0.01, ...ns }));
    g.add(cbox(ww * 0.34, hh * 0.4, 0.06, '#ffffff', x - ww * 0.14, y - hh * 0.08, z0 + 0.07, { r: 0.03, ...ns }));
    g.add(cbox(ww * 0.26, hh * 0.3, 0.06, '#c9412f', x + ww * 0.18, y - hh * 0.12, z0 + 0.07, { r: 0.03, ...ns }));
  });
  // 西墙：一串小彩灯
  for (let i = 0; i < 9; i++) g.add(cbox(0.1, 0.1, 0.1, glow(['#ffd76a', '#ff9fbd', '#9fe0c5'][i % 3], ['#ffd76a', '#ff9fbd', '#9fe0c5'][i % 3], 0.6, 2.4), x0 + 0.06, 2.8 - Math.sin((i / 8) * Math.PI) * 0.28, z0 + 0.8 + i * (d - 1.6) / 8, { r: 0.03, ...ns }));
  // 手作角的墙面收纳：纸样、便签和层板只挂在墙上，不占用脚下的通道。
  const board = group(x0 + 0.07, 1.85, 2.8); board.rotation.y = Math.PI / 2;
  board.add(cbox(1.55, 1.0, 0.06, WOOD_D, 0, 0, 0, { r: 0.04 }));
  board.add(cbox(1.42, 0.86, 0.07, '#d8b78d', 0, 0, 0.015, { r: 0.03 }));
  for (const [x, y, color, tilt] of [[-0.4, 0.14, '#fffdf8', -0.08], [0.05, -0.13, '#cfe6fb', 0.1], [0.44, 0.18, '#ffe9a8', -0.12]]) {
    board.add(cbox(0.32, 0.4, 0.025, color, x, y, 0.065, { rz: tilt, ...ns }));
    board.add(cbox(0.04, 0.04, 0.04, RED, x, y + 0.15, 0.09, { r: 0.012, ...ns }));
  }
  g.add(board);
  // 壁炉上方的圆钟和卧室墙饰，让扩建后的高墙也有生活痕迹。
  const clock = group(1.08, 2.62, z0 + 0.13);
  clock.add(cyl(0.3, 0.3, 0.09, WOOD_D, 0, 0, 0, { seg: 20, rx: Math.PI / 2 }));
  clock.add(cyl(0.25, 0.25, 0.1, '#fffdf8', 0, 0, 0.02, { seg: 20, rx: Math.PI / 2, ...ns }));
  clock.add(cbox(0.035, 0.17, 0.04, WOOD_D, 0, 0.075, 0.08, ns));
  clock.add(cbox(0.16, 0.03, 0.04, WOOD_D, 0.065, 0, 0.08, ns));
  g.add(clock);
  // 隔断一：卧室和客厅之间，下面矮墙、上面一排木格栅，尽头一根立柱
  const px = PARTITION.x, pd = PARTITION.d;
  g.add(box(0.16, 0.9, pd, WALL, px, 0, z0 + pd / 2, { r: 0.03 }));
  g.add(box(0.22, 0.07, pd + 0.06, WOOD, px, 0.9, z0 + pd / 2, { r: 0.02 }));
  for (let i = 0; i < 9; i++) g.add(box(0.07, 1.6, 0.07, WOOD, px, 0.97, z0 + 0.2 + i * (pd - 0.4) / 8, { r: 0.02 }));
  g.add(box(0.2, 0.1, pd + 0.06, WOOD_D, px, 2.57, z0 + pd / 2, { r: 0.02 }));
  g.add(box(0.22, 2.67, 0.22, WOOD_D, px, 0, z0 + pd + 0.1, { r: 0.04 }));
  // 隔断二：客厅和门厅之间的矮书柜，上面摆着绿植和小夜灯
  const { x: bx, z: bz, w: bw, d: bd } = LOW_SHELF;
  g.add(box(bw - 0.1, 0.9, bd - 0.06, '#fff6ea', bx, 0, bz, { r: 0.05 }));
  g.add(box(bw, 0.07, bd, WOOD, bx, 0.9, bz, { r: 0.02 }));
  for (let i = 0; i < 4; i++) { g.add(cbox(0.56, 0.3, 0.04, WALL, bx - 0.96 + i * 0.64, 0.22, bz + 0.23, { r: 0.02 })); for (let k = 0; k < 4; k++) g.add(cbox(0.1, 0.3 - (k % 2) * 0.05, 0.3, ['#ff9fbd', '#8fd0f5', '#ffe27a', '#b9a4f2'][(i + k) % 4], bx - 1.16 + i * 0.64 + k * 0.12, 0.62, bz + 0.02, { r: 0.015 })); }
  // 门厅：门垫
  g.add(cbox(1.5, 0.04, 0.9, '#ff9fbd', ENTRY.x, 0.04, -z0 - 0.7, { r: 0.1, cast: false }));
  g.add(cbox(1.2, 0.045, 0.6, '#ffe9f0', ENTRY.x, 0.04, -z0 - 0.7, { r: 0.08, cast: false }));
  return g;
}

// 本屋专用的矮家具。复用现有材质和几何体，不增加图片或额外光源。
const HOME_BUILD = {
  wardrobe() {
    const g = group();
    g.add(box(1.5, 2.0, 0.65, '#fff6ea', 0, 0, 0, { r: 0.06 }));
    g.add(box(1.58, 0.09, 0.7, WOOD, 0, 2.0, 0, { r: 0.03 }));
    for (const sx of [-1, 1]) {
      g.add(box(0.67, 1.68, 0.05, '#c9ded0', sx * 0.36, 0.15, 0.335, { r: 0.03 }));
      g.add(cbox(0.06, 0.18, 0.06, WOOD_D, sx * 0.09, 1.0, 0.38, { r: 0.02 }));
    }
    g.add(box(0.65, 0.26, 0.46, '#e9b9a2', -0.3, 2.09, 0, { r: 0.05 }));
    g.add(cbox(0.32, 0.03, 0.24, '#fff6ea', -0.3, 2.36, 0, ns));
    return g;
  },
  ottoman() {
    const g = group();
    for (const x of [-0.6, 0.6]) g.add(box(0.1, 0.2, 0.38, WOOD_D, x, 0, 0, { r: 0.025 }));
    g.add(box(1.5, 0.28, 0.55, '#c9ded0', 0, 0.15, 0, { r: 0.09 }));
    g.add(box(0.42, 0.05, 0.5, '#fff6ea', 0.35, 0.43, 0, { r: 0.025 }));
    return g;
  },
  sideboard() {
    const g = group();
    g.add(box(2.0, 0.85, 0.65, '#fff6ea', 0, 0, 0, { r: 0.05 }));
    g.add(box(2.08, 0.09, 0.72, WOOD, 0, 0.85, 0, { r: 0.03 }));
    for (const x of [-0.66, 0, 0.66]) {
      g.add(box(0.58, 0.62, 0.035, '#c9ded0', x, 0.12, 0.34, { r: 0.025 }));
      g.add(cbox(0.15, 0.035, 0.04, WOOD_D, x, 0.61, 0.37, { r: 0.01 }));
    }
    for (const [x, c] of [[-0.64, '#ffb3cb'], [-0.35, '#cfe6fb']]) {
      g.add(cyl(0.11, 0.11, 0.26, c, x, 0.94, 0, { seg: 10 }));
      g.add(cyl(0.12, 0.12, 0.035, WOOD_D, x, 1.2, 0, { seg: 10 }));
    }
    for (let i = 0; i < 3; i++) g.add(cyl(0.22, 0.22, 0.025, '#ffffff', 0.47, 0.94 + i * 0.025, 0.02, { seg: 12 }));
    return g;
  },
  materialChest() {
    const g = group();
    g.add(box(1.7, 0.64, 0.65, WOOD, 0, 0, 0, { r: 0.05 }));
    g.add(box(1.78, 0.08, 0.71, '#fff6ea', 0, 0.64, 0, { r: 0.04 }));
    for (const x of [-0.55, 0, 0.55]) {
      g.add(box(0.48, 0.4, 0.04, '#e9dcc6', x, 0.12, 0.345, { r: 0.025 }));
      g.add(cbox(0.2, 0.09, 0.055, '#fff6ea', x, 0.37, 0.375, { r: 0.018 }));
    }
    return g;
  },
  teaTable() {
    const g = buildDecor('dining');
    for (const [x, z, c] of [[-0.44, 0.34, '#cfe6fb'], [0.42, -0.34, '#ffe9a8']]) {
      g.add(cyl(0.12, 0.12, 0.025, '#fff6ea', x, 0.855, z, { seg: 12 }));
      g.add(cyl(0.075, 0.065, 0.12, c, x, 0.88, z, { seg: 10 }));
      g.add(cyl(0.056, 0.056, 0.012, '#aa7756', x, 0.997, z, { seg: 10, ...ns }));
    }
    g.add(cbox(0.35, 0.04, 0.25, '#c9ded0', -0.39, 0.87, -0.36, { r: 0.015, ry: -0.18 }));
    return g;
  },
};

// 家具摆放：[家具 id, x, z, 朝向, 缩放, 抬高]（坐标相对房间中心）
const LAYOUT = [
  // 卧室（西北）：床和梳妆台靠墙，隔断末端到门厅留出通道。
  ['bed', -5.7, -3.8, 0, 1.0], ['n_crane', -6.1, -4.4, 0.5, 0.7, 0.72], ['n_momo', -5.2, -3.3, -0.3, 0.6, 0.66],
  ['n_lamp', -4.0, -4.9, 0, 1.2, 0], ['vanity', -2.4, -4.85, 0, 0.9], ['n_mobile', -6.5, -1.5, 0.4, 1.0],
  ['wardrobe', -6.55, -0.25, Math.PI / 2, 1.0], ['ottoman', -3.4, -1.15, 0, 1.0],
  ['rug', -3.75, -2.55, Math.PI / 2, 0.83],
  // 客厅（东北）：茶几与沙发之间可走，书架靠东墙，中央不再被书架堵住。
  ['rug', 3.4, -2.2, 0, 1.0], ['sofa', 3.4, -4.7, 0, 1.0], ['coffee', 3.4, -2.2, 0, 0.95], ['n_bean', 5.7, -1.4, -0.9, 0.95], ['n_momo', 2.3, -4.7, 0.2, 0.5, 0.5],
  ['bookshelf', 6.55, -3.7, -Math.PI / 2, 0.9], ['floorlamp', 5.6, -4.9, 0, 1.0], ['fireplace', 0.15, -5.1, 0, 0.82], ['plant', 1.48, -4.95, 0, 0.75], ['plant', LOW_SHELF.x + 1.0, LOW_SHELF.z, 0, 0.7, 0.97], ['n_lamp', LOW_SHELF.x - 0.8, LOW_SHELF.z, 0, 0.8, 0.97],
  // 工作间（西南）：屏风移到左侧，椅子与工作台之间留出空间。
  ['n_bench', -6.3, 2.8, Math.PI / 2, 1.0], ['n_shelf', -6.55, 4.4, Math.PI / 2, 1.0], ['n_screen', -3.4, 1.25, 0, 1.0], ['n_crane', -3.5, 4.95, 2.4, 0.6, 0.72], ['chair', -4.4, 3.4, -Math.PI / 2, 0.9],
  ['materialChest', -3.1, 5.0, Math.PI, 1.0], ['rug', -4.8, 3.15, Math.PI / 2, 1.0],
  // 茶餐角（东南）：填满原先的大块空地，桌边和门厅之间仍留出整条宽通道。
  ['rug', 3.55, 3.7, 0, 1.28], ['teaTable', 3.45, 3.65, Math.PI / 2, 1.0],
  ['sideboard', 6.5, 3.75, -Math.PI / 2, 1.0], ['plant', 6.25, 2.1, 0, 0.85],
  ['floorlamp', 1.95, 4.95, 0, 0.88], ['catbed', 5.5, 5.0, 0, 0.75],
];
// 碰撞取实际模型的世界包围盒，跟随位置、缩放和旋转，避免挪家具后留下隐形墙。
// 地毯、床上的玩偶和轻小摆件不占用走路空间。
const SOLID_FURNITURE = new Set(['bed', 'vanity', 'sofa', 'coffee', 'n_bean', 'bookshelf', 'n_bench', 'n_shelf', 'n_screen', 'chair', 'wardrobe', 'ottoman', 'fireplace', 'materialChest', 'teaTable', 'sideboard']);

export function installNonoyHome(game) {
  const town = game.town, { x: hx, z: hz, w: hw, d: hd } = NHOME, { cx, cz, w, d } = NROOM;
  // —— 岛上的小屋：先把这块地上原来的树和灌木挪走 ——
  const inLot = (x, z) => x > hx - hw / 2 - 2.2 && x < hx + hw / 2 + 2.2 && z > hz - hd / 2 - 1.2 && z < hz + hd / 2 + 4.2;
  for (const o of town.scene.children.filter((c) => c.isGroup && c.position.y < 1 && inLot(c.position.x, c.position.z))) town.scene.remove(o);
  town.circles = town.circles.filter((c) => !inLot(c.x, c.z));
  town.place(cottage(), hx, hz, 0);
  town.addRect(hx - hw / 2 - 0.3, hx + hw / 2 + 0.3, hz - hd / 2 - 0.3, hz + hd / 2 + 0.4, 'live');
  for (const sx of [-1, 1]) town.addRect(hx + (sx > 0 ? 1.1 : -3.9), hx + (sx > 0 ? 3.9 : -1.1), hz + hd / 2 + 2.2, hz + hd / 2 + 2.4, 'live');
  const door = { x: hx, z: hz + hd / 2 + 1.1 }, inDoor = { x: cx + ENTRY.x, z: cz + d / 2 - 0.5 };
  town.inter.push({ id: 'nhomeDoor', x: door.x, z: door.z, r: 1.7, prio: 0.3, label: '拜访 诺诺伊的家', sub: () => (nonoyAtHome() ? '诺诺伊在家' : '诺诺伊白天在大纸鹤那边，屋里可以随便看看'),
    act: () => game.travelTo(ZONE, inDoor.x, inDoor.z - 0.9, '来到了诺诺伊的家'), marker: town.marker(door.x, 6.4, door.z - 1.2, RED) });

  // —— 室内：单独的一块区域 ——
  town.place(interior(), cx, cz, 0);
  const ticks = [];
  for (const [id, x, z, ry = 0, sc = 1, y = 0] of LAYOUT) {
    const m = HOME_BUILD[id] ? HOME_BUILD[id]() : buildDecor(id);
    m.userData.decorId = id;
    m.userData.nonoyFurniture = true;
    m.scale.setScalar(sc);
    m.position.set(cx + x, y, cz + z);
    m.rotation.y = ry;
    town.scene.add(m);
    if (SOLID_FURNITURE.has(id)) {
      const bounds = new THREE.Box3().setFromObject(m);
      town.addRect(bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z, 'live');
    }
    if (m.userData.tick) ticks.push(m.userData.tick);
  }
  town.ticks.push((time, dt) => { if (town.zone === ZONE) for (const f of ticks) f(time, dt); });
  town.rooms[ZONE] = { x0: cx - w / 2 + 0.45, x1: cx + w / 2 - 0.5, z0: cz - d / 2 + 0.45, z1: cz + d / 2 + 0.2 };
  const R = (x0, x1, z0, z1) => town.addRect(cx + x0, cx + x1, cz + z0, cz + z1, 'live');
  R(-w / 2, ENTRY.x - ENTRY.w / 2, d / 2 - 0.1, d / 2 + 0.4); R(ENTRY.x + ENTRY.w / 2, w / 2, d / 2 - 0.1, d / 2 + 0.4);
  R(LOW_SHELF.x - LOW_SHELF.w / 2, LOW_SHELF.x + LOW_SHELF.w / 2, LOW_SHELF.z - LOW_SHELF.d / 2, LOW_SHELF.z + LOW_SHELF.d / 2);
  R(PARTITION.x - 0.11, PARTITION.x + 0.11, -d / 2, -d / 2 + PARTITION.d + 0.21);
  town.inter.push({ id: 'nhomeExit', x: inDoor.x, z: inDoor.z + 0.5, r: 1.3, label: '出门 · 回花愿小镇', act: () => game.travelTo('town', door.x, door.z + 0.9, '回到了花愿小镇'), marker: town.marker(inDoor.x, 2.4, inDoor.z + 0.9, '#7fc4f5') });
  // 指路箭头：从别的区域要来这里 / 从这里要去别处
  DOORS.town[ZONE] = { x: door.x, z: door.z };
  DOORS.home[ZONE] = DOORS.home.town; DOORS.house[ZONE] = DOORS.house.town;
  DOORS[ZONE] = { town: { x: inDoor.x, z: inDoor.z + 0.4 }, home: { x: inDoor.x, z: inDoor.z + 0.4 }, house: { x: inDoor.x, z: inDoor.z + 0.4 } };

  // —— 诺诺伊的作息：晚上回家，白天去大纸鹤那边。暖暖就在她旁边时先不动，免得人突然消失 ——
  installNonoyHome.schedule = () => {
    const ref = visitors.nonoy;
    if (!ref) return;
    const HOME_SPOT = { x: cx + 1.25, z: cz + 0.1 };
    let at = null;
    const move = (home) => {
      const p = home ? HOME_SPOT : ref.day;
      ref.def.x = p.x; ref.def.z = p.z; ref.def.home = home; ref.def.zone = home ? ZONE : 'town';
      ref.ch.root.position.set(p.x, 0, p.z);
      ref.it.x = p.x; ref.it.z = p.z + 0.9;
      ref.mk.position.x = p.x; ref.mk.position.z = p.z;
      at = home;
      bus.emit('canon');
    };
    move(nonoyAtHome());
    town.ticks.push(() => {
      const home = nonoyAtHome();
      if (home === at) return;
      if (town.zone === (ref.def.zone || 'town') && Math.hypot(town.pos.x - ref.def.x, town.pos.z - ref.def.z) < 9) return;
      move(home);
    });
  };
}
