// Script tạo placeholder spritesheet 3x4 (3 frame x 4 hướng: down/left/right/up)
// Mỗi frame: 48x48px → ảnh output: 144x192px
// Chạy: node scripts/gen-sprites.mjs

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const FRAME_W = 48;
const FRAME_H = 48;
const COLS = 3;
const ROWS = 4; // down, left, right, up

const DIRECTIONS = ['↓', '←', '→', '↑'];

function generateSprite(filename, bodyColor, outlineColor) {
  const canvas = createCanvas(FRAME_W * COLS, FRAME_H * ROWS);
  const ctx = canvas.getContext('2d');

  for (let row = 0; row < ROWS; row++) {
    const dir = DIRECTIONS[row];
    for (let col = 0; col < COLS; col++) {
      const x = col * FRAME_W;
      const y = row * FRAME_H;

      // Nền trong suốt
      ctx.clearRect(x, y, FRAME_W, FRAME_H);

      // Thân (body)
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 14, y + 18, 20, 20);

      // Đầu
      ctx.fillStyle = outlineColor;
      ctx.fillRect(x + 16, y + 6, 16, 16);

      // Chân (nhấp nháy theo frame)
      const legOffset = col === 1 ? 0 : (col === 0 ? -3 : 3);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 14, y + 36, 8,  6 + legOffset);
      ctx.fillRect(x + 26, y + 36, 8,  6 - legOffset);

      // Hướng nhìn (mũi tên nhỏ)
      ctx.fillStyle = '#ffffff88';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dir, x + FRAME_W / 2, y + FRAME_H - 4);
    }
  }

  const outputPath = path.join('public', 'assets', filename);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`✅ Đã tạo: ${outputPath} (${FRAME_W * COLS}x${FRAME_H * ROWS}px)`);
}

generateSprite('an_spritesheet.png',   '#7c3aed', '#a78bfa'); // An: tím
generateSprite('mien_spritesheet.png', '#db2777', '#f9a8d4'); // Miên: hồng
