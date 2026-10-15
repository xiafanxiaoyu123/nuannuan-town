// 四季小聚的操作条：直接叠在 3D 舞台上，取代原来右侧的文字操作区。
// 按钮的编号和动作与各节日模块保持一致（规则仍在那些模块里），这里只决定摆哪些按钮、写哪句提示。
import * as spring from './festival-spring.js';
import * as summer from './festival-summer.js';
import * as harvest from './festival-harvest.js';

const SNOW_BALLS = [
  { id: 'large', name: '大雪球', target: 100, slot: 'bottom', label: '底座' },
  { id: 'medium', name: '中雪球', target: 72, slot: 'middle', label: '身体' },
  { id: 'small', name: '小雪球', target: 44, slot: 'head', label: '头部' },
];
const SNOW_OPTIONS = [
  ['scarf', '围巾', { rose: '玫红', blue: '晴蓝' }],
  ['hat', '帽子', { knit: '绒球帽', bucket: '小桶帽', none: '不戴' }],
  ['face', '表情', { smile: '笑脸', wink: '眨眼', sleepy: '眯眼' }],
  ['name', '名字', { nuantuan: '暖团', xiaodong: '小冬', xuemian: '雪绵', qingqing: '晴晴' }],
];
const PAD = { left: '左鼓', right: '右鼓', any: '任一面鼓' };

