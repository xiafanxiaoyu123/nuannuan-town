// 套装/节日数值的纯规则；调用方显式提供搭配与镇历，不反向引用存档或UI。
import { CLOTH } from './clothing.js';
import { FESTIVALS } from '../live/data.js';
import { gameDate } from './calendar.js';

const VALUES = {
  far: 0.08, bubble: 0.1, sun: 0.1, dust: 0.05,
  wind: 2, water: 0.08, floral: 0.1, charge: 0.08,
  strings: 0.1, star: 0.1, bloom: 0.06, trip: 0.12,
  heart: 1, dawn: 0.1, ballet: 2, lion: 1, basket: 1,
};
export function festivalAtMonthDay(md) {
  if (typeof md !== 'string' || !/^\d\d-\d\d$/.test(md)) return null;
  return FESTIVALS.find((f) => f.from <= f.to ? md >= f.from && md <= f.to : md >= f.from || md <= f.to) || null;
}
export const cropFestivalBonusForDay = (day) => festivalAtMonthDay(gameDate(day).md)?.id === 'harvest' ? 0.2 : 0;
export function outfitFx(outfit, key) {
  if (!VALUES[key]) return 0;
  return ['hair', 'dress', 'shoes'].every((cat) => CLOTH[outfit[cat]]?.cat === cat && CLOTH[outfit[cat]].set === key) ? VALUES[key] : 0;
}
