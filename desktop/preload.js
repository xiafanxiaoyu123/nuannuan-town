'use strict';

// The renderer is sandboxed and receives only this small, read-only-shaped update
// surface.  No ipcRenderer, filesystem, shell, or arbitrary IPC channel is exposed.
const { contextBridge, ipcRenderer } = require('electron');

const UPDATE_EVENT = 'updates:state';
function argumentValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

// The main process validates the target and injects it through
// additionalArguments. Decode that value here; the legacy --api-base/env
// fallback keeps standalone QA launches working, while this sandbox never reads
// release-config.json itself. All configured targets use the app://game proxy so
// HttpOnly/Secure/SameSite cookies share one renderer origin.
function injectedApiBase() {
  const encoded = argumentValue('nikki-api-base');
  if (!encoded) return '';
  try { return decodeURIComponent(encoded); } catch (_) { return ''; }
}
const configuredApiBase = String(injectedApiBase() || argumentValue('api-base') || process.env.NIKKI_API_BASE || '').replace(/\/$/, '');
const requestBase = configuredApiBase ? 'app://game' : '';

const updates = {
  status() {
    return ipcRenderer.invoke('updates:status');
  },
  check() {
    return ipcRenderer.invoke('updates:check');
  },
  download() {
    return ipcRenderer.invoke('updates:download');
  },
  apply() {
    return ipcRenderer.invoke('updates:apply');
  },
  restart() {
    return ipcRenderer.invoke('updates:restart');
  },
  rollback() {
    return ipcRenderer.invoke('updates:rollback');
  },
  onStatus(listener) {
    if (typeof listener !== 'function') return () => {};
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on(UPDATE_EVENT, wrapped);
    return () => ipcRenderer.removeListener(UPDATE_EVENT, wrapped);
  },
};

contextBridge.exposeInMainWorld('NikkiDesktop', Object.freeze({
  platform: process.platform,
  apiBase: configuredApiBase,
  requestBase,
  updates: Object.freeze(updates),
}));
// account.js reads this before its module body runs. Exposing a plain string
// keeps the API endpoint configurable without exposing ipcRenderer or env.
contextBridge.exposeInMainWorld('__NIKKI_API_BASE__', requestBase);

