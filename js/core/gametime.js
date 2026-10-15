// 小镇自己的日历：除了每日订单和签到按现实日期，其余「每天一次」「节日」都按这里的日子算。
// 小镇的一天 = 昼夜循环走一圈（清晨 5 点换日）；每月 7 天，一年 12 个月共 84 天；新档从 3 月 1 日开始。
import { S } from './state.js';

export const MONTH_DAYS = 7, YEAR_DAYS = 84;
const START = 2 * MONTH_DAYS; // 3 月 1 日
const pad = (n) => String(n).padStart(2, '0');
export function gameDate(g = S.gday || 0) {
  const n = Math.max(0, Math.floor(g)) + START;
  const year = Math.floor(n / YEAR_DAYS) + 1, doy = n % YEAR_DAYS, month = Math.floor(doy / MONTH_DAYS) + 1, day = (doy % MONTH_DAYS) + 1;
  return { n: Math.max(0, Math.floor(g)), year, month, day, md: pad(month) + '-' + pad(day), key: `${year}年${month}月${day}日`, text: `${month}月${day}日` };
}
export const gameDayKey = () => gameDate().key;
export const gameDayNo = () => gameDate().n;
// 「03-03」这样的月-日写成「3月3日」
export const mdText = (md) => `${Number(md.slice(0, 2))}月${Number(md.slice(3))}日`;
