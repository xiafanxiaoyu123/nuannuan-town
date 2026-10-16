// 存档与经济系统
import { Emitter } from './util.js';
import { DEFAULT_OUTFIT, CLOTHES, CLOTH, CROP, DECO, HOUSES, QUESTS, SHOPS, STYLES, YARDS, ACHS } from '../data.js';
import { RESIDENTS as NPCS } from '../live/people.js';
import { outfitFx, cropFestivalBonusForDay } from '../shared/effect-rules.js';
import { parseSaveFile, validateSaveData, SAVE_FILE_FORMAT, SAVE_FILE_VERSION, MAX_SAVE_BYTES } from './save-format.js';
import { PAID_PHOTO_POSE_IDS } from '../live/photo-poses.js';
import { normalizeMomoCloak, normalizeMomoOwned } from '../models/momo-cloaks.js';
import { normalizeGraphicsSettings } from './graphics-settings.js';
import { BUILD_LOT, MAX_BUILD_LEVEL, MAX_BUILD_FLOOR } from '../world/build-constants.js';
import { validateYardLayout, yardFootprint, isBuildInterior, buildInteriorChecker, buildStairObstructions, isBuildRoof } from '../world/yard-building.js';
import { LOCAL_PLAY } from './local-play-mode.js';
import { prepareLocalPlaySave } from './local-play-save.js';
import { createPlayerDefaults, createStartingPlot as plotAt } from '../shared/player-defaults.js';
import { ROOM_SETS } from '../shared/home-themes.js';
import { prepareCompatibleSave } from '../shared/save-compat.js';
import { diagnostics } from '../devtools/diagnostics.js';
export { MAX_SAVE_BYTES } from './save-format.js';

// ?slot=xxx 可以开独立存档位（调试或多人共用一台电脑时用）
const slot = new URLSearchParams(location.search).get('slot');
const ORIGINAL_KEY = 'nikki-block-town-save-v1' + (slot ? ':' + slot : '');
const KEY = LOCAL_PLAY ? ORIGINAL_KEY + ':local-free-play-v1' : ORIGINAL_KEY;
export const bus = new Emitter();
// 仅本机持久化的同步祖先，与主档写入同一个键，防止两个窗口串用基线。
const CLOUD_BASE_FIELD = '__nikkiCloudBaseV1';
let cloudSaveBase = null;
const localSaveText = (data, base = cloudSaveBase) => JSON.stringify(base ? { ...data, [CLOUD_BASE_FIELD]: base } : data);
export function getCloudSaveBase() { return cloudSaveBase ? { ...cloudSaveBase } : null; }
export function setCloudSaveBase(base) {
  cloudSaveBase = base ? { ...base } : null;
  return flushSave();
}

function fresh() {
  return prepareLocalPlaySave(createPlayerDefaults());
}

export let S = fresh();

const oldIslandItem = p => ['yard_slab', 'yard_stairs'].includes(p.id) || (p.level ?? 0) > 0;
const buildBounds = (x, z) => x >= 0 && z >= 0 && x < BUILD_LOT.cols && z < BUILD_LOT.rows;
const buildLayoutValid = placed => validateYardLayout(placed, DECO, { zone: 'build', freeBuild: true, inBounds: buildBounds }).ok;

