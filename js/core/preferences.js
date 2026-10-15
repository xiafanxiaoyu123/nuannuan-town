// 所有操作设置都在读取时收敛到安全范围，旧档无需重新开始。
import { S } from './state.js';
const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export const CONTROL_RANGES = {
  joySize: [80, 200, 4, 108], joyEdge: [12, 120, 4, 20], joyBottom: [12, 180, 4, 24],
  cameraSensitivity: [0.3, 3, 0.1, 1], textScale: [1, 1.5, 0.05, 1], buttonScale: [1, 1.5, 0.05, 1],
};
export function controls() {
  const s = S.settings;
  return {
    moveSide: s.moveSide === 'right' ? 'right' : 'left',
    ...Object.fromEntries(Object.entries(CONTROL_RANGES).map(([key, [min, max, , fallback]]) => [key, bounded(s[key], min, max, fallback)])),
  };
}
export const daySeconds = () => [320, 640, 960].includes(S.settings.daySeconds) ? S.settings.daySeconds : 320;
export const creativeTimePaused = () => S.settings.pauseCreativeTime === true;
