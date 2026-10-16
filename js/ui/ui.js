// 界面层：HUD、提示、弹窗、标题画面
import { h, fmt, tween, ease, clamp, dragScroll ,lerp } from '../core/util.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { autosave, backupInfo, restoreBackup, checkAch, checkQuest, achReward, shopUpgradePrice, cropSellPrice, decorSellPrice } from '../core/state.js';
import { CLOTHES, FRUIT } from '../data.js';
import { S, bus, save, beauty, currentQuest, styleBonus, hasSave, getStat, achPending, claimAch } from '../core/state.js';
import { FRUITS, CROPS, CROP, DECOR, DECO, SHOPS, SHOP_MAX_LV, shopMult, MAX_STAGE, HOUSES, beautyRank, STYLES, QUESTS, FLOORS, TUTORIALS, ACHS, YARDS } from '../data.js';
import { DOORS } from '../world/town.js';
import { floorTex } from '../world/decor.js';
import { isYardStructure, isBuildRoof } from '../world/yard-building.js';
import { BUILD_SLOPED_ROOF_IDS } from '../world/build-roof-profiles.js';
import { MAX_BUILD_LEVEL, MAX_BUILD_FLOOR } from '../world/build-constants.js';
import { addCoins, stat } from '../core/state.js';
import { npcIco, cropIco } from '../core/icons.js';
import { reqOf, acceptReq, turnInReq, activeReqs } from '../core/requests.js';
import { listTasks, trackedTask, taskPanel } from './tasks.js';
import { applyOrient, isNativeApp, isMobileDevice } from '../core/orient.js';
import { coinIco, seedIco, decorIcon, avatarIcon, shopIcon, houseIcon, clothIcon } from '../core/icons.js';
import { outfitFx } from '../live/effects.js';
import { live } from '../live/api.js';
import { milestonePanel, storyStrip } from '../live/panels.js';
import { controls } from '../core/preferences.js';
import { controlsPanel, performancePanel } from './preferences.js';
import { calendarPanel } from './calendar.js';
import { saveTransferPanel } from './save-transfer.js';
import { decorPlansPanel } from './decor-plans.js';
import { housePlan } from '../world/house-plan.js';
import { TutorialManager, tutorialRead, tutorialPreferenceControl } from './tutorials.js';
import { festivalDialogue } from '../live/festival-dialogue.js';
import { account, accountSummary } from '../core/account.js';
import { startMailMonitor } from '../core/mail-monitor.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';


export const SVG = {
  more: '<svg viewBox="0 0 24 24"><circle class="fill" cx="5" cy="12" r="1.8"/><circle class="fill" cx="12" cy="12" r="1.8"/><circle class="fill" cx="19" cy="12" r="1.8"/></svg>',
  hanger: '<svg viewBox="0 0 24 24"><path d="M12 8.4V7.6c0-.8.6-1.1 1.1-1.5a2.1 2.1 0 1 0-3.2-1.8M12 8.4l8.4 6.2c1.1.8.5 2.6-.9 2.6h-15c-1.400 0-2-1.800-.9-2.600L12 8.400z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3.500 11.500 12 4l8.500 7.500M5.500 10v8.500a1 1 0 0 0 1 1H10v-5h4v5h3.500a1 1 0 0 0 1-1V10"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.200"/><path d="M12 2.800v2.600M12 18.600v2.600M2.800 12h2.600M18.600 12h2.600M5.500 5.500l1.800 1.800M16.700 16.700l1.800 1.800M5.500 18.500l1.800-1.800M16.700 7.300l1.800-1.800"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2.500 12c2.400-4.200 5.600-6.300 9.500-6.300s7.100 2.100 9.500 6.300c-2.400 4.200-5.600 6.300-9.500 6.300S4.900 16.200 2.500 12z"/><circle cx="12" cy="12" r="2.800"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M4.500 12a7.500 7.500 0 1 1 2.400 5.500M4.500 18.500v-4.300h4.300"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M14.500 5.500 8 12l6.500 6.500"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 2.800l2.800 5.900 6.400.8-4.700 4.400 1.200 6.400L12 17.200l-5.700 3.100 1.200-6.400L2.800 9.500l6.400-.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 20.500s-7.500-4.600-7.500-10A4.300 4.300 0 0 1 12 7.900a4.300 4.300 0 0 1 7.500 2.600c0 5.400-7.500 10-7.500 10z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 3.5c3 3.900 5.500 6.700 5.500 10a5.500 5.500 0 0 1-11 0c0-3.300 2.500-6.100 5.500-10z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M6 21V4M6 5h11l-2.200 3.500L17 12H6"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M7.500 4.500h9v4.800a4.500 4.500 0 0 1-9 0zM7.500 6H4.800v1.200a3 3 0 0 0 3 3M16.500 6h2.700v1.200a3 3 0 0 1-3 3M12 13.800v3.400M8.500 19.500h7M9.800 17.200h4.400"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.2 20c.5-3.4 2.7-5.2 6.8-5.2s6.3 1.8 6.8 5.2"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5.500" y="10.500" width="13" height="9" rx="2.200"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6.500 11.500 12 6l5.500 5.500"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path class="fill" d="M8 5.500v13l11-6.500z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8.500 12.500V6a1.500 1.500 0 0 1 3 0v5m0-1.500a1.500 1.500 0 0 1 3 0V11m0-.5a1.500 1.500 0 0 1 3 0v4c0 3.500-2 6-5.500 6-2.500 0-3.800-1-5-3l-2.300-3.800a1.400 1.400 0 0 1 2.300-1.500l1.500 1.800"/></svg>',
};
const svg = (name, cls) => {
  const s = h('span', { html: SVG[name] }).firstChild;
  if (cls) s.setAttribute('class', cls);
  return s;
};
export const priceTag = (n) => h('span', { class: 'price' }, h('img', { src: coinIco(), alt: '' }), fmt(n));
const FRIEND_AT_UI = 8;
const click = (fn, snd = 'click') => (e) => { audio.init(); audio.sfx(snd); fn(e); };

class UI {
  init(game) {
    this.game = game;
    game.ui = this;

    

    this.root = document.getElementById('ui');
    this.irisEl = document.getElementById('iris');
    this.toasts = h('div', { class: 'toasts' });
    this.floats = h('div', { style: { position: 'absolute', inset: '0' } });
    this.buildHUD();
    this.touchControls = !!window.matchMedia?.('(pointer: coarse)').matches;
    this.applyControls();
    const reflowControls = () => this.applyControls();
    window.addEventListener('resize', reflowControls, { passive: true });
    window.addEventListener('orientationchange', reflowControls, { passive: true });
    window.visualViewport?.addEventListener('resize', reflowControls, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', reflowControls, { passive: true });
    bus.on('reset', () => this.applyControls());
    this.root.append(this.floats, this.toasts);
    this.modals = 0;
    this.tutorials = new TutorialManager(this);
    bus.on('reset', () => this.cancelTutorials('reset'));
    globalThis.addEventListener?.('nuannuan:account', () => this.refreshAccountUi?.());
    this.mailMonitor?.stop();
    this.mailMonitor = startMailMonitor({
      account,
      onSummary: summary => this.refreshMailBadge(summary),
      onNotice: summary => this.mailNotice(summary),
      onReset: () => { this._mailNotice?.remove(); this._mailNotice = null; this.refreshMailBadge({}); },
      canNotify: () => this.canShowMailNotice(),
    });
    globalThis.addEventListener?.('nuannuan:sync', (event) => {
      const detail = event.detail || {};
      if (detail.state === 'saved') this.toast('云存档已同步', { life: 1600 });
      if (detail.state === 'error') this.toast(`云同步失败：${detail.error?.message || '稍后会重试'}`, { kind: 'warn', life: 4200 });
      if (detail.state === 'conflict' && detail.conflict) this.accountConflictPanel({ kind: 'conflict', cloud: detail.conflict, local: detail.local });
    });
    globalThis.addEventListener?.('nuannuan:entitlements', () => this.refreshAccountUi?.());

    bus.on('coins', (total, delta) => this.setCoins(total, delta));
    bus.on('poor', (need) => { audio.sfx('error'); this.toast(`噗灵不够，还差 ${fmt(need)}`, { kind: 'warn' }); });
    bus.on('prompt', (p) => this.setPrompt(p));
    bus.on('bedMode', (mode) => this.setBedMode(mode));
    bus.on('peek', () => { audio.sfx('error'); this.toast('这样做是不对的哦——好好玩游戏吧！', { kind: 'warn', life: 3800 }); stat('egg_peek'); });
    bus.on('ach', (a) => { audio.sfx('quest'); this.toast(`成就达成：${a.name}`, { kind: 'ach', life: 4200 }); this.refreshAch(); });
    bus.on('note', (t) => this.toast(t, { kind: 'quest', life: 3600 }));
    bus.on('bubble', (b) => this.bubble(b));
    bus.on('zone', (z) => { this.seedbar.classList.toggle('on', z === 'farm' || z === 'orchard'); if (z) this.seedbar.classList.toggle('trees', z === 'orchard'); this.seedbar.classList.remove('open'); });
    bus.on('seed', () => this.refreshSeeds());
    bus.on('zoneChanged', (z) => { this.tutorials?.cancelView(this.game.town); this.momoBtn.classList.toggle('on', z === 'home'); this.refreshReap(); this.refreshDecorAccess(); });
    // 移动轮盘：触屏设备才显示；按住拖动，松手回中。推得越远越接近全速
    {
      const joy = this.joy, knob = this.joyKnob;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) joy.classList.add('on');
      window.addEventListener('touchstart', () => { this.touchControls = true; joy.classList.add('on'); this.applyControls(); }, { once: true, passive: true });
      let pid = null;
      const set = (e) => {
        const r = joy.getBoundingClientRect(), R = r.width / 2;
        let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
        const st = this.game.town.stick, dead = len < 0.18;
        st.x = dead ? 0 : dx; st.y = dead ? 0 : -dy;
      };
      const end = (e) => {
        if (pid === null || (e && e.pointerId !== pid)) return;
        pid = null; knob.style.transform = ''; joy.classList.remove('held');
        const st = this.game.town.stick; st.x = 0; st.y = 0;
      };
      joy.addEventListener('pointerdown', (e) => { if (pid !== null) return; pid = e.pointerId; joy.classList.add('held'); try { joy.setPointerCapture(pid); } catch (err) { /* 老浏览器 */ } audio.init(); set(e); e.preventDefault(); });
      joy.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
      joy.addEventListener('pointerup', end);
      joy.addEventListener('pointercancel', end);
      bus.on('controlsChanged', end);
      window.addEventListener('blur', () => end());
      bus.on('decorMode', (on) => { joy.classList.toggle('hidden', !!on); end(); });
    }
    setInterval(() => this.refreshReap(), 1000);
    for (const event of ['harvestLookChanged', 'collection', 'stateReplaced']) bus.on(event, () => this.refreshReap());
    // 任何一类任务有变化都重画任务栏；同一帧里的多次变化合并成一次
    let questQueued = false;
    const queueQuest = () => { if (questQueued) return; questQueued = true; queueMicrotask(() => { questQueued = false; this.refreshQuest(); }); };
    for (const ev of ['quest', 'req', 'residentActivity', 'liveDaily', 'canon', 'reset']) bus.on(ev, queueQuest);
    bus.on('questDone', (q) => { audio.sfx('quest'); this.toast(`任务完成：${q.text}　+${q.reward}`, { kind: 'quest', icon: coinIco(), life: 3600 }); this.quest.classList.remove('flash'); void this.quest.offsetWidth; this.quest.classList.add('flash'); });
    bus.on('float', (f) => this.float(f));
    bus.on('toast', (t, o) => this.toast(t, { kind: 'warn', dedupeKey: o?.dedupeKey }));
    bus.on('giantCrop', () => this.tutorial('giantCrops', false, { valid: () => !!this.game?.town?.farm?.carry }));
    bus.on('giantCarryChanged', () => this.refreshGiantCarry());
    bus.on('decorMode', (on) => this.setDecorMode(on));
    bus.on('decorSel', () => this.refreshDecor());
    bus.on('decorFocus', (rec) => this.setDecorFocus(rec));
    bus.on('decorChanged', () => { this.refreshDecor(); this.refreshBeauty(); });
    bus.on('decorHistoryChanged', () => this.refreshDecor());
    bus.on('decorPreview', () => this.refreshDecor());
    bus.on('partitionPreview', () => this.refreshDecor());
    bus.on('decorCamera', () => this.refreshDecor());
    this.refreshAll();
  }

