// 通用小工具：数学、缓动、补间、事件
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const smooth = (t) => t * t * (3 - 2 * t);
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// 可复现随机（用于世界布景，保证每次进入小镇长得一样）
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// 极简补间系统：tween({dur, ease, delay, update(k), done()})
const tweens = new Set();
export function tween(o) {
  const tw = { t: -(o.delay || 0), dur: o.dur ?? 0.4, ease: o.ease || ease.outCubic, update: o.update, done: o.done, paused: o.paused, dead: false };
  tw.promise = new Promise((res) => (tw.resolve = res));
  tw.stop = () => { tw.dead = true; tweens.delete(tw); };
  tweens.add(tw);
  return tw;
}
export function updateTweens(dt) {
  for (const tw of tweens) {
    if (tw.dead || (tw.paused && tw.paused())) continue;
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = clamp(tw.t / tw.dur);
    tw.update && tw.update(tw.ease(k), k);
    if (k >= 1) {
      tweens.delete(tw);
      tw.done && tw.done();
      tw.resolve();
    }
  }
}
export const wait = (sec) => tween({ dur: sec }).promise;

// 弹一下：常用的"出现"动画
export function popIn(obj, dur = 0.45, delay = 0, to = 1) {
  obj.scale.setScalar(0.001);
  return tween({ dur, delay, ease: ease.outBack, update: (k) => obj.scale.setScalar(Math.max(0.001, k * to)) });
}

export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.map.get(ev).delete(fn);
  }
  emit(ev, ...args) {
    const s = this.map.get(ev);
    if (s) for (const fn of [...s]) fn(...args);
  }
}

// DOM 小助手
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// 横向滚动列表：鼠标按住拖动、滚轮横向滚；手机上交给浏览器原生滑动（配合样式 .hscroll）
export function dragScroll(el) {
  el.classList.add('hscroll');
  el.addEventListener('wheel', (e) => {
    if (el.scrollWidth <= el.clientWidth) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    el.scrollLeft += d;
  }, { passive: false });
  let st = null;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0) st = { x: e.clientX, left: el.scrollLeft, moved: false }; });
  window.addEventListener('pointermove', (e) => {
    if (!st) return;
    const dx = e.clientX - st.x;
    if (!st.moved && Math.abs(dx) < 6) return;
    st.moved = true;
    el.classList.add('dragging');
    el.scrollLeft = st.left - dx;
  });
  const end = () => {
    if (!st) return;
    const moved = st.moved;
    st = null;
    // 拖动结束那一下不算点击，免得误选家具
    if (moved) { const stop = (e) => { e.stopPropagation(); e.preventDefault(); }; el.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => { el.removeEventListener('click', stop, { capture: true }); el.classList.remove('dragging'); }, 60); }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  return el;
}
