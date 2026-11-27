'use strict';

/* ---------------- 基础工具 ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5 L18 12 L8 18.5 Z"/></svg>',
  playSm: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.5 L18 12 L8 18.5 Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l1.6 2h7.7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
};

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function placeholderStyle(name) {
  const h = hash(name || 'x');
  const hue = h % 360;
  const hue2 = (hue + 46) % 360;
  return `background:
    radial-gradient(120% 92% at 16% 2%, hsl(${hue} 44% 31% / 0.95), transparent 62%),
    radial-gradient(105% 78% at 90% 98%, hsl(${hue2} 40% 23% / 0.92), transparent 64%),
    linear-gradient(158deg, hsl(${hue} 22% 15%), #0C0C10 76%);`;
}

function initialOf(name) {
  const s = String(name || '?').trim();
  return s ? s.slice(0, 1) : '?';
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

function hoursText(sec) {
  if (!sec || sec < 30) return '—';
  if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
  return (sec / 3600).toFixed(1) + ' 小时';
}

function hoursShort(sec) {
  if (!sec || sec < 30) return '未开始';
  if (sec < 3600) return Math.round(sec / 60) + ' 分';
  return (sec / 3600).toFixed(1) + ' h';
}

/**
 * 卡片下方的小字：
 * 通关了就看存档在不在本地——不在本地光写「已通关」，在本地是「时长 · 已通关」
 */
function cardSub(g, running) {
  if (running) return '正在游玩';
  const time = hoursShort(g.totalSeconds);
  if (g.status !== 'cleared') return time;
  if (g.clearSave === 'external') return '<em>已通关</em>';
  return (g.totalSeconds && g.totalSeconds >= 30 ? time + ' · ' : '') + '<em>已通关</em>';
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDay(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const REASON_LABEL = {
  exited: '正常结束',
  stopped: '手动停止',
  crash: '崩溃恢复',
  failed: '未检测到',
  manual: '手动修改'
};

/* ---------------- 状态 ---------------- */

let state = { games: [], settings: {}, running: [], sessions: [], dataDir: '', version: '1.0.0' };
let view = 'library';
let query = '';
let sortBy = 'recent';
let openGameId = null;
let runtimeMap = new Map();
let pendingMeta = null;

const el = {
  grid: $('#grid'),
  empty: $('#emptyState'),
  libCount: $('#libCount'),
  libHint: $('#libHint'),
  detail: $('#detail'),
  hero: $('#view-hero'),
  strip: $('#gamestrip'),
  content: $('#content'),
  nowbar: $('#nowbar'),
  modalRoot: $('#modalRoot'),
  toasts: $('#toasts'),
  pageTitle: $('#pageTitle'),
  footHours: $('#footHours'),
  search: $('#searchInput'),
  sort: $('#sortSelect'),
  cleared: $('#view-cleared')
};

let heroId = null;

/* ---------------- 启动密码 ---------------- */

let locked = false;
let blankStreak = 0;
let wrongCount = 0;
let hintedCount = 0;

function lockPasswords() {
  return (state.settings && state.settings.lockPasswords) || [];
}

function showLock() {
  locked = true;
  blankStreak = 0;
  wrongCount = 0;
  hintedCount = 0;
  $('#lockScreen').classList.remove('hidden');
  $('#lockMsg').textContent = '';
  $('#lockHints').innerHTML = '';
  $('#lockHintBtn').classList.add('hidden');
  const field = $('#lockInput');
  field.value = '';
  field.type = 'password';
  $('#lockEye').classList.remove('is-on');
  $('#lockEye').title = '显示密码';
  setTimeout(() => field.focus(), 60);
}

function shakeLock() {
  const card = $('#lockCard');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

function unlockApp() {
  locked = false;
  $('#lockScreen').classList.add('hidden');
  $('#lockInput').value = '';
  $('#lockMsg').textContent = '';
}

function submitLock() {
  const input = $('#lockInput');
  const msg = $('#lockMsg');
  const value = input.value.trim();

  if (!value) {
    blankStreak++;
    if (blankStreak >= 3) { unlockApp(); return; }
    msg.textContent = '请输入密码';
    shakeLock();
    input.focus();
    return;
  }

  blankStreak = 0;
  const hit = lockPasswords().some((p) => String(p.password || '').toLowerCase() === value.toLowerCase());
  if (hit) { unlockApp(); return; }

  wrongCount++;
  msg.textContent = '密码错误';
  shakeLock();
  input.focus();
  try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) { /* ignore */ }

  if (wrongCount >= 10) {
    const btn = $('#lockHintBtn');
    btn.classList.remove('hidden');
    btn.textContent = `查看提示（${hintedCount}/${lockPasswords().length}）`;
  }
}

function bindLock() {
  $('#lockSubmit').addEventListener('click', submitLock);
  $('#lockInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitLock(); }
  });
  $('#lockEye').addEventListener('click', () => {
    const input = $('#lockInput');
    const eye = $('#lockEye');
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    eye.classList.toggle('is-on', reveal);
    eye.title = reveal ? '隐藏密码' : '显示密码';
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) { /* ignore */ }
  });
  $('#lockHintBtn').addEventListener('click', () => {
    const list = lockPasswords();
    if (hintedCount >= list.length) return;
    const item = list[hintedCount];
    hintedCount++;
    const li = document.createElement('li');
    li.textContent = `${hintedCount}. ${item.hint || '（没写提示）'}`;
    $('#lockHints').appendChild(li);
    const btn = $('#lockHintBtn');
    if (hintedCount >= list.length) btn.classList.add('hidden');
    else btn.textContent = `查看提示（${hintedCount}/${list.length}）`;
  });
}

/* ---------------- 启动 ---------------- */

init();

async function init() {
  bindEvents();
  const res = await window.api.getState();
  if (res && res.ok) {
    state = res.state;
    if (res.recovered > 0) toast(`已恢复 ${res.recovered} 条上次未正常结束的记录`, 'info');
  }
  runtimeMap = new Map(state.running.map((r) => [r.gameId, r]));
  renderAll();
  if (state.settings && state.settings.lockEnabled) showLock();

  window.api.onStateChanged((s) => {
    state = s;
    runtimeMap = new Map(state.running.map((r) => [r.gameId, r]));
    renderAll();
    const typingNotes = document.activeElement && document.activeElement.id === 'notesBox';
    if (openGameId && !typingNotes) renderDetail();
  });

  window.api.onTick((list) => {
    for (const r of list) runtimeMap.set(r.gameId, r);
    updateTimers();
  });

  window.api.onToast((t) => toast(t.message, t.type));
  window.api.onShotPreview((payload) => openLightboxPreview(payload));
}

function bindEvents() {
  bindLock();
  $$('.nav-item').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.view === 'shots') shotsGameId = null;
    switchView(btn.dataset.view);
  }));

  $('#btnAdd').addEventListener('click', () => openAddModal());
  $('#btnAddEmpty').addEventListener('click', () => openAddModal());

  $('#btnLayout').addEventListener('click', () => {
    window.api.saveSettings({ layout: currentLayout() === 'hero' ? 'grid' : 'hero' });
  });

  $('#winMin').addEventListener('click', () => window.api.winMinimize());  $('#winMax').addEventListener('click', () => window.api.winToggleMax());
  $('#winClose').addEventListener('click', () => window.api.winClose());

  // 游玩热力：时间范围 / 年份 / 显示模式
  if ($('#heatMode')) {
    bindClearedDnD();

  $('#heatMode').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hmode]');
      if (!btn) return;
      heatMode = btn.dataset.hmode;
      $$('#heatMode .seg-btn').forEach((b) => b.classList.toggle('is-on', b === btn));
      window.api.saveSettings({ heatMode });
      renderHeatmap();
    });
    $('#heatLayout').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hlayout]');
      if (!btn) return;
      heatLayout = btn.dataset.hlayout;
      $$('#heatLayout .seg-btn').forEach((b) => b.classList.toggle('is-on', b === btn));
      window.api.saveSettings({ heatLayout });
      renderHeatmap();
    });
    $('#heatRange').addEventListener('change', (e) => {
      heatRange = e.target.value;
      window.api.saveSettings({ heatRange });
      renderHeatmap();
    });
    $('#heatYear').addEventListener('change', (e) => {
      heatYear = e.target.value;
      window.api.saveSettings({ heatYear });
      renderHeatmap();
    });
    bindHeatTooltip();
  }

  // 截图页
  $('#view-shots').addEventListener('click', (e) => {
    if (e.target.closest('[data-shot-back]')) {
      shotsGameId = null;
      renderShots();
      return;
    }
    const gameEl = e.target.closest('[data-shot-game]');
    if (gameEl) {
      shotsGameId = gameEl.dataset.shotGame;
      renderShots();
      return;
    }
    const shotEl = e.target.closest('[data-shot-open]');
    if (shotEl) {
      const box = $('#view-shots');
      let items = [];
      try { items = JSON.parse(box.dataset.items || '[]'); } catch (_) { items = []; }
      const idx = items.findIndex((it) => it.file === shotEl.dataset.shotOpen);
      if (idx >= 0) openLightboxGallery(items, idx, shotsGameId, box.dataset.name || '');
    }
  });

  // 大图查看
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbSave').addEventListener('click', savePendingShot);
  $('#lbDel').addEventListener('click', deleteCurrentShot);
  $('#lbPrev').addEventListener('click', () => lbStep(-1));
  $('#lbNext').addEventListener('click', () => lbStep(1));
  $('#lbStage').addEventListener('click', (e) => {
    if (e.target.id === 'lbStage') closeLightbox();
  });

  // 复制 / 裁剪并复制
  $('#lbCopy').addEventListener('click', copyCurrentShot);
  $('#lbCrop').addEventListener('click', () => {
    if (cropState) exitCropMode();
    else enterCropMode();
  });
  $('#cropChip').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#cropCopyBtn').addEventListener('click', copyCropSelection);
  $('#cropCancelBtn').addEventListener('click', exitCropMode);
  $('#cropBox').addEventListener('mousedown', onCropDown);
  window.addEventListener('mousemove', onCropMove);
  window.addEventListener('mouseup', onCropUp);

  document.querySelector('.topbar').addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, select')) return;
    window.api.winToggleMax();
  });

  el.strip.addEventListener('click', (e) => {
    const item = e.target.closest('[data-strip-id]');
    if (!item) return;
    heroId = item.dataset.stripId;
    renderHero();
  });

  el.hero.addEventListener('click', (e) => {
    const act = e.target.closest('[data-hero-act]');
    if (!act || !heroId) return;
    if (act.dataset.heroAct === 'play') {
      if (runtimeMap.get(heroId)) window.api.stop(heroId);
      else launchGame(heroId);
    } else {
      openDetail(heroId);
    }
  });

  el.search.addEventListener('input', () => {
    query = el.search.value.trim().toLowerCase();
    renderLibrary();
  });

  el.sort.addEventListener('change', () => {
    sortBy = el.sort.value;
    renderLibrary();
  });

  el.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.play-circle')) {
      e.stopPropagation();
      launchGame(id);
      return;
    }
    openDetail(id);
  });

  el.nowbar.addEventListener('click', (e) => {
    const id = e.target.closest('[data-now-id]')?.dataset.nowId;
    if (!id) return;
    if (e.target.closest('[data-act="stop"]')) {
      window.api.stop(id);
    } else if (e.target.closest('[data-act="open"]')) {
      openDetail(id);
    }
  });

  el.detail.addEventListener('click', onDetailClick);

  el.modalRoot.addEventListener('click', (e) => {
    if (e.target === el.modalRoot) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (locked) return;
    if (!$('#lightbox').classList.contains('hidden') && el.modalRoot.classList.contains('hidden')) {
      if (cropState) {
        if (e.key === 'Escape') { e.preventDefault(); exitCropMode(); return; }
        if (e.key === 'Enter') { e.preventDefault(); copyCropSelection(); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); return; }
      if (lb.mode === 'gallery' && e.key === 'ArrowLeft') { e.preventDefault(); lbStep(-1); return; }
      if (lb.mode === 'gallery' && e.key === 'ArrowRight') { e.preventDefault(); lbStep(1); return; }
      if (lb.mode === 'preview' && e.key === 'Enter') { e.preventDefault(); savePendingShot(); return; }
    }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      if (!el.modalRoot.classList.contains('hidden')) { closeModal(); return; }
      if (document.activeElement === el.search) { el.search.value = ''; query = ''; renderLibrary(); el.search.blur(); return; }
      if (openGameId) { closeDetail(); return; }
    }
    if (typing) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddModal(); }
    if (e.key === '/') { e.preventDefault(); el.search.focus(); }
  });
}

