"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MusicBoxMinigame } from './minigames/MusicBoxMinigame';
import { PolaroidMinigame } from './minigames/PolaroidMinigame';
import { RadioMinigame } from './minigames/RadioMinigame';
import {
  DORM_PAL, hash, px, block, outlinedText,
  buildPostLayer, drawTargetMarker, drawVitals, drawHudSubtitle,
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

interface SunsetStageProps {
  characterSprite: string;
  sanity: number;
  setSanity?: React.Dispatch<React.SetStateAction<number>>;
  onTrigger: (nodeId: string) => void;
  interactedIds?: string[];
  onMarkInteracted?: (id: string) => void;
  volume?: number;
}

type Direction = 'down' | 'left' | 'right' | 'up';

// Spritesheet 3x3 (64x96/frame): hàng 0 = xuống, 1 = lên, 2 = phải (lật ngang = trái) — giống Màn 1 & 3
const DIR_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
export const CORE_ANOMALY_IDS = ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box'];

// =====================================================================
// BỐ CỤC BẾN BÌNH AN (THỊ TRẤN HOÀNG HÔN) — 800x500
// Thiên đường nhân tạo Miên dựng trong máy chủ: đẹp như tranh Shinkai / PC-98,
// nhưng từng chi tiết đều "lỗi": khói lặp 2s, bồ câu đông cứng, sông trôi mã nhị phân.
// =====================================================================

const EMPTY_IDS: string[] = [];
const SKY_BOTTOM = 128;                        // Đường chân trời
const RIVER_TOP = 142;
const RIVER_BOTTOM = 220;
const PROMENADE_TOP = 240;
const SUN = { x: 400, y: SKY_BOTTOM, r: 48 };
const INTERACT_RADIUS = 65;
const HITBOX_HALF_W = 14;
const SPRITE_W = 42;
const SPRITE_H = 63;

const BRIDGE = { x: 280, y: SKY_BOTTOM, w: 140, h: PROMENADE_TOP - SKY_BOTTOM };
const DOCK = { x: 180, y: 212, w: 68, h: 24 };
const PIGEONS = { x: 288, y: 135 };
const MUSIC_BOX = { x: 402, y: 138 };
const CAFE_TABLE = { x: 145, y: 320 };
const UMBRELLA = { x: 80, y: 302 };
const LAMP_POST = { x: 70, y: 240 };
const SIGN = { x: 252, y: 224 };
const TREE = { x: 689, y: 315 };               // Gốc cây hoa tử đằng
const BENCH = { x: 635, y: 320 };
const BIKE = { x: 708, y: 302 };
const MIEN = { x: 390, y: 270 };

// Vật cản (Solid Colliders) — giữ nguyên, chỉ nâng mép trên tới đầu cầu để An không đi vào bầu trời
const COLLIDERS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  // Bờ trên (bờ sông phía xa)
  { x: 0, y: 0, w: CANVAS_WIDTH, h: SKY_BOTTOM },
  // Dòng sông (hai bên cầu, người không thể bơi)
  { x: 0, y: 140, w: 280, h: 80 },
  { x: 420, y: 140, w: 380, h: 80 },
  // Lan can cầu
  { x: 275, y: 135, w: 10, h: 90 },
  { x: 415, y: 135, w: 10, h: 90 },
  // Bàn ghế cà phê
  { x: 100, y: 285, w: 90, h: 65 },
  // Gốc cây hoa tím & băng ghế
  { x: 620, y: 240, w: 100, h: 80 },
  // Tường bao / viền bản đồ
  { x: 0, y: 0, w: 35, h: CANVAS_HEIGHT },
  { x: CANVAS_WIDTH - 35, y: 0, w: 35, h: CANVAS_HEIGHT },
  { x: 0, y: CANVAS_HEIGHT - 35, w: CANVAS_WIDTH, h: 35 },
];

// Bầu trời theo 3 giai đoạn tâm lý (0-1 / 2-3 / 4-5 manh mối)
const SKY_STOPS: ReadonlyArray<ReadonlyArray<[number, string]>> = [
  [[0, '#2e1065'], [0.4, '#701a75'], [0.78, '#ea580c'], [1, '#fef08a']],   // Hoàng hôn rực rỡ
  [[0, '#1a0533'], [0.4, '#581c87'], [0.75, '#9d174d'], [1, '#ea580c']],   // Lạnh dần
  [[0, '#090114'], [0.35, '#2a0845'], [0.7, '#4c0519'], [1, '#7f1d1d']],   // Tàn lụi, rỉ đỏ
];

// =====================================================================
// KIỂU DỮ LIỆU
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

interface SunsetSnapshot {
  sanity: number;
  interacted: string[];
}

interface Petal { x: number; y: number; vx: number; vy: number; rot: number; size: number }
interface DataStream { x: number; y: number; text: string; speed: number; alpha: number; word: boolean }

interface SunsetSim {
  petals: Petal[];
  streams: DataStream[];
  nextChime: number;
}

interface SunsetFrame {
  t: number;
  sanity: number;
  anomalies: number;     // 0..5 manh mối bất thường cốt lõi
  phase: 0 | 1 | 2;      // Giai đoạn bầu trời
  wind: number;          // Độ lắc của gió
  interacted: ReadonlySet<string>;
  player: PlayerState;
  nearest: InteractableObject | null;
}

interface SunsetSprites {
  an: HTMLImageElement | null;
  mien: HTMLImageElement | null;
}

/** Nội dung thanh gợi ý [E] (giữ nguyên văn bản gốc) */
const computePrompt = (target: InteractableObject, interacted: string[]): { text: string; isDone: boolean } => {
  if (target.id === 'ch2_mien') {
    const anomaliesFound = interacted.filter(id => CORE_ANOMALY_IDS.includes(id)).length;
    const isReady = anomaliesFound >= 5;
    return {
      text: isReady
        ? `✨ Quyết định số phận cùng Miên (Đã tìm đủ 5/5 manh mối)`
        : `Tâm sự với Miên (Cần tìm đủ 5 manh mối: hiện có ${anomaliesFound}/5)`,
      isDone: false,
    };
  }
  const isDone = interacted.includes(target.id) && !target.canRepeat;
  return { text: isDone ? `${target.name} - Nhấn [E] để xem lại` : target.actionText, isDone };
};

// =====================================================================
// HELPER MÀU & BÓNG ĐỔ
// =====================================================================

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Lấy màu tại vị trí k (0..1) trên dải màu nhiều điểm dừng */
const sampleStops = (stops: ReadonlyArray<[number, string]>, k: number): string => {
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (k >= a && k <= b) {
      const u = (k - a) / (b - a || 1);
      const A = hexToRgb(ca);
      const B = hexToRgb(cb);
      return `rgb(${Math.round(A[0] + (B[0] - A[0]) * u)},${Math.round(A[1] + (B[1] - A[1]) * u)},${Math.round(A[2] + (B[2] - A[2]) * u)})`;
    }
  }
  return stops[stops.length - 1][1];
};

/** Bóng đổ dài mềm mại hắt ngược hướng mặt trời lặn (mặt trời ở chân trời phía bắc) */
function longShadow(ctx: CanvasRenderingContext2D, x: number, footY: number, len: number, width: number, alpha = 0.32) {
  const dx = x - SUN.x;
  const dy = footY - SUN.y;
  const d = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy / d, dx / d);
  const g = ctx.createRadialGradient(x, footY, 0, x, footY, len);
  g.addColorStop(0, `rgba(30,6,40,${alpha})`);
  g.addColorStop(1, 'rgba(30,6,40,0)');
  ctx.save();
  ctx.translate(x, footY);
  ctx.rotate(ang);
  ctx.translate(-x, -footY);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + len * 0.45, footY, len * 0.55, width, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// =====================================================================
// LỚP NỀN TĨNH THEO GIAI ĐOẠN (cache 3 phiên bản)
// =====================================================================

/** Bầu trời dải màu lượng tử hoá kiểu PC-98: các dải 4px + dither caro ở ranh giới */
function drawSkyBands(ctx: CanvasRenderingContext2D, phase: 0 | 1 | 2) {
  const stops = SKY_STOPS[phase];
  const band = 4;
  for (let y = 0; y < SKY_BOTTOM; y += band) {
    ctx.fillStyle = sampleStops(stops, y / SKY_BOTTOM);
    ctx.fillRect(0, y, CANVAS_WIDTH, band);
    // Dither sang dải kế tiếp
    ctx.fillStyle = sampleStops(stops, Math.min(1, (y + band) / SKY_BOTTOM));
    for (let x = (y / band) % 2; x < CANVAS_WIDTH; x += 2) ctx.fillRect(x, y + band - 1, 1, 1);
  }
  // Sao lấp lánh ở đỉnh trời (rõ hơn khi trời tối dần)
  const starCount = phase === 0 ? 14 : phase === 1 ? 30 : 50;
  for (let i = 0; i < starCount; i++) {
    px(ctx, hash(i * 3) * CANVAS_WIDTH, hash(i * 7) * 50, 1, 1, `rgba(255,240,255,${0.3 + hash(i) * 0.5})`);
  }
}

