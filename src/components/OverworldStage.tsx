"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InventoryModal } from './InventoryModal';
import { InventoryItem, CHAPTER_1_ITEMS } from '../types/inventory';
import {
  RoomRect, DORM_PAL, hash, px, block, dropShadow, outlinedText,
  drawWoodFloor, drawDormWalls, drawCalendar, drawPoster,
  buildPostLayer, drawTargetMarker, drawVitals, drawHudSubtitle,
} from './pixel/pixelKit';
import { drawSpriteFrame, getSpriteFrame, stepWalk, stopWalk, bodyBob, mienFloat, drawSwayingFigure, drawHoloShadow, drawHoloDust } from './pixel/spriteKit';

// --- Kích thước và Tỉ lệ ---
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

type Direction = 'down' | 'left' | 'right' | 'up';

const DIR_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2, // Lật ngang (flip horizontal)
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
  checkedMonologue?: string; // Câu độc thoại ngắn gọn lướt qua khi kiểm tra lại
}

interface OverworldStageProps {
  characterSprite: string;
  sanity: number;
  setSanity?: React.Dispatch<React.SetStateAction<number>>;
  onTrigger: (nodeId: string) => void;
  onExitToHallway?: () => void;
  interactedIds?: string[];
  onMarkInteracted?: (id: string) => void;
  inventoryIds?: string[];
  onUpdateInventory?: (newInventoryIds: string[]) => void;
  insertedDisk?: boolean;
  onInsertDisk?: () => void;
  volume?: number;
}

// =====================================================================
// BỐ CỤC PHÒNG TRỌ #314 (khớp chính xác interactables & colliders)
// =====================================================================

const EMPTY_IDS: string[] = [];
const ROOM: RoomRect = { left: 70, top: 95, right: 570, bottom: 435 };
const INTERACT_RADIUS = 75;
const HITBOX_HALF_W = 14;
const AN_DRAW_W = 42;
const AN_DRAW_H = 63;

// Manh mối cốt truyện của phòng trọ (dùng cho Phase & HUD)
const STORY_CLUE_IDS = ['pc_terminal', 'phone', 'mirror', 'window', 'pills', 'door'];
const HUD_CLUE_TARGET = 5;

// Vị trí các vật thể vẽ trên canvas
const BED = { x: 70, y: 95, w: 110, h: 90 };
const NIGHTSTAND = { x: 70, y: 200, w: 50, h: 45 };
const TEA_TABLE = { x: 80, y: 265, w: 60, h: 42 };
const DESK = { x: 250, y: 95, w: 110, h: 55 };
const LAMP_LIGHT = { x: 334, y: 118 };          // Tâm ánh sáng đèn bàn sợi đốt
const CRT_LIGHT = { x: 297, y: 108 };           // Tâm ánh sáng màn hình CRT
const CURTAIN_WINDOW = { x: 180, y: 22, w: 70, h: 56 };
const BOOKSHELF = { x: 460, y: 52, w: 55, h: 98 }; // Kệ cao, đứng sát tường (chân ở y=150)
const PHONE_TABLE = { x: 445, y: 155, w: 42, h: 32 };
const MIRROR = { x: 535, y: 92, w: 34, h: 62 };
const BOX = { x: 425, y: 305, w: 46, h: 38 };
const DOOR = { x: 35, y: 310, w: 35, h: 75 };
const FLOOR_FAN = { x: 541, y: 404 };
const MIEN = { x: 375, y: 120, w: 42, h: 63 };
const MIEN_FLOOR_Y = 180; // Mặt sàn dưới chân Miên (bàn chân ở ~92% chiều cao sprite)

// Vật cản không cho đi xuyên qua (Solid Bounding Boxes) — giữ nguyên toàn bộ + thêm quạt cóc
const COLLIDERS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  // Tường bao quanh phòng
  { x: 0, y: 0, w: CANVAS_WIDTH, h: 95 },       // Tường trên
  { x: 0, y: 0, w: 70, h: CANVAS_HEIGHT },      // Tường trái
  { x: CANVAS_WIDTH - 70, y: 0, w: 70, h: CANVAS_HEIGHT }, // Tường phải
  { x: 0, y: CANVAS_HEIGHT - 45, w: CANVAS_WIDTH, h: 45 }, // Tường dưới

  // Bàn máy tính CRT + Ghế
  { x: 250, y: 95, w: 110, h: 55 },
  // Giường ngủ lộn xộn góc trái
  { x: 70, y: 95, w: 110, h: 90 },
  // Bàn nhỏ để thuốc
  { x: 70, y: 200, w: 50, h: 45 },
  // Bàn bệt sinh viên (bát mì, dao rọc giấy, bật lửa)
  { x: 80, y: 265, w: 60, h: 42 },
  // Thùng carton của Miên
  { x: 425, y: 305, w: 46, h: 38 },
  // Tủ sách nhỏ góc phải (để trống lối đi thoáng x: 515-570 tới gương vỡ)
  { x: 460, y: 95, w: 55, h: 55 },
  // Bàn nhỏ để điện thoại
  { x: 445, y: 155, w: 42, h: 32 },
  // Quạt cóc để sàn góc phải dưới
  { x: 528, y: 400, w: 26, h: 20 },
];

// =====================================================================
// KIỂU DỮ LIỆU VÒNG LẶP
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

/** Ảnh chụp state React mới nhất cho vòng lặp RAF (đọc qua ref, không khởi động lại loop) */
interface RoomSnapshot {
  sanity: number;
  interacted: string[];
  inventory: string[];
  insertedDisk: boolean;
  terminalUnlocked: boolean;
  modalOpen: boolean;
}

/** Cờ trạng thái đồ vật suy ra từ snapshot (quyết định vật nào còn nằm trong phòng) */
interface RoomFlags {
  coffeeOnDesk: boolean;
  cutterOnTable: boolean;
  lighterOnTable: boolean;
  clipOnShelf: boolean;
  diskUnderBed: boolean;
  hasLighter: boolean;
  drawerLooted: boolean;
  hasPaperclip: boolean;
  insertedDisk: boolean;
  boxOpened: boolean;
  hasCutter: boolean;
  terminalUnlocked: boolean;
  phoneHeard: boolean;
  pillsTaken: boolean;
  powerOn: boolean;
}

interface RoomFrame {
  t: number;
  phase: 1 | 2 | 3;
  sanity: number;
  knocking: boolean;
  flicker: boolean;
  lightning: number;   // 0..1 cường độ chớp sét
  lamp: number;        // 0..1 độ sáng đèn bàn sợi đốt
  flags: RoomFlags;
  player: PlayerState;
  nearest: InteractableObject | null;
  cluesFound: number;
  snap: RoomSnapshot;
}

interface Dust { x: number; y: number; vx: number; vy: number; phase: number }

interface RoomSim {
  dust: Dust[];
  lightning: number;
  nextLightning: number;
  secondFlashAt: number;
  thunderAt: number;
  lastKnockKey: number;
}

interface RoomSprites {
  an: HTMLImageElement | null;
  mien: HTMLImageElement | null;
}

const deriveFlags = (s: RoomSnapshot): RoomFlags => {
  const inv = s.inventory;
  const ia = s.interacted;
  const diskDone = inv.includes('aura_disk') || s.insertedDisk;
  return {
    coffeeOnDesk: !inv.includes('coffee') && !ia.includes('coffee_used'),
    cutterOnTable: !inv.includes('box_cutter'),
    lighterOnTable: !inv.includes('lighter'),
    clipOnShelf: !inv.includes('paperclip'),
    diskUnderBed: !(inv.includes('disk_part_1') || diskDone),
    hasLighter: inv.includes('lighter'),
    drawerLooted: inv.includes('disk_part_2') || diskDone,
    hasPaperclip: inv.includes('paperclip'),
    insertedDisk: s.insertedDisk,
    boxOpened: inv.includes('electrical_tape') || ia.includes('cardboard_box'),
    hasCutter: inv.includes('box_cutter'),
    terminalUnlocked: s.terminalUnlocked,
    phoneHeard: ia.includes('phone'),
    pillsTaken: ia.includes('pills'),
    powerOn: ia.includes('hallway_power_on'),
  };
};

/** Kiểm tra trạng thái đã hoàn thành của từng đối tượng (logic giữ nguyên bản gốc) */
const isTargetDoneFor = (targetId: string, s: RoomSnapshot): boolean => {
  const inv = s.inventory;
  const ia = s.interacted;
  if (targetId === 'pc') return s.terminalUnlocked;
  if (targetId === 'tea_table') return inv.includes('box_cutter') && inv.includes('lighter');
  if (targetId === 'coffee_mug') return inv.includes('coffee') || ia.includes('coffee_used');
  if (targetId === 'cardboard_box') return inv.includes('electrical_tape') || ia.includes('cardboard_box');
  if (targetId === 'bookshelf') return inv.includes('paperclip');
  if (targetId === 'under_bed') return inv.includes('disk_part_1') || inv.includes('aura_disk') || s.insertedDisk;
  if (targetId === 'pc_drawer') return inv.includes('disk_part_2') || inv.includes('aura_disk') || s.insertedDisk;
  if (targetId === 'pills') return ia.includes('pills');
  return ia.includes(targetId);
};

/** Nội dung thanh gợi ý [E] cho vật thể đang nhắm tới (giữ nguyên văn bản gốc) */
const computePrompt = (
  target: InteractableObject,
  s: RoomSnapshot,
  isKnockingNow: boolean,
): { text: string; isDone: boolean } => {
  const inv = s.inventory;
  const ia = s.interacted;
  switch (target.id) {
    case 'pc': {
      const isPowerRestored = ia.includes('hallway_power_on');
      if (s.terminalUnlocked) return { text: 'Màn hình CRT (ĐÃ GIẢI MÃ) - Nhấn [E] để đọc log AURA', isDone: true };
      if (!isPowerRestored) return { text: '⚠️ Màn hình CRT [MẤT ĐIỆN LƯỚI ⚡] - Ra Hành lang tầng 3 đóng Cầu Dao trước', isDone: false };
      if (s.insertedDisk) return { text: 'Màn hình CRT [ĐÃ CẮM ĐĨA] - Nhấn [E] để GIẢI MÃ (Mã PIN 1705)', isDone: false };
      if (inv.includes('aura_disk')) return { text: 'Màn hình CRT - Nhấn [E] để CẮM ĐĨA MỀM AURA [💽]', isDone: false };
      return { text: 'Màn hình CRT [CẦN ĐĨA MỀM AURA] - Nhấn [E] kiểm tra', isDone: false };
    }
    case 'coffee_mug': {
      const isDone = inv.includes('coffee') || ia.includes('coffee_used');
      return {
        text: isDone ? 'Vệt ố cà phê tròn - Nhấn [E] kiểm tra' : 'Cốc Cà Phê Đen Đặc [☕ HỒI +15 SANITY] - Nhấn [E] để nhặt',
        isDone,
      };
    }
    case 'tea_table': {
      if (!inv.includes('box_cutter')) return { text: 'Bàn trà bệt [CÓ DAO RỌC GIẤY 🔪] - Nhấn [E] để nhặt', isDone: false };
      if (!inv.includes('lighter')) return { text: 'Bàn trà bệt [CÓ BẬT LỬA ZIPPO 🔥] - Nhấn [E] để nhặt', isDone: false };
      return { text: 'Bàn trà bệt sinh viên - Nhấn [E] để kiểm tra lại', isDone: true };
    }
    case 'cardboard_box': {
      const hasOpened = inv.includes('electrical_tape') || ia.includes('cardboard_box');
      if (hasOpened) return { text: 'Thùng carton của Miên [ĐÃ RẠCH MỞ] - Nhấn [E] kiểm tra lại', isDone: true };
      if (inv.includes('box_cutter')) return { text: 'Thùng carton niêm phong [CÓ THỂ RẠCH BĂNG KEO 🔪] - Nhấn [E] để mở', isDone: false };
      return { text: 'Thùng carton niêm phong [DÁN BĂNG KEO CHẶT] - Nhấn [E] kiểm tra', isDone: false };
    }
    case 'under_bed': {
      const hasP1 = inv.includes('disk_part_1') || inv.includes('aura_disk') || s.insertedDisk;
      if (hasP1) return { text: 'Gầm giường tối - Nhấn [E] để kiểm tra lại', isDone: true };
      if (inv.includes('lighter')) return { text: 'Gầm giường tối [CÓ THỂ SOI BẬT LỬA 🔥] - Nhấn [E] để soi tìm', isDone: false };
      return { text: 'Gầm giường tối [TỐI ĐEN NHƯ MỰC] - Nhấn [E] kiểm tra', isDone: false };
    }
    case 'pc_drawer': {
      const hasP2 = inv.includes('disk_part_2') || inv.includes('aura_disk') || s.insertedDisk;
      if (hasP2) return { text: 'Hộc bàn máy tính [ĐÃ CẠY KHÓA] - Nhấn [E] kiểm tra lại', isDone: true };
      if (inv.includes('paperclip')) return { text: 'Hộc bàn máy tính [CÓ THỂ DÙNG KẸP GHIM 📎] - Nhấn [E] để cạy chốt', isDone: false };
      return { text: 'Hộc bàn máy tính [KẸT KHÓA CƠ] - Nhấn [E] kiểm tra', isDone: false };
    }
    case 'bookshelf': {
      const hasClip = inv.includes('paperclip');
      return {
        text: hasClip ? 'Kệ sách cũ - Nhấn [E] kiểm tra lại' : 'Kệ sách cũ [CÓ KẸP GHIM 📎] - Nhấn [E] để lục tìm',
        isDone: hasClip,
      };
    }
    case 'pills': {
      const isDone = ia.includes('pills');
      return {
        text: isDone ? 'Bàn thuốc an thần - Nhấn [E] kiểm tra lại' : 'Bàn thuốc an thần [ĐƠN: 17/05] - Nhấn [E] để xem',
        isDone,
      };
    }
    case 'door':
      return {
        text: isKnockingNow
          ? '⚠️ Cửa Phòng Trọ [CÓ TIẾNG GÕ CỘC CỘC] - Nhấn [E] mở cửa ra Hành lang tầng 3 [🚪]'
          : 'Cửa Phòng Trọ #314 - Nhấn [E] bước ra Hành lang tầng 3 [🚪]',
        isDone: false,
      };
    case 'mien':
      return {
        text: s.terminalUnlocked
          ? '✨ Nắm tay Miên [KÝ ỨC THỨC TỈNH] - Bước qua cánh cửa bước sang Chương 2!'
          : 'Miên (Hình bóng trong ký ức) - Nhấn [E] nói chuyện (Cần mở khóa máy tính trước)',
        isDone: s.terminalUnlocked,
      };
    default: {
      const isDone = ia.includes(target.id) && !target.canRepeat;
      return { text: isDone ? `${target.name} - Nhấn [E] để kiểm tra lại` : target.actionText, isDone };
    }
  }
};

