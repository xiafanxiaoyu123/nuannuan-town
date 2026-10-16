'use strict';

// Offline acceptance only. Ephemeral test keys and a mocked HTTPS transport;
// no payment provider requests, production credentials, real orders or money.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { generateKeyPairSync, createSign, createVerify } = require('node:crypto');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const alipay = require('../../server/alipay-pay');

const envNames = ['ALIPAY_ENV', 'ALIPAY_APP_ID', 'ALIPAY_SELLER_ID', 'ALIPAY_PRIVATE_KEY_PEM',
  'ALIPAY_PUBLIC_KEY_PEM', 'ALIPAY_PRIVATE_KEY_PATH', 'ALIPAY_PUBLIC_KEY_PATH',
  'ALIPAY_NOTIFY_URL', 'ALIPAY_RETURN_URL', 'PAYMENT_CHECKOUT_ENABLED'];
const savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalRequest = https.request;
const keypair = () => generateKeyPairSync('rsa', {
  modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const merchant = keypair();
const provider = keypair();
let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`PASS ${name}`); }
function signature(raw, key = provider.privateKey) { return createSign('RSA-SHA256').update(raw, 'utf8').sign(key, 'base64'); }
function sorted(params, omitSignType = false) {
  return Object.keys(params).sort().filter((key) => key !== 'sign' && (!omitSignType || key !== 'sign_type') && params[key] !== '')
    .map((key) => `${key}=${params[key]}`).join('&');
}
function notification(overrides = {}) {
  const params = { app_id: '2021000000000001', seller_id: '2088000000000001',
    out_trade_no: 'QA_SANDBOX_01', trade_no: '20261013000001', total_amount: '0.01',
    trade_status: 'TRADE_SUCCESS', sign_type: 'RSA2', subject: '门户会员 & 测试 + 100%',
    passback_params: '%E6%B5%8B%E8%AF%95', ...overrides };
  params.sign = signature(sorted(params, true));
  return new URLSearchParams(params).toString();
}
function response(raw, method = 'alipay.trade.query') {
  return `{ "sign":${JSON.stringify(signature(raw))}, "${method.replace(/\./g, '_')}_response" : ${raw} }`;
}

