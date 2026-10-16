// 新系统逐步验收共用的小工具；只依赖随项目安装的 Electron 与 Node 内置库
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.suite = (name, tests) => {
  const stamp = Date.now(), out = path.resolve(process.env.LIVE_QA_OUT || ('tools/qa/out/' + name + '_' + stamp));
  fs.mkdirSync(out, { recursive: true });
  const profileDir = path.join(out, 'profile'); fs.mkdirSync(profileDir, { recursive: true });
  app.setPath('userData', profileDir); // 不与其他 Electron 进程争用默认 GPU 缓存
  const report = { name, checks: [], screenshots: [], errors: [], external: [], out };
  const runLog = path.join(out, 'run.log');
  let outputPipeBroken = false;
  const handleOutputError = (error) => {
    if (error?.code === 'EPIPE') { outputPipeBroken = true; return; }
    throw error;
  };
  // Electron 可能被启动器留下为孤儿进程；此时 stdout/stderr 的读端已关闭。
  // 把 EPIPE 当作“终端不可用”，继续把结果写进 run.log 和 report.json。
  process.stdout.on('error', handleOutputError);
  process.stderr.on('error', handleOutputError);
  const log = (s) => {
    fs.appendFileSync(runLog, String(s) + '\n');
    if (outputPipeBroken) return;
    try { process.stdout.write(String(s) + '\n'); }
    catch (error) { if (error?.code !== 'EPIPE') throw error; outputPipeBroken = true; }
  };
  let w, serial = 0;
  const run = (js) => w.webContents.executeJavaScript(`(async () => { ${js} })()`);
  const wait = async (condition) => {
    for (let i = 0; i < 160; i++) { if (await run(`return !!(${condition});`)) return; await sleep(100); }
    throw new Error('等待超时：' + condition);
  };
  const check = async (label, js) => {
    const detail = await run(js);
    report.checks.push({ label, pass: true, detail }); log('PASS ' + label); return detail;
  };
  const shot = async (label) => {
    await run('document.querySelectorAll(".toast").forEach((e) => e.remove());');
    await sleep(250); await w.webContents.capturePage(); await sleep(250);
    const file = path.join(out, label + '.png'); fs.writeFileSync(file, (await w.webContents.capturePage()).toPNG());
    report.screenshots.push(file);
  };
  const click = async (selector, index = 0) => {
    const p = await run(`
      const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; assert(e && !e.disabled, '按钮不可用：' + ${JSON.stringify(selector)});
      e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const b = e.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      assert(b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1, '按钮边界出屏');
      assert(e.contains(document.elementFromPoint(x, y)), '按钮被遮挡'); return { x, y };
    `);
    await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
    await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 });
    await sleep(100);
  };
  const load = async (slot, preview = true) => {
    await w.loadURL('http://localhost:5173/?' + (preview ? 'preview=1&' : '') + 'slot=' + slot);
    await wait('window.__game && window.__live');
    await run(`
      window.st = await import('/js/core/state.js'); window.live = (await import('/js/live/api.js')).live;
      window.ui = (await import('/js/ui/ui.js')).ui; window.engine = (await import('/js/core/app.js')).app;
      window.dd = await import('/js/data.js'); window.ld = await import('/js/live/data.js'); window.items = await import('/js/models/items.js');
      window.panels = await import('/js/live/panels.js');
      window.assert = (ok, msg) => { if (!ok) throw new Error(msg); };
      window.canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
      window.eq = (a, b, msg) => assert(JSON.stringify(canon(a)) === JSON.stringify(canon(b)), msg + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
      window.closePanels = () => { document.querySelectorAll('.veil .x').forEach((b) => b.click()); };
      window.wearSet = (id) => {
        st.S.outfit = { ...dd.DEFAULT_OUTFIT };
        for (const cat of ['hair','dress','shoes']) { const c = dd.CLOTHES.find((x) => x.set === id && x.cat === cat); assert(c, '套装部件'); st.S.outfit[cat] = c.id; if (!st.S.owned.includes(c.id)) st.S.owned.push(c.id); }
      };
      window.fitPanel = (selector) => {
        const el = document.querySelector(selector), m = el.closest('.modal') || el, b = m.getBoundingClientRect();
        assert(b.left >= -1 && b.top >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1, '面板出屏：' + selector);
        assert(el.scrollWidth <= el.clientWidth + 1, '内容横向溢出：' + selector);
        return { viewport: [innerWidth, innerHeight], box: [b.x, b.y, b.width, b.height], scroll: el.scrollHeight };
      };
      window.qaPump = true; window.qaTimer = setInterval(() => { if (qaPump) engine.frame(); }, 50);
      window.openGame = async (id, opts = {}) => {
        closePanels(); qaPump = false; __game.playOpts = { mode: 'level', stage: 1, ...opts };
        const mod = await import('/js/games/' + id + '.js'), C = Object.values(mod).find((v) => typeof v === 'function' && v.prototype?.tick);
        const g = new C(__game); engine.setView(g); window.g = g; g.resolve = () => {}; g.state = 'play';
        g.countEl.replaceChildren(); g.bonusIntro.remove(); g.onStart?.(); __game.busy = true; ui.showHUD(false); return g;
      };
      window.closeGame = () => { engine.setView(__game.town); __game.busy = false; __game.playOpts = null; ui.showHUD(true); qaPump = true; };
      const style = document.createElement('style'); style.textContent = '*{animation:none!important;transition:none!important}.veil{backdrop-filter:none!important}'; document.head.append(style);
      // 普通回归显式完成当前版本的引导；教程专项另行清空历史验证真实首次流程。
      for (const [id, tutorial] of Object.entries(dd.TUTORIALS)) st.S.tut[id] = tutorial.version || 1; st.S.quest = dd.QUESTS.length;
      __game.begin(false);
    `);
    await sleep(850);
  };
  const profile = async ({ old = false, width = 866, height = 412, tag = '', preview = true } = {}) => {
    w.setContentSize(width, height); const slot = name + '_' + stamp + '_' + serial++ + tag;
    await load(slot, preview);
    if (old) {
      await sleep(300);
      await run(`
        const d = JSON.parse(JSON.stringify(st.S)); delete d.live; delete d.seeds;
        d.coins = 2345; d.crops = { rose: 4 }; d.npc.man = { t: 8 }; d.shops.cafe.lv = 3;
        localStorage.setItem('nikki-block-town-save-v1:' + ${JSON.stringify(slot)}, JSON.stringify(d));
        assert(st.load(), '注入旧档后同步内存，避免 pagehide 保存覆盖测试数据');
      `);
      await load(slot, preview);
      await check(tag + ' 无S.live旧档兼容', `eq(st.S.coins, 2345, '旧金币'); eq(st.S.crops.rose, 4, '旧作物'); eq(st.S.shops.cafe.lv, 3, '旧店等级'); assert(st.S.live.book && st.S.seeds, '补新字段'); return true;`);
    }
    return slot;
  };
  app.whenReady().then(async () => {
    w = new BrowserWindow({ width: 866, height: 412, useContentSize: true, show: false, webPreferences: { offscreen: process.env.LIVE_QA_OFFSCREEN === '1', backgroundThrottling: false, partition: name + stamp } });
    w.webContents.on('console-message', (e) => { if (e.level === 'error') report.errors.push(e.message); });
    w.webContents.session.webRequest.onBeforeRequest((d, done) => {
      const u = new URL(d.url), bad = /^(https?|wss?):$/.test(u.protocol) && !['localhost','127.0.0.1','[::1]'].includes(u.hostname);
      if (bad) report.external.push(d.url); done({ cancel: bad });
    });
    await w.loadURL('about:blank'); w.webContents.debugger.attach('1.3');
    await w.webContents.debugger.sendCommand('Page.enable');
    await w.webContents.debugger.sendCommand('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
    await w.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.RealDate = Date; window.now = new Date('2026-10-07T12:00:00+08:00').getTime();
      window.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
      // 现实时间往后跳几天，小镇日历也跟着过几天（跨天类检查沿用）；setGame 直接跳到小镇日历的某月某日
      const dayIndex = (ms) => Math.floor((ms + 8 * 3600000) / 86400000);
      window.setNow = (iso) => { const before = dayIndex(now); now = new RealDate(iso).getTime(); const d = dayIndex(now) - before; if (window.st && d) { st.S.gday = Math.max(0, (st.S.gday || 0) + d); st.bus.emit('newDay', st.S.gday); } };
      window.setGame = (m, d) => { st.S.gday = 84 + ((m - 1) * 7 + (d - 1) - 14 + 84) % 84; st.bus.emit('newDay', st.S.gday); };
    ` });
    try {
      await tests({ run, check, shot, click, profile, load, wait, sleep, window: w, report });
      assertReport(); report.pass = true;
    } catch (e) { report.pass = false; report.failure = e.stack || String(e); log(report.failure); try { await shot('failure'); } catch (_) {} }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); log('REPORT ' + path.join(out, 'report.json'));
    app.exit(report.pass ? 0 : 1);
  }).catch((e) => { log(e.stack || String(e)); app.exit(1); });
  function assertReport() { if (report.errors.length || report.external.length) throw new Error(JSON.stringify({ errors: report.errors, external: report.external })); }
};
