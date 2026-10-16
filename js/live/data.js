// 新系统的静态数据表（文案、数值初稿）。逻辑不在这里，见 api.js 与 docs/交接文档-新系统.md
// 兼容已有界面/任务聚合器的导入路径；内容唯一维护源在 shared/daily。
export { DAILY_POOL, DAILY_CHEST } from '../shared/daily.js';
export const SIGNIN = [
  { day: 1, coins: 100 }, { day: 2, coins: 150 }, { day: 3, item: 'seed', name: '星光玫瑰种子 ×2', coins: 0 },
  { day: 4, coins: 250 }, { day: 5, item: 'decor', name: '樱花树 ×1', coins: 0 }, { day: 6, coins: 400 },
  { day: 7, item: 'cloth', name: '300 噗灵 + 七日星发夹', coins: 300, big: true },
];

// 关卡特殊规则：每家店几条，关卡 3 / 6 / 9 / 12 固定带一条，其余关卡按日期轮换
export const MODIFIERS = {
  cafe: [
    { id: 'vip', name: '贵客日', tone: '#e9a520', desc: '来的全是贵客：耐心只有七成，付双倍' },
    { id: 'soldout', name: '断货日', tone: '#9a8290', desc: '今天有一样甜点没到货，点到它的客人只能婉拒' },
    { id: 'rush', name: '午高峰', tone: '#f0679a', desc: '前 30 秒客人翻倍涌入，之后恢复正常' },
    { id: 'combo', name: '连击派对', tone: '#a58bea', desc: '连击加成翻倍，但断一次连击扣 10 噗灵' },
  ],
  flower: [
    { id: 'wedding', name: '婚礼订单', tone: '#ff8fb1', desc: '只收白色与粉色的花，每单报酬 +50%' },
    { id: 'weeds', name: '杂草疯长', tone: '#6fcf9f', desc: '开局棋盘上多 6 格杂草，清一格奖 3 噗灵' },
    { id: 'gift', name: '礼盒季', tone: '#e9a520', desc: '每单都要配包装，丝带篮回充加快' },
  ],
  tailor: [
    { id: 'mirror', name: '镜像谱面', tone: '#7fc4f5', desc: '四条轨道左右镜像' },
    { id: 'long', name: '长针脚日', tone: '#a58bea', desc: '长按音符翻倍，每个 +8 分' },
    { id: 'strict', name: '高定工坊', tone: '#f0679a', desc: '只有 Perfect 计分，但每个 Perfect 分数 ×1.6' },
  ],
  fish: [
    { id: 'storm', name: '暴雨', tone: '#5fa8ee', desc: '鱼更猛，卖价 ×1.5' },
    { id: 'treasure', name: '藏宝图', tone: '#e9a520', desc: '每条鱼都带宝箱' },
    { id: 'calm', name: '风平浪静', tone: '#6fcf9f', desc: '鱼很温顺，但只有小鱼' },
  ],
};

// 面包房沿用同一套关卡规则入口
MODIFIERS.bakery = [
  { id: 'bigorder', name: '大订单日', tone: '#e9a520', desc: '每位客人都要两份面包，提前备好展示架' },
  { id: 'hotoven', name: '炉火太旺', tone: '#f0679a', desc: '烘烤时间缩短30%，记得及时出炉' },
];

// 无尽模式的强化：每撑过一段时间三选一。rare 的出现概率低
export const PERKS = [
  { id: 'shield', name: '定心丸', icon: 'heart', tone: '#ff8fb1', desc: '下一次失误不扣爱心', shops: 'all' },
  { id: 'heal', name: '回一口气', icon: 'heart', tone: '#f0679a', desc: '恢复 1 颗爱心', shops: 'all' },
  { id: 'gold', name: '金手指', icon: 'coin', tone: '#e9a520', desc: '接下来 30 秒收入 ×2', shops: 'all' },
  { id: 'combo', name: '连击护符', icon: 'star', tone: '#a58bea', desc: '连击不会被打断一次', shops: 'all' },
  { id: 'slow', name: '慢一点', icon: 'clock', tone: '#7fc4f5', desc: '节奏放慢 20%，持续到下次选择', shops: 'all' },
  { id: 'interest', name: '利滚利', icon: 'coin', tone: '#e9a520', desc: '此后每次选择强化时，按当前营业额 +5%', shops: 'all', rare: true },
  { id: 'restock', name: '后厨加人', icon: 'bolt', tone: '#6fcf9f', desc: '补货和冲泡速度 +40%', shops: ['cafe'] },
  { id: 'patient', name: '免费试吃', icon: 'heart', tone: '#ff8fb1', desc: '所有客人的耐心回满', shops: ['cafe', 'flower'] },
  { id: 'seedrain', name: '花种雨', icon: 'bolt', tone: '#6fcf9f', desc: '花种篮立刻回满，且上限 +3', shops: ['flower'] },
  { id: 'wide', name: '大号针脚', icon: 'star', tone: '#a58bea', desc: '判定范围加宽 25%', shops: ['tailor'] },
  { id: 'bigbar', name: '加长收线', icon: 'bolt', tone: '#5fa8ee', desc: '绿色收线条加长 20%', shops: ['fish'] },
  { id: 'lure', name: '香饵', icon: 'star', tone: '#e9a520', desc: '下三条必定是彩纹鱼以上', shops: ['fish'], rare: true },
];

