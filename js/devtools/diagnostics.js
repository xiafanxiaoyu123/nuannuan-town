// 自愿开启的本机诊断：不依赖玩家状态，不持久化、不上传、不改变游戏设置。
// 接入层只提供白名单摘要；事件不接收业务载荷，异常不记录 message/stack/URL。
import { sampleRendering, DRAW_TIMINGS, POST_TIMINGS, DRAW_COUNTS } from './render-sampling.js';
const LIMIT = 180, SAMPLE_LIMIT = 3600;
const STAGES = ['tweens', 'effects', 'view', 'hooks', 'render'];
const ACTIONS = Object.freeze({ played: '完成小游戏', stateReplaced: '切换存档', reset: '重置存档',
  zone: '切换区域', daily: '每日订单更新', decorChanged: '装修变化', questDone: '任务完成',
  start: '开始记录', stop: '结束记录', mark: '手动书签', hidden: '进入后台', visible: '返回前台', sync: '云同步状态变化' });
const enums = (value, allowed) => allowed.includes(value) ? value : null;
const number = value => Number.isFinite(value) ? value : null;
const pair = value => Array.isArray(value) && value.length === 2 ? value.map(number) : null;
const round = n => Math.round(n * 100) / 100;
const clone = value => JSON.parse(JSON.stringify(value));
const append = (list, value, limit = LIMIT) => { list.push(value); if (list.length > limit) list.shift(); };
const stats = values => {
  if (!values.length) return { averageMs: null, p95Ms: null, maxMs: null, samples: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { averageMs: round(values.reduce((a, b) => a + b, 0) / values.length),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))]),
    maxMs: round(sorted[sorted.length - 1]), samples: values.length };
};
const scene = value => enums(value, ['town', 'home', 'house', 'build', 'wardrobe', 'cafe', 'flower', 'tailor', 'fish', 'bakery', 'Town', 'Wardrobe']);
let providers = {}, session = null, last = null, timer = null, disposers = [];
const read = key => { try { return providers[key]?.() || {}; } catch { return {}; } };

