'use strict';

// Relaunch with only OS variables before loading any server module. Generated
// RSA keys, :memory: SQLite and an intercepted HTTPS transport are the only data.
if (process.env.NUANNUAN_PAYMENT_QA_ISOLATED !== '1') {
  const { spawnSync } = require('node:child_process');
  const env = {};
  for (const name of ['PATH','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  env.NUANNUAN_PAYMENT_QA_ISOLATED = '1';
  const result = spawnSync(process.execPath, [__filename], { env, stdio:'inherit', windowsHide:true });
  if (result.error) throw result.error;
  process.exit(result.status === null ? 1 : result.status);
}

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const https = require('node:https');
const pair = () => crypto.generateKeyPairSync('rsa', { modulusLength:2048,
  privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'} });
const merchant = pair(), platform = pair();
// A generated self-signed X.509 fixture exercises the actual certificate PEM
// path without checking in a private key or depending on an OpenSSL executable.
function certificateFor(keys) {
  const der = (tag, value) => {
    const size = value.length, bytes = [];
    for (let rest=size; rest; rest=Math.floor(rest/256)) bytes.unshift(rest%256);
    return Buffer.concat([Buffer.from([tag,...(size<128?[size]:[128+bytes.length,...bytes])]),value]);
  };
  const seq = (...parts) => der(0x30,Buffer.concat(parts));
  const algorithm=Buffer.from('300d06092a864886f70d01010b0500','hex');
  const name=seq(der(0x31,seq(Buffer.from('0603550403','hex'),der(0x0c,Buffer.from('Synthetic WeChat QA')))));
  const validity=seq(der(0x17,Buffer.from('250101000000Z')),der(0x17,Buffer.from('350101000000Z')));
  const publicDer=crypto.createPublicKey(keys.publicKey).export({type:'spki',format:'der'});
  const tbs=seq(Buffer.from('a003020102020101','hex'),algorithm,name,validity,name,publicDer);
  const signed=crypto.createSign('RSA-SHA256').update(tbs).sign(keys.privateKey);
  const certificate=seq(tbs,algorithm,der(0x03,Buffer.concat([Buffer.from([0]),signed])));
  return new crypto.X509Certificate(certificate).toString();
}
const platformCertificate = certificateFor(platform);
const originalRequest = https.request, originalNow = Date.now;
let clock = originalNow(), mode = 'success', queries = 0, groups = 0;
let payload = { out_trade_no:'ADAPTER', trade_state:'SUCCESS' }, statusCode = 200;
Date.now = () => clock;
function signature(raw, serial = 'PUB_KEY_ID_QA_PLATFORM') {
  const timestamp = String(Math.floor(clock / 1000)), nonce = 'synthetic-response-nonce';
  const sign = crypto.createSign('RSA-SHA256').update(`${timestamp}\n${nonce}\n${raw}\n`).sign(platform.privateKey,'base64');
  return { 'wechatpay-serial':serial, 'wechatpay-signature':sign, 'wechatpay-timestamp':timestamp, 'wechatpay-nonce':nonce };
}
https.request = (options, callback) => {
  queries += 1;
  assert.equal(options.hostname,'api.mch.weixin.qq.com');
  const req = new EventEmitter();
  let requestBody = '';
  req.write = (chunk) => { requestBody += chunk; };
  req.destroy = (failure) => req.emit('error',failure);
  req.end = () => {
    const values = Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]*)"/g)].map((m)=>[m[1],m[2]]));
    assert.equal(crypto.createVerify('RSA-SHA256').update(`${options.method}\n${options.path}\n${values.timestamp}\n${values.nonce_str}\n${requestBody}\n`).verify(merchant.publicKey,values.signature,'base64'),true);
    process.nextTick(() => {
      if (mode === 'request-error') return req.emit('error',Object.assign(new Error('request reset'),{code:'ECONNRESET'}));
      if (mode === 'timeout') return req.emit('timeout');
      const raw = statusCode === 204 ? '' : JSON.stringify(payload);
      const res = new EventEmitter();
      res.statusCode = statusCode;
      res.headers = mode === 'missing-headers' ? {} : signature(raw,mode === 'legacy-certificate' ? 'QA_PLATFORM_CERT_SERIAL' : 'PUB_KEY_ID_QA_PLATFORM');
      if (mode === 'wrong-key-id') res.headers['wechatpay-serial'] = 'PUB_KEY_ID_WRONG';
      if (mode === 'expired-signature') res.headers['wechatpay-timestamp'] = String(Math.floor(clock/1000)-301);
      res.complete = mode !== 'incomplete-end';
      callback(res);
      if (mode === 'response-error') {
        res.emit('error',Object.assign(new Error('response reset'),{code:'ECONNRESET'}));
        res.emit('aborted'); res.emit('close'); return;
      }
      if (mode === 'aborted') { res.emit('aborted'); res.emit('close'); return; }
      if (mode === 'premature-close') { res.emit('close'); return; }
      res.emit('data',Buffer.from(mode === 'tampered' ? raw+' ' : raw));
      res.emit('end');
      res.emit('close');
      // A late error must still have a listener; it cannot crash the API process.
      res.emit('error',Object.assign(new Error('late response reset'),{code:'ECONNRESET'}));
    });
  };
  return req;
};
const wechat = require('../../server/wechat-pay');
const createBilling = require('../../server/billing');
const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE);
  CREATE TABLE saves(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER,payload TEXT);
  CREATE TABLE entitlements(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),feature TEXT NOT NULL,
    valid_from INTEGER NOT NULL,valid_until INTEGER,source TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
    UNIQUE(user_id,feature,source));
  CREATE TABLE billing_orders(id TEXT PRIMARY KEY,out_trade_no TEXT NOT NULL UNIQUE,client_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id),sku TEXT NOT NULL,description TEXT NOT NULL,amount_fen INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',status TEXT NOT NULL DEFAULT 'PENDING',code_url TEXT,transaction_id TEXT,trade_state TEXT,
    created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,paid_at INTEGER,refunded_at INTEGER,last_error TEXT);
  CREATE TABLE billing_events(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,out_trade_no TEXT,transaction_id TEXT,
    event_type TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL);
