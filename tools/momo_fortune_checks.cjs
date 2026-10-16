// Repeatable gameplay/save regression through reviewed isolated QA entries.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const safe = path.join(root, 'docs/ai-handoff/skills/nuannuan-maintenance/scripts/safe_local.py');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(name)));
const suites = ['momo_gameplay_checks.cjs', 'fortune_save_checks.cjs'];
const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const out = path.join(root, 'output', 'momo-fortune-regression-' + stamp);
fs.mkdirSync(out, { recursive: true });
const report = { pass: true, source: root, out, suites: [], environment: 'OS allowlist; safe_local; synthetic data; payments disabled' };
for (const suite of suites) {
  const result = spawnSync('python', ['-B', '-X', 'utf8', safe, '--root', root, '--mode', 'qa', '--suite', 'tools/qa/' + suite], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  const log = path.join(out, suite + '.log');
  fs.writeFileSync(log, (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : ''));
  const pass = result.status === 0 && !result.error;
  report.suites.push({ suite, pass, exitCode: result.status, log }); report.pass = report.pass && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${suite}`);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, passed: report.suites.filter(item => item.pass).length, total: suites.length, report: path.join(out, 'report.json') }));
if (!report.pass) process.exitCode = 1;
