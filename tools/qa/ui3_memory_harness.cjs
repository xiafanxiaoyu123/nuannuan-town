// Shared synthetic-memory harness for the UI 3.0 interaction/save regressions.
// Actual game modules run; only rendering/audio/output boundaries are replaced.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
class Hub {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, value) { for (const callback of [...(this.listeners.get(name) || [])]) callback(value); }
}
async function memoryHarness(entries, slot) {
  const root = path.resolve(__dirname, '../..'), modules = new Map(), storage = new Map(), writes = [], timers = new Map();
  const clock = { now: new Date(2026, 9, 17, 12).getTime() }; let serial = 0;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const window = new Hub(), canvas = new Hub(), app = { canvas }, noop = () => {};
  const effects = new Proxy({}, { get: () => noop });
  const math = Object.create(Math); math.random = () => 0.99;
  const context = vm.createContext({ console, Math: math, Date: ClockDate, TextEncoder, TextDecoder, URLSearchParams, performance,
    location: { search: '?slot=' + slot, protocol: 'http:', hostname: 'localhost' }, window,
    fetch() { throw new Error('Network forbidden in memory regression'); },
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); writes.push(key); }, removeItem: key => { storage.delete(key); writes.push(key); } } });
  const boundaries = new Map([['js/core/app.js', { app }], ['js/core/audio.js', { audio: effects }], ['js/core/fx.js', { fx: effects }]]);
  const at = file => {
    if (!modules.has(file)) {
      const replacement = boundaries.get(path.relative(root, file).replace(/\\/g, '/'));
      modules.set(file, replacement ? new vm.SyntheticModule(Object.keys(replacement), function () { for (const [key, value] of Object.entries(replacement)) this.setExport(key, value); }, { context, identifier: file })
        : new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    }
    return modules.get(file);
  };
  const resolve = (specifier, from) => specifier === 'three' ? path.join(root, 'node_modules/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(root, 'node_modules/three/examples/jsm', specifier.slice(13)) : path.resolve(path.dirname(from.identifier), specifier);
  const entry = new vm.SourceTextModule(entries.map(name => 'import ' + JSON.stringify('./' + name) + ';').join('\n'), { context, identifier: path.join(root, 'qa-ui3-memory.js') });
  await entry.link((specifier, from) => at(resolve(specifier, from))); await entry.evaluate();
  return { root, get: name => modules.get(path.join(root, name)).namespace, modules, storage, writes, timers, clock, window, canvas, app };
}
module.exports = { memoryHarness };
