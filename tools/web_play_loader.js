/* 暖暖小镇官网更新加载器。
 * 这个文件保持稳定：它只读取小型 manifest，再加载当前哈希资源。
 * 因此旧版 play.html 即使还引用 play.js?v=旧值，也能拿到最新网页资源。
 */
(async () => {
  const base = new URL('./', document.baseURI);
  const manifestUrl = new URL('play-manifest.json', base);
  const bootMessage = (message) => {
    const el = document.querySelector('#boot p');
    if (el) el.textContent = message;
  };
  const asset = (manifest, path) => {
    const item = (manifest.resources || []).find((value) => value && (value.sourcePath === path || value.url === path));
    if (!item || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 1) {
      throw new Error('资源缺少有效 SHA-256 或体积');
    }
    const local = item.sourcePath || item.fallbackUrl || item.url;
    if (!/^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(local)) throw new Error('本地回退资源路径无效');
    const fallback = new URL(local, manifestUrl);
    const primary = new URL(item.url, manifestUrl);
    if (primary.username || primary.password || primary.hash ||
        (primary.origin !== base.origin && primary.protocol !== 'https:')) {
      throw new Error('资源下载地址无效');
    }
    const integrity = 'sha256-' + btoa(String.fromCharCode(...item.sha256.match(/../g).map((byte) => parseInt(byte, 16))));
    return { path, primary, fallback, integrity };
  };
  const loadAsset = async (resource, tag) => {
    const urls = [...new Set([resource.primary.href, resource.fallback.href])];
    for (const url of urls) {
      try {
        await new Promise((resolve, reject) => {
          const element = document.createElement(tag);
          const timer = setTimeout(() => fail(new Error('资源加载超时')), 20000);
          const fail = (error) => {
            clearTimeout(timer);
            element.remove();
            reject(error);
          };
          // The browser checks the exact response bytes before using CSS or
          // executing JS. An opaque/no-CORS cloud response fails closed.
          element.integrity = resource.integrity;
          element.crossOrigin = 'anonymous';
          element.onload = () => { clearTimeout(timer); resolve(); };
          element.onerror = () => fail(new Error('资源网络或完整性校验失败'));
          if (tag === 'link') {
            element.rel = 'stylesheet';
            element.href = url;
            element.dataset.nikkiStyle = resource.path;
            document.head.appendChild(element);
          } else {
            element.src = url;
            element.defer = true;
            element.dataset.nikkiEntry = resource.path;
            document.body.appendChild(element);
          }
        });
        return;
      } catch (error) {
        console.warn('[nikki-town] 资源加载失败，尝试备用地址', error);
      }
    }
    throw new Error('资源的全部下载地址加载失败');
  };
  try {
    const response = await fetch(`${manifestUrl.href}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    const manifest = await response.json();
    if (!manifest || manifest.schema !== 1 || !manifest.entry || !manifest.styles) {
      throw new Error('manifest 格式无效');
    }
    window.__NIKKI_WEB_MANIFEST__ = manifest;
    const styles = asset(manifest, manifest.styles);
    const entry = asset(manifest, manifest.entry);
    await loadAsset(styles, 'link');

    // 更新在后台准备，下次打开或刷新时使用新版本，不打断正在游玩的页面。
    if ('serviceWorker' in navigator) {
      const sw = new URL('play-sw.js', base);
      sw.searchParams.set('build', manifest.buildId || manifest.version || 'current');
      navigator.serviceWorker.register(sw.href, { scope: base.pathname }).catch(() => {});
    }

    await loadAsset(entry, 'script');
  } catch (error) {
    console.error('[nikki-town] 网页资源更新失败', error);
    bootMessage('网页资源加载失败，请刷新后重试');
  }
})();
