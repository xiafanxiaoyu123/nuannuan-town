import { S, bus, save } from '../core/state.js';
import { h } from '../core/util.js';
import { buildQuestProgress } from '../world/build-island-rules.js';
import { BUILD_HOME_DOCK, BUILD_DOCK } from '../world/build-constants.js';

export function buildIslandPanel(game) {
  const ui = game.ui, identity = S;
  let modal, pending = false;
  const body = h('div', { class: 'build-island-panel' });
  const render = () => {
    const q = buildQuestProgress(S), atIsland = game.town.zone === 'build';
    const dock = atIsland ? BUILD_DOCK : BUILD_HOME_DOCK;
    const near = ['home', 'build'].includes(game.town.zone) && Math.hypot(game.town.pos.x - dock.x, game.town.pos.z - dock.z) <= 5;
    body.replaceChildren(...[
      h('h2', {}, atIsland ? '海风工坊岛' : q.titleMain),
      h('p', { class: 'build-story-step' }, atIsland ? '空白蓝图，由你慢慢画满' : `${Math.min(q.stage + 1, 3)} / 3 · ${q.title}`),
      h('p', {}, atIsland ? '这片独立空地只属于你的自由建造。原来的后院继续种菜、种树和摆放庭院装饰。' : q.text),
      (S.buildHeightArchive || []).some(a => a.source === 'buildPlaced' && a.blockedStairs > 0) && h('p', { class: 'fine build-migration-note' }, '已收回被楼板或屋顶遮挡的旧楼梯，请留出楼梯口后重新放置。原建筑布局已保留备份。'),
      !atIsland && h('p', { class: 'fine' }, q.hint),
      q.stage === 1 && h('div', { class: 'build-lunch' }, ...q.needs.map(n => h('span', { class: n.missing ? 'missing' : '' }, `${n.name} ${n.owned} / ${n.required}`))),
      q.stage === 1 && h('p', { class: 'fine build-apple-hint' }, '苹果获取：后院装修 → 摆放「果树田」→ 靠近空田选择苹果树苗 → 等待结果后采摘。'),
      h('div', { class: 'build-actions' },
        atIsland && h('button', { class: 'btn', onclick: () => { modal.close(true); game.openDecor(); } }, '开始自由建造'),
        h('button', { class: 'btn ' + (atIsland ? 'alt' : ''), disabled: pending || (near && !atIsland && !q.canAdvance), 'data-build-quest-action': atIsland ? 'return' : q.action,
          onclick: async () => {
            if (pending || S !== identity) return;
            if (!near) { S.settings.track = 'build-island'; S.settings.questOff = false; save(); bus.emit('quest'); ui.toast(atIsland ? '先到岛屿西岸的小船旁，沿任务指路前往' : '先到后院西边的小船旁，沿任务指路前往'); modal.close(true); return; }
            pending = true; render();
            const result = await game.buildIslandAction(atIsland ? 'return' : q.action, () => modal.close(true));
            pending = false;
            if (S === identity && !result?.depart) render();
          } }, near ? (atIsland ? '乘船回后院' : q.actionLabel) : '追踪码头位置')),
      h('details', { class: 'build-manual', open: atIsland }, h('summary', {}, '建造手册'),
        h('ol', {},
          h('li', {}, '房屋最多三楼：1楼在地面，2楼和3楼由阶梯连接；再往上只盖屋顶，不增加可摆家具的楼层。地面可直接铺地基、楼板。'),
          h('li', {}, '柱、墙和门窗框每段高 1 层，竖直连续接到地面才能承重；三楼的柱墙可承托屋顶。'),
          h('li', {}, '楼板沿连续的四邻格传递支撑，离有效支撑最多 5 格。第 6 格需补落地柱或墙链，斜角、空隙不能传递支撑；悬挑板上的柱墙不会重置距离。'),
          h('li', {}, '墙、门洞、窗墙和栏杆沿格边摆放，可与楼板共存。平屋顶可接楼梯作露台走动，继续搭墙或摆家具需铺楼板承托；斜屋顶不可行走。'),
          h('li', {}, '屋顶里可选双坡尖顶、单坡、外转角和内转角。单坡向一侧升高；向外拐用外转角，凹进去的拐角用内转角，旋转后让相邻斜边的高低方向一致。'),
          h('li', {}, '用墙、窗墙、门洞围成房间，以楼板或屋顶封顶，就能摆放厨房、卫浴和室内家具。楼梯井可连通封闭的上层，栏杆不能代替外墙。'),
          h('li', {}, '移动、旋转、收回、出售和应用方案都会检查整栋建筑；先处理受影响的上层结构，再拆承重部件。'),
          h('li', {}, '可连续放置、撤销、保存 3 套岛屿布局。通过「1楼 / 2楼 / 3楼 / 屋顶」选择摆放位置，使用屋顶显隐方便装修室内。')),
        atIsland && h('button', { class: 'btn alt sm', 'data-build-unstuck': '', onclick: () => {
          if (S !== identity || game.busy || game.town.decor.active) return;
          modal.close(true); game.town.setZone('build'); ui.toast('已回到岛上码头，可以重新出发');
        } }, '走不出来？回到岛上码头'))
    ].filter(Boolean));
  };
  render();
  const off = bus.on('stateReplaced', () => { if (S !== identity) modal?.close(true); });
  modal = ui.modal(body, { ribbon: '海风工坊岛', cls: 'live-modal build-island-modal', onClose: () => off?.() });
  return modal;
}
