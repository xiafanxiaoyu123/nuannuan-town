// 甜心咖啡屋：多订单时间管理（玩法参考 Cooking Fever / Diner Dash）。
// 每种甜点有自动补货的备货位，取用放进托盘，赶在客人耐心耗尽前上菜。
import { THREE, cbox, box, cyl, group, mat, glow, textPlane, disposeSceneResources } from '../core/kit.js';
import { Character, outfitToLook, randomNpcLook } from '../models/character.js';
import { FOODS, FOOD_BUILD, coinModel } from '../models/items.js';
import { DECOR_BUILD } from '../models/props.js';
import { fitToScreen, MiniGame, buildRoom, roomLights, wallWindow, shelf, jar, plantPot } from './common.js';
import { S } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, pick, tween, ease, popIn, angleLerp, clamp } from '../core/util.js';
import { foodIco } from '../core/icons.js';
import { svg } from '../ui/ui.js';

const SLOTS = [-3.2, 0, 3.2];
const KEYS = ['Q', 'W', 'E'];
const BREW = new Set(['coffee', 'tea']); // 需要手动冲泡的饮品
const BREW_TXT = { idle: '点击冲泡', brewing: '冲泡中…', ready: '取杯！', burnt: '煮过头·清理' };
const REST = Math.PI - 1.35; // 暖暖平时侧身站在柜台后，斜视角下能看到脸

export class CafeGame extends MiniGame {
  constructor(game) {
    super(game, 'cafe', { duration: 75, stars: [105, 210, 315] });
    this.menu = FOODS.slice(0, Math.min(6, 2 + this.lv));
    this.soldout = this.modifier?.id === 'soldout' ? randInt(0, this.menu.length - 1) : -1;
    this.tray = [];
    this.stock = this.menu.map(() => 2);
    this.brew = this.menu.map((f) => (BREW.has(f.id) ? { st: 'idle', t: 0 } : null));
    this.piles = [null, null, null];
    this.restock = this.menu.map(() => 0);
    this.customers = [];
    this.spawnT = 0.3;
    this.served = 0;
    this.lost = 0;
    this.npcI = randInt(0, 5);
    this.build();
    this.mount();
  }

