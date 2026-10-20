/* Pure real-Three checks; no browser, database or external connection. */
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const THREE = require('three');
const crypto = require('node:crypto');

(async () => {
  const m = await import(pathToFileURL(path.resolve(__dirname, '../../js/models/homestead.js')).href);
  const { buildDecor } = await import(pathToFileURL(path.resolve(__dirname, '../../js/models/props.js')).href);
  const { DECO } = await import(pathToFileURL(path.resolve(__dirname, '../../js/data.js')).href);
  const rules = await import(pathToFileURL(path.resolve(__dirname, '../../js/shared/homestead.js')).href);
  const report = { scope: 'Real Three geometry, actual furniture dispatcher and shared catalog; no browser, storage, API or network', dishes: [], animals: [], props: [], furniture: [], herd: {}, assertions: 0 };

report.budgetAdjustment={"previousPerAnimalTriangles":3000,"sheepTriangles":3800,"otherSpeciesTriangles":3000,"meshesPerAnimal":9,"materialsPerAnimal":1,"mixedHerdTriangles":48000,"allSheepHerdTriangles":60800,"herdMeshes":144,"reason":"Explicitly approved visual-quality adjustment: the photographed 32x24 continuous SDF sheep wool preserves rounded lobes unavailable under the former 3000-triangle ceiling. Other species, mesh/material ceilings, and all rig/motion assertions stay unchanged."};
  const ok = (v, text) => { assert.ok(v, text); report.assertions++; };
  ok(m.DISH_MODEL_IDS.length === 24 && m.ANIMAL_MODEL_IDS.length === 7 && m.RANCH_FURNITURE_IDS.length === 12, 'complete expanded model catalog');
  ok(rules.RECIPES.every(r => m.DISH_MODEL_IDS.includes(r.id)) && rules.ANIMALS.every(a => m.ANIMAL_MODEL_IDS.includes(a.id)), 'shared gameplay catalog has real models');
  const signature = root => { const hash = crypto.createHash('sha256'); root.traverse(o => { if (o.isMesh && !o.isInstancedMesh) for (const key of ['position', 'color']) if (o.geometry.attributes[key]) hash.update(Buffer.from(o.geometry.attributes[key].array.buffer)); }); return hash.digest('hex'); };
  const dishSignatures = new Set();
  function inspect(root, name) {
    const mats = new Set(), geos = new Set(); let meshes = 0, triangles = 0;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      for (const n of [...o.position.toArray(), ...o.scale.toArray(), ...o.quaternion.toArray()]) ok(Number.isFinite(n), `${name}: finite transform`);
      if (!o.isMesh) return;
      meshes++; ok(o.userData.noMerge, `${name}: mesh protected from static merge`);
      for (const a of ['position', 'normal']) {
        const attr = o.geometry.attributes[a]; ok(attr && attr.count > 0, `${name}: nonempty ${a}`);
        ok(Array.from(attr.array).every(Number.isFinite), `${name}: finite ${a}`);
      }
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mats.add(mat);
      geos.add(o.geometry); triangles += ((o.geometry.index?.count || o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    const b = new THREE.Box3().setFromObject(root), s = b.getSize(new THREE.Vector3());
    ok(!b.isEmpty() && [...s.toArray(), ...b.min.toArray(), ...b.max.toArray()].every(Number.isFinite), `${name}: finite nonempty bounds`);
    return { meshes, triangles, materials: mats.size, size: s.toArray().map(v => +v.toFixed(4)), floor: +b.min.y.toFixed(4), mats, geos };
  }
  for (const id of m.DISH_MODEL_IDS) {
    for (const phase of ['raw', 'cooking', 'done', 'empty']) {
      const g = m.createDish(id, { phase, quality: 0 });
      ok(g.userData.quality === 0, 'numeric ordinary quality is preserved');
      const data = inspect(g, `${id}/${phase}`);
      ok(data.size[0] > .2 && data.size[0] < .9, `${id}: useful tabletop scale`);
      ok(Math.abs(data.floor) < .002, `${id}: floor at zero`);
      ok(data.triangles <= 3200, `${id}: triangle budget ${data.triangles}`);
      ok(data.materials <= 3, `${id}: material budget`);
      if (phase === 'empty') ok(!g.userData.parts.food && !g.userData.parts.steam, 'empty is crockery only');
      if (phase === 'done') {
        dishSignatures.add(signature(g));
        for (const t of [100, 100.1, 100.8, 101.5, 131, NaN]) { m.animateDish(g, t); inspect(g, `${id}/${t}`); }
        // Restart after NaN animation time, then verify finite one-shot animation completion.
        g.userData.animationStart = null; m.animateDish(g, 0); m.animateDish(g, 31);
        if (g.userData.parts.steam) ok(!g.userData.parts.steam.visible, `${id}: steam sleeps after 30 seconds`);
        if (id === 'milk_pudding') ok(g.userData.parts.food.rotation.z === 0 && g.userData.parts.food.scale.y === 1, 'pudding returns to rest');
        if (id === 'cheese_pumpkin') ok(!g.userData.parts.cheese.visible, 'cheese pull is finite');
        if (['cherry_yogurt', 'egg_sandwich', 'milk_pudding', 'berry_trifle', 'orange_yogurt', 'peach_milk', 'lemon_cheesecake', 'blueberry_yogurt'].includes(id)) ok(!g.userData.parts.steam, `${id}: cold food has no steam`);
        const { mats, geos, ...summary } = data; report.dishes.push({ id, ...summary });
      }
      m.disposeHomesteadModel(g);
    }
  }
  ok(dishSignatures.size === 24, 'all 24 dishes have distinct geometry and color, not aliases');
  for (const id of m.DISH_MODEL_IDS) {
    const raw = m.createDish(id, { phase: 'raw' }), cooked = m.createDish(id, { phase: 'done' });
    ok(signature(raw) !== signature(cooked), id + ': raw and finished model differ');
    m.disposeHomesteadModel(raw); m.disposeHomesteadModel(cooked);
  }
  for (const id of ['strawberry_tart', 'pumpkin_soup']) {
    const base = m.createDish(id), milk = m.createDish(id, { variant: 'milky' });
    ok(inspect(milk, id).triangles > inspect(base, id).triangles, 'milk variation adds visible cream');
    m.disposeHomesteadModel(base); m.disposeHomesteadModel(milk);
  }
  for (const id of m.DISH_MODEL_IDS) for (const quality of ['normal', 'tasty', 'fine']) {
    const g = m.createDish(id, { quality, variant: ['strawberry_tart', 'pumpkin_soup'].includes(id) ? 'milky' : 'plain' });
    ok(g.userData.quality === ['normal', 'tasty', 'fine'].indexOf(quality), 'shared save quality maps to model quality');
    ok(inspect(g, `${id}/${quality}`).triangles <= 3000, 'all saved qualities and milk variants stay in triangle budget');
    m.disposeHomesteadModel(g);
  }
  for (const species of m.ANIMAL_MODEL_IDS) for (const shorn of [false, true]) for (const coat of [0, 1, 2]) {
    const g = m.createAnimal(species, { shorn, coat }), data = inspect(g, species);
    ok(g.userData.species === species, 'animal is not fallback');
    ok(data.floor >= -.002 && data.floor <= .002, `${species}: feet on ground`);
    ok(data.triangles <= (species === 'sheep' ? 3800 : 3000), `${species}: documented sheep-only triangle exception; other animal ceilings unchanged`);
    ok(data.meshes <= 9 && data.materials === 1, `${species}: bounded articulated draw calls`);
    for (const action of ['idle', 'walk', 'eat', 'pet', 'sleep', 'call']) for (const t of [0, .5, 20, NaN]) { m.animateAnimal(g, t, action); inspect(g, `${species}/${action}`); }
    m.animateAnimal(g, 20, 'idle'); ok(!g.userData.parts.heart.visible, 'pet heart stops in idle');
    const { mats, geos, ...summary } = data; report.animals.push({ species, shorn, coat, ...summary }); m.disposeHomesteadModel(g);
  }
  for (const id of m.RANCH_FURNITURE_IDS) {
    const g = buildDecor(id), data = inspect(g, id), bounds = new THREE.Box3().setFromObject(g), definition = DECO[id];
    ok(g.userData.decorId === id && g.userData.kind === 'ranch-furniture', id + ': real furniture dispatcher uses model');
    ok(definition && bounds.min.x >= -definition.size[0] / 2 && bounds.max.x <= definition.size[0] / 2 && bounds.min.z >= -definition.size[1] / 2 && bounds.max.z <= definition.size[1] / 2, id + ': actual geometry fits its editable grid cells');
    ok(Math.abs(data.floor) < .002, id + ': furniture stands on floor');
    ok(data.materials === 1 && data.meshes === 1 && data.triangles <= 2500, id + ': single-draw furniture budget');
    if (id === 'ranch_picnic') {
      ok(g.userData.tableY === .84 && g.userData.surfaceAnchors.length === 4, 'picnic exposes real tabletop and four anchors');
      const anchors = g.userData.surfaceAnchors;
      for (const a of anchors) ok(Math.abs(a.x) + .30 <= 1.325 && Math.abs(a.z) + .30 <= .652, 'dish remains inside tabletop');
      for (let a = 0; a < anchors.length; a++) for (let b = a + 1; b < anchors.length; b++) ok(Math.hypot(anchors[a].x - anchors[b].x, anchors[a].z - anchors[b].z) >= .60, 'four plates do not overlap');
    }
    const { mats, geos, ...summary } = data; report.furniture.push({ id, cells: definition.size, ...summary }); m.disposeHomesteadModel(g);
  }
  const herd = new THREE.Group();
  for (let i = 0; i < 16; i++) { const g = m.createAnimal(m.ANIMAL_MODEL_IDS[i % 7], { coat: i % 3 }); g.position.set(i % 4 * 2, 0, Math.floor(i / 4) * 2); herd.add(g); }
  for (const [i, g] of herd.children.entries()) m.animateAnimal(g, 1.5, i % 2 ? 'walk' : 'idle');
  const herdData = inspect(herd, '16 animal herd');
  ok(herdData.triangles <= 48000 && herdData.meshes <= 144 && herdData.materials === 16, '16-animal herd keeps a bounded shared-scene budget');
  const { mats: herdMats, geos: herdGeos, ...herdSummary } = herdData; report.herd = { count: 16, ...herdSummary };
  m.disposeHomesteadModel(herd);
  const allSheep = new THREE.Group();
  for (let i = 0; i < 16; i++) { const g = m.createAnimal('sheep', { coat: i % 3 }); g.position.set(i % 4 * 2, 0, Math.floor(i / 4) * 2); allSheep.add(g); }
  for (const g of allSheep.children) m.animateAnimal(g, 1.5, 'walk');
  const sheepData = inspect(allSheep, '16 sheep herd'); let sheepBones = 0; allSheep.traverse(o => { if (o.isSkinnedMesh) sheepBones += o.skeleton.bones.length; });
  ok(sheepData.triangles <= 60800 && sheepData.meshes <= 144 && sheepData.materials === 16, '16 sheep respect the documented wool-quality budget without extra draw/material allowances');
  const { mats: sheepMats, geos: sheepGeos, ...sheepSummary } = sheepData; report.allSheepHerd = { count: 16, bones: sheepBones, ...sheepSummary };
  m.disposeHomesteadModel(allSheep);
  for (const type of ['coop', 'shed', 'trough', 'fence', 'nest', 'milk_bucket', 'wool']) {
    const g = m.createRanchProp(type), { mats, geos, ...summary } = inspect(g, type);
    ok(summary.materials === 1 && summary.meshes === 1, 'ranch prop is a single mesh'); report.props.push({ type, ...summary }); m.disposeHomesteadModel(g);
  }
  const a = m.createDish('pumpkin_soup'), b = m.createDish('pumpkin_soup');
  const aa = inspect(a, 'ownership a'), bb = inspect(b, 'ownership b');
  ok([...aa.geos].every(g => !bb.geos.has(g)) && [...aa.mats].every(mat => !bb.mats.has(mat)), 'instances own independent geometry and material');
  let disposedB = 0; for (const mat of bb.mats) mat.addEventListener('dispose', () => disposedB++);
  let disposedSteam = 0; a.userData.parts.steam.addEventListener('dispose', () => disposedSteam++);
  m.disposeHomesteadModel(a); ok(disposedB === 0, 'disposing an instance does not dispose another'); ok(disposedSteam === 1, 'steam instance GPU buffers are disposed');
  m.animateDish(b, 10); inspect(b, 'surviving instance'); m.disposeHomesteadModel(b);
  const fallback = m.createDish('unknown'); ok(fallback.userData.fallback && fallback.userData.modelId === 'egg_custard', 'unknown dish has visible fallback'); m.disposeHomesteadModel(fallback);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
})().catch(err => { console.error(err); process.exitCode = 1; });
