// 麦香面包房：按火候出炉 → 放进四格展示架 → 按客人订单交付才获得营业额
import { THREE, cbox, box, group, glow, disposeSceneResources } from '../core/kit.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../models/character.js';
import { app } from '../core/app.js';
import { stat } from '../core/state.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, pick, clamp, angleLerp } from '../core/util.js';
import { MiniGame, buildRoom, roomLights, wallWindow, shelf, fitToScreen } from './common.js';
import { BREADS } from '../live/data.js';
import { bread, breadIco } from '../live/props.js';

const BURN = 1.28, DISPLAY_MAX = 4;
const SPOTS = [-3, 0, 3], KEYS = ['Q', 'W', 'E'];

export class BakeryGame extends MiniGame {
  constructor(game) {
    super(game, 'bakery', { duration: 75, stars: [90, 180, 280], fov: 34 });
    this.refAspect = 1.7;
    this.menu = BREADS.slice(0, Math.min(BREADS.length, 2 + this.lv));
    this.ovens = Array.from({ length: this.lv >= 4 ? 4 : 3 }, () => null);
    this.good = this.lv >= 5 ? [0.62, 1.08] : [0.72, 1];
    this.display = [];
    this.customers = [null, null, null];
    this.npcI = randInt(0, 5);
    this.spawnT = 0.3;
    this.baked = 0; this.perfect = 0; this.burnt = 0; this.served = 0; this.lost = 0;
    this.build();
    this.mount();
  }
  build() {
    const sc = this.scene;
    buildRoom(sc, { floorA: '#f6e3c8', floorB: '#fff4e0', wall: '#ffe9cf', trim: '#f6a56b', bg: '#ffe9cf' });
    roomLights(sc, { ground: 0xffe6c9 });
    this.camera.position.set(0, 7.4, 12.2);
    this.camera.lookAt(0, 1.3, 1.9); // 把等待中的客人留在操作栏上方，横屏也能看清脸
    const win = wallWindow(2.6, 2.2, '#f6a56b'); win.position.set(-5.2, 3.6, -7.3); sc.add(win);
    const sh = shelf(4.2, BREADS.map((b) => { const m = bread(b.id); m.scale.setScalar(0.9); return m; })); sh.position.set(4.6, 3.4, -7.1); sc.add(sh);
    this.ovenMeshes = [];
    for (let i = 0; i < this.ovens.length; i++) {
      const g = group((i - (this.ovens.length - 1) / 2) * 3.1, 0, -5.4);
      g.add(box(2.6, 2.6, 1.8, '#e0a184', 0, 0, 0, { r: 0.12 }), cbox(2.8, 0.3, 2, '#c98568', 0, 2.72, 0, { r: 0.1 }), cbox(1.9, 1.5, 0.3, '#5b4252', 0, 1.25, 0.82, { r: 0.5 }));
      const fire = cbox(1.6, 1.2, 0.2, glow('#ffb347', '#ff8a3d', 0.6, 2.2), 0, 1.2, 0.92, { r: 0.4, cast: false });
      fire.visible = false;
      const tray = group(0, 0.62, 1.2);
      tray.add(cbox(1.5, 0.08, 0.9, '#b9c2cc', 0, 0, 0, { r: 0.03 }));
      const holder = group(0, 0.06, 0);
      tray.add(holder); g.add(fire, tray); sc.add(g);
      this.ovenMeshes.push({ g, fire, holder });
    }
    sc.add(box(9.6, 1.1, 1.6, '#fff4e0', 0, 0, -0.6, { r: 0.1 }), box(9.8, 0.14, 1.8, '#f6a56b', 0, 1.1, -0.6, { r: 0.06 }));
    this.displayRoot = group(0, 1.25, -0.1); sc.add(this.displayRoot);
    this.nikki = new Character(outfitToLook(this.outfit));
    this.nikki.root.position.set(0.9, 0, -2.4); this.nikki.root.scale.setScalar(1.3); sc.add(this.nikki.root);
    this.momo = new Momo(); this.momo.root.position.set(3.4, 0, -2.2); sc.add(this.momo.root);
  }
  onEnter() { super.onEnter(); }
  mount() {
    this.slotEls = this.ovens.map((_, i) => h('button', { class: 'oven', onclick: () => this.take(i), 'aria-label': `取出烤炉${i + 1}的面包` },
      h('em', {}, `烤炉 ${i + 1}`), h('div', { class: 'ovpic' }),
      h('div', { class: 'ovbar' }, h('i'), h('u', { style: { left: this.good[0] / BURN * 100 + '%', width: (this.good[1] - this.good[0]) / BURN * 100 + '%' } }))));
    this.doughEls = this.menu.map((b, i) => h('button', { class: 'slot', onclick: () => this.put(i), 'aria-label': '烘烤' + b.name },
      h('span', { class: 'key' }, i + 1), h('img', { src: breadIco(b.id, 0), alt: '' }), h('b', {}, b.name), h('span', { class: 'price' }, '售价 ' + b.price)));
    this.displayEls = h('div', { class: 'bread-slots' });
    this.displayCount = h('b', {}, '0/4');
    this.controls = h('div', { class: 'bakery-controls' },
      h('div', { class: 'card bake-shelf' }, h('div', { class: 'bakery-label' }, '展示架 ', this.displayCount, h('small', {}, '点×回收')), this.displayEls),
      h('div', { class: 'gbar card bakebar' }, h('div', { class: 'ovens' }, ...this.slotEls), h('div', { class: 'sep' }), h('div', { class: 'gfoods' }, ...this.doughEls)));
    this.bubbles = h('div', { class: 'bakery-orders', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.mountHUD([this.bubbles, this.controls]);
    this.fitControls = fitToScreen(this.controls, this.abort.signal, 0.52);
    this.renderDisplay();
    this.on(window, 'keydown', (e) => {
      if (e.repeat || !this.playing) return;
      const m = /^Digit([1-5])$/.exec(e.code);
      if (m) this.put(Number(m[1]) - 1);
      const slot = ['KeyQ', 'KeyW', 'KeyE'].indexOf(e.code);
      if (slot >= 0) this.serve(slot);
      if (e.code === 'Space') {
        e.preventDefault();
        const i = this.ovens.findIndex((o) => o && (o.k >= BURN || (this.display.length < DISPLAY_MAX && o.k >= this.good[0])));
        if (i >= 0) this.take(i);
      }
    });
  }
  put(mi) {
    if (!this.playing || !Number.isInteger(mi) || !this.menu[mi]) return false;
    const i = this.ovens.findIndex((o) => !o);
    if (i < 0) { audio.sfx('error'); return false; }
    const b = this.menu[mi];
    this.ovens[i] = { b, t: 0, k: 0, need: b.bake / this.pressure * (this.modifier?.id === 'hotoven' ? 0.7 : 1) };
    this.ovenMeshes[i].fire.visible = true;
    this.updateOven(i);
    this.nikki.setPose('work'); this.poseT = 0.3;
    audio.sfx('pop');
    return true;
  }
  take(i) {
    const o = this.ovens[i];
    if (!this.playing || !o) return false;
    const om = this.ovenMeshes[i], p = new THREE.Vector3(om.g.position.x, 2.2, om.g.position.z + 1.2);
    if (o.k < this.good[0]) { audio.sfx('error'); this.floatAt(p, '还没熟', 'bad'); return false; }
    const burnt = o.k >= BURN, perfect = !burnt && o.k <= this.good[1];
    if (!burnt && this.display.length >= DISPLAY_MAX) { audio.sfx('error'); this.floatAt(p, '展示架满了，先交付订单', 'bad'); return false; }
    if (burnt) {
      this.burnt++; this.setCombo(0); this.loseLife(); audio.sfx('fail'); this.floatAt(p, '烤焦了…', 'bad');
    } else {
      this.display.push({ id: o.b.id, value: Math.round(o.b.price * (perfect ? 1.3 : 0.8)), perfect });
      this.baked++; stat('bread_baked');
      if (perfect) { this.perfect++; stat('bread_perfect'); }
      this.renderDisplay();
      audio.sfx(perfect ? 'perfect' : 'serve');
      this.floatAt(p, perfect ? '火候刚好！已上架' : '已放进展示架', 'good');
      fx.sparkle(this.scene, p, perfect ? 10 : 5, [o.b.color, '#ffffff', '#fff3a8']);
      this.nikki.setPose('cheer'); this.poseT = 0.5;
    }
    this.clear(i);
    return true;
  }
  clear(i) {
    this.ovens[i] = null;
    const om = this.ovenMeshes[i]; om.fire.visible = false;
    while (om.holder.children.length) om.holder.remove(om.holder.children[0]);
    const el = this.slotEls[i]; el.dataset.st = '';
    el.querySelector('.ovpic').replaceChildren(); el.querySelector('.ovbar i').style.width = '0%';
  }
  updateOven(i) {
    const o = this.ovens[i], el = this.slotEls[i];
    const state = o.k >= BURN ? 'burnt' : o.k > this.good[1] ? 'over' : o.k >= this.good[0] ? 'good' : 'raw';
    el.querySelector('.ovbar i').style.width = Math.min(100, o.k / BURN * 100) + '%';
    if (el.dataset.st === state) return;
    el.dataset.st = state;
    const done = state === 'burnt' ? 2 : state === 'raw' ? 0 : 1, om = this.ovenMeshes[i];
    while (om.holder.children.length) om.holder.remove(om.holder.children[0]);
    om.holder.add(bread(o.b.id, done));
    el.querySelector('.ovpic').replaceChildren(h('img', { src: breadIco(o.b.id, done), alt: '' }));
    if (state === 'good') audio.sfx('pop', 4);
  }
  renderDisplay() {
    this.displayCount.textContent = this.display.length + '/' + DISPLAY_MAX;
    this.displayEls.replaceChildren(...Array.from({ length: DISPLAY_MAX }, (_, i) => {
      const item = this.display[i];
      if (!item) return h('div', { class: 'bread-slot empty' }, '空位');
      const b = BREADS.find((x) => x.id === item.id);
      const slotEl = h('div', { class: 'bread-slot' + (item.perfect ? ' perfect' : ''), 'data-slot': i, onclick: (e) => {
        if (e.target.closest('.bread-discard')) return;
        // 点击展示架面包可自动交付给首位匹配的等待客人（A1 快捷交付）
        const targetIdx = this.customers.findIndex((c) => c && c.state === 'wait' && c.order.includes(item.id) && this.match(c.order));
        if (targetIdx >= 0) this.serve(targetIdx);
      } }, h('img', { src: breadIco(item.id), alt: '' }),
        h('span', {}, h('b', {}, b.name), h('small', {}, item.perfect ? '完美火候' : '普通火候')),
        h('button', { class: 'bread-discard', onclick: (e) => { e.stopPropagation(); this.discard(i); }, 'aria-label': `回收第${i + 1}份面包`, title: '回收这份面包，不计营业额' }, '×'));
      return slotEl;
    }));
    while (this.displayRoot.children.length) this.displayRoot.remove(this.displayRoot.children[0]);
    this.display.forEach((item, i) => { const m = bread(item.id); m.position.set((i - 1.5) * 1.6, 0, 0); m.scale.setScalar(0.75); this.displayRoot.add(m); });
    this.syncReady();
    this.fitControls?.();
  }
  discard(i) {
    if (!this.playing || !this.display[i]) return false;
    this.display.splice(i, 1); this.renderDisplay(); audio.sfx('remove');
    return true;
  }
  spawn(slot = this.customers.findIndex((c) => !c)) {
    if (!this.playing || !Number.isInteger(slot) || slot < 0 || slot >= this.customers.length || this.customers[slot]) return false;
    const n = this.modifier?.id === 'bigorder' ? 2 : Math.random() < 0.55 ? 1 : 2;
    const order = Array.from({ length: n }, () => pick(this.menu).id);
    const ch = new Character(randomNpcLook(this.npcI++)); ch.root.scale.setScalar(1.2); ch.root.position.set(12.5, 0, 1.9); this.scene.add(ch.root);
    const vip = this.elapsed > 8 && Math.random() < 0.18;
    const max = Math.max(18, (28 + n * 6) / Math.sqrt(this.pressure)) * (vip ? 0.88 : 1);
    this.customers[slot] = { ch, order, vip, state: 'in', patience: max, max, el: null };
    return true;
  }
  showOrder(slot) {
    const c = this.customers[slot]; c.pt = h('i');
    c.el = h('button', { class: 'bubble' + (c.vip ? ' vip' : ''), onclick: () => this.serve(slot), 'aria-label': `交付第${slot + 1}位客人的订单` },
      c.vip && h('span', { class: 'viptag' }, '熟客 +30%'),
      h('span', { class: 'kbd' }, KEYS[slot]), h('div', { class: 'its' }, c.order.map((id) => h('img', { src: breadIco(id), alt: BREADS.find((b) => b.id === id).name }))),
      h('span', { class: 'rw' }, '等待面包'), h('div', { class: 'pt' }, c.pt));
    this.bubbles.append(c.el); this.syncReady(); audio.sfx('bell');
  }
  match(order) {
    const used = new Set(), indices = [];
    for (const id of order) {
      const i = this.display.findIndex((b, k) => b.id === id && !used.has(k));
      if (i < 0) return null;
      used.add(i); indices.push(i);
    }
    return indices;
  }
  syncReady() {
    for (const c of this.customers) if (c?.el) {
      const match = this.match(c.order);
      c.el.classList.toggle('ready', !!match);
      c.el.querySelector('.rw').textContent = match ? '可以交付' : `需要 ${c.order.length} 份面包`;
    }
  }
  leave(c) { c.state = 'out'; c.el?.remove(); c.el = null; }
  serve(slot) {
    const c = this.customers[slot];
    if (!this.playing || !c || c.state !== 'wait') return false;
    const indices = this.match(c.order);
    if (!indices) { audio.sfx('error'); return false; }
    const baseEarn = indices.reduce((n, i) => n + this.display[i].value, 0) + Math.min(this.combo, 8);
    const earn = Math.round(baseEarn * (c.vip ? 1.3 : 1));
    for (const i of [...indices].sort((a, b) => b - a)) this.display.splice(i, 1);
    this.addScore(earn); this.setCombo(this.combo + 1); this.served++;
    this.leave(c); c.ch.setPose('cheer');
    this.renderDisplay(); audio.sfx('serve');
    const p = c.ch.root.position;
    this.floatAt(new THREE.Vector3(p.x, 2.8, p.z), '+' + earn, 'coin');
    fx.hearts(this.scene, new THREE.Vector3(p.x, 2.5, p.z), 4);
    return true;
  }
  onFinish() {
    for (let i = 0; i < this.ovens.length; i++) if (this.ovens[i]) this.clear(i);
    for (const c of this.customers) if (c) this.leave(c);
    // 打烊时展示架上已烤好的面包折算余温津贴（A4）
    if (this.display.length > 0) {
      this.addScore(this.display.length * 2);
    }
    this.nikki.setPose('cheer'); this.poseT = 9;
  }
  tick(dt) {
    if (this.poseT > 0 && (this.poseT -= dt) <= 0 && this.playing) this.nikki.setPose('idle');
    this.nikki.update(dt); this.momo.update(dt);
    if (this.playing) {
      for (let i = 0; i < this.ovens.length; i++) {
        const o = this.ovens[i]; if (!o) continue;
        o.t += dt; o.k = o.t / o.need; this.updateOven(i);
        if (o.k > BURN + 0.5) { this.burnt++; this.setCombo(0); this.loseLife(); audio.sfx('fail'); this.clear(i); }
        if (!this.playing) break;
      }
      if (this.playing) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawn(); this.spawnT = rand(3.6, 5) / this.pressure; }
      }
    }
    this.customers.forEach((c, slot) => {
      if (!c) return;
      const p = c.ch.root.position;
      if (c.state === 'in' || c.state === 'out') {
        const target = c.state === 'in' ? SPOTS[slot] : -12.5, dx = target - p.x;
        if (Math.abs(dx) < 0.08) {
          if (c.state === 'in') { c.state = 'wait'; c.ch.targetMove = 0; this.showOrder(slot); }
          else { this.scene.remove(c.ch.root); disposeSceneResources(c.ch.root); this.customers[slot] = null; return; }
        } else { p.x += Math.sign(dx) * Math.min(Math.abs(dx), 5.5 * dt); c.ch.targetMove = 1; c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, dx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.min(1, dt * 8)); }
      }
      if (c.state === 'wait') {
        if (this.playing) c.patience -= dt;
        if (c.patience <= 0 && this.playing) { this.lost++; this.leave(c); this.setCombo(0); this.loseLife(); audio.sfx('fail'); }
        if (c.el) {
          c.pt.style.transform = `scaleX(${clamp(c.patience / c.max)})`;
          c.pt.style.background = c.patience / c.max > 0.3 ? '#6fcf9f' : '#ff7f8f';
          const at = app.project(new THREE.Vector3(p.x, 2.8, p.z), this.camera), half = c.el.offsetWidth / 2 + 10;
          const ctrlTop = this.controls.getBoundingClientRect().top || (app.height - 160);
          c.el.style.left = clamp(at.x, half, app.width - half) + 'px';
          c.el.style.top = Math.max(c.el.offsetHeight + 68, Math.min(at.y, ctrlTop - 12)) + 'px';
          c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, 0.3, Math.min(1, dt * 8));
        }
      }
      c.ch.update(dt);
    });
  }
  resultLines() {
    return [['营业额', this.score], ['交付订单', `${this.served} 单`], ['出炉面包', `${this.baked} 个`], ['火候刚好', `${this.perfect} 个`], ['烤焦 / 流失', `${this.burnt} / ${this.lost}`], ['未售出', `${this.display.length} 个`]];
  }
}
