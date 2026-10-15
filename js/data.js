import { PREMIUM_SETS } from './premium-outfits.js';
// 游戏数据表：服饰、作物、家具、店铺、任务

// 风格沿用《无限暖暖》的叫法
export const STYLES = {
  sweet: { name: '甜美', color: '#ff8fb1' },
  fresh: { name: '清新', color: '#6fcf9f' },
  elegant: { name: '典雅', color: '#a58bea' },
  cool: { name: '帅气', color: '#5fa8ee' },
};

export const CATS = [
  { id: 'hair', name: '发型' },
  { id: 'dress', name: '衣裙' },
  { id: 'shoes', name: '鞋袜' },
  { id: 'acc', name: '头饰' },
  { id: 'back', name: '背饰' },
];

// 套装：名称、风格与造型均对照《无限暖暖》套装图鉴做方块化还原；anchor 是每套最有辨识度的设计点
export const SETS = {
  reunion: { name: '满分出发', star: 3, note: '暖暖的初始套装', anchor: '缠着棕色缎带的粉色双辫 · 露肩荷叶边白衬衫与透纱长袖 · 棕色腰封 · 雪花刺绣粉裙与蝴蝶结花边 · 蕾丝短袜配粉色玛丽珍' },
  far: { name: '远方的遥想', star: 4, note: '预约奖励套装', anchor: '粉色高马尾 · 格纹红蝴蝶结 · 酒红罩裙配白色蕾丝裙 · 红色玛丽珍鞋' },
  bubble: { name: '轻盈泡泡', star: 4, note: '漂浮能力套装', anchor: '头顶蓝蝴蝶结 · 露肩泡泡袖 · 蓝裙下的双层白衬裙 · 及地长飘带' },
  sun: { name: '午后暖阳', star: 3, note: '捕虫能力套装', anchor: '浅金半扎发 · 黄色背带短裤 · 薄荷灯笼袖衬衫 · 蕾丝过膝袜 · 捕虫网' },
  dust: { name: '灰尘拜拜', star: 3, note: '动物清洁能力套装', anchor: '珊瑚色短发 · 蓝白荷叶头巾 · 奶油色娃娃裙 · 蓝色清洁手套' },
  wind: { name: '纯净之风', star: 4, note: '净化能力套装', anchor: '白花环 · 透纱长袖 · 白绿渐变叶片裙摆 · 金色绑带凉鞋' },
  water: { name: '悠然水畔', star: 3, note: '钓鱼能力套装', anchor: '渔夫帽 · 米色连体工装 · 蓝色袖套 · 蓝雨靴 · 背着钓竿' },
  floral: { name: '飞花的追忆', star: 4, note: '滑翔能力套装', anchor: '银灰盘发与黑缎带 · 白色无袖衬衫 · 深蓝到浅蓝的花影裙 · 一朵大花伞' },
  charge: { name: '满电行动', star: 3, note: '维修能力套装', anchor: '工装帽与橙色护目镜 · 橙黄连体工装 · 胸口闪电标 · 工具包' },
  strings: { name: '琴弦之诗', star: 4, note: '演奏能力套装', anchor: '迷你礼帽 · 墨绿马甲裙上的金色音符 · 黑白条纹袜 · 小提琴' },
  star: { name: '迷你星芒', star: 4, note: '变小能力套装', anchor: '淡紫双马尾 · 三尖星星帽 · 蓝白星星短裙与大蝴蝶结' },
  bloom: { name: '花漾梦萦', star: 5, note: '五星漂浮套装', anchor: '蓬松金发与花朵发饰 · 白紫渐变花瓣裙 · 半透明精灵蝶翼' },
  trip: { name: '远路新旅', star: 4, note: '2026.08 活动套装', anchor: '银灰短发 · 护目镜报童帽 · 棕色长外套配格纹马甲 · 红棕领带 · 旅行背包' },
  heart: { name: '花影心期', star: 5, note: '2026.08 限定共鸣', anchor: '橘色长卷发 · 头顶透纱大蝴蝶结 · 薄荷青纱裙上散落的粉紫小花' },
  dawn: { name: '绘色未明', star: 5, note: '2026.09 限定共鸣', anchor: '金色长直发 · 缀满玫瑰的蕾丝宽檐帽 · 浅绿格纹露肩长裙 · 珍珠项链' },
  ballet: { name: '白夜长旋舞', star: 5, note: '2026.07 限定共鸣（芭蕾套）', anchor: '银色短卷发与黑羽头饰 · 黑色束腰 · 黑白渐变芭蕾蓬裙 · 白色长纱手套 · 小羽翼' },
  basket: { name: '满篮时光', star: 4, note: '采集能力套装', anchor: '麦色低双辫 · 草帽 · 绿格纹背带裙配白围裙 · 棕色短靴' },
  lion: { name: '心光破晓时', star: 5, note: '2026.07 限定共鸣（狮套）', anchor: '粉色长卷发与金色桂冠 · 金色羽甲长裙 · 金色臂甲 · 金白多重羽翼' },
};

const PINK = '#ffb3cb', PINK_D = '#f78fb3';

