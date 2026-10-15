// 存档文件的纯校验；不读写存储、不触发奖励，未知的有效扩展字段原样保留。
import { CLOTHES, CLOTH, DECO, CROP, FRUIT, FLOOR, HOUSES, YARDS, SHOP_MAX_LV, MAX_STAGE } from '../data.js';
import { DAILY_POOL, BEAUTY_REWARDS, PROJECT } from '../live/data.js';
import { createRecordRules } from '../live/canon-record.js';
import { housePlan } from '../world/house-plan.js';
import { isYardStructure, MAX_YARD_LEVEL, validateYardLayout, buildInteriorChecker } from '../world/yard-building.js';
import { BUILD_LOT } from '../world/build-constants.js';
import { PAID_PHOTO_POSE_IDS } from '../live/photo-poses.js';
import { MOMO_CLOAK_IDS } from '../models/momo-cloaks.js';

export const SAVE_FILE_FORMAT = 'nikki-block-town-save';
export const SAVE_FILE_VERSION = 1;
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const SHOP_IDS = ['cafe', 'flower', 'tailor', 'fish', 'bakery'];
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (at, why) => { throw new Error(`存档中的 ${at} ${why}`); };
const obj = (v, at) => { if (!plain(v)) fail(at, '应为记录对象'); return v; };
const arr = (v, at, max = 5000) => { if (!Array.isArray(v) || v.length > max) fail(at, `应为不超过 ${max} 项的列表`); return v; };
const num = (v, at, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true) => { if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) fail(at, '数值无效'); };
const str = (v, at, max = 2000) => { if (typeof v !== 'string' || v.length > max) fail(at, '文字格式无效'); };
const flag = (v, at) => { if (![true, false, 0, 1].includes(v)) fail(at, '开关值无效'); };
const optional = (o, key, check, at = key) => { if (Object.hasOwn(o, key)) check(o[key], at); };
const fields = (o, names, check, at) => { for (const key of names) optional(o, key, check, `${at}.${key}`); };
const numberMap = (v, at) => { for (const [k, n] of Object.entries(obj(v, at))) num(n, `${at}.${k}`); };
const flagMap = (v, at) => { for (const [k, n] of Object.entries(obj(v, at))) flag(n, `${at}.${k}`); };
const strings = (v, at) => arr(v, at).forEach((s, i) => str(s, `${at}[${i}]`));
const outfit = (v, at) => { for (const [k, id] of Object.entries(obj(v, at))) { str(id, `${at}.${k}`); if (CLOTH[id] && CLOTH[id].cat !== k) fail(at, '服饰部位不匹配'); } };

function jsonTree(value) {
  let count = 0, archiveCount = 0;
  const saveRoot = value?.format === SAVE_FILE_FORMAT ? value.data : value;
  const walk = (v, depth, archived = false) => {
    // 完整原楼与回仓清单是只读恢复资料，不能挤占原本合法的活动存档预算。
    // 归档单独设有限预算；深度、危险字段及文件整体 2 MB 上限仍然照常检查。
    if ((archived ? ++archiveCount > 200000 : ++count > 100000) || depth > 24) throw new Error('存档结构过大或嵌套过深');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('存档包含无效数值');
    if (typeof v === 'string' && v.length > 20000) throw new Error('存档包含过长的文字');
    if (v && typeof v === 'object') for (const [key, next] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 256) throw new Error('存档包含不支持的字段');
      walk(next, depth + 1, archived || (v === saveRoot && key === 'buildHeightArchive'));
    }
  };
  walk(value, 0);
}

