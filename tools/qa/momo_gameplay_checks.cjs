// Real MiniGame and five shop methods; renderer/audio/DOM boundaries are in-memory.
// No server, database, player storage, account, network or payment configuration.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
if (!vm.SourceTextModule) {
  const child = require('node:child_process').spawnSync(process.execPath,
    ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), THREE = require('three');
const ids = ['cafe', 'bakery', 'flower', 'fish', 'tailor'];
class Node extends EventTarget {
  constructor(tag = 'div') { super(); this.tagName = tag; this.children = []; this.style = { setProperty(k, v) { this[k] = v; } }; this.dataset = {}; this.attributes = {}; this.classes = new Set(); this.classList = {
    add: (...values) => values.forEach(value => this.classes.add(value)), remove: (...values) => values.forEach(value => this.classes.delete(value)),
    contains: value => this.classes.has(value), toggle: (value, on = !this.classes.has(value)) => { on ? this.classes.add(value) : this.classes.delete(value); return on; },
  }; }
  append(...values) { for (const value of values.flat(Infinity)) if (value !== false && value != null) { const node = typeof value === 'object' ? value : Object.assign(new Node('#text'), { textContent: String(value) }); this.children.push(node); node.parentElement = this; } }
  replaceChildren(...values) { this.children = []; this.append(...values); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(value => value !== this); this.removed = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { const found = [], match = selector.startsWith('.') ? node => node.classes.has(selector.slice(1)) : node => node.tagName === selector;
    for (const child of this.children) { if (match(child)) found.push(child); found.push(...child.querySelectorAll(selector)); } return found; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}
const h = (tag, attributes = {}, ...children) => { const node = new Node(tag); for (const [key, value] of Object.entries(attributes)) {
  if (key === 'class') String(value).split(/\s+/).forEach(name => node.classes.add(name)); else if (key === 'style') Object.assign(node.style, value); else node[key] = value;
} node.append(...children); return node; };

async function main() {
  const checks = [], modules = new Map(), events = [], animations = [], timers = [], window = new EventTarget();
  let random = 0.9; const math = Object.create(Math); math.random = () => random;
  const S = { gday: 0, outfit: {}, shops: Object.fromEntries(ids.map(id => [id, { lv: 1, plays: 0, stars: {}, best: 0, stage: 0 }])), live: {}, seeds: {}, stats: {}, coins: 0 };
  const state = { S, bus: { emit: (...args) => events.push(args) }, addCoins: value => S.coins += value, stat: key => S.stats[key] = (S.stats[key] || 0) + 1,
    styleBonus: () => ({ style: { name: '清新', color: '#fff' }, n: 0, pct: 0 }), flushSave() {} };
  const audio = Object.fromEntries(['sfx', 'pauseMusic', 'resumeMusic', 'startMusic', 'stopMusic'].map(key => [key, () => {}]));
  const effects = Object.fromEntries(['hearts', 'sparkle', 'burst', 'clearScene', 'confetti'].map(key => [key, () => {}]));
  const util = { h, fmt: String, wait: async () => {}, rand: (a, b) => b === undefined ? a / 2 : (a + b) / 2, randInt: a => a, pick: array => array[0],
    clamp: (n, low = 0, high = 1) => Math.max(low, Math.min(high, n)), ease: { linear: n => n }, angleLerp: (a, b) => b, popIn() {}, seeded: () => () => 0.5,
    tween: options => { const tw = { ...options, dead: false, stop() { this.dead = true; } }; animations.push(tw); return tw; } };
  const mesh = () => new THREE.Group();
  const app = { renderer: { renderLists: { dispose() {} } }, project: () => ({ x: 100, y: 100 }) };
  const ui = { root: new Node(), resultPanel: async () => 'exit', tutorials: { cancelView() {} } };
  const substitutes = {
    'js/core/kit.js': { THREE, ...Object.fromEntries(['cbox', 'box', 'cyl', 'group', 'mat', 'glow', 'rboxGeo', 'textPlane', 'frustum'].map(key => [key, mesh])), disposeSceneResources() {} },
    'js/core/app.js': { app }, 'js/core/audio.js': { audio }, 'js/core/fx.js': { fx: effects }, 'js/core/state.js': state,
    'js/core/util.js': util, 'js/ui/ui.js': { ui, svg() {} },
    'js/core/icons.js': Object.fromEntries(['coinIco', 'foodIco', 'fishIco', 'mergeIco'].map(key => [key, () => 'memory:icon'])),
    'js/data.js': { SHOPS: Object.fromEntries(ids.map(id => [id, { name: id, style: 'sweet', color: '#fff' }])), shopMult: () => 1, MAX_STAGE: 30, stageScale: () => 1, FOODS: [] },
    'js/live/effects.js': { outfitFx: () => 0, festivalAt: () => null },
    'js/shared/save-compat.js': { addFertilizer: s => s.stats.fertilizer = (s.stats.fertilizer || 0) + 1 },
    'js/models/character.js': { Character: class {}, Momo: class {}, outfitToLook: () => ({}), randomNpcLook: () => ({}) },
    'js/models/items.js': { FISH: [{ id: 'test-fish', name: '测试鱼', price: 10, diff: 1, w: 1 }], FOODS: [], FLOWERS: [], fishModel: mesh, flowerModel: mesh, FOOD_BUILD: {}, coinModel: mesh },
    'js/models/props.js': { cloud: mesh, boat: mesh, treeRound: mesh, treePine: mesh, DECOR_BUILD: {} },
    'js/live/data.js': { BREADS: [{ id: 'test-bread', price: 10 }] }, 'js/live/props.js': { bread: mesh, breadIco: () => '' },
    'js/games/tailor-lanes.js': { TAILOR_LANES: Array.from({ length: 4 }, () => ({ color: '#fff' })), tailorKeyLane: () => -1, fourLaneChart: () => [] },
    'js/games/tailor-stage.js': { FABRIC: {}, LANE_X: [0, 1, 2, 3], ...Object.fromEntries(['buildTailorStage', 'createStageNote', 'renderStageNote', 'animateTailorStage', 'fitTailorCamera', 'projectTailorInput', 'disposeTailorNotes'].map(key => [key, () => {}])) },
  };
  const context = vm.createContext({ console, Math: math, Number, Date, AbortController, window, navigator: {}, setTimeout: callback => timers.push(callback), document: {}, requestAnimationFrame() {} });
  const at = file => { if (!modules.has(file)) { const key = path.relative(root, file).replace(/\\/g, '/'), value = substitutes[key];
    modules.set(file, value ? new vm.SyntheticModule(Object.keys(value), function () { for (const [name, item] of Object.entries(value)) this.setExport(name, item); }, { context, identifier: file })
      : new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file })); } return modules.get(file); };
  const entry = new vm.SourceTextModule(ids.map(id => `import './js/games/${id}.js';`).join('\n'), { context, identifier: path.join(root, 'qa-momo-entry.js') });
  await entry.link((specifier, from) => at(path.resolve(path.dirname(from.identifier), specifier))); await entry.evaluate();
  const get = file => modules.get(path.join(root, file)).namespace;
  const MiniGame = get('js/games/common.js').MiniGame, support = get('js/shared/momo-fortune.js');
  const classes = Object.fromEntries(ids.map(id => [id, Object.values(get(`js/games/${id}.js`))[0]]));
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const fixture = id => {
    const game = new MiniGame({ playOpts: {} }, id);
    Object.setPrototypeOf(game, classes[id].prototype);
    Object.assign(game, { state: 'play', momoEnergy: 100, scoreEl: new Node(), comboEl: new Node(), bonus: { pct: 0 }, masteryBonus: 0, floatAt() {}, resolve() {}, nikki: { setPose() {} } });
    game.scoreEl.parentElement = new Node(); return game;
  };
  const cafe = () => Object.assign(fixture('cafe'), { menu: [{ id: 'coffee' }, { id: 'cake' }, { id: 'sold' }], soldout: 2,
    brew: [{ st: 'brewing', t: 2 }, null, null], stock: [0, 1, 0], restock: [0, 2, 0], customers: [{ state: 'wait', patience: 10, max: 20, ch: { root: new THREE.Group() } }], piles: [null, null, null], topY: 1, syncStock() {} });
  const tailor = () => Object.assign(fixture('tailor'), { chart: [], notes: [], holding: [null, null, null, null], stats: { perfect: 0, good: 0, miss: 0 }, sewn: 0, garments: 0,
    songTime: () => 10, keyEls: Array.from({ length: 4 }, () => new Node()), needles: Array.from({ length: 4 }, () => ({ k: 0 })),
    rings: Array.from({ length: 4 }, () => new THREE.Group()), progFill: new Node(), stitchPoint: () => new THREE.Vector3(), renderNote() {}, syncMannequin() {}, judge() {}, finishGarment() { this.garments++; } });
  const note = (lane, time = 10, dur = 0) => ({ lane, time, dur, state: 'fly' });

  await test('今日加成在开局读取快照，昨日摸摸与签不带入；运行中的局不会随跨日改变', () => {
    S.live.fun = { day: support.dailyFunKey(S), used: { momoPet: 1, fortuneLv: '中吉', fortune: 1 } };
    const game = new MiniGame({ playOpts: {} }, 'cafe');
    assert.equal(game.momoEnergy, 55); assert.equal(game.fortuneBonus, 0.05); assert.equal(game.fortuneLv, '中吉');
    S.gday++; const next = new MiniGame({ playOpts: {} }, 'cafe');
    assert.equal(next.momoEnergy, 0); assert.equal(next.fortuneBonus, 0); assert.equal(game.fortuneBonus, 0.05);
    S.live.fun = { day: support.dailyFunKey(S), used: { fortuneLv: '大吉' } };
    const lucky = new MiniGame({ playOpts: {} }, 'cafe'); assert.equal(lucky.rareDropBonus, 0.2);
    S.live = {}; S.gday = 0;
  });
  await test('五店均有实际目标判定；不存在技能/空场/未充满/暂停/结束/退出不扣能量', () => {
    const blank = new MiniGame({ playOpts: {} }, 'cafe'); blank.state = 'play'; blank.momoEnergy = 100;
    assert.equal(blank.triggerMomoSkill(), false); assert.equal(blank.momoEnergy, 100);
    const game = cafe(); game.momoEnergy = 99.9; assert.equal(game.triggerMomoSkill(), false);
    game.momoEnergy = 100; for (const state of ['intro', 'over']) { game.state = state; assert.equal(game.triggerMomoSkill(), false); }
    game.state = 'play'; game.paused = true; assert.equal(game.triggerMomoSkill(), false); game.paused = false; game.dead = true;
    assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100); assert.equal(game.momoSkillsUsed, 0);
    for (const id of ids) assert.equal(typeof classes[id].prototype.onMomoSkill, 'function');
  });
  await test('应援只由正常正分充能，负分、暂停、无穷/NaN能量不充；能量上限100', () => {
    const game = cafe(); game.momoEnergy = 0; game.addScore(10); assert.equal(game.momoEnergy, 7);
    game.addScore(-2); assert.equal(game.momoEnergy, 7);
    for (const value of [NaN, Infinity, -1, 0]) game.addMomoEnergy(value); assert.equal(game.momoEnergy, 7);
    game.paused = true; game.addMomoEnergy(20); assert.equal(game.momoEnergy, 7); game.paused = false;
    game.addMomoEnergy(200); assert.equal(game.momoEnergy, 100);
  });
  await test('失败/空放保留能量；成功只消耗一次；技能记分不自充，施放中的重复触发被拒绝', () => {
    const game = cafe(); game.onMomoSkill = () => false; assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100);
    game.onMomoSkill = function () { assert.equal(this.triggerMomoSkill(), false); this.addScore(100); this.addMomoEnergy(100); return true; };
    assert.equal(game.triggerMomoSkill(), true); assert.equal(game.score, 100); assert.equal(game.momoEnergy, 0); assert.equal(game.momoSkillsUsed, 1);
    assert.equal(game.triggerMomoSkill(), false); game.addScore(10); assert.equal(game.momoEnergy, 7);
  });
  await test('咖啡技能补满可售备货、黄金拉花与耐心，不解除售罄；满资源时不能空放', () => {
    const game = cafe(); assert.equal(game.triggerMomoSkill(), true);
    assert.equal(game.brew[0].st, 'ready'); assert.equal(game.brew[0].t, 0); assert.equal(game.stock[1], 3); assert.equal(game.restock[1], 0);
    assert.equal(game.stock[2], 0); assert.equal(game.customers[0].patience, 17); assert.equal(game.momoEnergy, 0);
    game.customers[0].patience = 20; game.momoEnergy = 100; assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100);
  });
  await test('咖啡技能收取实际柜台收入一次，不自充能、不重复收款', () => {
    const game = cafe(), mesh = new THREE.Group(), el = new Node(); game.scene.add(mesh);
    game.piles[0] = { earn: 20, t: 1, mesh, el }; assert.equal(game.triggerMomoSkill(), true);
    assert.equal(game.score, 22); assert.equal(game.piles[0], null); assert.equal(game.momoEnergy, 0);
    game.collect(0, false); assert.equal(game.score, 22);
  });
  await test('面包技能只调整已有未焦面包，不生成库存、不复活焦面包，取出仍走原品质/展示架规则', () => {
    const game = Object.assign(fixture('bakery'), { good: [0.72, 1], ovens: [{ b: { id: 'test-bread', price: 10 }, need: 10, k: 0.1, t: 1 }, { k: 1.5, t: 15, need: 10 }], customers: [], display: [], baked: 0, perfect: 0,
      ovenMeshes: [{ g: new THREE.Group() }], updateOven() {}, renderDisplay() {}, clear(i) { this.ovens[i] = null; } });
    assert.equal(game.triggerMomoSkill(), true); assert.equal(game.ovens[0].k, 0.86); assert.equal(game.ovens[0].t, 8.6); assert.equal(game.ovens[1].k, 1.5);
    assert.equal(game.display.length, 0); assert.equal(game.score, 0); assert.equal(game.take(0), true);
    assert.equal(game.display[0].value, 13); assert.equal(game.display[0].perfect, true); assert.equal(game.baked, 1);
    assert.equal(game.take(0), false); assert.equal(game.display.length, 1);
    game.ovens = [null, { k: 1.5 }]; game.momoEnergy = 100; assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100);
  });
  await test('新增鼓风每炉最多两次且不能直接取出未熟面包；暂停不能鼓风', () => {
    const game = Object.assign(fixture('bakery'), { good: [0.72, 1], ovens: [{ need: 10, t: 0, k: 0, b: { id: 'test-bread', price: 10 } }],
      ovenMeshes: [{ g: new THREE.Group() }], updateOven() {} });
    assert.equal(game.take(0), false); assert.equal(game.ovens[0].fanned, 1); assert.equal(game.ovens[0].k, 0.15);
    assert.equal(game.take(0), false); assert.equal(game.ovens[0].fanned, 2); assert.equal(game.ovens[0].k, 0.3);
    assert.equal(game.take(0), false); assert.equal(game.ovens[0].k, 0.3); assert.equal(game.score, 0);
    game.paused = true; assert.equal(game.take(0), false); assert.equal(game.ovens[0].k, 0.3);
  });
  await test('新增糖霜只处理一份且不能叠加/绕过冷却，修正普通火候一次；趁热与糖霜按当前售价交单一次', () => {
    const game = Object.assign(fixture('bakery'), { glazeCd: 0, glazedCount: 0, served: 0,
      display: [{ id: 'test-bread', value: 8, perfect: false, hotT: 6.5, glazed: false }, { id: 'test-bread', value: 13, perfect: true, hotT: 0, glazed: false }], renderDisplay() {}, syncGlazeBtn() {} });
    assert.equal(game.glazeBread(), true); assert.equal(game.display[0].value, 13); assert.equal(game.display[0].glazed, true); assert.equal(game.glazeCd, 4.5); assert.equal(game.glazedCount, 1);
    assert.equal(game.glazeBread(), false); assert.equal(game.display[1].glazed, false); game.glazeCd = 0; game.paused = true; assert.equal(game.glazeBread(), false); game.paused = false;
    const ch = { root: new THREE.Group(), setPose() {} }; game.customers = [{ state: 'wait', order: ['test-bread'], ch }];
    assert.equal(game.serve(0), true); assert.equal(game.score, 20); assert.equal(game.served, 1); assert.equal(game.display.length, 1);
    assert.equal(game.serve(0), false); assert.equal(game.score, 20);
  });
  await test('新增糖霜冷却和热度跟随局内时间暂停，冷却结束允许下一份，热度到期去掉加价', () => {
    const game = Object.assign(fixture('bakery'), { glazeCd: 4.5, display: [{ hotT: 2 }], ovens: [], customers: [], spawnT: 100,
      nikki: { update() {} }, momo: { update() {} }, renderDisplay() { this.renders = (this.renders || 0) + 1; }, syncGlazeBtn() { this.synced = true; } });
    game.paused = true; game.update(5, 5); assert.equal(game.glazeCd, 4.5); assert.equal(game.display[0].hotT, 2);
    game.paused = false; game.tick(5); assert.equal(game.glazeCd, 0); assert.equal(game.display[0].hotT, 0); assert.equal(game.synced, true); assert.equal(game.renders, 1);
  });
  await test('花店清杂草只清障碍，保留花束；补篮有上限、恢复耐心，拖拽清理不计虚假合成分', () => {
    const flower = { t: 'rose', lv: 3 }, game = Object.assign(fixture('flower'), { cells: [{ weed: true }, flower, null, { weed: true }],
      gens: { flower: { n: 0, max: 8, cd: 4 }, ribbon: { n: 3, max: 4, cd: 2 } }, customers: [{ state: 'wait', pat: 12, patMax: 20 }],
      cancelDrag() { this.dragCanceled = true; }, renderCell() {}, renderPips() {}, syncReady() {} });
    assert.equal(game.triggerMomoSkill(), true); assert.equal(game.cells[0], null); assert.equal(game.cells[1], flower); assert.equal(game.cells[3], null);
    assert.equal(game.weeded, 2); assert.equal(game.gens.flower.n, 8); assert.equal(game.gens.ribbon.n, 4); assert.equal(game.gens.ribbon.cd, 0);
    assert.equal(game.customers[0].pat, 19); assert.equal(game.dragCanceled, true); assert.equal(game.score, 0);
    game.customers[0].pat = 20; game.momoEnergy = 100; assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100);
  });
  await test('新增花店整理不丢物品/不移动杂草，取消拖拽；正常合成与狂热跳级概率分别生效且不越等级上限', () => {
    const flower = () => Object.assign(fixture('flower'), { cells: Array(24).fill(null), cellEls: Array.from({ length: 24 }, () => new Node()), best: 1, critMerges: 0,
      cancelDrag() { this.canceled = true; }, clearSelection() {}, renderCell() {}, syncReady() {}, float2() {}, topY: 1 });
    const game = flower(), items = [{ t: 'rose', lv: 1 }, { weed: true }, { t: 'rose', lv: 2 }, { t: 'ribbon', lv: 2 }];
    game.cells.splice(0, 4, ...items); const before = game.cells.filter(Boolean); game.sortBoard();
    assert.equal(game.cells[1], items[1]); assert.equal(game.canceled, true); assert.equal(game.cells.filter(Boolean).length, before.length);
    for (const item of before) assert.equal(game.cells.filter(value => value === item).length, 1);
    random = 0.2; const normal = flower(); normal.cells[0] = { t: 'rose', lv: 1 }; normal.cells[1] = { t: 'rose', lv: 1 }; normal.drop(0, 1);
    assert.equal(normal.cells[1].lv, 2); assert.equal(normal.score, 1); assert.equal(normal.critMerges, 0);
    const rush = flower(); rush.elapsed = 1; rush.rushUntil = 5; rush.cells[0] = { t: 'rose', lv: 1 }; rush.cells[1] = { t: 'rose', lv: 1 }; rush.drop(0, 1);
    assert.equal(rush.cells[1].lv, 3); assert.equal(rush.score, 9); assert.equal(rush.critMerges, 1);
    random = 0; const max = flower(); max.cells[0] = { t: 'rose', lv: 4 }; max.cells[1] = { t: 'rose', lv: 4 }; max.drop(0, 1);
    assert.equal(max.cells[1].lv, 5); assert.equal(max.critMerges, 0); random = 0.9;
  });
  await test('钓场仅收线可施放；进度与绿条有界，不改变鱼价/难度，不能空等时耗能', () => {
    const game = Object.assign(fixture('fish'), { phase: 'wait', fish: { id: 'test-fish', price: 10, diff: 1 }, prog: 0.4, fp: 0.95, barH: 0.4, catchEl: new Node(), progEl: new Node(), tipText() {} });
    assert.equal(game.triggerMomoSkill(), false); assert.equal(game.momoEnergy, 100);
    game.phase = 'reel'; assert.equal(game.triggerMomoSkill(), true); assert.equal(game.prog, 0.75); assert.equal(game.bar, 0.6); assert.equal(game.barV, 0);
    assert.equal(game.fish.price, 10); assert.equal(game.fish.diff, 1); assert.equal(game.score, 0); assert.equal(game.momoEnergy, 0);
  });
  await test('钓场技能达到100%调用真实收鱼与原收入规则一次，所得不自充能', () => {
    const game = Object.assign(fixture('fish'), { phase: 'reel', fish: { id: 'test-fish', name: '测试鱼', price: 10, diff: 1 }, prog: 0.8, fp: 0.4, barH: 0.4,
      catchEl: new Node(), progEl: new Node(), barEl: new Node(), treEl: new Node(), popEl: new Node(), bobber: new THREE.Group(), caught: 0, treBonus: 0, left: false, tipText() {} });
    assert.equal(game.triggerMomoSkill(), true); assert.equal(game.caught, 1); assert.equal(game.score, 13); assert.equal(game.phase, 'rest'); assert.equal(game.momoEnergy, 0);
    game.momoEnergy = 100; assert.equal(game.triggerMomoSkill(), false); assert.equal(game.caught, 1);
    game.endReel(true); assert.equal(game.caught, 1); assert.equal(game.score, 13);
  });
  await test('新增快速提竿只在咬钩0.38秒内+12%初始进度；暂停/重复按不能重开收线或重算鱼王', () => {
    const fish = () => Object.assign(fixture('fish'), { phase: 'bite', pt: 0.2, quickHooks: 0, perfects: 2, bobber: new THREE.Group(), fishEl: new Node(), treEl: new Node(), traitEl: new Node(),
      barEl: new Node(), biteEl: new Node(), tipText() {}, pickFish: () => ({ id: 'test-fish', name: '测试鱼', price: 10, diff: 1, ai: 'dart' }) });
    random = 0.1; const quick = fish(); quick.press(); assert.equal(quick.prog, 0.52); assert.equal(quick.quickHooks, 1); assert.equal(quick.fish.king, true);
    assert.ok(quick.traitEl.textContent.includes('猛窜')); assert.ok(quick.traitEl.textContent.includes('鱼王'));
    quick.press(); assert.equal(quick.quickHooks, 1); assert.equal(quick.prog, 0.52);
    const normal = fish(); normal.pt = 0.5; normal.press(); assert.equal(normal.prog, 0.4); assert.equal(normal.quickHooks, 0);
    const paused = fish(); paused.paused = true; paused.press(); assert.equal(paused.phase, 'bite'); assert.equal(paused.quickHooks, 0); random = 0.9;
  });
  await test('裁缝技能只缝当前近线最多四颗，远处/已错过/已缝纽扣保留，不自充能', () => {
    const game = tailor(); game.notes = [note(0), note(1, 10.2), note(2, 10.4), note(3, 10.6), note(0, 10.8), note(0, 12), note(1, 9)];
    assert.equal(game.triggerMomoSkill(), true); assert.equal(game.sewn, 4); assert.equal(game.score, 20); assert.equal(game.stats.perfect, 4); assert.equal(game.combo, 4);
    assert.equal(game.notes[4].state, 'fly'); assert.equal(game.notes[5].state, 'fly'); assert.equal(game.notes[6].state, 'fly'); assert.equal(game.momoEnergy, 0);
    assert.equal(game.stitch(game.notes[0], true), false); assert.equal(game.score, 20);
  });
  await test('裁缝辅助长针脚沿用头尾分和严格/长线规则，重复结束不加分，原手动判定未变', () => {
    const game = tailor(); game.modifier = { id: 'long' }; const long = note(0, 10, 1); game.notes = [long];
    assert.equal(game.triggerMomoSkill(), true); assert.equal(long.state, 'sewn'); assert.equal(game.holding[0], null);
    assert.equal(game.score, 19); assert.equal(game.sewn, 1); assert.equal(game.stats.perfect, 2); assert.equal(game.combo, 2); assert.equal(game.momoEnergy, 0);
    game.endHold(long, true); assert.equal(game.score, 19);
    const manual = tailor(), one = note(0), good = note(1, 10.15); manual.notes = [one, good];
    manual.momoEnergy = 0; manual.hit(0); manual.hit(1); assert.equal(manual.score, 8); assert.equal(manual.stats.perfect, 1); assert.equal(manual.stats.good, 1);
    manual.hit(0); assert.equal(manual.score, 8); assert.equal(manual.sewn, 2);
    const strict = tailor(); strict.modifier = { id: 'strict' }; strict.notes = [note(0, 10.15)]; strict.hit(0); assert.equal(strict.score, 0);
  });
  await test('裁缝既有长按不会被同轨待来音符替换；辅助完成后松手/尾判不重复入账', () => {
    const game = tailor(), hold = note(0, 9.8, 1), next = note(0, 10.2); hold.state = 'hold'; game.holding[0] = hold; game.notes = [hold, next];
    assert.equal(game.triggerMomoSkill(), true); assert.equal(hold.state, 'sewn'); assert.equal(next.state, 'fly'); assert.equal(game.score, 6);
    game.release(0); game.endHold(hold, true); assert.equal(game.score, 6);
  });
  await test('新增全连/全Perfect奖励只在整谱判完后给出，提前打烊12颗不能领取；Good档沿用20分', () => {
    const finished = (perfect, good) => Object.assign(tailor(), { total: 20, chart: Array.from({ length: 20 }, (_, lane) => ({ lane: lane % 4 })), sewn: perfect + good,
      stats: { perfect, good, miss: 0 }, clearInputs() {}, pauseBtn: new Node(), judge() {} });
    const early = finished(12, 0); early.onFinish(); assert.equal(early.score, 0); assert.equal(early.fcBadge, undefined);
    const ap = finished(20, 0); ap.onFinish(); assert.equal(ap.score, 35); assert.ok(ap.fcBadge.includes('ALL PERFECT'));
    const fc = finished(19, 1); fc.onFinish(); assert.equal(fc.score, 20); assert.ok(fc.fcBadge.includes('FULL COMBO'));
    const broken = finished(19, 0); broken.stats.miss = 1; broken.onFinish(); assert.equal(broken.score, 0);
  });
  await test('HUD按钮与G键走同一技能；暂停/恢复/结束禁用，99.9%不能伪装满能量', () => {
    const game = cafe(); game.mountHUD(); assert.equal(game.momoSkillBtn.disabled, false); assert.ok(game.momoSkillBtn.attributes['aria-label'].includes('100%'));
    assert.equal(game.pause(), true); assert.equal(game.momoSkillBtn.disabled, true); assert.equal(game.triggerMomoSkill(), false);
    assert.equal(game.resume(), true); assert.equal(game.momoSkillBtn.disabled, false);
    const key = new Event('keydown', { cancelable: true }); key.code = 'KeyG'; key.repeat = false; window.dispatchEvent(key);
    assert.equal(game.momoSkillsUsed, 1); assert.equal(game.momoEnergy, 0); assert.equal(game.momoSkillBtn.disabled, true);
    game.momoEnergy = 99.9; game.syncMomoSkill(); assert.equal(game.momoSkillText.textContent, '大喵 99%'); assert.equal(game.momoSkillBtn.disabled, true);
    game.momoEnergy = 100; game.brew[0].st = 'idle'; game.syncMomoSkill(); game.momoSkillBtn.onclick(); assert.equal(game.momoSkillsUsed, 2);
    game.state = 'over'; game.syncMomoSkill(); assert.equal(game.momoSkillBtn.disabled, true); game.abort.abort();
  });
  await test('能量未满时HUD不扫描店内目标；裁缝可用性查询不收集排序音符', () => {
    const game = cafe(); game.momoEnergy = 0; game.mountHUD(); let scans = 0;
    game.canMomoSkill = () => { scans++; return true; }; for (let i = 0; i < 60; i++) game.syncMomoSkill(); assert.equal(scans, 0);
    game.momoEnergy = 100; game.syncMomoSkill(); assert.equal(scans, 1); game.abort.abort();
    const sewing = tailor(); sewing.notes = [note(0)]; sewing.momoNotes = () => { throw new Error('Only a real skill activation should collect notes'); };
    assert.equal(sewing.canMomoSkill(), true); sewing.notes[0].state = 'sewn'; assert.equal(sewing.canMomoSkill(), false);
  });
  await test('技能补间跟随暂停，重复应援不会漂高；退出释放补间/监听/场景，钓场调用公共清理', () => {
    const game = cafe(); game.momo = { root: new THREE.Group() }; game.momo.root.position.y = 2; game.hudEl = h('div', {}, h('button', { class: 'gquit' }));
    game.triggerMomoSkill(); const first = game._momoCheer; first.update(0.5); assert.equal(game.momo.root.position.y, 2.55);
    game.paused = true; assert.equal(first.paused(), true); game.paused = false;
    game.momoEnergy = 100; game.brew[0].st = 'idle'; game.triggerMomoSkill(); assert.equal(first.dead, true); assert.equal(game._momoHomeY, 2);
    const last = game._momoCheer; game.onExit(); assert.equal(game.dead, true); assert.equal(last.dead, true); assert.equal(game.momo.root.position.y, 2); assert.equal(game.tweens.size, 0); assert.equal(game.abort.signal.aborted, true);
    const fish = fixture('fish'); fish.hudEl = new Node(); fish.onExit(); assert.equal(fish.dead, true); assert.equal(fish.abort.signal.aborted, true);
  });
  await test('打烊只结算一次，签加成沿用本局快照与原收入公式，不保存技能能量', async () => {
    const game = cafe(); game.hudEl = new Node(); game.score = 100; game.starAt = [1000, 2000, 3000]; game.fortuneBonus = 0.08; game.fortuneLv = '大吉';
    game.onFinish = () => {}; game.resultLines = () => []; S.coins = 0; const before = JSON.stringify(S.live);
    await game.finish(); await game.finish(); assert.equal(S.coins, 108); assert.equal(game.state, 'over'); assert.equal(JSON.stringify(S.live), before);
    assert.equal(Object.hasOwn(S, 'momoEnergy'), false); assert.equal(Object.hasOwn(S, 'momoSkillsUsed'), false);
  });
  const report = { pass: true, checks: checks.length, names: checks, timestamp: new Date().toISOString(), scope: 'Real MiniGame and five shop behavior methods with in-memory DOM/audio/rendering boundaries. No server, network, database or player save.' };
  const out = process.argv.indexOf('--out'); if (out >= 0) { const file = path.resolve(process.argv[out + 1]); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify({ pass: true, checks: checks.length, isolation: 'memory only' }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
