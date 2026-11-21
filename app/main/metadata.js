'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'zcyGalLauncher/1.0 (local app)';

function timeout(ms) {
  return AbortSignal.timeout(ms);
}

async function withRetry(fn, times) {
  let last;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw last;
}

async function searchVndb(query) {
  const cleaned = String(query).replace(/[!?！？。、，,~～★☆·]/g, ' ').replace(/\s{2,}/g, ' ').trim() || query;
  const body = {
    filters: ['search', '=', cleaned],
    fields: 'id,title,titles{title,lang,main},image{url,sexual},released,developers.name,rating,votecount,length',
    results: 8,
    sort: 'searchrank'
  };
  const res = await withRetry(() => fetch('https://api.vndb.org/kana/vn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
    signal: timeout(35000)
  }), 2);
  if (!res.ok) throw new Error('VNDB 返回 HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).map((r) => {
    const titles = r.titles || [];
    const ja = titles.find((t) => t.lang === 'ja' && t.main) || titles.find((t) => t.lang === 'ja');
    const zh = titles.find((t) => t.lang === 'zh-Hans') || titles.find((t) => t.lang === 'zh-Hant');
    return {
      source: 'vndb',
      id: r.id,
      title: r.title,
      original: (ja && ja.title) || (r.titles && r.titles[0] && r.titles[0].title) || '',
      titleZh: (zh && zh.title) || '',
      image: (r.image && r.image.url) || null,
      sexual: (r.image && typeof r.image.sexual === 'number') ? r.image.sexual : 0,
      released: r.released || '',
      developer: (r.developers || []).map((d) => d.name).join(' / '),
      rating: r.rating || null,
      votecount: r.votecount || 0
    };
  });
}

function extFromType(type, url) {
  const t = (type || '').toLowerCase();
  if (t.includes('png')) return '.png';
  if (t.includes('webp')) return '.webp';
  if (t.includes('gif')) return '.gif';
  if (t.includes('jpeg') || t.includes('jpg')) return '.jpg';
  const m = /\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i.exec(url || '');
  return m ? '.' + m[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
}

/** 下载封面并返回相对于 covers 目录的文件名 */
async function downloadCover(store, gameId, url) {
  if (!url) throw new Error('没有可下载的封面地址');
  const res = await withRetry(() => fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://vndb.org/' },
    signal: timeout(60000)
  }), 2);
  if (!res.ok) throw new Error('封面下载失败 HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 512) throw new Error('封面文件异常（过小）');
  const ext = extFromType(res.headers.get('content-type'), url);

  for (const old of fs.readdirSync(store.coverDir)) {
    if (old.startsWith(gameId + '.')) {
      try { fs.unlinkSync(path.join(store.coverDir, old)); } catch (_) { /* ignore */ }
    }
  }
  const fileName = gameId + ext;
  fs.writeFileSync(path.join(store.coverDir, fileName), buf);
  return fileName;
}

async function copyLocalCover(store, gameId, srcPath) {
  const ext = (path.extname(srcPath) || '.jpg').toLowerCase();
  for (const old of fs.readdirSync(store.coverDir)) {
    if (old.startsWith(gameId + '.')) {
      try { fs.unlinkSync(path.join(store.coverDir, old)); } catch (_) { /* ignore */ }
    }
  }
  const fileName = gameId + ext;
  fs.copyFileSync(srcPath, path.join(store.coverDir, fileName));
  return fileName;
}

module.exports = { searchVndb, downloadCover, copyLocalCover };
