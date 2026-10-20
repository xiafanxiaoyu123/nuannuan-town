// 甜心咖啡屋：多订单时间管理（玩法参考 Cooking Fever / Diner Dash）。
// 每种甜点有自动补货的备货位，取用放进托盘，赶在客人耐心耗尽前上菜。
import { THREE, cbox, box, cyl, group, mat, glow, textPlane, disposeSceneResources } from '../core/kit.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../models/character.js';
import { FOODS, FOOD_BUILD, coinModel } from '../models/items.js';
import { DECOR_BUILD } from '../models/props.js';
import { fitToScreen, MiniGame, buildRoom, roomLights, wallWindow, shelf, jar, plantPot } from './common.js';
import { S, bus } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, rand, randInt, pick, popIn, angleLerp, clamp } from '../core/util.js';
import { foodIco } from '../core/icons.js';
import { ui, svg } from '../ui/ui.js';
import { createDish, animateDish } from '../models/homestead.js';
import { parseDishKey } from '../shared/homestead.js';
import { CAFE_SPECIALS, CAFE_STYLES, getCafeSpecials } from '../shared/cafe-specials.js';
import { applyCafeSpecialAction } from '../core/cafe-specials-actions.js';
import { cafeDishIcon } from '../live/cafe-specials-panel.js';

const SLOTS = [-3.2, 0, 3.2];
const KEYS = ['Q', 'W', 'E'];
const BREW = new Set(['coffee', 'tea']); // 需要手动冲泡的饮品
const BREW_TXT = { idle: '点击冲泡', brewing: '萃取中…', ready: '取杯！', golden: '✨拉花期！', burnt: '煮过头·清理' };
const REST = Math.PI - 1.35; // 暖暖平时侧身站在柜台后，斜视角下能看到脸

