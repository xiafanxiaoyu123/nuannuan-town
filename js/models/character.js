import { buildMomoCloak } from './momo-cloak-models.js';
import { normalizeMomoCloak } from './momo-cloaks.js';
// 方块人：暖暖、路人与大喵。全部由圆角方块搭成，动作为程序动画。
// 服饰造型参考《无限暖暖》套装立绘做方块化还原（见 data.js 的 SETS）。
import { THREE, mergeStatic, cbox, box, cyl, frustum, torus, group, mat, disposeSceneResources } from '../core/kit.js';
import { CLOTH, DEFAULT_OUTFIT } from '../data.js';
import { damp, rand, pick } from '../core/util.js';
import { PHOTO_MOTION_PERIODS } from '../live/photo-poses.js';

const SKIN = '#ffe4d6';
const ns = { cast: false, receive: false };

// ————————————————— 发型 —————————————————
function buildHair(g, def, refs) {
  const c = def.color, s = def.shade || c, style = def.hair;
  const sw = (node, amt, baseZ) => refs.hairSwing.push({ node, amt, baseZ });
  // 头顶 + 后脑 + 两鬓 + 刘海：所有发型共用
  g.add(cbox(0.86, 0.27, 0.8, c, 0, 0.245, -0.02, { r: 0.1 }));
  g.add(cbox(0.86, style === 'short' ? 0.46 : 0.6, 0.16, c, 0, style === 'short' ? 0.12 : 0.05, -0.36, { r: 0.07 }));
  g.add(cbox(0.1, 0.46, 0.46, c, -0.41, 0.07, -0.13, { r: 0.045 }));
  g.add(cbox(0.1, 0.46, 0.46, c, 0.41, 0.07, -0.13, { r: 0.045 }));
  if (def.fringe === 'swept') {
    // 偏分刘海：分线在一侧，长的一片斜着扫过额头、垂到另一侧眼睛上方，头顶有几撮翘起的碎发
    g.add(cbox(0.32, 0.19, 0.08, c, -0.25, 0.1, 0.365, { r: 0.04, rz: 0.28 }));
    g.add(cbox(0.3, 0.16, 0.08, c, 0.03, 0.135, 0.37, { r: 0.04, rz: 0.3 }));
    g.add(cbox(0.2, 0.11, 0.07, c, 0.27, 0.16, 0.362, { r: 0.03, rz: -0.36 }));
    // 两缕垂下来的发丝：一缕落在两眼之间，一缕贴着外眼角
    g.add(cbox(0.065, 0.2, 0.06, s, -0.045, 0.035, 0.374, { r: 0.025, rz: 0.3 }));
    g.add(cbox(0.075, 0.22, 0.06, s, -0.335, 0.0, 0.368, { r: 0.028, rz: 0.2 }));
    g.add(cbox(0.1, 0.2, 0.1, c, 0.39, 0.09, 0.32, { r: 0.04 }));
    g.add(cbox(0.1, 0.3, 0.1, c, -0.4, 0.03, 0.3, { r: 0.04 }));
    for (const [x, z, rz, rx] of [[0.14, 0.12, -0.5, 0.2], [-0.08, -0.02, 0.4, -0.2], [0.26, -0.14, -0.7, 0], [-0.24, 0.16, 0.6, 0.3]]) g.add(cbox(0.15, 0.08, 0.13, c, x, 0.375, z, { r: 0.035, rz, rx }));
  } else {
    g.add(cbox(0.3, 0.13, 0.07, c, -0.2, 0.1, 0.36, { r: 0.03, rz: 0.12 }));
    g.add(cbox(0.3, 0.13, 0.07, c, 0.2, 0.1, 0.36, { r: 0.03, rz: -0.12 }));
    g.add(cbox(0.16, 0.1, 0.07, c, 0, 0.115, 0.365, { r: 0.03 }));
    const lockLen = style === 'short' ? 0.2 : 0.34;
    g.add(cbox(0.11, lockLen, 0.1, c, -0.37, 0.17 - lockLen / 2, 0.33, { r: 0.04 }));
    g.add(cbox(0.11, lockLen, 0.1, c, 0.37, 0.17 - lockLen / 2, 0.33, { r: 0.04 }));
  }
  g.add(cbox(0.34, 0.035, 0.02, '#ffffff', -0.1, 0.27, 0.385, { r: 0.01, opacity: 0.55, ...ns }));

  const swing = group(0, -0.16, -0.38);
  g.add(swing);
  sw(swing, 1);
  const nape = () => swing.add(cbox(0.8, 0.14, 0.14, c, 0, -0.06, 0.02, { r: 0.05 }));

  if (style === 'long' || style === 'curl' || style === 'halfup') {
    swing.add(cbox(0.82, 0.66, 0.16, c, 0, -0.3, 0, { r: 0.07 }));
    swing.add(cbox(0.66, 0.16, 0.15, s, 0, -0.62, 0, { r: 0.06 }));
    for (const sx of [-1, 1]) {
      const strand = group(sx * 0.43, 0.02, 0.14);
      strand.add(cbox(0.12, 0.5, 0.15, c, 0, -0.3, 0, { r: 0.05 }));
      strand.add(cbox(0.1, 0.1, 0.13, s, 0, -0.56, 0, { r: 0.04 }));
      g.add(strand);
      sw(strand, 0.5);
    }
  }
  if (style === 'curl') {
    for (const sx of [-1, 1]) {
      const curl = group(sx * 0.47, -0.3, -0.2);
      for (let i = 0; i < 4; i++) curl.add(cbox(0.2, 0.17, 0.2, i % 2 ? s : c, (i % 2 ? 0.035 : -0.035) * sx, -i * 0.15, 0, { r: 0.07, ry: i * 0.5 }));
      g.add(curl);
      sw(curl, 0.7);
    }
    for (let i = -1; i <= 1; i++) swing.add(cbox(0.24, 0.2, 0.22, i ? c : s, i * 0.26, -0.7, -0.01, { r: 0.08 }));
  }
  if (style === 'wavy') {
    // 及肩波浪：发尾一排错落的小方块往外翘
    swing.add(cbox(0.84, 0.4, 0.17, c, 0, -0.17, 0, { r: 0.07 }));
    for (let i = 0; i < 5; i++) swing.add(cbox(0.2, 0.18, 0.2, i % 2 ? s : c, -0.34 + i * 0.17, -0.4, i % 2 ? -0.05 : 0.03, { r: 0.07 }));
    for (const sx of [-1, 1]) {
      const st = group(sx * 0.43, 0.0, 0.1);
      st.add(cbox(0.13, 0.36, 0.2, c, 0, -0.2, 0, { r: 0.05 }));
      st.add(cbox(0.17, 0.15, 0.2, s, sx * 0.04, -0.42, 0.02, { r: 0.06 }));
      g.add(st);
      sw(st, 0.5);
    }
  }
  if (style === 'twin') {
    nape();
    for (const sx of [-1, 1]) {
      const tail = group(sx * 0.47, 0.2, -0.12);
      tail.add(cbox(0.14, 0.12, 0.16, def.tie || s, 0, 0, 0, { r: 0.04 }));
      tail.add(cbox(0.24, 0.5, 0.24, c, sx * 0.1, -0.3, 0, { r: 0.09 }));
      tail.add(cbox(0.2, 0.26, 0.2, c, sx * 0.13, -0.62, 0, { r: 0.08 }));
      tail.add(cbox(0.13, 0.14, 0.13, s, sx * 0.15, -0.8, 0, { r: 0.05 }));
      tail.rotation.z = sx * 0.12;
      g.add(tail);
      sw(tail, 0.9, sx * 0.12);
    }
  }
  if (style === 'lowtwin') {
    // 低双马尾：从耳后垂到身前的两束长发
    nape();
    for (const sx of [-1, 1]) {
      const tail = group(sx * 0.4, -0.22, -0.08);
      tail.add(cbox(0.13, 0.09, 0.15, def.tie || s, 0, 0, 0, { r: 0.04 }));
      tail.add(cbox(0.19, 0.5, 0.19, c, sx * 0.02, -0.3, 0.04, { r: 0.07 }));
      tail.add(cbox(0.16, 0.3, 0.16, c, sx * 0.03, -0.66, 0.06, { r: 0.06 }));
      tail.add(cbox(0.11, 0.12, 0.11, s, sx * 0.03, -0.84, 0.07, { r: 0.04 }));
      g.add(tail);
      sw(tail, 0.6);
    }
  }
  if (style === 'bob' || style === 'curlbob') {
    swing.add(cbox(0.86, 0.26, 0.2, c, 0, -0.13, 0.02, { r: 0.08 }));
    for (const sx of [-1, 1]) {
      g.add(cbox(0.13, 0.3, 0.52, c, sx * 0.4, -0.24, -0.1, { r: 0.05 }));
      g.add(cbox(0.1, 0.14, 0.12, s, sx * 0.36, -0.3, 0.2, { r: 0.04 }));
    }
    if (style === 'curlbob') {
      for (let i = 0; i < 5; i++) swing.add(cbox(0.2, 0.18, 0.2, i % 2 ? s : c, -0.36 + i * 0.18, -0.28, i % 2 ? -0.03 : 0.04, { r: 0.08 }));
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(cbox(0.17, 0.17, 0.17, i % 2 ? c : s, sx * 0.45, -0.34, -0.3 + i * 0.2, { r: 0.07 }));
      g.add(cbox(0.2, 0.16, 0.2, s, -0.3, 0.38, 0.1, { r: 0.07 }));
      g.add(cbox(0.18, 0.15, 0.18, c, 0.28, 0.39, -0.1, { r: 0.07 }));
    }
  }
  if (style === 'updo') {
    // 盘发：后脑一个发髻，鬓角短
    nape();
    g.add(cbox(0.34, 0.3, 0.3, c, 0, 0.3, -0.5, { r: 0.12 }));
    g.add(cbox(0.2, 0.1, 0.2, s, 0, 0.47, -0.5, { r: 0.05 }));
  }
  if (style === 'short') {
    g.add(cbox(0.18, 0.12, 0.18, s, 0.22, 0.39, -0.12, { r: 0.05, rz: -0.3 }));
    g.add(cbox(0.16, 0.1, 0.16, c, -0.2, 0.39, 0.05, { r: 0.05, rz: 0.3 }));
  }
  if (style === 'halfup') {
    // 半扎发：长发 + 头顶两侧的小发束
    for (const sx of [-1, 1]) {
      g.add(cbox(0.13, 0.1, 0.13, def.tie || s, sx * 0.4, 0.4, -0.06, { r: 0.04 }));
      g.add(cbox(0.17, 0.17, 0.17, c, sx * 0.47, 0.42, -0.06, { r: 0.07 }));
      const t = group(sx * 0.5, 0.36, -0.06, cbox(0.12, 0.34, 0.12, c, 0, -0.17, 0, { r: 0.05 }), cbox(0.09, 0.1, 0.09, s, 0, -0.36, 0, { r: 0.035 }));
      g.add(t);
      sw(t, 0.6);
    }
  }
  if (style === 'hipony') {
    // 高马尾：长长的一束 + 垂到胸前的两缕鬓发
    nape();
    const tail = group(0, 0.36, -0.44);
    tail.add(cbox(0.22, 0.16, 0.18, def.tie || s, 0, 0, 0, { r: 0.05 }));
    tail.add(cbox(0.34, 0.5, 0.28, c, 0, -0.26, -0.12, { r: 0.11, rx: 0.32 }));
    tail.add(cbox(0.3, 0.5, 0.26, c, 0, -0.68, -0.2, { r: 0.1, rx: 0.1 }));
    tail.add(cbox(0.24, 0.36, 0.22, c, 0, -1.06, -0.21, { r: 0.09 }));
    tail.add(cbox(0.15, 0.18, 0.15, s, 0, -1.3, -0.2, { r: 0.06 }));
    g.add(tail);
    sw(tail, 1.2);
    for (const sx of [-1, 1]) {
      const st = group(sx * 0.43, 0.0, 0.16, cbox(0.1, 0.46, 0.12, c, 0, -0.26, 0, { r: 0.04 }), cbox(0.08, 0.1, 0.1, s, 0, -0.5, 0, { r: 0.03 }));
      g.add(st);
      sw(st, 0.5);
    }
  }
  if (style === 'braidtwin') {
    // 两条低位麻花辫，缠着深色缎带，辫尾系蝴蝶结，下面是长长的卷发（满分出发）
    nape();
    const rb = def.tie || '#5a3d33';
    for (const sx of [-1, 1]) {
      g.add(cbox(0.05, 0.2, 0.04, rb, sx * 0.31, 0.2, 0.395, { r: 0.015, rz: sx * 0.5, ...ns }));
      const tail = group(sx * 0.43, -0.2, -0.1);
      for (let i = 0; i < 3; i++) {
        tail.add(cbox(0.21, 0.15, 0.21, i % 2 ? s : c, (i % 2 ? 0.03 : -0.03) * sx, -i * 0.13, 0, { r: 0.07, ry: i * 0.6 }));
        tail.add(cbox(0.23, 0.03, 0.04, rb, 0, -i * 0.13 - 0.02, 0.1, { rz: i % 2 ? 0.5 : -0.5, ...ns }));
      }
      const b = bowPair(rb, 0.13, 0.1, 0.06, rb);
      b.position.set(0, -0.43, 0.1);
      tail.add(b);
      for (const k of [-1, 1]) tail.add(cbox(0.04, 0.2, 0.03, rb, k * 0.04, -0.56, 0.11, { rz: k * 0.15, ...ns }));
      tail.add(cbox(0.21, 0.34, 0.21, c, sx * 0.04, -0.62, 0, { r: 0.08 }));
      tail.add(cbox(0.2, 0.3, 0.2, c, sx * 0.11, -0.9, 0.02, { r: 0.08 }));
      tail.add(cbox(0.18, 0.26, 0.18, s, sx * 0.05, -1.14, 0.03, { r: 0.07 }));
      tail.add(cbox(0.13, 0.16, 0.13, c, sx * 0.13, -1.32, 0.03, { r: 0.05 }));
      g.add(tail);
      sw(tail, 0.7);
    }
  }
  if (style === 'bun') {
    nape();
    for (const sx of [-1, 1]) {
      g.add(cbox(0.3, 0.3, 0.3, c, sx * 0.3, 0.47, -0.08, { r: 0.12 }));
      g.add(cbox(0.2, 0.06, 0.2, def.tie || s, sx * 0.3, 0.335, -0.08, { r: 0.02 }));
    }
  }
  if (style === 'pony') {
    nape();
    const tail = group(0, 0.34, -0.42);
    tail.add(cbox(0.2, 0.14, 0.16, def.tie || s, 0, 0, 0, { r: 0.05 }));
    tail.add(cbox(0.3, 0.5, 0.26, c, 0, -0.28, -0.1, { r: 0.1, rx: 0.3 }));
    tail.add(cbox(0.24, 0.34, 0.22, c, 0, -0.62, -0.17, { r: 0.09, rx: 0.12 }));
    tail.add(cbox(0.15, 0.16, 0.15, s, 0, -0.84, -0.18, { r: 0.06 }));
    g.add(tail);
    sw(tail, 1.3);
  }
}

