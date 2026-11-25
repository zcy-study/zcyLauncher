'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, globalShortcut, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

const { Store } = require('./store');
const { Tracker } = require('./tracker');
const metadata = require('./metadata');
const { buildIco, buildAvatar } = require('./icon');
const shots = require('./shots');
const mouseHook = require('./uiohook');

/* ---------------- 路径 ---------------- */

const appPath = app.getAppPath();
const rootDir = path.basename(appPath).toLowerCase() === 'app' ? path.dirname(appPath) : appPath;

// 绿色化：Chromium 的缓存/配置也放进程序目录，不写 %APPDATA%
try {
  app.setPath('userData', path.join(rootDir, 'data', 'profile'));
} catch (_) { /* ignore */ }

const dataIdx = process.argv.indexOf('--data');
const dataOverride = dataIdx >= 0 ? process.argv[dataIdx + 1] : null;

const store = new Store(rootDir, dataOverride);
const tracker = new Tracker(store);

function logLine(message) {
  try {
    fs.appendFileSync(path.join(store.dataDir, 'launcher.log'), new Date().toISOString() + '  ' + message + '\n');
  } catch (_) { /* ignore */ }
}

logLine('启动 root=' + rootDir);

let mainWindow = null;
let tray = null;
let tickTimer = null;
let pendingRecovery = store.recoverSessions();

/* ---------------- 工具 ---------------- */

function toClient(game) {
  if (!game) return null;
  const coverUrl = game.cover
    ? pathToFileURL(store.coverFilePath(game.cover)).href + '?v=' + (game.coverVersion || 0)
    : null;
  return { ...game, coverUrl };
}

function statePayload() {
  return {
    games: store.games.map(toClient).sort((a, b) => (b.lastPlayedAt || b.addedAt) - (a.lastPlayedAt || a.addedAt)),
    settings: store.settings,
    running: tracker.getRuntime(),
    sessions: store.sessions.slice(-4000),
    dataDir: store.dataDir,
    version: app.getVersion()
  };
}

function pushState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:changed', statePayload());
  }
  refreshTray();
}

function toast(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', { message, type });
  }
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  const saved = store.settings.windowBounds || {};
  mainWindow = new BrowserWindow({
    width: saved.width || 1320,
    height: saved.height || 860,
    x: saved.x,
    y: saved.y,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#0A0A0D',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon: path.join(rootDir, 'assets', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(appPath, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(appPath, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.setZoomFactor(1);
    runScreenshotMode();
  });

  // 用户点回游戏后，就别再压在最上面了（刚弹出时的瞬时 blur 不算）
  mainWindow.on('blur', () => {
    if (topTimer && Date.now() - raisedAt > 700) releaseTop();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (typeof message === 'string' && (message.startsWith('scroll diag') || message.startsWith('[diag]'))) {
      console.log('[renderer]', message);
    }
  });

  mainWindow.on('close', (event) => {
    if (app.isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    showTrayNotice();
  });

  mainWindow.on('minimize', () => showTrayNotice());

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ---------------- 托盘 ---------------- */

function buildTrayIcon() {
  const ico = path.join(rootDir, 'assets', 'app-icon.ico');
  if (fs.existsSync(ico)) return nativeImage.createFromPath(ico);
  return nativeImage.createEmpty();
}

function refreshTray() {
  if (!tray) return;
  const running = tracker.getRuntime();
  const items = [
    { label: '打开 zcyGal 启动器', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else { createWindow(); } } }
  ];
  if (running.length) {
    items.push({ type: 'separator' });
    for (const r of running) {
      const g = store.findGame(r.gameId);
      items.push({ label: '正在游玩：' + (g ? g.name : r.gameId), enabled: false });
    }
  }
  items.push({ type: 'separator' });
  items.push({ label: '退出', click: () => { app.isQuitting = true; app.quit(); } });
  tray.setToolTip(running.length ? `${running.length} 个游戏正在计时` : 'zcyGal 启动器');
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  try {
    tray = new Tray(buildTrayIcon());
    tray.on('double-click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
    refreshTray();
  } catch (err) {
    console.warn('[tray] 创建失败', err.message);
  }
}

/* ---------------- IPC ---------------- */

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error('[ipc]', channel, err);
      return { ok: false, error: err.message || String(err) };
    }
  });
}

