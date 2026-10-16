// Real Chromium inputs. live_harness owns the isolated profile/slot and blocks
// external network; the main task owns the safe_local service on port 5173.
const { suite } = require('./live_harness.js');

suite('momo_fortune_ui', async q => {
  const cdp = (method, args) => q.window.webContents.debugger.sendCommand(method, args);
  const keyG = async () => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 });
    await q.sleep(80);
  };
  const touch = async selector => {
    const p = await q.run(`
      const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();
      assert(e&&!e.disabled,'触摸控件不可用');const x=r.x+r.width/2,y=r.y+r.height/2;
      assert(e.contains(document.elementFromPoint(x,y)),'触摸控件被挡');return {x,y};`);
    await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{id:1,...p,radiusX:3,radiusY:3,force:1}]});
    await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await q.sleep(120);
  };
  const tailFixture = () => q.run(`
    g.clearNotes();g.chart=[];g.ci=0;g.songTime=()=>10;
    for(let lane=0;lane<4;lane++)g.spawnNote({lane,time:10+lane*.025,dur:lane===2?1:0});
    g.momoEnergy=100;g.syncMomoSkill();g.renderNotes(10);engine.renderer.render(g.scene,g.camera);
    window.skillsBefore=g.momoSkillsUsed;window.perfectBefore=g.stats.perfect;
  `);
  const geom = `
    const visible=e=>{for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return false;}return true;};
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
    const controls=[g.momoSkillBtn,...g.keyEls,g.pauseBtn,g.hudEl.querySelector('.gquit')];
    const boxes=controls.map(e=>{const b=rect(e);assert(visible(e)&&b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1,'控件出屏: '+e.className);
      const p={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};assert(e.contains(document.elementFromPoint(p.x,p.y)),'控件被遮挡: '+e.className);return {name:e.className,...b};});
    assert(boxes[0].width>=100&&boxes[0].height>=44,'应援按钮触摸目标不足');
    assert(boxes.slice(1,5).every(b=>b.width>=56&&b.height>=56),'四轨按键缩小');
    assert(boxes.slice(1).every(b=>!overlap(boxes[0],b)),'应援按钮压住暂停/打烊/四轨');
    const information=[...g.hudEl.querySelectorAll('.gcombo > *,.gtop > *')].filter(visible).filter(e=>e!==g.momoSkillBtn).map(e=>({name:e.className,...rect(e)}));
    assert(information.every(b=>!overlap(boxes[0],b)),'应援按钮压住计分/加成/计时');
    for(let i=0;i<information.length;i++)for(let j=i+1;j<information.length;j++)assert(!overlap(information[i],information[j]),'HUD信息相互遮挡: '+JSON.stringify([information[i],information[j]]));
    const {THREE}=await import('/js/core/kit.js');g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);
    const characterBoxes=[g.nikki.root,g.momo.root].map((root,i)=>{
      const vertices=[];root.traverse(mesh=>{if(!mesh.isMesh||mesh.name==='character-contact-blob')return;
        for(let n=mesh;n;n=n.parent)if(!n.visible)return;
        const attr=mesh.geometry?.getAttribute('position');if(!attr)return;
        for(let j=0;j<attr.count;j++){const p=new THREE.Vector3().fromBufferAttribute(attr,j).applyMatrix4(mesh.matrixWorld).project(g.camera);vertices.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});}});
      const b={name:i?'大喵':'暖暖',left:Math.min(...vertices.map(p=>p.x)),right:Math.max(...vertices.map(p=>p.x)),top:Math.min(...vertices.map(p=>p.y)),bottom:Math.max(...vertices.map(p=>p.y))};
      assert(b.bottom-b.top>20,'角色仍处于入场缩放初始态');assert(!overlap(boxes[0],b),'应援按钮挡住角色: '+JSON.stringify(b));
      assert(!g.fortuneEl||!overlap(rect(g.fortuneEl),b),'新增吉签徽记挡住角色: '+JSON.stringify(b));
      return b;});
    const points=[];
    for(const lane of g.laneEls){const r=lane.getBoundingClientRect();for(const x of [.35,.5,.65])for(const y of [.25,.5,.8]){
      const p={x:r.left+r.width*x,y:r.top+r.height*y},hit=document.elementFromPoint(p.x,p.y);
      if(lane.contains(hit))points.push(p);else assert(!g.momoSkillBtn.contains(hit),'应援按钮压住送布轨道');}}
    assert(points.length>=8,'送布轨道可点样本不足');
    return {viewport:[innerWidth,innerHeight],boxes,information,characterBoxes,visibleLaneSamples:points.length};
  `;
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.momoQaStartupErrors=[];
    let bootError;
    Object.defineProperty(window,'__showBootError',{configurable:true,get:()=>bootError,set:fn=>{bootError=(...args)=>{momoQaStartupErrors.push({type:'boot',message:args[0]});return fn(...args);};}});
    window.addEventListener('error',e=>momoQaStartupErrors.push({type:'error',message:e.message,file:e.filename,line:e.lineno,stack:e.error?.stack}),true);
    window.addEventListener('unhandledrejection',e=>momoQaStartupErrors.push({type:'rejection',message:e.reason?.message||String(e.reason),stack:e.reason?.stack}));
  `});
  for (const [width,height,label] of [[390,844,'phone_portrait'],[866,412,'phone_landscape'],[1280,800,'desktop']]) {
    let slot;
    try { slot=await q.profile({width,height,preview:false,tag:'_'+label}); }
    catch(error) {
      q.report.startup=await q.run(`return {boot:document.querySelector('#boot')?.textContent,errors:window.momoQaStartupErrors||[],resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))};`);
      throw error;
    }
    await q.run(`
      engine.renderer.setAnimationLoop(null);qaPump=false;
      window.support=await import('/js/shared/momo-fortune.js');window.sf=await import('/js/core/save-format.js');
      window.t=__game.town;window.townInput=await import('/js/world/town/input.js');
      closePanels();t.setZone('town');t.moveTo=null;t.frozen=false;t.lock=0;t.camMode='play';
      st.S.live.fun={day:support.dailyFunKey(st.S),used:{},capsule:0};window.coinsBeforeFortune=st.S.coins;
      let focused=false;
      for(let z=-15;z<=20&&!focused;z+=5)for(let x=-15;x<=30&&!focused;x+=5){
        t.pos.set(x,0,z);t.momo.root.position.set(x+.6,0,z+.6);
        if(t.findInter()?.id==='momoPet')focused=true;
      }
      assert(focused,'未找到大喵可达互动位置');townInput.updatePrompts(t);
      assert(ui.promptBtn.textContent.includes('摸摸大喵'),'摸大喵提示缺失');
    `);
    await q.click('.prompt button');
    await q.check(label+' 实际摸大喵写入当日标记且不改变金币',`
      eq(support.getDailySupport(st.S).momoEnergy,35,'真实摸大喵应援');eq(st.S.coins,coinsBeforeFortune,'摸大喵不发金币');
      eq(st.S.live.fun.used.momoPet,1,'当日已摸标记');return true;`);
    await q.run(`
      t.lock=0;t.frozen=false;const ft=t.inter.find(i=>i.id==='fortune');assert(ft,'签筒真实互动点');
      t.pos.set(ft.x,0,ft.z+.4);t.moveTo=null;townInput.updatePrompts(t);assert(t.cur?.id==='fortune','未聚焦真实签筒');
    `);
    await q.click('.prompt button');await q.wait('document.querySelector(".fortune")');
    await q.check(label+' 真实签筒一次找零与当日等级同步',`
      eq(st.S.coins,coinsBeforeFortune+20,'签筒仅首次找零20');assert(support.getDailySupport(st.S).fortuneLv,'实际抽签后获得加成');
      assert(document.querySelector('.fortune h2').textContent===support.getDailySupport(st.S).fortuneLv,'显示与保存签级不一致');return fitPanel('.fortune');`);
    await q.shot(label+'_fortune');await q.click('.live-modal .x');
    await q.run(`
      st.S.live.fun={day:support.dailyFunKey(st.S),used:{momoPet:1,fortune:1,fortuneLv:'中吉'},capsule:2};
      st.S.coins=32123;st.flushSave();window.funBefore=JSON.stringify(st.S.live.fun);
      await openGame('tailor');g.chart=[];g.clearNotes();g.songTime=()=>10;
      (await import('/js/core/util.js')).updateTweens(2);engine.fitCamera(g);g.measureLanes();
    `);
    await q.sleep(100);
    await q.check(label+' 今日应援快照和吉签数值可见',`
      eq(g.momoEnergy,55,'摸大喵35与中吉20相加');eq(g.fortuneLv,'中吉','今日签快照');eq(g.fortuneBonus,.05,'中吉营收5%');
      assert(g.fortuneEl&&getComputedStyle(g.fortuneEl).display!=='none'&&g.fortuneEl.textContent.includes('+5%'),'吉签加成不可见');
      eq(JSON.stringify(st.S.live.fun),funBefore,'开局只读今日记录');return {text:g.momoSkillBtn.textContent,fortune:g.fortuneEl.textContent};`);
    await tailFixture();
    await q.check(label+' 应援、四轨、暂停和退出触摸区域互不遮挡',geom);
    await q.shot(label+'_ready');
    if(label==='desktop')await q.click('.gmomo-skill');else await touch('.gmomo-skill');
    await q.check(label+' 真实点击触摸使裁缝大喵技能生效一次',`
      eq(g.momoSkillsUsed,skillsBefore+1,'技能应只触发一次');eq(g.momoEnergy,0,'技能计分不自充能');
      assert(g.stats.perfect>perfectBefore,'裁缝技能未缝针脚');eq(JSON.stringify(st.S.live.fun),funBefore,'技能不修改每日记录');
      return {uses:g.momoSkillsUsed,perfect:g.stats.perfect,energy:g.momoEnergy};`);
    await tailFixture();await keyG();
    await q.check(label+' G键与按钮遵循相同能量规则',`
      eq(g.momoSkillsUsed,skillsBefore+1,'G键只生效一次');eq(g.momoEnergy,0,'G键技能不自充能');return true;`);
    await tailFixture();await q.click('.tailor-pause');await keyG();
    await q.check(label+' 暂停不能消耗应援或缝针脚',`
      assert(g.paused&&g.momoSkillBtn.disabled,'暂停时技能按钮应不可用');eq(g.momoSkillsUsed,skillsBefore,'暂停G键未触发');eq(g.momoEnergy,100,'暂停保留能量');return true;`);
    await q.shot(label+'_paused');await q.click('.tailor-pause');
    await q.check(label+' 恢复保留能量且四轨仍能正常点击',`
      assert(g.playing&&!g.momoSkillBtn.disabled,'恢复后技能控件未恢复');g.clearNotes();g.spawnNote({lane:0,time:10,dur:0});window.hitBefore=g.stats.perfect;return true;`);
    if(label==='desktop')await q.click('[data-tailor-key="0"]');else await touch('[data-tailor-key="0"]');
    await q.check(label+' 普通四轨输入与应援控件无串触',`
      eq(g.stats.perfect,hitBefore+1,'普通轨道命中');eq(g.momoSkillsUsed,skillsBefore,'点击轨道没有误开技能');return true;`);
    // wait()/result animation use the shared tween clock, so resume that clock
    // after deterministic note-input assertions; the game itself is now over.
    await q.run(`qaPump=true;g.resolve=choice=>{window.lastResultChoice=choice;if(choice==='exit')closeGame();};`);
    await q.click('.gquit');await q.wait('document.querySelector(".result")');
    await q.check(label+' 打烊结算显示吉签并允许返回小镇',`
      assert(document.querySelector('.result .lines').textContent.includes('今日吉签 (中吉)'),'结算缺少本局吉签');return fitPanel('.result');`);
    await q.shot(label+'_result');await q.click('.result-actions .btn');
    await q.wait('window.lastResultChoice==="exit"');
    const saved=await q.run(`
      assert(!document.querySelector('.gmomo-skill'),'返回后旧技能按钮残留');st.flushSave();sf.validateSaveData(st.serializeState());
      return {coins:st.S.coins,fun:st.S.live.fun,plays:st.S.shops.tailor.plays};`);
    await keyG();
    await q.load(slot,false);
    await q.check(label+' 返回与重载保留原经济和每日记录',`
      eq(st.S.coins,${saved.coins},'结算金币持久化');eq(st.S.live.fun,${JSON.stringify(saved.fun)},'每日已用签和摸喵记录保留');eq(st.S.shops.tailor.plays,${saved.plays},'局数持久化');return true;`);
    await q.run(`engine.renderer.setAnimationLoop(null);qaPump=false;await openGame('tailor');g.chart=[];g.clearNotes();`);
    await q.check(label+' 重进重置局内应援并重新读取今日快照',`
      eq(g.momoEnergy,55,'每局初始应援');eq(g.momoSkillsUsed,0,'局内次数不存档');eq(g.fortuneLv,'中吉','本日重进保留签');return true;`);
    await q.run(`closeGame();st.S.gday++;st.bus.emit('newDay',st.S.gday);qaPump=false;await openGame('tailor');g.chart=[];g.clearNotes();`);
    await q.check(label+' 跨镇历日的新局不会继承昨天吉签和摸喵加成',`
      eq(g.momoEnergy,0,'过期摸喵与中吉能量清零');eq(g.fortuneLv,null,'过期签失效');eq(g.fortuneBonus,0,'过期签不计营收');
      assert(!g.fortuneEl,'过期吉签徽记应消失');closeGame();return true;`);
    // The same public skill HUD is shared by all five stores. Check the nearby
    // controls in each real scene as well as the dedicated four-lane test above.
    for(const id of ['cafe','bakery','flower','fish']) {
      await q.run(`
        qaPump=false;st.S.live.fun={day:(await import('/js/shared/momo-fortune.js')).dailyFunKey(st.S),used:{momoPet:1,fortune:1,fortuneLv:'中吉'},capsule:2};
        await openGame(${JSON.stringify(id)});(await import('/js/core/util.js')).updateTweens(2);engine.fitCamera(g);
        if(g.id==='cafe'){g.stock=g.stock.map(()=>0);g.syncStock();}
        if(g.id==='bakery')g.put(0);
        if(g.id==='flower'){g.gens.flower.n=0;g.renderPips();}
        if(g.id==='fish'){g.phase='reel';g.fish={id:'qa-fish',name:'合成鱼'};g.prog=.1;g.fp=.5;g.barH=.25;g.barEl.classList.remove('off');}
        g.momoEnergy=100;g.syncMomoSkill();engine.renderer.render(g.scene,g.camera);
      `);
      await q.sleep(150);
      await q.check(label+' '+id+' 应援入口及原操作不互相遮挡',`
        const e=g.momoSkillBtn,r=e.getBoundingClientRect();assert(!e.disabled,'有目标且满能量的技能不可用');
        assert(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&r.height>=44,'应援控件出屏或过小');
        assert(e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'应援入口被遮挡');
        const controls=[...g.hudEl.querySelectorAll('.gbar button,.bakery-controls button,.gmomo-skill,.gquit')].filter(el=>!el.disabled&&getComputedStyle(el).display!=='none');
        for(const c of controls){const b=c.getBoundingClientRect();if(!b.width||!b.height)continue;
          assert(b.left>=-1&&b.right<=innerWidth+1&&b.top>=-1&&b.bottom<=innerHeight+1,'原操作出屏: '+c.className);
          assert(c.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),'原操作被遮挡: '+c.className);}
        return {id:g.id,button:{x:r.x,y:r.y,w:r.width,h:r.height},controls:controls.length};`);
      await q.shot(label+'_'+id+'_ready');
      if(label==='desktop')await q.click('.gmomo-skill');else await touch('.gmomo-skill');
      await q.check(label+' '+id+' 真实应援输入只消耗一条能量且保留原玩法',`
        eq(g.momoSkillsUsed,1,'新店技能恰好使用一次');eq(g.momoEnergy,0,'没有自行充能');
        if(g.id==='cafe')assert(g.stock.every((n,i)=>i===g.soldout||g.brew[i]||n===3),'咖啡备货未补齐');
        if(g.id==='bakery')assert(g.ovens.some(o=>o&&o.k>=g.good[0]&&o.k<=g.good[1]),'面包没到完美火候');
        if(g.id==='flower')eq(g.gens.flower.n,g.gens.flower.max,'花篮补齐');
        if(g.id==='fish'){assert(Math.abs(g.prog-.45)<1e-9,'钓鱼进度35%');assert(!g.hold,'点击应援误触收线按住');}
        closeGame();return true;`);
    }
  }
});