export class CafeGame extends MiniGame {
  constructor(game) {
    super(game, 'cafe', { duration: 75, stars: [105, 210, 315] });
    this.cafeSource = S;
    const selection = game.playOpts?.cafeSpecials || { style: 'teatime', recipeId: null };
    const begun = applyCafeSpecialAction({ type: 'begin', style: selection.style, recipeId: selection.recipeId }, this.cafeSource);
    if (!begun.ok) throw new Error(begun.message);
    this.cafeSession = begun.sessionId;
    this.cafeStyle = begun.style;
    this.signature = CAFE_SPECIALS.find((item) => item.id === begun.recipeId) || null;
    this.signatureDish = parseDishKey(begun.dishKey);
    this.signatureServed = 0;
    this.regularAdvanced = false;
    this.regularSpawned = false;
    this.breakfastPair = 0;
    const orderIds = this.cafeStyle === 'breakfast' ? ['coffee', 'donut', 'cake', 'tea', 'macaron', 'sundae'] : ['tea', 'cake', 'coffee', 'donut', 'macaron', 'sundae'];
    if (this.signature) {
      const partner = this.signature.id === 'milk_pudding' ? 'tea' : 'coffee';
      orderIds.splice(orderIds.indexOf(partner), 1); orderIds.unshift(partner);
    }
    const maxMenu = Math.min(6, 2 + this.lv);
    this.menu = orderIds.slice(0, maxMenu - (this.signature ? 1 : 0)).map((id) => FOODS.find((f) => f.id === id));
    if (this.signature) this.menu.push({ id: this.signature.id, name: this.signature.shortName, price: ({ milk_pudding: 10, cherry_yogurt: 11, egg_sandwich: 12 })[this.signature.id] });
    // 招牌不参与售罄事件：一份备货承诺供应完整一局。
    this.soldout = this.modifier?.id === 'soldout' ? randInt(0, this.menu.length - (this.signature ? 2 : 1)) : -1;
    const avail = this.menu.filter((_, idx) => idx !== this.soldout);
    this.specialFood = this.signature ? this.menu.find((f) => f.id === this.signature.id) : pick(avail.length ? avail : this.menu);
    this.tray = [];
    this.trayLatte = [];
    this.stock = this.menu.map(() => 2);
    this.brew = this.menu.map((f) => (BREW.has(f.id) ? { st: 'idle', t: 0 } : null));
    this.piles = [null, null, null];
    this.restock = this.menu.map(() => 0);
    this.customers = [];
    this.spawnT = 0.3;
    this.served = 0;
    this.latteCount = 0;
    this.lost = 0;
    this.npcI = randInt(0, 5);
    this.steamT = 0;
    this.build();
    this.mount();
    this.stopCafeSource = bus.on('stateReplaced', () => this.onExit());
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
    const t = textPlane(`今日主推·${this.specialFood.name}`, { color: '#ffd0de', height: 0.44, size: 58 });
    t.position.set(0, 0.68, 0.11);
    board.add(t);
    this.menu.forEach((f, i) => {
      const m = this.buildFood(f.id);
      m.scale.setScalar(f.id === this.specialFood.id ? 0.72 : 0.62);
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
    // 3D 意式咖啡机与萃茶机（带状态呼吸灯与蒸汽交互）
    this.brewStations = {};
    const esp = group(-2.25, this.topY, 0.16);
    esp.add(box(0.82, 0.72, 0.56, '#ffd6e4', 0, 0, 0, { r: 0.09 }));
    esp.add(cbox(0.72, 0.16, 0.62, '#fff5f8', 0, 0.66, 0.04, { r: 0.05 }));
    esp.add(cyl(0.1, 0.12, 0.16, '#8a6a55', 0, 0.36, 0.28, { seg: 12 }));
    const espLamp = cbox(0.14, 0.14, 0.14, glow('#bfe9ff', '#7fd3ee', 1.2, 1.2), 0.24, 0.66, 0.32, { r: 0.06, cast: false });
    esp.add(espLamp);
    sc.add(esp);
    this.brewStations.coffee = { root: esp, lamp: espLamp, pos: new THREE.Vector3(-2.25, this.topY + 0.75, 0.25) };

    const teaM = group(2.25, this.topY, 0.16);
    teaM.add(cyl(0.34, 0.38, 0.58, '#d9f5e5', 0, 0, 0, { seg: 16 }));
    teaM.add(cyl(0.26, 0.26, 0.22, mat('#ffffff', { opacity: 0.55 }), 0, 0.58, 0, { seg: 16 }));
    const teaLamp = cbox(0.14, 0.14, 0.14, glow('#bfe9ff', '#7fd3ee', 1.2, 1.2), 0, 0.84, 0.22, { r: 0.06, cast: false });
    teaM.add(teaLamp);
    sc.add(teaM);
    this.brewStations.tea = { root: teaM, lamp: teaLamp, pos: new THREE.Vector3(2.25, this.topY + 0.75, 0.25) };

    // 托盘
    this.trayG = group(0, this.topY, 0.18);
    this.trayG.add(box(1.9, 0.07, 0.9, '#ffe9a8', 0, 0, 0, { r: 0.03 }));
    this.trayItems = group(0, 0.07, 0);
    this.trayG.add(this.trayItems);
    sc.add(this.trayG);
    // 暖暖（站在柜台内侧，背对镜头）与大喵店长助理
    this.nikki = new Character(outfitToLook(S.outfit));
    this.nikki.root.position.set(0, 0, 1.55);
    this.nrot = this.nikki.root.rotation.y = REST;
    this.nikki.root.scale.setScalar(1.15);
    sc.add(this.nikki.root);
    this.momo = new Momo();
    this.momo.root.position.set(-3.65, this.topY, 0.12);
    this.momo.root.rotation.y = 0.35;
    this.momo.root.scale.setScalar(0.92);
    sc.add(this.momo.root);
    this.nx = 0;
  }

  mount() {
    this.trayEls = [0, 1, 2].map((idx) => h('button', { type: 'button', class: 'tray-slot', title: '点击撤下这格餐品', onclick: () => this.removeTray(idx) }));
    const foods = this.menu.map((f, i) => {
      const isSpecial = f.id === this.specialFood.id && i !== this.soldout;
      return h('button', { type: 'button', class: 'slot stock' + (isSpecial ? ' special-food' : ''), 'data-cafe-food': f.id, onclick: () => this.add(i) },
        h('span', { class: 'key' }, i + 1),
        isSpecial ? h('span', { class: 'special-tag' }, this.signature ? '自制招牌' : '主推+25%') : null,
        h('img', { src: this.foodIcon(f.id), alt: '' }),
        h('b', {}, f.name),
        BREW.has(f.id) ? h('span', { class: 'bst' }, BREW_TXT.idle) : h('div', { class: 'pips' }, h('i'), h('i'), h('i')),
        h('div', { class: 'rs' }, h('i')));
    });
    this.foodEls = foods;
    const bar = (this.barEl = h('div', { class: 'gbar card cafebar' + (this.menu.length > 3 ? ' many' : '') },
      h('div', { class: 'gfoods', style: { '--n': foods.length } }, ...foods),
      h('div', { class: 'sep' }),
      h('div', { class: 'gtray' }, ...this.trayEls),
      h('button', { class: 'btn sm', onclick: () => this.smartServe(), title: '智能上菜 / 收噗灵 (空格)' }, '⚡上菜'),
      h('button', { class: 'btn alt sm', onclick: () => this.clear(), title: '清空托盘 (X)' }, svg('close'), '清空')));
    this.bubbles = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.serviceNote = h('div', { class: 'cafe-service-note', 'data-cafe-service-note': '' }, this.serviceText());
    bar.append(this.serviceNote);
    this.mountHUD([this.bubbles, bar]);
    fitToScreen(this.barEl, this.abort.signal, 0.48);
    this.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      const d = /^Digit([1-6])$/.exec(e.code);
      if (d) this.add(Number(d[1]) - 1);
      const k = ['KeyQ', 'KeyW', 'KeyE'].indexOf(e.code);
      if (k >= 0) this.serve(k);
      if (e.code === 'Space') { e.preventDefault(); this.smartServe(); }
      if (e.code === 'KeyX' || e.code === 'Backspace') this.clear();
    });
  }

