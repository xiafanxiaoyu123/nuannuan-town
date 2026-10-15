// Android resource update prompt. The native bridge performs HTTPS, signature,
// hash and atomic staging. Public free updates require an explicit release
// setting; otherwise existing account entitlements still control the prompt.
const native = globalThis.NikkiNative;
if (native?.checkAndroidUpdate && native?.getAndroidUpdateState) {
  const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  const style = document.createElement('style');
  style.textContent = `
    .nuannuan-android-update { position: fixed; z-index: 10000; left: 50%; top: max(1rem, env(safe-area-inset-top, 0px));
      transform: translateX(-50%); width: min(30rem, calc(100vw - 1.1rem)); display: none; gap: .65rem; align-items: center;
      padding: .75rem .85rem; border: .08rem solid rgba(122,63,107,.2); border-radius: 1rem; background: rgba(255,247,250,.97);
      box-shadow: 0 .55rem 1.5rem rgba(122,63,107,.2); color: #512d4b; font: .82rem/1.45 system-ui, sans-serif; }
    .nuannuan-android-update.is-visible { display: flex; }
    .nuannuan-android-update__text { flex: 1; min-width: 0; }
    .nuannuan-android-update__title { display: block; font-weight: 800; }
    .nuannuan-android-update__detail { display: block; margin-top: .12rem; color: #76536d; overflow-wrap: anywhere; }
    .nuannuan-android-update__actions { display: flex; gap: .35rem; flex-wrap: wrap; justify-content: flex-end; }
    .nuannuan-android-update button { min-height: 2.35rem; padding: 0 .75rem; border: 0; border-radius: 99rem; cursor: pointer;
      color: #fff; background: #bc6c95; font: inherit; white-space: nowrap; }
    .nuannuan-android-update button.secondary { color: #6c4562; background: #f3dce8; }
    @media (max-width: 24rem) { .nuannuan-android-update { align-items: flex-start; flex-direction: column; }
      .nuannuan-android-update__actions { width: 100%; justify-content: flex-start; } }
  `;
  document.head.appendChild(style);

  let features = new Set();
  let state = null;
  let lastCheck = 0;
  let banner = null;
  let title = null;
  let detail = null;
  let actions = null;
  let manualCheck = false;

  const readFeatures = (value) => {
    const result = new Set();
    const visit = (item) => {
      if (!item) return;
      if (Array.isArray(item)) return item.forEach(visit);
      if (typeof item === 'string') return result.add(item);
      if (typeof item !== 'object') return;
      visit(item.features); visit(item.entitlements);
      if (item.auto_update === true) result.add('auto_update');
    };
    visit(value);
    return result;
  };
  const entitled = () => globalThis.__NIKKI_PUBLIC_FREE_UPDATES__ === true
    || features.has('auto_update') || features.has('android_auto_update');
  features = readFeatures(globalThis.__NIKKI_ACCOUNT_ENTITLEMENTS__);

  function ensureBanner() {
    if (banner) return;
    banner = document.createElement('aside');
    banner.className = 'nuannuan-android-update';
    banner.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.className = 'nuannuan-android-update__text';
    title = document.createElement('strong'); title.className = 'nuannuan-android-update__title';
    detail = document.createElement('span'); detail.className = 'nuannuan-android-update__detail';
    text.append(title, detail);
    actions = document.createElement('span'); actions.className = 'nuannuan-android-update__actions';
    banner.append(text, actions); document.body.appendChild(banner);
  }

  function button(label, handler, secondary = false) {
    const item = document.createElement('button');
    item.type = 'button'; item.textContent = label;
    if (secondary) item.className = 'secondary';
    item.addEventListener('click', () => { try { handler(); } catch (_) { /* native bridge unavailable */ } });
    actions.appendChild(item);
  }

  function render(next) {
    state = next || state;
    if (!state) return;
    ensureBanner(); actions.replaceChildren();
    if (!entitled()) { banner.classList.remove('is-visible'); return; }
    if (state.phase === 'available') {
      title.textContent = `发现 Android 更新 ${state.availableVersion || ''}`.trim();
      detail.textContent = state.releaseNotes || '更新已通过签名校验，可下载到本机后再应用。';
      button('下载更新', () => native.downloadAndroidUpdate());
      button('稍后再说', () => banner.classList.remove('is-visible'), true);
      banner.classList.add('is-visible');
    } else if (state.phase === 'downloading') {
      title.textContent = '正在准备 Android 更新';
      detail.textContent = '更新文件正在校验并暂存，当前游戏仍可继续使用。';
      banner.classList.add('is-visible');
    } else if (state.phase === 'staged') {
      title.textContent = `更新 ${state.stagedVersion || ''} 已准备好`.trim();
      detail.textContent = '点击应用后游戏会重新加载并切换到新资源。';
      button('应用更新', () => native.applyAndroidUpdate());
      button('稍后再说', () => banner.classList.remove('is-visible'), true);
      banner.classList.add('is-visible');
    } else if (state.phase === 'error') {
      const oldInstaller = !(Number(state.updateProtocolVersion) >= 2);
      const invalid = /signature|hash|size mismatch|baseline|staged|manifest/i.test(state.error || '');
      title.textContent = oldInstaller ? '请先升级完整 Android 安装包' : 'Android 更新暂未完成';
      detail.textContent = oldInstaller
        ? '此安装包的更新组件需要升级。请到官网下载完整 APK 覆盖安装，保留现有存档，不要先卸载。'
        : invalid ? '更新文件未通过校验或不适用当前版本。请稍后重试，也可以下载官网完整 APK 覆盖安装。'
          : '暂时连接不上更新服务，请检查网络后重试。';
      button('重试', () => { manualCheck = true; lastCheck = 0; render({ ...state, phase: 'checking', error: '' }); check(true); });
      button('稍后再说', () => banner.classList.remove('is-visible'), true);
      const downloadUrl = String(globalThis.__NIKKI_DOWNLOAD_URL__ || '');
      if (/^https:\/\//i.test(downloadUrl)) {
        const download = document.createElement('a');
        download.href = downloadUrl; download.target = '_blank'; download.rel = 'noopener';
        download.textContent = '下载完整 APK'; download.style.cssText = 'color:#864468;align-self:center;padding:.5rem';
        actions.appendChild(download);
      }
      banner.classList.add('is-visible');
    } else if (state.phase === 'applying') {
      title.textContent = '正在应用 Android 更新';
      detail.textContent = '游戏即将重新加载，请稍候。';
      banner.classList.add('is-visible');
    } else if (manualCheck && state.phase === 'disabled') {
      title.textContent = '此安装包未配置更新服务';
      detail.textContent = '可继续离线游玩，或向安装包的提供者获取新版本。';
      button('知道了', () => { manualCheck = false; banner.classList.remove('is-visible'); }, true);
      banner.classList.add('is-visible');
    } else if (manualCheck && state.phase === 'checking') {
      title.textContent = '正在检查 Android 更新'; detail.textContent = '正在连接更新服务并校验版本信息。';
      banner.classList.add('is-visible');
    } else if (manualCheck && state.phase === 'idle') {
      title.textContent = '当前已是最新资源版本'; detail.textContent = `当前版本 ${state.currentVersion || ''}`;
      button('知道了', () => { manualCheck = false; banner.classList.remove('is-visible'); }, true);
      banner.classList.add('is-visible');
    } else banner.classList.remove('is-visible');
  }

  function readState() {
    try { return JSON.parse(native.getAndroidUpdateState() || '{}'); } catch (_) { return null; }
  }

  function check(force = false) {
    if (!entitled() || document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (!force && now - lastCheck < CHECK_INTERVAL) return;
    lastCheck = now;
    try { native.checkAndroidUpdate(); } catch (error) {
      render({ ...state, phase: 'error', error: String(error?.message || error || 'update bridge unavailable') });
    }
  }

  globalThis.addEventListener('nuannuan:android-update', (event) => render(event.detail || readState()));
  globalThis.addEventListener('nuannuan:check-update', () => {
    manualCheck = true; lastCheck = 0;
    render({ ...(readState() || state), phase: 'checking', error: '' }); check(true);
  });
  globalThis.addEventListener('nuannuan:account', (event) => {
    features = readFeatures(event.detail?.entitlements || globalThis.__NIKKI_ACCOUNT_ENTITLEMENTS__);
    if (!entitled()) { if (banner) banner.classList.remove('is-visible'); return; }
    render(readState()); check();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(() => check(), CHECK_INTERVAL);
  render(readState());
  check();
}
