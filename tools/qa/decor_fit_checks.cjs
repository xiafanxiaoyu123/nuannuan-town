// Renderer-free regression for operation-local furniture-fit reuse.
// Uses actual furniture models, Three.js geometry and fitting rules. No DOM UI, game saves or services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const plain = value => JSON.parse(JSON.stringify(value));
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function load(file) {
  // Only the tested objects implementation is replaced; every geometry/rule dependency is shared.
  const result = await esbuild.build({
    stdin: { contents: fs.readFileSync(file, 'utf8') + '\nexport { THREE as fixtureThree, DECO as fixtureDefs };', resolveDir: path.join(root, 'js/world/decor'), loader: 'js', sourcefile: 'decor-objects-under-test.js' },
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2020', logLevel: 'silent',
    plugins: [{ name: 'memory-state', setup(build) {
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
      build.onResolve({ filter: /core\/(state|local-play-mode)\.js$/ }, item => ({ path: item.path.includes('local-play') ? 'local' : 'state', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, item => ({ contents: item.path === 'state' ? 'export const S=__state;' : 'export const LOCAL_PLAY=false;', loader: 'js' }));
    } }],
  });
  const state = { house: 3, wallsIn: [], placedIn: [], decor: {}, coins: 1234 };
  const ctx = new Proxy({}, { get: (target, name) => target[name] ?? (name === 'measureText' ? text => ({ width: String(text).length * 32 }) : () => {}), set: (target, name, value) => { target[name] = value; return true; } });
  const context = vm.createContext({ module: { exports: {} }, require, console, __state: state, document: { createElement: () => ({ getContext: () => ctx }) } });
  vm.runInContext(result.outputFiles[0].text, context);
  const api = context.module.exports, THREE = api.fixtureThree;
  let fitCalls = 0, invalidations = 0;
  const decor = { cfg: { key: 'house', freeBuild: false }, lot: { x0: 489, z0: -7.5, cols: 34, rows: 23 }, entries: [], structures: [], buildLevel: 0,
    occ: new Map(), occUnder: new Map(), occPlanes: new Map(), occEdges: new Map(), occCaps: new Map(), occFoundations: new Map(),
    town: { scene: new THREE.Scene(), rects: [], seasons: { scanTrees() {}, clearSubtree() {} }, renderOptimizer: { invalidateDecor() { invalidations++; }, invalidateBounds() { invalidations++; } },
      addRect(x0, x1, z0, z1, kind) { const r = { x0, x1, z0, z1, kind }; this.rects.push(r); return r; } },
    size(id, rot) { const [w, d] = api.fixtureDefs[id].size; return rot % 2 ? [d, w] : [w, d]; },
    cellKey: (x, z) => x + ',' + z,
    layerOf(id) { return api.fixtureDefs[id].under ? this.occUnder : this.occ; },
    fenceOffset: () => ({ x: 0, z: -.5 }),
  };
  for (const name of ['houseWalls', 'houseObject', 'applyHouseFit', 'houseCollisionRects', 'addObj', 'removeObj', 'refreshFurnitureFits']) decor[name] = (...args) => api[name](decor, ...args);
  decor.houseFit = (...args) => { fitCalls++; return api.houseFit(decor, ...args); };
  return { api, state, decor, calls: () => fitCalls, invalidations: () => invalidations };
}

function snapshot(rec, decor) {
  const shape = rec.obj._furnitureShape;
  return plain({ entry: rec.e, position: rec.obj.position.toArray(), rotation: rec.obj.rotation.toArray(), scale: rec.obj.scale.toArray(),
    modelScale: shape?.model.scale.toArray(), modelPosition: shape?.model.position.toArray(), originalBounds: shape?.bounds,
    fit: rec.obj.userData.furnitureFit, rectangles: rec.rect, allRectangles: decor.town.rects,
    occupied: [decor.occ, decor.occUnder].map(layer => [...layer.keys()]), sceneChildren: decor.town.scene.children.length });
}

function exercise(h, entry, walls, optimized) {
  const { decor: d, state, api } = h;
  assert.equal(d.entries.length, 0);
  state.wallsIn = plain(walls);
  const counts = [], steps = [], stateBefore = JSON.stringify(state);
  const special = entry.id === 'fence' || entry.id === 'picnic' || api.fixtureDefs[entry.id].flat;
  const expectedAdd = entry.id === 'fence' ? 0 : special ? 1 : optimized ? 1 : 2;
  let n = h.calls();
  const rec = d.addObj(plain(entry), false);
  assert.equal(h.calls() - n, expectedAdd, entry.id + ' add fit count'); counts.push(h.calls() - n); steps.push(snapshot(rec, d));
  n = h.calls(); d.refreshFurnitureFits();
  assert.equal(h.calls() - n, expectedAdd, entry.id + ' refresh fit count'); counts.push(h.calls() - n); steps.push(snapshot(rec, d));
  // Explicit wall arguments must bypass any previous result, including a different array and orientation.
  const otherWalls = [{ axis: 'z', gx: entry.gx + 1, gz: entry.gz, kind: 'wall' }];
  n = h.calls(); steps.push(plain(d.houseCollisionRects(entry, otherWalls)));
  assert.equal(h.calls() - n, special ? 0 : 1, entry.id + ' public collision query fit count');
  assert.equal(JSON.stringify(state), stateBefore, 'adding/querying scene objects must not change saved state');
  // Simulate a new partition revision. No cross-operation fit may survive this change.
  state.wallsIn = plain(otherWalls); n = h.calls(); d.refreshFurnitureFits();
  assert.equal(h.calls() - n, expectedAdd, entry.id + ' changed-wall refresh fit count'); counts.push(h.calls() - n); steps.push(snapshot(rec, d));
  const fitBefore = plain(rec.obj._furnitureShape?.bounds || null);
  if (rec.obj._furnitureShape) {
    // Appearance animation may scale the wrapper; fit still uses measured original shape bounds.
    rec.obj.scale.setScalar(.18); n = h.calls(); d.refreshFurnitureFits();
    assert.equal(h.calls() - n, expectedAdd); assert.deepEqual(plain(rec.obj._furnitureShape.bounds), fitBefore);
    steps.push(snapshot(rec, d));
  }
  d.removeObj(rec);
  assert.equal(d.entries.length, 0); assert.equal(d.town.rects.length, 0); assert.equal(d.occ.size, 0); assert.equal(d.occUnder.size, 0); assert.equal(d.town.scene.children.length, 0);
  return { steps, counts };
}

async function main() {
  const currentFile = path.join(root, 'js/world/decor/objects.js'), baselineFile = option('--baseline'), output = option('--out');
  const current = await load(currentFile), before = baselineFile ? await load(path.resolve(baselineFile)) : null;
  const ids = ['chair', 'sofa', 'bed', 'plant', 'kitchen_counter', 'arch', 'swing', 'fence', 'picnic', 'rug'];
  const wallCases = [[], [{ axis: 'x', gx: 4, gz: 7, kind: 'wall' }, { axis: 'x', gx: 5, gz: 7, kind: 'wall' }, { axis: 'x', gx: 6, gz: 7, kind: 'wall' }],
    [{ axis: 'x', gx: 4, gz: 7, kind: 'wall' }, { axis: 'x', gx: 5, gz: 7, kind: 'door' }, { axis: 'z', gx: 7, gz: 7, kind: 'wall' }]];
  let cases = 0;
  for (const id of ids) for (let rot = 0; rot < 4; rot++) for (let walls = 0; walls < wallCases.length; walls++) for (const position of [[5, 6], [0, 1]]) {
    const entry = { id, gx: position[0], gz: position[1], rot };
    const after = exercise(current, entry, wallCases[walls], true);
    if (before) assert.deepEqual(after.steps, exercise(before, entry, wallCases[walls], false).steps, `${id}/${rot}/walls${walls}/${position} differs from baseline`);
    cases++;
  }
  // Reproduce the measured root fixture: 36 chairs, ten explicit refresh operations.
  const replay = h => {
    const d = h.decor; h.state.wallsIn = [];
    for (let i = 0; i < 36; i++) d.addObj({ id: 'chair', gx: 2 + i % 9 * 3, gz: 3 + Math.floor(i / 9) * 3, rot: i % 4 }, false);
    const n = h.calls(); for (let i = 0; i < 10; i++) d.refreshFurnitureFits(); const calls = h.calls() - n;
    const shapes = d.entries.map(rec => snapshot(rec, d)); for (const rec of [...d.entries]) d.removeObj(rec); return { calls, shapes };
  };
  const afterReplay = replay(current); assert.equal(afterReplay.calls, 360);
  const beforeReplay = before ? replay(before) : null;
  if (beforeReplay) { assert.equal(beforeReplay.calls, 720); assert.deepEqual(afterReplay.shapes, beforeReplay.shapes); }
  const report = { pass: true, cases, ids, rotations: 4, wallConfigurations: 3, positions: 2, baselineCompared: !!before,
    checks: ['actual model bounds, scale, world position and collision rectangles equal', 'walls, door openings, corners and outer-wall cases', 'arch/swing two posts, fence rectangle, picnic/flat empty collisions', 'explicit wall queries recompute; changed walls recompute', 'animation wrapper scale preserves original shape bounds', 'object removal releases scene/collision/occupancy references'],
    refreshReplay: { chairs: 36, refreshes: 10, currentFitCalls: afterReplay.calls, baselineFitCalls: beforeReplay?.calls ?? null, callsReduction: before ? .5 : null },
    source: currentFile, sourceSha256: sha256(currentFile), baseline: baselineFile ? path.resolve(baselineFile) : null, baselineSha256: baselineFile ? sha256(baselineFile) : null,
    boundary: 'Node only; actual model geometry/rules, synthetic state and scene container, no renderer or external services. Timing and UI supplied by root serial benchmark.' };
  if (output) { const file = path.resolve(output); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
