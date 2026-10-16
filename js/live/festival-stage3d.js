// 四季小聚的 3D 舞台：规则和按钮仍由各节日模块负责，这里只把当前状态演成一个会动的小场景。
// 每个舞台有自己的小渲染器（放在活动窗口里），只读模型、不改模型；窗口关掉就一起释放。
import * as THREE from 'three';
import { cbox, box, cyl, sph, torus, group, mat, glow, textPlane, disposeSceneResources } from '../core/kit.js';
import { S } from '../core/state.js';
import { h } from '../core/util.js';
import { Character, outfitToLook, randomNpcLook, NONOY_LOOK } from '../models/character.js';
import { treeSakura, treePine, treeRound } from '../models/props.js';
import { RESIDENT_LAYOUT } from './people.js';
import { phrase as summerPhrase, hitWindow } from './festival-summer.js';
import { BASKET_WEIGHTS } from './festival-harvest.js';

const ns = { cast: false, receive: false };
const resident = (id) => new Character(randomNpcLook(RESIDENT_LAYOUT[id]?.look || 0));
const nikki = () => new Character(outfitToLook(S.outfit));
const ease = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const lerp = (a, b, k) => a + (b - a) * k;

// 小粒子：升起来再散掉的小方块（撒花、火花、雪）
function sparks(scene) {
  const list = [];
  return {
    burst(x, y, z, colors, n = 14, up = 2.4) {
      for (let i = 0; i < n; i++) {
        const c = colors[i % colors.length], m = cbox(0.09, 0.09, 0.09, mat(c, { emissive: c, ei: 0.6 }), x, y, z, { r: 0.02, ...ns });
        m.userData = { vx: (Math.random() - 0.5) * 2.6, vy: up * (0.5 + Math.random() * 0.8), vz: (Math.random() - 0.5) * 2.2, life: 0.9 + Math.random() * 0.5 };
        scene.add(m); list.push(m);
      }
    },
    tick(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i], u = m.userData;
        u.life -= dt; u.vy -= 4.5 * dt;
        m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
        m.rotation.x += dt * 5; m.rotation.y += dt * 4;
        m.scale.setScalar(Math.max(0.01, Math.min(1, u.life * 2)));
        if (u.life <= 0) { scene.remove(m); list.splice(i, 1); }
      }
    },
  };
}
// 会重画文字的小牌子
function label(parent, x, y, z, opt = {}) {
  let cur = '', mesh = null;
  return (text) => {
    if (text === cur) return;
    cur = text;
    if (mesh) { parent.remove(mesh); disposeSceneResources(mesh); }
    mesh = text ? textPlane(text, { color: opt.color || '#5b4252', height: opt.height || 0.26, size: 56 }) : null;
    if (mesh) { mesh.position.set(x, y, z); parent.add(mesh); }
  };
}

