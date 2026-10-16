const { suite } = require('./live_harness.js');
suite('gemini_gameplay_review', async q => {
  await q.profile({width:866,height:412});
  await q.run(`qaPump=false;clearInterval(qaTimer);engine.renderer.setAnimationLoop(null);window.kit=await import('/js/core/kit.js');window.aud=(await import('/js/core/audio.js')).audio;window.town=__game.town;`);
  await q.check('替换存档立即重新绑定家具，旧引用不能再收回刷物品', `
    const d=town.decors.home;let position;for(let x=0;x<d.lot.cols&&!position;x++)for(let z=0;z<d.lot.rows;z++)if(d.canPlace('chair',x,z,0)){position=[x,z];break;}assert(position,'有可摆放位置');const entry={id:'chair',gx:position[0],gz:position[1],rot:0};st.S[d.pk].push(entry);const old=d.addObj(entry,false);
    const next=st.serializeState(),id=old.e.id;st.replaceSaveData(next);
    assert(d.entries.every(r=>st.S[d.pk].includes(r.e)),'每条场景引用属于新存档');
    const before=st.S.decor[id]||0,placed=st.S[d.pk].length;
    d.focus=old;d.focusStore(false);eq(st.S.decor[id]||0,before,'旧记录不增加仓库');eq(st.S[d.pk].length,placed,'旧记录不删除新家具');
    const rec=d.entries.find(r=>r.e.id===id);d.focus=rec;d.focusStore(false);
    eq(st.S.decor[id],before+1,'真实家具收回一次');eq(st.S[d.pk].length,placed-1,'同次从存档移除');
    const roots=d.entries.map(r=>r.obj.uuid);st.bus.emit('stateReplaced');eq(d.entries.map(r=>r.obj.uuid),roots,'重复事件不重建当前存档');return {id,before,after:st.S.decor[id]};
  `);
  await q.check('装修预留家具费用不会被铺地花掉；余额不足退出仍可撤销', `
    const d=town.decors.home;town.setZone('home');d.enter();st.S.coins=120;d.pendingCost=120;
    let point;for(let x=0;x<d.lot.cols&&!point;x++)for(let z=0;z<d.lot.rows;z++)if(d.inBounds(x,z)&&!d.blockedTiles.has(x+','+z)&&st.S[d.fk][x+','+z]!=='wood'){point=[x,z];break;}
    assert(point,'可铺地');d.floorSel='wood';d.cursor={fx:point[0]+.1,fz:point[1]+.1};const floor=JSON.stringify(st.S[d.fk]);d.paint();eq(st.S.coins,120,'预留费用完整');eq(JSON.stringify(st.S[d.fk]),floor,'铺地未落账');
    d.recordEdit(d.snapshot(),'可撤销');st.S.coins=40;const history=d.history.length;eq(d.exit(),false,'不足不能结算');eq(d.history.length,history,'撤销栈保留');assert(d.canUndo,'玩家仍能撤销');
    st.S.coins=120;eq(d.exit(),true,'补足可退出');eq(st.S.coins,0,'只扣一次家具款');return {history};
  `);
  await q.check('第七次许愿在动画前扣款发奖并落盘，换档后旧动画不再入账', `
    st.S.coins=100;st.S.stats.wishes=6;const timers=[],nativeTimeout=window.setTimeout;
    window.setTimeout=(fn,ms,...a)=>ms===700?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    try{__game.wish();}finally{window.setTimeout=nativeTimeout;}
    eq(st.S.coins,172,'同步扣5奖77');eq(st.S.stats.wishes,7,'次数已保存');assert(st.S.stats.egg_seven>0,'成就统计');
    const key='nikki-block-town-save-v1:'+new URLSearchParams(location.search).get('slot');eq(JSON.parse(localStorage.getItem(key)).coins,172,'奖励已落盘');
    st.replaceSaveData(st.serializeState());const coins=st.S.coins;for(const fn of timers)fn();eq(st.S.coins,coins,'旧动画不碰新档');return {timers:timers.length,coins};
  `);
  await q.check('扭蛋奖励与次数动画前结算，跨档回调不复制奖励', `
    st.S.coins=1000;const timers=[],nativeTimeout=window.setTimeout,nativeRandom=Math.random;Math.random=()=>.8;
    window.setTimeout=(fn,ms,...a)=>ms===950||[0,130,260,390,520,650].includes(ms)?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    try{town.inter.find(i=>i.id==='capsule').act();}finally{window.setTimeout=nativeTimeout;Math.random=nativeRandom;}
    eq(st.S.coins,1070,'扣30后100大奖立即到账');assert(st.S.stats.capsules>0,'次数统计');
    st.replaceSaveData(st.serializeState());const before=st.S.coins;for(const fn of timers)fn();eq(st.S.coins,before,'动画无延迟发钱');return {timers:timers.length,coins:before};
  `);
  await q.check('签筒重复点击只结算一次，换档后不会弹旧签', `
    st.S.live.fun={};const timers=[],nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===420?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    const before=st.S.coins;try{town.inter.find(i=>i.id==='fortune').act();town.inter.find(i=>i.id==='fortune').act();}finally{window.setTimeout=nativeTimeout;}
    eq(st.S.coins,before+20,'一次20');st.replaceSaveData(st.serializeState());const count=document.querySelectorAll('.fortune').length;for(const fn of timers)fn();eq(document.querySelectorAll('.fortune').length,count,'旧签不打开');return {timers:timers.length};
  `);
  await q.check('纸鹤动画前扣费与回礼落账，旧愿望摊不能继续操作新档', `
    closePanels();town.setZone('town',8.6,10.4);st.S.coins=1000;town.inter.find(i=>i.id==='giovanni').act();
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('愿今天顺顺利利'));assert(button,'愿望按钮');
    const timers=[],nativeTimeout=window.setTimeout,nativeRandom=Math.random;Math.random=()=>.1;window.setTimeout=(fn,ms,...a)=>ms===2600?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    try{button.click();}finally{window.setTimeout=nativeTimeout;Math.random=nativeRandom;}
    eq(st.S.coins,1010,'扣20奖30立即到账');assert(st.S.stats.papers>0,'纸鹤计数');const key='nikki-block-town-save-v1:'+new URLSearchParams(location.search).get('slot');eq(JSON.parse(localStorage.getItem(key)).coins,1010,'整笔已落盘');
    const stale=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('愿今天顺顺利利'));st.replaceSaveData(st.serializeState());const before=st.S.coins;for(const fn of timers)fn();stale.click();eq(st.S.coins,before,'旧动画与旧面板都不扣新档钱');closePanels();return {coins:before,timers:timers.length};
  `);
  await q.check('八音盒不接管新曲目或后台的暂停', `
    const timers=[],nativeTimeout=window.setTimeout,oldPause=aud.pauseMusic,oldResume=aud.resumeMusic,oldInfo=aud.info;let resumed=0;aud.info={};aud.musicPaused=false;aud.pauseMusic=()=>{aud.musicPaused=true;};aud.resumeMusic=()=>resumed++;
    window.setTimeout=(fn,ms,...a)=>ms>10000?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    try{town.inter.find(i=>i.id==='musicbox').act();assert(timers.length>0,'恢复定时器');aud.info={};for(const fn of timers)fn();eq(resumed,0,'旧八音盒不恢复新曲目');engine.suspended=true;for(const fn of timers)fn();eq(resumed,0,'后台不恢复');}
    finally{engine.suspended=false;window.setTimeout=nativeTimeout;aud.pauseMusic=oldPause;aud.resumeMusic=oldResume;aud.info=oldInfo;}return {resumed};
  `);
  await q.check('八音盒计时在后台结束，回到小镇后恢复它自己暂停的曲目', `
    for(const tick of [...town.ticks])tick(20,20);const timers=[],nativeTimeout=window.setTimeout,oldPause=aud.pauseMusic,oldResume=aud.resumeMusic,oldInfo=aud.info;let resumed=0;aud.info={};aud.musicPaused=false;aud.pauseMusic=()=>{aud.musicPaused=true;};aud.resumeMusic=()=>resumed++;
    window.setTimeout=(fn,ms,...a)=>ms>10000?(timers.push(()=>fn(...a)),0):nativeTimeout(fn,ms,...a);
    try{town.inter.find(i=>i.id==='musicbox').act();assert(timers.length,'恢复定时器');engine.suspended=true;for(const fn of timers)fn();eq(resumed,0,'后台保持静音');engine.suspended=false;for(const tick of [...town.ticks])tick(21,0);eq(resumed,1,'回前台恢复一次');for(const tick of [...town.ticks])tick(22,0);eq(resumed,1,'后续帧不重复');}
    finally{engine.suspended=false;window.setTimeout=nativeTimeout;aud.pauseMusic=oldPause;aud.resumeMusic=oldResume;aud.info=oldInfo;}return {resumed};
  `);
  await q.check('裁缝捕获丢失不等于抬手，真正抬手仍释放', `
    await openGame('tailor');g.hit=()=>{};let released=0;g.release=()=>released++;
    g.pointerDown(0,{button:0,pointerId:701,preventDefault(){},currentTarget:{setPointerCapture(){}}});
    window.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:701}));assert(g.laneHeld(0),'捕获丢失仍按住');eq(released,0,'未误松开');
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:701}));assert(!g.laneHeld(0),'真实抬手松开');eq(released,1,'只释放一次');closeGame();qaPump=false;return {released};
  `);
  await q.check('裁缝音频时钟首次解锁和重新建Context均连续', `
    await openGame('tailor');const orig=Object.getOwnPropertyDescriptor(aud,'running'),oldNow=aud.now,oldCtx=aud.ctx;let running=false,at=140;Object.defineProperty(aud,'running',{configurable:true,get:()=>running});aud.now=()=>at;
    try{g._clockRunning=false;g._clockContext=aud.ctx;g._clockWall=performance.now();g.t0=130;g.songRate=1;eq(g.songTime(),10,'旧时钟10秒');running=true;at=.2;const after=g.songTime();assert(after>=10&&after<10.5,'解锁不倒退或跳跃');aud.ctx={};at=.01;const replaced=g.songTime();assert(replaced>=after&&replaced<after+.5,'重新建Context连续');g.setRhythmRate(.8);const paced=g.songTime();assert(Math.abs(paced-replaced)<.1,'变速不跳拍');return {after,replaced,paced};}
    finally{aud.now=oldNow;aud.ctx=oldCtx;if(orig)Object.defineProperty(aud,'running',orig);else delete aud.running;closeGame();qaPump=false;}
  `);
  for(const id of ['cafe','flower','bakery'])await q.check(id+' 离场顾客即时释放独占几何，共享材质保留', `
    await openGame('${id}');if('${id}'==='flower')g.newOrder(0);else g.spawn(0);const c=g.customers.find(Boolean);assert(c,'生成顾客');let disposed=0,shared=0,total=0;
    c.ch.root.traverse(o=>{if(o.geometry&&o.name==='static-merged'){total++;o.geometry.addEventListener('dispose',()=>disposed++);}if(o.material===kit.mat('#ffffff'))o.material.addEventListener('dispose',()=>shared++);});assert(total>0,'合批几何');
    c.state='out';c.ch.root.position.x=-12.5;if('${id}'==='flower')c.ch.root.position.x=-13;if('${id}'==='cafe')c.ch.root.position.x=-12;
    for(let i=0;i<150&&c.ch.root.parent;i++)g.tick(.1,i*.1);assert(!c.ch.root.parent,'离场');eq(disposed,total,'全数释放');eq(shared,0,'共享材质仍在');closeGame();qaPump=false;eq(disposed,total,'退出不会重复清理离场顾客');return {disposed,total,shared};
  `);
  await q.check('斗篷缓存克隆几何独立，画质档切换不复用错误模板', `
    const {buildMomoCloak}=await import('/js/models/momo-cloak-models.js');const vertices=c=>[c.head,c.body].reduce((n,g)=>n+g.children.reduce((a,m)=>a+m.geometry.attributes.position.count,0),0);
    kit.setGeoDetail(1);const a=buildMomoCloak('veil'),b=buildMomoCloak('veil');let destroyed=0;b.head.children[0].geometry.addEventListener('dispose',()=>destroyed++);assert(a.head.children[0].geometry!==b.head.children[0].geometry,'独立几何');kit.disposeSceneResources(a.head);kit.disposeSceneResources(a.body);eq(destroyed,0,'销毁A不影响B');
    const high=vertices(b);kit.setGeoDetail(0);const low=buildMomoCloak('veil');assert(vertices(low)<high,'低画质模板保持更低面数');const c=buildMomoCloak('veil');eq(vertices(c),vertices(low),'缓存相同画质');for(const x of [b,low,c]){kit.disposeSceneResources(x.head);kit.disposeSceneResources(x.body);}kit.setGeoDetail(1);return {high,low:vertices(low)};
  `);
  await q.shot('town_after_review_regressions');
});

