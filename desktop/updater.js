'use strict';

// Windows 资源覆盖更新器。
//
// 这个模块只管理“资源层”：更新文件放在用户目录的独立版本目录中，
// 通过 active.json 指针切换；Electron 本体、签名和用户存档不会被覆盖。
// 网络检查默认关闭，只有显式传入 manifest URL 才会发起请求。

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SCHEMA = 1;
const DEFAULT_PRODUCT = 'nikki-block-town-windows';
// Windows 与 Android 共用这套清单签名协议：
// P-256 ECDSA + SHA-256，签名值为 ASN.1 DER 签名的 base64。
const SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256';

function sha256Buffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('资源路径不能为空');
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error(`禁止绝对资源路径: ${value}`);
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`禁止越界资源路径: ${value}`);
  return parts.join('/');
}

function normalizeVersion(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)) {
    throw new Error(`更新版本号无效: ${value}`);
  }
  return value;
}

// Released packages use numeric dotted versions. Unknown development labels
// retain their prior behavior; compare numeric segments rather than strings.
function compareReleaseVersions(left, right) {
  if (!/^\d+(\.\d+)*$/.test(left || '') || !/^\d+(\.\d+)*$/.test(right || '')) return null;
  const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0n, y = b[i] || 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function normalizeSignature(value) {
  if (value == null || value === '') return null;
  const signature = typeof value === 'string' ? { algorithm: SIGNATURE_ALGORITHM, value } : value;
  if (!signature || typeof signature !== 'object' || Array.isArray(signature)) throw new Error('签名字段无效');
  if (signature.algorithm !== SIGNATURE_ALGORITHM) throw new Error(`不支持的清单签名算法: ${signature.algorithm || '(missing)'}`);
  if (typeof signature.value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature.value)) throw new Error('清单签名值必须是 base64');
  if (signature.keyId != null && (typeof signature.keyId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(signature.keyId))) throw new Error('清单签名 keyId 无效');
  return { algorithm: SIGNATURE_ALGORITHM, keyId: signature.keyId || null, value: signature.value };
}

// RFC 8785 的完整实现对当前清单没有必要；这里采用跨端可复现的递归 key 排序，
// 紧凑 JSON 和 UTF-8。files/remove 会按路径排序，使发布端的数组顺序也不影响签名。
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalManifestPayload(input) {
  const manifest = validateManifest(input, { product: input && input.product ? input.product : DEFAULT_PRODUCT });
  const payload = {
    schema: manifest.schema,
    product: manifest.product,
    version: manifest.version,
    baseVersion: manifest.baseVersion,
    minRuntime: manifest.minRuntime,
    remove: [...manifest.remove].sort(),
    files: manifest.files.map((file) => ({
      path: file.path,
      url: file.url,
      size: file.size,
      sha256: file.sha256,
    })).sort((a, b) => a.path.localeCompare(b.path)),
  };
  return canonicalize(payload);
}

function signManifest(input, { privateKey, keyId = null } = {}) {
  if (!privateKey) throw new Error('签名清单需要 privateKey；不要把私钥写入客户端');
  const manifest = validateManifest({ ...input, signature: null }, { product: input.product || DEFAULT_PRODUCT });
  const payload = Buffer.from(canonicalManifestPayload(manifest), 'utf8');
  const signature = crypto.sign('sha256', payload, privateKey).toString('base64');
  return {
    ...manifest,
    signature: { algorithm: SIGNATURE_ALGORITHM, keyId: keyId || null, value: signature },
  };
}

