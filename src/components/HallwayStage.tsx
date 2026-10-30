"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InventoryModal } from './InventoryModal';
import { InventoryItem, CHAPTER_1_ITEMS } from '../types/inventory';
import {
  DORM_PAL, hash, px, block, dropShadow,
  buildPostLayer, drawTargetMarker, drawVitals, drawHudSubtitle,
  createFollowLight, updateFollowLight, drawFollowVignette,
} from './pixel/pixelKit';
import { drawSpriteFrame, getSpriteFrame, stepWalk, stopWalk, bodyBob } from './pixel/spriteKit';
import { useFrameScale } from './pixel/useFrameScale';
import { useMouseParallax } from './pixel/useMouseParallax';
import { useLanguage } from '../context/LanguageContext';
import { EmoteDirector, createEmoteDirector, emoteNow, updateEmotes, drawEmotes } from './pixel/emote';
import { tx } from '../locales/tx';

// --- Kích thước và Tỉ lệ ---
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;


type Direction = 'down' | 'left' | 'right' | 'up';

const DIR_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

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

interface HallwayStageProps {
  characterSprite: string;
  sanity: number;
  setSanity?: React.Dispatch<React.SetStateAction<number>>;
  onTrigger: (nodeId: string) => void;
  onEnterRoom314: () => void;
  interactedIds?: string[];
  onMarkInteracted?: (id: string) => void;
  inventoryIds?: string[];
  onUpdateInventory?: (newInventoryIds: string[]) => void;
  volume?: number;
  /** Khung canvas nghiêng nhẹ theo con trỏ chuột (cài đặt) */
  parallax?: boolean;
}

// =====================================================================
// BỐ CỤC HÀNH LANG TẦNG 3 (khớp chính xác interactables & colliders)
// Khu tập thể cũ: gạch bông, tường vôi vàng ố / chân tường xanh rêu,
// ống nước rỉ sét chạy dọc trần, đèn tuýp huỳnh quang chập chờn.
// =====================================================================

const EMPTY_IDS: string[] = [];
const WALL_H = 145;                              // Chiều cao mảng tường sau (sàn bắt đầu từ y=145)
const FLOOR = { left: 60, top: 145, right: 580, bottom: 420 } as const;
const INTERACT_RADIUS = 75;
const HITBOX_HALF_W = 14;
// Viền tối bám theo An: mất điện thì vùng nhìn thấy hẹp, có điện thì nới rộng
const HALL_VIGNETTE_DARK = { tint: [2, 3, 8], strength: 0.92, inner: 95, outer: 280 } as const;
const HALL_VIGNETTE_LIT = { tint: [2, 3, 8], strength: 0.6, inner: 165, outer: 390 } as const;
const AN_DRAW_W = 42;
const AN_DRAW_H = 63;

const DOOR_314 = { x: 100, y: 65, w: 48, h: 80 };
const DOOR_312 = { x: 230, y: 65, w: 48, h: 80 };
const DOOR_316 = { x: 500, y: 65, w: 48, h: 80 };
const FUSE_BOX = { x: 335, y: 95, w: 36, h: 45 };
const NOTICE_BOARD = { x: 405, y: 80, w: 58, h: 48 };
const EXTINGUISHER = { x: 382, y: 116 };
const CHAIR = { x: 475, y: 140 };
const STAIRS = { x: 12, y: 176, w: 44, h: 116 };
const HALL_WINDOW = { x: 590, y: 160, w: 40, h: 120 };
// 4 cụm đèn tuýp (dài 60px), đóng cầu dao thì bật lần lượt: cầu thang → #314 → #312 → cửa sổ
const TUBES = [64, 150, 262, 506];
const TUBE_Y = 10;
const TUBE_PURPLE = 2;                             // Bóng trước cửa #312: có điện vẫn chớp tím
const TUBE_KICK_DELAY = 0.25;                      // Giây từ lúc CẠCH cầu dao tới bóng đầu tiên bắt sáng
const TUBE_KICK_GAP = 0.18;                        // Mỗi bóng sau bắt sáng trễ hơn bóng trước

// Gương cầu lồi bắt góc cầu thang & đồng hồ tròn kẹt giờ giữa cửa #314 và #312
const HALL_MIRROR = { x: 44, y: 156, r: 11 };
const HALL_CLOCK = { x: 210, y: 60, r: 9 };
const CLOCK_STUCK_SEC = 47;

// Bóng ma quay lưng đứng trước cửa #312 lúc mất điện; An lại gần thì tan biến (một lần mỗi ván)
const GHOST_FEET = { x: 266, y: 172 };
const GHOST_VANISH_DIST = 110;
const GHOST_FLAG = 'shadow_vanished';
const GHOST_FADE_SEC = 0.45;

// Tiếng bước chân ướt từ cầu thang tiến lại sau lưng khi An đứng ở hộp cầu dao trong bóng tối
const STALKER_IDLE_SEC = 1.0;
const STALKER_STEPS = 6;
const STALKER_FLAG = 'hall_stalker_heard';

// Vật cản hành lang (giữ nguyên bản gốc)
const COLLIDERS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  // Tường trên
  { x: 0, y: 0, w: CANVAS_WIDTH, h: 145 },
  // Tường dưới
  { x: 0, y: CANVAS_HEIGHT - 60, w: CANVAS_WIDTH, h: 60 },
  // Tường trái / Cầu thang
  { x: 0, y: 0, w: 60, h: CANVAS_HEIGHT },
  // Tường phải / Cửa sổ
  { x: CANVAS_WIDTH - 60, y: 0, w: 60, h: CANVAS_HEIGHT },
  // Bình chữa cháy
  { x: 380, y: 135, w: 18, h: 25 },
  // Ghế nhựa cũ
  { x: 475, y: 140, w: 22, h: 25 },
];

// Vũng nước rò rỉ trên sàn (phản chiếu bóng An)
const PUDDLES: ReadonlyArray<{ x: number; y: number; rx: number; ry: number }> = [
  { x: 300, y: 260, rx: 45, ry: 16 },
  { x: 470, y: 310, rx: 30, ry: 10 },
  { x: 160, y: 360, rx: 26, ry: 8 },
];

// =====================================================================
// KIỂU DỮ LIỆU VÒNG LẶP
// =====================================================================

interface PlayerState {
  x: number;
  y: number;
  speed: number;
  dir: Direction;
  frame: number;
  isMoving: boolean;
  animTimer: number;
}

/** Ảnh chụp state React mới nhất cho vòng lặp RAF */
interface HallSnapshot {
  sanity: number;
  interacted: string[];
  inventory: string[];
  inventoryOpen: boolean;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }
interface Ripple { x: number; y: number; r: number; max: number }
interface Dust { x: number; y: number; vx: number; vy: number; phase: number }
interface TubeState { level: number; burst: number; dark: number }
interface Footprint { x: number; y: number; left: boolean; born: number }
type GhostState = 'pending' | 'standing' | 'glitch' | 'fading' | 'gone';
interface Ghost { state: GhostState; at: number; glitchFrames: number; tinted: HTMLCanvasElement | null }
type StalkerState = 'idle' | 'walking' | 'behind' | 'done';
interface Stalker { state: StalkerState; still: number; step: number; nextAt: number; dir: Direction; doneAt: number; prints: Footprint[] }

interface HallSim {
  tubes: TubeState[];
  sparks: Particle[];
  ripples: Ripple[];
  dust: Dust[];
  lightning: number;
  nextLightning: number;
  secondFlashAt: number;
  thunderAt: number;
  nextTyping: number;
  shake: number;
  prevPower: boolean | null;
  tubeOnAt: number[];      // Giờ bắt sáng của từng bóng sau khi đóng cầu dao (-1: đã sáng / không có)
  clockBack: boolean;      // Kim giây đang giật lùi một nấc
  nextClockTick: number;
  ghost: Ghost;
  stalker: Stalker;
}

interface HallFrame {
  t: number;
  sanity: number;
  powerOn: boolean;
  pendantHere: boolean;    // Mặt dây chuyền còn nằm dưới khe cửa #316
  hasFuseItem: boolean;    // Có Băng dính / Kẹp ghim để nối cầu chì
  lightning: number;
  tubes: number[];         // Độ sáng từng bóng tuýp 0..1
  clockSec: number;        // Vị trí kim giây đồng hồ kẹt giờ
  player: PlayerState;
  nearest: InteractableObject | null;
  snap: HallSnapshot;
}

interface HallSprites { an: HTMLImageElement | null; mien: HTMLImageElement | null }

/** Kiểm tra trạng thái đã hoàn thành (logic giữ nguyên bản gốc) */
const isTargetDoneFor = (targetId: string, s: HallSnapshot): boolean => {
  if (targetId === 'fuse_box') return s.interacted.includes('hallway_power_on');
  if (targetId === 'door_316') return s.inventory.includes('miens_pendant') || s.interacted.includes('door_316_picked');
  return s.interacted.includes(targetId);
};

/** Nội dung thanh gợi ý [E] (giữ nguyên văn bản gốc) */
const computePrompt = (target: InteractableObject, s: HallSnapshot): { text: string; isDone: boolean } => {
  const isPowerOn = s.interacted.includes('hallway_power_on');
  const inv = s.inventory;
  if (target.id === 'door_314') {
    return { text: 'Cửa Phòng #314 - Nhấn [E] quay trở lại phòng trọ của bạn [🚪]', isDone: false };
  }
  if (target.id === 'fuse_box') {
    if (isPowerOn) return { text: 'Hộp Cầu Dao Tổng [ĐÃ ĐÓNG ĐIỆN - ĐÈN SÁNG] - Nhấn [E] xem', isDone: true };
    if (inv.includes('electrical_tape') || inv.includes('paperclip')) {
      return { text: 'Hộp Cầu Dao [CÓ THỂ NỐI CẦU CHÌ ⚡] - Nhấn [E] để bật điện', isDone: false };
    }
    return { text: 'Hộp Cầu Dao [MẤT ĐIỆN HÀNH LANG] - Cần vật dẫn điện (Băng dính / Kẹp ghim)', isDone: false };
  }
  if (target.id === 'door_316') {
    const hasPendant = inv.includes('miens_pendant') || inv.includes('medical_report') || s.interacted.includes('door_316_picked');
    return {
      text: hasPendant
        ? 'Cửa Phòng #316 [ĐÃ TRẢ PHÒNG] - Nhấn [E] xem'
        : 'Cửa Phòng #316 (Phòng Miên) [LẤP LÁNH KHE CỬA ✨] - Nhấn [E] nhặt Mặt Dây Chuyền',
      isDone: hasPendant,
    };
  }
  if (target.id === 'notice_board') {
    return {
      text: isPowerOn
        ? 'Bảng Tin Cư Dân [ĐÃ RỌI SÁNG 💡] - Nhấn [E] đọc Thiệp Kỷ Niệm (Mật Mã 17/05)'
        : 'Bảng Tin Cư Dân [TỐI OM] - Nhấn [E] soi (Cần bật cầu dao điện neon)',
      isDone: isPowerOn,
    };
  }
  return { text: target.actionText, isDone: isTargetDoneFor(target.id, s) };
};

// =====================================================================
// LỚP NỀN TĨNH (dựng một lần)
// =====================================================================