// ————————————————— 头饰 —————————————————
function bowPair(c, w = 0.22, hgt = 0.18, d = 0.1, knot = '#ffffff') {
  const b = group();
  b.add(cbox(w, hgt, d, c, -w * 0.55, 0, 0, { r: hgt * 0.28, rz: 0.3 }));
  b.add(cbox(w, hgt, d, c, w * 0.55, 0, 0, { r: hgt * 0.28, rz: -0.3 }));
  b.add(cbox(w * 0.45, hgt * 0.66, d * 1.15, knot, 0, 0, 0.005, { r: hgt * 0.2 }));
  return b;
}
function buildAcc(g, def) {
  const c = def.color;
  switch (def.acc) {
    case 'bow': {
      const b = bowPair(c);
      b.position.set(0.27, 0.43, 0.12);
      b.rotation.z = -0.25;
      g.add(b);
      break;
    }
    case 'bowband': {
      // 发箍 + 头顶竖起的大蝴蝶结（轻盈泡泡）
      g.add(cbox(0.9, 0.06, 0.1, c, 0, 0.385, 0.06, { r: 0.025 }));
      const b = group(0, 0.5, 0.06);
      const bm = def.sheer ? mat(c, { opacity: 0.72, rough: 0.4 }) : c, k = def.big ? 1.5 : 1;
      b.add(cbox(0.26 * k, 0.24 * k, 0.1, bm, -0.17 * k, 0.02, 0, { r: 0.07, rz: -0.5 }));
      b.add(cbox(0.26 * k, 0.24 * k, 0.1, bm, 0.17 * k, 0.02, 0, { r: 0.07, rz: 0.5 }));
      b.add(cbox(0.12, 0.13, 0.12, def.knot || c, 0, -0.04, 0.005, { r: 0.04 }));
      if (def.stripe) for (const sx of [-1, 1]) for (const o of [-0.05, 0.05]) b.add(cbox(0.03, 0.22, 0.105, def.stripe, sx * (0.17 + o), 0.02 + sx * o * 0.5, 0.001, { rz: sx * 0.5, ...ns }));
      if (def.big) for (const sx of [-1, 1]) b.add(cbox(0.1, 0.4, 0.05, bm, sx * 0.12, -0.3, -0.06, { r: 0.03, rz: sx * 0.2 }));
      g.add(b);
      break;
    }
    case 'bonnet': {
      // 荷叶边头巾（灰尘拜拜）
      g.add(cbox(0.9, 0.2, 0.74, c, 0, 0.36, -0.06, { r: 0.09 }));
      for (let i = 0; i < 6; i++) g.add(cbox(0.17, 0.12, 0.1, i % 2 ? '#ffffff' : def.trim, -0.4 + i * 0.16, 0.34, 0.33, { r: 0.045 }));
      g.add(cbox(0.92, 0.06, 0.76, def.trim, 0, 0.29, -0.06, { r: 0.025 }));
      const b = bowPair(def.trim, 0.14, 0.11, 0.07, def.trim);
      b.position.set(0.3, 0.46, 0.2);
      g.add(b);
      break;
    }
    case 'chef':
      g.add(box(0.52, 0.2, 0.5, c, 0, 0.36, -0.03, { r: 0.04 }));
      g.add(box(0.7, 0.3, 0.66, c, 0, 0.52, -0.03, { r: 0.14 }));
      break;
    case 'straw':
      g.add(cyl(0.72, 0.74, 0.05, c, 0, 0.345, -0.02, { seg: 28 }));
      g.add(cyl(0.36, 0.42, 0.24, c, 0, 0.39, -0.02, { seg: 28 }));
      g.add(cyl(0.425, 0.425, 0.07, def.band, 0, 0.395, -0.02, { seg: 28 }));
      break;
    case 'bucket':
      // 渔夫帽（悠然水畔）
      g.add(cyl(0.44, 0.47, 0.24, c, 0, 0.33, -0.02, { seg: 24 }));
      g.add(cyl(0.47, 0.66, 0.1, c, 0, 0.27, -0.02, { seg: 24 }));
      g.add(cyl(0.475, 0.475, 0.05, def.band, 0, 0.36, -0.02, { seg: 24 }));
      g.add(cbox(0.08, 0.08, 0.04, '#ffd76a', 0.2, 0.46, 0.4, { r: 0.03 }));
      break;
    case 'beret': {
      const b = group(0.05, 0.4, -0.03);
      b.add(cyl(0.46, 0.4, 0.14, c, 0, 0, 0, { seg: 24 }));
      b.add(cyl(0.4, 0.46, 0.05, c, 0, 0.14, 0, { seg: 24 }));
      b.add(cbox(0.06, 0.1, 0.06, c, 0, 0.22, 0, { r: 0.02 }));
      b.rotation.z = -0.14;
      g.add(b);
      break;
    }
    case 'capgoggle': {
      // 工装帽 + 橙色护目镜（满电行动）
      g.add(cbox(0.84, 0.2, 0.78, c, 0, 0.37, -0.04, { r: 0.09 }));
      g.add(cbox(0.6, 0.06, 0.26, c, 0, 0.3, 0.44, { r: 0.025 }));
      g.add(cbox(0.9, 0.09, 0.82, '#3d3f4a', 0, 0.3, -0.04, { r: 0.03 }));
      const gm = mat(def.lens, { rough: 0.2, emissive: def.lens, ei: 0.25 });
      for (const sx of [-1, 1]) {
        g.add(cbox(0.26, 0.17, 0.08, '#3d3f4a', sx * 0.17, 0.41, 0.36, { r: 0.05 }));
        g.add(cbox(0.2, 0.11, 0.09, gm, sx * 0.17, 0.41, 0.37, { r: 0.04, ...ns }));
      }
      break;
    }
    case 'tophat': {
      // 迷你礼帽（琴弦之诗）
      const b = group(0.2, 0.36, 0.06);
      b.add(cyl(0.26, 0.26, 0.04, c, 0, 0, 0, { seg: 20 }));
      b.add(cyl(0.16, 0.18, 0.24, c, 0, 0.04, 0, { seg: 20 }));
      b.add(cyl(0.185, 0.185, 0.06, def.band, 0, 0.05, 0, { seg: 20 }));
      b.add(cbox(0.06, 0.24, 0.1, '#ffffff', -0.15, 0.2, -0.04, { r: 0.025, rz: 0.5 }));
      b.add(cbox(0.07, 0.07, 0.04, def.band, 0, 0.1, 0.19, { r: 0.02, rz: 0.78 }));
      b.rotation.z = -0.22;
      g.add(b);
      break;
    }
    case 'jester': {
      // 星星小丑帽（迷你星芒）
      g.add(cbox(0.84, 0.18, 0.76, c, 0, 0.37, -0.04, { r: 0.08 }));
      for (const [x, rz] of [[-0.3, 0.7], [0, 0], [0.3, -0.7]]) {
        const p = group(x, 0.42, -0.04);
        p.add(frustum(0.06, 0.26, 0.34, x ? def.trim : c, 0, 0, 0));
        p.add(cbox(0.13, 0.13, 0.13, def.pom, 0, 0.4, 0, { r: 0.05 }));
        p.rotation.z = rz;
        g.add(p);
      }
      const star = mat(def.pom, { emissive: def.pom, ei: 0.4 });
      g.add(cbox(0.14, 0.14, 0.05, star, 0, 0.38, 0.36, { r: 0.02, rz: 0.78 }));
      g.add(cbox(0.14, 0.14, 0.05, star, 0, 0.38, 0.36, { r: 0.02 }));
      break;
    }
    case 'ribbon': {
      // 发髻上的黑缎带（飞花的追忆）
      const b = bowPair(c, 0.2, 0.15, 0.08, c);
      b.position.set(0, 0.34, -0.68);
      g.add(b);
      g.add(cbox(0.07, 0.26, 0.05, c, -0.07, 0.16, -0.68, { r: 0.02, rz: -0.15 }));
      g.add(cbox(0.07, 0.26, 0.05, c, 0.07, 0.16, -0.68, { r: 0.02, rz: 0.15 }));
      break;
    }
    case 'pin': {
      // 花朵发饰（花漾梦萦）
      const b = group(-0.3, 0.38, 0.22);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add(cbox(0.13, 0.13, 0.06, c, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0, { r: 0.045, rz: -a }));
      }
      b.add(cbox(0.1, 0.1, 0.09, def.core, 0, 0, 0.01, { r: 0.04 }));
      b.rotation.set(-0.5, -0.3, 0.2);
      g.add(b);
      g.add(cbox(0.1, 0.1, 0.08, def.core, 0.3, 0.4, 0.2, { r: 0.04 }));
      g.add(cbox(0.08, 0.08, 0.07, c, 0.18, 0.42, 0.28, { r: 0.03 }));
      break;
    }
    case 'laurel': {
      // 金色桂冠 + 侧边白羽（心光破晓时）
      const gm = mat(c, { rough: 0.3, metal: 0.5 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (Math.cos(a) < -0.75) continue;
        g.add(cbox(0.16, 0.07, 0.09, gm, Math.sin(a) * 0.42, 0.35 + Math.abs(Math.sin(a)) * 0.03, Math.cos(a) * 0.39 - 0.02, { r: 0.03, ry: a, rz: 0.4 }));
      }
      g.add(cbox(0.1, 0.12, 0.05, def.gem, 0, 0.4, 0.38, { r: 0.03, rz: 0.78 }));
      g.add(cbox(0.09, 0.34, 0.14, '#ffffff', 0.44, 0.5, -0.1, { r: 0.04, rz: -0.5 }));
      g.add(cbox(0.07, 0.24, 0.12, def.gem, 0.5, 0.4, -0.2, { r: 0.03, rz: -0.8 }));
      break;
    }
    case 'plume': {
      // 黑羽头饰 + 银色宝石（白夜长旋舞）
      for (const [x, y, z, rz, len] of [[0.34, 0.5, 0.06, -0.5, 0.42], [0.42, 0.42, -0.08, -0.9, 0.34], [0.26, 0.52, -0.12, -0.2, 0.36]]) g.add(cbox(0.1, len, 0.14, c, x, y, z, { r: 0.04, rz }));
      g.add(cbox(0.12, 0.12, 0.08, mat(def.gem, { rough: 0.2, metal: 0.6 }), 0.3, 0.34, 0.2, { r: 0.03, rz: 0.78 }));
      g.add(cbox(0.6, 0.04, 0.06, mat(def.gem, { rough: 0.2, metal: 0.6 }), 0, 0.36, 0.36, { r: 0.02 }));
      break;
    }
    case 'lacehat': {
      // 缀满玫瑰的蕾丝宽檐帽（绘色未明）
      g.add(cyl(0.5, 0.52, 0.16, c, 0, 0.36, -0.04, { seg: 24 }));
      g.add(cyl(0.78, 0.82, 0.05, c, 0, 0.36, -0.04, { seg: 28 }));
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.add(cbox(0.2, 0.05, 0.14, i % 2 ? def.trim : c, Math.sin(a) * 0.82, 0.37, Math.cos(a) * 0.82 - 0.04, { r: 0.02, ry: a }));
      }
      def.roses.forEach((col, i) => {
        const a = -0.9 + i * 0.6;
        g.add(cbox(0.2, 0.17, 0.2, col, Math.sin(a) * 0.5, 0.5, Math.cos(a) * 0.5 - 0.04, { r: 0.07, ry: a }));
        g.add(cbox(0.1, 0.09, 0.1, '#ffffff', Math.sin(a) * 0.5, 0.6, Math.cos(a) * 0.5 - 0.04, { r: 0.03, ry: a + 0.5 }));
        g.add(cbox(0.14, 0.06, 0.1, '#9fcf8f', Math.sin(a + 0.3) * 0.56, 0.45, Math.cos(a + 0.3) * 0.56 - 0.04, { r: 0.02, ry: a }));
      });
      break;
    }
    case 'roundglasses': {
      // 圆框眼镜 + 马尾根上的黑色发饰（诺诺伊）
      const fm = mat(c, { rough: 0.4 });
      for (const sx of [-1, 1]) {
        g.add(torus(0.105, 0.016, fm, sx * 0.17, -0.04, 0.375, { seg: 18 }));
        g.add(cbox(0.03, 0.02, 0.32, fm, sx * 0.3, -0.03, 0.22, { r: 0.008 }));
      }
      g.add(cbox(0.14, 0.02, 0.02, fm, 0, -0.02, 0.375, { r: 0.008 }));
      const orn = group(0.34, 0.34, -0.16);
      orn.add(cbox(0.2, 0.12, 0.1, def.orn, 0, 0, 0, { r: 0.04, rz: 0.4 }));
      orn.add(cbox(0.12, 0.2, 0.08, def.orn, 0.04, 0.08, 0, { r: 0.03, rz: -0.5 }));
      orn.add(cbox(0.06, 0.06, 0.1, '#d9b46a', 0, 0.02, 0.01, { r: 0.02 }));
      g.add(orn);
      break;
    }
    case 'fedora': {
      // 宽檐软呢帽（相机商人莱拉）：帽顶中间一道凹痕，一圈深色帽带，帽檐一边微微翘起
      const hat = group(0, 0.36, -0.02);
      hat.rotation.z = -0.06;
      hat.add(cyl(0.62, 0.66, 0.05, c, 0, 0, 0, { seg: 20 }));
      hat.add(cyl(0.36, 0.42, 0.3, c, 0, 0.04, 0, { seg: 16 }));
      hat.add(cyl(0.425, 0.425, 0.08, def.band, 0, 0.05, 0, { seg: 16 }));
      hat.add(cbox(0.46, 0.06, 0.2, def.band, 0, 0.345, 0, { r: 0.025, cast: false }));
      for (const sx of [-1, 1]) hat.add(cbox(0.22, 0.1, 0.6, c, sx * 0.24, 0.31, 0, { r: 0.045 }));
      hat.add(cbox(0.5, 0.05, 0.3, c, -0.4, 0.05, 0, { r: 0.02, rz: -0.25 }));
      g.add(hat);
      break;
    }
    case 'newsboy': {
      // 卡其色报童帽（小马尔克斯）
      g.add(cbox(0.9, 0.2, 0.84, c, 0, 0.36, -0.03, { r: 0.1 }));
      g.add(cbox(0.76, 0.1, 0.7, c, 0, 0.47, -0.05, { r: 0.05 }));
      g.add(cbox(0.56, 0.05, 0.26, def.brim, 0, 0.29, 0.46, { r: 0.022 }));
      g.add(cbox(0.08, 0.05, 0.08, def.brim, 0, 0.53, -0.05, { r: 0.02 }));
      break;
    }
    case 'heartshades': {
      // 推到头顶的粉色爱心墨镜（来访的达达）
      const sg = group(0, 0.4, 0.3);
      sg.rotation.x = -0.62;
      const frame = mat(c, { rough: 0.35 }), lens = mat(def.lens, { rough: 0.15, metal: 0.2, emissive: def.lens, ei: 0.12 });
      for (const sx of [-1, 1]) {
        const ht = group(sx * 0.2, 0, 0);
        ht.add(cbox(0.2, 0.2, 0.05, frame, 0, -0.02, 0, { r: 0.03, rz: Math.PI / 4 }));
        for (const k of [-1, 1]) ht.add(cbox(0.15, 0.15, 0.05, frame, k * 0.075, 0.07, 0, { r: 0.06 }));
        ht.add(cbox(0.13, 0.13, 0.06, lens, 0, -0.015, 0.004, { r: 0.02, rz: Math.PI / 4 }));
        for (const k of [-1, 1]) ht.add(cbox(0.09, 0.09, 0.06, lens, k * 0.07, 0.065, 0.004, { r: 0.04 }));
        sg.add(ht);
        sg.add(cbox(0.04, 0.04, 0.42, frame, sx * 0.4, 0.02, -0.2, { r: 0.015 }));
      }
      sg.add(cbox(0.1, 0.04, 0.04, frame, 0, 0.05, 0, { r: 0.015 }));
      g.add(sg);
      break;
    }
    case 'sevenstar': {
      // 七日星：一颗大星带六颗小星的发夹（连续签到七天的纪念）
      const star = mat(c, { emissive: c, ei: 0.55, rough: 0.3, metal: 0.3 });
      const b = group(-0.32, 0.34, 0.24);
      b.rotation.set(0, -0.35, 0.2);
      for (const rz of [0, Math.PI / 4]) b.add(cbox(0.22, 0.22, 0.07, star, 0, 0, 0, { r: 0.02, rz }));
      b.add(cbox(0.1, 0.1, 0.09, def.core, 0, 0, 0.005, { r: 0.04 }));
      for (let i = 0; i < 6; i++) {
        const a = -0.5 + i * 0.52, r2 = 0.26 + (i % 2) * 0.05;
        for (const rz of [0, Math.PI / 4]) b.add(cbox(0.07, 0.07, 0.04, i % 2 ? def.core : star, Math.cos(a) * r2, Math.sin(a) * r2, -0.01, { r: 0.008, rz }));
      }
      g.add(b);
      break;
    }
    // —— premium-v2：五星套装专属头饰 ——
    case 'leafcrown': {
      // 叶片与细枝编成的冠，额角停着一只发光的小蝴蝶（森之涟）
      const lm = mat(c, { rough: 0.35, emissive: c, ei: 0.15 });
      for (let i = 0; i < 9; i++) {
        const a = -1.4 + i * 0.35;
        g.add(frustum(0.015, 0.09, 0.14 + (i % 2) * 0.08, i % 3 === 1 ? def.trim || c : lm, Math.sin(a) * 0.43, 0.35, Math.cos(a) * 0.4 - 0.02, { sz: 0.35, ry: a }));
      }
      for (const sx of [-1, 1]) g.add(cbox(0.025, 0.3, 0.025, def.band || '#b9c9c2', sx * 0.22, 0.54, 0.08, { r: 0.01, rz: -sx * 0.45 }));
      const bf = group(0.27, 0.58, 0.3);
      const bm = mat(def.gem || '#8fe0ff', { opacity: 0.85, emissive: def.gem || '#8fe0ff', ei: 0.5 });
      for (const sx of [-1, 1]) bf.add(cbox(0.1, 0.12, 0.015, bm, sx * 0.06, 0, 0, { r: 0.006, rz: sx * 0.4, ry: sx * 0.5, ...ns }));
      g.add(bf);
      break;
    }
    case 'crescent': {
      // 脑后升起的两弯冰晶月牙 + 额心坠饰（生于无瑕）
      const cm = mat(c, { opacity: 0.82, rough: 0.15, metal: 0.2, emissive: c, ei: 0.3 });
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
        const a = 0.3 + i * 0.38;
        g.add(cbox(0.085 - i * 0.012, 0.24, 0.05, cm, sx * (0.1 + Math.sin(a) * 0.44), 0.3 + Math.cos(a) * 0.46, -0.24, { r: 0.02, rz: -sx * (a + Math.PI / 2), ...ns }));
      }
      g.add(cbox(0.5, 0.022, 0.03, def.band || '#e8eef8', 0, 0.26, 0.385, { r: 0.01, ...ns }));
      g.add(cbox(0.07, 0.09, 0.03, mat(def.gem || '#ffffff', { rough: 0.15, emissive: def.gem || '#ffffff', ei: 0.5 }), 0, 0.2, 0.39, { r: 0.012, rz: 0.78, ...ns }));
      break;
    }
    case 'rococo': {
      // 高耸的金梳冠 + 玫瑰 + 大羽毛（咏叙的旧梦）
      const gm = mat(c, { rough: 0.3, metal: 0.55 });
      for (let i = -2; i <= 2; i++) g.add(cbox(0.035, 0.3 - Math.abs(i) * 0.05, 0.03, gm, 0.1 + i * 0.07, 0.53 - Math.abs(i) * 0.025, 0.04, { r: 0.012 }));
      g.add(cbox(0.36, 0.05, 0.06, gm, 0.1, 0.39, 0.04, { r: 0.02 }));
      (def.roses || ['#2fa79b', '#58c4b6', '#2fa79b']).forEach((col, i) => g.add(cbox(0.15, 0.13, 0.15, col, -0.12 - i * 0.12, 0.43 - i * 0.03, 0.16 - i * 0.1, { r: 0.05, ry: i })));
      for (const [x, y, rz, len] of [[-0.04, 0.74, 0.5, 0.5], [-0.17, 0.66, 0.9, 0.4]]) g.add(cbox(0.11, len, 0.05, def.plume || '#f6e39a', x, y, -0.06, { r: 0.045, rz }));
      break;
    }
    case 'crane': {
      // 歪戴在头顶的折纸鹤小帽（翩翩愿飞去）
      g.add(cbox(0.34, 0.035, 0.34, def.band || '#ffffff', 0.18, 0.385, 0.08, { r: 0.012 }));
      const b = group(0.18, 0.41, 0.08);
      b.add(frustum(0.02, 0.2, 0.13, c, 0, 0, 0, { sz: 0.6 }));
      for (const sx of [-1, 1]) b.add(cbox(0.26, 0.02, 0.13, def.trim || c, sx * 0.15, 0.14, 0, { r: 0.008, rz: sx * 0.6 }));
      b.add(cbox(0.03, 0.2, 0.03, c, 0, 0.17, 0.12, { rx: 0.5 }));
      b.add(cbox(0.03, 0.03, 0.08, def.beak || '#f6d36d', 0, 0.27, 0.2));
      b.add(cbox(0.03, 0.17, 0.05, def.trim || c, 0, 0.15, -0.13, { rx: -0.7 }));
      b.rotation.z = -0.2;
      g.add(b);
      const bw = bowPair(def.knot || '#ffe27a', 0.1, 0.08, 0.04, def.knot || '#ffe27a');
      bw.position.set(0.18, 0.42, 0.27);
      g.add(bw);
      break;
    }
    case 'cone': {
      // 仙子的尖顶高帽：蕾丝帽檐、金色月环、垂在脑后的薄纱（仙踪绮遇）
      const b = group(0, 0.36, -0.08);
      b.add(frustum(0.05, 0.4, 0.52, c, 0, 0, 0));
      b.add(frustum(0.42, 0.46, 0.07, def.trim || '#ffffff', 0, -0.02, 0));
      for (let i = 0; i < 4; i++) b.add(cbox(0.1, 0.06, 0.03, def.trim || '#ffffff', -0.15 + i * 0.1, 0.02, 0.23, { r: 0.02 }));
      const gm = mat(def.gem || '#ffd66d', { rough: 0.25, metal: 0.6, emissive: def.gem || '#ffd66d', ei: 0.25 });
      b.add(torus(0.07, 0.014, gm, 0, 0.2, 0.15, { ...ns }));
      b.add(cbox(0.05, 0.05, 0.03, gm, 0, 0.34, 0.1, { rz: 0.78, ...ns }));
      b.add(cbox(0.3, 0.46, 0.03, mat(def.veil || '#ffffff', { opacity: 0.5 }), 0, 0.22, -0.2, { r: 0.015, rx: 0.3, ...ns }));
      b.rotation.x = -0.3;
      g.add(b);
      break;
    }
    case 'burst': {
      // 像花焰炸开的放射状尖冠（缀夜希光）
      const gm = mat(c, { rough: 0.25, metal: 0.6, emissive: c, ei: 0.25 });
      for (let i = 0; i < 9; i++) {
        const a = -1.1 + i * 0.275, len = 0.3 + (i % 2 ? 0 : 0.14) - Math.abs(i - 4) * 0.02;
        g.add(cbox(0.022, len, 0.022, gm, 0.08 + Math.sin(a) * len / 2, 0.42 + Math.cos(a) * len / 2, -0.05, { rz: -a, ...ns }));
      }
      g.add(cbox(0.36, 0.06, 0.1, gm, 0.08, 0.4, -0.05, { r: 0.025 }));
      const jm = mat(def.gem || '#ffffff', { emissive: def.gem || '#ffffff', ei: 0.6 });
      for (let i = 0; i < 5; i++) g.add(cbox(0.04, 0.04, 0.03, jm, -0.04 + i * 0.06, 0.4, 0.01, { rz: 0.78, ...ns }));
      break;
    }
    case 'veil': {
      // 罩住头肩的深色头纱，边缘黑蕾丝，额顶一排蓝白玫瑰（无名亦无我）
      const vm = mat(c, { opacity: 0.58, rough: 0.5 });
      g.add(cbox(0.98, 0.1, 0.92, vm, 0, 0.4, -0.06, { r: 0.04, ...ns }));
      for (const sx of [-1, 1]) g.add(cbox(0.06, 0.82, 0.7, vm, sx * 0.5, -0.01, -0.14, { r: 0.02, ...ns }));
      g.add(cbox(0.98, 0.9, 0.06, vm, 0, -0.05, -0.5, { r: 0.02, ...ns }));
      for (const sx of [-1, 1]) g.add(cbox(0.07, 0.06, 0.72, def.trim || '#15131c', sx * 0.5, -0.42, -0.14, { r: 0.02 }));
      g.add(cbox(1.0, 0.06, 0.07, def.trim || '#15131c', 0, -0.5, -0.5, { r: 0.02 }));
      (def.roses || ['#aebbf5', '#dfe6ff', '#7f8fe0', '#dfe6ff']).forEach((col, i) => g.add(cbox(0.15, 0.12, 0.15, col, -0.24 + i * 0.16, 0.46 + (i % 2) * 0.03, 0.2 - Math.abs(i - 1.5) * 0.05, { r: 0.05, ry: i })));
      for (const sx of [-1, 1]) g.add(cbox(0.12, 0.05, 0.08, def.trim || '#15131c', sx * 0.36, 0.44, 0.2, { r: 0.015, ry: sx * 0.6 }));
      break;
    }
    case 'witch': {
      // 缀着白花、珍珠链和雨滴晶坠的蕾丝女巫帽（如雨坠，如花开）
      const b = group(0, 0.36, -0.04), R = 0.7;
      b.add(cyl(R, R + 0.04, 0.05, c, 0, 0, 0, { seg: 26 }));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        b.add(cbox(0.18, 0.05, 0.12, i % 2 ? def.trim || '#ffffff' : c, Math.sin(a) * (R + 0.04), 0, Math.cos(a) * (R + 0.04), { r: 0.02, ry: a }));
      }
      b.add(frustum(0.3, 0.58, 0.22, c, 0, 0.04, 0));
      const tip = group(0, 0.26, 0);
      tip.add(frustum(0.06, 0.32, 0.36, c, 0, 0, 0));
      tip.rotation.set(-0.5, 0, 0.25);
      b.add(tip);
      (def.roses || ['#ffffff', '#f3f6ee', '#ffe27a']).forEach((col, i) => b.add(cbox(0.17, 0.13, 0.17, col, -0.34 + i * 0.16, 0.12, 0.34 - i * 0.05, { r: 0.06, ry: i })));
      const gm = mat(def.gem || '#9fd08f', { emissive: def.gem || '#9fd08f', ei: 0.3 });
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        b.add(cbox(0.035, 0.035, 0.035, def.pearl || '#fffdf2', Math.sin(a) * R, -0.05 - (i % 2) * 0.05, Math.cos(a) * R, { r: 0.015, ...ns }));
        if (i % 3 === 1) b.add(cbox(0.03, 0.09, 0.03, gm, Math.sin(a) * R, -0.14, Math.cos(a) * R, { r: 0.01, ...ns }));
      }
      b.rotation.z = -0.1;
      g.add(b);
      break;
    }
    case 'antler': {
      // 冰晶枝角冠，耳侧簇着冰玫瑰（谒灵）
      const cm = mat(c, { rough: 0.15, metal: 0.25, emissive: c, ei: 0.25 });
      for (const sx of [-1, 1]) {
        const a = group(sx * 0.26, 0.36, -0.04);
        a.add(cbox(0.04, 0.4, 0.04, cm, 0, 0.2, 0, { r: 0.012 }));
        a.add(cbox(0.035, 0.2, 0.035, cm, sx * 0.07, 0.3, 0, { r: 0.012, rz: -sx * 0.8 }));
        a.add(cbox(0.03, 0.16, 0.03, cm, -sx * 0.05, 0.22, 0, { r: 0.01, rz: sx * 0.7 }));
        a.add(cbox(0.03, 0.14, 0.03, cm, sx * 0.05, 0.42, 0, { r: 0.01, rz: -sx * 0.5 }));
        a.rotation.z = -sx * 0.3;
        g.add(a);
        (def.roses || ['#cfe0ff', '#eef2ff']).forEach((col, i) => g.add(cbox(0.14, 0.12, 0.14, mat(col, { rough: 0.3, emissive: col, ei: 0.12 }), sx * (0.42 - i * 0.05), 0.24 - i * 0.13, 0.08 + i * 0.1, { r: 0.05, ry: i })));
      }
      g.add(cbox(0.46, 0.022, 0.03, def.band || '#e8eef8', 0, 0.27, 0.385, { r: 0.01, ...ns }));
      g.add(cbox(0.06, 0.08, 0.03, mat(def.gem || c, { emissive: def.gem || c, ei: 0.5 }), 0, 0.2, 0.39, { r: 0.012, rz: 0.78, ...ns }));
      break;
    }
    case 'catlily': {
      // 猫耳 + 鬓边的赤色彼岸花 + 金步摇 + 遮住下半张脸的珠帘（缘缘长相念）
      for (const sx of [-1, 1]) {
        g.add(frustum(0.03, 0.26, 0.27, c, sx * 0.27, 0.36, 0, { sz: 0.5, rz: -sx * 0.18 }));
        g.add(frustum(0.02, 0.14, 0.17, def.inner || '#ffc9d2', sx * 0.27, 0.38, 0.05, { sz: 0.4, rz: -sx * 0.18, ...ns }));
        const f = group(sx * 0.45, 0.2, 0.12);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          f.add(cbox(0.17, 0.035, 0.06, def.flower || '#e2452f', Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0, { r: 0.015, rz: a }));
        }
        f.add(cbox(0.06, 0.06, 0.06, def.core || '#ffd66d', 0, 0, 0.02, { r: 0.02 }));
        f.rotation.y = sx * 0.9;
        g.add(f);
      }
      g.add(cbox(0.46, 0.15, 0.012, mat(def.bead || '#ffffff', { opacity: 0.32, rough: 0.3 }), 0, -0.205, 0.4, { r: 0.005, ...ns }));
      for (let i = 0; i < 7; i++) g.add(cbox(0.025, 0.025, 0.02, def.bead || '#ffffff', -0.21 + i * 0.07, -0.285 - (i % 2) * 0.02, 0.405, { r: 0.01, ...ns }));
      g.add(cbox(0.48, 0.014, 0.016, def.core || '#ffd66d', 0, -0.128, 0.403, { ...ns }));
      for (const [x, rz] of [[0.5, -0.9], [0.56, -1.2]]) g.add(cbox(0.02, 0.34, 0.02, def.core || '#ffd66d', x, 0.3, -0.1, { rz }));
      break;
    }
    case 'wingcrown': {
      // 金鹰展翼的头冠，额前一排绿松石（蒙尘之罪）
      const gm = mat(c, { rough: 0.28, metal: 0.6 });
      const jm = mat(def.gem || '#3fc7c2', { rough: 0.2, emissive: def.gem || '#3fc7c2', ei: 0.35 });
      g.add(cbox(0.9, 0.12, 0.82, gm, 0, 0.36, -0.03, { r: 0.05 }));
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) g.add(cbox(0.08, 0.36 - i * 0.05, 0.04, gm, sx * (0.3 + i * 0.07), 0.54 - i * 0.03, -0.06 - i * 0.05, { r: 0.03, rz: -sx * (0.25 + i * 0.22) }));
        g.add(cbox(0.02, 0.3, 0.02, gm, sx * 0.43, 0.05, 0.3, { ...ns }));
        g.add(cbox(0.04, 0.05, 0.03, jm, sx * 0.43, -0.12, 0.3, { r: 0.012, ...ns }));
      }
      for (let i = -3; i <= 3; i++) g.add(cbox(0.05, 0.05, 0.03, jm, i * 0.11, 0.32 - Math.abs(i) * 0.01, 0.385, { r: 0.012, rz: 0.78, ...ns }));
      g.add(cbox(0.07, 0.12, 0.03, jm, 0, 0.2, 0.39, { r: 0.015, ...ns }));
      break;
    }
    case 'heartbonnet': {
      // 在脑后撑开成心形的红色百褶头饰，前缘一圈玫瑰与白蕾丝（如果爱上一朵花）
      const b = group(0, 0.2, -0.16);
      for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
        const a = 0.12 + i * 0.36, r = 0.4 + Math.sin(a * 1.25) * 0.14;
        b.add(cbox(0.17, 0.24, 0.05, i % 2 ? def.trim || c : c, sx * Math.sin(a) * r, Math.cos(a) * r + 0.08, 0, { r: 0.03, rz: -sx * a }));
        b.add(cbox(0.11, 0.08, 0.06, def.lace || '#fffaf5', sx * Math.sin(a) * (r - 0.15), Math.cos(a) * (r - 0.15) + 0.08, 0.05, { r: 0.035, rz: -sx * a }));
      }
      g.add(b);
      (def.roses || ['#b3202f', '#d9414d', '#b3202f', '#ffffff', '#d9414d']).forEach((col, i) => g.add(cbox(0.14, 0.12, 0.14, col, -0.3 + i * 0.15, 0.4 + (i % 2) * 0.03 - Math.abs(i - 2) * 0.02, 0.22, { r: 0.05, ry: i })));
      break;
    }
    case 'oracle': {
      // 占卜师的缠头：金色月桂叶、一枚大宝石和竖起的羽翎（灵谕未启）
      const gm = mat(c, { rough: 0.3, metal: 0.55 });
      g.add(cbox(0.9, 0.11, 0.1, def.band || '#2a2622', 0, 0.3, 0.33, { r: 0.03 }));
      for (let i = 0; i < 6; i++) g.add(cbox(0.15, 0.06, 0.05, gm, -0.34 + i * 0.1, 0.33 + (i % 2) * 0.03, 0.39, { r: 0.02, rz: 0.5 }));
      g.add(cbox(0.1, 0.1, 0.05, mat(def.gem || '#fff6dc', { emissive: def.gem || '#fff6dc', ei: 0.4 }), 0.2, 0.31, 0.41, { r: 0.03, rz: 0.78, ...ns }));
      for (const [x, y, rz, len] of [[0.2, 0.62, -0.15, 0.5], [0.3, 0.56, -0.5, 0.4], [0.1, 0.58, 0.2, 0.36]]) g.add(cbox(0.06, len, 0.04, def.plume || '#e9c463', x, y, 0.3, { r: 0.025, rz }));
      for (const sx of [-1, 1]) g.add(cbox(0.02, 0.2, 0.02, gm, sx * 0.44, 0.12, 0.3, { ...ns }));
      break;
    }
    case 'spiderlily': {
      // 斜插在发髻旁、花丝四散的火色彼岸花（烬蝶终歌）
      const b = group(0.3, 0.44, 0.12);
      const fm = mat(c, { rough: 0.4, emissive: c, ei: 0.25 });
      for (let i = 0; i < 7; i++) {
        const a = -1.3 + i * 0.43;
        b.add(cbox(0.05, 0.3, 0.03, i % 2 ? def.trim || '#f6a53a' : fm, Math.sin(a) * 0.14, Math.cos(a) * 0.14 + 0.02, 0, { r: 0.02, rz: -a }));
      }
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.6;
        b.add(cbox(0.012, 0.4, 0.012, def.core || '#ffd66d', Math.sin(a) * 0.2, Math.cos(a) * 0.2 + 0.03, 0.02, { rz: -a, ...ns }));
      }
      b.add(cbox(0.08, 0.08, 0.06, def.core || '#ffd66d', 0, 0, 0.02, { r: 0.03 }));
      b.rotation.set(-0.2, -0.4, -0.3);
      g.add(b);
      break;
    }
    case 'leafvine': {
      // 绕在额前的枫叶藤，两侧盘着小发髻（丰饶之赞）
      const cols = def.cols || [c];
      for (let i = 0; i < 8; i++) {
        const a = -1.5 + i * 0.43;
        g.add(cbox(0.13, 0.05, 0.1, cols[i % cols.length], Math.sin(a) * 0.43, 0.33 + (i % 2) * 0.04, Math.cos(a) * 0.39 - 0.02, { r: 0.02, ry: a, rz: i % 2 ? 0.5 : -0.4 }));
      }
      for (const sx of [-1, 1]) g.add(cbox(0.16, 0.14, 0.16, def.bun || '#b5532f', sx * 0.34, 0.4, -0.2, { r: 0.06 }));
      break;
    }
    case 'cat':
      g.add(cbox(0.9, 0.05, 0.08, c, 0, 0.385, 0.02, { r: 0.02 }));
      for (const sx of [-1, 1]) {
        g.add(frustum(0.03, 0.24, 0.24, c, sx * 0.25, 0.38, 0.02, { sz: 0.5, rz: -sx * 0.15 }));
        g.add(frustum(0.02, 0.13, 0.15, def.inner, sx * 0.25, 0.39, 0.06, { sz: 0.4, rz: -sx * 0.15, ...ns }));
      }
      break;
    case 'flower': {
      const cols = def.cols || ['#ff8fb1', '#ffe27a', '#ffffff', '#c9b6f2', '#ff8fb1', '#ffffff', '#ffe27a', '#ff9d6e', '#ffffff', '#c9b6f2'];
      cols.forEach((col, i) => {
        const a = (i / cols.length) * Math.PI * 2;
        g.add(cbox(0.15, 0.12, 0.15, col, Math.sin(a) * 0.4, 0.37, Math.cos(a) * 0.37 - 0.02, { r: 0.05, ry: a }));
        const a2 = a + Math.PI / cols.length;
        g.add(cbox(0.1, 0.06, 0.1, def.leaf || '#8fd17f', Math.sin(a2) * 0.41, 0.35, Math.cos(a2) * 0.38 - 0.02, { r: 0.03, ry: a2 }));
      });
      break;
    }
  }
}

