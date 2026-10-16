/* Protocol/lifecycle checks. Browser SRI enforcement is checked separately by
 * the integration browser test; this file runs deterministic failure cases. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const origin = 'https://site.invalid';
const js = Buffer.from('window.__tested = true;');
const css = Buffer.from('body {color: green;}');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const build = '1234567890abcdef';
const manifest = {
  schema: 1, buildId: build, version: 'test', entry: 'assets/play.abc.js', styles: 'assets/play.def.css',
  resources: [
    { sourcePath: 'assets/play.abc.js', fallbackUrl: 'assets/play.abc.js', url: 'https://cloud.invalid/test.js', sha256: sha(js), size: js.length },
    { sourcePath: 'assets/play.def.css', fallbackUrl: 'assets/play.def.css', url: 'https://cloud.invalid/test.css', sha256: sha(css), size: css.length },
  ],
};
const quiet = { warn() {}, error() {} };

async function checkLoader() {
  const elements = [];
  let message = '';
  const append = (element) => {
    elements.push(element);
    assert.equal(element.crossOrigin, 'anonymous');
    const expected = element.tag === 'script' ? js : css;
    assert.equal(element.integrity, 'sha256-' + crypto.createHash('sha256').update(expected).digest('base64'));
    queueMicrotask(() => (element.href || element.src).startsWith('https://cloud.invalid') ? element.onerror() : element.onload());
  };
  const context = {
    URL, setTimeout, clearTimeout, console: quiet, btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    fetch: async () => new Response(JSON.stringify(manifest)), navigator: {}, window: {},
    document: {
      baseURI: origin + '/play.html', head: { appendChild: append }, body: { appendChild: append },
      querySelector: () => ({ set textContent(value) { message = value; } }),
      createElement: (tag) => ({ tag, dataset: {}, remove() { this.removed = true; } }),
    },
  };
  await vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/web_play_loader.js'), 'utf8'), context);
  assert.equal(elements.length, 4, 'both external failures use the local fallback');
  assert.equal(elements[0].removed, true);
  assert.equal(elements[2].removed, true);
  assert.equal(elements[1].href, origin + '/assets/play.def.css');
  assert.equal(elements[3].src, origin + '/assets/play.abc.js');
  assert.equal(message, '');
  const invalid = structuredClone(manifest);
  invalid.resources[0].sourcePath = '../private.js';
  context.fetch = async () => new Response(JSON.stringify(invalid));
  elements.length = 0;
  await vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/web_play_loader.js'), 'utf8'), context);
  assert.equal(elements.length, 0, 'invalid fallback cannot execute resources');
  assert.match(message, /加载失败/);
}

function memoryCaches() {
  const stores = new Map();
  return {
    stores,
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(typeof request === 'string' ? request : request.url)?.clone(); },
        async put(request, response) { store.set(typeof request === 'string' ? request : request.url, response.clone()); },
      };
    },
  };
}

function worker(caches, options = {}) {
  const handlers = {};
  let skip = 0;
  let claim = 0;
  const makeResource = (url) => {
    const isCss = url.endsWith('.css');
    let content = isCss ? css : js;
    let mime = isCss ? 'text/css' : 'text/javascript';
    if ((url.startsWith('https://cloud.invalid') && options.badCloud) || options.badAll) {
      content = Buffer.from(options.truncated ? 'x' : 'corrupt resource');
    }
    if (url.startsWith('https://cloud.invalid') && options.badMime) mime = 'text/html';
    return new Response(content, { headers: { 'content-type': mime } });
  };
  const context = vm.createContext({
    URL, Response, Request, AbortController, setTimeout, clearTimeout, console: quiet, caches,
    crypto: crypto.webcrypto,
    fetch: async (request) => {
      if (options.offline) throw new Error('offline');
      const url = typeof request === 'string' ? request : request.url;
      if (url.includes('play-manifest.json')) return new Response(JSON.stringify(options.newManifest || manifest));
      if (/\.(?:css|js)$/.test(url) && !url.endsWith('play.js')) return makeResource(url);
      return new Response('small shell', { headers: { 'content-type': 'text/html' } });
    },
    self: {
      registration: { scope: origin + '/' },
      location: { href: origin + '/play-sw.js?build=' + build, origin },
      addEventListener(name, handler) { handlers[name] = handler; },
      async skipWaiting() { skip++; }, clients: { async claim() { claim++; } },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'tools/web_play_sw.js'), 'utf8'), context);
  return {
    options,
    async ready() { await vm.runInContext('restored', context); },
    async event(name) { let promise; handlers[name]({ waitUntil(value) { promise = value; } }); await promise; },
    async fetch(url) {
      let promise;
      handlers.fetch({ request: new Request(url), respondWith(value) { promise = value; } });
      return promise ? await promise : null;
    },
    state() { return { skip, claim }; },
  };
}

async function seedPrevious(caches) {
  const cache = await caches.open('nikki-town-play-0000000000000000-old');
  await cache.put(origin + '/__nikki_verified_cache__', new Response(JSON.stringify({ complete: true, buildId: '0000000000000000' })));
  await cache.put(origin + '/play-manifest.json', new Response(JSON.stringify({ ...manifest, buildId: '0000000000000000' })));
  return 'nikki-town-play-0000000000000000-old';
}

async function checkWorker() {
  for (const truncated of [false, true]) {
    const caches = memoryCaches();
    const old = await seedPrevious(caches);
    const failed = worker(caches, { badAll: true, truncated });
    await assert.rejects(failed.event('install'), /No verified copy/);
    assert.deepEqual(await caches.keys(), [old], 'failed hashes must keep the previous cache');
    assert.equal(failed.state().skip, 0, 'a corrupt build never requests activation');
  }
  const caches = memoryCaches();
  const old = await seedPrevious(caches);
  const installed = worker(caches, { badCloud: true, badMime: true });
  await installed.event('install');
  await installed.event('activate');
  assert.equal(installed.state().skip, 1);
  assert.equal(installed.state().claim, 1);
  assert.equal((await caches.keys()).length, 2, 'current and previous verified caches remain');
  assert.ok((await caches.keys()).includes(old));
  const restarted = worker(caches, { offline: true });
  await restarted.ready();
  await restarted.event('activate');
  assert.equal(await (await restarted.fetch(origin + '/assets/play.abc.js')).text(), js.toString());
  assert.equal((await (await restarted.fetch(origin + '/play-manifest.json?t=99')).json()).buildId, build);
  assert.equal((await caches.keys()).length, 2, 'worker restart must not clear complete caches');
  const online = worker(caches, { newManifest: { ...manifest, buildId: 'fedcba0987654321' } });
  await online.ready();
  assert.equal((await (await online.fetch(origin + '/play-manifest.json?t=100')).json()).buildId, 'fedcba0987654321');
  online.options.offline = true;
  assert.equal((await (await online.fetch(origin + '/play-manifest.json?t=101')).json()).buildId, build,
    'a newer network manifest must not overwrite the active verified build');
}

(async () => {
  await checkLoader();
  await checkWorker();
  console.log(JSON.stringify({ status: 'ok', loaderSRIAttributes: true, externalFailureFallback: true,
    corruptAndTruncatedBuildRejected: true, previousCachePreserved: true, restartOfflineCache: true,
    newManifestAtomicPreparation: true }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
