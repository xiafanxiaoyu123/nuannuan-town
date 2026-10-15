import { S, bus, save, flushSave } from '../core/state.js';
import { gameDate, YEAR_DAYS } from '../core/gametime.js';
import { daySeconds, creativeTimePaused } from '../core/preferences.js';
import { SEASONS, seasonForMonth } from '../world/seasons.js';
import { FESTIVALS } from '../live/data.js';
import { app } from '../core/app.js';
import { h } from '../core/util.js';

const index = md => { const [m, d] = md.split('-').map(Number); return (m - 1) * 7 + d - 1; };
export function calendarInfo() {
  const date = gameDate(), day = (date.month - 1) * 7 + date.day - 1;
  const season = seasonForMonth(date.month), order = ['spring', 'summer', 'autumn', 'winter'];
  const nextSeason = order[(order.indexOf(season) + 1) % 4];
  const daysToSeason = (3 - ((date.month - 3 + 12) % 3)) * 7 - date.day + 1;
  let currentFestival = null;
  const festivals = FESTIVALS.map(f => {
    const from = index(f.from), to = index(f.to), active = from <= to ? day >= from && day <= to : day >= from || day <= to;
    const until = (from - day + YEAR_DAYS) % YEAR_DAYS;
    if (active) currentFestival = { ...f, remaining: (to - day + YEAR_DAYS) % YEAR_DAYS + 1 };
    return { ...f, until: until || YEAR_DAYS };
  }).sort((a, b) => a.until - b.until);
  return { date, season, nextSeason, daysToSeason, currentFestival, nextFestival: festivals[0] };
}
export function canSleep(game) {
  const t = game.town;
  const atBed=t.zone==='build'&&!!t.homeInteractions?.bedState;
  return app.view === t && (t.zone === 'house'||atBed) && t.camMode === 'play' && !game.busy && !t.decor.active && !t.photoOn;
}
export function sleepUntilMorning(game) {
  if (!canSleep(game)) return false;
  const t = game.town;
  t.moveTo = null; t.keys.clear(); t.stick.x = t.stick.y = 0;
  S.gday = (S.gday || 0) + 1; S.clock = 0;
  t.applySky(0); t.seasons.refresh(); bus.emit('newDay', S.gday);
  flushSave(); return true;
}
export function calendarPanel(ui) {
  const game = ui.game, body = h('div', { class: 'settings calendar-panel' }, h('h2', {}, '小镇日历与时间'));
  const info = h('div', { class: 'calendar-status', 'aria-live': 'polite' }), duration = h('div', { class: 'seg' });
  const renderDuration = () => duration.replaceChildren(...[[320, '原速'], [640, '悠闲'], [960, '慢生活']].map(([value, label]) => h('button', {
    class: daySeconds() === value ? 'on' : '', 'data-day-seconds': value,
    onclick: () => { S.settings.daySeconds = value; save(); renderDuration(); render(); },
  }, label)));
  const paused = h('button', { class: 'btn alt sm', 'data-pause-creative': '', onclick: () => {
    S.settings.pauseCreativeTime = !creativeTimePaused(); save(); renderPause();
  } });
  const renderPause = () => { paused.textContent = '装修 / 拍照暂停时间：' + (creativeTimePaused() ? '开' : '关'); paused.setAttribute('aria-pressed', String(creativeTimePaused())); };
  let modal, sleeping = false;
  const sleep = h('button', { class: 'btn gold', 'data-sleep': '', onclick: async () => {
    if (sleeping) return;
    if (!canSleep(game)) return ui.toast('回暖暖自己的屋里，完成装修并退出拍照后才能休息');
    sleeping = true; sleep.disabled = true;
    const yes = await ui.confirm('休息到明早', '小镇日历会前进一天。作物、现实每日订单、签到和诺诺伊亲密互动不会因此加速或刷新。', '睡到明早');
    sleeping = false;
    if (yes && sleepUntilMorning(game)) { modal.close(true); ui.toast(`早上好！小镇来到了 ${gameDate().text}`); }
    else render();
  } }, '睡到明早');
  const render = () => {
    const c = calendarInfo(), now = new Date(), midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const minutes = Math.max(1, Math.ceil((midnight - now) / 60000)), seconds = daySeconds();
    info.replaceChildren(h('p', { class: 'res-note' }, `小镇第 ${c.date.year} 年 · ${SEASONS[c.season].name}季 · ${c.date.text}`),
      h('p', {}, `距离${SEASONS[c.nextSeason].name}季还有 ${c.daysToSeason} 个小镇日。每月 7 天，每季 21 天。`),
      h('p', {}, c.currentFestival ? `${c.currentFestival.name}进行中，还剩 ${c.currentFestival.remaining} 个小镇日（含今天）。` : `下个节日：${c.nextFestival.name}，还有 ${c.nextFestival.until} 个小镇日。`),
      h('p', {}, `当前一个小镇日约 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒，在小镇游玩时推进；清晨 5 点换日。`),
      h('p', { class: 'fine' }, `现实每日订单、签到与诺诺伊亲密互动：设备本地零点刷新，约还有 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟。居民日常与节日按小镇日历，作物按实际经过的时间生长。`));
    sleep.disabled = sleeping || !canSleep(game);
  };
  body.append(info, h('label', {}, '昼夜节奏', duration), h('div', { class: 'row', style: { marginTop: '1rem', flexWrap: 'wrap' } }, paused),
    h('h3', {}, '回家休息'), h('p', { class: 'fine' }, '在暖暖自己的屋内可休息到次日清晨。时间设置和睡觉不会改变现实计时的活动。'), sleep);
  renderDuration(); renderPause(); render(); const timer = setInterval(render, 1000);
  modal = ui.modal(body, { ribbon: '按自己的节奏生活', cls: 'live-modal', onClose: () => clearInterval(timer) });
  return modal;
}
