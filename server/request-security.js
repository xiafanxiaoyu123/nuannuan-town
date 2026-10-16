// Pure request-boundary helpers. No database, environment mutation or network I/O.
const { isIP } = require('node:net');

function ipValue(input) {
  if (typeof input !== 'string' || !input || input.includes('%')) return null;
  const family = isIP(input);
  if (family === 4) {
    const value = input.split('.').reduce((total, part) => (total << 8n) + BigInt(part), 0n);
    return { family, value, text: input };
  }
  if (family !== 6) return null;
  let expanded = input.toLowerCase();
  if (expanded.includes('.')) {
    const lastColon = expanded.lastIndexOf(':');
    const dotted = ipValue(expanded.slice(lastColon + 1));
    if (!dotted || dotted.family !== 4) return null;
    expanded = `${expanded.slice(0, lastColon)}:${(dotted.value >> 16n).toString(16)}:${(dotted.value & 65535n).toString(16)}`;
  }
  const halves = expanded.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length > 1 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  const value = groups.reduce((total, part) => (total << 16n) + BigInt(`0x${part}`), 0n);
  // Treat IPv4-mapped IPv6 sockets and IPv4 proxy entries as one identity.
  if ((value >> 32n) === 65535n) {
    const ipv4 = value & 4294967295n;
    const text = [24n, 16n, 8n, 0n].map((shift) => Number((ipv4 >> shift) & 255n)).join('.');
    return { family: 4, value: ipv4, text };
  }
  return { family, value, text: value.toString(16).padStart(32, '0').match(/.{4}/g).map((part) => Number.parseInt(part, 16).toString(16)).join(':') };
}

function trustedRanges(specification) {
  const entries = String(specification || '').split(',').map((value) => value.trim()).filter(Boolean);
  const expanded = entries.flatMap((entry) => entry === 'loopback' ? ['127.0.0.0/8', '::1/128'] : [entry]);
  return expanded.map((entry) => {
    const parts = entry.split('/');
    const address = ipValue(parts[0]);
    const bits = address?.family === 4 ? 32 : 128;
    const prefix = parts.length === 1 ? bits : Number(parts[1]);
    if (!address || parts.length > 2 || !/^\d+$/.test(parts[1] || String(bits)) || !Number.isInteger(prefix) || prefix < 1 || prefix > bits) {
      throw new Error(`Invalid TRUST_PROXY entry: ${entry}. Use explicit IP/CIDR or loopback; unrestricted trust is not supported.`);
    }
    return { family: address.family, shift: BigInt(bits - prefix), network: address.value >> BigInt(bits - prefix) };
  });
}

function originValue(value) {
  if (typeof value !== 'string' || !value || value === 'null') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'app:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    const canonical = `${url.protocol}//${url.host}`;
    return value === canonical ? url : null;
  } catch { return null; }
}

function loopbackHost(hostname) {
  if (hostname === 'localhost') return true;
  const address = ipValue(hostname.replace(/^\[|\]$/g, ''));
  return !!address && ((address.family === 4 && (address.value >> 24n) === 127n) || (address.family === 6 && address.value === 1n));
}

function createRequestSecurity(env = {}) {
  const ranges = trustedRanges(env.TRUST_PROXY);
  const trusted = (address) => ranges.some((range) => range.family === address.family && (address.value >> range.shift) === range.network);
  const origins = new Set(String(env.APP_ORIGINS || env.APP_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean));
  for (const origin of origins) if (!originValue(origin)) throw new Error(`Invalid APP_ORIGINS entry: ${origin}. Use an exact origin without a path or wildcard.`);
  const production = env.NODE_ENV === 'production' || env.COOKIE_SECURE === '1';

  function clientIp(req) {
    const socket = ipValue(req.socket?.remoteAddress);
    if (!socket) return 'unknown';
    if (!trusted(socket)) return socket.text;
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded !== 'string' || !forwarded || forwarded.length > 4096) return socket.text;
    const parts = forwarded.split(',');
    if (parts.length > 32) return socket.text;
    let address = socket;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (!trusted(address)) break;
      const candidate = ipValue(parts[index].trim());
      if (!candidate) return socket.text;
      address = candidate;
    }
    return address.text;
  }

  function isOriginAllowed(req) {
    const origin = req.headers?.origin;
    // Electron's same-origin API proxy and payment webhooks have no Origin.
    if (origin === undefined) return true;
    if (!originValue(origin)) return false;
    if (origins.has(origin)) return true;
    if (production || origins.size) return false;
    const socket = ipValue(req.socket?.remoteAddress);
    const host = req.headers?.host;
    if (!socket || !loopbackHost(socket.text) || typeof host !== 'string') return false;
    const local = originValue(`http://${host}`);
    return !!local && loopbackHost(local.hostname) && origin === `http://${local.host}`;
  }

  function originHeaders(req) {
    const origin = req.headers?.origin;
    return origin !== undefined && isOriginAllowed(req)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }
      : {};
  }
  return { clientIp, isOriginAllowed, originHeaders };
}

// Cookie first, matching existing authentication. Logout must revoke the same token.
function sessionToken(req, cookies) {
  if (!cookies) {
    cookies = {};
    for (const part of String(req.headers?.cookie || '').split(';')) {
      const equals = part.indexOf('=');
      if (equals > 0) {
        try { cookies[part.slice(0, equals).trim()] = decodeURIComponent(part.slice(equals + 1).trim()); } catch { /* ignore malformed cookies */ }
      }
    }
  }
  if (typeof cookies.session === 'string' && cookies.session) return cookies.session;
  const authorization = req.headers?.authorization;
  return typeof authorization === 'string' ? /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] || '' : '';
}

function createLoginFailureLimiter({ now = Date.now, maxFailures = 10, windowMs = 15 * 60000, cooldownMs = 30000, capacity = 20000 } = {}) {
  const failures = new Map();
  let nextSweep = 0;
  // SQLite username NOCASE is ASCII-insensitive; permitted non-ASCII names are CJK.
  const identity = (username) => typeof username === 'string' && /^[A-Za-z0-9_\u4e00-\u9fff.\-]{3,32}$/.test(username) ? username.toLowerCase() : '';
  function entry(username) {
    const timestamp = now();
    if (timestamp >= nextSweep) {
      for (const [key, record] of failures) if (timestamp >= record.expiresAt) failures.delete(key);
      nextSweep = timestamp + 30000;
    }
    const key = identity(username);
    let record = failures.get(key);
    if (record && timestamp >= record.expiresAt) { failures.delete(key); record = undefined; }
    return { key, record, timestamp };
  }
  function blocked(username) {
    const { record, timestamp } = entry(username);
    return record ? Math.max(0, Math.ceil((record.blockedUntil - timestamp) / 1000)) : 0;
  }
  function failure(username) {
    const { key, record, timestamp } = entry(username);
    if (!key) return 0;
    if (!record && failures.size >= capacity) return Math.ceil(cooldownMs / 1000);
    const updated = record || { count: 0, blockedUntil: 0 };
    updated.count += 1;
    updated.expiresAt = timestamp + windowMs;
    if (updated.count >= maxFailures) updated.blockedUntil = timestamp + cooldownMs;
    failures.set(key, updated);
    return Math.max(0, Math.ceil((updated.blockedUntil - timestamp) / 1000));
  }
  return { blocked, failure, success(username) { failures.delete(identity(username)); } };
}

module.exports = { createRequestSecurity, createLoginFailureLimiter, sessionToken };