// 连在一起的旧建筑整体平移，避免迁移时拆散楼梯、楼板及楼上的家具。
function legacyBuildingGroups(placed) {
  const boxes = placed.map(p => yardFootprint(p, DECO)), parents = placed.map((_, i) => i);
  const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
    const a = boxes[i], b = boxes[j];
    if (a && b && a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0) parents[root(i)] = root(j);
  }
  const groups = new Map();
  placed.forEach((p, i) => { const key = root(i); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
  return [...groups.values()];
}

function migratedBuilding(placed, existing, dx, dz) {
  const result = placed.map(p => ({ ...p, gx: p.gx + dx, gz: p.gz + dz, rot: p.rot ?? 0, ...(p.id === 'yard_slab' ? { level: (p.level ?? 0) + 1 } : {}) }));
  // 旧楼板原先是一整块实体基座。转换为薄楼面时补足同格的柱链，
  // 这些柱直接成为建筑的一部分，不向仓库重复赠送材料。
  const columns = new Set([...existing, ...result].filter(p => p.id === 'yard_column').map(p => `${p.gx},${p.gz},${p.level ?? 0}`));
  for (const p of result.slice()) if (p.id === 'yard_slab') {
    const f = yardFootprint(p, DECO);
    for (let x = f.x0; x < f.x1; x++) for (let z = f.z0; z < f.z1; z++) for (let level = 0; level < p.level; level++) {
      const key = `${x},${z},${level}`;
      if (!columns.has(key)) { result.push({ id: 'yard_column', gx: x, gz: z, rot: 0, level }); columns.add(key); }
    }
  }
  return result;
}

function fitLegacyBuildings(placed, existing = []) {
  const result = [...existing], returned = [];
  // 极端旧布局也有确定的工作上限；放不下的原件保留归档并回仓。
  let attempts = 4096;
  for (const group of legacyBuildingGroups(placed)) {
    const boxes = group.map(p => yardFootprint(p, DECO));
    const minX = Math.min(...boxes.map(f => f.x0)), maxX = Math.max(...boxes.map(f => f.x1));
    const minZ = Math.min(...boxes.map(f => f.z0)), maxZ = Math.max(...boxes.map(f => f.z1));
    const width = maxX - minX, depth = maxZ - minZ;
    const preferredX = Math.max(-minX, Math.min(0, BUILD_LOT.cols - maxX));
    const preferredZ = Math.max(-minZ, Math.min(0, BUILD_LOT.rows - maxZ));
    const shifts = [];
    if (width <= BUILD_LOT.cols && depth <= BUILD_LOT.rows) {
      for (let z = -minZ; z <= BUILD_LOT.rows - maxZ; z++) for (let x = -minX; x <= BUILD_LOT.cols - maxX; x++) shifts.push({ x, z, distance: Math.abs(x - preferredX) + Math.abs(z - preferredZ) });
      shifts.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
    }
    let moved = false;
    for (const { x, z } of shifts) {
      if (attempts-- <= 0) break;
      const converted = migratedBuilding(group, result, x, z), full = [...result, ...converted];
      // 老版平台上可能摆过普通室内家具。新岛要求封闭房间时，
      // 仅收回不适用的家具，不能因此把相连的整栋楼也拆掉。
      const indoorReturns = new Set();
      group.forEach((p, i) => {
        if ((DECO[p.id].indoor === true || DECO[p.id].indoorOnly) && !isBuildInterior(full, DECO, converted[i])) indoorReturns.add(i);
      });
      const candidate = converted.filter((_, i) => !indoorReturns.has(i));
      if (!buildLayoutValid([...result, ...candidate])) continue;
      result.push(...candidate); returned.push(...group.filter((_, i) => indoorReturns.has(i))); moved = true; break;
    }
    if (!moved) returned.push(...group);
  }
  return { placed: result, returned };
}

function migrateBuildIsland(next, original) {
  next.buildPlaced = (next.buildPlaced || []).map(p => ({ ...p, rot: p.rot ?? 0 }));
  next.buildFloor = next.buildFloor || {};
  next.buildQuest = next.buildQuest || { version: 1, stage: 0, rewarded: false };
  const layouts = { ...(next.decorLayouts || {}) };
  layouts.build = Array.from({ length: 3 }, (_, i) => layouts.build?.[i] ?? null);
  next.decorLayouts = layouts;
  if (original.buildMigrationVersion === 1) return;
  const archive = [...(next.buildMigrationArchive || [])];
  const moving = next.placed.filter(oldIslandItem);
  if (moving.length) {
    const fitted = fitLegacyBuildings(moving, next.buildPlaced);
    next.placed = next.placed.filter(p => !oldIslandItem(p));
    next.buildPlaced = fitted.placed;
    if (fitted.returned.length) {
      next.decor = { ...next.decor };
      for (const p of fitted.returned) next.decor[p.id] = (next.decor[p.id] || 0) + 1;
      archive.push({ version: 1, source: 'placed', reason: '旧布局中不适用或无法完整安放的原件已回仓；原坐标保留用于恢复。', returned: true, placed: fitted.returned });
    }
  }
  if (Array.isArray(layouts.home)) layouts.home = layouts.home.map((layout, slot) => {
    if (!layout || !layout.placed.some(oldIslandItem)) return layout;
    const moving = layout.placed.filter(oldIslandItem);
    const target = layouts.build[slot] === null ? slot : layouts.build.findIndex(s => s === null);
    const fitted = target >= 0 ? fitLegacyBuildings(moving) : { placed: [], returned: moving };
    if (fitted.placed.length) layouts.build[target] = { version: 1, zone: 'build', name: layout.name, placed: fitted.placed, floor: {} };
    if (fitted.returned.length) archive.push({ version: 1, source: 'decorLayouts.home', slot, reason: target < 0 ? '建造岛的三个方案槽已满，旧方案原样归档。' : '旧方案部分构件无法完整安放，原方案保留用于恢复。', layout });
    // 方案只记录摆法，不代表库存；迁移方案不能凭空返还家具。
    return { ...layout, placed: layout.placed.filter(p => !oldIslandItem(p)) };
  });
  if (archive.length) next.buildMigrationArchive = archive;
  next.buildMigrationVersion = 1;
}

// 早期建造岛允许 level 3/4 的可居住楼面。现在最高为三楼，
// 优先下移可用原屋顶封顶，再收回超高构件及无法保留的室内家具。
// 完整原布局另存归档；方案不产库存，旧v1补顶只能取用仍有的返还库存。
function migrateBuildHeight(next, original) {
  if (original.buildHeightVersion === 2) return;
  const tooHigh = p => (p.level ?? 0) > (
    isBuildRoof(p.id) ? MAX_BUILD_LEVEL
      : p.id === 'yard_stairs' ? MAX_BUILD_FLOOR - 1 : MAX_BUILD_FLOOR);
  const copy = value => JSON.parse(JSON.stringify(value));
  const roof = p => isBuildRoof(p.id);
  const indoor = p => DECO[p.id]?.indoor === true || DECO[p.id]?.indoorOnly;
  const identity = p => `${p.id}:${p.gx},${p.gz},${p.level ?? 0},${p.rot ?? 0}`;
  // 降顶期间先检查支撑、重叠和梯井。全部可用屋顶就位后再检查室内围合。
  const geometryDefs = Object.fromEntries(Object.entries(DECO).map(([id, def]) => [id,
    def.indoor === true || def.indoorOnly ? { ...def, indoor: false, indoorOnly: false } : def]));
  const archive = (next.buildHeightArchive || []).map(entry => ({ ...entry }));
  const repairV1 = original.buildHeightVersion === 1;
  next.decor = { ...next.decor };
  const settle = (placed, prior, actual) => {
    const high = new Set(placed.filter(tooHigh));
    let kept = placed.filter(p => !high.has(p));
    const blocked = new Set(buildStairObstructions(kept, DECO).map(hit => hit.stairs));
    kept = kept.filter(p => !blocked.has(p));
    const originalPlaced = prior?.placed || prior?.layout?.placed;
    const originalValid = Array.isArray(originalPlaced) && validateYardLayout(originalPlaced, DECO,
      { zone: 'build', legacyHeight: true, freeBuild: true, inBounds: buildBounds }).ok;
    const known = new Set(originalValid ? originalPlaced.map(identity) : []);
    const returnedBefore = new Set((prior?.removed || []).map(identity));
    const beforeEnclosed = buildInteriorChecker(kept, DECO);
    const needsRepair = kept.some(p => indoor(p) && known.has(identity(p)) && !beforeEnclosed(p));
    // 已经合法的旧版本布局可能经过玩家重新装修，不从归档擅自补建。
    const candidates = (repairV1 ? originalValid && needsRepair ? originalPlaced : [] : placed)
      .filter(p => roof(p) && tooHigh(p) && (!repairV1 || !actual || returnedBefore.has(identity(p))));
    const moved = [], consumed = new Set();
    // 远端屋顶可能依赖稍后出现的相邻板块；反复尝试到没有新连接为止。
    let progress = true;
    while (progress) {
      progress = false;
      for (const from of candidates) {
        if (consumed.has(from) || repairV1 && actual && !(next.decor[from.id] > 0)) continue;
        const to = { ...from, level: MAX_BUILD_LEVEL };
        if (!validateYardLayout([...kept, to], geometryDefs, { zone: 'build', freeBuild: true, inBounds: buildBounds }).ok) continue;
        kept.push(to); consumed.add(from); moved.push({ from: copy(from), to: copy(to) }); progress = true;
        if (repairV1 && actual) { next.decor[from.id]--; if (!next.decor[from.id]) delete next.decor[from.id]; }
      }
    }
    const enclosed = buildInteriorChecker(kept, DECO);
    const interiorReturned = kept.filter(p => indoor(p) && !enclosed(p) && (!repairV1 || known.has(identity(p))));
    const removed = [...high].filter(p => !consumed.has(p)).concat([...blocked], interiorReturned);
    const returnedSet = new Set(interiorReturned);
    kept = kept.filter(p => !returnedSet.has(p));
    if (actual) for (const p of removed) next.decor[p.id] = (next.decor[p.id] || 0) + 1;
    return { placed: kept, removed, moved, interiorReturned, blocked: blocked.size };
  };
  const priorActual = archive.find(entry => entry.source === 'buildPlaced');
  const beforePlaced = next.buildPlaced, result = settle(beforePlaced, priorActual, true);
  next.buildPlaced = result.placed;
  if (result.removed.length || result.moved.length) {
    if (repairV1 && priorActual) Object.assign(priorActual, { repairVersion: 2, blockedStairs: (priorActual.blockedStairs || 0) + result.blocked, recoveredRoofs: result.moved, returnedAfterRepair: copy(result.removed) });
    else archive.push({ version: 1, source: 'buildPlaced', reason: '调整为最多三楼；能合法封顶的原屋顶已下移，超高构件、封堵楼梯及仍失去围合的室内家具已回仓。', returned: true,
      blockedStairs: result.blocked, placed: copy(beforePlaced), floor: { ...next.buildFloor }, removed: copy(result.removed), loweredRoofs: result.moved });
  }
  next.decorLayouts.build = next.decorLayouts.build.map((layout, slot) => {
    if (!layout) return layout;
    const prior = archive.find(entry => entry.source === 'decorLayouts.build' && entry.slot === slot);
    const result = settle(layout.placed, prior, false);
    if (!result.removed.length && !result.moved.length) return layout;
    if (repairV1 && prior) Object.assign(prior, { repairVersion: 2, blockedStairs: (prior.blockedStairs || 0) + result.blocked, recoveredRoofs: result.moved, removedAfterRepair: copy(result.removed) });
    else archive.push({ version: 1, source: 'decorLayouts.build', slot, reason: '原方案已完整归档；优先下移合法屋顶封顶，无法保留的构件和室内家具从方案移除，不改变库存。',
      blockedStairs: result.blocked, layout: copy(layout), loweredRoofs: result.moved, removed: copy(result.removed) });
    return { ...layout, placed: result.placed };
  });
  if (archive.length) next.buildHeightArchive = archive;
  next.buildHeightVersion = 2;
}

// 无副作用迁移：导入预览和正常启动使用同一套规则，预览不会改当前存档。
function migrateSave(d) {
  d = prepareCompatibleSave(d);
  d = { ...d }; delete d[CLOUD_BASE_FIELD]; // 手动导入/云档不能携带另一设备的同步祖先。
  const f = fresh();
  const next = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, shops: { ...f.shops, ...(d.shops || {}) }, outfit: { ...f.outfit, ...(d.outfit || {}) } };
  next.settings = normalizeGraphicsSettings(next.settings);
  for (const [id, defaults] of Object.entries(f.shops)) next.shops[id] = { ...defaults, ...(next.shops[id] || {}) };
  next.owned = [...new Set([...next.owned.filter((id) => CLOTH[id]), ...f.owned])];
  next.momoCloak = normalizeMomoCloak(next.momoCloak);
  next.momoOwned = normalizeMomoOwned(d.momoOwned, next.momoCloak, !Object.hasOwn(d, 'momoOwned'));
  if (!next.momoOwned.includes(next.momoCloak)) next.momoCloak = 'classic';
  for (const k of Object.keys(f.outfit)) if (!CLOTH[next.outfit[k]] || !next.owned.includes(next.outfit[k])) next.outfit[k] = f.outfit[k];
  next.placed = next.placed.filter((p) => DECO[p.id]).map((p) => ({ ...p, rot: p.rot ?? 0 }));
  if ((d.v || 1) < 2) {
    // 旧版家园在小镇里，格子对不上：把家具全部收回仓库，换到新岛后重新摆
    for (const p of next.placed) next.decor[p.id] = (next.decor[p.id] || 0) + 1;
    next.placed = [];
    delete next.floor;
    next.v = 2;
  }
  if ((d.v || 1) < 3) {
    // 田地改为可自由摆放的摆件：把原来的田和田里的作物搬过来
    const old = Array.isArray(d.plots) ? d.plots : [];
    next.farm = {};
    for (let i = 0; i < Math.max(6, old.length); i++) {
      const e = plotAt(i);
      next.placed.push(e);
      if (old[i]) next.farm[e.gx + ',' + e.gz] = old[i];
    }
    // 初始套装换成「满分出发」
    for (const [k, was] of [['hair', 'h_far'], ['dress', 'd_far'], ['shoes', 's_far']]) if (next.outfit[k] === was) next.outfit[k] = f.outfit[k];
    next.v = 3;
  }
  delete next.plots;
  next.farm = next.farm || {};
  // 教程现在保存完成版本。旧布尔已读兼容为0/1，损坏的单项不影响其余游戏进度。
  const tutorialHistory = next.tut && typeof next.tut === 'object' && !Array.isArray(next.tut) ? next.tut : {};
  next.tut = Object.fromEntries(Object.entries(tutorialHistory).flatMap(([id, value]) => {
    const version = typeof value === 'boolean' ? Number(value) : value;
    return Number.isSafeInteger(version) && version >= 0 ? [[id, version]] : [];
  }));
  const seen=next.settings.tutorialSeen;
  next.settings.tutorialSeen=Object.fromEntries(Object.entries(seen&&typeof seen==='object'&&!Array.isArray(seen)?seen:{}).filter(([,version])=>Number.isSafeInteger(version)&&version>=0));
  next.settings.autoTutorials=next.settings.autoTutorials!==false;
  next.placedIn = (next.placedIn || []).filter((p) => DECO[p.id]).map((p) => ({ ...p, rot: p.rot ?? 0 }));
  next.wallsIn = next.wallsIn || [];
  next.ach = next.ach || {};
  next.npc = next.npc || {};
  // 新系统逐层补默认值：兼容没有 live 的旧档，也保留已领取的奖励与进度
  next.seeds = next.seeds || {};
  next.work = next.work || {};
  // 上次是在店里直接关掉游戏的：把上班前那身换回来
  if (next.workPrev) { for (const k of Object.keys(f.outfit)) if (CLOTH[next.workPrev[k]] && next.owned.includes(next.workPrev[k])) next.outfit[k] = next.workPrev[k]; next.workPrev = null; }
  next.live = { ...f.live, ...(next.live || {}) };
  for (const k of ['sign', 'book', 'project', 'visit', 'story', 'storyClaimed', 'residents', 'canon', 'fun', 'granted', 'photo', 'nonoy']) next.live[k] = { ...f.live[k], ...(next.live[k] || {}) };
  for (const k of Object.keys(f.live.book)) next.live.book[k] = next.live.book[k] || {};
  next.live.daily = Array.isArray(next.live.daily) ? next.live.daily.map((t) => ({ base: 0, prog: 0, claimed: false, ...t })) : [];
  next.live.miles = Array.isArray(next.live.miles) ? next.live.miles : [];
  next.live.nonoy.got = Array.isArray(next.live.nonoy.got) ? next.live.nonoy.got : [];
  next.live.photo.poses = [...new Set((Array.isArray(next.live.photo.poses) ? next.live.photo.poses : []).filter(id => PAID_PHOTO_POSE_IDS.includes(id)))];
  next.live.canon.met = next.live.canon.met || {}; next.live.fun.used = next.live.fun.used || {};
  for (const k of ['base', 'tasks', 'album']) next.live.residents[k] = next.live.residents[k] || {};
  for (const k of ['reviews', 'poems']) next.live.residents[k] = Array.isArray(next.live.residents[k]) ? next.live.residents[k] : [];
  // 扩建系统上线前的老存档：按已经摆出去的最远位置给对应的院子等级，不让任何摆件落到围栏外
  if (!d.yardLv) {
    next.yardLv = 1;
    for (const p of next.placed) {
      const [w, dd] = DECO[p.id].size, x = p.gx + Math.max(w, dd) - 1, z = p.gz + Math.max(w, dd) - 1;
      while (next.yardLv < YARDS.length && (x > YARDS[next.yardLv - 1].x1 || z > YARDS[next.yardLv - 1].z1)) next.yardLv++;
    }
  }
  // 老存档里可能已经打过很多次工：把能从现有数据推出来的统计补上，成就静默结算一次
  if (!d.ach) {
    const st = next.stats;
    st.plays = st.plays || Object.values(next.shops).reduce((n, x) => n + (x.plays || 0), 0);
    for (const a of ACHS) if (!next.ach[a.id] && getStat(a.stat, next) >= a.need) next.ach[a.id] = 1;
  }
  migrateBuildIsland(next, d);
  migrateBuildHeight(next, d);
  return prepareLocalPlaySave(next);
}

