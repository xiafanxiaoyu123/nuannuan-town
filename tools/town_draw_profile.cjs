// Serial CPU profiling launcher; only OS runtime variables enter the isolated Electron process.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const electron = path.join(root, 'desktop/node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (!fs.existsSync(electron)) throw Error('Project Electron dependency is missing');
const allowed = new Set(['path', 'systemroot', 'windir', 'temp', 'tmp', 'comspec', 'pathext', 'localappdata', 'appdata', 'userprofile']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
const child = spawnSync(electron, [path.join(root, 'tools/qa/town_draw_profile.cjs'), ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (child.error) console.error(child.error.message); process.exit(child.status ?? 1);