// ——— 服饰 ———
export const CLOTHES = [
  // 发型
  { id: 'h_reunion', set: 'reunion', cat: 'hair', name: '满分出发·缎带双辫', style: 'sweet', price: 0, hair: 'braidtwin', color: '#f58ea4', shade: '#e6728e', tie: '#5a3d33' },
  { id: 'h_far', set: 'far', cat: 'hair', name: '远方的遥想·粉色高马尾', style: 'sweet', price: 600, hair: 'hipony', color: PINK, shade: PINK_D, tie: '#b3202e' },
  { id: 'h_charge', set: 'charge', cat: 'hair', name: '满电行动·利落短发', style: 'cool', price: 400, hair: 'short', color: '#a39892', shade: '#857a75' },
  { id: 'h_water', set: 'water', cat: 'hair', name: '悠然水畔·浅棕短发', style: 'cool', price: 420, hair: 'bob', color: '#dcc09a', shade: '#c6a57a' },
  { id: 'h_dust', set: 'dust', cat: 'hair', name: '灰尘拜拜·珊瑚短发', style: 'sweet', price: 450, hair: 'bob', color: '#f79f8a', shade: '#e98470' },
  { id: 'h_basket', set: 'basket', cat: 'hair', name: '满篮时光·麦色低双辫', style: 'fresh', price: 520, hair: 'lowtwin', color: '#d9a866', shade: '#bf8a48', tie: '#7fbf7a' },
  { id: 'h_sun', set: 'sun', cat: 'hair', name: '午后暖阳·浅金半扎发', style: 'sweet', price: 480, hair: 'halfup', color: '#f3e7bd', shade: '#e0cf98', tie: '#f6cf4a' },
  { id: 'h_bubble', set: 'bubble', cat: 'hair', name: '轻盈泡泡·金色卷发', style: 'sweet', price: 520, hair: 'wavy', color: '#f6dfa6', shade: '#e8c77e' },
  { id: 'h_trip', set: 'trip', cat: 'hair', name: '远路新旅·银灰短发', style: 'sweet', price: 560, hair: 'bob', color: '#d2d6da', shade: '#b3b9bf' },
  { id: 'h_floral', set: 'floral', cat: 'hair', name: '飞花的追忆·银灰盘发', style: 'fresh', price: 760, hair: 'updo', color: '#d6dae5', shade: '#b8bdcc' },
  { id: 'h_star', set: 'star', cat: 'hair', name: '迷你星芒·淡紫双马尾', style: 'sweet', price: 820, hair: 'twin', color: '#bcb7f2', shade: '#9c96e2', tie: '#ffffff' },
  { id: 'h_wind', set: 'wind', cat: 'hair', name: '纯净之风·浅金长发', style: 'elegant', price: 900, hair: 'long', color: '#f2deb2', shade: '#e0c58b' },
  { id: 'h_strings', set: 'strings', cat: 'hair', name: '琴弦之诗·粉色卷发', style: 'sweet', price: 1100, hair: 'curl', color: '#f7aac1', shade: '#ea87a7' },
  { id: 'h_bloom', set: 'bloom', cat: 'hair', name: '花漾梦萦·蓬松金发', style: 'sweet', price: 1500, hair: 'curlbob', color: '#f7dd9e', shade: '#eac472' },
  { id: 'h_heart', set: 'heart', cat: 'hair', name: '花影心期·橘色长卷发', style: 'sweet', price: 1700, hair: 'curl', color: '#f3a074', shade: '#e3835a' },
  { id: 'h_dawn', set: 'dawn', cat: 'hair', name: '绘色未明·金色长直发', style: 'elegant', price: 1700, hair: 'long', color: '#f4d67e', shade: '#e3bb55' },
  { id: 'h_ballet', set: 'ballet', cat: 'hair', name: '白夜长旋舞·银色短卷发', style: 'cool', price: 1800, hair: 'curlbob', color: '#dfe3ea', shade: '#bfc5d0' },
  { id: 'h_lion', set: 'lion', cat: 'hair', name: '心光破晓时·粉色长卷发', style: 'elegant', price: 1800, hair: 'curl', color: '#f6a3bb', shade: '#ea7fa2' },

  // 衣裙
  { id: 'd_reunion', set: 'reunion', cat: 'dress', name: '满分出发·雪花粉裙', style: 'sweet', price: 0, top: '#f7f5fa', offShoulder: true, straps: '#5a3d33', ruffle: '#ffffff', ruffleTrim: '#5a3d33', frill: '#ffffff', frillTrim: '#5a3d33', sleeve: '#ffffff', sleeveLen: 0.9, wide: true, sheer: true, cuff: '#5a3d33', wrist: '#ffffff', choker: '#f7b6c2', tie: '#f7b6c2', belt: '#5a3d33', beltWide: true, skirt: '#f4a3ad', skirtLen: 0.36, flare: 1.3, stars: '#ffffff', starGlow: false, band: '#7a4a45', bandBows: '#f47a94', sidePleat: '#ffffff', petti: '#ffffff', under: '#ffffff' },
  { id: 'd_far', set: 'far', cat: 'dress', name: '远方的遥想·红白礼裙', style: 'sweet', price: 900, top: '#a81f33', inner: '#ffffff', sleeve: '#ffffff', sleeveLen: 0.3, puff: true, choker: '#e6c66f', bow: '#e6c66f', bowKnot: '#a81f33', bowTails: true, belt: '#e6c66f', skirt: '#a81f33', skirtLen: 0.3, flare: 1.2, tiers: ['#a81f33', '#8f1829'], apron: '#ffffff', hem: '#e6c66f', under: '#ffffff', tails: '#8f1829', gloves: '#ffffff', glovesLen: 0.1, wrist: '#ffffff' },
  { id: 'd_charge', set: 'charge', cat: 'dress', name: '满电行动·连体工装', style: 'cool', price: 520, top: '#f6c544', sleeve: '#f6c544', sleeveLen: 0.5, cuff: '#3d3f4a', sidePanel: '#3d3f4a', belt: '#3d3f4a', collar: '#f0a53a', emblem: '#3d3f4a', pants: '#f0a53a', pantsLen: 0.29, pantCuff: '#d98a26', gloves: '#3d3f4a', glovesLen: 0.1 },
  { id: 'd_dust', set: 'dust', cat: 'dress', name: '灰尘拜拜·娃娃裙', style: 'sweet', price: 560, top: '#fbf3d2', sleeve: '#ffffff', sleeveLen: 0.32, puff: true, skirt: '#fbf3d2', skirtLen: 0.36, flare: 1.15, high: true, hem: '#8fbcf0', petti: '#ffffff', under: '#ffffff', bow: '#6fa6ea', bowBig: true, bowTails: true, frill: '#ffffff', patch: '#8fbcf0', gloves: '#6fa6ea', glovesLen: 0.14, wrist: '#ffffff' },
  { id: 'd_water', set: 'water', cat: 'dress', name: '悠然水畔·钓鱼工装', style: 'cool', price: 600, top: '#f4eddd', sleeve: '#f4eddd', sleeveLen: 0.3, inner: '#a9d4f0', belt: '#b98b6b', buttons: '#b98b6b', sidePanel: '#e6dcc6', strap: '#b98b6b', pants: '#f4eddd', pantsLen: 0.3, pantCuff: '#e6dcc6', gloves: '#4f8fdc', glovesLen: 0.2 },
  { id: 'd_basket', set: 'basket', cat: 'dress', name: '满篮时光·格纹背带裙', style: 'fresh', price: 760, top: '#fffdf6', sleeve: '#fffdf6', sleeveLen: 0.4, puff: true, cuff: '#7fbf7a', collar: '#ffffff', bib: '#7fbf7a', straps: '#5fa35f', buttons: '#ffe9a8', apron: '#ffffff', pocket: '#ffe9a8', skirt: '#7fbf7a', tiers: ['#7fbf7a', '#9fd69a', '#7fbf7a'], skirtLen: 0.36, flare: 1.12, hem: '#ffffff' },
  { id: 'd_sun', set: 'sun', cat: 'dress', name: '午后暖阳·背带短裤', style: 'sweet', price: 620, top: '#e3f5e6', sleeve: '#e3f5e6', sleeveLen: 0.85, puff: true, cuff: '#ffffff', frill: '#ffffff', bib: '#f6cf4a', pocket: '#eebb2e', buttons: '#ffffff', strap: '#a06f48', pants: '#f6cf4a', pantsLen: 0.15, puffy: true, pantCuff: '#eebb2e' },
  { id: 'd_trip', set: 'trip', cat: 'dress', name: '远路新旅·旅人外套', style: 'sweet', price: 780, top: '#8f7d6c', inner: '#f3ece2', sleeve: '#6b4f3f', sleeveLen: 0.88, cuff: '#ffffff', collar: '#6b4f3f', tie: '#a8412e', belt: '#8a4a32', buttons: '#e6c66f', sidePanel: '#6b4f3f', skirt: '#6b4f3f', skirtLen: 0.42, flare: 0.85, apron: '#9a8876', hem: '#55392c', under: '#ffffff', strap: '#8a4a32' },
  { id: 'd_bubble', set: 'bubble', cat: 'dress', name: '轻盈泡泡·泡泡裙', style: 'sweet', price: 880, top: '#4f8fdc', inner: '#3f73c4', offShoulder: true, sleeve: '#bfe0fb', sleeveLen: 0.28, puff: true, wrist: '#ffffff', choker: '#3f73c4', bow: '#3f73c4', skirt: '#4f8fdc', skirtLen: 0.32, flare: 1.4, tiers: ['#3f73c4', '#5c9be3', '#9cc8f5'], petti: '#ffffff', under: '#eaf5ff', stars: '#ffffff' },
  { id: 'd_star', set: 'star', cat: 'dress', name: '迷你星芒·星星短裙', style: 'sweet', price: 980, top: '#ffffff', sleeve: '#cfe0ff', sleeveLen: 0.3, puff: true, skirt: '#ffffff', skirtLen: 0.3, flare: 1.25, tiers: ['#ffffff', '#cfe0ff', '#a9bdf7'], petti: '#ffffff', bow: '#a9bdf7', bowBig: true, bowKnot: '#ffd76a', bowTails: true, stars: '#ffd76a', wrist: '#cfe0ff' },
  { id: 'd_floral', set: 'floral', cat: 'dress', name: '飞花的追忆·花影裙', style: 'fresh', price: 1200, top: '#ffffff', sleeve: null, ruffle: '#ffffff', choker: '#ffffff', bow: '#27304f', bowTails: true, buttons: '#dfe6f2', belt: '#27345f', skirt: '#4f8fdc', skirtLen: 0.4, flare: 1.3, tiers: ['#2c4a8c', '#4f8fdc', '#9cc8f5', '#dcecfb'], hem: '#27345f', roses: ['#ffffff', '#eaf5ff'], gloves: '#27304f', glovesLen: 0.14 },
  { id: 'd_wind', set: 'wind', cat: 'dress', name: '纯净之风·风之裙', style: 'elegant', price: 1400, top: '#fbfaf3', sleeve: '#fbfaf3', sleeveLen: 0.92, wide: true, sheer: true, vneck: '#e9d9a8', belt: '#d9b46a', brooch: '#7fcf9a', skirt: '#fbfaf3', skirtLen: 0.44, flare: 1.1, tiers: ['#fbfaf3', '#f1f5e2', '#cfe6bd'], leafHem: '#8fc787', leafHem2: '#b9dda6' },
  { id: 'd_strings', set: 'strings', cat: 'dress', name: '琴弦之诗·乐章裙', style: 'sweet', price: 1600, top: '#ffffff', sleeve: '#ffffff', sleeveLen: 0.85, puff: true, cuff: '#2f4a3a', frill: '#ffffff', vest: '#2f4a3a', lacing: '#d9b46a', bow: '#1f2a24', bowTails: true, skirt: '#2f4a3a', skirtLen: 0.4, flare: 1.25, tiers: ['#2f4a3a', '#35543f'], hem: '#d9b46a', petti: '#ffffff', stars: '#e6c66f' },
  { id: 'd_bloom', set: 'bloom', cat: 'dress', name: '花漾梦萦·花瓣裙', style: 'sweet', price: 3200, top: '#f1e6ff', offShoulder: true, sleeve: null, choker: '#e3ccff', bow: '#f7b6dc', skirt: '#ffffff', skirtLen: 0.48, flare: 1.5, tiers: ['#ffffff', '#f1e6ff', '#dcc4fa', '#f3b9df'], leafHem: '#d3b6f7', leafHem2: '#f7c6e6', stars: '#fff3c4', wrist: '#e3ccff' },
  { id: 'd_heart', set: 'heart', cat: 'dress', name: '花影心期·花纱裙', style: 'sweet', price: 3600, top: '#c9f2e8', sleeve: '#8fdcd0', sleeveLen: 0.9, wide: true, sheer: true, frill: '#ffffff', choker: '#ffffff', bow: '#ffd3e6', skirt: '#c9f2e8', skirtLen: 0.5, flare: 1.42, tiers: ['#d9f7f0', '#b9ecdf', '#a3e3d6', '#d9f7f0'], petti: '#ffffff', leafHem: '#ffd3e6', leafHem2: '#ffffff', roses: ['#ff9fbd', '#c9a4f2', '#ffe27a', '#ffffff'] },
  { id: 'd_dawn', set: 'dawn', cat: 'dress', name: '绘色未明·格纹花裙', style: 'elegant', price: 3800, top: '#cfe6a8', inner: '#ffffff', offShoulder: true, sleeve: '#e6f3cf', sleeveLen: 0.3, puff: true, choker: '#ffffff', frill: '#ffffff', belt: '#b9d68a', skirt: '#cfe6a8', skirtLen: 0.5, flare: 1.48, tiers: ['#dcefba', '#c2df98', '#dcefba', '#c2df98', '#dcefba'], petti: '#ffffff', under: '#ffffff', roses: ['#b48be0', '#ffd76a', '#ff9fbd', '#b48be0'], gloves: '#ffffff', glovesLen: 0.12, wrist: '#ffffff' },
  { id: 'd_ballet', set: 'ballet', cat: 'dress', name: '白夜长旋舞·芭蕾蓬裙', style: 'cool', price: 4200, top: '#1f2026', offShoulder: true, sleeve: null, vest: '#1f2026', lacing: '#cfd6e0', choker: '#1f2026', brooch: '#cfd6e0', skirt: '#1f2026', skirtLen: 0.28, flare: 2.1, tiers: ['#1f2026', '#3d3f4a', '#8d909c', '#e9ecf2'], petti: '#ffffff', under: '#ffffff', stars: '#e9ecf2', gloves: '#f3f5f9', glovesLen: 0.3 },
  { id: 'd_lion', set: 'lion', cat: 'dress', name: '心光破晓时·金羽长裙', style: 'elegant', price: 4600, top: '#e9c463', metal: true, inner: '#fff6dc', sleeve: '#f3d98a', sleeveLen: 0.3, puff: true, choker: '#e9c463', brooch: '#fff6dc', belt: '#c9992e', skirt: '#e9c463', skirtLen: 0.52, flare: 1.2, tiers: ['#f0d27a', '#e3b94f', '#f0d27a', '#fff6dc'], leafHem: '#e3b94f', leafHem2: '#fff6dc', apron: '#fff6dc', gloves: '#e3b94f', glovesLen: 0.26 },

  // 鞋袜
  { id: 's_reunion', set: 'reunion', cat: 'shoes', name: '满分出发·粉色玛丽珍', style: 'sweet', price: 0, color: '#f4a3ad', strap: true, sole: '#e88a98', sock: '#ffffff', sockH: 0.2, sockBow: '#f47a94' },
  { id: 's_far', set: 'far', cat: 'shoes', name: '远方的遥想·红色玛丽珍', style: 'sweet', price: 350, color: '#b3202e', strap: true, sole: '#8f1829', sock: '#ffffff', sockH: 0.12, stockTrim: '#ffffff' },
  { id: 's_charge', set: 'charge', cat: 'shoes', name: '满电行动·橙色工装鞋', style: 'cool', price: 280, color: '#f08a3c', boot: 0.1, sole: '#3d3f4a', toe: '#ffffff', lace: '#ffffff' },
  { id: 's_bubble', set: 'bubble', cat: 'shoes', name: '轻盈泡泡·玛丽珍鞋', style: 'sweet', price: 300, color: '#27345f', sock: '#ffffff', sockH: 0.1, strap: true, sole: '#1b2444' },
  { id: 's_dust', set: 'dust', cat: 'shoes', name: '灰尘拜拜·奶白短靴', style: 'sweet', price: 300, color: '#fffaf0', boot: 0.14, trim: '#ffffff', sole: '#ffc2d6', sock: '#ffffff', sockH: 0.2 },
  { id: 's_water', set: 'water', cat: 'shoes', name: '悠然水畔·蓝色雨靴', style: 'cool', price: 320, color: '#3f73c4', boot: 0.2, trim: '#ffffff', sole: '#2c569c' },
  { id: 's_basket', set: 'basket', cat: 'shoes', name: '满篮时光·棕色短靴', style: 'fresh', price: 420, color: '#9a6b45', boot: 0.14, lace: '#ffe9a8', sole: '#6e4a31', sock: '#ffffff', sockH: 0.2 },
  { id: 's_sun', set: 'sun', cat: 'shoes', name: '午后暖阳·系带短靴', style: 'sweet', price: 380, color: '#a06f48', boot: 0.13, lace: '#f3e6c6', sole: '#6e4a31', stock: '#fbfbf6', stockH: 0.27, stockTrim: '#ffffff' },
  { id: 's_trip', set: 'trip', cat: 'shoes', name: '远路新旅·旅行短靴', style: 'sweet', price: 420, color: '#6b4f3f', boot: 0.15, lace: '#e6c66f', sole: '#3f2c22', stock: '#ffffff', stockH: 0.24 },
  { id: 's_star', set: 'star', cat: 'shoes', name: '迷你星芒·白色短靴', style: 'sweet', price: 480, color: '#ffffff', boot: 0.15, trim: '#a9bdf7', sole: '#cfe0ff', stock: '#ffffff', stockH: 0.27, stockTrim: '#cfe0ff' },
  { id: 's_floral', set: 'floral', cat: 'shoes', name: '飞花的追忆·黑色玛丽珍', style: 'fresh', price: 520, color: '#23262f', strap: true, sole: '#15171d', stock: '#d5e8fb', stockH: 0.3 },
  { id: 's_wind', set: 'wind', cat: 'shoes', name: '纯净之风·绑带凉鞋', style: 'elegant', price: 620, color: '#d9b46a', flat: true, straps: '#d9b46a', sole: '#b98f47' },
  { id: 's_strings', set: 'strings', cat: 'shoes', name: '琴弦之诗·条纹袜高跟鞋', style: 'sweet', price: 700, color: '#2b2b33', strap: true, sole: '#d9b46a', stock: '#ffffff', stockH: 0.3, stripe: '#2b2b33' },
  { id: 's_bloom', set: 'bloom', cat: 'shoes', name: '花漾梦萦·淡紫舞鞋', style: 'sweet', price: 900, color: '#cdb6f5', shine: true, strap: true, sole: '#b497ea', straps: '#e3ccff' },
  { id: 's_heart', set: 'heart', cat: 'shoes', name: '花影心期·薄荷缎面鞋', style: 'sweet', price: 1000, color: '#a3e3d6', shine: true, strap: true, sole: '#7fcfc0', sock: '#ffffff', sockH: 0.1, toe: '#ffd3e6' },
  { id: 's_dawn', set: 'dawn', cat: 'shoes', name: '绘色未明·蕾丝高跟鞋', style: 'elegant', price: 1000, color: '#f3f7ea', strap: true, sole: '#b9d68a', stock: '#ffffff', stockH: 0.3, toe: '#b48be0' },
  { id: 's_ballet', set: 'ballet', cat: 'shoes', name: '白夜长旋舞·缎带舞鞋', style: 'cool', price: 1100, color: '#1f2026', flat: true, straps: '#1f2026', sole: '#101116', stock: '#f3f5f9', stockH: 0.3 },
  { id: 's_lion', set: 'lion', cat: 'shoes', name: '心光破晓时·金色战靴', style: 'elegant', price: 1100, color: '#e3b94f', shine: true, boot: 0.2, trim: '#fff6dc', sole: '#c9992e' },

  // 头饰
  { id: 'a_none', cat: 'acc', name: '不戴头饰', style: null, price: 0, acc: 'none' },
  { id: 'a_far', set: 'far', cat: 'acc', name: '远方的遥想·格纹蝴蝶结', style: 'sweet', price: 300, acc: 'bowband', color: '#b3202e', knot: '#e6c66f', stripe: '#e6c66f' },
  { id: 'a_floral', set: 'floral', cat: 'acc', name: '飞花的追忆·黑缎带', style: 'fresh', price: 220, acc: 'ribbon', color: '#27304f' },
  { id: 'a_bubble', set: 'bubble', cat: 'acc', name: '轻盈泡泡·蓝蝴蝶结', style: 'sweet', price: 260, acc: 'bowband', color: '#3f73c4', knot: '#2c569c' },
  { id: 'a_dust', set: 'dust', cat: 'acc', name: '灰尘拜拜·荷叶头巾', style: 'sweet', price: 300, acc: 'bonnet', color: '#ffffff', trim: '#8fbcf0' },
  { id: 'a_water', set: 'water', cat: 'acc', name: '悠然水畔·渔夫帽', style: 'cool', price: 340, acc: 'bucket', color: '#f4eddd', band: '#d9c9a6' },
  { id: 'a_charge', set: 'charge', cat: 'acc', name: '满电行动·护目镜工装帽', style: 'cool', price: 360, acc: 'capgoggle', color: '#7c8573', lens: '#ff9a3c' },
  { id: 'a_trip', set: 'trip', cat: 'acc', name: '远路新旅·护目镜报童帽', style: 'sweet', price: 420, acc: 'capgoggle', color: '#7a5a46', lens: '#e6c66f' },
  { id: 'a_wind', set: 'wind', cat: 'acc', name: '纯净之风·白花环', style: 'elegant', price: 480, acc: 'flower', cols: ['#ffffff', '#fff3c4', '#ffffff', '#eaf6dd', '#ffffff', '#fff3c4', '#ffffff', '#eaf6dd'], leaf: '#9fcf8f' },
  { id: 'a_star', set: 'star', cat: 'acc', name: '迷你星芒·星星帽', style: 'sweet', price: 520, acc: 'jester', color: '#ffffff', trim: '#cfe0ff', pom: '#ffd76a' },
  { id: 'a_strings', set: 'strings', cat: 'acc', name: '琴弦之诗·迷你礼帽', style: 'sweet', price: 640, acc: 'tophat', color: '#22302a', band: '#d9b46a' },
  { id: 'a_bloom', set: 'bloom', cat: 'acc', name: '花漾梦萦·花朵发饰', style: 'sweet', price: 700, acc: 'pin', color: '#f7c6e6', core: '#ffe9a8' },
  { id: 'a_heart', set: 'heart', cat: 'acc', name: '花影心期·透纱蝴蝶结', style: 'sweet', price: 900, acc: 'bowband', color: '#ffd3e6', knot: '#ffffff', sheer: true, big: true },
  { id: 'a_ballet', set: 'ballet', cat: 'acc', name: '白夜长旋舞·黑羽头饰', style: 'cool', price: 900, acc: 'plume', color: '#1f2026', gem: '#cfd6e0' },
  { id: 'a_dawn', set: 'dawn', cat: 'acc', name: '绘色未明·玫瑰蕾丝帽', style: 'elegant', price: 950, acc: 'lacehat', color: '#f7fbef', trim: '#cfe6a8', roses: ['#b48be0', '#ffd76a', '#b48be0', '#ff9fbd'] },
  { id: 'a_lion', set: 'lion', cat: 'acc', name: '心光破晓时·金色桂冠', style: 'elegant', price: 950, acc: 'laurel', color: '#e9c463', gem: '#fff6dc' },
  { id: 'a_basket', set: 'basket', cat: 'acc', name: '满篮时光·小雏菊草帽', style: 'fresh', price: 300, acc: 'straw', color: '#f3d9a0', band: '#7fbf7a' },
  // 只送不卖：连续签到第七天的纪念头饰（only：没拿到之前不在店里出现）
  { id: 'a_seven', cat: 'acc', name: '七日星·星星发夹', style: 'sweet', price: 777, only: 'signin', acc: 'sevenstar', color: '#ffd76a', core: '#fff6dc' },

  // 背饰
  { id: 'b_none', cat: 'back', name: '不戴背饰', style: null, price: 0, back: 'none' },
  { id: 'b_sun', set: 'sun', cat: 'back', name: '午后暖阳·捕虫网', style: 'sweet', price: 300, back: 'net', color: '#f6cf4a' },
  { id: 'b_water', set: 'water', cat: 'back', name: '悠然水畔·钓竿与鱼篓', style: 'cool', price: 300, back: 'rod', color: '#8a6a55' },
  { id: 'b_charge', set: 'charge', cat: 'back', name: '满电行动·工具包', style: 'cool', price: 320, back: 'toolbag', color: '#f0a53a' },
  { id: 'b_trip', set: 'trip', cat: 'back', name: '远路新旅·旅行背包', style: 'sweet', price: 360, back: 'toolbag', color: '#8a4a32', plain: true },
  { id: 'b_bubble', set: 'bubble', cat: 'back', name: '轻盈泡泡·长飘带', style: 'sweet', price: 420, back: 'ribbons', color: '#5c9be3', knot: '#3f73c4', tail: '#bfe0fb' },
  { id: 'b_floral', set: 'floral', cat: 'back', name: '飞花的追忆·大花伞', style: 'fresh', price: 600, back: 'bigflower', color: '#9cc8f5', inner: '#ffffff' },
  { id: 'b_strings', set: 'strings', cat: 'back', name: '琴弦之诗·小提琴', style: 'sweet', price: 800, back: 'violin', color: '#b9743f' },
  { id: 'b_bloom', set: 'bloom', cat: 'back', name: '花漾梦萦·精灵蝶翼', style: 'sweet', price: 2200, back: 'wings', color: '#e9c9ff', inner: '#ffd3ec' },
  { id: 'b_ballet', set: 'ballet', cat: 'back', name: '白夜长旋舞·白羽小翼', style: 'cool', price: 2400, back: 'feather', color: '#ffffff', tip: '#dfe3ea', n: 2 },
  { id: 'b_lion', set: 'lion', cat: 'back', name: '心光破晓时·金白羽翼', style: 'elegant', price: 2800, back: 'feather', color: '#fff6dc', tip: '#e9c463', n: 4 },
];
// 二十套高星主题套装：逐套对照《无限暖暖》官方立绘做方块化还原，定义在 premium-outfits.js（每套五件都是单独写的）。
// 部件编号沿用 h_/d_/s_/a_/b_ + 套装编号，已经买过的玩家不受影响；价格仍按套装顺序递增。
Object.assign(SETS, Object.fromEntries(PREMIUM_SETS.map((s) => [s.id, {
  name: s.name, star: s.star, note: `${s.star === 5 ? '五星' : '四星'}主题套装 · ${s.ability}`, anchor: s.anchor, ability: s.ability,
}])));
for (const [index, s] of PREMIUM_SETS.entries()) {
  const price = 2600 + index * 120;
  const piece = (prefix, cat, def, cost) => { const { name, ...rest } = def; return { id: `${prefix}_${s.id}`, set: s.id, cat, name: `${s.name}·${name}`, style: s.style, price: cost, ...rest }; };
  CLOTHES.push(
    piece('h', 'hair', s.hair, price),
    piece('d', 'dress', s.dress, price + 1200),
    piece('s', 'shoes', s.shoes, price - 350),
    piece('a', 'acc', s.acc, price - 220),
    piece('b', 'back', s.back, price + 400),
  );
}
export const CLOTH = Object.fromEntries(CLOTHES.map((c) => [c.id, c]));
export const DEFAULT_OUTFIT = { hair: 'h_reunion', dress: 'd_reunion', shoes: 's_reunion', acc: 'a_none', back: 'b_none' };

