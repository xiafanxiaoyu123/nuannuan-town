// Account lifecycle regression using the real account/state ES modules and an
// in-memory, revision-checked API. No player save, cookie, or cloud DB is read.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
if (!vm.SourceTextModule) {
  const r = require('child_process').spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 1);
}
const root = path.resolve(__dirname, '../..'), clone = v => JSON.parse(JSON.stringify(v));
const checks = [], observe = process.argv.includes('--observe');
const out = path.resolve(process.env.SYNC_QA_OUT || path.join(root, 'output/account-sync-20261014/lifecycle'));
const source = process.env.SYNC_QA_ACCOUNT_SOURCE;
const key = 'nikki-block-town-save-v1:qa-cloud-lifecycle';
function server() {
  return { data: null, revision: 0, reads: 0, writes: 0, beforePut: null, beforeGet: null, beforeClaim: null, afterClaim: null, claims: 0, claimed: new Map(), userId: 'qa-cloud', async fetch(input, options = {}) {
    const url = new URL(String(input), 'http://localhost'), method = options.method || 'GET';
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/auth/me' || url.pathname === '/api/auth/login') return json({ user: { id: this.userId, username: 'Cloud QA' } });
    if (url.pathname === '/api/auth/logout') return json({ ok: true });
    const expectedAccount = new Headers(options.headers || {}).get('X-Nikki-Account-Id');
    if (expectedAccount && expectedAccount !== this.userId) return json({ error: '当前登录账号已经变化，请重新确认', code: 'ACCOUNT_CHANGED' }, 409);
    if (url.pathname === '/api/account/entitlements') return json({ plan: 'free-public', freeEntitlements: true, features: ['cloud_sync', 'auto_update'] });
    if (url.pathname === '/api/save' && method === 'GET') {
      this.reads++;
      if (this.beforeGet) { const hook = this.beforeGet; this.beforeGet = null; await hook(); }
      return this.data ? json({ data: clone(this.data), revision: this.revision }) : json({ error: 'no save' }, 404);
    }
    if (url.pathname === '/api/save' && method === 'PUT') {
      const body = JSON.parse(options.body);
      if (this.beforePut) { const hook = this.beforePut; this.beforePut = null; await hook(body); }
      if (body.baseRevision !== this.revision) return json({ error: 'conflict', conflict: { data: clone(this.data), revision: this.revision } }, 409);
      this.data = clone(body.data); this.revision++; this.writes++;
      return json({ revision: this.revision });
    }
    if (/^\/api\/mail\/[^/]+\/claim$/.test(url.pathname) && method === 'POST') {
      const body = JSON.parse(options.body);
      if (this.claimed.has(url.pathname)) return json({ ...this.claimed.get(url.pathname), idempotent: true });
      if (this.beforeClaim) { const hook = this.beforeClaim; this.beforeClaim = null; await hook(body); }
      // Match server/auth-api.js: mail conflict only returns currentRevision,
      // unlike PUT /api/save, which includes the conflicting snapshot.
      if (body.baseRevision !== this.revision) return json({ error: '领取前存档发生了变化，请重新同步后再试', code: 'MAIL_REVISION_CONFLICT', currentRevision: this.revision }, 409);
      this.data.coins += 7; this.revision++; this.claims++;
      const result = { ok: true, claimed: true, revision: this.revision };
      this.claimed.set(url.pathname, result);
      if (this.afterClaim) { const hook = this.afterClaim; this.afterClaim = null; await hook(result); }
      return json(result);
    }
    throw new Error('Unexpected mock API request: ' + url.pathname);
  } };
}
async function client(api, storage = new Map(), slot = 'qa-cloud-lifecycle') {
  const modules = new Map(), events = [], timers = new Set();
  const context = vm.createContext({
    console, Date, TextEncoder, URLSearchParams, URL, performance, Headers, Response, crypto: require('crypto').webcrypto,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, dispatchEvent: event => events.push(event),
    location: { search: '?slot=' + encodeURIComponent(slot), protocol: 'http:', origin: 'http://localhost', href: 'http://localhost/?slot=' + encodeURIComponent(slot) },
    fetch: (...args) => api.fetch(...args),
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; }, clearTimeout: id => { clearTimeout(id); timers.delete(id); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  });
  const at = file => {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(source && file === path.join(root, 'js/core/account.js') ? source : file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  };
  const mod = at(path.join(root, 'js/core/account.js'));
  await mod.link((specifier, parent) => at(path.resolve(path.dirname(parent.identifier), specifier))); await mod.evaluate();
  const st = modules.get(path.join(root, 'js/core/state.js')).namespace, account = mod.namespace.account;
  st.load();
  return { st, account, storage, events, close() { for (const timer of timers) clearTimeout(timer); } };
}
async function freshLinked() {
  const api = server(), c = await client(api); c.st.S.started = true; c.st.flushSave();
  const result = await c.account.login('Cloud QA', 'mock-password');
  assert.equal(result.kind, 'uploaded-local'); assert.equal(api.revision, 1);
  return { api, c };
}
async function test(label, fn) {
  try { const detail = await fn(); checks.push({ label, pass: true, detail }); console.log('PASS ' + label); }
  catch (error) { checks.push({ label, pass: false, error: error.message }); console.log('FAIL ' + label + ': ' + error.message); }
}
async function main() {
  await test('single-device manual sync uploads local changes without a conflict', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins += 17; const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'same cloud revision must not be a conflict'); assert.equal(api.data.coins, c.st.S.coins);
      return { kind: r.kind, revision: api.revision };
    } finally { c.close(); }
  });
  await test('reload retains acknowledged baseline and uploads offline local progress', async () => {
    const { api, c } = await freshLinked(); c.st.S.coins += 23; c.st.flushSave(); c.close();
    const d = await client(api, c.storage); try {
      await d.account.restore(); const r = await d.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'reload lost the last acknowledged revision'); assert.equal(api.data.coins, 223);
      return { kind: r.kind, revision: api.revision };
    } finally { d.close(); }
  });
  await test('unchanged local device receives remote-only progress', async () => {
    const { api, c } = await freshLinked(); try {
      api.data.coins += 31; api.revision++; const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'only remote progress changed'); assert.equal(c.st.S.coins, 231);
      return { kind: r.kind, revision: api.revision };
    } finally { c.close(); }
  });
  await test('object key order does not create a progress conflict', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.stats = { earned: 11, plays: 2 }; await c.account.syncNow();
      api.data.stats = { plays: 2, earned: 11 }; const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'equivalent object key order was treated as different');
      return { kind: r.kind, writes: api.writes };
    } finally { c.close(); }
  });
  await test('device settings alone are not conflicting game progress', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.settings.fpsLimit = 120; c.st.S.settings.music = .15;
      api.data.settings.fpsLimit = 30; api.data.settings.music = .85; api.revision++;
      const before = api.writes, r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'device graphics/audio options caused a progress conflict');
      assert.equal(c.st.S.settings.fpsLimit, 120); assert.equal(c.st.S.settings.music, .15);
      assert.equal(api.writes, before, 'device settings alone should not upload another cloud revision');
      return { kind: r.kind, fpsLimit: c.st.S.settings.fpsLimit, writes: api.writes };
    } finally { c.close(); }
  });
  await test('receiving remote progress preserves this device graphics and audio preferences', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.settings.fpsLimit = 120; c.st.S.settings.music = .15;
      api.data.settings.fpsLimit = 30; api.data.settings.music = .85; api.data.coins += 22; api.revision++;
      const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict'); assert.equal(c.st.S.coins, 222);
      assert.equal(c.st.S.settings.fpsLimit, 120); assert.equal(c.st.S.settings.music, .15);
      return { kind: r.kind, coins: c.st.S.coins, fpsLimit: c.st.S.settings.fpsLimit, music: c.st.S.settings.music };
    } finally { c.close(); }
  });
  await test('clock and savedAt drift do not cause conflict or another upload', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.clock += .1; c.st.S.savedAt = Date.now(); const before = api.writes;
      const r = await c.account.prepareSync(); assert.notEqual(r.kind, 'conflict'); await c.account.syncNow(); assert.equal(api.writes, before);
      return { kind: r.kind, writes: api.writes };
    } finally { c.close(); }
  });
  await test('an acknowledged shop session is not a new conflicting save', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.workPrev = clone(c.st.S.outfit); await c.account.syncNow();
      const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'cloud-only migration of workPrev caused a false conflict');
      assert.ok(c.st.S.workPrev, 'comparing cloud must not end the active shop outfit');
      return { kind: r.kind, revision: api.revision };
    } finally { c.close(); }
  });
  await test('cloud choice survives reload plus startup preference initialization', async () => {
    const { api, c } = await freshLinked();
    api.data.coins = 900; api.revision++; c.st.S.coins = 800;
    assert.equal((await c.account.prepareSync()).kind, 'conflict'); await c.account.resolveSync('cloud'); c.close();
    const d = await client(api, c.storage); try {
      // app.init sets qv=2 before its asynchronous restore/prepareSync settles.
      if (!d.st.S.settings.qv) d.st.S.settings.qv = 2;
      await d.account.restore(); const r = await d.account.prepareSync();
      assert.notEqual(r.kind, 'conflict', 'using cloud again asks to resolve the same branch'); assert.equal(d.st.S.coins, 900);
      return { kind: r.kind, revision: api.revision };
    } finally { d.close(); }
  });
  await test('real edits on both devices remain an explicit conflict without overwrite', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins += 10; api.data.coins += 20; api.revision++; const writes = api.writes;
      const r = await c.account.prepareSync(); assert.equal(r.kind, 'conflict'); assert.equal(api.writes, writes); assert.equal(c.st.S.coins, 210); assert.equal(api.data.coins, 220);
      return { local: c.st.S.coins, cloud: api.data.coins, revision: api.revision };
    } finally { c.close(); }
  });
  await test('true two-sided edits remain conflicting after a page reload', async () => {
    const { api, c } = await freshLinked();
    c.st.S.coins += 10; c.st.flushSave(); api.data.coins += 20; api.revision++; c.close();
    const d = await client(api, c.storage); try {
      await d.account.restore(); const r = await d.account.prepareSync();
      assert.equal(r.kind, 'conflict'); assert.equal(d.st.S.coins, 210); assert.equal(api.data.coins, 220);
      return { local: d.st.S.coins, cloud: api.data.coins, revision: api.revision };
    } finally { d.close(); }
  });
  await test('another account cannot reuse a different account acknowledged revision', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins += 10; api.userId = 'qa-other-account'; api.data.coins = 777;
      const r = await c.account.login('Other QA', 'mock-password');
      assert.equal(r.kind, 'conflict', 'new account must require an explicit first-sync choice');
      assert.equal(api.data.coins, 777); assert.equal(c.st.S.coins, 210);
      return { kind: r.kind, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('another local save slot cannot reuse the first slot acknowledged revision', async () => {
    const { api, c } = await freshLinked(); c.close();
    const d = await client(api, c.storage, 'qa-cloud-lifecycle-other'); try {
      d.st.S.started = true; d.st.S.coins = 555; d.st.flushSave();
      await d.account.restore(); const r = await d.account.prepareSync();
      assert.equal(r.kind, 'conflict', 'another save slot reused a previous local baseline');
      assert.equal(d.st.S.coins, 555); assert.equal(api.data.coins, 200);
      return { kind: r.kind, local: d.st.S.coins, cloud: api.data.coins };
    } finally { d.close(); }
  });
  await test('server revision race cannot silently overwrite the remote save', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins += 5; api.beforePut = () => { api.data.coins += 8; api.revision++; };
      const r = await c.account.syncNow(); assert.equal(r.ok, false); assert.equal(r.error.status, 409); assert.equal(api.data.coins, 208);
      assert.ok(c.events.some(e => e.type === 'nuannuan:sync' && e.detail.state === 'conflict'));
      return { status: r.error.status, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('cloud choice is not reported ready while true pending conflict remains', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins += 10; api.data.coins += 20; api.revision++; await c.account.prepareSync(); await c.account.resolveSync('cloud');
      assert.equal(c.st.S.coins, 220); assert.equal(c.account.ready, true);
      const r = await c.account.prepareSync(); assert.notEqual(r.kind, 'conflict'); return { kind: r.kind, revision: c.account.revision };
    } finally { c.close(); }
  });
  await test('local edit during a cloud GET is uploaded from the latest snapshot', async () => {
    const { api, c } = await freshLinked(); try {
      api.beforeGet = () => { c.st.S.coins += 13; };
      const r = await c.account.prepareSync();
      assert.notEqual(r.kind, 'conflict'); assert.equal(c.st.S.coins, 213); assert.equal(api.data.coins, 213, 'GET used a stale local snapshot');
      return { kind: r.kind, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('remote pull cannot overwrite an edit made during its GET', async () => {
    const { api, c } = await freshLinked(); try {
      api.data.coins += 20; api.revision++; api.beforeGet = () => { c.st.S.coins += 13; };
      const r = await c.account.prepareSync();
      assert.equal(r.kind, 'conflict'); assert.equal(c.st.S.coins, 213); assert.equal(api.data.coins, 220);
      return { kind: r.kind, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('concurrent conflict choices serialize behind a pending local PUT', async () => {
    const { api, c } = await freshLinked(); let release;
    try {
      c.st.S.coins = 210; api.data.coins = 220; api.revision++;
      assert.equal((await c.account.prepareSync()).kind, 'conflict');
      const gate = new Promise(resolve => { release = resolve; }); let entered;
      const reached = new Promise(resolve => { entered = resolve; });
      api.beforePut = async () => { entered(); await gate; };
      const local = c.account.resolveSync('local'); await reached;
      const cloud = c.account.resolveSync('cloud');
      // Complete all microtasks that a nonserialized cloud replacement would use.
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(c.st.S.coins, 210, 'second choice replaced S while the first PUT was still running');
      release(); await Promise.allSettled([local, cloud]);
      assert.equal(c.st.S.coins, 210, 'stale pending cloud overwrote the accepted local choice'); assert.equal(api.data.coins, 210);
      return { local: c.st.S.coins, cloud: api.data.coins, revision: api.revision };
    } finally { release?.(); c.close(); }
  });
  await test('a rejected local choice refreshes the pending cloud candidate', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210; api.data.coins = 220; api.revision++;
      assert.equal((await c.account.prepareSync()).kind, 'conflict');
      api.data.coins = 230; api.revision++;
      try { await c.account.resolveSync('local'); } catch (error) { assert.equal(error.status, 409); }
      assert.equal(c.st.S.coins, 210, '409 replaced unsynced local progress'); assert.equal(api.data.coins, 230);
      await c.account.resolveSync('cloud');
      assert.equal(c.st.S.coins, 230, 'cloud choice reused the outdated conflict preview'); assert.equal(c.account.revision, 3);
      return { local: c.st.S.coins, cloud: api.data.coins, revision: c.account.revision };
    } finally { c.close(); }
  });
  await test('cloud choice checks for local edits made after the conflict preview', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210; api.data.coins = 220; api.revision++;
      assert.equal((await c.account.prepareSync()).kind, 'conflict');
      c.st.S.coins = 213;
      let result, error; try { result = await c.account.resolveSync('cloud'); } catch (e) { error = e; }
      assert.equal(c.st.S.coins, 213, 'cloud choice silently discarded newer local progress outside the shown preview');
      assert.equal(api.data.coins, 220);
      return { kind: result?.kind, error: error?.message, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('mail claim cannot overwrite progress earned while the reward request is pending', async () => {
    const { api, c } = await freshLinked(); try {
      api.beforeClaim = () => { c.st.S.coins += 9; };
      let error; try { await c.account.mailClaim('qa-gift'); } catch (e) { error = e; }
      assert.equal(c.st.S.coins, 209, 'mail claim overwrote the unuploaded local edit'); assert.equal(api.data.coins, 207);
      assert.equal(api.claims, 1); assert.equal(c.account.ready, false, 'unmerged mail conflict was marked ready');
      assert.ok(c.events.some(e => e.type === 'nuannuan:sync' && e.detail.state === 'conflict'), 'new mail conflict was not exposed for a safe choice');
      return { local: c.st.S.coins, cloud: api.data.coins, error: error?.message };
    } finally { c.close(); }
  });
  await test('mail refresh cannot overwrite a local edit made during its final GET', async () => {
    const { api, c } = await freshLinked(); try {
      api.beforeClaim = () => { api.beforeGet = () => { c.st.S.coins += 9; }; };
      let error; try { await c.account.mailClaim('qa-gift'); } catch (e) { error = e; }
      assert.equal(c.st.S.coins, 209, 'final mail GET overwrote the unuploaded local edit'); assert.equal(api.data.coins, 207);
      assert.equal(c.account.ready, false);
      return { local: c.st.S.coins, cloud: api.data.coins, error: error?.message };
    } finally { c.close(); }
  });
  await test('a new day is uploaded as one-sided progress and survives restart', async () => {
    const { api, c } = await freshLinked();
    c.st.S.live.day = '2026-10-13'; await c.account.syncNow();
    c.st.S.live.day = '2026-10-14'; c.st.flushSave(); c.close();
    const d = await client(api, c.storage); try {
      await d.account.restore(); const r = await d.account.prepareSync();
      assert.notEqual(r.kind, 'conflict'); assert.equal(api.data.live.day, '2026-10-14');
      return { kind: r.kind, day: api.data.live.day };
    } finally { d.close(); }
  });
  await test('daily and resident baselines are real progress when both sides edit', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.live.day = '2026-10-14'; c.st.S.live.residents.base.plays = 2;
      api.data.live.day = '2026-10-15'; api.data.live.residents.base.plays = 3; api.revision++;
      const r = await c.account.prepareSync(); assert.equal(r.kind, 'conflict');
      assert.equal(c.st.S.live.residents.base.plays, 2); assert.equal(api.data.live.residents.base.plays, 3);
      return { kind: r.kind };
    } finally { c.close(); }
  });
  await test('failed local save write cannot replace running state or acknowledge cloud', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210; api.data.coins = 220; api.revision++;
      await c.account.prepareSync(); const before = c.st.S;
      const original = c.storage.set.bind(c.storage);
      c.storage.set = (k, v) => { if (k === key) throw new Error('quota exceeded'); return original(k, v); };
      await assert.rejects(c.account.resolveSync('cloud'), /空间/);
      assert.equal(c.st.S, before); assert.equal(c.st.S.coins, 210); assert.equal(c.account.ready, false);
      return { preserved: c.st.S.coins, revision: c.account.revision };
    } finally { c.close(); }
  });
  await test('an edit while PUT is in flight remains pending for the next upload', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210; api.beforePut = () => { c.st.S.coins = 213; };
      await c.account.syncNow(); assert.equal(api.data.coins, 210); assert.equal(c.st.S.coins, 213);
      await c.account.syncNow(); assert.equal(api.data.coins, 213);
      return { local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('late old upload cannot mark the new account ready or upload into it', async () => {
    const { api, c } = await freshLinked(); let release;
    try {
      c.st.S.coins = 210;
      const gate = new Promise(r => { release = r; }); let entered; const reached = new Promise(r => { entered = r; });
      api.beforePut = async () => { entered(); await gate; };
      const old = c.account.syncNow(); await reached;
      const originalFetch = api.fetch.bind(api);
      api.fetch = async (url, options) => {
        if (String(url).includes('/api/auth/login')) { api.userId = 'other'; api.data.coins = 999; api.revision = 10; }
        return originalFetch(url, options);
      };
      const next = c.account.login('Other', 'mock-password');
      release(); await old; const r = await next;
      assert.equal(api.userId, 'other'); assert.equal(api.data.coins, 999);
      assert.equal(r.kind, 'conflict'); assert.equal(c.account.ready, false);
      return { kind: r.kind, cloud: api.data.coins };
    } finally { release?.(); c.close(); }
  });
  await test('cookie restore into another account cannot reuse the old account sync state', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210;
      // A website login in another tab can replace the shared Cookie session.
      api.userId = 'qa-cookie-switched-account'; api.data.coins = 999; api.revision = 1;
      await c.account.restore();
      await c.account.syncNow();
      assert.equal(api.data.coins, 999, 'restore switched identity but reused old ready/revision and overwrote the new account cloud save');
      assert.equal(c.st.S.coins, 210);
      const r = await c.account.prepareSync(); assert.equal(r.kind, 'conflict');
      return { local: c.st.S.coins, cloud: api.data.coins, kind: r.kind };
    } finally { c.close(); }
  });
  await test('mail revision race can recover on retry with the real server error shape', async () => {
    const { api, c } = await freshLinked(); try {
      api.beforeClaim = () => { api.data.coins = 220; api.revision++; };
      let firstError; try { await c.account.mailClaim('qa-gift'); } catch (e) { firstError = e; }
      assert.equal(firstError?.status, 409); assert.equal(api.claims, 0);
      await c.account.mailClaim('qa-gift');
      assert.equal(api.claims, 1, 'retry reused the known stale revision forever');
      assert.equal(c.st.S.coins, 227); assert.equal(api.data.coins, 227);
      return { local: c.st.S.coins, cloud: api.data.coins, claims: api.claims };
    } finally { c.close(); }
  });
  await test('another tab baseline write cannot make this tab overwrite newer cloud progress', async () => {
    const { api, c } = await freshLinked();
    const d = await client(api, c.storage);
    try {
      await d.account.restore(); await d.account.prepareSync();
      d.st.S.coins = 220; await d.account.syncNow();
      assert.equal(api.data.coins, 220); assert.equal(c.st.S.coins, 200);
      const r = await c.account.prepareSync();
      assert.equal(api.data.coins, 220, 'another tab changed shared baseline, so stale local progress overwrote the newer cloud');
      assert.notEqual(r.kind, 'conflict', 'this tab had no edits of its own'); assert.equal(c.st.S.coins, 220);
      return { kind: r.kind, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); d.close(); }
  });
  await test('cookie switch is rejected by expected-account binding before any save write', async () => {
    const { api, c } = await freshLinked(); try {
      c.st.S.coins = 210;
      api.userId = 'qa-external-cookie-switch'; api.data.coins = 999; api.revision = 1;
      const r = await c.account.syncNow();
      assert.equal(api.data.coins, 999, 'background sync wrote into the new Cookie account before restore');
      assert.equal(c.account.ready, false); assert.equal(r.ok, false);
      return { local: c.st.S.coins, cloud: api.data.coins, ready: c.account.ready, error: r.error?.message };
    } finally { c.close(); }
  });
  await test('a committed mail claim with lost response retries without duplicate rewards', async () => {
    const { api, c } = await freshLinked(); try {
      api.afterClaim = () => { throw new Error('simulated response lost after server commit'); };
      await assert.rejects(c.account.mailClaim('qa-gift'), /response lost/);
      assert.equal(api.data.coins, 207); assert.equal(c.st.S.coins, 200);
      await c.account.mailClaim('qa-gift');
      assert.equal(api.claims, 1); assert.equal(api.data.coins, 207); assert.equal(c.st.S.coins, 207);
      return { claims: api.claims, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('a failed final mail GET retries without duplicate rewards or stale local replacement', async () => {
    const { api, c } = await freshLinked(); try {
      api.afterClaim = () => { api.beforeGet = () => { throw new Error('simulated final GET failure'); }; };
      await assert.rejects(c.account.mailClaim('qa-gift'), /GET failure/);
      assert.equal(api.data.coins, 207); assert.equal(c.st.S.coins, 200);
      await c.account.mailClaim('qa-gift');
      assert.equal(api.claims, 1); assert.equal(api.data.coins, 207); assert.equal(c.st.S.coins, 207);
      return { claims: api.claims, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); }
  });
  await test('both active tabs with local edits keep an explicit conflict despite shared storage', async () => {
    const { api, c } = await freshLinked(); const d = await client(api, c.storage);
    try {
      await d.account.restore(); await d.account.prepareSync();
      c.st.S.coins = 210; d.st.S.coins = 220; await d.account.syncNow();
      const r = await c.account.prepareSync();
      assert.equal(r.kind, 'conflict'); assert.equal(c.st.S.coins, 210); assert.equal(api.data.coins, 220);
      return { kind: r.kind, local: c.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); d.close(); }
  });
  await test('stale tab autosave followed by reload cannot silently overwrite newer cloud', async () => {
    const { api, c } = await freshLinked(); const d = await client(api, c.storage); let e;
    try {
      await d.account.restore(); await d.account.prepareSync();
      d.st.S.coins = 220; await d.account.syncNow();
      // The other tab still runs its 15-second local autosave with old S=200.
      c.st.flushSave(); c.close(); d.close();
      e = await client(api, c.storage); await e.account.restore();
      const r = await e.account.prepareSync();
      assert.equal(api.data.coins, 220, 'reload trusted a baseline from a different tab than the saved snapshot');
      return { kind: r.kind, local: e.st.S.coins, cloud: api.data.coins };
    } finally { c.close(); d.close(); e?.close(); }
  });
  await test('sync ancestor metadata stays local and cannot be injected through save import', async () => {
    const { api, c } = await freshLinked(); try {
      const field = '__nikkiCloudBaseV1', raw = JSON.parse(c.storage.get(key));
      assert.equal(raw[field]?.schema, 1); assert.equal(raw[field]?.revision, 1);
      assert.equal(Object.hasOwn(c.st.S, field), false); assert.equal(Object.hasOwn(c.st.serializeState(), field), false);
      assert.equal(Object.hasOwn(api.data, field), false, 'local metadata leaked into PUT /api/save');
      const exported = JSON.parse(c.st.exportSaveFile().text); assert.equal(Object.hasOwn(exported.data, field), false);
      const imported = clone(exported.data); imported.coins = 777; imported[field] = raw[field];
      const result = c.st.importSaveFile(JSON.stringify(imported)); assert.equal(result.ok, true);
      assert.equal(c.st.getCloudSaveBase(), null, 'import trusted metadata from a different save device');
      assert.equal(Object.hasOwn(c.st.S, field), false); assert.equal(Object.hasOwn(JSON.parse(c.storage.get(key)), field), false);
      const r = await c.account.prepareSync(); assert.equal(r.kind, 'conflict'); assert.equal(api.data.coins, 200);
      return { localOnly: true, importDiscardedAncestor: true, kind: r.kind };
    } finally { c.close(); }
  });
  await test('failed persistence after cloud acknowledgement keeps the older local snapshot and its own ancestor together', async () => {
    const { api, c } = await freshLinked(); let d;
    try {
      const diskBefore = c.storage.get(key), originalSet = c.storage.set.bind(c.storage);
      c.st.S.coins = 210;
      c.storage.set = (k, v) => { if (k === key) throw new Error('quota exceeded after upload'); return originalSet(k, v); };
      const r = await c.account.syncNow(); assert.equal(r.ok, true); assert.equal(api.data.coins, 210);
      assert.equal(c.storage.get(key), diskBefore, 'failed storage write changed only part of the local snapshot/base pair');
      c.close(); c.storage.set = originalSet;
      d = await client(api, c.storage); await d.account.restore(); const next = await d.account.prepareSync();
      assert.equal(api.data.coins, 210, 'older disk data was mistaken for a new local edit after restart');
      assert.equal(d.st.S.coins, 210); assert.notEqual(next.kind, 'conflict');
      return { cloud: api.data.coins, local: d.st.S.coins, kind: next.kind };
    } finally { c.close(); d?.close(); }
  });
  fs.mkdirSync(out, { recursive: true });
  const sha256 = file => require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const report = { mode: observe ? 'baseline-observation' : 'regression', source: source || 'current source', sourceHash: sha256(source || path.join(root, 'js/core/account.js')), stateHash: sha256(path.join(root, 'js/core/state.js')), storage: 'isolated memory only', pass: checks.every(c => c.pass), checks };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, passed: checks.filter(c => c.pass).length, total: checks.length, report: path.join(out, 'report.json') }));
  if (!report.pass && !observe) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