/** Dãy nhà phố xa, cột điện, dây điện (bóng đen in trên nền trời) */
function drawSkyline(ctx: CanvasRenderingContext2D, phase: 0 | 1 | 2) {
  const silhouette = phase === 2 ? '#14020c' : '#1e0538';
  const buildings = [
    { x: 30, w: 45, h: 35 }, { x: 85, w: 30, h: 48 }, { x: 125, w: 55, h: 25 }, { x: 210, w: 40, h: 40 },
    { x: 470, w: 50, h: 32 }, { x: 530, w: 35, h: 44 }, { x: 575, w: 60, h: 28 }, { x: 690, w: 40, h: 50 }, { x: 740, w: 50, h: 30 },
  ];
  ctx.fillStyle = silhouette;
  ctx.fillRect(0, SKY_BOTTOM - 13, CANVAS_WIDTH, 13);
  buildings.forEach((b, i) => {
    const top = SKY_BOTTOM - b.h;
    ctx.fillStyle = silhouette;
    ctx.fillRect(b.x, top, b.w, b.h);
    // Mái tôn / bể nước trên nóc
    if (i % 3 === 0) ctx.fillRect(b.x + 6, top - 5, 10, 5);
    // Cửa sổ còn sáng đèn vàng
    for (let k = 0; k < 4; k++) {
      if (hash(i * 13 + k) > 0.5) {
        px(ctx, b.x + 4 + hash(i * 5 + k) * (b.w - 8), top + 5 + hash(i * 7 + k) * (b.h - 12), 2, 2, phase === 2 ? 'rgba(239,68,68,0.6)' : 'rgba(253,224,71,0.75)');
      }
    }
    // Viền ráng chiều mép trên toà nhà
    px(ctx, b.x, top, b.w, 1, phase === 0 ? 'rgba(251,146,60,0.55)' : 'rgba(236,72,153,0.35)');
  });
  // Cột điện + dây điện võng
  ctx.fillStyle = '#110324';
  ctx.fillRect(190, 72, 4, SKY_BOTTOM - 72);
  ctx.fillRect(175, 82, 34, 3);
  ctx.fillRect(670, 68, 4, SKY_BOTTOM - 68);
  ctx.fillRect(655, 78, 34, 3);
  ctx.strokeStyle = 'rgba(17,3,36,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const off of [0, 12, 24]) {
    ctx.moveTo(-10, 70 + off * 0.3);
    ctx.quadraticCurveTo(95, 100 + off * 0.3, 178 + off, 83);
    ctx.moveTo(206 - off * 0.2, 83);
    ctx.quadraticCurveTo(430, 118, 657 + off, 79);
    ctx.moveTo(686, 79);
    ctx.quadraticCurveTo(750, 95, 810, 74 + off * 0.3);
  }
  ctx.stroke();
}

/** Bờ sông phía xa: kè đá + dải cỏ ánh ráng chiều */
function drawFarBank(ctx: CanvasRenderingContext2D, phase: 0 | 1 | 2) {
  px(ctx, 0, SKY_BOTTOM, CANVAS_WIDTH, RIVER_TOP - SKY_BOTTOM, phase === 2 ? '#2a0a18' : '#3b1846');
  for (let x = 0; x < CANVAS_WIDTH; x += 12) {
    px(ctx, x, SKY_BOTTOM + 6, 11, 7, phase === 2 ? '#3a1020' : '#4c2258');
    px(ctx, x, SKY_BOTTOM + 6, 11, 1, 'rgba(251,146,60,0.25)');
  }
  for (let i = 0; i < 120; i++) {
    px(ctx, hash(i * 9) * CANVAS_WIDTH, SKY_BOTTOM + hash(i * 4) * 5, 1, 2, phase === 0 ? 'rgba(134,239,172,0.35)' : 'rgba(167,139,250,0.3)');
  }
}

/** Nền dòng sông (dải màu tím thẫm) */
function drawRiverBase(ctx: CanvasRenderingContext2D, phase: 0 | 1 | 2) {
  const g = ctx.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOTTOM);
  if (phase === 2) {
    g.addColorStop(0, '#1a0410');
    g.addColorStop(1, '#0b0414');
  } else {
    g.addColorStop(0, '#4a1a5e');
    g.addColorStop(0.35, '#4a044e');
    g.addColorStop(0.75, '#3b0764');
    g.addColorStop(1, '#1e1b4b');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, RIVER_TOP, CANVAS_WIDTH, RIVER_BOTTOM - RIVER_TOP);
}

/** Kè đá bờ gần + vỉa hè lát gạch ấm áp nhuộm ráng chiều */
function drawPromenade(ctx: CanvasRenderingContext2D, phase: 0 | 1 | 2) {
  // Kè đá
  px(ctx, 0, RIVER_BOTTOM, CANVAS_WIDTH, PROMENADE_TOP - RIVER_BOTTOM, '#3b1d4a');
  for (let r = 0; r < 2; r++) {
    for (let x = r * 9; x < CANVAS_WIDTH; x += 18) {
      block(ctx, x, RIVER_BOTTOM + 1 + r * 10, 17, 8, '#5a2d66', '#7a3f86', '#3b1d4a', '#24102e');
    }
  }
  px(ctx, 0, RIVER_BOTTOM, CANVAS_WIDTH, 1, 'rgba(251,146,60,0.45)');
  // Gạch lát vỉa hè so le
  const bh = 10;
  for (let y = PROMENADE_TOP, r = 0; y < CANVAS_HEIGHT; y += bh, r++) {
    for (let x = -(r % 2) * 12, c = 0; x < CANVAS_WIDTH; x += 24, c++) {
      const h = hash(r * 31 + c * 7);
      const base = phase === 2 ? (h < 0.5 ? '#3a1a24' : '#30141e') : h < 0.33 ? '#6b3a52' : h < 0.66 ? '#5e3249' : '#744060';
      px(ctx, x, y, 24, bh, '#2a1222');
      px(ctx, x + 1, y + 1, 22, bh - 2, base);
      px(ctx, x + 1, y + 1, 22, 1, 'rgba(253,186,116,0.18)');
      if (h > 0.9) px(ctx, x + 6, y + 3, 6, 3, 'rgba(0,0,0,0.18)');
    }
  }
  // Tối dần về phía người xem
  const fade = ctx.createLinearGradient(0, PROMENADE_TOP, 0, CANVAS_HEIGHT);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(20,4,20,0.55)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, PROMENADE_TOP, CANVAS_WIDTH, CANVAS_HEIGHT - PROMENADE_TOP);
  // Viền mép bản đồ
  px(ctx, 0, CANVAS_HEIGHT - 35, CANVAS_WIDTH, 35, 'rgba(10,2,14,0.55)');
}

function buildSunsetStaticLayer(phase: 0 | 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_WIDTH;
  c.height = CANVAS_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  drawSkyBands(ctx, phase);
  drawSkyline(ctx, phase);
  drawFarBank(ctx, phase);
  drawRiverBase(ctx, phase);
  drawPromenade(ctx, phase);
  return c;
}

// =====================================================================
// HÀM VẼ ĐỘNG
// =====================================================================

/** Vẽ một frame sprite sắc nét ở toạ độ nguyên (lật ngang khi quay trái) */
function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement, frame: number, dir: Direction, x: number, y: number) {
  drawSpriteFrame(ctx, img, frame, DIR_ROW[dir], dir === 'left', x, y, SPRITE_W, SPRITE_H);
}

/** Mặt trời lặn nửa vầng kiểu synthwave (các vạch cắt ngang) + quầng dither */
function drawSun(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const core = fr.phase === 2 ? '#fca5a5' : fr.phase === 1 ? '#fed7aa' : '#fff1c1';
  const rim = fr.phase === 2 ? '#ef4444' : fr.phase === 1 ? '#f97316' : '#fb7185';
  // Quầng sáng
  const halo = ctx.createRadialGradient(SUN.x, SUN.y, SUN.r * 0.6, SUN.x, SUN.y, SUN.r * 2.4);
  halo.addColorStop(0, fr.phase === 2 ? 'rgba(239,68,68,0.45)' : 'rgba(253,186,116,0.55)');
  halo.addColorStop(1, 'rgba(253,186,116,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(SUN.x - SUN.r * 2.4, SUN.y - SUN.r * 2.4, SUN.r * 4.8, SUN.r * 2.4);
  // Đĩa mặt trời
  const g = ctx.createLinearGradient(0, SUN.y - SUN.r, 0, SUN.y);
  g.addColorStop(0, core);
  g.addColorStop(1, rim);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(SUN.x, SUN.y, SUN.r, Math.PI, 0, false);
  ctx.fill();
  // Vạch cắt ngang dày dần về chân trời (cuộn chậm)
  const scroll = (fr.t * 4) % 6;
  for (let i = 0; i < 6; i++) {
    const yy = SUN.y - 22 + i * 4 + scroll * 0.5;
    if (yy > SUN.y) continue;
    ctx.fillStyle = sampleStops(SKY_STOPS[fr.phase], Math.min(1, yy / SKY_BOTTOM));
    ctx.fillRect(SUN.x - SUN.r, Math.round(yy), SUN.r * 2, 1 + Math.floor(i / 2));
  }
  // Dãy nhà che chân mặt trời
  px(ctx, SUN.x - SUN.r - 4, SKY_BOTTOM - 6, SUN.r * 2 + 8, 6, fr.phase === 2 ? '#14020c' : '#1e0538');
}

/** Dải mây pixel dither trôi ngang, sáng mép dưới vì ráng chiều hắt lên */
function drawClouds(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const clouds = [
    { y: 26, w: 110, speed: 4, seed: 1 },
    { y: 48, w: 150, speed: 6, seed: 2 },
    { y: 70, w: 90, speed: 3, seed: 3 },
    { y: 38, w: 70, speed: 5, seed: 4 },
    { y: 88, w: 130, speed: 7, seed: 5 },
  ];
  const top = fr.phase === 2 ? '#3b0a2a' : fr.phase === 1 ? '#6b2a6e' : '#9d4a8e';
  const mid = fr.phase === 2 ? '#5a1430' : fr.phase === 1 ? '#a3466f' : '#e07a8f';
  const lit = fr.phase === 2 ? '#b91c1c' : fr.phase === 1 ? '#f9a26b' : '#ffd29a';
  for (const c of clouds) {
    const span = CANVAS_WIDTH + c.w + 40;
    const x = ((c.seed * 173 + fr.t * c.speed) % span) - c.w - 20;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const inset = Math.abs(r - 1.2) * 14 + hash(c.seed * 7 + r) * 10;
      const rw = c.w - inset * 2;
      const color = r === 0 ? top : r === rows - 1 ? lit : mid;
      px(ctx, x + inset, c.y + r * 4, rw, 4, color);
      // Mép dither mềm
      for (let k = 0; k < 6; k += 2) {
        px(ctx, x + inset - 2 - k, c.y + r * 4 + (k % 4), 1, 1, color);
        px(ctx, x + inset + rw + 1 + k, c.y + r * 4 + 2 - (k % 4), 1, 1, color);
      }
    }
  }
  // Đàn chim xa xăm vẫn bay (đối lập với bồ câu đông cứng trên cầu)
  ctx.fillStyle = 'rgba(30,6,40,0.75)';
  for (let i = 0; i < 3; i++) {
    const bx = ((fr.t * (10 + i * 2) + i * 140) % (CANVAS_WIDTH + 40)) - 20;
    const by = 58 + i * 9 + Math.sin(fr.t * 0.8 + i) * 4;
    const flap = Math.sin(fr.t * 8 + i * 2) > 0 ? 1 : 0;
    ctx.fillRect(Math.round(bx - 3), Math.round(by - flap), 3, 1);
    ctx.fillRect(Math.round(bx + 1), Math.round(by - flap), 3, 1);
    ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
  }
}

