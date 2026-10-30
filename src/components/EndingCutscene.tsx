'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px, hash, block } from './pixel/pixelKit';
import { drawBenAnYenMorning, BEN_AN_YEN } from './SunsetStage';
import { drawSpriteFrame, getSpriteFrame } from './pixel/spriteKit';
import { tx } from '../locales/tx';

// =====================================================================
// CUTSCENE ENDING A — BÌNH MINH THẬT SỰ (~80 giây, bỏ qua được)
// 1. Màn hình đen, quạt máy chủ lịm dần
// 2. Phòng máy 312: Miên gỡ điện cực, đứng dậy, bước ra cửa đón bình minh
// 3. Thứ Bảy, bếp nhà mẹ An: hũ dưa cà, mâm cơm có một cái bát để trống
// 4. Bến An Yên thật buổi sáng: Miên đeo nhẫn, bồ câu bay lên, hộp nhạc chơi trọn bài
// 5. Đồng hồ 03:14 nhích sang 03:15
// Mọi thứ dùng lại chi tiết người chơi đã gặp — không thêm lời giải thích.
// =====================================================================

const W = 640;
const H = 360;
const SPRITE_W = 42;
const SPRITE_H = 63;
const ROW_DOWN = 0;
const ROW_UP = 1;
const ROW_SIDE = 2;
const FADE = 0.9;

interface Scene {
  id: 'black' | 'server' | 'kitchen' | 'river' | 'clock' | 'title';
  start: number;
  end: number;
}

const SCENES: Scene[] = [
  { id: 'black', start: 0, end: 5 },
  { id: 'server', start: 5, end: 19 },
  { id: 'kitchen', start: 19, end: 38 },
  { id: 'river', start: 38, end: 60 },
  { id: 'clock', start: 60, end: 72 },
  { id: 'title', start: 72, end: 80 },
];
const TOTAL = SCENES[SCENES.length - 1].end;

interface Caption { start: number; end: number; speaker?: string; text: string }
const CAPTIONS: Caption[] = [
  { start: 19 + 7.5, end: 19 + 14, speaker: 'Mẹ An', text: 'Con ăn đi, mẹ muối nhiều lắm.' },
];

const LETTERBOX = 30;
/** Tâm & độ đẩy máy của từng cảnh, kèm lớp tông màu nhẹ */
const CAMERA: Record<Scene['id'], { x: number; y: number; zoom: number; grade?: string }> = {
  black: { x: W / 2, y: H / 2, zoom: 0 },
  server: { x: 330, y: 215, zoom: 0.07, grade: 'rgba(30,40,70,0.08)' },
  kitchen: { x: 330, y: 240, zoom: 0.06, grade: 'rgba(255,190,120,0.06)' },
  river: { x: 360, y: 245, zoom: 0.08, grade: 'rgba(255,215,170,0.05)' },
  clock: { x: W / 2, y: H / 2, zoom: 0.05 },
  title: { x: W / 2, y: H / 2, zoom: 0 },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const sceneAt = (t: number) => SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];

/** Khung đen mờ dần ở đầu/cuối mỗi cảnh */
const fadeAlpha = (u: number, len: number) => Math.max(0, 1 - u / FADE, 1 - (len - u) / FADE);

/** Vẽ Miên bằng spritesheet; clipBottom: chỉ vẽ phần trên (ngồi sau bàn/ghế) */
function drawMien(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  frame: number,
  row: number,
  flip: boolean,
  x: number,
  y: number,
  alpha = 1,
  clipBottom?: number,
) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (clipBottom !== undefined) {
    ctx.beginPath();
    ctx.rect(x - 4, y - 4, SPRITE_W + 8, clipBottom - y + 4);
    ctx.clip();
  }
  drawSpriteFrame(ctx, img, frame, row, flip, x, y, SPRITE_W, SPRITE_H);
  ctx.restore();
}

