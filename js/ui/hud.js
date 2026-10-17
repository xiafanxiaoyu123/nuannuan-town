// 游戏 HUD、任务指引、触屏控制显示与种子栏。由 UI 显式转发，this 始终是原来的 ui 单例。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h, fmt, tween, clamp, dragScroll, lerp } from '../core/util.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { S, save, beauty, activeRoomSets } from '../core/state.js';
import { FRUITS, CROPS, beautyRank } from '../data.js';
import { DOORS } from '../world/town.js';
import { focusSwatch } from '../world/decor/editing.js';
import { MAX_BUILD_LEVEL, MAX_BUILD_FLOOR } from '../world/build-constants.js';
import { cropIco } from '../core/icons.js';
import { listTasks, trackedTask, taskPanel } from './tasks.js';
import { coinIco, seedIco, avatarIcon } from '../core/icons.js';
import { live } from '../live/api.js';
import { controls } from '../core/preferences.js';
import { decorPlansPanel } from './decor-plans.js';
import { account } from '../core/account.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { SVG, svg } from './components/svg.js';
import { priceTag } from './components/price-tag.js';
import { click } from './components/actions.js';
import { setClass, captureContent, matchesContent } from './components/presentation.js';


export function applyControls() {
  if (!this.joy) return;
  const c = controls(), size = Math.min(c.joySize, Math.max(80, innerWidth * 0.38), Math.max(80, innerHeight * 0.34));
  const bottom = Math.min(c.joyBottom, Math.max(12, innerHeight * 0.5 - size));
  const edge = Math.min(c.joyEdge, Math.max(12, innerWidth * 0.12));
  this.root.dataset.moveSide = c.moveSide;
  this.root.toggleAttribute('data-large-text', c.textScale > 1);
  this.root.toggleAttribute('data-large-buttons', c.buttonScale > 1);
  this.root.classList.toggle('controls-touch', !!this.touchControls);
  this.joy.style.width = this.joy.style.height = size + 'px';
  for (const [key, value] of Object.entries({ 'joy-size': size + 'px', 'joy-bottom': bottom + 'px', 'joy-edge': edge + 'px', 'reading-scale': c.textScale, 'button-scale': c.buttonScale })) this.root.style.setProperty('--' + key, value);
}

