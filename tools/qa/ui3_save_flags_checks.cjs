// Pure graphics + actual import/export/load + shared cloud validator; no API/DB/network.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
if (!vm.SourceTextModule) { const child = require('node:child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true }); process.exit(child.status ?? 1); }
const { memoryHarness } = require('./ui3_memory_harness.cjs');
async function main() {
  const slot = 'qa-ui3-save-flags-memory', key = 'nikki-block-town-save-v1:' + slot;
  const h = await memoryHarness(['js/core/state.js'], slot), state = h.get('js/core/state.js'), format = h.get('js/core/save-format.js'), graphics = h.get('js/core/graphics-settings.js');
  const cloud = require(path.join(h.root, 'server/save-contract.js')), clone = value => JSON.parse(JSON.stringify(value)), checks = []; let badCases = 0;
  const equal = (a, b) => assert.deepEqual(clone(a), clone(b));
  const fresh = () => { state.resetSave(); state.S.coins = 54321; state.S.seeds.radish = 3; state.S.stats.fertilizer = 5; state.S.live.fun.used = { fortune: 1, fortuneLv: '中吉', momoPet: 1 }; state.flushSave(); return clone(state.S); };
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  const noSideEffects = run => { const current = JSON.stringify(state.S), stored = JSON.stringify([...h.storage]), writes = h.writes.length; const value = run(); assert.equal(JSON.stringify(state.S), current); assert.equal(JSON.stringify([...h.storage]), stored); assert.equal(h.writes.length, writes); return value; };
  const preservedGameplay = (a, b) => { const left = clone(a), right = clone(b); delete left.settings; delete right.settings; equal(left, right); };
  await test('旧档缺少showFps按隐藏归一化，纯预览/云校验不擅自新增字段或改玩家进度', () => {
    const old = fresh(); delete old.settings.showFps; const before = JSON.stringify(old);
    assert.equal(graphics.normalizeGraphicsSettings(old.settings).showFps, false);
    const validated = noSideEffects(() => format.validateSaveData(old)); assert.equal(Object.hasOwn(validated.settings, 'showFps'), false);
    const checked = noSideEffects(() => cloud.validateCloudSave(old)); assert.equal(Object.hasOwn(checked.data.settings, 'showFps'), false);
    noSideEffects(() => state.previewSaveImport(JSON.stringify(old))); const next = noSideEffects(() => state.normalizeSaveData(old));
    assert.equal(next.settings.showFps, false); preservedGameplay(next, old); assert.equal(JSON.stringify(old), before);
  });
  await test('合法true/false/1/0保留原始契约，迁移仅规范成布尔且不改变经济/衣橱/吉签', () => {
    for (const value of [false, true, 0, 1]) {
      const data = fresh(); data.settings.showFps = value; const before = JSON.stringify(data);
      const validated = noSideEffects(() => format.validateSaveData(data)); assert.equal(validated.settings.showFps, value);
      const checked = noSideEffects(() => cloud.validateCloudSave(data)); assert.equal(checked.data.settings.showFps, value);
      const normalized = noSideEffects(() => state.normalizeSaveData(data)); assert.equal(normalized.settings.showFps, value === true || value === 1);
      preservedGameplay(normalized, data); assert.equal(JSON.stringify(data), before);
    }
  });
  await test('设置开关经实际替换/落盘/加载/UTF8导出导入重载完整持久化且不重复发奖', () => {
    for (const value of [true, false, 1, 0]) {
      const original = fresh(); original.settings.showFps = value; state.replaceSaveData(original); state.flushSave();
      assert.equal(state.S.settings.showFps, !!value); assert.equal(state.load(), true); assert.equal(state.S.settings.showFps, !!value);
      const exported = noSideEffects(() => state.exportSaveFile()); const coins = state.S.coins, fertilizer = state.S.stats.fertilizer;
      const parsed = noSideEffects(() => format.parseSaveFile('\uFEFF' + exported.text)); assert.equal(parsed.data.settings.showFps, !!value);
      assert.equal(state.importSaveFile(exported.text).ok, true); state.flushSave(); assert.equal(state.load(), true);
      assert.equal(state.S.settings.showFps, !!value); assert.equal(state.S.coins, coins); assert.equal(state.S.stats.fertilizer, fertilizer); preservedGameplay(state.serializeState(), original);
      assert.equal(JSON.parse(h.storage.get(key)).settings.showFps, !!value);
    }
  });
  await test('历史本地原档缺省showFps可以直接启动，新增false不改存档位置或原有进度', () => {
    const old = fresh(); delete old.settings.showFps; h.storage.set(key, JSON.stringify(old));
    assert.equal(state.load(), true); assert.equal(state.S.settings.showFps, false); assert.equal(state.S.coins, 54321); state.flushSave();
    assert.equal(JSON.parse(h.storage.get(key)).settings.showFps, false); assert([...h.storage.keys()].every(name => name.startsWith(key)));
  });
  await test('坏showFps被客户端/导入/纯云契约一致拒绝，当前状态和磁盘不被覆盖', () => {
    for (const value of ['true', 'false', 2, -1, null, {}, [], .5]) {
      fresh(); const bad = clone(state.S); bad.settings.showFps = value;
      noSideEffects(() => assert.throws(() => format.validateSaveData(bad), /showFps/));
      noSideEffects(() => assert.throws(() => cloud.validateCloudSave(bad), /showFps/));
      noSideEffects(() => assert.throws(() => state.previewSaveImport(JSON.stringify(bad)), /showFps/));
      noSideEffects(() => assert.throws(() => state.replaceSaveData(bad), /showFps/));
      const before = JSON.stringify(state.S), stored = JSON.stringify([...h.storage]); assert.equal(state.importSaveFile(JSON.stringify(bad)).ok, false); assert.equal(JSON.stringify(state.S), before); assert.equal(JSON.stringify([...h.storage]), stored); badCases++;
    }
  });
  await test('FPS显示与帧率上限/画质/抗锯齿/扩展偏好独立，跨端读取不改原设置', () => {
    for (const fpsLimit of graphics.FPS_LIMITS) {
      const data = { fpsLimit, quality: 'high', qualityExplicit: false, showFps: 1, renderScale: 1.25, antiAlias: 'msaa4', adaptiveQuality: false, extension: { kept: true } }; const before = JSON.stringify(data);
      const normalized = graphics.normalizeGraphicsSettings(data); assert.equal(normalized.showFps, true); assert.equal(normalized.fpsLimit, fpsLimit); equal(normalized.extension, data.extension);
      assert.equal(graphics.effectiveQuality(data, true), 'mid'); assert.equal(graphics.effectiveFpsLimit(data, true), fpsLimit === 'unlimited' ? 'auto' : fpsLimit); assert.equal(graphics.effectiveFpsLimit(data, false), fpsLimit);
      assert.equal(graphics.resolveAntiAlias(data, true, 'mid', 0).mode, 'fxaa'); assert.equal(JSON.stringify(data), before);
    }
  });
  const report = { pass: true, checks: checks.length, malformedFlagCases: badCases, names: checks, scope: 'actual graphics/state/file import/export/load and shared cloud contract; synthetic in-memory storage only; no API/database/network/payment' };
  const index = process.argv.indexOf('--out'); if (index >= 0) { const file = path.resolve(process.argv[index + 1]); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