/** Sàn gạch bông xi măng cổ điển: hoa văn 4 cánh bạc màu, ron đen, nứt vỡ, vệt nước */
function drawTileFloor(ctx: CanvasRenderingContext2D) {
  const size = 28;
  for (let y = FLOOR.top, r = 0; y < CANVAS_HEIGHT; y += size, r++) {
    for (let x = FLOOR.left, c = 0; x < FLOOR.right; x += size, c++) {
      const h = hash(r * 41 + c * 17);
      const even = (r + c) % 2 === 0;
      px(ctx, x, y, size, size, '#1c1f1d');                                    // Ron gạch
      px(ctx, x + 1, y + 1, size - 2, size - 2, even ? '#5d5a4c' : '#3f4a43');
      const cx = x + size / 2;
      const cy = y + size / 2;
      // Hoa văn gạch bông: bông 4 cánh + chấm góc
      const petal = even ? 'rgba(150,110,60,0.55)' : 'rgba(180,170,140,0.35)';
      px(ctx, cx - 1, y + 4, 2, size - 8, petal);
      px(ctx, x + 4, cy - 1, size - 8, 2, petal);
      px(ctx, cx - 4, cy - 4, 8, 8, even ? 'rgba(120,60,40,0.5)' : 'rgba(90,110,90,0.5)');
      px(ctx, cx - 2, cy - 2, 4, 4, 'rgba(220,200,160,0.35)');
      for (const [ox, oy] of [[2, 2], [size - 5, 2], [2, size - 5], [size - 5, size - 5]]) {
        px(ctx, x + ox, y + oy, 3, 3, petal);
      }
      px(ctx, x + 1, y + 1, size - 2, 1, 'rgba(255,255,255,0.07)');
      // Gạch mẻ / nứt
      if (h > 0.8) {
        ctx.strokeStyle = 'rgba(10,10,10,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 3 + h * 10, y + 1);
        ctx.lineTo(x + 12, y + 13);
        ctx.lineTo(x + 9, y + size - 1);
        ctx.stroke();
      }
      if (h < 0.08) px(ctx, x + 18, y + 4, 6, 4, '#1c1f1d');                 // Mẻ góc
    }
  }
  // Vệt nước rỉ loang khô (ố vàng)
  ctx.fillStyle = 'rgba(70,60,30,0.25)';
  for (const [ex, ey, erx, ery] of [[240, 200, 70, 22], [520, 380, 50, 14], [120, 300, 40, 12]]) {
    ctx.beginPath();
    ctx.ellipse(ex, ey, erx, ery, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tối dần sát chân tường (ambient occlusion)
  const ao = ctx.createLinearGradient(0, FLOOR.top, 0, FLOOR.top + 26);
  ao.addColorStop(0, 'rgba(0,0,0,0.55)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(FLOOR.left, FLOOR.top, FLOOR.right - FLOOR.left, 26);
}

/** Tường sau: vôi vàng ố phía trên, sơn xanh rêu chân tường, mảng tróc lộ gạch đỏ */
function drawBackWall(ctx: CanvasRenderingContext2D) {
  // Vôi vàng ố
  px(ctx, 0, 0, CANVAS_WIDTH, WALL_H, '#8a7a4e');
  for (let i = 0; i < 70; i++) {
    px(ctx, hash(i * 3) * CANVAS_WIDTH, 30 + hash(i * 5) * 60, 2 + hash(i) * 6, 1, 'rgba(60,50,25,0.35)'); // Vết ố
  }
  // Vệt nước rỉ chảy dọc từ ống
  for (const sx of [70, 205, 312, 470, 560]) {
    const g = ctx.createLinearGradient(0, 30, 0, 110);
    g.addColorStop(0, 'rgba(60,45,20,0.55)');
    g.addColorStop(1, 'rgba(60,45,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, 30, 7, 80);
  }
  // Chân tường sơn xanh rêu (dado) + nẹp chỉ
  px(ctx, 0, 100, CANVAS_WIDTH, WALL_H - 100, '#3c5244');
  for (let x = 0; x < CANVAS_WIDTH; x += 3) px(ctx, x, 100 + (x % 9 === 0 ? 1 : 0), 1, 1, 'rgba(0,0,0,0.25)');
  px(ctx, 0, 98, CANVAS_WIDTH, 3, '#2a3a30');
  px(ctx, 0, 98, CANVAS_WIDTH, 1, '#5e7a66');
  // Mốc đen loang chân tường
  for (let i = 0; i < 90; i++) {
    px(ctx, hash(i * 7) * CANVAS_WIDTH, WALL_H - 4 - hash(i * 11) * 22, 1 + hash(i) * 2, 1, 'rgba(15,22,15,0.6)');
  }
  // Mảng sơn tróc lộ gạch đỏ
  const brickPatch = (bx: number, by: number, bw: number, bh: number) => {
    px(ctx, bx - 1, by - 1, bw + 2, bh + 2, '#4a3f2a');
    for (let ry = 0, row = 0; ry < bh; ry += 5, row++) {
      for (let rx = row % 2 === 0 ? 0 : -5; rx < bw; rx += 10) {
        const x0 = Math.max(bx, bx + rx);
        const w0 = Math.min(9, bx + bw - x0, bx + rx + 9 - x0);
        if (w0 > 0) px(ctx, x0, by + ry, w0, Math.min(4, bh - ry), hash(rx + ry * 3 + bx) > 0.5 ? '#8a3b26' : '#9b4630');
      }
    }
  };
  brickPatch(165, 44, 30, 22);
  brickPatch(290, 112, 26, 18);
  brickPatch(468, 40, 22, 16);
  brickPatch(560, 106, 18, 24);
  // Chân tường gạch men đen + mép sàn
  px(ctx, 0, WALL_H - 5, CANVAS_WIDTH, 5, '#141815');
  px(ctx, 0, WALL_H - 5, CANVAS_WIDTH, 1, '#3a4a3e');
  // Mảng trần tối phía trên
  px(ctx, 0, 0, CANVAS_WIDTH, 6, '#0b0c0a');
}

/** Ống nước kim loại rỉ sét chạy dọc trần + dây điện nối hộp cầu dao */
function drawPipes(ctx: CanvasRenderingContext2D) {
  // Ống chính
  px(ctx, 0, 21, CANVAS_WIDTH, 9, '#0c0d0e');
  px(ctx, 0, 22, CANVAS_WIDTH, 7, '#55606a');
  px(ctx, 0, 23, CANVAS_WIDTH, 2, '#8a96a2');
  px(ctx, 0, 27, CANVAS_WIDTH, 2, '#3a424a');
  // Ống phụ nhỏ hơn
  px(ctx, 0, 34, CANVAS_WIDTH, 4, '#0c0d0e');
  px(ctx, 0, 35, CANVAS_WIDTH, 2, '#6b5a48');
  // Mảng rỉ sét
  for (let i = 0; i < 40; i++) {
    px(ctx, hash(i * 13) * CANVAS_WIDTH, 22 + hash(i * 17) * 6, 2 + hash(i) * 5, 2, hash(i * 3) > 0.5 ? '#8a4a1e' : '#6b3414');
  }
  // Khớp nối + đai treo
  for (let x = 80; x < CANVAS_WIDTH; x += 110) {
    block(ctx, x, 18, 6, 14, '#6b7280', '#9ca3af', '#374151');
    px(ctx, x + 1, 6, 4, 12, '#2a2f33');
  }
  // Dây điện từ ống xuống hộp cầu dao
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(345, 37); ctx.quadraticCurveTo(338, 70, 345, 95);
  ctx.moveTo(360, 37); ctx.lineTo(360, 95);
  ctx.stroke();
}

/** Tường bên trái / phải và mép tường dưới */
function drawSideWalls(ctx: CanvasRenderingContext2D) {
  px(ctx, 0, 0, FLOOR.left, CANVAS_HEIGHT, '#14130f');
  px(ctx, FLOOR.right, 0, CANVAS_WIDTH - FLOOR.right, CANVAS_HEIGHT, '#14130f');
  px(ctx, 0, FLOOR.bottom, CANVAS_WIDTH, CANVAS_HEIGHT - FLOOR.bottom, '#14130f');
  px(ctx, FLOOR.left - 3, WALL_H - 5, 3, FLOOR.bottom - WALL_H + 5, '#2c2a22');
  px(ctx, FLOOR.right, WALL_H - 5, 3, FLOOR.bottom - WALL_H + 5, '#2c2a22');
  px(ctx, FLOOR.left - 3, FLOOR.bottom, FLOOR.right - FLOOR.left + 6, 3, '#2c2a22');
}

/** Đồ trang trí tĩnh: biển cấm hút thuốc, số tầng, giấy dán, vết vẽ bậy */
function drawWallDecor(ctx: CanvasRenderingContext2D) {
  // Biển "TẦNG 3"
  block(ctx, 70, 48, 22, 14, '#1e3a8a', '#2b4fae', '#14285e');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#e0e7ff';
  ctx.fillText('T.3', 74, 58);
  // Biển cấm hút thuốc
  block(ctx, 186, 72, 14, 14, '#f5f5f4', '#ffffff', '#a8a29e');
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(193, 79, 5, 0, Math.PI * 2);
  ctx.moveTo(189.5, 75.5); ctx.lineTo(196.5, 82.5);
  ctx.stroke();
  // Giấy quảng cáo "khoan cắt bê tông" dán chồng chất
  for (let i = 0; i < 5; i++) {
    const gx = 292 + i * 7;
    const gy = 58 + (i % 2) * 6;
    block(ctx, gx, gy, 9, 12, i % 2 ? '#e7e5e4' : '#fde68a', '#ffffff', '#a8a29e');
    px(ctx, gx + 1, gy + 3, 7, 1, '#dc2626');
    px(ctx, gx + 1, gy + 6, 6, 1, '#57534e');
  }
  // Vết vẽ bậy "17/05" mờ trên tường
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = 'rgba(120,20,20,0.45)';
  ctx.fillText('17/05', 160, 92);
}

/** Dựng lớp nền tĩnh của hành lang */
function buildHallStaticLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_WIDTH;
  c.height = CANVAS_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  drawTileFloor(ctx);
  drawBackWall(ctx);
  drawPipes(ctx);
  drawWallDecor(ctx);
  drawSideWalls(ctx);
  return c;
}

// =====================================================================
// HÀM VẼ ĐỘNG
// =====================================================================

/** Vẽ sprite An sắc nét (lật ngang khi quay trái) + nhịp nhún bước / thở */
function drawAnSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, p: PlayerState, x: number, y: number, t: number) {
  drawSpriteFrame(ctx, img, p.frame, DIR_ROW[p.dir], p.dir === 'left', x, y + bodyBob(p, t), AN_DRAW_W, AN_DRAW_H);
}

/** Khung cửa gỗ chung cho các phòng (khung, biển số đồng) */
function drawDoorFrame(ctx: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number }, num: string, numColor: string) {
  block(ctx, d.x - 4, d.y - 5, d.w + 8, d.h + 5, '#3b2a1a', '#5a4028', '#24180e');
  px(ctx, d.x - 6, d.y + d.h - 2, d.w + 12, 3, '#1a1510');           // Bậc cửa
  block(ctx, d.x + 12, d.y + 7, 24, 9, '#b88a2c', '#e0b84f', '#7a5a1a');
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = numColor;
  ctx.fillText(num, d.x + 24, d.y + 14);
  ctx.textAlign = 'left';
}

/** Cửa #314 của An: mở hé, ánh CRT xanh lơ hắt ra khe cửa */
function drawDoor314(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const d = DOOR_314;
  drawDoorFrame(ctx, d, '314', '#2a1a05');
  // Lòng phòng phía sau khe hé (sáng xanh lơ)
  const glow = 0.75 + Math.sin(fr.t * 6) * 0.08 + (Math.random() < 0.03 ? -0.3 : 0);
  px(ctx, d.x, d.y + 18, d.w, d.h - 18, '#0a1418');
  px(ctx, d.x + 34, d.y + 18, 14, d.h - 18, `rgba(103,232,249,${glow})`);
  px(ctx, d.x + 38, d.y + 18, 10, d.h - 18, `rgba(207,250,254,${glow * 0.6})`);
  // Cánh cửa xoay hé vào trong (phối cảnh hẹp lại)
  block(ctx, d.x, d.y + 18, 34, d.h - 18, '#5a3a20', '#77502d', '#3b2414');
  block(ctx, d.x + 5, d.y + 24, 24, 20, '#4e311c', '#3b2414', '#67432a');
  block(ctx, d.x + 5, d.y + 50, 24, 22, '#4e311c', '#3b2414', '#67432a');
  px(ctx, d.x + 28, d.y + 48, 3, 3, '#eab308');                       // Tay nắm
  px(ctx, d.x + 33, d.y + 18, 1, d.h - 18, '#24150b');               // Mép cánh cửa
}

/** Cửa #312: quấn xích sắt chằng chịt, ổ khóa rỉ, ánh màn hình xanh ma quái dưới khe */
function drawDoor312(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const d = DOOR_312;
  drawDoorFrame(ctx, d, '312', '#3f3f46');
  block(ctx, d.x, d.y + 18, d.w, d.h - 18, '#2a2622', '#3a3530', '#18150f');
  block(ctx, d.x + 6, d.y + 24, d.w - 12, 20, '#24201c', '#18150f', '#3a3530');
  block(ctx, d.x + 6, d.y + 50, d.w - 12, 22, '#24201c', '#18150f', '#3a3530');
  // Vết cào xước
  ctx.strokeStyle = 'rgba(200,190,170,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { ctx.moveTo(d.x + 10 + i * 3, d.y + 28); ctx.lineTo(d.x + 14 + i * 3, d.y + 42); }
  ctx.stroke();
  // Xích sắt: chuỗi mắt xích chéo hình X
  const chain = (x1: number, y1: number, x2: number, y2: number) => {
    const n = 11;
    for (let i = 0; i <= n; i++) {
      const cx = x1 + ((x2 - x1) * i) / n;
      const cy = y1 + ((y2 - y1) * i) / n;
      if (i % 2 === 0) block(ctx, cx - 2, cy - 1, 5, 3, '#4b5563', '#9ca3af', '#1f2937');
      else block(ctx, cx - 1, cy - 2, 3, 5, '#374151', '#6b7280', '#111827');
    }
  };
  chain(d.x - 3, d.y + 30, d.x + d.w + 3, d.y + 62);
  chain(d.x - 3, d.y + 62, d.x + d.w + 3, d.y + 30);
  // Ổ khóa rỉ sét ở giao điểm
  block(ctx, d.x + 19, d.y + 44, 10, 10, '#a16207', '#ca8a04', '#713f12');
  px(ctx, d.x + 21, d.y + 40, 6, 4, '#57534e');
  px(ctx, d.x + 23, d.y + 48, 2, 3, '#1c1917');
  px(ctx, d.x + 20, d.y + 52, 4, 2, '#7c2d12');                       // Rỉ
  // Ánh màn hình xanh lục chớp dưới khe cửa (tiếng gõ phím ma quái)
  const typing = Math.sin(fr.t * 23) > 0.2 && Math.sin(fr.t * 1.3) > -0.2;
  px(ctx, d.x + 2, d.y + d.h - 1, d.w - 4, 2, typing ? 'rgba(74,222,128,0.75)' : 'rgba(20,83,45,0.6)');
}

/** Cửa #316 phòng cũ của Miên: hai dải giấy trả phòng ố vàng của chủ trọ dán chéo, mặt dây chuyền lấp lánh dưới khe */
function drawDoor316(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const d = DOOR_316;
  drawDoorFrame(ctx, d, '316', '#991b1b');
  block(ctx, d.x, d.y + 18, d.w, d.h - 18, '#4a3326', '#5e4232', '#2c1d14');
  block(ctx, d.x + 6, d.y + 24, d.w - 12, 20, '#3e2a1f', '#2c1d14', '#5e4232');
  block(ctx, d.x + 6, d.y + 50, d.w - 12, 22, '#3e2a1f', '#2c1d14', '#5e4232');
  px(ctx, d.x + d.w - 9, d.y + 48, 3, 3, '#a8a29e');
  // Hai dải giấy ố vàng dán chéo qua khe cửa (chủ trọ khoá phòng sau khi Miên dọn đi)
  const strip = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    px(ctx, 0, -3, len, 6, DORM_PAL.outline);
    px(ctx, 0, -2, len, 4, '#d6c9a0');
    for (let i = 3; i < len - 3; i += 5) px(ctx, i, -1, 3, 1, 'rgba(90,70,40,0.5)'); // Chữ viết tay mờ
    px(ctx, 0, -2, 3, 4, 'rgba(120,90,40,0.45)');                      // Mép hồ dán ố
    px(ctx, len - 3, -2, 3, 4, 'rgba(120,90,40,0.45)');
    ctx.restore();
  };
  strip(d.x + 2, d.y + 26, d.x + d.w - 2, d.y + 70);
  strip(d.x + 2, d.y + 70, d.x + d.w - 2, d.y + 26);
  // Tờ thông báo trả phòng đóng dấu đỏ
  block(ctx, d.x + 11, d.y + 42, 26, 11, '#e7dfc4', '#f5efdc', '#a8a08a');
  ctx.font = 'bold 4px monospace';
  ctx.fillStyle = '#b91c1c';
  ctx.fillText(tx('ĐÃ TRẢ'), d.x + 15, d.y + 48);
  px(ctx, d.x + 14, d.y + 50, 20, 1, 'rgba(185,28,28,0.6)');
  // Đốm sáng lấp lánh dưới khe cửa: Mặt Dây Chuyền Bạc của Miên
  if (fr.pendantHere) {
    const tw = (Math.sin(fr.t * 4.2) + 1) / 2;
    px(ctx, d.x + 18, d.y + d.h - 2, 10, 3, `rgba(226,232,240,${0.5 + tw * 0.4})`);
    if (tw > 0.5) {
      const a = (tw - 0.5) * 2;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(d.x + 24, d.y + d.h - 6, 1, 9);
      ctx.fillRect(d.x + 20, d.y + d.h - 2, 9, 1);
    }
  }
}