// ═════════ 樱花祭：花环台 ═════════
function flower(id) {
  const g = group();
  if (id === 'pink') {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(cbox(0.2, 0.2, 0.07, '#ff9fbd', Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0, { r: 0.08, rz: -a })); }
    g.add(cbox(0.14, 0.14, 0.1, '#ffe27a', 0, 0, 0.02, { r: 0.06 }));
  } else if (id === 'cream') {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; g.add(cbox(0.19, 0.19, 0.07, '#fffaf0', Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0, { r: 0.09 })); }
    g.add(cbox(0.12, 0.12, 0.1, '#ffd24f', 0, 0, 0.02, { r: 0.05 }));
  } else {
    g.add(cbox(0.36, 0.17, 0.07, '#8fd694', 0.1, 0.04, 0, { r: 0.07, rz: 0.5 }));
    g.add(cbox(0.3, 0.15, 0.07, '#72c58a', -0.1, -0.02, 0.01, { r: 0.06, rz: -0.6 }));
  }
  return g;
}
function wreath(items, total, radius = 0.9, ghost = null) {
  const g = group();
  g.add(torus(radius, 0.07, '#a67c58', 0, 0, 0));
  g.add(torus(radius, 0.05, '#8fd694', 0, 0, 0.03));
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2, x = Math.sin(a) * radius, y = Math.cos(a) * radius;
    if (items[i]) { const f = flower(items[i]); f.position.set(x, y, 0.08); f.userData.slot = i; g.add(f); }
    else if (ghost) g.add(cbox(0.16, 0.16, 0.03, mat('#ffffff', { opacity: i === items.length ? 0.9 : 0.35 }), x, y, 0.06, { r: 0.07, ...ns }));
  }
  return g;
}
function sakuraStage(scene, fxs) {
  scene.background = new THREE.Color('#ffe6ee');
  scene.add(cyl(9, 9, 0.2, '#bfe6a8', 0, -0.2, 0, { seg: 32, cast: false }));
  scene.add(cyl(2.6, 2.6, 0.03, '#ffd0de', 0.2, 0, 0.6, { seg: 28, cast: false }));
  const t1 = treeSakura(1.25); t1.position.set(-3.6, 0, -1.8); scene.add(t1);
  const t2 = treeSakura(1.0); t2.position.set(3.9, 0, -2.4); scene.add(t2);
  // 桌子和立着的花环架
  scene.add(box(2.6, 0.12, 1.2, '#fff6ea', 0, 0.86, 0, { r: 0.05 }));
  for (const [x, z] of [[-1.1, 0.4], [1.1, 0.4], [-1.1, -0.4], [1.1, -0.4]]) scene.add(box(0.12, 0.86, 0.12, '#c99d77', x, 0, z, { r: 0.03 }));
  scene.add(box(2.7, 0.03, 1.3, '#ffc2d6', 0, 0.98, 0, { r: 0.02, cast: false }));
  scene.add(box(0.12, 1.5, 0.12, '#c99d77', 0, 0.98, -0.3, { r: 0.03 }));
  for (const [id, x] of [['pink', -0.9], ['cream', -0.3], ['leaf', 0.4], ['pink', 0.95]]) { const f = flower(id); f.rotation.x = -1.2; f.position.set(x, 1.05, 0.34); scene.add(f); }
  // 左边的花架：挂样例和编好的前两圈
  const rack = group(-2.5, 0, 0.3);
  for (const sx of [-1, 1]) rack.add(box(0.1, 2.5, 0.1, '#c99d77', sx * 0.85, 0, 0, { r: 0.03 }));
  rack.add(cbox(1.9, 0.1, 0.1, '#c99d77', 0, 2.5, 0, { r: 0.03 }));
  rack.rotation.y = 0.45;
  scene.add(rack);
  const me = nikki(); me.root.position.set(-0.9, 0, -1.05); me.root.rotation.y = 0.25; scene.add(me.root);
  const host = resident('nuo'); host.root.position.set(1.9, 0, -0.6); host.root.rotation.y = -0.6; scene.add(host.root);
  const guest = new Character(NONOY_LOOK); guest.root.position.set(2.9, 0, 0.5); guest.root.rotation.y = -0.9; guest.root.visible = false; scene.add(guest.root);
  const holder = group(0, 2.25, 0.05), sampleHolder = group(0, 1.55, 0.08), doneHolder = group();
  scene.add(holder); rack.add(sampleHolder); rack.add(doneHolder);
  let key = '', count = 0, bow = null, pop = 0, doneT = 0;
  const cover = cbox(1.3, 1.3, 0.06, '#f6c9d8', 0, 1.55, 0.14, { r: 0.2 });
  const q = textPlane('？', { color: '#ffffff', height: 0.6, size: 80 }); q.position.set(0, 1.55, 0.18);
  rack.add(cover, q);
  return {
    update(s) {
      const total = s.phase === 0 ? s.pattern.length : s.phase === 1 ? s.memoryPattern.length : 8;
      const k = [s.phase, s.flowers.join(), s.ribbon, s.samples.length, s.hintOpen, s.memoryStarted, s.done].join('|');
      if (k === key) return;
      key = k;
      holder.clear();
      const w = wreath(s.flowers, total, 0.9, true);
      holder.add(w);
      if (s.ribbon) { const c = { rose: '#cf6b84', sky: '#84b8d4', sun: '#e3bd60' }[s.ribbon]; bow = group(0, -0.98, 0.12); bow.add(cbox(0.3, 0.2, 0.08, c, -0.18, 0, 0, { r: 0.06, rz: 0.3 }), cbox(0.3, 0.2, 0.08, c, 0.18, 0, 0, { r: 0.06, rz: -0.3 }), cbox(0.12, 0.14, 0.1, c, 0, 0, 0.01, { r: 0.04 }), cbox(0.09, 0.4, 0.05, c, -0.08, -0.26, 0, { r: 0.03, rz: -0.2 }), cbox(0.09, 0.4, 0.05, c, 0.08, -0.26, 0, { r: 0.03, rz: 0.2 })); holder.add(bow); }
      if (s.flowers.length > count) { pop = 1; me.setPose('work'); host.setPose('cheer'); setTimeout(() => { me.setPose('idle'); host.setPose('idle'); }, 500); fxs.burst(Math.sin((s.flowers.length - 1) / total * Math.PI * 2) * 0.9, 2.25 + Math.cos((s.flowers.length - 1) / total * Math.PI * 2) * 0.9, 0.3, ['#ff9fbd', '#fffaf0', '#ffe27a'], 6, 1.4); }
      count = s.flowers.length;
      // 花架上：这一圈的样例（记忆圈收起后盖上布），以及已经编好的前几圈
      sampleHolder.clear();
      const showSample = s.phase === 0 || (s.phase === 1 && (!s.memoryStarted || s.hintOpen));
      if (s.phase < 2) { const sw = wreath(s.phase === 0 ? s.pattern : s.memoryPattern, total, 0.5); sw.scale.setScalar(1); sampleHolder.add(sw); }
      sampleHolder.visible = showSample; cover.visible = q.visible = s.phase === 1 && !showSample;
      doneHolder.clear();
      s.samples.forEach((items, i) => { const dw = wreath(items, items.length, 0.5); dw.scale.setScalar(0.55); dw.position.set(-0.5 + i * 1.0, 2.2, 0.08); doneHolder.add(dw); });
      guest.root.visible = s.recipient === 'nonoy';
      if (s.done && !doneT) { doneT = 0.001; fxs.burst(0, 2.3, 0.3, ['#ff9fbd', '#ffe27a', '#ffffff', '#9fe0c5'], 30, 3.2); me.setPose('cheer'); host.setPose('cheer'); guest.setPose('cheer'); }
      if (!s.done) doneT = 0;
    },
    tick(t, dt, s) {
      me.update(dt); host.update(dt); if (guest.root.visible) guest.update(dt);
      pop = Math.max(0, pop - dt * 3);
      holder.scale.setScalar(1 + Math.sin(pop * Math.PI) * 0.06);
      holder.rotation.z = Math.sin(t * 0.8) * 0.03;
      if (doneT) {
        doneT += dt;
        // 送出：花环飞向收花的人（留给自己就戴到暖暖头上）
        const to = s.recipient === 'self' ? [-0.9, 1.95, -1.0, 0.42] : s.recipient === 'nonoy' ? [2.9, 1.95, 0.5, 0.42] : [1.9, 1.95, -0.6, 0.42];
        const k = ease((doneT - 0.4) / 1.2);
        holder.position.set(lerp(0, to[0], k), lerp(2.25, to[1], k) + Math.sin(k * Math.PI) * 0.6, lerp(0.05, to[2], k));
        holder.scale.setScalar(lerp(1, to[3], k)); holder.rotation.x = -k * 1.3;
      } else { holder.position.set(0, 2.25, 0.05); holder.rotation.x = 0; }
    },
  };
}

