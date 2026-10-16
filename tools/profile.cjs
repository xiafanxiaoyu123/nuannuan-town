// Dedicated Electron profiler. Clears inherited app credentials and uses synthetic saves.
// Run serially; do not run builds/UI tests alongside a performance comparison.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const electron = path.join(root, 'desktop/node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (!fs.existsSync(electron)) throw new Error('Install the project desktop Electron dependencies before profiling.');
const allowed = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'comspec', 'pathext', 'localappdata', 'appdata', 'userprofile']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
const result = spawnSync(electron, [path.join(root, 'tools/qa/performance_profile.cjs'), ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
