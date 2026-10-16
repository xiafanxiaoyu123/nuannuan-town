import { audio } from '../core/audio.js';
import { app } from '../core/app.js';
import { S, bus, addCoins } from '../core/state.js';
import { h } from '../core/util.js';
import { PIANO_ROWS, pianoNote } from './piano-data.js';

const TIMBRES = [
  { id: 'piano', label: '🎹 暖木钢琴', osc: 'sine', partials: [[1, 1, 3.8], [2, 0.3, 1.65], [3, 0.11, 0.8], [4, 0.045, 0.32]] },
  { id: 'musicbox', label: '🔔 水晶八音盒', osc: 'sine', partials: [[1, 0.9, 2.5], [3, 0.34, 1.15], [5, 0.15, 0.5], [6, 0.07, 0.25]] },
  { id: 'cloud', label: '☁️ 云朵电钢', osc: 'triangle', partials: [[1, 0.85, 4.1], [2, 0.36, 2.2], [4, 0.09, 0.95]] },
];

const SONGS = [
  { id: 'morning', name: '🌅 小镇的清晨', keys: ['A', 'S', 'D', 'G', 'D', 'S', 'A', 'D', 'G', 'H', 'G', 'D', 'S', 'A'] },
  { id: 'twinkle', name: '✨ 小星星变奏', keys: ['A', 'A', 'G', 'G', 'H', 'H', 'G', 'F', 'F', 'D', 'D', 'S', 'S', 'A'] },
  { id: 'lullaby', name: '🌙 星光摇篮曲', keys: ['D', 'G', 'Q', 'J', 'G', 'D', 'S', 'F', 'H', 'G', 'D', 'A'] },
  { id: 'waltz', name: '🌸 花语圆舞曲', keys: ['A', 'D', 'G', 'Q', 'J', 'H', 'G', 'D', 'F', 'H', 'G', 'S', 'D', 'A'] },
];

// 每个音只有4个渐弱泛音，同时最多16个音；关闭面板/失焦立即回收全部声音节点。
export class PianoVoices {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.output = output;
    this.voices = new Map();
    this.disposed = false;
    this.timbre = 'piano';
  }
  start(note) {
    if (this.disposed || !note) return false;
    this.voices.get(note.code)?.stop();
    if (this.voices.size >= 16) this.voices.values().next().value.stop();
    const ctx = this.ctx, now = ctx.currentTime, envelope = ctx.createGain(), parts = [];
    const preset = TIMBRES.find((t) => t.id === this.timbre) || TIMBRES[0];
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.21, now + 0.006);
    envelope.connect(this.output);
    let finished = 0, stopped = false, released = false;
    const cleanup = () => {
      if (++finished < parts.length) return;
      envelope.disconnect();
      if (this.voices.get(note.code) === voice) this.voices.delete(note.code);
    };
    const voice = {
      note,
      release: () => {
        if (stopped || released) return;
        released = true;
        const t = ctx.currentTime;
        if (envelope.gain.cancelAndHoldAtTime) envelope.gain.cancelAndHoldAtTime(t);
        else { envelope.gain.cancelScheduledValues(t); envelope.gain.setValueAtTime(0.21, t); }
        envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
        for (const { osc } of parts) try { osc.stop(t + 0.22); } catch {}
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        envelope.gain.cancelScheduledValues(ctx.currentTime);
        envelope.gain.setValueAtTime(0, ctx.currentTime);
        for (const { osc, gain } of parts) { try { osc.stop(); } catch {} osc.disconnect(); gain.disconnect(); }
        envelope.disconnect();
        if (this.voices.get(note.code) === voice) this.voices.delete(note.code);
      },
    };
    for (const [harmonic, level, decay] of preset.partials) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = harmonic === 1 ? preset.osc : 'sine';
      osc.frequency.setValueAtTime(note.hz * harmonic, now);
      gain.gain.setValueAtTime(level, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(envelope);
      parts.push({ osc, gain });
      osc.onended = () => { osc.disconnect(); gain.disconnect(); cleanup(); };
    }
    this.voices.set(note.code, voice);
    for (const { osc } of parts) { osc.start(now); osc.stop(now + 4.1); }
    return true;
  }
  release(code) { this.voices.get(code)?.release(); }
  clear() { for (const voice of [...this.voices.values()]) voice.stop(); }
  dispose() { this.clear(); this.disposed = true; }
}

