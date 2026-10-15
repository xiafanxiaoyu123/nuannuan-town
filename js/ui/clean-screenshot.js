// 当前视角的清屏截图，不解锁相机道具、不计入拍照任务。
import { app } from '../core/app.js';
import { S, bus } from '../core/state.js';
import { h } from '../core/util.js';
import { photo, savePhoto } from '../live/photo.js';

export function installCleanScreenshot(game, ui) {
  let overlay = null, bar = null, status = null, preview = null, timer = null, previous = null;
  const style = h('style', {}, `
    body.clean-screenshot > :not(#stage):not(.clean-shot-overlay):not(script):not(style):not(link),
    body.clean-screenshot > :not(#stage):not(.clean-shot-overlay):not(script):not(style):not(link) * {
      visibility: hidden !important; pointer-events: none !important;
    }
    body.clean-screenshot { touch-action: pan-y; }
    .clean-shot-overlay { position: fixed; inset: 0; z-index: 11000; touch-action: pan-y; }
    .clean-shot-bar { position: absolute; left: 50%; bottom: max(18px, env(safe-area-inset-bottom));
      transform: translateX(-50%); width: min(550px, calc(100% - 24px)); box-sizing: border-box;
      padding: 12px; border-radius: 20px; background: rgba(255,247,250,.96); color: #68465a;
      box-shadow: 0 8px 30px #60404d30; text-align: center; font: 14px/1.5 system-ui,sans-serif; }
    .clean-shot-bar[hidden], .clean-shot-preview[hidden] { display: none !important; }
    .clean-shot-bar p { margin: 0 0 9px; }
    .clean-shot-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .clean-shot-actions button, .clean-shot-preview a { min-height: 44px; border: 0; border-radius: 24px;
      padding: 9px 16px; background: #fa79aa; color: #fff; font: inherit; cursor: pointer; }
    .clean-shot-actions button.secondary { background: #f3e1e8; color: #68465a; }
    .clean-shot-preview { max-height: 55vh; overflow: auto; padding: 10px 0; touch-action: pan-y; }
    .clean-shot-preview img { display: block; max-width: 100%; max-height: 38vh; margin: 0 auto 12px; border-radius: 10px; }
    .clean-shot-preview a { display: inline-block; text-decoration: none; }
  `);
  document.head.appendChild(style);

  const setControls = (show) => { if (bar) bar.hidden = !show; clearTimeout(timer); };
  const exit = () => {
    if (!overlay) return false;
    clearTimeout(timer); overlay.remove(); overlay = bar = status = preview = null;
    document.body.classList.remove('clean-screenshot');
    ui.root.inert = previous.inert;
    if (previous.aria === null) ui.root.removeAttribute('aria-hidden'); else ui.root.setAttribute('aria-hidden', previous.aria);
    game.busy = previous.busy;
    game.town.setModal(ui.modals > 0 || previous.modal);
    game.town.keys.clear(); game.town.stick.x = game.town.stick.y = 0;
    previous.focus?.focus?.({ preventScroll: true }); previous = null;
    return true;
  };
  const capture = () => {
    if (!overlay || app.view !== game.town) return false;
    setControls(true);
    const button = bar.querySelector('[data-clean-save]'); button.disabled = true;
    try {
      // 同一任务内重绘后立即读画布，兼容 preserveDrawingBuffer=false，不包含任何 DOM 按钮。
      if (app.usePost) app.composer.render(0); else app.renderer.render(game.town.scene, game.town.camera);
      const url = app.canvas.toDataURL('image/jpeg', .96);
      if (!url.startsWith('data:image/jpeg;base64,')) throw new Error('empty screenshot');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `暖暖小镇-清屏截图-${stamp}.jpg`;
      const result = savePhoto(url, name);
      status.textContent = result || '自动保存未完成，可以长按下方图片保存。';
      preview.replaceChildren(h('img', { src: url, alt: '当前视角的清屏截图，可长按保存' }),
        h('a', { href: url, download: name, target: '_blank', rel: 'noopener' }, '打开原图 / 长按保存'));
      preview.hidden = false;
      return { width: app.canvas.width, height: app.canvas.height, name, result };
    } catch (_) {
      status.textContent = '这次截图没有完成，请重试；也可以隐藏按钮后使用手机截屏。';
      return false;
    } finally { button.disabled = false; }
  };
  const enter = () => {
    if (overlay) return true;
    if (!S.started || game.busy || app.view !== game.town || game.town.camMode !== 'play'
      || game.town.decor.active || photo.on || ui.modals > 0 || game.town.modal) {
      ui.toast('请先关闭当前操作，回到小镇或家园后再清屏截图'); return false;
    }
    previous = { busy: game.busy, modal: game.town.modal, inert: ui.root.inert,
      aria: ui.root.getAttribute('aria-hidden'), focus: document.activeElement };
    game.cancelGuidance?.(); game.busy = true; game.town.setModal(true);
    game.town.keys.clear(); game.town.stick.x = game.town.stick.y = 0;
    status = h('p', { role: 'status' }, '保存的图片不含按钮。隐藏后，轻点画面可找回按钮。');
    preview = h('div', { class: 'clean-shot-preview', hidden: true });
    bar = h('section', { class: 'clean-shot-bar', 'aria-label': '清屏截图' }, status, preview,
      h('div', { class: 'clean-shot-actions' },
        h('button', { type: 'button', 'data-clean-save': '1', onclick: capture }, '保存截图'),
        h('button', { type: 'button', class: 'secondary', onclick: () => setControls(false) }, '隐藏按钮'),
        h('button', { type: 'button', class: 'secondary', onclick: exit }, '退出清屏')));
    overlay = h('div', { class: 'clean-shot-overlay' }, bar);
    overlay.addEventListener('click', event => { if (event.target === overlay) setControls(bar.hidden); });
    document.body.appendChild(overlay); document.body.classList.add('clean-screenshot');
    ui.root.inert = true; ui.root.setAttribute('aria-hidden', 'true');
    bar.querySelector('button').focus({ preventScroll: true });
    timer = setTimeout(() => setControls(false), 5000);
    return true;
  };
  window.addEventListener('nuannuan:clean-screenshot', enter);
  window.addEventListener('keydown', event => {
    if (!overlay) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); exit(); }
    else if (event.code === 'Tab') setControls(true);
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) exit(); });
  for (const event of ['zoneChanged', 'reset', 'decorMode']) bus.on(event, exit);
  app.hooks.push(() => { if (overlay && app.view !== game.town) exit(); });
  const api = { enter, exit, capture, get active() { return !!overlay; } };
  game.cleanScreenshot = api;
  return api;
}
