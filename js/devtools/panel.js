import { h } from '../core/util.js';
import { diagnostics } from './diagnostics.js';

const labels = {
  version: '游戏版本', build: '构建标识', platform: '运行平台', scene: '当前场景', zone: '所在区域',
  viewport: '窗口尺寸', renderPixels: '渲染尺寸', pixelRatio: '像素比', quality: '画质',
  frameReason: '当前帧率策略', modalOpen: '弹窗已打开', hidden: '页面在后台',
  fps: '实际帧率', frameP95Ms: '帧间隔 P95（ms）', cpuP95Ms: '主线程 P95（ms）',
  slowFrames: '超过 50ms 的帧', drawCalls: '绘制调用', triangles: '三角形', geometries: '几何体数量',
  textures: '纹理数量', targetFps: '所选帧率上限', activeFrameLimit: '当前帧率上限',
  mode: '存档模式', slot: '存档位类型', pending: '等待处理', lastSavedAt: '最近观察到保存',
  bytes: '最近保存大小（字节）', status: '状态', revision: '云端版本', lastSyncAt: '最近观察到同步', conflict: '存在冲突',
  sampledFrames: '绘制样本', completedFrames: '成功帧', failedFrames: '中断帧（不计入耗时）', directFrames: '直接绘制帧', postFrames: '启用后处理帧',
};
const names = { tween: '补间动画', tweens: '补间动画', fx: '特效', effects: '特效', view: '场景更新', 'view.update': '场景更新', hooks: '模块回调', render: '渲染提交', 'render.submit': '渲染提交' };
const values = { high: '精致', mid: '均衡', low: '省电', unlimited: '跟随屏幕刷新', idle: '空闲', recording: '记录中',
  guest: '游客', local: '本机', offline: '离线', synced: '已同步', syncing: '同步中', conflict: '需要处理冲突',
  active: '操作中', menu: '菜单', hidden: '后台', background: '后台', fixed: '固定上限', unavailable: '暂不可用', unknown: '未知',
  source: '本机源码', web: '网页', native: '应用内资源', android: '安卓', windows: 'Windows',
  normal: '正式进度', 'local-play': '自由试玩', default: '默认存档位', isolated: '独立存档位', unobserved: '未采样',
  saved: '已保存', error: '发生错误', deferred: '等待保存', ready: '已就绪', 'local-only': '仅本机',
  'signed-out': '未登录', restoring: '正在恢复登录', 'signed-in': '已登录', 'logged-out': '已退出', cancelled: '已取消' };

function valueText(value) {
  if (value === undefined || value === null || value === '') return '未采样';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '未采样';
  if (Array.isArray(value)) return value.map(valueText).join(' × ');
  if (typeof value === 'object') return JSON.stringify(value);
  return values[value] || String(value);
}

function fieldGroup(title, keys, name) {
  const list = h('dl', { class: 'diagnostics-fields', 'data-diagnostics-section': name });
  const fields = keys.map(key => {
    const value = h('dd', {}, '未采样');
    list.append(h('div', {}, h('dt', {}, labels[key] || key), value));
    return [key, value];
  });
  return { node: h('section', { class: 'diagnostics-section' }, h('h3', {}, title), list),
    render(data = {}) { for (const [key, value] of fields) value.textContent = ['targetFps', 'activeFrameLimit'].includes(key) && data?.[key] === 0 ? '跟随屏幕刷新' : valueText(data?.[key]); } };
}

function eventGroup(title, name, empty) {
  const list = h('ol', { class: 'diagnostics-events', 'data-diagnostics-section': name });
  let previous = '';
  return { node: h('section', { class: 'diagnostics-section diagnostics-wide' }, h('h3', {}, title), list),
    render(items) {
      const rows = Array.isArray(items) ? items.slice(-10).reverse() : [];
      const signature = JSON.stringify(rows); if (signature === previous) return; previous = signature;
      list.replaceChildren(...(rows.length ? rows.map(item => h('li', {},
        h('span', { class: 'diagnostics-event-meta' }, [item.at, item.type, item.scene].filter(v => v != null && v !== '').join(' · ')),
        h('span', {}, item.message || '未提供说明'))) : [h('li', { class: 'diagnostics-empty' }, empty)]));
    } };
}

