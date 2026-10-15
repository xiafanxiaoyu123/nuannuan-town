// 纯数据：存档校验也会使用此目录；不要引入 THREE、state 或 UI。
// 中文为本项目的描述性名称，官方款式以 referenceName 标明；模型均由代码重建。
export const MOMO_CLOAKS = Object.freeze([
  { id: 'classic', price: 0, name: '经典黄斗篷', color: '#f6c544', note: '黄色猫耳兜帽、红色蝴蝶结和尖角下摆。', referenceName: 'Momo', source: 'https://infinitynikki.infoldgames.com/en/home', image: null },
  { id: 'festive', price: 900, name: '红金迎春', color: '#ed643f', note: '红金兜帽、流苏耳饰、盘扣前襟与背后金色团纹。', referenceName: 'Festive', source: 'https://infinitynikki.infoldgames.com/en/news/94', image: 'https://webstatic.infoldgames.com/7d325eec933f05b1/images/bg/tbYXlgP1niINvvmH.jpg' },
  { id: 'coachman', price: 1200, name: '紫夜礼服', color: '#79709c', note: '紫色马甲、单片眼镜、小胡子与燕尾披风。', referenceName: 'Coachman', source: 'https://infinitynikki.infoldgames.com/en/news/94', image: 'https://webstatic.infoldgames.com/7d325eec933f05b1/images/bg/TQYpgBHvGfayO5uN.jpg' },
  { id: 'veil', price: 1800, name: '星纱粉梦', color: '#eeaacb', note: '高猫耳、垂纱、星月金饰与层叠花边。', referenceName: 'Veil', source: 'https://infinitynikki.infoldgames.com/en/news/203', image: 'https://webstatic.infoldgames.com/7d325eec933f05b1/images/bg/2J2LwQSfRFDYAF8a.jpg' },
  { id: 'plush', price: 1500, name: '缎结玩偶', color: '#777783', note: '黑色兜帽、灰蓝荷叶边、红缎结与珍珠缝线。', referenceName: 'Plush Doll', source: 'https://infinitynikki.infoldgames.com/en/news/138', image: 'https://webstatic.infoldgames.com/7d325eec933f05b1/images/bg/3xw6NQujkPxfocDJ.jpg' },
].map(Object.freeze));
export const MOMO_CLOAK_IDS = Object.freeze(MOMO_CLOAKS.map(c => c.id));
export function normalizeMomoCloak(id) { return MOMO_CLOAK_IDS.includes(id) ? id : 'classic'; }
export function momoCloak(id) { return MOMO_CLOAKS.find(c => c.id === normalizeMomoCloak(id)); }

// 缺所有权字段的旧档仅继承当时穿着的款式；无法推断过去试穿过哪些。
export function normalizeMomoOwned(value, equipped = 'classic', legacy = false) {
  const ids = legacy ? [normalizeMomoCloak(equipped)] : Array.isArray(value) ? value.filter(id => MOMO_CLOAK_IDS.includes(id)) : [];
  return [...new Set(['classic', ...ids])];
}
