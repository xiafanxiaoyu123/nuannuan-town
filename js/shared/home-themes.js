// 家具多色换色盘（J4）与主题房间套装共鸣（J5）共享定义
export const SWATCH_FAMILIES = [
  { id: 0, name: '原木樱粉', color: '#ff9fbd', accent: '#fff4e4' },
  { id: 1, name: '海盐薄荷', color: '#8fd9c4', accent: '#eefaf6' },
  { id: 2, name: '香草奶油', color: '#ffe082', accent: '#fffaf0' },
  { id: 3, name: '星夜蓝紫', color: '#b39ddb', accent: '#f3efff' },
];
export const SWATCHABLE_IDS = new Set([
  'sofa', 'bed', 'chair', 'rug', 'rug_cat', 'rug_cloud', 'rug_petal', 'rug_sakura',
  'dining', 'wardrobe', 'windowseat', 'ottoman', 'sideboard', 'coffee', 'vanity',
  'bench', 'picnic', 'hammock', 'garden_table', 'teaset',
]);

export const ROOM_SETS = [
  { id: 'cozy_living', name: '奶油客厅套', zone: 'house', bonus: 45, items: ['sofa', 'coffee', 'tv', 'rug'], desc: '集齐奶油沙发、茶几、电视柜与地毯，打造温暖会客角' },
  { id: 'dream_bedroom', name: '星梦卧室套', zone: 'house', bonus: 55, items: ['bed', 'vanity', 'wardrobe', 'floorlamp'], desc: '集齐梦幻小床、梳妆台、花漾衣柜与落地灯，好梦一整晚' },
  { id: 'sweet_kitchen', name: '甜心厨餐厅套', zone: 'house', bonus: 65, items: ['kitchen_stove', 'kitchen_sink', 'kitchen_fridge', 'dining'], desc: '集齐灶台烤箱、洗菜池、冰箱与双人餐桌，香气满屋' },
  { id: 'bubble_bath', name: '晨雾泡泡浴套', zone: 'house', bonus: 50, items: ['bath_tub', 'bath_vanity', 'bath_toilet', 'bath_towelrack'], desc: '集齐泡泡浴缸、镜柜、粉瓷马桶与毛巾架，治愈疲惫' },
  { id: 'garden_tea', name: '花语下午茶套', zone: 'home', bonus: 60, items: ['teaset', 'swing', 'arch', 'fountain'], desc: '在庭院摆放下午茶桌、秋千、玫瑰拱门与喷泉，化身浪漫花园' },
];
