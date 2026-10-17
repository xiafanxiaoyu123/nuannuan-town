// 小游戏公共部分：室内场景搭建、HUD、倒计时、结算
import { THREE, cbox, box, group, mat, glow, rboxGeo, disposeSceneResources } from '../core/kit.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { S, bus, addCoins, stat, styleBonus, flushSave } from '../core/state.js';
import { SHOPS, shopMult, MAX_STAGE, stageScale } from '../data.js';
import { h, fmt, wait, tween } from '../core/util.js';
import { ui, svg } from '../ui/ui.js';
import { coinIco } from '../core/icons.js';
import { outfitFx } from '../live/effects.js';
import { addFertilizer } from '../shared/save-compat.js';
import { getDailySupport } from '../shared/momo-fortune.js';

const MOMO_HINTS = {
  cafe: '补满备货与黄金咖啡、收取柜台噗灵、恢复客人耐心',
  bakery: '把现有未烤焦面包调至完美火候，并恢复客人耐心',
  flower: '清理棋盘杂草、补满花种与丝带篮，并恢复客人耐心',
  fish: '收线时让绿条对准鱼儿，并增加 35% 收线进度',
  tailor: '自动缝好判定线附近最多四颗纽扣，包含长针脚',
};

// 把底部操作栏整体缩放到屏幕放得下：宽度不超出屏幕，高度不超过屏幕的 maxH
// 用 zoom 而不是 transform：点击区域和看到的一致
export function fitToScreen(el, signal, maxH = 0.5) {
  const fit = () => {
    if (!el.isConnected) return;
    el.style.zoom = '';
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const cs = getComputedStyle(document.documentElement);
    const pad = 12 + (parseFloat(cs.getPropertyValue('--sal')) || 0) + (parseFloat(cs.getPropertyValue('--sar')) || 0);
    const z = Math.min(1, (window.innerWidth - pad) / r.width, (window.innerHeight * maxH) / r.height);
    el.style.zoom = z < 0.995 ? z.toFixed(3) : '';
  };
  requestAnimationFrame(fit);
  setTimeout(fit, 400);
  window.addEventListener('resize', fit, { signal });
  return fit;
}