/* ---------------- 渲染 ---------------- */

function renderAll() {
  document.body.classList.toggle('privacy', !!state.settings.blurCovers);
  renderSidebar();
  applyLayout();
  renderNowbar();
}

function currentLayout() {
  return state.settings.layout === 'hero' ? 'hero' : 'grid';
}

function applyLayout() {
  const isLib = view === 'library';
  const heroMode = isLib && currentLayout() === 'hero' && state.games.length > 0;

  document.body.classList.toggle('layout-hero', currentLayout() === 'hero');
  $('#app').classList.toggle('is-hero', heroMode);
  el.content.classList.toggle('flush', heroMode);
  const label = $('#layoutLabel');
  if (label) label.textContent = currentLayout() === 'hero' ? '网格模式' : '沉浸模式';

  $('#view-library').classList.toggle('hidden', !isLib || heroMode);
  el.hero.classList.toggle('hidden', !heroMode);
  el.strip.classList.toggle('hidden', !heroMode);
  $('#view-stats').classList.toggle('hidden', view !== 'stats');
  $('#view-settings').classList.toggle('hidden', view !== 'settings');
  $('#view-shots').classList.toggle('hidden', view !== 'shots');
  if (el.cleared) el.cleared.classList.toggle('hidden', view !== 'cleared');

  el.pageTitle.textContent = isLib ? '游戏库'
    : view === 'stats' ? '统计'
    : view === 'shots' ? '截图'
    : view === 'cleared' ? '通关' : '设置';
  $('#btnAdd').classList.toggle('hidden', !isLib);
  $('#btnLayout').classList.toggle('hidden', !isLib);
  el.search.closest('.search').classList.toggle('hidden', !isLib || heroMode);
  el.sort.classList.toggle('hidden', !isLib || heroMode);

  if (isLib && heroMode) renderHero();
  else if (isLib) renderLibrary();

  if (view === 'shots') renderShots();
  if (view === 'stats') renderStats();
  if (view === 'cleared') renderCleared();
  if (view === 'settings') renderSettings();
}

function renderSidebar() {
  const total = state.games.reduce((sum, g) => sum + (g.totalSeconds || 0), 0);
  el.footHours.innerHTML = `${Math.round(total / 3600)}<span>h</span>`;
}

function switchView(next) {
  if (openGameId) closeDetail();
  view = next;
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === next));
  applyLayout();
}

