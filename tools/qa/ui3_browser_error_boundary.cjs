// Error boundary for the UI 3.0 browser suite only; does not change the shared harness.
// Install once before q.profile/load. No network, profile or game-state mutation.
const BINDING = '__nuannuanUi3QaBoundary';
const shorten = value => String(value || '').slice(0, 360);
const locationOf = value => { try { const u = new URL(value); return u.protocol + '//' + u.host + u.pathname; } catch { return shorten(value).split('?')[0]; } };
async function installUi3BrowserErrorBoundary(q) {
  const contents = q.window.webContents;
  const report = { installed: true, boots: [], failures: [], consoleErrorsStillHandledByHarness: true };
  q.report.ui3ErrorBoundary = report;
  const failure = (kind, detail = {}) => {
    const entry = { kind, ...detail }; report.failures.push(entry);
    q.report.errors.push('UI3 ' + kind + ': ' + shorten(detail.message || detail.reason || detail.code || 'unexpected failure'));
  };
  contents.on('render-process-gone', (_event, detail) => failure('render-process-gone', { reason: shorten(detail.reason), exitCode: detail.exitCode }));
  contents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => failure('did-fail-load', {
    code: errorCode, message: shorten(errorDescription), location: locationOf(url), mainFrame: !!isMainFrame,
  }));
  contents.on('did-finish-load', () => report.boots.push({ phase: 'did-finish-load', location: locationOf(contents.getURL()) }));
  contents.debugger.on('message', (_event, method, params) => {
    if (method === 'Runtime.bindingCalled' && params.name === BINDING) {
      let entry;
      try { entry = JSON.parse(params.payload); } catch { failure('invalid-boundary-payload'); return; }
      if (entry.kind === 'boot') report.boots.push({ phase: shorten(entry.phase), location: locationOf(entry.location), readyState: shorten(entry.readyState), elapsedMs: entry.elapsedMs });
      else if (['window-error', 'unhandled-rejection', 'resource-error'].includes(entry.kind)) failure(entry.kind, {
        message: shorten(entry.message), name: shorten(entry.name), location: locationOf(entry.location), line: entry.line, column: entry.column,
      });
    } else if (method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails || {};
      failure('runtime-exception', { message: shorten(detail.exception?.description?.split('\n')[0] || detail.text), location: locationOf(detail.url), line: detail.lineNumber, column: detail.columnNumber });
    }
  });
  await contents.debugger.sendCommand('Runtime.enable');
  await contents.debugger.sendCommand('Runtime.addBinding', { name: BINDING });
  await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const send = (entry) => {
      try { const fn = globalThis[${JSON.stringify(BINDING)}]; if (typeof fn === 'function') fn(JSON.stringify(entry)); } catch {}
    };
    const text = (value) => { try { return String(value || '').slice(0, 360); } catch { return 'unprintable-error'; } };
    const where = (value) => { try { const u = new URL(value || location.href); return u.protocol + '//' + u.host + u.pathname; } catch { return ''; } };
    send({ kind: 'boot', phase: 'boundary-installed', location: where(location.href), readyState: document.readyState, elapsedMs: performance.now() });
    addEventListener('error', (event) => {
      if (event.target && event.target !== window) {
        send({ kind: 'resource-error', message: 'Failed resource: ' + text(event.target.tagName), location: where(event.target.src || event.target.href) });
      } else send({ kind: 'window-error', message: text(event.message), name: text(event.error?.name), location: where(event.filename), line: event.lineno, column: event.colno });
    }, true);
    addEventListener('unhandledrejection', (event) => send({ kind: 'unhandled-rejection', message: text(event.reason?.message || event.reason), name: text(event.reason?.name), location: where(location.href) }));
    addEventListener('DOMContentLoaded', () => send({ kind: 'boot', phase: 'dom-ready', location: where(location.href), readyState: document.readyState, elapsedMs: performance.now() }), { once: true });
  })();` });
  return {
    async recordReady(label) {
      const value = await q.run(`return { game: !!window.__game, live: !!window.__live, readyState: document.readyState, location: location.origin + location.pathname };`);
      report.boots.push({ phase: 'game-ready', label: shorten(label), ...value });
      if (!value.game || !value.live) failure('game-not-ready', { message: 'Missing game/live entry after profile load' });
      return value;
    },
    async assertClean() {
      if (report.failures.length) throw new Error('UI3 browser boundary caught ' + report.failures.length + ' startup/runtime/load failures');
      if (!report.boots.some(item => item.phase === 'boundary-installed') || !report.boots.some(item => item.phase === 'did-finish-load')) throw new Error('UI3 browser boundary did not observe a document boot');
      return { failures: 0, observedBootEvents: report.boots.length };
    },
  };
}
module.exports = { installUi3BrowserErrorBoundary };
