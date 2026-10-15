import { h, fmt } from '../core/util.js';
import { bus } from '../core/state.js';

// 两个区域各有三个方案槽；文字用 DOM textContent，方案名称不会被当作 HTML。
export function decorPlansPanel(ui, decor) {
  if (!decor.active || decor.town.zone !== decor.cfg.key) return ui.toast('请先在自己的小屋或后院开启装修');
  decor.finishStroke();
  let selected = -1, modal;
  const body = h('div', { class: 'decor-plans', style: { width: 'min(560px, 76vw)', maxWidth: '100%', maxHeight: 'calc(100dvh - 6rem)', overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: '4px', boxSizing: 'border-box' } });
  const status = (result) => { if (!result.ok) ui.toast(result.error, { kind: 'warn' }); return result.ok; };
  const render = () => {
    const slots = decor.layoutSlots();
    body.replaceChildren(h('h2', {}, (decor.cfg.key === 'house' ? '小屋' : decor.cfg.freeBuild ? '海风工坊岛' : '后院') + '的装修方案'),
      h('p', { style: { lineHeight: 1.7, fontSize: '13px' } }, '这里可以保存 3 套布局。应用时只用本区域和仓库里已有的家具，多余家具收回仓库；缺少家具不会自动购买。有作物的田必须留在原处。'));
    for (let slot = 0; slot < 3; slot++) {
      const plan = slots[slot];
      const input = h('input', { type: 'text', maxLength: 20, value: plan?.name || '方案 ' + (slot + 1), 'aria-label': '方案 ' + (slot + 1) + ' 名称', style: { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', borderRadius: '8px', border: '1px solid #e7c7d1', font: 'inherit' } });
      const card = h('section', { 'data-plan-slot': slot, style: { padding: '12px', margin: '10px 0', background: selected === slot ? '#fff0f5' : '#fffaf3', border: '1px solid #edd4d9', borderRadius: '12px' } },
        input, h('p', { style: { fontSize: '12px', margin: '8px 0' } }, plan ? plan.placed.length + ' 件家具 · ' + Object.keys(plan.floor).length + ' 格地板'+(decor.cfg.key==='house'?' · '+(plan.walls?.length||0)+' 段隔断':'') : '尚未保存'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          h('button', { class: 'btn sm', 'data-plan-save': slot, onclick: () => { if (status(decor.saveLayout(slot, input.value))) { selected = slot; render(); ui.toast('当前布局已保存'); } } }, '保存当前'),
          h('button', { class: 'btn alt sm', disabled: !plan, 'data-plan-preview': slot, onclick: () => { selected = slot; render(); body.querySelector('.decor-plan-preview')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } }, '预览方案'),
          h('button', { class: 'btn alt sm', disabled: !plan, 'data-plan-delete': slot, onclick: async () => { if (await ui.confirm('删除方案', '只删除这个方案记录，房间里的家具保持原样。', '删除方案')) { decor.deleteLayout(slot); if (selected === slot) selected = -1; render(); } } }, '删除')));
      body.append(card);
    }
    if (selected >= 0 && slots[selected]) {
      const result = decor.previewLayout(selected);
      body.append(h('section', { class: 'decor-plan-preview', style: { padding: '12px', background: '#f4f8f2', borderRadius: '12px', lineHeight: 1.7 } },
        h('b', {}, '应用「' + slots[selected].name + '」'),
        h('p', {}, '家具 ' + (result.furnitureCount || 0) + ' 件 · 缺少 ' + (result.missingCount || 0) + ' 件 · 铺地费用 ' + fmt(result.cost || 0) + ' 噗灵'+(decor.cfg.key==='house'?' · 隔断将替换为 '+(result.wallCount||0)+' 段':'')),
        h('p', { role: 'status', style: { color: result.ok ? '#537853' : '#ae4c65', fontSize: '13px' } }, result.ok ? '已有家具足够。应用后可用装修撤销恢复。' : result.error),
        h('button', { class: 'btn', 'data-plan-apply': selected, disabled: !result.ok, onclick: () => { if (status(decor.applyLayout(selected))) { modal.close(true); ui.toast('已应用方案；需要恢复时点“撤销”'); } } }, '应用方案')));
    }
  };
  render();
  const off = bus.on('zoneChanged', () => { if (decor.town.zone !== decor.cfg.key) modal?.close(true); });
  modal = ui.modal(body, { ribbon: '装修方案', onClose: () => off?.() });
  return modal;
}
