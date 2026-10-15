// 手动文件迁移：只有确认导入/恢复才替换进度；预览期间保持当前游戏不变。
import { S, exportSaveFile, previewSaveImport, importSaveFile, importRecoveryInfo, restoreBeforeImport, MAX_SAVE_BYTES } from '../core/state.js';
import { HOUSES, YARDS, SHOPS } from '../data.js';
import { gameDate } from '../core/gametime.js';
import { h, fmt } from '../core/util.js';

const timeText = (iso) => iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '时间未记录';
const row = (...children) => h('div', { style: { display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'center' } }, ...children);
function summaryCard(summary, title) {
  const values = [
    ['噗灵', fmt(summary.coins)], ['小镇日期', gameDate(summary.gday).key],
    ['房屋', HOUSES[summary.house - 1].name], ['后院', YARDS[summary.yardLv - 1].name],
  ];
  for (const [id, shop] of Object.entries(summary.shops)) values.push([SHOPS[id]?.name || (id === 'bakery' ? '麦香面包房' : id), `Lv.${shop.lv} · 已过 ${shop.stage || 0} 关`]);
  return h('section', { class: 'save-summary', style: { padding: '.8rem', background: '#fff7f1', borderRadius: '14px', minWidth: '0' } },
    h('h3', { style: { margin: '0 0 .6rem' } }, title),
    h('dl', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.35rem .7rem', margin: '0', fontSize: '.9rem', overflowWrap: 'anywhere' } },
      values.flatMap(([label, value]) => [h('dt', {}, label), h('dd', { style: { margin: '0', textAlign: 'right' } }, value)])));
}

