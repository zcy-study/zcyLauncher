'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  accent: 'gold',
  layout: 'grid',
  minimizeOnLaunch: false,
  launchClock: false,
  closeClockOnExit: true,
  clockPath: 'D:\\dsFile\\Clock.vbs',
  screenshotEnabled: false,
  screenshotKey: 'F9',
  screenshotMouse: 'x1',
  trayNotice: true,
  lockEnabled: false,
  lockPasswords: [
    { id: 'p_builtin', password: '0d000721', hint: '宁宁欧那尼', fixed: true }
  ],
  defaultTrackMode: 'folder',
  defaultInitialDelay: 6000,
  autoFetchCover: true,
  blurCovers: false
};

const BUILTIN_PASSWORD = '0d000721';

/** 内置密码永远存在、永远有效，任何改动后都要补回来 */
function normalizePasswords(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item.password !== 'string') continue;
    const password = item.password.trim();
    if (!password) continue;
    const key = password.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: typeof item.id === 'string' && item.id ? item.id : 'p_' + Math.random().toString(36).slice(2, 10),
      password: item.fixed || key === BUILTIN_PASSWORD ? BUILTIN_PASSWORD : password.slice(0, 64),
      hint: typeof item.hint === 'string' ? item.hint.slice(0, 80) : '',
      fixed: key === BUILTIN_PASSWORD
    });
    if (out.length >= 10) break;
  }
  if (!out.some((p) => p.fixed)) {
    const builtin = { id: 'p_builtin', password: BUILTIN_PASSWORD, hint: '宁宁欧那尼', fixed: true };
    out.unshift(builtin);
    if (out.length > 10) out.pop();
  }
  return out;
}

function settingsWithDefaults(parsed) {
  const merged = { ...DEFAULT_SETTINGS, ...(parsed || {}) };
  merged.lockPasswords = normalizePasswords(merged.lockPasswords);
  return merged;
}

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function emptyData() {
  return { version: 1, settings: settingsWithDefaults({}), games: [], sessions: [] };
}