// 棋盘格地板 + 三面墙
export function buildRoom(scene, o) {
  const W = o.w ?? 18, D = o.d ?? 13, z0 = o.z0 ?? -7.5;
  const floor = box(W, 0.4, D, o.floorA, 0, -0.4, z0 + D / 2, { r: 0.05, cast: false });
  scene.add(floor);
  const n = Math.floor((W * D) / 2);
  const tiles = new THREE.InstancedMesh(rboxGeo(0.98, 0.04, 0.98, 0.018), mat(o.floorB), n);
  const d = new THREE.Object3D();
  let i = 0;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if ((x + z) % 2 || i >= n) continue;
    d.position.set(-W / 2 + x + 0.5, 0.0, z0 + z + 0.5);
    d.updateMatrix();
    tiles.setMatrixAt(i++, d.matrix);
  }
  tiles.count = i;
  tiles.receiveShadow = true;
  scene.add(tiles);
  const H = o.h ?? 7;
  scene.add(box(W + 0.8, H, 0.5, o.wall, 0, 0, z0 - 0.25, { r: 0.05, cast: false }));
  scene.add(box(W + 0.82, 1.5, 0.56, o.trim, 0, 0, z0 - 0.25, { r: 0.05, cast: false }));
  scene.add(box(W + 0.84, 0.16, 0.6, '#ffffff', 0, 1.5, z0 - 0.25, { r: 0.05, cast: false }));
  for (const sx of [-1, 1]) {
    scene.add(box(0.5, H, D, o.wall, sx * (W / 2 + 0.25), 0, z0 + D / 2, { r: 0.05, cast: false }));
    scene.add(box(0.56, 1.5, D, o.trim, sx * (W / 2 + 0.25), 0, z0 + D / 2, { r: 0.05, cast: false }));
  }
  scene.background = new THREE.Color(o.bg || o.wall);
}
export function roomLights(scene, o = {}) {
  scene.add(new THREE.HemisphereLight(0xffffff, o.ground || 0xffe2d6, o.hemi ?? 1.15));
  const s = new THREE.DirectionalLight(o.color || 0xfff3e2, o.sun ?? 2.5);
  s.position.set(-5, 11, 8);
  s.castShadow = true;
  s.shadow.mapSize.set(app.shadowSize, app.shadowSize);
  const c = s.shadow.camera;
  c.left = -12; c.right = 12; c.top = 12; c.bottom = -12; c.near = 1; c.far = 40;
  s.shadow.bias = -0.0004;
  s.shadow.normalBias = 0.04;
  scene.add(s);
}
export function wallWindow(w = 2.4, hgt = 2.2, curtain = '#ffc2d6') {
  const g = group();
  g.add(cbox(w + 0.3, hgt + 0.3, 0.16, '#ffffff', 0, 0, 0, { r: 0.07 }));
  g.add(cbox(w, hgt, 0.18, glow('#dff3ff', '#bfe6ff', 0.55, 0.55), 0, 0, 0.01, { r: 0.05, cast: false }));
  g.add(cbox(0.08, hgt, 0.2, '#ffffff', 0, 0, 0.02, { cast: false }));
  g.add(cbox(w, 0.08, 0.2, '#ffffff', 0, 0, 0.02, { cast: false }));
  g.add(cbox(w + 0.7, 0.18, 0.24, '#ffffff', 0, hgt / 2 + 0.3, 0.08, { r: 0.06 }));
  for (const sx of [-1, 1]) {
    g.add(cbox(0.5, hgt + 0.3, 0.14, curtain, sx * (w / 2 + 0.1), 0.05, 0.12, { r: 0.07 }));
    g.add(cbox(0.56, 0.14, 0.18, '#ffffff', sx * (w / 2 + 0.1), -hgt * 0.2, 0.13, { r: 0.05 }));
  }
  return g;
}
export function shelf(w = 3, items = []) {
  const g = group();
  g.add(cbox(w, 0.14, 0.6, '#ffffff', 0, 0, 0, { r: 0.05 }));
  for (const sx of [-1, 1]) g.add(cbox(0.1, 0.3, 0.5, '#f0d6d8', sx * (w / 2 - 0.3), -0.2, 0, { r: 0.03 }));
  items.forEach((m, i) => {
    m.position.set(-w / 2 + (i + 0.5) * (w / items.length), 0.07, 0);
    g.add(m);
  });
  return g;
}
export const jar = (c, hgt = 0.5) => group(0, 0, 0, box(0.34, hgt, 0.34, c, 0, 0, 0, { r: 0.1 }), box(0.3, 0.08, 0.3, '#ffffff', 0, hgt, 0, { r: 0.03 }));
export const plantPot = (c = '#8fd694') => group(0, 0, 0, box(0.34, 0.3, 0.34, '#f4b99a', 0, 0, 0, { r: 0.07 }), cbox(0.5, 0.46, 0.5, c, 0, 0.52, 0, { r: 0.16 }), cbox(0.3, 0.3, 0.3, '#a9e3a0', 0.12, 0.8, 0.05, { r: 0.1 }));

