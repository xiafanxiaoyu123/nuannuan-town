// 花语小筑：二合一合成（玩法参考 Travel Town / Merge Mansion 这类合成订单游戏）。
// 点花种篮长出嫩芽，把两个相同的拖到一起升级：嫩芽 → 花苞 → 鲜花 → 花束 → 花篮，再交给点单的客人。
import { THREE, cbox, box, cyl, group, textPlane, disposeSceneResources } from '../core/kit.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../models/character.js';
import { FLOWERS, flowerModel } from '../models/items.js';
import { MiniGame, buildRoom, roomLights, wallWindow, shelf, plantPot, jar } from './common.js';
import { S, bus } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, pick, angleLerp } from '../core/util.js';
import { mergeIco } from '../core/icons.js';

const COLS = 6, ROWS = 4;
const MAXLV = { flower: 5, ribbon: 3 };
const REWARD = { flower: [0, 3, 8, 20, 48, 110], ribbon: [0, 3, 9, 24] };
const LV_NAME = { flower: ['', '嫩芽', '花苞', '鲜花', '花束', '花篮'], ribbon: ['', '丝带', '蝴蝶结', '礼盒'] };
const SPOTS = [-5.4, -3.6, -1.8];
const chain = (t) => (t === 'ribbon' ? 'ribbon' : 'flower');
const nameOf = (it) => LV_NAME[chain(it.t)][it.lv];
const same = (x, o) => x && !x.weed && x.t === o.t && x.lv === o.lv;

export class FlowerGame extends MiniGame {
  constructor(game) {
    super(game, 'flower', { duration: 80, stars: [82, 165, 255] });
    this.refAspect = 1.7;
    this.types = this.modifier?.id === 'wedding' ? FLOWERS.filter((f) => ['rose', 'daisy'].includes(f.id)) : FLOWERS.slice(0, this.lv >= 3 ? 4 : 3);
    this.cells = Array(COLS * ROWS).fill(null);
    // 两个生成器：花种篮与丝带篮，各有自己的次数与回复
    const flowerMax = 7 + Math.min(3, this.lv) + this.fx('wind');
    this.gens = {
      flower: { name: '花种篮', n: flowerMax, max: flowerMax, cd: 0, rate: Math.max(0.28, 0.46 - this.lv * 0.03) },
      ribbon: { name: '丝带篮', n: 4, max: 4, cd: 0, rate: 0.75 },
    };
    if (this.modifier?.id === 'gift') this.gens.ribbon.rate *= 0.6;
    this.delivered = 0;
    this.best = 1;
    this.npcI = randInt(0, 5);
    this.orderT = 0.2;
    this.build();
    this.mount();
  }

