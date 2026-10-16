// Verify the bytes inside Electron's ASAR, using the project's installed reader.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');

async function main() {
  const [project, native, archive] = process.argv.slice(2);
  if (!project || !native || !archive) throw new Error('Expected project, native directory and ASAR path');
  const reader = require.resolve('@electron/asar', { paths: [path.join(project, 'desktop')] });
  const { extractFile } = await import(pathToFileURL(reader).href);
  const manifest = JSON.parse(fs.readFileSync(path.join(native, 'build-manifest.json'), 'utf8'));
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const files = { ...manifest.files, 'build-manifest.json': digest(fs.readFileSync(path.join(native, 'build-manifest.json'))) };
  for (const [file, expected] of Object.entries(files)) {
    if (digest(extractFile(archive, path.join('dist', ...file.split('/')))) !== expected) {
      throw new Error('Windows packaged asset mismatch: ' + file);
    }
  }
  console.log(JSON.stringify({ pass: true, filesChecked: Object.keys(files).length }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
