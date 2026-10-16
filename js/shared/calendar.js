// 镇历的纯计算：不读取玩家状态。一天从清晨5点开始，月份每月7天，新档3月1日。
export const MONTH_DAYS = 7, YEAR_DAYS = 84;
const START = 2 * MONTH_DAYS;
const pad = (n) => String(n).padStart(2, '0');
export function gameDate(g = 0) {
  const n = Math.max(0, Math.floor(g)) + START;
  const year = Math.floor(n / YEAR_DAYS) + 1, doy = n % YEAR_DAYS, month = Math.floor(doy / MONTH_DAYS) + 1, day = (doy % MONTH_DAYS) + 1;
  return { n: Math.max(0, Math.floor(g)), year, month, day, md: pad(month) + '-' + pad(day), key: `${year}年${month}月${day}日`, text: `${month}月${day}日` };
}
export const mdText = (md) => `${Number(md.slice(0, 2))}月${Number(md.slice(3))}日`;
