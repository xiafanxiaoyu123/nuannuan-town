// 衣橱 / 搭配小屋：3D 试衣间 + 服饰面板
import { THREE, cbox, box, cyl, frustum, group, mat, glow } from '../core/kit.js';
import { Character, Momo, outfitToLook } from '../models/character.js';
import { SHOPS, CLOTHES, CLOTH, CATS, STYLES, SETS, DEFAULT_OUTFIT } from '../data.js';
import { S, bus, spend, stat, save, styleBonus } from '../core/state.js';
import { app } from '../core/app.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/fx.js';
import { h, fmt, tween, ease, rand } from '../core/util.js';
import { clothIcon, coinIco, icon } from '../core/icons.js';
import { MOMO_CLOAKS, MOMO_CLOAK_IDS, momoCloak, normalizeMomoCloak, normalizeMomoOwned } from '../models/momo-cloaks.js';
import { ui, svg, priceTag } from './ui.js';
import { setEffectChip } from '../live/panels.js';
import { live } from '../live/api.js';

export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.5, 80);
    this.baseFov = 26;
    this.dynFps = true;
    this.post = { tilt: 0, vig: 0.22, bloom: 0.1 };
    this.spin = 0.35;
    this.spinV = 0;
    this.cat = 'dress';
    this.build();
    const cv = app.canvas;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { if (this.active) drag = e.clientX; });
    window.addEventListener('pointermove', (e) => {
      if (!this.active || drag === null) return;
      this.spinV = (e.clientX - drag) * 0.012;
      this.spin += this.spinV;
      drag = e.clientX;
    });
    window.addEventListener('pointerup', () => (drag = null));
    for (const event of ['stateReplaced', 'reset']) bus.on(event, () => {
      if (!this.active || this.closing || this.saveIdentity === S) return;
      // 云存档和邮件奖励都会替换 S；旧试穿会话只能丢弃，不能覆盖新进度。
      this.workModal?.close(true);
      this.game.closeWardrobe();
    });
  }

  build() {
    const sc = this.scene;
    sc.background = new THREE.Color('#ffdce8');
    sc.fog = new THREE.Fog('#ffdce8', 16, 34);
    sc.add(new THREE.HemisphereLight(0xffffff, 0xffd9e6, 1.05));
    const key = new THREE.DirectionalLight(0xfff4ea, 2.5);
    key.position.set(-4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(app.shadowSize, app.shadowSize);
    const c = key.shadow.camera;
    c.left = -5; c.right = 5; c.top = 6; c.bottom = -3; c.near = 1; c.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    sc.add(key);
    const rim = new THREE.DirectionalLight(0xffc2e0, 1.2);
    rim.position.set(5, 4, -6);
    sc.add(rim);
    // 地面与舞台
    sc.add(cyl(26, 26, 0.2, '#fff1f5', 0, -0.2, 0, { seg: 48, cast: false }));
    sc.add(cyl(3.4, 3.4, 0.02, '#ffd9e4', 0, 0, 0, { seg: 48, cast: false }));
    sc.add(cyl(1.75, 1.9, 0.3, '#ffffff', 0, 0, 0, { seg: 40 }));
    sc.add(cyl(1.55, 1.55, 0.04, '#ffc2d6', 0, 0.3, 0, { seg: 40, cast: false }));
    sc.add(cyl(1.2, 1.2, 0.02, '#fff1f5', 0, 0.335, 0, { seg: 40, cast: false }));
    this.stageY = 0.35;
    // 背景：拱形镜 + 帘子 + 衣架
    const arch = group(0, 0, -4.6);
    arch.add(box(4.6, 5.2, 0.3, '#ffe9a8', 0, 0, 0, { r: 0.15 }));
    arch.add(cyl(2.3, 2.3, 0.3, '#ffe9a8', 0, 5.05, 0, { seg: 36, rx: Math.PI / 2 }));
    arch.add(box(4.0, 5.0, 0.34, mat('#cfe6fb', { rough: 0.35 }), 0, 0.12, 0.02, { r: 0.1, cast: false }));
    arch.add(cyl(2.0, 2.0, 0.34, mat('#cfe6fb', { rough: 0.35 }), 0, 5.03, 0.02, { seg: 36, rx: Math.PI / 2, cast: false }));
    sc.add(arch);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) sc.add(box(0.7, 8.4 - i * 0.2, 0.5, i % 2 ? '#ffb3cb' : '#ffc2d6', sx * (4.1 + i * 0.62), 0, -4.4 + i * 0.12, { r: 0.24 }));
      sc.add(cbox(0.5, 0.36, 0.6, '#ffd76a', sx * 3.95, 3.3, -4.0, { r: 0.12 }));
      // 衣架
      const rack = group(sx * 5.6, 0, -1.6);
      rack.rotation.y = -sx * 0.5;
      rack.add(box(0.1, 2.5, 0.1, '#d9cfc5', -1.2, 0, 0));
      rack.add(box(0.1, 2.5, 0.1, '#d9cfc5', 1.2, 0, 0));
      rack.add(cbox(2.6, 0.1, 0.1, '#d9cfc5', 0, 2.5, 0, { r: 0.04 }));
      ['#9fe0c5', '#b9a4f2', '#ffe27a', '#8fd0f5', '#ff9fbd'].forEach((col, i) => {
        const x = -0.9 + i * 0.45;
        rack.add(box(0.3, 0.42, 0.34, col, x, 1.82, 0, { r: 0.08 }));
        rack.add(frustum(0.32, 0.6, 0.62, col, x, 1.2, 0, { sx: 0.6, ry: Math.PI / 2 }));
      });
      sc.add(rack);
    }
    // 漂浮的小装饰
    this.floaters = [];
    const fc = ['#ffd76a', '#ff9fbd', '#ffffff', '#c9b6f2', '#9fe0c5'];
    for (let i = 0; i < 22; i++) {
      const s = rand(0.12, 0.34);
      const m = cbox(s, s, s, mat(fc[i % 5], { emissive: fc[i % 5], ei: 0.35 }), rand(-7, 7), rand(1, 7), rand(-4, -1.2), { r: s * 0.3, rz: Math.PI / 4, cast: false });
      m.userData = { y: m.position.y, ph: rand(6), sp: rand(0.4, 1) };
      sc.add(m);
      this.floaters.push(m);
    }
    this.holder = group(0, this.stageY, 0);
    sc.add(this.holder);
    this.char = new Character(outfitToLook(S.outfit));
    this.char.root.scale.setScalar(1.5);
    this.holder.add(this.char.root);
    this.momo = new Momo();
    this.momo.root.position.set(2.2, 0, 1.0);
    this.momo.root.rotation.y = -0.6;
    this.momo.root.scale.setScalar(1.3);
    sc.add(this.momo.root);
    this.camera.position.set(0, 2.2, 10.2);
    this.camera.lookAt(0, 1.55, 0);
  }

  onResize(w, hgt) {
    const land = w / hgt > 1.05;
    if (land) this.camera.setViewOffset(w, hgt, w * 0.31, 0, w, hgt);
    else this.camera.setViewOffset(w, hgt, 0, hgt * 0.27, w, hgt);
  }
  onEnter() {
    this.active = true;
    audio.startMusic('dress');
  }
  onExit() {
    this.active = false;
    this.workModal?.close(true);
    this.momoSession = (this.momoSession || 0) + 1;
    this.momo.setCloak(S.momoCloak);
    this.el && this.el.remove();
    this.el = null;
  }

  open(mode) {
    this.mode = mode; // 'closet' 只能换装；'shop' 可以购买
    this.momoSession = (this.momoSession || 0) + 1; this.saveIdentity = S; this.closing = false;
    this.momoSel = normalizeMomoCloak(S.momoCloak);
    this.subject = 'nikki';
    this.momo.setCloak(S.momoCloak);
    this.momo.root.position.set(2.2, 0, 1);
    this.momo.root.scale.setScalar(1.3);
    this.momo.root.rotation.y = -0.6;
    this.holder.visible = true;
    this.preview = { ...S.outfit };
    this.sel = S.outfit[this.cat];
    this.char.setLook(outfitToLook(this.preview));
    this.spin = 0.35;
    const shop = mode === 'shop';
    this.scene.background.set(shop ? '#e6dcfb' : '#ffdce8');
    this.scene.fog.color.set(shop ? '#e6dcfb' : '#ffdce8');
    this.coinEl = h('span', { class: 'num' }, fmt(S.coins));
    this.tabs = h('div', { class: 'tabs' });
    this.grid = h('div', { class: 'wgrid' });
    this.foot = h('div', { class: 'wfoot' });
    this.styleEl = h('div', { class: 'wstyles' });
    this.bonusBar = h('div', { class: 'wbonus' });
    this.setFxEl = setEffectChip(this.preview);
    this.subjectTabs = h('div', { class: 'wsubjects', 'aria-label': '换装角色' });
    this.hint = h('div', { class: 'whint' }, '拖动画面可以旋转暖暖');
    this.detailEl = h('div', { class: 'wdetail' });
    this.toolsButton = h('button', { class: 'wtools-toggle', 'aria-expanded': 'false', 'aria-controls': 'wardrobe-tools', onclick: () => this.toggleTools() }, svg('hanger'), h('span', {}, '搭配工具'));
    this.toolsEl = h('section', { id: 'wardrobe-tools', class: 'wtools', hidden: true, 'aria-label': '搭配工具' },
      h('div', { class: 'wtools-head' }, h('h3', {}, '搭配工具'), h('button', { class: 'wtools-close', 'aria-label': '返回服饰列表', onclick: () => this.toggleTools(false) }, '返回列表')),
      h('button', { class: 'btn sm wwork', onclick: () => { audio.sfx('click'); this.workPanel(); } }, svg('hanger'), '上班方案'),
      this.detailEl, this.setFxEl, this.bonusBar, this.styleEl);
    this.styleFilter = 'all';
    this.filterBar = h('div', { class: 'wfilters', 'aria-label': '风格与拥有状态筛选' });
    this.el = h('div', { class: 'wardrobe' },
      h('div', { class: 'wleft' }, h('button', { class: 'btn alt', onclick: () => { audio.sfx('click'); this.game.closeWardrobe(); } }, svg('back'), shop ? '离开小屋' : '换好了')),
      this.hint,
      h('div', { class: 'panel card' },
        h('div', { class: 'head' },
          h('div', {}, h('h2', {}, shop ? '搭配小屋' : '我的衣橱'), h('p', {}, shop ? '点选服饰即可试穿' : '已拥有的服饰可以直接穿戴')),
          h('div', { class: 'whead-actions' }, h('div', { class: 'pill coin' }, h('img', { src: coinIco() }), this.coinEl),
            h('button', { class: 'wgrab', 'aria-label': '展开服饰列表', 'aria-expanded': 'false', onclick: (event) => {
              audio.sfx('tab'); const expanded = this.el.classList.toggle('tall');
              event.currentTarget.setAttribute('aria-expanded', String(expanded));
              event.currentTarget.setAttribute('aria-label', expanded ? '收起服饰列表' : '展开服饰列表');
              event.currentTarget.textContent = expanded ? '收起' : '展开';
            } }, '展开'))),
        h('div', { class: 'wbody' },
          h('aside', { class: 'wrail', 'aria-label': '服饰分类和工具' }, h('div', { class: 'wnav' }, this.subjectTabs, this.tabs), this.toolsButton),
          h('div', { class: 'wlist' }, this.filterBar, this.grid, this.toolsEl)), this.foot));
    ui.root.append(this.el);
    this.offCoins && this.offCoins();
    this.offCoins = bus.on('coins', (t) => this.coinEl && (this.coinEl.textContent = fmt(t)));
    this.renderSubjects();
    this.renderTabs();
    this.renderGrid();
    this.renderFoot();
    this.renderStyles();
  }
  toggleTools(open = this.toolsEl.hidden) {
    if (!this.canEditOutfit()) return false;
    this.toolsEl.hidden = !open;
    this.grid.hidden = open;
    if (this.filterBar) this.filterBar.hidden = open || this.subject === 'momo';
    this.toolsButton.setAttribute('aria-expanded', String(open));
    this.toolsButton.classList.toggle('on', open);
    if (!open) this.toolsButton.focus({ preventScroll: true });
    audio.sfx('tab');
    return true;
  }
  // 离开时把没买的试穿件脱掉
  commit() {
    const current = this.canEditOutfit();
    this.closing = true;
    if (!current) { this.preview = { ...S.outfit }; return false; }
    for (const k of Object.keys(this.preview)) if (S.owned.includes(this.preview[k])) S.outfit[k] = this.preview[k];
    save();
    return true;
  }

  renderTabs() {
    if (this.filterBar) {
      this.filterBar.hidden = !this.toolsEl?.hidden || this.subject === 'momo';
      if (this.subject !== 'momo') {
        const opts = [['all', '全部'], ['owned', '已拥有'], ...Object.entries(STYLES).map(([k, s]) => [k, s.name])];
        this.filterBar.replaceChildren(...opts.map(([id, label]) => h('button', {
          type: 'button', class: 'wfilter-chip' + (this.styleFilter === id ? ' on' : ''),
          'aria-pressed': String(this.styleFilter === id),
          onclick: () => { audio.sfx('tab'); this.styleFilter = id; this.grid.scrollTop = 0; this.renderTabs(); this.renderGrid(); },
        }, label)));
      }
    }
    if (this.subject === 'momo') {
      this.tabs.replaceChildren(...[['front','看正面',0],['back','看背面',Math.PI]].map(([id,label,angle]) =>
        h('button', { 'data-momo-view': id, onclick: () => { this.spin = angle; this.spinV = 0; this.momo.root.rotation.y = angle; audio.sfx('tab'); } }, label)),
        h('span', { class: 'momo-free' }, this.mode === 'shop' ? '经典免费 · 新斗篷先试穿再购买' : '已拥有可穿戴 · 未购仅预览'));
      return;
    }
    this.tabs.replaceChildren(...CATS.map((c) =>
      h('button', { class: c.id === this.cat ? 'on' : '', 'data-wardrobe-category': c.id, onclick: () => { audio.sfx('tab'); this.cat = c.id; this.sel = this.preview[c.id]; this.grid.scrollTop = 0; if (!this.toolsEl.hidden) this.toggleTools(false); this.renderTabs(); this.renderGrid(); this.renderFoot(); } }, c.name)));
  }
  renderGrid() {
    const scrollTop = this.grid.scrollTop;
    if (this.subject === 'momo') {
      const session = this.momoSession;
      this.grid.replaceChildren(...MOMO_CLOAKS.map(it => h('button', {
        class: 'item momo-item' + (this.ownsMomo(it.id) ? '' : ' locked') + (this.momoSel === it.id ? ' sel' : '') + (S.momoCloak === it.id ? ' worn' : ''),
        'data-momo-cloak': it.id, 'aria-pressed': this.momoSel === it.id ? 'true' : 'false',
        onclick: () => this.pickMomo(it.id, session),
      }, h('div', { class: 'pic', style: { '--bg': it.color + '33' } },
        h('img', { src: icon('momo-cloak:' + it.id, () => new Momo(it.id).root, { yaw: .28, pitch: .10, zoom: 1.12 }), alt: it.name })),
      h('b', {}, it.name), this.ownsMomo(it.id) ? h('span', { class: 'own' }, S.momoCloak === it.id ? '穿戴中' : it.price ? '已拥有' : '免费') : this.mode === 'shop' ? priceTag(it.price) : h('span', { class: 'momo-unowned' }, '未拥有 · 可预览'))));
      this.grid.scrollTop = scrollTop;
      return;
    }
    const items = CLOTHES.filter((c) => {
      if (c.cat !== this.cat || (c.only && !S.owned.includes(c.id))) return false;
      if (this.styleFilter === 'owned') return S.owned.includes(c.id);
      if (this.styleFilter && this.styleFilter !== 'all') return c.style === this.styleFilter;
      return true;
    }).sort((a, b) => a.price - b.price);
    this.grid.replaceChildren(...items.map((it, i) => {
      const owned = S.owned.includes(it.id);
      const st = it.style && STYLES[it.style];
      const none = it.acc === 'none' || it.back === 'none';
      // 卡片不再重复显示部件大标题；套装名作为主要识别文字。无套装的
      // 基础部件保留一个小号名称，避免“无名”卡片无法辨认。完整名称
      // 放在 aria-label/title 中，视觉层可以保持紧凑而不损失可访问性。
      const setName = it.set && SETS[it.set] ? SETS[it.set].name : '';
      const shortName = it.name.split('·').pop();
      const label = setName || shortName;
      const el = h('button', { class: 'item' + (owned ? '' : ' locked') + (this.sel === it.id ? ' sel' : '') + (S.outfit[it.cat] === it.id ? ' worn' : ''), onclick: () => this.pick(it), 'data-cloth-id': it.id, 'aria-label': it.name, title: it.name },
        st && h('span', { class: 'dot', style: { '--c': st.color } }, st.name),
        h('div', { class: 'pic', style: { '--bg': st ? st.color + '33' : '#f3ece8' } }, none ? h('div', { class: 'none' }) : h('img', { src: clothIcon(it.id), alt: it.name, loading: 'lazy' })),
        h('span', { class: 'setn' + (setName ? '' : ' piece-name') }, label),
        owned ? h('span', { class: 'own' }, '已拥有') : priceTag(it.price));
      el.style.animationDelay = i * 0.03 + 's';
      return el;
    }));
    this.grid.scrollTop = scrollTop;
  }
  renderFoot() {
    if (this.subject === 'momo') {
      const it = momoCloak(this.momoSel), owned = this.ownsMomo(it.id), session = this.momoSession;
      const action = owned ? h('button', { class: 'btn alt momo-buy', disabled: true }, '穿戴中') : this.mode === 'shop'
        ? h('button', { class: 'btn gold momo-buy', 'data-buy-momo': it.id, onclick: () => this.buyMomo(it.id, session) }, '购买 ', priceTag(it.price))
        : h('button', { class: 'btn alt momo-buy', disabled: true }, '搭配小屋有售');
      this.detailEl.replaceChildren(h('b', {}, it.name), h('p', {}, it.note), h('p', {}, owned ? '已拥有，点选即可换装' : `仅试穿，不改变随行大喵 · ${fmt(it.price)} 噗灵`));
      this.foot.replaceChildren(h('div', { class: 'momo-detail' }, h('b', {}, it.name), h('p', {}, it.note),
        h('small', { class: owned ? '' : 'momo-preview-note' }, owned ? it.id === 'classic' ? '经典款永久免费' : '已拥有，点选即可换装' : `仅试穿，不改变随行大喵 · ${fmt(it.price)} 噗灵`)), action);
      return;
    }
    const it = CLOTH[this.sel];
    const owned = S.owned.includes(it.id);
    const worn = S.outfit[it.cat] === it.id;
    const st = it.style && STYLES[it.style];
    let btn;
    if (owned) btn = worn ? h('button', { class: 'btn alt', disabled: true }, '穿戴中') : h('button', { class: 'btn', onclick: () => this.wear(it) }, '穿上');
    else if (this.mode === 'shop') btn = h('button', { class: 'btn gold', onclick: () => this.buy(it) }, '购买 ', priceTag(it.price));
    else btn = h('button', { class: 'btn alt', disabled: true }, '搭配小屋有售');
    this.detailEl.replaceChildren(h('b', {}, it.name), h('p', {}, it.set ? `${SETS[it.set].note} · ${SETS[it.set].anchor}` : it.only ? '连续签到七天的纪念，只送不卖' : '清清爽爽，什么都不戴'), st && h('p', {}, `在偏爱「${st.name}」风格的地方打工，每件 +6% 收入`));
    this.foot.replaceChildren(
      h('div', { class: 'info' },
        h('b', {}, it.name, st && h('span', { class: 'tag', style: { '--c': st.color } }, st.name)),
        h('p', {}, it.set ? `${SETS[it.set].note} · ${SETS[it.set].anchor}` : it.only ? '连续签到七天的纪念，只送不卖' : '清清爽爽，什么都不戴'),
        st && h('p', {}, `在偏爱「${st.name}」风格的地方打工，每件 +6% 收入`)),
      btn);
  }
  renderStyles() {
    if (this.subject === 'momo') return;
    if (this.setFxEl) {
      const next = setEffectChip(this.preview);
      this.setFxEl.replaceWith(next); this.setFxEl = next;
    }
    const cnt = {};
    for (const id of Object.values(this.preview)) { const s = CLOTH[id].style; if (s) cnt[s] = (cnt[s] || 0) + 1; }
    this.styleEl.replaceChildren(...Object.entries(STYLES).map(([k, s]) => h('div', { class: 'chip', style: { '--c': s.color, opacity: cnt[k] ? 1 : 0.55 } }, h('i', {}, cnt[k] || 0), s.name)));
    // 每家已开业店铺偏爱一种风格：当前这身各能加多少
    this.bonusBar.replaceChildren(
      h('p', {}, h('b', {}, '穿搭加成'), '每穿一件店铺偏爱的风格，在那家店打工收入 +6%'),
      h('div', {}, ...Object.values(SHOPS).filter((sh) => sh.id !== 'bakery' || live.project().done).map((sh) => {
        const n = cnt[sh.style] || 0, st = STYLES[sh.style];
        return h('span', { class: n ? 'on' : '', style: { '--c': st.color } }, h('i', {}, st.name), { cafe: '咖啡屋', flower: '花店', tailor: '裁缝铺', fish: '钓场', bakery: '面包房' }[sh.id], h('b', {}, `+${n * 6}%`));
      })));
  }

  renderSubjects() {
    this.subjectTabs.replaceChildren(...[['nikki','暖暖'],['momo','大喵']].map(([id,label]) =>
      h('button', { class: this.subject === id ? 'on' : '', 'data-wardrobe-subject': id, 'aria-label': id === 'momo' ? '大喵斗篷' : '暖暖服饰', title: id === 'momo' ? '大喵斗篷' : '暖暖服饰', 'aria-pressed': this.subject === id ? 'true' : 'false', onclick: () => this.setSubject(id) }, label)));
  }
  setSubject(id) {
    this.subject = id === 'momo' ? 'momo' : 'nikki';
    this.grid.scrollTop = 0; if (!this.toolsEl.hidden) this.toggleTools(false);
    const momo = this.subject === 'momo';
    this.momoSel = normalizeMomoCloak(S.momoCloak); this.momo.setCloak(this.momoSel);
    this.el.classList.toggle('momo-mode', momo);
    this.holder.visible = !momo;
    this.spin = momo ? 0 : .35; this.spinV = 0;
    this.momo.root.position.set(momo ? 0 : 2.2, momo ? this.stageY : 0, momo ? 0 : 1);
    this.momo.root.scale.setScalar(momo ? 2.65 : 1.3);
    this.momo.root.rotation.y = momo ? 0 : -.6;
    this.hint.textContent = momo ? '拖动画面旋转大喵 · 正面背面都能看' : '拖动画面可以旋转暖暖';
    this.renderSubjects(); this.renderTabs(); this.renderGrid(); this.renderFoot(); this.renderStyles();
    audio.sfx('tab');
    if (momo) ui.tutorial('momo', false, { valid: () => this.active && this.subject === 'momo' });
  }
  ownsMomo(id) { return MOMO_CLOAK_IDS.includes(id) && (id === 'classic' || S.momoOwned?.includes(id)); }
  canEditOutfit() {
    return this.active && app.view === this && this.game.wardrobe === this && this.game.busy === true
      && ['closet', 'shop'].includes(this.mode) && this.el?.isConnected && !this.closing && this.saveIdentity === S;
  }
  canEditMomo(session = this.momoSession) {
    return this.active && app.view === this && this.game.wardrobe === this && this.game.busy === true
      && this.subject === 'momo' && ['closet','shop'].includes(this.mode) && this.el?.isConnected
      && !this.closing && this.saveIdentity === S && session === this.momoSession;
  }
  pickMomo(id, session = this.momoSession) {
    if (!this.canEditMomo(session) || !MOMO_CLOAK_IDS.includes(id)) return false;
    this.momoSel = id;
    if (this.ownsMomo(id)) return this.wearMomo(id, session);
    this.momo.setCloak(id); audio.sfx('tab');
    this.renderGrid(); this.renderFoot(); return true;
  }
  wearMomo(id, session = this.momoSession) {
    if (!this.canEditMomo(session) || !this.ownsMomo(id)) return false;
    const changed = normalizeMomoCloak(S.momoCloak) !== id;
    this.momoSel = id;
    S.momoCloak = id;
    this.momo.setCloak(id);
    this.game.town?.momo?.setCloak(id);
    save(); audio.sfx(changed ? 'equip' : 'tab');
    this.renderGrid(); this.renderFoot(); return true;
  }
  buyMomo(id, session = this.momoSession) {
    if (!this.canEditMomo(session) || this.mode !== 'shop' || this.momoSel !== id || !MOMO_CLOAK_IDS.includes(id) || this.buyingMomo) return false;
    if (this.ownsMomo(id)) { ui.toast('已经拥有这件斗篷，不用重复购买'); return false; }
    const it = momoCloak(id);
    this.buyingMomo = true;
    try {
      if (!spend(it.price)) { ui.toast('噗灵不足，先攒一点再来吧'); return false; }
      S.momoOwned = [...normalizeMomoOwned(S.momoOwned), id];
      this.wearMomo(id, session); save(); audio.sfx('buy');
      ui.toast(`买下了大喵的「${it.name}」`); bus.emit('momoOwned', id); return true;
    } finally { this.buyingMomo = false; }
  }

  // 上班方案：给每家店存一套预设，开工时自动换上、打烊换回；不存就是「穿身上这套」
  workPanel() {
    if (!this.canEditOutfit()) return false;
    const CATS5 = ['hair', 'dress', 'shoes', 'acc', 'back'];
    const body = h('div', { class: 'workp' });
    const shops = () => Object.values(SHOPS).filter((sh) => sh.id !== 'bakery' || live.project().done);
    const worn = () => Object.fromEntries(CATS5.map((k) => [k, S.owned.includes(this.preview[k]) ? this.preview[k] : S.outfit[k]]));
    // 自动配一套：每个部位挑一件这家店偏爱风格的（优先已经穿着的、同一套的），没有就保持身上的
    const best = (sh) => {
      const o = worn();
      const owned = CLOTHES.filter((c) => S.owned.includes(c.id) && c.style === sh.style);
      const sets = {};
      for (const c of owned) if (c.set) sets[c.set] = (sets[c.set] || 0) + 1;
      for (const k of CATS5) {
        if (CLOTH[o[k]] && CLOTH[o[k]].style === sh.style) continue;
        const pick = owned.filter((c) => c.cat === k).sort((a, b) => (sets[b.set] || 0) - (sets[a.set] || 0))[0];
        if (pick) o[k] = pick.id;
      }
      return o;
    };
    const render = () => {
      body.replaceChildren(
        h('div', { class: 'tk-head' }, h('h2', {}, '上班方案'), h('p', {}, '给每家店存一套穿搭：去营业时自动换上，打烊后换回原来那身。不存就一直穿身上这套。')),
        h('div', { class: 'work-list' }, shops().map((sh) => {
          const plan = S.work[sh.id], st = STYLES[sh.style];
          const items = plan ? CATS5.map((k) => CLOTH[plan[k]]).filter((c) => c && c.acc !== 'none' && c.back !== 'none' && S.owned.includes(c.id)) : [];
          const pct = styleBonus(sh.id, plan ? { ...S.outfit, ...plan } : worn()).pct;
          const set = (o, msg) => { if (!this.canEditOutfit()) return; S.work[sh.id] = o; save(); audio.sfx(o ? 'equip' : 'tab'); ui.toast(msg); render(); };
          return h('div', { class: 'work-row' + (plan ? ' on' : '') },
            h('div', { class: 'work-top' }, h('b', {}, sh.name), h('span', { class: 'tag', style: { '--c': st.color } }, `偏爱${st.name}`), h('em', { class: pct ? 'has' : '' }, `加成 +${pct}%`)),
            plan ? h('div', { class: 'work-fit' }, items.map((c) => h('img', { src: clothIcon(c.id), alt: c.name, title: c.name })))
              : h('p', { class: 'work-none' }, '不自动切换 · 就穿身上这套'),
            h('div', { class: 'work-btns' },
              h('button', { class: 'btn sm', onclick: () => set(worn(), `${sh.name}：存下了现在这身`) }, '存入现在这身'),
              h('button', { class: 'btn alt sm', onclick: () => set(best(sh), `${sh.name}：按${st.name}风格配了一套`) }, '自动配最高加成'),
              plan && h('button', { class: 'btn alt sm', onclick: () => set(null, `${sh.name}：不再自动换装`) }, '不自动切换')));
        })),
        h('p', { class: 'tk-note' }, '「存入现在这身」存的是衣橱里正穿着的、已经拥有的衣服。之后买了新衣服，回来重新存一次就行。'));
    };
    render();
    this.workModal?.close(true);
    const modal = ui.modal(body, { ribbon: '穿搭预设', cls: 'live-modal', onClose: () => { if (this.workModal === modal) this.workModal = null; } });
    this.workModal = modal;
    return modal;
  }

  twirl() {
    const from = this.spin;
    tween({ dur: 0.7, ease: ease.outCubic, update: (k) => (this.spin = from + k * Math.PI * 2) });
    this.char.setPose('twirl');
    this.poseT = 0.7;
  }
  pick(it) {
    if (!this.canEditOutfit()) return false;
    this.sel = it.id;
    const owned = S.owned.includes(it.id);
    if (owned || this.mode === 'shop') {
      const changed = this.preview[it.cat] !== it.id;
      this.preview[it.cat] = it.id;
      if (owned) { S.outfit[it.cat] = it.id; save(); }
      if (changed) {
        this.char.setLook(outfitToLook(this.preview));
        audio.sfx('equip');
        this.twirl();
        fx.sparkle(this.scene, new THREE.Vector3(0, 2, 0.6), 8, ['#ffffff', '#ffd76a', '#ff9fbd']);
      } else audio.sfx('tab');
    } else audio.sfx('tab');
    this.renderGrid();
    this.renderFoot();
    this.renderStyles();
  }
  wear(it) {
    this.pick(it);
  }
  buy(it) {
    if (!this.canEditOutfit()) return false;
    if (!spend(it.price)) return;
    S.owned.push(it.id);
    S.outfit[it.cat] = it.id;
    this.preview[it.cat] = it.id;
    audio.sfx('buy');
    this.char.setLook(outfitToLook(this.preview));
    this.char.setPose('cheer');
    this.poseT = 1.3;
    fx.confetti(this.scene, new THREE.Vector3(0, 2.6, 0.5), 36);
    fx.hearts(this.scene, new THREE.Vector3(2.2, 1.2, 1), 4);
    ui.toast(`买下了「${it.name}」`, { icon: clothIcon(it.id) });
    stat('bought_clothes');
    bus.emit('collection');
    save();
    this.renderGrid();
    this.renderFoot();
    this.renderStyles();
  }

  update(dt, time) {
    this.spinV *= Math.exp(-6 * dt);
    this.holder.rotation.y = this.spin;
    if (this.poseT > 0) { this.poseT -= dt; if (this.poseT <= 0) this.char.setPose('idle'); }
    this.char.update(dt);
    this.momo.update(dt);
    this.momo.head.rotation.x = this.subject === 'momo' ? 0 : -0.25;
    if (this.subject === 'momo') this.momo.root.rotation.y = this.spin;
    for (const m of this.floaters) {
      m.position.y = m.userData.y + Math.sin(time * m.userData.sp + m.userData.ph) * 0.3;
      m.rotation.y = time * m.userData.sp;
    }
  }
}