async function main() {
  Object.assign(process.env, {
    ALIPAY_ENV: 'sandbox', ALIPAY_APP_ID: '2021000000000001', ALIPAY_SELLER_ID: '2088000000000001',
    ALIPAY_PRIVATE_KEY_PEM: merchant.privateKey, ALIPAY_PUBLIC_KEY_PEM: provider.publicKey,
    ALIPAY_PRIVATE_KEY_PATH: '', ALIPAY_PUBLIC_KEY_PATH: '',
    ALIPAY_NOTIFY_URL: 'https://example.test/api/billing/alipay/notify',
    ALIPAY_RETURN_URL: 'https://example.test/membership.html', PAYMENT_CHECKOUT_ENABLED: '1',
  });
  check('valid config and sandbox default', () => {
    assert.equal(alipay.configured().ok, true);
    delete process.env.ALIPAY_ENV;
    assert.equal(alipay.config().environment, 'sandbox');
    process.env.ALIPAY_ENV = 'sandbox';
  });
  check('empty, absent and unreadable configuration keeps status fail-closed', () => {
    const current = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    const originalRead = fs.readFileSync;
    try {
      for (const name of envNames) delete process.env[name];
      assert.equal(alipay.configured().ok, false);
      assert.equal(alipay.config().environment, 'sandbox');
      Object.assign(process.env, current);
      delete process.env.ALIPAY_PRIVATE_KEY_PEM;
      process.env.ALIPAY_PRIVATE_KEY_PATH = '/nonexistent/alipay-qa-key.pem';
      assert.equal(alipay.configured().ok, false);
      fs.readFileSync = () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); };
      assert.equal(alipay.configured().ok, false);
      assert.throws(() => alipay.createPageOrder({ outTradeNo: 'QA_CONFIG', amountFen: 1, description: '测试' }), { code: 'ALIPAY_NOT_CONFIGURED' });
    } finally { fs.readFileSync = originalRead; Object.assign(process.env, current); }
  });
  check('exact money conversion avoids floating-point rounding', () => {
    assert.equal(alipay.amountToFen('0.01'), 1);
    assert.equal(alipay.amountToFen('30'), 3000);
    assert.equal(alipay.amountToFen('1.1'), 110);
    assert.equal(alipay.amountToFen('12345678901.23'), 1234567890123);
    assert.equal(alipay.fenToAmount(3001), '30.01');
    assert.equal(alipay.amountToFen(alipay.fenToAmount(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
    for (const invalid of [' 1.00', '01.00', '1e2', '-1.00', '0.001', 'NaN', '90071992547409.92', 0.01]) {
      assert.throws(() => alipay.amountToFen(invalid), { code: 'ALIPAY_AMOUNT_INVALID' });
    }
    for (const invalid of [0, -1, 0.1, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => alipay.fenToAmount(invalid), { code: 'PAYMENT_AMOUNT_INVALID' });
    }
  });
  check('page and wap orders have trusted hosts, correct amount and merchant RSA2 signature', () => {
    for (const channel of ['page', 'wap']) {
      const created = alipay.createPageOrder({ outTradeNo: 'QA_SANDBOX_01', amountFen: 1, description: '门户会员 & 测试', channel });
      const url = new URL(created.paymentUrl);
      assert.equal(url.origin, 'https://openapi-sandbox.dl.alipaydev.com');
      assert.equal(url.pathname, '/gateway.do');
      const params = Object.fromEntries(url.searchParams);
      const biz = JSON.parse(params.biz_content);
      assert.equal(params.method, `alipay.trade.${channel}.pay`);
      assert.equal(biz.product_code, channel === 'wap' ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY');
      assert.equal(biz.total_amount, '0.01');
      assert.equal(biz.seller_id, process.env.ALIPAY_SELLER_ID);
      assert.equal(biz.timeout_express, '15m');
      assert.equal(new URL(params.return_url).searchParams.get('order'), 'QA_SANDBOX_01');
      assert.equal(new URL(params.return_url).searchParams.get('payment_return'), '1');
      assert.equal(createVerify('RSA-SHA256').update(sorted(params), 'utf8').verify(merchant.publicKey, params.sign, 'base64'), true);
    }
  });
  check('explicit production and enable switch required', () => {
    const args = { outTradeNo: 'QA_SANDBOX_01', amountFen: 1, description: '测试' };
    process.env.PAYMENT_CHECKOUT_ENABLED = '0';
    assert.throws(() => alipay.createPageOrder(args), { code: 'PAYMENT_CHECKOUT_DISABLED' });
    process.env.PAYMENT_CHECKOUT_ENABLED = '1';
    process.env.ALIPAY_ENV = 'prod-typo';
    assert.equal(alipay.configured().ok, false);
    assert.throws(() => alipay.createPageOrder(args), { code: 'ALIPAY_NOT_CONFIGURED' });
    process.env.ALIPAY_ENV = 'production';
    assert.equal(new URL(alipay.createPageOrder(args).paymentUrl).origin, 'https://openapi.alipay.com');
    process.env.ALIPAY_ENV = 'sandbox';
    assert.throws(() => alipay.createPageOrder({ ...args, channel: 'https://example.test' }), { code: 'ALIPAY_CHANNEL_INVALID' });
    assert.throws(() => alipay.createPageOrder({ ...args, outTradeNo: '../invalid' }), { code: 'ALIPAY_ORDER_ID_INVALID' });
  });
  check('HTTPS callback, seller PID, and valid keys enforced', () => {
    const backup = process.env.ALIPAY_NOTIFY_URL;
    process.env.ALIPAY_NOTIFY_URL = 'http://example.test/notify';
    assert.equal(alipay.configured().ok, false);
    process.env.ALIPAY_NOTIFY_URL = 'https://user:password@example.test/notify';
    assert.equal(alipay.configured().ok, false);
    process.env.ALIPAY_NOTIFY_URL = backup;
    process.env.ALIPAY_SELLER_ID = 'login@example.test';
    assert.equal(alipay.configured().ok, false);
    process.env.ALIPAY_SELLER_ID = '2088000000000001';
    process.env.ALIPAY_PRIVATE_KEY_PEM = 'invalid';
    assert.equal(alipay.configured().ok, false);
    process.env.ALIPAY_PRIVATE_KEY_PEM = merchant.privateKey;
  });
  check('notification RSA2, percent/plus handling and content tampering', () => {
    const raw = notification();
    const params = alipay.verifyNotification(raw);
    assert.equal(params.subject, '门户会员 & 测试 + 100%');
    assert.equal(params.passback_params, '%E6%B5%8B%E8%AF%95');
    assert.equal(params.total_amount, '0.01');
    assert.throws(() => alipay.verifyNotification(raw.replace('total_amount=0.01', 'total_amount=30.00')), { code: 'ALIPAY_NOTIFY_SIGNATURE_INVALID' });
    assert.throws(() => alipay.verifyNotification(raw, { alipayPublicKey: merchant.publicKey }), { code: 'ALIPAY_NOTIFY_SIGNATURE_INVALID' });
    assert.throws(() => alipay.verifyNotification(notification({ sign_type: 'RSA' })), { code: 'ALIPAY_SIGN_TYPE_INVALID' });
    assert.throws(() => alipay.verifyNotification(raw.replace(/&sign_type=RSA2/, '')), { code: 'ALIPAY_SIGN_TYPE_INVALID' });
  });
  check('duplicate form fields and broken UTF-8 never enter fulfilment', () => {
    for (const suffix of ['&total_amount=30.00', '&%74otal_amount=30.00', '&sign=AAAA', '&subject=%E0%A4%A']) {
      assert.throws(() => alipay.verifyNotification(notification() + suffix), { code: 'ALIPAY_NOTIFY_INVALID' });
    }
  });
  const rawBody = '{ "code":"10000", "trade_status":"TRADE_SUCCESS", "total_amount":"0.01", "out_trade_no":"QA_SANDBOX_01", "nested":{"sign":"quoted \\\" brace }","values":[1.0,true,null]} }';
  check('query validates original JSON bytes, not JSON stringify', () => {
    const parsed = alipay.verifyResponse(response(rawBody), 'alipay.trade.query');
    assert.equal(parsed.trade_status, 'TRADE_SUCCESS');
    assert.throws(() => alipay.verifyResponse(response(rawBody).replace('"0.01"', '"30.00"'), 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_SIGNATURE_INVALID' });
    assert.throws(() => alipay.verifyResponse(response(rawBody).replace('[1.0,true,null]', '[1,true,null]'), 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_SIGNATURE_INVALID' });
    assert.throws(() => alipay.verifyResponse('{"alipay_trade_query_response":{"code":"10000"}}', 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_SIGNATURE_INVALID' });
    assert.throws(() => alipay.verifyResponse(response(rawBody), 'alipay.trade.close'), { code: 'ALIPAY_RESPONSE_INVALID' });
  });
  check('ambiguous JSON fields and nested duplicate keys rejected even if signed', () => {
    const duplicate = '{"code":"10000","total_amount":"0.01","total_amount":"30.00"}';
    assert.throws(() => alipay.verifyResponse(response(duplicate), 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_INVALID' });
    assert.throws(() => alipay.verifyResponse(response('{"code":"10000","nested":{"a":1,"\\u0061":2}}'), 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_INVALID' });
    assert.throws(() => alipay.verifyResponse(response(rawBody).replace('{ "sign":', '{ "sign":"duplicate", "sign":'), 'alipay.trade.query'), { code: 'ALIPAY_RESPONSE_INVALID' });
  });
  let transportCalls = 0;
  let nextResponse = null;
  https.request = (url, options, cb) => {
    assert.equal(url.origin, 'https://openapi-sandbox.dl.alipaydev.com');
    assert.equal(options.method, 'POST');
    const req = new EventEmitter();
    req.destroy = (error) => { req.emit('error', error); };
    req.end = (rawForm) => {
      transportCalls += 1;
      const params = { ...Object.fromEntries(url.searchParams), ...Object.fromEntries(new URLSearchParams(rawForm)) };
      assert.equal(createVerify('RSA-SHA256').update(sorted(params), 'utf8').verify(merchant.publicKey, params.sign, 'base64'), true);
      const method = params.method;
      assert.equal(JSON.parse(params.biz_content).out_trade_no, 'QA_SANDBOX_01');
      const res = new EventEmitter();
      res.statusCode = 200;
      process.nextTick(() => {
        cb(res);
        res.emit('data', Buffer.from(nextResponse || response('{"code":"10000","out_trade_no":"QA_SANDBOX_01","trade_status":"TRADE_SUCCESS","total_amount":"0.01"}', method)));
        res.emit('end');
      });
    };
    return req;
  };
  assert.equal((await alipay.queryOrder('QA_SANDBOX_01')).body.total_amount, '0.01');
  assert.equal((await alipay.closeOrder('QA_SANDBOX_01')).body.code, '10000');
  nextResponse = '{"alipay_trade_query_response":{"code":"10000","trade_status":"TRADE_SUCCESS"}}';
  await assert.rejects(alipay.queryOrder('QA_SANDBOX_01'), { code: 'ALIPAY_RESPONSE_SIGNATURE_INVALID' });
  nextResponse = response('{"code":"40004","sub_code":"ACQ.TRADE_NOT_EXIST","sub_msg":"do not log provider payload"}');
  await assert.rejects(alipay.queryOrder('QA_SANDBOX_01'), (error) => {
    assert.equal(error.code, 'ALIPAY_API_ERROR');
    assert.equal(error.providerSubCode, 'ACQ.TRADE_NOT_EXIST');
    assert.equal(JSON.stringify(error).includes('do not log'), false);
    return true;
  });
  check('query/close transport signatures and unsigned success refusal', () => assert.equal(transportCalls, 4));
  console.log(`alipay adapter: PASS (${checks} groups; offline only, no real payment)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  https.request = originalRequest;
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
});