// ——— 作物 ———
// 每种作物各有脾气：grow 成熟秒数；yield 一次收几个；water 浇水后剩余时间变成原来的几成（越小越爱喝水）
export const CROPS = [
  { id: 'radish', name: '樱桃萝卜', seed: 10, grow: 25, sell: 22, color: '#ff7f9f', leaf: '#8fd17f', tip: '长得最快，半分钟一茬' },
  { id: 'strawberry', name: '奶油草莓', seed: 28, grow: 70, sell: 30, yield: 2, color: '#f2546b', leaf: '#7cc77a', tip: '一次能收两颗' },
  { id: 'tulip', name: '郁金香', seed: 45, grow: 120, sell: 100, water: 0.4, color: '#ffb347', leaf: '#8fd17f', tip: '特别爱喝水，浇过快一大截' },
  { id: 'pumpkin', name: '小南瓜', seed: 80, grow: 210, sell: 220, color: '#ff9a4a', leaf: '#6fbf73', giant: true, tip: '个头大，慢慢长；成熟时有 0.5% 概率巨大化' },
  { id: 'sunflower', name: '向日葵', seed: 120, grow: 320, sell: 350, water: 0.85, color: '#ffd24f', leaf: '#7cc77a', giant: true, tip: '耐旱；成熟时有 0.5% 概率巨大化' },
  { id: 'rose', name: '星光玫瑰', seed: 220, grow: 520, sell: 680, water: 0.5, color: '#c79bff', leaf: '#6fbf73', giant: true, tip: '最慢也最值钱；成熟时有 0.5% 概率巨大化' },
];
// 果树：种在「果树田」里，不用重种。幼苗不结果；小树每轮结 1 个；长成大树后每轮结 3 个大果
// grow：幼苗长成小树的秒数；big：从种下到长成大树的秒数；cycle：每轮结果的秒数
export const FRUITS = [
  { id: 'apple', name: '苹果', tree: '苹果树', price: 360, sell: 58, grow: 150, big: 600, cycle: 150, color: '#ff6b6b', leaf: '#7cc77a' },
  { id: 'peach', name: '蜜桃', tree: '蜜桃树', price: 620, sell: 96, grow: 210, big: 840, cycle: 200, color: '#ffb0b8', leaf: '#8fd694' },
  { id: 'orange', name: '甜橙', tree: '甜橙树', price: 980, sell: 150, grow: 280, big: 1100, cycle: 250, color: '#ffa53d', leaf: '#5fae72' },
];
export const FRUIT = Object.fromEntries(FRUITS.map((f) => [f.id, f]));
export const CROP = Object.fromEntries([...CROPS, ...FRUITS].map((c) => [c.id, c]));
export const PLOT_MAX = 12;
export const PLOT_START = 6;
export const PLOT_PRICE = (n) => 250 + (n - PLOT_START) * 150;

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
    how: ['粉色纽扣按 F / ← 或点击左半屏', '蓝色纽扣按 J / → 或点击右半屏', '踩准节拍获得 Perfect'],
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