export function openPiano(game, rec, isPresent = () => true) {
  if (game.pianoSession || app.view !== game.town || !['house', 'build'].includes(game.town.zone) || game.busy || game.town.decor.active || game.town.photoOn || !isPresent()) return null;
  const ui = game.ui, town = game.town, wasPaused = audio.musicPaused, musicMode = audio.mode;
  const zone = town.zone;
  audio.init(); audio.pauseMusic(); town.keys.clear(); town.stick.x = town.stick.y = 0; town.moveTo = null;
  const voices = audio.ctx ? new PianoVoices(audio.ctx, audio.sfxBus) : null;
  const abort = new AbortController(), buttons = new Map(), held = new Map(), pointers = new Map(), offs = [];
  let dialog, closed = false, latch = false, space = false, poseTimer, autoTimer = null;
  let currentSong = SONGS[0], stepIdx = 0, timbreIdx = 0;

  const body = h('div', { class: 'piano-player' }, h('div', { class: 'piano-title' }, h('div', {}, h('h2', {}, '小屋钢琴'), h('p', {}, '三排七音 · 支持跟弹曲谱、自动试听与音色切换'))));
  const status = h('p', { class: 'piano-status', 'aria-live': 'polite' }, voices ? '跟着曲谱高亮的琴键弹奏，或自由发挥吧' : '这个浏览器暂不支持音频，请换一个浏览器试试');
  const active = () => !closed && app.view === town && town.zone === zone && isPresent() && body.style.display !== 'none' && !dialog?.box.querySelector('.tutorial-guide');
  const pedal = () => latch || space;

  // 曲谱架与跟弹高亮
  const sheetNotesEl = h('div', { class: 'piano-sheet-notes' });
  const songTabsEl = h('div', { class: 'piano-song-tabs' });
  const stopAuto = () => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (autoBtn) autoBtn.textContent = '🎶 自动试听';
  };
  const syncSheetGuide = () => {
    for (const btn of buttons.values()) btn.classList.remove('guide-next');
    if (!currentSong) { sheetNotesEl.replaceChildren(); return; }
    const targetKey = currentSong.keys[stepIdx];
    if (targetKey) buttons.get('Key' + targetKey)?.classList.add('guide-next');
    sheetNotesEl.replaceChildren(...currentSong.keys.map((k, i) => {
      const n = pianoNote('Key' + k);
      return h('span', { class: 'sheet-note' + (i < stepIdx ? ' done' : i === stepIdx ? ' cur' : '') },
        h('b', {}, k), h('small', {}, n ? String(n.degree) : ''));
    }));
  };
  const selectSong = (song) => {
    stopAuto();
    currentSong = song;
    stepIdx = 0;
    for (const b of songTabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.song === song.id);
    syncSheetGuide();
    status.textContent = `已切换曲谱《${song.name}》，按高亮键 ${song.keys[0]} 开始跟弹`;
  };
  for (const song of SONGS) {
    songTabsEl.append(h('button', { type: 'button', class: 'btn alt sm' + (song.id === currentSong.id ? ' on' : ''), 'data-song': song.id, onclick: () => selectSong(song) }, song.name));
  }
  const autoBtn = h('button', { type: 'button', class: 'btn alt sm', onclick: () => {
    if (!active()) return;
    if (autoTimer) { stopAuto(); status.textContent = '已停止自动试听，可继续自由弹奏'; return; }
    stepIdx = 0;
    syncSheetGuide();
    autoBtn.textContent = '⏹ 停止试听';
    status.textContent = `正在自动演奏《${currentSong.name}》…`;
    autoTimer = setInterval(() => {
      if (!active()) { stopAuto(); return; }
      const key = currentSong.keys[stepIdx];
      if (!key) { stopAuto(); stepIdx = 0; syncSheetGuide(); return; }
      const code = 'Key' + key;
      press(code, 'auto');
      setTimeout(() => { if (!closed) release(code, 'auto'); }, 320);
    }, 420);
  } }, '🎶 自动试听');

  const timbreBtn = h('button', { type: 'button', class: 'btn alt sm', onclick: () => {
    if (!active()) return;
    timbreIdx = (timbreIdx + 1) % TIMBRES.length;
    const t = TIMBRES[timbreIdx];
    if (voices) voices.timbre = t.id;
    timbreBtn.textContent = t.label;
    status.textContent = `已切换音色：${t.label}`;
  } }, TIMBRES[0].label);

  const sheetStand = h('div', { class: 'piano-sheet card' },
    h('div', { class: 'piano-sheet-head' }, songTabsEl, h('div', { class: 'piano-sheet-tools' }, timbreBtn, autoBtn)),
    sheetNotesEl);

  const refreshPedal = () => {
    sustain.setAttribute('aria-pressed', String(pedal()));
    sustain.textContent = pedal() ? '延音：开' : '延音：关';
    if (!pedal()) for (const code of voices?.voices.keys() || []) if (!held.has(code)) voices.release(code);
  };
  const release = (code, source) => {
    const sources = held.get(code); if (!sources) return;
    sources.delete(source); if (sources.size) return;
    held.delete(code);
    buttons.get(code)?.setAttribute('aria-pressed', 'false');
    if (!pedal()) voices?.release(code);
  };
  const releaseAll = () => {
    stopAuto();
    held.clear(); pointers.clear(); space = false;
    for (const button of buttons.values()) button.setAttribute('aria-pressed', 'false');
    voices?.clear(); refreshPedal(); clearTimeout(poseTimer); town.player.setPose('idle');
  };
  const press = (code, source) => {
    const note = pianoNote(code); if (!note || !active() || !voices) return false;
    if (source !== 'auto' && autoTimer) stopAuto();
    audio.init();
    let sources = held.get(code); if (sources?.has(source)) return false;
    if (!sources) { sources = new Set(); held.set(code, sources); voices.start(note); }
    sources.add(source);
    buttons.get(code)?.setAttribute('aria-pressed', 'true');
    status.textContent = `${note.name} · ${note.solfege} · ${note.hz.toFixed(1)} Hz`;
    if (currentSong && code === 'Key' + currentSong.keys[stepIdx]) {
      stepIdx++;
      if (stepIdx >= currentSong.keys.length) {
        stepIdx = 0;
        const reward = source !== 'auto' && S?.gday !== undefined && S._pianoDay !== S.gday ? 60 : 0;
        if (reward > 0) {
          S._pianoDay = S.gday;
          addCoins(reward);
          ui.refreshAll?.();
        }
        status.textContent = `🎉 完整弹奏《${currentSong.name}》！${reward ? `获得今日演奏打赏 +${reward} 噗灵` : '大喵为你鼓掌！'}`;
        town.player.setPose('cheer');
      } else {
        town.player.setPose('work');
      }
      syncSheetGuide();
    } else {
      town.player.setPose('work');
    }
    clearTimeout(poseTimer);
    poseTimer = setTimeout(() => { if (!closed) town.player.setPose('idle'); }, 260);
    return true;
  };
  const rows = h('div', { class: 'piano-rows' });
  for (const row of PIANO_ROWS) {
    const keys = h('div', { class: 'piano-keys', role: 'group', 'aria-label': row.label });
    for (const note of row.notes) {
      const button = h('button', { class: 'piano-key', 'data-piano-key': note.code, 'aria-label': `${row.label}${note.name}，${note.solfege}，键盘${note.key}`, 'aria-pressed': 'false', type: 'button' },
        h('span', { class: 'piano-degree' }, note.degree), h('span', { class: 'piano-note-name' }, note.name), h('kbd', {}, note.key));
      buttons.set(note.code, button);
      button.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); if (press(note.code, 'pointer:' + e.pointerId)) { pointers.set(e.pointerId, note.code); try { button.setPointerCapture(e.pointerId); } catch {} } });
      const end = (e) => { const code = pointers.get(e.pointerId); if (!code) return; pointers.delete(e.pointerId); release(code, 'pointer:' + e.pointerId); };
      button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end); button.addEventListener('lostpointercapture', end);
      // 键盘焦点下的Enter/空格click也能奏响，避免只支持指针而漏掉辅助输入。
      button.addEventListener('click', (e) => { if (e.detail === 0 && press(note.code, 'accessibility')) release(note.code, 'accessibility'); });
      keys.append(button);
    }
    rows.append(h('section', { class: 'piano-row' }, h('div', { class: 'piano-row-label' }, h('b', {}, row.label), h('span', {}, `C${row.octave}—B${row.octave}`)), keys));
  }
  syncSheetGuide();
  const sustain = h('button', { class: 'btn alt sm', 'data-piano-sustain': '', 'aria-pressed': 'false', onclick: () => { if (!active()) return; latch = !latch; refreshPedal(); } }, '延音：关');
  body.append(sheetStand, rows, status, h('div', { class: 'piano-actions' }, sustain, h('button', { class: 'btn alt sm', 'data-piano-stop': '', onclick: () => { releaseAll(); status.textContent = '声音已停止，随时可以继续弹'; } }, '全部止音'), h('button', { class: 'btn sm', 'data-piano-close': '', onclick: () => dialog.close() }, '离开钢琴')),
    h('p', { class: 'piano-hint' }, '上排 Q W E R T Y U · 中排 A S D F G H J · 下排 Z X C V B N M。跟着金色高亮键可完整弹奏小镇曲目！'));
  const endKey = (e) => { if (e.code === 'Space') { space = false; refreshPedal(); } release(e.code, 'keyboard'); };
  window.addEventListener('keydown', (e) => {
    if (!active() || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    if (e.code !== 'Space' && !pianoNote(e.code)) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
    if (e.code === 'Space') { space = true; refreshPedal(); } else press(e.code, 'keyboard');
  }, { capture: true, signal: abort.signal });
  window.addEventListener('keyup', (e) => { if ((e.code === 'Space' && space) || held.get(e.code)?.has('keyboard')) { endKey(e); if (!closed) { e.preventDefault(); e.stopImmediatePropagation(); } } }, { capture: true, signal: abort.signal });
  window.addEventListener('blur', releaseAll, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); }, { signal: abort.signal });
  const close = () => {
    if (closed) return; closed = true; releaseAll(); voices?.dispose(); abort.abort(); offs.forEach((off) => off()); clearInterval(contextTimer);
    if (game.pianoSession === session) delete game.pianoSession;
    if (!wasPaused && audio.mode === musicMode && !app.suspended) audio.resumeMusic();
  };
  dialog = ui.modal(body, { ribbon: '自由弹奏', cls: 'piano-modal', onClose: close });
  const session = { press, release, releaseAll, close: () => dialog.close(true), voices, body, get held() { return held; }, get closed() { return closed; } };
  game.pianoSession = session;
  for (const event of ['zoneChanged', 'reset', 'decorMode']) offs.push(bus.on(event, () => dialog.close(true)));
  offs.push(bus.on('decorChanged', () => { if (!isPresent()) dialog.close(true); }));
  const contextTimer = setInterval(() => { if (app.view !== town || town.zone !== zone || !isPresent()) dialog.close(true); }, 100);
  return session;
}
