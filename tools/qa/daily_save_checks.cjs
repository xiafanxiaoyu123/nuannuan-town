// 每日订单的真实结算、文件迁移与云同步校验；仅用独立内存存储，不接触玩家存档。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const result = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

async function main() {
  const root = path.resolve(__dirname, '../..'), modules = new Map(), storage = new Map(), writes = [];
  const key = 'nikki-block-town-save-v1:qa-daily-save-memory', recoveryKey = key + ':before-import';
  const context = vm.createContext({ console, Date, TextEncoder, URLSearchParams, performance, setTimeout, clearTimeout,
    location: { search: '?slot=qa-daily-save-memory' }, localStorage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => { storage.set(name, value); writes.push(name); },
      removeItem: (name) => { storage.delete(name); writes.push(name); },
    },
  });
  function moduleAt(file) {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  }
  const resolve = (specifier, from) => specifier === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13))
      : path.resolve(path.dirname(from.identifier), specifier);
  const entry = moduleAt(path.join(root, 'js/live/api.js'));
  await entry.link((specifier, from) => moduleAt(resolve(specifier, from)));
  await entry.evaluate();
  const api = entry.namespace, st = modules.get(path.join(root, 'js/core/state.js')).namespace;
  const format = modules.get(path.join(root, 'js/core/save-format.js')).namespace;
  const clone = (value) => JSON.parse(JSON.stringify(value)), text = JSON.stringify;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let checks = 0, badCases = 0;
  const test = (name, run) => { run(); checks++; console.log('PASS ' + name); };
  const fresh = () => {
    st.resetSave();
    st.S.live.day = today();
    st.S.live.daily = [
      { id: 'd_endless', n: 60, base: 0, prog: 0, claimed: false },
      { id: 'd_cafe', n: 120, base: 0, prog: 0, claimed: false },
      { id: 'd_harvest', n: 6, base: 0, prog: 0, claimed: false },
    ];
    api.initDaily(); st.flushSave(); return clone(st.S);
  };
  const played = (elapsed, more = {}) => st.bus.emit('played', { id: 'cafe', total: 150, mode: 'endless', elapsed, endedAt: Date.now(), ...more });
  const daily = () => st.S.live.daily.find(task => task.id === 'd_endless');
  const visibleDaily = () => api.live.daily().tasks.find(task => task.id === 'd_endless');
  const noSideEffects = (run) => {
    const state = text(st.S), saved = text([...storage]), count = writes.length;
    const result = run();
    assert.equal(text(st.S), state, 'operation changed current state or rewards');
    assert.equal(text([...storage]), saved, 'operation changed storage');
    assert.equal(writes.length, count, 'operation wrote storage');
    return result;
  };

  test('真实 played 事件保留小数秒，59.98 秒未完成、60.02 秒完成且不自动发奖', () => {
    fresh(); const coins = st.S.coins;
    played(59.98); assert.equal(daily().prog, 59.98); assert.equal(visibleDaily().done, false);
    assert.equal(api.live.claimDaily('d_endless'), 0);
    played(60.02); assert.equal(daily().prog, 60.02); assert.equal(visibleDaily().done, true);
    assert.equal(st.S.coins, coins); assert.equal(daily().claimed, false);
    played(40.25); assert.equal(daily().prog, 60.02, 'lower result reduced best progress');
    played(99.99, { mode: 'level' }); assert.equal(daily().prog, 60.02, 'level result changed endless progress');
    played(90.25, { endedAt: new Date(2000, 0, 1, 12).getTime() }); assert.equal(daily().prog, 60.02, 'other-day result counted');
    st.flushSave();
  });

  test('小数秒的 UTF-8 TXT/BOM/旧 JSON 可预览和云端标准化，纯读取不写入或发奖', () => {
    for (const elapsed of [0, 0.016, 59.98, 60.02, 150.123456789]) {
      fresh(); played(elapsed); st.flushSave();
      const exported = noSideEffects(() => st.exportSaveFile());
      assert.match(exported.filename, /\.txt$/);
      assert.equal(JSON.parse(exported.text).data.live.daily[0].prog, elapsed);
      for (const source of [exported.text, '\uFEFF' + exported.text, text(st.S)]) {
        const preview = noSideEffects(() => st.previewSaveImport(source));
        assert.equal(preview.summary.coins, st.S.coins);
        assert.equal(format.parseSaveFile(source).data.live.daily[0].prog, elapsed);
      }
      const serialized = noSideEffects(() => st.serializeState());
      const normalized = noSideEffects(() => st.normalizeSaveData(serialized));
      assert.equal(normalized.live.daily[0].prog, elapsed);
      normalized.live.daily[0].prog = 999;
      assert.equal(daily().prog, elapsed, 'cloud normalization shared state references');
    }
  });

  test('小数秒与领取状态跨导入、恢复点、重载和云端替换保持一致，奖励不能重复领取', () => {
    fresh(); played(60.02); assert.equal(api.live.claimDaily('d_endless'), 150);
    const claimed = clone(daily()), coins = st.S.coins, exported = st.exportSaveFile(); st.flushSave();
    assert.equal(api.live.claimDaily('d_endless'), 0);
    assert.equal(st.importSaveFile(exported.text).ok, true);
    assert.deepEqual(clone(daily()), claimed); assert.equal(st.S.coins, coins);
    assert.equal(JSON.parse(storage.get(recoveryKey)).data.live.daily[0].prog, 60.02);
    assert.equal(st.importRecoveryInfo().invalid, undefined);
    assert.equal(st.load(), true); st.flushSave(); assert.deepEqual(clone(daily()), claimed);
    played(90.25); assert.deepEqual(clone(daily()), claimed, 'claimed order changed on later result');
    assert.equal(api.live.claimDaily('d_endless'), 0); assert.equal(st.S.coins, coins);
    const incoming = st.serializeState(); incoming.live.daily[0].prog = 150.25;
    st.replaceSaveData(incoming); assert.equal(daily().prog, 150.25); assert.equal(daily().claimed, true);
    assert.equal(st.restoreBeforeImport().ok, true); assert.deepEqual(clone(daily()), claimed); assert.equal(st.S.coins, coins);
    assert.equal(api.live.claimDaily('d_endless'), 0);
    st.flushSave();
  });

  test('旧档缺省字段仍补全，整数订单与其他经济字段仍按整数校验', () => {
    const old = fresh(); old.live.daily[0].prog = 59.98;
    delete old.live.daily[0].base; delete old.live.daily[0].claimed;
    delete old.live.daily[1].prog;
    const normalized = noSideEffects(() => st.normalizeSaveData(old));
    assert.equal(normalized.live.daily[0].prog, 59.98); assert.equal(normalized.live.daily[0].base, 0);
    assert.equal(normalized.live.daily[0].claimed, false); assert.equal(normalized.live.daily[1].prog, 0);
    assert.equal(st.importSaveFile(text(old)).ok, true); assert.equal(daily().prog, 59.98);
    st.flushSave();
  });

  const mutations = [
    ['score fractional prog', d => d.live.daily[1].prog = 120.25],
    ['stat fractional prog', d => d.live.daily[2].prog = 1.25],
    ['endless fractional base', d => d.live.daily[0].base = 0.25],
    ['score fractional base', d => d.live.daily[1].base = 0.25],
    ['stat fractional base', d => d.live.daily[2].base = 0.25],
    ['endless fractional need', d => d.live.daily[0].n = 60.25],
    ['score fractional need', d => d.live.daily[1].n = 120.25],
    ['stat fractional need', d => d.live.daily[2].n = 6.25],
    ['fractional coins', d => d.coins = 200.25],
    ...[-1, -0.01, '60.02', null, true, {}, [], NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1].map((value, index) =>
      ['invalid endless progress ' + index, d => d.live.daily[0].prog = value]),
  ];
  test('仅无尽进度允许小数，20 类非法字段在导入或云端替换前拒绝且保留当前进度', () => {
    fresh(); played(60.02); st.flushSave();
    for (const [label, mutate] of mutations) {
      const candidate = clone(st.S); mutate(candidate);
      noSideEffects(() => {
        assert.throws(() => format.validateSaveData(candidate), undefined, label);
        assert.throws(() => st.normalizeSaveData(candidate), undefined, label);
        assert.throws(() => st.replaceSaveData(candidate), undefined, label);
        assert.throws(() => st.previewSaveImport(text(candidate)), undefined, label);
        assert.equal(st.importSaveFile(text(candidate)).ok, false, label);
      });
      badCases++;
    }
  });

  test('非有限 JSON 数值和超过 2 MB 的文件仍拒绝且不会写入', () => {
    const raw = text(st.S), infinite = raw.replace('"prog":60.02', '"prog":1e999');
    assert.notEqual(infinite, raw);
    for (const source of [infinite, ' '.repeat(st.MAX_SAVE_BYTES + 1)]) {
      noSideEffects(() => {
        assert.throws(() => st.previewSaveImport(source));
        assert.equal(st.importSaveFile(source).ok, false);
      });
      badCases++;
    }
    assert.equal(JSON.parse(storage.get(key)).live.daily[0].prog, 60.02);
  });

  st.flushSave();
  console.log(JSON.stringify({ pass: true, checks, badCases, storage: 'in-memory only', renderer: false, productionModules: ['live/api.js', 'core/state.js', 'core/save-format.js'] }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