  foodIcon(id) {
    return id === this.signature?.id ? cafeDishIcon(id, this.signatureDish?.quality, this.signatureDish?.variant) : foodIco(id);
  }
  buildFood(id) {
    if (id !== this.signature?.id) return FOOD_BUILD[id]();
    const wrapper = group();
    const dish = createDish(id, { quality: this.signatureDish?.quality || 'normal', variant: this.signatureDish?.variant === 'milky' ? 'milk' : 'base' });
    dish.scale.setScalar(1.6);
    wrapper.add(dish);
    return wrapper;
  }
  serviceText() {
    const name = CAFE_STYLES.find((style) => style.id === this.cafeStyle)?.name || '悠闲下午茶';
    return `${name} · ${this.signature ? this.regularAdvanced ? '小满记住了这次招待' : `${this.signature.shortName}供应整局` : '常规菜单'}`;
  }
  closeCafeSession() {
    if (!this.cafeSession) return;
    const result = applyCafeSpecialAction({ type: 'end', sessionId: this.cafeSession }, this.cafeSource);
    if (result.ok) { this.cafeSession = null; this.cafeRefunded = result.refunded; }
    else ui.toast(result.message, { dedupeKey: 'cafe-session-save' });
  }
  onExit() {
    this.stopCafeSource?.();
    this.stopCafeSource = null;
    this.closeCafeSession();
    super.onExit();
  }

  smartServe() {
    if (!this.playing) return;
    if (this.tray.length) {
      const key = this.tray.slice().sort().join();
      const candidates = this.customers.filter((c) => c.state === 'wait' && c.soldWait === undefined && c.key === key);
      if (candidates.length) {
        candidates.sort((a, b) => a.patience - b.patience);
        this.serve(candidates[0].slot);
        return;
      }
    }
    const pileIdx = this.piles.findIndex((p) => !!p);
    if (pileIdx >= 0) {
      this.collect(pileIdx);
      return;
    }
    audio.sfx('error');
  }

