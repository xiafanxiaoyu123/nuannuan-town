// Actual client state/import/export + server validator, synthetic memory only.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
if (!vm.SourceTextModule) {
  const child = require('node:child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
}
const { memoryHarness } = require('./ui3_memory_harness.cjs');
async function main() {
  const slot = 'qa-homestead-save-memory', key = 'nikki-block-town-save-v1:' + slot;
  const h = await memoryHarness(['js/core/state.js', 'js/core/homestead-actions.js'], slot), st = h.get('js/core/state.js'), format = h.get('js/core/save-format.js'), rules = h.get('js/shared/homestead.js');
  const transactions = h.get('js/core/homestead-actions.js');
  const cloud = require(path.join(h.root, 'server/save-contract.js'));
  const clone = v => JSON.parse(JSON.stringify(v)), eq = (a, b) => assert.deepEqual(clone(a), clone(b));
  const names = []; let invalidCases = 0;
  const test = (name, fn) => { fn(); names.push(name); console.log('PASS ' + name); };
  const fresh = () => { st.resetSave(); st.S.coins = 54321; st.S.crops = {}; st.S.npc = { man: { t: 1, last: '' }, he: { t: 4, last: '2026-10-18' } }; st.flushSave(); return clone(st.S); };
  const run = (type, args = {}) => rules.performHomestead(st.S, { type, ...args }, h.clock.now);
  const ok = value => { assert.equal(value.ok, true, value.error || value.message); return value; };
  const start = () => { fresh(); ok(run('tutorial')); st.S.placed=[{id:'ranch_coop',gx:2,gz:3,rot:0},{id:'ranch_picnic',gx:7,gz:3,rot:0}]; rules.advanceHomestead(st.S,h.clock.now); };
  const cook = recipe => { const t = ok(run('cookStart', { recipe })); ok(run('cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 40, plated: true })); return ok(run('cookFinish', { taskId: t.taskId })); };
  const unchanged = fn => { const s = JSON.stringify(st.S), store = JSON.stringify([...h.storage]), writes = h.writes.length; const out = fn(); assert.equal(JSON.stringify(st.S), s); assert.equal(JSON.stringify([...h.storage]), store); assert.equal(h.writes.length, writes); return out; };
  test('fresh defaults include independent, valid, unrewarded homesteads', () => {
    const a = fresh(), b = fresh(); eq(a.homestead, b.homestead); assert.equal(a.homestead.tutorial, false); assert.equal(a.homestead.animals.length, 0);
    unchanged(() => format.validateSaveData(a)); unchanged(() => cloud.validateCloudSave(a));
  });
  test('legacy history migration preserves resources and never generates finished goods', () => {
    const old = fresh(); delete old.homestead; old.live.kitchen = { strawberry_tart: 63, pumpkin_soup: 4 }; old.crops = { wheat: 12, radish: 9 };
    const text = JSON.stringify(old); unchanged(() => st.previewSaveImport(text));
    const normalized = unchanged(() => st.normalizeSaveData(old)); assert.equal(normalized.homestead.history.strawberry_tart, 63);
    eq(normalized.homestead.dishes, {}); eq(normalized.homestead.pantry, {}); eq(normalized.crops, old.crops); assert.equal(normalized.coins, old.coins);
    assert.equal(JSON.stringify(old), text); ok(st.importSaveFile(text));
    const before = { coins: st.S.coins, crops: clone(st.S.crops), history: clone(st.S.homestead.history) };
    for (let i = 0; i < 3; i++) { st.flushSave(); assert.equal(st.load(), true); }
    assert.equal(st.S.coins, before.coins); eq(st.S.crops, before.crops); eq(st.S.homestead.history, before.history); eq(st.S.homestead.dishes, {});
  });
  test('normalization is deterministic across clock changes and does not advance production', () => {
    start(); ok(run('feed')); const saved = clone(st.S), before = JSON.stringify(saved);
    const first = unchanged(() => st.normalizeSaveData(saved)); h.clock.now += 8 * 60 * 60000;
    const second = unchanged(() => st.normalizeSaveData(saved)); eq(first.homestead, second.homestead); assert.equal(JSON.stringify(saved), before);
    assert.equal(second.homestead.animals[0].ready, 0);
    const old = clone(saved); delete old.homestead; const a = unchanged(() => st.normalizeSaveData(old)); h.clock.now += 2000; const b = unchanged(() => st.normalizeSaveData(old)); eq(a.homestead, b.homestead);
  });
  test('v1 ranch normalization, import and startup preserve custody and refund paid expansion only once', () => {
    start();ok(run('feed'));const task=ok(run('cookStart',{recipe:'egg_custard'}));const old=clone(st.S),hs=old.homestead,food='egg_custard:normal:plain';
    hs.version=1;hs.ranchLevel=2;hs.serial=5;delete hs.cooking.technique;for(const a of hs.animals){delete a.housingKey;delete a.pausedMs;}hs.animals[0].cycleAt=hs.lastNow+7*60000;
    hs.placed=[{id:'dish_3',key:food,zone:'ranch',surface:'ranch_picnic',anchor:'a0',rotation:0}];hs.tea={id:'tea_4',keys:[food],guests:['momo'],startedAt:hs.lastNow,readyAt:hs.lastNow+30000};old.decor={};old.placed=[];old.savedAt=h.clock.now;
    const text=JSON.stringify(old);const accepted=unchanged(()=>cloud.validateCloudSave(old));assert.equal(accepted.data.homestead.version,1);unchanged(()=>st.previewSaveImport(text));
    const one=unchanged(()=>st.normalizeSaveData(old));h.clock.now+=86400000;const two=unchanged(()=>st.normalizeSaveData(old));eq(one,two);assert.equal(JSON.stringify(old),text);
    assert.equal(one.coins,old.coins+500);assert.equal(one.decor.ranch_coop,1);assert.equal(one.homestead.version,2);assert.equal(one.homestead.dishes[food],2);assert.equal(one.homestead.animals[0].pausedMs,7*60000);assert.equal(one.homestead.animals[0].cycleAt,0);eq(one.homestead.cooking,hs.cooking);assert.equal(one.homestead.tea,null);eq(one.placed,[]);
    ok(st.importSaveFile(text));eq(st.S.homestead,one.homestead);eq(st.normalizeSaveData(st.S).homestead,one.homestead);
    st.flushSave();for(let i=0;i<3;i++){assert.equal(st.load(),true);assert.equal(st.S.coins,one.coins);assert.equal(st.S.decor.ranch_coop,1);eq(st.S.homestead,one.homestead);st.flushSave();}
    h.storage.set(key,text);assert.equal(st.load(),true);assert.equal(st.S.coins,one.coins);eq(st.S.homestead,one.homestead);ok(run('cookCancel',{taskId:task.taskId}));assert.equal(st.S.homestead.pantry.egg,1);
  });
  test('tutorial and animal care survive actual replace, save, load and text roundtrip', () => {
    start(); const id = st.S.homestead.animals[0].id; ok(run('rename', { animalId: id, name: '小蛋黄' })); ok(run('pet', { animalId: id })); ok(run('graze', { animalId: id, value: true }));
    const target = clone(st.S.homestead); st.flushSave(); assert.equal(st.load(), true); const file = unchanged(() => st.exportSaveFile());
    unchanged(() => st.previewSaveImport(file.text)); ok(st.importSaveFile(file.text)); st.flushSave(); assert.equal(st.load(), true);
    eq(st.S.homestead.animals, target.animals); eq(st.S.homestead.pantry, target.pantry); assert.equal(st.S.homestead.tutorial, true);
    unchanged(() => assert.equal(run('tutorial').ok, false)); assert.equal(st.S.homestead.animals[0].love, 8);
  });
  test('cook escrow reload/cancel restores inputs once and ignores unrelated old crop sales', () => {
    start(); st.S.crops = { strawberry: 2, wheat: 2 }; const t = ok(run('cookStart', { recipe: 'strawberry_tart' }));
    assert.equal(st.S.crops.wheat, 1); delete st.S.crops.wheat;
    st.flushSave(); assert.equal(st.load(), true); assert.equal(st.S.homestead.cooking.id, t.taskId); assert.equal(st.S.crops.wheat, undefined);
    ok(run('cookCancel', { taskId: t.taskId })); assert.equal(st.S.crops.wheat, 1); assert.equal(st.S.crops.strawberry, 2);
    unchanged(() => assert.equal(run('cookCancel', { taskId: t.taskId }).ok, false));
  });
  test('manual progress roundtrip cannot auto-finish offline, then settles exactly once', () => {
    start(); const t = ok(run('cookStart', { recipe: 'egg_custard' })); ok(run('cookStep', { taskId: t.taskId, activeMs: 12000, operation: 20, technique: 10, plated: false }));
    const file = st.exportSaveFile(); h.clock.now += 3600000; ok(st.importSaveFile(file.text)); assert.equal(st.S.homestead.cooking.activeMs, 12000);
    assert.equal(st.S.homestead.cooking.technique, 10); eq(cloud.validateCloudSave(st.S).data.homestead.cooking, st.S.homestead.cooking);
    unchanged(() => assert.equal(run('cookFinish', { taskId: t.taskId }).ok, false));
    ok(run('cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 30, plated: true })); const result = ok(run('cookFinish', { taskId: t.taskId }));
    assert.equal(result.score, 82); assert.equal(result.quality, 'tasty'); assert.equal(st.S.homestead.mastery.egg_custard.technique, 30);
    const coins = st.S.coins; st.flushSave(); assert.equal(st.load(), true); assert.equal(st.S.homestead.dishes[result.key], 1);
    unchanged(() => assert.equal(run('cookFinish', { taskId: t.taskId }).ok, false)); assert.equal(st.S.coins, coins);
  });
  test('legacy progress and mastery without technique survive client cloud and repeated normalization', () => {
    start(); const task = ok(run('cookStart', { recipe: 'egg_custard' }));
    ok(run('cookStep', { taskId: task.taskId, activeMs: 12000, operation: 20, technique: 20, plated: false }));
    const old = clone(st.S); delete old.homestead.cooking.technique;
    old.homestead.history.strawberry_tart = 3; old.homestead.mastery.strawberry_tart = { operation: 32, plating: 20 };
    const before = JSON.stringify(old); unchanged(() => format.validateSaveData(old)); unchanged(() => cloud.validateCloudSave(old));
    const normalized = unchanged(() => st.normalizeSaveData(old)); eq(normalized.homestead, old.homestead); eq(st.normalizeSaveData(normalized).homestead, normalized.homestead);
    assert.equal(JSON.stringify(old), before); unchanged(() => st.previewSaveImport(before)); ok(st.importSaveFile(before));
    st.flushSave(); assert.equal(st.load(), true); assert.equal(Object.hasOwn(st.S.homestead.cooking, 'technique'), false);
    eq(st.S.homestead.mastery.strawberry_tart, { operation: 32, plating: 20 });
    ok(run('cookStep', { taskId: task.taskId, activeMs: 24000, operation: 40, technique: 30, plated: true }));
    assert.equal(ok(run('cookFinish', { taskId: task.taskId })).score, 82);
    st.S.crops = { strawberry: 2, wheat: 1 }; const quick = ok(run('quickCook', { recipe: 'strawberry_tart', count: 1 }));
    assert.equal(quick.score, 84); assert.equal(quick.quality, 'tasty');
    const exported = st.exportSaveFile(); eq(cloud.validateCloudSave(JSON.parse(exported.text).data).data.homestead, st.S.homestead);
  });
  test('invalid optional technique is rejected by all save entrypoints without coercion or writes', () => {
    start(); const task = ok(run('cookStart', { recipe: 'egg_custard' }));
    ok(run('cookStep', { taskId: task.taskId, activeMs: 12000, operation: 20, technique: 10, plated: false }));
    const good = clone(st.S); good.homestead.mastery.egg_custard = { operation: 20, plating: 20, technique: 10 };
    for (const target of ['cooking', 'mastery']) for (const value of [null, '10', false, [], -1, .5, 21, 41, NaN, Infinity]) {
      const bad = clone(good), score = target === 'cooking' ? bad.homestead.cooking : bad.homestead.mastery.egg_custard; score.technique = value;
      for (const validate of [() => format.validateSaveData(bad), () => cloud.validateCloudSave(bad), () => st.normalizeSaveData(bad), () => st.previewSaveImport(JSON.stringify(bad)), () => st.replaceSaveData(bad)]) {
        unchanged(() => assert.throws(validate, /homestead|存档/));
      }
      unchanged(() => assert.equal(st.importSaveFile(JSON.stringify(bad)).ok, false)); invalidCases++;
    }
  });
  test('placed dish instance survives UTF8 export and cloud contract without cloning inventory', () => {
    start(); const d = cook('egg_custard'); const p = ok(run('place', { key: d.key, zone: 'home', surface: 'home_ranch_picnic_7_3_0_0', anchor: 'a2', rotation: 3 }));
    const file = unchanged(() => st.exportSaveFile()); const validated = unchanged(() => cloud.validateCloudSave(JSON.parse(file.text).data));
    eq(validated.data.homestead.placed, st.S.homestead.placed); ok(st.importSaveFile('\uFEFF' + file.text)); assert.equal(st.S.homestead.dishes[d.key], undefined);
    assert.equal(st.S.homestead.placed[0].id, p.instanceId); ok(run('retrieve', { instanceId: p.instanceId })); assert.equal(st.S.homestead.dishes[d.key], 1);
  });
  test('tea escrow survives reload/cancel and cannot be sold from the ordinary pantry', () => {
    start(); const d = cook('egg_custard'); const t = ok(run('teaStart', { keys: [d.key], guests: ['momo', 'man'] }));
    st.flushSave(); assert.equal(st.load(), true); assert.equal(st.S.homestead.tea.id, t.taskId);
    unchanged(() => assert.equal(run('sellDish', { key: d.key }).ok, false)); ok(run('teaCancel', { taskId: t.taskId })); assert.equal(st.S.homestead.dishes[d.key], 1);
    unchanged(() => assert.equal(run('teaCancel', { taskId: t.taskId }).ok, false));
  });
  test('existing NPC affection shape remains valid and story progress stays unchanged', () => {
    start(); const d = cook('egg_custard'), story = clone(st.S.live.story); st.S.homestead.dishes[d.key] = 3;
    ok(run('gift', { key: d.key, resident: 'man' })); const afterGift = st.S.npc.man.t;
    const t = ok(run('teaStart', { keys: [d.key], guests: ['man'] })); const coins = st.S.coins; ok(run('teaFinish', { taskId: t.taskId, skip: true }));
    assert.equal(st.S.npc.man.t, afterGift); assert.equal(st.S.npc.man.last, ''); eq(st.S.live.story, story); assert.equal(st.S.coins, coins);
    unchanged(() => format.validateSaveData(st.serializeState())); unchanged(() => cloud.validateCloudSave(clone(st.S)));
    st.flushSave(); assert.equal(st.load(), true); assert.equal(st.S.npc.man.t, afterGift);
  });
  test('client, import, replacement and server reject corrupted homestead state before writing', () => {
    start(); const good = clone(st.S);
    const mutations = [
      d => d.homestead.pantry.egg = -1, d => d.homestead.pantry.egg = .5, d => d.homestead.pantry.egg = Number.MAX_SAFE_INTEGER + 1,
      d => d.homestead.pantry.no_such_food = 1, d => d.homestead.dishes['egg_custard:legendary:plain'] = 1,
      d => d.homestead.animals[0].kind = 'dragon', d => d.homestead.animals[0].ready = 5, d => d.homestead.animals[0].feed = 5,
      d => d.homestead.animals.push(clone(d.homestead.animals[0])), d => d.homestead.extra = true, d => d.homestead.serial = 1,
      d => d.homestead.placed = [{ id: 'dish_99', key: 'egg_custard:normal:plain', zone: 'town', surface: 'bad', anchor: 'a0', rotation: 0 }],
      d => d.homestead.cooking = { id: 'cook_9', recipe: 'egg_custard', variant: 'plain', count: 1, inputs: [{ id: 'wheat', count: 1 }], primeRatio: 0, startedAt: h.clock.now, readyAt: h.clock.now + 24000, activeMs: 24000, operation: 40, plating: 20 },
      d => d.homestead.tea = { id: 'tea_1', keys: ['egg_custard:normal:plain'], guests: ['xu'], startedAt: h.clock.now, readyAt: h.clock.now + 30000 },
    ];
    for (const mutate of mutations) {
      const bad = clone(good); mutate(bad);
      unchanged(() => assert.throws(() => format.validateSaveData(bad), /homestead|存档/)); unchanged(() => assert.throws(() => cloud.validateCloudSave(bad), /homestead|存档/));
      unchanged(() => assert.throws(() => st.previewSaveImport(JSON.stringify(bad)), /homestead|存档/)); unchanged(() => assert.throws(() => st.replaceSaveData(bad), /homestead|存档/));
      unchanged(() => assert.equal(st.importSaveFile(JSON.stringify(bad)).ok, false)); invalidCases++;
    }
  });
  test('local startup rejects corrupted homestead rather than accepting a blocked inventory', () => {
    start(); const bad = clone(st.S); bad.homestead.pantry.egg = -1; h.storage.set(key, JSON.stringify(bad));
    assert.equal(st.load(), false); assert.equal(st.S.homestead.pantry.egg, undefined);
  });
  test('transaction receipt and dish consumption survive reload retries', () => {
    start(); const d = cook('egg_custard'); st.S.homestead.dishes[d.key] = 2; const coins = st.S.coins;
    ok(run('sellDish', { key: d.key, requestId: 'persisted-sale-1' })); st.flushSave(); assert.equal(st.load(), true);
    unchanged(() => assert.equal(run('sellDish', { key: d.key, requestId: 'persisted-sale-1' }).duplicate, true));
    assert.equal(st.S.coins, coins + rules.dishPrice(d.key)); assert.equal(st.S.homestead.dishes[d.key], 1);
  });
  test('durable transaction writes one successful snapshot and retry does not persist twice', () => {
    fresh(); const before = h.writes.length;
    ok(transactions.applyHomesteadAction({ type: 'tutorial', requestId: 'durable-tutorial' }, h.clock.now));
    assert.equal(h.writes.length - before, 1); assert.equal(h.writes.at(-1), key); assert.equal(h.timers.size, 0);
    eq(JSON.parse(h.storage.get(key)).homestead, st.S.homestead);
    unchanged(() => assert.equal(transactions.applyHomesteadAction({ type: 'tutorial', requestId: 'durable-tutorial' }, h.clock.now).duplicate, true));
  });
  test('storage quota failure rolls back homestead, coins, crops and receipts without touching disk', () => {
    start(); const state = JSON.stringify(st.S), disk = JSON.stringify([...h.storage]), writes = h.writes.length, originalSet = h.storage.set;
    h.storage.set = function () { const error = new Error('simulated quota'); error.name = 'QuotaExceededError'; throw error; };
    try { assert.equal(transactions.applyHomesteadAction({ type: 'buyFeed', count: 4, requestId: 'quota-feed' }, h.clock.now).ok, false); }
    finally { h.storage.set = originalSet; }
    assert.equal(JSON.stringify(st.S), state); assert.equal(JSON.stringify([...h.storage]), disk); assert.equal(h.writes.length, writes); assert.equal(h.timers.size, 0);
  });
  test('unfinished decoration defers persistence and rolls back only the new cooking transaction', () => {
    start(); const context = h.modules.get(path.join(h.root, 'js/core/state.js')).context;
    vm.runInContext('globalThis.__nuannuanDecorTransaction = true;', context);
    const state = JSON.stringify(st.S), disk = JSON.stringify([...h.storage]), writes = h.writes.length;
    try { assert.equal(transactions.applyHomesteadAction({ type: 'cookStart', recipe: 'egg_custard', requestId: 'decor-cook' }, h.clock.now).ok, false); }
    finally { vm.runInContext('delete globalThis.__nuannuanDecorTransaction;', context); }
    assert.equal(JSON.stringify(st.S), state); assert.equal(JSON.stringify([...h.storage]), disk); assert.equal(h.writes.length, writes);
  });
  // Actual scene graph and world module, with only text/UI/audio boundaries replaced; no WebGL context.
  await worldChecks(h.root, names);
  const report = { ok: true, checks: names.length, invalidCases, names, scope: 'real client state/import/export/local load + server save contract; synthetic in-memory storage; no DB/network/browser/device' };
  const out = process.argv.indexOf('--out'); if (out >= 0) { const target = path.resolve(process.argv[out + 1]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify(report));
}

async function worldChecks(root, names) {
  const stubs = new Map([
    ['js/core/state.js', `export let S = {}; const listeners = new Map();
      export const bus = { on(k, f) { if (!listeners.has(k)) listeners.set(k,new Set()); listeners.get(k).add(f); return () => listeners.get(k)?.delete(f); }, emit(k) { for(const f of listeners.get(k)||[]) f(); } };
      export const save = () => {}; export const flushSave = () => true; export function setForTest(next) { S=next; bus.emit('stateReplaced'); }`],
    ['js/core/app.js', 'export const app = {};'],
    ['js/core/kit.js', `import * as THREE from 'three'; export {THREE};
      export function group(x=0,y=0,z=0) { const g=new THREE.Group();g.position.set(x,y,z);return g; }
      export function box(w,h,d,color,x=0,y=0,z=0) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:color||'#fff'}));m.position.set(x,y+h/2,z);return m; }
      export const slab=(w,d,r,h,color,x=0,y=0,z=0)=>box(w,h,d,color,x,y,z);
      export const textPlane=()=>group();
      export function disposeSceneResources(root) {root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}`],
    ['js/models/character.js', `import * as THREE from 'three'; export class Character {constructor(){this.root=new THREE.Group();} setPose(){} update(){}} export class Momo extends Character {} export const randomNpcLook = value=>value;`],
    ['js/live/people.js', 'export const RESIDENT_LAYOUT={man:{look:1},he:{look:2}};'],
    ['js/live/photo.js', 'export const photo={on:false,enter(){this.on=true;}};'],
    // Precise crop navigation runs with the real Farm in ingredient_target_checks.cjs.
    // This legacy scene fixture has no crop state; fail loudly if it starts using these rules.
    ['js/world/farm.js', `export const treeInfo=()=>{throw new Error('Unexpected tree probe in legacy scene fixture')}; export const plotRemain=()=>{throw new Error('Unexpected crop probe in legacy scene fixture')};`],
    ['js/live/homestead-panels.js', 'export const installHomesteadUI=()=>({dispose(){},openRanch(){},openKitchen(){},openPantry(){},openDishActions(){}});'],
  ]);
  const build = await require('esbuild').build({ stdin: { contents: `export {installHomestead} from './js/world/homestead.js'; export {S,bus,setForTest} from './js/core/state.js'; export * from './js/shared/homestead.js'; export {setZone,resolve} from './js/world/town/navigation.js'; export {HOME,LOT,sdRR} from './js/world/town/layout.js'; export * as THREE from 'three';`, resolveDir: root },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['three'], plugins: [{ name: 'scene-boundaries', setup(b) { b.onLoad({ filter: /\.js$/ }, args => { const source = stubs.get(path.relative(root, args.path).replace(/\\/g, '/')); if (source !== undefined) return { contents: source, resolveDir: path.dirname(args.path) }; }); } }] });
  const sceneDocument = { hidden: false, hasFocus: () => true, documentElement: { classList: { contains: () => false } } };
  const sceneWindow = { innerWidth: 866, innerHeight: 412 };
  const module = { exports: {} }; new Function('require', 'module', 'exports', 'document', 'window', build.outputFiles[0].text)(require, module, module.exports, sceneDocument, sceneWindow); const w = module.exports, THREE = w.THREE;
  const pass = (name, fn) => { fn(); names.push(name); console.log('PASS ' + name); }, ok = r => { assert.equal(r.ok, true, r.message); return r; };
  const now = Date.now(), initial = { coins: 10000, crops: {}, npc: { man: { t: 1, last: '' } }, decor: {}, owned: [], live: {}, yardLv:1,
    placed:[{id:'ranch_coop',gx:2,gz:3,rot:0},{id:'ranch_barn',gx:12,gz:3,rot:0},{id:'ranch_picnic',gx:7,gz:3,rot:0}],
    buildPlaced:[{id:'dining',gx:3,gz:4,rot:1,level:1}] };
  ok(w.performHomestead(initial, { type: 'tutorial' }, now));
  initial.homestead.dishes['egg_custard:normal:plain'] = 2;
  const placed = ok(w.performHomestead(initial, { type: 'place', key: 'egg_custard:normal:plain', zone: 'build', surface: 'build_dining_3_4_1_1', anchor: 'a0', rotation: 2 }, now));
  ok(w.performHomestead(initial, { type: 'teaStart', keys: ['egg_custard:normal:plain'], guests: ['momo'] }, now));
  w.setForTest(initial);
  const scene = new THREE.Scene(), table = new THREE.Group(); table.position.set(-700, 2.4, 5); table.rotation.y = Math.PI/2; scene.add(table);
  const rec = { e: { id: 'dining', gx: 3, gz: 4, rot: 1, level: 1 }, obj: table };
  const homeEntries=initial.placed.map(e=>{const obj=new THREE.Group();obj.position.set(w.LOT.x0+e.gx+1.5,.05,w.LOT.z0+e.gz+1.5);scene.add(obj);return{e,obj};});
  const town = { scene, decors: { home: { entries: homeEntries }, house: { entries: [] }, build: { entries: [rec] } }, rooms: {}, rects: [], circles: [], ticks: [],
    zone: 'build', night: 0, photoOn: false, camMode: 'play', decor: { active: false }, pos: new THREE.Vector3(-700,2.4,5),
    blocked(){return false;},camera:new THREE.PerspectiveCamera(),player:{root:new THREE.Group()},
    momo: { root: new THREE.Group() }, waterU: { ctr:{value:new THREE.Vector2()}, hsz:{value:new THREE.Vector2()}, rad:{value:0} },
    allInter(){return[];}, addRect(x0,x1,z0,z1,tag){const r={x0,x1,z0,z1,tag};this.rects.push(r);return r;}, renderOptimizer:{invalidateBounds(){}} };
  town.momo.root.name='the-original-momo';scene.add(town.momo.root);
  const ui = { refreshAll(){}, toast(){} }, travel = [], game = { town, travel(zone){travel.push({zone});return w.setZone(town,zone);},buildIslandAction(){travel.push({zone:'home'});return w.setZone(town,'home');} };
  town.resolve=(p,r)=>w.resolve(town,p,r);
  const api = w.installHomestead(game,ui), tick = () => [...town.ticks].forEach(f=>f(1,.016));
  pass('world anchors use real table rotation and floor height, animals appear beside actual home housing', () => {
    const dish = api.dishes.get(placed.instanceId), expected = table.localToWorld(new THREE.Vector3(-.46,.865,0));
    assert(dish.position.distanceTo(expected)<1e-8); assert(Math.abs(dish.rotation.y-(Math.PI/2+Math.PI))<1e-8);
    assert.equal(api.animals.size,1);for(const a of api.animals.values()){assert(a.model.position.x>w.LOT.x0&&a.model.position.x<w.LOT.x0+28);assert(a.model.position.z>w.LOT.z0&&a.model.position.z<w.LOT.z0+18);assert.equal(a.home.key,'home_ranch_coop_2_3_0_0');}
  });
  pass('world save replacement rebuilds same-ID animal/dish/tea models without duplicate scene roots', () => {
    assert.equal(scene.children.some(o=>o.name==='tea-dish-0'),false,'off-zone tea has no temporary scene actor or dish');
    town.zone='home';w.bus.emit('zoneChanged');tick();
    const oldAnimal = [...api.animals.values()][0].model, oldDish = api.dishes.get(placed.instanceId), oldTea = scene.children.find(o=>o.name==='tea-dish-0');
    assert(oldTea,'arriving at the actual table creates its tea dish');
    const next = JSON.parse(JSON.stringify(w.S)); next.homestead.animals[0].kind='cow'; next.homestead.placed[0].key='strawberry_tart:normal:plain'; next.homestead.tea.keys=['moon_cake:normal:plain']; next.homestead.tea.guests=['man'];
    w.setForTest(next);tick();
    assert.equal(oldAnimal.parent,null);assert.equal(oldDish.parent,null);assert.equal(oldTea.parent,null);
    assert.equal([...api.animals.values()][0].model.userData.species,'cow');assert.equal(api.dishes.get(placed.instanceId).userData.dishId,'strawberry_tart');
    assert.equal(scene.children.filter(o=>o.userData?.kind==='homestead-animal').length,1);assert.equal(scene.children.filter(o=>o.name==='tea-dish-0' && o.userData.dishId==='moon_cake').length,1);
    assert.equal(town.momo.root.parent,scene);assert.equal(scene.children.filter(o=>o.name==='the-original-momo').length,1);
  });
  pass('leaving the tea zone releases temporary guests while retaining the saved meal',()=>{
    const oldTea=scene.children.find(o=>o.name==='tea-dish-0'),meal=JSON.stringify(w.S.homestead.tea);
    town.zone='build';w.bus.emit('zoneChanged');tick();
    assert.equal(oldTea.parent,null);assert.equal(scene.children.some(o=>o.name==='tea-dish-0'),false);assert.equal(JSON.stringify(w.S.homestead.tea),meal);
    assert.equal(town.momo.root.parent,scene);assert.equal(scene.children.filter(o=>o.name==='the-original-momo').length,1);
  });
  pass('world rotated or moved furniture returns attached dishes once and clears stale models', () => {
    rec.e.rot=2;table.rotation.y=Math.PI;w.bus.emit('decorChanged');tick();
    assert.equal(w.S.homestead.placed.length,0);assert.equal(w.S.homestead.dishes['strawberry_tart:normal:plain'],1);assert.equal(api.dishes.size,0);
    w.bus.emit('decorChanged');tick();assert.equal(w.S.homestead.dishes['strawberry_tart:normal:plain'],1);
  });
  const arrived=await api.visitRanch();
  const farmFixtures=[['plot',4],['bigplot',15]].map(([id,x])=>{const obj=new THREE.Group();obj.position.set(w.LOT.x0+x,.05,w.LOT.z0+10);scene.add(obj);return {e:{id},obj};});
  town.decors.home.entries.push(...farmFixtures);
  const fieldVisited=await api.visitFarm(),fieldPosition=town.pos.clone();
  const orchardVisited=await api.visitFarm({fruit:true}),orchardPosition=town.pos.clone();
  pass('world crop and fruit shortcuts approach their own actual field types',()=>{
    assert(fieldVisited&&orchardVisited);assert(fieldPosition.distanceTo(farmFixtures[0].obj.position)<3);assert(orchardPosition.distanceTo(farmFixtures[1].obj.position)<3);assert(fieldPosition.distanceTo(orchardPosition)>7);
  });
  for(const fixture of farmFixtures){town.decors.home.entries.splice(town.decors.home.entries.indexOf(fixture),1);fixture.obj.removeFromParent();}
  pass('world ranch entry stays on enlarged home island, uses shared water and has only player-built facilities', () => {
    assert.equal(arrived,true);assert.equal(town.zone,'home');assert.equal(town.waterU.ctr.value.x,w.HOME.cx);assert.equal(town.rooms.ranch,undefined);
    const p=new THREE.Vector3(-400,0,99);w.resolve(town,p,.36);assert(w.sdRR(p.x,p.z,w.HOME)<0);
    const ids=town.allInter().map(i=>i.id);assert(!ids.includes('ranch_return'));assert(!ids.includes('ranch_kitchen'));assert(ids.includes('home_ranch_coop_2_3_0_0'));assert(ids.some(id=>id.startsWith('animal_')));
    assert.equal(api.leaveRanch(),true);assert.equal(town.zone,'town');assert.equal(travel.length,2);
  });
  pass('world removes animal visuals when housing is stored and returns interrupted tea food once', () => {
    const oldAnimal=[...api.animals.values()][0].model,food=w.S.homestead.tea.keys[0];w.S.placed=[];town.decors.home.entries=[];w.bus.emit('decorChanged');tick();
    assert.equal(api.animals.size,0);assert.equal(oldAnimal.parent,null);assert.equal(w.S.homestead.tea,null);assert.equal(w.S.homestead.dishes[food],1);w.bus.emit('decorChanged');tick();assert.equal(w.S.homestead.dishes[food],1);
  });
  pass('world disposal releases dynamic roots, interactions, collisions and tick callback', () => {
    api.dispose();assert.equal(town.ticks.length,0);assert.equal(town.rooms.ranch,undefined);assert.equal(town.rects.length,0);assert.equal(game.homesteadWorld,undefined);
    assert.equal(scene.children.filter(o=>o.userData?.kind?.startsWith('homestead-')).length,0);
    assert.equal(town.momo.root.parent,scene);
  });
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
