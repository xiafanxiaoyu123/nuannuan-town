// Natural RAF profiling against an immutable measurement source; no API server or player profile.
// CPU categories are measured together. Mesh census is a separate, non-timing replay after recording stops.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2);
const opt = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const source = path.resolve(opt('--source', '')), out = path.resolve(opt('--out', ''));
const rounds = Number(opt('--rounds', '3')), seconds = Number(opt('--seconds', '8'));
const censusOnly = args.includes('--census-only');
assert(args.includes('--source') && args.includes('--out'), '--source and new --out required');
assert(!fs.existsSync(out), 'Evidence directory must be new');
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5 && Number.isFinite(seconds) && seconds >= 3 && seconds <= 20);
assert(source !== root, 'Use a frozen measurement copy, never the actively edited checkout');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sourceFiles = new Map();
function loadFiles(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = path.posix.join(rel, entry.name), file = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), 'No symlink in served source');
    if (entry.isDirectory()) loadFiles(file, relative);
    else if (/\.(js|css)$/.test(relative)) sourceFiles.set('/' + relative, fs.readFileSync(file));
  }
}
for (const dir of ['js', 'css']) loadFiles(path.join(source, dir), dir);
sourceFiles.set('/index.html', fs.readFileSync(path.join(source, 'index.html')));
const sourceHashes = Object.fromEntries([...sourceFiles].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [file, hash(bytes)]));
const measurement = Object.fromEntries(['/js/devtools/diagnostics.js', '/js/devtools/render-sampling.js'].map(file => [file, sourceHashes[file]]));
const measurementId = hash(JSON.stringify(measurement));
assert(sourceFiles.get('/js/devtools/diagnostics.js').includes(Buffer.from('nuannuan-draw-cpu-v2')), 'v2 diagnostic source required');
fs.mkdirSync(out, { recursive: true }); app.setPath('userData', path.join(out, 'profile'));
app.on('window-all-closed', () => {}); process.stdout.on('error', () => {}); process.stderr.on('error', () => {});
const report = { pass: false, schema: censusOnly ? 'nuannuan-town-draw-census-v1' : 'nuannuan-town-draw-profile-v1', source, sourceHashes, measurement, measurementId, rounds, seconds,
  conditions: { revision: 1, viewport: [960, 600], dpr: 1, cap: 60, quality: ['mid', 'high'], scenes: ['town-idle', 'town-walk'], adaptive: false,
    randomSeed: 123456, date: '2026-10-16T12:00:00+08:00', gday: 25, clock: .35, naturalRAF: true, freshProfilePerCase: true, syntheticSave: true,
    description: 'CPU submission incl diagnostics overhead; mainScene excludes its actual mainShadow; post excludes RenderPass. No GPU completion timing, no gl.finish. Mesh census is a separate replay, never part of timed samples.' }, runs: [], errors: [], external: [] };
