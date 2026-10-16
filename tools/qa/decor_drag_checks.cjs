// Real Decor rules + Three math, isolated in-memory input/save effects. No browser or player profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const esbuild = require('esbuild');
const THREE = require('three');
const { compile, fixture } = require('./decor_module_checks.cjs');
const root = path.resolve(__dirname, '../..');
const plain = value => JSON.parse(JSON.stringify(value));
const checks = [];
const test = (name, fn) => { fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); };
const event = (x = 100, y = 100, extra = {}) => ({ button: 0, pointerId: 17, pointerType: 'mouse', clientX: x, clientY: y, ...extra });

async function main() {
  const source = await compile(path.join(root, 'js/world/decor.js'), false);
  const localSource = await compile(path.join(root, 'js/world/decor.js'), true);
  function setup({ id = 'chair', zone = 'house', extra = {}, initial = {}, local = false } = {}) {
    const pk = zone === 'house' ? 'placedIn' : zone === 'home' ? 'placedOut' : 'placedBuild';
    const f = fixture(local ? localSource : source, zone, { [pk]: [{ id, gx: 4, gz: 4, rot: 0, ...extra }], ...initial });
    f.d.enter();
    f.rec = f.d.entries[0];
    f.d.tileAt = e => ({ fx: 4.4 + (e.clientX - 100) / 20, fz: 4.4 + (e.clientY - 100) / 20 });
    f.h.ray = () => ({ intersectObjects: () => [{ object: f.rec.obj.children[0] }] });
    f.start = extra => f.d.onDown(event(100, 100, extra));
    f.move = (x = 140, y = 100, extra) => f.d.onMove(event(x, y, extra));
    f.up = (x = 140, y = 100, extra) => f.d.onUp(event(x, y, extra), Math.hypot(x - 100, y - 100));
    return f;
  }

  test('visible-model-pick-precedes-ground-footprint', () => {
    const f = setup({ id: 'wardrobe' }); f.d.setPickupMode(true);
    f.d.tileAt = () => ({ fx: 15.5, fz: 12.5 }); f.start(); f.up(100);
    assert.equal(f.d.focus, f.rec); assert.equal(f.d.history.length, 0);
  });
  test('short-tap-stays-selection-not-movement', () => {
    const f = setup(); f.d.setPickupMode(true); f.start(); f.move(106); f.up(106);
    assert.equal(f.d.focus, f.rec); assert.equal(f.rec.e.gx, 4); assert.equal(f.d.history.length, 0);
  });
  test('direct-drag-is-atomic-with-one-undo-and-no-economic-change', () => {
    const f = setup({ id: 'wardrobe', extra: { lightOn: false } }), { d, S, rec } = f;
    S.placedIn.push({ id: 'chair', gx: 11, gz: 9, rot: 0 }); d.addObj(S.placedIn[1], false);
    d.pendingCost = 123; S.decor.wardrobe = 2;
    const before = plain(S), position = rec.obj.position.clone(), disposed = f.h.disposed;
    f.start(); f.move();
    assert.equal(d.pickupMode, false); assert.equal(d.furnitureDrag.active, true);
    assert.equal(rec.obj.visible, false); assert.deepEqual(plain(S), before);
    assert.deepEqual(rec.obj.position.toArray(), position.toArray()); assert.equal(d.history.length, 0);
    assert.equal(d.canUndo, true); assert.equal(d.undoLabel, '正在拖动的家具');
    f.up();
    assert.equal(S.placedIn[0], rec.e); assert.equal(rec.e.gx, 6); assert.equal(rec.e.lightOn, false);
    assert.equal(S.placedIn[1].gx, 11); assert.equal(S.coins, before.coins); assert.deepEqual(S.decor, before.decor);
    assert.equal(d.pendingCost, 123); assert.equal(d.history.length, 1); assert.deepEqual(plain(d.history[0].delta), {});
    assert.equal(d.history[0].cost, 0); assert.deepEqual(plain(d.history[0].stats), {}); assert.equal(d.furnitureDrag, null);
    assert.equal(f.h.disposed, disposed + 2); assert.equal(d.ghostHolder.children.length, 0);
    assert.equal(d.undo(), true); assert.deepEqual(plain(S.placedIn), before.placedIn); assert.equal(d.pendingCost, 123);
  });
  test('invalid-overlap-and-out-of-bounds-return-to-original', () => {
    for (const x of [140, -100]) {
      const f = setup(), { d, S } = f;
      S.placedIn.push({ id: 'chair', gx: 6, gz: 4, rot: 0 }); d.addObj(S.placedIn[1], false);
      const before = plain(S); f.start(); f.move(x); assert.equal(d.furnitureDrag.ok, false); f.up(x);
      assert.deepEqual(plain(S), before); assert.equal(d.history.length, 0); assert.equal(f.rec.obj.visible, true);
    }
  });
  test('release-over-ui-cancels-even-with-pointer-capture', () => {
    const f = setup(); const before = plain(f.S); f.start(); f.move(); f.h.outside = true; f.up();
    assert.deepEqual(plain(f.S), before); assert.equal(f.rec.obj.visible, true); assert.equal(f.d.history.length, 0);
  });
  for (const [name, cancel] of [
    ['escape', f => f.d.onKey({ code: 'Escape', preventDefault() {} })],
    ['ctrl-z', f => f.d.onKey({ code: 'KeyZ', ctrlKey: true, preventDefault() {} })],
    ['undo-button', f => f.d.undo()], ['blur', f => f.dispatch('blur')],
    ['pointercancel', f => f.dispatch('pointercancel')], ['capture-lost-or-second-touch', f => f.d.cancelPointer()],
    ['select-new-tool', f => f.d.selectFloor('wood')], ['camera', f => f.d.setCameraMode('orbit')],
    ['reload', f => f.d.reload()], ['exit', f => f.d.exit()],
  ]) test('cancel-' + name, () => {
    const f = setup(), before = plain(f.S); f.start(); f.move(); cancel(f);
    assert.deepEqual(plain(f.S), before); assert.equal(f.rec.obj.visible, true); assert.equal(f.d.furnitureDrag, null);
    assert.equal(f.d.history.length, 0); assert.equal(f.d.ghostHolder.children.length, 0);
  });
  test('failed-checkout-and-pagehide-still-cancel-preview', () => {
    for (const kind of ['exit', 'pagehide']) {
      const f = setup(); f.S.coins = 0; f.d.pendingCost = 100; const before = plain(f.S);
      f.start(); f.move(); kind === 'exit' ? f.d.exit() : f.dispatch('pagehide');
      assert.deepEqual(plain(f.S), before); assert.equal(f.d.active, true); assert.equal(f.d.pendingCost, 100);
      assert.equal(f.d.furnitureDrag, null); assert.equal(f.rec.obj.visible, true); assert.equal(f.h.flushes, 0);
    }
  });
  test('return-to-same-cell-does-not-add-history', () => {
    const f = setup(); const before = plain(f.S); f.start(); f.move(); f.move(101); f.up(101);
    assert.deepEqual(plain(f.S), before); assert.equal(f.d.history.length, 0); assert.equal(f.d.focus, f.rec);
  });
  test('touch-slop-and-wrong-pointer-do-not-move', () => {
    const f = setup(); f.start({ pointerType: 'touch' }); f.move(120, 100, { pointerType: 'touch' });
    assert.equal(f.d.furnitureDrag.active, false);
    f.move(160, 100, { pointerId: 18, pointerType: 'touch' }); assert.equal(f.d.furnitureDrag.active, false);
    f.move(140, 100, { pointerType: 'touch' }); assert.equal(f.d.furnitureDrag.active, true);
    f.up(140, 100, { pointerType: 'touch' }); assert.equal(f.rec.e.gx, 6);
  });
  test('crop-and-supported-structure-cannot-be-dragged', () => {
    for (const id of ['plot', 'bigplot']) {
      const f = setup({ id, zone: 'home', extra: { crop: true } }), before = plain(f.S);
      f.start(); f.move(); assert.equal(f.d.furnitureDrag.blocked, true); f.up(); assert.deepEqual(plain(f.S), before);
    }
    const f = setup({ id: 'yard_column', zone: 'build', extra: { level: 0 } });
    const slab = { id: 'yard_slab', gx: 4, gz: 4, rot: 0, level: 1 }; f.S.placedBuild.push(slab); f.d.addObj(slab, false);
    const before = plain(f.S); f.start(); f.move(); assert.equal(f.d.furnitureDrag.blocked, true); f.up(); assert.deepEqual(plain(f.S), before);
  });
  test('build-floor-scope-cancels-and-keeps-level', () => {
    const f = setup({ id: 'yard_column', zone: 'build', extra: { level: 0 } });
    f.start(); f.move(); f.d.setBuildLevel(1); assert.equal(f.d.furnitureDrag, null); assert.equal(f.rec.e.gx, 4);
    f.d.setBuildLevel(0); f.start(); f.move(); f.up(); assert.equal(f.rec.e.level, 0); assert.equal(f.rec.e.gx, 6);
  });
  test('live-source-change-cancels-stale-drag', () => {
    const f = setup(); f.start(); f.move(); f.S.placedIn = [];
    f.move(160); assert.equal(f.d.furnitureDrag, null); assert.equal(f.d.history.length, 0); assert.equal(f.rec.obj.visible, true);
  });
  test('neutral-empty-space-keeps-camera-pan', () => {
    const f = setup(); f.h.ray = () => ({ intersectObjects: () => [] }); f.d.tileAt = () => ({ fx: 15, fz: 10 });
    const before = { ...f.d.pan }; f.start(); f.move(); assert.equal(f.d.furnitureDrag, null); assert.notDeepEqual(f.d.pan, before);
  });
  test('local-play-drag-keeps-zero-cost-and-inventory', () => {
    const f = setup({ local: true, initial: { coins: 0 } }), before = plain(f.S.decor); f.start(); f.move(); f.up();
    assert.equal(f.rec.e.gx, 6); assert.equal(f.S.coins, 0); assert.equal(f.d.pendingCost, 0); assert.deepEqual(plain(f.S.decor), before);
    assert.equal(f.d.undo(), true); assert.equal(f.S.placedIn[0].gx, 4);
  });

  // Actual production models and cached resource disposal, no renderer required.
  const result = await esbuild.build({ stdin: { contents: 'export { buildDecor } from "./js/models/props.js"; export { disposeSceneResources } from "./js/core/kit.js";', resolveDir: root, loader: 'js' }, bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2020', external: ['three'], logLevel: 'silent' });
  const context = vm.createContext({ module: { exports: {} }, require, console }); vm.runInContext(result.outputFiles[0].text, context);
  const { buildDecor, disposeSceneResources } = context.module.exports;
  test('real-wardrobe-ray-picks-body-outside-projected-floor-cell', () => {
    const f = setup({ id: 'wardrobe' }); f.rec.obj.clear(); f.rec.obj.add(buildDecor('wardrobe')); f.rec.obj.updateMatrixWorld(true);
    const target = f.rec.obj.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.copy(target).add(new THREE.Vector3(3, 4, 8)); camera.lookAt(target); camera.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const ground = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    assert.ok(Math.floor(ground.z) !== f.rec.e.gz || Math.floor(ground.x) < f.rec.e.gx || Math.floor(ground.x) >= f.rec.e.gx + 2);
    f.h.ray = () => ray; f.d.tileAt = () => ({ fx: ground.x, fz: ground.z });
    f.d.setPickupMode(true); f.start(); f.up(100); assert.equal(f.d.focus, f.rec); assert.equal(f.d.history.length, 0);
  });
  test('wardrobe-body-grounded-and-panels-connected', () => {
    const model = buildDecor('wardrobe'), body = new THREE.Box3().setFromObject(model.children[0]), all = new THREE.Box3().setFromObject(model);
    assert.ok(Math.abs(body.min.y) < .00001); assert.ok(Math.abs(all.max.y - 2.55) < .00001);
    for (const child of model.children.slice(1)) { const box = new THREE.Box3().setFromObject(child); assert.ok(box.min.y >= body.min.y && box.max.y <= body.max.y); }
    assert.ok(Math.abs(all.max.x - all.min.x - 1.74) < .00001);
    disposeSceneResources(model);
  });
  test('swing-supports-meet-beam-and-only-seat-animates', () => {
    const swing = buildDecor('swing'); swing.updateMatrixWorld(true);
    for (const i of [0, 1, 3, 4]) {
      const leg = swing.children[i]; const top = leg.localToWorld(new THREE.Vector3(0, 1.15, 0)), bottom = leg.localToWorld(new THREE.Vector3(0, -1.15, 0));
      assert.ok(Math.abs(top.z) < .025); assert.ok(Math.abs(top.y - 2.2) < .01);
      assert.ok(Math.abs(bottom.z) > .65); assert.ok(Math.abs(bottom.y) < .01);
    }
    const before = swing.children.slice(0, -1).map(o => o.rotation.toArray()); swing.userData.tick(1);
    assert.deepEqual(swing.children.slice(0, -1).map(o => o.rotation.toArray()), before);
    assert.ok(Math.abs(swing.children.at(-1).rotation.x) > .1); disposeSceneResources(swing);
  });
  test('preview-disposal-keeps-shared-live-resources', () => {
    const original = buildDecor('wardrobe'), preview = buildDecor('wardrobe');
    let sharedDisposed = 0; const shared = new Set(); original.traverse(o => { if (o.geometry) shared.add(o.geometry); if (o.material) shared.add(o.material); });
    for (const resource of shared) resource.addEventListener('dispose', () => sharedDisposed++);
    let uniqueDisposed = 0; const unique = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    unique.geometry.addEventListener('dispose', () => uniqueDisposed++); unique.material.addEventListener('dispose', () => uniqueDisposed++); preview.add(unique);
    disposeSceneResources(preview); assert.equal(sharedDisposed, 0); assert.equal(uniqueDisposed, 2); disposeSceneResources(original);
  });
  const hashes = Object.fromEntries(['js/models/props.js', 'js/world/decor/dragging.js', 'js/world/decor/input.js'].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')]));
  const report = { pass: true, checks, hashes, evidence: 'Real Three geometry and Decor rules; synthetic pointer/browser/persistence. Physical touch and browser UI are separate checks.' };
  const ix = process.argv.indexOf('--out'); if (ix >= 0) { const file = path.resolve(process.argv[ix + 1]); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  console.log(JSON.stringify({ pass: true, count: checks.length }));
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
