// 装修栏的同步呈现职责；只读取当前业务状态，不保存库存或经济快照。
// 选择、交易、历史、区域和模式变化仍走完整刷新；预览/相机只更新相应展示。
import { fmt } from '../core/util.js';
import { S } from '../core/state.js';
import { DECO, FLOORS } from '../data.js';
import { isYardStructure } from '../world/yard-building.js';
import { BUILD_SLOPED_ROOF_IDS } from '../world/build-roof-profiles.js';
import { LOCAL_PLAY } from '../core/local-play-mode.js';
import { setText, setProperty, setAttribute, setClass } from './components/presentation.js';

function refreshHistoryState(ui, decor) {
  if (ui.decorUndo && ui.game.town) {
    const d = ui.game.town.decor;
    setProperty(ui.decorUndo, 'disabled', !d.canUndo);
    setProperty(ui.decorUndo, 'title', d.undoLabel ? '撤销：' + d.undoLabel : '没有可撤销的操作');
  }
}

function refreshFilters(ui, decor) {
  if (ui.decorFilters && decor) {
    const indoor = !!decor.cfg.indoor;
    const available = decor.cfg.freeBuild ? ['all', 'foundation', 'wall', 'roof', 'garden', 'home', 'kitchen', 'bathroom'] : indoor ? ['all', 'home', 'kitchen', 'bathroom'] : ['all', 'garden'];
    if (!available.includes(ui.decorCategory)) ui.decorCategory = 'all';
    setClass(ui.decorFilters, 'hide', ui.decorTab !== 'furn');
    for (const button of ui.decorCategories.children) {
      setClass(button, 'hide', !available.includes(button.dataset.decorCategory));
      setAttribute(button, 'aria-pressed', String(ui.decorCategory === button.dataset.decorCategory));
    }
    setClass(ui.decorLevelLabel, 'hide', !decor.cfg.freeBuild);
    setProperty(ui.decorLevelSelect, 'value', String(decor.buildLevel || 0));
  }
}

function refreshCameraControls(ui, decor) {
  if (ui.decorRoofs) {
    setClass(ui.decorRoofs, 'hide', !decor?.cfg.freeBuild);
    setText(ui.decorRoofs, ui.game.town.buildRoofsHidden ? '显示屋顶' : '隐藏屋顶');
    setAttribute(ui.decorRoofs, 'aria-pressed', String(!!ui.game.town.buildRoofsHidden));
  }
  if (ui.decorCameraPanel && decor) {
    const adjusting = decor.cameraMode !== 'place';
    setClass(ui.decorCameraPanel, 'hide', !adjusting);
    if (ui.decorbar) setClass(ui.decorbar, 'camera-adjusting', adjusting);
    const palette = ui.decorbar?.querySelector(':scope > .card:last-child');
    if (palette) setClass(palette, 'hide', adjusting);
    if (ui.decorCamera) { setClass(ui.decorCamera, 'on', adjusting); setAttribute(ui.decorCamera, 'aria-pressed', String(adjusting)); }
    for (const button of ui.decorCameraPanel.querySelectorAll('[data-decor-camera]')) {
      const id = button.dataset.decorCamera;
      if (id === 'orbit' || id === 'pan') setAttribute(button, 'aria-pressed', String(decor.cameraMode === id));
      if (id === 'top') { setText(button, decor.viewPitch > 1.18 ? '斜视' : '俯视'); setAttribute(button, 'aria-pressed', String(decor.viewPitch > 1.18)); }
    }
  }
}

function refreshWallTools(ui, decor) {
  if (ui.wallTab) {
    setProperty(ui.wallTab, 'hidden', ui.game.town?.zone !== 'house');
    setProperty(ui.wallTab, 'disabled', !ui.game.town?.partitions?.enabled);
    setText(ui.wallTab, ui.wallTab.disabled ? '隔断 · 最高级解锁' : '隔断');
  }
  for (const b of ui.wallButtons || []) setClass(b, 'sel', decor?.wallSel === b.dataset.wallTool);
}