// ——— 引导任务 ———（stat: 统计键；need: 目标值）
export const QUESTS = [
  { id: 'q1', text: '去甜心咖啡屋打一次工', stat: 'play_cafe', need: 1, reward: 120, at: [-6.7, -9.6], where: '咖啡屋' },
  { id: 'q2', text: '去后院的菜地种下 3 颗种子', stat: 'planted', need: 3, reward: 80, at: [-513, -3], zone: 'home', where: '菜地' },
  { id: 'q3', text: '给作物浇 3 次水', stat: 'watered', need: 3, reward: 60, at: [-513, -3], zone: 'home', where: '菜地' },
  { id: 'q4', text: '收获 3 株成熟的作物', stat: 'harvested', need: 3, reward: 100, at: [-513, -3], zone: 'home', where: '菜地' },
  { id: 'q5', text: '把作物卖给后院的回收小铺', stat: 'sold', need: 1, reward: 80, at: [-514.9, -9.6], zone: 'home', where: '回收小铺' },
  { id: 'q6', text: '去搭配小屋买一件新衣服', stat: 'bought_clothes', need: 1, reward: 150, at: [22, 2.6], where: '搭配小屋' },
  { id: 'q7', text: '在屋里或后院摆放 3 件家具', stat: 'placed', need: 3, reward: 150, at: [500, 0], zone: 'house', where: '屋里' },
  { id: 'q8', text: '在花语小筑营业一次', stat: 'play_flower', need: 1, reward: 150, at: [3.7, -10.2], where: '花语小筑' },
  { id: 'q9', text: '在星梦裁缝铺营业一次', stat: 'play_tailor', need: 1, reward: 150, at: [13.9, -9.7], where: '裁缝铺' },
  { id: 'q9b', text: '去码头的悠然钓场钓一次鱼', stat: 'play_fish', need: 1, reward: 150, at: [6, 23.5], where: '码头' },
  { id: 'q10', text: '升级任意一家店铺', stat: 'upgrades', need: 1, reward: 300 },
  { id: 'q11', text: '家园美化度达到 200', stat: 'beauty', need: 200, reward: 500 },
  { id: 'q12', text: '收集 12 件服饰', stat: 'wardrobe', need: 12, reward: 800 },
  { id: 'q13', text: '把房子升级为花园洋房', stat: 'house', need: 2, reward: 1000 },
  { id: 'q14', text: '家园美化度达到 1000', stat: 'beauty', need: 1000, reward: 2000 },
];

// ——— 玩法教程（第一次接触某个系统时弹出，也可以在店铺面板里重看）———
export const TUTORIALS = {
  welcome: { title: '欢迎来到奇迹大陆', pages: [
    { h: '小镇与小屋', p: '你现在在花愿小镇，镇上有四家可以打工的店，还能在东边建起第五家面包房。身后的小屋是你的家：进门是可以自由布置的室内，穿过屋里的后门是带菜地的后院。' },
    { h: '怎么移动', p: 'WASD / 方向键，或者直接点击地面。靠近能互动的地方会出现提示，按 E 或点提示条。滚轮缩放镜头。 在右上角「更多」里选「视角」可以转动镜头；滚轮或双指捏合可以拉近拉远。' },
    { h: '跟着任务走', p: '点任务栏查看任务清单并选择追踪，目标在屏幕外时会有金色箭头指路；目标在屋里或后院时，箭头会先带你去对应的门。更多 → 帮助可以随时重看所有教程，不需要一次记住。' },
    { h: '居民与成就', p: '路上散步的居民都可以搭话，聊熟了会有惊喜，每个人还藏着自己的小秘密。右上角「更多」里的「成就」记录你做过的事，达成后记得领奖励。任务指引右上角的 × 可以把它收起来。' },
  ] },
  camera: { title: '移动镜头与视角', pages: [
    { h: '转动与缩放', p: '在右上角「更多」里点「视角」进入视角模式，拖动画面就能自由转动镜头；选好角度后点「固定视角」，想还原就点「恢复默认」。电脑用滚轮、手机用双指捏合随时可以拉近拉远。' },
  ] },
  req: { title: '居民委托', pages: [
    { h: '谁有事找你', p: '居民头顶冒出金色的「!」，就是有事想拜托你。走过去搭话，或者去他家门口拜访，都能看到委托内容。六位居民在镇上各有一栋小屋。' },
    { h: '接下和交付', p: '接下委托后，可以从任务清单查看进度并追踪。有的要你去某家店打一局好成绩，有的要带作物，有的要穿指定风格来见面。完成后标记会变成绿色，回去找他交付就能拿到噗灵，好感也会涨。' },
  ] },
  house: { version: 2, title: '暖暖的小屋', pages: [
    { h: '一整间都是你的', p: '屋里是可以自由布置的大房间。点右上角「装修」或墙边的房屋蓝图开始布置：摆室内家具、换地板。' },
    { h: '屋里的固定设施', p: '左边的衣橱用来换装；右边的房屋蓝图可以升级房子；正对面的绿色后门通往后院，脚下的门垫是回小镇的出口。' },
    { h: '家具也能用', p: '退出装修后，靠近椅子可以坐下，床可以休息，书架和书桌可以读书，梳妆台可以换装，小灯可以独立开关。出现互动提示时按 E 或点提示，具体用法在首次使用时介绍。' },
  ] },
  yard: { title: '后院', pages: [
    { h: '菜地与回收小铺', p: '后院西侧是菜地，西北角是回收小铺。整片院子都能布置：摆庭院装饰、铺小路，田地也在装修里自由开垦。' },
    { h: '回屋', p: '房子的门通回屋里，从屋里的前门出去就是小镇。' },
    { h: '扩建院子', p: '白栅栏外长满野草的地方还不能布置。走到栅栏边的「扩建」告示牌，或者在家的面板里花噗灵扩建，院子会一圈一圈变大，美化度也跟着涨。' },
  ] },
  farm: { version: 2, title: '菜地与果树', pages: [
    { h: '开垦', p: '田地是装修里的一种摆件：在后院点右上角「装修」，在家具页选「田地」，想开垦在哪就摆在哪，也可以拿起来挪位置（先把田里的作物收掉）。' },
    { h: '播种', p: '走到空田边按 E 或点提示播种。下方种子栏（或数字键 1—6）切换作物；先消耗背包里的免费种子，没有免费种子时才扣提示中的种子价格。每种作物的生长时间、收获数量和浇水效果不同。' },
    { h: '浇水与收获', p: '蓝色水滴表示可以浇水，浇一次能缩短剩余时间（多数作物缩短四成，郁金香缩短六成）。头顶出现金色菱形就是成熟了。作物按真实时间生长，你去打工时它也在长。' },
    { h: '果树、喷水器和大喵', p: '装修里的「果树田」是三格见方的大田，用来种果树：幼苗不结果，小树每轮结 1 个，长成大树后每轮结 3 个大果，不用重种，一直能摘。「自动喷水器」和一块田一样大，会给紧挨着它一圈的田和果树浇水。大喵在后院也会主动帮忙浇水。' },
    { h: '卖给回收小铺', p: '收获的作物进背包，去后院西北角的回收小铺卖掉。小铺每隔几分钟会高价收购一种作物，看准了再卖更划算。' },
  ] },
  giantCrops: { title: '巨大作物与摆件', pages: [
    { h: '播种时可能长成巨物', p: '南瓜、向日葵和玫瑰在正常播种时有 0.5% 的概率巨大化。收获时会出现特殊提示，巨大作物不会重复占用普通作物背包。' },
    { h: '摆进家里或拿去炫耀', p: '巨大作物会进入装修仓库，可以像摆件一样放进屋内或后院；在后院互动可以拿在手上，带到小镇各处展示，再回到后院放回仓库。' },
    { h: '稀有回收价', p: '巨大作物可以保留观赏，也能交给回收小铺，售价是对应普通作物的 20 倍。每一颗都是真正的稀有收获。' },
  ] },
  decor: { version: 3, title: '布置家园', pages: [
    { h: '摆家具', p: '装修入口只在暖暖自己的小屋和后院显示。选一件家具，点格子摆放，R 旋转；没有库存时先累计费用，完成装修时统一扣除。默认一次只放一件，放好后需要重新选择。想多放几个时，再开启「连续放置」。' },
    { h: '铺地面', p: '切到「地面」页选择材质，默认点击铺一格，然后重新选择。开启「连续放置」后，按住拖动可以连续铺设；关闭后恢复单次铺设。「铲除还原」恢复原样。' },
    { h: '看全景', p: '装修栏里的「转换视角」可以打开相机工具：用「旋转」拖动画面调整方向，用「平移」移动观察中心，「左转 / 右转 / 俯视」快速换角度，「拉近 / 拉远」调整距离，「回到全景」恢复默认。调整视角时不会误放家具；完成视角后再继续摆放。家具提升美化度，美化度决定家园评价。' },
    { h: '调整和回收', p: '先点「整理家具」，再点已摆好的家具，就能移动、旋转、收进仓库或卖掉。卖掉按半价拿到噗灵；收进仓库的以后还能免费再摆。点「取消选择」可回到空闲状态，拖动画面平移镜头。' },
    { h: '撤销与保存布局', p: '「撤销上一步」最多恢复本次装修最近 30 笔操作。退出装修或卖出等不可逆操作会提交历史；撤销记录不跨次保留。「布局方案」可为屋内和后院各保存 3 套，预览缺件和费用后再应用。最高级房屋另有隔断页。' },
  ] },
  decorCamera: { version: 1, title: '选个好角度再布置', pages: [
    { h: '转一转，看清房间', p: '选「旋转」拖动画面，或用「左转 / 右转」转 90°；「俯视」方便对齐家具和隔断。调整视角时会暂停摆放，并保留选中的物品。' },
    { h: '挪一挪，拉近细节', p: '选「平移」拖动画面移动观察中心，双指捏合或滚轮缩放。装修时按方向键也可以平移观察中心。点「回到全景」恢复默认角度，选好角度再点「完成视角」继续摆放。' },
  ] },
  recycle: { title: '回收小铺', pages: [
    { h: '卖作物', p: '背包里的作物在这里换成噗灵。带「高价」标记的是当前高价收购的作物，价格 ×1.5，每 5 分钟换一种。' },
    { h: '回收闲置家具', p: '收回仓库、不想再摆的家具可以半价卖给小铺。已经摆在院子里的不会被卖掉。' },
  ] },
  wardrobe: { version: 2, title: '搭配与风格', pages: [
    { h: '四种风格', p: '每件服饰都有风格：甜美、清新、典雅、帅气。每家店偏爱一种风格——咖啡屋爱甜美，花店爱清新，裁缝铺爱典雅，钓场爱帅气。' },
    { h: '穿搭加成', p: '身上每有一件对应风格的服饰，在那家店的收入 +6%，五件全中就是 +30%。出门打工前记得换装。' },
    { h: '套装', p: '服饰来自《无限暖暖》的套装，每套下方写着它最有辨识度的设计点。可以混搭，不必整套穿。' },
    { h: '上班方案与大喵', p: '「上班方案」可以为每家店保存一套已拥有的服装，上班自动换、打烊换回。点「大喵斗篷」切换换装对象：经典黄斗篷免费，其它款在搭配小屋买下后，便可在衣橱反复换穿。' },
  ] },
  cafe: { title: '甜心咖啡屋', pages: [
    { h: '备货', p: '蛋糕、甜甜圈这类甜点在展示柜里自动补货，点一下取一份。咖啡和奶茶要先点机器冲泡，好了再点一次取杯——放太久会煮过头，得清理掉重来。' },
    { h: '上菜', p: '托盘最多放 3 样。和客人气泡里的内容完全一致时气泡会发光，点气泡（或 Q / W / E）上菜。' },
    { h: '收钱和贵客', p: '客人走后桌上会留下噗灵，点一下收走才能接待下一位。戴皇冠的是贵客：付双倍，但耐心更少。' },
  ] },
  flower: { title: '花语小筑', pages: [
    { h: '合成', p: '点「花种篮」长出嫩芽，把两个一样的拖到一起就会升级：嫩芽 → 花苞 → 鲜花 → 花束 → 花篮。「丝带篮」同理：丝带 → 蝴蝶结 → 礼盒。' },
    { h: '订单', p: '客人气泡里是他们要的东西，有的要两样（比如花束 + 蝴蝶结）。凑齐后气泡会发光，点气泡或把物品拖给客人。' },
    { h: '杂草与回收', p: '被杂草占住的格子放不了东西，在它旁边完成一次合成就能清掉。棋盘满了可以把不要的拖到右侧回收。' },
  ] },
  tailor: { version: 2, title: '星梦裁缝铺', pages: [
    { h: '踩准节拍', p: '纽扣顺着布料滑向左边的判定圈。粉色按 F（或 ←），蓝色按 J（或 →），也可以点屏幕左半 / 右半。越准分越高。' },
    { h: '长针脚', p: '拖着长条的是长针脚：纽扣到圈里时按住，一直按到长条走完再松开。提前松手就断线了。无尽选择强化期间若松开了长按，选完后按提示重新按住原轨道，游戏会原位继续，不会因暂停本身扣心。' },
    { h: '成衣', p: '每缝好 14 颗纽扣完成一件成衣挂上衣架。连击越高，每颗纽扣的加分越多。' },
  ] },
  bakery: { version: 2, title: '麦香面包房', pages: [
    { h: '看准火候', p: '点面团（数字键1–5）放进空烤炉。进度进入金色区间时点烤炉或按空格出炉。太早不能取出，烤过头收入变少，烤焦会断连击，无尽模式还会扣爱心。' },
    { h: '上架与交付', p: '出炉面包先进入展示架，最多放4份，不会立刻算收入。客人气泡显示想要的1–2份面包，备齐后会发光，点气泡或按Q/W/E交付。赶在耐心用完前送到，连续交付还能加分。' },
    { h: '管理展示架', p: '展示架满了就不能再取出熟面包，先完成订单；多余面包可以点右上角×回收。回收不计收入，烤焦的面包仍可直接清理。' },
    { h: '升级店铺', p: 'Lv.2解锁法棍，Lv.3解锁草莓卷，Lv.4多一个烤炉，Lv.5金色区间更宽。建成后从店铺面板选择关卡、无尽或升级。' },
  ] },
  fish: { version: 2, title: '悠然钓场', pages: [
    { h: '咬钩', p: '开局会自动甩竿，盯着浮漂等「!」。出现时及时按空格、E 或按住取景画面；触屏也可以直接按住。按早会惊走鱼，按晚鱼会溜走。' },
    { h: '收线', p: '右侧出现收线条：按住让绿条上升，松开下落。让鱼一直待在绿条里，右边的进度蓄满就钓上来了。不同的鱼游法不同，有的猛窜，有的一直往下沉。' },
    { h: '宝箱与完美', p: '收线时偶尔出现宝箱，用绿条罩住它一会儿就能捞到额外奖励。全程没让鱼离开绿条是「完美」，收入 ×1.3。' },
  ] },
};

