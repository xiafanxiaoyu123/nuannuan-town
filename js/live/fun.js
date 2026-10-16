// 小镇里的互动小物件：扭蛋机、八音盒、弹弹蘑菇、幸运签筒、漂流瓶。
// 都是顺路玩一下的小东西：有反馈、有一点点小奖励，每天的次数记在 S.live.fun。
import { THREE, cbox, box, cyl, sph, group, mat, glow, textPlane } from '../core/kit.js';
import { app } from '../core/app.js';
import { S, bus, save, flushSave, addCoins, spend, stat } from '../core/state.js';
import { CROPS, DECO } from '../data.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, pick } from '../core/util.js';
import { seedIco, decorIcon, coinIco } from '../core/icons.js';
import { gameDayKey, gameDayNo } from '../core/gametime.js';

const dayKey = gameDayKey; // 每天一次的东西都按小镇的日子算
function today() {
  const f = S.live.fun, day = dayKey();
  if (f.day !== day) { f.day = day; f.used = {}; f.capsule = 0; save(); }
  return f;
}
const ns = { cast: false, receive: false };
export const CAPSULE_PRICE = 30, CAPSULE_MAX = 5;

// ————— 模型 —————
function capsuleMachine() {
  const g = group();
  g.add(box(0.9, 0.9, 0.8, '#ff8fb1', 0, 0, 0, { r: 0.12 }));
  g.add(cbox(0.96, 0.12, 0.86, '#ffffff', 0, 0.86, 0, { r: 0.05 }));
  g.add(cbox(0.84, 0.86, 0.74, mat('#dff3ff', { rough: 0.1, opacity: 0.45 }), 0, 0.96, 0, { r: 0.2, cast: false }));
  const balls = [];
  const cols = ['#ffd76a', '#7fc4f5', '#9fe0c5', '#c9b6f2', '#ff9fbd', '#ffffff'];
  for (let i = 0; i < 9; i++) {
    const b = sph(0.13, cols[i % cols.length], rand(-0.24, 0.24), 1.12 + rand(0, 0.45), rand(-0.2, 0.2), ns);
    b.userData = { y: b.position.y, ph: rand(6) };
    g.add(b); balls.push(b);
  }
  g.add(cbox(0.96, 0.14, 0.86, '#ffffff', 0, 1.8, 0, { r: 0.06 }));
  g.add(cbox(0.5, 0.2, 0.5, '#ff8fb1', 0, 1.92, 0, { r: 0.09 }));
  const knob = group(0.2, 0.5, 0.42);
  knob.add(cyl(0.13, 0.13, 0.08, '#ffffff', 0, 0, 0, { seg: 14, rx: Math.PI / 2 }));
  knob.add(cbox(0.24, 0.06, 0.06, '#ffd76a', 0, 0.04, 0.05, { r: 0.02 }));
  g.add(knob);
  g.add(cbox(0.3, 0.22, 0.06, '#5b4252', -0.2, 0.18, 0.41, { r: 0.04 }));
  const t = textPlane('扭蛋', { color: '#ffffff', height: 0.2, size: 48 });
  t.position.set(-0.18, 0.62, 0.41);
  g.add(t);
  g.userData.dyn = [...balls, knob];
  g.userData.shake = 0;
  g.userData.tick = (time) => {
    const k = g.userData.shake;
    for (const b of balls) b.position.y = b.userData.y + Math.abs(Math.sin(time * (2 + k * 14) + b.userData.ph)) * (0.03 + k * 0.22);
    knob.rotation.z = k > 0 ? time * 14 : 0;
    g.userData.shake = Math.max(0, k - 0.02);
  };
  return g;
}
function musicBox() {
  const g = group();
  g.add(box(1.0, 0.5, 0.8, '#fff6ea', 0, 0, 0, { r: 0.08 }));
  g.add(cbox(1.06, 0.08, 0.86, '#c9b6f2', 0, 0.5, 0, { r: 0.03 }));
  for (const [x, z] of [[-0.44, 0.34], [0.44, 0.34], [-0.44, -0.34], [0.44, -0.34]]) g.add(cbox(0.1, 0.1, 0.1, '#ffd76a', x, -0.02, z, { r: 0.03 }));
  const lid = group(0, 0.58, -0.4);
  lid.add(cbox(1.06, 0.07, 0.86, '#c9b6f2', 0, 0, 0.43, { r: 0.03 }));
  lid.add(cbox(0.6, 0.02, 0.4, glow('#fff3c4', '#ffd76a', 0.2, 1.4), 0, -0.04, 0.43, { r: 0.01, ...ns }));
  g.add(lid);
  const spin = group(0, 0.6, 0);
  spin.add(cyl(0.26, 0.26, 0.05, '#ffffff', 0, 0, 0, { seg: 18 }));
  // 转台上的小小暖暖：粉色双马尾的小人
  spin.add(cbox(0.2, 0.22, 0.16, '#ffc2d6', 0, 0.05, 0, { r: 0.07 }));
  spin.add(cbox(0.2, 0.18, 0.18, '#ffe6d8', 0, 0.26, 0, { r: 0.06 }));
  spin.add(cbox(0.24, 0.1, 0.2, '#f48fb1', 0, 0.38, -0.01, { r: 0.04 }));
  for (const sx of [-1, 1]) spin.add(cbox(0.08, 0.2, 0.08, '#f48fb1', sx * 0.16, 0.26, -0.04, { r: 0.03 }));
  g.add(spin);
  const crank = group(0.56, 0.26, 0);
  crank.add(cbox(0.14, 0.05, 0.05, '#ffd76a', 0.04, 0, 0, { r: 0.02 }));
  crank.add(cbox(0.05, 0.16, 0.05, '#ffd76a', 0.1, 0.06, 0, { r: 0.02 }));
  crank.add(cbox(0.1, 0.1, 0.1, '#ff8fb1', 0.1, 0.16, 0, { r: 0.04 }));
  g.add(crank);
  g.userData.dyn = [lid, spin, crank];
  g.userData.play = 0;
  g.userData.tick = (time, dt = 0.016) => {
    const on = g.userData.play > 0;
    g.userData.play = Math.max(0, g.userData.play - dt);
    lid.rotation.x += ((on ? -1.15 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
    spin.visible = lid.rotation.x < -0.2;
    if (on) { spin.rotation.y += dt * 3; crank.rotation.x += dt * 8; }
  };
  return g;
}
function bounceShroom() {
  const g = group();
  g.add(cyl(0.34, 0.42, 0.8, '#fff6ea', 0, 0, 0, { seg: 14 }));
  const cap = group(0, 0.74, 0);
  cap.add(cyl(0.78, 0.84, 0.16, '#ff7f9f', 0, 0, 0, { seg: 18 }));
  cap.add(cyl(0.56, 0.78, 0.26, '#ff7f9f', 0, 0.16, 0, { seg: 18 }));
  cap.add(cyl(0.26, 0.56, 0.2, '#ff7f9f', 0, 0.42, 0, { seg: 18 }));
  cap.add(cyl(0.7, 0.7, 0.05, '#fff6ea', 0, -0.03, 0, { seg: 18 }));
  for (const [x, z, r] of [[0.34, 0.34, 0.13], [-0.46, 0.14, 0.15], [0.1, -0.5, 0.12], [-0.1, 0.5, 0.1], [0.52, -0.2, 0.11], [-0.34, -0.4, 0.11]]) cap.add(cbox(r * 1.6, 0.1, r * 1.6, '#ffffff', x, 0.3 - Math.hypot(x, z) * 0.12, z, { r: 0.045, ...ns }));
  cap.add(cbox(0.2, 0.08, 0.2, '#ffffff', 0, 0.6, 0, { r: 0.04, ...ns }));
  g.add(cap);
  for (const sx of [-1, 1]) { g.add(cbox(0.08, 0.1, 0.03, '#5b4252', sx * 0.13, 0.46, 0.38, { r: 0.025, ...ns })); g.add(cbox(0.1, 0.05, 0.02, '#ffb3cb', sx * 0.25, 0.36, 0.38, { r: 0.02, ...ns })); }
  g.userData.dyn = [cap];
  g.userData.sq = 0;
  g.userData.tick = (time, dt = 0.016) => {
    const k = g.userData.sq;
    cap.scale.set(1 + k * 0.25, 1 - k * 0.45, 1 + k * 0.25);
    g.userData.sq = Math.max(0, k - dt * 3.2);
  };
  return g;
}
function fortuneTube() {
  const g = group();
  const RED = '#e2483f', RED_D = '#b93229', GOLD = '#ffd76a', INK = '#3a2f33';
  // 石台基：两层
  g.add(cbox(2.5, 0.14, 1.5, '#e4dcd2', 0, 0, 0, { r: 0.04 }));
  g.add(cbox(2.2, 0.12, 1.2, '#f1e9df', 0, 0.14, 0, { r: 0.04 }));
  // 供桌：木桌 + 红色桌布 + 金边
  g.add(box(1.0, 0.56, 0.56, '#b3855f', 0, 0.26, 0.1, { r: 0.05 }));
  g.add(cbox(1.1, 0.07, 0.66, RED, 0, 0.82, 0.1, { r: 0.03 }));
  g.add(cbox(1.1, 0.2, 0.03, RED, 0, 0.64, 0.43, { r: 0.012 }));
  g.add(cbox(1.1, 0.035, 0.035, GOLD, 0, 0.62, 0.435, { r: 0.012 }));
  g.add(cbox(0.2, 0.2, 0.02, GOLD, 0, 0.7, 0.447, { r: 0.02, rz: Math.PI / 4 }));
  // 签筒：六角红筒、两道金箍，插着长短不一的竹签
  const tube = group(-0.02, 0.89, 0.1);
  tube.add(cyl(0.2, 0.17, 0.5, RED, 0, 0, 0, { seg: 6 }));
  tube.add(cyl(0.215, 0.215, 0.05, GOLD, 0, 0.43, 0, { seg: 6 }));
  tube.add(cyl(0.2, 0.2, 0.05, GOLD, 0, 0.05, 0, { seg: 6 }));
  tube.add(cbox(0.14, 0.2, 0.02, '#fff6dc', 0, 0.16, 0.175, { r: 0.01, ...ns }));
  for (const [x, z, hgt, rz] of [[-0.07, 0.02, 0.32, 0.14], [0.07, -0.04, 0.38, -0.12], [0, 0.07, 0.28, 0.03], [0.03, -0.08, 0.34, -0.22], [-0.04, -0.03, 0.4, 0.06]]) { tube.add(cbox(0.035, hgt, 0.035, '#f3d9a0', x, 0.42, z, { r: 0.01, rz })); tube.add(cbox(0.04, 0.05, 0.04, RED, x + Math.sin(-rz) * hgt, 0.42 + hgt * 0.96, z, { r: 0.01, rz })); }
  g.add(tube);
  // 桌上的小香炉和一碟果子
  g.add(cyl(0.1, 0.07, 0.1, '#8a8f9c', 0.36, 0.89, 0.18, { seg: 10 }));
  for (const x of [0.33, 0.39]) g.add(cbox(0.012, 0.2, 0.012, '#c98a3c', x, 0.97, 0.18, ns));
  g.add(cyl(0.12, 0.09, 0.04, '#ffffff', -0.36, 0.89, 0.2, { seg: 12 }));
  for (const [x, z] of [[-0.39, 0.2], [-0.33, 0.2], [-0.36, 0.16]]) g.add(cbox(0.07, 0.07, 0.07, '#ffb347', x, 0.93, z, { r: 0.03 }));
  // 鸟居：圆柱、柱础、贯、岛木和两端上翘的笠木，中间挂匾
  for (const sx of [-1, 1]) {
    g.add(cyl(0.16, 0.19, 0.2, INK, sx * 0.98, 0.26, -0.3, { seg: 12 }));
    const post = cyl(0.095, 0.11, 2.3, RED, sx * 0.98, 0.44, -0.3, { seg: 12 });
    post.rotation.z = sx * 0.035;
    g.add(post);
    g.add(cbox(0.2, 0.14, 0.2, RED_D, sx * 0.9, 2.02, -0.3, { r: 0.03 }));
    // 笠木的翘角
    g.add(cbox(0.42, 0.12, 0.26, INK, sx * 1.22, 2.74, -0.3, { r: 0.04, rz: sx * 0.3 }));
    g.add(cbox(0.4, 0.11, 0.2, RED, sx * 1.18, 2.6, -0.3, { r: 0.04, rz: sx * 0.24 }));
  }
  g.add(cbox(2.3, 0.13, 0.16, RED, 0, 2.02, -0.3, { r: 0.04 }));
  g.add(cbox(2.2, 0.14, 0.2, RED, 0, 2.52, -0.3, { r: 0.04 }));
  g.add(cbox(2.34, 0.12, 0.26, INK, 0, 2.66, -0.3, { r: 0.04 }));
  g.add(cbox(0.1, 0.36, 0.1, RED, 0, 2.16, -0.3, { r: 0.02 }));
  g.add(cbox(0.52, 0.34, 0.05, GOLD, 0, 2.2, -0.21, { r: 0.03 }));
  g.add(cbox(0.44, 0.26, 0.05, INK, 0, 2.2, -0.2, { r: 0.02 }));
  const tx = textPlane('签', { color: '#ffd76a', height: 0.2, size: 64 });
  tx.position.set(0, 2.2, -0.17);
  g.add(tx);
  // 注连绳：两柱之间垂下来的一道绳，挂着白色纸垂和各色的签
  const slips = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, x = -0.86 + u * 1.72, y = 1.9 - Math.sin(u * Math.PI) * 0.2;
    g.add(cbox(0.17, 0.075, 0.075, i % 2 ? '#e9d7a6' : '#d9c48c', x, y, -0.3, { r: 0.03, rz: -Math.cos(u * Math.PI) * 0.35 }));
    if (i % 3 === 1) { const z = group(x, y - 0.02, -0.3); z.add(cbox(0.1, 0.12, 0.02, '#ffffff', 0, -0.08, 0, ns)); z.add(cbox(0.1, 0.12, 0.02, '#ffffff', 0.04, -0.2, 0, ns)); z.add(cbox(0.1, 0.12, 0.02, '#ffffff', 0, -0.32, 0, ns)); z.userData.ph = i; g.add(z); slips.push(z); }
    if (i % 3 === 2 || i === 6) { const sl = group(x, y - 0.03, -0.3); sl.add(cbox(0.012, 0.12, 0.012, '#c9a36a', 0, -0.06, 0, ns)); sl.add(cbox(0.11, 0.3, 0.02, ['#ffe9a8', '#ffc2d6', '#cfe6fb', '#ffffff'][i % 4], 0, -0.27, 0, { r: 0.01, ...ns })); sl.userData.ph = i * 1.7; g.add(sl); slips.push(sl); }
  }
  // 两边：一盏纸灯笼，一面系满签纸的小架子
  for (const sx of [-1, 1]) {
    g.add(cbox(0.02, 0.2, 0.02, INK, sx * 0.7, 1.82, -0.24, ns));
    g.add(cyl(0.13, 0.13, 0.24, glow('#ff8f6a', '#ff5a3c', 0.5, 2.2), sx * 0.7, 1.58, -0.24, { seg: 10 }));
    for (const y of [1.58, 1.82]) g.add(cyl(0.09, 0.09, 0.03, INK, sx * 0.7, y - 0.015, -0.24, { seg: 10 }));
  }
  const rack = group(-0.95, 0.26, 0.42);
  for (const x of [-0.24, 0.24]) rack.add(box(0.05, 0.9, 0.05, '#b3855f', x, 0, 0, { r: 0.015 }));
  for (const y of [0.3, 0.55, 0.8]) { rack.add(cbox(0.56, 0.03, 0.03, '#b3855f', 0, y, 0, { r: 0.01 })); for (let i = 0; i < 6; i++) rack.add(cbox(0.05, 0.11, 0.035, (i + y * 10) % 3 < 1 ? '#ffe9a8' : '#ffffff', -0.2 + i * 0.08, y - 0.05, 0.005, { r: 0.012, rz: ((i * 7) % 5 - 2) * 0.12, ...ns })); }
  rack.add(cbox(0.6, 0.05, 0.1, RED, 0, 0.9, 0, { r: 0.02 }));
  rack.rotation.y = 0.5;
  g.add(rack);
  g.userData.dyn = [tube, ...slips];
  g.userData.sh = 0;
  g.userData.tick = (time) => {
    for (const z of slips) z.rotation.z = Math.sin(time * 1.6 + z.userData.ph) * 0.14;
    const k = g.userData.sh;
    tube.rotation.z = k > 0 ? Math.sin(time * 30) * 0.2 * k : 0;
    g.userData.sh = Math.max(0, k - 0.025);
  };
  return g;
}
function bottle() {
  const g = group();
  const glass = mat('#bfeee0', { rough: 0.12, opacity: 0.7 });
  const b = group(0, 0.12, 0);
  b.add(cyl(0.13, 0.13, 0.34, glass, 0, 0, 0, { seg: 10, cast: false }));
  b.add(cyl(0.06, 0.11, 0.12, glass, 0, 0.34, 0, { seg: 10, cast: false }));
  b.add(cyl(0.065, 0.065, 0.07, '#b3855f', 0, 0.45, 0, { seg: 8 }));
  b.add(cbox(0.1, 0.2, 0.1, '#fff6dc', 0, 0.06, 0, { r: 0.03, ...ns }));
  b.add(cbox(0.105, 0.04, 0.105, '#e8425e', 0, 0.14, 0, { r: 0.01, ...ns }));
  b.rotation.z = 1.1;
  g.add(b);
  g.add(cyl(0.34, 0.4, 0.04, '#fbeed8', 0, 0, 0, { seg: 12, cast: false }));
  const spark = cbox(0.1, 0.1, 0.1, glow('#fff6c9', '#ffe27a', 1, 2), 0.1, 0.6, 0, { r: 0.02, ...ns });
  g.add(spark);
  g.userData.tick = (time) => { b.position.y = 0.14 + Math.sin(time * 2) * 0.03; spark.position.y = 0.62 + Math.sin(time * 3) * 0.08; spark.rotation.set(time, time * 1.3, 0); };
  return g;
}

// ————— 内容 —————
const FORTUNES = [
  ['大吉', '今天做什么都顺手，连大喵都抢不到你的可颂。'], ['大吉', '今天钓上来的鱼，会比昨天大一圈。'],
  ['中吉', '穿上喜欢的那身出门，会有人夸你。'], ['中吉', '浇过水的田不会辜负你，下午去看看。'],
  ['小吉', '路过喷泉记得许个愿，数到七会有回礼。'], ['小吉', '今天适合整理衣橱，旧衣服也能搭出新花样。'],
  ['吉', '慢一点也没关系，花是一朵一朵开的。'], ['吉', '和居民多聊两句，他们总有话想告诉你。'],
  ['末吉', '今天的幸运色是粉色——反正你每天都穿。'], ['末吉', '饿了就去咖啡屋，别空着肚子许愿。'],
];
const NOTES = [
  '「来自很远很远的海上：这里也有一座会发光的小镇。」', '「捡到这封信的人，祝你今天的鱼都很大。」', '「我把夏天装进瓶子里了，送给你一点。」',
  '「如果你也养了一只爱偷吃的猫，请替我摸摸它。」', '「听说对着喷泉许七次愿会有回礼，是真的吗？」', '「瓶子里是我种出来的第一颗种子，交给你啦。」',
];
const SHORE = [[-14, 20.4], [20, 20.4], [-28, 20.2], [30, 20.1], [-4, 20.5], [14, 20.5]];
// 八音盒的曲子：C 大调三拍子小摇篮曲，八小节。每小节 [三拍旋律, 和弦根音, 和弦的两个音]；0 = 这一拍延长上一个音
const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, C3: 130.81, F3: 174.61, G3: 196, A3: 220, E3: 164.81 };
const LULLABY = [
  [['E5', 'G5', 'C6'], 'C3', ['E4', 'G4']], [['B5', 0, 'G5'], 'E3', ['G4', 'B4']], [['A5', 'C6', 'E6'], 'A3', ['C5', 'E5']], [['D6', 0, 'B5'], 'G3', ['B4', 'D5']],
  [['C6', 'A5', 'F5'], 'F3', ['A4', 'C5']], [['E5', 'G5', 'C6'], 'C3', ['E4', 'G4']], [['D6', 'B5', 'G5'], 'G3', ['B4', 'D5']], [['C6', 0, 0], 'C3', ['G4', 'E5']],
];
const BEAT = 0.34;
// 八音盒的音色：基音很快衰减，叠一点高八度和十二度的泛音，像拨动金属梳齿。t 是音频时钟上的绝对时间
function chime(f, t, vol = 0.07, dur = 1.1) {
  audio.tone({ f, t, dur, vol, type: 'sine', attack: 0.004, echo: 0.15 });
  audio.tone({ f: f * 2, t, dur: dur * 0.45, vol: vol * 0.28, type: 'sine', attack: 0.004 });
  audio.tone({ f: f * 3, t, dur: dur * 0.2, vol: vol * 0.1, type: 'sine', attack: 0.004 });
}
function playLullaby() {
  const base = audio.now() + 0.45; // 盒盖先打开，再起音
  LULLABY.forEach(([mel, root, chord], bar) => {
    const t0 = base + bar * 3 * BEAT;
    // 开头两小节轻一点，慢慢进来
    const k = bar === 0 ? 0.6 : bar === 1 ? 0.8 : 1;
    mel.forEach((n, i) => { if (n) chime(N[n], t0 + i * BEAT, 0.07 * k, mel[i + 1] === 0 ? 1.8 : 1.1); });
    audio.tone({ f: N[root], t: t0, dur: 1.2, vol: 0.035 * k, type: 'sine', attack: 0.01 });
    chord.forEach((n, i) => chime(N[n], t0 + (i + 1) * BEAT, 0.022 * k, 0.7));
  });
  // 收尾：一串上行的琶音
  ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => chime(N[n], base + 8 * 3 * BEAT + i * 0.12, 0.035, 1.6));
  return 0.45 + 8 * 3 * BEAT + 1.4;
}

