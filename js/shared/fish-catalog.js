// 鱼种数据供模型、玩法与存档校验共用；不加载渲染依赖。
export const FISH = [
  { id: 'silver', name: '小银鱼', price: 12, diff: 0.6, ai: 'smooth', color: '#cfe0ee', fin: '#9fb8cf', w: 34 },
  { id: 'whisker', name: '胡须鱼', price: 20, diff: 0.9, ai: 'sink', color: '#f3b27a', fin: '#d98a4a', w: 28, whisker: true },
  { id: 'puffer', name: '泡泡河豚', price: 26, diff: 1.0, ai: 'float', color: '#ffe9a8', fin: '#f0b85a', w: 16, shape: 'puffer', belly: '#fffaf0' },
  { id: 'blue', name: '蓝鳍鱼', price: 30, diff: 1.2, ai: 'mixed', color: '#7fc4f5', fin: '#3f73c4', w: 20 },
  { id: 'koi', name: '锦鲤', price: 38, diff: 1.35, ai: 'smooth', color: '#fffdf8', fin: '#ff8a5c', w: 12, shape: 'koi', patch: '#ff7a4d', patch2: '#3d3550' },
  { id: 'stripe', name: '彩纹鱼', price: 44, diff: 1.5, ai: 'dart', color: '#ff9fbd', fin: '#b9a4f2', w: 12, stripe: '#ffffff' },
  { id: 'lantern', name: '灯笼鱼', price: 56, diff: 1.7, ai: 'sink', color: '#6a58a0', fin: '#463a78', w: 8, shape: 'lantern', lamp: '#ffe27a' },
  { id: 'gold', name: '金鳞鱼', price: 72, diff: 1.9, ai: 'float', color: '#ffd24f', fin: '#f0a53a', w: 6, glow: true },
  { id: 'moon', name: '月光鳐', price: 96, diff: 2.1, ai: 'mixed', color: '#cfd9ff', fin: '#9fb0f0', w: 3, shape: 'ray', glow: true },
  // 节日限定：只有对应节日期间才会上钩
  { id: 'f_sakura', name: '樱花鲷', price: 60, diff: 1.4, ai: 'smooth', color: '#ffc2d6', fin: '#ff8fb1', w: 12, fest: 'sakura', petal: '#ffffff' },
  { id: 'f_summer', name: '西瓜鱼', price: 60, diff: 1.4, ai: 'dart', color: '#7ccf7a', fin: '#3f9a52', w: 12, fest: 'summer', stripe: '#3f9a52', belly: '#ff7f8f' },
  { id: 'f_harvest', name: '南瓜鱼', price: 60, diff: 1.4, ai: 'float', color: '#f6a03c', fin: '#d97b1e', w: 12, fest: 'harvest', shape: 'puffer', smooth: true, stem: '#6fae5a', belly: '#ffd08a' },
  { id: 'f_snow', name: '雪花鱼', price: 60, diff: 1.4, ai: 'mixed', color: '#eaf6ff', fin: '#9fd6f2', w: 12, fest: 'snow', flake: '#ffffff', glow: true },
];