// ————————————————— 背饰 —————————————————
function buildBack(g, def, refs) {
  const c = def.color;
  switch (def.back) {
    case 'ribbons': {
      // 背后的大蝴蝶结 + 两条长飘带（轻盈泡泡）
      const b = bowPair(c, 0.34, 0.26, 0.1, def.knot || c);
      b.position.set(0, 0.2, -0.2);
      g.add(b);
      for (const sx of [-1, 1]) {
        const r = group(sx * 0.1, 0.12, -0.2);
        r.add(cbox(0.13, 0.5, 0.04, def.tail, sx * 0.06, -0.25, 0, { r: 0.02, rz: sx * 0.16 }));
        r.add(cbox(0.11, 0.4, 0.04, def.tail, sx * 0.17, -0.66, 0, { r: 0.02, rz: sx * 0.28 }));
        g.add(r);
        refs.hairSwing.push({ node: r, amt: 1.4 });
      }
      break;
    }
    case 'net': {
      // 斜背的捕虫网（午后暖阳）
      const n = group(0, 0.3, -0.22);
      n.add(cbox(0.05, 1.3, 0.05, '#c99d77', 0, 0.2, 0, { r: 0.02 }));
      n.add(torus(0.2, 0.03, '#f6cf4a', 0, 0.98, 0));
      n.add(cbox(0.3, 0.3, 0.14, mat('#ffffff', { opacity: 0.55 }), 0, 0.93, -0.06, { r: 0.1, ...ns }));
      n.rotation.z = 0.5;
      g.add(n);
      break;
    }
    case 'rod': {
      // 背上的钓竿与小鱼篓（悠然水畔）
      const n = group(0, 0.3, -0.22);
      n.add(cbox(0.045, 1.5, 0.045, '#8a6a55', 0, 0.3, 0, { r: 0.02 }));
      n.add(cbox(0.1, 0.1, 0.1, '#d9dfe8', 0.06, -0.1, 0, { r: 0.03 }));
      n.add(cbox(0.012, 0.5, 0.012, '#ffffff', 0.03, 0.8, 0, ns));
      n.add(cbox(0.07, 0.09, 0.07, '#e8425e', 0.03, 0.55, 0, { r: 0.03 }));
      n.rotation.z = -0.45;
      g.add(n);
      g.add(cbox(0.3, 0.26, 0.16, '#d9b08a', 0.02, 0.14, -0.24, { r: 0.06 }));
      g.add(cbox(0.32, 0.06, 0.18, '#b3855f', 0.02, 0.28, -0.24, { r: 0.02 }));
      break;
    }
    case 'violin': {
      // 背着的小提琴（琴弦之诗）
      const n = group(0, 0.26, -0.24);
      n.add(cbox(0.3, 0.32, 0.09, c, 0, 0, 0, { r: 0.1 }));
      n.add(cbox(0.24, 0.24, 0.09, c, 0, 0.24, 0, { r: 0.09 }));
      n.add(cbox(0.06, 0.5, 0.05, '#3a2a22', 0, 0.56, -0.01, { r: 0.02 }));
      n.add(cbox(0.1, 0.1, 0.07, '#3a2a22', 0, 0.84, -0.01, { r: 0.03 }));
      n.add(cbox(0.02, 0.6, 0.02, '#f3e6c6', 0, 0.3, -0.055, ns));
      n.rotation.z = 0.6;
      g.add(n);
      break;
    }
    case 'toolbag': {
      // 工具包和扳手（满电行动）
      g.add(cbox(0.36, 0.3, 0.18, c, 0, 0.2, -0.24, { r: 0.06 }));
      g.add(cbox(0.38, 0.1, 0.2, '#3d3f4a', 0, 0.32, -0.24, { r: 0.03 }));
      g.add(cbox(0.1, 0.08, 0.03, '#ffd76a', 0, 0.2, -0.335, { r: 0.02 }));
      const w = group(0.13, 0.36, -0.26);
      w.add(cbox(0.05, 0.34, 0.04, '#cfd6e0', 0, 0.12, 0, { r: 0.015 }));
      w.add(cbox(0.13, 0.1, 0.04, '#cfd6e0', 0, 0.32, 0, { r: 0.03 }));
      w.rotation.z = -0.3;
      if (!def.plain) g.add(w);
      else g.add(cbox(0.3, 0.12, 0.16, '#f3ece2', 0, 0.42, -0.24, { r: 0.05 }));
      break;
    }
    case 'feather': {
      // 多重羽翼（白夜长旋舞 / 心光破晓时）
      const n = def.n || 3;
      for (const sx of [-1, 1]) {
        const w = group(sx * 0.06, 0.3, -0.19);
        for (let i = 0; i < n; i++) {
          const len = 0.62 - i * 0.1 + (n > 2 ? 0.25 : 0);
          w.add(cbox(len, 0.17, 0.06, i % 2 ? def.tip : c, sx * (len / 2 + 0.02), 0.3 - i * 0.17, -i * 0.012, { r: 0.04, rz: sx * (0.62 - i * 0.3) }));
          w.add(cbox(0.16, 0.12, 0.06, def.tip, sx * (len + 0.04), 0.3 - i * 0.17 + (0.62 - i * 0.3) * len * 0.5, -i * 0.012, { r: 0.04, rz: sx * (0.62 - i * 0.3) }));
        }
        g.add(w);
        refs.wings.push({ node: w, sx, slow: true });
      }
      break;
    }
    // —— premium-v2：五星套装专属背饰 ——
    case 'butterflies': {
      // 绕在身后的几只发光蝴蝶，会扇动翅膀
      const bm = mat(c, { opacity: 0.85, rough: 0.3, emissive: c, ei: 0.6 });
      const im = mat(def.inner || '#ffffff', { opacity: 0.9, emissive: def.inner || '#ffffff', ei: 0.5 });
      [[-0.44, 0.64, -0.3, 1], [0.48, 0.42, -0.34, 0.8], [0.22, 0.9, -0.4, 0.7], [-0.32, 0.2, -0.36, 0.65]].slice(0, def.n || 3).forEach(([x, y, z, k], i) => {
        const b = group(x, y, z);
        for (const sx of [-1, 1]) {
          const w = group(0, 0, 0);
          w.add(cbox(0.16 * k, 0.18 * k, 0.012, bm, sx * 0.09 * k, 0.04 * k, 0, { r: 0.005, rz: sx * 0.35, ...ns }));
          w.add(cbox(0.1 * k, 0.1 * k, 0.012, im, sx * 0.07 * k, -0.07 * k, 0, { r: 0.005, rz: -sx * 0.3, ...ns }));
          b.add(w);
          refs.wings.push({ node: w, sx });
        }
        b.rotation.set(0.3, i % 2 ? 0.5 : -0.4, i % 2 ? 0.2 : -0.2);
        g.add(b);
      });
      break;
    }
    case 'shards': {
      // 悬在身后的一圈冰晶棱片（生于无瑕）
      const cm = mat(c, { opacity: 0.8, rough: 0.12, metal: 0.25, emissive: c, ei: 0.35 });
      for (const [x, y, rz, h] of [[-0.46, 0.5, 0.5, 0.34], [0.46, 0.5, -0.5, 0.34], [-0.3, 0.86, 0.2, 0.26], [0.3, 0.86, -0.2, 0.26], [0, 1.02, 0, 0.3], [-0.56, 0.16, 0.9, 0.22], [0.56, 0.16, -0.9, 0.22]]) {
        const sh = group(x, y, -0.3);
        sh.add(frustum(0.01, 0.1, h * 0.6, cm, 0, 0, 0, { ...ns }));
        sh.add(frustum(0.1, 0.01, h * 0.4, cm, 0, -h * 0.4, 0, { ...ns }));
        sh.rotation.z = rz;
        g.add(sh);
      }
      break;
    }
    case 'windkey': {
      // 插在背后的八音盒发条钥匙（古典乐章）
      const gm = mat(c, { rough: 0.3, metal: 0.6 });
      const k = group(0, 0.3, -0.18);
      k.add(cbox(0.06, 0.06, 0.24, gm, 0, 0, -0.1, { r: 0.02 }));
      for (const sx of [-1, 1]) k.add(torus(0.1, 0.03, gm, sx * 0.12, 0, -0.24));
      k.add(cbox(0.1, 0.1, 0.05, def.knot || '#b9b6f2', 0, 0, 0, { r: 0.03 }));
      g.add(k);
      break;
    }
    case 'tail': {
      // 蓬松的猫妖长尾，尾尖一撮异色（缘缘长相念）
      const t = group(0, 0.06, -0.2);
      for (let i = 0; i < 5; i++) t.add(cbox(0.17 - i * 0.012, 0.17 - i * 0.012, 0.2, i === 4 ? def.tip || '#ffffff' : c, 0.02 * i * i, i * 0.1, -0.1 - i * 0.14, { r: 0.07, rx: -0.5 - i * 0.12 }));
      g.add(t);
      refs.hairSwing.push({ node: t, amt: 0.8 });
      break;
    }
    case 'starhalo': {
      // 身后缓缓亮着的一环星辰，可带一道流星尾迹（灵谕未启 / 流星绚烂时）
      const sm = mat(c, { rough: 0.25, emissive: c, ei: 0.7 });
      const h = group(0, 0.62, -0.32);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, k = i % 2;
        const st = group(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
        st.add(cbox(0.1 - k * 0.04, 0.1 - k * 0.04, 0.02, sm, 0, 0, 0, { rz: 0.785, ...ns }));
        st.add(cbox(0.03, 0.16 - k * 0.06, 0.02, sm, 0, 0, 0, { ...ns }));
        st.add(cbox(0.16 - k * 0.06, 0.03, 0.02, sm, 0, 0, 0, { ...ns }));
        h.add(st);
      }
      h.add(torus(0.46, 0.008, mat(def.inner || c, { emissive: def.inner || c, ei: 0.4, opacity: 0.7 }), 0, 0, 0, { ...ns }));
      g.add(h);
      if (def.trail) {
        g.add(cbox(0.035, 0.56, 0.03, sm, 0.5, 1.06, -0.34, { rz: 0.9, ...ns }));
        g.add(cbox(0.1, 0.1, 0.03, sm, 0.28, 0.88, -0.34, { rz: 0.785, ...ns }));
      }
      break;
    }
    case 'firework': {
      // 在肩后绽开的两朵花焰（缀夜希光）
      const fm = mat(c, { rough: 0.3, emissive: c, ei: 0.8 }), f2 = mat(def.inner || '#ffffff', { emissive: def.inner || '#ffffff', ei: 0.8 });
      for (const [cx, cy, k] of [[-0.44, 0.8, 1], [0.46, 0.56, 0.75]]) {
        const h = group(cx, cy, -0.34);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          h.add(cbox(0.02, 0.2 * k, 0.02, i % 2 ? fm : f2, Math.sin(a) * 0.16 * k, Math.cos(a) * 0.16 * k, 0, { rz: -a, ...ns }));
          h.add(cbox(0.04, 0.04, 0.02, fm, Math.sin(a) * 0.3 * k, Math.cos(a) * 0.3 * k, 0, { rz: 0.78, ...ns }));
        }
        g.add(h);
      }
      break;
    }
    case 'bigflower': {
      // 斜背在身后的大花伞（飞花的追忆）
      const f = group(0, 0.36, -0.22);
      f.add(cbox(0.05, 1.3, 0.05, '#7cc77a', 0, 0.3, 0, { r: 0.02 }));
      const hd = group(0, 1.0, -0.02);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        hd.add(cbox(0.34, 0.34, 0.06, i % 2 ? c : def.inner, Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0, { r: 0.1, rz: -a }));
      }
      hd.add(cbox(0.24, 0.24, 0.1, '#ffe27a', 0, 0, 0.01, { r: 0.09 }));
      f.add(hd);
      f.rotation.z = -0.4;
      g.add(f);
      break;
    }
    case 'balloon':
    case 'bag':
    case 'bow':
      break;
    case 'wings': {
      // 半透明的精灵蝶翼（花漾梦萦）
      const m1 = mat(c, { opacity: 0.72, rough: 0.3, emissive: c, ei: 0.25 });
      const m2 = mat(def.inner, { opacity: 0.8, rough: 0.3, emissive: def.inner, ei: 0.3 });
      for (const sx of [-1, 1]) {
        const w = group(sx * 0.05, 0.28, -0.18);
        w.add(cbox(0.5, 0.56, 0.03, m1, sx * 0.3, 0.22, 0, { r: 0.014, rz: sx * 0.45, ...ns }));
        w.add(cbox(0.28, 0.34, 0.035, m2, sx * 0.28, 0.2, 0.003, { r: 0.014, rz: sx * 0.45, ...ns }));
        w.add(cbox(0.34, 0.36, 0.03, m1, sx * 0.22, -0.16, 0, { r: 0.014, rz: -sx * 0.35, ...ns }));
        w.add(cbox(0.16, 0.18, 0.035, m2, sx * 0.21, -0.17, 0.003, { r: 0.014, rz: -sx * 0.35, ...ns }));
        g.add(w);
        refs.wings.push({ node: w, sx });
      }
      break;
    }
  }
}

