// 本机诊断隔离回归：仅运行真实诊断模块，存储/网络为禁止调用的哨兵。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const child = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const SECRET = 'QA_PRIVATE_SENTINEL_account_token_save_body_473829';
const SECRET_URL = 'https://qa-private.example.invalid/' + SECRET;
const stages = ['tweens', 'effects', 'view', 'hooks', 'render'];

class EventHub {
  constructor() { this.listeners = new Map(); }
  on(name, fn) { this.addEventListener(name, fn); return () => this.removeEventListener(name, fn); }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, event = {}) { for (const fn of [...(this.listeners.get(name) || [])]) fn(event); }
  count(name) { return name ? this.listeners.get(name)?.size || 0 : [...this.listeners.values()].reduce((n, values) => n + values.size, 0); }
}

async function load() {
  const clock = { now: new Date('2026-10-16T12:00:00.000Z').getTime() };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const calls = [], timers = new Map(), globalEvents = new EventHub(), documentEvents = new EventHub(), bus = new EventHub();
  let nextTimer = 0;
  const forbidden = name => (..._args) => { calls.push(name); throw new Error('Unexpected side effect: ' + name); };
  const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem', 'clear'].map(name => [name, forbidden('storage.' + name)]));
  const metadata = new Map([['nuannuan-version', '2.1.14'], ['nuannuan-build', 'web'], ['nuannuan-build-id', '123456abcdef']]);
  const document = {
    hidden: false,
    querySelector: selector => ({ content: metadata.get(selector.match(/name="([^"]+)"/)?.[1]) }),
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  };
  const context = vm.createContext({ console, Date: ClockDate, TextEncoder, document,
    localStorage: storage, sessionStorage: storage,
    fetch: forbidden('fetch'), XMLHttpRequest: forbidden('XMLHttpRequest'), WebSocket: forbidden('WebSocket'),
    navigator: { sendBeacon: forbidden('sendBeacon') }, indexedDB: { open: forbidden('indexedDB.open') },
    addEventListener: globalEvents.addEventListener.bind(globalEvents), removeEventListener: globalEvents.removeEventListener.bind(globalEvents),
    setTimeout: (fn, delay) => { timers.set(++nextTimer, { fn, delay, due: clock.now + delay }); return nextTimer; },
    clearTimeout: id => timers.delete(id), setInterval: forbidden('setInterval'), clearInterval: forbidden('clearInterval'),
  });
  // es2020 打包不提供内建API补丁：覆盖仍缺 Object.hasOwn 的旧 WebView。
  vm.runInContext('Object.hasOwn = undefined', context);
  const modules = new Map();
  function at(file) {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  }
  const module = at(path.join(root, 'js/devtools/install.js'));
  await module.link((specifier, from) => at(path.resolve(path.dirname(from.identifier), specifier)));
  await module.evaluate();
  const diagnostics = modules.get(path.join(root, 'js/devtools/diagnostics.js')).namespace.diagnostics;
  const app = { fpsCap: 60, capNow: 60, view: { id: 'town', zone: 'home', dynFps: true, isActive: forbidden('view.isActive') }, width: 800, height: 600,
    desiredCap: forbidden('app.desiredCap'),
    canvas: { width: 1200, height: 900 }, pixelRatio: 1.5, quality: 'mid', perf: { dynFps: true },
    renderer: { info: { render: { calls: 14, triangles: 220 }, memory: { geometries: 7, textures: 3 } } } };
  const ui = { modals: 0 }, account = { diagnosticsInfo: { status: 'signed-out', revision: 0, conflict: false, pending: false },
    token: SECRET, email: SECRET, sync: forbidden('account.sync'), save: forbidden('account.save') };
  const savedState = { mode: 'normal', slot: 'default', pending: false, rawSave: SECRET };
  const install = extra => module.namespace.installDiagnostics({ app, ui, bus, account, saveInfo: () => savedState, localPlay: false, ...extra });
  const advance = milliseconds => {
    const end = clock.now + milliseconds;
    while (true) {
      const pending = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!pending) break;
      const [id, timer] = pending; timers.delete(id); clock.now = timer.due; timer.fn();
    }
    clock.now = end;
  };
  const clean = () => {
    diagnostics.stop();
    assert.equal(timers.size, 0, 'no pending diagnosis timer');
    assert.equal(globalEvents.count(), 0, 'all window listeners removed');
    assert.equal(documentEvents.count(), 0, 'all document listeners removed');
    assert.equal(bus.count(), 0, 'all game subscriptions removed');
    same(calls, [], 'no storage, save, or network calls');
  };
  return { diagnostics, install, app, ui, account, savedState, context, metadata, globalEvents, documentEvents, document,
    bus, calls, timers, advance, clean };
}

function unsampled(snapshot) {
  for (const key of ['fps', 'frameP95Ms', 'cpuP95Ms', 'slowFrames', 'drawCalls', 'triangles', 'geometries', 'textures', 'targetFps', 'activeFrameLimit']) {
    assert.equal(snapshot.performance[key], null, key + ' remains null before observation');
  }
  for (const name of stages) same(snapshot.performance.modules[name], { averageMs: null, p95Ms: null, maxMs: null, samples: 0 });
  assert.equal(snapshot.save.bytes, null); assert.equal(snapshot.save.lastSavedAt, null);
  assert.equal(snapshot.sync.lastSyncAt, null);
}

async function main() {
  let passed = 0, failed = 0;
  async function test(name, run) {
    const h = await load();
    try { await run(h); h.clean(); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); try { h.clean(); } catch (cleanupError) { console.error(cleanupError.message); } }
  }
  await test('默认关闭，安装不订阅，未开启的采样钩子不读业务对象且没有存储/网络调用', h => {
    const { diagnostics: d } = h;
    assert.equal(d.active, false); unsampled(d.snapshot()); h.install();
    assert.equal(d.active, false); assert.equal(h.timers.size, 0); assert.equal(h.globalEvents.count(), 0); assert.equal(h.documentEvents.count(), 0); assert.equal(h.bus.count(), 0);
    const forbiddenObject = new Proxy({}, { get() { throw new Error('Disabled hook read business object'); } });
    d.event('played', forbiddenObject); d.error(forbiddenObject); d.stage('view', 2); d.sampleFrame(.02, 2, forbiddenObject);
    d.saved('saved', forbiddenObject); d.synced(forbiddenObject); d.mark();
    unsampled(d.report()); same(d.report().events, []); same(d.report().errors, []); assert.equal(d.stop(), null);
  });
  await test('start/stop、重复start与自动结束均释放全部监听器和计时器', h => {
    h.install(); const d = h.diagnostics;
    for (let i = 0; i < 5; i++) {
      d.start(180); assert.equal(d.active, true); assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].delay, 180000);
      assert.equal(h.globalEvents.count(), 3); assert.equal(h.documentEvents.count(), 1); assert.equal(h.bus.count(), 7);
      assert.equal(h.globalEvents.count('error'), 1); assert.equal(h.globalEvents.count('unhandledrejection'), 1); assert.equal(h.globalEvents.count('nuannuan:sync'), 1);
      same(d.snapshot().events.map(e => e.type), ['start']);
    }
    h.advance(179999); assert.equal(d.active, true); h.advance(1); assert.equal(d.active, false);
    assert.equal(h.timers.size, 0); assert.equal(h.globalEvents.count(), 0); assert.equal(h.documentEvents.count(), 0); assert.equal(h.bus.count(), 0);
    const stopped = d.stop(); assert.equal(stopped.recording, false); assert.equal(stopped.remainingSeconds, 0); assert.ok(stopped.finishedAt);
    same(stopped.events.map(e => e.type), ['start', 'stop']); same(d.stop(), stopped);
    d.start(300); assert.equal([...h.timers.values()][0].delay, 300000); d.stop();
    d.start(12345); assert.equal([...h.timers.values()][0].delay, 60000);
  });
  await test('实际每日/区域等总线事件被映射，业务载荷不进入报告，停止后不再观察', h => {
    h.install(); const d = h.diagnostics; d.start();
    const payload = { token: SECRET, save: SECRET, url: SECRET_URL, profile: { email: SECRET } };
    for (const name of ['played', 'stateReplaced', 'reset', 'zoneChanged', 'liveDaily', 'decorChanged', 'questDone']) h.bus.emit(name, payload);
    same(d.report().events.map(e => e.type), ['start', 'played', 'stateReplaced', 'reset', 'zone', 'daily', 'decorChanged', 'questDone']);
    h.document.hidden = true; h.documentEvents.emit('visibilitychange', payload);
    h.document.hidden = false; h.documentEvents.emit('visibilitychange', payload);
    h.globalEvents.emit('nuannuan:sync', { detail: { state: 'conflict', ...payload } });
    assert.equal(d.report().sync.status, 'conflict'); assert.equal(d.report().sync.lastSyncAt, null);
    h.globalEvents.emit('nuannuan:sync', { detail: { state: 'saved', ...payload } });
    assert.equal(d.report().sync.status, 'saved'); assert.ok(d.report().sync.lastSyncAt);
    assert.ok(!JSON.stringify(d.report()).includes(SECRET)); assert.ok(!JSON.stringify(d.report()).includes(SECRET_URL));
    const stopped = clone(d.stop()); h.bus.emit('played', payload); h.globalEvents.emit('nuannuan:sync', { detail: { state: 'error' } });
    same(d.snapshot(), stopped);
  });
  await test('错误名只留白名单，错误文本/堆栈/地址/拒绝载荷和对象事件名的敏感哨兵均不泄漏', h => {
    h.install(); const d = h.diagnostics; d.start();
    h.globalEvents.emit('error', { error: { name: 'TypeError', message: SECRET, stack: SECRET_URL }, filename: SECRET_URL, message: SECRET });
    h.globalEvents.emit('unhandledrejection', { reason: { name: SECRET, message: SECRET, token: SECRET } });
    h.globalEvents.emit('unhandledrejection', { reason: SECRET_URL });
    d.error(SECRET); d.error({ name: 'RangeError', token: SECRET, toString: () => 'RangeError' });
    d.event('played', { token: SECRET });
    d.event({ toString: () => 'played', token: SECRET });
    d.event(SECRET); d.event('__proto__'); d.event('constructor');
    const report = d.report();
    assert.ok(!JSON.stringify(report).includes(SECRET), 'private sentinel must not appear in report');
    assert.ok(!JSON.stringify(report).includes(SECRET_URL));
    same(report.errors.map(e => e.type), ['TypeError', 'Error', 'UnhandledRejection', 'Error', 'Error']);
    same(report.events.map(e => e.type), ['start', 'played']);
  });
  await test('白名单摘要排除账号与存档正文，非法枚举和非有限数值均显示未采样', h => {
    const d = h.diagnostics;
    d.configure({ overview: () => ({ version: SECRET, build: SECRET_URL, platform: SECRET, scene: SECRET, zone: SECRET, viewport: [Infinity, NaN],
      renderPixels: [800, 600], pixelRatio: Infinity, quality: SECRET, frameReason: SECRET, modalOpen: SECRET, hidden: SECRET, token: SECRET }),
    save: () => ({ mode: SECRET, slot: SECRET, pending: SECRET, text: SECRET }),
    sync: () => ({ status: SECRET, revision: NaN, pending: SECRET, conflict: SECRET, account: SECRET, token: SECRET }) });
    d.start(); const report = d.report();
    for (const key of ['version', 'build', 'platform', 'scene', 'zone', 'pixelRatio', 'quality', 'frameReason', 'modalOpen', 'hidden']) assert.equal(report.overview[key], null, key);
    same(report.overview.viewport, [null, null]); same(report.overview.renderPixels, [800, 600]);
    assert.equal(report.save.mode, null); assert.equal(report.save.slot, null); assert.equal(report.save.pending, null);
    for (const key of ['status', 'revision', 'pending', 'lastSyncAt', 'conflict']) assert.equal(report.sync[key], null, key);
    assert.ok(!JSON.stringify(report).includes(SECRET));
  });
  await test('报告与snapshot深拷贝，修改当前或已结束的返回数据不改变记录和业务对象', h => {
    h.install(); const d = h.diagnostics; d.start(); d.event('played'); d.error('TypeError'); d.stage('view', 3); d.sampleFrame(.02, 4, h.app);
    const initial = clone(d.report()), beforeApp = clone(h.app), report = d.report();
    report.events[0].type = SECRET; report.errors[0].message = SECRET; report.overview.viewport[0] = -1;
    report.performance.modules.view.averageMs = -1; report.save.status = SECRET; report.sync.status = SECRET;
    same(d.report(), initial); same(h.app, beforeApp);
    const live = d.snapshot(); live.events.splice(0); live.overview.renderPixels[0] = -1; same(d.report(), initial);
    const stopped = d.stop(), stable = clone(stopped); stopped.events[0].type = SECRET; stopped.performance.modules.view.samples = -1;
    same(d.snapshot(), stable); const old = d.report(); old.events[0].type = SECRET; same(d.snapshot(), stable);
    d.start(); unsampled(d.snapshot()); same(d.snapshot().events.map(e => e.type), ['start']);
  });
  await test('事件/错误最多180条，阶段/帧统计最多3600样本且旧样本被淘汰', h => {
    h.install(); const d = h.diagnostics; d.start();
    for (let i = 0; i < 200; i++) { d.mark(); d.error('TypeError'); }
    assert.equal(d.report().events.length, 180); assert.equal(d.report().errors.length, 180);
    assert.ok(d.report().events.every(e => e.type === 'mark'));
    d.sampleFrame(10, 9999, h.app); for (const name of stages) d.stage(name, 9999);
    for (let i = 0; i < 3600; i++) { d.sampleFrame(.02, 2, h.app); stages.forEach((name, index) => d.stage(name, index + 1)); }
    const perf = d.report().performance;
    assert.equal(perf.fps, 50); assert.equal(perf.frameP95Ms, 20); assert.equal(perf.cpuP95Ms, 2); assert.equal(perf.slowFrames, 1);
    stages.forEach((name, index) => same(perf.modules[name], { averageMs: index + 1, p95Ms: index + 1, maxMs: index + 1, samples: 3600 }));
    d.stop(); assert.equal(d.report().events.length, 180); assert.equal(d.report().errors.length, 180);
  });
  await test('未采样值为null，合法零值被保留，无效时间不会污染帧/阶段统计', h => {
    h.install(); const d = h.diagnostics; d.start(); unsampled(d.snapshot());
    for (const value of [-1, NaN, Infinity, undefined, '2']) d.stage('view', value);
    d.stage(SECRET, 1);
    for (const value of [0, -1, NaN, Infinity, undefined, '2']) d.sampleFrame(value, 1, h.app);
    for (const value of [-1, NaN, Infinity, undefined, '2']) d.sampleFrame(.02, value, h.app);
    unsampled(d.snapshot());
    d.stage('view', 0); d.sampleFrame(.02, 0, { fpsCap: 0, capNow: 0, renderer: { info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } } } });
    const p = d.report().performance;
    for (const name of ['cpuP95Ms', 'slowFrames', 'drawCalls', 'triangles', 'geometries', 'textures', 'targetFps', 'activeFrameLimit']) assert.equal(p[name], 0, name);
    same(p.modules.view, { averageMs: 0, p95Ms: 0, maxMs: 0, samples: 1 });
  });
  await test('帧率策略先判断后台和动态限帧开关，不调用desiredCap或场景isActive', h => {
    h.install(); const d = h.diagnostics;
    h.ui.modals = 1; h.app.capNow = 20;
    for (const owner of [h.app.perf, h.app.view]) {
      owner.dynFps = false;
      assert.equal(d.snapshot().overview.frameReason, 'fixed', 'disabled dynamic cap takes priority over menu/idle');
      h.document.hidden = true;
      assert.equal(d.snapshot().overview.frameReason, 'background', 'background takes priority over fixed');
      h.document.hidden = false; owner.dynFps = true;
      assert.equal(d.snapshot().overview.frameReason, 'menu');
    }
    h.ui.modals = 0; assert.equal(d.snapshot().overview.frameReason, 'idle');
    h.app.capNow = 60; assert.equal(d.snapshot().overview.frameReason, 'active');
    same(h.calls, [], 'frame reason only reads existing state');
  });
  await test('保存仅观察UTF-8字节数与状态，安装读数准确且三端/菜单/离线标识可判定', h => {
    h.install(); const d = h.diagnostics;
    const first = d.snapshot(); same(first.overview.viewport, [800, 600]); assert.equal(first.overview.version, '2.1.14'); assert.equal(first.overview.quality, 'mid');
    assert.equal(first.overview.build, 'web-123456abcdef'); assert.equal(first.overview.platform, 'web'); assert.equal(first.overview.frameReason, 'active');
    h.context.NikkiDesktop = {}; assert.equal(d.snapshot().overview.platform, 'windows');
    h.context.NikkiNative = {}; assert.equal(d.snapshot().overview.platform, 'android');
    h.ui.modals = 1; assert.equal(d.snapshot().overview.frameReason, 'menu'); h.ui.modals = 0;
    h.app.capNow = 20; assert.equal(d.snapshot().overview.frameReason, 'idle'); h.document.hidden = true; assert.equal(d.snapshot().overview.frameReason, 'background');
    h.install({ localPlay: true }); assert.equal(d.snapshot().sync.status, 'local-only');
    d.start(); const body = JSON.stringify({ name: '小星灵', token: SECRET, url: SECRET_URL }); d.saved('saved', body);
    assert.equal(d.report().save.bytes, Buffer.byteLength(body, 'utf8')); assert.equal(d.report().save.status, 'saved'); assert.ok(d.report().save.lastSavedAt);
    d.saved('deferred', SECRET); assert.equal(d.report().save.status, 'deferred');
    d.saved('error', SECRET); assert.equal(d.report().save.status, 'error');
    d.saved(SECRET, body); assert.equal(d.report().save.status, 'error');
    assert.ok(!JSON.stringify(d.report()).includes(SECRET));
  });
  await test('摘要读取/订阅异常不影响游戏流程且能停止并清理基础监听', h => {
    const d = h.diagnostics;
    d.configure({ overview: () => { throw new Error(SECRET); }, save: () => { throw new Error(SECRET); },
      sync: () => { throw new Error(SECRET); }, subscribe: () => { throw new Error(SECRET); } });
    d.start(); assert.equal(d.active, true); assert.equal(d.report().errors.length, 1); assert.ok(!JSON.stringify(d.report()).includes(SECRET));
    d.stop(); assert.equal(d.active, false);
    d.configure({ subscribe: () => () => { throw new Error(SECRET); } }); d.start(); d.stop(); assert.equal(d.active, false);
  });
  console.log(`Diagnostics isolated checks: ${passed} passed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
