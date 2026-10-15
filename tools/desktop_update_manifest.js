'use strict';

// 为 Windows 资源覆盖发布生成 manifest。示例：
// node tools/desktop_update_manifest.js --root desktop/dist --version 2.1.1 \
//   --base-version 2.1.0 --base-url https://example.invalid/updates/2.1.1/ \
//   --output release/windows-update-manifest.json
// 123 官方直链使用 --url-map=release/delivery-links.json。映射格式为
// {"js/main.js":"https://..."} 或共享配置的 {"windows":{...}}。
// 增量同时发布 --full-output=... --full-url=https://入口/.../full.json，
// 旧版本可下载已签名的完整资源快照，不会错用相邻版本的增量。

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_PRODUCT, normalizeRelative, pathInside, sha256File, signManifest, validateManifest,
} = require('../desktop/updater');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function listFiles(root, current = root) {
  const output = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(root, absolute));
    else if (entry.isFile()) output.push(normalizeRelative(path.relative(root, absolute)));
  }
  return output;
}

const root = path.resolve(arg('root', 'desktop/dist'));
const baseRootArg = arg('base-dir', '');
const baseRoot = baseRootArg ? path.resolve(baseRootArg) : null;
const baseVersion = arg('base-version', null);
if (Boolean(baseRoot) !== Boolean(baseVersion)) throw new Error('增量发布需要同时指定 --base-dir 和 --base-version；完整快照请都省略');
const version = arg('version');
if (!version) throw new Error('缺少 --version=...');
const output = path.resolve(arg('output', path.join('release', `windows-update-${version}.json`)));
const baseUrlArg = arg('base-url', '');
const baseUrl = baseUrlArg ? baseUrlArg.replace(/\/?$/, '/') : '';
const urlMapFile = arg('url-map', '');
let urlMap = null;
if (urlMapFile) {
  const input = JSON.parse(fs.readFileSync(path.resolve(urlMapFile), 'utf8').replace(/^\uFEFF/, ''));
  urlMap = input.windows || input;
  if (!urlMap || typeof urlMap !== 'object' || Array.isArray(urlMap)) throw new Error('直链映射必须是资源路径到 HTTPS URL 的对象');
}
function resourceUrl(relative) {
  let value = null;
  if (urlMap) {
    if (!Object.prototype.hasOwnProperty.call(urlMap, relative)) throw new Error(`直链映射缺少 Windows 资源: ${relative}`);
    const entry = urlMap[relative];
    value = typeof entry === 'string' ? entry : entry && entry.url;
    if (!value) throw new Error(`直链映射 URL 无效: ${relative}`);
  } else if (baseUrl) {
    value = new URL(relative.split('/').map(encodeURIComponent).join('/'), baseUrl).toString();
  }
  if (value == null) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`资源 URL 必须使用无凭据的 HTTPS: ${relative}`);
  return url.toString();
}
const files = listFiles(root).sort();
const baseFiles = baseRoot ? listFiles(baseRoot).sort() : [];
const baseSet = new Set(baseFiles);
const currentSet = new Set(files);
const changedFiles = files.filter((relative) => {
  if (!baseRoot || !baseSet.has(relative)) return true;
  const current = pathInside(root, relative);
  const previous = pathInside(baseRoot, relative);
  const a = fs.statSync(current);
  const b = fs.statSync(previous);
  return a.size !== b.size || sha256File(current) !== sha256File(previous);
});
const removedFiles = baseRoot ? baseFiles.filter((relative) => !currentSet.has(relative)) : [];
function buildRaw(paths, baseline) { return {
  schema: 1,
  product: arg('product', DEFAULT_PRODUCT),
  version,
  baseVersion: baseline,
  minRuntime: arg('min-runtime', '1'),
  remove: removedFiles,
  files: paths.map((relative) => {
    const file = pathInside(root, relative);
    const stat = fs.statSync(file);
    return {
      path: relative,
      url: resourceUrl(relative),
      size: stat.size,
      sha256: sha256File(file),
    };
  }),
}; }
const privateKeyFile = arg('private-key', '');
const privateKey = privateKeyFile ? fs.readFileSync(path.resolve(privateKeyFile), 'utf8') : null;
function authenticate(raw) {
  if (privateKey) return signManifest(raw, {
    privateKey,
    keyId: arg('key-id', null),
  });
  return validateManifest(raw, { product: raw.product });
}
let manifest = authenticate(buildRaw(changedFiles, baseVersion));
const releaseNotes = arg('release-notes', '');
if (releaseNotes) manifest.releaseNotes = releaseNotes;
const fullOutputArg = arg('full-output', '');
const fullUrlArg = arg('full-url', '');
if (Boolean(fullOutputArg) !== Boolean(fullUrlArg)) throw new Error('--full-output 和 --full-url 必须同时提供');
let fullOutput = null;
if (fullOutputArg) {
  if (!baseRoot) throw new Error('当前已经是完整快照，无需 --full-output');
  const fullUrl = new URL(fullUrlArg);
  if (fullUrl.protocol !== 'https:' || fullUrl.username || fullUrl.password) throw new Error('完整快照 URL 必须使用无凭据的 HTTPS');
  fullOutput = path.resolve(fullOutputArg);
  if (fullOutput === output) throw new Error('完整快照与增量清单不能写到同一路径');
  const fullManifest = authenticate(buildRaw(files, null));
  if (releaseNotes) fullManifest.releaseNotes = releaseNotes;
  fs.mkdirSync(path.dirname(fullOutput), { recursive: true });
  fs.writeFileSync(fullOutput, `${JSON.stringify(fullManifest, null, 2)}\n`, 'utf8');
  // Routing hint only: the client separately checks the fetched snapshot signature,
  // its product, its target version, and that it is a complete snapshot.
  manifest.fullManifestUrl = fullUrl.toString();
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'ok', output, fullOutput, version, fileCount: manifest.files.length, removedCount: manifest.remove.length, bytes: manifest.files.reduce((sum, file) => sum + file.size, 0), incremental: Boolean(baseRoot), directLinkMapping: Boolean(urlMap) }, null, 2));
