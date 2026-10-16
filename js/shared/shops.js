// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
// ——— 店铺（小游戏）———
export const SHOPS = {
  cafe: {
    id: 'cafe', name: '甜心咖啡屋', style: 'sweet', color: '#ff9fbd',
    tagline: '记住每位客人的口味，在耐心耗尽前把甜点端上桌。',
    how: ['甜点会自动补货，点一下放进托盘', '点击客人或气泡上菜（Q / W / E）', '备货有限，别让热门甜点断货'],
    upgrade: [600, 1500, 3200, 6000],
  },
  flower: {
    id: 'flower', name: '花语小筑', style: 'fresh', color: '#8fd9a8',
    tagline: '点花种篮长出嫩芽，两两合成升级，再把客人点的花交到他们手里。',
    how: ['点「花种篮」（或空格）长出嫩芽', '把两个相同的拖到一起合成升级', '把花拖给客人，或点客人的气泡交付'],
    upgrade: [600, 1500, 3200, 6000],
  },
  tailor: {
    id: 'tailor', name: '星梦裁缝铺', style: 'elegant', color: '#b9a4f2',
    tagline: '跟着节拍踩下缝纫机，纽扣滑到针下的瞬间就是最佳时机。',
    how: ['四列从左到右按 D / F / J / K，也可按 ← / ↓ / ↑ / →', '手机点对应布料列或下方纽扣，长针脚持续按住', '纽扣落到下方判定线时按下，踩准节拍获得 Perfect'],
    upgrade: [600, 1500, 3200, 6000],
  },
};
SHOPS.fish = {
  id: 'fish', name: '悠然钓场', style: 'cool', color: '#7fc4f5',
  tagline: '甩竿、等浮漂下沉、再和鱼儿较劲——把鱼稳稳留在绿色收线条里。',
  how: ['浮漂冒出「!」时立刻按住（空格 / 鼠标）', '按住让收线条上升，松开下落', '让鱼一直待在绿条里，蓄满进度就钓上来了'],
  upgrade: [600, 1500, 3200, 6000],
};
export const SHOP_MAX_LV = 5;
// 关卡模式：每家店 12 关，目标随关卡提高（第 1 关是基础目标的七成，第 12 关约 1.7 倍）
export const MAX_STAGE = 12;
export const stageScale = (stage) => 0.7 + (stage - 1) * 0.09;
export const shopMult = (lv) => 1 + (lv - 1) * 0.28;

