// 樱花祭：照样编花、带提示的记忆花样、自己设计并赠送。规则不读取存档或时钟。
export const FLOWER_PATTERN = ['pink', 'cream', 'pink', 'leaf', 'cream'];
export const FLOWERS = {
  pink: { name: '粉樱花', short: '粉', color: '#f3a3ba' },
  cream: { name: '白小花', short: '白', color: '#fff2c2' },
  leaf: { name: '嫩绿叶', short: '叶', color: '#9dceb0' },
};
export const RIBBONS = {
  rose: { name: '樱桃红缎带', color: '#cf6b84' },
  sky: { name: '晴空蓝缎带', color: '#84b8d4' },
  sun: { name: '奶油黄缎带', color: '#e3bd60' },
};
export const RECIPIENTS = {
  xiaotao: { name: '送给小桃', ending: '小桃把花环捧在胸前转了一圈：“我就知道，暖暖编的春天会最好看！明年我们还来这里，好不好？”' },
  nonoy: { name: '送给诺诺伊', ending: '诺诺伊在缎带上认真理了一个小结：“我会把它挂在工作台旁。抬起头，就能记得今天也有好好休息。”' },
  self: { name: '留给自己', ending: '小桃替暖暖扶正花环：“这次也给自己留一份喜欢吧！”花影落在肩头，你们一起在野餐角坐了下来。' },
};
export const config = {
  title: '春风花环台', host: '小桃', scene: '花架与野餐角',
  intro: '小桃铺开了装满樱花、白花和嫩叶的小托盘：“先一起学一个花样，再试着记一记。最后那一圈春天，就按你喜欢的样子来！”',
  instruction: '依次完成照样编花、记忆花样和自由设计。花材从左到右编入；选错不会拆掉前面的花。随时可看提示、撤回上一枝，没有计时，也不花材料。',
  steps: ['跟着小桃编一圈', '记住春风的花样', '编一份自己的春天'],
  done: '花环编好了，春天也有了属于你的配色。',
};
const MEMORY_PATTERNS = [
  ['leaf', 'pink', 'cream', 'pink', 'leaf', 'cream'],
  ['cream', 'leaf', 'pink', 'cream', 'pink', 'leaf'],
  ['pink', 'cream', 'leaf', 'cream', 'leaf', 'pink'],
];
const variant = seed => Number.isFinite(Number(seed)) ? Math.abs(Math.trunc(Number(seed))) % MEMORY_PATTERNS.length : 0;
export function create(seed = 0) {
  const n = variant(seed), teaching = [...FLOWER_PATTERN];
  if (n) teaching.push(...teaching.splice(0, n));
  return { kind: 'sakura', phase: 0, done: false, ready: false, message: '', seed: n,
    pattern: teaching, memoryPattern: [...MEMORY_PATTERNS[n]], flowers: [], samples: [],
    memoryStarted: false, hintOpen: false, hints: 0, ribbon: null, recipient: null, mistakes: 0 };
}
const desired = s => s.phase === 0 ? s.pattern : s.memoryPattern;
const required = s => s.phase < 2 ? desired(s).length : 8;
const present = (map, id) => typeof id === 'string' && Object.hasOwn(map, id);
export function step(s, action) {
  if (!s || s.kind !== 'sakura' || s.done || !action || typeof action !== 'object') return false;
  if (action.type === 'hint') {
    if (s.phase === 2) { s.message = '这一圈没有标准答案。选满八枝花材，搭一条缎带，再决定把心意送给谁。'; return true; }
    if (s.phase === 0) {
      s.hints++; s.message = s.ready ? '五枝都编对了！可以点“下一步”去试试记忆花样，也可以撤回最后一枝。' : '照着上方的花样，从左往右编。现在第 ' + (s.flowers.length + 1) + ' 枝要用' + FLOWERS[s.pattern[s.flowers.length]].name + '；已编好的花不会被拆掉。'; return true;
    }
    s.hintOpen = !s.hintOpen; if (s.hintOpen) s.hints++;
    s.message = s.hintOpen ? '花样可以一直看着，没有扣分。准备好后也可以再把它收起来。' : '花样收好了。忘了就再打开，慢慢编就好。'; return true;
  }
  if (action.type === 'memory-start' && s.phase === 1 && !s.memoryStarted) {
    s.memoryStarted = true; s.hintOpen = false; s.message = '花样收起来了。从左边第一枝开始，想不起来就点“看看花样”。'; return true;
  }
  if (action.type === 'undo') {
    if (!s.flowers.length) return false;
    const old = s.flowers.pop(); s.ready = false;
    s.message = '取回了最后一枝' + FLOWERS[old].name + '，前面编好的花保留。'; return true;
  }
  if (action.type === 'flower') {
    if (!present(FLOWERS, action.id) || s.flowers.length >= required(s) || (s.phase === 1 && !s.memoryStarted)) return false;
    if (s.phase < 2 && action.id !== desired(s)[s.flowers.length]) {
      s.mistakes++; s.message = '这枝先放回托盘。前面 ' + s.flowers.length + ' 枝都保留；再想想第 ' + (s.flowers.length + 1) + ' 枝，也可以打开花样看看。'; return false;
    }
    s.flowers.push(action.id); s.ready = s.phase < 2 && s.flowers.length === required(s);
    s.message = s.ready ? (s.phase === 0 ? '第一圈编好了！小桃把它挂上花架。准备好后，再试试记忆花样。' : '六枝都对上了！这圈留在野餐桌边，最后来编你自己喜欢的那一圈。')
      : s.phase === 2 ? (s.flowers.length === 8 ? '八枝花材围成一圈了。挑好缎带和收花的人，就可以系结送出。' : '这一枝很适合你的春天，还可以继续搭配。') : '这一枝刚刚好。接着编第 ' + (s.flowers.length + 1) + ' 枝。';
    return true;
  }
  if (action.type === 'next' && s.ready && s.phase < 2) {
    s.samples.push([...s.flowers]); s.phase++; s.flowers = []; s.ready = false; s.hintOpen = false;
    s.message = s.phase === 1 ? '先看看这次的六枝花样，不着急；看好了再点“收起花样，开始编”。' : '最后一圈交给你设计。八个位置可以重复用同一种花，没有对错。'; return true;
  }
  if (action.type === 'ribbon' && s.phase === 2 && present(RIBBONS, action.id)) {
    s.ribbon = action.id; s.message = '选好了' + RIBBONS[action.id].name + '，还可以继续换。'; return true;
  }
  if (action.type === 'recipient' && s.phase === 2 && present(RECIPIENTS, action.id)) {
    s.recipient = action.id; s.message = action.id === 'self' ? '给自己留一份喜欢，也是很好的选择。' : '这份春天' + RECIPIENTS[action.id].name + '。'; return true;
  }
  if (action.type === 'finish' && s.phase === 2) {
    if (s.flowers.length !== 8 || !s.ribbon || !s.recipient) {
      s.message = s.flowers.length !== 8 ? '花环还差 ' + (8 - s.flowers.length) + ' 枝。' : !s.ribbon ? '先挑一条喜欢的缎带吧。' : '还没决定这份心意送给谁呢。'; return false;
    }
    s.done = true; s.ready = true; s.message = RECIPIENTS[s.recipient].ending; return true;
  }
  return false;
}
const flowerNames = items => items.map(id => FLOWERS[id].name).join('、');
export function summary(s) {
  return { title: '你编好了自己的春天', text: s.done ? RECIPIENTS[s.recipient].ending : config.done,
    details: ['跟样花环与记忆花环都留在了小桃的花架边。', '你的配色：' + flowerNames(s.flowers),
      '缎带：' + (RIBBONS[s.ribbon]?.name || '尚未选择'), '这份心意：' + (RECIPIENTS[s.recipient]?.name || '尚未决定')] };
}
function wreath(h, items, slots, ribbon, label) {
  const nodes = Array.from({ length: slots }, (_, i) => {
    const id = items[i], angle = -Math.PI / 2 + i * Math.PI * 2 / slots;
    return h('span', { class: 'fa-spring-petal ' + (id || 'empty'), style: { left: (50 + Math.cos(angle) * 38) + '%', top: (50 + Math.sin(angle) * 38) + '%', '--petal': FLOWERS[id]?.color || '#fffcf7' },
      'aria-label': '第 ' + (i + 1) + ' 枝：' + (FLOWERS[id]?.name || '未编入') }, id ? FLOWERS[id].short : String(i + 1));
  });
  return h('div', { class: 'fa-spring-wreath fa-visual', role: 'img', 'aria-label': label + '：' + (items.length ? flowerNames(items) : '等待花材') },
    h('div', { class: 'fa-spring-twig' }), ...nodes, h('span', { class: 'fa-spring-center' }, items.length + ' / ' + slots),
    ribbon && h('span', { class: 'fa-spring-bow', style: { '--ribbon': RIBBONS[ribbon].color }, 'aria-hidden': 'true' }, '🎀'));
}
export function render(s, { h, button }) {
  const root = h('div', { class: 'fa-stage fa-spring', 'data-spring-phase': s.phase });
  if (s.done) { root.append(wreath(h, s.flowers, 8, s.ribbon, '完成的花环'), h('p', { class: 'fa-note' }, RECIPIENTS[s.recipient].name + ' · ' + RIBBONS[s.ribbon].name)); return root; }
  const count = required(s), showPattern = s.phase === 0 || (s.phase === 1 && (!s.memoryStarted || s.hintOpen));
  root.append(h('h3', {}, config.steps[s.phase]), h('p', { class: 'fa-task' }, s.phase === 0 ? '小桃：“从左往右，跟着我先编五枝。”' : s.phase === 1 ? '小桃：“这次多一枝。先看清花样，记不住也没关系。”' : '小桃：“第三圈没有标准答案，选八枝你喜欢的花材。”'));
  if (s.phase < 2) root.append(h('div', { class: 'fa-spring-sample' }, h('b', {}, showPattern ? '花样 · 从左往右' : '花样已收起'),
    h('div', { class: 'fa-pattern', role: 'img', 'aria-label': showPattern ? flowerNames(desired(s)) : '记忆花样已隐藏' }, desired(s).map((id, i) => h('span', { class: 'fa-spring-chip ' + (showPattern ? id : 'empty'), style: { '--petal': showPattern ? FLOWERS[id].color : '#fff8ed' } }, showPattern ? FLOWERS[id].short : '？')))));
  root.append(wreath(h, s.flowers, count, s.phase === 2 ? s.ribbon : null, '正在编的花环'));
  if (s.phase === 1 && !s.memoryStarted) root.append(button('收起花样，开始编', 'spring-memory-start', { type: 'memory-start' }, { class: 'btn' }));
  else root.append(h('div', { class: 'fa-row' }, Object.entries(FLOWERS).map(([id, f]) => button(f.name, 'spring-flower-' + id, { type: 'flower', id }, { disabled: s.flowers.length >= count, style: { borderColor: f.color }, 'aria-label': '编入一枝' + f.name }))));
  root.append(h('div', { class: 'fa-row' }, button('撤回上一枝', 'spring-undo', { type: 'undo' }, { disabled: !s.flowers.length }),
    button(s.phase === 2 ? '设计小提示' : s.phase === 1 ? s.hintOpen ? '收起提示花样' : '看看花样' : '编花提示', 'spring-hint', { type: 'hint' }, s.phase === 1 ? { 'aria-pressed': String(s.hintOpen) } : {})));
  if (s.phase === 2) root.append(h('p', {}, '选一条缎带'), h('div', { class: 'fa-row', role: 'group', 'aria-label': '选择花环缎带' }, Object.entries(RIBBONS).map(([id, r]) => button(r.name, 'spring-ribbon-' + id, { type: 'ribbon', id }, { 'aria-pressed': String(s.ribbon === id), class: 'btn alt sm' + (s.ribbon === id ? ' fa-choice-on' : '') }))),
    h('p', {}, '把这份春天送给谁？'), h('div', { class: 'fa-row', role: 'group', 'aria-label': '选择收花的人' }, Object.entries(RECIPIENTS).map(([id, r]) => button(r.name, 'spring-recipient-' + id, { type: 'recipient', id }, { 'aria-pressed': String(s.recipient === id), class: 'btn alt sm' + (s.recipient === id ? ' fa-choice-on' : '') }))),
    button('系好缎带，送出心意', 'spring-finish', { type: 'finish' }, { class: 'btn', disabled: s.flowers.length !== 8 || !s.ribbon || !s.recipient }));
  else if (s.ready) root.append(h('p', { class: 'fa-note' }, '这一圈已经编好，可以先欣赏，也可以撤回最后一枝。'), button(s.phase === 0 ? '下一步 · 记一记花样' : '下一步 · 自己设计', 'spring-next', { type: 'next' }, { class: 'btn' }));
  return root;
}
export const css = `
  .fa-spring button{min-height:44px;touch-action:manipulation}.fa-spring h3{margin:0 0 8px}.fa-spring-sample{padding:10px 6px;background:#fffdf8;border-radius:12px}.fa-spring-sample .fa-pattern{gap:7px;flex-wrap:wrap;margin-top:7px}
  .fa-spring-chip{display:inline-flex;justify-content:center;align-items:center;width:31px;height:31px;border:1px solid #aa907d;border-radius:50%;background:var(--petal);color:#655848;font-weight:700;font-size:13px}.fa-spring-chip.leaf{border-radius:70% 15% 70% 15%}
  .fa-spring-wreath{position:relative;width:180px;height:180px;margin:13px auto 18px}.fa-spring-twig{position:absolute;inset:24px;border:8px double #88aa80;border-radius:50%;box-shadow:0 0 0 3px #cadcbf44}
  .fa-spring-petal{position:absolute;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);width:35px;height:35px;background:var(--petal);border:2px solid #c39b94;border-radius:43% 57% 45% 55%;box-shadow:inset 0 0 0 4px #ffffff66;color:#644f52;font-size:12px;font-weight:700}.fa-spring-petal.leaf{border-radius:70% 15% 70% 15%;border-color:#83a58d}.fa-spring-petal.empty{border-style:dashed;border-color:#cdbdab;box-shadow:none;color:#a3927e}.fa-spring-center{position:absolute;inset:68px 38px;color:#7a7960;font-size:18px;font-weight:700}
  .fa-spring-bow{position:absolute;left:68px;bottom:-8px;color:var(--ribbon);font-size:0;width:44px;height:26px;background:var(--ribbon);clip-path:polygon(0 0,50% 32%,100% 0,100% 86%,56% 62%,64% 100%,36% 100%,44% 62%,0 86%)}
  .fa-spring .fa-choice-on{outline:2px solid #be6c91;outline-offset:1px;background:#ffe6ef}.fa-spring .fa-note{line-height:1.6}
  @media(max-height:500px){.fa-spring-wreath{width:150px;height:150px;margin:8px auto 15px}.fa-spring-center{inset:55px 28px}.fa-spring-bow{left:54px}.fa-spring-petal{width:30px;height:30px}.fa-spring-twig{inset:21px}}
`;