export function saveTransferPanel(ui) {
  let pending = null, serial = 0, closed = false, working = false, downloadUrl = '';
  const status = h('p', { class: 'fine save-transfer-status', role: 'status', 'aria-live': 'polite', style: { margin: '0', minHeight: '1.4em', overflowWrap: 'anywhere' } });
  const preview = h('div', { class: 'save-transfer-preview', style: { display: 'grid', gap: '.7rem' } });
  const recover = importRecoveryInfo();
  const commit = h('button', { class: 'btn', disabled: true, 'data-save-action': 'import', onclick: () => {
    if (working || !pending) return;
    working = true; commit.disabled = choose.disabled = true;
    const result = importSaveFile(pending.text);
    if (!result.ok) { working = false; commit.disabled = choose.disabled = false; showStatus(result.error, true); return; }
    showStatus('导入成功，正在打开这份存档…');
    location.reload();
  } }, '导入这份存档并刷新');
  const showStatus = (text, bad = false) => {
    status.textContent = text;
    status.setAttribute('role', bad ? 'alert' : 'status');
    status.style.color = bad ? '#a52e42' : '';
  };
  const clearPreview = () => { pending = null; commit.disabled = true; preview.replaceChildren(); return ++serial; };
  const showPreview = (text, source) => {
    const detail = previewSaveImport(text);
    pending = { text, detail };
    preview.replaceChildren(summaryCard(detail.summary, '将要导入的进度'),
      h('p', { class: 'fine', style: { margin: '0', overflowWrap: 'anywhere' } }, `${source} · ${timeText(detail.exportedAt)}${detail.migrated ? ' · 旧版存档会自动迁移' : ''}`),
      h('p', { style: { margin: '0', fontSize: '.9rem' } }, `当前有 ${fmt(S.coins)} 噗灵。确认后会替换当前进度，并先留存一份独立的「导入前恢复点」。`));
    commit.disabled = false;
    showStatus('检查通过。请核对上面的进度，再决定是否导入。');
    preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  // TXT 是带有 JSON 内容的 UTF-8 纯文本，方便在手机文件管理器、聊天软件和记事本之间迁移；
  // 同时保留 .json 选择，兼容旧版本已经导出的存档。部分旧 Android WebView 没有 File.text，
  // 这里用 FileReader 回退，避免“选择了文件但没有任何预览”的静默失败。
  const readFileText = (file) => {
    if (typeof file?.text === 'function') return file.text();
    if (typeof FileReader === 'undefined') return Promise.reject(new Error('当前设备无法读取文本文件，请升级系统 WebView 后重试。'));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('文件读取失败，请重新选择导出的存档 TXT。'));
      reader.readAsText(file, 'utf-8');
    });
  };
  const input = h('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', 'aria-label': '选择暖暖小镇存档 TXT 或 JSON 文件', 'data-save-file': '', style: { display: 'none' }, onchange: async () => {
    const file = input.files?.[0], token = clearPreview();
    input.value = '';
    if (!file) { showStatus('没有选择文件，当前进度未改变。'); return; }
    if (file.size > MAX_SAVE_BYTES) { showStatus('文件超过 2 MB，未读取。请选择暖暖小镇导出的 TXT 或 JSON 存档。', true); return; }
    showStatus('正在检查文件…');
    try {
      const text = await readFileText(file);
      if (closed || token !== serial) return;
      showPreview(text, `文件：${file.name}`);
    } catch (error) { if (!closed && token === serial) showStatus(error.message || '文件读取失败，当前进度未改变。', true); }
  } });
  const choose = h('button', { class: 'btn alt', 'data-save-action': 'choose', onclick: () => input.click() }, '选择存档文件');
  const downloadFallback = h('a', { class: 'btn alt', 'data-save-action': 'download-fallback', target: '_blank', rel: 'noopener', style: { display: 'none', textDecoration: 'none' } }, '如果没有下载，点此保存');
  const download = h('button', { class: 'btn', 'data-save-action': 'export', onclick: () => {
    try {
      const out = exportSaveFile();
      const native = globalThis.NikkiNative;
      if (typeof native?.saveText === 'function') {
        try {
          if (native.saveText(out.filename, out.text)) {
            showStatus('已保存到设备的「下载」目录。');
            return;
          }
        } catch { /* 原生保存失败时显示文本迁移回退 */ }
        // Android 9 及以下没有公共 Downloads 的 MediaStore 写入路径；
        // 这时不能再把 Blob 回退当成成功，直接展开完整文本供系统剪贴板/手动复制。
        exportText.value = out.text;
        exportBlock.style.display = 'grid';
        textTransfer.open = true;
        showStatus('文件未保存到设备。已展开完整存档文本，请点击「复制存档文本」或手动全选复制。', true);
        return;
      }
      if (downloadUrl) { try { URL.revokeObjectURL(downloadUrl); } catch {} }
      downloadUrl = URL.createObjectURL(new Blob([out.text], { type: 'text/plain;charset=utf-8' }));
      downloadFallback.href = downloadUrl;
      downloadFallback.download = out.filename;
      downloadFallback.style.display = 'inline-flex';
      const url = downloadUrl;
      const link = h('a', { href: url, download: out.filename, style: { display: 'none' } });
      document.body.append(link); link.click();
      // 某些 Chromium/WebView 会在 click 返回后才读取 Blob URL；保留节点一帧，
      // 否则会出现按钮有反馈、但下载列表里没有文件的竞态。
      setTimeout(() => link.remove(), 1000);
      const desktop = /Electron/i.test(navigator.userAgent);
      showStatus(desktop
        ? '已发起存档文件下载，桌面版会保存到系统「下载」目录。'
        : '已发起存档文件下载；如果没有看到下载通知，请点旁边的「如果没有下载，点此保存」。');
    } catch (error) { showStatus(error.message || '暂时无法导出，请稍后重试。', true); }
  } }, '导出当前存档');
  const textStyle = { width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: '6rem', maxHeight: '12rem', padding: '.6rem', border: '1px solid #dcc6cf', borderRadius: '10px', background: '#fff', color: '#544654', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4', userSelect: 'text', WebkitUserSelect: 'text', WebkitTouchCallout: 'default', touchAction: 'auto' };
  // 文本编辑的 Ctrl+A、方向键等交给浏览器；避免被小镇移动快捷键消费。
  const textKey = e => { if (e.code !== 'Escape') e.stopPropagation(); };
  const exportText = h('textarea', { readonly: true, rows: 5, 'aria-label': '当前存档文本，可全选复制', 'data-save-text': 'export', style: textStyle, onkeydown: textKey });
  const copy = h('button', { class: 'btn alt', 'data-save-action': 'copy', onclick: async () => {
    exportText.focus(); exportText.select();
    try {
      const native = globalThis.NikkiNative;
      if (native?.copyText && native.copyText(exportText.value)) {
        if (!closed) showStatus('已复制存档文本，可在另一台设备粘贴导入。');
        return;
      }
    } catch { /* 继续使用浏览器剪贴板或手动复制 */ }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(exportText.value);
      if (!closed) showStatus('已复制存档文本，可在另一台设备粘贴导入。');
    } catch { if (!closed) showStatus('浏览器未允许复制。存档文本已全选，请使用系统的复制操作。'); }
  } }, '复制存档文本');
  const exportBlock = h('div', { style: { display: 'none', gap: '.5rem' } }, exportText, row(copy));
  const display = h('button', { class: 'btn alt', 'data-save-action': 'show-text', onclick: () => {
    try { exportText.value = exportSaveFile().text; exportBlock.style.display = 'grid'; showStatus('已显示当前存档文本。可复制全文，或在文本框中手动全选复制。'); }
    catch (error) { showStatus(error.message || '暂时无法生成存档文本。', true); }
  } }, '显示当前存档文本');
  const pasteText = h('textarea', { rows: 5, maxlength: MAX_SAVE_BYTES, placeholder: '在这里粘贴完整存档文本', 'aria-label': '粘贴要导入的存档文本', 'data-save-text': 'import', style: textStyle, onkeydown: textKey, oninput: () => {
    clearPreview(); showStatus('文本已变化。点击「检查粘贴的存档」重新预览。');
  } });
  const inspectText = h('button', { class: 'btn alt', 'data-save-action': 'preview-text', onclick: () => {
    if (working) return;
    clearPreview();
    if (!pasteText.value.trim()) {
      showStatus('请先粘贴完整存档文本，或点击「显示当前存档文本」后复制全文。', true);
      return;
    }
    try { showPreview(pasteText.value, '来源：粘贴的存档文本'); }
    catch (error) { showStatus(error.message || '文本读取失败，当前进度未改变。', true); }
  } }, '检查粘贴的存档');
  const textTransfer = h('details', { class: 'save-text-transfer', style: { minWidth: '0', border: '1px solid #eadce2', borderRadius: '12px', padding: '.7rem' } },
    h('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, '使用存档文本迁移'),
    h('div', { style: { display: 'grid', gap: '.65rem', paddingTop: '.7rem', minWidth: '0' } },
      h('p', { class: 'fine', style: { margin: '0' } }, '下载不方便时，可以复制全文到另一台设备。文本包含游戏进度，请自行妥善保存；游戏只在本机处理，不会自动读取剪贴板或上传。'),
      row(display), exportBlock,
      h('label', {}, '从另一台设备粘贴存档', pasteText), row(inspectText)));
  const recoverySection = h('section', { style: { borderTop: '1px solid #eadce2', paddingTop: '.8rem', display: 'grid', gap: '.7rem' } },
    h('h3', { style: { margin: '0' } }, '导入前恢复点'),
    recover && !recover.invalid ? summaryCard(recover, timeText(recover.at)) : h('p', { class: 'fine', style: { margin: '0' } }, recover?.invalid ? '恢复点无法读取，当前存档仍可正常导出。' : '首次导入成功后，这里会保留导入前的进度。'),
    recover && !recover.invalid && h('button', { class: 'btn alt', 'data-save-action': 'restore', onclick: async () => {
      if (working) return;
      if (!await ui.confirm('恢复导入前的进度', `回到 ${timeText(recover.at)} 的进度（${fmt(recover.coins)} 噗灵）。建议先导出当前进度。`, '恢复并刷新')) return;
      if (closed || working) return;
      working = true;
      const result = restoreBeforeImport();
      if (!result.ok) { working = false; showStatus(result.error, true); return; }
      location.reload();
    } }, '恢复导入前的进度'),
    h('p', { class: 'fine', style: { margin: '0' } }, '此恢复点不会被五分钟自动备份覆盖；下一次成功导入时才会换成新的导入前进度。'));
  const body = h('div', { class: 'save-transfer', style: { width: 'min(480px, 100%)', minWidth: '0', maxHeight: 'calc(90dvh - 4rem)', overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'thin', paddingRight: '.2rem', touchAction: 'pan-y', display: 'grid', gap: '.9rem' } },
    h('h2', { style: { margin: '0' } }, '存档迁移'),
    h('p', { class: 'fine', style: { margin: '0' } }, '把存档导出为 UTF-8 TXT 文件，再在另一台设备选择它导入。旧版 JSON 存档也可以继续导入。文件只保存在你选择的设备上，不会上传到服务器。'),
      row(download, choose, downloadFallback), input, textTransfer, status, preview, commit, recoverySection);
  const modal = ui.modal(body, { ribbon: '存档', onClose: () => { closed = true; serial++; if (downloadUrl) { try { URL.revokeObjectURL(downloadUrl); } catch {} downloadUrl = ''; } } });
  return modal;
}