// =====================================================================
// LỚP NỀN TĨNH (dựng một lần → drawImage mỗi frame)
// Sàn gỗ, giấy dán tường, poster, lịch dùng chung pixelKit với nửa trái Màn 3
// =====================================================================

/** Bụi bám kẽ ván + dither tối dần sát chân tường (ambient occlusion pixel) */
function drawFloorGrime(ctx: CanvasRenderingContext2D) {
  // Bụi xám trong kẽ ván
  for (let y = ROOM.top + 11, r = 0; y < ROOM.bottom; y += 12, r++) {
    for (let i = 0; i < 26; i++) {
      const x = ROOM.left + hash(r * 53 + i * 7) * (ROOM.right - ROOM.left);
      px(ctx, x, y, 1 + Math.floor(hash(i + r) * 3), 1, 'rgba(150,130,110,0.35)');
    }
  }
  // Dither caro tối dần về 4 cạnh phòng
  for (let band = 0; band < 3; band++) {
    const alpha = 0.32 - band * 0.09;
    const off = band * 4;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let x = ROOM.left; x < ROOM.right; x += 2) {
      const dy = (x / 2) % 2;
      ctx.fillRect(x, ROOM.top + off + dy, 1, 1);
      ctx.fillRect(x, ROOM.top + off + 2 + dy, 1, 1);
      ctx.fillRect(x, ROOM.bottom - off - 2 - dy, 1, 1);
    }
    for (let y = ROOM.top; y < ROOM.bottom; y += 2) {
      const dx = (y / 2) % 2;
      ctx.fillRect(ROOM.left + off + dx, y, 1, 1);
      ctx.fillRect(ROOM.left + off + 2 + dx, y, 1, 1);
      ctx.fillRect(ROOM.right - off - 2 - dx, y, 1, 1);
      ctx.fillRect(ROOM.right - off - 4 - dx, y, 1, 1);
    }
  }
  // Cụm bụi góc phòng
  for (let i = 0; i < 18; i++) {
    const corner = i % 3;
    const cx = corner === 0 ? ROOM.left + 6 : corner === 1 ? ROOM.right - 10 : ROOM.left + 180;
    const cy = corner === 2 ? ROOM.bottom - 6 : ROOM.bottom - 8;
    px(ctx, cx + hash(i * 3) * 14 - 7, cy - hash(i * 5) * 6, 2, 1, 'rgba(120,110,100,0.45)');
  }
}

/** Tường ẩm mốc: vết nứt chân tường, vệt nước loang, đốm mốc */
function drawWallDamage(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = 'rgba(15,8,4,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Vết nứt chân tường bò lên
  const cracks: Array<[number, number]> = [[150, 18], [372, 26], [520, 22]];
  for (const [cx, hgt] of cracks) {
    ctx.moveTo(cx, ROOM.top - 8);
    ctx.lineTo(cx - 3, ROOM.top - 8 - hgt * 0.4);
    ctx.lineTo(cx + 2, ROOM.top - 8 - hgt * 0.7);
    ctx.lineTo(cx - 1, ROOM.top - 8 - hgt);
    ctx.moveTo(cx + 2, ROOM.top - 8 - hgt * 0.7);
    ctx.lineTo(cx + 7, ROOM.top - 8 - hgt * 0.85);
  }
  ctx.stroke();
  // Vệt nước rỉ dưới cửa sổ
  const grad = ctx.createLinearGradient(0, CURTAIN_WINDOW.y + CURTAIN_WINDOW.h, 0, ROOM.top - 8);
  grad.addColorStop(0, 'rgba(25,30,20,0.55)');
  grad.addColorStop(1, 'rgba(25,30,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(CURTAIN_WINDOW.x + 10, CURTAIN_WINDOW.y + CURTAIN_WINDOW.h, 12, ROOM.top - 8 - CURTAIN_WINDOW.y - CURTAIN_WINDOW.h);
  ctx.fillRect(CURTAIN_WINDOW.x + 46, CURTAIN_WINDOW.y + CURTAIN_WINDOW.h, 8, ROOM.top - 8 - CURTAIN_WINDOW.y - CURTAIN_WINDOW.h);
  // Đốm mốc xanh đen
  for (let i = 0; i < 40; i++) {
    const mx = 470 + hash(i * 11) * 90;
    const my = 6 + hash(i * 13) * 30;
    px(ctx, mx, my, 1 + Math.floor(hash(i) * 2), 1, 'rgba(35,48,28,0.6)');
  }
}

/** Poster ban nhạc rock retro 2000s (tự chế, không phải ban nhạc thật) */
function drawRockPoster(ctx: CanvasRenderingContext2D, x: number, y: number) {
  block(ctx, x, y, 34, 46, '#141414', '#2a2a2a', '#000000');
  // Tia sét + cây guitar cách điệu
  px(ctx, x + 4, y + 4, 26, 22, '#7f1d1d');
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(x + 19, y + 5); ctx.lineTo(x + 11, y + 16); ctx.lineTo(x + 17, y + 16);
  ctx.lineTo(x + 13, y + 26); ctx.lineTo(x + 24, y + 13); ctx.lineTo(x + 18, y + 13);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#e5e5e5';
  ctx.fillText('SÓNG ÂM', x + 4, y + 34);
  ctx.fillStyle = '#ef4444';
  ctx.fillText('LIVE 2004', x + 3, y + 42);
  // Mép giấy quăn + đinh ghim
  px(ctx, x + 15, y - 1, 3, 3, '#cbd5e1');
  px(ctx, x, y + 38, 6, 8, 'rgba(74,58,43,0.9)');
}

/** Thảm sợi cũ bạc màu giữa phòng */
function drawRug(ctx: CanvasRenderingContext2D) {
  const x = 200;
  const y = 220;
  const w = 230;
  const h = 140;
  block(ctx, x, y, w, h, '#4a2430', '#5c2f3c', '#381a24');
  ctx.strokeStyle = 'rgba(214,170,110,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 14, y + 14, w - 28, h - 28);
  // Hoa văn trám giữa thảm
  ctx.fillStyle = 'rgba(214,170,110,0.22)';
  for (let i = 0; i < 5; i++) {
    const cx = x + 45 + i * 35;
    ctx.beginPath();
    ctx.moveTo(cx, y + 50); ctx.lineTo(cx + 10, y + 70); ctx.lineTo(cx, y + 90); ctx.lineTo(cx - 10, y + 70);
    ctx.closePath();
    ctx.fill();
  }
  // Mòn sờn & vết bẩn
  for (let i = 0; i < 60; i++) px(ctx, x + hash(i * 3) * w, y + hash(i * 7) * h, 2, 1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = 'rgba(30,15,10,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 160, y + 100, 18, 9, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // Tua rua hai đầu
  for (let fx = x + 2; fx < x + w; fx += 4) {
    px(ctx, fx, y - 3, 1, 3, '#a68a64');
    px(ctx, fx, y + h, 1, 3, '#a68a64');
  }
}

/** Cây treo áo gỗ: áo khoác đen của An + khăn len hồng của Miên */
function drawCoatRack(ctx: CanvasRenderingContext2D) {
  dropShadow(ctx, 50, 275, 9, 2.5, 0.5);
  px(ctx, 47, 228, 6, 48, DORM_PAL.outline);
  px(ctx, 48, 229, 4, 46, '#6b3f1f');
  px(ctx, 48, 229, 1, 46, '#8a5a33');
  px(ctx, 41, 272, 18, 3, '#4a2a12');
  px(ctx, 43, 230, 14, 2, '#8a5a33');
  // Áo khoác đen
  block(ctx, 42, 234, 9, 23, '#1c1c22', '#2e2e36', '#0c0c10');
  px(ctx, 45, 240, 1, 14, '#3f3f46');
  // Khăn len hồng
  block(ctx, 51, 233, 6, 25, '#f472b6', '#f9a8d4', '#be185d');
  for (let y = 236; y < 256; y += 3) px(ctx, 51, y, 6, 1, 'rgba(190,24,93,0.5)');
  px(ctx, 52, 256, 2, 4, '#ec4899');
  px(ctx, 55, 256, 2, 4, '#ec4899');
}

/** Dựng toàn bộ lớp nền tĩnh của phòng trọ */
function buildRoomStaticLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_WIDTH;
  c.height = CANVAS_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  drawWoodFloor(ctx, ROOM.left, ROOM.top, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawFloorGrime(ctx);
  drawDormWalls(ctx, ROOM, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawWallDamage(ctx);
  drawRockPoster(ctx, 118, 22);
  drawPoster(ctx, 392, 16, DORM_PAL.wallDorm);
  drawCalendar(ctx, 442, 24);
  drawRug(ctx);
  drawCoatRack(ctx);
  // Ổ cắm Lioa dưới chân bàn + dây điện loằng ngoằng
  block(ctx, 332, 150, 18, 7, '#e7e5e4', '#fafaf9', '#a8a29e');
  px(ctx, 335, 152, 3, 2, '#1c1917');
  px(ctx, 341, 152, 3, 2, '#1c1917');
  ctx.strokeStyle = '#0a0a0c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(336, 153); ctx.quadraticCurveTo(320, 162, 300, 150);
  ctx.moveTo(346, 153); ctx.quadraticCurveTo(356, 160, 352, 148);
  ctx.stroke();
  return c;
}

// =====================================================================
// HÀM VẼ ĐỘNG — MỖI VẬT THỂ MỘT HÀM
// =====================================================================

/** Vẽ sprite An sắc nét (lật ngang khi quay trái); t dùng cho nhịp nhún bước / thở */
function drawAnSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, p: PlayerState, x: number, y: number, t: number, w = AN_DRAW_W, h = AN_DRAW_H, row = DIR_ROW[p.dir]) {
  const flip = p.dir === 'left' && row === DIR_ROW.left;
  drawSpriteFrame(ctx, img, p.frame, row, flip, x, y + bodyBob(p, t), w, h);
}

/** Cửa sổ kín rèm hoa: mưa rào trên kính, song sắt, chớp sét hắt sáng */
function drawCurtainWindow(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = CURTAIN_WINDOW;
  const flash = fr.lightning;
  // Khung gỗ + bậu cửa
  block(ctx, x - 4, y - 4, w + 8, h + 8, '#3b2616', '#5b3a22', '#24150b');
  // Bầu trời đêm (bừng sáng khi sét đánh)
  const sky = flash > 0.05 ? `rgb(${60 + flash * 150},${70 + flash * 160},${110 + flash * 140})` : '#0a0d1a';
  px(ctx, x, y, w, h, sky);
  // Mái nhà đối diện in bóng
  px(ctx, x, y + h - 14, w, 14, flash > 0.05 ? '#1e2233' : '#05060c');
  px(ctx, x + 8, y + h - 20, 18, 6, flash > 0.05 ? '#1e2233' : '#05060c');
  px(ctx, x + 12, y + h - 10, 3, 3, '#facc15');              // Ô cửa nhà bên còn sáng
  // Mưa rào xiên ngoài kính
  ctx.strokeStyle = 'rgba(170,200,240,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const rx = x + ((i * 11 + fr.t * 60) % w);
    const ry = y + ((i * 23 + fr.t * 220) % h);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 2, ry + 6);
  }
  ctx.stroke();
  // Giọt nước chảy dọc trên mặt kính
  for (let i = 0; i < 6; i++) {
    const dx = x + 6 + i * 11;
    const dy = y + ((fr.t * (8 + i * 3) + i * 17) % (h - 6));
    px(ctx, dx, dy, 1, 3, 'rgba(220,235,255,0.7)');
    px(ctx, dx, dy - 4, 1, 4, 'rgba(220,235,255,0.25)');
  }
  // Song sắt
  for (let bx = x + 12; bx < x + w; bx += 18) {
    px(ctx, bx, y, 2, h, '#1f2933');
    px(ctx, bx, y, 1, h, '#4b5563');
  }
  px(ctx, x, y + h / 2, w, 2, '#1f2933');
  // Phase 3: cửa sổ không còn được kết xuất
  if (fr.phase === 3) {
    px(ctx, x, y, w, h, 'rgba(60,0,20,0.6)');
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = Math.sin(fr.t * 10) > 0 ? '#ef4444' : '#f9a8d4';
    ctx.fillText('NO_RENDER', x + w / 2, y + h / 2 + 3);
    ctx.textAlign = 'left';
  }
  // Rèm hoa cũ khép hờ: hai tấm rủ, chừa khe giữa đung đưa nhẹ
  const sway = Math.sin(fr.t * 0.8) * 1.5;
  const curtain = (cx: number, cw: number, flip: boolean) => {
    block(ctx, cx, y - 6, cw, h + 10, '#6b5a3a', '#8a7650', '#4a3d27');
    for (let fx = cx + 3; fx < cx + cw; fx += 5) px(ctx, fx, y - 5, 1, h + 8, 'rgba(40,30,15,0.35)'); // Nếp gấp
    // Hoa nhí in vải bạc màu
    for (let i = 0; i < 8; i++) {
      const hx = cx + 3 + hash(i * 7 + (flip ? 3 : 0)) * (cw - 6);
      const hy = y + hash(i * 13 + (flip ? 5 : 0)) * h;
      px(ctx, hx, hy, 2, 2, 'rgba(190,90,90,0.75)');
      px(ctx, hx + 1, hy + 2, 1, 1, 'rgba(90,120,70,0.75)');
    }
  };
  curtain(x - 6, 30 + sway, false);
  curtain(x + w - 22 + sway, 28 - sway, true);
  // Thanh treo rèm
  px(ctx, x - 10, y - 8, w + 20, 3, '#9ca3af');
  px(ctx, x - 10, y - 8, w + 20, 1, '#e5e7eb');
}