  // ——— 转场 ———
  applyControls() {
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

  async iris(fn) {
    const el = this.irisEl;
    audio.sfx('whoosh');
    el.classList.add('closed');
    await new Promise((r) => setTimeout(r, 620));
    await fn();
    await new Promise((r) => setTimeout(r, 220));
    el.classList.remove('closed');
    await new Promise((r) => setTimeout(r, 400));
  }
  
  

  // ——— HUD ———
  buildHUD() {
    const g = this.game;
    this.coinsEl = h('span', { class: 'num' }, LOCAL_PLAY ? '∞' : fmt(S.coins));
    this.coinPill = h('div', { class: 'pill coin' }, h('img', { src: coinIco(), alt: '噗灵' }), this.coinsEl);
    this.beautyEl = h('span', { class: 'num' }, '0');
    this.rankEl = h('span', {}, '');
    this.avaEl = h('img', { class: 'me-ava', alt: '暖暖' });
    this.clockEl = h('div', { class: 'clock' }, h('i'), h('span', {}, '白天'));
    this.quest = h('div', { class: 'quest card', onclick: () => { audio.init(); audio.sfx('click'); taskPanel(g); } });
    this.promptBtn = h('button', { onclick: () => { audio.init(); g.town.interact(); } });
    this.promptSub = h('small', { class: 'hide' });
    this.prompt = h('div', { class: 'prompt' }, this.promptSub, this.promptBtn);
    this.bedBar = h('div', { class: 'bedbar', 'aria-live': 'polite' });
    this.giantCarryBtn = h('button', { class: 'giant-carry-stow hide', 'aria-label': '收起巨大作物', onclick: click(() => g.town.farm.stowCarry()) }, '收起巨大作物');
    this.seedbar = h('div', { class: 'tray card' });
    this.hint = h('div', { class: 'hint out' },
      h('span', {}, h('span', { class: 'kbd' }, 'W'), h('span', { class: 'kbd' }, 'A'), h('span', { class: 'kbd' }, 'S'), h('span', { class: 'kbd' }, 'D'), ' 或点击地面移动'),
      h('span', {}, h('span', { class: 'kbd' }, 'E'), ' 互动'), h('span', {}, '滚轮缩放'));
    const ib = (icon, label, fn, extra = '') => h('button', { class: 'ibtn' + (extra ? ` ${extra}` : ''), onclick: click(fn), 'aria-label': label }, h('span', {}, svg(icon)), h('span', {}, label));
    
    this.fpsEl = h('div', { class: 'fps-counter' }, '-- FPS');
    this.refreshFpsVisibility();
  
    this.root.append(this.fpsEl);
    
    this.hud = h('div', { class: 'hud off' },

      h('div', { class: 'hud-tl' },


        h('div', { class: 'me' }, this.avaEl, h('div', {}, h('b', {}, '暖暖'), this.rankEl)),
        this.coinPill,
        h('div', { class: 'pill beauty', title: '家园美化度' }, svg('heart'), this.beautyEl)),
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
    this.decorFilters = h('div', { class: 'decor-filterbar' }, this.decorCategories, this.decorLevelLabel);
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

    //Fps Show Debug
    app.hooks.push(() => {
        this.fpsEl.fps = lerp( app.fpsAvg , (this.fpsEl.fps|| 0) , 0.8)
        if (this.fpsEl) this.fpsEl.textContent = Math.round(this.fpsEl.fps) + ' FPS';
    });
    
  }
  showHUD(on) {
    this.hud.classList.toggle('off', !on);
    this.refreshDecorAccess();
  }
  refreshDecorAccess() {
    const allowed = !!this.game.town?.canDecorate;
    this.decorBtn.classList.toggle('hide', !allowed);
    this.decorBtn.disabled = !allowed;
  }
  // 隐藏的作弊面板（入口藏在小镇里）
  cheatPanel(first) {
    const g = this.game, t = g.town;
    if (g.busy || this.modals > 0) return;
    if (first && !S.cheat) { audio.sfx('fanfare'); this.toast('你发现了小镇的秘密……', { kind: 'ach', life: 3600 }); }
    S.cheat = true;
    save();
    const done = (msg) => { audio.sfx('coin'); this.toast(msg); this.refreshAll(); checkQuest(); checkAch(); save(); };
    const acts = [
      ['噗灵 +10,000', '钱包鼓起来', () => { addCoins(10000, 'cheat'); done('噗灵 +10,000'); }],
      ['作物和果树全部成熟', '后院立刻可以收', () => {
        const now = Date.now();
        for (const p of Object.values(S.farm)) {
          if (p.tree) { const f = FRUIT[p.tree]; p.t0 = Math.min(p.t0, now - (f.big + 5) * 1000); p.last = now - (f.cycle + 5) * 1000; }
          else { p.t0 = now - p.dur - 1000; }
        }
        t.farm.refreshAll(); done('后院的作物和果树都熟了');
      }],
      ['解锁全部服饰', '衣橱一步到位', () => { S.owned = [...new Set([...S.owned, ...CLOTHES.map((c) => c.id)])]; done('所有服饰已放进衣橱'); }],
      ['所有店铺升到满级', 'Lv.5，收入 ×2.12', () => { for (const s of Object.values(S.shops)) s.lv = 5; done('所有店铺都升到了 Lv.5'); }],
      ['关卡全部解锁', '12 关随便选', () => { for (const s of Object.values(S.shops)) s.stage = Math.max(s.stage || 0, 11); done('所有关卡都可以选了'); }],
      ['切换白天 / 夜晚', '现在就看夜景', () => { S.clock = S.clock >= 0.56 && S.clock < 0.95 ? 0.2 : 0.8; done(S.clock > 0.5 ? '天黑了' : '天亮了'); }],
    ];
    this.modal(h('div', { class: 'cheat' },
      h('h2', {}, '秘密面板'),
      h('p', { class: 'fine' }, '这些操作会直接改存档，没有撤销；想反悔可以去 设置 → 读取备份。'),
      h('div', { class: 'cheatgrid' }, acts.map(([name, sub, fn]) => h('button', { class: 'bigcard', onclick: () => fn() }, h('b', {}, name), h('p', {}, sub))))), { ribbon: 'SECRET' });
  }
  // 居民头顶的对话气泡：跟着人物走，到时间自动消失
  bubble(b) {
    const old = this.bubbles.find((x) => x.obj === b.obj);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = h('div', { class: 'talkb', style: { '--c': b.tone || '#ff8fb1' } }, h('b', {}, b.name), h('span', {}, b.text));
    this.bubbleLayer.append(el);
    this.bubbles.push({ ...b, el, t: 0 });
  }
  updateBubbles(dt) {
    if (!this.bubbles.length) return;
    const t = this.game.town, on = app.view === t && t.camMode === 'play' && t.zone === 'town';
    this._bv = this._bv || t.pos.clone();
    for (const b of [...this.bubbles]) {
      b.t += dt;
      if (b.t > b.life || !on) { b.el.classList.add('out'); if (b.t > b.life + 0.3 || !on) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); } continue; }
      const p = app.project(this._bv.copy(b.obj.position).setY(2.75), t.camera);
      b.el.style.transform = `translate(${Math.round(Math.min(app.width - 20, Math.max(20, p.x)))}px, ${Math.round(Math.max(70, p.y))}px) translate(-50%, -100%)`;
      b.el.style.visibility = p.behind ? 'hidden' : 'visible';
    }
  }
  // 左上角：进行中的居民委托（最多列三条）
  refreshReqs() { this.reqList.replaceChildren(); this.refreshQuest(); }
  // 居民委托面板：在居民身边或他家门口打开
  reqPanel(id) {
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
  refreshAch() {
    this.achBtn.classList.toggle('has', achPending() > 0);
  }
  achPanel() {
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
  // 视角模式：开着时拖动画面转镜头；关掉后镜头固定在当前角度
  setCamMode(on) {
    this.game.town.camFree = on;
    this.camBtn.classList.toggle('on', on);
    this.camBar.classList.remove('dismissed');
    this.camBar.classList.toggle('on', on);
    this.camBar.classList.toggle('min', !!S.settings.camMin); // 提示收起过就一直保持收起，只留两个小按钮
    if (!on) this.toast('视角已固定');
    else this.tutorial('camera', false, { valid: () => this.game.town.camFree });
  }
  showHint() {
    if(this.modals||this.title||document.hidden)return;
    if(S.settings.autoTutorials===false||S.settings.tutorialSeen?.moveHint)return;
    S.settings.tutorialSeen??={};S.settings.tutorialSeen.moveHint=1;save();
    this.hint.classList.remove('out');
    clearTimeout(this._hintHideTimer);
    this._hintHideTimer=setTimeout(() => this.hint.classList.add('out'), 9000);
  }
  refreshAll() {
    this.refreshAch();
    this.refreshReqs();
    this.coinsEl.textContent = LOCAL_PLAY ? '∞' : fmt(S.coins);
    this.shownCoins = S.coins;
    this.refreshBeauty();
    this.refreshQuest();
    this.refreshSeeds();
    this.refreshDecor();
    this.refreshAvatar();
    this.refreshMomo();
    this.refreshReap();
  }
  // 集齐「满篮时光」三件后在后院常显；无需持续穿戴。
  refreshReap() {
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
  refreshMomo() {
    const on = S.settings.momoWater !== false;
    this.momoBtn.classList.toggle('off', !on);
    this.momoBtn.querySelector('b').textContent = on ? '开' : '关';
  }
  refreshAvatar() {
    this.avaEl.src = avatarIcon(S.outfit, S.outfit.hair + S.outfit.acc);
  }
  setCoins(total, delta) {
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
  refreshBeauty() {
    const b = beauty();
    const r = beautyRank(b);
    this.beautyEl.textContent = fmt(b);
    this.rankEl.textContent = r.name;
    this.decorBeauty.textContent = fmt(b);
    this.decorRank.textContent = r.next ? `${r.name} · 距「${r.next.name}」还差 ${r.next.min - b}` : `${r.name} · 已达最高评价`;
    this.decorFill.style.width = (r.next ? clamp((b - r.min) / (r.next.min - r.min)) * 100 : 100) + '%';
  }
  // 任务指引可以收起：收起后左上角只留一个小标签，指路箭头也一起隐藏
  setQuestOff(off) {
    S.settings.questOff = off;
    save();
    this.refreshQuest();
    if (off) this.toast('任务栏已收起，点「任务」可以再打开');
  }
  refreshQuest() {
    const list = listTasks(this.game), q = trackedTask(this.game, list), off = !!S.settings.questOff;
    this.tracked = q;
    this.quest.replaceChildren();
    this.quest.classList.toggle('hide', off);
    this.quest.classList.toggle('ready', !!(q && q.ready));
    this.questTab.classList.toggle('on', off);
    this.questTab.classList.toggle('has', list.some((t) => t.ready));
    this.quest.append(h('button', { class: 'qx', onclick: (e) => { e.stopPropagation(); audio.init(); audio.sfx('tab'); this.setQuestOff(true); }, 'aria-label': '收起任务栏' }, svg('close')));
    const more = h('span', { class: 'qmore' }, list.length > 1 ? `全部任务 ${list.length} ›` : '任务清单 ›');
    if (!q) {
      this.quest.append(h('h6', {}, svg('flag'), '小镇日常'), h('p', {}, '手上没有任务。去订单板或者找居民聊聊吧！'), more);
      return;
    }
    const fill = h('i');
    this.quest.append(
      h('h6', {}, svg('flag'), `${q.group}${q.tag ? ' · ' + q.tag : ''}`),
      h('p', {}, q.text),
      h('div', { class: 'bar' }, h('div', {}, fill), h('span', { class: 'num' }, q.ready ? '完成' : `${fmt(q.cur)}/${fmt(q.need)}`), q.coins ? priceTag(q.coins) : null),
      more);
    requestAnimationFrame(() => (fill.style.width = Math.min(100, (q.cur / q.need) * 100) + '%'));
  }
  updateGuide() {
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
  setClock(t, night) {
    const name = t < 0.1 ? '清晨' : t < 0.56 ? '白天' : t < 0.75 ? '黄昏' : t < 0.95 ? '夜晚' : '清晨';
    if (name !== this._clk) {
      this._clk = name;
      this.clockEl.lastChild.textContent = name;
      this.clockEl.classList.toggle('night', name === '夜晚');
    }
  }
  setPrompt(p) {
    this.prompt.classList.toggle('on', !!p);
    if (!p) return;
    this.prompt.classList.toggle('dis', !!p.disabled);
    this.promptBtn.replaceChildren(h('span', { class: 'kbd' }, 'E'), p.label);
    this.promptSub.classList.toggle('hide', !p.sub);
    this.promptSub.textContent = p.sub || '';
  }

  setBedMode(mode) {
    const on = !!mode;
    this.bedBar.classList.toggle('on', on);
    if (!on) { this.bedBar.replaceChildren(); return; }
    this.bedBar.replaceChildren(
      h('button', { class: 'btn gold', 'data-bed-action': 'sleep', onclick: click(() => mode.sleep?.(), 'tab') }, '睡到明早'),
      h('button', { class: 'btn alt', 'data-bed-action': 'down', onclick: click(() => mode.down?.(), 'tab') }, '下床')
    );
  }

  buildSeeds() {
    this.seedSlots = CROPS.map((c, i) =>
      h('button', { class: 'slot', title: `${c.name}：${c.grow} 秒成熟，售价 ${c.sell}`, onclick: () => this.tapSeed(i) },
        h('span', { class: 'key' }, i + 1), h('img', { src: seedIco(c.id), alt: '' }), h('b', {}, c.name), priceTag(c.seed)));
    this.treeSlots = FRUITS.map((f, i) =>
      h('button', { class: 'slot tslot', title: `${f.tree}：每轮 ${f.cycle} 秒结果，${f.name}售价 ${f.sell}`, onclick: () => this.tapSeed(i, true) },
        h('span', { class: 'key' }, i + 1), h('img', { src: cropIco(f.id), alt: '' }), h('b', {}, f.tree + '苗'), priceTag(f.price)));
    this.seedbar.append(h('span', { class: 'traylab' }, '换一种'), ...this.seedSlots, ...this.treeSlots);
  }
  // 手机上种子栏默认只显示当前这一种（收在左下角），点一下展开，选完自动收起
  tapSeed(i, tree) {
    const compact = window.matchMedia('(pointer: coarse), (max-height: 560px), (max-aspect-ratio: 1/1)').matches;
    if (compact && !this.seedbar.classList.contains('open')) { audio.sfx('tab'); this.seedbar.classList.add('open'); return; }
    if (tree) this.game.town.farm.pickSapling(i); else this.game.town.farm.pickSeed(i);
    this.seedbar.classList.remove('open');
  }
  refreshSeeds() {
    this.seedSlots.forEach((el, i) => {
      const c = CROPS[i], n = S.seeds[c.id] || 0;
      el.classList.toggle('sel', c.id === S.seed);
      el.querySelector('.price').replaceWith(n > 0 ? h('span', { class: 'price' }, `免费 ×${n}`) : priceTag(c.seed));
    });
    this.treeSlots.forEach((el, i) => el.classList.toggle('sel', FRUITS[i].id === (S.sapling || 'apple')));
  }
  buildDecorList() {
    this.decorSlots = DECOR.map((d) => {
      const cnt = h('span', { class: 'cnt' });
      const el = h('button', { class: 'slot', 'data-decor-id': d.id, title: `${d.name} · 美化度 +${d.beauty}${d.indoorOnly ? ' · 仅限室内' : ''}`, onclick: click(() => this.game.town.decor.select(d.id), 'tab') },
        cnt, h('img', { alt: '' }), h('b', {}, d.name), priceTag(d.price));
      el._cnt = cnt;
      el._id = d.id;
      return el;
    });
    this.decorList.append(...this.decorSlots);
    this.floorSlots = FLOORS.map((f) => {
      const el = h('button', { class: 'slot', onclick: click(() => {
        if (!LOCAL_PLAY && f.mile !== undefined && !S.live.miles.includes(f.mile)) { this.toast('这种地面是家园美化度的阶段奖励，去「家园」里领了就能铺'); return; }
        this.game.town.decor.selectFloor(f.id); this.refreshDecor();
      }, 'tab') },
        h('img', { class: 'sw', src: floorTex(f.id).url, alt: '' }), h('b', {}, f.name), !LOCAL_PLAY && f.price ? priceTag(f.price) : h('span', { class: 'price free' }, '免费'));
      el._id = f.id;
      return el;
    });
    this.floorList.append(...this.floorSlots);
  }
  setDecorTab(tab) {
    if(tab==='walls'&&(this.game.town.zone!=='house'||!this.game.town.partitions?.enabled))return this.toast('升级到云朵城堡后，可在屋内搭建隔断');
    this.decorTab=tab;
    this.decorTabs.children[0].classList.toggle('on', tab === 'furn');
    this.decorTabs.children[1].classList.toggle('on', tab === 'floor');
    this.decorList.classList.toggle('hide', tab !== 'furn');
    this.floorList.classList.toggle('hide', tab !== 'floor');
    this.wallList.classList.toggle('hide',tab!=='walls');this.wallTab.classList.toggle('on',tab==='walls');
    const d = this.game.town.decor;
    if (tab === 'floor' && d.cfg.freeBuild) d.setBuildLevel(0);
    d.selectFloor(null);
    this.refreshDecor();
    if (tab === 'walls') this.tutorial('partitions', false, { valid: () => d.active && this.decorTab === 'walls' });
  }
  toggleDecorCameraPanel() {
    const d = this.game.town.decor;
    if (d.cameraMode === 'place') d.setCameraMode('orbit');
    else d.setCameraMode('place');
    this.refreshDecor();
    if (d.cameraMode !== 'place') this.tutorial('decorCamera', false, { valid: () => d.active && d.cameraMode !== 'place' });
  }
  buildWallReplacePanel() {
    const decor=this.game.town.decor, rec=decor.focus;
    if(!rec||!decor.cfg.freeBuild)return;
    let modal;
    modal=this.modal(h('div',{},h('h2',{},'更换墙体'),
      h('p',{},'在原位置换成墙、门洞或窗墙，保留楼板支撑和房间围合。旧构件会收进仓库，完成装修前可以撤销。'),
      h('div',{class:'row',style:{flexWrap:'wrap',gap:'.6rem'}},...['yard_wall','yard_door','yard_window'].map(id=>h('button',{
        class:'btn alt',disabled:id===rec.e.id,'data-build-replace':id,
        onclick:()=>{if(decor.focus!==rec)return modal.close(true);if(decor.replaceBuildWall(id))modal.close(true);}
      },DECO[id].name, h('small',{},LOCAL_PLAY?' · 免费':(S.decor[id]||0)>0?' · 使用库存':` · ${fmt(DECO[id].price)} 噗灵`))))),{ribbon:'建筑连接'});
  }
  setDecorFocus(rec) {
    this.decorFocus.classList.toggle('on', !!rec);
    this.decorTip.classList.toggle('hide', !!rec);
    if (!rec) return;
    const d = DECO[rec.e.id];
    this.dfIcon.src = decorIcon(rec.e.id);
    this.dfName.textContent = d.name;
    this.dfReplace.classList.toggle('hide', !this.game.town.decor.cfg.freeBuild || !['yard_wall','yard_door','yard_window'].includes(d.id));
    this.dfSell.replaceChildren(LOCAL_PLAY ? h('span', {}, '移除') : priceTag(decorSellPrice(d.id)));
  }
  refreshDecor() {
    if (this.decorUndo && this.game.town) {
      const d = this.game.town.decor;
      this.decorUndo.disabled = !d.canUndo;
      this.decorUndo.title = d.undoLabel ? '撤销：' + d.undoLabel : '没有可撤销的操作';
    }
    if (!this.decorSlots) return;
    this.refreshDecorAccess();
    const decor = this.game.town?.decor;
    if (this.decorFilters && decor) {
      const indoor = !!decor.cfg.indoor;
      const available = decor.cfg.freeBuild ? ['all', 'foundation', 'wall', 'roof', 'garden', 'home', 'kitchen', 'bathroom'] : indoor ? ['all', 'home', 'kitchen', 'bathroom'] : ['all', 'garden'];
      if (!available.includes(this.decorCategory)) this.decorCategory = 'all';
      this.decorFilters.classList.toggle('hide', this.decorTab !== 'furn');
      for (const button of this.decorCategories.children) {
        button.classList.toggle('hide', !available.includes(button.dataset.decorCategory));
        button.setAttribute('aria-pressed', String(this.decorCategory === button.dataset.decorCategory));
      }
      this.decorLevelLabel.classList.toggle('hide', !decor.cfg.freeBuild);
      this.decorLevelSelect.value = String(decor.buildLevel || 0);
    }
    if (this.decorRoofs) {
      this.decorRoofs.classList.toggle('hide', !decor?.cfg.freeBuild);
      this.decorRoofs.textContent = this.game.town.buildRoofsHidden ? '显示屋顶' : '隐藏屋顶';
      this.decorRoofs.setAttribute('aria-pressed', String(!!this.game.town.buildRoofsHidden));
    }
    if (this.decorCameraPanel && decor) {
      const adjusting = decor.cameraMode !== 'place';
      this.decorCameraPanel.classList.toggle('hide', !adjusting);
      this.decorbar?.classList.toggle('camera-adjusting', adjusting);
      const palette = this.decorbar?.querySelector(':scope > .card:last-child');
      palette?.classList.toggle('hide', adjusting);
      this.decorCamera?.classList.toggle('on', adjusting);
      this.decorCamera?.setAttribute('aria-pressed', String(adjusting));
      for (const button of this.decorCameraPanel.querySelectorAll('[data-decor-camera]')) {
        const id = button.dataset.decorCamera;
        if (id === 'orbit' || id === 'pan') button.setAttribute('aria-pressed', String(decor.cameraMode === id));
        if (id === 'top') { button.textContent = decor.viewPitch > 1.18 ? '斜视' : '俯视'; button.setAttribute('aria-pressed', String(decor.viewPitch > 1.18)); }
      }
    }
    if(this.wallTab){this.wallTab.hidden=this.game.town?.zone!=='house';this.wallTab.disabled=!this.game.town?.partitions?.enabled;this.wallTab.textContent=this.wallTab.disabled?'隔断 · 最高级解锁':'隔断';}
    for(const b of this.wallButtons||[])b.classList.toggle('sel',decor?.wallSel===b.dataset.wallTool);
    if (this.decorTip) {
      this.decorTip.classList.toggle('hide', !!decor?.focus);
      const wallTips = { wall:'按住拖出整面墙 · 松手放下 · 旋转换方向', door:'拖到格线上松手放门 · 保留通道', move:'按住直墙或门洞拖到新位置 · 松手确认', erase:'点选墙段或门洞拆除，可撤销' };
      const pending = LOCAL_PLAY ? 0 : decor?.pendingCost || 0;
      const bill = pending ? ` · 待结算家具 ${fmt(pending)} 噗灵（完成装修时统一扣除）` : '';
      this.decorTip.textContent = this.decorTab==='walls' ? `免费搭建 · ${(S.wallsIn||[]).length}/240 段 · ${decor?.wallStatus || wallTips[decor?.wallSel] || '选择实墙或门洞 · 双格门洞供人物通行'}` : decor?.pickupMode ? '点选已摆好的家具，可移动、旋转、收起或卖掉' + bill : decor?.continuous ? '连续放置已开启 · 关闭后每次只放一件' + bill : '每次只放一件 · 放好后请重新选择物品' + bill;
      if (this.decorTab === 'furn' && decor?.cfg.freeBuild) {
        const guide = BUILD_SLOPED_ROOF_IDS.includes(decor.sel)
          ? '单坡接长边 · 外角向外拐 / 内角向内收 · 旋转对齐坡面'
          : ['home', 'kitchen', 'bathroom'].includes(this.decorCategory) ? '室内家具需墙、门窗围合，以楼板或屋顶封顶；楼梯井可连通封闭的上层'
          : `悬挑最多 5 格 · 布局最大支撑距离 ${decor.supportDistance || 0} 格 · 绿稳固 / 黄临界 / 红不可放`;
        this.decorTip.textContent = (decor.placementError || (decor.snapJoined ? '已对齐相邻构件 · ' : '') + guide) + bill;
      }
      if (decor?.cameraMode !== 'place') {
        this.decorTip.classList.remove('hide');
        this.decorTip.textContent = (decor.cameraMode === 'pan' ? '拖动画面平移' : '拖动画面旋转') + ' · 双指 / 滚轮缩放 · 完成视角后继续摆放';
      }
    }
    if (this.decorRepeat) {
      this.decorRepeat.textContent = decor?.continuous ? '连续放置：开' : '连续放置：关';
      this.decorRepeat.setAttribute('aria-pressed', String(!!decor?.continuous));
      this.decorPickup.setAttribute('aria-pressed', String(!!decor?.pickupMode));
    }
    const sel = this.game.town ? this.game.town.decor.sel : null;
    for (const el of this.decorSlots) {
      const n = S.decor[el._id] || 0;
      el._cnt.textContent = LOCAL_PLAY ? '∞' : n;
      el._cnt.classList.toggle('hide', !LOCAL_PLAY && !n);
      el.classList.toggle('sel', el._id === sel);
      el.style.opacity = LOCAL_PLAY || n || S.coins - (decor?.pendingCost || 0) >= DECO[el._id].price ? 1 : 0.5;
      if (LOCAL_PLAY) el.querySelector('.price').textContent = '免费';
      const def = DECO[el._id], indoor = !!decor?.cfg.indoor, both = def.indoor === 'both';
      const category = isYardStructure(el._id) ? def.category : def.category || (def.indoor === true ? 'home' : 'garden');
      const invalidZone = decor?.cfg.freeBuild ? ['plot', 'bigplot', 'pond'].includes(el._id) : isYardStructure(el._id) || (!both && !!def.indoor !== indoor);
      el.classList.toggle('hide', invalidZone || (!LOCAL_PLAY && !!def.only && !n) || (this.decorCategory !== 'all' && category !== this.decorCategory));
    }
    const fs = this.game.town ? this.game.town.decor.floorSel : null;
    for (const el of this.floorSlots) { el.classList.toggle('sel', el._id === fs); const f = FLOORS.find((x) => x.id === el._id); el.classList.toggle('lockd', !LOCAL_PLAY && f.mile !== undefined && !S.live.miles.includes(f.mile)); if (LOCAL_PLAY) el.querySelector('.price').textContent = '免费'; }
  }
  setDecorMode(on) {
    if (on) for (const el of this.decorSlots) { const img = el.querySelector('img'); if (!img.src) img.src = decorIcon(el._id); }
    if (on) {
      // 屋里只列室内家具，后院只列庭院装饰
      const indoor = !!this.game.town.decor.cfg.indoor;
      this.decorIndoor = indoor;
      this.decorCategory = 'all';
      for (const el of this.decorSlots) {
        const both = DECO[el._id].indoor === 'both';
        el.classList.toggle('hide', (!both && !!DECO[el._id].indoor !== indoor) || (!LOCAL_PLAY && !!DECO[el._id].only && !(S.decor[el._id] > 0)));
      }
      this.decortop.querySelector('h4').textContent = this.game.town.decor.cfg.freeBuild ? '搭建海风工坊岛' : indoor ? '布置小屋' : '布置后院';
      this.decortop.querySelector('.dup').classList.toggle('hide', !!this.game.town.decor.cfg.freeBuild);
      this.setDecorTab('furn');
    }
    this.decorbar.classList.toggle('on', on);
    this.decortop.classList.toggle('on', on);
    this.showHUD(!on);
    this.refreshDecor();
    this.refreshBeauty();
  }

  // ——— 浮字 / 提示 / 飞金币 ———
  float({ x, y, z, sx, sy, text, cls = '', icon }) {
    let px = sx, py = sy;
    if (px === undefined) {
      const p = app.project({ x, y, z });
      px = p.x; py = p.y;
    }
    const el = h('div', { class: 'float ' + cls, style: { left: px + 'px', top: py + 'px' } }, icon && h('img', { src: icon }), text);
    this.floats.append(el);
    setTimeout(() => el.remove(), 1350);
  }
  toast(text, o = {}) {
    const remove = (el) => {
      clearTimeout(el._toastLifeTimer); clearTimeout(el._toastRemoveTimer);
      el.remove();
    };
    const expire = (el) => {
      clearTimeout(el._toastLifeTimer); clearTimeout(el._toastRemoveTimer);
      el.classList.remove('out');
      el._toastLifeTimer = setTimeout(() => {
        el.classList.add('out');
        el._toastRemoveTimer = setTimeout(() => remove(el), 400);
      }, o.life || 2400);
    };
    // Only opt-in notices are coalesced; rewards and unrelated warnings keep their own entries.
    if (o.dedupeKey) {
      const existing = [...this.toasts.children].find((el) => el._toastDedupeKey === o.dedupeKey && el._toastText === text);
      if (existing) { expire(existing); return existing; }
    }
    const el = h('div', { class: 'toast ' + (o.kind || ''), role: 'status' }, o.icon && h('img', { src: o.icon }), text);
    el._toastDedupeKey = o.dedupeKey; el._toastText = text;
    if (o.action && typeof o.onAction === 'function') {
      el.classList.add('toast-actionable');
      el.append(h('button', { class: 'toast-action', type: 'button', onclick: click(() => { remove(el); o.onAction(); }) }, o.action));
    }
    this.toasts.append(el);
    while (this.toasts.children.length > 3) remove(this.toasts.firstChild);
    expire(el);
    return el;
  }
  // 从屏幕某点飞一串金币到金币栏
  flyCoins(x, y, n = 6) {
    const r = this.coinPill.getBoundingClientRect();
    const tx = r.left + r.height / 2, ty = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const el = h('img', { class: 'flycoin', src: coinIco() });
      document.body.append(el);
      const ox = x + (Math.random() - 0.5) * 90, oy = y + (Math.random() - 0.5) * 60;
      el.animate([
        { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 0 },
        { transform: `translate(${ox}px, ${oy - 40}px) scale(1.1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 1 },
      ], { duration: 650 + i * 70, delay: i * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => { el.remove(); if (i % 2 === 0) audio.sfx('coin'); };
    }
  }

  // ——— 弹窗 ———
  // 游戏内的确认弹窗（原生 confirm 在内嵌浏览器里会被屏蔽）
  confirm(title, text, okLabel = '确定') {
    return new Promise((resolve) => {
      let ok = false, m;
      m = this.modal(h('div', { class: 'tut' },
        h('h2', {}, title),
        h('p', { style: { margin: '0 0 1.4rem', lineHeight: 1.8 } }, text),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn alt', onclick: click(() => m.close(true)) }, '再想想'),
          h('button', { class: 'btn', onclick: click(() => { ok = true; m.close(true); }) }, okLabel))), { ribbon: '请确认', onClose: () => resolve(ok) });
    });
  }

  modal(content, o = {}) {
    if (!o.tutorial) this.tutorials?.beforeModal();
    const veil = h('div', { class: 'veil' + (o.clear ? ' clear' : '') });
    let panel;
    const close = (silent) => {
      if (veil._closed) return;
      if (o.beforeClose?.() === false) return;
      veil._closed = true;
      veil.classList.add('out');
      this.modals--;
      this.tutorials?.panelClosed(panel);
      if (!silent) audio.sfx('tab');
      setTimeout(() => veil.remove(), 250);
      window.removeEventListener('keydown', esc);
      this.game.onModal(this.modals > 0);
      o.onClose && o.onClose();
    };
    const esc = (e) => { if (e.code === 'Escape' && !o.sticky && ![...this.root.querySelectorAll(':scope > .veil')].filter(v=>!v._closed).some(v=>v!==veil && (veil.compareDocumentPosition(v)&Node.DOCUMENT_POSITION_FOLLOWING))) { e.stopImmediatePropagation(); close(); } };
    content.classList.add('modal-body');
    const box = h('div', { class: 'modal card ' + (o.cls || '') },
      o.ribbon && h('div', { class: 'ribbon' }, o.ribbon),
      !o.sticky && h('button', { class: 'x', onclick: () => close(), 'aria-label': '关闭' }, svg('close')),
      content);
    veil.append(box);
    if (!o.sticky) veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
    window.addEventListener('keydown', esc);
    this.root.append(veil);
    this.modals++;
    this.game.onModal(true);
    audio.sfx('pop');
    panel = { close, box, veil, content };
    if (!o.tutorial && !o.skipTutorial) this.tutorials?.attachPanel(panel, content);
    return panel;
  }

  shopPanel(id) {
    if (id === 'bakery' && !live.project().done) { this.toast('面包房还在建设中，先完成工地出资'); return; }
    const g = this.game, sh = SHOPS[id], st = S.shops[id];
    let m;
    // 两种营业模式：关卡（选一关）和无尽
    let pick = Math.min(MAX_STAGE, (st.stage || 0) + 1);
    const modes = () => {
      const cleared = st.stage || 0, stars = (st.stars || {})[pick] || 0;
      const box = h('div', { class: 'modes' });
      const step = (d) => click(() => { pick = Math.max(1, Math.min(Math.min(MAX_STAGE, cleared + 1), pick + d)); box.replaceWith(modes()); }, 'tab');
      box.append(
        h('div', { class: 'mode lvmode' },
          h('h4', {}, '关卡模式', h('em', {}, `已过 ${cleared} / ${MAX_STAGE} 关`)),
          h('div', { class: 'stagepick' },
            h('button', { class: 'stp', disabled: pick <= 1, onclick: step(-1), 'aria-label': '上一关' }, '‹'),
            h('div', {}, h('b', {}, `第 ${pick} 关`), h('span', { class: 'ministars' }, [0, 1, 2].map((i) => svg('star', i < stars ? '' : 'off')))),
            h('button', { class: 'stp', disabled: pick >= Math.min(MAX_STAGE, cleared + 1), onclick: step(1), 'aria-label': '下一关' }, '›')),
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

  homePanel() {
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
        h('button', { class: 'bigcard', 'data-build-island-entry': '', onclick: click(() => { m.close(true); bus.emit('buildIslandPanel'); }) },
          h('b', {}, '海风工坊岛'), h('p', {}, S.buildQuest?.stage === 3 ? '从后院西岸坐船出发 · 独立空地自由搭建' : '码头来信：海风里的空白蓝图 · 完成剧情解锁')),
        h('button', { class: 'bigcard milestone-entry' + (live.milestones(beauty()).some((m) => m.reached && !m.claimed) ? ' has' : ''), onclick: click(() => { m.close(true); milestonePanel(); }) },
          h('em', { class: 'dot' }), h('b', {}, '阶段奖励'), h('p', {}, '提升美化度，领取噗灵并解锁居民来访')))), { ribbon: '暖暖的家', cls: 'live-modal' });
  }

  refreshFpsVisibility() {
    //FPS计数器状态刷新（是否显示）
    if (this.fpsEl) this.fpsEl.style.display = S.settings.showFps ? '' : 'none';
  }

  settingsPanel() {
    const g = this.game;
    const seg = h('div', { class: 'seg' });
    const renderSeg = () => seg.replaceChildren(...[['high', '精致'], ['mid', '均衡'], ['low', '省电']].map(([k, n]) =>
      h('button', { class: app.quality === k ? 'on' : '', 'data-quality': k, onclick: click(() => { S.settings.quality = k; S.settings.qualityExplicit = true; save(); app.applyQuality(); renderSeg(); }, 'tab') }, n)));
    renderSeg();
    // 桌面浏览器也有 screen.orientation，不能据此显示“跟随手机”。
    // 原生桥和移动设备 UA 保留 fine 指针 Android / iPad 的方向设置。
    const canOrient = isMobileDevice();
    const oseg = h('div', { class: 'seg' });
    const curO = () => S.settings.orient || 'auto';
    let orientPending = false;
    const renderO = () => oseg.replaceChildren(...[['auto', '跟随手机'], ['land', '固定横屏'], ['port', '固定竖屏']].map(([k, n]) =>
      h('button', { class: curO() === k ? 'on' : '', disabled: orientPending, onclick: click(async () => {
        if (orientPending) return;
        const previous = curO();
        orientPending = true; renderO();
        let ok = false;
        try { ok = await applyOrient(k); } catch { /* 原生或浏览器拒绝时保留旧设置 */ }
        orientPending = false;
        if (!ok) {
          // 锁定失败时不把“看起来已选中、实际没生效”的状态写进存档。
          S.settings.orient = previous === 'auto' && !S.settings.orient ? '' : previous;
          save(); renderO();
          this.toast(isNativeApp() ? '方向切换未完成，请重试；原设置已保留。' : '当前浏览器不支持锁定方向，可用手机安装版固定横屏或竖屏。', { kind: 'warn', life: 4200 });
          return;
        }
        S.settings.orient = k; save(); renderO();
      }, 'tab') }, n)));
    renderO();
    let saveInfo;
    const hm = (t) => { const d = new Date(t); return t ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '--:--'; };
    const renderSave = () => { saveInfo.textContent = `每 5 分钟自动存档 · 上次 ${hm(S.savedAt)}`; };
    setTimeout(renderSave);
    const range = (key) => h('input', { type: 'range', min: 0, max: 100, value: S.settings[key] * 100, oninput: (e) => { audio.init(); S.settings[key] = e.target.value / 100; audio.setVolumes(S.settings.music, S.settings.sfx); save(); } });
    let m;
    m = this.modal(h('div', { class: 'settings' },
      h('h2', {}, '设置'),
      tutorialPreferenceControl(),
          ///TRM Debug Setting    Fps Display 
         h('label', {}, '显示 FPS', h('button', {
        class: 'btn alt sm',
        onclick: click((e) => {
          S.settings.showFps = !S.settings.showFps ;
          save();
          this.refreshFpsVisibility();
          e.currentTarget.textContent = S.settings.showFps ? 'On' : 'Off';
        })
      }, S.settings.showFps  ? 'On' : 'Off')),

      h('label', {}, '背景音乐', range('music')),
      h('label', {}, '音效', range('sfx')),
      h('label', {}, '画面', seg),
      h('p', { class: 'fine', style: { marginTop: '0.5rem' } }, '精致：开启光影后期；均衡：关闭后期特效（手机默认）；省电：降低分辨率。主动选择精致会保留到下次启动，但会增加性能开销。帧率、清晰度和抗锯齿可在画面与性能里单独调整。模型细节与阴影精度在下次打开游戏时生效。'),
      canOrient && h('label', {}, '屏幕方向', oseg),
      h('div', { class: 'settings-links' },
        h('button', { class: 'btn sm account-entry', onclick: click(() => { m.close(true); this.accountPanel(); }) }, accountSummary()),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'help', onclick: click(() => { m.close(true); this.helpPanel(); }) }, '玩法帮助 · 全部教程'),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'controls', onclick: click(() => { m.close(true); controlsPanel(this); }) }, '操作与显示'),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'performance', onclick: click(() => { m.close(true); performancePanel(this); }) }, '画面与性能'),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'clean-screenshot', onclick: click(() => { m.close(true); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('nuannuan:clean-screenshot'))); }) }, '清屏截图'),
        (window.NikkiNative?.checkAndroidUpdate || window.NikkiDesktop?.updates) && h('button', { class: 'btn alt sm', 'data-settings-open': 'check-update', onclick: click(() => { m.close(true); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('nuannuan:check-update'))); }) }, '检查更新'),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'calendar', onclick: click(() => { m.close(true); calendarPanel(this); }) }, '日历与时间'),
        h('button', { class: 'btn alt sm', 'data-settings-open': 'transfer', onclick: click(() => { m.close(true); saveTransferPanel(this); }) }, '存档导出 / 导入')),
      h('p', { class: 'fine' }, '登录后可连接云存档，在账号页查看同步状态。不登录仍可离线游玩，导出 / 导入存档继续保留。'),
      h('label', {}, '存档', h('div', { class: 'saverow' },
        (saveInfo = h('span', {}, '')),
        h('button', { class: 'btn alt sm', onclick: click(() => { autosave(); renderSave(); this.toast('已存档'); }) }, '立即存档'),
        h('button', { class: 'btn alt sm', onclick: click(async () => {
          const b = backupInfo();
          if (!b) return this.toast('还没有备份', { kind: 'warn' });
          if (await this.confirm('读取备份', `回到 ${hm(b.at)} 的那份存档（当时有 ${fmt(b.coins)} 噗灵）。之后的进度会丢失。`, '读取备份')) {
            if (restoreBackup()) location.reload();
            else this.toast('备份无法读取，当前进度已保留', { kind: 'warn' });
          }
        }) }, '读取备份'))),
      S.cheat && h('label', {}, '秘密', h('button', { class: 'btn alt sm', onclick: click(() => { m.close(true); this.cheatPanel(); }) }, '打开作弊面板')),
      h('div', { class: 'row', style: { marginTop: '1.5rem' } },
        h('button', { class: 'btn alt sm', onclick: click(() => { m.close(true); g.toTitle(); }) }, '回到标题'),
        h('button', { class: 'btn alt sm', onclick: click(async () => { if (await this.confirm('清空存档', '所有金币、服饰、家园和进度都会被清空，无法恢复。', '清空并重开')) { m.close(true); g.resetAll(); } }) }, '清空存档')),
      h('p', { class: 'fine' }, '《暖暖的方块小镇》是玩家自制的非官方同人作品，与叠纸游戏无关。暖暖、大喵等角色形象的著作权归叠纸游戏所有。游戏内所有 3D 模型、界面与音乐均为程序生成的原创内容，仅供学习与交流。')), { ribbon: 'SETTINGS' });
  }

  refreshAccountUi() {
    if (this.accountStatus) this.accountStatus.textContent = accountSummary();
    if (this.accountEntry) this.accountEntry.textContent = accountSummary();
  }

  refreshGiantCarry() {
    if (!this.giantCarryBtn) return;
    this.giantCarryBtn.classList.toggle('hide', !this.game?.town?.farm?.carry);
  }

  canShowMailNotice() {
    return !!S.started && !this.title && !this.game?.busy && this.modals === 0
      && !document.hidden && !document.body.classList.contains('clean-screenshot');
  }

  mailNotice(summary) {
    const owner = account.profile?.id;
    if (!owner || !this.canShowMailNotice()) return false;
    this._mailNotice?.remove();
    this._mailNotice = this.toast(Number(summary?.unclaimed) > 0 ? '收到新邮件，有礼包等待领取' : '收到新邮件', {
      kind: 'mail-notice', life: 6500, action: '查看邮件',
      onAction: () => { if (account.profile?.id === owner && this.canShowMailNotice()) this.mailPanel(); },
    });
    return true;
  }

  async refreshMailBadge(summary) {
    if (!this.mailBtn) return;
    const label = this.mailBtn.querySelectorAll('span')[1];
    const owner = account.profile?.id;
    if (!owner) summary = {};
    else if (summary === undefined) {
      try { summary = await account.mailSummary(); }
      catch { return; /* 暂时断网保留上次提醒，不把未知状态当作零封邮件。 */ }
      if (account.profile?.id !== owner) return;
    }
    const pending = Math.max(0, Number(summary?.pending) || 0);
    const unclaimed = Math.max(0, Number(summary?.unclaimed) || 0);
    if (!pending) { this._mailNotice?.remove(); this._mailNotice = null; }
    if (label) label.textContent = pending ? `邮件 · ${pending}` : '邮件';
    this.mailBtn.classList.toggle('has-mail', pending > 0);
    this.mailBtn.classList.toggle('has', pending > 0);
    this.mailBtn.setAttribute('aria-label', pending ? `邮件，${pending} 封待处理，${unclaimed} 份礼包待领取` : '邮件');
    this._mailPanelSummary?.(summary || {});
  }

  accountSessionPanel(kind) {
    if (this._accountAccessModal && !this._accountAccessModal.veil._closed) return this._accountAccessModal;
    let modal, verifying = false;
    const status = h('p', { class: 'fine', 'aria-live': 'polite' }, '正在确认登录状态…');
    const retry = h('button', { class: 'btn', hidden: true, onclick: click(() => verify()) }, '重新连接');
    const verify = async () => {
      if (verifying || modal.veil._closed) return;
      verifying = true;
      retry.disabled = true;
      status.textContent = '正在确认登录状态…';
      try {
        const user = await account.ensureSession();
        if (modal.veil._closed) return;
        modal.close(true);
        this._accountAccessModal = kind === 'mail' && user ? this.showMailPanel() : this.showAccountPanel();
      } catch (error) {
        if (modal.veil._closed) return;
        status.textContent = `暂时无法连接账号服务，已有账号和本机进度会保留。${error.message || '请检查网络后重试。'}`;
        retry.hidden = false;
      } finally { verifying = false; retry.disabled = false; }
    };
    modal = this.modal(h('div', { class: 'account-session' }, h('h2', {}, kind === 'mail' ? '邮件中心' : '账号与云存档'), status, retry), { ribbon: kind === 'mail' ? 'MAIL' : 'ACCOUNT' });
    this._accountAccessModal = modal;
    verify();
    return modal;
  }

  mailPanel() { return this.accountSessionPanel('mail'); }

  showMailPanel() {
    if (this._mailPanel && !this._mailPanel.veil._closed) return this._mailPanel;
    const owner = account.profile?.id;
    if (!owner) return this.accountPanel();
    let modal, busy = false, messages = [], nextCursor = null, summary = {};
    const list = h('div', { class: 'mail-list' }, h('div', { class: 'mail-loading' }, '正在收取邮件…'));
    const counts = h('p', { class: 'mail-counts', 'aria-live': 'polite' }, '正在确认邮件状态…');
    const status = h('p', { class: 'mail-status', role: 'status', 'aria-live': 'polite' });
    const active = () => !!modal && !modal.veil._closed && account.profile?.id === owner;
    const attachmentText = item => (item.ops || []).map(op => op.type === 'coins' ? `噗灵 +${fmt(op.amount)}` : op.type === 'owned' ? `解锁 ${op.ids.length} 件物品` : `${op.type} ${Object.values(op.items || {}).reduce((a, b) => a + b, 0)} 份`).join('、');
    const refresh = h('button', { class: 'btn alt sm', type: 'button', 'data-mail-action': 'refresh', onclick: click(() => load(false)) }, '刷新');
    const claimAll = h('button', { class: 'btn sm', type: 'button', 'data-mail-action': 'claim-all', onclick: click(() => mutate('all')) }, '一键领取');
    const more = h('button', { class: 'btn alt sm', type: 'button', hidden: true, 'data-mail-action': 'more', onclick: click(() => load(true)) }, '加载更多');
    const setStatus = (text, warning = false) => { status.textContent = text; status.setAttribute('role', warning ? 'alert' : 'status'); };
    const updateButtons = () => {
      if (!modal) return;
      modal.box.querySelectorAll('.mailbox button').forEach(button => { button.disabled = busy; });
      claimAll.disabled = busy || !(Number(summary.unclaimed) > 0);
      more.hidden = !nextCursor;
      list.setAttribute('aria-busy', String(busy));
    };
    const applySummary = value => {
      if (!active()) return;
      summary = value;
      counts.textContent = `未读 ${Number(value.unread) || 0} 封 · 待领取 ${Number(value.unclaimed) || 0} 份 · 共 ${Number(value.total) || 0} 封`;
      updateButtons();
    };
    const render = () => {
      const cards = messages.length ? messages.map((item) => {
        return h('article', { class: `mail-item${item.readAt ? '' : ' unread'}`, 'data-mail-id': item.id },
          h('div', { class: 'mail-meta' }, h('b', {}, item.kind === 'gift' ? '礼包邮件' : '公告'), h('small', {}, new Date(item.createdAt).toLocaleString('zh-CN'))),
          h('h3', {}, item.title),
          h('div', { class: 'mail-tags' }, h('span', { class: `mail-tag ${item.readAt ? 'is-read' : 'is-unread'}` }, item.readAt ? '已读' : '未读'),
            item.kind === 'gift' && h('span', { class: `mail-tag ${item.claimedAt ? 'is-claimed' : 'is-pending'}` }, item.claimedAt ? '已领取' : '待领取')),
          h('p', {}, item.body),
          item.kind === 'gift' && h('div', { class: 'mail-attachment' }, `附件：${attachmentText(item)}`),
          h('div', { class: 'mail-actions' },
            !item.readAt && h('button', { class: 'btn alt sm', type: 'button', 'data-mail-action': 'read', onclick: click(() => mutate('read', item)) }, '标为已读'),
            item.kind === 'gift' && !item.claimedAt && h('button', { class: 'btn sm', type: 'button', 'data-mail-action': 'claim', onclick: click(() => mutate('claim', item)) }, '领取礼包'),
            item.claimedAt && h('span', { class: 'mail-claimed' }, '已领取')));
      }) : [h('div', { class: 'mail-empty' }, '暂时没有新邮件')];
      list.replaceChildren(...cards);
      updateButtons();
    };
    const fetchPage = async append => {
      const result = await account.mailList({ limit: 20, ...(append && nextCursor ? { cursor: nextCursor } : {}) });
      if (!active()) return;
      const incoming = result.messages || [];
      messages = append ? [...new Map([...messages, ...incoming].map(item => [item.id, item])).values()] : incoming;
      nextCursor = result.nextCursor || null;
      this.refreshMailBadge(result);
      render();
    };
    const load = async append => {
      if (!active() || busy || (append && !nextCursor)) return;
      busy = true; updateButtons(); setStatus(append ? '正在加载更多…' : '正在刷新邮件…');
      try { await fetchPage(append); if (active()) setStatus(`已显示 ${messages.length} 封${nextCursor ? '，下方可继续加载' : ''}`); }
      catch (error) {
        if (!active()) return;
        setStatus(`${error.message || '邮件暂时无法加载'}，请稍后点击刷新。`, true);
        if (!messages.length) list.replaceChildren(h('div', { class: 'mail-empty' }, '暂时无法收取邮件，本机进度已保留。'));
      } finally { if (active()) { busy = false; updateButtons(); } }
    };
    const mutate = async (action, item) => {
      if (!active() || busy) return;
      busy = true; updateButtons(); setStatus(action === 'read' ? '正在标记已读…' : '正在领取，请稍候…');
      try {
        const result = action === 'all' ? await account.mailClaimAll() : action === 'read' ? await account.mailRead(item.id) : await account.mailClaim(item.id);
        if (!active()) return;
        const success = action === 'read' ? '已标为已读，未领取的礼包会继续提醒。' : action === 'all' ? `已领取 ${Number(result.count) || 0} 份礼包并同步到云存档。` : '礼包已领取并同步到云存档。';
        if (action === 'all') {
          const claimed = new Set(result.messageIds || []);
          for (const row of messages) if (claimed.has(row.id)) row.readAt = row.claimedAt = result.claimedAt || Date.now();
        } else {
          item.readAt = result.readAt || result.claim?.claimedAt || Date.now();
          if (action === 'claim') item.claimedAt = result.claim?.claimedAt || Date.now();
        }
        render();
        try {
          if (action === 'all') await fetchPage(false);
          // 已读和领奖均从服务端重新确认摘要；已读礼包仍应保留待领取红点。
          else { const value = await account.mailSummary(); if (active()) this.refreshMailBadge(value); }
        } catch {
          if (active()) setStatus(`${success} 邮件状态暂时未能刷新，稍后点击刷新即可。`, true);
          return; // 领取已成功，摘要网络失败不能被表述为领取失败。
        }
        if (!active()) return;
        setStatus(success);
      } catch (error) {
        if (!active()) return;
        // 一键领取可能已有部分成功；重新获取服务端结果，绝不把整批假定为未领取。
        let refreshed = false;
        try { await fetchPage(false); refreshed = true; } catch { /* 保留已显示列表，允许之后手动刷新。 */ }
        const partial = Number(error.claimedCount) > 0 ? `已确认领取 ${Number(error.claimedCount)} 份礼包，已领取内容不会重复发放。` : '';
        if (active()) setStatus(`${partial}${error.message || '操作暂时未完成'}。${refreshed ? `已刷新邮件状态，可重试${action === 'read' ? '标记已读' : '剩余礼包'}。` : '邮件状态暂时未能刷新，请稍后点击刷新确认。'}`, true);
      } finally { if (active()) { busy = false; updateButtons(); } }
    };
    const onAccount = () => { if (account.profile?.id !== owner) modal.close(true); };
    modal = this.modal(h('div', { class: 'mailbox' }, h('h2', {}, '邮件中心'),
      h('p', { class: 'fine' }, '礼包领取后写入云存档，不能重复领取。看过的礼包在领取前仍会提醒。'), counts,
      h('div', { class: 'mail-toolbar' }, refresh, claimAll), status, list,
      h('div', { class: 'mail-more' }, more)), {
      ribbon: 'MAIL', cls: 'mail-modal',
      onClose: () => {
        globalThis.removeEventListener?.('nuannuan:account', onAccount);
        if (this._mailPanel === modal) { this._mailPanel = null; this._mailPanelSummary = null; }
      }
    });
    this._mailPanel = modal;
    this._mailPanelSummary = applySummary;
    globalThis.addEventListener?.('nuannuan:account', onAccount);
    load(false);
    return modal;
  }

  accountSummary(data) {
    if (!data) return '暂无';
    const d = data.data || data;
    const pieces = d.buildPlaced || [], levels = pieces.reduce((max, e) => Math.max(max, isBuildRoof(e.id) ? Math.min(MAX_BUILD_FLOOR + 1, e.level || 0) : Math.min(MAX_BUILD_FLOOR + 1, (e.level || 0) + 1)), 0);
    const island = d.buildQuest?.stage === 3 && d.buildQuest?.rewarded ? '已开放' : ['未接邀请', '准备便当', '等待首航'][d.buildQuest?.stage || 0] || '未开放';
    const plans = (d.decorLayouts?.build || []).filter(Boolean).length;
    return `噗灵 ${fmt(d.coins || 0)} · 第 ${d.gday || 0} 天 · 房屋 Lv.${d.house || 1} · 海风岛${island} · ${pieces.length} 件摆放 / 最高 ${levels} 楼 / ${plans} 套方案`;
  }

  accountConflictPanel(result) {
    if (this._accountConflict && !this._accountConflict.modal.veil._closed) {
      this._accountConflict.update(result);
      return this._accountConflict.modal;
    }
    let m;
    const entry = { busy: false, resolved: false, modal: null };
    const localSummary = h('span');
    const cloudSummary = h('span');
    const status = h('p', { class: 'fine', 'aria-live': 'polite' });
    entry.update = (next) => {
      entry.result = next;
      localSummary.textContent = this.accountSummary(next.local);
      cloudSummary.textContent = this.accountSummary(next.cloud);
      status.textContent = '同步已暂停，请选择要保留的进度，也可以稍后再处理。';
    };
    entry.update(result);
    const setBusy = (busy) => {
      entry.busy = busy;
      m?.box.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
    };
    const closeAnd = async (choice) => {
      if (entry.busy || m.veil._closed) return;
      setBusy(true);
      status.textContent = '正在同步，请稍候…';
      try {
        const r = await account.resolveSync(choice);
        if (r.kind === 'conflict') { entry.update(r); return r; }
        if (r.kind !== choice) {
          status.textContent = '这次同步尚未完成，进度已保留，请稍后重试。';
          this.handleSyncResult(r);
          return r;
        }
        entry.resolved = true;
        setBusy(false);
        m.close(true);
        if (r.kind === 'cloud') {
          this.toast('已使用云端进度，正在重新载入');
          setTimeout(() => location.reload(), 220);
        } else if (r.kind === 'local') this.toast('已将本机进度上传到云端');
        return r;
      } catch (error) {
        if (error.status === 409 && error.body?.conflict) entry.update({ kind: 'conflict', cloud: error.body.conflict, local: entry.result.local });
        else status.textContent = error.message || '同步失败，进度已保留，请稍后重试。';
        this.toast(error.message || '同步失败，请稍后重试', { kind: 'warn', life: 4200 });
      } finally { setBusy(false); }
    };
    m = this.modal(h('div', { class: 'account conflict' },
      h('h2', {}, '发现两份进度'),
      h('p', {}, '本机和云端都有存档。为了避免金币、任务或家具被悄悄覆盖，请选择要保留的版本。'),
      h('div', { class: 'account-compare' },
        h('div', {}, h('b', {}, '本机进度'), localSummary),
        h('div', {}, h('b', {}, '云端进度'), cloudSummary)),
      status,
      h('div', { class: 'row account-actions' },
        h('button', { class: 'btn alt', onclick: click(() => closeAnd('local')) }, '保留本机并上传'),
        h('button', { class: 'btn', onclick: click(() => closeAnd('cloud')) }, '使用云端进度')),
      h('button', { class: 'btn alt sm', onclick: click(() => m.close(true)) }, '稍后处理'),
      h('p', { class: 'fine' }, '选择云端时，本机版本会在此设备保留一份“登录前备份”；选择本机时，云端会生成新版本。稍后处理会暂停同步，不会退出账号。')), {
        ribbon: '云存档冲突', beforeClose: () => !entry.busy,
        onClose: () => {
          if (this._accountConflict === entry) this._accountConflict = null;
          if (!entry.resolved) Promise.resolve(account.resolveSync('cancel')).catch((error) => this.toast(error.message || '暂停同步失败，请稍后重试', { kind: 'warn' }));
        },
      });
    entry.modal = m;
    this._accountConflict = entry;
    return m;
  }

  handleSyncResult(result) {
    if (!result) return;
    if (result.kind === 'conflict') return this.accountConflictPanel(result);
    if (result.kind === 'sync-error') {
      this.refreshAccountUi();
      this.toast(`账号已登录，云存档暂未同步：${result.error?.message || result.message || '请检查网络后在账号面板重试。'}`, { kind: 'warn', life: 5000 });
      return;
    }
    if (result.kind === 'premium-required') {
      this.refreshAccountUi();
      if (result.interactive) this.toast('云同步当前未开放，本机进度已保留，可在设置中导出 / 导入', { life: 4200 });
      return;
    }
    if (result.kind === 'downloaded-cloud') {
      if (S.started) return setTimeout(() => location.reload(), 180);
      this.refreshTitle();
      this.toast('已加载云端进度');
    } else if (result.kind === 'uploaded-local') this.toast('本机进度已上传到云端');
  }

  accountPanel() { return LOCAL_PLAY ? this.localPlayPanel() : this.accountSessionPanel('account'); }

  localPlayPanel() {
    if (!LOCAL_PLAY || this.game.busy) return;
    let modal;
    const go = (zone) => { modal.close(true); this.game.localPlayTravel(zone); };
    modal = this.modal(h('div', { class: 'local-play-panel' },
      h('h2', {}, '本地自由试玩'),
      h('p', {}, '建造岛已开放，家具不限量，购买和建造免费。全部服饰、店铺关卡、房屋扩建和拍照工具均已解锁。'),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '.6rem' } },
        h('button', { class: 'btn', 'data-local-travel': 'build', onclick: () => go('build') }, '直达建造岛'),
        h('button', { class: 'btn alt', 'data-local-travel': 'house', onclick: () => go('house') }, '进入小屋'),
        h('button', { class: 'btn alt', 'data-local-travel': 'home', onclick: () => go('home') }, '前往后院'),
        h('button', { class: 'btn alt', 'data-local-travel': 'town', onclick: () => go('town') }, '返回小镇')),
      h('p', { class: 'fine' }, '试玩自动保存到本机独立存档。建筑保留五格承重、拆除保护及室内外摆放规则。'),
      h('button', { class: 'btn alt sm', onclick: () => { modal.close(true); this.cheatPanel(); } }, '作物催熟 / 切换昼夜')),
      { ribbon: '自由试玩' });
    return modal;
  }

  showAccountPanel() {
    let m;
    if (account.profile) {
      const status = h('p', { class: 'fine account-service-status', 'aria-live': 'polite' }, '正在获取云同步状态…');
      const refresh = async () => {
        refreshBtn.disabled = true;
        try {
          const access = await account.refreshEntitlements();
          status.textContent = (access.freeEntitlements ? '当前限免开放，所有账号统一使用，无需付费。' : '')
            + (access.cloudSync ? '云存档已启用。' : '云同步当前未开放，本机进度已保留。')
            + (access.autoUpdate ? '客户端更新服务已启用。' : '可通过官网手动下载更新。');
        } catch (error) {
          status.textContent = '暂时无法刷新服务状态，本机进度已保留。' + (error.message || '请稍后重试。');
        } finally { refreshBtn.disabled = false; }
      };
      const refreshBtn = h('button', { class: 'btn alt sm', onclick: click(refresh) }, '刷新状态');
      const syncBtn = h('button', { class: 'btn', onclick: click(async () => {
        if (syncBtn.disabled) return;
        syncBtn.disabled = true;
        try { const r = await account.prepareSync(); m.close(true); this.handleSyncResult({ ...r, interactive: true }); }
        catch (error) { this.toast(error.message || '同步失败', { kind: 'warn' }); }
        finally { syncBtn.disabled = false; }
      }) }, '立即同步');
      const body = h('div', { class: 'account' },
        h('h2', {}, '账号与云存档'),
        h('p', {}, `当前账号：${account.profile.username}`),
        status, refreshBtn,
        h('div', { class: 'row account-actions' },
          syncBtn,
          h('button', { class: 'btn alt', onclick: click(() => { m.close(true); saveTransferPanel(this); }) }, '导出 / 导入存档'),
          h('button', { class: 'btn alt', onclick: click(async () => { await account.logout(); m.close(true); this.refreshTitle(); this.toast('已退出账号'); }) }, '退出账号')),
        h('p', { class: 'fine' }, '多台设备登录同一账号即可同步进度。有不同存档时会先让你选择，不会悄悄覆盖。本机导出 / 导入仍可用于手动备份，请使用不重复的密码。'));
      m = this.modal(body, { ribbon: 'ACCOUNT' });
      refresh();
      return m;
    }
    const username = h('input', { class: 'account-input', type: 'text', autocomplete: 'username', placeholder: '用户名（3-32位）', maxlength: '32' });
    const password = h('input', { class: 'account-input', type: 'password', autocomplete: 'current-password', placeholder: '密码（至少8位）', maxlength: '128' });
    const tip = h('p', { class: 'fine account-tip' }, '未登录时进度保存在本机，登录后获取最新的云同步状态。');
    const policy = h('p', { class: 'fine account-policy', 'aria-live': 'polite' }, '正在获取服务状态…');
    account.accessPolicy().then((value) => {
      policy.textContent = value.freeEntitlements ? '当前限免开放：所有账号统一使用云存档和客户端更新，无需付费。' : '账号服务状态以登录后的显示为准。';
    }).catch(() => { policy.textContent = '暂时无法获取服务状态，你仍可继续本机游玩。'; });
    let submitting = false;
    const submit = async (mode) => {
      if (submitting) return;
      const u = username.value.trim(), p = password.value;
      if (!u || !p) { tip.textContent = '请填写用户名和密码。'; return; }
      submitting = true;
      username.disabled = password.disabled = true;
      try {
        const r = mode === 'register' ? await account.register(u, p) : await account.login(u, p);
        m.close(true); this.refreshTitle(); this.handleSyncResult(r);
        if (r.kind !== 'premium-required' && r.kind !== 'conflict' && r.kind !== 'downloaded-cloud' && r.kind !== 'sync-error') this.toast(mode === 'register' ? '账号已创建，云存档已准备好' : '登录成功');
      } catch (error) {
        username.disabled = password.disabled = false;
        tip.textContent = error.message || '操作失败，请稍后重试';
      } finally { submitting = false; }
    };
    m = this.modal(h('div', { class: 'account' },
      h('h2', {}, '账号与云存档'),
      h('p', {}, '登录同一账号，在手机、电脑和网页版继续你的小镇进度。'),
      policy,
      username, password,
      h('div', { class: 'row account-actions' },
        h('button', { class: 'btn', onclick: click(() => submit('login')) }, '登录'),
        h('button', { class: 'btn alt', onclick: click(() => submit('register')) }, '注册账号')),
      tip,
      h('p', { class: 'fine' }, '不登录也能离线游玩，设置中的导出 / 导入存档继续保留。请勿使用与其他网站相同的密码。')), { ribbon: 'ACCOUNT' });
    return m;
  }

  resultPanel(r) {
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

  // ——— 玩法教程 ———
  tutorial(id, force = false, options = {}) { return this.tutorials.request(id, force, options); }
  cancelTutorials(reason) { this.tutorials?.cancelAll(reason); }
  helpPanel() {
    const body = h('div', { class:'tutorial-library', style:{width:'min(560px,76vw)',maxWidth:'100%',maxHeight:'calc(100dvh - 8rem)',overflowY:'auto'} },h('h2',{},'小镇玩法帮助'),tutorialPreferenceControl(),h('p',{class:'fine'},'所有教程都能重看；看完最后一页才记为已读。暂时跳过不会影响使用功能。'));
    let m;
    for(const category of [...new Set(Object.values(TUTORIALS).map(t=>t.category||'小镇生活'))]) {
      body.append(h('h3',{},category));
      const list=h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'.5rem'}});
      for(const [id,t]of Object.entries(TUTORIALS).filter(([,t])=>(t.category||'小镇生活')===category))list.append(h('button',{class:'btn alt sm','data-help-tutorial':id,style:{whiteSpace:'normal',minHeight:'42px',justifyContent:'space-between'},onclick:()=>{m.close(true);this.tutorial(id,true);}},t.title,h('small',{},tutorialRead(id)?'重看':Number(S.tut[id]||0)>0?'有更新':'未读')));
      body.append(list);
    }
    m=this.modal(body,{ribbon:'全部教程',cls:'live-modal'});return m;
  }

  // ——— 回收小铺 ———
  hotCrop() {
    return CROPS[Math.floor(Date.now() / 300000) % CROPS.length].id;
  }
  recyclePanel() {
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
      const left = Math.ceil((300000 - (Date.now() % 300000)) / 1000);
      return h('div', { class: 'recycle' },
        h('h2', {}, '回收小铺'),
        h('div', { class: 'hot' }, h('img', { src: cropIco(hot) }), h('div', {}, h('b', {}, `正在高价收购：${CROP[hot].name}`), h('span', {}, `价格 ×1.5 · ${Math.floor(left / 60)} 分 ${left % 60} 秒后换一种${live.festival()?.id === 'harvest' ? ' · 丰收节额外 +20%' : ''}`))),
        h('h3', {}, '背包里的作物'),
        crops.length ? h('div', { class: 'rlist' }, crops.map(([id, n]) => h('div', { class: 'rrow' + (id === hot ? ' hotrow' : '') },
          h('img', { src: cropIco(id) }), h('b', {}, `${CROP[id].name} ×${n}`), id === hot && h('span', { class: 'tag', style: { '--c': '#f0a53a' } }, '高价'), h('span', { class: 'sp' }),
          h('button', { class: 'btn sm ' + (id === hot ? 'gold' : 'alt'), onclick: (e) => sellOne(id, e) }, '卖出 ', priceTag(price(id) * n)))))
          : h('p', { class: 'empty' }, '还没有作物。去菜地收获一些再来吧。'),
        crops.length ? h('div', { class: 'row rsell' },
          S.crops[hot] > 0 && h('button', { class: 'btn gold', onclick: (e) => sellOne(hot, e) }, `只卖高价的${CROP[hot].name} `, priceTag(price(hot) * S.crops[hot])),
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

  // ——— 标题 ———
  showTitle() {
    const g = this.game;
    const has = hasSave() && S.started;
    const repairedStairs = (S.buildHeightArchive || []).some(a => a.source === 'buildPlaced' && a.blockedStairs > 0);
    this.title = h('div', { class: 'title' },
      h('div', { class: 'eyebrow' }, 'NIKKI · BLOCK TOWN'),
      h('h1', { html: '暖暖的<br><em>方块</em>小镇' }),
      h('div', { class: 'sub' }, '打工', h('i'), '种田', h('i'), '换装', h('i'), '布置家园'),
      h('div', { class: 'acts' },
        has && h('button', { class: 'btn', onclick: click(() => g.begin(false)) }, svg('play'), '继续游戏'),
        h('button', { class: has ? 'btn alt' : 'btn', onclick: click(async () => { if (!has || await this.confirm('重新开始', '开始新游戏会覆盖当前存档，所有进度都会被清空。', '重新开始')) g.begin(true); }) }, has ? '重新开始' : '开始游戏'),
        LOCAL_PLAY && h('button', { class: 'btn', 'data-local-travel': 'build', onclick: click(() => g.localPlayTravel('build')) }, '直达建造岛'),
        h('button', { class: 'btn alt', onclick: click(() => this.accountPanel()) }, LOCAL_PLAY ? '自由试玩' : account.profile ? `账号：${account.profile.username}` : '登录 / 云存档'),
        account.profile && h('button', { class: 'btn alt', onclick: click(() => this.mailPanel()) }, svg('mail'), '邮件')),
      (this.accountStatus = h('p', { class: 'account-status' }, accountSummary())),
      repairedStairs && h('p', { class: 'fine build-migration-note' }, '已收回被楼板或屋顶遮挡的旧楼梯，请留出楼梯口后重新放置。原建筑布局已保留备份。'),
      h('div', { class: 'legal' }, '非官方同人作品 · 暖暖与大喵的角色形象归属叠纸游戏（Papergames）· 游戏本体免费体验'),
      h('div', { class: 'ver' }, 'FAN-MADE · WEBGL'));
    this.root.append(this.title);
  }
  refreshTitle() {
    if (!this.title) return;
    this.title.remove(); this.title = null; this.showTitle();
  }
  hideTitle() {
    if (!this.title) return;
    const t = this.title;
    t.classList.add('out');
    setTimeout(() => t.remove(), 700);
    this.title = null;
  }
}

export const ui = new UI();
export { svg };
