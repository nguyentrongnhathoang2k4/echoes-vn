/**
 * Script crop và build spritesheet sạch từ reference sheet JPG.
 * Layout nguồn (3 rows label + 3x3 frames):
 *   - Row 0 (Down/Front)
 *   - Row 1 (Up/Back)
 *   - Row 2 (Side/Right)
 *
 * Output: PNG spritesheet 3 cols × 3 rows, mỗi frame FRAME_W × FRAME_H px
 * Chạy: node scripts/build-sprites.mjs
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join('public', 'assets');
const FRAME_W = 64;   // kích thước frame output (px)
const FRAME_H = 80;

// ─── Cấu hình crop cho từng nhân vật ─────────────────────────────────────────
//   srcX/srcY: góc trên-trái của vùng chứa 3 frames (tính trên ảnh gốc)
//   srcW/srcH: kích thước toàn vùng 3 frames (sẽ chia 3 theo chiều ngang)
//
//   Phân tích ảnh AN (506×743):
//     - title + padding  → y≈0..130
//     - Row Down:  label y≈100..125, frames y≈125..355  (cao ≈230)
//     - Row Up:    label y≈355..390, frames y≈390..555  (cao ≈165)
//     - Row Right: label y≈555..590, frames y≈590..743  (cao ≈153)
//
//   Phân tích ảnh MIÊN (528×765):
//     - layout tương tự, cùng tỉ lệ
// ─────────────────────────────────────────────────────────────────────────────

const CONFIGS = [
  {
    src:      'C:/Users/HoangBuoito i/.gemini/antigravity/brain/2d99a402-4487-43da-b838-196f13b5c244/.user_uploaded/media_1792156185023_d2cfafef.jpg',
    out:      path.join(OUT_DIR, 'an_spritesheet.png'),
    label:    'AN',
    rows: [
      { y: 125, h: 225 },   // Down  (row 0)
      { y: 390, h: 162 },   // Up    (row 1)
      { y: 575, h: 163 },   // Right (row 2)
    ],
    xPad:  18,   // padding trái/phải bên trong mỗi ô lưới
    yPad:  10,   // padding trên/dưới bên trong mỗi ô
  },
  {
    src:      'C:/Users/HoangBuoito i/.gemini/antigravity/brain/2d99a402-4487-43da-b838-196f13b5c244/.user_uploaded/media_1792156184990_9e48ae2f.jpg',
    out:      path.join(OUT_DIR, 'mien_spritesheet.png'),
    label:    'MIÊN',
    rows: [
      { y: 130, h: 235 },   // Down
      { y: 405, h: 165 },   // Up
      { y: 590, h: 165 },   // Right
    ],
    xPad:  18,
    yPad:  10,
  },
];

async function buildSpritesheet(cfg) {
  const src = await loadImage(cfg.src);
  const srcW = src.width;

  const cellW = Math.floor(srcW / 3);   // chiều rộng mỗi ô lưới trong ảnh gốc

  // Canvas output: 3 cols × 3 rows
  const canvas = createCanvas(FRAME_W * 3, FRAME_H * 3);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let row = 0; row < 3; row++) {
    const { y: srcRowY, h: srcRowH } = cfg.rows[row];

    for (let col = 0; col < 3; col++) {
      const srcX = col * cellW + cfg.xPad;
      const srcY = srcRowY + cfg.yPad;
      const srcFrameW = cellW - cfg.xPad * 2;
      const srcFrameH = srcRowH - cfg.yPad * 2;

      const destX = col * FRAME_W;
      const destY = row * FRAME_H;

      // Crop frame từ nguồn → scale vào ô output
      ctx.drawImage(
        src,
        srcX, srcY, srcFrameW, srcFrameH,
        destX, destY, FRAME_W, FRAME_H
      );
    }
  }

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(cfg.out, buf);

  const KB = (buf.length / 1024).toFixed(1);
  console.log(`✅ [${cfg.label}] → ${cfg.out}  (${FRAME_W * 3}×${FRAME_H * 3}px, ${KB} KB)`);
}

for (const cfg of CONFIGS) {
  await buildSpritesheet(cfg);
}

console.log('\nDone! Spritesheet layout: 3 cols (frame 0-1-2) × 3 rows (down / up / right)');