export function festivalHud(kind, s, { h, button, config }) {
  const say = [], info = [], rows = [];
  const row = (...kids) => rows.push(h('div', { class: 'fh-row' }, ...kids.flat().filter(Boolean)));
  const chip = (text, ok) => info.push(h('span', { class: 'fh-chip' + (ok === true ? ' ok' : ok === false ? ' no' : '') }, text));
  const on = (active) => 'btn alt sm' + (active ? ' fa-choice-on' : '');

  if (kind === 'sakura') {
    const count = s.phase === 0 ? s.pattern.length : s.phase === 1 ? s.memoryPattern.length : 8;
    say.push(s.message || (s.phase === 0 ? '小桃：“从左往右，照着花架上的花样先编五枝。”' : s.phase === 1 ? '小桃：“这次多一枝。先看清花架上的花样，记不住也没关系。”' : '小桃：“第三圈没有标准答案，选八枝你喜欢的花材。”'));
    chip(`第 ${s.phase + 1} 圈 · ${config.steps[s.phase]}`); chip(`${s.flowers.length} / ${count} 枝`, s.flowers.length === count ? true : undefined);
    if (s.phase === 1 && !s.memoryStarted) row(button('收起花样，开始编', 'spring-memory-start', { type: 'memory-start' }, { class: 'btn' }));
    else row(Object.entries(spring.FLOWERS).map(([id, f]) => button([h('i', { class: 'fh-dot', style: { background: f.color } }), f.name], 'spring-flower-' + id, { type: 'flower', id }, { disabled: s.flowers.length >= count, 'aria-label': '编入一枝' + f.name })));
    row(button('撤回上一枝', 'spring-undo', { type: 'undo' }, { disabled: !s.flowers.length }),
      button(s.phase === 2 ? '设计小提示' : s.phase === 1 ? (s.hintOpen ? '收起花样' : '看看花样') : '编花提示', 'spring-hint', { type: 'hint' }, s.phase === 1 ? { 'aria-pressed': String(s.hintOpen) } : {}));
    if (s.phase === 2) {
      row(h('em', {}, '缎带'), Object.entries(spring.RIBBONS).map(([id, r]) => button([h('i', { class: 'fh-dot', style: { background: r.color } }), r.name.replace('缎带', '')], 'spring-ribbon-' + id, { type: 'ribbon', id }, { 'aria-pressed': String(s.ribbon === id), class: on(s.ribbon === id) })));
      row(h('em', {}, '送给'), Object.entries(spring.RECIPIENTS).map(([id, r]) => button(r.name.replace('送给', '').replace('留给', ''), 'spring-recipient-' + id, { type: 'recipient', id }, { 'aria-pressed': String(s.recipient === id), class: on(s.recipient === id) })));
      row(button('系好缎带，送出心意', 'spring-finish', { type: 'finish' }, { class: 'btn', disabled: s.flowers.length !== 8 || !s.ribbon || !s.recipient }));
    } else if (s.ready) row(button(s.phase === 0 ? '下一步 · 记一记花样' : '下一步 · 自己设计', 'spring-next', { type: 'next' }, { class: 'btn' }));
  }

  if (kind === 'summer') {
    const target = summer.phrase(s), expected = target[s.phraseIndex];
    say.push(s.message || '七弦：“看光点走进金色那一段，再落槌。”');
    chip(`第 ${s.phase + 1} 段 · ${config.steps[s.phase]}`); chip(`本段 ${s.phraseIndex} / ${target.length} 拍`); chip(`合奏 ${s.hits} / 12`); chip(`连击 ${s.streak}`);
    if (s.ready) row(button(`继续 · ${config.steps[s.phase + 1]}`, 'next', { type: 'next' }, { class: 'btn' }));
    else {
      if (s.playing) chip(`下一拍：${PAD[expected]}`, true);
      row(['left', 'right'].map((pad) => button([h('b', {}, pad === 'left' ? '咚' : '咚♪'), ' ', PAD[pad], h('small', {}, pad === 'left' ? ' F' : ' J')], 'drum-' + pad, { type: 'beat', pad },
        { class: 'btn fh-drum ' + pad + (s.playing && (expected === pad || expected === 'any') ? ' suggested' : ''), disabled: !s.playing, 'aria-label': PAD[pad] })));
      row(s.playing ? button('歇一小会儿', 'pause', { type: 'pause' }) : button(s.paused ? '继续这一小段' : '开始听拍', 'start', { type: 'start' }, { class: 'btn' }));
    }
  }

  if (kind === 'harvest') {
    const order = s.orders[s.phase], r = harvest.assess(order, s.basket), ING = harvest.HARVEST_INGREDIENTS;
    say.push(s.ready ? order.thanks : s.message || order.name + '：' + order.request);
    chip(`${order.name}的${order.dish}`); chip(`${r.weight} / ${order.target} 份重量`, r.weight === order.target ? true : undefined);
    for (const [id, n] of Object.entries(order.minimum)) chip(`至少 ${n} ${ING[id].unit}${ING[id].name}`, r.counts[id] >= n);
    for (const id of order.forbidden) chip('不放' + ING[id].name, r.counts[id] === 0);
    if (s.hintOpen) { const c = harvest.solutions(order)[0] || [], cnt = {}; for (const id of c) cnt[id] = (cnt[id] || 0) + 1; chip('可以试试：' + Object.entries(cnt).map(([id, n]) => `${n}${ING[id].unit}${ING[id].name}`).join('、')); }
    row(Object.entries(harvest.BASKET_WEIGHTS).map(([id, w]) => button(`${ING[id].symbol} ${ING[id].name} +${w}`, 'harvest-add-' + id, { type: 'basket', id }, { disabled: s.basket.length >= 12 })));
    if (s.basket.length) row(h('em', {}, '取回'), s.basket.map((id, index) => button(ING[id].symbol + ' −', 'harvest-remove-' + index, { type: 'remove', index }, { class: 'btn alt sm fh-mini', 'aria-label': '取回这' + ING[id].unit + ING[id].name })));
    row(button('撤回最后一份', 'harvest-undo', { type: 'undo' }, { disabled: !s.basket.length }), button(s.hintOpen ? '收起提示' : '看看一种配法', 'harvest-hint', { type: 'hint' }, { 'aria-pressed': String(s.hintOpen) }),
      s.ready ? button(s.phase === 2 ? '交给七弦 · 一起入席' : '交给' + order.name + ' · 下一篮', 'harvest-next', { type: 'next' }, { class: 'btn' })
        : button('称一称', 'harvest-weigh', { type: 'weigh' }, { class: 'btn', disabled: !s.basket.length }));
  }

  if (kind === 'snow') {
    say.push(s.message);
    const allReady = SNOW_BALLS.every((b) => s.balls[b.id].ready), placed = Object.values(s.stack);
    if (s.phase === 0) {
      const b = SNOW_BALLS.find((x) => x.id === s.rolling), ball = s.balls[b.id], near = Math.abs(ball.size - b.target) <= 4;
      chip(`${b.name}：${ball.size} / ${b.target}`, near); chip(`做好 ${SNOW_BALLS.filter((x) => s.balls[x.id].ready).length} / 3 团`);
      row(SNOW_BALLS.map((x) => button(`${x.name}${s.balls[x.id].ready ? ' ✓' : ''}`, 'snow-ball-' + x.id, { type: 'chooseBall', id: x.id }, { class: on(s.rolling === x.id), 'aria-pressed': String(s.rolling === x.id) })));
      row(button('大步滚 +12', 'snow-roll', { type: 'roll' }, { disabled: ball.ready || ball.size >= 124 }), button('轻滚 +4', 'snow-gentle', { type: 'gentle' }, { disabled: ball.ready || ball.size >= 124 }), button('修整 −4', 'snow-trim', { type: 'trim' }, { disabled: ball.ready || ball.size <= 8 }));
      row(ball.ready ? button('重新修整这团', 'snow-edit-ball', { type: 'editBall', id: b.id }) : button('这团做好了', 'snow-finish-ball', { type: 'finishBall' }, { disabled: !near, class: 'btn' }),
        button('开始搭建 →', 'snow-next', { type: 'next' }, { disabled: !allReady, class: 'btn' }));
    } else if (s.phase === 1) {
      const next = SNOW_BALLS.find((b) => !s.stack[b.slot]);
      chip(next ? `下一层：${next.label} · 要${next.name}` : '三层都站稳了', !next ? true : undefined);
      chip(!s.selected ? '先拿一团雪' : s.offset === 0 ? '已居中，可以放稳' : `${s.offset < 0 ? '左' : '右'}偏 ${Math.abs(s.offset)} 步`, s.selected ? s.offset === 0 : undefined);
      row(SNOW_BALLS.map((x) => button(`拿${x.name}${placed.includes(x.id) ? ' ✓' : ''}`, 'snow-pick-' + x.id, { type: 'pick', id: x.id }, { disabled: placed.includes(x.id), class: on(s.selected === x.id), 'aria-pressed': String(s.selected === x.id) })));
      row(button('← 左移', 'snow-left', { type: 'nudge', dir: -1 }, { disabled: !s.selected || s.offset <= -3 }), button('轻轻放稳', 'snow-place', { type: 'place' }, { disabled: !s.selected, class: 'btn' }), button('右移 →', 'snow-right', { type: 'nudge', dir: 1 }, { disabled: !s.selected || s.offset >= 3 }));
      row(button('← 回去滚雪球', 'snow-back', { type: 'back' }), button('取下最上层', 'snow-unstack', { type: 'unstack' }, { disabled: !placed.some(Boolean) }), button('去挑装扮 →', 'snow-next', { type: 'next' }, { disabled: !!next, class: 'btn' }));
    } else {
      const dressed = SNOW_OPTIONS.every(([type, , choices]) => Object.hasOwn(choices, s[type]));
      for (const [type, title, choices] of SNOW_OPTIONS) row(h('em', {}, title), Object.entries(choices).map(([id, text]) => button(text, `snow-${type}-${id}`, { type, id }, { class: on(s[type] === id), 'aria-pressed': String(s[type] === id) })));
      row(button('← 回去扶正', 'snow-back', { type: 'back' }), button('合照留念 · 完成', 'snow-photo', { type: 'photo' }, { disabled: !dressed, class: 'btn' }));
    }
  }
  return h('div', { class: 'fa-hud fa-stage', 'data-hud': kind },
    h('div', { class: 'fh-top' }, h('p', { class: 'fh-say fa-message', role: 'status', 'aria-live': 'polite' }, say[0] || ''), h('div', { class: 'fh-info' }, info)),
    h('div', { class: 'fh-bar' }, rows));
}

