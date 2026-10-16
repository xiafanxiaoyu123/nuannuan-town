// Real packaged Windows EXE acceptance. Package and source remain read-only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const out=path.resolve(process.argv[3]),root=path.resolve(__dirname,'../..');fs.mkdirSync(out,{recursive:true});
const exe=path.resolve(process.argv[2]);
const expectedStageArg=process.argv.find(x=>x.startsWith('--expected-stage-sha='));
const expectedStage=expectedStageArg?expectedStageArg.split('=')[1]:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'js/games/tailor-stage.js'))).digest('hex');
assert.match(expectedStage,/^[a-f0-9]{64}$/);
const profile=process.argv[4]&&!process.argv[4].startsWith('--')?path.resolve(process.argv[4]):path.join(out,'profile');
const report={startedAt:new Date().toISOString(),evidence:'Actual packaged Windows EXE; isolated synthetic guest; no API/update service, installation, physical mobile or production acceptance',exe,profile,checks:[],errors:[],externalRequests:[],pass:false};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let child,page,main;
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function wait(fn,ms,label){const end=Date.now()+ms;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(e){last=e;}await delay(150);}throw new Error(label+' timed out: '+(last?.message||''));}
async function cdp(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let id=0;const pending=new Map();const handlers=[];ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.t);m.error?p.j(new Error(m.error.message)):p.r(m.result);}else for(const h of handlers)h(m);});return {on:fn=>handlers.push(fn),close:()=>ws.close(),call(method,params={}){return new Promise((r,j)=>{const next=++id;pending.set(next,{r,j,t:setTimeout(()=>{pending.delete(next);j(new Error('CDP timeout: '+method));},15000)});ws.send(JSON.stringify({id:next,method,params}));});}};}
async function evaluate(code,client=page){const r=await client.call('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function shot(name){const r=await page.call('Page.captureScreenshot',{format:'png',fromSurface:true});const p=path.join(out,name+'.png');fs.writeFileSync(p,Buffer.from(r.data,'base64'));return p;}
async function stop(){if(child?.pid&&child.exitCode===null){await new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('exit',resolve);killer.on('error',resolve);});await delay(500);}report.cleanup={pid:child?.pid,exited:child?.exitCode!==null,exitCode:child?.exitCode,signalCode:child?.signalCode};}
async function run(){
  assert.ok(!fs.existsSync(profile)||process.argv.includes('--existing-profile'),'Existing profile must be an explicit synthetic fixture');fs.mkdirSync(profile,{recursive:true});
  const debug=await port(),inspect=await port();report.debugPort=debug;report.inspectPort=inspect;
  const env={};for(const k of ['PATH','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'])if(process.env[k])env[k]=process.env[k];
  for(const k of ['APPDATA','LOCALAPPDATA','USERPROFILE'])if(process.env[k])env[k]=process.env[k];
  const args=[`--user-data-dir=${profile}`,'--api-base=','--update-manifest=',`--remote-debugging-port=${debug}`,'--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>'];
  report.launch={args,environmentKeys:Object.keys(env),exeSHA256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),windowsHide:true};
  child=spawn(exe,args,{cwd:path.dirname(exe),env,windowsHide:true,stdio:['ignore','pipe','pipe']});report.pid=child.pid;
  const stdout=fs.createWriteStream(path.join(out,'stdout.log')),stderr=fs.createWriteStream(path.join(out,'stderr.log'));child.stdout.pipe(stdout);child.stderr.pipe(stderr);
  const target=await wait(async()=>{const list=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());return list.find(t=>t.type==='page'&&t.url.startsWith('app://game/'));},30000,'packaged page');
  page=await cdp(target.webSocketDebuggerUrl);
  report.checks.push({name:'Dedicated Chromium profile present',profile,files:fs.readdirSync(profile)});
  page.on(m=>{if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')report.errors.push(m.params.entry);if(m.method==='Network.requestWillBeSent'&&/^(https?|wss?):/.test(m.params.request.url))report.externalRequests.push(m.params.request.url);});
  await page.call('Runtime.enable');await page.call('Log.enable');await page.call('Network.enable');await page.call('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});await page.call('Page.enable');
  const preload=await evaluate(`(async()=>({api:window.NikkiDesktop.apiBase,requestBase:window.NikkiDesktop.requestBase,updates:await window.NikkiDesktop.updates.status()}))()`);
  assert.equal(preload.api,'');assert.equal(preload.requestBase,'');assert.equal(preload.updates.configured,false);assert.equal(preload.updates.canCheck,false);assert.equal(preload.updates.canRollback,false);report.checks.push({name:'API and updates explicitly disabled',...preload});
  await page.call('Page.navigate',{url:'app://game/index.html?slot=packaged-windows-smoke'});
  const ready=()=>wait(()=>evaluate(`!!window.__game&&!document.getElementById('boot')`),30000,'playable startup');await ready();
  const initial=await evaluate(`({version:document.querySelector('meta[name="nuannuan-version"]')?.content,buildId:document.querySelector('meta[name="nuannuan-build-id"]')?.content,save:localStorage.getItem('nikki-block-town-save-v1:packaged-windows-smoke'),url:location.href})`);report.checks.push({name:'Native startup',...initial});
  if(process.argv.includes('--expect-progress')){assert.equal(JSON.parse(initial.save).coins,54321);report.checks.push({name:'Previous package save retained before any test writes',coins:54321});}
  await evaluate(`(async()=>{const {TUTORIALS}=await import('/js/data.js');const {S,flushSave}=await import('/js/core/state.js');S.tut=Object.fromEntries(Object.entries(TUTORIALS).map(([id,x])=>[id,x.version||1]));__game.begin(false);${process.argv.includes('--seed-progress')?'S.coins=54321;':''}flushSave();})()`);
  await delay(700);await evaluate(`void __game.startGame('tailor',{mode:'level',stage:1})`);
  await wait(()=>evaluate(`!!document.querySelector('.tailor-board')&&document.querySelectorAll('.tailor-note').length>0`),25000,'tailor');
  await delay(2000);await evaluate(`document.querySelector('[data-tailor-pause]').click()`);
  const tailor=await evaluate(`(async()=>{const {app}=await import('/js/core/app.js');const g=app.view;const {THREE}=await import('/js/core/kit.js');const bbox=o=>{const b=new THREE.Box3().setFromObject(o),a=[];for(const x of [b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(g.camera);a.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});}return {left:Math.min(...a.map(p=>p.x)),right:Math.max(...a.map(p=>p.x)),top:Math.min(...a.map(p=>p.y)),bottom:Math.max(...a.map(p=>p.y))};};return {size:[innerWidth,innerHeight],keys:[...document.querySelectorAll('[data-tailor-key] .kbd')].map(x=>x.textContent),lanes:document.querySelectorAll('.tailor-lane').length,projected:document.querySelector('.tailor-lanes').style.transform.startsWith('matrix3d('),notesInScene:[...document.querySelectorAll('.tailor-note')].every(x=>getComputedStyle(x).visibility==='hidden'),paused:document.querySelector('[data-tailor-pause]').textContent,nikki:{position:g.nikki.root.position.toArray(),bounds:bbox(g.nikki.root)},momo:{position:g.momo.root.position.toArray(),scale:g.momo.root.scale.x,bounds:bbox(g.momo.root)},stageSHA256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch('/js/games/tailor-stage.js')).arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('')};})()`);
  assert.deepEqual(tailor.keys,['D','F','J','K']);assert.equal(tailor.lanes,4);assert.equal(tailor.projected,true);assert.equal(tailor.notesInScene,true);assert.equal(tailor.paused,'继续');assert.equal(tailor.momo.scale,1.6);
  assert.equal(tailor.stageSHA256,expectedStage);
  for(const name of ['nikki','momo']){const b=tailor[name].bounds;assert.ok(b.left>=0&&b.top>=0&&b.right<=tailor.size[0]&&b.bottom<=tailor.size[1],name+' fully framed');}
  report.checks.push({name:'Tailor four lanes, latest source, companions and pause',...tailor,screenshot:await shot('tailor-paused')});
  await delay(2000);await evaluate(`document.querySelector('[data-tailor-pause]').click()`);assert.equal(await evaluate(`document.querySelector('[data-tailor-pause]').textContent`),'暂停');
  await page.call('Page.reload',{ignoreCache:true});await ready();
  const saved=await evaluate(`(async()=>{const {S}=await import('/js/core/state.js');return {started:S.started,tutorials:Object.keys(S.tut).length,slot:new URL(location.href).searchParams.get('slot'),buildId:document.querySelector('meta[name="nuannuan-build-id"]')?.content};})()`);assert.equal(saved.started,true);assert.ok(saved.tutorials>0);assert.equal(saved.slot,'packaged-windows-smoke');assert.equal(saved.buildId,initial.buildId);report.checks.push({name:'Reload preserves isolated guest save and current build',...saved});
  report.screenshotReload=await shot('reload');assert.equal(report.errors.length,0);assert.equal(report.externalRequests.length,0);report.pass=true;
}
run().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(async()=>{page?.close();main?.close();await stop();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,failure:report.failure,cleanup:report.cleanup}));});



