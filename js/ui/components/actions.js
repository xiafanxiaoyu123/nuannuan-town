// 沿用 UI 按钮的音频解锁与点击音顺序。
import { audio } from '../../core/audio.js';

export const click = (fn, snd = 'click') => (e) => { audio.init(); audio.sfx(snd); fn(e); };
