"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DefibrillatorMinigame } from './minigames/DefibrillatorMinigame';
import {
  hash, px, block, dropShadow, outlinedText,
  drawWoodFloor, drawDormWalls, drawCalendar, drawPoster,
  buildPostLayer, drawTargetMarker, drawClock, drawHudSubtitle,
} from './pixel/pixelKit';
import { drawSpriteFrame, getSpriteFrame, stepWalk, stopWalk, bodyBob, mienFloat, drawSwayingFigure, drawHoloShadow, drawHoloDust } from './pixel/spriteKit';

interface InteractableObject {
  id: string;
  name: string;
  actionText: string;
  x: number;
  y: number;
  w: number;
  h: number;
  triggerNodeId: string;
  canRepeat?: boolean;
  checkedMonologue?: string;
}

interface PixelBleedStageProps {
  characterSprite: string;
  sanity: number;
  setSanity?: React.Dispatch<React.SetStateAction<number>>;
  onTrigger: (nodeId: string) => void;
  interactedIds?: string[];
  onMarkInteracted?: (id: string) => void;
  volume?: number;
}

type Direction = 'down' | 'left' | 'right' | 'up';

const DIR_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2, // Lật ngang (flip horizontal)
};

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

// Mặc định ổn định (tránh mảng mới mỗi lần render làm vòng đồng bộ prop chạy vô hạn)
const EMPTY_IDS: string[] = [];

export const CH3_CORE_ANOMALIES = [
  'ch3_bed',
  'ch3_chart',
  'ch3_monitor',
  'ch3_mirror',
  'ch3_window',
  'ch3_door',
  'ch3_bag',
];

// =====================================================================
// HẰNG SỐ BỐ CỤC CĂN PHÒNG (Glitch Dichotomy)
// Nửa trái: phòng trọ #314 (sàn gỗ, bàn học, quạt máy, poster cũ)
// Nửa phải: phòng cấp cứu ICU Bạch Mai (gạch men, giường, IV, máy sốc tim)
// Hai nửa bị khâu lại bằng một vết rách zig-zag chạy xéo qua phòng.
// =====================================================================

const ROOM = { left: 70, right: 570, top: 95, bottom: 435 } as const;
const INTERACT_RADIUS = 75;
const HITBOX_HALF_W = 14;
const REQUIRED_CLUES = 5;

// Kích thước vẽ sprite
const AN_DRAW_W = 42;
const AN_DRAW_H = 63;
// Miên dùng chung spritesheet 3x3 (64x96/frame) và kích thước vẽ như Màn 1
const MIEN_DRAW_W = 42;
const MIEN_DRAW_H = 63;
const MIEN_DIR_ROW = 0; // Hàng 0: đứng quay mặt xuống

// Gốc toạ độ các nguồn sáng / vật thể động
const WINDOW_RECT = { x: 345, y: 28, w: 70, h: 60 };
const SIREN_ORIGIN = { x: 380, y: 62 };
const DESK_LAMP = { x: 102, y: 104 };
const FLUORO = { x1: 440, x2: 548, y: 10 };
const MIEN_ANCHOR = { x: 299, y: 160 };  // Góc trên-trái sprite (tâm x ≈ 320, ngay trên vết rách)
const MIEN_FLOOR_Y = 224;                // Mặt sàn dưới chân Miên
const MIEN_EYES = [{ dx: 17, dy: 21 }, { dx: 25, dy: 21 }]; // Vị trí mắt trong frame 42x63
const IV_POLE = { x: 455, baseY: 205, topY: 138 };
const BED = { x: 430, y: 250, w: 126, h: 70 };
const CART = { x: 470, y: 100, w: 48, h: 50 };
const MIRROR = { x: 250, y: 45, w: 38, h: 42 };
const DOOR = { x: 35, y: 310, w: 40, h: 75 };
const BAG = { x: 130, y: 395, w: 32, h: 28 };
const DESK = { x: 90, y: 95, w: 110, h: 55 };
const FAN = { x: 223, y: 108 };

// Bảng màu pixel art
const PAL = {
  outline: '#0b0710',
  woodGap: '#1f120a',
  woodA: '#5b3a22',
  woodB: '#4e311c',
  woodC: '#67432a',
  woodHi: '#7d5534',
  tileA: '#a9bdb9',
  tileB: '#9fb3af',
  tileC: '#b4c6c2',
  tileGrout: '#55686a',
  wallDorm: '#4a3a2b',
  wallDormStripe: '#544231',
  wallIcu: '#78958f',
  wallIcuGrout: '#58706b',
  blood: '#7f0d12',
  bloodDark: '#4a060a',
  bloodHi: '#c2232b',
  neonPurple: '#c026d3',
  neonCrimson: '#e11d48',
  metal: '#8f9aa6',
  metalDark: '#56606b',
  metalHi: '#cfd6dd',
  sheet: '#e5ebee',
  sheetShade: '#b9c4ca',
} as const;

// Các đỉnh zig-zag của vết rách thực tại (từ trần xuống sàn, xéo dần sang trái)
const SEAM_POINTS: ReadonlyArray<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0, y = 0; y <= CANVAS_HEIGHT + 14; i++, y += 14) {
    const base = 356 - y * 0.2;
    const zig = (i % 2 === 0 ? -1 : 1) * (5 + hash(i) * 9);
    pts.push({ x: Math.round(base + zig), y: Math.min(y, CANVAS_HEIGHT) });
  }
  return pts;
})();

/** Hoành độ của vết rách tại tung độ y (nội suy tuyến tính giữa các đỉnh zig-zag) */
const seamXAt = (y: number) => {
  for (let i = 0; i < SEAM_POINTS.length - 1; i++) {
    const a = SEAM_POINTS[i];
    const b = SEAM_POINTS[i + 1];
    if (y >= a.y && y <= b.y) {
      const k = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * k;
    }
  }
  return SEAM_POINTS[SEAM_POINTS.length - 1].x;
};

/** Vẽ path của nửa ICU (bên phải vết rách) để dùng làm clip */
const traceIcuRegion = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.moveTo(SEAM_POINTS[0].x, 0);
  for (const pt of SEAM_POINTS) ctx.lineTo(pt.x, pt.y);
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.lineTo(CANVAS_WIDTH, 0);
  ctx.closePath();
};

// Danh sách điểm tương tác của Màn 3 (giữ nguyên id / triggerNodeId / lời thoại)
const INTERACTABLES: InteractableObject[] = [
  {
    id: 'ch3_bed',
    name: 'Giường Bệnh Cấp Cứu',
    actionText: '[E] Xem giường cấp cứu & Cọc truyền dịch [🩸]',
    ...BED,
    triggerNodeId: 'obj_ch3_bed',
    canRepeat: true,
    checkedMonologue: 'Chiếc nệm bọc drap Bạch Mai vấy máu... Bạn nhận ra đây chính là chiếc giường cấp cứu của mình.',
  },
  {
    id: 'ch3_chart',
    name: 'Bìa Bệnh Án Cấp Cứu Treo Đầu Giường',
    actionText: '[E] Xem Bệnh án Bạch Mai & Chẩn đoán 17/05 [📋]',
    x: 408,
    y: 260,
    w: 24,
    h: 32,
    triggerNodeId: 'obj_ch3_chart',
    canRepeat: true,
    checkedMonologue: 'Tờ bệnh án dập dấu đỏ Bạch Mai: "Trần Hoàng An - Hôn mê sâu Glasgow 3 điểm". Nét chữ nhòe nước mắt của Miên...',
  },
  {
    id: 'ch3_bag',
    name: 'Chiếc Balo Ướt Sũng Đêm 17/05',
    actionText: '[E] Lục tìm Balo bùn đất & Hộp nhẫn cầu hôn [🎒]',
    ...BAG,
    triggerNodeId: 'obj_ch3_bag',
    canRepeat: true,
    checkedMonologue: 'Chiếc hộp nhung đỏ chứa đôi nhẫn cưới bạc "AN & MIÊN • BẾN BÌNH AN". Lời hứa cầu hôn chưa kịp thực hiện...',
  },
  {
    id: 'ch3_monitor',
    name: 'Máy Đo Nhịp Tim & Sốc Điện 200J',
    actionText: '[E] Bật máy đo nhịp tim & Thao tác máy sốc tim [⚡]',
    ...CART,
    triggerNodeId: 'obj_ch3_monitor',
    canRepeat: true,
    checkedMonologue: 'Điện tim HR 38 BPM... Hai bản cực sốc điện 200 Jun vẫn đang nhấp nháy đèn cảnh báo.',
  },
  {
    id: 'ch3_mirror',
    name: 'Mảnh Gương Vỡ Của Thực Tại',
    actionText: '[E] Soi vào mảnh gương vỡ trên tường [🪞]',
    ...MIRROR,
    triggerNodeId: 'obj_ch3_mirror',
    canRepeat: true,
    checkedMonologue: 'Hình bóng phản chiếu trán quấn băng gạc loang máu, đầu cắm đầy dây truyền... Đây mới là diện mạo thật sự của bạn.',
  },
  {
    id: 'ch3_window',
    name: 'Cửa Sổ Vỡ Toác • Đèn Xe 115',
    actionText: '[E] Nhìn qua cửa sổ rực ánh đèn xe cấp cứu [🚨]',
    ...WINDOW_RECT,
    triggerNodeId: 'obj_ch3_window',
    canRepeat: true,
    checkedMonologue: 'Gió mưa thốc vào phòng cùng tiếng còi xe cấp cứu 115 đêm 17/05... Ký ức về vụ tai nạn hiện rõ.',
  },
  {
    id: 'ch3_door',
    name: 'Cửa Phòng #314 Bị Niêm Phong',
    actionText: '[E] Xem dải băng niêm phong trên cánh cửa [🚪]',
    ...DOOR,
    triggerNodeId: 'obj_ch3_door',
    canRepeat: true,
    checkedMonologue: 'Dải băng vàng đen niêm phong chặt cánh cửa. Tiếng bác sĩ và y tá chạy dồn dập phía ngoài.',
  },
  {
    id: 'ch3_pc',
    name: 'Màn Hình Máy Tính (C:/Memory_Dump/)',
    actionText: '[E] Xem màn hình máy tính đang nhấp nháy đỏ [💻]',
    ...DESK,
    triggerNodeId: 'obj_ch3_pc',
    canRepeat: true,
    checkedMonologue: 'Màn hình đỏ rực: thư mục C:/Memory_Dump/ đang bị khóa. Cần đối chất với Miên để mở toang sự thật.',
  },
  {
    id: 'ch3_mien',
    name: 'Bóng Hình Miên Rơi Lệ',
    actionText: '[E] ĐỐI CHẤT VỚI MIÊN VỀ ĐÊM 17/05 [CỐT TRUYỆN CHÍNH]',
    x: 298,
    y: 160,
    w: 45,
    h: 65,
    triggerNodeId: 'ch3_mien_bleed',
    canRepeat: true,
    checkedMonologue: 'Miên đang đứng lặng, giọt lệ điểm ảnh rơi xuống sàn nhà...',
  },
];

// Vật cản Solid Bounding Boxes (hằng số module → không tái tạo mỗi lần render)
const COLLIDERS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 0, y: 0, w: CANVAS_WIDTH, h: ROOM.top },                                   // Tường trên
  { x: 0, y: 0, w: ROOM.left, h: CANVAS_HEIGHT },                                  // Tường trái
  { x: ROOM.right, y: 0, w: CANVAS_WIDTH - ROOM.right, h: CANVAS_HEIGHT },         // Tường phải
  { x: 0, y: ROOM.bottom, w: CANVAS_WIDTH, h: CANVAS_HEIGHT - ROOM.bottom },       // Tường dưới
  { x: DESK.x, y: DESK.y, w: DESK.w, h: DESK.h },                                  // Bàn học + PC
  { x: 212, y: 128, w: 22, h: 24 },                                                // Quạt máy
  { x: CART.x, y: CART.y - 5, w: CART.w, h: CART.h + 5 },                          // Xe sốc tim
  { x: IV_POLE.x - 6, y: IV_POLE.baseY - 7, w: 12, h: 10 },                        // Chân cọc IV
  { x: BED.x, y: BED.y, w: BED.w + 2, h: BED.h + 2 },                              // Giường ICU
];

