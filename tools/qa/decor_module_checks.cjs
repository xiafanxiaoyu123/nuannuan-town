// Pure-memory Decor regression. Optional --baseline replays the same scenarios against a saved source file.
// Three.js math/scene objects and building/furniture rules are real; browser, audio, saves and models are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const THREE = require('three');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const plain = value => JSON.parse(JSON.stringify(value));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function compile(file, localPlay) {
  const stubs = {
    'core/kit.js': `export const THREE=__h.THREE, group=()=>new THREE.Group(), rboxGeo=(x,y,z)=>new THREE.BoxGeometry(x,y,z), disposeSceneResources=__h.dispose;`,
    'core/state.js': `export const S=__h.S,bus=__h.bus,spend=__h.spend,stat=__h.stat,save=__h.save,flushSave=__h.flushSave,addCoins=__h.addCoins,decorSellPrice=id=>Math.floor(__h.defs[id].price*.5);`,
    'core/audio.js': `export const audio={sfx:name=>__h.log.push(['sound',name])};`,
    'core/fx.js': `export const fx={sparkle:()=>__h.log.push(['sparkle'])};`,
    'core/util.js': `export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),popIn=()=>{},tween=()=>{},ease={outCubic:x=>x};`,
    'core/app.js': `export const app={ray:(...args)=>__h.ray?__h.ray(...args):({intersectObjects:()=>[]})};`,
    'core/local-play-mode.js': `export const LOCAL_PLAY=${!!localPlay};`,
    'models/props.js': `export const buildDecor=__h.buildDecor;`,
  };
  const result = await esbuild.build({
    stdin: { contents: fs.readFileSync(file, 'utf8') + '\nexport { DECO as fixtureDefs, FLOOR as fixtureFloors } from "../data.js";', resolveDir: path.join(root, 'js/world'), sourcefile: 'decor-under-test.js', loader: 'js' },
    bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2020', logLevel: 'silent',
    plugins: [{ name: 'decor-fixtures', setup(build) {
      build.onResolve({ filter: /^\./ }, item => {
        const resolved = path.resolve(item.resolveDir, item.path);
        const key = path.relative(path.join(root, 'js'), resolved).replaceAll('\\', '/');
        if (Object.hasOwn(stubs, key)) return { path: key, namespace: 'decor-fixture' };
      });
      build.onLoad({ filter: /.*/, namespace: 'decor-fixture' }, item => ({ contents: stubs[item.path], loader: 'js' }));
    } }],
  });
  return result.outputFiles[0].text;
}