export function buildHUD() {
  const g = this.game;
  this.coinsEl = h('span', { class: 'num' }, LOCAL_PLAY ? '∞' : fmt(S.coins));
  this.coinPill = h('div', { class: 'pill coin' }, h('img', { src: coinIco(), alt: '噗灵' }), this.coinsEl);
  this.beautyEl = h('span', { class: 'num' }, '0');
  this.rankEl = h('span', {}, '');
  this.avaEl = h('img', { class: 'me-ava', alt: '暖暖' });
  this.clockEl = h('div', { class: 'clock' }, h('i'), h('span', {}, '白天'));
  this.fpsNumEl = h('span', { class: 'num' }, '—');
  this.fpsDotEl = h('i', { class: 'fps-dot unknown' });
  this.fpsPill = h('button', {
    type: 'button',
    class: 'pill fps-pill' + (S.settings?.showFps ? '' : ' hide'),
    'data-fps-pill': '',
    title: '实时帧率（点击打开设置 · 按 F3 快速切换）',
    'aria-label': '实时帧率显示',
    onclick: click(() => this.settingsPanel(), 'tab'),
  }, this.fpsDotEl, this.fpsNumEl, h('small', {}, 'FPS'));
  this.quest = h('div', { class: 'quest card', onclick: () => { audio.init(); audio.sfx('click'); taskPanel(g); } });
  this.promptBtn = h('button', { class: 'prompt-btn primary', onclick: () => { audio.init(); g.town.interact(); } });
  this.promptSub = h('small', { class: 'hide' });
  this.promptExtra = h('div', { class: 'prompt-extra hide', 'aria-label': '其他可交互目标' });
  this.prompt = h('div', { class: 'prompt' }, this.promptSub, h('div', { class: 'prompt-list' }, this.promptBtn, this.promptExtra));
  this.bedBar = h('div', { class: 'bedbar', 'aria-live': 'polite' });
  this.giantCarryBtn = h('button', { class: 'giant-carry-stow hide', 'aria-label': '收起巨大作物', onclick: click(() => g.town.farm.stowCarry()) }, '收起巨大作物');
  this.seedbar = h('div', { class: 'tray card' });
  this.hint = h('div', { class: 'hint out' },
    h('span', {}, h('span', { class: 'kbd' }, 'W'), h('span', { class: 'kbd' }, 'A'), h('span', { class: 'kbd' }, 'S'), h('span', { class: 'kbd' }, 'D'), ' 或点击地面移动'),
    h('span', {}, h('span', { class: 'kbd' }, 'E'), ' 互动'), h('span', {}, '滚轮缩放'));
  const ib = (icon, label, fn, extra = '') => h('button', { class: 'ibtn' + (extra ? ` ${extra}` : ''), onclick: click(fn), 'aria-label': label }, h('span', {}, svg(icon)), h('span', {}, label));
  this.hud = h('div', { class: 'hud off' },
    h('div', { class: 'hud-tl' },
      h('div', { class: 'me' }, this.avaEl, h('div', {}, h('b', {}, '暖暖'), this.rankEl)),
      this.coinPill,
      h('div', { class: 'pill beauty', title: '家园美化度' }, svg('heart'), this.beautyEl),
      this.fpsPill),
    h('div', { class: 'hud-tr' },
      this.clockEl,
      (this.achBtn = ib('trophy', '成就', () => this.achPanel())),
      (this.camBtn = ib('eye', '视角', () => this.setCamMode(!g.town.camFree))),
      ib('hanger', '衣橱', () => g.openWardrobe('closet')),
      (this.decorBtn = ib('home', '装修', () => g.openDecor())),
      (this.helpBtn = ib('flag', '帮助', () => this.helpPanel())),
      (this.mailBtn = ib('mail', '邮件', () => this.mailPanel(), 'mail-quick')),
      (this.accountBtn = ib('user', LOCAL_PLAY ? '自由试玩' : '账号', () => this.accountPanel(), 'account-quick')),
      ib('gear', '设置', () => this.settingsPanel())),
    (this.momoBtn = h('button', { class: 'momosw', 'aria-label': '大喵自动浇水开关', onclick: click(() => {
      S.settings.momoWater = S.settings.momoWater === false; save(); this.refreshMomo();
      this.toast(S.settings.momoWater ? '大喵：包在我身上！缺水的田我来浇' : '大喵去歇着了，田要自己浇啦');
    }, 'tab') }, svg('drop'), h('span', {}, '大喵浇水'), h('b', {}), h('i'))),
    (this.reapBtn = h('button', { class: 'reapbtn', 'aria-label': '一键采集', onclick: click(() => {
      const n = g.town.farm.harvestAll();
      if (n) { audio.sfx('fanfare'); this.toast(`一键采集：收了 ${n} 块地，5 秒后恢复原搭配`, { kind: 'live-reward' }); } else this.toast('现在还没有成熟的作物');
      this.refreshReap();
    }) }, svg('star'), h('span', {}, '一键采集'), h('b', {}))),
    (this.joy = h('div', { class: 'joy', 'aria-label': '移动轮盘' }, (this.joyKnob = h('i')))),
    this.quest, (this.reqList = h('div', { class: 'reqs' })), (this.questTab = h('button', { class: 'questtab', onclick: click(() => { this.setQuestOff(false); taskPanel(g); }, 'tab'), 'aria-label': '打开任务清单' }, svg('flag'), '任务', h('em', { class: 'dot' }))), this.hint, this.seedbar, this.prompt, this.bedBar, this.giantCarryBtn,
    (this.camBar = h('div', { class: 'cambar' },
      h('p', {}, h('b', {}, '视角模式'), '拖动画面转动 · 双指或滚轮缩放'),
      h('button', { class: 'btn alt sm', onclick: click(() => g.town.resetCam(), 'tab') }, '恢复默认'),
      h('button', { class: 'btn sm', onclick: click(() => this.setCamMode(false), 'tab') }, '固定视角'),
      h('button', { class: 'camclose btn alt sm', onclick: click(() => { this.camBar.classList.remove('on'); this.camBar.classList.add('dismissed'); }, 'tab'), 'aria-label': '关闭自由视角提示' }, '关闭提示'),
      h('button', { class: 'camx', onclick: click(() => { S.settings.camMin = !S.settings.camMin; save(); this.camBar.classList.toggle('min', !!S.settings.camMin); }, 'tab'), 'aria-label': '收起或展开提示' }, svg('close')))));
  this.mailBtn.append(h('i', { class: 'dot' }));
  let fpsTickAt = 0;
  app.hooks?.push(() => {
    if (!S.settings?.showFps) return;
    const now = performance.now();
    if (now - fpsTickAt < 50) return;
    fpsTickAt = now;
    this.updateFpsReadout();
  });

  //帧率计数器开关（F3，不过我感觉好像没必要动态开关就注释掉了）
  // window.addEventListener?.('keydown', (e) => {
  //   if (e.code === 'F3' && !e.repeat && !e.defaultPrevented && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey &&
  //       !e.target?.closest?.('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"]')) {
  //     e.preventDefault();
  //     S.settings.showFps = !S.settings.showFps;
  //     save();
  //     this.syncFpsVisibility();
  //     this.toast(S.settings.showFps ? '帧率显示已开启 (F3)' : '帧率显示已隐藏 (F3)', { life: 1800 });
  //   }
  // });


  // 装修界面
  this.decorList = dragScroll(h('div', { class: 'list' }));
  this.decorInfo = h('div', {});
  this.floorList = dragScroll(h('div', { class: 'list hide' }));
  this.wallList = dragScroll(h('div', { class: 'list hide wall-list' }));
  this.wallButtons = [['wall','实墙','按住拖出整墙'],['door','门洞','拖到格线放下'],['move','移动墙段','拖动直墙或门洞'],['erase','拆除','点选墙段']].map(([id,label,note]) => h('button', {
    class:'slot wall-tool','data-wall-tool':id,onclick:click(()=>g.town.decor.selectWall(id),'tab')
  },h('span',{class:'wall-swatch '+id},id==='erase'?'⌫':''),h('b',{},label),h('small',{},note)));
  this.wallList.append(...this.wallButtons);
  this.decorTabs = h('div', { class: 'dtabs' },
    h('button', { class: 'on', onclick: click(() => this.setDecorTab('furn'), 'tab') }, '家具'),
    h('button', { onclick: click(() => this.setDecorTab('floor'), 'tab') }, '地面'),
    (this.wallTab=h('button',{'data-decor-tab':'walls',onclick:click(()=>this.setDecorTab('walls'),'tab')},'隔断')));
  this.decorCategory = 'all';
  this.decorCategories = h('div', { class: 'decor-categories', 'aria-label': '家具分类' },
    ...[['all', '全部'], ['foundation', '基座'], ['wall', '墙门窗'], ['roof', '屋顶'], ['garden', '庭院'], ['home', '室内'], ['kitchen', '厨房'], ['bathroom', '卫浴']].map(([id, label]) => h('button', {
      type: 'button', 'data-decor-category': id, 'aria-pressed': String(id === 'all'),
      onclick: click(() => { this.decorCategory = id; this.refreshDecor(); this.decorList.scrollLeft = 0; }, 'tab'),
    }, label)));
  this.decorLevelSelect = h('select', { 'aria-label': '家具摆放高度', onchange: () => {
    this.game.town.decor.setBuildLevel(Number(this.decorLevelSelect.value)); this.refreshDecor();
  } }, ...Array.from({ length: MAX_BUILD_LEVEL + 1 }, (_, level) => h('option', { value: String(level) }, level > MAX_BUILD_FLOOR ? '屋顶' : `${level + 1}楼`)));
  this.decorLevelLabel = h('label', { class: 'decor-level' }, '摆放在 ', this.decorLevelSelect);
  this.decorOwnedOnly = false;
  this.decorSearch = '';
  this.decorOwnedBtn = h('button', { type: 'button', class: 'decor-owned-toggle', 'aria-pressed': 'false', onclick: click(() => {
    this.decorOwnedOnly = !this.decorOwnedOnly; this.refreshDecor(); this.decorList.scrollLeft = 0;
  }, 'tab') }, '仅看库存');
  this.decorSearchInput = h('input', { type: 'search', class: 'decor-search', placeholder: '搜家具…', 'aria-label': '搜索家具名称', oninput: () => {
    this.decorSearch = (this.decorSearchInput.value || '').trim(); this.refreshDecor(); this.decorList.scrollLeft = 0;
  } });
  this.decorFilters = h('div', { class: 'decor-filterbar' }, this.decorCategories, this.decorOwnedBtn, this.decorSearchInput, this.decorLevelLabel);
  this.decorRepeat = h('button', { class: 'btn alt sm', 'aria-pressed': 'false', onclick: click(() => g.town.decor.setContinuous(!g.town.decor.continuous), 'tab') }, '连续放置：关');
  this.decorPickup = h('button', { class: 'btn alt sm', 'aria-pressed': 'false', onclick: click(() => g.town.decor.setPickupMode(!g.town.decor.pickupMode), 'tab') }, svg('hand'), '整理家具');
  this.decorUndo = h('button', { class: 'btn alt sm', 'aria-label': '撤销上一步', onclick: click(() => g.town.decor.undo(), 'tab') }, '撤销上一步');
  this.decorPlans = h('button', { class: 'btn alt sm', onclick: click(() => decorPlansPanel(this, g.town.decor)) }, '布局方案');
  this.decorCamera = h('button', { class: 'btn alt sm', 'data-decor-camera': 'toggle', onclick: click(() => this.toggleDecorCameraPanel(), 'tab') }, '转换视角');
  this.decorRoofs = h('button', { class: 'btn alt sm hide', 'aria-pressed': 'false', 'data-build-roofs': '', onclick: click(() => { g.town.buildRoofsHidden = !g.town.buildRoofsHidden; g.town.updateBuildRoofView(); this.refreshDecor(); }, 'tab') }, '隐藏屋顶');
  const camControl = (mode, label, fn) => h('button', { class: 'btn alt sm', 'data-decor-camera': mode, onclick: click(() => fn(), 'tab') }, label);
  this.decorCameraPanel = h('div', { class: 'decor-camera-panel decor-camera hide' },
    camControl('orbit', '旋转', () => g.town.decor.setCameraMode('orbit')),
    camControl('pan', '平移', () => g.town.decor.setCameraMode('pan')),
    camControl('left', '左转', () => g.town.decor.rotateView(-Math.PI / 2)),
    camControl('right', '右转', () => g.town.decor.rotateView(Math.PI / 2)),
    camControl('top', '俯视', () => g.town.decor.toggleTopView()),
    camControl('in', '拉近', () => g.town.decor.zoomBy(-4)),
    camControl('out', '拉远', () => g.town.decor.zoomBy(4)),
    camControl('reset', '回到全景', () => g.town.decor.resetView()),
    camControl('done', '完成视角', () => g.town.decor.setCameraMode('place')));
  this.decorbar = h('div', { class: 'decorbar' },
    h('div', { class: 'decor-controls card' },
      this.decorRepeat, this.decorPickup, this.decorUndo, this.decorPlans, this.decorCamera, this.decorRoofs,
      h('button', { class: 'btn alt sm', onclick: click(() => g.town.decor.rotate(), 'tab') }, svg('rotate'), '旋转'),
      h('button', { class: 'btn alt sm', onclick: click(() => g.town.decor.selectFloor(null), 'tab') }, '取消选择')),
    this.decorCameraPanel,
    h('div', { class: 'card decor-palette' }, this.decorTabs,
      h('div', { class: 'decor-catalog' }, this.decorFilters, this.decorList, this.floorList, this.wallList)));
  // 点选已摆好的家具后出现的操作条
  this.dfName = h('b', {});
  this.dfIcon = h('img', { alt: '' });
  this.dfSell = h('span', {});
  const df = (fn) => click(() => fn(g.town.decor), 'tab');
  this.decorFocus = h('div', { class: 'dfocus card' },
    h('div', { class: 'who' }, this.dfIcon, this.dfName),
    h('button', { class: 'btn sm', onclick: df((d) => d.focusMove()) }, svg('hand'), '移动'),
    h('button', { class: 'btn alt sm', onclick: df((d) => d.focusRotate()) }, svg('rotate'), '旋转'),
    (this.dfSwatch = h('button', { class: 'btn alt sm hide', 'data-decor-swatch': '', onclick: df((d) => focusSwatch(d)) }, '换色')),
    (this.dfReplace=h('button', { class: 'btn alt sm hide', onclick: df(() => this.buildWallReplacePanel()) }, '换墙体')),
    h('button', { class: 'btn alt sm', onclick: df((d) => d.focusStore(false)) }, '收进仓库'),
    h('button', { class: 'btn gold sm', onclick: df((d) => d.focusStore(true)) }, LOCAL_PLAY ? '' : '卖掉 ', this.dfSell),
    h('button', { class: 'dfx', onclick: df((d) => d.setFocus(null)), 'aria-label': '取消' }, svg('close')));
  this.decorbar.prepend(this.decorFocus);
  this.decorTip = h('p', { class: 'dtip' });
  this.decorbar.prepend(this.decorTip);
  this.decorBeauty = h('b', { class: 'num' });
  this.decorRank = h('p', {});
  this.decorFill = h('i');
  this.decortop = h('div', { class: 'decortop card' },
    h('div', {}, h('h4', {}, '家园装修'), this.decorRank),
    h('div', { class: 'beautybar' }, h('div', { class: 'bt' }, svg('heart'), this.decorBeauty), h('div', {}, this.decorFill)),
    h('button', { class: 'btn gold sm dup', onclick: click(() => { if (g.town.decor.exit() !== false) this.homePanel(); }) }, svg('up'), '升级房子 / 扩建'),
    h('button', { class: 'btn sm', onclick: click(() => g.town.decor.exit()) }, svg('check'), '完成'));
  // 任务方向指引：目标在屏幕外时贴边指路
  this.guideArrow = h('i', { html: SVG.up });
  this.guideText = h('span', {});
  this.guide = h('div', { class: 'guide hide' }, this.guideArrow, this.guideText);
  this.hud.append(this.guide);
  app.hooks.push(() => this.updateGuide());
  this.bubbles = [];
  this.bubbleLayer = h('div', { class: 'talkbs' });
  this.root.append(this.bubbleLayer);
  app.hooks.push((dt) => this.updateBubbles(dt));
  this.achBtn.append(h('em', { class: 'dot' }));
  this.root.append(this.hud, this.decorbar, this.decortop);
  this.buildSeeds();
  this.buildDecorList();
  // Measure only when HUD content changes size; fixed offsets cannot follow
  // longer labels, large text, four nearby actions or a wrapped toolbar.
  const metrics = new Map(), watched = new Set();
  const syncLayout = () => {
    for (const [selector, key, axis] of [
      ['.hud-tl', 'hud-left-height', 'height'], ['.hud-tr', 'hud-right-height', 'height'],
      ['.hud-tr', 'hud-right-width', 'width'], ['.quest:not(.hide), .questtab.on', 'hud-quest-height', 'height'],
      ['.prompt', 'hud-prompt-height', 'height'], ['.tray', 'hud-seed-height', 'height'],
      ['.momosw', 'hud-momo-width', 'width'], ['.momosw', 'hud-momo-height', 'height'],
      ['.shotbtn', 'hud-shot-width', 'width'], ['.shotbtn', 'hud-shot-height', 'height'],
    ]) {
      const element = this.hud.querySelector(selector);
      if (!element) continue;
      if (!watched.has(element)) { watched.add(element); resize?.observe(element); }
      const value = Math.ceil(element.getBoundingClientRect()[axis]);
      if (metrics.get(key) === value) continue;
      metrics.set(key, value); this.hud.style.setProperty('--' + key, value + 'px');
    }
  };
  // Updating a measured parent's variables inside ResizeObserver can resize a
  // child again in that same delivery cycle. Coalesce changes into the next
  // frame; no frame is scheduled when content sizes remain unchanged.
  let layoutQueued = false;
  const queueLayout = () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => { layoutQueued = false; syncLayout(); });
  };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(queueLayout) : null;
  const children = new MutationObserver(queueLayout);
  children.observe(this.hud, { childList: true });
  window.addEventListener('resize', queueLayout, { passive: true });
  syncLayout();
}