// Vũng nước / máu phản chiếu trên sàn
interface Puddle { x: number; y: number; rx: number; ry: number; kind: 'blood' | 'water' }
const PUDDLES: ReadonlyArray<Puddle> = [
  { x: 482, y: 222, rx: 52, ry: 14, kind: 'blood' }, // Vũng máu dưới cọc IV
  { x: 470, y: 362, rx: 46, ry: 13, kind: 'blood' }, // Máu nhỏ giọt từ drap giường
  { x: 380, y: 128, rx: 34, ry: 10, kind: 'water' }, // Nước mưa hắt qua cửa sổ vỡ
  { x: 147, y: 428, rx: 22, ry: 5, kind: 'water' },  // Nước rỉ từ balo ướt
];

// =====================================================================
// KIỂU DỮ LIỆU CHO VÒNG LẶP MÔ PHỎNG
// =====================================================================

interface PlayerState {
  x: number;
  y: number;
  speed: number;
  dir: Direction;
  isMoving: boolean;
  frame: number;
  animTimer: number;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }
interface Tear { x: number; y: number; vy: number }
interface Drip { x: number; y0: number; y: number; vy: number; floorY: number; ripple: number; maxRipple: number; color: string }

interface SimState {
  tears: Tear[];
  splashes: Particle[];
  sparks: Particle[];
  drips: Drip[];
  ivDropY: number;
  fluoro: { level: number; burst: number; off: number };
  lastBeat: number;
  tearTimer: number;
}

/** Trạng thái tổng hợp của một khung hình, truyền cho tất cả hàm vẽ */
interface FrameState {
  t: number;            // Thời gian tính bằng giây
  phase: 1 | 2 | 3;     // Cấp độ xâm thực
  glitch: number;       // 0..1 cường độ nhiễu (theo sanity + phase)
  clues: number;
  ready: boolean;       // Đủ manh mối để đối chất
  defibDone: boolean;
  bpm: number;
  interacted: ReadonlySet<string>;
  fluoro: number;       // 0..1 độ sáng đèn tuýp
  lamp: number;         // 0..1 độ sáng đèn bàn
  player: PlayerState;
  nearest: InteractableObject | null;
}

interface SpriteBank {
  an: HTMLImageElement | null;
  // Mỗi lớp là mảng 3 frame đứng (hàng 0 của spritesheet)
  mien: { ghost: HTMLCanvasElement[]; red: HTMLCanvasElement[]; cyan: HTMLCanvasElement[]; w: number; h: number } | null;
}

// =====================================================================
// LỚP NỀN TĨNH (dựng một lần vào offscreen canvas → drawImage mỗi frame)
// Phần phòng trọ (sàn gỗ, giấy dán tường, poster, lịch) dùng chung pixelKit với Màn 1
// =====================================================================

/** Sàn gạch men bệnh viện: ô 24px, ron xám, gạch nứt toác, vết ố */
function drawTileFloor(ctx: CanvasRenderingContext2D) {
  const size = 24;
  for (let y = ROOM.top, r = 0; y < CANVAS_HEIGHT; y += size, r++) {
    for (let x = 240, c = 0; x < CANVAS_WIDTH; x += size, c++) {
      const h = hash(r * 97 + c * 13);
      px(ctx, x, y, size, size, PAL.tileGrout);
      px(ctx, x + 1, y + 1, size - 2, size - 2, h < 0.33 ? PAL.tileA : h < 0.66 ? PAL.tileB : PAL.tileC);
      px(ctx, x + 1, y + 1, size - 2, 1, '#d3e0dd');
      px(ctx, x + 1, y + size - 2, size - 2, 1, '#8a9e9a');
      // Gạch nứt
      if (h > 0.72) {
        ctx.strokeStyle = 'rgba(40,50,52,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2 + h * 8, y + 1);
        ctx.lineTo(x + 10, y + 10 + h * 4);
        ctx.lineTo(x + 7, y + 16);
        ctx.lineTo(x + 14, y + size - 1);
        ctx.moveTo(x + 10, y + 10 + h * 4);
        ctx.lineTo(x + size - 2, y + 8);
        ctx.stroke();
      }
      // Vết ố vàng
      if (h < 0.12) px(ctx, x + 6, y + 8, 8, 5, 'rgba(120,110,60,0.25)');
    }
  }
  // Vệt máu kéo lê từ vết rách tới giường
  ctx.fillStyle = 'rgba(90,10,14,0.55)';
  for (let i = 0; i < 26; i++) {
    const k = i / 25;
    const bx = 340 + k * 95 + Math.sin(i * 1.7) * 4;
    const by = 300 - k * 20 + Math.cos(i * 2.3) * 3;
    ctx.fillRect(Math.round(bx), Math.round(by), 5 + Math.round(hash(i) * 4), 3);
  }
}

/** Tường trên + tường bao: giấy dán tường phòng trọ / gạch men ICU */
function drawWalls(ctx: CanvasRenderingContext2D, icu: boolean) {
  if (!icu) {
    // Giấy dán tường phòng trọ (y hệt Màn 1)
    drawDormWalls(ctx, ROOM, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  } else {
    // Gạch men xanh nhạt phòng hồi sức
    px(ctx, 0, 0, CANVAS_WIDTH, ROOM.top, PAL.wallIcuGrout);
    for (let y = 4, r = 0; y < ROOM.top - 8; y += 10, r++) {
      for (let x = (r % 2) * 6; x < CANVAS_WIDTH; x += 12) {
        const h = hash(x * 3 + r * 17);
        px(ctx, x + 1, y + 1, 10, 8, h > 0.85 ? '#86a39d' : PAL.wallIcu);
        px(ctx, x + 1, y + 1, 10, 1, '#94b0aa');
      }
    }
    // Gạch vỡ lộ xi măng
    for (let i = 0; i < 6; i++) {
      px(ctx, 420 + hash(i * 3) * 140, 36 + hash(i * 7) * 40, 9, 7, '#3d4a47');
    }
    px(ctx, 0, ROOM.top - 8, CANVAS_WIDTH, 8, '#4b5b58');
    px(ctx, 0, ROOM.top - 8, CANVAS_WIDTH, 1, '#a9bdb9');
    px(ctx, 0, 0, ROOM.left, CANVAS_HEIGHT, '#151d1c');
    px(ctx, ROOM.right, 0, CANVAS_WIDTH - ROOM.right, CANVAS_HEIGHT, '#151d1c');
    px(ctx, 0, ROOM.bottom, CANVAS_WIDTH, CANVAS_HEIGHT - ROOM.bottom, '#151d1c');
    px(ctx, ROOM.right, ROOM.top - 8, 3, ROOM.bottom - ROOM.top + 8, '#2f3d3b');
    px(ctx, 0, ROOM.bottom, CANVAS_WIDTH, 3, '#2f3d3b');
  }
  // Dải trần tối phía trên cùng
  px(ctx, 0, 0, CANVAS_WIDTH, 4, '#050307');
}

/** Đồ trang trí tĩnh trên tường và sàn của hai nửa phòng */
function drawStaticDecor(ctx: CanvasRenderingContext2D) {
  // --- PHÒNG TRỌ ---
  // Lịch 05/2024 khoanh ngày 17 + poster "Hà Nội mùa hạ" (cùng đồ vật với Màn 1)
  drawCalendar(ctx, 120, 26);
  drawPoster(ctx, 160, 16, PAL.wallDorm);

  // Chiếu cói + gối + chăn nhàu (nơi An "tỉnh dậy")
  block(ctx, 95, 215, 80, 86, '#b89a5e', '#d1b679', '#8f7543');
  for (let y = 218; y < 300; y += 3) px(ctx, 96, y, 78, 1, 'rgba(110,85,40,0.35)');
  block(ctx, 102, 220, 26, 14, '#d9d2c2', '#f1ebdc', '#a8a090');
  ctx.fillStyle = '#4d6a8a';
  ctx.beginPath();
  ctx.moveTo(98, 250); ctx.lineTo(170, 244); ctx.lineTo(172, 296); ctx.lineTo(112, 298); ctx.lineTo(100, 280);
  ctx.closePath();
  ctx.fill();
  px(ctx, 110, 258, 50, 2, '#3a5270');
  px(ctx, 120, 272, 40, 2, '#3a5270');

  // --- ICU ---
  // Biển khoa Hồi Sức Tích Cực
  block(ctx, 432, 22, 120, 12, '#e8f1f2', '#ffffff', '#a8b8ba');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#0369a1';
  ctx.fillText('BV BẠCH MAI • KHOA HSTC', 436, 31);
  // Hộp ổ khí y tế O2 / AIR / VAC
  block(ctx, 522, 44, 34, 22, '#d9e2e4', '#f4f8f9', '#a0adb0');
  px(ctx, 526, 50, 7, 7, '#16a34a');
  px(ctx, 536, 50, 7, 7, '#e5e7eb');
  px(ctx, 546, 50, 7, 7, '#facc15');
  // Hộp găng tay / bình sát khuẩn
  block(ctx, 432, 44, 18, 16, '#1d4ed8', '#3b82f6', '#1e3a8a');
  px(ctx, 436, 48, 10, 3, '#e0f2fe');
}

/** Mép rách tĩnh: vụn pixel của hai thế giới văng sang nhau dọc vết nứt */
function drawSeamDebris(ctx: CanvasRenderingContext2D) {
  for (let i = 0; i < 140; i++) {
    const y = ROOM.top - 60 + hash(i * 3.1) * (CANVAS_HEIGHT - ROOM.top + 60);
    const sx = seamXAt(Math.max(0, y));
    const side = hash(i * 7.7) > 0.5 ? 1 : -1;
    const dist = 2 + hash(i * 1.3) * 16;
    const s = 2 + Math.floor(hash(i * 5.9) * 3);
    // Vụn gỗ văng sang nửa ICU, vụn gạch văng sang nửa phòng trọ
    const color = side > 0
      ? (y < ROOM.top ? PAL.wallDormStripe : PAL.woodA)
      : (y < ROOM.top ? PAL.wallIcu : PAL.tileA);
    px(ctx, sx + side * dist, y, s, s, color);
  }
  // Viền đen sâu của vết rách
  ctx.strokeStyle = '#06020a';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  SEAM_POINTS.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.stroke();
}

/** Dựng toàn bộ lớp nền tĩnh: sàn gỗ / gạch, tường, trang trí, mép rách */
function buildStaticLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_WIDTH;
  c.height = CANVAS_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  // Nửa phòng trọ phủ toàn bộ trước
  drawWoodFloor(ctx, ROOM.left, ROOM.top, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawWalls(ctx, false);

  // Nửa ICU được cắt theo vết rách rồi phủ lên
  ctx.save();
  traceIcuRegion(ctx);
  ctx.clip();
  drawTileFloor(ctx);
  drawWalls(ctx, true);
  ctx.restore();

  drawStaticDecor(ctx);
  drawSeamDebris(ctx);
  return c;
}

/**
 * Cắt 3 frame đứng quay mặt xuống (hàng 0) từ mien_spritesheet.png — giống Màn 1 —
 * và dựng sẵn 3 phiên bản mỗi frame: gốc, kênh đỏ, kênh cyan (cho chromatic aberration)
 */
function buildMienLayers(img: HTMLImageElement): NonNullable<SpriteBank['mien']> {
  const w = MIEN_DRAW_W;
  const h = MIEN_DRAW_H;
  const make = (frame: number, tint: string | null) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return c;
    g.imageSmoothingEnabled = false;
    const f = getSpriteFrame(img, frame, MIEN_DIR_ROW, false, w, h);
    g.drawImage(f.src, f.sx, f.sy, f.w, f.h, 0, 0, w, h);
    if (tint) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = tint;
      g.fillRect(0, 0, w, h);
    }
    return c;
  };
  const frames = [0, 1, 2];
  return {
    ghost: frames.map((f) => make(f, null)),
    red: frames.map((f) => make(f, 'rgba(255,30,60,1)')),
    cyan: frames.map((f) => make(f, 'rgba(30,230,255,1)')),
    w,
    h,
  };
}

