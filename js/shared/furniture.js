// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
import { CROPS } from './farming.js';
// ——— 家具 / 家园装饰 ———（size: 占地格数 [宽, 深]）
export const DECOR = [
  { id: 'fence', name: '白色栅栏', price: 45, beauty: 3, size: [1, 1] },
  { id: 'pot', name: '雏菊花盆', price: 80, beauty: 6, size: [1, 1] },
  { id: 'tulips', name: '郁金香花坛', price: 140, beauty: 10, size: [1, 1] },
  { id: 'mushroom', name: '蘑菇小夜灯', price: 180, beauty: 12, size: [1, 1] },
  { id: 'mailbox', name: '爱心邮箱', price: 220, beauty: 14, size: [1, 1] },
  { id: 'lamp', name: '花园路灯', price: 260, beauty: 16, size: [1, 1] },
  { id: 'pinwheel', name: '彩虹风车', price: 300, beauty: 18, size: [1, 1] },
  { id: 'birdhouse', name: '小鸟屋', price: 340, beauty: 20, size: [1, 1] },
  { id: 'bench', name: '双人长椅', price: 380, beauty: 22, size: [2, 1] },
  { id: 'tree', name: '圆圆树', price: 420, beauty: 24, size: [1, 1] },
  { id: 'catstatue', name: '大喵雕像', price: 600, beauty: 34, size: [1, 1] },
  { id: 'picnic', name: '野餐垫', price: 680, beauty: 36, size: [2, 2] },
  { id: 'sakura', name: '樱花树', price: 900, beauty: 48, size: [2, 2] },
  { id: 'arch', name: '玫瑰拱门', price: 1100, beauty: 56, size: [2, 1] },
  { id: 'swing', name: '花藤秋千', price: 1400, beauty: 70, size: [2, 1] },
  { id: 'teaset', name: '下午茶桌', price: 1600, beauty: 78, size: [2, 2] },
  { id: 'fountain', name: '许愿喷泉', price: 2600, beauty: 120, size: [2, 2] },
  { id: 'carousel', name: '旋转木马', price: 5200, beauty: 240, size: [3, 3] },
  { id: 'hammock', name: '花边吊床', price: 520, beauty: 32, size: [2, 1] },
  { id: 'pond', name: '荷叶小池', price: 900, beauty: 60, size: [2, 2], flat: true },
  { id: 'garden_table', name: '藤编花园桌', price: 1100, beauty: 72, size: [2, 2] },
  { id: 'yard_slab', name: '工坊木纹楼板', price: 120, beauty: 8, size: [2, 2], outdoorOnly: true, building: 'slab', category: 'foundation' },
  { id: 'yard_stairs', name: '奶油木阶梯', price: 280, beauty: 18, size: [2, 3], outdoorOnly: true, building: 'stairs', category: 'foundation' },
  { id: 'yard_foundation', name: '奶油石地基', price: 100, beauty: 6, size: [2, 2], outdoorOnly: true, building: 'foundation', category: 'foundation' },
  { id: 'yard_column', name: '落地承重柱', price: 90, beauty: 6, size: [1, 1], outdoorOnly: true, building: 'column', category: 'foundation' },
  { id: 'yard_wall', name: '奶油木框墙', price: 100, beauty: 10, size: [2, 1], outdoorOnly: true, building: 'wall', category: 'wall' },
  { id: 'yard_door', name: '拱形门洞', price: 140, beauty: 14, size: [2, 1], outdoorOnly: true, building: 'door', category: 'wall' },
  { id: 'yard_window', name: '海风玻璃窗墙', price: 160, beauty: 16, size: [2, 1], outdoorOnly: true, building: 'window', category: 'wall' },
  { id: 'yard_railing', name: '原木安全栏杆', price: 70, beauty: 6, size: [2, 1], outdoorOnly: true, building: 'railing', category: 'wall' },
  { id: 'yard_roof', name: '薄荷双坡尖顶', price: 130, beauty: 12, size: [2, 2], outdoorOnly: true, building: 'roof', category: 'roof' },
  { id: 'yard_roof_slope', name: '薄荷单坡屋顶', price: 130, beauty: 12, size: [2, 2], outdoorOnly: true, building: 'roof_slope', category: 'roof' },
  { id: 'yard_roof_corner_outer', name: '薄荷屋顶外转角', price: 130, beauty: 12, size: [2, 2], outdoorOnly: true, building: 'roof_corner_outer', category: 'roof' },
  { id: 'yard_roof_corner_inner', name: '薄荷屋顶内转角', price: 130, beauty: 12, size: [2, 2], outdoorOnly: true, building: 'roof_corner_inner', category: 'roof' },
  { id: 'yard_roof_flat', name: '奶油平屋顶', price: 110, beauty: 10, size: [2, 2], outdoorOnly: true, building: 'roof_flat', category: 'roof' },
];
// 田地也是后院的一种摆件：在装修里选它，想开垦在哪就摆在哪
DECOR.unshift({ id: 'plot', name: '田地', price: 120, beauty: 4, size: [2, 2], flat: true });
// 果树田（大田，种果树用）和自动喷水器（占 2×2，给紧挨着它的一圈田浇水）
DECOR.splice(1, 0,
  { id: 'bigplot', name: '果树田', price: 480, beauty: 8, size: [3, 3], flat: true },
  { id: 'sprinkler', name: '自动喷水器', price: 680, beauty: 6, size: [2, 2] });
