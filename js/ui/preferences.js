import { S, save, bus } from '../core/state.js';
import { h } from '../core/util.js';
import { app } from '../core/app.js';
import { controls, CONTROL_RANGES } from '../core/preferences.js';
import { performanceLog } from '../core/performance-log.js';
import { normalizeGraphicsSettings, effectiveFpsLimit } from '../core/graphics-settings.js';
import { isMobileDevice } from '../core/orient.js';
import { diagnosticsPanel } from '../devtools/panel.js';

// 保留按钮节点与触摸焦点；避免按下后重建整组选项，读屏和键盘也可识别当前选择。
function optionGroup(title, options, read, change, attr) {
  const seg = h('div', { class: 'seg graphics-options' });
  const buttons = options.map(([id, label]) => h('button', {
    type: 'button', [attr]: String(id),
    onclick: () => { change(id); render(); },
  }, label));
  const render = () => buttons.forEach((button, i) => {
    const selected = read() === options[i][0];
    button.classList.toggle('on', selected); button.setAttribute('aria-pressed', String(selected));
  });
  seg.append(...buttons); render();
  return { row: h('fieldset', { class: 'preference-group' }, h('legend', {}, title), seg), render };
}

export function controlsPanel(ui) {
  const body = h('div', { class: 'settings controls-settings' }, h('h2', {}, '操作与显示'), h('p', { class: 'fine' }, '拖动滑条或轻点轨道即可调整，数值会同步变化并自动保存。摇杆在触屏操作时出现，互动按钮会移到另一侧。'));
  const refresh = () => { ui.applyControls(); bus.emit('controlsChanged'); save(); };
  const side = optionGroup('操作习惯', [['left', '左手移动'], ['right', '右手移动']], () => controls().moveSide,
    id => { S.settings.moveSide = id; refresh(); }, 'data-move-side');
  body.append(side.row);
  const fields = [
    ['joySize', '摇杆大小', v => v + ' px'], ['joyEdge', '距侧边', v => v + ' px'],
    ['joyBottom', '距底边', v => v + ' px'], ['cameraSensitivity', '镜头灵敏度', v => v.toFixed(1) + '×'],
    ['textScale', '阅读字号', v => Math.round(v * 100) + '%'], ['buttonScale', '按钮大小', v => Math.round(v * 100) + '%'],
  ];
  const resetRanges = [];
  for (const [key, label, format] of fields) {
    const [min, max, step] = CONTROL_RANGES[key];
    const output = h('output', {}, format(controls()[key]));
    const updateValue = () => {
      const value = controls()[key];
      range.value = value; output.textContent = format(value);
      range.setAttribute('aria-valuetext', format(value));
      range.style.setProperty('--range-fill', ((value - min) / (max - min) * 100) + '%');
    };
    const range = h('input', { type: 'range', id: 'control-' + key, min, max, step, value: controls()[key], 'aria-label': label, 'data-control': key,
      oninput: e => { S.settings[key] = Number(e.target.value); updateValue(); refresh(); },
      onchange: () => { updateValue(); refresh(); } });
    // 轨道保持原生键盘行为；触屏只在滑条自身接管横拖，旁边空白仍可纵向滚动。
    let drag = null;
    const setPointerValue = e => {
      const ratio = Math.max(0, Math.min(1, (e.clientX - drag.left) / drag.width));
      range.value = String(Number((min + Math.round(ratio * (max - min) / step) * step).toFixed(4)));
      range.dispatchEvent(new Event('input', { bubbles: true }));
    };
    range.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag) return;
      const box = range.getBoundingClientRect(), inset = Math.min(14, box.width / 4);
      drag = { id: e.pointerId, left: box.left + inset, width: Math.max(1, box.width - inset * 2) };
      range.setPointerCapture(e.pointerId); range.focus({ preventScroll: true });
      setPointerValue(e); e.preventDefault();
    });
    range.addEventListener('pointermove', e => { if (drag?.id === e.pointerId) setPointerValue(e); });
    const endDrag = e => {
      if (drag?.id !== e.pointerId) return;
      drag = null; if (range.hasPointerCapture(e.pointerId)) range.releasePointerCapture(e.pointerId);
      range.dispatchEvent(new Event('change', { bubbles: true }));
    };
    range.addEventListener('pointerup', endDrag); range.addEventListener('pointercancel', endDrag); range.addEventListener('lostpointercapture', endDrag);
    updateValue(); resetRanges.push(updateValue);
    body.append(h('div', { class: 'preference-control' }, h('div', { class: 'preference-heading' }, h('label', { for: range.id }, label), output),
      h('div', { class: 'preference-range' }, range), h('div', { class: 'preference-limits', 'aria-hidden': 'true' }, h('span', {}, format(min)), h('span', {}, format(max)))));
  }
  body.append(h('p', { class: 'fine' }, '摇杆尺寸和边距会按当前屏幕自动避让，防止挡住另一侧按钮。横竖屏切换后会重新适配。'),
    h('button', { class: 'btn alt sm', 'data-reset-controls': '', style: { marginTop: '1.4rem' }, onclick: () => {
    for (const key of ['moveSide', ...fields.map(f => f[0])]) delete S.settings[key];
    refresh(); side.render(); resetRanges.forEach(render => render()); ui.toast('操作与显示已恢复默认');
  } }, '恢复默认操作'));
  return ui.modal(body, { ribbon: '按你的习惯', cls: 'live-modal preferences-modal' });
}

