'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  addGame: (input) => ipcRenderer.invoke('game:add', input),
  updateGame: (id, patch) => ipcRenderer.invoke('game:update', id, patch),
  deleteGame: (id) => ipcRenderer.invoke('game:delete', id),
  pickExe: () => ipcRenderer.invoke('game:pick-exe'),
  pickCover: (id) => ipcRenderer.invoke('game:pick-cover', id),
  searchMeta: (query) => ipcRenderer.invoke('meta:search', query),
  applyMeta: (id, item) => ipcRenderer.invoke('meta:apply', id, item),
  launch: (id) => ipcRenderer.invoke('game:launch', id),
  stop: (id) => ipcRenderer.invoke('game:stop', id),
  listSessions: (gameId) => ipcRenderer.invoke('session:list', gameId),
  updateSession: (id, seconds) => ipcRenderer.invoke('session:update', id, seconds),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),
  openFolder: (id) => ipcRenderer.invoke('game:open-folder', id),
  openData: () => ipcRenderer.invoke('app:open-data'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  pickClock: () => ipcRenderer.invoke('clock:pick'),
  shotFile: (payload) => ipcRenderer.invoke('shot:file', payload),
  shotGames: () => ipcRenderer.invoke('shot:games'),
  shotList: (gameId) => ipcRenderer.invoke('shot:list', gameId),
  shotSave: (id) => ipcRenderer.invoke('shot:save', id),
  shotCancel: (id) => ipcRenderer.invoke('shot:cancel', id),
  shotDelete: (gameId, file) => ipcRenderer.invoke('shot:delete', gameId, file),
  shotReveal: (gameId) => ipcRenderer.invoke('shot:reveal', gameId),
  shotStatus: () => ipcRenderer.invoke('shot:status'),
  onShotPreview: (cb) => ipcRenderer.on('shot:preview', (event, payload) => cb(payload)),
  winMinimize: () => ipcRenderer.invoke('window:minimize'),
  winToggleMax: () => ipcRenderer.invoke('window:toggle-max'),
  winClose: () => ipcRenderer.invoke('window:close'),
  onStateChanged: (cb) => ipcRenderer.on('state:changed', (_e, s) => cb(s)),
  onTick: (cb) => ipcRenderer.on('tracker:tick', (_e, r) => cb(r)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, t) => cb(t))
});
