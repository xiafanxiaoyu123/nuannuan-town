'use strict';

// Payment fulfilment is server-owned. Return URLs never change order state.
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const alipay = require('./alipay-pay');
const wechat = require('./wechat-pay');
const TERMS_VERSION = '2026-10-13-preparation';
const error = (message, status = 400, code = 'PAYMENT_INVALID') => Object.assign(new Error(message), { status, code });

module.exports = function createBilling({ db, entitlementView, userView, serviceSettings = () => ({ freeEntitlements: process.env.PUBLIC_FREE_ENTITLEMENTS !== '0', checkoutPaused: false }) }) {
  const columns = new Set(db.prepare('PRAGMA table_info(billing_orders)').all().map((c) => c.name));
  // Additive migration: old WeChat orders and all unrelated account/save data remain intact.
  const additions = {
    provider: "TEXT NOT NULL DEFAULT 'wechat_native'", environment: "TEXT NOT NULL DEFAULT 'production'",
    payment_app_id: 'TEXT', payment_seller_id: 'TEXT', payment_url: 'TEXT', channel: 'TEXT',
    plan_days: 'INTEGER', gift_features: 'TEXT', terms_version: 'TEXT', accepted_at: 'INTEGER', last_queried_at: 'INTEGER',
  };
  for (const [name, declaration] of Object.entries(additions)) {
    if (!columns.has(name)) db.exec(`ALTER TABLE billing_orders ADD COLUMN ${name} ${declaration}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS billing_transaction_idx ON billing_orders(provider,environment,transaction_id)');
  const provider = () => process.env.PAYMENT_PROVIDER === 'alipay' ? 'alipay_page' : String(process.env.PAYMENT_PROVIDER || '');
  const testMode = () => process.env.PAYMENT_TEST_MODE === '1' || (provider() === 'wechat_native' && process.env.WECHAT_TEST_MODE === '1');
  const allowlist = () => new Set(String(process.env.PAYMENT_TEST_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const rowFor = (no) => db.prepare('SELECT * FROM billing_orders WHERE out_trade_no=?').get(no);
  function plan() {
    const amount = Number(process.env.PORTAL_MEMBER_PRICE_FEN || 0), days = Number(process.env.PORTAL_MEMBER_DAYS || 30);
    const name = String(process.env.PORTAL_MEMBER_NAME || '门户网站会员').trim().slice(0, 60);
    return { sku: String(process.env.PORTAL_MEMBER_SKU || 'portal_member_30d'), name, days,
      amountFen: Number.isSafeInteger(amount) && amount > 0 ? amount : 0,
      amountYuan: Number.isSafeInteger(amount) && amount > 0 ? alipay.fenToAmount(amount) : null,
      giftFeatures: ['cloud_sync', 'auto_update'], description: `${name}（${days}天）` };
  }
  function status() {
    const p = provider(), item = plan();
    const access = serviceSettings();
    const checked = p === 'alipay_page' ? alipay.configured() : p === 'wechat_native' ? wechat.configured({ callback: true }) : { ok: false, missing: ['PAYMENT_PROVIDER'] };
    const sandbox = p === 'alipay_page' && checked.config.environment === 'sandbox';
    const missing = [...checked.missing];
    if (!item.amountFen) missing.push('PORTAL_MEMBER_PRICE_FEN');
    if (!Number.isInteger(item.days) || item.days < 1 || item.days > 3650) missing.push('PORTAL_MEMBER_DAYS');
    if (process.env.PAYMENT_CHECKOUT_ENABLED !== '1') missing.push('PAYMENT_CHECKOUT_ENABLED');
    if (!sandbox && process.env.PORTAL_COMMERCE_READY !== '1') missing.push('PORTAL_COMMERCE_READY');
    if (!sandbox && testMode() && !allowlist().size) missing.push('PAYMENT_TEST_USER_IDS');
    const enabled = missing.length === 0 && !access.freeEntitlements && !access.checkoutPaused;
    return { provider: p || null, configured: checked.ok, checkoutEnabled: enabled, sandbox, testMode: testMode(),
      mode: access.freeEntitlements ? 'free-public' : enabled ? sandbox ? 'alipay-sandbox' : testMode() ? 'test' : 'live' : 'disabled',
      missing, plan: item, termsVersion: TERMS_VERSION, wapEnabled: process.env.ALIPAY_WAP_ENABLED === '1',
      freeEntitlements: !!access.freeEntitlements, checkoutPaused: !!access.checkoutPaused,
      message: access.freeEntitlements ? '当前统一免费开放，所有登录账号均可使用云同步和自动更新，无需购买'
        : access.checkoutPaused ? '限免已关闭，购买入口仍暂停；开放支付需要单独完成接入与审核'
        : enabled ? sandbox ? '支付宝沙箱验证已开放，不扣真实款项、不发放正式权益' : testMode() ? '仅指定账号可参与小额真实付款验证' : '会员购买已开放'
        : '支付接入准备中，当前购买入口关闭；账号权益与订单查询可以照常使用' };
  }
  function view(row) {
    if (!row) return null;
    const access = serviceSettings();
    const canPay = !access.freeEntitlements && !access.checkoutPaused && row.status === 'PENDING' && row.expires_at > Date.now();
    return { id: row.id, outTradeNo: row.out_trade_no, clientRequestId: row.client_request_id, sku: row.sku,
      description: row.description, amountFen: row.amount_fen, amountYuan: alipay.fenToAmount(row.amount_fen), currency: row.currency,
      provider: row.provider, sandbox: row.environment === 'sandbox', channel: row.channel,
      status: row.status, paymentUrl: canPay ? row.payment_url : null, codeUrl: canPay ? row.code_url : null,
      transactionId: row.transaction_id, tradeState: row.trade_state, createdAt: row.created_at, updatedAt: row.updated_at,
      expiresAt: row.expires_at, paidAt: row.paid_at, refundedAt: row.refunded_at };
  }
  function list(userId) { return db.prepare('SELECT * FROM billing_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(userId).map(view); }
  function membership(user) {
    const rights = entitlementView(user.id);
    const member = rights.entitlements.find((e) => e.feature === 'portal_member');
    return { user: userView(user), entitlements: rights, orders: list(user.id),
      membership: { status: rights.freeEntitlements ? 'free-public' : member ? 'active' : 'inactive', validUntil: rights.freeEntitlements ? null : member?.validUntil ?? null } };
  }
  async function createOrder(user, body) {
    const current = status();
    if (current.freeEntitlements) throw error(current.message, 409, 'PUBLIC_FREE_ACCESS');
    if (!current.checkoutEnabled) throw error(current.message, 503, 'PAYMENT_NOT_CONFIGURED');
    if (!current.sandbox && current.testMode && !allowlist().has(user.id)) throw error('此阶段只允许指定账号进行小额验证', 403, 'PAYMENT_TEST_ACCOUNT_REQUIRED');
    if (body?.acceptedTerms !== true) throw error('请先阅读并确认会员服务说明', 400, 'PAYMENT_TERMS_REQUIRED');
    const requestId = String(body.clientRequestId || '');
    if (!/^[A-Za-z0-9_-]{12,120}$/.test(requestId)) throw error('支付请求缺少有效的幂等键');
    const config = current.provider === 'alipay_page' ? alipay.config() : wechat.config();
    const environment = current.sandbox ? 'sandbox' : 'production';
    const seller = current.provider === 'alipay_page' ? config.sellerId : config.mchid;
    // Scope idempotency to the account without changing the existing UNIQUE schema.
    const storedId = createHash('sha256').update(`${user.id}:${requestId}`).digest('hex');
    const old = db.prepare('SELECT * FROM billing_orders WHERE client_request_id=? AND user_id=?').get(storedId, user.id);
    if (old) {
      try { assertBinding(old,current.provider,config); }
      catch { throw error('支付环境已经变更，请刷新后重新创建订单',400,'PAYMENT_ENVIRONMENT_CHANGED'); }
      return { order: view(old), idempotent: true };
    }
    const pending = db.prepare("SELECT * FROM billing_orders WHERE user_id=? AND status='PENDING' AND expires_at>? AND provider=? AND environment=? AND payment_app_id=? AND payment_seller_id=? ORDER BY created_at DESC LIMIT 1")
      .get(user.id, Date.now(), current.provider, environment, config.appid, seller);
    if (pending) return { order: view(pending), idempotent: true };
    const now = Date.now(), id = randomUUID(), no = `PM${now.toString(36)}${randomBytes(8).toString('hex')}`;
    const channel = body.channel === 'wap' && current.wapEnabled ? 'wap' : 'page';
    const item = current.plan;
    db.prepare(`INSERT INTO billing_orders (id,out_trade_no,client_request_id,user_id,sku,description,amount_fen,currency,status,created_at,updated_at,expires_at,
      provider,environment,payment_app_id,payment_seller_id,channel,plan_days,gift_features,terms_version,accepted_at)
      VALUES (?,?,?,?,?,?,?,'CNY','PENDING',?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,no,storedId,user.id,item.sku,item.description,item.amountFen,now,now,now+15*60000,
        current.provider,current.sandbox?'sandbox':'production',config.appid,current.provider==='alipay_page'?config.sellerId:config.mchid,channel,item.days,JSON.stringify(item.giftFeatures),TERMS_VERSION,now);
    try {
      if (current.provider === 'alipay_page') {
        const result = alipay.createPageOrder({ outTradeNo: no, amountFen: item.amountFen, description: item.description, channel, timeoutMinutes: 15 });
        db.prepare('UPDATE billing_orders SET payment_url=? WHERE id=?').run(result.paymentUrl,id);
      } else {
        const result = await wechat.createNativeOrder({ description:item.description,outTradeNo:no,amountFen:item.amountFen,attach:`portal:${item.sku}` });
        if (!result.body?.code_url) throw error('微信未返回收银台链接',502);
        db.prepare('UPDATE billing_orders SET code_url=? WHERE id=?').run(result.body.code_url,id);
      }
    } catch (failure) {
      db.prepare("UPDATE billing_orders SET status='CREATE_FAILED',last_error=?,updated_at=? WHERE id=?").run(failure.code||'PAYMENT_CREATE_FAILED',Date.now(),id);
      throw failure;
    }
    return { order:view(rowFor(no)),idempotent:false };
  }
  function assertBinding(order, p, config) {
    if (!order || order.provider !== p) throw error('对应支付订单不存在',400,'PAYMENT_ORDER_MISMATCH');
    const environment = p === 'alipay_page' ? config.environment : 'production';
    const seller = p === 'alipay_page' ? config.sellerId : config.mchid;
    if (order.environment !== environment || (order.payment_app_id && order.payment_app_id !== config.appid) ||
      (order.payment_seller_id && order.payment_seller_id !== seller)) throw error('订单环境或商户配置不匹配',409,'PAYMENT_ENVIRONMENT_MISMATCH');
  }
  function grant(order, now) {
    if (order.environment === 'sandbox') return;
    // Never use today's price/term to fulfil an older order.
    if (!Number.isInteger(order.plan_days) || order.plan_days < 1) throw error('历史订单缺少权益快照，请人工核对',409,'PAYMENT_PLAN_REVIEW_REQUIRED');
    const features = ['portal_member', ...JSON.parse(order.gift_features || '[]')];
    if (features.some((f) => !['portal_member','cloud_sync','auto_update'].includes(f))) throw error('权益快照无效',409);
    for (const feature of features) {
      const old = db.prepare("SELECT * FROM entitlements WHERE user_id=? AND feature=? AND source='payment'").get(order.user_id,feature);
      // An existing permanent entitlement remains permanent.
      const until = old && old.valid_until === null ? null : Math.max(now,old?.valid_until||0)+order.plan_days*86400000;
      if (old) db.prepare('UPDATE entitlements SET valid_until=?,updated_at=? WHERE id=?').run(until,now,old.id);
      else db.prepare('INSERT INTO entitlements (id,user_id,feature,valid_from,valid_until,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(randomUUID(),order.user_id,feature,now,until,'payment',now,now);
    }
  }
  function apply(order, { eventId, transactionId, state, paid, closed, refundReview = false }) {
    if ((paid || refundReview || order.transaction_id) && (!transactionId || (order.transaction_id && order.transaction_id !== transactionId))) throw error('支付交易号不匹配',400);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = rowFor(order.out_trade_no);
      if (current.transaction_id && current.transaction_id !== transactionId) throw error('支付交易号不匹配',400);
      const previous = db.prepare('SELECT out_trade_no FROM billing_events WHERE event_id=?').get(eventId);
      if (previous) {
        if (previous.out_trade_no !== order.out_trade_no) throw error('重复通知与订单不匹配',400);
        db.exec('COMMIT'); return {duplicate:true,order:view(current)};
      }
      if (transactionId && db.prepare('SELECT id FROM billing_orders WHERE provider=? AND environment=? AND transaction_id=? AND id<>?').get(order.provider,order.environment,transactionId,order.id)) throw error('支付交易已关联其他订单',409);
      const now=Date.now();
      // Persist only fulfilment fields, not payer identity or payment signatures.
      db.prepare('INSERT INTO billing_events (id,event_id,out_trade_no,transaction_id,event_type,body_json,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(),eventId,order.out_trade_no,transactionId||null,state,JSON.stringify({provider:order.provider,environment:order.environment,state}),now);
      if (transactionId) db.prepare('UPDATE billing_orders SET transaction_id=COALESCE(transaction_id,?) WHERE id=?').run(transactionId,order.id);
      if (['REFUNDED','REFUND_REVIEW'].includes(current.status)) {
        // Once refund review is required, stale success/closed messages cannot reverse it.
      } else if (refundReview) {
        // REFUND means a refund was initiated, not that any full/partial amount
        // succeeded. Queue reconciliation; retain rights and refunded_at until
        // the actual refund result is reviewed. Works for pre-snapshot paid orders too.
        db.prepare("UPDATE billing_orders SET status='REFUND_REVIEW',trade_state=?,updated_at=? WHERE id=?").run(state,now,order.id);
      } else if (paid && current.status === 'CLOSED') {
        // Notifications can arrive out of order; a previously closed trade needs review.
        db.prepare("UPDATE billing_orders SET status='REFUND_REVIEW',transaction_id=?,trade_state=?,updated_at=? WHERE id=?").run(transactionId,state,now,order.id);
      } else if (paid && !current.paid_at && !['REFUNDED','REFUND_REVIEW'].includes(current.status)) {
        grant(current,now);
        db.prepare("UPDATE billing_orders SET status='PAID',paid_at=?,transaction_id=?,trade_state=?,updated_at=?,last_error=NULL WHERE id=?").run(now,transactionId,state,now,order.id);
      } else if (closed && current.paid_at) {
        // Full refund can report TRADE_CLOSED. Queue manual rights review; do not silently re-grant.
        db.prepare("UPDATE billing_orders SET status='REFUND_REVIEW',refunded_at=COALESCE(refunded_at,?),trade_state=?,updated_at=? WHERE id=?").run(now,state,now,order.id);
      } else if (closed) {
        db.prepare("UPDATE billing_orders SET status='CLOSED',trade_state=?,updated_at=? WHERE id=?").run(state,now,order.id);
      } else if (!['REFUNDED','REFUND_REVIEW'].includes(current.status)) {
        db.prepare('UPDATE billing_orders SET trade_state=?,updated_at=? WHERE id=?').run(state,now,order.id);
      }
      db.exec('COMMIT');
    } catch (failure) { try { db.exec('ROLLBACK'); } catch {} throw failure; }
    return {duplicate:false,order:view(rowFor(order.out_trade_no))};
  }
  function applyAlipay(data, fromQuery=false) {
    const config=alipay.config(), order=rowFor(data.out_trade_no||'');
    assertBinding(order,'alipay_page',config);
    if (!fromQuery && (data.app_id !== config.appid || data.seller_id !== config.sellerId)) throw error('支付宝通知主体不匹配',400,'ALIPAY_IDENTITY_MISMATCH');
    if (alipay.amountToFen(data.total_amount) !== order.amount_fen || order.currency !== 'CNY') throw error('支付金额不匹配',400,'PAYMENT_AMOUNT_MISMATCH');
    if (!['TRADE_SUCCESS','TRADE_FINISHED','TRADE_CLOSED','WAIT_BUYER_PAY'].includes(data.trade_status)) throw error('支付状态无效',400);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(data.trade_no||'')) throw error('支付交易号无效',400);
    if (!fromQuery && (!data.notify_id || data.notify_id.length > 256)) throw error('通知编号无效',400);
    const eventId = `alipay:${order.environment}:${fromQuery?`query:${data.trade_no}:${data.trade_status}`:data.notify_id}`;
    return apply(order,{eventId,transactionId:data.trade_no,state:data.trade_status,paid:['TRADE_SUCCESS','TRADE_FINISHED'].includes(data.trade_status),closed:data.trade_status==='TRADE_CLOSED'});
  }
  function notifyAlipay(raw) {
    const checked=alipay.configured();
    if (!checked.ok) throw error('支付宝回调未完成配置',503,'PAYMENT_NOT_CONFIGURED');
    return applyAlipay(alipay.verifyNotification(raw,checked.config));
  }
  function applyWechat(data,eventId) {
    const config=wechat.config(),order=rowFor(data.out_trade_no||'');
    assertBinding(order,'wechat_native',config);
    if (data.appid !== config.appid || data.mchid !== config.mchid || data.amount?.total !== order.amount_fen || data.amount?.currency !== 'CNY') throw error('微信订单主体或金额不匹配',400);
    return apply(order,{eventId:`wechat:${eventId}`,transactionId:data.transaction_id,state:data.trade_state,paid:data.trade_state==='SUCCESS',closed:data.trade_state==='CLOSED',refundReview:data.trade_state==='REFUND'});
  }
  function notifyWechat(raw,headers) {
    const checked=wechat.configured({callback:true});
    if (!checked.ok) throw error('微信回调未完成配置',503);
    wechat.verifySignature(raw,headers,checked.config);
    let envelope; try { envelope=JSON.parse(raw); } catch { throw error('通知格式无效',400); }
    const data=wechat.decryptNotification(envelope.resource,checked.config);
    return applyWechat(data,envelope.id||`${data.transaction_id}:${data.trade_state}`);
  }
  async function userOrder(userId,no) {
    let order=rowFor(no);
    if (!order || order.user_id !== userId) throw error('支付订单不存在',404,'PAYMENT_ORDER_NOT_FOUND');
    let queryMessage=order.last_error && order.last_queried_at ? '暂未完成支付平台核对，请稍后刷新原订单' : null;
    // Late payments must still reconcile after the local link expires. A return page cannot mark PAID.
    if (['PENDING','PAID'].includes(order.status) && Date.now()-(order.last_queried_at||0)>=(order.status==='PAID'?60000:5000)) {
      db.prepare('UPDATE billing_orders SET last_queried_at=? WHERE id=?').run(Date.now(),order.id);
      try {
        if (order.provider==='alipay_page') {
          assertBinding(order,'alipay_page',alipay.config());
          const result=await alipay.queryOrder(no);
          if (result.body.out_trade_no!==no) throw error('查询订单不匹配',502);
          applyAlipay(result.body,true);
        } else {
          assertBinding(order,'wechat_native',wechat.config());
          const result=await wechat.queryOrder(no);
          if (result.body.out_trade_no!==no) throw error('查询订单不匹配',502);
          applyWechat(result.body,`query:${no}:${result.body.transaction_id||''}:${result.body.trade_state}`);
        }
        db.prepare('UPDATE billing_orders SET last_error=NULL WHERE id=?').run(order.id);
        queryMessage=null;
      } catch (failure) {
        queryMessage=failure.providerSubCode==='ACQ.TRADE_NOT_EXIST'?'支付宝尚未生成付款交易': '暂未完成支付平台核对，请稍后刷新原订单';
        db.prepare('UPDATE billing_orders SET last_error=? WHERE id=?').run(failure.code||'PAYMENT_QUERY_FAILED',order.id);
      }
      order=rowFor(no);
    }
    return {order:view(order),queryMessage};
  }
  return {status,view,list,membership,createOrder,userOrder,notifyAlipay,notifyWechat};
};