function drawGroup() {
  const list = h('dl', { class: 'diagnostics-fields diagnostics-modules', 'data-diagnostics-section': 'draw' });
  const groups = { timings: { total: '绘制总段', scenePrepare: '场景筛选 / 合批准备', batchBuild: '其中：批次重建', draw: '绘制流程',
    renderer: '全部 renderer 提交（含阴影）', shadow: '其中：全部实际阴影', mainRenderer: '主场景提交（含阴影）',
    mainShadow: '其中：主场景实际阴影', mainScene: '主场景提交（扣除实际阴影）', postprocessing: '后处理 pass 合计' },
  post: { bloom: '后处理：辉光', finish: '后处理：移轴 / 调色', output: '后处理：色彩输出', fxaa: '后处理：FXAA', other: '后处理：其他' },
  counts: { rendererCalls: 'renderer 调用 / 帧', batchBuilds: '批次重建 / 帧', shadowCalls: '阴影入口调用 / 帧',
    shadowRefreshes: '实际刷新调用 / 帧', shadowSkips: '未刷新调用 / 帧', shadowClears: '阴影 clear 次数 / 帧', shadowDrawCalls: '阴影绘制调用 / 帧' } };
  const metric = (value, count = false) => value?.samples ? `${valueText(count ? value.average : value.averageMs)} / ${valueText(count ? value.p95 : value.p95Ms)} / ${valueText(count ? value.max : value.maxMs)} · ${value.samples} 个样本` : '未采样 / 本段不适用';
  let previous = '';
  return { node: h('section', { class: 'diagnostics-section diagnostics-wide' }, h('h3', {}, '绘制细分（CPU）'),
    h('p', { class: 'diagnostics-hint' }, '平均 / P95 / 最大值；耗时单位 ms，调用项单位次。计时包含诊断自身开销，不是 GPU 时间。总段从场景准备到绘制返回；外层帧阶段的渲染提交还含包装安装 / 清理和记录开销。总段包含筛选和绘制；批次重建属于筛选，阴影属于 renderer；renderer 统计主场景和后处理提交，各行不能相加。'),
    h('p', { class: 'diagnostics-hint' }, '所有绘制分组取最近 3600 样本，仅成功帧参与耗时统计。无后处理或不适用项显示未采样；已观察但没有执行显示 0。RenderPass 属于主场景绘制。阴影是否刷新由实际 clear / 提交判断；clear 是调用次数，不能当作帧数或光源数。嵌套同类耗时只计最外层。'),
    h('p', { class: 'diagnostics-hint' }, '比较瓶颈时看主场景扣除阴影、主场景实际阴影、额外后处理三项。主场景扣除阴影仍含遍历、剔除和材质准备等工作，不是纯模型或 GPU 时间。'), list),
    render(draw) {
      const signature = JSON.stringify(draw || null); if (signature === previous) return; previous = signature;
      const rows = [];
      for (const [group, names] of Object.entries(groups)) for (const [key, label] of Object.entries(names)) rows.push(h('div', {}, h('dt', {}, label), h('dd', {}, metric(draw?.[group]?.[key], group === 'counts'))));
      for (const [key, label] of [['refreshed', '阴影刷新帧'], ['skipped', '阴影未刷新帧'], ['unknown', '阴影状态未知帧']]) {
        const data = draw?.shadow?.[key]; rows.push(h('div', {}, h('dt', {}, label), h('dd', {}, `${valueText(data?.frames)} 帧 · 绘制总段 ${metric(data?.totalMs)}`)));
      }
      list.replaceChildren(...rows);
    } };
}