function verifyManifestSignature(input, publicKey, { required = true, keyId = null } = {}) {
  const manifest = validateManifest(input, { product: input.product || DEFAULT_PRODUCT });
  if (!manifest.signature) {
    if (required) throw new Error('更新清单缺少签名');
    return false;
  }
  if (keyId && manifest.signature.keyId !== keyId) throw new Error('更新清单签名 keyId 不匹配');
  if (!publicKey) throw new Error('校验签名需要配置公钥');
  const payload = Buffer.from(canonicalManifestPayload(manifest), 'utf8');
  let valid = false;
  try {
    valid = crypto.verify('sha256', payload, publicKey, Buffer.from(manifest.signature.value, 'base64'));
  } catch (error) {
    throw new Error(`更新清单签名校验失败: ${error.message}`);
  }
  if (!valid) throw new Error('更新清单签名校验失败');
  return true;
}

function pathInside(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) throw new Error(`资源路径越界: ${relative}`);
  return resolved;
}

function validateManifest(input, { product = DEFAULT_PRODUCT } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('更新清单必须是 JSON 对象');
  if (input.schema !== SCHEMA) throw new Error(`不支持的更新清单 schema: ${input.schema}`);
  if (input.product !== product) throw new Error(`更新清单产品不匹配: ${input.product || '(missing)'}`);
  const version = normalizeVersion(input.version);
  if (!Array.isArray(input.files)) throw new Error('更新清单缺少 files');
  const seen = new Set();
  const files = input.files.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('files 中存在无效条目');
    const relative = normalizeRelative(entry.path);
    if (seen.has(relative)) throw new Error(`更新清单重复资源: ${relative}`);
    seen.add(relative);
    if (!/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) throw new Error(`资源缺少 sha256: ${relative}`);
    if (!Number.isInteger(entry.size) || entry.size < 0) throw new Error(`资源 size 无效: ${relative}`);
    const url = entry.url == null ? null : String(entry.url);
    return { path: relative, url, sha256: String(entry.sha256).toLowerCase(), size: entry.size };
  });
  const remove = Array.isArray(input.remove) ? input.remove.map(normalizeRelative) : [];
  const appliedRemove = input.appliedRemove == null ? null
    : (Array.isArray(input.appliedRemove) ? input.appliedRemove.map(normalizeRelative) : (() => { throw new Error('appliedRemove 必须是数组'); })());
  return {
    schema: SCHEMA,
    product: input.product || product,
    version,
    baseVersion: input.baseVersion == null || input.baseVersion === '' ? null : normalizeVersion(input.baseVersion),
    minRuntime: input.minRuntime || null,
    files,
    remove,
    appliedRemove,
    signature: normalizeSignature(input.signature),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const data = `${JSON.stringify(value, null, 2)}\n`;
  const fd = fs.openSync(temp, 'w');
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Windows 不允许 rename 覆盖已有文件，先把旧指针移到备份；
  // 新文件的内容已经 fsync，崩溃恢复时可使用 active.json.bak。
  const backup = `${file}.bak`;
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, backup); } catch (_) { /* 备份失败不影响主流程 */ }
    fs.rmSync(file, { force: true });
  }
  fs.renameSync(temp, file);
}

function copyTree(source, destination, { skipManifest = false } = {}) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skipManifest && entry.name === 'manifest.json') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to, { skipManifest });
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function requestBuffer(urlString, { timeoutMs = 20000, agent = undefined, maxBytes = 64 * 1024 * 1024, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlString); } catch (_) { reject(new Error(`更新地址无效: ${urlString}`)); return; }
    if (url.protocol !== 'https:') { reject(new Error(`更新地址必须使用 HTTPS: ${url.protocol}`)); return; }
    if (url.username || url.password) { reject(new Error('更新地址不允许包含用户名或密码')); return; }
    const client = https;
    const req = client.get(url, { agent, headers: { 'User-Agent': 'nikki-block-town-updater/1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (maxRedirects <= 0) { reject(new Error('更新下载重定向次数过多')); return; }
        let next;
        try { next = new URL(res.headers.location, url).toString(); } catch (_) { reject(new Error('更新下载重定向地址无效')); return; }
        requestBuffer(next, { timeoutMs, agent, maxBytes, maxRedirects: maxRedirects - 1 }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`下载失败 HTTP ${res.statusCode}`)); return; }
      const contentLength = Number(res.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) { res.resume(); reject(new Error('更新下载内容过大')); return; }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) { req.destroy(new Error('更新下载内容过大')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('更新下载超时')));
    req.on('error', reject);
  });
}

