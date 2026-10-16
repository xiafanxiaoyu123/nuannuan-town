'use strict';

// HTTP integration test against an isolated temporary SQLite database only.
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const root = mkdtempSync(path.join(tmpdir(), 'nuannuan-service-qa-'));
let port, base;
const token = 'isolated-service-qa-admin';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child, checks = 0;
async function call(route, options = {}) {
  const res = await fetch(base + route, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  return { status: res.status, body: await res.json(), cookie: String(res.headers.get('set-cookie') || '').split(';')[0] };
}
async function start(free) {
  const isolatedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
  // Deliberately set checkout flags without a provider: saved pause/free settings
  // must still prevent checkout. No real payment configuration is inherited.
  const env = { ...isolatedEnvironment, API_PORT: String(port), AUTH_DB: path.join(root, 'isolated.sqlite'), DATA_DIR: root, COOKIE_SECURE: '0', ADMIN_API_TOKEN: token, ADMIN_PUBLIC_ORIGIN: base, APP_ORIGINS: `${base},http://other.test`, PAYMENT_PROVIDER: '', PAYMENT_CHECKOUT_ENABLED: '1', PORTAL_COMMERCE_READY: '1' };
  if (free === undefined) delete env.PUBLIC_FREE_ENTITLEMENTS; else env.PUBLIC_FREE_ENTITLEMENTS = free;
  child = spawn(process.execPath, ['server-api.js'], { cwd: path.resolve(__dirname, '../..'), env, stdio: ['ignore', 'ignore', 'pipe'] });
  for (let i = 0; i < 50; i++) { try { if ((await call('/api/healthz')).status === 200) return; } catch {} await sleep(50); }
  throw new Error('Isolated API failed to start');
}
async function stop() { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done; } }
function check(label, fn) { fn(); checks++; console.log(`PASS ${label}`); }
async function main() {
  try {
    const reservation = require('node:net').createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    port = reservation.address().port; base = `http://127.0.0.1:${port}`;
    await new Promise((resolve) => reservation.close(resolve));
    await start();
    const admin = { 'X-Admin-Token': token, Origin: base };
    const first = await call('/api/admin/service-settings', { headers: admin });
    check('unset environment defaults to uniform free access', () => { assert.equal(first.body.settings.freeEntitlements, true); assert.equal(first.body.settings.revision, 0); assert.equal(first.body.billing.checkoutEnabled, false); });
    const anon = await call('/api/admin/service-settings');
    const unauthorized = await call('/api/admin/service-settings', { method: 'PUT', headers: { Origin: base }, body: JSON.stringify({ freeEntitlements: false, baseRevision: 0 }) });
    check('anonymous reads and writes rejected', () => { assert.equal(anon.status, 401); assert.equal(unauthorized.status, 401); });
    const launch = await call('/api/admin/launch', { method: 'POST', headers: admin, body: '{}' });
    const login = await call('/api/admin/login', { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ ticket: launch.body.ticket }) });
    assert.equal(login.status, 200);
    const session = { Cookie: login.cookie, Origin: base };
    const payload = JSON.stringify({ freeEntitlements: false, baseRevision: 0 });
    const badOrigin = await call('/api/admin/service-settings', { method: 'PUT', headers: { ...admin, Origin: 'http://other.test' }, body: payload });
    const cookieWithoutOrigin = await call('/api/admin/service-settings', { method: 'PUT', headers: { Cookie: login.cookie }, body: payload });
    const badType = await call('/api/admin/service-settings', { method: 'PUT', headers: { ...session, 'Content-Type': 'text/plain' }, body: payload });
    check('cookie and token writes enforce Origin and JSON', () => { assert.equal(badOrigin.status, 403); assert.equal(cookieWithoutOrigin.status, 403); assert.equal(badType.status, 403); });
    const invalid = await call('/api/admin/service-settings', { method: 'PUT', headers: session, body: JSON.stringify({ freeEntitlements: 'false', baseRevision: 0 }) });
    check('strict input validation', () => assert.equal(invalid.status, 400));
    const registered = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: 'service_qa', password: 'qa-password-123' }) });
    assert.equal(registered.status, 201);
    const userHeaders = { Cookie: registered.cookie };
    const rights = await call('/api/account/entitlements', { headers: userHeaders });
    const save = { v: 3, started: true, coins: 321, owned: [], outfit: {}, shops: {}, placed: [], crops: {}, seeds: {}, decor: {}, house: 1, yardLv: 1, gday: 1 };
    const saved = await call('/api/save', { method: 'PUT', headers: userHeaders, body: JSON.stringify({ baseRevision: 0, data: save }) });
    check('free user gets cloud access without a paid entitlement', () => { assert.equal(rights.body.freeEntitlements, true); assert.deepEqual(rights.body.features.sort(), ['auto_update', 'cloud_sync']); assert.equal(saved.status, 200); });
    const accounts = await call('/api/admin/accounts', { headers: admin });
    const account = accounts.body.accounts[0];
    check('workbench exposes effective access and actual activity', () => { assert.equal(account.access.freeEntitlements, true); assert.equal(account.entitlements.length, 0); assert.ok(account.lastSeen > 0); assert.equal(accounts.body.stats.activeLast7Days, 1); });
    const closed = await call('/api/admin/service-settings', { method: 'PUT', headers: session, body: payload });
    const closedRights = await call('/api/account/entitlements', { headers: userHeaders });
    const closedSave = await call('/api/save', { headers: userHeaders });
    const closedPublic = await call('/api/billing/status');
    check('closing is immediate, persistent, and leaves checkout paused', () => { assert.equal(closed.status, 200); assert.equal(closed.body.settings.revision, 1); assert.equal(closed.body.settings.checkoutPaused, true); assert.equal(closedRights.body.freeEntitlements, false); assert.equal(closedSave.status, 402); assert.equal(closedPublic.body.freeEntitlements, false); assert.equal(closedPublic.body.checkoutEnabled, false); });
    const conflict = await call('/api/admin/service-settings', { method: 'PUT', headers: admin, body: JSON.stringify({ freeEntitlements: true, baseRevision: 0 }) });
    check('stale operators cannot overwrite newer settings', () => { assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'SERVICE_SETTINGS_CONFLICT'); });
    await stop(); await start('1');
    const restarted = await call('/api/admin/service-settings', { headers: admin });
    check('restart and environment changes do not overwrite saved choice', () => { assert.equal(restarted.body.settings.freeEntitlements, false); assert.equal(restarted.body.settings.checkoutPaused, true); assert.equal(restarted.body.settings.revision, 1); });
    const opened = await call('/api/admin/service-settings', { method: 'PUT', headers: admin, body: JSON.stringify({ freeEntitlements: true, baseRevision: 1 }) });
    const restored = await call('/api/save', { headers: userHeaders });
    const checkout = await call('/api/billing/checkout', { method: 'POST', headers: userHeaders, body: JSON.stringify({ acceptedTerms: true, clientRequestId: 'qa_free_checkout_forbidden' }) });
    check('reopening preserves original save and refuses purchase', () => { assert.equal(opened.body.settings.revision, 2); assert.equal(restored.status, 200); assert.equal(restored.body.data.coins, 321); assert.equal(checkout.status, 409); assert.equal(checkout.body.code, 'PUBLIC_FREE_ACCESS'); });
    const repeated = await call('/api/admin/service-settings', { method: 'PUT', headers: admin, body: JSON.stringify({ freeEntitlements: true, baseRevision: 2 }) });
    const audit = await call('/api/admin/audit', { headers: admin });
    check('same-value saves are idempotent and changes audited without secrets', () => { assert.equal(repeated.body.settings.revision, 2); const entries = audit.body.entries.filter((e) => e.action === 'service.free_access.update'); assert.equal(entries.length, 2); assert.equal(entries[0].detail.after.freeEntitlements, true); assert.equal(JSON.stringify(entries).includes(token), false); });
    const races = await Promise.all([1, 2].map(() => call('/api/admin/service-settings', { method: 'PUT', headers: admin, body: JSON.stringify({ freeEntitlements: false, baseRevision: 2 }) })));
    check('simultaneous writes have a single winner', () => assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]));
    console.log(JSON.stringify({ status: 'ok', checks, isolatedDatabase: true }));
  } finally {
    await stop();
    if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('nuannuan-service-qa-')) throw new Error('Temporary cleanup path not safe');
    rmSync(root, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
