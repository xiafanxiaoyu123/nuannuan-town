// 横屏专项：独立资料目录/普通测试 slot；真实 Chromium 点击、滚轮和四轨触摸。
// 使用 live_harness 的本机 5173 服务；LIVE_QA_OUT 必须由本轮启动器指向新目录。
const { suite } = require('./live_harness.js');

suite('landscape_wardrobe', async q => {
  const cdp = (method, args) => q.window.webContents.debugger.sendCommand(method, args);
  const wheel = async (selector, deltaX, deltaY) => {
    const point = await q.run(`
      const el = document.querySelector(${JSON.stringify(selector)});
      assert(el, '滚动区域不存在');
      const r = el.getBoundingClientRect();
      const point = {x: r.x + r.width / 2, y: r.y + r.height / 2};
      assert(el.contains(document.elementFromPoint(point.x, point.y)), '滚动区域被遮挡');
      return point;
    `);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await q.sleep(100);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX, deltaY });
    await q.sleep(350);
  };
  const quad = async selector => {
    const { result } = await cdp('Runtime.evaluate', { expression: 'document.querySelector(' + JSON.stringify(selector) + ')' });
    if (!result.objectId || result.subtype === 'null') throw new Error('轨道不存在：' + selector);
    try {
      const { model } = await cdp('DOM.getBoxModel', { objectId: result.objectId });
      return Array.from({ length: 4 }, (_, i) => ({ x: model.border[i * 2], y: model.border[i * 2 + 1] }));
    } finally { await cdp('Runtime.releaseObject', { objectId: result.objectId }); }
  };

  for (const [width, height] of [[640, 360], [866, 412], [1280, 800]]) {
    const label = width + 'x' + height;
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await q.profile({ width, height, preview: false });
    await q.run(`
      qaPump = false; engine.renderer.setAnimationLoop(null);
      window.w = __game.wardrobe;
      await __game.openWardrobe('shop');
      assert(w.canEditOutfit(), '衣橱会话不可用');
      window.qaRect = el => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      window.qaVisible = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
      window.qaClothIds = () => [...w.grid.querySelectorAll('[data-cloth-id]')].map(el => el.dataset.clothId);
      window.qaExpected = filter => dd.CLOTHES.filter(c => c.cat === w.cat && (!c.only || st.S.owned.includes(c.id))
        && (filter === 'all' || (filter === 'owned' ? st.S.owned.includes(c.id) : c.style === filter))).map(c => c.id).sort();
      engine.renderer.render(w.scene, w.camera);
    `);
    await q.sleep(180);
    await q.check(label + ' 衣橱面板和32px筛选标签完整布局', `
      const panel = qaRect(w.el.querySelector('.panel')), bar = qaRect(w.filterBar), grid = qaRect(w.grid);
      const list = w.el.querySelector('.wlist'), chips = [...w.filterBar.children].map(qaRect);
      assert(panel.left >= -1 && panel.top >= -1 && panel.right <= innerWidth + 1 && panel.bottom <= innerHeight + 1, '衣橱面板出屏');
      eq(getComputedStyle(list).flexDirection, 'column', '筛选与衣服必须上下排列');
      const expectedLabels = ['全部', '已拥有', ...Object.values(dd.STYLES).map(style => style.name)];
      eq([...w.filterBar.children].map(el => el.textContent), expectedLabels, '风格筛选应完整覆盖实际数据表');
      assert(chips.every(r => Math.abs(r.height - 32) < .6), '筛选按钮不是32px或被拉长：' + JSON.stringify(chips));
      assert(chips.every(r => Math.abs(r.top - chips[0].top) < .6), '筛选应保持同一横行');
      assert(bar.bottom <= grid.top + 1 && bar.height < 50, '筛选没有紧凑地位于衣服上方');
      assert(grid.height >= 80 && grid.width >= 200, '筛选挤占衣服浏览区');
      assert(grid.left >= panel.left && grid.right <= panel.right + 1 && grid.bottom <= panel.bottom + 1, '衣服列表出面板');
      assert(list.scrollWidth <= list.clientWidth + 1, '列表容器横向溢出');
      assert(!w.el.querySelector('.wgrab'), '残留竖屏拉高按钮');
      eq(qaClothIds().sort(), qaExpected('all'), '全部服饰列表不完整');
      return { viewport: [innerWidth, innerHeight], panel, bar, grid, chips };
    `);
    await q.shot(label + '_wardrobe_filters');

    const horizontal = await q.run(`
      w.filterBar.scrollLeft = 0;
      return { scrollWidth: w.filterBar.scrollWidth, clientWidth: w.filterBar.clientWidth, before: w.filterBar.scrollLeft };
    `);
    if (horizontal.scrollWidth > horizontal.clientWidth + 1) {
      await wheel('.wardrobe .wfilters', 480, 0);
      await q.check(label + ' 筛选条真实横向滚轮可达右端', `
        assert(w.filterBar.scrollLeft > 0, '横向滚轮未移动筛选条');
        const grid = qaRect(w.grid), bar = qaRect(w.filterBar);
        assert(bar.bottom <= grid.top + 1, '横滑后筛选脱离列表上方');
        return { scrollLeft: w.filterBar.scrollLeft, scrollWidth: w.filterBar.scrollWidth, clientWidth: w.filterBar.clientWidth };
      `);
    } else {
      await q.check(label + ' 宽屏筛选无需横滑且全部可见', `
        assert(w.filterBar.scrollWidth <= w.filterBar.clientWidth + 1, '筛选仍需滚动');
        assert([...w.filterBar.children].every(el => { const a = qaRect(el), b = qaRect(w.filterBar); return a.left >= b.left - 1 && a.right <= b.right + 1; }), '筛选项未完整可见');
        return { scrollWidth: w.filterBar.scrollWidth, clientWidth: w.filterBar.clientWidth };
      `);
    }
    // 当前四种风格加两种状态在640px横屏也能放下。另用受限容器夹具覆盖
    // 未来更多筛选项/更窄可用空间下的横滑，明确不冒充正常640px发生溢出。
    if (width === 640 && horizontal.scrollWidth <= horizontal.clientWidth + 1) {
      await q.run(`window.qaFilterWidthBefore = w.filterBar.style.width; w.filterBar.style.width = '210px'; w.filterBar.scrollLeft = 0;`);
      await wheel('.wardrobe .wfilters', 480, 0);
      await q.check(label + ' 受限210px筛选容器仍可真实横滑', `
        assert(w.filterBar.scrollWidth > w.filterBar.clientWidth, '受限容器未形成滚动边界');
        assert(w.filterBar.scrollLeft > 0, '受限容器不能横滑');
        assert([...w.filterBar.children].every(el => Math.abs(qaRect(el).height - 32) < .6), '横滑夹具让筛选拉长');
        return { fixture: '210px filter container only', scrollLeft: w.filterBar.scrollLeft, scrollWidth: w.filterBar.scrollWidth, clientWidth: w.filterBar.clientWidth };
      `);
      await q.run(`w.filterBar.style.width = qaFilterWidthBefore; w.filterBar.scrollLeft = 0;`);
    }

    const style = await q.run(`
      const entries = Object.entries(dd.STYLES);
      const index = entries.length - 1, id = entries[index][0];
      assert(qaExpected(id).length > 0, '最右侧风格缺少可筛服饰');
      return { id, index: index + 2 };
    `);
    await q.click('.wardrobe .wfilter-chip', style.index);
    await q.check(label + ' 点击最右侧风格只显示该风格服饰', `
      eq(w.styleFilter, ${JSON.stringify(style.id)}, '最右侧筛选未触发');
      eq(qaClothIds().sort(), qaExpected(${JSON.stringify(style.id)}), '风格结果错误');
      eq(w.filterBar.querySelectorAll('[aria-pressed="true"]').length, 1, '筛选选中态不唯一');
      eq(w.grid.scrollTop, 0, '切换筛选后未回列表顶部');
      return { filter: w.styleFilter, ids: qaClothIds() };
    `);
    await q.click('.wardrobe .wfilter-chip', 1);
    await q.check(label + ' 已拥有筛选与真实拥有状态一致', `
      eq(w.styleFilter, 'owned', '已拥有未触发');
      assert(qaExpected('owned').length > 0, '普通存档缺少基础服饰');
      eq(qaClothIds().sort(), qaExpected('owned'), '混入未拥有或漏掉已拥有');
      return { ids: qaClothIds() };
    `);
    await q.click('.wardrobe .wfilter-chip', 0);
    await q.run(`
      eq(w.styleFilter, 'all', '全部筛选未恢复');
      assert(w.grid.scrollHeight > w.grid.clientHeight + 30, '实际服饰数量不足以验证纵向滚动');
      w.grid.scrollTop = 0; window.qaFilterBeforeScroll = qaRect(w.filterBar);
      window.qaWheelTrace = [];
      window.addEventListener('wheel', e => queueMicrotask(() => qaWheelTrace.push({ target: e.target.className, deltaX: e.deltaX, deltaY: e.deltaY, prevented: e.defaultPrevented })), { once: true, capture: true });
    `);
    await wheel('.wardrobe .wgrid', 0, 550);
    // 衣服缩略图重建时 Chromium 合成器的滚动提交可能晚于 wheel 回调；
    // 等待真实 scrollTop 变化，不用固定短延时假定滚动已经提交。
    await q.wait('w.grid.scrollTop > 20');
    await q.check(label + ' 衣服真实纵向滚动且筛选条固定在上方', `
      assert(w.grid.scrollTop > 20, '衣服列表未纵向滚动：' + JSON.stringify({ scrollTop: w.grid.scrollTop, scrollHeight: w.grid.scrollHeight, clientHeight: w.grid.clientHeight, overflowY: getComputedStyle(w.grid).overflowY, trace: qaWheelTrace }));
      const bar = qaRect(w.filterBar);
      assert(Math.abs(bar.top - qaFilterBeforeScroll.top) < .6 && Math.abs(bar.height - qaFilterBeforeScroll.height) < .6, '筛选条跟着衣服滚走');
      eq(w.el.querySelector('.wlist').scrollTop, 0, '整列被滚走');
      return { scrollTop: w.grid.scrollTop, bar };
    `);
    await q.click('.wardrobe .wtools-toggle');
    await q.check(label + ' 搭配工具显示时筛选与衣服列表真正隐藏', `
      assert(!w.toolsEl.hidden && qaVisible(w.toolsEl), '搭配工具不可见');
      eq(getComputedStyle(w.filterBar).display, 'none', '筛选hidden被CSS覆盖');
      eq(getComputedStyle(w.grid).display, 'none', '衣服列表hidden被CSS覆盖');
      const tool = qaRect(w.toolsEl), panel = qaRect(w.el.querySelector('.panel'));
      assert(tool.top >= panel.top && tool.bottom <= panel.bottom && tool.height >= 80, '搭配工具滚动区越界');
      return { tool, panel };
    `);
    await q.click('.wardrobe .wtools-close');
    await q.check(label + ' 返回列表恢复筛选和独立衣服滚动区', `
      assert(qaVisible(w.filterBar) && qaVisible(w.grid), '服饰与筛选未恢复');
      eq(getComputedStyle(w.toolsEl).display, 'none', '工具未隐藏');
      return { grid: qaRect(w.grid), filter: qaRect(w.filterBar) };
    `);
    await q.click('[data-wardrobe-subject="momo"]');
    await q.check(label + ' 大喵页面隐藏服饰筛选且斗篷正常显示', `
      eq(w.subject, 'momo', '未切换到大喵');
      eq(getComputedStyle(w.filterBar).display, 'none', '大喵页仍显示服饰筛选');
      assert(qaVisible(w.grid) && w.grid.querySelectorAll('[data-momo-cloak]').length > 1, '斗篷列表不可见');
      return { cloakCount: w.grid.querySelectorAll('[data-momo-cloak]').length, grid: qaRect(w.grid) };
    `);
    await q.click('[data-wardrobe-subject="nikki"]');
    await q.check(label + ' 返回暖暖后筛选恢复并保留正确结果', `
      eq(w.subject, 'nikki', '未回暖暖');
      assert(qaVisible(w.filterBar), '筛选没有恢复');
      eq(qaClothIds().sort(), qaExpected(w.styleFilter), '返回后的服饰筛选结果错误');
      return { filter: w.styleFilter, count: qaClothIds().length };
    `);
    await q.run(`await __game.closeWardrobe(); await openGame('tailor');
      g.clearNotes(); g.chart = []; g.ci = 0; window.qaSong = 10; g.songTime = () => qaSong;
      g.measureLanes(); engine.renderer.render(g.scene, g.camera);
    `);
    await q.sleep(150);
    const quads = await Promise.all([0, 1, 2, 3].map(i => quad('[data-tailor-lane="' + i + '"]')));
    await q.check(label + ' 裁缝四轨与操作键保持横屏可达', `
      eq(g.laneEls.length, 4, '轨道数');
      eq(g.keyEls.map(el => el.querySelector('.kbd').textContent), ['D', 'F', 'J', 'K'], '键位');
      const keys = g.keyEls.map(el => {
        const r = qaRect(el);
        assert(r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, '四轨按钮出屏');
        assert(r.width >= 56 && r.height >= 56, '四轨按钮触摸面积不足');
        assert(el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), '四轨按钮被挡');
        return r;
      });
      const quads = ${JSON.stringify(quads)};
      assert(quads.every(poly => poly.every(p => p.x >= -1 && p.x <= innerWidth + 1 && p.y >= 55 && p.y <= innerHeight + 1)), '四轨投影出屏');
      assert(quads.every(poly => poly[1].x - poly[0].x >= 44 && poly[2].x - poly[3].x >= 56), '远端/近端轨道过窄');
      return { keys, quads };
    `);
    await q.check(label + ' 裁缝暖暖与大喵实际模型顶点位于屏内', `
      const { THREE } = await import('/js/core/kit.js');
      g.scene.updateMatrixWorld(true); g.camera.updateMatrixWorld(true);
      const output = [];
      for (const [name, root] of [['暖暖', g.nikki.root], ['大喵', g.momo.root]]) {
        const points = [];
        root.traverse(mesh => {
          if (!mesh.isMesh || mesh === g.nikki.shadowBlob || mesh.name === 'character-contact-blob') return;
          for (let node = mesh; node; node = node.parent) if (!node.visible) return;
          if (![mesh.material].flat().some(m => m && m.visible && (!m.transparent || m.opacity > 0))) return;
          const position = mesh.geometry.getAttribute('position');
          for (let i = 0; i < position.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(g.camera);
            points.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
          }
        });
        assert(points.length > 0, name + '没有可见模型');
        const rect = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
        assert(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, name + '模型出屏：' + JSON.stringify(rect));
        output.push({ name, vertices: points.length, rect });
      }
      return output;
    `);
    await q.run(`for (let lane = 0; lane < 4; lane++) g.spawnNote({ lane, time: qaSong, dur: 0 });
      window.qaHitsBefore = g.stats.perfect; window.qaMissBefore = g.stats.miss; g.renderNotes(qaSong);
    `);
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const contacts = await q.run(`return g.keyEls.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { id: i + 11, x: r.x + r.width / 2, y: r.y + r.height / 2, radiusX: 4, radiusY: 4, force: 1 };
    });`);
    for (const point of contacts) {
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
    }
    await q.check(label + ' 四个横屏按钮真实触摸分别命中一次', `
      eq(g.stats.perfect - qaHitsBefore, 4, '四轨触摸丢失或重复计分');
      eq(g.stats.miss, qaMissBefore, '触摸造成误判');
      assert(!g.heldTouches.size && !g.heldPointers.size, '触摸释放后残留输入');
      return { perfect: g.stats.perfect, miss: g.stats.miss };
    `);
    await q.run(`engine.renderer.render(g.scene, g.camera);`);
    await q.shot(label + '_tailor');
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await q.run(`closeGame();`);
  }
});
