// 桌面版入口：用自定义协议 app:// 提供 dist 里的静态文件（file:// 下浏览器不允许加载 ES 模块）
const { app, BrowserWindow, protocol, net, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const {
  OverlayUpdater,
  fetchCompatibleManifest,
  compareReleaseVersions,
} = require('./updater');

// 桌面版账号 API 和资源更新配置可以由启动参数、环境变量或随安装包发布的配置提供。
// 参数优先级为：启动参数 > 环境变量 > release-config.json。主进程读取配置，
// 预加载脚本只接收解析后的字符串，避免 sandbox 直接访问文件系统。
const RELEASE_CONFIG_PATH = path.join(__dirname, 'release-config.json');
const apiBaseArg = process.argv.find((item) => item.startsWith('--api-base='));

function readReleaseConfig() {
  try {
    const source = fs.readFileSync(RELEASE_CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('根值必须是 JSON 对象');
    }
    return value;
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw new Error(`读取 ${RELEASE_CONFIG_PATH} 失败：${error.message}`);
  }
}

function normalizeApiBase(rawValue, source) {
  const value = String(rawValue == null ? '' : rawValue).trim().replace(/\/+$/, '');
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error(`${source} 不是有效的 API URL`);
  }
  if (url.username || url.password) throw new Error(`${source} 不允许包含用户名或密码`);
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${source} 必须使用 HTTPS，或仅使用本机 loopback HTTP`);
  }
  // The request path and query are supplied by app://game/api/*; a base query
  // would otherwise be silently discarded and make deployment configuration
  // misleading. Keep a path prefix such as /v1 when one is intentional.
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function resolveApiBase() {
  const releaseConfig = readReleaseConfig();
  const hasEnv = Object.prototype.hasOwnProperty.call(process.env, 'NIKKI_API_BASE');
  const raw = apiBaseArg
    ? apiBaseArg.slice('--api-base='.length)
    : (hasEnv ? process.env.NIKKI_API_BASE : releaseConfig.apiBase);
  const source = apiBaseArg ? '--api-base' : (hasEnv ? 'NIKKI_API_BASE' : 'release-config.json.apiBase');
  if (!apiBaseArg && !hasEnv && releaseConfig.apiBase == null) return '';
  if (releaseConfig.apiBase != null && !apiBaseArg && !hasEnv && typeof releaseConfig.apiBase !== 'string') {
    throw new Error('release-config.json.apiBase 必须是字符串');
  }
  return normalizeApiBase(raw, source);
}

const resolvedApiBase = resolveApiBase();
if (resolvedApiBase) process.env.NIKKI_API_BASE = resolvedApiBase;
else if (apiBaseArg) delete process.env.NIKKI_API_BASE;

function configuredApiBase() {
  return resolvedApiBase;
}

function isLoopbackHost(hostname) {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]' || value === '::1';
}

// All configured APIs are proxied through app://game so Secure/SameSite cookies
// have one renderer origin. normalizeApiBase already restricted the target to
// HTTPS or loopback HTTP, and rejected credentials.
const apiProxy = configuredApiBase() ? new URL(configuredApiBase()) : null;

const DIST = path.join(__dirname, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

// 只在显式配置更新地址时检查；桌面版离线启动不会产生网络请求。
function configuredUpdateUrl() {
  const releaseConfig = readReleaseConfig();
  const envUrl = process.env.NIKKI_UPDATE_MANIFEST_URL;
  const arg = process.argv.find((item) => item.startsWith('--update-manifest='));
  return arg ? arg.slice('--update-manifest='.length) : (envUrl || releaseConfig.updateManifestUrl || '');
}

function configuredUpdatePublicKey() {
  const releaseConfig = readReleaseConfig();
  const inline = process.env.NIKKI_UPDATE_PUBLIC_KEY;
  const configuredInline = releaseConfig.updatePublicKey;
  const file = process.env.NIKKI_UPDATE_PUBLIC_KEY_FILE || releaseConfig.updatePublicKeyFile;
  if (inline || configuredInline) return inline || configuredInline;
  if (file) {
    const resolved = path.isAbsolute(file) ? file : path.join(__dirname, file);
    try { return fs.readFileSync(resolved, 'utf8'); } catch (error) {
      console.error('[resource-overlay] public key read failed:', error.message);
    }
  }
  return null;
}

function configuredUpdatePublicKeyId() {
  const releaseConfig = readReleaseConfig();
  const envId = process.env.NIKKI_UPDATE_PUBLIC_KEY_ID;
  const arg = process.argv.find((item) => item.startsWith('--update-key-id='));
  return arg ? arg.slice('--update-key-id='.length) : (envId || releaseConfig.updatePublicKeyId || null);
}

let overlayUpdater = null;
let startupOverlay = null;
let mainWindow = null;
let updateCheckPromise = null;
let updateDownloadPromise = null;
let updateState = {
  phase: 'idle',
  currentVersion: null,
  availableVersion: null,
  stagedVersion: null,
  releaseNotes: null,
  error: null,
  checkedAt: null,
};

function publicUpdateState() {
  return {
    ...updateState,
    configured: Boolean(configuredUpdateUrl()),
    canCheck: Boolean(overlayUpdater && configuredUpdateUrl()),
    canRollback: Boolean(overlayUpdater && overlayUpdater.readActive()),
    freeUpdates: readReleaseConfig().freeResourceUpdates === true,
  };
}

function publishUpdateState(patch = {}) {
  updateState = { ...updateState, ...patch };
  const state = publicUpdateState();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:state', state);
  }
  return state;
}

function assertTrustedSender(event) {
  const url = event && event.senderFrame && event.senderFrame.url;
  if (!url || !url.startsWith('app://game/')) throw new Error('拒绝非游戏页面的更新请求');
}

function currentVersion() {
  return (startupOverlay && startupOverlay.version) || app.getVersion();
}

function manifestSummary(manifest) {
  return {
    version: manifest.version,
    baseVersion: manifest.baseVersion || null,
    minRuntime: manifest.minRuntime || null,
    releaseNotes: typeof manifest.releaseNotes === 'string' ? manifest.releaseNotes : null,
    size: manifest.files.reduce((sum, file) => sum + file.size, 0),
    files: manifest.files.length,
  };
}

async function fetchUpdateManifest() {
  const manifestUrl = configuredUpdateUrl();
  if (!manifestUrl) throw new Error('未配置 Windows 更新清单地址');
  return fetchCompatibleManifest(manifestUrl, {
    product: overlayUpdater.product, currentVersion: currentVersion(), runtimeVersion: overlayUpdater.runtimeVersion,
    publicKey: overlayUpdater.publicKey, keyId: overlayUpdater.publicKeyId,
  });
}

async function checkForUpdate() {
  // A check must not replace an in-progress or already prepared update with a
  // new offer. In particular, keep the Apply action available after staging.
  if (updateState.phase === 'applying') return { available: false, state: publicUpdateState() };
  if (updateDownloadPromise) return updateDownloadPromise;
  if (updateState.phase === 'downloading') return { available: false, state: publicUpdateState() };
  if (updateState.stagedVersion) {
    const state = publishUpdateState({ phase: 'staged', error: null });
    return { available: true, staged: true, version: updateState.stagedVersion, currentVersion: currentVersion(), state };
  }
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = (async () => {
    publishUpdateState({ phase: 'checking', error: null, currentVersion: currentVersion() });
    try {
      const manifest = await fetchUpdateManifest();
      const summary = manifestSummary(manifest);
      const comparison = compareReleaseVersions(manifest.version, currentVersion());
      const available = comparison === null ? manifest.version !== currentVersion() : comparison > 0;
      const state = publishUpdateState({
        phase: available ? 'available' : 'idle',
        availableVersion: available ? summary.version : null,
        releaseNotes: available ? summary.releaseNotes : null,
        checkedAt: new Date().toISOString(),
        error: null,
      });
      return { available, currentVersion: currentVersion(), ...summary, state };
    } catch (error) {
      publishUpdateState({ phase: 'error', error: error.message, checkedAt: new Date().toISOString() });
      throw error;
    } finally {
      updateCheckPromise = null;
    }
  })();
  return updateCheckPromise;
}

async function downloadUpdate() {
  if (updateDownloadPromise) return updateDownloadPromise;
  updateDownloadPromise = (async () => {
    publishUpdateState({ phase: 'downloading', error: null, currentVersion: currentVersion() });
    try {
      const manifest = await fetchUpdateManifest();
      const comparison = compareReleaseVersions(manifest.version, currentVersion());
      if (manifest.version === currentVersion() || (comparison !== null && comparison < 0)) {
        const result = { available: false, currentVersion: currentVersion(), ...manifestSummary(manifest) };
        publishUpdateState({ phase: 'idle', availableVersion: null, checkedAt: new Date().toISOString() });
        return result;
      }
      const staged = await overlayUpdater.stageFromUrl(manifest);
      const summary = manifestSummary(manifest);
      const state = publishUpdateState({
        phase: 'staged',
        availableVersion: manifest.version,
        stagedVersion: staged.version,
        releaseNotes: summary.releaseNotes,
        checkedAt: new Date().toISOString(),
        error: null,
      });
      return { available: true, staged: true, currentVersion: currentVersion(), ...summary, state };
    } catch (error) {
      publishUpdateState({ phase: 'error', error: error.message, checkedAt: new Date().toISOString() });
      throw error;
    } finally {
      updateDownloadPromise = null;
    }
  })();
  return updateDownloadPromise;
}

function restartAndApply() {
  const stagedVersion = updateState.stagedVersion;
  if (!stagedVersion) throw new Error('没有已下载的更新');
  publishUpdateState({ phase: 'applying', error: null });
  overlayUpdater.activate(stagedVersion);
  // app.relaunch() keeps the original command line (including explicit test flags),
  // while exit(0) ensures the old process cannot keep serving the previous overlay.
  app.relaunch();
  app.exit(0);
  return { ...publicUpdateState(), restartRequested: true };
}

function restartWithoutApply() {
  publishUpdateState({ phase: 'applying', error: null });
  app.relaunch();
  app.exit(0);
  return { ...publicUpdateState(), restartRequested: true };
}

function rollbackAndRestart() {
  if (updateCheckPromise || updateDownloadPromise || updateState.phase === 'applying') throw new Error('请等待当前更新操作完成');
  if (!overlayUpdater || !overlayUpdater.readActive()) return { ...publicUpdateState(), rolledBack: false };
  overlayUpdater.rollback();
  publishUpdateState({ phase: 'applying', stagedVersion: null, availableVersion: null, error: null });
  app.relaunch();
  app.exit(0);
  return { ...publicUpdateState(), rolledBack: true, restartRequested: true };
}

function registerUpdateIpc() {
  ipcMain.handle('updates:status', (event) => { assertTrustedSender(event); return publicUpdateState(); });
  ipcMain.handle('updates:check', (event) => { assertTrustedSender(event); return checkForUpdate(); });
  ipcMain.handle('updates:download', (event) => { assertTrustedSender(event); return downloadUpdate(); });
  ipcMain.handle('updates:apply', (event) => { assertTrustedSender(event); return restartAndApply(); });
  ipcMain.handle('updates:restart', (event) => { assertTrustedSender(event); return restartWithoutApply(); });
  ipcMain.handle('updates:rollback', (event) => { assertTrustedSender(event); return rollbackAndRestart(); });
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 800, minHeight: 500,
    title: '暖暖的方块小镇', backgroundColor: '#ffdbe8', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
      // Pass only the already validated value into the sandbox preload. The
      // preload must not read release-config.json or inherit a stale env value.
      additionalArguments: [`--nikki-api-base=${encodeURIComponent(configuredApiBase())}`],
    },
  });
  mainWindow = win;
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // F11 / Alt+Enter 切换全屏
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // 拍照存图直接写进「图片/暖暖的方块小镇」；存档和运行记录等导出写进系统「下载」目录。
  // 统一显式 setSavePath，避免桌面壳下 Blob/data URL 下载只停留在 Chromium
  // 的临时下载状态，用户看不到文件或无法在没有下载面板的窗口中找到文件。
  win.webContents.session.on('will-download', (e, item) => {
    const name = item.getFilename();
    const image = /\.(jpe?g|png)$/i.test(name);
    const exportFile = /\.(txt|json)$/i.test(name) && /暖暖小镇|暖暖的方块小镇|性能记录/i.test(name);
    if (!image && !exportFile) return;
    const dir = image
      ? path.join(app.getPath('pictures'), '暖暖的方块小镇')
      : app.getPath('downloads');
    fs.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, name), n = 1;
    while (fs.existsSync(file)) file = path.join(dir, name.replace(/(\.\w+)$/, `-${n++}$1`));
    item.setSavePath(file);
  });
  win.loadURL('app://game/index.html');
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
}

async function proxyApiRequest(request, requestUrl) {
  if (!apiProxy) return new Response('Not found', { status: 404 });
  const target = new URL(apiProxy.toString());
  const basePath = target.pathname.replace(/\/+$/, '');
  target.pathname = `${basePath}${requestUrl.pathname}`;
  target.search = requestUrl.search;
  const headers = new Headers(request.headers);
  // These hop-by-hop/request-target headers are owned by the upstream client.
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('connection');
  // The upstream sees a server-side proxy request; forwarding app://game as an
  // Origin would make an otherwise valid HTTPS deployment fail its web CORS
  // allow-list (and CORS is not needed after the same-origin proxy hop).
  headers.delete('origin');
  headers.delete('referer');
  const init = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = Buffer.from(await request.arrayBuffer());
  const upstream = await net.fetch(target.toString(), init);
  const outputHeaders = new Headers(upstream.headers);
  // The body is buffered below, so stale transfer/encoding metadata must not be
  // copied into the same-origin response. Preserve the session Set-Cookie header.
  outputHeaders.delete('content-encoding');
  outputHeaders.delete('content-length');
  const rawSetCookie = upstream.headers.get('set-cookie');
  // Chromium versions without Headers.getSetCookie() coalesce repeated
  // Set-Cookie fields. Split only at a comma that starts a new cookie pair so
  // the comma inside an Expires attribute is retained.
  const setCookies = typeof upstream.headers.getSetCookie === 'function'
    ? (upstream.headers.getSetCookie() || [])
    : (rawSetCookie ? rawSetCookie.split(/,(?=\s*[^;,=\s]+=[^;,]*)/) : []);
  outputHeaders.delete('set-cookie');
  for (const cookie of setCookies) outputHeaders.append('set-cookie', cookie);
  const body = Buffer.from(await upstream.arrayBuffer());
  const noBody = request.method === 'HEAD' || [204, 205, 304].includes(upstream.status);
  return new Response(noBody ? null : body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outputHeaders,
  });
}

app.whenReady().then(() => {
  overlayUpdater = new OverlayUpdater({
    baseDir: DIST,
    overlayRoot: path.join(app.getPath('userData'), 'resource-updates'),
    product: 'nikki-block-town-windows',
    baseVersion: app.getVersion(),
    runtimeVersion: '1',
    publicKey: configuredUpdatePublicKey(),
    publicKeyId: configuredUpdatePublicKeyId(),
  });
  // 固定本次进程的覆盖版本，避免后台下载完成后当前窗口混用两个版本；
  // 新 active 指针会在下一次启动时生效。
  startupOverlay = overlayUpdater.readActive();
  updateState.currentVersion = currentVersion();
  const restoredStaged = overlayUpdater.readStaged();
  if (restoredStaged) {
    updateState.phase = 'staged';
    updateState.availableVersion = restoredStaged.version;
    updateState.stagedVersion = restoredStaged.version;
    updateState.releaseNotes = restoredStaged.releaseNotes;
  }
  registerUpdateIpc();
  protocol.handle('app', async (req) => {
    let rel;
    let requestUrl;
    try {
      requestUrl = new URL(req.url);
      rel = decodeURIComponent(requestUrl.pathname);
    } catch (_) {
      return new Response('Bad request', { status: 400 });
    }
    if (requestUrl.hostname !== 'game') return new Response('Not found', { status: 404 });
    if (requestUrl.pathname.startsWith('/api/')) {
      try {
        return await proxyApiRequest(req, requestUrl);
      } catch (error) {
        console.error('[account-api-proxy] request failed:', error.message);
        return new Response(JSON.stringify({ error: '本地账号 API 不可用', code: 'API_PROXY_FAILED' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }
    if (rel === '/' || rel === '') rel = '/index.html';
    try {
      // 覆盖层优先；找不到的资源继续从随 Electron 打包的 dist 提供。
      const file = overlayUpdater.resolve(rel.replace(/^\/+/, ''), {
        activeDirectory: startupOverlay ? startupOverlay.directory : null,
        removed: startupOverlay ? startupOverlay.removed : null,
      });
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString()).then((r) => new Response(r.body, {
        status: r.status || 200,
        headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
      }));
    } catch (error) {
      console.error('[resource-overlay] resolve failed:', error.message);
      return new Response('Not found', { status: 404 });
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