// latest 可继续直接提供签名增量清单。较旧的底包只接受已验签、同目标版本的
// 完整快照，防止把相邻版本的增量直接覆盖到任意旧版本上而遗漏中间资源。
async function fetchCompatibleManifest(manifestUrl, {
  product = DEFAULT_PRODUCT, currentVersion, runtimeVersion = '1', publicKey,
  keyId = null, request = requestBuffer,
} = {}) {
  const latestUrl = new URL(manifestUrl);
  if (latestUrl.protocol !== 'https:' || latestUrl.username || latestUrl.password) throw new Error('更新清单地址必须是无凭据的 HTTPS');
  const readManifest = async (url) => {
    const data = await request(url, { maxBytes: 4 * 1024 * 1024 });
    let input;
    try { input = JSON.parse(data.toString('utf8')); } catch (_) { throw new Error('更新清单不是有效 JSON'); }
    const manifest = validateManifest(input, { product });
    verifyManifestSignature(manifest, publicKey, { required: true, keyId });
    if (manifest.minRuntime && String(runtimeVersion) < String(manifest.minRuntime)) throw new Error('当前桌面运行时版本过低');
    manifest.releaseNotes = typeof input.releaseNotes === 'string' ? input.releaseNotes : null;
    return { input, manifest };
  };
  const latest = await readManifest(latestUrl.toString());
  if (latest.manifest.version === currentVersion || !latest.manifest.baseVersion || latest.manifest.baseVersion === currentVersion) return latest.manifest;
  if (typeof latest.input.fullManifestUrl !== 'string' || !latest.input.fullManifestUrl) throw new Error('更新基线不匹配，请下载安装完整新版');
  const fullUrl = new URL(latest.input.fullManifestUrl, latestUrl);
  if (fullUrl.protocol !== 'https:' || fullUrl.origin !== latestUrl.origin || fullUrl.username || fullUrl.password) throw new Error('完整更新清单必须使用入口同源 HTTPS');
  const full = await readManifest(fullUrl.toString());
  if (full.manifest.baseVersion || full.manifest.version !== latest.manifest.version) throw new Error('完整更新清单的版本或模式不匹配');
  return full.manifest;
}

function listResourceFiles(root, current = root) {
  if (!fs.existsSync(current)) return [];
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (current === root && entry.name === 'manifest.json') continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...listResourceFiles(root, absolute));
    else if (entry.isFile()) files.push(normalizeRelative(path.relative(root, absolute)));
  }
  return files;
}

class OverlayUpdater {
  constructor({ baseDir, overlayRoot, product = DEFAULT_PRODUCT, baseVersion = null, runtimeVersion = '1', publicKey = null, publicKeyFile = null, publicKeyId = null } = {}) {
    if (!baseDir || !overlayRoot) throw new Error('OverlayUpdater 需要 baseDir 和 overlayRoot');
    this.baseDir = path.resolve(baseDir);
    this.overlayRoot = path.resolve(overlayRoot);
    this.versionsDir = path.join(this.overlayRoot, 'versions');
    this.activeFile = path.join(this.overlayRoot, 'active.json');
    this.stagedFile = path.join(this.overlayRoot, 'staged.json');
    this.product = product;
    this.baseVersion = baseVersion == null ? null : normalizeVersion(baseVersion);
    this.runtimeVersion = runtimeVersion;
    this.publicKey = publicKey || (publicKeyFile ? fs.readFileSync(path.resolve(publicKeyFile), 'utf8') : null);
    this.publicKeyId = publicKeyId || null;
  }