export function load() {
  try {
    // 首次试玩复制原档，原键不写入；之后始终继续独立的试玩进度。
    const raw = localStorage.getItem(KEY) || (LOCAL_PLAY ? localStorage.getItem(ORIGINAL_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw);
      const next = migrateSave(parsed);
      cloudSaveBase = !LOCAL_PLAY && parsed[CLOUD_BASE_FIELD] && typeof parsed[CLOUD_BASE_FIELD] === 'object' ? { ...parsed[CLOUD_BASE_FIELD] } : null;
      S = next;
      save();
      return true;
    }
  } catch (e) {
    clearTimeout(saveTimer);
    cloudSaveBase = null;
    S = fresh();
  }
  return false;
}

// 云同步使用的纯数据快照。这里沿用本地导入的迁移与校验规则，避免云端回来的旧档
// 绕过现有兼容逻辑；返回深拷贝，调用方修改它不会碰到正在运行的游戏状态。
export function serializeState() {
  const data = JSON.parse(JSON.stringify(S));
  return validateSaveData(data);
}

// 统一外部存档的当前形状，供云同步在比较前迁移旧版本字段。
// 如果直接把本机已迁移的数据和云端原始数据做 JSON 字符串比较，
// 选择云端并刷新后会把同一份存档误判成再次冲突。
export function normalizeSaveData(data) {
  const compatible = validateSaveData(data, { allowLegacyBuilding: true });
  const next = migrateSave(JSON.parse(JSON.stringify(compatible)));
  return validateSaveData(next);
}

