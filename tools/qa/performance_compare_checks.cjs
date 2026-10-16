// Validate report rejection using a real successful synthetic profiling report.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const [input, directory] = process.argv.slice(2);
if (!input || !directory) throw new Error('Usage: node performance_compare_checks.cjs validated-report.json new-output-directory');
const source = JSON.parse(fs.readFileSync(input, 'utf8')), out = path.resolve(directory);
assert(!fs.existsSync(out), 'Keep previous evidence');fs.mkdirSync(out, { recursive: true });
const baseline = path.join(out, 'baseline.json');fs.writeFileSync(baseline, JSON.stringify(source));
const checks = [];
function check(name, change, valid = false, changeBefore = null) {
  const report = structuredClone(source);change(report);
  const file = path.join(out, name + '-input.json'), result = path.join(out, name + '-comparison.json');
  fs.writeFileSync(file, JSON.stringify(report));
  let reference = baseline;
  if (changeBefore) {
    const changed = structuredClone(source);changeBefore(changed);
    reference = path.join(out, name + '-before.json');fs.writeFileSync(reference, JSON.stringify(changed));
  }
  const run = spawnSync(process.execPath, [path.join(__dirname, 'performance_compare.cjs'), reference, file, result], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status === 0, valid, name + ': ' + run.stderr);
  assert.equal(fs.existsSync(result), valid, 'Invalid report must not produce accepted comparison');
  if (valid) assert.equal(JSON.parse(fs.readFileSync(result, 'utf8')).pass, true);
  checks.push({ name, pass: true });
}
check('complete', () => {}, true);
check('missing-fixture', r => { r.runs = r.runs.filter(row => row.name !== 'fixture'); });
check('missing-actions', r => { r.runs = r.runs.filter(row => row.name !== 'explicit-refresh-actions'); });
check('missing-fixture-settings', r => { delete r.runs.find(row => row.name === 'fixture').config; });
check('missing-dom-counts', r => { delete r.runs.find(row => row.name === 'explicit-refresh-actions').counters.domMutations; });
check('duplicate-round', r => { r.runs.find(row => row.name === 'menu' && row.round === 1).round = 0; });
check('no-movement', r => { r.runs.find(row => row.name === 'town-walk').motion.distance = 0; });
check('missing-action', r => { delete r.runs.find(row => row.name === 'explicit-refresh-actions').counters.methods['UI.refreshQuest']; });
check('invalid-metric', r => { r.runs.find(row => row.name === 'house-idle').diagnostic.performance.fps = null; });
check('different-quality', r => { r.conditions.quality = 'low'; });
check('failed-report', r => { r.pass = false; });
const setDrawSampler = (report, schema) => { for (const run of report.runs) if (run.diagnostic) run.diagnostic.performance.draw = { schema }; };
check('different-draw-sampler', r => setDrawSampler(r, 'qa-different-draw-sampler'));
check('mixed-draw-samplers', r => { r.runs.find(row => row.name === 'town-idle').diagnostic.performance.draw = { schema: 'qa-mixed-draw-sampler' }; });
check('matching-new-draw-sampler', r => setDrawSampler(r, 'nuannuan-draw-cpu-v1'), true, r => setDrawSampler(r, 'nuannuan-draw-cpu-v1'));
const protectedOutput = path.join(out, 'protected.json');fs.writeFileSync(protectedOutput, 'existing evidence');
const collision = spawnSync(process.execPath, [path.join(__dirname, 'performance_compare.cjs'), baseline, baseline, protectedOutput], { encoding: 'utf8', windowsHide: true });
assert.notEqual(collision.status, 0);assert.equal(fs.readFileSync(protectedOutput, 'utf8'), 'existing evidence');
checks.push({ name: 'preserve-existing-evidence', pass: true });
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pass: true, checks }, null, 2));
console.log(JSON.stringify({ pass: true, checks: checks.length, out }));
