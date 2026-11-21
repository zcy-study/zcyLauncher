'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { uid } = require('./store');

const SNAP_INTERVAL_HINT = 2500;
const GRACE_MISS = 2;          // 连续两次采样都判定为"不在运行"才结束（约 5 秒容错）
const HARD_FAIL_MS = 45000;    // 启动后 45 秒内一直没出现进程 -> 判失败
const HEARTBEAT_MS = 30000;    // 30 秒落一次盘
const MIN_COUNT_SECONDS = 10;  // 少于 10 秒的会话不计入统计

class Tracker extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.watcher = null;
    this.buffer = '';
    this.snapshot = new Map();
    this.children = new Map();
    this.sessions = new Map(); // gameId -> runtime session
    this.stoppingTimer = null;
  }

  /* ---------------- 进程快照 ---------------- */

  ensureWatcher() {
    if (this.watcher) return;
    const script = path.join(__dirname, 'procwatch.ps1');
    let ps;
    try {
      ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } catch (err) {
      this.emit('error', '无法启动进程监视器：' + err.message);
      return;
    }
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk) => this._onChunk(chunk));
    ps.on('error', () => { this.watcher = null; });
    ps.on('exit', () => { this.watcher = null; });
    this.watcher = ps;
  }

  releaseWatcherSoon() {
    if (this.stoppingTimer) clearTimeout(this.stoppingTimer);
    this.stoppingTimer = setTimeout(() => {
      this.stoppingTimer = null;
      if (this.sessions.size > 0) return;
      if (this.watcher) {
        try { this.watcher.kill(); } catch (_) { /* ignore */ }
        this.watcher = null;
      }
      this.snapshot.clear();
      this.children.clear();
    }, 6000);
  }

  _onChunk(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.startsWith('SNAP ')) continue;
      try {
        const rows = JSON.parse(line.slice(5));
        this._applySnapshot(rows);
      } catch (_) {
        /* 半行/坏行忽略 */
      }
    }
    if (this.buffer.length > 8 * 1024 * 1024) this.buffer = '';
  }

  _applySnapshot(rows) {
    const map = new Map();
    const children = new Map();
    for (const row of rows) {
      if (!row || typeof row.i !== 'number') continue;
      map.set(row.i, { pid: row.i, ppid: row.p || 0, n: row.n || '', exe: row.e || '' });
      if (row.p) {
        if (!children.has(row.p)) children.set(row.p, []);
        children.get(row.p).push(row.i);
      }
    }
    this.snapshot = map;
    this.children = children;
    this.evaluate();
  }

  /* ---------------- 会话 ---------------- */

  isRunning(gameId) {
    return this.sessions.has(gameId);
  }

  getRuntime() {
    const list = [];
    for (const s of this.sessions.values()) {
      list.push({
        gameId: s.gameId,
        startedAt: s.startedAt,
        runningSince: s.runningSince,
        seconds: Math.round(s.accMs / 1000),
        waiting: !s.runningSince
      });
    }
    return list;
  }

  launch(game) {
    if (this.sessions.has(game.id)) {
      return { ok: false, error: '这个游戏已经在计时中' };
    }
    if (!game.exePath || !fs.existsSync(game.exePath)) {
      return { ok: false, error: '找不到启动文件：' + game.exePath };
    }
    const workDir = game.workDir && fs.existsSync(game.workDir) ? game.workDir : path.dirname(game.exePath);

    let child;
    try {
      child = spawn(game.exePath, [], {
        cwd: workDir,
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: false
      });
    } catch (err) {
      return { ok: false, error: '启动失败：' + err.message };
    }
    child.on('error', (err) => {
      this.emit('launch-error', { gameId: game.id, message: err.message });
    });
    try { child.unref(); } catch (_) { /* ignore */ }

    const now = Date.now();
    const runtime = {
      id: uid('s'),
      gameId: game.id,
      gameName: game.name,
      dir: (game.workDir || path.dirname(game.exePath) || '').replace(/[\\/]+$/, ''),
      mode: game.trackMode || 'folder',
      modeValue: game.trackValue || '',
      initialDelay: Number.isFinite(game.initialDelay) ? game.initialDelay : 6000,
      pid: child.pid,
      startedAt: now,
      runningSince: null,
      accMs: 0,
      lastAccumAt: 0,
      missCount: 0,
      lastBeatAt: 0,
      finishing: false
    };
    this.sessions.set(game.id, runtime);

    this.store.addSession({
      id: runtime.id,
      gameId: game.id,
      startedAt: now,
      endedAt: null,
      seconds: 0,
      reason: null,
      heartbeatAt: now,
      counted: false
    });

    this.ensureWatcher();
    if (this.stoppingTimer) { clearTimeout(this.stoppingTimer); this.stoppingTimer = null; }
    this.emit('started', { gameId: game.id, name: game.name });
    setTimeout(() => this.evaluate(), 800);
    return { ok: true, pid: child.pid, sessionId: runtime.id };
  }

  evaluate() {
    if (this.sessions.size === 0) return;
    const now = Date.now();
    for (const s of Array.from(this.sessions.values())) {
      if (s.finishing) continue;
      const matched = this._match(s);

      if (matched) {
        s.missCount = 0;
        if (!s.runningSince) {
          s.runningSince = now;
          s.lastAccumAt = now;
        } else {
          s.accMs += Math.min(now - s.lastAccumAt, SNAP_INTERVAL_HINT * 2.4);
          s.lastAccumAt = now;
        }
      } else if (s.runningSince) {
        if (now - s.startedAt >= s.initialDelay) {
          s.missCount += 1;
          if (s.missCount >= GRACE_MISS) this._finish(s, 'exited');
        }
      } else if (now - s.startedAt >= s.initialDelay && now - s.startedAt > HARD_FAIL_MS) {
        this._finish(s, 'failed');
      }

      if (s.accMs - s.lastBeatAt > HEARTBEAT_MS) {
        s.lastBeatAt = s.accMs;
        this.store.updateSession(s.id, { heartbeatAt: s.runningSince ? Date.now() : s.startedAt });
      }
    }
  }

  _match(s) {
    const map = this.snapshot;
    if (map.size === 0) return false;

    if (s.mode === 'folder') {
      if (!s.dir) return map.has(s.pid);
      const dir = s.dir.toLowerCase().replace(/\//g, '\\') + '\\';
      for (const p of map.values()) {
        if (!p.exe) continue;
        if (p.exe.toLowerCase().replace(/\//g, '\\').startsWith(dir)) return true;
      }
      return false;
    }

    if (s.mode === 'name') {
      const target = (s.modeValue || '').toLowerCase().trim();
      if (!target) return false;
      for (const p of map.values()) {
        if ((p.n || '').toLowerCase() === target) return true;
      }
      return false;
    }

    if (s.mode === 'original') {
      return map.has(s.pid);
    }

    // process：自身或任意后代
    if (map.has(s.pid)) return true;
    const stack = [s.pid];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      const kids = this.children.get(cur);
      if (!kids) continue;
      for (const kid of kids) {
        if (seen.has(kid)) continue;
        seen.add(kid);
        if (map.has(kid)) return true;
        stack.push(kid);
      }
    }
    return false;
  }

  stop(gameId) {
    const s = this.sessions.get(gameId);
    if (!s) return { ok: false, error: '没有运行中的会话' };
    this._finish(s, 'stopped');
    return { ok: true };
  }

  _finish(s, reason) {
    if (s.finishing) return;
    s.finishing = true;
    const now = Date.now();
    if (s.runningSince) {
      s.accMs += Math.min(now - s.lastAccumAt, SNAP_INTERVAL_HINT * 2.4);
    }
    const seconds = Math.max(0, Math.round(s.accMs / 1000));
    const counted = seconds >= MIN_COUNT_SECONDS;
    const endedAt = now;

    this.sessions.delete(s.gameId);
    this.store.updateSession(s.id, {
      endedAt,
      seconds,
      reason,
      counted,
      heartbeatAt: endedAt
    });

    if (counted) {
      const game = this.store.findGame(s.gameId);
      if (game) {
        this.store.updateGame(game.id, {
          totalSeconds: (game.totalSeconds || 0) + seconds,
          launchCount: (game.launchCount || 0) + 1,
          firstPlayedAt: game.firstPlayedAt || s.startedAt,
          lastPlayedAt: endedAt,
          status: game.status === 'unplayed' ? 'playing' : game.status
        });
      }
    }

    this.emit('ended', { gameId: s.gameId, seconds, counted, reason });
    this.releaseWatcherSoon();
  }
}

module.exports = { Tracker };
