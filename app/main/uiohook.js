'use strict';

/** 全局鼠标侧键监听（uiohook-napi 可选依赖，缺失时自动降级成只用键盘快捷键） */

let mod = null;
try {
  // eslint-disable-next-line global-require
  mod = require('uiohook-napi');
} catch (_) {
  mod = null;
}

const state = { started: false, enabled: false, button: 'x1', handler: null };

function available() {
  return !!mod;
}

function start(handler) {
  state.handler = handler;
  if (!mod || state.started) return state.started;
  try {
    mod.uIOhook.on('mousedown', (e) => {
      if (!state.enabled || !state.handler) return;
      if (state.button === 'x1' && e.button === 4) state.handler('mouse');
      else if (state.button === 'x2' && e.button === 5) state.handler('mouse');
    });
    mod.uIOhook.start();
    state.started = true;
  } catch (_) {
    state.started = false;
  }
  return state.started;
}

function configure(enabled, button) {
  state.enabled = !!enabled;
  state.button = button || 'x1';
}

function stop() {
  if (mod && state.started) {
    try { mod.uIOhook.stop(); } catch (_) { /* ignore */ }
    state.started = false;
  }
}

module.exports = { available, start, configure, stop };