function fixture(code, zone = 'house', initial = {}) {
  const log = [], listeners = new Map(), handlers = new Map();
  const S = { coins: 10000, decor: {}, placedIn: [], floorIn: {}, placedOut: [], floorOut: {}, placedBuild: [], floorBuild: {}, wallsIn: [], house: 3, stats: {}, ...plain(initial) };
  const h = { THREE, S, log, disposed: 0, saves: 0, flushes: 0, defs: {} };
  const eventValue = value => value?.isObject3D ? { model: value.userData.fixtureId || '' } : value?.cfg && value?.town ? { decor: value.cfg.key } : Array.isArray(value) ? value.map(eventValue) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, eventValue(v)])) : value;
  h.bus = { on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); }, emit(name, ...values) { log.push([name, ...values.map(eventValue)]); for (const fn of handlers.get(name) || []) fn(...values); } };
  h.spend = cost => { if (S.coins < cost) return false; S.coins -= cost; log.push(['spend', cost]); return true; };
  h.stat = (name, n = 1) => { S.stats[name] = (S.stats[name] || 0) + n; log.push(['stat', name, n]); };
  h.save = () => { h.saves++; };
  h.flushSave = () => { h.flushes++; };
  h.addCoins = (n, reason) => { S.coins += n; log.push(['income', n, reason]); };
  const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  h.buildDecor = id => {
    const model = new THREE.Group(); model.userData.fixtureId = id;
    const size = h.defs[id]?.size || [1, 1];
    model.add(new THREE.Mesh(new THREE.BoxGeometry(size[0] * .85, 1, size[1] * .85), sharedMaterial));
    return model;
  };
  h.dispose = object => { h.disposed++; object.traverse(child => { child.geometry?.dispose(); }); };
  const canvasContext = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
  const inputCanvas = {};
  const context = vm.createContext({ console, __h: h, module: { exports: {} }, document: { createElement: () => ({ getContext: () => canvasContext, toDataURL: () => 'data:image/png;fixture' }), elementFromPoint: () => h.outside ? null : inputCanvas }, window: { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); } } });
  vm.runInContext(code, context);
  const api = context.module.exports; h.defs = api.fixtureDefs;
  const town = { zone, scene: new THREE.Scene(), rects: [], pos: new THREE.Vector3(10, 0, 7), inputCanvas, decors: {}, moveTo: null,
    seasons: { scanTrees() {}, clearSubtree() {} }, farm: { hasCrop: entry => !!entry.crop },
    addRect(x0, x1, z0, z1, kind) { const rect = { x0, x1, z0, z1, kind }; this.rects.push(rect); return rect; },
    setMode(mode) { this.mode = mode; }, resolve() {}, groundPoint(x, z) { return new THREE.Vector3(x, 0, z); }, wallPoint() { return null; },
    partitions: { enabled: true, preview: new THREE.Group(), validate: walls => walls.some(w => w.bad) ? { ok: false, error: 'fixture invalid wall' } : { ok: true }, fitsFurniture: () => true, rebuild() {}, cancel() {}, updatePreview() {}, begin: () => false },
    renderOptimizer: { invalidateDecor() {}, invalidateBounds() {} },
  };
  const cfg = { key: zone, placedKey: zone === 'house' ? 'placedIn' : zone === 'home' ? 'placedOut' : 'placedBuild', floorKey: zone === 'house' ? 'floorIn' : zone === 'home' ? 'floorOut' : 'floorBuild', freeBuild: zone === 'build', lot: { x0: 0, z0: 0, cols: 22, rows: 15 }, blocked: [[0, 0, 0, 0]], zoom: 32, dz: 0, defaultFloor: () => ({}) };
  const d = new api.DecorSys(town, cfg); town.decors[zone] = d;
  const capture = () => plain({ S, active: d.active, globalTransaction: context.__nuannuanDecorTransaction, pendingCost: d.pendingCost, history: d.history, pendingMove: d.pendingMove, selected: d.sel, focus: d.focus?.e || null, continuous: d.continuous, pickup: d.pickupMode, floorSel: d.floorSel, buildLevel: d.buildLevel, camera: [d.cameraMode, d.viewYaw, d.viewPitch, d.zoom, d.pan], gridCount: d.grid.count, ghost: [d.ghost.visible, d.ghost.position.toArray(), d.plate.material.color.getHex(), d.ghostHolder.children.length], models: d.entries.map(rec => ({ entry: rec.e, position: rec.obj.position.toArray(), rotation: rec.obj.rotation.y, rects: rec.rect })), occupancy: [d.occ, d.occUnder, d.occPlanes, d.occEdges, d.occCaps, d.occFoundations].map(layer => [...layer].map(([key, rec]) => [key, rec.e])), sceneCount: town.scene.children.length, rects: town.rects, saves: h.saves, flushes: h.flushes, disposed: h.disposed, log });
  const place = (id, gx, gz, pointerId = 17) => {
    d.select(id); const prev = d.tileAt; const size = d.size(id, d.rot); d.tileAt = () => ({ fx: gx + size[0] / 2, fz: gz + size[1] / 2 });
    const event = { button: 0, pointerId, pointerType: 'mouse', clientX: gx, clientY: gz }; d.onDown(event); d.onUp(event, 0); d.tileAt = prev;
  };
  return { d, S, h, town, cfg, api, context, capture, place, dispatch: name => { for (const fn of listeners.get(name) || []) fn(); }, sharedMaterial };
}

