// 固定时钟验证真实采样器；所有存储/网络 API 均为禁止调用的哨兵，不加载玩家资料。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const child = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), checks = [];
const plain = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => assert.deepEqual(plain(a), plain(b));
const SECRET = 'QA_PRIVATE_draw_scene_player_token_948127';
async function load() {
  let milliseconds = 0, nowCalls = 0;
  const effects = [], timers = new Map(), listeners = new Set();
  const forbidden = name => () => { effects.push(name); throw Error(name); };
  const context = vm.createContext({ console, TextEncoder, performance: { now() { nowCalls++; return milliseconds; } },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn),
    localStorage: { setItem: forbidden('localStorage') }, sessionStorage: { setItem: forbidden('sessionStorage') },
    fetch: forbidden('fetch'), XMLHttpRequest: forbidden('xhr'), WebSocket: forbidden('websocket'),
    navigator: { sendBeacon: forbidden('beacon') }, indexedDB: { open: forbidden('indexedDB') } });
  const modules = new Map();
  const at = file => { if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file })); return modules.get(file); };
  const mod = at(path.join(root, 'js/devtools/diagnostics.js'));
  await mod.link((specifier, from) => at(path.resolve(path.dirname(from.identifier), specifier))); await mod.evaluate();
  const d = mod.namespace.diagnostics, sampler = modules.get(path.join(root, 'js/devtools/render-sampling.js')).namespace;
  return { d, sampler, context, effects, timers, advance: ms => milliseconds += ms, nowCalls: () => nowCalls,
    clean() { d.stop(); assert.equal(timers.size, 0); assert.equal(listeners.size, 0); same(effects, []); } };
}
function fixture(h, options = {}) {
  const entries = [], result = {}, light = { active: true }, scene = { lights: [light], secret: SECRET }, camera = { secret: SECRET };
  const renderer = {
    info: { render: { calls: 0 } },
    clear(...args) { entries.push(['clear', this === renderer, ...args]); return result; },
    render(s, c) {
      entries.push(['renderer', this === renderer, s === scene, c === camera]);
      this.shadowMap.render(s.lights || [], s, c); h.advance(4); this.info.render.calls += 10; return result;
    },
    shadowMap: { enabled: true, autoUpdate: false, needsUpdate: true,
      render(lights, s, c) {
        entries.push(['shadow', this === renderer.shadowMap, s === scene, c === camera]);
        // 与固定 Three r170 的入口 / 光源更新门控一致，clear 仅在实际更新时调用。
        if (!this.enabled || (!this.autoUpdate && !this.needsUpdate) || lights.length === 0) return;
        for (const light of lights) if (light.active) { renderer.clear(true, true, true); h.advance(3); renderer.info.render.calls += 2; }
        this.needsUpdate = false;
      } },
  };
  const optimizer = {
    buildDecor() { entries.push(['build', this === optimizer]); h.advance(.5); },
    render(draw) { entries.push(['prepare', this === optimizer]); h.advance(2); this.buildDecor(); const value = draw(); h.advance(1); return value; },
  };
  const app = { renderer, usePost: !!options.post }, view = { scene, ...options.noOptimizer ? {} : { renderOptimizer: optimizer } };
  const draw = () => renderer.render(scene, camera);
  const descriptors = () => [renderer, renderer.shadowMap, optimizer].map(o => Object.fromEntries(
    ['render', 'clear', 'buildDecor'].map(key => [key, Object.getOwnPropertyDescriptor(o, key)])));
  return { app, view, renderer, optimizer, scene, camera, entries, result, draw, descriptors };
}
async function test(name, run) {
  const h = await load();
  try { await run(h); h.clean(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); try { h.clean(); } catch {} }
}
async function main() {
  await test('默认关闭不读时钟、不安装包装，调用顺序/this/参数/返回均不变', h => {
    const f = fixture(h), before = f.descriptors();
    assert.equal(h.d.active, false); assert.equal(h.d.renderFrame(f.app, f.view, f.draw), f.result);
    assert.equal(h.nowCalls(), 0); assert.deepEqual(f.descriptors(), before);
    same(f.entries, [['prepare', true], ['build', true], ['renderer', true, true, true], ['shadow', true, true, true], ['clear', true, true, true, true]]);
    assert.equal(h.d.report().performance.draw.sampledFrames, 0);
  });
  await test('直接绘制各段时间/批次子段/阴影调用明确，属性描述符原样恢复', h => {
    const f = fixture(h), before = f.descriptors(), original = f.renderer.render;
    h.d.start(); assert.equal(f.renderer.render, original, 'start does not install wrappers');
    assert.equal(h.d.renderFrame(f.app, f.view, f.draw), f.result); assert.deepEqual(f.descriptors(), before);
    const p = h.d.report().performance.draw;
    assert.equal(p.schema, 'nuannuan-draw-cpu-v2'); assert.equal(p.completedFrames, 1); assert.equal(p.directFrames, 1);
    for (const [name, value] of Object.entries({ total: 10.5, scenePrepare: 3.5, batchBuild: .5, draw: 7, renderer: 7, shadow: 3, mainRenderer: 7, mainShadow: 3, mainScene: 4 })) assert.equal(p.timings[name].averageMs, value, name);
    assert.equal(p.timings.postprocessing.averageMs, null); assert.equal(p.post.bloom.samples, 0);
    for (const [name, value] of Object.entries({ rendererCalls: 1, batchBuilds: 1, shadowCalls: 1, shadowRefreshes: 1, shadowSkips: 0, shadowClears: 1, shadowDrawCalls: 2 })) assert.equal(p.counts[name].average, value, name);
    assert.equal(p.shadow.refreshed.frames, 1); assert.equal(p.shadow.skipped.frames, 0);
    h.d.stop(); assert.deepEqual(f.descriptors(), before);
  });
  await test('实际刷新与未刷新帧分组，禁用/无光源/光源未更新均为观测到的0', h => {
    const f = fixture(h); h.d.start();
    h.d.renderFrame(f.app, f.view, f.draw);
    h.d.renderFrame(f.app, f.view, f.draw);
    f.renderer.shadowMap.enabled = false; h.d.renderFrame(f.app, f.view, f.draw);
    f.renderer.shadowMap.enabled = true; f.renderer.shadowMap.needsUpdate = true; f.scene.lights = []; h.d.renderFrame(f.app, f.view, f.draw);
    f.scene.lights = [{ active: false }]; h.d.renderFrame(f.app, f.view, f.draw);
    const p = h.d.report().performance.draw;
    assert.equal(p.shadow.refreshed.frames, 1); assert.equal(p.shadow.skipped.frames, 4); assert.equal(p.shadow.unknown.frames, 0);
    assert.equal(p.shadow.refreshed.totalMs.averageMs, 10.5); assert.equal(p.shadow.skipped.totalMs.averageMs, 7.5);
    assert.equal(p.counts.shadowClears.average, .2); assert.equal(p.timings.shadow.averageMs, .6);
  });
  await test('多个阴影clear按次数，未知/不可包装接口不虚报0；继承方法恢复后不残留own属性', h => {
    const f = fixture(h, { noOptimizer: true }); f.scene.lights.push({ active: true });
    const render = f.renderer.render; delete f.renderer.render; Object.setPrototypeOf(f.renderer, { render });
    h.d.start(); h.d.renderFrame(f.app, f.view, f.draw); assert.equal(Object.hasOwn(f.renderer, 'render'), false);
    let p = h.d.report().performance.draw; assert.equal(p.counts.shadowClears.average, 2); assert.equal(p.counts.shadowDrawCalls.average, 4);
    assert.equal(p.timings.scenePrepare.averageMs, null); assert.equal(p.timings.batchBuild.averageMs, null);
    h.d.start(); Object.defineProperty(f.renderer, 'clear', { value: f.renderer.clear, writable: false, configurable: false });
    h.d.renderFrame(f.app, f.view, f.draw); p = h.d.report().performance.draw;
    assert.equal(p.shadow.unknown.frames, 1); assert.equal(p.timings.shadow.averageMs, null); assert.equal(p.counts.shadowClears.average, null);
    h.d.start(); delete f.renderer.shadowMap; f.renderer.render = () => h.advance(2); h.d.renderFrame(f.app, f.view, f.draw);
    p = h.d.report().performance.draw; assert.equal(p.counts.shadowCalls.average, null); assert.equal(p.shadow.unknown.frames, 1);
  });
  await test('后处理按实例白名单分类，RenderPass不重复计入，禁用pass不冒充已采样', h => {
    const f = fixture(h, { post: true }), app = f.app;
    app.renderPass = { enabled: true, render: f.draw };
    const make = time => ({ enabled: true, render(...args) { assert.equal(this.enabled, true); same(args, [1, 2]); h.advance(time); return f.result; } });
    app.bloom = make(2); app.finish = make(3); app.output = make(1); app.fxaa = make(1); app.fxaa.enabled = false;
    const extra = make(4); extra.constructor = { get name() { throw Error(SECRET); } }; extra.player = SECRET;
    app.composer = { passes: [app.renderPass, app.bloom, app.finish, app.output, app.fxaa, extra] };
    const originals = app.composer.passes.map(p => p.render);
    h.d.start(); h.d.renderFrame(app, f.view, () => { for (const pass of app.composer.passes) if (pass.enabled) pass.render(1, 2); });
    const p = h.d.report().performance.draw;
    assert.equal(p.postFrames, 1); assert.equal(p.timings.postprocessing.averageMs, 10); assert.equal(p.timings.draw.averageMs, 17);
    for (const [key, value] of Object.entries({ bloom: 2, finish: 3, output: 1, other: 4 })) assert.equal(p.post[key].averageMs, value);
    assert.equal(p.post.fxaa.averageMs, null); app.composer.passes.forEach((pass, i) => assert.equal(pass.render, originals[i]));
    assert.ok(!JSON.stringify(h.d.report()).includes(SECRET));
  });
  await test('renderer/pass/阴影嵌套同类只计最外层时间，阴影drawCalls不重算', h => {
    const f = fixture(h, { post: true, noOptimizer: true }), r = f.renderer;
    r.shadowMap.render = function (nested = false) { if (!nested) this.render(true); r.clear(); h.advance(2); r.info.render.calls += 3; };
    r.render = function (nested = false) { if (!nested) this.render(true); else this.shadowMap.render(); h.advance(1); this.info.render.calls++; };
    f.app.bloom = { enabled: true, render(nested = false) { if (!nested) this.render(true); else r.render(); h.advance(3); } };
    f.app.composer = { passes: [f.app.bloom] };
    h.d.start(); h.d.renderFrame(f.app, f.view, () => f.app.bloom.render());
    const p = h.d.report().performance.draw;
    assert.equal(p.timings.renderer.averageMs, 6); assert.equal(p.timings.shadow.averageMs, 4);
    assert.equal(p.timings.postprocessing.averageMs, 12); assert.equal(p.post.bloom.averageMs, 12);
    assert.equal(p.counts.rendererCalls.average, 2); assert.equal(p.counts.shadowCalls.average, 2);
    assert.equal(p.counts.shadowRefreshes.average, 1); assert.equal(p.counts.shadowClears.average, 2); assert.equal(p.counts.shadowDrawCalls.average, 6);
  });
  await test('同类别有不可包装pass时保持未知，不把部分计时冒充完整合计', h => {
    for (const reverse of [false, true]) {
      const f = fixture(h, { post: true, noOptimizer: true }), observed = { render() { h.advance(1); } };
      const opaque = Object.freeze({ render() { h.advance(2); } });
      f.app.composer = { passes: reverse ? [opaque, observed] : [observed, opaque] };
      h.d.start(); h.d.renderFrame(f.app, f.view, () => { for (const pass of f.app.composer.passes) pass.render(); });
      const p = h.d.report().performance.draw;
      assert.equal(p.timings.draw.averageMs, 3); assert.equal(p.timings.postprocessing.averageMs, null); assert.equal(p.post.other.averageMs, null);
    }
  });
  await test('v2按场景身份分离主提交和后期，主场景扣除实际阴影的差值不重叠', h => {
    const f = fixture(h, { post: true });
    f.app.renderPass = { render: f.draw };
    f.app.bloom = { render() { h.advance(2); f.renderer.render({ lights: [] }, f.camera); } };
    f.app.composer = { passes: [f.app.renderPass, f.app.bloom] };
    h.d.start(); h.d.renderFrame(f.app, f.view, () => { f.app.renderPass.render(); f.app.bloom.render(); });
    const p = h.d.report().performance.draw.timings;
    for (const [key, value] of Object.entries({ renderer: 11, mainRenderer: 7, mainShadow: 3, mainScene: 4, postprocessing: 6, draw: 13 })) assert.equal(p[key].averageMs, value, key);
    assert.equal(p.mainScene.averageMs + p.mainShadow.averageMs + p.postprocessing.averageMs, p.draw.averageMs);
  });
  await test('v2未刷新为零但接口缺失/非主场景不构造虚假的主场景差值', h => {
    const f = fixture(h); f.renderer.shadowMap.needsUpdate = false; h.d.start(); h.d.renderFrame(f.app, f.view, f.draw);
    let p = h.d.report().performance.draw.timings;
    assert.equal(p.mainShadow.averageMs, 0); assert.equal(p.mainScene.averageMs, 4);
    h.d.start(); Object.defineProperty(f.renderer, 'clear', { value: f.renderer.clear, configurable: false });
    h.d.renderFrame(f.app, f.view, f.draw); p = h.d.report().performance.draw.timings;
    assert.equal(p.mainRenderer.averageMs, 4); assert.equal(p.mainShadow.averageMs, null); assert.equal(p.mainScene.averageMs, null);
    h.d.start(); h.d.renderFrame(f.app, { scene: {} }, f.draw); p = h.d.report().performance.draw.timings;
    assert.equal(p.mainRenderer.averageMs, null); assert.equal(p.mainScene.averageMs, null);
  });
  await test('v2主场景同步嵌套只计最外层，嵌入额外后期时不误作互斥类别', h => {
    const f = fixture(h, { noOptimizer: true }), r = f.renderer;
    r.render = function(s,c,nested=false) { if(!nested)this.render(s,c,true);else this.shadowMap.render(s.lights,s,c);h.advance(2); };
    h.d.start(); h.d.renderFrame(f.app, f.view, f.draw);
    let p=h.d.report().performance.draw.timings;assert.equal(p.mainRenderer.averageMs,7);assert.equal(p.mainShadow.averageMs,3);assert.equal(p.mainScene.averageMs,4);
    f.app.usePost=true;f.app.bloom={render(){h.advance(1);}};f.app.composer={passes:[f.app.bloom]};
    r.render=function(){this.shadowMap.render(f.scene.lights,f.scene,f.camera);f.app.bloom.render();h.advance(2);};
    h.d.start();h.d.renderFrame(f.app,f.view,f.draw);p=h.d.report().performance.draw.timings;
    assert.equal(p.mainRenderer.averageMs,3);assert.equal(p.postprocessing.averageMs,1);assert.equal(p.mainScene.averageMs,null);
  });
  await test('同一App重入记录只有外层样本，返回/异常/继承属性均恢复', h => {
    const f = fixture(h, { noOptimizer: true }), original = f.renderer.render, before = f.descriptors(); let inner = 0;
    h.d.start();
    const value = h.d.renderFrame(f.app, f.view, () => h.d.renderFrame(f.app, f.view, () => { inner++; return f.draw(); }));
    assert.equal(value, f.result); assert.equal(inner, 1); assert.equal(h.d.report().performance.draw.sampledFrames, 1);
    assert.equal(f.renderer.render, original); assert.deepEqual(f.descriptors(), before);
    const expected = Error('game-render-failure');
    assert.throws(() => h.d.renderFrame(f.app, f.view, () => h.d.renderFrame(f.app, f.view, () => { throw expected; })), error => error === expected);
    assert.deepEqual(f.descriptors(), before); assert.equal(h.d.report().performance.draw.failedFrames, 1);
    h.d.renderFrame(f.app, f.view, f.draw); assert.equal(h.d.report().performance.draw.completedFrames, 2);
  });
  await test('绘制/optimizer/pass异常保留原异常，清理采样包装，下一帧可继续', h => {
    for (const location of ['render', 'optimizer', 'pass']) {
      const f = fixture(h), expected = Error(location), app = f.app;
      if (location === 'render') f.renderer.render = () => { throw expected; };
      if (location === 'optimizer') f.optimizer.render = () => { throw expected; };
      if (location === 'pass') { app.usePost = true; app.bloom = { render() { throw expected; } }; app.composer = { passes: [app.bloom] }; }
      const before = f.descriptors(), pass = app.bloom?.render;
      h.d.start(); assert.throws(() => h.d.renderFrame(app, f.view, location === 'pass' ? () => app.bloom.render() : f.draw), error => error === expected);
      assert.deepEqual(f.descriptors(), before); assert.equal(app.bloom?.render, pass);
      const p = h.d.report().performance.draw; assert.equal(p.failedFrames, 1); assert.equal(p.timings.total.samples, 0);
    }
  });
  await test('采样时钟/报告接收/可选接口异常不阻断或重复绘制，也不遮盖原异常', h => {
    const f = fixture(h), before = f.descriptors(); let invoked = 0;
    h.context.performance.now = () => { throw Error(SECRET); };
    assert.equal(h.sampler.sampleRendering(f.app, f.view, () => { invoked++; return f.draw(); }, () => { throw Error(SECRET); }), f.result);
    assert.equal(invoked, 1); assert.deepEqual(f.descriptors(), before);
    const expected = Error('game-original');
    assert.throws(() => h.sampler.sampleRendering(f.app, f.view, () => { throw expected; }, () => { throw Error(SECRET); }), error => error === expected);
    f.app.usePost = true; Object.defineProperty(f.app, 'composer', { get() { throw Error(SECRET); } });
    let captured; h.sampler.sampleRendering(f.app, f.view, () => { invoked++; return f.draw(); }, sample => captured = sample);
    assert.equal(invoked, 2); assert.equal(captured.completed, true); assert.equal(captured.timings.renderer, null); assert.deepEqual(f.descriptors(), before);
  });
  await test('诊断期间stop/start不串样本，第三方主动替换的方法不会被清理覆盖', h => {
    const f = fixture(h), replacement = () => 'external'; h.d.start();
    h.d.renderFrame(f.app, f.view, () => { h.d.stop(); h.d.start(); f.renderer.render = replacement; return 'value'; });
    assert.equal(f.renderer.render, replacement); assert.equal(h.d.report().performance.draw.sampledFrames, 0);
    h.d.renderFrame(f.app, {}, () => f.renderer.render()); assert.equal(h.d.report().performance.draw.completedFrames, 1);
  });
  await test('绘制报告白名单、深拷贝、null/0、失败样本与最近3600窗口一致，旧schema保留', h => {
    const d = h.d; d.start(); const initial = d.report();
    assert.equal(initial.schema, 'nuannuan-diagnostics-v1'); same(Object.keys(initial.performance.modules), ['tweens', 'effects', 'view', 'hooks', 'render']);
    assert.equal(initial.performance.draw.timings.total.averageMs, null); assert.equal(initial.performance.draw.counts.rendererCalls.average, null);
    const sample = { completed: true, usePost: false, shadowState: 'skipped', timings: { total: 0, draw: 0, shadow: 0, renderer: NaN, scenePrepare: -1 },
      post: { bloom: '3', other: Infinity, secret: SECRET }, counts: { shadowClears: 0, shadowDrawCalls: 0, rendererCalls: 0 }, secret: SECRET };
    d.sampleDraw({ ...sample, completed: false, shadowState: 'refreshed', timings: { total: 99999 } });
    for (let i = 0; i < 3601; i++) d.sampleDraw(sample);
    const report = d.report(), p = report.performance.draw;
    assert.equal(p.sampledFrames, 3600); assert.equal(p.completedFrames, 3600); assert.equal(p.failedFrames, 0);
    assert.equal(p.shadow.skipped.frames, 3600); assert.equal(p.shadow.refreshed.frames, 0); assert.equal(p.timings.total.samples, 3600);
    assert.equal(p.timings.total.averageMs, 0); assert.equal(p.timings.renderer.averageMs, null); assert.equal(p.post.bloom.averageMs, null);
    assert.equal(p.counts.shadowClears.average, 0); assert.ok(!JSON.stringify(report).includes(SECRET));
    p.timings.total.averageMs = 123; p.shadow.skipped.frames = -1; assert.equal(d.report().performance.draw.timings.total.averageMs, 0);
    const stopped = d.stop(); stopped.performance.draw.timings.total.averageMs = -1; assert.equal(d.report().performance.draw.timings.total.averageMs, 0);
    d.start(); assert.equal(d.report().performance.draw.sampledFrames, 0);
  });
  const failed = checks.filter(check => !check.pass).length;
  const report = { name: 'draw_diagnostics_checks', passed: checks.length - failed, failed, checks };
  if (process.env.LIVE_QA_OUT) { fs.mkdirSync(process.env.LIVE_QA_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.LIVE_QA_OUT, 'report.json'), JSON.stringify(report, null, 2)); }
  console.log(`Draw diagnostics isolated checks: ${report.passed} passed, ${failed} failed.`); if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
