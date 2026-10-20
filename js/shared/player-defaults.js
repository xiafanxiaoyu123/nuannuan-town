// 玩家新档默认数据。每次调用返回独立对象；不读写存储，不创建运行时单例。
import { CLOTHES, DEFAULT_OUTFIT } from './clothing.js';
import { RESIDENTS as NPCS } from '../live/people.js';
import { normalizeGraphicsSettings } from '../core/graphics-settings.js';
import { createHomestead } from './homestead.js';
export const createStartingPlot = (i) => ({ id: 'plot', gx: 3 + (i % 4) * 2, gz: 9 + Math.floor(i / 4) * 2, rot: 0 });

export function createPlayerDefaults() {
  return {
    v: 3,
    coins: 200,
    tut: {},
    started: false,
    owned: CLOTHES.filter((c) => c.price === 0).map((c) => c.id),
    outfit: { ...DEFAULT_OUTFIT },
    momoCloak: 'classic',
    momoOwned: ['classic'],
    crops: {},
    homestead: createHomestead({}, 0),
    seeds: {}, // 签到赠送的免费种子，播种时优先消耗
    gday: 0, // 小镇日历：已经过了多少个小镇日
    work: {}, // 上班方案：每家店一套预设穿搭；没有记录 = 不自动切换
    workPrev: null, // 上班前身上那套，打烊后换回来
    decor: {},
    live: {
      day: '', daily: [], chest: false,
      sign: { last: '', streak: 0 },
      book: { fish: {}, crop: {}, set: {}, npc: {}, flower: {}, claimed: {} },
      miles: [],
      project: { phase: 0, paid: 0 },
      visit: { day: '', npc: '', claimed: false, beauty: 0 },
      story: Object.fromEntries(NPCS.map((n) => [n.id, 0])),
      storyClaimed: {},
      residents: { day: '', base: {}, tasks: {}, reviews: [], album: {}, poems: [], performed: '' },
      canon: { dada: null, met: {} }, // 原作角色来访（非官方小镇日常）的独立账本
      fun: { day: '', used: {}, capsule: 0 }, // 小镇里的互动小物件
      granted: {}, // 已经补发过的实物奖励
      photo: { camera: false, stick: false, tripod: false, shots: 0, poses: [] }, // 莱拉的相机、配件与已购买姿势
      nonoy: { love: 0, last: '', got: [] }, // 和诺诺伊的亲密度（按现实日期每天一次）
    },
    placed: Array.from({ length: 6 }, (_, i) => createStartingPlot(i)),
    placedIn: [],
    wallsIn: [], // 最高级房屋的自由隔断；家具与地板坐标不因扩建迁移。
    buildPlaced: [],
    buildFloor: {},
    decorLayouts: { build: [null, null, null] },
    buildQuest: { version: 1, stage: 0, rewarded: false },
    buildMigrationVersion: 1,
    buildHeightVersion: 2,
    farm: {},
    seed: 'radish',
    house: 1,
    yardLv: 1,
    ach: {},
    npc: {},
    req: {},
    shops: { cafe: { lv: 1, best: 0, plays: 0 }, flower: { lv: 1, best: 0, plays: 0 }, tailor: { lv: 1, best: 0, plays: 0 }, fish: { lv: 1, best: 0, plays: 0 }, bakery: { lv: 1, best: 0, plays: 0 } },
    stats: {},
    quest: 0,
    clock: 0.22,
    settings: normalizeGraphicsSettings({ music: 0.6, sfx: 0.8, quality: 'high' }),
  };
}
