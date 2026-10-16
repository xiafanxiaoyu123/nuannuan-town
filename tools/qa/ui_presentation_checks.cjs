// DOM 展示辅助函数的纯内存边界检查；真实任务/装修操作另由浏览器套件验证。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), checks = [];
const source = fs.readFileSync(path.join(root, 'js/ui/components/presentation.js'), 'utf8');
const api = vm.runInNewContext(source.replace(/^export /gm, '') + '\n;({setText,setProperty,setAttribute,setClass,captureContent,matchesContent})');
const test = (name, run) => { run(); checks.push({ name, pass: true }); };
function fixture() {
  let text = '', disabled = false, writes = 0;
  const attrs = new Map(), classes = new Set();
  const node = { get textContent() { return text; }, set textContent(value) { writes++; text = String(value); },
    get disabled() { return disabled; }, set disabled(value) { writes++; disabled = value; },
    getAttribute: key => attrs.get(key) ?? null, setAttribute(key, value) { writes++; attrs.set(key, String(value)); },
    classList: { contains: key => classes.has(key), toggle(key, on) { writes++; if (on) classes.add(key); else classes.delete(key); } },
    innerHTML: '<button>内容</button>', elements: [{}], querySelectorAll() { return this.elements; },
  };
  return { node, count: () => writes };
}
test('同值文字不重复写入，数字正常字符串化，外部变化可修复', () => {
  const { node, count } = fixture(); api.setText(node, 2); api.setText(node, 2); assert.equal(count(), 1);
  node.textContent = '外部改动'; api.setText(node, 2); assert.equal(node.textContent, '2'); assert.equal(count(), 3);
});
test('禁用属性更新仍同步，重复值无写入', () => {
  const { node, count } = fixture(); api.setProperty(node, 'disabled', true); assert.equal(node.disabled, true);
  api.setProperty(node, 'disabled', true); assert.equal(count(), 1); api.setProperty(node, 'disabled', false); assert.equal(count(), 2);
});
test('aria 属性初始 false 仍会写入，后续相同值不写入', () => {
  const { node, count } = fixture(); api.setAttribute(node, 'aria-pressed', false); assert.equal(node.getAttribute('aria-pressed'), 'false');
  api.setAttribute(node, 'aria-pressed', false); assert.equal(count(), 1); api.setAttribute(node, 'aria-pressed', true); assert.equal(count(), 2);
});
test('class 布尔切换保持结果，同值与外部变化正确处理', () => {
  const { node, count } = fixture(); api.setClass(node, 'hide', false); assert.equal(count(), 0);
  api.setClass(node, 'hide', 1); api.setClass(node, 'hide', true); assert.equal(count(), 1);
  node.classList.toggle('hide', false); api.setClass(node, 'hide', true); assert.equal(count(), 3);
});
test('相同 DOM 内容及元素身份可复用', () => {
  const { node } = fixture(), snapshot = api.captureContent(node); assert(api.matchesContent(node, snapshot));
});
test('外部修改内容、相同 HTML 克隆节点、根替换均不可复用', () => {
  const { node } = fixture(), snapshot = api.captureContent(node); node.innerHTML = '外部内容'; assert(!api.matchesContent(node, snapshot));
  node.innerHTML = snapshot.html; node.elements = [{}]; assert(!api.matchesContent(node, snapshot));
  assert(!api.matchesContent(fixture().node, snapshot));
});
test('refreshAll 通过 refreshReqs 恰好刷新一次任务，保留其他调用顺序', () => {
  const hud = fs.readFileSync(path.join(root, 'js/ui/hud.js'), 'utf8');
  const body = hud.slice(hud.indexOf('export function refreshAll()'), hud.indexOf('export function refreshReap()')).replace('export ', '');
  const fn = vm.runInNewContext(body + '\n;refreshAll', { LOCAL_PLAY: false, S: { coins: 20 }, fmt: String });
  const calls = [], ui = { coinsEl: {}, refreshReqs() { calls.push('reqs'); this.refreshQuest(); }, refreshQuest() { calls.push('quest'); } };
  for (const name of ['Ach', 'Beauty', 'Seeds', 'Decor', 'Avatar', 'Momo', 'Reap']) ui['refresh' + name] = () => calls.push(name);
  fn.call(ui); assert.deepEqual(calls, ['Ach','reqs','quest','Beauty','Seeds','Decor','Avatar','Momo','Reap']); assert.equal(ui.shownCoins, 20);
});
const report = { pass: true, checks };
if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
