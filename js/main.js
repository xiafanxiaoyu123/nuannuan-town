// 暖暖的方块小镇 · 入口与流程控制
import { app } from './core/app.js';
import { audio } from './core/audio.js';
import { fx } from './core/fx.js';
import { S, bus, load, save, flushSave, autosave, resetSave, addCoins, spend, stat, checkQuest, checkAch, shopUpgradePrice, cropSellPrice } from './core/state.js';
import { CROP, CLOTH, SHOPS, SHOP_MAX_LV, HOUSES, YARDS } from './data.js';
import { Town } from './world/town.js';
import { Wardrobe } from './ui/wardrobe.js';
import { CafeGame } from './games/cafe.js';
import { FlowerGame } from './games/flower.js';
import { TailorGame } from './games/tailor.js';
import { FishGame } from './games/fish.js';
import { ui } from './ui/ui.js';
import { cropIco, coinIco, clothIcon } from './core/icons.js';
import { fmt, pick, tween, ease } from './core/util.js';
import { applyOrient, isNativeApp } from './core/orient.js';
import { installLive } from './live/install.js';
import { live } from './live/api.js';
import { THREE } from './core/kit.js';
import { installCompanionEvents } from './live/companion-events.js';
import { installCommunity } from './live/community.js';
import { installHomeInteractions } from './live/home-interactions.js';
import { tutorialRead } from './ui/tutorials.js';
import { account } from './core/account.js';
import { installCleanScreenshot } from './ui/clean-screenshot.js';
import { buildIslandPanel } from './ui/build-island-panel.js';
import { advanceBuildQuest } from './world/build-island-rules.js';
import { BUILD_HOME_DOCK, BUILD_DOCK, BUILD_SPAWN } from './world/build-constants.js';
import { LOCAL_PLAY } from './core/local-play-mode.js';
import { saveDiagnostics } from './core/state.js';
import { installDiagnostics } from './devtools/install.js';

const GAMES = { cafe: CafeGame, flower: FlowerGame, tailor: TailorGame, fish: FishGame };
const WISHES = ['愿今天的客人都带着笑容离开', '愿菜地里的草莓又大又甜', '愿衣橱里永远少一件新裙子', '愿大喵今天不偷吃蛋糕', '愿小镇的每个夜晚都有星星', '愿下一位客人给双倍小费'];