export function replaceSaveData(data, base = null) {
  const next = normalizeSaveData(data);
  // 先持久化，写入失败时继续使用旧状态，不能刷新后丢失已经选择的进度。
  try { localStorage.setItem(KEY, localSaveText(next, base)); }
  catch { throw new Error('设备存储空间不足，未替换当前进度。请释放空间后重试'); }
  clearTimeout(saveTimer);
  saveTimer = 0;
  cloudSaveBase = base ? { ...base } : null;
  S = next;
  bus.emit('stateReplaced');
  return S;
}

let saveTimer = 0;
// 只返回运行状态；不读取存档正文，也不暴露自定义 slot 的名称。
export function saveDiagnostics() {
  return { mode: LOCAL_PLAY ? 'local-play' : 'normal', slot: slot ? 'isolated' : 'default', pending: !!saveTimer };
}
export function save() {
  // 装修中的家具购买尚未结算；暂不把临时布局写入存档，避免关闭页面绕过最终扣款。
  // DecorSys 在完成/离开装修时清除该标记后会显式保存一次。
  if (globalThis.__nuannuanDecorTransaction) { diagnostics.saved('deferred'); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 200);
}
// 切后台/关闭页面时立即落盘；只更新主存档，保留五分钟前的可恢复备份。
export function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (globalThis.__nuannuanDecorTransaction) { diagnostics.saved('deferred'); return false; }
  try {
    const raw = localSaveText(S);
    localStorage.setItem(KEY, raw);
    diagnostics.saved('saved', raw);
    return true;
  } catch (e) { diagnostics.saved('error'); return false; }
}
// 自动存档：除了平时随手存的那一份，每 5 分钟另存一份备份，存档坏了或想反悔时可以读回来
const BAK = KEY + ':bak';
export function autosave() {
  if (globalThis.__nuannuanDecorTransaction) return false;
  try {
    S.savedAt = Date.now();
    const raw = localSaveText(S);
    localStorage.setItem(KEY, raw);
    localStorage.setItem(BAK, raw);
    return true;
  } catch (e) { return false; }
}
export function backupInfo() {
  try { const d = JSON.parse(localStorage.getItem(BAK) || 'null'); return d ? { at: d.savedAt || 0, coins: d.coins } : null; } catch (e) { return null; }
}
export function restoreBackup() {
  const previous = S, previousBase = cloudSaveBase;
  let previousRaw;
  try {
    const raw = localStorage.getItem(BAK);
    if (!raw) return false;
    previousRaw = localStorage.getItem(KEY);
    clearTimeout(saveTimer);
    localStorage.setItem(KEY, raw);
    // 重新载入内存，避免紧接着刷新时 pagehide 把恢复前的进度写回主档。
    if (load()) return true;
    S = previous; cloudSaveBase = previousBase;
    if (previousRaw === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, previousRaw);
    return false;
  } catch (e) { S = previous; cloudSaveBase = previousBase; return false; }
}