// =====================================================================
// HÀM VẼ ĐỘNG MỖI FRAME
// =====================================================================

/** Khung cảnh ngoài cửa sổ vỡ: mưa đêm + đèn xe 115 chớp đỏ/xanh */
function drawWindow(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = WINDOW_RECT;
  const redOn = Math.sin(fs.t * 9) > 0;
  // Bầu trời đêm hắt màu đèn còi
  px(ctx, x, y, w, h, '#05060c');
  ctx.fillStyle = redOn ? 'rgba(220,38,38,0.35)' : 'rgba(37,99,235,0.35)';
  ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  // Bóng xe 115 mờ ngoài đường
  px(ctx, x + 14, y + 40, 40, 12, '#cfd5da');
  px(ctx, x + 14, y + 40, 40, 2, '#9aa3ab');
  px(ctx, x + 30, y + 44, 8, 5, '#dc2626');
  px(ctx, x + 18, y + 37, 6, 3, redOn ? '#ff3b3b' : '#4b1010');
  px(ctx, x + 44, y + 37, 6, 3, redOn ? '#0b1f4a' : '#4f8bff');
  // Mưa xiên
  ctx.strokeStyle = 'rgba(180,200,230,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const rx = x + ((i * 9 + fs.t * 90) % w);
    const ry = y + ((i * 17 + fs.t * 260) % h);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 2, ry + 6);
  }
  ctx.stroke();
  // Khung cửa sổ gỗ/nhôm gãy
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 4;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  px(ctx, x - 2, y - 2, w + 4, 3, '#6b7280');
  px(ctx, x - 2, y + h - 1, w + 4, 4, '#4b5563');
  px(ctx, x + w / 2 - 1, y, 3, h, '#4b5563');
  // Kính vỡ: mảnh tam giác còn sót + đường nứt
  ctx.fillStyle = 'rgba(200,220,240,0.22)';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 26); ctx.closePath();
  ctx.moveTo(x + w, y + h); ctx.lineTo(x + w - 18, y + h); ctx.lineTo(x + w, y + h - 30); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 22, y); ctx.lineTo(x + 10, y + 12); ctx.lineTo(x, y + 26);
  ctx.moveTo(x + w - 18, y + h); ctx.lineTo(x + w - 8, y + h - 14); ctx.lineTo(x + w, y + h - 30);
  ctx.stroke();
  // Mảnh kính vương trên bậu cửa
  for (let i = 0; i < 6; i++) px(ctx, x + 4 + i * 11, y + h + 3 + (i % 2) * 2, 2, 1, '#dbeafe');
}

/** Đèn tuýp huỳnh quang trên tường ICU (độ sáng theo trạng thái chớp) */
function drawFluorescentTube(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x1, x2, y } = FLUORO;
  block(ctx, x1 - 4, y - 3, x2 - x1 + 8, 9, '#9ca3af', '#d1d5db', '#6b7280');
  const lv = fs.fluoro;
  const tube = lv > 0.6 ? '#f0fbff' : lv > 0.2 ? '#9fb8c4' : '#3a4448';
  px(ctx, x1, y, x2 - x1, 3, tube);
  if (lv > 0.6) px(ctx, x1, y, x2 - x1, 1, '#ffffff');
  // Đầu tuýp đen cháy
  px(ctx, x1, y, 4, 3, '#2a2f33');
  px(ctx, x2 - 4, y, 4, 3, '#2a2f33');
}

/** Gương nứt: khuôn mặt An quấn băng gạc, scanline rung giật */
function drawMirror(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = MIRROR;
  // Khung gỗ dày có viền
  block(ctx, x - 3, y - 3, w + 6, h + 6, '#5b3a22', '#7d5534', '#3b2414');
  px(ctx, x, y, w, h, '#0e1622');
  // Ánh xanh lạnh của mặt kính
  const glassGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  glassGrad.addColorStop(0, 'rgba(120,170,210,0.25)');
  glassGrad.addColorStop(1, 'rgba(20,30,50,0)');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(x, y, w, h);

  // Khuôn mặt vẽ theo từng hàng để có thể xô lệch scanline
  const glitching = (fs.t * 1.3) % 3 < 0.25 || Math.random() < fs.glitch * 0.08;
  const rows: Array<[number, number, number, string]> = [
    // [dy, dx, width, color]
    [6, 11, 16, '#e5e7eb'],  // Băng gạc
    [7, 10, 18, '#f8fafc'],
    [8, 10, 18, '#e5e7eb'],
    [9, 10, 18, '#f1f5f9'],
    [10, 11, 16, '#e2b8a0'], // Da tái nhợt
    [11, 11, 16, '#e2b8a0'],
    [12, 11, 16, '#d7a98f'],
    [13, 11, 16, '#d7a98f'],
    [14, 11, 16, '#d7a98f'],
    [15, 12, 14, '#cf9f86'],
    [16, 12, 14, '#cf9f86'],
    [17, 13, 12, '#c39079'],
    [18, 14, 10, '#b98670'],
    [19, 15, 8, '#a87561'],
  ];
  for (const [dy, dx, rw, col] of rows) {
    const jitter = glitching ? Math.round((Math.random() - 0.5) * 6) : 0;
    px(ctx, x + dx + jitter, y + dy * 1.6, rw, 2, col);
  }
  // Vết máu thấm băng gạc + mắt thâm nhắm nghiền + ống thở
  px(ctx, x + 17, y + 11, 6, 3, '#b91c1c');
  px(ctx, x + 20, y + 14, 3, 2, '#7f1d1d');
  px(ctx, x + 14, y + 20, 4, 1, '#3b1d2a');
  px(ctx, x + 21, y + 20, 4, 1, '#3b1d2a');
  px(ctx, x + 17, y + 27, 5, 3, '#93c5fd');
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 15); ctx.lineTo(x + 2, y + 22);
  ctx.moveTo(x + 22, y + 30); ctx.lineTo(x + 28, y + h);
  ctx.stroke();

  // Scanline chạy dọc mặt kính
  const scanY = y + ((fs.t * 30) % h);
  px(ctx, x, scanY, w, 1, 'rgba(255,255,255,0.25)');
  if (glitching) {
    px(ctx, x, y + Math.random() * h, w, 2, 'rgba(239,68,68,0.55)');
    px(ctx, x + 2, y, w, h, 'rgba(56,189,248,0.08)');
  }
  // Vết nứt hình mạng nhện
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(x + 26, y + 16); ctx.lineTo(x, y + 8);
  ctx.moveTo(x + 26, y + 16); ctx.lineTo(x + w, y + 4);
  ctx.moveTo(x + 26, y + 16); ctx.lineTo(x + 18, y + h);
  ctx.moveTo(x + 26, y + 16); ctx.lineTo(x + w, y + 30);
  ctx.moveTo(x + 26, y + 16); ctx.lineTo(x + 8, y + h);
  ctx.stroke();
  // Mảnh gương rơi mất lộ tường
  ctx.fillStyle = '#1b130c';
  ctx.beginPath();
  ctx.moveTo(x + w, y + 30); ctx.lineTo(x + w, y + h); ctx.lineTo(x + 30, y + h); ctx.closePath();
  ctx.fill();
  // Máu rỉ từ mép gương
  px(ctx, x + 18, y + h + 3, 2, 3 + ((fs.t * 4) | 0) % 5, PAL.bloodHi);
}

/** Vết rách thực tại: đường zig-zag phát sáng tím neon / đỏ thẫm + khối glitch */
function drawRift(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const pulse = 0.55 + Math.sin(fs.t * 3.2) * 0.25 + fs.phase * 0.08;
  const trace = (offset: number) => {
    ctx.beginPath();
    SEAM_POINTS.forEach((pt, i) => {
      const wobble = Math.sin(fs.t * 6 + i) * fs.glitch * 1.5;
      const xx = pt.x + offset + wobble;
      if (i === 0) ctx.moveTo(xx, pt.y);
      else ctx.lineTo(xx, pt.y);
    });
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'miter';
  // Quầng phát sáng nhiều lớp (thay cho shadowBlur tốn GPU)
  ctx.strokeStyle = `rgba(192,38,211,${0.12 * pulse})`;
  ctx.lineWidth = 16 + fs.phase * 3;
  trace(0); ctx.stroke();
  ctx.strokeStyle = `rgba(225,29,72,${0.22 * pulse})`;
  ctx.lineWidth = 8;
  trace(-1); ctx.stroke();
  ctx.strokeStyle = `rgba(232,121,249,${0.75 * pulse})`;
  ctx.lineWidth = 2;
  trace(1); ctx.stroke();
  ctx.strokeStyle = `rgba(255,220,255,${0.9 * pulse})`;
  ctx.lineWidth = 1;
  trace(0); ctx.stroke();
  ctx.restore();

  // Khối pixel glitch bong ra dọc vết rách (số lượng tăng theo phase)
  const count = 4 + fs.phase * 4 + Math.round(fs.glitch * 8);
  for (let i = 0; i < count; i++) {
    const seed = Math.floor(fs.t * 12) * 31 + i * 17;
    const yy = hash(seed) * CANVAS_HEIGHT;
    const xx = seamXAt(yy) + (hash(seed + 1) - 0.5) * 28;
    const s = 2 + Math.floor(hash(seed + 2) * 5);
    const c = hash(seed + 3);
    px(ctx, xx, yy, s * (c > 0.8 ? 4 : 1), s, c < 0.4 ? '#e879f9' : c < 0.75 ? '#f43f5e' : '#22d3ee');
  }

  // Ký tự dữ liệu rò rỉ trôi lên dọc vết nứt
  ctx.font = '7px monospace';
  const glyphs = '0137ERR!05#';
  for (let i = 0; i < 7; i++) {
    const yy = CANVAS_HEIGHT - ((fs.t * 22 + i * 70) % (CANVAS_HEIGHT - 20));
    const xx = seamXAt(yy) + (i % 2 === 0 ? 7 : -12);
    ctx.fillStyle = `rgba(244,114,182,${0.35 + (i % 3) * 0.15})`;
    ctx.fillText(glyphs[(i + Math.floor(fs.t * 5)) % glyphs.length], xx, yy);
  }
}

/** Vẽ sprite An sắc nét (lật ngang khi quay trái) + nhịp nhún bước / thở; dùng chung cho nhân vật và phản chiếu */
function drawAnSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, p: PlayerState, t: number, offsetX = 0) {
  const drawX = p.x - AN_DRAW_W / 2 + offsetX;
  const drawY = p.y - AN_DRAW_H + 18 + bodyBob(p, t);
  drawSpriteFrame(ctx, img, p.frame, DIR_ROW[p.dir], p.dir === 'left', drawX, drawY, AN_DRAW_W, AN_DRAW_H);
}

