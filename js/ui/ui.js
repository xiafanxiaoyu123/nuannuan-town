// UI 单例与初始化接线。每个公开方法显式转发到具名职责模块，保留原 this、参数和返回值。
import { h, fmt } from '../core/util.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/state.js';
import { stat } from '../core/state.js';
import { coinIco } from '../core/icons.js';
import { TutorialManager } from './tutorials.js';
import { account } from '../core/account.js';
import { startMailMonitor } from '../core/mail-monitor.js';
import { bindLivePanels } from '../live/panels.js';
import * as hud from './hud.js';
import * as decorToolbar from './decor-toolbar.js';
import * as overlays from './overlays.js';
import * as activityPanels from './activity-panels.js';
import { giantCropPanel } from './giant-crop-panel.js';
import * as accountPanels from './account-panels.js';
import * as menus from './menus.js';
export { SVG, svg } from './components/svg.js';
export { priceTag } from './components/price-tag.js';

class UI {
  init(game) {
    bindLivePanels(this);
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
    bus.on('zoneChanged', (z) => { this.tutorials?.cancelView(this.game.town); this.momoBtn.classList.toggle('on', z === 'home'); this.refreshReap(); this.refreshDecor(); });
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
    bus.on('giantCrop', () => this.tutorial('giantCrops', false, { valid: () => !!this.game?.town?.farm?.hasGiant() }));
    bus.on('giantCarryChanged', () => this.refreshGiantCarry());
    bus.on('decorMode', (on) => this.setDecorMode(on));
    bus.on('decorSel', () => this.refreshDecor());
    bus.on('decorFocus', (rec) => this.setDecorFocus(rec));
    bus.on('decorChanged', () => { this.refreshDecor(); this.refreshBeauty(); });
    bus.on('decorHistoryChanged', () => this.refreshDecor());
    // 预览/相机不会提交经济变化；同一动作内的选择、历史或交易事件仍同步完整刷新。
    bus.on('decorPreview', () => this.refreshDecorPreview());
    bus.on('partitionPreview', () => this.refreshDecorPreview());
    bus.on('decorCamera', () => this.refreshDecorCamera());
    this.refreshAll();
  }

  // 游戏 HUD、任务指引、触屏控制显示与种子栏。由 UI 显式转发，this 始终是原来的 ui 单例。
  applyControls() { return hud.applyControls.apply(this, arguments); }
  buildHUD() { return hud.buildHUD.apply(this, arguments); }
  showHUD(on) { return hud.showHUD.apply(this, arguments); }
  refreshDecorAccess() { return hud.refreshDecorAccess.apply(this, arguments); }
  refreshReqs() { return hud.refreshReqs.apply(this, arguments); }
  setCamMode(on) { return hud.setCamMode.apply(this, arguments); }
  showHint() { return hud.showHint.apply(this, arguments); }
  refreshAll() { return hud.refreshAll.apply(this, arguments); }
  refreshReap() { return hud.refreshReap.apply(this, arguments); }
  refreshMomo() { return hud.refreshMomo.apply(this, arguments); }
  refreshAvatar() { return hud.refreshAvatar.apply(this, arguments); }
  setCoins(total, delta) { return hud.setCoins.apply(this, arguments); }
  refreshBeauty() { return hud.refreshBeauty.apply(this, arguments); }
  setQuestOff(off) { return hud.setQuestOff.apply(this, arguments); }
  refreshQuest() { return hud.refreshQuest.apply(this, arguments); }
  updateGuide() { return hud.updateGuide.apply(this, arguments); }
  setClock(t, night) { return hud.setClock.apply(this, arguments); }
  setPrompt(p) { return hud.setPrompt.apply(this, arguments); }
  setBedMode(mode) { return hud.setBedMode.apply(this, arguments); }
  buildSeeds() { return hud.buildSeeds.apply(this, arguments); }
  tapSeed(i, tree) { return hud.tapSeed.apply(this, arguments); }
  refreshSeeds() { return hud.refreshSeeds.apply(this, arguments); }
  refreshGiantCarry() { return hud.refreshGiantCarry.apply(this, arguments); }