class Store {
  constructor(rootDir, dataDirOverride) {
    this.root = rootDir;
    this.dataDir = dataDirOverride ? path.resolve(dataDirOverride) : path.join(rootDir, 'data');
    this.coverDir = path.join(this.dataDir, 'covers');
    this.file = path.join(this.dataDir, 'library.json');
    fs.mkdirSync(this.coverDir, { recursive: true });
    this.data = this._read();
    this._dirty = false;
    this._timer = null;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        settings: settingsWithDefaults(parsed.settings),
        games: (Array.isArray(parsed.games) ? parsed.games : []).map((g) => ({
          status: 'unplayed',
          clearSave: 'local',
          ...g
        })),
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        try {
          const bak = this.file + '.broken-' + Date.now();
          fs.copyFileSync(this.file, bak);
          console.error('[store] 数据文件损坏，已备份到', bak);
        } catch (_) { /* ignore */ }
      }
      return emptyData();
    }
  }

  save(immediate = false) {
    if (immediate) {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._flush();
      return;
    }
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this._flush();
    }, 500);
  }

  _flush() {
    this._dirty = false;
    const tmp = this.file + '.tmp';
    try {
      const json = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, this.file);
      this._lastWritten = json;
    } catch (err) {
      console.error('[store] 保存失败', err);
    }
  }

  /** 监听外部对 library.json 的修改（比如手动编辑、别处导入），自动重新载入 */
  watch() {
    if (this._watcher) return;
    try {
      this._watcher = fs.watch(this.dataDir, (event, filename) => {
        if (filename && filename !== path.basename(this.file)) return;
        clearTimeout(this._reloadTimer);
        this._reloadTimer = setTimeout(() => this._reloadIfChanged(), 300);
      });
      this._watcher.unref && this._watcher.unref();
    } catch (err) {
      console.error('[store] 监听失败', err);
    }
  }

  _reloadIfChanged() {
    let raw;
    try { raw = fs.readFileSync(this.file, 'utf8'); } catch (_) { return; }
    if (raw === this._lastWritten) return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return; }
    this.data = {
      version: 1,
      settings: settingsWithDefaults(parsed.settings),
      games: Array.isArray(parsed.games) ? parsed.games : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
    this._lastWritten = raw;
    if (typeof this.onExternalChange === 'function') this.onExternalChange();
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch || {});
    this.data.settings.lockPasswords = normalizePasswords(this.data.settings.lockPasswords);
    this.save(true);
    return this.data.settings;
  }

  get games() {
    return this.data.games;
  }

  get sessions() {
    return this.data.sessions;
  }

  findGame(id) {
    return this.data.games.find((g) => g.id === id) || null;
  }

  addGame(input) {
    const now = Date.now();
    const exePath = input.exePath;
    const game = {
      id: uid('g'),
      name: (input.name || path.basename(exePath, path.extname(exePath))).trim(),
      originalName: input.originalName || '',
      exePath,
      workDir: input.workDir || path.dirname(exePath),
      engine: input.engine || '',
      cover: null,
      coverVersion: 0,
      developer: input.developer || '',
      released: input.released || '',
      vndbId: input.vndbId || '',
      trackMode: input.trackMode || this.data.settings.defaultTrackMode || 'folder',
      trackValue: input.trackValue || '',
      initialDelay: Number.isFinite(input.initialDelay) ? input.initialDelay : this.data.settings.defaultInitialDelay,
      totalSeconds: 0,
      launchCount: 0,
      firstPlayedAt: null,
      lastPlayedAt: null,
      status: 'unplayed',
      clearSave: 'local',
      notes: '',
      tags: [],
      addedAt: now,
      updatedAt: now
    };
    this.data.games.push(game);
    this.save(true);
    return game;
  }

  updateGame(id, patch) {
    const game = this.findGame(id);
    if (!game) return null;
    const allowed = [
      'name', 'originalName', 'exePath', 'workDir', 'engine', 'cover',
      'developer', 'released', 'vndbId', 'trackMode', 'trackValue',
      'initialDelay', 'status', 'clearSave', 'notes', 'tags', 'coverVersion',
      'totalSeconds', 'launchCount', 'firstPlayedAt', 'lastPlayedAt'
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) game[key] = patch[key];
    }
    game.updatedAt = Date.now();
    this.save(true);
    return game;
  }

  removeGame(id) {
    const idx = this.data.games.findIndex((g) => g.id === id);
    if (idx < 0) return false;
    const [game] = this.data.games.splice(idx, 1);
    this.data.sessions = this.data.sessions.filter((s) => s.gameId !== id);
    if (game.cover) {
      try { fs.unlinkSync(path.join(this.coverDir, game.cover)); } catch (_) { /* ignore */ }
    }
    this.save(true);
    return true;
  }

  addSession(session) {
    this.data.sessions.push(session);
    this.save(true);
    return session;
  }

  updateSession(id, patch) {
    const session = this.data.sessions.find((s) => s.id === id);
    if (!session) return null;
    Object.assign(session, patch);
    this.save(true);
    return session;
  }

  deleteSession(id) {
    const idx = this.data.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const [session] = this.data.sessions.splice(idx, 1);
    const game = this.findGame(session.gameId);
    if (game && session.counted !== false) {
      game.totalSeconds = Math.max(0, (game.totalSeconds || 0) - (session.seconds || 0));
      game.launchCount = Math.max(0, (game.launchCount || 0) - 1);
    }
    this.save(true);
    return true;
  }

  /** 启动时把上次没正常结束的会话按心跳时间结算 */
  recoverSessions() {
    const recovered = [];
    for (const s of this.data.sessions) {
      if (s.endedAt) continue;
      const end = s.heartbeatAt || s.startedAt;
      const seconds = Math.max(0, Math.round((end - s.startedAt) / 1000));
      s.endedAt = end;
      s.seconds = seconds;
      s.reason = 'crash';
      s.counted = seconds >= 10;
      const game = this.findGame(s.gameId);
      if (game && s.counted) {
        game.totalSeconds = (game.totalSeconds || 0) + seconds;
        game.launchCount = (game.launchCount || 0) + 1;
        game.lastPlayedAt = end;
        if (!game.firstPlayedAt) game.firstPlayedAt = s.startedAt;
        if (game.status !== 'cleared' && (game.totalSeconds || 0) >= 1200) game.status = 'playing';
      }
      recovered.push(s);
    }
    if (recovered.length) this.save(true);
    return recovered;
  }

  coverFilePath(fileName) {
    return path.join(this.coverDir, fileName);
  }
}

module.exports = { Store, DEFAULT_SETTINGS, uid };