// 新模块在实际入口触发，帮助目录始终可查。旧教程仅在重要操作改变时提高版本。
Object.assign(TUTORIALS, {
  levels: { title:'关卡、收入与特殊规则', pages:[
    {h:'按目标营业',p:'五家店都有关卡和无尽模式。关卡有倒计时，营业额达到第一颗星即过关；首次通关有额外奖金，也能选择已经过的关重打。教程结束或点“稍后再看”后，才开始开店倒数。'},
    {h:'结算看这里',p:'营业额经过店铺等级、穿搭与套装加成成为实际收入，打烊时入账。部分关卡会显示特殊规则，开局先看规则条；“提前打烊”按已经完成的营业额结算。升级和上班方案在店铺、衣橱中调整。'},
  ]},
  endless: {title:'无尽与强化选择',pages:[
    {h:'不限时，也要留心失误',p:'无尽没有关卡倒计时，节奏逐渐加快；顾客走掉、漏针或钓鱼失误等会扣爱心，爱心耗尽后打烊。不同店铺按自己的规则判定失误，右上角会显示剩余爱心。'},
    {h:'每 45 秒选一次强化',p:'强化是本局的三选一选择，选择时营业与音乐暂停，不会在读卡时丢客人。裁缝长按在暂停时松手，会提示重新按住原轨道再继续；切出页面也会暂停，返回后按提示恢复。'},
  ]},
  partitions:{version:2,title:'拖墙、门洞与移动隔断',pages:[
    {h:'先把家升到云朵城堡',p:'隔断仅在最高级自宅的装修页开放，最多 240 段且免费。选择实墙，按住格线拖出整面直墙，方向会横竖吸附；松手一次放下整笔墙。门洞占 2 格，按住拖到落点再松手。'},
    {h:'移动整条直墙',p:'选“移动墙段”，按住已有实墙可选中相连且共线的一整条墙，遇到门洞或空隙停下；门洞单独选择。拖到新位置松手确认，R 或旋转按钮可以换方向。'},
    {h:'给每个隔间留门',p:'红色预览表示重叠、堵路或挡住家具、角色和出入口。每个隔间要留可走通的门洞；不要用家具堵住门。拆除工具点一段或一个门洞拆除，撤销会恢复一整笔拖墙或移动。'},
    {h:'防误触与取消',p:'默认完成一笔后清空工具，开启“连续放置”才保留选择。Esc、取消选择、失焦、取消触控或切换工具/区域会取消未放下的这笔；双指缩放不会顺便落墙。'},
  ]},
  layouts:{title:'撤销与三套布局',pages:[
    {h:'存下当前房间',p:'自己的屋内和后院各有 3 个方案位，可命名、保存当前布局、预览、应用和删除方案。方案记录家具位置与朝向、地板、灯状态，以及该区域支持的隔断。'},
    {h:'先看缺件和费用',p:'应用前会计算可用家具、缺件、地板费用与通路；缺件不会偷偷购买，种着作物的田受到保护。应用成功是一笔可撤销操作。退出装修或卖出等操作会提交撤销历史，长期方案仍保留。'},
  ]},
  expansion:{title:'房屋升级与后院扩建',pages:[
    {h:'屋内会真的变大',p:'小木屋 22×15 格，花园洋房 28×19 格，云朵城堡 34×23 格。升级保留现有家具和地板格子位置；最高级还会开放实墙、门洞和整墙移动。'},
    {h:'院子单独扩建',p:'后院按自己的等级扩到最大 38×26 格。先看面板的价格和可增加范围再升级；美化度来自摆件和扩建，达到阶段后需在“阶段奖励”里领取。'},
  ]},
  furniture:{title:'在家使用家具',pages:[
    {h:'走近再互动',p:'退出装修和拍照后，走到家具可达的一侧，按 E 或点互动提示。椅子、沙发和懒人椅可以坐下；移动或点“起身”即可站起，不能隔墙操作。'},
    {h:'一件家具一种生活',p:'床可确认休息到小镇次日清晨，晚安前会自动换上云朵睡衣；书架和书桌可选短文并翻页；梳妆台打开衣橱；灯具能独立开关并随布局保存。钢琴有自己的三排键盘，飘窗、茶车和八音盒也能触发小互动。移动、旋转和收回后，互动点会跟着家具更新。'},
  ]},
  momo:{version:2,title:'大喵斗篷与购买',pages:[
    {h:'选择大喵的衣服',p:'衣橱里点“大喵斗篷”切换到大喵。经典黄斗篷免费，其它 4 款在搭配小屋购买；已拥有的款式可以反复换穿。未购买的款式可先试穿预览，看清价格后再点购买，重复穿戴不再收费。'},
    {h:'正面和背面都看看',p:'拖动画面可旋转大喵，也可以点“看正面 / 看背面”。穿戴会保存并同步到小镇和带有大喵的小游戏，暖暖的衣服与上班方案不受影响；家园里的雕像保持经典外观。'},
  ]},
  photo:{version:2,title:'相机与循环姿势',pages:[
    {h:'自拍与拍别人',p:'在莱拉处买相机后从拍照入口打开。自拍围绕暖暖取景；拍别人可调整镜头方向。拖动方向与视角一致，自拍杆解锁拉近拉远，支架可固定镜头并定时拍摄。'},
    {h:'直接挑一个动作',p:'点“姿势”展开动作栏，左右滑动直接选择，不会拖动取景镜头。站好、开心、转圈免费，其他动作在莱拉处学会；未购项保留价格提示。'},
    {h:'动作会一直循环',p:'自拍或放下支架后，已选动作会连续循环，便于等到喜欢的瞬间按快门。移动时暂停摆姿势，停下继续；手持拍别人时不摆自己的动作。收起相机恢复正常行走。'},
  ]},
  photoShop:{version:2,title:'莱拉的相机与姿势课',pages:[
    {h:'从相机开始',p:'莱拉出售相机、自拍杆和支架。相机是拍照与学习姿势的前置；自拍杆用于调整距离，支架用于固定镜头。物品与动作都是一次购买、长期保留。'},
    {h:'七个可学会的新姿势',p:'站好、开心、转圈免费，其余 7 个动作的缩略图就是实际预览。先看商品价格，再点“学会”；金币不够、离开摊位或已经学会时不会重复扣费。相机的姿势栏也能查看未购提示。'},
  ]},
  calendar:{title:'四季、镇历与睡觉',pages:[
    {h:'一季 21 个小镇日',p:'每月 7 天。3—5 月春，6—8 月夏，9—11 月秋，12—2 月冬；树叶、草地、屋顶与飘落物随季节变化。冬天有积雪，室内不飘雪，自己的农田和铺地仍保留颜色。'},
    {h:'按自己的节奏生活',p:'昼夜可选原速、悠闲或慢生活，也可让装修和拍照暂停镇时钟。在自己家确认休息，可睡到次日清晨；居民行程、季节和节日随小镇日历改变。'},
    {h:'现实计时不会跳过',p:'每日订单、签到和诺诺伊亲密互动按设备本地零点刷新，作物按实际经过时间生长。睡觉和调整昼夜速度不会加速或刷新这些现实计时内容。'},
  ]},
  festival:{version:3,title:'四个节日与小镇布景',pages:[
    {h:'看横幅参加当前节日',p:'樱花祭、夏日祭、丰收节和初雪祭按小镇日历轮换，各有不同装饰。点节日横幅查看日期和当期内容；节日结束，临时布景自动撤除，不会移走自己的家具。'},
    {h:'先听邀请，再动手',p:'在广场附近靠近当期活动场景，先看居民邀请、三个阶段和完成说明，再点“开始这次小聚”。春天跟小桃编花与自由设计，夏天同七弦完成三段鼓谱，秋天为三位居民配野餐篮，冬天与诺诺伊滚雪、搭建并装扮雪人。'},
    {h:'慢慢完成，留下纪念',p:'活动没有营业倒计时。提示、撤回和暂停按各玩法提供，已经做好的一部分不会因普通误触全部清空；四项各有首次教程，也能在帮助目录重看。完成后留下当天的参与纪念，首次和重玩均不发金币或物品，也不消耗真实背包材料。'},
    {h:'节日结束会告别',p:'居民有对应的节日对白，限定鱼与原有节日效果继续保留。睡觉换日、跨年和读档会同步节日状态；过期活动会关闭，临时布景自动撤下。未完成的小聚不当作已完成纪念，下次参加可以重新体验。'},
  ]},
  springWreath:{version:2,title:'樱花祭：编一份自己的春天',pages:[
    {h:'第一圈，照着花样编',p:'先跟小桃编五枝花材。看上方从左到右的花样，选择粉樱花、白小花或嫩绿叶，花环会显示已经编好的位置。选错只把这一枝放回，前面都保留；也可以撤回上一枝。编好后手动进入下一圈。'},
    {h:'第二圈，记一记六枝花样',p:'先看清六枝花样，准备好再点“收起花样，开始编”。忘记时随时点“看看花样”，提示不会扣分；收起提示后可以继续。没有记忆倒计时，仍可撤回上一枝，六枝完成后再进入自由设计。'},
    {h:'第三圈，选自己的配色',p:'自由组合八枝花材，同一种可以重复，没有唯一答案。挑樱桃红、晴空蓝或奶油黄缎带，再决定送给小桃、送给诺诺伊，或者留给自己；选择会改变完成时的花环预览与对白。'},
    {h:'亲手系结送出',p:'八枝、缎带和收花人都选好后，点“系好缎带，送出心意”才完成三圈活动。完成页保留本次配色与赠送小故事；当天只记录参与纪念，不消耗背包花材，不发金币或真实物品，仍可重玩。'},
  ]},
  summerDrum:{version:2,title:'夏日祭：三段海风合奏',pages:[
    {h:'先听三拍，再轮流接四拍',p:'先点“开始听拍”，光点才开始移动。第一段跟上三拍，任一面鼓都可以；第二段按鼓谱左、右、左、右接四拍。每段完成后，准备好再点继续，已经完成的拍数都会保留。'},
    {h:'看金色区，也看下一面鼓',p:'亮起的鼓谱格是下一拍。光点进入金色区时点左鼓或右鼓，电脑也可按 F 敲左鼓、J 敲右鼓。两鼓音高不同，不开声音也能看提示完成。每圈只落一槌，敲早、敲晚或敲错鼓后等下一圈，不会清空已有进度。'},
    {h:'最后五拍，合成小合奏',p:'第三段有五拍和一点左右变化，照当前鼓谱慢慢完成。漏过整圈不扣进度。可点“歇一小会儿”暂停；失焦或切后台也会暂停，回来后手动继续当前小节。'},
    {h:'十二拍的夏日纪念',p:'三段共十二拍完成后，展示稳定拍、最长连击和调整落槌次数，七弦会留下合奏对白。这里没有爱心或失败倒计时，不收费用、不消耗背包，也不发金币或物品；完成只记当天的参与纪念，可以再玩。'},
  ]},
  harvestBasket:{version:2,title:'丰收节：三份野餐订单',pages:[
    {h:'读三位居民的小纸条',p:'依次给小满配热汤篮、给青禾配果香篮、给七弦配分享篮。每张订单有自己的目标重量，以当前面板为准；还要满足材料条件，不能只把数字凑齐。'},
    {h:'重量刚好，材料也要对',p:'南瓜算 3 份重量，苹果算 2 份，麦穗算 1 份。小满至少要南瓜和麦穗；青禾至少要两个苹果和一束麦穗，不能放南瓜；七弦三种都要。要求满足时会打勾，每篮支持多种正确配法。'},
    {h:'可以取回，不必整篮重装',p:'点食材加入篮子；点篮中某一份就能单独取回，也能撤回最后一份。重量不够、超重或材料不合适时，篮中内容保留并提示原因。“看看一种配法”会给出一个可行组合，不替你自动完成。'},
    {h:'称好后，再亲手交付',p:'点“称一称，核对小纸条”，重量和材料都合格后才可交给居民。三篮逐一交付后一起入席，完成页展示各篮配法。食材都是活动道具，不消耗真实背包，不发金币或物品，只留下当天纪念，仍可重玩。'},
  ]},
  winterSnowman:{version:2,title:'初雪祭：雪人的冬日纪念',pages:[
    {h:'先把三团雪滚好',p:'大、中、小雪球目标大小分别是 100、72、44，目标上下 4 的绿色范围都能用。用“大步滚 +12”快速增大，接近时“轻滚 +4”，滚大了可以“修整 −4”。每团进绿色区后，还要点“这团做好了”确认。'},
    {h:'按大小搭起，再扶到中线',p:'三团都做好后进入搭建。依次拿起大、中、小雪球，放作底座、身体、头部；用左右按钮把拿起的雪团移到中线，再放稳。选错或没有对齐时会提示，不会让雪人倒塌；也可取下最上层重新调整。'},
    {h:'给它挑装扮和名字',p:'搭好后选玫红或晴蓝围巾，戴绒球帽、小桶帽或不戴帽子，再选笑脸、眨眼或眯眼。名字可选暖团、小冬、雪绵、晴晴；预览即时更新，四项都可以反复更换。'},
    {h:'满意后，留下冬日纪念',p:'四项选好后点合照，才完成活动内的雪人纪念，不会自动生成相机照片。完成前可回到上一步；重新修整雪球后需重新搭建，其他雪球和装扮保留。活动免费，不消耗背包、不发金币或物品，完成后可重玩。'},
  ]},
  companion:{title:'诺诺伊的共同回忆',pages:[
    {h:'一起做一件小事',p:'亲密度达到 2 / 5 / 8 后依次解锁喝茶、一起布置角落和合影。面板能查看条件；相约或交回任务时要到诺诺伊附近，跟着对白到指定位置完成真正的行动。'},
    {h:'记录留下，奖励只领一次',p:'喝茶要到她家茶角；共同布置要在约定区域正式完成装修，摆下又撤销不算；合影要实际拍到诺诺伊。完成后可重看对白和日记，首次奖励不会重复发放，也不替代平日聊天送礼。'},
  ]},
  community:{title:'邻里花园与海风休憩点',pages:[
    {h:'长期分期建设',p:'面包房完成后开放邻里花园，花园完成后再建设海风休憩点。面板会列出前置条件、各期费用与已出资金额；金币真实扣除，可分次慢慢完成，进度随存档保留。'},
    {h:'建设会改变场景',p:'每一期都能看到场景变化，完工后有可互动纪念物。未解锁项目可查看条件，已完成项目不再收钱；建设区保留道路与居民入口。'},
  ]},
  project:{title:'建设第五家面包房',pages:[
    {h:'在东边工地出资',p:'面包房分阶段建造，可以按按钮分次出资，也可补齐本期。每期都会改变工地模型；真实扣款后进度保存，未建成时不能直接营业。'},
    {h:'建成以后',p:'完工后进入麦香面包房，和其它四家店一样可选关卡、无尽与升级；后续还会开放公共建设。面包房看火候、展示架和交付订单的规则，会在首次开店时介绍。'},
  ]},
  daily:{title:'每日订单与七日签到',pages:[
    {h:'按现实日期刷新',p:'每天会自动记录订单进度，不必先开面板接单；完成后要点领取，达到宝箱要求还可再领奖。订单和签到按设备本地零点刷新，不跟小镇睡觉一起跳日。'},
    {h:'记得领取',p:'签到每个现实日期一次，七日奖励按界面显示。重复点击已领取项不会再发奖励；跨到现实次日时，打开的面板会更新。'},
  ]},
  book:{title:'图鉴与收藏奖励',pages:[
    {h:'做过才会收录',p:'鱼、作物、花卉、套装与居民等收藏由实际游玩逐步记录。未发现的条目会显示提示；打开图鉴或预览图标本身不会替你完成收集。'},
    {h:'按页领取',p:'集齐某页必要条目后，底部奖励按钮可领取一次。标为节日限定的条目有自己的出现时机，界面会标出可选条目，不必为了领普通页奖励一直等节日。'},
  ]},
  residents:{title:'居民日常与记录',pages:[
    {h:'看看今天的新点子',p:'更多 → 居民能查看试烤、巡田、搭配点评、钓鱼记录、剪报和诗签。不同居民有不同条件，先读面板，再开始记录或完成要求；小镇日常按镇历更新。'},
    {h:'日常与旧委托分开',p:'居民日常、旧委托和访客故事各自保存，任务清单可以统一追踪。需要本人在场的聊天或交付，请走到居民附近；已领取反馈不会重复发放。'},
  ]},
  visitors:{title:'来访人物与小镇故事',pages:[
    {h:'人物档案可随时翻看',p:'更多 → 人物收录来访角色资料、位置与故事；显示敬请期待的人物尚未加入小镇。诺诺伊有白天与晚间行程，其它角色在自己的摊位或登记处活动。'},
    {h:'和本人说话开始故事',p:'达达的记录、诺诺伊找零件、小马尔克斯的穿搭推荐与乔万尼的心愿各有实际任务或奖励。按对话里的条件完成，再找本人继续。诺诺伊日常亲密聊天按现实日期；共同回忆另有专门面板。'},
  ]},
  visits:{title:'居民来家里做客',pages:[
    {h:'美化自己的家',p:'美化度阶段奖励会解锁居民来访。来访在进入后院时检查，转场或对话结束后才显示，不会每一帧重复抽取。'},
    {h:'看看评价，收下礼物',p:'来访卡片会展示居民的话和家园评价；礼物按按钮领取一次。已领取或过期的来访不会重复奖励。'},
  ]},
  milestones:{title:'家园美化与阶段奖励',pages:[
    {h:'摆好再领取',p:'家具和扩建提高美化度。达到阶段后在面板领取噗灵、地面或摆件，有的阶段会解锁来访。读面板中的门槛与奖励，达到条件不等于已经领取。'},
    {h:'奖励与撤销',p:'领取与美化有关的不可逆奖励会提交当前装修历史，防止摆下领奖后撤销循环领取；已领的阶段会保留标记。'},
  ]},
  tasks:{title:'任务清单与方向追踪',pages:[
    {h:'把进度放在一起看',p:'点任务栏打开清单，可查看引导任务、居民委托、每日订单、居民日常和来访记录。列表直接读取真实进度，不会替你领取奖励。'},
    {h:'选一个追踪',p:'点追踪可切换屏幕上的方向指引；跨房间的目标会先指向出入口。完成后仍按任务要求找本人交付或在对应面板领取。'},
  ]},
  achievements:{title:'成就与领奖',pages:[{h:'成就达成后还要领取',p:'更多 → 成就记录打工、种田、收集、家园和居民互动。达成后会有提示，可以单项领取或全部领取。隐藏成就需要实际探索；重看教程不会直接完成成就。'}]},
  settings:{title:'设置与保存',pages:[{h:'设置有四个常用入口',p:'操作与显示可调左右手、摇杆、字号与按钮；画面与性能可单独调帧率并记录运行情况；日历与时间可调镇历速度；存档导出/导入负责换设备。玩法帮助随时重看全部教程。'}]},
  controls:{title:'左右手与屏幕操作',pages:[{h:'调到自己顺手',p:'可以切换移动摇杆的左右手位置，调整摇杆大小、边距、镜头灵敏度、字号和按钮大小。设置即时保存；互动按钮会去另一侧。网页若不能锁定方向，直接旋转手机并检查系统方向锁。'}]},
  performance:{title:'画面、帧率与本机记录',pages:[{h:'画质和帧率分别选',p:'精致、均衡、省电控制画面开销；30 / 60 帧是上限，不保证每台手机都达到。切到后台会停止渲染，并暂停小游戏音乐和判定。可记录 1 或 5 分钟运行情况，再导出或复制；记录不上传，也不测手机温度。'}]},
  save:{title:'导出、导入与恢复点',pages:[
    {h:'存档在当前浏览器',p:'平时会自动保存，但换浏览器或设备不会自动同步。可导出 JSON 文件，也可显示存档文本后自行复制；两者都包含游戏进度，请妥善保留。'},
    {h:'先预览再确认',p:'导入先检查格式并显示进度摘要，确认后才替换当前档；成功导入会单独保留导入前恢复点。出错的文件不会写入当前档。恢复点与五分钟自动备份分开，下一次成功导入才替换它。'},
  ]},
  fun:{title:'小镇小玩具与每日小礼物',pages:[
    {h:'顺路玩一下',p:'扭蛋机每次 30 噗灵，每个小镇日最多 5 次，奖品随机。八音盒可以听曲，弹弹蘑菇可以跳跃；幸运签筒和岸边漂流瓶有各自的小镇日次数。'},
    {h:'注意不同的日历',p:'这些小玩具按小镇日历更新，已领取的小礼物不会重复发放。喷泉许愿每次需要 5 噗灵，有时会回礼；不保证每次都有奖励。钢琴是另一种自己演奏的家具，在自己的屋内使用。'},
  ]},
  piano:{title:'三排钢琴键盘',pages:[
    {h:'21 键，三排七音',p:'在家走近钢琴并互动，打开三排键盘：高音、中音、低音各 7 个音。触屏直接点同样布局的琴键；电脑用 Q W E R T Y U 弹高音，A S D F G H J 弹中音，Z X C V B N M 弹低音。'},
    {h:'和弦、延音与止音',p:'可以同时按多个键或用多指弹和弦；空格控制延音，面板也提供延音与止音操作。琴窗打开时暂停人物移动、暂时让背景音乐让位；关闭会停止琴音并恢复背景音乐，不把弹奏的字母键继续当成移动。'},
  ]},
});
for(const [category,ids]of Object.entries({
  '开始与任务':['welcome','camera','tasks','req','achievements'],
  '五店营业':['levels','endless','cafe','flower','tailor','fish','bakery','project'],
  '家园与装修':['house','yard','farm','giantCrops','recycle','decor','decorCamera','partitions','layouts','expansion','furniture','piano','milestones','visits'],
  '衣橱与拍照':['wardrobe','momo','photo','photoShop'],
  '小镇生活':['calendar','festival','springWreath','summerDrum','harvestBasket','winterSnowman','daily','book','residents','visitors','companion','community','fun'],
  '设置与存档':['settings','controls','performance','save'],
}))for(const id of ids)TUTORIALS[id].category=category;

