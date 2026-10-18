// 游戏统一横屏；原生等待宿主确认，浏览器不支持锁定时交由旋转提示引导。
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

export function applyOrient({ fullscreen = false } = {}) {
  const native = window.NikkiNative;
  if (native && typeof native.setOrientationRequest === 'function') return nativeRequest(native, 'land');
  if (native && native.setOrientation) {
    try { return Promise.resolve(native.setOrientation('land')).then(value => value !== false, () => false); }
    catch { return Promise.resolve(false); }
  }
  const so = window.screen?.orientation;
  const el = document.documentElement;
  // 只有玩家点了提示按钮才请求全屏，不在打开网页时抢占窗口。
  let full;
  try { full = fullscreen && !document.fullscreenElement && el.requestFullscreen ? el.requestFullscreen() : Promise.resolve(); }
  catch { return Promise.resolve(false); }
  return Promise.resolve(full).then(() => so?.lock ? so.lock('landscape') : Promise.reject(new Error('orientation unavailable')))
    .then(() => true, () => false);
}
export const isNativeApp = () => !!(window.NikkiNative && (window.NikkiNative.setOrientationRequest || window.NikkiNative.setOrientation));

// 屏幕尺寸、触控指针以及 screen.orientation 在电脑上同样存在。
// 设备专属选项用实际平台判断，不把窄窗口 / 触屏电脑当作手机。
export const isMobileDevice = () => !window.NikkiDesktop && (isNativeApp()
  || /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '')
  || (/Macintosh/i.test(globalThis.navigator?.userAgent || '') && globalThis.navigator?.maxTouchPoints > 1));
