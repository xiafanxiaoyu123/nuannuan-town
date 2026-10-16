// Actual save + live interaction producers with memory-only storage and model/audio UI boundaries.
// Shared cloud validation is loaded directly; no API process, database, credentials or provider.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), THREE = require('three');
if (!vm.SourceTextModule) {
  const result = require('node:child_process').spawnSync(process.execPath,
    ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(result.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => assert.deepEqual(clone(a), clone(b));
async function main() {
  const storage = new Map(), timers = new Map(), modules = new Map(), checks = [], writes = [];
  const key = 'nikki-block-town-save-v1:qa-fortune-memory'; let serial = 0;
  const document = { createElement: tag => ({ nodeType: 1, tag, style: {}, children: [], classList: { add() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, append(node) { this.children.push(node); } }), createTextNode: value => ({ nodeType: 3, textContent: value }) };
  const context = vm.createContext({ console, Date, Math, TextEncoder, URLSearchParams, performance, document, window: {},
    location: { search: '?slot=qa-fortune-memory', protocol: 'http:', hostname: 'localhost' },
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    fetch() { throw new Error('Network forbidden'); },
    localStorage: { getItem: name => storage.get(name) ?? null,
      setItem: (name, value) => { storage.set(name, value); writes.push(name); }, removeItem: name => storage.delete(name) },
  });
  const group = (x = 0, y = 0, z = 0) => { const value = new THREE.Group(); value.position.set(x, y, z); return value; };
  const primitive = (...args) => group(...args.slice(4, 7));
  const kit = { THREE, group, box: primitive, cbox: primitive, cyl: primitive, sph: (...args) => group(...args.slice(2, 5)), mat: value => value, glow: value => value, textPlane: () => group() };
  const substitute = new Map([['js/core/kit.js', kit], ['js/core/app.js', { app: {} }],
    ['js/core/audio.js', { audio: { sfx() {}, tone() {} } }], ['js/core/fx.js', { fx: { hearts() {}, sparkle() {}, confetti() {} } }],
    ['js/core/icons.js', { seedIco() {}, decorIcon() {}, coinIco() {} }]]);
  const at = file => {
    if (!modules.has(file)) {
      const replacement = substitute.get(path.relative(root, file).replace(/\\/g, '/'));
      modules.set(file, replacement ? new vm.SyntheticModule(Object.keys(replacement), function () {
        for (const [name, value] of Object.entries(replacement)) this.setExport(name, value);
      }, { context, identifier: file }) : new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  };
  const entry = new vm.SourceTextModule("import './js/live/fun.js'; import './js/world/town/input.js';", { context, identifier: path.join(root, 'qa-fortune.js') });
  await entry.link((specifier, from) => at(path.resolve(path.dirname(from.identifier), specifier))); await entry.evaluate();
  const get = file => modules.get(path.join(root, file)).namespace;
  const state = get('js/core/state.js'), rules = get('js/shared/momo-fortune.js'), format = get('js/core/save-format.js');
  const cloud = require(path.join(root, 'server/save-contract.js'));
  const fresh = () => { state.resetSave(); state.flushSave(); state.load(); state.flushSave(); return clone(state.S); };
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const stable = () => {
    const snapshot = clone(state.serializeState()), text = state.exportSaveFile().text, n = writes.length;
    state.previewSaveImport(text); assert.equal(writes.length, n);
    assert.equal(state.importSaveFile(text).ok, true); assert.equal(state.flushSave(), true); assert.equal(state.load(), true);
    equal(state.serializeState(), snapshot); equal(cloud.validateCloudSave(snapshot).data, snapshot);
    return snapshot;
  };
  const install = () => {
    const town = { inter: [], ticks: [], zone: 'town', frozen: false, lock: 0, photoOn: false, decor: { active: false },
      pos: new THREE.Vector3(0, 0, 0), momo: { root: group(1, 0, 0) }, scene: new THREE.Scene(),
      place(obj, x, z) { obj.position.set(x, 0, z); this.scene.add(obj); }, addCircle() {}, blocked() { return false; },
      act() {}, face() {}, npcs: [], farm: { interactable() { return null; } } };
    const messages = [], ui = { toast: text => messages.push(text), modal() {} };
    get('js/live/fun.js').installFun({ town, ui });
    town.allInter = () => get('js/world/town/input.js').allInter(town);
    return { town, messages, pet: town.inter.find(it => it.id === 'momoPet'), fortune: town.inter.find(it => it.id === 'fortune') };
  };

  await test('今日支持读取不创建字段、不写存储、不发金币；无档/昨日/未来/坏运行字段均无加成', () => {
    fresh(); const original = JSON.stringify(state.S), n = writes.length;
    equal(rules.getDailySupport(state.S), { momoEnergy: 0, fortuneLv: null, fortuneBonus: 0, rareDropBonus: 0 });
    assert.equal(JSON.stringify(state.S), original); assert.equal(writes.length, n);
    for (const day of ['', '2026-10-17', '1年3月2日', 'broken']) {
      const d = clone(state.S); d.live.fun = { day, used: { momoPet: 1, fortuneLv: '大吉' } };
      equal(rules.getDailySupport(d), { momoEnergy: 0, fortuneLv: null, fortuneBonus: 0, rareDropBonus: 0 });
    }
    for (const used of [null, [], 3, { momoPet: 'true', fortuneLv: '神吉' }]) {
      const d = clone(state.S); d.live.fun = { day: rules.dailyFunKey(d), used };
      equal(rules.getDailySupport(d), { momoEnergy: 0, fortuneLv: null, fortuneBonus: 0, rareDropBonus: 0 });
    }
  });

  await test('五种吉签收益/大吉掉率/中吉20与摸摸35叠加，快照只看镇历而非现实日期', () => {
    fresh(); const expected = { 大吉: [.08, .2, 35], 中吉: [.05, 0, 55], 小吉: [.03, 0, 35], 吉: [.03, 0, 35], 末吉: [.03, 0, 35] };
    for (const [level, [bonus, rare, energy]] of Object.entries(expected)) {
      state.S.live.fun = { day: rules.dailyFunKey(state.S), used: { fortuneLv: level, momoPet: true }, capsule: 4 };
      equal(rules.getDailySupport(state.S), { momoEnergy: energy, fortuneLv: level, fortuneBonus: bonus, rareDropBonus: rare }); stable();
    }
    const snapshot = rules.getDailySupport(state.S); state.S.gday++;
    assert.equal(rules.getDailySupport(state.S).fortuneBonus, 0); assert.equal(snapshot.fortuneLv, '末吉');
  });

  await test('实际摸摸生产者：移动位置读取、低优先级不抢门/居民操作、一次标记保存且无经济增发', () => {
    fresh(); const { town, pet, messages } = install(), before = clone(state.S);
    assert.equal(pet.r, 1.9); town.momo.root.position.set(1.3, 0, .2); assert.equal(pet.x, 1.3); assert.equal(pet.z, .2);
    const door = { id: 'qaDoor', x: 1.8, z: 0, r: 2, act() {} }; town.inter.push(door);
    assert.equal(get('js/world/town/input.js').findInter(town), door);
    pet.act(); assert.equal(state.S.live.fun.used.momoPet, 1); assert.equal(pet.r, 0); assert.equal(messages.length, 1);
    assert.equal(state.S.coins, before.coins); equal(state.S.seeds, before.seeds); equal(state.S.stats, before.stats);
    assert.equal(rules.getDailySupport(state.S).momoEnergy, 35); stable();
    pet.act(); assert.equal(messages.length, 1); assert.equal(state.S.coins, before.coins);
  });

  await test('暂停/装修/拍照/坐卧阻止摸摸，楼上离脚边大喵太高不显示，换存档互动写当前对象', () => {
    fresh(); const { town, pet } = install();
    for (const [key, value] of [['frozen', true], ['lock', 1], ['photoOn', true]]) {
      town[key] = value; pet.act(); assert.equal(state.S.live.fun.used.momoPet, undefined); town[key] = false;
    }
    for (const status of [{ bedState: {} }, { seated: {} }]) {
      town.homeInteractions = status; assert.equal(pet.r, 0); pet.act(); assert.equal(state.S.live.fun.used.momoPet, undefined);
    }
    town.homeInteractions = null; town.decor.active = true; assert.equal(pet.r, 0); pet.act(); assert.equal(state.S.live.fun.used.momoPet, undefined);
    town.decor.active = false; town.pos.y = 2; assert.equal(pet.r, 0); town.pos.y = 0;
    const old = state.S; fresh(); pet.act(); assert.equal(old.live.fun.used.momoPet, undefined); assert.equal(state.S.live.fun.used.momoPet, 1);
  });

  await test('实际签筒首次找零20且只统计一次，保存等级、重复看签/导入重载不会重复发放', () => {
    fresh(); const { fortune } = install(), coins = state.S.coins;
    fortune.act(); assert.equal(state.S.coins, coins + 20); assert.equal(state.S.stats.fortunes, 1);
    assert.equal(state.S.live.fun.used.fortuneLv, rules.fortuneForDay(state.S)[0]);
    stable(); const previous = JSON.stringify(state.serializeState()); fortune.act();
    assert.equal(state.S.coins, coins + 20); assert.equal(state.S.stats.fortunes, 1); assert.equal(JSON.stringify(state.serializeState()), previous);
  });

  await test('已抽过的历史签无等级按原10日序列还原，预览云校验不改旧档，补写等级不补发金币', () => {
    const originalRanks = ['中吉', '大吉', '吉', '小吉', '大吉', '末吉', '小吉', '中吉', '末吉', '吉'];
    for (let day = 0; day < 10; day++) {
      fresh(); state.S.gday = day; state.S.live.fun = { day: rules.dailyFunKey(state.S), capsule: 3, used: { fortune: 1, music: 1, extension: { note: '保留' } }, extension: 17 };
      const old = clone(state.S), before = JSON.stringify(old), coins = state.S.coins;
      assert.equal(rules.getDailySupport(state.S).fortuneLv, originalRanks[day]);
      equal(cloud.validateCloudSave(old).data, old); assert.equal(JSON.stringify(old), before); stable();
      install().fortune.act(); assert.equal(state.S.coins, coins); assert.equal(state.S.stats.fortunes, undefined);
      assert.equal(state.S.live.fun.used.fortuneLv, originalRanks[day]); assert.equal(state.S.live.fun.used.music, 1);
      equal(state.S.live.fun.used.extension, { note: '保留' }); assert.equal(state.S.live.fun.extension, 17); stable();
    }
  });

  await test('已保存draft等级/null/布尔标记保留，合法等级但缺旧抽签标记也不再次领找零', () => {
    for (const level of [...rules.FORTUNE_LEVELS, null]) {
      fresh(); state.S.live.fun = { day: rules.dailyFunKey(state.S), used: { fortuneLv: level, momoPet: false }, capsule: 0 };
      stable(); assert.equal(state.S.live.fun.used.fortuneLv, level);
      if (level !== null) { const coins = state.S.coins; install().fortune.act(); assert.equal(state.S.coins, coins); assert.equal(state.S.live.fun.used.fortuneLv, level); }
    }
    for (const flag of [0, 1, false, true]) {
      fresh(); state.S.live.fun = { day: rules.dailyFunKey(state.S), used: { momoPet: flag }, capsule: 0 }; stable();
      assert.equal(rules.getDailySupport(state.S).momoEnergy, flag ? 35 : 0);
    }
  });

  await test('跨镇日立即失效，真实下一次互动刷新每日账本并各领一次，未知非每日数据不丢', () => {
    fresh(); const { pet, fortune } = install(); pet.act(); fortune.act(); state.S.live.fun.extension = { data: '不丢' };
    const day = state.S.live.fun.day, coins = state.S.coins; state.S.gday++;
    assert.notEqual(rules.dailyFunKey(state.S), day); assert.equal(rules.getDailySupport(state.S).momoEnergy, 0);
    assert.equal(rules.getDailySupport(state.S).fortuneBonus, 0); assert.equal(pet.r, 1.9);
    stable(); pet.act(); fortune.act(); pet.act(); fortune.act();
    assert.equal(state.S.coins, coins + 20); assert.equal(state.S.stats.fortunes, 2); assert.equal(state.S.live.fun.capsule, 0);
    equal(state.S.live.fun.extension, { data: '不丢' }); assert.equal(state.S.live.fun.used.momoPet, 1); stable();
  });

  await test('合成已有金币/衣橱/家具布局/种子/周常/迎宾领取记录完整往返，仅新增实际找零与应援字段', () => {
    const data = fresh(); data.coins = 54321; data.seeds.wheat = 7; data.stats.plays = 12; data.decor.bench = 2;
    data.placedIn = [{ id: 'bench', gx: 5, gz: 5, rot: 0 }];
    data.decorLayouts.house = [{ version: 1, zone: 'house', name: '既有方案', placed: clone(data.placedIn), floor: {} }];
    data.live.market = { week: '2026-W42', orders: [{ id: 'mk_work', stat: 'plays', base: 10, need: 5, coins: 120, claimed: true }] };
    data.live.welcome = { date: '2026-10-17', claimed: true, coins: 80, seedId: 'wheat' };
    data.futureExtension = { note: '保留扩展', completed: [1, 3] };
    state.replaceSaveData(data); const before = clone(state.serializeState()), { pet, fortune } = install();
    pet.act(); fortune.act(); const after = stable();
    for (const field of ['owned', 'outfit', 'shops', 'decor', 'placed', 'placedIn', 'decorLayouts', 'seeds', 'futureExtension']) equal(after[field], before[field]);
    equal(after.live.market, before.live.market); equal(after.live.welcome, before.live.welcome);
    assert.equal(after.coins, before.coins + 20); assert.equal(after.stats.plays, 12); assert.equal(after.stats.fortunes, 1);
    assert.equal(after.live.fun.used.momoPet, 1); assert.ok(rules.FORTUNE_LEVELS.includes(after.live.fun.used.fortuneLv));
  });

  await test('新已知字段坏类型/未知签级在客户端和服务端同时拒绝，现有内存/落盘原样保留', () => {
    const bads = [['momoPet', '1'], ['momoPet', 2], ['momoPet', null], ['momoPet', {}], ['momoPet', -1],
      ['fortuneLv', '神吉'], ['fortuneLv', 1], ['fortuneLv', {}], ['fortuneLv', false]];
    for (const [field, value] of bads) {
      const data = fresh(); data.live.fun.used[field] = value;
      const current = JSON.stringify(state.S), saved = JSON.stringify([...storage]), n = writes.length;
      assert.throws(() => format.validateSaveData(data), new RegExp(field)); assert.throws(() => cloud.validateCloudSave(data), new RegExp(field));
      assert.throws(() => state.previewSaveImport(JSON.stringify(data)), new RegExp(field));
      assert.equal(state.importSaveFile(JSON.stringify(data)).ok, false); assert.equal(JSON.stringify(state.S), current);
      assert.equal(JSON.stringify([...storage]), saved); assert.equal(writes.length, n);
    }
  });

  const report = { pass: true, checks: checks.length, names: checks, timestamp: new Date().toISOString(),
    scope: 'Actual live producers, save import/export/reload, pure rules and shared server save contract. In-memory storage; model/audio/UI boundaries. No network/server/database/payment.' };
  const outIndex = process.argv.indexOf('--out');
  if (outIndex >= 0) { const out = path.resolve(process.argv[outIndex + 1]); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify({ pass: true, checks: checks.length, isolation: 'memory only' }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
