// 真实存档模块的纯内存故障注入；不读写玩家存档。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const r = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
async function main() {
  const root = path.resolve(__dirname, '../..'), storage = new Map(), writes = [];
  const key = 'nikki-block-town-save-v1:qa-transfer-memory', backup = key + ':bak', recovery = key + ':before-import';
  let reject = () => false;
  const context = vm.createContext({ console, Date, TextEncoder, URLSearchParams, performance, setTimeout, clearTimeout,
    location: { search: '?slot=qa-transfer-memory' }, localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, value) => { if (reject(k, value)) { const e = new Error('simulated quota'); e.name = 'QuotaExceededError'; throw e; } storage.set(k, value); writes.push(k); },
      removeItem: (k) => { if (reject(k)) throw new Error('simulated remove'); storage.delete(k); },
    },
  });
  const mods = new Map();
  function moduleAt(file) { if (!mods.has(file)) mods.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file })); return mods.get(file); }
  const stmod = moduleAt(path.join(root, 'js/core/state.js'));
  await stmod.link((specifier, from) => moduleAt(path.resolve(path.dirname(from.identifier), specifier)));
  await stmod.evaluate(); const st = stmod.namespace;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const fresh = () => { reject = () => false; st.resetSave(); st.flushSave(); return clone(st.S); };
  const string = (v) => JSON.stringify(v), read = (k) => JSON.parse(storage.get(k));
  let count = 0; const pass = (name) => { count++; console.log('PASS ' + name); };
  let d = fresh(); st.S.coins = 321;
  const out = st.exportSaveFile(new Date(2026, 9, 9, 12, 34, 56).getTime());
  assert.match(out.filename, /2026-10-09_12-34-56\.txt$/); assert.equal(JSON.parse(out.text).data.coins, 321); assert.equal(read(key).coins, 200);
  pass('导出包含未延迟落盘的最新内存，文件名带当地日期，导出不写存档');
  const before = string(st.S), beforeWrites = writes.length;
  const preview = st.previewSaveImport(out.text);
  assert.equal(preview.summary.coins, 321); assert.equal(string(st.S), before); assert.equal(writes.length, beforeWrites);
  pass('文件预览无状态、奖励或存储副作用');

  fresh(); st.S.futureHistory = Array(80000).fill('abcdefghijklmnopqrst');
  const compact = st.exportSaveFile(); assert.ok(Buffer.byteLength(compact.text) <= st.MAX_SAVE_BYTES); assert.equal(st.previewSaveImport(compact.text).summary.coins, 200);
  st.S.futureHistory = Array(120).fill('x'.repeat(20000)); assert.throws(() => st.exportSaveFile(), /超过 2 MB/);
  const oversizedOld = string(st.S), oversizedWrites = writes.length; assert.equal(st.importSaveFile(out.text).ok, false); assert.equal(string(st.S), oversizedOld); assert.equal(writes.length, oversizedWrites);
  pass('大存档导出去缩进后仍可导入，超上限不生成无法回读的文件');

  d = fresh(); d.v = 1; d.coins = 987; d.placed = [{id:'bench',gx:1,gz:1,rot:0}]; d.floor = {'100,100':'wood'}; d.plots = [{crop:'radish',t0:1800000000000,dur:15000.6,watered:true}];
  delete d.live; delete d.seeds; delete d.ach; delete d.yardLv; d.shops.cafe = {lv:3,plays:10};
  const old = string(d); assert.equal(st.previewSaveImport(old).migrated, true);
  assert.equal(st.importSaveFile(old).ok, true); assert.equal(st.S.v, 3); assert.equal(st.S.coins, 987); assert.equal(st.S.decor.bench, 1);
  assert.equal(st.S.farm['3,9'].dur, 15000.6); assert.equal(st.S.shops.cafe.best, 0); assert.equal(st.S.shops.cafe.lv, 3); assert.ok(st.S.live.book);
  pass('有效v1旧档复用真实迁移，家具回仓/农田保留/店铺缺省补全/成就兼容');

  const mutations = [
    ['金币类型',d=>d.coins='20'],['金币负数',d=>d.coins=-1],['未来版本',d=>d.v=4],['服饰列表',d=>d.owned={}],
    ['服饰部位',d=>d.outfit.hair='d_reunion'],['家具列表',d=>d.placed=[null]],['家具坐标',d=>d.placed[0].gx=-1],['家具旋转',d=>d.placed[0].rot=9],
    ['房屋级别',d=>d.house=9],['后院级别',d=>d.yardLv=0],['店铺对象',d=>d.shops.cafe=null],['店铺等级',d=>d.shops.fish.lv=99],['店铺星数',d=>d.shops.cafe.stars={1:5}],
    ['地板',d=>d.floor={'0,0':'no-such-floor'}],['越界地板',d=>d.floorIn={'22,0':'wood'}],['重复坐标地板',d=>d.floor={'01,1':'wood'}],['家具过多',d=>d.placedIn=Array(331).fill({id:'bench',gx:1,gz:1,rot:0})],['农田',d=>d.farm={'3,9':{crop:'missing',t0:1,dur:100}}],['零时长作物',d=>d.farm={'3,9':{crop:'radish',t0:1,dur:0}}],
    ['图鉴嵌套',d=>d.live.book.fish=[]],['订单嵌套',d=>d.live.daily=[null]],['居民历史',d=>d.live.residents.reviews=[{day:'1',lines:null}]],
    ['居民任务',d=>d.live.residents.tasks={he:{base:null}}],['亲密礼物',d=>d.live.nonoy.got={}],['进度对象',d=>d.live.project=[]],
    ['玩家统计',d=>d.stats.plays=-1],['委托索引',d=>d.req={man:{i:-2}}],['NPC套装',d=>d.npc._sets={}],['上班穿搭',d=>d.work={cafe:null}],
    ['剧情数据',d=>d.live.story.he={}],['来访零件',d=>d.live.canon.v={day:'x',gear:{spots:[],got:[0]}}],
    ['布局区域',d=>d.decorLayouts={home:[{version:1,zone:'house',name:'家',placed:[],floor:{}}]}],
    ['共同事件',d=>d.live.companion={version:1,events:{tea:{status:'oops',startedDay:0}}}],
    ['工程类型',d=>d.live.community={version:1,projects:{garden:{phase:7,paid:0}}}],
  ];
  for (const [label, mutate] of mutations) {
    d=fresh();mutate(d);const previous=string(st.S),raw=storage.get(key),n=writes.length;
    assert.throws(()=>st.previewSaveImport(string(d)),undefined,label);
    assert.equal(st.importSaveFile(string(d)).ok,false,label);assert.equal(string(st.S),previous,label);assert.equal(storage.get(key),raw,label);assert.equal(writes.length,n,label);
  }
  pass(`${mutations.length}类重要嵌套坏数据在写入前拒绝，旧内存和主档不变`);
  const badTexts = ['{}','[]','not json',JSON.stringify({format:'other',formatVersion:1,data:fresh()}),JSON.stringify({format:'nikki-block-town-save',formatVersion:2,data:fresh()}),'{"coins":1e999}',string(fresh()).replace('"coins":200','"__proto__":{"oops":1},"coins":200'),' '.repeat(2*1024*1024+1)];
  for (const text of badTexts) assert.throws(()=>st.previewSaveImport(text));
  let deep={};for(let i=0;i<30;i++)deep={a:deep};d=fresh();d.extra=deep;assert.throws(()=>st.previewSaveImport(string(d)));
  pass('大小限制、错误格式/包装版本、特殊字段、非有限数值、超深结构均拒绝');

  d=fresh();d.coins=4321;d.gday=99;d.house=3;d.shops.cafe.stage=8;d.settings.futureSwitch={on:true};d.futureNotes={list:['保留扩展']};
  d.decorLayouts={house:[null,null,null],home:[{version:1,zone:'home',name:'春日',placed:[{id:'plot',gx:3,gz:9,rot:0}],floor:{'1,1':'wood'}},null,null],build:[null,null,null]};
  d.live.companion={version:1,events:{tea:{status:'done',startedDay:2,doneDay:3},corner:{status:'active',startedDay:4,placed:[{id:'bench',gx:1,gz:1,rot:0}]}}};
  d.live.community={version:1,projects:{garden:{phase:1,paid:120,finishedDay:1},shore:{phase:0,paid:0}}};
  d.farm={'3,9':{crop:'radish',t0:1800000000000,dur:12345.678,watered:true}};
  assert.equal(st.importSaveFile(string(d)).ok,true);assert.deepEqual(clone(st.S.decorLayouts),d.decorLayouts);assert.deepEqual(clone(st.S.live.companion),d.live.companion);assert.deepEqual(clone(st.S.live.community),d.live.community);assert.deepEqual(clone(st.S.futureNotes),d.futureNotes);
  const exp=st.exportSaveFile();assert.equal(st.previewSaveImport('\uFEFF'+exp.text).summary.coins,4321);
  pass('完整往返保留装修方案/共同事件/工程/有效扩展字段/浇水后小数时长，支持BOM');

  // TXT 是 JSON 内容的 UTF-8 纯文本；旧版 JSON 包装仍可读取。
  fresh(); st.S.coins = 2468;
  const txt = st.exportSaveFile().text;
  assert.match(st.exportSaveFile().filename, /\.txt$/);
  assert.equal(st.previewSaveImport(txt).summary.coins, 2468);
  assert.equal(st.previewSaveImport('\uFEFF' + txt).summary.coins, 2468);
  const legacyJson = JSON.stringify(st.S);
  assert.equal(st.previewSaveImport(legacyJson).summary.coins, 2468);
  pass('UTF-8 TXT 导出可预览并支持 BOM，旧版裸 JSON 仍可导入');

  d=fresh();d.coins=999;st.S.coins=777;const previousRaw=storage.get(key);assert.equal(read(key).coins,200);
  assert.equal(st.importSaveFile(string(d)).ok,true);assert.equal(read(recovery).data.coins,777);assert.equal(read(key).coins,999);assert.equal(st.S.coins,999);
  st.flushSave();assert.equal(read(key).coins,999);const protectedRaw=storage.get(recovery);st.autosave();assert.equal(storage.get(recovery),protectedRaw);assert.equal(read(backup).coins,999);
  assert.equal(st.restoreBeforeImport().ok,true);assert.equal(st.S.coins,777);st.flushSave();assert.equal(read(key).coins,777);assert.equal(storage.get(recovery),protectedRaw);
  pass('独立恢复点捕获最新内存；导入同步S、防pagehide覆盖；自动备份不覆盖恢复点且可恢复');

  for (const which of ['recovery','primary','restore']) {
    fresh();st.S.coins=222;const prevS=string(st.S),prevRaw=storage.get(key),prevRecovery=storage.get(recovery);d=clone(st.S);d.coins=888;
    reject=(k)=>which==='recovery'?k===recovery:k===key;
    const r=which==='restore'?st.restoreBeforeImport():st.importSaveFile(string(d));assert.equal(r.ok,false,which);
    assert.equal(string(st.S),prevS,which);assert.equal(storage.get(key),prevRaw,which);assert.equal(storage.get(recovery),prevRecovery,which);
  }
  reject=()=>false;pass('恢复点写入失败/主档写入失败/恢复失败均保持旧S与主档，失败导入还原旧恢复点');
  const raw=storage.get(key),prev=string(st.S);storage.set(recovery,'{bad');assert.equal(st.importRecoveryInfo().invalid,true);assert.equal(st.restoreBeforeImport().ok,false);assert.equal(storage.get(key),raw);assert.equal(string(st.S),prev);
  pass('损坏恢复点不可恢复且不影响当前进度');
  console.log(JSON.stringify({pass:true,checks:count,badNestedCases:mutations.length,storage:'in-memory only'}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