function overview() {
  const v = read('overview');
  return { version: typeof v.version === 'string' && /^\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*$/i.test(v.version) ? v.version : null,
    build: typeof v.build === 'string' && /^(?:source|web|native)(?:-[a-f0-9]{12})?$/.test(v.build) ? v.build : null,
    platform: enums(v.platform, ['web', 'android', 'windows']),
    scene: scene(v.scene), zone: scene(v.zone), viewport: pair(v.viewport), renderPixels: pair(v.renderPixels), pixelRatio: number(v.pixelRatio),
    quality: enums(v.quality, ['low', 'mid', 'high', 'ultra', 'auto']),
    frameReason: enums(v.frameReason, ['background', 'menu', 'idle', 'active', 'fixed']),
    modalOpen: typeof v.modalOpen === 'boolean' ? v.modalOpen : null, hidden: typeof v.hidden === 'boolean' ? v.hidden : null };
}
function saveSummary() {
  const v = read('save'), observed = session?.save || {};
  return { mode: enums(v.mode, ['normal', 'local-play']), slot: enums(v.slot, ['default', 'isolated']),
    pending: typeof v.pending === 'boolean' ? v.pending : null, lastSavedAt: observed.lastSavedAt || null,
    bytes: observed.bytes ?? null, status: observed.status || 'unobserved' };
}
function syncSummary() {
  const v = read('sync');
  return { status: enums(v.status, ['local-only', 'signed-out', 'restoring', 'signed-in', 'offline', 'unknown', 'ready', 'saved', 'error', 'logged-out', 'cancelled', 'conflict']),
    revision: number(v.revision), pending: typeof v.pending === 'boolean' ? v.pending : null,
    lastSyncAt: session?.lastSyncAt || null, conflict: typeof v.conflict === 'boolean' ? v.conflict : null };
}
function performanceSummary() {
  const s = session, frames = s?.frames || [], cpus = s?.cpus || [];
  const totalMs = frames.reduce((a, b) => a + b, 0);
  return { fps: totalMs ? round(frames.length * 1000 / totalMs) : null,
    frameP95Ms: stats(frames).p95Ms, cpuP95Ms: stats(cpus).p95Ms, slowFrames: s?.frameCount ? s.slowFrames : null,
    drawCalls: s?.render?.drawCalls ?? null, triangles: s?.render?.triangles ?? null,
    geometries: s?.render?.geometries ?? null, textures: s?.render?.textures ?? null,
    targetFps: s?.render?.targetFps ?? null, activeFrameLimit: s?.render?.activeFrameLimit ?? null,
    modules: Object.fromEntries(STAGES.map(name => [name, stats(s?.stages[name] || [])])), draw: drawSummary(s?.draw || []) };
}
function drawSummary(samples) {
  const complete = samples.filter(sample => sample.completed);
  const metrics = (keys, section) => Object.fromEntries(keys.map(key => [key, stats(complete.map(sample => sample[section][key]).filter(value => value !== null))]));
  const counts = Object.fromEntries(Object.entries(metrics(DRAW_COUNTS, 'counts')).map(([key, value]) => [key,
    { average: value.averageMs, p95: value.p95Ms, max: value.maxMs, samples: value.samples }]));
  const shadow = Object.fromEntries(['refreshed', 'skipped', 'unknown'].map(state => {
    const frames = complete.filter(sample => sample.shadowState === state);
    return [state, { frames: frames.length, totalMs: stats(frames.map(sample => sample.timings.total).filter(value => value !== null)) }];
  }));
  return { schema: 'nuannuan-draw-cpu-v2', sampledFrames: samples.length, completedFrames: complete.length,
    failedFrames: samples.length - complete.length, directFrames: complete.filter(sample => !sample.usePost).length,
    postFrames: complete.filter(sample => sample.usePost).length, timings: metrics(DRAW_TIMINGS, 'timings'),
    post: metrics(POST_TIMINGS, 'post'), counts, shadow,
    measurement: 'CPU主线程计时，包含采样开销，不是GPU耗时。total从场景准备到绘制返回，包含scenePrepare和draw；外层modules.render还包含包装安装/清理与记录开销。batchBuild属于scenePrepare；renderer统计所有主场景与后处理提交，shadow属于renderer。mainRenderer仅当前view.scene且不在额外后处理内的提交，mainShadow为其中实际阴影子段，mainScene为二者差值，包含场景遍历/剔除/材质准备等CPU工作，不是纯模型或GPU耗时。排名比较mainScene/mainShadow/postprocessing；RenderPass不计额外后处理，其余父子行不可相加。同类嵌套耗时与阴影drawCalls按最外层累计，入口调用数含嵌套；shadowRefreshes/Skips按最外层阴影调用计。阴影刷新由实际clear/提交观察；clear次数不是帧数或光源数。未知与不适用无样本，观察到未执行为0。所有绘制分组均在最近3600样本内，仅成功帧参与耗时与调用统计。' };
}
function capture() {
  return { recording: !!session, remainingSeconds: session ? Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000)) : 0,
    overview: overview(), performance: performanceSummary(), save: saveSummary(), sync: syncSummary(),
    events: clone(session?.events || []), errors: clone(session?.errors || []) };
}
export const diagnostics = {
  get active() { return !!session; },
  configure(value) { providers = value || {}; },
  start(seconds = 60) {
    this.stop(); last = null;
    const duration = [60, 180, 300].includes(seconds) ? seconds : 60;
    session = { startedAt: new Date().toISOString(), endsAt: Date.now() + duration * 1000,
      frames: [], cpus: [], frameCount: 0, slowFrames: 0, stages: Object.fromEntries(STAGES.map(name => [name, []])), draw: [], events: [], errors: [], save: {} };
    this.event('start');
    const target = globalThis;
    const listen = (name, callback) => { target.addEventListener?.(name, callback); disposers.push(() => target.removeEventListener?.(name, callback)); };
    listen('error', e => this.error(e.error?.name || 'Error'));
    listen('unhandledrejection', e => this.error(e.reason?.name || 'UnhandledRejection'));
    const visibility = () => this.event(globalThis.document?.hidden ? 'hidden' : 'visible');
    globalThis.document?.addEventListener('visibilitychange', visibility);
    disposers.push(() => globalThis.document?.removeEventListener('visibilitychange', visibility));
    try { const off = providers.subscribe?.(); if (typeof off === 'function') disposers.push(off); } catch { this.error('Error'); }
    timer = setTimeout(() => this.stop(), duration * 1000);
    return this.snapshot();
  },
  stop() {
    clearTimeout(timer); timer = null;
    if (!session) return last ? clone(last) : null;
    this.event('stop');
    last = { ...capture(), recording: false, remainingSeconds: 0, startedAt: session.startedAt, finishedAt: new Date().toISOString() };
    session = null;
    for (const off of disposers.splice(0)) { try { off(); } catch { /* 诊断清理不能中断游戏。 */ } }
    return clone(last);
  },
  mark() { this.event('mark'); },
  event(type) {
    if (!session || typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, type)) return;
    append(session.events, { at: new Date().toISOString(), type, message: ACTIONS[type], scene: overview().scene });
  },
  error(name) {
    if (!session) return;
    const type = enums(name, ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'UnhandledRejection']) || 'Error';
    append(session.errors, { at: new Date().toISOString(), type, message: type + '（详情未采集）', scene: overview().scene });
  },
  stage(name, elapsedMs) {
    if (!session || !STAGES.includes(name) || !(elapsedMs >= 0) || !Number.isFinite(elapsedMs)) return;
    append(session.stages[name], elapsedMs, SAMPLE_LIMIT);
  },
  sampleFrame(seconds, cpuMs, app) {
    if (!session || !(seconds > 0) || !Number.isFinite(seconds) || !(cpuMs >= 0) || !Number.isFinite(cpuMs)) return;
    append(session.frames, seconds * 1000, SAMPLE_LIMIT); append(session.cpus, cpuMs, SAMPLE_LIMIT);
    session.frameCount++; if (seconds > .05) session.slowFrames++;
    const info = app?.renderer?.info;
    session.render = { drawCalls: number(info?.render?.calls), triangles: number(info?.render?.triangles),
      geometries: number(info?.memory?.geometries), textures: number(info?.memory?.textures),
      targetFps: number(app?.fpsCap), activeFrameLimit: number(app?.capNow) };
  },
  renderFrame(app, view, draw) {
    if (!session) return view?.renderOptimizer ? view.renderOptimizer.render(draw) : draw();
    const current = session;
    return sampleRendering(app, view, draw, sample => { if (session === current) this.sampleDraw(sample); });
  },
  sampleDraw(sample) {
    if (!session || typeof sample?.completed !== 'boolean' || typeof sample?.usePost !== 'boolean') return;
    const clean = (keys, section) => Object.fromEntries(keys.map(key => {
      const value = sample[section]?.[key]; return [key, Number.isFinite(value) && value >= 0 ? value : null];
    }));
    append(session.draw, { completed: sample.completed, usePost: sample.usePost,
      shadowState: enums(sample.shadowState, ['refreshed', 'skipped']) || 'unknown',
      timings: clean(DRAW_TIMINGS, 'timings'), post: clean(POST_TIMINGS, 'post'), counts: clean(DRAW_COUNTS, 'counts') }, SAMPLE_LIMIT);
  },
  saved(status, serialized) {
    if (!session || !['saved', 'error', 'deferred'].includes(status)) return;
    session.save.status = status;
    if (status === 'saved') {
      session.save.lastSavedAt = new Date().toISOString();
      try { session.save.bytes = typeof serialized === 'string' && typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(serialized).length : null; }
      catch { session.save.bytes = null; }
    }
  },
  synced(state) {
    if (!session) return;
    if (state === 'saved') session.lastSyncAt = new Date().toISOString();
    this.event('sync');
  },
  snapshot() { return !session && last ? clone(last) : capture(); },
  report() {
    return { schema: 'nuannuan-diagnostics-v1', exportedAt: new Date().toISOString(),
      privacy: '仅本机白名单摘要；不含账号、令牌、存档正文、错误原文或网址。',
      measurement: 'CPU为主线程提交耗时，不是GPU耗时；帧及阶段分位数取最近3600帧；慢帧计数覆盖本次记录；对象数量不代表显存；开菜单会触发原有菜单限帧。',
      ...this.snapshot(), ...(session ? { startedAt: session.startedAt } : {}) };
  },
};