function refreshHint(ui, decor) {
  if (ui.decorTip) {
    let hideTip = !!decor?.focus;
    const wallTips = { wall:'按住拖出整面墙 · 松手放下 · 旋转换方向', door:'拖到格线上松手放门 · 保留通道', move:'按住直墙或门洞拖到新位置 · 松手确认', erase:'点选墙段或门洞拆除，可撤销' };
    const pending = LOCAL_PLAY ? 0 : decor?.pendingCost || 0;
    const bill = pending ? ` · 待结算家具 ${fmt(pending)} 噗灵（完成装修时统一扣除）` : '';
    let tip = ui.decorTab==='walls' ? `免费搭建 · ${(S.wallsIn||[]).length}/240 段 · ${decor?.wallStatus || wallTips[decor?.wallSel] || '选择实墙或门洞 · 双格门洞供人物通行'}` : decor?.pickupMode ? '按住家具直接拖动 · 轻点可旋转、收起或卖掉' + bill : decor?.continuous ? '连续放置已开启 · 关闭后每次只放一件' + bill : '按住已摆家具可直接拖动 · 选物品后点格子放置' + bill;
    if (ui.decorTab === 'furn' && decor?.cfg.freeBuild) {
      const guide = BUILD_SLOPED_ROOF_IDS.includes(decor.sel)
        ? '单坡接长边 · 外角向外拐 / 内角向内收 · 旋转对齐坡面'
        : ['home', 'kitchen', 'bathroom'].includes(ui.decorCategory) ? '室内家具需墙、门窗围合，以楼板或屋顶封顶；楼梯井可连通封闭的上层'
        : `悬挑最多 5 格 · 布局最大支撑距离 ${decor.supportDistance || 0} 格 · 绿稳固 / 黄临界 / 红不可放`;
      tip = (decor.placementError || (decor.snapJoined ? '已对齐相邻构件 · ' : '') + guide) + bill;
    }
    if (decor?.furnitureDrag?.active) {
      hideTip = false;
      tip = (decor.furnitureDrag.ok ? '松手确认移动 · Esc 或撤销取消' : '这里放不下 · 松手会回到原位') + bill;
    }
    if (decor?.cameraMode !== 'place') {
      hideTip = false;
      tip = (decor.cameraMode === 'pan' ? '拖动画面平移' : '拖动画面旋转') + ' · 双指 / 滚轮缩放 · 完成视角后继续摆放';
    }
    setClass(ui.decorTip, 'hide', hideTip);
    setText(ui.decorTip, tip);
  }
}

function refreshRepeatTools(ui, decor) {
  if (ui.decorRepeat) {
    setText(ui.decorRepeat, decor?.continuous ? '连续放置：开' : '连续放置：关');
    setAttribute(ui.decorRepeat, 'aria-pressed', String(!!decor?.continuous));
    setAttribute(ui.decorPickup, 'aria-pressed', String(!!decor?.pickupMode));
  }
}

function refreshFurnitureCatalog(ui, decor) {
  const sel = ui.game.town ? ui.game.town.decor.sel : null;
  for (const el of ui.decorSlots) {
    const n = S.decor[el._id] || 0;
    setText(el._cnt, LOCAL_PLAY ? '∞' : n);
    setClass(el._cnt, 'hide', !LOCAL_PLAY && !n);
    setClass(el, 'sel', el._id === sel);
    setProperty(el.style, 'opacity', LOCAL_PLAY || n || S.coins - (decor?.pendingCost || 0) >= DECO[el._id].price ? '1' : '0.5');
    if (LOCAL_PLAY) setText(el.querySelector('.price'), '免费');
    const def = DECO[el._id], indoor = !!decor?.cfg.indoor, both = def.indoor === 'both';
    const category = isYardStructure(el._id) ? def.category : def.category || (def.indoor === true ? 'home' : 'garden');
    const invalidZone = decor?.cfg.freeBuild ? ['plot', 'bigplot', 'pond'].includes(el._id) : isYardStructure(el._id) || (!both && !!def.indoor !== indoor);
    setClass(el, 'hide', invalidZone || (!LOCAL_PLAY && !!def.only && !n) || (ui.decorCategory !== 'all' && category !== ui.decorCategory));
  }
}

function refreshFloorCatalog(ui, decor) {
  const fs = ui.game.town ? ui.game.town.decor.floorSel : null;
  for (const el of ui.floorSlots) {
    setClass(el, 'sel', el._id === fs);
    const f = FLOORS.find((x) => x.id === el._id);
    setClass(el, 'lockd', !LOCAL_PLAY && f.mile !== undefined && !S.live.miles.includes(f.mile));
    if (LOCAL_PLAY) setText(el.querySelector('.price'), '免费');
  }
}

// 无参数完整刷新仍是公开兼容入口；金额、解锁、库存、区域等变化都在这里收口。
export function refreshDecor() {
  const decor = this.game.town?.decor;
  refreshHistoryState(this, decor);
  if (!this.decorSlots) return;
  this.refreshDecorAccess();
  refreshFilters(this, decor);
  refreshCameraControls(this, decor);
  refreshWallTools(this, decor);
  refreshHint(this, decor);
  refreshRepeatTools(this, decor);
  refreshFurnitureCatalog(this, decor);
  refreshFloorCatalog(this, decor);
}

// 隔断拖动会改变 canUndo，所以预览同时刷新撤销按钮；不遍历家具/地面目录。
export function refreshDecorPreview() {
  const decor = this.game.town?.decor;
  refreshHistoryState(this, decor);
  if (!this.decorSlots) return;
  refreshHint(this, decor);
}

// 切到相机模式会取消当前指针操作，也必须立即同步撤销状态。
export function refreshDecorCamera() {
  const decor = this.game.town?.decor;
  refreshHistoryState(this, decor);
  if (!this.decorSlots) return;
  refreshCameraControls(this, decor);
  refreshHint(this, decor);
}