// 迁移前保持旧平台的规则：旧 slab 的 level 是实体基座底层，顶面在 level+1。
// 不能用新岛的薄楼板/柱规则预检它，否则合法旧档会在迁移之前被误拒绝。
function legacyYardSupport(placed, at) {
  const solid = new Map(), under = new Map(), floors = new Set();
  const entrance = new Set(['18,7', '19,7', '18,8', '19,8']);
  for (const p of placed) {
    const def = DECO[p.id], level = p.level ?? 0, structure = ['yard_slab', 'yard_stairs'].includes(p.id);
    const [a, b] = def.size, [w, h] = (p.rot || 0) % 2 ? [b, a] : [a, b];
    if (level && ['plot', 'bigplot', 'pond'].includes(p.id)) fail(at, '田地和池塘只能放在地面');
    for (let x = p.gx; x < p.gx + w; x++) for (let z = p.gz; z < p.gz + h; z++) {
      const key = `${x},${z},${level}`, layer = def.under ? under : solid;
      if (structure && entrance.has(`${x},${z}`)) fail(at, '旧平台挡住家门前的通道');
      if (layer.has(key) || structure && under.has(key) || def.under && ['yard_slab', 'yard_stairs'].includes(solid.get(key)?.id)) fail(at, '同一层的家具或建筑发生重叠');
      layer.set(key, p);
      if (p.id === 'yard_slab') floors.add(`${x},${z},${level + 1}`);
    }
  }
  for (const p of placed) if ((p.level ?? 0) > 0) {
    const [a, b] = DECO[p.id].size, [w, h] = (p.rot || 0) % 2 ? [b, a] : [a, b];
    for (let x = p.gx; x < p.gx + w; x++) for (let z = p.gz; z < p.gz + h; z++) if (!floors.has(`${x},${z},${p.level}`)) fail(at, '旧平台的上层物件缺少完整楼板支撑');
  }
}
function placements(v, at, legacy = false, interior = housePlan(1), allowLegacyBuilding = false, allowLegacyHeight = false, heightRepair = null) {
  const indoor = at === 'placedIn' || at.startsWith('decorLayouts.house') || at.startsWith('live.companion.events.corner');
  const yard = at === 'placed' || at.startsWith('decorLayouts.home');
  const build = at === 'buildPlaced' || at.startsWith('decorLayouts.build');
  const bounds = indoor ? [interior.cols, interior.rows] : build ? [BUILD_LOT.cols, BUILD_LOT.rows] : yard ? [38, 26] : null;
  const buildMax = allowLegacyHeight ? 4 : MAX_YARD_LEVEL;
  const max = at.startsWith('live.companion.events.') ? 16 : bounds ? bounds[0] * bounds[1] * (build ? (buildMax + 1) * 4 : yard && allowLegacyBuilding ? 3 : 1) : 2000;
  arr(v, at, max).forEach((p, i) => {
    const a = `${at}[${i}]`; obj(p, a); str(p.id, a + '.id');
    if (!DECO[p.id]) fail(a, '含有当前版本不认识的家具');
    num(p.gx, a + '.gx', legacy ? -1000 : 0, 1000); num(p.gz, a + '.gz', legacy ? -1000 : 0, 1000);
    num(p.rot ?? 0, a + '.rot', 0, 3);
    const oldStructure = ['yard_slab', 'yard_stairs'].includes(p.id);
    const levelMax = build ? buildMax : yard && allowLegacyBuilding ? (oldStructure ? 1 : 2) : 0;
    optional(p, 'level', (value, key) => num(value, key, 0, levelMax), a + '.level');
    if (DECO[p.id].indoorOnly && !indoor && !build) fail(a, '厨房和卫浴家具仅限室内使用');
    if (isYardStructure(p.id) && !build && !(yard && allowLegacyBuilding && oldStructure)) fail(a, '建筑构件只能在建造岛搭建');
    optional(p, 'lightOn', (value, key) => { if (typeof value !== 'boolean') fail(key, '灯光开关应为布尔值'); }, a + '.lightOn');
    if (!legacy && bounds) { const [w, d] = DECO[p.id].size, rotated = (p.rot || 0) % 2; if (p.gx + (rotated ? d : w) > bounds[0] || p.gz + (rotated ? w : d) > bounds[1]) fail(a, '家具超出区域边界'); }
  });
  if (!legacy && yard && allowLegacyBuilding && v.some(p => isYardStructure(p.id) || (p.level ?? 0) !== 0)) legacyYardSupport(v, at);
  if (build) {
    const options = { zone: 'build', freeBuild: true, legacyHeight: allowLegacyHeight, allowBlockedStairs: !!heightRepair, inBounds: (x, z) => x >= 0 && z >= 0 && x < BUILD_LOT.cols && z < BUILD_LOT.rows };
    let result = validateYardLayout(v, DECO, options);
    if (!result.ok && heightRepair?.original) {
      // v1 曾截掉顶层屋顶。仅原合法整栋里的同一件室内家具可进入修复；
      // 当前高度、占位、支撑仍严格校验，归档本身也须通过完整旧规则。
      placements(heightRepair.original, 'buildPlaced', false, interior, false, true);
      const identity = p => `${p.id}:${p.gx},${p.gz},${p.level ?? 0},${p.rot ?? 0}`;
      const known = new Set(heightRepair.original.map(identity));
      const enclosed = buildInteriorChecker(v, DECO);
      if (v.every(p => !(DECO[p.id].indoor === true || DECO[p.id].indoorOnly) || enclosed(p) || known.has(identity(p)))) {
        const geometryDefs = Object.fromEntries(Object.entries(DECO).map(([id, def]) => [id,
          def.indoor === true || def.indoorOnly ? { ...def, indoor: false, indoorOnly: false } : def]));
        result = validateYardLayout(v, geometryDefs, options);
      }
    }
    if (!result.ok) fail(at, result.error);
  }
}
function floors(v, at, legacy = false, interior = housePlan(1)) {
  const entries = Object.entries(obj(v, at));
  const bounds = legacy ? null : at === 'floorIn' || at.startsWith('decorLayouts.house') ? [interior.cols, interior.rows] : at === 'buildFloor' || at.startsWith('decorLayouts.build') ? [BUILD_LOT.cols, BUILD_LOT.rows] : [38, 26];
  if (entries.length > (bounds ? bounds[0] * bounds[1] : 2000)) fail(at, '地板数量过多');
  for (const [key, id] of entries) {
    const [x, z] = key.split(',').map(Number);
    const coordinate = legacy ? /^-?\d{1,4},-?\d{1,4}$/ : /^\d{1,3},\d{1,3}$/;
    if (!coordinate.test(key) || key !== `${x},${z}` || (bounds && (x >= bounds[0] || z >= bounds[1])) || !FLOOR[id] || FLOOR[id].erase) fail(at, '含有无效地板或越界坐标');
  }
}
function cropState(p, at) {
  obj(p, at); num(p.t0, at + '.t0', 0, Number.MAX_SAFE_INTEGER, false);
  if (p.tree !== undefined) { if (!FRUIT[p.tree]) fail(at, '果树品种无效'); optional(p, 'last', (v, a) => num(v, a, 0, Number.MAX_SAFE_INTEGER, false), at + '.last'); optional(p, 'wep', str, at + '.wep'); }
  else { if (!CROP[p.crop] || FRUIT[p.crop]) fail(at, '作物品种无效'); num(p.dur, at + '.dur', 1, Number.MAX_SAFE_INTEGER, false); optional(p, 'watered', flag, at + '.watered'); }
}
function walls(v, at, interior) {
  const entries = arr(v, at, interior.maxWalls), occupied = new Set();
  for (const [i, p] of entries.entries()) {
    const a = `${at}[${i}]`; obj(p, a);
    if (!['x', 'z'].includes(p.axis) || !['wall', 'door'].includes(p.kind)) fail(a, '隔断方向或类型无效');
    num(p.gx, a + '.gx', 0, interior.cols); num(p.gz, a + '.gz', 0, interior.rows);
    const length = p.kind === 'door' ? interior.doorLength : interior.wallLength;
    if (p.axis === 'x' ? p.gx + length > interior.cols || p.gz < 1 || p.gz >= interior.rows : p.gz + length > interior.rows || p.gx < 1 || p.gx >= interior.cols) fail(a, '隔断必须位于室内格线，且不能超出区域边界');
    for (let j = 0; j < length; j++) {
      const key = `${p.axis}:${p.gx + (p.axis === 'x' ? j : 0)},${p.gz + (p.axis === 'z' ? j : 0)}`;
      if (occupied.has(key)) fail(a, '隔断或门洞与已有隔断重叠');
      occupied.add(key);
    }
  }
}
function layouts(v, interior, allowLegacyBuilding = false, allowLegacyHeight = false, heightRepairFor = () => null) {
  obj(v, 'decorLayouts');
  for (const zone of ['house', 'home', 'build']) if (v[zone] !== undefined) arr(v[zone], `decorLayouts.${zone}`, 3).forEach((s, i) => {
    if (s === null) return;
    const a = `decorLayouts.${zone}[${i}]`; obj(s, a);
    if (s.version !== 1 || s.zone !== zone) fail(a, '版本或区域不匹配');
    str(s.name, a + '.name', 20); placements(s.placed, a + '.placed', false, interior, allowLegacyBuilding, allowLegacyHeight, zone === 'build' ? heightRepairFor(i) : null); floors(s.floor, a + '.floor', false, interior);
    optional(s, 'walls', (value, key) => walls(value, key, zone === 'house' ? interior : housePlan(1)), a + '.walls');
  });
}