const game = {
  town: null,
  wardrobe: null,
  busy: false,
  localPlayTravel(zone) {
    if (!LOCAL_PLAY || this.busy || !['town', 'home', 'house', 'build'].includes(zone)) return false;
    if (this.town.decor.active && this.town.decor.exit() === false) return false;
    this.cancelGuidance();
    audio.init();
    if (ui.title) this.begin(false);
    this.town.setZone(zone);
    this.town.setMode('play');
    ui.showHUD(true);
    save();
    return true;
  },
  cancelGuidance() {
    this._tutorialFlow = (this._tutorialFlow || 0) + 1;
    clearTimeout(this._welcomeTimer);
    clearTimeout(this._hintTimer);
    clearTimeout(ui._hintHideTimer);
    ui.hint?.classList.add('out');
    ui.cancelTutorials('transition');
  },

  onModal(open) {
    if (this.town) this.town.setModal(open);
  },

  // ——— 流程 ———
  begin(fresh) {
    this.cancelGuidance();
    audio.init();
    if (fresh) {
      resetSave();
      for (const d of Object.values(this.town.decors)) d.reload();
      this.town.farm.refreshAll();
      this.town.rebuildHouse();
      this.town.rebuildYard();
      this.town.decors.home.rebuildGrid();
      this.town.refreshOutfit();
    }
    S.started = true;
    save();
    ui.refreshAll();
    ui.hideTitle();
    this.town.setZone('town', -20, -5.1);
    this.town.setMode('play');
    ui.showHUD(true);
    checkQuest();
    const flow = this._tutorialFlow, source=S;
    const guidanceValid=()=>source===S&&flow===this._tutorialFlow&&!this.busy&&app.view===this.town&&this.town.camMode==='play';
    this._hintTimer=setTimeout(()=>{
      if(guidanceValid())ui.showHint();
    },900);
    this._welcomeTimer = setTimeout(() => {
      if (!guidanceValid() || ui.modals) return;
      ui.tutorial('welcome', false, { valid: guidanceValid }).then(()=>{
        if(guidanceValid())ui.showHint();
      });
    }, 700);
  },
  toTitle() {
    this.cancelGuidance();
    ui.showHUD(false);
    this.town.setMode('title');
    ui.showTitle();
  },
  async resetAll() {
    this.cancelGuidance();
    await ui.iris(async () => {
      resetSave();
      location.reload();
    });
  },

  // ——— 店铺 ———
  openShop(id) {
    if (this.busy) return;
    ui.shopPanel(id);
  },
  upgradeShop(id, done) {
    if (id === 'bakery' && !live.project().done) { ui.toast('面包房还在建设中，先完成工地出资'); return; }
    const st = S.shops[id];
    if (st.lv >= SHOP_MAX_LV) return;
    if (!spend(shopUpgradePrice(id))) return;
    st.lv++;
    audio.sfx('buy');
    ui.toast(`${SHOPS[id].name} 升到了 Lv.${st.lv}！`, { icon: coinIco() });
    stat('upgrades');
    done && done();
  },
  async startGame(id, opts) {
    if (id === 'bakery' && !live.project().done) { ui.toast('面包房还在建设中，先完成工地出资'); return; }
    let g0 = null;
    if (this.busy) return;
    this.cancelGuidance();
    this.busy = true;
    this.town.setModal(true);
    ui.showHUD(false);
    this.playOpts = { mode: 'level', ...(opts || {}) };
    // 上班方案：这家店存过预设就先换上（只换已经拥有的），打烊后换回原来那身
    const plan = S.work && S.work[id];
    if (plan) {
      const next = { ...S.outfit };
      for (const k of Object.keys(next)) if (CLOTH[plan[k]] && CLOTH[plan[k]].cat === k && S.owned.includes(plan[k])) next[k] = plan[k];
      if (Object.keys(next).some((k) => next[k] !== S.outfit[k])) {
        S.workPrev = { ...S.outfit };
        S.outfit = next;
        this.town.refreshOutfit();
        save();
        ui.toast(`换上了${SHOPS[id].name}的上班穿搭`, { icon: clothIcon(next.dress) });
      }
    }
    let choice = 'again';
    while (choice === 'again' || choice === 'next') {
      if (choice === 'next') this.playOpts = { mode: 'level', stage: (g0 ? g0.stage : 0) + 1 };
      else if (g0 && !this.playOpts.stage && this.playOpts.mode === 'level') this.playOpts.stage = g0.stage; // 再来一次 = 重打这一关
      let g;
      await ui.iris(async () => {
        g = new GAMES[id](this);
        app.setView(g);
      });
      choice = await g.run();
      g0 = g;
    }
    this.playOpts = null;
    if (S.workPrev) { S.outfit = { ...S.outfit, ...S.workPrev }; S.workPrev = null; this.town.refreshOutfit(); save(); }
    await ui.iris(async () => {
      app.setView(this.town);
      this.town.camSnap = true;
    });
    this.town.setModal(false);
    ui.showHUD(true);
    ui.refreshAll();
    this.busy = false;
    checkQuest();
  },

  // ——— 衣橱 ———
  async openWardrobe(mode) {
    if (this.busy || this.town.decor.active) return;
    this.cancelGuidance();
    this.busy = true;
    this.town.setModal(true);
    ui.showHUD(false);
    await ui.iris(async () => {
      app.setView(this.wardrobe);
      this.wardrobe.open(mode);
    });
    ui.tutorial('wardrobe', false, { valid: () => this.wardrobe.active });
  },
  async closeWardrobe() {
    this.cancelGuidance();
    this.wardrobe.commit();
    await ui.iris(async () => {
      app.setView(this.town);
      this.town.camSnap = true;
    });
    this.town.setModal(false);
    ui.showHUD(true);
    ui.refreshAll();
    this.busy = false;
    checkQuest();
  },

  // ——— 家园 ———
  async buildIslandAction(action, beforeDepart) {
    const t = this.town, source = S, zone = t.zone;
    if (this.busy || t.decor.active) return { ok: false };
    const returning = action === 'return';
    const dock = returning ? BUILD_DOCK : BUILD_HOME_DOCK;
    if (zone !== (returning ? 'build' : 'home') || Math.hypot(t.pos.x - dock.x, t.pos.z - dock.z) > 5) {
      ui.toast(returning ? '先走到海风岛岸边的小船旁' : '先到后院西边的小船旁'); return { ok: false };
    }
    const result = returning ? { ok: true, depart: true, patch: {} } : advanceBuildQuest(S, action);
    if (!result.ok) { ui.toast(result.error, { kind: 'warn' }); return result; }
    if (result.changed) {
      const previous = Object.fromEntries(Object.keys(result.patch).map(k => [k, S[k]]));
      Object.assign(S, result.patch);
      if (!flushSave()) {
        Object.assign(S, previous); ui.toast('进度暂未保存成功，请检查设备存储后再试', { kind: 'warn' }); return { ok: false };
      }
      bus.emit('quest'); ui.refreshAll();
    }
    if (!result.depart) return result;
    this.busy = true;
    this.cancelGuidance();
    const oldCine = t.cine;
    try {
      beforeDepart?.(); t.setModal(true);
      t.cine = (_time, _dt, camera) => {
        const view = t.buildIslandPort.travelView();
        if (view) { camera.position.copy(view.position); camera.lookAt(view.target); }
      };
      const arrived = await t.buildIslandPort.travel(zone);
      if (!arrived || S !== source || t.zone !== zone) return { ok: false, depart: true };
      t.cine = oldCine;
      await ui.iris(() => {
        if (S !== source || t.zone !== zone) return;
        if (returning) t.setZone('home', BUILD_HOME_DOCK.x + 1, BUILD_HOME_DOCK.z);
        else t.setZone('build', BUILD_SPAWN.x, BUILD_SPAWN.z);
      });
      if (S !== source) return { ok: false, depart: true };
      ui.toast(returning ? '回到后院了' : result.rewards ? '海风岛已解锁，入门建材已放入仓库！' : '欢迎回到海风工坊岛', { life: 4200 });
      ui.refreshAll();
      return result;
    } finally { t.cine = oldCine; this.busy = false; t.setModal(ui.modals > 0); }
  },
  async travel(zone) {
    if (this.busy) return;
    if (zone === 'build') return this.buildIslandAction('depart');
    if (this.town.zone === 'build') return this.buildIslandAction('return');
    this.cancelGuidance();
    this.busy = true;
    this.town.setModal(true);
    let moved = false;
    await ui.iris(async () => { moved = this.town.setZone(zone) !== false; });
    this.town.setModal(false);
    this.busy = false;
    if (!moved) return;
    ui.toast(zone === 'home' ? '来到了后院' : zone === 'house' ? '回到了小屋' : '来到了花愿小镇');
    if (zone === 'house') ui.tutorial('house');
    if (zone === 'home') ui.tutorial('yard');
  },
  // 去一个指定位置（额外的室内区域用）
  async travelTo(zone, x, z, msg) {
    if (this.busy) return;
    if (zone === 'build' || this.town.zone === 'build') { ui.toast('请从岸边的小船往返海风工坊岛'); return; }
    this.cancelGuidance();
    this.busy = true;
    this.town.setModal(true);
    let moved = false;
    await ui.iris(async () => { moved = this.town.setZone(zone, x, z) !== false; });
    this.town.setModal(false);
    this.busy = false;
    if (!moved) return;
    if (msg) ui.toast(msg);
  },
  async openDecor() {
    if (this.busy || !this.town.canDecorate || this.town.decor.active) return;
    this.cancelGuidance();
    this.town.decor.enter();
    ui.tutorial('decor', false, { valid: () => this.town.decor.active });
  },
  upgradeHouse(done) {
    const next = HOUSES[S.house];
    if (!next || !spend(next.price)) return;
    S.house = next.tier;
    save();
    done && done();
    audio.sfx('fanfare');
    this.town.rebuildHouse();
    const hh = this.town.townHouseHolder;
    hh.scale.setScalar(0.01);
    tween({ dur: 0.9, ease: ease.outElastic, update: (k) => hh.scale.setScalar(Math.max(0.01, k)) });
    fx.confetti(this.town.scene, this.town.pos.clone().setY(3), 60);
    ui.toast(`新家落成：${next.name}！`, { kind: 'quest', life: 3600 });
    ui.refreshBeauty();
    checkQuest();
  },
  // 扩建院子：栅栏向外推，荒地变成可以布置的草地
  async upgradeYard(done) {
    const next = YARDS[S.yardLv || 1];
    if (!next || !spend(next.price)) return;
    S.yardLv = next.lv;
    save();
    done && done();
    const t = this.town;
    if (t.zone !== 'home') await this.travel('home');
    audio.sfx('fanfare');
    t.rebuildYard(true);
    t.decors.home.rebuildGrid();
    t.act('cheer', 1.1);
    fx.confetti(t.scene, t.pos.clone().setY(3), 70);
    ui.toast(`院子扩建完成：${next.name}！可布置的范围变大了`, { kind: 'quest', life: 4000 });
    ui.refreshBeauty();
    checkQuest();
    checkAch();
  },
  sellCrops() {
    let total = 0, n = 0;
    for (const [id, c] of Object.entries(S.crops)) { total += cropSellPrice(id, ui.hotCrop() === id) * c; n += c; }
    if (!n) {
      audio.sfx('error');
      ui.toast('背包里还没有作物，先去菜地收获吧', { kind: 'warn' });
      return;
    }
    S.crops = {};
    addCoins(total, 'sell');
    stat('sold', n);
    this.town.act('cheer', 0.9);
    ui.flyCoins(app.width / 2, app.height / 2, Math.min(12, 4 + n));
    ui.float({ sx: app.width / 2, sy: app.height / 2 - 30, text: `+${fmt(total)}`, cls: 'coin big' });
  },
  wish() {
    if (!spend(5)) return;
    const t = this.town, source = S;
    t.face(6, 4);
    t.act('wave', 1);
    audio.sfx('water');
    fx.hearts(t.scene, new THREE.Vector3(6, 3.4, 4), 8);
    fx.sparkle(t.scene, new THREE.Vector3(6, 2.2, 4), 14, ['#9be0f0', '#ffffff', '#ffd24f']);
    // 彩蛋：七弦说的秘密是真的——每到第七次许愿，喷泉一定回礼。奖励与扣款同步入账，防关页丢失或切档串档。
    const seventh = ((S.stats.wishes || 0) + 1) % 7 === 0;
    const lucky = !seventh && Math.random() < 0.18;
    stat('wishes');
    if (seventh) {
      addCoins(77, 'wish');
      stat('egg_seven');
      flushSave();
      setTimeout(() => { if (S !== source) return; audio.sfx('fanfare'); fx.confetti(t.scene, new THREE.Vector3(6, 3.6, 4), 50); ui.toast('第七次许愿——喷泉回赠了 77 噗灵！', { kind: 'quest', icon: coinIco(), life: 3800 }); }, 700);
    } else if (lucky) {
      addCoins(40, 'wish');
      flushSave();
      setTimeout(() => { if (S !== source) return; audio.sfx('coin'); ui.toast('喷泉回赠了 40 噗灵！', { icon: coinIco() }); }, 700);
    } else { flushSave(); ui.toast(pick(WISHES)); }
  },
};

