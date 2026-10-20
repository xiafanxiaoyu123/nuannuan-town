import { h } from '../core/util.js';
import { seedIco } from '../core/icons.js';

const note = text => h('p', { class: 'res-note' }, text);

// A draft is UI-only. Only the explicit start action commits the selected field.
export function residentFieldworkBody(data, { draft, click, render, start, claim, go, visitHome, preparePlot }) {
  const work = data.fieldwork, plan = work.plan, choices = work.choices || [];
  const claimed = data.state === 'claimed', choosing = !claimed && (!plan || draft.editing);
  const root = h('section', { class: 'res-fieldwork', 'data-fieldwork': data.state });
  if (work.response) root.append(h('div', { class: 'res-speech res-return', 'data-fieldwork-return': '' }, h('b', {}, '青禾记得这块田'), h('p', {}, work.response)));
  root.append(note('先看看田里正发生什么，再挑一件今天想亲手做的事。青禾会记下这株作物和你的照料。'));
  if (choosing) {
    if (!choices.some(choice => choice.route === draft.route)) draft.route = (choices.find(choice => choice.targets.length) || choices[0])?.route || '';
    const selected = choices.find(choice => choice.route === draft.route);
    const targets = selected?.targets || [];
    if (!targets.some(target => target.key === draft.key)) draft.key = targets[0]?.key || '';
    root.append(h('div', { class: 'res-field-routes', role: 'group', 'aria-label': '今天想观察什么' }, choices.map(choice =>
      h('button', { type: 'button', class: 'btn alt' + (draft.route === choice.route ? ' on' : ''), 'data-field-route': choice.route,
        'aria-pressed': String(draft.route === choice.route), onclick: click(() => { draft.route = choice.route; draft.key = ''; render(); }) },
      h('b', {}, choice.label), h('small', {}, choice.targets.length ? `可选 ${choice.targets.length} 块田` : '暂时没有合适田块')))));
    if (selected) root.append(note(selected.intro));
    if (targets.length) root.append(h('div', { class: 'res-field-targets', role: 'group', 'aria-label': '选择这次记录的田块' }, targets.map(target =>
      h('button', { type: 'button', class: 'res-field-target' + (draft.key === target.key ? ' on' : ''), 'data-field-target': target.key,
        'aria-pressed': String(draft.key === target.key), onclick: click(() => { draft.key = target.key; render(); }) },
      h('strong', {}, target.title), h('span', {}, target.detail)))));
    else root.append(h('div', { class: 'res-field-empty' },
      note(data.field?.plots ? '这类田块现在还没有准备好。可以换个观察主题，或者等作物长成再来。' : '后院还没有田地。先摆好一块田，再回来挑选这次的观察。'),
      h('button', { type: 'button', class: 'btn alt sm', 'data-field-home': '', onclick: click(data.field?.plots ? visitHome : preparePlot) }, data.field?.plots ? '去后院看看' : '准备一块小田')));
    root.append(h('div', { class: 'row res-field-actions' },
      h('button', { type: 'button', class: 'btn', 'data-field-start': '', disabled: !draft.key, onclick: click(() => start(draft.route, draft.key)) }, plan ? '改为这块田 · 重新记录' : '开始这页手记'),
      plan && h('button', { type: 'button', class: 'btn alt', 'data-field-cancel-change': '', onclick: click(() => { draft.editing = false; render(); }) }, '保留原来的记录')));
    if (plan) root.append(note('确认更换后，旧目标的动作不会带到新目标里；现在还不会改动记录。'));
  } else if (plan) {
    const choice = choices.find(choice => choice.route === plan.route);
    root.append(h('div', { class: 'res-field-current', 'data-field-current': '' },
      h('b', {}, choice?.label || '这次的巡田手记'),
      h('p', {}, plan.title || plan.target.title || '已选好的田块'),
      h('div', { class: 'res-steps' }, (plan.steps || []).map(step => h('div', {}, h('span', {}, step.text), h('b', {}, `${step.cur}/${step.need}`)))),
      plan.message && note(plan.message)));
    if (data.state === 'ready') root.append(h('button', { type: 'button', class: 'btn gold', 'data-act': 'claim', 'data-field-claim': '', onclick: click(claim) }, '请青禾收好这页手记'));
    else if (!claimed) root.append(h('div', { class: 'row res-field-actions' },
      h('button', { type: 'button', class: 'btn', 'data-field-go': '', disabled: plan.valid === false, onclick: click(() => go(plan.target)) }, '带我去这块田'),
      h('button', { type: 'button', class: 'btn alt', 'data-field-change': '', onclick: click(() => { draft.editing = true; draft.route = plan.route; draft.key = plan.target.key; render(); }) }, '换个观察目标')));
  }
  if (claimed) root.append(note('今天的手记和种子已经收好。继续照料田地，明天再带一页新见闻给青禾。'));
  root.append(h('p', { class: 'res-seed res-field-reward' }, h('img', { src: seedIco('tulip'), alt: '' }), '今日反馈：郁金香种子 ×2 · 每日一次'));
  if (!claimed) root.append(note('这页记录亲手播种、浇水或收获的动作。喷水器、大喵、连片浇水和一键收获不代做；小镇清晨5点换新记录。'));
  root.append(h('details', { class: 'res-history', 'data-field-history': '' }, h('summary', {}, `巡田手记（${work.notes.length}/7）`),
    work.notes.length ? work.notes.map(entry => h('article', { class: 'res-field-entry' }, h('b', {}, entry.day + ' · ' + entry.title), entry.lines.map(line => h('p', {}, line)))) : note('第一株被你照料的作物，会从这里留下记录。')));
  return root;
}