export function showHUD(on) {
  this.hud.classList.toggle('off', !on);
  this.refreshDecorAccess();
}

export function refreshDecorAccess() {
  const allowed = !!this.game.town?.canDecorate;
  this.decorBtn.classList.toggle('hide', !allowed);
  this.decorBtn.disabled = !allowed;
}

export function refreshReqs() { this.reqList.replaceChildren(); this.refreshQuest(); }

export function setCamMode(on) {
  this.game.town.camFree = on;
  this.camBtn.classList.toggle('on', on);
  this.camBar.classList.remove('dismissed');
  this.camBar.classList.toggle('on', on);
  this.camBar.classList.toggle('min', !!S.settings.camMin); // 提示收起过就一直保持收起，只留两个小按钮
  if (!on) this.toast('视角已固定');
  else this.tutorial('camera', false, { valid: () => this.game.town.camFree });
}

export function showHint() {
  if(this.modals||this.title||document.hidden)return;
  if(S.settings.autoTutorials===false||S.settings.tutorialSeen?.moveHint)return;
  S.settings.tutorialSeen??={};S.settings.tutorialSeen.moveHint=1;save();
  this.hint.classList.remove('out');
  clearTimeout(this._hintHideTimer);
  this._hintHideTimer=setTimeout(() => this.hint.classList.add('out'), 9000);
}