  canMomoSkill() {
    return this.menu.some((_, i) => i !== this.soldout && (this.brew[i] ? this.brew[i].st !== 'ready' || this.brew[i].t > 0 : this.stock[i] < 3))
      || this.piles.some(Boolean) || this.customers.some((c) => c.state === 'wait' && c.patience < c.max);
  }
  onMomoSkill() {
    if (!this.playing || !this.canMomoSkill()) return false;
    // 大喵咖啡师绝活：全备货补满、冲泡机瞬间进入黄金拉花期、一键收走全柜台噗灵、安抚全体客人耐心 +35%
    this.menu.forEach((f, i) => {
      if (i === this.soldout) return;
      const br = this.brew[i];
      if (br) { br.st = 'ready'; br.t = 0; }
      else { this.stock[i] = 3; this.restock[i] = 0; }
    });
    this.syncStock();
    for (let i = 0; i < 3; i++) if (this.piles[i]) this.collect(i, false);
    for (const c of this.customers) {
      if (c.state === 'wait') {
        c.patience = Math.min(c.max, c.patience + c.max * 0.35);
        fx.hearts(this.scene, c.ch.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 4);
      }
    }
    this.floatAt(new THREE.Vector3(0, this.topY + 1.5, 0), '🐾 大喵拉花绝活：全满备货 + 耐心恢复！', 'good');
    return true;
  }

  removeTray(idx) {
    if (!this.playing || !this.tray[idx]) return;
    const removedId = this.tray.splice(idx, 1)[0];
    this.trayLatte.splice(idx, 1);
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
    let isLatte = false;
    if (br) {
      // 冲泡机：点一下开始 → 好了再点取杯（前 3.5 秒为黄金拉花期）→ 放太久会煮过头，要清理
      if (br.st === 'idle') {
        br.st = 'brewing'; br.t = 0; audio.sfx('water');
        const st = this.brewStations[this.menu[i].id];
        if (st) popIn(st.root, 0.22, 0.85, 1);
      } else if (br.st === 'burnt') {
        br.st = 'idle'; br.t = 0; audio.sfx('remove');
      } else if (br.st === 'brewing' || this.tray.length >= 3) {
        audio.sfx('error'); return;
      }
      this.syncStock();
      if (br.st !== 'ready') return;
      isLatte = br.t <= 3.5;
      br.st = 'idle';
      br.t = 0;
      this.syncStock();
      if (isLatte) {
        this.latteCount++;
        const st = this.brewStations[this.menu[i].id];
        if (st) {
          fx.sparkle(this.scene, st.pos, 8, ['#ffd76a', '#ff9fbd', '#ffffff']);
          this.floatAt(st.pos, '✨黄金拉花!', 'good');
        }
      }
    } else {
      if (this.tray.length >= 3) return;
      if (this.stock[i] <= 0) { audio.sfx('error'); return; }
      this.stock[i]--;
      this.syncStock();
    }
    this.tray.push(this.menu[i].id);
    this.trayLatte.push(isLatte);
    audio.sfx('pop', this.tray.length + (isLatte ? 2 : 0));
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
        const isGolden = br.st === 'ready' && br.t <= 3.5;
        el.querySelector('.bst').textContent = sold ? '今日售罄' : isGolden ? BREW_TXT.golden : BREW_TXT[br.st];
        el.dataset.brew = isGolden ? 'golden' : br.st;
        const st = this.brewStations[this.menu[i].id];
        if (st?.lamp?.material) {
          const col = br.st === 'idle' ? '#7fd3ee' : br.st === 'brewing' ? '#ffd76a' : isGolden ? '#ff85b3' : br.st === 'ready' ? '#6fcf9f' : '#ff5e6c';
          st.lamp.material.color.set(col);
          if (st.lamp.material.emissive) st.lamp.material.emissive.set(col);
        }
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
    this.trayLatte.length = 0;
    audio.sfx('remove');
    this.syncTray();
  }
  syncTray() {
    this.trayEls.forEach((el, i) => {
      el.disabled = !this.tray[i];
      el.classList.toggle('latte', !!this.trayLatte[i]);
      el.replaceChildren(...(this.tray[i] ? [
        h('img', { src: this.foodIcon(this.tray[i]), alt: '' }),
        this.trayLatte[i] ? h('span', { class: 'latte-tag' }, '✨') : null,
      ] : []));
    });
    while (this.trayItems.children.length) { const old = this.trayItems.children[0]; this.trayItems.remove(old); disposeSceneResources(old); }
    this.tray.forEach((id, i) => {
      const m = this.buildFood(id);
      m.position.set(-0.6 + i * 0.6, 0, 0);
      m.scale.setScalar(this.trayLatte[i] ? 1.02 : 0.9);
      this.trayItems.add(m);
      if (i === this.tray.length - 1) popIn(m, 0.25, 0, this.trayLatte[i] ? 1.02 : 0.9);
    });
    const key = this.tray.slice().sort().join();
    for (const c of this.customers) if (c.el) c.el.classList.toggle('ready', c.state === 'wait' && c.key === key);
  }

