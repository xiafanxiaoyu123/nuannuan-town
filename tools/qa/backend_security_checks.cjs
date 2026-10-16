// Synthetic request-boundary regression. Children use fresh temporary databases,
// a scrubbed environment, loopback HTTP, and no payment/admin credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { createRequestSecurity, createLoginFailureLimiter, sessionToken } = require('../../server/request-security');
const checks = [];

function group(name, run) { run(); checks.push(name); }
function request(address = '127.0.0.1', headers = {}) { return { socket: { remoteAddress: address }, headers }; }

function pureChecks() {
  group('proxy: untrusted socket ignores forged forwarding headers', () => {
    const policy = createRequestSecurity();
    assert.equal(policy.clientIp(request('203.0.113.8', { 'x-forwarded-for': '192.0.2.9' })), '203.0.113.8');
    assert.equal(policy.clientIp(request('::ffff:127.0.0.1', { 'x-forwarded-for': '192.0.2.9' })), '127.0.0.1');
    assert.equal(policy.clientIp(request('::ffff:7f00:1')), '127.0.0.1');
    assert.equal(policy.clientIp(request('bad socket')), 'unknown');
  });
  group('proxy: trusted chain stops at first untrusted hop from the right', () => {
    const policy = createRequestSecurity({ TRUST_PROXY: 'loopback,10.42.0.0/16,2001:db8:1234::/48' });
    assert.equal(policy.clientIp(request('127.0.0.1', { 'x-forwarded-for': '192.0.2.9, 203.0.113.8' })), '203.0.113.8');
    assert.equal(policy.clientIp(request('127.0.0.1', { 'x-forwarded-for': '192.0.2.9, 10.42.5.6' })), '192.0.2.9');
    assert.equal(policy.clientIp(request('127.0.0.1', { 'x-forwarded-for': 'spoofed, 203.0.113.8' })), '203.0.113.8');
    assert.equal(policy.clientIp(request('10.43.0.1', { 'x-forwarded-for': '192.0.2.9' })), '10.43.0.1');
    assert.equal(policy.clientIp(request('2001:db8:1234::7', { 'x-forwarded-for': '192.0.2.9' })), '192.0.2.9');
    assert.equal(policy.clientIp(request('::1', { 'x-forwarded-for': '::ffff:192.0.2.9' })), '192.0.2.9');
  });
  group('proxy: malformed chains and unrestricted proxy settings fail closed', () => {
    const policy = createRequestSecurity({ TRUST_PROXY: 'loopback' });
    for (const forwarded of ['192.0.2.9, invalid', '192.0.2.9,', '1.2.3.4:80', Array(34).fill('192.0.2.9').join(','), 'x'.repeat(4097)]) {
      assert.equal(policy.clientIp(request('127.0.0.1', { 'x-forwarded-for': forwarded })), '127.0.0.1');
    }
    for (const TRUST_PROXY of ['true', '1', '*', '0.0.0.0/0', '::/0', '192.0.2.0/33', '::1/129', '127.0.0.1/', 'localhost']) {
      assert.throws(() => createRequestSecurity({ TRUST_PROXY }), /Invalid TRUST_PROXY/);
    }
  });
  group('CORS: missing production allowlist rejects all Origin requests', () => {
    for (const settings of [{ NODE_ENV: 'production' }, { COOKIE_SECURE: '1' }]) {
      const policy = createRequestSecurity(settings);
      assert.equal(policy.isOriginAllowed(request()), true);
      for (const origin of ['https://evil.example', 'null', 'https://localhost', 'http://127.0.0.1', '', '*']) {
        assert.equal(policy.isOriginAllowed(request('127.0.0.1', { origin, host: '127.0.0.1' })), false);
        assert.deepEqual(policy.originHeaders(request('127.0.0.1', { origin })), {});
      }
    }
  });
  group('CORS: development allows only actual loopback HTTP same-origin', () => {
    const policy = createRequestSecurity();
    for (const [address, host] of [['127.0.0.1', '127.0.0.1:5173'], ['::1', '[::1]:5173'], ['::ffff:127.0.0.1', 'localhost:5173']]) {
      const origin = `http://${host}`;
      assert.equal(policy.isOriginAllowed(request(address, { origin, host })), true);
      assert.equal(policy.originHeaders(request(address, { origin, host }))['Access-Control-Allow-Origin'], origin);
    }
    for (const [address, host, origin] of [
      ['127.0.0.1', 'evil.example:5173', 'http://evil.example:5173'],
      ['203.0.113.1', '127.0.0.1:5173', 'http://127.0.0.1:5173'],
      ['127.0.0.1', 'localhost:5173', 'http://localhost:5174'],
      ['127.0.0.1', 'localhost:5173', 'https://localhost:5173'],
      ['127.0.0.1', 'localhost:5173', 'null'],
    ]) assert.equal(policy.isOriginAllowed(request(address, { host, origin })), false);
  });
  group('CORS: explicit web/APK origins and legacy app origin stay exact', () => {
    const policy = createRequestSecurity({ COOKIE_SECURE: '1', APP_ORIGINS: 'https://trusted.example,https://localhost' });
    for (const origin of ['https://trusted.example', 'https://localhost']) assert.equal(policy.isOriginAllowed(request('203.0.113.1', { origin })), true);
    for (const origin of ['https://trusted.example.evil', 'http://localhost', 'https://localhost:8443', 'null']) assert.equal(policy.isOriginAllowed(request('127.0.0.1', { origin })), false);
    assert.equal(createRequestSecurity({ APP_ORIGIN: 'app://game' }).isOriginAllowed(request('127.0.0.1', { origin: 'app://game' })), true);
    for (const origin of ['*', 'null', 'https://trusted.example/path', 'https://trusted.example/', 'https://user@trusted.example']) assert.throws(() => createRequestSecurity({ APP_ORIGINS: origin }), /Invalid APP_ORIGINS/);
  });
  group('session: authentication and logout share Cookie/Bearer token precedence', () => {
    assert.equal(sessionToken(request('127.0.0.1', { cookie: 'session=cookie-token', authorization: 'Bearer bearer-token' })), 'cookie-token');
    assert.equal(sessionToken(request('127.0.0.1', { authorization: 'Bearer bearer-token' })), 'bearer-token');
    assert.equal(sessionToken(request('127.0.0.1', { authorization: 'bearer bearer-token' })), 'bearer-token');
    assert.equal(sessionToken(request('127.0.0.1', { cookie: 'session=%ZZ', authorization: 'Bearer bearer-token' })), 'bearer-token');
    for (const authorization of ['Basic anything', 'Bearer', 'Bearer first second', ['Bearer token']]) assert.equal(sessionToken(request('127.0.0.1', { authorization })), '');
  });
  group('account failures: bounded cooldown, normalized names, success and expiry', () => {
    let timestamp = 100000;
    const limiter = createLoginFailureLimiter({ now: () => timestamp });
    for (let index = 0; index < 9; index += 1) assert.equal(limiter.failure('Qa.账号'), 0);
    assert.equal(limiter.failure('qa.账号'), 30);
    assert.equal(limiter.blocked('QA.账号'), 30);
    assert.equal(limiter.blocked('unrelated'), 0);
    timestamp += 31000;
    assert.equal(limiter.blocked('qa.账号'), 0);
    assert.equal(limiter.failure('qa.账号'), 30);
    timestamp += 31000;
    limiter.success('QA.账号');
    assert.equal(limiter.failure('qa.账号'), 0);
    for (let index = 0; index < 9; index += 1) limiter.failure('qa.账号');
    timestamp += 15 * 60000 + 1;
    assert.equal(limiter.blocked('qa.账号'), 0);
    assert.equal(limiter.failure('qa.账号'), 0);
  });
  group('account failures: invalid identities and capacity are bounded', () => {
    let timestamp = 0;
    const limiter = createLoginFailureLimiter({ now: () => timestamp, capacity: 1 });
    for (const name of [null, {}, 'a', 'a'.repeat(33), 'name with space']) assert.equal(limiter.failure(name), 0);
    assert.equal(limiter.failure('first'), 0);
    assert.equal(limiter.failure('other'), 30);
    timestamp += 15 * 60000 + 1;
    assert.equal(limiter.failure('other'), 0);
  });
}