  readActive() {
    // A deliberate rollback to the bundled app must not resurrect .bak.
    try { if (readJson(this.activeFile).embedded === true) return null; } catch (_) { /* no pointer */ }
    const prefix = `${path.resolve(this.versionsDir)}${path.sep}`;
    const parsePointer = (file) => {
      if (!fs.existsSync(file)) return null;
      let pointer;
      try { pointer = readJson(file); } catch (_) { return null; }
      if (!pointer || typeof pointer.version !== 'string' || typeof pointer.directory !== 'string') return null;
      let directory;
      try {
        normalizeVersion(pointer.version);
        directory = path.resolve(this.versionsDir, pointer.directory);
      } catch (_) { return null; }
      if (!directory.startsWith(prefix) || !fs.existsSync(directory)) return null;
      let removed;
      try {
        removed = new Set(Array.isArray(pointer.remove) ? pointer.remove.map(normalizeRelative) : []);
      } catch (_) { return null; }
      const age = compareReleaseVersions(pointer.version, this.baseVersion);
      if (age !== null && age <= 0) return { embedded: true };
      return { ...pointer, directory, removed };
    };
    // 崩溃可能发生在删除旧指针和 rename 新指针之间；此时使用备份指针继续启动。
    const selected = parsePointer(this.activeFile) || parsePointer(`${this.activeFile}.bak`);
    return selected?.embedded ? null : selected;
  }

  activeDirectory() {
    const active = this.readActive();
    return active ? active.directory : null;
  }