export function refreshAll() {
  this.refreshAch();
  this.refreshReqs();
  this.coinsEl.textContent = LOCAL_PLAY ? '∞' : fmt(S.coins);
  this.shownCoins = S.coins;
  this.refreshBeauty();
  this.refreshSeeds();
  this.refreshDecor();
  this.refreshAvatar();
  this.refreshMomo();
  this.refreshReap();
}

export function refreshReap() {
  const t = this.game.town;
  if (!this.reapBtn) return;
  const on = !!t && t.zone === 'home' && t.farm.harvestUnlocked();
  this.reapBtn.classList.toggle('on', on);
  const busy = !!t?.farm.harvestLook;
  this.reapBtn.disabled = !on || busy;
  this.reapBtn.querySelector('span').textContent = busy ? '采集换装中' : '一键采集';
  this.reapBtn.title = busy ? '约 5 秒后自动恢复你的搭配' : '已集齐满篮时光：自动换装采集，5 秒后恢复搭配';
  this.reapBtn.setAttribute('aria-label', busy ? '采集换装中，5 秒后自动恢复搭配' : '一键采集');
  if (!on) return;
  const n = t.farm.ripeCount();
  this.reapBtn.classList.toggle('none', !n);
  this.reapBtn.querySelector('b').textContent = n || '';
}

