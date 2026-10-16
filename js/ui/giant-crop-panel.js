// 展示只借用仓库物品，不增减库存，也不保存临时手持状态。
import { h } from '../core/util.js';
import { S } from '../core/state.js';
import { DECO } from '../shared/furniture.js';
import { decorIcon } from '../core/icons.js';
import { click } from './components/actions.js';

export function giantCropPanel(ui) {
  const farm = ui.game.town.farm, identity = S;
  let modal;
  const body = h('div', { class: 'home giant-crop-panel' },
    h('h2', {}, '把丰收拿在手上'),
    h('p', { class: 'fine' }, '收获的巨大作物已经在装修仓库里。展示不会消耗库存，随时点「收起巨大作物」即可结束。'),
    h('div', { class: 'grid' }, farm.giantIds().map(id => h('button', {
      class: 'bigcard', 'data-giant-display': id,
      onclick: click(() => {
        if (S !== identity) { modal.close(true); return; }
        if (farm.showOff(id, { toggle: false })) modal.close(true);
      }),
    }, h('img', { src: decorIcon(id), alt: '' }), h('b', {}, DECO[id].name),
    h('p', {}, `仓库 ×${S.decor[id]} · 拿在手上展示`)))));
  modal = ui.modal(body, { ribbon: '巨大作物', cls: 'live-modal' });
}
