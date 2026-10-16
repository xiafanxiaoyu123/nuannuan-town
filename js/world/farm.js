// 后院菜地：田地本身是装修里的一种"家具"，想开垦在哪就摆在哪。
// 这里负责田里的东西：普通田（plot）种作物，果树田（bigplot）种果树；按真实时间生长，离开去打工时也在长。
// 另外还有两位帮手：自动喷水器（给紧挨着的一圈浇水）和大喵（在后院会自己找没浇水的田去浇）。
import { THREE, cbox, box, group, mat, disposeSceneResources } from '../core/kit.js';
import { cropModel } from '../models/items.js';
import { CROP, CROPS, FRUIT, FRUITS, CLOTHES } from '../data.js';
import { S, bus, spend, stat, save, addCoins } from '../core/state.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { popIn, tween, ease } from '../core/util.js';
import { outfitFx } from '../live/effects.js';
import { fertilizerCount, useFertilizer } from '../shared/save-compat.js';

const SOIL = mat('#b08566'), SOIL_WET = mat('#8a6048');
const keyOf = (e) => e.gx + ',' + e.gz;
// 沿用原能力套装的三件门槛；草帽是可选饰品，未拥有时不会临时借用。
const HARVEST_PARTS = ['hair', 'dress', 'shoes'].map(cat => CLOTHES.find(c => c.set === 'basket' && c.cat === cat));
const HARVEST_HAT = CLOTHES.find(c => c.set === 'basket' && c.cat === 'acc');
const isBig = (rec) => rec.e.id === 'bigplot';
const SPRINKLER_RANGE = 1; // 喷水器占 2×2，能照顾到紧挨着它的一圈

export function plotStage(p) {
  if (!p) return -1;
  const k = (Date.now() - p.t0) / p.dur;
  return k >= 1 ? 3 : k >= 0.5 ? 2 : k >= 0.15 ? 1 : 0;
}
export const plotRemain = (p) => Math.max(0, Math.ceil((p.t0 + p.dur - Date.now()) / 1000));

// 果树现在的状态：stage 0 幼苗 / 1 小树 / 2 大树；ripe 有没有果子可摘；n 这一轮能摘几个；remain 距离下一件事还有几秒
export function treeInfo(p) {
  const f = FRUIT[p.tree], now = Date.now(), age = (now - p.t0) / 1000;
  const stage = age < f.grow ? 0 : age < f.big ? 1 : 2;
  let ripe = false, remain;
  if (stage === 0) remain = f.grow - age;
  else {
    const since = (now - Math.max(p.last || 0, p.t0 + f.grow * 1000)) / 1000;
    const cycle = f.cycle * (1 - outfitFx(S.outfit, 'dawn'));
    ripe = since >= cycle;
    remain = cycle - since;
  }
  const ep = stage + ':' + (p.last || 0); // 每个阶段、每一轮果子只能浇一次水
  return { f, stage, ripe, n: stage === 2 ? 3 : 1, remain: Math.max(0, Math.ceil(remain)), thirsty: !ripe && p.wep !== ep, ep };
}

