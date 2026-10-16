// Parse and resolve imports with the same compiler used by web builds.
// write:false is deliberate: importing this tool never imports game code.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

function filesBelow(directory, extensions = /\.(?:js|mjs)$/) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Source symlink must be reviewed: ' + path.join(directory, entry.name));
    if (['node_modules', 'out', '__pycache__', '.git'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file, extensions) : extensions.test(entry.name) ? [file] : [];
  }).sort();
}

async function inspectModules(root, { mode = 'all', bundle = false, debug = false } = {}) {
  root = path.resolve(root);
  const slash = (file) => path.relative(root, file).split(path.sep).join('/');
  const entries = mode === 'all' ? filesBelow(path.join(root, 'js')).map(slash) : ['js/main.js'];
  if (!entries.length) throw new Error('No game modules found');
  const packaged = fs.existsSync(path.join(root, 'vendor/three/lib/three.module.js'));
  const three = path.join(root, packaged ? 'vendor/three' : 'node_modules/three');
  const options = {
    absWorkingDir: root, bundle: true, write: false, metafile: true,
    platform: 'browser', target: 'es2020', logLevel: 'silent',
    format: mode === 'web' ? 'iife' : 'esm', legalComments: 'none',
    minify: mode === 'web' && !debug, treeShaking: mode === 'web',
    alias: { three: path.join(three, packaged ? 'lib/three.module.js' : 'build/three.module.js'), 'three/addons': path.join(three, 'examples/jsm') },
  };
  if (mode === 'all') options.stdin = {
    contents: entries.map((file) => `import ${JSON.stringify('./' + file)};`).join('\n'),
    resolveDir: root, sourcefile: '__engineering_entry__.js', loader: 'js',
  };
  else options.entryPoints = entries;
  if (debug) options.sourcemap = 'inline';
  const result = await esbuild.build(options);
  const inputs = {};
  for (const [name, info] of Object.entries(result.metafile.inputs)) {
    if (name === '__engineering_entry__.js') continue;
    inputs[name.replaceAll('\\', '/')] = {
      bytes: info.bytes,
      imports: info.imports.map((item) => ({ path: item.path.replaceAll('\\', '/'), kind: item.kind, external: !!item.external, original: item.original })),
    };
  }
  const report = { schema: 1, mode, esbuildVersion: esbuild.version, entries, inputs,
    warnings: await esbuild.formatMessages(result.warnings, { kind: 'warning', color: false }) };
  if (bundle) report.bundle = result.outputFiles[0].text;
  return report;
}

function cyclesOf(inputs) {
  // Tarjan SCCs report cyclic groups once instead of every possible cycle.
  let cursor = 0;
  const indices = new Map(), lows = new Map(), stack = [], active = new Set(), groups = [];
  const nodes = Object.keys(inputs).filter((name) => name.startsWith('js/'));
  const edges = (name) => inputs[name].imports.filter((item) => !item.external && item.path.startsWith('js/') && inputs[item.path]).map((item) => item.path);
  function visit(node) {
    indices.set(node, cursor); lows.set(node, cursor++); stack.push(node); active.add(node);
    for (const next of edges(node)) {
      if (!indices.has(next)) { visit(next); lows.set(node, Math.min(lows.get(node), lows.get(next))); }
      else if (active.has(next)) lows.set(node, Math.min(lows.get(node), indices.get(next)));
    }
    if (lows.get(node) === indices.get(node)) {
      const group = []; let member;
      do { member = stack.pop(); active.delete(member); group.push(member); } while (member !== node);
      if (group.length > 1 || edges(node).includes(node)) groups.push(group.sort());
    }
  }
  for (const node of nodes) if (!indices.has(node)) visit(node);
  return groups.sort((a, b) => a.join('|').localeCompare(b.join('|')));
}

module.exports = { inspectModules, cyclesOf, filesBelow };
if (require.main === module) {
  const args = process.argv.slice(2), value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  inspectModules(value('--root', path.resolve(__dirname, '..')), {
    mode: value('--mode', 'all'), bundle: args.includes('--bundle'), debug: args.includes('--debug'),
  }).then((report) => console.log(JSON.stringify(report))).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
