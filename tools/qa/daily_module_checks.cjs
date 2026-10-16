// 每日模块重构回归：内存存储/注入时钟，不启动服务器或读取玩家数据。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const child = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const clock = { now: new Date(2026, 9, 7, 12).getTime() };
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock.now])); }
  static now() { return clock.now; }
}
const setDay = (day, hour = 12, minute = 0, second = 0) => {
  const [year, month, date] = day.split('-').map(Number);
  clock.now = new Date(year, month - 1, date, hour, minute, second).getTime();
};

async function load(entry, baseline) {
  const modules = new Map(), storage = new Map(), writes = [], timers = new Map();
  let timerId = 0;
  const context = vm.createContext({ console, Date: ClockDate, TextEncoder, URLSearchParams, performance,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    location: { search: '?slot=qa-daily-module-memory' }, localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { writes.push(key); storage.set(key, value); },
      removeItem: key => { writes.push(key); storage.delete(key); },
    },
  });
  function at(file) {
    if (!modules.has(file)) {
      const previous = baseline && path.join(baseline, path.relative(root, file));
      const source = previous && fs.existsSync(previous) ? previous : file;
      modules.set(file, new vm.SourceTextModule(fs.readFileSync(source, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  }
  const resolve = (specifier, from) => specifier === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13))
      : path.resolve(path.dirname(from.identifier), specifier);
  const module = at(path.join(root, entry));
  await module.link((specifier, from) => at(resolve(specifier, from)));
  await module.evaluate();
  return { entry: module.namespace, get: name => modules.get(path.join(root, name))?.namespace, storage, writes, timers };
}

async function main() {
  const checks = [];
  const test = (name, run) => { run(); checks.push(name); console.log('PASS ' + name); };
  const isolated = await load('js/features/daily/service.js');
  const rules = isolated.get('js/features/daily/rules.js'), definitions = isolated.get('js/shared/daily.js');
  const { Emitter } = isolated.get('js/core/util.js');
  const getDefinition = definitions.dailyDefinition;
  const golden = [
    ['2026-10-07', ['d_req', 'd_endless', 'd_flower'], [1, 60, 100]],
    ['2026-10-08', ['d_harvest', 'd_tailor', 'd_endless'], [6, 100, 60]],
    ['2026-10-16', ['d_endless', 'd_req', 'd_flower'], [60, 1, 100]],
    ['2026-12-31', ['d_decor', 'd_cafe', 'd_endless'], [1, 120, 60]],
    ['2027-01-01', ['d_talk', 'd_endless', 'd_flower'], [3, 60, 100]],
  ];
  test('日期种子抽单与重构前5个日期金样一致，9/10/39/40档位与统计基线保持', () => {
    for (const [day, ids, targets] of golden) {
      const initial = rules.createDailyTasks(day, 0, () => 200);
      same(initial.map(task => task.id), ids); same(initial.map(task => task.n), targets);
      for (const plays of [0, 9, 10, 39, 40, 100]) {
        const tasks = rules.createDailyTasks(day, plays, () => 200), tier = plays < 10 ? 0 : plays < 40 ? 1 : 2;
        same(tasks.map(task => task.id), ids);
        assert.equal(new Set(tasks.map(task => getDefinition(task.id).type)).size, 3);
        for (const task of tasks) {
          const definition = getDefinition(task.id);
          assert.equal(task.n, definition.n[tier]); assert.equal(task.prog, 0); assert.equal(task.claimed, false);
          assert.equal(task.base, definition.type === 'stat' ? 200 : 0);
        }
      }
    }
  });
  test('纯规则不修改传入数据，分数按店铺、时长按模式且只取单局最高', () => {
    const tasks = [
      { id: 'd_cafe', n: 120, base: 0, prog: 110, claimed: false },
      { id: 'd_harvest', n: 6, base: 200, prog: 0, claimed: false },
      { id: 'd_endless', n: 60, base: 0, prog: 59.98, claimed: false },
    ];
    for (const task of tasks) Object.freeze(task);
    Object.freeze(tasks);
    const source = Object.freeze({ day: '2026-10-07', daily: tasks, chest: false });
    const before = JSON.stringify(source);
    same(rules.dailyPlayedUpdates(tasks, { id: 'flower', total: 999, mode: 'level', elapsed: 999 }), []);
    same(rules.dailyPlayedUpdates(tasks, { id: 'cafe', total: 109, mode: 'endless', elapsed: 59.5 }), []);
    same(rules.dailyPlayedUpdates(tasks, { id: 'cafe', total: 120, mode: 'endless', elapsed: 60.02 }), [{ index: 0, prog: 120 }, { index: 2, prog: 60.02 }]);
    const view = rules.dailyView(source, () => 204);
    assert.equal(view.tasks[1].cur, 4); assert.equal(view.tasks[2].done, false);
    assert.equal(JSON.stringify(source), before);
    assert.equal(definitions.dailyProgressIsInteger(getDefinition('d_endless')), false);
    assert.equal(definitions.dailyProgressIsInteger(getDefinition('d_cafe')), true);
    assert.equal(definitions.dailyProgressIsInteger(getDefinition('d_harvest')), true);
  });
  test('服务重复init不叠加订阅，可释放重装，换档后读取新状态并保留旧档', () => {
    setDay('2026-10-16');
    let state = { coins: 200, live: { day: '', daily: [], chest: false }, shops: { cafe: { plays: 42 } }, stats: {} };
    const bus = new Emitter(), events = [], rewards = []; let saves = 0;
    bus.on('liveDaily', () => events.push('changed'));
    const service = isolated.entry.createDailyService({ getState: () => state, getStat: name => state.stats[name] || 0,
      save: () => saves++, addCoins: (amount, source) => { state.coins += amount; rewards.push([amount, source]); }, bus, now: () => clock.now });
    service.init(); service.init();
    assert.equal(bus.map.get('beforeStat').size, 1); assert.equal(bus.map.get('played').size, 1);
    assert.ok(state.live.daily.every(task => task.n === getDefinition(task.id).n[2]), 'old shop plays choose tier');
    const oldState = state, oldText = JSON.stringify(state);
    state = { ...clone(state), live: { ...clone(state.live), daily: clone(state.live.daily) } };
    bus.emit('played', { id: 'cafe', total: 0, mode: 'endless', elapsed: 150.25, endedAt: clock.now });
    assert.equal(state.live.daily.find(task => task.id === 'd_endless').prog, 150.25);
    assert.equal(JSON.stringify(oldState), oldText);
    assert.equal(service.claimDaily('d_endless'), 150); assert.equal(service.claimDaily('d_endless'), 0);
    same(rewards, [[150, 'live']]); assert.equal(events.length, 2);
    const saved = saves; service.dispose(); service.dispose();
    assert.equal(bus.map.get('beforeStat').size, 0); assert.equal(bus.map.get('played').size, 0);
    bus.emit('played', { mode: 'endless', elapsed: 999 }); assert.equal(saves, saved);
    service.init(); assert.equal(bus.map.get('played').size, 1); service.dispose();
  });

  setDay('2026-10-16');
  const current = await load('js/live/api.js');
  const api = current.entry, st = current.get('js/core/state.js'), data = current.get('js/live/data.js');
  const initialState = clone(st.S);
  const currentDefinitions = current.get('js/shared/daily.js'), format = current.get('js/core/save-format.js');
  const fresh = (day = '2026-10-07') => { setDay(day); st.resetSave(); api.initDaily(); st.flushSave(); };
  const viewOfType = type => api.live.daily().tasks.find(task => getDefinition(task.id).type === type);
  const played = (elapsed, extra = {}) => st.bus.emit('played', { id: getDefinition(viewOfType('score').id).shop, total: 999, mode: 'endless', elapsed, endedAt: clock.now, ...extra });

  test('旧data导出引用同一共享定义，已知ID、内容和返回字段不变', () => {
    assert.equal(data.DAILY_POOL, currentDefinitions.DAILY_POOL);
    assert.equal(data.DAILY_CHEST, currentDefinitions.DAILY_CHEST);
    same(data.DAILY_POOL.map(definition => definition.id), ['d_cafe', 'd_flower', 'd_tailor', 'd_fish', 'd_harvest', 'd_fruit', 'd_req', 'd_talk', 'd_stage', 'd_endless', 'd_wish', 'd_decor']);
    fresh(); const view = api.live.daily();
    same(Object.keys(view).sort(), ['chest', 'date', 'tasks']);
    same(Object.keys(view.tasks[0]).sort(), ['claimed', 'cur', 'done', 'id', 'need', 'reward', 'text']);
    assert.equal(api.live.claimDaily('missing'), 0); assert.equal(api.live.claimChest(), 0);
    format.validateSaveData(st.S);
  });
  test('本地午夜先换日再增长统计，昨日结算事件不会记入今天，镇历不控制订单', () => {
    fresh('2026-10-07'); st.S.live.chest = true; st.S.live.daily.forEach(task => task.claimed = true);
    st.S.stats.harvested = 200;
    setDay('2026-10-08', 0, 0, 0); st.stat('harvested');
    const next = api.live.daily(); assert.equal(next.date, '2026-10-08'); assert.equal(next.chest.claimed, false);
    assert.ok(next.tasks.every(task => !task.claimed)); assert.equal(viewOfType('stat').cur, 1);
    played(999, { endedAt: new Date(2026, 9, 7, 23, 59, 59).getTime() });
    assert.equal(viewOfType('endless').cur, 0); assert.equal(viewOfType('score').cur, 0);
    played(60.02); assert.equal(viewOfType('endless').cur, 60.02);
    const daily = clone(st.S.live.daily); st.S.gday += 40; same(st.S.live.daily, daily); same(api.live.daily().tasks.map(t => t.id), daily.map(t => t.id));
    // 比较 Date 的本地分量，确保没有用 toISOString() 的 UTC 日期替代。
    const local = new Date(2026, 0, 1, 0, 1);
    assert.equal(rules.dailyDateKey(local), '2026-01-01');
  });
  test('小数时长阈值不提前领奖，三单及宝箱只发一次且存档重载不重发', () => {
    fresh(); const startingCoins = st.S.coins, sources = [];
    const off = st.bus.on('coins', (_total, _amount, source) => sources.push(source));
    played(59.98); assert.equal(viewOfType('endless').done, false); assert.equal(api.live.claimDaily('d_endless'), 0);
    played(60.02); assert.equal(viewOfType('endless').done, true);
    const statTask = viewOfType('stat'); st.stat(getDefinition(statTask.id).stat, statTask.need);
    const tasks = api.live.daily().tasks; assert.ok(tasks.every(task => task.done));
    assert.equal(api.live.claimChest(), 0, 'all done but unclaimed');
    for (const task of tasks) { assert.equal(api.live.claimDaily(task.id), task.reward); assert.equal(api.live.claimDaily(task.id), 0); }
    assert.equal(api.live.claimChest(), 300); assert.equal(api.live.claimChest(), 0);
    same(sources, ['live', 'live', 'live', 'live']); off();
    assert.equal(st.S.coins, startingCoins + tasks.reduce((sum, task) => sum + task.reward, 0) + 300);
    const before = clone(st.S.live), coins = st.S.coins, exported = st.exportSaveFile().text;
    const count = current.writes.length; st.previewSaveImport(exported); assert.equal(current.writes.length, count);
    assert.equal(st.importSaveFile(exported).ok, true); assert.equal(st.load(), true); api.initDaily();
    same(st.S.live, before); assert.equal(st.S.coins, coins); assert.equal(api.live.claimChest(), 0);
    for (const task of tasks) assert.equal(api.live.claimDaily(task.id), 0);
    st.flushSave();
  });
  test('旧档无live或无订单缺省字段仍可迁移，合法小数不重置且保留领取状态', () => {
    fresh(); const legacy = clone(st.S); delete legacy.live;
    assert.equal(st.importSaveFile(JSON.stringify(legacy)).ok, true); api.initDaily(); assert.equal(api.live.daily().tasks.length, 3);
    const partial = clone(st.S), endless = partial.live.daily.find(task => task.id === 'd_endless');
    endless.prog = 91.625; endless.claimed = 1; delete endless.base;
    const other = partial.live.daily.find(task => task.id !== 'd_endless'); delete other.prog; delete other.claimed;
    assert.equal(st.importSaveFile(JSON.stringify(partial)).ok, true); api.initDaily();
    assert.equal(viewOfType('endless').cur, 91.625); assert.equal(viewOfType('endless').claimed, 1);
    assert.equal(api.live.claimDaily('d_endless'), 0); assert.equal(st.normalizeSaveData(st.serializeState()).live.daily.find(task => task.id === 'd_endless').prog, 91.625);
  });
  test('共享进度类型和存档校验一致，计数/基线/目标仍拒绝小数及非法值', () => {
    fresh(); const original = clone(st.S);
    for (const definition of data.DAILY_POOL) {
      const candidate = clone(original);
      candidate.live.daily = [{ id: definition.id, n: definition.n[0], base: 0, prog: 0.125, claimed: false }];
      if (definition.type === 'endless') format.validateSaveData(candidate);
      else assert.throws(() => format.validateSaveData(candidate), /prog 数值无效/);
    }
    for (const [field, value] of [['prog', -0.01], ['prog', '1'], ['prog', null], ['prog', Infinity], ['prog', NaN], ['prog', Number.MAX_SAFE_INTEGER + 1], ['base', 0.5], ['n', 60.5]]) {
      const candidate = clone(original), task = candidate.live.daily.find(item => item.id === 'd_endless'); task[field] = value;
      assert.throws(() => format.validateSaveData(candidate), undefined, field + ':' + value);
    }
    same(st.S, original);
  });

  if (process.env.DAILY_BASELINE) {
    setDay('2026-10-16');
    const previous = await load('js/live/api.js', path.resolve(process.env.DAILY_BASELINE));
    const oldState = previous.get('js/core/state.js'), oldApi = previous.entry;
    test('shared迁移前后data导出键和全部静态值一致，4个计算函数的边界输出一致', () => {
      const before = previous.get('js/data.js'), after = current.get('js/data.js');
      same(Object.keys(after).sort(), Object.keys(before).sort());
      const functions = [];
      for (const name of Object.keys(before)) {
        if (typeof before[name] === 'function') {
          functions.push(name);
          assert.equal(typeof after[name], 'function', name);
          for (const value of [-1, 0, 1, 2, 6, 9, 10, 39, 40, 99, 100, 249, 250, 499, 500, 799, 800, 1199, 1200, 10000]) same(after[name](value), before[name](value), `${name}(${value})`);
        } else same(after[name], before[name], name);
      }
      same(functions.sort(), ['PLOT_PRICE', 'beautyRank', 'shopMult', 'stageScale'].sort());
    });
    test('固定本地日期和独立slot下，shared玩家默认值迁移前后的初始S完整一致', () => {
      same(initialState, oldState.S);
      previous.get('js/core/save-format.js').validateSaveData(oldState.S);
      format.validateSaveData(initialState);
      assert.equal(initialState.started, false); assert.equal(initialState.coins, 200);
    });
    test('与本轮修改前源码做30天x6档位行为对照：抽取、结算、奖励、重复领取完全一致', () => {
      same(data.DAILY_POOL, previous.get('js/live/data.js').DAILY_POOL);
      same(data.DAILY_CHEST, previous.get('js/live/data.js').DAILY_CHEST);
      for (let day = 1; day <= 30; day++) for (const plays of [0, 9, 10, 39, 40, 100]) {
        setDay(`2026-10-${String(day).padStart(2, '0')}`);
        const results = [];
        for (const [state, facade] of [[oldState, oldApi], [st, api]]) {
          state.resetSave(); state.S.stats.plays = plays;
          for (const definition of data.DAILY_POOL.filter(item => item.type === 'stat')) state.S.stats[definition.stat] = 200;
          facade.initDaily(); const before = facade.live.daily();
          const score = before.tasks.find(task => getDefinition(task.id).type === 'score');
          const stat = before.tasks.find(task => getDefinition(task.id).type === 'stat');
          state.stat(getDefinition(stat.id).stat, stat.need);
          state.bus.emit('played', { id: getDefinition(score.id).shop, total: score.need, mode: 'endless', elapsed: 150.125, endedAt: clock.now });
          const after = facade.live.daily(), payouts = [];
          for (const task of after.tasks) payouts.push(facade.live.claimDaily(task.id), facade.live.claimDaily(task.id));
          payouts.push(facade.live.claimChest(), facade.live.claimChest());
          results.push({ before, after, payouts, coins: state.S.coins, daily: state.S.live.daily, chest: state.S.live.chest });
          state.flushSave();
        }
        same(results[1], results[0], `day=${day}, plays=${plays}`);
      }
    });
  }
  st.flushSave();
  console.log(JSON.stringify({ pass: true, checks: checks.length, baselineCompared: !!process.env.DAILY_BASELINE, storage: 'memory only', clock: 'injected', server: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