/** Vết nứt thực tại trên bầu trời: lan rộng theo số manh mối (1 → 5) */
function drawSkyCracks(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const n = fr.anomalies;
  if (n < 1) return;
  const full = n >= 5;
  const color = full ? '244,63,94' : n >= 3 ? '236,72,153' : '34,211,238';
  const jitter = full && Math.sin(fr.t * 30) > 0 ? (Math.random() - 0.5) * 4 : n >= 4 && Math.sin(fr.t * 20) > 0.6 ? (Math.random() - 0.5) * 2 : 0;
  const paths: Array<Array<[number, number]>> = [[[560 + jitter, 10], [530, 35]]];
  if (n >= 2) paths.push([[530, 35], [545, 50], [505, 80], [460, 95]]);
  if (n >= 3) {
    paths.push([[530, 35], [495, 42], [470, 30]]);
    paths.push([[210 + jitter, 15], [240, 45], [265, 55], [310, 75]]);
  }
  if (full) paths.push([[400 + jitter, 80], [395, 104], [408, 120]]);
  const stroke = (w: number, a: number) => {
    ctx.strokeStyle = `rgba(${color},${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const path of paths) path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };
  // Phát sáng nhiều lớp thay shadowBlur
  stroke(full ? 7 : 5, 0.2);
  stroke(full ? 2.5 : n >= 3 ? 1.5 : 1, 0.95);
  if (full) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(400 + jitter, 80); ctx.lineTo(395, 104); ctx.lineTo(408, 120);
    ctx.stroke();
  }
  // Mảnh vỡ pixel rơi rụng
  if (n >= 4 && Math.sin(fr.t * 6) > 0) {
    const k = (fr.t * 60) % 30;
    px(ctx, 490, 85 + k, 3, 3, '#22d3ee');
    px(ctx, 255, 60 + (k % 25), 2, 2, '#f43f5e');
  }
  if (full) {
    if (Math.sin(fr.t * 9) > 0.2) px(ctx, 0, (fr.t * 240) % SKY_BOTTOM, CANVAS_WIDTH, 4, 'rgba(244,63,94,0.15)');
    ctx.font = 'bold 9px monospace';
    outlinedText(ctx, 'CRITICAL: MEMORY_LIMIT_EXCEEDED [5/5]', 130, 24, Math.sin(fr.t * 6) > 0 ? '#f43f5e' : '#fbbf24');
  }
}

/** Mặt sông: cột phản chiếu ráng chiều lấp lánh, gợn sóng, dòng mã nhị phân trôi dưới nước */
function drawRiver(ctx: CanvasRenderingContext2D, fr: SunsetFrame, streams: DataStream[]) {
  // Phản chiếu mặt trời: các vạch ngang lấp lánh rộng dần xuống dưới
  for (let y = RIVER_TOP + 2; y < RIVER_BOTTOM; y += 3) {
    const k = (y - RIVER_TOP) / (RIVER_BOTTOM - RIVER_TOP);
    const width = 30 + k * 90;
    const wob = Math.sin(fr.t * 2 + y * 0.6) * 6;
    const seg = 3 + Math.floor(hash(y) * 3);
    for (let s = 0; s < seg; s++) {
      const sx = SUN.x - width / 2 + hash(y * 7 + s) * width + wob;
      const sw = 4 + hash(y * 3 + s) * 14;
      const a = (0.55 - k * 0.35) * (0.6 + Math.sin(fr.t * 3 + s + y) * 0.4);
      ctx.fillStyle = fr.phase === 2 ? `rgba(248,113,113,${a})` : `rgba(253,186,116,${a})`;
      ctx.fillRect(Math.round(sx), y, Math.round(sw), 1);
    }
  }
  // Gợn sóng óng ánh tím hồng khắp mặt sông
  for (let i = 0; i < 40; i++) {
    const y = RIVER_TOP + 4 + hash(i * 5) * (RIVER_BOTTOM - RIVER_TOP - 8);
    const x = ((hash(i * 11) * CANVAS_WIDTH + fr.t * (6 + hash(i) * 6)) % (CANVAS_WIDTH + 20)) - 10;
    const a = 0.25 + Math.sin(fr.t * 2 + i) * 0.15;
    px(ctx, x, y, 6 + hash(i * 2) * 8, 1, `rgba(244,180,255,${a})`);
  }
  // Dòng mã nhị phân / ký ức trôi lững lờ dưới mặt nước
  ctx.font = '8px monospace';
  for (const s of streams) {
    const yy = s.y + Math.sin(fr.t * 1.2 + s.x * 0.02) * 1.5;
    ctx.fillStyle = s.word ? `rgba(165,243,252,${s.alpha})` : `rgba(45,212,191,${s.alpha * 0.55})`;
    ctx.fillText(s.text, Math.round(s.x), Math.round(yy));
  }
  // Bóng cầu đổ trên mặt nước hai bên
  px(ctx, BRIDGE.x - 10, RIVER_TOP, 10, RIVER_BOTTOM - RIVER_TOP, 'rgba(20,4,30,0.4)');
  px(ctx, BRIDGE.x + BRIDGE.w, RIVER_TOP, 12, RIVER_BOTTOM - RIVER_TOP, 'rgba(20,4,30,0.4)');
}

/** Bến đá vọng cảnh + hoa đăng sen + tín hiệu glitch khi chưa kiểm tra (ch2_river) */
function drawDock(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y, w, h } = DOCK;
  block(ctx, x, y, w, h - 4, '#6b5a7a', '#8b7a9a', '#3e3350');
  px(ctx, x - 2, y + h - 4, w + 4, 4, '#2a2238');
  for (let gx = x + 12; gx < x + w - 6; gx += 14) px(ctx, gx, y + 2, 1, h - 7, '#3e3350');
  px(ctx, x + 2, y + 2, w - 4, 1, 'rgba(253,186,116,0.5)');
  // Cọc gỗ neo thuyền + dây thừng
  for (const cx of [x + 2, x + w - 8]) {
    block(ctx, cx, y - 6, 6, 12, '#5b2a0e', '#7c3a14', '#3b1803');
    px(ctx, cx - 1, y - 1, 8, 2, '#b45309');
  }
  // Hoa đăng sen bập bềnh
  const bob = Math.sin(fr.t * 3.6) * 2.5;
  const lx = x + 30;
  const ly = y - 10 + bob;
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.ellipse(lx, ly, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, lx - 6, ly - 3, 4, 3, '#f9a8d4');
  px(ctx, lx + 2, ly - 3, 4, 3, '#f9a8d4');
  px(ctx, lx - 1, ly - 5, 2, 3, '#fef08a');
  // Tín hiệu glitch gợi ý tương tác
  if (!fr.interacted.has('ch2_river')) {
    const ph = (fr.t * 1.5) % 1;
    ctx.strokeStyle = `rgba(34,211,238,${(1 - ph) * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 2, 8 + ph * 24, (8 + ph * 24) * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (Math.sin(fr.t * 6) > 0) {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('01', x + 30, y - 16 - ((fr.t * 10) % 10));
    }
  }
}

/** Cầu gỗ cong mộc mạc: ván sàn sáng dần ở giữa (vòm), lan can + cột, bồ câu & hộp nhạc trên lan can */
function drawBridge(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y, w, h } = BRIDGE;
  // Ván sàn: giữa cầu (vòm cao) bắt nắng sáng hơn
  for (let by = y; by < y + h; by += 8) {
    const k = Math.abs((by - y) / h - 0.45);
    // Khi ảo ảnh sụp đổ, gỗ cầu mất ánh nắng, sẫm lại
    const tone = fr.phase === 2
      ? (k < 0.15 ? '#7c2d12' : '#5a200c')
      : k < 0.15 ? '#b4532a' : k < 0.3 ? '#9a3412' : '#7c2d12';
    px(ctx, x, by, w, 7, tone);
    px(ctx, x, by + 7, w, 1, '#451a03');
    px(ctx, x, by, w, 1, 'rgba(253,186,116,0.25)');
    px(ctx, x + 8, by + 3, 2, 2, '#451a03');
    px(ctx, x + w - 10, by + 3, 2, 2, '#451a03');
    if (hash(by) > 0.6) px(ctx, x + 20 + hash(by * 3) * 90, by + 2, 14, 1, 'rgba(69,26,3,0.6)'); // Vân gỗ
  }
  // Dầm cầu & lan can hai bên
  for (const rx of [x - 6, x + w - 2]) {
    block(ctx, rx, y, 8, h, '#5b2a0e', '#7c3a14', '#3b1803');
    for (let py = y + 4; py < y + h; py += 20) block(ctx, rx - 1, py, 10, 6, '#b45309', '#d97706', '#78350f');
  }
}

/** Đôi bồ câu trắng đông cứng trên lan can (không một sợi lông lay động) */
function drawPigeons(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = PIGEONS;
  const x2 = x + 16;
  const y2 = y + 2;
  // Chân hồng bám lan can
  px(ctx, x + 2, y + 10, 3, 3, '#f472b6');
  px(ctx, x2 + 2, y2 + 9, 3, 3, '#f472b6');
  // Chim 1 nghiêng đầu
  px(ctx, x - 4, y + 5, 6, 5, DORM_PAL.outline);
  px(ctx, x - 1, y + 1, 10, 10, DORM_PAL.outline);
  px(ctx, x - 3, y + 6, 4, 3, '#94a3b8');
  px(ctx, x, y + 2, 8, 8, '#f8fafc');
  px(ctx, x + 2, y, 6, 4, '#f8fafc');
  px(ctx, x + 1, y + 5, 5, 4, '#cbd5e1');
  px(ctx, x + 8, y + 1, 3, 2, '#fb923c');
  px(ctx, x + 5, y + 1, 2, 2, '#0f172a');
  px(ctx, x + 5, y + 1, 1, 1, '#ffffff');
  px(ctx, x + 2, y, 6, 1, 'rgba(253,186,116,0.8)');           // Viền nắng chiều
  // Chim 2 rúc đầu
  px(ctx, x2 - 3, y2, 15, 11, DORM_PAL.outline);
  px(ctx, x2 + 7, y2 + 5, 4, 3, '#94a3b8');
  px(ctx, x2, y2 + 2, 8, 7, '#f8fafc');
  px(ctx, x2 - 2, y2 + 1, 5, 4, '#f8fafc');
  px(ctx, x2 + 2, y2 + 4, 5, 4, '#cbd5e1');
  px(ctx, x2 - 4, y2 + 2, 2, 2, '#fb923c');
  px(ctx, x2 - 1, y2 + 1, 2, 2, '#0f172a');
  px(ctx, x2 - 2, y2 + 1, 10, 1, 'rgba(253,186,116,0.8)');
  // Hạt kê vàng
  px(ctx, x + 12, y + 5, 2, 2, '#fde047');
  px(ctx, x2 + 10, y2 + 5, 2, 2, '#fde047');
  // Đông cứng: viền xanh + mã lỗi 0xDEAD (chỉ khi chưa kiểm tra)
  if (!fr.interacted.has('ch2_pigeon')) {
    ctx.strokeStyle = 'rgba(34,211,238,0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 5.5, y - 3.5, 28, 18);
    if (Math.sin(fr.t * 4) > 0.4) {
      ctx.font = 'bold 7px monospace';
      outlinedText(ctx, '0xDEAD', x - 3, y - 6, '#22d3ee');
    }
  }
}

/** Hộp âm nhạc gỗ gụ trên lan can phải: bánh răng, nốt nhạc pixel bay lơ lửng */
function drawMusicBox(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = MUSIC_BOX;
  const done = fr.interacted.has('ch2_music_box');
  if (!done) {
    const glow = ctx.createRadialGradient(x + 8, y + 4, 2, x + 8, y + 4, 18);
    glow.addColorStop(0, `rgba(251,191,36,${0.35 + Math.sin(fr.t * 6) * 0.15})`);
    glow.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 12, y - 14, 40, 36);
  }
  block(ctx, x, y, 16, 12, '#78350f', '#92400e', '#451a03');
  for (const [cx, cy] of [[0, 0], [13, 0], [0, 9], [13, 9]]) px(ctx, x + cx, y + cy, 3, 3, '#fde047');
  px(ctx, x + 2, y + 2, 11, 7, '#881337');
  // Nắp mở hé
  px(ctx, x - 3, y - 5, 17, 5, '#92400e');
  px(ctx, x - 3, y - 5, 17, 1, '#fde047');
  // Trục cót + bánh răng xoay
  const step = Math.floor(fr.t * 8) % 2;
  px(ctx, x + 4, y + 3, 6, 4, '#fef08a');
  px(ctx, x + 5 + step, y + 2, 2, 6, '#f59e0b');
  px(ctx, x + 16, y + 4, 3, 2, '#f59e0b');
  px(ctx, x + 18, y + 3, 1, 4, '#f59e0b');
  // Nốt nhạc pixel (thân + đầu nốt)
  const note = (nx: number, ny: number, col: string) => {
    px(ctx, nx, ny, 3, 2, col);
    px(ctx, nx + 2, ny - 6, 1, 7, col);
    px(ctx, nx + 2, ny - 6, 3, 1, col);
  };
  note(x + 2, y - 8 + Math.sin(fr.t * 4.8) * 4, done ? '#ec4899' : '#fbbf24');
  note(x + 11, y - 14 + Math.sin(fr.t * 4.8 + 1.5) * 4, done ? '#f472b6' : '#f59e0b');
}