handle('state:get', () => {
  const recovery = pendingRecovery;
  pendingRecovery = [];
  return { ok: true, state: statePayload(), recovered: recovery.length };
});

handle('game:add', (input) => {
  if (!input || !input.exePath) return { ok: false, error: '请先选择启动文件' };
  if (!fs.existsSync(input.exePath)) return { ok: false, error: '启动文件不存在：' + input.exePath };
  const dup = store.games.find((g) => g.exePath.toLowerCase() === input.exePath.toLowerCase());
  if (dup) return { ok: false, error: '这个启动文件已经添加过了：' + dup.name };
  const game = store.addGame(input);
  if (!game.workDir || !fs.existsSync(game.workDir)) {
    store.updateGame(game.id, { workDir: path.dirname(game.exePath) });
  }
  pushState();
  return { ok: true, game: toClient(store.findGame(game.id)) };
});

handle('game:update', (id, patch) => {
  const game = store.updateGame(id, patch);
  if (!game) return { ok: false, error: '找不到这个游戏' };
  pushState();
  return { ok: true, game: toClient(game) };
});

handle('game:delete', (id) => {
  if (tracker.isRunning(id)) return { ok: false, error: '游戏正在计时中，先停止计时再删除' };
  const ok = store.removeGame(id);
  pushState();
  return ok ? { ok: true } : { ok: false, error: '找不到这个游戏' };
});

handle('game:pick-exe', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择游戏启动文件',
    properties: ['openFile'],
    filters: [{ name: '可执行文件', extensions: ['exe'] }]
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  return { ok: true, exePath: res.filePaths[0] };
});

handle('game:pick-cover', async (id) => {
  const game = store.findGame(id);
  if (!game) return { ok: false, error: '找不到这个游戏' };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择封面图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  const fileName = await metadata.copyLocalCover(store, id, res.filePaths[0]);
  store.updateGame(id, { cover: fileName, coverVersion: Date.now() });
  pushState();
  return { ok: true, game: toClient(store.findGame(id)) };
});

handle('meta:search', async (query) => {
  if (!query || !query.trim()) return { ok: false, error: '请先填写游戏名称' };
  try {
    const results = await metadata.searchVndb(query.trim());
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: '联网搜索失败：' + err.message };
  }
});

handle('meta:apply', async (id, item) => {
  const game = store.findGame(id);
  if (!game) return { ok: false, error: '找不到这个游戏' };
  const updated = store.updateGame(id, {
    originalName: (item && item.original) || game.originalName,
    developer: (item && item.developer) || game.developer,
    released: (item && item.released) || game.released,
    vndbId: (item && item.id) || game.vndbId
  });
  pushState();

  if (item && item.image) {
    metadata.downloadCover(store, id, item.image)
      .then((fileName) => {
        store.updateGame(id, { cover: fileName, coverVersion: Date.now() });
        pushState();
        toast('封面已更新');
      })
      .catch((err) => {
        toast('封面下载失败：' + err.message + '，可以改用本地图片', 'error');
      });
  }
  return { ok: true, game: toClient(updated), pending: !!(item && item.image) };
});

let clockPids = [];

/** 当前所有 electron.exe 的进程号，用来「启动前 / 启动后」做差，精确拿到本次拉起的时钟 */
function listElectronPids() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command',
      "(Get-Process -Name electron -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) -join ','"
    ], { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      const ids = String(stdout || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      resolve(ids);
    });
  });
}