export function refreshMomo() {
  const on = S.settings.momoWater !== false;
  this.momoBtn.classList.toggle('off', !on);
  this.momoBtn.querySelector('b').textContent = on ? '开' : '关';
}

export function refreshAvatar() {
  this.avaEl.src = avatarIcon(S.outfit, S.outfit.hair + S.outfit.acc);
}

export function setCoins(total, delta) {
  if (LOCAL_PLAY) { this.coinsEl.textContent = '∞'; this.shownCoins = total; this.refreshDecor(); return; }
  const from = this.shownCoins ?? total;
  this.coinTw && this.coinTw.stop();
  this.coinTw = tween({ dur: 0.6, update: (k) => { this.shownCoins = from + (total - from) * k; this.coinsEl.textContent = fmt(Math.round(this.shownCoins)); } });
  if (delta > 0) {
    this.coinPill.classList.remove('bump');
    void this.coinPill.offsetWidth;
    this.coinPill.classList.add('bump');
  }
  this.refreshDecor();
}

export function refreshBeauty() {
  const b = beauty();
  const r = beautyRank(b);
  const sets = activeRoomSets();
  const setNote = sets.length ? ` · 共鸣 +${sets.reduce((s, x) => s + x.bonus, 0)}（${sets.map((x) => x.name).join('/')}）` : '';
  this.beautyEl.textContent = fmt(b);
  this.rankEl.textContent = r.name;
  this.decorBeauty.textContent = fmt(b);
  this.decorRank.textContent = (r.next ? `${r.name} · 距「${r.next.name}」还差 ${r.next.min - b}` : `${r.name} · 已达最高评价`) + setNote;
  this.decorFill.style.width = (r.next ? clamp((b - r.min) / (r.next.min - r.min)) * 100 : 100) + '%';
}

