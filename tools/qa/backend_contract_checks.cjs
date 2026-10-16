// Real API regression. Only a child with an OS-only environment, a newly created
// temporary SQLite database, loopback HTTP and synthetic identities loads auth-api.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { fork } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

async function childChecks() {
  const temporary = path.resolve(process.env.DATA_DIR || '');
  assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir()));
  assert(path.basename(temporary).startsWith('nuannuan-contract-'));
  assert.equal(process.env.AUTH_DB, path.join(temporary, 'isolated.sqlite'));
  assert.equal(process.env.PAYMENT_CHECKOUT_ENABLED, '0');
  assert.equal(process.env.PORTAL_COMMERCE_READY, '0');
  const { handleApi } = require('../../server/auth-api');
  const { DEFAULT_OUTFIT } = require('../../js/shared/clothing.js');
  const { validateSaveData } = require('../../js/core/save-format.js');
  const checks = [];
  const server = http.createServer((req, res) => Promise.resolve(handleApi(req, res)).catch(error => {
    res.writeHead(500).end(JSON.stringify({ error: error.message }));
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const key = label => `${label}_${randomUUID().replace(/-/g, '')}`;
  const admin = { 'X-Admin-Token': process.env.ADMIN_API_TOKEN };
  let player;
  const fixture = coins => ({ v: 3, started: true, coins, owned: Object.values(DEFAULT_OUTFIT), outfit: { ...DEFAULT_OUTFIT },
    placed: [], placedIn: [], shops: { cafe: { lv: 1, stage: 0, plays: 0 } }, seeds: {}, crops: {}, decor: {}, stats: {}, house: 1, yardLv: 1, gday: 1 });
  const copy = value => JSON.parse(JSON.stringify(value));
  const call = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const put = (data, baseRevision) => call('/api/save', 'PUT', { data, baseRevision }, player);
  const read = () => call('/api/save', 'GET', undefined, player);
  const group = async (name, run) => { await run(); checks.push(name); };
  try {
    const registration = await call('/api/auth/register', 'POST', { username: 'synthetic_contract', password: key('password') });
    assert.equal(registration.status, 201);
    player = { Cookie: registration.headers.get('set-cookie').split(';')[0] };
    const accountId = registration.body.user.id;
    await group('new snapshots require a nonnegative integer revision starting at zero', async () => {
      for (const baseRevision of [undefined, null, '0', -1, .5]) {
        const response = await put(fixture(123), baseRevision);
        assert.equal(response.status, 400); assert.equal(response.body.code, 'SAVE_REVISION_REQUIRED');
      }
      assert.equal((await put(fixture(123), 7)).status, 409);
      assert.equal((await read()).status, 404);
    });
    await group('a valid client snapshot is saved; canonical retries do not advance revision', async () => {
      const data = fixture(123);
      assert.equal((await put(data, 0)).body.revision, 1);
      const replay = await put(data, 0);
      assert.equal(replay.status, 200); assert.equal(replay.body.unchanged, true); assert.equal(replay.body.revision, 1);
    });
    await group('historical fertilizer and string photo survive the real server round trip once', async () => {
      const data = fixture(123);
      data.seeds = { radish: 3, fertilizer: 2 }; data.stats.fertilizer = 3;
      data.placedIn = [{ id: 'photo_frame', gx: 5, gz: 5, rot: 0, photo: 'sakura' }];
      data.futureExtension = { marker: 'preserved', values: [1, 2] };
      const saved = await put(data, 1); assert.equal(saved.status, 200); assert.equal(saved.body.revision, 2);
      const cloud = (await read()).body;
      assert.equal(cloud.data.stats.fertilizer, 5); assert.equal(Object.hasOwn(cloud.data.seeds, 'fertilizer'), false);
      assert.equal(cloud.data.seeds.radish, 3); assert.equal(cloud.data.placedIn[0].photo, 'sakura');
      assert.deepEqual(cloud.data.futureExtension, data.futureExtension);
      assert.equal(createHash('sha256').update(JSON.stringify(cloud.data)).digest('hex'), cloud.checksum);
      validateSaveData(cloud.data);
      const again = await put(data, 1); assert.equal(again.status, 200); assert.equal(again.body.unchanged, true); assert.equal(again.body.revision, 2);
    });
    await group('invalid known fields cannot replace the previous valid cloud snapshot', async () => {
      const before = (await read()).body;
      const invalid = [
        { ...fixture(123), live: { daily: [{ id: 'd_cafe', n: 120, base: 0, prog: 'broken', claimed: false }] } },
        { ...fixture(123), seeds: { fertilizer: -1 } },
        { ...fixture(123), seeds: { fertilizer: 2 }, stats: { fertilizer: Number.MAX_SAFE_INTEGER } },
        { ...fixture(123), placedIn: [{ id: 'photo_frame', gx: 5, gz: 5, rot: 0, photo: 'unknown-theme' }] },
        { ...fixture(123), coins: -1 },
        { ...fixture(123), shops: undefined },
        { ...fixture(123), futureExtension: JSON.parse('{"__proto__":{"polluted":true}}') },
      ];
      for (const data of invalid) {
        const response = await put(data, before.revision);
        assert.equal(response.status, 400); assert.equal(response.body.code, 'SAVE_INVALID');
        assert.deepEqual((await read()).body, before);
      }
    });
    let revision = 2;
    await group('gifts require an integer save revision and keep retry idempotency', async () => {
      const route = `/api/admin/accounts/${accountId}/gift`;
      const ops = [{ type: 'coins', mode: 'add', amount: 5 }];
      for (const value of [undefined, null, '2', 1.5, -1]) {
        const result = await call(route, 'POST', { ops, idempotencyKey: key('gift_invalid'), ...(value === undefined ? {} : { baseRevision: value }) }, admin);
        assert.equal(result.status, 400); assert.equal(result.body.code, 'SAVE_REVISION_REQUIRED');
      }
      assert.equal((await call(route, 'POST', { ops, baseRevision: 1, idempotencyKey: key('gift_stale') }, admin)).status, 409);
      const body = { ops, baseRevision: revision, idempotencyKey: key('gift_good') };
      const issued = await call(route, 'POST', body, admin); assert.equal(issued.status, 200); revision++;
      assert.equal((await read()).body.data.coins, 128);
      assert.equal((await call(route, 'POST', body, admin)).body.idempotent, true);
      const { baseRevision, ...lostResponseRetry } = body;
      assert.equal((await call(route, 'POST', lostResponseRetry, admin)).body.idempotent, true);
      assert.equal((await call(route, 'POST', { ...body, ops: [{ type: 'coins', amount: 6 }] }, admin)).status, 409);
      assert.equal((await read()).body.revision, revision);
    });
    await group('single-mail claims enforce revisions without duplicating a committed reward', async () => {
      const message = await call('/api/admin/mail', 'POST', { kind: 'gift', audience: 'user', targetUserId: accountId,
        title: 'Synthetic contract gift', body: 'Only the isolated test account receives this.', ops: [{ type: 'coins', amount: 7 }], idempotencyKey: key('mail_publish') }, admin);
      assert.equal(message.status, 201);
      const route = `/api/mail/${message.body.message.id}/claim`;
      for (const value of [undefined, null, String(revision), 1.5, -1]) {
        const result = await call(route, 'POST', { idempotencyKey: key('mail_invalid'), ...(value === undefined ? {} : { baseRevision: value }) }, player);
        assert.equal(result.status, 400); assert.equal(result.body.code, 'SAVE_REVISION_REQUIRED');
      }
      const stale = await call(route, 'POST', { idempotencyKey: key('mail_stale'), baseRevision: revision - 1 }, player);
      assert.equal(stale.status, 409); assert.equal(stale.body.currentRevision, revision);
      const body = { idempotencyKey: key('mail_claim'), baseRevision: revision };
      assert.equal((await call(route, 'POST', body, player)).status, 200); revision++;
      assert.equal((await read()).body.data.coins, 135);
      assert.equal((await call(route, 'POST', body, player)).body.idempotent, true);
      assert.equal((await read()).body.revision, revision);
    });
    await group('competing different uploads have one winner and a recoverable conflict', async () => {
      const data = (await read()).body.data;
      const results = await Promise.all([put({ ...data, coins: 701 }, revision), put({ ...data, coins: 702 }, revision)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const conflict = results.find(result => result.status === 409).body.conflict;
      revision++;
      const cloud = (await read()).body;
      assert.equal(cloud.revision, revision); assert.equal(conflict.revision, revision); assert.deepEqual(conflict.data, cloud.data);
    });
    const quantities = amount => [{ type: 'coins', amount }, { type: 'seeds', items: { radish: amount } }];
    const publish = async amount => {
      const result = await call('/api/admin/mail', 'POST', { kind: 'gift', audience: 'user', targetUserId: accountId,
        title: 'Synthetic quantity gift', body: 'Isolated capacity fixture.', ops: quantities(amount), idempotencyKey: key('quantity_mail') }, admin);
      assert.equal(result.status, 201); return result.body.message.id;
    };
    await group('direct, single-mail and batch gifts never truncate valid existing high balances', async () => {
      const data = fixture(1_000_000_000_005); data.seeds.radish = 1_000_005;
      assert.equal((await put(data, revision)).status, 200); revision++;
      assert.equal((await call(`/api/admin/accounts/${accountId}/gift`, 'POST', { ops: quantities(1), baseRevision: revision, idempotencyKey: key('high_gift') }, admin)).status, 200); revision++;
      const single = await publish(2);
      assert.equal((await call(`/api/mail/${single}/claim`, 'POST', { baseRevision: revision, idempotencyKey: key('high_single') }, player)).status, 200); revision++;
      await publish(3); await publish(4);
      const batchBody = { baseRevision: revision, idempotencyKey: key('high_batch') };
      const batch = await call('/api/mail/claim-all', 'POST', batchBody, player);
      assert.equal(batch.status, 200); assert.equal(batch.body.count, 2); revision++;
      assert.equal((await call('/api/mail/claim-all', 'POST', batchBody, player)).body.idempotent, true);
      const cloud = (await read()).body;
      assert.equal(cloud.revision, revision); assert.equal(cloud.data.coins, data.coins + 10); assert.equal(cloud.data.seeds.radish, data.seeds.radish + 10);
    });
    await group('overflowing direct and mail rewards roll back the whole save and all receipts', async () => {
      const data = fixture(Number.MAX_SAFE_INTEGER); data.seeds.radish = Number.MAX_SAFE_INTEGER;
      assert.equal((await put(data, revision)).status, 200); revision++;
      const before = (await read()).body;
      const direct = await call(`/api/admin/accounts/${accountId}/gift`, 'POST', { ops: quantities(1), baseRevision: revision, idempotencyKey: key('overflow_direct') }, admin);
      assert.equal(direct.status, 409); assert.equal(direct.body.code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual((await read()).body, before);
      const single = await publish(1);
      const response = await call(`/api/mail/${single}/claim`, 'POST', { baseRevision: revision, idempotencyKey: key('overflow_single') }, player);
      assert.equal(response.status, 409); assert.equal(response.body.code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual((await read()).body, before);
      await publish(2);
      const { DatabaseSync } = require('node:sqlite');
      const fixtureDb = new DatabaseSync(process.env.AUTH_DB, { readOnly: true });
      try {
        const receiptsBefore = fixtureDb.prepare('SELECT COUNT(*) AS n FROM gift_grants').get().n;
        const batch = await call('/api/mail/claim-all', 'POST', { baseRevision: revision, idempotencyKey: key('overflow_batch') }, player);
        assert.equal(batch.status, 409); assert.equal(batch.body.code, 'SAVE_CAPACITY_EXCEEDED'); assert.deepEqual((await read()).body, before);
        assert.equal(fixtureDb.prepare('SELECT COUNT(*) AS n FROM gift_grants').get().n, receiptsBefore);
        assert.equal(fixtureDb.prepare('SELECT claimed_at FROM mail_deliveries WHERE message_id=? AND user_id=?').get(single, accountId).claimed_at, null);
      } finally { fixtureDb.close(); }
    });
    await group('legacy v1 snapshots remain readable without erasing optional extensions', async () => {
      const data = fixture(333); data.v = 1; data.legacyNote = { preserved: true };
      const saved = await put(data, revision); assert.equal(saved.status, 200); revision++;
      const cloud = (await read()).body;
      assert.equal(cloud.data.v, 1); assert.equal(cloud.data.legacyNote.preserved, true); validateSaveData(cloud.data, { allowLegacyBuilding: true });
    });
    await group('JSON roots are checked and checkout stays disabled throughout', async () => {
      for (const data of [null, [], 'string']) assert.equal((await call('/api/save', 'PUT', data, player)).status, 400);
      const status = await call('/api/billing/status'); assert.equal(status.status, 200);
      const checkout = await call('/api/billing/checkout', 'POST', { productId: 'portal_member_monthly' }, player);
      assert.notEqual(checkout.status, 200); assert.notEqual(checkout.status, 201);
      assert.equal((await read()).body.data.coins, 333);
    });
    process.send({ pass: true, checks: checks.length, names: checks, realApi: true, isolatedDatabase: true, checkoutEnabled: false });
  } finally { await new Promise(resolve => server.close(resolve)); process.disconnect(); }
}

async function parentChecks() {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nuannuan-contract-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(name)));
  Object.assign(env, { DATA_DIR: temporary, AUTH_DB: path.join(temporary, 'isolated.sqlite'), COOKIE_SECURE: '0', PUBLIC_FREE_ENTITLEMENTS: '1',
    PAYMENT_CHECKOUT_ENABLED: '0', PORTAL_COMMERCE_READY: '0', PAYMENT_PROVIDER: '', TEST_AUTH_ENABLED: '0', ADMIN_API_TOKEN: randomUUID() });
  let report, logs = '';
  const child = fork(__filename, ['--isolated-child'], { env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
  child.on('message', result => { report = result; });
  const timer = setTimeout(() => child.kill(), 40000);
  try {
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, logs); assert.equal(report?.pass, true, logs);
    const requested = process.argv.indexOf('--out');
    const file = requested >= 0 ? process.argv[requested + 1] : process.env.LIVE_QA_OUT ? path.join(process.env.LIVE_QA_OUT, 'backend-contract.json') : null;
    if (file) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2)); }
    console.log(JSON.stringify(report));
  } finally {
    clearTimeout(timer);
    assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir())); assert(path.basename(temporary).startsWith('nuannuan-contract-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const run = process.argv.includes('--isolated-child') && typeof process.send === 'function' ? childChecks : parentChecks;
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; if (process.connected) process.disconnect(); });
