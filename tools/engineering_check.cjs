// Read-only engineering gate: compile in memory, inspect files; never load app/server code.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');
const { inspectModules, cyclesOf, filesBelow } = require('./module_graph.cjs');
const root = path.resolve(__dirname, '..');
const json = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));

async function main() {
  const report = { readOnly: true, checks: [], warnings: [] };
  const graph = await inspectModules(root);
  const web = await inspectModules(root, { mode: 'web' });
  report.checks.push(`Game ESM syntax/import closure: ${graph.entries.length} modules, ${Object.keys(graph.inputs).length} inputs`);
  report.checks.push(`Web IIFE/es2020 closure: ${Object.keys(web.inputs).length} inputs`);
  report.warnings.push(...graph.warnings, ...web.warnings);
  const resourceResult = spawnSync(process.env.PYTHON || 'python', ['-B', '-X', 'utf8', path.join(__dirname, 'resource_graph.py'), '--root', root], { encoding: 'utf8', windowsHide: true });
  if (resourceResult.status !== 0) throw new Error(resourceResult.stderr || resourceResult.error?.message || 'Resource closure failed');
  report.resources = JSON.parse(resourceResult.stdout);
  report.checks.push('HTML/CSS/local resource closure and path case');

  const contract = await esbuild.build({ absWorkingDir: root, entryPoints: [path.join(root, 'server/save-contract.js')], bundle: true,
    platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'silent' });
  const contractInputs = Object.keys(contract.metafile.inputs).map(name => name.replace(/\\/g, '/'));
  if (!contractInputs.includes('js/core/save-format.js') || contractInputs.some(name => /(?:^|\/)(?:state|account|app|kit|icons)\.js$/.test(name) || name.startsWith('node_modules/'))) {
    throw new Error('Server save validation must reuse the renderer-free client contract without game runtime dependencies');
  }
  report.saveContractInputs = contractInputs;
  report.checks.push('Shared server/client save validation import closure has no renderer or application runtime');

  // Parse tools/host/server files without executing them or creating databases.
  const scripts = ['server.js', 'server-api.js'].map((name) => path.join(root, name));
  for (const directory of ['tools', 'server', 'desktop', 'site/admin']) {
    scripts.push(...filesBelow(path.join(root, directory), /\.(?:js|cjs|mjs)$/).filter((file) => !file.includes(path.sep + 'dist' + path.sep)));
  }
  for (const file of scripts) await esbuild.transform(fs.readFileSync(file, 'utf8'), { loader: 'js', sourcefile: file, target: 'esnext', logLevel: 'silent' });
  report.checks.push(`Server/host/tool syntax only: ${scripts.length} files`);

  const versions = Object.fromEntries(['desktop/package.json', 'apk/package.json', 'site/releases.json'].map((name) => [name, json(name).version]));
  const gradle = fs.readFileSync(path.join(root, 'apk/android/app/build.gradle'), 'utf8');
  versions['apk/android/app/build.gradle'] = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
  if (!Object.values(versions).every((v) => typeof v === 'string' && /^\d+(\.\d+)*$/.test(v)) || new Set(Object.values(versions)).size !== 1 || !Number.isSafeInteger(code) || code < 1) {
    throw new Error('Platform version metadata differs or is invalid: ' + JSON.stringify(versions));
  }
  const manifest = json('package.json'), lock = json('package-lock.json');
  if (!manifest.private || manifest.type === 'module') throw new Error('Root tooling manifest must remain private and preserve CommonJS tools');
  for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (lock.packages['node_modules/' + name]?.version !== version || json('node_modules/' + name + '/package.json').version !== version) {
      throw new Error('Dependency/lock/install version mismatch: ' + name);
    }
  }
  report.versions = { ...versions, androidVersionCode: code };
  report.checks.push('Platform version metadata and pinned local dependencies');

  const baseline = json('tools/engineering-cycles.json').groups;
  report.cycles = cyclesOf(graph.inputs);
  for (const group of report.cycles) {
    if (!baseline.some((old) => group.every((file) => old.includes(file)))) throw new Error('New module cycle; review instead of expanding the baseline: ' + group.join(' -> '));
    report.warnings.push('Existing cycle (not a new failure): ' + group.join(' <-> '));
  }
  report.checks.push('Module cycles compared with recorded baseline');
  report.pass = true;
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.error('Engineering check failed: ' + error.message); process.exitCode = 1; });