export function setQuestOff(off) {
  S.settings.questOff = off;
  save();
  this.refreshQuest();
  if (off) this.toast('任务栏已收起，点「任务」可以再打开');
}

export function refreshQuest() {
  const list = listTasks(this.game), q = trackedTask(this.game, list), off = !!S.settings.questOff;
  // 查询和追踪闭包始终更新；只复用相同的最终呈现，不能缓存业务查询或 S。
  this.tracked = q;
  const ready = !!(q && q.ready), pending = list.some((t) => t.ready);
  setClass(this.quest, 'hide', off);
  setClass(this.quest, 'ready', ready);
  setClass(this.questTab, 'on', off);
  setClass(this.questTab, 'has', pending);
  const heading = q ? `${q.group}${q.tag ? ' · ' + q.tag : ''}` : '小镇日常';
  const progress = q ? (q.ready ? '完成' : `${fmt(q.cur)}/${fmt(q.need)}`) : '';
  const width = q ? Math.min(100, (q.cur / q.need) * 100) + '%' : '';
  const moreText = list.length > 1 ? `全部任务 ${list.length} ›` : '任务清单 ›';
  const signature = JSON.stringify([q?.key, heading, q?.text, progress, q?.coins ? fmt(q.coins) : '', width, moreText]);
  const previous = this._questPresentation;
  if (previous?.state === S && previous.signature === signature && matchesContent(this.quest, previous.content)) return;
  this.quest.replaceChildren();
  this.quest.append(h('button', { class: 'qx', onclick: (e) => { e.stopPropagation(); audio.init(); audio.sfx('tab'); this.setQuestOff(true); }, 'aria-label': '收起任务栏' }, svg('close')));
  const more = h('span', { class: 'qmore' }, moreText);
  if (!q) {
    this.quest.append(h('h6', {}, svg('flag'), '小镇日常'), h('p', {}, '手上没有任务。去订单板或者找居民聊聊吧！'), more);
    this._questPresentation = { state: S, signature, content: captureContent(this.quest) };
    return;
  }
  const fill = h('i');
  this.quest.append(
    h('h6', {}, svg('flag'), heading),
    h('p', {}, q.text),
    h('div', { class: 'bar' }, h('div', {}, fill), h('span', { class: 'num' }, progress), q.coins ? priceTag(q.coins) : null),
    more);
  const presentation = this._questPresentation = { state: S, signature, content: captureContent(this.quest) };
  requestAnimationFrame(() => {
    if (this._questPresentation !== presentation) return;
    const intact = matchesContent(this.quest, presentation.content);
    if (this.quest.contains(fill)) fill.style.width = width;
    // 外部改动不能被异步进度条写入错误地确认为已缓存的正常内容。
    if (intact) presentation.content = captureContent(this.quest);
    else this._questPresentation = null;
  });
}