  resolve(relative, { activeDirectory = undefined, removed = undefined } = {}) {
    const safe = normalizeRelative(relative);
    const pointer = activeDirectory === undefined ? this.readActive() : null;
    const active = activeDirectory === undefined ? (pointer ? pointer.directory : null) : activeDirectory;
    if (active) {
      const hidden = removed || (pointer && pointer.removed);
      if (hidden && hidden.has(safe)) return null;
      const candidate = pathInside(active, safe);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    const base = pathInside(this.baseDir, safe);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    return null;
  }

  _verifyFile(file, expected) {
    const stat = fs.statSync(file);
    if (stat.size !== expected.size) throw new Error(`资源大小校验失败: ${expected.path}`);
    const hash = sha256File(file);
    if (hash !== expected.sha256) throw new Error(`资源哈希校验失败: ${expected.path}`);
  }

  _verifyManifest(manifest, { required = Boolean(this.publicKey) } = {}) {
    return verifyManifestSignature(manifest, this.publicKey, { required, keyId: this.publicKeyId });
  }

  currentVersion() {
    const active = this.readActive();
    return active ? active.version : this.baseVersion;
  }

  _verifyBaseline(manifest) {
    const age = compareReleaseVersions(manifest.version, this.baseVersion);
    if (age !== null && age <= 0) throw new Error('更新资源不比当前安装包新，请保留当前版本');
    if (manifest.baseVersion && manifest.baseVersion !== this.currentVersion()) throw new Error('更新基线不匹配，请检查完整更新清单或下载安装完整新版');
    if (manifest.minRuntime && String(this.runtimeVersion) < String(manifest.minRuntime)) throw new Error('当前桌面运行时版本过低');
    if (manifest.version === this.currentVersion()) throw new Error('当前版本已安装');
  }

  stageManifest(inputManifest, { sourceDir = null, fetchFile = null } = {}) {
    const manifest = validateManifest(inputManifest, { product: this.product });
    this._verifyManifest(manifest);
    this._verifyBaseline(manifest);
    fs.mkdirSync(this.versionsDir, { recursive: true });
    const temp = path.join(this.versionsDir, `.staging-${manifest.version}-${process.pid}-${Date.now()}`);
    fs.mkdirSync(temp, { recursive: true });
    try {
      // 增量清单只列出本次变化文件；先继承上一激活版本的覆盖内容，
      // 再应用本次文件和删除项，形成可独立回退的完整覆盖目录。
      const previous = this.readActive();
      if (manifest.baseVersion && previous) copyTree(previous.directory, temp, { skipManifest: true });
      const inheritedRemove = manifest.baseVersion && previous ? Array.from(previous.removed) : [];
      const effectiveRemove = new Set([...inheritedRemove, ...manifest.remove]);
      if (!manifest.baseVersion) {
        const completePaths = new Set(manifest.files.map((entry) => entry.path));
        for (const relative of listResourceFiles(this.baseDir)) {
          if (!completePaths.has(relative)) effectiveRemove.add(relative);
        }
      }
      for (const entry of manifest.files) effectiveRemove.delete(entry.path);
      for (const relative of effectiveRemove) {
        const removed = pathInside(temp, relative);
        if (fs.existsSync(removed)) fs.rmSync(removed, { force: true });
      }
      for (const entry of manifest.files) {
        const target = pathInside(temp, entry.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (sourceDir) {
          const source = pathInside(sourceDir, entry.path);
          if (!fs.existsSync(source)) throw new Error(`本地更新源缺少资源: ${entry.path}`);
          fs.copyFileSync(source, target);
        } else if (fetchFile) {
          const data = fetchFile(entry);
          if (!Buffer.isBuffer(data)) throw new Error(`下载器必须返回 Buffer: ${entry.path}`);
          fs.writeFileSync(target, data);
        } else if (entry.url) {
          throw new Error('stageManifest 未提供 fetchFile；请使用 stageFromUrl');
        } else {
          throw new Error(`资源没有 url 或本地来源: ${entry.path}`);
        }
        this._verifyFile(target, entry);
      }
      // appliedRemove 是本地激活状态，不参与签名 payload；保留原始 remove 才能
      // 在后续审计时重新验证远端签名，同时让回滚恢复完整的隐藏列表。
      const storedManifest = { ...manifest, appliedRemove: Array.from(effectiveRemove).sort() };
      writeJsonAtomic(path.join(temp, 'manifest.json'), storedManifest);
      const versionDir = path.join(this.versionsDir, manifest.version);
      if (fs.existsSync(versionDir)) fs.rmSync(versionDir, { recursive: true, force: true });
      fs.renameSync(temp, versionDir);
      writeJsonAtomic(this.stagedFile, {
        schema: SCHEMA, product: this.product, version: manifest.version,
        baseVersion: manifest.baseVersion,
        releaseNotes: typeof inputManifest.releaseNotes === 'string' ? inputManifest.releaseNotes : null,
        stagedAt: new Date().toISOString(),
      });
      return { version: manifest.version, directory: versionDir, manifest: storedManifest };
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }
  }

  async stageFromUrl(inputManifest, { download = requestBuffer } = {}) {
    const manifest = validateManifest(inputManifest, { product: this.product });
    // 在下载任何资源前验证签名，避免未认证的 URL 消耗带宽或写入 staging。
    this._verifyManifest(manifest, { required: true });
    this._verifyBaseline(manifest);
    const files = new Map();
    for (const entry of manifest.files) {
      if (!entry.url) throw new Error(`远程更新资源缺少 url: ${entry.path}`);
      const data = await download(entry.url, { maxBytes: Math.min(entry.size, 64 * 1024 * 1024) });
      if (!Buffer.isBuffer(data) || data.length !== entry.size || sha256Buffer(data) !== entry.sha256) throw new Error(`资源大小或哈希校验失败: ${entry.path}`);
      files.set(entry.path, data);
    }
    return this.stageManifest(manifest, { fetchFile: (entry) => files.get(entry.path) });
  }

  _verifiedVersion(version) {
    const safeVersion = normalizeVersion(version);
    const directory = pathInside(this.versionsDir, safeVersion);
    const manifestFile = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestFile)) throw new Error(`待激活版本不存在: ${version}`);
    const manifest = validateManifest(readJson(manifestFile), { product: this.product });
    if (manifest.version !== version) throw new Error('版本指针与清单不一致');
    this._verifyManifest(manifest);
    // A staged package can remain on disk for days. Verify it again before it
    // becomes executable rather than trusting an old download result.
    for (const entry of manifest.files) this._verifyFile(pathInside(directory, entry.path), entry);
    return { manifest, directory };
  }

