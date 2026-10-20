// 转场、气泡、提示与通用弹窗；保留原来的事件、计时器和关闭顺序。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h } from '../core/util.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { coinIco } from '../core/icons.js';
import { svg } from './components/svg.js';
import { click } from './components/actions.js';
import { S } from '../core/state.js';

export async function iris(fn) {
  const el = this.irisEl;
  audio.sfx('whoosh');
  el.classList.add('closed');
  await new Promise((r) => setTimeout(r, 620));
  await fn();
  await new Promise((r) => setTimeout(r, 220));
  el.classList.remove('closed');
  await new Promise((r) => setTimeout(r, 400));
}

export function bubble(b) {
  if (b.recallSource && b.recallSource !== S) return;
  if (b.teaId && S.homestead?.tea?.id !== b.teaId) return;
  // Nearby greetings should wait for a deliberately requested memory to finish.
  // A new player-initiated conversation can still replace it immediately.
  const town = this.game.town;
  if (b.ambient && this.bubbles.some(old => old.obj === b.obj && old.recallSource === S && old.t <= old.life && app.view === town && town.zone === (old.zone || 'town'))) return;
  // A tea conversation has one visible speaker, so neighboring guests do not
  // cover one another's words. Ordinary town conversations keep their behavior.
  for (const old of [...this.bubbles]) if (old.obj === b.obj || b.teaId && old.teaId === b.teaId) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
  const el = h('div', { class: 'talkb', style: { '--c': b.tone || '#ff8fb1' } }, h('b', {}, b.name), h('span', {}, b.text));
  if (b.teaId) el.dataset.teaBubble = b.teaId;
  if (b.recallSource) el.dataset.residentRecall = 'true';
  this.bubbleLayer.append(el);
  this.bubbles.push({ ...b, teaSource: b.teaId ? S : null, el, t: 0 });
}

export function updateBubbles(dt) {
  if (!this.bubbles.length) return;
  const t = this.game.town;
  this._bv = this._bv || t.pos.clone();
  for (const b of [...this.bubbles]) {
    if (b.recallSource && b.recallSource !== S) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); continue; }
    const sceneMatches = t.zone === (b.zone || 'town');
    const currentTea = b.teaId && b.teaSource === S && S.homestead?.tea?.id === b.teaId && sceneMatches;
    if (currentTea && (app.view !== t || t.camMode !== 'play' || t.modal || t.photoOn || document.hidden || !document.hasFocus() || innerWidth < innerHeight)) { b.el.hidden = true; continue; }
    const currentRecall = b.recallSource === S && b.t <= b.life && app.view === t && sceneMatches;
    if (currentRecall && (t.modal || t.photoOn || document.hidden || !document.hasFocus() || innerWidth < innerHeight)) { b.el.hidden = true; continue; }
    b.el.hidden = false;
    const on = app.view === t && t.camMode === 'play' && sceneMatches && (!b.teaId || currentTea);
    // Project before advancing a memory's clock: behind-camera text is unread.
    let p;
    if (currentRecall && on) {
      p = app.project(this._bv.copy(b.obj.position).setY(2.75), t.camera);
      if (p.behind) { b.el.hidden = true; continue; }
    }
    b.t += dt;
    if (b.t > b.life || !on) { b.el.classList.add('out'); if (b.t > b.life + 0.3 || !on) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); } continue; }
    p = p || app.project(this._bv.copy(b.obj.position).setY(2.75), t.camera);
    let x = Math.min(app.width - 20, Math.max(20, p.x)), y = Math.max(70, p.y);
    if (b.teaId) {
      const questShown = this.quest && !this.quest.classList.contains('hide') && !this.hud?.classList.contains('off');
      const layoutKey = `${app.width}:${app.height}:${!!questShown}`;
      if (!b.bounds || b.bounds.viewport !== layoutKey) b.bounds = { viewport: layoutKey, width: b.el.offsetWidth, height: b.el.offsetHeight, quest: questShown ? this.quest.getBoundingClientRect() : null };
      x = Math.max(b.bounds.width / 2 + 12, Math.min(app.width - b.bounds.width / 2 - 12, p.x));
      y = Math.max(b.bounds.height + 12, Math.min(app.height - 12, p.y));
      const q = b.bounds.quest, half = b.bounds.width / 2;
      if (q?.width && q?.height && x + half > q.left && x - half < q.right && y > q.top && y - b.bounds.height < q.bottom) {
        if (q.right + 12 + b.bounds.width <= app.width - 12) x = q.right + 12 + half;
        else if (q.bottom + 12 + b.bounds.height <= app.height - 12) y = q.bottom + 12 + b.bounds.height;
      }
    } else if (b.recallSource) {
      const viewport = `${app.width}:${app.height}`;
      if (!b.bounds || b.bounds.viewport !== viewport) b.bounds = { viewport, width: b.el.offsetWidth, height: b.el.offsetHeight };
      x = Math.max(b.bounds.width / 2 + 12, Math.min(app.width - b.bounds.width / 2 - 12, p.x));
      y = Math.max(b.bounds.height + 12, Math.min(app.height - 12, p.y));
    }
    b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    b.el.style.visibility = p.behind ? 'hidden' : 'visible';
  }
}