let server, win, origin, finished = false;
const log = value => { const line = typeof value === 'string' ? value : JSON.stringify(value); fs.appendFileSync(path.join(out, 'run.log'), line + '\n'); process.stdout.write(line + '\n'); };
const timeout = setTimeout(() => finish(Error('Town draw profile timed out')), 600000);
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(timeout);
  if (error) report.failure = error.stack || String(error);
  const changed = Object.entries(sourceHashes).filter(([file, sha]) => !fs.existsSync(path.join(source, '.' + file)) || hash(fs.readFileSync(path.join(source, '.' + file))) !== sha).map(([file]) => file);
  report.sourceChanged = changed;
  report.pass = !error && !changed.length && !report.errors.length && !report.external.length && report.runs.length === rounds * 4;
  win?.destroy(); server?.closeAllConnections?.(); if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); log('REPORT ' + path.join(out, 'report.json') + ' pass=' + report.pass);
  app.exit(report.pass ? 0 : 1);
}
const run = js => win.webContents.executeJavaScript(`(async()=>{${js}})()`);
async function ready() { for (let i = 0; i < 400; i++) { if (await run('return !!window.__game && !document.getElementById("boot")')) return; await sleep(100); } throw Error('Startup timeout'); }
const setup = `
window.st=await import('/js/core/state.js');window.dd=await import('/js/data.js');window.ui=__game.ui;window.t=__game.town;
window.engine=(await import('/js/core/app.js')).app;window.diag=(await import('/js/devtools/diagnostics.js')).diagnostics;
window.THREE=await import('three');if(THREE.REVISION!=='170')throw Error('Pinned Three r170 required');
for(const [id,data]of Object.entries(dd.TUTORIALS))st.S.tut[id]=data.version||1;
st.S.quest=dd.QUESTS.length;st.S.gday=25;st.S.clock=.35;
st.S.settings={...st.S.settings,quality:window.qaQuality,qualityExplicit:true,antiAlias:'auto',fpsLimit:60,renderScale:1,adaptiveQuality:false,perf:{dynFps:false,shadowHz:20}};
engine.applyQuality();engine.pixelRatio=1;engine.resize();__game.begin(false);t.setZone('town',0,4);t.setMode('play');t.setModal(false);t.lock=0;__game.busy=false;t.camSnap=true;
window.motion={distance:0,samples:0,switches:0,last:[t.pos.x,t.pos.z],keys:[]};
window.startMotion=()=>{if(window.qaScene!=='town-walk')return;let n=0;t.keys.clear();t.keys.add('KeyD');motion.keys.push('KeyD');
 window.motionTimer=setInterval(()=>{motion.distance+=Math.hypot(t.pos.x-motion.last[0],t.pos.z-motion.last[1]);motion.last=[t.pos.x,t.pos.z];motion.samples++;
 t.keys.clear();const key=++n%2?'KeyA':'KeyD';t.keys.add(key);motion.keys.push(key);motion.switches++;},600);};
window.resetMotion=()=>{motion.distance=0;motion.samples=0;motion.switches=0;motion.keys=[];motion.last=[t.pos.x,t.pos.z];};
window.fixture=()=>({quality:engine.quality,dpr:engine.pixelRatio,viewport:[engine.width,engine.height],cap:engine.fpsCap,post:engine.usePost,
 aa:engine.aa.mode,mobile:engine.mobile,dynFps:engine.perf.dynFps,adaptive:st.S.settings.adaptiveQuality,shadow:engine.renderer.shadowMap.enabled,
 shadowAutoUpdate:engine.renderer.shadowMap.autoUpdate,shadowSize:engine.shadowSize,shadowType:engine.renderer.shadowMap.type,zone:t.zone,
 modal:ui.modals,busy:__game.busy,mode:t.mode,house:st.S.house,furniture:Object.fromEntries(Object.entries(t.decors).map(([k,d])=>[k,d.entries.length])),
 geometryCount:engine.renderer.info.memory.geometries,textureCount:engine.renderer.info.memory.textures});
window.census=async()=>{
 if(diag.active)throw Error('Census must be outside natural timing');
 const r=engine.renderer,sm=r.shadowMap,render=r.render,direct=r.renderBufferDirect,shadow=sm.render;
 let inShadow=0,frames=0;const buckets=new Map(),totals={main:0,shadow:0},roles={main:{},shadow:{}},owners=new Map();
 const own=(object,role)=>{if(object)owners.set(object,role);};own(t.player?.root,'player');own(t.momo?.root,'momo');own(t.boat,'boat');
 for(const n of t.npcs||[])own(n.ch?.root,'npc');for(const c of t.clouds||[])own(c,'cloud');
 for(const key of ['sky','stars','moon','ring','balloon','yardFx'])own(t[key],'environment');
 for(const d of Object.values(t.decors))for(const rec of d.entries)own(rec.obj,'furniture');
 const roleOf=object=>{let role='other';for(let o=object;o&&o!==t.scene;o=o.parent){if(owners.has(o))return owners.get(o);if(o.userData?.seasonalPlant)role='seasonal';
  else if(role==='other'&&o.userData?.noMerge)role='noMerge';else if(role==='other'&&o.userData?.merged)role='staticMerged';
  else if(role==='other'&&o.parent===t.scene)role=o.isMesh?'rootMesh':'rootGroup';}return role;};
 const classify=o=>o.isInstancedMesh?'instanced':o.isSkinnedMesh?'skinned':o.userData?.seasonalPlant?'seasonal':'mesh';
 r.render=function(scene,...args){if(scene===t.scene)frames++;return render.call(this,scene,...args);};
 sm.render=function(...args){inShadow++;try{return shadow.apply(this,args);}finally{inShadow--;}};
 r.renderBufferDirect=function(camera,scene,geometry,material,object,...rest){
  if(inShadow||scene===t.scene){const phase=inShadow?'shadow':'main',role=roleOf(object);totals[phase]++;roles[phase][role]=(roles[phase][role]||0)+1;
   const key=geometry.uuid+'|'+material.uuid+'|'+phase+'|'+role;
   let b=buckets.get(key);if(!b){b={phase,kind:classify(object),transparent:!!material.transparent,castShadow:!!object.castShadow,
    role,vertices:geometry.attributes.position?.count||0,indices:geometry.index?.count||0,calls:0,objects:new Set(),firstMatrices:new Map(),moving:new Set()};buckets.set(key,b);}b.calls++;b.objects.add(object);
   const matrix=object.matrixWorld.elements.join(',');if(!b.firstMatrices.has(object))b.firstMatrices.set(object,matrix);else if(b.firstMatrices.get(object)!==matrix)b.moving.add(object);}
  return direct.call(this,camera,scene,geometry,material,object,...rest);};
 try{await new Promise(resolve=>setTimeout(resolve,1000));}
 finally{r.render=render;r.renderBufferDirect=direct;sm.render=shadow;}
 const groups=[...buckets.values()].map(({firstMatrices,moving,...b})=>({...b,objects:b.objects.size,movingObjects:moving.size,perFrame:b.calls/Math.max(frames,1)}));
 return {frames,totals,meshSubmissionsPerFrame:{main:totals.main/frames,shadow:totals.shadow/frames},rolesPerFrame:Object.fromEntries(Object.entries(roles).map(([phase,rows])=>[phase,Object.fromEntries(Object.entries(rows).map(([role,calls])=>[role,calls/frames]))])),
  repeatedGroups:groups.filter(b=>b.objects>1).sort((a,b)=>b.perFrame-a.perFrame).slice(0,70),groups:groups.length,
  note:'renderBufferDirect entries in a separate replay; not GPU completion timing or natural FPS. Repetition alone does not prove a static batching candidate.'};
};
`;
app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"isolated guest"}'); return; }
    let rel; try { rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); } catch { res.writeHead(400).end(); return; }
    let body = sourceFiles.get(rel);
    if (!body && rel.startsWith('/node_modules/three/')) {
      const three = path.join(root, 'node_modules/three'), file = path.resolve(root, '.' + rel);
      if (file.startsWith(three + path.sep) && /\.js$/.test(file) && fs.existsSync(file)) body = fs.readFileSync(file);
    }
    if (!body) { res.writeHead(404).end(); return; }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(rel)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  for (let round = 0; round < rounds; round++) for (const quality of ['mid', 'high']) for (const scene of ['town-idle', 'town-walk']) {
    const name = quality + '-' + scene;
    win = new BrowserWindow({ width: 960, height: 600, useContentSize: true, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false, partition: 'town-draw-' + round + '-' + name + '-' + Date.now() } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', e => { if (e.level === 'error' && !/401/.test(e.message)) report.errors.push(e.message); });
    win.webContents.session.webRequest.onBeforeRequest((req, callback) => { const bad = /^(https?|wss?):/.test(req.url) && !req.url.startsWith(origin + '/'); if (bad) report.external.push(req.url); callback({ cancel: bad }); });
    await win.loadURL('about:blank'); win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `let seed=123456;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const NativeDate=Date;window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-10-16T12:00:00+08:00']));}static now(){return new NativeDate('2026-10-16T12:00:00+08:00').getTime();}};` });
    await win.loadURL(origin + '/index.html?slot=qa-town-draw-' + round + '-' + name); await ready();
    await run(`window.qaQuality=${JSON.stringify(quality)};window.qaScene=${JSON.stringify(scene)};` + setup);
    await sleep(1800); await run('startMotion();'); await sleep(1200);
    const beforeFixture = await run('resetMotion();return fixture();');
    assert.equal(beforeFixture.quality, quality); assert.equal(beforeFixture.dpr, 1); assert.equal(beforeFixture.cap, 60); assert.deepEqual(beforeFixture.viewport, [960, 600]);
    assert.equal(beforeFixture.dynFps, false); assert.equal(beforeFixture.adaptive, false); assert.equal(beforeFixture.zone, 'town'); assert.equal(beforeFixture.modal, 0);
    assert.equal(beforeFixture.post, quality === 'high'); assert.equal(beforeFixture.shadow, true);
    if(censusOnly){
      const meshCensus=await run('return await census();');assert(meshCensus.frames>10&&meshCensus.totals.main>0&&meshCensus.totals.shadow>0,'Census must see actual main and shadow submissions');
      report.runs.push({round,quality,scene,beforeFixture,meshCensus});log({round,quality,scene,census:meshCensus.meshSubmissionsPerFrame,roles:meshCensus.rolesPerFrame});
      await run('clearInterval(window.motionTimer);t.keys.clear();');win.destroy();win=null;continue;
    }
    await run('diag.start(60);'); await sleep(seconds * 1000);
    const result = await run('diag.stop();return {diagnostic:diag.report(),motion,fixture:fixture()};');
    const p = result.diagnostic.performance, draw = p.draw;
    assert.equal(draw.schema, 'nuannuan-draw-cpu-v2'); assert.equal(result.diagnostic.errors.length, 0); assert.equal(draw.failedFrames, 0);
    assert(draw.completedFrames >= seconds * 20, 'Too few natural samples');
    for (const key of ['mainScene', 'mainShadow', 'mainRenderer']) assert.equal(draw.timings[key].samples, draw.completedFrames, key + ' incomplete');
    assert.equal(draw.timings.postprocessing.samples, quality === 'high' ? draw.completedFrames : 0);
    assert.equal(p.modules.render.samples, draw.completedFrames); assert.equal(result.fixture.zone, 'town'); assert.equal(result.fixture.modal, 0);
    if (scene === 'town-walk') assert(result.motion.samples >= 4 && result.motion.distance > 1 && result.motion.keys.includes('KeyA') && result.motion.keys.includes('KeyD'), 'Walking fixture must move in both directions');
    else assert.equal(result.motion.distance, 0);
    const meshCensus = await run('return await census();');
    if (round === 0) fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    report.runs.push({ round, quality, scene, beforeFixture, ...result, meshCensus });
    log({ round, quality, scene, frames: draw.completedFrames, fps: p.fps, cpuP95: p.cpuP95Ms,
      mainScene: draw.timings.mainScene.averageMs, mainShadow: draw.timings.mainShadow.averageMs, post: draw.timings.postprocessing.averageMs, total: p.modules.render.averageMs });
    await run('clearInterval(window.motionTimer);t.keys.clear();'); win.destroy(); win = null;
  }
  await finish();
}).catch(finish);