async function launchClock() {
  const target = String(store.settings.clockPath || '').trim();
  if (!target) {
    toast('还没设置桌面时钟的启动文件', 'error');
    return;
  }
  if (!fs.existsSync(target)) {
    toast('找不到桌面时钟：' + target, 'error');
    return;
  }

  let beforeSet = new Set();
  try { beforeSet = new Set(await listElectronPids()); } catch (_) { /* ignore */ }

  const ext = path.extname(target).toLowerCase();
  try {
    let child;
    if (ext === '.vbs') {
      child = spawn('wscript.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true });
    } else if (ext === '.bat' || ext === '.cmd') {
      child = spawn('cmd.exe', ['/c', target], { detached: true, stdio: 'ignore', windowsHide: true });
    } else {
      child = spawn(target, [], { cwd: path.dirname(target), detached: true, stdio: 'ignore' });
    }
    child.unref();
  } catch (err) {
    toast('桌面时钟启动失败：' + err.message, 'error');
    return;
  }

  clockPids = [];
  setTimeout(async () => {
    try {
      const after = await listElectronPids();
      clockPids = after.filter((pid) => !beforeSet.has(pid));
      if (clockPids.length) logLine('clock launched pid=' + clockPids.join(','));
    } catch (_) { /* ignore */ }
  }, 2000);
}

function closeClock() {
  const pids = clockPids.filter((n) => Number.isFinite(n));
  clockPids = [];
  if (!pids.length) return;
  // 先确认这些 pid 现在仍然是 electron，避免 pid 被系统复用后误杀
  const script = '$ids=@(' + pids.join(',') + '); foreach($procId in $ids){' +
    ' $p=Get-Process -Id $procId -ErrorAction SilentlyContinue;' +
    " if($p -and $p.ProcessName -eq 'electron'){ & taskkill.exe /PID $procId /T /F | Out-Null } }";
  execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 15000 }, () => {});
  logLine('clock closed pid=' + pids.join(','));
}

/* ---------------- 截图 ---------------- */

const pendingShots = new Map();
let lastShotAt = 0;

function setupHotkeys() {
  const s = store.settings;
  try { globalShortcut.unregisterAll(); } catch (_) { /* ignore */ }
  if (s.screenshotEnabled && s.screenshotKey) {
    try {
      const ok = globalShortcut.register(s.screenshotKey, () => triggerScreenshot('key'));
      if (!ok) logLine('screenshot hotkey register failed: ' + s.screenshotKey);
    } catch (err) {
      logLine('screenshot hotkey error: ' + err.message);
    }
  }
  mouseHook.configure(s.screenshotEnabled, s.screenshotMouse);
  mouseHook.start(triggerScreenshot);
}

let topTimer = null;
let raisedAt = 0;

function releaseTop() {
  if (topTimer) { clearTimeout(topTimer); topTimer = null; }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.setAlwaysOnTop(false); } catch (_) { /* ignore */ }
  try { mainWindow.flashFrame(false); } catch (_) { /* ignore */ }
}

/** 把主窗口强行提到最前（全屏游戏里 focus() 往往抢不到前台，用置顶压上去） */
function raiseWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 挪到光标所在的那块屏，避免弹在另一块屏上看着像没反应
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const b = mainWindow.getBounds();
    const inside = b.x < area.x + area.width && b.x + b.width > area.x &&
      b.y < area.y + area.height && b.y + b.height > area.y;
    if (!inside) {
      mainWindow.setBounds({
        x: Math.round(area.x + (area.width - b.width) / 2),
        y: Math.round(area.y + (area.height - b.height) / 2),
        width: b.width,
        height: b.height
      });
    }
  } catch (_) { /* ignore */ }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  try { mainWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (_) { mainWindow.setAlwaysOnTop(true); }
  try { mainWindow.moveTop(); } catch (_) { /* ignore */ }
  mainWindow.focus();
  try { mainWindow.flashFrame(true); } catch (_) { /* ignore */ }

  raisedAt = Date.now();
  if (topTimer) clearTimeout(topTimer);
  topTimer = setTimeout(() => releaseTop(), 15000);
}

function restoreWindowState(pending) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (pending.wasHidden) mainWindow.hide();
    else if (pending.wasMinimized) {
      suppressNoticeUntil = Date.now() + 1500;
      mainWindow.minimize();
    }
  }, 260);
}

/* ---------------- 托盘提示 ---------------- */

let noticeWin = null;
let noticeTimer = null;
let lastNoticeAt = 0;
let suppressNoticeUntil = 0;

function closeTrayNotice() {
  if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
  if (noticeWin && !noticeWin.isDestroyed()) noticeWin.close();
  noticeWin = null;
}

