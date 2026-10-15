// 冬日小聚：本地状态与无计时器 DOM。不会读取或改动金币、背包、存档。
export const config = {
  title: '初雪雪人工坊', host: '诺诺伊', scene: '雪人工坊与冬日礼物角',
  intro: '诺诺伊在工坊门口留了三团松雪：“今天一起做一位新邻居吧。先滚出大小不同的雪球，再扶稳身体，最后由你决定它的模样。”',
  instruction: '滚好三团雪，逐层扶正，再为雪人挑选装扮和名字。大约 1—3 分钟，没有倒计时；随时可以回到上一步。',
  steps: ['滚出三团雪', '扶稳并搭建', '装扮与合照'],
  done: '诺诺伊扶着雪人的围巾：“名字和笑脸都有了，它就是今天刚搬来的新邻居。我们一起留下这张冬日纪念吧。”',
};

const BALLS = [
  { id: 'large', name: '大雪球', target: 100, slot: 'bottom', label: '底座', width: 144 },
  { id: 'medium', name: '中雪球', target: 72, slot: 'middle', label: '身体', width: 110 },
  { id: 'small', name: '小雪球', target: 44, slot: 'head', label: '头部', width: 78 },
];
const SCARVES = { rose: '玫红围巾', blue: '晴蓝围巾' };
const HATS = { knit: '绒球帽', bucket: '小桶帽', none: '露出雪脑袋' };
const FACES = { smile: '弯弯笑脸', wink: '俏皮眨眼', sleepy: '安静眯眼' };
const NAMES = { nuantuan: '暖团', xiaodong: '小冬', xuemian: '雪绵', qingqing: '晴晴' };
const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
const definition = id => BALLS.find(b => b.id === id);
const ready = s => BALLS.every(b => s.balls[b.id].ready);
const nextBall = s => BALLS.find(b => !s.stack[b.slot]);
const stacked = s => !nextBall(s);
const dressed = s => own(SCARVES, s.scarf) && own(HATS, s.hat) && own(FACES, s.face) && own(NAMES, s.name);
const nearSize = (s, b) => Math.abs(s.balls[b.id].size - b.target) <= 4;
const tell = (s, message, accepted = false) => { s.message = '诺诺伊：' + message; return accepted; };

export function create(seed = 0) {
  const safeSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 0;
  return {
    kind: 'snow', done: false, phase: 0, seed: safeSeed, rolling: 'large', selected: null, offset: 0,
    balls: Object.fromEntries(BALLS.map(b => [b.id, { size: 8, ready: false }])),
    stack: { bottom: null, middle: null, head: null }, scarf: null, hat: null, face: null, name: null,
    message: '诺诺伊：先把大雪球滚到 100 左右。大步滚得快，接近绿色区后用轻滚；滚大了也能修整。',
  };
}