/** Biển tên góc phố BẾN BÌNH AN • SEC_1705 */
function drawSign(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = SIGN;
  longShadow(ctx, x + 8, y + 20, 22, 3, 0.25);
  px(ctx, x + 6, y, 4, 20, '#3b1803');
  block(ctx, x - 18, y - 14, 52, 14, '#1e293b', '#334155', '#0f172a', '#b45309');
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef08a';
  ctx.fillText('BẾN BÌNH AN', x + 8, y - 6);
  ctx.font = '6px monospace';
  ctx.fillStyle = Math.sin(fr.t * 6) > 0.7 ? '#22d3ee' : '#94a3b8';
  ctx.fillText('SEC_1705', x + 8, y - 1);
  ctx.textAlign = 'left';
}

/** Cột đèn đường cổ điển (vàng ấm → chập chờn đỏ khi thế giới sắp vỡ) */
function drawStreetLamp(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = LAMP_POST;
  longShadow(ctx, x + 2, y + 85, 46, 3, 0.3);
  block(ctx, x - 4, y + 80, 12, 5, '#1e293b', '#334155', '#0f172a');
  px(ctx, x, y + 10, 4, 72, '#1e293b');
  px(ctx, x, y + 10, 1, 72, '#475569');
  block(ctx, x - 6, y, 16, 4, '#1e293b', '#334155', '#0f172a');
  const broken = fr.anomalies >= 4;
  const on = !broken || Math.sin(fr.t * 12) > 0.3;
  block(ctx, x - 4, y + 4, 12, 9, broken ? (on ? '#f43f5e' : '#7f1d1d') : '#fbbf24', broken ? '#fda4af' : '#fef08a', broken ? '#7f1d1d' : '#b45309');
}

/** Quán cà phê vỉa hè: dù sọc, bàn khăn ca-rô, 2 ghế mây, ly bạc xỉu khói lặp đúng 2 giây */
function drawCafe(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = CAFE_TABLE;
  longShadow(ctx, x, y + 16, 40, 12, 0.3);
  // Ghế mây
  for (const cx of [110, 166]) {
    block(ctx, cx, 300, 14, 22, '#5b2a0e', '#7c3a14', '#3b1803');
    block(ctx, cx + 2, 302, 10, 9, '#92400e', '#b45309', '#5b2a0e');
    block(ctx, cx, 290, 14, 8, '#b45309', '#d97706', '#78350f');
    for (let k = cx + 2; k < cx + 13; k += 3) px(ctx, k, 291, 1, 6, '#78350f');   // Nan mây
  }
  // Chân bàn gang
  px(ctx, x - 2, y, 4, 16, '#0f172a');
  px(ctx, x - 8, y + 14, 16, 3, '#0f172a');
  // Cán dù
  px(ctx, x - 1, y - 52, 2, 52, '#3f3f46');
  // Khăn ca-rô hồng + trắng
  ctx.fillStyle = DORM_PAL.outline;
  ctx.beginPath();
  ctx.ellipse(x, y, 27, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.ellipse(x, y, 26, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let cx = x - 24; cx <= x + 24; cx += 8) px(ctx, cx, y - 16, 4, 32, 'rgba(255,255,255,0.75)');
  for (let cy = y - 14; cy <= y + 14; cy += 8) px(ctx, x - 26, cy, 52, 3, 'rgba(255,255,255,0.45)');
  ctx.restore();
  // Lọ gốm + cành hoa tím
  px(ctx, x - 13, y - 8, 5, 7, '#64748b');
  px(ctx, x - 15, y - 12, 4, 4, '#c084fc');
  px(ctx, x - 12, y - 14, 4, 4, '#e879f9');
  // Ly bạc xỉu
  const cx = x + 4;
  const cy = y - 8;
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 10, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, cx - 1, cy - 1, 11, 14, 'rgba(255,255,255,0.35)');
  px(ctx, cx + 1, cy + 8, 7, 3, '#fef08a');
  px(ctx, cx + 1, cy + 3, 7, 5, '#5b2a0e');
  px(ctx, cx + 1, cy + 1, 7, 2, '#b45309');
  px(ctx, cx + 3, cy + 3, 3, 3, 'rgba(255,255,255,0.85)');
  px(ctx, cx + 6, cy - 5, 2, 7, '#f43f5e');
  px(ctx, cx + 6, cy - 3, 2, 2, '#ffffff');
  // Khói lặp chính xác 2 giây: cuối mỗi vòng giật tua ngược một nhịp
  const ph = (fr.t % 2) / 2;
  const rewind = ph > 0.92 ? (Math.random() - 0.5) * 4 : 0;
  for (let i = 0; i < 3; i++) {
    const q = (ph + i * 0.18) % 1;
    const sx = cx + 4 + Math.sin(q * Math.PI * 2) * 3 + rewind;
    const sy = cy - 6 - q * 22;
    const s = 2 + Math.floor(q * 3);
    px(ctx, sx, sy, s, s, `rgba(255,255,255,${0.7 * (1 - q)})`);
  }
  // Dù che sọc hồng kem (đổ bóng xuống bàn)
  const top = y - 58;
  ctx.fillStyle = DORM_PAL.outline;
  ctx.beginPath();
  ctx.moveTo(x - 42, top + 16); ctx.lineTo(x, top - 2); ctx.lineTo(x + 42, top + 16);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f9a8d4' : '#fff1e6';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - 40 + i * (80 / 6), top + 15);
    ctx.lineTo(x - 40 + (i + 1) * (80 / 6), top + 15);
    ctx.closePath();
    ctx.fill();
  }
  for (let fx = x - 40; fx < x + 40; fx += 6) px(ctx, fx, top + 15, 4, 3, '#f472b6');     // Diềm rủ
  px(ctx, x - 1, top - 4, 2, 4, '#3f3f46');
}

