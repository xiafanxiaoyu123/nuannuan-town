// 玩家与居民初建、居民散步/委托标记/交流奖励；随机调用顺序与存档写入保持原样。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE, group, rboxGeo } from '../../core/kit.js';
import { Character, Momo, outfitToLook, randomNpcLook } from '../../models/character.js';
import { app } from '../../core/app.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/fx.js';
import { S, bus, save, stat, addCoins, FRIEND_AT } from '../../core/state.js';
import { CLOTH, SETS, STYLES } from '../../data.js';
import { RESIDENTS as NPCS, RESIDENT_LAYOUT } from '../../live/people.js';
import { reqOf } from '../../core/requests.js';
import { rand, pick, angleLerp } from '../../core/util.js';
import { outfitFx } from '../../live/effects.js';
import { festivalDialogue } from '../../live/festival-dialogue.js';
import { TOWN_HOUSE } from './layout.js';

export function buildActors(town) {
  town.player = new Character(outfitToLook(S.outfit));
  town.pos = new THREE.Vector3(TOWN_HOUSE.x, 0, TOWN_HOUSE.z + 4.4);
  town.zone = 'town';
  town.player.root.position.copy(town.pos);
  town.scene.add(town.player.root);
  town.momo = new Momo();
  town.momo.setCloak?.(S.momoCloak);
  town.momo.root.position.set(town.pos.x + 1.1, 0, town.pos.z + 0.3);
  town.scene.add(town.momo.root);
  // 点击移动的落点圈
  town.ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 28), new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0, depthWrite: false }));
  town.ring.rotation.x = -Math.PI / 2;
  town.ring.position.y = 0.09;
  town.scene.add(town.ring);
  // 路人
  const N = { W1: [-30, 4], W2: [-39, 4], L1: [-20, -5.8], L2: [-30, -5.8], L3: [-39, -5.8], X1: [30, 4], A: [-20, 4], B: [-10, 4], C: [-0.8, 4], P1: [6, -2.9], P2: [12.8, 4], P3: [6, 10.9], Nn: [6, -9.3], W: [-6.7, -9.3], M: [3.7, -9.3], E: [13.9, -9.3], EE: [19, -9.3], Q: [22, 4], Sp: [6, 17.5] };
  const E = [['A', 'B'], ['A', 'W1'], ['W1', 'W2'], ['A', 'L1'], ['L1', 'L2'], ['L2', 'L3'], ['L3', 'W2'], ['Q', 'X1'], ['B', 'C'], ['C', 'P1'], ['C', 'P3'], ['P1', 'P2'], ['P2', 'P3'], ['P1', 'Nn'], ['Nn', 'W'], ['Nn', 'M'], ['Nn', 'E'], ['E', 'EE'], ['P2', 'Q'], ['P3', 'Sp']];
  const adj = {};
  for (const [a, b] of E) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  town.nav = { N, adj };
  town.npcs = NPCS.map((def) => {
    const layout = RESIDENT_LAYOUT[def.id], node = layout.node;
    const ch = new Character(randomNpcLook(layout.look));
    ch.root.position.set(N[node][0] + rand(-0.5, 0.5), 0, N[node][1] + rand(-0.5, 0.5));
    town.scene.add(ch.root);
    // 头顶的委托标记：金色「!」= 有新委托，绿色 = 可以交付
    const mk = group(0, 2.75, 0);
    const mm = new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0xffc94d, emissiveIntensity: 0.7, roughness: 0.35 });
    mk.add(new THREE.Mesh(rboxGeo(0.16, 0.42, 0.16, 0.06), mm), new THREE.Mesh(rboxGeo(0.16, 0.16, 0.16, 0.06), mm));
    mk.children[0].position.y = 0.34;
    mk.visible = false;
    ch.root.add(mk);
    return { ch, mk, mm, def, node, prev: null, target: null, wait: rand(0, 3), speed: rand(1.5, 2.1), greet: 0, follow: 0, busy: 0, off: [rand(-0.6, 0.6), rand(-0.6, 0.6)] };
  });
}