/** Cọc truyền dịch IV: chân sao 5 bánh, túi NaCl 0.9%, bầu nhỏ giọt, dây dẫn tới đầu giường */
function drawIVPole(ctx: CanvasRenderingContext2D, ivDropY: number, reflected = false) {
  const { x, baseY, topY } = IV_POLE;
  if (!reflected) dropShadow(ctx, x, baseY + 1, 10, 3);
  // Chân đế
  px(ctx, x - 9, baseY - 1, 18, 2, PAL.metalDark);
  px(ctx, x - 9, baseY, 2, 2, '#111');
  px(ctx, x + 7, baseY, 2, 2, '#111');
  px(ctx, x - 1, baseY + 1, 2, 2, '#111');
  // Trụ inox
  px(ctx, x - 2, topY, 4, baseY - topY, PAL.outline);
  px(ctx, x - 1, topY, 2, baseY - topY, PAL.metal);
  px(ctx, x - 1, topY, 1, baseY - topY, PAL.metalHi);
  // Móc treo
  px(ctx, x - 8, topY - 1, 16, 2, PAL.metalHi);
  if (reflected) return;
  // Túi nước muối sinh lý
  block(ctx, x - 6, topY + 3, 12, 18, 'rgba(214,236,250,0.85)', '#ffffff', '#93c5fd', '#3b6a8a');
  px(ctx, x - 5, topY + 9, 10, 11, 'rgba(147,197,253,0.65)');
  px(ctx, x - 4, topY + 6, 8, 3, '#0369a1');                  // Nhãn NaCl
  // Bầu nhỏ giọt + giọt rơi
  px(ctx, x - 2, topY + 22, 4, 8, 'rgba(224,242,254,0.7)');
  px(ctx, x - 1, topY + 22 + ivDropY, 2, 2, '#7dd3fc');
  // Dây truyền uốn tới đầu giường
  ctx.strokeStyle = 'rgba(230,240,255,0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, topY + 30);
  ctx.bezierCurveTo(x + 6, baseY + 10, BED.x + BED.w - 40, BED.y - 20, BED.x + BED.w - 18, BED.y + 18);
  ctx.stroke();
}

/** Giường cấp cứu ICU Bạch Mai: khung inox, drap rách, máu, logo, bìa bệnh án ở chân giường */
function drawBed(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = BED;
  dropShadow(ctx, x + w / 2 + 4, y + h + 2, w / 2 + 4, 7, 0.5);
  // Chân giường + bánh xe
  for (const lx of [x + 4, x + w - 8]) {
    px(ctx, lx, y + h - 2, 4, 6, PAL.metalDark);
    px(ctx, lx - 1, y + h + 3, 6, 3, '#111');
  }
  // Khung inox có viền
  block(ctx, x, y + 6, w, h - 8, PAL.metal, PAL.metalHi, PAL.metalDark);
  // Nệm + drap trắng
  px(ctx, x + 4, y + 9, w - 8, h - 16, PAL.sheet);
  px(ctx, x + 4, y + 9, w - 8, 2, '#ffffff');
  for (let i = 0; i < 4; i++) px(ctx, x + 14 + i * 22, y + 14 + (i % 2) * 6, 14, 1, PAL.sheetShade); // Nếp nhăn
  // Drap rách toạc lộ nệm xanh + mép vải tua rua
  ctx.fillStyle = '#2f5e7a';
  ctx.beginPath();
  ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + 52, y + 24); ctx.lineTo(x + 60, y + 40);
  ctx.lineTo(x + 44, y + 52); ctx.lineTo(x + 34, y + 44);
  ctx.closePath();
  ctx.fill();
  px(ctx, x + 36, y + 36, 14, 2, '#1e3f55');
  for (let i = 0; i < 5; i++) px(ctx, x + 32 + i * 5, y + 44 + (i % 2) * 3, 2, 4, PAL.sheet);
  // Mảnh drap rủ xuống mép giường
  px(ctx, x + 64, y + h - 8, 10, 9, PAL.sheetShade);
  px(ctx, x + 66, y + h, 3, 4, PAL.sheet);
  // Vết máu loang
  ctx.fillStyle = 'rgba(127,13,18,0.85)';
  ctx.beginPath();
  ctx.ellipse(x + 92, y + 32, 16, 10, 0.3, 0, Math.PI * 2);
  ctx.ellipse(x + 76, y + 46, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, x + 88, y + 28, 5, 2, PAL.bloodHi);
  // Gối (đầu giường bên phải) dính máu
  block(ctx, x + w - 26, y + 14, 18, h - 26, '#f8fafc', '#ffffff', '#cbd5e1');
  px(ctx, x + w - 22, y + 24, 8, 6, 'rgba(185,28,28,0.8)');
  // Logo Bạch Mai in trên drap: chữ thập xanh + chữ
  px(ctx, x + 12, y + 50, 7, 2, '#0284c7');
  px(ctx, x + 14.5, y + 47.5, 2, 7, '#0284c7');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#0369a1';
  ctx.fillText('BẠCH MAI', x + 22, y + 54);
  // Thanh chắn hai bên (lan can giường)
  for (const ry of [y + 4, y + h - 6]) {
    px(ctx, x + 8, ry, w - 40, 3, PAL.outline);
    px(ctx, x + 8, ry, w - 40, 2, PAL.metalHi);
    for (let rx = x + 10; rx < x + w - 34; rx += 12) px(ctx, rx, ry, 2, 3, PAL.metalDark);
  }
  // Đầu giường / chân giường
  block(ctx, x + w - 5, y + 2, 5, h - 2, '#cbd5e1', '#f1f5f9', '#64748b');
  block(ctx, x, y + 2, 5, h - 2, '#cbd5e1', '#f1f5f9', '#64748b');
  // Thẻ định danh bệnh nhân
  block(ctx, x + w - 22, y + h - 9, 12, 6, '#facc15', '#fde68a', '#ca8a04');

  // Bìa bệnh án kẹp nhôm treo chân giường (ch3_chart)
  const cx = 408;
  const cy = 262;
  block(ctx, cx, cy, 22, 28, '#a8b3bf', '#d6dde4', '#6b7785');
  px(ctx, cx + 2, cy + 4, 18, 22, '#f5efd6');
  for (let i = 0; i < 6; i++) px(ctx, cx + 4, cy + 7 + i * 3, i % 2 ? 10 : 14, 1, '#6b7280');
  ctx.fillStyle = 'rgba(220,38,38,0.85)';                    // Mộc đỏ Bạch Mai
  ctx.beginPath();
  ctx.arc(cx + 15, cy + 20, 3.5, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx + 7, cy - 2, 8, 4, '#475569');                    // Kẹp ghim
  // Vệt nước mắt nhòe mực khi chưa đọc thì chớp nhẹ
  if (!fs.interacted.has('ch3_chart') && Math.sin(fs.t * 4) > 0.6) {
    px(ctx, cx + 4, cy + 13, 12, 2, 'rgba(56,189,248,0.6)');
  }
}

/** Xe sốc tim LifePak + monitor ECG; đèn LED nhấp nháy đúng nhịp BPM */
function drawDefibCart(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = CART;
  dropShadow(ctx, x + w / 2, y + h + 3, w / 2 + 2, 5);
  // Bánh xe
  px(ctx, x + 3, y + h, 6, 4, '#111');
  px(ctx, x + w - 9, y + h, 6, 4, '#111');
  // Thân xe đẩy
  block(ctx, x, y + 22, w, h - 22, '#3f4a57', '#5b6878', '#2a323c');
  px(ctx, x + 4, y + 32, w - 8, 1, '#2a323c');              // Ngăn kéo
  px(ctx, x + 4, y + 41, w - 8, 1, '#2a323c');
  px(ctx, x + w / 2 - 3, y + 35, 6, 2, PAL.metalHi);
  px(ctx, x + w / 2 - 3, y + 44, 6, 2, PAL.metalHi);
  // Máy LifePak (vỏ xám, viền cam)
  block(ctx, x + 2, y - 4, w - 4, 26, '#6b7280', '#9ca3af', '#4b5563');
  px(ctx, x + 2, y + 19, w - 4, 3, '#ea580c');
  // Màn hình ECG
  const sx = x + 5;
  const sy = y - 1;
  const sw = 28;
  const sh = 16;
  px(ctx, sx - 1, sy - 1, sw + 2, sh + 2, '#000');
  px(ctx, sx, sy, sw, sh, '#03140f');
  const traceColor = fs.defibDone ? '#34d399' : '#f87171';
  ctx.strokeStyle = traceColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= sw; i++) {
    // Sóng P-QRS-T lấy theo pha nhịp tim, cuộn sang trái theo thời gian
    const ph = (((fs.t - (sw - i) * 0.03) * fs.bpm) / 60) % 1;
    let v = 0;
    if (ph < 0.08) v = Math.sin((ph / 0.08) * Math.PI) * 1.5;            // P
    else if (ph < 0.11) v = -1.5;                                          // Q
    else if (ph < 0.14) v = 6.5;                                           // R
    else if (ph < 0.17) v = -3;                                            // S
    else if (ph > 0.26 && ph < 0.4) v = Math.sin(((ph - 0.26) / 0.14) * Math.PI) * 2; // T
    const yy = sy + sh / 2 + 2 - v;
    if (i === 0) ctx.moveTo(sx + i, yy);
    else ctx.lineTo(sx + i, yy);
  }
  ctx.stroke();
  ctx.font = '5px monospace';
  ctx.fillStyle = traceColor;
  ctx.fillText(`HR ${fs.bpm}`, sx + 1, sy + 5);
  // Đèn LED nhịp tim: sáng ở đầu mỗi chu kỳ (38 BPM ≈ 1.58s/nhịp)
  const beatPhase = ((fs.t * fs.bpm) / 60) % 1;
  const ledOn = beatPhase < 0.14;
  px(ctx, x + 36, y, 6, 6, '#111');
  px(ctx, x + 37, y + 1, 4, 4, ledOn ? (fs.defibDone ? '#4ade80' : '#ff2d2d') : '#3b0a0a');
  // Đèn nạp 200J
  px(ctx, x + 37, y + 9, 4, 3, Math.sin(fs.t * 8) > 0 ? '#facc15' : '#713f12');
  ctx.fillStyle = '#fef3c7';
  ctx.fillText('200J', x + 34, y + 18);
  // Hai bản cực sốc tim treo bên hông + dây xoắn
  block(ctx, x - 6, y + 24, 6, 10, '#dc2626', '#f87171', '#7f1d1d');
  block(ctx, x + w, y + 24, 6, 10, '#2563eb', '#60a5fa', '#1e3a8a');
  ctx.strokeStyle = '#1f2937';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(x - 3, y + 34 + i * 2); ctx.lineTo(x + 1, y + 35 + i * 2);
    ctx.moveTo(x + w + 3, y + 34 + i * 2); ctx.lineTo(x + w - 1, y + 35 + i * 2);
  }
  ctx.stroke();
}

