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

