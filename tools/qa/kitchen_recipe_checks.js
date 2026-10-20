// Real crop/dish models, all three physical kitchen entries, Chromium clicks and normal-economy reload.
const { suite } = require('./live_harness.js');
const { RECIPES } = require('../../js/shared/homestead.js');
const oldRecipes = RECIPES.slice(0, 5);
suite('kitchen_recipes', async q => {
  const bind = `
    qaPump=false;engine.renderer.setAnimationLoop(null);closePanels();
    window.t=__game.town;window.d=t.decors.house;window.hi=t.homeInteractions;
    window.townInput=await import('/js/world/town/input.js');window.rules=await import('/js/shared/homestead.js');window.oldRecipes=${JSON.stringify(oldRecipes)};
    window.freshKitchen=async id=>{
      closePanels();await new Promise(r=>setTimeout(r,300));assert(!document.querySelector('.veil'),'旧面板关闭');hi.stand();if(d.active)d.exit();
      t.setZone('house');t.setMode('play');t.active=true;t.frozen=false;t.lock=0;__game.busy=false;st.S.placedIn=[];d.reload();let spot;
      for(let gz=4;gz<d.lot.rows-3&&!spot;gz++)for(let gx=3;gx<d.lot.cols-4&&!spot;gx++)if(d.canPlace(id,gx,gz,0))spot={gx,gz};
      assert(spot,'可摆放家具 '+id);const e={id,...spot,rot:0};st.S.placedIn.push(e);const rec=d.addObj(e,false);hi.sync();const p=hi.points(rec)[0];assert(p,'安全入口');
      t.pos.set(p.x,0,p.z);t.player.root.position.copy(t.pos);t.moveTo=null;t.keys.clear();t.stick.x=t.stick.y=0;townInput.updatePrompts(t);
      assert(t.cur&&t.cur.label===(id==='kitchen_fridge'?'打开食材与成品柜':'烹制田园料理'),'真实家具提示');t.camSnap=true;t.update(.016,engine.time);engine.renderer.render(t.scene,t.camera);
    };
    window.markButton=(text,selector='.veil:not(.out) .hs-app')=>{
      document.querySelectorAll('[data-kitchen-target]').forEach(e=>delete e.dataset.kitchenTarget);
      const b=[...document.querySelectorAll(selector+' button')].find(e=>e.textContent.trim().startsWith(text));assert(b,'可见按钮 '+text);b.dataset.kitchenTarget='yes';return b;
    };
    window.recipeRows=()=>[...document.querySelectorAll('.veil:not(.out) .hs-recipe-card')];
    window.decodeRecipeIcons=async()=>{
      const rows=recipeRows();
      // Recipe thumbnails are lazy-loaded. Scroll every real card into the viewport
      // before decoding, otherwise the offscreen cards in the 24-recipe list never load.
      for(const row of rows){
        row.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        await new Promise(resolve=>setTimeout(resolve,60));
        const img=row.querySelector('img');assert(img,'料理图标元素');
        await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('料理图标解码超时 '+row.dataset.recipe)),4000))]);
        assert(img.naturalWidth>0,'独立料理图标 '+row.dataset.recipe);
      }
      rows[0]?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
    };
  `;
  const clickText = async (text, selector = '.veil:not(.out) .hs-app') => { await q.run(`markButton(${JSON.stringify(text)},${JSON.stringify(selector)});`); await q.click('[data-kitchen-target="yes"]'); };
  for (const [width,height,label] of [[1280,800,'desktop'],[866,412,'phone_landscape'],[640,360,'small_landscape']]) {
    const slot=await q.profile({width,height,preview:false,tag:'_'+label});await q.run(bind);
    await q.check(label+' 二十四菜与旧五配方、作物模型有效', `
      const icons=await import('/js/core/icons.js');eq(rules.RECIPES.length,24,'24菜');eq(new Set(rules.RECIPES.map(r=>r.id)).size,24,'唯一ID');
      const costs={strawberry_tart:[['strawberry',2],['wheat',1]],pumpkin_soup:[['pumpkin',1],['wheat',1]],blueberry_muffin:[['blueberry',2],['apple',1]],lemon_tea:[['lemon',1],['peach',1]],moon_cake:[['moonflower',1],['cherry',1]]};
      for(const r of oldRecipes){eq(r.cost,costs[r.id],'保留旧配方');for(const[id,n]of r.cost){assert(dd.CROP[id]?.name&&Number.isInteger(n)&&n>0,'合法食材');const img=new Image();img.src=icons.cropIco(id);await img.decode();assert(img.naturalWidth>0,'真实作物图标');}}
      for(const r of rules.RECIPES)for(const[id,n]of r.cost)assert((dd.CROP[id]||rules.PANTRY[id])&&n>0,'新旧食材来自目录');return true;
    `);
    await q.run(`st.S.crops={};st.S.live.kitchen=Object.fromEntries(oldRecipes.map(r=>[r.id,3]));st.S.coins=1000;st.S.homestead=rules.createHomestead(st.S,Date.now());assert(rules.performHomestead(st.S,{type:'tutorial'},Date.now()).ok,'合成旧玩家牧场开启');st.S.homestead.pantry={};window.oldHistory={...st.S.live.kitchen};window.expectedCoins=1000;`);
    await q.run(`const e={id:'ranch_picnic',gx:20,gz:10,rot:0};st.S.placed.push(e);t.decors.home.addObj(e,false);st.bus.emit('decorChanged');`);
    for(const id of ['kitchen_stove','kitchen_fridge','kitchen_island']){
      await q.run(`await freshKitchen(${JSON.stringify(id)});`);await q.click('.prompt button');
      await q.check(label+' '+id+' 实体入口对应新界面，空库存不变资源', `
        assert(document.querySelector('.veil:not(.out) .hs-app'),'新面板');
        if(${JSON.stringify(id)}==='kitchen_fridge'){assert(document.querySelector('.hs-pantry'),'冰箱进入成品食材柜');eq(document.querySelectorAll('.hs-dish-card').length,0,'空冰箱');}
        else{assert(document.querySelector('.hs-kitchen'),'灶台中岛进入厨房');eq(recipeRows().length,24,'24菜可浏览');await decodeRecipeIcons();assert(document.querySelector('.hs-ingredient.missing'),'缺料提示');}
        eq(st.S.coins,1000,'打开不加钱');eq(st.S.crops,{},'打开不扣料');eq(st.S.homestead.dishes,{},'历史不生成实物');eq(st.S.live.kitchen,oldHistory,'旧记录保留');return fitPanel('.veil:not(.out) .hs-app');
      `);if(id==='kitchen_stove')await q.shot(label+'-kitchen-open');
    }
    await q.click('[data-recipe="strawberry_tart"]');
    // 缺料现在在点击前禁用；仍验证陈旧/程序点击不会生成免费成品。
    await q.check(label+' 缺料快捷制作提前禁用并说明来源', `const b=markButton('快捷制作');assert(b.disabled,'缺料按钮必须禁用');assert(document.querySelector('.hs-ingredient.missing .hs-ingredient-source'),'缺料来源入口');b.click();return true;`);
    await q.check(label+' 空库存制作被拒绝且不负扣或发奖励', `eq(st.S.coins,1000,'没有奖励');eq(st.S.crops,{},'无负库存');eq(st.S.homestead.dishes,{},'没有免费成品');eq(st.S.live.kitchen,oldHistory,'旧历史未变');assert(document.querySelector('.hs-kitchen'),'仍能查看来源');return true;`);
    for(let i=0;i<oldRecipes.length;i++){
      await q.run(`window.r=oldRecipes[${i}];st.S.crops={radish:7,...Object.fromEntries(r.cost)};await freshKitchen('kitchen_stove');`);
      await q.click('.prompt button');await q.click('[data-recipe="'+oldRecipes[i].id+'"]');await q.run(`window.oldCook=markButton('快捷制作');`);await q.click('[data-kitchen-target="yes"]');
      const dish=await q.check(label+' '+oldRecipes[i].id+' 制作只产实物，旧按钮不能复制', `
        eq(st.S.coins,expectedCoins,'制作不发金币');eq(st.S.crops,{radish:7},'精确一份配方');eq(st.S.live.kitchen,oldHistory,'旧历史只读');
        const keys=Object.keys(st.S.homestead.dishes);eq(keys.length,1,'唯一批次');const key=keys[0];eq(rules.parseDishKey(key).recipe,r.id,'正确料理');eq(st.S.homestead.dishes[key],1,'一份成品');eq(st.S.homestead.history[r.id],4,'旧3次加本次');
        oldCook.click();oldCook.click();eq(st.S.coins,expectedCoins,'旧按钮不加钱');eq(st.S.crops,{radish:7},'无负扣');eq(st.S.homestead.dishes[key],1,'无复制');assert(document.querySelector('.hs-pantry'),'出餐入冰箱');return{key,price:rules.dishPrice(key)};
      `);
      await q.click('.hs-dish-card[data-dish-key="'+dish.key+'"]');await q.run(`window.oldSell=markButton('出售 ·','.veil:not(.out) .hs-dish-actions');`);await q.click('[data-kitchen-target="yes"]');
      await q.check(label+' '+oldRecipes[i].id+' 售卖才结算，重复旧按钮不重复到账', `expectedCoins+=${dish.price};eq(st.S.coins,expectedCoins,'售卖金额');eq(st.S.homestead.dishes,{},'消耗实物');oldSell.click();oldSell.click();eq(st.S.coins,expectedCoins,'不能重复出售');eq(st.S.live.kitchen,oldHistory,'不覆写旧历史');return true;`);
    }
    await q.run(`window.r=oldRecipes[0];st.S.crops={radish:7,...Object.fromEntries(r.cost.map(([id,n])=>[id,n*2]))};await freshKitchen('kitchen_stove');`);await q.click('.prompt button');await q.click('[data-recipe="strawberry_tart"]');
    await q.run(`const s=document.querySelector('[aria-label="快捷制作份数"]');assert(s,'熟练菜可批量');s.value='2';s.dispatchEvent(new Event('change',{bubbles:true}));`);await clickText('快捷制作');
    await q.check(label+' 快捷批量2份按两份扣料且不即时发钱', `window.teaKey=Object.keys(st.S.homestead.dishes)[0];eq(st.S.homestead.dishes[teaKey],2,'2份实物');eq(st.S.crops,{radish:7},'两份扣料');eq(st.S.coins,expectedCoins,'不即时发钱');return true;`);
    for(let party=0;party<2;party++){
      await clickText('招待');const key=await q.run('return teaKey;');await q.click('.hs-dish-card[data-dish-key="'+key+'"]');await clickText('开始招待');await q.run(`window.oldTea=markButton('跳过演出并完成');`);await q.click('[data-kitchen-target="yes"]');
      await q.check(label+' 茶会'+(party+1)+' 消耗实物不发旧80噗灵，重复结算被拒绝', `eq(st.S.coins,expectedCoins,'茶会不发免费金币');eq(st.S.homestead.dishes[teaKey]||0,${1-party},'消耗1份');eq(st.S.homestead.teaCount,${party+1},'场次正确');oldTea.click();oldTea.click();eq(st.S.homestead.teaCount,${party+1},'不能重复结算');eq(st.S.coins,expectedCoins,'重复无金币');eq(st.S.live.kitchen,oldHistory,'不消耗历史次数');eq(st.S.homestead.teaDay,rules.homesteadDay(Date.now()),'现实日标记');return true;`);
    }
    const expected=await q.run(`assert(st.flushSave(),'已落盘');return{coins:st.S.coins,crops:st.S.crops,legacy:st.S.live.kitchen,history:st.S.homestead.history,teaDay:st.S.homestead.teaDay,teaCount:st.S.homestead.teaCount,dishes:st.S.homestead.dishes};`);
    await q.load(slot,false);await q.run(bind);
    await q.check(label+' 真实页面重载保留金币库存新旧计数与现实日招待状态', `const e=${JSON.stringify(expected)};eq(st.S.coins,e.coins,'金币');eq(st.S.crops,e.crops,'作物');eq(st.S.live.kitchen,e.legacy,'旧记录');eq(st.S.homestead.history,e.history,'新记录');eq(st.S.homestead.teaDay,e.teaDay,'日标记');eq(st.S.homestead.teaCount,e.teaCount,'场次');eq(st.S.homestead.dishes,e.dishes,'成品守恒');return true;`);
    await q.run(`await freshKitchen('kitchen_stove');`);await q.click('.prompt button');await q.check(label+' 重载后二十四菜界面完整可用且不出屏', `eq(recipeRows().length,24,'24菜仍在');return fitPanel('.veil:not(.out) .hs-app');`);await q.shot(label+'-kitchen-after-reload');
  }
});
