import { h } from '../core/util.js';
import { fishIco, coinIco } from '../core/icons.js';

const note = text => h('p', { class: 'res-note' }, text);

// The selected story is a draft until the player explicitly keeps it with Shi.
export function residentFishingBody(data, { draft, click, render, start, claim, go }) {
  const work = data.fishingJournal, plan = work.plan, claimed = data.state === 'claimed';
  if (draft.planId !== (plan?.id || null)) {
    draft.planId = plan?.id || null; draft.sample = null; draft.editing = false;
  }
  const choosing = !claimed && (!plan || draft.editing);
  const root = h('section', { class: 'res-fishing', 'data-fishing-journal': data.state });
  if (work.response) root.append(h('div', { class: 'res-speech res-return', 'data-fishing-return': '' }, h('b', {}, '石头还记得这条鱼'), h('p', {}, work.response)));
  root.append(note('带两条真实的收线见闻回来，再挑一条最想讲的留进鱼讯。普通的小鱼，也有值得记住的瞬间。'));
  if (choosing) {
    if (!work.choices.some(choice => choice.focus === draft.focus)) draft.focus = work.choices[0].focus;
    root.append(h('div', { class: 'res-fishing-focuses', role: 'group', 'aria-label': '这次留意什么' }, work.choices.map(choice =>
      h('button', { type: 'button', class: 'res-fishing-focus' + (draft.focus === choice.focus ? ' on' : ''),
        'data-fishing-focus': choice.focus, 'aria-pressed': String(draft.focus === choice.focus), onclick: click(() => { draft.focus = choice.focus; render(); }) },
      h('b', {}, choice.title), h('span', {}, choice.detail)))));
    root.append(h('div', { class: 'row res-fishing-actions' },
      h('button', { type: 'button', class: 'btn', 'data-fishing-start': '', onclick: click(() => start(draft.focus)) }, plan ? '换个方向 · 重新观察' : '开始今天的鱼讯'),
      plan && h('button', { type: 'button', class: 'btn alt', 'data-fishing-cancel-change': '', onclick: click(() => { draft.editing = false; render(); }) }, '保留原来的见闻')));
    if (plan) root.append(note('确认更换后，从下一次咬钩重新记两条；这份尚未交付的样本不会带到新方向里。'));
  } else if (plan) {
    root.append(h('div', { class: 'res-fishing-current' }, h('b', {}, plan.title),
      h('div', { class: 'res-steps' }, h('div', {}, h('span', {}, '成功收回两条鱼，留意过程'), h('b', {}, `${plan.cur}/${plan.need}`))),
      note(plan.message)));
    const ready = data.state === 'ready';
    if (ready) root.append(h('p', { class: 'res-fishing-prompt' }, '哪一次收线最想讲给石头听？选一条，再收好今天的鱼讯。'));
    if (plan.catches.length) root.append(h('div', { class: 'res-fishing-samples', role: 'group', 'aria-label': '今天的收线见闻' }, plan.catches.map(sample =>
      h(ready ? 'button' : 'article', { class: 'res-fishing-sample' + (ready && draft.sample === sample.index ? ' on' : ''),
        ...(ready ? { type: 'button', 'data-fishing-sample': sample.index, 'aria-pressed': String(draft.sample === sample.index), onclick: click(() => { draft.sample = sample.index; render(); }) } : {}) },
      h('div', { class: 'res-fishing-fish' }, h('img', { src: fishIco(sample.fishId), alt: '' }), h('b', {}, `第${sample.index + 1}条 · ${sample.name}`)),
      h('strong', {}, sample.title), sample.lines.map(line => h('p', {}, line))))));
    if (ready) root.append(h('button', { type: 'button', class: 'btn gold', 'data-act': 'claim', 'data-fishing-claim': '',
      disabled: !plan.catches.some(sample => sample.index === draft.sample), onclick: click(() => claim(draft.sample)) }, '把这条见闻留给石头 · +70'));
    else if (!claimed) root.append(h('div', { class: 'row res-fishing-actions' },
      h('button', { type: 'button', class: 'btn', 'data-fishing-go': '', onclick: click(go) }, plan.cur ? '去钓场 · 接着观察' : '去钓场看看'),
      h('button', { type: 'button', class: 'btn alt', 'data-fishing-change': '', onclick: click(() => { draft.editing = true; draft.focus = plan.focus; render(); }) }, '换个观察方向')));
  }
  if (claimed) root.append(note('今天选中的见闻已经收好，其他样本也留在本日记录里。明天再带些不同的鱼讯来。'));
  root.append(h('p', { class: 'res-fishing-reward' }, h('img', { src: coinIco(), alt: '' }), '今日反馈：70 噗灵 · 每日一次'));
  if (!claimed) root.append(note('不用等稀有鱼，也不必遇见宝箱。大喵帮忙会如实记下；鱼逃走不计入成功样本。小镇清晨5点换新记录。'));
  root.append(h('details', { class: 'res-history', 'data-fishing-history': '' }, h('summary', {}, `留下的鱼讯（${work.notes.length}/7）`),
    work.notes.length ? work.notes.map(entry => h('article', { class: 'res-fishing-entry' }, h('b', {}, entry.day + ' · ' + entry.title), entry.lines.map(line => h('p', {}, line)))) : note('第一条由你挑选的见闻，会从这里留下来。')));
  root.append(h('details', { class: 'res-history res-fishing-catalog' }, h('summary', {}, '钓场图鉴 · 已经见过的鱼'),
    h('div', { class: 'res-fish' }, data.fish.map(fish => h('div', { class: fish.count ? '' : 'unknown' }, h('img', { src: fishIco(fish.id), alt: '' }),
      h('b', {}, fish.count ? fish.name : '待记录'), h('small', {}, fish.count ? `累计 ${fish.count} 条` : '成功收线后收录'))))));
  return root;
}
