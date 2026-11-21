'use strict';

const fs = require('fs');

// Windows 实际会用到的尺寸，建全一点，省得系统拿 256 硬缩
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

/** 轻量锐化，让小尺寸不糊（源图不透明，忽略 alpha） */
function sharpen(nativeImage, img, amount) {
  const { width: w, height: h } = img.getSize();
  const src = img.toBitmap();
  const out = Buffer.from(src);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        const avg = (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]) / 4;
        const v = center + amount * (center - avg);
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return nativeImage.createFromBitmap(out, { width: w, height: h, scaleFactor: 1 });
}

function sharpenAmount(size) {
  if (size <= 24) return 0.45;
  if (size <= 48) return 0.35;
  if (size <= 64) return 0.25;
  if (size <= 128) return 0.12;
  return 0;
}

/** 把 nativeImage 转成多尺寸 ICO（内嵌 PNG），并顺带导出预览图 */
function buildIco(nativeImage, image, outPath, previewPrefix) {
  const pngs = SIZES.map((size) => {
    let scaled = image.resize({ width: size, height: size, quality: 'best' });
    const amount = sharpenAmount(size);
    if (amount > 0) scaled = sharpen(nativeImage, scaled, amount);
    return scaled.toPNG();
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(SIZES.length, 4);

  let offset = 6 + 16 * SIZES.length;
  const entries = [];
  SIZES.forEach((size, i) => {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    entries.push(entry);
  });

  fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...pngs]));

  if (previewPrefix) {
    const idx256 = SIZES.indexOf(256);
    const idx48 = SIZES.indexOf(48);
    const idx32 = SIZES.indexOf(32);
    fs.writeFileSync(previewPrefix + '-256.png', pngs[idx256]);
    fs.writeFileSync(previewPrefix + '-48.png', pngs[idx48]);
    fs.writeFileSync(previewPrefix + '-32.png', pngs[idx32]);
  }
  return SIZES.map((s, i) => s + ':' + pngs[i].length).join(' ');
}

/** 生成一张给界面用的头像 PNG（保持原图完整，不裁剪） */
function buildAvatar(image, outPath, size) {
  const png = image.resize({ width: size, height: size, quality: 'best' }).toPNG();
  fs.writeFileSync(outPath, png);
  return png.length;
}

module.exports = { buildIco, buildAvatar, SIZES };
