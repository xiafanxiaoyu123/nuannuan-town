// 悠然钓场：钓鱼（收线条玩法参考《星露谷物语》，咬钩反应参考《动物森友会》）。
// 等浮漂冒出「!」→ 立刻按住 → 按住/松开控制绿色收线条，让鱼一直待在条里蓄满进度。
import { THREE, cbox, box, cyl, glow, group, mat } from '../core/kit.js';
import { Character, Momo, outfitToLook } from '../models/character.js';
import { FISH, fishModel } from '../models/items.js';
import { festivalAt } from '../live/effects.js';
import { cloud, boat, treeRound, treePine } from '../models/props.js';
import { MiniGame } from './common.js';
import { S, stat, bus } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, clamp, tween, ease } from '../core/util.js';
import { fishIco } from '../core/icons.js';

const WATER_Y = -0.5;
const AI_LABEL = { dart: '⚡猛窜', sink: '🌊深潜', float: '🫧上浮', mixed: '🌀多变', smooth: '🍃平稳' };

export class FishGame extends MiniGame {
  constructor(game) {
    super(game, 'fish', { duration: 70, stars: [52, 105, 165], post: { tilt: 2, bloom: 0.25 } });
    this.refAspect = 1.5;
    this.phase = 'idle';
    this.pt = 0;
    this.caught = 0;
    this.quickHooks = 0;
    this.bestFish = null;
    this.hold = false;
    this.barH = (0.375 + this.lv * 0.02) * (1 + this.fx('water')); // 难度下调约 1/4
    this.build();
    this.mount();
  }