  readStaged() {
    try {
      const staged = readJson(this.stagedFile);
      if (staged.schema !== SCHEMA || staged.product !== this.product) return null;
      const { manifest, directory } = this._verifiedVersion(staged.version);
      this._verifyBaseline(manifest);
      const age = compareReleaseVersions(manifest.version, this.currentVersion());
      if (age !== null && age <= 0) return null;
      return { version: manifest.version, baseVersion: manifest.baseVersion, directory,
        releaseNotes: typeof staged.releaseNotes === 'string' ? staged.releaseNotes : null };
    } catch (_) { return null; }
  }

  _clearStaged() {
    for (const file of [this.stagedFile, `${this.stagedFile}.bak`]) {
      try { fs.rmSync(file, { force: true }); } catch (_) { /* stale markers are rejected against active version */ }
    }
  }

  activate(version, { rollback = false } = {}) {
    const { manifest } = this._verifiedVersion(version);
    if (!rollback) this._verifyBaseline(manifest);
    const current = this.readActive();
    writeJsonAtomic(this.activeFile, {
      schema: SCHEMA,
      product: this.product,
      version,
      directory: version,
      remove: manifest.appliedRemove || manifest.remove,
      previousVersion: rollback ? null : (current ? current.version : null),
      activatedAt: new Date().toISOString(),
    });
    this._clearStaged();
    return this.readActive();
  }

  rollback() {
    const active = this.readActive();
    if (!active) return null;
    const age = compareReleaseVersions(active.previousVersion, this.baseVersion);
    if (!active.previousVersion || (age !== null && age <= 0)) {
      writeJsonAtomic(this.activeFile, { schema: SCHEMA, product: this.product, embedded: true, version: this.baseVersion });
      this._clearStaged();
      return null;
    }
    return this.activate(active.previousVersion, { rollback: true });
  }

  async checkAndStage(manifestUrl, { activate = true, request = requestBuffer, download = request } = {}) {
    if (!manifestUrl) return null; // 默认离线，不联网
    const manifest = await fetchCompatibleManifest(manifestUrl, {
      product: this.product, currentVersion: this.currentVersion(), runtimeVersion: this.runtimeVersion,
      publicKey: this.publicKey, keyId: this.publicKeyId, request,
    });
    if (manifest.version === this.currentVersion()) return null;
    const staged = await this.stageFromUrl(manifest, { download });
    if (activate) this.activate(staged.version);
    return staged;
  }
}

function manifestFromDirectory(rootDir, { product = DEFAULT_PRODUCT, version = '0.0.0', baseVersion = null, files = null } = {}) {
  const root = path.resolve(rootDir);
  const paths = files || [];
  const entries = paths.length ? paths : fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(root, entry.name);
    return entry.isDirectory() ? [] : [entry.name];
  });
  // 发布脚本通常传入递归文件列表；此函数保持简单、可预测，避免把无关文件打进更新。
  const normalized = entries.map(normalizeRelative);
  return validateManifest({ schema: SCHEMA, product, version, baseVersion, files: normalized.map((relative) => {
    const file = pathInside(root, relative);
    const stat = fs.statSync(file);
    return { path: relative, size: stat.size, sha256: sha256File(file) };
  }) }, { product });
}

module.exports = {
  SCHEMA,
  DEFAULT_PRODUCT,
  OverlayUpdater,
  manifestFromDirectory,
  normalizeRelative,
  normalizeVersion,
  compareReleaseVersions,
  pathInside,
  readJson,
  requestBuffer,
  fetchCompatibleManifest,
  canonicalize,
  canonicalManifestPayload,
  normalizeSignature,
  signManifest,
  verifyManifestSignature,
  sha256Buffer,
  sha256File,
  validateManifest,
  writeJsonAtomic,
};
