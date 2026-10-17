// Real Chromium input and overlap regression for the merged friend update.
const { suite } = require('./live_harness.js');
suite('friend_release', async q => {
  const cdp = (method, args) => q.window.webContents.debugger.sendCommand(method, args);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  for (const [width,height] of [[320,568],[390,844],[640,360],[866,412],[1280,800]]) {
    await q.profile({ width,height,preview:false });
    await q.run(`engine.renderer.setAnimationLoop(null);qaPump=false;`);
    await q.check(`${width} FPS missing/smoothing/recovery`, `
      st.S.settings.showFps=true;ui.syncFpsVisibility();
      engine.fpsAvg=undefined;ui.updateFpsReadout();assert(ui.fpsNumEl.textContent==='—','missing FPS');
      engine.fpsAvg=60;for(let i=0;i<40;i++)ui.updateFpsReadout();assert(ui.fpsNumEl.textContent==='60','60 converges');
      engine.fpsAvg=30;for(let i=0;i<40;i++)ui.updateFpsReadout();assert(ui.fpsNumEl.textContent==='30','30 converges');
      engine.fpsAvg=60;for(let i=0;i<40;i++)ui.updateFpsReadout();assert(ui.fpsNumEl.textContent==='60','recovers');return true;
    `);
    await q.run(`await openGame('tailor');g.clearNotes();g.chart=[];g.ci=0;window.qaSong=10;g.songTime=()=>qaSong;
      (await import('/js/core/util.js')).updateTweens(2);engine.fitCamera(g);g.measureLanes();
      g.spawnNote({lane:1,time:10.05,dur:.4});g.renderNotes(10);g.momoEnergy=100;g.syncMomoSkill();engine.renderer.render(g.scene,g.camera);`);
    await q.sleep(100);
    await q.check(`${width} skill is visible and clear of all four keys`, `
      const b=g.momoSkillBtn.getBoundingClientRect();const keys=g.keyEls.map(e=>e.getBoundingClientRect());
      const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
      assert(keys.every(k=>!overlap(b,k)),'skill overlays lane keys');
      assert(b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,'skill bounds');assert(b.height>=44,'touch height');
      assert(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.gmomo-skill')===g.momoSkillBtn,'skill intercepted');
      assert(g.momoSkillBtn.title.includes('空格')&&g.momoSkillText.textContent.includes('空格'),'Space hint');
      const note=g.notes[0];assert(note.visual.tail.visible&&note.visual.thread.visible,'hold head/tail');
      return {skill:[b.x,b.y,b.width,b.height],keys:keys.map(k=>[k.x,k.y,k.width,k.height])};
    `);
    if(width===390) await q.check('old bottom8rem rule reproduces key overlap', `
      const button=g.momoSkillBtn;button.style.setProperty('top','auto','important');button.style.setProperty('bottom','8rem','important');
      const b=button.getBoundingClientRect();const overlap=g.keyEls.some(e=>{const k=e.getBoundingClientRect();return Math.min(b.right,k.right)>Math.max(b.left,k.left)&&Math.min(b.bottom,k.bottom)>Math.max(b.top,k.top)});
      button.style.removeProperty('top');button.style.removeProperty('bottom');assert(overlap,'old layout reproduction');return true;
    `);
    await q.check(`${width} editing does not consume Space skill`, `
      const field=document.createElement('input');g.hudEl.append(field);field.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));field.remove();
      assert(g.momoSkillsUsed===0&&g.momoEnergy===100,'typing cast skill');return true;
    `);
    await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'Space',key:' ',windowsVirtualKeyCode:32});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' ',windowsVirtualKeyCode:32});
    await q.check(`${width} actual Space casts exactly once`, `assert(g.momoSkillsUsed===1&&g.momoEnergy===0,'Space input');return true;`);
    const touchPoints=await q.run(`g.clearNotes();g.spawnNote({lane:1,time:10,dur:0});g.spawnNote({lane:2,time:10,dur:0});
      window.beforeTouchPerfect=g.stats.perfect;return [1,2].map((lane,i)=>{const r=g.keyEls[lane].getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom-8,id:i+1};});`);
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await q.check(`${width} lower F/J edges accept two real touches`, `assert(g.stats.perfect===beforeTouchPerfect+2,'touch intercepted');return true;`);
    const skillTouch=await q.run(`g.clearNotes();g.spawnNote({lane:0,time:10,dur:0});g.momoEnergy=100;g.syncMomoSkill();
      window.qaTouchEvents=[];for(const type of ['pointerdown','pointerup','touchstart','touchend','click'])g.momoSkillBtn.addEventListener(type,e=>qaTouchEvents.push({type:e.type,prevented:e.defaultPrevented}),{once:true});
      const r=g.momoSkillBtn.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,id:3};`);
    // A newly enabled button must reach the compositor before native hit testing.
    await q.sleep(100);
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[skillTouch]});
    await q.sleep(60);
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await q.sleep(350);
    await q.check(`${width} skill button accepts a real touch`, `const detail={uses:g.momoSkillsUsed,energy:g.momoEnergy,playing:g.playing,usable:g.canMomoSkill(),events:qaTouchEvents};assert(g.momoSkillsUsed===2&&g.momoEnergy===0,'skill touch '+JSON.stringify(detail));return detail;`);
    await q.check(`${width} delayed touch click cannot cast twice`, `g.clearNotes();g.spawnNote({lane:0,time:10,dur:0});g.momoEnergy=100;g.syncMomoSkill();g.momoSkillBtn.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));assert(g.momoSkillsUsed===2&&g.momoEnergy===100,'duplicate compatibility click');return true;`);
    await q.shot(width+'-tailor');
    await q.run('closeGame();');
  }
  await q.run(`await openGame('cafe');`);
  await q.check('default G and dynamic key title stay aligned', `
    g.momoEnergy=100;g.syncMomoSkill();assert(g.momoSkillBtn.title.includes('G'),'default G');
    g.momoSkillKey='KeyH';g.syncMomoSkill();assert(g.momoSkillBtn.title.includes('H')&&g.momoSkillText.textContent.includes('H'),'dynamic H');
    g.momoSkillKey='KeyG';g.syncMomoSkill();return true;
  `);
  await q.run('closeGame();');
});
