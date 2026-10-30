'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px, hash, block } from './pixel/pixelKit';
import { drawSpriteFrame } from './pixel/spriteKit';
import { drawRoom314Ending, ROOM_314 } from './OverworldStage';
import { drawBenAnYenMorning, drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { drawServerRoom } from './EndingCutscene';
import { tx } from '../locales/tx';

// =====================================================================
// CUTSCENE ENDING S — NGƯỜI LẠ (~66 giây, bỏ qua được)
// Bản soi ngược của Ending A: không còn ai nhớ ai.
// 1. Phòng 314: từng đồ vật gắn với Miên tan thành điểm ảnh; An quay nhìn chỗ trống,
//    không hiểu mình vừa mất gì. Hộp nhạc rụng dần từng nốt.
// 2. Tấm Polaroid: nửa ảnh có Miên tan đi, chữ "cùng em" mờ mất. "Tạch" — cầu dao sập.
// 3. Phòng máy 312: Miên gỡ điện cực, đặt lên bàn, bước ra. Không khóc.
// 4. Bến An Yên buổi sáng: Miên ngồi một mình. Một chàng trai đi ngang, gật đầu
//    lịch sự kiểu người lạ, rồi đi tiếp. Miên nhìn theo.
// 5. Đồng hồ 03:14 rụng từng chữ số thành --:--
// =====================================================================

const W = 640;
const H = 360;
const LETTERBOX = 30;
const FADE = 0.9;
const SPRITE_W = 42;
const SPRITE_H = 63;
const CELL_W = 64;
const CELL_H = 96;
const ROW_DOWN = 0;
const ROW_UP = 1;
const ROW_SIDE = 2;

interface Scene {
  id: 'erase' | 'polaroid' | 'server' | 'river' | 'clock' | 'title';
  start: number;
  end: number;
}

const SCENES: Scene[] = [
  { id: 'erase', start: 0, end: 19 },
  { id: 'polaroid', start: 19, end: 28 },
  { id: 'server', start: 28, end: 39 },
  { id: 'river', start: 39, end: 55 },
  { id: 'clock', start: 55, end: 60 },
  { id: 'title', start: 60, end: 66 },
];
const TOTAL = SCENES[SCENES.length - 1].end;

// ---- Cảnh 1: thời điểm từng đồ vật bị xoá (giây trong cảnh) ----
type Look = 'up' | 'left' | 'right' | 'down';
const ERASE_LEN = 1.6;
const HOLO_AT = 16.5;
const HOLO = { x: 400, y: 178 };
const ROOM_CROP_Y = 12;
const ROOM_FOCUS = { x: 300, y: 140 };

// ---- Cảnh 2: Polaroid ----
const POLAROID_MIEN_AT = 2.2;   // Miên bắt đầu tan
const POLAROID_MIEN_LEN = 2.6;
const POLAROID_CAPTION_AT = 5.2; // chữ "cùng em" mờ đi
const BREAKER_AT = 7.5;          // "Tạch": cầu dao sập, cắt ngay sang đen

// ---- Cảnh 4: Bến An Yên ----
// Phóng 2x; hạ thấp khung để thấy trọn người lạ đi phía trước ghế
const RIVER_CROP = { x: 470, y: 205 };
const WALK_SPEED = 38;
const MAN_FEET_Y = 352;

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const sceneAt = (t: number) => SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];
const fadeAlpha = (u: number, len: number) => Math.max(0, 1 - u / FADE, 1 - (len - u) / FADE);
const ready = (img: HTMLImageElement | null): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

// =====================================================================
// HIỆU ỨNG TAN THÀNH ĐIỂM ẢNH
// =====================================================================
interface Prop { c: HTMLCanvasElement; d: ImageData | null }

function makeProp(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Prop {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    draw(g);
  }
  return { c, d: null };
}

/**
 * k = 0: còn nguyên; tăng dần → điểm ảnh bong ra từ trên xuống (có xáo trộn),
 * mỗi điểm bong ra bay lên thành bụi hồng rồi tắt. k ≥ 1.4: biến mất hẳn.
 */
