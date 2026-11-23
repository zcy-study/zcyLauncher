'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notice', {
  close: () => ipcRenderer.send('notice:close'),
  restore: () => ipcRenderer.send('notice:restore')
});
