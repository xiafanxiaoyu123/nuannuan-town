// 居民委托、成就、商店、家园、结算和回收面板；不另建玩法状态。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h, fmt, tween, ease } from '../core/util.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { achReward, shopUpgradePrice, cropSellPrice, decorSellPrice } from '../core/state.js';
import { S, bus, beauty, styleBonus, getStat, achPending, claimAch } from '../core/state.js';
import { CROPS, CROP, DECO, SHOPS, SHOP_MAX_LV, shopMult, MAX_STAGE, HOUSES, STYLES, ACHS, YARDS } from '../data.js';
import { addCoins, stat } from '../core/state.js';
import { npcIco, cropIco } from '../core/icons.js';
import { reqOf, acceptReq, turnInReq } from '../core/requests.js';
import { coinIco, decorIcon, shopIcon, houseIcon, clothIcon } from '../core/icons.js';
import { outfitFx } from '../live/effects.js';
import { live } from '../live/api.js';
import { milestonePanel, storyStrip } from '../live/panels.js';
import { housePlan } from '../world/house-plan.js';
import { festivalDialogue } from '../live/festival-dialogue.js';
import { svg } from './components/svg.js';
import { priceTag } from './components/price-tag.js';
import { click } from './components/actions.js';

const FRIEND_AT_UI = 8;

export function reqPanel(id) {
  let m;
  const body = h('div', { class: 'req' });
  const render = () => {
    const r = reqOf(id), n = r.npc, st = STYLES[n.like], d = r.def;
    const fr = Math.min(FRIEND_AT_UI, (S.npc[id] || { t: 0 }).t);
    const hearts = h('div', { class: 'hearts' }, Array.from({ length: FRIEND_AT_UI }, (_, i) => h('i', { class: i < fr ? 'on' : '' })));
    let card;
    if (r.state === 'cool') {
      card = h('div', { class: 'reqcard cool' }, h('h3', {}, '暂时没有新的委托'), h('p', {}, `「谢谢你上次帮忙！我想想还有什么事……」`), h('p', { class: 'fine' }, `大约 ${Math.ceil(r.wait / 60)} 分钟后再来看看`));
    } else {
      const ico = d.type === 'deliver' ? cropIco(d.crop) : d.type === 'score' || (d.type === 'stat' && d.stat.startsWith('play_')) ? shopIcon(d.shop || d.stat.slice(5)) : null;
      const btn = r.state === 'offer'
        ? h('button', { class: 'btn', onclick: click(() => { acceptReq(id); audio.sfx('quest'); this.toast(`接下了${n.name}的委托：${d.title}`); render(); }) }, '接下委托')
        : r.state === 'ready'
          ? h('button', { class: 'btn gold', onclick: click((e) => { const b = e.currentTarget.getBoundingClientRect(); const v = turnInReq(id); if (v) { audio.sfx('fanfare'); this.flyCoins(b.left + b.width / 2, b.top, 8); this.toast(`${n.name}：谢谢你！  +${fmt(v)}`, { kind: 'quest', icon: coinIco(), life: 3600 }); } render(); }) }, '交付 ', priceTag(r.reward))
          : h('button', { class: 'btn alt', disabled: true }, '进行中…');
      card = h('div', { class: 'reqcard ' + r.state },
        h('p', { class: 'say' }, `「${d.say}」`),
        h('div', { class: 'goal' }, ico && h('img', { src: ico, alt: '' }), h('div', {}, h('h3', {}, d.title), h('p', {}, d.text),
          r.state !== 'offer' && h('div', { class: 'ach-bar' }, h('i', { style: { width: (r.cur / r.need) * 100 + '%' } }), h('span', { class: 'num' }, `${fmt(r.cur)}/${fmt(r.need)}`)))),
        h('div', { class: 'row' }, h('span', { class: 'rw' }, '报酬 ', priceTag(r.reward), h('em', {}, ` · 好感 +${2 * (1 + outfitFx(S.outfit, 'heart'))}`)), btn));
    }
    body.replaceChildren(
      h('div', { class: 'reqhead', style: { '--c': st.color } },
        h('img', { class: 'ava', src: npcIco(n.id), alt: '' }),
        h('div', {}, h('h2', {}, n.name), h('p', {}, `${n.job} · 喜欢「${st.name}」风格 · 已帮忙 ${r.st.done} 次`), hearts)),
      ...(festivalDialogue(id) ? [h('p', { class: 'say festival-dialogue' }, `「${festivalDialogue(id)}」`)] : []),
      card,
      h('div', { class: 'row resident-entry' }, h('button', { class: 'btn alt sm', onclick: click(() => { m.close(true); this.residentPanel(id); }) }, '看看居民日常')),
      storyStrip(id));
  };
  render();
  const stopDay = bus.on('newDay', render);
  m = this.modal(body, { ribbon: '居民委托', cls: 'live-modal', onClose: () => stopDay() });
}

