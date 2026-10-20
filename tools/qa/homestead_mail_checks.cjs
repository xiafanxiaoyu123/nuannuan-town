// Real local API + workbench field logic. Only an OS-whitelisted child opens a new temporary SQLite file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { fork } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const project = path.resolve(__dirname, '../..');

async function childChecks() {
  const temporary = path.resolve(process.env.DATA_DIR || '');
  assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir()));
  assert(path.basename(temporary).startsWith('nuannuan-homestead-mail-'));
  assert.equal(process.env.AUTH_DB, path.join(temporary, 'isolated.sqlite'));
  assert.equal(process.env.PAYMENT_CHECKOUT_ENABLED, '0');
  const { handleApi } = require('../../server/auth-api');
  const { DEFAULT_OUTFIT } = require('../../js/shared/clothing.js');
  const rules = require('../../js/shared/homestead.js');
  const { validateSaveData } = require('../../js/core/save-format.js');
  const checks = [], server = http.createServer((req, res) => Promise.resolve(handleApi(req, res)).catch(error => res.writeHead(500).end(JSON.stringify({ error: error.message }))));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const key = prefix => `${prefix}_${randomUUID().replace(/-/g, '')}`;
  const admin = { 'X-Admin-Token': process.env.ADMIN_API_TOKEN };
  const call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const expect = (r, code) => { assert.equal(r.status, code, JSON.stringify(r.body)); return r.body; };
  const group = async (name, fn) => { await fn(); checks.push(name); };
  const fixture = { v: 3, started: true, coins: 100, owned: Object.values(DEFAULT_OUTFIT), outfit: { ...DEFAULT_OUTFIT }, shops: {}, seeds: {}, crops: {}, decor: {}, placed: [], placedIn: [], house: 1, yardLv: 1, gday: 1, live: { kitchen: { strawberry_tart: 3 } } };
  let player, accountId, catalog, template;
  const read = async () => expect(await call('/api/save', 'GET', undefined, player), 200);
  const direct = (ops, revision, idempotencyKey = key('gift')) => call(`/api/admin/accounts/${accountId}/gift`, 'POST', { ops, baseRevision: revision, idempotencyKey }, admin);
  const publish = async (ops, label) => expect(await call('/api/admin/mail', 'POST', { kind: 'gift', audience: 'user', targetUserId: accountId, title: label, body: '隔离合成资料，不投递真实账号', ops, idempotencyKey: key('mail') }, admin), 201).message.id;
  const claim = (id, revision, idempotencyKey = key('claim')) => call(`/api/mail/${id}/claim`, 'POST', { baseRevision: revision, idempotencyKey }, player);
  try {
    const registered = await call('/api/auth/register', 'POST', { username: 'homestead_synthetic', password: key('password') });
    accountId = expect(registered, 201).user.id; player = { Cookie: registered.headers.get('set-cookie').split(';')[0] };
    expect(await call('/api/save', 'PUT', { baseRevision: 0, data: fixture }, player), 200);
    await group('catalog has 17 pantry resources, all 78 dish keys and twelve ranch facilities', async () => {
      catalog = expect(await call('/api/admin/gift-catalog', 'GET', undefined, admin), 200);
      assert.equal(catalog.pantry.length, 17); assert.equal(catalog.dishes.length, 78);
      assert.deepEqual(catalog.pantry.map(v => v.id).sort(), Object.keys(rules.PANTRY).sort());
      for (const dish of catalog.dishes) { assert(rules.parseDishKey(dish.id)); assert(dish.name.includes(' · ')); }
      assert.equal(new Set(catalog.dishes.map(v => v.id)).size, 78);
      assert.equal(catalog.decor.filter(v=>v.id.startsWith('ranch_')).length,12);
      assert.equal((await call('/api/admin/gift-catalog')).status, 401);
    });
    await group('direct gift initializes old save, preserves history and never issues tutorial or historical dishes', async () => {
      const before = await read(), ops = [{ type: 'coins', amount: 20 }, { type: 'pantry', items: { egg: 3, milk: 2 } }, { type: 'dishes', items: { 'egg_custard:normal:plain': 2, 'pumpkin_soup:fine:milky': 1 } }], requestKey = key('direct');
      expect(await direct(ops, before.revision, requestKey), 200);
      const after = await read(); assert.equal(after.revision, before.revision + 1); assert.equal(after.data.coins, 120);
      assert.deepEqual(after.data.homestead.pantry, { egg: 3, milk: 2 });
      assert.deepEqual(after.data.homestead.dishes, { 'egg_custard:normal:plain': 2, 'pumpkin_soup:fine:milky': 1 });
      assert.equal(after.data.homestead.history.strawberry_tart, 3); assert.equal(after.data.live.kitchen.strawberry_tart, 3);
      assert.equal(after.data.homestead.tutorial, false); assert.equal(after.data.homestead.animals.length, 0);
      assert.equal(expect(await direct(ops, before.revision, requestKey), 200).idempotent, true);
      assert.deepEqual(await read(), after); validateSaveData(after.data);
    });
    await group('invalid and cross-category IDs, unsupported variants and missing or stale revisions are rejected atomically', async () => {
      const before = await read();
      for (const op of [
        { type: 'dishes', items: { 'egg_custard:normal:milky': 1 } },
        { type: 'dishes', items: { 'unknown:fine:plain': 1 } },
        { type: 'dishes', items: { 'egg_custard:legendary:plain': 1 } },
        { type: 'dishes', items: { 'egg_custard:normal:plain:extra': 1 } },
        { type: 'pantry', items: { constructor: 1 } },
        { type: 'crops', items: { 'egg_custard:normal:plain': 1 } },
        { type: 'pantry', items: { egg: 1000000 } },
      ]) expect(await direct([{ type: 'coins', amount: 5 }, op], before.revision), 400);
      expect(await direct([{ type: 'pantry', items: { egg: 1 } }], undefined), 400);
      expect(await direct([{ type: 'pantry', items: { egg: 1 } }], before.revision - 1), 409);
      assert.deepEqual(await read(), before);
    });
    await group('templates round-trip all legitimate dish variants and single mail claim is exactly once', async () => {
      const ops = [{ type: 'pantry', items: Object.fromEntries(catalog.pantry.filter(d=>!['egg','milk'].includes(d.id)).map(d=>[d.id,1])) }, { type: 'dishes', items: Object.fromEntries(catalog.dishes.map(d => [d.id, 1])) }];
      template = expect(await call('/api/admin/gift-templates', 'POST', { name: '牧场厨房完整目录', description: '全部合法品质与变体', ops }, admin), 201).template;
      assert.deepEqual(template.ops, ops);
      const listed = expect(await call('/api/admin/gift-templates', 'GET', undefined, admin), 200).templates.find(v => v.id === template.id); assert.deepEqual(listed.ops, ops);
      const id = await publish(listed.ops, '合法目录附件'), before = await read(), requestKey = key('single');
      expect(await claim(id, before.revision - 1), 409); assert.deepEqual(await read(), before);
      const result = expect(await claim(id, before.revision, requestKey), 200); assert.equal(result.save.pantryTotal, 20); assert.equal(result.save.dishesTotal, 81);
      const after = await read(); assert.equal(after.revision, before.revision + 1);
      for (const entry of catalog.dishes) assert(after.data.homestead.dishes[entry.id] >= 1);
      assert.equal(expect(await claim(id, before.revision, requestKey), 200).idempotent, true); assert.deepEqual(await read(), after);
    });
    await group('batch mail claim adds pantry and dishes once with one cloud revision and readable admin summary', async () => {
      await publish([{ type: 'pantry', items: { egg: 2 } }], '鸡蛋附件');
      await publish([{ type: 'dishes', items: { 'milk_pudding:tasty:plain': 2 } }], '布丁附件');
      const before = await read(), body = { baseRevision: before.revision, idempotencyKey: key('batch') };
      const result = expect(await call('/api/mail/claim-all', 'POST', body, player), 200); assert.equal(result.count, 2); assert.equal(result.revision, before.revision + 1);
      const after = await read(); assert.equal(after.data.homestead.pantry.egg, before.data.homestead.pantry.egg + 2); assert.equal(after.data.homestead.dishes['milk_pudding:tasty:plain'], before.data.homestead.dishes['milk_pudding:tasty:plain'] + 2);
      assert.equal(expect(await call('/api/mail/claim-all', 'POST', body, player), 200).idempotent, true); assert.deepEqual(await read(), after);
      const detail = expect(await call(`/api/admin/accounts/${accountId}`, 'GET', undefined, admin), 200);
      assert.equal(detail.save.pantryTotal, 22); assert.equal(detail.save.dishesTotal, 83); assert.equal(detail.save.ranchAnimals, 0); assert.equal(detail.save.placedDishes, 0);
      assert.deepEqual(detail.save.data.homestead, after.data.homestead);
    });
    await group('direct, single and batch overflow reject whole award including coins and keep mail unclaimed', async () => {
      let before = await read(), data = JSON.parse(JSON.stringify(before.data));
      data.homestead.pantry.egg = 999999; data.homestead.dishes['egg_custard:normal:plain'] = 999999;
      expect(await call('/api/save', 'PUT', { baseRevision: before.revision, data }, player), 200); before = await read();
      const overflow = [{ type: 'coins', amount: 17 }, { type: 'pantry', items: { egg: 1 } }];
      assert.equal(expect(await direct(overflow, before.revision), 409).code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual(await read(), before);
      const single = await publish([{ type: 'coins', amount: 19 }, { type: 'dishes', items: { 'egg_custard:normal:plain': 1 } }], '料理溢出测试');
      assert.equal(expect(await claim(single, before.revision), 409).code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual(await read(), before);
      await publish([{ type: 'pantry', items: { milk: 2 } }], '另一封应一起回滚');
      assert.equal(expect(await call('/api/mail/claim-all', 'POST', { baseRevision: before.revision, idempotencyKey: key('overflow') }, player), 409).code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual(await read(), before);
      const mailbox = expect(await call('/api/mail', 'GET', undefined, player), 200); assert.equal(mailbox.messages.filter(m => !m.claimedAt).length, 2);
      assert.equal(createHash('sha256').update(JSON.stringify(before.data)).digest('hex'), before.checksum);
    });
    await group('workbench fields and template import preserve colon IDs, preview quantities and removal semantics', async () => {
      const src = fs.readFileSync(path.join(project, 'site/admin/admin.js'), 'utf8');
      const fn = name => { const start = src.indexOf(`  function ${name}(`), next = src.indexOf('\n  function ', start + 1); assert(start >= 0); return src.slice(start, next < 0 ? undefined : next); };
      const elements = new Map(), el = id => { if (!elements.has(id)) elements.set(id, { value: '', innerHTML: '', closest: () => ({}), setCustomValidity() {}, removeAttribute() {}, classList: { remove() {} }, parentElement: { querySelector: () => null } }); return elements.get(id); };
      const context = vm.createContext({ state: { catalog }, $: el, $$: () => [], clearFieldErrors() {}, fieldError: (_el, message) => { throw Error(message); }, resourceName: (type, id) => catalog[type].find(v => v.id === id)?.name || id, esc: String, fmt: new Intl.NumberFormat('zh-CN') });
      const constants = src.split('\n').filter(line => /const (labels|quantityEntry|quantityLimit) =/.test(line)).join('\n');
      vm.runInContext(constants + '\n' + fn('readOps') + '\n' + fn('renderVisualOps') + '\n' + fn('setOpsFields'), context);
      context.ops = template.ops; vm.runInContext("setOpsFields('template', ops); output = readOps('template'); renderVisualOps('template');", context);
      assert.deepEqual(JSON.parse(JSON.stringify(context.output)), template.ops);
      assert(el('#template-visual-ops').innerHTML.includes('奶油南瓜浓汤 · 精致 · 奶香')); assert(el('#template-visual-ops').innerHTML.includes('× 1'));
      assert.equal(vm.runInContext("quantityEntry('dishes', 'pumpkin_soup:fine:milky:7')[1]", context), 'pumpkin_soup:fine:milky');
      assert.equal(vm.runInContext("quantityEntry('pantry', 'egg:normal:plain:1')", context), null);
      el('#template-dishes').value = 'egg_custard:normal:milky:1'; assert.throws(() => vm.runInContext("readOps('template')", context), /目录中不存在/);
      const html = fs.readFileSync(path.join(project, 'site/admin/index.html'), 'utf8');
      for (const prefix of ['template', 'mail']) for (const type of ['pantry', 'dishes']) assert(html.includes(`id="${prefix}-${type}"`));
      const client = fs.readFileSync(path.join(project, 'js/ui/account-panels.js'), 'utf8');
      const clientFn = client.slice(client.indexOf('export function mailAttachmentText('), client.indexOf('\nexport function refreshAccountUi')).replace('export function', 'function');
      const messages = vm.createContext({ ...rules, fmt: String }); vm.runInContext(clientFn, messages); messages.item = { ops: [{ type: 'pantry', items: { milk: 2 } }, { type: 'dishes', items: { 'pumpkin_soup:fine:milky': 1 } }] };
      const description = vm.runInContext('mailAttachmentText(item)', messages); assert(description.includes('鲜牛奶 ×2')); assert(description.includes('奶油南瓜浓汤（精致·奶香）×1'));
    });
    await group('real API upgrades v1 ranch on new-resource mail claim and never refunds or restores escrow twice', async () => {
      const now=Date.parse('2026-10-19T02:00:00.000Z'), data=JSON.parse(JSON.stringify(fixture));data.savedAt=now;
      assert.equal(rules.performHomestead(data,{type:'tutorial'},now).ok,true);const old=data.homestead;old.version=1;old.ranchLevel=3;old.serial=4;
      delete old.animals[0].housingKey;delete old.animals[0].pausedMs;old.animals[0].cycleAt=now+420000;old.animals[0].feed=3;
      const dish='egg_custard:normal:plain';old.placed=[{id:'dish_2',key:dish,zone:'ranch',surface:'ranch_picnic',anchor:'a0',rotation:0}];old.tea={id:'tea_3',keys:[dish],guests:['momo'],startedAt:now,readyAt:now+30000};data.decor={};
      let before=await read();expect(await call('/api/save','PUT',{baseRevision:before.revision,data},player),200);before=await read();assert.equal(before.data.homestead.version,1);
      const ops=[{type:'pantry',items:{duck_egg:2,goat_milk_prime:1,rabbit_fur:1,alpaca_fiber_prime:1}},{type:'dishes',items:{'duck_egg_toast:fine:plain':1}},{type:'decor',items:{ranch_hutch:1}}];
      const mail=await publish(ops,'旧牧场新原料迁移'),requestKey=key('v1claim');expect(await claim(mail,before.revision,requestKey),200);
      const after=await read();assert.equal(after.data.homestead.version,2);assert.equal(after.data.coins,1800);assert.equal(after.data.decor.ranch_coop,1);assert.equal(after.data.decor.ranch_hutch,1);assert.equal(after.data.homestead.dishes[dish],2);assert.equal(after.data.homestead.tea,null);assert.equal(after.data.homestead.placed.length,0);assert.equal(after.data.homestead.animals[0].pausedMs,420000);assert.equal(after.data.homestead.pantry.duck_egg,2);
      assert.equal(expect(await claim(mail,before.revision,requestKey),200).idempotent,true);assert.deepEqual(await read(),after);
      const normalized=JSON.parse(JSON.stringify(after.data));rules.migrateHomestead(normalized,now+99999999);assert.deepEqual(normalized,after.data);
      expect(await direct([{type:'pantry',items:{goat_milk:1}}],after.revision),200);const next=await read();assert.equal(next.data.coins,1800);assert.equal(next.data.decor.ranch_coop,1);assert.equal(next.data.homestead.dishes[dish],2);validateSaveData(next.data);
    });
    process.send({ pass: true, checks: checks.length, names: checks, catalog: { pantry: catalog.pantry.length, dishes: catalog.dishes.length }, realApi: true, isolatedDatabase: true, checkoutEnabled: false, browserValidation: false });
  } finally { await new Promise(resolve => server.close(resolve)); process.disconnect(); }
}

async function parentChecks() {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nuannuan-homestead-mail-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(name)));
  Object.assign(env, { DATA_DIR: temporary, AUTH_DB: path.join(temporary, 'isolated.sqlite'), COOKIE_SECURE: '0', PUBLIC_FREE_ENTITLEMENTS: '1', PAYMENT_CHECKOUT_ENABLED: '0', PORTAL_COMMERCE_READY: '0', PAYMENT_PROVIDER: '', TEST_AUTH_ENABLED: '0', ADMIN_API_TOKEN: randomUUID() });
  let report, logs = '';
  const child = fork(__filename, ['--isolated-child'], { env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; }); child.on('message', result => { report = result; });
  const timer = setTimeout(() => child.kill(), 45000);
  const arg = process.argv.indexOf('--out');
  const out = arg >= 0 ? path.resolve(process.argv[arg + 1]) : path.join(project, 'output/homestead-20261019', `mail-checks-${Date.now()}.json`);
  try {
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report || { pass: false, code, logs }, null, 2));
    assert.equal(code, 0, logs); assert.equal(report?.pass, true, logs); console.log(JSON.stringify({ ...report, report: out }));
  } finally {
    clearTimeout(timer); assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir())); assert(path.basename(temporary).startsWith('nuannuan-homestead-mail-')); fs.rmSync(temporary, { recursive: true, force: true });
  }
}
(process.argv.includes('--isolated-child') && typeof process.send === 'function' ? childChecks : parentChecks)().catch(error => { console.error(error.stack || error); process.exitCode = 1; if (process.connected) process.disconnect(); });