function drawDissolve(ctx: CanvasRenderingContext2D, p: Prop, x: number, y: number, k: number, scale = 1) {
  const w = p.c.width;
  const h = p.c.height;
  if (k <= 0) {
    ctx.drawImage(p.c, 0, 0, w, h, Math.round(x), Math.round(y), w * scale, h * scale);
    return;
  }
  if (k >= 1.4) return;
  if (!p.d) {
    const g = p.c.getContext('2d');
    if (!g) return;
    try {
      p.d = g.getImageData(0, 0, w, h);
    } catch {
      return;
    }
  }
  const d = p.d.data;
  for (let py = 0; py < h; py++) {
    for (let pxl = 0; pxl < w; pxl++) {
      const i = (py * w + pxl) * 4;
      const a = d[i + 3];
      if (a < 20) continue;
      const order = 0.7 * hash(pxl * 13.1 + py * 7.7) + 0.3 * (1 - py / h);
      if (order >= k) {
        ctx.fillStyle = `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${a / 255})`;
        ctx.fillRect(Math.round(x + pxl * scale), Math.round(y + py * scale), scale, scale);
      } else {
        const age = (k - order) / 0.35;
        if (age >= 1) continue;
        const dx = Math.sin(age * 6 + pxl) * 2 * scale;
        const dy = -age * 16 * scale;
        ctx.fillStyle = age < 0.3 ? `rgba(255,240,250,${1 - age})` : `rgba(249,168,212,${(1 - age) * 0.9})`;
        ctx.fillRect(Math.round(x + pxl * scale + dx), Math.round(y + py * scale + dy), scale, scale);
      }
    }
  }
}

// =====================================================================
// ĐỒ VẬT CỦA MIÊN TRONG PHÒNG 314 (pixel art nhỏ)
// =====================================================================
interface RoomItem { id: string; at: number; x: number; y: number; look: Look; prop: Prop }

function buildRoomItems(): RoomItem[] {
  // Tấm thiệp tự làm, dán băng dính trên tường
  const card = makeProp(14, 12, (g) => {
    px(g, 0, 1, 14, 11, '#f5ecd8');
    px(g, 0, 11, 14, 1, '#c9bda1');
    px(g, 4, 0, 6, 3, 'rgba(250,250,240,0.75)');
    px(g, 4, 4, 2, 2, '#ec4899'); px(g, 7, 4, 2, 2, '#ec4899');
    px(g, 4, 5, 5, 2, '#ec4899'); px(g, 5, 7, 3, 1, '#ec4899'); px(g, 6, 8, 1, 1, '#ec4899');
    px(g, 1, 8, 2, 2, '#334155'); px(g, 11, 8, 2, 2, '#7c3aed');
  });
  // Khung ảnh hai đứa trên bàn
  const photo = makeProp(12, 15, (g) => {
    px(g, 0, 0, 12, 14, '#5b3a22');
    const sky = ['#6d28d9', '#a855f7', '#e879a6', '#f6a86b', '#fbbf77'];
    sky.forEach((c, i) => px(g, 1, 1 + i * 2, 10, 2, c));
    px(g, 1, 11, 10, 2, '#3b0764');
    px(g, 7, 6, 2, 2, '#fff1c1');
    px(g, 3, 8, 1, 4, '#1f2937'); px(g, 5, 8, 1, 4, '#7c2d12');
    px(g, 3, 14, 6, 1, '#3b2616');
  });
  // Chiếc ô trong suốt dựng cạnh thùng máy
  const umbrella = makeProp(10, 42, (g) => {
    px(g, 5, 0, 1, 4, '#cbd5e1');
    for (let y = 4; y < 30; y++) {
      const half = Math.min(4, 1 + Math.floor((y - 4) / 5));
      px(g, 5 - half, y, half * 2 + 1, 1, 'rgba(191,219,254,0.6)');
      px(g, 5 - half, y, 1, 1, 'rgba(224,242,254,0.9)');
    }
    px(g, 2, 16, 7, 2, '#f472b6');
    px(g, 5, 30, 1, 8, '#94a3b8');
    px(g, 5, 38, 1, 2, '#db2777'); px(g, 3, 40, 3, 1, '#db2777'); px(g, 2, 38, 1, 2, '#db2777');
  });
  // Hộp nhạc gỗ trên sàn
  const musicBox = makeProp(18, 12, (g) => {
    px(g, 0, 3, 16, 9, '#7a4e2d');
    px(g, 0, 0, 16, 3, '#5b3a22');
    px(g, 5, 1, 6, 1, '#f9a8d4');
    px(g, 1, 6, 14, 1, '#5b3a22');
    px(g, 0, 11, 16, 1, '#3b2616');
    px(g, 16, 6, 1, 3, '#d6d3d1'); px(g, 17, 5, 1, 2, '#d6d3d1');
  });
  return [
    { id: 'card', at: 3.0, x: 266, y: 50, look: 'left', prop: card },
    { id: 'photo', at: 6.5, x: 256, y: 100, look: 'left', prop: photo },
    { id: 'umbrella', at: 10.0, x: 366, y: 96, look: 'right', prop: umbrella },
    { id: 'musicBox', at: 13.5, x: 356, y: 163, look: 'right', prop: musicBox },
  ];
}