// ————————————————— 衣裙（躯干部分）—————————————————
function buildTorso(g, d, skin) {
  g.add(box(0.5, 0.44, 0.3, d.metal ? mat(d.top, { rough: 0.32, metal: 0.45 }) : d.top, 0, 0, 0, { r: 0.07 }));
  if (d.tie) {
    g.add(cbox(0.09, 0.07, 0.04, d.tie, 0, 0.37, 0.16, { r: 0.02 }));
    g.add(cbox(0.08, 0.24, 0.03, d.tie, 0, 0.23, 0.165, { r: 0.02 }));
  }
  if (d.emblem) {
    g.add(cbox(0.2, 0.18, 0.03, d.emblem, -0.1, 0.27, 0.15, { r: 0.03 }));
    g.add(cbox(0.05, 0.09, 0.02, '#ffe27a', -0.085, 0.3, 0.166, { rz: -0.5, ...ns }));
    g.add(cbox(0.05, 0.09, 0.02, '#ffe27a', -0.115, 0.24, 0.166, { rz: -0.5, ...ns }));
  }
  if (d.strap) g.add(cbox(0.06, 0.62, 0.34, d.strap, 0.02, 0.22, 0, { r: 0.02, rz: 0.72 }));
  if (d.brooch) g.add(cbox(0.09, 0.09, 0.04, mat(d.brooch, { rough: 0.2, emissive: d.brooch, ei: 0.25 }), 0, 0.3, 0.16, { r: 0.02, rz: 0.78 }));
  if (d.offShoulder) g.add(cbox(0.51, 0.1, 0.31, skin, 0, 0.4, 0, { r: 0.04 }));
  if (d.straps) for (const sx of [-1, 1]) g.add(cbox(0.045, 0.14, 0.315, d.straps, sx * 0.17, 0.41, 0, { r: 0.015 }));
  if (d.inner) g.add(cbox(0.24, 0.3, 0.04, d.inner, 0, 0.27, 0.14, { r: 0.02 }));
  if (d.collar) {
    g.add(cbox(0.2, 0.08, 0.05, d.collar, -0.11, 0.39, 0.14, { r: 0.02, rz: -0.35 }));
    g.add(cbox(0.2, 0.08, 0.05, d.collar, 0.11, 0.39, 0.14, { r: 0.02, rz: 0.35 }));
    g.add(cbox(0.46, 0.07, 0.07, d.collar, 0, 0.4, -0.13, { r: 0.02 }));
  }
  if (d.choker) g.add(cbox(0.3, 0.05, 0.26, d.choker, 0, 0.455, 0, { r: 0.02 }));
  if (d.frill) for (let i = 0; i < 4; i++) g.add(cbox(0.13, 0.08, 0.06, d.frill, -0.2 + i * 0.133, 0.36, 0.15, { r: 0.03 }));
  if (d.frillTrim) g.add(cbox(0.52, 0.022, 0.05, d.frillTrim, 0, 0.318, 0.158, { r: 0.01 }));
  if (d.vneck) {
    g.add(cbox(0.08, 0.3, 0.03, d.vneck, -0.06, 0.3, 0.145, { r: 0.01, rz: -0.4 }));
    g.add(cbox(0.08, 0.3, 0.03, d.vneck, 0.06, 0.3, 0.145, { r: 0.01, rz: 0.4 }));
  }
  if (d.stripes) g.add(cbox(0.515, 0.06, 0.315, d.stripes, 0, 0.26, 0, { r: 0.02 }));
  if (d.sidePanel) for (const sx of [-1, 1]) g.add(cbox(0.08, 0.36, 0.315, d.sidePanel, sx * 0.22, 0.2, 0, { r: 0.02 }));
  if (d.belt) g.add(cbox(0.53, d.beltWide ? 0.12 : 0.08, 0.33, d.belt, 0, 0.13, 0, { r: 0.03 }));
  if (d.vest) {
    // 马甲 / 束腰：前片 + 两条肩带
    g.add(cbox(0.4, 0.3, 0.05, d.vest, 0, 0.17, 0.14, { r: 0.02 }));
    g.add(cbox(0.52, 0.26, 0.32, d.vest, 0, 0.14, 0, { r: 0.05 }));
    for (const sx of [-1, 1]) g.add(cbox(0.08, 0.22, 0.32, d.vest, sx * 0.15, 0.34, 0, { r: 0.02 }));
    if (d.lacing) for (let i = 0; i < 3; i++) g.add(cbox(0.14, 0.025, 0.02, d.lacing, 0, 0.1 + i * 0.08, 0.17, { rz: i % 2 ? 0.4 : -0.4, ...ns }));
  }
  if (d.bib) {
    g.add(cbox(0.3, 0.26, 0.04, d.bib, 0, 0.2, 0.15, { r: 0.02 }));
    g.add(cbox(0.07, 0.24, 0.32, d.bib, -0.14, 0.33, 0, { r: 0.02 }));
    g.add(cbox(0.07, 0.24, 0.32, d.bib, 0.14, 0.33, 0, { r: 0.02 }));
    if (d.pocket) g.add(cbox(0.16, 0.1, 0.03, d.pocket, 0, 0.17, 0.175, { r: 0.02 }));
  }
  if (d.apron) g.add(cbox(0.3, 0.26, 0.04, d.apron, 0, 0.2, 0.15, { r: 0.03 }));
  if (d.buttons) {
    const z = d.bib ? 0.175 : 0.155;
    if (d.bib) for (const sx of [-1, 1]) g.add(cbox(0.055, 0.055, 0.03, d.buttons, sx * 0.11, 0.29, z, { r: 0.02 }));
    else for (const y of [0.3, 0.17]) g.add(cbox(0.055, 0.055, 0.03, d.buttons, 0, y, z, { r: 0.02 }));
  }
  if (d.bow && !d.bowBack) {
    const b = bowPair(d.bow, d.bowBig ? 0.2 : 0.13, d.bowBig ? 0.15 : 0.1, 0.05, d.bowKnot || d.bow);
    b.position.set(0, d.bowBig ? 0.3 : 0.34, 0.17);
    g.add(b);
    if (d.bowTails) for (const sx of [-1, 1]) g.add(cbox(0.05, 0.16, 0.03, d.bow, sx * 0.04, 0.2, 0.165, { r: 0.015, rz: sx * 0.2 }));
  }
  if (d.bow && d.bowBack) {
    const b = bowPair(d.bow, 0.24, 0.2, 0.1, d.bow);
    b.position.set(0, 0.15, -0.19);
    g.add(b);
  }
  if (d.hood) g.add(cbox(0.44, 0.2, 0.16, d.hood, 0, 0.38, -0.2, { r: 0.07 }));
  if (d.ruffle) for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) g.add(cbox(0.12, 0.09, 0.2 - i * 0.04, d.ruffle, sx * (0.27 + i * 0.03), 0.4 - i * 0.07, 0, { r: 0.04 }));
  if (d.ruffleTrim) for (const sx of [-1, 1]) g.add(cbox(0.13, 0.022, 0.21, d.ruffleTrim, sx * 0.31, 0.285, 0, { r: 0.01 }));

  // —— premium-v2：五星套装的专属上身细节 ——
  if (d.yoke) {
    // 高领 + 胸前镂空的菱格领
    g.add(cbox(0.515, 0.15, 0.315, d.yoke, 0, 0.375, 0, { r: 0.04 }));
    g.add(cbox(0.27, 0.08, 0.25, d.yoke, 0, 0.465, 0, { r: 0.03 }));
    g.add(cbox(0.12, 0.12, 0.02, skin, 0, 0.36, 0.158, { rz: 0.78, ...ns }));
    if (d.yokeLine) for (const sx of [-1, 1]) for (const o of [0.1, 0.19]) g.add(cbox(0.012, 0.2, 0.012, d.yokeLine, sx * o, 0.375, 0.162, { rz: sx * 0.6, ...ns }));
    if (d.yokeGem) g.add(cbox(0.06, 0.06, 0.035, mat(d.yokeGem, { rough: 0.2, emissive: d.yokeGem, ei: 0.5 }), 0, 0.435, 0.165, { r: 0.012, rz: 0.78, ...ns }));
  }
  if (d.fanTop) {
    // 像折扇一样向上展开的抹胸
    for (let i = -3; i <= 3; i++) g.add(cbox(0.075, 0.24 - Math.abs(i) * 0.015, 0.04, d.fanTop[(i + 3) % d.fanTop.length], i * 0.068, 0.31 - Math.abs(i) * 0.012, 0.155, { r: 0.015, rz: -i * 0.13 }));
    g.add(cbox(0.5, 0.03, 0.05, d.fanTop[0], 0, 0.2, 0.16, { r: 0.012 }));
  }
  if (d.heartBodice) {
    // 心形胸衣，外面可以再套一圈金边
    const heart = (m, k, z) => {
      for (const sx of [-1, 1]) g.add(cbox(0.17 * k, 0.21 * k, 0.04, m, sx * 0.075 * k, 0.275, z, { r: 0.07 * k, rz: sx * 0.55 }));
      g.add(cbox(0.17 * k, 0.17 * k, 0.04, m, 0, 0.19 - (k - 1) * 0.02, z, { r: 0.02, rz: 0.785 }));
    };
    if (d.heartTrim) heart(mat(d.heartTrim, { rough: 0.3, metal: 0.5 }), 1.18, 0.15);
    heart(d.heartBodice, 1, 0.165);
  }
  if (d.broadCollar) {
    // 披在肩颈上的宽项圈，嵌一排宝石
    const bm = mat(d.broadCollar, { rough: 0.3, metal: 0.55 });
    g.add(cbox(0.53, 0.06, 0.33, bm, 0, 0.425, 0, { r: 0.025 }));
    for (let i = -2; i <= 2; i++) {
      g.add(cbox(0.1, 0.13 - Math.abs(i) * 0.025, 0.04, bm, i * 0.1, 0.355 + Math.abs(i) * 0.012, 0.158, { r: 0.02 }));
      if (d.collarGems) g.add(cbox(0.045, 0.045, 0.03, mat(d.collarGems, { rough: 0.2, emissive: d.collarGems, ei: 0.35 }), i * 0.1, 0.33 + Math.abs(i) * 0.02, 0.178, { r: 0.012, rz: 0.78, ...ns }));
    }
  }
  if (d.shoulderDeco) {
    const sd = d.shoulderDeco;
    for (const sx of [-1, 1]) {
      const sg = group(sx * 0.3, 0.45, 0);
      if (sd.type === 'flower') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          sg.add(cbox(0.16, 0.035, 0.07, i % 2 ? sd.color2 || sd.color : sd.color, Math.cos(a) * 0.09, 0.02 + (i % 2) * 0.02, Math.sin(a) * 0.09, { r: 0.015, ry: -a, rz: 0.35 }));
        }
        sg.add(cbox(0.07, 0.06, 0.07, sd.core || '#ffe27a', 0, 0.04, 0, { r: 0.025 }));
      } else if (sd.type === 'crystal') {
        const cm = mat(sd.color, { rough: 0.15, metal: 0.3, emissive: sd.color, ei: 0.2 });
        for (const [x, h, rz] of [[0, 0.2, 0.25], [0.07, 0.14, 0.7], [-0.05, 0.12, -0.15]]) sg.add(frustum(0.01, 0.07, h, cm, sx * x, -0.02, 0, { rz: -sx * rz }));
        sg.add(cbox(0.15, 0.06, 0.26, cm, 0, -0.03, 0, { r: 0.02 }));
      } else {
        for (let i = 0; i < 3; i++) sg.add(cbox(0.16, 0.025, 0.08, i === 1 ? sd.color2 || sd.color : sd.color, sx * (0.03 + i * 0.03), 0.01 + i * 0.015, (i - 1) * 0.09, { r: 0.012, rz: -sx * (0.35 + i * 0.1), ry: (i - 1) * 0.5 }));
      }
      g.add(sg);
    }
  }
  if (d.lattice) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(cbox(0.012, 0.3, 0.012, d.lattice, sx * (i - 1) * 0.1, 0.22, 0.168, { rz: sx * 0.55, ...ns }));
  if (d.empire) g.add(cbox(0.53, 0.07, 0.33, d.empire, 0, 0.255, 0, { r: 0.025 }));
  if (d.gemBelt) {
    const jm = mat(d.gemBelt, { rough: 0.2, emissive: d.gemBelt, ei: 0.4 });
    for (let i = -2; i <= 2; i++) g.add(cbox(i ? 0.045 : 0.07, i ? 0.045 : 0.07, 0.03, jm, i * 0.1, d.empire ? 0.255 : 0.13, 0.172, { r: 0.012, rz: 0.78, ...ns }));
  }
  if (d.waistBow) {
    const wb = d.waistBow, k = wb.size || 1, bx = wb.x || 0, by = wb.y ?? 0.16;
    const b = bowPair(wb.color, 0.24 * k, 0.19 * k, 0.07, wb.knot || wb.color);
    b.position.set(bx, by, 0.2);
    g.add(b);
    if (wb.checker) for (const sx of [-1, 1]) for (const [ox, oy] of [[0.1, 0.035], [0.18, -0.03]]) g.add(cbox(0.05, 0.05, 0.02, wb.checker, bx + sx * ox * k, by + oy * k, 0.243, { rz: 0.78, ...ns }));
    if (wb.tails) for (const sx of [-1, 1]) g.add(cbox(0.07, 0.26 * k, 0.03, wb.tails, bx + sx * 0.06, by - 0.16 * k, 0.2, { r: 0.015, rz: sx * 0.25 }));
    if (wb.gem) g.add(cbox(0.06, 0.06, 0.04, mat(wb.gem, { rough: 0.2, emissive: wb.gem, ei: 0.4 }), bx, by, 0.25, { r: 0.012, rz: 0.78, ...ns }));
  }
  if (d.backBow) {
    const b = bowPair(d.backBow, 0.3, 0.24, 0.1, d.backBowKnot || d.backBow);
    b.position.set(0, 0.14, -0.2);
    g.add(b);
  }

  // 裙摆
  if (d.skirt) {
    // 五星套装不再共用一条裙摆轮廓：数据里的 skirtShape 控制裙长、横向体积和专属下摆细节。
    // 仍使用轻量四棱台，保证与当前方块人风格、合批和移动端性能一致。
    const shape = d.skirtShape || 'aLine';
    const shapeCfg = {
      short:   { len: 0.72, bot: 0.78, sz: 0.72 },
      straight:{ len: 1.02, bot: 0.72, sz: 0.62 },
      ballgown:{ len: 1.12, bot: 1.34, sz: 0.98 },
      tutu:    { len: 0.66, bot: 1.16, sz: 0.9 },
      mermaid: { len: 1.1, bot: 0.76, sz: 0.7 },
      asym:    { len: 1.04, bot: 1.08, sz: 0.83 },
      petal:   { len: 0.94, bot: 1.12, sz: 0.86 },
      layered: { len: 1.0, bot: 1.18, sz: 0.87 },
      apron:   { len: 0.9, bot: 0.96, sz: 0.78 },
      aLine:   { len: 1, bot: 1, sz: 0.74 },
      column:  { len: 1.1, bot: 0.66, sz: 0.66 },
      bell:    { len: 0.92, bot: 1.24, sz: 0.95 },
    }[shape] || { len: 1, bot: 1, sz: 0.74 };
    const L = d.skirtLen * shapeCfg.len, top = shape === 'straight' ? 0.5 : 0.53;
    const bot = (0.6 + 0.3 * d.flare * (d.skirtLen / 0.3) ** 0.6) * shapeCfg.bot;
    const y0 = d.high ? 0.24 : 0.12; // 腰线（相对躯干底）；high = 高腰娃娃裙
    const tiers = d.tiers || [d.skirt];
    const n = tiers.length, SZ = shapeCfg.sz;
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const wt = top + (bot - top) * a;
      const wb = top + (bot - top) * b + (n > 1 ? 0.05 : 0);
      const offset = shape === 'asym' ? (i % 2 ? 0.055 : -0.02) : 0;
      g.add(frustum(wt, wb, L / n + 0.004, tiers[i], offset, y0 - L * b, 0, { sz: SZ }));
    }
    const ring = (w, y, fn, count = 12) => {
      // 沿裙摆一圈摆小方块：荷叶边 / 花瓣边
      for (let i = 0; i < count; i++) {
        const t = i / count, side = Math.floor(t * 4), u = (t * 4) % 1 - 0.5;
        const hx = w / 2, hz = (w * SZ) / 2;
        const p = side === 0 ? [u * w, hz] : side === 1 ? [hx, -u * w * SZ] : side === 2 ? [-u * w, -hz] : [-hx, u * w * SZ];
        const m = fn(i);
        m.position.set(p[0], y, p[1]);
        m.rotation.y = (side * Math.PI) / 2;
        g.add(m);
      }
    };
    if (d.hem) g.add(frustum(bot + 0.02, bot + 0.05, 0.045, d.hem, 0, y0 - L - 0.03, 0, { sz: SZ }));
    if (shape === 'mermaid') {
      // 鱼尾裙：收窄的主体下方再接一圈外翻尾摆。
      g.add(frustum(bot * 0.62, bot * 1.22, 0.11, d.hem || d.skirt, 0, y0 - L - 0.08, 0, { sz: SZ * 1.12 }));
      if (d.tail) for (const sx of [-1, 1]) g.add(frustum(0.16, bot * 0.56, 0.16, d.tail, sx * bot * 0.28, y0 - L - 0.2, -0.01, { sz: 0.55 }));
    }
    if (shape === 'tutu') {
      // 芭蕾蓬裙：多圈短荷叶边把短裙撑开。
      for (let i = 0; i < 3; i++) {
        const yy = y0 - L * (0.55 + i * 0.2);
        ring(bot * (0.95 + i * 0.08), yy, j => cbox(0.1, 0.055, 0.08, i % 2 ? (d.hem || d.skirt) : d.skirt, 0, 0, 0, { r: 0.025 }), 12);
      }
    }
    if (shape === 'asym') {
      // 不对称斜片：让裙摆左右高度和前后层次都不同。
      g.add(frustum(top * 0.94, bot * 1.08, L * 0.42, d.hem || d.skirt, -0.16, y0 - L * 0.58, 0.08, { sz: SZ * 0.62, rz: -0.18 }));
    }
    if (shape === 'petal') {
      // 花瓣裙：四个圆角短片组成花瓣状外轮廓。
      for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const petal = frustum(bot * 0.28, bot * 0.52, L * 0.34, d.hem || d.skirt, sx * bot * 0.3, y0 - L * 0.78, sz * bot * 0.17, { sz: 0.45 });
        petal.rotation.y = (sx < 0 ? -0.15 : sx > 0 ? 0.15 : sz < 0 ? 0.35 : -0.35);
        g.add(petal);
      }
    }
    if (d.band) {
      // 裙摆上方的一圈花边带，上面缀着小蝴蝶结
      const wa = top + (bot - top) * 0.74 + 0.012, wb = top + (bot - top) * 0.88 + 0.012;
      g.add(frustum(wa, wb, L * 0.14, d.band, 0, y0 - L * 0.88, 0, { sz: SZ }));
      if (d.bandBows) for (const x of [-0.26, 0.02, 0.3]) {
        const b = bowPair(d.bandBows, 0.07, 0.055, 0.03, d.bandBows);
        b.position.set(x * (wa / top) * 0.9, y0 - L * 0.81, wa * 0.37 + 0.03);
        g.add(b);
      }
    }
    if (d.sidePleat) {
      // 裙子一侧拼接的白色百褶
      const zc = (top + bot) * 0.25 * SZ + 0.035, tilt = -Math.atan2((bot - top) * 0.37, L);
      g.add(cbox(0.2, L * 0.96, 0.05, d.sidePleat, 0.2, y0 - L * 0.5, zc, { r: 0.02, rx: tilt }));
      for (let i = 1; i <= 2; i++) g.add(cbox(0.21, 0.018, 0.055, '#dfe3ee', 0.2, y0 - L * (0.2 + i * 0.25), zc + (i - 1.5) * 0.045, { rx: tilt, ...ns }));
    }
    if (d.petti) {
      // 白色衬裙：比裙摆略宽的一层 + 一圈荷叶边
      g.add(frustum(bot - 0.02, bot + 0.1, 0.07, d.petti, 0, y0 - L - 0.06, 0, { sz: SZ }));
      ring(bot + 0.1, y0 - L - 0.06, (i) => cbox(0.13, 0.08, 0.07, d.petti, 0, 0, 0, { r: 0.03 }), 16);
    }
    if (d.under) {
      // 比外裙更长的一层内衬裙，带荷叶边
      g.add(frustum(bot - 0.04, bot + 0.07, 0.11, d.under, 0, y0 - L - 0.13, 0, { sz: SZ }));
      ring(bot + 0.07, y0 - L - 0.13, () => cbox(0.12, 0.07, 0.06, d.under, 0, 0, 0, { r: 0.03 }), 16);
    }
    if (d.tails) for (const sx of [-1, 1]) g.add(frustum(0.22, 0.03, 0.24, d.tails, sx * (bot / 2 - 0.03), y0 - L - 0.22, 0, { sz: 0.55 }));
    if (d.roses) {
      const pts = [[-0.28, 0.35, 0.85], [0.2, 0.5, 0.95], [-0.06, 0.72, 1], [0.32, 0.86, 0.8], [-0.34, 0.86, 0.7], [0.04, 0.3, 1], [0.1, 0.93, 1], [-0.2, 0.6, 0.95]];
      pts.forEach(([px, py, k], i) => {
        const w = top + (bot - top) * py, col = d.roses[i % d.roses.length];
        g.add(cbox(0.085, 0.085, 0.06, col, px * w * 1.1, y0 - L * py, w * 0.37 * k + 0.01, { r: 0.03, rz: i }));
        g.add(cbox(0.05, 0.04, 0.04, '#9fcf8f', px * w * 1.1 + 0.06, y0 - L * py - 0.03, w * 0.37 * k + 0.005, { r: 0.01, ...ns }));
      });
      g.add(cbox(0.09, 0.09, 0.06, d.roses[0], -0.14, 0.2, 0.16, { r: 0.03 }));
      g.add(cbox(0.08, 0.08, 0.06, d.roses[1 % d.roses.length], 0.13, 0.26, 0.16, { r: 0.03 }));
    }
    if (d.leafHem) ring(bot + 0.02, y0 - L - 0.02, (i) => frustum(0.14, 0.02, 0.12 + (i % 3) * 0.04, i % 2 ? d.leafHem : d.leafHem2 || d.leafHem, 0, -0.1, 0, { sz: 0.35 }), 14);
    if (d.apron) g.add(cbox(0.3, L * 0.8, 0.05, d.apron, 0, y0 - L * 0.48, (top + bot) * 0.25 * SZ + 0.03, { r: 0.02, rx: -Math.atan2((bot - top) * 0.37, L) }));
    // —— premium-v2：五星套装的专属裙摆细节 ——
    // 裙子正面的斜面坐标系：原点在正面中线的半高处，y 沿裙面向上，z 朝外
    const slant = Math.hypot(L, ((bot - top) * SZ) / 2);
    const face = () => {
      const f = group(0, y0 - L / 2, ((top + bot) * SZ) / 4);
      f.rotation.x = -Math.atan2(((bot - top) * SZ) / 2, L);
      g.add(f);
      return f;
    };
    if (d.sheerOver) {
      // 罩在外面的一层薄纱
      const so = d.sheerOver, drop = so.drop ?? 0.05;
      g.add(frustum(top + 0.05, bot + (so.extra ?? 0.12), L + drop, mat(so.color, { opacity: so.opacity ?? 0.42, rough: 0.3 }), 0, y0 - L - drop, 0, { sz: SZ, ...ns }));
    }
    if (d.tierFrill) for (let i = 1; i <= n; i++) {
      // 每层裙摆的下沿各压一圈扇贝边
      const w = top + (bot - top) * (i / n), col = Array.isArray(d.tierFrill) ? d.tierFrill[(i - 1) % d.tierFrill.length] : d.tierFrill;
      g.add(frustum(w + 0.02, w + 0.1, 0.05, col, 0, y0 - (L * i) / n - 0.012, 0, { sz: SZ }));
    }
    if (d.ruffleTiers) d.ruffleTiers.forEach((col, k, arr) => {
      // 半透明的波浪欧根纱，一圈比一圈大
      const a = (k + 1) / arr.length, w = top + (bot - top) * a;
      const rm = mat(col, { opacity: d.ruffleOpacity ?? 0.78, rough: 0.35 });
      g.add(frustum(w - 0.02, w + 0.2, 0.1, rm, 0, y0 - L * a - 0.03, 0, { sz: SZ, ...ns }));
      g.add(frustum(w + 0.04, w + 0.12, 0.05, rm, 0, y0 - L * a + 0.03, 0, { sz: SZ, ...ns }));
    });
    if (d.pointLayers) for (const pl of d.pointLayers) {
      // 一圈尖角裙片：折纸翅膀 / 火焰花瓣 / 雪花蕾丝 / 手帕裙摆
      const at = pl.at ?? 1, w = top + (bot - top) * at + (pl.out ?? 0.04), len = pl.len || 0.16;
      ring(w, y0 - L * at - len / 2 + (pl.up ?? 0.03), (i) => {
        const col = pl.cols[i % pl.cols.length];
        const m = frustum(pl.w || 0.17, 0.015, len * (pl.vary ? 1 + (i % 3) * 0.2 : 1), pl.opacity ? mat(col, { opacity: pl.opacity, rough: 0.35 }) : pl.glow ? mat(col, { emissive: col, ei: pl.glow }) : col, 0, 0, 0, { sz: 0.3 });
        m.rotation.order = 'YXZ';
        m.rotation.x = pl.tilt ?? -0.2;
        return m;
      }, pl.count || 12);
    }
    if (d.frontPanel) {
      // 敞开的罩裙中间露出的前片：可以铺菱格、钉一列蝴蝶结、压两道镶边
      const fp = d.frontPanel, f = face(), w = fp.w || 0.3;
      f.add(frustum(w * 0.72, w * 1.25, slant * 0.98, fp.color, 0, -slant * 0.49, 0.012, { sz: 0.08 / w }));
      if (fp.checker) for (let r = 0; r < 4; r++) {
        const ww = w * (0.72 + ((r + 0.5) / 4) * 0.53);
        for (let c = 0; c < 3; c++) f.add(cbox(ww * 0.24, ww * 0.24, 0.02, fp.checker[(r + c) % fp.checker.length], (c - 1) * ww * 0.3, slant * (0.36 - r * 0.24), 0.05, { rz: 0.785, ...ns }));
      }
      if (fp.bows) for (let r = 0; r < 3; r++) {
        const b = bowPair(fp.bows, 0.07, 0.055, 0.03, fp.bowKnot || fp.bows);
        b.position.set(0, slant * (0.32 - r * 0.3), 0.075);
        f.add(b);
      }
      if (fp.edge) for (const sx of [-1, 1]) f.add(cbox(0.035, slant * 0.98, 0.05, fp.edge, sx * w * 0.49, 0, 0.035, { r: 0.012, rz: sx * Math.atan2(w * 0.265, slant) }));
    }
    if (d.sash) {
      // 从腰间垂到裙摆外的长飘带
      const sa = d.sash, f = face(), len = slant * (sa.len || 1.1), sw = sa.w || 0.08, gap = sa.gap ?? 0.07;
      const sm = sa.sheer ? mat(sa.color, { opacity: 0.7, rough: 0.3 }) : sa.color;
      for (const sx of sa.single ? [0] : [-1, 1]) {
        f.add(cbox(sw, len, 0.03, sm, sx * gap, slant / 2 - len / 2, 0.055, { r: 0.012, rz: sx * 0.07 }));
        if (sa.tip) f.add(cbox(sw + 0.025, 0.05, 0.035, sa.tip, sx * (gap + Math.sin(0.07) * len / 2), slant / 2 - len + 0.02, 0.055, { r: 0.012 }));
      }
    }
    if (d.scatter) for (const sc of [].concat(d.scatter)) {
      // 撒满整圈裙面的亮片 / 星子 / 宝石；tall 给出竖长的光丝
      const sm = sc.glow === false ? mat(sc.color) : mat(sc.color, { rough: 0.25, emissive: sc.color, ei: sc.glow ?? 0.5 });
      const size = sc.size || 0.04, fr = (v) => v - Math.floor(v), from = sc.from ?? 0.15, to = sc.to ?? 0.95, seed = sc.seed || 0;
      for (let i = 0; i < (sc.n || 14); i++) {
        const side = i % 4, u = fr(Math.sin((i + 1) * 12.9898 + seed) * 43758.5453) - 0.5, py = from + fr(Math.sin((i + 1) * 78.233 + seed) * 12345.678) * (to - from);
        const w = top + (bot - top) * py + 0.014, hx = w / 2, hz = (w * SZ) / 2;
        const p = side === 0 ? [u * w * 0.86, hz] : side === 1 ? [hx, -u * w * SZ * 0.86] : side === 2 ? [-u * w * 0.86, -hz] : [-hx, u * w * SZ * 0.86];
        const m = cbox(size, sc.tall ? size * sc.tall : size, 0.02, sm, p[0], y0 - L * py, p[1], { ...ns });
        m.rotation.order = 'YXZ';
        m.rotation.y = (side * Math.PI) / 2;
        m.rotation.x = -Math.atan2(((bot - top) * (side % 2 ? 1 : SZ)) / 2, L);
        if (!sc.tall) m.rotation.z = 0.785;
        g.add(m);
      }
    }
    if (d.hemCharms) {
      const hm = mat(d.hemCharms, { rough: 0.3, metal: 0.5 });
      ring(bot + 0.08, y0 - L - 0.05, (i) => cbox(0.05, i % 2 ? 0.09 : 0.06, 0.03, hm, 0, 0, 0, { r: 0.015, ...ns }), 18);
    }
    if (d.patch) {
      const w = top + (bot - top) * 0.6;
      g.add(cbox(0.16, 0.1, 0.03, d.patch, 0.12, y0 - L * 0.6, w * 0.37 + 0.01, { r: 0.04, ...ns }));
      g.add(cbox(0.07, 0.07, 0.03, d.patch, 0.22, y0 - L * 0.6, w * 0.37 + 0.01, { r: 0.01, rz: 0.78, ...ns }));
    }
    if (d.stars) {
      const sm = d.starGlow === false ? mat(d.stars) : mat(d.stars, { emissive: d.stars, ei: 0.4 });
      const pts = [[-0.2, 0.3, 0.9], [0.14, 0.5, 0.95], [-0.05, 0.78, 1], [0.27, 0.85, 0.8], [-0.3, 0.75, 0.7], [0.02, 0.2, 1]];
      for (const [px, py, k] of pts) {
        const w = top + (bot - top) * py;
        g.add(cbox(0.05, 0.05, 0.03, sm, px * w * 1.1, y0 - L * py, w * 0.37 * k + 0.005, { r: 0.012, rz: 0.78, ...ns }));
      }
    }
  }
  if (d.pants) g.add(cbox(d.puffy ? 0.56 : 0.51, 0.16, d.puffy ? 0.36 : 0.31, d.pants, 0, 0.05, 0, { r: 0.05 }));
}

