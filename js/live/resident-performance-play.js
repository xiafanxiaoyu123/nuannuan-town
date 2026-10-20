import { h } from '../core/util.js';
import { audio } from '../core/audio.js';
import { npcIco } from '../core/icons.js';
import { app } from '../core/app.js';
import { residentLife } from './residents.js';

const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

// Rendering owns no completion counters: the source-bound resident session keeps
// visible time, the three responses, and the chosen ending together.
export function mountResidentPerformance(host, { token, isCurrent, onFinish, onInvalid }) {
  let disposed = false, paused = false, focused = document.hasFocus(), pending = false;
  let attempted = false, message = '', messageUntil = 0, lastRound = -1, lastBeat = -1;
  let callTimer = 0, answerUntil = 0;
  const current = () => !disposed && isCurrent();
  const visible = () => current() && !paused && focused && !document.hidden && !app.suspended && !app.orientationBlocked && innerWidth >= innerHeight;
  const root = h('section', { class: 'res-performance', 'data-res-performance': '', 'aria-label': '七弦的月下小演出' });
  const portrait = h('img', { src: npcIco('qi'), alt: '七弦' });
  const title = h('strong'), line = h('p', { class: 'res-performance-line' });
  const phrase = h('div', { class: 'res-performance-phrase' }, h('span', { class: 'res-performance-speaker' }, '七弦'), title, line);
  const notes = h('span', { class: 'res-performance-notes', 'aria-hidden': 'true' }, '♪  ♫  ♪');
  const track = h('div', { class: 'res-performance-track', 'aria-hidden': 'true' }, h('span', { class: 'res-performance-window' }));
  const marker = h('i', { class: 'res-performance-marker' }); track.append(marker);
  const progress = h('p', { class: 'res-performance-progress' });
  const status = h('p', { class: 'res-performance-status', role: 'status', 'aria-live': 'polite' });
  const echo = h('button', { type: 'button', class: 'btn res-performance-echo', 'data-performance-echo': '', onclick: () => respond({ type: 'echo' }) }, '轻敲回应');
  const endingArea = h('div', { class: 'res-performance-endings', 'data-performance-endings': '' });
  const saveButton = h('button', { type: 'button', class: 'btn', 'data-performance-finish': '', onclick: complete }, '收好这张诗签');
  const pauseButton = h('button', { type: 'button', class: 'btn alt sm', 'data-performance-pause': '', onclick: () => {
    if (!current() || pending) return;
    paused = !paused; clearTimeout(callTimer); residentLife.tickPerformance(token, { active: false }); render(residentLife.performanceState(token));
  } }, '暂停一会儿');
  const hint = h('p', { class: 'res-note res-performance-help' });
  root.append(h('div', { class: 'res-performance-scene' }, h('div', { class: 'res-performance-portrait' }, portrait, notes), phrase),
    progress, track, echo, endingArea, status, h('div', { class: 'row res-performance-actions' }, saveButton, pauseButton), hint);
  host.append(root);
  let endingsIdentity = '';
  function chime(notesToPlay, answer = false) {
    if (!visible() || !audio.running) return;
    const at = audio.ctx.currentTime;
    notesToPlay.slice(0, 3).forEach((midi, i) => audio.tone({ f: 440 * 2 ** ((midi - 69) / 12), t: at + i * .13, dur: .23, vol: answer ? .055 : .035, type: 'triangle' }));
  }
  function respond(action) {
    if (!visible() || pending) return;
    const before = residentLife.performanceState(token);
    const result = residentLife.respondPerformance(token, action);
    if (!result) return;
    message = result.message || ''; messageUntil = performance.now() + 1500;
    if (action.type === 'echo' && result.accepted) {
      chime(before?.callNotes || [72, 76], true);
      answerUntil = performance.now() + 500;
      root.dataset.answer = String(result.state?.round || 0);
      portrait.animate?.([{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-5px) rotate(-5deg)' }, { transform: 'translateY(0) rotate(0)' }], { duration: 420 });
    }
    render(result.state || residentLife.performanceState(token));
  }
  function complete() {
    if (!visible() || pending) return;
    pending = true; attempted = true; render(residentLife.performanceState(token));
    const result = onFinish();
    if (!current()) return;
    pending = false;
    if (!result?.ok) { message = result?.message || '诗签暂时没有收好，可以再试一次。'; messageUntil = Infinity; }
    render(residentLife.performanceState(token));
  }
  function render(state) {
    if (!current()) return;
    if (!state) { onInvalid(); return; }
    if (audio.mode === 'resident_qi') {
      if (visible() && audio.musicPaused) audio.resumeMusic();
      else if (!visible() && !audio.musicPaused) audio.pauseMusic();
    }
    root.dataset.phase = state.phase; root.dataset.mode = state.mode;
    root.dataset.round = String(state.round); root.dataset.paused = String(!visible());
    root.dataset.accepting = String(state.phase === 'echo' && state.cycleProgress >= state.acceptLow && state.cycleProgress <= state.acceptHigh);
    text(title, state.title || '把今天唱进夜色里');
    text(line, state.phase === 'ending' ? '前三句已经接上了，最后一句交给你。' : state.phase === 'ready' ? state.lines[3] : state.lines[Math.min(2, state.mode === 'listen' ? Math.floor(state.activeMs / 2000) : state.round)] || '晚风正轻轻经过。');
    text(progress, state.mode === 'listen' ? `静静听曲 · ${Math.min(6, Math.floor(state.activeMs / 1000))} / 6 秒` : `共同完成 · ${state.round} / 3 句`);
    const beat = Math.max(0, Math.min(1, state.cycleProgress || 0));
    marker.style.left = `${beat * 100}%`;
    track.style.setProperty('--accept-low', `${state.acceptLow * 100}%`);
    track.style.setProperty('--accept-size', `${(state.acceptHigh - state.acceptLow) * 100}%`);
    const endKey = state.endings.map(e => e.id).join(':');
    if (endingsIdentity !== endKey) {
      endingsIdentity = endKey;
      endingArea.replaceChildren(...state.endings.map(ending => h('button', { type: 'button', class: 'btn alt', 'data-performance-ending': ending.id, onclick: () => respond({ type: 'ending', id: ending.id }) }, ending.text)));
    }
    track.hidden = echo.hidden = state.phase !== 'echo';
    endingArea.hidden = state.phase !== 'ending'; saveButton.hidden = state.phase !== 'ready';
    echo.disabled = !visible() || pending;
    endingArea.querySelectorAll('button').forEach(b => { b.disabled = !visible() || pending; });
    saveButton.disabled = !visible() || pending;
    text(saveButton, pending ? '正在收好…' : attempted && message ? '再试一次 · 收好诗签' : state.replay ? '结束这段夜曲' : '收好这张诗签');
    text(pauseButton, paused ? '继续这段夜曲' : '暂停一会儿');
    text(status, !visible() ? '夜曲暂停了，回来后接着听。' : performance.now() < messageUntil ? message : state.phase === 'echo' ? root.dataset.accepting === 'true' ? '轮到你了，轻敲一下，把这一句接住。' : '先听七弦这一句，光点进入绿色时轻敲。' : state.phase === 'ending' ? '挑一句你想留下的话。' : state.phase === 'ready' ? state.replay ? '今天的诗签已收好，这一遍不改写收藏。' : '你们一起留下的这一页，可以收进诗签册了。' : '不用赶拍，听完这一小段就好。');
    text(hint, state.replay ? '重听不重复发奖，也不会覆盖今天收藏的结尾。' : state.mode === 'echo' ? '绿色整段都能回应，错过就等下一轮。按钮也支持空格或 Enter；声音关闭时照样能玩。' : '离开窗口、切到后台或转为竖屏时暂停。听完整段，收好今天的见闻。');
    notes.style.opacity = visible() && state.phase === 'echo' ? String(.35 + .65 * Math.sin(beat * Math.PI)) : '.35';
    if (visible() && state.phase === 'echo') {
      if (state.round !== lastRound || beat < lastBeat - .5) {
        clearTimeout(callTimer);
        const round = state.round, callNotes = state.callNotes || [72, 76];
        callTimer = setTimeout(() => {
          const live = current() && residentLife.performanceState(token);
          if (live?.phase === 'echo' && live.round === round) chime(callNotes);
        }, Math.max(0, answerUntil - performance.now()));
      }
      lastRound = state.round; lastBeat = beat;
    }
    if (state.phase === 'ready' && state.mode === 'listen' && !attempted && visible()) complete();
  }
  const stop = () => { clearTimeout(callTimer); residentLife.tickPerformance(token, { active: false }); render(residentLife.performanceState(token)); };
  const blur = () => { focused = false; stop(); };
  const focus = () => { focused = document.hasFocus(); stop(); };
  // The landscape gate emits a synthetic blur on portrait entry. Returning to
  // landscape need not emit window focus, so re-read the actual browser focus.
  const resize = () => { focused = document.hasFocus(); stop(); };
  const visibility = () => { if (!document.hidden) focused = document.hasFocus(); stop(); };
  const repeat = e => { if (e.repeat && (e.key === ' ' || e.key === 'Enter')) e.preventDefault(); };
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
  root.addEventListener('keydown', repeat);
  const interval = setInterval(() => {
    if (disposed) return;
    // Some WebViews restore landscape on orientationchange/pageshow without a
    // resize or window-focus event. Actual focus plus the app gates stays valid.
    focused = document.hasFocus();
    const state = residentLife.tickPerformance(token, { active: visible() });
    if (current()) render(state);
  }, 50);
  render(residentLife.performanceState(token));
  return { dispose() {
    if (disposed) return; disposed = true; clearInterval(interval); clearTimeout(callTimer);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
    root.removeEventListener('keydown', repeat); root.querySelectorAll('button').forEach(b => { b.disabled = true; });
  } };
}
