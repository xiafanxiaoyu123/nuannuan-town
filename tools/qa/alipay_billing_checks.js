'use strict';

// Isolated SQLite + real ephemeral RSA2 signatures. HTTPS is intercepted before
// any operation, so this suite cannot submit a sandbox/production payment.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { generateKeyPairSync, createSign, createVerify } = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const createBilling = require('../../server/billing');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nuannuan-alipay-billing-'));
const db = new DatabaseSync(path.join(tempRoot, 'isolated.sqlite'));
const originalEnv = { ...process.env };
const originalRequest = https.request;
const originalNow = Date.now;
let clock = 1802365200000;
Date.now = () => clock;
let queries = 0;
let responseMode = 'success';
let groups = 0;
const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' }, publicKeyEncoding: { format: 'pem', type: 'spki' } });
const merchant = pair(), platform = pair();
const sign = (text) => createSign('RSA-SHA256').update(text, 'utf8').sign(platform.privateKey, 'base64');
const canonical = (params, notify = false) => Object.keys(params).sort()
  .filter((key) => key !== 'sign' && (!notify || key !== 'sign_type') && params[key] !== '')
  .map((key) => `${key}=${params[key]}`).join('&');

// Keep the legacy order schema deliberately unchanged: createBilling owns the
// additive migration. No production file is required or opened by this test.
db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE);
  CREATE TABLE saves(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER,payload TEXT);
  CREATE TABLE entitlements(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
    feature TEXT NOT NULL,valid_from INTEGER NOT NULL,valid_until INTEGER,source TEXT NOT NULL DEFAULT 'test',
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_id,feature,source));
  CREATE TABLE billing_orders(id TEXT PRIMARY KEY,out_trade_no TEXT NOT NULL UNIQUE,
    client_request_id TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL REFERENCES users(id),sku TEXT NOT NULL,
    description TEXT NOT NULL,amount_fen INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'PENDING',code_url TEXT,transaction_id TEXT,trade_state TEXT,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
    paid_at INTEGER,refunded_at INTEGER,last_error TEXT);
  CREATE TABLE billing_events(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,out_trade_no TEXT,
    transaction_id TEXT,event_type TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL);