export const HUD_CSS = `
  .festival-activity.has3d.playing{display:block;padding:10px;overflow:hidden}
  .festival-activity.has3d.playing>.fa-3d{position:relative;height:min(calc(100dvh - 96px),700px);margin:0}
  .modal.festival-modal:has(.playing){width:min(1180px,calc(100vw - 28px));max-width:none}
  .fa-3d .fa-head{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:8px;padding:10px 60px 0 12px;pointer-events:none;z-index:3}
  .fa-3d .fa-head b{font-family:var(--font-d);font-weight:400;font-size:19px;color:#5b4252;background:rgba(255,250,245,.9);padding:5px 14px;border-radius:99px;box-shadow:0 2px 8px rgba(120,70,95,.15)}
  .fa-3d .fa-head b{white-space:nowrap}
  .fa-3d .fa-head button{pointer-events:auto;min-height:44px!important;padding:0 12px;font-size:12px;white-space:nowrap!important;flex:none}
  .fa-hud{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none;padding:62px 10px 10px;background:none!important;border:0!important;min-height:0!important;margin:0!important;text-align:left;z-index:2}
  .fh-top{display:grid;gap:6px;justify-items:start;max-width:min(560px,100%)}
  .fh-say{margin:0!important;min-height:0!important;padding:8px 14px;border-radius:16px;background:rgba(255,250,245,.93);box-shadow:0 2px 10px rgba(120,70,95,.16);font-size:13.5px;line-height:1.55;color:#6b4f5e;font-weight:600}
  .fh-info{display:flex;flex-wrap:wrap;gap:5px}
  .fh-chip{padding:3px 10px;border-radius:99px;background:rgba(60,45,55,.62);color:#fff;font-size:12px;font-weight:700;white-space:nowrap}
  .fh-chip.ok{background:#4fb783}.fh-chip.no{background:rgba(60,45,55,.62);box-shadow:inset 0 0 0 2px #ffd76a}
  .fh-bar{pointer-events:auto;display:grid;gap:6px;padding:10px;border-radius:18px;background:rgba(255,250,245,.9);box-shadow:0 4px 16px rgba(120,70,95,.2);max-height:52%;overflow-y:auto;overscroll-behavior:contain;justify-self:center;align-self:center;width:min(720px,100%);box-sizing:border-box}
  .fh-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center}
  .fh-row em{font-style:normal;font-size:12px;font-weight:700;color:#a67c7c;min-width:2.4em;text-align:right}
  .fh-row button{flex:1 1 86px;min-height:44px!important;max-width:220px}
  .fh-row .fh-mini{flex:0 0 auto;min-width:48px;padding:0 8px}
  .fh-dot{display:inline-block;width:14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 2px #fff,0 0 0 1px rgba(0,0,0,.12);margin-right:5px;vertical-align:-2px}
  .fh-drum{min-height:56px!important;font-size:16px}.fh-drum.left{background:linear-gradient(180deg,#ffb3a6,#e9705f);color:#fff}.fh-drum.right{background:linear-gradient(180deg,#a9d0f7,#5f9be0);color:#fff}
  .fh-drum.suggested{box-shadow:0 0 0 4px #ffe27a,0 4px 0 rgba(0,0,0,.12)}.fh-drum[disabled]{filter:grayscale(.6) opacity(.6)}.fh-drum small{opacity:.8;font-size:11px}
  .fa-3d .fa-done{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:min(620px,calc(100% - 24px));max-height:56%;overflow-y:auto;box-sizing:border-box;margin:0;background:rgba(255,250,245,.95);box-shadow:0 6px 20px rgba(120,70,95,.22);z-index:3}
  @media(max-height:500px){.festival-activity.has3d.playing>.fa-3d{height:calc(100dvh - 70px)}.fa-hud{padding-top:58px}.fh-say{font-size:12px;padding:5px 10px}.fh-bar{padding:6px;max-height:58%}.fh-row button{min-height:44px!important}}
  /* 手机横屏：画面矮，按钮栏改到右侧竖着放，场景留在左边 */
  @media(max-height:500px) and (orientation:landscape){.fa-hud{flex-direction:row;align-items:stretch;gap:8px}.fh-top{flex:1 1 0;align-content:start;min-width:0}.fh-bar{flex:0 0 44%;width:auto;max-height:none;align-self:stretch;align-content:center;margin-top:-48px}.fh-row button{flex-basis:70px;font-size:13px}.fa-3d .fa-head{padding-right:46%}.fa-3d .fa-done{left:auto;right:10px;transform:none;width:46%;max-height:calc(100% - 24px)}}
  @media(max-aspect-ratio:1/1){.fa-3d .fa-head{padding:8px 8px 0;gap:5px}.fa-3d .fa-head b{font-size:15px;padding:4px 10px}.fa-3d .fa-head button{padding:0 9px;font-size:11px}.festival-activity.has3d.playing>.fa-3d{height:calc(100dvh - 110px)}.fh-bar{max-height:48%}.fh-row button{flex-basis:72px;font-size:13px}}
`;
