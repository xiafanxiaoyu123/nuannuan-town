// 屏幕方向：auto 跟随手机 / land 固定横屏 / port 固定竖屏。
// Android 等待 UI 线程和布局确认；网页只在浏览器允许时锁定。
let requestSerial = 0;

function nativeRequest(native, mode) {
  return new Promise(resolve => {
    const id = `orientation-${++requestSerial}`;
    const done = ok => {
      clearTimeout(timer);
      window.removeEventListener('nuannuan:orientation', onResult);
      resolve(ok);
    };
    const onResult = event => {
      if (event.detail?.id === id) done(event.detail.ok === true && event.detail.mode === mode);
    };
    const timer = setTimeout(() => done(false), 3500);
    window.addEventListener('nuannuan:orientation', onResult);
    try { native.setOrientationRequest(mode, id); }
    catch (error) { done(false); }
  });
}

export function applyOrient(mode) {
  mode = mode === 'portrait' ? 'port' : mode === 'landscape' ? 'land' : mode === 'follow' ? 'auto' : mode;
  mode = mode || 'auto';
  if (!['auto', 'land', 'port'].includes(mode)) return Promise.resolve(false);
  const native = window.NikkiNative;
  if (native && typeof native.setOrientationRequest === 'function') return nativeRequest(native, mode);
  if (native && native.setOrientation) {
    try { return Promise.resolve(native.setOrientation(mode)).then(value => value !== false, () => false); }
    catch (e) { return Promise.resolve(false); }
  }
  const so = window.screen && window.screen.orientation;
  if (mode === 'auto') {
    try { so && so.unlock && so.unlock(); } catch (e) { /* 没锁过 */ }
    return Promise.resolve(true);
  }
  if (!so || !so.lock) return Promise.resolve(false);
  const want = mode === 'land' ? 'landscape-primary' : 'portrait-primary';
  const el = document.documentElement;
  const full = document.fullscreenElement ? Promise.resolve() : el.requestFullscreen ? el.requestFullscreen() : Promise.reject(new Error('no fullscreen'));
  return full.then(() => so.lock(want)).then(() => true).catch(() => false);
}
export const isNativeApp = () => !!(window.NikkiNative && (window.NikkiNative.setOrientationRequest || window.NikkiNative.setOrientation));

// 屏幕尺寸、触控指针以及 screen.orientation 在电脑上同样存在。
// 设备专属选项用实际平台判断，不把窄窗口 / 触屏电脑当作手机。
export const isMobileDevice = () => !window.NikkiDesktop && (isNativeApp()
  || /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '')
  || (/Macintosh/i.test(globalThis.navigator?.userAgent || '') && globalThis.navigator?.maxTouchPoints > 1));
