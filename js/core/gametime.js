// 小镇自己的日历：除了每日订单和签到按现实日期，其余「每天一次」「节日」都按这里的日子算。
// 小镇的一天 = 昼夜循环走一圈（清晨 5 点换日）；每月 7 天，一年 12 个月共 84 天；新档从 3 月 1 日开始。
import { S } from './state.js';
import { gameDate as dateFromDay } from '../shared/calendar.js';
export { MONTH_DAYS, YEAR_DAYS, mdText } from '../shared/calendar.js';
export function gameDate(g = S.gday || 0) {
  return dateFromDay(g);
}
export const gameDayKey = () => gameDate().key;
export const gameDayNo = () => gameDate().n;
