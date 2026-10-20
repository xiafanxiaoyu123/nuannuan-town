// Town 坐标契约。RLOT/RC/DOORS 在扩建时原位更新，外部引用必须保持同一对象。
import { BUILD_HOME_DOCK, BUILD_DOCK } from '../build-constants.js';
import { HOME_LOT } from '../../shared/world.js';

export const ISLAND = { w: 90, d: 42, r: 9 }; // 东西各扩出一截：西边是居民区，东边留给以后的新街区
// 家园是远离小镇的一座独立大岛，整片院子都是可布置的网格
// 圆角矩形实际面积精确翻倍：A = w*d - (4-π)*r²。西岸和旧家园坐标不动。
export const HOME = { cx: -481, cz: 0, w: 92, d: (2 * (54 * 42 - (4 - Math.PI) * 81) + (4 - Math.PI) * 81) / 92, r: 9 };
export const LOT = HOME_LOT;
export const HOUSE_POS = { x: -500, z: LOT.z0 + 3 };
// 小屋在小镇西侧；进屋是独立的室内空间；穿过后门是后院（上面那座大岛）
export const TOWN_HOUSE = { x: -20, z: -9.5 };
export const RLOT = { x0: 489, z0: -7.5, cols: 22, rows: 15 };
export const RC = { x: RLOT.x0 + RLOT.cols / 2, z: RLOT.z0 + RLOT.rows / 2 };
// 各区域之间的门：[所在区域][要去的区域] → 门的位置
export const DOORS = {
  town: { house: { x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3 }, home: { x: TOWN_HOUSE.x, z: TOWN_HOUSE.z + 3.3 } },
  house: { town: { x: RC.x, z: RLOT.z0 + RLOT.rows - 0.4 }, home: { x: RC.x, z: RLOT.z0 + 0.9 } },
  home: { house: { x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5 }, town: { x: HOUSE_POS.x, z: HOUSE_POS.z + 3.5 } },
  build: { home: BUILD_DOCK, house: BUILD_DOCK, town: BUILD_DOCK },
};
DOORS.home.build = BUILD_HOME_DOCK; DOORS.house.build = DOORS.house.home; DOORS.town.build = DOORS.town.house;
export const RECYCLE = { x: LOT.x0 + 5, z: LOT.z0 + 3 };
export const PLAZA = { x: 6, z: 4, r: 6.2 };
export const PATHS = [
  [-21, -19, -7.4, 5], [-21, 2, 3, 5], [5, 7, -8.5, 0], [-9.5, 19.5, -10.3, -8.3],
  [-7.7, -5.7, -11.2, -9.5], [2.7, 4.7, -11.9, -9.5], [12.9, 14.9, -11.4, -9.5],
  [10, 23, 3, 5], [21, 23, 1.2, 4], [5, 7, 8, 19.6],
  // 西边住宅区：主路向西延伸，北侧再开一条樱花巷
  [-42.6, -21, 3, 5], [-42.6, -21, -6.7, -4.9], [-43.4, -41.6, -6.7, 5],
  // 东边：主路通到预留地
  [23, 34, 3, 5],
];
export const PIER = [5, 7, 19, 27];

export function sdRR(x, z, isl) {
  const hx = isl.w / 2 - isl.r, hz = isl.d / 2 - isl.r;
  const qx = Math.abs(x - (isl.cx || 0)) - hx, qz = Math.abs(z - (isl.cz || 0)) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - isl.r;
}
export const sdIsland = (x, z) => sdRR(x, z, ISLAND);
