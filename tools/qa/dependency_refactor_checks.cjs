// 日历/经济/图标分层检查；不使用玩家数据。ROUND2_BASELINE可选指向本轮before备份。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
if (!vm.SourceTextModule) {
  const r = require('node:child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const root = path.resolve(__dirname, '../..');
const baseline = process.env.ROUND2_BASELINE && path.resolve(process.env.ROUND2_BASELINE);
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b, label) => assert.deepEqual(clone(a), clone(b), label);
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [1792113600000])); } static now() { return 1792113600000; } }

async function runtime(before) {
  const modules = new Map(), storage = new Map(), timers = new Map(); let next = 0;
  const context = vm.createContext({ console, Date: FixedDate, URLSearchParams, TextEncoder, performance,
    location: { search: '?slot=round2-differential-memory' },
    setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  function at(file) {
    if (!modules.has(file)) {
      const original = before && path.join(before, path.relative(root, file));
      const source = original && fs.existsSync(original) ? original : file;
      modules.set(file, new vm.SourceTextModule(fs.readFileSync(source, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  }
  const resolve = (name, from) => name === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : name.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', name.slice(13))
      : path.resolve(path.dirname(from.identifier), name);
  async function use(name) {
    const mod = at(path.join(root, name));
    if (mod.status === 'unlinked') await mod.link((specifier, from) => at(resolve(specifier, from)));
    if (mod.status !== 'evaluated') await mod.evaluate();
    return mod.namespace;
  }
  return { use, storage, timers };
}

async function iconRuntime(before) {
  const three = await import(require('node:url').pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href);
  const trace = [], builds = [], cleaned = []; let renders = 0, fail = false;
  class Renderer {
    constructor(options) { trace.push(['renderer', options.alpha, options.antialias, options.preserveDrawingBuffer]);
      this.domElement = { toDataURL: type => { trace.push(['png', type]); return 'data:image/png;base64,fixture-' + renders; } };
      this.renderLists = { dispose: () => trace.push(['renderLists.dispose']) };
    }
    setPixelRatio(n) { trace.push(['ratio', n]); }
    setSize(w, h, css) { trace.push(['size', w, h, css]); }
    render(scene, camera) {
      renders++; trace.push(['render', scene.children.length, camera.left, camera.right, ...camera.position.toArray()]);
      if (fail) throw new Error('synthetic render failure');
    }
  }
  const context = vm.createContext({ console, document: { createElement: tag => { trace.push(['create', tag]); return {}; } } });
  const api = { ...three, WebGLRenderer: Renderer };
  const t = new vm.SyntheticModule(Object.keys(api), function () { for (const [key, value] of Object.entries(api)) this.setExport(key, value); }, { context });
  const kit = new vm.SyntheticModule(['disposeSceneResources'], function () {
    this.setExport('disposeSceneResources', obj => { cleaned.push(obj); trace.push(['dispose', obj.name, obj.parent === null]); });
  }, { context });
  let source;
  if (before) {
    const old = fs.readFileSync(path.join(before, 'js/core/icons.js'), 'utf8');
    source = "import * as THREE from 'three'; import {disposeSceneResources} from './kit.js';\n"
      + old.slice(old.indexOf('let R, scene, cam, holder;'), old.indexOf('const B ='));
  } else source = fs.readFileSync(path.join(root, 'js/core/icon-renderer.js'), 'utf8');
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => name === 'three' ? t : kit); await mod.evaluate();
  const build = name => () => { builds.push(name); const obj = new three.Mesh(new three.BoxGeometry(1, 2, 3)); obj.name = name; return obj; };
  return { icon: mod.namespace.icon, trace, builds, cleaned, build, fail: value => { fail = value; } };
}

async function main() {
  if (baseline) assert.ok(fs.existsSync(path.join(baseline, 'js/core/state.js')), 'Baseline must contain source files');
  const results = [], test = async (label, run) => { await run(); results.push({ label, pass: true }); console.log('PASS ' + label); };
  const current = await runtime(), state = await current.use('js/core/state.js'), time = await current.use('js/core/gametime.js');
  const effects = await current.use('js/live/effects.js'), data = await current.use('js/data.js');
  await test('镇历公开接口、跨年与当前存档绑定保持，纯规则模块不读取状态', async () => {
    same(Object.keys(time).sort(), ['MONTH_DAYS', 'YEAR_DAYS', 'gameDate', 'gameDayKey', 'gameDayNo', 'mdText'].sort());
    assert.equal(time.gameDate(0).key, '1年3月1日'); assert.equal(time.gameDate(69).key, '1年12月7日');
    assert.equal(time.gameDate(70).key, '2年1月1日'); assert.equal(time.gameDate(-1).n, 0);
    state.S.gday = 70; assert.equal(time.gameDayNo(), 70); assert.equal(time.gameDayKey(), '2年1月1日');
    const pure = await current.use('js/shared/calendar.js'); assert.equal(pure.gameDate().key, '1年3月1日');
    assert.equal(time.mdText('03-03'), '3月3日');
  });
  await test('套装兼容入口与纯规则导出同一函数，卖价依当前镇历改变且不写存档', async () => {
    const pure = await current.use('js/shared/effect-rules.js'); assert.equal(pure.outfitFx, effects.outfitFx);
    const before = current.storage.size;
    state.S.gday = 0; const regular = state.cropSellPrice('radish', false);
    const harvest = data.CROPS.find(crop => crop.id === 'radish');
    let harvestDay;
    for (let day = 0; day < 84; day++) { state.S.gday = day; if (effects.festivalAt()?.id === 'harvest') { harvestDay = day; break; } }
    assert.ok(Number.isInteger(harvestDay)); assert.equal(state.cropSellPrice('radish', false), Math.round(harvest.sell * 1.2));
    state.S.gday = 0; assert.equal(state.cropSellPrice('radish', false), regular); assert.equal(current.storage.size, before);
  });
  await test('图标缓存跨调用复用、渲染失败释放临时资源且失败结果不缓存', async () => {
    const icon = await iconRuntime(); const first = icon.icon('shared', icon.build('first'));
    assert.equal(icon.icon('shared', icon.build('unused')), first); same(icon.builds, ['first']); assert.equal(icon.cleaned.length, 1);
    assert.equal(icon.cleaned[0].parent, null); icon.fail(true);
    assert.throws(() => icon.icon('retry', icon.build('failed')), /synthetic/); assert.equal(icon.cleaned.length, 2);
    icon.fail(false); assert.ok(icon.icon('retry', icon.build('retried'))); same(icon.builds, ['first', 'failed', 'retried']);
    assert.equal(icon.trace.filter(row => row[0] === 'renderLists.dispose').length, 3);
  });
  await test('全部模块依赖图无循环，纯规则和通用渲染器不反向依赖业务层', async () => {
    const { inspectModules, cyclesOf } = require('../module_graph.cjs'); const graph = await inspectModules(root);
    same(cyclesOf(graph.inputs), []); same(JSON.parse(fs.readFileSync(path.join(root, 'tools/engineering-cycles.json'), 'utf8')).groups, []);
    const forbidden = new Set(['js/core/state.js', 'js/ui/ui.js', 'js/live/effects.js', 'js/core/gametime.js']);
    function walk(name, seen = new Set()) { if (seen.has(name)) return seen; seen.add(name); for (const next of graph.inputs[name]?.imports || []) if (!next.external) walk(next.path, seen); return seen; }
    for (const name of ['js/shared/calendar.js', 'js/shared/effect-rules.js']) for (const dependency of walk(name)) assert.ok(!forbidden.has(dependency), name + ' -> ' + dependency);
    for (const dependency of walk('js/core/icon-renderer.js')) assert.ok(!['js/core/icons.js','js/live/props.js'].includes(dependency));
  });
  if (baseline) {
    const old = await runtime(baseline), oldState = await old.use('js/core/state.js'), oldTime = await old.use('js/core/gametime.js'), oldEffects = await old.use('js/live/effects.js');
    await test('与整理前比较：3个镇历年、全部作物及高价出售的日期/节日/经济结果相同', async () => {
      const outfits = [data.DEFAULT_OUTFIT];
      for (const set of ['dust', 'star', 'charge']) outfits.push(Object.fromEntries(['hair','dress','shoes'].map(cat => [cat, data.CLOTHES.find(c => c.set === set && c.cat === cat)?.id])));
      for (let day = -2; day < 252; day++) for (const outfit of outfits) {
        oldState.S.gday = state.S.gday = day; oldState.S.outfit = clone(outfit); state.S.outfit = clone(outfit);
        same(time.gameDate(), oldTime.gameDate()); same(effects.festivalAt(), oldEffects.festivalAt());
        assert.equal(effects.cropFestivalBonus(), oldEffects.cropFestivalBonus());
        for (const crop of data.CROPS) for (const hot of [false, true]) assert.equal(state.cropSellPrice(crop.id, hot), oldState.cropSellPrice(crop.id, hot));
        for (const shop of Object.keys(state.S.shops).filter(key => data.SHOPS[key])) assert.equal(state.shopUpgradePrice(shop), oldState.shopUpgradePrice(shop));
        for (const achievement of data.ACHS) assert.equal(state.achReward(achievement), oldState.achReward(achievement));
      }
    });
    await test('与整理前比较：全部套装能力、缺部件、无效日期和显式日期结果相同', async () => {
      const sets = [...new Set(data.CLOTHES.map(item => item.set))].filter(Boolean);
      for (const set of sets) for (const missing of [false, true]) {
        const outfit = Object.fromEntries(['hair','dress','shoes'].map(cat => [cat, data.CLOTHES.find(item => item.set === set && item.cat === cat)?.id]));
        if (missing) delete outfit.shoes;
        for (const key of [...sets, 'unknown']) assert.equal(effects.outfitFx(outfit, key), oldEffects.outfitFx(outfit, key));
      }
      for (const md of [null, '', 12, '03-03', '06-02', '09-01', '12-07', '01-01', '99-99', 'bad']) same(effects.festivalAt(md), oldEffects.festivalAt(md));
    });
    await test('与整理前比较：图标相机/尺寸/缓存/异常回收调用序列完全相同', async () => {
      const now = await iconRuntime(), prev = await iconRuntime(baseline);
      for (const r of [now, prev]) {
        r.icon('one', r.build('first')); r.icon('one', r.build('unused'));
        r.icon('large', r.build('large'), { size: 384, yaw: .6, pitch: .2, zoom: 1.1 });
        r.fail(true); assert.throws(() => r.icon('failed', r.build('failed')), /synthetic/);
        r.fail(false); r.icon('failed', r.build('retry'));
      }
      same(now.trace, prev.trace); same(now.builds, prev.builds);
    });
  }
  console.log(JSON.stringify({ pass: true, checks: results.length, baselineCompared: !!baseline, storage: 'memory only', gpu: false }));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