export function installFun(game) {
  const town = game.town, ui = game.ui;
  const put = (obj, x, z, ry, r) => { obj.scale.setScalar(1.25); town.place(obj, x, z, ry); town.addCircle(x, z, r * 1.2, 'live'); return obj; };
  const here = (x, z, y = 1.2) => new THREE.Vector3(x, y, z);

  // —— 扭蛋机 ——
  const C = { x: 26, z: -8 };
  const cap = put(capsuleMachine(), C.x, C.z, -0.5, 0.7);
  let rolling = false;
  town.inter.push({ id: 'capsule', x: C.x - 0.4, z: C.z + 1.1, r: 1.9, label: () => `扭蛋机 · 转一次 (${CAPSULE_PRICE})`, sub: () => `今天还能转 ${Math.max(0, CAPSULE_MAX - today().capsule)} 次`, act: () => {
    const f = today();
    if (rolling) return;
    if (f.capsule >= CAPSULE_MAX) { ui.toast('今天的扭蛋转完啦，明天再来'); audio.sfx('error'); return; }
    if (!spend(CAPSULE_PRICE)) return;
    const source = S;
    f.capsule++;
    const r = Math.random();
    let text, icon;
    if (r < 0.34) { const n = pick([15, 20, 25, 40]); addCoins(n, 'fun'); text = `扭出了 ${n} 噗灵`; icon = coinIco(); }
    else if (r < 0.72) { const c = pick(CROPS.slice(0, 4)); const n = pick([1, 2, 2, 3]); S.seeds[c.id] = (S.seeds[c.id] || 0) + n; bus.emit('seed', S.seed); text = `扭出了 ${c.name}种子 ×${n}`; icon = seedIco(c.id); }
    else if (r < 0.9) { const n = pick([60, 80, 100]); addCoins(n, 'fun'); text = `大奖！扭出了 ${n} 噗灵`; icon = coinIco(); }
    else { const id = pick(['pot', 'mushroom', 'pinwheel', 'fence', 'tulips']); S.decor[id] = (S.decor[id] || 0) + 1; bus.emit('decorChanged'); text = `稀有！扭出了摆设「${DECO[id].name}」`; icon = decorIcon(id); }
    stat('capsules');
    flushSave();
    rolling = true; cap.userData.shake = 1; town.act('work', 1.1); town.face(C.x, C.z);
    for (let i = 0; i < 6; i++) setTimeout(() => { if (S === source) audio.sfx('pop', i); }, i * 130);
    setTimeout(() => {
      rolling = false;
      if (S !== source) return;
      audio.sfx(r >= 0.72 ? 'fanfare' : 'success');
      ui.toast(text, { icon, kind: r >= 0.72 ? 'live-reward' : '' });
      fx.sparkle(town.scene, here(C.x, C.z + 0.5, 0.6), 12, ['#ffd76a', '#ff9fbd', '#ffffff', '#7fc4f5']);
      if (town.camMode === 'play' && !town.photoOn && !town.homeInteractions?.seated && !town.homeInteractions?.bedState) town.act('cheer', 0.7);
    }, 950);
  } });

  // —— 八音盒 ——
  const M = { x: -20, z: 18.8 };
  const mb = put(musicBox(), M.x, M.z, 0.4, 0.75);
  let pendingMusicResume = null;
  const resumeMusicboxTrack = () => {
    const pending = pendingMusicResume;
    if (!pending || !pending.ready) return;
    if (S !== pending.source || audio.info !== pending.track) { pendingMusicResume = null; return; }
    if (app.suspended || app.view !== town || game.pianoSession) return;
    pendingMusicResume = null;
    audio.resumeMusic();
  };
  // A timer that finishes in the background must wait for the town to resume.
  // Otherwise blocking background playback leaves the original track muted forever.
  town.ticks.push(resumeMusicboxTrack);
  town.inter.push({ id: 'musicbox', x: M.x + 0.3, z: M.z + 1.1, r: 1.9, label: '八音盒 · 摇一摇', sub: '听一支小摇篮曲', act: () => {
    if (mb.userData.play > 0) return;
    // 播放时把小镇的背景音乐先停一下，放完再接上
    const source = S, track = audio.info, resumeTrack = !audio.musicPaused;
    audio.pauseMusic();
    const len = playLullaby();
    mb.userData.play = len;
    const pending = resumeTrack ? { source, track, ready: false } : null;
    pendingMusicResume = pending;
    setTimeout(() => { if (pending && pendingMusicResume === pending) { pending.ready = true; resumeMusicboxTrack(); } }, len * 1000 + 300);
    town.act('idle', 0.4); town.face(M.x, M.z);
    const mp = town.momo.root.position;
    fx.hearts(town.scene, here(mp.x, mp.z, 1.3), 3);
    // 第一次听有一点点小心意，之后每天随便听
    const f = today();
    if (!f.used.music) { f.used.music = 1; save(); addCoins(10, 'fun'); stat('tunes'); ui.toast('大喵跟着旋律摇起了尾巴　+10', { icon: coinIco() }); }
    for (let i = 0; i < 8; i++) setTimeout(() => { if (town.zone === 'town') fx.sparkle(town.scene, here(M.x + rand(-0.4, 0.4), M.z, 1.4 + rand(0, 0.6)), 3, ['#c9b6f2', '#ffd76a', '#ffffff']); }, i * 3 * BEAT * 1000);
  } });

  // —— 弹弹蘑菇 ——
  const B = { x: 27, z: 14.2 };
  const sh = put(bounceShroom(), B.x, B.z, 0, 0.5);
  let jump = 0, jumps = 0;
  town.inter.push({ id: 'shroom', x: B.x, z: B.z + 0.9, r: 1.6, label: '弹弹蘑菇 · 跳一下', act: () => {
    if (jump > 0) return;
    jump = 1; sh.userData.sq = 1; town.lock = 0.9; town.moveTo = null; town.face(B.x, B.z);
    town.player.setPose('cheer');
    audio.tone({ f: 300, f2: 900, dur: 0.28, vol: 0.16, type: 'sine' });
    stat('bounces');
    if (++jumps % 5 === 0) { fx.confetti(town.scene, here(B.x, B.z, 2.4), 24); ui.toast(pick(['蘑菇：哎哟，轻一点！', '大喵也想跳，但它够不着', '跳得好高！看见码头的小船了吗？'])); }
  } });
  town.ticks.push((time, dt = 0.016) => {
    if (jump <= 0) return;
    jump = Math.max(0, jump - dt * 1.25);
    const k = 1 - jump;
    town.player.body.position.y = Math.sin(k * Math.PI) * 2.2;
    town.player.body.rotation.y = k * Math.PI * 2;
    if (jump === 0) { town.player.body.position.y = 0; town.player.body.rotation.y = 0; town.player.setPose('idle'); sh.userData.sq = 0.5; audio.sfx('step'); }
  });

  // —— 幸运签筒：每天一签 ——
  const F = { x: -18, z: 8.4 };
  const ft = put(fortuneTube(), F.x, F.z, 0.35, 1.0);
  town.inter.push({ id: 'fortune', x: F.x + 0.5, z: F.z + 1.1, r: 1.9, label: () => (today().used.fortune ? '幸运签筒 · 看看今天的签' : '幸运签筒 · 抽今天的签'), act: () => {
    const f = today(), source = S;
    const i = (gameDayNo() * 7 + 3) % FORTUNES.length, [lv, text] = FORTUNES[i];
    const first = !f.used.fortune;
    if (first) { f.used.fortune = 1; addCoins(20, 'fun'); stat('fortunes'); flushSave(); }
    ft.userData.sh = 1; town.act('work', 0.6); town.face(F.x, F.z);
    for (let k = 0; k < 4; k++) setTimeout(() => { if (S === source) audio.sfx('step'); }, k * 80);
    setTimeout(() => {
      if (S !== source) return;
      audio.sfx(first ? 'quest' : 'tab');
      ui.modal(h('div', { class: 'fortune' }, h('em', {}, '今日运势'), h('h2', {}, lv), h('p', {}, text), first ? h('span', { class: 'rw' }, '香火钱找零 +20 噗灵') : h('span', { class: 'rw' }, '今天的签已经抽过了，明天再来换一支')), { ribbon: '签', cls: 'live-modal' });
    }, 420);
  } });

  // —— 漂流瓶：每天在岸边换个地方出现，捡一次 ——
  const bt = bottle();
  let spot = null;
  const placeBottle = () => {
    const f = today();
    town.inter = town.inter.filter((i) => i.id !== 'bottle');
    if (f.used.bottle) { bt.visible = false; return; }
    const ok = SHORE.filter(([x, z]) => !town.blocked(x, z, 0.5));
    spot = (ok.length ? ok : SHORE)[(gameDayNo() * 5 + 1) % (ok.length || SHORE.length)];
    bt.position.set(spot[0], 0, spot[1]); bt.visible = true;
    town.inter.push({ id: 'bottle', x: spot[0], z: spot[1], r: 1.7, label: '岸边有个漂流瓶 · 捡起来', act: () => {
      const g = today();
      if (g.used.bottle) return;
      g.used.bottle = 1; save();
      town.act('work', 0.6);
      const c = pick(CROPS.slice(0, 5)), n = pick([40, 60, 80]);
      S.seeds[c.id] = (S.seeds[c.id] || 0) + 1; bus.emit('seed', S.seed);
      addCoins(n, 'fun'); stat('bottles');
      audio.sfx('success');
      fx.sparkle(town.scene, here(spot[0], spot[1], 0.8), 10, ['#bfeee0', '#ffffff', '#ffe27a']);
      ui.modal(h('div', { class: 'fortune bottle' }, h('em', {}, '瓶子里有一张纸条'), h('p', {}, pick(NOTES)), h('span', { class: 'rw' }, `还塞着 ${n} 噗灵和一包${c.name}种子`)), { ribbon: '漂流瓶', cls: 'live-modal' });
      placeBottle();
    } });
  };
  bt.scale.setScalar(1.5);
  town.scene.add(bt);
  town.ticks.push(bt.userData.tick);
  placeBottle();
  bus.on('reset', placeBottle);
  // 小镇新的一天：瓶子重新漂来
  bus.on('newDay', placeBottle);
  window.__fun = { C, M, B, F, placeBottle, spot: () => spot };
}