/** Hướng An nhìn: quay về phía đồ vật vừa biến mất, rồi quay lại màn hình; cuối cảnh quay ra nhìn thẳng */
function anLook(u: number, items: RoomItem[]): Look {
  for (const it of items) if (u >= it.at + 0.5 && u < it.at + 2.2) return it.look;
  if (u >= HOLO_AT + 0.4 && u < HOLO_AT + 1.5) return 'right';
  if (u >= HOLO_AT + 1.5) return 'down';
  return 'up';
}

/** Vệt sáng hồng chỗ Miên từng đứng (hologram ở Màn 1); tắt dần khi bị xoá */
function drawHoloSpot(ctx: CanvasRenderingContext2D, u: number) {
  const k = (u - HOLO_AT) / ERASE_LEN;
  const a = 1 - ease(k);
  if (a <= 0.01 && k > 1.6) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(HOLO.x, HOLO.y, 1, HOLO.x, HOLO.y, 22);
  g.addColorStop(0, `rgba(219,39,119,${0.35 * a})`);
  g.addColorStop(1, 'rgba(219,39,119,0)');
  ctx.fillStyle = g;
  ctx.fillRect(HOLO.x - 22, HOLO.y - 10, 44, 20);
  // Bụi sáng bốc lên: khi bị xoá thì tản ra rồi tắt
  for (let i = 0; i < 16; i++) {
    const life = (u * 0.35 + hash(i)) % 1;
    const spread = k > 0 ? 1 + k * 3 : 1;
    const x = HOLO.x + (hash(i * 3) - 0.5) * 22 * spread + Math.sin(u + i) * 2;
    const y = HOLO.y - life * 60 - (k > 0 ? k * 10 : 0);
    const al = (1 - life) * (k > 0 ? Math.max(0, 1 - k / 1.4) : 1) * 0.8;
    if (al <= 0.02) continue;
    ctx.fillStyle = `rgba(249,168,212,${al})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.restore();
}

// =====================================================================
// CẢNH 2 — TẤM POLAROID
// =====================================================================
const PW = 110;
const PH = 110;
const PHOTO_SKY_H = 38;      // dải trời + sông ở trên
const PHOTO_SKY_SRC_Y = 112; // lấy từ quanh đường chân trời của Màn 2

interface PolaroidParts { base: HTMLCanvasElement; mien: Prop; mienX: number; mienY: number }

/** Dựng ảnh hoàng hôn Bến An Yên: ghế đá nối dài, An ngồi bên phải; Miên là lớp riêng để tan */
function buildPolaroid(an: HTMLImageElement, mien: HTMLImageElement): PolaroidParts | null {
  const world = document.createElement('canvas');
  world.width = BEN_AN_YEN.width;
  world.height = BEN_AN_YEN.height;
  const wg = world.getContext('2d');
  if (!wg) return null;
  wg.imageSmoothingEnabled = false;
  drawBenAnYenSunset(wg, 2.4, { pigeons: false, bridge: false });
  const B = BEN_AN_YEN.bench;
  const x0 = B.x - 54;
  block(wg, x0, B.y - 10, 101, 8, '#a8a29e', '#d6d3d1', '#78716c');
  const seatTop = B.y + 2;
  wg.save();
  wg.beginPath();
  wg.rect(x0 + 48, B.y - 60, 50, seatTop - (B.y - 60));
  wg.clip();
  drawSpriteFrame(wg, an, 1, ROW_DOWN, false, x0 + 52, B.y - 50, SPRITE_W, SPRITE_H);
  wg.restore();
  block(wg, x0 - 2, B.y + 2, 105, 9, '#a8a29e', '#d6d3d1', '#78716c');
  block(wg, x0 + 5, B.y + 11, 8, 13, '#57534e', '#78716c', '#3f3a36');
  block(wg, x0 + 88, B.y + 11, 8, 13, '#57534e', '#78716c', '#3f3a36');

  const cropX = x0 - 5;
  // Phần dưới bắt đầu ngay trên đầu hai người; phần trên là trời hoàng hôn + mặt sông
  const cropY = B.y - 56 - PHOTO_SKY_H;
  const base = document.createElement('canvas');
  base.width = PW;
  base.height = PH;
  const bg = base.getContext('2d');
  if (!bg) return null;
  bg.imageSmoothingEnabled = false;
  bg.drawImage(world, cropX, PHOTO_SKY_SRC_Y, PW, PHOTO_SKY_H, 0, 0, PW, PHOTO_SKY_H);
  bg.drawImage(world, cropX, cropY + PHOTO_SKY_H, PW, PH - PHOTO_SKY_H, 0, PHOTO_SKY_H, PW, PH - PHOTO_SKY_H);
  // Lan can bờ sông chạy ngang chỗ ghép
  px(bg, 0, PHOTO_SKY_H, PW, 2, '#d6d3d1');
  px(bg, 0, PHOTO_SKY_H + 2, PW, 1, '#78716c');

  // Miên ngồi bên trái, cắt ngang mặt ghế (phần dưới khuất sau ghế)
  const mx = x0 + 6;
  const my = B.y - 50;
  const mh = seatTop - my;
  const mienProp = makeProp(SPRITE_W, mh, (g) => drawSpriteFrame(g, mien, 1, ROW_DOWN, false, 0, 0, SPRITE_W, SPRITE_H));
  return { base, mien: mienProp, mienX: mx - cropX, mienY: my - cropY };
}

function drawPolaroidScene(ctx: CanvasRenderingContext2D, u: number, parts: PolaroidParts | null, photo: HTMLCanvasElement, font: string) {
  // Mặt bàn gỗ dưới ánh đèn bàn
  px(ctx, 0, 0, W, H, '#1a120b');
  for (let y = 0; y < H; y += 18) px(ctx, 0, y, W, 1, '#120c07');
  const lamp = ctx.createRadialGradient(W / 2 + 40, 60, 10, W / 2, H / 2, 380);
  lamp.addColorStop(0, 'rgba(255,190,110,0.22)');
  lamp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, W, H);

  const paperX = W / 2 - 122;
  const paperY = 34;
  // Bóng đổ + giấy Polaroid
  px(ctx, paperX + 5, paperY + 6, 244, 286, 'rgba(0,0,0,0.45)');
  px(ctx, paperX, paperY, 244, 286, '#f2ece0');
  px(ctx, paperX + 11, paperY + 11, 222, 222, '#ddd5c6');

  if (parts) {
    const g = photo.getContext('2d');
    if (g) {
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, PW, PH);
      g.drawImage(parts.base, 0, 0);
      const k = ((u - POLAROID_MIEN_AT) / POLAROID_MIEN_LEN) * 1.4;
      drawDissolve(g, parts.mien, parts.mienX, parts.mienY, k);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(photo, 0, 0, PW, PH, paperX + 12, paperY + 12, PW * 2, PH * 2);
      ctx.restore();
    }
  }
  // Ảnh cũ: hơi bạc màu + loá đèn
  ctx.fillStyle = 'rgba(255,236,200,0.08)';
  ctx.fillRect(paperX + 12, paperY + 12, PW * 2, PH * 2);

  // Chữ viết tay: "cùng em" mờ đi, để lại khoảng trống
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  const parts3 = [tx('Bến An Yên '), tx('cùng em'), '... 17/05'];
  const widths = parts3.map((s) => ctx.measureText(s).width);
  let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  const y = paperY + 266;
  parts3.forEach((s, i) => {
    const a = i === 1 ? 1 - ease((u - POLAROID_CAPTION_AT) / 1.4) : 1;
    if (a > 0.01) {
      ctx.fillStyle = `rgba(63,58,51,${a})`;
      ctx.fillText(s, x, y);
    }
    x += widths[i];
  });
}

// =====================================================================
// CẢNH 4 — BẾN AN YÊN BUỔI SÁNG: NGƯỜI LẠ ĐI NGANG
// =====================================================================

/** Chàng trai lạ: dựng từ sprite của An, áo hoodie đổi sang áo khoác xanh rêu */
function buildStrangerSheet(an: HTMLImageElement): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = an.naturalWidth;
  c.height = an.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(an, 0, 0);
  let img: ImageData;
  try {
    img = g.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    const fy = y % CELL_H;
    if (fy < 44 || fy > 74) continue;
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3] < 128) continue;
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      if (l >= 75 && l <= 200) continue; // giữ da tay
      const hex = l > 200 ? '#d9d4c3' : l < 25 ? '#2f3a22' : l < 40 ? '#45532f' : '#5d6b3f';
      d[i] = parseInt(hex.slice(1, 3), 16);
      d[i + 1] = parseInt(hex.slice(3, 5), 16);
      d[i + 2] = parseInt(hex.slice(5, 7), 16);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawCell(ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, frame: number, row: number, flip: boolean, x: number, y: number) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const dx = Math.round(x);
  const dy = Math.round(y);
  if (flip) {
    ctx.translate(dx + SPRITE_W, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, frame * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, SPRITE_W, SPRITE_H);
  } else {
    ctx.drawImage(sheet, frame * CELL_W, row * CELL_H, CELL_W, CELL_H, dx, dy, SPRITE_W, SPRITE_H);
  }
  ctx.restore();
}

/** Vị trí & dáng của người lạ theo thời gian trong cảnh */
function strangerAt(u: number) {
  const enter = 3;
  const stopX = 632;
  const startX = 760;
  const stopU = enter + (startX - stopX) / WALK_SPEED;
  const goU = stopU + 1.35;
  if (u < enter) return null;
  if (u < stopU) return { x: startX - WALK_SPEED * (u - enter), walking: true, glance: false, nod: 0 };
  if (u < goU) {
    const nod = u - stopU > 0.45 && u - stopU < 0.8 ? 1 : 0;
    return { x: stopX, walking: false, glance: true, nod };
  }
  return { x: stopX - WALK_SPEED * (u - goU), walking: true, glance: false, nod: 0 };
}

function drawRiverWorld(w: CanvasRenderingContext2D, u: number, mien: HTMLImageElement | null, stranger: HTMLCanvasElement | null) {
  drawBenAnYenMorning(w, u);
  const B = BEN_AN_YEN.bench;
  const x0 = B.x - 54;
  // Lưng ghế đá nối dài: đủ chỗ cho hai người, nửa bên phải để trống
  block(w, x0, B.y - 10, 101, 8, '#a8a29e', '#d6d3d1', '#78716c');

  // Miên ngồi bên trái ghế; người lạ đi ngang thì cô nhìn theo, rồi quay hẳn sang trái nhìn anh ta đi xa
  const s = strangerAt(u);
  if (ready(mien)) {
    const mx = x0 + 6;
    const my = B.y - 50;
    const followLeft = s !== null && !s.glance && s.x < mx + 10;
    w.save();
    w.beginPath();
    w.rect(mx - 4, my - 4, SPRITE_W + 8, B.y + 2 - my + 4);
    w.clip();
    if (followLeft) drawSpriteFrame(w, mien, 1, ROW_SIDE, true, mx, my, SPRITE_W, SPRITE_H);
    else drawSpriteFrame(w, mien, 1, ROW_DOWN, false, mx, my, SPRITE_W, SPRITE_H);
    w.restore();
  }
  block(w, x0 - 2, B.y + 2, 105, 9, '#a8a29e', '#d6d3d1', '#78716c');
  block(w, x0 + 5, B.y + 11, 8, 13, '#57534e', '#78716c', '#3f3a36');
  block(w, x0 + 88, B.y + 11, 8, 13, '#57534e', '#78716c', '#3f3a36');

  // Người lạ đi trên lối dạo phía trước ghế (gần máy quay hơn): dừng trước chỗ trống,
  // quay lưng về phía ta để nhìn Miên, gật nhẹ, rồi đi tiếp
  if (s && stranger) {
    const frame = s.walking ? [0, 1, 2, 1][Math.floor(u / 0.16) % 4] : 1;
    const bob = s.walking && frame !== 1 ? 1 : 0;
    const top = MAN_FEET_Y - 58 + bob + s.nod;
    if (s.glance) drawCell(w, stranger, 1, ROW_UP, false, s.x, top);
    else drawCell(w, stranger, frame, ROW_SIDE, true, s.x, top);
  }

  // Cánh hoa tử đằng rơi chậm
  const T = BEN_AN_YEN.tree;
  for (let i = 0; i < 12; i++) {
    const k = (u * 0.18 + hash(i)) % 1;
    const x = T.x - 50 + hash(i * 3) * 90 - k * 60 + Math.sin(u * 1.5 + i) * 4;
    const y = T.y - 120 + k * 150;
    px(w, x, y, 2, 2, i % 2 ? '#d8b4fe' : '#f0abfc');
  }
}

// =====================================================================
// CẢNH 5 — ĐỒNG HỒ RỤNG SỐ
// =====================================================================
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
};

function drawClockScene(ctx: CanvasRenderingContext2D, u: number) {
  px(ctx, 0, 0, W, H, '#07080b');
  // Từng chữ số rụng thành vạch ngang, như máy vừa bị xoá trắng
  const digits = ['0', '3', ':', '1', '4'];
  const dropAt = [1.2, 1.7, -1, 2.2, 2.7];
  const text = digits.map((c, i) => (dropAt[i] >= 0 && u >= dropAt[i] ? '-' : c));
  const blank = u >= 2.7;
  const flicker = blank && hash(Math.floor(u * 8)) < 0.18;
  const color = blank ? '#a1a1aa' : '#f87171';
  const glow = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 220);
  glow.addColorStop(0, blank ? 'rgba(161,161,170,0.06)' : 'rgba(248,113,113,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  if (flicker) return;
  const scale = 12;
  const colonOn = Math.floor(u * 1.6) % 2 === 0;
  const total = text.length * 6 * scale - scale;
  let x = W / 2 - total / 2;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g && (ch !== ':' || colonOn)) {
      g.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') px(ctx, x + rx * scale, H / 2 - 3.5 * scale + ry * scale, scale - 1, scale - 1, color);
      });
    }
    x += 6 * scale;
  }
}

// =====================================================================
// ÂM THANH: hộp nhạc rụng dần từng nốt
// =====================================================================
const BEAT = 0.75;
const N: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5,
};
// Hai câu đầu của giai điệu hộp nhạc (giống Ending A), lặp lại
const MELODY: Array<[string, number]> = [
  ['E5', 2], ['G5', 1], ['A5', 2], ['E5', 1], ['F5', 2], ['A5', 1], ['G5', 3],
  ['E5', 2], ['G5', 1], ['C6', 2], ['B5', 1], ['A5', 2], ['F5', 1], ['G5', 3],
];
const BASS = ['C4', 'A4', 'D4', 'G4', 'C4', 'A4', 'D4', 'G4'];
const MUSIC_START = 0.6;
// Mỗi đồ vật bị xoá mang theo vài nốt; cuối cùng chỉ còn E5 lặp lại
const NOTE_GONE_AT: Record<string, number> = { C6: 3.0, B5: 3.0, A5: 6.5, F5: 10.0, G5: HOLO_AT };
const BASS_GONE_AT = 13.5;
const MUSIC_CUT = SCENES[1].start + BREAKER_AT;

interface EndingSCutsceneProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm từng cảnh) */
  startAt?: number;
}

export const EndingSCutscene: React.FC<EndingSCutsceneProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [titleOn, setTitleOn] = useState(false);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);
  const startAtRef = useRef(startAt);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh: lên lịch một lần =====
  useEffect(() => {
    let ctx: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) ctx = new Ctx();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {}); // Bị đóng trước khi resume xong (unmount sớm) thì bỏ qua
    const ac = ctx;
    const t0 = ac.currentTime + 0.05 - startAtRef.current;
    const live = (s: number) => t0 + s >= ac.currentTime;
    /** Mốc thời gian tuyệt đối, không âm (khi tua tới giữa cutscene) */
    const T = (s: number) => Math.max(ac.currentTime, t0 + s);
    const master = ac.createGain();
    master.gain.value = (volumeRef.current / 100) * 0.9;
    master.connect(ac.destination);

    const reverb = ac.createConvolver();
    const irLen = Math.floor(ac.sampleRate * 2.8);
    const ir = ac.createBuffer(2, irLen, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
    }
    reverb.buffer = ir;
    const wet = ac.createGain();
    wet.gain.value = 0.45;
    reverb.connect(wet).connect(master);

    const noiseLen = ac.sampleRate * 2;
    const noiseBuf = ac.createBuffer(1, noiseLen, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

    /** Tiếng chuông hộp nhạc; cutAt: tắt phụt (cầu dao sập) */
    const bell = (f: number, s: number, gain: number, dur: number, cutAt?: number) => {
      if (!live(s)) return;
      const at = t0 + s;
      [[1, 1], [3.01, 0.18], [5.4, 0.06]].forEach(([mul, g]) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const env = ac.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(gain * g, at + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        if (cutAt !== undefined && cutAt < s + dur) env.gain.setValueAtTime(0, Math.max(at, t0 + cutAt));
        o.connect(env);
        env.connect(master);
        env.connect(reverb);
        o.start(at);
        o.stop(at + dur + 0.05);
      });
    };

    // 1. Hộp nhạc: lặp hai câu nhạc, mỗi lần một đồ vật bị xoá thì mất vài nốt
    let beat = 0;
    while (MUSIC_START + beat * BEAT < MUSIC_CUT) {
      for (const [note, len] of MELODY) {
        const s = MUSIC_START + beat * BEAT;
        beat += len;
        if (s >= MUSIC_CUT) break;
        const gone = NOTE_GONE_AT[note];
        if (gone !== undefined && s >= gone) continue;
        bell(N[note], s, 0.085, Math.max(1.4, len * BEAT * 1.4), MUSIC_CUT);
      }
    }
    for (let bar = 0; MUSIC_START + bar * 3 * BEAT < BASS_GONE_AT; bar++) {
      const s = MUSIC_START + bar * 3 * BEAT;
      bell(N[BASS[bar % BASS.length]] / 2, s, 0.045, 2.2);
    }

    // Tiếng xoá dữ liệu: một nốt cao trượt xuống, mỗi đồ vật một lần
    const erase = (s: number) => {
      if (!live(s)) return;
      const at = t0 + s;
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(2200, at);
      o.frequency.exponentialRampToValueAtTime(520, at + 1.2);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.018, at + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
      o.connect(g);
      g.connect(master);
      g.connect(reverb);
      o.start(at);
      o.stop(at + 1.35);
    };
    [3.0, 6.5, 10.0, 13.5, HOLO_AT, SCENES[1].start + POLAROID_MIEN_AT].forEach(erase);

    // Tiếng mưa rất nhỏ ngoài phòng 314 (hết cảnh 1 thì tắt)
    if (live(0) || live(SCENES[0].end)) {
      const rain = ac.createBufferSource();
      rain.buffer = noiseBuf;
      rain.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.4;
      const rg = ac.createGain();
      const from = Math.max(ac.currentTime, t0);
      const tEnd = Math.max(from, t0 + SCENES[0].end);
      const tRamp = Math.max(from, tEnd - 1);
      rg.gain.setValueAtTime(0.03, from);
      rg.gain.setValueAtTime(0.03, tRamp);
      rg.gain.linearRampToValueAtTime(0, tEnd);
      rain.connect(bp).connect(rg).connect(master);
      rain.start(from);
      rain.stop(tEnd + 0.1);
    }

    // 2. "Tạch": cầu dao sập, mọi thứ im bặt
    if (live(MUSIC_CUT)) {
      const at = t0 + MUSIC_CUT;
      const click = ac.createBufferSource();
      click.buffer = noiseBuf;
      const cg = ac.createGain();
      cg.gain.setValueAtTime(0.4, at);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      click.connect(cg).connect(master);
      click.start(at);
      click.stop(at + 0.07);
      const thump = ac.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(90, at);
      thump.frequency.exponentialRampToValueAtTime(30, at + 0.25);
      const tg = ac.createGain();
      tg.gain.setValueAtTime(0.2, at);
      tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      thump.connect(tg).connect(master);
      thump.start(at);
      thump.stop(at + 0.32);
    }

    // 3. Phòng máy 312: tiếng ù rất nhỏ của đèn khẩn cấp
    const server = SCENES[2];
    if (live(server.end)) {
      const hum = ac.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 50;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 140;
      const hg = ac.createGain();
      const from = T(server.start);
      hg.gain.setValueAtTime(0, from);
      hg.gain.linearRampToValueAtTime(0.012, from + 1);
      hg.gain.setValueAtTime(0.012, Math.max(from + 1, t0 + server.end - 1));
      hg.gain.linearRampToValueAtTime(0, t0 + server.end);
      hum.connect(lp).connect(hg).connect(master);
      hum.start(from);
      hum.stop(t0 + server.end + 0.1);
    }

    // 4. Bến sông: sóng vỗ + chim, không có nhạc
    const river = SCENES[3];
    if (live(river.end)) {
      const water = ac.createBufferSource();
      water.buffer = noiseBuf;
      water.loop = true;
      const wlp = ac.createBiquadFilter();
      wlp.type = 'lowpass';
      wlp.frequency.value = 520;
      const wg = ac.createGain();
      const from = T(river.start);
      wg.gain.setValueAtTime(0, from);
      wg.gain.linearRampToValueAtTime(0.028, from + 1.5);
      wg.gain.setValueAtTime(0.028, Math.max(from + 1.5, t0 + river.end - 1.2));
      wg.gain.linearRampToValueAtTime(0, t0 + river.end);
      water.connect(wlp).connect(wg).connect(master);
      water.start(from);
      water.stop(t0 + river.end + 0.1);
      for (let i = 0; i < 6; i++) {
        const s = river.start + 1.5 + i * 2.4 + hash(i) * 1.1;
        if (!live(s)) continue;
        for (let c = 0; c < 3; c++) {
          const at = t0 + s + c * 0.11;
          const o = ac.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(2600 + hash(i * 3 + c) * 900, at);
          o.frequency.exponentialRampToValueAtTime(3600 + hash(i + c) * 600, at + 0.07);
          const g = ac.createGain();
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(0.014, at + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
          o.connect(g).connect(master);
          o.start(at);
          o.stop(at + 0.09);
        }
      }
    }

    // 5. Tên kết cục: một nốt E5 duy nhất (nốt cuối cùng còn sót lại của hộp nhạc)
    bell(N.E5, SCENES[5].start + 0.3, 0.06, 4);

    return () => {
      void ac.close();
    };
  }, []);

  // ===== Vòng lặp vẽ =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const an = new Image();
    an.src = '/assets/an_spritesheet.png';
    const mien = new Image();
    mien.src = '/assets/mien_spritesheet.png';

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;

    // Phòng 314 (640x480) + lớp ánh sáng
    const room = document.createElement('canvas');
    room.width = ROOM_314.width;
    room.height = ROOM_314.height;
    const r = room.getContext('2d');
    const light = document.createElement('canvas');
    light.width = ROOM_314.width;
    light.height = ROOM_314.height;
    const items = buildRoomItems();

    // Bản đồ Bến An Yên (800x500) cho cảnh bến sông
    const world = document.createElement('canvas');
    world.width = BEN_AN_YEN.width;
    world.height = BEN_AN_YEN.height;
    const w = world.getContext('2d');

    const photo = document.createElement('canvas');
    photo.width = PW;
    photo.height = PH;
    let polaroid: PolaroidParts | null = null;
    let stranger: HTMLCanvasElement | null = null;
    const fontFamily = getComputedStyle(document.body).getPropertyValue('--font-lora').trim() || 'Georgia';
    const captionFont = `italic 600 15px ${fontFamily}, Georgia, serif`;

    let raf = 0;
    let lastTitle = false;
    const start = performance.now() - startAtRef.current * 1000;
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      if (!polaroid && ready(an) && ready(mien)) polaroid = buildPolaroid(an, mien);
      if (!stranger && ready(an)) stranger = buildStrangerSheet(an);

      const sc = sceneAt(t);
      const u = t - sc.start;
      const len = sc.end - sc.start;
      let zoom = 0;
      let focus = { x: W / 2, y: H / 2 };
      let fades = true;

      if (sc.id === 'erase' && r) {
        r.imageSmoothingEnabled = false;
        drawRoom314Ending(r, light, u, { lamp: 1, crt: true, hall: 1, window: 1, around: 1 }, ready(an) ? an : null, {
          pose: { dir: anLook(u, items) },
          beforeLight: (rc) => {
            for (const it of items) drawDissolve(rc, it.prop, it.x, it.y, ((u - it.at) / ERASE_LEN) * 1.4);
          },
        });
        drawHoloSpot(r, u);
        g.drawImage(room, 0, ROOM_CROP_Y, W, H, 0, 0, W, H);
        zoom = 0.14;
        focus = { x: ROOM_FOCUS.x, y: ROOM_FOCUS.y - ROOM_CROP_Y };
      } else if (sc.id === 'polaroid') {
        if (u < BREAKER_AT) {
          drawPolaroidScene(g, u, polaroid, photo, captionFont);
          zoom = 0.08;
          focus = { x: W / 2, y: 150 };
        } else {
          px(g, 0, 0, W, H, '#000');
        }
        // Mở cảnh bằng fade, nhưng cầu dao sập thì cắt phụt sang đen (không fade)
        fades = false;
        if (u < FADE) {
          g.fillStyle = `rgba(0,0,0,${1 - u / FADE})`;
          g.fillRect(0, 0, W, H);
        }
      } else if (sc.id === 'server') {
        // Bỏ 2 giây đầu (màn hình còn ấm) — vào thẳng lúc Miên gỡ điện cực
        drawServerRoom(g, u + 2, ready(mien) ? mien : null);
        // Đèn khẩn cấp đỏ, căn phòng lạnh hơn Ending A
        g.fillStyle = 'rgba(10,14,30,0.18)';
        g.fillRect(0, 0, W, H);
        const pulse = Math.max(0, Math.sin(u * 3));
        g.fillStyle = `rgba(150,10,20,${0.05 + pulse * 0.05})`;
        g.fillRect(0, 0, W, H);
        px(g, 316, 18, 10, 5, '#7f1d1d');
        px(g, 317, 16, 8, 3, `rgba(239,68,68,${0.5 + pulse * 0.5})`);
        zoom = 0.06;
        focus = { x: 330, y: 215 };
      } else if (sc.id === 'river' && w) {
        w.imageSmoothingEnabled = false;
        drawRiverWorld(w, u, ready(mien) ? mien : null, stranger);
        g.drawImage(world, RIVER_CROP.x, RIVER_CROP.y, W / 2, H / 2, 0, 0, W, H);
        zoom = 0.07;
        focus = { x: 300, y: 200 };
      } else if (sc.id === 'clock') {
        drawClockScene(g, u);
        zoom = 0.04;
      } else {
        px(g, 0, 0, W, H, '#000');
        fades = false;
      }

      px(ctx, 0, 0, W, H, '#000');
      const z = 1 + zoom * ease(u / len);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(focus.x, focus.y);
      ctx.scale(z, z);
      ctx.translate(-focus.x, -focus.y);
      ctx.drawImage(off, 0, 0);
      ctx.restore();

      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      if (fades) {
        ctx.globalAlpha = Math.min(1, fadeAlpha(u, len));
        px(ctx, 0, 0, W, H, '#000');
        ctx.globalAlpha = 1;
      }

      const bars = LETTERBOX * (sc.id === 'title' ? 1 - ease(u / 1.5) : ease(t / 1.5));
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');

      const title = sc.id === 'title';
      if (title !== lastTitle) {
        lastTitle = title;
        setTitleOn(title);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

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
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
        {titleOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: 'outro-fade 2s ease-out' }}>
            <div className="text-2xl sm:text-4xl tracking-[0.3em] text-zinc-100 font-mono">ECHOES: 03:14 AM</div>
            <div className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-violet-200/70 font-mono">{tx('SECRET ENDING • NGƯỜI LẠ')}</div>
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