  build() {
    const sc = this.scene;
    buildRoom(sc, { w: 28, d: 13, z0: -6.5, floorA: '#f6fcf5', floorB: '#dff3e2', wall: '#effaf0', trim: '#c9ecd2' });
    roomLights(sc, { ground: 0xe6ffe9 });
    this.camera.position.set(-0.6, 7.6, 12.6);
    this.camera.lookAt(-0.6, -0.4, -0.6);
    for (const x of [-7, 5.6]) { const w = wallWindow(2.6, 2.6, '#bfe8c9'); w.position.set(x, 4.2, -6.45); sc.add(w); }
    const sign = group(-0.7, 5.3, -6.4);
    sign.add(cbox(4.6, 1.1, 0.16, '#5fbf85', 0, 0, 0, { r: 0.2 }));
    const t = textPlane('花语小筑', { color: '#ffffff', height: 0.7, size: 72 });
    t.position.z = 0.1;
    sign.add(t);
    sc.add(sign);
    for (const x of [-3.4, 2.0]) {
      const s = shelf(3.4, [plantPot('#8fd694'), jar('#ffe9a8', 0.36), plantPot('#a3e0a0'), jar('#ffc2d6', 0.5)]);
      s.position.set(x, 3.6, -6.05);
      sc.add(s);
    }
    // 花桶台
    const n = FLOWERS.length;
    sc.add(box(n * 1.5 + 0.8, 0.9, 1.3, '#d2a67e', -0.7, 0, -4.6, { r: 0.1 }));
    sc.add(box(n * 1.5 + 1, 0.12, 1.5, '#b3855f', -0.7, 0.9, -4.6, { r: 0.05 }));
    FLOWERS.forEach((f, i) => {
      const g = group(-0.7 + (i - (n - 1) / 2) * 1.5, 1.02, -4.6);
      g.add(cyl(0.44, 0.35, 0.74, i % 2 ? '#fff6ea' : '#cfe9f7', 0, 0, 0, { seg: 16 }));
      for (let k = 0; k < 5; k++) {
        const m = flowerModel(f.id);
        const a = (k / 5) * Math.PI * 2;
        m.position.set(Math.cos(a) * 0.18, 0.5, Math.sin(a) * 0.18);
        m.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        m.scale.setScalar(1.2);
        g.add(m);
      }
      sc.add(g);
    });
    // 工作台
    sc.add(box(5.4, 1.0, 1.4, '#fffaf3', 1.4, 0, -0.4, { r: 0.12 }));
    sc.add(box(5.7, 0.14, 1.7, '#8fd9a8', 1.4, 1.0, -0.4, { r: 0.06 }));
    for (let i = 0; i < 5; i++) sc.add(cbox(0.5, 0.6, 0.06, i % 2 ? '#c9ecd2' : '#e6f7ea', -0.6 + i * 1.0, 0.5, 0.31, { r: 0.12 }));
    this.topY = 1.14;
    this.nikki = new Character(outfitToLook(S.outfit));
    this.nikki.root.position.set(0.9, 0, -1.5);
    this.nikki.root.rotation.y = -0.35;
    this.nikki.root.scale.setScalar(1.3);
    sc.add(this.nikki.root);
    this.momo = new Momo();
    this.momo.root.position.set(3.2, this.topY, -0.4);
    this.momo.root.rotation.y = -0.5;
    this.momo.root.scale.setScalar(1.15);
    sc.add(this.momo.root);
    this.customers = [null, null, null];
  }