export function step(s, action) {
  if (!s || s.kind !== 'snow' || s.done || !action || typeof action.type !== 'string') return false;
  if (action.type === 'back') {
    if (s.phase <= 0) return false;
    s.phase--; s.selected = null; s.offset = 0;
    return tell(s, s.phase === 0 ? '想重新修整哪团雪？已完成的雪球还在。重新修整后，我们会再搭一次。' : '装扮会为你留着。可以取下最上层重新扶正，也可以直接回去继续装扮。', true);
  }
  if (action.type === 'next') {
    if (s.phase === 0) {
      if (!ready(s)) return tell(s, '还有雪球没有做好。把它滚进绿色区，再点“这团做好了”。');
      s.phase = 1; s.selected = null; s.offset = 0;
      return tell(s, '大雪球放下面。拿起后看看它偏向哪边，用左右按钮移到中线，再轻轻放稳。', true);
    }
    if (s.phase === 1) {
      if (!stacked(s)) return tell(s, '先把三层都放稳，再给新邻居挑装扮。');
      s.phase = 2; s.selected = null;
      return tell(s, '围巾、帽子、表情和名字都由你来选。选好后点合照，我们才正式留下纪念。', true);
    }
    return false;
  }
  if (s.phase === 0) {
    const b = definition(action.id || s.rolling);
    if (!b) return false;
    if (action.type === 'chooseBall') {
      s.rolling = b.id;
      return tell(s, s.balls[b.id].ready ? `${b.name}已经做好，可以保留，也可以点重新修整。` : `${b.name}的目标是 ${b.target}，绿色区 ${b.target - 4}—${b.target + 4} 都能用。`, true);
    }
    if (action.type === 'editBall') {
      if (!s.balls[b.id].ready) return false;
      s.rolling = b.id; s.balls[b.id].ready = false;
      s.stack = { bottom: null, middle: null, head: null };
      return tell(s, '轻轻修一下就好，其他已经滚好的雪球仍然保留。', true);
    }
    if (b.id !== s.rolling || s.balls[b.id].ready) return false;
    const ball = s.balls[b.id];
    if (action.type === 'roll' || action.type === 'gentle' || action.type === 'trim') {
      const delta = { roll: 12, gentle: 4, trim: -4 }[action.type], value = Math.max(8, Math.min(124, ball.size + delta));
      if (value === ball.size) return tell(s, delta < 0 ? '已经是最小的一团，轻轻往前滚吧。' : '有点太大啦，用修整把多余的雪轻轻拍掉。');
      ball.size = value;
      if (nearSize(s, b)) return tell(s, '大小正好！点“这团做好了”把它放到一旁。还想更接近目标，也可以轻轻调整。', true);
      return tell(s, ball.size > b.target + 4 ? `滚大了一点，没关系。点“修整 −4”，回到 ${b.target - 4}—${b.target + 4} 就好。` : `现在是 ${ball.size}，再添一点雪。接近 ${b.target} 时改用“轻滚 +4”更稳。`, true);
    }
    if (action.type === 'finishBall') {
      if (!nearSize(s, b)) return tell(s, `先把${b.name}修到 ${b.target - 4}—${b.target + 4}，这样叠起来才稳。`);
      ball.ready = true;
      const remaining = BALLS.find(item => !s.balls[item.id].ready);
      if (remaining) s.rolling = remaining.id;
      return tell(s, remaining ? `${b.name}好了！接着做${remaining.name}，目标 ${remaining.target}。` : '三团雪都做好了。准备好后，点“开始搭建”。', true);
    }
    return false;
  }
  if (s.phase === 1) {
    if (action.type === 'pick') {
      const b = definition(action.id); if (!b || !s.balls[b.id].ready || Object.values(s.stack).includes(b.id)) return false;
      s.selected = b.id; s.offset = [-2, 2, -1][BALLS.indexOf(b)] * (s.seed % 2 ? -1 : 1);
      const next = nextBall(s);
      return tell(s, next?.id === b.id ? `扶住${b.name}，让它的中心和虚线对齐，再放在${b.label}位置。` : `这一层该用${next?.name || '已经放好的雪球'}。不用重来，换一团就好。`, true);
    }
    if (action.type === 'nudge') {
      if (!s.selected || ![-1, 1].includes(action.dir)) return false;
      const value = Math.max(-3, Math.min(3, s.offset + action.dir)); if (value === s.offset) return false;
      s.offset = value;
      return tell(s, value === 0 ? '对齐了！现在可以轻轻放稳。' : `还${value < 0 ? '左' : '右'}偏 ${Math.abs(value)} 步，往${value < 0 ? '右' : '左'}移一点。`, true);
    }
    if (action.type === 'place') {
      const b = nextBall(s); if (!b || !s.selected) return tell(s, '先拿起这一层需要的雪球。');
      if (s.selected !== b.id) return tell(s, `现在轮到${b.name}。把手里的放回去，换一团即可。`);
      if (s.offset !== 0) return tell(s, '还没有扶到中间，用左右按钮对齐虚线。雪不会掉，慢慢来。');
      s.stack[b.slot] = b.id; s.selected = null; s.offset = 0;
      const next = nextBall(s);
      return tell(s, next ? `${b.label}稳稳的！下一层用${next.name}。` : '三层都站稳了。它还缺一点自己的模样，准备好就去挑装扮吧。', true);
    }
    if (action.type === 'unstack') {
      const last = [...BALLS].reverse().find(b => s.stack[b.slot]); if (!last) return false;
      s.stack[last.slot] = null; s.selected = last.id; s.offset = 0;
      return tell(s, `先取下最上面的${last.name}。我们扶着它，重新放好就行。`, true);
    }
    return false;
  }
  if (s.phase === 2) {
    const choices = { scarf: SCARVES, hat: HATS, face: FACES, name: NAMES };
    if (own(choices, action.type)) {
      if (!own(choices[action.type], action.id)) return false;
      s[action.type] = action.id;
      return tell(s, action.type === 'name' ? `“${NAMES[action.id]}”，听起来就很适合它。等你满意，我们一起合照。` : `换成${choices[action.type][action.id]}了。看看眼前的雪人，还可以继续换。`, true);
    }
    if (action.type === 'photo') {
      if (!stacked(s) || !dressed(s)) return tell(s, '先为它选好围巾、帽子、表情和名字，每一项都可以再换。');
      s.done = true;
      return tell(s, `“${NAMES[s.name]}”正式住进小镇啦！这是我们一起完成的冬日合照纪念。`, true);
    }
  }
  return false;
}