// 果树模型：幼苗一根小杆两片叶；小树一团树冠；大树三团树冠。熟了挂果，大树的果子更大
function treeModel(f, stage, ripe) {
  const g = group();
  if (stage === 0) {
    g.add(box(0.1, 0.7, 0.1, '#b98b6b', 0, 0, 0, { r: 0.03 }));
    g.add(cbox(0.36, 0.14, 0.2, f.leaf, 0.16, 0.62, 0, { r: 0.06, rz: 0.4 }), cbox(0.36, 0.14, 0.2, f.leaf, -0.16, 0.5, 0, { r: 0.06, rz: -0.4 }));
    g.add(cbox(0.2, 0.2, 0.2, '#a9e3a0', 0, 0.8, 0, { r: 0.07 }));
    return g;
  }
  const big = stage === 2, th = big ? 1.5 : 0.95, tw = big ? 0.36 : 0.24;
  g.add(box(tw, th, tw, '#b98b6b', 0, 0, 0, { r: 0.07 }));
  const blobs = big ? [[0, th + 0.55, 0, 1.9, 1.5], [-0.7, th + 0.25, 0.3, 1.2, 1.0], [0.72, th + 0.3, -0.25, 1.25, 1.05], [0.1, th + 1.25, 0.1, 1.2, 0.9]] : [[0, th + 0.4, 0, 1.25, 1.05], [0.3, th + 0.85, -0.1, 0.8, 0.65]];
  for (const [x, y, z, w, hh] of blobs) g.add(cbox(w, hh, w, f.leaf, x, y, z, { r: Math.min(w, hh) * 0.38 }));
  if (ripe) {
    const s = big ? 0.34 : 0.24;
    const spots = big ? [[-0.85, th + 0.2, 0.75], [0.2, th + 0.1, 0.98], [0.95, th + 0.35, 0.45]] : [[0.1, th + 0.2, 0.66]];
    for (const [x, y, z] of spots) g.add(cbox(s, s, s, mat(f.color, { emissive: f.color, ei: 0.18 }), x, y, z, { r: s * 0.4 }));
  }
  return g;
}

export class Farm {
  constructor(town) {
    this.town = town;
    this.acc = 0;
    this.sprT = 0;
    this.carry = null;
    this._harvestLook = null;
    this._harvestTimer = null;
    this._harvesting = false;
    if (!S.farm) S.farm = {};
    if (!S.sapling) S.sapling = 'apple';
    // 当前选中的田块高亮框
    this.hl = group();
    const hm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    for (const [w, d, x, z] of [[2.1, 0.08, 0, -1.02], [2.1, 0.08, 0, 1.02], [0.08, 2.1, -1.02, 0], [0.08, 2.1, 1.02, 0]]) this.hl.add(cbox(w, 0.06, d, hm, x, 0.3, z, { r: 0.02, cast: false, receive: false }));
    this.hl.visible = false;
    town.scene.add(this.hl);
    // 手持模型属于临时展示，切换存档或进入装修时不能留在旧角色上。
    for (const event of ['stateReplaced', 'reset']) bus.on(event, () => { this.clearCarry(); this.clearHarvestLook(); });
    bus.on('decorMode', (active) => { if (active) { this.clearCarry(); this.clearHarvestLook(); } });
    bus.on('zoneChanged', () => this.clearHarvestLook());
    globalThis.addEventListener?.('nuannuan:clean-screenshot', () => this.clearHarvestLook());
  }