/** Hộp cầu dao tổng: sắt gỉ, tia sét vàng, LED đỏ/xanh, tia lửa lách tách khi mất điện */
function drawFuseBox(ctx: CanvasRenderingContext2D, fr: HallFrame, sparks: Particle[]) {
  const { x, y, w, h } = FUSE_BOX;
  block(ctx, x, y, w, h, '#5b636b', '#7c858e', '#2f353b');
  block(ctx, x + 3, y + 3, w - 6, h - 6, '#4b535b', '#5b636b', '#353b41');
  // Rỉ sét loang
  for (let i = 0; i < 14; i++) px(ctx, x + 3 + hash(i * 7) * (w - 8), y + 3 + hash(i * 13) * (h - 8), 2 + hash(i) * 3, 2, hash(i * 5) > 0.5 ? '#8a4a1e' : '#6b3414');
  px(ctx, x + 6, y + h - 6, w - 12, 3, 'rgba(110,52,20,0.8)');
  // Bản lề
  px(ctx, x - 1, y + 7, 2, 5, '#9ca3af');
  px(ctx, x - 1, y + h - 12, 2, 5, '#9ca3af');
  // Tam giác cảnh báo vàng + tia sét đen (vẽ pixel, không dùng emoji)
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 7); ctx.lineTo(x + w / 2 + 9, y + 23); ctx.lineTo(x + w / 2 - 9, y + 23);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(x + w / 2 + 1, y + 11); ctx.lineTo(x + w / 2 - 3, y + 17); ctx.lineTo(x + w / 2, y + 17);
  ctx.lineTo(x + w / 2 - 2, y + 22); ctx.lineTo(x + w / 2 + 3, y + 15); ctx.lineTo(x + w / 2, y + 15);
  ctx.closePath();
  ctx.fill();
  // Cần gạt cầu dao: gạt xuống (mất điện) / gạt lên (đã đóng)
  px(ctx, x + 7, y + 27, 8, 12, '#1f2937');
  px(ctx, x + 9, fr.powerOn ? y + 27 : y + 33, 4, 6, fr.powerOn ? '#22c55e' : '#9ca3af');
  // Đèn LED chỉ báo
  const led = fr.powerOn ? '#10b981' : Math.sin(fr.t * 8) > 0 ? '#ef4444' : '#7f1d1d';
  px(ctx, x + 23, y + 30, 6, 6, '#111');
  px(ctx, x + 24, y + 31, 4, 4, led);
  ctx.font = '4px monospace';
  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(tx('CẦU DAO'), x + 18, y + 42);
  // Viền vàng nhấp nháy khi đã có Băng dính / Kẹp ghim để nối cầu chì
  if (!fr.powerOn && fr.hasFuseItem && Math.sin(fr.t * 6) > 0) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
  }
  // Tia lửa điện lách tách
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
    px(ctx, s.x, s.y, 1 + (s.life > s.maxLife * 0.6 ? 1 : 0), 1, s.color);
  }
  ctx.globalAlpha = 1;
}

/** Bình chữa cháy đỏ treo tường */
function drawExtinguisher(ctx: CanvasRenderingContext2D) {
  const { x, y } = EXTINGUISHER;
  px(ctx, x - 2, y + 6, 16, 3, '#374151');                           // Giá treo
  block(ctx, x, y + 4, 12, 26, '#dc2626', '#f87171', '#7f1d1d');
  px(ctx, x + 3, y, 6, 5, '#e5e7eb');
  px(ctx, x + 4, y - 3, 4, 3, '#18181b');
  px(ctx, x + 9, y + 1, 5, 2, '#18181b');                             // Vòi
  px(ctx, x + 13, y + 2, 2, 12, '#18181b');
  block(ctx, x + 3, y + 12, 6, 7, '#f5f5f4', '#ffffff', '#a8a29e');  // Nhãn
  px(ctx, x + 5, y + 14, 2, 2, '#16a34a');                            // Đồng hồ áp suất
}

/** Bảng tin cư dân: bảng nỉ xanh, giấy cũ, tờ đỏ "TÌM NGƯỜI MẤT TÍCH 17/05", thư hồng của Miên */
function drawNoticeBoard(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const { x, y, w, h } = NOTICE_BOARD;
  block(ctx, x, y, w, h, '#78350f', '#a0521a', '#4a2108');
  px(ctx, x + 3, y + 3, w - 6, h - 6, '#1e3a5f');
  for (let i = 0; i < 30; i++) px(ctx, x + 3 + hash(i * 3) * (w - 6), y + 3 + hash(i * 7) * (h - 6), 1, 1, 'rgba(255,255,255,0.08)');
  // Giấy cũ ố vàng (thông báo tiền điện nước)
  block(ctx, x + 6, y + 6, 15, 19, '#d6cfb8', '#ece6d2', '#a59f88');
  for (let i = 0; i < 5; i++) px(ctx, x + 8, y + 10 + i * 3, 11 - (i % 2) * 3, 1, '#6b6455');
  block(ctx, x + 38, y + 25, 14, 17, '#e5e5e5', '#f5f5f5', '#a3a3a3');
  for (let i = 0; i < 4; i++) px(ctx, x + 40, y + 29 + i * 3, 10, 1, '#737373');
  // Tờ giấy đỏ TÌM NGƯỜI MẤT TÍCH 17/05
  block(ctx, x + 23, y + 5, 18, 21, '#b91c1c', '#ef4444', '#7f1d1d');
  px(ctx, x + 26, y + 9, 12, 8, '#fca5a5');                          // Ảnh chân dung mờ
  px(ctx, x + 30, y + 10, 4, 4, '#7f1d1d');
  ctx.font = 'bold 3px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(tx('MẤT TÍCH'), x + 24, y + 21);
  ctx.fillText('17/05', x + 27, y + 25);
  // Thư kỷ niệm hồng của Miên (dán chéo) + trái tim
  ctx.save();
  ctx.translate(x + 15, y + 34);
  ctx.rotate(-0.12);
  block(ctx, -9, -6, 20, 13, '#f9a8d4', '#fbcfe8', '#db2777');
  ctx.strokeStyle = '#db2777';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, -6); ctx.lineTo(1, 1); ctx.lineTo(11, -6);
  ctx.stroke();
  px(ctx, -1, 1, 2, 2, '#e11d48');
  px(ctx, 1, 1, 2, 2, '#e11d48');
  px(ctx, 0, 3, 2, 1, '#e11d48');
  ctx.restore();
  // Ghim bấm
  for (const [gx, gy, col] of [[x + 13, y + 6, '#ef4444'], [x + 32, y + 5, '#facc15'], [x + 45, y + 25, '#3b82f6'], [x + 15, y + 28, '#22c55e']] as Array<[number, number, string]>) {
    px(ctx, gx, gy, 2, 2, col);
  }
  // Tối om khi mất điện: giấy gần như không đọc được
  if (!fr.powerOn) px(ctx, x + 3, y + 3, w - 6, h - 6, 'rgba(5,8,14,0.55)');
}

/** Cầu thang thoát hiểm bị rào chắn glitch đỏ BLOCKED */
function drawStairs(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const { x, y, w, h } = STAIRS;
  block(ctx, x, y, w, h, '#2a2620', '#3d382e', '#14120e');
  // Lòng cầu thang tối dần xuống tầng 2
  for (let i = 0; i < 8; i++) {
    const sy = y + 6 + i * 13;
    const shade = Math.max(0, 70 - i * 9);
    px(ctx, x + 4, sy, w - 8, 12, `rgb(${shade},${shade - 4 > 0 ? shade - 4 : 0},${shade - 10 > 0 ? shade - 10 : 0})`);
    px(ctx, x + 4, sy, w - 8, 1, `rgba(255,255,255,${0.12 - i * 0.012})`);
  }
  // Tay vịn sắt
  px(ctx, x + w - 6, y + 4, 2, h - 8, '#4b5563');
  // Băng rào chắn chéo vàng đen
  ctx.save();
  ctx.translate(x - 2, y + 22);
  ctx.rotate(1.05);
  px(ctx, 0, -3, 90, 6, '#facc15');
  for (let i = 0; i < 90; i += 8) px(ctx, i, -3, 4, 6, '#111');
  ctx.restore();
  ctx.save();
  ctx.translate(x - 2, y + 70);
  ctx.rotate(0.85);
  px(ctx, 0, -3, 60, 6, '#facc15');
  for (let i = 0; i < 60; i += 8) px(ctx, i, -3, 4, 6, '#111');
  ctx.restore();
  // Rào glitch đỏ: các khối pixel nhảy múa
  for (let i = 0; i < 10; i++) {
    const seed = Math.floor(fr.t * 10) * 13 + i * 7;
    const gx = x + 2 + hash(seed) * (w - 6);
    const gy = y + 2 + hash(seed + 1) * (h - 6);
    px(ctx, gx, gy, 2 + hash(seed + 2) * 8, 2, hash(seed + 3) > 0.3 ? 'rgba(239,68,68,0.85)' : 'rgba(34,211,238,0.7)');
  }
  // Đường quét ngang đỏ
  px(ctx, x + 2, y + ((fr.t * 40) % h), w - 4, 1, 'rgba(248,113,113,0.8)');
  // Biển BLOCKED
  const blink = Math.sin(fr.t * 7) > -0.3;
  block(ctx, x + 4, y + 10, w - 8, 11, blink ? '#dc2626' : '#7f1d1d', '#ef4444', '#450a0a');
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('BLOCKED', x + w / 2, y + 18);
  ctx.textAlign = 'left';
}

/** Cửa sổ kính lớn cuối hành lang: mưa xối xả, giọt chảy trên kính, chớp xanh lạnh */
function drawHallWindow(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const { x, y, w, h } = HALL_WINDOW;
  block(ctx, x - 4, y - 4, w + 8, h + 8, '#3a3f45', '#5b636b', '#1f2327');
  const L = fr.lightning;
  px(ctx, x, y, w, h, L > 0.05 ? `rgb(${Math.min(255, 60 + L * 180)},${Math.min(255, 70 + L * 175)},${Math.min(255, 110 + L * 145)})` : '#060912');
  // Tia chớp rạch ngang bầu trời đêm ngoài cửa sổ hành lang
  if (L > 0.5) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, L * 1.3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.45, y + 4);
    ctx.lineTo(x + w * 0.58, y + h * 0.3);
    ctx.lineTo(x + w * 0.42, y + h * 0.5);
    ctx.lineTo(x + w * 0.65, y + h * 0.8);
    ctx.stroke();
  }
  // Bóng toà nhà đối diện
  px(ctx, x, y + 70, w, h - 70, L > 0.05 ? '#1e2233' : '#03050a');
  px(ctx, x + 6, y + 58, 14, 12, L > 0.05 ? '#1e2233' : '#03050a');
  px(ctx, x + 10, y + 80, 3, 3, '#facc15');
  px(ctx, x + 26, y + 92, 3, 3, 'rgba(250,204,21,0.5)');
  // Mưa xối xả
  ctx.strokeStyle = 'rgba(186,220,253,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const rx = x + ((i * 7 + fr.t * 50) % w);
    const ry = y + ((i * 29 + fr.t * 300) % h);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 3, ry + 8);
  }
  ctx.stroke();
  // Giọt nước chảy dọc mặt kính
  for (let i = 0; i < 5; i++) {
    const dy = y + ((fr.t * (10 + i * 4) + i * 31) % (h - 8));
    px(ctx, x + 4 + i * 8, dy, 1, 4, 'rgba(220,235,255,0.75)');
    px(ctx, x + 4 + i * 8, dy - 6, 1, 6, 'rgba(220,235,255,0.25)');
  }
  // Song cửa
  px(ctx, x + w / 2 - 1, y, 3, h, '#2a2f35');
  px(ctx, x, y + 58, w, 3, '#2a2f35');
  px(ctx, x - 4, y + h + 2, w + 8, 3, '#5b636b');                    // Bậu cửa
  // Ánh sét hắt qua bậu xuống sàn
  if (L > 0.05) px(ctx, x - 6, y, 2, h, `rgba(200,220,255,${L * 0.6})`);
}