  build() {
    const sc = this.scene;
    sc.background = new THREE.Color('#bfe6ff');
    sc.fog = new THREE.Fog('#d9f1ff', 26, 70);
    sc.add(new THREE.HemisphereLight(0xffffff, 0xbfe6ff, 1.25));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.set(-6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(app.shadowSize, app.shadowSize);
    const c = sun.shadow.camera;
    c.left = -10; c.right = 10; c.top = 10; c.bottom = -10; c.near = 1; c.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sc.add(sun);
    this.camera.position.set(1.6, 4.6, 12.5);
    this.camera.lookAt(1.6, 1.0, 0);
    // 水面
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), mat('#7fd3ee', { rough: 0.25 }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    sc.add(this.water);
    this.ripples = [];
    for (let i = 0; i < 14; i++) {
      // 随机长度只改变实例缩放，避免每次入场向全局几何缓存添加新尺寸。
      const r = cbox(1, 0.02, 0.12, mat('#ffffff', { opacity: 0.55 }), rand(-14, 16), WATER_Y + 0.02, rand(-16, 5), { r: 0.009, cast: false, receive: false });
      r.scale.x = rand(1.2, 3);
      r.userData = { x: r.position.x, sp: rand(0.2, 0.6), ph: rand(6) };
      sc.add(r);
      this.ripples.push(r);
    }
    // 水下 3D 游鱼剪影与黄金鱼窝光圈
    this.waterFishes = [];
    const shadowMat = mat('#2a6d8c', { opacity: 0.38, rough: 0.8 });
    for (let i = 0; i < 5; i++) {
      const fg = group(4.4 + (i - 2) * 1.1, WATER_Y - 0.04, 0.5 + (i % 2 ? 0.5 : -0.4));
      fg.add(
        cbox(0.42, 0.03, 0.18, shadowMat, 0, 0, 0, { r: 0.01, cast: false, receive: false }),
        cbox(0.16, 0.02, 0.22, shadowMat, -0.26, 0, 0, { r: 0.008, cast: false, receive: false }),
      );
      fg.scale.setScalar(0.85 + (i % 3) * 0.22);
      fg.userData = { cx: 4.5 + (i - 2) * 0.8, cz: 0.5 + (i - 2) * 0.25, rad: 0.7 + (i % 3) * 0.35, sp: 0.8 + i * 0.22, ph: i * 1.3 };
      sc.add(fg);
      this.waterFishes.push(fg);
    }
    this.hotspot = cyl(0.58, 0.58, 0.018, glow('#ffe27a', '#ffc857', 0.38, 1.4), 4.6, WATER_Y + 0.012, 0.6, { seg: 20, cast: false, receive: false });
    sc.add(this.hotspot);
    // 栈桥
    for (let i = 0; i < 9; i++) sc.add(box(0.8, 0.16, 2.4, i % 2 ? '#d9b08a' : '#cfa37c', -6.6 + i * 0.84, 0.05, 0, { r: 0.04 }));
    for (const x of [-6.4, -3.2, -0.1]) for (const z of [-1.05, 1.05]) {
      sc.add(box(0.26, 1.6, 0.26, '#b3855f', x, -0.9, z, { r: 0.07 }));
      sc.add(cbox(0.34, 0.1, 0.34, '#a97c5f', x, 0.78, z, { r: 0.03 }));
    }
    // 桥上小物：鱼篓、提灯
    const bucket = group(-1.9, 0.21, -0.7);
    bucket.add(cyl(0.3, 0.24, 0.4, '#8fd0f5', 0, 0, 0, { seg: 14 }));
    bucket.add(cyl(0.26, 0.26, 0.04, mat('#cfeeff', { rough: 0.2 }), 0, 0.36, 0, { seg: 14 }));
    sc.add(bucket);
    this.bucket = bucket;
    // 远景小岛
    const isle = group(11, WATER_Y, -14);
    isle.add(cbox(9, 1.2, 5, '#a5df8c', 0, 0.3, 0, { r: 0.5 }));
    isle.add(cbox(10, 0.5, 6, '#fff0d4', 0, 0, 0, { r: 0.25 }));
    const t1 = treeRound(1.3); t1.position.set(-2, 0.8, 0); isle.add(t1);
    const t2 = treePine(1.4); t2.position.set(1.6, 0.8, -0.6); isle.add(t2);
    const t3 = treeRound(0.9, '#ffc2d6', '#ffd6e3'); t3.position.set(3.2, 0.8, 0.8); isle.add(t3);
    sc.add(isle);
    this.boat = boat();
    this.boat.position.set(-9, WATER_Y, -9);
    this.boat.rotation.y = 0.4;
    sc.add(this.boat);
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const cl = cloud(rand(1, 1.8));
      cl.position.set(rand(-22, 22), rand(8, 13), rand(-30, -16));
      sc.add(cl);
      this.clouds.push(cl);
    }
    // 暖暖与钓竿
    this.nikki = new Character(outfitToLook(S.outfit));
    this.nikki.root.position.set(0.1, 0.21, 0.1);
    this.nikki.root.rotation.y = Math.PI / 2 - 0.5;
    this.nikki.root.scale.setScalar(1.35);
    sc.add(this.nikki.root);
    this.nikki.setPose('fish');
    this.rod = group(0, 0.62, 0.42);
    this.rod.add(cbox(0.05, 0.05, 2.6, '#8a6a55', 0, 0.42, 1.1, { r: 0.02, rx: -0.42 }));
    this.rod.add(cbox(0.1, 0.1, 0.16, '#ff8fb1', 0, 0.02, 0.1, { r: 0.03, rx: -0.42 }));
    this.tip = group(0, 0.95, 2.28);
    this.rod.add(this.tip);
    this.nikki.body.add(this.rod);
    this.line = cbox(0.016, 0.016, 1, mat('#ffffff'), 0, 0, 0, { cast: false, receive: false });
    sc.add(this.line);
    this.bobber = group(4.6, WATER_Y, 0.6);
    this.bobber.add(cbox(0.2, 0.14, 0.2, '#e8425e', 0, 0.1, 0, { r: 0.07 }));
    this.bobber.add(cbox(0.2, 0.12, 0.2, '#ffffff', 0, -0.02, 0, { r: 0.06 }));
    this.bobber.add(cbox(0.03, 0.16, 0.03, '#ffffff', 0, 0.24, 0));
    sc.add(this.bobber);
    this.momo = new Momo();
    this.momo.root.position.set(-1.1, 0.21, 0.55);
    this.momo.root.rotation.y = Math.PI / 2 - 0.2;
    this.momo.root.scale.setScalar(1.2);
    sc.add(this.momo.root);
    this.fishMesh = null;
  }

