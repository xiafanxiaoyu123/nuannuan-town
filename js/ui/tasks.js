// 任务总览：把引导任务、居民委托、居民日常、每日订单和来访记录汇到一处，并可以挑一个追踪。
// 这里只读各系统已有的真实进度，不另存一份；追踪的是哪一条记在 S.settings.track。
import { S, bus, save, currentQuest } from '../core/state.js';
import { QUESTS, STYLES } from '../data.js';
import { h, fmt } from '../core/util.js';
import { activeReqs } from '../core/requests.js';
import { live } from '../live/api.js';
import { DAILY_POOL } from '../live/data.js';
import { residentLife } from '../live/residents.js';
import { canon } from '../live/canon.js';
import { visitors } from '../live/visitors.js';
import { coinIco } from '../core/icons.js';
import { buildQuestProgress } from '../world/build-island-rules.js';
import { BUILD_HOME_DOCK, BUILD_DOCK } from '../world/build-constants.js';

// 常去的地方：指路箭头用
const PLACES = {
  cafe: { x: -6.7, z: -9.6, where: '咖啡屋' }, flower: { x: 3.7, z: -10.2, where: '花语小筑' }, tailor: { x: 13.9, z: -9.7, where: '裁缝铺' },
  fish: { x: 6, z: 23.5, where: '码头' }, bakery: { x: 36, z: 0.6, where: '面包房' }, boutique: { x: 22, z: 2.6, where: '搭配小屋' },
  fountain: { x: 6, z: 4, where: '喷泉' }, board: { x: -2.4, z: 2.6, where: '订单板' },
  farm: { x: -513, z: -3, zone: 'home', where: '菜地' }, recycle: { x: -514.9, z: -9.6, zone: 'home', where: '回收小铺' }, house: { x: 500, z: 0, zone: 'house', where: '屋里' },
};
const STAT_PLACE = {
  watered: 'farm', harvested: 'farm', planted: 'farm', fruits: 'farm', sold: 'recycle', fish_caught: 'fish', play_fish: 'fish', play_cafe: 'cafe', play_flower: 'flower', play_tailor: 'tailor',
  bought_clothes: 'boutique', wishes: 'fountain', placed: 'house', bread_perfect: 'bakery',
};
const npcPlace = (game, id, name) => () => {
  const n = game.town.npcs.find((x) => x.def.id === id);
  return n ? { x: n.ch.root.position.x, z: n.ch.root.position.z, where: name } : null;
};
const place = (key) => (PLACES[key] ? () => PLACES[key] : null);

export function listTasks(game) {
  const ui = game.ui, out = [];
  const q = currentQuest();
  if (q) out.push({ key: 'guide', group: '引导任务', tag: `${S.quest + 1}/${QUESTS.length}`, text: q.text, cur: q.cur, need: q.need, coins: q.reward, auto: true,
    loc: q.at ? () => ({ x: q.at[0], z: q.at[1], zone: q.zone, where: q.where }) : null });
  const island = buildQuestProgress(S);
  out.push({ key: 'build-island', group: island.unlocked ? '海风工坊' : '海风岛剧情', tag: island.unlocked ? '免费往返' : '解锁自由建造',
    text: island.unlocked ? (game.town.zone === 'build' ? '岸边的小船 · 返回后院' : '去海风工坊岛继续搭建') : island.titleMain + '：' + island.title,
    cur: island.stage, need: 3, ready: !island.unlocked && island.canAdvance,
    loc: () => game.town.zone === 'build' ? { ...BUILD_DOCK, zone: 'build', where: '返航小船' } : { ...BUILD_HOME_DOCK, zone: 'home', where: '海风岛小船' },
    open: () => bus.emit('buildIslandPanel'), openLabel: '查看蓝图' });
  for (const r of activeReqs()) {
    const d = r.def, ready = r.state === 'ready';
    const key = d.type === 'deliver' ? 'farm' : d.type === 'score' ? d.shop : d.type === 'stat' ? STAT_PLACE[d.stat] : null;
    out.push({ key: 'req:' + r.id, group: '居民委托', tag: r.npc.name, color: STYLES[r.npc.like].color, text: ready ? `回去找${r.npc.name}交付「${d.title}」` : d.text, cur: r.cur, need: r.need, coins: r.reward, ready,
      loc: ready || !key ? npcPlace(game, r.id, r.npc.name) : place(key), open: () => ui.reqPanel(r.id), openLabel: ready ? '去交付' : '详情' });
  }
  for (const n of residentLife.list()) {
    const d = residentLife.data(n.id);
    if (!d || d.kind !== 'task' || (d.state !== 'doing' && d.state !== 'ready')) continue;
    const ready = d.state === 'ready', step = d.steps.find((s) => s.cur < s.need) || d.steps[0];
    out.push({ key: 'res:' + n.id, group: '居民日常', tag: n.name, color: STYLES[d.npc.like].color, text: ready ? `「${d.title}」完成了，去领奖励` : `${d.title}：${step.text}`,
      cur: d.steps.reduce((a, s) => a + s.cur, 0), need: d.steps.reduce((a, s) => a + s.need, 0), coins: d.reward.coins || 0, rewardText: d.reward.seed ? '种子 ×' + d.reward.n : '', ready,
      loc: ready ? null : place(STAT_PLACE[step.key]), open: () => ui.residentPanel(n.id), openLabel: ready ? '领奖励' : '详情' });
  }
  for (const t of live.daily().tasks) {
    if (t.claimed) continue;
    const d = DAILY_POOL.find((x) => x.id === t.id);
    const key = t.done ? 'board' : d.type === 'score' ? d.shop : d.type === 'stat' ? STAT_PLACE[d.stat] : null;
    out.push({ key: 'daily:' + t.id, group: '每日订单', tag: '现实今天', text: t.done ? `订单完成：${t.text}` : t.text, cur: Math.min(t.cur, t.need), need: t.need, coins: t.reward, ready: t.done,
      loc: place(key), open: () => window.__live.dailyPanel(), openLabel: t.done ? '领奖励' : '订单板' });
  }
  const c = canon.task(game);
  if (c) out.push(c);
  out.push(...visitors.tasks(game));
  return out;
}