/** Bụi li ti lơ lửng trong một vệt nắng (đa giác), lấp lánh chậm */
function beamDust(ctx: CanvasRenderingContext2D, u: number, poly: Array<[number, number]>, count: number, alpha: number) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  ctx.save();
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const x = x0 + hash(i * 3.1) * w + Math.sin(u * 0.5 + i) * 6;
    const y = y0 + ((hash(i * 7.7) * h + u * (3 + hash(i) * 5)) % h);
    const tw = 0.5 + 0.5 * Math.sin(u * 1.7 + i * 2.3);
    ctx.fillStyle = `rgba(255,240,200,${alpha * tw})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.restore();
}

// =====================================================================
// CẢNH 1 — MÀN HÌNH TẮT
// =====================================================================
function drawBlack(ctx: CanvasRenderingContext2D, u: number) {
  px(ctx, 0, 0, W, H, '#000');
  // Hiệu ứng tắt CRT: vạch sáng co lại thành một chấm rồi tắt
  if (u < 1.4) {
    const k = u / 1.4;
    const lineW = lerp(W * 0.8, 4, ease(k * 1.6));
    const lineH = lerp(6, 2, k);
    ctx.globalAlpha = 1 - ease((k - 0.6) / 0.4);
    px(ctx, W / 2 - lineW / 2, H / 2 - lineH / 2, lineW, lineH, '#cffafe');
    ctx.globalAlpha = 1;
  }
}

// =====================================================================
// CẢNH 2 — PHÒNG MÁY 312 (NGOÀI ĐỜI)
// =====================================================================
export function drawServerRoom(ctx: CanvasRenderingContext2D, u: number, mien: HTMLImageElement | null) {
  const dawn = ease((u - 6) / 8); // Bình minh lọt qua cửa khi Miên mở cửa
  px(ctx, 0, 0, W, H, '#14171d');
  px(ctx, 0, 250, W, H - 250, '#0d0f14');
  for (let x = 0; x < W; x += 32) px(ctx, x, 250, 1, H - 250, '#151820');

  // Ô cửa sổ nhỏ trên cao: trời hửng sáng dần
  const sky = ctx.createLinearGradient(0, 40, 0, 90);
  sky.addColorStop(0, `rgb(${lerp(20, 120, u / 14)},${lerp(28, 140, u / 14)},${lerp(48, 190, u / 14)})`);
  sky.addColorStop(1, `rgb(${lerp(40, 250, u / 14)},${lerp(30, 200, u / 14)},${lerp(40, 160, u / 14)})`);
  px(ctx, 458, 38, 84, 54, '#2a2f38');
  ctx.fillStyle = sky;
  ctx.fillRect(462, 42, 76, 46);
  px(ctx, 499, 42, 2, 46, '#2a2f38');

  // Tủ rack: đèn LED tắt dần từng cái (máy chủ đã ngắt)
  const rack = (x: number) => {
    px(ctx, x, 70, 70, 180, '#0b0d12');
    px(ctx, x, 70, 70, 2, '#22262e');
    for (let r = 0; r < 14; r++) {
      px(ctx, x + 6, 80 + r * 12, 58, 8, '#151820');
      for (let l = 0; l < 3; l++) {
        const dieAt = hash(x + r * 7 + l) * 3;
        if (u < dieAt) px(ctx, x + 10 + l * 5, 83 + r * 12, 2, 2, l === 2 ? '#f59e0b' : '#22c55e');
      }
    }
  };
  rack(36);
  rack(560);

  // Cửa ra hành lang (mở hé từ giây thứ 9, ánh bình minh tràn vào sàn)
  const doorOpen = ease((u - 8.6) / 1.2);
  px(ctx, 136, 140, 64, 112, '#2b3038');
  if (doorOpen > 0) {
    const light = ctx.createLinearGradient(0, 142, 0, 250);
    light.addColorStop(0, `rgba(253,230,138,${0.85 * doorOpen})`);
    light.addColorStop(1, `rgba(251,191,36,${0.6 * doorOpen})`);
    ctx.fillStyle = light;
    ctx.fillRect(140, 144, 56, 106);
    ctx.fillStyle = `rgba(253,230,138,${0.22 * doorOpen})`;
    ctx.beginPath();
    ctx.moveTo(140, 250); ctx.lineTo(196, 250); ctx.lineTo(300, 360); ctx.lineTo(60, 360);
    ctx.fill();
    beamDust(ctx, u, [[140, 144], [196, 144], [300, 360], [60, 360]], 40, 0.7 * doorOpen);
  }
  px(ctx, 140, 144, 56 * (1 - doorOpen * 0.8), 106, '#1b1f26');

  // Bàn + màn hình đã tắt
  px(ctx, 250, 226, 170, 10, '#2a2f38');
  px(ctx, 258, 236, 6, 30, '#1f2329');
  px(ctx, 406, 236, 6, 30, '#1f2329');
  px(ctx, 296, 168, 78, 54, '#22262e');
  px(ctx, 300, 172, 70, 46, '#05070a');
  // Lớp phosphor còn ấm: ánh xanh lơ của căn phòng #314 mờ dần trên màn hình vừa tắt
  if (u < 3.2) {
    const k = 1 - u / 3.2;
    const g = ctx.createRadialGradient(335, 195, 2, 335, 195, 40);
    g.addColorStop(0, `rgba(103,232,249,${0.55 * k})`);
    g.addColorStop(1, 'rgba(103,232,249,0)');
    ctx.fillStyle = g;
    ctx.fillRect(300, 172, 70, 46);
    px(ctx, 333, 194, 4, 2, `rgba(207,250,254,${k})`);
  }
  px(ctx, 304, 176, 20, 2, 'rgba(255,255,255,0.08)');
  px(ctx, 330, 222, 10, 4, '#22262e');

  // Miên: ngồi quay lưng → đứng dậy → quay người → bước ra cửa
  const mx0 = 314;
  const standK = ease((u - 7) / 0.6);
  // Ghế: Miên đứng dậy thì ghế bị đẩy lùi ra sau một chút, và ở lại khi cô bước đi
  const chairPush = ease((u - 7) / 0.5) * 8;
  const drawChair = () => {
    const cx = 306 + chairPush * 0.5;
    const cy = 244 + chairPush;
    px(ctx, cx, cy, 58, 5, '#30353f');
    px(ctx, cx + 4, cy + 5, 50, 14, '#262a32');
    px(ctx, cx + 26, cy + 19, 6, 12, '#1f2329');
  };
  if (u >= 9.4) drawChair();
  if (u < 9.4) {
    const y = 198 - standK * 10;
    drawMien(ctx, mien, 1, u < 8.6 ? ROW_UP : ROW_DOWN, false, mx0, y, 1, u < 7 ? 248 : undefined);
    drawChair();
  } else {
    const walkK = (u - 9.4) / 3.6;
    const x = lerp(mx0, 146, walkK);
    const step = Math.floor((u - 9.4) / 0.16);
    const frame = [0, 1, 2, 1][step % 4];
    const alpha = 1 - ease((u - 12.2) / 1.2);
    drawMien(ctx, mien, frame, ROW_SIDE, true, x, 188, alpha);
  }
  // Ghế (che phần dưới người Miên lúc còn ngồi)


  // Hai miếng điện cực: từ thái dương Miên đặt xuống mặt bàn
  const pull = ease((u - 3.2) / 1.6);
  const e1 = { x: lerp(mx0 + 10, 380, pull), y: lerp(208, 222, pull) };
  const e2 = { x: lerp(mx0 + 31, 388, pull), y: lerp(208, 222, pull) };
  if (u < 9.4 || pull >= 1) {
    px(ctx, e1.x, e1.y, 3, 3, '#e5e7eb');
    px(ctx, e2.x, e2.y, 3, 3, '#e5e7eb');
    if (pull > 0 && pull < 1) {
      ctx.strokeStyle = 'rgba(148,163,184,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e1.x + 1, e1.y + 2); ctx.lineTo(372, 226);
      ctx.moveTo(e2.x + 1, e2.y + 2); ctx.lineTo(372, 226);
      ctx.stroke();
    }
  }
  // Ánh sáng đầu ngày phủ dần cả phòng
  ctx.fillStyle = `rgba(251,191,36,${0.08 * dawn})`;
  ctx.fillRect(0, 0, W, H);
}

// =====================================================================
// CẢNH 3 — BẾP NHÀ MẸ AN, SÁNG THỨ BẢY
// =====================================================================
// ---------- Nhân vật ngồi ăn: dùng đúng sprite trong game (vẽ 1:1, 64x96) ----------
const SEAT_W = 64;
const SEAT_H = 96;
/** Mép sau mặt bàn: che phần dưới người → trông như đang ngồi */
const TABLE_BACK_Y = 258;

let momSpriteCache: HTMLCanvasElement | null = null;

/**
 * Mẹ An dựng từ sprite mặt trước của An (cùng nét vẽ với game):
 * tóc đen → hoa râm + búi tóc, áo hoodie → áo bà ba nâu, dây rút → hàng khuy.
 */
function getMomSprite(an: HTMLImageElement | null): HTMLCanvasElement | null {
  if (momSpriteCache) return momSpriteCache;
  if (!an || !an.complete || an.naturalWidth === 0) return null;
  const c = document.createElement('canvas');
  c.width = SEAT_W;
  c.height = SEAT_H;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(an, SEAT_W, 0, SEAT_W, SEAT_H, 0, 0, SEAT_W, SEAT_H);
  let img: ImageData;
  try {
    img = g.getImageData(0, 0, SEAT_W, SEAT_H);
  } catch {
    return null;
  }
  const d = img.data;
  const set = (i: number, hex: string) => {
    d[i] = parseInt(hex.slice(1, 3), 16);
    d[i + 1] = parseInt(hex.slice(3, 5), 16);
    d[i + 2] = parseInt(hex.slice(5, 7), 16);
  };
  for (let y = 0; y < SEAT_H; y++) {
    for (let x = 0; x < SEAT_W; x++) {
      const i = (y * SEAT_W + x) * 4;
      if (d[i + 3] < 128) continue;
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      if (y < 44 && l < 75) {
        // Tóc hoa râm
        set(i, l < 28 ? '#374151' : l < 45 ? '#6b7280' : '#9ca3af');
      } else if (y >= 44 && y < 70 && (l < 75 || l > 200)) {
        // Áo bà ba nâu, dây rút thành khuy áo
        set(i, l > 200 ? '#e7d3b0' : l < 25 ? '#3f2412' : l < 40 ? '#5c3520' : '#7c4a2a');
      }
    }
  }
  g.putImageData(img, 0, 0);
  // Búi tóc trên đỉnh đầu
  const bun = [3, 5, 6, 6, 6, 5];
  bun.forEach((half, r) => {
    g.fillStyle = '#374151';
    g.fillRect(32 - half - 1, 6 + r, half * 2 + 2, 1);
    g.fillStyle = r < 2 ? '#d1d5db' : '#9ca3af';
    g.fillRect(32 - half, 6 + r, half * 2, 1);
  });
  momSpriteCache = c;
  return c;
}

/** Vẽ phần trên của nhân vật ngồi sau bàn (cắt tại mép bàn) */
function drawSeated(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sx: number, sy: number, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 2, y - 2, SEAT_W + 4, TABLE_BACK_Y - y + 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, SEAT_W, SEAT_H, Math.round(x), Math.round(y), SEAT_W, SEAT_H);
  ctx.restore();
}

/** Bàn thờ treo tường: ảnh An có dải băng đen, bát hương ba nén nhang, đĩa quả */
function drawAltar(ctx: CanvasRenderingContext2D, u: number, an: HTMLImageElement | null) {
  // Ánh đèn thờ đỏ ấm
  const glow = ctx.createRadialGradient(560, 100, 4, 560, 100, 80);
  glow.addColorStop(0, 'rgba(248,113,113,0.16)');
  glow.addColorStop(1, 'rgba(248,113,113,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(480, 20, 160, 160);
  // Khung ảnh
  px(ctx, 544, 66, 34, 42, '#2b1a10');
  px(ctx, 547, 69, 28, 36, '#d6d3d1');
  if (an && an.complete && an.naturalWidth > 0) {
    const f = getSpriteFrame(an, 1, 0, false, SPRITE_W, SPRITE_H);
    ctx.drawImage(f.src, f.sx + 7, f.sy + 2, 28, 34, 547, 70, 28, 34);
  }
  // Dải băng tang đen chéo góc ảnh
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.moveTo(544, 66); ctx.lineTo(556, 66); ctx.lineTo(544, 78);
  ctx.fill();
  // Mặt bàn thờ + khăn đỏ
  px(ctx, 504, 110, 112, 7, '#4a2a18');
  px(ctx, 504, 110, 112, 2, '#6b3f23');
  px(ctx, 508, 117, 104, 9, '#8b1d1d');
  // Đĩa quả
  px(ctx, 588, 106, 18, 3, '#e5e7eb');
  px(ctx, 590, 101, 5, 5, '#f59e0b');
  px(ctx, 596, 102, 5, 4, '#f97316');
  px(ctx, 600, 99, 4, 7, '#facc15');
  // Bát hương + ba nén nhang
  px(ctx, 516, 100, 16, 10, '#a16207');
  px(ctx, 516, 100, 16, 2, '#ca8a04');
  for (let i = 0; i < 3; i++) {
    const x = 519 + i * 5;
    px(ctx, x, 84 + (i % 2) * 2, 1, 16, '#b45309');
    px(ctx, x, 83 + (i % 2) * 2, 1, 2, Math.sin(u * 3 + i) > 0 ? '#f97316' : '#ef4444');
    // Khói nhang uốn lượn bay lên
    for (let j = 1; j < 14; j++) {
      const sx = x + Math.sin(u * 1.2 + j * 0.45 + i * 2) * j * 0.55;
      const sy = 82 - j * 4;
      ctx.fillStyle = `rgba(226,232,240,${0.32 * (1 - j / 14)})`;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 3);
    }
  }
}

function drawKitchen(ctx: CanvasRenderingContext2D, u: number, mien: HTMLImageElement | null, an: HTMLImageElement | null) {
  // Tường vôi vàng ấm + nắng sớm
  px(ctx, 0, 0, W, 250, '#5a4330');
  px(ctx, 0, 0, W, 6, '#3f2e20');
  const sky = ctx.createLinearGradient(0, 60, 0, 150);
  sky.addColorStop(0, '#bfe0f2');
  sky.addColorStop(1, '#fde9c8');
  px(ctx, 64, 56, 116, 98, '#3b2a1c');
  ctx.fillStyle = sky;
  ctx.fillRect(70, 62, 104, 86);
  for (let i = 0; i < 6; i++) px(ctx, 74 + i * 18, 62 + ((i * 13) % 20), 10, 6, '#7fa36a');
  px(ctx, 120, 62, 4, 86, '#3b2a1c');
  // Lịch treo + bàn thờ
  px(ctx, 400, 60, 40, 50, '#e7e5e4');
  px(ctx, 400, 60, 40, 10, '#b91c1c');
  drawAltar(ctx, u, an);

  // Chiếu trải sàn
  for (let y = 250; y < H; y += 4) px(ctx, 0, y, W, 2, y % 8 === 2 ? '#c9a86a' : '#b8955a');

  // Hũ dưa thuỷ tinh trên sàn, nắp mở để bên cạnh
  px(ctx, 92, 236, 38, 46, '#2a1a10');
  px(ctx, 94, 238, 34, 42, 'rgba(226,232,240,0.55)');
  for (let i = 0; i < 9; i++) px(ctx, 97 + (i % 3) * 10, 252 + Math.floor(i / 3) * 9, 8, 6, i % 2 ? '#c5b04a' : '#a8a23a');
  px(ctx, 94, 238, 34, 4, 'rgba(255,255,255,0.35)');
  px(ctx, 134, 272, 22, 6, '#7c8796');
  px(ctx, 134, 272, 22, 2, '#a3adbb');
  // Nồi cơm trên sàn cạnh bàn
  px(ctx, 520, 262, 46, 34, '#2a1a10');
  px(ctx, 522, 264, 42, 30, '#9ca3af');
  px(ctx, 522, 264, 42, 4, '#d1d5db');
  px(ctx, 518, 258, 50, 7, '#6b7280');
  px(ctx, 538, 252, 10, 6, '#4b5563');

  // ---- Mẹ (trái) và Miên (phải) ngồi sau bàn; chỗ của An ở giữa để trống ----
  const MX = 196;
  // Mẹ gật đầu hai lần lúc nói "Con ăn đi"
  const nod = (u > 7.6 && u < 8.1) || (u > 8.5 && u < 9) ? 2 : 0;
  const mom = getMomSprite(an);
  if (mom) drawSeated(ctx, mom, 0, 0, MX, 190 + nod);
  const NX = 380;
  if (mien && mien.complete && mien.naturalWidth > 0) {
    const f = getSpriteFrame(mien, 1, ROW_DOWN, false, SEAT_W, SEAT_H);
    // Miên khẽ cúi đầu khi nghe mẹ nói
    drawSeated(ctx, f.src, f.sx, f.sy, NX, 190 + (u > 9 && u < 11 ? 1 : 0));
  }

  // Bàn ăn gỗ thấp
  ctx.fillStyle = '#3d2614';
  ctx.beginPath();
  ctx.moveTo(158, 256); ctx.lineTo(482, 256); ctx.lineTo(514, 302); ctx.lineTo(126, 302);
  ctx.fill();
  ctx.fillStyle = '#8a5a34';
  ctx.beginPath();
  ctx.moveTo(161, 258); ctx.lineTo(479, 258); ctx.lineTo(509, 299); ctx.lineTo(131, 299);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const y = 263 + i * 6;
    const inset = (299 - y) * 0.72;
    px(ctx, 131 + inset + 10 + (i % 2) * 30, y, 270 - (i % 3) * 40, 1, '#7a4d2b');
  }
  px(ctx, 131, 298, 378, 2, '#a8703f');
  px(ctx, 126, 302, 388, 14, '#5c3a20');
  px(ctx, 126, 302, 388, 2, '#6f4527');
  px(ctx, 136, 316, 10, 16, '#4a2e18');
  px(ctx, 494, 316, 10, 16, '#4a2e18');

  // ---- Mâm cơm ----
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const bowl = (x: number, y: number, inner: string | null) => {
    ellipse(x, y + 4, 15, 6, '#2a1a10');
    px(ctx, x - 12, y, 24, 7, '#e5e7eb');
    px(ctx, x - 12, y + 5, 24, 2, '#cbd5e1');
    px(ctx, x - 5, y + 7, 10, 2, '#94a3b8');
    ellipse(x, y, 13, 4, '#f8fafc');
    if (inner) ellipse(x, y - 1, 11, 3, inner);
    else ellipse(x, y, 10, 2.5, '#d6dde6');
  };
  const chopsticks = (x: number, y: number, len = 30) => {
    px(ctx, x, y, len, 1, '#6b4426');
    px(ctx, x, y + 2, len, 1, '#6b4426');
  };

  // Chỗ của An: bát để trống, đôi đũa đặt ngay ngắn trên miệng bát
  bowl(320, 266, null);
  chopsticks(304, 264, 32);
  // Bát canh rau (giữa mẹ và chỗ của An)
  ellipse(272, 274, 20, 7, '#2a1a10');
  px(ctx, 254, 270, 36, 8, '#e5e7eb');
  ellipse(272, 270, 18, 5, '#f8fafc');
  ellipse(272, 269, 16, 4, '#d9e6b8');
  for (let i = 0; i < 5; i++) px(ctx, 262 + i * 5, 267 + (i % 2), 4, 2, '#4d7c0f');
  // Đĩa thịt kho trứng (giữa chỗ của An và Miên)
  ellipse(368, 274, 20, 7, '#2a1a10');
  ellipse(368, 272, 19, 6, '#f1f5f9');
  for (let i = 0; i < 4; i++) px(ctx, 355 + i * 7, 269 + (i % 2) * 2, 6, 5, i % 2 ? '#7c2d12' : '#9a3412');
  px(ctx, 358, 267, 7, 5, '#fef3c7');
  px(ctx, 360, 268, 3, 3, '#f59e0b');
  px(ctx, 373, 268, 7, 5, '#fef3c7');
  px(ctx, 375, 269, 3, 3, '#f59e0b');
  // Bát cà muối trắng + chén nước mắm phía mẹ
  bowl(184, 290, null);
  for (let i = 0; i < 5; i++) px(ctx, 176 + (i % 3) * 6, 286 + Math.floor(i / 3) * 3, 5, 4, '#f5f0d8');
  ellipse(456, 292, 8, 3, '#e5e7eb');
  ellipse(456, 291, 6, 2, '#b45309');

  // Đĩa dưa cải chua ở giữa, phía trước
  const plateX = 320;
  ellipse(plateX, 292, 24, 7, '#2a1a10');
  ellipse(plateX, 290, 23, 6, '#f8fafc');
  const pieces = u > 11.6 ? 7 : 8; // Miên gắp đi một miếng
  for (let i = 0; i < pieces; i++) {
    px(ctx, plateX - 16 + i * 4, 286 + ((i * 3) % 5), 5, 3, i % 3 === 0 ? '#d4c25a' : i % 3 === 1 ? '#b5a83c' : '#8f9a33');
  }

  // Bát cơm của mẹ trước mặt mẹ
  bowl(MX + 32, 284, '#fafaf9');
  chopsticks(MX + 14, 294, 30);

  // Bát cơm của Miên: miếng dưa bay từ đĩa sang bát (11.6 → 12.3), rồi Miên nâng bát lên ăn (13 → 15)
  const eat = u < 13 ? 0 : u < 13.8 ? ease((u - 13) / 0.8) : u < 15 ? 1 : 1 - ease((u - 15) / 0.8);
  const bowlN = { x: NX + 32, y: lerp(284, 250, eat) };
  bowl(bowlN.x, bowlN.y, '#fafaf9');
  if (u > 11.6 && u < 12.3) {
    const k = ease((u - 11.6) / 0.7);
    px(ctx, lerp(plateX + 12, bowlN.x - 2, k), lerp(286, bowlN.y - 4, k) - Math.sin(k * Math.PI) * 16, 5, 3, '#d4c25a');
  } else if (u >= 12.3) {
    px(ctx, bowlN.x - 3, bowlN.y - 3, 5, 3, '#d4c25a');
  }
  if (eat === 0) chopsticks(NX + 18, 294, 30);

  // Hơi nóng từ bát canh, nồi cơm và hai bát cơm
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  const steam: Array<[number, number]> = [[272, 262], [543, 250], [MX + 32, 278], [bowlN.x, bowlN.y - 6]];
  for (const [sx, sy] of steam) {
    for (let i = 0; i < 3; i++) {
      const k = (u * 0.55 + i / 3 + sx * 0.01) % 1;
      ctx.fillRect(Math.round(sx + Math.sin(k * 6 + i) * 4), Math.round(sy - k * 40), 2, 3);
    }
  }

  // Vệt nắng chéo từ cửa sổ phủ lên tất cả
  ctx.fillStyle = 'rgba(253,230,170,0.1)';
  ctx.beginPath();
  ctx.moveTo(70, 148); ctx.lineTo(174, 148); ctx.lineTo(340, 360); ctx.lineTo(150, 360);
  ctx.fill();
  beamDust(ctx, u, [[70, 148], [174, 148], [340, 360], [150, 360]], 45, 0.6);
}

// =====================================================================
// CẢNH 4 — BẾN AN YÊN THẬT, BUỔI SÁNG
// =====================================================================
// Ba cú máy: toàn cảnh (0–5s) → cận cảnh hộp nhẫn (5–11.5s) → trung cảnh quanh ghế đá (11.5s →)
const RIVER_WIDE_END = 5;
const RIVER_RING_END = 11.5;
// Khung cắt trên bản đồ Màn 2 (800x500)
const WIDE_CROP = { x: 80, y: 30 };          // 1:1
const MEDIUM_CROP = { x: 470, y: 170 };      // phóng 2x cho sắc nét

/** Cận cảnh: hộp nhẫn nhung mở nắp, chữ khắc "AN & MIÊN • BẾN AN YÊN", nhẫn được nhấc ra */
function drawRingCloseUp(ctx: CanvasRenderingContext2D, k: number) {
  // Nền: bến sông sáng sớm nhoè thành các đốm sáng
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#b7cde3');
  bg.addColorStop(0.55, '#e9d9c8');
  bg.addColorStop(1, '#a7a29c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const x = hash(i * 3) * W;
    const y = 40 + hash(i * 5) * 160;
    const r = 14 + hash(i) * 26;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, i % 3 === 0 ? 'rgba(216,180,254,0.35)' : 'rgba(255,248,230,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Lòng bàn tay đỡ hộp (khối da đơn giản, mép dưới khung hình)
  ctx.fillStyle = '#e9b99f';
  ctx.beginPath();
  ctx.ellipse(320, 330, 150, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9a386';
  ctx.beginPath();
  ctx.ellipse(320, 340, 140, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  const open = ease((k - 1.2) / 1.4);
  const boxX = 240;
  const boxY = 228;
  const boxW = 160;
  const boxH = 64;
  // Đáy hộp nhung xanh đen
  px(ctx, boxX - 2, boxY - 2, boxW + 4, boxH + 4, '#0b1220');
  px(ctx, boxX, boxY, boxW, boxH, '#1e2a44');
  px(ctx, boxX, boxY, boxW, 3, '#33415e');
  px(ctx, boxX, boxY + boxH - 4, boxW, 4, '#141c30');
  // Đệm nhung + khe cài nhẫn
  px(ctx, boxX + 10, boxY + 6, boxW - 20, 22, '#2b3a5c');
  px(ctx, boxX + 10, boxY + 16, boxW - 20, 3, '#141c30');

  // Nắp hộp mở lên (mặt trong lót lụa kem, có chữ khắc)
  const lidH = Math.round(86 * open);
  if (lidH > 2) {
    px(ctx, boxX - 2, boxY - lidH - 2, boxW + 4, lidH + 2, '#0b1220');
    px(ctx, boxX, boxY - lidH, boxW, lidH, '#f3ead8');
    px(ctx, boxX, boxY - lidH, boxW, 4, '#1e2a44');
    px(ctx, boxX + 6, boxY - lidH + 4, boxW - 12, lidH - 6, '#efe3cc');
    if (open > 0.7) {
      ctx.globalAlpha = (open - 0.7) / 0.3;
      ctx.fillStyle = '#9a8a6a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(tx('AN & MIÊN'), 320, boxY - lidH + 38);
      ctx.font = '11px monospace';
      ctx.fillText(tx('• BẾN AN YÊN •'), 320, boxY - lidH + 58);
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
  } else {
    // Nắp đang đóng
    px(ctx, boxX - 2, boxY - 14, boxW + 4, 16, '#0b1220');
    px(ctx, boxX, boxY - 12, boxW, 12, '#25324f');
    px(ctx, boxX, boxY - 12, boxW, 2, '#3b4a6b');
  }

  // Chiếc nhẫn bạc cài trong khe → được nhấc lên khỏi hộp (giây 5 → 6.3 của cú máy)
  if (open > 0.3) {
    const lift = ease((k - 5) / 1.3);
    const rx = 320;
    const ry = boxY + 12 - lift * 160;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(rx, ry, 17, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(rx, ry, 17, 13, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // Lấp lánh
    const tw = 0.5 + 0.5 * Math.sin(k * 5);
    ctx.fillStyle = `rgba(255,255,255,${0.6 + tw * 0.4})`;
    const sx = rx - 10;
    const sy = ry - 12;
    ctx.fillRect(sx - 6, sy, 13, 1);
    ctx.fillRect(sx, sy - 6, 1, 13);
    ctx.fillRect(sx - 2, sy - 2, 5, 5);
  }
}

/** Miên ngồi trên ghế đá Màn 2, cánh hoa rơi, bồ câu bay — vẽ trên bản đồ 800x500 */
function drawRiverWorld(w: CanvasRenderingContext2D, u: number, mien: HTMLImageElement | null) {
  drawBenAnYenMorning(w, u);
  const B = BEN_AN_YEN.bench;
  // Miên ngồi: phần dưới người khuất sau mặt ghế
  const glance = u > 15 && u < 17.2;
  const mx = B.x + 3;
  const my = B.y - 50;
  drawMien(w, mien, 1, glance ? ROW_SIDE : ROW_DOWN, glance, mx, my, 1, B.y + 4);
  block(w, B.x - 2, B.y + 2, 51, 9, '#a8a29e', '#d6d3d1', '#78716c');
  // Nhẫn đã đeo: lấp lánh ở bàn tay trái
  if (u >= RIVER_RING_END) {
    const hx = mx + 11;
    const hy = my + 42;
    px(w, hx, hy, 2, 2, '#f8fafc');
    if (Math.sin(u * 4) > 0.55) {
      px(w, hx, hy - 3, 1, 2, '#ffffff');
      px(w, hx, hy + 3, 1, 2, '#ffffff');
      px(w, hx - 3, hy, 2, 1, '#ffffff');
      px(w, hx + 3, hy, 2, 1, '#ffffff');
    }
  }
  // Cánh hoa tử đằng rơi chậm từ tán cây
  const T = BEN_AN_YEN.tree;
  for (let i = 0; i < 12; i++) {
    const k = (u * 0.18 + hash(i)) % 1;
    const x = T.x - 50 + hash(i * 3) * 90 - k * 60 + Math.sin(u * 1.5 + i) * 4;
    const y = T.y - 120 + k * 150;
    px(w, x, y, 2, 2, i % 2 ? '#d8b4fe' : '#f0abfc');
  }
  // Đàn bồ câu dưới chân ghế — ở Hoàng Hôn chúng đứng im; ở đây chúng bay đi thật
  for (let i = 0; i < 5; i++) {
    const bx = B.x - 60 + i * 10;
    const by = B.y + 30 + (i % 2) * 4;
    const fly = Math.max(0, u - 13 - i * 0.2);
    const x = bx - fly * (24 + i * 4);
    const y = by - fly * (30 + i * 5);
    if (y < -10) continue;
    const flap = fly > 0 && Math.floor(u * 10 + i) % 2 === 0;
    px(w, x, y, 7, 4, '#9ca3af');
    px(w, x - 2, y - 2, 3, 3, '#6b7280');
    px(w, x + 1, flap ? y - 3 : y + 1, 4, 2, '#e5e7eb');
  }
}

function drawRiver(ctx: CanvasRenderingContext2D, u: number, mien: HTMLImageElement | null, world: HTMLCanvasElement) {
  const w = world.getContext('2d');
  if (!w) return;
  if (u >= RIVER_WIDE_END && u < RIVER_RING_END) {
    drawRingCloseUp(ctx, u - RIVER_WIDE_END);
    return;
  }
  w.imageSmoothingEnabled = false;
  drawRiverWorld(w, u, mien);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (u < RIVER_WIDE_END) {
    ctx.drawImage(world, WIDE_CROP.x, WIDE_CROP.y, W, H, 0, 0, W, H);
  } else {
    ctx.drawImage(world, MEDIUM_CROP.x, MEDIUM_CROP.y, W / 2, H / 2, 0, 0, W, H);
  }
  ctx.restore();
}

// =====================================================================
// CẢNH 5 — ĐỒNG HỒ 03:14 → 03:15
// =====================================================================
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
};

function drawGlyphs(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, scale: number, color: string, colonOn: boolean) {
  const total = text.length * 6 * scale - scale;
  let x = cx - total / 2;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g && (ch !== ':' || colonOn)) {
      g.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') px(ctx, x + rx * scale, cy - 3.5 * scale + ry * scale, scale - 1, scale - 1, color);
      });
    }
    x += 6 * scale;
  }
}

function drawClockScene(ctx: CanvasRenderingContext2D, u: number) {
  px(ctx, 0, 0, W, H, '#07080b');
  const turned = u >= 4;
  const k = ease((u - 4) / 1.2);
  const color = turned
    ? `rgb(${Math.round(lerp(248, 253, k))},${Math.round(lerp(113, 230, k))},${Math.round(lerp(113, 138, k))})`
    : '#f87171';
  // Quầng sáng sau mặt số (ấm dần khi sang 03:15)
  const glow = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 220);
  glow.addColorStop(0, turned ? `rgba(253,230,138,${0.16 * k})` : 'rgba(248,113,113,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const colonOn = turned ? true : Math.floor(u * 1.6) % 2 === 0;
  drawGlyphs(ctx, turned ? '03:15' : '03:14', W / 2, H / 2, 12, color, colonOn);
}

// =====================================================================
// ÂM THANH
// =====================================================================

// Giai điệu hộp nhạc (Cmaj7 → Am7 → Dm7 → G7, nhịp 3/4) — chơi trọn bài, không lặp
const BEAT = 0.75;
const N: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5,
};
const MELODY: Array<[string, number]> = [
  ['E5', 2], ['G5', 1], ['A5', 2], ['E5', 1], ['F5', 2], ['A5', 1], ['G5', 3],
  ['E5', 2], ['G5', 1], ['C6', 2], ['B5', 1], ['A5', 2], ['F5', 1], ['G5', 3],
  ['A5', 2], ['G5', 1], ['E5', 2], ['C5', 1], ['D5', 2], ['F5', 1], ['E5', 2], ['D5', 1],
  ['E5', 2], ['G5', 1], ['A5', 2], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 3],
];
const BASS = ['C4', 'A4', 'D4', 'G4', 'C4', 'A4', 'D4', 'G4', 'C4', 'A4', 'D4', 'G4', 'C4', 'A4', 'G4', 'C4'];
const CHORD: Record<string, number[]> = {
  C4: [261.63, 329.63, 392.0],
  A4: [220.0, 261.63, 329.63],
  D4: [293.66, 349.23, 440.0],
  G4: [196.0, 246.94, 293.66],
};
const PAD_CHORDS = BASS.map((b) => CHORD[b]);
const MUSIC_START = 22;
const CHIME_AT = 64;

interface EndingCutsceneProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm từng cảnh) */
  startAt?: number;
}

export const EndingCutscene: React.FC<EndingCutsceneProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [titleOn, setTitleOn] = useState(false);
  const doneRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  // Âm lượng chỉ đọc lúc bắt đầu cutscene
  const volumeRef = useRef(volume);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // Lên lịch toàn bộ âm thanh một lần khi bắt đầu
  useEffect(() => {
    let ctx: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) ctx = new Ctx();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    audioRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {}); // Bị đóng trước khi resume xong (unmount sớm) thì bỏ qua
    const t0 = ctx.currentTime + 0.05;
    const master = ctx.createGain();
    master.gain.value = (volumeRef.current / 100) * 0.9;
    master.connect(ctx.destination);

    // Vang (reverb) dựng từ nhiễu tắt dần — cho tiếng hộp nhạc ấm và xa
    const reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    reverb.connect(wet).connect(master);

    // Tiếng chuông hộp nhạc: âm cơ bản + bồi âm hơi lệch, tắt nhanh
    const bell = (f: number, at: number, gain: number, dur = 1.8) => {
      if (!ctx) return;
      [[1, 1], [3.01, 0.18], [5.4, 0.06]].forEach(([mul, g]) => {
        const o = ctx!.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const env = ctx!.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(gain * g, at + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(env);
        env.connect(master);
        env.connect(reverb);
        o.start(at);
        o.stop(at + dur + 0.05);
      });
    };

    // Nền hợp âm mềm (pad) đỡ dưới giai điệu, mỗi ô nhịp một hợp âm
    const pad = (freqs: number[], at: number, dur: number) => {
      if (!ctx) return;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 1300;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.014, at + 0.8);
      env.gain.setValueAtTime(0.014, at + dur - 0.2);
      env.gain.linearRampToValueAtTime(0, at + dur + 1.2);
      lpf.connect(env);
      env.connect(master);
      env.connect(reverb);
      freqs.forEach((f) => {
        [-4, 4].forEach((cents) => {
          const o = ctx!.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = cents;
          o.connect(lpf);
          o.start(at);
          o.stop(at + dur + 1.3);
        });
      });
    };

    // Tiếng sóng vỗ nhẹ (nhiễu lọc trầm) ở bến sông
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    const water = ctx.createBufferSource();
    water.buffer = noiseBuf;
    water.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 520;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0, t0 + 38);
    wg.gain.linearRampToValueAtTime(0.03, t0 + 40);
    for (let i = 0; i < 8; i++) wg.gain.linearRampToValueAtTime(i % 2 ? 0.03 : 0.018, t0 + 41 + i * 2.2);
    wg.gain.linearRampToValueAtTime(0, t0 + 60);
    water.connect(wlp).connect(wg).connect(master);
    water.start(t0 + 38);
    water.stop(t0 + 60.5);

    // 1. Quạt máy chủ lịm dần
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const fanGain = ctx.createGain();
    fanGain.gain.setValueAtTime(0.07, t0);
    fanGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
    [55, 55.6].forEach((f) => {
      const o = ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(14, t0 + 3.6);
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 3.8);
    });
    lp.connect(fanGain).connect(master);

    // 3. Tiếng nắp hũ và đũa chạm bát trong bếp
    bell(1760, t0 + 19 + 2.7, 0.05, 0.4);
    bell(2093, t0 + 19 + 10.6, 0.06, 0.5);

    // Giai điệu hộp nhạc chơi trọn bài
    let beat = 0;
    for (const [note, len] of MELODY) {
      bell(N[note], t0 + MUSIC_START + beat * BEAT, 0.09, Math.max(1.4, len * BEAT * 1.4));
      beat += len;
    }
    BASS.forEach((note, bar) => {
      const at = t0 + MUSIC_START + bar * 3 * BEAT;
      bell(N[note] / 2, at, 0.05, 2.2);
      bell(N[note], at + BEAT, 0.025, 1.2);
      pad(PAD_CHORDS[bar], at, 3 * BEAT);
    });
    // Hợp âm cuối ngân dài
    const endAt = t0 + MUSIC_START + beat * BEAT;
    ['C4', 'E4', 'G4', 'C5'].forEach((n) => bell(N[n], endAt, 0.05, 4));

    // Chim hót: vài tiếng ngoài cửa sổ bếp, rồi rộn hơn ở bến sông
    const birdTimes = [19 + 4, 19 + 12.5, 19 + 16];
    for (let i = 0; i < 9; i++) birdTimes.push(39 + i * 2.2 + hash(i) * 1.2);
    for (let i = 0; i < birdTimes.length; i++) {
      const at = t0 + birdTimes[i];
      for (let c = 0; c < 3; c++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const s = at + c * 0.11;
        o.frequency.setValueAtTime(2600 + hash(i * 3 + c) * 900, s);
        o.frequency.exponentialRampToValueAtTime(3600 + hash(i + c) * 600, s + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.018, s + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
        o.connect(g).connect(master);
        o.start(s);
        o.stop(s + 0.09);
      }
    }

    // 5. Đồng hồ nhích sang 03:15: một tiếng chuông ấm
    ['C6', 'G5', 'E5'].forEach((n, i) => bell(N[n], t0 + CHIME_AT + i * 0.05, 0.07, 3));

    return () => {
      void ctx?.close();
      audioRef.current = null;
    };
  }, []);

  // Vòng lặp vẽ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mien = new Image();
    mien.src = '/assets/mien_spritesheet.png';
    const an = new Image();
    an.src = '/assets/an_spritesheet.png';
    // Mỗi cảnh vẽ ra canvas phụ rồi mới "quay" lên canvas chính (đẩy máy chậm)
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    // Bản đồ Bến An Yên (800x500, đúng toạ độ Màn 2) cho cảnh bến sông
    const world = document.createElement('canvas');
    world.width = BEN_AN_YEN.width;
    world.height = BEN_AN_YEN.height;

    let raf = 0;
    let lastCaption: Caption | null = null;
    let lastTitle = false;
    const start = performance.now() - startAt * 1000;
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      const sc = sceneAt(t);
      const u = t - sc.start;
      const len = sc.end - sc.start;
      if (sc.id === 'black') drawBlack(g, u);
      else if (sc.id === 'server') drawServerRoom(g, u, mien);
      else if (sc.id === 'kitchen') drawKitchen(g, u, mien, an);
      else if (sc.id === 'river') drawRiver(g, u, mien, world);
      else if (sc.id === 'clock') drawClockScene(g, u);
      else px(g, 0, 0, W, H, '#000');

      // Máy quay đẩy chậm vào tâm cảnh
      const cam = CAMERA[sc.id];
      const z = 1 + cam.zoom * ease(u / len);
      px(ctx, 0, 0, W, H, '#000');
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(cam.x, cam.y);
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);
      ctx.drawImage(off, 0, 0);
      ctx.restore();

      // Tông màu từng cảnh + viền tối điện ảnh
      if (cam.grade) {
        ctx.fillStyle = cam.grade;
        ctx.fillRect(0, 0, W, H);
      }
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      if (sc.id !== 'black' && sc.id !== 'title') {
        ctx.globalAlpha = Math.min(1, fadeAlpha(u, len));
        px(ctx, 0, 0, W, H, '#000');
        ctx.globalAlpha = 1;
      }

      // Dải đen điện ảnh trên/dưới: kéo vào lúc mở đầu, rút ra ở màn tên game
      const bars = LETTERBOX * (sc.id === 'title' ? 1 - ease(u / 1.5) : ease(t / 1.5));
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');

      const cap = CAPTIONS.find((c) => t >= c.start && t < c.end) ?? null;
      if (cap !== lastCaption) {
        lastCaption = cap;
        setCaption(cap);
      }
      const title = sc.id === 'title';
      if (title !== lastTitle) {
        lastTitle = title;
        setTitleOn(title);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finish, startAt]);

  // Esc / Enter để bỏ qua
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
      <style>{'@keyframes outro-fade { from { opacity: 0 } to { opacity: 1 } }'}</style>
      <div className="relative w-full aspect-video max-h-full" style={{ maxWidth: 'calc(100vh * 16 / 9)' }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {caption && (
        <div key={caption.text} className="absolute bottom-[3%] left-1/2 -translate-x-1/2 text-center px-5 py-1" style={{ animation: 'outro-fade 0.8s ease-out' }}>
          <div className="text-lg sm:text-xl text-amber-50 italic font-serif drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">&ldquo;{tx(caption.text)}&rdquo;</div>
        </div>
      )}

      {titleOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: 'outro-fade 2s ease-out' }}>
          <div className="text-2xl sm:text-4xl tracking-[0.3em] text-zinc-100 font-mono">ECHOES: 03:14 AM</div>
          <div className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-amber-200/70 font-mono">{tx('ENDING A • BÌNH MINH THẬT SỰ')}</div>
        </div>
      )}
      </div>

      <button
        onClick={finish}
        className="absolute bottom-4 right-4 px-3 py-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-500 rounded transition-colors"
      >
        {tx('BỎ QUA ▸▸')}
      </button>
    </div>
  );
};
