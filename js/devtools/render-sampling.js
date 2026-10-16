// Three r170 的实例级、同步绘制采样。只由诊断开启分支调用；不改原型、不调用额外绘制或 GPU 同步。
export const DRAW_TIMINGS = ['total', 'scenePrepare', 'batchBuild', 'draw', 'renderer', 'shadow', 'mainRenderer', 'mainShadow', 'mainScene', 'postprocessing'];
export const POST_TIMINGS = ['bloom', 'finish', 'output', 'fxaa', 'other'];
export const DRAW_COUNTS = ['rendererCalls', 'batchBuilds', 'shadowCalls', 'shadowRefreshes', 'shadowSkips', 'shadowClears', 'shadowDrawCalls'];
const finite = value => Number.isFinite(value) && value >= 0;
const activeApps = new WeakSet();

export function sampleRendering(app, view, draw, accept) {
  const optimizer = view?.renderOptimizer;
  // 同一 App 同步重入时沿用外层观察；不重复安装同一组包装或把子调用另算一帧。
  if (activeApps.has(app)) return optimizer ? optimizer.render(draw) : draw();
  activeApps.add(app);
  const undo = [];
  const restore = () => { for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch { /* 不遮住游戏异常。 */ } } undo.length = 0; };
  const sample = { completed: false, usePost: false, shadowState: 'unknown',
    timings: Object.fromEntries(DRAW_TIMINGS.map(key => [key, null])),
    post: Object.fromEntries(POST_TIMINGS.map(key => [key, null])),
    counts: Object.fromEntries(DRAW_COUNTS.map(key => [key, null])) };
  const now = () => { try { return performance.now(); } catch { return NaN; } };
  const elapsed = start => { const value = now() - start; return finite(value) ? value : null; };
  const add = (object, key, value) => { object[key] = finite(value) && finite(object[key]) ? object[key] + value : null; };
  function wrap(object, key, create) {
    let original, descriptor, wrapped;
    try {
      if (!object || typeof object[key] !== 'function') return false;
      original = object[key]; descriptor = Object.getOwnPropertyDescriptor(object, key); wrapped = create(original);
      Object.defineProperty(object, key, { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapped });
    }
    catch { return false; }
    undo.push(() => {
      // 不覆盖绘制期间由别的模块主动换上的实现。
      if (object[key] !== wrapped) return;
      if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
    });
    return true;
  }
  let rendererDepth = 0, postDepth = 0, shadowDepth = 0, buildDepth = 0, drawDepth = 0, drawMs = 0, shadowObserved = 0;
  let mainDepth = 0, mainObserved = 0, mainShadowObserved = 0, mainAmbiguous = false;
  let rendererHook = false, clearHook = false, shadowHook = false;
  try {
    const renderer = app.renderer;
    sample.usePost = !!app.usePost;
    const calls = () => { try { const value = renderer?.info?.render?.calls; return finite(value) ? value : null; } catch { return null; } };
    rendererHook = wrap(renderer, 'render', original => function (...args) {
      const outer = rendererDepth++ === 0, start = outer ? now() : 0;
      const main = !!view?.scene && args[0] === view.scene && postDepth === 0, mainOuter = main && mainDepth === 0;
      const mainStart = mainOuter ? outer ? start : now() : 0;
      if (main) { mainDepth++; if (mainOuter) mainObserved++; }
      sample.counts.rendererCalls++;
      try { return original.apply(this, args); }
      finally {
        if (main) mainDepth--;
        rendererDepth--; const end = now();
        if (outer) add(sample.timings, 'renderer', finite(end - start) ? end - start : null);
        if (mainOuter) add(sample.timings, 'mainRenderer', finite(end - mainStart) ? end - mainStart : null);
      }
    });
    if (rendererHook) { sample.timings.renderer = 0; sample.timings.mainRenderer = 0; sample.counts.rendererCalls = 0; }
    // WebGLShadowMap(r170)只有真正更新光源时才调用renderer.clear；入口被调用不等于刷新阴影。
    clearHook = wrap(renderer, 'clear', original => function (...args) {
      if (shadowDepth) sample.counts.shadowClears++;
      return original.apply(this, args);
    });
    shadowHook = wrap(renderer?.shadowMap, 'render', original => function (...args) {
      const outer = shadowDepth++ === 0, start = outer ? now() : 0, before = outer ? calls() : null, clears = sample.counts.shadowClears;
      const inMain = mainDepth > 0 && postDepth === 0;
      sample.counts.shadowCalls++;
      try { return original.apply(this, args); }
      finally {
        shadowDepth--;
        if (outer) {
          shadowObserved++;
          if (inMain) mainShadowObserved++;
          const after = calls(), delta = before !== null && after !== null && after >= before ? after - before : null;
          if (sample.counts.shadowClears > clears || delta > 0) {
            const ms = elapsed(start); sample.counts.shadowRefreshes++; add(sample.timings, 'shadow', ms);
            if (inMain) add(sample.timings, 'mainShadow', ms);
            add(sample.counts, 'shadowDrawCalls', delta);
          } else sample.counts.shadowSkips++;
        }
      }
    });
    if (shadowHook) {
      sample.timings.shadow = 0; sample.timings.mainShadow = 0;
      for (const key of ['shadowCalls', 'shadowRefreshes', 'shadowSkips', 'shadowClears', 'shadowDrawCalls']) sample.counts[key] = 0;
    }
    const buildHook = wrap(optimizer, 'buildDecor', original => function (...args) {
      const outer = buildDepth++ === 0, start = outer ? now() : 0; sample.counts.batchBuilds++;
      try { return original.apply(this, args); }
      finally { buildDepth--; if (outer) add(sample.timings, 'batchBuild', elapsed(start)); }
    });
    if (buildHook) { sample.timings.batchBuild = 0; sample.counts.batchBuilds = 0; }
    if (app.usePost && Array.isArray(app.composer?.passes)) {
      sample.timings.postprocessing = 0;
      const passDepth = Object.fromEntries(POST_TIMINGS.map(key => [key, 0])), seen = new Set(), unavailable = new Set();
      for (const pass of app.composer.passes) {
        if (pass === app.renderPass || pass.enabled === false || seen.has(pass)) continue;
        seen.add(pass);
        const key = pass === app.bloom ? 'bloom' : pass === app.finish ? 'finish' : pass === app.output ? 'output' : pass === app.fxaa ? 'fxaa' : 'other';
        const hooked = wrap(pass, 'render', original => function (...args) {
          // 自定义回调若把额外后处理嵌进主场景入口，不能再把两者当作互斥类别排名。
          if (mainDepth > 0) mainAmbiguous = true;
          const start = now(), outer = postDepth++ === 0, categoryOuter = passDepth[key]++ === 0;
          try { return original.apply(this, args); }
          finally {
            postDepth--; passDepth[key]--; const ms = elapsed(start); if (categoryOuter) add(sample.post, key, ms);
            if (outer) add(sample.timings, 'postprocessing', ms);
          }
        });
        if (hooked) { if (!unavailable.has(key)) sample.post[key] = 0; }
        else { unavailable.add(key); sample.post[key] = null; sample.timings.postprocessing = null; }
      }
    }
  } catch {
    // 仅读诊断接口失败时卸下已装包装，正常绘制仍执行一次；未知项不伪装为 0。
    restore(); rendererHook = clearHook = shadowHook = false;
    for (const group of [sample.timings, sample.post, sample.counts]) for (const key of Object.keys(group)) group[key] = null;
  }
  const measuredDraw = () => {
    const start = now(), outer = drawDepth++ === 0;
    try { return draw(); }
    finally { drawDepth--; if (outer) { const ms = elapsed(start); drawMs = finite(drawMs) && finite(ms) ? drawMs + ms : null; } }
  };
  const start = now();
  try {
    const result = optimizer ? optimizer.render(measuredDraw) : measuredDraw();
    sample.completed = true; return result;
  } finally {
    sample.timings.total = elapsed(start); sample.timings.draw = drawMs;
    if (optimizer && finite(sample.timings.total) && finite(drawMs)) sample.timings.scenePrepare = Math.max(0, sample.timings.total - drawMs);
    if (rendererHook && sample.counts.rendererCalls === 0) sample.timings.renderer = null;
    if (!rendererHook || mainObserved === 0) sample.timings.mainRenderer = null;
    if (!rendererHook || !shadowHook || !clearHook || mainShadowObserved === 0) sample.timings.mainShadow = null;
    if (!mainAmbiguous && finite(sample.timings.mainRenderer) && finite(sample.timings.mainShadow)) {
      sample.timings.mainScene = Math.max(0, sample.timings.mainRenderer - sample.timings.mainShadow);
    }
    if (shadowHook && clearHook && shadowObserved > 0) sample.shadowState = sample.counts.shadowRefreshes > 0 ? 'refreshed' : 'skipped';
    else {
      sample.timings.shadow = null;
      for (const key of ['shadowRefreshes', 'shadowSkips', 'shadowClears', 'shadowDrawCalls']) sample.counts[key] = null;
    }
    restore(); activeApps.delete(app);
    try { accept(sample); } catch { /* 采样失败不能改变原绘制返回或异常。 */ }
  }
}
