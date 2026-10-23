"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InventoryModal } from './InventoryModal';
import { InventoryItem, CHAPTER_1_ITEMS } from '../types/inventory';
import {
  DORM_PAL, hash, px, block, dropShadow,
  buildPostLayer, drawTargetMarker, drawVitals, drawHudSubtitle,
} from './pixel/pixelKit';
import { drawSpriteFrame, stepWalk, stopWalk, bodyBob } from './pixel/spriteKit';

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
}

// =====================================================================
// BỐ CỤC HÀNH LANG TẦNG 3 (khớp chính xác interactables & colliders)
// Khu tập thể cũ Hà Nội: gạch bông, tường vôi vàng ố / chân tường xanh rêu,
// ống nước rỉ sét chạy dọc trần, đèn tuýp huỳnh quang chập chờn.
// =====================================================================

const EMPTY_IDS: string[] = [];
const WALL_H = 145;                              // Chiều cao mảng tường sau (sàn bắt đầu từ y=145)
const FLOOR = { left: 60, top: 145, right: 580, bottom: 420 } as const;
const INTERACT_RADIUS = 75;
const HITBOX_HALF_W = 14;
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
const TUBES = [170, 430];                         // Toạ độ x hai bóng đèn tuýp (dài 60px)
const TUBE_Y = 10;

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
}

interface HallFrame {
  t: number;
  sanity: number;
  powerOn: boolean;
  pendantHere: boolean;    // Mặt dây chuyền còn nằm dưới khe cửa #316
  hasFuseItem: boolean;    // Có Băng dính / Kẹp ghim để nối cầu chì
  lightning: number;
  tubes: number[];         // Độ sáng từng bóng tuýp 0..1
  player: PlayerState;
  nearest: InteractableObject | null;
  snap: HallSnapshot;
}

interface HallSprites { an: HTMLImageElement | null }

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
        ? 'Cửa Phòng #316 [NIÊM PHONG CẢNH SÁT 17/05] - Nhấn [E] xem'
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

/** Cửa #316 phòng cũ của Miên: băng niêm phong cảnh sát chữ X, mặt dây chuyền lấp lánh dưới khe */
function drawDoor316(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const d = DOOR_316;
  drawDoorFrame(ctx, d, '316', '#991b1b');
  block(ctx, d.x, d.y + 18, d.w, d.h - 18, '#4a3326', '#5e4232', '#2c1d14');
  block(ctx, d.x + 6, d.y + 24, d.w - 12, 20, '#3e2a1f', '#2c1d14', '#5e4232');
  block(ctx, d.x + 6, d.y + 50, d.w - 12, 22, '#3e2a1f', '#2c1d14', '#5e4232');
  px(ctx, d.x + d.w - 9, d.y + 48, 3, 3, '#a8a29e');
  // Băng niêm phong vàng đen chữ X
  const tape = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
    px(ctx, 0, -4, len, 8, DORM_PAL.outline);
    px(ctx, 0, -3, len, 6, '#facc15');
    for (let i = 0; i < len; i += 8) px(ctx, i, -3, 4, 6, '#111');
    ctx.restore();
  };
  tape(d.x - 5, d.y + 22, d.x + d.w + 5, d.y + 74);
  tape(d.x - 5, d.y + 74, d.x + d.w + 5, d.y + 22);
  // Nhãn "CẢNH SÁT - KHÔNG VƯỢT QUA"
  block(ctx, d.x + 9, d.y + 43, 30, 9, '#f5f5f4', '#ffffff', '#a8a29e');
  ctx.font = 'bold 4px monospace';
  ctx.fillStyle = '#1d4ed8';
  ctx.fillText('CẢNH SÁT', d.x + 11, d.y + 49);
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
  ctx.fillText('CẦU DAO', x + 18, y + 42);
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
  ctx.fillText('MẤT TÍCH', x + 24, y + 21);
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
  px(ctx, x, y, w, h, L > 0.05 ? `rgb(${50 + L * 140},${60 + L * 160},${100 + L * 150})` : '#060912');
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
    if (fr.powerOn) tube = lv > 0.6 ? '#fffbe8' : '#c9c3a8';
    else tube = lv > 0.5 ? (Math.random() < 0.5 ? '#c4b5fd' : '#a5f3fc') : '#2a2f36';
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
  l.fillStyle = fr.powerOn ? 'rgba(8,10,16,0.5)' : 'rgba(3,5,10,0.94)';
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
    TUBES.forEach((tx, i) => punch(tx + 30, 190, 280, 0.95 * fr.tubes[i]));
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
    const tubeIdx = d.x < 320 ? 0 : 1;
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