// 文件迁移的恢复点独立于五分钟备份；自动保存不会覆盖它。
const BEFORE_IMPORT = KEY + ':before-import';
const saveSummary = (data) => ({
  coins: data.coins, gday: data.gday || 0, house: data.house, yardLv: data.yardLv,
  shops: Object.fromEntries(Object.entries(data.shops).map(([id, s]) => [id, { lv: s.lv, stage: s.stage || 0, plays: s.plays || 0 }])),
});
export function exportSaveFile(now = Date.now()) {
  const data = serializeState();
  const at = new Date(now), pad = (n) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  const file = { format: SAVE_FILE_FORMAT, formatVersion: SAVE_FILE_VERSION, exportedAt: at.toISOString(), data };
  let text = JSON.stringify(file, null, 2);
  // 长期进度较多时去掉缩进，保证自己导出的文件也满足导入大小限制。
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) text = JSON.stringify(file);
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('当前存档超过 2 MB，暂时无法导出为可迁移文件。');
  // 纯文本承载 JSON，避免手机端把存档当作网页/脚本文件处理；旧 .json 文件仍由 parseSaveFile 兼容。
  return { filename: `暖暖小镇-存档-${stamp}.txt`, text };
}
export function previewSaveImport(text) {
  const parsed = parseSaveFile(text), data = validateSaveData(migrateSave(parsed.data));
  return { summary: saveSummary(data), exportedAt: parsed.exportedAt, oldVersion: parsed.oldVersion, migrated: parsed.oldVersion < data.v };
}
export function importSaveFile(text) {
  try {
    // 再次解析，提交不相信可被外部改写的预览对象；此时仍未触碰 S 或存储。
    const data = validateSaveData(migrateSave(parseSaveFile(text).data));
    const incoming = JSON.stringify(data);
    const previousRecovery = localStorage.getItem(BEFORE_IMPORT);
    // 使用同一导出校验，避免当前档过大/异常时留下无法恢复的“恢复点”。
    const recovery = exportSaveFile().text;
    localStorage.setItem(BEFORE_IMPORT, recovery); // 先成功保护最新内存进度，才允许替换主档。
    try {
      localStorage.setItem(KEY, incoming); // 浏览器 setItem 对单个键是原子的。
    } catch (error) {
      // 主档写入失败时 S 未变；尽量恢复此前恢复点。恢复点写入失败也不会碰主档。
      try { if (previousRecovery === null) localStorage.removeItem(BEFORE_IMPORT); else localStorage.setItem(BEFORE_IMPORT, previousRecovery); } catch { /* 保留刚写好的当前进度恢复点 */ }
      throw error;
    }
    clearTimeout(saveTimer); saveTimer = 0;
    cloudSaveBase = null;
    S = data; // 同步切换，紧接着 reload 的 pagehide 不会把导入前内存写回去。
    return { ok: true, summary: saveSummary(data) };
  } catch (error) {
    return { ok: false, error: error?.name === 'QuotaExceededError' ? '设备存储空间不足，导入未完成，当前进度未改变。请先导出留存后再清理空间。' : `导入未完成，当前进度未改变。${error.message || '请检查文件或设备存储权限。'}` };
  }
}
export function importRecoveryInfo() {
  try {
    const raw = localStorage.getItem(BEFORE_IMPORT);
    if (!raw) return null;
    const parsed = parseSaveFile(raw), data = validateSaveData(migrateSave(parsed.data));
    return { ...saveSummary(data), at: parsed.exportedAt };
  } catch { return { invalid: true }; }
}
export function restoreBeforeImport() {
  try {
    const raw = localStorage.getItem(BEFORE_IMPORT);
    if (!raw) return { ok: false, error: '还没有导入前恢复点。' };
    const data = validateSaveData(migrateSave(parseSaveFile(raw).data));
    localStorage.setItem(KEY, JSON.stringify(data));
    clearTimeout(saveTimer); saveTimer = 0;
    cloudSaveBase = null;
    S = data;
    return { ok: true, summary: saveSummary(data) };
  } catch (error) { return { ok: false, error: `恢复未完成，当前进度未改变。${error.message || '请检查设备存储权限。'}` }; }
}
export function resetSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  cloudSaveBase = null;
  S = fresh();
  if (LOCAL_PLAY) flushSave(); // 避免刷新时再次复制旧的正常档。
  bus.emit('reset');
}
export const hasSave = () => {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
};