/** Chiếc ô trong suốt đọng nước mưa đêm 17/05 + đài bán dẫn cổ */
function drawUmbrellaRadio(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = UMBRELLA;
  // Vũng nước dưới chân ô (vô lý giữa trời hoàng hôn khô ráo)
  ctx.fillStyle = 'rgba(56,189,248,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 8, y + 22, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, x + 2, y + 21, 8, 1, 'rgba(253,186,116,0.6)');
  // Cán ô
  px(ctx, x + 8, y - 6, 2, 26, '#0f172a');
  px(ctx, x + 6, y + 18, 4, 2, '#0f172a');
  // Tán ô trong suốt
  ctx.fillStyle = 'rgba(226,232,240,0.38)';
  ctx.beginPath();
  ctx.ellipse(x + 8, y + 4, 10, 16, Math.PI / 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 12); ctx.lineTo(x + 4, y + 18);
  ctx.moveTo(x + 8, y - 12); ctx.lineTo(x + 13, y + 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  // Giọt nước đọng + nhỏ xuống
  for (const [dx, dy] of [[5, 6], [11, 10], [7, 14], [10, 0]]) {
    px(ctx, x + dx, y + dy, 1, 2, '#7dd3fc');
    px(ctx, x + dx, y + dy, 1, 1, '#ffffff');
  }
  const drip = (fr.t * 1.5) % 1;
  if (drip < 0.3) px(ctx, x + 8, y + 18 + drip * 20, 1, 2, '#7dd3fc');
  // Đài bán dẫn cổ đặt cạnh
  const rx = x + 16;
  const ry = y + 14;
  block(ctx, rx, ry, 18, 11, '#7c4a23', '#9a6235', '#4a2a10');
  px(ctx, rx + 2, ry + 2, 7, 7, '#2a1a0e');
  for (let gy = ry + 3; gy < ry + 9; gy += 2) px(ctx, rx + 2, gy, 7, 1, '#5a3a20');   // Lưới loa
  px(ctx, rx + 11, ry + 2, 5, 3, Math.sin(fr.t * 2) > -0.5 ? '#fbbf24' : '#92400e');    // Mặt số dò sóng
  px(ctx, rx + 12, ry + 6, 3, 3, '#d6d3d1');                                            // Núm vặn
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(rx + 15, ry); ctx.lineTo(rx + 22, ry - 12);
  ctx.stroke();
}

/** Cây hoa tử đằng tím: tán lắc theo gió, chùm hoa rủ đung đưa */
function drawWisteria(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = TREE;
  const sway = Math.sin(fr.t * 0.9) * 2.5 * fr.wind;
  longShadow(ctx, x + 9, y, 70, 18, 0.32);
  // Thân cây cổ thụ
  block(ctx, x - 9, y - 70, 18, 70, '#2a1d1a', '#3d2b26', '#14100e');
  px(ctx, x - 5, y - 60, 3, 50, 'rgba(253,186,116,0.25)');       // Nắng hắt mép thân
  px(ctx, x - 14, y - 4, 28, 4, '#14100e');                     // Rễ
  // Cành chính
  ctx.strokeStyle = '#2a1d1a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - 60); ctx.lineTo(x - 30 + sway, y - 100);
  ctx.moveTo(x, y - 55); ctx.lineTo(x + 28 + sway, y - 98);
  ctx.stroke();
  // Tán lá tím nhiều lớp với dither
  const blobs: Array<[number, number, number, string]> = [
    [x + 1, y - 95, 58, '#4a044e'],
    [x - 29, y - 110, 46, '#701a75'],
    [x + 21, y - 120, 46, '#701a75'],
    [x - 9, y - 115, 36, '#a855f7'],
    [x + 13, y - 100, 24, '#c084fc'],
  ];
  for (const [bx, by, r, col] of blobs) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx + sway, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Đốm sáng ráng chiều trên tán (phía mặt trời)
  for (let i = 0; i < 40; i++) {
    const a = hash(i * 3) * Math.PI * 2;
    const rr = hash(i * 7) * 50;
    px(ctx, x - 10 + Math.cos(a) * rr + sway, y - 120 + Math.sin(a) * rr * 0.7, 2, 2, hash(i) > 0.5 ? '#e9d5ff' : '#f0abfc');
  }
  // Chùm hoa rủ đung đưa
  const cascades = [[-44, -60, 18], [-29, -50, 24], [-14, -55, 28], [16, -57, 22], [36, -65, 16], [0, -48, 20]];
  cascades.forEach(([ox, oy, len], i) => {
    const sw = Math.sin(fr.t * 1.4 + i) * 2 * fr.wind + sway;
    for (let k = 0; k < len; k += 3) {
      const kx = x + ox + sw * (k / len);
      px(ctx, kx, y + oy + k, 4 - Math.floor(k / len * 2), 3, k % 6 === 0 ? '#e879f9' : '#c084fc');
    }
  });
}

/** Băng ghế đá hoàng hôn + góc Polaroid lấp lánh ánh kim (ch2_bench) */
function drawBench(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = BENCH;
  longShadow(ctx, x + 23, y + 20, 50, 14, 0.3);
  // Chân đá
  block(ctx, x + 3, y + 8, 8, 14, '#57534e', '#78716c', '#3f3a36');
  block(ctx, x + 36, y + 8, 8, 14, '#57534e', '#78716c', '#3f3a36');
  // Mặt ghế đá mài
  block(ctx, x - 2, y + 2, 51, 9, '#a8a29e', '#d6d3d1', '#78716c');
  for (let i = 0; i < 14; i++) px(ctx, x + hash(i * 3) * 47, y + 3 + hash(i * 7) * 6, 1, 1, 'rgba(60,55,50,0.6)'); // Hạt đá
  px(ctx, x - 1, y + 3, 49, 1, 'rgba(253,186,116,0.5)');
  // Lưng ghế
  block(ctx, x, y - 10, 47, 8, '#a8a29e', '#d6d3d1', '#78716c');
  // Bức ảnh Polaroid trên ghế
  const done = fr.interacted.has('ch2_bench');
  block(ctx, x + 18, y + 2, 11, 9, '#f5f5f4', '#ffffff', '#d6d3d1');
  if (done) {
    px(ctx, x + 19, y + 3, 9, 5, '#e2b8a0');                    // Lộ mặt An quấn băng
    px(ctx, x + 19, y + 3, 9, 2, '#f8fafc');
    px(ctx, x + 22, y + 4, 3, 1, '#dc2626');
  } else {
    px(ctx, x + 19, y + 3, 9, 5, '#3f3f46');                    // Phủ bụi tĩnh điện
    const glint = (Math.sin(fr.t * 3.3) + 1) / 2;
    if (glint > 0.6) {
      const a = (glint - 0.6) / 0.4;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x + 27, y - 1, 1, 7);
      ctx.fillRect(x + 24, y + 2, 7, 1);
    }
  }
  // Cánh hoa rụng dưới chân ghế
  for (const [dx, dy] of [[-4, 18], [10, 21], [24, 19], [35, 22], [46, 17]]) px(ctx, x + dx, y + dy, 3, 2, 'rgba(192,132,252,0.85)');
}

/** Xe đạp Thống Nhất khung xanh rêu dựng gốc cây */
function drawBicycle(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  const { x, y } = BIKE;
  longShadow(ctx, x + 16, y + 25, 34, 6, 0.28);
  ctx.lineWidth = 1.5;
  // Bánh xe + nan hoa xoay rất chậm (gió)
  for (const wx of [x + 5, x + 27]) {
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(wx, y + 18, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(203,213,225,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 4 + fr.t * 0.2;
      ctx.moveTo(wx - Math.cos(a) * 6, y + 18 - Math.sin(a) * 6);
      ctx.lineTo(wx + Math.cos(a) * 6, y + 18 + Math.sin(a) * 6);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
  }
  // Khung xanh rêu + viền nắng
  ctx.strokeStyle = '#3f6212';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 18); ctx.lineTo(x + 14, y + 8); ctx.lineTo(x + 22, y + 8); ctx.lineTo(x + 27, y + 18);
  ctx.moveTo(x + 14, y + 8); ctx.lineTo(x + 18, y + 18); ctx.lineTo(x + 27, y + 18);
  ctx.stroke();
  px(ctx, x + 14, y + 7, 8, 1, 'rgba(253,186,116,0.7)');
  // Giỏ trước + hoa tím
  block(ctx, x, y + 4, 6, 6, '#94a3b8', '#cbd5e1', '#64748b');
  px(ctx, x + 1, y + 4, 2, 2, '#c084fc');
  px(ctx, x + 3, y + 3, 2, 2, '#e879f9');
  // Ghi-đông, chuông, yên, chân chống
  px(ctx, x + 6, y + 2, 2, 7, '#cbd5e1');
  px(ctx, x + 4, y + 2, 5, 1, '#cbd5e1');
  px(ctx, x + 3, y + 1, 2, 2, '#fde047');
  block(ctx, x + 21, y + 5, 7, 3, '#78350f', '#92400e', '#451a03');
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 18); ctx.lineTo(x + 14, y + 24);
  ctx.stroke();
}