// ——— 院子扩建 ———（可布置范围：格子 x 0..x1、z 0..z1）
export const YARDS = [
  { lv: 1, name: '小院', x1: 27, z1: 17, price: 0, beauty: 0, note: '刚好放下一栋小屋和几块田' },
  { lv: 2, name: '花园', x1: 37, z1: 17, price: 1800, beauty: 60, note: '向东拓宽，多出一整片草地' },
  { lv: 3, name: '庄园', x1: 37, z1: 21, price: 4800, beauty: 140, note: '向南推进，够摆一座旋转木马' },
  { lv: 4, name: '梦幻庄园', x1: 37, z1: 25, price: 9600, beauty: 260, note: '整座小岛都是你的后院' },
];

// ——— 小镇居民 ———（like：偏爱的穿搭风格；egg：各自藏着的小彩蛋）
export const NPCS = [
  { id: 'man', name: '小满', job: '面包店学徒', like: 'sweet',
    hello: '你好呀！我是小满，在面包店当学徒。你身上有奶油的味道，一定常去咖啡屋吧？',
    lines: ['今天的可颂烤得刚刚好，可惜被大喵先尝了一口。', '听说咖啡屋的客人最喜欢甜美风的店员，穿对衣服小费都多。', '我在练习拉花，目前只会拉出一团云。', '甜点自动补货？那是我凌晨四点起来烤的啦！'],
    night: ['这么晚还不睡，是在等刚出炉的夜宵吗？', '晚上的小镇有黄油的香味，你闻到了吗？'],
    gift: '这个给你，今天多烤的，别告诉店长！', friend: '我们已经是好朋友啦！这是我攒的零花钱，拿去买条新裙子吧。' },
  { id: 'he', name: '青禾', job: '花农', like: 'fresh',
    hello: '我是青禾，花语小筑的花都是我种的。你的后院也种东西吗？',
    lines: ['浇过水的作物长得快，别偷懒哦。', '回收小铺每天都有一种作物特别值钱，看准了再卖。', '向日葵要等久一点，但它最值得。', '田地是可以挪位置的，在装修里重新摆就行。'],
    night: ['夜里花会睡觉，说话要小声一点。', '月光下的郁金香像一排小灯笼。'],
    gift: '这是今早多出来的花钱，拿着拿着。', friend: '把你当自己人了！这笔钱算我入股你的后院。' },
  { id: 'xu', name: '阿絮', job: '裁缝铺常客', like: 'elegant',
    hello: '我叫阿絮，每周都要去星梦裁缝铺看新布料。你的衣服是在搭配小屋买的吗？',
    lines: ['一整套穿齐了，会有人夸你的——比如我。', '缝纫机踩到节拍上的时候，线迹会自己发光呢。', '典雅不是颜色深，是把每一颗纽扣都扣好。', '我在等「绘色未明」那顶玫瑰宽檐帽降价，等了很久了。'],
    night: ['夜色是最好看的一匹布，可惜没人裁得下来。', '晚上逛街不用排试衣间，真好。'],
    gift: '上次你帮裁缝铺赶工，这是老板托我带的谢礼。', friend: '我认定你是小镇最会穿的人了！一点心意，别推辞。' },
  { id: 'shi', name: '石头', job: '钓鱼佬', like: 'cool',
    hello: '嗯……我是石头。钓场那边的。鱼不咬钩的时候我就出来走走。',
    lines: ['浮漂一沉就按住，早了晚了都白搭。', '大鱼会突然发力，别慌，松一下再收。', '今天空军了。不说了。', '帅气的人钓到的鱼都比较大，这是科学。'],
    night: ['夜钓才是真功夫。可惜钓场晚上不开门。', '星星倒映在水里的时候，鱼也会抬头看。'],
    gift: '……给。卖鱼的钱，分你一点。', friend: '你是我见过最有耐心的人。这个你拿着，买根好竿。' },
  { id: 'nuo', name: '小桃', job: '暖暖的小粉丝', like: 'sweet', egg: 'fan',
    hello: '是、是暖暖！我是小桃，我有你每一套衣服的剪报！',
    lines: ['你今天的发型我明天就要学！', '我在攒钱买「轻盈泡泡」，还差好多好多。', '大喵可以摸一下吗？就一下！', '你走路的样子都好好看呀。'],
    night: ['晚上也能遇到你，今天是幸运日！', '妈妈说天黑要回家，可是我想再看你一会儿。'],
    gift: '这是我的零花钱！请、请收下！', friend: '我们是好朋友了对不对！这是我全部的压岁钱！' },
  { id: 'qi', name: '七弦', job: '云游诗人', like: 'elegant', egg: 'night',
    hello: '在下七弦，走到哪儿唱到哪儿。这座小镇的风，是甜的。',
    lines: ['白天的故事留给白天，我的好故事要等到晚上才讲。', '你听，彩旗被风吹动的声音，是四分之三拍。', '诗人不种地，但诗人知道草莓什么时候最甜。', '镜头转一转，同一座小镇会变成另一首诗。'],
    night: ['夜深了，告诉你一个秘密：对着喷泉许愿，每到第七次，喷泉一定会回礼。', '星星出来的时候，把愿望说给喷泉听——记得数到七。'],
    gift: '方才那首歌是为你写的，这是听众的赏钱，分你一半。', friend: '知音难得。这袋盘缠你收着，我的下一首歌写你。' },
];