export function addCoins(n, from) {
  if (!n) return;
  S.coins += Math.round(n);
  S.stats.earned = (S.stats.earned || 0) + Math.round(n);
  bus.emit('coins', S.coins, Math.round(n), from);
  checkAch();
  save();
}
export function spend(n) {
  if (LOCAL_PLAY) return true;
  if (S.coins < n) {
    bus.emit('poor', n - S.coins);
    return false;
  }
  S.coins -= n;
  bus.emit('coins', S.coins, -n);
  save();
  return true;
}

export function activeRoomSets(state = S) {
  const inIds = new Set([...(state.placedIn || []), ...(state.buildPlaced || [])].map((p) => p.id));
  return ROOM_SETS.filter((set) => set.items.every((id) => inIds.has(id)));
}

export function beauty(state = S) {
  let b = HOUSES[state.house - 1].beauty + YARDS[(state.yardLv || 1) - 1].beauty;
  for (const p of state.placed) b += DECO[p.id].beauty;
  for (const p of state.placedIn || []) b += DECO[p.id].beauty;
  for (const p of state.buildPlaced || []) b += DECO[p.id].beauty;
  for (const set of activeRoomSets(state)) b += set.bonus;
  return b;
}

export function getStat(key, state = S) {
  if (key === 'beauty') return beauty(state);
  if (key === 'wardrobe') return state.owned.filter((id) => CLOTH[id].price > 0).length + 3;
  if (key === 'house') return state.house;
  if (key === 'yard') return state.yardLv || 1;
  if (key === 'quest') return state.quest;
  if (key === 'req_people') return NPCS.filter((n) => state.req && state.req[n.id] && state.req[n.id].done > 0).length;
  if (key === 'met') return NPCS.filter((n) => state.npc[n.id] && state.npc[n.id].t > 0).length;
  if (key === 'friends') return NPCS.filter((n) => state.npc[n.id] && state.npc[n.id].t >= FRIEND_AT).length;
  if (key === 'shopmax') return Object.values(state.shops).filter((x) => x.lv >= 5).length;
  if (key === 'shops_played') return Object.values(state.shops).filter((x) => x.plays > 0).length;
  if (key === 'shops_star3') return Object.keys(state.shops).filter((id) => state.stats['star3_' + id]).length;
  return state.stats[key] || 0;
}
export const FRIEND_AT = 8; // 和一位居民聊满这么多次就成为好朋友
export function stat(key, inc = 1) {
  bus.emit('beforeStat', key);
  S.stats[key] = (S.stats[key] || 0) + inc;
  checkQuest();
  checkAch();
  save();
}

