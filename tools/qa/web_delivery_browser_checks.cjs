/* Real Chromium SRI/CORS failures: a wrong remote script must never execute,
 * and both JS/CSS must fall back to the matching local immutable bytes. */
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const fixture = path.join(__dirname, 'fixtures');
const certificate = fs.readFileSync(path.join(fixture, 'test-cert.pem'));
const spki = new crypto.X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' });
app.commandLine.appendSwitch('ignore-certificate-errors-spki-list', crypto.createHash('sha256').update(spki).digest('base64'));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'nikki-web-sri-browser-')));
app.on('window-all-closed', () => {});
const bytes = { js: Buffer.from('window.__goodResource = true;'), css: Buffer.from('body {color: rgb(0, 128, 0);}') };
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const loader = fs.readFileSync(path.join(root, 'tools/web_play_loader.js'));
let mode;
let siteServer;
let cloudServer;
let cloudBase;
const requests = [];

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const stop = (server) => new Promise((resolve) => {
  if (!server) return resolve();
  server.close(resolve);
  server.closeAllConnections?.();
});
const send = (response, content, type, cors = false) => {
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...(cors ? { 'access-control-allow-origin': '*' } : {}) });
  response.end(content);
};
function manifest() {
  return {
    schema: 1, buildId: '1234567890abcdef', version: 'test', entry: 'assets/play.abc.js', styles: 'assets/play.def.css',
    resources: [
      { sourcePath: 'assets/play.abc.js', url: cloudBase + '/test.js', fallbackUrl: 'assets/play.abc.js', sha256: digest(bytes.js), size: bytes.js.length },
      { sourcePath: 'assets/play.def.css', url: cloudBase + '/test.css', fallbackUrl: 'assets/play.def.css', sha256: digest(bytes.css), size: bytes.css.length },
    ],
  };
}

async function run() {
  cloudServer = https.createServer({ key: fs.readFileSync(path.join(fixture, 'test-key.pem')), cert: certificate }, (request, response) => {
    const css = request.url === '/test.css';
    requests.push({ mode, source: 'cloud', url: request.url });
    const content = mode === 'wrong-bytes' ? Buffer.from(css ? 'body {color: red;}' : 'window.__badResource = true;') : (css ? bytes.css : bytes.js);
    send(response, content, css ? 'text/css' : 'text/javascript', mode !== 'no-cors');
  });
  await listen(cloudServer);
  cloudBase = `https://127.0.0.1:${cloudServer.address().port}`;
  siteServer = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    requests.push({ mode, source: 'site', url: url.pathname });
    if (url.pathname === '/play.html') return send(response, '<!doctype html><meta charset="utf-8"><div id="boot"><p>loading</p></div><script src="play.js" defer></script>', 'text/html');
    if (url.pathname === '/play.js') return send(response, loader, 'text/javascript');
    if (url.pathname === '/play-manifest.json') return send(response, JSON.stringify(manifest()), 'application/json');
    if (url.pathname === '/assets/play.abc.js') return send(response, bytes.js, 'text/javascript');
    if (url.pathname === '/assets/play.def.css') return send(response, bytes.css, 'text/css');
    response.writeHead(404); response.end();
  });
  await listen(siteServer);
  const site = `http://127.0.0.1:${siteServer.address().port}/play.html`;
  const results = [];
  for (mode of ['good', 'wrong-bytes', 'no-cors']) {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true,
      nodeIntegration: false, partition: 'nikki-sri-' + mode + '-' + Date.now(), backgroundThrottling: false } });
    await window.loadURL(site);
    const result = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const limit = Date.now() + 10000;
      const poll = () => {
        if (window.__goodResource) return resolve({ good: true, bad: !!window.__badResource,
          color: getComputedStyle(document.body).color,
          script: document.querySelector('script[data-nikki-entry]').src,
          style: document.querySelector('link[data-nikki-style]').href });
        if (Date.now() > limit) return reject(new Error(document.querySelector('#boot p').textContent));
        setTimeout(poll, 30);
      }; poll();
    })`);
    assert.equal(result.good, true);
    assert.equal(result.bad, false, 'tampered remote script must never execute');
    assert.equal(result.color, 'rgb(0, 128, 0)');
    assert.equal(result.script.startsWith(cloudBase), mode === 'good');
    assert.equal(result.style.startsWith(cloudBase), mode === 'good');
    results.push({ mode, ...result });
    window.destroy();
  }
  const report = { status: 'ok', evidence: 'local real Chromium browser, fixture URLs only', results, requests };
  const reportPath = path.join(root, 'output/domestic-123-20261014/qa-web-browser/report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'ok', modes: results.map((result) => result.mode), report: reportPath }));
}

app.whenReady().then(run).catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await Promise.all([stop(siteServer), stop(cloudServer)]); app.exit(process.exitCode || 0); });