// 仅消费诊断器提供的脱敏快照；不导入存档、账号或引擎，也不提供状态修改命令。
export function diagnosticsPanel(ui) {
  let closed = false, timer = null, downloadUrl = null, downloadLink = null;
  const status = h('p', { class: 'diagnostics-status', role: 'status', 'aria-live': 'polite', 'data-diagnostics-status': '' });
  const notice = h('p', { class: 'diagnostics-notice', role: 'status', 'aria-live': 'polite', 'data-diagnostics-notice': '' });
  const notify = (text, error = false) => { notice.textContent = text; notice.setAttribute('role', error ? 'alert' : 'status'); };
  const overview = fieldGroup('运行概况', ['version', 'build', 'platform', 'scene', 'zone', 'viewport', 'renderPixels', 'pixelRatio', 'quality', 'frameReason', 'modalOpen', 'hidden'], 'overview');
  const performance = fieldGroup('性能采样', ['fps', 'frameP95Ms', 'cpuP95Ms', 'slowFrames', 'drawCalls', 'triangles', 'geometries', 'textures', 'targetFps', 'activeFrameLimit'], 'performance');
  const draw = drawGroup(), drawFrames = fieldGroup('绘制记录范围', ['sampledFrames', 'completedFrames', 'failedFrames', 'directFrames', 'postFrames'], 'draw-frames');
  const save = fieldGroup('本机保存状态', ['mode', 'slot', 'status', 'pending', 'lastSavedAt', 'bytes'], 'save');
  const sync = fieldGroup('云同步状态', ['status', 'revision', 'pending', 'lastSyncAt', 'conflict'], 'sync');
  const events = eventGroup('最近操作与书签', 'events', '还没有记录操作。开始记录后可标记问题出现的时刻。');
  const errors = eventGroup('最近错误', 'errors', '当前没有记录到错误；这不代表所有功能已经验收。');
  const moduleList = h('dl', { class: 'diagnostics-fields diagnostics-modules', 'data-diagnostics-section': 'modules' });
  const reportText = h('textarea', { readonly: true, rows: 8, 'aria-label': '脱敏诊断 JSON，可全选复制', 'data-diagnostics-text': '',
    onkeydown: event => { if (event.code !== 'Escape') event.stopPropagation(); } });
  const reportBlock = h('div', { class: 'diagnostics-report', hidden: true }, h('p', {}, '这是点击时的报告快照。可全选复制，记录更新后重新点击“显示报告文本”。'), reportText);
  const reportJSON = () => JSON.stringify(diagnostics.report(), null, 2);
  const showText = text => {
    reportText.value = text; reportBlock.hidden = false;
    reportText.focus({ preventScroll: true }); reportText.select();
    reportText.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const recording = h('button', { class: 'btn sm', type: 'button', 'data-diagnostics-action': 'record', onclick: () => {
    try {
      if (diagnostics.snapshot().recording) { diagnostics.stop(); notify('本次记录已结束，可以显示或导出报告。'); }
      else { diagnostics.start(60); notify('已开始记录 60 秒。关闭面板后可正常游玩，记录会继续。'); }
      render();
    } catch { notify('暂时无法切换记录状态，请关闭面板后重试。', true); }
  } }, '开始记录 60 秒');
  const bookmark = h('button', { class: 'btn alt sm', type: 'button', 'data-diagnostics-action': 'mark', onclick: () => {
    try { diagnostics.mark(); render(); notify('已标记这个时刻，可与问题出现的时间对照。'); }
    catch { notify('暂时无法添加书签，请稍后重试。', true); }
  } }, '标记问题时刻');
  const show = h('button', { class: 'btn alt sm', type: 'button', 'data-diagnostics-action': 'show', onclick: () => {
    try { showText(reportJSON()); notify('已显示脱敏报告，可使用系统复制功能。'); }
    catch { notify('暂时无法生成报告，请稍后重试。', true); }
  } }, '显示报告文本');
  const download = h('button', { class: 'btn alt sm', type: 'button', 'data-diagnostics-action': 'export', onclick: () => {
    try {
      const text = reportJSON(), filename = '暖暖小镇-诊断-' + Date.now() + '.json';
      if (typeof globalThis.NikkiNative?.saveText === 'function') {
        let saved = false;
        try { saved = globalThis.NikkiNative.saveText(filename, text) === true; } catch { /* 下方提供文本回退 */ }
        if (saved) notify('诊断文件已保存到设备的“下载”目录。');
        else { showText(text); notify('文件未保存到设备，已显示完整报告供手动复制。', true); }
        return;
      }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadLink?.remove();
      downloadUrl = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      downloadLink = h('a', { href: downloadUrl, download: filename, hidden: true });
      document.body.append(downloadLink); downloadLink.click();
      notify('已发起诊断文件下载；如未出现下载，可点击“显示报告文本”复制。');
    } catch { notify('暂时无法导出，可尝试显示报告文本。', true); }
  } }, '导出脱敏 JSON');
  const body = h('div', { class: 'diagnostics-panel', 'data-diagnostics-panel': '' },
    h('h2', {}, '运行诊断'),
    h('p', { class: 'diagnostics-intro' }, '只读查看运行情况。不修改存档，不上传数据；报告不包含完整存档或账号令牌。'),
    status, h('div', { class: 'diagnostics-actions' }, recording, bookmark, show, download), notice,
    h('p', { class: 'diagnostics-hint' }, '打开面板会进入游戏原有的菜单状态。排查游玩掉帧时，请开始记录后关闭面板；主线程耗时不等于 GPU 耗时，资源数量不等于显存大小，报告不测温。'),
    h('div', { class: 'diagnostics-grid' }, overview.node, performance.node,
      h('section', { class: 'diagnostics-section diagnostics-wide' }, h('h3', {}, '帧阶段耗时'),
        h('p', { class: 'diagnostics-hint' }, '每项显示平均 / P95 / 最大值（ms）与样本数；仅在记录期间采样。'), moduleList),
      drawFrames.node, draw.node, save.node, sync.node, events.node, errors.node),
    h('p', { class: 'diagnostics-hint' }, '保存时间与大小仅表示本次观察到的保存；缺少记录时显示“未采样”。关闭游戏或刷新页面后，本机诊断记录不会保留。'), reportBlock);
  let moduleSignature = '';
  function render() {
    if (closed) return;
    try {
      const snapshot = diagnostics.snapshot();
      status.textContent = snapshot.recording ? `记录中 · 约剩 ${Math.max(0, Math.ceil(Number(snapshot.remainingSeconds) || 0))} 秒` : '未在记录 · 显示最近记录快照（如有）';
      recording.textContent = snapshot.recording ? '结束记录' : '开始记录 60 秒';
      recording.setAttribute('aria-pressed', String(!!snapshot.recording)); bookmark.disabled = !snapshot.recording;
      overview.render(snapshot.overview); performance.render(snapshot.performance); save.render(snapshot.save); sync.render(snapshot.sync);
      drawFrames.render(snapshot.performance?.draw); draw.render(snapshot.performance?.draw);
      events.render(snapshot.events); errors.render(snapshot.errors);
      const modules = Object.entries(snapshot.performance?.modules || {}), signature = JSON.stringify(modules);
      if (moduleSignature !== signature || !moduleList.childElementCount) {
        moduleSignature = signature;
        moduleList.replaceChildren(...(modules.length ? modules.map(([name, metrics]) => h('div', {},
          h('dt', {}, names[name] || name), h('dd', {}, `${valueText(metrics.averageMs)} / ${valueText(metrics.p95Ms)} / ${valueText(metrics.maxMs)} · ${valueText(metrics.samples)} 个样本`)))
          : [h('div', {}, h('dt', {}, '帧阶段'), h('dd', {}, '未采样'))]));
      }
    } catch { status.textContent = '暂时无法读取诊断概况，可关闭后重试。'; }
  }
  const panel = ui.modal(body, { ribbon: '本机 · 只读', cls: 'live-modal diagnostics-modal', skipTutorial: true, onClose: () => {
    closed = true; clearInterval(timer);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadLink?.remove();
  } });
  render();
  timer = setInterval(render, 1000);
  return panel;
}
