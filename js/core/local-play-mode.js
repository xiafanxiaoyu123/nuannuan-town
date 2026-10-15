// 开发网页默认自由试玩。原生宿主的 localhost 不属于开发服务器。
export function localPlayEnabled(host = globalThis) {
  const loc = host.location;
  if (!loc || !['http:', 'https:'].includes(loc.protocol) || loc.port !== '5173'
    || !['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)
    || host.NikkiNative || host.Capacitor?.isNativePlatform?.()) return false;
  const query = new URLSearchParams(loc.search || '');
  if (query.get('sandbox') === '0') return false;
  // 指定存档位的自动验收仍测试正常玩法；可显式选择自由试玩。
  return query.get('sandbox') === '1' || !query.has('slot');
}

export const LOCAL_PLAY = localPlayEnabled();