`);
const user = (id) => {
  db.prepare('INSERT OR IGNORE INTO users(id,username) VALUES (?,?)').run(id,id);
  return { id, username: id };
};
user('legacy');
db.prepare('INSERT INTO saves VALUES (?,?,?)').run('legacy',7,'{"keep":"original save"}');
db.prepare(`INSERT INTO billing_orders(id,out_trade_no,client_request_id,user_id,sku,description,amount_fen,
  created_at,updated_at,expires_at,code_url) VALUES ('legacy-id','LEGACY_WECHAT','legacy-request','legacy',
  'old-plan','Old WeChat order',1,1,1,2,'weixin://wxpay/legacy')`).run();
const rights = (id) => db.prepare('SELECT * FROM entitlements WHERE user_id=? ORDER BY feature').all(id);
const factory = () => createBilling({ db,
  entitlementView: (id) => ({ entitlements: rights(id).map((r) => ({ feature:r.feature,validUntil:r.valid_until })) }),
  userView: (u) => ({ id:u.id,username:u.username }),
});
let billing = factory();
const row = (order) => db.prepare('SELECT * FROM billing_orders WHERE out_trade_no=?').get(order.outTradeNo || order);
const body = (id, extra = {}) => ({ clientRequestId:id,acceptedTerms:true,...extra });
async function create(id, key, extra = {}) { clock += 10; return (await billing.createOrder(user(id),body(key,extra))).order; }
function notify(order, overrides = {}) {
  const params = {
    app_id: '2021000000000001', seller_id: '2088000000000001',
    out_trade_no: order.outTradeNo, total_amount:'0.01', trade_no:`TRADE_${order.outTradeNo}`,
    trade_status:'TRADE_SUCCESS', notify_id:`EVENT_${order.outTradeNo}`, sign_type:'RSA2',
    notify_type:'trade_status_sync', buyer_logon_id:'buyer-private-qa@example.test', ...overrides,
  };
  params.sign = sign(canonical(params,true));
  return new URLSearchParams(params).toString();
}
function proof(order) { return JSON.stringify({row:row(order),rights:rights(row(order).user_id)}); }
function check(name, action) { action(); groups += 1; console.log(`PASS ${name}`); }
async function checked(name, action) { await action(); groups += 1; console.log(`PASS ${name}`); }
function production(allowed = []) {
  Object.assign(process.env, { ALIPAY_ENV:'production',PAYMENT_CHECKOUT_ENABLED:'1',
    PORTAL_COMMERCE_READY:'1',PAYMENT_TEST_MODE:'1',PAYMENT_TEST_USER_IDS:allowed.join(',') });
}

https.request = (url, options, callback) => {
  queries += 1;
  assert.equal(url.origin,'https://openapi.alipay.com');
  assert.equal(options.method,'POST');
  const request = new EventEmitter();
  request.destroy = (failure) => request.emit('error',failure);
  request.end = (form) => {
    const params = {...Object.fromEntries(url.searchParams),...Object.fromEntries(new URLSearchParams(form))};
    assert.equal(params.method,'alipay.trade.query');
    assert.equal(createVerify('RSA-SHA256').update(canonical(params),'utf8').verify(merchant.publicKey,params.sign,'base64'),true);
    const no = JSON.parse(params.biz_content).out_trade_no;
    const payload = JSON.stringify({ code:'10000',msg:'Success',out_trade_no:responseMode==='wrong-order'?'OTHER_ORDER':no,
      trade_no:`TRADE_${no}`,trade_status:responseMode==='closed'?'TRADE_CLOSED':'TRADE_SUCCESS',total_amount:responseMode==='wrong-amount'?'1.00':'0.01' });
    const signed = responseMode==='bad-signature' ? sign(payload+'tampered') : sign(payload);
    const response = new EventEmitter(); response.statusCode=200;
    process.nextTick(() => { callback(response); response.emit('data',Buffer.from(`{"alipay_trade_query_response":${payload},"sign":${JSON.stringify(signed)}}`)); response.emit('end'); });
  };
  return request;
};

async function main() {
  for (const name of Object.keys(process.env)) {
    if (/^(ALIPAY_|WECHAT_|PAYMENT_|PORTAL_)/.test(name)) delete process.env[name];
  }
  Object.assign(process.env, {
    PUBLIC_FREE_ENTITLEMENTS:'0',
    PAYMENT_PROVIDER:'alipay_page',PAYMENT_CHECKOUT_ENABLED:'1',PAYMENT_TEST_MODE:'1',PAYMENT_TEST_USER_IDS:'',
    PORTAL_COMMERCE_READY:'0',ALIPAY_WAP_ENABLED:'0',ALIPAY_ENV:'sandbox',
    ALIPAY_APP_ID:'2021000000000001',ALIPAY_SELLER_ID:'2088000000000001',
    ALIPAY_PRIVATE_KEY_PEM:merchant.privateKey,ALIPAY_PUBLIC_KEY_PEM:platform.publicKey,
    ALIPAY_NOTIFY_URL:'https://example.test/api/billing/alipay/notify',
    ALIPAY_RETURN_URL:'https://example.test/membership.html',PORTAL_MEMBER_PRICE_FEN:'1',PORTAL_MEMBER_DAYS:'30',
  });
  check('additive legacy migration preserves account, save and WeChat order', () => {
    assert.equal(row('LEGACY_WECHAT').provider,'wechat_native');
    assert.equal(row('LEGACY_WECHAT').environment,'production');
    assert.equal(row('LEGACY_WECHAT').code_url,'weixin://wxpay/legacy');
    assert.equal(db.prepare('SELECT revision FROM saves WHERE user_id=?').get('legacy').revision,7);
    assert.equal(db.prepare('SELECT payload FROM saves WHERE user_id=?').get('legacy').payload,'{"keep":"original save"}');
    billing=factory();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_orders').get().n,1);
  });
  const sandboxOrder=await create('sandbox-user','qa_sandbox_order_0001');
  await checked('public free access blocks checkout even when payment config is complete', async () => {
    process.env.PUBLIC_FREE_ENTITLEMENTS='1';
    const beforeCount=db.prepare('SELECT COUNT(*) AS n FROM billing_orders').get().n;
    assert.equal(billing.status().mode,'free-public');
    assert.equal(billing.status().checkoutEnabled,false);
    assert.equal(billing.status().freeEntitlements,true);
    await assert.rejects(create('free-user','qa_free_order_blocked'),(e)=>e.code==='PUBLIC_FREE_ACCESS');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_orders').get().n,beforeCount);
    assert.equal(billing.list('sandbox-user')[0].paymentUrl,null);
    process.env.PUBLIC_FREE_ENTITLEMENTS='0';
    const paused=createBilling({db,entitlementView:()=>({entitlements:[]}),userView:(u)=>u,serviceSettings:()=>({freeEntitlements:false,checkoutPaused:true})});
    assert.equal(paused.status().checkoutEnabled,false);
    await assert.rejects(paused.createOrder(user('paused-user'),body('qa_paused_order_blocked')),(e)=>e.code==='PAYMENT_NOT_CONFIGURED');
    assert.equal(paused.list('sandbox-user')[0].paymentUrl,null);
  });
  check('sandbox RSA2 payment records PAID without production entitlements', () => {
    assert.equal(billing.status().sandbox,true);
    assert.equal(billing.status().checkoutEnabled,true);
    assert.equal(row(sandboxOrder).environment,'sandbox');
    billing.notifyAlipay(notify(sandboxOrder));
    assert.equal(row(sandboxOrder).status,'PAID');
    assert.equal(rights('sandbox-user').length,0);
  });
  production([]);
  await checked('production commerce/readiness/checkout/allowlist/terms gates', async () => {
    assert.equal(billing.status().checkoutEnabled,false);
    assert(billing.status().missing.includes('PAYMENT_TEST_USER_IDS'));
    process.env.PAYMENT_TEST_USER_IDS='payer-a';
    process.env.PORTAL_COMMERCE_READY='0';
    assert.equal(billing.status().checkoutEnabled,false);
    await assert.rejects(billing.createOrder(user('payer-a'),body('qa_gate_request_0001')),{code:'PAYMENT_NOT_CONFIGURED'});
    process.env.PORTAL_COMMERCE_READY='1';
    process.env.PAYMENT_CHECKOUT_ENABLED='0';
    assert.equal(billing.status().checkoutEnabled,false);
    process.env.PAYMENT_CHECKOUT_ENABLED='1';
    await assert.rejects(billing.createOrder(user('not-allowed'),body('qa_gate_request_0001')),{code:'PAYMENT_TEST_ACCOUNT_REQUIRED'});
    await assert.rejects(billing.createOrder(user('payer-a'),body('qa_gate_request_0001',{acceptedTerms:false})),{code:'PAYMENT_TERMS_REQUIRED'});
  });
  production(['payer-a','payer-b','query-user','query-reject','off-user','env-user','reuse-user']);
  const first=await create('payer-a','qa_shared_idempotency_001',{channel:'wap'});
  const other=await create('payer-b','qa_shared_idempotency_001');
  await checked('account-scoped idempotency, ownership, snapshots and WAP gate', async () => {
    assert.notEqual(first.outTradeNo,other.outTradeNo);
    assert.equal(first.channel,'page');
    const repeat=await billing.createOrder(user('payer-a'),body('qa_shared_idempotency_001'));
    assert.equal(repeat.idempotent,true); assert.equal(repeat.order.outTradeNo,first.outTradeNo);
    const pending=await billing.createOrder(user('payer-a'),body('qa_different_request_001'));
    assert.equal(pending.order.outTradeNo,first.outTradeNo);
    await assert.rejects(billing.userOrder('payer-b',first.outTradeNo),{code:'PAYMENT_ORDER_NOT_FOUND'});
    assert.equal(queries,0);
    assert.equal(row(first).plan_days,30);
    assert.equal(row(first).payment_app_id,process.env.ALIPAY_APP_ID);
    assert.equal(row(first).payment_seller_id,process.env.ALIPAY_SELLER_ID);
    assert.deepEqual(JSON.parse(row(first).gift_features),['cloud_sync','auto_update']);
    assert.equal(new URL(new URL(first.paymentUrl).searchParams.get('return_url')).searchParams.get('payment_return'),'1');
    assert.equal(billing.list('payer-b').length,1);
  });
  check('validly signed wrong amount/app/seller/environment cannot fulfil', () => {
    const unchanged=proof(first);
    assert.throws(()=>billing.notifyAlipay(notify(first,{total_amount:'0.02'})),{code:'PAYMENT_AMOUNT_MISMATCH'});
    assert.throws(()=>billing.notifyAlipay(notify(first,{app_id:'2021000000000002'})),{code:'ALIPAY_IDENTITY_MISMATCH'});
    assert.throws(()=>billing.notifyAlipay(notify(first,{seller_id:'2088000000000002'})),{code:'ALIPAY_IDENTITY_MISMATCH'});
    process.env.ALIPAY_ENV='sandbox';
    assert.throws(()=>billing.notifyAlipay(notify(first)),{code:'PAYMENT_ENVIRONMENT_MISMATCH'});
    process.env.ALIPAY_ENV='production';
    assert.throws(()=>billing.notifyAlipay(notify(first).replace('total_amount=0.01','total_amount=0.02')),{code:'ALIPAY_NOTIFY_SIGNATURE_INVALID'});
    assert.equal(proof(first),unchanged);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_events WHERE out_trade_no=?').get(first.outTradeNo).n,0);
  });
  check('late callback honours purchase-time term snapshot and grants exactly once', () => {
    process.env.PORTAL_MEMBER_DAYS='365';
    db.prepare('UPDATE billing_orders SET expires_at=? WHERE id=?').run(clock-1,first.id);
    billing.notifyAlipay(notify(first));
    const entitlements=rights('payer-a');
    assert.equal(row(first).status,'PAID'); assert.equal(entitlements.length,3);
    assert(entitlements.every((e)=>e.valid_until-clock===30*86400000));
    const unchanged=JSON.stringify(entitlements);
    assert.equal(billing.notifyAlipay(notify(first)).duplicate,true);
    billing.notifyAlipay(notify(first,{notify_id:'NEW_NOTIFICATION_SAME_TRANSACTION'}));
    assert.equal(JSON.stringify(rights('payer-a')),unchanged);
    const savedEvents=db.prepare('SELECT body_json FROM billing_events WHERE out_trade_no=?').all(first.outTradeNo);
    assert(savedEvents.every((e)=>!e.body_json.includes('buyer-private-qa')));
  });
  check('reused notification ID and reused transaction across orders rejected atomically', () => {
    assert.throws(()=>billing.notifyAlipay(notify(other,{notify_id:`EVENT_${first.outTradeNo}`})));
    assert.throws(()=>billing.notifyAlipay(notify(other,{trade_no:`TRADE_${first.outTradeNo}`,notify_id:'DUPLICATE_TRADE_OTHER_ORDER'})));
    assert.equal(row(other).status,'PENDING'); assert.equal(rights('payer-b').length,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_events WHERE out_trade_no=?').get(other.outTradeNo).n,0);
  });
  check('paid TRADE_CLOSED queues refund review and later success does not grant again', () => {
    const entitlementState=JSON.stringify(rights('payer-a'));
    billing.notifyAlipay(notify(first,{notify_id:'REFUND_CLOSED_EVENT',trade_status:'TRADE_CLOSED'}));
    assert.equal(row(first).status,'REFUND_REVIEW'); assert(row(first).refunded_at);
    billing.notifyAlipay(notify(first,{notify_id:'DELAYED_SUCCESS_AFTER_REFUND'}));
    assert.equal(row(first).status,'REFUND_REVIEW');
    assert.equal(JSON.stringify(rights('payer-a')),entitlementState);
  });
  process.env.PORTAL_MEMBER_DAYS='7';
  const offlineOrder=await create('off-user','qa_before_disabled_0001');
  const queryOrder=await create('query-user','qa_query_order_0001');
  const rejectOrder=await create('query-reject','qa_query_reject_0001');
  process.env.PAYMENT_CHECKOUT_ENABLED='0'; process.env.PORTAL_COMMERCE_READY='0'; process.env.PAYMENT_TEST_USER_IDS='';
  check('closing checkout does not discard a previously issued payment callback', () => {
    assert.equal(billing.status().checkoutEnabled,false);
    billing.notifyAlipay(notify(offlineOrder));
    assert.equal(row(offlineOrder).status,'PAID');
    assert.equal(rights('off-user').length,3);
    assert(rights('off-user').every((e)=>e.valid_until-clock===7*86400000));
  });
  await checked('expired link still reconciles signed query without app_id/seller_id fields', async () => {
    db.prepare('UPDATE billing_orders SET expires_at=? WHERE id=?').run(clock-1,queryOrder.id);
    const result=await billing.userOrder('query-user',queryOrder.outTradeNo);
    assert.equal(result.order.status,'PAID'); assert.equal(result.queryMessage,null);
    assert.equal(result.order.paymentUrl,null); assert.equal(rights('query-user').length,3);
    assert(rights('query-user').every((e)=>e.valid_until-clock===7*86400000));
    const count=queries;
    await billing.userOrder('query-user',queryOrder.outTradeNo);
    assert.equal(queries,count);
  });
  await checked('bad query signature, wrong order and amount never grant rights', async () => {
    for (const mode of ['bad-signature','wrong-order','wrong-amount']) {
      clock+=6000; responseMode=mode;
      const result=await billing.userOrder('query-reject',rejectOrder.outTradeNo);
      assert.equal(result.order.status,'PENDING'); assert(result.queryMessage);
      assert.equal(rights('query-reject').length,0);
    }
    responseMode='success';
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_events WHERE out_trade_no=?').get(rejectOrder.outTradeNo).n,0);
  });
  await checked('paid order query after 60 seconds detects full refund without extending rights', async () => {
    const unchanged=JSON.stringify(rights('query-user'));
    clock+=60001; responseMode='closed';
    const result=await billing.userOrder('query-user',queryOrder.outTradeNo);
    assert.equal(result.order.status,'REFUND_REVIEW');
    assert.equal(JSON.stringify(rights('query-user')),unchanged);
    responseMode='success';
  });
  await checked('pending reuse and idempotency are isolated across environment/app/seller snapshots', async () => {
    production(['env-user']);
    process.env.ALIPAY_ENV='sandbox';
    const oldSandbox=await create('env-user','qa_environment_request_0001');
    process.env.ALIPAY_ENV='production';
    await assert.rejects(billing.createOrder(user('env-user'),body('qa_environment_request_0001')),{code:'PAYMENT_ENVIRONMENT_CHANGED'});
    const newProduction=await create('env-user','qa_environment_request_0002');
    assert.notEqual(newProduction.outTradeNo,oldSandbox.outTradeNo);
    assert.equal(row(newProduction).environment,'production');
    assert.equal(new URL(newProduction.paymentUrl).origin,'https://openapi.alipay.com');
    process.env.ALIPAY_APP_ID='2021000000000002';
    await assert.rejects(billing.createOrder(user('env-user'),body('qa_environment_request_0002')),{code:'PAYMENT_ENVIRONMENT_CHANGED'});
    const otherApp=await create('env-user','qa_environment_request_0003');
    assert.notEqual(otherApp.outTradeNo,newProduction.outTradeNo);
    assert.equal(row(otherApp).payment_app_id,'2021000000000002');
    process.env.ALIPAY_SELLER_ID='2088000000000002';
    await assert.rejects(billing.createOrder(user('env-user'),body('qa_environment_request_0003')),{code:'PAYMENT_ENVIRONMENT_CHANGED'});
    process.env.ALIPAY_WAP_ENABLED='1';
    const otherSeller=await create('env-user','qa_environment_request_0004',{channel:'wap'});
    assert.notEqual(otherSeller.outTradeNo,otherApp.outTradeNo);
    assert.equal(row(otherSeller).payment_seller_id,'2088000000000002');
    assert.equal(otherSeller.channel,'wap');
    process.env.ALIPAY_APP_ID='2021000000000001'; process.env.ALIPAY_SELLER_ID='2088000000000001';
    process.env.ALIPAY_WAP_ENABLED='0';
  });
  await checked('trade identity locks on the first verified state and review states cannot downgrade', async () => {
    production(['state-user','reuse-user','finished-user']);
    const stateOrder=await create('state-user','qa_state_transition_0001');
    const reusedOrder=await create('reuse-user','qa_state_transition_0002');
    billing.notifyAlipay(notify(stateOrder,{trade_no:'STATE_TRADE',trade_status:'WAIT_BUYER_PAY',notify_id:'STATE_WAIT'}));
    assert.equal(row(stateOrder).transaction_id,'STATE_TRADE');
    assert.equal(row(stateOrder).status,'PENDING');
    assert.throws(()=>billing.notifyAlipay(notify(reusedOrder,{trade_no:'STATE_TRADE',trade_status:'WAIT_BUYER_PAY',notify_id:'STATE_REUSE'})));
    assert.equal(row(reusedOrder).transaction_id,null);
    assert.throws(()=>billing.notifyAlipay(notify(stateOrder,{trade_no:'DIFFERENT_TRADE',notify_id:'STATE_WRONG_TRANSACTION'})));
    billing.notifyAlipay(notify(stateOrder,{trade_no:'STATE_TRADE',trade_status:'TRADE_CLOSED',notify_id:'STATE_CLOSED'}));
    assert.equal(row(stateOrder).status,'CLOSED');
    billing.notifyAlipay(notify(stateOrder,{trade_no:'STATE_TRADE',trade_status:'TRADE_SUCCESS',notify_id:'STATE_LATE_SUCCESS'}));
    assert.equal(row(stateOrder).status,'REFUND_REVIEW');
    assert.equal(rights('state-user').length,0);
    billing.notifyAlipay(notify(stateOrder,{trade_no:'STATE_TRADE',trade_status:'TRADE_CLOSED',notify_id:'STATE_RECLOSED'}));
    assert.equal(row(stateOrder).status,'REFUND_REVIEW');
    assert.equal(rights('state-user').length,0);
    const finishedOrder=await create('finished-user','qa_finished_state_0001');
    assert.throws(()=>billing.notifyAlipay(notify(finishedOrder,{trade_status:'UNKNOWN_STATUS'})));
    billing.notifyAlipay(notify(finishedOrder,{trade_status:'TRADE_FINISHED'}));
    assert.equal(row(finishedOrder).status,'PAID');
    assert.equal(rights('finished-user').length,3);
  });
  console.log(`alipay billing: PASS (${groups} groups; isolated SQLite, real ephemeral RSA2, no provider traffic)`);
}

main().catch((failure)=>{ console.error(failure); process.exitCode=1; }).finally(()=>{
  https.request=originalRequest; Date.now=originalNow; db.close();
  for(const name of Object.keys(process.env)) if(!Object.hasOwn(originalEnv,name)) delete process.env[name];
  Object.assign(process.env,originalEnv);
  // Only the exact mkdtemp-created test directory is disposable.
  if (path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(tempRoot).startsWith('nuannuan-alipay-billing-')) {
    fs.rmSync(tempRoot,{recursive:true,force:true});
  }
});