function validateLive(l, interior) {
  obj(l, 'live');
  fields(l, ['day'], str, 'live'); fields(l, ['chest'], flag, 'live');
  for (const k of ['sign', 'book', 'project', 'visit', 'story', 'storyClaimed', 'residents', 'canon', 'fun', 'granted', 'photo', 'nonoy']) optional(l, k, obj, `live.${k}`);
  optional(l, 'daily', (v, a) => arr(v, a, 3).forEach((t, i) => {
    const at = `${a}[${i}]`; obj(t, at); const def = DAILY_POOL.find((d) => d.id === t.id); if (!def) fail(at, '订单类型无效');
    num(t.n, at + '.n', 1); fields(t, ['base'], num, at);
    // 无尽订单记录逐帧累积的秒数，正常旧档也会带小数；其余计数仍要求整数。
    optional(t, 'prog', (v, key) => num(v, key, 0, Number.MAX_SAFE_INTEGER, def.type !== 'endless'), at + '.prog');
    fields(t, ['claimed'], flag, at);
  }), 'live.daily');
  if (l.sign) { fields(l.sign, ['last'], str, 'live.sign'); optional(l.sign, 'streak', (v, a) => num(v, a, 0, 7), 'live.sign.streak'); }
  if (l.book) for (const [key, value] of Object.entries(l.book)) {
    if (key === 'claimed') flagMap(value, 'live.book.claimed'); else numberMap(value, 'live.book.' + key);
  }
  optional(l, 'miles', (v, a) => arr(v, a, BEAUTY_REWARDS.length).forEach((n) => num(n, a, 0, BEAUTY_REWARDS.length - 1)), 'live.miles');
  if (l.project) { optional(l.project, 'phase', (v, a) => num(v, a, 0, PROJECT.phases.length), 'live.project.phase'); optional(l.project, 'paid', num, 'live.project.paid'); }
  if (l.visit) { fields(l.visit, ['day', 'npc'], str, 'live.visit'); fields(l.visit, ['claimed'], flag, 'live.visit'); fields(l.visit, ['beauty'], num, 'live.visit'); }
  optional(l, 'story', numberMap, 'live.story'); optional(l, 'storyClaimed', flagMap, 'live.storyClaimed'); optional(l, 'granted', flagMap, 'live.granted');
  if (l.nonoy) { fields(l.nonoy, ['love'], num, 'live.nonoy'); fields(l.nonoy, ['last'], str, 'live.nonoy'); optional(l.nonoy, 'got', strings, 'live.nonoy.got'); }
  if (l.photo) {
    fields(l.photo, ['camera', 'stick', 'tripod'], flag, 'live.photo'); fields(l.photo, ['shots'], num, 'live.photo');
    optional(l.photo, 'poses', (value, at) => {
      arr(value, at, PAID_PHOTO_POSE_IDS.length);
      if (value.some(id => !PAID_PHOTO_POSE_IDS.includes(id)) || new Set(value).size !== value.length) fail(at, '含有无效或重复的拍照姿势');
    }, 'live.photo.poses');
  }
  if (l.fun) { fields(l.fun, ['day'], str, 'live.fun'); fields(l.fun, ['capsule'], num, 'live.fun'); optional(l.fun, 'used', obj, 'live.fun.used'); }
  if (l.residents) {
    const r = l.residents, at = 'live.residents'; fields(r, ['day', 'performed'], str, at); optional(r, 'base', numberMap, at + '.base');
    if (r.tasks !== undefined) for (const [id, t] of Object.entries(obj(r.tasks, at + '.tasks'))) { const a = at + '.tasks.' + id; obj(t, a); numberMap(t.base, a + '.base'); fields(t, ['claimed'], flag, a); }
    if (r.album !== undefined) for (const [id, t] of Object.entries(obj(r.album, at + '.album'))) { obj(t, at + '.album.' + id); str(t.day, at + '.album.day'); outfit(t.outfit, at + '.album.outfit'); }
    for (const key of ['reviews', 'poems']) optional(r, key, (v, a) => arr(v, a, 100).forEach((t) => { obj(t, a); str(t.day, a + '.day'); strings(t.lines, a + '.lines'); optional(t, 'outfit', outfit, a + '.outfit'); optional(t, 'counts', numberMap, a + '.counts'); }), at + '.' + key);
  }
  if (l.canon) {
    optional(l.canon, 'met', flagMap, 'live.canon.met');
    if (l.canon.dada !== undefined && l.canon.dada !== null) {
      const rules = createRecordRules({ clothes: CLOTHES, shopIds: SHOP_IDS });
      if (rules.status(l.canon.dada) === 'invalid') fail('live.canon.dada', '来访记录不完整');
    }
    if (l.canon.v !== undefined) {
      const v = obj(l.canon.v, 'live.canon.v'); fields(v, ['day'], str, 'live.canon.v'); fields(v, ['paper'], num, 'live.canon.v'); fields(v, ['rebate'], flag, 'live.canon.v');
      if (v.gear !== undefined && v.gear !== null) {
        const g = obj(v.gear, 'live.canon.v.gear'); arr(g.spots, 'live.canon.v.gear.spots', 3).forEach((p) => { arr(p, '零件坐标', 2); if (p.length !== 2) fail('零件坐标', '不完整'); p.forEach((n) => num(n, '零件坐标', -1000, 1000, false)); });
        arr(g.got, 'live.canon.v.gear.got', 3).forEach((n) => num(n, '零件索引', 0, g.spots.length - 1)); fields(g, ['done'], flag, 'live.canon.v.gear');
      }
    }
  }
  if (l.companion !== undefined) {
    const c = obj(l.companion, 'live.companion'); if (c.version !== 1) fail('live.companion', '版本不支持');
    for (const [id, e] of Object.entries(obj(c.events, 'live.companion.events'))) {
      const a = 'live.companion.events.' + id; obj(e, a); if (!['tea', 'corner', 'photo'].includes(id) || !['active', 'done'].includes(e.status)) fail(a, '事件状态无效');
      num(e.startedDay, a + '.startedDay'); fields(e, ['doneDay', 'shot'], num, a); optional(e, 'placed', (v, at) => placements(v, at, false, interior), a + '.placed');
    }
  }
  if (l.community !== undefined) {
    const c = obj(l.community, 'live.community'); if (c.version !== 1) fail('live.community', '版本不支持');
    for (const [id, p] of Object.entries(obj(c.projects, 'live.community.projects'))) { const a = 'live.community.projects.' + id; obj(p, a); if (!['garden', 'shore'].includes(id)) fail(a, '工程类型无效'); num(p.phase, a + '.phase', 0, 3); num(p.paid, a + '.paid'); fields(p, ['finishedDay'], num, a); }
  }
}