  build() {
    const sc = this.scene;
    buildRoom(sc, { w: 26, d: 13, z0: -7.5, floorA: '#fff6ea', floorB: '#ffe1ea', wall: '#fff1f5', trim: '#ffd0de' });
    roomLights(sc);
    this.camera.position.set(10.4, 9.6, 11.8);
    this.camera.lookAt(0.1, 0.9, 0.3);
    this.refAspect = 1.7;
    // 后墙
    for (const x of [-5.4, 5.4]) { const w = wallWindow(2.6, 2.4); w.position.set(x, 3.9, -7.45); sc.add(w); }
    const board = group(0, 4.2, -7.4);
    board.add(cbox(4.4, 2.5, 0.16, '#8a6a55', 0, 0, 0, { r: 0.08 }));
    board.add(cbox(4.1, 2.2, 0.18, '#5c4558', 0, 0, 0.01, { r: 0.05, cast: false }));
    const t = textPlane('今日甜点', { color: '#ffd0de', height: 0.5, size: 64 });
    t.position.set(0, 0.68, 0.11);
    board.add(t);
    this.menu.forEach((f, i) => {
      const m = FOOD_BUILD[f.id]();
      m.scale.setScalar(0.62);
      const cols = Math.min(3, this.menu.length), r = Math.floor(i / 3), c = i % 3;
      const rowN = Math.min(3, this.menu.length - r * 3);
      m.position.set((c - (rowN - 1) / 2) * 1.2, 0.02 - r * 0.78 - (this.menu.length <= 3 ? 0.4 : 0), 0.2);
      m.rotation.x = 0.5;
      board.add(m);
    });
    sc.add(board);
    for (const [x, y] of [[-5.4, 1.9], [5.4, 1.9]]) {
      const s = shelf(3, [jar('#ffc2d6'), plantPot(), jar('#ffe9a8', 0.4), jar('#cfeaff', 0.6)]);
      s.position.set(x, y, -7.1);
      sc.add(s);
    }
    // 远处的客座
    for (const x of [-5.6, 5.6]) {
      const ts = DECOR_BUILD.teaset();
      ts.position.set(x, 0, -4.9);
      ts.scale.setScalar(1.15);
      sc.add(ts);
    }
    const tree = DECOR_BUILD.tree();
    tree.position.set(-9, 0, -6.4);
    sc.add(tree);
    for (const x of [-3, 0, 3]) {
      sc.add(cbox(0.04, 1.6, 0.04, '#d9cfc5', x, 6.2, -2.6, { cast: false }));
      sc.add(cbox(0.7, 0.4, 0.7, glow('#fff3c4', '#ffd27a', 1.4, 1.4), x, 5.3, -2.6, { r: 0.2, cast: false }));
    }
    // 柜台
    sc.add(box(10.6, 1.05, 1.2, '#fffaf3', 0, 0, 0, { r: 0.12 }));
    sc.add(box(10.9, 0.14, 1.5, '#ff9fbd', 0, 1.05, 0, { r: 0.06 }));
    for (let i = 0; i < 9; i++) sc.add(cbox(0.5, 0.7, 0.06, i % 2 ? '#ffd0de' : '#ffe9f0', -4.4 + i * 1.1, 0.55, -0.6, { r: 0.12 }));
    this.topY = 1.19;
    // 收银机与蛋糕罩
    const reg = group(-4.9, this.topY, 0);
    reg.add(box(0.9, 0.5, 0.7, '#ffffff', 0, 0, 0, { r: 0.1 }));
    reg.add(cbox(0.7, 0.4, 0.08, '#cfeaff', 0, 0.72, -0.2, { r: 0.04, rx: 0.3 }));
    reg.add(cbox(0.5, 0.1, 0.3, '#ffd0de', 0, 0.53, 0.12, { r: 0.03 }));
    sc.add(reg);
    const dome = group(4.9, this.topY, 0.05);
    dome.add(cyl(0.6, 0.6, 0.08, '#ffffff', 0, 0, 0, { seg: 24 }));
    const ck = FOOD_BUILD.cake();
    ck.scale.setScalar(1.3);
    ck.position.y = 0.08;
    dome.add(ck);
    dome.add(cbox(1.0, 0.9, 1.0, mat('#eaf6ff', { opacity: 0.32, rough: 0.1 }), 0, 0.56, 0, { r: 0.3, cast: false }));
    sc.add(dome);
    // 托盘
    this.trayG = group(0, this.topY, 0.18);
    this.trayG.add(box(1.9, 0.07, 0.9, '#ffe9a8', 0, 0, 0, { r: 0.03 }));
    this.trayItems = group(0, 0.07, 0);
    this.trayG.add(this.trayItems);
    sc.add(this.trayG);
    // 暖暖（站在柜台内侧，背对镜头）
    this.nikki = new Character(outfitToLook(S.outfit));
    this.nikki.root.position.set(0, 0, 1.55);
    this.nrot = this.nikki.root.rotation.y = REST;
    this.nikki.root.scale.setScalar(1.15);
    sc.add(this.nikki.root);
    this.nx = 0;
  }