export function refreshAch() {
  this.achBtn.classList.toggle('has', achPending() > 0);
}

export function achPanel() {
  const body = h('div', { class: 'ach' });
  const medal = (a, got) => h('div', { class: 'medal ' + a.tone + (got ? '' : ' off') }, svg(got ? 'trophy' : a.hidden ? 'lock' : 'trophy'));
  const render = () => {
    const done = ACHS.filter((a) => S.ach[a.id]).length, pend = achPending();
    const order = (a) => (S.ach[a.id] === 1 ? 0 : S.ach[a.id] === 2 ? 2 : 1);
    const list = ACHS.slice().sort((a, b) => order(a) - order(b));
    body.replaceChildren(
      h('div', { class: 'ach-head' },
        h('div', {}, h('h2', {}, '成就'), h('p', {}, `已达成 ${done} / ${ACHS.length} · 奖励需要手动领取`)),
        h('div', { class: 'ach-prog' }, h('i', { style: { width: (done / ACHS.length) * 100 + '%' } })),
        h('button', { class: 'btn gold sm', disabled: !pend, onclick: click(() => { let sum = 0; for (const a of ACHS) sum += claimAch(a.id); if (sum) { audio.sfx('coin'); this.flyCoins(app.width / 2, app.height / 2, 10); } render(); this.refreshAch(); }) }, pend ? `全部领取（${pend}）` : '没有可领取的')),
      h('div', { class: 'ach-list' }, list.map((a) => {
        const state = S.ach[a.id] || 0, secret = a.hidden && !state;
        const cur = Math.min(a.need, getStat(a.stat));
        return h('div', { class: 'ach-item' + (state === 1 ? ' ready' : state === 2 ? ' done' : '') },
          medal(a, state > 0),
          h('div', { class: 'ach-txt' },
            h('b', {}, secret ? '？？？' : a.name),
            h('p', {}, secret ? '一个藏起来的小秘密，在小镇里多试试吧' : a.desc),
            !state && !secret && a.need > 1 && h('div', { class: 'ach-bar' }, h('i', { style: { width: (cur / a.need) * 100 + '%' } }), h('span', { class: 'num' }, `${fmt(cur)}/${fmt(a.need)}`))),
          state === 1 ? h('button', { class: 'btn gold sm', onclick: click((e) => { const r = e.currentTarget.getBoundingClientRect(); claimAch(a.id); audio.sfx('coin'); this.flyCoins(r.left + r.width / 2, r.top, 6); render(); this.refreshAch(); }) }, '领取 ', priceTag(achReward(a)))
            : state === 2 ? h('span', { class: 'ach-got' }, '已领取') : h('span', { class: 'ach-rw' }, priceTag(achReward(a))));
      })));
  };
  render();
  this.modal(body, { ribbon: 'ACHIEVEMENTS' });
}

