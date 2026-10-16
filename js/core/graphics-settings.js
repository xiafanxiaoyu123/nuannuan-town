// 只规范画面偏好，不接触游戏进度；启动、导入预览和设置面板共用。
export const FPS_LIMITS = ['auto', 30, 60, 90, 120, 'unlimited'];
export const RENDER_SCALES = [0.75, 1, 1.25, 1.5];
export const ANTI_ALIAS_MODES = ['auto', 'off', 'fxaa', 'msaa2', 'msaa4'];

export function normalizeGraphicsSettings(settings = {}) {
  return {
    ...settings,
    quality: ['low', 'mid', 'high'].includes(settings.quality) ? settings.quality : 'high',
    // 旧存档的 high 是历史默认值；只有玩家主动选择才在手机上开启精致。
    qualityExplicit: settings.qualityExplicit === true,
    fpsLimit: FPS_LIMITS.includes(settings.fpsLimit) ? settings.fpsLimit : 'auto',
    renderScale: RENDER_SCALES.includes(settings.renderScale) ? settings.renderScale : 1,
    antiAlias: ANTI_ALIAS_MODES.includes(settings.antiAlias) ? settings.antiAlias : 'auto',
    adaptiveQuality: settings.adaptiveQuality !== false,
    showFps: settings.showFps === true || settings.showFps === 1,
  };
}

export function effectiveQuality(settings, mobile) {
  const s = normalizeGraphicsSettings(settings);
  return mobile && s.quality === 'high' && !s.qualityExplicit ? 'mid' : s.quality;
}

// 无限制是可迁移的电脑偏好；手机读取同一存档时按自动运行，不向原生桥传字符串。
export function effectiveFpsLimit(settings, mobile) {
  const limit = normalizeGraphicsSettings(settings).fpsLimit;
  return mobile && limit === 'unlimited' ? 'auto' : limit;
}

export function resolveAntiAlias(settings, mobile, quality, maxSamples = 0) {
  const requested = normalizeGraphicsSettings(settings).antiAlias;
  const mode = requested === 'auto'
    ? mobile ? 'off' : settings.perf?.aa === false ? 'off' : quality === 'high' ? 'msaa4' : 'native'
    : requested;
  if (!mode.startsWith('msaa')) return { requested, mode, samples: 0, fallback: false };
  const desired = mode === 'msaa4' ? 4 : 2;
  const available = Math.max(0, Number(maxSamples) || 0);
  const samples = available >= desired ? desired : available >= 2 ? 2 : 0;
  return { requested, mode: samples ? 'msaa' + samples : 'fxaa', samples, fallback: samples < desired };
}
