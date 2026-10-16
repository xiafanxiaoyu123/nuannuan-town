// 兼容原查询入口；默认日期来自当前镇历，纯数值规则不反向读取存档。
import { festivalAtMonthDay } from '../shared/effect-rules.js';
import { gameDate } from '../core/gametime.js';
export { outfitFx } from '../shared/effect-rules.js';
export function festivalAt(md = gameDate().md) { return festivalAtMonthDay(md); }
export const cropFestivalBonus = () => festivalAt()?.id === 'harvest' ? 0.2 : 0;
