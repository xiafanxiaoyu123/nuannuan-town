'use strict';

// Alipay OpenAPI 2.0 page/wap payment adapter (RSA2, public-key mode).
// Protocol reference: https://github.com/alipay/alipay-sdk-nodejs-all
// This project deploys plain CommonJS files without a server npm install.
// Only Node built-ins are used; keep exact response bytes for RSA2 verification.
const fs = require('node:fs');
const https = require('node:https');
const { createPrivateKey, createPublicKey, createSign, createVerify } = require('node:crypto');

const GATEWAYS = Object.freeze({
  sandbox: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  production: 'https://openapi.alipay.com/gateway.do',
});
const RESPONSE_LIMIT = 1024 * 1024;
const REQUEST_METHODS = new Set(['alipay.trade.query', 'alipay.trade.close']);

function fail(message, status = 503, code = 'ALIPAY_NOT_CONFIGURED') {
  return Object.assign(new Error(message), { status, code });
}

function readSecret(valueName, pathName) {
  const value = String(process.env[valueName] || '').trim();
  if (value) return value.replace(/\\n/g, '\n');
  const file = String(process.env[pathName] || '').trim();
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch {
    // A prepared-but-empty deployment and a mis-owned secret file must keep
    // /billing/status healthy. Both report the key as missing/invalid, leave
    // checkout disabled, and never leak filesystem or key contents in errors.
    return '';
  }
}

function config() {
  const environment = String(process.env.ALIPAY_ENV || 'sandbox').trim();
  return {
    environment,
    gateway: GATEWAYS[environment] || '',
    appid: String(process.env.ALIPAY_APP_ID || '').trim(),
    sellerId: String(process.env.ALIPAY_SELLER_ID || '').trim(),
    privateKey: readSecret('ALIPAY_PRIVATE_KEY_PEM', 'ALIPAY_PRIVATE_KEY_PATH'),
    alipayPublicKey: readSecret('ALIPAY_PUBLIC_KEY_PEM', 'ALIPAY_PUBLIC_KEY_PATH'),
    notifyUrl: String(process.env.ALIPAY_NOTIFY_URL || '').trim(),
    returnUrl: String(process.env.ALIPAY_RETURN_URL || '').trim(),
  };
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !!url.hostname;
  } catch { return false; }
}

function validRsaKey(pem, privateKey) {
  try {
    const key = privateKey ? createPrivateKey(pem) : createPublicKey(pem);
    return key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength >= 2048;
  } catch { return false; }
}

// callback is accepted for the same status-interface contract as wechat-pay.js.
// Require verification material for ALL uses; never provide unverified queries.
function configured({ callback = false } = {}) {
  void callback;
  const c = config();
  const missing = [];
  if (!c.gateway) missing.push('ALIPAY_ENV(sandbox/production)');
  if (!/^\d{16}$/.test(c.appid)) missing.push('ALIPAY_APP_ID(16位)');
  if (!/^2088\d{12}$/.test(c.sellerId)) missing.push('ALIPAY_SELLER_ID(2088开头16位PID)');
  if (!validRsaKey(c.privateKey, true)) missing.push('ALIPAY_PRIVATE_KEY_PATH/PEM(RSA 2048+)');
  if (!validRsaKey(c.alipayPublicKey, false)) missing.push('ALIPAY_PUBLIC_KEY_PATH/PEM(RSA 2048+)');
  if (!validHttpsUrl(c.notifyUrl)) missing.push('ALIPAY_NOTIFY_URL(HTTPS)');
  if (!validHttpsUrl(c.returnUrl)) missing.push('ALIPAY_RETURN_URL(HTTPS)');
  return { ok: missing.length === 0, missing, config: c };
}

function checkedConfig() {
  const checked = configured();
  if (!checked.ok) throw fail(`支付宝尚未配置完整：${checked.missing.join('、')}`);
  return checked.config;
}

