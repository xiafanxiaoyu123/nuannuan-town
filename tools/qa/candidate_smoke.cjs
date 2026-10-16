// Actual Chromium startup of isolated candidate resources; no API/database/server.js.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const vm = require('node:vm');
const args = process.argv.slice(2);
const argument = (flag) => { const at = args.indexOf(flag); if (at < 0 || !args[at + 1]) throw new Error('Required: ' + flag); return path.resolve(args[at + 1]); };
const esm = argument('--esm'), web = argument('--web'), out = argument('--out');
const expectedVersion = JSON.parse(fs.readFileSync(path.join(web, 'build-manifest.json'), 'utf8')).version;
const dataModule = { exports: {} };
const dataBundle = esbuild.buildSync({ entryPoints: [path.join(esm, 'js/data.js')], bundle: true, format: 'cjs', platform: 'node', write: false }).outputFiles[0].text;
vm.runInNewContext(dataBundle, { module: dataModule, exports: dataModule.exports }, { timeout: 1000 });
const tutorials = Object.fromEntries(Object.entries(dataModule.exports.TUTORIALS).map(([id, item]) => [id, item.version || 1]));
if (fs.existsSync(out)) throw new Error('Smoke output already exists; use a fresh evidence directory');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'profile'));
app.on('window-all-closed', () => {});
const report = { evidence: 'Local Chromium candidate resources; not APK/Windows installer or production acceptance', results: [], errors: [], external: [], pass: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, currentWindow, finished = false;
const timeout = setTimeout(() => finish(new Error('Candidate smoke timed out')), 120000);
process.stdout.on('error', () => {}); process.stderr.on('error', () => {});

async function finish(error) {
  if (finished) return;
  finished = true; clearTimeout(timeout);
  if (error) report.failure = error.stack || String(error);
  report.pass = !error && !report.errors.length && !report.external.length;
  currentWindow?.destroy();
  server?.closeAllConnections?.();
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  app.exit(report.pass ? 0 : 1);
}

app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    const base = url.pathname.startsWith('/esm/') ? esm : url.pathname.startsWith('/web/') ? path.join(web, 'site') : null;
    if (!base) { res.writeHead(404).end(); return; }
    const file = path.resolve(base, '.' + decodeURIComponent(url.pathname.replace(/^\/(esm|web)/, '')));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const kind of ['esm', 'offline', 'hosted']) {
    const win = currentWindow = new BrowserWindow({ width: 1000, height: 650, show: false, useContentSize: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false, partition: 'candidate-' + kind + '-' + Date.now() } });
    win.webContents.on('console-message', (event) => { if (event.level === 'error') report.errors.push({ kind, message: event.message }); });
    win.webContents.session.webRequest.onBeforeRequest((request, callback) => {
      const bad = /^(https?|wss?):/.test(request.url) && !request.url.startsWith(origin + '/');
      if (bad) report.external.push({ kind, url: request.url });
      callback({ cancel: bad });
    });
    await win.loadURL('about:blank');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Page.enable');
    // Guest API responses are in-memory, not official or local auth service calls.
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `
      const slot = new URLSearchParams(location.search).get('slot');
      if (slot) localStorage.setItem('nikki-block-town-save-v1:' + slot, JSON.stringify({v:3,tut:${JSON.stringify(tutorials)}}));
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, options) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname.startsWith('/api/')) return Promise.resolve(new Response(JSON.stringify({error:'fixture guest'}), {status:401, headers:{'Content-Type':'application/json'}}));
        return originalFetch(input, options);
      };
    ` });
    const load = () => kind === 'offline'
      ? win.loadFile(path.join(web, '暖暖的方块小镇-网页版.html'), { query: { slot: 'candidate-offline' } })
      : win.loadURL(origin + (kind === 'esm' ? '/esm/index.html' : '/web/play.html') + '?slot=candidate-' + kind);
    const ready = async () => {
      for (let i = 0; i < 300; i++) {
        if (await win.webContents.executeJavaScript('!!window.__game && !document.getElementById("boot")')) return;
        await sleep(100);
      }
      throw new Error(kind + ' did not reach playable startup');
    };
    await load(); await ready();
    await win.webContents.executeJavaScript('__game.begin(false)');
    await sleep(600);
    const result = await win.webContents.executeJavaScript(`(() => {
      const version = document.querySelector('meta[name="nuannuan-version"]')?.content;
      const build = document.querySelector('meta[name="nuannuan-build"]')?.content;
      const buildId = document.querySelector('meta[name="nuannuan-build-id"]')?.content;
      __game.ui.settingsPanel();
      const performanceEntry = document.querySelector('[data-settings-open="performance"]');
      if (!performanceEntry) throw new Error('Performance settings entry missing');
      performanceEntry.click();
      const entry = document.querySelector('[data-settings-open="diagnostics"]');
      if (!entry) throw new Error('Diagnostics settings entry missing');
      entry.click();
      const panel = document.querySelector('.diagnostics-panel');
      if (!panel || !panel.textContent.includes(${JSON.stringify(expectedVersion)})) throw new Error('Diagnostic panel/version did not load');
      return { version, build, buildId, gameReady: !!__game.town, diagnosticsVisible: true };
    })()`);
    assert.equal(result.version, expectedVersion);
    assert.equal(result.build, kind === 'esm' ? 'native' : 'web');
    assert.match(result.buildId, /^[a-f0-9]{12}$/);
    // Exercise the shipped sampler through the public panel in ESM and bundled entries.
    // Menu frames are sufficient for compatibility; this is not a performance benchmark.
    await win.webContents.executeJavaScript(`(() => {
      if (!document.querySelector('[data-diagnostics-section="draw"]')) throw new Error('Draw diagnostics section missing');
      document.querySelector('[data-diagnostics-action="record"]').click();
    })()`);
    await sleep(600);
    const drawing = await win.webContents.executeJavaScript(`(() => {
      document.querySelector('[data-diagnostics-action="record"]').click();
      document.querySelector('[data-diagnostics-action="show"]').click();
      const report = JSON.parse(document.querySelector('[data-diagnostics-text]').value);
      const draw = report.performance.draw;
      return { reportSchema: report.schema, drawSchema: draw.schema, completedFrames: draw.completedFrames,
        failedFrames: draw.failedFrames, rendererSamples: draw.timings.renderer.samples, recording: report.recording };
    })()`);
    assert.equal(drawing.reportSchema, 'nuannuan-diagnostics-v1');
    assert.equal(drawing.drawSchema, 'nuannuan-draw-cpu-v2');
    assert.ok(drawing.completedFrames > 0 && drawing.rendererSamples > 0);
    assert.equal(drawing.failedFrames, 0); assert.equal(drawing.recording, false);
    win.webContents.invalidate();
    await sleep(300);
    await win.webContents.capturePage();
    await sleep(300);
    const screenshot = path.join(out, kind + '.png');
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    // 打包后的CSS、四轨模块及公开开店入口也必须实际运行，不能仅核对文件存在。
    await win.webContents.executeJavaScript(`document.querySelectorAll('.veil .x').forEach(button=>button.click());void __game.startGame('tailor',{mode:'level',stage:1});`);
    let tailor;
    for (let i=0;i<180;i++) {
      tailor=await win.webContents.executeJavaScript(`(() => {
        const board=document.querySelector('.tailor-board'),notes=document.querySelectorAll('.tailor-note');
        if(!board||!notes.length)return null;
        const lanes=[...document.querySelectorAll('.tailor-lane')],keys=[...document.querySelectorAll('[data-tailor-key]')];
        return {lanes:lanes.length,keys:keys.map(el=>el.querySelector('.kbd').textContent),notes:notes.length,
          width:board.getBoundingClientRect().width,colors:keys.map(el=>getComputedStyle(el).backgroundColor),
          transparentInput:lanes.every(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),
          notesInScene:[...notes].every(el=>getComputedStyle(el).visibility==='hidden'),
          worldProjection:document.querySelector('.tailor-lanes').style.transform.startsWith('matrix3d('),
          instruction:document.querySelector('.tailor-board-title').textContent};
      })()`);
      if(tailor)break;
      await sleep(100);
    }
    assert.ok(tailor,kind+' four-lane game did not start');
    assert.equal(tailor.lanes,4);assert.deepEqual(tailor.keys,['D','F','J','K']);
    assert.ok(tailor.width>200&&new Set(tailor.colors).size===4,'Four-lane CSS not applied');
    assert.ok(tailor.transparentInput&&tailor.notesInScene&&tailor.worldProjection,'Tailor still uses an independent visible DOM runway');
    assert.ok(tailor.instruction.includes('到针圈按下'),'Tailor scene instruction not shipped');
    await win.webContents.executeJavaScript(`document.querySelector('[data-tailor-pause]').click()`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[data-tailor-pause]').textContent`),'继续');
    await win.webContents.executeJavaScript(`document.querySelector('[data-tailor-pause]').click()`);
    const tailorScreenshot=path.join(out,kind+'-tailor.png');
    fs.writeFileSync(tailorScreenshot,(await win.webContents.capturePage()).toPNG());
    await load(); await ready();
    report.results.push({ kind, ...result, drawing, tailor, reloadReady: true, screenshot, tailorScreenshot });
    win.destroy(); currentWindow = null;
  }
  await finish();
}).catch(finish);
