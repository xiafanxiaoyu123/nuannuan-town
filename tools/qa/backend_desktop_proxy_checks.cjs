// Actual Windows Electron host, copied byte-for-byte to a fresh temporary app.
// No no-sandbox flag, production profile, real database, credentials or update URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, fork } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const argument = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const OS_KEYS = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'comspec', 'pathext', 'appdata', 'localappdata', 'userprofile']);
const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => OS_KEYS.has(key.toLowerCase())));

function apiChild() {
  const { handleApi } = require('../../server/auth-api');
  const server = http.createServer((req, res) => {
    process.send({ type: 'request', path: req.url.split('?')[0], method: req.method, originPresent: req.headers.origin !== undefined });
    Promise.resolve(handleApi(req, res)).catch((error) => { if (!res.headersSent) res.writeHead(500); res.end(JSON.stringify({ error: error.message })); });
  });
  process.on('message', (message) => { if (message.type === 'stop') server.close(() => process.exit(0)); });
  server.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
async function waitFor(fn, label, timeout = 30000) {
  let last; const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await sleep(120); }
  throw new Error(`${label} timed out: ${last?.message || ''}`);
}
async function connectCdp(url) {
  const ws = new WebSocket(url), pending = new Map(), handlers = []; let serial = 0;
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) { handlers.forEach((handler) => handler(message)); return; }
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); clearTimeout(task.timeout);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  ws.addEventListener('close', () => { for (const task of pending.values()) { clearTimeout(task.timeout); task.reject(new Error('CDP connection closed')); } pending.clear(); });
  return {
    on(handler) { handlers.push(handler); }, close() { ws.close(); },
    call(method, params = {}) { return new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }));
    }); },
  };
}
function filesUnder(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `No symlink in candidate: ${name}`);
    return entry.isDirectory() ? filesUnder(directory, name) : [name];
  });
}

