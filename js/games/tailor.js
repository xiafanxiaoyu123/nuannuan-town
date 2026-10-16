// 星梦裁缝铺：四列布料在透视平面上由远到近送入针脚线；沿用原音乐与判定时钟。
import { THREE, cbox, box, frustum, group } from '../core/kit.js';
import { MiniGame } from './common.js';
import { S } from '../core/state.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, tween, popIn, seeded } from '../core/util.js';

import { TAILOR_LANES, tailorKeyLane, fourLaneChart } from './tailor-lanes.js';

import { FABRIC, LANE_X, buildTailorStage, createStageNote, renderStageNote, animateTailorStage, fitTailorCamera, projectTailorInput, disposeTailorNotes } from './tailor-stage.js';
const LANE_COL = TAILOR_LANES.map(lane => lane.color);
const NOTE_EXIT_DELAY = 3 / 5.2; // 沿用旧谱面越过判定后的回收时机
const LEAD = 2.3; // 提前出现的秒数
const TEMPLATES = [
  [[0, 4], [0, 4], [0, 2, 4], [0, 4, 6]],
  [[0, 2, 4, 6], [0, 4, 6], [0, 2, 4], [0, 3, 4, 6]],
  [[0, 2, 4, 6], [0, 2, 4, 5, 6], [0, 3, 4, 6], [0, 1, 2, 4, 6]],
  [[0, 2, 3, 4, 6], [0, 2, 4, 5, 6], [0, 1, 2, 4, 6, 7], [0, 2, 3, 4, 6, 7]],
];

function buttonNote() {
  return h('div', { class: 'tailor-note', 'aria-hidden': 'true' }, h('i', { class: 'tailor-thread' }), h('b', { class: 'tailor-button' }));
}

export class TailorGame extends MiniGame {
  constructor(game) {
    super(game, 'tailor', { duration: 62, stars: [0, 0, 0], lives: 8 });
    if (this.endless) this.duration = this.time = 420; // 无尽：谱面一直排下去，断线 8 次打烊
    this.notes = [];
    this.stats = { perfect: 0, good: 0, miss: 0 };
    this.garments = 0;
    this.sewn = 0;
    this.holding = TAILOR_LANES.map(() => null);
    this.heldKeys = new Set();
    this.heldPointers = new Map();
    this.pointerTargets = new Map();
    this.heldTouches = new Map();
    this.awaitHoldResume = false;
    this.refAspect = 1.75;
    this.build();
    this.mount();
  }

  build() {
    buildTailorStage(this);
    this.pool = TAILOR_LANES.map(() => []);
  }

