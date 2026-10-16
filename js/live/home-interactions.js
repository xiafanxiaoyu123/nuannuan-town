// 自宅家具的生活互动。按装修系统当前记录查找，不保留已收回家具的互动点。
import { S, bus, save, addCoins, stat } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { h, fmt } from '../core/util.js';
import { DECO, CLOTH, CROP, FRUIT } from '../data.js';
import { outfitToLook } from '../models/character.js';
import { applyDecorVariant } from '../models/props.js';
import { cropIco, coinIco } from '../core/icons.js';
import { canSleep, sleepUntilMorning } from '../ui/calendar.js';
import { openPiano } from './piano.js';
import { YARD_LEVEL_HEIGHT, yardLevel, yardSurfaceAt, yardFootprint } from '../world/yard-building.js';
import { PHOTO_THEMES, photoThemeIndex } from '../shared/save-compat.js';

const RADIUS = 0.36;
const SEATS = {
  chair: { top: 0.56, z: 0.06 },
  sofa: { top: 0.6, z: 0.1, xs: [-0.68, 0, 0.68] },
  n_bean: { top: 0.59, z: 0.23 },
  ottoman: { top: 0.53, z: 0.06 },
  hammock: { top: 0.68, z: 0.06 },
  bench: { top: 0.56, z: 0.08, xs: [-0.45, 0.45] },
  swing: { top: 0.65, z: 0.05 },
};
const LAMPS = new Set(['floorlamp', 'n_lamp', 'lamp', 'post']);
const READERS = new Set(['bookshelf', 'desk']);
const SUPPORTED = new Set([
  ...Object.keys(SEATS), ...LAMPS, ...READERS,
  'bed', 'vanity', 'wardrobe', 'sideboard', 'piano', 'catbed', 'dining', 'coffee',
  'tv', 'fireplace', 'windowseat', 'teacart', 'musicbox',
  'kitchen_stove', 'fridge', 'kitchen_island', 'flower_vase', 'photo_frame',
  'fountain', 'goldfountain', 'wishing', 'momohut', 'birdbath', 'easel', 'gramophone', 'beehive', 'scarecrow',
]);
const RECIPES = [
  { id: 'strawberry_tart', name: '草莓鲜果挞', desc: '香脆塔皮铺满刚摘的甜草莓，酸甜可口', cost: [['strawberry', 2], ['wheat', 1]], coins: 95 },
  { id: 'pumpkin_soup', name: '奶油南瓜浓汤', desc: '金黄浓郁的热汤，喝完整个人都暖洋洋的', cost: [['pumpkin', 1], ['carrot', 1]], coins: 85 },
  { id: 'blueberry_muffin', name: '蓝莓蜜糖松饼', desc: '爆浆冰晶蓝莓配清甜果肉，下午茶绝配', cost: [['blueberry', 2], ['apple', 1]], coins: 105 },
  { id: 'lemon_tea', name: '香水柠檬花果茶', desc: '清香柠檬片与蜜桃慢煮，满屋都是果香', cost: [['lemon', 1], ['peach', 1]], coins: 110 },
  { id: 'moon_cake', name: '月见星光糕', desc: '用夜里盛开的月见花与甜樱桃细细蒸制', cost: [['moonflower', 1], ['cherry', 1]], coins: 155 },
];
const VASE_FLOWERS = [
  { id: 'rose', name: '星光玫瑰' },
  { id: 'sunflower', name: '向日葵' },
  { id: 'tulip', name: '郁金香' },
  { id: 'lavender', name: '薰衣草' },
  { id: 'moonflower', name: '月见花' },
  { id: 'strawberry', name: '甜心红果枝' },
];
const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const BOOKS = [
  { title: '一扇窗的四季', pages: [
    '春天，窗前的颜色一天天变浅。暖暖把杯子放在书旁，听大喵讲树梢上第一片新叶。窗帘动了一下，像是风也想加入这场闲聊。',
    '夏天的影子长得很快，午后的屋里却很安静。秋天，她把一片落叶夹在这页。叶子不用说话，也能替一个散步的下午做书签。',
    '冬天，屋顶和树枝戴上白帽子。暖暖点亮小灯，重新读起春天那一页。窗外是雪，书里还留着一阵暖风。',
  ] },
  { title: '给小屋留一点空白', pages: [
    '把椅子转向能看见窗的位置，再给脚下留一条通道。大喵绕着椅子走了一圈，郑重宣布：适合端着点心路过。',
    '书和小灯可以靠近，门前却不需要摆满。每天回家都能顺利推开门，本身就是一件舒服的小事。',
    '今天的家具摆到这里就好。留一个位置给明天的新想法，也留一点时间，坐下来看看已经拥有的东西。',
  ] },
  { title: '大喵的点心笔记', pages: [
    '第一条：闻到香味时，先确认是不是自己的那一份。第二条：如果不是，也可以礼貌地问一下。大喵在“礼貌”下面画了两条线。',
    '第三条：散步回来再吃点心，会觉得格外好吃。暖暖看见这一条旁边还有小字：散步之前也可以。',
    '最后一页没有写完，只画了两只杯子。暖暖添上了一行字：再好吃的点心，也要和喜欢的人慢慢分享。',
  ] },
];

