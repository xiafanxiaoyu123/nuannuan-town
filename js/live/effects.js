// 套装与节日的纯查询：不引用存档/UI/模型，核心模块也能安全调用
import { CLOTH } from '../data.js';
import { FESTIVALS } from './data.js';
import { gameDate } from '../core/gametime.js';

const VALUES = {
  far: 0.08, bubble: 0.1, sun: 0.1, dust: 0.05,
  wind: 2, water: 0.08, floral: 0.1, charge: 0.08,
  strings: 0.1, star: 0.1, bloom: 0.06, trip: 0.12,
  heart: 1, dawn: 0.1, ballet: 2, lion: 1, basket: 1,
};
// 不传参数 = 看小镇日历的今天；传「月-日」字符串可以查任意一天
export function festivalAt(md = gameDate().md) {
  if (typeof md !== 'string' || !/^\d\d-\d\d$/.test(md)) return null;
  return FESTIVALS.find((f) => f.from <= f.to ? md >= f.from && md <= f.to : md >= f.from || md <= f.to) || null;
}
export const cropFestivalBonus = () => festivalAt()?.id === 'harvest' ? 0.2 : 0;

export function outfitFx(outfit, key) {
  if (!VALUES[key]) return 0;
  return ['hair', 'dress', 'shoes'].every((cat) => CLOTH[outfit[cat]]?.cat === cat && CLOTH[outfit[cat]].set === key) ? VALUES[key] : 0;
}
