// 管理台 API 回归：账号列表、存档摘要、礼包加法、revision 校验与幂等。
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = 56000 + Math.floor(Math.random() * 500);
const root = mkdtempSync(path.join(tmpdir(), 'nuannuan-admin-qa-'));
const token = 'qa-admin-token-20261012';
const isolatedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)));
const child = spawn(process.execPath, ['server-api.js'], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...isolatedEnvironment, API_PORT: String(port), DATA_DIR: root, AUTH_DB: path.join(root, 'accounts.sqlite'), COOKIE_SECURE: '0', PUBLIC_FREE_ENTITLEMENTS: '1', PAYMENT_CHECKOUT_ENABLED: '0', ADMIN_API_TOKEN: token, APP_ORIGINS: `http://127.0.0.1:${port}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(pathname, options = {}) {
  const res = await fetch(base + pathname, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  let body = null; try { body = await res.json(); } catch { /* empty */ }
  return { res, body };
}
async function main() {
  try {
    let health;
    for (let i = 0; i < 40; i++) { try { health = await call('/api/healthz'); if (health.res.ok) break; } catch { /* waiting */ } await sleep(50); }
    assert.equal(health?.body?.ok, true, 'API 应启动');
    const username = `adminqa_${Date.now()}`;
    const registered = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password: 'qa-password-123' }) });
    assert.equal(registered.res.status, 201);
    const cookie = String(registered.res.headers.get('set-cookie') || '').split(';')[0];
    const save = { v: 3, started: true, coins: 200, owned: ['d_reunion'], outfit: { hair: 'h_default', dress: 'd_reunion', shoes: 's_default' }, shops: {}, placed: [], crops: {}, seeds: {}, decor: {}, house: 1, yardLv: 1, gday: 0 };
    const saved = await call('/api/save', { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify({ baseRevision: 0, data: save }) });
    assert.equal(saved.res.status, 200);
    const listed = await call('/api/admin/accounts?page=1&pageSize=20', { headers: { 'X-Admin-Token': token } });
    assert.equal(listed.res.status, 200); assert.ok(listed.body.accounts.some((x) => x.username === username));
    const account = listed.body.accounts.find((x) => x.username === username);
    assert.equal(account.save.coins, 200); assert.equal(account.save.revision, 1);
    for (const [index, baseRevision] of [undefined, null, -1, 1.5, '1'].entries()) {
      const rejected = await call(`/api/admin/accounts/${account.id}/gift`, { method: 'POST', headers: { 'X-Admin-Token': token }, body: JSON.stringify({ idempotencyKey: `giftqa_invalid_revision_${index}`, baseRevision, ops: [{ type: 'coins', mode: 'add', amount: 500 }] }) });
      assert.equal(rejected.res.status, 400, '缺省或非法版本不能直接发放礼包');
      assert.equal(rejected.body.code, 'SAVE_REVISION_REQUIRED');
    }
    const stale = await call(`/api/admin/accounts/${account.id}/gift`, { method: 'POST', headers: { 'X-Admin-Token': token }, body: JSON.stringify({ idempotencyKey: 'giftqa_stale_revision', baseRevision: 0, ops: [{ type: 'coins', mode: 'add', amount: 500 }] }) });
    assert.equal(stale.res.status, 409, '陈旧版本不能直接发放礼包');
    const unchanged = await call('/api/save', { headers: { Cookie: cookie } });
    assert.equal(unchanged.body.revision, 1); assert.equal(unchanged.body.data.coins, 200);
    const giftBody = JSON.stringify({ idempotencyKey: `giftqa_${Date.now()}_a`, baseRevision: 1, ops: [{ type: 'coins', mode: 'add', amount: 500 }] });
    const gift = await call(`/api/admin/accounts/${account.id}/gift`, { method: 'POST', headers: { 'X-Admin-Token': token }, body: giftBody });
    assert.equal(gift.res.status, 200); assert.equal(gift.body.save.coins, 700); assert.equal(gift.body.gift.revision, 2);
    const duplicate = await call(`/api/admin/accounts/${account.id}/gift`, { method: 'POST', headers: { 'X-Admin-Token': token }, body: giftBody });
    assert.equal(duplicate.res.status, 200); assert.equal(duplicate.body.idempotent, true);
    const detail = await call(`/api/admin/accounts/${account.id}`, { headers: { 'X-Admin-Token': token } });
    assert.equal(detail.body.save.data.coins, 700); assert.equal(detail.body.save.revision, 2);
    const audit = await call('/api/admin/audit?limit=10', { headers: { 'X-Admin-Token': token } });
    assert.equal(audit.res.status, 200); assert.equal(audit.body.entries.filter((x) => x.action === 'gift.issue').length, 1);
    console.log(JSON.stringify({ status: 'ok', account: username, revision: detail.body.save.revision, coins: detail.body.save.data.coins, idempotent: duplicate.body.idempotent, auditEntries: audit.body.entries.length }));
  } finally {
    child.kill('SIGKILL');
    await sleep(120);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('nuannuan-admin-qa-'));
    try { rmSync(root, { recursive: true, force: true }); } catch { console.warn(`临时数据目录未能立即清理：${root}`); }
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
