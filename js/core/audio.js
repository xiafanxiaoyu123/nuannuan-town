// 程序化音频：所有音效与背景音乐都由 WebAudio 实时合成，不依赖任何音频文件
import { seeded } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 和弦进行（低音, 和弦音）与五声音阶旋律池
const PROG = {
  town: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [41, [57, 60, 65, 69]], [43, [59, 62, 67, 69]]],
  cafe: [[41, [57, 60, 65, 69]], [43, [59, 62, 67, 71]], [40, [59, 64, 67, 71]], [45, [57, 60, 64, 69]]],
  flower: [[43, [59, 62, 67, 71]], [40, [59, 64, 67, 71]], [36, [60, 64, 67, 72]], [38, [57, 62, 66, 69]]],
  tailor: [[45, [57, 60, 64, 69]], [41, [57, 60, 65, 69]], [36, [60, 64, 67, 72]], [43, [59, 62, 67, 71]]],
  dress: [[36, [60, 64, 67, 71]], [41, [57, 60, 65, 69]], [38, [57, 62, 65, 69]], [43, [59, 62, 67, 71]]],
};
const MODES = {
  town: { bpm: 88, seed: 7, density: 0.42, drums: 0, scale: [72, 74, 76, 79, 81, 84, 86] },
  dress: { bpm: 96, seed: 21, density: 0.5, drums: 1, scale: [72, 74, 76, 79, 81, 84, 88] },
  cafe: { bpm: 112, seed: 3, density: 0.55, drums: 2, scale: [72, 74, 77, 79, 81, 84, 86] },
  flower: { bpm: 100, seed: 11, density: 0.5, drums: 1, scale: [71, 74, 76, 79, 81, 83, 86] },
  tailor: { bpm: 104, seed: 5, density: 0.6, drums: 2, scale: [72, 76, 79, 81, 84, 88] },
};

// 七弦的短演出使用本作自制旋律，不加载官方音频
PROG.resident_qi = [[45, [60, 64, 69]], [41, [60, 65, 69]], [43, [59, 62, 67]], [48, [60, 64, 67]]];
MODES.resident_qi = { bpm: 80, seed: 103, density: 0.8, drums: 0, scale: [72, 74, 76, 79, 81, 84, 86] };
PROG.bakery = [[48, [60, 64, 67, 72]], [43, [59, 62, 67, 71]], [45, [60, 64, 69, 72]], [41, [57, 60, 65, 69]]];
MODES.bakery = { bpm: 108, seed: 47, density: 0.58, drums: 1, scale: [72, 74, 76, 79, 81, 84, 88] };
PROG.fish = PROG.town;
MODES.fish = { bpm: 80, seed: 31, density: 0.36, drums: 0, scale: [72, 74, 76, 79, 81, 84, 86] };

