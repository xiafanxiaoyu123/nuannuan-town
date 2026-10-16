'use strict';
// Real loopback HTTP + a freshly created temporary SQLite database only.
// Fixture SQL never connects to production or touches an existing player save.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nikki-mail-improvements-'));
const reportDir = path.resolve(process.env.MAIL_QA_OUT || path.join(root, 'output', `mail-improvements-${Date.now()}-${process.pid}`));
if (fs.existsSync(reportDir)) throw new Error('MAIL_QA_OUT must be a new directory; old reports are read-only evidence');
const checks = [];
let db, child, port, logs = '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const data = coins => ({ v: 3, started: true, coins, owned: [], outfit: {}, shops: {}, seeds: {}, crops: {}, decor: {}, placed: [], gday: 1 });
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const p = server.address().port; await new Promise(resolve => server.close(resolve)); return p;
}
function request(url, { method = 'GET', user, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: {
      ...(user ? { Cookie: user.cookie, 'X-Nikki-Account-Id': user.id } : {}),
      ...(text ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) } : {}), ...headers,
    } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { const text = Buffer.concat(chunks).toString(); let json;
        try { json = JSON.parse(text); } catch { return reject(new Error(`${url}: invalid JSON ${res.statusCode}`)); }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    req.on('error', reject); req.end(text);
  });
}
async function register(username, coins = 100) {
  const reply = await request('/api/auth/register', { method: 'POST', body: { username, password: 'isolated-mail-password-2026' } });
  assert.equal(reply.status, 201);
  const user = { id: reply.body.user.id, cookie: reply.headers['set-cookie'][0].split(';')[0], username };
  if (coins !== null) assert.equal((await put(user, 0, data(coins))).status, 200);
  return user;
}
const put = (user, baseRevision, save) => request('/api/save', { method: 'PUT', user, body: { baseRevision, data: save } });
const save = user => request('/api/save', { user });
const summary = user => request('/api/mail/summary', { user });
const claimAll = (user, key, revision) => request('/api/mail/claim-all', { method: 'POST', user, body: { idempotencyKey: key, baseRevision: revision } });
const single = (user, messageId, key, revision) => request(`/api/mail/${messageId}/claim`, { method: 'POST', user, body: { idempotencyKey: key, baseRevision: revision } });
const noMetadata = result => { const copy = { ...result }; delete copy.idempotent; return copy; };
function seed(user, id, { kind = 'gift', amount = 1, publishedAt = Date.now() - 10000, expiresAt = null, status = 'published', readAt = null, claimedAt = null } = {}) {
  const ops = kind === 'gift' ? [{ type: 'coins', mode: 'add', amount }] : [];
  db.prepare('INSERT INTO mail_messages(id,kind,title,body,ops_json,audience,target_user_id,status,idempotency_key,created_by,created_at,published_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, kind, '隔离测试邮件', '临时数据库夹具', JSON.stringify(ops), 'user', user.id, status, 'fixture_' + id, 'qa', publishedAt, publishedAt, expiresAt);
  db.prepare('INSERT INTO mail_deliveries(message_id,user_id,read_at,claimed_at,created_at) VALUES(?,?,?,?,?)')
    .run(id, user.id, readAt, claimedAt, publishedAt);
}
function count(table, user) { return Number(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=?`).get(user.id).n); }

async function startApi() {
  const isolatedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
  child = spawn(process.execPath, ['server-api.js'], { cwd: root, env: {
    ...isolatedEnvironment, API_PORT: String(port), DATA_DIR: temp, AUTH_DB: path.join(temp, 'accounts.sqlite'),
    COOKIE_SECURE: '0', PUBLIC_FREE_ENTITLEMENTS: '1', APP_ORIGINS: `http://127.0.0.1:${port}`, ADMIN_API_TOKEN: 'isolated-mail-admin', TEST_AUTH_ENABLED: '0',
    PAYMENT_CHECKOUT_ENABLED: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error('API exited: ' + logs);
    try { if ((await request('/api/healthz')).status === 200) return; } catch { /* Starting */ }
    await delay(40);
  }
  throw new Error('API did not become healthy');
}
async function restartApi() {
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; await startApi();
}

async function main() {
  port = await freePort(); await startApi();
  db = new DatabaseSync(path.join(temp, 'accounts.sqlite')); db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  const alice = await register('mail_improve_alice');
  const bob = await register('mail_improve_bob', 25);
  const pager = await register('mail_improve_pager', 0);
  const unsaved = await register('mail_improve_unsaved', null);
  seed(alice, 'pre_migration_message', { kind: 'announcement', status: 'revoked' });
  // Before any batch claims exist, model an existing database without the two
  // additive schema objects. Restart must add them while retaining old data.
  db.exec('DROP TABLE mail_claim_batches; DROP INDEX mail_messages_page_idx');
  await restartApi();
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM users').get().n), 4);
  assert.equal((await save(alice)).body.data.coins, 100);
  assert.equal(db.prepare("SELECT status FROM mail_messages WHERE id='pre_migration_message'").get().status, 'revoked');
  assert.equal(count('mail_claim_batches', alice), 0);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='mail_messages_page_idx'").get());
  pass('existing SQLite migration adds batch receipts/index without losing users, saves or old mail');
  assert.deepEqual((await summary(unsaved)).body, { unread: 0, unclaimed: 0, pending: 0, total: 0, latest: null });
  assert.equal((await request('/api/mail/summary')).status, 401);
  assert.equal((await request('/api/mail/claim-all', { method: 'POST', body: {} })).status, 401);
  assert.equal((await claimAll(alice, 'short', 1)).status, 400);
  assert.equal((await claimAll(alice, 'missing_revision_key', undefined)).body.code, 'MAIL_REVISION_REQUIRED');
  assert.equal((await claimAll(unsaved, 'unsaved_batch_key', 0)).body.code, 'SAVE_NOT_FOUND');
  pass('empty summary, authentication, required key/revision and missing-save guards');

  const time = Date.now() - 5000;
  seed(alice, 'sum_a', { kind: 'announcement', publishedAt: time });
  seed(alice, 'sum_b', { amount: 3, publishedAt: time });
  seed(alice, 'sum_c', { amount: 5, publishedAt: time, readAt: time - 1 });
  seed(alice, 'sum_d', { publishedAt: time, readAt: time - 1, claimedAt: time - 1 });
  seed(alice, 'sum_expired', { expiresAt: Date.now() - 1 });
  seed(alice, 'sum_revoked', { status: 'revoked' });
  seed(alice, 'sum_future', { publishedAt: Date.now() + 86400000 });
  seed(bob, 'sum_bob', { amount: 9 });
  const initialLatest = { id: 'sum_d', publishedAt: time, ids: ['sum_d', 'sum_c', 'sum_b', 'sum_a'] };
  assert.deepEqual((await summary(alice)).body, { unread: 2, unclaimed: 2, pending: 3, total: 4, latest: initialLatest });
  assert.deepEqual((await request('/api/mail/unread-count', { user: alice })).body, (await summary(alice)).body);
  assert.equal((await summary(bob)).body.total, 1);
  assert.equal((await request('/api/mail/sum_b/read', { user: alice, method: 'POST', body: {} })).status, 200);
  assert.deepEqual((await summary(alice)).body, { unread: 1, unclaimed: 2, pending: 3, total: 4, latest: initialLatest });
  const filtered = await request('/api/mail?filter=unclaimed&limit=1', { user: alice });
  assert.equal(filtered.body.messages.length, 1); assert.equal(filtered.body.total, 4); assert.equal(filtered.body.pending, 3);
  assert.equal(filtered.body.messages[0].id, 'sum_c'); assert.ok(filtered.body.nextCursor);
  assert.equal((await request('/api/mail?cursor=' + filtered.body.nextCursor, { user: alice })).body.code, 'MAIL_CURSOR_INVALID');
  assert.equal((await request('/api/mail?cursor=%25not-base64', { user: alice })).status, 400);
  assert.equal((await request('/api/mail?filter=other', { user: alice })).status, 400);
  pass('summary deduplicates unread/unclaimed, reading keeps reward pending, availability and account isolation');

  seed(alice, 'sum_0', { kind: 'announcement', publishedAt: time });
  const tiedLatest = (await summary(alice)).body.latest;
  assert.equal(tiedLatest.id, initialLatest.id); assert.equal(tiedLatest.publishedAt, initialLatest.publishedAt);
  assert.deepEqual(tiedLatest.ids, [...initialLatest.ids, 'sum_0']);
  assert.deepEqual(tiedLatest.ids.filter(id => !initialLatest.ids.includes(id)), ['sum_0']);
  assert.equal((await request('/api/mail?limit=1', { user: alice })).body.messages[0].id, 'sum_d');
  db.prepare("UPDATE mail_messages SET status='revoked' WHERE id='sum_0'").run();
  assert.deepEqual((await summary(alice)).body.latest, initialLatest);
  db.prepare("UPDATE mail_messages SET status='published',expires_at=? WHERE id='sum_0'").run(Date.now() - 1);
  assert.deepEqual((await summary(alice)).body.latest, initialLatest);
  pass('same-millisecond later low-id mail changes latest.ids without changing list order; revoked/expired ids excluded');

  const beforeReadC = db.prepare('SELECT read_at FROM mail_deliveries WHERE user_id=? AND message_id=?').get(alice.id, 'sum_c').read_at;
  const first = await claimAll(alice, 'alice_initial_batch', 1);
  assert.equal(first.status, 200); assert.equal(first.body.count, 2); assert.equal(first.body.revision, 2); assert.equal(first.body.hasMore, false);
  assert.deepEqual(first.body.messageIds, ['sum_c', 'sum_b']);
  assert.equal((await save(alice)).body.data.coins, 108);
  assert.equal((await summary(alice)).body.pending, 1);
  assert.equal(db.prepare('SELECT read_at FROM mail_deliveries WHERE user_id=? AND message_id=?').get(alice.id, 'sum_c').read_at, beforeReadC);
  assert.equal(count('gift_grants', alice), 2);
  const oldSingleReplay = await single(alice, 'sum_c', 'single_after_batch', 1);
  assert.equal(oldSingleReplay.status, 200); assert.equal(oldSingleReplay.body.claim.messageId, 'sum_c'); assert.equal(oldSingleReplay.body.idempotent, true);
  assert.equal((await single(alice, 'sum_c', 'alice_initial_batch', 2)).body.code, 'IDEMPOTENCY_CONFLICT');
  pass('batch grants once, advances revision once, marks read preserving prior read timestamp, old single replay compatible');

  db.prepare("UPDATE mail_messages SET status='revoked' WHERE id='sum_c'").run();
  db.prepare("UPDATE mail_messages SET expires_at=? WHERE id='sum_b'").run(Date.now() - 1);
  assert.equal((await put(alice, 2, data(999))).status, 200);
  seed(alice, 'after_batch_new', { amount: 13 });
  const replay = await claimAll(alice, 'alice_initial_batch', 1);
  assert.equal(replay.status, 200); assert.equal(replay.body.idempotent, true); assert.deepEqual(noMetadata(replay.body), first.body);
  assert.equal((await save(alice)).body.data.coins, 999); assert.equal((await save(alice)).body.revision, 3);
  assert.equal((await single(alice, 'sum_c', 'single_after_revoke', 1)).status, 200);
  const stale = await claimAll(alice, 'alice_stale_batch', 2);
  assert.equal(stale.status, 409); assert.equal(stale.body.code, 'MAIL_REVISION_CONFLICT'); assert.equal(stale.body.currentRevision, 3);
  assert.equal(count('mail_claim_batches', alice), 1); assert.equal((await summary(alice)).body.unclaimed, 1);
  assert.equal((await put(alice, 1, data(50))).status, 409);
  pass('lost-response retry survives expiry/revoke and newer save; stale devices cannot apply gifts or overwrite progress');

  const bobSameKey = await claimAll(bob, 'alice_initial_batch', 1);
  assert.equal(bobSameKey.status, 200); assert.deepEqual(bobSameKey.body.messageIds, ['sum_bob']); assert.equal((await save(bob)).body.data.coins, 34);
  const wrongAccount = await request('/api/mail/claim-all', { method: 'POST', user: bob, headers: { 'X-Nikki-Account-Id': alice.id }, body: { idempotencyKey: 'wrong_account_batch', baseRevision: 2 } });
  assert.equal(wrongAccount.status, 409); assert.equal(wrongAccount.body.code, 'ACCOUNT_CHANGED'); assert.equal((await save(bob)).body.data.coins, 34);
  const empty = await claimAll(bob, 'empty_bob_batch', 2); assert.equal(empty.status, 200); assert.equal(empty.body.count, 0); assert.equal(empty.body.revision, 2);
  seed(bob, 'bob_new_after_empty', { amount: 11 });
  const emptyReplay = await claimAll(bob, 'empty_bob_batch', 2); assert.deepEqual(noMetadata(emptyReplay.body), empty.body); assert.equal((await save(bob)).body.data.coins, 34);
  const bobSingle = await single(bob, 'bob_new_after_empty', 'bob_single_unique', 2); assert.equal(bobSingle.status, 200);
  assert.equal((await claimAll(bob, 'bob_single_unique', 3)).body.code, 'IDEMPOTENCY_CONFLICT');
  pass('batch keys are account-scoped, switched-account requests rejected, empty receipts immutable, single/batch keys cannot collide');

  const initialIds = [];
  for (let n = 0; n < 105; n++) { const id = `page_gift_${String(n).padStart(3, '0')}`; seed(pager, id, { publishedAt: time }); initialIds.push(id); }
  for (let n = 0; n < 7; n++) { const id = `page_note_${n}`; seed(pager, id, { kind: 'announcement', publishedAt: time }); initialIds.push(id); }
  const firstPage = await request('/api/mail?limit=17', { user: pager });
  assert.equal(firstPage.status, 200); assert.equal(firstPage.body.total, 112);
  seed(pager, 'new_after_first_page', { kind: 'announcement', publishedAt: Date.now() - 1 });
  let cursor = firstPage.body.nextCursor; const seen = firstPage.body.messages.map(m => m.id);
  while (cursor) {
    const page = await request('/api/mail?limit=17&cursor=' + encodeURIComponent(cursor), { user: pager });
    assert.equal(page.status, 200); seen.push(...page.body.messages.map(m => m.id)); cursor = page.body.nextCursor;
  }
  assert.deepEqual(seen, [...initialIds].sort().reverse()); assert.equal(new Set(seen).size, initialIds.length);
  const unclaimedIds = []; cursor = null;
  do {
    const page = await request('/api/mail?filter=unclaimed&limit=50' + (cursor ? '&cursor=' + cursor : ''), { user: pager });
    assert.equal(page.status, 200); assert.equal(page.body.total, 113); assert.equal(page.body.unclaimed, 105);
    unclaimedIds.push(...page.body.messages.map(m => m.id)); cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(unclaimedIds.length, 105); assert.equal(new Set(unclaimedIds).size, 105);
  pass('keyset pages preserve all same-timestamp ids without duplicates when new mail arrives; filtered pages keep full summary');

  const large1 = await claimAll(pager, 'pager_batch_first', 1);
  assert.equal(large1.status, 200); assert.equal(large1.body.count, 100); assert.equal(large1.body.hasMore, true); assert.equal(large1.body.revision, 2);
  const large1retry = await claimAll(pager, 'pager_batch_first', 1); assert.deepEqual(noMetadata(large1retry.body), large1.body);
  const large2 = await claimAll(pager, 'pager_batch_second', 2);
  assert.equal(large2.status, 200); assert.equal(large2.body.count, 5); assert.equal(large2.body.hasMore, false); assert.equal(large2.body.revision, 3);
  assert.equal((await save(pager)).body.data.coins, 105); assert.equal(count('gift_grants', pager), 105);
  assert.deepEqual((await summary(pager)).body, { unread: 8, unclaimed: 0, pending: 8, total: 113, latest: { id: 'new_after_first_page', publishedAt: db.prepare("SELECT published_at FROM mail_messages WHERE id='new_after_first_page'").get().published_at, ids: ['new_after_first_page'] } });
  const noReward = await request('/api/mail?filter=unclaimed', { user: pager }); assert.deepEqual(noReward.body.messages, []); assert.equal(noReward.body.nextCursor, null);
  pass('batch cap100, hasMore continuation, repeated first batch immutable, gift grants/read state exact');

  const secondDeviceLogin = await request('/api/auth/login', { method: 'POST', body: { username: alice.username, password: 'isolated-mail-password-2026' } });
  assert.equal(secondDeviceLogin.status, 200);
  const device2 = { ...alice, cookie: secondDeviceLogin.headers['set-cookie'][0].split(';')[0] };
  const concurrentSame = await Promise.all([claimAll(alice, 'concurrent_same_key', 3), claimAll(device2, 'concurrent_same_key', 3)]);
  assert.ok(concurrentSame.every(r => r.status === 200)); assert.deepEqual(noMetadata(concurrentSame[0].body), noMetadata(concurrentSame[1].body));
  assert.equal((await save(alice)).body.revision, 4); assert.equal((await save(alice)).body.data.coins, 1012);
  seed(alice, 'concurrent_different_gift', { amount: 17 });
  const concurrentDifferent = await Promise.all([claimAll(alice, 'concurrent_key_left', 4), claimAll(device2, 'concurrent_key_right', 4)]);
  assert.deepEqual(concurrentDifferent.map(r => r.status).sort(), [200, 409]);
  assert.equal((await save(alice)).body.revision, 5); assert.equal((await save(alice)).body.data.coins, 1029);
  assert.equal(Number(db.prepare("SELECT count(*) n FROM gift_grants WHERE user_id=? AND idempotency_key=?").get(alice.id, `mail:concurrent_different_gift:${alice.id}`).n), 1);
  seed(alice, 'concurrent_single_gift', { amount: 19 });
  const mixed = await Promise.all([single(device2, 'concurrent_single_gift', 'mixed_single_key', 5), claimAll(alice, 'mixed_batch_key', 5)]);
  assert.ok(mixed.every(r => [200, 409].includes(r.status))); assert.equal((await save(alice)).body.revision, 6); assert.equal((await save(alice)).body.data.coins, 1048);
  pass('real concurrent requests across two sessions: same-key replay, different-key revision conflict, single/batch race awards once');

  seed(alice, 'atomic_trigger_gift', { amount: 23 });
  const grantsBefore = count('gift_grants', alice), batchesBefore = count('mail_claim_batches', alice);
  db.exec("CREATE TRIGGER qa_reject_grant BEFORE INSERT ON gift_grants WHEN NEW.idempotency_key LIKE 'mail:atomic_trigger_gift:%' BEGIN SELECT RAISE(ABORT,'isolated injected failure'); END;");
  const failed = await claimAll(alice, 'atomic_failure_retry', 6); assert.equal(failed.status, 500);
  assert.equal((await save(alice)).body.revision, 6); assert.equal((await save(alice)).body.data.coins, 1048);
  assert.equal(count('gift_grants', alice), grantsBefore); assert.equal(count('mail_claim_batches', alice), batchesBefore);
  assert.equal(db.prepare("SELECT claimed_at FROM mail_deliveries WHERE message_id='atomic_trigger_gift'").get().claimed_at, null);
  db.exec('DROP TRIGGER qa_reject_grant');
  const retryAfterRollback = await claimAll(alice, 'atomic_failure_retry', 6); assert.equal(retryAfterRollback.status, 200); assert.equal(retryAfterRollback.body.revision, 7);
  assert.equal((await save(alice)).body.data.coins, 1071);
  pass('failure after save mutation rolls back save/grants/delivery/receipt atomically; retry can safely complete');

  db.prepare('INSERT INTO service_settings(id,free_entitlements,checkout_paused,revision,updated_at) VALUES(1,0,1,1,?) ON CONFLICT(id) DO UPDATE SET free_entitlements=0,checkout_paused=1').run(Date.now());
  assert.equal((await claimAll(alice, 'denied_entitlement_batch', 7)).body.code, 'CLOUD_SYNC_REQUIRED');
  const replayWithoutEntitlement = await claimAll(alice, 'alice_initial_batch', 1); assert.equal(replayWithoutEntitlement.status, 200); assert.deepEqual(noMetadata(replayWithoutEntitlement.body), first.body);
  db.exec('UPDATE service_settings SET free_entitlements=1');
  const original = db.prepare('SELECT payload,checksum FROM saves WHERE user_id=?').get(alice.id);
  db.prepare('UPDATE saves SET payload=? WHERE user_id=?').run('{broken', alice.id);
  const corrupt = await claimAll(alice, 'corrupt_save_batch', 7); assert.equal(corrupt.status, 409); assert.equal(corrupt.body.code, 'SAVE_CORRUPTED');
  db.prepare('UPDATE saves SET payload=?,checksum=? WHERE user_id=?').run(original.payload, original.checksum, alice.id);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  pass('new batches respect entitlements; successful receipts replay after entitlement change; corrupt save rejected safely');

  await restartApi();
  const restartedReplay = await claimAll(alice, 'alice_initial_batch', 1);
  assert.equal(restartedReplay.status, 200); assert.deepEqual(noMetadata(restartedReplay.body), first.body);
  assert.deepEqual(noMetadata((await claimAll(bob, 'empty_bob_batch', 2)).body), empty.body);
  assert.equal((await save(alice)).body.data.coins, 1071); assert.equal((await save(alice)).body.revision, 7);
  pass('successful and empty batch receipts survive real process restart with unchanged save');

  fs.mkdirSync(reportDir, { recursive: true });
  const result = { pass: true, checks, total: checks.length, isolatedSQLite: true, realHttp: true, productionRequests: false,
    cases: { paginationInitial: 112, paginationNewMail: 1, maximumBatch: 100, continuation: 5, sessionsConcurrent: 2 },
    backendSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'server/auth-api.js'))).digest('hex') };
  fs.writeFileSync(path.join(reportDir, 'backend-regression.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ pass: true, total: checks.length, report: path.join(reportDir, 'backend-regression.json') }));
}

(async () => {
  try { await main(); }
  catch (error) { fs.mkdirSync(reportDir, { recursive: true }); fs.writeFileSync(path.join(reportDir, 'backend-test-failure.log'), String(error.stack || error) + '\n' + logs); throw error; }
  finally {
    if (db) db.close();
    if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]); }
    const checked = path.resolve(temp);
    if (!checked.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(checked).startsWith('nikki-mail-improvements-')) throw new Error('Unsafe QA cleanup path');
    fs.rmSync(checked, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