/** Bàn học sinh viên: CRT đỏ rực, đèn bàn, case PC toé lửa, mì tôm, đồng hồ 03:14 */
function drawDesk(ctx: CanvasRenderingContext2D, fs: FrameState, sparks: Particle[]) {
  const { x, y, w, h } = DESK;
  dropShadow(ctx, x + w / 2, y + h + 2, w / 2 + 4, 5);
  // Chân bàn
  px(ctx, x + 2, y + h - 6, 4, 8, '#2e1d10');
  px(ctx, x + w - 6, y + h - 6, 4, 8, '#2e1d10');
  // Mặt bàn gỗ ép + cạnh trước
  block(ctx, x, y + 6, w, 30, '#7a5230', '#9a6c42', '#5b3a22');
  block(ctx, x, y + 36, w, 12, '#4e311c', '#5b3a22', '#2e1d10');
  px(ctx, x + w / 2 - 6, y + 41, 12, 2, '#a68a64');            // Tay nắm ngăn kéo
  // Vết cháy xém do tia lửa
  ctx.fillStyle = 'rgba(20,10,5,0.6)';
  ctx.beginPath();
  ctx.ellipse(x + 86, y + 26, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Đèn bàn học cũ (cần gập + chao đèn)
  const lx = DESK_LAMP.x;
  const ly = DESK_LAMP.y;
  px(ctx, lx - 5, ly + 24, 10, 3, '#1f2937');
  px(ctx, lx - 1, ly + 8, 2, 16, '#374151');
  px(ctx, lx - 1, ly + 8, 10, 2, '#374151');
  block(ctx, lx + 4, ly + 3, 12, 6, '#15803d', '#22c55e', '#14532d');
  px(ctx, lx + 6, ly + 9, 8, 2, fs.lamp > 0.4 ? '#fff3c4' : '#7c6a3a');

  // Màn hình CRT be cũ
  const mx = x + 26;
  const my = y - 6;
  block(ctx, mx, my, 44, 36, '#d6ccb4', '#efe6cf', '#9e9277');
  px(ctx, mx + 4, my + 4, 36, 24, '#120303');
  const flick = Math.sin(fs.t * 30) > 0.9 ? 0.6 : 1;
  ctx.fillStyle = `rgba(220,38,38,${0.35 * flick})`;
  ctx.fillRect(mx + 4, my + 4, 36, 24);
  ctx.font = '5px monospace';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('MEMORY_DUMP', mx + 6, my + 11);
  ctx.fillStyle = Math.sin(fs.t * 5) > 0 ? '#ffffff' : '#f87171';
  ctx.fillText('SECTOR_1705', mx + 6, my + 18);
  ctx.fillStyle = '#ef4444';
  ctx.fillText('[ĐÃ KHÓA]', mx + 6, my + 25);
  for (let sy = my + 4; sy < my + 28; sy += 2) px(ctx, mx + 4, sy, 36, 1, 'rgba(0,0,0,0.3)');
  px(ctx, mx + 36, my + 31, 3, 2, '#22c55e');                  // Đèn nguồn
  // Bàn phím
  block(ctx, mx + 2, y + 32, 40, 7, '#3f3f46', '#52525b', '#27272a');
  for (let k = 0; k < 9; k++) px(ctx, mx + 4 + k * 4, y + 34, 3, 2, '#71717a');

  // Cốc mì tôm + sách vở chồng chất
  block(ctx, x + 6, y + 30, 8, 8, '#f5f5f4', '#ffffff', '#a8a29e');
  px(ctx, x + 6, y + 30, 8, 2, '#dc2626');
  block(ctx, x + 76, y + 10, 16, 5, '#1d4ed8', '#3b82f6', '#1e3a8a');
  block(ctx, x + 77, y + 15, 15, 4, '#b45309', '#d97706', '#78350f');
  // Đồng hồ báo thức điện tử 03:14 nhấp nháy
  block(ctx, x + 78, y + 24, 18, 8, '#111827', '#1f2937', '#030712');
  ctx.font = '6px monospace';
  ctx.fillStyle = '#ef4444';
  ctx.fillText(Math.sin(fs.t * 3.14) > 0 ? '03:14' : '03 14', x + 79, y + 30);

  // Case PC bốc khói, quạt LED đỏ
  const cx = x + w - 14;
  block(ctx, cx, y - 2, 14, 36, '#18181b', '#27272a', '#09090b');
  const fanOn = Math.floor(fs.t * 20) % 2 === 0;
  px(ctx, cx + 3, y + 6, 8, 8, fanOn ? '#ef4444' : '#7f1d1d');
  px(ctx, cx + 6, y + 6, 2, 8, '#18181b');
  px(ctx, cx + 3, y + 9, 8, 2, '#18181b');
  px(ctx, cx + 3, y + 20, 8, 1, '#3f3f46');
  px(ctx, cx + 3, y + 23, 8, 1, '#3f3f46');
  // Tia lửa điện
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
    px(ctx, s.x, s.y, 2, 2, s.color);
  }
  ctx.globalAlpha = 1;
}

/** Quạt máy đứng cũ: lồng tròn, cánh quay chậm dần khi thực tại sụp đổ */
function drawFan(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y } = FAN;
  dropShadow(ctx, x, 151, 11, 3);
  // Đế + trụ
  px(ctx, x - 9, 147, 18, 4, PAL.outline);
  px(ctx, x - 8, 147, 16, 3, '#e5e7eb');
  px(ctx, x - 2, 118, 4, 30, PAL.outline);
  px(ctx, x - 1, 118, 2, 30, '#d1d5db');
  // Lồng quạt
  ctx.fillStyle = 'rgba(30,40,55,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  // Cánh quạt quay (tốc độ giảm theo phase)
  const angle = fs.t * (9 - fs.phase * 2.5);
  ctx.fillStyle = '#60a5fa';
  for (let b = 0; b < 3; b++) {
    const a = angle + (b * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 2.4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  px(ctx, x - 2, y - 2, 4, 4, '#1e3a8a');
  // Nan lồng
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12);
  ctx.stroke();
}

/** Cửa phòng 314: gỗ sờn, biển số, băng niêm phong vàng đen, biển biohazard, ánh đỏ lọt khe */
function drawDoor(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = DOOR;
  // Khung cửa + cánh cửa gỗ
  block(ctx, x - 2, y - 2, w + 4, h + 4, '#2e1d10', '#4e311c', '#1b130c');
  block(ctx, x + 2, y + 2, w - 4, h - 4, '#6b4426', '#8a5a33', '#4e311c');
  px(ctx, x + 6, y + 6, w - 12, 20, '#5b3a22');                // Ô pano
  px(ctx, x + 6, y + 44, w - 12, 24, '#5b3a22');
  // Ô kính mờ có bóng y tá chạy qua
  px(ctx, x + 9, y + 9, w - 18, 14, '#3a3f45');
  const shadowX = x + 9 + ((fs.t * 18) % (w - 22));
  px(ctx, shadowX, y + 10, 4, 12, 'rgba(230,240,255,0.35)');
  // Biển số phòng 314 bằng đồng
  block(ctx, x + 12, y + 30, 16, 7, '#b88a2c', '#e0b84f', '#7a5a1a');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#2a1a05';
  ctx.fillText('314', x + 14, y + 36);
  // Tay nắm
  px(ctx, x + w - 10, y + 40, 4, 3, PAL.metalHi);
  // Ánh đỏ lọt qua khe cửa (hành lang cấp cứu)
  const glow = 0.4 + Math.sin(fs.t * 6) * 0.25;
  px(ctx, x + w, y + 4, 2, h - 8, `rgba(239,68,68,${glow})`);

  // Băng niêm phong vàng đen bắt chéo (vẽ sọc xoay)
  const tape = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    px(ctx, 0, -4, len, 8, PAL.outline);
    px(ctx, 0, -3, len, 6, '#facc15');
    for (let i = 0; i < len; i += 8) px(ctx, i, -3, 4, 6, '#111');
    ctx.restore();
  };
  tape(x - 4, y + 8, x + w + 4, y + 50);
  tape(x - 4, y + 50, x + w + 4, y + 12);

  // Biển cảnh báo biohazard
  const bx = x + 8;
  const by = y + 52;
  block(ctx, bx, by, 24, 18, '#facc15', '#fde68a', '#ca8a04');
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
    ctx.moveTo(bx + 12 + Math.cos(a) * 7, by + 8 + Math.sin(a) * 7);
    ctx.arc(bx + 12 + Math.cos(a) * 4, by + 8 + Math.sin(a) * 4, 3, 0, Math.PI * 2);
  }
  ctx.stroke();
  px(ctx, bx + 11, by + 7, 2, 2, '#111');
  ctx.font = 'bold 4px monospace';
  ctx.fillStyle = '#111';
  ctx.fillText('CÁCH LY', bx + 3, by + 17);
}

/** Balo ướt sũng: vải dù sẫm, bùn đất, nước nhỏ giọt, hộp nhung đỏ hé lộ nhẫn bạc */
function drawBag(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const { x, y, w, h } = BAG;
  dropShadow(ctx, x + w / 2, y + h, w / 2 + 2, 4);
  // Thân balo + nắp + túi trước
  block(ctx, x + 2, y + 4, w - 6, h - 4, '#1e2a3d', '#2c3c56', '#121a27');
  block(ctx, x + 3, y, w - 8, 9, '#25334a', '#34486a', '#121a27');
  block(ctx, x + 6, y + 14, w - 14, 10, '#1a2435', '#25334a', '#0d131d');
  // Quai đeo
  px(ctx, x, y + 6, 3, 16, '#111827');
  px(ctx, x + w - 4, y + 6, 3, 14, '#111827');
  // Bùn đất bám
  px(ctx, x + 4, y + h - 5, 10, 3, '#5b3a1a');
  px(ctx, x + 16, y + h - 3, 6, 2, '#4a2f14');
  px(ctx, x + 8, y + 12, 4, 2, '#5b3a1a');
  // Vệt ướt lấp lánh
  const shine = Math.sin(fs.t * 2) * 0.5 + 0.5;
  px(ctx, x + 6, y + 6, 1, 6, `rgba(180,210,255,${0.4 + shine * 0.4})`);
  px(ctx, x + 20, y + 16, 1, 4, `rgba(180,210,255,${0.3 + shine * 0.3})`);
  // Khoá kéo mở toang
  px(ctx, x + 4, y + 9, w - 10, 1, PAL.metal);
  // Hộp nhung đỏ hé mở bên miệng balo
  const rx = x + w - 13;
  const ry = y - 4;
  block(ctx, rx, ry + 4, 11, 7, '#9f1239', '#be123c', '#4c0519');
  px(ctx, rx, ry, 11, 4, '#881337');                           // Nắp hé
  px(ctx, rx + 1, ry + 4, 9, 2, '#fbcfe8');                    // Lớp lót satin
  px(ctx, rx + 3, ry + 5, 2, 2, '#e5e7eb');                    // Đôi nhẫn bạc
  px(ctx, rx + 6, ry + 5, 2, 2, '#e5e7eb');
  // Ánh bạc lấp lánh hình chữ thập
  const glint = (Math.sin(fs.t * 2.4) + 1) / 2;
  if (glint > 0.55) {
    const a = (glint - 0.55) / 0.45;
    const gx = rx + 4;
    const gy = ry + 5;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(gx, gy - 3, 1, 7);
    ctx.fillRect(gx - 3, gy, 7, 1);
  }
}