  // 所有田地 = 后院里的田地与果树田摆件
  recs() {
    const d = this.town.decors && this.town.decors.home;
    return d ? d.entries.filter((r) => r.e.id === 'plot' || r.e.id === 'bigplot') : [];
  }
  state(rec) {
    return S.farm[keyOf(rec.e)] || null;
  }
  hasCrop(e) {
    return !!S.farm[keyOf(e)];
  }
  giantIds() {
    return Object.keys(S.decor || {}).filter((id) => /^giant_/.test(id) && CROP[id.slice(6)]?.giant && (S.decor[id] || 0) > 0);
  }
  hasGiant() { return this.giantIds().length > 0; }
  // 巨大作物既进入装修仓库，也可以挂在暖暖手上随行展示；展示不会消耗仓库数量。
  clearCarry() {
    if (!this.carry) return false;
    const model = this.carry.model;
    if (model?.parent) model.parent.remove(model);
    if (model) disposeSceneResources(model);
    this.carry = null;
    // 拍照或睡觉已经切好姿势时，仅移除作物，避免重新覆盖为站立。
    if (this.town.player?.pose === 'carry') this.town.player.setPose('idle');
    bus.emit('giantCarryChanged', null);
    return true;
  }
  stowCarry() {
    if (!this.clearCarry()) return false;
    bus.emit('toast', '已收起巨大作物，摆件仍保留在装修仓库');
    return true;
  }
  syncCarry() {
    if (!this.carry) return;
    // 出售最后一件或将其摆放后，展示不能继续持有已经离开仓库的物品。
    if (!(S.decor?.[this.carry.id] > 0) || this.town.decor?.active || this.town.photoOn ||
      this.town.homeInteractions?.bedState || this.town.homeInteractions?.seated || this.town.camMode === 'title') this.clearCarry();
  }
  showOff(id = this.giantIds()[0], { toggle = true } = {}) {
    if (!id || !/^giant_/.test(id) || !(S.decor?.[id] > 0) || !this.town.player?.root) return false;
    const cropId = id.replace(/^giant_/, '');
    if (!CROP[cropId]?.giant) return false;
    if (this.carry?.id === id && toggle) return this.stowCarry();
    if (this.town.decor?.active || this.town.photoOn || this.town.homeInteractions?.bedState || this.town.homeInteractions?.seated) return false;
    this.clearCarry();
    const model = cropModel(cropId, 3);
    model.scale.setScalar(0.88);
    model.position.set(0.42, 1.06, 0.34);
    model.rotation.y = -0.3;
    model.userData.giantCarry = true;
    this.town.player.root.add(model);
    this.carry = { id, model };
    this.town.player.setPose('carry');
    bus.emit('giantCarryChanged', { id, name: CROP[cropId].name });
    bus.emit('toast', `拿起${CROP[cropId].name}，到处炫耀一下吧！点击“收起巨大作物”可结束展示`);
    return true;
  }
  // 检查田块周围是否有蜂箱或大喵稻草人守护 (I2)
  fieldAura(rec) {
    const entries = this.town.decors?.home?.entries || [];
    let beehive = false, scarecrow = false;
    const rx = rec.obj.position.x, rz = rec.obj.position.z;
    for (const s of entries) {
      if (s.e.id !== 'beehive' && s.e.id !== 'scarecrow') continue;
      if (Math.hypot(s.obj.position.x - rx, s.obj.position.z - rz) <= 5.2) {
        if (s.e.id === 'beehive') beehive = true;
        if (s.e.id === 'scarecrow') scarecrow = true;
      }
    }
    return { beehive, scarecrow };
  }
  // 这块田现在缺不缺水（喷水器和大喵用）
  thirsty(rec) {
    const p = this.state(rec);
    if (!p) return false;
    return p.tree ? treeInfo(p).thirsty : plotStage(p) < 3 && !p.watered;
  }
  ensure(rec) {
    if (rec.farm) return rec.farm;
    const holder = group(0, 0.22, 0);
    const ind = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: '#ffd24f', emissive: '#ffd24f', emissiveIntensity: 1, roughness: 0.3 }));
    ind.position.y = 1.6;
    rec.obj.add(holder, ind);
    rec.farm = { holder, ind, key: null };
    return rec.farm;
  }
  refresh(rec, force) {
    const f = this.ensure(rec);
    const p = this.state(rec);
    let key = '', wet = false, build = null;
    if (p && p.tree) {
      const t = treeInfo(p);
      key = p.tree + t.stage + (t.ripe ? 'r' : '') + (t.thirsty ? '' : 'w');
      wet = !t.thirsty && !t.ripe;
      build = () => f.holder.add(treeModel(t.f, t.stage, t.ripe));
    } else if (p) {
      const st = plotStage(p);
      key = p.crop + st + (p.giant ? 'G' : '') + (p.shiny ? 'S' : '') + (p.watered ? 'w' : '');
      wet = p.watered;
      build = () => {
        // 一块田种 4 株（南瓜长大后只留一个大的）
        const one = st >= 2 && p.crop === 'pumpkin';
        for (const [ox, oz] of one ? [[0, 0]] : [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
          const m = cropModel(p.crop, st);
          m.position.set(ox, 0, oz);
          m.scale.setScalar(p.giant ? (st >= 3 ? 3.25 : 1.8) : (one ? 2.3 : p.shiny && st >= 2 ? 1.38 : 1.25));
          m.rotation.y = (ox * 7 + oz * 3) % 1;
          f.holder.add(m);
        }
      };
    }
    if (key === f.key && !force) return;
    const grew = f.key !== null && f.key !== '' && key !== '' && !force && f.key.replace('w', '') !== key.replace('w', '');
    f.key = key;
    const soil = rec.obj.userData.soil;
    if (soil) soil.material = wet ? SOIL_WET : SOIL;
    while (f.holder.children.length) f.holder.remove(f.holder.children[0]);
    if (!build) return;
    build();
    if (grew) {
      f.holder.scale.setScalar(0.7);
      tween({ dur: 0.45, ease: ease.outBack, update: (k) => f.holder.scale.setScalar(0.7 + 0.3 * k) });
    }
  }
  refreshAll() {
    for (const r of this.recs()) this.refresh(r, true);
  }

  nearest(px, pz, range) {
    let best = null, bd = 1e9;
    for (const r of this.recs()) {
      const d = Math.hypot(r.obj.position.x - px, r.obj.position.z - pz) - (isBig(r) ? 0.6 : 0);
      if (d < range && d < bd) { bd = d; best = r; }
    }
    return best;
  }
  // 站在哪种田边：farm 普通田 / orchard 果树田（界面据此切换种子栏）
  zoneAt(x, z) {
    if (this.town.zone !== 'home') return null;
    const r = this.nearest(x, z, 3);
    return r ? (isBig(r) ? 'orchard' : 'farm') : null;
  }
  inZone(x, z) {
    return !!this.zoneAt(x, z);
  }
  pickSeed(idx) {
    if (!CROPS[idx]) return;
    S.seed = CROPS[idx].id;
    audio.sfx('tab');
    bus.emit('seed', S.seed);
    save();
  }
  pickSapling(idx) {
    if (!FRUITS[idx]) return;
    S.sapling = FRUITS[idx].id;
    audio.sfx('tab');
    bus.emit('seed', S.seed);
    save();
  }

  interactable(px, pz) {
    const rec = this.town.zone === 'home' ? this.nearest(px, pz, 1.7) : null;
    if (!rec) { this.hl.visible = false; return null; }
    const x = rec.obj.position.x, z = rec.obj.position.z, big = isBig(rec);
    this.hl.visible = true;
    this.hl.position.set(x, 0, z);
    this.hlBase = big ? 1.5 : 1;
    const p = this.state(rec);
    const it = { id: 'plot' + keyOf(rec.e), x, z, r: big ? 2.4 : 1.7, prio: 0.6 };
    if (big) {
      if (!p) {
        const f = FRUIT[S.sapling] || FRUITS[0];
        it.label = `种下 · ${f.tree}苗 (${f.price})`;
        it.sub = '果树种下后不用重种，会一直结果';
        it.act = () => this.plantTree(rec);
      } else {
        const t = treeInfo(p), name = ['幼苗', '小树', '大树'][t.stage];
        if (t.ripe) { it.label = `摘果子 · ${t.f.name} ×${t.n}`; it.act = () => this.pickFruit(rec); }
        else if (t.thirsty) { it.label = '浇水 · 长得更快'; it.sub = t.stage === 0 ? `${t.f.tree}${name} · ${t.remain} 秒后长成小树` : `${t.f.tree}（${name}）· ${t.remain} 秒后结果`; it.act = () => this.water(rec); }
        else { it.label = t.stage === 0 ? `${t.f.tree}${name} · ${t.remain} 秒后长成小树` : `${t.f.tree}（${name}）· ${t.remain} 秒后结果`; it.act = null; }
      }
      return it;
    }
    if (!p) {
      const c = CROP[S.seed];
      const inSeason = c.season && c.season === this.town.seasons?.current;
      it.label = `播种 · ${c.name} (${S.seeds[c.id] > 0 ? '免费种子 ×' + S.seeds[c.id] : c.seed})`;
      it.sub = (inSeason ? '【当季加速】' : '') + c.tip;
      it.act = () => this.plant(rec);
    } else {
      const st = plotStage(p), c = CROP[p.crop];
      if (st >= 3) {
        it.label = `收获 · ${p.shiny ? '闪耀' : ''}${c.name}${(c.yield || 1) > 1 ? ' ×' + c.yield : ''}`;
        it.act = () => this.harvest(rec);
      } else if (!p.watered) {
        it.label = '浇水 · 加速生长';
        it.sub = `${c.name} 还需 ${plotRemain(p)} 秒`;
        it.act = () => this.water(rec);
      } else if (!p.fertilized && fertilizerCount(S) > 0) {
        it.label = `撒有机花肥 (剩 ${fertilizerCount(S)} 袋)`;
        it.sub = `加速成熟并提高闪耀金星产出率 · 还需 ${plotRemain(p)} 秒`;
        it.act = () => this.fertilize(rec);
      } else {
        it.label = `${p.fertilized ? '已施肥 · ' : ''}${c.name} 生长中 · 还需 ${plotRemain(p)} 秒`;
        it.act = null;
      }
    }
    return it;
  }

  fertilize(rec) {
    const p = this.state(rec);
    if (!p || p.tree || p.fertilized || plotStage(p) >= 3 || !useFertilizer(S)) return false;
    const now = Date.now(), remain = Math.max(0, p.t0 + p.dur - now);
    p.dur = now - p.t0 + Math.round(remain * 0.72);
    p.fertilized = true;
    if (!p.shiny && Math.random() < 0.35) p.shiny = true;
    const pos = rec.obj.position;
    this.town.face(pos.x, pos.z);
    this.town.act('pick', 0.45);
    audio.sfx('sparkle');
    fx.sparkle(this.town.scene, new THREE.Vector3(pos.x, 0.8, pos.z), 8, ['#ffe27a', '#a8e380', '#ffffff']);
    bus.emit('float', { x: pos.x, y: 1.5, z: pos.z, text: '有机花肥 · 加速生长！', cls: 'good' });
    this.refresh(rec, true);
    save();
    return true;
  }

  plant(rec) {
    if (isBig(rec) || this.state(rec)) return;
    const c = CROP[S.seed];
    if (S.seeds[c.id] > 0) {
      S.seeds[c.id]--;
      save();
      bus.emit('seed', S.seed);
    } else if (!spend(c.seed)) return;
    const pos = rec.obj.position;
    const aura = this.fieldAura(rec);
    const inSeason = c.season && c.season === this.town.seasons?.current;
    const growMul = (inSeason ? 0.85 : 1) * (aura.beehive ? 0.9 : 1);
    const giantChance = aura.scarecrow ? 0.012 : 0.005;
    const shinyChance = aura.scarecrow ? 0.14 : 0.06;
    // 只在播种时抽一次签，避免每帧或每次浇水改变结果；未标记 giant 的作物永远不会变大。
    S.farm[keyOf(rec.e)] = {
      crop: c.id,
      t0: Date.now(),
      dur: Math.round(c.grow * growMul * 1000),
      watered: false,
      giant: !!c.giant && Math.random() < giantChance,
      shiny: Math.random() < shinyChance,
    };
    this.town.face(pos.x, pos.z);
    this.town.act('pick', 0.45);
    audio.sfx('plant');
    fx.burst(this.town.scene, new THREE.Vector3(pos.x, 0.3, pos.z), { n: 6, colors: ['#b08566', '#8a6048'], speed: 1.2, up: 2, life: 0.5, size: 0.6 });
    this.refresh(rec, true);
    popIn(rec.farm.holder, 0.35);
    stat('planted');
  }
  // 铲除果树：树没了，田空出来，可以重新种或搬动。种树的钱不退
  removeTree(rec) {
    const p = this.state(rec);
    if (!p || !p.tree) return false;
    const pos = rec.obj.position;
    delete S.farm[keyOf(rec.e)];
    audio.sfx('plant');
    fx.burst(this.town.scene, new THREE.Vector3(pos.x, 0.5, pos.z), { n: 10, colors: ['#b08566', '#8a6048', '#7fbf6a'], speed: 1.4, up: 2, life: 0.55, size: 0.6 });
    this.refresh(rec, true);
    save();
    return true;
  }
  plantTree(rec) {
    const f = FRUIT[S.sapling] || FRUITS[0];
    if (!spend(f.price)) return;
    const pos = rec.obj.position;
    S.farm[keyOf(rec.e)] = { tree: f.id, t0: Date.now(), last: 0 };
    this.town.face(pos.x, pos.z);
    this.town.act('pick', 0.45);
    audio.sfx('plant');
    fx.burst(this.town.scene, new THREE.Vector3(pos.x, 0.3, pos.z), { n: 8, colors: ['#b08566', '#8a6048', f.leaf], speed: 1.3, up: 2.2, life: 0.55, size: 0.6 });
    this.refresh(rec, true);
    popIn(rec.farm.holder, 0.35);
    stat('planted');
    stat('trees');
  }
  // 浇水的实际效果（玩家、喷水器、大喵共用）；返回是否真的浇了
  applyWater(rec) {
    const p = this.state(rec);
    if (!p) return false;
    const now = Date.now();
    if (p.tree) {
      const t = treeInfo(p);
      if (!t.thirsty) return false;
      // 幼苗：成长时间缩短三成；结果期：这一轮缩短四成
      const cut = t.remain * 1000 * (t.stage === 0 ? 0.3 : 0.4);
      if (t.stage === 0) p.t0 -= cut;
      else p.last = Math.max(p.last || 0, p.t0 + t.f.grow * 1000) - cut;
      p.wep = treeInfo(p).ep;
    } else {
      if (p.watered || plotStage(p) >= 3) return false;
      const remain = Math.max(0, p.t0 + p.dur - now);
      p.dur = now - p.t0 + remain * (CROP[p.crop].water ?? 0.6);
      p.watered = true;
    }
    const pos = rec.obj.position;
    fx.burst(this.town.scene, new THREE.Vector3(pos.x, 1.0, pos.z), { n: 12, colors: ['#9be0f0', '#cfeaff', '#ffffff'], speed: 1.1, up: 0.6, gravity: 6, life: 0.6, size: 0.55, spread: isBig(rec) ? 5 : 3.4 });
    this.refresh(rec, true);
    save();
    return true;
  }
  water(rec) {
    const pos = rec.obj.position;
    if (!this.applyWater(rec)) return;
    // 解锁满篮时光后，手动浇水会顺带滋润紧邻的缺水田块 (I4)
    if (this.harvestUnlocked()) {
      for (const other of this.recs()) {
        if (other === rec || !this.thirsty(other)) continue;
        if (Math.hypot(other.obj.position.x - pos.x, other.obj.position.z - pos.z) <= 2.4 && this.applyWater(other)) {
          stat('watered');
        }
      }
    }
    this.town.face(pos.x, pos.z);
    this.town.act('water', 0.7);
    audio.sfx('water');
    stat('watered');
  }
  harvest(rec) {
    const p = this.state(rec), pos = rec.obj.position;
    const c = CROP[p.crop], chance = outfitFx(S.outfit, 'sun');
    const aura = this.fieldAura(rec);
    const inSeason = c.season && c.season === this.town.seasons?.current;
    const bonusYield = (chance > 0 && Math.random() < chance ? 1 : 0) + (aura.beehive && Math.random() < 0.25 ? 1 : 0) + (inSeason && Math.random() < 0.25 ? 1 : 0) + (p.shiny ? 1 : 0);
    const n = (c.yield || 1) + bonusYield;
    const giantId = p.giant ? 'giant_' + p.crop : null;
    if (giantId) {
      // 巨大作物以独立摆件入库，保留普通作物背包不被重复增加。
      S.decor[giantId] = (S.decor[giantId] || 0) + 1;
      bus.emit('found', 'decor', giantId, 1);
      bus.emit('note', `收获了${c.name}！这是罕见的巨大作物，可摆放、展示或卖出普通售价的 20 倍`);
    } else {
      S.crops[p.crop] = (S.crops[p.crop] || 0) + n;
      bus.emit('found', 'crop', p.crop, n);
      if (p.shiny) {
        addCoins(15, 'farm');
      }
    }
    delete S.farm[keyOf(rec.e)];
    this.town.face(pos.x, pos.z);
    this.town.act('pick', 0.45);
    audio.sfx('harvest');
    fx.sparkle(this.town.scene, new THREE.Vector3(pos.x, 0.8, pos.z), 10, [c.color, '#fff3a8', '#ffffff']);
    bus.emit('float', { x: pos.x, y: 1.6, z: pos.z, text: giantId ? `巨大${c.name}！` : p.shiny ? `闪耀${c.name} +${n} (+15噗灵)` : `${c.name} +${n}`, cls: 'good' });
    // 收获只入装修仓库；手持展示由玩家在家园面板主动选择。
    if (giantId) bus.emit('giantCrop', giantId);
    this.refresh(rec, true);
    stat('harvested');
  }
  pickFruit(rec) {
    const p = this.state(rec), pos = rec.obj.position, t = treeInfo(p);
    if (!t.ripe) return;
    S.crops[p.tree] = (S.crops[p.tree] || 0) + t.n;
    bus.emit('found', 'crop', p.tree, t.n);
    p.last = Date.now();
    this.town.face(pos.x, pos.z);
    this.town.act('pick', 0.45);
    audio.sfx('harvest');
    fx.sparkle(this.town.scene, new THREE.Vector3(pos.x, 2, pos.z), 12, [t.f.color, '#fff3a8', '#ffffff']);
    bus.emit('float', { x: pos.x, y: 2.4, z: pos.z, text: `${t.f.name} +${t.n}`, cls: 'good' });
    this.refresh(rec, true);
    stat('harvested');
    stat('fruits', t.n);
    save();
  }

  // 一键采集能力只检查拥有的三件衣物，不依赖玩家当前穿搭。
  harvestUnlocked() {
    return HARVEST_PARTS.every(c => c && S.owned?.includes(c.id));
  }
  get harvestLook() {
    if (this._harvestLook && (this._harvestState !== S || this._harvestOutfit !== JSON.stringify(S.outfit) || !this.harvestUnlocked())) {
      // 主动换装或外部存档替换后，绝不能再显示旧临时搭配。
      this.clearHarvestLook();
    }
    return this._harvestLook;
  }
  clearHarvestLook(refresh = true) {
    clearTimeout(this._harvestTimer);
    this._harvestTimer = null;
    if (!this._harvestLook) return false;
    this._harvestLook = null;
    this._harvestState = null;
    this._harvestOutfit = null;
    if (refresh) this.town.refreshOutfit?.();
    bus.emit('harvestLookChanged');
    return true;
  }
  startHarvestLook() {
    if (this.harvestLook || !this.harvestUnlocked()) return false;
    this._harvestState = S;
    this._harvestOutfit = JSON.stringify(S.outfit);
    this._harvestLook = { ...S.outfit, ...Object.fromEntries(HARVEST_PARTS.map(c => [c.cat, c.id])) };
    if (HARVEST_HAT && S.owned.includes(HARVEST_HAT.id)) this._harvestLook.acc = HARVEST_HAT.id;
    // 只替换角色模型，不写 S.outfit；自动/云端存档永远保存玩家真实搭配。
    this.town.refreshOutfit?.();
    const look = this._harvestLook;
    this._harvestTimer = setTimeout(() => { if (this._harvestLook === look) this.clearHarvestLook(); }, 5000);
    bus.emit('harvestLookChanged');
    return true;
  }
  // 数字按田块统计，一次收完其中所有成熟作物与果子。
  ripeCount() {
    let n = 0;
    for (const rec of this.recs()) { const p = this.state(rec); if (p && (p.tree ? treeInfo(p).ripe : plotStage(p) >= 3)) n++; }
    return n;
  }
  harvestAll() {
    if (!this.harvestUnlocked() || this._harvesting || this.harvestLook || this.town.zone !== 'home' ||
      !this.town.active || this.town.camMode !== 'play' || this.town.modal || this.town.decor.active || this.town.photoOn ||
      globalThis.document?.body?.classList.contains('clean-screenshot') || !this.ripeCount()) return 0;
    this._harvesting = true;
    let n = 0;
    try {
      this.startHarvestLook();
      for (const rec of this.recs()) {
        const p = this.state(rec);
        if (!p) continue;
        if (p.tree) { if (treeInfo(p).ripe) { this.pickFruit(rec); n++; } }
        else if (plotStage(p) >= 3) { this.harvest(rec); n++; }
      }
      if (n) save();
      return n;
    } finally {
      this._harvesting = false;
      if (!n) this.clearHarvestLook();
    }
  }

  // 喷水器：每隔几秒给紧挨着它一圈的、缺水的田浇水
  runSprinklers() {
    const d = this.town.decors && this.town.decors.home;
    if (!d) return;
    const recs = this.recs();
    for (const s of d.entries) {
      if (s.e.id !== 'sprinkler') continue;
      let did = false;
      for (const r of recs) {
        const sz = isBig(r) ? 3 : 2;
        // 两个矩形之间隔了几格（0 = 紧挨着）
        const gapX = Math.max(r.e.gx - (s.e.gx + 2), s.e.gx - (r.e.gx + sz), 0), gapZ = Math.max(r.e.gz - (s.e.gz + 2), s.e.gz - (r.e.gz + sz), 0);
        if (Math.max(gapX, gapZ) >= SPRINKLER_RANGE || !this.thirsty(r)) continue;
        if (this.applyWater(r)) { did = true; stat('watered'); } // 喷水器浇的也计入任务进度
      }
      if (did && this.town.zone === 'home') {
        const p = s.obj.position;
        fx.burst(this.town.scene, new THREE.Vector3(p.x, 1.1, p.z), { n: 18, colors: ['#9be0f0', '#cfeaff', '#ffffff'], speed: 3.2, up: 2.4, gravity: 7, life: 0.8, size: 0.5, spread: 6.3 });
        audio.sfx('water');
      }
    }
  }
  // 大喵找活干：离它最近、缺水的田
  thirstyNear(x, z, range) {
    let best = null, bd = range;
    for (const r of this.recs()) {
      if (!this.thirsty(r)) continue;
      const d = Math.hypot(r.obj.position.x - x, r.obj.position.z - z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  update(dt, time) {
    if (this._harvestLook && (this.town.zone !== 'home' || !this.town.active || this.town.camMode !== 'play' ||
      this.town.decor.active || this.town.photoOn || globalThis.document?.body?.classList.contains('clean-screenshot') ||
      this._harvestState !== S || this._harvestOutfit !== JSON.stringify(S.outfit) || !this.harvestUnlocked())) this.clearHarvestLook();
    // 展示中的巨大作物只在自由游玩时保留；进入装修、拍照或休息会自动收回，避免模型叠在界面上。
    this.syncCarry();
    this.acc += dt;
    const recs = this.recs();
    if (this.acc > 0.4) {
      this.acc = 0;
      for (const r of recs) this.refresh(r);
    }
    if ((this.sprT += dt) > 2.5) { this.sprT = 0; this.runSprinklers(); }
    const editing = this.town.decor.active;
    recs.forEach((r, i) => {
      const f = this.ensure(r), p = this.state(r);
      let ripe = false, thirsty = false, top = 1.75;
      if (p && p.tree) { const t = treeInfo(p); ripe = t.ripe; thirsty = t.thirsty; top = t.stage === 2 ? 3.9 : t.stage === 1 ? 2.7 : 1.5; }
      else if (p) { ripe = plotStage(p) >= 3; thirsty = !ripe && !p.watered; }
      f.ind.visible = (ripe || thirsty) && !editing;
      if (!f.ind.visible) return;
      const col = ripe ? 0xffd24f : 0x7fd0ff;
      f.ind.material.color.setHex(col);
      f.ind.material.emissive.setHex(col);
      f.ind.position.y = (ripe ? top : top - 0.4) + Math.sin(time * 3 + i) * 0.1;
      f.ind.rotation.y = time * 2;
      f.ind.scale.setScalar(ripe ? 1 : 0.7);
    });
    if (this.town.frozen) this.hl.visible = false;
    this.hl.scale.setScalar((this.hlBase || 1) * (1 + Math.sin(time * 5) * 0.02));
  }
}