/** Miên (AURA Hologram): lơ lửng trong nắng chiều, tóc & tà váy lay theo gió, bóng ma toả tím, bụi sáng bay quanh */
function drawMien(ctx: CanvasRenderingContext2D, fr: SunsetFrame, sprites: SunsetSprites) {
  const float = mienFloat(fr.t);
  const footY = MIEN.y + SPRITE_H - 4;
  const cx = MIEN.x + SPRITE_W / 2;
  const my = MIEN.y + float;
  longShadow(ctx, cx, footY, 46, 6, 0.3);
  drawHoloShadow(ctx, cx, footY, float, fr.t);
  drawHoloDust(ctx, cx, my + SPRITE_H / 2, SPRITE_W, SPRITE_H, fr.t, 'back', 10);
  if (sprites.mien) {
    // Đứng thẳng ở frame 1, quay mặt xuống
    const f = getSpriteFrame(sprites.mien, 1, DIR_ROW.down, false, SPRITE_W, SPRITE_H);
    drawSwayingFigure(ctx, f, MIEN.x, my, fr.t);
    // Viền nắng chiều trên mái tóc
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    drawSwayingFigure(ctx, f, MIEN.x, my - 1, fr.t);
    ctx.restore();
  }
  drawHoloDust(ctx, cx, my + SPRITE_H / 2, SPRITE_W, SPRITE_H, fr.t, 'front', 10);
}

/** An + bóng đổ dài theo hướng nắng */
function drawPlayer(ctx: CanvasRenderingContext2D, fr: SunsetFrame, sprites: SunsetSprites) {
  const p = fr.player;
  longShadow(ctx, p.x, p.y + 16, 44, 6, 0.38);
  if (sprites.an) drawSprite(ctx, sprites.an, p.frame, p.dir, p.x - SPRITE_W / 2, p.y - SPRITE_H + 18 + bodyBob(p, fr.t));
}

