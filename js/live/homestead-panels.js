// 牧场、厨房与成品的操作界面。经济和计时由共享规则处理，界面不另存一份库存。
import * as THREE from 'three';
import { S, bus, save } from '../core/state.js';
import { applyHomesteadAction } from '../core/homestead-actions.js';
import { h, fmt } from '../core/util.js';
import { audio } from '../core/audio.js';
import { icon } from '../core/icon-renderer.js';
import { npcIco } from '../core/icons.js';
import { disposeSceneResources } from '../core/kit.js';
import { CROP, FRUIT, NPCS } from '../data.js';
import * as rules from '../shared/homestead.js';
import { getHomesteadNextStep } from '../shared/homestead-next-step.js';
import { getMealPrep } from '../shared/meal-prep.js';
import { createDish, animateDish, createAnimal } from '../models/homestead.js';
import { Momo } from '../models/character.js';
import { createAnimalActivity } from './homestead-animal-play.js';
import { mountCookingPlay } from './homestead-cooking-play.js';
import { mountTeaPlay } from './homestead-tea-play.js';
import { mountMealPrep } from './meal-prep-panel.js';
import { createCafeMemoryCard } from './cafe-specials-panel.js';
import { mountAnimalWalkHUD } from './animal-walk-hud.js';

const QUALITY = { normal: '家常', tasty: '可口', fine: '精致' };
const METHOD = { stir: '调温与轻搅', flip: '掌握出炉时机', assemble: '组装与点缀' };
const TAG_NAMES = { sweet: '甜点', fresh: '清新', warm: '暖心热食', milky: '奶香', drink: '茶饮' };
const FRIENDS = [{ id: 'momo', name: '大喵' }, ...NPCS];
const INTRO = ['领取小鸡和奶油鸡舍，进入家园装修自由摆放。', '做一碗蛋羹，把它端到真实餐桌。', '取回、品尝或招待，让食物走进生活。'];
const button = (text, fn, cls = '', attrs = {}) => h('button', { type: 'button', class: `hs-button ${cls}`, onclick: fn, ...attrs }, text);
const small = text => h('p', { class: 'hs-muted' }, text);
const title = (text, sub) => h('div', { class: 'hs-section-title' }, h('h3', {}, text), sub && small(sub));
const itemName = id => rules.PANTRY[id]?.name || CROP[id]?.name || FRUIT[id]?.name || id;
const timeLeft = ms => ms <= 0 ? '即将完成' : `${Math.ceil(ms / 60000)} 分钟`;
const safeDish = key => { const [recipe, quality = 'normal', variant = 'plain'] = key.split(':'); return { recipe, quality, variant }; };
const dishIcon = (id, quality = 'normal', variant = 'plain') => icon(`homestead:dish:${id}:${quality}:${variant}`, () => createDish(id, { quality, variant: variant === 'milky' ? 'milk' : 'base' }), { pitch: .58, yaw: .5, size: 192, zoom: .92 });
const animalIcon = (kind, look = 0) => icon(`homestead:animal:${kind}:${look}`, () => createAnimal(kind, { coat: look }), { pitch: .23, yaw: .55, size: 192 });
const portrait = id => h('img', { src: id === 'momo' ? icon('homestead:momo', () => new Momo().root, { pitch: .12, yaw: .2, size: 128 }) : npcIco(id), alt: '', loading: 'lazy' });

// 仅当前打开的面板拥有一个实时预览；列表缩略图复用项目已有的共享图标渲染器。
function makePreview(host, recipe, options = {}) {
  let renderer, scene, model, frame = 0, disposed = false, last = performance.now(), elapsed = 0, spinning = false;
  let resizeObserver, phase = options.cooking ? Math.floor((options.progress?.() || 0) * 4) / 4 : 1, dirty = true, lastPaint = -Infinity;
  const stats = { renders: 0, sleeping: false, disposed: false };
  let wake = () => {};
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.domElement.setAttribute('aria-label', `${rules.RECIPE[recipe]?.name || '料理'}的三维预览`);
    renderer.domElement.setAttribute('role', 'img');
    host.append(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfffcf7, 0xb59d8a, 2));
    const sun = new THREE.DirectionalLight(0xffefd8, 2.7); sun.position.set(-3, 5, 3); scene.add(sun);
    const build = currentPhase => createDish(recipe, { quality: options.quality || 'fine', variant: options.variant === 'milky' ? 'milk' : 'base', phase: currentPhase });
    model = build(phase);
    scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y * 1.4, .5) * .77;
    const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, .01, 100);
    camera.position.set(center.x + 2.8, center.y + 3.5, center.z + 5.5); camera.lookAt(center);
    wake = () => { if (disposed) return; dirty = true; last = performance.now(); stats.sleeping = false; if (!frame) frame = requestAnimationFrame(render); };
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), ratio = width / height;
      camera.left = -radius * Math.max(1, ratio); camera.right = -camera.left;
      camera.top = radius * Math.max(1, 1 / ratio); camera.bottom = -camera.top;
      camera.updateProjectionMatrix(); renderer.setSize(width, height, false); wake();
    };
    function render(now) {
      frame = 0; if (disposed) return;
      if (document.hidden || document.documentElement.classList.contains('landscape-required') || options.paused?.()) { last = now; stats.sleeping = true; return; }
      if (now - lastPaint < 1000 / 30) { frame = requestAnimationFrame(render); return; }
      const dt = Math.max(0, (now - last) / 1000); last = now;
      elapsed += dt;
      const progress = options.progress?.() ?? 1;
      const nextPhase = options.cooking ? Math.floor(Math.min(1, progress) * 4) / 4 : 1;
      if (nextPhase !== phase) { const rotation = model.rotation.y; scene.remove(model); disposeSceneResources(model); model = build(nextPhase); model.rotation.y = rotation; model.userData.animationStart = 0; scene.add(model); phase = nextPhase; dirty = true; }
      const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (spinning) model.rotation.y += dt * .45;
      if (!reduced) animateDish(model, elapsed);
      else if (model.userData.parts?.steam) model.userData.parts.steam.visible = false;
      // 最后一次把蒸汽等短演出落到静止态，随后不再提交WebGL绘制或空转RAF。
      const moving = spinning || (!!options.cooking && progress < 1) || (!reduced && elapsed < 30);
      if (dirty || moving || !stats.sleeping) { renderer.render(scene, camera); stats.renders++; lastPaint = now; dirty = false; }
      stats.sleeping = !moving;
      if (moving) frame = requestAnimationFrame(render);
    }
    document.addEventListener('visibilitychange', wake); window.addEventListener('resize', wake);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
    return { stats, wake, rotate: () => { spinning = !spinning; wake(); }, dispose: () => {
      if (disposed) return; disposed = true; stats.disposed = true; stats.sleeping = true; cancelAnimationFrame(frame); resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', wake); window.removeEventListener('resize', wake);
      disposeSceneResources(scene); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    } };
  } catch (error) {
    document.removeEventListener('visibilitychange', wake); window.removeEventListener('resize', wake); cancelAnimationFrame(frame);
    if (scene) disposeSceneResources(scene); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
    host.replaceChildren(h('img', { src: dishIcon(recipe), alt: rules.RECIPE[recipe]?.name || '料理', class: 'hs-preview-fallback' }));
    // 无WebGL预览时仍保留制作计时及可操作路径，不创建额外的空转计时器。
    return { stats, wake() {}, rotate() {}, dispose() { stats.disposed = true; resizeObserver?.disconnect(); host.replaceChildren(); } };
  }
}