// ═════════ 夏日祭：海风太鼓 ═════════
function taiko(color, s = 1) {
  const g = group();
  for (const sx of [-1, 1]) g.add(cbox(0.1, 0.9 * s, 0.1, '#8a6a45', sx * 0.42 * s, 0.4 * s, 0, { r: 0.03, rz: sx * 0.18 }));
  g.add(cbox(1.0 * s, 0.08, 0.5 * s, '#8a6a45', 0, 0.1, 0, { r: 0.03 }));
  const body = group(0, 1.0 * s, 0); body.rotation.x = -0.5;
  body.add(cyl(0.5 * s, 0.5 * s, 0.6 * s, color, 0, -0.3 * s, 0, { seg: 18 }));
  body.add(cyl(0.54 * s, 0.54 * s, 0.07, '#fff6dc', 0, 0.3 * s, 0, { seg: 18 }));
  body.add(cyl(0.54 * s, 0.54 * s, 0.07, '#fff6dc', 0, -0.36 * s, 0, { seg: 18 }));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; body.add(cbox(0.06, 0.06, 0.06, '#ffd76a', Math.cos(a) * 0.52 * s, 0.24 * s, Math.sin(a) * 0.52 * s, { r: 0.02 })); }
  const ring = torus(0.62 * s, 0.035, glow('#fff3a8', '#ffd76a', 1, 2.4), 0, 0.36 * s, 0, { rx: Math.PI / 2, ...ns });
  body.add(ring);
  g.add(body);
  g.userData = { body, ring };
  return g;
}
function summerStage(scene, fxs, getBody) {
  scene.background = new THREE.Color('#2b3a6b');
  scene.add(cyl(9, 9, 0.2, '#f1ddb0', 0, -0.2, 0, { seg: 32, cast: false }));
  scene.add(box(30, 0.05, 8, mat('#3f6fb8', { rough: 0.2 }), 0, -0.02, -8, { cast: false }));
  for (let i = 0; i < 18; i++) scene.add(cbox(0.05, 0.05, 0.05, glow('#ffffff', '#fff6c9', 1, 2), -7 + (i * 5.3) % 14, 3.6 + (i * 1.7) % 2.6, -6, ns));
  scene.add(sph(0.7, glow('#fff6dc', '#ffe9a8', 0.9, 1.6), 3.6, 4.6, -6, ns));
  // 两根杆子之间拉一串灯笼
  const lamps = [];
  for (const sx of [-1, 1]) scene.add(box(0.1, 3.3, 0.1, '#8a6a45', sx * 3.4, 0, -1.2, { r: 0.03 }));
  for (let i = 0; i <= 8; i++) { const u = i / 8, x = -3.4 + u * 6.8, y = 3.2 - Math.sin(u * Math.PI) * 0.5; const c = ['#ff8f6a', '#ffd76a', '#7fc4f5'][i % 3]; const l = cbox(0.24, 0.3, 0.24, glow(c, c, 0.8, 2.4), x, y, -1.2, { r: 0.1, ...ns }); scene.add(l); lamps.push(l); }
  const L = taiko('#d9584a', 1.1), R = taiko('#4f8fd0', 0.92);
  L.position.set(-1.15, 0, 0.3); R.position.set(1.15, 0, 0.3); scene.add(L, R);
  // 节拍轨：光点从左走到右，金色一段是该落槌的时候
  const rail = group(0, 2.55, 0.5);
  rail.add(cbox(4.2, 0.07, 0.07, '#5a6aa0', 0, 0, 0, { r: 0.03, ...ns }));
  rail.add(cbox(4.2 * (hitWindow[1] - hitWindow[0]), 0.13, 0.1, glow('#ffe27a', '#ffd24f', 0.8, 1.8), 4.2 * ((hitWindow[0] + hitWindow[1]) / 2 - 0.5), 0, 0.01, { r: 0.05, ...ns }));
  rail.add(cbox(4.2 * 0.16, 0.17, 0.11, glow('#fff6c9', '#ffffff', 1, 2.2), 0, 0, 0.02, { r: 0.06, ...ns }));
  const dot = sph(0.16, glow('#ff9fbd', '#ff7fa8', 1.2, 2.6), -2.1, 0, 0.06, ns);
  rail.add(dot); scene.add(rail);
  // 鼓谱：一排小灯，打中的亮起来
  const scoreG = group(0, 3.25, 0.4); scene.add(scoreG);
  const me = nikki(); me.root.position.set(0, 0, -0.75); scene.add(me.root);
  const host = resident('qi'); host.root.position.set(2.9, 0, -0.3); host.root.rotation.y = -0.7; scene.add(host.root);
  let key = '', hitL = 0, hitR = 0, lastBeat = -1, swing = 0, swingSide = 1, doneFx = false;
  return {
    update(s) {
      const target = s.done ? [] : summerPhrase(s);
      const k = [s.phase, s.phraseIndex, target.join(), s.done, s.ready].join('|');
      if (k !== key) {
        key = k; scoreG.clear();
        target.forEach((pad, i) => { const hit = i < s.phraseIndex, c = pad === 'left' ? '#ff8f7a' : pad === 'right' ? '#7fb8f0' : '#ffe27a'; const m = cbox(0.26, 0.26, 0.1, hit ? glow(c, c, 1, 2.2) : mat(c, { opacity: 0.35 }), (i - (target.length - 1) / 2) * 0.42, 0, 0, { r: 0.1, ...ns }); if (i === s.phraseIndex && !s.ready) m.scale.setScalar(1.35); scoreG.add(m); });
      }
      if (s.lastBeat !== lastBeat) {
        if (lastBeat !== -1 || s.hits > 0) { const left = s.lastPad === 'left'; if (left) hitL = 1; else hitR = 1; swing = 1; swingSide = left ? -1 : 1; fxs.burst(left ? -1.15 : 1.15, 1.6, 0.6, left ? ['#ff8f7a', '#ffd76a'] : ['#7fb8f0', '#ffffff'], 8, 1.8); host.setPose('cheer'); setTimeout(() => host.setPose('idle'), 400); }
        lastBeat = s.lastBeat;
      }
      const want = s.done || s.ready || !s.playing ? null : target[s.phraseIndex];
      L.userData.ring.visible = want === 'left' || want === 'any'; R.userData.ring.visible = want === 'right' || want === 'any';
      if (s.done && !doneFx) { doneFx = true; for (let i = 0; i < 4; i++) setTimeout(() => fxs.burst(-2.5 + i * 1.7, 3.6 + (i % 2) * 0.6, -1, ['#ff9fbd', '#ffe27a', '#7fc4f5', '#ffffff'], 22, 2.6), i * 260); me.setPose('cheer'); }
      if (!s.done) doneFx = false;
    },
    tick(t, dt, s) {
      me.update(dt); host.update(dt);
      const body = getBody(), ph = s.playing && body ? Number(body.dataset.beatPhase || 0) : 0;
      dot.position.x = -2.1 + ph * 4.2; dot.visible = !!s.playing;
      dot.scale.setScalar(ph >= hitWindow[0] && ph <= hitWindow[1] ? 1.35 : 1);
      hitL = Math.max(0, hitL - dt * 5); hitR = Math.max(0, hitR - dt * 5);
      L.userData.body.scale.set(1 + hitL * 0.12, 1 - hitL * 0.18, 1 + hitL * 0.12); R.userData.body.scale.set(1 + hitR * 0.12, 1 - hitR * 0.18, 1 + hitR * 0.12);
      L.userData.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.06); R.userData.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.06);
      // 暖暖抡槌：打哪面鼓就朝哪边挥
      swing = Math.max(0, swing - dt * 4);
      me.root.rotation.y = swingSide * 0.5 * Math.sin(swing * Math.PI);
      const arm = swingSide < 0 ? me.armL : me.armR;
      if (swing > 0) arm.rotation.x = -1.9 + (1 - swing) * 1.5;
      lamps.forEach((l, i) => { l.position.y += Math.sin(t * 1.5 + i) * 0.0006; });
    },
  };
}

