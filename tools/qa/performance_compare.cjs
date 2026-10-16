// Compare successful serial profile reports; timings are observations, not an FPS guarantee.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const [beforeFile, afterFile, output] = process.argv.slice(2);
if (!beforeFile || !afterFile || !output) throw new Error('Usage: node performance_compare.cjs before/report.json after/report.json new-comparison.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const before = read(beforeFile), after = read(afterFile);
for (const report of [before, after]) {
  assert.equal(report.pass, true);assert.deepEqual(report.errors, []);assert.deepEqual(report.external, []);
  assert(Number.isInteger(report.rounds) && report.rounds >= 3, 'Use at least three repetitions');
  assert(Number.isFinite(report.seconds) && report.seconds >= 2, 'Invalid sample duration');
  assert.equal(report.conditions.scenarioRevision, 2, 'Use validated walking fixtures');
  const names=['town-idle','town-walk','house-idle','house-select','build-select','menu','explicit-refresh-actions','fixture'];
  assert.equal(report.runs.length, names.length * report.rounds, 'Unexpected or missing groups');
  for (const name of names) {
    const rows=report.runs.filter(row=>row.name===name);
    assert.deepEqual(rows.map(row=>row.round).sort((a,b)=>a-b),Array.from({length:report.rounds},(_,i)=>i),'Incomplete/duplicate rounds: '+name);
    if(name==='town-walk')assert(rows.every(row=>row.motion?.samples>0&&row.motion?.distance>0.1),'Missing walk movement evidence');
    if(name==='fixture')for(const {config} of rows){
      assert(config && config.quality===report.conditions.quality && config.dpr===report.conditions.dpr && config.cap===report.conditions.cap,'Missing or incorrect fixture settings');
      assert(typeof config.post==='boolean' && typeof config.shadow==='boolean','Missing render settings');
      assert(['home','house','build'].every(key=>Number.isInteger(config.furniture?.[key])&&config.furniture[key]>=0),'Missing furniture counts');
    }
    if(name==='explicit-refresh-actions')assert(rows.every(row=>['childList','attributes','characterData'].every(key=>Number.isInteger(row.counters?.domMutations?.[key])&&row.counters.domMutations[key]>=0)),'Invalid DOM mutation counts');
  }
}
assert.deepEqual(before.conditions, after.conditions);assert.equal(before.seconds, after.seconds);
const median = values => { assert(values.length>0 && values.every(Number.isFinite),'Empty or invalid metric');const v = [...values].sort((a,b)=>a-b), m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2; };
const rounded = n => Math.round(n * 1000) / 1000;
const ratio = (a,b) => a ? rounded((b/a-1)*100) : null;
const select = (report,name) => report.runs.filter(run => run.name===name);
const fixtures = report => select(report,'fixture').map(run=>run.config);
assert.deepEqual(fixtures(before), fixtures(after), 'Quality, frame cap and scene furniture must match');
const sceneNames = ['town-idle','town-walk','house-idle','house-select','build-select','menu'];
const samplerSchema = report => {
  const schemas = report.runs.filter(run => sceneNames.includes(run.name)).map(run => run.diagnostic?.performance?.draw?.schema ?? null);
  assert(schemas.every(schema => schema === null || typeof schema === 'string'), 'Invalid draw sampler schema');
  assert.equal(new Set(schemas).size, 1, 'Mixed draw samplers in one profile report');
  return schemas[0];
};
const drawSampler = samplerSchema(before);
assert.equal(drawSampler, samplerSchema(after), 'Draw sampler versions must match; instrumentation overhead changed');
const scenes=[];
for (const name of sceneNames) {
  const old=select(before,name), now=select(after,name);assert.equal(old.length,before.rounds);assert.equal(now.length,after.rounds);
  const metrics={};
  for (const [key,get] of Object.entries({ fps:r=>r.diagnostic.performance.fps,cpuP95Ms:r=>r.diagnostic.performance.cpuP95Ms,
    viewMeanMs:r=>r.diagnostic.performance.modules.view.averageMs,renderMeanMs:r=>r.diagnostic.performance.modules.render.averageMs,
    hooksMeanMs:r=>r.diagnostic.performance.modules.hooks.averageMs,drawCallsLastFrame:r=>r.diagnostic.performance.drawCalls })) {
    const a=median(old.map(get)),b=median(now.map(get));metrics[key]={before:rounded(a),after:rounded(b),changePercent:key==='drawCallsLastFrame'?null:ratio(a,b),beforeRuns:old.map(get),afterRuns:now.map(get)};
  }
  scenes.push({name,metrics});
}
const actions={};
for (const key of ['UI.refreshAll','UI.refreshQuest','UI.refreshDecor','house.houseFit','house.refreshFurnitureFits']) {
  const old=select(before,'explicit-refresh-actions').map(r=>r.counters.methods[key]),now=select(after,'explicit-refresh-actions').map(r=>r.counters.methods[key]);
  assert([...old,...now].every(v=>v && Number.isInteger(v.calls) && v.calls>=0 && Number.isFinite(v.totalMs)), 'Invalid action metric: '+key);
  actions[key]={beforeCalls:old.map(v=>v.calls),afterCalls:now.map(v=>v.calls),beforeMedianMs:rounded(median(old.map(v=>v.totalMs))),afterMedianMs:rounded(median(now.map(v=>v.totalMs)))};
}
const mutations = report => select(report,'explicit-refresh-actions').map(r=>r.counters.domMutations);
const result={pass:true,before:path.resolve(beforeFile),after:path.resolve(afterFile),conditions:before.conditions,drawSampler,scenes,actions,mutations:{before:mutations(before),after:mutations(after)},
  interpretation:'Same-machine local Chromium, synthetic saves, fixed scene and quality. Natural-frame timing medians are separate from instrumented action replay. Nested action costs must not be added. drawCallsLastFrame is a final-frame snapshot, sensitive to shadow-pass scheduling, not a distribution or performance gain. Timing differences may include OS/GPU noise; no physical-device heat or battery claim.'};
fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({pass:true,scenes:scenes.length,output:path.resolve(output),actions},null,2));
