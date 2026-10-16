// Serial local profiling: actual engine loop + opt-in read-only diagnostics.
// Serves only a reviewed source snapshot and pinned Three; no auth server or real saves.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const source = path.resolve(opt('--source', root)), out = path.resolve(opt('--out', ''));
const rounds = Number(opt('--rounds', '3')), seconds = Number(opt('--seconds', '3'));
if (!args.includes('--out') || fs.existsSync(out)) throw new Error('Required --out must be a new evidence directory');
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5 && Number.isFinite(seconds) && seconds >= 2 && seconds <= 15);
for (const file of ['index.html', 'js/main.js', 'js/devtools/diagnostics.js']) assert(fs.existsSync(path.join(source, file)));
fs.mkdirSync(out, { recursive: true }); app.setPath('userData', path.join(out, 'profile'));
app.on('window-all-closed', () => {});
process.stdout.on('error', () => {}); process.stderr.on('error', () => {});
const report = { pass: false, source, rounds, seconds, conditions: { scenarioRevision: 2, viewport: [960, 600], quality: 'mid', dpr: 1, cap: 60, adaptive: false, naturalLoop: true, syntheticSave: true, api: 'guest fixture', profiling: 'Diagnostic phase sampling during natural frames; separate instrumented replay; no gl.finish' }, runs: [], errors: [], external: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = message => { fs.appendFileSync(path.join(out, 'run.log'), message + '\n'); process.stdout.write(message + '\n'); };
let server, win, origin, finished = false;
const timeout = setTimeout(() => finish(new Error('Profiling timeout')), 600000);
async function finish(error) {
  if (finished) return; finished = true; clearTimeout(timeout);
  if (error) report.failure = error.stack || String(error);
  report.pass = !error && !report.errors.length && !report.external.length;
  win?.destroy(); server?.closeAllConnections?.();
  if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  log('REPORT ' + path.join(out, 'report.json') + ' pass=' + report.pass); app.exit(report.pass ? 0 : 1);
}
const run = js => win.webContents.executeJavaScript(`(async()=>{${js}})()`);
async function ready() { for (let i = 0; i < 400; i++) { if (await run('return !!window.__game && !document.getElementById("boot")')) return; await sleep(100); } throw new Error('Startup timeout'); }
const setup = `
window.st=await import('/js/core/state.js');window.dd=await import('/js/data.js');window.ui=__game.ui;window.t=__game.town;
window.engine=(await import('/js/core/app.js')).app;window.diag=(await import('/js/devtools/diagnostics.js')).diagnostics;
window.THREE=await import('three');
for(const [id,d] of Object.entries(dd.TUTORIALS))st.S.tut[id]=d.version||1;
st.S.quest=dd.QUESTS.length;st.S.coins=1000000;st.S.gday=25;st.S.clock=.35;
st.S.settings={...st.S.settings,quality:'mid',fpsLimit:60,adaptiveQuality:false,perf:{dynFps:false,shadowHz:20}};
engine.applyQuality();engine.pixelRatio=1;engine.resize();st.S.house=3;t.rebuildHouse();
st.S.buildQuest={...st.S.buildQuest,stage:3,rewarded:true};
for(const [zone,id,step] of [['house','chair',3],['home','yard_column',3],['build','yard_column',3]]){
 const d=t.decors[zone];d.rebuildObjects([],{});let n=0;
 for(let z=5;z<d.lot.rows-2&&n<36;z+=step)for(let x=2;x<d.lot.cols-2&&n<36;x+=step){
  if(!d.canPlace(id,x,z,0))continue;const e={id,gx:x,gz:z,rot:0};st.S[d.pk].push(e);d.addObj(e,false);n++;
 }
 st.S.decor[id]=100;st.bus.emit('decorChanged');
}
__game.begin(false);t.setZone('town',0,4);t.setMode('play');t.lock=0;__game.busy=false;
window.prepareCase=async name=>{
 clearInterval(window.scenarioTimer);window.scenarioTimer=null;t.keys.clear();
 document.querySelectorAll('.veil:not(.out) .x').forEach(b=>b.click());
 for(const d of Object.values(t.decors))if(d.active)d.exit();
 await new Promise(r=>setTimeout(r,400));t.setModal(false);t.setMode('play');__game.busy=false;t.lock=0;
 if(name.startsWith('town')||name==='menu'){t.setZone('town',0,4);}
 else if(name.startsWith('house')){t.setZone('house',501,5);t.decors.house.enter();}
 else{t.setZone('build');t.decors.build.enter();}
 if(name==='menu')ui.settingsPanel();
 if(name==='town-walk'){
  let n=0;window.walkMotion={distance:0,last:[t.pos.x,t.pos.z],samples:0};t.keys.add('KeyD');
  scenarioTimer=setInterval(()=>{
   walkMotion.distance+=Math.hypot(t.pos.x-walkMotion.last[0],t.pos.z-walkMotion.last[1]);
   walkMotion.last=[t.pos.x,t.pos.z];walkMotion.samples++;
   t.keys.clear();t.keys.add(++n%2?'KeyA':'KeyD');
  },600);
 }
 if(name==='house-select'||name==='build-select'){
  const d=t.decor;d.select(name==='house-select'?'chair':'yard_column');let n=0;
  scenarioTimer=setInterval(()=>{d.cursor={fx:10+(n++%4),fz:8};d.updateGhost();},100);
 }
 t.camSnap=true;
};
window.withCounters=async fn=>{
 const result={},undo=[];
 const wrap=(obj,key,label)=>{if(!obj||typeof obj[key]!=='function')return;const old=obj[key];const stat=result[label]={calls:0,totalMs:0,maxMs:0};
 obj[key]=function(...a){const start=performance.now();try{return old.apply(this,a);}finally{const ms=performance.now()-start;stat.calls++;stat.totalMs+=ms;stat.maxMs=Math.max(stat.maxMs,ms);}};undo.push(()=>obj[key]=old);};
 for(const key of ['updateBuildRoofView','applySky','findInter','updatePlayer','updateNpcs'])wrap(t,key,'Town.'+key);
 for(const key of ['range','furniture','buildDecor','render'])wrap(t.renderOptimizer,key,'Scene.'+key);
 wrap(THREE.Box3.prototype,'setFromObject','Box3.setFromObject');wrap(t.farm,'update','Farm.update');wrap(t.seasons,'update','Seasons.update');
 for(const key of ['refreshAll','refreshQuest','refreshDecor','setPrompt','updateGuide','updateBubbles'])wrap(ui,key,'UI.'+key);
 for(const [zone,d]of Object.entries(t.decors))for(const key of ['updateGhost','anchor','canPlace','validateYard','houseFit','refreshFurnitureFits'])wrap(d,key,zone+'.'+key);
 const mutations={childList:0,attributes:0,characterData:0};const mo=new MutationObserver(list=>{for(const record of list)mutations[record.type]++;});
 mo.observe(document.getElementById('ui'),{subtree:true,childList:true,attributes:true,characterData:true});
 try{await fn();await Promise.resolve();return {methods:result,domMutations:mutations};}finally{mo.disconnect();for(const restore of undo.reverse())restore();}
};
`;
app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"isolated guest"}'); return; }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = rel.startsWith('/node_modules/three/') ? root : source;
    const file = path.resolve(base, '.' + rel);
    if (!file.startsWith(base + path.sep) || !/^(\/js\/|\/css\/|\/node_modules\/three\/|\/index\.html$)/.test(rel) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  for (let round = 0; round < rounds; round++) {
    win = new BrowserWindow({ width: 960, height: 600, useContentSize: true, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false, partition: 'perf-' + round + '-' + Date.now() } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', e => { if (e.level === 'error' && !/401/.test(e.message)) report.errors.push(e.message); });
    win.webContents.session.webRequest.onBeforeRequest((req, callback) => { const bad = /^(https?|wss?):/.test(req.url) && !req.url.startsWith(origin + '/'); if (bad) report.external.push(req.url); callback({ cancel: bad }); });
    await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `let seed=123456;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};` });
    await win.loadURL(origin + '/index.html?slot=qa-performance-' + round); await ready(); await run(setup); await sleep(1800);
    for (const name of ['town-idle','town-walk','house-idle','house-select','build-select','menu']) {
      await run(`await prepareCase(${JSON.stringify(name)});`);await sleep(900);
      await run('diag.start(60);'); await sleep(seconds * 1000);
      const diagnostic = await run('diag.stop();return diag.report();');
      assert(diagnostic.performance.modules.view.samples > 10, 'Natural engine frames missing');assert.equal(diagnostic.errors.length,0);
      const motion = name === 'town-walk' ? await run('return walkMotion;') : null;
      if (motion) assert(motion.samples > 0 && motion.distance > 0.1, 'Walking fixture did not move');
      const counters = await run('return await withCounters(()=>new Promise(r=>setTimeout(r,1000)));');
      report.runs.push({round,name,diagnostic,counters,...(motion ? {motion} : {})});log(JSON.stringify({round,name,cpuP95:diagnostic.performance.cpuP95Ms,view:diagnostic.performance.modules.view.averageMs,render:diagnostic.performance.modules.render.averageMs}));
      if (round === 0) fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
    }
    await run('await prepareCase("town-idle");');
    const actions = await run(`return await withCounters(async()=>{for(let i=0;i<20;i++)ui.refreshAll();for(let i=0;i<10;i++)t.decors.house.refreshFurnitureFits();});`);
    report.runs.push({round,name:'explicit-refresh-actions',counters:actions});
    const config = await run(`return {quality:engine.quality,dpr:engine.pixelRatio,cap:engine.fpsCap,post:engine.usePost,shadow:engine.renderer.shadowMap.enabled,furniture:Object.fromEntries(Object.entries(t.decors).map(([k,d])=>[k,d.entries.length]))};`);
    report.runs.push({round,name:'fixture',config});assert.equal(config.dpr,1);assert.equal(config.cap,60);
    win.destroy();win=null;
  }
  await finish();
}).catch(finish);