/** Cửa phòng #314: gỗ sờn, biển số, ánh vàng hành lang lọt qua khe, rung khi bị gõ */
function drawDoor(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const shake = fr.knocking ? Math.sin(fr.t * 54) * 2 : 0;
  const x = DOOR.x + shake;
  const { y, w, h } = DOOR;
  // Khung cửa
  block(ctx, DOOR.x - 3, y - 3, w + 6, h + 6, '#2e1d10', '#4e311c', '#1b130c');
  // Cánh cửa gỗ
  block(ctx, x, y, w, h, '#5a3a20', '#77502d', '#3b2414');
  block(ctx, x + 5, y + 7, w - 10, 26, '#4e311c', '#3b2414', '#67432a');
  block(ctx, x + 5, y + 40, w - 10, 28, '#4e311c', '#3b2414', '#67432a');
  // Vết xước sơn
  px(ctx, x + 8, y + 18, 6, 1, '#8a5a33');
  px(ctx, x + 20, y + 52, 4, 1, '#8a5a33');
  // Biển số 314 đồng
  block(ctx, x + 9, y + 34, 17, 6, '#b88a2c', '#e0b84f', '#7a5a1a');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#2a1a05';
  ctx.fillText('314', x + 11, y + 39);
  // Tay nắm tròn đồng
  px(ctx, x + w - 8, y + 37, 4, 4, '#eab308');
  px(ctx, x + w - 8, y + 37, 2, 2, '#fef08a');
  // Ánh vàng nhạt hành lang lọt qua khe cửa
  const leak = 0.55 + Math.sin(fr.t * 2) * 0.08;
  px(ctx, DOOR.x + w, y + 3, 2, h - 6, `rgba(255,214,140,${leak})`);

  // Sóng âm + cảnh báo khi có tiếng gõ cửa
  if (fr.knocking) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(70, 348, 10 + ((fr.t * 60) % 16), -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    outlinedText(ctx, '[!] CỘC CỘC!', 52, 302, Math.sin(fr.t * 24) > 0 ? '#ef4444' : '#ffffff');
    ctx.textAlign = 'left';
  }
}

/** Ma trận ký tự rơi trên hai tường bên ở Phase 3 */
function drawWallMatrix(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  if (fr.phase !== 3) return;
  const chars = ['0', '1', 'A', 'U', 'R', 'A', 'N', 'U', 'L', 'L', 'E', 'R', 'R', 'O', 'R'];
  ctx.font = '9px monospace';
  ctx.fillStyle = Math.sin(fr.t * 15) > 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(217, 70, 239, 0.7)';
  const tk = fr.t * 60;
  for (let c = 0; c < 3; c++) {
    ctx.fillText(chars[(c + Math.floor(tk / 15)) % chars.length], 10 + c * 18, (tk * 2 + c * 60) % (CANVAS_HEIGHT - 60) + 20);
    ctx.fillText(chars[(c * 2 + Math.floor(tk / 12)) % chars.length], CANVAS_WIDTH - 60 + c * 18, (tk * 2.2 + c * 50) % (CANVAS_HEIGHT - 60) + 20);
  }
}

/** Giường gỗ thấp: nệm mỏng, chăn len cuộn tròn, gầm giường tối (Mảnh đĩa A lấp lánh khi có bật lửa) */
function drawBed(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = BED;
  dropShadow(ctx, x + w / 2, y + h, w / 2, 5, 0.5);
  // Khung giường gỗ
  block(ctx, x, y + 4, w, h - 6, '#4a2e1a', '#67432a', '#2e1d10');
  // Gầm giường tối om
  px(ctx, x + 4, y + h - 13, w - 8, 9, '#040203');
  px(ctx, x + 4, y + h - 13, w - 8, 1, '#1a0f08');
  for (let i = 0; i < 8; i++) px(ctx, x + 8 + hash(i * 5) * (w - 16), y + h - 7, 2, 1, 'rgba(120,110,100,0.4)'); // Bụi gầm
  if (fr.flags.diskUnderBed && fr.flags.hasLighter) {
    // Ánh phản quang của Mảnh Đĩa Mềm A
    const a = Math.sin(fr.t * 9) * 0.4 + 0.6;
    px(ctx, 115, 175, 5, 3, `rgba(251,191,36,${a})`);
    px(ctx, 116, 176, 1, 1, '#ffffff');
  }
  // Nệm mỏng sọc
  block(ctx, x + 4, y + 7, w - 8, h - 24, '#6f7a8f', '#8a95aa', '#4b5568');
  for (let sx = x + 10; sx < x + w - 6; sx += 8) px(ctx, sx, y + 8, 1, h - 26, 'rgba(40,48,64,0.35)');
  // Gối nhàu
  block(ctx, x + 9, y + 11, 30, 18, '#e8e4da', '#fbf8f0', '#b5ae9f');
  px(ctx, x + 14, y + 18, 18, 1, '#c9c2b2');
  // Chăn len cuộn tròn (màu theo Phase / Sanity)
  const blanket = fr.sanity <= 25 ? '#7f1d1d' : fr.phase === 3 ? '#581c87' : '#2b3952';
  const blanketHi = fr.sanity <= 25 ? '#b91c1c' : fr.phase === 3 ? '#7e22ce' : '#3f5275';
  block(ctx, x + 46, y + 12, 56, 20, blanket, blanketHi, '#111827');
  for (let kx = x + 49; kx < x + 100; kx += 4) px(ctx, kx, y + 15, 2, 14, 'rgba(0,0,0,0.18)'); // Vân len đan
  px(ctx, x + 96, y + 14, 5, 16, 'rgba(255,255,255,0.12)');   // Đầu cuộn
  // Mép chăn rủ xuống nệm
  ctx.fillStyle = blanket;
  ctx.beginPath();
  ctx.moveTo(x + 50, y + 32); ctx.lineTo(x + 98, y + 32); ctx.lineTo(x + 92, y + 52); ctx.lineTo(x + 60, y + 58);
  ctx.closePath();
  ctx.fill();
  // Cuốn sách mở úp trên nệm + dây sạc
  block(ctx, x + 18, y + 40, 16, 10, '#d6d3d1', '#f5f5f4', '#a8a29e');
  px(ctx, x + 25, y + 40, 1, 10, '#78716c');
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 36, y + 56); ctx.quadraticCurveTo(x + 60, y + 70, x + 40, y + 80);
  ctx.stroke();
}

/** Bàn thuốc an thần: cốc nước, vỉ thuốc đỏ phát sáng, đơn thuốc 17/05 */
function drawNightstand(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = NIGHTSTAND;
  dropShadow(ctx, x + w / 2, y + h, w / 2, 4);
  block(ctx, x, y + 4, w, h - 14, '#5a3a20', '#77502d', '#3b2414');
  block(ctx, x, y + h - 10, w, 9, '#3b2414', '#4e311c', '#24150b');
  px(ctx, x + w / 2 - 3, y + h - 7, 6, 2, '#a68a64');
  // Cốc nước lọc trong suốt
  block(ctx, x + 6, y + 7, 9, 12, 'rgba(200,225,255,0.35)', 'rgba(255,255,255,0.7)', 'rgba(120,150,190,0.5)');
  px(ctx, x + 7, y + 12, 7, 6, 'rgba(147,197,253,0.45)');
  // Vỉ thuốc an thần
  if (!fr.flags.pillsTaken) {
    const glow = Math.sin(fr.t * 6) * 0.5 + 0.5;
    block(ctx, x + 21, y + 10, 14, 9, `rgba(239,68,68,${0.45 + glow * 0.45})`, '#fca5a5', '#7f1d1d');
    for (let i = 0; i < 3; i++) px(ctx, x + 23 + i * 4, y + 13, 2, 2, '#fff');
  } else {
    block(ctx, x + 21, y + 10, 14, 9, '#a1a1aa', '#d4d4d8', '#52525b');       // Vỉ rỗng
    for (let i = 0; i < 3; i++) px(ctx, x + 23 + i * 4, y + 13, 2, 2, '#3f3f46');
  }
  // Tờ đơn thuốc ghi 17/05
  block(ctx, x + 30, y + 22, 15, 11, '#f5efd6', '#ffffff', '#c9c1a2');
  ctx.font = '4px monospace';
  ctx.fillStyle = '#b91c1c';
  ctx.fillText('17/05', x + 31, y + 29);
}