const scenarios = [
  ['constructor-and-public-contract', f => {
    const { d, api } = f; const fields = Object.keys(d).sort();
    const methods = Object.getOwnPropertyNames(api.DecorSys.prototype).sort().map(name => { const descriptor = Object.getOwnPropertyDescriptor(api.DecorSys.prototype, name); return [name, descriptor.value?.length ?? null, !!descriptor.get]; });
    assert.equal(d.active, false); assert.equal(d.pendingCost, 0); assert.ok(d.grid.count > 0);
    return { fields, methods, state: f.capture() };
  }],
  ['purchases-undo-income-and-inventory', f => {
    const { d, S, place } = f; d.enter(); const coins = S.coins, steps = [];
    for (let i = 0; i < 4; i++) { place('chair', 5, 5); assert.equal(S.coins, coins); assert.equal(d.pendingCost, f.api.fixtureDefs.chair.price); assert.equal(d.undo(), true); assert.equal(d.pendingCost, 0); }
    place('chair', 5, 5); S.coins += 73; S.decor.sofa = 2; assert.equal(d.undo(), true); assert.equal(S.coins, coins + 73); assert.equal(S.decor.sofa, 2); steps.push(f.capture());
    S.decor.chair = 1; place('chair', 5, 5); assert.equal(S.decor.chair, 0); assert.equal(d.pendingCost, 0); assert.equal(d.undo(), true); assert.equal(S.decor.chair, 1); steps.push(f.capture()); return steps;
  }],
  ['failed-final-payment-pagehide-and-repeat-save', f => {
    const { d, S, place, dispatch, context, h } = f; d.enter(); place('chair', 5, 5); const price = d.pendingCost; S.coins = 0;
    assert.equal(d.exit(), false); assert.equal(d.active, true); assert.equal(context.__nuannuanDecorTransaction, true);
    dispatch('pagehide'); assert.equal(h.flushes, 0); assert.equal(d.pendingCost, price); const blocked = f.capture();
    S.coins = price; assert.equal(d.exit(), true); assert.equal(S.coins, 0); assert.equal(d.pendingCost, 0); assert.equal(context.__nuannuanDecorTransaction, false);
    h.save(); h.save(); dispatch('pagehide'); assert.equal(S.coins, 0); assert.equal(h.flushes, 1); return [blocked, f.capture()];
  }],
  ['move-merge-rotate-store-and-sell-barrier', f => {
    const { d, S, place } = f; S.decor.chair = 1; d.enter(); place('chair', 5, 5); d.clearHistory(true); const initial = plain(S.placedIn);
    d.setFocus(d.entries[0]); d.focusMove(); const old = d.tileAt; d.tileAt = () => ({ fx: 8.5, fz: 6.5 }); const e = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 }; d.onDown(e); d.onUp(e, 0); d.tileAt = old;
    assert.equal(d.history.length, 1); assert.equal(d.undo(), true); assert.deepEqual(plain(S.placedIn), initial);
    d.setFocus(d.entries[0]); d.focusRotate(); assert.equal(d.undo(), true); d.setFocus(d.entries[0]); d.focusStore(false); assert.equal(d.undo(), true);
    d.setFocus(d.entries[0]); d.focusStore(true); assert.equal(d.canUndo, false); assert.equal(d.undo(), false); return f.capture();
  }],
  ['floor-stroke-layout-apply-and-undo', f => {
    const { d, S, place } = f; d.enter(); S.decor.chair = 3; place('chair', 5, 5); d.clearHistory(true);
    d.selectFloor('wood'); d.setContinuous(true); d.stroke = { before: d.snapshot(), cost: 0, count: 0, changed: false };
    for (const x of [3, 4, 5]) { d.cursor = { fx: x + .5, fz: 4.5 }; d.paint(); }
    d.finishStroke(); assert.equal(d.history.length, 1); const floorCost = 3 * f.api.fixtureFloors.wood.price; assert.equal(d.history[0].cost, floorCost);
    assert.equal(d.undo(), true); assert.equal(Object.keys(S.floorIn).length, 0);
    assert.equal(d.saveLayout(0, '  sample  ').ok, true); assert.equal(d.saveLayout(3, 'bad').ok, false);
    d.storeAll(); const before = d.snapshot(); assert.equal(d.applyLayout(0).ok, true); assert.equal(d.undo(), true); assert.deepEqual(d.snapshot(), before);
    assert.equal(d.deleteLayout(0), true); return f.capture();
  }],
  ['layout-invalid-supply-wallet-and-stale-history', f => {
    const { d, S, place } = f; d.enter(); const plan = { version: 1, zone: 'house', name: 'test', placed: [{ id: 'chair', gx: 4, gz: 4, rot: 0 }], floor: {} };
    assert.equal(d.validateLayout(plan).ok, false); assert.equal(d.validateLayout(plan, false).ok, true);
    for (const bad of [{ ...plan, zone: 'home' }, { ...plan, placed: [{ id: 'chair', gx: 99, gz: 4, rot: 0 }] }, { ...plan, placed: [...plan.placed, ...plan.placed] }, { ...plan, floor: { '01,2': 'wood' } }, { ...plan, walls: [{ bad: true }] }]) assert.equal(d.validateLayout(bad, false).ok, false);
    S.decor.chair = 1; S.coins = 0; assert.equal(d.validateLayout({ ...plan, floor: { '2,2': 'wood' } }).ok, false);
    S.coins = 10000; place('chair', 5, 5); S.placedIn.push({ id: 'chair', gx: 9, gz: 9, rot: 0 }); assert.equal(d.undo(), false); return f.capture();
  }],
  ['crop-protection', f => {
    const { d, S } = f; d.enter(); const crop = { id: 'plot', gx: 4, gz: 4, rot: 0, crop: true }; S.placedOut.push(crop); const rec = d.addObj(crop, false); d.setFocus(rec);
    assert.equal(d.cropSafe([]), false); assert.equal(d.focusMove(), false); assert.equal(d.focusStore(false), false); assert.equal(d.focusRotate(), false); d.storeAll(); assert.equal(S.placedOut.length, 1);
    assert.equal(d.validateLayout({ version: 1, zone: 'home', placed: [], floor: {} }, false).ok, false); return f.capture();
  }, 'home'],
  ['floor-support-and-dependent-removal', f => {
    const { d, S } = f; d.enter(); assert.equal(d.canPlace('chair', 5, 5, 0, null, 1), false);
    const base = { id: 'yard_column', gx: 5, gz: 5, rot: 0, level: 0 }; assert.equal(d.canPlace(base.id, base.gx, base.gz, 0), true); S.placedBuild.push(base); const rec = d.addObj(base, false);
    const child = { id: 'yard_slab', gx: 5, gz: 5, rot: 0, level: 1 }; assert.equal(d.canPlace(child.id, child.gx, child.gz, 0, null, 1), true); S.placedBuild.push(child); d.addObj(child, false);
    const result = { supported: plain(d.validateYard(S.placedBuild)), removal: d.canRemove(rec), unsupported: d.canPlace('yard_slab', 12, 12, 0, null, 1) };
    assert.equal(result.supported.ok, true); assert.equal(result.removal, false); assert.equal(result.unsupported, false); assert.equal(d.setBuildLevel(99), false); assert.equal(d.setBuildLevel(1), true); return { result, state: f.capture() };
  }, 'build'],
  ['camera-pointer-cancel-and-selection-guards', f => {
    const { d, S, dispatch } = f; d.enter(); d.select('chair'); const event = { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 5, clientY: 5 };
    d.setCameraMode('orbit'); d.onDown(event); d.onMove({ ...event, clientX: 70, clientY: 25 }); d.onUp(event, 0); assert.equal(S.placedIn.length, 0); assert.equal(d.sel, 'chair');
    d.setCameraMode('pan'); d.onDown(event); d.onMove({ ...event, clientX: 50 }); dispatch('pointercancel'); assert.equal(d.isDown, false); assert.equal(d.pointerStart, null);
    d.resetView(); d.onDown(event); d.onMove({ ...event, pointerId: 2, clientX: 999 }); assert.equal(d.dragDistance, 0); d.onUp({ ...event, pointerId: 2 }, 0); assert.equal(S.placedIn.length, 0);
    d.onDown(event); d.onUp(event, 100); assert.equal(S.placedIn.length, 0); return f.capture();
  }],
  ['preview-material-isolation-and-model-release', f => {
    const { d, h, sharedMaterial, S } = f; d.enter(); const baseline = h.disposed; d.select('yard_wall');
    let previewMaterial; d.ghostHolder.traverse(o => { if (o.isMesh) previewMaterial = o.material; });
    assert.notEqual(previewMaterial, sharedMaterial); assert.equal(previewMaterial.polygonOffset, true); assert.equal(sharedMaterial.polygonOffset, false);
    d.select(null); assert.equal(h.disposed, baseline + 1); const e = { id: 'chair', gx: 3, gz: 3, rot: 0, level: 0 }; S.placedBuild.push(e); const rec = d.addObj(e, false); d.takeOut(rec);
    assert.equal(d.entries.length, 0); assert.equal(d.occ.size, 0); assert.equal(f.town.rects.length, 0); assert.equal(h.disposed, baseline + 2); return f.capture();
  }, 'build'],
  ['reload-old-fields-and-floor-texture-cache', f => {
    const { d, S, api } = f; S.placedIn = [{ id: 'chair', gx: 4, gz: 3, rot: 1, lightOn: false }]; delete S.floorIn; delete S.decorLayouts;
    d.reload(); const initial = plain(S.placedIn); d.reload(); assert.deepEqual(plain(S.placedIn), initial); assert.equal(d.entries.length, 1); assert.equal(d.history.length, 0); assert.equal(d.pendingCost, 0);
    assert.equal(d.layoutSlots().length, 3); assert.equal(api.floorTex('wood'), api.floorTex('wood')); return f.capture();
  }],
];