export function talk(town, n) {
  const d = n.def, st = (S.npc[d.id] = S.npc[d.id] || { t: 0 });
  const p = n.ch.root.position, night = town.night > 0.6;
  const say = (text, o = {}) => bus.emit('bubble', { obj: n.ch.root, name: d.name, text, life: o.life || 4.2, tone: STYLES[d.like].color });
  const coins = (v) => { addCoins(v, 'npc'); const sp = app.project(p.clone().setY(2.5), town.camera); bus.emit('float', { sx: sp.x, sy: sp.y, text: '+' + v, cls: 'coin' }); };
  const worn = Object.values(S.outfit).map((id) => CLOTH[id]).filter((c) => c && c.set);
  const fullSet = worn.length >= 3 && worn[0].set !== 'reunion' && worn.every((c) => c.set === worn[0].set) ? worn[0].set : null; // 初始套装不算
  const likeN = Object.values(S.outfit).filter((id) => CLOTH[id] && CLOTH[id].style === d.like).length;
  const before = st.t;
  st.t += 1 + outfitFx(S.outfit, 'heart');
  n.busy = 4.2;
  town.face(p.x, p.z);
  audio.sfx('pop', Math.random() * 3);
  let pose = 'wave';
  if (before < 1 && st.t >= 1) say(d.hello, { life: 5.4 });
  else if (before < 3 && st.t >= 3) { say(d.gift); coins(60); fx.hearts(town.scene, p.clone().setY(2), 5); pose = 'cheer'; }
  else if (before < FRIEND_AT && st.t >= FRIEND_AT) {
    say(d.friend, { life: 5.4 });
    coins(300);
    fx.confetti(town.scene, p.clone().setY(2.6), 40);
    fx.hearts(town.scene, p.clone().setY(2), 8);
    audio.sfx('fanfare');
    pose = 'cheer';
    bus.emit('note', `和${d.name}成为了好朋友！`);
  } else if (fullSet && !(S.npc._sets || []).includes(fullSet)) {
    // 彩蛋：穿齐一整套
    (S.npc._sets = S.npc._sets || []).push(fullSet);
    say(`哇——是一整套「${SETS[fullSet].name}」！${SETS[fullSet].anchor.split(' · ')[0]}也太好看了吧！`, { life: 5.4 });
    coins(80);
    fx.sparkle(town.scene, town.pos.clone().setY(1.6), 16, ['#ffffff', '#ffd24f', '#ff9fbd']);
    pose = 'cheer';
    stat('egg_set');
  } else if (d.egg === 'night' && night && !st.secret) {
    // 彩蛋：七弦只在夜里讲的秘密
    st.secret = 1;
    say(d.night[0], { life: 6.5 });
    stat('egg_night');
  } else if (d.egg === 'fan' && st.t >= 2 && n.follow <= 0 && Math.random() < 0.5) {
    // 彩蛋：小粉丝会跟着你走一段
    say('可、可以跟着你走一会儿吗！我保证不捣乱！');
    n.follow = 14;
    fx.hearts(town.scene, p.clone().setY(2), 6);
    stat('egg_fan');
  } else if (likeN >= 3 && Date.now() - (st.liked || 0) > 240000) {
    // 彩蛋：穿了对方偏爱的风格
    st.liked = Date.now();
    say(`你今天这身「${STYLES[d.like].name}」风，完全长在我的审美上！这个送你～`);
    coins(30);
    fx.hearts(town.scene, p.clone().setY(2), 6);
    pose = 'cheer';
    stat('egg_like');
  } else {
    const pool = night ? d.night.concat(d.lines.slice(0, 2)) : d.lines;
    const holiday=festivalDialogue(d.id);
    let line = holiday || pick(pool);
    if (!holiday && line === st.last) line = pool[(pool.indexOf(line) + 1) % pool.length];
    st.last = line;
    say(line);
  }
  n.ch.setPose(pose);
  n.pose = pose;
  stat('npc_talk');
  save();
}

