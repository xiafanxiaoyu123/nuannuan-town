// 微信支付 API v3 的最小服务端适配层。
// 私钥、API v3 密钥、平台证书和微信支付公钥只能从服务器环境变量/受限文件读取，绝不发送到客户端。
const fs = require('node:fs');
const https = require('node:https');
const {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes,
} = require('node:crypto');

function readSecret(envName, fileEnvName) {
  const value = String(process.env[envName] || '').trim();
  if (value) return value.replace(/\\n/g, '\n');
  const file = String(process.env[fileEnvName] || '').trim();
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    // A newly prepared server has the path in the template before the
    // operator has copied the private key/certificate. Treat that state as
    // unconfigured so the public status endpoint stays healthy and checkout
    // remains disabled. Other read failures still surface for diagnosis.
    if (error && error.code === 'ENOENT') return '';
    throw error;
  }
}

function config() {
  const privateKey = readSecret('WECHAT_PRIVATE_KEY_PEM', 'WECHAT_PRIVATE_KEY_PATH');
  const platformCert = readSecret('WECHAT_PLATFORM_CERT_PEM', 'WECHAT_PLATFORM_CERT_PATH');
  const platformSerial = String(process.env.WECHAT_PLATFORM_SERIAL_NO || '').trim();
  const publicKey = readSecret('WECHAT_PUBLIC_KEY_PEM', 'WECHAT_PUBLIC_KEY_PATH');
  const publicKeyId = String(process.env.WECHAT_PUBLIC_KEY_ID || '').trim();
  const apiV3Key = String(process.env.WECHAT_API_V3_KEY || '').trim();
  return {
    mchid: String(process.env.WECHAT_MCHID || '').trim(),
    appid: String(process.env.WECHAT_APPID || '').trim(),
    serialNo: String(process.env.WECHAT_SERIAL_NO || '').trim(),
    privateKey,
    apiV3Key,
    notifyUrl: String(process.env.WECHAT_NOTIFY_URL || '').trim(),
    platformSerial,
    platformCert,
    publicKey,
    publicKeyId,
  };
}

function configured() {
  const c = config();
  const missing = [];
  if (!c.mchid) missing.push('WECHAT_MCHID');
  if (!c.appid) missing.push('WECHAT_APPID');
  if (!c.serialNo) missing.push('WECHAT_SERIAL_NO');
  if (!c.privateKey) missing.push('WECHAT_PRIVATE_KEY_PATH/PEM');
  if (!c.apiV3Key || Buffer.byteLength(c.apiV3Key, 'utf8') !== 32) missing.push('WECHAT_API_V3_KEY(32字节)');
  if (!c.notifyUrl) missing.push('WECHAT_NOTIFY_URL');
  // API responses and notifications share the same verification keys. Never
  // issue an order/query with verification disabled just because it is not a callback.
  if (!c.platformCert && !c.publicKey) missing.push('WECHAT_PLATFORM_CERT_PATH/PEM or WECHAT_PUBLIC_KEY_PATH/PEM');
  if (c.publicKey && (!c.publicKeyId || !c.publicKeyId.startsWith('PUB_KEY_ID_'))) {
    missing.push('WECHAT_PUBLIC_KEY_ID(PUB_KEY_ID_...)');
  }
  return { ok: missing.length === 0, missing, config: c };
}

function fail(message, status = 503, code = 'WECHAT_NOT_CONFIGURED') {
  return Object.assign(new Error(message), { status, code });
}

function authorization(method, requestPath, body, timestamp, nonce, c) {
  const message = `${method}\n${requestPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  const signature = signer.sign(c.privateKey).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${c.serialNo}",signature="${signature}"`;
}

function verifySignature(rawBody, headers, c) {
  const serial = String(headers['wechatpay-serial'] || '');
  const signature = String(headers['wechatpay-signature'] || '');
  const timestamp = String(headers['wechatpay-timestamp'] || '');
  const nonce = String(headers['wechatpay-nonce'] || '');
  if (!serial || !signature || !timestamp || !nonce) throw fail('微信支付报文缺少验签头', 400, 'WECHAT_SIGNATURE_HEADERS_MISSING');
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw fail('微信支付报文时间戳已过期', 400, 'WECHAT_SIGNATURE_EXPIRED');
  const usesPublicKey = serial.startsWith('PUB_KEY_ID_');
  if (usesPublicKey) {
    if (!c.publicKey) throw fail('微信支付报文使用公钥 ID，但未配置微信支付公钥', 503, 'WECHAT_PUBLIC_KEY_MISSING');
    if (!c.publicKeyId || serial !== c.publicKeyId) throw fail('微信支付公钥 ID 不匹配，请更新公钥文件', 401, 'WECHAT_PUBLIC_KEY_ID_MISMATCH');
  } else if (c.platformSerial && serial !== c.platformSerial) {
    throw fail('微信支付平台证书序列号不匹配，请更新平台证书', 401, 'WECHAT_PLATFORM_SERIAL_MISMATCH');
  }
  const cert = usesPublicKey ? c.publicKey : c.platformCert;
  if (!cert) throw fail('未配置匹配的微信支付平台证书或公钥', 503, 'WECHAT_VERIFICATION_KEY_MISSING');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
  verifier.end();
  if (!verifier.verify(cert, Buffer.from(signature, 'base64'))) throw fail('微信支付报文验签失败', 401, 'WECHAT_SIGNATURE_INVALID');
  return { serial, timestamp, nonce };
}

