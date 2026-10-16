// 把新系统装进游戏：场景里的物件、HUD 入口、小游戏里的接入点。
// 由 main.js 默认安装，界面入口只读取真实业务接口。
import { app } from '../core/app.js';
import { disposeSceneResources } from '../core/kit.js';
import { S, bus, beauty, achPending } from '../core/state.js';
import { h } from '../core/util.js';
import { audio } from '../core/audio.js';
import { SHOPS } from '../data.js';
import { svg } from '../ui/ui.js';
import { live, initDaily, initBook, initStories, initGrants } from './api.js';
import { PROJECT, PERKS } from './data.js';
import { noticeBoard, constructionSite, shopBakery } from './props.js';
import { dailyPanel, bookPanel, perkPicker, perkChip, modifierBanner, modifierBadge, buildPanel, visitCard, milestonePanel } from './panels.js';
import { BakeryGame } from '../games/bakery.js';
import { initResidents, residentLife } from './residents.js';
import { residentHub, residentPanel } from './resident-panels.js';
import { installCanon } from './canon.js';
import { installFun } from './fun.js';
import { gameDate } from '../core/gametime.js';
import { SEASONS, seasonForMonth } from '../world/seasons.js';
import { installVisitors, archivePanel } from './visitors.js';
import { installNonoyHome } from './nonoyhome.js';
import { installPhoto } from './photo.js';
import { calendarPanel } from '../ui/calendar.js';
import { installFestivalDecor } from './festival-decor.js';

const BOARD = { x: -2.4, z: 1.2 }, SITE = { x: 36, z: -3.2 };

