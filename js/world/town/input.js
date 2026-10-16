// 键鼠/触摸输入、交互候选与提示；沿用 Town 的输入状态、事件名称和调用时序。
// town 参数是原 Town 实例；兼容入口和逐帧顺序见 ../town.js。
import { THREE } from '../../core/kit.js';
import { app } from '../../core/app.js';
import { fx } from '../../core/fx.js';
import { bus } from '../../core/state.js';
import { clamp } from '../../core/util.js';
import { controls } from '../../core/preferences.js';

const multiPromptState = new WeakMap();
const interactionIds = new WeakMap();
let nextInteractionId = 0;
const valueOf = (value) => typeof value === 'function' ? value() : value;
const targetOf = (it) => it.target || it;
const actionOf = (it) => it.action || `${valueOf(it.label) || ''}::${valueOf(it.sub) || ''}`;
const tokenOf = (value) => {
  if (!value || typeof value !== 'object' && typeof value !== 'function') return String(value);
  if (!interactionIds.has(value)) interactionIds.set(value, ++nextInteractionId);
  return interactionIds.get(value);
};
const blockedInteraction = (town) => noInput(town) || town.frozen || town.lock > 0 || town.decor.active || town.photoOn || town.homeInteractions?.bedState;
const captureInteraction = (it) => it && ({ target: targetOf(it), id: it.id, action: actionOf(it), targetState: it.targetState });
const sameInteraction = (it, selection) => targetOf(it) === selection.target && it.id === selection.id && actionOf(it) === selection.action && it.targetState === selection.targetState;

function invokeInteraction(town, expected, generation, expectedZone) {
  if (!expected || blockedInteraction(town)) return false;
  if (expectedZone !== undefined && town.zone !== expectedZone) return false;
  if (generation !== undefined && multiPromptState.get(town)?.generation !== generation) return false;
  // Re-resolve the displayed target at click time: a queued pointer/key event
  // must not harvest a removed plot, follow a reordered index or act at distance.
  const current = town.allInter().find((it) => it && it.r > 0 &&
    Math.hypot(it.x - town.pos.x, it.z - town.pos.z) < it.r && sameInteraction(it, expected));
  if (typeof current?.act !== 'function') return false;
  current.act();
  return true;
}