// 当前追踪的任务；记下的那条已经结束时，自动换成下一条（优先引导任务）
export function trackedTask(game, list = listTasks(game)) {
  if (!list.length) return null;
  return list.find((t) => t.key === S.settings.track) || list.find((t) => t.key === 'guide') || list.find((t) => t.ready) || list[0];
}

export function taskPanel(game) {
  const ui = game.ui;
  let m;
  const body = h('div', { class: 'tasks' });
  const render = () => {
    const list = listTasks(game), cur = trackedTask(game, list);
    const groups = [...new Set(list.map((t) => t.group))];
    body.replaceChildren(
      h('div', { class: 'tk-head' }, h('h2', {}, '任务'), h('p', {}, list.length ? `手上有 ${list.length} 件事 · 点「追踪」会在画面上指路` : '现在手上没有任务')),
      list.length ? h('div', { class: 'tk-list' }, ...groups.flatMap((g) => [
        h('h3', {}, g),
        ...list.filter((t) => t.group === g).map((t) => {
          const on = cur && cur.key === t.key;
          return h('div', { class: 'tk-row' + (t.ready ? ' ready' : '') + (on ? ' on' : '') },
            h('div', { class: 'tk-main' },
              h('p', {}, t.tag && h('em', { style: t.color ? { '--c': t.color } : {} }, t.tag), t.text),
              h('div', { class: 'tk-bar' }, h('div', {}, h('i', { style: { width: Math.min(100, (t.cur / t.need) * 100) + '%' } })), h('span', { class: 'num' }, t.ready ? '完成' : `${fmt(t.cur)}/${fmt(t.need)}`),
                t.coins ? h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), fmt(t.coins)) : t.rewardText && h('span', { class: 'tk-rw' }, t.rewardText))),
            h('div', { class: 'tk-btns' },
              t.open && h('button', { class: 'btn sm ' + (t.ready ? 'gold' : 'alt'), onclick: () => { m.close(true); t.open(); } }, t.openLabel),
              h('button', { class: 'btn sm' + (on ? ' alt' : ''), disabled: on, onclick: () => { S.settings.track = t.key; S.settings.questOff = false; save(); bus.emit('quest'); render(); } }, on ? '追踪中' : '追踪')));
        }),
      ])) : h('p', { class: 'tk-empty' }, '去广场的订单板看看今天的订单，或者和路上的居民聊聊，他们常有事想拜托你。'),
      h('p', { class: 'tk-note' }, '居民日常在「更多 → 居民」里接；每日订单每天零点更换。'));
  };
  render();
  m = ui.modal(body, { ribbon: '任务清单', cls: 'live-modal' });
  return m;
}