  // 装修工具栏与目录显示；装修规则仍由 game.town.decor 提供。
  buildDecorList() { return decorToolbar.buildDecorList.apply(this, arguments); }
  setDecorTab(tab) { return decorToolbar.setDecorTab.apply(this, arguments); }
  toggleDecorCameraPanel() { return decorToolbar.toggleDecorCameraPanel.apply(this, arguments); }
  buildWallReplacePanel() { return decorToolbar.buildWallReplacePanel.apply(this, arguments); }
  setDecorFocus(rec) { return decorToolbar.setDecorFocus.apply(this, arguments); }
  refreshDecor() { return decorToolbar.refreshDecor.apply(this, arguments); }
  refreshDecorPreview() { return decorToolbar.refreshDecorPreview.apply(this, arguments); }
  refreshDecorCamera() { return decorToolbar.refreshDecorCamera.apply(this, arguments); }
  setDecorMode(on) { return decorToolbar.setDecorMode.apply(this, arguments); }

  // 转场、气泡、提示与通用弹窗；保留原来的事件、计时器和关闭顺序。
  async iris(fn) { return overlays.iris.apply(this, arguments); }
  bubble(b) { return overlays.bubble.apply(this, arguments); }
  updateBubbles(dt) { return overlays.updateBubbles.apply(this, arguments); }
  float(options) { return overlays.float.apply(this, arguments); }
  toast(text, o = {}) { return overlays.toast.apply(this, arguments); }
  flyCoins(x, y, n = 6) { return overlays.flyCoins.apply(this, arguments); }
  confirm(title, text, okLabel = '确定') { return overlays.confirm.apply(this, arguments); }
  modal(content, o = {}) { return overlays.modal.apply(this, arguments); }

  // 居民委托、成就、商店、家园、结算和回收面板；不另建玩法状态。
  reqPanel(id) { return activityPanels.reqPanel.apply(this, arguments); }
  refreshAch() { return activityPanels.refreshAch.apply(this, arguments); }
  achPanel() { return activityPanels.achPanel.apply(this, arguments); }
  shopPanel(id) { return activityPanels.shopPanel.apply(this, arguments); }
  homePanel() { return activityPanels.homePanel.apply(this, arguments); }
  giantCropPanel() { return giantCropPanel(this); }
  resultPanel(r) { return activityPanels.resultPanel.apply(this, arguments); }
  hotCrop() { return activityPanels.hotCrop.apply(this, arguments); }
  recyclePanel() { return activityPanels.recyclePanel.apply(this, arguments); }

  // 账号、云冲突与邮件面板；保留原会话归属检查和关闭清理。
  refreshAccountUi() { return accountPanels.refreshAccountUi.apply(this, arguments); }
  canShowMailNotice() { return accountPanels.canShowMailNotice.apply(this, arguments); }
  mailNotice(summary) { return accountPanels.mailNotice.apply(this, arguments); }
  async refreshMailBadge(summary) { return accountPanels.refreshMailBadge.apply(this, arguments); }
  accountSessionPanel(kind) { return accountPanels.accountSessionPanel.apply(this, arguments); }
  mailPanel() { return accountPanels.mailPanel.apply(this, arguments); }
  showMailPanel() { return accountPanels.showMailPanel.apply(this, arguments); }
  accountSummary(data) { return accountPanels.accountSummary.apply(this, arguments); }
  accountConflictPanel(result) { return accountPanels.accountConflictPanel.apply(this, arguments); }
  handleSyncResult(result) { return accountPanels.handleSyncResult.apply(this, arguments); }
  accountPanel() { return accountPanels.accountPanel.apply(this, arguments); }
  localPlayPanel() { return accountPanels.localPlayPanel.apply(this, arguments); }
  showAccountPanel() { return accountPanels.showAccountPanel.apply(this, arguments); }

  // 设置、帮助、教程入口与标题画面。
  cheatPanel(first) { return menus.cheatPanel.apply(this, arguments); }
  settingsPanel() { return menus.settingsPanel.apply(this, arguments); }
  tutorial(id, force = false, options = {}) { return menus.tutorial.apply(this, arguments); }
  cancelTutorials(reason) { return menus.cancelTutorials.apply(this, arguments); }
  helpPanel() { return menus.helpPanel.apply(this, arguments); }
  showTitle() { return menus.showTitle.apply(this, arguments); }
  refreshTitle() { return menus.refreshTitle.apply(this, arguments); }
  hideTitle() { return menus.hideTitle.apply(this, arguments); }

}

export const ui = new UI();