export function bindInput(town) {
  const MOVE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.target?.isContentEditable ||
      e.target?.closest?.('input, textarea, select, button, a[href], [role="button"], [contenteditable]:not([contenteditable="false"])')) return;
    if (!town.active || e.repeat) return;
    if (MOVE[e.code]) { town.keys.add(e.code); town.moveTo = null; e.preventDefault(); }
    if (town.noInput()) return;
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { interact(town); e.preventDefault(); }
    else if (e.code === 'KeyF') {
      const list = multiPromptState.get(town)?.list;
      if (list && list.length > 1) { interact(town, 1); e.preventDefault(); }
    }
    else if (/^Digit[34]$/.test(e.code)) {
      const index = Number(e.code.slice(5)) - 1;
      if (!town.decor.active && (multiPromptState.get(town)?.list.length || 0) > index) {
        interact(town, index); e.preventDefault(); return;
      }
    }
    if (town.decor.active) town.decor.onKey(e);
    else if (/^Digit[1-6]$/.test(e.code)) town.farm.pickSeed(Number(e.code.slice(5)) - 1);
  });
  window.addEventListener('keyup', (e) => town.keys.delete(e.code));
  window.addEventListener('blur', () => town.keys.clear());
  const cv = app.canvas;
  town.inputCanvas=cv;
  cv.addEventListener('contextmenu', e => { if (town.decor.active) e.preventDefault(); });
  // 指针：单指点击 = 走过去；开启视角模式后单指拖动 = 转动视角；双指捏合 = 缩放（装修模式下单指拖动仍是平移 / 摆放）
  const pts = new Map();
  let down = null, pinch = null;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const drop = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerdown', (e) => {
    if (town.noInput()) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      // 第二根手指落下：改为缩放，取消这次点击 / 拖动
      if (down && town.decor.active) town.decor.cancelPointer();
      down = null;
      pinch = { d: spread(), zoom: town.decor.active ? town.decor.zoom : town.zoom };
      return;
    }
    town.peekHold = false;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, cam: false };
    if (town.decor.active) town.decor.onDown(e);
  });
  cv.addEventListener('pointermove', (e) => {
    if (town.noInput()) return;
    const pt = pts.get(e.pointerId);
    if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
    if (pinch && pts.size >= 2) {
      const z = pinch.zoom * (pinch.d / spread());
      if (town.decor.active) town.decor.zoom = clamp(z, 20, 62);
      else town.zoom = clamp(z, 13, 38);
      return;
    }
    if (town.decor.active) return town.decor.onMove(e);
    if (down && down.id === e.pointerId) {
      // 只有开着视角模式时，拖动才算转镜头；平时手指的小幅滑动仍然当作点击
      if (town.camFree && !down.cam && !down.block && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.cam = true;
      if (down.cam && town.camFree && !town.peekHold) {
        // 视角模式：自由转动，水平不设限
        const sensitivity = controls().cameraSensitivity;
        town.camYaw -= (e.clientX - down.lx) * 0.0055 * sensitivity;
        town.camPitch = clamp(town.camPitch + (e.clientY - down.ly) * 0.0045 * sensitivity, -1.1, 0.78);
      }
      down.lx = e.clientX; down.ly = e.clientY;
    }
  });
  town.canvasCapture=id=>cv.setPointerCapture?.(id);
  cv.addEventListener('lostpointercapture', (e) => {
    drop(e);
    // 正常松手已先清空 down 并提交；只有意外丢失捕获才取消预览。
    if (down?.id === e.pointerId) { down = null; town.decor.cancelPointer(); }
  });
  window.addEventListener('pointercancel', (e) => { drop(e); if (down && down.id === e.pointerId) { down = null; town.decor.cancelPointer(); } });
  window.addEventListener('pointerup', (e) => { if (e.target !== cv) { drop(e); if (down && down.id === e.pointerId) { down = null; town.decor.cancelPointer(); } } });
  cv.addEventListener('pointerup', (e) => {
    const wasPinch = !!pinch;
    drop(e);
    if (wasPinch || town.noInput() || !down || down.id !== e.pointerId) { if (down && down.id === e.pointerId) down = null; if(town.decor.active)town.decor.cancelPointer();return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), cam = down.cam || down.block;
    down = null;
    if (town.decor.active) return town.decor.onUp(e, moved);
    // 手指点屏幕很难完全不动：触屏放宽到 26 像素以内都算点击（鼠标仍是 10）
    if (cam || moved > (e.pointerType === 'mouse' ? 10 : 26)) return;
    const p = town.walkPoint(e.clientX, e.clientY);
    if (!p) return;
    // 彩蛋入口：预留地东南角的小木桩，连续点 10 下
    if (town.zone === 'town' && Math.hypot(p.x - 42, p.z - 10.8) < 1.5) {
      const now = performance.now();
      town.secretN = now - (town.secretT || 0) < 1500 ? town.secretN + 1 : 1;
      town.secretT = now;
      if (town.secretN >= 5) fx.sparkle(town.scene, new THREE.Vector3(42, 1.2, 10.8), 3, ['#ffd24f', '#ffffff']);
      if (town.secretN >= 10) { town.secretN = 0; town.moveTo = null; bus.emit('cheat'); return; }
    }
    // 点到互动点附近：走过去并触发
    let hit = null;
    for (const it of town.allInter()) if (Math.hypot(it.x - p.x, it.z - p.z) < 1.6) hit = it;
    if (hit) { const expected = captureInteraction(hit), zone = town.zone; hit = { ...hit, act: () => invokeInteraction(town, expected, undefined, zone) }; }
    town.moveTo = { x: p.x, z: p.z, hit, stuck: 0 };
    town.ring.position.set(p.x, p.y + 0.09, p.z);
    town.ringT = 0;
  });
  cv.addEventListener('wheel', (e) => {
    if (town.noInput()) return;
    if (town.decor.active) town.decor.zoom = clamp(town.decor.zoom + Math.sign(e.deltaY) * 3, 20, 62);
    else town.zoom = clamp(town.zoom + Math.sign(e.deltaY) * 2, 13, 38);
  }, { passive: true });
}

export function noInput(town) {
  return !town.active || town.modal || town.camMode === 'title';
}

export function isActive(town) {
  return town.keys.size > 0 || !!(town.stick.x || town.stick.y) || !!town.moveTo || !!town.cine || town.camMode !== 'play' || town.photoOn || town.player.targetMove > 0.01;
}

export function setModal(town, on) {
  town.modal = on;
  town.frozen = on || town.camMode !== 'play';
  if (on) { town.keys.clear(); town.moveTo = null; }
}