function childServer() {
  const originalNow = Date.now;
  let advanceMs = 0;
  Date.now = () => originalNow() + advanceMs;
  const { handleApi } = require('../../server/auth-api');
  const server = http.createServer((req, res) => Promise.resolve(handleApi(req, res)).catch((error) => {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }));
  process.on('message', (message) => {
    if (message.type === 'advance') { advanceMs += message.ms; process.send({ type: 'advanced' }); }
    if (message.type === 'stop') server.close(() => process.exit(0));
  });
  server.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
}

async function withApi(settings, run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nuannuan-security-'));
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'COMSPEC'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { AUTH_DB: path.join(temp, 'accounts.sqlite'), DATA_DIR: temp, PUBLIC_FREE_ENTITLEMENTS: '1', TEST_AUTH_ENABLED: '0', COOKIE_SECURE: '0', ...settings });
  const child = fork(__filename, ['--api-child'], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let errorOutput = '';
  child.stderr.on('data', (chunk) => { errorOutput += chunk; });
  const waitMessage = (type) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${type}: ${errorOutput}`)), 15000);
    const onMessage = (message) => { if (message.type === type) finish(null, message); };
    const onExit = (code) => finish(new Error(`Child exited ${code}: ${errorOutput}`));
    function finish(error, value) { clearTimeout(timeout); child.off('message', onMessage); child.off('exit', onExit); error ? reject(error) : resolve(value); }
    child.on('message', onMessage); child.on('exit', onExit);
  });
  try {
    const ready = await waitMessage('ready');
    const base = `http://127.0.0.1:${ready.port}`;
    const call = async (route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') => {
      const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
    };
    await run({ call, base, advance: async (ms) => { const advanced = waitMessage('advanced'); child.send({ type: 'advance', ms }); await advanced; } });
  } finally {
    if (child.exitCode === null) {
      const stopped = new Promise((resolve) => child.once('exit', resolve));
      child.send({ type: 'stop' });
      const timeout = setTimeout(() => child.kill(), 3000);
      await stopped; clearTimeout(timeout);
    }
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('nuannuan-security-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function apiChecks() {
  await withApi({ NODE_ENV: 'production', COOKIE_SECURE: '1' }, async ({ call }) => {
    for (const origin of ['https://evil.example', 'null', 'https://localhost']) {
      const denied = await call('/api/auth/me', undefined, { Origin: origin });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    }
    const account = { username: 'bearer_logout_qa', password: 'synthetic-password-only' };
    const registration = await call('/api/auth/register', account);
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    assert.equal((await call('/api/auth/me', undefined, { Authorization: `Bearer ${token}` })).status, 200);
    assert.equal((await call('/api/auth/logout', {}, { Authorization: `Bearer ${token}` })).status, 200);
    assert.equal((await call('/api/auth/me', undefined, { Authorization: `Bearer ${token}` })).status, 401);
    assert.equal((await call('/api/billing/status')).body.checkoutEnabled, false);
    const statuses = [];
    for (let index = 0; index < 11; index += 1) statuses.push((await call('/api/auth/login', { username: `missing_qa_${index}`, password: 'wrong-password' }, { 'X-Forwarded-For': `192.0.2.${index + 1}` })).status);
    assert.deepEqual(statuses, [...Array(10).fill(401), 429]);
    checks.push('HTTP: empty production CORS denied, no-Origin native path, Bearer logout, forged-IP rate limit, checkout stays off');
  });
  await withApi({ NODE_ENV: 'production', COOKIE_SECURE: '1', TRUST_PROXY: 'loopback', APP_ORIGINS: 'https://trusted.example,https://localhost' }, async ({ call, advance }) => {
    for (const origin of ['https://trusted.example', 'https://localhost']) {
      const allowed = await call('/api/healthz', undefined, { Origin: origin });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
      assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    }
    const denied = await call('/api/auth/login', {}, { Origin: 'https://evil.example' });
    assert.equal(denied.status, 403);
    const preflight = await call('/api/auth/login', undefined, { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }, 'OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    const account = { username: 'account_cooldown_qa', password: 'synthetic-password-only' };
    assert.equal((await call('/api/auth/register', account)).status, 201);
    // Failure count follows the account even with different trusted-proxy client IPs.
    for (let index = 0; index < 9; index += 1) assert.equal((await call('/api/auth/login', { ...account, password: 'wrong-password' }, { 'X-Forwarded-For': `192.0.2.${index + 1}` })).status, 401);
    const blocked = await call('/api/auth/login', { username: account.username.toUpperCase(), password: 'wrong-password' }, { 'X-Forwarded-For': '198.51.100.1' });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await call('/api/auth/login', account, { 'X-Forwarded-For': '198.51.100.2' })).status, 429);
    await advance(31000);
    assert.equal((await call('/api/auth/login', account, { 'X-Forwarded-For': '198.51.100.3' })).status, 200);
    assert.equal((await call('/api/auth/login', { ...account, password: 'wrong-password' }, { 'X-Forwarded-For': '198.51.100.4' })).status, 401);
    checks.push('HTTP: exact web/APK CORS, denied preflight, cross-IP account cooldown, successful retry clears failures');
  });
  await withApi({}, async ({ call, base }) => {
    const response = await call('/api/healthz', undefined, { Origin: base });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), base);
    assert.equal((await call('/api/healthz', undefined, { Origin: 'http://evil.example' })).status, 403);
    checks.push('HTTP: loopback same-origin development remains usable');
  });
}

if (process.argv.includes('--api-child')) childServer();
else (async () => {
  pureChecks();
  if (!process.argv.includes('--helpers-only')) await apiChecks();
  const report = { pass: true, checkedAt: new Date().toISOString(), scope: 'synthetic pure helpers and isolated loopback API; no production/device/package claim', groups: checks };
  const outputIndex = process.argv.indexOf('--out');
  if (outputIndex >= 0) fs.writeFileSync(path.resolve(process.argv[outputIndex + 1]), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`backend security: PASS (${checks.length} groups)`);
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
