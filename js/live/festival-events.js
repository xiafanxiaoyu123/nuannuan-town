// 四季小聚的统一入口。玩法仅持有临时状态，纪念沿用当天的一次参与记录。
import { S, bus, save } from '../core/state.js';
import { gameDayKey } from '../core/gametime.js';
import { h } from '../core/util.js';
import { audio } from '../core/audio.js';
import { festivalAt } from './effects.js';
import { app } from '../core/app.js';
import { FESTIVAL_GAMES, FESTIVAL_ACTIVITIES } from './festival-guide.js';
import { createFestivalStage } from './festival-stage3d.js';
import { festivalHud, HUD_CSS } from './festival-hud.js';
export { FESTIVAL_ACTIVITIES } from './festival-guide.js';
export { FLOWER_PATTERN } from './festival-spring.js';
export { BASKET_WEIGHTS } from './festival-harvest.js';

export function activityState(kind, seed = 0) { return FESTIVAL_GAMES[kind]?.create(seed) || null; }
export function activityStep(state, action) { return !!FESTIVAL_GAMES[state?.kind]?.step(state, action); }
export function festivalCompleted(kind) { const f = S.live?.fun; return f?.day === gameDayKey() && f.used?.['festival:' + kind] === 1; }
export function finishFestival(kind, day, source) {
  if (source !== S || day !== gameDayKey() || festivalAt()?.id !== kind) return false;
  const f = S.live.fun;
  if (f.day !== day) { f.day = day; f.used = {}; f.capsule = 0; }
  if (f.used['festival:' + kind] === 1) return false;
  f.used['festival:' + kind] = 1; save(); bus.emit('festivalMemory', kind); return true;
}
function style() {
  if (document.getElementById('festival-activity-style')) return;
  document.head.append(h('style', { id: 'festival-activity-style' }, `
    .modal.festival-modal{width:min(620px,calc(100vw - 28px));max-height:calc(100dvh - 32px);overflow:visible;box-sizing:border-box}
    .festival-activity{padding:24px 18px 18px;color:#705865;max-height:calc(100dvh - 90px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;overflow-wrap:anywhere}
    .festival-activity h2{margin:0 0 7px;font-size:23px}.festival-activity p{line-height:1.65;margin:9px 0}.festival-activity button{min-height:44px;touch-action:manipulation;white-space:normal;max-width:100%}
    .festival-activity .btn{min-height:44px}
    .fa-heading{display:flex;align-items:center;gap:10px;justify-content:space-between}.fa-heading .btn{flex-shrink:0;font-size:12px;padding:7px 11px}.fa-kicker{font-size:11px;letter-spacing:2px;color:#a67c7c;display:block;margin-bottom:7px}
    .fa-intro{padding:18px 16px;background:linear-gradient(145deg,#fff5ed,#fff0f5);border:1px solid #efd9cd;border-radius:18px;margin:12px 0}.fa-intro h3{font-size:17px;margin:0 0 8px}.fa-intro ol{padding-left:25px;line-height:1.7}.fa-intro li{padding:4px}.fa-intro .btn{display:block;margin:18px auto 2px;min-width:170px}.fa-guide-note{font-size:12px;color:#947977}
    .fa-stage{padding:18px 12px;margin:15px 0;background:#fff6ee;border:1px solid #efd9cd;border-radius:18px;text-align:center;min-height:130px}
    .fa-complete{position:absolute;inset:0;z-index:3;pointer-events:none;display:flex;align-items:flex-start;justify-content:center;padding:52px 12px 12px;box-sizing:border-box}
    .fa-complete>.fa-stage{width:min(380px,100%);max-height:54%;overflow-y:auto;margin:0;background:rgba(255,250,245,.94);box-shadow:0 6px 20px rgba(120,70,95,.18);pointer-events:none}
    .fa-complete>.fa-done{pointer-events:auto}
    .fa-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:12px 0}.fa-row button{min-height:46px;flex:1 1 85px}
    .fa-track{height:34px;background:#e7ddd9;position:relative;border-radius:17px;margin:24px 4px}.fa-zone{position:absolute;top:0;height:100%;background:#f8d76c;border-radius:12px}.fa-pulse{position:absolute;width:18px;height:42px;top:-4px;background:#bf7396;border:3px solid white;border-radius:10px;transform:translateX(-50%)}
    .fa-pattern{display:flex;gap:9px;justify-content:center;align-items:center;min-height:40px}.fa-counter{font-size:25px;font-weight:800}.fa-message{min-height:2.5em;color:#8b6472;font-weight:600}.fa-progress{display:flex;gap:5px;list-style:none;padding:0;margin:12px 0;font-size:12px}.fa-progress li{flex:1;padding:8px 5px;border-radius:10px;background:#eee6e0;text-align:center;line-height:1.5}.fa-progress .current{background:#f1d4c5;font-weight:700}.fa-progress .complete{background:#e2efdf}.fa-done{padding:18px 16px;border-radius:15px;background:#eaf6ea;color:#436e51;text-align:left}.fa-done h3{margin:6px 0;font-size:19px}.fa-done ul{padding-left:20px;line-height:1.8}.fa-done>.btn{display:block;margin:12px auto 0}.fa-note{font-size:12px;opacity:.85}.fa-footer{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-top:10px}.fa-footer .fa-note{flex:1}.fa-footer .btn{flex-shrink:0;font-size:12px}.fa-keys{font-size:11px;color:#8b707b;text-align:center}
    /* 3D 舞台：宽屏放左边、操作在右边；窄屏放在最上面并跟着滚动停住 */
    .fa-3d{position:sticky;top:0;z-index:2;height:min(34vh,260px);border-radius:18px;overflow:hidden;background:#fff6ee;box-shadow:inset 0 0 0 2px #fff,0 6px 16px rgba(120,70,95,.14);margin:0 0 12px}
    .fa-3d canvas{display:block;width:100%;height:100%}
    @media(min-width:900px) and (min-height:520px){
      .modal.festival-modal:has(.has3d){width:min(1180px,calc(100vw - 48px));max-width:none}
      .festival-activity.has3d{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);column-gap:20px;align-content:start}
      .festival-activity.has3d>*{grid-column:2;min-width:0}
      .festival-activity.has3d>.fa-3d{grid-column:1;grid-row:1/span 30;height:min(66vh,560px);margin:0;align-self:start}
    }
    @media(max-height:500px){.fa-3d{height:38vh}}
    @media(max-height:500px){.festival-activity{padding:18px 14px 12px}.fa-stage{padding:10px;margin:8px 0;min-height:95px}.festival-activity p{margin:5px 0}.fa-intro{padding:12px}}
    ${Object.values(FESTIVAL_GAMES).map(game => game.css || '').join('\n')}
    ${HUD_CSS}
  `));
}
export function openFestivalActivity(game, kind, site, onDone = () => {}) {
  const workshop = FESTIVAL_GAMES[kind], config = workshop?.config, town = game.town, ui = game.ui;
  if (!config || festivalAt()?.id !== kind || town.zone !== 'town' || app.view !== town || game.busy || ui.modals || town.decor?.active || town.photoOn || !site || Math.hypot(town.pos.x - site.x, town.pos.z - site.z) > 4) return null;
  style();
  const source = S, day = gameDayKey(), seed = S.gday || 0;
  const body = h('div', { class: 'festival-activity festival-workshop', 'data-festival-activity': kind, 'data-festival': kind });
  // 3D 舞台：只负责把当前状态演出来；创建失败（比如显卡不支持）就照旧只用文字界面
  const stage3d = createFestivalStage(kind, () => body);
  if (stage3d) body.classList.add('has3d');
  let model = activityState(kind, seed), modal, timer, pulseTimer, closed = false, started = 0, cueCycle = -1, revision = 0, intro = true, entered = false;
  const stillHere = () => !closed && source === S && day === gameDayKey() && festivalAt()?.id === kind && town.zone === 'town' && app.view === town && !game.busy;
  const foreground = () => !document.hidden && !app.suspended;
  const visible = () => body.isConnected && body.style.display !== 'none' && !modal?._closed;
  const close = () => {
    if (closed) return; closed = true; revision++;
    clearInterval(timer); clearTimeout(pulseTimer); offDay(); offReset();
    window.removeEventListener('blur', pauseBeat); window.removeEventListener('keydown', keys, true);
    document.removeEventListener('visibilitychange', visibility); stage3d?.dispose(); modal?.close(true);
  };
  const pauseBeat = () => {
    if (closed || kind !== 'summer' || !model.playing || model.done) return;
    clearTimeout(pulseTimer); workshop.step(model, { type: 'pause' });
    // 首次教程暂时隐藏 body；保留原 DOM，避免重建影响教程的恢复位置。
    if (body.style.display !== 'none') render();
  };
  const visibility = () => { if (!foreground()) pauseBeat(); };
  const pulse = () => {
    clearTimeout(pulseTimer);
    if (!stillHere()) { close(); return; }
    if (!model.playing || model.done || intro) return;
    if (!foreground() || !visible()) { pauseBeat(); return; }
    const t = (performance.now() - started) / workshop.beatDuration, phase = t % 1, cycle = Math.floor(t);
    const node = body.querySelector('.fa-pulse');
    if (node) node.style.left = phase * 100 + '%';
    body.dataset.beatPhase = String(phase); body.dataset.beatCycle = String(cycle);
    // 每圈只发一个轻提示音；界面仍提供完整视觉节拍，静音时照常游玩。
    if (phase >= .48 && cueCycle !== cycle) { cueCycle = cycle; audio.tone({ f: 620, f2: 500, dur: .045, vol: .035, type: 'sine' }); }
    pulseTimer = setTimeout(pulse, 40);
  };
  const act = action => {
    if (!stillHere()) { close(); return; }
    if (!visible() || !foreground()) { pauseBeat(); return; }
    audio.init();
    if (action.type === 'enter') { intro = false; entered = true; render({ toTop: true }); return; }
    if (action.type === 'help') { pauseBeat(); intro = true; render({ toTop: true }); return; }
    if (action.type === 'reset' || action.type === 'again') {
      clearTimeout(pulseTimer); model = activityState(kind, seed); intro = false; entered = true; render({ toTop: true }); return;
    }
    if (intro || model.done) return;
    const wasPlaying = !!model.playing, wasDone = model.done, oldPhase = model.phase;
    if (kind === 'summer' && action.type === 'beat') {
      if (!model.playing) return;
      const t = (performance.now() - started) / workshop.beatDuration;
      action = { ...action, cycle: Math.floor(t), phase: t % 1 };
    }
    const lastBeat = model.lastBeat;
    activityStep(model, action);
    if (kind === 'summer' && !model.playing) clearTimeout(pulseTimer);
    if (kind === 'summer' && action.type === 'beat') {
      if (lastBeat !== model.lastBeat) audio.tone({ f: action.pad === 'left' ? 165 : 270, f2: action.pad === 'left' ? 62 : 105, type: 'sine', dur: .17, vol: .23 });
    } else audio.sfx('tab');
    if (!wasPlaying && model.playing) { started = performance.now(); cueCycle = -1; }
    if (model.done && !wasDone) { clearTimeout(pulseTimer); finishFestival(kind, day, source); audio.sfx('success'); onDone(); }
    render({ toTop: oldPhase !== model.phase || model.done }); if (model.playing && !model.done) pulse();
  };
  const button = (label, id, action, attrs = {}) => {
    const token = revision, current = model;
    const node = h('button', { class: 'btn alt sm', ...attrs, type: 'button', 'data-fa': id, onclick: () => {
      if (token !== revision || current !== model || !node.isConnected || node.disabled) return;
      act(action);
    } }, label);
    return node;
  };
  const keys = event => {
    if (kind !== 'summer' || !model.playing || intro || event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
    const pad = event.code === 'KeyF' ? 'left' : event.code === 'KeyJ' ? 'right' : null;
    if (!pad || !stillHere() || !foreground() || !visible()) return;
    event.preventDefault(); event.stopImmediatePropagation(); act({ type: 'beat', pad });
  };
  const render = ({ toTop = false } = {}) => {
    const focusId = body.contains(document.activeElement) ? document.activeElement?.dataset.fa : null;
    revision++;
    const nodes = [h('span', { class: 'fa-kicker' }, '四季小聚 · ' + config.host + '的邀请'),
      h('div', { class: 'fa-heading' }, h('h2', {}, config.title), !intro && button('玩法说明', 'help', { type: 'help' }))];
    if (intro) {
      nodes.push(h('div', { class: 'fa-intro' }, h('h3', {}, '这次，一起做点什么？'), h('p', {}, config.intro),
        h('ol', { 'aria-label': '活动的三个步骤' }, config.steps.map(step => h('li', {}, step))),
        h('p', {}, config.instruction), h('p', { class: 'fa-guide-note' }, '完成全部三步，会在今日场景留下共同完成的纪念标牌。作品与过程保留在本次活动里；离开后可以从头再玩。'),
        button(entered ? '回到小聚' : '开始这次小聚', 'enter', { type: 'enter' }, { class: 'btn' })));
    } else {
      if (kind !== 'summer') nodes.push(h('ol', { class: 'fa-progress', 'aria-label': '小聚进度' }, config.steps.map((step, i) => h('li', { class: model.done || i < model.phase ? 'complete' : i === model.phase ? 'current' : '', 'aria-current': !model.done && i === model.phase ? 'step' : 'false' }, (model.done || i < model.phase ? '✓ ' : (i + 1) + ' ') + step))));
      nodes.push(workshop.render(model, { h, button, act }));
      if (!model.done && (kind === 'sakura' || kind === 'harvest')) nodes.push(h('p', { class: 'fa-message', role: 'status', 'aria-live': 'polite' }, model.message));
      // 各活动已在自身舞台中讲述阶段对白，外壳只负责公共完成与帮助。
      if (model.done) {
        const result = workshop.summary(model);
        nodes.push(h('div', { class: 'fa-done', role: 'status', 'aria-live': 'polite' }, h('small', {}, '今日节日纪念 · 已留下'), h('h3', {}, result.title), h('p', {}, result.text), h('ul', {}, result.details.map(detail => h('li', {}, detail))), button('再玩一次', 'again', { type: 'again' })));
      } else if (kind === 'summer') nodes.push(h('p', { class: 'fa-keys' }, '电脑也可用 F 敲左鼓、J 敲右鼓。离开窗口会暂停，回来后手动继续。'));
    }
    nodes.push(h('div', { class: 'fa-footer' }, h('p', { class: 'fa-note' }, festivalCompleted(kind) ? '今天已留下纪念，欢迎继续游玩。活动不发金币或物品奖励。' : '不花噗灵，不消耗背包材料；完成后记录当天参与纪念。'), !intro && !model.done && button('重新开始', 'reset', { type: 'reset' })));
    if (stage3d) {
      stage3d.update(model);
      if (intro) { body.classList.remove('playing'); stage3d.overlay(); nodes.unshift(stage3d.el); }
      else {
        // 进入玩法后只留 3D 舞台：标题、提示、按钮和完成小结都叠在画面上
        body.classList.add('playing');
        const head = h('div', { class: 'fa-head' }, h('b', {}, config.title), button('玩法说明', 'help', { type: 'help' }), !model.done && button('重新开始', 'reset', { type: 'reset' }));
        let main;
        if (model.done) {
          // WebGL 舞台的完成层也要保留活动自己的纪念画面（例如初雪装扮雪人）。
          // 之前这里只显示公共摘要，导致离线单文件和支持 WebGL 的设备完成后看不到玩家选择的装扮。
          const result = workshop.summary(model);
          const keepsake = workshop.render(model, { h, button, act });
          main = h('div', { class: 'fa-complete', role: 'status', 'aria-live': 'polite' },
            keepsake,
            h('div', { class: 'fa-done' }, h('small', {}, '今日节日纪念 · 已留下'), h('h3', {}, result.title), h('p', {}, result.text), h('ul', {}, result.details.map(detail => h('li', {}, detail))), button('再玩一次', 'again', { type: 'again' })));
        }
        else main = festivalHud(kind, model, { h, button, config });
        stage3d.overlay(head, main);
        nodes.length = 0; nodes.push(stage3d.el);
      }
    }
    const scroll = toTop ? 0 : body.scrollTop; body.replaceChildren(...nodes); body.scrollTop = scroll;
    if (focusId) {
      const next = [...body.querySelectorAll('[data-fa]')].find(node => node.dataset.fa === focusId && !node.disabled) || body.querySelector('.fa-stage button:not(:disabled),[data-fa=enter],[data-fa=again]');
      next?.focus({ preventScroll: true });
    }
  };
  const offDay = bus.on('newDay', close), offReset = bus.on('reset', close);
  render(); modal = ui.modal(body, { ribbon: '节日小聚', cls: 'live-modal festival-modal', onClose: close });
  window.addEventListener('blur', pauseBeat); window.addEventListener('keydown', keys, true);
  document.addEventListener('visibilitychange', visibility);
  timer = setInterval(() => {
    if (!stillHere() || !body.isConnected) { close(); return; }
    if (!foreground() || !visible()) pauseBeat();
    // 说明层恢复后，仅刷新暂停按钮；不自动开始节拍。
    if (kind === 'summer' && !intro && !model.playing && !model.done && visible() && !model.ready && !body.querySelector('[data-fa=start]')) render();
  }, 200);
  return { close, get modal() { return modal; }, get model() { return model; } };
}