export function updateGuide() {
  const t = this.game.town;
  const q = this.tracked;
  const loc = q && q.loc && !S.settings.questOff && t && app.view === t && t.camMode === 'play' && !t.modal ? q.loc() : null;
  if (!loc) { this.guide.classList.add('hide'); return; }
  const qz = loc.zone || 'town';
  const other = qz !== t.zone;
  const dr = other ? DOORS[t.zone]?.[qz] : null;
  if (other && !dr) { this.guide.classList.add('hide'); return; }
  const tx = other ? dr.x : loc.x, tz = other ? dr.z : loc.z;
  const d = Math.hypot(tx - t.pos.x, tz - t.pos.z);
  const p = app.project({ x: tx, y: 1.5, z: tz }, t.camera);
  const m = 70, W = app.width, H = app.height;
  const inside = !p.behind && p.x > m && p.x < W - m && p.y > m + 40 && p.y < H - m - 60;
  if (d < 5 || inside) { this.guide.classList.add('hide'); return; }
  const cx = W / 2, cy = H / 2;
  let dx = p.x - cx, dy = p.y - cy;
  if (p.behind) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - m) / Math.abs(dx || 1), (H / 2 - m - 30) / Math.abs(dy || 1));
  this.guide.classList.remove('hide');
  this.guide.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px) translate(-50%, -50%)`;
  this.guideArrow.style.transform = `rotate(${Math.atan2(dx, -dy)}rad)`;
  const way = t.zone === 'build' ? '乘船回后院' : qz === 'build' && t.zone === 'home' ? '去码头乘船' : t.rooms[t.zone] ? '先出门' : qz !== 'town' && DOORS.town[qz] && !['house', 'home', 'build'].includes(qz) ? '去拜访' : t.zone === 'town' ? '先回家' : t.zone === 'home' ? '先回屋里' : qz === 'home' || qz === 'build' ? '走后门去后院' : '出门去小镇';
  const txt = `${other ? way : loc.where} · ${Math.round(d)}m`;
  if (txt !== this._gt) this.guideText.textContent = this._gt = txt;
}

export function setClock(t, night) {
  const name = t < 0.1 ? '清晨' : t < 0.56 ? '白天' : t < 0.75 ? '黄昏' : t < 0.95 ? '夜晚' : '清晨';
  if (name !== this._clk) {
    this._clk = name;
    this.clockEl.lastChild.textContent = name;
    this.clockEl.classList.toggle('night', name === '夜晚');
  }
}

export function setPrompt(p) {
  this.prompt.classList.toggle('on', !!p);
  if (!p) {
    this.prompt.classList.remove('multi', 'dis');
    if (this.promptExtra) {
      this.promptExtra.classList.add('hide');
      this.promptExtra.replaceChildren();
    }
    return;
  }
  const items = Array.isArray(p.items) && p.items.length > 1 ? p.items : null;
  this.prompt.classList.toggle('dis', !!p.disabled);
  this.prompt.classList.toggle('multi', !!items);
  this.promptBtn.disabled = !!p.disabled;
  this.promptBtn.replaceChildren(
    h('span', { class: 'kbd' }, 'E'),
    h('span', { class: 'prompt-txt' }, p.label)
  );
  this.promptSub.classList.toggle('hide', !p.sub);
  this.promptSub.textContent = p.sub || '';
  if (this.promptExtra) {
    if (!items) {
      this.promptExtra.classList.add('hide');
      this.promptExtra.replaceChildren();
    } else {
      this.promptExtra.classList.remove('hide');
      this.promptExtra.replaceChildren(...items.slice(1).map((item, idx) => {
        const keyHint = idx === 0 ? 'F' : String(idx + 2);
        return h('button', {
          type: 'button',
          class: 'prompt-btn secondary' + (item.disabled ? ' dis' : ''),
          disabled: !!item.disabled,
          'data-prompt-index': String(idx + 1),
          onclick: () => {
            if (item.disabled) return;
            audio.init();
            audio.sfx('click');
            if (typeof item.act === 'function') item.act();
            else this.game.town.interact(idx + 1);
          },
        },
        h('span', { class: 'kbd alt' }, keyHint),
        h('span', { class: 'prompt-txt' },
          item.label,
          item.sub ? h('em', { class: 'prompt-tag' }, ` · ${item.sub}`) : null
        ));
      }));
    }
  }
}

export function updateFpsReadout() {
  if (!this.fpsPill) return;
  const on = !!S.settings?.showFps;
  this.fpsPill.classList.toggle('hide', !on);
  if (!on) return;
  const raw = app.fpsAvg;
  const cap = app.capNow || app.fpsCap || 60;
  const fps = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : '—';

  this.fps_lerp = lerp(this.fps_lerp, fps, 0.2) | 0;

  if (this._shownFps !== this.fps_lerp) {
    this._shownFps = this.fps_lerp;
    this.fpsNumEl.textContent = Math.round(this.fps_lerp);
  }
  const state = fps === '—' ? 'unknown' : fps >= Math.min(50, cap * 0.85) ? 'good' : fps >= 30 ? 'warn' : 'low';
  if (this._fpsState !== state) {
    this._fpsState = state;
    this.fpsDotEl.className = 'fps-dot ' + state;
  }
}

export function syncFpsVisibility() {
  this.updateFpsReadout();
}

export function setBedMode(mode) {
  const on = !!mode;
  this.bedBar.classList.toggle('on', on);
  if (!on) { this.bedBar.replaceChildren(); return; }
  this.bedBar.replaceChildren(
    h('button', { class: 'btn gold', 'data-bed-action': 'sleep', onclick: click(() => mode.sleep?.(), 'tab') }, '睡到明早'),
    h('button', { class: 'btn alt', 'data-bed-action': 'down', onclick: click(() => mode.down?.(), 'tab') }, '下床')
  );
}

export function buildSeeds() {
  this.seedSlots = CROPS.map((c, i) =>
    h('button', { class: 'slot', title: `${c.name}：${c.grow} 秒成熟，售价 ${c.sell}`, onclick: () => this.tapSeed(i) },
      h('span', { class: 'key' }, i + 1), h('span', { class: 'seed-badge hide' }), h('img', { src: seedIco(c.id), alt: '' }), h('b', {}, c.name), priceTag(c.seed)));
  this.treeSlots = FRUITS.map((f, i) =>
    h('button', { class: 'slot tslot', title: `${f.tree}：每轮 ${f.cycle} 秒结果，${f.name}售价 ${f.sell}`, onclick: () => this.tapSeed(i, true) },
      h('span', { class: 'key' }, i + 1), h('img', { src: cropIco(f.id), alt: '' }), h('b', {}, f.tree + '苗'), priceTag(f.price)));
  this.seedbar.append(h('span', { class: 'traylab' }, '换一种'), ...this.seedSlots, ...this.treeSlots);
}

export function tapSeed(i, tree) {
  const compact = window.matchMedia('(pointer: coarse), (max-height: 560px), (max-aspect-ratio: 1/1)').matches;
  if (compact && !this.seedbar.classList.contains('open')) { audio.sfx('tab'); this.seedbar.classList.add('open'); return; }
  if (tree) this.game.town.farm.pickSapling(i); else this.game.town.farm.pickSeed(i);
  this.seedbar.classList.remove('open');
}

export function refreshSeeds() {
  const hotId = typeof this.hotCrop === 'function' ? this.hotCrop() : null;
  this.seedSlots.forEach((el, i) => {
    const c = CROPS[i], n = S.seeds[c.id] || 0, isHot = c.id === hotId;
    el.classList.toggle('sel', c.id === S.seed);
    el.querySelector('.price').replaceWith(n > 0 ? h('span', { class: 'price' }, `免费 ×${n}`) : priceTag(c.seed));
    const badge = el.querySelector('.seed-badge');
    if (badge) {
      badge.classList.toggle('hide', !isHot);
      badge.textContent = isHot ? '🔥高价' : '';
    }
  });
  this.treeSlots.forEach((el, i) => el.classList.toggle('sel', FRUITS[i].id === (S.sapling || 'apple')));
}

export function refreshGiantCarry() {
  if (!this.giantCarryBtn) return;
  this.giantCarryBtn.classList.toggle('hide', !this.game?.town?.farm?.carry);
}