function fenToAmount(amountFen) {
  if (!Number.isSafeInteger(amountFen) || amountFen < 1) {
    throw fail('支付金额必须是正整数分', 400, 'PAYMENT_AMOUNT_INVALID');
  }
  const amount = BigInt(amountFen);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}

function amountToFen(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) {
    throw fail('支付宝金额格式无效', 400, 'ALIPAY_AMOUNT_INVALID');
  }
  const [whole, decimal = ''] = value.split('.');
  const fen = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (fen > BigInt(Number.MAX_SAFE_INTEGER)) throw fail('支付宝金额超出范围', 400, 'ALIPAY_AMOUNT_INVALID');
  return Number(fen);
}

function canonical(params, notification = false) {
  return Object.keys(params).sort().filter((key) => key !== 'sign' &&
    (!notification || key !== 'sign_type') && params[key] !== '' && params[key] !== undefined && params[key] !== null)
    .map((key) => `${key}=${params[key]}`).join('&');
}

function signedParams(method, business, c, extras = {}) {
  // OpenAPI timestamp uses Beijing time even when the Ubuntu host is on UTC.
  const timestamp = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  const params = {
    app_id: c.appid, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2',
    timestamp, version: '1.0', ...extras, biz_content: JSON.stringify(business),
  };
  try { params.sign = createSign('RSA-SHA256').update(canonical(params), 'utf8').sign(c.privateKey, 'base64'); }
  catch { throw fail('支付宝应用私钥无法签名', 503, 'ALIPAY_SIGNING_KEY_INVALID'); }
  return params;
}

function checkedOrderId(outTradeNo) {
  if (typeof outTradeNo !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(outTradeNo)) {
    throw fail('支付宝商户订单号格式无效', 400, 'ALIPAY_ORDER_ID_INVALID');
  }
  return outTradeNo;
}

function createPageOrder({ outTradeNo, amountFen, description, attach, channel = 'page', timeoutMinutes = 15 }) {
  const c = checkedConfig();
  if (process.env.PAYMENT_CHECKOUT_ENABLED !== '1') throw fail('支付下单开关尚未开启', 503, 'PAYMENT_CHECKOUT_DISABLED');
  checkedOrderId(outTradeNo);
  if (channel !== 'page' && channel !== 'wap') throw fail('不支持的支付宝支付场景', 400, 'ALIPAY_CHANNEL_INVALID');
  if (typeof description !== 'string' || !description.trim() || Buffer.byteLength(description, 'utf8') > 256) {
    throw fail('支付宝订单标题无效', 400, 'ALIPAY_SUBJECT_INVALID');
  }
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 1440) {
    throw fail('支付宝订单有效期无效', 400, 'ALIPAY_TIMEOUT_INVALID');
  }
  if (attach !== undefined && (typeof attach !== 'string' || Buffer.byteLength(attach, 'utf8') > 128)) {
    throw fail('支付宝订单附加参数无效', 400, 'ALIPAY_ATTACH_INVALID');
  }
  const returnUrl = new URL(c.returnUrl);
  returnUrl.searchParams.set('order', outTradeNo);
  returnUrl.searchParams.set('payment_return', '1');
  const business = {
    out_trade_no: outTradeNo,
    seller_id: c.sellerId,
    total_amount: fenToAmount(amountFen),
    subject: description,
    product_code: channel === 'wap' ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY',
    timeout_express: `${timeoutMinutes}m`,
    ...(attach ? { passback_params: encodeURIComponent(attach) } : {}),
  };
  const params = signedParams(`alipay.trade.${channel}.pay`, business, c, {
    notify_url: c.notifyUrl, return_url: returnUrl.toString(),
  });
  // Gateway is a fixed official host, never a client- or environment-supplied URL.
  const paymentUrl = `${c.gateway}?${new URLSearchParams(params).toString()}`;
  return { paymentUrl, channel, environment: c.environment, amountFen };
}