// ——— 成就 ———（stat：统计键；hidden：达成前不显示内容）
export const ACHS = [
  { id: 'a_work1', name: '第一份工资', desc: '完成一次打工', stat: 'plays', need: 1, reward: 50, tone: 'pink' },
  { id: 'a_work2', name: '打工达人', desc: '累计打工 20 次', stat: 'plays', need: 20, reward: 300, tone: 'pink' },
  { id: 'a_work3', name: '小镇劳模', desc: '累计打工 60 次', stat: 'plays', need: 60, reward: 900, tone: 'gold' },
  { id: 'a_all4', name: '五店巡礼', desc: '五家店都打过工', stat: 'shops_played', need: 5, reward: 200, tone: 'mint' },
  { id: 'a_star', name: '完美的一天', desc: '在任意一家店拿到三星', stat: 'star3', need: 1, reward: 200, tone: 'gold' },
  { id: 'a_star4', name: '全能店员', desc: '五家店都拿过三星', stat: 'shops_star3', need: 5, reward: 800, tone: 'gold' },
  { id: 'a_shop', name: '金字招牌', desc: '把一家店升到 Lv.5', stat: 'shopmax', need: 1, reward: 600, tone: 'lav' },
  { id: 'a_rich1', name: '第一桶金', desc: '累计赚到 5,000 噗灵', stat: 'earned', need: 5000, reward: 200, tone: 'gold' },
  { id: 'a_rich2', name: '小富婆', desc: '累计赚到 50,000 噗灵', stat: 'earned', need: 50000, reward: 1500, tone: 'gold' },
  { id: 'a_farm1', name: '第一次丰收', desc: '收获 10 株作物', stat: 'harvested', need: 10, reward: 80, tone: 'mint' },
  { id: 'a_farm2', name: '田园诗', desc: '收获 200 株作物', stat: 'harvested', need: 200, reward: 600, tone: 'mint' },
  { id: 'a_water', name: '勤劳的小水壶', desc: '浇水 100 次', stat: 'watered', need: 100, reward: 300, tone: 'sky' },
  { id: 'a_cloth1', name: '衣橱初成', desc: '拥有 10 件服饰', stat: 'wardrobe', need: 10, reward: 150, tone: 'pink' },
  { id: 'a_cloth2', name: '搭配师', desc: '拥有 40 件服饰', stat: 'wardrobe', need: 40, reward: 1200, tone: 'lav' },
  { id: 'a_set', name: '一整套才对味', desc: '穿齐一整套新套装（初始套装不算）去和居民聊天', stat: 'egg_set', need: 1, reward: 200, tone: 'lav' },
  { id: 'a_decor1', name: '有了家的样子', desc: '摆放 10 件家具', stat: 'placed', need: 10, reward: 120, tone: 'sky' },
  { id: 'a_beauty', name: '远近闻名', desc: '家园美化度达到 600', stat: 'beauty', need: 600, reward: 800, tone: 'pink' },
  { id: 'a_house', name: '云朵上的家', desc: '把小屋升级成云朵城堡', stat: 'house', need: 3, reward: 1000, tone: 'sky' },
  { id: 'a_yard1', name: '开疆拓土', desc: '第一次扩建院子', stat: 'yard', need: 2, reward: 200, tone: 'mint' },
  { id: 'a_yard2', name: '岛主', desc: '把院子扩建到梦幻庄园', stat: 'yard', need: 4, reward: 1500, tone: 'gold' },
  { id: 'a_meet', name: '小镇万事通', desc: '和 6 位居民都聊过天', stat: 'met', need: 6, reward: 200, tone: 'sky' },
  { id: 'a_friend', name: '知心好友', desc: '和一位居民成为好朋友', stat: 'friends', need: 1, reward: 300, tone: 'pink' },
  { id: 'a_friends', name: '人见人爱', desc: '和 6 位居民都成为好朋友', stat: 'friends', need: 6, reward: 2000, tone: 'gold' },
  { id: 'a_stage1', name: '闯关新手', desc: '关卡模式累计过 5 关', stat: 'stages', need: 5, reward: 200, tone: 'pink' },
  { id: 'a_stage2', name: '过关斩将', desc: '关卡模式累计过 30 关', stat: 'stages', need: 30, reward: 1500, tone: 'gold' },
  { id: 'a_endless', name: '停不下来', desc: '无尽模式单局营业额达到 400', stat: 'endless_best', need: 400, reward: 600, tone: 'lav' },
  { id: 'a_tree', name: '前人栽树', desc: '种下第一棵果树', stat: 'trees', need: 1, reward: 150, tone: 'mint' },
  { id: 'a_fruit', name: '果园主', desc: '累计摘下 60 个果子', stat: 'fruits', need: 60, reward: 800, tone: 'gold' },
  { id: 'a_req1', name: '乐于助人', desc: '完成 1 个居民委托', stat: 'reqs', need: 1, reward: 100, tone: 'mint' },
  { id: 'a_req2', name: '小镇热心肠', desc: '完成 15 个居民委托', stat: 'reqs', need: 15, reward: 800, tone: 'gold' },
  { id: 'a_req3', name: '有求必应', desc: '6 位居民的委托都帮过', stat: 'req_people', need: 6, reward: 500, tone: 'sky' },
  { id: 'a_quest', name: '毕业啦', desc: '完成全部引导任务', stat: 'quest', need: 15, reward: 500, tone: 'lav' },
  { id: 'a_fan', name: '小尾巴', desc: '让小粉丝小桃跟着你走了一段路', stat: 'egg_fan', need: 1, reward: 150, tone: 'pink', hidden: true },
  { id: 'a_night', name: '夜里的秘密', desc: '在夜里听七弦讲了喷泉的秘密', stat: 'egg_night', need: 1, reward: 150, tone: 'lav', hidden: true },
  { id: 'a_seven', name: '数到七', desc: '第七次许愿，喷泉真的回礼了', stat: 'egg_seven', need: 1, reward: 177, tone: 'sky', hidden: true },
  { id: 'a_like', name: '投其所好', desc: '穿着居民偏爱的风格被夸奖了', stat: 'egg_like', need: 1, reward: 120, tone: 'mint', hidden: true },
  { id: 'a_peek', name: '非礼勿视', desc: '被提醒了一次：这样做是不对的', stat: 'egg_peek', need: 1, reward: 1, tone: 'sky', hidden: true },
];

