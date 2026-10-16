// 新系统的界面。只负责「长什么样、点了调谁」，数据全部来自 api.js 的 live 对象。
import { h, fmt } from '../core/util.js';
import { audio } from '../core/audio.js';
import { S, beauty, bus } from '../core/state.js';
import { svg } from '../ui/components/svg.js';
import { priceTag } from '../ui/components/price-tag.js';
import { coinIco, cropIco, fishIco, clothIcon, shopIcon, mergeIco } from '../core/icons.js';
import { STYLES, CLOTHES } from '../data.js';
import { RESIDENTS as NPCS } from './people.js';
import { live } from './api.js';
import { chestIco, breadIco, bakeryIco, siteIco } from './props.js';
import { FESTIVALS } from './data.js';
import { FESTIVAL_ACTIVITIES } from './festival-guide.js';
import { FISH } from '../models/items.js';
import { gameDate, mdText } from '../core/gametime.js';
import { seedIco, decorIcon, npcIco } from '../core/icons.js';

// UI.init 在创建 HUD 或安装订阅前同步注入现有单例；不反向导入 UI。
let boundUi = null;
export function bindLivePanels(instance) {
  if (!instance || typeof instance.modal !== 'function') throw new TypeError('Live panels require the existing UI instance');
  if (boundUi && boundUi !== instance) throw new Error('Live panels are already bound to another UI instance');
  boundUi = instance;
}
function requireLivePanelUi() {
  if (!boundUi) throw new Error('Live panels are not initialized; call ui.init(game) before opening panels');
  return boundUi;
}

const click = (fn, snd = 'click') => (e) => { audio.init(); audio.sfx(snd); fn(e); };
const PICO = {
  heart: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 20s-7-4.400-7-9.600A4 4 0 0 1 12 8a4 4 0 0 1 7 2.400C19 15.600 12 20 12 20z"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.500"/><path d="M12 8.500v7M9.500 10.500h4a1.500 1.500 0 0 1 0 3h-4"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.900L12 16.900l-5.200 2.800 1-5.900-4.300-4.100 5.900-.8z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.500V12l3 2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path class="fill" d="M13 2.500 5 13.500h5.500L9.500 21.500l8.500-11.500h-5.500z"/></svg>',
};
const pico = (n) => h('i', { class: 'pico', html: PICO[n] || PICO.star });
const fly = (e, n = 6) => { const r = e.currentTarget.getBoundingClientRect(); requireLivePanelUi().flyCoins(r.left + r.width / 2, r.top, n); };