  mount() {
    this.catchEl = h('div', { class: 'catch' });
    this.fishEl = h('img', { class: 'fishi', alt: '' });
    this.progEl = h('i');
    this.traitEl = h('span', { class: 'fish-trait hide' });
    this.barEl = h('div', { class: 'fishbar card off' }, this.traitEl, h('div', { class: 'track' }, this.catchEl, (this.treEl = h('div', { class: 'treas hide' })), this.fishEl), h('div', { class: 'prog' }, this.progEl));
    this.tipEl = h('div', { class: 'fishtip card' }, '准备甩竿…');
    this.biteEl = h('div', { class: 'bite hide' }, '!');
    this.popEl = h('div', {});
    this.mountHUD([this.barEl, this.tipEl, this.biteEl, this.popEl]);
    const down = (e) => { if (e && e.target && e.target.closest && e.target.closest('button')) return; this.hold = true; this.press(); };
    const up = () => (this.hold = false);
    this.on(window, 'pointerdown', down);
    this.on(window, 'pointerup', up);
    this.on(window, 'keydown', (e) => { if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) down(); } });
    this.on(window, 'keyup', (e) => { if (e.code === 'Space' || e.code === 'KeyE') up(); });
    this.on(window, 'blur', up);
  }
  tipText(t, bite) {
    this.tipEl.textContent = t;
    this.tipEl.classList.toggle('bite', !!bite);
  }
  onStart() {
    this.cast();
  }
  onPause() { this.hold = false; }
  setPhase(p) {
    this.phase = p;
    this.pt = 0;
  }
  cast() {
    this.setPhase('cast');
    this.nikki.setPose('cheer');
    this.tipText('甩竿！');
    audio.sfx('whoosh');
    const from = new THREE.Vector3(1.6, 1.6, 0.3), to = new THREE.Vector3(rand(4.2, 5.6), WATER_Y, rand(0.2, 1));
    if (this.hotspot) this.hotspot.position.set(to.x, WATER_Y + 0.025, to.z);
    this.tween({ dur: 0.55, ease: ease.linear, update: (k) => { this.bobber.position.lerpVectors(from, to, k); this.bobber.position.y += Math.sin(k * Math.PI) * 2.2; }, done: () => {
      if (this.dead || this.state !== 'play') return;
      audio.sfx('water');
      fx.burst(this.scene, to.clone().setY(WATER_Y + 0.1), { n: 8, colors: ['#ffffff', '#cfeeff'], speed: 1.4, up: 2.2, life: 0.5, size: 0.5 });
      this.bobY = WATER_Y;
      this.setPhase('wait');
      this.waitT = rand(0.9, 2.4);
      this.nikki.setPose('fish');
      this.tipText('等待鱼儿游进黄金鱼窝…');
    } });
  }
  pickFish() {
    // 节日限定鱼只在对应节日期间出现
    const fest = festivalAt()?.id;
    const all = FISH.filter((f) => !f.fest || f.fest === fest);
    let fishes = this.modifier?.id === 'calm' ? all.filter((f) => f.price <= 20) : all;
    if (this.lure > 0) { fishes = all.filter((f) => f.price >= 44); this.lure--; }
    const pool = fishes.map((f) => ({ f, w: f.w * (1 + (f.price > 30 ? this.lv * 0.22 : 0)) }));
    let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    for (const p of pool) { r -= p.w; if (r <= 0) return p.f; }
    return FISH[0];
  }
  press() {
    if (!this.playing) return;
    if (this.phase === 'bite') {
      // 咬钩 → 进入收线；0.38 秒内反应触发「闪电刺鱼」
      const quickHook = this.pt > 0 && this.pt <= 0.38;
      const f = this.pickFish(), rule = this.modifier?.id;
      const isKing = (this.perfects || 0) >= 2 && Math.random() < 0.28;
      this.fish = { ...f, king: isKing, diff: f.diff * (rule === 'storm' ? 1.3 : rule === 'calm' ? 0.7 : 1) };
      this.fishEl.src = fishIco(this.fish.id);
      this.bar = 0.2; this.barV = 0;
      this.fp = 0.5; this.ft = 0.5; this.ftT = 0;
      this.prog = quickHook ? 0.52 : 0.4;
      if (quickHook) {
        this.quickHooks++;
        fx.sparkle(this.scene, this.bobber.position.clone().setY(WATER_Y + 0.35), 8, ['#ffe27a', '#ffffff', '#7fd3ee']);
      }
      this.left = false;
      this.treBonus = 0;
      this.tre = (this.modifier?.id === 'treasure' || Math.random() < 0.45) ? { at: rand(1.0, 2.8), pos: rand(0.12, 0.88), got: 0, on: false, t: 0 } : null;
      this.treEl.classList.add('hide');
      if (this.traitEl) {
        this.traitEl.textContent = (isKing ? '👑鱼王·' : '') + (AI_LABEL[this.fish.ai] || '🍃平稳');
        this.traitEl.classList.remove('hide');
        this.traitEl.classList.toggle('king', isKing);
      }
      this.setPhase('reel');
      this.barEl.classList.remove('off');
      this.biteEl.classList.add('hide');
      this.nikki.setPose('reel');
      this.tipText(quickHook ? '⚡ 闪电刺鱼！初始进度 +12% —— 稳住绿条！' : '按住上升，松开下落 —— 把鱼留在绿条里！');
      audio.sfx(quickHook ? 'perfect' : 'good');
    } else if (this.phase === 'wait' && this.pt > 0.35) {
      // 太早收竿
      this.tipText('太早啦，鱼还没咬钩');
      audio.sfx('error');
      this.setPhase('rest');
      this.restT = 0.7;
    }
  }
  endReel(win) {
    if (!this.playing || this.phase !== 'reel') return;
    this.barEl.classList.add('off');
    this.treEl.classList.add('hide');
    this.traitEl?.classList.add('hide');
    if (!win) this.loseLife();
    if (win) {
      const f = this.fish;
      this.caught++;
      stat('fish_caught');
      bus.emit('found', 'fish', f.id);
      if (!this.bestFish || f.price > this.bestFish.price) this.bestFish = f;
      const perfect = !this.left;
      if (perfect) this.perfects = (this.perfects || 0) + 1;
      const base = Math.round(f.price * (perfect ? 1.3 : 1) * (f.king ? 1.35 : 1)) + this.treBonus + Math.min(this.combo, 6) * 2;
      const earn = Math.round(base * (this.modifier?.id === 'storm' ? 1.5 : this.modifier?.id === 'golden_tide' ? 1.35 : 1));
      this.addScore(earn);
      this.setCombo(this.combo + 1);
      audio.sfx(f.price >= 44 || f.king ? 'fanfare' : 'success');
      this.nikki.setPose('cheer');
      const titlePrefix = (f.king ? '👑巨型鱼王 · ' : '') + (perfect ? '完美收线！' : '');
      this.tipText(`${titlePrefix}钓到了 ${f.name}！`);
      const p = this.bobber.position.clone();
      fx.burst(this.scene, p.clone().setY(WATER_Y + 0.1), { n: 10, colors: ['#ffffff', '#cfeeff', '#9be0f0'], speed: 1.7, up: 2.8, life: 0.7, size: 0.5 });
      if (this.fishMesh) { this.scene.remove(this.fishMesh); this.fishMesh = null; }
      const m = fishModel(f.id);
      m.scale.setScalar(f.king ? 1.65 : 1.25);
      this.scene.add(m);
      this.fishMesh = m;
      const to = new THREE.Vector3(-1.9, 0.9, -0.7);
      this.tween({ dur: 1.05, ease: ease.linear, update: (k) => { m.position.lerpVectors(p, to, k); m.position.y += Math.sin(k * Math.PI) * 1.8; m.rotation.z = k * 4.5; }, done: () => { if (this.fishMesh === m) this.fishMesh = null; this.scene.remove(m); fx.sparkle(this.scene, to, 6); } });
      this.popEl.replaceChildren(h('div', { class: 'caught card' }, h('img', { src: fishIco(f.id) }), h('b', {}, (f.king ? '👑鱼王 · ' : '') + (perfect ? '完美 · ' : '') + f.name), h('span', { class: 'price num' }, `+${earn}` + (this.treBonus ? '（含宝箱）' : ''))));
      setTimeout(() => this.popEl.replaceChildren(), 1300);
      this.setPhase('rest');
      this.restT = 1.35;
    } else {
      this.setCombo(0);
      audio.sfx('fail');
      this.nikki.setPose('sad');
      this.tipText('鱼跑掉了…');
      this.setPhase('rest');
      this.restT = 0.9;
    }
  }
  canMomoSkill() { return this.phase === 'reel' && !!this.fish && this.prog < 1; }
  onMomoSkill() {
    if (!this.playing || !this.canMomoSkill()) return false;
    this.bar = clamp(this.fp - this.barH / 2, 0, 1 - this.barH);
    this.barV = 0;
    this.prog = Math.min(1, this.prog + 0.35);
    this.catchEl.style.bottom = this.bar * 100 + '%';
    this.progEl.style.height = this.prog * 100 + '%';
    this.tipText('🐾 大喵帮忙收线！进度 +35%');
    if (this.prog >= 1) this.endReel(true);
    return true;
  }
  onFinish() {
    if (this.fishMesh) { this.scene.remove(this.fishMesh); this.fishMesh = null; }
    this.barEl.classList.add('off');
    this.biteEl.classList.add('hide');
    this.nikki.setPose('cheer');
    this.tipEl.style.opacity = 0;
  }
  onExit() {
    if (this.fishMesh) { this.scene.remove(this.fishMesh); this.fishMesh = null; }
    super.onExit();
  }
  resultLines() {
    return [['渔获收入', this.score], ['钓到的鱼', `${this.caught} 条`], ['完美 / 刺鱼', `${this.perfects || 0} / ${this.quickHooks} 次`], ['最好的一条', this.bestFish ? this.bestFish.name : '—']];
  }

  tick(dt, time) {
    this.pt += dt;
    this.nikki.update(dt);
    this.momo.update(dt);
    for (const r of this.ripples) { r.position.x = r.userData.x + Math.sin(time * r.userData.sp + r.userData.ph) * 1.2; r.material.opacity = 0.35 + Math.sin(time * 1.3 + r.userData.ph) * 0.2; }
    for (const c of this.clouds) { c.position.x += dt * 0.4; if (c.position.x > 26) c.position.x = -26; }
    this.boat.position.y = WATER_Y + Math.sin(time * 1.1) * 0.06;
    this.boat.rotation.z = Math.sin(time * 0.8) * 0.05;
    if (this.hotspot) {
      const s = 1 + Math.sin(time * 2.6) * 0.08;
      this.hotspot.scale.set(s, 1, s);
    }
    if (this.waterFishes) {
      const bp = this.bobber.position;
      this.waterFishes.forEach((fg, idx) => {
        const u = fg.userData;
        if (idx === 0 && (this.phase === 'bite' || this.phase === 'reel')) {
          fg.position.x += (bp.x - fg.position.x) * Math.min(1, dt * 6);
          fg.position.z += (bp.z - fg.position.z) * Math.min(1, dt * 6);
          fg.rotation.y = Math.sin(time * 14) * 0.4;
        } else {
          const ang = time * u.sp + u.ph;
          const nx = u.cx + Math.cos(ang) * u.rad;
          const nz = u.cz + Math.sin(ang * 0.8) * (u.rad * 0.65);
          fg.rotation.y = Math.atan2(-(nz - fg.position.z), nx - fg.position.x);
          fg.position.x = nx;
          fg.position.z = nz;
        }
      });
    }

    if (this.state === 'play') {
      const b = this.bobber.position;
      if (this.phase === 'wait') {
        b.y = WATER_Y + Math.sin(time * 3) * 0.04;
        if (this.pt > this.waitT) {
          this.setPhase('bite');
          audio.sfx('perfect');
          this.biteEl.classList.remove('hide');
          this.tipText('上钩了！快按住！', true);
          fx.burst(this.scene, b.clone().setY(WATER_Y + 0.1), { n: 6, colors: ['#ffffff'], speed: 1, up: 1.8, life: 0.4, size: 0.5 });
        }
      } else if (this.phase === 'bite') {
        b.y = WATER_Y - 0.16 + Math.sin(time * 18) * 0.018;
        const sp = app.project(new THREE.Vector3(b.x, 1.1, b.z), this.camera);
        this.biteEl.style.left = sp.x + 'px';
        this.biteEl.style.top = sp.y + 'px';
        if (this.pt > 1.35 - this.lv * 0.04) {
          this.biteEl.classList.add('hide');
          this.setCombo(0);
          this.tipText('慢了一步，鱼溜走了');
          this.loseLife();
          audio.sfx('miss');
          this.setPhase('rest');
          this.restT = 0.7;
        }
      } else if (this.phase === 'reel') {
        // 收线条：按住加速上升，松开受"重力"下落
        this.barV += (this.hold ? 3.4 : -2.9) * dt;
        this.barV *= Math.exp(-2.2 * dt);
        this.bar += this.barV * dt;
        if (this.bar < 0) { this.bar = 0; this.barV = Math.abs(this.barV) * 0.25; }
        if (this.bar > 1 - this.barH) { this.bar = 1 - this.barH; this.barV = -Math.abs(this.barV) * 0.25; }
        // 鱼的游动
        const d = this.fish.diff;
        this.ftT -= dt;
        if (this.ftT <= 0) {
          // 不同的鱼游法不同：平稳 / 下沉 / 上浮 / 猛窜 / 混合
          const ai = this.fish.ai, amp = 0.5 + d * 0.4;
          let step = rand(-0.5, 0.5) * amp;
          if (ai === 'sink') step = rand(-0.6, 0.2) * amp;
          if (ai === 'float') step = rand(-0.2, 0.6) * amp;
          if (ai === 'dart' || (ai === 'mixed' && Math.random() < 0.4)) step = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.7);
          this.ft = clamp(this.fp + step, 0.04, 0.96);
          this.ftT = (ai === 'dart' ? rand(0.25, 0.7) : ai === 'smooth' ? rand(0.7, 1.5) : rand(0.35, 1.2)) / (0.6 + d * 0.4);
        }
        this.fp += (this.ft - this.fp) * Math.min(1, dt * (1.2 + d * 1.2) * (0.85 + this.pressure * 0.15));
        const inside = this.fp >= this.bar - 0.02 && this.fp <= this.bar + this.barH + 0.02;
        this.prog += (inside ? 0.45 : -0.165 - d * 0.03) * dt;
        if (!inside) this.left = true;
        // 宝箱：用绿条罩住它一会儿就能捞到
        const tr = this.tre;
        if (tr) {
          if (!tr.on && this.pt >= tr.at) { tr.on = true; this.treEl.classList.remove('hide'); this.treEl.style.bottom = tr.pos * 100 + '%'; audio.sfx('pop', 3); }
          if (tr.on) {
            tr.t += dt;
            const cover = tr.pos >= this.bar && tr.pos <= this.bar + this.barH;
            tr.got = Math.max(0, tr.got + (cover ? dt : -dt * 0.5));
            this.treEl.style.setProperty('--k', Math.min(1, tr.got / 0.9));
            if (tr.got >= 0.9) { this.treBonus = randInt(12, 26) + this.lv * 3; this.tre = null; this.treEl.classList.add('hide'); audio.sfx('coin'); this.tipText(`捞到宝箱！+${this.treBonus}`); }
            else if (tr.t > 5) { this.tre = null; this.treEl.classList.add('hide'); }
          }
        }
        this.catchEl.style.height = this.barH * 100 + '%';
        this.catchEl.style.bottom = this.bar * 100 + '%';
        this.catchEl.classList.toggle('hit', inside);
        this.fishEl.style.bottom = this.fp * 100 + '%';
        this.progEl.style.height = clamp(this.prog) * 100 + '%';
        b.y = WATER_Y - 0.1 + Math.sin(time * 14) * 0.025;
        b.x += Math.sin(time * 3) * dt * 0.35;
        if (inside && Math.random() < dt * 6) fx.burst(this.scene, b.clone().setY(WATER_Y + 0.1), { n: 2, colors: ['#ffffff', '#cfeeff'], speed: 1.2, up: 1.6, life: 0.4, size: 0.4 });
        if (this.prog >= 1) this.endReel(true);
        else if (this.prog <= 0) this.endReel(false);
      } else if (this.phase === 'rest') {
        if (this.pt > this.restT) this.cast();
      }
    }
    // 鱼线：从竿梢连到浮漂
    const tip = (this._tip = this._tip || new THREE.Vector3());
    this.tip.getWorldPosition(tip);
    const bp = this.bobber.position;
    const len = tip.distanceTo(bp);
    this.line.position.copy(tip).lerp(bp, 0.5);
    this.line.scale.set(1, 1, len);
    this.line.lookAt(bp);
  }
}