function portrait(s, h, assembling = false) {
  const label = assembling ? `已搭好 ${Object.values(s.stack).filter(Boolean).length} 层；当前${s.selected ? definition(s.selected).name : '未拿雪球'}` : `${s.name ? NAMES[s.name] : '还没取名的雪人'}，${SCARVES[s.scarf] || '围巾待选'}，${HATS[s.hat] || '帽子待选'}，${FACES[s.face] || '表情待选'}`;
  const next = nextBall(s);
  const layer = b => {
    const placed = !!s.stack[b.slot], carried = assembling && next?.slot === b.slot && !!s.selected;
    const shown = !assembling || placed || carried;
    const displayed = carried ? definition(s.selected) : b;
    return h('div', { class: 'fw-layer fw-' + b.slot },
      assembling && !placed && h('span', { class: 'fw-outline', style: { width: b.width + 'px' } }),
      shown && h('div', { class: 'fw-snowball' + (carried ? ' fw-carried' : ''), style: { width: displayed.width + 'px', '--shift': (carried ? s.offset * 14 : 0) + 'px' } },
        b.slot === 'head' && !assembling && [
          s.hat && s.hat !== 'none' && h('span', { class: 'fw-hat fw-hat-' + s.hat, 'aria-hidden': 'true' }, s.hat === 'knit' ? h('i') : null),
          h('span', { class: 'fw-face fw-face-' + (s.face || 'smile'), 'aria-hidden': 'true' }, h('i', { class: 'fw-eye fw-eye-left' }), h('i', { class: 'fw-eye fw-eye-right' }), h('i', { class: 'fw-nose' }), h('i', { class: 'fw-mouth' })),
          s.scarf && h('span', { class: 'fw-scarf fw-scarf-' + s.scarf, 'aria-hidden': 'true' }),
        ],
        b.slot === 'middle' && !assembling && h('span', { class: 'fw-coal', 'aria-hidden': 'true' }, '●', h('br'), '●'),
      ));
  };
  return h('div', { class: 'fw-portrait' + (assembling ? ' fw-building' : ''), role: 'img', 'aria-label': label },
    assembling && h('span', { class: 'fw-centerline', 'aria-hidden': 'true' }),
    [...BALLS].reverse().map(layer),
    !assembling && h('span', { class: 'fw-nameplate' }, s.name ? NAMES[s.name] : '给新邻居取个名字'),
    h('span', { class: 'fw-sr' }, label));
}