  spawn() {
    const used = new Set(this.customers.filter((c) => c.state !== 'out').map((c) => c.slot));
    this.piles.forEach((p, i) => p && used.add(i));
    const free = [0, 1, 2].filter((s) => !used.has(s));
    if (!free.length) return false;
    // 招牌首客坐中间柜台，为左右两侧的既有技能与收益 HUD 留出空间。
    const slot = this.signature && !this.regularSpawned && free.includes(1) ? 1 : pick(free);
    const elapsed = this.elapsed;
    const regular = !!this.signature && !this.regularSpawned;
    const available = this.menu.filter((_, index) => index !== this.soldout);
    const drinks = available.filter((food) => BREW.has(food.id));
    const meals = available.filter((food) => !BREW.has(food.id));
    let order;
    if (regular) {
      this.regularSpawned = true;
      const partner = this.signature.id === 'milk_pudding' ? 'tea' : 'coffee';
      const drink = drinks.find((food) => food.id === partner) || drinks[0];
      order = (this.cafeStyle === 'breakfast' || this.signature.id === 'egg_sandwich') && drink ? [drink.id, this.signature.id] : [this.signature.id];
    } else if (this.cafeStyle === 'breakfast' && drinks.length && meals.length) {
      // 两位客人连续点同一套早餐，玩家可以预判下一份的冲泡与备料顺序。
      const pair = Math.floor(this.breakfastPair++ / 2);
      order = [drinks[pair % drinks.length].id, meals[pair % meals.length].id];
    } else if (this.cafeStyle === 'teatime' && elapsed > 10 && drinks.length && meals.length && Math.random() < .7) {
      order = [pick(drinks).id, pick(meals).id];
    } else {
      const maxN = elapsed < 12 ? 1 : this.cafeStyle === 'teatime' ? 2 : 3;
      const n = Math.min(maxN, Math.random() < .35 ? 1 : Math.random() < .6 ? 2 : 3);
      order = Array.from({ length: n }, () => pick(this.menu).id);
    }
    const n = order.length;
    const ch = new Character(randomNpcLook(regular ? 0 : this.npcI++));
    ch.root.scale.setScalar(1.25);
    ch.root.position.set(12.4, 0, -3.1);
    this.scene.add(ch.root);
    // 保留贵客、评论家、急客与普通居民。招牌小满有自己的首单和回应。
    const vip = !regular && (this.modifier?.id === 'vip' || (elapsed > 10 && Math.random() < 0.15));
    const critic = !regular && !vip && elapsed > 14 && Math.random() < 0.14;
    const hurry = !regular && !vip && !critic && elapsed > 8 && Math.random() < 0.14;
    const resident = regular ? '小满' : !vip && !critic && !hurry && Math.random() < 0.22 ? pick(['小满', '阿禾', '阿絮', '小桃', '七七']) : null;
    const patience = (22.5 - this.lv * 0.8 + n * 4) * (vip ? 0.78 : hurry ? 0.82 : 1) * (1 + this.fx('bubble')) * (this.cafeStyle === 'teatime' ? 1.22 : 1.04);
    if (vip || critic) {
      const gm = mat(critic ? '#ff9fbd' : '#ffd76a', { rough: 0.3, metal: 0.5 });
      const cr = group(0, 0.72, 0, cyl(0.2, 0.2, 0.09, gm, 0, 0, 0, { seg: 12 }));
      for (let k = 0; k < 5; k++) cr.add(cbox(0.08, 0.14, 0.08, gm, Math.sin(k * 1.257) * 0.15, 0.13, Math.cos(k * 1.257) * 0.15, { r: 0.02 }));
      ch.head.add(cr);
    }
    const c = { ch, slot, order, vip, critic, hurry, resident, regular, key: order.slice().sort().join(), state: 'in', patience, max: patience, path: [[SLOTS[slot], -3.1], [SLOTS[slot], -1.5]], el: null };
    this.customers.push(c);
    return true;
  }
  showBubble(c) {
    c.pt = h('i');
    const tagText = c.regular ? '小满 · 来尝招牌' : c.vip ? '贵客 ×2' : c.critic ? '🧁评论家·鼓舞' : c.hurry ? '⚡急客·加时' : c.resident ? `${c.resident} +30%` : null;
    c.el = h('div', { role: 'button', tabindex: '0', 'aria-label': `${c.resident || '客人'}的订单`, 'data-cafe-customer': String(c.slot), 'data-cafe-regular': c.regular ? 'man' : null, class: 'bubble' + (tagText ? ' vip' : '') + (c.regular ? ' cafe-regular' : ''), onclick: () => this.serve(c.slot), onkeydown: (e) => { if (e.code === 'Enter') this.serve(c.slot); } },
      tagText ? h('span', { class: 'viptag' }, tagText) : null,
      h('span', { class: 'kbd' }, KEYS[c.slot]),
      h('div', { class: 'its' }, c.order.map((id) => h('img', { src: this.foodIcon(id), alt: this.menu.find((f) => f.id === id)?.name || '' }))),
      c.regular ? h('span', { class: 'cafe-regular-line' }, ['想尝尝你的手艺。', '今天也为这份味道来。', '吃完想去你家坐坐。', '熟悉的味道，真好。'][Math.min(3, getCafeSpecials(this.cafeSource).regularVisits || 0)]) : null,
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
    if (this.signature && c.order.includes(this.signature.id)) {
      const result = applyCafeSpecialAction({ type: 'serve', sessionId: this.cafeSession, npcId: c.regular ? 'man' : undefined }, this.cafeSource);
      if (!result.ok) { ui.toast(result.message, { dedupeKey: 'cafe-session-save' }); return; }
      this.signatureServed++;
      if (c.regular) {
        this.regularAdvanced = result.regularAdvanced;
        const lines = ['谢谢你，这个味道我会记住。', '又吃到了，今天也很开心。', '下次能去你家坐坐吗？', '像回到熟悉的地方一样。'];
        ui.toast(`小满：${lines[getCafeSpecials(this.cafeSource).storyComplete ? 3 : Math.min(2, Math.max(0, (result.regularVisits || 1) - 1))]}`, { life: 4200 });
        this.serviceNote.textContent = this.serviceText();
      }
    }
    const base = c.order.reduce((s, id) => {
      const f = this.menu.find((x) => x.id === id);
      return s + Math.round(f.price * (id === this.specialFood.id ? 1.25 : 1));
    }, 0);
    const ratio = clamp(c.patience / c.max);
    const hasLatte = this.trayLatte.some(Boolean);
    const tipMul = (this.modifier?.id === 'sweet_rush' ? 0.85 : 0.6) + (hasLatte ? 0.35 : 0);
    const mult = c.vip ? 2 : c.critic ? 1.4 : c.resident ? 1.3 : 1;
    let earn = Math.round((base + Math.round(base * tipMul * ratio)) * mult) + Math.min(this.combo, 10) * (this.modifier?.id === 'combo' ? 2 : 1);
    const p = c.ch.root.position;
    if (c.critic && ratio > 0.5) {
      earn += 15;
      for (const other of this.customers) {
        if (other !== c && other.state === 'wait') other.patience = Math.min(other.max, other.patience + other.max * 0.25);
      }
      this.floatAt(new THREE.Vector3(p.x, 2.75, p.z), '🧁好评鼓舞! 全场耐心+25%', 'good');
    } else if (c.hurry && ratio > 0.45) {
      earn += 12;
      if (!this.endless) this.time = Math.min(this.duration, this.time + 2);
      this.floatAt(new THREE.Vector3(p.x, 2.75, p.z), this.endless ? '⚡急客小费 +12!' : '⚡准时送达 +2秒!', 'good');
    } else if (hasLatte) {
      this.floatAt(new THREE.Vector3(p.x, 2.7, p.z), '✨黄金拉花 +35%!', 'good');
    }
    this.dropPile(slot, earn);
    this.setCombo(this.combo + 1);
    this.served++;
    audio.sfx('serve');
    fx.sparkle(this.scene, new THREE.Vector3(p.x, 1.9, p.z + 0.6), 10);
    if (ratio > 0.6 || hasLatte) fx.hearts(this.scene, new THREE.Vector3(p.x, 2.4, p.z), 4);
    this.leave(c, true);
    this.tray.length = 0;
    this.trayLatte.length = 0;
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
    this.closeCafeSession();
    for (let i = 0; i < 3; i++) this.collect(i, true);
    for (const c of this.customers) if (c.state !== 'out') this.leave(c, true);
    this.nikki.setPose('cheer');
    this.poseT = 9;
    this.nrot = 0.8;
  }
  resultLines() {
    const res = [['营业额', this.score], ['接待客人', `${this.served} 位`], ['最高连击', '×' + (this.maxCombo || 0)]];
    if (this.latteCount > 0) res.push(['黄金拉花', `${this.latteCount} 杯`]);
    res.push(['营业风格', CAFE_STYLES.find((style) => style.id === this.cafeStyle)?.name || '悠闲下午茶']);
    if (this.signature) {
      res.push(['自制招牌', this.signatureServed ? `送出 ${this.signatureServed} 单 · 仅用 1 份` : this.cafeRefunded ? '未送出，已退回厨房' : '未送出，备货保留中']);
      const memories = getCafeSpecials(this.cafeSource);
      res.push(['小满的相遇', memories.storyComplete ? '家园茶叙已珍藏' : `${memories.regularVisits} / 3${memories.regularVisits >= 3 ? ' · 可以邀请来家里' : ''}`]);
    }
    return res;
  }

  tick(dt) {
    // 暖暖与大喵
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
    this.momo?.update(dt);
    this.trayItems?.traverse((part) => { if (part.userData?.kind === 'homestead-dish') animateDish(part, this.elapsed); });

    if (this.state === 'play') {
      this.steamT += dt;
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
          const prevGolden = br.st === 'ready' && br.t <= 3.5;
          br.t += dt;
          if (br.st === 'brewing') {
            bar.style.transform = `scaleX(${Math.min(1, br.t / need)})`;
            if (br.t >= need) {
              br.st = 'ready'; br.t = 0; audio.sfx('pop', 4); this.syncStock();
              const st = this.brewStations[f.id];
              if (st) fx.sparkle(this.scene, st.pos, 5, ['#ffd76a', '#ffffff']);
            }
          } else if (br.st === 'ready') {
            bar.style.transform = `scaleX(${Math.max(0, 1 - br.t / 9.5)})`;
            if (prevGolden && br.t > 3.5) this.syncStock();
            if (br.t >= 9.5) { br.st = 'burnt'; audio.sfx('error'); this.syncStock(); }
          }
          return;
        }
        if (this.stock[i] >= 3) { bar.style.transform = 'scaleX(0)'; return; }
        const need = (1.5 + i * 0.22 - this.lv * 0.06) * 0.75 * Math.pow(0.6, this.perks.restock || 0) * (this.cafeStyle === 'breakfast' ? .85 : 1);
        this.restock[i] += dt;
        bar.style.transform = `scaleX(${Math.min(1, this.restock[i] / need)})`;
        if (this.restock[i] >= need) { this.restock[i] = 0; this.stock[i]++; this.syncStock(); }
      });
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const ok = this.spawn();
        const pace = Math.max(2.4, (6.1 - this.lv * 0.4 - Math.min(this.elapsed, 75) * 0.02) / this.pressure) * (this.modifier?.id === 'rush' && this.elapsed < 30 ? 0.5 : 1); // 关卡越靠后 / 无尽撑得越久，客人来得越密
        this.spawnT = ok ? rand(pace * 0.75, pace * 1.15) * (this.cafeStyle === 'teatime' ? 1.18 : .94) : 0.6;
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
        const bubbleBottom = Math.max(145, barTop - 44);
        const topHudBottom = c.regular ? this.hudEl.querySelector('.gtop').getBoundingClientRect().bottom : 0;
        const minBubbleBottom = c.regular ? Math.min(bubbleBottom, Math.max(128, topHudBottom + c.el.offsetHeight + 10)) : 128;
        c.el.style.top = clamp(sp.y, minBubbleBottom, bubbleBottom) + 'px';
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