// ——— 成就 ———（S.ach[id]：1 = 已达成待领取，2 = 已领取）
export function checkAch(silent) {
  for (const a of ACHS) {
    if (S.ach[a.id] || getStat(a.stat) < a.need) continue;
    S.ach[a.id] = 1;
    if (!silent) bus.emit('ach', a);
  }
}
export const achPending = () => ACHS.filter((a) => S.ach[a.id] === 1).length;
export const achReward = (a) => Math.round(a.reward * (1 + outfitFx(S.outfit, 'star')));
export const shopUpgradePrice = (id) => Math.round((SHOPS[id].upgrade[S.shops[id].lv - 1] || 0) * (1 - outfitFx(S.outfit, 'charge')));
export const cropSellPrice = (id, hot) => Math.round(CROP[id].sell * (hot ? 1.5 : 1) * (1 + outfitFx(S.outfit, 'dust')) * (1 + cropFestivalBonusForDay(S.gday || 0)));
// 巨大作物是种植稀有掉落：回收价固定为对应普通作物售价的 20 倍，
// 不走家具半价公式，避免仓库摆件价格和收获价值不一致。
export const decorSellPrice = (id) => {
  const d = DECO[id];
  if (d?.giantCrop) return Math.round((CROP[d.cropId]?.sell || 0) * 20);
  return Math.round(d.price / 2 * (1 + outfitFx(S.outfit, 'dust')));
};
export function claimAch(id) {
  const a = ACHS.find((x) => x.id === id);
  if (!a || S.ach[id] !== 1) return 0;
  S.ach[id] = 2;
  const reward = achReward(a);
  addCoins(reward, 'ach');
  save();
  return reward;
}
export function currentQuest() {
  const q = QUESTS[S.quest];
  if (!q) return null;
  return { ...q, cur: Math.min(q.need, getStat(q.stat)) };
}
export function checkQuest() {
  let guard = 0;
  while (guard++ < 20) {
    const q = QUESTS[S.quest];
    if (!q || getStat(q.stat) < q.need) break;
    S.quest++;
    bus.emit('questDone', q);
    addCoins(q.reward, 'quest');
  }
  bus.emit('quest', currentQuest());
}

// 穿搭加成：每件与店铺风格相符的服饰 +6%
export function styleBonus(shopId, outfit = S.outfit) {
  const style = SHOPS[shopId].style;
  let n = 0;
  for (const id of Object.values(outfit)) if (CLOTH[id] && CLOTH[id].style === style) n++;
  return { n, pct: n * 6, style: STYLES[style] };
}
