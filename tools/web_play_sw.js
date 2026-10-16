/* Stage verified resources before activating a web update. Keep the last good
 * cache if a new CDN response is unavailable, opaque, truncated or corrupted. */
const CACHE_PREFIX = 'nikki-town-play-';
const scope = self.registration.scope;
const requestedBuild = new URL(self.location.href).searchParams.get('build');
const manifestUrl = new URL('play-manifest.json', scope).href;
const markerUrl = new URL('__nikki_verified_cache__', scope).href;
let activeCacheName;
let resourceMap = new Map();

function resourceInfo(item) {
  const source = item.sourcePath || item.fallbackUrl || item.url;
  if (!/^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(source) ||
      !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 1) {
    throw new Error('Invalid resource path/hash/size');
  }
  const url = new URL(item.url, scope);
  const fallback = new URL(source, scope);
  if (url.username || url.password || url.hash ||
      (url.origin !== self.location.origin && url.protocol !== 'https:')) throw new Error('Invalid resource URL');
  return { ...item, source, url: url.href, fallback: fallback.href };
}

function parseManifest(value) {
  if (!value || value.schema !== 1 || !/^[a-f0-9]{16}$/.test(value.buildId) || !Array.isArray(value.resources)) {
    throw new Error('Invalid web manifest');
  }
  const resources = value.resources.map(resourceInfo);
  if (!resources.some((item) => item.source === value.entry || item.url === new URL(value.entry, scope).href) ||
      !resources.some((item) => item.source === value.styles || item.url === new URL(value.styles, scope).href)) {
    throw new Error('Missing web entry/styles');
  }
  return { value, resources };
}

function remember(resources) {
  resourceMap = new Map();
  resources.forEach((item) => { resourceMap.set(item.url, item); resourceMap.set(item.fallback, item); });
}

async function completedCaches() {
  const found = [];
  for (const name of (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX))) {
    const cache = await caches.open(name);
    const marker = await cache.match(markerUrl);
    if (!marker) continue;
    try {
      const data = await marker.json();
      if (data.complete && /^[a-f0-9]{16}$/.test(data.buildId)) found.push({ name, buildId: data.buildId });
    } catch {}
  }
  return found;
}

async function restoreActiveCache() {
  if (activeCacheName) return caches.open(activeCacheName);
  const candidates = (await completedCaches()).filter((item) => !requestedBuild || item.buildId === requestedBuild);
  const current = candidates[candidates.length - 1];
  if (!current) return null;
  const cache = await caches.open(current.name);
  const response = await cache.match(manifestUrl);
  if (!response) return null;
  const { resources } = parseManifest(await response.json());
  activeCacheName = current.name;
  remember(resources);
  return cache;
}

const restored = restoreActiveCache().catch(() => null);

async function verifiedResponse(url, item) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', mode: 'cors', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error('Unreadable resource response');
    if (response.url && new URL(response.url).origin !== self.location.origin && new URL(response.url).protocol !== 'https:') {
      throw new Error('Resource redirected away from HTTPS');
    }
    const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase().trim();
    if (item.source.endsWith('.css') ? mime !== 'text/css' : !/(?:javascript|ecmascript)$/.test(mime)) {
      throw new Error('Resource has an invalid MIME type');
    }
    const bytes = await response.clone().arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== item.size || digest !== item.sha256) throw new Error('Resource integrity check failed');
    return response;
  } finally { clearTimeout(timer); }
}

async function prepareResource(item) {
  for (const url of [...new Set([item.url, item.fallback])]) {
    try { return { url, response: await verifiedResponse(url, item) }; }
    catch (error) { console.warn('[nikki-town] 预缓存地址失败', error); }
  }
  throw new Error('No verified copy of web resource');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(`${manifestUrl}?sw=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Web manifest unavailable');
    const { value: manifest, resources } = parseManifest(await response.clone().json());
    if (requestedBuild && manifest.buildId !== requestedBuild) throw new Error('Manifest changed while preparing this build');
    // Fetch/verify first, so failures cannot damage the currently active cache.
    const staged = await Promise.all(resources.map(prepareResource));
    const shells = await Promise.all(['play.html', 'play.js'].map(async (name) => {
      const url = new URL(name, scope).href;
      const shell = await fetch(url, { cache: 'no-store' });
      if (!shell.ok) throw new Error('Web shell unavailable');
      return { url, response: shell };
    }));
    const name = CACHE_PREFIX + manifest.buildId + '-' + Date.now();
    const cache = await caches.open(name);
    try {
      for (const entry of [...shells, ...staged, { url: manifestUrl, response }]) {
        await cache.put(entry.url, entry.response);
      }
      // This marker is written last. Activation only selects complete caches.
      await cache.put(markerUrl, new Response(JSON.stringify({ complete: true, buildId: manifest.buildId })));
    } catch (error) { await caches.delete(name); throw error; }
    activeCacheName = name;
    remember(resources);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await restored;
    const cache = await restoreActiveCache();
    if (!cache) throw new Error('No complete verified web cache to activate');
    const complete = await completedCaches();
    // Keep one previous verified build for rollback; never delete all caches
    // because a new pre-cache or a restarted worker lacks in-memory state.
    const previous = complete.filter((item) => item.name !== activeCacheName).slice(-1).map((item) => item.name);
    const keep = new Set([activeCacheName, ...previous]);
    await Promise.all((await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isShell = sameOrigin && /\/(?:play\.html|play\.js|play-manifest\.json|play-sw\.js)$/.test(url.pathname);
  const isAsset = sameOrigin && url.pathname.includes('/assets/');
  if (!isShell && !isAsset && !resourceMap.has(url.href)) return;
  event.respondWith((async () => {
    await restored;
    const cache = await restoreActiveCache();
    const cleanUrl = new URL(url.href);
    if (isShell) cleanUrl.search = '';
    const cached = cache && await cache.match(cleanUrl.href);
    const item = resourceMap.get(url.href);
    if (item) {
      if (cached) return cached;
      const response = await verifiedResponse(url.href, item);
      if (cache) await cache.put(url.href, response.clone());
      return response;
    }
    try {
      const response = await fetch(request);
      // Don't replace the active build's metadata with a newer network
      // manifest. The new worker must verify/stage it before activation.
      if (!response.ok && cached) return cached;
      if (cache && response.ok && isShell && !/play-manifest\.json$/.test(url.pathname)) {
        await cache.put(cleanUrl.href, response.clone());
      }
      return response;
    } catch (error) { if (cached) return cached; throw error; }
  })());
});
