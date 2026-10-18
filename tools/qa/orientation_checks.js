// 横屏唯一模式：真实 Chromium 输入、旋转暂停、存档迁移及桥接拒绝。
const { suite } = require('./live_harness.js');
suite('orientation', async q => {
  const cdp = (method,args) => q.window.webContents.debugger.sendCommand(method,args);
  const resize = async(w,h) => { q.window.setContentSize(w,h); await q.sleep(220); await q.run('window.dispatchEvent(new Event("resize"));'); await q.sleep(150); };
  const key = async(type,code,key) => cdp('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});
  const slot = await q.profile({width:844,height:390,preview:false});
  await q.check('旧方向偏好迁移删除，金币作物和其他偏好保留', `
    const fmt=await import('/js/core/save-format.js');
    for (const orient of ['', 'auto', 'land', 'port']) {
      const d=JSON.parse(JSON.stringify(st.S));d.settings.orient=orient;d.coins=3456;d.crops={pumpkin:3};d.settings.music=.4;
      fmt.validateSaveData(d);const next=st.normalizeSaveData(d);
      assert(!Object.hasOwn(next.settings,'orient'),'legacy direction retained');eq(next.coins,3456,'coins');eq(next.crops,{pumpkin:3},'crops');eq(next.settings.music,.4,'music');
    }
    const d=JSON.parse(JSON.stringify(st.S));d.settings.orient='port';d.coins=3456;st.replaceSaveData(d);st.flushSave();return true;
  `);
  await q.load(slot,false);
  await q.check('迁移后重载不会恢复竖屏，设置不再提供方向选项', `
    assert(!Object.hasOwn(st.S.settings,'orient'),'reload restored direction');eq(st.S.coins,3456,'coins reloaded');
    ui.settingsPanel();const panel=document.querySelector('.settings');assert(panel,'settings missing');
    assert(!/跟随手机|固定竖屏|屏幕方向/.test(panel.textContent),'orientation UI remains');closePanels();return true;
  `);
  await q.check('原生只申请横屏并等待真实回执，拒绝不假报成功', `
    const o=await import('/js/core/orient.js');let calls=[];window.NikkiNative={setOrientation:mode=>calls.push(mode)};
    assert(await o.applyOrient(),'legacy bridge');eq(calls,['land'],'horizontal only');
    let request;window.NikkiNative={setOrientationRequest:(mode,id)=>{request={mode,id};}};
    let settled=false;const first=o.applyOrient().then(ok=>{settled=true;return ok;});await Promise.resolve();assert(!settled,'premature success');
    window.dispatchEvent(new CustomEvent('nuannuan:orientation',{detail:{id:'unrelated',mode:'land',ok:true}}));await Promise.resolve();assert(!settled,'foreign response');
    window.dispatchEvent(new CustomEvent('nuannuan:orientation',{detail:{...request,ok:true}}));assert(await first,'confirmed landscape');
    const second=o.applyOrient();window.dispatchEvent(new CustomEvent('nuannuan:orientation',{detail:{...request,ok:false}}));assert(!(await second),'refusal');
    window.NikkiNative={setOrientation:()=>{throw Error('expected');}};assert(!(await o.applyOrient()),'bridge exception');delete window.NikkiNative;return true;
  `);
  await q.check('网页锁定两个横屏方向且默认不抢全屏', `
    const o=await import('/js/core/orient.js'),original=screen.orientation.lock,full=document.documentElement.requestFullscreen;let locked=[],requested=0;
    screen.orientation.lock=mode=>{locked.push(mode);return Promise.resolve();};document.documentElement.requestFullscreen=()=>{requested++;return Promise.resolve();};
    assert(await o.applyOrient(),'web lock');eq(locked,['landscape'],'sensor landscape');eq(requested,0,'unsolicited fullscreen');
    assert(await o.applyOrient({fullscreen:true}),'explicit fullscreen');eq(requested,1,'fullscreen request');
    screen.orientation.lock=original;document.documentElement.requestFullscreen=full;return true;
  `);
  await q.sleep(350);
  const stagePoint=await q.run(`document.activeElement?.blur();window.pointerCancels=0;window.pointerTrace=[];engine.canvas.addEventListener('pointercancel',()=>pointerCancels++);
    for(const type of ['pointerdown','pointerup','pointercancel'])window.addEventListener(type,e=>pointerTrace.push({type,id:e.pointerId,target:e.target.id||e.target.className}),true);
    for(let y=80;y<innerHeight-60;y+=30)for(let x=innerWidth*.35;x<innerWidth*.65;x+=30)if(document.elementFromPoint(x,y)===engine.canvas)return {x,y};throw Error('no free canvas point');`);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...stagePoint});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...stagePoint,button:'left',clickCount:1});
  await key('rawKeyDown','KeyW','w');
  await q.check('横屏时真实键盘仍能驱动移动', `assert(__game.town.keys.has('KeyW'),'movement did not receive key');return true;`);
  await resize(390,844);
  await q.check('转为竖向立即阻断操作、清除移动并暂停时钟', `
    const gate=document.querySelector('#landscape-gate');assert(!gate.hidden&&getComputedStyle(gate).display==='grid','rotate gate not visible');
    assert(engine.suspended&&engine.orientationBlocked,'engine running behind gate');assert(ui.root.inert,'keyboard focus not isolated');eq([...__game.town.keys],[],'stuck movement');assert(pointerCancels>0,'active pointer was not cancelled '+JSON.stringify(pointerTrace));
    window.blockedTime=engine.time;return {viewport:[innerWidth,innerHeight],title:gate.textContent};
  `);
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:195,y:422,button:'left',clickCount:1});
  await key('rawKeyDown','KeyW','w');await key('keyUp','KeyW','w');await q.sleep(350);
  await q.check('提示下快捷键不能穿透且计时不增长', `eq([...__game.town.keys],[],'input passed gate');eq(engine.time,blockedTime,'game advanced');return true;`);
  await q.shot('portrait-rotate-prompt');
  await q.run(`window.originalFullscreen=document.documentElement.requestFullscreen;document.documentElement.requestFullscreen=()=>Promise.reject(new Error('unsupported'));`);
  await q.click('[data-landscape-enter]');await q.sleep(100);
  await q.check('不支持方向锁定时保留旋转提示且不冒泡', `assert(document.querySelector('[data-landscape-status]').textContent.includes('无法自动'),'missing fallback');assert(engine.suspended,'fallback resumed');document.documentElement.requestFullscreen=originalFullscreen;return true;`);
  await q.run('engine.setBackground(true);');await resize(844,390);
  await q.check('转横屏不能越过后台暂停原因', `assert(document.querySelector('#landscape-gate').hidden,'gate remains');assert(engine.suspended&&!engine.orientationBlocked,'background reason lost');engine.setBackground(false);assert(!engine.suspended,'foreground not resumed');assert(!ui.root.inert,'UI remains inert');return true;`);
  await q.run(`await openGame('tailor');qaPump=true;engine.renderer.setAnimationLoop(()=>engine.frame());window.beforeRotateElapsed=g.elapsed;`);
  await q.sleep(150);await resize(390,844);
  await q.check('音游旋转时同步暂停音乐与谱面', `window.music=(await import('/js/core/audio.js')).audio;assert(engine.suspended&&g.paused,'tailor not paused');assert(music.musicPaused,'music playing');window.frozenElapsed=g.elapsed;return true;`);
  await q.sleep(350);await q.check('竖向停留不增加音游时间',`eq(g.elapsed,frozenElapsed,'tailor advanced');return true;`);
  await resize(844,390);
  await q.check('返回横屏恢复此前运行的音游',`assert(!engine.suspended&&!g.paused,'tailor not resumed');return true;`);
  await q.run('g.pause();window.resumeTask=g.resumeCountdown();');await resize(390,844);await q.sleep(2200);
  await q.check('恢复倒数期间旋转，倒数不能绕过暂停播放音乐',`assert(engine.suspended&&g.paused&&music.musicPaused,'countdown bypassed gate');return true;`);
  await resize(844,390);await q.wait('!g.paused');
  await q.check('横屏后未结束的恢复倒数继续完成',`assert(!engine.suspended&&g.playing,'countdown not continued');return true;`);
  await q.run('g.pause();');await resize(390,844);await resize(844,390);
  await q.check('此前手动暂停的音游不会被旋转自动恢复',`assert(!engine.suspended&&g.paused,'manual pause overwritten');g.resume();closeGame();return true;`);
  await resize(844,390);
  await q.check('手机竖拿时键盘压缩可视区域也不能绕过横屏要求',`
    window.NikkiNative={setOrientation:()=>true};Object.defineProperty(screen.orientation,'type',{configurable:true,value:'portrait-primary'});
    window.dispatchEvent(new Event('resize'));assert(engine.suspended,'keyboard-sized viewport bypassed portrait');
    delete window.NikkiNative;delete screen.orientation.type;window.dispatchEvent(new Event('resize'));assert(!engine.suspended,'landscape not restored');return true;
  `);
  await resize(390,844);await q.load(slot,false);
  await q.check('竖向启动和重载均有提示，直到窗口横向才继续',`assert(engine.suspended&&!document.querySelector('#landscape-gate').hidden,'portrait startup leaked');return true;`);
  await resize(844,390);await q.shot('landscape-restored');
});