function decryptNotification(resource, c) {
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') throw fail('微信支付回调加密算法不受支持', 400, 'WECHAT_RESOURCE_ALGORITHM');
  const key = Buffer.from(c.apiV3Key, 'utf8');
  if (key.length !== 32) throw fail('微信 API v3 密钥必须是 32 字节', 503, 'WECHAT_API_V3_KEY_INVALID');
  const encrypted = Buffer.from(String(resource.ciphertext || ''), 'base64');
  if (encrypted.length <= 16) throw fail('微信支付回调密文不完整', 400, 'WECHAT_RESOURCE_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(resource.nonce || ''), 'utf8'));
  decipher.setAAD(Buffer.from(String(resource.associated_data || ''), 'utf8'));
  decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
  const clear = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]);
  return JSON.parse(clear.toString('utf8'));
}

function request(method, requestPath, payload = null) {
  const checked = configured();
  if (!checked.ok) throw fail(`微信支付未配置：${checked.missing.join('、')}`);
  const c = checked.config;
  const body = payload === null ? '' : JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'nuannuan-town/portal-membership',
    Authorization: authorization(method, requestPath, body, timestamp, nonce, c),
    'Content-Length': Buffer.byteLength(body),
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (failure, result) => {
      if (settled) return;
      settled = true;
      if (failure) reject(failure); else resolve(result);
    };
    const req = https.request({ hostname: 'api.mch.weixin.qq.com', port: 443, path: requestPath, method, headers, timeout: 15000 }, (res) => {
      const chunks = [];
      let ended = false;
      // IncomingMessage can error after the request itself has succeeded.
      // Retain an error listener after settlement so late stream errors are safe.
      res.on('error', (failure) => finish(failure));
      res.on('aborted', () => finish(fail('微信支付接口响应中断', 502, 'WECHAT_API_RESPONSE_ABORTED')));
      res.on('close', () => {
        if (!ended) finish(fail('微信支付接口响应未完整接收', 502, 'WECHAT_API_RESPONSE_INCOMPLETE'));
      });
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        ended = true;
        if (settled) return;
        if (res.complete === false) return finish(fail('微信支付接口响应未完整接收', 502, 'WECHAT_API_RESPONSE_INCOMPLETE'));
        const text = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = fail(`微信支付接口返回 HTTP ${res.statusCode}`, 502, 'WECHAT_API_ERROR');
          error.providerStatus = res.statusCode;
          error.providerBody = json;
          finish(error);
          return;
        }
        // Verify the original response bytes, including an empty HTTP 204 body,
        // before a successful result can reach billing fulfilment.
        try { verifySignature(text, res.headers || {}, c); }
        catch (failure) { finish(failure); return; }
        finish(null, { status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('timeout', () => req.destroy(fail('微信支付接口请求超时', 504, 'WECHAT_API_TIMEOUT')));
    req.on('error', (failure) => finish(failure));
    if (body) req.write(body);
    req.end();
  });
}

async function createNativeOrder({ description, outTradeNo, amountFen, attach }) {
  const checked = configured();
  if (!checked.ok) throw fail(`微信支付未配置：${checked.missing.join('、')}`);
  if (!Number.isSafeInteger(amountFen) || amountFen < 1) throw fail('支付金额必须是正整数分', 500, 'PAYMENT_AMOUNT_INVALID');
  return request('POST', '/v3/pay/transactions/native', {
    appid: checked.config.appid,
    mchid: checked.config.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: checked.config.notifyUrl,
    amount: { total: amountFen, currency: 'CNY' },
    ...(attach ? { attach } : {}),
  });
}

async function queryOrder(outTradeNo) {
  return request('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config().mchid)}`);
}

async function closeOrder(outTradeNo) {
  return request('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: config().mchid });
}

module.exports = {
  closeOrder,
  config,
  configured,
  createNativeOrder,
  decryptNotification,
  queryOrder,
  request,
  verifySignature,
};
