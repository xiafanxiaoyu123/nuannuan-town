// Behavioral tests for displayed-target selection, real keyboard handling and farm mutations.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
if (!vm.SourceTextModule) { const child = require('node:child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true }); process.exit(child.status ?? 1); }
const { memoryHarness } = require('./ui3_memory_harness.cjs');
async function main() {
  const h = await memoryHarness(['js/world/farm.js', 'js/world/town/input.js'], 'qa-ui3-interaction-memory');
  const input = h.get('js/world/town/input.js'), { Farm, plotStage } = h.get('js/world/farm.js'), state = h.get('js/core/state.js'), { THREE } = h.get('js/core/kit.js');
  const checks = [], clone = value => JSON.parse(JSON.stringify(value)); let latest = null, promptEmits = 0;
  state.bus.on('prompt', value => { latest = value; promptEmits++; });
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const freshTown = () => {
    state.resetSave(); state.S.farm = {}; state.S.seed = 'radish'; state.S.sapling = 'apple';
    const town = { active: true, modal: false, frozen: false, lock: 0, camMode: 'play', zone: 'home', photoOn: false, pos: new THREE.Vector3(),
      keys: new Set(), stick: { x: 0, y: 0 }, decor: { active: false, onKey() {} }, homeInteractions: {}, npcs: [], inter: [],
      scene: new THREE.Scene(), decors: { home: { entries: [] } }, face() {}, act() {}, noInput() { return input.noInput(this); } };
    const farm = Object.create(Farm.prototype); Object.assign(farm, { town, hl: new THREE.Group(), carry: null, refresh(rec) { rec.farm ||= { holder: new THREE.Group() }; }, harvestUnlocked: () => false });
    town.farm = farm; town.allInter = () => input.allInter(town); return town;
  };
  const rec = (town, x, z, id = 'plot', gx = 10, gz = 10) => {
    const r = { e: { id, gx, gz }, obj: new THREE.Group(), farm: { holder: new THREE.Group() } }; r.obj.position.set(x, 0, z); town.decors.home.entries.push(r); return r;
  };
  const ripe = () => ({ crop: 'radish', t0: h.clock.now - 1000, dur: 100, watered: true });
  const growing = watered => ({ crop: 'radish', t0: h.clock.now, dur: 100000, watered });
  const custom = (town, id, x, label = id, onAct = () => {}) => { const it = { id, x, z: 0, r: 2, label, act: onAct }; town.inter.push(it); return it; };
  await test('附近候选按优先级排序、稳定去重，最多四个且零上限为空', () => {
    const t = freshTown(); custom(t, 'a', .2, 'same'); custom(t, 'dup', .3, 'same'); custom(t, 'b', .4); custom(t, 'c', .6); custom(t, 'd', .8); custom(t, 'e', 1);
    assert.deepEqual(clone(input.findInters(t, 99).map(i => i.id)), ['a', 'b', 'c', 'd']); assert.equal(input.findInters(t, 0).length, 0);
    t.inter[4].prio = 2; assert.equal(input.findInter(t).id, 'd');
    t.inter = []; custom(t, 'homeFurniture_a', .2, '坐下'); custom(t, 'homeFurniture_b', .3, '坐下'); t.inter[0].sub = '长凳'; t.inter[1].sub = '沙发'; assert.equal(input.findInters(t).length, 2);
  });
  await test('农田最多三候选、相同操作文案去重，候选均在实际交互半径内', () => {
    const t = freshTown(), a = rec(t, .2, 0, 'plot', 1), b = rec(t, .4, 0, 'plot', 2), c = rec(t, .6, 0, 'plot', 3), d = rec(t, .8, 0, 'plot', 4), outside = rec(t, 1.71, 0, 'plot', 5);
    state.S.farm['2,10'] = growing(false); state.S.farm['3,10'] = ripe(); state.S.farm['4,10'] = growing(true); state.S.stats.fertilizer = 2;
    const list = t.farm.interactables(0, 0); assert.equal(list.length, 3); assert.equal(new Set(list.map(i => i.label)).size, 3); assert(list.every(i => Math.hypot(i.x, i.z) < i.r)); assert(!list.some(i => i.target === outside));
    t.zone = 'town'; assert.equal(t.farm.interactables(0, 0).length, 0); assert.equal(t.farm.hl.visible, false);
    void a; void b; void c; void d;
  });
  await test('陈旧次按钮离开距离、移除对象、同ID替换或换场景均不执行', () => {
    for (const change of [(t, it) => { it.x = 10; }, (t, it) => { t.inter = t.inter.filter(v => v !== it); }, (t, it) => { t.inter[1] = { ...it }; }, t => { t.zone = 'town'; }]) {
      const t = freshTown(); let n = 0; custom(t, 'one', .2); const second = custom(t, 'two', .4, 'two', () => n++); input.updatePrompts(t); const click = latest.items[1].act; change(t, second); assert.equal(click(), false); assert.equal(n, 0);
    }
  });
  await test('索引重排不会把旧按钮转给别物，同目标新回调无需重建提示也会使用最新版', () => {
    const t = freshTown(); let a = 0, b = 0; const one = custom(t, 'a', .2, 'a', () => a++), two = custom(t, 'b', .4, 'b', () => b++); input.updatePrompts(t); const click = latest.items[1].act;
    one.x = .6; two.x = .1; assert.equal(click(), true); assert.equal(a, 0); assert.equal(b, 1);
    input.updatePrompts(t); const before = promptEmits; two.act = () => { b += 10; }; input.updatePrompts(t); assert.equal(promptEmits, before); assert.equal(latest.items[0].act(), true); assert.equal(b, 11);
  });
  await test('动态标签改变前一帧按钮不能执行新操作，刷新后只执行当前显示动作', () => {
    const t = freshTown(); let mode = '搭话', n = 0; custom(t, 'one', .2); custom(t, 'changing', .4, () => mode, () => n++);
    input.updatePrompts(t); const old = latest.items[1].act; mode = '交付委托';
    assert.equal(old(), false); assert.equal(input.interact(t, 1), false); assert.equal(n, 0);
    input.updatePrompts(t); assert.equal(latest.items[1].act(), true); assert.equal(n, 1);
    for (const index of [-1, .5, 4, NaN, '1']) assert.equal(input.interact(t, index), false);
  });
  await test('冻结、锁定、弹窗、装修、拍照、入床、卸载均阻止队列回调；重开不复活旧按钮', () => {
    for (const block of [t => { t.frozen = true; }, t => { t.lock = 1; }, t => { t.modal = true; }, t => { t.decor.active = true; }, t => { t.photoOn = true; }, t => { t.homeInteractions.bedState = {}; }, t => { t.active = false; }]) {
      const t = freshTown(); let n = 0; custom(t, 'one', .2); custom(t, 'two', .4, 'two', () => n++); input.updatePrompts(t); const click = latest.items[1].act; block(t); assert.equal(click(), false); assert.equal(input.interact(t, 1), false); assert.equal(n, 0);
    }
    const t = freshTown(); let n = 0; custom(t, 'one', .2); custom(t, 'two', .4, 'two', () => n++); input.updatePrompts(t); const old = latest.items[1].act;
    t.modal = true; input.updatePrompts(t); t.modal = false; input.updatePrompts(t); assert.equal(old(), false); assert.equal(latest.items[1].act(), true); assert.equal(n, 1);
  });
  await test('农田同文案每帧重建只刷新数据不重复发提示，旧浇水不跳成施肥或新作物', () => {
    const t = freshTown(), r = rec(t, .1, 0, 'plot', 1); state.S.farm['1,10'] = growing(false); custom(t, 'other', .5); state.S.stats.fertilizer = 2;
    input.updatePrompts(t); const click = latest.items[0].act, before = promptEmits; input.updatePrompts(t); assert.equal(promptEmits, before);
    assert.equal(click(), true); const p = state.S.farm['1,10'], dur = p.dur; assert.equal(p.watered, true); assert.equal(click(), false); assert.equal(p.dur, dur); assert.equal(state.S.stats.fertilizer, 2);
    state.S.farm['1,10'] = growing(false); assert.equal(click(), false); assert.equal(state.S.farm['1,10'].watered, false); void r;
  });
  await test('真实keydown支持E/空格/回车/F/3/4，缺少多目标时保留数字选种', () => {
    const t = freshTown(), n = [0, 0, 0, 0], seeds = []; for (let i = 0; i < 4; i++) custom(t, 'key' + i, .2 + i * .2, undefined, () => n[i]++);
    t.farm.pickSeed = i => seeds.push(i); input.bindInput(t); input.updatePrompts(t);
    const press = (code, extras = {}) => { let prevented = false; h.window.emit('keydown', { code, target: { closest: () => null }, preventDefault() { prevented = true; }, ...extras }); return prevented; };
    for (const key of ['KeyE', 'Space', 'Enter', 'KeyF', 'Digit3', 'Digit4']) assert.equal(press(key), true); assert.deepEqual(n, [3, 1, 1, 1]); assert.deepEqual(seeds, []);
    press('Digit2'); assert.deepEqual(seeds, [1]); t.inter = t.inter.slice(0, 1); input.updatePrompts(t); press('Digit3'); assert.deepEqual(seeds, [1, 2]);
    const before = n[0]; for (const extras of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { defaultPrevented: true }, { repeat: true }, { target: { isContentEditable: true } }, { target: { closest: () => ({}) } }]) assert.equal(press('KeyE', extras), false); assert.equal(n[0], before);
    press('KeyW', { ctrlKey: true }); assert.equal(t.keys.size, 0); press('KeyW'); assert(t.keys.has('KeyW')); h.window.emit('keyup', { code: 'KeyW' }); assert.equal(t.keys.size, 0); t.active = false;
  });
  await test('真实pointer走近自动交互复核目标：移走/动作改变/换场景不触发，正常到达仍可用', () => {
    const t = freshTown(); let mode = '搭话', n = 0; const it = custom(t, 'walkTarget', .3, () => mode, () => n++);
    t.ring = new THREE.Group(); t.walkPoint = () => new THREE.Vector3(.3, 0, 0); input.bindInput(t);
    const queue = () => { h.canvas.emit('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }); h.canvas.emit('pointerup', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse' }); return t.moveTo.hit.act; };
    const far = queue(); it.x = 10; assert.equal(far(), false); it.x = .3;
    const changed = queue(); mode = '交付委托'; assert.equal(changed(), false);
    const switched = queue(); t.zone = 'town'; assert.equal(switched(), false); t.zone = 'home';
    assert.equal(queue()(), true); assert.equal(n, 1); t.active = false;
  });
  await test('播种、浇水、施肥各扣一次，未成熟不收、成熟只收一次且不抛异常', () => {
    const t = freshTown(), r = rec(t, .1, 0, 'plot', 1); state.S.seeds.radish = 2; const coins = state.S.coins;
    t.farm.plant(r); t.farm.plant(r); assert.equal(state.S.seeds.radish, 1); assert.equal(state.S.coins, coins); const p = state.S.farm['1,10']; assert.equal(t.farm.harvest(r), false);
    t.farm.water(r); const watered = p.dur, wateredStats = state.S.stats.watered; t.farm.water(r); assert.equal(p.dur, watered); assert.equal(state.S.stats.watered, wateredStats);
    state.S.stats.fertilizer = 2; assert.equal(t.farm.fertilize(r), true); const fertilized = p.dur; assert.equal(t.farm.fertilize(r), false); assert.equal(p.dur, fertilized); assert.equal(state.S.stats.fertilizer, 1);
    p.t0 = h.clock.now - p.dur - 1; assert.equal(plotStage(p), 3); const crops = state.S.crops.radish || 0; assert.equal(t.farm.harvest(r), true); const final = state.S.crops.radish; assert(final > crops); assert.equal(t.farm.harvest(r), false); assert.equal(state.S.crops.radish, final);
  });
  await test('果树不覆盖已有树或普通田，重复种植/摘果不重复扣款或发放', () => {
    const t = freshTown(), ordinary = rec(t, 0, 0, 'plot', 1), tree = rec(t, 1, 0, 'bigplot', 2); state.S.coins = 10000;
    const before = state.S.coins; assert.equal(t.farm.plantTree(ordinary), false); assert.equal(state.S.coins, before);
    t.farm.plantTree(tree); const paid = state.S.coins; assert(paid < before); assert.equal(t.farm.plantTree(tree), false); assert.equal(state.S.coins, paid);
    const p = state.S.farm['2,10']; p.t0 = h.clock.now - 100000000; p.last = 0; t.farm.pickFruit(tree); const apples = state.S.crops.apple; assert(apples > 0); t.farm.pickFruit(tree); assert.equal(state.S.crops.apple, apples); assert.equal(t.farm.pickFruit(ordinary), false);
  });
  const report = { pass: true, checks: checks.length, names: checks, scope: 'actual input and Farm modules; synthetic in-memory storage; renderer/audio output boundaries; no server/database/network/payment' };
  const index = process.argv.indexOf('--out'); if (index >= 0) { const file = path.resolve(process.argv[index + 1]); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