// ——— 每日订单 + 七日签到 ———
export function dailyPanel() {
  const ui = requireLivePanelUi();
  const body = h('div', { class: 'daily' });
  let date;
  const render = () => {
    const d = live.daily(), s = live.signin();
    date = d.date;
    body.replaceChildren(
      h('div', { class: 'dl-head' }, h('div', {}, h('h2', {}, '每日订单'), h('p', {}, `现实日期 ${d.date} · 设备本地零点换新`)),
        h('button', { class: 'chestbtn' + (d.chest.done >= d.chest.need && !d.chest.claimed ? ' ready' : '') + (d.chest.claimed ? ' open' : ''), onclick: click((e) => { const v = live.claimChest(); if (v) { fly(e, 10); ui.toast(`今日宝箱：+${v}`, { kind: 'live-reward', icon: coinIco() }); render(); } }) },
          h('img', { src: chestIco(d.chest.claimed), alt: '' }), h('span', {}, d.chest.claimed ? '已开启' : `${d.chest.done}/${d.chest.need}`))),
      h('div', { class: 'dl-list' }, d.tasks.map((t) => h('div', { class: 'dl-task' + (t.claimed ? ' got' : t.done ? ' ready' : '') },
        h('div', { class: 'tx' }, h('b', {}, t.text), h('div', { class: 'ach-bar' }, h('i', { style: { width: Math.min(100, (t.cur / t.need) * 100) + '%' } }), h('span', { class: 'num' }, `${fmt(Math.min(t.cur, t.need))}/${fmt(t.need)}`))),
        t.claimed ? h('span', { class: 'ach-got' }, '已领取') : t.done
          ? h('button', { class: 'btn gold sm', onclick: click((e) => { const v = live.claimDaily(t.id); if (v) { fly(e); render(); } }) }, '领取 ', priceTag(t.reward))
          : h('span', { class: 'ach-rw' }, priceTag(t.reward))))),
      h('h3', {}, '七日签到', h('em', {}, `本轮已签 ${s.day - (s.claimedToday ? 0 : 1)} 天`)),
      h('div', { class: 'sign' }, s.rewards.map((r) => {
        const state = r.day < s.day || (r.day === s.day && s.claimedToday) ? 'got' : r.day === s.day ? 'today' : '';
        return h('button', { class: 'sday ' + state + (r.big ? ' big' : ''), disabled: state !== 'today', onclick: click((e) => { const v = live.claimSignin(); if (v) { fly(e); ui.toast(`签到成功：${v.name || '+' + v.coins + ' 噗灵'}`, { kind: 'live-reward' }); render(); } }) },
          h('em', {}, `第 ${r.day} 天`), h('img', { src: r.item === 'seed' ? seedIco('rose') : r.item === 'decor' ? decorIcon('sakura') : r.item === 'cloth' ? clothIcon('a_seven') : coinIco(), alt: '' }), h('b', {}, r.name || fmt(r.coins)), state === 'got' && h('span', { class: 'tick' }, svg('check')));
      })));
  };
  render();
  // 弹窗停留到次日时自动换单、开放新签到；关闭后释放计时器
  const timer = setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    if (live.daily().date !== date) render();
  }, 1000);
  return ui.modal(body, { ribbon: 'DAILY', cls: 'daily-modal', onClose: () => clearInterval(timer) });
}

// ——— 图鉴 ———
export function bookPanel() {
  const ui = requireLivePanelUi();
  let cur = 'fish';
  const body = h('div', { class: 'book' });
  const pic = (it) => (it.kind === 'fish' ? fishIco(it.id) : it.kind === 'crop' ? cropIco(it.id) : it.kind === 'flower' ? mergeIco(it.id.split(':')[0], Number(it.id.split(':')[1])) : it.kind === 'set' ? clothIcon((CLOTHES.find((c) => c.set === it.id && c.cat === 'dress') || CLOTHES[0]).id) : null);
  const render = () => {
    const tabs = live.book(), t = tabs.find((x) => x.id === cur), n = t.items.filter((i) => i.found).length, full = t.items.every((i) => i.found || i.optional);
    body.replaceChildren(
      h('div', { class: 'bk-head' }, h('h2', {}, '小镇图鉴'),
        h('div', { class: 'tabs' }, tabs.map((x) => h('button', { class: x.id === cur ? 'on' : '', onclick: click(() => { cur = x.id; render(); }, 'tab') }, x.name, h('em', {}, `${x.items.filter((i) => i.found).length}/${x.items.length}`))))),
      h('div', { class: 'bk-grid' }, t.items.map((it) => {
        const src = pic(it), npc = it.kind === 'npc' && NPCS.find((p) => p.id === it.id);
        return h('div', { class: 'bk-item' + (it.found ? '' : ' unk'), title: it.found ? it.name : it.hint },
          h('img', { src: npc ? npcIco(npc.id) : src, alt: '' }),
          h('b', {}, it.found ? it.name : '？？？'), !it.found && h('span', {}, it.hint), it.optional && h('em', { class: 'bk-opt' }, '节日限定'));
      })),
      h('div', { class: 'bk-foot' }, h('div', { class: 'ach-prog' }, h('i', { style: { width: (n / t.items.length) * 100 + '%' } })),
        t.claimed ? h('span', { class: 'ach-got' }, '本页奖励已领取') : h('button', { class: 'btn gold sm', disabled: !full, onclick: click((e) => { const v = live.claimBook(cur); if (v) { fly(e, 10); render(); } }) }, full ? '领取本页奖励 ' : '集齐本页可领 ', priceTag(t.reward))));
  };
  render();
  return ui.modal(body, { ribbon: 'COLLECTION', cls: 'book-modal' });
}