export function float({ x, y, z, sx, sy, text, cls = '', icon }) {
  let px = sx, py = sy;
  if (px === undefined) {
    const p = app.project({ x, y, z });
    px = p.x; py = p.y;
  }
  const el = h('div', { class: 'float ' + cls, style: { left: px + 'px', top: py + 'px' } }, icon && h('img', { src: icon }), text);
  this.floats.append(el);
  setTimeout(() => el.remove(), 1350);
}

export function toast(text, o = {}) {
  const remove = (el) => {
    clearTimeout(el._toastLifeTimer); clearTimeout(el._toastRemoveTimer);
    el.remove();
  };
  const expire = (el) => {
    clearTimeout(el._toastLifeTimer); clearTimeout(el._toastRemoveTimer);
    el.classList.remove('out');
    el._toastLifeTimer = setTimeout(() => {
      el.classList.add('out');
      el._toastRemoveTimer = setTimeout(() => remove(el), 400);
    }, o.life || 2400);
  };
  // Only opt-in notices are coalesced; rewards and unrelated warnings keep their own entries.
  if (o.dedupeKey) {
    const existing = [...this.toasts.children].find((el) => el._toastDedupeKey === o.dedupeKey && el._toastText === text);
    if (existing) { expire(existing); return existing; }
  }
  const el = h('div', { class: 'toast ' + (o.kind || ''), role: 'status' }, o.icon && h('img', { src: o.icon }), text);
  el._toastDedupeKey = o.dedupeKey; el._toastText = text;
  if (o.action && typeof o.onAction === 'function') {
    el.classList.add('toast-actionable');
    el.append(h('button', { class: 'toast-action', type: 'button', onclick: click(() => { remove(el); o.onAction(); }) }, o.action));
  }
  this.toasts.append(el);
  while (this.toasts.children.length > 3) remove(this.toasts.firstChild);
  expire(el);
  return el;
}

export function flyCoins(x, y, n = 6) {
  const r = this.coinPill.getBoundingClientRect();
  const tx = r.left + r.height / 2, ty = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const el = h('img', { class: 'flycoin', src: coinIco() });
    document.body.append(el);
    const ox = x + (Math.random() - 0.5) * 90, oy = y + (Math.random() - 0.5) * 60;
    el.animate([
      { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 0 },
      { transform: `translate(${ox}px, ${oy - 40}px) scale(1.1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 1 },
    ], { duration: 650 + i * 70, delay: i * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => { el.remove(); if (i % 2 === 0) audio.sfx('coin'); };
  }
}

export function confirm(title, text, okLabel = '确定') {
  return new Promise((resolve) => {
    let ok = false, m;
    m = this.modal(h('div', { class: 'tut' },
      h('h2', {}, title),
      h('p', { style: { margin: '0 0 1.4rem', lineHeight: 1.8 } }, text),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn alt', onclick: click(() => m.close(true)) }, '再想想'),
        h('button', { class: 'btn', onclick: click(() => { ok = true; m.close(true); }) }, okLabel))), { ribbon: '请确认', onClose: () => resolve(ok) });
  });
}

export function modal(content, o = {}) {
  if (!o.tutorial) this.tutorials?.beforeModal();
  const veil = h('div', { class: 'veil' + (o.clear ? ' clear' : '') });
  let panel;
  const close = (silent) => {
    if (veil._closed) return;
    if (o.beforeClose?.() === false) return;
    veil._closed = true;
    veil.classList.add('out');
    this.modals--;
    this.tutorials?.panelClosed(panel);
    if (!silent) audio.sfx('tab');
    setTimeout(() => veil.remove(), 250);
    window.removeEventListener('keydown', esc);
    this.game.onModal(this.modals > 0);
    o.onClose && o.onClose();
  };
  const esc = (e) => { if (e.code === 'Escape' && !o.sticky && ![...this.root.querySelectorAll(':scope > .veil')].filter(v=>!v._closed).some(v=>v!==veil && (veil.compareDocumentPosition(v)&Node.DOCUMENT_POSITION_FOLLOWING))) { e.stopImmediatePropagation(); close(); } };
  content.classList.add('modal-body');
  const box = h('div', { class: 'modal card ' + (o.cls || '') },
    o.ribbon && h('div', { class: 'ribbon' }, o.ribbon),
    !o.sticky && h('button', { class: 'x', onclick: () => close(), 'aria-label': '关闭' }, svg('close')),
    content);
  veil.append(box);
  if (!o.sticky) veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
  window.addEventListener('keydown', esc);
  this.root.append(veil);
  this.modals++;
  this.game.onModal(true);
  audio.sfx('pop');
  panel = { close, box, veil, content };
  if (!o.tutorial && !o.skipTutorial) this.tutorials?.attachPanel(panel, content);
  return panel;
}