export class MiniGame {
  constructor(game, shopId, o = {}) {
    this.game = game;
    this.id = shopId;
    this.shop = SHOPS[shopId];
    this.lv = S.shops[shopId].lv;
    this.outfit = { ...S.outfit }; // 本局的穿搭与套装加成只在入场时取一次
    this.fx = (key) => outfitFx(this.outfit, key);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(o.fov ?? 30, 1, 0.5, 120);
    this.baseFov = o.fov ?? 30;
    this.post = { tilt: 2.4, vig: 0.24, bloom: 0.22, ...(o.post || {}) };
    this.duration = o.duration ?? 70;
    this.time = this.duration;
    this.score = 0;
    this.combo = 0;
    this.state = 'intro';
    // 营业模式：关卡（限时、每关有目标）/ 无尽（不限时，失误扣爱心，扣完打烊）
    const po = game.playOpts || {};
    this.mode = po.mode === 'endless' ? 'endless' : 'level';
    this.endless = this.mode === 'endless';
    const cleared = S.shops[shopId].stage || 0;
    this.stage = this.endless ? 0 : Math.max(1, Math.min(MAX_STAGE, po.stage || cleared + 1));
    this.elapsed = 0;
    this.lives = this.maxLives = (o.lives || 3) + (this.endless ? this.fx('lion') : 0);
    this.starAt = (o.stars || [100, 220, 360]).map((v) => Math.round(v * (this.endless ? 1 : stageScale(this.stage))));
    this.abort = new AbortController();
    this.paused = false;
    this.perks = {};
    this.tweens = new Set();
    // 大喵应援技能与神社今日吉签加成
    const support = getDailySupport(S);
    this.momoEnergy = support.momoEnergy;
    this.momoSkillsUsed = 0;
    this.fortuneLv = support.fortuneLv;
    this.fortuneBonus = support.fortuneBonus;
    this.rareDropBonus = support.rareDropBonus;
    game.liveHooks?.onGameInit?.(this); // 子类准备菜单、棋盘之前固定本局规则
  }
  // 压力系数：关卡越靠后、无尽撑得越久，节奏越快（各小游戏拿它去除间隔、乘速度）
  get pressure() {
    const p = this.endless ? 1 + Math.min(this.elapsed, 360) / 150 : 1 + (this.stage - 1) * 0.035;
    return p * (this.slow ? 0.8 : 1);
  }
  get playing() { return this.state === 'play' && !this.paused && !this.dead; }
  pause() {
    if (!this.playing) return false;
    this.onPause?.();
    this.paused = true;
    this.syncMomoSkill();
    this.cancelDrag?.();
    audio.pauseMusic();
    this.hudEl.querySelector('.gquit').disabled = true;
    return true;
  }
  resume(force = false) {
    if (!this.paused) return false;
    if (this.onResume?.(force) === false && !force) return false;
    this.paused = false;
    this.syncMomoSkill();
    audio.resumeMusic();
    this.hudEl.querySelector('.gquit').disabled = false;
    return true;
  }
  // 暂停之后回到游戏前先数 3、2、1（选完强化时用），手慢也来得及接上节奏；倒数期间仍然是暂停状态
  async resumeCountdown() {
    if (!this.paused) return false;
    if (this.resuming) return this.resuming;
    this.resuming = (async () => {
      for (const t of ['3', '2', '1']) {
        if (this.dead || !this.paused) break;
        this.countEl.replaceChildren(h('span', {}, t));
        audio.sfx('tick');
        await wait(0.6);
      }
      if (!this.dead) this.countEl.replaceChildren();
      this.resuming = null;
      return this.dead ? false : this.resume();
    })();
    return this.resuming;
  }
  // 钓鱼甩竿等异步补间也跟随本局暂停；离开小游戏后释放，避免旧回调继续修改场景
  tween(o) {
    const tw = tween({ ...o, paused: () => this.paused, done: () => { this.tweens.delete(tw); if (!this.dead) o.done?.(); } });
    this.tweens.add(tw);
    return tw;
  }
  // 无尽模式里的一次失误
  loseLife() {
    if (!this.endless || !this.playing) return;
    if (this.shield > 0) { this.shield--; return; }
    this.lives--;
    this.renderLives();
    this.timerEl.classList.remove('hurt');
    void this.timerEl.offsetWidth;
    this.timerEl.classList.add('hurt');
    if (this.lives <= 0) this.finish();
  }
  renderLives() {
    if (!this.livesEl) return;
    this.livesEl.classList.toggle('many', this.maxLives > 3);
    this.timerEl.classList.toggle('many-lives', this.maxLives > 3);
    this.livesEl.replaceChildren(...Array.from({ length: this.maxLives }, (_, i) => h('i', { class: i < this.lives ? 'on' : '' })));
  }
  on(target, ev, fn, opt = {}) {
    const { whilePaused = false, ...options } = opt;
    target.addEventListener(ev, (e) => { if (whilePaused || !this.paused || !/^(pointer|key)/.test(ev)) fn(e); }, { ...options, signal: this.abort.signal });
  }

