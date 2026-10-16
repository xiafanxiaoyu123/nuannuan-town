// Actual game/data/save modules, deterministic in-memory storage and renderer/audio/UI boundaries.
// No server, credentials, player files, browser profile, external network or payment provider.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
if (!vm.SourceTextModule) {
  const child = require('node:child_process').spawnSync(process.execPath,
    ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const clock = { now: new Date(2026, 9, 17, 12).getTime() };
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }

async function main() {
  const storage = new Map(), writes = [], timers = new Map(), modules = new Map(), checks = [];
  const key = 'nikki-block-town-save-v1:qa-backend-game-memory';
  let serial = 0, random = 0, invalidations = 0;
  const cloud = { data: null, revision: 0, writes: 0 };
  const fetchMemory = async (input, options = {}) => {
    const url = new URL(String(input), 'http://localhost'), method = options.method || 'GET';
    const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/me') return response({ user: { id: 'synthetic-compat-player', username: 'Compat QA' } });
    if (url.pathname === '/api/account/entitlements') return response({ plan: 'free-public', freeEntitlements: true, features: ['cloud_sync', 'auto_update'] });
    if (url.pathname === '/api/auth/logout') return response({ ok: true });
    if (url.pathname === '/api/save' && method === 'GET') return cloud.data ? response({ data: clone(cloud.data), revision: cloud.revision }) : response({ error: 'none' }, 404);
    if (url.pathname === '/api/save' && method === 'PUT') {
      const body = JSON.parse(options.body);
      if (body.baseRevision !== cloud.revision) return response({ error: 'conflict', conflict: { data: clone(cloud.data), revision: cloud.revision } }, 409);
      cloud.data = clone(format.validateSaveData(body.data, { allowLegacyBuilding: true })); cloud.revision++; cloud.writes++;
      return response({ revision: cloud.revision });
    }
    throw new Error('Forbidden unexpected in-memory API request: ' + method + ' ' + url.pathname);
  };
  const app = {}, audio = { sfx() {} }, effects = { sparkle() {} };
  const math = Object.create(Math); math.random = () => random;
  const context = vm.createContext({ console, Math: math, Date: ClockDate, TextEncoder, URLSearchParams, URL, performance, Headers, Response,
    crypto: require('node:crypto').webcrypto, fetch: fetchMemory,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, dispatchEvent() {},
    location: { search: '?slot=qa-backend-game-memory', protocol: 'http:', origin: 'http://localhost', href: 'http://localhost/?slot=qa-backend-game-memory' },
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: name => storage.get(name) ?? null, setItem: (name, value) => { storage.set(name, value); writes.push(name); }, removeItem: name => storage.delete(name) },
  });
  const substitutions = new Map([
    ['js/core/app.js', { app }], ['js/core/audio.js', { audio }], ['js/core/fx.js', { fx: effects }],
    ['js/ui/ui.js', { ui: {}, svg() {} }], ['js/core/icons.js', { coinIco() {}, cropIco() {} }],
  ]);
  const at = file => {
    if (!modules.has(file)) {
      const substitute = substitutions.get(path.relative(root, file).replace(/\\/g, '/'));
      modules.set(file, substitute ? new vm.SyntheticModule(Object.keys(substitute), function () {
        for (const [name, value] of Object.entries(substitute)) this.setExport(name, value);
      }, { context, identifier: file }) : new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  };
  const resolve = (specifier, from) => specifier === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13))
      : path.resolve(path.dirname(from.identifier), specifier);
  const entry = new vm.SourceTextModule([
    "import './js/live/api.js';", "import './js/models/props.js';", "import './js/live/home-interactions.js';",
    "import './js/world/farm.js';", "import './js/games/common.js';",
    "import './js/core/account.js';",
  ].join('\n'), { context, identifier: path.join(root, 'qa-memory-entry.js') });
  await entry.link((specifier, from) => at(resolve(specifier, from))); await entry.evaluate();
  const get = name => modules.get(path.join(root, name)).namespace;
  const state = get('js/core/state.js'), format = get('js/core/save-format.js'), live = get('js/live/api.js').live;
  const compat = get('js/shared/save-compat.js'), props = get('js/models/props.js'), THREE = get('js/core/kit.js').THREE;
  const Farm = get('js/world/farm.js').Farm, MiniGame = get('js/games/common.js').MiniGame;
  const fresh = () => { state.resetSave(); state.flushSave(); return clone(state.S); };
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const stable = expected => {
    const text = state.exportSaveFile().text;
    state.previewSaveImport(text);
    assert.equal(state.importSaveFile(text).ok, true);
    assert.equal(state.flushSave(), true); assert.equal(state.load(), true);
    equal(state.serializeState(), state.normalizeSaveData(state.serializeState()));
    if (expected !== undefined) assert.equal(compat.fertilizerCount(state.S), expected);
    return text;
  };

  await test('迎宾实际领取后导出/导入/重载/云快照通过，同日不会重复发金币、种子、花肥', () => {
    fresh(); const before = state.S.coins, gift = clone(live.welcome());
    assert.ok(live.claimWelcome()); assert.equal(state.S.coins, before + gift.coins);
    assert.equal(state.S.seeds[gift.seedId], 1); assert.equal(compat.fertilizerCount(state.S), 1);
    assert.equal(Object.hasOwn(state.S.seeds, 'fertilizer'), false);
    stable(1); const after = JSON.stringify(state.serializeState());
    assert.equal(live.claimWelcome(), null); assert.equal(JSON.stringify(state.serializeState()), after);
  });

  await test('两个历史花肥位置合并不丢数，预览不改原对象/内存/存储，重复迁移和重载不增发', () => {
    for (const [seedCount, statsCount] of [[3, 4], [0, 4], [5, 0], [0, 0]]) {
      const legacy = fresh(); legacy.seeds.fertilizer = seedCount; legacy.stats.fertilizer = statsCount;
      legacy.live.welcome = { date: '2026-10-17', claimed: true, coins: 80, seedId: 'wheat', seedName: 'test' };
      const original = JSON.stringify(legacy), current = JSON.stringify(state.S), saved = JSON.stringify([...storage]), n = writes.length;
      const validated = format.validateSaveData(legacy), normalized = state.normalizeSaveData(legacy);
      assert.equal(JSON.stringify(legacy), original); assert.equal(JSON.stringify(state.S), current);
      state.previewSaveImport(original); assert.equal(JSON.stringify([...storage]), saved); assert.equal(writes.length, n);
      assert.equal(validated.stats.fertilizer, seedCount + statsCount); assert.equal(Object.hasOwn(validated.seeds, 'fertilizer'), false);
      equal(state.normalizeSaveData(normalized), normalized);
      assert.equal(state.importSaveFile(original).ok, true); stable(seedCount + statsCount);
      assert.equal(live.claimWelcome(), null); assert.equal(compat.fertilizerCount(state.S), seedCount + statsCount);
      // 本地旧档启动也修复，不能只修导入文件。
      storage.set(key, original); assert.equal(state.load(), true); stable(seedCount + statsCount);
    }
  });

  await test('花肥历史坏类型/负数/小数/溢出仍拒绝，未知种子和坏每日数据不被迁移掩盖', () => {
    for (const value of [-1, 1.5, '2', null, {}, Number.MAX_SAFE_INTEGER + 1]) {
      const d = fresh(); d.seeds.fertilizer = value;
      const before = JSON.stringify(state.S), saved = JSON.stringify([...storage]);
      assert.throws(() => state.normalizeSaveData(d)); assert.equal(state.importSaveFile(JSON.stringify(d)).ok, false);
      assert.equal(JSON.stringify(state.S), before); assert.equal(JSON.stringify([...storage]), saved);
    }
    let d = fresh(); d.seeds.fertilizer = Number.MAX_SAFE_INTEGER; d.stats.fertilizer = 1;
    assert.throws(() => state.normalizeSaveData(d));
    for (const value of [null, '3', -1, 0.5]) {
      d = fresh(); d.seeds.fertilizer = 1; d.stats.fertilizer = value;
      assert.throws(() => state.normalizeSaveData(d));
    }
    d = fresh(); d.seeds.fertilizer = 1; d.seeds.unknown_seed = 1; assert.throws(() => state.normalizeSaveData(d), /未知种子/);
    d = fresh(); d.seeds.fertilizer = 1; d.live.daily = [{ id: 'd_cafe', n: 120, prog: 'broken' }];
    assert.throws(() => state.normalizeSaveData(d), /prog 数值无效/);
  });

  await test('真实农场施肥消耗统一库存且不重复扣减，保留生长加速与闪耀玩法', () => {
    fresh(); compat.addFertilizer(state.S, 2);
    const crop = { crop: 'radish', t0: clock.now - 1000, dur: 60000, watered: true }, rec = { obj: new THREE.Group() };
    const farm = Object.create(Farm.prototype); let refreshes = 0;
    Object.assign(farm, { state: () => crop, town: { scene: new THREE.Scene(), face() {}, act() {} }, refresh() { refreshes++; } });
    assert.equal(farm.fertilize(rec), true); assert.equal(compat.fertilizerCount(state.S), 1);
    assert.equal(crop.fertilized, true); assert.equal(crop.shiny, true); assert.ok(crop.dur < 60000);
    assert.equal(farm.fertilize(rec), false); assert.equal(compat.fertilizerCount(state.S), 1); assert.equal(refreshes, 1);
    stable(1);
    state.S.stats.fertilizer = 0; crop.fertilized = false;
    assert.equal(farm.fertilize(rec), false); assert.equal(compat.fertilizerCount(state.S), 0);
  });

  await test('真实小游戏打烊掉落和迎宾共用花肥，重复结算不重复发奖，结算快照有效', async () => {
    fresh(); live.claimWelcome();
    const game = Object.create(MiniGame.prototype);
    Object.assign(game, { id: 'cafe', state: 'play', paused: false, dead: false, endless: false,
      lv: 1, score: 200, bonus: { pct: 0 }, fx: () => 0, shop: { style: 'sweet' }, starAt: [1, 2, 300], stage: 1, elapsed: 60 });
    const pending = game.finish(); pending.catch(error => { throw error; });
    assert.equal(game.state, 'over'); assert.equal(compat.fertilizerCount(state.S), 2);
    const snapshot = state.serializeState(), coins = state.S.coins;
    await game.finish(); assert.equal(state.S.coins, coins); equal(state.serializeState(), snapshot);
    assert.equal(JSON.parse(storage.get(key)).stats.fertilizer, 2); stable(2);
  });

  await test('画作4主题与历史0..20保留原值，已放家具/装修方案/共同角落均能往返', () => {
    for (const photo of [...Array.from({ length: 21 }, (_, n) => n), ...compat.PHOTO_THEMES.map(theme => theme.id)]) {
      const d = fresh(), placement = { id: 'photo_frame', gx: 5, gz: 5, rot: 1, photo };
      d.placedIn = [clone(placement)];
      d.decorLayouts = { house: [{ version: 1, zone: 'house', name: '相框旧方案', placed: [clone(placement)], floor: {} }] };
      d.live.companion = { version: 1, events: { corner: { status: 'active', startedDay: 1, placed: [clone(placement)] } } };
      assert.equal(state.importSaveFile(JSON.stringify(d)).ok, true); stable();
      equal(state.S.placedIn[0], placement); equal(state.S.decorLayouts.house[0].placed[0], placement);
      equal(state.S.live.companion.events.corner.placed[0], placement);
    }
  });

  await test('画作未知主题/越界数字/小数等无效输入仍拒绝且不替换当前进度', () => {
    for (const photo of [-1, 21, 0.5, null, true, 'unknown', '1', {}]) {
      const d = fresh(); d.placedIn = [{ id: 'photo_frame', gx: 5, gz: 5, rot: 0, photo }];
      const current = JSON.stringify(state.S), saved = JSON.stringify([...storage]);
      assert.throws(() => state.normalizeSaveData(d), /画作主题无效/);
      assert.equal(state.importSaveFile(JSON.stringify(d)).ok, false);
      assert.equal(JSON.stringify(state.S), current); assert.equal(JSON.stringify([...storage]), saved);
    }
  });

  const themeColors = (rootObject, value) => {
    props.applyDecorVariant(rootObject, { id: 'photo_frame', photo: value });
    return ['frame-sky', 'frame-hill', 'frame-sun'].map(name => '#' + rootObject.getObjectByName(name).material.color.getHexString());
  };
  await test('实际Three模型使用字符串主题，并与历史数字模4映射显示完全一致', () => {
    const model = props.buildDecor('photo_frame');
    for (let number = 0; number <= 20; number++) {
      const theme = compat.PHOTO_THEMES[number % 4], colors = [theme.sky, theme.hill, theme.sun];
      equal(themeColors(model, number), colors); equal(themeColors(model, theme.id), colors);
    }
  });

  await test('实际家具互动从历史数字继续换画，画面颜色随选择改变且位置/数量不动', () => {
    fresh(); const placement = { id: 'photo_frame', gx: 5, gz: 5, rot: 0, photo: 6 };
    state.S.placedIn = [placement]; state.S.decor.photo_frame = 3;
    const object = props.buildDecor('photo_frame'); object.position.set(5, 0, 5);
    props.applyDecorVariant(object, placement);
    const rec = { e: placement, obj: object }, scene = new THREE.Scene(); scene.add(object);
    const decor = { entries: [rec], cfg: { freeBuild: false }, lot: { x0: 0, z0: 0, cols: 22, rows: 15 } };
    const town = { scene, decors: { house: decor }, decor, zone: 'house', pos: new THREE.Vector3(5, 0, 6),
      active: true, camMode: 'play', photoOn: false, modal: null, rects: [], circles: [], face() {}, act() {},
      allInter() { return []; }, updatePlayer() {}, onExit() {}, renderOptimizer: { invalidateDecor() { invalidations++; } } };
    app.view = town;
    const actions = get('js/live/home-interactions.js').installHomeInteractions({ town, busy: false }, { toast() {} });
    assert.equal(actions.activate(rec), true); assert.equal(placement.photo, 'meadow');
    equal(themeColors(object, placement.photo), ['#ffe5b4', '#e8a87c', '#ff7f50']);
    assert.equal(actions.activate(rec), true); assert.equal(placement.photo, 'sunset');
    assert.equal(state.S.decor.photo_frame, 3); assert.equal(placement.gx, 5); assert.equal(placement.gz, 5); assert.equal(invalidations, 2);
    actions.dispose(); stable(); assert.equal(state.S.placedIn[0].photo, 'sunset');
  });

  await test('新周常以实际累计值建基线，本周真实统计推进后只领取一次，重载保持', () => {
    fresh(); state.S.stats.plays = 100; state.S.stats.harvested = 200; state.S.stats.fish_caught = 40;
    const market = live.market(); equal(market.orders.map(order => order.stat), ['plays', 'harvested', 'fish_caught']);
    equal(market.orders.map(order => order.cur), [0, 0, 0]);
    state.stat('plays', 5); state.stat('harvested', 8); state.stat('fish_caught', 4);
    assert.ok(live.market().orders.every(order => order.done));
    const before = state.S.coins;
    for (const id of ['mk_work', 'mk_harvest', 'mk_fish']) assert.ok(live.claimMarket(id));
    assert.equal(state.S.coins, before + 260 + 240 + 220);
    stable(); const after = JSON.stringify(state.serializeState());
    for (const id of ['mk_work', 'mk_harvest', 'mk_fish']) assert.equal(live.claimMarket(id), null);
    assert.equal(JSON.stringify(state.serializeState()), after);
  });

  await test('历史错键周常保留已证实进度和claimed，不把玩家全部历史计数变成本周奖励', () => {
    const d = fresh(); live.market(); d.live.market = clone(state.S.live.market);
    Object.assign(d.stats, { plays: 1000, harvested: 2000, fish_caught: 10, games: 7, harvest: 9 });
    Object.assign(d.live.market.orders[0], { stat: 'games', base: 5, claimed: false });
    Object.assign(d.live.market.orders[1], { stat: 'harvest', base: 6, cur: 4, claimed: true });
    Object.assign(d.live.market.orders[2], { base: 8, claimed: false });
    state.replaceSaveData(d); const migrated = clone(state.S.live.market);
    equal(live.market().orders.map(order => order.cur), [2, 4, 2]);
    equal(migrated.orders.map(order => order.base), [1000, 2000, 8]);
    assert.equal(live.claimMarket('mk_work'), null); assert.equal(live.claimMarket('mk_harvest'), null);
    equal(state.normalizeSaveData(state.serializeState()).live.market, migrated);
    state.stat('plays', 3); assert.ok(live.claimMarket('mk_work'));
    stable(); assert.equal(live.claimMarket('mk_work'), null); assert.equal(live.claimMarket('mk_harvest'), null);
    // 正常未记下任何正确基线的历史订单只从已知起点继续，不臆造一周的总进度。
    const old = fresh(); live.market(); old.live.market = clone(state.S.live.market);
    old.stats.plays = 999; Object.assign(old.live.market.orders[0], { stat: 'games', base: 0 });
    state.replaceSaveData(old); assert.equal(live.market().orders[0].cur, 0);
    state.stat('plays', 5); assert.equal(live.market().orders[0].cur, 5);
  });

  await test('正确周常基线/已领取原样保留，坏基线不能经别名迁移洗成有效输入', () => {
    const d = fresh(); live.market(); d.live.market = clone(state.S.live.market);
    d.stats.plays = 10; Object.assign(d.live.market.orders[0], { base: 6, claimed: true });
    state.replaceSaveData(d); equal(state.S.live.market, d.live.market); assert.equal(live.market().orders[0].cur, 4);
    for (const value of [-1, 1.5, '0', null]) {
      const bad = clone(d); Object.assign(bad.live.market.orders[0], { stat: 'games', base: value });
      assert.throws(() => state.normalizeSaveData(bad));
    }
  });

  await test('真实账号模块读取历史云档与本地迁移结果一致，重载不误报冲突且新进度正常上传', async () => {
    const d = fresh(); d.started = true; d.seeds.fertilizer = 3; d.stats.fertilizer = 4;
    d.placedIn = [{ id: 'photo_frame', gx: 5, gz: 5, rot: 0, photo: 'sakura' }];
    d.live.welcome = { date: '2026-10-17', claimed: true, coins: 80, seedId: 'wheat' };
    cloud.data = clone(d); cloud.revision = 7; cloud.writes = 0;
    storage.set(key, JSON.stringify(d)); assert.equal(state.load(), true);
    const account = get('js/core/account.js').account;
    const first = await account.login('Compat QA', 'synthetic-password');
    assert.equal(first.kind, 'same'); assert.equal(cloud.writes, 0); assert.equal(compat.fertilizerCount(state.S), 7);
    assert.equal(state.flushSave(), true); assert.equal(state.load(), true);
    const unchanged = await account.prepareSync(); assert.equal(unchanged.kind, 'same'); assert.equal(cloud.writes, 0);
    assert.equal(live.claimWelcome(), null);
    state.S.coins += 9; const next = await account.prepareSync(); assert.notEqual(next.kind, 'conflict');
    assert.equal(cloud.writes, 1); assert.equal(cloud.data.coins, d.coins + 9); assert.equal(cloud.data.stats.fertilizer, 7);
    assert.equal(Object.hasOwn(cloud.data.seeds, 'fertilizer'), false); assert.equal(cloud.data.placedIn[0].photo, 'sakura');
    assert.equal(state.load(), true); assert.equal((await account.prepareSync()).kind, 'same'); assert.equal(cloud.writes, 1);
    assert.ok(state.getCloudSaveBase()?.hash);
  });

  const report = { pass: true, checks: checks.length, names: checks, timestamp: new Date().toISOString(),
    scope: 'Actual game modules, in-memory save/localStorage, actual Three meshes; renderer/audio/UI host boundaries replaced; no server/network/player data.',
    historicalWeeklyLimit: 'Legacy aliases did not save canonical counters at order creation. Preserve recorded deltas and claimed flags; future actions continue from a safe canonical baseline. Missing historical interval is not invented.' };
  const outIndex = process.argv.indexOf('--out');
  if (outIndex >= 0) {
    const out = path.resolve(process.argv[outIndex + 1]); fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
  }
  console.log(JSON.stringify({ pass: report.pass, checks: report.checks, isolation: 'memory only', actualThreeModels: true }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