function sortedGames() {
  const list = state.games.filter((g) => {
    if (!query) return true;
    const hay = (g.name + ' ' + g.originalName + ' ' + g.developer).toLowerCase();
    return hay.includes(query);
  });
  const cmp = {
    recent: (a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || (b.addedAt || 0) - (a.addedAt || 0),
    added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    hours: (a, b) => (b.totalSeconds || 0) - (a.totalSeconds || 0),
    name: (a, b) => a.name.localeCompare(b.name, 'zh-CN')
  }[sortBy];
  return list.sort(cmp);
}

function coverBlock(g, cls) {
  if (g.coverUrl) {
    return `<img class="${cls}" src="${esc(g.coverUrl)}" alt="" draggable="false">`;
  }
  return `<div class="cover-ph" style="${placeholderStyle(g.name)}">
    <span class="ph-initial">${esc(initialOf(g.name))}</span>
    <span class="ph-name">${esc(g.name)}</span>
  </div>`;
}

const BRIEF_SECONDS = 20 * 60;

const STATUS_LABEL = { unplayed: '未开始', playing: '进行中', cleared: '已通关' };
const CLEAR_LABEL = { local: '本地通关', external: '存档不在本地' };

/**
 * 库里的分类：已通关 > 手工未开始 > 时长不足 20 分钟 > 进行中
 * 未开始的判定：状态就是「未开始」，或者累计不足 20 分钟
 */
function gameGroup(g) {
  if (g.status === 'cleared') return 'cleared';
  if (g.status === 'unplayed') return 'unstarted';
  if ((g.totalSeconds || 0) < BRIEF_SECONDS) return 'unstarted';
  return 'playing';
}

function renderLibrary() {
  const list = sortedGames();
  el.libCount.textContent = state.games.length;
  el.empty.classList.toggle('hidden', state.games.length > 0);

  const total = state.games.reduce((s, g) => s + (g.totalSeconds || 0), 0);
  el.libHint.textContent = state.games.length
    ? `${list.length} 部在列 · 累计 ${(total / 3600).toFixed(1)} 小时`
    : '';

  const cardHtml = (g) => {
    const run = runtimeMap.get(g.id);
    const live = run
      ? `<div class="live"><i class="dot"></i><span data-timer="${g.id}">${fmtClock(run.seconds)}</span></div>`
      : '';
    return `<article class="card" data-id="${g.id}">
      ${coverBlock(g, 'card-cover')}
      ${live}
      <div class="card-play"><div class="play-circle" title="立即开始">${ICON.play}</div></div>
      <div class="card-meta">
        <div class="card-title">${esc(g.name)}</div>
        <div class="card-sub">${cardSub(g, run)}</div>
      </div>
    </article>`;
  };

  const groups = { playing: [], unstarted: [], cleared: [] };
  for (const g of list) groups[gameGroup(g)].push(g);

  const block = (key, label) => {
    if (!groups[key].length) return '';
    const head = `<div class="grid-sep"><span>${label}</span><i></i><span class="grid-sep-count">${groups[key].length}</span></div>`;
    return head + groups[key].map(cardHtml).join('');
  };

  el.grid.innerHTML =
    block('playing', '进行中') +
    block('unstarted', '未开始 · 少于 20 分钟') +
    block('cleared', '已通关');
}

/* ---------------- 沉浸布局 ---------------- */

function stripGroups() {
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh');
  // 已通关放最上面，进行中放最下面；进行中内部按时间正序，最近玩的贴在最底部
  const cleared = state.games.filter((g) => gameGroup(g) === 'cleared')
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
  const unstarted = state.games.filter((g) => gameGroup(g) === 'unstarted').sort(byName);
  const playing = state.games.filter((g) => gameGroup(g) === 'playing')
    .sort((a, b) => (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0));
  return { cleared, unstarted, playing };
}

function stripGames() {
  const { cleared, unstarted, playing } = stripGroups();
  return [...cleared, ...unstarted, ...playing];
}

function stripItem(g) {
  const run = runtimeMap.get(g.id);
  return `<button class="strip-item ${g.id === heroId ? 'is-active' : ''}" data-strip-id="${g.id}" title="${esc(g.name)}">
    ${coverBlock(g, 'strip-cover')}
    ${run ? '<i class="strip-dot"></i>' : ''}
  </button>`;
}

function renderStrip() {
  const prevActive = el.strip.querySelector('.strip-item.is-active');
  const prevId = prevActive ? prevActive.dataset.stripId : null;
  const { cleared, unstarted, playing } = stripGroups();

  const block = (arr, label) => (arr.length
    ? `<div class="strip-sep"><span>${label}</span><i></i></div>` + arr.map(stripItem).join('')
    : '');

  el.strip.innerHTML =
    block(cleared, '已通关') +
    block(unstarted, '未开始') +
    block(playing, '进行中');

  if (prevId !== heroId) {
    const active = el.strip.querySelector('.strip-item.is-active');
    if (active) {
      const a = active.getBoundingClientRect();
      const s = el.strip.getBoundingClientRect();
      if (a.bottom > s.bottom - 10) el.strip.scrollTop += a.bottom - s.bottom + 18;
      else if (a.top < s.top + 10) el.strip.scrollTop -= s.top - a.top + 18;
    }
  }
}

function renderHero() {
  const list = stripGames();
  if (!list.length) return;
  if (!heroId || !state.games.some((g) => g.id === heroId)) {
    heroId = list[list.length - 1].id;
  }
  const g = state.games.find((x) => x.id === heroId);
  if (!g) return;
  const run = runtimeMap.get(g.id);

  const playLabel = run ? '停止计时' : (g.totalSeconds || 0) >= 60 ? '继续游戏' : '开始游戏';

  el.hero.innerHTML = `
    <div class="hero-bg" ${g.coverUrl ? '' : `style="${placeholderStyle(g.name)}"`}>${g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="">` : ''}</div>
    <div class="hero-veil"></div>
    <div class="hero-stage">
      <div class="hero-info">
        <div class="hero-kicker">${run ? '正在游玩' : g.lastPlayedAt ? '继续上次' : '新的开始'}</div>
        <h1>${esc(g.name)}</h1>
        <div class="hero-sub">${esc(g.originalName && g.originalName !== g.name ? g.originalName : '')}</div>
        <div class="hero-meta">
          ${g.developer ? `<span>${esc(g.developer)}</span>` : ''}
          ${g.released ? `<span>· ${esc(String(g.released).slice(0, 4))}</span>` : ''}
          <span class="chip">${trackModeLabel(g.trackMode)}</span>
          ${run ? `<span class="chip chip-accent"><i class="dot"></i><span data-timer="${g.id}">${fmtClock(run.seconds)}</span></span>` : ''}
        </div>
        <div class="hero-stats">累计 ${hoursText(g.totalSeconds)} · 启动 ${g.launchCount || 0} 次 · 最近 ${g.lastPlayedAt ? fmtDate(g.lastPlayedAt) : '还没玩过'}</div>
      </div>
      <div class="hero-poster" data-hero-act="detail">
        ${coverBlock(g, '')}
        <div class="hero-poster-scrim"></div>
        <div class="hero-poster-actions">
          <button class="btn-ghost-lg" data-hero-act="detail">详情</button>
          <button class="btn-play-lg" data-hero-act="play">${run ? ICON.stop : ICON.play} ${playLabel}</button>
        </div>
      </div>
    </div>`;

  renderStrip();
}

/* ---------------- 截图 ---------------- */

const lb = { mode: null, items: [], index: 0, gameId: null, gameName: '', pendingId: null };
let shotsGames = null;
let shotsGameId = null;
let detailShotItems = [];
let keyRecording = false;

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
const dayOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

function paintLightbox(title) {
  exitCropMode();
  const item = lb.items[lb.index];
  if (!item) return;
  $('#lbImg').src = item.url;
  const total = lb.items.length;
  $('#lbTitle').textContent = total > 1 ? `${title} · ${lb.index + 1}/${total}` : title;
  $('#lbPrev').disabled = lb.index <= 0;
  $('#lbNext').disabled = lb.index >= total - 1;
}

function openLightboxPreview(payload) {
  lb.mode = 'preview';
  lb.pendingId = payload.id;
  lb.gameId = payload.gameId;
  lb.gameName = payload.gameName || '';
  lb.items = [{ url: payload.url, time: payload.time }];
  lb.index = 0;
  $('#lbSave').classList.remove('hidden');
  $('#lbDel').classList.add('hidden');
  $('#lbPrev').classList.add('hidden');
  $('#lbNext').classList.add('hidden');
  $('#lightbox').classList.remove('hidden');
  const sizeText = payload.w && payload.h ? ` · ${payload.w}×${payload.h}` : '';
  paintLightbox(`待保存 · ${payload.gameName || ''} · ${hhmm(payload.time)}${sizeText}`);
}

function openLightboxGallery(items, index, gameId, gameName) {
  lb.mode = 'gallery';
  lb.pendingId = null;
  lb.items = items;
  lb.index = Math.max(0, Math.min(index, items.length - 1));
  lb.gameId = gameId;
  lb.gameName = gameName || '';
  $('#lbSave').classList.add('hidden');
  $('#lbDel').classList.remove('hidden');
  $('#lbPrev').classList.remove('hidden');
  $('#lbNext').classList.remove('hidden');
  $('#lightbox').classList.remove('hidden');
  paintLightbox(`${gameName || ''} · ${dayOf(items[lb.index].time)} ${hhmm(items[lb.index].time)}`);
}

let cropState = null;

function currentShotSource() {
  if (lb.mode === 'preview') return { pendingId: lb.pendingId };
  const item = lb.items[lb.index];
  return { gameId: lb.gameId, file: item ? item.file : null };
}

let lbFlashTimer = null;

function showLbFlash(text, type) {
  const node = $('#lbFlash');
  if (!node) return;
  $('#cropHintText').classList.add('hidden');
  node.textContent = text;
  node.className = 'lb-flash ' + (type === 'error' ? 'error' : 'ok');
  if (lbFlashTimer) clearTimeout(lbFlashTimer);
  lbFlashTimer = setTimeout(() => {
    node.classList.add('hidden');
    lbFlashTimer = null;
  }, 1900);
}

async function shotBlob(src) {
  const res = await window.api.shotFile(src);
  if (!res || !res.ok) throw new Error((res && res.error) || '读不到图片');
  const bytes = res.buf instanceof Uint8Array ? res.buf : new Uint8Array(res.buf);
  return new Blob([bytes], { type: 'image/png' });
}

async function writeImageToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) throw new Error('当前环境不支持图片剪贴板');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

async function copyCurrentShot() {
  const src = currentShotSource();
  if (!src.pendingId && !src.file) { toast('没有可复制的截图', 'error'); return; }
  try {
    const blob = await shotBlob(src);
    const bmp = await createImageBitmap(blob);
    await writeImageToClipboard(blob);
    showLbFlash(`✓ 已复制到剪贴板 ${bmp.width}×${bmp.height}`, 'ok');
  } catch (err) {
    toast('复制失败：' + err.message, 'error');
  }
}

function exitCropMode() {
  cropState = null;
  const flash = $('#lbFlash');
  if (flash) flash.classList.add('hidden');
  const box = $('#cropBox');
  if (!box) return;
  box.classList.add('hidden');
  $('#cropSel').classList.add('hidden');
  $('#cropChip').classList.add('hidden');
  $('#cropHintText').classList.add('hidden');
  $('#lightbox').classList.remove('is-cropping');
}

function enterCropMode() {
  const img = $('#lbImg');
  if (!img.complete || !img.naturalWidth) { toast('图片还没加载好，稍等一下', 'info'); return; }
  const imgRect = img.getBoundingClientRect();
  const hostRect = $('#lightbox').getBoundingClientRect();
  const box = $('#cropBox');
  box.style.left = (imgRect.left - hostRect.left) + 'px';
  box.style.top = (imgRect.top - hostRect.top) + 'px';
  box.style.width = imgRect.width + 'px';
  box.style.height = imgRect.height + 'px';
  box.classList.remove('hidden');
  $('#cropSel').classList.add('hidden');
  $('#cropChip').classList.add('hidden');
  $('#cropHintText').textContent = '按住鼠标左键拖拽选择区域 · Enter 复制 · Esc 取消';
  $('#cropHintText').classList.remove('hidden');
  $('#lightbox').classList.add('is-cropping');
  cropState = {
    dragging: false,
    startX: 0,
    startY: 0,
    rect: null,
    scale: img.naturalWidth / Math.max(1, imgRect.width)
  };
}

function setCropSel(x, y, w, h) {
  const sel = $('#cropSel');
  sel.classList.remove('hidden');
  sel.style.left = x + 'px';
  sel.style.top = y + 'px';
  sel.style.width = w + 'px';
  sel.style.height = h + 'px';
}

function onCropDown(e) {
  if (!cropState) return;
  if (e.target.closest('#cropChip')) return;
  const r = $('#cropBox').getBoundingClientRect();
  cropState.dragging = true;
  cropState.startX = Math.min(Math.max(0, e.clientX - r.left), r.width);
  cropState.startY = Math.min(Math.max(0, e.clientY - r.top), r.height);
  cropState.rect = { x: cropState.startX, y: cropState.startY, w: 0, h: 0 };
  setCropSel(cropState.rect.x, cropState.rect.y, 0, 0);
  $('#cropChip').classList.add('hidden');
  $('#cropHintText').classList.remove('hidden');
  e.preventDefault();
}

function onCropMove(e) {
  if (!cropState || !cropState.dragging) return;
  const r = $('#cropBox').getBoundingClientRect();
  const cx = Math.min(Math.max(0, e.clientX - r.left), r.width);
  const cy = Math.min(Math.max(0, e.clientY - r.top), r.height);
  const x = Math.min(cropState.startX, cx);
  const y = Math.min(cropState.startY, cy);
  const w = Math.abs(cx - cropState.startX);
  const h = Math.abs(cy - cropState.startY);
  cropState.rect = { x, y, w, h };
  setCropSel(x, y, w, h);
  const scale = cropState.scale || 1;
  $('#cropSizeText').textContent = `${Math.round(w * scale)}×${Math.round(h * scale)}`;
}

function positionCropChip(r) {
  const chip = $('#cropChip');
  const box = $('#cropBox');
  const bw = box.clientWidth;
  const bh = box.clientHeight;
  chip.style.left = '0px';
  chip.style.top = '0px';
  const cw = chip.offsetWidth || 200;
  const chh = chip.offsetHeight || 38;
  let left = r.x + r.w - cw;
  let top = r.y + r.h + 10;
  if (top + chh > bh) top = Math.max(0, r.y - chh - 10);
  left = Math.min(Math.max(0, left), Math.max(0, bw - cw));
  chip.style.left = left + 'px';
  chip.style.top = top + 'px';
}

function onCropUp() {
  if (!cropState || !cropState.dragging) return;
  cropState.dragging = false;
  const r = cropState.rect;
  if (!r || r.w < 4 || r.h < 4) {
    cropState.rect = null;
    $('#cropSel').classList.add('hidden');
    $('#cropChip').classList.add('hidden');
    $('#cropHintText').textContent = '选区太小，重新拖拽一次 · Enter 复制 · Esc 取消';
    $('#cropHintText').classList.remove('hidden');
    return;
  }
  $('#cropHintText').classList.add('hidden');
  positionCropChip(r);
  $('#cropChip').classList.remove('hidden');
}

async function copyCropSelection() {
  if (!cropState || !cropState.rect) { toast('请先拖拽选择区域', 'info'); return; }
  const r = cropState.rect;
  const scale = cropState.scale || 1;
  const rect = {
    x: Math.round(r.x * scale),
    y: Math.round(r.y * scale),
    width: Math.round(r.w * scale),
    height: Math.round(r.h * scale)
  };
  if (rect.width < 1 || rect.height < 1) { toast('选区太小，无法复制', 'error'); return; }
  try {
    const blob = await shotBlob(currentShotSource());
    const bmp = await createImageBitmap(blob);

    const w = Math.max(1, Math.min(rect.width, bmp.width - rect.x));
    const h = Math.max(1, Math.min(rect.height, bmp.height - rect.y));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, rect.x, rect.y, w, h, 0, 0, w, h);

    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!out) throw new Error('裁剪失败');
    await writeImageToClipboard(out);
    exitCropMode();
    showLbFlash(`✓ 已复制选区 ${w}×${h}`, 'ok');
  } catch (err) {
    showLbFlash('复制失败：' + err.message, 'error');
  }
}

function lbStep(delta) {
  if (lb.mode !== 'gallery' || !lb.items.length) return;
  const next = lb.index + delta;
  if (next < 0 || next >= lb.items.length) return;
  lb.index = next;
  paintLightbox(`${lb.gameName} · ${dayOf(lb.items[next].time)} ${hhmm(lb.items[next].time)}`);
}

async function closeLightbox() {
  exitCropMode();
  if (lb.mode === 'preview' && lb.pendingId) {
    const id = lb.pendingId;
    lb.pendingId = null;
    window.api.shotCancel(id);
  }
  lb.mode = null;
  lb.items = [];
  $('#lightbox').classList.add('hidden');
  $('#lbImg').removeAttribute('src');
}

async function savePendingShot() {
  if (lb.mode !== 'preview' || !lb.pendingId) return;
  exitCropMode();
  const id = lb.pendingId;
  lb.pendingId = null;
  const res = await window.api.shotSave(id);
  $('#lightbox').classList.add('hidden');
  if (res && res.ok) {
    toast('截图已保存');
    if (view === 'shots') renderShots();
    if (openGameId) loadDetailShots(openGameId);
  } else {
    toast((res && res.error) || '保存失败', 'error');
  }
}

async function deleteCurrentShot() {
  if (lb.mode !== 'gallery' || !lb.items.length) return;
  exitCropMode();
  const item = lb.items[lb.index];
  const yes = await confirmBox('删除这张截图？', '文件会从「我的截图」文件夹里直接删掉，不能恢复。');
  if (!yes) return;
  const res = await window.api.shotDelete(lb.gameId, item.file);
  if (!res || !res.ok) { toast('删除失败', 'error'); return; }
  lb.items.splice(lb.index, 1);
  if (!lb.items.length) {
    await closeLightbox();
  } else {
    lb.index = Math.min(lb.index, lb.items.length - 1);
    paintLightbox(`${lb.gameName} · ${dayOf(lb.items[lb.index].time)} ${hhmm(lb.items[lb.index].time)}`);
  }
  toast('已删除');
  if (view === 'shots') renderShots();
  if (openGameId) loadDetailShots(openGameId);
}

async function renderShots() {
  const box = $('#view-shots');
  if (!box) return;

  if (shotsGameId) {
    await renderShotGallery(box, shotsGameId);
    return;
  }

  box.innerHTML = '<div class="shots-head"><h2>截图</h2><span class="muted">读取中…</span></div>';
  const res = await window.api.shotGames();
  shotsGames = (res && res.games) || [];

  if (!shotsGames.length) {
    box.innerHTML = `<div class="shots-head"><h2>截图</h2></div>
      <div class="shot-empty">还没有截图。<br>开启「设置 → 截图」后，游戏运行时按鼠标侧键（或键盘快捷键）就能截，截完可以预览、保存。</div>`;
    return;
  }

  const total = shotsGames.reduce((s, g) => s + g.count, 0);
  box.innerHTML = `
    <div class="shots-head"><h2>截图</h2><span class="muted">${shotsGames.length} 部游戏 · 共 ${total} 张</span></div>
    <div class="shot-games">
      ${shotsGames.map((g) => `
        <div class="shot-game" data-shot-game="${g.gameId}">
          <div class="shot-game-cover">${g.coverUrl ? `<img src="${g.coverUrl}" alt="" />` : ''}</div>
          <div class="shot-game-info">
            <div class="shot-game-name">${esc(g.name)}</div>
            <div class="shot-game-meta">${g.count} 张 · 最近 ${dayOf(g.latest)} ${hhmm(g.latest)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

async function renderShotGallery(box, gameId) {
  box.innerHTML = '<div class="shots-head"><h2>截图</h2><span class="muted">读取中…</span></div>';
  const res = await window.api.shotList(gameId);
  if (!res || !res.ok) {
    box.innerHTML = '<div class="shot-empty">读取失败，文件夹可能已被移动。</div>';
    return;
  }

  const items = res.items || [];
  if (!items.length) {
    box.innerHTML = `<button class="shot-back" data-shot-back>← 返回列表</button>
      <div class="shots-head"><h2>${esc(res.game.name)}</h2></div>
      <div class="shot-empty">这个游戏还没有截图。</div>`;
    return;
  }

  const groups = new Map();
  for (const it of items) {
    const key = dayOf(it.time);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  box.innerHTML = `
    <button class="shot-back" data-shot-back>← 返回列表</button>
    <div class="shots-head"><h2>${esc(res.game.name)}</h2><span class="muted">${items.length} 张 · ${esc(res.dir)}</span></div>
    <div class="shot-gallery">
      ${[...groups.entries()].map(([day, list]) => `
        <div class="shot-group">
          <h3>${day}<span>· ${list.length} 张</span></h3>
          <div class="shot-grid">
            ${list.map((it) => `
              <div class="shot-item" data-shot-open="${it.file}">
                <img src="${it.url}" loading="lazy" alt="" />
                <span class="shot-item-time">${hhmm(it.time)}</span>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;

  box.dataset.items = JSON.stringify(items.map((it) => ({ file: it.file, url: it.url, time: it.time })));
  box.dataset.name = res.game.name;
}

async function loadDetailShots(gameId) {
  const box = $('#detailShots', el.detail);
  if (!box) return;
  const res = await window.api.shotList(gameId);
  const countEl = $('#detailShotCount', el.detail);
  if (!res || !res.ok || !res.items.length) {
    detailShotItems = [];
    box.innerHTML = '<div class="shot-empty">还没有截图<br>游戏运行时按鼠标侧键即可</div>';
    if (countEl) countEl.textContent = '0 张';
    return;
  }
  detailShotItems = res.items;
  if (countEl) countEl.textContent = res.items.length + ' 张';
  box.innerHTML = res.items.slice(0, 6).map((it) => `
    <div class="detail-shot" data-shot-open="${it.file}">
      <img src="${it.url}" loading="lazy" alt="" />
    </div>`).join('');
}

function accelFromEvent(e) {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');

  let key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  if (/^F\d{1,2}$/i.test(key)) key = key.toUpperCase();
  else if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else if (['PrintScreen', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'].includes(key)) {
    if (key === 'Escape') return null;
  } else return null;

  return [...mods, key].join('+');
}

/* ---------------- 正在游玩条 ---------------- */

function renderNowbar() {
  const run = state.running[0];
  document.body.classList.toggle('has-running', !!run);
  if (!run) {
    el.nowbar.classList.add('hidden');
    el.nowbar.innerHTML = '';
    return;
  }
  const g = state.games.find((x) => x.id === run.gameId);
  const name = g ? g.name : '未知游戏';
  const more = state.running.length > 1 ? ` · 另有 ${state.running.length - 1} 个在计时` : '';

  el.nowbar.classList.remove('hidden');
  el.nowbar.innerHTML = `
    <div class="now-cover" data-now-id="${run.gameId}" data-act="open">
      ${g ? coverBlock(g, 'now-cover-img') : ''}
    </div>
    <div class="now-main" data-now-id="${run.gameId}" data-act="open" style="cursor:pointer">
      <div class="now-title">${esc(name)}</div>
      <div class="now-sub"><i class="dot"></i>${run.waiting ? '等待游戏窗口…' : '正在计时'}${more}</div>
    </div>
    <div class="now-time" data-now-id="${run.gameId}" data-timer="${run.gameId}">${fmtClock(run.seconds)}</div>
    <div class="now-actions">
      <button class="btn" data-now-id="${run.gameId}" data-act="stop">${ICON.stop} 停止计时</button>
    </div>`;
}

function updateTimers() {
  $$('[data-timer]').forEach((node) => {
    const r = runtimeMap.get(node.dataset.timer);
    if (r) node.textContent = fmtClock(r.seconds);
  });
}

/* ---------------- 详情 ---------------- */

async function openDetail(id) {
  openGameId = id;
  renderDetail();
  el.detail.classList.remove('hidden');
  el.detail.scrollTop = 0;
  document.body.classList.add('detail-open');
}

function closeDetail() {
  openGameId = null;
  el.detail.classList.add('hidden');
  el.detail.innerHTML = '';
  document.body.classList.remove('detail-open');
}

function gameSessions(id) {
  return (state.sessions || [])
    .filter((s) => s.gameId === id)
    .sort((a, b) => b.startedAt - a.startedAt);
}

function renderDetail() {
  const g = state.games.find((x) => x.id === openGameId);
  if (!g) { closeDetail(); return; }

  const sessions = gameSessions(g.id);
  const counted = sessions.filter((s) => s.counted);
  const avg = counted.length ? counted.reduce((s, x) => s + x.seconds, 0) / counted.length : 0;
  const run = runtimeMap.get(g.id);

  const playLabel = run ? '正在计时' : (g.totalSeconds || 0) >= 60 ? '继续游戏' : '开始游戏';

  const chips = [
    g.developer ? `<span class="chip">${esc(g.developer)}</span>` : '',
    g.released ? `<span class="chip">${esc(String(g.released).slice(0, 4))}</span>` : '',
    g.engine ? `<span class="chip">${esc(g.engine)}</span>` : '',
    `<span class="chip">${trackModeLabel(g.trackMode)}</span>`
  ].filter(Boolean).join('');

  const listHtml = sessions.length
    ? sessions.slice(0, 40).map((s) => `
        <div class="srow" data-session="${s.id}">
          <span class="srow-date">${fmtDate(s.startedAt)}</span>
          <span class="srow-dur">${fmtClockShort(s.seconds)}</span>
          <span class="srow-tag">${REASON_LABEL[s.reason] || '—'}</span>
          <span class="srow-ops">
            <button class="mini-btn" data-sact="edit" data-session="${s.id}">改</button>
            <button class="mini-btn" data-sact="del" data-session="${s.id}">删</button>
          </span>
        </div>`).join('')
    : '<div class="empty-line">还没有记录，启动一次就会出现在这里。</div>';

  const totalText = (g.totalSeconds || 0) >= 3600
    ? ((g.totalSeconds || 0) / 3600).toFixed(1) + ' 小时'
    : (g.totalSeconds || 0) > 0 ? Math.round((g.totalSeconds || 0) / 60) + ' 分钟' : '—';
  const avgText = avg ? (avg >= 3600 ? (avg / 3600).toFixed(1) + ' 小时' : Math.round(avg / 60) + ' 分钟') : '—';

  el.detail.innerHTML = `
    <div class="detail-bg" ${g.coverUrl ? '' : `style="${placeholderStyle(g.name)}"`}>${g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="">` : ''}</div>

    <div class="detail-nav">
      <button class="nav-back" data-act="back">${ICON.back}<span>返回</span></button>
      <div class="nav-actions">
        <button class="nav-action" data-act="folder">${ICON.folder}<span>目录</span></button>
        <button class="nav-action" data-act="cover">${ICON.image}<span>封面</span></button>
        <button class="nav-action" data-act="edit">${ICON.edit}<span>编辑</span></button>
        <button class="nav-action is-danger" data-act="delete">${ICON.trash}<span>删除</span></button>
      </div>
    </div>

    <div class="detail-inner">
      <div class="hero">
        <div class="hero-cover">${coverBlock(g, '')}</div>
        <div class="hero-info">
          <h1>${esc(g.name)}</h1>
          <div class="hero-sub">${esc(g.originalName && g.originalName !== g.name ? g.originalName : '')}</div>
          <div class="chips">${chips}</div>
          <div class="status-bar">
            <div class="seg">
              ${['unplayed', 'playing', 'cleared'].map((k) => `
                <button class="seg-btn ${(g.status || 'unplayed') === k ? 'is-on' : ''}" data-status="${k}">${STATUS_LABEL[k]}</button>`).join('')}
            </div>
            ${g.status === 'cleared' ? `
              <span class="seg-label">存档</span>
              <div class="seg seg-sm">
                ${['local', 'external'].map((k) => `
                  <button class="seg-btn ${(g.clearSave || 'local') === k ? 'is-on' : ''}" data-clear="${k}">${CLEAR_LABEL[k]}</button>`).join('')}
              </div>` : ''}
          </div>
          <div class="play-row">
            ${run
              ? `<button class="btn-play" data-act="stop">${ICON.stop} 停止计时</button>
                 <span class="play-note">本次已 ${fmtClock(run.seconds)}（${run.waiting ? '等待进程' : '计时中'}）</span>`
              : `<button class="btn-play" data-act="launch">${ICON.play} ${playLabel}</button>
                 ${(g.totalSeconds || 0) > 0 ? '' : '<span class="play-note">还没开始玩，启动后会自动记录时长</span>'}`}
          </div>
          <div class="stat-strip">
            <div><span>累计时长</span><b>${totalText}</b></div>
            <div><span>启动次数</span><b>${g.launchCount || 0} 次</b></div>
            <div><span>平均每次</span><b>${avgText}</b></div>
            <div><span>最近游玩</span><b>${g.lastPlayedAt ? fmtDay(g.lastPlayedAt) : '—'}</b></div>
          </div>
        </div>
      </div>

      <div class="detail-cols">
        <div>
          <div class="panel">
            <div class="panel-head"><h3>游玩记录</h3><span class="panel-sub">共 ${sessions.length} 条</span></div>
            <div class="session-list">${listHtml}</div>
          </div>
        </div>
        <div>
          <div class="panel">
            <div class="panel-head"><h3>备注</h3><span class="panel-sub">自动保存</span></div>
            <textarea class="notes-box" id="notesBox" placeholder="进度、路线、感想…">${esc(g.notes || '')}</textarea>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>启动信息</h3></div>
            <div class="about">
              <div><span>启动文件</span><b style="font-family:var(--mono,monospace);font-size:11px;word-break:break-all">${esc(g.exePath)}</b></div>
              <div><span>追踪方式</span><b>${trackModeLabel(g.trackMode)}</b></div>
              <div><span>初始等待</span><b>${(g.initialDelay || 0) / 1000} 秒</b></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>截图</h3><span class="panel-sub" id="detailShotCount">…</span></div>
            <div class="detail-shots" id="detailShots"><div class="shot-empty">读取中…</div></div>
          </div>
        </div>
      </div>
    </div>`;

  loadDetailShots(g.id);

  const notes = $('#notesBox', el.detail);
  if (notes) {
    let t = null;
    notes.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => window.api.updateGame(g.id, { notes: notes.value }), 600);
    });
  }
}

function fmtClockShort(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

function trackModeLabel(mode) {
  return { folder: '目录追踪', process: '进程树追踪', original: '单进程追踪', name: '进程名追踪' }[mode] || '目录追踪';
}

async function onDetailClick(e) {
  const stBtn = e.target.closest('[data-status]');
  if (stBtn && openGameId) {
    await window.api.updateGame(openGameId, { status: stBtn.dataset.status });
    return;
  }
  const csBtn = e.target.closest('[data-clear]');
  if (csBtn && openGameId) {
    await window.api.updateGame(openGameId, { clearSave: csBtn.dataset.clear });
    return;
  }

  const shotEl = e.target.closest('[data-shot-open]');
  if (shotEl) {
    const file = shotEl.dataset.shotOpen;
    const idx = detailShotItems.findIndex((it) => it.file === file);
    if (idx >= 0) {
      const g0 = state.games.find((x) => x.id === openGameId);
      openLightboxGallery(detailShotItems, idx, openGameId, g0 ? g0.name : '');
    }
    return;
  }

  const btn = e.target.closest('[data-act]');
  const g = state.games.find((x) => x.id === openGameId);
  if (!g) return;

  if (btn) {
    const act = btn.dataset.act;
    if (act === 'back') return closeDetail();
    if (act === 'launch') { await launchGame(g.id); return; }
    if (act === 'stop') { await window.api.stop(g.id); return; }
    if (act === 'folder') { window.api.openFolder(g.id); return; }
    if (act === 'cover') { openCoverModal(g); return; }
    if (act === 'edit') { openEditModal(g); return; }
    if (act === 'delete') { confirmDelete(g); return; }
  }

  const sbtn = e.target.closest('[data-sact]');
  if (sbtn) {
    const sid = sbtn.dataset.session;
    const session = (state.sessions || []).find((s) => s.id === sid);
    if (!session) return;
    if (sbtn.dataset.sact === 'edit') {
      const value = await askNumber('修改这次记录的时长', Math.round(session.seconds / 60), '单位：分钟');
      if (value == null) return;
      await window.api.updateSession(sid, Math.round(value * 60));
    } else if (sbtn.dataset.sact === 'del') {
      const ok = await confirmBox('删除这条记录？', fmtDate(session.startedAt) + ' · ' + fmtClockShort(session.seconds) + '，删除后累计时长会同步扣减。');
      if (ok) await window.api.deleteSession(sid);
    }
  }
}

async function launchGame(id) {
  const res = await window.api.launch(id);
  if (!res.ok && res.error) toast(res.error, 'error');
}

async function pickCover(id) {
  const res = await window.api.pickCover(id);
  if (res && res.ok) toast('封面已更新');
}

function openCoverModal(g) {
  openModal(`
    <div class="modal-head">
      <h3>更换封面</h3>
      <button class="modal-close" data-close>×</button>
    </div>
    <div class="input-row" style="margin-bottom:12px">
      <button class="btn" id="cLocal">从本地选择图片</button>
      <button class="btn" id="cSearch">按名称在线匹配</button>
    </div>
    <div id="cResult"></div>`);

  $$('[data-close]', el.modalRoot).forEach((b) => b.addEventListener('click', closeModal));

  $('#cLocal').addEventListener('click', async () => {
    const res = await window.api.pickCover(g.id);
    if (res && res.ok) { closeModal(); toast('封面已更新'); }
  });

  $('#cSearch').addEventListener('click', () => {
    searchCoverInto($('#cResult'), g.originalName || g.name, async (item) => {
      await window.api.applyMeta(g.id, item);
      closeModal();
      toast('正在后台下载封面…');
    });
  });
}

/* ---------------- 统计 ---------------- */

function dayTotals() {
  const map = new Map();
  for (const s of state.sessions || []) {
    if (!s.counted) continue;
    const k = dayKey(s.startedAt);
    map.set(k, (map.get(k) || 0) + (s.seconds || 0));
  }
  return map;
}

function renderStats() {
  const totals = dayTotals();
  const all = state.games.reduce((s, g) => s + (g.totalSeconds || 0), 0);

  let week = 0;
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    week += totals.get(dayKey(d.getTime())) || 0;
  }

  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const v = totals.get(dayKey(d.getTime())) || 0;
    if (v > 0) streak++;
    else if (i > 0) break;
  }

  // 已通关的即使没记到时长，也算玩过
  const played = state.games.filter((g) => (g.totalSeconds || 0) > 0 || g.status === 'cleared').length;

  $('#statMetrics').innerHTML = `
    <div class="metric"><div class="metric-label">总时长</div><div class="metric-value">${(all / 3600).toFixed(1)}<small>小时</small></div></div>
    <div class="metric"><div class="metric-label">本周</div><div class="metric-value">${(week / 3600).toFixed(1)}<small>小时</small></div></div>
    <div class="metric"><div class="metric-label">连续天数</div><div class="metric-value">${streak}<small>天</small></div></div>
    <div class="metric"><div class="metric-label">已玩作品</div><div class="metric-value">${played}<small>/ ${state.games.length}</small></div></div>`;

  renderHeatmap();

  const rank = state.games.filter((g) => (g.totalSeconds || 0) > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 6);
  const max = rank.length ? rank[0].totalSeconds : 1;
  $('#rankList').innerHTML = rank.length
    ? rank.map((g, i) => `
      <div class="rank-row">
        <div class="rank-idx">${i + 1}</div>
        <div class="rank-body">
          <div class="rank-name">${esc(g.name)}</div>
          <div class="rank-bar"><i style="width:${Math.max(3, (g.totalSeconds / max) * 100)}%"></i></div>
        </div>
        <div class="rank-hours">${(g.totalSeconds / 3600).toFixed(1)} h</div>
      </div>`).join('')
    : '<div class="empty-line">还没有游玩记录。</div>';

  const recent = (state.sessions || []).filter((s) => s.counted)
    .sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);
  const nameOf = (id) => (state.games.find((g) => g.id === id) || {}).name || '已删除的游戏';
  $('#recentSessions').innerHTML = recent.length
    ? recent.map((s) => `
      <div class="srow srow-recent">
        <span class="srow-date">${fmtDate(s.startedAt)}</span>
        <span style="color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nameOf(s.gameId))}</span>
        <span class="srow-dur">${fmtClockShort(s.seconds)}</span>
      </div>`).join('')
    : '<div class="empty-line">还没有记录。</div>';
}

/* ---------------- 游玩热力 ---------------- */

const HEAT_RANGES = [
  { id: '7d', label: '最近一周', days: 7 },
  { id: '30d', label: '最近一月', days: 30 },
  { id: '90d', label: '最近三月', days: 90 },
  { id: '180d', label: '最近六月', days: 180 },
  { id: '365d', label: '最近一年', days: 365 },
  { id: 'all', label: '全部时间', days: 0 }
];

let heatRange = '365d';
let heatYear = 'all';
let heatMode = 'time';
let heatLayout = 'month';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function hourText(sec) {
  const v = Math.max(0, Math.round(sec || 0));
  if (v < 60) return '0 分钟';
  if (v < 3600) return Math.round(v / 60) + ' 分钟';
  return (v / 3600).toFixed(1) + ' 小时';
}

function heatWindow() {
  const today = startOfDay(new Date());

  if (heatRange === 'all') {
    if (heatYear !== 'all') {
      const y = Number(heatYear);
      const start = new Date(y, 0, 1);
      let end = new Date(y, 11, 31);
      if (end > today) end = today;
      return { start, end };
    }
    let min = null;
    for (const s of state.sessions || []) {
      if (!s.counted) continue;
      const d = startOfDay(new Date(s.startedAt));
      if (!min || d < min) min = d;
    }
    if (!min || min > today) min = new Date(today.getFullYear(), 0, 1);
    return { start: min, end: today };
  }

  const cfg = HEAT_RANGES.find((r) => r.id === heatRange) || HEAT_RANGES[4];
  let start = new Date(today);
  start.setDate(start.getDate() - (cfg.days - 1));
  // 三个月以上的范围：从下个月 1 号算起，避免最前面出现一块只有几天的月份
  if (cfg.days >= 90 && start.getDate() !== 1) {
    start = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  }
  return { start, end: today };
}

function heatAgg() {
  const { start, end } = heatWindow();
  const days = new Map();

  for (const s of state.sessions || []) {
    if (!s.counted) continue;
    const d = startOfDay(new Date(s.startedAt));
    if (d < start || d > end) continue;
    const k = dayKey(d.getTime());
    let rec = days.get(k);
    if (!rec) { rec = { sec: 0, games: new Map() }; days.set(k, rec); }
    const sec = s.seconds || 0;
    rec.sec += sec;
    rec.games.set(s.gameId, (rec.games.get(s.gameId) || 0) + sec);
  }
  return { start, end, days };
}

function topGameOf(rec) {
  if (!rec || !rec.games.size) return null;
  let best = null;
  for (const [id, sec] of rec.games) {
    if (!best || sec > best.sec) best = { id, sec };
  }
  return best;
}

function levelOf(sec) {
  if (sec >= 10800) return 4;
  if (sec >= 5400) return 3;
  if (sec >= 1800) return 2;
  if (sec >= 60) return 1;
  return 0;
}

function compactHeatHtml(list, cellHtml, cell) {
  const offset = (list[0].getDay() + 6) % 7;
  const total = Math.ceil((offset + list.length) / 7) * 7;
  const weeks = total / 7;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<i class="is-blank"></i>');
  for (const d of list) cells.push(cellHtml(d));
  for (let i = offset + list.length; i < total; i++) cells.push('<i class="is-blank"></i>');

  const marks = [];
  let lastMonth = -1;
  list.forEach((d, idx) => {
    const m = d.getMonth();
    if (m === lastMonth) return;
    lastMonth = m;
    const col = Math.floor((offset + idx) / 7) + 1;
    if (idx === 0 || col <= weeks - 1) marks.push(`<span style="grid-column:${col}">${m + 1} 月</span>`);
  });

  const wd = ['一', '', '三', '', '五', '', ''].map((t) => `<span>${t}</span>`).join('');
  return `<div class="hc-wd">${wd}</div>
    <div class="hc-col">
      <div class="hc-months" style="grid-template-columns: repeat(${weeks}, ${cell}px)">${marks.join('')}</div>
      <div class="hc-grid">${cells.join('')}</div>
    </div>`;
}

let heatPrefsLoaded = false;

function applyHeatControls() {
  $$('#heatMode .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.hmode === heatMode));
  $$('#heatLayout .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.hlayout === heatLayout));
  const rangeSel = $('#heatRange');
  if (rangeSel) rangeSel.value = heatRange;
}

/** 首次渲染时把上次选的范围/年份/布局/模式读回来 */
function ensureHeatPrefs() {
  if (heatPrefsLoaded) return;
  const s = state.settings || {};
  if (s.heatRange) heatRange = s.heatRange;
  if (s.heatYear) heatYear = s.heatYear;
  if (s.heatLayout) heatLayout = s.heatLayout;
  if (s.heatMode) heatMode = s.heatMode;
  heatPrefsLoaded = true;
  applyHeatControls();
}

function renderHeatmap() {
  const grid = $('#heatmap');
  if (!grid) return;
  ensureHeatPrefs();

  const { start, end, days } = heatAgg();
  const months = $('#heatMonths');
  const wd = $('#heatWd');
  const legend = $('#heatLegend');
  const tip = $('#heatTip');
  if (tip) tip.classList.add('hidden');

  const list = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) list.push(new Date(d));

  const total = [...days.values()].reduce((a, r) => a + r.sec, 0);
  const active = days.size;
  const rangeLabel = heatRange === 'all'
    ? (heatYear === 'all' ? '全部时间' : heatYear + ' 年')
    : ((HEAT_RANGES.find((r) => r.id === heatRange) || {}).label || '');
  $('#heatSummary').textContent = `${rangeLabel} · ${hourText(total)} · ${active} 天有记录`;

  // 年份下拉只在「全部时间」时出现
  const yearSel = $('#heatYear');
  if (yearSel) {
    if (heatRange === 'all') {
      const years = new Set();
      for (const s of state.sessions || []) {
        if (s.counted) years.add(new Date(s.startedAt).getFullYear());
      }
      years.add(new Date().getFullYear());
      const opts = ['<option value="all">全部年份</option>']
        .concat([...years].sort((a, b) => b - a).map((y) => `<option value="${y}">${y} 年</option>`));
      if (heatYear !== 'all' && !years.has(Number(heatYear))) heatYear = 'all';
      yearSel.innerHTML = opts.join('');
      yearSel.value = heatYear;
      yearSel.classList.remove('hidden');
    } else {
      yearSel.classList.add('hidden');
    }
  }

  const cellHtml = (d) => {
    const k = dayKey(d.getTime());
    const rec = days.get(k);
    const sec = rec ? rec.sec : 0;
    const top = topGameOf(rec);
    const game = top ? state.games.find((g) => g.id === top.id) : null;
    const dateText = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const meta = `data-k="${dateText}" data-sec="${sec}" data-game="${esc(game ? game.name : '')}" data-gsec="${top ? top.sec : 0}"`;
    if (heatMode === 'cover' && game && game.coverUrl) {
      return `<i ${meta}><img src="${esc(game.coverUrl)}" alt="" loading="lazy"></i>`;
    }
    return `<i class="l${levelOf(sec)}" ${meta}></i>`;
  };
  if (heatLayout === 'compact') {
    const ccell = heatMode === 'cover' ? 16 : 12;
    grid.className = 'heatmap is-compact' + (heatMode === 'cover' ? ' is-cover' : '');
    grid.style.setProperty('--hcell', ccell + 'px');
    grid.innerHTML = compactHeatHtml(list, cellHtml, ccell);
  } else {
    const dayCount = list.length;
    // 块宽自适应铺满整行；最小块宽 300 保证一行 3 块、格子够大
    const minBlock = 300;
    grid.className = 'heatmap' + (heatMode === 'cover' ? ' is-cover' : '');
    grid.style.setProperty('--blockw', minBlock + 'px');
    // 短区间（块少）用定宽轨道并居中，避免左边挤一堆、右边一大片空白
    if (dayCount <= 31) {
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 380px))';
      grid.style.justifyContent = 'center';
    } else {
      grid.style.gridTemplateColumns = '';
      grid.style.justifyContent = '';
    }

    // 按自然月切块
    const blocks = [];
    let cur = new Date(start);
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const monthEnd = new Date(y, m + 1, 0);
      const last = monthEnd > end ? end : monthEnd;
      const list2 = [];
      for (let d = new Date(cur); d <= last; d.setDate(d.getDate() + 1)) list2.push(new Date(d));
      blocks.push({ y, m, days: list2 });
      cur = new Date(y, m + 1, 1);
    }

    const blank = '<i class="is-blank"></i>';

    grid.innerHTML = blocks.map((b, i) => {
      // 一周以内不按日历对齐，直接排成一行
      const solo = blocks.length === 1 && b.days.length <= 7;
      const offset = solo ? 0 : (b.days[0].getDay() + 6) % 7;
      const total = solo ? 7 : Math.ceil((offset + b.days.length) / 7) * 7;

      const cells = [];
      for (let k = 0; k < offset; k++) cells.push(blank);
      for (const d of b.days) cells.push(cellHtml(d));
      for (let k = offset + b.days.length; k < total; k++) cells.push(blank);

      const showYear = i === 0 || b.m === 0;
      let label;
      if (solo) {
        const a = b.days[0];
        const z = b.days[b.days.length - 1];
        label = `<b>${a.getFullYear()} 年</b> ${a.getMonth() + 1} 月 ${a.getDate()} 日 – ${z.getDate()} 日`;
      } else {
        label = showYear ? `<b>${b.y} 年</b> ${b.m + 1} 月` : `${b.m + 1} 月`;
      }
      return `<div class="heat-block">
        <div class="hb-label">${label}</div>
        <div class="hb-grid">${cells.join('')}</div>
      </div>`;
    }).join('');
  }

  if (legend) {
    legend.innerHTML = heatMode === 'cover'
      ? '<i class="sample-cover"></i><span>格子里是当天玩得最多的作品 · 灰块表示当天没玩</span>'
      : '<span>少</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>多</span>';
  }
}

function bindHeatTooltip() {
  const grid = $('#heatmap');
  const tip = $('#heatTip');
  if (!grid || !tip) return;

  const place = (x, y) => {
    const rect = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y - rect.height - 12;
    if (left + rect.width > window.innerWidth - 10) left = x - rect.width - 14;
    if (top < 10) top = y + 18;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  };

  const show = (el, x, y) => {
    const sec = Number(el.dataset.sec || 0);
    const gsec = Number(el.dataset.gsec || 0);
    const name = el.dataset.game || '';
    const parts = (el.dataset.k || '').split('-').map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const week = '日一二三四五六'[dt.getDay()];
    tip.innerHTML = `<div class="t-date">${parts[0]} 年 ${parts[1]} 月 ${parts[2]} 日 · 周${week}</div>
      <div class="t-main">${sec ? hourText(sec) : '没有游玩'}</div>
      ${name ? `<div class="t-game">${esc(name)}<em>${hourText(gsec)}</em></div>` : ''}`;
    tip.classList.remove('hidden');
    place(x, y);
  };

  grid.addEventListener('mouseover', (e) => {
    const el = e.target.closest('i[data-k]');
    if (el) show(el, e.clientX, e.clientY);
  });

  grid.addEventListener('mousemove', (e) => {
    if (tip.classList.contains('hidden')) return;
    const el = e.target.closest('i[data-k]');
    if (!el) return;
    place(e.clientX, e.clientY);
  });

  grid.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}

/* ---------------- 通关档案 ---------------- */

const TIERS = [
  { id: 'top', label: '夯', note: '本命级' },
  { id: 'high', label: '上', note: '很喜欢' },
  { id: 'upperMid', label: '中上', note: '挺不错' },
  { id: 'mid', label: '中', note: '还不错' },
  { id: 'lowerMid', label: '中下', note: '有点可惜' },
  { id: 'low', label: '下', note: '不合口味' }
];

const tierLabel = (id) => (TIERS.find((t) => t.id === id) || {}).label || '';

function clearedGames() {
  return state.games.filter((g) => g.status === 'cleared');
}

/** 通关顺序：completionOrder 里有的按数组顺序，剩下的按通关时间接在后面 */
function orderedCleared() {
  const cleared = clearedGames();
  const byId = new Map(cleared.map((g) => [g.id, g]));
  const order = (state.settings.completionOrder || []).filter((id) => byId.has(id));
  const seen = new Set(order);
  const rest = cleared
    .filter((g) => !seen.has(g.id))
    .sort((a, b) => (a.clearedAt || a.lastPlayedAt || 0) - (b.clearedAt || b.lastPlayedAt || 0));
  return [...order.map((id) => byId.get(id)), ...rest];
}

function tierCard(g) {
  return `<div class="tier-card" draggable="true" data-drag="${g.id}" title="${esc(g.name)}">
    ${coverBlock(g, 'tier-cover')}
  </div>`;
}

function poolCard(g) {
  return `<div class="pool-card ${g.tier ? 'is-tiered' : ''}" draggable="true" data-drag="${g.id}" title="${esc(g.name)}">
    ${coverBlock(g, 'pool-cover')}
    ${g.tier ? `<span class="pool-tag t-${g.tier}">${tierLabel(g.tier)}</span>` : ''}
  </div>`;
}

function recRow(g, i) {
  const when = g.clearedAt ? fmtDay(g.clearedAt) : '—';
  return `<div class="rec-row" draggable="true" data-rec="${g.id}">
    <span class="rec-handle" title="拖动排序">⠿</span>
    <span class="rec-idx">${i + 1}</span>
    <div class="rec-cover">${coverBlock(g, 'rec-img')}</div>
    <div class="rec-main">
      <div class="rec-name">${esc(g.name)}</div>
      <div class="rec-meta">通关于 ${when} · 累计 ${hoursShort(g.totalSeconds)}</div>
    </div>
    <span class="rec-tier ${g.tier ? 't-' + g.tier : 'is-none'}">${g.tier ? tierLabel(g.tier) : '未分级'}</span>
  </div>`;
}

function renderCleared() {
  const host = el.cleared;
  if (!host) return;

  const cleared = clearedGames();
  if (!cleared.length) {
    host.innerHTML = `<div class="cleared-page">
      <div class="panel cleared-empty">
        <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 4.2h8v4.3a4 4 0 0 1-8 0V4.2Z" /><path d="M8 5.4H5.6v1.1a3 3 0 0 0 2.9 3" /><path d="M16 5.4h2.4v1.1a3 3 0 0 1-2.9 3" /><path d="M12 12.6v3.6" /><path d="M8.6 19.4h6.8" /><path d="M10.4 16.2h3.2l.7 3.2H9.7l.7-3.2Z" />
        </svg>
        <h3>还没有通关的游戏</h3>
        <p>在详情页把状态改成「已通关」，这里就会出现分级看板和通关记录。</p>
        <button class="btn" data-go-library>回游戏库看看</button>
      </div>
    </div>`;
    return;
  }

  const ordered = orderedCleared();
  const tiered = cleared.filter((g) => g.tier).length;

  host.innerHTML = `<div class="cleared-page">
    <div class="cleared-hero">
      <div class="ch-main">
        <h2>通关档案</h2>
        <p>${cleared.length} 部已通关 · ${tiered} 部已分级</p>
      </div>
      <div class="ch-stats">
        ${TIERS.map((t) => `<div class="ch-stat t-${t.id}"><b>${cleared.filter((g) => g.tier === t.id).length}</b><span>${t.label}</span></div>`).join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>我的分级</h3>
        <span class="panel-sub">把右边的封面拖进等级，随时可以换；拖回右侧即取消分级</span>
      </div>
      <div class="tier-layout">
        <div class="tier-board">
          ${TIERS.map((t) => {
            const list = cleared.filter((g) => g.tier === t.id);
            return `<div class="tier-row">
              <div class="tier-label t-${t.id}"><b>${t.label}</b><span>${t.note}</span></div>
              <div class="tier-lane" data-drop-tier="${t.id}">
                ${list.length ? list.map(tierCard).join('') : '<span class="tier-empty">拖到这里</span>'}
              </div>
              <span class="tier-count">${list.length || ''}</span>
            </div>`;
          }).join('')}
        </div>
        <aside class="tier-pool">
          <div class="pool-head"><span>全部通关作品</span><b>${cleared.length}</b></div>
          <div class="pool-grid" data-drop-pool="1">
            ${ordered.map(poolCard).join('')}
          </div>
          <p class="pool-hint">按住封面拖动，带角标的表示已经分过级</p>
        </aside>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3>通关记录</h3>
        <span class="panel-sub">拖动左侧手柄调整顺序，新通关的默认排最后</span>
      </div>
      <div class="rec-list">${ordered.map(recRow).join('')}</div>
    </div>
  </div>`;
}

let clearedDragging = null;
let clearedDragRec = null;
let clearedJustDragged = false;

function bindClearedDnD() {
  const host = el.cleared;
  if (!host || host.dataset.dnd === '1') return;
  host.dataset.dnd = '1';

  host.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-drag]');
    if (card) {
      clearedDragging = card.dataset.drag;
      clearedJustDragged = true;
      e.dataTransfer.setData('text/plain', clearedDragging);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
      return;
    }
    const row = e.target.closest('[data-rec]');
    if (row) {
      clearedDragRec = row.dataset.rec;
      clearedJustDragged = true;
      e.dataTransfer.setData('text/plain', clearedDragRec);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    }
  });

  host.addEventListener('dragend', () => {
    clearedDragging = null;
    clearedDragRec = null;
    host.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging'));
    host.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
    host.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
    setTimeout(() => { clearedJustDragged = false; }, 260);
  });

  host.addEventListener('dragover', (e) => {
    if (clearedDragging) {
      const zone = e.target.closest('[data-drop-tier], [data-drop-pool]');
      if (!zone) return;
      e.preventDefault();
      host.querySelectorAll('.is-over').forEach((n) => { if (n !== zone) n.classList.remove('is-over'); });
      zone.classList.add('is-over');
      return;
    }
    if (clearedDragRec) {
      const row = e.target.closest('[data-rec]');
      if (!row || row.dataset.rec === clearedDragRec) return;
      e.preventDefault();
      host.querySelectorAll('.drop-before').forEach((n) => { if (n !== row) n.classList.remove('drop-before'); });
      row.classList.add('drop-before');
    }
  });

  host.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('[data-drop-tier], [data-drop-pool], [data-rec]');
    if (zone) zone.classList.remove('is-over', 'drop-before');
  });

  host.addEventListener('drop', async (e) => {
    setTimeout(() => { clearedJustDragged = false; }, 300);
    if (clearedDragging) {
      const zone = e.target.closest('[data-drop-tier], [data-drop-pool]');
      if (!zone) return;
      e.preventDefault();
      const id = clearedDragging;
      clearedDragging = null;
      await window.api.updateGame(id, { tier: zone.dataset.dropTier || '' });
      return;
    }
    if (clearedDragRec) {
      const row = e.target.closest('[data-rec]');
      if (!row) return;
      e.preventDefault();
      const ids = [...host.querySelectorAll('.rec-row')].map((n) => n.dataset.rec);
      const from = ids.indexOf(clearedDragRec);
      const to = ids.indexOf(row.dataset.rec);
      clearedDragRec = null;
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      await window.api.saveSettings({ completionOrder: ids });
    }
  });

  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-go-library]')) { switchView('library'); return; }
    if (clearedJustDragged) return;
    const card = e.target.closest('[data-drag]');
    if (card) openDetail(card.dataset.drag);
  });
}

/* ---------------- 设置 ---------------- */

let lastPwdJson = '';
let pwdForce = false;

function renderPwdManager() {
  const list = lockPasswords();
  $('#pwdCount').textContent = `${list.length} / 10`;
  $('#btnAddPwd').disabled = list.length >= 10;

  const json = JSON.stringify(list);
  const focusInside = $('#pwdList').contains(document.activeElement);
  if (!pwdForce && (focusInside || json === lastPwdJson)) return;

  lastPwdJson = json;
  pwdForce = false;

  $('#pwdList').innerHTML = list.map((p) => `
    <div class="pwd-row">
      <input class="input" value="${esc(p.password)}" ${p.fixed ? 'disabled' : ''} data-pwd="${p.id}" placeholder="密码" spellcheck="false" />
      <input class="input" value="${esc(p.hint || '')}" data-hint="${p.id}" placeholder="提示" spellcheck="false" />
      <button class="mini-btn" data-pwd-del="${p.id}" ${p.fixed ? 'disabled' : ''} title="${p.fixed ? '内置密码不可删除' : '删除'}">删</button>
    </div>`).join('');
}

function collectPasswords() {
  return $$('#pwdList .pwd-row')
    .map((row) => {
      const p = row.querySelector('[data-pwd]');
      const h = row.querySelector('[data-hint]');
      return { id: p.dataset.pwd, password: p.value.trim(), hint: h.value.trim() };
    })
    .filter((x) => x.password);
}

function savePasswords(list) {
  lastPwdJson = JSON.stringify(list);
  window.api.saveSettings({ lockPasswords: list });
}

function bindPwdManager() {
  $('#setLock').addEventListener('change', (e) => {
    window.api.saveSettings({ lockEnabled: e.target.checked });
  });

  $('#btnPwdManage').addEventListener('click', () => {
    const panel = $('#pwdPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      pwdForce = true;
      renderPwdManager();
    }
  });

  $('#btnAddPwd').addEventListener('click', () => {
    const rows = $$('#pwdList .pwd-row');
    if (rows.length >= 10) { toast('最多 10 个密码', 'error'); return; }
    const id = 'p_' + Date.now().toString(36);
    const row = document.createElement('div');
    row.className = 'pwd-row';
    row.innerHTML = `<input class="input" data-pwd="${id}" placeholder="密码" spellcheck="false" />
      <input class="input" data-hint="${id}" placeholder="提示" spellcheck="false" />
      <button class="mini-btn" data-pwd-del="${id}">删</button>`;
    $('#pwdList').appendChild(row);
    row.querySelector('[data-pwd]').focus();
  });

  $('#pwdList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pwd-del]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.pwdDel;
    const list = collectPasswords().filter((p) => p.id !== id);
    pwdForce = true;
    savePasswords(list);
  });

  $('#pwdList').addEventListener('change', () => {
    savePasswords(collectPasswords());
  });
}

function renderSettings() {
  $('#setTrackMode').value = state.settings.defaultTrackMode || 'folder';
  $('#setDelay').value = state.settings.defaultInitialDelay || 6000;
  $('#dataPath').textContent = state.dataDir || '—';
  $('#appVersion').textContent = state.version || '1.0.0';
  $('#setBlur').checked = !!state.settings.blurCovers;
  $('#setTrayNotice').checked = state.settings.trayNotice !== false;
  $('#setShot').checked = !!state.settings.screenshotEnabled;
  $('#setShotMouse').value = state.settings.screenshotMouse || 'x1';
  if (document.activeElement !== $('#setShotKey')) {
    $('#setShotKey').value = state.settings.screenshotKey || 'F9';
  }
  $('#setLock').checked = !!state.settings.lockEnabled;
  renderPwdManager();
  $('#setLaunchClock').checked = !!state.settings.launchClock;
  $('#setMinOnLaunch').checked = !!state.settings.minimizeOnLaunch;
  $('#setMinNotice').checked = !!state.settings.minimizeOnLaunchNotice;
  $('#setShowOnExit').checked = !!state.settings.showOnGameExit;
  $('#setMinNotice').disabled = !state.settings.minimizeOnLaunch;
  $('#setMinNotice').closest('.switch').classList.toggle('is-disabled', !state.settings.minimizeOnLaunch);
  $('#setCloseClock').checked = state.settings.closeClockOnExit !== false;
  $('#clockPathText').textContent = state.settings.clockPath || '未设置';
  $('#clockPathText').title = state.settings.clockPath || '';

  const modeSel = $('#setTrackMode');
  if (!modeSel.dataset.bound) {
    modeSel.dataset.bound = '1';
    modeSel.addEventListener('change', () => window.api.saveSettings({ defaultTrackMode: modeSel.value }));
    const delay = $('#setDelay');
    delay.addEventListener('change', () => {
      const v = Math.max(0, Math.min(60000, Number(delay.value) || 0));
      delay.value = v;
      window.api.saveSettings({ defaultInitialDelay: v });
    });
    $('#setBlur').addEventListener('change', (e) => {
      document.body.classList.toggle('privacy', e.target.checked);
      window.api.saveSettings({ blurCovers: e.target.checked });
    });
    $('#btnOpenData').addEventListener('click', () => window.api.openData());
    $('#setMinOnLaunch').addEventListener('change', (e) => {
      const on = e.target.checked;
      window.api.saveSettings({ minimizeOnLaunch: on });
      $('#setMinNotice').disabled = !on;
      $('#setMinNotice').closest('.switch').classList.toggle('is-disabled', !on);
    });
    $('#setMinNotice').addEventListener('change', (e) => {
      window.api.saveSettings({ minimizeOnLaunchNotice: e.target.checked });
    });
    $('#setShowOnExit').addEventListener('change', (e) => {
      window.api.saveSettings({ showOnGameExit: e.target.checked });
    });
    $('#setLaunchClock').addEventListener('change', (e) => {
      window.api.saveSettings({ launchClock: e.target.checked });
    });
    $('#setCloseClock').addEventListener('change', (e) => {
      window.api.saveSettings({ closeClockOnExit: e.target.checked });
    });

    $('#setTrayNotice').addEventListener('change', (e) => {
      window.api.saveSettings({ trayNotice: e.target.checked });
    });
    $('#setShot').addEventListener('change', (e) => {
      window.api.saveSettings({ screenshotEnabled: e.target.checked });
    });
    $('#setShotMouse').addEventListener('change', (e) => {
      window.api.saveSettings({ screenshotMouse: e.target.value });
    });
    const keyInput = $('#setShotKey');
    keyInput.addEventListener('focus', (e) => {
      keyRecording = true;
      e.target.value = '';
      e.target.placeholder = '按下想要的键（Esc 取消）';
    });
    keyInput.addEventListener('blur', (e) => {
      keyRecording = false;
      e.target.placeholder = '点这里，然后按下想要的键';
      e.target.value = state.settings.screenshotKey || 'F9';
    });
    keyInput.addEventListener('keydown', (e) => {
      if (!keyRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { keyInput.blur(); return; }
      const accel = accelFromEvent(e);
      if (!accel) return;
      window.api.saveSettings({ screenshotKey: accel });
      keyInput.value = accel;
      keyInput.blur();
    });
    bindPwdManager();
    $('#btnPickClock').addEventListener('click', async () => {
      const res = await window.api.pickClock();
      if (res && res.ok) {
        await window.api.saveSettings({ clockPath: res.path });
        toast('已设置为：' + res.path);
      }
    });
  }
}

/* ---------------- 弹窗 ---------------- */

function openModal(html) {
  el.modalRoot.innerHTML = `<div class="modal-card">${html}</div>`;
  el.modalRoot.classList.remove('hidden');
}

function closeModal() {
  el.modalRoot.classList.add('hidden');
  el.modalRoot.innerHTML = '';
  pendingMeta = null;
}

function openAddModal() {
  pendingMeta = null;
  const defMode = state.settings.defaultTrackMode || 'folder';
  const defDelay = state.settings.defaultInitialDelay || 6000;

  openModal(`
    <div class="modal-head">
      <h3>添加游戏</h3>
      <button class="modal-close" data-close>×</button>
    </div>

    <div class="form-row">
      <div class="form-label">游戏名称</div>
      <input class="input" id="fName" placeholder="例如 纯白交响曲" spellcheck="false">
    </div>

    <div class="form-row">
      <div class="form-label">启动文件 <em>游戏目录里的 exe</em></div>
      <div class="input-row">
        <input class="input" id="fExe" placeholder="选择或粘贴 exe 完整路径" spellcheck="false">
        <button class="btn" id="fBrowse">浏览</button>
      </div>
      <div class="form-tip">安装目录会自动取 exe 所在的文件夹，用于「目录追踪」判定游戏是否在运行。</div>
    </div>

    <div class="form-row">
      <div class="form-label">追踪方式</div>
      <select class="select select-wide" id="fMode">
        <option value="folder">目录（推荐）</option>
        <option value="process">进程及子进程</option>
        <option value="original">仅启动的那一个进程</option>
        <option value="name">按进程名</option>
      </select>
      <div class="form-tip" id="fModeTip"></div>
    </div>

    <div class="form-row">
      <div class="form-label">封面</div>
      <div class="input-row">
        <button class="btn" id="fSearchCover">按名称自动匹配</button>
        <button class="btn" id="fLocalCover">本地图片</button>
      </div>
      <div id="fCoverResult"></div>
    </div>

    <div class="modal-foot">
      <button class="btn" data-close>取消</button>
      <button class="btn btn-primary" id="fSubmit">添加</button>
    </div>`);

  $('#fMode').value = defMode;
  $('#fModeTip').textContent = modeTip(defMode);
  $('#fMode').addEventListener('change', (e) => { $('#fModeTip').textContent = modeTip(e.target.value); });

  $$('[data-close]', el.modalRoot).forEach((b) => b.addEventListener('click', closeModal));

  $('#fBrowse').addEventListener('click', async () => {
    const res = await window.api.pickExe();
    if (!res.ok) return;
    $('#fExe').value = res.exePath;
    if (!$('#fName').value.trim()) {
      const base = res.exePath.split(/[\\/]/).pop().replace(/\.exe$/i, '');
      $('#fName').value = cleanName(base);
    }
  });

  $('#fSearchCover').addEventListener('click', () => {
    const q = $('#fName').value.trim();
    if (!q) return toast('先填一下游戏名称', 'error');
    searchCoverInto($('#fCoverResult'), q, (item) => { pendingMeta = item; });
  });

  $('#fLocalCover').addEventListener('click', () => toast('添加后在详情页用「封面」按钮换本地图'));

  $('#fSubmit').addEventListener('click', async () => {
    const name = $('#fName').value.trim();
    const exePath = $('#fExe').value.trim().replace(/^"|"$/g, '');
    if (!name) return toast('请填写游戏名称', 'error');
    if (!exePath) return toast('请选择启动文件', 'error');

    const res = await window.api.addGame({
      name,
      exePath,
      trackMode: $('#fMode').value,
      initialDelay: defDelay
    });
    if (!res.ok) return toast(res.error, 'error');

    if (pendingMeta) {
      toast('封面正在后台下载…');
      const applied = await window.api.applyMeta(res.game.id, pendingMeta);
      if (!applied.ok) toast('封面获取失败：' + applied.error, 'error');
    }
    closeModal();
    toast('已添加：' + name);
  });
}

function modeTip(mode) {
  return {
    folder: '只要游戏目录里有进程在跑就算在玩，对付带启动器/破解壳的游戏最稳。',
    process: '启动的进程和它派生出来的子进程都退出才算结束。',
    original: '只看最初那个进程，适口启动器一直不退出、本体是子进程的情况。',
    name: '直接盯某个进程名，最省事但需要填对名字。',
    nameextra: ''
  }[mode] || '';
}

function cleanName(base) {
  return base
    .replace(/[_]+/g, ' ')
    .replace(/\b(chs|cn|zh|jp|jpn|dl|chs_dl)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || base;
}

async function searchCoverInto(container, query, onPick) {
  container.innerHTML = '<div class="pick-loading">正在搜索…（VNDB 可能有点慢）</div>';
  const res = await window.api.searchMeta(query);
  if (!res.ok) {
    container.innerHTML = `<div class="pick-loading">${esc(res.error)}</div>`;
    return;
  }
  if (!res.results.length) {
    container.innerHTML = '<div class="pick-loading">没搜到，可以稍后在详情页用本地图片。</div>';
    return;
  }
  container.innerHTML = `<div class="cover-grid">${res.results.map((r, i) => `
    <button class="cover-pick" data-idx="${i}">
      ${r.image ? `<img src="${esc(r.image)}" alt="">` : '<div class="cover-ph"></div>'}
      <span>${esc(r.title)}</span>
    </button>`).join('')}</div>`;

  $$('.cover-pick', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.cover-pick', container).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      onPick(res.results[Number(btn.dataset.idx)]);
      toast('已选中封面，添加时会一起保存');
    });
  });
}

function openEditModal(g) {
  openModal(`
    <div class="modal-head">
      <h3>编辑游戏</h3>
      <button class="modal-close" data-close>×</button>
    </div>
    <div class="form-row">
      <div class="form-label">游戏名称</div>
      <input class="input" id="eName" value="${esc(g.name)}" spellcheck="false">
    </div>
    <div class="form-row">
      <div class="form-label">原名 / 副标题</div>
      <input class="input" id="eOriginal" value="${esc(g.originalName || '')}" spellcheck="false">
    </div>
    <div class="form-row">
      <div class="form-label">启动文件</div>
      <div class="input-row">
        <input class="input" id="eExe" value="${esc(g.exePath)}" spellcheck="false">
        <button class="btn" id="eBrowse">浏览</button>
      </div>
    </div>
    <div class="form-row">
      <div class="form-label">追踪方式</div>
      <select class="select select-wide" id="eMode">
        <option value="folder">目录（推荐）</option>
        <option value="process">进程及子进程</option>
        <option value="original">仅启动的那一个进程</option>
        <option value="name">按进程名</option>
      </select>
    </div>
    <div class="form-row" id="eNameRow" style="${g.trackMode === 'name' ? '' : 'display:none'}">
      <div class="form-label">进程名 <em>不带 .exe</em></div>
      <input class="input" id="eModeValue" value="${esc(g.trackValue || '')}" spellcheck="false">
    </div>
    <div class="form-row">
      <div class="form-label">初始等待（毫秒）</div>
      <input class="input" id="eDelay" type="number" min="0" max="60000" step="1000" value="${g.initialDelay || 0}">
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>取消</button>
      <button class="btn btn-primary" id="eSave">保存</button>
    </div>`);

  $('#eMode').value = g.trackMode || 'folder';
  $('#eMode').addEventListener('change', (e) => {
    $('#eNameRow').style.display = e.target.value === 'name' ? '' : 'none';
  });
  $$('[data-close]', el.modalRoot).forEach((b) => b.addEventListener('click', closeModal));
  $('#eBrowse').addEventListener('click', async () => {
    const res = await window.api.pickExe();
    if (res.ok) $('#eExe').value = res.exePath;
  });
  $('#eSave').addEventListener('click', async () => {
    const exePath = $('#eExe').value.trim().replace(/^"|"$/g, '');
    if (!exePath) return toast('启动文件不能为空', 'error');
    const mode = $('#eMode').value;
    const res = await window.api.updateGame(g.id, {
      name: $('#eName').value.trim() || g.name,
      originalName: $('#eOriginal').value.trim(),
      exePath,
      workDir: exePath.replace(/[\\/][^\\/]+$/, ''),
      trackMode: mode,
      trackValue: $('#eModeValue').value.trim(),
      initialDelay: Math.max(0, Math.min(60000, Number($('#eDelay').value) || 0))
    });
    if (!res.ok) return toast(res.error, 'error');
    closeModal();
    toast('已保存');
  });
}

async function confirmDelete(g) {
  const ok = await confirmBox('删除「' + g.name + '」？', '只会从启动器里移除，不会删除磁盘上的游戏文件。');
  if (!ok) return;
  const res = await window.api.deleteGame(g.id);
  if (!res.ok) return toast(res.error, 'error');
  closeDetail();
  toast('已移除');
}

function askNumber(title, value, hint) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" data-close>×</button></div>
      <div class="form-row">
        <input class="input" id="askInput" type="number" min="0" step="1" value="${Number(value) || 0}" style="max-width:none">
        <div class="form-tip">${esc(hint || '')}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-primary" id="askOk">确定</button>
      </div>`);
    const input = $('#askInput');
    const done = (v) => { closeModal(); resolve(v); };
    $$('[data-close]', el.modalRoot).forEach((b) => b.addEventListener('click', () => done(null)));
    $('#askOk').addEventListener('click', () => done(Number(input.value) || 0));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(Number(input.value) || 0); });
    input.focus();
    input.select();
  });
}