  mountHUD(extra = []) {
    this.timerFill = h('i');
    this.timerNum = h('b', {}, this.duration);
    this.livesEl = h('span', { class: 'glives' });
    this.timerEl = h('div', { class: 'gtimer' + (this.endless ? ' endless' : '') }, this.timerFill, this.timerNum, this.endless && this.livesEl);
    this.renderLives();
    this.scoreEl = h('span', { class: 'num' }, '0');
    this.comboEl = h('div', { class: 'cb zero' }, '连击 ×0');
    this.rushEl = h('div', { class: 'grush-pill hide' }, '🔥 狂热 ×1.25');
    this.countEl = h('div', { class: 'count' });
    // 工坊熟练度等级（F4）：按历史游玩局数与累计星数计算 Lv.1~Lv.5，每级提供 +2% 永久营收加成
    const st = S.shops[this.id] || { lv: 1, plays: 0, stars: {} };
    const starSum = Object.values(st.stars || {}).reduce((a, b) => a + b, 0);
    this.masteryLv = Math.min(5, 1 + Math.floor(((st.plays || 0) + starSum) / 8));
    this.masteryBonus = (this.masteryLv - 1) * 0.02;
    // 穿搭加成：开局大字提醒，局内左上角常驻
    const bn = (this.bonus = styleBonus(this.id, this.outfit)), sn = bn.style.name;
    this.bonusEl = h('div', { class: 'gbonus' + (bn.n ? ' on' : ''), style: { '--c': bn.style.color } }, `${sn}穿搭 `, h('b', {}, `+${bn.pct}%`));
    this.masteryEl = h('div', { class: 'gbonus on gmastery', style: { '--c': this.shop.color } }, `熟练 Lv.${this.masteryLv}`, this.masteryBonus > 0 ? h('b', {}, ` +${Math.round(this.masteryBonus * 100)}%`) : null);
    this.fortuneEl = this.fortuneLv ? h('div', { class: 'gbonus on gfortune', style: { '--c': '#e9a520' } }, `⛩️${this.fortuneLv} `, h('b', {}, `+${Math.round(this.fortuneBonus * 100)}%`)) : null;
    // 大喵应援主动技能按钮
    this.momoSkillFill = h('i');
    this.momoSkillText = h('span', {}, '大喵 0%');

    // 生成按钮
    this.momoSkillBtn = h('button', {
      type: 'button',
      class: 'gmomo-skill',
      title: `${MOMO_HINTS[this.id]}；攒满后按 ${this.momoSkillKey === 'Space' ? '空格' : 'G'} 键或点击`,
      onclick: (e) => {
        // Some WebViews emit a delayed compatibility click after touch pointerup.
        if (e?.detail && performance.now() - (this._momoTouchAt ?? -Infinity) < 700) return;
        this.triggerMomoSkill();
      },
    }, this.momoSkillFill, h('b', {}, '🐾'), this.momoSkillText);
    this.on(this.momoSkillBtn, 'pointerdown', (e) => {
      if (e.pointerType !== 'touch') this._momoTouchAt = -Infinity;
    });
    this.on(this.momoSkillBtn, 'pointerup', (e) => {
      if (e.pointerType !== 'touch' || !this.momoSkillBtn.contains(document.elementFromPoint(e.clientX, e.clientY))) return;
      if (this.triggerMomoSkill()) {
        this._momoTouchAt = performance.now();
        e.preventDefault();
      }
    });
    this.syncMomoSkill();
    this.bonusIntro = h('div', { class: 'gbonus-intro' + (bn.n ? ' on' : ''), style: { '--c': bn.style.color } },
      h('span', {}, `本店偏爱「${sn}」风格 · 工坊熟练 Lv.${this.masteryLv}`),
      h('b', {}, `穿搭加成 +${bn.pct}%`),
      h('em', {}, bn.n ? `身上有 ${bn.n} 件${sn}服饰 · 每件 +6%${bn.n < 5 ? '，还能更高' : '，已拉满'}` : `还没穿${sn}风格的服饰 · 每件能多赚 6%，最多 +30%`));
    if (!this.endless) {
      this.goalStarsEl = h('span', { class: 'ggoal-stars' }, '☆☆☆');
      this.goalLabelEl = h('span', { class: 'ggoal-lbl' }, ' 1★目标 ');
      this.goalNumEl = h('b', {}, fmt(this.starAt[0]));
      this.goalEl = h('div', { class: 'ggoal' }, this.goalStarsEl, this.goalLabelEl, this.goalNumEl);
    }
    this.hudEl = h('div', { class: 'ghud' },
      h('div', { class: 'gcombo' }, h('div', { class: 'pill coin' }, h('img', { src: coinIco() }), this.scoreEl), this.comboEl, this.rushEl, this.momoSkillBtn, this.bonusEl, this.masteryEl, this.fortuneEl),
      h('div', { class: 'gtop' }, h('div', { class: 'name', style: { '--c': this.shop.color } }, this.endless ? `${this.shop.name} · 无尽` : `${this.shop.name} · 第 ${this.stage} 关`), this.timerEl,
        !this.endless && this.goalEl),
      h('button', { class: 'btn alt sm gquit', onclick: () => { audio.sfx('click'); if (this.state === 'play') this.finish(); } }, '提前打烊'),
      ...extra, this.bonusIntro, this.countEl);
    ui.root.append(this.hudEl);

    this.on(window, 'keydown', (e) => {
      const key = this.momoSkillKey || 'KeyG'; // 默认 G，谁设了就用谁的
      if (e.defaultPrevented || e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (!e.repeat && e.code === key && this.playing) {
        e.preventDefault();
        this.triggerMomoSkill();
      }
    });

    const lh = this.game.liveHooks;
    lh && lh.onGameHUD && lh.onGameHUD(this);
  }
  syncMomoSkill() {
    if (!this.momoSkillBtn) return;
    const pct = Math.min(100, Math.max(0, Math.floor(this.momoEnergy || 0)));
    const ready = pct >= 100;
    const usable = ready && this.playing && !this._momoCasting && typeof this.onMomoSkill === 'function' && this.canMomoSkill();
    const keyCode = this.momoSkillKey || 'KeyG';
    const keyLabel = keyCode === 'Space' ? '空格' : /^Key[A-Z]$/.test(keyCode) ? keyCode.slice(3) : keyCode;
    const display = `${pct}:${!!this.playing}:${!!usable}:${keyLabel}`;
    if (this._momoDisplay === display) return;
    this._momoDisplay = display;
    this.momoSkillFill.style.transform = `scaleX(${pct / 100})`;
    this.momoSkillBtn.classList.toggle('ready', ready);
    this.momoSkillBtn.disabled = !ready || !usable;
    this.momoSkillBtn.title = `${MOMO_HINTS[this.id]}；攒满后按 ${keyLabel} 键或点击`;
    this.momoSkillText.textContent = ready ? (usable ? `大喵绝招 (${keyLabel})` : `等待时机 (${keyLabel})`) : `大喵 ${pct}%`;
    this.momoSkillBtn.setAttribute('aria-label', `大喵应援 ${pct}%：${MOMO_HINTS[this.id]}${ready && !usable ? '，等待可用时机' : ''}`);
  }
  canMomoSkill() { return false; }
  addMomoEnergy(delta) {
    // 绝招内的收取/自动缝制仍正常记分，但不能给自己再次充能。
    if (!this.playing || this._momoCasting || !Number.isFinite(delta) || delta <= 0) return;
    const wasReady = (this.momoEnergy || 0) >= 100;
    this.momoEnergy = Math.min(100, (this.momoEnergy || 0) + delta);
    this.syncMomoSkill();
    if (!wasReady && this.momoEnergy >= 100) {
      audio.sfx('pop', 5);
    }
  }
  triggerMomoSkill() {
    if (!this.playing || this._momoCasting || (this.momoEnergy || 0) < 100 || !this.canMomoSkill() || typeof this.onMomoSkill !== 'function') return false;
    this._momoCasting = true;
    let used;
    try { used = this.onMomoSkill() === true; }
    finally { this._momoCasting = false; }
    if (!used) { this.syncMomoSkill(); return false; }
    this.momoEnergy = 0;
    this.momoSkillsUsed = (this.momoSkillsUsed || 0) + 1;
    this.syncMomoSkill();
    audio.sfx('fanfare');
    if (this.momo?.root) {
      this.stopMomoCheer();
      const mp = new THREE.Vector3();
      this.momo.root.getWorldPosition(mp);
      fx.hearts(this.scene, mp.clone().add(new THREE.Vector3(0, 1.4, 0)), 6);
      fx.sparkle(this.scene, mp.clone().add(new THREE.Vector3(0, 1.0, 0)), 12, ['#ffd76a', '#ff9fbd', '#ffffff']);
      const y0 = this.momo.root.position.y;
      this._momoHomeY = y0;
      this._momoCheer = this.tween({ dur: 0.55, update: (k) => { if (this.momo?.root) this.momo.root.position.y = y0 + Math.sin(k * Math.PI) * 0.55; }, done: () => { if (this.momo?.root) this.momo.root.position.y = y0; this._momoCheer = null; } });
    }
    return true;
  }
  stopMomoCheer() {
    if (!this._momoCheer) return;
    this._momoCheer.stop();
    this.tweens.delete(this._momoCheer);
    this._momoCheer = null;
    if (this.momo?.root) this.momo.root.position.y = this._momoHomeY;
  }
  syncGoalProgress() {
    if (!this.goalEl || this.endless || !this.starAt?.length) return;
    const s = this.starAt.filter((t) => this.score >= t).length;
    if (this.goalStarsEl) {
      this.goalStarsEl.textContent = '★'.repeat(s) + '☆'.repeat(Math.max(0, 3 - s));
    }
    if (s > (this._reachedStars || 0)) {
      this._reachedStars = s;
      if (this.playing) audio.sfx('good');
    }
    if (this.goalLabelEl && this.goalNumEl) {
      if (s === 0) {
        this.goalLabelEl.textContent = ' 1★目标 ';
        this.goalNumEl.textContent = fmt(this.starAt[0]);
      } else if (s === 1) {
        this.goalLabelEl.textContent = ' 2★目标 ';
        this.goalNumEl.textContent = fmt(this.starAt[1]);
      } else if (s === 2) {
        this.goalLabelEl.textContent = ' 3★目标 ';
        this.goalNumEl.textContent = fmt(this.starAt[2]);
      } else {
        this.goalLabelEl.textContent = ' 完美达成 ';
        this.goalNumEl.textContent = fmt(this.score);
      }
    }
    this.goalEl.classList.toggle('done', s >= 1);
    this.goalEl.classList.toggle('full', s >= 3);
  }
  addScore(n) {
    if (n > 0 && this.elapsed < (this.goldUntil || 0)) n *= 2;
    if (n > 0 && this.elapsed < (this.rushUntil || 0)) n *= 1.25;
    this.score = Math.max(0, this.score + Math.round(n));
    this.scoreEl.textContent = fmt(this.score);
    if (n > 0) this.addMomoEnergy(Math.min(20, Math.max(7, Math.round(n * 0.45))));
    this.syncGoalProgress();
    const pill = this.scoreEl.parentElement;
    pill.classList.remove('bump');
    void pill.offsetWidth;
    pill.classList.add('bump');
  }
  setCombo(n) {
    if (n === 0 && this.combo > 0 && this.comboGuard > 0) { this.comboGuard--; return; }
    if (n === 0 && this.combo > 0 && this.modifier?.id === 'combo') this.addScore(-10);
    if (n === 0) this.rushUntil = 0;
    this.combo = n;
    this.maxCombo = Math.max(this.maxCombo || 0, n);
    // 连击达到 6 及之后每 6 连击触发 8 秒狂热时刻（Rush Time F2）
    if (n >= 6 && n % 6 === 0 && this.playing) {
      this.rushUntil = (this.elapsed || 0) + 8;
      if (this.rushEl) this.rushEl.classList.remove('hide');
      if (this.nikki?.root) {
        const np = new THREE.Vector3();
        this.nikki.root.getWorldPosition(np);
        fx.sparkle(this.scene, np.add(new THREE.Vector3(0, 1.5, 0)), 10, ['#ffd76a', '#ff9fbd', '#ffffff']);
      }
      try { navigator.vibrate?.(15); } catch (_) { /* 忽略不支持设备 */ }
    } else if (n > 0 && n % 3 === 0) {
      try { navigator.vibrate?.(8); } catch (_) { /* 忽略不支持设备 */ }
    }
    const inRush = this.elapsed < (this.rushUntil || 0);
    if (this.rushEl) this.rushEl.classList.toggle('hide', !inRush);
    if (this.hudEl) this.hudEl.classList.toggle('rush-on', inRush);
    this.comboEl.textContent = `连击 ×${n}`;
    this.comboEl.classList.toggle('zero', n < 2);
    this.comboEl.classList.remove('pop');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('pop');
  }
  floatAt(v3, text, cls = 'coin') {
    const p = app.project(v3, this.camera);
    ui.float({ sx: p.x, sy: p.y, text, cls });
  }

  async countdown() {
    for (const t of ['3', '2', '1']) {
      if (this.dead) return;
      this.countEl.replaceChildren(h('span', {}, t));
      audio.sfx('tick');
      await wait(0.75);
    }
    if (this.dead) return;
    this.countEl.replaceChildren(h('span', { class: 'go' }, '开店啦!'));
    audio.sfx('go');
    this.state = 'play';
    this.syncMomoSkill();
    this.onStart && this.onStart();
    this.bonusIntro.classList.add('out');
    await wait(0.8);
    this.countEl.replaceChildren();
    this.bonusIntro.remove();
  }
  // 由 main 调用：进入场景后开始，返回 'again' | 'exit'
  run() {
    if (this._runPromise) return this._runPromise;
    this._runPromise = new Promise((res) => {
      this.resolve = res;
      const valid = () => !this.dead && app.view === this;
      (async () => {
        for (const id of [this.id, this.endless ? 'endless' : 'levels']) {
          await ui.tutorial(id, false, { valid });
          if (!valid()) { res('exit'); return; }
        }
        // “稍后再看”只跳过本次阅读，照常开局；离开场景则绝不启动旧倒数。
        this.countdown();
      })();
    });
    return this._runPromise;
  }
  onEnter() {
    this.momo?.setCloak?.(S.momoCloak);
    audio.startMusic(this.id);
  }
  onExit() {
    if (this.dead) return;
    ui.tutorials?.cancelView(this);
    this.resume(true);
    this.dead = true;
    this.stopMomoCheer();
    this.resolve?.('exit');
    this.perkChoice?.cancel?.();
    this.cancelDrag?.();
    for (const tw of this.tweens) tw.stop();
    this.tweens.clear();
    this.abort.abort();
    this.hudEl && this.hudEl.remove();
    fx.clearScene(this.scene);
    disposeSceneResources(this.scene);
    this.scene.clear();
    // 让 renderer 放开旧场景的渲染列表；共用的小镇资源保持有效。
    app.renderer.renderLists.dispose();
  }
  update(dt, time) {
    if (this.paused || this.dead) return;
    if (this.state === 'play' && this.endless) {
      this.elapsed += dt;
      const s = Math.floor(this.elapsed);
      this.timerNum.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else if (this.state === 'play') {
      this.elapsed += dt;
      this.time -= dt;
      const k = Math.max(0, this.time / this.duration);
      this.timerFill.style.transform = `scaleX(${k})`;
      this.timerNum.textContent = Math.ceil(Math.max(0, this.time));
      this.timerEl.classList.toggle('low', this.time < 10);
      if (this.time < 10 && Math.ceil(this.time) !== this._lastBeep) { this._lastBeep = Math.ceil(this.time); if (this.time < 5) audio.sfx('tick'); }
      if (this.time <= 0) this.finish();
    }
    const inRush = this.elapsed < (this.rushUntil || 0);
    if (this.rushEl) this.rushEl.classList.toggle('hide', !inRush);
    if (this.hudEl) this.hudEl.classList.toggle('rush-on', inRush);
    this.tick(dt, time);
    this.syncMomoSkill();
    const lh = this.game.liveHooks;
    lh && lh.onGameTick && lh.onGameTick(this, dt);
  }
  tick() {}

  async finish() {
    if (this.state === 'over' || this.paused || this.dead) return;
    this.state = 'over';
    this.stopMomoCheer();
    this.syncMomoSkill();
    const endedAt = Date.now(); // 每日订单按打烊日期归属，不随结算面板停留到次日
    this.onFinish && this.onFinish();
    audio.sfx('bell');
    const st = S.shops[this.id];
    const bonus = this.bonus;
    const mult = shopMult(this.lv);
    const setBonus = this.fx('bloom') + (this.shop.style === 'sweet' ? this.fx('far') : 0) + (this.masteryBonus || 0) + (this.fortuneBonus || 0);
    const total = Math.round(this.score * mult * (1 + bonus.pct / 100) * (1 + setBonus));
    const stars = this.starAt.filter((t) => this.score >= t).length;
    const record = total > st.best && st.plays > 0;
    st.best = Math.max(st.best, total);
    st.plays++;
    // 关卡：拿到一星就算过关，第一次过关有额外奖金；无尽：记录最高营业额和坚持时间
    let firstBonus = 0, canNext = false;
    if (this.endless) {
      st.endBest = Math.max(st.endBest || 0, total);
      st.endTime = Math.max(st.endTime || 0, Math.floor(this.elapsed));
      S.stats.endless_best = Math.max(S.stats.endless_best || 0, total);
    } else if (stars >= 1) {
      stat('stage_clears'); // 每日过关订单允许重打，原 stages 仍只记录首次通关
      st.stars = st.stars || {};
      st.stars[this.stage] = Math.max(st.stars[this.stage] || 0, stars);
      if (this.stage > (st.stage || 0)) { st.stage = this.stage; firstBonus = 30 + this.stage * 20; stat('stages'); }
      canNext = this.stage < MAX_STAGE;
    }
    // 小游戏专属稀有掉落（F5）：二星以上或无尽坚持满60秒有概率掉落应季种子或有机花肥（大吉签提升掉率）
    let rareDrop = null;
    const dropChance = (stars >= 3 ? 0.55 : 0.3) + (this.rareDropBonus || 0);
    if ((stars >= 2 || (this.endless && this.elapsed >= 60)) && Math.random() < dropChance) {
      const drops = {
        cafe: () => { addFertilizer(S); return '有机花肥 ×1'; },
        bakery: () => { S.seeds.wheat = (S.seeds.wheat || 0) + 1; bus.emit('seed', S.seed); return '金穗小麦种子 ×1'; },
        flower: () => { S.seeds.moonflower = (S.seeds.moonflower || 0) + 1; bus.emit('seed', S.seed); return '月见花种子 ×1'; },
        tailor: () => { S.seeds.cotton = (S.seeds.cotton || 0) + 1; bus.emit('seed', S.seed); return '暖绒棉花种子 ×1'; },
        fish: () => { S.seeds.blueberry = (S.seeds.blueberry || 0) + 1; bus.emit('seed', S.seed); return '冰晶蓝莓种子 ×1'; },
      };
      rareDrop = (drops[this.id] || drops.cafe)();
    }
    // 打烊时就把收入、首次奖金和通关统计一起入账；结算面板只负责选择下一步。
    // state 已设为 over，重复 finish 或再次点击结算按钮都不会重复发奖。
    addCoins(total + firstBonus, 'game');
    bus.emit('played', { id: this.id, total, stars, mode: this.mode, stage: this.stage, elapsed: this.elapsed, endedAt });
    stat('play_' + this.id);
    stat('plays');
    if (stars >= 3) { S.stats['star3_' + this.id] = 1; stat('star3'); }
    flushSave();
    await wait(0.9);
    if (this.dead) return;
    this.hudEl.style.opacity = 0;
    this.hudEl.style.transition = 'opacity .3s';
    const titles = this.endless ? ['热身而已', '撑住了一阵', '越战越勇！', '无尽之王！'] : ['差一点就过关了', '过关！', '漂亮的一关！', '完美过关！'];
    const lines = this.resultLines();
    if (this.endless) lines.push(['坚持时间', `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed) % 60).padStart(2, '0')}`]);
    else {
      lines.unshift([`第 ${this.stage} 关目标`, `${fmt(this.starAt[0])}`]);
      if (stars < 3 && this.starAt[stars] > this.score) {
        lines.push([`距 ${stars + 1} 星仅差`, `${fmt(this.starAt[stars] - this.score)} 分`]);
      }
    }
    if (this.masteryLv > 1) lines.push([`工坊熟练 Lv.${this.masteryLv}`, `+${Math.round(this.masteryBonus * 100)}%`]);
    if (this.fortuneBonus > 0) lines.push([`今日吉签 (${this.fortuneLv})`, `+${Math.round(this.fortuneBonus * 100)}%`]);
    if (firstBonus) lines.push(['首次过关奖金', '+' + firstBonus]);
    if (rareDrop) lines.push(['工坊惊喜掉落', rareDrop]);
    const choice = await ui.resultPanel({ title: titles[stars], stars, record, lv: this.lv, mult, bonus, total: total + firstBonus, lines, ribbon: this.endless ? '无尽模式' : `第 ${this.stage} 关`, next: canNext });
    this.resolve(choice);
  }
  resultLines() {
    return [['营业额', fmt(this.score)], ['最高连击', '×' + (this.maxCombo || 0)]];
  }
}
