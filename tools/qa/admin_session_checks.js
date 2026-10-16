// 管理台免手输会话回归：短期票据单次兑换、HttpOnly Cookie、Origin/CSRF 和退出。
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const port = 57000 + Math.floor(Math.random() * 500);
const root = mkdtempSync(path.join(tmpdir(), 'nuannuan-admin-session-'));
const token = 'qa-admin-session-token-20261012';
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server-api.js'], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, API_PORT: String(port), DATA_DIR: root, COOKIE_SECURE: '0', ADMIN_API_TOKEN: token, ADMIN_PUBLIC_ORIGIN: origin, APP_ORIGINS: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(pathname, options = {}) {
  const res = await fetch(base + pathname, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  let body = null; try { body = await res.json(); } catch { /* empty */ }
  return { res, body };
}
function cookie(response) { return String(response.headers.get('set-cookie') || '').split(';')[0]; }
async function main() {
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) { try { const h = await call('/api/healthz'); ready = h.res.ok; if (ready) break; } catch { /* waiting */ } await sleep(50); }
    assert.equal(ready, true, 'API 应启动');
    const launch = await call('/api/admin/launch', { method: 'POST', headers: { 'X-Admin-Token': token, Origin: origin }, body: '{}' });
    assert.equal(launch.res.status, 200); assert.equal(launch.body.expiresIn, 90); assert.ok(launch.body.ticket);
    const logged = await call('/api/admin/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ ticket: launch.body.ticket }) });
    assert.equal(logged.res.status, 200); const adminCookie = cookie(logged.res); assert.match(adminCookie, /^nikki-admin=/); assert.match(String(logged.res.headers.get('set-cookie')), /HttpOnly/); assert.match(String(logged.res.headers.get('set-cookie')), /SameSite=Strict/);
    const session = await call('/api/admin/session', { headers: { Cookie: adminCookie } });
    assert.equal(session.res.status, 200); assert.equal(session.body.role, 'admin');
    const repeat = await call('/api/admin/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ ticket: launch.body.ticket }) });
    assert.equal(repeat.res.status, 401);
    const crossRead = await call('/api/admin/session', { headers: { Cookie: adminCookie, Origin: 'http://evil.example' } });
    assert.equal(crossRead.res.status, 403);
    const badWrite = await call('/api/admin/logout', { method: 'POST', headers: { Cookie: adminCookie, Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(badWrite.res.status, 403);
    const race = await call('/api/admin/launch', { method: 'POST', headers: { 'X-Admin-Token': token }, body: '{}' });
    const redeemed = await Promise.all([1, 2].map(() => call('/api/admin/login', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify({ ticket: race.body.ticket }) })));
    assert.deepEqual(redeemed.map((x) => x.res.status).sort(), [200, 401]);
    const logout = await call('/api/admin/logout', { method: 'POST', headers: { Cookie: adminCookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(logout.res.status, 200);
    const after = await call('/api/admin/session', { headers: { Cookie: adminCookie } });
    assert.equal(after.res.status, 401);
    console.log(JSON.stringify({ status: 'ok', cookie: 'HttpOnly; SameSite=Strict', singleUse: true, csrf: true, logout: true }));
  } finally {
    child.kill('SIGKILL'); await sleep(120);
    try { rmSync(root, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }
  }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