/** Vũng máu / nước có độ bóng: phản chiếu bóng An + cọc truyền dịch, gợn sóng giọt rơi */
function drawPuddles(ctx: CanvasRenderingContext2D, fs: FrameState, sprites: SpriteBank, sim: SimState) {
  const p = fs.player;
  for (const pd of PUDDLES) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, Math.PI * 2);
    // Mép vũng không đều: thêm vài elip phụ
    ctx.ellipse(pd.x - pd.rx * 0.55, pd.y + pd.ry * 0.3, pd.rx * 0.45, pd.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.clip();

    const isBlood = pd.kind === 'blood';
    ctx.fillStyle = isBlood ? 'rgba(74,6,10,0.92)' : 'rgba(30,45,60,0.55)';
    ctx.fillRect(pd.x - pd.rx * 1.2, pd.y - pd.ry * 1.5, pd.rx * 2.4, pd.ry * 3);

    // Phản chiếu nhân vật An (lật dọc quanh mép chân)
    const near = Math.abs(p.x - pd.x) < pd.rx + 30 && p.y + 16 < pd.y + pd.ry + 4 && p.y + 16 > pd.y - pd.ry - 70;
    if (near && sprites.an) {
      const feetY = p.y + 16;
      ctx.globalAlpha = isBlood ? 0.42 : 0.35;
      ctx.translate(0, feetY * 2);
      ctx.scale(1, -1);
      drawAnSprite(ctx, sprites.an, p, fs.t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Phản chiếu cọc IV vào vũng máu ngay dưới chân nó
    if (isBlood && Math.abs(IV_POLE.x - pd.x) < pd.rx) {
      ctx.globalAlpha = 0.35;
      ctx.translate(0, IV_POLE.baseY * 2);
      ctx.scale(1, -1);
      drawIVPole(ctx, 0, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Lớp tint màu vũng phủ lên phản chiếu
    ctx.fillStyle = isBlood ? 'rgba(127,13,18,0.35)' : 'rgba(90,130,170,0.18)';
    ctx.fillRect(pd.x - pd.rx * 1.2, pd.y - pd.ry * 1.5, pd.rx * 2.4, pd.ry * 3);
    // Vệt highlight bóng loáng trôi nhẹ
    const sh = Math.sin(fs.t * 1.5 + pd.x) * 4;
    px(ctx, pd.x - pd.rx * 0.5 + sh, pd.y - pd.ry * 0.5, pd.rx * 0.5, 1, isBlood ? 'rgba(255,120,120,0.55)' : 'rgba(220,240,255,0.6)');
    px(ctx, pd.x + pd.rx * 0.2 - sh, pd.y - pd.ry * 0.1, pd.rx * 0.25, 1, isBlood ? 'rgba(255,90,90,0.35)' : 'rgba(220,240,255,0.4)');
    ctx.restore();
  }

  // Giọt rơi + gợn sóng tròn
  for (const d of sim.drips) {
    if (d.ripple > 0) {
      ctx.strokeStyle = d.color.replace('ALPHA', String(Math.max(0, 0.8 - d.ripple / d.maxRipple)));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(d.x, d.floorY, d.ripple, d.ripple * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      px(ctx, d.x, d.y, 1, 3, d.color.replace('ALPHA', '0.95'));
    }
  }
}

/** Bóng ma Miên: đứng như Màn 1, lơ lửng sin(tick*0.08)*3, tóc & váy lay, hào quang tím/đỏ, nước mắt pixel vỡ thành bụi sáng */
function drawMien(ctx: CanvasRenderingContext2D, fs: FrameState, sprites: SpriteBank, sim: SimState) {
  const hover = mienFloat(fs.t);
  const shake = fs.ready ? (Math.random() - 0.5) * 3 : 0;
  const mx = MIEN_ANCHOR.x + shake;
  const my = MIEN_ANCHOR.y + hover;
  const layers = sprites.mien;
  const mw = MIEN_DRAW_W;
  const mh = MIEN_DRAW_H;
  // Đứng thẳng ở frame 1 (tóc & tà váy lay riêng, không giậm chân)
  const frame = 1;
  const asFrame = (c: HTMLCanvasElement) => ({ src: c, sx: 0, sy: 0, w: mw, h: mh });
  const cx = mx + mw / 2;
  const cy = my + mh / 2;

  // Bóng ma dẹt trên sàn co giãn theo độ cao, toả tím
  drawHoloShadow(ctx, MIEN_ANCHOR.x + mw / 2, MIEN_FLOOR_Y, hover, fs.t);
  // Vũng lệ phát sáng dưới chân
  ctx.fillStyle = `rgba(125,211,252,${0.18 + Math.sin(fs.t * 2) * 0.06})`;
  ctx.beginPath();
  ctx.ellipse(MIEN_ANCHOR.x + mw / 2, MIEN_FLOOR_Y, 18, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hào quang
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const auraR = fs.ready ? 62 + Math.sin(fs.t * 9) * 8 : 46 + Math.sin(fs.t * 2) * 3;
  const aura = ctx.createRadialGradient(cx, cy, 6, cx, cy, auraR);
  if (fs.ready) {
    aura.addColorStop(0, 'rgba(255,40,60,0.55)');
    aura.addColorStop(0.5, 'rgba(220,20,60,0.28)');
    aura.addColorStop(1, 'rgba(120,0,30,0)');
  } else {
    aura.addColorStop(0, 'rgba(168,85,247,0.38)');
    aura.addColorStop(0.6, 'rgba(126,34,206,0.15)');
    aura.addColorStop(1, 'rgba(88,28,135,0)');
  }
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Sprite + chromatic aberration
  // Độ trong suốt hologram như Màn 1
  const alpha = 0.75 + Math.sin(fs.t * 12) * 0.15;
  if (layers) {
    const ghost = layers.ghost[frame];
    const split = fs.ready ? 3 + Math.random() * 3 : Math.sin(fs.t * 0.9) > 0.92 ? 2 : 0;
    if (split > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fs.ready ? 0.55 : 0.35;
      drawSwayingFigure(ctx, asFrame(layers.red[frame]), mx - split, my, fs.t);
      drawSwayingFigure(ctx, asFrame(layers.cyan[frame]), mx + split, my + (fs.ready ? (Math.random() - 0.5) * 2 : 0), fs.t);
      ctx.restore();
    }
    drawHoloDust(ctx, cx, cy, mw, mh, fs.t, 'back');
    ctx.globalAlpha = alpha;
    drawSwayingFigure(ctx, asFrame(ghost), mx, my, fs.t);
    // Lát cắt glitch ngang khi đã sẵn sàng đối chất
    if (fs.ready && Math.random() < 0.35) {
      const sliceY = Math.floor(Math.random() * (mh - 6));
      ctx.drawImage(ghost, 0, sliceY, mw, 5, mx + (Math.random() - 0.5) * 10, my + sliceY, mw, 5);
    }
    ctx.globalAlpha = 1;
  } else {
    px(ctx, mx + 8, my + 10, 30, 50, `rgba(192,132,252,${alpha})`);
  }

  // Nước mắt rơi
  for (const t of sim.tears) {
    px(ctx, t.x, t.y, 1, 2, 'rgba(125,211,252,0.95)');
    px(ctx, t.x, t.y, 1, 1, '#ffffff');
  }
  // Bụi sáng khi lệ chạm sàn
  for (const s of sim.splashes) {
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
    px(ctx, s.x, s.y, 1, 1, s.color);
  }
  ctx.globalAlpha = 1;

  drawHoloDust(ctx, cx, cy, mw, mh, fs.t, 'front');
  // Mảnh pixel vụn lơ lửng quanh Miên
  for (let i = 0; i < 8; i++) {
    const ox = Math.sin(fs.t * 0.9 + i * 1.7) * 30;
    const oy = ((fs.t * 14 + i * 13) % 70) - 20;
    px(ctx, cx + ox, my + mh - oy, 2, 2, i % 2 === 0 ? 'rgba(216,180,254,0.7)' : 'rgba(244,63,94,0.55)');
  }
}

/** Nhân vật An: bóng chân, bóng glitch, tách kênh màu khi đứng trên vết rách */
function drawPlayer(ctx: CanvasRenderingContext2D, fs: FrameState, sprites: SpriteBank) {
  const p = fs.player;
  dropShadow(ctx, p.x, p.y + 16, 12, 4.5, 0.5);
  const onSeam = Math.abs(p.x - seamXAt(p.y + 16)) < 22;
  if (!sprites.an) return;
  if (onSeam) {
    // Cơ thể An "bị xé" khi đứng giữa hai thực tại
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    drawAnSprite(ctx, sprites.an, p, fs.t, -3 - Math.random() * 2);
    drawAnSprite(ctx, sprites.an, p, fs.t, 3 + Math.random() * 2);
    ctx.restore();
  }
  drawAnSprite(ctx, sprites.an, p, fs.t);
}

/** Vẽ toàn bộ vật thể tương tác + Miên + An theo thứ tự chiều sâu (y-sort) */
function drawAnomalies(ctx: CanvasRenderingContext2D, fs: FrameState, sprites: SpriteBank, sim: SimState) {
  const items: Array<{ y: number; draw: () => void }> = [
    { y: DESK.y + DESK.h, draw: () => drawDesk(ctx, fs, sim.sparks) },
    { y: 151, draw: () => drawFan(ctx, fs) },
    { y: CART.y + CART.h, draw: () => drawDefibCart(ctx, fs) },
    { y: IV_POLE.baseY, draw: () => drawIVPole(ctx, sim.ivDropY) },
    { y: BED.y + BED.h, draw: () => drawBed(ctx, fs) },
    { y: BAG.y + BAG.h, draw: () => drawBag(ctx, fs) },
    { y: MIEN_FLOOR_Y, draw: () => drawMien(ctx, fs, sprites, sim) },
    { y: fs.player.y + 16, draw: () => drawPlayer(ctx, fs, sprites) },
  ];
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/** Ánh sáng động: lightmap bóng tối đục lỗ + các nguồn sáng màu hoà trộn 'lighter' */
function drawLightingOverlay(ctx: CanvasRenderingContext2D, light: HTMLCanvasElement, fs: FrameState) {
  const l = light.getContext('2d');
  if (!l) return;
  const p = fs.player;

  // 1) Lightmap: phủ bóng tối rồi "khoét" vùng sáng bằng destination-out
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  l.fillStyle = `rgba(6,3,12,${0.78 + fs.phase * 0.03})`;
  l.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  l.globalCompositeOperation = 'destination-out';
  const punch = (x: number, y: number, r: number, s: number) => {
    if (s <= 0.01) return;
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, s)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g;
    l.fillRect(x - r, y - r, r * 2, r * 2);
  };
  punch(p.x, p.y - 8, 115, 0.78);                                   // Quầng quanh An
  punch(DESK_LAMP.x + 10, DESK_LAMP.y + 30, 110, 0.6 * fs.lamp);   // Đèn bàn ấm
  punch(135, 110, 45, 0.45);                                        // CRT đỏ
  punch(494, 70, 230, 0.85 * fs.fluoro);                            // Đèn tuýp ICU
  punch(494, 110, 45, 0.4);                                         // Màn hình ECG
  punch(SIREN_ORIGIN.x, SIREN_ORIGIN.y + 30, 90, 0.45);             // Cửa sổ
  punch(MIEN_ANCHOR.x + MIEN_DRAW_W / 2, MIEN_ANCHOR.y + MIEN_DRAW_H / 2, fs.ready ? 95 : 70, fs.ready ? 0.7 : 0.5); // Miên
  for (let yy = 40; yy < CANVAS_HEIGHT; yy += 90) punch(seamXAt(yy), yy, 40, 0.35); // Vết rách
  punch(DOOR.x + DOOR.w, DOOR.y + DOOR.h / 2, 40, 0.3);            // Ánh đỏ khe cửa
  ctx.drawImage(light, 0, 0);

  // 2) Nguồn sáng màu cộng dồn
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // Đèn bàn học: vùng sáng vàng cam le lói
  glow(DESK_LAMP.x + 10, DESK_LAMP.y + 26, 95, '255,170,80', 0.22 * fs.lamp);
  // Đèn tuýp: hình nón sáng lạnh rọi xuống sàn ICU
  if (fs.fluoro > 0.05) {
    const cone = ctx.createLinearGradient(0, FLUORO.y, 0, 330);
    cone.addColorStop(0, `rgba(190,235,255,${0.2 * fs.fluoro})`);
    cone.addColorStop(1, 'rgba(190,235,255,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(FLUORO.x1, FLUORO.y);
    ctx.lineTo(FLUORO.x2, FLUORO.y);
    ctx.lineTo(FLUORO.x2 + 40, 330);
    ctx.lineTo(FLUORO.x1 - 60, 330);
    ctx.closePath();
    ctx.fill();
  }
  // Đèn xe 115: hai chùm đỏ/xanh quét chéo qua sàn nhà
  const sweep = Math.sin(fs.t * 1.25);
  const beams: Array<[number, string, number]> = [
    [Math.PI / 2 + sweep * 0.95, '239,40,50', Math.max(0, Math.sin(fs.t * 9))],
    [Math.PI / 2 - sweep * 0.95, '50,110,255', Math.max(0, -Math.sin(fs.t * 9))],
  ];
  for (const [ang, rgb, strength] of beams) {
    const a = 0.12 + strength * 0.2;
    const g = ctx.createRadialGradient(SIREN_ORIGIN.x, SIREN_ORIGIN.y, 4, SIREN_ORIGIN.x, SIREN_ORIGIN.y, 430);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.6, `rgba(${rgb},${a * 0.45})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(SIREN_ORIGIN.x, SIREN_ORIGIN.y);
    ctx.arc(SIREN_ORIGIN.x, SIREN_ORIGIN.y, 430, ang - 0.2, ang + 0.2);
    ctx.closePath();
    ctx.fill();
  }
  // Màn hình CRT & ECG
  glow(135, 105, 40, '255,40,40', 0.2);
  glow(494, 108, 30, fs.defibDone ? '52,211,153' : '248,113,113', 0.15);
  // Ánh tím của vết rách
  for (let yy = 60; yy < CANVAS_HEIGHT; yy += 120) glow(seamXAt(yy), yy, 55, '192,38,211', 0.09 + fs.phase * 0.02);
  ctx.restore();
}

/** Hậu kỳ: scanline/vignette dựng sẵn + lát xé ngang ngẫu nhiên khi nhiễu cao */
function drawPostFX(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, post: HTMLCanvasElement, fs: FrameState) {
  // Lát cắt màn hình bị xô ngang (tần suất theo phase + sanity)
  const tearChance = 0.01 + fs.phase * 0.012 + fs.glitch * 0.05;
  if (Math.random() < tearChance) {
    const sy = Math.floor(Math.random() * (CANVAS_HEIGHT - 20));
    const sh = 3 + Math.floor(Math.random() * 12);
    const shift = (Math.random() - 0.5) * 24;
    ctx.drawImage(canvas, 0, sy, CANVAS_WIDTH, sh, shift, sy, CANVAS_WIDTH, sh);
    px(ctx, 0, sy, CANVAS_WIDTH, 1, 'rgba(232,121,249,0.35)');
  }
  ctx.drawImage(post, 0, 0);
}

/** HUD trong canvas: khung ngắm vật thể gần nhất, mũi tên nhấp nhô, lời mời đối chất */
function drawHUD(ctx: CanvasRenderingContext2D, fs: FrameState) {
  const n = fs.nearest;
  if (n) {
    const done = fs.interacted.has(n.id);
    const color = done ? 'rgba(161,161,170,0.8)' : n.id === 'ch3_mien' ? '#fb7185' : '#f472b6';
    drawTargetMarker(ctx, n, color, fs.t);
  }

  // Lời mời đối chất rõ nét phía trên Miên khi đủ manh mối
  if (fs.ready) {
    const tx = MIEN_ANCHOR.x + MIEN_DRAW_W / 2;
    const ty = MIEN_ANCHOR.y - 12 + mienFloat(fs.t);
    const label = '▶ ĐỐI CHẤT VỚI MIÊN [E] ◀';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    px(ctx, tx - tw / 2 - 6, ty - 10, tw + 12, 14, 'rgba(10,0,4,0.85)');
    px(ctx, tx - tw / 2 - 6, ty - 10, tw + 12, 1, '#e11d48');
    px(ctx, tx - tw / 2 - 6, ty + 3, tw + 12, 1, '#e11d48');
    const jx = (Math.random() - 0.5) * 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,0,60,0.7)';
    ctx.fillText(label, tx - 2 + jx, ty);
    ctx.fillStyle = 'rgba(0,220,255,0.6)';
    ctx.fillText(label, tx + 2 + jx, ty);
    ctx.globalCompositeOperation = 'source-over';
    outlinedText(ctx, label, tx, ty, Math.sin(fs.t * 8) > 0 ? '#fff1f2' : '#fecdd3');
    ctx.textAlign = 'left';
  }

  // Dấu thời gian góc màn hình
  drawClock(ctx, fs.t);
  drawHudSubtitle(ctx, `BLEED LV.${fs.phase}`, '#e879f9', 34);
}

// =====================================================================
// CẬP NHẬT MÔ PHỎNG (hạt, giọt, đèn chớp) — tách biệt khỏi phần vẽ
// =====================================================================

function createSimState(): SimState {
  const drips: Drip[] = [
    // Máu nhỏ giọt từ mép drap xuống vũng dưới giường
    { x: 452, y0: BED.y + BED.h - 2, y: BED.y + BED.h - 2, vy: 1.4, floorY: 360, ripple: 0, maxRipple: 14, color: 'rgba(194,35,43,ALPHA)' },
    { x: 494, y0: BED.y + BED.h - 2, y: BED.y + BED.h + 10, vy: 1.2, floorY: 364, ripple: 0, maxRipple: 12, color: 'rgba(194,35,43,ALPHA)' },
    // Máu nhỏ giọt từ túi/dây vào vũng dưới cọc IV
    { x: 470, y0: 175, y: 175, vy: 1.6, floorY: 222, ripple: 0, maxRipple: 16, color: 'rgba(194,35,43,ALPHA)' },
    // Nước mưa từ bậu cửa sổ
    { x: 372, y0: WINDOW_RECT.y + WINDOW_RECT.h + 4, y: WINDOW_RECT.y + WINDOW_RECT.h + 4, vy: 2.2, floorY: 128, ripple: 0, maxRipple: 12, color: 'rgba(200,225,255,ALPHA)' },
    // Nước rỉ từ balo
    { x: 150, y0: BAG.y + BAG.h - 2, y: BAG.y + BAG.h - 2, vy: 0.8, floorY: 428, ripple: 0, maxRipple: 8, color: 'rgba(200,225,255,ALPHA)' },
  ];
  return {
    tears: [],
    splashes: [],
    sparks: [],
    drips,
    ivDropY: 0,
    fluoro: { level: 1, burst: 0, off: 0 },
    lastBeat: -1,
    tearTimer: 0,
  };
}

function updateSim(sim: SimState, k: number, phase: number, t: number) {
  // Đèn tuýp chớp nháy theo chu kỳ ngẫu nhiên (tần suất tăng theo phase)
  const f = sim.fluoro;
  if (f.off > 0) {
    f.off -= k;
    f.level = 0.04;
  } else if (f.burst > 0) {
    f.burst -= k;
    f.level = Math.random() < 0.5 ? 0.12 : 1;
  } else {
    f.level = 0.9 + Math.random() * 0.1;
    if (Math.random() < 0.006 * phase * k) f.burst = 6 + Math.random() * 26;
    else if (Math.random() < 0.0015 * phase * k) f.off = 20 + Math.random() * 50;
  }

  // Nước mắt Miên: sinh từ khoé mắt, rơi tăng tốc, chạm sàn thì vỡ thành bụi sáng
  sim.tearTimer -= k;
  if (sim.tearTimer <= 0 && sim.tears.length < 10) {
    sim.tearTimer = 10 + Math.random() * 14;
    const eye = MIEN_EYES[Math.random() < 0.5 ? 0 : 1];
    sim.tears.push({ x: MIEN_ANCHOR.x + eye.dx, y: MIEN_ANCHOR.y + eye.dy + mienFloat(t), vy: 0.4 });
  }
  for (const tear of sim.tears) {
    tear.vy += 0.06 * k;
    tear.y += tear.vy * k;
    if (tear.y >= MIEN_FLOOR_Y) {
      for (let i = 0; i < 5 && sim.splashes.length < 60; i++) {
        const life = 18 + Math.random() * 20;
        sim.splashes.push({
          x: tear.x,
          y: MIEN_FLOOR_Y - 1,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -(0.4 + Math.random() * 1.1),
          life,
          maxLife: life,
          color: Math.random() < 0.5 ? '#e0f2fe' : '#c4b5fd',
        });
      }
      tear.y = -1; // Đánh dấu xoá
    }
  }
  sim.tears = sim.tears.filter((tr) => tr.y >= 0);
  for (const s of sim.splashes) {
    s.x += s.vx * k;
    s.y += s.vy * k;
    s.vy += 0.03 * k;
    s.life -= k;
  }
  sim.splashes = sim.splashes.filter((s) => s.life > 0);

  // Tia lửa điện từ case PC
  if (Math.random() < 0.2 * k && sim.sparks.length < 16) {
    const life = 18 + Math.random() * 12;
    sim.sparks.push({
      x: DESK.x + DESK.w - 7 + (Math.random() - 0.5) * 8,
      y: DESK.y + 2,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(0.5 + Math.random() * 1.2),
      life,
      maxLife: life,
      color: Math.random() > 0.5 ? '#ef4444' : '#f97316',
    });
  }
  for (const s of sim.sparks) {
    s.x += s.vx * k;
    s.y += s.vy * k;
    s.life -= k;
  }
  sim.sparks = sim.sparks.filter((s) => s.life > 0);

  // Giọt máu / nước rơi xuống vũng → gợn sóng
  for (const d of sim.drips) {
    if (d.ripple > 0) {
      d.ripple += 0.45 * k;
      if (d.ripple > d.maxRipple) {
        d.ripple = 0;
        d.y = d.y0;
      }
    } else {
      d.y += d.vy * k;
      if (d.y >= d.floorY) d.ripple = 1;
    }
  }

  // Giọt nước muối trong bầu nhỏ giọt
  sim.ivDropY += 0.25 * k;
  if (sim.ivDropY > 6) sim.ivDropY = 0;
}

// =====================================================================
// COMPONENT
// =====================================================================

export const PixelBleedStage: React.FC<PixelBleedStageProps> = ({
  characterSprite,
  sanity,
  setSanity,
  onTrigger,
  interactedIds = EMPTY_IDS,
  onMarkInteracted,
  volume = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const spritesRef = useRef<SpriteBank>({ an: null, mien: null });

  // Vị trí nhân vật An (tỉnh dậy trên chiếu ở nửa phòng trọ #314)
  const playerRef = useRef<PlayerState>({
    x: 230,
    y: 270,
    speed: 3.2,
    dir: 'up',
    isMoving: false,
    frame: 1,
    animTimer: 0,
  });

  const [localInteractedIds, setLocalInteractedIds] = useState<string[]>(interactedIds);
  const [isDefibMinigameOpen, setIsDefibMinigameOpen] = useState(false);
  const [activePrompt, setActivePrompt] = useState<{ text: string; isDone: boolean } | null>(null);
  const [monologueWhisper, setMonologueWhisper] = useState<string | null>(null);
  const whisperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysHeld = useRef<Set<string>>(new Set());

  // Ref phản chiếu state để vòng lặp RAF đọc được giá trị mới nhất mà không phải khởi động lại
  const interactedRef = useRef<string[]>(localInteractedIds);
  const defibOpenRef = useRef(false);
  const sanityRef = useRef(sanity);
  const promptKeyRef = useRef<string>('');
  const simRef = useRef<SimState | null>(null);

  useEffect(() => { interactedRef.current = localInteractedIds; }, [localInteractedIds]);
  useEffect(() => { defibOpenRef.current = isDefibMinigameOpen; }, [isDefibMinigameOpen]);
  useEffect(() => { sanityRef.current = sanity; }, [sanity]);

  // Web Audio Context
  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  /** Phát một nốt oscillator ngắn (dùng chung cho mọi hiệu ứng âm thanh) */
  const playTone = useCallback(
    (type: OscillatorType, freqs: Array<[number, number, 'set' | 'ramp']>, gain: number, dur: number) => {
      if (volume <= 0) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        for (const [f, at, mode] of freqs) {
          if (mode === 'set') osc.frequency.setValueAtTime(f, t + at);
          else osc.frequency.exponentialRampToValueAtTime(f, t + at);
        }
        g.gain.setValueAtTime((volume / 100) * gain, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
      } catch {}
    },
    [getAudioContext, volume],
  );

  // Tiếng bước chân (gỗ ở phòng trọ, gạch men ướt ở ICU)
  const playStepSound = useCallback(() => {
    const p = playerRef.current;
    const onTile = p.x > seamXAt(p.y + 16);
    const base = onTile ? 170 : 120;
    playTone('triangle', [[base + Math.random() * 30, 0, 'set'], [45, 0.04, 'ramp']], 0.025, 0.04);
  }, [playTone]);

  // Tiếng bíp máy đo điện tim ICU
  const playHeartMonitorBeep = useCallback(() => {
    playTone('sine', [[987.77, 0, 'set'], [880, 0.09, 'ramp']], 0.04, 0.09);
  }, [playTone]);

  // Tiếng rè rè Glitch nhiễu sóng khi chạm vào vật thể
  const playGlitchBuzz = useCallback(() => {
    playTone('sawtooth', [[80, 0, 'set'], [260, 0.03, 'set'], [60, 0.07, 'set']], 0.06, 0.15);
  }, [playTone]);

  // Giữ phiên bản mới nhất của các hàm âm thanh cho vòng lặp RAF
  const soundRef = useRef({ playStepSound, playHeartMonitorBeep });
  useEffect(() => {
    soundRef.current = { playStepSound, playHeartMonitorBeep };
  }, [playStepSound, playHeartMonitorBeep]);

  // Đồng bộ interactedIds từ parent (điều chỉnh state ngay trong render thay vì effect)
  const [prevInteractedIds, setPrevInteractedIds] = useState(interactedIds);
  if (interactedIds !== prevInteractedIds) {
    setPrevInteractedIds(interactedIds);
    setLocalInteractedIds(interactedIds);
  }

  const showMonologueWhisper = useCallback((msg: string) => {
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    setMonologueWhisper(msg);
    whisperTimerRef.current = setTimeout(() => {
      setMonologueWhisper(null);
    }, 4500);
  }, []);

  // Lời tự sự mở màn khi bước vào căn phòng bị xâm thực
  useEffect(() => {
    const timer = setTimeout(() => {
      showMonologueWhisper('Mùi cồn sát trùng và máu tanh xộc vào sống mũi... Căn phòng này đang bị thực tại xé toạc!');
    }, 600);
    return () => {
      clearTimeout(timer);
      if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    };
  }, [showMonologueWhisper]);

  // Preload sprites (Miên được dựng sẵn 3 lớp tint cho chromatic aberration)
  useEffect(() => {
    let cancelled = false;
    const anImg = new Image();
    anImg.src = characterSprite;
    anImg.onload = () => {
      if (!cancelled) spritesRef.current.an = anImg;
    };

    const mienImg = new Image();
    mienImg.src = '/assets/mien_spritesheet.png';
    mienImg.onload = () => {
      if (!cancelled) spritesRef.current.mien = buildMienLayers(mienImg);
    };
    return () => {
      cancelled = true;
    };
  }, [characterSprite]);

  /** Tìm vật thể tương tác gần An nhất trong bán kính cho phép */
  const findNearest = useCallback((): InteractableObject | null => {
    const p = playerRef.current;
    let target: InteractableObject | null = null;
    let minDist = INTERACT_RADIUS;
    for (const obj of INTERACTABLES) {
      const dist = Math.hypot(p.x - (obj.x + obj.w / 2), p.y - (obj.y + obj.h / 2));
      if (dist < minDist) {
        minDist = dist;
        target = obj;
      }
    }
    return target;
  }, []);

  // Lắng nghe bàn phím
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (defibOpenRef.current) return;
      keysHeld.current.add(e.key.toLowerCase());

      // Phím E, Space, Enter để tương tác (bỏ qua auto-repeat khi giữ phím)
      if (e.key.toLowerCase() === 'e' || e.key === ' ' || e.key === 'Enter') {
        if (e.repeat) return;
        const target = findNearest();
        if (!target) return;

        if (target.id === 'ch3_monitor') {
          keysHeld.current.clear();
          setIsDefibMinigameOpen(true);
          return;
        }

        playGlitchBuzz();

        // Chưa đủ manh mối thì Miên né tránh, chưa cho đối chất (không thể đi tắt bỏ qua Màn 3)
        if (target.id === 'ch3_mien') {
          const clues = interactedRef.current.filter(id => CH3_CORE_ANOMALIES.includes(id)).length;
          if (clues < REQUIRED_CLUES) {
            onTrigger('ch3_mien_early');
            return;
          }
        }

        if (!interactedRef.current.includes(target.id)) {
          setLocalInteractedIds((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
          onMarkInteracted?.(target.id);
        }

        onTrigger(target.triggerNodeId);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.current.delete(e.key.toLowerCase());
    };

    // Nhả hết phím khi cửa sổ mất focus để An không bị "trôi"
    const onBlur = () => keysHeld.current.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [findNearest, onMarkInteracted, onTrigger, playGlitchBuzz]);

  // Vòng lặp Game Loop & Vẽ Canvas 2D (chạy một lần, đọc state qua ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const staticLayer = buildStaticLayer();
    const postLayer = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT);
    const lightLayer = document.createElement('canvas');
    lightLayer.width = CANVAS_WIDTH;
    lightLayer.height = CANVAS_HEIGHT;
    if (!simRef.current) simRef.current = createSimState();
    const sim = simRef.current;

    let animId = 0;
    let last = performance.now();
    const start = last;

    const gameLoop = (now: number) => {
      // k = hệ số chuẩn hoá theo 60 FPS → tốc độ như nhau trên màn 60/120/144Hz
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      const t = (now - start) / 1000;
      const p = playerRef.current;
      const keys = keysHeld.current;
      const interacted = interactedRef.current;

      // 1. Di chuyển WASD + va chạm tách trục
      let dx = 0;
      let dy = 0;
      if (!defibOpenRef.current) {
        if (keys.has('w') || keys.has('arrowup')) { dy -= 1; p.dir = 'up'; }
        if (keys.has('s') || keys.has('arrowdown')) { dy += 1; p.dir = 'down'; }
        if (keys.has('a') || keys.has('arrowleft')) { dx -= 1; p.dir = 'left'; }
        if (keys.has('d') || keys.has('arrowright')) { dx += 1; p.dir = 'right'; }
      }
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      if (dx !== 0 || dy !== 0) {
        const nextX = p.x + dx * p.speed * k;
        const nextY = p.y + dy * p.speed * k;

        const canMoveX = !COLLIDERS.some(c =>
          nextX - HITBOX_HALF_W < c.x + c.w &&
          nextX + HITBOX_HALF_W > c.x &&
          p.y - 4 < c.y + c.h &&
          p.y + 6 > c.y
        );
        const canMoveY = !COLLIDERS.some(c =>
          p.x - HITBOX_HALF_W < c.x + c.w &&
          p.x + HITBOX_HALF_W > c.x &&
          nextY - 4 < c.y + c.h &&
          nextY + 6 > c.y
        );

        if (canMoveX) p.x = nextX;
        if (canMoveY) p.y = nextY;

        // Chu kỳ bước 0-1-2-1 (đổi chân mỗi 8 tick), tiếng bước khi chân chạm sàn
        if (stepWalk(p, k)) soundRef.current.playStepSound();
      } else {
        stopWalk(p);
      }

      // 2. Tiến trình & cấp độ xâm thực thực tại
      const clues = interacted.filter(id => CH3_CORE_ANOMALIES.includes(id)).length;
      const phase: 1 | 2 | 3 = clues >= 4 ? 3 : clues >= 2 ? 2 : 1;
      const defibDone = interacted.includes('ch3_monitor');
      const bpm = defibDone ? 72 : 38;

      // Tiếng bíp đồng bộ với đèn LED trên máy sốc tim
      const beatIndex = Math.floor((t * bpm) / 60);
      if (beatIndex !== sim.lastBeat) {
        if (sim.lastBeat >= 0) soundRef.current.playHeartMonitorBeep();
        sim.lastBeat = beatIndex;
      }

      updateSim(sim, k, phase, t);

      // 3. Prompt tương tác: chỉ setState khi thực sự thay đổi (tránh re-render 60 lần/giây)
      const nearest = findNearest();
      const isDone = nearest ? interacted.includes(nearest.id) : false;
      const promptKey = nearest ? `${nearest.id}:${isDone}` : '';
      if (promptKey !== promptKeyRef.current) {
        promptKeyRef.current = promptKey;
        setActivePrompt(nearest ? { text: nearest.actionText, isDone } : null);
      }

      // 4. Vẽ
      const lampFlicker = Math.random() < 0.03 ? 0.35 : 0;
      const fs: FrameState = {
        t,
        phase,
        glitch: Math.min(1, (100 - sanityRef.current) / 100 + (phase - 1) * 0.15),
        clues,
        ready: clues >= REQUIRED_CLUES,
        defibDone,
        bpm,
        interacted: new Set(interacted),
        fluoro: sim.fluoro.level,
        lamp: Math.max(0, 0.6 + Math.sin(t * 2.7) * 0.06 - lampFlicker - (phase - 1) * 0.08),
        player: p,
        nearest,
      };

      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (fs.ready) ctx.translate(Math.round((Math.random() - 0.5) * 2), Math.round((Math.random() - 0.5) * 2));
      ctx.drawImage(staticLayer, 0, 0);
      drawWindow(ctx, fs);
      drawFluorescentTube(ctx, fs);
      drawMirror(ctx, fs);
      drawDoor(ctx, fs);
      drawRift(ctx, fs);
      drawPuddles(ctx, fs, spritesRef.current, sim);
      drawAnomalies(ctx, fs, spritesRef.current, sim);
      drawLightingOverlay(ctx, lightLayer, fs);
      ctx.restore();
      drawPostFX(ctx, canvas, postLayer, fs);
      drawHUD(ctx, fs);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [findNearest]);

  // Đếm manh mối đã khám phá
  const cluesCount = localInteractedIds.filter(id => CH3_CORE_ANOMALIES.includes(id)).length;

  /** Đánh dấu máy sốc tim đã thao tác + kích hoạt node thoại */
  const finishDefib = (success: boolean) => {
    setIsDefibMinigameOpen(false);
    if (!localInteractedIds.includes('ch3_monitor')) {
      setLocalInteractedIds(prev => (prev.includes('ch3_monitor') ? prev : [...prev, 'ch3_monitor']));
      onMarkInteracted?.('ch3_monitor');
    }
    if (success) setSanity?.(prev => Math.min(100, prev + 10));
    onTrigger('obj_ch3_monitor');
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full block bg-black border border-red-950/80 shadow-[0_0_50px_rgba(239,68,68,0.25)] [image-rendering:pixelated]"
        />

        {/* Nút gợi ý tương tác lơ lửng */}
        {activePrompt && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 bg-black/90 border border-red-500 text-red-100 font-mono text-xs rounded-full shadow-[0_0_20px_rgba(239,68,68,0.7)] flex items-center gap-2 animate-bounce">
            <span
              className={`px-1.5 py-0.5 font-bold rounded text-[10px] ${
                activePrompt.isDone ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.9)]'
              }`}
            >
              {activePrompt.isDone ? 'ĐÃ KHÁM PHÁ' : 'E'}
            </span>
            <span>{activePrompt.text}</span>
          </div>
        )}

        {/* Hộp thoại Độc thoại nội tâm */}
        {monologueWhisper && (
          <div
            onClick={() => setMonologueWhisper(null)}
            className="absolute bottom-12 right-3 max-w-xs sm:max-w-sm bg-black/95 border-l-4 border-red-500 border-t border-r border-b border-red-950 p-3 rounded-r shadow-2xl animate-fade-in z-20 backdrop-blur-md cursor-pointer hover:border-red-400 transition-colors"
            title="Click để đóng nhanh"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-red-400 tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block" />
              Độc thoại nội tâm
            </div>
            <p className="text-xs sm:text-sm font-sans text-zinc-300 italic leading-snug">
              &ldquo;{monologueWhisper}&rdquo;
            </p>
          </div>
        )}

        {/* HUD gợi ý điều khiển & Tiến trình Ký ức Chương 3 */}
        <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[11px] font-mono text-zinc-300 bg-black/85 px-3 py-1.5 border border-red-900/60 rounded backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold">[W A S D]</span> Khám phá
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold">Ký ức bệnh viện:</span>
            <span
              className={
                cluesCount >= REQUIRED_CLUES
                  ? 'text-red-400 font-bold animate-pulse'
                  : 'text-zinc-300 font-semibold'
              }
            >
              {cluesCount}/{REQUIRED_CLUES} manh mối
            </span>
            {cluesCount >= REQUIRED_CLUES ? (
              <span className="text-red-400 font-bold hidden sm:inline animate-pulse">
                [ĐÃ TÌM ĐỦ 5 MANH MỐI • HÃY ĐỐI CHẤT VỚI MIÊN!]
              </span>
            ) : (
              <span className="text-zinc-500 hidden sm:inline">
                (Khám phá: giường cấp cứu, máy sốc tim, balo ướt, mảnh gương, bệnh án, đèn xe 115...)
              </span>
            )}
          </div>
          <div className="text-red-500/80 font-bold hidden md:block">
            MÀN 3: SỰ XÂM THẤU CỦA ĐIỂM ẢNH • KHI HIỆN THỰC RÒ RỈ
          </div>
        </div>

        {/* Modal Minigame Sốc Tim ICU (Defibrillator) */}
        {isDefibMinigameOpen && (
          <DefibrillatorMinigame
            volume={volume}
            onComplete={() => finishDefib(true)}
            onClose={() => finishDefib(false)}
          />
        )}
      </div>
    </div>
  );
};