function checkRsaSignature(text, signature, publicKey, code) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length % 4 !== 0) {
    throw fail('支付宝签名格式无效', 401, code);
  }
  let valid = false;
  try { valid = createVerify('RSA-SHA256').update(text, 'utf8').verify(publicKey, signature, 'base64'); }
  catch { /* Keep crypto/key details out of public responses and logs. */ }
  if (!valid) throw fail('支付宝验签失败', 401, code);
}

function verifyNotification(rawForm, c = config()) {
  if (typeof rawForm !== 'string' || Buffer.byteLength(rawForm, 'utf8') > 64 * 1024) {
    throw fail('支付宝通知内容无效', 400, 'ALIPAY_NOTIFY_INVALID');
  }
  const params = Object.create(null);
  try {
    for (const pair of rawForm.split('&')) {
      if (!pair) continue;
      const equals = pair.indexOf('=');
      if (equals < 1) throw new Error('invalid form');
      const key = decodeURIComponent(pair.slice(0, equals).replace(/\+/g, ' '));
      const value = decodeURIComponent(pair.slice(equals + 1).replace(/\+/g, ' '));
      if (!/^[A-Za-z0-9_]+$/.test(key) || Object.hasOwn(params, key)) throw new Error('duplicate or invalid key');
      params[key] = value;
    }
  } catch { throw fail('支付宝通知包含重复字段或无效编码', 400, 'ALIPAY_NOTIFY_INVALID'); }
  if (params.sign_type !== 'RSA2') throw fail('支付宝通知仅接受 RSA2 签名', 400, 'ALIPAY_SIGN_TYPE_INVALID');
  if (!c.alipayPublicKey) throw fail('支付宝公钥未配置');
  checkRsaSignature(canonical(params, true), params.sign, c.alipayPublicKey, 'ALIPAY_NOTIFY_SIGNATURE_INVALID');
  // Caller must ALSO match app_id, seller_id, order, amount, environment and trade status,
  // and atomically deduplicate fulfilment. A valid signature alone never grants rights.
  return params;
}

// Find exact JSON values, rejecting duplicate keys at every nesting level. Parsing
// and re-stringifying loses whitespace/escaping/number spelling covered by the signature.
function rawJsonFields(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > RESPONSE_LIMIT) {
    throw fail('支付宝响应过大或格式无效', 502, 'ALIPAY_RESPONSE_INVALID');
  }
  let cursor = 0;
  const fields = Object.create(null);
  const ws = () => { while (/[\x20\t\r\n]/.test(raw[cursor] || '\0')) cursor += 1; };
  function str() {
    const start = cursor;
    if (raw[cursor++] !== '"') throw new Error('string expected');
    while (cursor < raw.length) {
      const char = raw[cursor++];
      if (char === '\\') cursor += 1;
      else if (char === '"') return JSON.parse(raw.slice(start, cursor));
    }
    throw new Error('unterminated string');
  }
  function value(depth) {
    if (depth > 32) throw new Error('JSON depth');
    ws();
    if (raw[cursor] === '"') { str(); return; }
    if (raw[cursor] === '{') {
      cursor += 1;
      const seen = new Set();
      ws();
      if (raw[cursor] === '}') { cursor += 1; return; }
      while (cursor < raw.length) {
        ws();
        const key = str();
        if (seen.has(key)) throw new Error('duplicate key');
        seen.add(key);
        ws();
        if (raw[cursor++] !== ':') throw new Error('colon expected');
        ws();
        const start = cursor;
        value(depth + 1);
        if (depth === 0) fields[key] = raw.slice(start, cursor);
        ws();
        const delimiter = raw[cursor++];
        if (delimiter === '}') return;
        if (delimiter !== ',') throw new Error('object delimiter');
      }
      throw new Error('unterminated object');
    }
    if (raw[cursor] === '[') {
      cursor += 1; ws();
      if (raw[cursor] === ']') { cursor += 1; return; }
      while (cursor < raw.length) {
        value(depth + 1); ws();
        const delimiter = raw[cursor++];
        if (delimiter === ']') return;
        if (delimiter !== ',') throw new Error('array delimiter');
      }
      throw new Error('unterminated array');
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(cursor));
    if (!token) throw new Error('invalid JSON token');
    cursor += token[0].length;
  }
  try {
    ws();
    if (raw[cursor] !== '{') throw new Error('object required');
    value(0); ws();
    if (cursor !== raw.length) throw new Error('trailing data');
    return fields;
  } catch { throw fail('支付宝响应 JSON 无效或包含重复字段', 502, 'ALIPAY_RESPONSE_INVALID'); }
}