/** Vẽ vật thể mặt đất theo chiều sâu (y-sort theo chân vật thể) */
function drawGroundObjects(ctx: CanvasRenderingContext2D, fr: SunsetFrame, sprites: SunsetSprites) {
  const items: Array<{ y: number; draw: () => void }> = [
    { y: SIGN.y + 20, draw: () => drawSign(ctx, fr) },
    { y: LAMP_POST.y + 85, draw: () => drawStreetLamp(ctx, fr) },
    { y: UMBRELLA.y + 24, draw: () => drawUmbrellaRadio(ctx, fr) },
    { y: CAFE_TABLE.y + 17, draw: () => drawCafe(ctx, fr) },
    { y: TREE.y, draw: () => drawWisteria(ctx, fr) },
    { y: BENCH.y + 22, draw: () => drawBench(ctx, fr) },
    { y: BIKE.y + 25, draw: () => drawBicycle(ctx, fr) },
    { y: MIEN.y + SPRITE_H - 4, draw: () => drawMien(ctx, fr, sprites) },
    { y: fr.player.y + 16, draw: () => drawPlayer(ctx, fr, sprites) },
  ];
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/** Cánh hoa tím bay lượn từ phải sang trái */
function drawPetals(ctx: CanvasRenderingContext2D, petals: Petal[]) {
  for (const pt of petals) {
    const flip = Math.abs(Math.cos(pt.rot));
    const w = Math.max(1, Math.round(pt.size * 1.6 * flip));
    px(ctx, pt.x, pt.y, w, Math.max(1, Math.round(pt.size)), 'rgba(232,121,249,0.85)');
    px(ctx, pt.x, pt.y, 1, 1, 'rgba(250,232,255,0.9)');
  }
}

/** Ánh sáng hoàng hôn: tint tâm lý + bloom mặt trời + nắng xiên + đèn đường + hào quang Miên */
function drawSunsetLighting(ctx: CanvasRenderingContext2D, fr: SunsetFrame) {
  // Lớp tint theo tâm lý (ấm → tím lạnh → đỏ báo động)
  ctx.fillStyle = fr.phase === 2 ? 'rgba(60,6,20,0.3)' : fr.phase === 1 ? 'rgba(126,34,206,0.14)' : 'rgba(244,63,94,0.08)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Bloom mặt trời + nắng ráng chiều phủ xuống mặt đất gần chân trời
  const bloom = ctx.createRadialGradient(SUN.x, SUN.y, 10, SUN.x, SUN.y, 260);
  bloom.addColorStop(0, fr.phase === 2 ? 'rgba(239,68,68,0.22)' : 'rgba(255,190,120,0.28)');
  bloom.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(SUN.x - 260, SUN.y - 260, 520, 520);
  const rake = ctx.createLinearGradient(0, SKY_BOTTOM, 0, 340);
  rake.addColorStop(0, fr.phase === 2 ? 'rgba(180,30,40,0.14)' : 'rgba(255,150,80,0.16)');
  rake.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = rake;
  ctx.fillRect(0, SKY_BOTTOM, CANVAS_WIDTH, 340 - SKY_BOTTOM);
  // Vầng đèn đường
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  if (fr.anomalies < 4) glow(LAMP_POST.x + 2, LAMP_POST.y + 30, 90, '251,191,36', 0.22);
  else if (Math.sin(fr.t * 12) > 0.3) glow(LAMP_POST.x + 2, LAMP_POST.y + 30, 60, '239,68,68', 0.2);
  // Hào quang hồng quanh Miên (pháo đài cuối cùng của ký ức)
  glow(MIEN.x + 21, MIEN.y + 20, 75, '244,114,182', fr.anomalies >= 4 ? 0.26 : 0.18);
  ctx.restore();
}

/** HUD canvas: chấm lấp lánh manh mối chưa xem, khung ngắm, nhãn Miên, đồng hồ/SANITY tông hồng tím */
function drawSunsetHUD(ctx: CanvasRenderingContext2D, fr: SunsetFrame, interactables: InteractableObject[]) {
  for (const item of interactables) {
    if (item.id === 'ch2_mien' || item === fr.nearest) continue;
    if (CORE_ANOMALY_IDS.includes(item.id) && !fr.interacted.has(item.id) && (fr.t * 60 + item.x) % 60 < 20) {
      px(ctx, item.x + item.w / 2 - 1, item.y + item.h / 2 - 1, 3, 3, 'rgba(251,191,36,0.75)');
    }
  }
  const n = fr.nearest;
  if (n) {
    if (n.id === 'ch2_mien') {
      const ready = fr.anomalies >= 5;
      drawTargetMarker(ctx, n, ready ? '#f472b6' : '#fda4af', fr.t);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      outlinedText(ctx, ready ? '[E] ✦ SỐ PHẬN' : `[E] (${fr.anomalies}/5)`, n.x + n.w / 2, n.y - 16, ready ? '#f9a8d4' : '#fecdd3');
      ctx.textAlign = 'left';
    } else {
      const done = fr.interacted.has(n.id) && !n.canRepeat;
      drawTargetMarker(ctx, n, done ? 'rgba(161,161,170,0.75)' : '#f9a8d4', fr.t);
    }
  }
  drawVitals(ctx, fr.t, fr.sanity, { clock: '#f9a8d4', heart: '#f472b6', label: '#fdba74', bar: '#f0abfc' });
  const label = fr.phase === 2 ? 'ẢO ẢNH: SỤP ĐỔ' : fr.phase === 1 ? 'ẢO ẢNH: RẠN NỨT' : 'ẢO ẢNH: BÌNH YÊN';
  drawHudSubtitle(ctx, label, fr.phase === 2 ? '#f87171' : fr.phase === 1 ? '#f0abfc' : '#fdba74');
}

// =====================================================================
// MÔ PHỎNG: cánh hoa, dòng dữ liệu trên sông
// =====================================================================

function createSunsetSim(): SunsetSim {
  const words = ['17/05', 'AN', 'MIÊN', 'KÝ ỨC', '03:14', 'BÌNH AN'];
  const binary = ['01000001', '01010101', '01001101', '10110100', '00110001', '01110111'];
  const streams: DataStream[] = [];
  for (let i = 0; i < 12; i++) {
    const word = i % 2 === 0;
    streams.push({
      x: hash(i * 17) * CANVAS_WIDTH,
      y: RIVER_TOP + 12 + hash(i * 5) * (RIVER_BOTTOM - RIVER_TOP - 18),
      text: word ? words[(i / 2) % words.length] : `${binary[i % binary.length]} ${binary[(i + 2) % binary.length]}`,
      speed: 0.35 + hash(i * 3) * 0.4,
      alpha: 0.55 + hash(i * 7) * 0.35,
      word,
    });
  }
  return {
    petals: Array.from({ length: 22 }, () => ({
      x: 550 + Math.random() * 240,
      y: 100 + Math.random() * 380,
      vx: -(0.4 + Math.random() * 0.5),
      vy: 0.3 + Math.random() * 0.4,
      rot: Math.random() * Math.PI * 2,
      size: 2 + Math.random() * 1.5,
    })),
    streams,
    nextChime: 12 + Math.random() * 4,
  };
}

/** Cập nhật mô phỏng; trả về true nếu đến lúc chuông gió ngân */
function updateSunsetSim(sim: SunsetSim, k: number, t: number, anomalies: number): boolean {
  const gust = anomalies >= 4 ? 1.8 : 1;
  for (const pt of sim.petals) {
    pt.x += pt.vx * gust * k;
    pt.y += pt.vy * (anomalies >= 4 ? 1.5 : 1) * k + Math.sin(t * 2 + pt.rot) * 0.15 * k;
    pt.rot += 0.04 * k;
    if (pt.x < -10 || pt.y > CANVAS_HEIGHT + 10) {
      pt.x = 600 + Math.random() * 220;
      pt.y = 80 + Math.random() * 80;
    }
  }
  for (const s of sim.streams) {
    s.x += s.speed * k;
    if (s.x > CANVAS_WIDTH + 40) s.x = -90;
  }
  // Chuông gió ngân nga ngẫu nhiên mỗi 12-16 giây
  if (t >= sim.nextChime) {
    sim.nextChime = t + 12 + Math.random() * 4;
    return Math.random() > 0.3;
  }
  return false;
}

// =====================================================================
// COMPONENT
// =====================================================================

export const SunsetStage: React.FC<SunsetStageProps> = ({
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
  const anSpriteRef = useRef<HTMLImageElement | null>(null);
  const mienSpriteRef = useRef<HTMLImageElement | null>(null);

  // Audio helper
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

  // Tiếng bước chân nhẹ trên nền gạch hoàng hôn
  const playStepSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160 + Math.random() * 20, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.04);
      g.gain.setValueAtTime((volume / 100) * 0.02, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng hộp âm nhạc 4 nốt du dương (Canon in D loop: C5, G4, A4, E4)
  const playMusicBoxSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const notes = [523.25, 392.00, 440.00, 329.63, 523.25, 392.00, 440.00, 329.63];
      notes.forEach((freq, i) => {
        const noteTime = t + i * 0.28;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);
        g.gain.setValueAtTime((volume / 100) * 0.07, noteTime);
        g.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.38);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + 0.38);
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng rè rè Glitch khi chạm vào vật bất thường
  const playGlitchSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.setValueAtTime(220, t + 0.04);
      osc.frequency.setValueAtTime(80, t + 0.08);
      g.gain.setValueAtTime((volume / 100) * 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng chuông gió phong linh leng keng êm đềm xa xăm
  const playWindChimeSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const freqs = [987.77, 1318.51, 1174.66];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + Math.random() * 8, t + idx * 0.14);
        g.gain.setValueAtTime((volume / 100) * 0.02, t + idx * 0.14);
        g.gain.exponentialRampToValueAtTime(0.0001, t + idx * 0.14 + 1.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.14);
        osc.stop(t + idx * 0.14 + 1.2);
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Vị trí nhân vật An trên cầu thị trấn
  const playerRef = useRef({
    x: 350,
    y: 270,
    speed: 3.2,
    dir: 'up' as Direction,
    isMoving: false,
    frame: 1,
    animTimer: 0,
  });

  const [localInteractedIds, setLocalInteractedIds] = useState<string[]>(interactedIds);
  const [activePrompt, setActivePrompt] = useState<{ text: string; isDone: boolean } | null>(null);
  const [monologueWhisper, setMonologueWhisper] = useState<string | null>(null);
  const [activeMinigame, setActiveMinigame] = useState<'MUSIC_BOX' | 'POLAROID' | 'RADIO' | null>(null);
  const activeMinigameRef = useRef<'MUSIC_BOX' | 'POLAROID' | 'RADIO' | null>(null);
  useEffect(() => { activeMinigameRef.current = activeMinigame; }, [activeMinigame]);
  const whisperTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keysHeld = useRef<Set<string>>(new Set());

  // Đồng bộ khi prop từ cha thay đổi (điều chỉnh state ngay trong render thay vì effect)
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

  // Lời tự sự mở màn khi bước vào Thị Trấn Hoàng Hôn
  useEffect(() => {
    const welcomeTimer = setTimeout(() => {
      showMonologueWhisper('Gió thoảng hương hoa chuông tím... Bốn bức tường phòng trọ đã vỡ vụn. Bạn đang ở Thị Trấn Hoàng Hôn.');
    }, 500);
    return () => clearTimeout(welcomeTimer);
  }, [showMonologueWhisper]);

  // Danh sách đồ vật / vết nứt tương tác ở Thị Trấn Hoàng Hôn
  const interactables = useRef<InteractableObject[]>([
    {
      id: 'ch2_river',
      name: 'Dòng Sông Mã Nhị Phân',
      actionText: '[E] Nhìn kỹ dòng nước nhị phân bên bến đá',
      x: 180,
      y: 200,
      w: 70,
      h: 35,
      triggerNodeId: 'obj_ch2_river',
      canRepeat: false,
      checkedMonologue: 'Dòng nước vẫn cuộn trôi những con số vô hồn. Không có rêu, không có cá, chỉ có rác bộ nhớ.',
    },
    {
      id: 'ch2_pigeon',
      name: 'Đàn Bồ Câu Bất Động',
      actionText: '[E] Chạm vào đôi bồ câu trên lan can cầu',
      x: 285,
      y: 135,
      w: 45,
      h: 40,
      triggerNodeId: 'obj_ch2_pigeon',
      canRepeat: false,
      checkedMonologue: 'Lông chim không hề lay động trước gió. Một mô hình quên bật vật lý chuyển động.',
    },
    {
      id: 'ch2_coffee',
      name: 'Tách Cà Phê Bất Tử',
      actionText: '[E] Ngồi xuống bàn cà phê ven đường',
      x: 120,
      y: 295,
      w: 55,
      h: 50,
      triggerNodeId: 'obj_ch2_coffee',
      canRepeat: false,
      checkedMonologue: 'Hương thơm nồng nàn nhưng ly cà phê không hề nguội đi dù một độ. Một vòng lặp 2 giây hoàn hảo.',
    },
    {
      id: 'ch2_bench',
      name: 'Băng Ghế Hoàng Hôn',
      actionText: '[E] Ngắm hoàng hôn dưới tán hoa tím',
      x: 630,
      y: 310,
      w: 65,
      h: 45,
      triggerNodeId: 'obj_ch2_bench',
      canRepeat: false,
      checkedMonologue: 'Bức ảnh trên ghế đá... Khuôn mặt quấn đầy băng gạc y tế... Mình thực sự đang nằm hôn mê ở bệnh viện sao?',
    },
    {
      id: 'ch2_music_box',
      name: 'Hộp Âm Nhạc Bị Kẹt Cót',
      actionText: '[E] Lên dây cót chiếc hộp âm nhạc [🎶]',
      x: 395,
      y: 135,
      w: 30,
      h: 25,
      triggerNodeId: 'obj_ch2_music_box',
      canRepeat: true,
      checkedMonologue: 'Tiếng tút dài của máy thở bên trong hộp nhạc... Nhịp tim của mình đang tụt dốc.',
    },
    {
      id: 'ch2_bicycle',
      name: 'Chiếc Xe Đạp Sinh Viên Cũ',
      actionText: '[E] Nhìn ngắm chiếc xe đạp cũ dựng bên cây',
      x: 700,
      y: 295,
      w: 45,
      h: 40,
      triggerNodeId: 'obj_ch2_bicycle',
      canRepeat: true,
      checkedMonologue: 'Chiếc xe đạp Thống Nhất màu xanh rêu... Mình từng chở Miên qua bao nhiêu con dốc sau giờ tan trường.',
    },
    {
      id: 'ch2_umbrella',
      name: 'Chiếc Ô Trong Suốt Đêm Mưa',
      actionText: '[E] Chạm vào chiếc ô ướt đẫm nước mưa',
      x: 75,
      y: 295,
      w: 35,
      h: 40,
      triggerNodeId: 'obj_ch2_umbrella',
      canRepeat: true,
      checkedMonologue: 'Chiếc ô ướt sũng nước mưa đêm 17/05... Ký ức về vụ tai nạn kinh hoàng đang ùa về.',
    },
    {
      id: 'ch2_mien',
      name: 'Miên (Người Tạo Tác)',
      actionText: '[E] Tâm sự cùng Miên bên cầu hoàng hôn',
      x: 390,
      y: 275,
      w: 45,
      h: 65,
      triggerNodeId: 'ch2_meet_mien',
      canRepeat: true,
      checkedMonologue: 'Miên mỉm cười nhìn bạn, trong mắt cô ấy phản chiếu ánh hoàng hôn dịu dàng nhưng phảng phất nét âu lo...',
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

  // Xử lý tương tác với vật thể (Hỗ trợ mở Minigame nếu chưa hoàn thành)
  const handleInteractWith = useCallback((target: InteractableObject) => {
    if (activeMinigameRef.current !== null) return;

    if (target.id === 'ch2_mien') {
      const anomaliesFound = localInteractedIds.filter(id => CORE_ANOMALY_IDS.includes(id)).length;
      const targetNode = anomaliesFound >= 5 ? 'ch2_mien_final' : 'ch2_meet_mien';
      onTrigger(targetNode);
      return;
    }

    // 1. Minigame Hộp Âm Nhạc Bị Kẹt Cót (1 trong 5 manh mối cốt lõi)
    if (target.id === 'ch2_music_box' && !localInteractedIds.includes('ch2_music_box')) {
      setActiveMinigame('MUSIC_BOX');
      return;
    }

    // 2. Minigame Bức Ảnh Polaroid Trên Băng Ghế (1 trong 5 manh mối cốt lõi)
    if (target.id === 'ch2_bench' && !localInteractedIds.includes('ch2_bench')) {
      setActiveMinigame('POLAROID');
      return;
    }

    // 3. Minigame Đài Bán Dẫn Đêm Mưa Cạnh Chiếc Ô (Vật phẩm kỷ niệm)
    if (target.id === 'ch2_umbrella' && !localInteractedIds.includes('ch2_umbrella')) {
      setActiveMinigame('RADIO');
      return;
    }

    if (target.id === 'ch2_music_box') {
      playMusicBoxSound();
    } else if (target.id === 'ch2_river' || target.id === 'ch2_pigeon' || target.id === 'ch2_umbrella') {
      playGlitchSound();
    }

    const isDone = localInteractedIds.includes(target.id) && !target.canRepeat;
    if (isDone) {
      const line = target.checkedMonologue || 'Chẳng còn điều gì bất thường ở đây nữa.';
      showMonologueWhisper(line);
    } else {
      if (!localInteractedIds.includes(target.id)) {
        setLocalInteractedIds(prev => [...prev, target.id]);
        onMarkInteracted?.(target.id);
      }
      onTrigger(target.triggerNodeId);
    }
  }, [localInteractedIds, onTrigger, onMarkInteracted, playGlitchSound, playMusicBoxSound, showMonologueWhisper]);

  // Xử lý bàn phím
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeMinigameRef.current !== null) {
        if (e.key === 'Escape') {
          setActiveMinigame(null);
        }
        return;
      }

      keysHeld.current.add(e.key.toLowerCase());

      if (e.key.toLowerCase() === 'e' || e.key === ' ' || e.key === 'Enter') {
        const p = playerRef.current;
        const target = interactables.current.find(obj => {
          const cx = obj.x + obj.w / 2;
          const cy = obj.y + obj.h / 2;
          return Math.hypot(p.x - cx, p.y - cy) < 65;
        });

        if (target) {
          handleInteractWith(target);
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
  }, [handleInteractWith]);

  // Ảnh chụp state mới nhất cho vòng lặp RAF (tránh khởi động lại loop mỗi lần state đổi)
  const snapshotRef = useRef<SunsetSnapshot>({ sanity, interacted: localInteractedIds });
  useEffect(() => {
    snapshotRef.current = { sanity, interacted: localInteractedIds };
  }, [sanity, localInteractedIds]);

  const soundRef = useRef({ playStepSound, playWindChimeSound });
  useEffect(() => {
    soundRef.current = { playStepSound, playWindChimeSound };
  }, [playStepSound, playWindChimeSound]);

  const promptKeyRef = useRef('');

  // Game Loop (chạy một lần, đọc state qua ref)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Nền tĩnh dựng lười theo từng giai đoạn bầu trời (tối đa 3 bản)
    const staticLayers: Array<HTMLCanvasElement | null> = [null, null, null];
    const postLayer = buildPostLayer(CANVAS_WIDTH, CANVAS_HEIGHT, 0.55, 220);
    const sim = createSunsetSim();

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

      // 1. Di chuyển nhân vật (Tạm dừng khi mở Minigame)
      if (activeMinigameRef.current !== null) {
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
          // Chu kỳ bước 0-1-2-1 (đổi chân mỗi 8 tick), tiếng bước khi chân chạm đất
          if (stepWalk(p, k)) soundRef.current.playStepSound();
        } else {
          stopWalk(p);
        }
      }

      // 2. Tiến trình manh mối + mô phỏng cánh hoa, dòng dữ liệu, chuông gió
      const anomalies = snap.interacted.filter(id => CORE_ANOMALY_IDS.includes(id)).length;
      const phase: 0 | 1 | 2 = anomalies >= 4 ? 2 : anomalies >= 2 ? 1 : 0;
      if (updateSunsetSim(sim, k, t, anomalies)) soundRef.current.playWindChimeSound();

      // 3. Prompt tương tác (cùng quy tắc chọn vật thể với phím E; chỉ setState khi đổi)
      const nearTarget = interactables.current.find(obj => {
        const cx = obj.x + obj.w / 2;
        const cy = obj.y + obj.h / 2;
        return Math.hypot(p.x - cx, p.y - cy) < INTERACT_RADIUS;
      }) ?? null;
      const prompt = nearTarget ? computePrompt(nearTarget, snap.interacted) : null;
      const promptKey = prompt ? `${prompt.isDone}|${prompt.text}` : '';
      if (promptKey !== promptKeyRef.current) {
        promptKeyRef.current = promptKey;
        setActivePrompt(prompt);
      }

      // 4. Vẽ
      const fr: SunsetFrame = {
        t,
        sanity: snap.sanity,
        anomalies,
        phase,
        wind: anomalies >= 4 ? 1.8 : 1,
        interacted: new Set(snap.interacted),
        player: p,
        nearest: nearTarget,
      };
      const sprites: SunsetSprites = {
        an: anSpriteRef.current && anSpriteRef.current.complete ? anSpriteRef.current : null,
        mien: mienSpriteRef.current && mienSpriteRef.current.complete ? mienSpriteRef.current : null,
      };
      let staticLayer = staticLayers[phase];
      if (!staticLayer) {
        staticLayer = buildSunsetStaticLayer(phase);
        staticLayers[phase] = staticLayer;
      }

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(staticLayer, 0, 0);
      drawSun(ctx, fr);
      drawClouds(ctx, fr);
      drawSkyCracks(ctx, fr);
      drawRiver(ctx, fr, sim.streams);
      drawDock(ctx, fr);
      drawBridge(ctx, fr);
      drawPigeons(ctx, fr);
      drawMusicBox(ctx, fr);
      drawGroundObjects(ctx, fr, sprites);
      drawPetals(ctx, sim.petals);
      drawSunsetLighting(ctx, fr);
      ctx.drawImage(postLayer, 0, 0);
      drawSunsetHUD(ctx, fr, interactables.current);

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const anomaliesCount = localInteractedIds.filter(id => CORE_ANOMALY_IDS.includes(id)).length;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {/* Khung Canvas hiển thị Thị Trấn Hoàng Hôn */}
      <div className="relative border-4 border-fuchsia-950/80 shadow-[0_0_60px_rgba(217,70,239,0.35)] rounded-sm overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pixelated block cursor-pointer max-w-full max-h-[86vh] object-contain"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Thông báo tương tác [E] nổi phía trên */}
        {activePrompt && (
          <div
            onClick={() => {
              const p = playerRef.current;
              const target = interactables.current.find(obj => {
                const cx = obj.x + obj.w / 2;
                const cy = obj.y + obj.h / 2;
                return Math.hypot(p.x - cx, p.y - cy) < 65;
              });
              if (target) handleInteractWith(target);
            }}
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-[92%] px-3.5 py-1.5 font-mono text-xs rounded-full flex items-center gap-2 backdrop-blur-sm cursor-pointer ${
              activePrompt.isDone
                ? 'bg-black/85 border border-zinc-700/80 text-zinc-400'
                : 'bg-black/90 border border-pink-500 text-pink-100 shadow-[0_0_20px_rgba(236,72,153,0.6)] animate-bounce'
            }`}
          >
            <span
              className={`shrink-0 px-1.5 py-0.5 font-bold rounded text-[10px] ${
                activePrompt.isDone
                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  : 'bg-pink-500 text-black shadow-[0_0_8px_rgba(236,72,153,0.9)]'
              }`}
            >
              {activePrompt.isDone ? 'ĐÃ KIỂM TRA' : 'E'}
            </span>
            <span className="truncate">{activePrompt.text}</span>
          </div>
        )}

        {/* Hộp thoại độc thoại nội tâm lướt qua góc màn hình */}
        {monologueWhisper && (
          <div
            onClick={() => setMonologueWhisper(null)}
            className="absolute bottom-12 right-3 max-w-xs sm:max-w-sm bg-black/95 border-l-4 border-pink-400 border-t border-r border-b border-zinc-800 p-3 rounded-r shadow-2xl animate-fade-in z-20 backdrop-blur-md cursor-pointer hover:border-pink-300 transition-colors"
            title="Click để đóng nhanh"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono text-pink-400 tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping inline-block" />
              Độc thoại nội tâm
            </div>
            <p className="text-xs sm:text-sm font-sans text-zinc-300 italic leading-snug">
              &ldquo;{monologueWhisper}&rdquo;
            </p>
          </div>
        )}

        {/* HUD gợi ý điều khiển & Tiến trình Ký ức Chương 2 */}
        <div className="absolute bottom-2 left-3 right-3 z-10 p-0.5 rounded border border-pink-500/70 bg-black/80 shadow-[0_0_14px_rgba(236,72,153,0.35)] backdrop-blur-sm">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-1 rounded-sm border border-fuchsia-900/80 text-[10px] font-mono text-zinc-400 whitespace-nowrap">
            <div className="flex items-center gap-2.5">
              <span><span className="text-pink-300 font-bold">WASD</span> Khám phá</span>
              <span><span className="text-pink-300 font-bold">E</span> Tương tác</span>
            </div>
            <div className="text-center truncate">
              {anomaliesCount >= 5 ? (
                <span className="text-pink-300 font-bold animate-pulse">[ĐÃ TÌM ĐỦ 5 MANH MỐI • HÃY TỚI GẶP MIÊN TRÊN CẦU]</span>
              ) : (
                <>
                  Ký ức bất thường: <span className="text-pink-300 font-bold">{anomaliesCount}/5</span> manh mối
                </>
              )}
            </div>
            <div className="text-pink-400/80 font-bold truncate">MÀN 2: THỊ TRẤN HOÀNG HÔN • BẾN BÌNH AN</div>
          </div>
        </div>
      </div>

      {/* =========================================================
          CÁC MINIGAME KỂ CHUYỆN (DIEGETIC NARRATIVE MICRO-GAMES)
         ========================================================= */}
      {activeMinigame === 'MUSIC_BOX' && (
        <MusicBoxMinigame
          volume={volume}
          onComplete={() => {
            setActiveMinigame(null);
            setSanity?.(prev => Math.max(10, prev - 5));
            if (!localInteractedIds.includes('ch2_music_box')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_music_box']);
              onMarkInteracted?.('ch2_music_box');
            }
            onTrigger('obj_ch2_music_box');
          }}
          onClose={() => {
            setActiveMinigame(null);
            if (!localInteractedIds.includes('ch2_music_box')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_music_box']);
              onMarkInteracted?.('ch2_music_box');
            }
            onTrigger('obj_ch2_music_box');
          }}
        />
      )}

      {activeMinigame === 'POLAROID' && (
        <PolaroidMinigame
          volume={volume}
          onComplete={() => {
            setActiveMinigame(null);
            setSanity?.(prev => Math.max(10, prev - 5));
            if (!localInteractedIds.includes('ch2_bench')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_bench']);
              onMarkInteracted?.('ch2_bench');
            }
            onTrigger('obj_ch2_bench');
          }}
          onClose={() => {
            setActiveMinigame(null);
            if (!localInteractedIds.includes('ch2_bench')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_bench']);
              onMarkInteracted?.('ch2_bench');
            }
            onTrigger('obj_ch2_bench');
          }}
        />
      )}

      {activeMinigame === 'RADIO' && (
        <RadioMinigame
          volume={volume}
          onComplete={() => {
            setActiveMinigame(null);
            setSanity?.(prev => Math.max(10, prev - 5));
            if (!localInteractedIds.includes('ch2_umbrella')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_umbrella']);
              onMarkInteracted?.('ch2_umbrella');
            }
            onTrigger('obj_ch2_umbrella');
          }}
          onClose={() => {
            setActiveMinigame(null);
            if (!localInteractedIds.includes('ch2_umbrella')) {
              setLocalInteractedIds(prev => [...prev, 'ch2_umbrella']);
              onMarkInteracted?.('ch2_umbrella');
            }
            onTrigger('obj_ch2_umbrella');
          }}
        />
      )}
    </div>
  );
};