// 美化度阶段奖励送的摆设（也能在装修里买）
DECOR.push(
  { id: 'momohut', name: '大喵的小窝', price: 800, beauty: 44, size: [1, 1] },
  { id: 'vane', name: '金鸡风向标', price: 1800, beauty: 90, size: [1, 1] },
  { id: 'goldfountain', name: '金色喷泉', price: 4200, beauty: 190, size: [2, 2] },
);
// 诺诺伊送的特有家具与玩偶（only：只送不卖，仓库里没有时不出现在装修列表）
DECOR.push(
  { id: 'n_lamp', name: '愿望瓶小夜灯', price: 600, beauty: 30, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_crane', name: '纸鹤玩偶', price: 700, beauty: 34, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_mobile', name: '纸鹤风铃', price: 800, beauty: 38, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_momo', name: '大喵玩偶', price: 900, beauty: 42, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_shelf', name: '齿轮工具架', price: 1000, beauty: 48, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_bean', name: '拼布懒人沙发', price: 1200, beauty: 56, size: [1, 1], indoor: true, only: 'nonoy' },
  { id: 'n_screen', name: '花格屏风', price: 1500, beauty: 70, size: [2, 1], indoor: true, only: 'nonoy' },
  { id: 'n_bench', name: '诺诺伊的工作台', price: 2000, beauty: 90, size: [2, 1], indoor: true, only: 'nonoy' },
);
// 室内家具（只能摆在屋里）
DECOR.push(
  { id: 'chair', name: '小椅子', price: 120, beauty: 8, size: [1, 1], indoor: true },
  { id: 'plant', name: '龟背竹', price: 160, beauty: 10, size: [1, 1], indoor: true },
  { id: 'floorlamp', name: '落地灯', price: 240, beauty: 14, size: [1, 1], indoor: true },
  { id: 'rug', name: '菱格地毯', price: 260, beauty: 16, size: [3, 2], indoor: true, flat: true, under: true }, // under：铺在地上的一层，上面还能再摆家具
  { id: 'coffee', name: '茶几', price: 320, beauty: 18, size: [2, 1], indoor: true },
  { id: 'catbed', name: '大喵的窝', price: 380, beauty: 22, size: [1, 1], indoor: true },
  { id: 'desk', name: '书桌', price: 420, beauty: 24, size: [2, 1], indoor: true },
  { id: 'bookshelf', name: '书架', price: 520, beauty: 30, size: [2, 1], indoor: true },
  { id: 'tv', name: '电视柜', price: 680, beauty: 36, size: [2, 1], indoor: true },
  { id: 'sofa', name: '奶油沙发', price: 700, beauty: 40, size: [3, 1], indoor: true },
  { id: 'vanity', name: '梳妆台', price: 760, beauty: 42, size: [2, 1], indoor: true },
  { id: 'dining', name: '双人餐桌', price: 880, beauty: 46, size: [2, 2], indoor: true },
  { id: 'bed', name: '梦幻小床', price: 900, beauty: 50, size: [2, 3], indoor: true },
  { id: 'fireplace', name: '壁炉', price: 1500, beauty: 80, size: [2, 1], indoor: true },
  { id: 'piano', name: '白色钢琴', price: 2400, beauty: 110, size: [2, 2], indoor: true },
  { id: 'windowseat', name: '云朵飘窗', price: 580, beauty: 30, size: [2, 1], indoor: true },
  { id: 'teacart', name: '花漾茶车', price: 640, beauty: 34, size: [1, 1], indoor: true },
  { id: 'musicbox', name: '星光八音盒', price: 760, beauty: 40, size: [1, 1], indoor: true },
  { id: 'wardrobe', name: '花漾衣柜', price: 820, beauty: 44, size: [2, 1], indoor: true },
  { id: 'ottoman', name: '云朵脚踏', price: 260, beauty: 16, size: [1, 1], indoor: true },
  { id: 'sideboard', name: '奶油餐边柜', price: 620, beauty: 32, size: [2, 1], indoor: true },
);
// 奶油薄荷厨房与粉瓷卫浴：整件为落地家具，仅能在室内摆放；上柜和镜柜自带支撑背板。
DECOR.push(
  { id: 'kitchen_counter', name: '奶油橱柜台面', price: 480, beauty: 26, size: [2, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_sink', name: '薄荷洗菜池', price: 680, beauty: 34, size: [2, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_stove', name: '奶油灶台烤箱', price: 780, beauty: 40, size: [1, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_fridge', name: '薄荷双门冰箱', price: 920, beauty: 48, size: [1, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_pantry', name: '奶油食品高柜', price: 640, beauty: 34, size: [1, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_hutch', name: '薄荷一体吊柜', price: 880, beauty: 46, size: [2, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_microwave', name: '奶油微波炉柜', price: 720, beauty: 38, size: [1, 1], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'kitchen_island', name: '花漾厨房岛台', price: 1100, beauty: 58, size: [2, 2], indoor: true, indoorOnly: true, category: 'kitchen' },
  { id: 'bath_toilet', name: '粉瓷马桶', price: 480, beauty: 26, size: [1, 1], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_vanity', name: '薄荷洗手台镜柜', price: 760, beauty: 40, size: [2, 1], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_shower', name: '晨雾淋浴间', price: 1200, beauty: 62, size: [2, 2], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_tub', name: '花漾泡泡浴缸', price: 1350, beauty: 70, size: [2, 3], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_washer', name: '奶油滚筒洗衣机', price: 860, beauty: 44, size: [1, 1], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_towelrack', name: '薄荷落地毛巾架', price: 260, beauty: 16, size: [1, 1], indoor: true, indoorOnly: true, category: 'bathroom' },
  { id: 'bath_laundrybasket', name: '藤编洗衣篮', price: 180, beauty: 12, size: [1, 1], indoor: true, indoorOnly: true, category: 'bathroom' },
);
// 巨大作物只会在成熟作物收获后进入仓库；only 让它不能直接购买，只能通过种植获得。
for (const c of CROPS.filter((crop) => crop.giant)) DECOR.push({
  id: 'giant_' + c.id, name: '巨大' + c.name + '摆件', price: 1, beauty: 86, size: [1, 1], indoor: 'both', only: 'giant', giantCrop: true, cropId: c.id,
});
export const DECO = Object.fromEntries(DECOR.map((d) => [d.id, d]));

// ——— 地面材质（装修模式里逐格铺设）———
export const FLOORS = [
  { id: 'sand', name: '沙土小路', price: 0, color: '#fbeed8', line: '#f1dcc0' },
  { id: 'stone', name: '石板路', price: 6, color: '#e9e2da', line: '#cfc5ba' },
  { id: 'wood', name: '木栈道', price: 8, color: '#dcb48e', line: '#b98a62' },
  { id: 'brick', name: '红砖路', price: 10, color: '#e9a08c', line: '#f6e3d6' },
  { id: 'pebble', name: '鹅卵石', price: 10, color: '#cfe7ee', color2: '#f3f7f8', line: '#b3d3dc' },
  { id: 'mosaic', name: '鹅卵石拼花', price: 14, mile: 0, color: '#f6efe2', color2: '#9fd0dc', color3: '#ffb9cc', line: '#e3d6c2' },
  { id: 'tile', name: '花砖', price: 16, color: '#fff3f7', color2: '#ffc2d6', line: '#ffd9e6' },
  { id: 'carpet', name: '粉色地毯', price: 12, color: '#ffd0de', line: '#ffb3cb' },
  { id: 'grass', name: '铲除还原', price: 0, erase: true, color: '#b3e69b', line: '#8fd17f' },
];
export const FLOOR = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

export const HOUSES = [
  { tier: 1, name: '小木屋', price: 0, beauty: 0 },
  { tier: 2, name: '花园洋房', price: 2800, beauty: 150 },
  { tier: 3, name: '云朵城堡', price: 9800, beauty: 420 },
];

export const BEAUTY_RANKS = [
  { min: 0, name: '朴素小院' },
  { min: 60, name: '温馨花园' },
  { min: 200, name: '人气庭院' },
  { min: 500, name: '梦幻家园' },
  { min: 1000, name: '奇迹花园' },
  { min: 1800, name: '传说中的乐园' },
];
export const beautyRank = (b) => {
  let idx = 0;
  BEAUTY_RANKS.forEach((r, i) => { if (b >= r.min) idx = i; });
  return { idx, ...BEAUTY_RANKS[idx], next: BEAUTY_RANKS[idx + 1] || null };
};

