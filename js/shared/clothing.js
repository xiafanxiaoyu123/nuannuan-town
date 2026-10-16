// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
import { PREMIUM_SETS } from '../premium-outfits.js';
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