export function shopPanel(id) {
  if (id === 'bakery' && !live.project().done) { this.toast('面包房还在建设中，先完成工地出资'); return; }
  const g = this.game, sh = SHOPS[id], st = S.shops[id];
  let m;
  // 两种营业模式：关卡（选一关）和无尽
  let pick = Math.min(MAX_STAGE, (st.stage || 0) + 1);
  const modes = () => {
    const cleared = st.stage || 0, maxUnlocked = Math.min(MAX_STAGE, cleared + 1), stars = (st.stars || {})[pick] || 0;
    const unstarred = Array.from({ length: cleared }, (_, i) => i + 1).find((s) => ((st.stars || {})[s] || 0) < 3);
    const box = h('div', { class: 'modes' });
    const jumpTo = (target) => click(() => { pick = Math.max(1, Math.min(maxUnlocked, target)); box.replaceWith(modes()); }, 'tab');
    const step = (d) => jumpTo(pick + d);
    box.append(
      h('div', { class: 'mode lvmode' },
        h('h4', {}, '关卡模式', h('em', {}, `已过 ${cleared} / ${MAX_STAGE} 关`)),
        h('div', { class: 'stagepick' },
          h('button', { class: 'stp', disabled: pick <= 1, onclick: step(-1), 'aria-label': '上一关' }, '‹'),
          h('div', {}, h('b', {}, `第 ${pick} 关`), h('span', { class: 'ministars' }, [0, 1, 2].map((i) => svg('star', i < stars ? '' : 'off')))),
          h('button', { class: 'stp', disabled: pick >= maxUnlocked, onclick: step(1), 'aria-label': '下一关' }, '›')),
        maxUnlocked > 2 && h('div', { class: 'row', style: { gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' } },
          pick !== 1 && h('button', { type: 'button', class: 'btn alt sm', onclick: jumpTo(1) }, '第1关'),
          unstarred && unstarred !== pick && h('button', { type: 'button', class: 'btn alt sm', onclick: jumpTo(unstarred) }, `补星·第${unstarred}关`),
          pick !== maxUnlocked && h('button', { type: 'button', class: 'btn alt sm', onclick: jumpTo(maxUnlocked) }, `最新·第${maxUnlocked}关`)),
        h('button', { class: 'btn', onclick: click(() => { m.close(true); g.startGame(id, { mode: 'level', stage: pick }); }) }, svg('play'), pick <= cleared ? '重打这一关' : '开始营业')),
      h('div', { class: 'mode endmode' },
        h('h4', {}, '无尽模式', h('em', {}, '不限时 · 失误扣爱心')),
        h('p', {}, st.endBest ? `最高 ${fmt(st.endBest)} 噗灵 · 坚持 ${Math.floor((st.endTime || 0) / 60)}:${String((st.endTime || 0) % 60).padStart(2, '0')}` : '撑得越久节奏越快，看看能赚多少'),
        h('button', { class: 'btn alt', onclick: click(() => { m.close(true); g.startGame(id, { mode: 'endless' }); }) }, svg('play'), '挑战无尽')));
    return box;
  };
  const render = () => {
    const lv = st.lv, bonus = styleBonus(id);
    const cost = shopUpgradePrice(id);
    const stars = h('div', { class: 'lv' });
    for (let i = 0; i < SHOP_MAX_LV; i++) stars.append(svg('star', i < lv ? '' : 'off'));
    stars.append(h('span', {}, `Lv.${lv} · 收入 ×${shopMult(lv).toFixed(2)}`));
    const upBtn = lv < SHOP_MAX_LV
      ? h('button', { class: 'btn gold', onclick: () => g.upgradeShop(id, () => m.box.querySelector('.shop').replaceWith(render())) }, svg('up'), '升级店铺 ', priceTag(cost))
      : h('button', { class: 'btn gold', disabled: true }, '已满级');
    return h('div', { class: 'shop' },
      h('div', { class: 'art', style: { '--bg': sh.color + '55' } }, h('img', { src: shopIcon(id), alt: sh.name })),
      h('div', {},
        h('h2', {}, sh.name), stars,
        h('p', { class: 'tagline' }, sh.tagline),
        h('ol', {}, sh.how.map((t) => h('li', {}, t))),
        h('div', { class: 'bonusbar' + (bonus.n ? ' on' : ''), style: { '--c': bonus.style.color } },
          h('b', {}, `+${bonus.pct}%`),
          h('div', {}, h('strong', {}, `本店偏爱「${bonus.style.name}」风格`),
            h('span', {}, bonus.n ? `身上穿着 ${bonus.n} 件${bonus.style.name}服饰，每件 +6% 收入（最多 5 件 +30%）` : `每穿一件${bonus.style.name}风格的服饰，本店收入 +6%（最多 +30%）`)),
          bonus.n < 5 && h('button', { class: 'btn alt sm', onclick: click(() => { m.close(true); g.openWardrobe('closet'); }) }, '去换装')),
        h('div', { class: 'stats' },
          h('div', { class: 'chip' }, '最高营业额', h('b', {}, h('img', { src: coinIco() }), fmt(st.best))),
          h('div', { class: 'chip' }, '营业次数', h('b', {}, st.plays))),
        modes(),
        h('div', { class: 'row' }, upBtn,
          h('button', { class: 'btn alt sm', onclick: click(() => { m.close(true); this.tutorial(id, true); }) }, '玩法教程'))));
  };
  m = this.modal(h('div', {}, render()), { ribbon: '店铺经营', cls: 'live-modal shop-modal' });
}

export function homePanel() {
  const g = this.game;
  let m;
  const next = HOUSES[S.house];
  const up = next
    ? h('button', { class: 'bigcard', onclick: () => g.upgradeHouse(() => m.close(true)) },
        h('img', { src: houseIcon(next.tier), alt: '' }), h('b', {}, `升级为${next.name}`), h('p', {}, `室内扩至 ${housePlan(next.tier).cols}×${housePlan(next.tier).rows} 格 · 美化度 +${next.beauty - HOUSES[S.house - 1].beauty}${next.tier===3?' · 解锁自由隔断':''}`), priceTag(next.price))
    : h('div', { class: 'bigcard' }, h('img', { src: houseIcon(3), alt: '' }), h('b', {}, '云朵城堡'), h('p', {}, '室内 34×23 格 · 装修中可免费搭建实墙与门洞'));
  const yl = S.yardLv || 1, yn = YARDS[yl];
  const yard = yn
    ? h('button', { class: 'bigcard', onclick: () => g.upgradeYard(() => m.close(true)) },
        h('div', { class: 'yardico' }, YARDS.map((y) => h('i', { class: y.lv <= yl ? 'on' : y.lv === yl + 1 ? 'next' : '' }))), h('b', {}, `扩建为「${yn.name}」`), h('p', {}, `${yn.note}，美化度 +${yn.beauty - YARDS[yl - 1].beauty}`), priceTag(yn.price))
    : h('div', { class: 'bigcard' }, h('div', { class: 'yardico' }, YARDS.map(() => h('i', { class: 'on' }))), h('b', {}, '梦幻庄园'), h('p', {}, '整座小岛都已经是你的后院啦'));
  m = this.modal(h('div', { class: 'home' },
    h('h2', {}, '欢迎回家'),h('p',{class:'fine'},`当前室内 ${housePlan(S.house).cols}×${housePlan(S.house).rows} 格；升级保留家具和地板原位置。`),
    h('div', { class: 'grid' },
      h('button', { class: 'bigcard', onclick: click(() => { m.close(true); g.openWardrobe('closet'); }) },
        h('img', { src: clothIcon(S.outfit.dress), alt: '' }), h('b', {}, '打开衣橱'), h('p', {}, '换上已拥有的服饰，搭配今天的心情')),
      g.town.canDecorate && h('button', { class: 'bigcard', onclick: click(() => { m.close(true); g.openDecor(); }) },
        h('img', { src: decorIcon('swing'), alt: '' }), h('b', {}, '布置这里'), h('p', {}, '摆家具、换地面，提升家园美化度')),
      up, yard,
      g.town.farm.hasGiant() && h('button', { class: 'bigcard', 'data-giant-crop-entry': '', onclick: click(() => { m.close(true); this.giantCropPanel(); }) },
        h('img', { src: decorIcon(g.town.farm.giantIds()[0]), alt: '' }), h('b', {}, '展示巨大作物'), h('p', {}, '收获自动入装修仓库，想拿在手上时再选一件')),
      h('button', { class: 'bigcard', 'data-build-island-entry': '', onclick: click(() => { m.close(true); bus.emit('buildIslandPanel'); }) },
        h('b', {}, '海风工坊岛'), h('p', {}, S.buildQuest?.stage === 3 ? '从后院西岸坐船出发 · 独立空地自由搭建' : '码头来信：海风里的空白蓝图 · 完成剧情解锁')),
      h('button', { class: 'bigcard milestone-entry' + (live.milestones(beauty()).some((m) => m.reached && !m.claimed) ? ' has' : ''), onclick: click(() => { m.close(true); milestonePanel(); }) },
        h('em', { class: 'dot' }), h('b', {}, '阶段奖励'), h('p', {}, '提升美化度，领取噗灵并解锁居民来访')))), { ribbon: '暖暖的家', cls: 'live-modal' });
}

export function resultPanel(r) {
  return new Promise((resolve) => {
    let m;
    const total = h('span', {}, '0');
    const stars = h('div', { class: 'stars' });
    for (let i = 0; i < 3; i++) {
      const s = svg('star', i < r.stars ? 'on' : '');
      s.style.animationDelay = 0.25 + i * 0.22 + 's';
      stars.append(s);
    }
    const line = (label, val, hot, i) => { const d = h('div', { class: hot ? 'hot' : '' }, label, h('b', {}, val)); d.style.animationDelay = 0.5 + i * 0.12 + 's'; return d; };
    m = this.modal(h('div', { class: 'result' },
      // 结算明细独立滚动，操作区留在卡片内；小窗口和大字号也能离开或继续。
      h('div', { class: 'result-body', tabindex: '0', role: 'region', 'aria-label': '结算明细' },
        h('div', { class: 'result-summary' }, stars,
          r.record && h('div', { class: 'rec' }, '新纪录'),
          h('h2', {}, r.title)),
        h('div', { class: 'lines' },
          r.lines.map(([a, b], i) => line(a, b, false, i)),
          line(`店铺等级 Lv.${r.lv}`, `×${r.mult.toFixed(2)}`, false, r.lines.length),
          line(`${r.bonus.style.name}穿搭加成`, `+${r.bonus.pct}%`, r.bonus.n > 0, r.lines.length + 1)),
        h('div', { class: 'total' }, h('img', { src: coinIco(), alt: '金币' }), total)),
      h('div', { class: 'row result-actions' },
        h('button', { class: 'btn alt', onclick: click(() => { m.close(true); resolve('exit'); }) }, '返回小镇'),
        h('button', { class: 'btn' + (r.next ? ' alt' : ''), onclick: click(() => { m.close(true); resolve('again'); }) }, svg('play'), '再来一次'),
        r.next && h('button', { class: 'btn', onclick: click(() => { m.close(true); resolve('next'); }) }, '下一关 ›'))), { ribbon: r.ribbon || '营业结算', sticky: true, cls: 'result-modal' });
    tween({ dur: 1.1, delay: 0.9, ease: ease.outCubic, update: (k) => (total.textContent = fmt(Math.round(r.total * k))) });
    setTimeout(() => audio.sfx('fanfare'), 250);
  });
}

export function hotCrop() {
  return CROPS[Math.floor(Date.now() / 300000) % CROPS.length].id;
}

export function recyclePanel() {
  const g = this.game;
  let m, timer, priceStamp;
  const priceKey = () => this.hotCrop() + ':' + (live.festival()?.id || '') + ':' + outfitFx(S.outfit, 'dust');
  const render = () => {
    priceStamp = priceKey();
    const hot = this.hotCrop();
    const price = (id) => cropSellPrice(id, id === hot);
    const crops = Object.entries(S.crops).filter(([, n]) => n > 0);
    const spare = Object.entries(S.decor).filter(([id, n]) => n > 0 && DECO[id]);
    const total = crops.reduce((s, [id, n]) => s + price(id) * n, 0);
    const keep2Total = crops.reduce((s, [id, n]) => s + price(id) * Math.max(0, n - 2), 0);
    const left = Math.ceil((300000 - (Date.now() % 300000)) / 1000);
    return h('div', { class: 'recycle' },
      h('h2', {}, '回收小铺'),
      h('div', { class: 'hot' }, h('img', { src: cropIco(hot) }), h('div', {}, h('b', {}, `正在高价收购：${CROP[hot].name}`), h('span', {}, `价格 ×1.5 · ${Math.floor(left / 60)} 分 ${left % 60} 秒后换一种${live.festival()?.id === 'harvest' ? ' · 丰收节额外 +20%' : ''}`))),
      h('h3', {}, '背包里的作物'),
      crops.length ? h('div', { class: 'rlist' }, crops.map(([id, n]) => h('div', { class: 'rrow' + (id === hot ? ' hotrow' : '') },
        h('img', { src: cropIco(id) }), h('b', {}, `${CROP[id].name} ×${n}`), id === hot && h('span', { class: 'tag', style: { '--c': '#f0a53a' } }, '高价'), h('span', { class: 'sp' }),
        h('button', { class: 'btn sm ' + (id === hot ? 'gold' : 'alt'), onclick: (e) => sellOne(id, e) }, '卖出 ', priceTag(price(id) * n)))))
        : h('p', { class: 'empty' }, '还没有作物。去菜地收获一些再来吧。'),
      crops.length ? h('div', { class: 'row rsell', style: { flexWrap: 'wrap' } },
        S.crops[hot] > 0 && h('button', { class: 'btn gold', onclick: (e) => sellOne(hot, e) }, `只卖高价的${CROP[hot].name} `, priceTag(price(hot) * S.crops[hot])),
        keep2Total > 0 && h('button', { class: 'btn alt', onclick: (e) => {
          if (refreshQuote()) return;
          let earned = 0, soldCnt = 0;
          for (const [id, n] of crops) {
            const sellN = Math.max(0, n - 2);
            if (!sellN) continue;
            S.crops[id] = n - sellN;
            earned += price(id) * sellN;
            soldCnt += sellN;
          }
          if (!earned) return;
          addCoins(earned, 'sell');
          stat('sold', soldCnt);
          audio.sfx('coin');
          const b = e.currentTarget.getBoundingClientRect();
          this.flyCoins(b.left + b.width / 2, b.top, Math.min(10, 3 + soldCnt));
          this.toast(`已保留每种 2 份料理/委托备用，售出其余作物 +${fmt(earned)} 噗灵`, { icon: coinIco() });
          rer();
        } }, '保留每种2个，卖出其余 ', priceTag(keep2Total)),
        h('button', { class: 'btn ' + (S.crops[hot] > 0 ? 'alt' : 'gold'), onclick: () => { if (refreshQuote()) return; g.sellCrops(); rer(); } }, '全部卖出 ', priceTag(total))) : null,
      h('h3', {}, '闲置家具（半价回收）'),
      spare.length ? h('div', { class: 'rlist' }, spare.map(([id, n]) => h('div', { class: 'rrow' },
        h('img', { src: decorIcon(id) }), h('b', {}, `${DECO[id].name} ×${n}`), DECO[id].giantCrop && h('span', { class: 'tag', style: { '--c': '#ff9fbd' } }, '普通售价×20'), h('span', { class: 'sp' }),
        h('button', { class: 'btn alt sm', onclick: () => {
          if (refreshQuote() || !(S.decor[id] > 0)) return;
          S.decor[id]--;
          if (S.decor[id] <= 0) delete S.decor[id];
          addCoins(decorSellPrice(id), 'recycle');
          bus.emit('decorChanged');
          g.town?.farm?.syncCarry?.();
          audio.sfx('coin'); stat('recycled'); rer();
        } }, '卖 1 件 ', priceTag(decorSellPrice(id))))))
        : h('p', { class: 'empty' }, '仓库里没有闲置的家具。装修时把家具拿起来不再摆放，它就会进仓库。'));
  };
  const sellOne = (id, e) => {
    if (refreshQuote()) return;
    const n = S.crops[id] || 0;
    if (!n) return;
    const hot = this.hotCrop(), v = cropSellPrice(id, id === hot) * n;
    const b = e.currentTarget.getBoundingClientRect();
    delete S.crops[id];
    addCoins(v, 'sell');
    stat('sold', n);
    audio.sfx('coin');
    this.flyCoins(b.left + b.width / 2, b.top, Math.min(10, 3 + n));
    rer();
  };
  const rer = () => m.box.isConnected && m.box.querySelector('.recycle').replaceWith(render());
  const refreshQuote = () => {
    if (priceStamp === priceKey()) return false;
    rer(); this.toast('收购价刚刚更新，请重新查看价格'); return true;
  };
  m = this.modal(h('div', {}, render()), { ribbon: '回收', cls: 'live-modal', onClose: () => clearInterval(timer) });
  timer = setInterval(() => {
    if (!m.box.isConnected) { clearInterval(timer); return; }
    if (priceStamp !== priceKey()) rer();
  }, 1000);
}