function showTrayNotice() {
  if (app.isQuitting) return;
  if (store.settings.trayNotice === false) return;
  const now = Date.now();
  if (now < suppressNoticeUntil) return;
  if (now - lastNoticeAt < 1500) return;
  lastNoticeAt = now;

  closeTrayNotice();

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const w = 348;
  const h = 104;

  noticeWin = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(area.x + area.width - w - 8),
    y: Math.round(area.y + area.height - h - 8),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(appPath, 'preload-notify.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  noticeWin.setAlwaysOnTop(true, 'screen-saver');
  noticeWin.loadFile(path.join(appPath, 'renderer', 'notify.html'));
  noticeWin.once('ready-to-show', () => {
    if (noticeWin && !noticeWin.isDestroyed()) noticeWin.showInactive();
  });
  noticeWin.on('closed', () => { noticeWin = null; });

  // 渲染层 5 秒后自己关；这里多留一点兜底，防止页面卡住不关
  noticeTimer = setTimeout(() => closeTrayNotice(), 6500);
}

ipcMain.on('notice:close', () => closeTrayNotice());
ipcMain.on('notice:restore', () => {
  closeTrayNotice();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

async function captureScreen() {
  // 跟着鼠标走：侧键按下时光标在哪个屏就抓哪个屏，单屏就是主屏
  let display = screen.getPrimaryDisplay();
  try {
    const point = screen.getCursorScreenPoint();
    display = screen.getDisplayNearestPoint(point) || display;
  } catch (_) { /* ignore */ }

  const sf = display.scaleFactor || 1;
  // 请求物理像素尺寸（DIP × 缩放），避免被降采样
  const want = {
    width: Math.round(display.size.width * sf),
    height: Math.round(display.size.height * sf)
  };

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: want });
  if (!sources.length) throw new Error('没有可用的屏幕');

  let hit = sources.find((x) => x.display_id && String(x.display_id) === String(display.id));
  if (!hit) {
    const all = screen.getAllDisplays();
    const idx = all.findIndex((d) => d.id === display.id);
    hit = sources[idx] || sources[0];
  }
  return hit.thumbnail;
}

async function triggerScreenshot(source) {
  if (!store.settings.screenshotEnabled) return;
  const now = Date.now();
  if (now - lastShotAt < 800) return;
  lastShotAt = now;

  const running = tracker.getRuntime();
  if (!running.length) {
    toast('没有正在运行的游戏，截图已忽略', 'info');
    return;
  }
  const game = store.findGame(running[0].gameId);
  if (!game) return;

  try {
    const img = await captureScreen();
    const size = img.getSize();
    const tmp = path.join(app.getPath('temp'), 'zcygal-shot-' + now + '.png');
    fs.writeFileSync(tmp, img.toPNG());

    const id = 's' + now.toString(36);
    const alive = mainWindow && !mainWindow.isDestroyed();
    const wasHidden = alive ? !mainWindow.isVisible() : false;
    const wasMinimized = alive ? mainWindow.isMinimized() : false;
    pendingShots.set(id, { tmp, gameId: game.id, time: now, w: size.width, h: size.height, wasHidden, wasMinimized });

    if (mainWindow && !mainWindow.isDestroyed()) {
      raiseWindow();
      mainWindow.webContents.send('shot:preview', {
        id,
        gameId: game.id,
        gameName: game.name,
        time: now,
        w: size.width,
        h: size.height,
        url: pathToFileURL(tmp).href
      });
    }
  } catch (err) {
    toast('截图失败：' + err.message, 'error');
  }
}

handle('shot:save', (id) => {
  releaseTop();
  const pending = pendingShots.get(id);
  if (!pending) return { ok: false, error: '截图已失效' };
  pendingShots.delete(id);
  const game = store.findGame(pending.gameId);
  if (!game) {
    try { fs.unlinkSync(pending.tmp); } catch (_) { /* ignore */ }
    return { ok: false, error: '找不到游戏' };
  }
  try {
    const saved = shots.save(game, pending.tmp, pending.time);
    try { fs.unlinkSync(pending.tmp); } catch (_) { /* ignore */ }
    toast('✓ 已保存到「' + shots.FOLDER + '」', 'ok');
    pushState();
    restoreWindowState(pending);
    return { ok: true, file: saved.file, dir: saved.dir, time: saved.time };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

handle('shot:cancel', (id) => {
  releaseTop();
  const pending = pendingShots.get(id);
  if (pending) {
    pendingShots.delete(id);
    try { fs.unlinkSync(pending.tmp); } catch (_) { /* ignore */ }
    restoreWindowState(pending);
  }
  return { ok: true };
});

handle('shot:file', (payload) => {
  try {
    const src = payload || {};
    let file = null;

    if (src.pendingId) {
      const pending = pendingShots.get(src.pendingId);
      if (!pending) return { ok: false, error: '截图已失效' };
      file = pending.tmp;
    } else if (src.gameId && src.file) {
      const game = store.findGame(src.gameId);
      if (!game) return { ok: false, error: '找不到游戏' };
      const dir = shots.shotsDir(game);
      const full = path.join(dir, path.basename(src.file));
      if (!full.startsWith(dir) || !fs.existsSync(full)) return { ok: false, error: '图片不存在' };
      file = full;
    }

    if (!file) return { ok: false, error: '参数不对' };
    const buf = fs.readFileSync(file);
    return { ok: true, buf, bytes: buf.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

handle('shot:games', () => {
  const list = shots.scanAll(store.games).map((item) => {
    const cover = item.cover ? pathToFileURL(store.coverFilePath(item.cover)).href : null;
    return { ...item, coverUrl: cover };
  });
  return { ok: true, games: list };
});

handle('shot:list', (gameId) => {
  const game = store.findGame(gameId);
  if (!game) return { ok: false, error: '找不到游戏' };
  const res = shots.list(game);
  return {
    ok: true,
    dir: res.dir,
    game: { id: game.id, name: game.name },
    items: res.items.map((it) => ({
      file: it.file,
      time: it.time,
      size: it.size,
      url: pathToFileURL(it.path).href
    }))
  };
});

handle('shot:delete', (gameId, file) => {
  const game = store.findGame(gameId);
  if (!game) return { ok: false };
  return { ok: shots.remove(game, file) };
});

handle('shot:reveal', (gameId) => {
  const game = store.findGame(gameId);
  if (!game) return { ok: false };
  const dir = shots.shotsDir(game);
  try {
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  } catch (_) { /* ignore */ }
  return { ok: true, dir };
});

handle('shot:status', () => ({  enabled: !!store.settings.screenshotEnabled,
  mouse: mouseHook.available(),
  mouseButton: store.settings.screenshotMouse,
  key: store.settings.screenshotKey,
  running: tracker.getRuntime().length > 0
}));

handle('game:launch', (id) => {
  const game = store.findGame(id);
  if (!game) return { ok: false, error: '找不到这个游戏' };
  const res = tracker.launch(game);
  if (res.ok) {
    pushState();
    toast('已启动：' + game.name);
    if (store.settings.launchClock) launchClock();
    if (store.settings.minimizeOnLaunch && mainWindow) {
      // 收进托盘，别让启动器挡着游戏；要不要提示由「启动之后」里的子开关决定
      const wantNotice = !!store.settings.minimizeOnLaunchNotice;
      if (!wantNotice) suppressNoticeUntil = Date.now() + 2000;
      mainWindow.hide();
      if (wantNotice) showTrayNotice();
    }
  } else {
    toast(res.error, 'error');
  }
  return res;
});

handle('clock:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择桌面时钟的启动文件',
    properties: ['openFile'],
    filters: [
      { name: '启动脚本', extensions: ['vbs', 'exe', 'bat'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

handle('game:stop', (id) => {
  const res = tracker.stop(id);
  if (!res.ok) toast(res.error, 'error');
  return res;
});

handle('session:list', (gameId) => {
  const list = store.sessions
    .filter((s) => s.gameId === gameId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 200);
  return { ok: true, sessions: list };
});

handle('session:update', (id, seconds) => {
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return { ok: false, error: '找不到这条记录' };
  const game = store.findGame(session.gameId);
  const next = Math.max(0, Math.round(Number(seconds) || 0));
  const prev = session.seconds || 0;
  if (game && session.counted) {
    store.updateGame(game.id, { totalSeconds: Math.max(0, (game.totalSeconds || 0) - prev + next) });
  }
  store.updateSession(id, { seconds: next, counted: next >= 10, reason: 'manual' });
  pushState();
  return { ok: true };
});

handle('session:delete', (id) => {
  const ok = store.deleteSession(id);
  pushState();
  return ok ? { ok: true } : { ok: false, error: '找不到这条记录' };
});

handle('game:open-folder', (id) => {
  const game = store.findGame(id);
  if (!game) return { ok: false, error: '找不到这个游戏' };
  const dir = fs.existsSync(game.workDir) ? game.workDir : path.dirname(game.exePath);
  shell.openPath(dir);
  return { ok: true };
});

handle('app:open-data', () => {
  shell.openPath(store.dataDir);
  return { ok: true };
});

handle('settings:update', (patch) => {
  const settings = store.updateSettings(patch);
  if (patch && ('screenshotEnabled' in patch || 'screenshotKey' in patch || 'screenshotMouse' in patch)) {
    setupHotkeys();
  }
  pushState();
  return { ok: true, settings };
});

handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
  showTrayNotice();
  return { ok: true };
});

handle('window:toggle-max', () => {
  if (!mainWindow) return { ok: false };
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return { ok: true, maximized: mainWindow.isMaximized() };
});

handle('window:close', () => {
  if (mainWindow) mainWindow.close();
  return { ok: true };
});

/* ---------------- 追踪事件 ---------------- */

tracker.on('started', () => pushState());
tracker.on('ended', (info) => {
  const game = store.findGame(info.gameId);
  if (info.reason === 'failed') {
    toast('没能检测到游戏进程，时长未记录', 'error');
  } else if (info.counted) {
    toast(`本次游玩 ${formatShort(info.seconds)}${game ? '：' + game.name : ''}`);
  } else if (info.seconds > 0) {
    toast('本次不足 10 秒，未计入统计');
  }
  // 进程真的没了才关时钟；手动停止或启动失败不动它
  if ((info.reason === 'exited' || info.reason === 'crash') && store.settings.closeClockOnExit) {
    closeClock();
  }
  pushState();
});
tracker.on('launch-error', (info) => toast('启动失败：' + info.message, 'error'));
tracker.on('error', (message) => toast(message, 'error'));

function makeShortcut(target) {
  const out = target || path.join(path.dirname(rootDir), 'zcyGal.lnk');
  const ok = shell.writeShortcutLink(out, 'create', {
    target: process.execPath,
    args: `"${appPath}"`,
    cwd: rootDir,
    icon: path.join(rootDir, 'assets', 'app-icon.ico'),
    iconIndex: 0,
    description: 'zcyGal 本地游戏库启动器'
  });
  console.log(ok ? '[shortcut] created: ' + out : '[shortcut] failed');
  app.isQuitting = true;
  app.quit();
}

function formatShort(seconds) {  if (seconds < 60) return seconds + ' 秒';
  const m = Math.floor(seconds / 60);
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60} 分`;
}

function startTickLoop() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const runtime = tracker.getRuntime();
    if (runtime.length === 0) return;
    mainWindow.webContents.send('tracker:tick', runtime);
  }, 1000);
}

/* ---------------- 截图自检 ---------------- */

function runScreenshotMode() {
  const idx = process.argv.indexOf('--shot');
  if (idx < 0) return;
  const out = process.argv[idx + 1];
  const view = process.argv[idx + 2] || 'library';
  const delay = Number(process.argv[idx + 3] || 1200);
  const zoom = Number(process.argv[idx + 4] || 0);
  setTimeout(async () => {
    try {
      if (view !== 'library') {
        await mainWindow.webContents.executeJavaScript(
          `window.__shotView && window.__shotView(${JSON.stringify(view)})`
        );
        await new Promise((r) => setTimeout(r, 700));
      }
      if (zoom > 0) {
        mainWindow.webContents.setZoomFactor(zoom);
        await new Promise((r) => setTimeout(r, 500));
      }
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(out, image.toPNG());
      console.log('[shot] saved', out);
    } catch (err) {
      console.error('[shot] failed', err);
    }
    app.isQuitting = true;
    app.quit();
  }, delay);
}

/* ---------------- 生命周期 ---------------- */

const CLI_FLAGS = ['--mkshortcut', '--readshortcut', '--mkicon', '--mkavatar', '--cropimg', '--testclock', '--shot'];
const isCli = CLI_FLAGS.some((flag) => process.argv.includes(flag));

if (isCli) {
  // 命令行工具模式：换一个独立的 profile，避免和正在运行的实例抢锁/抢缓存
  try { app.setPath('userData', path.join(rootDir, 'data', 'profile-cli')); } catch (_) { /* ignore */ }
}

function handleCli() {
  const mkIdx = process.argv.indexOf('--mkshortcut');
  if (mkIdx >= 0) {
    makeShortcut(process.argv[mkIdx + 1]);
    return true;
  }

  const rdIdx = process.argv.indexOf('--readshortcut');
  if (rdIdx >= 0) {
    try {
      console.log(JSON.stringify(shell.readShortcutLink(process.argv[rdIdx + 1]), null, 2));
    } catch (err) {
      console.log('read failed: ' + err.message);
    }
    app.quit();
    return true;
  }

  const icIdx = process.argv.indexOf('--mkicon');
  if (icIdx >= 0) {
    const src = process.argv[icIdx + 1];
    const out = process.argv[icIdx + 2];
    const crop = (process.argv[icIdx + 3] || '').split(',').map(Number);
    try {
      let img = nativeImage.createFromPath(src);
      const size = img.getSize();
      if (crop.length === 4 && crop.every((n) => Number.isFinite(n))) {
        img = img.crop({ x: crop[0], y: crop[1], width: crop[2], height: crop[3] });
      }
      console.log('source ' + JSON.stringify(size));
      console.log('sizes ' + buildIco(nativeImage, img, out, out.replace(/\.ico$/i, '')));
    } catch (err) {
      console.log('icon failed: ' + err.message);
    }
    app.isQuitting = true;
    app.quit();
    return true;
  }

  const avIdx = process.argv.indexOf('--mkavatar');
  if (avIdx >= 0) {
    const src = process.argv[avIdx + 1];
    const out = process.argv[avIdx + 2];
    const size = Number(process.argv[avIdx + 3] || 160);
    try {
      const img = nativeImage.createFromPath(src);
      console.log('avatar ' + JSON.stringify(img.getSize()) + ' -> ' + size + 'px, ' + buildAvatar(img, out, size) + ' bytes');
    } catch (err) {
      console.log('avatar failed: ' + err.message);
    }
    app.isQuitting = true;
    app.quit();
    return true;
  }

  const ciIdx = process.argv.indexOf('--cropimg');
  if (ciIdx >= 0) {
    const src = process.argv[ciIdx + 1];
    const out = process.argv[ciIdx + 2];
    const [x, y, w, h] = (process.argv[ciIdx + 3] || '').split(',').map(Number);
    const scale = Number(process.argv[ciIdx + 4] || 1);
    try {
      let img = nativeImage.createFromPath(src).crop({ x, y, width: w, height: h });
      if (scale > 1) img = img.resize({ width: Math.round(w * scale), height: Math.round(h * scale), quality: 'best' });
      fs.writeFileSync(out, img.toPNG());
      console.log('[crop] ' + out);
    } catch (err) {
      console.log('[crop] failed: ' + err.message);
    }
    app.quit();
    return true;
  }

  const tcIdx = process.argv.indexOf('--testclock');
  if (tcIdx >= 0) {
    const cycle = process.argv.includes('--cycle');
    (async () => {
      console.log('[clock] path=' + store.settings.clockPath + ' enabled=' + store.settings.launchClock + ' autoClose=' + store.settings.closeClockOnExit);
      if (store.settings.launchClock) await launchClock();
      if (cycle) {
        await new Promise((r) => setTimeout(r, 4500));
        console.log('[clock] tracked pids=' + clockPids.join(','));
        closeClock();
        await new Promise((r) => setTimeout(r, 3000));
        console.log('[clock] remaining electron pids=' + (await listElectronPids()).join(','));
      }
      app.quit();
    })();
    return true;
  }

  return false;
}

if (isCli) {
  app.whenReady().then(() => {
    if (!handleCli()) {
      createWindow();
    }
  });
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    app.whenReady().then(() => {
      app.setAppUserModelId('com.zcy.gal.launcher');
      createWindow();
      createTray();
      startTickLoop();
      mouseHook.start(triggerScreenshot);
      setupHotkeys();
    });

    app.on('window-all-closed', () => {
      app.isQuitting = true;
      app.quit();
    });

    app.on('before-quit', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { store.updateSettings({ windowBounds: mainWindow.getBounds() }); } catch (_) { /* ignore */ }
      }
      store.save(true);
      if (tickTimer) clearInterval(tickTimer);
    });
  }
}