export function validateSaveData(d, options = {}) {
  obj(d, '根节点'); jsonTree(d);
  if (d.v !== undefined) { num(d.v, 'v', 1); if (d.v > 3) throw new Error('这是较新版本的存档，请先更新游戏后再导入'); }
  // 有效的早期版本也包含这些核心字段，避免把无关 JSON 当成一个新档。
  for (const key of ['coins', 'owned', 'outfit', 'shops', 'placed']) if (!Object.hasOwn(d, key)) fail(key, '缺失，文件可能不是小镇存档');
  num(d.coins, 'coins'); strings(d.owned, 'owned'); outfit(d.outfit, 'outfit');
  optional(d, 'momoCloak', (value, at) => { if (!MOMO_CLOAK_IDS.includes(value)) fail(at, '斗篷款式无效'); });
  optional(d, 'momoOwned', (value, at) => {
    arr(value, at, MOMO_CLOAK_IDS.length);
    if (value.some(id => !MOMO_CLOAK_IDS.includes(id)) || new Set(value).size !== value.length) fail(at, '含有无效或重复的大喵斗篷');
  });
  optional(d, 'seed', (v, a) => { if (!CROP[v] || FRUIT[v]) fail(a, '当前种子无效'); });
  optional(d, 'sapling', (v, a) => { if (!FRUIT[v]) fail(a, '当前果树无效'); });
  fields(d, ['started', 'cheat'], flag, 'save'); fields(d, ['gday', 'quest', 'savedAt'], num, 'save');
  optional(d, 'house', (v, a) => num(v, a, 1, HOUSES.length)); optional(d, 'yardLv', (v, a) => num(v, a, 1, YARDS.length)); optional(d, 'clock', (v, a) => num(v, a, 0, 1, false));
  const interior = housePlan(d.house ?? 1);
  optional(d, 'buildMigrationVersion', (value, at) => num(value, at, 1, 1));
  const allowLegacyBuilding = options.allowLegacyBuilding === true && d.buildMigrationVersion === undefined;
  optional(d, 'buildHeightVersion', (value, at) => num(value, at, 1, 2));
  // 只在外部旧档的预检阶段接受历史高度；迁移后会再次按三楼上限严格校验。
  const allowLegacyHeight = options.allowLegacyBuilding === true && d.buildHeightVersion === undefined;
  optional(d, 'buildQuest', (value, at) => {
    obj(value, at); if (value.version !== 1) fail(at, '剧情版本无效');
    num(value.stage, at + '.stage', 0, 3);
    if (typeof value.rewarded !== 'boolean' || value.rewarded !== (value.stage === 3)) fail(at, '剧情阶段与奖励领取状态不一致');
  });
  optional(d, 'buildMigrationArchive', (value, at) => arr(value, at).forEach((entry, i) => {
    const a = `${at}[${i}]`; obj(entry, a);
    if (entry.version !== 1 || !['placed', 'decorLayouts.home'].includes(entry.source)) fail(a, '迁移归档来源无效');
    str(entry.reason, a + '.reason', 500);
    if (entry.source === 'placed') { arr(entry.placed, a + '.placed'); if (entry.returned !== true) fail(a, '迁移回仓标记无效'); }
    else { num(entry.slot, a + '.slot', 0, 2); obj(entry.layout, a + '.layout'); }
  }));
  optional(d, 'buildHeightArchive', (value, at) => arr(value, at, 4).forEach((entry, i) => {
    const a = `${at}[${i}]`; obj(entry, a);
    if (entry.version !== 1 || !['buildPlaced', 'decorLayouts.build'].includes(entry.source)) fail(a, '高度调整归档来源无效');
    str(entry.reason, a + '.reason', 500);
    optional(entry, 'blockedStairs', (value, at) => num(value, at, 0, BUILD_LOT.cols * BUILD_LOT.rows * 20), a + '.blockedStairs');
    // 原始高度和完整布局保留；v2 可凭合法旧归档修复 v1 截顶错误。
    optional(entry, 'repairVersion', (value, at) => num(value, at, 2, 2), a + '.repairVersion');
    if (entry.source === 'buildPlaced') {
      arr(entry.placed, a + '.placed', BUILD_LOT.cols * BUILD_LOT.rows * 20);
      arr(entry.removed, a + '.removed', BUILD_LOT.cols * BUILD_LOT.rows * 20);
      obj(entry.floor, a + '.floor'); if (entry.returned !== true) fail(a, '高度调整回仓标记无效');
    } else { num(entry.slot, a + '.slot', 0, 2); obj(entry.layout, a + '.layout'); }
  }));
  const heightRepairFor = slot => {
    if (options.allowLegacyBuilding !== true || d.buildHeightVersion !== 1) return null;
    const entry = (d.buildHeightArchive || []).find(item => slot === undefined
      ? item.source === 'buildPlaced' : item.source === 'decorLayouts.build' && item.slot === slot);
    return { original: slot === undefined ? entry?.placed : entry?.layout?.placed };
  };
  for (const key of ['decor', 'crops', 'seeds', 'stats', 'ach']) optional(d, key, numberMap);
  if (d.crops) for (const id of Object.keys(d.crops)) if (!CROP[id] && !FRUIT[id]) fail('crops', '含有未知作物');
  if (d.decor) for (const id of Object.keys(d.decor)) if (!DECO[id]) fail('decor', '含有未知家具');
  if (d.seeds) for (const id of Object.keys(d.seeds)) if (!CROP[id] && !FRUIT[id]) fail('seeds', '含有未知种子');
  placements(d.placed, 'placed', (d.v || 1) < 2, interior, allowLegacyBuilding); optional(d, 'placedIn', (v, a) => placements(v, a, false, interior));
  optional(d, 'buildPlaced', (v, a) => placements(v, a, false, interior, false, allowLegacyHeight, heightRepairFor()));
  optional(d, 'wallsIn', (v, a) => walls(v, a, interior));
  // v1 的旧小镇坐标会在迁移时整体清除，不能套用新岛边界误拒绝有效旧档。
  optional(d, 'floor', (v, a) => floors(v, a, (d.v || 1) < 2)); optional(d, 'floorIn', (v, a) => floors(v, a, false, interior)); optional(d, 'buildFloor', (v, a) => floors(v, a)); optional(d, 'decorLayouts', (v) => layouts(v, interior, allowLegacyBuilding, allowLegacyHeight, heightRepairFor));
  if (d.farm !== undefined) for (const [key, p] of Object.entries(obj(d.farm, 'farm'))) { if (!/^\d{1,3},\d{1,3}$/.test(key)) fail('farm', '坐标无效'); cropState(p, 'farm.' + key); }
  optional(d, 'plots', (v, a) => arr(v, a, 128).forEach((p, i) => { if (p !== null) cropState(p, a + '[' + i + ']'); }));
  obj(d.shops, 'shops');
  for (const [id, shop] of Object.entries(d.shops)) { const a = 'shops.' + id; obj(shop, a); num(shop.lv, a + '.lv', 1, SHOP_MAX_LV); fields(shop, ['best', 'plays', 'endBest', 'endTime'], num, a); optional(shop, 'stage', (v, at) => num(v, at, 0, MAX_STAGE), a + '.stage');
    if (shop.stars !== undefined) for (const [key, value] of Object.entries(obj(shop.stars, a + '.stars'))) { if (!/^\d+$/.test(key)) fail(a + '.stars', '关卡无效'); num(Number(key), a + '.stars', 1, MAX_STAGE); num(value, a + '.stars.' + key, 0, 3); }
  }
  optional(d, 'settings', (s, at) => {
    obj(s, at); fields(s, ['music', 'sfx'], (v, a) => num(v, a, 0, 1, false), at);
    for (const [key, values] of Object.entries({ quality: ['high', 'mid', 'low'], orient: ['', 'auto', 'land', 'port'], moveSide: ['left', 'right'], fpsLimit: ['auto', 30, 60, 90, 120, 'unlimited'], renderScale: [0.75, 1, 1.25, 1.5], antiAlias: ['auto', 'off', 'fxaa', 'msaa2', 'msaa4'], daySeconds: [320, 640, 960] })) {
      optional(s, key, (v, a) => { if (!values.includes(v)) fail(a, '选项无效'); }, at + '.' + key);
    }
    for (const [key, min, max] of [['joySize', 80, 200], ['joyEdge', 12, 120], ['joyBottom', 12, 180], ['cameraSensitivity', .3, 3], ['textScale', 1, 1.5], ['buttonScale', 1, 1.5]]) optional(s, key, (v, a) => num(v, a, min, max, false), at + '.' + key);
    fields(s, ['pauseCreativeTime', 'qualityExplicit', 'adaptiveQuality', 'autoTutorials'], flag, at);
    optional(s, 'tutorialSeen', (seen, a) => {
      for(const [id, version] of Object.entries(obj(seen, a))) num(version, a + '.' + id);
    }, at + '.tutorialSeen');
  });
  optional(d, 'work', (v, at) => { for (const [id, o] of Object.entries(obj(v, at))) outfit(o, at + '.' + id); });
  if (d.workPrev !== undefined && d.workPrev !== null) outfit(d.workPrev, 'workPrev');
  optional(d, 'tut', (value, at) => {
    for (const [id, version] of Object.entries(obj(value, at))) {
      if (typeof version !== 'boolean') num(version, at + '.' + id);
    }
  });
  optional(d, 'req', (v, at) => { for (const [id, r] of Object.entries(obj(v, at))) { obj(r, at + '.' + id); fields(r, ['i', 'done', 'until', 'base', 'prog', 'acc'], num, at + '.' + id); } });
  optional(d, 'npc', (v, at) => { for (const [id, n] of Object.entries(obj(v, at))) { if (id === '_sets') { strings(n, at + '.' + id); continue; } obj(n, at + '.' + id); fields(n, ['t'], num, at + '.' + id); fields(n, ['last'], str, at + '.' + id); } });
  optional(d, 'live', (v) => validateLive(v, interior));
  return d;
}

export function parseSaveFile(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('存档文件超过 2 MB，未读取');
  let parsed;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('文件不是有效的 JSON 存档，请重新选择导出的文件'); }
  obj(parsed, '文件'); jsonTree(parsed);
  let data = parsed, exportedAt = null;
  if (Object.hasOwn(parsed, 'format')) {
    if (parsed.format !== SAVE_FILE_FORMAT) throw new Error('这不是暖暖小镇的存档文件');
    if (parsed.formatVersion !== SAVE_FILE_VERSION) throw new Error('存档文件格式版本不支持，请先更新游戏');
    data = parsed.data; exportedAt = typeof parsed.exportedAt === 'string' && Number.isFinite(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : null;
  }
  validateSaveData(data, { allowLegacyBuilding: true });
  return { data, exportedAt, oldVersion: data.v || 1 };
}
