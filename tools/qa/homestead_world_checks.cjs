// Explicitly isolated Electron runner: no inherited account/payment/Node configuration.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['path','systemroot','windir','temp','tmp','comspec','pathext'].includes(k.toLowerCase())));
env.LIVE_QA_OUT = path.join(root,'output','homestead-home-20261019','world-'+Date.now());
const result = spawnSync(path.join(root,'desktop/node_modules/electron/dist/electron.exe'), [path.join(__dirname,'homestead_home_world_checks.js')], { cwd:root,env,stdio:'inherit',windowsHide:true,timeout:240000 });
if(result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
