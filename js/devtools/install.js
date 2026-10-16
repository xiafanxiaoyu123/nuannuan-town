// 唯一接线处：把引擎/存档/同步的只读摘要交给诊断器，绝不调用每日刷新、保存或同步。
import { diagnostics } from './diagnostics.js';
export function installDiagnostics({ app, ui, bus, account, saveInfo, localPlay }) {
  let syncState = null;
  diagnostics.configure({
    overview: () => {
      const base = app.fpsCap ?? 60, cap = app.capNow ?? base;
      return { version: document.querySelector('meta[name="nuannuan-version"]')?.content,
        build: (document.querySelector('meta[name="nuannuan-build"]')?.content || 'source')
          + (document.querySelector('meta[name="nuannuan-build-id"]')?.content ? '-' + document.querySelector('meta[name="nuannuan-build-id"]').content : ''),
        platform: globalThis.NikkiNative || globalThis.Capacitor?.isNativePlatform?.() ? 'android' : globalThis.NikkiDesktop ? 'windows' : 'web',
        scene: app.view?.id || app.view?.constructor?.name, zone: app.view?.zone,
        viewport: [app.width, app.height], renderPixels: [app.canvas?.width, app.canvas?.height], pixelRatio: app.pixelRatio,
        quality: app.quality, modalOpen: ui.modals > 0, hidden: document.hidden,
        frameReason: document.hidden ? 'background' : !app.perf?.dynFps || !app.view?.dynFps ? 'fixed'
          : ui.modals > 0 ? 'menu' : cap > 0 && (base === 0 || cap < base) ? 'idle' : 'active' };
    },
    save: saveInfo,
    sync: () => ({ ...account.diagnosticsInfo, status: localPlay ? 'local-only' : syncState || account.diagnosticsInfo.status }),
    subscribe: () => {
      syncState = null;
      const events = { played: 'played', stateReplaced: 'stateReplaced', reset: 'reset', zoneChanged: 'zone',
        liveDaily: 'daily', decorChanged: 'decorChanged', questDone: 'questDone' };
      const off = Object.entries(events).map(([name, label]) => bus.on(name, () => diagnostics.event(label)));
      const sync = event => {
        const state = event.detail?.state;
        if (['ready', 'saved', 'error', 'logged-out', 'cancelled', 'conflict', 'local-only'].includes(state)) syncState = state;
        diagnostics.synced(state);
      };
      globalThis.addEventListener('nuannuan:sync', sync);
      return () => { off.forEach(dispose => dispose()); globalThis.removeEventListener('nuannuan:sync', sync); };
    },
  });
}