// ——— 无尽模式：三选一强化 ———（返回 Promise<perk>）
export function perkPicker(shopId) {
  const ui = requireLivePanelUi();
  let cancel;
  const promise = new Promise((resolve) => {
    let settled = false;
    const finish = (p) => {
      if (settled) return;
      settled = true;
      veil.remove();
      resolve(p);
    };
    cancel = () => finish(null);
    const perks = live.rollPerks(shopId);
    const veil = h('div', { class: 'perkveil', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, '选一个强化'), h('p', {}, '游戏已暂停 · 挑一样带着继续'),
      h('div', { class: 'perks' }, perks.map((p, i) => {
        const el = h('button', { class: 'perk' + (p.rare ? ' rare' : ''), style: { '--c': p.tone, animationDelay: i * 0.08 + 's' }, onclick: click(() => finish(p)) },
          p.rare && h('span', { class: 'rr' }, '稀有'), pico(p.icon), h('b', {}, p.name), h('span', {}, p.desc));
        return el;
      })));
    ui.root.append(veil);
    audio.sfx('quest');
  });
  promise.cancel = () => cancel();
  return promise;
}
// 已选强化的小图标（挂在小游戏 HUD 左上角）
export const perkChip = (p) => h('span', { class: 'perkchip', style: { '--c': p.tone }, title: p.desc }, pico(p.icon), p.name);

// ——— 关卡特殊规则 ———
export const modifierBadge = (m) => h('div', { class: 'modbadge', style: { '--c': m.tone } }, h('b', {}, m.name), h('span', {}, m.desc));
export function modifierBanner(m) {
  const el = h('div', { class: 'modbanner', style: { '--c': m.tone } }, h('em', {}, '今日特殊规则'), h('b', {}, m.name), h('span', {}, m.desc));
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
  return el;
}

// ——— 套装效果（衣橱里的一条）———
export function setEffectChip(outfit) {
  const e = live.setEffect(outfit);
  const ownedBasket = ['hair', 'dress', 'shoes'].filter(cat => CLOTHES.some(c => c.set === 'basket' && c.cat === cat && S.owned.includes(c.id))).length;
  const harvestNote = ownedBasket === 3 ? ' · 满篮时光采集能力已解锁，无需穿戴' : '';
  const harvestStyle = { whiteSpace: 'normal', flexWrap: 'wrap' };
  if (e?.set === 'basket') return h('div', { class: 'setfx harvest' + (ownedBasket === 3 ? ' on' : ''), style: harvestStyle },
    h('b', {}, `「${e.name}」已集齐 ${ownedBasket}/3`), h('span', {}, ownedBasket === 3 ? e.effect : `再集齐 ${3 - ownedBasket} 件即可解锁一键采集，无需持续穿戴`));
  if (!e) return h('div', { class: 'setfx none', style: harvestStyle }, h('b', {}, '套装效果'), h('span', {}, '一般套装穿齐发型、裙装、鞋触发；满篮时光集齐三件即可解锁采集' + harvestNote));
  return h('div', { class: 'setfx' + (e.active ? ' on' : ''), ...(harvestNote ? { style: harvestStyle } : {}) }, h('b', {}, `「${e.name}」${e.pieces}/${e.need}`), h('span', {}, (e.active ? e.effect : `再穿 ${e.need - e.pieces} 件触发：${e.effect}`) + harvestNote));
}

