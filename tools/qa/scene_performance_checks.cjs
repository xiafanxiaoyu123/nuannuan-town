// 渲染筛选确定性回归：真实 Three 对象/批次，内存场景；不启动 GPU、服务或玩家存档。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), crypto = require('crypto');
if (!vm.SourceTextModule) {
  const child = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), THREE = require('three');
const baseline = process.env.SCENE_BASELINE || process.argv[2];
const sourcePath = 'js/world/scene-performance.js', sceneryPath = 'js/world/town/scenery.js';
const before = baseline ? path.resolve(baseline) : null;
const clone = value => JSON.parse(JSON.stringify(value));
const checks = [];
const totals = () => ({ arrays: 0, filterCalls: 0, someCalls: 0, someVisits: 0, sliceCalls: 0, sets: 0, eligible: 0, near: 0, builds: 0 });
function trackedTypes(counts) {
  class TrackedArray extends Array {
    constructor(...args) { super(...args); counts.arrays++; }
    filter(fn, arg) { counts.filterCalls++; return super.filter(fn, arg); }
    some(fn, arg) { counts.someCalls++; return super.some((...a) => { counts.someVisits++; return fn.apply(arg, a); }); }
    slice(...args) { counts.sliceCalls++; return super.slice(...args); }
  }
  class TrackedSet extends Set { constructor(...args) { super(...args); counts.sets++; } }
  return { TrackedArray, TrackedSet };
}
async function optimizerType(old, counts) {
  const { TrackedSet } = trackedTypes(counts), context = vm.createContext({ console, Set: TrackedSet });
  const kit = new vm.SyntheticModule(['THREE'], function () { this.setExport('THREE', THREE); }, { context });
  const file = path.join(old ? before : root, sourcePath);
  const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
  await mod.link(specifier => { assert.equal(specifier, '../core/kit.js'); return kit; }); await mod.evaluate();
  return mod.namespace.ScenePerformance;
}
async function fixture(old = false) {
  const counts = totals(), { TrackedArray } = trackedTypes(counts), Optimizer = await optimizerType(old, counts);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); scene.children = new TrackedArray();
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({ color: '#ff88aa' });
  const records = new Map(), decors = {};
  const mesh = (name, x, options = {}) => {
    const obj = new THREE.Mesh(geometry, options.transparent ? new THREE.MeshStandardMaterial({ transparent: true, opacity: .5 }) : material);
    obj.name = name; obj.position.set(x, 0, 0); scene.add(obj); return obj;
  };
  mesh('plain-near', -8); mesh('plain-far', 900);
  const light = new THREE.DirectionalLight(); light.name = 'light'; scene.add(light);
  function decor(name, x) {
    return decors[name] = { lot: { x0: x - 10, cols: 20 }, entries: new TrackedArray() };
  }
  function rec(decor, name, x, options = {}) {
    const obj = mesh(name, x, options), record = { e: { id: options.id || 'chair' }, obj, tick: options.tick ? () => {} : null };
    if (options.hidden) obj.visible = false;
    if (options.scale) obj.scale.setScalar(options.scale);
    if (options.seasonal) obj.userData.seasonalPlant = true;
    if (options.childHidden) { const child = new THREE.Mesh(geometry, material); child.visible = false; obj.add(child); }
    decor.entries.push(record); records.set(name, record); return record;
  }
  const near = decor('home', 0), far = decor('house', 500);
  rec(near, 'chair-a', 1); rec(near, 'chair-b', 3); rec(near, 'animated', 4, { tick: true });
  rec(near, 'plant', 5, { seasonal: true }); rec(near, 'plot', 6, { id: 'plot' });
  rec(near, 'hidden', 7, { hidden: true }); rec(near, 'popping', 8, { scale: .3 });
  rec(near, 'transparent', 9, { transparent: true }); rec(near, 'hidden-child', 10, { childHidden: true });
  rec(far, 'far-chair', 501);
  const town = { scene, camera, decors }, optimizer = new Optimizer(town);
  for (const [name, count] of [['eligible', 'eligible'], ['near', 'near'], ['buildDecor', 'builds']]) {
    const fn = optimizer[name]; optimizer[name] = function (...args) { counts[count]++; return fn.apply(this, args); };
  }
  return { counts, town, optimizer, records, rec, near, far, reset: () => Object.assign(counts, totals()) };
}
function selectedSnapshot(scene) {
  return Array.from(scene.children, obj => obj.isInstancedMesh ? { batch: true, count: obj.count,
    geometry: obj.geometry.type, material: obj.material.color.getHex(), matrices: Array.from(obj.instanceMatrix.array),
    castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, renderOrder: obj.renderOrder, layers: obj.layers.mask }
    : { root: obj.name, visible: obj.visible, scale: obj.scale.toArray() });
}
function capture(f) {
  const original = f.town.scene.children, parents = Array.from(original, obj => obj.parent);
  let selected;
  const result = f.optimizer.render(() => { selected = selectedSnapshot(f.town.scene); return 'draw-result'; });
  assert.equal(result, 'draw-result'); assert.equal(f.town.scene.children, original);
  original.forEach((obj, i) => assert.equal(obj.parent, parents[i]));
  return { selected, stats: clone(f.optimizer.stats), caches: Array.from(f.optimizer.decorCaches.values(), cache => ({
    sources: Array.from(cache.sources, rec => rec.obj.name), replaced: Array.from(cache.replaced, obj => obj.name), batches: cache.batches.length })) };
}
async function test(label, fn) {
  const detail = await fn(); checks.push({ label, pass: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS ' + label);
}
async function loadIsland(old) {
  const context = vm.createContext({ console, Math, performance: { now: () => 0 } }), modules = new Map();
  function at(file) {
    if (modules.has(file)) return modules.get(file);
    let mod;
    if (file === 'three') mod = new vm.SyntheticModule(Object.keys(THREE), function () { for (const key of Object.keys(THREE)) this.setExport(key, THREE[key]); }, { context, identifier: file });
    else if (file === path.join(root, 'js/core/state.js')) mod = new vm.SyntheticModule(['bus'], function () { this.setExport('bus', { emit() {}, on() {} }); }, { context, identifier: file });
    else mod = new vm.SourceTextModule(fs.readFileSync(old && file === path.join(root, sceneryPath) ? path.join(before, sceneryPath) : file, 'utf8'), { context, identifier: file });
    modules.set(file, mod); return mod;
  }
  const mod = at(path.join(root, sceneryPath));
  await mod.link((specifier, from) => at(specifier === 'three' ? 'three' : specifier.startsWith('three/addons/')
    ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13)) : path.resolve(path.dirname(from.identifier), specifier)));
  await mod.evaluate();
  const town = { scene: new THREE.Scene(), seasons: { registerGround: object => object } };
  mod.namespace.buildIsland(town);
  const water = town.scene.children.find(object => object.material?.uniforms === town.waterU);
  assert.ok(water, 'actual buildIsland water'); assert.equal(water.geometry.parameters.width, 900); assert.equal(water.geometry.parameters.height, 900);
  return { town, water };
}
async function main() {
  await test('实际批次替换、根顺序、排除资格及当前区域保持', async () => {
    const current = await fixture(); const result = capture(current);
    assert.deepEqual(result.caches[0].replaced, ['chair-a', 'chair-b']);
    assert.equal(result.selected.filter(item => item.batch).length, 1);
    assert.equal(result.selected.at(-1).count, 2);
    assert.ok(result.selected.some(item => item.root === 'transparent'));
    assert.ok(!result.selected.some(item => item.root === 'plain-far'));
    if (before) assert.deepEqual(result, capture(await fixture(true)));
    return result.stats;
  });
  await test('稳定60帧：eligible逐条保留，消除筛选数组和Set分配/第二次sources扫描', async () => {
    async function run(old) {
      const f = await fixture(old); capture(f); f.reset();
      const refs = new Set();
      for (let i = 0; i < 60; i++) f.optimizer.render(() => refs.add(f.town.scene.children));
      const result = { ...f.counts, selectedArrays: refs.size };
      assert.equal(result.eligible, 60 * f.near.entries.length); assert.equal(result.near, 60 * f.town.scene.children.length); assert.equal(result.builds, 0);
      if (!old) { assert.equal(result.arrays, 0); assert.equal(result.filterCalls, 0); assert.equal(result.someVisits, 0); assert.equal(result.sets, 0); assert.equal(refs.size, 1); }
      return result;
    }
    const current = await run(false), old = before ? await run(true) : null;
    if (old) { assert.equal(old.arrays, 180); assert.equal(old.sets, 60); assert.equal(old.selectedArrays, 60); assert.equal(old.eligible, current.eligible); assert.equal(old.near, current.near); }
    return { frames: 60, current, before: old, counting: 'TrackedArray counts only filter/slice arrays; reusable selected/replaced identities also checked. This is not an elapsed-time benchmark.' };
  });
  await test('缩放/显隐/动画资格与新增删除重排在同revision立即更新', async () => {
    async function run(old) {
      const f = await fixture(old), results = [capture(f)];
      f.records.get('popping').obj.scale.setScalar(1); results.push(capture(f));
      f.records.get('hidden').obj.visible = true; results.push(capture(f));
      f.records.get('chair-a').obj.visible = false; results.push(capture(f));
      f.records.get('animated').tick = null; results.push(capture(f));
      f.records.get('plant').obj.userData.seasonalPlant = false; results.push(capture(f));
      f.near.entries.reverse(); results.push(capture(f));
      f.rec(f.near, 'new-chair', -1); results.push(capture(f));
      f.near.entries.splice(f.near.entries.indexOf(f.records.get('chair-b')), 1); results.push(capture(f));
      f.near.entries.length = 0; results.push(capture(f));
      assert.equal(results.at(-1).caches[0].sources.length, 0); assert.equal(results.at(-1).caches[0].batches, 0);
      return results;
    }
    const current = await run(false); if (before) assert.deepEqual(current, await run(true)); return { states: current.length };
  });
  await test('显式失效重建释放旧批次，清空与dispose不释放共享几何材质', async () => {
    const f = await fixture(); capture(f); let disposed = 0, sharedDisposed = 0;
    f.records.get('chair-a').obj.geometry.addEventListener('dispose', () => sharedDisposed++);
    f.records.get('chair-a').obj.material.addEventListener('dispose', () => sharedDisposed++);
    for (let i = 0; i < 5; i++) {
      const cache = f.optimizer.decorCaches.get(f.near); for (const batch of cache.batches) batch.addEventListener('dispose', () => disposed++);
      f.optimizer.invalidateDecor(); capture(f); assert.equal(disposed, i + 1);
    }
    for (const batch of f.optimizer.decorCaches.get(f.near).batches) batch.addEventListener('dispose', () => disposed++);
    f.optimizer.dispose(); assert.equal(disposed, 6); assert.equal(sharedDisposed, 0); assert.equal(f.optimizer.decorCaches.size, 0); assert.equal(f.optimizer.renderFrames.length, 0);
    capture(f); assert.equal(f.optimizer.renderDepth, 0); return { disposed, sharedDisposed };
  });
  await test('嵌套渲染每层独立，内层异常后继续外层，外层异常也恢复原数组和parent', async () => {
    const f = await fixture(), scene = f.town.scene, original = scene.children;
    let outerRef, innerRef;
    f.optimizer.render(() => {
      outerRef = scene.children; const outer = selectedSnapshot(scene);
      assert.throws(() => f.optimizer.render(() => { innerRef = scene.children; assert.notEqual(innerRef, outerRef); throw new Error('nested-draw'); }), /nested-draw/);
      assert.equal(scene.children, outerRef); assert.deepEqual(selectedSnapshot(scene), outer);
      assert.equal(f.optimizer.render(() => 42), 42); assert.equal(scene.children, outerRef);
    });
    assert.equal(scene.children, original); assert.equal(f.optimizer.renderDepth, 0);
    assert.throws(() => f.optimizer.render(() => { f.optimizer.render(() => {}); throw new Error('outer-draw'); }), /outer-draw/);
    assert.equal(scene.children, original); original.forEach(obj => assert.equal(obj.parent, scene));
    assert.equal(f.optimizer.renderDepth, 0); assert.equal(f.optimizer.renderFrames.length, 2);
    for (const frame of f.optimizer.renderFrames) { assert.equal(frame.selected.length, 0); assert.equal(frame.batches.length, 0); assert.equal(frame.replaced.size, 0); }
    return { bufferDepth: f.optimizer.renderFrames.length };
  });
  await test('筛选与批次准备异常不遗留缓冲状态，禁用路径保持直接返回', async () => {
    const f = await fixture(), scene = f.town.scene, original = scene.children, near = f.optimizer.near;
    f.optimizer.near = () => { throw new Error('near-failed'); };
    assert.throws(() => f.optimizer.render(() => {}), /near-failed/);
    assert.equal(scene.children, original); assert.equal(f.optimizer.renderDepth, 0); f.optimizer.near = near;
    const furniture = f.optimizer.furniture; f.optimizer.furniture = () => { throw new Error('furniture-failed'); };
    assert.throws(() => f.optimizer.render(() => {}), /furniture-failed/); assert.equal(f.optimizer.renderDepth, 0); f.optimizer.furniture = furniture;
    capture(f); f.optimizer.enabled = false; assert.equal(f.optimizer.render(() => scene.children), original); assert.equal(f.optimizer.renderDepth, 0);
  });
  await test('直接返回当前绘制列表保留返回值身份和内容，后续绘制不覆盖', async () => {
    const f = await fixture(); let observed;
    const result = f.optimizer.render(() => observed = f.town.scene.children);
    assert.equal(result, observed); assert.ok(result.length > 0);
    const snapshot = Array.from(result); capture(f); assert.deepEqual(Array.from(result), snapshot);
    assert.notEqual(f.optimizer.renderFrames[0].selected, result);
  });
  await test('跨区首帧、远近边界及嵌套结果与旧筛选保持一致', async () => {
    async function run(old) {
      const f = await fixture(old), out = [];
      for (const x of [0, 179, 180, 181, 500, 900, 0]) { f.town.camera.position.x = x; out.push(capture(f)); }
      f.optimizer.render(() => { out.push(selectedSnapshot(f.town.scene)); f.optimizer.render(() => out.push(selectedSnapshot(f.town.scene))); out.push(selectedSnapshot(f.town.scene)); });
      return clone(out);
    }
    const current = await run(false); if (before) assert.deepEqual(current, await run(true)); return { scenarios: current.length };
  });
  await test('实际buildIsland水面：全局标记不改模型或着色器，每帧少一次Box3计算', async () => {
    const current = await loadIsland(false), old = before ? await loadIsland(true) : null;
    assert.equal(current.water.userData.renderGlobal, true);
    const shape = water => ({ type: water.geometry.type, parameters: water.geometry.parameters, pos: water.position.toArray(), rotation: water.rotation.toArray(),
      vertex: water.material.vertexShader, fragment: water.material.fragmentShader, transparent: water.material.transparent });
    if (old) assert.deepEqual(shape(current.water), shape(old.water));
    async function count(island, oldImplementation) {
      const Optimizer = await optimizerType(oldImplementation, totals()), optimizer = new Optimizer({ ...island.town, camera: new THREE.PerspectiveCamera(), decors: {} });
      let calls = 0; const set = optimizer.box.setFromObject; optimizer.box.setFromObject = function (...args) { calls++; return set.apply(this, args); };
      for (let i = 0; i < 60; i++) assert.equal(optimizer.near(island.water, [-500, 0, 500, 1500][i % 4]), true);
      return calls;
    }
    const currentCalls = await count(current, false), oldCalls = old ? await count(old, true) : null;
    assert.equal(currentCalls, 0); if (old) assert.equal(oldCalls, 60);
    return { frames: 60, currentBoxCalls: currentCalls, beforeBoxCalls: oldCalls };
  });
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report = { pass: true, scope: 'Pure Node + real Three, deterministic behavior/counts only; no GPU/timing/device conclusions',
    baseline: before, files: [sourcePath, sceneryPath].map(file => ({ file, current: hash(path.join(root, file)), before: before && hash(path.join(before, file)) })), checks };
  if (process.env.SCENE_QA_OUT) { fs.mkdirSync(process.env.SCENE_QA_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.SCENE_QA_OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Scene performance checks: ${checks.length} passed; baseline ${before ? 'enabled' : 'not requested'}.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