  mount() {
    this.judgeEl = h('div', { class: 'judge' });
    this.bigCombo = h('div', { class: 'bigcombo', style: { opacity: 0 } }, h('b', {}, '0'), h('span', {}, 'COMBO'));
    this.keyEls = TAILOR_LANES.map((lane, i) => h('button', {
      class: 'lanekey', style: { '--c': lane.color, '--lane-pressed': lane.color + '66' }, 'data-tailor-key': i, 'aria-label': `${lane.name}轨道 ${lane.key}`,
    }, h('i'), h('span', { class: 'kbd' }, lane.key), h('span', { class: 'lane-name' }, lane.name)));
    this.laneEls = TAILOR_LANES.map((lane, i) => h('div', {
      class: 'tailor-lane', style: { '--c': lane.color, '--lane-bg': lane.color + '33', '--lane-pressed': lane.color + '66' }, 'data-tailor-lane': i, 'aria-label': `${lane.name}布料谱道`,
    }));
    this.laneField = h('div', { class: 'tailor-lanes' }, ...this.laneEls,
      h('div', { class: 'tailor-judge-line', 'aria-hidden': 'true' }, h('span', {}, '针脚判定线')));
    this.pauseBtn = h('button', { class: 'tailor-pause', 'data-tailor-pause': '', onclick: () => {
      if (this.playing) { this.manualPause = true; this.pause(); }
      else if (this.paused && this.manualPause) this.resume();
    } }, '暂停');
    this.board = h('div', { class: 'tailor-board' },
      h('div', { class: 'tailor-board-title' }, h('span', {}, '到针圈按下 · 长针脚按住')),
      this.laneField, h('div', { class: 'lanekeys' }, ...this.keyEls), this.pauseBtn);
    this.progFill = h('i');
    this.progNum = h('span', {}, '成衣 0 件');
    this.mountHUD([this.judgeEl, this.bigCombo, this.board]);
    this.hudEl.classList.add('tailor');
    this.comboEl.replaceWith(h('div', { class: 'gprog' }, h('div', {}, this.progFill), this.progNum));
    this.comboEl = h('div');
    // 暂停也记录物理按下/松开，但不进行命中判定；选卡的鼠标不会释放键盘长按
    this.on(window, 'keydown', (e) => this.keyInput(e, true), { whilePaused: true });
    this.on(window, 'keyup', (e) => this.keyInput(e, false), { whilePaused: true });
    // 手机按 Touch.identifier 记每根手指，避免 WebView 的兼容指针/手势取消
    // 把另一根仍按住的手指误当作松开；没有 Touch Events 的设备仍用 pointerId。
    this.touchInput = 'ontouchstart' in window;
    for (const [i, target] of [...this.keyEls, ...this.laneEls].entries()) {
      const lane = () => i % TAILOR_LANES.length;
      this.on(target, 'pointerdown', (e) => {
        if (this.touchInput && e.pointerType === 'touch') return;
        this.pointerDown(lane(e), e);
      }, { whilePaused: true });
      if (this.touchInput) {
        this.on(target, 'touchstart', (e) => this.touchDown(e, lane), { whilePaused: true, passive: false });
        this.on(target, 'touchmove', (e) => {
          if (e.cancelable && [...e.changedTouches].some((t) => this.heldTouches.has(t.identifier))) e.preventDefault();
        }, { whilePaused: true, passive: false });
      }
    }
    this.on(window, 'pointerup', (e) => this.pointerUp(e), { whilePaused: true, capture: true });
    this.on(window, 'pointercancel', (e) => {
      if (this.heldPointers.has(e.pointerId)) this.interruptInputs(() => this.pointerUp(e));
    }, { whilePaused: true, capture: true });
    this.on(window, 'lostpointercapture', (e) => {
      // 只有当前捕获目标失去捕获才处理，不能让其他控件的捕获事件串轨。
      if (this.pointerTargets.get(e.pointerId) === e.target) this.interruptInputs(() => this.pointerUp(e));
    }, { whilePaused: true, capture: true });
    if (this.touchInput) for (const type of ['touchend', 'touchcancel']) {
      this.on(window, type, (e) => {
        if (type === 'touchcancel' && [...e.changedTouches].some((t) => this.heldTouches.has(t.identifier))) this.interruptInputs(() => this.touchUp(e));
        else this.touchUp(e);
      }, { whilePaused: true, passive: false, capture: true });
    }
    this.on(window, 'contextmenu', (e) => e.preventDefault(), { whilePaused: true });
    this.on(window, 'blur', () => this.interruptInputs(), { whilePaused: true });
    this.on(window, 'pagehide', () => this.interruptInputs(), { whilePaused: true });
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.interruptInputs(); }, { whilePaused: true });
    if (typeof ResizeObserver === 'function') {
      this.laneObserver = new ResizeObserver(() => this.measureLanes());
      this.laneObserver.observe(this.board);
    }
    this.measureLanes();
  }
  keyLane(code) {
    return tailorKeyLane(code);
  }
  laneHeld(lane) {
    return [...this.heldKeys].some((code) => this.keyLane(code) === lane) || [...this.heldPointers.values()].includes(lane) || [...this.heldTouches.values()].includes(lane);
  }
  keyInput(e, down) {
    const lane = this.keyLane(e.code);
    if (this.dead || lane < 0 || (down && e.repeat)) return;
    e.preventDefault();
    if (down) { this.heldKeys.add(e.code); this.pressLane(lane); }
    else { this.heldKeys.delete(e.code); if (!this.laneHeld(lane)) this.release(lane); this.refreshLaneInput(lane); }
  }
  pointerDown(lane, e) {
    if (this.dead || e.button > 0 || this.heldPointers.has(e.pointerId)) return;
    e.preventDefault();
    this.heldPointers.set(e.pointerId, lane);
    const target = e.currentTarget;
    try { target.setPointerCapture(e.pointerId); this.pointerTargets.set(e.pointerId, target); } catch (_) { /* 老浏览器 */ }
    this.pressLane(lane);
  }
  pointerUp(e) {
    const lane = this.heldPointers.get(e.pointerId);
    if (lane === undefined) return;
    this.heldPointers.delete(e.pointerId);
    const target = this.pointerTargets.get(e.pointerId);
    this.pointerTargets.delete(e.pointerId);
    try { if (target?.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId); } catch (_) { /* 已取消 */ }
    if (!this.laneHeld(lane)) this.release(lane);
    this.refreshLaneInput(lane);
  }
  touchDown(e, laneForTouch) {
    if (this.dead) return;
    if (e.cancelable) e.preventDefault();
    for (const touch of e.changedTouches) {
      if (this.heldTouches.has(touch.identifier)) continue;
      // 一次触摸批次可能涉及不同按钮；只接管起点属于当前目标的触点。
      if (touch.target && !e.currentTarget.contains(touch.target)) continue;
      const lane = laneForTouch(touch);
      this.heldTouches.set(touch.identifier, lane);
      this.pressLane(lane);
    }
  }
  touchUp(e) {
    const released = new Set();
    for (const touch of e.changedTouches) {
      const lane = this.heldTouches.get(touch.identifier);
      if (lane === undefined) continue;
      this.heldTouches.delete(touch.identifier);
      released.add(lane);
    }
    if (released.size && e.cancelable) e.preventDefault();
    for (const lane of released) { if (!this.laneHeld(lane)) this.release(lane); this.refreshLaneInput(lane); }
  }
  interruptInputs(clear = () => this.clearInputs()) {
    // 系统取消触摸、焦点切走不等于玩家松手。先暂停谱面再清物理状态，
    // 保留长针脚，补回缺少的手指后继续，避免多指手势取消直接扣心。
    const interruptedHold = this.playing && this.holding.some(Boolean);
    if (interruptedHold) this.pause();
    clear();
    // 取消发生后要求重新按下，不能沿用系统可能已经遗失的其他触点。
    if (this.holding.some(Boolean)) this.clearInputs();
    if (interruptedHold) this.resume();
  }
  clearInputs(judge = true) {
    this.heldKeys.clear(); this.heldPointers.clear(); this.heldTouches.clear();
    const targets = [...this.pointerTargets];
    this.pointerTargets.clear();
    for (const [id, target] of targets) {
      try { if (target.hasPointerCapture(id)) target.releasePointerCapture(id); } catch (_) { /* 已取消 */ }
    }
    if (judge) for (let lane = 0; lane < TAILOR_LANES.length; lane++) this.release(lane);
    else this.holding.fill(null);
    for (let lane = 0; lane < TAILOR_LANES.length; lane++) this.refreshLaneInput(lane);
  }
  refreshLaneInput(lane) {
    const held = this.laneHeld(lane);
    this.keyEls[lane].classList.toggle('pressed', held);
    this.laneEls[lane].classList.toggle('pressed', held);
  }
  pressLane(lane) {
    this.refreshLaneInput(lane);
    if (this.paused) { if (this.awaitHoldResume) this.resume(); return; }
    this.hit(lane);
  }

  onEnter() {
    this.momo.setCloak(S.momoCloak);
    audio.stopMusic();
  }
  onExit() {
    if (this.dead) return;
    this.laneObserver?.disconnect();
    this.clearInputs(false);
    this.clearNotes();
    disposeTailorNotes(this);
    super.onExit();
  }
  onStart() {
    // 音乐与谱面共用同一条时间轴；记录当前时钟源，防止移动端手势中途解锁 AudioContext 造成时间轴跳变
    audio.stopMusic();
    const info = audio.running ? audio.startMusic('tailor') : null;
    this.stepDur = info ? info.stepDur : 60 / 104 / 2;
    this._clockRunning = audio.running;
    this._clockContext = audio.ctx;
    this._clockWall = performance.now();
    this.t0 = info ? info.start : audio.now() + 0.1;
    this._lastSongTime = (audio.now() - this.t0);
    this.songRate = 1;
    this.makeChart();
  }
  onPause() {
    this.pausedSong = this.songTime();
    this.pauseBtn.textContent = this.manualPause ? '继续' : '暂停中';
    this.pauseBtn.disabled = !this.manualPause;
  }
  onResume(force = false) {
    const need = this.holding.map((n, i) => n && !this.laneHeld(i) ? i : -1).filter((i) => i >= 0);
    if (!force && need.length) {
      this.awaitHoldResume = true;
      if (!this.resumeHint) { this.resumeHint = h('div', { class: 'hold-resume' }); this.hudEl.append(this.resumeHint); }
      this.resumeHint.textContent = '长针脚已暂停，按住' + need.map((i) => TAILOR_LANES[i].name + ' ' + TAILOR_LANES[i].key).join('、') + '轨道继续';
      return false;
    }
    this.awaitHoldResume = false;
    this.manualPause = false;
    this.pauseBtn.textContent = '暂停';
    this.pauseBtn.disabled = false;
    this.resumeHint?.remove(); this.resumeHint = null;
    this._clockRunning = audio.running;
    this._clockContext = audio.ctx;
    this._clockWall = performance.now();
    this._lastSongTime = this.pausedSong;
    this.t0 = audio.now() - this.pausedSong / this.songRate;
    if (force) this.clearInputs(false);
    return true;
  }
  songTime() {
    if (this.paused) return this.pausedSong;
    const wall = performance.now();
    if (this._clockRunning !== undefined && (audio.running !== this._clockRunning || audio.ctx !== this._clockContext)) {
      const elapsed = Math.max(0, wall - this._clockWall) / 1000;
      this._clockRunning = audio.running;
      this._clockContext = audio.ctx;
      this.t0 = audio.now() - ((this._lastSongTime || 0) / (this.songRate || 1) + elapsed);
    }
    const cur = (audio.now() - this.t0) * this.songRate;
    this._lastSongTime = cur;
    this._clockWall = wall;
    return cur;
  }
  setRhythmRate(rate) {
    const at = this.songTime();
    this.songRate = rate;
    this._clockRunning = audio.running;
    this._clockContext = audio.ctx;
    this._clockWall = performance.now();
    this._lastSongTime = at;
    this.t0 = audio.now() - at / rate;
    audio.setMusicRate(rate);
  }
  get hitWindow() { return 0.27 * Math.pow(1.25, this.perks.wide || 0); }
  get perfectWindow() { return 0.1 * Math.pow(1.25, this.perks.wide || 0) * (1 + this.fx('strings')); }
  makeChart() {
    const seed = Math.floor(Math.random() * 1e6);
    const tier = Math.min(3, Math.floor((this.lv - 1) * 0.6) + (this.endless ? 0 : Math.floor((this.stage - 1) / 4)));
    const bars = Math.floor((this.duration - 5) / (this.stepDur * 8));
    const make = (long) => {
      const rnd = seeded(seed), busy = [0, 0], chart = [];
      let lane = 0;
      for (let b = 1; b < bars; b++) {
        const prog = b / bars;
        const t = Math.min(3, Math.max(0, tier + (this.endless ? Math.floor(prog * 8) : prog > 0.55 ? 1 : 0) - (b < 3 ? 1 : 0)));
        const tpl = TEMPLATES[t][Math.floor(rnd() * 4)];
        for (const s of tpl) {
          if (rnd() < 0.62) lane = 1 - lane;
          const time = (b * 8 + s) * this.stepDur;
          if (time < busy[lane]) lane = 1 - lane;
          if (time < busy[lane]) continue;
          // 长针脚日只改长按概率；忙碌轨道的避让仍沿用原规则
          const hold = b > 2 && s <= 4 && rnd() < (0.1 + tier * 0.025) * (long ? 2 : 1) ? (rnd() < 0.5 ? 3 : 4) : 0;
          chart.push({ time, lane, dur: hold * this.stepDur });
          if (hold) busy[lane] = time + (hold + 1) * this.stepDur;
          if (this.lv >= 2 && s === 0 && time >= busy[1 - lane] && rnd() < 0.08 + tier * 0.045) chart.push({ time, lane: 1 - lane, dur: 0 });
        }
      }
      return chart;
    };
    const base = make(false); // 星级门槛始终取同种子的普通谱，不随特殊规则上调
    this.chart = fourLaneChart(this.modifier?.id === 'long' ? make(true) : base, this.modifier?.id === 'mirror');
    this.total = this.chart.length;
    this.maxScore = base.length * 5 + base.filter((n) => n.dur).length * 6;
    const sk = this.endless ? 0.25 : Math.min(1.3, 0.85 + (this.stage - 1) * 0.04);
    this.starAt = [0.3, 0.5, 0.66].map((r) => Math.round(this.maxScore * Math.min(0.96, r * sk)));
    if (this.goalEl) this.goalEl.lastChild.textContent = this.starAt[0];
    this.ci = 0;
  }
  // 输入梯形来自真实布面投影；音符仍按原来的歌曲时钟线性前进。
  measureLanes() {
    if (!this.laneField?.isConnected || this.dead) return;
    const stage = this.board.getBoundingClientRect();
    fitTailorCamera(this, stage.width, stage.height);
    projectTailorInput(this, stage.width, stage.height);
    this.noteSpeed = (this.judgeY - this.noteSize / 2) / LEAD;
    if (this.chart) this.renderNotes(this.songTime());
  }
  onResize() { this.measureLanes(); }
  clearNotes() {
    for (const n of this.notes) n.el.remove();
    this.notes.length = 0;
    this.noteGroup.clear();
    for (const pool of this.pool) pool.length = 0;
  }
  spawnNote(n) {
    const el = this.pool[n.lane].pop() || buttonNote();
    el.className = 'tailor-note';
    el.style.opacity = '';
    el.dataset.lane = n.lane;
    el.stageNote ||= createStageNote(this, n.lane);
    const note = { ...n, el, visual: el.stageNote, thread: el.firstChild, state: 'fly', fade: 1 };
    this.laneEls[n.lane].append(el);
    this.notes.push(note);
    this.renderNote(note, this.songTime());
  }
  renderNote(n, time) {
    const holding = n.state === 'hold';
    const y = holding ? this.judgeY : this.judgeY + (time - n.time) * this.noteSpeed;
    n.el.style.transform = `translate3d(0,${(y - this.noteSize / 2).toFixed(2)}px,0)`;
    n.el.classList.toggle('hold', holding);
    n.el.classList.toggle('sewn', n.state === 'sewn');
    const remaining = holding ? Math.max(0, n.time + n.dur - time) : n.dur;
    const tailLength = Math.max(0, Math.min(y, remaining * this.noteSpeed));
    n.thread.style.height = tailLength.toFixed(2) + 'px';
    renderStageNote(this, n, y, tailLength);
    n.thread.hidden = !n.dur;
    if (n.state === 'miss') n.el.style.opacity = String(n.fade);
  }
  renderNotes(time) { for (const n of this.notes) this.renderNote(n, time); }

  stitchPoint(lane, above) {
    return this.workstation.localToWorld(new THREE.Vector3(LANE_X[lane], FABRIC.y + above, FABRIC.judgeZ));
  }

  hit(lane) {
    if (!this.playing) return;
    const kEl = this.keyEls[lane];
    kEl.classList.add('hit');
    setTimeout(() => kEl.classList.remove('hit'), 90);
    this.needles[lane].k = 1;
    if (this.holding[lane]) return;
    const t = this.songTime();
    let best = null, bd = this.hitWindow;
    for (const n of this.notes) {
      if (n.state !== 'fly' || n.lane !== lane) continue;
      const d = Math.abs(n.time - t);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) { audio.sfx('step'); return; }
    const perfect = bd < this.perfectWindow;
    best.state = best.dur ? 'hold' : 'sewn';
    if (best.dur) this.holding[lane] = best;
    this.sewn++;
    this.stats[perfect ? 'perfect' : 'good']++;
    this.setCombo(this.combo + 1);
    const points = (perfect ? 5 : 3) + Math.min(3 + this.fx('ballet'), Math.floor(this.combo / 10));
    this.addScore(this.modifier?.id === 'strict' ? (perfect ? points * 1.6 : 0) : points);
    audio.sfx(perfect ? 'perfect' : 'good');
    this.judge(perfect ? 'Perfect!' : 'Good', perfect ? '#f0679a' : '#6fcf9f');
    const p = this.stitchPoint(lane, 0.4);
    fx.sparkle(this.scene, p, perfect ? 9 : 4, [LANE_COL[lane], '#ffffff', '#fff3a8']);
    this.renderNote(best, t);
    const ring = this.rings[lane];
    tween({ dur: 0.25, update: (k) => ring.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.3) });
    // 每缝 14 颗纽扣完成一件成衣
    const per = 14;
    this.progFill.style.width = ((this.sewn % per) / per) * 100 + '%';
    if (this.sewn % per === 0) this.finishGarment();
  }
  // 长针脚：松手时没走完就断线
  release(lane) {
    if (this.paused) { if (this.awaitHoldResume) this.resume(); return; }
    const n = this.holding[lane];
    if (!n || !this.playing) return;
    this.endHold(n, this.songTime() >= n.time + n.dur - 0.22);
  }
  endHold(n, ok) {
    if (!this.playing) return;
    this.holding[n.lane] = null;
    if (ok) {
      n.state = 'sewn';
      const points = 6 + Math.min(3 + this.fx('ballet'), Math.floor(this.combo / 10));
      this.addScore(this.modifier?.id === 'strict' ? points * 1.6 : points);
      if (this.modifier?.id === 'long') this.addScore(8);
      this.setCombo(this.combo + 1);
      this.stats.perfect++;
      audio.sfx('perfect');
      this.judge('长针脚!', '#a58bea');
      fx.sparkle(this.scene, this.stitchPoint(n.lane, 0.4), 10, [LANE_COL[n.lane], '#ffffff', '#fff3a8']);
    } else {
      n.state = 'miss';
      this.stats.miss++;
      this.loseLife();
      this.setCombo(0);
      audio.sfx('miss');
      this.judge('断线了', '#9a8290');
    }
  }
  finishGarment() {
    const i = this.garments++;
    this.progNum.textContent = `成衣 ${this.garments} 件`;
    const cols = ['#ff9fbd', '#b9a4f2', '#9fe0c5', '#ffe27a', '#8fd0f5', '#ffc9a8'];
    const g = group(-3.9 + (i % 9) * 0.97, -0.05, 0.1);
    const c = cols[i % cols.length];
    g.add(cbox(0.5, 0.05, 0.05, '#b3855f', 0, 0, 0, { r: 0.02 }));
    g.add(box(0.5, 0.42, 0.2, c, 0, -0.5, 0, { r: 0.07 }));
    g.add(frustum(0.5, 0.86, 0.5, c, 0, -1.0, 0, { sz: 0.4 }));
    g.add(cbox(0.14, 0.1, 0.06, '#ffffff', 0, -0.2, 0.11, { r: 0.03 }));
    this.rack.add(g);
    popIn(g, 0.5);
    audio.sfx('success');
    this.momoJump = 0.6;
    fx.confetti(this.scene, new THREE.Vector3(g.position.x, 3.4, -6.5), 14);
    this.judge('成衣完成!', '#a58bea');
  }
  judge(text, color) {
    const el = this.judgeEl;
    el.textContent = text;
    el.style.setProperty('--c', color);
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  setCombo(n) {
    super.setCombo(n);
    n = this.combo;
    if (!this.bigCombo) return;
    this.bigCombo.style.opacity = n >= 3 ? 1 : 0;
    this.bigCombo.firstChild.textContent = n;
    this.bigCombo.classList.remove('pop');
    void this.bigCombo.offsetWidth;
    this.bigCombo.classList.add('pop');
  }
  onFinish() {
    this.clearInputs(false);
    this.pauseBtn.disabled = true;
    this.nikki.setPose('cheer');
    audio.stopMusic();
  }
  resultLines() {
    const all = this.total + (this.chart ? this.chart.filter((n) => n.dur).length : 0);
    const acc = all ? Math.round(((this.stats.perfect + this.stats.good * 0.6) / all) * 100) : 0;
    return [['营业额', this.score], ['Perfect / Good / Miss', `${this.stats.perfect} / ${this.stats.good} / ${this.stats.miss}`], ['完成成衣', `${this.garments} 件 · 准确率 ${acc}%`], ['最高连击', '×' + (this.maxCombo || 0)]];
  }

  tick(dt, time) {
    this.nikki.update(dt);
    this.momo.update(dt);
    if (this.momoJump > 0) { this.momoJump -= dt; this.momo.root.position.y = this.momoBaseY + Math.abs(Math.sin(this.momoJump * 10)) * 0.5; }
    const st = this.state === 'play' && this.chart ? this.songTime() : null;
    const flow = st !== null ? st : time;
    const beat = st !== null ? (st / (this.stepDur * 2)) % 1 : 0;
    const pulse = st !== null ? Math.max(0, 1 - beat * 3) : 0;
    this.momo.body.position.y = pulse * 0.12;
    animateTailorStage(this, dt, flow, pulse);
    if (st === null) return;
    if (this.endless && this.state === 'play' && this.chart.length && this.ci >= this.chart.length && st > this.chart[this.chart.length - 1].time + 3) { this.finish(); return; } // 无尽谱面排完了
    while (this.ci < this.chart.length && this.chart[this.ci].time - st < LEAD + 0.1) this.spawnNote(this.chart[this.ci++]);
    for (let i = this.notes.length - 1; i >= 0; i--) {
      // 最后一颗爱心用完会立即结算；同帧剩余音符不能继续记 Miss。
      if (!this.playing) break;
      const n = this.notes[i];
      if (n.state === 'fly') {
        if (st - n.time > this.hitWindow) {
          n.state = 'miss';
          this.stats.miss++;
          this.loseLife();
          this.setCombo(0);
          audio.sfx('miss');
          this.judge('Miss', '#9a8290');
        }
      } else if (n.state === 'miss') {
        n.fade = Math.max(0.01, n.fade - dt * 3);
      } else if (n.state === 'hold') {
        this.needles[n.lane].k = 1;
        if (st >= n.time + n.dur) this.endHold(n, true);
        else if (Math.random() < dt * 12) fx.burst(this.scene, this.stitchPoint(n.lane, 0.3), { n: 1, colors: [LANE_COL[n.lane], '#ffffff'], speed: 1, up: 2, life: 0.4, size: 0.5 });
      }
      this.renderNote(n, st);
      if (st > n.time + (n.dur || 0) + NOTE_EXIT_DELAY || (n.state === 'miss' && n.fade <= 0.02)) {
        n.el.remove();
        n.visual.root.visible = false;
        this.pool[n.lane].push(n.el);
        this.notes.splice(i, 1);
      }
    }
    // 谱面结束后提前收工
    if (this.ci >= this.chart.length && !this.notes.length && this.time > 1.5) this.time = 1.5;
  }
}