function confirmBox(title, message) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" data-close>×</button></div>
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin:0">${esc(message || '')}</p>
      <div class="modal-foot">
        <button class="btn" data-close>取消</button>
        <button class="btn btn-primary" id="okBtn">确定</button>
      </div>`);
    const done = (v) => { closeModal(); resolve(v); };
    $$('[data-close]', el.modalRoot).forEach((b) => b.addEventListener('click', () => done(false)));
    $('#okBtn').addEventListener('click', () => done(true));
  });
}

/* ---------------- Toast ---------------- */

function toast(message, type) {
  const node = document.createElement('div');
  node.className = 'toast' + (type === 'error' ? ' error' : type === 'ok' ? ' ok' : '');
  node.textContent = message;
  el.toasts.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s, transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

/* ---------------- 截图辅助 ---------------- */

window.__shotView = (v) => {
  if (v === 'add') { openAddModal(); return; }
  if (v === 'measure') {
    const n = document.querySelector('.brand-name');
    const r = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return sel + '=null';
      const b = e.getBoundingClientRect();
      return `${sel}=[x${Math.round(b.x)} y${Math.round(b.y)} w${Math.round(b.width)} h${Math.round(b.height)}]`;
    };
    console.log('[diag] ' + [
      n ? 'brandName ' + n.scrollWidth + '/' + n.clientWidth : '',
      r('#app'), r('.sidebar'), r('.gamestrip'), r('.main'), r('#view-hero'),
      (() => {
        const s = document.querySelector('.gamestrip');
        const a = s && s.querySelector('.strip-item.is-active');
        return s ? `stripTop=${Math.round(s.scrollTop)} scrollH=${s.scrollHeight} clientH=${s.clientHeight} active=${a ? Math.round(a.getBoundingClientRect().top) + '..' + Math.round(a.getBoundingClientRect().bottom) : 'none'}` : '';
      })()
    ].join(' '));
    return;
  }
  if (v === 'backtest') {
    const g = state.games.find((x) => x.coverUrl) || state.games[0];
    openDetail(g.id);
    setTimeout(() => {
      const btn = document.querySelector('.nav-back');
      if (btn) btn.click();
      console.log('[diag] backtest hidden=' + document.getElementById('detail').classList.contains('hidden') +
        ' openGame=' + openGameId);
    }, 500);
    return;
  }
  if (v === 'pwdpanel') {
    switchView('settings');
    setTimeout(() => document.getElementById('btnPwdManage').click(), 300);
    return;
  }
  if (v === 'locktest') {
    state.settings.lockEnabled = true;
    showLock();
    const input = $('#lockInput');
    input.value = 'wrong';
    submitLock();
    const wrongMsg = $('#lockMsg').textContent;
    const keptValue = input.value === 'wrong';
    $('#lockEye').click();
    const revealed = input.type === 'text';
    $('#lockEye').click();
    const hiddenAgain = input.type === 'password';

    input.value = '0d000721';
    submitLock();
    const okUnlock = !locked;

    showLock();
    input.value = '';
    submitLock();
    const emptyMsg = $('#lockMsg').textContent;
    submitLock();
    submitLock();
    const tripleUnlock = !locked;

    showLock();
    for (let i = 0; i < 10; i++) { input.value = 'x' + i; submitLock(); }
    const hintVisible = !$('#lockHintBtn').classList.contains('hidden');
    $('#lockHintBtn').click();
    const hintText = $('#lockHints').textContent;

    console.log('[diag] locktest wrong="' + wrongMsg + '" kept=' + keptValue +
      ' eyeOn=' + revealed + ' eyeOff=' + hiddenAgain + ' correct=' + okUnlock +
      ' empty="' + emptyMsg + '" triple=' + tripleUnlock +
      ' hintBtn=' + hintVisible + ' hint="' + hintText + '"');
    return;
  }
  if (v === 'detailshot') {
    const g = state.games.find((x) => x.name.includes('饿殍')) || state.games[0];
    if (g) openDetail(g.id);
    return;
  }






















  if (v === 'shotgal') {
    (async () => {
      const r = await window.api.shotGames();
      shotsGameId = (r.games[0] || {}).gameId || null;
      switchView('shots');
    })();
    return;
  }
  if (v === 'lightbox') {
    (async () => {
      const r = await window.api.shotGames();
      const g = r.games[0];
      if (!g) return;
      const list = await window.api.shotList(g.gameId);
      switchView('shots');
      openLightboxGallery(list.items, 0, g.gameId, g.name);
    })();
    return;
  }
  if (v === 'toggle') {
    switchView('library');
    setTimeout(() => document.getElementById('btnLayout').click(), 300);
    return;
  }
  if (v === 'heroalt') {
    switchView('library');
    const list = stripGames();
    heroId = list[2] ? list[2].id : (list[0] && list[0].id);
    renderHero();
    return;
  }
  if (v === 'scrolled') {
    switchView('library');
    const c = document.getElementById('content');
    c.scrollTop = c.scrollHeight;
    const card = document.querySelector('.card');
    const top = document.querySelector('.topbar');
    console.log('[diag] scrollTop=' + c.scrollTop + ' contentTop=' + Math.round(c.getBoundingClientRect().top) +
      ' topbarBottom=' + Math.round(top.getBoundingClientRect().bottom) +
      ' firstCardTop=' + (card ? Math.round(card.getBoundingClientRect().top) : 'none') +
      ' winScroll=' + Math.round(window.scrollY) + ' overflow=' + getComputedStyle(c).overflowY);
    return;
  }
  switchView(v);
  if (v === 'detail') {
    const target = state.games.find((g) => g.coverUrl) || state.games[0];
    if (target) openDetail(target.id);
  }
};