/** Bóng đèn tuýp huỳnh quang trên tường: sáng vàng trắng hoặc chớp tím/xanh rè rè */
function drawTubes(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  TUBES.forEach((tx, i) => {
    const lv = fr.tubes[i];
    block(ctx, tx - 2, TUBE_Y - 2, 64, 8, '#4b5563', '#6b7280', '#1f2937');
    let tube: string;
    if (fr.powerOn) {
      if (lv < 0.05) tube = '#2a2f36';                                   // Chưa tới lượt bắt sáng
      else if (i === TUBE_PURPLE && lv < 0.9) tube = '#c4b5fd';          // Bóng #312 chớp tím
      else tube = lv > 0.6 ? '#fffbe8' : '#c9c3a8';
    } else tube = lv > 0.5 ? (Math.random() < 0.5 ? '#c4b5fd' : '#a5f3fc') : '#2a2f36';
    px(ctx, tx, TUBE_Y, 60, 3, tube);
    if (lv > 0.6) px(ctx, tx, TUBE_Y, 60, 1, '#ffffff');
    px(ctx, tx, TUBE_Y, 4, 3, '#1c1f24');
    px(ctx, tx + 56, TUBE_Y, 4, 3, '#1c1f24');
    // Tia hồ quang tím/xanh khi chập chờn lúc mất điện
    if (!fr.powerOn && lv > 0.5) {
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(196,181,253,0.9)' : 'rgba(165,243,252,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let ax = tx + 4 + Math.random() * 10;
      ctx.moveTo(ax, TUBE_Y + 3);
      for (let k = 0; k < 4; k++) {
        ax += 3 + Math.random() * 6;
        ctx.lineTo(ax, TUBE_Y + 3 + Math.random() * 7);
      }
      ctx.stroke();
    }
  });
}

/** Ghế nhựa xanh gãy chân nghiêng ngả */
function drawChair(ctx: CanvasRenderingContext2D) {
  const { x, y } = CHAIR;
  dropShadow(ctx, x + 11, y + 25, 13, 3.5);
  ctx.save();
  ctx.translate(x + 11, y + 14);
  ctx.rotate(0.12);
  block(ctx, -9, -14, 18, 10, '#0369a1', '#0ea5e9', '#075985');       // Lưng ghế
  for (let i = -6; i < 8; i += 4) px(ctx, i, -12, 2, 6, '#075985');
  block(ctx, -10, -3, 20, 6, '#0284c7', '#38bdf8', '#075985');        // Mặt ghế
  px(ctx, -9, 3, 3, 9, '#0369a1');                                    // Chân lành
  px(ctx, 6, 3, 3, 5, '#0369a1');                                     // Chân gãy cụt
  px(ctx, 6, 8, 3, 1, '#7dd3fc');
  ctx.restore();
  // Mẩu chân ghế gãy văng trên sàn
  ctx.save();
  ctx.translate(x - 4, y + 27);
  ctx.rotate(-0.9);
  px(ctx, 0, 0, 3, 7, '#0369a1');
  ctx.restore();
}

/** Vũng nước đọng: phản chiếu bóng An + ánh đèn, gợn sóng khi giọt rò rỉ rơi xuống */
function drawPuddles(ctx: CanvasRenderingContext2D, fr: HallFrame, sprites: HallSprites, ripples: Ripple[]) {
  const p = fr.player;
  for (const pd of PUDDLES) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pd.x, pd.y, pd.rx, pd.ry, 0, 0, Math.PI * 2);
    ctx.ellipse(pd.x + pd.rx * 0.5, pd.y + pd.ry * 0.3, pd.rx * 0.45, pd.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(12,20,30,0.7)';
    ctx.fillRect(pd.x - pd.rx * 1.2, pd.y - pd.ry * 1.5, pd.rx * 2.4, pd.ry * 3);
    // Phản chiếu bóng An (lật dọc quanh mép chân)
    const near = Math.abs(p.x - pd.x) < pd.rx + 30 && p.y + 16 < pd.y + pd.ry + 4 && p.y + 16 > pd.y - pd.ry - 70;
    if (near && sprites.an) {
      const feetY = p.y + 16;
      ctx.globalAlpha = 0.38;
      ctx.translate(0, feetY * 2);
      ctx.scale(1, -1);
      drawAnSprite(ctx, sprites.an, p, p.x - AN_DRAW_W / 2, p.y - AN_DRAW_H + 18, fr.t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Ánh đèn tuýp phản chiếu thành vệt bóng loáng (sáng khi có điện)
    const sheen = fr.powerOn ? 0.55 : 0.18 + fr.lightning * 0.6;
    const sh = Math.sin(fr.t * 1.3 + pd.x) * 4;
    px(ctx, pd.x - pd.rx * 0.5 + sh, pd.y - pd.ry * 0.4, pd.rx * 0.6, 1, `rgba(230,240,255,${sheen})`);
    px(ctx, pd.x + pd.rx * 0.1 - sh, pd.y, pd.rx * 0.3, 1, `rgba(230,240,255,${sheen * 0.6})`);
    ctx.fillStyle = 'rgba(90,130,170,0.15)';
    ctx.fillRect(pd.x - pd.rx * 1.2, pd.y - pd.ry * 1.5, pd.rx * 2.4, pd.ry * 3);
    ctx.restore();
  }
  // Gợn sóng tròn của giọt nước rò rỉ
  ctx.lineWidth = 1;
  for (const r of ripples) {
    ctx.strokeStyle = `rgba(200,225,255,${Math.max(0, 0.7 - r.r / r.max)})`;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Nhân vật An + bóng chân elip mềm */
function drawPlayer(ctx: CanvasRenderingContext2D, fr: HallFrame, sprites: HallSprites) {
  const p = fr.player;
  const sg = ctx.createRadialGradient(p.x, p.y + 16, 1, p.x, p.y + 16, 14);
  sg.addColorStop(0, 'rgba(0,0,0,0.6)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 14, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (sprites.an) drawAnSprite(ctx, sprites.an, p, p.x - AN_DRAW_W / 2, p.y - AN_DRAW_H + 18, fr.t);
}

/** Ánh sáng 2 trạng thái: MẤT ĐIỆN (bóng tối đặc quánh) vs ĐÃ ĐÓNG CẦU DAO (nón sáng thể tích) */
function drawHallLighting(ctx: CanvasRenderingContext2D, light: HTMLCanvasElement, fr: HallFrame) {
  const l = light.getContext('2d');
  if (!l) return;
  const p = fr.player;

  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Bóng tối tan dần theo số bóng đã bắt sáng (không bừng sáng cả hành lang cùng lúc)
  const lit = fr.powerOn ? litAmount(fr.tubes) : 0;
  l.fillStyle = `rgba(${3 + lit * 5},${5 + lit * 5},${10 + lit * 6},${0.94 - lit * 0.44})`;
  l.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  l.globalCompositeOperation = 'destination-out';
  const punch = (x: number, y: number, r: number, s: number) => {
    if (s <= 0.01) return;
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${Math.min(1, s)})`);
    g.addColorStop(0.55, `rgba(0,0,0,${Math.min(1, s) * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g;
    l.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (fr.powerOn) {
    TUBES.forEach((tx, i) => punch(tx + 30, 190, 220, 0.9 * fr.tubes[i]));
  } else {
    TUBES.forEach((tx, i) => punch(tx + 30, 60, 160, 0.55 * fr.tubes[i]));  // Chớp nháy rè rè
  }
  punch(p.x, p.y - 6, 88, 0.92);                                          // Quầng quanh An
  punch(DOOR_314.x + 42, DOOR_314.y + 85, 95, 0.8);                       // Ánh CRT từ cửa 314
  punch(FUSE_BOX.x + 26, FUSE_BOX.y + 33, 30, fr.powerOn ? 0.3 : 0.45);  // LED cầu dao
  punch(STAIRS.x + 30, STAIRS.y + 60, 60, 0.4);                           // Rào glitch đỏ
  punch(HALL_WINDOW.x, HALL_WINDOW.y + 60, 70, 0.35 + fr.lightning * 0.5);
  if (fr.pendantHere) punch(DOOR_316.x + 24, DOOR_316.y + 82, 22, 0.5);
  if (fr.lightning > 0.02) punch(380, 260, 460, fr.lightning * 0.6);
  ctx.drawImage(light, 0, 0);

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
  // Nón sáng thể tích từ đèn tuýp xuống sàn gạch
  TUBES.forEach((tx, i) => {
    const lv = fr.tubes[i];
    if (fr.powerOn && lv > 0.05) {
      const cone = ctx.createLinearGradient(0, TUBE_Y, 0, FLOOR.bottom);
      cone.addColorStop(0, `rgba(255,244,210,${0.2 * lv})`);
      cone.addColorStop(1, 'rgba(255,244,210,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(tx, TUBE_Y + 3); ctx.lineTo(tx + 60, TUBE_Y + 3);
      ctx.lineTo(tx + 125, FLOOR.bottom); ctx.lineTo(tx - 65, FLOOR.bottom);
      ctx.closePath();
      ctx.fill();
      glow(tx + 30, 300, 110, '255,236,190', 0.08 * lv);          // Vệt sáng bóng loáng trên gạch
      if (i === TUBE_PURPLE && lv < 0.9) glow(tx + 30, 40, 90, '167,139,250', 0.22);
    } else if (!fr.powerOn && lv > 0.5) {
      glow(tx + 30, 30, 120, Math.random() < 0.5 ? '167,139,250' : '103,232,249', 0.28);
    }
  });
  // Ánh xanh lơ CRT hắt ra khe cửa 314 thành vệt sáng trên sàn
  const crt = 0.22 + Math.sin(fr.t * 6) * 0.03;
  ctx.fillStyle = `rgba(103,232,249,${crt})`;
  ctx.beginPath();
  ctx.moveTo(DOOR_314.x + 34, WALL_H); ctx.lineTo(DOOR_314.x + 48, WALL_H);
  ctx.lineTo(DOOR_314.x + 80, WALL_H + 70); ctx.lineTo(DOOR_314.x + 30, WALL_H + 70);
  ctx.closePath();
  ctx.fill();
  glow(DOOR_314.x + 42, WALL_H + 20, 60, '103,232,249', 0.16);
  // LED cầu dao + rào glitch đỏ + cửa 312 xanh lục
  glow(FUSE_BOX.x + 26, FUSE_BOX.y + 33, 22, fr.powerOn ? '16,185,129' : '239,68,68', fr.powerOn ? 0.3 : 0.25 + Math.max(0, Math.sin(fr.t * 8)) * 0.2);
  glow(STAIRS.x + 30, STAIRS.y + 60, 70, '239,68,68', 0.16);
  glow(DOOR_312.x + 24, WALL_H + 3, 26, '74,222,128', 0.08);
  if (fr.pendantHere) glow(DOOR_316.x + 24, DOOR_316.y + 80, 16, '226,232,240', 0.25);
  // Sét: ánh xanh buốt + bóng song cửa sổ in dài trên sàn
  if (fr.lightning > 0.02) {
    const L = fr.lightning;
    ctx.fillStyle = `rgba(170,190,255,${0.12 * L})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const wx = HALL_WINDOW.x - 10;
    const wy0 = HALL_WINDOW.y;
    const wy1 = HALL_WINDOW.y + HALL_WINDOW.h;
    // Vệt sáng chiếu xiên từ cửa sổ sang trái
    const proj = (wy: number): [number, number] => [wx - 280, wy + 70 + (wy - wy0) * 0.5];
    const [ax, ay] = proj(wy0);
    const [bx, by] = proj(wy1);
    ctx.fillStyle = `rgba(190,210,255,${0.3 * L})`;
    ctx.beginPath();
    ctx.moveTo(wx, wy0); ctx.lineTo(wx, wy1); ctx.lineTo(bx, by); ctx.lineTo(ax, ay);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,10,${0.5 * L})`;
    // Song ngang của cửa sổ in thành sọc tối kéo dài
    const midY = HALL_WINDOW.y + 58;
    const [mx, my] = proj(midY);
    ctx.beginPath();
    ctx.moveTo(wx, midY); ctx.lineTo(wx, midY + 3); ctx.lineTo(mx, my + 5); ctx.lineTo(mx, my);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Bụi pixel trôi lơ lửng trong nón sáng đèn tuýp (chỉ khi có điện) */
function drawDust(ctx: CanvasRenderingContext2D, dust: Dust[], fr: HallFrame) {
  if (!fr.powerOn) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    let tubeIdx = 0;
    for (let i = 1; i < TUBES.length; i++) {
      if (Math.abs(d.x - TUBES[i] - 30) < Math.abs(d.x - TUBES[tubeIdx] - 30)) tubeIdx = i;
    }
    const tcx = TUBES[tubeIdx] + 30;
    const spread = 30 + (d.y - TUBE_Y) * 0.32;
    const inCone = Math.max(0, 1 - Math.abs(d.x - tcx) / spread);
    const a = inCone * 0.7 * fr.tubes[tubeIdx] * (0.6 + Math.sin(fr.t * 2 + d.phase) * 0.4);
    if (a < 0.04) continue;
    ctx.fillStyle = `rgba(255,240,200,${a})`;
    ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
  }
  ctx.restore();
}

/** Phần sáng trung bình của dàn đèn tuýp (0..1) */
function litAmount(tubes: number[]): number {
  return tubes.reduce((a, b) => a + b, 0) / tubes.length;
}

/** Viền tối bám theo An: mở rộng dần theo số bóng tuýp đã sáng */
function hallVignette(fr: HallFrame) {
  const k = fr.powerOn ? litAmount(fr.tubes) : 0;
  const D = HALL_VIGNETTE_DARK;
  const L = HALL_VIGNETTE_LIT;
  return {
    tint: D.tint,
    strength: D.strength + (L.strength - D.strength) * k,
    inner: D.inner + (L.inner - D.inner) * k,
    outer: D.outer + (L.outer - D.outer) * k,
  };
}

/** Vẽ một kim đồng hồ bằng các điểm pixel nguyên (không khử răng cưa) */
function clockHand(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, turn: number, color: string) {
  const a = turn * Math.PI * 2 - Math.PI / 2;
  for (let i = 0; i <= len; i++) {
    px(ctx, Math.round(cx + Math.cos(a) * i), Math.round(cy + Math.sin(a) * i), 1, 1, color);
  }
}

/** Đồng hồ tròn treo tường: kẹt 03:14, mặt kính nứt, kim giây giật lùi một nấc */
function drawHallClock(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const { x, y, r } = HALL_CLOCK;
  px(ctx, x, y - r - 4, 1, 4, '#1c1f24');                             // Đinh treo
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();   // Vành nhựa đen
  ctx.fillStyle = '#d9cfa8';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();       // Mặt số ố vàng
  ctx.fillStyle = 'rgba(120,90,40,0.35)';
  ctx.beginPath(); ctx.arc(x + 3, y + 3, r - 3, 0, Math.PI * 2); ctx.fill();
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const len = h % 3 === 0 ? 2 : 1;
    px(ctx, Math.round(x + Math.cos(a) * (r - 1 - len)), Math.round(y + Math.sin(a) * (r - 1 - len)), 1, len === 2 ? 2 : 1, '#3f3a2c');
  }
  clockHand(ctx, x, y, 4, (3 + 14 / 60) / 12, '#1c1917');             // Kim giờ: 3
  clockHand(ctx, x, y, 7, 14 / 60, '#1c1917');                         // Kim phút: 14
  clockHand(ctx, x, y, 7, fr.clockSec / 60, '#b91c1c');                // Kim giây
  px(ctx, x, y, 1, 1, '#b91c1c');
  // Vết nứt chéo trên mặt kính + vệt phản quang
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - r + 2, y - 4); ctx.lineTo(x - 1, y + 1); ctx.lineTo(x + 4, y + r - 2);
  ctx.stroke();
  px(ctx, x - 5, y - 6, 3, 1, 'rgba(255,255,255,0.35)');
}

/** Gương cầu lồi bắt góc cầu thang: kính ố vàng, bóng An nhoè méo, vệt băng gạc rỉ máu trên trán */
function drawHallMirror(ctx: CanvasRenderingContext2D, fr: HallFrame, sprites: HallSprites) {
  const { x, y, r } = HALL_MIRROR;
  px(ctx, 56, y - 1, FLOOR.left - 56, 3, '#3f444a');                  // Tay đỡ bắt vào góc tường
  px(ctx, x + r - 1, y - 1, 56 - x - r + 1, 2, '#5b636b');
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();   // Viền nhựa trắng bạc màu
  ctx.fillStyle = '#c2410c';
  ctx.beginPath(); ctx.arc(x, y, r + 1, Math.PI * 0.15, Math.PI * 0.85); ctx.fill(); // Vạch cam an toàn
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const glass = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, r);
  glass.addColorStop(0, '#a39a74');
  glass.addColorStop(1, '#4a4530');
  ctx.fillStyle = glass;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const p = fr.player;
  const dist = Math.hypot(p.x - x, p.y - y);
  if (sprites.an && dist < 170) {
    // Bóng An thu nhỏ, lệch theo vị trí đứng, nhoè đôi như mắt hoa
    const near = 1 - dist / 170;
    const w = 20;
    const h = 30;
    const rx = Math.round(x - w / 2 + Math.max(-4, Math.min(4, (p.y - 230) * 0.05)));
    const ry = Math.round(y - h / 2 + 4);
    ctx.globalAlpha = 0.35 + near * 0.35;
    drawSpriteFrame(ctx, sprites.an, 1, 0, false, rx, ry, w, h);
    ctx.globalAlpha = 0.2 + near * 0.15;
    drawSpriteFrame(ctx, sprites.an, 1, 0, false, rx + 1, ry - 1, w, h);
    ctx.globalAlpha = 1;
    // Băng gạc trắng quấn trán + chấm máu thấm qua
    const bandA = 0.45 + near * 0.5;
    px(ctx, rx + 6, ry + 5, 9, 2, `rgba(241,245,249,${bandA})`);
    px(ctx, rx + 11, ry + 5, 2, 2, `rgba(185,28,28,${bandA})`);
    px(ctx, rx + 12, ry + 7, 1, 2, `rgba(153,27,27,${bandA * 0.8})`);
  }
  // Ố vàng + đốm mốc + vệt phản quang cong theo mặt lồi
  ctx.fillStyle = 'rgba(150,120,50,0.32)';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  for (const [sx, sy] of [[-6, 4], [5, -5], [3, 7], [-2, -8]]) px(ctx, x + sx, y + sy, 2, 1, 'rgba(60,50,20,0.55)');
  ctx.strokeStyle = 'rgba(255,255,240,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r - 3, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  ctx.restore();
}

/**
 * Vệt chân ướt hiện dần trên gạch, từ cầu thang tối tiến lại sau lưng An.
 * 'base' vẽ dưới lớp tối (vết loang sẫm), 'sheen' vẽ sau lớp tối (ánh nước lấp lánh trong bóng tối)
 */
function drawFootprints(ctx: CanvasRenderingContext2D, st: Stalker, t: number, pass: 'base' | 'sheen') {
  for (const f of st.prints) {
    const grow = Math.min(1, (t - f.born) / 0.5);
    const fade = st.state === 'done' ? Math.max(0, 1 - (t - st.doneAt - 6) / 4) : 1;
    const a = grow * Math.min(1, fade);
    if (a <= 0.01) continue;
    const fx = Math.round(f.x);
    const fy = Math.round(f.y + (f.left ? -3 : 3));
    if (pass === 'base') {
      px(ctx, fx, fy, 6, 3, `rgba(6,12,20,${a * 0.8})`);               // Lòng bàn chân
      px(ctx, fx + 7, fy, 2, 3, `rgba(6,12,20,${a * 0.8})`);           // Gót
      px(ctx, fx - 1, fy + 1, 1, 1, `rgba(6,12,20,${a * 0.6})`);       // Ngón
    } else {
      const glint = 0.22 + Math.sin(t * 2.3 + fx * 0.3) * 0.06;
      px(ctx, fx + 1, fy, 4, 1, `rgba(150,190,230,${a * glint})`);     // Ánh nước loang
      px(ctx, fx + 7, fy + 1, 1, 1, `rgba(150,190,230,${a * glint})`);
    }
  }
}

/** Bóng Miên quay lưng, áo len tím mờ ảo; lại gần thì giật nhiễu 2 frame rồi tan vào bóng tối */
function drawFleetingShadow(ctx: CanvasRenderingContext2D, fr: HallFrame, ghost: Ghost) {
  if (ghost.state === 'pending' || ghost.state === 'gone' || !ghost.tinted) return;
  const img = ghost.tinted;
  const x = GHOST_FEET.x - 21;
  const y = GHOST_FEET.y - 61;
  const flicker = fr.tubes.reduce((m, v) => Math.max(m, v), 0);
  let alpha = 0.34 + Math.sin(fr.t * 1.7) * 0.05 + flicker * 0.25;
  ctx.save();
  if (ghost.state === 'fading') {
    const k = Math.min(1, (fr.t - ghost.at) / GHOST_FADE_SEC);
    alpha *= 1 - k;
    // Tan từ trên xuống: từng hàng 3px biến mất theo thứ tự ngẫu nhiên
    for (let row = 0; row < 63; row += 3) {
      if (hash(row * 7 + 3) < k) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, row, 42, 3, x + (hash(row + Math.floor(fr.t * 30)) - 0.5) * 6 * k, y + row, 42, 3);
    }
    ctx.restore();
    return;
  }
  // Bóng mờ dưới chân
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
  ctx.beginPath();
  ctx.ellipse(GHOST_FEET.x, GHOST_FEET.y, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ghost.state === 'glitch') {
    // Giật nhiễu: cắt 5 dải ngang lệch nhau + tách kênh đỏ / xanh lơ
    ctx.globalAlpha = Math.min(1, alpha + 0.3);
    for (let i = 0; i < 5; i++) {
      const sy = Math.floor((i * 63) / 5);
      const sh = Math.ceil(63 / 5);
      const off = (hash(i * 13 + ghost.glitchFrames * 5) - 0.5) * 14;
      ctx.drawImage(img, 0, sy, 42, sh, x + off, y + sy, 42, sh);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(img, x - 3, y);
    ctx.fillStyle = 'rgba(34,211,238,0.25)';
    ctx.fillRect(x + 3, y, 42, 63);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y + Math.sin(fr.t * 0.9) * 0.5);
  ctx.restore();
}

/** Nhuộm frame quay lưng của Miên thành bóng tím sẫm (dựng một lần) */
function buildGhostSprite(img: HTMLImageElement): HTMLCanvasElement | null {
  const fs = getSpriteFrame(img, 1, 1, false, 42, 63);
  if (fs.src === img) return null;                                    // Sheet chưa nướng xong, thử lại frame sau
  const c = document.createElement('canvas');
  c.width = 42;
  c.height = 63;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(fs.src, fs.sx, fs.sy, fs.w, fs.h, 0, 0, 42, 63);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(30,14,48,0.72)';
  g.fillRect(0, 0, 42, 63);
  return c;
}

/** HUD trên canvas: khung ngắm vật thể đang nhắm tới + đồng hồ/SANITY + nhãn điện áp */
function drawHallHUD(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const n = fr.nearest;
  if (n) {
    const done = isTargetDoneFor(n.id, fr.snap);
    drawTargetMarker(ctx, n, done ? 'rgba(161,161,170,0.75)' : '#fb923c', fr.t);
  }
  drawVitals(ctx, fr.t, fr.sanity);
  drawHudSubtitle(ctx, fr.powerOn ? tx('ĐIỆN: ỔN ĐỊNH') : tx('ĐIỆN: MẤT'), fr.powerOn ? '#6ee7b7' : '#f87171');
}

// =====================================================================
// MÔ PHỎNG: đèn tuýp chập chờn, tia lửa, giọt rò rỉ, bụi, sét
// =====================================================================

function createHallSim(): HallSim {
  return {
    tubes: TUBES.map(() => ({ level: 0, burst: 0, dark: 0 })),
    sparks: [],
    ripples: [],
    dust: Array.from({ length: 60 }, (_, i) => ({
      x: 110 + hash(i * 3) * 440,
      y: 30 + hash(i * 7) * 380,
      vx: (hash(i * 11) - 0.5) * 0.12,
      vy: -0.03 - hash(i * 13) * 0.07,
      phase: hash(i) * 6.28,
    })),
    lightning: 0,
    nextLightning: 4 + Math.random() * 5,
    secondFlashAt: -1,
    thunderAt: -1,
    nextTyping: 2,
    shake: 0,
    prevPower: null,
    tubeOnAt: TUBES.map(() => -1),
    clockBack: false,
    nextClockTick: 1.5,
    ghost: { state: 'pending', at: 0, glitchFrames: 0, tinted: null },
    stalker: { state: 'idle', still: 0, step: 0, nextAt: 0, dir: 'up', doneAt: 0, prints: [] },
  };
}

/** Cập nhật mô phỏng; trả về các sự kiện âm thanh cần phát trong frame này */
function updateHallSim(sim: HallSim, k: number, t: number, powerOn: boolean) {
  const events = { buzz: false, thunder: false, ballast: false, relays: [] as number[], clockTick: false };

  // Giảm dần rung lắc màn hình
  sim.shake = Math.max(0, (sim.shake || 0) - 0.22 * k);

  // Vừa đóng cầu dao: các bóng mồi starter rồi bắt sáng lần lượt (vào màn khi đã có điện thì sáng sẵn)
  if (sim.prevPower === false && powerOn) {
    sim.tubeOnAt = TUBES.map((_, i) => t + TUBE_KICK_DELAY + i * TUBE_KICK_GAP);
    events.ballast = true;
  }
  sim.prevPower = powerOn;

  // Đèn tuýp: có điện → sáng ổn định (thỉnh thoảng nháy nhẹ); mất điện → hầu như tắt, chớp rè rè ngắt quãng
  for (let i = 0; i < sim.tubes.length; i++) {
    const tb = sim.tubes[i];
    if (powerOn && sim.tubeOnAt[i] > 0) {
      const lead = sim.tubeOnAt[i] - t;
      if (lead > 0) {
        // Starter đang mồi: tối om, loé vài lần ngắn ngay trước khi bắt
        tb.level = lead < 0.14 && Math.random() < 0.5 ? 0.7 : 0;
        continue;
      }
      sim.tubeOnAt[i] = -1;
      tb.burst = 6;
      events.relays.push(i);
    }
    if (powerOn) {
      if (tb.burst > 0) { tb.burst -= k; tb.level = Math.random() < 0.5 ? 0.55 : 1; }
      else {
        tb.level = 0.94 + Math.random() * 0.06;
        if (Math.random() < (i === TUBE_PURPLE ? 0.012 : 0.002) * k) tb.burst = 4 + Math.random() * 8;
      }
    } else if (tb.burst > 0) {
      tb.burst -= k;
      tb.level = Math.random() < 0.45 ? 1 : 0;
    } else {
      tb.level = 0;
      if (Math.random() < 0.012 * k) {
        tb.burst = 4 + Math.random() * 16;
        events.buzz = true;
      }
    }
  }

  // Tia lửa điện lách tách ở hộp cầu dao khi chưa có điện
  if (!powerOn && Math.random() < 0.08 * k && sim.sparks.length < 14) {
    for (let i = 0; i < 4; i++) {
      const life = 8 + Math.random() * 10;
      sim.sparks.push({
        x: FUSE_BOX.x + 4 + Math.random() * 6,
        y: FUSE_BOX.y + 2,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -(0.3 + Math.random() * 1.2),
        life,
        maxLife: life,
        color: Math.random() < 0.5 ? '#fde047' : '#ffffff',
      });
    }
  }
  for (const s of sim.sparks) {
    s.x += s.vx * k;
    s.y += s.vy * k;
    s.vy += 0.12 * k;
    s.life -= k;
  }
  sim.sparks = sim.sparks.filter((s) => s.life > 0);

  // Giọt nước rò rỉ từ ống trần rơi xuống vũng → gợn sóng
  if (Math.random() < 0.02 * k) {
    const pd = PUDDLES[Math.floor(Math.random() * PUDDLES.length)];
    sim.ripples.push({ x: pd.x + (Math.random() - 0.5) * pd.rx, y: pd.y + (Math.random() - 0.5) * pd.ry, r: 1, max: 10 + Math.random() * 8 });
  }
  for (const r of sim.ripples) r.r += 0.35 * k;
  sim.ripples = sim.ripples.filter((r) => r.r < r.max);

  // Bụi trôi chậm
  for (const d of sim.dust) {
    d.x += (d.vx + Math.sin(t * 0.5 + d.phase) * 0.04) * k;
    d.y += d.vy * k;
    if (d.y < 20) { d.y = 410; d.x = 110 + Math.random() * 440; }
  }

  // Sét: chớp chính → chớp phụ → sấm nổ đanh ngay khoảnh khắc chớp nháy ở cửa sổ
  sim.lightning = Math.max(0, sim.lightning - 0.045 * k);
  if (t >= sim.nextLightning) {
    sim.lightning = 1;
    sim.secondFlashAt = t + 0.16;
    sim.thunderAt = t + 0.06; // Nổ sấm gần như tức thì (~60ms) khi chớp vừa nháy ở cửa sổ!
    sim.shake = 3.5;          // Rung chấn màn hình theo tia chớp
    sim.nextLightning = t + (powerOn ? 10 : 6) + Math.random() * 9;
  }
  if (sim.secondFlashAt > 0 && t >= sim.secondFlashAt) {
    sim.lightning = Math.max(sim.lightning, 0.7);
    sim.shake = Math.max(sim.shake, 2.0);
    sim.secondFlashAt = -1;
  }
  if (sim.thunderAt > 0 && t >= sim.thunderAt) {
    sim.thunderAt = -1;
    events.thunder = true;
  }

  // Đồng hồ kẹt 03:14: kim giây thỉnh thoảng giật lùi một nấc rồi bật về chỗ cũ
  if (t >= sim.nextClockTick) {
    sim.clockBack = !sim.clockBack;
    sim.nextClockTick = t + (sim.clockBack ? 0.9 : 1.6 + Math.random() * 2.4);
    events.clockTick = true;
  }
  return events;
}

/** Bóng ma thoáng qua; trả về true đúng frame nó bắt đầu tan */
function updateGhost(ghost: Ghost, t: number, p: PlayerState, powerOn: boolean, seen: boolean, mien: HTMLImageElement | null): boolean {
  if (ghost.state === 'pending') {
    if (seen || powerOn) { ghost.state = 'gone'; return false; }
    if (!mien) return false;
    ghost.tinted ??= buildGhostSprite(mien);
    if (ghost.tinted) ghost.state = 'standing';
    return false;
  }
  // Lại gần, hoặc đèn bật sáng, thì bóng ma tan (không bao giờ đứng giữa hành lang sáng đèn)
  if (ghost.state === 'standing' && (powerOn || Math.hypot(p.x - GHOST_FEET.x, p.y + 16 - GHOST_FEET.y) < GHOST_VANISH_DIST)) {
    ghost.state = 'glitch';
    ghost.glitchFrames = 0;
    return true;
  }
  if (ghost.state === 'glitch' && ++ghost.glitchFrames > 2) {
    ghost.state = 'fading';
    ghost.at = t;
  }
  if (ghost.state === 'fading' && t - ghost.at > GHOST_FADE_SEC) ghost.state = 'gone';
  return false;
}

/** Ai đó lẹp xẹp đi tới sau lưng An khi An đứng lặng ở hộp cầu dao trong bóng tối */
function updateStalker(st: Stalker, t: number, k: number, p: PlayerState, nearFuse: boolean, powerOn: boolean) {
  const ev = { step: -1, stop: false };
  if (st.state === 'done') return ev;
  const turned = p.isMoving || p.dir !== st.dir || powerOn;
  if (st.state === 'idle') {
    st.still = !powerOn && nearFuse && !p.isMoving ? st.still + k / 60 : 0;
    if (st.still >= STALKER_IDLE_SEC) {
      st.state = 'walking';
      st.step = 0;
      st.nextAt = t + 0.4;
      st.dir = p.dir;
    }
    return ev;
  }
  if (turned) {
    // Quay lại nhìn: im bặt, không có ai cả
    st.state = 'done';
    st.doneAt = t;
    ev.stop = st.step > 0;
    if (!ev.stop) st.state = 'idle';
    return ev;
  }
  if (st.state === 'walking' && t >= st.nextAt) {
    const f = (st.step + 1) / STALKER_STEPS;
    st.prints.push({
      x: 70 + (p.x - 34 - 70) * f,
      y: p.y + 22 - (1 - f) * 10,
      left: st.step % 2 === 0,
      born: t,
    });
    ev.step = st.step;
    st.step++;
    st.nextAt = t + 0.62 - st.step * 0.04;                            // Bước dồn dần khi tới gần
    if (st.step >= STALKER_STEPS) st.state = 'behind';
  }
  return ev;
}

// =====================================================================
// COMPONENT
// =====================================================================

export const HallwayStage: React.FC<HallwayStageProps> = ({
  characterSprite,
  sanity,
  setSanity,
  onTrigger,
  onEnterRoom314,
  interactedIds = EMPTY_IDS,
  onMarkInteracted,
  inventoryIds = EMPTY_IDS,
  onUpdateInventory,
  volume = 80,
  parallax = true,
}) => {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const anSpriteRef = useRef<HTMLImageElement | null>(null);
  const mienSpriteRef = useRef<HTMLImageElement | null>(null);
  // Bấm [E] ở hộp cầu dao lúc chưa sửa được → tiếng bước chân bắt đầu ngay, không chờ đứng yên
  const stalkerPokeRef = useRef(false);

  // Vị trí người chơi trong hành lang (bắt đầu ngay trước cửa phòng 314)
  const playerRef = useRef({
    x: 125,
    y: 195,
    speed: 2.5,
    dir: 'down' as Direction,
    frame: 1,
    isMoving: false,
    animTimer: 0,
  });

  const keysHeld = useRef<Set<string>>(new Set());
  const [activePrompt, setActivePrompt] = useState<{ text: string; isDone: boolean } | null>(null);
  const [monologueWhisper, setMonologueWhisper] = useState<string | null>(null);
  const whisperTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State Túi đồ & Đồng bộ
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [localInventoryIds, setLocalInventoryIds] = useState<string[]>(inventoryIds);
  const [localInteractedIds, setLocalInteractedIds] = useState<string[]>(interactedIds);
  const [pickupAlert, setPickupAlert] = useState<{ name: string; icon: string; msg: string } | null>(null);
  const pickupAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trạng thái nguồn điện hành lang
  const isPowerOn = localInteractedIds.includes('hallway_power_on');

  // Đồng bộ khi prop từ cha thay đổi (điều chỉnh state ngay trong render thay vì effect)
  const [prevInventoryIds, setPrevInventoryIds] = useState(inventoryIds);
  if (inventoryIds !== prevInventoryIds) {
    setPrevInventoryIds(inventoryIds);
    setLocalInventoryIds(inventoryIds);
  }

  const [prevInteractedIds, setPrevInteractedIds] = useState(interactedIds);
  if (interactedIds !== prevInteractedIds) {
    setPrevInteractedIds(interactedIds);
    setLocalInteractedIds(interactedIds);
  }

  // Khởi tạo AudioContext
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

  // Tiếng bước chân trên sàn gạch hoa
  const playStepSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140 + Math.random() * 30, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.05);
      g.gain.setValueAtTime((volume / 100) * 0.03, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng chập điện tóe lửa khi sửa cầu chì
  const playSparkSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [0, 0.06, 0.12, 0.22].forEach((delay) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600 + Math.random() * 400, t + delay);
        osc.frequency.exponentialRampToValueAtTime(120, t + delay + 0.05);
        g.gain.setValueAtTime((volume / 100) * 0.08, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.05);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.05);
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng nhặt đồ
  const playPickupSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.05);
        g.gain.setValueAtTime((volume / 100) * 0.07, t + idx * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.16);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.05);
        osc.stop(t + idx * 0.05 + 0.16);
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Bong bóng cảm xúc trên đầu An (hành lang không có Miên)
  const emotesRef = useRef<EmoteDirector | null>(null);
  const emotes = useCallback(() => (emotesRef.current ??= createEmoteDirector()), []);

  // Độc thoại nội tâm
  const showMonologueWhisper = useCallback((msg: string) => {
    emoteNow(emotes(), 'an', 'dots');
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    setMonologueWhisper(msg);
    whisperTimerRef.current = setTimeout(() => {
      setMonologueWhisper(null);
    }, Math.max(4000, msg.length * 60)); // Câu dài hiện lâu hơn để kịp đọc
  }, [emotes]);

  // Banner nhặt đồ
  const showPickupAlert = useCallback((name: string, icon: string, msg: string) => {
    playPickupSound();
    emoteNow(emotes(), 'an', 'exclaim');
    if (pickupAlertTimerRef.current) clearTimeout(pickupAlertTimerRef.current);
    setPickupAlert({ name, icon, msg });
    pickupAlertTimerRef.current = setTimeout(() => {
      setPickupAlert(null);
    }, Math.max(4500, msg.length * 55));
  }, [playPickupSound, emotes]);

  // Xử lý sử dụng vật phẩm trực tiếp từ Túi đồ
  const handleUseItem = useCallback(
    (item: InventoryItem) => {
      if (item.id === 'coffee') {
        if (localInteractedIds.includes('coffee_used')) {
          showMonologueWhisper('Hết sạch rồi. Liếm đáy cốc thì hơi mất giá quá.');
          return;
        }
        if (setSanity) {
          setSanity((prev) => Math.min(100, prev + (item.consumeSanityGain || 15)));
        }
        const nextInv = localInventoryIds.filter(id => id !== 'coffee');
        setLocalInventoryIds(nextInv);
        onUpdateInventory?.(nextInv);
        setLocalInteractedIds(prev => (prev.includes('coffee_used') ? prev : [...prev, 'coffee_used']));
        onMarkInteracted?.('coffee_used');
        showMonologueWhisper(item.consumeMonologue || 'Vị cà phê đắng ngắt giúp bạn tỉnh táo (+15 Sanity).');
      } else if (item.id === 'faded_photo') {
        if (localInteractedIds.includes('faded_photo_used')) {
          showMonologueWhisper('Bạn đã ngắm kỹ bức ảnh này rồi... Ký ức về ngày 17/05 vẫn còn đó, nhưng không thể xoa dịu tâm trí thêm lần nữa.');
          return;
        }
        if (setSanity) {
          setSanity((prev) => Math.min(100, prev + (item.consumeSanityGain || 20)));
        }
        setLocalInteractedIds(prev => (prev.includes('faded_photo_used') ? prev : [...prev, 'faded_photo_used']));
        onMarkInteracted?.('faded_photo_used');
        showMonologueWhisper(item.consumeMonologue || 'Bạn ngắm nhìn nụ cười của Miên trong bức ảnh (+20 Sanity).');
      }
    },
    [localInteractedIds, localInventoryIds, onMarkInteracted, onUpdateInventory, setSanity, showMonologueWhisper]
  );

  // Xử lý ghép vật phẩm
  const handleCombineItems = useCallback(
    (itemAId: string, itemBId: string, resultItem: InventoryItem, successMsg: string) => {
      const nextIds = localInventoryIds
        .filter(id => id !== itemAId && id !== itemBId)
        .concat(resultItem.id);
      setLocalInventoryIds(nextIds);
      onUpdateInventory?.(nextIds);
      showMonologueWhisper(successMsg);
    },
    [localInventoryIds, onUpdateInventory, showMonologueWhisper]
  );

  const inventoryItems: InventoryItem[] = localInventoryIds
    .map(id => CHAPTER_1_ITEMS[id])
    .filter(Boolean);

  // Danh sách các điểm tương tác ở Hành lang tầng 3
  const interactables = useRef<InteractableObject[]>([
    {
      id: 'door_314',
      name: 'Cửa Phòng Trọ #314 (Phòng Của An)',
      actionText: '[E] Quay trở lại phòng trọ #314 [🚪]',
      x: 100,
      y: 120,
      w: 48,
      h: 50,
      triggerNodeId: 'room_314',
      canRepeat: true,
      checkedMonologue: 'Cửa phòng trọ của bạn đang mở hé ánh sáng xanh CRT.',
    },
    {
      id: 'door_312',
      name: 'Cửa Phòng #312 (Khóa Xích)',
      actionText: '[E] Áp tai nghe ngóng tiếng gõ phím bên trong phòng #312 [🔒]',
      x: 230,
      y: 120,
      w: 48,
      h: 50,
      triggerNodeId: 'node_hallway_door_312',
      canRepeat: true,
      checkedMonologue: 'Cửa quấn xích sắt chặt chẽ, bên trong chỉ còn tiếng thì thầm rè rè.',
    },
    {
      id: 'fuse_box',
      name: 'Hộp Cầu Dao Điện Tổng',
      actionText: '[E] Kiểm tra hộp cầu dao điện tổng [⚡]',
      x: 335,
      y: 105,
      w: 38,
      h: 40,
      triggerNodeId: 'obj_fuse_box',
      canRepeat: true,
      checkedMonologue: 'Hệ thống điện hành lang đang chạy ổn định.',
    },
    {
      id: 'notice_board',
      name: 'Bảng Tin Cư Dân',
      actionText: '[E] Xem Bảng Tin Cư Dân (Thiệp Kỷ Niệm 17/05) [📌]',
      x: 405,
      y: 105,
      w: 55,
      h: 40,
      triggerNodeId: 'node_hallway_notice_board',
      canRepeat: true,
      checkedMonologue: 'Tấm thiệp kỷ niệm ngày 17/05 của Miên vẫn được ghim ngay ngắn trên bảng nỉ...',
    },
    {
      id: 'door_316',
      name: 'Cửa Phòng #316 (Phòng Cũ Của Miên)',
      actionText: '[E] Soi khe cửa phòng cũ của Miên [✨]',
      x: 500,
      y: 120,
      w: 48,
      h: 50,
      triggerNodeId: 'node_hallway_door_316',
      canRepeat: true,
      checkedMonologue: 'Hai dải giấy của chủ trọ dán chéo kín cửa phòng Miên. Không thể vào trong.',
    },
    {
      id: 'hallway_window',
      name: 'Cửa Sổ Kính Hành Lang',
      actionText: '[E] Nhìn qua cửa sổ ra đêm mưa xối xả [🌧️]',
      x: 580,
      y: 170,
      w: 40,
      h: 90,
      triggerNodeId: 'node_hallway_window',
      canRepeat: true,
      checkedMonologue: 'Mưa vẫn rơi tầm tã... Thành phố bên ngoài im lìm trong bóng tối.',
    },
    {
      id: 'obj_hall_mirror',
      name: 'Gương Cầu Lồi Góc Cầu Thang',
      actionText: '[E] Soi vào tấm gương cầu lồi ố vàng [🪞]',
      x: 40,
      y: 150,
      w: 30,
      h: 40,
      triggerNodeId: 'obj_hall_mirror',
      checkedMonologue: 'Mình không muốn nhìn vào tấm gương đó thêm lần nào nữa.',
    },
    {
      id: 'obj_hall_clock',
      name: 'Đồng Hồ Treo Tường',
      actionText: '[E] Xem chiếc đồng hồ tròn treo giữa hai cửa phòng [🕒]',
      x: 185,
      y: 110,
      w: 50,
      h: 40,
      triggerNodeId: 'obj_hall_clock',
      checkedMonologue: 'Tíc... tắc... Kim giây vẫn giật lùi. Vẫn mãi là 03:14.',
    },
    {
      id: 'stairs',
      name: 'Cầu Thang Thoát Hiểm',
      actionText: '[E] Kiểm tra lối cầu thang xuống tầng dưới [⛔]',
      x: 25,
      y: 200,
      w: 40,
      h: 80,
      triggerNodeId: 'node_hallway_stairs',
      canRepeat: true,
      checkedMonologue: 'Lối xuống tầng 2 đã bị rào chắn glitch phong tỏa hoàn toàn.',
    },
  ]);

  // Load Sprites
  useEffect(() => {
    const anImg = new Image();
    anImg.src = characterSprite;
    anImg.onload = () => { anSpriteRef.current = anImg; };
  }, [characterSprite]);
  useEffect(() => {
    const mienImg = new Image();
    mienImg.src = '/assets/mien_spritesheet.png';
    mienImg.onload = () => { mienSpriteRef.current = mienImg; };
  }, []);

  // Xử lý bàn phím
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInventoryOpen) return;

      if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsInventoryOpen(true);
        return;
      }

      keysHeld.current.add(e.key.toLowerCase());

      if (e.key.toLowerCase() === 'e' || e.key === ' ' || e.key === 'Enter') {
        const p = playerRef.current;
        let target: InteractableObject | null = null;
        let minDist = 75;

        for (const obj of interactables.current) {
          const cx = obj.x + obj.w / 2;
          const cy = obj.y + obj.h / 2;
          const dist = Math.hypot(p.x - cx, p.y - cy);
          if (dist < minDist) {
            minDist = dist;
            target = obj;
          }
        }

        if (target) {
          // 1. Quay lại phòng trọ #314
          if (target.id === 'door_314') {
            onEnterRoom314();
            return;
          }

          // 2. Hộp cầu dao điện tổng
          if (target.id === 'fuse_box') {
            if (isPowerOn) {
              showMonologueWhisper('Cầu dao tổng đang đóng điện. Đèn hành lang đang sáng rõ.');
              return;
            }

            const hasTape = localInventoryIds.includes('electrical_tape');
            const hasClip = localInventoryIds.includes('paperclip');

            if (hasTape || hasClip) {
              playSparkSound();
              setLocalInteractedIds(prev => (prev.includes('hallway_power_on') ? prev : [...prev, 'hallway_power_on']));
              onMarkInteracted?.('hallway_power_on');
              if (setSanity) {
                setSanity(prev => Math.min(100, prev + 10));
              }
              showMonologueWhisper(
                hasTape
                  ? 'Bạn dùng Cuộn Băng Dính quấn chặt cầu chì! Đèn neon huỳnh quang bừng sáng, đồng thời cấp nguồn điện ổn định cho máy tính phòng 314 (+10 Sanity)!'
                  : 'Bạn khéo léo dùng Kẹp Ghim nối mạch cầu chì! Đèn neon huỳnh quang bừng sáng, đồng thời cấp nguồn điện ổn định cho máy tính phòng 314 (+10 Sanity)!'
              );
              return;
            }

            stalkerPokeRef.current = true;
            showMonologueWhisper('Cầu chì lại đứt. Lần trước mình cắm cùng lúc nồi cơm, quạt và máy tính là cả tầng tối om, đến giờ chủ trọ vẫn nhìn mình bằng ánh mắt đó... Cần Cuộn Băng Dính hoặc Kẹp Ghim để nối lại!');
            return;
          }

          // 3. Cửa phòng #316 (nhặt Mặt Dây Chuyền Bạc Của Miên)
          if (target.id === 'door_316') {
            const hasPendant = localInventoryIds.includes('miens_pendant') || localInteractedIds.includes('door_316_picked');
            if (!hasPendant) {
              const nextInv = [...localInventoryIds, 'miens_pendant'];
              setLocalInventoryIds(nextInv);
              onUpdateInventory?.(nextInv);
              setLocalInteractedIds(prev => [...prev, 'door_316_picked']);
              onMarkInteracted?.('door_316_picked');
              showPickupAlert(
                'Mặt Dây Chuyền Bạc Của Miên',
                '✨',
                'Soi dưới khe cửa phòng #316 của Miên, bạn nhặt được Mặt Dây Chuyền Bạc! Phía sau khắc chìm: "A & M - Kỷ Niệm 17/05". Đó chính là mã PIN máy tính!'
              );
              return;
            }
            onTrigger('node_hallway_door_316');
            return;
          }

          // 4. Bảng tin cư dân (chỉ đọc rõ khi đã có điện neon)
          if (target.id === 'notice_board') {
            if (!isPowerOn) {
              showMonologueWhisper('Hành lang tối om... Bạn chỉ thấy bóng mờ của vài tờ giấy dán chồng lên nhau. Cần bật cầu dao điện hành lang để soi rõ manh mối!');
              return;
            }
            onTrigger(target.triggerNodeId);
            return;
          }

          // 5. Gương & đồng hồ: xem kỹ một lần (gương trừ Sanity), lần sau chỉ độc thoại ngắn
          if (target.id === 'obj_hall_mirror' || target.id === 'obj_hall_clock') {
            if (localInteractedIds.includes(target.id)) {
              showMonologueWhisper(target.checkedMonologue ?? '');
              return;
            }
            const id = target.id;
            setLocalInteractedIds(prev => (prev.includes(id) ? prev : [...prev, id]));
            onMarkInteracted?.(id);
            onTrigger(target.triggerNodeId);
            return;
          }

          // 6. Các điểm tương tác khác
          onTrigger(target.triggerNodeId);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    isInventoryOpen,
    isPowerOn,
    localInventoryIds,
    localInteractedIds,
    onEnterRoom314,
    onMarkInteracted,
    onTrigger,
    onUpdateInventory,
    playSparkSound,
    setSanity,
    showMonologueWhisper,
    showPickupAlert,
  ]);

  // Tiếng đèn tuýp rít rè rè khi chập chờn
  const playFluoroBuzz = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100 + Math.random() * 20, t);
      g.gain.setValueAtTime((volume / 100) * 0.025, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng sấm rền chân thực ngay khi chớp nháy ở cửa sổ hành lang
  const playThunder = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const masterVol = volume / 100;

      // 1. Tiếng nổ sét đanh xé toạc (Initial Strike Crack)
      const crackDur = 0.22;
      const crackBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * crackDur), ctx.sampleRate);
      const crackData = crackBuf.getChannelData(0);
      for (let i = 0; i < crackData.length; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
      }
      const crackSrc = ctx.createBufferSource();
      crackSrc.buffer = crackBuf;
      const crackFilter = ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(1100, t);
      crackFilter.Q.setValueAtTime(2.2, t);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(masterVol * 0.45, t);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);
      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(ctx.destination);
      crackSrc.start(t);
      crackSrc.stop(t + crackDur);

      // 2. Xung kích trầm rung ngực (Low-end Thump)
      const thumpOsc = ctx.createOscillator();
      const thumpGain = ctx.createGain();
      thumpOsc.type = 'sine';
      thumpOsc.frequency.setValueAtTime(220, t);
      thumpOsc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      thumpGain.gain.setValueAtTime(masterVol * 0.38, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thumpOsc.start(t);
      thumpOsc.stop(t + 0.2);

      // 3. Tiếng sấm gầm rền rĩ kéo dài (Rolling Rumble)
      const rumbleDur = 3.2;
      const rumbleBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * rumbleDur), ctx.sampleRate);
      const rumbleData = rumbleBuf.getChannelData(0);
      for (let i = 0; i < rumbleData.length; i++) {
        rumbleData[i] = Math.random() * 2 - 1;
      }
      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(450, t);
      rumbleFilter.frequency.exponentialRampToValueAtTime(80, t + rumbleDur);
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.001, t);
      rumbleGain.gain.linearRampToValueAtTime(masterVol * 0.36, t + 0.08);
      rumbleGain.gain.exponentialRampToValueAtTime(masterVol * 0.18, t + 0.9);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + rumbleDur);
      rumbleSrc.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(ctx.destination);
      rumbleSrc.start(t);
      rumbleSrc.stop(t + rumbleDur);

      // 4. Sóng rung Sub-bass dập dềnh
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(65, t);
      subOsc.frequency.linearRampToValueAtTime(38, t + 2.5);
      subGain.gain.setValueAtTime(0.001, t);
      subGain.gain.linearRampToValueAtTime(masterVol * 0.25, t + 0.1);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(t);
      subOsc.stop(t + 2.5);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng gõ bàn phím ma quái vọng ra từ phòng #312 (nhỏ dần theo khoảng cách)
  const playGhostTyping = useCallback((loudness: number) => {
    if (volume <= 0 || loudness <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const n = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.07 + Math.random() * 0.08);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(900 + Math.random() * 500, at);
        osc.frequency.exponentialRampToValueAtTime(200, at + 0.015);
        g.gain.setValueAtTime((volume / 100) * 0.012 * loudness, at);
        g.gain.exponentialRampToValueAtTime(0.0005, at + 0.02);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.02);
      }
    } catch {}
  }, [getAudioContext, volume]);

  /** Đoạn nhiễu trắng dùng chung cho tiếng gió / bước chân ướt / rơ-le */
  const noiseBufRef = useRef<AudioBuffer | null>(null);
  const getNoise = useCallback((ctx: AudioContext) => {
    if (!noiseBufRef.current || noiseBufRef.current.sampleRate !== ctx.sampleRate) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBufRef.current = buf;
    }
    return noiseBufRef.current;
  }, []);

  // Rơ-le đèn tuýp: "tách" nhỏ cho từng bóng, bóng cuối "TẠCH!" nặng
  const playRelay = useCallback((i: number) => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const last = i === TUBES.length - 1;
      const vol = (volume / 100) * (last ? 0.32 : 0.14);
      const src = ctx.createBufferSource();
      src.buffer = getNoise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = last ? 1600 : 2600;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (last ? 0.06 : 0.03));
      const pan = ctx.createStereoPanner();
      pan.pan.value = (TUBES[i] + 30) / CANVAS_WIDTH * 1.4 - 0.7;
      src.connect(bp).connect(g).connect(pan).connect(ctx.destination);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.07);
      if (last) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
        og.gain.setValueAtTime((volume / 100) * 0.16, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(og).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.15);
      }
    } catch {}
  }, [getAudioContext, getNoise, volume]);

  // Tăng phô huỳnh quang rít nhẹ rồi lắng xuống thành tiếng ù
  const playBallastWhine = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const vol = volume / 100;
      const whine = ctx.createOscillator();
      whine.type = 'sine';
      whine.frequency.setValueAtTime(6200, t);
      whine.frequency.linearRampToValueAtTime(7800, t + 1.2);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.linearRampToValueAtTime(vol * 0.012, t + 0.5);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 100;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(vol * 0.03, t + 0.9);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      whine.connect(wg).connect(ctx.destination);
      hum.connect(lp).connect(hg).connect(ctx.destination);
      whine.start(t);
      hum.start(t);
      whine.stop(t + 2.5);
      hum.stop(t + 2.7);
    } catch {}
  }, [getAudioContext, volume]);

  // Gió rít nhẹ khi bóng ma tan vào bóng tối
  const playGhostWind = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = getNoise(ctx);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.exponentialRampToValueAtTime(2300, t + 0.5);
      bp.frequency.exponentialRampToValueAtTime(500, t + 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime((volume / 100) * 0.09, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(-0.1, t);
      pan.pan.linearRampToValueAtTime(0.5, t + 1.6);
      src.connect(bp).connect(g).connect(pan).connect(ctx.destination);
      src.start(t);
      src.stop(t + 1.75);
    } catch {}
  }, [getAudioContext, getNoise, volume]);

  // Bước chân ướt "bẹp" từ phía cầu thang: to dần, tiến dần từ trái vào sau lưng
  const playWetStep = useCallback((i: number) => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const f = (i + 1) / STALKER_STEPS;
      const vol = (volume / 100) * (0.05 + f * 0.13);
      const pan = ctx.createStereoPanner();
      pan.pan.value = -0.85 + f * 0.6;
      pan.connect(ctx.destination);
      // Tiếng dép ướt dính sàn
      const src = ctx.createBufferSource();
      src.buffer = getNoise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.3;
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(260, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(bp).connect(g).connect(pan);
      src.start(t, Math.random() * 0.5);
      src.stop(t + 0.17);
      // Tiếng nước bị ép ra "bẹp"
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260, t + 0.02);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.1);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t + 0.02);
      og.gain.linearRampToValueAtTime(vol * 0.6, t + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(og).connect(pan);
      o.start(t + 0.02);
      o.stop(t + 0.12);
    } catch {}
  }, [getAudioContext, getNoise, volume]);

  // Tíc (kim giật lùi) / tắc (bật về) của đồng hồ kẹt giờ, nhỏ dần theo khoảng cách
  const playClockTick = useCallback((back: boolean, loudness: number) => {
    if (volume <= 0 || loudness <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(back ? 2300 : 1700, t);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = back ? 2600 : 1900;
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime((volume / 100) * 0.05 * loudness, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.025);
      o.connect(bp).connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.03);
    } catch {}
  }, [getAudioContext, volume]);

  // Ảnh chụp state mới nhất cho vòng lặp RAF (tránh khởi động lại loop mỗi lần state đổi)
  const snapshotRef = useRef<HallSnapshot>({
    sanity,
    interacted: localInteractedIds,
    inventory: localInventoryIds,
    inventoryOpen: isInventoryOpen,
  });
  useEffect(() => {
    snapshotRef.current = {
      sanity,
      interacted: localInteractedIds,
      inventory: localInventoryIds,
      inventoryOpen: isInventoryOpen,
    };
  }, [sanity, localInteractedIds, localInventoryIds, isInventoryOpen]);

  const soundRef = useRef({ playStepSound, playFluoroBuzz, playThunder, playGhostTyping, playRelay, playBallastWhine, playGhostWind, playWetStep, playClockTick });
  useEffect(() => {
    soundRef.current = { playStepSound, playFluoroBuzz, playThunder, playGhostTyping, playRelay, playBallastWhine, playGhostWind, playWetStep, playClockTick };
  }, [playStepSound, playFluoroBuzz, playThunder, playGhostTyping, playRelay, playBallastWhine, playGhostWind, playWetStep, playClockTick]);

  // Sự kiện một lần từ vòng lặp (bóng ma tan / quay lại không thấy ai) → ghi cờ + độc thoại
  const onceRef = useRef({ mark: (id: string) => { void id; }, whisper: (msg: string) => { void msg; } });
  useEffect(() => {
    onceRef.current = {
      mark: (id: string) => {
        setLocalInteractedIds(prev => (prev.includes(id) ? prev : [...prev, id]));
        onMarkInteracted?.(id);
      },
      whisper: showMonologueWhisper,
    };
  }, [onMarkInteracted, showMonologueWhisper]);

  const promptKeyRef = useRef('');

  // Game Loop (chạy một lần, đọc state qua ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const staticLayer = buildHallStaticLayer();
    const postLayer = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT, 0);
    const followLight = createFollowLight(); // Vignette động bám theo An
    const lightLayer = document.createElement('canvas');
    lightLayer.width = CANVAS_WIDTH;
    lightLayer.height = CANVAS_HEIGHT;
    const sim = createHallSim();
    const em = emotes();

    let animId = 0;
    let last = performance.now();
    const start = last;

    const gameLoop = (now: number) => {
      // k = hệ số chuẩn hoá theo 60 FPS
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      const t = (now - start) / 1000;
      const snap = snapshotRef.current;
      const p = playerRef.current;
      const keys = keysHeld.current;

      if (snap.inventoryOpen) {
        stopWalk(p);
      } else {
        let dx = 0;
        let dy = 0;
        if (keys.has('w') || keys.has('arrowup')) { dy -= 1; p.dir = 'up'; }
        if (keys.has('s') || keys.has('arrowdown')) { dy += 1; p.dir = 'down'; }
        if (keys.has('a') || keys.has('arrowleft')) { dx -= 1; p.dir = 'left'; }
        if (keys.has('d') || keys.has('arrowright')) { dx += 1; p.dir = 'right'; }
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
          if (stepWalk(p, k)) {
            soundRef.current.playStepSound();
            followLight.pulse = 1;
          }
        } else {
          stopWalk(p);
        }
      }

      const powerOn = snap.interacted.includes('hallway_power_on');

      // Mô phỏng + âm thanh môi trường
      const events = updateHallSim(sim, k, t, powerOn);
      if (events.buzz) soundRef.current.playFluoroBuzz();
      if (events.thunder) soundRef.current.playThunder();
      if (events.ballast) soundRef.current.playBallastWhine();
      for (const i of events.relays) soundRef.current.playRelay(i);
      if (events.clockTick) {
        const dc = Math.hypot(p.x - HALL_CLOCK.x, p.y - 150);
        if (dc < 170) soundRef.current.playClockTick(sim.clockBack, 1 - dc / 170);
      }

      // Bóng ma thoáng qua trước cửa #312
      const mienImg = mienSpriteRef.current && mienSpriteRef.current.complete ? mienSpriteRef.current : null;
      if (updateGhost(sim.ghost, t, p, powerOn, snap.interacted.includes(GHOST_FLAG), mienImg)) {
        soundRef.current.playGhostWind();
        emoteNow(em, 'an', 'exclaim');
        onceRef.current.mark(GHOST_FLAG);
      }
      if (t >= sim.nextTyping) {
        sim.nextTyping = t + 1.2 + Math.random() * 2.5;
        const d312 = Math.hypot(p.x - (DOOR_312.x + 24), p.y - 170);
        if (d312 < 160) soundRef.current.playGhostTyping(1 - d312 / 160);
      }

      // Mục tiêu gần nhất + thanh gợi ý (chỉ setState khi nội dung đổi)
      let nearTarget: InteractableObject | null = null;
      let minPromptDist = INTERACT_RADIUS;
      for (const obj of interactables.current) {
        const dist = Math.hypot(p.x - (obj.x + obj.w / 2), p.y - (obj.y + obj.h / 2));
        if (dist < minPromptDist) {
          minPromptDist = dist;
          nearTarget = obj;
        }
      }
      // Tiếng bước chân ướt sau lưng khi đứng ở hộp cầu dao trong bóng tối (một lần mỗi ván)
      if (sim.stalker.state === 'idle' && snap.interacted.includes(STALKER_FLAG)) sim.stalker.state = 'done';
      if (stalkerPokeRef.current) {
        stalkerPokeRef.current = false;
        if (sim.stalker.state === 'idle') sim.stalker.still = STALKER_IDLE_SEC;
      }
      const st = updateStalker(sim.stalker, t, k, p, nearTarget?.id === 'fuse_box', powerOn);
      if (st.step >= 0) soundRef.current.playWetStep(st.step);
      if (st.stop) {
        emoteNow(em, 'an', 'exclaim');
        onceRef.current.mark(STALKER_FLAG);
        if (!powerOn) onceRef.current.whisper('...Không có ai cả. Rõ ràng vừa có người đứng ngay sau lưng mình. Nhưng sao vệt nước dưới sàn vẫn còn ướt?');
      }

      const prompt = nearTarget ? computePrompt(nearTarget, snap) : null;
      const promptKey = prompt ? `${prompt.isDone}|${prompt.text}` : '';
      if (promptKey !== promptKeyRef.current) {
        promptKeyRef.current = promptKey;
        setActivePrompt(prompt);
      }
      updateEmotes(em, {
        t,
        nearId: nearTarget ? nearTarget.id : null,
        nearDone: !!prompt?.isDone,
        sanity: snap.sanity,
        moving: p.isMoving,
        distToMien: null,
      });

      // Vẽ
      const fr: HallFrame = {
        t,
        sanity: snap.sanity,
        powerOn,
        pendantHere: !(snap.inventory.includes('miens_pendant') || snap.interacted.includes('door_316_picked')),
        hasFuseItem: snap.inventory.includes('electrical_tape') || snap.inventory.includes('paperclip'),
        lightning: sim.lightning,
        tubes: sim.tubes.map((tb) => tb.level),
        clockSec: sim.clockBack ? CLOCK_STUCK_SEC - 1 : CLOCK_STUCK_SEC,
        player: p,
        nearest: nearTarget,
        snap,
      };
      const sprites: HallSprites = {
        an: anSpriteRef.current && anSpriteRef.current.complete ? anSpriteRef.current : null,
        mien: mienImg,
      };

      ctx.imageSmoothingEnabled = false;
      const shakeAmt = sim.shake || 0;
      if (shakeAmt > 0.05) {
        ctx.save();
        const sx = (Math.random() - 0.5) * shakeAmt;
        const sy = (Math.random() - 0.5) * shakeAmt;
        ctx.translate(sx, sy);
      }
      ctx.drawImage(staticLayer, 0, 0);
      drawTubes(ctx, fr);
      drawStairs(ctx, fr);
      drawHallMirror(ctx, fr, sprites);
      drawHallClock(ctx, fr);
      drawHallWindow(ctx, fr);
      drawDoor314(ctx, fr);
      drawDoor312(ctx, fr);
      drawFuseBox(ctx, fr, sim.sparks);
      drawExtinguisher(ctx);
      drawNoticeBoard(ctx, fr);
      drawDoor316(ctx, fr);
      drawPuddles(ctx, fr, sprites, sim.ripples);
      drawFootprints(ctx, sim.stalker, t, 'base');
      // Ghế và An sắp xếp theo chiều sâu
      if (p.y + 16 < CHAIR.y + 25) {
        drawPlayer(ctx, fr, sprites);
        drawChair(ctx);
      } else {
        drawChair(ctx);
        drawPlayer(ctx, fr, sprites);
      }
      drawHallLighting(ctx, lightLayer, fr);
      // Bóng ma vẽ sau lớp tối: tự hắt một quầng mờ, chỉ thấy lờ mờ ở cuối vùng nhìn
      drawFleetingShadow(ctx, fr, sim.ghost);
      drawFootprints(ctx, sim.stalker, t, 'sheen');
      drawDust(ctx, sim.dust, fr);
      updateFollowLight(followLight, p.x, p.y - 20, k);
      drawFollowVignette(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, followLight, fr.sanity, t, hallVignette(fr));
      ctx.drawImage(postLayer, 0, 0);
      if (shakeAmt > 0.05) {
        ctx.restore();
      }
      drawEmotes(ctx, em, { cx: p.x, headY: p.y - AN_DRAW_H + 20 });
      drawHallHUD(ctx, fr);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [emotes]);

  // Lớp giao diện HTML phóng to cùng tỉ lệ với khung canvas
  const { ref: frameRef, scale: uiScale } = useFrameScale(CANVAS_WIDTH);
  useMouseParallax(canvasRef, parallax);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {/* Khung Canvas hiển thị Hành lang tầng 3 */}
      <div className="relative border-4 border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.9)] rounded-sm overflow-hidden" ref={frameRef} style={{ width: `min(96vw, calc((100vh - 60px) * ${CANVAS_WIDTH / CANVAS_HEIGHT}))`, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`, marginTop: 44 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pixelated block cursor-pointer w-full h-full"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute top-0 left-0" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${uiScale})`, transformOrigin: 'top left' }}>


        {/* Banner thông báo nhặt được vật phẩm mới */}
        {pickupAlert && (
          <div className="absolute top-3 right-3 z-40 w-72 max-w-[60%]" style={{ animation: 'pickup-in 0.25s ease-out' }}>
            <style>{'@keyframes pickup-in { from { opacity: 0; transform: translateX(16px) } to { opacity: 1; transform: none } }'}</style>
            <div className="bg-black/90 border border-yellow-500/80 px-2.5 py-2 rounded-md shadow-[0_0_10px_rgba(234,179,8,0.3)] flex items-start gap-2 backdrop-blur-md font-mono">
              <div className="text-lg leading-none shrink-0 mt-0.5">{pickupAlert.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-yellow-300 truncate">{tx(pickupAlert.name)}</span>
                  <button
                    onClick={() => {
                      setPickupAlert(null);
                      setIsInventoryOpen(true);
                    }}
                    className="text-[9px] px-1 py-0.5 border border-yellow-600/70 text-yellow-400 hover:bg-yellow-500 hover:text-black rounded cursor-pointer shrink-0"
                  >
                    I
                  </button>
                </div>
                <div className="text-[10px] text-zinc-300 mt-0.5 leading-snug">{tx(pickupAlert.msg)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Thanh gợi ý tương tác [E] dạng viên thuốc nổi đỉnh màn hình (chuẩn Màn 1 & 3) */}
        {activePrompt && (
          <div
            className={`absolute bottom-12 left-3 z-20 max-w-[55%] px-2 py-1 font-mono text-[11px] rounded-md flex items-center gap-1.5 backdrop-blur-sm ${
              activePrompt.isDone
                ? 'bg-black/85 border border-zinc-700/80 text-zinc-400'
                : 'bg-black/90 border border-orange-500 text-orange-100 shadow-[0_0_8px_rgba(249,115,22,0.35)]'
            }`}
          >
            <span
              className={`shrink-0 px-1 py-0.5 font-bold rounded text-[10px] leading-none ${
                activePrompt.isDone
                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  : 'bg-orange-500 text-black shadow-[0_0_8px_rgba(249,115,22,0.9)]'
              }`}
            >
              {activePrompt.isDone ? '✓' : 'E'}
            </span>
            <span className="truncate">{tx(activePrompt.text).replace(/^\[E\]\s*/, '').replace(/\s*-?\s*(?:Nhấn|Press) \[E\]\s*(?:để\s*|to\s*)?/i, ' · ')}</span>
          </div>
        )}

        {/* Độc thoại nội tâm */}
        {monologueWhisper && (
          <div
            onClick={() => setMonologueWhisper(null)}
            className="absolute bottom-12 right-3 max-w-xs sm:max-w-sm bg-black/95 border-l-4 border-cyan-400 border-t border-r border-b border-zinc-800 p-3 rounded-r shadow-2xl animate-fade-in z-20 backdrop-blur-md cursor-pointer hover:border-cyan-300 transition-colors"
            title={tx('Click để đóng nhanh')}
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-cyan-400 tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
              {tx('Độc thoại nội tâm')}
            </div>
            <p className="text-xs sm:text-sm font-sans text-zinc-300 italic leading-snug text-justify">
              &ldquo;{tx(monologueWhisper)}&rdquo;
            </p>
          </div>
        )}

        {/* HUD cố định ở đáy: viền kép retro neon, một hàng 3 cột gọn (chuẩn Màn 1) */}
        <div className="absolute bottom-2 left-3 right-3 z-10 p-0.5 rounded border border-orange-500/70 bg-black/80 shadow-[0_0_14px_rgba(249,115,22,0.35)] backdrop-blur-sm">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-1 rounded-sm border border-red-900/80 text-[10px] font-mono text-zinc-400 whitespace-nowrap">
            <div className="flex items-center gap-2.5">
              <span><span className="text-orange-400 font-bold">WASD</span> {t.hud.move}</span>
              <button
                onClick={() => setIsInventoryOpen(true)}
                className="hover:text-zinc-200 cursor-pointer"
                title={t.hud.inventoryTitle}
              >
                <span className="text-cyan-300 font-bold">I</span> {t.hud.inventory}
              </button>
              <span><span className="text-orange-400 font-bold">E</span> {t.hud.interact}</span>
            </div>
            <div className="text-center">
              {tx('Điện áp:')}{' '}
              {isPowerOn ? (
                <span className="text-emerald-400 font-bold">{tx('ỔN ĐỊNH 💡')}</span>
              ) : (
                <span className="text-red-400 font-bold animate-pulse">{tx('MẤT ĐIỆN ⚡')}</span>
              )}
            </div>
            <div className="text-red-500/80 font-bold truncate">{tx('HÀNH LANG TẦNG 3 • KHU TẬP THỂ CŨ')}</div>
          </div>
        </div>
        </div>
      </div>

      {/* Modal Túi đồ Ý Thức [I] */}
      <InventoryModal
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        items={inventoryItems}
        onCombineItems={handleCombineItems}
        onUseItem={handleUseItem}
        usedConsumableIds={localInteractedIds}
        volume={volume}
      />
    </div>
  );
};