`);
const user = { id:'synthetic-payer',username:'synthetic-payer' };
db.prepare('INSERT INTO users VALUES (?,?)').run(user.id,user.username);
db.prepare('INSERT INTO saves VALUES (?,?,?)').run(user.id,17,'{"untouched":"player progress"}');
const rights = () => db.prepare('SELECT * FROM entitlements ORDER BY feature').all();
const billing = createBilling({db,entitlementView:()=>({entitlements:rights()}),userView:(u)=>u});
const row = (no) => db.prepare('SELECT * FROM billing_orders WHERE out_trade_no=?').get(no);
function insert(no, extra = {}) {
  db.prepare(`INSERT INTO billing_orders(id,out_trade_no,client_request_id,user_id,sku,description,amount_fen,
    status,created_at,updated_at,expires_at,provider,environment,payment_app_id,payment_seller_id,plan_days,gift_features,
    paid_at,transaction_id,trade_state) VALUES (?,?,?,?,?,'Synthetic membership',1,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no,no,`request_${no}`,user.id,'legacy-plan',extra.status||'PENDING',clock,clock,clock+60000,
      'wechat_native','production','qa-app','qa-merchant',extra.legacy?null:30,extra.legacy?null:'["cloud_sync","auto_update"]',
      extra.paidAt||null,extra.transactionId||null,extra.state||null);
  return no;
}
function data(no, state = 'SUCCESS', extra = {}) {
  return {appid:'qa-app',mchid:'qa-merchant',out_trade_no:no,transaction_id:`transaction_${no}`,
    trade_state:state,amount:{total:1,currency:'CNY'},...extra};
}
function notify(no, state, eventId, extra = {}) {
  const nonce = 'qa-nonce-123', associated = 'transaction';
  const cipher = crypto.createCipheriv('aes-256-gcm',Buffer.from(process.env.WECHAT_API_V3_KEY),Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associated));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data(no,state,extra)),'utf8'),cipher.final(),cipher.getAuthTag()]);
  const raw = JSON.stringify({id:eventId,event_type:'TRANSACTION.SUCCESS',resource:{algorithm:'AEAD_AES_256_GCM',
    nonce,associated_data:associated,ciphertext:encrypted.toString('base64')}});
  return billing.notifyWechat(raw,signature(raw));
}
async function check(name, action) { await action(); groups++; console.log(`PASS ${name}`); }
async function main() {
  Object.assign(process.env,{PUBLIC_FREE_ENTITLEMENTS:'1',PAYMENT_PROVIDER:'wechat_native',PAYMENT_CHECKOUT_ENABLED:'0',
    PORTAL_COMMERCE_READY:'0',WECHAT_MCHID:'qa-merchant',WECHAT_APPID:'qa-app',WECHAT_SERIAL_NO:'qa-merchant-serial',
    WECHAT_PRIVATE_KEY_PEM:merchant.privateKey,WECHAT_API_V3_KEY:'0123456789abcdef0123456789abcdef',
    WECHAT_NOTIFY_URL:'https://example.test/never-called',WECHAT_PUBLIC_KEY_ID:'PUB_KEY_ID_QA_PLATFORM',
    WECHAT_PUBLIC_KEY_PEM:platform.publicKey,PORTAL_MEMBER_PRICE_FEN:'1',PORTAL_MEMBER_DAYS:'30'});
  await check('free access and checkout disabled reject creation without any provider request',async()=>{
    assert.equal(billing.status().checkoutEnabled,false);
    assert.equal(billing.status().mode,'free-public');
    await assert.rejects(billing.createOrder(user,{clientRequestId:'closed_checkout_request',acceptedTerms:true}),{code:'PUBLIC_FREE_ACCESS'});
    process.env.PUBLIC_FREE_ENTITLEMENTS='0';
    assert.equal(billing.status().mode,'disabled');
    assert.equal(billing.status().checkoutEnabled,false);
    await assert.rejects(billing.createOrder(user,{clientRequestId:'closed_checkout_request',acceptedTerms:true}),{code:'PAYMENT_NOT_CONFIGURED'});
    process.env.PUBLIC_FREE_ENTITLEMENTS='1';
    assert.equal(queries,0); assert.equal(db.prepare('SELECT count(*) n FROM billing_orders').get().n,0);
  });
  await check('missing verification material is unconfigured for queries and callbacks',async()=>{
    delete process.env.WECHAT_PUBLIC_KEY_PEM;
    assert.equal(wechat.configured().ok,false);
    assert.equal(wechat.configured({callback:true}).ok,false);
    const count = queries;
    await assert.rejects(wechat.queryOrder('ADAPTER'),{code:'WECHAT_NOT_CONFIGURED'});
    assert.equal(queries,count);
    process.env.WECHAT_PUBLIC_KEY_PEM=platform.publicKey;
    delete process.env.WECHAT_PUBLIC_KEY_ID;
    assert.equal(wechat.configured().ok,false);
    process.env.WECHAT_PUBLIC_KEY_ID='PUB_KEY_ID_QA_PLATFORM';
    assert.equal(wechat.configured().ok,true);
  });
  await check('signed response raw body and 204 empty body verify with public key',async()=>{
    mode='success'; statusCode=200;
    assert.equal((await wechat.queryOrder('ADAPTER')).body.trade_state,'SUCCESS');
    statusCode=204; assert.deepEqual((await wechat.closeOrder('ADAPTER')).body,{}); statusCode=200;
  });
  await check('legacy platform certificate remains compatible with and without explicit serial',async()=>{
    delete process.env.WECHAT_PUBLIC_KEY_PEM;
    process.env.WECHAT_PLATFORM_CERT_PEM=platformCertificate;
    process.env.WECHAT_PLATFORM_SERIAL_NO='QA_PLATFORM_CERT_SERIAL';
    mode='legacy-certificate';
    assert.equal(wechat.configured().ok,true);
    assert.equal((await wechat.queryOrder('ADAPTER')).status,200);
    delete process.env.WECHAT_PLATFORM_SERIAL_NO;
    assert.equal((await wechat.queryOrder('ADAPTER')).status,200);
    process.env.WECHAT_PLATFORM_SERIAL_NO='WRONG_SERIAL';
    await assert.rejects(wechat.queryOrder('ADAPTER'),{code:'WECHAT_PLATFORM_SERIAL_MISMATCH'});
    delete process.env.WECHAT_PLATFORM_SERIAL_NO; delete process.env.WECHAT_PLATFORM_CERT_PEM;
    process.env.WECHAT_PUBLIC_KEY_PEM=platform.publicKey;
  });
  await check('missing signature, changed body, expired timestamp and wrong key ID reject',async()=>{
    for(const [value,code] of [['missing-headers','WECHAT_SIGNATURE_HEADERS_MISSING'],['tampered','WECHAT_SIGNATURE_INVALID'],
      ['expired-signature','WECHAT_SIGNATURE_EXPIRED'],['wrong-key-id','WECHAT_PUBLIC_KEY_ID_MISMATCH']]){
      mode=value; await assert.rejects(wechat.queryOrder('ADAPTER'),{code});
    }
  });
  await check('response reset, abort, early close and incomplete end reject without process failure or hang',async()=>{
    for(const [value,code] of [['response-error','ECONNRESET'],['aborted','WECHAT_API_RESPONSE_ABORTED'],
      ['premature-close','WECHAT_API_RESPONSE_INCOMPLETE'],['incomplete-end','WECHAT_API_RESPONSE_INCOMPLETE']]){
      mode=value; await assert.rejects(wechat.queryOrder('ADAPTER'),{code});
    }
  });
  await check('request errors, timeout and non-success HTTP remain order-scoped failures',async()=>{
    mode='request-error'; await assert.rejects(wechat.queryOrder('ADAPTER'),{code:'ECONNRESET'});
    mode='timeout'; await assert.rejects(wechat.queryOrder('ADAPTER'),{code:'WECHAT_API_TIMEOUT'});
    mode='success'; statusCode=502; await assert.rejects(wechat.queryOrder('ADAPTER'),{code:'WECHAT_API_ERROR'}); statusCode=200;
  });
  await check('invalid signed query data or transport failure never fulfils an order',async()=>{
    const no=insert('reject-query');
    for(const value of ['missing-headers','tampered','response-error','aborted','premature-close']){
      mode=value; payload=data(no); clock+=6001;
      const result=await billing.userOrder(user.id,no);
      assert.equal(result.order.status,'PENDING'); assert(result.queryMessage);
      assert.equal(rights().length,0); assert.equal(row(no).paid_at,null);
    }
    mode='success'; payload=data(no,'SUCCESS',{amount:{total:2,currency:'CNY'}}); clock+=6001;
    assert((await billing.userOrder(user.id,no)).queryMessage);
    assert.equal(row(no).status,'PENDING'); assert.equal(rights().length,0);
  });
  await check('valid query fulfils once with checkout still closed and original term snapshot',async()=>{
    const no=insert('paid-query'); payload=data(no); mode='success'; clock+=6001;
    const result=await billing.userOrder(user.id,no);
    assert.equal(result.order.status,'PAID'); assert.equal(result.queryMessage,null);
    assert.equal(result.order.codeUrl,null); assert.equal(billing.status().checkoutEnabled,false);
    assert.equal(rights().length,3); assert(rights().every((r)=>r.valid_until-clock===30*86400000));
    const before=JSON.stringify(rights());
    notify(no,'SUCCESS','repeat-success-1'); notify(no,'SUCCESS','repeat-success-2');
    assert.equal(JSON.stringify(rights()),before);
  });
  await check('REFUND query queues review without claiming completed/full refund or removing rights',async()=>{
    const no='paid-query', before=JSON.stringify(rights());
    mode='success'; payload=data(no,'REFUND'); clock+=60001;
    const result=await billing.userOrder(user.id,no);
    assert.equal(result.order.status,'REFUND_REVIEW'); assert.equal(result.order.tradeState,'REFUND');
    assert.equal(result.order.refundedAt,null); assert.equal(JSON.stringify(rights()),before);
    assert.equal(row(no).paid_at!==null,true);
    const previous=JSON.stringify(row(no));
    const replay=notify(no,'REFUND',`query:${no}:transaction_${no}:REFUND`);
    assert.equal(replay.duplicate,true); assert.equal(JSON.stringify(row(no)),previous);
    notify(no,'SUCCESS','late-success-after-refund'); notify(no,'CLOSED','late-close-after-refund');
    assert.equal(row(no).status,'REFUND_REVIEW'); assert.equal(row(no).trade_state,'REFUND');
    assert.equal(row(no).refunded_at,null); assert.equal(JSON.stringify(rights()),before);
  });
  await check('refund-before-success and repeated refunds never grant or silently revoke rights',async()=>{
    const no=insert('refund-first'), before=JSON.stringify(rights());
    notify(no,'REFUND','refund-before-success');
    assert.equal(row(no).status,'REFUND_REVIEW'); assert.equal(row(no).paid_at,null);
    assert.equal(notify(no,'REFUND','refund-before-success').duplicate,true);
    notify(no,'SUCCESS','delayed-success-refund-first');
    notify(no,'REFUND','second-refund-event');
    assert.equal(row(no).status,'REFUND_REVIEW'); assert.equal(row(no).refunded_at,null);
    assert.equal(JSON.stringify(rights()),before);
  });
  await check('legacy PAID order without fulfilment snapshot enters review without regrant',async()=>{
    const no=insert('legacy-paid',{legacy:true,status:'PAID',paidAt:clock-60000,transactionId:'transaction_legacy-paid',state:'SUCCESS'});
    const before=JSON.stringify(rights()); payload=data(no,'REFUND'); clock+=60001;
    assert.equal((await billing.userOrder(user.id,no)).order.status,'REFUND_REVIEW');
    assert.equal(row(no).refunded_at,null); assert.equal(JSON.stringify(rights()),before);
    assert.equal(row(no).plan_days,null);
  });
  await check('refund transaction conflicts are atomic and manually settled orders never downgrade',async()=>{
    const no=insert('refund-mismatch',{status:'PAID',paidAt:clock-60000,transactionId:'expected-transaction'});
    const before=JSON.stringify(row(no));
    assert.throws(()=>notify(no,'REFUND','wrong-transaction'));
    assert.equal(JSON.stringify(row(no)),before);
    assert.equal(db.prepare('SELECT count(*) n FROM billing_events WHERE out_trade_no=?').get(no).n,0);
    db.prepare("UPDATE billing_orders SET status='REFUNDED',refunded_at=? WHERE out_trade_no=?").run(clock,no);
    notify(no,'SUCCESS','late-success-final-refund',{transaction_id:'expected-transaction'});
    assert.equal(row(no).status,'REFUNDED'); assert.equal(row(no).refunded_at,clock);
  });
  await check('accounts and saves unchanged and checkout stays closed after all reconciliation',async()=>{
    assert.deepEqual({...db.prepare('SELECT * FROM saves').get()},{user_id:user.id,revision:17,payload:'{"untouched":"player progress"}'});
    assert.equal(billing.status().freeEntitlements,true); assert.equal(billing.status().checkoutEnabled,false);
    assert.equal(process.env.PAYMENT_CHECKOUT_ENABLED,'0'); assert.equal(process.env.PORTAL_COMMERCE_READY,'0');
    assert.equal(process.env.AUTH_DB,undefined); assert.equal(process.env.DATA_DIR,undefined);
  });
  console.log(`backend payment: PASS (${groups} groups; ephemeral RSA, memory SQLite, intercepted HTTPS; checkout disabled)`);
}
main().catch((failure)=>{console.error(failure);process.exitCode=1;}).finally(()=>{
  https.request=originalRequest; Date.now=originalNow; db.close();
});
