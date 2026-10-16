// 花语小筑：二合一合成（玩法参考 Travel Town / Merge Mansion 这类合成订单游戏）。
// 点花种篮长出嫩芽，把两个相同的拖到一起升级：嫩芽 → 花苞 → 鲜花 → 花束 → 花篮，再交给点单的客人。
import { THREE, cbox, box, cyl, group, textPlane, disposeSceneResources } from '../core/kit.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../models/character.js';
import { FLOWERS, flowerModel } from '../models/items.js';
import { MiniGame, buildRoom, roomLights, wallWindow, shelf, plantPot, jar, fitToScreen } from './common.js';
import { S, bus } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, pick, popIn, tween, angleLerp, clamp } from '../core/util.js';
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
    this.critMerges = 0;
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
    // 工作台与 3D 实时花艺陈列区
    sc.add(box(5.4, 1.0, 1.4, '#fffaf3', 1.4, 0, -0.4, { r: 0.12 }));
    sc.add(box(5.7, 0.14, 1.7, '#8fd9a8', 1.4, 1.0, -0.4, { r: 0.06 }));
    for (let i = 0; i < 5; i++) sc.add(cbox(0.5, 0.6, 0.06, i % 2 ? '#c9ecd2' : '#e6f7ea', -0.6 + i * 1.0, 0.5, 0.31, { r: 0.12 }));
    this.topY = 1.14;
    this.tableItems = group(0.8, this.topY, -0.35);
    sc.add(this.tableItems);
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

  syncTableModels() {
    if (!this.tableItems) return;
    while (this.tableItems.children.length) {
      const ch = this.tableItems.children[0];
      this.tableItems.remove(ch);
      disposeSceneResources(ch);
    }
    const topItems = this.cells
      .filter((it) => it && !it.weed && it.lv >= 2)
      .sort((a, b) => b.lv - a.lv)
      .slice(0, 4);
    topItems.forEach((it, idx) => {
      const slotG = group(-1.2 + idx * 0.78, 0, (idx % 2) * 0.16 - 0.08);
      if (it.t === 'ribbon') {
        slotG.add(cbox(0.32, 0.24, 0.32, '#ffd0de', 0, 0.12, 0, { r: 0.04 }));
        slotG.add(cbox(0.36, 0.06, 0.1, '#ff7aa5', 0, 0.25, 0, { r: 0.02 }));
      } else {
        const count = it.lv >= 5 ? 5 : it.lv >= 4 ? 3 : 1;
        if (it.lv >= 4) slotG.add(cyl(0.2, 0.14, 0.24, it.lv >= 5 ? '#e8b982' : '#ffd8e6', 0, 0, 0, { seg: 12 }));
        for (let k = 0; k < count; k++) {
          const fm = flowerModel(it.t);
          const ang = (k / count) * Math.PI * 2;
          const rad = count > 1 ? 0.1 : 0;
          fm.position.set(Math.cos(ang) * rad, it.lv >= 4 ? 0.12 : 0, Math.sin(ang) * rad);
          fm.scale.setScalar(0.85 + it.lv * 0.12);
          slotG.add(fm);
        }
      }
      this.tableItems.add(slotG);
    });
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
    this.bin = h('div', { class: 'mbin', onclick: () => {
      if (this.selectedCell !== null && this.cells[this.selectedCell] && !this.cells[this.selectedCell].weed) {
        const idx = this.selectedCell;
        this.clearSelection();
        this.cells[idx] = null;
        this.renderCell(idx);
        audio.sfx('remove');
        this.syncReady();
      }
    } }, '拖到这里', h('br'), '回收');
    const sortBtn = h('button', { type: 'button', class: 'btn alt sm msort-btn', onclick: () => this.sortBoard(), title: '按花色与等级整理棋盘 (Z)' }, '✨整理 (Z)');
    this.bubbles = h('div', { class: 'gorders', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.barEl = h('div', { class: 'gbar card merge' },
      h('div', { class: 'mgens' }, gen('flower', mergeIco('rose', 1), '空格'), gen('ribbon', mergeIco('ribbon', 1), 'R')),
      this.board,
      h('div', { class: 'mside' }, sortBtn, this.bin));
    this.mountHUD([this.bubbles, this.barEl]);
    fitToScreen(this.barEl, this.abort.signal, 0.52);
    this.renderPips();
    this.selectedCell = null;
    this.clearSelection = () => {
      this.selectedCell = null;
      this.cellEls.forEach((c) => c.classList.remove('match', 'lift'));
    };
    // 双击已完成花材可直接向匹配的客人交单
    this.on(this.board, 'dblclick', (e) => {
      const el = e.target.closest('.mcell');
      if (!el || !this.playing) return;
      const cellIdx = Number(el.dataset.i);
      const it = this.cells[cellIdx];
      if (!it || it.weed) return;
      for (let slot = 0; slot < this.customers.length; slot++) {
        const c = this.customers[slot];
        if (c && c.state === 'wait' && c.o.items.some((req) => same(it, req)) && this.match(c.o)) {
          this.clearSelection();
          this.deliver(slot);
          return;
        }
      }
    });
    // 拖拽与点选双模合成（A5）
    let drag = null;
    // 无论拖拽怎样结束（松手、被系统手势打断、暂停、退出），都把跟手的图标清干净
    this.cancelDrag = () => {
      drag = null;
      document.querySelectorAll('.mghost').forEach((g) => g.remove());
      this.clearSelection();
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= 8) drag.moved = true;
      drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -60%) scale(1.15)`;
    };
    this.on(this.board, 'pointerdown', (e) => {
      const el = e.target.closest('.mcell');
      if (!el || !this.playing) return;
      const i = Number(el.dataset.i);
      const it = this.cells[i];
      if (!it || it.weed) {
        // 已选中格子时点空格可直接移过去，点杂草或空白则取消选中（A5）
        if (this.selectedCell !== null && !it) {
          const from = this.selectedCell;
          this.clearSelection();
          this.drop(from, i);
          this.syncReady();
        } else {
          this.clearSelection();
        }
        return;
      }
      e.preventDefault();
      const prevSel = this.selectedCell;
      document.querySelectorAll('.mghost').forEach((g) => g.remove());
      try { this.board.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ }
      const ghost = h('img', { class: 'mghost', src: mergeIco(it.t, it.lv) });
      document.body.append(ghost);
      drag = { i, ghost, pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, prevSel };
      el.classList.add('lift');
      this.cellEls.forEach((c, k) => c.classList.toggle('match', k !== i && same(this.cells[k], it) && it.lv < MAXLV[chain(it.t)]));
      move(e);
    });
    this.on(window, 'pointermove', move);
    this.on(window, 'pointercancel', (e) => { if (drag && e.pointerId === drag.pid) this.cancelDrag(); }, { whilePaused: true });
    this.on(window, 'blur', () => this.cancelDrag(), { whilePaused: true });
    this.on(window, 'pointerup', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const { i, moved, prevSel } = drag;
      drag = null;
      document.querySelectorAll('.mghost').forEach((g) => g.remove());
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const cell = hit && hit.closest('.mcell'), bub = hit && hit.closest('.bubble'), bin = hit && hit.closest('.mbin');
      if (!moved && (!cell || Number(cell.dataset.i) === i)) {
        // 轻点格子：若之前已选中另一格则直接合成/交换；若点同一格则取消选中；否则保持选中高亮（A5）
        if (prevSel !== null && prevSel !== i && this.cells[prevSel]) {
          this.clearSelection();
          this.drop(prevSel, i);
        } else if (prevSel === i) {
          this.clearSelection();
        } else {
          this.selectedCell = i;
          const it = this.cells[i];
          this.cellEls.forEach((c, k) => {
            c.classList.toggle('lift', k === i);
            c.classList.toggle('match', k !== i && it && same(this.cells[k], it) && it.lv < MAXLV[chain(it.t)]);
          });
        }
        this.syncReady();
        return;
      }
      this.clearSelection();
      if (cell) this.drop(i, Number(cell.dataset.i));
      else if (bub && bub._slot !== undefined) this.deliver(bub._slot);
      else if (bin) { this.cells[i] = null; this.renderCell(i); audio.sfx('remove'); }
      this.syncReady();
    });
    this.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); this.spawn(false, 'flower'); }
      if (e.code === 'KeyR') this.spawn(false, 'ribbon');
      if (e.code === 'KeyZ') this.sortBoard();
      if (e.code === 'Escape') this.clearSelection();
    });
  }

  sortBoard() {
    if (!this.playing) return;
    this.cancelDrag?.();
    this.clearSelection();
    const movableIdx = [];
    const items = [];
    this.cells.forEach((it, idx) => {
      if (!it || !it.weed) {
        movableIdx.push(idx);
        if (it) items.push(it);
      }
    });
    items.sort((a, b) => {
      if (chain(a.t) !== chain(b.t)) return chain(a.t) === 'flower' ? -1 : 1;
      if (a.t !== b.t) return a.t.localeCompare(b.t);
      return b.lv - a.lv;
    });
    movableIdx.forEach((cellIdx, k) => {
      this.cells[cellIdx] = items[k] || null;
      this.renderCell(cellIdx, !!items[k]);
    });
    // 高亮第一组可合成的同级花材提示
    for (let i = 0; i < this.cells.length; i++) {
      const a = this.cells[i];
      if (!a || a.weed || a.lv >= MAXLV[chain(a.t)]) continue;
      const j = this.cells.findIndex((b, idx) => idx > i && same(b, a));
      if (j >= 0) {
        this.cellEls[i].classList.add('match');
        this.cellEls[j].classList.add('match');
        break;
      }
    }
    audio.sfx('tab');
    this.syncReady();
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
      const maxLv = MAXLV[chain(a.t)];
      const critChance = this.elapsed < (this.rushUntil || 0) ? 0.25 : 0.14;
      const isCrit = a.lv + 1 < maxLv && Math.random() < critChance;
      const nextLv = isCrit ? Math.min(maxLv, a.lv + 2) : a.lv + 1;
      this.cells[to] = { t: a.t, lv: nextLv };
      this.cells[from] = null;
      this.best = Math.max(this.best, nextLv);
      if (isCrit) this.critMerges++;
      if (a.t !== 'ribbon' && nextLv >= 4) bus.emit('found', 'flower', a.t + ':' + nextLv);
      this.addScore(a.lv + (isCrit ? nextLv * 2 : 0));
      audio.sfx('pop', 2 + nextLv * 1.5);
      if (nextLv >= 4 || isCrit) audio.sfx('good');
      const r = this.cellEls[to].getBoundingClientRect();
      this.float2(r.left + r.width / 2, r.top, isCrit ? `✨晨露跳级! ${nameOf(this.cells[to])}` : nameOf(this.cells[to]));
      if (isCrit) fx.sparkle(this.scene, new THREE.Vector3(1.2, this.topY + 0.5, -0.35), 8, ['#ffd76a', '#9fe0c5', '#ffffff']);
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
    const vip = prog >= 2 && Math.random() < 0.2;
    const reward = Math.round(items.reduce((s, it) => s + REWARD[chain(it.t)][it.lv], 0) * (items.length > 1 ? 1.35 : 1) * (this.modifier?.id === 'wedding' ? 1.5 : 1) * (vip ? 1.3 : 1));
    this.customers[slot] = { ch, vip, state: 'in', tx: SPOTS[slot], o: { items, reward } };
  }
  showBubble(slot) {
    const c = this.customers[slot], o = c.o;
    c.el = h('div', { class: 'bubble' + (c.vip ? ' vip' : ''), onclick: () => this.deliver(slot) },
      c.vip && h('span', { class: 'viptag' }, '熟客 +30%'),
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
    this.syncTableModels();
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
    // 每次成功交付订单回充花种篮与丝带篮能量，形成越合越爽的正反馈循环
    this.gens.flower.n = Math.min(this.gens.flower.max, this.gens.flower.n + 2);
    if (c.o.items.some((it) => it.t === 'ribbon')) {
      this.gens.ribbon.n = Math.min(this.gens.ribbon.max, this.gens.ribbon.n + 1);
    }
    this.renderPips();
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
  canMomoSkill() {
    return this.cells.some((it) => it?.weed) || Object.values(this.gens).some((g) => g.n < g.max)
      || this.customers.some((c) => c?.state === 'wait' && c.pat < c.patMax);
  }
  onMomoSkill() {
    if (!this.playing || !this.canMomoSkill()) return false;
    this.cancelDrag();
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]?.weed) {
      this.cells[i] = null;
      this.weeded = (this.weeded || 0) + 1;
      this.renderCell(i);
    }
    for (const g of Object.values(this.gens)) { g.n = g.max; g.cd = 0; }
    for (const c of this.customers) if (c?.state === 'wait' && Number.isFinite(c.patMax)) c.pat = Math.min(c.patMax, c.pat + c.patMax * 0.35);
    this.renderPips();
    this.syncReady();
    this.floatAt(new THREE.Vector3(0, 3, -2), '🐾 大喵园艺：清理杂草 + 花篮补满！', 'good');
    return true;
  }
  onFinish() {
    this.nikki.setPose('cheer');
    this.poseT = 9;
    for (const c of this.customers) if (c && c.el) { c.el.remove(); c.el = null; }
    this.cancelDrag();
  }
  resultLines() {
    const res = [['营业额', this.score], ['交付订单', `${this.delivered} 单`], ['最高合成', `Lv.${this.best}`], ['清理杂草', `${this.weeded || 0} 格`]];
    if (this.critMerges > 0) res.push(['晨露跳级', `${this.critMerges} 次`]);
    return res;
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
          const half = (c.el.offsetWidth || 96) / 2 + 10;
          const barTop = this.barEl?.getBoundingClientRect().top || (app.height - 170);
          c.el.style.left = clamp(sp.x, half, app.width - half) + 'px';
          c.el.style.top = Math.max((c.el.offsetHeight || 56) + 64, Math.min(sp.y, barTop - 10)) + 'px';
        }
      }
      c.ch.update(dt);
    });
  }
}