// ——— 美化度阶段奖励 ———
export function milestoneTrack() {
  const ui = requireLivePanelUi();
  const box = h('div', { class: 'miles' });
  const render = () => {
    const b = beauty(), list = live.milestones(b), max = list[list.length - 1].need;
    box.replaceChildren(h('h3', {}, '家园美化度', h('em', {}, `当前 ${fmt(b)}`)),
      h('div', { class: 'mtrack' }, h('div', { class: 'mfill', style: { width: Math.min(100, (b / max) * 100) + '%' } }),
        list.map((m, i) => h('button', { class: 'mnode' + (m.claimed ? ' got' : m.reached ? ' ready' : ''), style: { left: (m.need / max) * 100 + '%' }, disabled: !m.reached || m.claimed,
          onclick: click((e) => { const v = live.claimMilestone(i); if (!v) return; fly(e, 8); ui.toast(`阶段奖励：+${v} 噗灵${m.unlock === 'visit' ? '，居民来访已解锁' : m.decor ? '，摆设已放进装修仓库' : m.floor ? '，新地面可以在装修里铺了' : ''}`, { kind: 'live-reward', life: 3600 }); render(); }) },
          h('i', {}, m.claimed ? svg('check') : svg(m.reached ? 'star' : 'lock')), h('b', {}, fmt(m.need)), h('span', {}, m.name)))));
  };
  render();
  return box;
}
export const milestonePanel = () => requireLivePanelUi().modal(h('div', { class: 'milepanel' }, h('h2', {}, '阶段奖励'), h('p', { class: 'fine' }, '美化度到了就能领：噗灵之外还有新地面和三件摆设，500 美化度解锁居民来访。'), milestoneTrack()), { ribbon: 'HOME', cls: 'live-modal' });

// ——— 新店建造 ———
export function buildPanel(onChange) {
  const ui = requireLivePanelUi();
  const body = h('div', { class: 'build' });
  let modal;
  const submit = (amount, e) => {
    const before = live.project(), p = live.fund(amount);
    if (before.phase === p.phase && before.paid === p.paid) return;
    fly(e, 6);
    if (p.phase !== before.phase) { audio.sfx('fanfare'); ui.toast(`「${before.phases[before.phase].name}」完成！`, { kind: 'live-reward' }); }
    onChange?.(p, false);
    render();
  };
  const render = () => {
    const p = live.project(), ph = p.phases[p.phase];
    body.replaceChildren(
      h('div', { class: 'bd-art' }, h('img', { src: p.done ? bakeryIco() : siteIco(p.phase), alt: '' })),
      h('div', { class: 'bd-main' },
        h('h2', {}, p.name), h('p', { class: 'tagline' }, p.tagline),
        h('ol', { class: 'phases' }, p.phases.map((x, i) => h('li', { class: i < p.phase ? 'done' : i === p.phase ? 'cur' : '' }, h('i', {}, i < p.phase ? svg('check') : String(i + 1)), h('div', {}, h('b', {}, x.name), h('span', {}, x.note)), priceTag(x.cost)))),
        p.done ? h('button', { class: 'btn', onclick: click(() => { modal.close(true); if (onChange) onChange(p, true); else ui.shopPanel('bakery'); }) }, svg('play'), '去面包房')
          : h('div', { class: 'fund' }, h('div', { class: 'ach-bar' }, h('i', { style: { width: (p.paid / ph.cost) * 100 + '%' } }), h('span', { class: 'num' }, `${fmt(p.paid)}/${fmt(ph.cost)}`)),
            h('div', { class: 'row' }, [500, 2000].map((v) => h('button', { class: 'btn alt sm', onclick: click((e) => submit(v, e)) }, '出资 ', priceTag(v))),
              h('button', { class: 'btn gold sm', onclick: click((e) => submit(ph.cost - p.paid, e)) }, '补齐这一期')))));
  };
  render();
  modal = ui.modal(body, { ribbon: '新街区', cls: 'live-modal' });
  return modal;
}

