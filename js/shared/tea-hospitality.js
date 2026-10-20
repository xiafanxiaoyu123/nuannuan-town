// 面板与真实桌边共享同一份品尝对白，只读取已保存的菜单和递菜记录。
import { getTeaMenuPreview, RECIPE } from './homestead.js';
import { NPCS } from './residents.js';

export const TEA_TASTES = Object.freeze({ sweet: '甜点', fresh: '清新', warm: '暖心热食', milky: '奶香', drink: '茶饮' });
const QUALITY = { normal: '家常', tasty: '可口', fine: '精致' };
const LIKED = {
  momo: '这一口合我心意，尾巴都忍不住晃起来啦！',
  man: '忙完店里的事，最惦记这样一口甜。',
  he: '清清爽爽的，像把花园里的风带到了桌上。',
  xu: '奶香刚刚好，我想再闻一闻再吃。',
  shi: '热乎乎的，等鱼时吹过的风都散了。',
  nuo: '我也要把喜欢的味道写进小本子里！',
  qi: '这一杯慢慢喝，故事也可以慢慢讲。',
};
const DETAILS = {
  milk_pudding: '布丁轻轻一晃，我都舍不得先碰它。',
  cheese_pumpkin: '芝士拉出了一小条，像牵住了我的勺子。',
  moon_cake: '糕点上的小月亮，像给今晚留了一盏灯。',
  goat_moon_milk: '杯里的淡紫月光，闻起来也是暖的。',
  cherry_yogurt: '这一勺刚好把酸奶、果酱和樱桃都带起来了。',
  blueberry_yogurt: '紫白旋纹绕了一圈，像杯里的小云朵。',
  orange_yogurt: '橙瓣排成小太阳，今天的好心情有形状了。',
};

export function describeTeaGuest(state, task, id) {
  const menu = getTeaMenuPreview(task?.keys, task?.guests, task?.served);
  const guest = menu.guests.find(value => value.id === id);
  if (!guest) return null;
  const dish = menu.dishes.find(value => value.key === guest.key);
  const name = id === 'momo' ? '大喵' : NPCS.find(value => value.id === id)?.name || '朋友';
  const quality = dish?.quality || 'normal', qualityName = QUALITY[quality];
  const likedLine = guest.liked ? LIKED[id] : `我平时更喜欢${TEA_TASTES[guest.preference]}，这次也想尝尝你的新手艺。`;
  const qualityLine = quality === 'fine'
    ? DETAILS[dish?.recipe] || (RECIPE[dish?.recipe]?.method === 'assemble' ? '层次和点缀都摆得很仔细，第一口要认真尝。' : '火候和摆盘都很细致，这一口值得慢慢品尝。')
    : quality === 'tasty' ? '味道做得很妥帖，吃着很舒服。' : '家常的这一口，让人坐下来就放松了。';
  // 与现有居民好朋友门槛（8点）一致；不在这里产生关系奖励。
  const familiar = id === 'momo' || (state?.npc?.[id]?.t || 0) >= 8;
  return { ...guest, name, dishName: dish?.name || '这道料理', quality, qualityName, familiar,
    reply: `${likedLine}${qualityLine}`,
    arrival: familiar ? '熟悉的桌边，我又来蹭一会儿好时光。' : '谢谢邀请，我可以坐在这里吗？',
    goodbye: familiar ? '下回换我带点心来，这里还给我留个位置吧。' : '今天这一桌我会记得，下次见面再聊。' };
}

export function teaGuestLine(state, task, id, stage = 1) {
  const guest = describeTeaGuest(state, task, id);
  if (!guest) return '';
  if (stage === 0) return `${guest.name}：“${guest.arrival}”`;
  if (stage === 3) return `${guest.name}：“${guest.goodbye}”`;
  return `${guest.name}${guest.served ? '接过' : '尝了'}「${guest.dishName}」· ${guest.qualityName}：“${guest.reply}”`;
}