  mount() {
    this.trayEls = [0, 1, 2].map((idx) => h('button', { type: 'button', class: 'tray-slot', title: '点击撤下这格餐品', onclick: () => this.removeTray(idx) }));
    const foods = this.menu.map((f, i) =>
      h('button', { class: 'slot stock', onclick: () => this.add(i) }, h('span', { class: 'key' }, i + 1), h('img', { src: foodIco(f.id), alt: '' }), h('b', {}, f.name), BREW.has(f.id) ? h('span', { class: 'bst' }, BREW_TXT.idle) : h('div', { class: 'pips' }, h('i'), h('i'), h('i')), h('div', { class: 'rs' }, h('i'))));
    this.foodEls = foods;
    const bar = (this.barEl = h('div', { class: 'gbar card cafebar' + (this.menu.length > 3 ? ' many' : '') }, h('div', { class: 'gfoods', style: { '--n': foods.length } }, ...foods), h('div', { class: 'sep' }), h('div', { class: 'gtray' }, ...this.trayEls),
      h('button', { class: 'btn alt sm', onclick: () => this.clear(), title: '清空托盘 (X)' }, svg('close'), '清空')));
    this.bubbles = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.mountHUD([this.bubbles, bar]);
    fitToScreen(this.barEl, this.abort.signal, 0.48);
    this.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      const d = /^Digit([1-6])$/.exec(e.code);
      if (d) this.add(Number(d[1]) - 1);
      const k = ['KeyQ', 'KeyW', 'KeyE'].indexOf(e.code);
      if (k >= 0) this.serve(k);
      if (e.code === 'KeyX' || e.code === 'Backspace') this.clear();
    });
  }

  removeTray(idx) {
    if (!this.playing || !this.tray[idx]) return;
    const removedId = this.tray.splice(idx, 1)[0];
    const menuIdx = this.menu.findIndex((f) => f.id === removedId);
    if (menuIdx >= 0 && !this.brew[menuIdx] && this.stock[menuIdx] < 3) {
      this.stock[menuIdx]++;
      this.syncStock();
    }
    audio.sfx('remove');
    this.syncTray();
  }

  add(i) {
    if (!this.playing || !this.menu[i] || i === this.soldout) return;
    const br = this.brew[i];
    if (br) {
      // 冲泡机：点一下开始 → 好了再点取杯 → 放太久会煮过头，要清理
      if (br.st === 'idle') { br.st = 'brewing'; br.t = 0; audio.sfx('water'); }
      else if (br.st === 'burnt') { br.st = 'idle'; br.t = 0; audio.sfx('remove'); }
      else if (br.st === 'brewing' || this.tray.length >= 3) { audio.sfx('error'); return; }
      this.syncStock();
      if (br.st !== 'ready') return;
      br.st = 'idle';
      br.t = 0;
      this.syncStock();
    } else {
      if (this.tray.length >= 3) return;
      if (this.stock[i] <= 0) { audio.sfx('error'); return; }
      this.stock[i]--;
      this.syncStock();
    }
    this.tray.push(this.menu[i].id);
    audio.sfx('pop', this.tray.length);
    this.nikki.setPose('work');
    this.poseT = 0.28;
    this.syncTray();
  }
  syncStock() {
    this.foodEls.forEach((el, i) => {
      const br = this.brew[i], sold = i === this.soldout;
      el.disabled = sold;
      el.classList.toggle('out', sold || (!br && this.stock[i] <= 0));
      el.title = sold ? '今日售罄' : '';
      if (br) {
        el.querySelector('.bst').textContent = sold ? '今日售罄' : BREW_TXT[br.st];
        el.dataset.brew = br.st;
        return;
      }
      el.querySelectorAll('.pips i').forEach((p, k) => p.classList.toggle('on', k < this.stock[i]));
      el.classList.toggle('out', sold || this.stock[i] <= 0);
    });
  }
  onStart() {
    this.syncStock();
  }
  clear() {
    if (!this.playing || !this.tray.length) return;
    this.tray.length = 0;
    audio.sfx('remove');
    this.syncTray();
  }
  syncTray() {
    this.trayEls.forEach((el, i) => {
      el.disabled = !this.tray[i];
      el.replaceChildren(...(this.tray[i] ? [h('img', { src: foodIco(this.tray[i]), alt: '' })] : []));
    });
    while (this.trayItems.children.length) this.trayItems.remove(this.trayItems.children[0]);
    this.tray.forEach((id, i) => {
      const m = FOOD_BUILD[id]();
      m.position.set(-0.6 + i * 0.6, 0, 0);
      m.scale.setScalar(0.9);
      this.trayItems.add(m);
      if (i === this.tray.length - 1) popIn(m, 0.25, 0, 0.9);
    });
    const key = this.tray.slice().sort().join();
    for (const c of this.customers) if (c.el) c.el.classList.toggle('ready', c.state === 'wait' && c.key === key);
  }

  spawn() {
    const used = new Set(this.customers.filter((c) => c.state !== 'out').map((c) => c.slot));
    this.piles.forEach((p, i) => p && used.add(i));
    const free = [0, 1, 2].filter((s) => !used.has(s));
    if (!free.length) return false;
    const slot = pick(free);
    const elapsed = this.duration - this.time;
    const maxN = elapsed < 12 ? 1 : elapsed < 30 && this.lv < 3 ? 2 : 3;
    const n = Math.min(maxN, Math.random() < 0.35 ? 1 : Math.random() < 0.6 ? 2 : 3);
    const order = Array.from({ length: n }, () => pick(this.menu).id);
    const ch = new Character(randomNpcLook(this.npcI++));
    ch.root.scale.setScalar(1.25);
    ch.root.position.set(12.4, 0, -3.1);
    this.scene.add(ch.root);
    // 贵客：付双倍，但耐心更少；居民常客：报酬 +30%
    const vip = this.modifier?.id === 'vip' || (elapsed > 10 && Math.random() < 0.16);
    const resident = !vip && Math.random() < 0.22 ? pick(['小满', '阿禾', '阿絮', '小桃', '七七']) : null;
    const patience = (22.5 - this.lv * 0.8 + n * 4) * (vip ? 0.78 : 1) * (1 + this.fx('bubble')); // 整体难度下调约 1/4：耐心更久
    if (vip) {
      const gm = mat('#ffd76a', { rough: 0.3, metal: 0.5 });
      const cr = group(0, 0.72, 0, cyl(0.2, 0.2, 0.09, gm, 0, 0, 0, { seg: 12 }));
      for (let k = 0; k < 5; k++) cr.add(cbox(0.08, 0.14, 0.08, gm, Math.sin(k * 1.257) * 0.15, 0.13, Math.cos(k * 1.257) * 0.15, { r: 0.02 }));
      ch.head.add(cr);
    }
    const c = { ch, slot, order, vip, resident, key: order.slice().sort().join(), state: 'in', patience, max: patience, path: [[SLOTS[slot], -3.1], [SLOTS[slot], -1.5]], el: null };
    this.customers.push(c);
    return true;
  }
  showBubble(c) {
    c.pt = h('i');
    c.el = h('div', { class: 'bubble' + (c.vip || c.resident ? ' vip' : ''), onclick: () => this.serve(c.slot) },
      c.vip ? h('span', { class: 'viptag' }, '贵客 ×2') : c.resident ? h('span', { class: 'viptag' }, `${c.resident} +30%`) : null,
      h('span', { class: 'kbd' }, KEYS[c.slot]),
      h('div', { class: 'its' }, c.order.map((id) => h('img', { src: foodIco(id), alt: '' }))),
      h('div', { class: 'pt' }, c.pt));
    if (this.soldout >= 0 && c.order.includes(this.menu[this.soldout].id)) {
      c.soldWait = 3;
      c.el.append(h('span', { class: 'viptag' }, '今日售罄 · 稍后离开'));
    }
    this.bubbles.append(c.el);
    audio.sfx('bell');
    this.syncTray();
  }
  leave(c, happy) {
    c.state = 'out';
    c.el && c.el.remove();
    c.el = null;
    c.path = [[SLOTS[c.slot], -3.1], [-12.4, -3.1]];
    c.ch.setPose(happy ? 'cheer' : 'sad');
    c.hold = happy ? 0.7 : 0.3;
  }
  serve(slot) {
    if (!this.playing) return;
    const c = this.customers.find((x) => x.slot === slot && x.state === 'wait');
    if (!c) { this.collect(slot); return; }
    if (c.soldWait !== undefined) return;
    const key = this.tray.slice().sort().join();
    if (key !== c.key) {
      audio.sfx('error');
      c.el.classList.remove('shake');
      void c.el.offsetWidth;
      c.el.classList.add('shake');
      c.patience -= 0.9;
      return;
    }
    const base = c.order.reduce((s, id) => s + FOODS.find((f) => f.id === id).price, 0);
    const ratio = clamp(c.patience / c.max);
    const tipMul = this.modifier?.id === 'sweet_rush' ? 0.85 : 0.6;
    const mult = c.vip ? 2 : c.resident ? 1.3 : 1;
    const earn = Math.round((base + Math.round(base * tipMul * ratio)) * mult) + Math.min(this.combo, 10) * (this.modifier?.id === 'combo' ? 2 : 1);
    this.dropPile(slot, earn);
    this.setCombo(this.combo + 1);
    this.served++;
    audio.sfx('serve');
    const p = c.ch.root.position;
    fx.sparkle(this.scene, new THREE.Vector3(p.x, 1.9, p.z + 0.6), 10);
    if (ratio > 0.6) fx.hearts(this.scene, new THREE.Vector3(p.x, 2.4, p.z), 4);
    this.leave(c, true);
    this.tray.length = 0;
    this.syncTray();
    this.nxTarget = SLOTS[slot] * 0.8;
    this.nikki.setPose('cheer');
    this.poseT = 0.7;
    this.nrot = 0.8; // 转身面向镜头庆祝一下
  }
  // 客人把噗灵留在柜台上，点一下收走才能接待下一位
  dropPile(slot, earn) {
    const mesh = group(SLOTS[slot], this.topY, -0.32);
    for (let k = 0; k < 3; k++) { const m = coinModel(); m.rotation.x = Math.PI / 2; m.position.set((k - 1) * 0.16, 0.05 + k * 0.05, (k % 2) * 0.1); m.scale.setScalar(0.9); mesh.add(m); }
    this.scene.add(mesh);
    popIn(mesh, 0.3);
    const el = h('button', { class: 'coinpile', onclick: () => this.collect(slot) }, h('span', { class: 'kbd' }, KEYS[slot]), `+${earn}`);
    this.bubbles.append(el);
    this.piles[slot] = { earn, t: 0, mesh, el };
  }
  collect(slot, auto) {
    if (this.paused || this.dead) return;
    const pl = this.piles[slot];
    if (!pl) return;
    this.piles[slot] = null;
    const earn = pl.earn + (!auto && pl.t < 2.5 ? 2 : 0);
    this.addScore(earn);
    audio.sfx('coin');
    this.floatAt(new THREE.Vector3(SLOTS[slot], this.topY + 0.8, -0.3), `+${earn}`, 'coin');
    this.scene.remove(pl.mesh);
    pl.el.remove();
  }
  onFinish() {
    for (let i = 0; i < 3; i++) this.collect(i, true);
    for (const c of this.customers) if (c.state !== 'out') this.leave(c, true);
    this.nikki.setPose('cheer');
    this.poseT = 9;
    this.nrot = 0.8;
  }
  resultLines() {
    return [['营业额', this.score], ['接待客人', `${this.served} 位`], ['最高连击', '×' + (this.maxCombo || 0)]];
  }

  tick(dt) {
    // 暖暖
    if (this.poseT > 0) { this.poseT -= dt; if (this.poseT <= 0 && this.state === 'play') { this.nikki.setPose('idle'); this.nrot = REST; } }
    this.nikki.root.rotation.y += (this.nrot - this.nikki.root.rotation.y) * Math.min(1, dt * 10);
    if (this.nxTarget !== undefined) {
      const d = this.nxTarget - this.nx;
      this.nx += d * Math.min(1, dt * 9);
      this.nikki.targetMove = Math.abs(d) > 0.15 ? 1 : 0;
      this.nikki.root.position.x = this.nx;
      this.trayG.position.x = this.nx;
    }
    this.nikki.update(dt);

    if (this.state === 'play') {
      // 备货位自动补货
      const barTop = this.barEl ? this.barEl.getBoundingClientRect().top : window.innerHeight - 96;
      this.piles.forEach((pl, i) => {
        if (!pl) return;
        pl.t += dt;
        const sp = app.project(new THREE.Vector3(SLOTS[i], this.topY + 0.75, -0.32), this.camera);
        pl.el.style.left = clamp(sp.x, 54, window.innerWidth - 54) + 'px';
        pl.el.style.top = clamp(sp.y, 128, Math.max(145, barTop - 28)) + 'px';
        if (pl.t > 6) this.collect(i, true);
      });
      this.menu.forEach((f, i) => {
        const bar = this.foodEls[i].querySelector('.rs i');
        const br = this.brew[i];
        if (br) {
          const need = Math.max(0.85, 1.35 - this.lv * 0.06) * Math.pow(0.6, this.perks.restock || 0);
          if (br.st === 'idle') { bar.style.transform = 'scaleX(0)'; return; }
          br.t += dt;
          if (br.st === 'brewing') {
            bar.style.transform = `scaleX(${Math.min(1, br.t / need)})`;
            if (br.t >= need) { br.st = 'ready'; br.t = 0; audio.sfx('pop', 4); this.syncStock(); }
          } else if (br.st === 'ready') {
            bar.style.transform = `scaleX(${Math.max(0, 1 - br.t / 9.5)})`;
            if (br.t >= 9.5) { br.st = 'burnt'; audio.sfx('error'); this.syncStock(); }
          }
          return;
        }
        if (this.stock[i] >= 3) { bar.style.transform = 'scaleX(0)'; return; }
        const need = (1.5 + i * 0.22 - this.lv * 0.06) * 0.75 * Math.pow(0.6, this.perks.restock || 0);
        this.restock[i] += dt;
        bar.style.transform = `scaleX(${Math.min(1, this.restock[i] / need)})`;
        if (this.restock[i] >= need) { this.restock[i] = 0; this.stock[i]++; this.syncStock(); }
      });
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const ok = this.spawn();
        const pace = Math.max(2.4, (6.1 - this.lv * 0.4 - Math.min(this.elapsed, 75) * 0.02) / this.pressure) * (this.modifier?.id === 'rush' && this.elapsed < 30 ? 0.5 : 1); // 关卡越靠后 / 无尽撑得越久，客人来得越密
        this.spawnT = ok ? rand(pace * 0.75, pace * 1.15) : 0.6;
      }
    }
    const barTop = this.barEl ? this.barEl.getBoundingClientRect().top : window.innerHeight - 96;
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i], p = c.ch.root.position;
      if (c.hold > 0) { c.hold -= dt; c.ch.targetMove = 0; }
      else if (c.path.length) {
        const [tx, tz] = c.path[0];
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.12) c.path.shift();
        else {
          const sp = c.state === 'out' ? 5 : 5.5;
          p.x += (dx / d) * Math.min(d, sp * dt);
          p.z += (dz / d) * Math.min(d, sp * dt);
          c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
          c.ch.targetMove = 1;
          if (c.state === 'out' && c.ch.pose !== 'sad') c.ch.setPose('idle');
        }
      } else if (c.state === 'in') {
        c.state = 'wait';
        c.ch.targetMove = 0;
        this.showBubble(c);
      } else if (c.state === 'out') {
        this.scene.remove(c.ch.root);
        disposeSceneResources(c.ch.root);
        this.customers.splice(i, 1);
        continue;
      }
      if (c.state === 'wait') {
        c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, 0.5, 1 - Math.exp(-10 * dt));
        if (c.soldWait !== undefined) {
          if (this.state === 'play') c.soldWait -= dt;
          if (c.soldWait <= 0) { this.leave(c, true); continue; }
        } else if (this.state === 'play') c.patience -= dt;
        const k = clamp(c.patience / c.max);
        c.pt.style.transform = `scaleX(${k})`;
        c.pt.style.background = k > 0.5 ? '#6fcf9f' : k > 0.25 ? '#ffc94d' : '#ff7f8f';
        const sp = app.project(new THREE.Vector3(p.x, 2.55, p.z), this.camera);
        c.el.style.left = clamp(sp.x, 60, window.innerWidth - 60) + 'px';
        c.el.style.top = clamp(sp.y, 128, Math.max(145, barTop - 44)) + 'px';
        if (c.patience <= 0) {
          this.lost++;
          this.loseLife();
          this.setCombo(0);
          audio.sfx('fail');
          this.floatAt(new THREE.Vector3(p.x, 2.7, p.z), '等太久啦…', 'bad');
          this.leave(c, false);
        }
      }
      c.ch.update(dt);
    }
  }
}