export function render(s, { h, button }) {
  const stage = h('div', { class: 'fa-stage fw-stage', 'data-winter-phase': s.phase });
  const guide = h('p', { class: 'fw-guide', role: 'status', 'aria-live': 'polite' }, s.message);
  if (s.done) {
    stage.append(portrait(s, h), h('p', { class: 'fw-caption' }, `${NAMES[s.name]} · 暖暖和诺诺伊一起完成的冬日纪念`));
    return stage;
  }
  stage.append(guide);
  if (s.phase === 0) {
    const b = definition(s.rolling), ball = s.balls[b.id], count = BALLS.filter(item => s.balls[item.id].ready).length;
    stage.append(h('p', { class: 'fw-phase-note' }, `做好 ${count} / 3 团 · 雪团大小可慢慢修整`),
      h('div', { class: 'fw-ball-choices' }, BALLS.map(item => button(`${item.name} ${s.balls[item.id].ready ? '✓ 已做好' : `${s.balls[item.id].size} / ${item.target}`}`, 'snow-ball-' + item.id, { type: 'chooseBall', id: item.id }, { class: 'btn alt fw-choice', 'aria-pressed': String(s.rolling === item.id) }))),
      h('div', { class: 'fw-rolling', role: 'img', 'aria-label': `${b.name}当前大小 ${ball.size}，目标 ${b.target}，合适范围 ${b.target - 4} 至 ${b.target + 4}` },
        h('span', { class: 'fw-target-ring', style: { width: (46 + b.target * .6) + 'px', height: (46 + b.target * .6) + 'px' } }),
        h('span', { class: 'fw-roll-ball', style: { width: (46 + ball.size * .6) + 'px', height: (46 + ball.size * .6) + 'px' } }, String(ball.size))),
      h('label', { class: 'fw-meter-label' }, `目标 ${b.target} · 绿色范围 ${b.target - 4}—${b.target + 4}`),
      h('div', { class: 'fw-size-meter', role: 'meter', 'aria-label': b.name + '大小', 'aria-valuemin': '8', 'aria-valuemax': '124', 'aria-valuenow': String(ball.size), 'aria-valuetext': `当前 ${ball.size}，合适范围 ${b.target - 4} 到 ${b.target + 4}` },
        h('span', { class: 'fw-size-fill', style: { width: (ball.size / 124 * 100) + '%' } }),
        h('span', { class: 'fw-size-target', style: { left: ((b.target - 4) / 124 * 100) + '%', width: (8 / 124 * 100) + '%' } })),
      h('div', { class: 'fw-controls' },
        button('大步滚 +12', 'snow-roll', { type: 'roll' }, { disabled: ball.ready || ball.size >= 124 }),
        button('轻滚 +4', 'snow-gentle', { type: 'gentle' }, { disabled: ball.ready || ball.size >= 124 }),
        button('修整 −4', 'snow-trim', { type: 'trim' }, { disabled: ball.ready || ball.size <= 8 })),
      ball.ready ? button('重新修整这团', 'snow-edit-ball', { type: 'editBall', id: b.id }) : button('这团做好了', 'snow-finish-ball', { type: 'finishBall' }, { disabled: !nearSize(s, b), class: 'btn fw-primary' }),
      h('div', { class: 'fw-nav' }, button('开始搭建 →', 'snow-next', { type: 'next' }, { disabled: !ready(s), class: 'btn fw-primary' })));
  } else if (s.phase === 1) {
    const b = nextBall(s), align = !s.selected ? '选一团雪，拿到虚线旁' : s.offset === 0 ? '已居中，可以放稳' : `${s.offset < 0 ? '左' : '右'}偏 ${Math.abs(s.offset)} 步 · 请向${s.offset < 0 ? '右' : '左'}微调`;
    stage.append(h('p', { class: 'fw-phase-note' }, b ? `下一层：${b.label} · 需要${b.name}` : '三层已经站稳，可以去装扮啦'),
      portrait(s, h, true),
      h('div', { class: 'fw-ball-choices' }, BALLS.map(item => button(`拿${item.name}${Object.values(s.stack).includes(item.id) ? ' · 已放好' : ''}`, 'snow-pick-' + item.id, { type: 'pick', id: item.id }, { disabled: Object.values(s.stack).includes(item.id), 'aria-pressed': String(s.selected === item.id) }))),
      h('p', { class: 'fw-alignment', role: 'status' }, align),
      h('div', { class: 'fw-controls' }, button('← 左移一步', 'snow-left', { type: 'nudge', dir: -1 }, { disabled: !s.selected || s.offset <= -3 }), button('轻轻放稳', 'snow-place', { type: 'place' }, { disabled: !s.selected, class: 'btn fw-primary' }), button('右移一步 →', 'snow-right', { type: 'nudge', dir: 1 }, { disabled: !s.selected || s.offset >= 3 })),
      button('取下最上层', 'snow-unstack', { type: 'unstack' }, { disabled: !Object.values(s.stack).some(Boolean) }),
      h('div', { class: 'fw-nav' }, button('← 回去滚雪球', 'snow-back', { type: 'back' }), button('去挑装扮 →', 'snow-next', { type: 'next' }, { disabled: !stacked(s), class: 'btn fw-primary' })));
  } else {
    stage.append(portrait(s, h));
    for (const [type, title, choices] of [['scarf', '围巾颜色', SCARVES], ['hat', '帽子', HATS], ['face', '表情', FACES], ['name', '新邻居的名字', NAMES]]) {
      stage.append(h('fieldset', { class: 'fw-options' }, h('legend', {}, title), h('div', { class: 'fw-option-row' }, Object.entries(choices).map(([id, label]) => button(label, `snow-${type}-${id}`, { type, id }, { class: 'btn alt fw-choice', 'aria-pressed': String(s[type] === id) })))));
    }
    stage.append(h('p', { class: 'fw-caption' }, '选择会直接换到上面的雪人身上。合照留念后才完成，不会提前结束。'),
      h('div', { class: 'fw-nav' }, button('← 回去扶正', 'snow-back', { type: 'back' }), button('合照留念 · 完成', 'snow-photo', { type: 'photo' }, { disabled: !dressed(s), class: 'btn fw-primary' })));
  }
  return stage;
}

