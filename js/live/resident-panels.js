// 原创居民的常驻活动界面。旧委托/聊天仍走原入口，活动奖励独立记账。
import { h, fmt } from '../core/util.js';
import { audio } from '../core/audio.js';
import { app } from '../core/app.js';
import { STYLES, CLOTH, SETS } from '../data.js';
import { clothIcon, fishIco, seedIco, npcIco } from '../core/icons.js';
import { ui, priceTag } from '../ui/ui.js';
import { residentLife, PERFORMANCE_SECONDS } from './residents.js';
import { buildPanel } from './panels.js';

const click = (fn) => (e) => { audio.init(); audio.sfx('click'); fn(e); };
const note = (text) => h('p', { class: 'res-note' }, text);

export function residentHub(game) {
  let modal;
  const body = h('div', { class: 'res-hub' }, h('h2', {}, '居民日常'), note('看看今天谁有新点子：试烤、巡田、聊搭配，也可以收集诗签和剪报。'),
    h('div', { class: 'res-grid' }, residentLife.list().map((n) => h('button', { class: 'bigcard', 'data-resident': n.id, onclick: click(() => { modal.close(true); residentPanel(n.id, game); }) }, h('b', {}, n.name), h('p', {}, n.title)))));
  modal = ui.modal(body, { ribbon: '小镇生活', cls: 'live-modal' });
  return modal;
}

