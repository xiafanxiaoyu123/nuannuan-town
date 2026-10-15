// Offline source checks. Does not start the game or read any player database.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules', 'dist', 'output', 'release', 'build', '.git', '.gradle']);
function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return excluded.has(entry.name) ? [] : sourceFiles(file);
    return /\.(?:js|cjs|mjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = ['server.js', 'server-api.js'].map((file) => path.join(root, file));
for (const directory of ['js', 'server', 'desktop', 'tools']) files.push(...sourceFiles(path.join(root, directory)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.error?.message || result.stderr || `Cannot check ${file}\n`);
    process.exit(1);
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<link\b[^>]*href="(css\/[^"<>]+)"/g)].map((match) => match[1]);
const required = [...styles, 'js/main.js', 'js/desktop-updates.js', 'js/mobile-updates.js', 'server/gift-catalog.json', 'node_modules/three/build/three.module.js', 'node_modules/three/LICENSE'];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing required file: ${relative}. Run npm ci first.`);
}
JSON.parse(fs.readFileSync(path.join(root, 'server/gift-catalog.json'), 'utf8'));
console.log(`Source checks passed: ${files.length} JavaScript files, ${styles.length} stylesheets, required runtime files.`);