class AudioSys {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.mode = null;
    this.timer = null;
    this.musicNodes = new Set();
    this.musicPaused = false;
  }
  // Touch pointerdown is not a user activation on every mobile WebView. Keep
  // retries on completed gestures so one refused first attempt cannot mute the
  // rest of the session. These listeners never change the player's volumes.
  installRecovery() {
    if (this.recoveryInstalled) return;
    this.recoveryInstalled = true;
    const gesture = (event) => { if (event.isTrusted) this.init(); };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, gesture, { capture: true, passive: true });
    }
    const foreground = () => { if (!document.hidden && this.ctx) this.init(); };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('pageshow', foreground);
    window.addEventListener('nuannuan:app-resume', foreground);
  }
  init() {
    this.installRecovery();
    const wasPaused = this.musicPaused;
    if (this.ctx?.state === 'closed') {
      this.stopMusic();
      this.ctx = null;
    }
    if (this.ctx) {
      return this.resumeContext();
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    let ctx;
    try { ctx = this.ctx = new AC(); }
    catch (error) { this.lastError = String(error?.message || error); return Promise.resolve(false); }
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    // 回声，给旋律一点空间感
    const dl = ctx.createDelay(1);
    dl.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    dl.connect(lp).connect(fb).connect(dl);
    lp.connect(this.music);
    this.echo = dl;
    // 噪声
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    if (this.pendingMode) {
      this.startMusic(this.pendingMode);
      if (wasPaused) this.pauseMusic();
    }
    // Also resume newly-created contexts: some Android WebViews start them
    // suspended even when the first call happens inside a pointer handler.
    return this.resumeContext();
  }
  resumeContext() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    // Do not cache a pending resume promise. Autoplay may leave it pending
    // until a later valid gesture, which must be able to invoke resume again.
    try {
      return Promise.resolve(ctx.resume()).then(() => {
        this.lastError = '';
        return ctx === this.ctx && ctx.state === 'running';
      }).catch(error => { this.lastError = String(error?.message || error); return false; });
    } catch (error) { this.lastError = String(error?.message || error); return Promise.resolve(false); }
  }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  now() { return this.running ? this.ctx.currentTime : performance.now() / 1000; }
  setVolumes(music, sfx) {
    const volume = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
    this.musicVol = music = volume(music, this.musicVol);
    this.sfxVol = sfx = volume(sfx, this.sfxVol);
    if (this.ctx && this.ctx.state !== 'closed') {
      const at = this.ctx.currentTime;
      const set = (gain, value) => {
        gain.cancelScheduledValues(at);
        // Zero is an explicit mute, including while the audio clock is
        // suspended. Do not leave a fading automation tail to resume later.
        if (value === 0) gain.setValueAtTime(0, at);
        else gain.setTargetAtTime(value, at, 0.05);
      };
      set(this.music.gain, this.musicPaused ? 0 : music * 0.5);
      set(this.sfxBus.gain, sfx);
    }
  }

  tone({ f = 440, f2, type = 'sine', t = 0, dur = 0.2, vol = 0.2, attack = 0.005, out, echo = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime, t || ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out || this.sfxBus);
    if (echo) {
      const e = ctx.createGain();
      e.gain.value = echo;
      g.connect(e).connect(this.echo);
    }
    if (out === this.music) { this.musicNodes.add(o); o.onended = () => this.musicNodes.delete(o); }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  noise({ t = 0, dur = 0.08, vol = 0.1, hp = 5000, lp, out }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime, t || ctx.currentTime);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = lp ? 'lowpass' : 'highpass';
    f.frequency.value = lp || hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(out || this.sfxBus);
    if (out === this.music) { this.musicNodes.add(s); s.onended = () => this.musicNodes.delete(s); }
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  sfx(name, p = 0) {
    if (!this.running) { this.init(); return; }
    const c = this.ctx.currentTime;
    const T = (o) => this.tone(o);
    switch (name) {
      case 'click': T({ f: 660, f2: 880, dur: 0.07, vol: 0.12, type: 'triangle' }); break;
      case 'tab': T({ f: 520, f2: 700, dur: 0.06, vol: 0.08, type: 'triangle' }); break;
      case 'pop': T({ f: 420 + p * 60, f2: 900 + p * 60, dur: 0.1, vol: 0.16 }); break;
      case 'coin':
        T({ f: 1318, dur: 0.09, vol: 0.12, type: 'triangle' });
        T({ f: 1760, t: c + 0.07, dur: 0.22, vol: 0.12, type: 'triangle' });
        break;
      case 'buy':
        [988, 1318, 1568, 1976].forEach((f, i) => T({ f, t: c + i * 0.06, dur: 0.2, vol: 0.11, type: 'triangle' }));
        break;
      case 'success':
        [784, 988, 1175, 1568].forEach((f, i) => T({ f, t: c + i * 0.08, dur: 0.3, vol: 0.13, type: 'triangle' }));
        break;
      case 'fanfare':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => T({ f, t: c + i * 0.11, dur: i === 6 ? 0.7 : 0.22, vol: 0.14, type: 'triangle' }));
        [262, 330, 392].forEach((f) => T({ f, t: c + 0.66, dur: 0.9, vol: 0.07 }));
        break;
      case 'fail':
        T({ f: 330, f2: 220, dur: 0.25, vol: 0.14, type: 'triangle' });
        T({ f: 247, f2: 165, t: c + 0.16, dur: 0.3, vol: 0.12, type: 'triangle' });
        break;
      case 'error': T({ f: 220, f2: 180, dur: 0.14, vol: 0.12, type: 'square' }); break;
      case 'plant':
        this.noise({ dur: 0.12, vol: 0.12, lp: 900 });
        T({ f: 300, f2: 500, dur: 0.12, vol: 0.1 });
        break;
      case 'water':
        for (let i = 0; i < 5; i++) T({ f: 900 + Math.random() * 900, f2: 500, t: c + i * 0.05, dur: 0.09, vol: 0.06 });
        this.noise({ dur: 0.35, vol: 0.04, hp: 3000 });
        break;
      case 'harvest':
        T({ f: 523, f2: 1047, dur: 0.12, vol: 0.14, type: 'triangle' });
        T({ f: 1319, t: c + 0.1, dur: 0.2, vol: 0.1, type: 'triangle' });
        break;
      case 'equip':
        this.noise({ dur: 0.1, vol: 0.05, hp: 4000 });
        T({ f: 880, f2: 1320, dur: 0.14, vol: 0.1, type: 'triangle' });
        break;
      case 'place':
        T({ f: 200, f2: 120, dur: 0.12, vol: 0.2 });
        T({ f: 700, f2: 900, t: c + 0.03, dur: 0.08, vol: 0.07, type: 'triangle' });
        break;
      case 'remove': T({ f: 600, f2: 300, dur: 0.14, vol: 0.1, type: 'triangle' }); break;
      case 'step': this.noise({ dur: 0.04, vol: 0.018, lp: 1400 }); break;
      case 'perfect':
        T({ f: 1568, dur: 0.1, vol: 0.12, type: 'triangle', echo: 0.3 });
        T({ f: 2093, t: c + 0.05, dur: 0.18, vol: 0.1, type: 'triangle' });
        break;
      case 'good': T({ f: 1175, dur: 0.12, vol: 0.1, type: 'triangle' }); break;
      case 'miss': T({ f: 196, f2: 150, dur: 0.16, vol: 0.12, type: 'sawtooth' }); break;
      case 'tick': T({ f: 880, dur: 0.1, vol: 0.14, type: 'triangle' }); break;
      case 'go': T({ f: 1319, dur: 0.4, vol: 0.16, type: 'triangle', echo: 0.3 }); break;
      case 'whoosh': this.noise({ dur: 0.3, vol: 0.06, hp: 1200 }); break;
      case 'serve':
        T({ f: 880, dur: 0.08, vol: 0.12, type: 'triangle' });
        T({ f: 1175, t: c + 0.07, dur: 0.08, vol: 0.12, type: 'triangle' });
        T({ f: 1760, t: c + 0.14, dur: 0.22, vol: 0.12, type: 'triangle' });
        break;
      case 'bell':
        T({ f: 2093, dur: 0.6, vol: 0.08, echo: 0.4 });
        T({ f: 2637, dur: 0.5, vol: 0.05 });
        break;
      case 'quest':
        [659, 784, 1047, 1319].forEach((f, i) => T({ f, t: c + i * 0.09, dur: 0.35, vol: 0.12, type: 'triangle', echo: 0.3 }));
        break;
      case 'meow':
        T({ f: 700, f2: 1100, dur: 0.12, vol: 0.1, type: 'triangle' });
        T({ f: 1100, f2: 600, t: c + 0.12, dur: 0.22, vol: 0.1, type: 'triangle' });
        break;
    }
  }

  // ——— 背景音乐 ———
  startMusic(mode) {
    this.pendingMode = mode;
    if (!this.ctx) return null;
    if (this.mode === mode) return this.info;
    this.stopMusic();
    const M = MODES[mode];
    const rnd = seeded(M.seed);
    this.mode = mode;
    // 4 小节 × 8 个八分音符的旋律动机，循环播放
    const pat = [];
    let last = 2;
    for (let i = 0; i < 64; i++) {
      const strong = i % 4 === 0;
      if (rnd() < (strong ? M.density + 0.3 : M.density * 0.7)) {
        last = Math.max(0, Math.min(M.scale.length - 1, last + Math.round((rnd() - 0.5) * 4)));
        pat.push(last);
      } else pat.push(null);
    }
    const baseStepDur = 60 / M.bpm / 2;
    let stepDur = baseStepDur, rate = 1;
    let start = this.ctx.currentTime + 0.12;
    this.info = { start, stepDur, bpm: M.bpm };
    let step = 0;
    const prog = PROG[mode];
    const sched = () => {
      if (this.musicPaused || !this.running) return;
      const ctx = this.ctx;
      while (start + step * stepDur < ctx.currentTime + 0.25) {
        const t = start + step * stepDur;
        const bar = Math.floor(step / 8) % prog.length;
        const s8 = step % 8;
        const [bass, chord] = prog[bar];
        if (s8 === 0) {
          for (const n of chord) this.tone({ f: mtof(n), t, dur: stepDur * 8.2, vol: 0.028, attack: 0.35, out: this.music });
          this.tone({ f: mtof(bass), t, dur: stepDur * 3.6, vol: 0.11, type: 'triangle', attack: 0.02, out: this.music });
        }
        if (s8 === 4 || (s8 === 6 && bar % 2)) this.tone({ f: mtof(bass + (s8 === 6 ? 7 : 0)), t, dur: stepDur * 1.8, vol: 0.08, type: 'triangle', attack: 0.02, out: this.music });
        // 琶音
        if (s8 % 2 === 1) this.tone({ f: mtof(chord[(s8 >> 1) % chord.length]), t, dur: 0.3, vol: 0.022, type: 'triangle', out: this.music });
        // 旋律（八音盒音色）
        const n = pat[step % 64];
        if (n !== null) {
          const f = mtof(M.scale[n]);
          this.tone({ f, t, dur: 0.5, vol: 0.075, out: this.music, echo: 0.35 });
          this.tone({ f: f * 2, t, dur: 0.16, vol: 0.02, out: this.music });
        }
        if (M.drums >= 1 && s8 % 2 === 1) this.noise({ t, dur: 0.035, vol: 0.022, hp: 7000, out: this.music });
        if (M.drums >= 2) {
          if (s8 % 4 === 0) this.tone({ f: 130, f2: 50, t, dur: 0.16, vol: 0.2, out: this.music });
          if (s8 % 4 === 2) this.noise({ t, dur: 0.09, vol: 0.05, hp: 2500, out: this.music });
        }
        step++;
      }
    };
    this.pauseTrack = () => {
      if (this.musicPaused) return;
      this.musicPaused = true;
      this.musicPausedAt = this.ctx.currentTime;
      clearInterval(this.timer);
      this.timer = null;
      // 撤掉预排的音符；恢复时从暂停位置的下一拍继续，不跳过提前排入的半拍
      step = Math.max(0, Math.ceil((this.musicPausedAt - start) / stepDur));
      this.stopMusicNodes();
      this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    };
    this.rateTrack = (next) => {
      if (next === rate) return;
      const at = this.musicPaused ? this.musicPausedAt : this.ctx.currentTime;
      const phase = (at - start) / stepDur;
      rate = next;
      stepDur = baseStepDur / rate;
      start = at - phase * stepDur;
      this.info.start = start;
      this.info.stepDur = stepDur;
      this.info.bpm = M.bpm * rate;
      step = Math.max(0, Math.ceil(phase));
      this.stopMusicNodes();
      if (!this.musicPaused) sched();
    };
    this.resumeTrack = () => {
      if (!this.musicPaused) return;
      start += this.ctx.currentTime - this.musicPausedAt;
      this.info.start = start;
      this.musicPaused = false;
      this.music.gain.setTargetAtTime(this.musicVol * 0.5, this.ctx.currentTime, 0.01);
      sched();
      this.timer = setInterval(sched, 60);
    };
    sched();
    this.timer = setInterval(sched, 60);
    return this.info;
  }
  pauseMusic() { this.pauseTrack?.(); }
  resumeMusic() { this.resumeContext(); this.resumeTrack?.(); }
  setMusicRate(rate) { if (Number.isFinite(rate) && rate > 0) this.rateTrack?.(rate); }
  stopMusicNodes() {
    for (const node of this.musicNodes) { try { node.stop(); } catch (e) { /* 已结束的音符 */ } }
    this.musicNodes.clear();
  }
  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    this.mode = null;
    this.musicPaused = false;
    this.pauseTrack = this.resumeTrack = this.rateTrack = null;
    this.stopMusicNodes();
    if (this.ctx) this.music.gain.setTargetAtTime(this.musicVol * 0.5, this.ctx.currentTime, 0.01);
  }
}

export const audio = new AudioSys();
