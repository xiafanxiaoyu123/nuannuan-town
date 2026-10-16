// Small command router. Runtime/QA isolation remains owned by safe_local.py.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const [command, ...extra] = process.argv.slice(2);
const safe = path.join(root, 'docs/ai-handoff/skills/nuannuan-maintenance/scripts/safe_local.py');
const suites = {
  'qa:save': 'tools/qa/save_transfer_checks.js',
  'qa:daily': 'tools/qa/daily_save_checks.cjs',
  'qa:daily-module': 'tools/qa/daily_module_checks.cjs',
  'qa:diagnostics': 'tools/qa/diagnostics_checks.cjs',
  'qa:draw': 'tools/qa/draw_diagnostics_checks.cjs',
  'qa:cloud': 'tools/qa/cloud_sync_lifecycle_checks.js',
  'qa:momo-gameplay': 'tools/qa/momo_gameplay_checks.cjs',
  'qa:fortune-save': 'tools/qa/fortune_save_checks.cjs',
  'qa:backend-game-save': 'tools/qa/backend_game_save_checks.cjs',
  'qa:backend-contract': 'tools/qa/backend_contract_checks.cjs',
  'qa:backend-security': 'tools/qa/backend_security_checks.cjs',
  'qa:backend-payment': 'tools/qa/backend_payment_checks.cjs',
  'qa:dependencies': 'tools/qa/dependency_refactor_checks.cjs',
  'qa:town-module': 'tools/qa/town_module_checks.cjs',
  'qa:decor-module': 'tools/qa/decor_module_checks.cjs',
  'qa:decor-drag': 'tools/qa/decor_drag_checks.cjs',
  'qa:town-static': 'tools/qa/town_static_props_checks.cjs',
  'qa:scene': 'tools/qa/scene_performance_checks.cjs',
  'qa:decor-fit': 'tools/qa/decor_fit_checks.cjs',
  'qa:ui-presentation': 'tools/qa/ui_presentation_checks.cjs',
};
let args;
if (command === 'dev' || command === 'dev:workbench' || suites[command]) {
  args = [safe, '--root', root, '--mode', suites[command] ? 'qa' : command === 'dev' ? 'game' : 'workbench'];
  if (suites[command]) args.push('--suite', suites[command]);
} else if (command === 'build:esm' || command === 'build:web') {
  args = [path.join(root, 'tools', command === 'build:esm' ? 'build_dist.py' : 'build_single.py')];
  if (!extra.some((arg) => arg === '--out' || arg.startsWith('--out='))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    args.push('--out', path.join(root, 'output/builds', stamp, command === 'build:esm' ? 'dist' : 'web'));
  }
} else {
  console.error('Unknown local task: ' + command);
  process.exit(2);
}
const result = spawnSync(process.env.PYTHON || 'python', ['-B', '-X', 'utf8', ...args, ...extra], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