// ——— 节日横幅 ———
export function festivalBanner(f) {
  return h('button', { class: 'festbar', 'data-festival': f.id, style: { '--c': f.tone }, onclick: click(() => festivalPanel(f), 'tab') }, h('i', {}), h('b', {}, f.name), h('span', {}, `至 ${mdText(f.to)}`));
}
export function festivalPanel(f) {
  const ui = requireLivePanelUi();
  const activity = FESTIVAL_ACTIVITIES[f.id];
  const body = h('div', { class: 'fest', style: { '--c': f.tone } },
    h('div', { class: 'fest-hero' }, h('em', {}, `${mdText(f.from)} — ${mdText(f.to)}`), h('h2', {}, f.name), h('p', {}, f.note), h('p', { class: 'fest-today' }, `小镇今天是 ${gameDate().text}`)),
    activity && h('section', { class: 'fest-invitation' }, h('span', { class: 'fest-eyebrow' }, activity.host + '邀你来小聚'), h('h3', {}, activity.title), h('p', {}, activity.intro),
      h('ol', { class: 'fest-journey', 'aria-label': '节日活动步骤' }, activity.steps.map((step, i) => h('li', {}, h('b', {}, String(i + 1).padStart(2, '0')), h('span', {}, step)))),
      h('p', {}, activity.instruction), h('p', { class: 'fine' }, `到广场的「${activity.scene.split('与')[0]}」或「${activity.scene.split('与')[1]}」附近，点击「${activity.title}」就能参加。`),
      h('p', { class: 'fine' }, '完成三个阶段后，两处活动场景会显示今日完成标牌。可以反复游玩；作品与过程留在本次活动中，退出后从头开始。活动材料由摊位准备，不消耗背包，也不发放金币或物品。')),
    h('p', { class: 'fine' }, `节日期间广场会换上装饰，钓场还能钓到限定的「${(FISH.find((x) => x.fest === f.id) || {}).name || '节日鱼'}」。`),
    h('p', { class: 'fine' }, '节日按小镇日历开放。节期结束后，活动、场景装饰和节日对话会一同退场。'),
    h('h3', {}, '全年节日', h('em', {}, '按小镇日历 · 每月 7 天')),
    h('div', { class: 'fest-list' }, FESTIVALS.map((x) => h('div', { class: 'fest-item' + (x.id === f.id ? ' on' : ''), style: { '--c': x.tone } }, h('b', {}, x.name), h('em', {}, `${mdText(x.from)} — ${mdText(x.to)}`), h('span', {}, FESTIVAL_ACTIVITIES[x.id].host + ' · ' + FESTIVAL_ACTIVITIES[x.id].steps.join(' → ')), h('span', {}, x.note)))));
  let modal;
  const close = () => modal?.close(true);
  const offDay = bus.on('newDay', close), offReset = bus.on('reset', close);
  modal = ui.modal(body, { ribbon: 'FESTIVAL', cls: 'live-modal festival-info-modal', onClose: () => { offDay(); offReset(); } });
  return modal;
}

// ——— 居民来访 ———
export function visitCard(v) {
  const ui = requireLivePanelUi();
  const st = STYLES[v.npc.like];
  let m;
  m = ui.modal(h('div', { class: 'visit', style: { '--c': st.color } },
    h('div', { class: 'reqhead' }, h('img', { class: 'ava', src: npcIco(v.npc.id), alt: '' }), h('div', {}, h('h2', {}, `${v.npc.name}来做客了`), h('p', {}, v.npc.job))),
    h('p', { class: 'say' }, `「${v.line}」`),
    h('div', { class: 'vscore' }, h('span', {}, '对你家的评价'), h('div', {}, [0, 1, 2, 3, 4].map((i) => svg('star', i < v.score ? 'on' : '')))),
    h('div', { class: 'row' }, h('span', { class: 'rw' }, '留下了礼物：', h('b', {}, v.gift.name), priceTag(v.gift.coins)),
      h('button', { class: 'btn', onclick: click((e) => { if (live.acceptVisit()) { fly(e, 6); ui.toast('收到了 120 噗灵', { kind: 'live-reward' }); } else ui.toast('这份来访礼物已经领取或过期'); m.close(true); }) }, '收下，谢谢！'))), { ribbon: '来访', cls: 'live-modal' });
  return m;
}

// ——— 居民剧情（委托面板里的一条进度）———
export function storyStrip(npcId) {
  const s = live.story(npcId);
  if (!s) return null;
  return h('div', { class: 'story' }, h('h4', {}, s.title, h('em', {}, s.cur >= s.chapters.length ? '已完结' : `第 ${s.cur + 1} 章`)),
    h('ol', {}, s.chapters.map((c, i) => h('li', { class: i < s.cur ? 'done' : i === s.cur ? 'cur' : '' }, h('i', {}, i < s.cur ? svg('check') : String(i + 1)), c))),
    h('p', {}, s.cur >= s.chapters.length ? '完结奖励已发放：' : '完结奖励：', h('b', {}, s.reward)));
}

export { breadIco, bakeryIco, shopIcon };