// ═════════ 丰收节：称篮摊 ═════════
function food(id) {
  const g = group();
  if (id === 'pumpkin') {
    g.add(cbox(0.42, 0.32, 0.42, '#f6a03c', 0, 0.16, 0, { r: 0.14 }));
    for (const x of [-0.12, 0, 0.12]) g.add(cbox(0.03, 0.31, 0.43, '#d97b1e', x, 0.16, 0, { r: 0.012 }));
    g.add(cbox(0.07, 0.1, 0.07, '#6fae5a', 0, 0.36, 0, { r: 0.02 }));
  } else if (id === 'apple') {
    g.add(cbox(0.26, 0.24, 0.26, '#e8425e', 0, 0.12, 0, { r: 0.1 }));
    g.add(cbox(0.03, 0.08, 0.03, '#7a5a46', 0, 0.27, 0, ns)); g.add(cbox(0.1, 0.03, 0.06, '#8fd694', 0.05, 0.3, 0, { r: 0.012, rz: 0.4 }));
  } else {
    for (const [x, rz] of [[-0.06, 0.2], [0, 0], [0.06, -0.2]]) { g.add(cbox(0.025, 0.4, 0.025, '#e3bd60', x, 0.2, 0, { rz })); g.add(cbox(0.07, 0.16, 0.07, '#f3d27a', x - Math.sin(rz) * 0.2, 0.42, 0, { r: 0.025, rz })); }
    g.add(cbox(0.14, 0.04, 0.06, '#c9412f', 0, 0.12, 0, { r: 0.015 }));
  }
  return g;
}
function basketModel(items, small = false) {
  const g = group();
  g.add(cyl(0.72, 0.56, 0.42, '#c99d77', 0, 0, 0, { seg: 14 }));
  g.add(cyl(0.76, 0.76, 0.07, '#a67c58', 0, 0.4, 0, { seg: 14 }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(cbox(0.05, 0.4, 0.05, '#a67c58', Math.cos(a) * 0.66, 0.2, Math.sin(a) * 0.66, { r: 0.015 })); }
  g.add(torus(0.6, 0.035, '#a67c58', 0, 0.62, 0, {}));
  items.forEach((id, i) => { const f = food(id), ring = i < 6 ? 0 : 1, k = i % 6, a = (k / 6) * Math.PI * 2 + ring * 0.5, r = ring ? 0.2 : 0.42; f.position.set(Math.cos(a) * r, 0.34 + ring * 0.26, Math.sin(a) * r); f.rotation.y = a; f.userData.i = i; g.add(f); });
  if (small) g.scale.setScalar(0.62);
  return g;
}
function harvestStage(scene, fxs) {
  scene.background = new THREE.Color('#ffe9c4');
  scene.add(cyl(9, 9, 0.2, '#e9c97a', 0, -0.2, 0, { seg: 32, cast: false }));
  const tr = treeRound(1.2, '#f0a53a', '#f6c544'); tr.position.set(-3.9, 0, -2.2); scene.add(tr);
  const tr2 = treeRound(1.0, '#e2623c', '#f0935a'); tr2.position.set(4.0, 0, -2.6); scene.add(tr2);
  for (const [x, z, sc] of [[-3.0, 0.9, 1.5], [-2.4, 1.5, 1.0], [3.4, 1.3, 1.3]]) { const p = food('pumpkin'); p.scale.setScalar(sc); p.position.set(x, 0, z); scene.add(p); }
  for (let i = 0; i < 7; i++) { const w = food('wheat'); w.scale.setScalar(1.6); w.position.set(-4.4 + i * 0.3, 0, -0.6 - (i % 2) * 0.3); scene.add(w); }
  // 台秤：底座、托盘、刻度盘和指针
  const scale = group(0, 0, 0.2);
  scale.add(box(2.0, 0.5, 1.3, '#fff6ea', 0, 0, 0, { r: 0.08 }));
  scale.add(box(2.1, 0.08, 1.4, '#e9b9a2', 0, 0.5, 0, { r: 0.03 }));
  const tray = group(0, 0.66, 0.05); tray.add(cyl(0.9, 0.9, 0.06, '#cfd6e0', 0, 0, 0, { seg: 20 })); scale.add(tray);
  const dial = group(0, 1.85, -0.5);
  dial.add(box(0.12, 1.2, 0.12, '#8a8f9c', 0, -1.25, 0, { r: 0.03 }));
  const face = cyl(0.62, 0.62, 0.1, '#ffffff', 0, 0, 0, { seg: 24 }); face.rotation.x = Math.PI / 2; dial.add(face);
  const rim = torus(0.62, 0.05, '#e9a520', 0, 0, 0.06, {}); dial.add(rim);
  const zone = cbox(0.2, 0.16, 0.03, glow('#9fe0c5', '#6fcf9f', 0.8, 1.6), 0, 0.42, 0.07, { r: 0.04, ...ns }); dial.add(zone);
  const needle = group(0, 0, 0.09); needle.add(cbox(0.05, 0.5, 0.03, '#e8425e', 0, 0.25, 0, { r: 0.015, ...ns })); needle.add(cbox(0.12, 0.12, 0.05, '#5b4252', 0, 0, 0, { r: 0.05, ...ns })); dial.add(needle);
  const lamp = cbox(0.18, 0.18, 0.1, mat('#d9cfc9'), 0.5, -0.5, 0.06, { r: 0.06, ...ns }); dial.add(lamp);
  scale.add(dial); scene.add(scale);
  const say = label(dial, 0, 0.92, 0.08, { height: 0.26 });
  const basketHolder = group(0, 0.72, 0.25); scene.add(basketHolder);
  // 后面的长桌：交出去的篮子摆上去
  scene.add(box(5.2, 0.12, 1.0, '#c99d77', 0, 0.8, -2.2, { r: 0.04 }));
  scene.add(box(5.3, 0.03, 1.1, '#fff6ea', 0, 0.92, -2.2, { r: 0.02, cast: false }));
  for (const x of [-2.4, 2.4]) scene.add(box(0.14, 0.8, 0.8, '#a67c58', x, 0, -2.2, { r: 0.04 }));
  const tableHolder = group(0, 0.96, -2.2); scene.add(tableHolder);
  const me = nikki(); me.root.position.set(-1.9, 0, 0.5); me.root.rotation.y = 0.8; scene.add(me.root);
  const hosts = { man: resident('man'), he: resident('he'), qi: resident('qi') };
  Object.values(hosts).forEach((c, i) => { c.root.position.set(2.1, 0, 0.4); c.root.rotation.y = -0.8; scene.add(c.root); });
  let key = '', n = 0, drop = 0, target = 0, shown = 0, okFx = false;
  return {
    update(s) {
      const order = s.orders[Math.min(s.phase, 2)], weight = s.basket.reduce((a, id) => a + (BASKET_WEIGHTS[id] || 0), 0);
      target = s.done ? 1 : weight / order.target;
      const k = [s.phase, s.basket.join(), s.delivered.length, s.ready, s.done].join('|');
      if (k === key) return;
      key = k;
      basketHolder.clear();
      if (!s.done) basketHolder.add(basketModel(s.basket));
      if (s.basket.length > n) { drop = 1; me.setPose('work'); setTimeout(() => me.setPose('idle'), 400); }
      n = s.basket.length;
      say(s.done ? '开席啦' : `${weight} / ${order.target}`);
      lamp.material = s.ready || s.done ? glow('#9fe0c5', '#6fcf9f', 1.2, 2.6) : mat('#d9cfc9');
      tableHolder.clear();
      s.delivered.forEach((o, i) => { const b = basketModel(o.basket, true); b.position.set(-1.6 + i * 1.6, 0, 0); tableHolder.add(b); });
      Object.entries(hosts).forEach(([id, c], i) => {
        const cur = !s.done && order.id === id;
        c.root.visible = cur || s.done || s.delivered.some((o) => o.id === id);
        if (cur) c.root.position.set(2.1, 0, 0.4); else c.root.position.set(-1.6 + i * 1.6, 0, -3.1);
        c.root.rotation.y = cur ? -0.8 : 0;
      });
      if (s.ready && !okFx) { okFx = true; fxs.burst(0, 2.0, 0.4, ['#9fe0c5', '#ffe27a', '#ffffff'], 16, 2.2); hosts[order.id]?.setPose('cheer'); setTimeout(() => hosts[order.id]?.setPose('idle'), 800); }
      if (!s.ready) okFx = false;
      if (s.done) { me.root.position.set(2.6, 0, -1.2); me.root.rotation.y = -0.4; me.setPose('cheer'); Object.values(hosts).forEach((c) => c.setPose('cheer')); fxs.burst(0, 2.2, -2, ['#f6a03c', '#e8425e', '#f3d27a', '#ffffff'], 30, 3); }
    },
    tick(t, dt) {
      me.update(dt); Object.values(hosts).forEach((c) => c.root.visible && c.update(dt));
      drop = Math.max(0, drop - dt * 4);
      basketHolder.position.y = 0.72 - Math.sin(drop * Math.PI) * 0.06; tray.position.y = 0.66 - Math.sin(drop * Math.PI) * 0.06;
      // 指针：正上方是目标重量，轻了偏左、重了偏右
      shown += (target - shown) * Math.min(1, dt * 6);
      needle.rotation.z = Math.max(-2.2, Math.min(2.2, (1 - shown) * 1.9)) + Math.sin(t * 9) * 0.02 * drop;
    },
  };
}

// ═════════ 初雪祭：雪人工坊 ═════════
const BALL_IDS = ['large', 'medium', 'small'], BALL_TARGET = { large: 100, medium: 72, small: 44 }, SLOT_OF = { large: 'bottom', medium: 'middle', small: 'head' };
const SNOW_NAMES = { nuantuan: '暖团', xiaodong: '小冬', xuemian: '雪绵', qingqing: '晴晴' };
const rad = (size) => 0.12 + size * 0.0052;
function snowStage(scene, fxs) {
  scene.background = new THREE.Color('#dbeeff');
  scene.add(cyl(9, 9, 0.2, '#ffffff', 0, -0.2, 0, { seg: 32, cast: false }));
  for (const [x, z, sc] of [[-4.0, -2.2, 1.3], [4.1, -2.6, 1.1], [-2.6, -3.2, 0.9]]) { const p = treePine(sc); p.position.set(x, 0, z); scene.add(p); scene.add(cbox(1.1 * sc, 0.2, 1.1 * sc, '#ffffff', x, 2.4 * sc, z, { r: 0.08 })); }
  for (const [x, z, s2] of [[-3.2, 1.2, 0.5], [3.6, 1.0, 0.7], [2.7, -1.8, 0.4]]) scene.add(sph(s2, '#f3f8ff', x, s2 * 0.3, z, { cast: false }));
  const flakes = [];
  for (let i = 0; i < 46; i++) { const f = cbox(0.06, 0.06, 0.06, '#ffffff', (Math.random() - 0.5) * 10, Math.random() * 5.5, (Math.random() - 0.5) * 6 - 0.5, { r: 0.02, ...ns }); f.userData.v = 0.5 + Math.random() * 0.7; scene.add(f); flakes.push(f); }
  const snowMat = mat('#ffffff', { rough: 0.9 });
  const balls = Object.fromEntries(BALL_IDS.map((id) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), snowMat); b.castShadow = true; scene.add(b); return [id, b]; }));
  const ghost = torus(1, 0.03, glow('#9fe0c5', '#6fcf9f', 0.8, 1.6), 0, 0.03, 0.4, { rx: Math.PI / 2, ...ns }); scene.add(ghost);
  const line = cbox(0.03, 3.2, 0.03, mat('#7fc4f5', { opacity: 0.6 }), 0, 1.6, 0.2, ns); scene.add(line);
  const deco = group(0, 0, 0.2); scene.add(deco);
  const me = nikki(); me.root.position.set(-1.7, 0, 0.5); me.root.rotation.y = 0.9; scene.add(me.root);
  const host = new Character(NONOY_LOOK); host.root.position.set(2.2, 0, 0.3); host.root.rotation.y = -0.8; scene.add(host.root);
  const flag = Object.fromEntries(BALL_IDS.map((id) => { const f = cbox(0.2, 0.2, 0.06, glow('#9fe0c5', '#6fcf9f', 1, 2), 0, 0, 0, { r: 0.06, ...ns }); scene.add(f); return [id, f]; }));
  const pos = Object.fromEntries(BALL_IDS.map((id) => [id, new THREE.Vector3()])), cur = Object.fromEntries(BALL_IDS.map((id) => [id, { x: 0, y: 0, z: 0, r: 0.2 }]));
  let key = '', roll = 0, lastSize = '', decoKey = '', doneFx = false;
  return {
    update(s) {
      const sizes = BALL_IDS.map((id) => s.balls[id].size).join();
      if (sizes !== lastSize) { roll = 1; lastSize = sizes; me.setPose('work'); setTimeout(() => me.setPose('idle'), 350); }
      // 每团雪该在哪：滚雪时当前这团在中间，其余排在一边；搭建时按层叠起来，拿起的那团悬在上面
      const R = Object.fromEntries(BALL_IDS.map((id) => [id, rad(s.balls[id].size)]));
      let top = 0;
      const stackY = {};
      for (const id of BALL_IDS) if (s.stack[SLOT_OF[id]] === id || s.phase === 2 || s.done) { stackY[id] = top + R[id] * 0.9; top += R[id] * 1.72; }
      BALL_IDS.forEach((id, i) => {
        const p = pos[id];
        if (s.phase === 0) { if (s.rolling === id) p.set(0, R[id], 0.4); else p.set(-3.0 + i * 0.95, R[id], -1.2); }
        else if (stackY[id] !== undefined) p.set(0, stackY[id], 0.2);
        else if (s.selected === id) p.set(s.offset * 0.3, top + R[id] + 0.5, 0.2);
        else p.set(-3.0 + i * 0.95, R[id], -0.9);
        cur[id].r = R[id];
        flag[id].visible = s.phase === 0 && s.balls[id].ready;
      });
      const b = s.phase === 0 ? s.rolling : null;
      ghost.visible = !!b; if (b) { const tr = rad(BALL_TARGET[b]); ghost.scale.set(tr, tr, tr); ghost.material = Math.abs(s.balls[b].size - BALL_TARGET[b]) <= 4 ? glow('#9fe0c5', '#6fcf9f', 1.2, 2.4) : glow('#ffd76a', '#ffc23d', 0.6, 1.4); }
      line.visible = s.phase === 1;
      // 装扮：围巾、帽子、表情、名字牌
      const dk = [s.phase, s.done, s.scarf, s.hat, s.face, s.name, sizes].join('|');
      if (dk !== decoKey) {
        decoKey = dk; disposeSceneResources(deco); deco.clear();
        if (s.phase === 2 || s.done) {
          const yM = stackY.medium, yH = stackY.small, rM = R.medium, rH = R.small;
          for (let i = 0; i < 3; i++) deco.add(cbox(0.08, 0.08, 0.06, '#5b4252', 0, yM - rM * 0.4 + i * rM * 0.4, rM * 0.94, { r: 0.03 }));
          for (const sx of [-1, 1]) deco.add(cbox(0.7, 0.05, 0.05, '#8a6a45', sx * (rM + 0.3), yM + 0.1, 0, { r: 0.02, rz: sx * 0.5 }));
          deco.add(cbox(0.1, 0.1, 0.34, '#f0935a', 0, yH, rH + 0.12, { r: 0.04 }));
          if (s.scarf) { const c = s.scarf === 'rose' ? '#e2527c' : '#5fa8ee'; deco.add(cyl(rH * 0.86, rM * 0.72, 0.16, c, 0, yH - rH * 0.98, 0, { seg: 14 })); deco.add(cbox(0.16, 0.5, 0.08, c, rH * 0.5, yH - rH - 0.3, rM * 0.62, { r: 0.03, rz: -0.15 })); }
          if (s.hat === 'knit') { deco.add(cyl(rH * 0.7, rH * 0.92, rH * 0.7, '#e8425e', 0, yH + rH * 0.55, 0, { seg: 14 })); deco.add(cyl(rH * 0.96, rH * 0.96, 0.1, '#ffffff', 0, yH + rH * 0.5, 0, { seg: 14 })); deco.add(sph(0.12, '#ffffff', 0, yH + rH * 1.34, 0, {})); }
          if (s.hat === 'bucket') { deco.add(cyl(rH * 0.62, rH * 0.8, rH * 0.8, '#7fc4f5', 0, yH + rH * 0.6, 0, { seg: 14 })); deco.add(torus(rH * 0.6, 0.02, '#cfd6e0', 0, yH + rH * 1.4, 0, {})); }
          const ey = yH + rH * 0.22, ez = rH * 0.9;
          if (s.face === 'wink') { deco.add(cbox(0.08, 0.1, 0.05, '#3d3550', -rH * 0.36, ey, ez, { r: 0.03 })); deco.add(cbox(0.13, 0.03, 0.05, '#3d3550', rH * 0.36, ey, ez, { r: 0.012, rz: 0.2 })); }
          else if (s.face === 'sleepy') for (const sx of [-1, 1]) deco.add(cbox(0.13, 0.03, 0.05, '#3d3550', sx * rH * 0.36, ey, ez, { r: 0.012 }));
          else for (const sx of [-1, 1]) deco.add(cbox(0.08, 0.1, 0.05, '#3d3550', sx * rH * 0.36, ey, ez, { r: 0.03 }));
          if (s.face) for (let i = -2; i <= 2; i++) deco.add(cbox(0.045, 0.045, 0.04, '#3d3550', i * rH * 0.16, yH - rH * 0.3 - (s.face === 'sleepy' ? 0 : (2 - Math.abs(i)) * 0.03), rH * 0.88, { r: 0.015 }));
          if (s.name) { const board = group(1.15, 0, 0.7); board.add(box(0.07, 0.7, 0.07, '#8a6a45', 0, 0, 0, { r: 0.02 })); board.add(cbox(0.9, 0.4, 0.06, '#fff6ea', 0, 0.8, 0, { r: 0.06 })); const tx = textPlane(SNOW_NAMES[s.name] || '', { color: '#5b4252', height: 0.24, size: 56 }); tx.position.set(0, 0.8, 0.05); board.add(tx); board.rotation.y = -0.3; deco.add(board); }
        }
      }
      if (s.done && !doneFx) { doneFx = true; me.root.position.set(-1.25, 0, 0.5); me.root.rotation.y = 0.35; host.root.position.set(1.9, 0, 0.5); host.root.rotation.y = -0.4; me.setPose('cheer'); host.setPose('cheer'); fxs.burst(0, 2.6, 0.6, ['#ffffff', '#cfeeff', '#ffe27a', '#ff9fbd'], 30, 3); }
      if (!s.done && doneFx) { doneFx = false; me.root.position.set(-1.7, 0, 0.5); me.root.rotation.y = 0.9; host.root.position.set(2.2, 0, 0.3); host.root.rotation.y = -0.8; }
    },
    tick(t, dt, s) {
      me.update(dt); host.update(dt);
      roll = Math.max(0, roll - dt * 2.5);
      BALL_IDS.forEach((id, i) => {
        const b = balls[id], c = cur[id], p = pos[id], k = Math.min(1, dt * 8);
        c.x += (p.x - c.x) * k; c.y += (p.y - c.y) * k; c.z += (p.z - c.z) * k;
        const r = c.r; b.scale.x += (r - b.scale.x) * k; b.scale.y = b.scale.z = b.scale.x;
        b.position.set(c.x, c.y, c.z);
        if (s.phase === 0 && s.rolling === id) { b.rotation.z -= roll * dt * 6; b.position.x += Math.sin(roll * Math.PI) * 0.25; }
        flag[id].position.set(c.x, c.y + r + 0.3 + Math.sin(t * 3 + i) * 0.05, c.z); flag[id].rotation.y = t * 2;
      });
      ghost.position.y = 0.03;
      for (const f of flakes) { f.position.y -= f.userData.v * dt; f.position.x += Math.sin(t + f.position.z) * dt * 0.2; if (f.position.y < 0) { f.position.y = 5.5; f.position.x = (Math.random() - 0.5) * 10; } }
    },
  };
}