function buildArm(d, skin) {
  const g = new THREE.Group();
  const len = 0.4;
  const sl = d.sleeve ? d.sleeveLen ?? 0.4 : 0;
  g.add(cbox(0.135, len, 0.15, skin, 0, 0.03 - len / 2, 0, { r: 0.05 }));
  if (d.sleeve) {
    const w = d.wide ? 0.17 : 0.155, dp = d.wide ? 0.27 : 0.17;
    const sLen = len * sl;
    const y0 = d.offShoulder ? -0.05 : 0.035;
    const m = d.sheer ? mat(d.sleeve, { opacity: 0.6 }) : d.sleeve;
    g.add(cbox(w, sLen, dp, m, 0, y0 - sLen / 2, 0, { r: 0.05 }));
    if (d.puff) g.add(cbox(0.21, 0.19, 0.22, d.sleeve, 0, y0 - 0.07, 0, { r: 0.08 }));
    if (d.cuff) g.add(cbox(w + 0.02, 0.05, dp + 0.02, d.cuff, 0, y0 - sLen, 0, { r: 0.02 }));
  } else if (!d.offShoulder) {
    g.add(cbox(0.15, 0.07, 0.17, d.top, 0, 0.0, 0, { r: 0.03 }));
  }
  {
    // —— premium-v2：喇叭袖口、垂坠大袖、绑带、手套翻边 ——
    const w0 = d.wide ? 0.17 : 0.155, sLen0 = len * (d.sleeve ? d.sleeveLen ?? 0.4 : 0), endY = (d.offShoulder ? -0.05 : 0.035) - sLen0;
    if (d.cuffFlare) {
      const cf = d.cuffFlare, cm = cf.sheer ? mat(cf.color, { opacity: 0.7 }) : cf.color, fl = cf.len || 0.1;
      g.add(frustum(w0 + 0.01, w0 + (cf.w || 0.12), fl, cm, 0, endY - fl + 0.02, 0, { sz: 1.15 }));
      if (cf.color2) g.add(frustum(w0 + 0.02, w0 + (cf.w || 0.12) * 0.7, fl * 0.7, cf.color2, 0, endY - fl * 0.7 + 0.05, 0, { sz: 1.15 }));
    }
    if (d.sleeveDrop) {
      const sd = d.sleeveDrop, dm = sd.sheer ? mat(sd.color, { opacity: sd.opacity ?? 0.62 }) : sd.color, dl = sd.len || 0.28;
      g.add(frustum(w0 + 0.02, 0.3, sLen0 * 0.55 + dl, dm, 0, endY - dl, -0.02, { sz: 1.5 }));
      if (sd.trim) g.add(frustum(0.3, 0.32, 0.03, sd.trim, 0, endY - dl - 0.015, -0.02, { sz: 1.5 }));
    }
    if (d.armWrap) for (let i = 0; i < 4; i++) g.add(cbox(0.15, 0.035, 0.165, d.armWrap, 0, -0.1 - i * 0.065, 0, { r: 0.012, rz: i % 2 ? 0.12 : -0.12 }));
    if (d.gloveCuff && d.gloves) g.add(frustum(0.24, 0.16, 0.06, d.gloveCuff, 0, -0.37 + (d.glovesLen ?? 0.12) - 0.02, 0, { sz: 1.1 }));
  }
  if (d.gloves) {
    const gl = d.glovesLen ?? 0.12;
    g.add(cbox(0.15, gl, 0.165, d.gloves, 0, -0.37 + gl / 2, 0, { r: 0.045 }));
  }
  if (d.wrist) g.add(cbox(0.155, 0.05, 0.17, d.wrist, 0, -0.27, 0, { r: 0.02 }));
  return g;
}