export function allInter(town) {
  const list = town.inter.slice();
  // 走到居民身边可以搭话
  if (town.zone === 'town') for (const n of town.npcs) {
    const p = n.ch.root.position;
    if (Math.hypot(p.x - town.pos.x, p.z - town.pos.z) < 2.3) { n.it = n.it || { id: 'npc_' + n.def.id, r: 2.3, prio: -0.4, label: () => (n.rs === 'ready' ? `把东西交给${n.def.name}` : n.rs === 'offer' ? `${n.def.name}好像有事想拜托你` : `和${n.def.name}聊聊`), sub: n.def.job, act: () => (n.rs === 'ready' || n.rs === 'offer' ? bus.emit('openReq', n.def.id) : town.talk(n)) }; n.it.x = p.x; n.it.z = p.z; list.push(n.it); }
  }
  if (town.pos.y < 0.4 && town.farm) {
    if (typeof town.farm.interactables === 'function') {
      for (const f of town.farm.interactables(town.pos.x, town.pos.z)) list.push(f);
    } else {
      const f = town.farm.interactable(town.pos.x, town.pos.z);
      if (f) list.push(f);
    }
  }
  // 展示可以跨区域，因此收回入口也必须在小镇、室内和后院都可用。
  if (!town.decor.active && !town.photoOn && town.farm) {
    const carry = town.farm.carry;
    // The dedicated HUD button is always available. Keep the general
    // interaction prompt free for nearby residents, doors and crops.
    if (carry) list.push({ id: 'giantCarry', target: carry, x: town.pos.x, z: town.pos.z, r: 1.8, prio: -10, label: '收起巨大作物', sub: '保留摆件，停止展示', act: () => town.farm.stowCarry() });
    // 拿起改为家园面板内主动选择，避免在田边反复按互动键切换展示。
  }
  return list;
}

export function findInters(town, maxCount = 4) {
  maxCount = Math.max(0, Math.min(4, Number.isSafeInteger(maxCount) ? maxCount : 4));
  if (!maxCount) return [];
  const candidates = [];
  for (const it of town.allInter()) {
    if (!it || !(it.r > 0)) continue;
    const d = Math.hypot(it.x - town.pos.x, it.z - town.pos.z);
    if (d < it.r) candidates.push({ it, score: d - (it.prio || 0) });
  }
  candidates.sort((a, b) => a.score - b.score);
  const out = [];
  const seenIds = new Set();
  const seenLabels = new Set();
  for (const { it } of candidates) {
    const id = it.id || '';
    if (id && seenIds.has(id)) continue;
    const rawLabel = typeof it.label === 'function' ? it.label() : it.label;
    const rawSub = typeof it.sub === 'function' ? it.sub() : it.sub;
    const dedupKey = String(id).startsWith('homeFurniture_') ? `${rawLabel}::${rawSub || ''}` : String(rawLabel || id);
    if (out.length > 0 && seenLabels.has(dedupKey)) continue;
    if (id) seenIds.add(id);
    seenLabels.add(dedupKey);
    out.push(it);
    if (out.length >= maxCount) break;
  }
  return out;
}

export function findInter(town) {
  return findInters(town, 1)[0] || null;
}

export function interact(town, index = 0) {
  if (!Number.isSafeInteger(index) || index < 0 || index > 3) return false;
  const state = multiPromptState.get(town);
  return invokeInteraction(town, state?.selections[index] || (index === 0 ? captureInteraction(town.cur) : null), state?.generation, state?.zone);
}

export function updatePrompts(town) {
  // 互动提示：支持多交互物品同时出现时并列展示多个交互按钮
  // 入床后由 UI 的专用操作条提供“睡到明早 / 下床”两个并列按钮，
  // 不再让通用单按钮提示抢走焦点或只显示其中一个。
  const blocked = blockedInteraction(town);
  const list = blocked ? [] : findInters(town, 4);
  const it = list[0] || null;
  const label = it ? (typeof it.label === 'function' ? it.label() : it.label) : null;
  const promptItems = list.map((item) => {
    const itemLabel = typeof item.label === 'function' ? item.label() : item.label;
    const itemSub = typeof item.sub === 'function' ? item.sub() : item.sub;
    return {
      id: item.id,
      label: itemLabel,
      sub: itemSub,
      disabled: typeof item.act !== 'function',
    };
  });
  const promptZone = town.zone;
  const sig = promptZone + '|' + promptItems.map((p, i) => `${p.id || ''}:${tokenOf(targetOf(list[i]))}:${tokenOf(list[i].targetState)}:${actionOf(list[i])}:${p.label || ''}:${p.sub || ''}:${p.disabled ? 1 : 0}`).join('|');
  const prev = multiPromptState.get(town);
  const changed = sig !== (prev?.sig ?? '') || label !== town.curLabel;
  const generation = (prev?.generation || 0) + (changed ? 1 : 0);
  const selections = list.map(captureInteraction);
  multiPromptState.set(town, { list, selections, sig, generation, zone: promptZone });
  town.cur = it;
  town.curLabel = label;
  if (changed) {
    promptItems.forEach((p, index) => { p.act = () => invokeInteraction(town, selections[index], generation, promptZone); });
    bus.emit('prompt', it ? {
      label,
      disabled: typeof it.act !== 'function',
      sub: typeof it.sub === 'function' ? it.sub() : it.sub,
      ...(promptItems.length > 1 ? { items: promptItems } : {}),
    } : null);
  }
  const zone = !town.frozen ? town.farm.zoneAt(town.pos.x, town.pos.z) : null;
  if (zone !== town.farmZone) { town.farmZone = zone; bus.emit('zone', zone); }
}
