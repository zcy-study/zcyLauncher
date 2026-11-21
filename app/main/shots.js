'use strict';

/**
 * 截图存储：每个游戏启动文件同目录下的「我的截图」文件夹
 *   <游戏目录>/我的截图/20261120-205312.png
 *   <游戏目录>/我的截图/index.json   ← 索引（按游戏、时间记录）
 */

const fs = require('fs');
const path = require('path');

const FOLDER = '我的截图';
const INDEX = 'index.json';

function gameDir(game) {
  return game.workDir || path.dirname(game.exePath);
}

function shotsDir(game) {
  return path.join(gameDir(game), FOLDER);
}

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function stamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readIndex(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, INDEX), 'utf8'));
    return { version: 1, items: Array.isArray(raw.items) ? raw.items : [] };
  } catch (_) {
    return { version: 1, items: [] };
  }
}

function writeIndex(dir, index) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, INDEX), JSON.stringify(index, null, 2), 'utf8');
  } catch (_) { /* 写不了就算了，扫描时会 fallback */ }
}

function timeFromName(name) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/** 保存一张截图，返回 { file, path, time, dir } */
function save(game, sourceFile, when) {
  const ts = when || Date.now();
  const dir = shotsDir(game);
  fs.mkdirSync(dir, { recursive: true });

  let name = stamp(ts) + '.png';
  let i = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = stamp(ts) + '-' + ++i + '.png';
  }
  const target = path.join(dir, name);
  fs.copyFileSync(sourceFile, target);

  const index = readIndex(dir);
  index.game = { id: game.id, name: game.name };
  index.items.push({ file: name, time: ts });
  writeIndex(dir, index);

  return { file: name, path: target, dir, time: ts };
}

/** 列出某个游戏的全部截图（索引 + 目录扫描合并），按时间倒序 */
function list(game) {
  const dir = shotsDir(game);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f));
  } catch (_) {
    return { dir, items: [] };
  }

  const index = readIndex(dir);
  const meta = new Map((index.items || []).map((it) => [it.file, it]));

  const items = files
    .map((file) => {
      const full = path.join(dir, file);
      let st = null;
      try { st = fs.statSync(full); } catch (_) { return null; }
      const known = meta.get(file);
      const time = (known && known.time) || timeFromName(file) || st.mtimeMs;
      return { file, path: full, time, size: st.size };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time);

  return { dir, items };
}

/** 扫描整个库，返回有截图的游戏 */
function scanAll(games) {
  const out = [];
  for (const game of games) {
    const res = list(game);
    if (!res.items.length) continue;
    out.push({
      gameId: game.id,
      name: game.name,
      dir: res.dir,
      count: res.items.length,
      latest: res.items[0].time,
      earliest: res.items[res.items.length - 1].time,
      cover: game.cover
    });
  }
  return out.sort((a, b) => b.latest - a.latest);
}

/** 删除一张 */
function remove(game, file) {
  const dir = shotsDir(game);
  const safe = path.basename(file);
  const full = path.join(dir, safe);
  if (!full.startsWith(dir)) return false;
  try { fs.unlinkSync(full); } catch (_) { return false; }
  const index = readIndex(dir);
  index.items = (index.items || []).filter((it) => it.file !== safe);
  writeIndex(dir, index);
  return true;
}

module.exports = { FOLDER, shotsDir, save, list, scanAll, remove };