export function installHomesteadUI(game, ui) {
  let panel = null, body = null, view = 'kitchen', preview = null, viewCleanup = null, kitchenContext = {}, ranchContext = {}, tableContext = {};
  let selectedRecipe = 'egg_custard', query = '', filter = 'all', count = 1, variant = 'plain', prime = false;
  let serial = 0, destroyed = false, stateGeneration = 0;
  const sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondaryPanels = new Set();
  let activeAnimalActivity = null;
  const walkHUD = mountAnimalWalkHUD(game, ui);
  const state = () => rules.ensureHomestead(S, Date.now());
  const notify = (message, warn = false) => message && ui.toast(message, { kind: warn ? 'warn' : 'quest', life: 2600 });
  const available = (id) => rules.availableIngredient(S, id);
  const orders = () => rules.getHomesteadOrders(S, Date.now());
  const goBuild = (furnitureId, zone) => { panel?.close(true); if (typeof furnitureId === 'string') game.homesteadWorld?.buildFurniture?.(furnitureId, zone); else game.homesteadWorld?.buildRanch?.(); };
  const goFarm = (options = {}) => {
    const target = options.cropId && game.homesteadWorld?.getIngredientTarget?.(options.cropId);
    if (target && ['missing', 'occupied'].includes(target.status)) { goBuild(target.fruit ? 'bigplot' : 'plot', 'home'); return; }
    panel?.close(true); (game.homesteadWorld?.visitFarm || game.homesteadWorld?.visitRanch)?.(options);
  };
  const farmLabel = target => target && ['missing', 'occupied'].includes(target.status) ? `去准备${target.fruit ? '果树田' : '田地'}` : target?.label;
  const goView = next => { view = next; render(); };
  const inviteWalk = (id, animalModal) => {
    const source = S;
    if (destroyed || !state().animals.some(animal => animal.id === id)) return;
    animalModal?.close(true); panel?.close(true);
    if (S === source) game.homesteadWorld?.startAnimalWalk?.(id);
  };
  const walkButton = (id, disabled, animalModal) => {
    const source = S;
    const control = button('一起散步', () => { if (S === source && control.isConnected) inviteWalk(id, animalModal); }, 'subtle', { disabled, 'data-animal-walk-start': id });
    return control;
  };
  // 路况只刷新当前文字和按钮，不重新绘制输入框，也不把临时导航状态写入存档。
  const animalRouteUI = (id, animalModal) => {
    const source = S, control = walkButton(id, true, animalModal);
    const notice = h('p', { class: 'hs-notice', 'data-animal-route': id });
    const update = () => {
      if (destroyed || S !== source) return;
      const home = rules.getAnimalHousing(S).assignments[id];
      const space = game.homesteadWorld?.getAnimalSpaceStatus?.(id);
      control.disabled = !home || (typeof space?.canWalk === 'boolean' ? !space.canWalk : space?.status === 'blocked');
      const show = space?.status === 'blocked' || ['searching', 'returning'].includes(space?.routeState);
      const message = show ? `${space.message || ''}${space.status === 'blocked' && space.canWalk ? ' 也可以邀请它一起散步。' : ''}` : '';
      if (notice.textContent !== message) notice.textContent = message;
      notice.style.display = show ? '' : 'none';
    };
    update();
    return { control, notice, update };
  };
  const saveChanged = (result, persist = false) => {
    if (persist) save(); bus.emit('homesteadChanged', result); bus.emit('coins', S.coins, result?.coins || 0);
    ui.refreshReap?.();
  };
  function act(action, { silent = false, redraw = true } = {}) {
    const result = applyHomesteadAction({ requestId: `hs-ui-${sessionId}-${++serial}`, ...action }, Date.now());
    if (result.ok) { saveChanged({ ...result, ...action, action: action.type }); if (!silent) { audio.sfx('pop'); notify(result.message); } if (redraw && panel) render(); }
    else if (!silent) notify(result.message || '这一步暂时无法完成', true);
    return result;
  }
  function resetView(persist = true) { viewCleanup?.(persist); viewCleanup = null; preview?.dispose(); preview = null; }
  function secondary(content, options = {}) {
    let current, alive = true; const source = S, generation = stateGeneration;
    const isCurrent = () => alive && source === S && generation === stateGeneration;
    content.addEventListener('click', event => { if (!isCurrent()) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    current = ui.modal(content, { ...options, cls: `hs-small-modal ${options.cls || ''}`, onClose: () => { alive = false; content.querySelectorAll('button').forEach(el => { el.disabled = true; }); secondaryPanels.delete(current); options.onClose?.(); } });
    current.isCurrent = isCurrent;
    current.veil.classList.add('homestead-veil'); secondaryPanels.add(current); return current;
  }
  function show(next = 'kitchen') {
    if (destroyed) return;
    view = next;
    if (!panel) {
      body = h('div', { class: 'hs-app', 'data-homestead': 'true' });
      panel = ui.modal(body, { cls: 'homestead-modal', skipTutorial: true, onClose: () => { resetView(); panel = body = null; } });
      panel.veil.classList.add('homestead-veil');
    }
    render();
  }
  function nav(next, label) { return button(label, () => { view = next; render(); }, view === next ? 'selected' : '', { 'aria-pressed': view === next }); }
  function render() {
    if (!body || destroyed) return;
    resetView(); rules.advanceHomestead(S, Date.now());
    const hs = state();
    body.replaceChildren(h('header', { class: 'hs-header' }, h('div', {}, h('span', { class: 'hs-eyebrow' }, '暖暖的生活手账'), h('h2', {}, view === 'ranch' ? '我的家园牧场' : view === 'pantry' ? '我的小冰箱' : view === 'book' ? '料理手账' : view === 'tea' ? '一桌好时光' : view === 'table' ? '我的餐桌' : view === 'prep' ? '我的备餐清单' : '暖暖小厨房')), h('span', { class: 'hs-purse' }, `${fmt(S.coins || 0)} 噗灵`)),
      h('nav', { class: 'hs-nav', 'aria-label': '牧场与厨房' }, nav('kitchen', '烹饪'), nav('ranch', '牧场'), nav('pantry', `冰箱 · ${Object.values(hs.dishes).reduce((a, b) => a + b, 0)}`), nav('book', '手账'), nav('tea', '招待'), hs.prep && nav('prep', '备餐')));
    if (!hs.tutorial) { renderWelcome(); return; }
    if (view === 'kitchen' && hs.cooking) { renderCooking(); return; }
    if (view === 'ranch') renderRanch();
    else if (view === 'pantry') renderPantry();
    else if (view === 'book') renderBook();
    else if (view === 'tea') renderTea();
    else if (view === 'table') renderTable();
    else if (view === 'prep') renderPrep();
    else renderKitchen();
  }
  function renderWelcome() {
    body.append(h('div', { class: 'hs-welcome hs-scroll' }, h('div', { class: 'hs-welcome-art' }, h('img', { src: animalIcon('chicken'), alt: '奶油小鸡' }), h('img', { src: dishIcon('egg_custard'), alt: '田园蒸蛋羹' })), h('section', {}, h('span', { class: 'hs-eyebrow' }, '从一枚鸡蛋开始'), h('h3', {}, '把日子过成暖呼呼的味道'), small('照料动物，亲手做菜，再把喜欢的料理摆进自己的家。'), h('ol', {}, INTRO.map(text => h('li', {}, text))), button('领取小鸡与奶油鸡舍', () => act({ type: 'tutorial' }), 'primary'), small('奶油鸡舍放在装修库存中，摆到家园地面后小鸡入住。没有住处或缺料会暂停生产，动物仍会保留。'))));
  }
  const usable = id => available(id) + (rules.PANTRY[`${id}_prime`] ? available(`${id}_prime`) : 0);
  const recipeNeeds = (recipe, kind = 'plain') => {
    const needs = new Map(); for (const [id, n] of rules.recipeCost(recipe.id, kind)) needs.set(id, (needs.get(id) || 0) + n);
    return [...needs];
  };
  const recipeMissing = (recipe, kind = 'plain', number = 1) => recipeNeeds(recipe, kind).filter(([id, amount]) => usable(id) < amount * number);
  const canMake = (recipe, kind = 'plain') => Math.min(5, ...recipeNeeds(recipe, kind).map(([id, n]) => Math.floor(usable(id) / n)));
  function ingredientSource(id) {
    if (id === 'cheese' || id === 'yogurt') return { label: '去加工鲜奶', action: () => goView('pantry') };
    if (rules.PANTRY[id]) return { label: '去牧场收取', action: () => { ranchContext = {}; goView('ranch'); } };
    const target = game.homesteadWorld?.getIngredientTarget?.(id);
    return { label: farmLabel(target) || (FRUIT[id] ? '去家园果园' : '去家园农田'), action: () => goFarm({ fruit: !!FRUIT[id], cropId: id }) };
  }
  function renderKitchen() {
    const hs = state(), todayOrders = orders();
    const search = h('input', { class: 'hs-search', type: 'search', placeholder: '寻找一道想做的菜', value: query, 'aria-label': '搜索菜谱' });
    const list = h('div', { class: 'hs-recipe-list hs-scroll' });
    const side = h('aside', { class: 'hs-recipe-sidebar' }, search,
      h('div', { class: 'hs-filters' }, [['all', '全部'], ['ready', '能做'], ['one', '差一种'], ['favorite', '收藏'], ['order', '请求']].map(([id, name]) => button(name, () => { filter = id; renderKitchenList(); }, filter === id ? 'selected' : '', { 'data-filter': id }))), list);
    const detail = h('section', { class: 'hs-recipe-detail' });
    const layout = h('div', { class: 'hs-kitchen' }, side, detail); body.append(layout);
    function renderKitchenList() {
      side.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('selected', el.dataset.filter === filter));
      list.replaceChildren();
      const recipes = rules.RECIPES.filter(r => (!query || `${r.name} ${r.desc} ${(r.tags || []).join(' ')}`.includes(query)) &&
        (filter !== 'ready' || (rules.recipeUnlock(S, r.id).ok && !recipeMissing(r).length)) && (filter !== 'one' || recipeMissing(r).length === 1) &&
        (filter !== 'favorite' || hs.favorites.includes(r.id)) && (filter !== 'order' || todayOrders.some(o => r.id === o.recipe)));
      if (!recipes.length) {
        list.append(small('没有找到合适的菜谱。'));
        preview?.dispose(); preview = null;
        detail.replaceChildren(h('div', { class: 'hs-empty' }, h('h3', {}, '换一道心仪的料理吧'), small(query ? '试试其他名字，或清空搜索。' : '可以切回全部菜谱，看看还需要哪些食材。'), button('查看全部菜谱', () => { query = ''; filter = 'all'; render(); }, 'primary')));
        return;
      }
      if (!recipes.some(r => r.id === selectedRecipe)) { selectedRecipe = recipes[0].id; count = 1; variant = 'plain'; }
      recipes.forEach(recipe => {
        const missing = recipeMissing(recipe), unlocked = rules.recipeUnlock(S, recipe.id);
        const card = button('', () => { selectedRecipe = recipe.id; count = 1; variant = 'plain'; renderKitchenList(); }, `hs-recipe-card ${selectedRecipe === recipe.id ? 'selected' : ''}`, { 'aria-pressed': selectedRecipe === recipe.id, 'data-recipe': recipe.id });
        card.append(h('img', { src: dishIcon(recipe.id), alt: '', loading: 'lazy' }), h('span', {}, h('strong', {}, recipe.name), h('small', { class: !unlocked.ok || missing.length ? '' : 'hs-good' }, !unlocked.ok ? '等待解锁' : missing.length ? `还差 ${missing.length} 种食材` : '食材已备齐')));
        list.append(card);
      });
      renderDetail();
    }
    search.addEventListener('input', () => { query = search.value.trim(); renderKitchenList(); });
    function renderDetail() {
      preview?.dispose(); preview = null;
      const recipe = rules.RECIPE[selectedRecipe] || rules.RECIPES[0], unlocked = rules.recipeUnlock(S, recipe.id);
      const times = hs.history[recipe.id] || 0, learned = times > 0 || (hs.book[recipe.id]?.count || 0) > 0;
      const max = canMake(recipe, variant); count = Math.min(count, Math.max(1, max));
      const missing = recipeMissing(recipe, variant, count), reason = !unlocked.ok ? unlocked.reason : !max ? `还缺${recipeMissing(recipe, variant).map(([id]) => itemName(id)).join('、')}` : '';
      const isFavorite = hs.favorites.includes(recipe.id);
      const material = rules.getCookingPreview(S, recipe.id, variant, prime, learned ? count : 1);
      const materialNotice = material.ok && h('div', { class: 'hs-notice', 'data-cook-material-preview': '', 'aria-live': 'polite' },
        h('strong', {}, `${learned && count > 1 ? `快捷 ${count} 份备料` : '本次备料'} · 原料品质 +${material.materialBonus}`),
        small(material.inputs.map(({id, count: n}) => `${itemName(id)} ×${n}`).join('、')),
        learned && small(`快捷预计：${QUALITY[material.quality]} · 沿用最好技法 ${material.mastery.technique}/40`),
        small(learned && count > 1 ? '亲手制作每次做 1 份，按当次操作决定品质。' : '对准火候与时机，普通食材也能做出精致料理。优选食材可补助品质。'));
      const stage = h('div', { class: 'hs-stage', 'data-dish-preview': recipe.id });
      const info = h('div', { class: 'hs-recipe-info hs-scroll' },
        h('div', { class: 'hs-detail-heading' }, h('h3', {}, recipe.name), button(isFavorite ? '已收藏' : '收藏', () => act({ type: 'favorite', recipe: recipe.id, value: !isFavorite }), `hs-favorite ${isFavorite ? 'selected' : ''}`)),
        small(recipe.desc), h('span', { class: 'hs-badge' }, METHOD[recipe.method]),
        button(hs.prep?.recipe === recipe.id && hs.prep.variant === variant ? '查看备餐清单' : '追踪这一份备餐', () => {
          const same = state().prep?.recipe === recipe.id && state().prep.variant === variant;
          if (same || act({ type: 'planRecipe', recipe: recipe.id, variant }, { redraw: false }).ok) goView('prep');
        }, 'subtle', { 'data-plan-recipe': recipe.id }),
        h('div', { class: 'hs-ingredients' }, recipeNeeds(recipe, variant).map(([id, amount]) => ingredientLine(id, amount * count))),
        recipe.milkOption && h('label', { class: 'hs-check' }, h('input', { type: 'checkbox', checked: variant === 'milky', onchange: e => { variant = e.target.checked ? 'milky' : 'plain'; renderDetail(); } }), '加一份鲜奶 · 奶香变体'),
        h('label', { class: 'hs-check' }, h('input', { type: 'checkbox', checked: prime, 'data-cook-prime': '', onchange: e => { prime = e.target.checked; renderDetail(); } }), '优先使用优选食材'),
        materialNotice,
        h('div', { class: 'hs-price-line' }, '成品售价参考 ', h('strong', {}, `${fmt(rules.dishPrice(recipe.id, 'normal', variant))} 起`)),
        reason && h('p', { class: 'hs-notice', role: 'status' }, reason),
        h('div', { class: 'hs-cook-actions' }, button('亲手制作 · 24秒', () => { count = 1; act({ type: 'cookStart', recipe: recipe.id, variant, preferPrime: prime }); }, 'primary', { disabled: !unlocked.ok || !max }),
          learned ? h('div', { class: 'hs-quick' }, times >= 3 && h('select', { 'aria-label': '快捷制作份数', onchange: e => { count = Number(e.target.value); renderDetail(); } }, [1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: count === n, disabled: n > max }, `${n} 份`))), button('快捷制作', () => {
            const result = act({ type: 'quickCook', recipe: recipe.id, count, variant, preferPrime: prime }, { redraw: false });
            if (result.ok) { view = 'pantry'; render(); }
          }, '', { disabled: !unlocked.ok || !max || missing.length > 0 })) : small('首次完成解锁快捷 · 做满3次可批量'),
          learned && small(`现有食材可做 ${max === 5 ? '至少5' : max} 份${times < 3 ? ` · 再做${3 - times}次开放批量` : ''}`)));
      detail.replaceChildren(h('div', { class: 'hs-preview-column' }, stage, h('div', { class: 'hs-preview-caption' }, h('span', {}, '每一道菜，都有自己的模样'), button('转一转', () => preview?.rotate(), 'subtle'))), info);
      preview = makePreview(stage, recipe.id, { variant });
    }
    renderKitchenList();
  }
  function ingredientLine(id, required) {
    const have = usable(id), enough = have >= required;
    const source = ingredientSource(id);
    return h('div', { class: `hs-ingredient ${enough ? '' : 'missing'}` }, h('span', {}, itemName(id)), h('strong', {}, `${Math.min(have, 99999)} / ${required}`), !enough && h('div', { class: 'hs-ingredient-source' }, h('small', {}, rules.PANTRY[id]?.source || '在家园种植后收获'), button(source.label, source.action, 'subtle')));
  }

  function renderPrep() {
    const plan = getMealPrep(S), source = S, generation = stateGeneration;
    if (!plan) { body.append(h('div', { class: 'hs-empty' }, title('挑一道今天想做的菜'), small('在菜谱里点「追踪这一份备餐」，把食材去向留在清单中。'), button('去看看菜谱', () => goView('kitchen'), 'primary'))); return; }
    const current = () => !destroyed && panel && view === 'prep' && S === source && generation === stateGeneration;
    const openRecipe = () => { const live = getMealPrep(S); if (!live) return; selectedRecipe = live.recipeId; variant = live.variant; count = 1; filter = 'all'; query = ''; goView('kitchen'); };
    const route = row => {
      if (!current()) return;
      if (row.action === 'farm') goFarm({ cropId: row.cropId, fruit: !!FRUIT[row.cropId] });
      else if (row.action === 'collect' || row.action === 'feed') openAnimalActivity(row.animalId, row.action);
      else if (row.action === 'process') processIngredient(row.processItem);
      else if (row.action === 'build') goBuild(row.furnitureId, row.zone);
      else if (row.action === 'kitchen') openRecipe();
      else { ranchContext = row.animalId ? { animalId: row.animalId } : {}; goView('ranch'); }
    };
    const board = mountMealPrep(body, { getPlan: () => getMealPrep(S), getTarget: id => game.homesteadWorld?.getIngredientTarget?.(id), current,
      onRecipe: openRecipe, onRoute: route, onClear: () => { if (current() && act({ type: 'clearRecipePlan' }, { redraw: false }).ok) goView('kitchen'); },
      onPlanChanged: () => { if (current()) render(); }, dishIcon });
    viewCleanup = () => board.dispose();
  }

  function renderCooking() {
    const task = state().cooking, recipe = rules.RECIPE[task.recipe], source = S, generation = stateGeneration;
    let alive = true, finishing = false;
    const current = () => alive && !destroyed && source === S && generation === stateGeneration && view === 'kitchen' && state().cooking?.id === task.id;
    const host = h('div', { class: 'hs-cook-play-host' }); body.append(host);
    const progress = snapshot => {
      if (!current()) return false;
      const result = rules.performHomestead(S, { type: 'cookStep', taskId: task.id, ...snapshot }, Date.now());
      if (result.ok) save();
      return result.ok;
    };
    const player = mountCookingPlay(host, {
      task, recipe, isCurrent: current, onProgress: progress,
      makePreview: (target, id, options) => { preview = makePreview(target, id, options); return preview; },
      onFinish: () => {
        if (!current() || finishing) return { ok: false, message: '这份料理已经收好啦。' };
        finishing = true;
        const result = act({ type: 'cookFinish', taskId: task.id }, { redraw: false });
        if (result.ok) { view = 'pantry'; render(); } else finishing = false;
        return result;
      },
      onCancel: async () => {
        if (!current()) return false;
        const yes = await ui.confirm('收好这份备料？', '取消后，预留的食材会全部恢复可用。本次操作进度会清除。', '收好食材');
        if (!yes || !current()) return false;
        return act({ type: 'cookCancel', taskId: task.id }).ok;
      },
    });
    viewCleanup = (persist = true) => { player.dispose(persist); alive = false; };
  }

  function openAnimalActivity(id, mode = 'pet') {
    if (destroyed || !['pet', 'feed', 'collect'].includes(mode)) return;
    const animal = state().animals.find(a => a.id === id);
    if (!animal) { notify('这位伙伴已经离开，看看其他伙伴吧'); return; }
    if (mode === 'feed' && (!available('feed') || animal.feed >= 4)) { notify(!available('feed') ? '饲料用完啦，可以用小麦制作或先添免费草料。' : '待用料槽已经装满普通饲料啦。'); return; }
    const ready = animal.ready + animal.readyPrime;
    if (mode === 'collect' && !ready) { notify('伙伴还在慢慢准备，产物就绪后再来吧。'); return; }
    activeAnimalActivity?.close(true);
    const source = S, generation = stateGeneration;
    let modal, settled = false;
    const current = () => !destroyed && source === S && generation === stateGeneration && (!modal || (modal.isCurrent() && activeAnimalActivity === modal)) && state().animals.some(a => a.id === id);
    const activity = createAnimalActivity({ animal: { ...animal }, iconUrl: animalIcon(animal.kind, animal.look), mode,
      productName: itemName(rules.ANIMAL[animal.kind].product), count: ready,
      alreadyCared: animal.petDay === rules.homesteadDay(Date.now()), isCurrent: current,
      onCommit: () => {
        if (!current() || settled) return { ok: false, message: '这次互动已结束，可以重新看看伙伴。' };
        const result = act({ type: mode, animalId: id, ...(mode === 'feed' ? { count: 1 } : mode === 'pet' ? { manual: true } : {}) }, { redraw: false, silent: true });
        if (result.ok) { settled = true; audio.sfx('pop'); }
        return result;
      },
    });
    modal = secondary(activity.element, { cls: 'hs-play-modal', onClose: () => {
      activity.dispose(); if (activeAnimalActivity === modal) activeAnimalActivity = null;
      if (panel && source === S && generation === stateGeneration && view === 'ranch') render();
    } });
    activeAnimalActivity = modal;
  }

  function renderRanch() {
    const hs = state(), allAnimals = hs.animals, housing = rules.getAnimalHousing(S), capacity = housing.capacity;
    const animals = allAnimals.filter(a => (!ranchContext.animalId || a.id === ranchContext.animalId) && (!ranchContext.housingKey || housing.assignments[a.id] === ranchContext.housingKey));
    const timeUpdates = [];
    const feedNeeded = animals.reduce((sum, animal) => sum + Math.max(0, 4 - animal.feed), 0), readyTotal = allAnimals.reduce((n, a) => n + a.ready + a.readyPrime, 0);
    const todayCare = allAnimals.filter(a => a.petDay === rules.homesteadDay(Date.now())).length;
    const targeted = !!(ranchContext.animalId || ranchContext.housingKey), feedAction = { type: 'feed', ...(targeted ? { animalIds: animals.map(a => a.id) } : {}) };
    const nextStep = getHomesteadNextStep(S);
    const top = h('div', { class: 'hs-ranch-summary' }, h('div', { class: 'hs-ranch-overview' }, h('strong', {}, `${housing.totalHoused} / ${capacity} 位已安置 · ${allAnimals.length} 只伙伴`), small(`今日照料 ${todayCare}/${allAnimals.length} · 待收 ${readyTotal} 份 · 待安置 ${housing.unhousedIds.length} 只`)),
      h('div', { class: 'hs-actions' }, button('全场收获', () => act({ type: 'collect' }), '', { disabled: !allAnimals.some(a => a.ready + a.readyPrime > 0) }), button(`补满 · 可添${Math.min(feedNeeded, available('feed'))}份`, () => act(feedAction), '', { disabled: !feedNeeded || !available('feed') }), button('免费应急草料', () => act({ ...feedAction, emergency: true }), 'subtle', { disabled: !animals.some(a => a.feed + a.emergency < 4) }),
        button('到家园看看', () => { panel?.close(true); game.homesteadWorld?.visitRanch?.(); }, 'subtle'), button('搭建我的牧场', goBuild, 'subtle')));
    const next = h('div', { class: 'hs-next-step', 'data-homestead-step': nextStep.id }, h('div', {}, h('strong', {}, nextStep.tag), small(nextStep.text)), button(nextStep.label, () => api.openNextStep(), 'primary'));
    const grid = h('div', { class: 'hs-animal-grid' });
    for (const animal of animals) {
      const def = rules.ANIMAL[animal.kind], ready = Number(animal.ready || 0) + Number(animal.readyPrime || 0);
      const name = h('input', { value: animal.name, maxlength: 12, 'aria-label': `${animal.name}的名字`, class: 'hs-animal-name' });
      const status = h('p', { class: `hs-animal-status ${ready ? 'hs-good' : ''}`, 'data-animal-time': animal.id });
      const updateTime = () => { const current = state().animals.find(a => a.id === animal.id); if (!current) return; status.textContent = !rules.getAnimalHousing(S).assignments[animal.id] ? `等待安置 · 请在家园摆放${Object.values(rules.HOUSING).find(h=>h.kinds.includes(animal.kind))?.name || '住处'}${ready ? ` · 已有${ready}份可收取` : ''}` : ready ? `${ready} 份${itemName(def.product)}等你收取` : current.cycleAt ? `下一份${itemName(def.product)} · ${timeLeft(current.cycleAt - Date.now())}` : '添一点饲料，开始新的生产'; };
      updateTime(); timeUpdates.push(updateTime);
      const route = animalRouteUI(animal.id); timeUpdates.push(route.update);
      grid.append(h('article', { class: 'hs-animal-card', 'data-animal': animal.id }, h('div', { class: 'hs-animal-top' }, h('img', { src: animalIcon(animal.kind, animal.look), alt: def.name }), h('div', {}, h('span', { class: 'hs-badge' }, def.name), h('div', { class: 'hs-name-row' }, name, button('改名', () => act({ type: 'rename', animalId: animal.id, name: name.value }), 'subtle')), small(`${({ shy: '有点害羞', friendly: '喜欢亲近', lively: '活泼好动' })[animal.personality] || '喜欢陪伴'} · 亲密 ${animal.love} / 100`))),
        h('div', { class: 'hs-love' }, h('span', { style: { width: `${animal.love}%` } })), status,
        small(`待用饲料 ${animal.feed || 0} · 应急草料 ${animal.emergency || 0}${animal.cycleEmergency ? ' · 本轮草料生产较慢' : ''}`),
        (animal.carePending || animal.cyclePrime) && h('p', { class: 'hs-muted hs-good' }, animal.cyclePrime ? '精心照料 · 本轮产出优选' : '精心照料 · 下一轮正常饲料产出优选'),
        route.notice,
        h('div', { class: 'hs-actions hs-animal-main-actions' }, button(ready ? `亲手收获 ${ready} 份` : '尚未产出', () => openAnimalActivity(animal.id, 'collect'), 'primary', { disabled: !ready }), button(animal.petDay === rules.homesteadDay(Date.now()) ? '再陪它玩' : '陪伴梳毛', () => openAnimalActivity(animal.id, 'pet')), button('亲手喂食', () => openAnimalActivity(animal.id, 'feed'), '', { disabled: !available('feed') || animal.feed >= 4 }), button('更多照料', () => openAnimalActions(animal.id), 'subtle')),
        h('div', { class: 'hs-actions' }, button(animal.grazing ? '回窝休息' : '到草地玩', () => act({ type: 'graze', animalId: animal.id, value: !animal.grazing }), 'subtle'), route.control,
          button(animal.love >= 20 ? '呼唤名字' : '亲密20 · 呼唤', () => { panel?.close(true); game.homesteadWorld?.callAnimal?.(animal.id); }, 'subtle', { disabled: animal.love < 20 }),
          button(animal.love >= 80 ? '一起合影' : '亲密80 · 合影', () => { panel?.close(true); game.homesteadWorld?.photoAnimal?.(animal.id); }, 'subtle', { disabled: animal.love < 80 }))));
    }
    if (!animals.length) grid.append(h('div', { class: 'hs-empty' }, small('这个住处暂时没有伙伴。可以查看全部伙伴，或领养一位新朋友。'), button('查看全部伙伴', () => { ranchContext = {}; render(); })));
    const care = h('section', { class: 'hs-care-card' }, title('照料小铺', '现有饲料会公平分给伙伴；正常饲料还会替换待用草料，本轮生产不变。'),
      small(`饲料余量 ${available('feed')} · 小麦 ${available('wheat')}`), h('div', { class: 'hs-actions' }, button('1小麦换2饲料', () => act({ type: 'makeFeed', count: 1 }), '', { disabled: available('wheat') < 1 }), button('4饲料 · 104噗灵', () => act({ type: 'buyFeed', count: 4 }), '', { disabled: S.coins < 104 })),
      !available('feed') && small(available('wheat') ? '用小麦兑换，也可以先添免费草料。' : '没有饲料时可使用免费草料，生产较慢且固定普通品质。'),
      h('details', { class: 'hs-disclosure' }, h('summary', {}, '领养新伙伴'), h('div', { class: 'hs-adopt-list' }, rules.ANIMALS.map(def => {
        const home = Object.values(rules.HOUSING).find(v => v.kinds.includes(def.id)), made = Object.values(hs.history).filter(n => n > 0).length;
        const full = allAnimals.length >= 16, reasons = full ? ['已达到16只伙伴上限；增添住处不会增加总上限。'] : [!(housing.availableByKind[def.id] > 0) && `需要有空位的${home.name}`, def.id === 'cow' && made < 2 && `完成两种料理（${made}/2）`, def.id === 'sheep' && hs.teaCount < 1 && '完成一次招待（0/1）', S.coins < def.price && `还差${def.price - S.coins}噗灵`].filter(Boolean);
        return h('div', { class: 'hs-adopt-option' }, button(`${def.name} · ${fmt(def.price)} 噗灵`, () => act({ type: 'adopt', kind: def.id }), '', { disabled: reasons.length > 0 }), small(reasons.join('；') || `${home.name}有空位，可以入住。`), reasons.length > 0 && button(full ? '管理已有伙伴' : !housing.availableByKind[def.id] ? '去安排住处' : def.id === 'sheep' && !hs.teaCount ? '去招待朋友' : def.id === 'cow' && made < 2 ? '去做不同料理' : '查看照料', () => { if (full) openAnimalActions(allAnimals[0].id); else if (!housing.availableByKind[def.id]) goBuild(); else goView(def.id === 'sheep' && !hs.teaCount ? 'tea' : def.id === 'cow' && made < 2 ? 'kitchen' : 'ranch'); }, 'subtle'));
      }))),
      button('装修 · 增添住处与摆件', goBuild),
      small('家园装修的“牧场”分类有奶油鸡舍、畜棚、兔窝、围栏、食槽和野餐桌。放在海风工坊里的住处仅作装饰，不提供动物位置。'),
      small('安置好就能邀请“一起散步”，不需要亲密等级。慢慢带路，等它跟上，在住处或自己摆好的角落停一会儿；结束后，它会寻找回窝的小路。'),
      h('details', { class: 'hs-disclosure' }, h('summary', {}, '绒毛小工艺'), small('普通与优选绒毛都可使用，优先消耗普通材料。'), ...Object.values(rules.WOOL_TRADES).map(trade => {
        const cost = trade.cost || [['wool', trade.wool]], enough = cost.every(([id, n]) => usable(id) >= n), owned = trade.kind === 'owned' && S.owned?.includes(trade.item || trade.id), unlocked = hs.teaCount > 0;
        return h('div', { class: 'hs-adopt-option' }, button(trade.name, () => act({ type: 'woolTrade', trade: trade.id }), '', { disabled: !enough || owned || !unlocked }), small(owned ? '已经拥有这件小物' : cost.map(([id, n]) => `${itemName(id)} ${usable(id)}/${n}`).join(' · ')), !unlocked ? h('div', {}, small('完成一次招待后开放绒毛工艺。'), button('去招待朋友', () => goView('tea'), 'subtle')) : !enough && small('照料对应的伙伴，收取绒毛后就能制作。'));
      })),
      small('抚摸的亲密奖励与居民回礼均于北京时间00:00刷新。未登录不扣亲密。'));
    const scroll = h('div', { class: 'hs-ranch hs-scroll' }, next, top, targeted && h('div', { class: 'hs-focus-context' }, small(ranchContext.animalId ? '正在照顾这位伙伴' : '正在查看这个住处的伙伴'), button('查看全部伙伴', () => { ranchContext = {}; render(); }, 'subtle')), h('div', { class: 'hs-ranch-content' }, grid, care), h('div', { class: 'hs-actions' }, button('去厨房做菜', () => goView('kitchen')), button('去招待朋友', () => goView('tea')))); body.append(scroll);
    const productionStamp = () => JSON.stringify(state().animals.map(a => [a.id, a.ready, a.readyPrime, a.cycleAt, a.housingKey]));
    let animalStamp = productionStamp(), careDay = rules.homesteadDay(Date.now());
    const timer = setInterval(() => {
      if (document.hidden || !panel) return;
      rules.advanceHomestead(S, Date.now());
      const nextStamp = productionStamp();
      if (nextStamp !== animalStamp) { animalStamp = nextStamp; saveChanged({}, true); render(); }
      else if (careDay !== rules.homesteadDay(Date.now())) { careDay = rules.homesteadDay(Date.now()); render(); }
      else timeUpdates.forEach(update => update());
    }, 1500);
    viewCleanup = () => { clearInterval(timer); };
  }

  function openAnimalActions(id) {
    if (!state().animals.some(a => a.id === id)) { notify('这位伙伴已经离开，看看其他伙伴吧'); return; }
    let watchTimer = null, stamp = '', refreshRoute = () => {}, careDay = rules.homesteadDay(Date.now());
    const content = h('div', { class: 'hs-animal-menu' });
    const modal = secondary(content, { onClose: () => { clearInterval(watchTimer); } });
    const currentStamp = () => { const a = state().animals.find(v => v.id === id); return JSON.stringify([a?.ready, a?.readyPrime, a?.cycleAt, a?.feed, a?.emergency, a?.love, a?.petDay, a?.housingKey, available('feed')]); };
    function draw() {
      const animal = state().animals.find(a => a.id === id);
      if (!animal) { modal.close(true); return; }
      stamp = currentStamp();
      const def = rules.ANIMAL[animal.kind], ready = animal.ready + animal.readyPrime, home = rules.getAnimalHousing(S).assignments[id];
      const route = animalRouteUI(id, modal); refreshRoute = route.update;
      const action = data => { const result = act(data); if (result.ok) draw(); };
      const play = mode => { modal.close(true); openAnimalActivity(id, mode); };
      const pet = button(animal.petDay === rules.homesteadDay(Date.now()) ? '再陪它玩' : '陪伴梳毛', () => play('pet'));
      content.replaceChildren(h('div', { class: 'hs-animal-menu-heading' }, h('img', { src: animalIcon(animal.kind, animal.look), alt: def.name }), h('div', {}, h('h3', {}, animal.name), small(`${def.name} · 亲密 ${animal.love}/100`))),
        small(!home ? '等待安置：先在家园摆放适合它的住处。' : ready ? `${ready}份${itemName(def.product)}可以收取。` : animal.cycleAt ? `下一份产物约${timeLeft(animal.cycleAt - Date.now())}后完成。` : '料槽空了，添料后继续生产。'),
        small(`待用饲料 ${animal.feed} · 草料 ${animal.emergency} · 背包饲料 ${available('feed')}`),
        route.notice,
        h('div', { class: 'hs-actions' }, button(ready ? `亲手收获 ${ready} 份` : '尚未产出', () => play('collect'), 'primary', { disabled: !ready }), button('亲手喂食', () => play('feed'), '', { disabled: !available('feed') || animal.feed >= 4 }), pet),
        h('div', { class: 'hs-actions' }, button('免费应急草料', () => action({ type: 'feed', animalId: id, emergency: true }), 'subtle', { disabled: animal.feed + animal.emergency >= 4 }), button(animal.grazing ? '回窝休息' : '到草地玩', () => action({ type: 'graze', animalId: id, value: !animal.grazing }), 'subtle')),
        h('div', { class: 'hs-actions' }, route.control, button('查看详细照料', () => { modal.close(true); ranchContext = { animalId: id }; show('ranch'); }), button('到它身边', () => { modal.close(true); panel?.close(true); game.homesteadWorld?.visitAnimal?.(id); }, '', { disabled: !home })),
        small('安置好就能散步，不需要亲密等级。用平时的方式移动，走远了等一等它；先在自己的住处旁停留，也能看到它的回应。结束后会自己找路回窝。'),
        h('details', { class: 'hs-disclosure' }, h('summary', {}, '安置与送养'), small('送养会让伙伴永久离开。至少保留一位伙伴，送养不退还领养费用。'), button('查看送养说明', () => showRehome(id, modal), 'subtle', { disabled: state().animals.length <= 1 }), state().animals.length <= 1 && small('这是目前唯一的伙伴，暂时不能送养。')));
    }
    draw();
    watchTimer = setInterval(() => { if (document.hidden || !modal.isCurrent()) return; rules.advanceHomestead(S, Date.now()); if (currentStamp() !== stamp) { saveChanged({}, true); draw(); } else if (careDay !== rules.homesteadDay(Date.now())) { careDay = rules.homesteadDay(Date.now()); draw(); } else refreshRoute(); }, 1000);
  }
  function showRehome(id, animalModal) {
    const preview = rules.getRehomePreview(S, id);
    if (!preview.ok) { notify(preview.reason, true); return; }
    const content = h('div', { class: 'hs-rehome' }), input = h('input', { class: 'hs-search', placeholder: '输入伙伴的完整名字', 'aria-label': '确认送养伙伴的名字', autocomplete: 'off' });
    const modal = secondary(content);
    const confirm = button('确认永久送养', () => {
      const result = act({ type: 'rehome', animalId: id, confirmName: input.value }, { redraw: false });
      if (result.ok) { modal.close(true); animalModal.close(true); ranchContext = {}; if (panel) render(); }
    }, 'danger', { disabled: true });
    input.oninput = () => { confirm.disabled = input.value !== preview.name; };
    const returns = [preview.feed && `${preview.feed}份普通饲料`, ...Object.entries(preview.products || {}).filter(([, n]) => n).map(([item, n]) => `${n}份${itemName(item)}`)].filter(Boolean);
    content.append(h('h3', {}, `送养${preview.name}？`), h('p', { class: 'hs-notice' }, '伙伴离开后无法找回。领养费用不退还；免费草料不保留。'), small(returns.length ? `会退回：${returns.join('、')}。` : '目前没有可退回的饲料或产物。'), small(`输入「${preview.name}」确认这次决定。`), input, h('div', { class: 'hs-actions' }, button('让它继续留在家里', () => modal.close(true), 'primary'), confirm));
  }

  function dishCard(key, number, onClick, extra = '') {
    const dish = safeDish(key), recipe = rules.RECIPE[dish.recipe];
    if (!recipe) return null;
    const card = button('', onClick, `hs-dish-card ${extra}`, { 'data-dish-key': key });
    card.append(h('img', { src: dishIcon(dish.recipe, dish.quality, dish.variant), alt: '', loading: 'lazy' }), h('strong', {}, recipe.name), h('small', {}, `${QUALITY[dish.quality] || '家常'}${dish.variant === 'milky' ? ' · 奶香' : ''} · ${number}份`)); return card;
  }
  function renderPantry() {
    const hs = state(), grid = h('div', { class: 'hs-dish-grid' });
    Object.entries(hs.dishes).filter(([, n]) => n > 0).forEach(([key, n]) => grid.append(dishCard(key, n, () => showDish(key))));
    if (!grid.children.length) grid.append(h('div', { class: 'hs-empty' }, h('h3', {}, '冰箱在等第一份手作料理'), small('去厨房做一道蛋羹。做好的菜会真实入库，可以摆桌、取回、招待或出售。'), button('去做一道菜', () => { view = 'kitchen'; render(); }, 'primary')));
    const pantry = h('div', { class: 'hs-pantry-items' }, Object.entries(rules.PANTRY).filter(([id]) => id !== 'feed').map(([id, def]) => h('div', { class: 'hs-pantry-item' }, h('strong', {}, def.name), h('span', {}, `${available(id)} 份`), button('卖1份', () => act({ type: 'sellIngredient', item: id, count: 1 }), 'subtle', { disabled: available(id) < 1 }))));
    body.append(h('div', { class: 'hs-pantry hs-scroll' }, title('成品料理', '摆上桌会离开冰箱；取回才恢复为可用料理。'), grid,
      hs.placed.length > 0 && h('section', {}, title(`家中已摆放 · ${hs.placed.length} 份`), h('div', { class: 'hs-placed-list' }, hs.placed.map(item => h('div', { class: 'hs-placed-row' }, h('span', {}, rules.RECIPE[safeDish(item.key).recipe]?.name || '料理'), small(`${({ house: '家中', home: '后院', build: '建筑岛', ranch: '牧场' })[item.zone] || '餐桌'} · ${QUALITY[safeDish(item.key).quality]}`), button('转个方向', () => act({ type: 'rotate', instanceId: item.id }), '', { disabled: tableBusy(item.surface) }), button('取回冰箱', () => act({ type: 'retrieve', instanceId: item.id }), '', { disabled: tableBusy(item.surface) }), tableBusy(item.surface) && small('招待中，结束后可整理'))))),
      title('牧场食材', '普通和优选分别存放；厨房可选择优先使用优选。'), pantry,
      h('section', { class: 'hs-process' }, title('鲜奶加工', '每份酸奶需要1份奶；每份奶酪需要2份奶。'), button('鲜奶 → 酸奶', () => processIngredient('yogurt'), '', { disabled: usable('milk') < 1 }), button('2鲜奶 → 奶酪', () => processIngredient('cheese'), '', { disabled: usable('milk') < 2 })),
      small('农田与果园的作物仍在原有收获背包中；制作时会一起检查库存。')));
  }
  function processIngredient(item) {
    const result = act({ type: 'process', item, count: 1 }, { redraw: false, silent: true });
    if (!result.ok) { notify(result.message, true); return; }
    const content = h('div', { class: 'hs-processing' }, h('div', { class: 'hs-processing-milk' }, '鲜奶'), h('h3', {}, `正在制作${itemName(item)}`), small('搅拌、凝结，把鲜奶的香气留住。'), h('div', { class: 'hs-progress' }, h('div', { class: 'hs-progress-fill hs-process-fill' })));
    let timer; const modal = secondary(content, { onClose: () => { clearTimeout(timer); if (panel) render(); } });
    timer = setTimeout(() => { modal.close(true); notify(result.message || `${itemName(item)}已放入冰箱`); }, 5000);
  }
  function surfaces() { return game.homesteadWorld?.getSurfaces?.() || game.homestead?.getSurfaces?.() || kitchenContext.surfaces || []; }
  const tableBusy = id => state().tea?.surface === id;
  const tableItems = id => state().placed.filter(p => p.surface === id);
  const tableFree = table => Math.max(0, (table.anchors?.length || 0) - tableItems(table.id).length);
  function placeDish(key, table, options = {}) {
    if (!table) { notify('这张桌暂时不在家中，先摆好餐桌吧', true); return { ok: false }; }
    if (tableBusy(table.id)) { notify('朋友正在用这张桌，结束或取消招待后再整理吧', true); return { ok: false }; }
    const anchor = (table.anchors || []).map(a => typeof a === 'object' ? a.id : a).find(a => !state().placed.some(p => p.surface === table.id && p.anchor === a));
    if (anchor === undefined) { notify('这张桌已经摆满了，取回一道菜再摆放吧', true); return { ok: false }; }
    return act({ type: 'place', key, zone: table.zone, surface: table.id, anchor, rotation: 0 }, options);
  }
  function renderTable() {
    const table = surfaces().find(t => t.id === tableContext.surface);
    if (!table) { body.append(h('div', { class: 'hs-empty' }, h('h3', {}, '先摆好一张餐桌'), small('这张桌已经移动或收起，料理会按规则回到冰箱。'), button('查看冰箱', () => goView('pantry')), button('去装修摆桌', goBuild, 'primary'))); return; }
    const busy = tableBusy(table.id), entries = tableItems(table.id), free = tableFree(table), dishes = Object.entries(state().dishes).filter(([, n]) => n > 0);
    const manage = h('div', { class: 'hs-table-manager hs-scroll' }, title(table.name || '我的餐桌', busy ? '这张桌正在招待朋友，结束后可以继续整理。' : `已经摆好 ${entries.length} 份 · 还能放 ${free} 份`));
    const actions = h('div', { class: 'hs-actions' }, button('查看冰箱', () => goView('pantry')));
    if (table.canHost) actions.append(button(busy ? '继续这场招待' : '用这张桌招待朋友', () => { kitchenContext = { surface: table.id, zone: table.zone }; goView('tea'); }, 'primary'));
    else actions.append(small('这张桌可以摆菜；邀请朋友需要餐桌或牧场野餐桌。'));
    manage.append(actions, title('桌上的料理'));
    const placed = h('div', { class: 'hs-placed-list' });
    for (const entry of entries) placed.append(h('div', { class: 'hs-placed-row' }, h('span', {}, rules.RECIPE[safeDish(entry.key).recipe]?.name || '料理'), button('转个方向', () => act({ type: 'rotate', instanceId: entry.id }), '', { disabled: busy }), button('取回冰箱', () => act({ type: 'retrieve', instanceId: entry.id }), '', { disabled: busy }), button('在桌边尝一口', () => act({ type: 'eatPlaced', instanceId: entry.id }), '', { disabled: busy })));
    if (!entries.length) placed.append(small(busy ? '朋友的料理暂放在这张桌上。' : '桌面空着，选一份料理端上来吧。'));
    manage.append(placed, title('从冰箱端一道菜', busy ? '招待期间暂停摆放、旋转、取回和品尝。' : free ? '点击料理即可摆到这张桌的空位。' : '桌面已满，先取回或品尝一道菜。'));
    const grid = h('div', { class: 'hs-dish-grid' });
    for (const [key, n] of dishes) { const card = dishCard(key, n, () => placeDish(key, table)); card.disabled = busy || !free; grid.append(card); }
    if (!dishes.length) grid.append(h('div', { class: 'hs-empty' }, small('冰箱里还没有可用料理。'), button('去厨房做一道', () => { kitchenContext = { surface: table.id, zone: table.zone }; goView('kitchen'); }, 'primary')));
    manage.append(grid); body.append(manage);
  }
  function showDish(key) {
    const dish = safeDish(key), recipe = rules.RECIPE[dish.recipe], hs = state();
    if (!recipe || !(hs.dishes[key] > 0)) { notify('这份料理已经被使用了', true); render(); return; }
    const tables = surfaces(), initial = kitchenContext.surface || tables[0]?.id || '';
    const select = h('select', { 'aria-label': '选择摆放餐桌' }, tables.map(table => h('option', { value: table.id, selected: table.id === initial }, `${table.name || '家里的餐桌'} · ${tableBusy(table.id) ? '招待中' : `余${tableFree(table)}位`}`)));
    const guest = h('select', { 'aria-label': '选择赠送居民' }, knownFriends().map(n => h('option', { value: n.id }, n.name)));
    const content = h('div', { class: 'hs-dish-actions hs-scroll' }, h('img', { src: dishIcon(dish.recipe, dish.quality, dish.variant), alt: recipe.name }), h('h3', {}, recipe.name), small(`${QUALITY[dish.quality]}${dish.variant === 'milky' ? ' · 奶香' : ''} · 冰箱里有 ${hs.dishes[key]} 份`),
      small('每次操作使用1份。摆桌后可完整取回；品尝、赠礼和出售会消耗这份料理。'));
    const modal = secondary(content);
    let consumed = false;
    const consume = action => { if (consumed || !modal.isCurrent()) return; const result = act(action, { redraw: false }); if (result.ok) { consumed = true; modal.close(true); if (panel) render(); } };
    const place = button('摆上餐桌', () => {
      if (consumed || !modal.isCurrent()) return;
      const result = placeDish(key, tables.find(t => t.id === select.value), { redraw: false });
      if (result.ok) { consumed = true; modal.close(true); if (panel) render(); }
    }, 'primary');
    const placementHint = small('');
    const updateTable = () => { const table = tables.find(t => t.id === select.value); place.disabled = !table || tableBusy(table.id) || tableFree(table) < 1; placementHint.textContent = !table ? '先摆放餐桌、茶几或厨房岛台，就能把菜端上桌。' : tableBusy(table.id) ? '这张桌正在招待朋友，结束后才能整理。' : !tableFree(table) ? '这张桌已经摆满，先取回或品尝一道菜。' : `还有${tableFree(table)}个空位，摆好后可完整取回。`; };
    select.onchange = updateTable; updateTable();
    content.append(h('div', { class: 'hs-dish-action-row' }, select, place), placementHint, ...(!tables.length ? [button('去装修摆桌', () => { modal.close(true); goBuild(); })] : []),
      h('div', { class: 'hs-dish-action-row' }, guest, button('送给朋友', () => consume({ type: 'gift', key, resident: guest.value }))),
      h('div', { class: 'hs-actions' }, button('自己尝一口', () => consume({ type: 'eat', key })), button(`出售 · ${fmt(rules.dishPrice(dish.recipe, dish.quality, dish.variant))} 噗灵`, () => consume({ type: 'sellDish', key, count: 1 }))),
      ...orders().filter(o => o.recipe === dish.recipe).map(order => h('div', { class: 'hs-order-delivery' }, button(order.done ? '今天已经交付过了' : '交给今日来客', () => consume({ type: 'order', key, orderId: order.id }), 'primary', { disabled: order.done }), small(order.done ? '每天三选一，明天再来准备新的料理。' : '消耗1份料理，今日三个请求中只能完成一个。'))));
  }
  function knownFriends() { return FRIENDS.filter(n => n.id === 'momo' || (S.npc?.[n.id]?.t || 0) > 0); }
  function renderTea() {
    const hs=state();if(hs.tea){renderTeaSession(hs.tea);return;}
    const tables=surfaces().filter(t=>t.canHost),picked=[],guests=[kitchenContext.guest==='man'&&(S.npc?.man?.t||0)>0?'man':'momo'],grid=h('div',{class:'hs-dish-grid'}),selected=h('p',{class:'hs-notice'},'选择餐桌，再选料理和朋友。');
    const menuPreview=h('section',{class:'hs-tea-menu-preview','data-tea-menu-preview':'','aria-live':'polite'});
    const tableSelect=h('select',{'aria-label':'选择招待餐桌'},tables.map(t=>h('option',{value:t.id,selected:t.id===kitchenContext.surface},t.name)));
    const capacity=()=>Math.min(3,tables.find(t=>t.id===tableSelect.value)?.anchors.length||0);
    const update=()=>{
      start.disabled=!tables.length||!picked.length||!guests.length||picked.length>capacity();
      selected.textContent=!tables.length?'先摆放一张可以招待的餐桌。':!picked.length?'选至少一道料理，就可以邀请朋友。':!guests.length?'再邀请一位朋友，就可以开席。':picked.length>capacity()?`这张桌最多摆 ${capacity()} 份，请取消多选的料理。`:`已选 ${picked.length} 份料理 · 已邀请 ${guests.length} 位朋友 · 这张桌最多摆 ${capacity()} 份`;
      const menu=rules.getTeaMenuPreview(picked,guests);
      menuPreview.replaceChildren(h('strong',{},'这一桌的小心思'),...menu.guests.map(guest=>{
        const name=FRIENDS.find(friend=>friend.id===guest.id)?.name||'朋友', dish=menu.dishes.find(value=>value.key===guest.key);
        return h('p',{class:`hs-tea-match ${guest.liked?'is-liked':''}`,'data-tea-match':guest.id},!dish?`${name}喜欢${TAG_NAMES[guest.preference]}，可以留一道喜欢的。`:guest.liked?`${name}会喜欢「${dish.name}」的${TAG_NAMES[guest.preference]}味道。`:`${name}会先尝「${dish.name}」，再添一道${TAG_NAMES[guest.preference]}会更合心意。`);
      }),...(!menu.guests.length?[small('选一位朋友，就能看看今天的搭配。')]:[]),menu.theme?h('div',{class:'hs-tea-theme','data-tea-theme':menu.theme.id},h('strong',{},`小彩蛋 · ${menu.theme.title}`),small(menu.theme.line)):small(picked.length?'不同料理也会碰出桌边小故事，试试甜点配饮品。':'先选料理，再看看会聊起什么。'));
    };
    const start=button('开始招待',()=>act({type:'teaStart',keys:picked.slice(),guests:guests.slice(),surface:tableSelect.value}),'primary',{disabled:true});
    tableSelect.onchange=update;
    Object.entries(hs.dishes).filter(([,number])=>number>0).forEach(([key,number])=>{
      const card=dishCard(key,number,()=>{const i=picked.indexOf(key);if(i>=0)picked.splice(i,1);else if(picked.length<capacity())picked.push(key);else{notify(tables.length?'这张桌的料理已经选满了':'请先在家中摆放餐桌或牧场野餐桌');return;}card.classList.toggle('selected',picked.includes(key));update();});card.append(h('small',{class:'hs-tea-dish-tags'},rules.getTeaMenuPreview([key]).dishes[0].tags.map(tag=>TAG_NAMES[tag]).join(' · ')));grid.append(card);
    });
    if(!grid.children.length)grid.append(h('div',{class:'hs-empty'},small('冰箱里还没有料理，先做一份，再请朋友来尝尝。'),button('去厨房',()=>{view='kitchen';render();})));
    const guestList=h('div',{class:'hs-guest-list'},knownFriends().map(n=>{
      const card=button('',()=>{const i=guests.indexOf(n.id);if(i>=0)guests.splice(i,1);else if(guests.length<2)guests.push(n.id);else{notify('这次最多邀请两位朋友');return;}card.classList.toggle('selected',guests.includes(n.id));update();},`hs-guest ${guests.includes(n.id)?'selected':''}`);card.append(portrait(n.id),h('span',{class:'hs-guest-copy'},h('strong',{},n.name),h('small',{},`喜欢${TAG_NAMES[rules.getTeaMenuPreview([],[n.id]).guests[0].preference]}`)));return card;
    }));
    body.append(h('div',{class:'hs-tea-select hs-scroll'},title('选一张亲手摆好的餐桌'),tables.length?tableSelect:h('div',{class:'hs-notice'},small('先在家园摆放牧场野餐桌，或在小屋摆好餐桌，再邀请朋友。'),button('去装修摆桌',()=>{panel?.close(true);game.homesteadWorld?.buildRanch?.();})),title('为朋友留个座位','来客会到你选择的真实餐桌旁。'),guestList,title('今天准备吃什么'),grid,menuPreview,selected,h('div',{class:'hs-actions'},start),small('居民每天首次收到料理：合口味关系 +2，其他料理 +1；送礼与招待共用，大喵陪伴不计数值。主题搭配会带来特别对白。搬动或收回餐桌会取消招待并退回料理。')));update();
  }
  function renderTeaSession(task) {
    const source = S, generation = stateGeneration;
    const current = () => !destroyed && source === S && generation === stateGeneration && !!panel && state().tea?.id === task.id;
    const play = mountTeaPlay(body, {
      taskId: task.id, getTask: () => state().tea, getState: () => S, isCurrent: current, dishIcon, portrait,
      onServe: (guest, key) => current() ? act({ type: 'teaServe', taskId: task.id, guest, key }, { silent: true, redraw: false }) : { ok: false, message: '这场招待已结束。' },
      onFinish: skip => { if (current()) act({ type: 'teaFinish', taskId: task.id, ...(skip ? { skip: true } : {}) }); },
      onVisit: () => { if (current()) { panel?.close(true); game.homesteadWorld?.visitTea?.(); } },
      onCancel: async () => {
        const yes = await ui.confirm('把料理收好？', '取消本场招待，预留的料理会全部退回冰箱，不结算本次招待奖励。', '取消并退回');
        if (yes && current()) act({ type: 'teaCancel', taskId: task.id });
      },
    });
    viewCleanup = () => play.dispose();
  }
  function renderBook() {
    const hs = state(), todayOrders = orders(), made = rules.RECIPES.filter(r => (hs.history[r.id] || 0) > 0 || (hs.book[r.id]?.count || 0) > 0).length;
    const requestCards = h('div', { class: 'hs-order-grid' }, todayOrders.map(order => {
      const recipe = rules.RECIPE[order.recipe], entry = Object.entries(hs.dishes).find(([key, n]) => n > 0 && safeDish(key).recipe === order.recipe);
      return h('article', { class: 'hs-order-card', 'data-order-id': order.id }, h('strong', {}, recipe.name), small(order.done ? '今日已交付，明天刷新' : entry ? `冰箱有${entry[1]}份 · ${QUALITY[safeDish(entry[0]).quality]}` : '冰箱还没有这道料理'), small(`料理价值另加 ${fmt(order.bonus)} 噗灵`),
        button(order.done ? '今天已完成' : entry ? '交付这道料理 · 1份' : '去准备这道菜', () => {
          if (entry) act({ type: 'order', orderId: order.id, key: entry[0] });
          else { selectedRecipe = recipe.id; query = ''; filter = 'all'; count = 1; variant = 'plain'; goView('kitchen'); }
        }, entry && !order.done ? 'primary' : '', { disabled: order.done }));
    }));
    body.append(h('div', { class: 'hs-book hs-scroll' }, title(`我的料理图鉴 · ${made} / ${rules.RECIPES.length}`, '制作记录会一直留下；记录不是可以再次领取的成品。'),
      h('div', { class: 'hs-actions hs-life-discoveries-entry' }, button('生活发现', () => { panel?.close(true); game.ui.lifeDiscoveries?.(); }, 'subtle', { 'data-life-discoveries-entry': '' })),
      createCafeMemoryCard({
        onCook: recipeId => { selectedRecipe = rules.RECIPE[recipeId] ? recipeId : 'milk_pudding'; query = ''; filter = 'all'; variant = 'plain'; count = 1; goView('kitchen'); },
        onVisitCafe: () => { panel?.close(true); game.openShop('cafe'); },
        onHost: () => { kitchenContext = { guest: 'man' }; goView('tea'); },
      }),
      title('今日来客 · 三选一', '挑一道料理交付，每天只能完成一个请求。北京时间00:00刷新。'), requestCards,
      h('div', { class: 'hs-book-grid' }, rules.RECIPES.map(recipe => {
        const record = hs.book[recipe.id], times = hs.history[recipe.id] || record?.count || 0;
        return h('article', { class: `hs-book-card ${times ? '' : 'undiscovered'}` }, h('img', { src: dishIcon(recipe.id), alt: recipe.name, loading: 'lazy' }), h('div', {}, h('strong', {}, recipe.name), small(times ? `做过 ${times} 次 · 最好 ${QUALITY[record?.best] || '家常'}` : '还没有亲手完成'), small((recipe.tags || []).map(tag => TAG_NAMES[tag] || tag).join(' · ')), button(times ? '再做一次' : '看看材料', () => { selectedRecipe = recipe.id; query = ''; filter = 'all'; variant = 'plain'; count = 1; view = 'kitchen'; render(); }, 'subtle')));
      })), title('生活小贴士'), h('ul', { class: 'hs-tips' }, h('li', {}, '家园摆好适合的住处才会生产；收起住处后暂停，重新摆放会继续。睡觉不会加速。'), h('li', {}, '领养奶牛：做过两种不同料理。领养绵羊：完成一次真实招待。'), h('li', {}, '每道菜首做后可快捷制作，做满3次可批量制作1至5份。'), h('li', {}, '摆在桌上的料理仍属于你；先取回冰箱才能出售或赠送。'), h('li', {}, '招待与照料的每日奖励按北京时间00:00刷新。'))));
  }
  // 换档时先丢弃旧界面的未写进度，避免两个存档恰巧使用相同任务编号而串写。
  const onReplace = () => { stateGeneration++; resetView(false); for (const current of [...secondaryPanels]) current.close(true); if (panel) render(); };
  const off = bus.on('stateReplaced', onReplace);
  const api = {
    openNextStep() {
      if (destroyed) return;
      rules.advanceHomestead(S, Date.now());
      const next = getHomesteadNextStep(S);
      // 点击时重新派生，避免打开任务清单后收获、消耗或换天造成旧建议。
      if (next.action === 'build') { goBuild(next.furnitureId, next.zone); return; }
      if (next.action === 'shop') { panel?.close(true); game.openShop(next.shopId || 'cafe'); return; }
      if (next.action === 'prep') { show('prep'); return; }
      if (['pet', 'feed', 'collect'].includes(next.action)) { openAnimalActivity(next.animalId, next.action); return; }
      if (next.action === 'table') { api.openTable({ surface: next.surface, zone: next.zone }); return; }
      if (next.action === 'kitchen') { api.openKitchen({ recipeId: next.recipeId }); return; }
      if (next.action === 'ranch') ranchContext = next.animalId ? { animalId: next.animalId } : {};
      if (next.action === 'tea') kitchenContext = {};
      show(next.action);
    },
    getPreviewStats() { return preview?.stats ? { ...preview.stats } : null; },
    openKitchen(context = {}) { kitchenContext = context || {}; if (rules.RECIPE[context?.recipeId]) { selectedRecipe = context.recipeId; query = ''; filter = 'all'; variant = 'plain'; count = 1; } show('kitchen'); },
    openRanch(context = {}) { ranchContext = context || {}; show('ranch'); }, openAnimalActions, openAnimalActivity,
    openPantry() { show('pantry'); }, openTea(context = {}) { kitchenContext = context || {}; show('tea'); },
    openTable(context = {}) { tableContext = context || {}; kitchenContext = context || {}; show('table'); },
    openDishActions(instanceId) {
      const instance = state().placed.find(item => item.id === instanceId);
      if (!instance) { show('pantry'); return; }
      const dish = safeDish(instance.key), recipe = rules.RECIPE[dish.recipe], busy = tableBusy(instance.surface);
      const content = h('div', { class: 'hs-dish-actions' }, h('img', { src: dishIcon(recipe.id, dish.quality, dish.variant), alt: recipe.name }), h('h3', {}, recipe.name), small(busy ? '朋友正在使用这张桌，结束或取消招待后再整理吧。' : '这一份料理正摆在桌上。可以就地品尝，也能完整取回冰箱。'));
      const modal = secondary(content);
      const consume = type => { const result = act({ type, instanceId }, { redraw: false }); if (result.ok) { modal.close(true); if (panel) render(); } };
      content.append(h('div', { class: 'hs-actions' }, button('转个方向', () => act({ type: 'rotate', instanceId }, { redraw: false }), '', { disabled: busy }), button('取回冰箱', () => consume('retrieve'), 'primary', { disabled: busy }), button('在桌边尝一口', () => consume('eatPlaced'), '', { disabled: busy })), button(busy ? '查看这场招待' : '整理这张餐桌', () => { modal.close(true); const context = { surface: instance.surface, zone: instance.zone }; if (busy) api.openTea(context); else api.openTable(context); }));
    },
    dispose() { destroyed = true; walkHUD.dispose(); for (const current of [...secondaryPanels]) current.close(true); panel?.close(true); resetView(); if (typeof off === 'function') off(); },
  };
  return api;
}

