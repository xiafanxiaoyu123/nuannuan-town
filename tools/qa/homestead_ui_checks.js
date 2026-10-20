// Isolated Chromium UI coverage. Synthetic pantry unlocks support later flows;
// trusted mouse/keyboard inputs exercise the actual production interface.
const { suite } = require('./live_harness.js');
const { installUi3BrowserErrorBoundary } = require('./ui3_browser_error_boundary.cjs');
suite('homestead_ui', async q => {
  const boundary = await installUi3BrowserErrorBoundary(q);
  const cdp = (method, args) => q.window.webContents.debugger.sendCommand(method, args);
  const clickText = async (text, parent = '.homestead-modal', exact = true) => {
    await q.run(`const root=[...document.querySelectorAll(${JSON.stringify(parent)})].filter(x=>!x.closest('.veil.out')).at(-1);assert(root,'missing parent');const e=[...root.querySelectorAll('button')].find(e=>${exact ? 'e.textContent.trim()===' : 'e.textContent.includes('}${JSON.stringify(text)}${exact ? '' : ')'});assert(e,'missing button '+${JSON.stringify(text)});document.querySelectorAll('[data-hs-qa-target]').forEach(x=>x.removeAttribute('data-hs-qa-target'));e.setAttribute('data-hs-qa-target','yes');`);
    await q.click('[data-hs-qa-target]');
  };
  const open = async tab => { await q.click('.ranch-quick'); if (tab !== '牧场') await clickText(tab, '.hs-nav'); };
  const fit = async label => q.check(label, `
    const root=document.querySelector('.hs-app');const data=fitPanel('.hs-app');
    const bad=[...root.querySelectorAll('.hs-kitchen,.hs-recipe-detail,.hs-recipe-info,.hs-cooking,.hs-ranch,.hs-pantry,.hs-book,.hs-tea-select')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>[e.className,e.scrollWidth,e.clientWidth]);
    assert(!bad.length,'horizontal overflow '+JSON.stringify(bad));return data;
  `);
  const slot = await q.profile({ width: 866, height: 412, preview: false });
  await boundary.recordReady('homestead initial');
  await q.check('正常存档入口及世界接口存在', `assert(__game.homesteadUI&&__game.homesteadWorld,'homestead missing');return {zone:__game.town.zone};`);
  await q.click('.ranch-quick'); await fit('866迎新界面无溢出'); await q.shot('866_welcome');
  await clickText('领取小鸡与奶油鸡舍');
  await q.check('真实领取小鸡与教学食材', `eq(st.S.homestead.animals.length,1,'animal');eq(st.S.homestead.pantry.egg,1,'egg');eq(st.S.homestead.pantry.feed,4,'feed');assert(st.S.homestead.tutorial,'tutorial');return st.S.homestead.animals[0].name;`);
  await q.check('先领鸡舍库存且未安置时停止生产', `eq(st.S.decor.ranch_coop,1,'鸡舍库存');eq(st.S.homestead.animals[0].cycleAt,0,'无住处不生产');assert(document.querySelector('.hs-ranch').textContent.includes('等待安置'),'安置指引');return true;`);
  // 合成已装修布局用于后续厨房回归；真实摆放/收费/旋转由家园装修专项覆盖。
  await q.run(`for(const e of [{id:'ranch_coop',gx:12,gz:9,rot:0},{id:'ranch_picnic',gx:20,gz:10,rot:0}]){st.S.placed.push(e);__game.town.decors.home.addObj(e,false);}delete st.S.decor.ranch_coop;st.bus.emit('decorChanged');st.save();`);
  await clickText('补满', '.hs-ranch-summary', false); await clickText('摸摸', '.hs-animal-card');
  await q.check('完整照料前不提前发亲密奖励', `eq(st.S.homestead.animals[0].love,0,'pet awarded early');assert(document.querySelector('.hs-animal-card.petting'),'care feedback absent');return true;`);
  await q.sleep(3200);
  await q.check('投喂与抚摸真实保存', `const a=st.S.homestead.animals[0];assert(a.cycleAt>Date.now(),'production');eq(a.love,8,'love');return {feed:a.feed,love:a.love};`);
  await clickText('烹饪', '.hs-nav'); await fit('866厨房无溢出'); await q.shot('866_kitchen');
  await q.check('24菜目录与实时3D预览', `eq(document.querySelectorAll('[data-recipe]').length,24,'recipes');eq(document.querySelectorAll('.hs-stage canvas').length,1,'one live renderer');window.beforeCookCoins=st.S.coins;return true;`);
  await clickText('亲手制作 · 24秒'); await q.sleep(3100); await clickText('轻轻搅一圈'); await clickText('暂停');
  await q.run(`window.pausedMs=st.S.homestead.cooking.activeMs;window.pausedRenders=__game.homesteadUI.getPreviewStats().renders;window.cookId=st.S.homestead.cooking.id;st.flushSave();`);
  await q.sleep(1400);
  await q.check('暂停不推进手动制作且不绘制预览', `assert(Math.abs(st.S.homestead.cooking.activeMs-pausedMs)<120,'pause time changed');assert(st.S.homestead.cooking.operation>0,'stir persisted');eq(__game.homesteadUI.getPreviewStats().renders,pausedRenders,'paused preview rendered');return pausedMs;`);
  const beforeReload = await q.run(`return {id:cookId,activeMs:st.S.homestead.cooking.activeMs,coins:beforeCookCoins};`);
  await q.load(slot, false); await open('烹饪');
  await q.check('重新载入恢复同一份托管制作', `eq(st.S.homestead.cooking.id,${JSON.stringify(beforeReload.id)},'same task');assert(st.S.homestead.cooking.activeMs>=${beforeReload.activeMs},'progress lost');eq(st.S.homestead.pantry.egg||0,0,'escrow egg duplicated');return st.S.homestead.cooking.activeMs;`);
  await clickText('轻轻搅一圈'); await q.sleep(2800); await clickText('轻轻搅一圈'); await q.sleep(2800); await clickText('轻轻搅一圈');
  await q.shot('866_cooking');
  await q.wait('st.S.homestead.cooking.activeMs>=18000'); await clickText('完成摆盘');
  await q.wait('st.S.homestead.cooking.activeMs>=24000'); await clickText('端出这道菜');
  await q.check('手动出餐一次且不重复赠币', `assert(!st.S.homestead.cooking,'task not cleared');eq(st.S.homestead.history.egg_custard,1,'history');eq(Object.values(st.S.homestead.dishes).reduce((a,b)=>a+b,0),1,'one dish');eq(st.S.coins,${beforeReload.coins},'cooking coins');return st.S.homestead.dishes;`);
  await q.click('.hs-dish-card'); await clickText('摆上餐桌', '.hs-small-modal');
  await q.check('真实菜品摆桌守恒', `eq(st.S.homestead.placed.length,1,'placed');eq(Object.values(st.S.homestead.dishes).reduce((a,b)=>a+b,0),0,'removed stock');assert(/^a[0-3]$/.test(st.S.homestead.placed[0].anchor),'anchor');return st.S.homestead.placed[0];`);
  await clickText('转个方向', '.hs-placed-row'); await clickText('取回冰箱', '.hs-placed-row');
  await q.check('旋转后取回恰好一份', `eq(st.S.homestead.placed.length,0,'still placed');eq(Object.values(st.S.homestead.dishes).reduce((a,b)=>a+b,0),1,'one dish');return true;`);
  await q.run(`st.S.homestead.pantry.egg=10;st.S.homestead.pantry.milk=8;st.S.homestead.pantry.wool=6;st.S.crops.wheat=10;st.S.crops.radish=10;st.S.crops.strawberry=10;st.S.coins=10000;st.save();`);
  await clickText('烹饪', '.hs-nav');
  await q.run(`window.beforeStorageFail=JSON.stringify({homestead:st.S.homestead,coins:st.S.coins,crops:st.S.crops});window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('nikki-block-town-save'))throw new Error('QA storage full');return originalSetItem.call(this,key,value);};`);
  try { await clickText('快捷制作'); } finally { await q.run(`Storage.prototype.setItem=originalSetItem;`); }
  await q.check('本机保存失败撤回快捷制作', `eq(JSON.stringify({homestead:st.S.homestead,coins:st.S.coins,crops:st.S.crops}),beforeStorageFail,'failed commit leaked');assert(document.querySelector('.hs-recipe-detail'),'failed action closed kitchen');return true;`);
  await clickText('快捷制作'); await clickText('烹饪', '.hs-nav'); await clickText('快捷制作');
  await q.check('快捷制作重复两次真实消耗', `eq(st.S.homestead.history.egg_custard,3,'history unlock');eq(st.S.homestead.pantry.egg,8,'egg paid');return st.S.homestead.dishes;`);
  await clickText('招待', '.hs-nav'); await q.click('.hs-tea-select .hs-dish-card'); await clickText('开始招待');
  await q.check('茶会托管真实成品与大喵', `assert(st.S.homestead.tea?.keys.length===1,'tea');eq(st.S.homestead.tea.guests,['momo'],'guests');return {tea:st.S.homestead.tea.id,dishes:st.S.homestead.dishes};`);
  await q.shot('866_tea'); await clickText('跳过演出并完成');
  await q.check('跳过茶会只结算一次', `eq(st.S.homestead.teaCount,1,'tea count');assert(!st.S.homestead.tea,'tea done');return st.S.homestead.giftDays;`);
  await clickText('冰箱', '.hs-nav', false); await q.click('.hs-dish-card'); await clickText('送给朋友', '.hs-small-modal');
  await q.check('真实赠礼消耗料理', `eq(Object.values(st.S.homestead.dishes).reduce((a,b)=>a+b,0),1,'gift count');return true;`);
  await q.click('.hs-dish-card'); await clickText('出售', '.hs-small-modal', false);
  await q.check('真实出售消费最后一份', `eq(Object.values(st.S.homestead.dishes).reduce((a,b)=>a+b,0),0,'sale');assert(st.S.coins>10000,'sale coins');return st.S.coins;`);
  await clickText('鲜奶 → 酸奶'); await q.sleep(5200);
  await q.check('加工完成且不复制鲜奶', `eq(st.S.homestead.pantry.milk,7,'milk');eq(st.S.homestead.pantry.yogurt,1,'yogurt');return true;`);
  await clickText('烹饪', '.hs-nav'); await q.click('[data-recipe="strawberry_tart"]'); await clickText('亲手制作 · 24秒');
  await q.sleep(1300); await q.run(`window.dispatchEvent(new Event('blur'));window.blurMs=st.S.homestead.cooking.activeMs;`); await q.sleep(1200);
  await q.check('失焦不推进且可点击恢复', `eq(st.S.homestead.cooking.activeMs,blurMs,'blur pause');return true;`);
  await clickText('继续制作'); await q.sleep(1300); await clickText('取消并退回预留食材'); await clickText('收好食材', '.veil:last-child');
  await q.check('取消制作退回托管食材', `assert(!st.S.homestead.cooking,'cancel');eq(st.S.crops.strawberry,10,'strawberry restore');eq(st.S.crops.wheat,10,'wheat restore');return true;`);
  await clickText('收藏','.hs-recipe-info'); await clickText('收藏','.hs-filters');
  await q.check('收藏筛选展示真实收藏菜谱', `eq(document.querySelectorAll('[data-recipe]').length,1,'favorite list');eq(document.querySelector('[data-recipe]').dataset.recipe,'strawberry_tart','favorite id');return true;`);
  await clickText('全部','.hs-filters'); await q.click('.hs-search'); await cdp('Input.insertText',{text:'蛋羹'});
  await q.check('搜索按菜名过滤', `eq(document.querySelectorAll('[data-recipe]').length,1,'search list');eq(document.querySelector('[data-recipe]').dataset.recipe,'egg_custard','search result');return true;`);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
  for (const [width,height] of [[640,360],[866,412],[1280,800]]) {
    q.window.setContentSize(width,height); await q.sleep(400);
    for (const tab of ['烹饪','牧场','冰箱','手账','招待']) {
      await clickText(tab,'.hs-nav',tab!=='冰箱'); await q.sleep(150); await fit(`${width}×${height} ${tab}无横向溢出`); await q.shot(`${width}_${tab}`);
    }
  }
  await clickText('烹饪','.hs-nav'); await q.sleep(1000);
  await q.run(`window.renderBaseline=__game.homesteadUI.getPreviewStats().renders;`); await q.sleep(2000);
  await q.check('预览绘制不超过30fps上限', `const delta=__game.homesteadUI.getPreviewStats().renders-renderBaseline;assert(delta<=62,'preview draw rate above cap');return {rendersIn2seconds:delta,scope:'render-count cap only, not device performance'};`);
  await q.sleep(29000);
  await q.run(`window.idleRenders=__game.homesteadUI.getPreviewStats().renders;`); await q.sleep(1500);
  await q.check('30秒短演出后静止预览停止绘制', `const stats=__game.homesteadUI.getPreviewStats();assert(stats.sleeping,'preview did not sleep');eq(stats.renders,idleRenders,'idle preview kept rendering');return stats;`);
  await clickText('转一转','.hs-preview-caption'); await q.sleep(1200);
  await q.check('用户旋转唤醒静止预览', `assert(__game.homesteadUI.getPreviewStats().renders>idleRenders,'rotate did not wake');return true;`);
  await q.click('.homestead-modal>.x'); await q.sleep(300);
  await q.check('关闭释放实时预览与弹窗', `eq(document.querySelectorAll('.hs-stage canvas').length,0,'renderer canvas leak');assert(!document.querySelector('.homestead-modal'),'modal leak');return true;`);
  await boundary.assertClean();
});