// 套装效果：通常穿齐同一套（发型 + 裙装 + 鞋）触发；满篮时光集齐三件即可解锁采集。
export const SET_EFFECTS = {
  far: '甜美店铺收入额外 +8%', bubble: '咖啡屋客人耐心 +10%', sun: '收获作物时 10% 概率多收一个', dust: '回收小铺卖价 +5%',
  wind: '花店花种篮上限 +2', water: '钓场绿条加长 8%', floral: '居民委托报酬 +10%', charge: '店铺升级费用 -8%',
  strings: '裁缝铺 Perfect 判定加宽 10%', star: '成就奖励 +10%', bloom: '全部店铺收入 +6%', trip: '在小镇里移动速度 +12%',
  basket: '集齐发型、裙装和鞋即可解锁后院「一键采集」，无需一直穿戴；采集时自动换装 5 秒，再恢复你的搭配', heart: '居民好感增长翻倍', dawn: '果树结果周期 -10%', ballet: '裁缝铺连击加成上限 +2', lion: '无尽模式多 1 颗爱心',
};

// 家园美化度的阶段奖励
export const BEAUTY_REWARDS = [
  { need: 100, name: '解锁地面「鹅卵石拼花」', coins: 200, floor: 'mosaic' },
  { need: 250, name: '摆设「大喵的小窝」', coins: 400, decor: 'momohut' },
  { need: 500, name: '居民会来做客了', coins: 600, unlock: 'visit' },
  { need: 800, name: '摆设「金色喷泉」', coins: 1000, decor: 'goldfountain' },
  { need: 1200, name: '摆设「金鸡风向标」', coins: 2000, decor: 'vane' },
];

// 东边预留地的新店：分三期出资建造
export const PROJECT = {
  id: 'bakery', name: '麦香面包房', owner: 'man', style: 'sweet', color: '#f6a56b',
  tagline: '小满终于有了自己的店。看准火候把面包取出来，烤过头可就焦了。',
  phases: [
    { name: '打地基', cost: 3000, note: '围起工地，铺好地基' },
    { name: '砌墙上梁', cost: 6000, note: '墙和屋顶立起来' },
    { name: '装修开业', cost: 9000, note: '烤炉进场，挂上招牌' },
  ],
};
export const BREADS = [
  { id: 'bun', name: '小圆包', bake: 4, price: 8, color: '#f2c879' },
  { id: 'croissant', name: '可颂', bake: 5.5, price: 12, color: '#e8b866' },
  { id: 'toast', name: '吐司', bake: 7, price: 16, color: '#f6dfa8' },
  { id: 'baguette', name: '法棍', bake: 8.5, price: 20, color: '#dba556' },
  { id: 'roll', name: '草莓卷', bake: 6.5, price: 24, color: '#ffc2d6' },
];

// 节日：按小镇日历（每月 7 天）的月-日触发，一年四个
export const FESTIVALS = [
  { id: 'sakura', name: '樱花祭', from: '03-03', to: '04-02', tone: '#ff9fbd', note: '樱花花饰挂满广场，花篮与玻璃风铃在春风里轻轻摇晃；节后自动收起' },
  { id: 'summer', name: '夏日祭', from: '07-04', to: '08-02', tone: '#5fa8ee', note: '彩旗与团扇迎着海风，街角搭起太鼓小祭台；节后自动撤场' },
  { id: 'harvest', name: '丰收节', from: '10-01', to: '10-06', tone: '#e9a520', note: '南瓜与金黄麦穗装满丰收篮，谷穗灯饰点亮广场；作物与果子的卖价 +20%，节后布景收起' },
  { id: 'snow', name: '初雪祭', from: '12-05', to: '01-02', tone: '#9fd6f2', note: '雪人与礼物盒围着冬日灯饰，雪花星灯陪小镇跨年；1月2日结束后自动收起' },
];

// 居民剧情线：每人三章（现有的委托作为每章的任务）
export const STORIES = {
  man: { title: '第一炉面包', chapters: ['偷偷练习', '店长的考验', '挂上自己的招牌'], reward: '面包房 9 折 + 小满的围裙' },
  he: { title: '一朵没见过的花', chapters: ['奇怪的种子', '夜里才开', '送给花店的礼物'], reward: '限定作物「月见花」' },
  xu: { title: '等了很久的帽子', chapters: ['橱窗前', '自己动手', '第一位客人'], reward: '阿絮手作的宽檐帽' },
  shi: { title: '那条大鱼', chapters: ['盯了三天', '断线', '放它走'], reward: '石头的旧鱼竿（背饰）' },
  nuo: { title: '想成为你那样的人', chapters: ['剪报本', '第一次搭配', '小小的时装秀'], reward: '小桃亲手做的徽章' },
  qi: { title: '写给小镇的歌', chapters: ['只有上半首', '七个愿望', '月下首演'], reward: '背景音乐「小镇的一天」' },
};
// 居民来访时的评价（按美化度分档）
export const VISIT_LINES = [
  { min: 0, text: '嗯……很有生活气息！下次我带盆花来。' },
  { min: 250, text: '好舒服的院子，我都不想走了。' },
  { min: 600, text: '天哪，这也太好看了吧！我回去就照着改。' },
];
