// Real modules, disposable in-memory browser storage. Never accesses a player's save or API.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const run = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), clone = value => JSON.parse(JSON.stringify(value));
const baseKey = 'nikki-block-town-save-v1', suffix = ':local-free-play-v1', checks = [];
const out = path.resolve(process.env.LOCAL_PLAY_QA_OUT || path.join(root, 'output/local-play-isolation-20261015'));
async function env({ url = 'http://localhost:5173/', store = new Map(), globals = {}, fetchResult } = {}) {
  const location = new URL(url), modules = new Map(), writes = [], requests = [], timers = new Set();
  const context = vm.createContext({ console, Date, TextEncoder, URLSearchParams, URL, performance, Headers,
    location, crypto: require('crypto').webcrypto, ...globals,
    setTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
    clearTimeout(id) { clearTimeout(id); timers.delete(id); },
    localStorage: { getItem: key => store.get(key) ?? null, setItem(key, value) { writes.push(['set', key]); store.set(key, String(value)); }, removeItem(key) { writes.push(['remove', key]); store.delete(key); } },
    fetch: async (url, options) => { requests.push({ url, method: options?.method || 'GET' }); return fetchResult ? fetchResult(url, options) : { ok: false, status: 401, json: async () => ({ error: 'test unauthorized' }) }; },
  });
  function at(file) { if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file })); return modules.get(file); }
  // A synthetic entry links both through the same cache, preserving the live S binding.
  const entry = new vm.SourceTextModule("import * as st from './js/core/state.js'; import {account} from './js/core/account.js'; import * as mode from './js/core/local-play-mode.js'; import * as data from './js/data.js'; export { st, account, mode, data };", { context, identifier: path.join(root, '__qa_entry__.js') });
  await entry.link((name, from) => at(path.resolve(path.dirname(from.identifier), name))); await entry.evaluate();
  return { ...entry.namespace, store, writes, requests, context, dispose() { for (const id of timers) clearTimeout(id); timers.clear(); } };
}
async function check(name, fn) { try { const detail = await fn(); checks.push({ name, pass: true, detail }); console.log('PASS ' + name); } catch (error) { checks.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); } }
(async () => {
  const modes = await env();
  await check('模式条件：15 种开发、slot、强制开关、原生及生产组合', () => {
    const cases = [
      ['http://localhost:5173/', {}, true], ['http://127.0.0.1:5173/', {}, true], ['http://[::1]:5173/', {}, true],
      ['https://localhost:5173/', {}, true], ['http://localhost:5173/?slot=qa', {}, false],
      ['http://localhost:5173/?slot=', {}, false], ['http://localhost:5173/?sandbox=0', {}, false],
      ['http://localhost:5173/?slot=qa&sandbox=1', {}, true], ['http://localhost:3000/?sandbox=1', {}, false],
      ['https://nikkitown.eu.cc/?sandbox=1', {}, false], ['https://nikkitown.eu.cc:5173/?sandbox=1', {}, false],
      ['http://192.168.1.2:5173/?sandbox=1', {}, false], ['app://game/index.html?sandbox=1', {}, false],
      ['http://localhost:5173/?sandbox=1', { NikkiNative: {} }, false],
      ['http://localhost:5173/?sandbox=1', { Capacitor: { isNativePlatform: () => true } }, false],
    ];
    for (const [url, host, expected] of cases) assert.equal(modes.mode.localPlayEnabled({ location: new URL(url), ...host }), expected, url);
    return { cases: cases.length };
  });
  modes.dispose();
  const normalSeed = await env({ url: 'http://localhost:5173/?sandbox=0' });
  const original = clone(normalSeed.st.S);
  original.started = true; original.coins = 1234; original.gday = 77; original.crops = { radish: 3 };
  original.decor = { bench: 2 }; original.placed.push({ id: 'bench', gx: 0, gz: 0, rot: 0 });
  const cloudBase = { schema: 1, scope: 'normal', revision: 19, hash: 'a'.repeat(64) };
  const originalRaw = JSON.stringify({ ...original, __nikkiCloudBaseV1: cloudBase });
  const store = new Map([[baseKey, originalRaw], [baseKey + ':bak', originalRaw], [baseKey + ':before-import', 'untouched recovery'], ['nikki-town-account-v1', JSON.stringify({ id: 'real-user', username: 'normal-user' })], ['nikki-town-before-account-sync', 'normal cloud recovery']]);
  normalSeed.dispose();
  let local = await env({ store });
  await check('首次复制原档只写试玩主键，保留穿搭建筑并清除云基线', () => {
    assert.equal(local.st.load(), true); assert.equal(local.st.flushSave(), true);
    assert.equal(store.get(baseKey), originalRaw); assert.equal(local.st.S.gday, 77);
    assert.deepEqual(clone(local.st.S.outfit), original.outfit); assert.deepEqual(clone(local.st.S.placed), original.placed);
    assert.equal(local.st.getCloudSaveBase(), null); assert.equal(JSON.parse(store.get(baseKey + suffix)).__nikkiCloudBaseV1, undefined);
    assert(local.writes.every(([, key]) => key === baseKey + suffix));
    return { originalBytes: originalRaw.length, writes: local.writes };
  });
  await check('新旧试玩档均解锁，免费消费不扣钱，真实序列化校验通过', () => {
    const s = local.st.S, d = local.data;
    assert.equal(s.house, d.HOUSES.length); assert.equal(s.yardLv, d.YARDS.length);
    assert(d.CLOTHES.every(c => s.owned.includes(c.id))); assert.equal(s.buildQuest.stage, 3); assert.equal(s.buildQuest.rewarded, true);
    assert(Object.values(s.shops).every(shop => shop.lv === d.SHOP_MAX_LV && shop.stage === d.MAX_STAGE - 1));
    const coins = s.coins; assert.equal(local.st.spend(coins + 5000), true); assert.equal(s.coins, coins);
    assert.doesNotThrow(() => local.st.serializeState()); assert.equal(s.cheat, true);
  });
  await check('试玩刷新继续独立进度，不重新复制正常档', async () => {
    local.st.S.gday = 88; local.st.flushSave(); local.dispose(); local = await env({ store });
    assert(local.st.load()); assert.equal(local.st.S.gday, 88); local.st.flushSave(); assert.equal(store.get(baseKey), originalRaw);
  });
  await check('自动备份与恢复只使用试玩备份，正常备份字节不变', () => {
    local.st.S.gday = 99; assert(local.st.autosave()); local.st.S.gday = 100; local.st.flushSave();
    assert(local.st.restoreBackup()); assert.equal(local.st.S.gday, 99); local.st.flushSave();
    assert.equal(store.get(baseKey + ':bak'), originalRaw); assert.equal(store.get(baseKey), originalRaw);
  });
  await check('导出导入与导入前恢复点全程隔离正常档', () => {
    const imported = clone(original); imported.gday = 121;
    const result = local.st.importSaveFile(JSON.stringify(imported)); assert(result.ok, result.error); assert.equal(local.st.S.gday, 121);
    assert.equal(local.st.importRecoveryInfo().gday, 99); assert.equal(store.get(baseKey + ':before-import'), 'untouched recovery');
    assert(local.st.restoreBeforeImport().ok); assert.equal(local.st.S.gday, 99);
    assert.doesNotThrow(() => JSON.parse(local.st.exportSaveFile().text)); assert.equal(store.get(baseKey), originalRaw);
  });
  await check('全部账号与邮件入口在试玩模式零网络请求，缓存和云恢复点不变', async () => {
    const before = store.get('nikki-town-account-v1'), baseBefore = store.get('nikki-town-before-account-sync');
    assert.equal(local.account.profile, null); assert.equal(await local.account.restore(), null);
    const methods = [() => local.account.login('x', 'y'), () => local.account.register('x', 'y'), () => local.account.accessPolicy(), () => local.account.refreshEntitlements(),
      () => local.account.prepareSync(), () => local.account.syncNow(), () => local.account.resolveSync('local'), () => local.account.mailSummary(), () => local.account.mailList(),
      () => local.account.mailRead('x'), () => local.account.mailClaim('x'), () => local.account.mailClaimAll(), () => local.account.logout()];
    const results = await Promise.allSettled(methods.map(f => f()));
    assert.equal(local.requests.length, 0); assert.equal(store.get('nikki-town-account-v1'), before); assert.equal(store.get('nikki-town-before-account-sync'), baseBefore);
    assert.equal(store.get(baseKey), originalRaw); return { paths: methods.length, requests: local.requests.length, rejected: results.filter(r => r.status === 'rejected').length };
  });
  await check('重置试玩后刷新仍是新试玩档，不复活原档进度', async () => {
    local.st.resetSave(); assert.equal(local.st.S.gday, 0); assert(store.has(baseKey + suffix));
    local.dispose(); local = await env({ store }); assert(local.st.load()); assert.equal(local.st.S.gday, 0);
    assert.equal(local.st.S.buildQuest.stage, 3); assert.equal(local.st.S.house, local.data.HOUSES.length); assert.equal(store.get(baseKey), originalRaw);
  });
  await check('带 slot 的显式试玩使用该 slot 独立键，不接触默认和普通 slot', async () => {
    const slotKey = baseKey + ':fixture'; store.set(slotKey, originalRaw); const mainFree = store.get(baseKey + suffix);
    const separate = await env({ url: 'http://localhost:5173/?slot=fixture&sandbox=1', store });
    assert(separate.st.load()); separate.st.S.gday = 222; separate.st.flushSave();
    assert.equal(JSON.parse(store.get(slotKey + suffix)).gday, 222); assert.equal(store.get(slotKey), originalRaw); assert.equal(store.get(baseKey + suffix), mainFree);
    separate.dispose();
  });
  await check('普通本地 slot 保持受限新档、实际消费与原有账号恢复网络路径', async () => {
    const normal = await env({ url: 'http://localhost:5173/?slot=normal-qa', store });
    assert.equal(normal.mode.LOCAL_PLAY, false); assert.equal(normal.st.S.coins, 200); assert.equal(normal.st.S.house, 1); assert.equal(normal.st.S.buildQuest.stage, 0);
    assert(normal.st.spend(100)); assert.equal(normal.st.S.coins, 100); assert.equal(normal.st.spend(101), false); normal.st.flushSave();
    assert(store.has(baseKey + ':normal-qa')); assert(!store.has(baseKey + ':normal-qa' + suffix));
    assert.equal(normal.account.profile.id, 'real-user'); await normal.account.restore(); assert.equal(normal.requests[0].url, '/api/auth/me');
    // The mocked normal API deliberately returns 401 and logs out only the normal profile; restore for the remaining isolation assertion.
    store.set('nikki-town-account-v1', JSON.stringify({ id: 'real-user', username: 'normal-user' })); normal.dispose();
  });
  await check('退出试玩到 sandbox=0 读取原始金币、建筑、云基线；原档没有解锁污染', async () => {
    const normal = await env({ url: 'http://localhost:5173/?sandbox=0', store }); assert(normal.st.load());
    assert.equal(normal.st.S.coins, 1234); assert.equal(normal.st.S.gday, 77); assert.equal(normal.st.S.house, original.house);
    assert.deepEqual(clone(normal.st.getCloudSaveBase()), cloudBase); assert.deepEqual(clone(normal.st.S.owned), original.owned);
    normal.dispose(); assert.equal(store.get(baseKey), originalRaw);
  });
  await check('生产网址即使 sandbox=1 也不解锁、不换存档键', async () => {
    const prodStore = new Map([[baseKey, originalRaw]]), prod = await env({ url: 'https://nikkitown.eu.cc/?sandbox=1', store: prodStore });
    assert.equal(prod.mode.LOCAL_PLAY, false); assert(prod.st.load()); assert.equal(prod.st.S.coins, 1234); assert.equal(prod.st.S.house, original.house);
    prod.st.flushSave(); assert(!prodStore.has(baseKey + suffix)); prod.dispose();
  });
  local.dispose();
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ name: 'local_play_isolation_checks', checks, pass: checks.every(x => x.pass), source: 'Actual source modules in isolated VM storage; no browser/player/device/production writes.' }, null, 2));
  console.log(`${checks.filter(x => x.pass).length}/${checks.length} checks; report ${out}`); if (checks.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