function buildLeg(d, sh, skin) {
  const g = new THREE.Group();
  g.add(cbox(0.18, 0.3, 0.19, skin, 0, -0.15, 0, { r: 0.05 }));
  if (sh.stock) {
    // 长袜 / 连裤袜
    const hgt = sh.stockH ?? 0.26;
    g.add(cbox(0.186, hgt, 0.196, sh.stock, 0, -0.27 + hgt / 2, 0, { r: 0.04 }));
    if (sh.stripe) for (let i = 0; i < 4; i++) g.add(cbox(0.19, 0.03, 0.2, sh.stripe, 0, -0.24 + i * 0.065, 0, { r: 0.01 }));
    if (sh.stockTrim) g.add(cbox(0.2, 0.03, 0.21, sh.stockTrim, 0, -0.27 + hgt, 0, { r: 0.012 }));
  }
  if (d.pants) {
    const pl = d.pantsLen;
    g.add(cbox(0.21, pl, 0.22, d.pants, 0, -pl / 2 + 0.01, 0, { r: 0.04 }));
    if (d.pantCuff) g.add(cbox(0.225, 0.05, 0.235, d.pantCuff, 0, -pl + 0.02, 0, { r: 0.02 }));
  }
  if (sh.sock) g.add(cbox(0.19, sh.sockH, 0.2, sh.sock, 0, -0.27 + sh.sockH / 2, 0, { r: 0.03 }));
  if (sh.sockBow) { const b = bowPair(sh.sockBow, 0.06, 0.05, 0.03, sh.sockBow); b.position.set(0, -0.27 + sh.sockH - 0.03, 0.11); g.add(b); }
  if (sh.straps) for (let i = 0; i < 3; i++) g.add(cbox(0.19, 0.025, 0.2, sh.straps, 0, -0.25 + i * 0.07, 0, { r: 0.01 }));
  const shoeMat = sh.shine ? mat(sh.color, { rough: 0.2, metal: 0.1, emissive: sh.color, ei: 0.15 }) : mat(sh.color, { rough: 0.6 });
  g.add(cbox(0.205, sh.flat ? 0.07 : 0.11, 0.28, shoeMat, 0, sh.flat ? -0.325 : -0.305, 0.03, { r: 0.035 }));
  if (sh.boot) {
    g.add(cbox(0.205, sh.boot, 0.215, shoeMat, 0, -0.27 + sh.boot / 2, 0, { r: 0.04 }));
    if (sh.trim) g.add(cbox(0.215, 0.035, 0.225, sh.trim, 0, -0.27 + sh.boot, 0, { r: 0.015 }));
    if (sh.lace) for (let i = 0; i < 2; i++) g.add(cbox(0.1, 0.02, 0.02, sh.lace, 0, -0.24 + i * 0.05, 0.11, ns));
  }
  if (sh.sole) g.add(cbox(0.215, 0.04, 0.29, sh.sole, 0, -0.345, 0.03, { r: 0.018 }));
  if (sh.strap) g.add(cbox(0.21, 0.035, 0.06, sh.color, 0, -0.235, 0.0, { r: 0.015 }));
  if (sh.toe) g.add(cbox(0.1, 0.06, 0.05, sh.toe, 0, -0.29, 0.165, { r: 0.02 }));
  return g;
}

