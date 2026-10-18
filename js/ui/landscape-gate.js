// 游戏只使用横屏布局。浏览器无法锁定方向时，暂停并等待玩家旋转设备。
import { applyOrient, isMobileDevice } from '../core/orient.js';

export function installLandscapeGate(app) {
  const gate = document.getElementById('landscape-gate');
  const button = gate.querySelector('[data-landscape-enter]');
  const message = gate.querySelector('[data-landscape-message]');
  const status = gate.querySelector('[data-landscape-status]');
  const roots = ['stage', 'ui', 'iris', 'boot'].map(id => document.getElementById(id)).filter(Boolean);
  const previousInert = new Map();
  const pointers = new Map(), touches = new Map();
  let releasing = false;
  let blocked = null, focusedBefore = null, pending = false;
  const cancelInputs = () => {
    releasing = true;
    try {
      for (const [pointerId, point] of pointers) {
        const target = point.target?.isConnected ? point.target : window;
        target.dispatchEvent(new PointerEvent('pointercancel', { ...point, pointerId, bubbles: true, cancelable: true, buttons: 0 }));
        if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
      }
      const groups = new Map();
      for (const touch of touches.values()) {
        const target = touch.target?.isConnected ? touch.target : window;
        if (!groups.has(target)) groups.set(target, []);
        groups.get(target).push(touch);
      }
      for (const [target, changedTouches] of groups) {
        // 部分 Safari 没有可调用的 TouchEvent 构造器，沿用处理器需要的只读触点字段。
        const event = new Event('touchcancel', { bubbles: true, cancelable: true });
        Object.defineProperties(event, { touches: { value: [] }, targetTouches: { value: [] }, changedTouches: { value: changedTouches } });
        target.dispatchEvent(event);
      }
    } finally {
      pointers.clear(); touches.clear(); releasing = false;
    }
  };
  const needsLandscape = () => {
    const type = window.screen?.orientation?.type;
    const devicePortrait = type ? type.startsWith('portrait')
      : typeof window.orientation === 'number' && Math.abs(window.orientation) % 180 === 0;
    return window.innerWidth <= window.innerHeight || (isMobileDevice() && devicePortrait);
  };
  const sync = () => {
    const next = !!needsLandscape();
    document.documentElement.classList.toggle('landscape-required', next);
    gate.hidden = !next;
    if (next === blocked) return;
    blocked = next;
    if (next) {
      focusedBefore = document.activeElement;
      // 先暂停再清理按键/长按；沿用音游已有的长按续接保护。
      app.setOrientationBlocked(true);
      cancelInputs();
      window.dispatchEvent(new Event('blur'));
      for (const element of roots) { previousInert.set(element, element.inert); element.inert = true; }
      message.textContent = isMobileDevice()
        ? '请将设备横过来。若画面没有旋转，请检查设备的方向锁定。'
        : '请把游戏窗口调宽，或进入全屏后继续游玩。';
      button.focus({ preventScroll: true });
    } else {
      for (const [element, value] of previousInert) element.inert = value;
      previousInert.clear();
      app.resize();
      app.setOrientationBlocked(false);
      if (focusedBefore?.isConnected && !focusedBefore.closest('[inert]')) focusedBefore.focus?.({ preventScroll: true });
      else if (gate.contains(document.activeElement)) document.activeElement.blur();
      focusedBefore = null;
      status.textContent = '游戏已暂停，横屏后继续。';
    }
  };
  const enterLandscape = async () => {
    if (pending) return;
    pending = true; button.disabled = true;
    const ok = await applyOrient({ fullscreen: true });
    pending = false; button.disabled = false;
    sync();
    if (blocked) status.textContent = ok
      ? '正在等待横屏画面，请横放设备。'
      : '当前环境无法自动切换，请手动横放设备或调宽窗口。';
  };
  // 在游戏自己的全局监听器之前阻止输入穿透；inert 同时隔离键盘焦点。
  const guard = event => {
    if (releasing) return;
    if (event.type === 'pointerdown' || (event.type === 'pointermove' && pointers.has(event.pointerId))) {
      if (!blocked) pointers.set(event.pointerId, { target: pointers.get(event.pointerId)?.target || event.target, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY, isPrimary: event.isPrimary });
    } else if (event.type === 'pointerup' || event.type === 'pointercancel') pointers.delete(event.pointerId);
    if (event.type === 'touchstart' || event.type === 'touchmove') {
      if (!blocked) for (const touch of event.changedTouches) touches.set(touch.identifier, touch);
    } else if (event.type === 'touchend' || event.type === 'touchcancel') {
      for (const touch of event.changedTouches) touches.delete(touch.identifier);
    }
    if (!blocked) return;
    const inside = gate.contains(event.target);
    event.stopImmediatePropagation();
    if (inside && event.type === 'click' && button.contains(event.target)) {
      event.preventDefault(); enterLandscape(); return;
    }
    if (event.type.startsWith('key')) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat && ['Enter', ' '].includes(event.key)) enterLandscape();
      else button.focus({ preventScroll: true });
    } else if (!inside || event.type === 'wheel' || event.type === 'contextmenu') event.preventDefault();
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'keydown', 'keyup', 'wheel', 'contextmenu']) {
    window.addEventListener(type, guard, { capture: true, passive: false });
  }
  for (const type of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(type, sync);
  document.addEventListener('fullscreenchange', sync);
  window.screen?.orientation?.addEventListener?.('change', sync);
  // 不请求全屏：Android 使用宿主方向锁；支持网页锁定的环境也可直接应用。
  applyOrient().then(sync);
  sync();
}
