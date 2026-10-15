// Windows 资源层更新提示。真实的下载、签名校验和重启只通过安全 preload API 执行。
// freeResourceUpdates 明确开启时对游客开放；默认保留账号更新权益策略。
// 已签名资源可先设置 __NIKKI_PUBLIC_FREE_UPDATES__ 为 true/false，覆盖随包策略。

const desktop = globalThis.NikkiDesktop;
if (desktop?.updates) {
  const styles = `
    .nuannuan-update-banner { position: fixed; z-index: 10000; top: 16px; left: 50%; transform: translateX(-50%);
      max-width: min(680px, calc(100vw - 32px)); padding: 12px 16px; border: 1px solid rgba(122,63,107,.24);
      border-radius: 14px; background: rgba(255,247,250,.96); box-shadow: 0 10px 30px rgba(122,63,107,.22);
      color: #512d4b; font: 14px/1.45 system-ui, sans-serif; display: none; align-items: center; gap: 12px; }
    .nuannuan-update-banner.is-visible { display: flex; }
    .nuannuan-update-banner__text { flex: 1; min-width: 0; }
    .nuannuan-update-banner__title { display: block; font-weight: 700; }
    .nuannuan-update-banner__detail { display: block; margin-top: 2px; color: #76536d; }
    .nuannuan-update-banner__actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .nuannuan-update-banner button { border: 0; border-radius: 999px; padding: 7px 12px; cursor: pointer; color: #fff;
      background: #bc6c95; font: inherit; white-space: nowrap; }
    .nuannuan-update-banner button.secondary { color: #6c4562; background: #f3dce8; }
    @media (max-width: 560px) { .nuannuan-update-banner { align-items: flex-start; flex-direction: column; }
      .nuannuan-update-banner__actions { width: 100%; justify-content: flex-start; } }
  `;

  function featureSet(value) {
    const result = new Set();
    const visit = (entry) => {
      if (!entry) return;
      if (Array.isArray(entry)) { entry.forEach(visit); return; }
      if (typeof entry === 'string') { result.add(entry); return; }
      if (typeof entry !== 'object') return;
      if (Array.isArray(entry.features)) visit(entry.features);
      if (Array.isArray(entry.entitlements)) visit(entry.entitlements);
      for (const key of ['auto_update', 'desktop_auto_update']) if (entry[key] === true) result.add(key);
    };
    visit(value); return result;
  }
  function readEntitlements(value) {
    return featureSet(value?.entitlements || value?.profile?.entitlements || value?.profile?.features || globalThis.__NIKKI_ACCOUNT_ENTITLEMENTS__);
  }
  let features = readEntitlements(null);
  let currentState = null;
  let banner = null;
  let title = null;
  let detail = null;
  let actions = null;
  let manualCheck = false;
  function mayUpdate() {
    const override = globalThis.__NIKKI_PUBLIC_FREE_UPDATES__;
    const publicFree = typeof override === 'boolean' ? override : currentState?.freeUpdates === true;
    return publicFree || features.has('auto_update') || features.has('desktop_auto_update');
  }

  function ensureBanner() {
    if (banner) return;
    const style = document.createElement('style'); style.textContent = styles; document.head.appendChild(style);
    banner = document.createElement('div');
    banner.className = 'nuannuan-update-banner';
    banner.setAttribute('role', 'status');
    title = document.createElement('span'); title.className = 'nuannuan-update-banner__title';
    detail = document.createElement('span'); detail.className = 'nuannuan-update-banner__detail';
    const text = document.createElement('span'); text.className = 'nuannuan-update-banner__text'; text.append(title, detail);
    actions = document.createElement('span'); actions.className = 'nuannuan-update-banner__actions';
    banner.append(text, actions); document.body.appendChild(banner);
  }

  function button(label, handler, secondary = false) {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label;
    if (secondary) el.className = 'secondary';
    el.addEventListener('click', () => Promise.resolve(handler()).catch((error) => {
      console.warn('[desktop-update]', error); render({ ...currentState, phase: 'error', error: error.message });
    }));
    actions.appendChild(el);
  }

  function render(state) {
    currentState = state || currentState;
    if (!currentState) return;
    ensureBanner();
    actions.replaceChildren();
    const phase = currentState.phase;
    if (!mayUpdate()) { banner.classList.remove('is-visible'); return; }
    if (phase === 'available') {
      title.textContent = `发现 Windows 更新 ${currentState.availableVersion || ''}`.trim();
      detail.textContent = currentState.releaseNotes || '下载后校验签名和资源，在重启时应用。';
      button('下载更新', () => desktop.updates.download());
      banner.classList.add('is-visible');
    } else if (phase === 'downloading') {
      title.textContent = '正在下载更新'; detail.textContent = '正在下载并校验资源，请保持网络连接。';
      banner.classList.add('is-visible');
    } else if (phase === 'staged') {
      title.textContent = `更新 ${currentState.stagedVersion || ''} 已准备好`.trim();
      detail.textContent = '点击“一键更新”后游戏会安全重启并应用新资源。';
      button('一键更新', () => desktop.updates.apply());
      button('稍后再说', () => { banner.classList.remove('is-visible'); }, true);
      banner.classList.add('is-visible');
    } else if (phase === 'applying') {
      title.textContent = '正在重启并应用更新'; detail.textContent = '请稍候，游戏会自动重新打开。';
      banner.classList.add('is-visible');
    } else if (phase === 'error') {
      if (!manualCheck) { banner.classList.remove('is-visible'); return; }
      title.textContent = 'Windows 更新暂未完成';
      detail.textContent = currentState.error || '请检查网络后重试，也可以到官网下载完整安装包。';
      button('重试', () => desktop.updates.check());
      button('稍后再说', () => { manualCheck = false; banner.classList.remove('is-visible'); }, true);
      banner.classList.add('is-visible');
    } else if (manualCheck && phase === 'checking') {
      title.textContent = '正在检查 Windows 更新'; detail.textContent = '正在连接更新服务并校验版本信息。';
      banner.classList.add('is-visible');
    } else if (manualCheck && phase === 'idle') {
      title.textContent = '当前已是最新资源版本'; detail.textContent = `当前版本 ${currentState.currentVersion || ''}`;
      button('知道了', () => { manualCheck = false; banner.classList.remove('is-visible'); }, true);
      banner.classList.add('is-visible');
    } else {
      banner.classList.remove('is-visible');
    }
  }

  const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  let lastAutomaticCheck = 0;
  function checkAutomatically(force = false) {
    if (!mayUpdate() || !currentState?.canCheck || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    if (!['idle', 'error'].includes(currentState.phase)) return;
    if (!force && Date.now() - lastAutomaticCheck < CHECK_INTERVAL_MS) return;
    lastAutomaticCheck = Date.now();
    desktop.updates.check().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => checkAutomatically());
  globalThis.addEventListener('online', () => checkAutomatically(true));
  globalThis.addEventListener('nuannuan:account', (event) => {
    features = readEntitlements(event.detail || {});
    render(currentState);
    checkAutomatically(true);
  });

  desktop.updates.onStatus(render);
  globalThis.addEventListener('nuannuan:check-update', () => {
    manualCheck = true;
    desktop.updates.status().then((state) => {
      // Older desktop hosts do not preserve these phases in their check IPC.
      // Reuse their current status so a manual check cannot hide Apply.
      if (['downloading', 'staged', 'applying'].includes(state?.phase)) { render(state); return; }
      return desktop.updates.check().then(() => desktop.updates.status()).then(render);
    }).catch(error => {
      render({ ...currentState, phase: 'error', error: error.message });
    });
  });
  desktop.updates.status().then((state) => {
    render(state);
    checkAutomatically();
  }).catch(() => {});
}