// ——— 居民的家 ———（小镇上的位置与配色；门口可以拜访、接委托）
export const HOMES = {
  // 住宅区在小镇西边：两排三栋，都朝南开门。北排门前是樱花巷，南排门前就是主路
  man: { x: -40.2, z: -10, kind: 'bakery', wall: '#fff1dc', roof: '#f6a56b', door: '#d98a52' },
  he: { x: -35, z: -10, kind: 'greenhouse', wall: '#f3fbe9', roof: '#7fcf8f', door: '#5fae72' },
  xu: { x: -29.8, z: -10, kind: 'townhouse', wall: '#f6f0ff', roof: '#b39be8', door: '#8f77cf' },
  shi: { x: -40.2, z: -0.7, kind: 'cabin', wall: '#eef6fb', roof: '#6faede', door: '#4f8fc2' },
  nuo: { x: -35, z: -0.7, kind: 'candy', wall: '#fff0f5', roof: '#ff9fbd', door: '#f0679a' },
  qi: { x: -29.8, z: -0.7, kind: 'tower', wall: '#fbf6e6', roof: '#c9a45a', door: '#a8843f' },
};

// ——— 居民委托 ———
// type: score 在指定店铺单局营业额达到 n / deliver 带来 n 个作物 / stat 接下委托后某项统计增加 n /
//       wear 穿着 n 件指定风格来见面 / night 夜里来见面
export const REQS = {
  man: [
    { type: 'score', shop: 'cafe', n: 120, title: '帮店里撑一场', text: '在甜心咖啡屋单局营业额达到 120', say: '店长说今天人手不够……你能去咖啡屋顶一场吗？', reward: 160 },
    { type: 'deliver', crop: 'strawberry', n: 3, title: '草莓蛋糕缺草莓', text: '带 3 个奶油草莓给小满', say: '我想练草莓蛋糕，可是草莓被大喵吃光了。', reward: 240 },
    { type: 'stat', stat: 'play_cafe', n: 2, title: '陪我练手', text: '去甜心咖啡屋打工 2 次', say: '你端盘子的样子我想多看几遍，学一学！', reward: 200 },
    { type: 'score', shop: 'cafe', n: 220, title: '周末大客流', text: '在甜心咖啡屋单局营业额达到 220', say: '周末的客人像潮水一样，只有你顶得住。', reward: 360 },
  ],
  he: [
    { type: 'stat', stat: 'watered', n: 6, title: '别让它们渴着', text: '给作物浇水 6 次', say: '这两天太阳大，后院的苗该喝水啦。', reward: 120 },
    { type: 'deliver', crop: 'tulip', n: 2, title: '借两枝郁金香', text: '带 2 个郁金香给青禾', say: '花店订了一束郁金香，我这儿刚好差两枝。', reward: 260 },
    { type: 'stat', stat: 'harvested', n: 8, title: '丰收的手感', text: '收获 8 株作物', say: '种地的人要多收几茬，手才不生。', reward: 220 },
    { type: 'deliver', crop: 'apple', n: 3, title: '想做苹果酱', text: '带 3 个苹果给青禾', say: '听说你后院能种果树了？我想讨几个苹果做酱。', reward: 320 },
    { type: 'score', shop: 'flower', n: 150, title: '花店的大单', text: '在花语小筑单局营业额达到 150', say: '今天订单堆成山，帮花店合几束好的吧。', reward: 320 },
    { type: 'deliver', crop: 'sunflower', n: 2, title: '向日葵的种子', text: '带 2 个向日葵给青禾', say: '我想留点向日葵的种，你种的最饱满。', reward: 900 },
  ],
  xu: [
    { type: 'wear', style: 'elegant', n: 2, title: '让我看看典雅风', text: '穿着 2 件「典雅」风格的服饰来见阿絮', say: '我在研究典雅的搭配，你穿两件给我看看？', reward: 180 },
    { type: 'stat', stat: 'play_tailor', n: 2, title: '帮裁缝铺赶工', text: '去星梦裁缝铺打工 2 次', say: '我订的裙子还没缝好……你能去帮帮忙吗？', reward: 220 },
    { type: 'stat', stat: 'bought_clothes', n: 1, title: '陪我逛街', text: '去搭配小屋买 1 件新衣服', say: '一个人逛街没意思，你买一件，我替你高兴。', reward: 260 },
    { type: 'score', shop: 'tailor', n: 140, title: '线迹要发光', text: '在星梦裁缝铺单局营业额达到 140', say: '踩准节拍的线迹会发光，我想再看一次。', reward: 340 },
  ],
  shi: [
    { type: 'score', shop: 'fish', n: 60, title: '替我钓一竿', text: '在悠然钓场单局营业额达到 60', say: '……今天空军。你去，替我钓一竿。', reward: 160 },
    { type: 'stat', stat: 'play_fish', n: 2, title: '多甩几竿', text: '去悠然钓场打工 2 次', say: '钓鱼这事，急不得。多去几次。', reward: 200 },
    { type: 'deliver', crop: 'pumpkin', n: 2, title: '南瓜炖鱼', text: '带 2 个小南瓜给石头', say: '鱼有了。缺南瓜。', reward: 580 },
    { type: 'score', shop: 'fish', n: 130, title: '大鱼', text: '在悠然钓场单局营业额达到 130', say: '那条大的，我盯了三天。你来。', reward: 380 },
  ],
  nuo: [
    { type: 'wear', style: 'sweet', n: 3, title: '想看甜美的暖暖', text: '穿着 3 件「甜美」风格的服饰来见小桃', say: '可以……可以穿一身甜甜的给我看吗！', reward: 150 },
    { type: 'stat', stat: 'wishes', n: 3, title: '替我许个愿', text: '对喷泉许愿 3 次', say: '我的零花钱不够投喷泉了，你能替我许愿吗？', reward: 160 },
    { type: 'stat', stat: 'placed', n: 2, title: '想看你的家', text: '在家里或后院摆放 2 件家具', say: '你的家一定很好看吧！再摆两件，我去偷偷看！', reward: 200 },
    { type: 'deliver', crop: 'radish', n: 5, title: '给大喵的零食', text: '带 5 个樱桃萝卜给小桃', say: '我想喂大喵！听说它喜欢樱桃萝卜？', reward: 220 },
  ],
  qi: [
    { type: 'night', title: '月下听歌', text: '在夜里来见七弦', say: '我的新歌只在月亮出来以后唱。夜里来找我。', reward: 150 },
    { type: 'stat', stat: 'npc_talk', n: 5, title: '替我采风', text: '和居民们聊天 5 次', say: '诗人要听很多人说话。你替我去听一听。', reward: 180 },
    { type: 'deliver', crop: 'rose', n: 1, title: '一朵星光玫瑰', text: '带 1 个星光玫瑰给七弦', say: '下一首歌写的是星光玫瑰，可我从没见过真的。', reward: 880 },
    { type: 'stat', stat: 'plays', n: 4, title: '小镇的一天', text: '在任意店铺打工 4 次', say: '把你忙碌的一天讲给我听，我把它写成歌。', reward: 300 },
  ],
};
