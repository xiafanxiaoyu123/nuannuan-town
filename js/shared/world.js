// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
// ——— 院子扩建 ———（可布置范围：格子 x 0..x1、z 0..z1）
// 家园格子原点永久保持旧档坐标；第五级只在东侧增加 38 列。
export const HOME_LOT = Object.freeze({ x0: -519, z0: -15, cols: 76, rows: 26 });

export const YARDS = [
  { lv: 1, name: '小院', x1: 27, z1: 17, price: 0, beauty: 0, note: '刚好放下一栋小屋和几块田' },
  { lv: 2, name: '花园', x1: 37, z1: 17, price: 1800, beauty: 60, note: '向东拓宽，多出一整片草地' },
  { lv: 3, name: '庄园', x1: 37, z1: 21, price: 4800, beauty: 140, note: '向南推进，够摆一座旋转木马' },
  { lv: 4, name: '梦幻庄园', x1: 37, z1: 25, price: 9600, beauty: 260, note: '原有庭院全部开放，可布置 38×26 格' },
  { lv: 5, name: '田园牧歌', x1: 75, z1: 25, price: 16800, beauty: 420, note: '向东新增 988 格，家园扩大到 76×26 格，自由搭建牧场' },
];