export function installHomeInteractions(game, ui) {
  const town = game.town;
  if (town.homeInteractions) return town.homeInteractions;
  const records = new Map(), owners = new WeakMap(), off = [];
  const disposedLampMaterials = new WeakSet();
  const decors = () => [town.decors.house, town.decors.home, town.decors.build].filter(Boolean);
  const currentDecor = () => ['house', 'home', 'build'].includes(town.zone) ? town.decors[town.zone] : null;
  const owner = rec => owners.get(rec) || decors().find(d => d.entries.includes(rec));
  const floorHeight = rec => owner(rec)?.cfg.freeBuild ? yardLevel(rec.e)*YARD_LEVEL_HEIGHT : 0;
  const context = rec => { const decor=rec ? owner(rec) : currentDecor() || town.decors.house; return {decor, y:rec ? floorHeight(rec) : decor?.cfg.freeBuild ? town.pos.y : 0}; };
  let serial = 0, seated = null, bedState = null, sleeping = false, closed = false;
  let syncedDecors = [], actionVersion = 0;
  let pointCache = new WeakMap();
  let collisionStamp = [];
  const baseAllInter = town.allInter, baseUpdatePlayer = town.updatePlayer, baseOnExit = town.onExit;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const present = rec => !!owner(rec)?.entries.includes(rec) && rec.obj.parent === town.scene;
  const sameFloor = rec => owner(rec) === currentDecor() && Math.abs(town.pos.y-floorHeight(rec)) < .08;
  const available = () => !closed && app.view === town && town.active && !!currentDecor() && town.camMode === 'play' && !town.photoOn && !town.modal && !game.busy && !currentDecor().active;
  const local = (rec, x, z) => {
    const a = rec.obj.rotation.y, c = Math.cos(a), s = Math.sin(a);
    return { x: rec.obj.position.x + c * x + s * z, z: rec.obj.position.z - s * x + c * z };
  };
  const ignored = (rect, rec) => !!rec?.rect?.includes(rect);
  function obstacles(x0, x1, z0, z1, radius, ignore, ctx) {
    const surfaces=ctx?.decor.cfg.freeBuild ? ctx.decor.structures.filter(e=>{
      if(!['yard_slab','yard_foundation','yard_stairs','yard_roof_flat'].includes(e.id))return false;
      const f=yardFootprint(e,DECO),lot=ctx.decor.lot;
      return f.x1+lot.x0>=x0-radius&&f.x0+lot.x0<=x1+radius&&f.z1+lot.z0>=z0-radius&&f.z0+lot.z0<=z1+radius;
    }) : null;
    return {
      rects: town.rects.filter(r => !ignored(r, ignore) && r.x1 >= x0-radius && r.x0 <= x1+radius && r.z1 >= z0-radius && r.z0 <= z1+radius),
      circles: town.circles.filter(c => c.x+c.r >= x0-radius && c.x-c.r <= x1+radius && c.z+c.r >= z0-radius && c.z-c.r <= z1+radius),
      surfaces,
    };
  }
  function blocked(x, z, radius = RADIUS, ignore = null, nearby = null, ctx = context(ignore)) {
    const lot = ctx.decor.lot;
    if (x < lot.x0 + radius || x > lot.x0 + lot.cols - radius || z < lot.z0 + radius || z > lot.z0 + lot.rows - radius) return true;
    // A reachable upstairs point needs an actual floor under the whole player.
    // Do not use only X/Z distance: it would allow sitting through a ceiling or
    // crossing a missing floor tile to a chair on a disconnected platform.
    if(ctx.decor.cfg.freeBuild)for(const [dx,dz] of [[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]]){
      const y=yardSurfaceAt(nearby?.surfaces||ctx.decor.structures,DECO,x+dx-lot.x0,z+dz-lot.z0,ctx.y);
      if(Math.abs(y-ctx.y)>.08)return true;
    }
    // 隔断已登记在 town.rects。线段只筛选一次附近障碍，不再为每个0.1米采样扫描全镇。
    for (const rect of (nearby?.rects || town.rects)) {
      if (ignored(rect, ignore)) continue;
      if(ctx.decor.cfg.freeBuild && rect.y0!==undefined && (ctx.y+1.65<=rect.y0+.03 || ctx.y>=rect.y1-(rect.walkable?.25:.03)))continue;
      const dx = Math.max(rect.x0 - x, 0, x - rect.x1), dz = Math.max(rect.z0 - z, 0, z - rect.z1);
      if (dx * dx + dz * dz < radius * radius - 1e-8) return true;
    }
    return (nearby?.circles || town.circles).some(c => (c.x-x)**2 + (c.z-z)**2 < (c.r+radius)**2);
  }
  function clearSegment(a, b, radius = RADIUS, ignore = null, ctx = context(ignore)) {
    const nearby = obstacles(Math.min(a.x,b.x),Math.max(a.x,b.x),Math.min(a.z,b.z),Math.max(a.z,b.z),radius,ignore,ctx);
    const n = Math.max(1, Math.ceil(distance(a, b) / 0.1));
    for (let i = 0; i <= n; i++) if (blocked(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, radius, ignore, nearby,ctx)) return false;
    return true;
  }
  function points(rec) {
    const stamp=[town.rects,town.rects.length,town.circles,town.circles.length,town.decors.house?.connectionRevision,town.decors.build?.connectionRevision];
    if(stamp.some((value,i)=>value!==collisionStamp[i])){pointCache=new WeakMap();collisionStamp=stamp;}
    if (pointCache.has(rec)) return pointCache.get(rec);
    const id = rec.e.id, [rawW, rawD] = DECO[id].size;
    const fit=rec.obj.userData.furnitureFit,sx=fit?.scaleX??1,sz=fit?.scaleZ??1;
    const w=rawW*sx,d=rawD*sz,front=d/2+.48;
    let pts;
    if (SEATS[id]) pts = (SEATS[id].xs || [0]).map(x => ({ ...local(rec, x*sx, front), seat: local(rec, x*sx, SEATS[id].z*sz) }));
    else if (LAMPS.has(id) || id === 'bed') pts = [[0, front], [w / 2 + 0.48, 0], [-w / 2 - 0.48, 0], ...(id === 'bed' ? [] : [[0, -front]])].map(([x, z]) => local(rec, x, z));
    else pts = [0, -w * 0.27, w * 0.27].map(x => local(rec, x, front));
    const ctx=context(rec);
    const result = pts.filter(p => !blocked(p.x,p.z,RADIUS,null,null,ctx) &&
      ((!ctx.decor.cfg.freeBuild&&!p.seat) || clearSegment(p,p.seat||rec.obj.position,p.seat ? .32 : .16,rec,ctx)));
    pointCache.set(rec, result); return result;
  }
  function approach(rec) {
    if (!present(rec) || !sameFloor(rec)) return null;
    return points(rec).filter(p => distance(town.pos, p) < 1.45 && clearSegment(town.pos, p,RADIUS,null,context(rec))).sort((a, b) => distance(a, town.pos) - distance(b, town.pos))[0] || null;
  }
  function releaseLamp(record) {
    if (!record.lamp) return;
    for (const { mesh, original } of record.lamp.meshes) mesh.material = original;
    for (const material of record.lamp.clones.values()) if(!disposedLampMaterials.has(material))material.dispose();
    record.lamp = null;
  }
  function lampMaterials(record) {
    if (record.lamp) return record.lamp;
    const meshes = [], clones = new Map();
    record.rec.obj.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material, all = Array.isArray(original) ? original : [original];
      const clone = material => {
        if (!material.emissive || material.emissive.getHex() === 0) return material;
        if (!clones.has(material)) {
          const copy=material.clone();copy.addEventListener('dispose',()=>disposedLampMaterials.add(copy));clones.set(material,copy);
        }
        return clones.get(material);
      };
      const next = all.map(clone);
      if (next.some((m, i) => m !== all[i])) { meshes.push({ mesh, original }); mesh.material = Array.isArray(original) ? next : next[0]; }
    });
    return (record.lamp = { meshes, clones });
  }
  function updateLamp(record) {
    if (!LAMPS.has(record.rec.e.id) || (!record.lamp && record.rec.e.lightOn !== false)) return;
    const on = record.rec.e.lightOn !== false;
    for (const [original, material] of lampMaterials(record).clones) {
      material.emissiveIntensity = on ? original.emissiveIntensity : 0;
      material.color.copy(original.color); if (!on) material.color.multiplyScalar(0.5);
    }
  }
  function exitPoint(state) {
    const ctx=context(state.rec),before=state.beforePos || state.point;
    if(!ctx.decor.cfg.freeBuild)return before;
    // Rebuilds replace object identities while keeping the furniture in place.
    // Its new collision box must not trap a character who was lying inside it.
    const replacement=ctx.decor.entries.find(rec=>rec.e.id===state.rec.e.id&&rec.e.gx===state.gx&&rec.e.gz===state.gz&&rec.e.rot===state.rot&&floorHeight(rec)===state.height);
    const body=replacement||state.rec;
    const candidates=[before];
    if(present(state.rec))candidates.push(...points(state.rec));
    for(const p of candidates)if(p&&!blocked(p.x,p.z,RADIUS,null,null,ctx)&&clearSegment(town.pos,p,.32,body,ctx))return p;
    // An edit normally releases the pose before changing the layout. This
    // fallback covers a rebuilt layout without dropping a player downstairs.
    for(const radius of [.5,1,1.5,2])for(let i=0;i<16;i++){
      const p={x:before.x+Math.cos(i*Math.PI/8)*radius,z:before.z+Math.sin(i*Math.PI/8)*radius};
      if(!blocked(p.x,p.z,RADIUS,null,null,ctx)&&clearSegment(town.pos,p,.32,body,ctx))return p;
    }
    return null;
  }
  function stand(restore = true) {
    actionVersion++;
    const wasBed = bedState;
    const wasSeated = seated;
    if (!wasBed && !wasSeated) return false;
    if (wasBed) {
      // 上床时把角色临时移到了床中央；下床必须回到进入前的可达格，
      // 否则角色会留在床碰撞体里面，下一次互动也会被判定为卡住。
      if(restore && wasBed.zone===town.zone){const p=exitPoint(wasBed);if(p)town.pos.set(p.x,wasBed.height,p.z);}
      town.refreshOutfit();
      bedState = null;
      town.player.setPose('idle');
      town.player.targetMove = town.player.move = 0;
      town.player.root.position.copy(town.pos);
      town.cur = null; town.curLabel = null;
      bus.emit('bedMode', null);
      bus.emit('prompt', null);
    }
    seated = null;
    if(wasSeated && restore && wasSeated.zone===town.zone && owner(wasSeated.rec)?.cfg.freeBuild){const point=exitPoint(wasSeated);if(point)town.pos.set(point.x,wasSeated.height,point.z);}
    const p = town.player;
    p.setPose('idle'); p.targetMove = p.move = 0;
    p.body.position.y = 0; p.body.rotation.x = 0;
    p.legL.rotation.x = p.legR.rotation.x = 0;
    p.armL.rotation.x = p.armR.rotation.x = 0;
    p.root.position.copy(town.pos);
    town.cur = null; town.curLabel = null; bus.emit('prompt', null);
    return true;
  }
  function sync() {
    pointCache = new WeakMap();syncedDecors=decors().flatMap(d=>[d.entries,d.entries.length]);
    const current = new Set(decors().flatMap(d=>d.entries));
    for (const [rec, record] of records) if (!current.has(rec)) { if (seated?.rec === rec || bedState?.rec===rec) stand(); releaseLamp(record); records.delete(rec); }
    for(const decor of decors())for (const rec of decor.entries) {
      owners.set(rec,decor);
      if(!SUPPORTED.has(rec.e.id) || records.has(rec))continue;
      const record = { rec, id: 'homeFurniture_' + ++serial, lamp: null };
      record.it = { id: record.id, r: 1.48, prio: 0.05, sub: DECO[rec.e.id].name, act: () => {
        const result = activate(rec);
        // 走近时不拦住移动；首次真正坐下或开灯后再讲解家具互动。
        if (result && (SEATS[rec.e.id] || LAMPS.has(rec.e.id))) ui.tutorial('furniture', false, { valid: () => !!currentDecor() && !town.decor.active && !town.photoOn && present(rec) && sameFloor(rec) });
        return result;
      } };
      records.set(rec, record); updateLamp(record);
    }
  }
  function ensureSynced() { const stamp=decors().flatMap(d=>[d.entries,d.entries.length]);if(stamp.some((value,i)=>value!==syncedDecors[i]))sync(); }
  function reading(rec) {
    let book = 0, page = 0, modal;
    const body = h('div', { class: 'home-reading', style: { maxHeight: 'calc(100dvh - 8rem)', overflowY: 'auto' } });
    const render = () => body.replaceChildren(h('h2', {}, rec.e.id === 'desk' ? '在书桌读一会儿' : '从书架取一本书'),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '.4rem' } }, BOOKS.map((b, index) => h('button', { class: 'btn alt sm', 'data-home-book': index, 'aria-pressed': String(index === book), onclick: () => { book = index; page = 0; render(); } }, b.title))),
      h('h3', {}, BOOKS[book].title), h('p', { class: 'fine' }, '小镇原创短篇'),
      h('p', { 'data-home-page': '', style: { lineHeight: '1.9', minHeight: '8em' } }, BOOKS[book].pages[page]),
      h('div', { class: 'row', style: { justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' } },
        h('button', { class: 'btn alt sm', 'data-home-read-prev': '', disabled: page === 0, onclick: () => { page--; render(); } }, '上一页'),
        h('span', { 'aria-live': 'polite' }, `${page + 1} / ${BOOKS[book].pages.length}`),
        h('button', { class: 'btn sm', 'data-home-read-next': '', disabled: page === BOOKS[book].pages.length - 1, onclick: () => { page++; render(); } }, '下一页')),
      h('button', { class: 'btn alt', style: { marginTop: '1rem' }, 'data-home-read-close': '', onclick: () => modal.close() }, '把书放回去'));
    render(); town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.4);
    modal = ui.modal(body, { ribbon: '在家读一会儿', cls: 'live-modal' }); return modal;
  }
  async function rest(rec) {
    if (sleeping || !canSleep(game)) return false;
    const version=actionVersion,zone=town.zone,state=S;
    sleeping = true;
    try {
      const yes = await ui.confirm('在小床上休息到明早', '小镇日历会前进一天。作物、现实每日订单、签到和诺诺伊亲密互动不会因此加速或刷新。', '睡到明早');
      if (!yes || version!==actionVersion || state!==S || zone!==town.zone) return false;
      if (!available() || !present(rec) || (!bedState && !approach(rec)) || !canSleep(game)) { ui.toast('现在不能休息了，请回到床边再试'); return false; }
      // 睡前换成临时睡衣外观，不写入玩家存档；起床后恢复玩家原来的穿搭。
      const currentLook = outfitToLook(S.outfit);
      const beforeSleepPos = bedState?.beforePos?.clone() || town.pos.clone();
      const sleepDress = { ...CLOTH.d_reunion, name: '云朵睡衣', top: '#dce8ff', inner: '#f5f8ff', sleeve: '#c4d7f5', ruffle: '#f5f8ff', ruffleTrim: '#a9bfe8', skirt: '#aac3ed', skirtLen: 0.42, flare: 1.08, cuff: '#a9bfe8', belt: '#9ab4e2', under: '#f5f8ff' };
      const sleepShoes = { ...CLOTH.s_reunion, color: '#a9bfe8', sole: '#7e9bd1', sock: '#f5f8ff', sockBow: '#9ab4e2' };
      // 把角色放到床的中心，睡姿结束后恢复到床边的可达位置。
      town.pos.set(rec.obj.position.x, floorHeight(rec), rec.obj.position.z);
      town.player.setLook({ ...currentLook, dress: sleepDress, shoes: sleepShoes, acc: CLOTH.a_none, back: CLOTH.b_none });
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('sleep', 0.95);
      ui.toast('换上云朵睡衣，晚安……');
      await new Promise(resolve => setTimeout(resolve, 850));
      if(version!==actionVersion || state!==S || zone!==town.zone || !present(rec))return false;
      if (!sleepUntilMorning(game)) return false;
      town.pos.copy(beforeSleepPos); town.refreshOutfit(); town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.8); ui.toast('早上好，睡了个好觉！');
      bedState = null;
      bus.emit('bedMode', null);
      return true;
    } finally { sleeping = false; }
  }
  function enterBed(rec, point) {
    stand();
    const beforePos = town.pos.clone();
    town.moveTo = null; town.keys.clear(); town.stick.x = town.stick.y = 0;
    town.pos.set(rec.obj.position.x, floorHeight(rec), rec.obj.position.z);
    town.face(rec.obj.position.x, rec.obj.position.z);
    const currentLook = outfitToLook(S.outfit);
    const sleepDress = { ...CLOTH.d_reunion, name: '云朵睡衣', top: '#dce8ff', inner: '#f5f8ff', sleeve: '#c4d7f5', ruffle: '#f5f8ff', ruffleTrim: '#a9bfe8', skirt: '#aac3ed', skirtLen: 0.42, flare: 1.08, cuff: '#a9bfe8', belt: '#9ab4e2', under: '#f5f8ff' };
    const sleepShoes = { ...CLOTH.s_reunion, color: '#a9bfe8', sole: '#7e9bd1', sock: '#f5f8ff', sockBow: '#9ab4e2' };
    town.player.setLook({ ...currentLook, dress: sleepDress, shoes: sleepShoes, acc: CLOTH.a_none, back: CLOTH.b_none });
    town.player.setPose('sleep');
    bedState = { rec, beforePos, zone:town.zone, height:floorHeight(rec), rot: rec.e.rot, gx: rec.e.gx, gz: rec.e.gz };
    town.cur = null; town.curLabel = null; bus.emit('prompt', null);
    bus.emit('bedMode', { sleep: () => bedState?.rec === rec && rest(rec), down: () => bedState?.rec === rec && stand() });
    ui.toast('已上床，选择“睡到明早”或“下床”');
    return true;
  }
  function kitchenPanel(rec) {
    let modal;
    const body = h('div', { class: 'home-kitchen', style: { maxHeight: 'calc(100dvh - 8rem)', overflowY: 'auto', width: 'min(36rem, 90vw)' } });
    const itemName = (id) => CROP[id]?.name || FRUIT[id]?.name || id;
    const render = () => {
      body.replaceChildren(
        h('h2', {}, '田园私房料理台'),
        h('p', { class: 'fine', style: { marginBottom: '0.8rem' } }, '用后院收获的新鲜作物与果实烹制暖心茶点，比直接出售原料赚得更多噗灵！'),
        h('div', { class: 'dl-list' }, RECIPES.map((r) => {
          const canCook = r.cost.every(([id, need]) => (S.crops[id] || 0) >= need);
          return h('div', { class: 'dl-task' + (canCook ? ' ready' : '') },
            h('div', { class: 'tx' },
              h('b', {}, r.name),
              h('span', { class: 'dl-sub' }, r.desc),
              h('div', { style: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.76rem' } },
                ...r.cost.map(([id, need]) => {
                  const have = S.crops[id] || 0;
                  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: have >= need ? '#4b8c63' : '#b6687a', fontWeight: '700' } },
                    h('img', { src: cropIco(id), alt: '', style: { width: '1.35rem', height: '1.35rem' } }),
                    `${itemName(id)} ${have}/${need}`);
                }))),
            h('button', {
              class: 'btn sm ' + (canCook ? 'gold' : 'alt'),
              disabled: !canCook,
              onclick: (e) => {
                if (!r.cost.every(([id, need]) => (S.crops[id] || 0) >= need)) return;
                for (const [id, need] of r.cost) {
                  S.crops[id] -= need;
                  if (S.crops[id] <= 0) delete S.crops[id];
                }
                if (!S.live.kitchen) S.live.kitchen = {};
                S.live.kitchen[r.id] = (S.live.kitchen[r.id] || 0) + 1;
                addCoins(r.coins, 'kitchen');
                stat('sold', 1);
                save();
                audio.sfx('fanfare');
                const rect = e.currentTarget.getBoundingClientRect();
                ui.flyCoins(rect.left + rect.width / 2, rect.top, 6);
                ui.toast(`烹制成功：「${r.name}」香气四溢！ +${fmt(r.coins)} 噗灵`, { kind: 'live-reward', icon: coinIco() });
                render();
              },
            }, canCook ? `烹制 +${r.coins}` : `售 +${r.coins}`));
        })));
    };
    render();
    town.face(rec.obj.position.x, rec.obj.position.z);
    town.act('work', 0.6);
    modal = ui.modal(body, { ribbon: 'HOME KITCHEN', cls: 'live-modal' });
    return modal;
  }

  function activate(rec) {
    sync();
    if (!available() || !present(rec) || !SUPPORTED.has(rec.e.id)) return false;
    const p = approach(rec); if (!p) { ui.toast('这一侧走不过去，换到家具前面试试'); return false; }
    const id = rec.e.id;
    if (SEATS[id]) {
      stand(); town.moveTo = null; town.keys.clear(); town.stick.x = town.stick.y = 0;
      // 站位必须真实可达，坐下只改变角色绘制位置；起身不穿过椅背或旁边的家具。
      town.pos.set(p.x, floorHeight(rec), p.z); town.faceTarget = rec.obj.rotation.y;
      seated = { rec, point: p, zone:town.zone, height:floorHeight(rec), rot: rec.e.rot, gx: rec.e.gx, gz: rec.e.gz };
      applySeat(); audio.sfx('pop'); ui.toast('坐一会儿吧。点“起身”，或移动即可站起来'); return true;
    }
    if (LAMPS.has(id)) {
      rec.e.lightOn = rec.e.lightOn === false; updateLamp(records.get(rec)); save(); audio.sfx('tab');
      town.renderOptimizer?.invalidateDecor();
      ui.toast(`${DECO[id].name}已${rec.e.lightOn ? '打开' : '关闭'}`); return true;
    }
    if (id === 'bed') return bedState ? rest(rec) : enterBed(rec, p);
    if (id === 'kitchen_stove' || id === 'fridge' || id === 'kitchen_island') { kitchenPanel(rec); return true; }
    if (id === 'flower_vase') {
      const curIdx = VASE_FLOWERS.findIndex((f) => f.id === (rec.e.flower || 'rose'));
      const next = VASE_FLOWERS[(curIdx + 1) % VASE_FLOWERS.length];
      rec.e.flower = next.id;
      applyDecorVariant(rec.obj._furnitureShape ? rec.obj._furnitureShape.model : rec.obj, rec.e);
      town.renderOptimizer?.invalidateDecor();
      save();
      audio.sfx('sparkle');
      town.face(rec.obj.position.x, rec.obj.position.z);
      town.act('carry', 0.5);
      ui.toast(`玻璃插花瓶换上了「${next.name}」`);
      return true;
    }
    if (id === 'photo_frame' || id === 'easel') {
      const curIdx = photoThemeIndex(rec.e.photo);
      const next = PHOTO_THEMES[(curIdx + 1) % PHOTO_THEMES.length];
      rec.e.photo = next.id;
      applyDecorVariant(rec.obj._furnitureShape ? rec.obj._furnitureShape.model : rec.obj, rec.e);
      town.renderOptimizer?.invalidateDecor();
      save();
      audio.sfx('tab');
      town.face(rec.obj.position.x, rec.obj.position.z);
      town.act('cheer', 0.6);
      ui.toast(`画框切换为「${next.name}」风景`);
      return true;
    }
    if (id === 'fountain' || id === 'goldfountain' || id === 'wishing') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.8); audio.sfx('water');
      ui.toast('清澈的水花在阳光下闪闪发光，心情也跟着明朗起来'); return true;
    }
    if (id === 'momohut') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.8); audio.sfx('pop');
      ui.toast('大喵在小窝门口伸了个懒腰，满足地眯起眼睛'); return true;
    }
    if (id === 'birdbath') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.7); audio.sfx('water');
      ui.toast('给飞鸟浴盆添了些清水，小鸟们一定会喜欢'); return true;
    }
    if (id === 'gramophone') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('twirl', 0.9); audio.sfx('quest');
      ui.toast('留声机缓缓转动，流淌出午后慵懒的爵士旋律'); return true;
    }
    if (id === 'beehive') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.7);
      ui.toast('甜心蜂箱嗡嗡作响，正在为周围 5 米内的田块加速授粉 (+10% 生长与额外收成)'); return true;
    }
    if (id === 'scarecrow') {
      town.face(rec.obj.position.x, rec.obj.position.z); town.act('wave', 0.7);
      ui.toast('大喵稻草人精神抖擞地守护着菜地，周围田块更容易长出闪耀与巨大作物！'); return true;
    }
    if (id === 'catbed') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.8); ui.toast('大喵钻进小窝打了个滚，尾巴都翘起来了'); return true; }
    if (id === 'coffee') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.7); ui.toast('沏一杯热茶，坐下来慢慢享用'); return true; }
    if (id === 'dining') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.7); ui.toast('餐桌已摆好：今天也要好好吃饭'); return true; }
    if (id === 'tv') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.7); ui.toast('打开电视，播放今日小镇频道'); return true; }
    if (id === 'fireplace') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.8); ui.toast('壁炉里的火苗暖烘烘的'); return true; }
    if (id === 'windowseat') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('cheer', 0.9); ui.toast('靠在飘窗边看云，今天的风很轻'); return true; }
    if (id === 'teacart') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.8); ui.toast('茶车推到窗边，点心和热茶都准备好了'); return true; }
    if (id === 'musicbox') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('twirl', 1.0); ui.toast('八音盒奏起星光小曲'); return true; }
    if (id === 'piano') { stand();town.face(rec.obj.position.x,rec.obj.position.z);return !!openPiano(game,rec,()=>present(rec)); }
    if (id === 'vanity') { town.face(rec.obj.position.x, rec.obj.position.z); game.openWardrobe('closet'); return true; }
    if (id === 'wardrobe') { town.face(rec.obj.position.x, rec.obj.position.z); game.openWardrobe('closet'); ui.toast('衣柜打开了，挑一套今天的穿搭吧'); return true; }
    if (id === 'sideboard') { town.face(rec.obj.position.x, rec.obj.position.z); town.act('carry', 0.7); ui.toast('餐边柜里摆着茶点和餐具，随时可以开饭'); return true; }
    if (READERS.has(id)) { reading(rec); return true; }
    return false;
  }
  function applySeat() {
    if (!seated) return;
    const { rec, point } = seated, p = town.player;
    p.setPose('idle'); p.targetMove = p.move = 0;
    p.root.position.set(point.seat.x, rec.obj.position.y, point.seat.z); p.root.rotation.y = rec.obj.rotation.y;
    p.body.position.y = SEATS[rec.e.id].top - 0.36; p.body.rotation.x = -0.035;
    p.legL.rotation.x = p.legR.rotation.x = -Math.PI / 2;
    p.armL.rotation.x = p.armR.rotation.x = -0.5;
    p.armL.rotation.z = -0.08; p.armR.rotation.z = 0.08;
  }
  const standIt = { id: 'homeFurniture_stand', r: 2, prio: 10, label: '起身', sub: '也可以直接移动', act: stand };
  const bedDown = { id: 'homeFurniture_bed_down', r: 2, prio: 12, label: '下床', sub: '回到床边', act: stand };
  const bedSleep = { id: 'homeFurniture_bed_sleep', r: 2, prio: 11, label: '睡到明早', sub: '小镇日历前进一天', act: () => rest(bedState.rec) };
  const labelFor = (rec) => {
    const id = rec.e.id;
    if (SEATS[id]) return '坐一会儿';
    if (LAMPS.has(id)) return `${rec.e.lightOn === false ? '打开' : '关闭'}小灯`;
    if (id === 'bed') return '上床休息';
    if (id === 'vanity' || id === 'wardrobe') return '打开衣柜 · 换装';
    if (id === 'kitchen_stove' || id === 'fridge' || id === 'kitchen_island') return '烹制田园料理';
    if (id === 'flower_vase') return '更换瓶中鲜花';
    if (id === 'photo_frame' || id === 'easel') return '切换画框风景';
    if (id === 'fountain' || id === 'goldfountain' || id === 'wishing') return '欣赏水景 · 许愿';
    if (id === 'momohut') return '看看大喵的小窝';
    if (id === 'birdbath') return '添一点清水';
    if (id === 'gramophone') return '播放留声机';
    if (id === 'beehive') return '查看蜂箱授粉范围';
    if (id === 'scarecrow') return '查看稻草人守护';
    if (id === 'sideboard') return '打开餐边柜';
    if (id === 'piano') return '弹奏钢琴 · 自由演奏';
    if (id === 'catbed') return '陪大喵玩一会儿';
    if (id === 'coffee') return '泡杯热茶';
    if (id === 'dining') return '在餐桌用餐';
    if (id === 'tv') return '打开电视';
    if (id === 'fireplace') return '看看壁炉';
    if (id === 'windowseat') return '在飘窗边发会儿呆';
    if (id === 'teacart') return '泡一壶茶';
    if (id === 'musicbox') return '听星光八音盒';
    return '取一本书 · 阅读';
  };
  const wrappedAllInter = function () {
    const list = baseAllInter.call(this); ensureSynced();
    if (!available()) return list;
    if (seated) { standIt.x = this.pos.x; standIt.z = this.pos.z; return [standIt]; }
    if (bedState) { bedSleep.x = bedDown.x = this.pos.x; bedSleep.z = bedDown.z = this.pos.z; return [bedSleep, bedDown]; }
    for (const record of records.values()) {
      const rec = record.rec;
      if (distance(rec.obj.position, this.pos) > 5) continue;
      const point = approach(rec); if (!point) continue;
      Object.assign(record.it, { x: point.x, z: point.z, label: labelFor(rec) });
      list.push(record.it);
    }
    return list;
  };
  const wrappedUpdatePlayer = function (dt) {
    ensureSynced();
    if (seated && (!available() || !present(seated.rec) || !sameFloor(seated.rec) || seated.rec.e.rot !== seated.rot || seated.rec.e.gx !== seated.gx || seated.rec.e.gz !== seated.gz || [...this.keys].some(key => MOVEMENT.has(key)) || this.stick.x || this.stick.y || this.moveTo)) stand();
    const keepBed=available() || (sleeping && !closed && app.view===town && town.active && !!currentDecor() && town.camMode==='play' && !town.photoOn && !game.busy && !currentDecor().active);
    if (bedState && (!keepBed || !present(bedState.rec) || !sameFloor(bedState.rec) || bedState.rec.e.rot !== bedState.rot || bedState.rec.e.gx !== bedState.gx || bedState.rec.e.gz !== bedState.gz || [...this.keys].some(key => MOVEMENT.has(key)) || this.stick.x || this.stick.y || this.moveTo)) stand();
    baseUpdatePlayer.call(this, dt); applySeat();
    if (currentDecor()) for (const record of records.values())if(owner(record.rec)===currentDecor())updateLamp(record);
  };
  const wrappedOnExit = function (...args) { stand(); return baseOnExit.apply(this, args); };
  town.allInter = wrappedAllInter; town.updatePlayer = wrappedUpdatePlayer; town.onExit = wrappedOnExit;
  off.push(bus.on('decorMode', on => { if (on) stand(); }), bus.on('zoneChanged', ()=>stand(false)), bus.on('stateReplaced',()=>stand(false)), bus.on('decorChanged', sync), bus.on('partitionChanged', sync), bus.on('houseResized', sync));
  const api = { activate, stand, points, approach, blocked, clearSegment, sync, get seated() { return seated; }, get bedState() { return bedState; },
    dispose() {
      if (closed) return; stand(); closed = true;
      off.forEach(fn => fn()); records.forEach(releaseLamp); records.clear();
      if (town.allInter === wrappedAllInter) town.allInter = baseAllInter;
      if (town.updatePlayer === wrappedUpdatePlayer) town.updatePlayer = baseUpdatePlayer;
      if (town.onExit === wrappedOnExit) town.onExit = baseOnExit;
      delete town.homeInteractions;
    },
  };
  town.homeInteractions = api; sync(); return api;
}