async function main() {
  assert.equal(process.platform, 'win32', 'This suite validates the actual Windows Electron host');
  const gameDir = path.resolve(argument('--game-dir', path.join(ROOT, 'output/backend-fixes-20261017-0220/candidates/esm')));
  const out = path.resolve(argument('--out', path.join(ROOT, 'output/backend-fixes-20261017-0220/desktop-proxy')));
  assert.ok(!fs.existsSync(out), 'Output must be a fresh evidence directory');
  assert.ok(fs.existsSync(path.join(gameDir, 'js/core/state.js')) && fs.existsSync(path.join(gameDir, 'index.html')));
  fs.mkdirSync(out, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nuannuan-backend-desktop-'));
  const appDir = path.join(tempRoot, 'app'), profile = path.join(tempRoot, 'profile'), dataDir = path.join(out, 'synthetic-api-data');
  fs.mkdirSync(appDir); fs.mkdirSync(dataDir);
  const report = { startedAt: new Date().toISOString(), pass: false, scope: 'Actual standard Windows Electron host + candidate ESM + synthetic loopback API; not an EXE package, production or physical Android acceptance', gameDir, checks: [], runtimeErrors: [], rendererNetwork: [], blockedExternal: [], upstreamRequests: [], sourceHashes: {}, cleanup: {} };
  let api, electron, proxy, page, browser; const logs = [];
  const evaluate = async (expression) => {
    const result = await page.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const check = (name, data = {}) => report.checks.push({ name, ...data });
  const record = (prefix, child) => { child.stdout?.on('data', (chunk) => logs.push(`[${prefix}] ${chunk}`)); child.stderr?.on('data', (chunk) => logs.push(`[${prefix}] ${chunk}`)); };
  async function stop(child, tree = false) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    if (tree) await new Promise((resolve) => { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { env: cleanEnvironment(), windowsHide: true, stdio: 'ignore' }); killer.once('exit', resolve); killer.once('error', resolve); });
    else if (child.connected) child.send({ type: 'stop' }); else child.kill();
    await Promise.race([exited, sleep(3000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await Promise.race([exited, sleep(3000)]); }
  }
  try {
    for (const file of ['main.js', 'preload.js', 'updater.js', 'package.json']) {
      const source = path.join(ROOT, 'desktop', file), target = path.join(appDir, file);
      fs.copyFileSync(source, target); assert.equal(hash(target), hash(source)); report.sourceHashes[`desktop/${file}`] = hash(source);
    }
    const candidateFiles = filesUnder(gameDir);
    const manifest = candidateFiles.map((file) => {
      const source = path.join(gameDir, file), target = path.join(appDir, 'dist', file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      assert.equal(hash(source), hash(target)); return { path: file.replace(/\\/g, '/'), bytes: fs.statSync(source).size, sha256: hash(source) };
    });
    fs.writeFileSync(path.join(out, 'copied-source-manifest.json'), JSON.stringify({ host: report.sourceHashes, candidate: manifest }, null, 2));
    check('Host and candidate copied byte-for-byte to new temporary app', { hostFiles: 4, candidateFiles: manifest.length });

    api = fork(__filename, ['--api-child'], { cwd: ROOT, env: { ...cleanEnvironment(), AUTH_DB: path.join(dataDir, 'accounts.sqlite'), DATA_DIR: dataDir, COOKIE_SECURE: '0', NODE_ENV: 'production', PUBLIC_FREE_ENTITLEMENTS: '1', PAYMENT_CHECKOUT_ENABLED: '0', TEST_AUTH_ENABLED: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
    record('api', api);
    const ready = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Synthetic API did not start')), 15000);
      api.on('message', (message) => { if (message.type === 'request') report.upstreamRequests.push(message); if (message.type === 'ready') { clearTimeout(timeout); resolve(message); } });
      api.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Synthetic API exited ${code}`)); });
    });
    const apiBase = `http://127.0.0.1:${ready.port}`;
    proxy = http.createServer((req, res) => {
      let target; try { target = new URL(req.url); } catch { res.writeHead(403).end(); return; }
      if (target.origin !== apiBase || target.protocol !== 'http:') { report.blockedExternal.push({ method: req.method, origin: target.origin }); res.writeHead(403).end('External network disabled'); return; }
      const upstream = http.request({ hostname: '127.0.0.1', port: ready.port, method: req.method, path: target.pathname + target.search, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
    });
    proxy.on('connect', (req, socket) => { report.blockedExternal.push({ method: 'CONNECT', origin: req.url }); socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const debugPort = await freePort(), executable = path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe');
    const args = [path.join(appDir, 'main.js'), `--user-data-dir=${profile}`, `--api-base=${apiBase}`, '--update-manifest=', `--remote-debugging-port=${debugPort}`, `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=127.0.0.1;localhost;[::1]', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost, EXCLUDE [::1]', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-sync', '--no-first-run', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];
    assert.ok(!args.some((arg) => /no-sandbox|disable-sandbox/.test(arg)));
    report.launch = { executable, executableSha256: hash(executable), args, environmentKeys: Object.keys(cleanEnvironment()), sandboxSource: 'unchanged desktop/main.js webPreferences.sandbox=true', isolatedProfile: profile };
    electron = spawn(executable, args, { cwd: appDir, env: cleanEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); record('electron', electron);
    const target = await waitFor(async () => {
      if (electron.exitCode !== null) throw new Error(`Electron exited ${electron.exitCode}`);
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      return targets.find((item) => item.type === 'page' && item.url.startsWith('app://game/') && item.webSocketDebuggerUrl);
    }, 'Electron app page');
    page = await connectCdp(target.webSocketDebuggerUrl);
    const browserTarget = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
    browser = await connectCdp(browserTarget.webSocketDebuggerUrl);
    page.on((message) => {
      if (message.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(message.params.exceptionDetails);
      if (message.method === 'Network.requestWillBeSent' && /^(https?|wss?):/.test(message.params.request.url)) report.rendererNetwork.push(message.params.request.url);
    });
    await page.call('Runtime.enable'); await page.call('Page.enable'); await page.call('Network.enable');
    await page.call('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
    await page.call('Page.navigate', { url: `app://game/index.html?slot=backend-desktop-proxy-${process.pid}` });
    const readyPage = () => waitFor(() => evaluate('!!globalThis.__game && !document.getElementById("boot")'), 'Current game bootstrap');
    await readyPage();
    const preload = await evaluate('(async()=>({url:location.href,apiBase:globalThis.__NIKKI_API_BASE__,requestBase:NikkiDesktop.requestBase,desktopApiBase:NikkiDesktop.apiBase,nodeAccess:typeof process,updates:await NikkiDesktop.updates.status()}))()');
    assert.equal(preload.apiBase, 'app://game'); assert.equal(preload.requestBase, 'app://game'); assert.equal(preload.desktopApiBase, apiBase); assert.equal(preload.nodeAccess, 'undefined'); assert.equal(preload.updates.configured, false); assert.equal(preload.updates.canCheck, false);
    check('Actual sandboxed host preload, isolated slot and updates disabled', preload);

    const account = await evaluate(`(async()=>{ const call=async(route,body)=>{const response=await fetch('app://game'+route,{method:body===undefined?'GET':'POST',credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}; const registration=await call('/api/auth/register',{username:'desktop_proxy_${Date.now()}',password:'synthetic-desktop-password-2026'});return {registration,me:await call('/api/auth/me'),entitlements:await call('/api/account/entitlements'),billing:await call('/api/billing/status'),cookiesVisible:document.cookie};})()`);
    assert.equal(account.registration.status, 201); assert.equal(account.me.status, 200); assert.equal(account.me.body.user.id, account.registration.body.user.id); assert.equal(account.entitlements.status, 200); assert.equal(account.entitlements.body.freeEntitlements, true); assert.ok(account.entitlements.body.features.includes('cloud_sync')); assert.equal(account.billing.body.checkoutEnabled, false); assert.ok(!account.cookiesVisible.includes('session='));
    check('Real app://game registration retains HttpOnly Cookie, account and free cloud access', { userId: account.me.body.user.id, checkoutEnabled: false });

    // Keep the synthetic frames away from the fixed closet and door tiles; the
    // game correctly returns obstructed furniture to inventory during startup.
    const snapshot = await evaluate(`(async()=>{const state=await import('/js/core/state.js');const legacy=state.serializeState();legacy.coins=43721;legacy.started=true;legacy.seeds.fertilizer=7;legacy.stats.fertilizer=3;legacy.decor.photo_frame=2;legacy.placedIn=[{id:'photo_frame',gx:6,gz:5,rot:0,photo:'sakura'},{id:'photo_frame',gx:8,gz:5,rot:0,photo:6}];state.replaceSaveData(legacy);const data=state.serializeState();const exported=state.exportSaveFile();const preview=state.previewSaveImport(exported.text);globalThis.__desktopQaSnapshot=data;return {data,exportedFilename:exported.filename,previewCoins:preview.summary.coins,flushed:state.flushSave()};})()`);
    assert.equal(snapshot.data.coins, 43721); assert.equal(snapshot.data.stats.fertilizer, 10); assert.equal(Object.hasOwn(snapshot.data.seeds, 'fertilizer'), false); assert.equal(snapshot.data.placedIn[0].photo, 'sakura'); assert.equal(snapshot.data.placedIn[1].photo, 6); assert.equal(snapshot.previewCoins, 43721); assert.equal(snapshot.flushed, true);
    check('Actual current state serialization, local persistence and export/import preview preserve old fertilizer and both theme formats', { coins: 43721, fertilizer: 10, themes: ['sakura', 6], exportName: snapshot.exportedFilename });
    const cloud = await evaluate(`(async()=>{const uploaded=await fetch('app://game/api/save',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:0,data:globalThis.__desktopQaSnapshot})});const read=await fetch('app://game/api/save',{credentials:'include'});return {uploadStatus:uploaded.status,uploaded:await uploaded.json(),readStatus:read.status,read:await read.json()};})()`);
    assert.equal(cloud.uploadStatus, 200); assert.equal(cloud.readStatus, 200); assert.equal(cloud.read.revision, 1); assert.deepEqual(cloud.read.data, snapshot.data);
    check('Real desktop proxy PUT/GET cloud save matches actual serialized game state', { revision: cloud.read.revision, coins: cloud.read.data.coins, fertilizer: cloud.read.data.stats.fertilizer });

    await page.call('Page.reload', { ignoreCache: true }); await readyPage();
    const reloaded = await evaluate(`(async()=>{const state=await import('/js/core/state.js');const response=await fetch('app://game/api/auth/me',{credentials:'include'});const cloud=await fetch('app://game/api/save',{credentials:'include'});return {me:response.status,cloudStatus:cloud.status,cloud:await cloud.json(),local:state.serializeState()};})()`);
    assert.equal(reloaded.me, 200); assert.equal(reloaded.cloudStatus, 200); assert.equal(reloaded.local.coins, 43721); assert.equal(reloaded.local.stats.fertilizer, 10); assert.deepEqual(reloaded.local.placedIn.map((item) => item.photo), ['sakura', 6]); assert.deepEqual(reloaded.cloud.data, snapshot.data);
    check('Actual host page reload retains session, repaired local save and matching cloud snapshot');
    const screenshot = await page.call('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(out, 'desktop-current-candidate.png'), Buffer.from(screenshot.data, 'base64'));
    const logout = await evaluate(`(async()=>{const response=await fetch('app://game/api/auth/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});return {logout:response.status,me:(await fetch('app://game/api/auth/me',{credentials:'include'})).status,cloud:(await fetch('app://game/api/save',{credentials:'include'})).status};})()`);
    assert.deepEqual(logout, { logout: 200, me: 401, cloud: 401 }); check('Real host logout revokes session and cloud access');
    assert.ok(report.upstreamRequests.length > 10); assert.equal(report.upstreamRequests.some((item) => item.originPresent), false); assert.equal(report.runtimeErrors.length, 0);
    check('Proxy removes renderer Origin under production default-deny CORS; external network blocked', { upstreamRequests: report.upstreamRequests.length, originPresent: false, proxyDenyRequests: report.blockedExternal.length });
    report.pass = true;
  } catch (error) { report.failure = error.stack || String(error); throw error; }
  finally {
    page?.close();
    if (browser) { try { await browser.call('Browser.close'); } catch { /* Browser exit closes the CDP transport. */ } browser.close(); }
    await sleep(150); await stop(electron, true); await stop(api);
    if (proxy) { proxy.closeAllConnections(); await new Promise((resolve) => proxy.close(resolve)); }
    report.cleanup = { electronPid: electron?.pid, electronExited: !electron || electron.exitCode !== null || electron.signalCode !== null, apiPid: api?.pid, apiExited: !api || api.exitCode !== null || api.signalCode !== null, syntheticApiDatabaseRetained: dataDir };
    const checkedTemp = path.resolve(tempRoot);
    assert.equal(path.dirname(checkedTemp), path.resolve(os.tmpdir())); assert.ok(path.basename(checkedTemp).startsWith('nuannuan-backend-desktop-'));
    try { fs.rmSync(checkedTemp, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); report.cleanup.tempAppAndProfileRemoved = true; }
    catch (error) { report.cleanup.syntheticTempRetained = checkedTemp; report.cleanup.cleanupError = error.message; }
    if (!report.cleanup.electronExited || !report.cleanup.apiExited) report.pass = false;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(out, 'process.log'), logs.join(''));
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ pass: report.pass, checks: report.checks.length, report: path.join(out, 'report.json'), failure: report.failure, cleanup: report.cleanup }, null, 2));
  }
}

if (process.argv.includes('--api-child')) apiChild();
else main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
