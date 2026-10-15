// 房屋等级共用的室内尺寸。固定左上角，升级时旧家具与地板的格子坐标不变。
const ORIGIN = Object.freeze({ x0: 489, z0: -7.5 });
const DIMENSIONS = [[22, 15], [28, 19], [34, 23]];
const PLANS = DIMENSIONS.map(([cols, rows], i) => Object.freeze({
  level: i + 1,
  ...ORIGIN,
  cols,
  rows,
  centerX: ORIGIN.x0 + cols / 2,
  centerZ: ORIGIN.z0 + rows / 2,
  area: cols * rows,
  maxWalls: i === DIMENSIONS.length - 1 ? 240 : 0,
  canPartition: i === DIMENSIONS.length - 1,
  wallHeight: 5,
  wallLength: 1,
  doorLength: 2,
  doorOpening: 1.56,
  doorPostWidth: 0.22,
}));

export function housePlan(level = 1) {
  return PLANS[Number.isInteger(level) && level >= 1 && level <= PLANS.length ? level - 1 : 0];
}
