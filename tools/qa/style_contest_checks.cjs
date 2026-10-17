// Real wardrobe callbacks + state/save modules; only graphics, UI and audio are substituted.
// No API process, database, inherited configuration, credentials or network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), THREE = require('three');
if (!vm.SourceTextModule) {
  const run = require('node:child_process').spawnSync(process.execPath,
    ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exit(run.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => assert.deepEqual(clone(a), clone(b));
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
async function main() {
  const storage = new Map(), modules = new Map(), timers = new Map(), writes = [], checks = [], messages = [];
  let serial = 0;
  class Element {
    constructor(tag, props = {}, children = []) { this.nodeType = 1; this.tag = tag; this.props = props; this.children = children.flat(Infinity).filter(v => v != null && v !== false); this.style = { setProperty() {} }; this.isConnected = true; }
    addEventListener(event, callback) { this.props['on' + event] = callback; }
    setAttribute(name, value) { this.props[name] = value; }
    replaceChildren(...children) { this.children = children.flat(Infinity).filter(v => v != null && v !== false); }
    append(...children) { this.children.push(...children); }
    get textContent() { return this.children.map(v => typeof v === 'object' ? v.textContent || '' : String(v)).join(''); }
  }
  const h = (tag, props, ...children) => new Element(tag, props, children);
  const document = { createElement: tag => h(tag, {}), createTextNode: value => ({ nodeType: 3, textContent: String(value) }) };
  const context = vm.createContext({ console, Date, Math, URLSearchParams, TextEncoder, performance, document, window: {},
    location: { search: '?slot=qa-style-contest-memory', protocol: 'http:', hostname: 'localhost' },
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    fetch() { throw new Error('Network forbidden'); },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); writes.push(key); }, removeItem: key => storage.delete(key) },
  });
  const app = {}, ui = { toast: text => messages.push(text), modal(body, options) {
    return { body, close() { body.isConnected = false; options.onClose?.(); } };
  } };
  const substitute = new Map([
    ['js/core/kit.js', { THREE, cbox() {}, box() {}, cyl() {}, frustum() {}, group() {}, mat() {}, glow() {} }],
    ['js/models/character.js', { Character: class {}, Momo: class {}, outfitToLook: value => ({ ...value }) }],
    ['js/core/app.js', { app }], ['js/core/audio.js', { audio: { sfx() {} } }],
    ['js/core/fx.js', { fx: { confetti() {}, sparkle() {} } }],
    ['js/core/icons.js', { clothIcon: id => id, coinIco: () => 'coin', icon() {} }],
    ['js/ui/ui.js', { ui, svg: () => h('svg', {}), priceTag() {} }],
    ['js/live/panels.js', { setEffectChip() {} }], ['js/live/api.js', { live: { project: () => ({ done: true }) } }],
  ]);
  const at = file => {
    if (!modules.has(file)) {
      const relative = path.relative(root, file).replace(/\\/g, '/'), replacement = substitute.get(relative);
      const source = relative === 'js/ui/wardrobe.js' && arg('--baseline') ? path.resolve(arg('--baseline')) : file;
      modules.set(file, replacement ? new vm.SyntheticModule(Object.keys(replacement), function () {
        for (const [name, value] of Object.entries(replacement)) this.setExport(name, value);
      }, { context, identifier: file }) : new vm.SourceTextModule(fs.readFileSync(source, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  };
  const entry = at(path.join(root, 'js/ui/wardrobe.js'));
  await entry.link((specifier, from) => at(path.resolve(path.dirname(from.identifier), specifier))); await entry.evaluate();
  const get = name => modules.get(path.join(root, name)).namespace;
  const state = get('js/core/state.js'), Wardrobe = entry.namespace.Wardrobe;
  const data = get('js/shared/clothing.js'), daily = get('js/shared/momo-fortune.js');
  const fresh = day => { state.resetSave(); state.flushSave(); state.load(); state.S.gday = day; state.flushSave(); return state.S; };
  const open = () => {
    const wardrobe = Object.create(Wardrobe.prototype);
    Object.assign(wardrobe, { active: true, mode: 'closet', el: { isConnected: true }, closing: false, saveIdentity: state.S,
      preview: { ...state.S.outfit }, char: { setLook() {} }, scene: new THREE.Scene(), twirl() {},
      renderGrid() {}, renderFoot() {}, renderStyles() {}, game: { busy: true } });
    wardrobe.game.wardrobe = wardrobe; app.view = wardrobe;
    const modal = wardrobe.contestPanel(); return { wardrobe, modal };
  };
  const find = (node, predicate) => node && typeof node === 'object' ? (predicate(node) ? node : node.children?.map(child => find(child, predicate)).find(Boolean)) : null;
  const button = (modal, needle) => {
    const value = find(modal.body, node => node.tag === 'button' && node.textContent.includes(needle));
    assert.ok(value, 'Missing button: ' + needle); return value;
  };
  const test = async (name, run) => { await run(); checks.push(name); console.log('PASS ' + name); };
  let report;
  if (process.argv.includes('--reproduce')) {
    const failures = [];
    for (const [day, id] of [[0, 'tea'], [1, 'forest'], [2, 'gala'], [3, 'harbor'], [4, 'bakery']]) {
      fresh(day);
      try { open(); failures.push({ id, error: null }); } catch (error) { failures.push({ id, error: error.message }); }
    }
    equal(failures.filter(item => item.error).map(item => item.id), ['forest', 'bakery']);
    for (const item of failures.filter(item => item.error)) assert.match(item.error, /color/);
    report = { pass: true, expectedFailureReproduced: true, failures, scope: 'Original wardrobe.contestPanel, five original town days, synthetic save + UI boundary.' };
  } else {
    const rules = get('js/shared/style-contest.js'), cloud = require(path.join(root, 'server/save-contract.js'));
    const stable = () => {
      const before = clone(state.serializeState()), exported = state.exportSaveFile().text, n = writes.length;
      state.previewSaveImport(exported); assert.equal(writes.length, n);
      assert.equal(state.importSaveFile(exported).ok, true); assert.equal(state.flushSave(), true); assert.equal(state.load(), true);
      equal(state.serializeState(), before); equal(cloud.validateCloudSave(before).data, before);
      return before;
    };
    const expectedThemes = [['tea', 'sweet', 'fresh'], ['forest', 'fresh', 'sweet'], ['gala', 'elegant', 'sweet'], ['harbor', 'cool', 'fresh'], ['bakery', 'sweet', 'fresh']];
    await test('五主题ID/顺序保持；主次风格都存在且有真实服饰，内容表不可变', () => {
      equal(rules.STYLE_CONTEST_THEMES.map(theme => [theme.id, theme.main, theme.sub]), expectedThemes);
      assert.equal(Object.isFrozen(rules.STYLE_CONTEST_THEMES), true);
      for (const theme of rules.STYLE_CONTEST_THEMES) {
        assert.equal(Object.isFrozen(theme), true); assert.notEqual(theme.main, theme.sub);
        for (const style of [theme.main, theme.sub]) {
          assert.ok(data.STYLES[style]?.name); assert.match(data.STYLES[style].color, /^#/);
          assert.ok(data.CLOTHES.some(item => item.style === style));
        }
      }
    });
    await test('镇历连续420天按原五主题顺序轮换，跨月/跨年和存档重载不重置轮次', () => {
      fresh(0);
      for (let day = 0; day < 420; day++) {
        state.S.gday = day; assert.equal(rules.styleContestTheme(state.S).id, expectedThemes[day % 5][0]);
        if ([6, 7, 69, 70, 83, 84, 365, 419].includes(day)) { const key = daily.dailyFunKey(state.S); stable(); assert.equal(daily.dailyFunKey(state.S), key); }
      }
      for (const bad of [undefined, null, -1, NaN, Infinity, 1.2, '4']) assert.equal(rules.styleContestTheme({ gday: bad }).id, 'tea');
    });
    await test('读取主题/评分/已领奖状态/推荐搭配不创建每日字段、不发金币、不写存储', () => {
      fresh(0); delete state.S.live.fun;
      const before = JSON.stringify(state.S), n = writes.length;
      rules.styleContestTheme(state.S); rules.scoreStyleContest(state.S); rules.autoStyleContestOutfit(state.S); assert.equal(rules.hasStyleContestReward(state.S), false);
      assert.equal(JSON.stringify(state.S), before); assert.equal(writes.length, n);
    });
    await test('默认满分出发无头背饰保持76分A/85奖金；普通和非经典斗篷固定加分不变', () => {
      fresh(0); equal(rules.scoreStyleContest(state.S), { pts: 76, mainCnt: 3, subCnt: 0, maxSet: 3, rank: 'A', reward: 85 });
      const original = clone(state.S); state.S.momoCloak = 'star';
      assert.equal(rules.scoreStyleContest(state.S).pts, 82); state.S.momoCloak = original.momoCloak;
    });
    await test('五主题评分数值与修前原评分函数2505组独立样本对照一致（仅两主题属性映射修正）', () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/style-contest-score-v3.json'), 'utf8').replace(/^\uFEFF/, ''));
      assert.equal(fixture.sourceSha256, '3d3feeb6b495c84dbb21e771cadb49d60c68d4290f451f25e60e6fa54b5bcbea');
      const oracle = vm.compileFunction('return (' + fixture.scoreFunction + ').call({preview});', ['S', 'CLOTH', 'CATS5', 'theme', 'preview'], { parsingContext: context });
      let seed = 94827;
      const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
      for (let day = 0; day < 5; day++) {
        fresh(day); state.S.owned = data.CLOTHES.map(item => item.id);
        const theme = rules.styleContestTheme(state.S);
        for (let n = 0; n < 501; n++) {
          const preview = Object.fromEntries(data.CATS.map(({ id }) => { const candidates = data.CLOTHES.filter(item => item.cat === id); return [id, candidates[random(candidates.length)].id]; }));
          state.S.momoCloak = n % 2 ? 'classic' : 'star';
          equal(rules.scoreStyleContest(state.S, preview), oracle(state.S, data.CLOTH, data.CATS.map(cat => cat.id), theme, preview));
        }
      }
    });
    await test('不评分未购试穿/不存在物品/错部位ID，空头背饰不占件数或套装分', () => {
      fresh(0); const original = rules.scoreStyleContest(state.S);
      const unowned = data.CLOTHES.find(item => item.cat === 'dress' && !state.S.owned.includes(item.id));
      equal(rules.scoreStyleContest(state.S, { ...state.S.outfit, dress: unowned.id }), original);
      equal(rules.scoreStyleContest(state.S, { ...state.S.outfit, hair: 'missing', dress: state.S.outfit.hair }), original);
      assert.equal(original.mainCnt, 3); assert.equal(original.maxSet, 3);
    });
    for (let day = 0; day < 5; day++) {
      const [id, mainStyle] = expectedThemes[day];
      await test(id + '实际面板打开、一键配装、评分与领奖闭环；重复/重开/存档回环不重复奖励', () => {
        fresh(day); state.S.owned = data.CLOTHES.map(item => item.id); const previousCoins = state.S.coins;
        const { wardrobe, modal } = open(); assert.equal(modal.body.props['data-style-contest-theme'], id);
        button(modal, '一键按主题').props.onclick();
        for (const cat of data.CATS) { const item = data.CLOTH[state.S.outfit[cat.id]]; assert.equal(item.cat, cat.id); assert.equal(item.style, mainStyle); }
        const score = rules.scoreStyleContest(state.S, wardrobe.preview); assert.equal(score.rank, 'S'); assert.equal(score.reward, 120);
        assert.ok(modal.body.textContent.includes(`S 级（${score.pts} 分）`));
        const claim = button(modal, '登台走秀'); claim.props.onclick();
        assert.equal(state.S.coins, previousCoins + 120); assert.equal(state.S.live.fun.used.styleContest, 1);
        const current = JSON.stringify(state.S); claim.props.onclick(); assert.equal(JSON.stringify(state.S), current);
        stable(); const reopened = open(); const got = button(reopened.modal, '今日已领奖'); assert.equal(got.props.disabled, true);
        got.props.onclick(); assert.equal(state.S.coins, previousCoins + 120);
      });
      await test(id + '只有旧免费初始服装也可评分配装领奖，不购买/赠送其他服饰', () => {
        fresh(day); const before = clone(state.S), { modal } = open();
        button(modal, '一键按主题').props.onclick(); equal(state.S.owned, before.owned);
        assert.equal(state.S.coins, before.coins); const score = rules.scoreStyleContest(state.S); assert.ok(['S', 'A', 'B'].includes(score.rank));
        button(modal, '登台走秀').props.onclick(); assert.equal(state.S.coins, before.coins + score.reward);
        equal(state.S.owned, before.owned); stable();
      });
    }
    await test('一键配装按主推、次选、已拥有首件降序回退；每一部位不足时保持合法旧搭配', () => {
      fresh(1); const second = data.CLOTHES.find(item => item.cat === 'dress' && item.style === 'sweet');
      state.S.owned = [...new Set([...state.S.owned, second.id])];
      const outfit = rules.autoStyleContestOutfit(state.S); assert.equal(outfit.dress, second.id);
      for (const cat of data.CATS) { assert.ok(state.S.owned.includes(outfit[cat.id])); assert.equal(data.CLOTH[outfit[cat.id]].cat, cat.id); }
      state.S.owned = ['a_none', 'b_none']; state.S.outfit = { acc: 'a_none', back: 'b_none' };
      const sparse = rules.autoStyleContestOutfit(state.S); assert.equal(sparse.acc, 'a_none'); assert.equal(sparse.back, 'b_none');
      assert.equal(rules.scoreStyleContest(state.S).pts, 6);
    });
    await test('旧档当日已领取true/1及既有truthy标记原样保留；缺字段/0/false可正常领一次', () => {
      for (const mark of [1, true, 'legacy-claimed']) {
        fresh(1); state.S.live.fun = { day: daily.dailyFunKey(state.S), used: { styleContest: mark, momoPet: 1, fortuneLv: '中吉' }, capsule: 2, extension: { keep: 7 } };
        const coins = state.S.coins; stable(); const before = JSON.stringify(state.S);
        const { modal } = open(); button(modal, '今日已领奖').props.onclick();
        assert.equal(state.S.coins, coins); assert.equal(JSON.stringify(state.S), before); assert.equal(state.S.live.fun.used.styleContest, mark);
      }
      for (const mark of [undefined, 0, false]) {
        fresh(4); state.S.live.fun = { day: daily.dailyFunKey(state.S), used: {}, capsule: 0 }; if (mark !== undefined) state.S.live.fun.used.styleContest = mark;
        const { modal } = open(), coins = state.S.coins, reward = rules.scoreStyleContest(state.S).reward;
        button(modal, '登台走秀').props.onclick(); assert.equal(state.S.coins, coins + reward); stable();
        assert.equal(rules.claimStyleContest(state.S, state.S.outfit, daily.dailyFunKey(state.S)).ok, false);
      }
    });
    await test('跨镇日旧模态无法自动配装或领奖；重新打开的次日主题仍能正常领一次', () => {
      fresh(0); const { modal } = open(), coins = state.S.coins, outfit = clone(state.S.outfit);
      const auto = button(modal, '一键按主题'), claim = button(modal, '登台走秀'); state.S.gday = 1;
      auto.props.onclick(); claim.props.onclick(); equal(state.S.outfit, outfit); assert.equal(state.S.coins, coins); assert.equal(state.S.live.fun?.used?.styleContest, undefined);
      const next = open(); assert.equal(next.modal.body.props['data-style-contest-theme'], 'forest');
      const score = rules.scoreStyleContest(state.S); button(next.modal, '登台走秀').props.onclick(); assert.equal(state.S.coins, coins + score.reward); stable();
    });
    await test('上一日已领标记不挡新镇日；领奖只刷新每日账本，保留非每日扩展与其他玩法', () => {
      fresh(0); state.S.live.fun = { day: daily.dailyFunKey(state.S), used: { styleContest: 1, momoPet: 1, fortuneLv: '大吉' }, capsule: 3, extension: 29 };
      const coins = state.S.coins; state.S.gday = 1;
      const snapshot = JSON.stringify(state.S); assert.equal(rules.hasStyleContestReward(state.S), false); open(); assert.equal(JSON.stringify(state.S), snapshot);
      const { modal } = open(); button(modal, '登台走秀').props.onclick();
      assert.equal(state.S.live.fun.day, daily.dailyFunKey(state.S)); equal(state.S.live.fun.used, { styleContest: 1 });
      assert.equal(state.S.live.fun.extension, 29); assert.equal(state.S.live.fun.capsule, 0); assert.equal(state.S.coins, coins + 55); stable();
    });
    await test('已关闭/已替换模态、离开衣橱、换存档、后台会话均阻止陈旧按钮写入', () => {
      for (const mode of ['closed', 'superseded', 'inactive', 'replaced-save', 'wrong-view', 'disconnected']) {
        fresh(2); const { wardrobe, modal } = open(), auto = button(modal, '一键按主题'), claim = button(modal, '登台走秀');
        if (mode === 'closed') modal.close();
        if (mode === 'superseded') wardrobe.contestPanel();
        if (mode === 'inactive') wardrobe.active = false;
        if (mode === 'replaced-save') state.replaceSaveData(clone(state.S));
        if (mode === 'wrong-view') app.view = {};
        if (mode === 'disconnected') wardrobe.el.isConnected = false;
        const before = JSON.stringify(state.S), n = writes.length; auto.props.onclick(); claim.props.onclick();
        assert.equal(JSON.stringify(state.S), before, mode); assert.equal(writes.length, n, mode);
      }
    });
    await test('领奖点击时实时评审实际衣服，不使用之前渲染时的旧分数', () => {
      fresh(0); state.S.owned = data.CLOTHES.map(item => item.id);
      const { wardrobe, modal } = open(), claim = button(modal, '登台走秀'), coins = state.S.coins;
      wardrobe.preview = { ...rules.autoStyleContestOutfit(state.S) }; const current = rules.scoreStyleContest(state.S, wardrobe.preview);
      assert.equal(current.rank, 'S'); claim.props.onclick(); assert.equal(state.S.coins, coins + 120);
    });
    await test('已有金币/服饰ID/家具布局/种子/商店/任务/吉签与摸摸/每日次数完整往返，仅增加当次奖金与styleContest', () => {
      fresh(4); const sample = clone(state.S); sample.coins = 54321; sample.seeds.wheat = 7; sample.stats.plays = 12; sample.ach.a_work1 = 1; sample.decor.bench = 2;
      sample.placedIn = [{ id: 'bench', gx: 5, gz: 5, rot: 0 }];
      sample.live.fun = { day: daily.dailyFunKey(sample), used: { momoPet: 1, fortuneLv: '中吉', fortune: 1, music: 1, fishing: 1 }, capsule: 2 };
      sample.live.market = { week: '2026-W42', orders: [{ id: 'mk_work', stat: 'plays', base: 10, need: 5, coins: 120, claimed: true }] };
      sample.live.welcome = { date: '2026-10-17', claimed: true, coins: 80, seedId: 'wheat' }; sample.futureExtension = { preserved: true };
      state.replaceSaveData(sample); const before = clone(state.serializeState()), reward = rules.scoreStyleContest(state.S).reward;
      const { modal } = open(); button(modal, '登台走秀').props.onclick(); const after = stable();
      assert.equal(after.coins, before.coins + reward); assert.equal(after.live.fun.used.styleContest, 1);
      delete after.live.fun.used.styleContest; after.coins = before.coins;
      // addCoins intentionally updates earned statistics as before, without touching gameplay counters.
      equal(after.stats, { ...before.stats, earned: (before.stats.earned || 0) + reward });
      after.stats = before.stats; equal(after, before);
    });
    report = { pass: true, checks: checks.length, names: checks,
      scope: 'Actual Wardrobe panel callbacks + pure style-contest rules + real in-memory import/export/reload + shared cloud validator; graphics/audio/UI substituted. No API/database/network/payment.' };
  }
  report.timestamp = new Date().toISOString(); report.writes = writes.length;
  const reportOut = arg('--out') || (process.env.LIVE_QA_OUT ? path.join(process.env.LIVE_QA_OUT, 'style-contest-report.json') : null);
  if (reportOut) { const out = path.resolve(reportOut); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' }); }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
