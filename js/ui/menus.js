// 设置、帮助、教程入口与标题画面。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h, fmt } from '../core/util.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { autosave, backupInfo, restoreBackup, checkAch, checkQuest } from '../core/state.js';
import { CLOTHES, FRUIT } from '../data.js';
import { S, save, hasSave } from '../core/state.js';
import { TUTORIALS } from '../data.js';
import { addCoins } from '../core/state.js';
import { live } from '../live/api.js';
import { controls } from '../core/preferences.js';
import { controlsPanel, performancePanel } from './preferences.js';
import { calendarPanel } from './calendar.js';
import { saveTransferPanel } from './save-transfer.js';
import { tutorialRead, tutorialPreferenceControl } from './tutorials.js';
import { account, accountSummary } from '../core/account.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { svg } from './components/svg.js';
import { click } from './components/actions.js';

export function cheatPanel(first) {
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

export function settingsPanel() {
  const g = this.game;
  const seg = h('div', { class: 'seg' });
  const renderSeg = () => seg.replaceChildren(...[['high', '精致'], ['mid', '均衡'], ['low', '省电']].map(([k, n]) =>
    h('button', { class: app.quality === k ? 'on' : '', 'data-quality': k, onclick: click(() => { S.settings.quality = k; S.settings.qualityExplicit = true; save(); app.applyQuality(); renderSeg(); }, 'tab') }, n)));
  renderSeg();
  const fpsSeg = h('div', { class: 'seg' });
  const fpsOptions = [[true, '显示 FPS'], [false, '隐藏']];
  const fpsButtons = fpsOptions.map(([val, label]) =>
      h('button', { type: 'button', 'data-show-fps-quick': String(val), onclick: click(() => {
        S.settings.showFps = val;
        save();
        this.syncFpsVisibility?.();
        renderFpsSeg();
      }, 'tab') }, label));
  const renderFpsSeg = () => fpsButtons.forEach((button, index) => {
    const selected = !!S.settings.showFps === fpsOptions[index][0];
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  fpsSeg.append(...fpsButtons);
  renderFpsSeg();
  let saveInfo;
  const hm = (t) => { const d = new Date(t); return t ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '--:--'; };
  const renderSave = () => { saveInfo.textContent = `每 5 分钟自动存档 · 上次 ${hm(S.savedAt)}`; };
  setTimeout(renderSave);
  const range = (key) => h('input', { type: 'range', min: 0, max: 100, value: S.settings[key] * 100, oninput: (e) => { audio.init(); S.settings[key] = e.target.value / 100; audio.setVolumes(S.settings.music, S.settings.sfx); save(); } });
  let m;
  m = this.modal(h('div', { class: 'settings' },
    h('h2', {}, '设置'),
    tutorialPreferenceControl(),
    h('label', {}, '背景音乐', range('music')),
    h('label', {}, '音效', range('sfx')),
    h('label', {}, '画面', seg),
    h('label', {}, '帧率显示', fpsSeg),
    h('p', { class: 'fine', style: { marginTop: '0.5rem' } }, '精致：开启光影后期；均衡：关闭后期特效（手机默认）；省电：降低分辨率。主动选择精致会保留到下次启动，但会增加性能开销。帧率、清晰度和抗锯齿可在画面与性能里单独调整。模型细节与阴影精度在下次打开游戏时生效。'),
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

export function tutorial(id, force = false, options = {}) { return this.tutorials.request(id, force, options); }

export function cancelTutorials(reason) { this.tutorials?.cancelAll(reason); }

export function helpPanel() {
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

export function showTitle() {
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

export function refreshTitle() {
  if (!this.title) return;
  this.title.remove(); this.title = null; this.showTitle();
}

export function hideTitle() {
  if (!this.title) return;
  const t = this.title;
  t.classList.add('out');
  setTimeout(() => t.remove(), 700);
  this.title = null;
}
