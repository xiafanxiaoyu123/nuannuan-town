// Validate complete natural-frame groups before ranking or A/B comparison. Counts remain reference values.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const beforePath = opt('--before'), afterPath = opt('--after'), controlPath = opt('--control'), output = opt('--out');
assert(beforePath && output && !fs.existsSync(output), '--before and new --out required');
const median = values => { assert(values.length && values.every(Number.isFinite), 'Non-finite or empty metric'); const sorted = [...values].sort((a,b)=>a-b), mid = Math.floor(sorted.length/2); return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2; };
const phaseNames = ['mainScene', 'mainShadow', 'postprocessing'];
function load(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(data.pass === true && data.schema === 'nuannuan-town-draw-profile-v1', 'Invalid profile: '+file);
  assert(data.rounds >= 3 && data.seconds >= 8 && data.runs.length === data.rounds*4, 'Incomplete rounds/segments');
  assert(!data.errors.length && !data.external.length && !data.sourceChanged.length, 'Profile errors or source drift');
  const seen = new Set();
  for (let round=0;round<data.rounds;round++) for (const quality of ['mid','high']) for (const scene of ['town-idle','town-walk']) {
    const matches = data.runs.filter(run=>run.round===round&&run.quality===quality&&run.scene===scene); assert.equal(matches.length,1,'Missing/duplicate scenario');
    const run=matches[0],p=run.diagnostic.performance,d=p.draw;seen.add(run);
    assert.equal(d.schema,'nuannuan-draw-cpu-v2');assert.equal(d.failedFrames,0);assert(d.completedFrames>=data.seconds*20);
    for(const key of ['mainScene','mainShadow','mainRenderer'])assert.equal(d.timings[key].samples,d.completedFrames,key+' partial');
    assert.equal(d.timings.postprocessing.samples,quality==='high'?d.completedFrames:0);
    assert.equal(p.modules.render.samples,d.completedFrames);
    for(const config of [run.beforeFixture,run.fixture]){
      assert.equal(config.quality,quality);assert.equal(config.zone,'town');assert.equal(config.post,quality==='high');assert.equal(config.dpr,1);assert.equal(config.cap,60);
      assert.equal(config.dynFps,false);assert.equal(config.adaptive,false);assert.equal(config.modal,0);assert.equal(config.shadow,true);
      assert.deepEqual(config.viewport,[960,600]);assert.equal(config.aa,quality==='high'?'msaa4':'native');assert.equal(config.mobile,false);assert.equal(config.busy,false);
      assert.equal(config.shadowAutoUpdate,true);assert.equal(config.shadowSize,2048);assert.equal(config.shadowType,2);
      assert.equal(config.house,1);assert.deepEqual(config.furniture,{home:6,house:0,build:0});
    }
    if(scene==='town-walk')assert(run.motion.distance>1&&run.motion.keys.includes('KeyA')&&run.motion.keys.includes('KeyD'),'Walk inactive');
  }
  assert.equal(seen.size,data.runs.length);
  return data;
}
function summarize(data) {
  return Object.fromEntries(['mid','high'].flatMap(quality=>['town-idle','town-walk'].map(scene=>{
    const runs=data.runs.filter(run=>run.quality===quality&&run.scene===scene), phase={};
    for(const key of phaseNames)phase[key]=quality==='mid'&&key==='postprocessing'?null:median(runs.map(run=>run.diagnostic.performance.draw.timings[key].averageMs));
    const total=Object.values(phase).reduce((sum,value)=>sum+(value||0),0);
    const rank=Object.entries(phase).filter(([,value])=>value!==null).sort((a,b)=>b[1]-a[1]).map(([name,averageMs])=>({name,medianRunAverageMs:averageMs,shareOfTheseCategoriesPercent:total?averageMs/total*100:null}));
    const metrics={...phase,render:median(runs.map(run=>run.diagnostic.performance.modules.render.averageMs)),view:median(runs.map(run=>run.diagnostic.performance.modules.view.averageMs)),
      fps:median(runs.map(run=>run.diagnostic.performance.fps)),cpuP95:median(runs.map(run=>run.diagnostic.performance.cpuP95Ms))};
    return [quality+'-'+scene,{metrics,rank,rounds:runs.map(run=>({round:run.round,frames:run.diagnostic.performance.draw.completedFrames,
      mainScene:run.diagnostic.performance.draw.timings.mainScene.averageMs,mainShadow:run.diagnostic.performance.draw.timings.mainShadow.averageMs,
      postprocessing:run.diagnostic.performance.draw.timings.postprocessing.averageMs,motionDistance:run.motion.distance,
      meshSubmissionsPerFrame:run.meshCensus.meshSubmissionsPerFrame})),note:'Shares are within these CPU categories, not total frame/GPU time; medians are of per-run averages.'}];
  })));
}
const before=load(beforePath), result={pass:true,schema:'nuannuan-town-draw-comparison-v1',measurementId:before.measurementId,before:{path:path.resolve(beforePath),summary:summarize(before)}};
const allowChanged=(opt('--allow-changed')||'').split(',').filter(Boolean).map(file=>'/'+file.replace(/^\//,''));
for(const [name,file]of [['after',afterPath],['control',controlPath]])if(file){
  const data=load(file);assert.equal(data.measurementId,before.measurementId,'Measurement version mismatch');assert.deepEqual(data.conditions,before.conditions,'Fixture mismatch');
  assert.equal(data.seconds,before.seconds);assert.equal(data.rounds,before.rounds);
  for(const run of data.runs){const original=before.runs.find(r=>r.round===run.round&&r.quality===run.quality&&r.scene===run.scene);
    for(const key of ['beforeFixture','fixture']){const withoutResources=({geometryCount,textureCount,...rest})=>rest;assert.deepEqual(withoutResources(run[key]),withoutResources(original[key]),'Runtime fixture drift: '+key);}}
  const changes=[...new Set([...Object.keys(before.sourceHashes),...Object.keys(data.sourceHashes)])].filter(key=>before.sourceHashes[key]!==data.sourceHashes[key]);
  if(name==='control')assert.deepEqual(changes,[],'Control must use original measurement source');else assert(changes.every(key=>allowChanged.includes(key)),'Unapproved source changes: '+changes.join(','));
  result[name]={path:path.resolve(file),changes,summary:summarize(data)};
}
result.note='CPU diagnosis, not GPU/temperature proof. Default-off unchanged workload and picture/gameplay regression must be validated separately. Full A/B/control with identical measurement hashes is required before performance claims.';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));
for(const [name,group]of Object.entries(result.before.summary))console.log(name+' '+JSON.stringify(group.metrics)+' rank='+group.rank.map(row=>row.name).join(' > '));
console.log('REPORT '+path.resolve(output));