  mount() {
    this.cellEls = this.cells.map((_, i) => h('div', { class: 'mcell', 'data-i': i }));
    this.board = h('div', { class: 'mboard' }, ...this.cellEls);
    const gen = (id, icon, key) => {
      const g = this.gens[id];
      g.pips = h('div', { class: 'pips' });
      g.btn = h('button', { class: 'mgen', onclick: () => this.spawn(false, id) }, h('span', { class: 'key' }, key), h('img', { src: icon, alt: '' }), h('b', {}, g.name), g.pips);
      return g.btn;
    };
    this.bin = h('div', { class: 'mbin' }, '拖到这里', h('br'), '回收');
    this.bubbles = h('div', { class: 'gorders', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.mountHUD([this.bubbles, h('div', { class: 'gbar card merge' }, h('div', { class: 'mgens' }, gen('flower', mergeIco('rose', 1), '空格'), gen('ribbon', mergeIco('ribbon', 1), 'R')), this.board, this.bin)]);
    this.renderPips();
    // 拖拽合成
    let drag = null;
    // 无论拖拽怎样结束（松手、被系统手势打断、暂停、退出），都把跟手的图标清干净
    this.cancelDrag = () => {
      drag = null;
      document.querySelectorAll('.mghost').forEach((g) => g.remove());
      this.cellEls.forEach((c) => c.classList.remove('match', 'lift'));
    };
    const move = (e) => { if (drag && e.pointerId === drag.pid) drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -60%) scale(1.15)`; };
    this.on(this.board, 'pointerdown', (e) => {
      const el = e.target.closest('.mcell');
      if (!el || !this.playing) return;
      const i = Number(el.dataset.i);
      const it = this.cells[i];
      if (!it || it.weed) return;
      e.preventDefault();
      this.cancelDrag(); // 上一次拖拽没收到松手事件时，别把图标留在屏幕上
      try { this.board.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ }
      const ghost = h('img', { class: 'mghost', src: mergeIco(it.t, it.lv) });
      document.body.append(ghost);
      drag = { i, ghost, pid: e.pointerId };
      el.classList.add('lift');
      this.cellEls.forEach((c, k) => c.classList.toggle('match', k !== i && same(this.cells[k], it) && it.lv < MAXLV[chain(it.t)]));
      move(e);
    });
    this.on(window, 'pointermove', move);
    this.on(window, 'pointercancel', (e) => { if (drag && e.pointerId === drag.pid) this.cancelDrag(); }, { whilePaused: true });
    this.on(window, 'blur', () => this.cancelDrag(), { whilePaused: true });
    this.on(window, 'pointerup', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { i } = drag;
      this.cancelDrag();
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const cell = hit && hit.closest('.mcell'), bub = hit && hit.closest('.bubble'), bin = hit && hit.closest('.mbin');
      if (cell) this.drop(i, Number(cell.dataset.i));
      else if (bub && bub._slot !== undefined) this.deliver(bub._slot);
      else if (bin) { this.cells[i] = null; this.renderCell(i); audio.sfx('remove'); }
      this.syncReady();
    });
    this.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); this.spawn(false, 'flower'); }
      if (e.code === 'KeyR') this.spawn(false, 'ribbon');
    });
  }
  renderPips() {
    for (const g of Object.values(this.gens)) {
      g.pips.replaceChildren(...Array.from({ length: g.max }, (_, i) => h('i', { class: i < g.n ? 'on' : '' })));
      g.btn.classList.toggle('empty', g.n <= 0);
    }
  }
  renderCell(i, pop) {
    const it = this.cells[i], el = this.cellEls[i];
    el.classList.toggle('weed', !!(it && it.weed));
    if (it && it.weed) el.replaceChildren(h('span', { class: 'wd' }));
    else el.replaceChildren(...(it ? [h('img', { src: mergeIco(it.t, it.lv), alt: '', class: pop ? 'pop' : '' }), h('span', { class: 'lv lv' + it.lv }, it.lv)] : []));
  }
  onStart() {
    // 开局有几格被杂草占着，在旁边完成合成才能清掉
    const idx = [...this.cells.keys()].sort(() => Math.random() - 0.5).slice(0, 4 + Math.min(3, this.lv) + (this.modifier?.id === 'weeds' ? 6 : 0));
    for (const i of idx) { this.cells[i] = { weed: true }; this.renderCell(i); }
    for (let i = 0; i < 4; i++) this.spawn(true, 'flower');
    this.spawn(true, 'ribbon');
  }

  spawn(free, gid = 'flower') {
    if (!this.playing) return;
    const g = this.gens[gid];
    const empty = this.cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length || (!free && g.n <= 0)) { audio.sfx('error'); return; }
    if (!free) { g.n--; this.renderPips(); }
    let t = 'ribbon';
    if (gid === 'flower') {
      // 偏向客人正在点的花
      const wanted = this.customers.filter((c) => c && c.o).flatMap((c) => c.o.items).filter((x) => x.t !== 'ribbon').map((x) => x.t);
      t = wanted.length && Math.random() < 0.65 ? pick(wanted) : pick(this.types).id;
    }
    const i = pick(empty);
    this.cells[i] = { t, lv: 1 };
    this.renderCell(i, true);
    audio.sfx('pop', Math.random() * 3);
    this.nikki.setPose('work');
    this.poseT = 0.25;
  }
  drop(from, to) {
    if (!this.playing || from === to || !this.cells[from]) return;
    const a = this.cells[from], b = this.cells[to];
    if (b && b.weed) { audio.sfx('error'); return; }
    if (!b) {
      this.cells[to] = a;
      this.cells[from] = null;
      audio.sfx('tab');
    } else if (same(b, a) && a.lv < MAXLV[chain(a.t)]) {
      this.cells[to] = { t: a.t, lv: a.lv + 1 };
      this.cells[from] = null;
      this.best = Math.max(this.best, a.lv + 1);
      if (a.t !== 'ribbon' && a.lv + 1 >= 4) bus.emit('found', 'flower', a.t + ':' + (a.lv + 1));
      this.addScore(a.lv);
      audio.sfx('pop', 2 + a.lv * 1.5);
      if (a.lv + 1 >= 4) audio.sfx('good');
      const r = this.cellEls[to].getBoundingClientRect();
      this.float2(r.left + r.width / 2, r.top, nameOf(this.cells[to]));
      // 合成会清掉相邻的杂草
      const x = to % COLS, y = Math.floor(to / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * COLS + nx;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !this.cells[k] || !this.cells[k].weed) continue;
        this.cells[k] = null;
        this.renderCell(k);
        this.addScore(this.modifier?.id === 'weeds' ? 3 : 2);
        this.weeded = (this.weeded || 0) + 1;
        audio.sfx('harvest');
      }
    } else {
      // 不能合成就交换位置
      this.cells[to] = a;
      this.cells[from] = b;
      audio.sfx('tab');
    }
    this.renderCell(from);
    this.renderCell(to, true);
  }
  float2(x, y, text, cls = 'good') {
    const el = h('div', { class: 'float ' + cls, style: { left: x + 'px', top: y + 'px', position: 'fixed', zIndex: 80 } }, text);
    document.body.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  newOrder(slot) {
    const ch = new Character(randomNpcLook(this.npcI++));
    ch.root.scale.setScalar(1.25);
    ch.root.position.set(-13, 0, 1.6);
    this.scene.add(ch.root);
    const prog = this.delivered, r = Math.random();
    let lv = prog < 3 ? 2 : r < 0.42 ? 2 : r < 0.88 ? 3 : 4; // 难度下调：高阶花束更少
    if (this.lv >= 3 && prog > 6 && r > 0.96) lv = 5;
    const items = [{ t: pick(this.types).id, lv }];
    // 一部分客人要"花 + 包装"两样
    if (this.modifier?.id === 'gift' || (prog >= 2 && Math.random() < 0.3)) items.push({ t: 'ribbon', lv: Math.random() < 0.6 || prog < 3 ? 2 : 3 });
    const reward = Math.round(items.reduce((s, it) => s + REWARD[chain(it.t)][it.lv], 0) * (items.length > 1 ? 1.35 : 1) * (this.modifier?.id === 'wedding' ? 1.5 : 1));
    this.customers[slot] = { ch, state: 'in', tx: SPOTS[slot], o: { items, reward } };
  }
  showBubble(slot) {
    const c = this.customers[slot], o = c.o;
    c.el = h('div', { class: 'bubble', onclick: () => this.deliver(slot) },
      h('div', { class: 'its' }, o.items.map((it) => h('img', { src: mergeIco(it.t, it.lv), alt: '', title: nameOf(it) }))),
      h('span', { class: 'rw' }, `${o.items.map(nameOf).join(' + ')} · +${o.reward}`));
    c.el._slot = slot;
    // 无尽模式：客人会等得不耐烦
    if (this.endless) { c.pat = c.patMax = Math.max(20, 46 - this.elapsed * 0.07); c.pt = h('i'); c.el.append(h('div', { class: 'pt' }, c.pt)); }
    this.bubbles.append(c.el);
    audio.sfx('bell');
    this.syncReady();
  }
  // 订单需要的每样东西在棋盘上的位置；凑不齐返回 null
  match(o) {
    const used = new Set(), out = [];
    for (const it of o.items) {
      const i = this.cells.findIndex((x, k) => !used.has(k) && same(x, it));
      if (i < 0) return null;
      used.add(i);
      out.push(i);
    }
    return out;
  }
  syncReady() {
    for (const c of this.customers) if (c && c.el) c.el.classList.toggle('ready', !!this.match(c.o));
  }
  deliver(slot) {
    const c = this.customers[slot];
    if (!this.playing || !c || c.state !== 'wait') return;
    const idx = this.match(c.o);
    if (!idx) {
      audio.sfx('error');
      c.el.classList.remove('shake');
      void c.el.offsetWidth;
      c.el.classList.add('shake');
      return;
    }
    for (const i of idx) { this.cells[i] = null; this.renderCell(i); }
    const big = c.o.items.length > 1 || c.o.items[0].lv >= 4;
    const earn = c.o.reward + Math.min(this.combo, 8) * 2;
    this.addScore(earn);
    this.setCombo(this.combo + 1);
    this.delivered++;
    audio.sfx('serve');
    const p = c.ch.root.position;
    this.floatAt(new THREE.Vector3(p.x, 3, p.z), `+${earn}`, big ? 'coin big' : 'coin');
    fx.sparkle(this.scene, new THREE.Vector3(p.x, 2, p.z + 0.4), 10, ['#ff8fb1', '#ffe27a', '#ffffff', '#9fe0c5']);
    if (big) fx.hearts(this.scene, new THREE.Vector3(p.x, 2.6, p.z), 5);
    c.el.remove();
    c.el = null;
    c.state = 'out';
    c.hold = 0.7;
    c.ch.setPose('cheer');
    this.nikki.setPose('cheer');
    this.poseT = 0.6;
    this.syncReady();
  }
  onFinish() {
    this.nikki.setPose('cheer');
    this.poseT = 9;
    for (const c of this.customers) if (c && c.el) { c.el.remove(); c.el = null; }
    this.cancelDrag();
  }
  resultLines() {
    return [['营业额', this.score], ['交付订单', `${this.delivered} 单`], ['最高合成', `Lv.${this.best}`], ['清理杂草', `${this.weeded || 0} 格`]];
  }

  tick(dt) {
    if (this.poseT > 0) { this.poseT -= dt; if (this.poseT <= 0 && this.state === 'play') this.nikki.setPose('idle'); }
    this.nikki.update(dt);
    this.momo.update(dt);
    if (this.state === 'play') {
      for (const g of Object.values(this.gens)) {
        if (g.n >= g.max) continue;
        g.cd += dt;
        if (g.cd >= g.rate) { g.cd = 0; g.n++; this.renderPips(); }
      }
      this.orderT -= dt;
      if (this.orderT <= 0) {
        const slot = this.customers.findIndex((c) => !c);
        if (slot >= 0) this.newOrder(slot);
        this.orderT = rand(2.2, 3.6) / this.pressure;
      }
    }
    this.customers.forEach((c, slot) => {
      if (!c) return;
      if (this.endless && this.state === 'play' && c.state === 'wait' && c.el) {
        c.pat -= dt;
        const k = Math.max(0, c.pat / c.patMax);
        c.pt.style.transform = `scaleX(${k})`;
        c.pt.style.background = k > 0.5 ? '#6fcf9f' : k > 0.25 ? '#ffc94d' : '#ff7f8f';
        if (c.pat <= 0) {
          audio.sfx('fail');
          this.setCombo(0);
          c.el.remove(); c.el = null;
          c.state = 'out';
          this.loseLife();
          this.syncReady();
        }
      }
      const p = c.ch.root.position;
      if (c.hold > 0) { c.hold -= dt; c.ch.targetMove = 0; }
      else if (c.state === 'in' || c.state === 'out') {
        const tx = c.state === 'in' ? c.tx : -13.5;
        const dx = tx - p.x;
        if (Math.abs(dx) < 0.1) {
          if (c.state === 'in') { c.state = 'wait'; c.ch.targetMove = 0; this.showBubble(slot); }
          else { this.scene.remove(c.ch.root); disposeSceneResources(c.ch.root); this.customers[slot] = null; return; }
        } else {
          p.x += Math.sign(dx) * Math.min(Math.abs(dx), 6.5 * dt);
          c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, dx > 0 ? Math.PI / 2 : -Math.PI / 2, 1 - Math.exp(-12 * dt));
          c.ch.targetMove = 1;
          if (c.state === 'out') c.ch.setPose('idle');
        }
      } else if (c.state === 'wait') {
        c.ch.root.rotation.y = angleLerp(c.ch.root.rotation.y, 0.5, 1 - Math.exp(-8 * dt));
        if (c.el) {
          const sp = app.project(new THREE.Vector3(p.x, 2.6, p.z), this.camera);
          c.el.style.left = sp.x + 'px';
          c.el.style.top = sp.y + 'px';
        }
      }
      c.ch.update(dt);
    });
  }
}