function verifyResponse(raw, method, c = config()) {
  const fields = rawJsonFields(raw);
  const expected = `${method.replace(/\./g, '_')}_response`;
  const key = Object.hasOwn(fields, expected) ? expected : 'error_response';
  if (!Object.hasOwn(fields, key) || (Object.hasOwn(fields, expected) && Object.hasOwn(fields, 'error_response'))) {
    throw fail('支付宝响应类型不匹配', 502, 'ALIPAY_RESPONSE_INVALID');
  }
  if (fields.sign_type && JSON.parse(fields.sign_type) !== 'RSA2') throw fail('支付宝响应签名算法无效', 502, 'ALIPAY_SIGN_TYPE_INVALID');
  if (!c.alipayPublicKey || !fields.sign) throw fail('支付宝响应缺少验签材料', 502, 'ALIPAY_RESPONSE_SIGNATURE_INVALID');
  checkRsaSignature(fields[key], JSON.parse(fields.sign), c.alipayPublicKey, 'ALIPAY_RESPONSE_SIGNATURE_INVALID');
  const body = JSON.parse(fields[key]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('支付宝响应内容无效', 502, 'ALIPAY_RESPONSE_INVALID');
  return body;
}

function request(method, business) {
  if (!REQUEST_METHODS.has(method)) throw fail('支付宝接口不受支持', 400, 'ALIPAY_METHOD_INVALID');
  const c = checkedConfig();
  const params = signedParams(method, business, c);
  // Follow the official SDK layout: common parameters in URL, biz_content in form.
  const body = new URLSearchParams({ biz_content: params.biz_content }).toString();
  delete params.biz_content;
  const url = new URL(`${c.gateway}?${new URLSearchParams(params)}`);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', timeout: 15000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        'Content-Length': Buffer.byteLength(body), 'User-Agent': 'nuannuan-town/portal-membership' },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > RESPONSE_LIMIT) { req.destroy(fail('支付宝响应超过限制', 502, 'ALIPAY_RESPONSE_INVALID')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(fail(`支付宝接口返回 HTTP ${res.statusCode}`, 502, 'ALIPAY_HTTP_ERROR')); return;
        }
        try {
          const verified = verifyResponse(Buffer.concat(chunks).toString('utf8'), method, c);
          if (verified.code !== '10000') {
            const error = fail('支付宝接口未完成请求，请检查产品权限或订单状态', 502, 'ALIPAY_API_ERROR');
            // Only verified machine codes are safe to log. Never include raw requests,
            // signatures, provider sub_msg, buyer data or private keys in errors.
            error.providerCode = String(verified.code || '').slice(0, 32);
            error.providerSubCode = String(verified.sub_code || '').slice(0, 80);
            reject(error); return;
          }
          resolve({ status: res.statusCode, body: verified });
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(fail('支付宝请求超时', 504, 'ALIPAY_API_TIMEOUT')));
    req.on('error', (error) => reject(error.code?.startsWith('ALIPAY_') ? error : fail('支付宝网络连接失败', 502, 'ALIPAY_NETWORK_ERROR')));
    req.end(body);
  });
}

function queryOrder(outTradeNo) { return request('alipay.trade.query', { out_trade_no: checkedOrderId(outTradeNo) }); }
function closeOrder(outTradeNo) { return request('alipay.trade.close', { out_trade_no: checkedOrderId(outTradeNo) }); }

module.exports = { amountToFen, closeOrder, config, configured, createPageOrder, fenToAmount,
  queryOrder, verifyNotification, verifyResponse };