export function residentPanel(id, game) {
  let data = residentLife.data(id);
  if (!data) { ui.toast('没有这位居民的活动'); return null; }
  const body = h('div', { class: 'res-panel', 'data-resident': id });
  let modal, signature = '', listening = null, songTimer = 0;
  const stopSong = () => {
    clearInterval(songTimer);
    if (!listening) return;
    residentLife.cancelPerformance(listening.token);
    if (audio.mode === 'resident_qi') audio.startMusic(listening.mode || 'town');
    listening = null;
  };
  const nearbyNpc = () => {
    if (game.busy || app.view !== game.town || game.town.zone !== 'town') return null;
    const n = game.town.npcs.find((p) => p.def.id === id);
    return n && n.ch.root.position.distanceTo(game.town.pos) < 3 ? n : null;
  };
  const go = (fn) => click(() => { modal.close(true); fn(); });
  const beginSong = () => {
    if (game.busy || app.view !== game.town || game.town.zone !== 'town') { ui.toast('回到小镇，再来听这段现场夜曲。'); return; }
    const token = residentLife.beginPerformance();
    if (!token) { ui.toast('夜曲在小镇的夜间开始；现实时间不受限制。'); return; }
    listening = { token, mode: audio.mode, zone: game.town.zone };
    audio.startMusic('resident_qi'); render();
    songTimer = setInterval(() => {
      if (!listening) return;
      if (!body.isConnected || app.view !== game.town || game.town.zone !== listening.zone) { stopSong(); return; }
      const elapsed = Math.max(0, (performance.now() - token.started) / 1000);
      const fill = body.querySelector('.res-listen i'), text = body.querySelector('.res-listen-label');
      if (fill) fill.style.width = Math.min(100, elapsed / PERFORMANCE_SECONDS * 100) + '%';
      if (text) text.textContent = `正在听曲 · ${Math.min(PERFORMANCE_SECONDS, Math.floor(elapsed))}/${PERFORMANCE_SECONDS} 秒`;
      if (elapsed < PERFORMANCE_SECONDS) return;
      const reward = residentLife.finishPerformance(token);
      stopSong();
      if (!reward) ui.toast('日期已经变化，这段没有记作今日完成。');
      else ui.toast(reward.coins ? `七弦留下了一张见闻诗签：+${reward.coins} 噗灵` : '这段夜曲听完了，今天的奖励已经领过。', { kind: 'live-reward' });
      render();
    }, 100);
  };
  const taskBody = (d) => {
    const reward = d.reward.seed ? h('span', { class: 'res-seed' }, h('img', { src: seedIco(d.reward.seed), alt: '' }), '郁金香种子 ×' + d.reward.n) : priceTag(d.reward.coins);
    const btn = d.state === 'locked' ? h('button', { class: 'btn alt sm', onclick: go(() => buildPanel()) }, '查看面包房工地')
      : d.state === 'offer' ? h('button', { class: 'btn', 'data-act': 'start', onclick: click(() => { residentLife.start(id); render(); }) }, '开始今日记录')
      : d.state === 'ready' ? h('button', { class: 'btn gold', 'data-act': 'claim', onclick: click(() => { const r = residentLife.claim(id); if (r) ui.toast('今日记录完成：' + r.name, { kind: 'live-reward' }); render(); }) }, '领取反馈')
      : h('button', { class: 'btn alt', disabled: true }, d.state === 'claimed' ? '今天已完成' : '正在记录');
    const extra = [];
    if (d.field) extra.push(h('div', { class: 'res-facts' }, ['地块 ' + d.field.plots, '空田 ' + d.field.empty, '缺水 ' + d.field.thirsty, '可收获 ' + d.field.ripe].map((x) => h('span', { class: 'chip' }, x))));
    if (d.shop) extra.push(note(`今日完美出炉 ${d.shop.todayPerfect} 份 · 面包房 Lv.${d.shop.lv}。${d.state === 'locked' ? '先把面包房建好，再一起练习。' : '火候稳一点，试烤记录就会多一点。'}`));
    if (d.fish) extra.push(h('div', { class: 'res-fish' }, d.fish.map((f) => h('div', { class: f.count ? '' : 'unknown' }, h('img', { src: fishIco(f.id), alt: '' }), h('b', {}, f.count ? f.name : '待记录'), h('small', {}, f.count ? `累计 ${fmt(f.count)} 条` : '成功收线后收录')))), note('钓过的鱼都会记在这里。还没见过的，等下一次咬钩再认。'));
    return h('div', {}, note(d.intro), ...extra,
      h('div', { class: 'res-steps' }, d.steps.map((s) => h('div', {}, h('span', {}, s.text), h('b', {}, `${s.cur}/${s.need}`)))),
      h('div', { class: 'row res-actions' }, h('span', { class: 'res-reward' }, '今日反馈 ', reward), btn),
      h('div', { class: 'row' }, id === 'man' && d.state !== 'locked' && h('button', { class: 'btn alt sm', onclick: go(() => game.openShop('bakery')) }, '去烘焙'),
        id === 'he' && h('button', { class: 'btn alt sm', onclick: go(() => game.travel('home')) }, '查看后院'),
        id === 'shi' && h('button', { class: 'btn alt sm', onclick: go(() => game.openShop('fish')) }, '去钓场')),
      note('从接下记录后开始计算，本地每日零点更新。今天做完了，明天再来看看。'));
  };
  const reviewBody = (d) => h('div', {},
    h('div', { class: 'res-speech' }, d.review.lines.map((line) => h('p', {}, line))),
    h('div', { class: 'res-facts' }, d.review.shops.map((sh) => h('span', { class: 'chip' }, `${sh.name} +${sh.pct}%`))),
    h('div', { class: 'row' }, h('button', { class: 'btn', 'data-act': 'review', onclick: click(() => { residentLife.saveReview(); ui.toast('阿絮记下了今天这身搭配，稍后也可以再来更新点评。'); render(); }) }, '保存今日点评'),
      h('button', { class: 'btn alt', onclick: go(() => game.openWardrobe('closet')) }, '去衣橱试试')),
    note('每家店偏爱的风格不同。混搭、穿齐一套，都可以有自己的安排。'),
    h('details', { class: 'res-history' }, h('summary', {}, `近期点评（${d.history.length}/7）`), d.history.map((r) => h('p', {}, h('b', {}, r.day + ' · '), r.lines.join(' ')))));
  const albumBody = (d) => h('div', {},
    note('把今天这身留进剪报册吧。每套都只记一页，初始套装也有自己的位置。'),
    h('div', { class: 'row' }, h('span', {}, d.set ? `当前：${SETS[d.set].name}` : '当前主件还不是完整同套'),
      h('button', { class: 'btn' + (d.recorded ? ' alt' : ' gold'), disabled: !d.set || d.recorded, 'data-act': 'album', onclick: click(() => { const r = residentLife.showOutfit(); ui.toast(r.note, { kind: 'live-reward' }); render(); }) }, d.recorded ? '这套已收录' : '贴进剪报册 +40')),
    h('div', { class: 'res-album' }, d.items.map((item) => h('div', {}, CLOTH[item.outfit?.dress] && h('img', { src: clothIcon(item.outfit.dress), alt: '' }), h('b', {}, item.name), h('small', {}, item.day)))),
    note('新搭配的名字和展示日期会留在这里，随时都可以翻看。'));
  const poemBody = (d) => h('div', {},
    note('夜里风轻，听七弦唱一小段本镇原创夜曲，把今天的见闻收成诗签。'),
    h('div', { class: 'res-verses' }, d.preview.lines.map((line) => h('p', {}, line))),
    h('div', { class: 'res-facts' }, [['打工', 'plays'], ['浇水', 'watered'], ['收获', 'harvested'], ['钓鱼', 'fish_caught']].map(([text, key]) => h('span', { class: 'chip' }, `${text} ${d.preview.counts[key]}`))),
    listening ? h('div', {}, h('p', { class: 'res-listen-label' }, '正在听曲'), h('div', { class: 'res-listen' }, h('i')))
      : h('button', { class: 'btn', 'data-act': 'perform', disabled: !d.night, onclick: click(beginSong) }, d.night ? d.completed ? '再听一段（不重复发奖）' : `听一段夜曲 · ${d.duration}秒 · +50` : '等小镇入夜再开始'),
    note('以小镇昼夜为准，不用等现实夜里。听完整段可收藏今日诗签；中途关闭可以下次再听。'),
    h('details', { class: 'res-history' }, h('summary', {}, `收藏的诗签（${d.history.length}/7）`), d.history.map((p) => h('div', {}, h('b', {}, p.day), h('p', {}, p.lines.join(' '))))));
  const render = () => {
    data = residentLife.data(id); signature = JSON.stringify(data);
    const nearby = !!nearbyNpc();
    body.replaceChildren(h('div', { class: 'reqhead', style: { '--c': STYLES[data.npc.like].color } }, h('img', { class: 'ava', src: npcIco(data.npc.id), alt: '' }),
      h('div', {}, h('h2', {}, data.title), h('p', {}, data.npc.job + ' · ' + data.day))),
      data.kind === 'task' ? taskBody(data) : data.kind === 'review' ? reviewBody(data) : data.kind === 'album' ? albumBody(data) : poemBody(data),
      h('div', { class: 'row res-nav' }, h('button', { class: 'btn alt sm', 'data-act': 'chat', disabled: !nearby, title: nearby ? '和本人聊聊' : '在本人附近时可聊天', onclick: click(() => {
        const n = nearbyNpc();
        if (!n) { ui.toast('居民已经走远了，靠近本人再聊聊吧。'); render(); return; }
        modal.close(true); game.town.talk(n);
      }) }, '聊聊'),
        h('button', { class: 'btn alt sm', onclick: go(() => ui.reqPanel(id)) }, '往事与旧委托'), h('button', { class: 'btn alt sm', onclick: go(() => residentHub(game)) }, '其他居民')));
  };
  render();
  const refresh = setInterval(() => {
    if (!body.isConnected) { clearInterval(refresh); stopSong(); return; }
    const chat = body.querySelector('[data-act="chat"]'), nearby = !!nearbyNpc();
    if (chat) { chat.disabled = !nearby; chat.title = nearby ? '和本人聊聊' : '在本人附近时可聊天'; }
    if (!listening && signature !== JSON.stringify(residentLife.data(id))) render();
  }, 1000);
  modal = ui.modal(body, { ribbon: '居民日常', cls: 'live-modal', onClose: () => { clearInterval(refresh); stopSong(); } });
  return modal;
}
