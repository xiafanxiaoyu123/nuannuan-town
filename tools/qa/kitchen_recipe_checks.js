// Real source, crop models, furniture prompt, Chromium clicks and isolated normal-economy save.
// Start the project-owned safe_local game service on 5173 first; run with Electron/live_harness.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { suite } = require('./live_harness.js');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/live/home-interactions.js'), 'utf8');
const match = source.match(/const RECIPES = (\[[\s\S]*?\n\]);/);
if (!match) throw new Error('Cannot locate actual kitchen recipe table');
const recipes = vm.runInNewContext(match[1], Object.create(null), { timeout: 1000 });

suite('kitchen_recipes', async q => {
  await q.window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.kitchenStartupErrors=[];let bootError;
    Object.defineProperty(window,'__showBootError',{configurable:true,get:()=>bootError,set:fn=>{bootError=(...args)=>{kitchenStartupErrors.push({type:'boot',message:args[0]});return fn(...args);};}});
    window.addEventListener('error',e=>kitchenStartupErrors.push({type:'error',message:e.message,file:e.filename,line:e.lineno,stack:e.error?.stack}),true);
    window.addEventListener('unhandledrejection',e=>kitchenStartupErrors.push({type:'rejection',message:e.reason?.message||String(e.reason),stack:e.reason?.stack}));
  `});
  const fixture = `
    qaPump=false;engine.renderer.setAnimationLoop(null);closePanels();
    window.t=__game.town;window.d=t.decors.house;window.hi=t.homeInteractions;window.townInput=await import('/js/world/town/input.js');
    window.recipes=${JSON.stringify(recipes)};
    window.freshKitchen=async id=>{
      closePanels();await new Promise(resolve=>setTimeout(resolve,280));assert(!document.querySelector('.veil'),'旧面板关闭完成');hi.stand();if(d.active)d.exit();t.setZone('house');t.setMode('play');t.active=true;t.frozen=false;t.lock=0;__game.busy=false;
      st.S.placedIn=[];d.reload();let spot;
      for(let gz=4;gz<d.lot.rows-3&&!spot;gz++)for(let gx=3;gx<d.lot.cols-4&&!spot;gx++)if(d.canPlace(id,gx,gz,0))spot={gx,gz};
      assert(spot,'可摆放厨房家具 '+id);
      const e={id,...spot,rot:0};st.S.placedIn.push(e);const rec=d.addObj(e,false);hi.sync();
      const point=hi.points(rec)[0];assert(point,'安全厨房入口 '+id);
      t.pos.set(point.x,0,point.z);t.player.root.position.copy(t.pos);t.moveTo=null;t.keys.clear();t.stick.x=t.stick.y=0;
      townInput.updatePrompts(t);assert(t.cur&&t.cur.label==='烹制田园料理','真实料理提示');
      t.camSnap=true;t.update(.016,engine.time);engine.renderer.render(t.scene,t.camera);return rec;
    };
    window.recipeRows=()=>[...document.querySelectorAll('.veil:not(.out) .home-kitchen .dl-list > .dl-task')];
  `;
  for(const [width,height,label] of [[1280,800,'desktop'],[866,412,'phone_landscape']]) {
    let slot;
    try {slot=await q.profile({width,height,preview:false,tag:'_'+label});}
    catch(error){q.report.startup=await q.run(`return {boot:document.querySelector('#boot')?.textContent,errors:window.kitchenStartupErrors||[]};`);throw error;}
    await q.run(fixture);
    await q.check(label+' 全部配方引用真实作物、名称和可解码模型图标', `
      const icons=await import('/js/core/icons.js');const result=[];
      eq(recipes.length,5,'五道实际配方');eq(new Set(recipes.map(r=>r.id)).size,recipes.length,'配方ID唯一');
      for(const r of recipes){assert(Number.isInteger(r.coins)&&r.coins>0,'正整数料理奖励');
        for(const [id,need] of r.cost){assert(dd.CROP[id]&&dd.CROP[id].name,'未知料理食材 '+r.id+'/'+id);assert(Number.isInteger(need)&&need>0,'合法食材份数');
          const src=icons.cropIco(id);assert(src.startsWith('data:image/png;base64,'),'真实模型图标 '+id);
          const img=new Image();img.src=src;await img.decode();assert(img.naturalWidth>0&&img.naturalHeight>0,'图标解码 '+id);result.push({recipe:r.id,id,name:dd.CROP[id].name});}}
      eq(recipes.find(r=>r.id==='pumpkin_soup').cost,[['pumpkin',1],['wheat',1]],'南瓜浓汤只用已有食材');return result;
    `);
    await q.run(`st.S.crops={};st.S.live.kitchen={};st.S.coins=1000;`);
    for(const id of ['kitchen_stove','kitchen_fridge','kitchen_island']) {
      await q.run(`await freshKitchen(${JSON.stringify(id)});`);
      await q.click('.prompt button');
      await q.check(label+' '+id+' 真实点击料理入口显示五道菜且空库存不可烹制', `
        assert(document.querySelector('.veil:not(.out) .home-kitchen'),'料理面板已打开');eq(recipeRows().length,recipes.length,'全部配方显示');
        assert(recipeRows().every(row=>row.querySelector('button').disabled),'空库存全部禁用');
        for(const row of recipeRows())for(const img of row.querySelectorAll('img')){await img.decode();assert(img.naturalWidth>0,'面板食材图标有效');}
        eq(st.S.coins,1000,'打开不改变金币');eq(st.S.crops,{},'打开不扣库存');return fitPanel('.veil:not(.out) .home-kitchen');
      `);
      if(id==='kitchen_stove') await q.shot(label+'-kitchen-open');
    }
    await q.run(`window.expectedCoins=1000;window.expectedKitchen={};window.soldBefore=st.S.stats.sold||0;`);
    for(let index=0;index<recipes.length;index++) {
      await q.run(`
        window.r=recipes[${index}];st.S.crops={radish:7,...Object.fromEntries(r.cost)};await freshKitchen('kitchen_stove');
      `);
      await q.click('.prompt button');
      await q.run(`window.originalCookButton=recipeRows()[${index}].querySelector('button');assert(!originalCookButton.disabled,'足量食材可烹制');`);
      await q.click('.veil:not(.out) .home-kitchen .dl-list > .dl-task button',index);
      await q.check(label+' '+recipes[index].id+' 一次点击只扣一份配方、奖励一次、旧按钮不重复发奖', `
        expectedCoins+=r.coins;expectedKitchen[r.id]=1;
        eq(st.S.coins,expectedCoins,'奖励金额');eq(st.S.crops,{radish:7},'只扣配方食材且保留其他库存');eq(st.S.live.kitchen,expectedKitchen,'料理计数一次');
        originalCookButton.click();originalCookButton.click();
        eq(st.S.coins,expectedCoins,'食材耗尽后旧回调不增金币');eq(st.S.crops,{radish:7},'食材耗尽后不负库存');eq(st.S.live.kitchen,expectedKitchen,'旧回调不增加料理计数');
        assert(recipeRows()[${index}].querySelector('button').disabled,'耗尽后按钮禁用');return {coins:st.S.coins,crops:{...st.S.crops},kitchen:{...st.S.live.kitchen}};
      `);
    }
    await q.check(label+' 下午茶就绪且重复点击只奖励一次、不消耗既有料理', `
      eq(st.S.stats.sold,soldBefore+recipes.length,'料理出售统计每次只增一');
      const btn=document.querySelector('.veil:not(.out) .home-kitchen > .dl-task button');assert(!btn.disabled,'烹制后可招待');return true;
    `);
    await q.run(`window.teaButton=document.querySelector('.veil:not(.out) .home-kitchen > .dl-task button');`);
    await q.click('.veil:not(.out) .home-kitchen > .dl-task button');
    await q.check(label+' 下午茶一次到账与保存成功', `
      expectedCoins+=80;teaButton.click();teaButton.click();
      eq(st.S.coins,expectedCoins,'下午茶只到账一次');eq(st.S.live.kitchen,expectedKitchen,'下午茶不消耗累计料理');eq(st.S.live.fun.used.teaParty,1,'当日标记');
      assert(st.flushSave(),'正常经济存档写入成功');
      window.expectedSaved={coins:st.S.coins,crops:{...st.S.crops},kitchen:{...st.S.live.kitchen},sold:st.S.stats.sold};return expectedSaved;
    `);
    const expected=await q.run(`return expectedSaved;`);
    await q.load(slot,false);
    await q.run(fixture);
    await q.check(label+' 真实页面重载保留金币、库存、料理计数与每日招待标记', `
      const expected=${JSON.stringify(expected)};
      eq(st.S.coins,expected.coins,'重载金币');eq(st.S.crops,expected.crops,'重载库存');eq(st.S.live.kitchen,expected.kitchen,'重载料理');eq(st.S.stats.sold,expected.sold,'重载出售次数');
      eq(st.S.live.fun.used.teaParty,1,'重载每日招待已领');return expected;
    `);
    await q.run(`await freshKitchen('kitchen_stove');`);
    await q.click('.prompt button');
    await q.check(label+' 重载后面板可再次打开且下午茶不可重领', `
      const btn=document.querySelector('.veil:not(.out) .home-kitchen > .dl-task button');assert(btn.disabled&&btn.textContent.includes('今日已招待'),'已招待不可重领');
      eq(recipeRows().length,5,'重载后五道菜仍可见');return fitPanel('.veil:not(.out) .home-kitchen');
    `);
    await q.shot(label+'-kitchen-after-reload');
  }
});