/** Bàn bệt sinh viên: bát mì Hảo Hảo bốc khói, cốc nước, bao diêm, gạt tàn, dao rọc giấy, Zippo */
function drawTeaTable(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = TEA_TABLE;
  dropShadow(ctx, x + w / 2, y + h + 1, w / 2 + 2, 4);
  // Chân sắt gập
  px(ctx, x + 3, y + h - 6, 3, 6, '#1e293b');
  px(ctx, x + w - 6, y + h - 6, 3, 6, '#1e293b');
  // Mặt bàn gỗ ép + cạnh trước
  block(ctx, x, y, w, h - 9, '#8a5a33', '#a8743f', '#67432a');
  block(ctx, x, y + h - 9, w, 4, '#5a3a20', '#67432a', '#3b2414');
  // Bát mì Hảo Hảo ăn dở
  ctx.fillStyle = DORM_PAL.outline;
  ctx.beginPath();
  ctx.ellipse(95, 281, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f5f4';
  ctx.beginPath();
  ctx.ellipse(95, 281, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c2410c';                                  // Nước dùng tôm chua cay
  ctx.beginPath();
  ctx.ellipse(95, 280, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, 90, 279, 8, 2, '#fde68a');                          // Sợi mì
  px(ctx, 92, 281, 6, 1, '#fcd34d');
  px(ctx, 87, 284, 16, 1, '#dc2626');                         // Viền đỏ bát
  // Đôi đũa tre gác ngang
  px(ctx, 85, 275, 20, 1, '#d97706');
  px(ctx, 86, 277, 19, 1, '#b45309');
  // Sợi khói pixel bốc lên lờ đờ
  for (let i = 0; i < 4; i++) {
    const life = (fr.t * 0.35 + i * 0.25) % 1;
    const sy = 274 - life * 22;
    const sx = 94 + Math.sin(fr.t * 1.4 + i * 1.7) * (1 + life * 3);
    px(ctx, sx, sy, 2, 2, `rgba(230,230,230,${0.45 * (1 - life)})`);
  }
  // Cốc nước lọc
  block(ctx, 124, 268, 7, 10, 'rgba(200,225,255,0.35)', 'rgba(255,255,255,0.7)', 'rgba(120,150,190,0.5)');
  px(ctx, 125, 272, 5, 5, 'rgba(147,197,253,0.45)');
  // Bao diêm Thống Nhất
  block(ctx, 109, 270, 9, 6, '#dc2626', '#f87171', '#7f1d1d');
  px(ctx, 111, 272, 5, 2, '#facc15');
  // Gạt tàn + đốm tàn đỏ leo lét
  block(ctx, 83, 290, 9, 7, '#64748b', '#94a3b8', '#334155');
  px(ctx, 85, 292, 5, 3, '#1e293b');
  if (Math.sin(fr.t * 4) > -0.3) px(ctx, 87, 293, 2, 1, '#f87171');
  // Dao rọc giấy cán vàng (nếu chưa nhặt)
  if (fr.flags.cutterOnTable) {
    block(ctx, 98, 292, 16, 4, '#facc15', '#fde68a', '#a16207');
    px(ctx, 114, 293, 5, 2, '#e2e8f0');
    px(ctx, 103, 293, 3, 2, '#18181b');
    if (Math.sin(fr.t * 5.2) > 0) {
      px(ctx, 117, 291, 2, 2, '#ffffff');
      px(ctx, 99, 290, 2, 2, '#fef08a');
    }
  }
  // Bật lửa Zippo cũ (nếu chưa nhặt)
  if (fr.flags.lighterOnTable) {
    block(ctx, 126, 286, 7, 9, '#94a3b8', '#e2e8f0', '#475569');
    px(ctx, 126, 285, 7, 2, '#64748b');
    if (Math.sin(fr.t * 6) > 0) {
      px(ctx, 128, 281, 3, 3, '#f97316');
      px(ctx, 129, 282, 1, 2, '#fef08a');
    }
  }
}

/** Bàn máy tính: CRT hổ phách/xanh lá, đèn bàn sợi đốt, case PC quạt quay, hộc bàn kẹt khóa, cốc cà phê */
function drawComputerDesk(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = DESK;
  const f = fr.flags;
  dropShadow(ctx, x + w / 2, y + h, w / 2 + 4, 5);
  // Chân bàn
  px(ctx, x + 2, y + h - 8, 4, 9, '#24150b');
  px(ctx, x + w - 6, y + h - 8, 4, 9, '#24150b');
  // Mặt bàn + cạnh trước (cùng tông gỗ với bàn học Màn 3)
  block(ctx, x, y + 3, w, 34, '#7a5230', '#9a6c42', '#5b3a22');
  block(ctx, x, y + 37, w, 12, '#4e311c', '#5b3a22', '#2e1d10');

  // Hộc bàn bên trái: kẹt khóa → cạy mở toang khi đã lấy Mảnh Đĩa B
  if (f.drawerLooted) {
    block(ctx, x + 2, y + 40, 24, 13, '#3b2414', '#5b3a22', '#24150b');
    px(ctx, x + 4, y + 42, 20, 8, '#140b05');                // Lòng ngăn kéo trống
    px(ctx, x + 12, y + 52, 4, 1, '#a68a64');
  } else {
    block(ctx, x + 4, y + 39, 22, 9, '#5b3a22', '#67432a', '#3b2414');
    const keyColor = f.hasPaperclip ? (Math.sin(fr.t * 8) > 0 ? '#fde047' : '#facc15') : '#71717a';
    px(ctx, x + 14, y + 42, 3, 3, keyColor);
  }

  // Cốc cà phê sứ trắng + khói (nếu chưa nhặt), ngược lại là vệt ố tròn
  if (f.coffeeOnDesk) {
    block(ctx, x - 1, y + 13, 10, 12, '#f8fafc', '#ffffff', '#cbd5e1');
    px(ctx, x - 4, y + 16, 3, 6, '#cbd5e1');
    px(ctx, x, y + 13, 8, 3, '#1c1917');
    for (let i = 0; i < 3; i++) {
      const life = (fr.t * 0.6 + i * 0.33) % 1;
      px(ctx, x + 3 + Math.sin(fr.t * 2 + i) * 2, y + 10 - life * 14, 2, 2, `rgba(255,255,255,${0.45 * (1 - life)})`);
    }
    if (Math.sin(fr.t * 5) > 0) px(ctx, x + 6, y + 11, 2, 2, '#fef08a');
  } else {
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 20, 5, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Màn hình CRT be cũ
  const mx = 272;
  const my = 86;
  block(ctx, mx, my, 50, 42, '#d6ccb4', '#efe6cf', '#9e9277');
  px(ctx, mx + 4, my + 40, 42, 3, '#9e9277');                 // Đế
  const sx = mx + 4;
  const sy = my + 4;
  const sw = 42;
  const sh = 28;
  const flick = Math.sin(fr.t * 31) > 0.92 ? 0.7 : 1;
  if (!f.powerOn) {
    // Mất điện lưới: màn hình chập chờn chỉ còn con trỏ
    px(ctx, sx, sy, sw, sh, '#0a0806');
    if (Math.sin(fr.t * 4) > 0) px(ctx, sx + 3, sy + sh - 6, 4, 2, '#7c4a03');
    ctx.font = '5px monospace';
    ctx.fillStyle = 'rgba(180,110,20,0.5)';
    ctx.fillText('NO POWER', sx + 3, sy + 8);
  } else if (f.terminalUnlocked) {
    px(ctx, sx, sy, sw, sh, '#02160a');
    ctx.fillStyle = `rgba(16,185,129,${0.25 * flick})`;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.font = '5px monospace';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('ACCESS OK', sx + 3, sy + 8);
    ctx.fillText('AURA.LOG', sx + 3, sy + 15);
    ctx.fillStyle = Math.sin(fr.t * 5) > 0 ? '#bbf7d0' : '#4ade80';
    ctx.fillText('> 17/05_', sx + 3, sy + 22);
  } else {
    px(ctx, sx, sy, sw, sh, '#1a0e00');
    ctx.fillStyle = `rgba(245,158,11,${0.22 * flick})`;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.font = '5px monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('C:\\>AURA', sx + 3, sy + 8);
    ctx.fillText(f.insertedDisk ? 'DISK: OK' : 'DISK: ---', sx + 3, sy + 15);
    ctx.fillStyle = Math.sin(fr.t * 5) > 0 ? '#fde68a' : '#f59e0b';
    ctx.fillText('PIN:____', sx + 3, sy + 22);
  }
  for (let ly = sy; ly < sy + sh; ly += 2) px(ctx, sx, ly, sw, 1, 'rgba(0,0,0,0.28)'); // Scanline CRT
  px(ctx, sx + 2, sy + 2, 10, 1, 'rgba(255,255,255,0.18)');   // Loá kính cong
  px(ctx, mx + 42, my + 35, 3, 2, f.powerOn ? '#22c55e' : '#7f1d1d');

  // Bàn phím + chuột
  block(ctx, 278, 129, 36, 6, '#3f3f46', '#52525b', '#27272a');
  for (let k = 0; k < 8; k++) px(ctx, 280 + k * 4, 131, 3, 2, '#71717a');
  block(ctx, 318, 130, 5, 5, '#3f3f46', '#52525b', '#27272a');

  // Đèn bàn học sợi đốt (chụp xanh rêu như đèn bàn Màn 3)
  px(ctx, 326, 125, 12, 3, '#1f2937');
  px(ctx, 331, 106, 2, 19, '#374151');
  px(ctx, 324, 104, 9, 2, '#374151');
  block(ctx, 320, 98, 13, 7, '#15803d', '#22c55e', '#14532d');
  px(ctx, 322, 105, 9, 2, fr.lamp > 0.35 ? '#fff3c4' : '#7c6a3a');

  // Case PC: quạt tản nhiệt quay, LED, khe đĩa mềm
  const hum = f.powerOn && Math.sin(fr.t * 90) > 0.6 ? 1 : 0; // Rung rè rè
  const cx = 340 + hum * 0.5;
  block(ctx, cx, 92, 17, 48, '#1a1a1f', '#2c2c33', '#09090b');
  // Quạt tản nhiệt
  const fcx = cx + 8.5;
  const fcy = 104;
  px(ctx, fcx - 6, fcy - 6, 12, 12, '#0b0b0e');
  const spin = fr.t * (f.powerOn ? 14 : 2);
  ctx.fillStyle = f.powerOn ? '#3f3f46' : '#27272a';
  for (let b = 0; b < 4; b++) {
    const a = spin + (b * Math.PI) / 2;
    ctx.fillRect(Math.round(fcx + Math.cos(a) * 3) - 1, Math.round(fcy + Math.sin(a) * 3) - 1, 3, 3);
  }
  px(ctx, fcx - 1, fcy - 1, 2, 2, '#52525b');
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 1;
  ctx.strokeRect(fcx - 6.5, fcy - 6.5, 13, 13);
  // LED nguồn
  px(ctx, cx + 3, 115, 2, 2, f.powerOn ? (Math.sin(fr.t * 6) > 0 ? '#00ff41' : '#ff0055') : '#3f0a0a');
  px(ctx, cx + 3, 119, 2, 2, f.powerOn ? '#00ff41' : '#1f2937');
  // Khe đĩa mềm 3.5"
  px(ctx, cx + 2, 124, 13, 3, '#000');
  if (f.insertedDisk) {
    px(ctx, cx + 3, 124, 11, 2, '#06b6d4');
    px(ctx, cx + 12, 129, 2, 2, Math.sin(fr.t * 13) > 0 ? '#10b981' : '#065f46');
  }

  // Thùng rác nhỏ cạnh bàn
  block(ctx, 228, 127, 14, 18, '#3f3f46', '#52525b', '#27272a');
  px(ctx, 230, 125, 5, 4, '#e4e4e7');
  px(ctx, 234, 127, 6, 4, '#d4d4d8');
}

/** Ghế xoay trước bàn máy tính */
function drawChair(ctx: CanvasRenderingContext2D) {
  dropShadow(ctx, 297, 167, 11, 3);
  px(ctx, 296, 160, 2, 7, '#27272a');
  block(ctx, 287, 151, 20, 10, '#1f1f24', '#2f2f36', '#0c0c10');
  block(ctx, 289, 149, 16, 3, '#2f2f36', '#3f3f46', '#18181b');
  px(ctx, 290, 166, 14, 2, '#18181b');
}

/** Tủ sách nhỏ: giáo trình đại học phủ bụi, kẹp giấy kim loại lấp lánh */
function drawBookshelf(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = BOOKSHELF;
  dropShadow(ctx, x + w / 2, y + h, w / 2, 4);
  block(ctx, x, y, w, h, '#3b2616', '#5b3a22', '#24150b');
  const shelves = [y + 6, y + 30, y + 54, y + 78];
  const bookColors = ['#1e3a8a', '#065f46', '#92400e', '#7f1d1d', '#3f3f46', '#a16207', '#4c1d95', '#155e75'];
  shelves.forEach((sy, si) => {
    px(ctx, x + 3, sy, w - 6, 20, '#1a0f08');                  // Lòng kệ tối
    px(ctx, x + 3, sy + 20, w - 6, 2, '#5b3a22');              // Tấm ván kệ
    let bx = x + 4;
    let i = 0;
    while (bx < x + w - 6) {
      const bw = 4 + Math.floor(hash(si * 17 + i) * 4);
      const bh = 13 + Math.floor(hash(si * 31 + i) * 6);
      if (si === 2 && i === 3) {
        // Một chồng sách nằm ngang
        for (let k = 0; k < 3; k++) px(ctx, bx, sy + 20 - (k + 1) * 4, 12, 3, bookColors[(k + 2) % bookColors.length]);
        bx += 13;
      } else {
        const col = bookColors[(si * 3 + i) % bookColors.length];
        px(ctx, bx, sy + 20 - bh, bw, bh, col);
        px(ctx, bx, sy + 20 - bh, 1, bh, 'rgba(255,255,255,0.12)');
        px(ctx, bx, sy + 20 - bh + 3, bw, 1, 'rgba(255,230,180,0.35)'); // Nhãn gáy
        px(ctx, bx, sy + 20 - bh, bw, 1, 'rgba(180,170,160,0.6)');      // Bụi phủ đỉnh sách
        bx += bw + 1;
      }
      i++;
    }
  });
  // Mạng nhện góc kệ
  ctx.strokeStyle = 'rgba(220,220,220,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w - 3, y + 2); ctx.lineTo(x + w - 14, y + 12);
  ctx.moveTo(x + w - 3, y + 7); ctx.lineTo(x + w - 10, y + 4);
  ctx.moveTo(x + w - 9, y + 2); ctx.lineTo(x + w - 3, y + 12);
  ctx.stroke();
  // Kẹp giấy kim loại lấp lánh (nếu chưa nhặt)
  if (fr.flags.clipOnShelf) {
    const blink = Math.sin(fr.t * 4.5) > 0;
    ctx.strokeStyle = blink ? '#e0f2fe' : '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(498.5, 118); ctx.lineTo(498.5, 124); ctx.lineTo(501.5, 124); ctx.lineTo(501.5, 119); ctx.lineTo(500, 119); ctx.lineTo(500, 123);
    ctx.stroke();
    if (blink) {
      px(ctx, 503, 116, 1, 3, '#ffffff');
      px(ctx, 502, 117, 3, 1, '#ffffff');
    }
  }
}

/** Bàn điện thoại: máy bàn phím số cũ, LED đỏ báo 1 cuộc gọi nhỡ lúc 03:14 */
function drawPhoneTable(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = PHONE_TABLE;
  dropShadow(ctx, x + w / 2, y + h, w / 2, 3.5);
  px(ctx, x + 2, y + h - 5, 3, 6, '#0f172a');
  px(ctx, x + w - 5, y + h - 5, 3, 6, '#0f172a');
  block(ctx, x, y + 2, w, h - 8, '#3b2a20', '#55402f', '#24170f');
  // Thân máy điện thoại be cũ
  block(ctx, x + 7, y + 6, 28, 18, '#cfc6b0', '#ece4cf', '#9a907a');
  // Ống nghe đặt trên giá
  block(ctx, x + 5, y + 3, 32, 5, '#2a2a30', '#3f3f46', '#111');
  // Dây xoắn
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(x + 4 - (i % 2), y + 9 + i * 3);
    ctx.lineTo(x + 6 + (i % 2), y + 10 + i * 3);
  }
  ctx.stroke();
  // Bàn phím số 3x4
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) px(ctx, x + 10 + c * 4, y + 10 + r * 3, 3, 2, '#6b7280');
  // Màn LCD xanh: cuộc gọi nhỡ 03:14
  px(ctx, x + 24, y + 10, 10, 6, '#9fb48a');
  ctx.font = '4px monospace';
  ctx.fillStyle = '#1f2a14';
  ctx.fillText('0314', x + 24, y + 15);
  // LED đỏ nhấp nháy khi chưa nghe hộp thư thoại
  const led = !fr.flags.phoneHeard
    ? (Math.sin(fr.t * 5) > 0 ? '#ef4444' : '#450a0a')
    : '#3f1d1d';
  px(ctx, x + 30, y + 18, 3, 3, led);
  // Mẩu giấy note
  block(ctx, x + 36, y + 14, 5, 6, '#fde68a', '#fef3c7', '#d97706');
}

/** Gương nứt dựa tường: mặt kính xước, phản chiếu bóng mờ u uất của An */
function drawMirror(ctx: CanvasRenderingContext2D, fr: RoomFrame, sprites: RoomSprites) {
  const { x, y, w, h } = MIRROR;
  dropShadow(ctx, x + w / 2, y + h, w / 2, 3);
  block(ctx, x, y, w, h, '#475569', '#64748b', '#1e293b');
  const gx = x + 3;
  const gy = y + 3;
  const gw = w - 6;
  const gh = h - 6;
  px(ctx, gx, gy, gw, gh, '#141225');
  const grad = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
  grad.addColorStop(0, 'rgba(140,130,200,0.22)');
  grad.addColorStop(1, 'rgba(10,10,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(gx, gy, gw, gh);

  // Bóng phản chiếu An: mờ dần theo khoảng cách, chậm hơn một nhịp (u uất)
  const p = fr.player;
  const dist = Math.hypot(p.x - (x + w / 2), p.y - (y + h / 2));
  if (sprites.an && dist < 170) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, gy, gw, gh);
    ctx.clip();
    ctx.globalAlpha = Math.max(0, 0.55 - dist / 340);
    const rw = 26;
    const rh = 39;
    const lag = Math.sin(fr.t * 1.2) * 1.5;
    drawAnSprite(ctx, sprites.an, p, gx + (gw - rw) / 2 + lag, gy + gh - rh - 2 + Math.min(6, (p.y - y) / 30), fr.t, rw, rh, DIR_ROW.down);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(40,20,70,0.45)';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.restore();
  }

  // Vết nứt mạng nhện
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 17, y + 25); ctx.lineTo(x + 14, y + 39); ctx.lineTo(x + 27, y + 47);
  ctx.moveTo(x + 17, y + 25); ctx.lineTo(x + 27, y + 21);
  ctx.moveTo(x + 17, y + 25); ctx.lineTo(x + 8, y + 30);
  ctx.stroke();
  // Vết xước mảnh
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 6); ctx.lineTo(x + 29, y + 15);
  ctx.moveTo(x + 5, y + 46); ctx.lineTo(x + 12, y + 54);
  ctx.stroke();
  // Ánh chớp lạnh trên vết nứt
  if (Math.sin(fr.t * 2.6) > 0.5) px(ctx, x + 16, y + 24, 2, 2, '#ffffff');
}

/** Thùng carton đồ kỷ niệm Miên gửi ở phòng An: băng keo chữ H, nhãn "ĐỒ CỦA MIÊN", mở toang sau khi rạch */
function drawCardboardBox(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y, w, h } = BOX;
  dropShadow(ctx, x + w / 2 + 2, y + h, w / 2 + 2, 4);
  block(ctx, x, y, w, h, '#c27c2c', '#dc9a4a', '#8a5418');
  px(ctx, x, y + 10, w, 1, 'rgba(90,50,10,0.5)');            // Nếp gấp nắp
  // Nhãn dán
  block(ctx, x + 6, y + 16, 20, 13, '#f8fafc', '#ffffff', '#cbd5e1');
  ctx.font = 'bold 4px monospace';
  ctx.fillStyle = '#dc2626';
  ctx.fillText('DỄ VỠ', x + 8, y + 21);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('MIÊN', x + 9, y + 27);
  if (!fr.flags.boxOpened) {
    // Băng keo chữ H
    px(ctx, x, y + 12, w, 5, '#92400e');
    px(ctx, x + 22, y, 6, h, '#92400e');
    px(ctx, x, y + 12, w, 1, '#b45309');
    if (fr.flags.hasCutter && Math.sin(fr.t * 6) > 0) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    }
  } else {
    // Nắp bật mở, lòng thùng, vụn xốp
    px(ctx, x + 4, y + 3, w - 8, 10, '#5a3410');
    px(ctx, x - 4, y - 3, 10, 5, '#dc9a4a');
    px(ctx, x + w - 6, y - 3, 10, 5, '#dc9a4a');
    for (let i = 0; i < 6; i++) px(ctx, x + 7 + hash(i * 3) * (w - 14), y + 5 + hash(i * 7) * 6, 3, 2, '#ffffff');
    px(ctx, x, y + 12, 7, 4, '#92400e');
    px(ctx, x + w - 7, y + 12, 7, 4, '#92400e');
  }
}

