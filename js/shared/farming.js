// 共享内容定义：保持稳定 ID 与原有数值；运行时玩家进度由 core/state.js 管理。
// ——— 作物 ———
// 每种作物各有脾气：grow 成熟秒数；yield 一次收几个；water 浇水后剩余时间变成原来的几成（越小越爱喝水）
export const CROPS = [
  { id: 'radish', name: '樱桃萝卜', seed: 10, grow: 25, sell: 22, color: '#ff7f9f', leaf: '#8fd17f', tip: '长得最快，半分钟一茬' },
  { id: 'strawberry', name: '奶油草莓', seed: 28, grow: 70, sell: 30, yield: 2, color: '#f2546b', leaf: '#7cc77a', tip: '一次能收两颗' },
  { id: 'tulip', name: '郁金香', seed: 45, grow: 120, sell: 100, water: 0.4, color: '#ffb347', leaf: '#8fd17f', tip: '特别爱喝水，浇过快一大截' },
  { id: 'pumpkin', name: '小南瓜', seed: 80, grow: 210, sell: 220, color: '#ff9a4a', leaf: '#6fbf73', giant: true, tip: '个头大，慢慢长；成熟时有 0.5% 概率巨大化' },
  { id: 'sunflower', name: '向日葵', seed: 120, grow: 320, sell: 350, water: 0.85, color: '#ffd24f', leaf: '#7cc77a', giant: true, tip: '耐旱；成熟时有 0.5% 概率巨大化' },
  { id: 'rose', name: '星光玫瑰', seed: 220, grow: 520, sell: 680, water: 0.5, color: '#c79bff', leaf: '#6fbf73', giant: true, tip: '最慢也最值钱；成熟时有 0.5% 概率巨大化' },
  { id: 'wheat', name: '金穗小麦', seed: 35, grow: 90, sell: 52, yield: 2, season: 'autumn', color: '#f6c85f', leaf: '#a2d47c', tip: '秋季应季作物；一次收两束麦穗，烘焙与料理最爱' },
  { id: 'blueberry', name: '冰晶蓝莓', seed: 55, grow: 150, sell: 75, yield: 2, season: 'summer', water: 0.45, color: '#6ea8f5', leaf: '#72c58a', tip: '夏季应季浆果；清凉多汁，一次能收两串' },
  { id: 'cotton', name: '暖绒棉花', seed: 95, grow: 240, sell: 240, season: 'winter', water: 0.75, color: '#fff8f2', leaf: '#82bf8a', tip: '冬季耐寒作物；软绵绵的云朵棉球，裁缝铺最爱' },
  { id: 'moonflower', name: '月见花', seed: 160, grow: 380, sell: 460, season: 'spring', water: 0.5, nightBoost: true, giant: true, color: '#a5b8ff', leaf: '#6eae8a', tip: '春季与夜色偏爱之花；夜晚生长更快，成熟时有 0.5% 概率巨大化' },
];
// 果树：种在「果树田」里，不用重种。幼苗不结果；小树每轮结 1 个；长成大树后每轮结 3 个大果
// grow：幼苗长成小树的秒数；big：从种下到长成大树的秒数；cycle：每轮结果的秒数
export const FRUITS = [
  { id: 'apple', name: '苹果', tree: '苹果树', price: 360, sell: 58, grow: 150, big: 600, cycle: 150, color: '#ff6b6b', leaf: '#7cc77a' },
  { id: 'peach', name: '蜜桃', tree: '蜜桃树', price: 620, sell: 96, grow: 210, big: 840, cycle: 200, color: '#ffb0b8', leaf: '#8fd694' },
  { id: 'orange', name: '甜橙', tree: '甜橙树', price: 980, sell: 150, grow: 280, big: 1100, cycle: 250, color: '#ffa53d', leaf: '#5fae72' },
  { id: 'cherry', name: '甜心樱桃', tree: '甜心樱桃树', price: 780, sell: 120, grow: 240, big: 960, cycle: 220, season: 'spring', color: '#e84868', leaf: '#85d18a' },
  { id: 'lemon', name: '香水柠檬', tree: '香水柠檬树', price: 860, sell: 135, grow: 260, big: 1020, cycle: 235, season: 'summer', color: '#ffe055', leaf: '#6bc47d' },
];
export const FRUIT = Object.fromEntries(FRUITS.map((f) => [f.id, f]));
export const CROP = Object.fromEntries([...CROPS, ...FRUITS].map((c) => [c.id, c]));
export const PLOT_MAX = 12;
export const PLOT_START = 6;
export const PLOT_PRICE = (n) => 250 + (n - PLOT_START) * 150;