const BUILD = { sakura: sakuraStage, summer: summerStage, harvest: harvestStage, snow: snowStage };

export function createFestivalStage(kind, getBody = () => null) {
  if (!BUILD[kind]) return null;
  let renderer;
  const canvas = document.createElement('canvas');
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, kind === 'summer' ? 0x9fa8d8 : 0xffe2d6, kind === 'summer' ? 0.85 : 1.15));
  const sun = new THREE.DirectionalLight(kind === 'summer' ? 0xcfd9ff : 0xfff3e2, kind === 'summer' ? 1.5 : 2.3);
  sun.position.set(-4, 8, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.5, 60);
  const fxs = sparks(scene);
  const stage = BUILD[kind](scene, fxs, getBody);
  const el = h('div', { class: 'fa-3d', 'data-stage': kind }, canvas);
  let model = null, raf = 0, last = performance.now(), time = 0, dead = false, w0 = 0, h0 = 0;
  const frame = () => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (!el.isConnected || document.hidden) { last = performance.now(); return; }
    const w = el.clientWidth, hh = el.clientHeight;
    if (!w || !hh) return;
    if (w !== w0 || hh !== h0) {
      w0 = w; h0 = hh;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh;
      // 画面越窄，镜头退得越远，保证整张桌子和两边的人都在画面里
      const back = Math.pow(Math.max(1, 1.45 / camera.aspect), 0.75);
      camera.position.set(0, 2.9 + back * 0.5, 6.9 * back);
      // 操作条叠在画面下半部分：镜头往下看一点，把场景抬到上半部分
      // 手机横屏时按钮栏在右侧：把画面中心移到左边那一块
      const side = el.classList.contains('lifted') && hh <= 500 && w > hh;
      if (side) { camera.setViewOffset(w, hh, w * 0.22, 0, w, hh); camera.position.set(0, 3.3, 7.8); camera.lookAt(0, 1.75, 0); }
      else { camera.clearViewOffset(); camera.lookAt(0, el.classList.contains('lifted') ? 0.55 - (back - 1) * 0.5 : 1.35, 0); }
      camera.updateProjectionMatrix();
    }
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;
    if (model) stage.tick(time, dt, model);
    fxs.tick(dt);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);
  return {
    el,
    update(m) { model = m; try { stage.update(m); } catch (e) { console.warn('festival stage', e); } },
    // 叠在画面上的界面（标题、提示、按钮）；不传就清空
    overlay(...nodes) { for (const c of [...el.children]) if (c !== canvas) c.remove(); el.append(...nodes.filter(Boolean)); const lift = nodes.length > 0; if (lift !== el.classList.contains('lifted')) { el.classList.toggle('lifted', lift); w0 = 0; } },
    dispose() { dead = true; cancelAnimationFrame(raf); try { disposeSceneResources(scene); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* 已释放 */ } el.remove(); },
  };
}
