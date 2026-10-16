// Real Electron UI regression. Requires the root-owned isolated game server on
// localhost:5173. live_harness owns a fresh profile/slot and blocks external HTTP.
// Fixtures initialize old saves/nearby player positions; rewards, furniture and
// fertilizer actions, export and import are driven through visible UI clicks.
const fs = require('node:fs');
const path = require('node:path');
const { suite } = require('./live_harness.js');

suite('backend_save_ui', async q => {
  const openTransfer = async () => {
    await q.run('closePanels();');
    await q.click('[aria-label="更多"]');
    await q.click('.more-grid [aria-label="设置"]');
    await q.click('[data-settings-open="transfer"]');
    await q.wait('document.querySelector(".save-transfer")');
  };
  const bind = async () => q.run(`
    window.t=__game.town;window.f=t.farm;window.sf=await import('/js/core/save-format.js');
    window.townInput=await import('/js/world/town/input.js');
    window.compat=await import('/js/shared/save-compat.js');
    window.focusFrame=()=>{
      closePanels();t.setZone('house');t.homeInteractions.sync();
      const r=t.decors.house.entries.find(r=>r.e.id==='photo_frame');assert(r,'画框真实场景存在');
      const p=t.homeInteractions.points(r)[0];assert(p,'画框有可达互动点');
      t.pos.set(p.x,0,p.z);t.moveTo=null;t.lock=0;t.frozen=false;townInput.updatePrompts(t);
      assert(ui.promptBtn.textContent.includes('切换画框'),'真实互动提示可切画框');return r;
    };
    window.focusFarm=()=>{
      closePanels();t.setZone('home');const r=f.recs().find(r=>r.e.id==='plot');assert(r,'真实田地存在');
      f.refresh(r,true);t.pos.set(r.obj.position.x+.7,0,r.obj.position.z+.7);t.moveTo=null;t.lock=0;t.frozen=false;townInput.updatePrompts(t);
      assert(ui.promptBtn.textContent.includes('撒有机花肥'),'真实互动提示可施肥');return r;
    };
    window.important=()=>({coins:st.S.coins,seeds:st.S.seeds,decor:st.S.decor,photo:st.S.placedIn.find(e=>e.id==='photo_frame'),
      fertilizer:st.S.stats.fertilizer,welcome:st.S.live.welcome,farm:st.S.farm});
  `);
  const importFile = async (file, slot) => {
    await openTransfer();
    let chooser;
    const chosen = new Promise(resolve=>chooser=resolve);
    const listener = (event, method, params) => { if(method==='Page.fileChooserOpened') chooser(params); };
    q.window.webContents.debugger.on('message',listener);
    try {
      await q.window.webContents.debugger.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});
      await q.click('[data-save-action="choose"]');
      const selected = await chosen;
      await q.window.webContents.debugger.sendCommand('DOM.setFileInputFiles',{files:[file],backendNodeId:selected.backendNodeId});
    } finally { q.window.webContents.debugger.removeListener('message',listener); }
    await q.wait('!document.querySelector("[data-save-action=import]").disabled || document.querySelector(".save-transfer-status").getAttribute("role")==="alert"');
    await q.check(path.basename(file)+' 可预览且确认前保持原档',`
      assert(!document.querySelector('[data-save-action="import"]').disabled,'合法旧档/导出档应可导入：'+document.querySelector('.save-transfer-status').textContent);
      return {coins:st.S.coins,status:document.querySelector('.save-transfer-status').textContent};
    `);
    const loaded = new Promise(resolve=>q.window.webContents.once('did-finish-load',resolve));
    await q.click('[data-save-action="import"]'); await loaded;
    await q.wait('window.__game&&window.__live');
    // Reuse the same isolated slot after the actual UI-triggered reload. This
    // also proves another normal startup does not merge old inventory twice.
    await q.load(slot,false); await bind();
  };
  const exportViaUI = async (filename) => {
    await openTransfer();
    const exported = new Promise((resolve,reject)=>{
      q.window.webContents.session.once('will-download',(event,item)=>{
        item.setSavePath(filename);
        item.once('done',(event,state)=>state==='completed'?resolve(item.getFilename()):reject(new Error('导出下载失败：'+state)));
      });
    });
    await q.click('[data-save-action="export"]');
    const originalName = await exported;
    if(!fs.existsSync(filename)||!originalName.endsWith('.txt')) throw new Error('真实导出未保存TXT');
    const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(parsed.data.seeds.fertilizer!==undefined) throw new Error('导出含历史非法花肥种子');
    return parsed;
  };
  for(const [width,height,label] of [[390,844,'phone_portrait'],[866,412,'phone_landscape'],[1280,800,'desktop']]) {
    const slot=await q.profile({width,height,preview:false,tag:'_'+label}); await bind();
    const fixture=await q.run(`
      closePanels();st.S.coins=23456;st.S.settings.momoWater=false;
      st.S.placedIn=[];t.decors.house.reload();const d=t.decors.house;let place=null;
      for(let z=3;z<d.lot.rows-3&&!place;z++)for(let x=2;x<d.lot.cols-3&&!place;x++)if(d.canPlace('photo_frame',x,z,0))place={id:'photo_frame',gx:x,gz:z,rot:0,photo:'sakura'};
      assert(place,'合法画框占地');
      const raw=JSON.parse(JSON.stringify(st.serializeState()));raw.placedIn=[place];raw.decor.photo_frame=Math.max(1,raw.decor.photo_frame||0);
      raw.seeds.fertilizer=3;raw.stats.fertilizer=4;
      raw.placed=[{id:'plot',gx:3,gz:9,rot:0}];raw.farm={'3,9':{crop:'strawberry',t0:Date.now(),dur:600000,watered:true}};
      delete raw.live.welcome;
      return JSON.stringify(raw,null,2);
    `);
    const oldFile=path.join(q.report.out,label+'_old-save.json'); fs.writeFileSync(oldFile,fixture,'utf8');
    await importFile(oldFile,slot);
    await q.check(label+' 旧肥料双位置相加且字符串主题原样导入',`
      eq(st.S.coins,23456,'金币保留');eq(st.S.stats.fertilizer,7,'3+4袋合并');
      assert(!Object.hasOwn(st.S.seeds,'fertilizer'),'历史种子键已移除');
      eq(st.S.placedIn.find(e=>e.id==='photo_frame').photo,'sakura','旧字符串主题保留');
      assert(!live.welcome().claimed,'旧档尚未领取');sf.validateSaveData(st.serializeState());return important();
    `);
    const expected=await q.run(`const w=live.welcome();return {coins:st.S.coins+w.coins,seed:w.seedId,seeds:(st.S.seeds[w.seedId]||0)+1};`);
    await q.click('[aria-label="每日"]');
    await q.check(label+' 迎宾礼面板手机桌面均可操作',`return fitPanel('.daily');`);
    await q.click('.dl-welcome button');
    await q.check(label+' 实际领取迎宾礼后可严格序列化',`
      eq(st.S.coins,${expected.coins},'奖励金币');eq(st.S.seeds[${JSON.stringify(expected.seed)}],${expected.seeds},'奖励种子');
      eq(st.S.stats.fertilizer,8,'奖励肥料进入统一库存');assert(live.welcome().claimed,'已领标记');
      assert(!document.querySelector('.dl-welcome button'),'领取按钮消失');sf.validateSaveData(st.serializeState());return important();
    `);
    await q.shot(label+'_welcome_claimed');
    await q.click('.daily-modal .x');
    await q.run('focusFrame();engine.frame();'); await q.sleep(120);
    await q.click('.prompt button');
    await q.check(label+' 实际互动切换主题且模型颜色同步',`
      const e=st.S.placedIn.find(e=>e.id==='photo_frame');eq(e.photo,'starry','从樱花切到星夜');
      const rec=t.decors.house.entries.find(r=>r.e===e);let sky;
      rec.obj.traverse(n=>{if(n.name==='frame-sky')sky=n;});assert(sky,'模型真实画布存在');
      eq(sky.material.color.getHexString(),'3b4371','主题颜色同步到模型');sf.validateSaveData(st.serializeState());return {photo:e.photo,color:sky.material.color.getHexString()};
    `);
    await q.shot(label+'_frame_starry');
    await q.run('focusFarm();engine.frame();'); await q.sleep(120);
    await q.click('.prompt button');
    await q.check(label+' 实际施肥只消耗一袋并保留玩法加速',`
      eq(st.S.stats.fertilizer,7,'只扣一袋');assert(st.S.farm['3,9'].fertilized,'田地已施肥');
      assert(st.S.farm['3,9'].dur<600000&&st.S.farm['3,9'].dur>0,'成熟时间缩短');
      assert(!ui.promptBtn.textContent.includes('撒有机花肥'),'已施肥不再提示重复消耗');sf.validateSaveData(st.serializeState());return important();
    `);
    await q.shot(label+'_fertilized');
    const snapshot=await q.run('st.flushSave();return important();');
    const exported=path.join(q.report.out,label+'_exported-save.txt'); await exportViaUI(exported);
    await q.shot(label+'_transfer');
    // A different current value makes the UI import assertion prove replacement,
    // rather than merely reloading an unchanged in-memory fixture.
    await q.run('st.S.coins=111;st.S.stats.fertilizer=1;st.flushSave();');
    await importFile(exported,slot);
    await q.check(label+' 真实TXT导出导入与重载完整保留且不重复迁移/领取',`
      eq(important(),${JSON.stringify(snapshot)},'核心状态完整一致');eq(st.importRecoveryInfo().coins,111,'导入前恢复点');
      assert(live.welcome().claimed,'迎宾礼已领保持');sf.validateSaveData(st.serializeState());return important();
    `);
    await q.click('[aria-label="每日"]');
    await q.check(label+' 重载后的已领状态无按钮且再次入口不增发',`
      assert(document.querySelector('.dl-welcome').textContent.includes('今日已领'),'显示今日已领');
      assert(!document.querySelector('.dl-welcome button'),'无重复领取按钮');eq(st.S.coins,${snapshot.coins},'再次打开不加金币');
      eq(st.S.stats.fertilizer,7,'再次打开不加花肥');return true;
    `);
    await q.shot(label+'_reloaded_claimed');
  }
});