export function performancePanel(ui) {
  const mobileDevice = isMobileDevice();
  let modal;
  const body = h('div', { class: 'settings performance-settings' }, h('h2', {}, '画面与性能'));
  const current = h('p', { class: 'graphics-current res-note', 'data-graphics-current': '', 'aria-live': 'polite' });
  const aaNames = { off: '关闭', native: '系统抗锯齿', fxaa: 'FXAA', msaa2: '2× MSAA', msaa4: '4× MSAA' };
  const renderCurrent = () => {
    const fpsText = app.fpsCap === 0 ? '无限制（跟随屏幕刷新）' : app.fpsCap + ' 帧';
    current.textContent = `当前渲染：${app.width && app.height ? Math.round(app.width * app.pixelRatio) + ' × ' + Math.round(app.height * app.pixelRatio) : '准备中'} 像素 · ${aaNames[app.aa?.mode] || '自动'}${app.aa?.fallback ? '（设备限制，已自动降级）' : ''}。帧率上限 ${fpsText}，${app.perf?.dynFps ? '小镇静止或打开菜单时仍降到 30 帧。' : '实际帧率取决于设备和当前画面。'}${app.autoNoShadow ? '掉帧保护已临时关闭阴影。' : ''}`;
  };
  const select = (key, title, options, attr) => {
    const group = optionGroup(title, options, () => key === 'fpsLimit' ? effectiveFpsLimit(S.settings, mobileDevice) : normalizeGraphicsSettings(S.settings)[key],
      id => { S.settings[key] = id; save(); app.applyQuality(); renderCurrent(); }, attr);
    graphicsGroups.push(group); body.append(group.row);
  };
  const graphicsGroups = [];
  const fpsOptions = [['auto', '自动'], [30, '30'], [60, '60'], [90, '90'], [120, '120']];
  if (!mobileDevice) fpsOptions.push(['unlimited', '无限制']);
  select('fpsLimit', '帧率上限', fpsOptions, 'data-fps-limit');
  body.append(h('p', { class: 'fine graphics-hint' }, '默认自动：均衡 / 精致上限 60 帧，省电上限 30 帧。90 / 120 帧需手动选择，并需要高刷新率屏幕与系统支持；设置上限不保证达到该帧率。' + (!mobileDevice ? '电脑“无限制”取消游戏内限帧，仍跟随屏幕刷新和系统垂直同步。' : '') + '高帧率可能增加耗电和发热。'));
  select('renderScale', '渲染清晰度', [[0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']], 'data-render-scale');
  body.append(h('p', { class: 'fine graphics-hint' }, '100% 沿用当前画质的默认分辨率。更高档位让 3D 画面更清晰，也增加绘制像素；不改变文字大小。'));
  select('antiAlias', '抗锯齿', [['auto', '自动'], ['off', '关闭'], ['fxaa', 'FXAA'], ['msaa2', '2×'], ['msaa4', '4×']], 'data-anti-alias');
  body.append(h('p', { class: 'fine graphics-hint' }, '自动保留手机默认关闭、电脑按画质选择。FXAA 较轻量，边缘可能略柔；2× / 4× MSAA 更耗显存与性能，不支持时自动降低采样或改用 FXAA。'));
  select('adaptiveQuality', '掉帧保护', [[true, '开启'], [false, '关闭']], 'data-adaptive-quality');
  body.append(h('p', { class: 'fine graphics-hint' }, '开启后，持续掉帧会临时降低清晰度或阴影；仅自动帧率模式可继续降低帧率上限。关闭后保留所选画面设置，不改变游戏计时。'), current);
  body.append(h('button', { class: 'btn alt sm', 'data-reset-graphics': '', onclick: () => {
    for (const key of ['fpsLimit', 'renderScale', 'antiAlias', 'adaptiveQuality']) delete S.settings[key];
    save(); app.applyQuality(); graphicsGroups.forEach(group => group.render()); renderCurrent(); ui.toast('画面选项已恢复默认');
  } }, '恢复默认画面选项'));
  const status = h('p', { class: 'res-note', 'aria-live': 'polite' }), actions = h('div', { class: 'row', style: { flexWrap: 'wrap' } });
  const reportText = h('textarea', { readOnly: true, 'aria-label': '性能记录文本', 'data-performance-text': '',
    style: { display: 'none', width: '100%', height: '10rem', marginTop: '1rem', resize: 'vertical', fontSize: '.8rem' } });
  const render = () => {
    renderCurrent();
    const r = performanceLog.active, report = performanceLog.last;
    status.textContent = r ? `正在记录：${Math.floor(r.visibleSeconds)} 秒有效画面，${r.samples.length} 组样本。关闭面板后正常走动、装修或打工即可。`
      : report ? `上次记录：${report.visibleSeconds} 秒有效画面，平均 ${report.summary.averageFps} 帧/秒；可导出给开发者检查。` : '可在实际手机上记录 1 或 5 分钟，观察帧率、分辨率与资源变化。数据只留在当前页面，导出文件后可分享。';
    if (actions.dataset.active === String(!!r)) return;
    actions.dataset.active = String(!!r); actions.replaceChildren();
    if (r) actions.append(h('button', { class: 'btn sm', onclick: () => { performanceLog.stop(); render(); } }, '结束记录'));
    else for (const seconds of [60, 300]) actions.append(h('button', { class: 'btn sm', 'data-record-seconds': seconds, onclick: () => {
      performanceLog.start(seconds); performanceLog.engine = app; render(); ui.toast('性能记录已开始，可以关闭面板继续玩');
    } }, `记录 ${seconds / 60} 分钟`));
    const download = h('button', { class: 'btn alt sm', disabled: !report, 'data-export-performance': '', onclick: () => {
      if (!performanceLog.last) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(performanceLog.last, null, 2)], { type: 'application/json' }));
      const link = h('a', { href: url, download: '暖暖小镇-性能记录-' + Date.now() + '.json' }); document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } }, '导出性能记录');
    actions.append(download);
    actions.append(h('button', { class: 'btn alt sm', disabled: !report, 'data-show-performance': '', onclick: () => {
      reportText.value = JSON.stringify(performanceLog.last, null, 2); reportText.style.display = 'block'; reportText.focus(); reportText.select();
    } }, '显示记录文本'));
  };
  body.append(h('h3', {}, '本机运行记录'), status, actions, reportText, h('p', { class: 'fine' }, '记录不会读取照片、存档内容或其他应用，也不会上传。后台停留不计入帧率，报告不测量手机温度。下载不便时，可显示记录文本并自行复制。'));
  body.append(h('h3', { style: { marginTop: '1.25rem' } }, '排查运行问题'),
    h('p', { class: 'fine' }, '只读查看场景、帧阶段耗时、保存与同步状态，记录问题出现的时刻并导出脱敏报告。'),
    h('button', { class: 'btn alt sm', type: 'button', 'data-settings-open': 'diagnostics', style: { marginTop: '.7rem' }, onclick: () => {
      modal.close(true); diagnosticsPanel(ui);
    } }, '运行诊断（只读）'));
  render(); const timer = setInterval(render, 1000);
  modal = ui.modal(body, { ribbon: '运行更舒服', cls: 'live-modal preferences-modal', onClose: () => clearInterval(timer) });
  return modal;
}
