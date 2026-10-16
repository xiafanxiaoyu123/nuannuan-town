// 装修工具栏与目录显示；装修规则仍由 game.town.decor 提供。
// 由 ui.js 的具名方法使用 .apply(this, arguments) 调用；不安装原型、不创建单例。
import { h, fmt } from '../core/util.js';
import { decorSellPrice } from '../core/state.js';
import { S, beauty } from '../core/state.js';
import { DECOR, DECO, FLOORS } from '../data.js';
import { floorTex } from '../world/decor.js';
import { decorIcon } from '../core/icons.js';
import { live } from '../live/api.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { SWATCHABLE_IDS, SWATCH_FAMILIES } from '../shared/home-themes.js';
import { priceTag } from './components/price-tag.js';
import { click } from './components/actions.js';
export { refreshDecor, refreshDecorPreview, refreshDecorCamera } from './decor-refresh.js';

export function buildDecorList() {
  this.decorSlots = DECOR.map((d) => {
    const cnt = h('span', { class: 'cnt' });
    const el = h('button', { class: 'slot', 'data-decor-id': d.id, title: `${d.name} · 美化度 +${d.beauty}${d.indoorOnly ? ' · 仅限室内' : ''}`, onclick: click(() => this.game.town.decor.select(d.id), 'tab') },
      cnt, h('img', { alt: '' }), h('b', {}, d.name), priceTag(d.price));
    el._cnt = cnt;
    el._id = d.id;
    return el;
  });
  this.decorList.append(...this.decorSlots);
  this.floorSlots = FLOORS.map((f) => {
    const el = h('button', { class: 'slot', onclick: click(() => {
      if (!LOCAL_PLAY && f.mile !== undefined && !S.live.miles.includes(f.mile)) { this.toast('这种地面是家园美化度的阶段奖励，去「家园」里领了就能铺'); return; }
      this.game.town.decor.selectFloor(f.id); this.refreshDecor();
    }, 'tab') },
      h('img', { class: 'sw', src: floorTex(f.id).url, alt: '' }), h('b', {}, f.name), !LOCAL_PLAY && f.price ? priceTag(f.price) : h('span', { class: 'price free' }, '免费'));
    el._id = f.id;
    return el;
  });
  this.floorList.append(...this.floorSlots);
}

export function setDecorTab(tab) {
  if(tab==='walls'&&(this.game.town.zone!=='house'||!this.game.town.partitions?.enabled))return this.toast('升级到云朵城堡后，可在屋内搭建隔断');
  this.decorTab=tab;
  this.decorTabs.children[0].classList.toggle('on', tab === 'furn');
  this.decorTabs.children[1].classList.toggle('on', tab === 'floor');
  this.decorList.classList.toggle('hide', tab !== 'furn');
  this.floorList.classList.toggle('hide', tab !== 'floor');
  this.wallList.classList.toggle('hide',tab!=='walls');this.wallTab.classList.toggle('on',tab==='walls');
  const d = this.game.town.decor;
  if (tab === 'floor' && d.cfg.freeBuild) d.setBuildLevel(0);
  d.selectFloor(null);
  this.refreshDecor();
  if (tab === 'walls') this.tutorial('partitions', false, { valid: () => d.active && this.decorTab === 'walls' });
}

export function toggleDecorCameraPanel() {
  const d = this.game.town.decor;
  if (d.cameraMode === 'place') d.setCameraMode('orbit');
  else d.setCameraMode('place');
  // setCameraMode 同步发出 decorCamera，由该事件更新相机控件和提示。
  if (d.cameraMode !== 'place') this.tutorial('decorCamera', false, { valid: () => d.active && d.cameraMode !== 'place' });
}

export function buildWallReplacePanel() {
  const decor=this.game.town.decor, rec=decor.focus;
  if(!rec||!decor.cfg.freeBuild)return;
  let modal;
  modal=this.modal(h('div',{},h('h2',{},'更换墙体'),
    h('p',{},'在原位置换成墙、门洞或窗墙，保留楼板支撑和房间围合。旧构件会收进仓库，完成装修前可以撤销。'),
    h('div',{class:'row',style:{flexWrap:'wrap',gap:'.6rem'}},...['yard_wall','yard_door','yard_window'].map(id=>h('button',{
      class:'btn alt',disabled:id===rec.e.id,'data-build-replace':id,
      onclick:()=>{if(decor.focus!==rec)return modal.close(true);if(decor.replaceBuildWall(id))modal.close(true);}
    },DECO[id].name, h('small',{},LOCAL_PLAY?' · 免费':(S.decor[id]||0)>0?' · 使用库存':` · ${fmt(DECO[id].price)} 噗灵`))))),{ribbon:'建筑连接'});
}

export function setDecorFocus(rec) {
  this.decorFocus.classList.toggle('on', !!rec);
  this.decorTip.classList.toggle('hide', !!rec);
  if (!rec) return;
  const d = DECO[rec.e.id];
  this.dfIcon.src = decorIcon(rec.e.id);
  this.dfName.textContent = d.name;
  if (this.dfSwatch) {
    const canSwatch = SWATCHABLE_IDS.has(d.id);
    this.dfSwatch.classList.toggle('hide', !canSwatch);
    if (canSwatch) {
      const fam = SWATCH_FAMILIES[Number(rec.e.swatch) || 0] || SWATCH_FAMILIES[0];
      this.dfSwatch.textContent = `换色·${fam.name}`;
    }
  }
  this.dfReplace.classList.toggle('hide', !this.game.town.decor.cfg.freeBuild || !['yard_wall','yard_door','yard_window'].includes(d.id));
  this.dfSell.replaceChildren(LOCAL_PLAY ? h('span', {}, '移除') : priceTag(decorSellPrice(d.id)));
}

export function setDecorMode(on) {
  if (on) for (const el of this.decorSlots) { const img = el.querySelector('img'); if (!img.src) img.src = decorIcon(el._id); }
  if (on) {
    // 屋里只列室内家具，后院只列庭院装饰
    const indoor = !!this.game.town.decor.cfg.indoor;
    this.decorIndoor = indoor;
    this.decorCategory = 'all';
    this.decorOwnedOnly = false;
    this.decorSearch = '';
    if (this.decorSearchInput) this.decorSearchInput.value = '';
    for (const el of this.decorSlots) {
      const both = DECO[el._id].indoor === 'both';
      el.classList.toggle('hide', (!both && !!DECO[el._id].indoor !== indoor) || (!LOCAL_PLAY && !!DECO[el._id].only && !(S.decor[el._id] > 0)));
    }
    this.decortop.querySelector('h4').textContent = this.game.town.decor.cfg.freeBuild ? '搭建海风工坊岛' : indoor ? '布置小屋' : '布置后院';
    this.decortop.querySelector('.dup').classList.toggle('hide', !!this.game.town.decor.cfg.freeBuild);
    this.setDecorTab('furn');
  }
  this.decorbar.classList.toggle('on', on);
  this.decortop.classList.toggle('on', on);
  this.showHUD(!on);
  this.refreshDecor();
  this.refreshBeauty();
}