async function main() {
  const baseline = option('--baseline'), output = option('--out');
  const current = path.join(root, 'js/world/decor.js');
  const source = await compile(current, false), before = baseline ? await compile(path.resolve(baseline), false) : null;
  const checks = [];
  for (const [name, run, zone = 'house'] of scenarios) {
    const actual = run(fixture(source, zone));
    if (before) assert.deepEqual(plain(actual), plain(run(fixture(before, zone))), name + ' differs from baseline');
    checks.push({ name, pass: true, baselineEqual: !!before }); console.log('PASS ' + name + (before ? ' (baseline equal)' : ''));
  }
  const localSource = await compile(current, true), localBefore = baseline ? await compile(path.resolve(baseline), true) : null;
  const localScenario = code => { const f = fixture(code); f.S.coins = 0; f.d.enter(); f.place('chair', 5, 5); assert.equal(f.S.placedIn.length, 1); assert.equal(f.d.pendingCost, 0); assert.equal(f.d.undo(), true); f.place('chair', 6, 6); assert.equal(f.d.exit(), true); assert.equal(f.S.coins, 0); return f.capture(); };
  const localResult = localScenario(localSource); if (localBefore) assert.deepEqual(localResult, localScenario(localBefore));
  checks.push({ name: 'local-play-economy-separation', pass: true, baselineEqual: !!localBefore }); console.log('PASS local-play-economy-separation');
  const report = { pass: true, checks, source: current, sourceSha256: hash(current), baseline: baseline ? path.resolve(baseline) : null, baselineSha256: baseline ? hash(baseline) : null, evidence: 'Pure-memory behavior comparison; synthetic models and browser/storage effects, real Three.js and placement rules; UI validation separate.' };
  if (output) { const target = path.resolve(output); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  console.log(JSON.stringify({ pass: true, checks: checks.length, baselineCompared: !!baseline, output: output || null }));
}
module.exports = { compile, fixture };
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