export function installLive(game, ui) {
  const town = game.town;
  initDaily(); // 进镇就接下当天订单，未打开面板时的游玩也要计入
  bus.on('bookFound', (name) => ui.toast('图鉴新发现：' + name, { kind: 'ach' }));
  initBook();
  bus.on('storyProgress', (s) => ui.toast(`「${s.title}」章节完成：${s.chapter}`, { kind: 'live-reward' }));
  bus.on('storyReward', (s) => ui.toast(`「${s.title}」完结：+${s.coins} 噗灵`, { kind: 'live-reward', life: 3600 }));
  initStories();
  initResidents();
  setTimeout(initGrants, 1500);
  ui.residentHub = () => residentHub(game);
  ui.residentPanel = (id) => residentPanel(id, game);
  // —— 第五家店登记数据；建成前由店铺入口/开局/升级共同拦住 ——
  SHOPS.bakery = { id: 'bakery', name: PROJECT.name, style: PROJECT.style, color: PROJECT.color, tagline: PROJECT.tagline, how: ['点面团入炉，金色区间及时取出', '面包先放展示架，点客人交付订单', 'Lv.2/3解锁面包，Lv.4加烤炉，Lv.5加宽金色区间'], upgrade: [600, 1500, 3200, 6000] };
  if (!S.shops.bakery) S.shops.bakery = { lv: 1, best: 0, plays: 0 };
  game.registerGame('bakery', BakeryGame);

  // —— 广场边的每日订单板 ——
  town.place(noticeBoard(), BOARD.x, BOARD.z, 0.25);
  town.addRect(BOARD.x - 1.3, BOARD.x + 1.3, BOARD.z - 0.3, BOARD.z + 0.3, 'live');
  town.inter.push({ id: 'dailyBoard', x: BOARD.x, z: BOARD.z + 1.4, r: 2, label: '每日订单板', sub: '今天的订单和签到', act: () => dailyPanel(), marker: town.marker(BOARD.x, 3.5, BOARD.z, '#ffc94d') });

  // —— 来访的达达、路边的互动小物件 ——
  installCanon(game);
  installNonoyHome(game); // 先清出地块，再放别的东西
  installVisitors(game);
  installNonoyHome.schedule && installNonoyHome.schedule();
  installPhoto(game);
  installFun(game);

  // —— 东边预留地：工地 → 面包房 ——
  let siteObj = null, sitePhase = -1;
  const rebuildSite = () => {
    const p = live.project();
    if (siteObj && sitePhase === p.phase) return;
    if (siteObj) {
      town.seasons.clearSubtree(siteObj);
      town.scene.remove(siteObj);
      disposeSceneResources(siteObj);
      const tick = siteObj.userData.tick;
      if (tick) town.ticks = town.ticks.filter((fn) => fn !== tick);
    }
    siteObj = p.done ? shopBakery() : constructionSite(p.phase);
    sitePhase = p.phase;
    siteObj.name = 'live-project';
    siteObj.userData.phase = p.phase;
    siteObj.position.set(SITE.x, 0, SITE.z);
    town.scene.add(siteObj);
    town.seasons.scanTrees(siteObj);
    if (siteObj.userData.tick) town.ticks.push(siteObj.userData.tick);
  };
  bus.on('liveProject', rebuildSite);
  rebuildSite();
  town.addRect(SITE.x - 3.6, SITE.x + 3.6, SITE.z - 2.8, SITE.z + 2.6, 'live');
  town.inter = town.inter.filter((i) => i.id !== 'plan');
  const openBuild = () => {
    if (live.project().done) { game.openShop('bakery'); return; }
    buildPanel((p, enter) => { rebuildSite(); if (enter) game.openShop('bakery'); });
  };
  town.inter.push({ id: 'buildSite', x: SITE.x, z: SITE.z + 3.8, r: 2.4, label: () => (live.project().done ? '进入 麦香面包房' : '新店工地 · 出资建造'), sub: '小满的面包房', act: openBuild, marker: town.marker(SITE.x, 5.2, SITE.z + 2.6, '#f6a56b') });

  // —— 四节独立主题布景；按小镇日期挂起和撤除，普通日不留临时物件 ——
  installFestivalDecor(game,ui);
  const refreshFestival = () => game.festivalDecor?.refresh();

  // —— 小镇的日期和时间：节日、居民日常、每天一次的互动都按它算（每日订单和签到仍按现实日期） ——
  const townDate = h('span', {}), townTime = h('b', { class: 'num' }), townPart = h('span', {});
  const townPill = h('button', { class: 'nowpill town', title: '小镇里的日期和时间', 'aria-label': '打开小镇日历与时间', onclick: () => calendarPanel(ui) }, h('em', {}, '小镇'), townDate, townTime, townPart);
  const nowRow = h('div', { class: 'nowrow' }, townPill);
  ui.hud.querySelector('.hud-tl').append(nowRow);
  // 小镇的一天：S.clock 0→1 走一圈。清晨 5 点起，白天到 17 点，黄昏到 19 点半，夜晚到次日 4 点
  const MARKS = [[0, 5], [0.1, 7], [0.56, 17], [0.75, 19.5], [0.95, 28], [1, 29]];
  const townClock = (c) => {
    let i = MARKS.findIndex((m) => c < m[0]);
    if (i < 1) i = MARKS.length - 1;
    const [c0, h0] = MARKS[i - 1], [c1, h1] = MARKS[i];
    const hr = (h0 + ((c - c0) / (c1 - c0)) * (h1 - h0)) % 24, m = Math.floor((hr % 1) * 6) * 10; // 分钟按十分钟一跳，不闪得太快
    return { text: `${String(Math.floor(hr)).padStart(2, '0')}:${String(m).padStart(2, '0')}`, part: c < 0.1 ? '清晨' : c < 0.56 ? '白天' : c < 0.75 ? '黄昏' : c < 0.95 ? '夜晚' : '清晨', night: c >= 0.75 && c < 0.95 };
  };
  let nowText = '';
  const refreshNow = () => {
    const tc = townClock(S.clock || 0);
    const date = gameDate(), season = seasonForMonth(date.month), name = SEASONS[season].name;
    const t = `${name} · ${date.text}|${tc.text}|${tc.part}`;
    if (t === nowText) return;
    nowText = t;
    [townDate.textContent, townTime.textContent, townPart.textContent] = t.split('|');
    townPill.classList.toggle('night', tc.night);
    townPill.dataset.season = season;
    townPill.title = `小镇历 · ${name}季，每月7天，每季21天；3—5月春，6—8月夏，9—11月秋，12—2月冬`;
  };
  refreshNow();

  // —— HUD只保留每日、装修和更多；次要入口复用原按钮及其事件，不克隆丢失状态 ——
  const ib = (icon, label, fn) => h('button', { class: 'ibtn', 'aria-label': label, onclick: () => { audio.init(); audio.sfx('click'); fn(); } }, h('span', {}, svg(icon)), h('span', {}, label));
  const tr = ui.hud.querySelector('.hud-tr');
  const bookBtn = ib('flag', '图鉴', () => bookPanel()), dailyBtn = ib('star', '每日', () => dailyPanel());
  const homeBtn = ib('home', '家园', () => ui.homePanel());
  const residentBtn = ib('heart', '居民', () => ui.residentHub());
  const archiveBtn = ib('eye', '人物', () => archivePanel(game));
  const companionBtn = ib('heart', '共同回忆', () => ui.companionPanel());
  const communityBtn = ib('home', '公共建设', () => ui.communityPanel());
  tr.insertBefore(dailyBtn, tr.children[1]);
  const secondary = [bookBtn, ui.achBtn, ui.camBtn, tr.querySelector('[aria-label="衣橱"]'), homeBtn, tr.querySelector('[aria-label="设置"]'), residentBtn, archiveBtn, companionBtn, communityBtn, ui.helpBtn];
  for (const btn of secondary) { btn.classList.add('hud-secondary'); tr.append(btn); }
  for (const btn of [dailyBtn, bookBtn, homeBtn, residentBtn]) btn.append(h('em', { class: 'dot' }));
  let moreDialog = null;
  const openMore = () => {
    if (game.busy || moreDialog) return;
    const grid = h('div', { class: 'more-grid' }, ...secondary);
    const body = h('div', { class: 'more-panel' }, h('div', { class: 'more-head' }, h('h2', {}, '更多'), ui.clockEl), grid);
    const m = ui.modal(body, { ribbon: '小镇手册', cls: 'live-modal', onClose: () => {
      tr.prepend(ui.clockEl); tr.append(...secondary); moreDialog = null;
    } });
    moreDialog = m;
    // 在原按钮处理点击之前关闭菜单，避免叠窗，也不解除新场景随后设置的输入锁
    grid.addEventListener('click', (e) => { if (e.target.closest('.ibtn')) m.close(true); }, { capture: true });
    return m;
  };
  ui.morePanel = openMore;
  const moreBtn = ib('more', '更多', openMore); moreBtn.append(h('em', { class: 'dot' })); tr.append(moreBtn);
  const refreshBadges = () => {
    const bookPending = live.book().some((t) => !t.claimed && t.items.every((i) => i.found || i.optional));
    const milePending = live.milestones(beauty()).some((m) => m.reached && !m.claimed);
    bookBtn.classList.toggle('has', bookPending); homeBtn.classList.toggle('has', milePending);
    const residentPending = residentLife.pending() > 0;
    residentBtn.classList.toggle('has', residentPending);
    moreBtn.classList.toggle('has', bookPending || milePending || residentPending || achPending() > 0);
  };
  let badgeQueued = false;
  const queueBadges = () => {
    if (badgeQueued) return;
    badgeQueued = true;
    queueMicrotask(() => { badgeQueued = false; refreshBadges(); });
  };
  for (const ev of ['liveBook', 'liveMilestones', 'residentActivity', 'ach', 'coins', 'decorChanged']) bus.on(ev, queueBadges);
  const refreshDaily = () => {
    refreshNow();
    refreshFestival();
    const d = live.daily();
    dailyBtn.classList.toggle('has', d.tasks.some((t) => t.done && !t.claimed) || (!d.chest.claimed && d.chest.done >= d.chest.need) || !live.signin().claimedToday);
    refreshBadges();
  };
  bus.on('quest', refreshDaily);
  bus.on('newDay', () => { refreshDaily(); ui.toast(`小镇新的一天：${gameDate().text}`, { life: 2200 }); });
  bus.on('liveDaily', refreshDaily);
  window.addEventListener('focus', refreshDaily);
  setInterval(refreshDaily, 1000);
  refreshDaily();

  // —— 小游戏里的接入点 ——
  game.liveHooks = {
    onGameInit(g) { g.modifier = g.endless ? null : live.modifierFor(g.id, g.stage); },
    // 开局：这一关带特殊规则就亮横幅；无尽模式准备强化栏
    onGameHUD(g) {
      const m = g.modifier;
      if (m) { g.modifier = m; g.hudEl.append(modifierBanner(m)); g.hudEl.querySelector('.gcombo').append(h('div', { class: 'gbonus on', style: { '--c': m.tone } }, m.name)); }
      if (g.endless) { g.perkBar = h('div', { class: 'perkbar' }); g.hudEl.querySelector('.gcombo').append(g.perkBar); g.perkAt = 45; }
    },
    // 每45秒暂停后选择；整个选择期间不推进计时、耐心、音符或甩竿补间
    onGameTick(g) {
      if (!g.endless || !g.playing || g.picking || g.elapsed < g.perkAt) return;
      g.picking = true;
      g.pause();
      g.perkChoice = perkPicker(g.id);
      g.perkChoice.then((p) => {
        if (g.dead || !p) return;
        live.applyPerk(g, p);
        g.perkBar.replaceChildren(...PERKS.filter((x) => g.perks[x.id]).map((x) => {
          const chip = perkChip(x);
          if (g.perks[x.id] > 1) chip.append(' ×' + g.perks[x.id]);
          return chip;
        }));
        g.perkAt = g.elapsed + 45;
        // 选完不立刻开跑：倒数 3、2、1 再继续，倒数完才算选择结束
        g.resumeCountdown().then(() => { g.picking = false; });
      });
    },
  };

  // —— 店铺面板切换关卡时更新特殊规则；剧情与套装条由各自界面直接渲染 ——
  const mo = new MutationObserver(() => {
    const modes = document.querySelector('.modes:not([data-live])');
    if (modes) {
      modes.dataset.live = 1;
      const title = modes.closest('.shop').querySelector('h2').textContent;
      const id = Object.keys(SHOPS).find((k) => SHOPS[k].name === title);
      const stage = Number((modes.querySelector('.stagepick b').textContent.match(/\d+/) || [0])[0]);
      const m = live.modifierFor(id, stage);
      modes.closest('.shop').querySelectorAll('.modbadge').forEach((el) => el.remove());
      if (m) modes.after(modifierBadge(m));
    }
  });
  mo.observe(ui.root, { childList: true, subtree: true });

  // —— 每次进入后院只抽一次；转场/教程结束后再出现，不在每帧重复抽签 ——
  let visitEntry = false;
  bus.on('zoneChanged', (zone) => { visitEntry = zone === 'home'; });
  app.hooks.push(() => {
    if (!visitEntry || town.zone !== 'home' || town.modal || game.busy || app.view !== town) return;
    visitEntry = false;
    const v = live.visit(beauty(), true);
    if (v) visitCard(v);
  });
  const syncLiveState = () => { initDaily(); initResidents(); initBook(); initStories(); initGrants(); rebuildSite(); refreshDaily(); visitEntry = false; };
  bus.on('reset', syncLiveState);
  bus.on('stateReplaced', syncLiveState);
  // 场景都搭好、动画跑过几帧之后，把建筑和摊位里不会动的零件合并，减少每帧的绘制次数
  setTimeout(() => { try { town.optimizeStatic(); } catch (e) { console.warn('optimizeStatic', e); } }, 2500);
  window.__live = { live, dailyPanel, bookPanel, perkPicker, buildPanel, milestonePanel, morePanel: openMore };
}
