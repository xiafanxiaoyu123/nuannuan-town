import { CLOTHES, CROP, FRUIT, HOUSES, YARDS, TUTORIALS, SHOP_MAX_LV, MAX_STAGE } from '../data.js';
import { BEAUTY_REWARDS, PROJECT } from '../live/data.js';
import { MOMO_CLOAK_IDS } from '../models/momo-cloaks.js';
import { PAID_PHOTO_POSE_IDS } from '../live/photo-poses.js';
import { LOCAL_PLAY } from './local-play-mode.js';

// 只用于隔离的试玩档。保留布局和穿搭，开放内容，不替玩家完成剧情记录。
export function prepareLocalPlaySave(data) {
  if (!LOCAL_PLAY) return data;
  data.coins = Math.max(data.coins, 1000000000);
  data.owned = [...new Set([...data.owned, ...CLOTHES.map(c => c.id)])];
  data.momoOwned = [...MOMO_CLOAK_IDS];
  data.house = HOUSES.length;
  data.yardLv = YARDS.length;
  data.buildQuest = { version: 1, stage: 3, rewarded: true };
  for (const shop of Object.values(data.shops)) { shop.lv = SHOP_MAX_LV; shop.stage = MAX_STAGE - 1; }
  data.live.project = { phase: PROJECT.phases.length, paid: 0 };
  data.live.miles = BEAUTY_REWARDS.map((_, i) => i);
  Object.assign(data.live.photo, { camera: true, stick: true, tripod: true, poses: [...PAID_PHOTO_POSE_IDS] });
  for (const id of [...Object.keys(CROP), ...Object.keys(FRUIT)]) data.crops[id] = Math.max(data.crops[id] || 0, 9999);
  for (const [id, tutorial] of Object.entries(TUTORIALS)) data.tut[id] = tutorial.version || 1;
  data.cheat = true;
  return data;
}