export function refreshReqMarks(town) {
  for (const n of town.npcs) {
    const s = (n.rs = reqOf(n.def.id).state);
    n.mk.visible = s === 'offer' || s === 'ready';
    n.mm.color.setHex(s === 'ready' ? 0x5fd08f : 0xffc94d);
    n.mm.emissive.setHex(s === 'ready' ? 0x5fd08f : 0xffc94d);
    const hm = town.homeMarks[n.def.id];
    hm.material.color.set(s === 'ready' ? '#5fd08f' : s === 'offer' ? '#ffc94d' : '#d9cfc9');
    hm.material.emissive.set(s === 'ready' ? '#5fd08f' : s === 'offer' ? '#ffc94d' : '#d9cfc9');
    hm.material.emissiveIntensity = s === 'offer' || s === 'ready' ? 0.9 : 0.15;
  }
}

export function updateNpcs(town, dt) {
  const { N, adj } = town.nav;
  const visible = town.zone === 'town' || town.camMode === 'title';
  if ((town.reqT = (town.reqT || 0) - dt) <= 0) { town.reqT = 1; town.refreshReqMarks(); }
  if (visible) for (const n of town.npcs) { n.mk.position.y = 2.75 + Math.sin(app.time * 4 + n.speed * 9) * 0.08; n.mk.rotation.y = app.time * 2 - n.ch.root.rotation.y; }
  for (const n of town.npcs) {
    const p = n.ch.root.position;
    const dp = Math.hypot(p.x - town.pos.x, p.z - town.pos.z);
    n.greet -= dt;
    n.busy -= dt;
    if (n.follow > 0 && town.zone === 'town') {
      // 小粉丝跟随中：追着暖暖跑，保持一步的距离
      n.follow -= dt;
      const dx = town.pos.x - p.x, dz = town.pos.z - p.z;
      if (dp > 1.7) { const sp = Math.min(6.2, 2 + dp * 1.6); p.x += (dx / dp) * sp * dt; p.z += (dz / dp) * sp * dt; n.ch.targetMove = 1; } else n.ch.targetMove = 0;
      n.ch.setPose(n.busy > 0 ? n.pose : 'idle');
      n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
      if ((n.heartT = (n.heartT || 0) - dt) <= 0) { n.heartT = 1.6; fx.hearts(town.scene, p.clone().setY(1.9), 2); }
      if (n.follow <= 0) {
        bus.emit('bubble', { obj: n.ch.root, name: n.def.name, text: '今天超开心！下次再一起走吧！', life: 3.6, tone: STYLES[n.def.like].color });
        // 回到离自己最近的路口继续散步
        let best = null, bd = 1e9;
        for (const [k, [nx, nz]] of Object.entries(N)) { const dd = Math.hypot(nx - p.x, nz - p.z); if (dd < bd) { bd = dd; best = k; } }
        n.node = best; n.prev = null; n.target = best; n.wait = 0; n.off = [0, 0];
      }
    } else if (dp < 2.1 && !town.frozen) {
      n.ch.targetMove = 0;
      n.ch.setPose(n.busy > 0 ? n.pose : 'wave');
      n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(town.pos.x - p.x, town.pos.z - p.z), 1 - Math.exp(-8 * dt));
      if (n.greet <= 0 && n.busy <= 0) { n.greet = 14; fx.hearts(town.scene, p.clone().setY(1.9), 3); audio.sfx('pop', Math.random() * 3); const met = S.npc[n.def.id]; bus.emit('bubble', { obj: n.ch.root, name: n.def.name, text: met ? pick(['又见面啦！', '嗨，暖暖！', '今天也很好看！', '大喵也来啦？']) : '你好呀～', life: 2.4, tone: STYLES[n.def.like].color }); }
    } else {
      n.ch.setPose('idle');
      if (n.wait > 0) { n.wait -= dt; n.ch.targetMove = 0; }
      else {
        if (!n.target) {
          const opts = adj[n.node].filter((x) => x !== n.prev);
          n.target = pick(opts.length ? opts : adj[n.node]);
        }
        const [tx, tz] = N[n.target];
        const dx = tx + n.off[0] - p.x, dz = tz + n.off[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { n.prev = n.node; n.node = n.target; n.target = null; n.wait = Math.random() < 0.45 ? rand(1.5, 5) : 0; }
        else {
          p.x += (dx / d) * n.speed * dt;
          p.z += (dz / d) * n.speed * dt;
          n.ch.root.rotation.y = angleLerp(n.ch.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
          n.ch.targetMove = 0.55;
        }
      }
    }
    if (visible) n.ch.update(dt);
  }
}
