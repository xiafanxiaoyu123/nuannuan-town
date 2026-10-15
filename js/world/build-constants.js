// 建造岛的纯数据边界；存档迁移和校验也可引用，不依赖渲染器。
export const BUILD_ISLAND = Object.freeze({ cx: -700, cz: 0, w: 50, d: 42, r: 7 });
export const BUILD_LOT = Object.freeze({ x0: -718, z0: -14, cols: 36, rows: 28 });
export const BUILD_HOME_DOCK = Object.freeze({ x: -523, z: 0 });
export const BUILD_DOCK = Object.freeze({ x: -723, z: 8 });
export const BUILD_SPAWN = Object.freeze({ x: -721, z: 8 });
export const BUILD_LEVEL_HEIGHT = 3;
// level 0/1/2 对应 1/2/3 楼；level 3 仅供最高屋顶封顶。
export const MAX_BUILD_LEVEL = 3;
export const MAX_BUILD_FLOOR = 2;