/** Quạt cóc để sàn: cánh quay tít nhẹ (chậm dần khi mất điện) */
function drawFloorFan(ctx: CanvasRenderingContext2D, fr: RoomFrame) {
  const { x, y } = FLOOR_FAN;
  dropShadow(ctx, x, y + 17, 14, 3.5);
  block(ctx, x - 13, y + 10, 26, 7, '#9cc9d6', '#c4e2ea', '#6b9aa8');
  px(ctx, x + 6, y + 12, 4, 3, '#f8fafc');                     // Núm số
  px(ctx, x - 2, y + 6, 4, 5, '#6b9aa8');
  // Lồng tròn + cánh
  ctx.fillStyle = 'rgba(25,40,50,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  const angle = fr.t * (fr.flags.powerOn ? 16 : 5);
  ctx.fillStyle = '#7fb3c4';
  for (let b = 0; b < 3; b++) {
    const a = angle + (b * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5, 4.5, 2.2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  px(ctx, x - 2, y - 2, 4, 4, '#e0f2fe');
  ctx.strokeStyle = '#c4e2ea';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y);
  ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11);
  ctx.stroke();
}

/** Miên (AURA Hologram): lơ lửng, tóc & tà váy lay nhẹ, bóng ma toả tím, bụi sáng bay quanh */
function drawMien(ctx: CanvasRenderingContext2D, fr: RoomFrame, sprites: RoomSprites) {
  const img = sprites.mien;
  if (!img) return;
  const tk = fr.t * 60;
  const floatOffset = mienFloat(fr.t);
  const mx = MIEN.x;
  const my = MIEN.y + floatOffset;
  const mcx = mx + MIEN.w / 2;
  // Bóng ma dẹt dưới chân + bụi sáng phía sau lưng
  drawHoloShadow(ctx, mcx, MIEN_FLOOR_Y, floatOffset, fr.t);
  drawHoloDust(ctx, mcx, my + MIEN.h / 2, MIEN.w, MIEN.h, fr.t, 'back');
  ctx.save();
  ctx.globalAlpha = 0.75 + Math.sin(tk * 0.2) * 0.15;
  // Đứng thẳng ở frame 1, quay mặt xuống
  drawSwayingFigure(ctx, getSpriteFrame(img, 1, 0, false, MIEN.w, MIEN.h), mx, my, fr.t);
  ctx.globalAlpha = 1;
  drawHoloDust(ctx, mcx, my + MIEN.h / 2, MIEN.w, MIEN.h, fr.t, 'front');
  ctx.globalAlpha = 0.75 + Math.sin(tk * 0.2) * 0.15;
  // Hạt pixel phát sáng bay quanh Miên ở Phase 3
  if (fr.phase === 3) {
    ctx.fillStyle = 'rgba(244, 114, 182, 0.8)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(mx - 5 + ((tk * 1.5 + i * 20) % 55), my + 50 - ((tk + i * 15) % 45), 2, 2);
    }
  }
  // Hào quang thức tỉnh khi máy tính đã được giải mã
  if (fr.flags.terminalUnlocked) {
    const r = 40 + Math.sin(tk * 0.1) * 6;
    const cx = mx + MIEN.w / 2;
    const cy = my + MIEN.h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
    grad.addColorStop(0, 'rgba(192, 132, 252, 0.45)');
    grad.addColorStop(0.7, 'rgba(232, 121, 249, 0.2)');
    grad.addColorStop(1, 'rgba(232, 121, 249, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Ngôi sao pixel thức tỉnh lơ lửng trên đầu
    const sy = my - 8 + Math.sin(tk * 0.15) * 3;
    px(ctx, cx - 1, sy - 4, 2, 9, '#fef08a');
    px(ctx, cx - 4, sy - 1, 9, 2, '#fef08a');
    px(ctx, cx, sy, 1, 1, '#ffffff');
  }
  // Tia sáng glitch quét qua người Miên
  if (tk % 60 < 6) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(mx, my + (tk % 50), MIEN.w, 3);
  }
  ctx.restore();
}

