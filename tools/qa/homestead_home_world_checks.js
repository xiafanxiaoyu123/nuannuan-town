// Actual Chromium world, layout integration and synthetic migration; no player data.
const { suite } = require('./live_harness.js');
suite('homestead-home-world', async q => {
  const slot = await q.profile({width:1280,height:800,preview:false});
  await q.check('home pasture boots with seven animals and 24 recipes, no separate island', `
    window.hs=await import('/js/shared/homestead.js');window.layout=await import('/js/world/town/layout.js');
    assert(__game.homesteadWorld,'world');eq(hs.ANIMALS.length,7,'animals');eq(hs.RECIPES.length,24,'recipes');
    assert(!__game.town.rooms.ranch,'no ranch room');assert(!__game.town.scene.getObjectByName('ranch-island'),'no fixed ranch geometry');
    assert(!__game.town.allInter().some(v=>v.id==='ranch_gateway'),'no transport gate');return true;
  `);
  await q.check('legacy standalone ranch migration returns goods, buildings and paid expansion once', `
    const old=JSON.parse(JSON.stringify(st.S));const r=hs.performHomestead(old,{type:'tutorial'});assert(r.ok,r.message);
    const h=old.homestead;h.version=1;h.ranchLevel=3;old.decor={};old.coins=5000;
    for(const a of h.animals){delete a.housingKey;delete a.pausedMs;}
    h.dishes={'egg_custard:normal:plain':1};h.placed=[{id:'dish_9',key:'egg_custard:normal:plain',zone:'ranch',surface:'ranch_picnic',anchor:'a0',rotation:0}];
    h.tea={id:'tea_10',keys:['egg_custard:normal:plain'],guests:['momo'],startedAt:Date.now(),readyAt:Date.now()+30000};h.serial=11;
    assert(!hs.validateHomesteadState(old).length,'valid v1 fixture');window.beforePlots=JSON.stringify(old.placed);
    const migrated=st.normalizeSaveData(old);eq(migrated.homestead.version,2,'v2');eq(migrated.coins,6700,'1700 refund');eq(migrated.decor.ranch_coop,1,'coop inventory');eq(migrated.homestead.dishes['egg_custard:normal:plain'],3,'stock+display+tea');
    eq(migrated.homestead.placed,[],'old display returned');assert(!migrated.homestead.tea,'tea canceled');eq(JSON.stringify(migrated.placed),beforePlots,'old plots unchanged');
    const again=st.normalizeSaveData(migrated);eq(again.coins,6700,'no repeat refund');eq(again.decor.ranch_coop,1,'no repeat furniture');eq(again.homestead.dishes,migrated.homestead.dishes,'no repeat food');
    st.replaceSaveData(migrated);assert(st.flushSave(),'persist migration');return {coins:st.S.coins,version:st.S.homestead.version};
  `);
  await q.load(slot,false);
  await q.check('migrated local save reload keeps animal waiting without generating production', `
    window.hs=await import('/js/shared/homestead.js');window.layout=await import('/js/world/town/layout.js');
    eq(st.S.coins,6700,'refund persisted');eq(st.S.decor.ranch_coop,1,'inventory persisted');eq(st.S.homestead.animals.length,1,'chicken retained');
    eq(__game.homesteadWorld.animals.size,0,'no invisible automatic coop');eq(st.S.homestead.animals[0].cycleAt,0,'unhoused pauses');return true;
  `);
  await q.check('seven species are assigned only to compatible player-placed homes', `
    st.S.coins=50000;st.S.yardLv=5;__game.town.rebuildYard(false);
    window.homeDecor=__game.town.decors.home;
    for(const e of [{id:'ranch_coop',gx:40,gz:6,rot:0},{id:'ranch_barn',gx:48,gz:6,rot:1},{id:'ranch_hutch',gx:57,gz:6,rot:0},{id:'ranch_picnic',gx:46,gz:16,rot:0},{id:'ranch_cookstation',gx:52,gz:16,rot:1},{id:'ranch_fence',gx:39,gz:4,rot:0},{id:'ranch_trough',gx:55,gz:10,rot:1},{id:'ranch_hay',gx:59,gz:11,rot:0}]){
      assert(homeDecor.canPlace(e.id,e.gx,e.gz,e.rot),'fixture legal '+e.id);st.S.placed.push(e);homeDecor.addObj(e,false);
    }
    delete st.S.decor.ranch_coop;st.S.homestead.history.egg_custard=3;st.S.homestead.history.strawberry_tart=1;st.S.homestead.teaCount=1;
    for(const kind of ['duck','cow','sheep','goat','rabbit','alpaca']){const r=hs.performHomestead(st.S,{type:'adopt',kind});assert(r.ok,r.message);}
    st.S.homestead.pantry.feed=80;assert(hs.performHomestead(st.S,{type:'feed'}).ok,'feed');
    for(const a of st.S.homestead.animals)a.grazing=true;
    st.bus.emit('decorChanged');await __game.homesteadWorld.visitRanch();__game.town.pos.set(-470,0,0);__game.town.camSnap=true;st.save();
    const h=hs.getAnimalHousing(st.S);eq(h.totalHoused,7,'all housed');eq(h.capacity,12,'three homes');
    for(const a of st.S.homestead.animals)assert(h.homes.find(v=>v.key===h.assignments[a.id]).kinds.includes(a.kind),'compatible');return h.homes.map(v=>({id:v.id,animals:v.animalIds.length}));
  `);
  await q.sleep(1100);
  await q.check('models and interactions are in existing home, not removed ranch area', `
    eq(__game.town.zone,'home','same home zone');eq(__game.homesteadWorld.animals.size,7,'rendered species');
    for(const r of __game.homesteadWorld.animals.values()){assert(r.model.position.x>-490&&r.model.position.x<-450,'home position');assert(r.model.visible,'visible');let meshes=0;r.model.traverse(v=>{if(v.isMesh)meshes++;});assert(meshes>0,'real geometry');}
    eq(__game.town.allInter().filter(v=>v.id.startsWith('animal_')).length,7,'care targets');assert(__game.town.allInter().some(v=>typeof v.label==='string'&&v.label.includes('田园料理台')),'movable cooking interaction');return true;
  `);
  await q.shot('home-seven-animals');
  await q.check('housing movement relocates models, collection and re-placement preserve animals', `
    window.movedAnimal=st.S.homestead.animals.find(a=>a.kind==='rabbit').id;window.oldAnimalX=__game.homesteadWorld.animals.get(movedAnimal).model.position.x;
    window.hutch=st.S.placed.find(e=>e.id==='ranch_hutch');hutch.gx=65;homeDecor.reload();st.bus.emit('decorChanged');return true;
  `);await q.sleep(1100);
  await q.check('moved rabbit follows the actual new furniture position', `
    assert(__game.homesteadWorld.animals.get(movedAnimal).model.position.x>oldAnimalX+4,'rabbit relocation');
    window.savedHutch={...hutch};st.S.placed=st.S.placed.filter(e=>e!==hutch);st.S.decor.ranch_hutch=1;homeDecor.reload();st.bus.emit('decorChanged');return true;
  `);await q.sleep(1100);
  await q.check('collected housing pauses only its animals and removes their scene models', `
    const a=st.S.homestead.animals.find(a=>a.id===movedAnimal);assert(!a.housingKey&&!a.cycleAt&&a.pausedMs>0,'paused with remaining time');assert(!__game.homesteadWorld.animals.has(a.id),'no ghost animal');eq(st.S.homestead.animals.length,7,'animal retained');
    window.remaining=a.pausedMs;window.ready=a.ready+a.readyPrime;window.now+=24*3600000;hs.advanceHomestead(st.S,Date.now());eq(a.ready+a.readyPrime,ready,'no homeless offline production');
    st.S.placed.push(savedHutch);delete st.S.decor.ranch_hutch;homeDecor.reload();st.bus.emit('decorChanged');return true;
  `);await q.sleep(1100);
  await q.check('re-placing housing resumes the remaining cycle without consuming another feed', `
    const a=st.S.homestead.animals.find(a=>a.id===movedAnimal);assert(a.housingKey&&a.cycleAt>Date.now(),'resumed');eq(a.cycleAt-Date.now(),remaining,'remaining preserved');eq(a.pausedMs,0,'not doubled');eq(__game.homesteadWorld.animals.size,7,'all rebuilt');return true;
  `);
  await q.check('four distinct new recipes occupy the actual player-built picnic table', `
    const surface=__game.homesteadWorld.getSurfaces().find(s=>s.id.includes('ranch_picnic'));assert(surface&&surface.zone==='home','real home table');window.picnicSurface=surface.id;
    for(const [i,id]of ['duck_egg_toast','goat_moon_milk','lemon_cheesecake','garden_quiche'].entries()){
      const key=hs.dishKey(id,'fine');st.S.homestead.dishes[key]=1;const r=hs.performHomestead(st.S,{type:'place',key,zone:'home',surface:surface.id,anchor:'a'+i});assert(r.ok,r.message);
    }
    st.bus.emit('homesteadChanged');__game.town.pos.set(-471,0,4.3);__game.town.camSnap=true;return true;
  `);await q.sleep(300);
  await q.check('new dish models are on the table surface and not overlapping', `
    const models=[...__game.homesteadWorld.dishes.values()];eq(models.length,4,'four models');
    for(const m of models){assert(Math.abs(m.position.y-.902)<.025,'table height including furniture base');assert(m.position.x>-480,'home coordinates');}
    for(let i=0;i<models.length;i++)for(let j=i+1;j<models.length;j++)assert(models[i].position.distanceTo(models[j].position)>.5,'distinct anchors');return models.map(m=>({id:m.userData.dishId,p:m.position.toArray()}));
  `);await q.shot('home-new-dishes');
  await q.check('tea uses selected real table and no duplicate Momo', `
    const key=hs.dishKey('berry_trifle');st.S.homestead.dishes[key]=1;window.teaFood=key;
    const r=hs.performHomestead(st.S,{type:'teaStart',surface:picnicSurface,keys:[key],guests:['momo']});assert(r.ok,r.message);st.bus.emit('homesteadChanged');return true;
  `);await q.sleep(300);await q.shot('home-player-table-tea');
  await q.check('moving the tea table cancels meal and returns both displayed and reserved dishes once', `
    const e=st.S.placed.find(e=>e.id==='ranch_picnic');e.rot=1;homeDecor.reload();st.bus.emit('decorChanged');return true;
  `);await q.sleep(1100);
  await q.check('table settlement has no dangling table, guest or duplicate goods', `
    assert(!st.S.homestead.tea,'tea canceled');eq(st.S.homestead.dishes[teaFood],1,'tea food returned');eq(st.S.homestead.placed.length,0,'display returned');eq(__game.homesteadWorld.dishes.size,0,'no ghost plates');assert(!__game.town.scene.children.some(o=>o.name==='tea-dish-0'),'no guest food');
    window.stockSnapshot=JSON.stringify(st.S.homestead.dishes);st.bus.emit('decorChanged');st.flushSave();return true;
  `);await q.sleep(300);await q.check('repeated scene rebuild does not refund twice',`eq(JSON.stringify(st.S.homestead.dishes),stockSnapshot,'once');return true;`);
  await q.load(slot,false);
  await q.check('final reload preserves expanded home, seven animals, all furniture and meal stock', `
    window.hs=await import('/js/shared/homestead.js');eq(st.S.yardLv,5,'fifth level');eq(st.S.homestead.animals.length,7,'animals');eq(hs.getAnimalHousing(st.S).totalHoused,7,'housing');eq(st.S.homestead.dishes['berry_trifle:normal:plain'],1,'returned food');assert(!hs.validateHomesteadState(st.S).length,'save valid');return {level:st.S.yardLv,animals:st.S.homestead.animals.length};
  `);
});
