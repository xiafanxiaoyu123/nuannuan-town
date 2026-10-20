// Pure regression suite: synthetic saves only, no network/database/browser/storage side effects.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const bundle = buildSync({ entryPoints: [path.join(root, 'js/shared/homestead.js')], bundle: true, write: false, format: 'cjs', platform: 'node' });
const mod = { exports: {} };
new Function('module', 'exports', bundle.outputFiles[0].text)(mod, mod.exports);
const H = mod.exports;
const NOW = Date.parse('2026-10-19T02:00:00.000Z'), MIN = 60000;
let checks = 0; const names = [];
const check = (label, fn) => { fn(); checks++; names.push(label); process.stdout.write(`PASS ${label}\n`); };
const fresh = () => ({ coins: 10000, crops: {}, npc: { man: { t: 1, last: '' }, he: { t: 1, last: '' } }, decor: {}, owned: [], live: {}, placed: [], placedIn: [], buildPlaced: [] });
const copy = v => JSON.parse(JSON.stringify(v));
const run = (s, type, args = {}, now = NOW) => H.performHomestead(s, { type, ...args }, now);
const ok = r => { assert.equal(r.ok, true, r.message); return r; };
const starter = () => { const s = fresh(); ok(run(s, 'tutorial')); s.placed = [{ id: 'ranch_coop', gx: 2, gz: 3, rot: 0 }, { id: 'ranch_picnic', gx: 7, gz: 3, rot: 0 }]; H.advanceHomestead(s, NOW); return s; };
const cook = (s, recipe, extra = {}, now = NOW) => {
  const start = ok(run(s, 'cookStart', { recipe, ...extra }, now));
  ok(run(s, 'cookStep', { taskId: start.taskId, activeMs: 24000, operation: 40, technique: 40, plated: true }, now));
  return ok(run(s, 'cookFinish', { taskId: start.taskId }, now));
};
check('catalogue: 7 animals, 24 unique dishes and valid prices', () => {
  assert.equal(H.ANIMALS.length, 7); assert.equal(H.RECIPES.length, 24);
  assert.equal(new Set(H.RECIPES.map(r => r.id)).size, 24);
  for (const r of H.RECIPES) assert(H.dishPrice(r.id) > 0);
});
check('migration: history never becomes sellable inventory or coins', () => {
  const s = fresh(); s.coins = 54321; s.crops.wheat = 19; s.live.kitchen = { strawberry_tart: 200, lemon_tea: 3, unknown: 1000 };
  H.ensureHomestead(s, NOW); assert.equal(s.homestead.history.strawberry_tart, 200);
  assert.deepEqual(s.homestead.dishes, {}); assert.deepEqual(s.homestead.pantry, {}); assert.equal(s.coins, 54321); assert.equal(s.crops.wheat, 19);
  assert.deepEqual(H.validateHomesteadState(s), []);
});
check('migration: legacy same town-day tea blocks second daily reward', () => {
  const s = fresh(); s.gday = 0; s.live.fun = { day: '2026-08-01', used: { teaParty: 1 } };
  // Derive the town key through the shared rules rather than hardcoding its epoch.
  const d = buildSync({ entryPoints: [path.join(root, 'js/shared/momo-fortune.js')], bundle: true, write: false, format: 'cjs', platform: 'node' });
  const m = { exports: {} }; new Function('module', 'exports', d.outputFiles[0].text)(m, m.exports);
  s.live.fun.day = m.exports.dailyFunKey(s); H.ensureHomestead(s, NOW); assert.equal(s.homestead.teaDay, H.homesteadDay(NOW));
});
check('tutorial: one chicken, one teaching egg, 4 feed only once', () => {
  const s = starter(), before = copy(s); assert.equal(s.homestead.animals.length, 1); assert.equal(s.homestead.pantry.egg, 1);
  assert.equal(run(s, 'tutorial').ok, false); assert.deepEqual(s, before);
});
check('offline: 2h and 8h stop at 4 output, no affection penalty', () => {
  for (const hours of [2, 8]) { const s = starter(); ok(run(s, 'feed')); H.advanceHomestead(s, NOW + hours * 60 * MIN);
    const a = s.homestead.animals[0]; assert.equal(a.ready, 4); assert.equal(a.feed, 0); assert.equal(a.cycleAt, 0); assert.equal(a.love, 0); assert.deepEqual(H.validateHomestead(s.homestead), []); }
});
check('collect: active production deadline is never reset', () => {
  const s = starter(); ok(run(s, 'feed')); H.advanceHomestead(s, NOW + 13 * MIN);
  const deadline = s.homestead.animals[0].cycleAt; ok(run(s, 'collect', {}, NOW + 13 * MIN));
  assert.equal(s.homestead.animals[0].cycleAt, deadline); assert.equal(s.homestead.pantry.egg, 2);
});
check('full store: no feed consumed while paused; collection restarts now', () => {
  const s = starter(); ok(run(s, 'feed')); ok(run(s, 'buyFeed', { count: 1 })); ok(run(s, 'feed'));
  H.advanceHomestead(s, NOW + 8 * 60 * MIN); assert.equal(s.homestead.animals[0].feed, 1);
  ok(run(s, 'collect', {}, NOW + 8 * 60 * MIN)); assert.equal(s.homestead.animals[0].cycleAt, NOW + 8 * 60 * MIN + 12 * MIN);
});
check('emergency grass: twice the period, always normal, no money needed', () => {
  const s = starter(); s.coins = 0; s.homestead.animals[0].love = 100; ok(run(s, 'feed', { emergency: true }));
  H.advanceHomestead(s, NOW + 12 * MIN); assert.equal(s.homestead.animals[0].ready, 0);
  H.advanceHomestead(s, NOW + 24 * MIN); assert.equal(s.homestead.animals[0].ready, 1); assert.equal(s.homestead.animals[0].readyPrime, 0); assert.equal(s.coins, 0);
});
check('quality: fixed at cycle start; petting cannot upgrade an existing egg', () => {
  const s = starter(); s.homestead.animals[0].love = 48; ok(run(s, 'feed')); ok(run(s, 'pet', { animalId: s.homestead.animals[0].id }));
  H.advanceHomestead(s, NOW + 12 * MIN); assert.equal(s.homestead.animals[0].ready, 1); assert.equal(s.homestead.animals[0].readyPrime, 0);
  H.advanceHomestead(s, NOW + 24 * MIN); assert.equal(s.homestead.animals[0].readyPrime, 1);
  H.advanceHomestead(s, NOW + 48 * MIN); assert.equal(s.homestead.animals[0].readyPrime, 1); assert.equal(s.homestead.animals[0].ready, 3);
});
check('care token: one prime next normal cycle, grass preserves it, affection cannot farm prime', () => {
  const s = starter(), id = s.homestead.animals[0].id; s.homestead.animals[0].love = 100;
  ok(run(s, 'feed', { emergency: true })); ok(run(s, 'pet', { animalId: id }));
  H.advanceHomestead(s, NOW + 120 * MIN); assert.equal(s.homestead.animals[0].carePending, true); assert.equal(s.homestead.animals[0].readyPrime, 0);
  ok(run(s, 'collect', {}, NOW + 120 * MIN)); ok(run(s, 'feed', {}, NOW + 120 * MIN));
  assert.equal(s.homestead.animals[0].carePending, false); assert.equal(s.homestead.animals[0].cyclePrime, true);
  H.advanceHomestead(s, NOW + 168 * MIN); assert.equal(s.homestead.animals[0].readyPrime, 1); assert.equal(s.homestead.animals[0].ready, 3);
});
check('clock rollback and sleeping cannot speed up production', () => {
  const s = starter(); ok(run(s, 'feed')); const deadline = s.homestead.animals[0].cycleAt;
  s.gday = 9999; H.advanceHomestead(s, NOW - 3 * MIN); assert.equal(s.homestead.animals[0].cycleAt, deadline); assert.equal(s.homestead.animals[0].ready, 0);
});
check('polling unchanged empty, active and full ranches does not dirty a cloud save', () => {
  const empty = fresh(); H.ensureHomestead(empty, NOW); const emptyBefore = copy(empty); H.advanceHomestead(empty, NOW + MIN); assert.deepEqual(empty, emptyBefore);
  const s = starter(); ok(run(s, 'feed')); const active = copy(s); H.advanceHomestead(s, NOW + MIN); assert.deepEqual(s, active);
  H.advanceHomestead(s, NOW + 12 * MIN); assert.equal(s.homestead.lastNow, NOW + 12 * MIN); assert.equal(s.homestead.animals[0].ready, 1);
  const produced = copy(s); H.advanceHomestead(s, NOW + 3 * MIN); assert.deepEqual(s, produced);
  H.advanceHomestead(s, NOW + 48 * MIN); const full = copy(s); H.advanceHomestead(s, NOW + 8 * 60 * MIN); assert.deepEqual(s, full);
  ok(run(s, 'rename', { animalId: s.homestead.animals[0].id, name: '小豆' }, NOW + 60 * MIN)); assert.equal(s.homestead.lastNow, NOW + 60 * MIN);
});
check('animal care: once per real Beijing date and permanent love', () => {
  const s = starter(), id = s.homestead.animals[0].id;
  ok(run(s, 'pet', { animalId: id })); ok(run(s, 'pet', { animalId: id })); assert.equal(s.homestead.animals[0].love, 8);
  s.gday = 1; ok(run(s, 'pet', { animalId: id })); assert.equal(s.homestead.animals[0].love, 8);
  ok(run(s, 'pet', { animalId: id }, NOW + 24 * 60 * MIN)); assert.equal(s.homestead.animals[0].love, 16);
});
check('ranch progression: cow needs two dishes; sheep needs a real tea', () => {
  const s = starter(); s.placed.push({ id: 'ranch_barn', gx: 12, gz: 3, rot: 0 }); assert.equal(run(s, 'adopt', { kind: 'cow' }).ok, false); assert.equal(run(s, 'adopt', { kind: 'sheep' }).ok, false);
  cook(s, 'egg_custard'); s.crops.strawberry = 2; s.crops.wheat = 1; cook(s, 'strawberry_tart');
  ok(run(s, 'adopt', { kind: 'cow' })); assert.equal(s.homestead.animals.length, 2);
  const before = copy(s); assert.equal(run(s, 'upgradeRanch').ok, false); assert.deepEqual(s, before); assert.equal(H.ranchCapacity(s), 8);
  const key=Object.keys(s.homestead.dishes)[0], t=ok(run(s,'teaStart',{keys:[key],guests:['momo']})); ok(run(s,'teaFinish',{taskId:t.taskId,skip:true})); ok(run(s,'adopt',{kind:'sheep'}));
});
check('partial feed succeeds fairly; empty stock and invalid targets remain atomic', () => {
  const s = starter(); ok(run(s, 'adopt', { kind: 'chicken' }));
  const r = ok(run(s, 'feed')); assert.equal(r.used, 4); assert.equal(r.fedIds.length, 2);
  assert.equal(s.homestead.pantry.feed || 0, 0); assert.deepEqual(s.homestead.animals.map(a => a.feed + (a.cycleAt ? 1 : 0)), [2, 2]);
  let before = copy(s); assert.equal(run(s, 'feed').ok, false); assert.deepEqual(s, before);
  s.homestead.pantry.feed = 4; before = copy(s);
  assert.equal(run(s, 'feed', { animalIds: [s.homestead.animals[0].id, 'missing'] }).ok, false); assert.deepEqual(s, before);
});
check('cook escrow: inventory reserved, reload preserved, cancel refunds once', () => {
  let s = starter(); const t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  assert.equal(H.availableIngredient(s, 'egg'), 0); assert.equal(s.homestead.cooking.inputs[0].count, 1);
  s = copy(s); assert.deepEqual(H.validateHomesteadState(s), []); assert.equal(run(s, 'sellIngredient', { item: 'egg', count: 1 }).ok, false);
  ok(run(s, 'cookCancel', { taskId: t.taskId })); assert.equal(s.homestead.pantry.egg, 1);
  const before = copy(s); assert.equal(run(s, 'cookCancel', { taskId: t.taskId }).ok, false); assert.deepEqual(s, before);
});
check('cook escrow: old crop sale cannot touch ingredients already on worktop', () => {
  const s = fresh(); s.crops = { strawberry: 2, wheat: 2 }; const t = ok(run(s, 'cookStart', { recipe: 'strawberry_tart' }));
  assert.equal(s.crops.wheat, 1); s.crops.wheat = 0; // Existing shop consumes only the remaining available wheat.
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 0, plated: true })); ok(run(s, 'cookFinish', { taskId: t.taskId }));
  assert.equal(s.homestead.dishes['strawberry_tart:normal:plain'], 1);
});
check('cooking does not finish while hidden or offline; progress reloads', () => {
  let s = starter(); const t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  assert.equal(run(s, 'cookFinish', { taskId: t.taskId }, NOW + 24 * 60 * MIN).ok, false);
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 12000, operation: 10, technique: 10, plated: false })); s = copy(s);
  assert.equal(s.homestead.cooking.activeMs, 12000); assert.equal(run(s, 'cookFinish', { taskId: t.taskId }).ok, false);
});
check('cook success: one deduction, one dish, no coins, repeat cannot settle', () => {
  const s = starter(), coins = s.coins; const t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 40, plated: true }));
  const result = ok(run(s, 'cookFinish', { taskId: t.taskId })); assert.equal(result.quality, 'fine'); assert.equal(s.coins, coins);
  assert.equal(s.homestead.dishes[result.key], 1); const before = copy(s);
  assert.equal(run(s, 'cookFinish', { taskId: t.taskId }).ok, false); assert.deepEqual(s, before);
});
check('ordinary ingredients can reach fine; mistakes still produce edible dishes', () => {
  const s = starter(); const result = cook(s, 'egg_custard'); assert.equal(result.quality, 'fine');
  s.homestead.pantry.egg = 1; const t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 0, plated: true }));
  assert.equal(ok(run(s, 'cookFinish', { taskId: t.taskId })).quality, 'normal');
});
check('quick cooking: real prime share recomputes quality; history unlocks batch', () => {
  const s = fresh(); s.live.kitchen = { egg_custard: 3 }; H.ensureHomestead(s, NOW);
  s.homestead.mastery.egg_custard = { operation: 20, plating: 0 }; s.homestead.pantry.egg = 2; s.homestead.pantry.egg_prime = 1;
  assert.equal(ok(run(s, 'quickCook', { recipe: 'egg_custard', count: 1 })).quality, 'normal');
  assert.equal(ok(run(s, 'quickCook', { recipe: 'egg_custard', count: 1, preferPrime: true })).quality, 'tasty');
  s.homestead.pantry.egg = 5; ok(run(s, 'quickCook', { recipe: 'egg_custard', count: 5 })); assert.equal(s.homestead.pantry.egg, undefined);
});
check('legacy quick cooking defaults to operation32 + plating20, no free fine', () => {
  const s = fresh(); s.live.kitchen = { strawberry_tart: 8 }; s.crops = { strawberry: 2, wheat: 1 };
  const result = ok(run(s, 'quickCook', { recipe: 'strawberry_tart', count: 1 }));
  assert.equal(result.quality, 'tasty'); assert.equal(result.score, 84);
});
check('manual completion requires active time, all operations and plating independently', () => {
  for (const progress of [
    { activeMs: 23999, operation: 40, technique: 40, plated: true },
    { activeMs: 24000, operation: 39, technique: 39, plated: true },
    { activeMs: 24000, operation: 40, technique: 40, plated: false },
    { activeMs: 24000, operation: 0, technique: 0, plated: false },
  ]) {
    const s = starter(), t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
    ok(run(s, 'cookStep', { taskId: t.taskId, ...progress })); const before = copy(s);
    assert.equal(run(s, 'cookFinish', { taskId: t.taskId }, NOW + 86400000).ok, false); assert.deepEqual(s, before);
    assert.equal(s.homestead.history.egg_custard, undefined); assert.deepEqual(s.homestead.dishes, {});
  }
});
check('new technique is mandatory, bounded by progress and cannot be farmed by repeated snapshots', () => {
  const s = starter(), t = ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  assert.equal(s.homestead.cooking.technique, 0);
  const step = { taskId: t.taskId, activeMs: 12000, operation: 20, technique: 10, plated: false };
  for (const value of [undefined, null, '10', NaN, Infinity, -1, .5, 21, 41]) {
    const action = { ...step, technique: value }; if (value === undefined) delete action.technique;
    const before = copy(s); assert.equal(run(s, 'cookStep', action).ok, false); assert.deepEqual(s, before);
  }
  ok(run(s, 'cookStep', step)); ok(run(s, 'cookStep', step));
  for (const progress of [{ operation: 20, technique: 11 }, { operation: 21, technique: 12 }, { operation: 21, technique: 9 }]) {
    const before = copy(s); assert.equal(run(s, 'cookStep', { ...step, ...progress, activeMs: 24000 }).ok, false); assert.deepEqual(s, before);
  }
  ok(run(s, 'cookStep', { ...step, activeMs: 24000, operation: 40, technique: 30, plated: true }));
  const result = ok(run(s, 'cookFinish', { taskId: t.taskId, technique: 40 })); assert.equal(result.score, 82); assert.equal(result.quality, 'tasty');
});
check('prime ingredients change borderline technique quality and quick cooking retains learned technique', () => {
  const outputs = [];
  for (const preferPrime of [false, true]) {
    const s = starter(); s.homestead.pantry.egg_prime = 1;
    const t = ok(run(s, 'cookStart', { recipe: 'egg_custard', preferPrime }));
    ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 25, plated: true }));
    const result = ok(run(s, 'cookFinish', { taskId: t.taskId })); outputs.push([result.score, result.quality]);
    assert.equal(s.homestead.mastery.egg_custard.technique, 25);
    s.homestead.pantry.egg = 1; const quick = ok(run(s, 'quickCook', { recipe: 'egg_custard', count: 1, technique: 40 }));
    assert.equal(quick.score, 77); assert.equal(quick.quality, 'tasty'); assert.equal(s.homestead.mastery.egg_custard.technique, 25);
  }
  assert.deepEqual(outputs, [[77, 'tasty'], [85, 'fine']]);
});
check('legacy cooking without technique accepts old progress and transitions once from its earned baseline', () => {
  const s = starter(), t = ok(run(s, 'cookStart', { recipe: 'egg_custard' })); delete s.homestead.cooking.technique;
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 12000, operation: 20, plated: false }));
  assert.equal(Object.hasOwn(s.homestead.cooking, 'technique'), false); assert.deepEqual(H.validateHomesteadState(s), []);
  const before = copy(s); assert.equal(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 30, technique: 19, plated: true }).ok, false); assert.deepEqual(s, before);
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 30, technique: 25, plated: false }));
  assert.equal(s.homestead.cooking.technique, 25);
  const transitioned = copy(s); assert.equal(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, plated: true }).ok, false); assert.deepEqual(s, transitioned);
  ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 35, plated: true }));
  assert.equal(ok(run(s, 'cookFinish', { taskId: t.taskId })).score, 87);
});
check('pricing: all five legacy recipes preserve 1.30 opportunity cost', () => {
  assert.deepEqual(['strawberry_tart', 'pumpkin_soup', 'blueberry_muffin', 'lemon_tea', 'moon_cake'].map(id => H.dishPrice(id)), [146, 354, 271, 301, 754]);
  assert.equal(H.dishPrice('strawberry_tart', 'normal', 'milky'), Math.ceil((112 + 64) * 1.3));
});
check('milky variant: milk is actually consumed and only supported recipes accept it', () => {
  const s = starter(); s.crops = { strawberry: 2, wheat: 1 }; s.homestead.pantry.milk = 1;
  const d = cook(s, 'strawberry_tart', { variant: 'milky' }); assert.equal(d.key, 'strawberry_tart:fine:milky'); assert.equal(s.homestead.pantry.milk, undefined);
  assert.equal(run(s, 'cookStart', { recipe: 'egg_custard', variant: 'milky' }).ok, false);
});
check('processing: 2 milk to cheese / 1 to yogurt conserves base value', () => {
  const s = starter(); s.homestead.pantry.milk = 3; ok(run(s, 'process', { item: 'cheese', count: 1 })); ok(run(s, 'process', { item: 'yogurt', count: 1 }));
  assert.equal(s.homestead.pantry.milk, undefined); assert.equal(s.homestead.pantry.cheese, 1); assert.equal(s.homestead.pantry.yogurt, 1);
  assert.equal(H.PANTRY.cheese.sell + H.PANTRY.yogurt.sell, H.PANTRY.milk.sell * 3);
});
check('placement: unique instance, unavailable to sell, rotate/retrieve once', () => {
  const s = starter(), d = cook(s, 'egg_custard'); const p = ok(run(s, 'place', { key: d.key, zone: 'home', surface: 'home_ranch_picnic_7_3_0_0', anchor: 'a0' }));
  assert.equal(H.availableDish(s, d.key), 0); assert.equal(run(s, 'sellDish', { key: d.key }).ok, false);
  ok(run(s, 'rotate', { instanceId: p.instanceId })); assert.equal(s.homestead.placed[0].rotation, 1);
  ok(run(s, 'retrieve', { instanceId: p.instanceId })); assert.equal(H.availableDish(s, d.key), 1);
  assert.equal(run(s, 'retrieve', { instanceId: p.instanceId }).ok, false);
});
check('furniture moved: surface-wide retrieval restores exactly one per instance', () => {
  const s = starter(), d = cook(s, 'egg_custard'); s.homestead.dishes[d.key] = 2;
  s.placedIn.push({ id: 'dining', gx: 3, gz: 4, rot: 0 });
  for (const anchor of ['a0', 'a1']) ok(run(s, 'place', { key: d.key, zone: 'house', surface: 'house_dining_3_4_0_0', anchor }));
  ok(run(s, 'retrieveAll', { surface: 'house_dining_3_4_0_0' })); assert.equal(s.homestead.dishes[d.key], 2); assert.equal(s.homestead.placed.length, 0);
});
check('sell/eat/gift: a single dish cannot be consumed twice', () => {
  for (const [type, extra] of [['sellDish', {}], ['eat', {}], ['gift', { resident: 'man' }]]) {
    const s = starter(), d = cook(s, 'egg_custard'); ok(run(s, type, { key: d.key, ...extra })); const before = copy(s);
    assert.equal(run(s, type, { key: d.key, ...extra }).ok, false); assert.deepEqual(s, before);
  }
});
check('request receipt: retry cannot sell another dish from same batch', () => {
  const s = starter(), d = cook(s, 'egg_custard'); s.homestead.dishes[d.key] = 2;
  ok(run(s, 'sellDish', { key: d.key, requestId: 'sell-click-1' })); const before = copy(s);
  assert.equal(run(s, 'sellDish', { key: d.key, requestId: 'sell-click-1' }).duplicate, true); assert.deepEqual(s, before);
});
check('tea escrow: repeated key counts reserved, cancellation restores exact counts', () => {
  const s = starter(), d = cook(s, 'egg_custard'); s.homestead.dishes[d.key] = 2;
  const t = ok(run(s, 'teaStart', { keys: [d.key, d.key], guests: ['momo', 'man'] }));
  assert.equal(H.availableDish(s, d.key), 0); assert.deepEqual(H.validateHomesteadState(copy(s)), []);
  ok(run(s, 'teaCancel', { taskId: t.taskId })); assert.equal(s.homestead.dishes[d.key], 2);
  assert.equal(run(s, 'teaCancel', { taskId: t.taskId }).ok, false);
});
check('tea completion: resume, consume once, no coin refund, daily relationship once', () => {
  let s = starter(), d = cook(s, 'egg_custard'); s.homestead.dishes[d.key] = 3; const coins = s.coins;
  const t = ok(run(s, 'teaStart', { keys: [d.key], guests: ['man'] })); s = copy(s);
  ok(run(s, 'teaFinish', { taskId: t.taskId, skip: true })); const affection = s.npc.man.t;
  assert.equal(s.coins, coins); assert.equal(s.homestead.dishes[d.key], 2); assert.equal(run(s, 'teaFinish', { taskId: t.taskId, skip: true }).ok, false);
  const t2 = ok(run(s, 'teaStart', { keys: [d.key], guests: ['man'] })); ok(run(s, 'teaFinish', { taskId: t2.taskId, skip: true }));
  assert.equal(s.npc.man.t, affection); assert.equal(s.homestead.teaCount, 2); assert.equal(s.coins, coins);
});
check('order: always obtainable egg custard; sale value + bonus paid only once/day', () => {
  const s = starter(), d = cook(s, 'egg_custard'), before = s.coins; s.homestead.dishes[d.key] = 2;
  assert.equal(H.getHomesteadOrder(s, NOW).recipe, 'egg_custard'); ok(run(s, 'order', { key: d.key })); assert.equal(s.coins, before + H.dishPrice(d.key) + 25);
  assert.equal(run(s, 'order', { key: d.key }).ok, false); assert.equal(s.homestead.dishes[d.key], 1);
});
check('wool crafts: real existing furniture and hat IDs; failure never loses wool', () => {
  const s = starter(); s.homestead.teaCount = 1; s.homestead.pantry.wool = 8;
  ok(run(s, 'woolTrade', { trade: 'rug_cloud' })); ok(run(s, 'woolTrade', { trade: 'a_water' }));
  assert.equal(s.decor.rug_cloud, 1); assert(s.owned.includes('a_water')); assert.equal(s.homestead.pantry.wool, undefined);
  assert.equal(run(s, 'woolTrade', { trade: 'a_water' }).ok, false);
});
check('strict save validator rejects unknown fields, IDs, floats, duplicate instances', () => {
  const s = starter();
  for (const mutate of [h => h.bad = true, h => h.pantry.unknown = 1, h => h.pantry.egg = 0.5, h => h.pantry.egg = Number.MAX_SAFE_INTEGER + 1,
    h => h.animals.push(copy(h.animals[0])), h => h.animals[0].feed = 5, h => h.animals[0].kind = '__proto__', h => h.receipts = ['x', 'x'], h => h.dishes['egg_custard:legend:plain'] = 1]) {
    const h = copy(s.homestead); mutate(h); assert(H.validateHomestead(h).length > 0);
  }
});
check('prototype property IDs are never recipes, animals or ingredients and cannot corrupt coins', () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    assert.equal(H.parseDishKey(id + ':normal:plain'), null);
    const s = starter(), before = copy(s);
    for (const action of [{type:'adopt',kind:id},{type:'cookStart',recipe:id},{type:'sellIngredient',item:id,count:1}]) {
      assert.equal(H.performHomestead(s,action,NOW).ok,false);assert.deepEqual(s,before);assert(Number.isSafeInteger(s.coins));
    }
    const bad=copy(s.homestead);bad.animals[0].kind=id;assert(H.validateHomestead(bad).length);
  }
  const s=starter();s.coins=NaN;const before=JSON.stringify(s);assert.equal(run(s,'pet',{animalId:s.homestead.animals[0].id}).ok,false);assert.equal(JSON.stringify(s),before);
});
check('strict save validator verifies escrow against recipe; malformed input never grants food', () => {
  const s = starter(); ok(run(s, 'cookStart', { recipe: 'egg_custard' }));
  const bad = copy(s); bad.homestead.cooking.inputs = [{ id: 'wheat', count: 1 }]; assert(H.validateHomesteadState(bad).length);
  const malformed = copy(s.homestead); malformed.cooking.recipe = {}; assert(H.validateHomestead(malformed).length);
  const before = copy(bad); assert.equal(run(bad, 'cookCancel', { taskId: bad.homestead.cooking.id }).ok, false); assert.deepEqual(bad, before);
});
check('capacity overflow is atomic: cooking preserves escrow if resulting inventory is full', () => {
  const s = starter(); s.homestead.dishes['egg_custard:fine:plain'] = 999999;
  const t = ok(run(s, 'cookStart', { recipe: 'egg_custard' })); ok(run(s, 'cookStep', { taskId: t.taskId, activeMs: 24000, operation: 40, technique: 40, plated: true }));
  const before = copy(s); assert.equal(run(s, 'cookFinish', { taskId: t.taskId }).ok, false); assert.deepEqual(s, before);
});
check('every recipe: manual cook, unique placement, roundtrip, sale with no double reward', () => {
  const s = starter(); s.homestead.pantry = { egg: 40, milk: 40, duck_egg: 40, goat_milk: 40, cheese: 20, yogurt: 20 }; s.crops = Object.fromEntries(['strawberry', 'wheat', 'pumpkin', 'blueberry', 'apple', 'lemon', 'peach', 'orange', 'moonflower', 'cherry', 'radish'].map(k => [k, 40]));
  for (const r of H.RECIPES) {
    const d = cook(s, r.id), coins = s.coins;
    const p = ok(run(s, 'place', { key: d.key, zone: 'home', surface: 'home_ranch_picnic_7_3_0_0', anchor: 'a0' }));
    assert.deepEqual(H.validateHomesteadState(copy(s)), []); ok(run(s, 'retrieve', { instanceId: p.instanceId }));
    ok(run(s, 'sellDish', { key: d.key })); assert.equal(s.coins - coins, H.dishPrice(d.key));
  }
  assert.equal(Object.keys(s.homestead.history).length, 24);
});
check('tutorial grants an unplaced coop and keeps unhoused production paused', () => {
  const s=fresh();ok(run(s,'tutorial'));assert.equal(s.decor.ranch_coop,1);assert.equal(s.placed.length,0);assert.equal(H.getAnimalHousing(s).totalHoused,0);
  ok(run(s,'feed'));const before=copy(s);H.advanceHomestead(s,NOW+8*60*MIN);assert.deepEqual(s,before);assert.equal(s.homestead.animals[0].feed,4);
  s.placed.push({id:'ranch_coop',gx:2,gz:3,rot:0});H.advanceHomestead(s,NOW+8*60*MIN);assert.equal(s.homestead.animals[0].cycleAt,NOW+8*60*MIN+12*MIN);
});
check('housing counts only actual ground placements and assigns stable compatible homes', () => {
  const s=starter();s.placed.push({id:'ranch_barn',gx:12,gz:3,rot:2},{id:'ranch_hutch',gx:20,gz:3,rot:0},{id:'ranch_coop',gx:2,gz:3,rot:0},{id:'ranch_coop',gx:25,gz:3,rot:0,level:1});
  s.placedIn=[{id:'ranch_coop',gx:2,gz:3,rot:0}];s.buildPlaced=[{id:'ranch_barn',gx:2,gz:3,rot:0}];s.decor.ranch_coop=50;
  const h=H.getAnimalHousing(s);assert.equal(h.capacity,12);assert.equal(h.homes.length,3);assert.equal(h.assignments[s.homestead.animals[0].id],'home_ranch_coop_2_3_0_0');
  ok(run(s,'adopt',{kind:'duck'}));ok(run(s,'adopt',{kind:'goat'}));ok(run(s,'adopt',{kind:'rabbit'}));ok(run(s,'adopt',{kind:'alpaca'}));
  const assigned=H.getAnimalHousing(s);assert.equal(assigned.totalHoused,5);assert.equal(assigned.homes.find(v=>v.id==='ranch_barn').animalIds.length,2);assert.deepEqual(H.validateHomesteadState(s),[]);
});
check('adoption never borrows incompatible space and caps total population at sixteen', () => {
  const s=starter(),before=copy(s);assert.equal(run(s,'adopt',{kind:'rabbit'}).ok,false);assert.deepEqual(s,before);
  for(let i=0;i<3;i++)ok(run(s,'adopt',{kind:'duck'}));const full=copy(s);assert.equal(run(s,'adopt',{kind:'chicken'}).ok,false);assert.deepEqual(s,full);
  s.yardLv=5;for(let i=0;i<4;i++)s.placed.push({id:'ranch_coop',gx:20+i*4,gz:3,rot:0});s.coins=100000;
  for(let i=4;i<16;i++)ok(run(s,'adopt',{kind:'duck'}));assert.equal(H.getAnimalHousing(s).capacity,16);assert.equal(H.getAnimalHousing(s).totalHoused,16);
  const capped=copy(s);assert.equal(run(s,'adopt',{kind:'duck'}).ok,false);assert.deepEqual(s,capped);
});
check('housing and tea reject locked bounds, rotated overflow and overlapping fake capacity', () => {
  const s=fresh();H.ensureHomestead(s,NOW);s.yardLv=1;
  s.placed=[{id:'ranch_coop',gx:27,gz:2,rot:0},{id:'ranch_coop',gx:40,gz:2,rot:0},{id:'ranch_barn',gx:25,gz:2,rot:0},{id:'ranch_picnic',gx:40,gz:8,rot:0}];
  assert.equal(H.getAnimalHousing(s).capacity,0);assert.equal(H.getTeaSurfaces(s).length,0);
  s.placed.push({id:'ranch_barn',gx:25,gz:2,rot:1});assert.equal(H.getAnimalHousing(s).capacity,4);
  s.yardLv=5;assert.equal(H.getAnimalHousing(s).capacity,8);assert.equal(H.getTeaSurfaces(s).length,1);
  s.placed.push({id:'ranch_barn',gx:25,gz:2,rot:2},{id:'ranch_coop',gx:74,gz:5,rot:0});assert.equal(H.getAnimalHousing(s).capacity,8);
  s.placedIn=[{id:'dining',gx:21,gz:3,rot:0},{id:'ranch_picnic',gx:3,gz:3,rot:0}];s.buildPlaced=[{id:'dining',gx:35,gz:3,rot:0},{id:'dining',gx:3,gz:3,rot:0,level:9}];assert.equal(H.getTeaSurfaces(s).length,1);
});
check('removing a home pauses remaining time, conserves feed and quality, and never catches up absence', () => {
  const s=starter(),id=s.homestead.animals[0].id;ok(run(s,'pet',{animalId:id}));ok(run(s,'feed'));const a=s.homestead.animals[0];assert.equal(a.cyclePrime,true);
  s.placed=s.placed.filter(p=>p.id!=='ranch_coop');H.advanceHomestead(s,NOW+5*MIN);assert.equal(a.pausedMs,7*MIN);assert.equal(a.feed,3);assert.equal(a.cyclePrime,true);assert.equal(a.housingKey,'');
  const absent=copy(s);H.advanceHomestead(s,NOW+24*60*MIN);assert.deepEqual(s,absent);s.placed.push({id:'ranch_coop',gx:20,gz:5,rot:1});H.advanceHomestead(s,NOW+24*60*MIN);
  assert.equal(a.cycleAt,NOW+24*60*MIN+7*MIN);assert.equal(a.readyPrime,0);H.advanceHomestead(s,a.cycleAt);assert.equal(a.readyPrime,1);assert.equal(a.feed,2);
  s.placed=[];H.advanceHomestead(s,NOW+24*60*MIN+8*MIN);ok(run(s,'collect',{},NOW+24*60*MIN+8*MIN));assert.equal(s.homestead.pantry.egg_prime,1);assert.equal(s.homestead.animals[0].cycleAt,0);
});
check('all new animal products are reachable, prime-labelled and sell at declared prices', () => {
  for(const kind of ['duck','goat','rabbit','alpaca']){
    const s=starter();s.placed.push({id:'ranch_barn',gx:12,gz:3,rot:0},{id:'ranch_hutch',gx:20,gz:3,rot:0});const r=ok(run(s,'adopt',{kind}));ok(run(s,'pet',{animalId:r.animalId}));ok(run(s,'feed',{animalId:r.animalId}));
    H.advanceHomestead(s,NOW+H.ANIMAL[kind].cycleMs);ok(run(s,'collect',{animalId:r.animalId},NOW+H.ANIMAL[kind].cycleMs));const item=H.ANIMAL[kind].product+'_prime';assert.equal(s.homestead.pantry[item],1);const coins=s.coins;ok(run(s,'sellIngredient',{item,count:1},NOW+H.ANIMAL[kind].cycleMs));assert.equal(s.coins-coins,H.PANTRY[item].sell);
  }
});
const legacyState=level=>{const s=starter();s.homestead.version=1;s.homestead.ranchLevel=level;for(const a of s.homestead.animals){delete a.housingKey;delete a.pausedMs;}s.placed=[];s.decor={};return s;};
check('v1 migration returns old scene dishes and tea escrow, grants houses and refunds upgrades once', () => {
  const s=legacyState(3),h=s.homestead,key='egg_custard:normal:plain';h.dishes[key]=2;h.placed=[{id:'dish_2',key,zone:'ranch',surface:'ranch_picnic',anchor:'a0',rotation:0},{id:'dish_3',key,zone:'house',surface:'house_dining_3_3_0_0',anchor:'a0',rotation:0}];
  h.tea={id:'tea_4',keys:[key,key],guests:['momo'],startedAt:NOW,readyAt:NOW+30000};h.serial=5;h.animals[0].cycleAt=NOW+7*MIN;h.animals[0].cyclePrime=true;h.animals[0].feed=3;
  assert.deepEqual(H.validateHomesteadState(s),[]);const coins=s.coins;H.migrateHomestead(s,NOW+99999999);assert.equal(s.homestead.version,2);assert.equal(s.coins,coins+1700);assert.equal(s.decor.ranch_coop,1);assert.equal(s.placed.length,0);
  assert.equal(s.homestead.dishes[key],5);assert.equal(s.homestead.placed.length,1);assert.equal(s.homestead.placed[0].zone,'house');assert.equal(s.homestead.tea,null);assert.equal(s.homestead.animals[0].pausedMs,7*MIN);assert.equal(s.homestead.animals[0].cyclePrime,true);
  const after=copy(s);H.migrateHomestead(s,NOW+3e9);assert.deepEqual(s,after);H.ensureHomestead(s,NOW+4e9);assert.deepEqual(s,after);assert.deepEqual(H.validateHomesteadState(s),[]);
});
check('v1 migration is deterministic, keeps cooking custody and gifts sufficient type-specific homes', () => {
  const s=starter();s.placed.push({id:'ranch_barn',gx:12,gz:3,rot:0});s.homestead.history={egg_custard:2,strawberry_tart:2};s.homestead.teaCount=1;
  for(let i=0;i<3;i++)ok(run(s,'adopt',{kind:'chicken'}));for(let i=0;i<4;i++)ok(run(s,'adopt',{kind:i%2?'cow':'sheep'}));const task=ok(run(s,'cookStart',{recipe:'egg_custard'}));
  const old=copy(s);old.homestead.version=1;old.homestead.ranchLevel=3;for(const a of old.homestead.animals){delete a.housingKey;delete a.pausedMs;}old.decor={};old.placed=[];
  const one=copy(old),two=copy(old);H.migrateHomestead(one,0);H.migrateHomestead(two,NOW+999999);assert.deepEqual(one,two);assert.equal(one.decor.ranch_coop,1);assert.equal(one.decor.ranch_barn,1);assert.deepEqual(one.homestead.cooking,old.homestead.cooking);ok(run(one,'cookCancel',{taskId:task.taskId}));assert.equal(one.homestead.pantry.egg,1);
  const level2=legacyState(2);H.migrateHomestead(level2,NOW);assert.equal(level2.coins,10500);const level1=legacyState(1);H.migrateHomestead(level1,NOW);assert.equal(level1.coins,10000);
});
check('migration overflow and corrupted legacy saves reject atomically without partial refunds', () => {
  for(const mutate of [s=>s.coins=Number.MAX_SAFE_INTEGER,s=>s.decor.ranch_coop=999999,s=>s.homestead.pantry.egg=-1]){const s=legacyState(3);mutate(s);const before=copy(s);assert.throws(()=>H.migrateHomestead(s,NOW));assert.deepEqual(s,before);}
});
check('tea needs an actual eligible table and checks capacity before reserving food', () => {
  const s=starter(),d=cook(s,'egg_custard');s.homestead.dishes[d.key]=3;s.placed=[];s.placedIn=[{id:'kitchen_island',gx:3,gz:3,rot:0}];const noTable=copy(s);assert.equal(run(s,'teaStart',{keys:[d.key],guests:['momo']}).ok,false);assert.deepEqual(s,noTable);
  s.placedIn.push({id:'dining',gx:7,gz:3,rot:0});assert.equal(H.getTeaSurfaces(s)[0].capacity,2);const before=copy(s);assert.equal(run(s,'teaStart',{keys:[d.key,d.key,d.key],guests:['momo']}).ok,false);assert.deepEqual(s,before);
  s.placed.push({id:'ranch_picnic',gx:7,gz:3,rot:0});const surface=H.getTeaSurfaces(s).find(v=>v.zone==='home').id;const t=ok(run(s,'teaStart',{surface,keys:[d.key,d.key,d.key],guests:['momo']}));assert.equal(s.homestead.tea.surface,surface);
  s.placed[0].rot=1;const moved=copy(s);assert.equal(run(s,'teaFinish',{taskId:t.taskId,skip:true}).ok,false);assert.deepEqual(s,moved);ok(run(s,'teaCancel',{taskId:t.taskId}));assert.equal(s.homestead.dishes[d.key],3);
});
check('v2 rejects old ranch placements, invalid housing clocks and forged tea surfaces', () => {
  const s=starter();for(const mutate of [h=>h.ranchLevel=1,h=>h.animals[0].housingKey='ranch_coop',h=>h.animals[0].pausedMs=-1,h=>{h.animals[0].pausedMs=1;h.animals[0].cycleAt=NOW+1;},h=>h.animals[0].pausedMs=999999999]){const h=copy(s.homestead);mutate(h);assert(H.validateHomestead(h).length);}
  const d=cook(s,'egg_custard'),before=copy(s);assert.equal(run(s,'place',{key:d.key,zone:'ranch',surface:'ranch_picnic',anchor:'a0'}).ok,false);assert.deepEqual(s,before);ok(run(s,'teaStart',{keys:[d.key],guests:['momo']}));s.homestead.tea.surface='constructor';assert(H.validateHomestead(s.homestead).length);
});
const report = { ok: true, checks, names, scope: 'pure-rule synthetic saves; no database/network/device' };
const out = process.argv.indexOf('--out'); if (out >= 0) { const target = path.resolve(process.argv[out + 1]); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2), { flag: 'wx' }); }
process.stdout.write(JSON.stringify(report) + '\n');