async function boot() {
  load();

  // 屏幕方向默认跟随系统；需要固定横屏/竖屏时再在设置中选择。
  // 这样拿着手机躺玩时不会被旧的空设置强制锁回横屏。
  if (isNativeApp()) applyOrient(S.settings.orient || 'auto');
  // iPhone 上双指捏合会缩放整个网页：拦掉（游戏里的捏合缩放是自己处理的）
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  app.init(document.getElementById('stage'));
  audio.setVolumes(S.settings.music, S.settings.sfx);
  game.town = new Town();
  game.wardrobe = new Wardrobe(game);
  ui.init(game);
  installDiagnostics({ app, ui, bus, account, saveInfo: saveDiagnostics, localPlay: LOCAL_PLAY });

  bus.on('openShop', (id) => game.openShop(id));
  bus.on('openBoutique', () => game.openWardrobe('shop'));
  bus.on('openHome', () => !game.busy && ui.homePanel());
  bus.on('buildIslandPanel', () => !game.busy && buildIslandPanel(game));
  bus.on('travel', (z) => game.travel(z));
  bus.on('openCloset', () => game.openWardrobe('closet'));
  bus.on('openRecycle', () => { if (!game.busy) ui.recyclePanel(); });
  bus.on('zone', (z) => ['farm','orchard'].includes(z) && ui.tutorial('farm', false, { valid: () => game.town.zone === 'home' && !game.town.decor.active }));
  bus.on('wish', () => game.wish());
  bus.on('openYard', () => !game.busy && ui.homePanel());
  bus.on('shovelTree', async (rec) => {
    const t = game.town.farm.state(rec);
    if (!t || !t.tree) return;
    if (await ui.confirm('铲除果树', '铲掉这棵果树后，田会空出来，可以重新种或搬到别处。种树花的噗灵不会退回。', '铲除')) {
      if (game.town.farm.removeTree(rec)) ui.toast('果树已铲除，这块田可以搬动了');
    }
  });
  bus.on('openReq', (id) => !game.busy && ui.reqPanel(id));
  bus.on('req', () => { ui.refreshReqs(); game.town.refreshReqMarks(); });
  let displayedSave = S, rebuildingSave = false;
  bus.on('stateReplaced', () => {
    game.cancelGuidance();
    // Rebind once per replacement; scene notifications must not replay rewards.
    if (displayedSave === S || rebuildingSave) return;
    displayedSave = S; rebuildingSave = true;
    try {
      for (const d of Object.values(game.town.decors)) d.reload();
      game.town.farm.refreshAll();
      game.town.rebuildHouse();
      game.town.rebuildYard();
      game.town.decors.home.rebuildGrid();
      if (game.town.zone === 'build' && (S.buildQuest?.stage !== 3 || S.buildQuest?.rewarded !== true)) game.town.setZone('home', BUILD_HOME_DOCK.x + 1, BUILD_HOME_DOCK.z);
      game.town.refreshOutfit();
      game.rebuildCommunity?.();
      ui.refreshAll();
      game.town.refreshReqMarks();
    } finally { rebuildingSave = false; }
  });
  // 昼夜时钟
  setInterval(() => ui.setClock(S.clock), 1000);
  setInterval(save, 15000);
  // 每 5 分钟自动存档一次（同时留一份备份），右上角提示一下
  setInterval(() => { if (S.started && autosave()) ui.toast('已自动存档', { life: 1800 }); }, 5 * 60 * 1000);
  bus.on('cheat', () => ui.cheatPanel(true));
  audio.installRecovery();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushSave(); account.syncNow(); } });
  window.addEventListener('pagehide', () => { flushSave(); account.syncNow(); });
  // 云同步与本机自动存档分开节流，避免每 15 秒的本地保存都上传完整存档。
  setInterval(() => { if (S.started) account.syncNow(); }, 30 * 1000);

  app.isUiOpen = () => ui.modals > 0;
  app.setView(game.town);
  game.town.camSnap = true;
  ui.showTitle();
  // 先让游戏按本机存档启动，再后台恢复登录并处理云端冲突，不阻塞首屏 WebGL。
  account.restore().then(async (profile) => {
    if (!profile) return;
    try {
      const result = await account.prepareSync();
      ui.handleSyncResult(result);
    } catch (error) {
      ui.toast(`云同步暂不可用：${error.message || '请检查服务器'}`, { kind: 'warn', life: 5000 });
    }
  });
  game.registerGame = (id, cls) => { GAMES[id] = cls; };
  installLive(game, ui); // 新系统默认启用，所有状态来自真实存档
  installCompanionEvents(game, ui);
  installCommunity(game, ui);
  installHomeInteractions(game, ui);
  installCleanScreenshot(game, ui);
  // 小玩具没有自己的设置面板，在真正互动时介绍；快速重复点击只预约一次动作。
  for (const it of game.town.inter.filter(it => ['capsule','musicbox','shroom','fortune','fountain'].includes(it.id))) {
    const act = it.act; let waiting = false;
    it.act = () => {
      if (tutorialRead('fun')) return act();
      if (waiting) return;
      waiting = true;
      const source = S, flow = game._tutorialFlow;
      ui.tutorial('fun', false, { valid: () => game.town.zone === 'town' && game.town.camMode === 'play' && !game.busy }).then(r => {
        if (r.completed && S === source && flow === game._tutorialFlow && app.view === game.town && game.town.zone === 'town' && game.town.camMode === 'play' && !game.busy) act();
      }).finally(() => { waiting = false; });
    };
  }
  game.town.seasons.scanTrees(game.town.scene);
  window.__game = game; // 调试用

  // 只有全部初始化成功后才移除启动遮罩。此前这里在 120ms 后无条件移除，
  // 慢设备或后续模块出错时会留下空白页面，用户也看不到真正的错误。
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.classList.add('out');
    setTimeout(() => bootEl.remove(), 700);
  }
}

boot().catch((e) => {
  console.error(e);
  window.__showBootError?.('启动失败：' + (e.message || '未知错误'), true);
  const el = document.querySelector('#boot p');
  if (el) el.textContent = '启动失败：' + (e.message || '未知错误');
});