// ————————————————— 角色 —————————————————
export function outfitToLook(outfit, base = {}) {
  const o = { ...DEFAULT_OUTFIT, ...outfit };
  const get = (k) => CLOTH[o[k]] || CLOTH[DEFAULT_OUTFIT[k]];
  return { skin: SKIN, eye: '#7a3f6b', ...base, hair: get('hair'), dress: get('dress'), shoes: get('shoes'), acc: get('acc'), back: get('back') };
}

export class Character {
  constructor(look) {
    this.root = new THREE.Group();
    this.root.userData.noMerge = true; // 四肢要动，不参与静态合并
    // 角色的逐网格方向光阴影在手机端低频 shadow-map 更新时会跳变。
    // 用一个长期复用的脚下软 blob 作为稳定接触影，避免每帧创建/销毁阴影对象。
    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x6b5360, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadowBlob.name = 'character-contact-blob';
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.018;
    this.shadowBlob.scale.set(0.72, 0.42, 1);
    this.shadowBlob.renderOrder = -1;
    this.root.add(this.shadowBlob);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.t = rand(10);
    this.phase = 0;
    this.move = 0; // 0..1 行走强度
    this.targetMove = 0;
    this.pose = 'idle';
    this.blinkT = rand(2, 4);
    this.setLook(look);
    this.InitCharacter()
  }

  InitCharacter = function (type) {
    this.MoveSpeed = 5.6
  }

  UpdateMove = function(dt) {
    
  }


  setLook(look) {
    this.look = look;
    const b = this.body;
    // 换装会重建合并后的静态几何；先释放上一套造型独占的合并网格，避免
    // 反复进出小游戏或临时睡衣时旧模型从渲染器里累积。
    for (const child of [...b.children]) {
      disposeSceneResources(child);
      b.remove(child);
    }
    const refs = (this.refs = { hairSwing: [], wings: [], float: null });
    const skin = look.skin || SKIN;
    const d = look.dress, sh = look.shoes;

    this.legL = group(-0.125, 0.36, 0, buildLeg(d, sh, skin));
    this.legR = group(0.125, 0.36, 0, buildLeg(d, sh, skin));
    this.torso = group(0, 0.33, 0);
    buildTorso(this.torso, d, skin);
    this.armL = group(-0.315, 0.72, 0, buildArm(d, skin));
    this.armR = group(0.315, 0.72, 0, buildArm(d, skin));
    this.head = group(0, 0.75, 0);
    const hc = group(0, 0.35, 0);
    this.head.add(hc);
    hc.add(cbox(0.78, 0.68, 0.7, skin, 0, 0, 0, { r: 0.16 }));
    const eyeM = mat(look.eye || '#7a3f6b', { rough: 0.4 });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const e = group(sx * 0.17, -0.04, 0.351);
      e.add(cbox(0.105, 0.165, 0.03, eyeM, 0, 0, 0, { r: 0.014, ...ns }));
      e.add(cbox(0.04, 0.05, 0.012, '#ffffff', -0.02, 0.04, 0.014, { r: 0.005, ...ns }));
      e.add(cbox(0.022, 0.022, 0.012, '#ffffff', 0.025, -0.045, 0.014, { r: 0.004, ...ns }));
      hc.add(e);
      this.eyes.push(e);
      hc.add(cbox(0.13, 0.065, 0.012, '#ffb3c1', sx * 0.275, -0.16, 0.349, { r: 0.006, opacity: 0.85, ...ns }));
    }
    hc.add(cbox(0.075, 0.032, 0.012, '#e8718a', 0, -0.175, 0.35, { r: 0.006, ...ns }));
    const hairG = group();
    hc.add(hairG);
    buildHair(hairG, look.hair, refs);
    if (look.acc && look.acc.acc !== 'none') buildAcc(hc, look.acc);
    // 背饰悬在身后一小段距离（长发和蓬裙都比后背厚），再缩小一点点
    this.back = group(0, 0.33, -0.3);
    this.back.scale.setScalar(0.94);
    if (look.back && look.back.back !== 'none') buildBack(this.back, look.back, refs);

    b.add(this.legL, this.legR, this.torso, this.armL, this.armR, this.head, this.back);
    // 真实角色阴影由上面的稳定 blob 替代；静态场景仍可正常投射/接收阴影。
    b.traverse((node) => { if (node.isMesh) node.castShadow = false; });
    // 每个肢体里不会单独动的零件按材质合并（会眨的眼睛、会摆的头发和翅膀保留），一个角色从四十多次绘制降到十几次
    const keep = [...this.eyes, ...refs.hairSwing.map((x) => x.node), ...refs.wings.map((x) => x.node), refs.float];
    for (const part of [this.legL, this.legR, this.torso, this.armL, this.armR, this.head, this.back]) mergeStatic(part, keep);
  }

  setPose(p) {
    if (this.pose !== p) { this.pose = p; this.poseT = 0; }
  }

  update(dt) {
    this.t += dt;
    this.back.position.y = 0.33 + Math.sin(this.t * 1.8) * 0.025; // 背饰轻轻上下浮动
    this.poseT = (this.poseT || 0) + dt;
    this.move = damp(this.move, this.targetMove, 10, dt);
    const mv = this.move;
    this.phase += dt * (6 + 6 * mv) * (mv > 0.02 ? 1 : 0);
    const s = Math.sin(this.phase), t = this.t;

    let legA = s * 0.8 * mv, armLx = -s * 0.7 * mv, armRx = s * 0.7 * mv;
    let armLz = -0.06 - Math.sin(t * 1.6) * 0.02 * (1 - mv), armRz = 0.06 + Math.sin(t * 1.6) * 0.02 * (1 - mv);
    let y = Math.abs(Math.cos(this.phase)) * 0.06 * mv + Math.sin(t * 1.8) * 0.006;
    let headZ = Math.sin(this.phase) * 0.04 * mv + Math.sin(t * 0.7) * 0.02 * (1 - mv);
    let headX = 0, headY = 0, bodyX = mv * 0.06, bodyZ = 0;
    let legLx = null, legRx = null, legLz = 0, legRz = 0;

    const p = this.pose, period = PHOTO_MOTION_PERIODS[p];
    // 拍照统一时钟在移动、拍别人、弹窗时暂停；图标仍可使用本地 poseT。
    if (period && this.photoPlayback?.active) this.photoPlayback.time += dt;
    const pt = period && this.photoPlayback ? this.photoPlayback.time : this.poseT;
    const q = period ? (pt % period) / period * Math.PI * 2 : 0;
    const rise = (1 - Math.cos(q)) / 2;
    if (p === 'cheer') {
      y += Math.abs(Math.sin(pt * 7)) * 0.16;
      armLz = -2.6 + Math.sin(pt * 14) * 0.2;
      armRz = 2.6 - Math.sin(pt * 14) * 0.2;
      armLx = armRx = 0;
      headX = -0.12;
    } else if (p === 'sleep') {
      // 家具互动：躺床前的短暂晚安动作，配合临时睡衣换装。
      y = -0.04 + Math.sin(pt * 2.2) * 0.012;
      // 身体横放在床面，根节点仍由 Town 的移动系统托管，起身时不会留下偏移。
      bodyX = -Math.PI / 2; headX = 0.18; headZ = Math.sin(pt * 1.4) * 0.035;
      armLx = armRx = -0.35; armLz = -0.2; armRz = 0.2;
    } else if (p === 'wave') {
      armRz = 2.5 + Math.sin(pt * 10) * 0.35;
      armRx = 0;
      headZ = -0.08;
    } else if (p === 'work') {
      armLx = -1.25 + Math.sin(pt * 13) * 0.3;
      armRx = -1.25 - Math.sin(pt * 13) * 0.3;
      bodyX = 0.1;
      headX = 0.12;
    } else if (p === 'carry' || p === 'fish') {
      armLx = armRx = p === 'fish' ? -1.05 + Math.sin(pt * 2) * 0.04 : -1.3;
      armLz = 0.15; armRz = -0.15;
    } else if (p === 'reel') {
      armLx = -1.3 + Math.sin(pt * 22) * 0.12;
      armRx = -1.3 - Math.sin(pt * 22) * 0.12;
      armLz = 0.15; armRz = -0.15;
      bodyX = -0.14;
    } else if (p === 'sad') {
      headX = 0.3;
      armLx = armRx = 0.1;
      bodyX = 0.08;
    } else if (p === 'water') {
      armRx = -1.1 + Math.sin(pt * 8) * 0.12;
      armRz = -0.1;
      bodyX = 0.12;
    } else if (p === 'pick') {
      const k = Math.sin(Math.min(pt * 5, Math.PI));
      bodyX = 0.5 * k;
      armLx = armRx = -1.2 * k;
      y -= 0.05 * k;
    } else if (p === 'twirl') {
      armLz = -1.2; armRz = 1.2;
    } else if (p === 'photo_stand') {
      y = Math.sin(q) * 0.012; headZ = Math.sin(q) * 0.015;
      armLz = -0.07 - Math.sin(q) * 0.02; armRz = -armLz;
      if (this.photoPlayback?.handheld) { armRx = -1.45 + Math.sin(q) * 0.025; armRz = -0.25; }
    } else if (p === 'photo_happy') {
      y = rise * 0.18; armLz = -2.45 - Math.sin(q) * 0.22; armRz = -armLz;
      armLx = armRx = 0; legLz = -rise * 0.12; legRz = rise * 0.12; headX = -0.1; headZ = Math.sin(q) * 0.025;
    } else if (p === 'photo_twirl') {
      y = rise * 0.025; armLz = -1.15 - Math.sin(q * 2) * 0.12; armRz = -armLz;
      legLx = Math.sin(q) * 0.12; legRx = -legLx; headX = -0.05 + Math.sin(q) * 0.035; headZ = 0;
    } else if (p === 'photo_greeting') {
      y = Math.sin(q) * 0.01; armLz = -2.5 + Math.sin(q * 2) * 0.42; armLx = -0.25 + Math.sin(q) * 0.16;
      armRz = 0.15; armRx = -0.15; headZ = 0.1 + Math.sin(q) * 0.08; bodyZ = Math.sin(q) * 0.035;
    } else if (p === 'photo_heart') {
      y = Math.sin(q) * 0.015; armLx = armRx = -1 - rise * 0.42; armLz = 0.8 - rise * 0.33; armRz = -armLz;
      headX = 0.08; headZ = -0.07 + Math.sin(q) * 0.05; bodyX = -0.025 - rise * 0.06;
    } else if (p === 'photo_shy') {
      y = Math.sin(q) * 0.012; armLx = armRx = -1.85 - rise * 0.45; armLz = 0.12; armRz = -0.12;
      headY = Math.sin(q) * 0.3; headZ = -0.12 + Math.sin(q) * 0.07; headX = 0.08 + rise * 0.14; bodyZ = Math.sin(q) * 0.045;
    } else if (p === 'photo_salute') {
      y = Math.sin(q) * 0.008; armRx = -0.65 - rise * 1.8; armRz = 0.12 + rise * 0.2; armLx = -0.35; armLz = 0.5;
      headX = -0.12 * rise; headZ = 0; bodyX = -0.035 * rise;
    } else if (p === 'photo_star') {
      armLz = -0.8 - rise * 1.05; armRz = -armLz; armLx = armRx = 0;
      legLz = -0.08 - rise * 0.24; legRz = -legLz; y = -rise * 0.025; headX = -rise * 0.12; headZ = 0;
    } else if (p === 'photo_balance') {
      y = Math.sin(q) * 0.008; armLz = -1 - rise * 0.45; armRz = 0.9 + rise * 0.45; armLx = armRx = 0.2;
      legLx = 0.18 + rise * 0.72; legRx = 0.02; bodyX = 0.08 + rise * 0.14;
      bodyZ = -0.05 + Math.sin(q) * 0.025; headX = -0.1 - rise * 0.08; headZ = 0.06;
    } else if (p === 'photo_curtsy') {
      armLz = -0.35 - rise * 0.35; armRz = -armLz; armLx = armRx = -0.05 - rise * 0.1;
      legLx = -rise * 0.2; legRx = 0.1 + rise * 0.45; legRz = -rise * 0.2;
      y = -rise * 0.1; bodyX = rise * 0.32; headX = rise * 0.3; headZ = 0.08;
    }
    const k = 1 - Math.exp(-(period ? 9 : 14) * dt);
    const L = (o, key, v) => (o.rotation[key] += (v - o.rotation[key]) * k);
    L(this.legL, 'x', legLx ?? legA);
    L(this.legR, 'x', legRx ?? -legA);
    L(this.legL, 'z', legLz);
    L(this.legR, 'z', legRz);
    L(this.armL, 'x', armLx);
    L(this.armR, 'x', armRx);
    L(this.armL, 'z', armLz);
    L(this.armR, 'z', armRz);
    L(this.head, 'z', headZ);
    L(this.head, 'x', headX);
    L(this.head, 'y', headY);
    L(this.body, 'x', bodyX);
    L(this.body, 'z', bodyZ);
    if (period || this.photoTurning) {
      // 绕身体中心持续转圈，不覆盖根节点朝向、移动方向或支架机位。
      const target = p === 'photo_twirl' ? q : 0;
      const delta = Math.atan2(Math.sin(target - this.body.rotation.y), Math.cos(target - this.body.rotation.y));
      this.body.rotation.y += Math.max(-dt * 5, Math.min(dt * 5, delta * k));
      this.body.rotation.y = Math.atan2(Math.sin(this.body.rotation.y), Math.cos(this.body.rotation.y));
      this.photoTurning = !!period || Math.abs(this.body.rotation.y) > 0.0001;
      if (!this.photoTurning) this.body.rotation.y = 0;
    }
    this.body.position.y += (y - this.body.position.y) * Math.min(1, k * 1.6);
    this.torso.scale.set(1, 1 + Math.sin(period ? q : t * 1.8) * (p === 'photo_stand' ? 0.018 : 0.012), 1);

    for (const h of this.refs.hairSwing) {
      const target = (0.16 * mv + Math.sin(t * 2.2 + h.amt) * 0.025 + Math.abs(s) * 0.07 * mv) * h.amt;
      h.node.rotation.x += (target - h.node.rotation.x) * k;
      if (h.baseZ !== undefined) h.node.rotation.z = h.baseZ + Math.sin(this.phase + h.baseZ * 9) * 0.1 * mv;
    }
    for (const w of this.refs.wings) w.node.rotation.y = w.sx * (w.slow ? 0.25 + Math.sin(t * 1.6) * 0.12 : 0.35 + Math.sin(t * (3 + mv * 5)) * 0.3);
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.12 : 1;
    if (this.blinkT < 0) this.blinkT = rand(2.2, 5);
    const happy = p === 'cheer' || p === 'photo_happy' ? 0.35 : 1;
    for (const e of this.eyes) e.scale.y = Math.min(blink, happy);
  }
}