/** HUD trên canvas: khung ngắm vật thể đang nhắm tới + đồng hồ/SANITY + nhãn điện áp */
function drawHallHUD(ctx: CanvasRenderingContext2D, fr: HallFrame) {
  const n = fr.nearest;
  if (n) {
    const done = isTargetDoneFor(n.id, fr.snap);
    drawTargetMarker(ctx, n, done ? 'rgba(161,161,170,0.75)' : '#fb923c', fr.t);
  }
  drawVitals(ctx, fr.t, fr.sanity);
  drawHudSubtitle(ctx, fr.powerOn ? 'ĐIỆN: ỔN ĐỊNH' : 'ĐIỆN: MẤT', fr.powerOn ? '#6ee7b7' : '#f87171');
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
  };
}

/** Cập nhật mô phỏng; trả về các sự kiện âm thanh cần phát trong frame này */
function updateHallSim(sim: HallSim, k: number, t: number, powerOn: boolean) {
  const events = { buzz: false, thunder: false };

  // Đèn tuýp: có điện → sáng ổn định (thỉnh thoảng nháy nhẹ); mất điện → hầu như tắt, chớp rè rè ngắt quãng
  for (const tb of sim.tubes) {
    if (powerOn) {
      if (tb.burst > 0) { tb.burst -= k; tb.level = Math.random() < 0.5 ? 0.55 : 1; }
      else {
        tb.level = 0.94 + Math.random() * 0.06;
        if (Math.random() < 0.002 * k) tb.burst = 4 + Math.random() * 8;
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

  // Sét: chớp chính → chớp phụ → sấm trễ (dày hơn khi mất điện)
  sim.lightning = Math.max(0, sim.lightning - 0.05 * k);
  if (t >= sim.nextLightning) {
    sim.lightning = 1;
    sim.secondFlashAt = t + 0.16;
    sim.thunderAt = t + 0.8;
    sim.nextLightning = t + (powerOn ? 10 : 6) + Math.random() * 9;
  }
  if (sim.secondFlashAt > 0 && t >= sim.secondFlashAt) {
    sim.lightning = Math.max(sim.lightning, 0.65);
    sim.secondFlashAt = -1;
  }
  if (sim.thunderAt > 0 && t >= sim.thunderAt) {
    sim.thunderAt = -1;
    events.thunder = true;
  }
  return events;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const anSpriteRef = useRef<HTMLImageElement | null>(null);

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

  // Độc thoại nội tâm
  const showMonologueWhisper = useCallback((msg: string) => {
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    setMonologueWhisper(msg);
    whisperTimerRef.current = setTimeout(() => {
      setMonologueWhisper(null);
    }, 4000);
  }, []);

  // Banner nhặt đồ
  const showPickupAlert = useCallback((name: string, icon: string, msg: string) => {
    playPickupSound();
    if (pickupAlertTimerRef.current) clearTimeout(pickupAlertTimerRef.current);
    setPickupAlert({ name, icon, msg });
    pickupAlertTimerRef.current = setTimeout(() => {
      setPickupAlert(null);
    }, 4500);
  }, [playPickupSound]);

  // Xử lý sử dụng vật phẩm trực tiếp từ Túi đồ
  const handleUseItem = useCallback(
    (item: InventoryItem) => {
      if (item.id === 'coffee') {
        if (localInteractedIds.includes('coffee_used')) {
          showMonologueWhisper('Bạn đã uống cạn cốc cà phê này rồi.');
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
      actionText: '[E] Soi khe cửa phòng niêm phong của Miên [✨]',
      x: 500,
      y: 120,
      w: 48,
      h: 50,
      triggerNodeId: 'node_hallway_door_316',
      canRepeat: true,
      checkedMonologue: 'Băng niêm phong cảnh sát dán kín cửa phòng của Miên. Không thể vào trong.',
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

            showMonologueWhisper('Cầu chì bị đứt khiến cả hành lang chìm trong bóng tối... Bạn cần tìm Cuộn Băng Dính hoặc Kẹp Ghim để nối lại!');
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

          // 5. Các điểm tương tác khác
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

  // Tiếng sấm rền xa sau mỗi tia chớp
  const playThunder = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const dur = 2.2;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(160, t);
      lp.frequency.exponentialRampToValueAtTime(60, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((volume / 100) * 0.22, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(lp);
      lp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur);
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

  const soundRef = useRef({ playStepSound, playFluoroBuzz, playThunder, playGhostTyping });
  useEffect(() => {
    soundRef.current = { playStepSound, playFluoroBuzz, playThunder, playGhostTyping };
  }, [playStepSound, playFluoroBuzz, playThunder, playGhostTyping]);

  const promptKeyRef = useRef('');

  // Game Loop (chạy một lần, đọc state qua ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const staticLayer = buildHallStaticLayer();
    const postDark = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT, 0.92, 120);
    const postLit = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT, 0.6, 180);
    const lightLayer = document.createElement('canvas');
    lightLayer.width = CANVAS_WIDTH;
    lightLayer.height = CANVAS_HEIGHT;
    const sim = createHallSim();

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
          if (stepWalk(p, k)) soundRef.current.playStepSound();
        } else {
          stopWalk(p);
        }
      }

      const powerOn = snap.interacted.includes('hallway_power_on');

      // Mô phỏng + âm thanh môi trường
      const events = updateHallSim(sim, k, t, powerOn);
      if (events.buzz) soundRef.current.playFluoroBuzz();
      if (events.thunder) soundRef.current.playThunder();
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
      const prompt = nearTarget ? computePrompt(nearTarget, snap) : null;
      const promptKey = prompt ? `${prompt.isDone}|${prompt.text}` : '';
      if (promptKey !== promptKeyRef.current) {
        promptKeyRef.current = promptKey;
        setActivePrompt(prompt);
      }

      // Vẽ
      const fr: HallFrame = {
        t,
        sanity: snap.sanity,
        powerOn,
        pendantHere: !(snap.inventory.includes('miens_pendant') || snap.interacted.includes('door_316_picked')),
        hasFuseItem: snap.inventory.includes('electrical_tape') || snap.inventory.includes('paperclip'),
        lightning: sim.lightning,
        tubes: sim.tubes.map((tb) => tb.level),
        player: p,
        nearest: nearTarget,
        snap,
      };
      const sprites: HallSprites = {
        an: anSpriteRef.current && anSpriteRef.current.complete ? anSpriteRef.current : null,
      };

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(staticLayer, 0, 0);
      drawTubes(ctx, fr);
      drawStairs(ctx, fr);
      drawHallWindow(ctx, fr);
      drawDoor314(ctx, fr);
      drawDoor312(ctx, fr);
      drawFuseBox(ctx, fr, sim.sparks);
      drawExtinguisher(ctx);
      drawNoticeBoard(ctx, fr);
      drawDoor316(ctx, fr);
      drawPuddles(ctx, fr, sprites, sim.ripples);
      // Ghế và An sắp xếp theo chiều sâu
      if (p.y + 16 < CHAIR.y + 25) {
        drawPlayer(ctx, fr, sprites);
        drawChair(ctx);
      } else {
        drawChair(ctx);
        drawPlayer(ctx, fr, sprites);
      }
      drawHallLighting(ctx, lightLayer, fr);
      drawDust(ctx, sim.dust, fr);
      ctx.drawImage(powerOn ? postLit : postDark, 0, 0);
      drawHallHUD(ctx, fr);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {/* Khung Canvas hiển thị Hành lang tầng 3 */}
      <div className="relative border-4 border-zinc-800 shadow-[0_0_50px_rgba(0,0,0,0.9)] rounded-sm overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pixelated block cursor-pointer max-w-full max-h-[86vh] object-contain"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Nút truy cập Túi Đồ [I] */}
        <button
          onClick={() => setIsInventoryOpen(true)}
          className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 bg-black/85 hover:bg-zinc-900 border border-cyan-500/80 hover:border-cyan-300 text-cyan-300 rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all font-mono text-xs cursor-pointer group"
          title="Nhấn phím [I] để mở túi đồ"
        >
          <span className="text-sm group-hover:scale-110 transition-transform">🎒</span>
          <span className="font-bold tracking-wider">[I] TÚI ĐỒ</span>
          <span className="bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800 text-[10px] text-cyan-400 font-bold">
            {localInventoryIds.length}
          </span>
        </button>

        {/* Banner thông báo nhặt được vật phẩm mới */}
        {pickupAlert && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-sm sm:max-w-md w-[92%] px-2 animate-bounce">
            <div className="bg-black/95 border-2 border-yellow-400 p-3 rounded shadow-[0_0_25px_rgba(234,179,8,0.5)] flex items-center gap-3 backdrop-blur-md">
              <div className="text-3xl shrink-0 p-1.5 bg-yellow-950/80 border border-yellow-500 rounded">
                {pickupAlert.icon}
              </div>
              <div className="flex-1 overflow-hidden font-mono">
                <div className="text-[10px] text-yellow-400 font-bold tracking-widest uppercase">
                  ✨ VẬT PHẨM MỚI ĐÃ THU THẬP
                </div>
                <div className="text-xs sm:text-sm font-bold text-white truncate">
                  {pickupAlert.name}
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-300 mt-0.5 leading-snug">
                  {pickupAlert.msg}
                </div>
              </div>
              <button
                onClick={() => {
                  setPickupAlert(null);
                  setIsInventoryOpen(true);
                }}
                className="px-2.5 py-1 text-[10px] bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded cursor-pointer shrink-0 font-mono shadow-sm"
              >
                XEM [I]
              </button>
            </div>
          </div>
        )}

        {/* Thanh gợi ý tương tác [E] dạng viên thuốc nổi đỉnh màn hình (chuẩn Màn 1 & 3) */}
        {activePrompt && (
          <div
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[92%] px-3.5 py-1.5 font-mono text-xs rounded-full flex items-center gap-2 backdrop-blur-sm ${
              activePrompt.isDone
                ? 'bg-black/85 border border-zinc-700/80 text-zinc-400'
                : 'bg-black/90 border border-orange-500 text-orange-100 shadow-[0_0_20px_rgba(249,115,22,0.6)] animate-bounce'
            }`}
          >
            <span
              className={`shrink-0 px-1.5 py-0.5 font-bold rounded text-[10px] ${
                activePrompt.isDone
                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  : 'bg-orange-500 text-black shadow-[0_0_8px_rgba(249,115,22,0.9)]'
              }`}
            >
              {activePrompt.isDone ? 'ĐÃ KIỂM TRA' : 'E'}
            </span>
            <span className="truncate">{activePrompt.text}</span>
          </div>
        )}

        {/* Độc thoại nội tâm */}
        {monologueWhisper && (
          <div
            onClick={() => setMonologueWhisper(null)}
            className="absolute bottom-12 right-3 max-w-xs sm:max-w-sm bg-black/95 border-l-4 border-cyan-400 border-t border-r border-b border-zinc-800 p-3 rounded-r shadow-2xl animate-fade-in z-20 backdrop-blur-md cursor-pointer hover:border-cyan-300 transition-colors"
            title="Click để đóng nhanh"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-cyan-400 tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
              Độc thoại nội tâm
            </div>
            <p className="text-xs sm:text-sm font-sans text-zinc-300 italic leading-snug">
              &ldquo;{monologueWhisper}&rdquo;
            </p>
          </div>
        )}

        {/* HUD cố định ở đáy: viền kép retro neon, một hàng 3 cột gọn (chuẩn Màn 1) */}
        <div className="absolute bottom-2 left-3 right-3 z-10 p-0.5 rounded border border-orange-500/70 bg-black/80 shadow-[0_0_14px_rgba(249,115,22,0.35)] backdrop-blur-sm">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-1 rounded-sm border border-red-900/80 text-[10px] font-mono text-zinc-400 whitespace-nowrap">
            <div className="flex items-center gap-2.5">
              <span><span className="text-orange-400 font-bold">WASD</span> Di chuyển</span>
              <button
                onClick={() => setIsInventoryOpen(true)}
                className="hover:text-zinc-200 cursor-pointer"
                title="Nhấn phím [I] để mở túi đồ"
              >
                <span className="text-cyan-300 font-bold">I</span> Túi đồ
              </button>
              <span><span className="text-orange-400 font-bold">E</span> Tương tác</span>
            </div>
            <div className="text-center">
              Điện áp:{' '}
              {isPowerOn ? (
                <span className="text-emerald-400 font-bold">ỔN ĐỊNH 💡</span>
              ) : (
                <span className="text-red-400 font-bold animate-pulse">MẤT ĐIỆN ⚡</span>
              )}
            </div>
            <div className="text-red-500/80 font-bold truncate">HÀNH LANG TẦNG 3 • KHU TẬP THỂ CŨ</div>
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
