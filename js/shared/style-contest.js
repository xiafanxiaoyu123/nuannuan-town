// 今日搭配赛的内容与纯规则。保留主题 ID/轮换顺序、评分数值和旧档每日领奖键。
import { CATS, CLOTH, CLOTHES } from './clothing.js';
import { dailyFunKey, ensureDailyFun } from './momo-fortune.js';

// 「温暖」不是现有服饰属性；森林与烘焙主题使用已有的清新/甜美服饰，不新增风格或服装 ID。
export const STYLE_CONTEST_THEMES = Object.freeze([
  { id: 'tea', title: '蜜糖午后茶话会', desc: '微风拂过露天茶座，穿上最甜美可爱的裙装与大喵赴约吧！', main: 'sweet', sub: 'fresh' },
  { id: 'forest', title: '晨露森林漫步', desc: '踏过挂满露珠的林间小径，清新自然的装扮最衬今日晨光。', main: 'fresh', sub: 'sweet' },
  { id: 'gala', title: '星光剧院晚宴', desc: '小镇音乐厅点亮水晶灯，用典雅华丽的礼服成为全场焦点。', main: 'elegant', sub: 'sweet' },
  { id: 'harbor', title: '海风码头假日', desc: '海鸥掠过波光粼粼的栈桥，利落飒爽的出行穿搭正合适！', main: 'cool', sub: 'fresh' },
  { id: 'bakery', title: '麦香烘焙工坊', desc: '空气里满是黄油与烤面包的暖香，换上甜美清新的日常装吧。', main: 'sweet', sub: 'fresh' },
].map(theme => Object.freeze(theme)));

export function styleContestTheme(state) {
  const day = Number.isSafeInteger(state?.gday) && state.gday >= 0 ? state.gday : 0;
  return STYLE_CONTEST_THEMES[day % STYLE_CONTEST_THEMES.length];
}

// 商店试穿的未购物品不能参加评分；缺少试穿值时沿用已拥有的身上搭配。
export function styleContestOutfit(state, preview = state.outfit) {
  const owned = new Set(state.owned || []);
  return Object.fromEntries(CATS.map(({ id: cat }) => {
    const candidate = preview?.[cat];
    const id = owned.has(candidate) && CLOTH[candidate]?.cat === cat ? candidate : state.outfit?.[cat];
    return [cat, owned.has(id) && CLOTH[id]?.cat === cat ? id : undefined];
  }));
}

export function scoreStyleContest(state, preview = state.outfit) {
  const theme = styleContestTheme(state), outfit = styleContestOutfit(state, preview);
  let pts = 0, mainCnt = 0, subCnt = 0;
  const sets = {};
  for (const id of Object.values(outfit)) {
    const item = CLOTH[id];
    if (!item || item.acc === 'none' || item.back === 'none') continue;
    if (item.set) sets[item.set] = (sets[item.set] || 0) + 1;
    if (item.style === theme.main) { pts += 20; mainCnt++; }
    else if (item.style === theme.sub) { pts += 13; subCnt++; }
    else pts += 7;
  }
  const maxSet = Math.max(0, ...Object.values(sets));
  pts += maxSet >= 5 ? 18 : maxSet >= 3 ? 10 : 0;
  pts += state.momoCloak && state.momoCloak !== 'classic' ? 12 : 6;
  const rank = pts >= 85 ? 'S' : pts >= 60 ? 'A' : 'B';
  return { pts: Math.min(120, pts), mainCnt, subCnt, maxSet, rank, reward: rank === 'S' ? 120 : rank === 'A' ? 85 : 55 };
}

export function autoStyleContestOutfit(state, preview = state.outfit) {
  const theme = styleContestTheme(state), outfit = styleContestOutfit(state, preview);
  const owned = CLOTHES.filter(item => state.owned.includes(item.id));
  for (const { id: cat } of CATS) {
    const candidates = owned.filter(item => item.cat === cat && item.acc !== 'none' && item.back !== 'none');
    const item = candidates.find(item => item.style === theme.main) || candidates.find(item => item.style === theme.sub) || candidates[0];
    if (item) outfit[cat] = item.id;
  }
  return outfit;
}

// 读取不创建/刷新每日账本。兼容已经存在的 truthy styleContest 领奖标记，不重新发奖。
export const hasStyleContestReward = state => !!(state.live?.fun?.day === dailyFunKey(state) && state.live?.fun?.used?.styleContest);

// 仅实际领奖调用：先核对打开时的镇历日期，再实时评分和标记；经济发放仍交给现有 addCoins。
export function claimStyleContest(state, preview, expectedDay) {
  if (expectedDay !== dailyFunKey(state)) return { ok: false, reason: 'day-changed' };
  if (hasStyleContestReward(state)) return { ok: false, reason: 'claimed' };
  const score = scoreStyleContest(state, preview);
  ensureDailyFun(state).fun.used.styleContest = 1;
  return { ok: true, ...score };
}