// 路人的随机造型
const NPC_HAIR = [['#6b4a3a', '#57392b'], ['#3d3550', '#2c2640'], ['#f3d08a', '#e3b85f'], ['#9ad0f5', '#74b6e6'], ['#c8e6a0', '#a8d07a'], ['#f2a65a', '#de8c3c'], ['#e9e3f5', '#cfc6e6']];
const NPC_DRESS = [
  { top: '#ffffff', sleeve: '#ffffff', sleeveLen: 0.4, skirt: '#8ec5f2', skirtLen: 0.3, flare: 1, collar: '#8ec5f2' },
  { top: '#ffe9a8', sleeve: '#ffe9a8', sleeveLen: 0.5, pants: '#7a8fc9', pantsLen: 0.24 },
  { top: '#c9b6f2', sleeve: null, skirt: '#c9b6f2', skirtLen: 0.36, flare: 1.1, belt: '#ffffff' },
  { top: '#9fe0c5', sleeve: '#9fe0c5', sleeveLen: 0.8, pants: '#f5efe6', pantsLen: 0.2, stripes: '#ffffff' },
  { top: '#ffb38a', sleeve: '#ffb38a', sleeveLen: 0.4, skirt: '#fff3e2', skirtLen: 0.32, flare: 1.05, buttons: '#ffffff' },
  { top: '#f5efe6', sleeve: '#f5efe6', sleeveLen: 0.45, pants: '#9c7a5e', pantsLen: 0.26, bib: '#9c7a5e', buttons: '#ffe27a' },
];
const NPC_SHOES = [{ color: '#8a6a55' }, { color: '#ffffff', sole: '#8ec5f2' }, { color: '#5c4558', sock: '#ffffff', sockH: 0.08 }, { color: '#e8a04a', boot: 0.14 }];
const NPC_ACC = [{ acc: 'none' }, { acc: 'none' }, { acc: 'straw', color: '#f3d9a0', band: '#ff8fb1' }, { acc: 'beret', color: '#6f9ad8' }, { acc: 'bow', color: '#ffd84f' }, { acc: 'chef', color: '#ffffff' }];
export function randomNpcLook(i = 0) {
  const [hc, hs] = NPC_HAIR[i % NPC_HAIR.length];
  return {
    skin: pick(['#ffe4d6', '#fbd5bd', '#f2c3a2', '#ffe9dd']),
    eye: pick(['#4a3b55', '#3f5a6b', '#5b4636']),
    hair: { hair: ['bob', 'twin', 'pony', 'bun', 'long', 'bob'][i % 6], color: hc, shade: hs, tie: '#ffffff' },
    dress: NPC_DRESS[i % NPC_DRESS.length],
    shoes: NPC_SHOES[i % NPC_SHOES.length],
    acc: NPC_ACC[(i * 5 + 2) % NPC_ACC.length],
    back: { back: 'none' },
  };
}

// 来访的原作角色：固定造型，对照游戏内人物画面做的方块版，不走随机路人模板
// 达达：浅金长发、粉色眼睛、头顶粉色爱心墨镜；白色泡泡袖衬衫配粉色背带和领结，浅蓝高腰裙
export const DADA_LOOK = {
  skin: '#ffe9dc', eye: '#e8607e',
  hair: { hair: 'long', color: '#f6e6b8', shade: '#e3cb8c', tie: '#ff8fb1' },
  dress: { top: '#f6f6fa', sleeve: '#f6f6fa', sleeveLen: 0.32, puff: true, straps: '#f08aa6', bow: '#e8607e', bowTails: true, skirt: '#a9c8f0', skirtLen: 0.4, high: true, flare: 1.05, hem: '#ffffff', wrist: '#ff9fbd' },
  shoes: { color: '#ffffff', sock: '#ffffff', sockH: 0.1 },
  acc: { acc: 'heartshades', color: '#ffb3cf', lens: '#ffd3e6' },
  back: { back: 'none' },
};
// 诺诺伊：红发侧马尾、圆框眼镜；白色短袖裙配深蓝背心，红色滚边，深色手套
export const NONOY_LOOK = {
  skin: '#ffe6d8', eye: '#4f9aa8',
  hair: { hair: 'pony', color: '#c9412f', shade: '#a53023', tie: '#2b2a33' },
  dress: { top: '#2c3350', sleeve: '#ffffff', sleeveLen: 0.32, puff: true, cuff: '#b03a35', collar: '#ffffff', skirt: '#ffffff', skirtLen: 0.38, flare: 1.1, hem: '#b03a35', gloves: '#2c3350', glovesLen: 0.1, buttons: '#d9b46a' },
  shoes: { color: '#5a3a2e', sock: '#ffffff', sockH: 0.12 },
  acc: { acc: 'roundglasses', color: '#3d3550', orn: '#2b2a33' },
  back: { back: 'none' },
};
// 小马尔克斯：姜橘色短发、卡其报童帽；白衬衫、深色领带、卡其围裙
export const MARQUES_LOOK = {
  skin: '#ffe2d0', eye: '#5b7fa8',
  hair: { hair: 'short', color: '#d9783c', shade: '#bd5f28' },
  dress: { top: '#fbfbf6', sleeve: '#fbfbf6', sleeveLen: 0.7, cuff: '#e9e4d6', collar: '#ffffff', apron: '#a9997a', straps: '#8a7a5c', pants: '#6f6354', pantsLen: 0.3, bow: '#4a3b3b' },
  shoes: { color: '#5a4636' },
  acc: { acc: 'newsboy', color: '#a9997a', brim: '#8a7a5c' },
  back: { back: 'none' },
};
// 莱拉：银灰偏紫的短发、棕色软呢帽；橄榄色外套配浅驼色翻领，米白衬衫，橘红领巾
export const LAILA_LOOK = {
  skin: '#ffe6d8', eye: '#8a7ab8',
  hair: { hair: 'short', fringe: 'swept', color: '#d9d4e6', shade: '#bdb6d0' },
  dress: { top: '#6b6b4e', sleeve: '#6b6b4e', sleeveLen: 1, cuff: '#d9b98a', collar: '#d9b98a', inner: '#fbf6ea', bow: '#e2623c', bowTails: true, belt: '#8a6a45', pants: '#57503c', pantsLen: 0.3 },
  shoes: { color: '#6e4a31', boot: 0.14, sole: '#4a3222' },
  acc: { acc: 'fedora', color: '#c98f4a', band: '#7a4f2a' },
  back: { back: 'none' },
};
// 乔万尼：灰绿色短发；深蓝外套、立起的白色高领、琥珀色内衬
export const GIOVANNI_LOOK = {
  skin: '#f7ddcc', eye: '#8a6ad0',
  hair: { hair: 'short', fringe: 'swept', color: '#7d8a82', shade: '#66736c' },
  dress: { top: '#2b3552', sleeve: '#2b3552', sleeveLen: 1, cuff: '#d9b46a', collar: '#f4f4f0', inner: '#c98a3c', belt: '#d9b46a', pants: '#1f2638', pantsLen: 0.3, gloves: '#1f2638', glovesLen: 0.1 },
  shoes: { color: '#1f2026' },
  acc: { acc: 'none' },
  back: { back: 'none' },
};

// ————————————————— 大喵 —————————————————
// 参考《无限暖暖》官方形象：直立的白色团子，戴黄色猫耳兜帽小斗篷，领口系红色蝴蝶结，
// 额前翘着一撮橘棕色呆毛，半睁的灰褐色眼睛、ω 嘴、两侧胡须，肚子上有个小小的 ×。
export class Momo {
  constructor(cloak = 'classic') {
    this.root = new THREE.Group();
    this.root.userData.noMerge = true; // 四肢、斗篷会动会换，不参与静态合并
    const b = (this.body = new THREE.Group());
    const inner = group(0, 0, 0, b);
    inner.scale.setScalar(0.74);
    this.root.add(inner);
    const W = '#fffdf8', DK = '#5a4a50';
    // 腿、身体、手
    this.legs = [];
    for (const sx of [-1, 1]) {
      const leg = cbox(0.15, 0.17, 0.17, W, sx * 0.11, 0.08, 0.01, { r: 0.06 });
      b.add(leg);
      this.legs.push(leg);
    }
    b.add(cbox(0.46, 0.42, 0.38, W, 0, 0.34, 0, { r: 0.17 }));
    b.add(cbox(0.07, 0.014, 0.01, DK, 0, 0.24, 0.193, { rz: 0.78, ...ns }));
    b.add(cbox(0.07, 0.014, 0.01, DK, 0, 0.24, 0.193, { rz: -0.78, ...ns }));
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = group(sx * 0.24, 0.44, 0.02, cbox(0.11, 0.22, 0.12, W, 0, -0.09, 0, { r: 0.05 }));
      arm.rotation.z = sx * 0.3;
      b.add(arm);
      this.arms.push({ arm, sx });
    }
    this.tail = group(0, 0.2, -0.2, cbox(0.1, 0.1, 0.16, W, 0, 0, -0.05, { r: 0.045 }));
    b.add(this.tail);
    // 头
    this.head = group(0, 0.58, 0.02);
    const hgrp = this.head;
    hgrp.add(cbox(0.66, 0.56, 0.54, W, 0, 0.28, 0, { r: 0.22 }));
    for (const sx of [-1, 1]) {
      // 眼睛（半睁）与胡须
      hgrp.add(cbox(0.085, 0.09, 0.02, '#7d6c70', sx * 0.14, 0.27, 0.272, { r: 0.03, ...ns }));
      hgrp.add(cbox(0.1, 0.035, 0.024, W, sx * 0.14, 0.315, 0.273, ns));
      hgrp.add(cbox(0.105, 0.014, 0.026, DK, sx * 0.14, 0.297, 0.274, ns));
      hgrp.add(cbox(0.03, 0.03, 0.022, '#ffffff', sx * 0.14 - 0.02, 0.275, 0.276, { r: 0.008, ...ns }));
      hgrp.add(cbox(0.2, 0.012, 0.012, DK, sx * 0.4, 0.22, 0.2, { rz: sx * 0.12, ...ns }));
      hgrp.add(cbox(0.2, 0.012, 0.012, DK, sx * 0.4, 0.16, 0.2, { rz: -sx * 0.1, ...ns }));
      hgrp.add(cbox(0.1, 0.045, 0.012, '#ffc9d2', sx * 0.22, 0.17, 0.268, { r: 0.006, opacity: 0.7, ...ns }));
      // ω 嘴
      hgrp.add(cbox(0.04, 0.03, 0.02, DK, sx * 0.02, 0.16, 0.273, { r: 0.012, ...ns }));
    }
    hgrp.add(cbox(0.03, 0.02, 0.022, '#f3a0ad', 0, 0.19, 0.275, { r: 0.006, ...ns }));
    // 额前的橘棕色呆毛
    const tuft = group(0.02, 0.58, 0.22);
    tuft.add(cbox(0.07, 0.2, 0.06, '#e8893a', 0, 0.08, 0, { r: 0.025, rz: -0.35 }));
    tuft.add(cbox(0.06, 0.1, 0.055, '#e8893a', 0.08, 0.17, 0, { r: 0.02, rz: -1.1 }));
    hgrp.add(tuft);
    this.tuft = tuft;
    b.add(hgrp);
    this.t = 0;
    this.move = 0;
    this.targetMove = 0;
    this.phase = 0;
    this.setCloak(cloak);
  }
  setCloak(value) {
    const id = normalizeMomoCloak(value);
    // 斗篷是可替换的两个独立节点（身体 / 头部）。旧版在快速切换、热更新或
    // 某些存档恢复路径里可能把同一节点挂了两次，造成“穿模像有两只大喵”
    // 的残影。每次换装先按稳定标记清理宿主下所有旧斗篷，只保留当前引用。
    // 同款重复调用也要走一次去重，不能被早退挡住。
    const isCloakNode = (node) => {
      const data = node?.userData;
      return node === this.cloakBody || node === this.cloakHead
        || data?.momoCloak
        || node?.name === 'momo-cloak-body' || node?.name === 'momo-cloak-head';
    };
    const clearHost = (host, keep = null) => {
      for (const child of [...host.children]) {
        if (!isCloakNode(child) || child === keep) continue;
        host.remove(child);
        disposeSceneResources(child);
      }
    };
    const sameAttached = this.cloakId === id
      && this.cloakBody?.parent === this.body
      && this.cloakHead?.parent === this.head;
    if (sameAttached) {
      clearHost(this.body, this.cloakBody);
      clearHost(this.head, this.cloakHead);
      return this;
    }
    clearHost(this.body);
    clearHost(this.head);
    const next = buildMomoCloak(id);
    this.cloakId = id;
    this.cloakBody = next.body; this.cloakHead = next.head;
    this.body.add(next.body); this.head.add(next.head);
    return this;
  }
  update(dt) {
    this.t += dt;
    this.move = damp(this.move, this.targetMove, 8, dt);
    this.phase += dt * 13 * this.move;
    const hop = Math.abs(Math.sin(this.phase)) * this.move;
    this.body.position.y = hop * 0.16;
    this.body.rotation.z = Math.sin(this.phase) * 0.08 * this.move;
    this.head.rotation.z = Math.sin(this.t * 0.9) * 0.05;
    this.tuft.rotation.z = Math.sin(this.t * 2.4) * 0.12 + hop * 0.3;
    for (const a of this.arms) a.arm.rotation.z = a.sx * (0.3 + hop * 0.9 + Math.sin(this.t * 1.7) * 0.04);
    this.legs.forEach((l, i) => (l.position.y = 0.08 + Math.max(0, Math.sin(this.phase + i * Math.PI)) * 0.05 * this.move));
  }
}