/** Nhân vật An: bóng elip mềm, bóng glitch thứ hai ở Phase 2-3 */
function drawPlayer(ctx: CanvasRenderingContext2D, fr: RoomFrame, sprites: RoomSprites) {
  const p = fr.player;
  // Bóng chân mềm (gradient tỏa)
  const sg = ctx.createRadialGradient(p.x, p.y + 16, 1, p.x, p.y + 16, 14);
  sg.addColorStop(0, 'rgba(0,0,0,0.6)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 14, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (fr.phase >= 2) {
    const off = Math.sin(fr.t * 15) * 6;
    ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + off + 5, p.y + 16, 11, 4.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (sprites.an) drawAnSprite(ctx, sprites.an, p, p.x - AN_DRAW_W / 2, p.y - AN_DRAW_H + 18, fr.t);
}

/** Vẽ đồ đạc + Miên + An theo thứ tự chiều sâu (y-sort theo chân vật thể) */
function drawRoomObjects(ctx: CanvasRenderingContext2D, fr: RoomFrame, sprites: RoomSprites) {
  const items: Array<{ y: number; draw: () => void }> = [
    { y: BED.y + BED.h, draw: () => drawBed(ctx, fr) },
    { y: NIGHTSTAND.y + NIGHTSTAND.h, draw: () => drawNightstand(ctx, fr) },
    { y: TEA_TABLE.y + TEA_TABLE.h, draw: () => drawTeaTable(ctx, fr) },
    { y: DESK.y + DESK.h, draw: () => drawComputerDesk(ctx, fr) },
    { y: 167, draw: () => drawChair(ctx) },
    { y: BOOKSHELF.y + BOOKSHELF.h, draw: () => drawBookshelf(ctx, fr) },
    { y: PHONE_TABLE.y + PHONE_TABLE.h, draw: () => drawPhoneTable(ctx, fr) },
    { y: MIRROR.y + MIRROR.h, draw: () => drawMirror(ctx, fr, sprites) },
    { y: BOX.y + BOX.h, draw: () => drawCardboardBox(ctx, fr) },
    { y: FLOOR_FAN.y + 17, draw: () => drawFloorFan(ctx, fr) },
    { y: 185, draw: () => drawMien(ctx, fr, sprites) },
    { y: fr.player.y + 16, draw: () => drawPlayer(ctx, fr, sprites) },
  ];
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/** Ánh sáng: lightmap bóng tối khoét lỗ + nguồn sáng màu (đèn bàn, CRT, khe cửa, sét) */
function drawLightingOverlay(ctx: CanvasRenderingContext2D, light: HTMLCanvasElement, fr: RoomFrame) {
  const l = light.getContext('2d');
  if (!l) return;
  const p = fr.player;
  const f = fr.flags;

  // 1) Bóng tối nền theo Phase / Sanity / chớp đèn
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  l.fillStyle = fr.flicker
    ? 'rgba(35, 5, 20, 0.95)'
    : fr.phase === 3
      ? 'rgba(20, 3, 20, 0.9)'
      : fr.sanity <= 25
        ? 'rgba(30, 0, 0, 0.9)'
        : 'rgba(5, 5, 12, 0.88)';
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
  punch(LAMP_LIGHT.x - 10, LAMP_LIGHT.y + 25, 175, 0.95 * fr.lamp);     // Đèn bàn sợi đốt
  punch(CRT_LIGHT.x, CRT_LIGHT.y + 10, 95, f.powerOn ? 0.6 : 0.15);       // Màn hình CRT
  punch(396, 150, 75, 0.8);                                                // Hào quang Miên
  punch(p.x, p.y, 80, 0.72);                                               // Quanh An
  punch(DOOR.x + DOOR.w + 6, DOOR.y + DOOR.h / 2, 48, 0.4);               // Ánh hành lang lọt khe
  punch(215, 70, 55, 0.22 + fr.lightning * 0.6);                          // Cửa sổ
  if (fr.lightning > 0.02) punch(320, 240, 420, fr.lightning * 0.55);     // Sét đánh bừng sáng
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
  // Vầng vàng ấm của đèn sợi đốt
  glow(LAMP_LIGHT.x - 8, LAMP_LIGHT.y + 22, 160, '255,170,80', 0.26 * fr.lamp);
  glow(326, 106, 18, '255,230,170', 0.5 * fr.lamp);
  // Ánh CRT hổ phách (đang khóa) / xanh lá (đã giải mã) hắt lên mặt bàn và mặt An
  if (f.powerOn) {
    const rgb = f.terminalUnlocked ? '60,255,140' : '255,176,50';
    glow(CRT_LIGHT.x, CRT_LIGHT.y + 14, 70, rgb, 0.17);
    const dCrt = Math.hypot(p.x - CRT_LIGHT.x, p.y - CRT_LIGHT.y);
    if (dCrt < 110) glow(p.x, p.y - 22, 16, rgb, 0.22 * (1 - dCrt / 110)); // Ánh màn hình trên mặt An
  }
  // Vệt vàng nhạt hành lang dưới khe cửa
  glow(DOOR.x + DOOR.w + 4, DOOR.y + DOOR.h / 2, 38, '255,210,130', 0.18);
  // Sét: ánh xanh trắng hắt qua cửa sổ + bóng song sắt in trên sàn
  if (fr.lightning > 0.02) {
    const L = fr.lightning;
    ctx.fillStyle = `rgba(170,190,255,${0.12 * L})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const wx0 = CURTAIN_WINDOW.x;
    const wx1 = CURTAIN_WINDOW.x + CURTAIN_WINDOW.w;
    ctx.fillStyle = `rgba(190,210,255,${0.32 * L})`;
    ctx.beginPath();
    ctx.moveTo(wx0, ROOM.top); ctx.lineTo(wx1, ROOM.top);
    ctx.lineTo(wx1 + 70, 330); ctx.lineTo(wx0 - 20, 330);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,10,${0.45 * L})`;
    for (let bx = wx0 + 12; bx < wx1; bx += 18) {
      const k = (bx - wx0) / CURTAIN_WINDOW.w;
      const bottomX = wx0 - 20 + k * (CURTAIN_WINDOW.w + 90);
      ctx.beginPath();
      ctx.moveTo(bx, ROOM.top); ctx.lineTo(bx + 2, ROOM.top);
      ctx.lineTo(bottomX + 5, 330); ctx.lineTo(bottomX, 330);
      ctx.closePath();
      ctx.fill();
    }
    // Song ngang
    ctx.beginPath();
    ctx.moveTo(wx0 - 8, 205); ctx.lineTo(wx1 + 30, 205); ctx.lineTo(wx1 + 31, 209); ctx.lineTo(wx0 - 9, 209);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Hạt bụi pixel trôi lơ lửng, chỉ hiện rõ trong vầng sáng đèn bàn */
function drawDust(ctx: CanvasRenderingContext2D, sim: RoomSim, fr: RoomFrame) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of sim.dust) {
    const dist = Math.hypot(d.x - LAMP_LIGHT.x, d.y - (LAMP_LIGHT.y + 20));
    const a = Math.max(0, 1 - dist / 140) * 0.75 * fr.lamp * (0.6 + Math.sin(fr.t * 2 + d.phase) * 0.4);
    if (a < 0.03) continue;
    ctx.fillStyle = `rgba(255,215,150,${a})`;
    ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1);
  }
  ctx.restore();
}

/** HUD trên canvas: chấm lấp lánh vật chưa xong, khung ngắm, nhãn Miên, đồng hồ + Sanity + nhịp tim */
function drawRoomHUD(ctx: CanvasRenderingContext2D, fr: RoomFrame, interactables: InteractableObject[]) {
  // Chấm lấp lánh nhẹ cho các vật phẩm chưa hoàn thành
  for (const item of interactables) {
    if (item.id === 'mien' || (fr.nearest && fr.nearest.id === item.id)) continue;
    if (!isTargetDoneFor(item.id, fr.snap) && (fr.t * 60 + item.x) % 60 < 20) {
      px(ctx, item.x + item.w / 2 - 1, item.y + item.h / 2 - 1, 3, 3, 'rgba(250, 204, 21, 0.6)');
    }
  }
  // Khung ngắm duy nhất cho vật thể đang nhắm tới
  const n = fr.nearest;
  if (n) {
    if (n.id === 'mien') {
      const ready = fr.flags.terminalUnlocked;
      drawTargetMarker(ctx, n, ready ? '#ec4899' : '#a855f7', fr.t);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      outlinedText(ctx, ready ? '[E] ✦ RỜI ĐI' : '[E] MIÊN', n.x + n.w / 2, n.y - 16, ready ? '#f9a8d4' : '#d8b4fe');
      ctx.textAlign = 'left';
    } else {
      const done = isTargetDoneFor(n.id, fr.snap);
      drawTargetMarker(ctx, n, done ? 'rgba(161,161,170,0.75)' : '#fb923c', fr.t);
    }
  }

  // Đồng hồ 03:14 AM + trái tim + thanh SANITY (dùng chung pixelKit)
  drawVitals(ctx, fr.t, fr.sanity);
  // Nhãn Phase
  const phaseLabel = fr.phase === 3 ? 'PHASE 3: MA TRẬN SỤP ĐỔ' : fr.phase === 2 ? 'PHASE 2: RẠN NỨT' : 'PHASE 1: BÌNH YÊN';
  drawHudSubtitle(ctx, phaseLabel, fr.phase === 3 ? '#f87171' : fr.phase === 2 ? '#fbbf24' : '#6ee7b7');
}

// =====================================================================
// MÔ PHỎNG: bụi, chớp sét
// =====================================================================

function createRoomSim(): RoomSim {
  return {
    dust: Array.from({ length: 46 }, (_, i) => ({
      x: 210 + hash(i * 3) * 230,
      y: 60 + hash(i * 7) * 200,
      vx: (hash(i * 11) - 0.5) * 0.12,
      vy: -0.03 - hash(i * 13) * 0.08,
      phase: hash(i) * 6.28,
    })),
    lightning: 0,
    nextLightning: 5 + Math.random() * 6,
    secondFlashAt: -1,
    thunderAt: -1,
    lastKnockKey: -1,
  };
}

/** Cập nhật bụi + sét; trả về true nếu đến lúc phát tiếng sấm */
function updateRoomSim(sim: RoomSim, k: number, t: number): boolean {
  for (const d of sim.dust) {
    d.x += (d.vx + Math.sin(t * 0.5 + d.phase) * 0.04) * k;
    d.y += d.vy * k;
    if (d.y < 50) { d.y = 270; d.x = 210 + Math.random() * 230; }
    if (d.x < 200) d.x = 440;
    if (d.x > 445) d.x = 205;
  }
  // Sét: chớp chính → chớp phụ ngắn → tiếng sấm trễ ~0.7s
  sim.lightning = Math.max(0, sim.lightning - 0.05 * k);
  if (t >= sim.nextLightning) {
    sim.lightning = 1;
    sim.secondFlashAt = t + 0.18;
    sim.thunderAt = t + 0.7;
    sim.nextLightning = t + 7 + Math.random() * 10;
  }
  if (sim.secondFlashAt > 0 && t >= sim.secondFlashAt) {
    sim.lightning = Math.max(sim.lightning, 0.7);
    sim.secondFlashAt = -1;
  }
  if (sim.thunderAt > 0 && t >= sim.thunderAt) {
    sim.thunderAt = -1;
    return true;
  }
  return false;
}

// =====================================================================
// COMPONENT
// =====================================================================

export const OverworldStage: React.FC<OverworldStageProps> = ({
  characterSprite,
  sanity,
  setSanity,
  onTrigger,
  onExitToHallway,
  interactedIds = EMPTY_IDS,
  onMarkInteracted,
  inventoryIds = EMPTY_IDS,
  onUpdateInventory,
  insertedDisk = false,
  onInsertDisk,
  volume = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anSpriteRef = useRef<HTMLImageElement | null>(null);
  const mienSpriteRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Vị trí nhân vật An (tọa độ pixel mượt mà)
  const playerRef = useRef({
    x: 220,
    y: 280,
    speed: 3.2,
    dir: 'down' as Direction,
    isMoving: false,
    frame: 1,
    animTimer: 0,
  });

  const [localInteractedIds, setLocalInteractedIds] = useState<string[]>(interactedIds);
  const [activePrompt, setActivePrompt] = useState<{ text: string; isDone: boolean } | null>(null);
  const [monologueWhisper, setMonologueWhisper] = useState<string | null>(null);
  const whisperTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keysHeld = useRef<Set<string>>(new Set());

  // State cho Terminal Mini-game giải mã mật khẩu máy tính
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [terminalPin, setTerminalPin] = useState('');
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalSuccess, setTerminalSuccess] = useState(false);
  const [isTerminalUnlocked, setIsTerminalUnlocked] = useState(false);

  // State gõ cửa ma quái
  const [isDoorKnocking, setIsDoorKnocking] = useState(false);

  // Audio helper Web Audio API
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

  // Tiếng bước chân trên sàn gỗ phòng trọ (trầm, ấm hơn sàn gạch hành lang)
  const playStepSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 + Math.random() * 25, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.06);
      g.gain.setValueAtTime((volume / 100) * 0.03, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng tạch tạch bàn phím Terminal
  const playKeyClick = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200 + Math.random() * 400, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.02);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.02);
    } catch {}
  }, [getAudioContext]);

  // Tiếng buzzer lỗi khi gõ sai mã PIN
  const playBuzzer = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.setValueAtTime(110, t + 0.1);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    } catch {}
  }, [getAudioContext]);

  // Tiếng chime thành công khi giải mã đúng
  const playChime = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.09);
        g.gain.setValueAtTime(0.06, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.25);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.25);
      });
    } catch {}
  }, [getAudioContext]);

  // Tiếng gõ cửa ma quái dồn dập
  const playKnockSound = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [0, 0.12, 0.24].forEach((delay) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t + delay);
        osc.frequency.exponentialRampToValueAtTime(45, t + delay + 0.06);
        g.gain.setValueAtTime(0.09, t + delay);
        g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + delay);
        osc.stop(t + delay + 0.06);
      });
    } catch {}
  }, [getAudioContext]);

  // Tiếng nhặt được vật phẩm (Chime 8-bit vui tươi)
  const playItemPickupSound = useCallback(() => {
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
        g.gain.setValueAtTime((volume / 100) * 0.08, t + idx * 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.16);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.05);
        osc.stop(t + idx * 0.05 + 0.16);
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng cắm đĩa mềm vào case máy tính (rẹc rẹc cơ học)
  const playInsertDiskSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(550, t + 0.15);
      osc.frequency.setValueAtTime(320, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);
      g.gain.setValueAtTime((volume / 100) * 0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng sấm rền xa sau mỗi tia chớp (nhiễu trắng lọc thông thấp)
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

  // State Túi đồ (Inventory)
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [localInventoryIds, setLocalInventoryIds] = useState<string[]>(inventoryIds);
  const [localInsertedDisk, setLocalInsertedDisk] = useState<boolean>(insertedDisk);
  const [pickupAlert, setPickupAlert] = useState<{ name: string; icon: string; msg: string } | null>(null);
  const pickupAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Đồng bộ khi prop từ cha thay đổi (điều chỉnh state ngay trong render thay vì effect)
  const [prevInteractedIds, setPrevInteractedIds] = useState(interactedIds);
  if (interactedIds !== prevInteractedIds) {
    setPrevInteractedIds(interactedIds);
    setLocalInteractedIds(interactedIds);
    if (interactedIds.includes('pc_terminal')) {
      setIsTerminalUnlocked(true);
    }
  }

  const [prevInventoryIds, setPrevInventoryIds] = useState(inventoryIds);
  if (inventoryIds !== prevInventoryIds) {
    setPrevInventoryIds(inventoryIds);
    setLocalInventoryIds(inventoryIds);
  }

  const [prevInsertedDisk, setPrevInsertedDisk] = useState(insertedDisk);
  if (insertedDisk !== prevInsertedDisk) {
    setPrevInsertedDisk(insertedDisk);
    setLocalInsertedDisk(insertedDisk);
  }

  // Hiển thị hộp thoại độc thoại cụt lủn lướt qua góc màn hình
  const showMonologueWhisper = useCallback((msg: string) => {
    if (whisperTimerRef.current) clearTimeout(whisperTimerRef.current);
    setMonologueWhisper(msg);
    whisperTimerRef.current = setTimeout(() => {
      setMonologueWhisper(null);
    }, 3800);
  }, []);

  // Hiển thị banner nhặt đồ
  const showPickupAlert = useCallback((name: string, icon: string, msg: string) => {
    playItemPickupSound();
    if (pickupAlertTimerRef.current) clearTimeout(pickupAlertTimerRef.current);
    setPickupAlert({ name, icon, msg });
    pickupAlertTimerRef.current = setTimeout(() => {
      setPickupAlert(null);
    }, 4500);
  }, [playItemPickupSound]);

  // Xử lý ghép vật phẩm từ InventoryModal
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

  // Xử lý sử dụng vật phẩm trực tiếp từ Túi đồ (cà phê, ảnh) - CHỈ SỬ DỤNG 1 LẦN DUY NHẤT
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

  // Danh sách các vật phẩm dạng InventoryItem
  const inventoryItems: InventoryItem[] = localInventoryIds
    .map(id => CHAPTER_1_ITEMS[id])
    .filter(Boolean);

  // Danh sách đồ vật và điểm tương tác trong phòng trọ (rải rác, có mục đích rõ ràng)
  const interactables = useRef<InteractableObject[]>([
    {
      id: 'pc',
      name: 'Màn hình máy tính cũ (Hồ sơ cá nhân)',
      actionText: '[E] Bật máy tính xem lại dữ liệu cũ',
      x: 270,
      y: 110,
      w: 80,
      h: 50,
      triggerNodeId: 'node_pc_1',
      canRepeat: true,
      checkedMonologue: 'Màn hình vi tính vẫn đang hiển thị các tập tin nhật ký cũ...',
    },
    {
      id: 'coffee_mug',
      name: 'Cốc Cà Phê Đen Đặc',
      actionText: '[E] Nhặt Cốc Cà Phê Đen [☕]',
      x: 245,
      y: 105,
      w: 25,
      h: 25,
      triggerNodeId: 'obj_coffee',
      canRepeat: false,
      checkedMonologue: 'Chỉ còn vệt cà phê ố tròn trên mặt bàn gỗ.',
    },
    {
      id: 'pc_drawer',
      name: 'Hộc Bàn Máy Tính Kẹt Khóa',
      actionText: '[E] Cạy then cài hộc bàn máy tính',
      x: 260,
      y: 135,
      w: 30,
      h: 25,
      triggerNodeId: 'obj_pc_drawer',
      canRepeat: true,
      checkedMonologue: 'Hộc bàn đã mở toang, bên trong trống rỗng.',
    },
    {
      id: 'tea_table',
      name: 'Bàn Trà Bệt Sinh Viên',
      actionText: '[E] Kiểm tra bàn trà bệt',
      x: 80,
      y: 265,
      w: 60,
      h: 42,
      triggerNodeId: 'obj_tea_table',
      canRepeat: true,
      checkedMonologue: 'Bàn bệt chỉ còn lại bát mì tôm đã nguội ngắt và tàn thuốc lá...',
    },
    {
      id: 'cardboard_box',
      name: 'Thùng Carton Đồ Kỷ Niệm Của Miên',
      actionText: '[E] Kiểm tra thùng carton dán băng keo',
      x: 425,
      y: 305,
      w: 46,
      h: 38,
      triggerNodeId: 'obj_cardboard_box',
      canRepeat: true,
      checkedMonologue: 'Thùng carton đã rạch mở toang, chỉ còn lại những mảnh xốp vụn vỡ.',
    },
    {
      id: 'bookshelf',
      name: 'Kệ Sách Cũ',
      actionText: '[E] Lục tìm giữa những cuốn sách cũ [📎]',
      x: 460,
      y: 95,
      w: 55,
      h: 55,
      triggerNodeId: 'obj_bookshelf',
      canRepeat: true,
      checkedMonologue: 'Chỉ còn những cuốn sách lập trình phủ bụi dày đặc...',
    },
    {
      id: 'under_bed',
      name: 'Gầm Giường Tối',
      actionText: '[E] Cúi xuống soi gầm giường tối',
      x: 95,
      y: 165,
      w: 60,
      h: 25,
      triggerNodeId: 'obj_under_bed',
      canRepeat: true,
      checkedMonologue: 'Dưới gầm giường chỉ còn lại những vệt bụi loang lổ...',
    },
    {
      id: 'pills',
      name: 'Bàn Thuốc An Thần',
      actionText: '[E] Xem vỉ thuốc an thần [Đơn: 17/05]',
      x: 130,
      y: 210,
      w: 40,
      h: 40,
      triggerNodeId: 'node_pills',
      canRepeat: false,
      checkedMonologue: 'Chẳng còn viên nào nữa. Đừng tìm vô ích.',
    },
    {
      id: 'phone',
      name: 'Điện Thoại Bàn Phím',
      actionText: '[E] Nghe hộp thư thoại nhỡ (01:20 AM)',
      x: 445,
      y: 160,
      w: 42,
      h: 36,
      triggerNodeId: 'obj_phone',
      canRepeat: false,
      checkedMonologue: 'Chỉ còn lại tiếng tút... tút... dài vô tận.',
    },
    {
      id: 'mirror',
      name: 'Gương Nứt Vỡ',
      actionText: '[E] Soi hình bóng trong gương nứt',
      x: 530,
      y: 95,
      w: 40,
      h: 65,
      triggerNodeId: 'obj_mirror',
      canRepeat: false,
      checkedMonologue: 'Bạn không muốn nhìn vào bản mặt đó lần thứ hai.',
    },
    {
      id: 'window',
      name: 'Cửa Sổ Kín Rèm',
      actionText: '[E] Vén rèm cửa sổ nhìn ra ngoài',
      x: 180,
      y: 70,
      w: 70,
      h: 40,
      triggerNodeId: 'obj_window',
      canRepeat: false,
      checkedMonologue: 'Rèm đã kéo kín. Bên ngoài không có gì cho bạn đâu.',
    },
    {
      id: 'door',
      name: 'Cửa Phòng Trọ #314',
      actionText: '[E] Mở cửa bước ra Hành lang tầng 3 [🚪]',
      x: 35,
      y: 310,
      w: 40,
      h: 75,
      triggerNodeId: 'node_door_knock',
      canRepeat: true,
      checkedMonologue: 'Cửa phòng trọ mở hé ánh sáng hành lang.',
    },
    {
      id: 'mien',
      name: 'Miên (AURA Hologram)',
      actionText: '[E] Giao tiếp với Miên',
      x: 380,
      y: 130,
      w: 40,
      h: 60,
      triggerNodeId: 'node_mien_intro',
      canRepeat: true,
      checkedMonologue: 'Miên vẫn đang lơ lửng ở đó, chờ đợi bạn...',
    },
  ]);

  // Load Sprites
  useEffect(() => {
    const anImg = new Image();
    anImg.src = characterSprite;
    anImg.onload = () => { anSpriteRef.current = anImg; };

    const mienImg = new Image();
    mienImg.src = '/assets/mien_spritesheet.png';
    mienImg.onload = () => { mienSpriteRef.current = mienImg; };
  }, [characterSprite]);

  // Kiểm tra mã PIN của Terminal
  const handleVerifyPin = useCallback((customPin?: string) => {
    const pinToTest = customPin !== undefined ? customPin : terminalPin;
    if (pinToTest === '0314') {
      playBuzzer();
      setTerminalError('[TỪ CHỐI]: 03:14 KHÔNG PHẢI MỘT NGÀY, ĐÓ LÀ MỘT THỜI KHẮC... Gợi ý: Mật mã là ngày kỷ niệm của hai đứa — khắc sau mặt dây chuyền, hoặc ghi trên tấm thiệp ngoài bảng tin hành lang.');
      return;
    }
    if (pinToTest === '1705') {
      playChime();
      setTerminalSuccess(true);
      setTerminalError(null);
      setTimeout(() => {
        setIsTerminalUnlocked(true);
        setIsTerminalOpen(false);
        setLocalInteractedIds((prev) => (prev.includes('pc_terminal') ? prev : [...prev, 'pc_terminal']));
        onMarkInteracted?.('pc_terminal');
        onTrigger('node_terminal_unlocked');
      }, 700);
      return;
    }
    playBuzzer();
    setTerminalError('MÃ PIN SAI! Đầu bạn nhức buốt vì cố nhớ sai ký ức (-5 Sanity).');
    if (setSanity) {
      setSanity((prev) => Math.max(5, prev - 5));
    }
    setTerminalPin('');
  }, [terminalPin, playBuzzer, playChime, onMarkInteracted, onTrigger, setSanity]);

  // Xử lý bàn phím
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Khi đang mở modal Terminal thì phím ưu tiên cho Terminal
      if (isTerminalOpen) {
        if (e.key >= '0' && e.key <= '9') {
          playKeyClick();
          setTerminalPin((prev) => (prev.length < 4 ? prev + e.key : prev));
        } else if (e.key === 'Backspace') {
          playKeyClick();
          setTerminalPin((prev) => prev.slice(0, -1));
        } else if (e.key === 'Enter') {
          handleVerifyPin();
        } else if (e.key === 'Escape') {
          setIsTerminalOpen(false);
          setTerminalError(null);
        }
        return;
      }

      // Khi đang mở modal Túi đồ thì phím ưu tiên cho Túi đồ (InventoryModal tự lắng nghe Escape / I)
      if (isInventoryOpen) {
        return;
      }

      // Phím [I] mở Túi đồ
      if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsInventoryOpen(true);
        return;
      }

      keysHeld.current.add(e.key.toLowerCase());

      // Nhấn E hoặc Space hoặc Enter để tương tác
      if (e.key.toLowerCase() === 'e' || e.key === ' ' || e.key === 'Enter') {
        const p = playerRef.current;
        // Tìm vật thể gần nhất trong phạm vi tương tác (75px)
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
          // 1. Bàn máy tính: Cần cắm đĩa mềm AURA trước khi mở Terminal giải mã
          if (target.id === 'pc') {
            if (isTerminalUnlocked) {
              onTrigger('node_terminal_unlocked');
              return;
            }

            // Kiểm tra nguồn điện hành lang đã được bật chưa
            const isPowerRestored = localInteractedIds.includes('hallway_power_on');
            if (!isPowerRestored) {
              playBuzzer();
              showMonologueWhisper(
                '[LỖI ĐIỆN ÁP ⚡]: Đèn phòng trọ nhấp nháy chập chờn! Nguồn điện lưới đang bị ngắt, case máy tính không đủ công suất đọc ổ đĩa. Hãy bước ra Hành lang tầng 3 (cửa bên trái) để đóng Cầu Dao Tổng!'
              );
              return;
            }

            // Kiểm tra đã cắm đĩa mềm chưa
            if (!localInsertedDisk) {
              // Người chơi có đĩa mềm AURA hoàn chỉnh không?
              if (localInventoryIds.includes('aura_disk')) {
                playInsertDiskSound();
                const nextInv = localInventoryIds.filter(id => id !== 'aura_disk');
                setLocalInventoryIds(nextInv);
                onUpdateInventory?.(nextInv);
                setLocalInsertedDisk(true);
                onInsertDisk?.();
                showPickupAlert(
                  'Đĩa Mềm Kỷ Niệm Hoàn Chỉnh',
                  '💽',
                  'Đã đưa Đĩa Mềm Kỷ Niệm vào máy tính! Màn hình đang hiển thị khung nhập mật mã...'
                );
                setTimeout(() => {
                  keysHeld.current.clear();
                  setIsTerminalOpen(true);
                  setTerminalPin('');
                  setTerminalError(null);
                  setTerminalSuccess(false);
                }, 750);
                return;
              } else {
                // Chưa có đĩa hoàn chỉnh
                const hasPart1 = localInventoryIds.includes('disk_part_1');
                const hasPart2 = localInventoryIds.includes('disk_part_2');
                if (hasPart1 && hasPart2) {
                  showMonologueWhisper(
                    'Ổ đĩa máy tính đang trống! Bạn đã có đủ 2 mảnh đĩa mềm trong túi đồ. Hãy mở Túi Đồ [I] để GHÉP LẠI!'
                  );
                } else if (hasPart1 || hasPart2) {
                  showMonologueWhisper(
                    'Ổ đĩa máy tính cần Đĩa Mềm Kỷ Niệm. Bạn mới chỉ có 1 nửa mảnh đĩa, cần tìm thêm nửa còn lại!'
                  );
                } else {
                  showMonologueWhisper(
                    'Ổ đĩa mềm của máy tính đang trống. Cần tìm Đĩa Mềm Kỷ Niệm trong phòng để xem dữ liệu!'
                  );
                }
                return;
              }
            }

            // Đã cắm đĩa mềm -> Mở Terminal nhập mã PIN 1705
            keysHeld.current.clear();
            setIsTerminalOpen(true);
            setTerminalPin('');
            setTerminalError(null);
            setTerminalSuccess(false);
            return;
          }

          // 2. Cốc cà phê đen đặc trên bàn PC -> Nhặt Cốc Cà Phê [☕]
          if (target.id === 'coffee_mug') {
            const hasCoffee = localInventoryIds.includes('coffee');
            const usedCoffee = localInteractedIds.includes('coffee_used');
            if (hasCoffee || usedCoffee) {
              showMonologueWhisper('Chỉ còn vệt ố cà phê tròn khô khốc trên mặt bàn gỗ.');
              return;
            }
            const nextInv = [...localInventoryIds, 'coffee'];
            setLocalInventoryIds(nextInv);
            onUpdateInventory?.(nextInv);
            showPickupAlert(
              'Cốc Cà Phê Đen Đặc',
              '☕',
              'Cốc cà phê đen còn bốc khói nhẹ. Hãy mở Túi Đồ [I] và bấm [SỬ DỤNG] để uống hồi +15 Sanity!'
            );
            return;
          }

          // 3. Bàn trà bệt sinh viên -> Nhặt Dao Rọc Giấy [🔪] và Bật Lửa Zippo [🔥], sau đó kiểm tra vị giác
          if (target.id === 'tea_table') {
            if (!localInventoryIds.includes('box_cutter')) {
              const nextInv = [...localInventoryIds, 'box_cutter'];
              setLocalInventoryIds(nextInv);
              onUpdateInventory?.(nextInv);
              showPickupAlert(
                'Dao Rọc Giấy Sắc Bén',
                '🔪',
                'Bên cạnh bát mì tôm Hảo Hảo ăn dở, bạn nhặt được một con Dao Rọc Giấy còn rất bén! Dùng để rạch đồ đóng gói.'
              );
              return;
            }
            if (!localInventoryIds.includes('lighter')) {
              const nextInv = [...localInventoryIds, 'lighter'];
              setLocalInventoryIds(nextInv);
              onUpdateInventory?.(nextInv);
              showPickupAlert(
                'Bật Lửa Zippo Cũ',
                '🔥',
                'Cạnh gạt tàn thuốc lá có một chiếc Bật Lửa Zippo cũ vẫn còn ga! Dùng để soi sáng những góc tối.'
              );
              return;
            }
            if (!localInteractedIds.includes('tea_table_taste')) {
              setLocalInteractedIds(prev => [...prev, 'tea_table_taste']);
              onMarkInteracted?.('tea_table_taste');
              onTrigger('obj_tea_table');
              return;
            }
            showMonologueWhisper('Vị giác vẫn hoàn toàn trống rỗng... Bạn không muốn thử nếm bát mì mốc đó nữa.');
            return;
          }

          // 4. Thùng carton đồ kỷ niệm của Miên -> Cần Dao Rọc Giấy để mở -> Nhặt Băng Dính [🩹] và Bức Ảnh Polaroid [📷]
          if (target.id === 'cardboard_box') {
            const hasOpened = localInventoryIds.includes('electrical_tape') || localInteractedIds.includes('cardboard_box');
            if (hasOpened) {
              showMonologueWhisper('Thùng carton đã rạch mở toang, chỉ còn lại những mảnh xốp vụn vỡ.');
              return;
            }

            if (!localInventoryIds.includes('box_cutter')) {
              showMonologueWhisper('Thùng carton được dán băng keo chằng chịt rất chặt... Bạn cần một con dao rọc giấy hoặc vật sắc nhọn để rạch băng keo!');
              return;
            }

            // Mở thùng bằng dao rọc giấy
            const nextInv = [...localInventoryIds, 'electrical_tape', 'faded_photo'];
            setLocalInventoryIds(nextInv);
            onUpdateInventory?.(nextInv);
            setLocalInteractedIds(prev => (prev.includes('cardboard_box') ? prev : [...prev, 'cardboard_box']));
            onMarkInteracted?.('cardboard_box');
            showPickupAlert(
              'Băng Dính & Ảnh Của Miên',
              '📦',
              'Bạn rạch băng keo mở thùng! Tìm thấy Cuộn Băng Dính [🩹] (dùng ghép đĩa) và Bức Ảnh Polaroid [📷] của Miên (mở Túi Đồ [I] để ngắm hồi Sanity)!'
            );
            return;
          }

          // 5. Bàn thuốc an thần
          if (target.id === 'pills') {
            const isDone = localInteractedIds.includes('pills');
            if (isDone) {
              showMonologueWhisper('Chẳng còn viên thuốc nào nữa. Đừng tìm vô ích.');
            } else {
              setLocalInteractedIds(prev => (prev.includes('pills') ? prev : [...prev, 'pills']));
              onMarkInteracted?.('pills');
              onTrigger('node_pills');
            }
            return;
          }

          // 6. Kệ sách cũ -> Nhặt Kẹp Ghim Kim Loại
          if (target.id === 'bookshelf') {
            if (!localInventoryIds.includes('paperclip')) {
              const nextInv = [...localInventoryIds, 'paperclip'];
              setLocalInventoryIds(nextInv);
              onUpdateInventory?.(nextInv);
              showPickupAlert(
                'Kẹp Ghim Kim Loại',
                '📎',
                'Lục giữa các trang sổ tay cũ, bạn tìm thấy một chiếc Kẹp Ghim Kim Loại dẻo dai!'
              );
              if (!localInteractedIds.includes('bookshelf')) {
                setLocalInteractedIds(prev => [...prev, 'bookshelf']);
                onMarkInteracted?.('bookshelf');
              }
            } else {
              showMonologueWhisper('Chỉ còn những cuốn sách lập trình phủ đầy bụi...');
            }
            return;
          }

          // 7. Gầm giường tối -> Dùng Bật Lửa soi tìm Mảnh Đĩa Mềm A
          if (target.id === 'under_bed') {
            const hasDiskPart1 = localInventoryIds.includes('disk_part_1') || localInventoryIds.includes('aura_disk') || localInsertedDisk;
            if (hasDiskPart1) {
              showMonologueWhisper('Dưới gầm giường chỉ còn lại những vệt bụi loang lổ...');
              return;
            }

            if (!localInventoryIds.includes('lighter')) {
              showMonologueWhisper('Gầm giường tối đen như mực... Bạn cần một ngọn lửa hoặc ánh sáng để soi vào bên trong!');
              return;
            }

            const nextInv = [...localInventoryIds, 'disk_part_1'];
            setLocalInventoryIds(nextInv);
            onUpdateInventory?.(nextInv);
            showPickupAlert(
              'Mảnh Đĩa Mềm A (Header)',
              '💾',
              'Nhờ ngọn lửa bập bùng soi rọi, bạn gắp được Mảnh Đĩa Mềm A [💾] từ góc khuất gầm giường!'
            );
            if (!localInteractedIds.includes('under_bed')) {
              setLocalInteractedIds(prev => [...prev, 'under_bed']);
              onMarkInteracted?.('under_bed');
            }
            return;
          }

          // 8. Hộc bàn máy tính kẹt khóa -> Dùng Kẹp Ghim cạy chốt nhặt Mảnh Đĩa Mềm B
          if (target.id === 'pc_drawer') {
            const hasDiskPart2 = localInventoryIds.includes('disk_part_2') || localInventoryIds.includes('aura_disk') || localInsertedDisk;
            if (hasDiskPart2) {
              showMonologueWhisper('Hộc bàn đã được cạy mở toang, bên trong trống rỗng.');
              return;
            }

            if (!localInventoryIds.includes('paperclip')) {
              showMonologueWhisper('Hộc bàn bị kẹt chốt cơ! Bạn cần một vật kim loại nhỏ và nhọn để cạy chốt khóa.');
              return;
            }

            const nextInv = [...localInventoryIds, 'disk_part_2'];
            setLocalInventoryIds(nextInv);
            onUpdateInventory?.(nextInv);
            showPickupAlert(
              'Mảnh Đĩa Mềm B (Data)',
              '💾',
              'Bạn khéo léo dùng Kẹp Ghim bẻ chốt! Ngăn kéo bật mở, bên trong là Mảnh Đĩa Mềm B [💾]!'
            );
            if (!localInteractedIds.includes('pc_drawer')) {
              setLocalInteractedIds(prev => [...prev, 'pc_drawer']);
              onMarkInteracted?.('pc_drawer');
            }
            return;
          }

          // 9. Cửa phòng trọ -> Mở cửa bước ra Hành lang tầng 3
          if (target.id === 'door') {
            if (onExitToHallway) {
              onExitToHallway();
            } else {
              onTrigger('node_door_knock');
            }
            return;
          }

          // 10. Giao tiếp với Miên: Chỉ khi máy tính đã được giải mã thì Miên mới thức tỉnh để kết thúc Chương 1
          if (target.id === 'mien') {
            if (isTerminalUnlocked) {
              onTrigger('node_dream_climax');
            } else {
              onTrigger('node_mien_intro');
            }
            return;
          }

          // 8. Các đồ vật khác (cửa sổ, gương, điện thoại...)
          const isDone = localInteractedIds.includes(target.id) && !target.canRepeat;
          if (isDone) {
            const line = target.checkedMonologue || 'Chẳng còn gì ở đây nữa.';
            showMonologueWhisper(line);
          } else {
            if (!target.canRepeat) {
              setLocalInteractedIds(prev => (prev.includes(target.id) ? prev : [...prev, target.id]));
              onMarkInteracted?.(target.id);
            }
            onTrigger(target.triggerNodeId);
          }
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
    isTerminalOpen,
    isTerminalUnlocked,
    terminalPin,
    handleVerifyPin,
    playKeyClick,
    onTrigger,
    localInteractedIds,
    onMarkInteracted,
    showMonologueWhisper,
    isInventoryOpen,
    localInventoryIds,
    localInsertedDisk,
    onUpdateInventory,
    onInsertDisk,
    playInsertDiskSound,
    showPickupAlert,
    onExitToHallway,
    playBuzzer,
  ]);

  // Ảnh chụp state mới nhất cho vòng lặp RAF (tránh khởi động lại loop mỗi lần state đổi)
  const snapshotRef = useRef<RoomSnapshot>({
    sanity,
    interacted: localInteractedIds,
    inventory: localInventoryIds,
    insertedDisk: localInsertedDisk,
    terminalUnlocked: isTerminalUnlocked,
    modalOpen: isInventoryOpen || isTerminalOpen,
  });
  useEffect(() => {
    snapshotRef.current = {
      sanity,
      interacted: localInteractedIds,
      inventory: localInventoryIds,
      insertedDisk: localInsertedDisk,
      terminalUnlocked: isTerminalUnlocked,
      modalOpen: isInventoryOpen || isTerminalOpen,
    };
  }, [sanity, localInteractedIds, localInventoryIds, localInsertedDisk, isTerminalUnlocked, isInventoryOpen, isTerminalOpen]);

  // Giữ phiên bản mới nhất của các hàm âm thanh cho vòng lặp
  const soundRef = useRef({ playKnockSound, playThunder, playStepSound });
  useEffect(() => {
    soundRef.current = { playKnockSound, playThunder, playStepSound };
  }, [playKnockSound, playThunder, playStepSound]);

  const promptKeyRef = useRef('');

  // Game Loop: Cập nhật vị trí & Vẽ Canvas (chạy một lần, đọc state qua ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const staticLayer = buildRoomStaticLayer();
    const postLayer = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT, 0.82, 140);
    const lightLayer = document.createElement('canvas');
    lightLayer.width = CANVAS_WIDTH;
    lightLayer.height = CANVAS_HEIGHT;
    const sim = createRoomSim();

    let animId = 0;
    let last = performance.now();
    const start = last;

    const gameLoop = (now: number) => {
      // k = hệ số chuẩn hoá theo 60 FPS → tốc độ như nhau trên màn 60/120/144Hz
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      const t = (now - start) / 1000;
      const snap = snapshotRef.current;
      const p = playerRef.current;
      const keys = keysHeld.current;

      // 1. Di chuyển mượt mà (chỉ khi không mở modal)
      if (snap.modalOpen) {
        stopWalk(p);
      } else {
        let dx = 0;
        let dy = 0;
        if (keys.has('w') || keys.has('arrowup')) { dy -= 1; p.dir = 'up'; }
        if (keys.has('s') || keys.has('arrowdown')) { dy += 1; p.dir = 'down'; }
        if (keys.has('a') || keys.has('arrowleft')) { dx -= 1; p.dir = 'left'; }
        if (keys.has('d') || keys.has('arrowright')) { dx += 1; p.dir = 'right'; }
        if (dx !== 0 && dy !== 0) {
          // Chuẩn hóa đường chéo
          dx *= 0.7071;
          dy *= 0.7071;
        }
        if (dx !== 0 || dy !== 0) {
          const nextX = p.x + dx * p.speed * k;
          const nextY = p.y + dy * p.speed * k;
          // Bounding box kiểm tra va chạm của nhân vật (chân nhân vật)
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
          stopWalk(p); // Đứng yên ở frame giữa
        }
      }

      // 2. Phase căn phòng:
      // Phase 1 (Bình yên ngụy tạo) → Phase 2 (Rạn nứt hoang tưởng) → Phase 3 (Ma trận sụp đổ)
      const cluesFound = snap.interacted.filter(id => STORY_CLUE_IDS.includes(id)).length;
      const phase: 1 | 2 | 3 = (cluesFound >= 3 || snap.sanity <= 35) ? 3 : (cluesFound >= 2 || snap.sanity <= 65) ? 2 : 1;

      // Tiếng gõ cửa ma quái lặp lại mỗi ~8s ở Phase 2 & 3 (3 loạt gõ cách nhau 0.4s)
      const cycle = t % 8;
      const isKnockingNow = phase >= 2 && cycle < 1.33;
      if (isKnockingNow && cycle < 1.2) {
        const knockKey = Math.floor(t / 8) * 3 + Math.floor(cycle / 0.4);
        if (knockKey !== sim.lastKnockKey) {
          sim.lastKnockKey = knockKey;
          soundRef.current.playKnockSound();
        }
      }

      // Bụi, chớp sét (+ tiếng sấm)
      if (updateRoomSim(sim, k, t)) soundRef.current.playThunder();

      // 3. Vật thể tương tác gần nhất (khoảng cách < 75px)
      let nearTarget: InteractableObject | null = null;
      let minPromptDist = INTERACT_RADIUS;
      for (const obj of interactables.current) {
        const dist = Math.hypot(p.x - (obj.x + obj.w / 2), p.y - (obj.y + obj.h / 2));
        if (dist < minPromptDist) {
          minPromptDist = dist;
          nearTarget = obj;
        }
      }
      // Chỉ setState khi nội dung gợi ý thực sự thay đổi (tránh re-render 60 lần/giây)
      const prompt = nearTarget ? computePrompt(nearTarget, snap, isKnockingNow) : null;
      const promptKey = prompt ? `${prompt.isDone}|${prompt.text}` : '';
      if (promptKey !== promptKeyRef.current) {
        promptKeyRef.current = promptKey;
        setActivePrompt(prompt);
      }

      // 4. Vẽ
      const flags = deriveFlags(snap);
      const tk = t * 60;
      const flickerTick = phase >= 2 && (tk % 240 < 8 || (tk % 240 > 14 && tk % 240 < 18));
      // Đèn sợi đốt: le lói nhẹ, chập chờn mạnh khi mất điện lưới
      const lampDip = !flags.powerOn && Math.random() < 0.06 ? 0.45 : Math.random() < 0.015 ? 0.2 : 0;
      const fr: RoomFrame = {
        t,
        phase,
        sanity: snap.sanity,
        knocking: isKnockingNow,
        flicker: flickerTick,
        lightning: sim.lightning,
        lamp: Math.max(0, 0.92 + Math.sin(t * 2.3) * 0.05 - lampDip),
        flags,
        player: p,
        nearest: nearTarget,
        cluesFound,
        snap,
      };

      const sprites: RoomSprites = {
        an: anSpriteRef.current && anSpriteRef.current.complete ? anSpriteRef.current : null,
        mien: mienSpriteRef.current && mienSpriteRef.current.complete ? mienSpriteRef.current : null,
      };

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(staticLayer, 0, 0);
      drawCurtainWindow(ctx, fr);
      drawWallMatrix(ctx, fr);
      drawDoor(ctx, fr);
      drawRoomObjects(ctx, fr, sprites);
      drawLightingOverlay(ctx, lightLayer, fr);
      drawDust(ctx, sim, fr);
      // Phase 3: lát màn hình bị xô ngang ngẫu nhiên
      if (phase === 3 && Math.random() < 0.025) {
        const sy = Math.floor(Math.random() * (CANVAS_HEIGHT - 20));
        const sh = 3 + Math.floor(Math.random() * 10);
        ctx.drawImage(canvas, 0, sy, CANVAS_WIDTH, sh, (Math.random() - 0.5) * 18, sy, CANVAS_WIDTH, sh);
      }
      ctx.drawImage(postLayer, 0, 0);
      drawRoomHUD(ctx, fr, interactables.current);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Đếm manh mối cốt truyện đã khám phá (cho HUD đáy)
  const cluesCount = localInteractedIds.filter(id => STORY_CLUE_IDS.includes(id)).length;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {/* Khung Canvas hiển thị phòng trọ */}
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
          {/* Chấm vàng nhấp nháy báo hiệu có thể ghép 2 mảnh đĩa */}
          {localInventoryIds.includes('disk_part_1') && localInventoryIds.includes('disk_part_2') && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-0.5" title="Có thể ghép 2 mảnh đĩa mềm!" />
          )}
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

        {/* Thanh gợi ý tương tác [E] dạng viên thuốc nổi đỉnh màn hình (chuẩn Màn 3) */}
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

        {/* Hộp thoại độc thoại nội tâm cụt lủn lướt qua ở góc màn hình */}
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

        {/* =========================================================
            MODAL TERMINAL MINI-GAME: GIẢI MÃ TỆP TIN PROJECT_AURA
           ========================================================= */}
        {isTerminalOpen && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in">
            <div className="w-full max-w-sm sm:max-w-md max-h-[96vh] overflow-y-auto bg-zinc-950 border-2 border-emerald-500/80 rounded shadow-[0_0_40px_rgba(16,185,129,0.35)] p-3 sm:p-4 flex flex-col gap-2 font-mono text-emerald-400 relative">
              {/* Scanline CRT overlay */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%)] bg-[length:100%_4px] opacity-40 rounded" />

              {/* Header Terminal - Luôn cố định phía trên */}
              <div className="flex justify-between items-center border-b border-emerald-900/80 pb-2 shrink-0">
                <div className="flex items-center gap-2 text-xs font-bold tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span className="truncate">MÁY TÍNH CÁ NHÂN (PHÒNG 314)</span>
                </div>
                <button
                  onClick={() => {
                    setIsTerminalOpen(false);
                    setTerminalError(null);
                  }}
                  className="shrink-0 text-xs text-red-300 hover:text-white px-2.5 py-1 rounded border border-red-700/80 bg-red-950/60 hover:bg-red-900 transition-colors cursor-pointer font-bold flex items-center gap-1 shadow-sm"
                  title="Nhấn phím ESC để đóng"
                >
                  <span>✕</span>
                  <span>[ESC] ĐÓNG</span>
                </button>
              </div>

              {/* Thông tin tệp tin */}
              <div className="text-[11px] leading-relaxed text-emerald-300/90 bg-emerald-950/40 p-2 sm:p-2.5 rounded border border-emerald-900/60 shrink-0">
                <div className="text-emerald-400 font-bold mb-0.5">&gt; TỆP TIN: ALBUM_KỶ_NIỆM_1705</div>
                <div className="text-zinc-400">&gt; TRẠNG THÁI: <span className="text-amber-400 font-bold">ĐÃ KHÓA BẰNG MẬT MÃ CÁ NHÂN</span></div>
                <div className="text-zinc-300 italic mt-1 border-t border-emerald-900/40 pt-1 text-[10px] sm:text-[11px]">
                  &gt; [GHI CHÚ]: &ldquo;Mã PIN là ngày kỷ niệm của hai đứa mình... Nếu anh lại quên, hãy tìm mặt dây chuyền em đánh rơi, hoặc tấm thiệp em ghim ngoài bảng tin hành lang.&rdquo;
                </div>
              </div>

              {/* Khung hiển thị 4 số PIN */}
              <div className="flex flex-col items-center gap-1 my-0.5 shrink-0">
                <div className="text-[10px] text-zinc-400 tracking-wider">NHẬP MÃ PIN 4 CHỮ SỐ ĐỂ MỞ KHÓA:</div>
                <div className="flex gap-2 sm:gap-2.5">
                  {[0, 1, 2, 3].map((index) => {
                    const digit = terminalPin[index];
                    return (
                      <div
                        key={index}
                        className={`w-10 h-11 sm:w-11 sm:h-12 flex items-center justify-center text-lg sm:text-xl font-bold rounded border-2 transition-all ${
                          digit
                            ? 'border-emerald-400 bg-emerald-950/70 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                            : 'border-zinc-700 bg-black/60 text-zinc-600'
                        }`}
                      >
                        {digit || '_'}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Thông báo lỗi hoặc thành công */}
              {terminalError && (
                <div className="text-[11px] sm:text-xs text-center text-red-300 bg-red-950/70 p-1.5 sm:p-2 rounded border border-red-800 animate-pulse shrink-0">
                  {terminalError}
                </div>
              )}
              {terminalSuccess && (
                <div className="text-[11px] sm:text-xs text-center text-emerald-300 bg-emerald-950/80 p-1.5 sm:p-2 rounded border border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] font-bold shrink-0">
                  ✓ MỞ KHÓA THÀNH CÔNG! ĐANG MỞ KÝ ỨC...
                </div>
              )}

              {/* Bàn phím số ảo Retro */}
              <div className="grid grid-cols-3 gap-1.5 max-w-[260px] mx-auto w-full shrink-0">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      playKeyClick();
                      setTerminalPin((prev) => (prev.length < 4 ? prev + num : prev));
                    }}
                    className="py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 active:bg-emerald-950 border border-zinc-700/80 text-emerald-300 font-bold rounded text-sm transition-all cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => {
                    playKeyClick();
                    setTerminalPin((prev) => prev.slice(0, -1));
                  }}
                  className="py-1.5 sm:py-2 bg-amber-950/50 hover:bg-amber-900/60 active:bg-amber-900 border border-amber-800 text-amber-300 font-bold rounded text-xs transition-all cursor-pointer"
                >
                  XÓA
                </button>
                <button
                  onClick={() => {
                    playKeyClick();
                    setTerminalPin((prev) => (prev.length < 4 ? prev + '0' : prev));
                  }}
                  className="py-1.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 active:bg-emerald-950 border border-zinc-700/80 text-emerald-300 font-bold rounded text-sm transition-all cursor-pointer"
                >
                  0
                </button>
                <button
                  onClick={() => handleVerifyPin()}
                  disabled={terminalPin.length !== 4}
                  className={`py-1.5 sm:py-2 border font-bold rounded text-xs transition-all ${
                    terminalPin.length === 4
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-black border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] cursor-pointer'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed opacity-60'
                  }`}
                >
                  GIẢI MÃ
                </button>
              </div>

              {/* Nút thoát phụ bổ sung phía dưới */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-400 shrink-0">
                <span>Phím số 0-9 & Enter</span>
                <button
                  onClick={() => {
                    setIsTerminalOpen(false);
                    setTerminalError(null);
                  }}
                  className="text-zinc-400 hover:text-white underline hover:no-underline cursor-pointer"
                >
                  [ Đóng cửa sổ này ]
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HUD cố định ở đáy: viền kép retro neon (chuẩn Màn 3) */}
        <div className="absolute bottom-2 left-3 right-3 z-10 p-0.5 rounded border border-orange-500/70 bg-black/80 shadow-[0_0_14px_rgba(249,115,22,0.35)] backdrop-blur-sm">
          {/* Một hàng gọn: phím điều khiển (trái) • tiến trình ký ức (phải) */}
          <div className="flex justify-between items-center gap-3 px-3 py-1 rounded-sm border border-red-900/80 text-[11px] font-mono text-zinc-400 whitespace-nowrap">
            <div className="flex items-center gap-3">
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
            <div className={isTerminalUnlocked ? 'text-pink-400 font-bold' : 'text-zinc-300'}>
              Ký ức <span className="font-bold text-orange-300">{Math.min(cluesCount, HUD_CLUE_TARGET)}/{HUD_CLUE_TARGET}</span>
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