export function summary(s) {
  return {
    title: s.done ? `“${NAMES[s.name]}”的第一张冬日纪念` : '一起完成冬日新邻居',
    text: s.done ? `诺诺伊：“${NAMES[s.name]}站得很稳，${FACES[s.face]}也很像今天的好心情。谢谢你和我一起，从第一团雪慢慢做到这里。”` : '滚好三团雪，扶正叠好，再挑选装扮与名字后合照留念。',
    details: [
      `雪球大小：大 ${s.balls.large.size}、中 ${s.balls.medium.size}、小 ${s.balls.small.size}`,
      '由下到上扶正搭建，三层都对准中线',
      `${SCARVES[s.scarf] || '围巾待选'} · ${HATS[s.hat] || '帽子待选'} · ${FACES[s.face] || '表情待选'}`,
    ],
  };
}

export const css = `
.fw-stage{background:#f3f9fc!important;border-color:#cfdfe6!important;color:#526d7e;text-align:center}
.fw-stage button{min-height:44px;white-space:normal;touch-action:manipulation;line-height:1.35}
.fw-stage button:focus-visible{outline:3px solid #9e7497;outline-offset:3px}
.fw-stage button[aria-pressed="true"]{background:#e6d7e8!important;box-shadow:inset 0 0 0 2px #ad87a6;color:#69516b}
.fw-stage button:disabled{opacity:.45;cursor:default}
.fw-guide{margin:0 0 14px!important;text-align:left;background:#fff8ee;border:1px solid #eddcca;border-radius:13px;padding:12px 14px;font-size:14px;line-height:1.65!important}
.fw-phase-note,.fw-alignment{font-weight:700;font-size:14px;line-height:1.6}
.fw-ball-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0}
.fw-ball-choices button{padding:8px 5px;font-size:13px;min-width:0}
.fw-rolling{position:relative;display:flex;align-items:center;justify-content:center;height:145px;margin:2px auto}
.fw-target-ring{position:absolute;border:3px dashed #81b69c;border-radius:43%;box-sizing:border-box}
.fw-roll-ball{display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#fff,#e3f1f7);border:2px solid #bfd3df;border-radius:40%;box-shadow:inset -6px -6px 0 #d7e8f133;font-size:21px;font-weight:800;color:#648293;max-width:124px;max-height:124px;z-index:1}
.fw-meter-label{font-size:13px;font-weight:700;display:block;margin:5px 0}
.fw-size-meter{height:16px;position:relative;max-width:360px;margin:8px auto 16px;border-radius:8px;background:#dbe7ed;overflow:hidden;border:1px solid #bdcfd9}
.fw-size-fill{position:absolute;left:0;top:0;height:100%;background:#a6c9db}
.fw-size-target{position:absolute;top:0;height:100%;background:#8cbf9abb;border:2px solid #598b6f;box-sizing:border-box}
.fw-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0}.fw-controls button{min-width:0;padding:9px 5px;font-size:13px}
.fw-nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 0}.fw-nav button{flex:1 1 130px;padding:10px 8px}
.fw-primary{background:#7f9fba!important;border-color:#7f9fba!important;color:#fff!important}
.fw-portrait{position:relative;display:flex;flex-direction:column;align-items:center;width:100%;max-width:270px;padding:48px 12px 38px;margin:12px auto 8px;box-sizing:border-box;background:linear-gradient(#e4f0f7,#fffaf3);border-radius:22px;border:1px solid #d2e1e9;overflow:visible}
.fw-building{padding-top:20px;padding-bottom:18px}
.fw-centerline{position:absolute;top:14px;bottom:14px;left:50%;border-left:2px dashed #b8a594}
.fw-layer{position:relative;display:flex;align-items:center;justify-content:center;height:54px;width:100%;z-index:1}.fw-layer.fw-middle{height:68px;margin-top:-4px;z-index:0}.fw-layer.fw-bottom{height:78px;margin-top:-6px;z-index:0}
.fw-snowball{position:relative;height:100%;border:2px solid #c1d6e3;background:linear-gradient(145deg,#fff,#e9f4f9);border-radius:41% 44% 39% 42%;box-sizing:border-box;transform:translateX(var(--shift,0));max-width:76%}
.fw-outline{position:absolute;height:100%;border:2px dashed #aec2c9;box-sizing:border-box;border-radius:41%;max-width:76%}
.fw-carried{border:3px solid #b890ae;background:#fff8fe}
.fw-eye{position:absolute;top:17px;width:5px;height:7px;background:#607184;border-radius:3px}.fw-eye-left{left:21px}.fw-eye-right{right:21px}
.fw-face-wink .fw-eye-right,.fw-face-sleepy .fw-eye{height:3px;top:20px;width:8px;transform:rotate(-12deg)}
.fw-nose{position:absolute;left:calc(50% - 3px);top:24px;width:13px;height:6px;background:#eaae7d;border-radius:3px 70% 70% 3px}
.fw-mouth{position:absolute;left:calc(50% - 7px);top:33px;width:14px;height:7px;border-bottom:2px solid #798794;border-radius:50%}.fw-face-sleepy .fw-mouth{width:8px;left:calc(50% - 4px);height:3px}
.fw-scarf{position:absolute;bottom:-3px;left:-8px;right:-8px;height:12px;border-radius:5px;background:#cf839f;z-index:5}.fw-scarf:after{content:'';position:absolute;width:13px;height:29px;right:10px;top:5px;background:inherit;border-radius:0 0 4px 4px;transform:rotate(-10deg)}.fw-scarf-blue{background:#79afcf}
.fw-hat{position:absolute;left:8px;right:8px;bottom:calc(100% - 4px);height:28px;z-index:4;background:#a795bd;border-radius:18px 18px 3px 3px;border-bottom:7px solid #c5b7d7}.fw-hat-knit i{position:absolute;left:calc(50% - 8px);top:-12px;width:16px;height:16px;background:#ddd2e8;border-radius:40%}.fw-hat-bucket{background:#93b6b3;border-bottom-color:#c3d9d1;border-radius:5px 5px 1px 1px;height:30px;transform:rotate(-8deg)}
.fw-coal{position:absolute;left:0;right:0;top:13px;line-height:18px;font-size:9px;color:#7890a3}
.fw-nameplate{position:absolute;bottom:9px;font-size:12px;color:#756777;background:#fff5e9;border:1px solid #e6d4bd;padding:4px 12px;border-radius:6px;max-width:90%;box-sizing:border-box}
.fw-options{border:0;padding:0;margin:12px 0;text-align:left;min-width:0}.fw-options legend{font-size:13px;font-weight:700;margin-bottom:7px;color:#6b6580}.fw-option-row{display:flex;gap:7px;flex-wrap:wrap}.fw-option-row button{flex:1 1 80px;padding:9px 8px;font-size:13px}
.fw-caption{font-size:12px;line-height:1.6!important;color:#6e8290;margin:10px 0!important}.fw-sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:380px){.fw-guide{padding:10px}.fw-controls,.fw-ball-choices{gap:5px}.fw-controls button,.fw-ball-choices button{font-size:12px}.fw-nav button{flex-basis:110px}}
`;
