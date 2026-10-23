// =====================================================================
// SPRITE KIT DÙNG CHUNG — render & chuyển động nhân vật cho cả 4 stage
// Spritesheet 3x3, 64x96 px/frame: hàng 0 quay xuống, 1 quay lên, 2 quay phải
// (hướng trái = hàng 2 lật ngang). Frame 1 là tư thế đứng thẳng.
// =====================================================================

import { hash } from './pixelKit';

export const SHEET_FRAME_W = 64;
export const SHEET_FRAME_H = 96;

// =====================================================================
// 1. VẼ SPRITE SẮC NÉT (Crisp Pixel-Art Rendering)
// Sprite được "nướng" sẵn một lần đúng kích thước vẽ bằng nearest-neighbor
// lấy mẫu tại tâm pixel → mỗi frame vẽ 1:1 ở toạ độ nguyên, không nội suy,
// mắt và đường nét gương mặt không bị vỡ / nhấp nháy khi nhân vật di chuyển.
// =====================================================================

const bakedSheets = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement | null>>();

/** Dựng sheet 3 cột x 6 hàng ở kích thước w x h: hàng 0-2 gốc, hàng 3-5 lật ngang */
function bakeSheet(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement | null {
  try {
    const src = document.createElement('canvas');
    src.width = img.naturalWidth;
    src.height = img.naturalHeight;
    const sg = src.getContext('2d');
    if (!sg) return null;
    sg.drawImage(img, 0, 0);
    const sd = sg.getImageData(0, 0, src.width, src.height).data;

    const out = document.createElement('canvas');
    out.width = w * 3;
    out.height = h * 6;
    const og = out.getContext('2d');
    if (!og) return null;
    const od = og.createImageData(out.width, out.height);

    // Bảng tra toạ độ nguồn theo tâm pixel đích
    const mapX = Array.from({ length: w }, (_, dx) => Math.min(SHEET_FRAME_W - 1, Math.floor(((dx + 0.5) * SHEET_FRAME_W) / w)));
    const mapY = Array.from({ length: h }, (_, dy) => Math.min(SHEET_FRAME_H - 1, Math.floor(((dy + 0.5) * SHEET_FRAME_H) / h)));

    for (let r = 0; r < 6; r++) {
      const srcRow = r % 3;
      const flip = r >= 3;
      for (let col = 0; col < 3; col++) {
        for (let dy = 0; dy < h; dy++) {
          const sy = srcRow * SHEET_FRAME_H + mapY[dy];
          const oy = r * h + dy;
          for (let dx = 0; dx < w; dx++) {
            const lx = flip ? SHEET_FRAME_W - 1 - mapX[dx] : mapX[dx];
            const si = (sy * src.width + col * SHEET_FRAME_W + lx) * 4;
            const oi = (oy * out.width + col * w + dx) * 4;
            od.data[oi] = sd[si];
            od.data[oi + 1] = sd[si + 1];
            od.data[oi + 2] = sd[si + 2];
            od.data[oi + 3] = sd[si + 3];
          }
        }
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  } catch {
    return null; // Ảnh chưa sẵn sàng / canvas bị taint → vẽ trực tiếp
  }
}

function getBakedSheet(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement | null {
  if (!img.complete || img.naturalWidth === 0) return null;
  let bySize = bakedSheets.get(img);
  if (!bySize) {
    bySize = new Map();
    bakedSheets.set(img, bySize);
  }
  const key = `${w}x${h}`;
  if (!bySize.has(key)) bySize.set(key, bakeSheet(img, w, h));
  return bySize.get(key) ?? null;
}

/** Nguồn cắt một frame đã nướng sẵn (dùng cho hiệu ứng tách lớp như tóc/váy lay) */
export interface FrameSource {
  src: CanvasImageSource;
  sx: number;
  sy: number;
  w: number;
  h: number;
}

export function getSpriteFrame(img: HTMLImageElement, frame: number, row: number, flip: boolean, w: number, h: number): FrameSource {
  const sheet = getBakedSheet(img, w, h);
  if (sheet) return { src: sheet, sx: frame * w, sy: (row + (flip ? 3 : 0)) * h, w, h };
  // Dự phòng: cắt thẳng từ ảnh gốc (chưa nướng được)
  return { src: img, sx: frame * SHEET_FRAME_W, sy: row * SHEET_FRAME_H, w: SHEET_FRAME_W, h: SHEET_FRAME_H };
}

/** Vẽ một frame sprite ở toạ độ nguyên, tắt làm mịn ảnh */
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frame: number,
  row: number,
  flip: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const drawX = Math.round(x);
  const drawY = Math.round(y);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const sheet = getBakedSheet(img, w, h);
  if (sheet) {
    ctx.drawImage(sheet, frame * w, (row + (flip ? 3 : 0)) * h, w, h, drawX, drawY, w, h);
  } else if (flip) {
    ctx.save();
    ctx.translate(drawX + w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * SHEET_FRAME_W, row * SHEET_FRAME_H, SHEET_FRAME_W, SHEET_FRAME_H, 0, drawY, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, frame * SHEET_FRAME_W, row * SHEET_FRAME_H, SHEET_FRAME_W, SHEET_FRAME_H, drawX, drawY, w, h);
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

// =====================================================================
// 2. BƯỚC ĐI CÓ TRỌNG LƯỢNG (Walking Bobbing)
// Chu kỳ 0 → 1 → 2 → 1, đổi frame mỗi 8 tick (60 FPS chuẩn hoá).
// Frame 0 & 2 = chân chạm đất → hạ người 1px + phát tiếng bước chân.
// Frame 1 = chuyển tiếp → người nâng về chuẩn.
// =====================================================================

export const WALK_STEP_TICKS = 8;
const WALK_CYCLE = [0, 1, 2, 1] as const;
const BREATH_PERIOD = 1.5; // giây cho một nhịp thở

export interface WalkState {
  isMoving: boolean;
  frame: number;
  animTimer: number;
}

/**
 * Tiến animation đi bộ thêm k tick. Trả về true đúng lúc bàn chân chạm đất
 * (frame 0 hoặc 2) → nơi gọi phát playStepSound() để âm thanh khớp nhịp bước.
 */
export function stepWalk(p: WalkState, k: number): boolean {
  if (!p.isMoving) {
    // Vừa bắt đầu bước: đặt chân ngay, không chờ hết 8 tick đầu
    p.isMoving = true;
    p.animTimer = 0;
    p.frame = WALK_CYCLE[0];
    return true;
  }
  const prev = Math.floor(p.animTimer / WALK_STEP_TICKS);
  p.animTimer += k;
  const step = Math.floor(p.animTimer / WALK_STEP_TICKS);
  if (step === prev) return false;
  p.frame = WALK_CYCLE[step % WALK_CYCLE.length];
  return p.frame !== 1;
}

/** Dừng lại: đứng thẳng ở frame 1 */
export function stopWalk(p: WalkState) {
  p.isMoving = false;
  p.frame = 1;
  p.animTimer = 0;
}

/**
 * Độ lệch dọc (px, số nguyên) cộng vào toạ độ vẽ:
 * - Đang đi: frame bước chân (0/2) hạ 1px, frame 1 về chuẩn
 * - Đứng yên: thở nhẹ, nhấp nhô 1px theo chu kỳ 1.5 giây
 */
export function bodyBob(p: WalkState, t: number): number {
  if (p.isMoving) return p.frame === 1 ? 0 : 1;
  return (t % BREATH_PERIOD) < BREATH_PERIOD / 2 ? 0 : 1;
}

// =====================================================================
// 3. MIÊN — AURA HOLOGRAM
// Lơ lửng sin(tick * 0.08) * 3, tóc & tà váy lay nhẹ, bóng ma dẹt toả tím,
// bụi sáng pixel bay vòng quanh (chia lớp sau/trước để có chiều sâu).
// =====================================================================

/** Độ lơ lửng của Miên (px nguyên). t tính bằng giây → tick = t * 60 */
export const mienFloat = (t: number) => Math.round(Math.sin(t * 60 * 0.08) * 3);

// Vùng tóc hai bên & tà váy trên sprite quay mặt xuống (tỉ lệ theo khung 64x96)
const HAIR_Y0 = 29 / 96;
const HAIR_MID = 37 / 96;
const HAIR_Y1 = 46 / 96;
const HAIR_LEFT_X = 22 / 64;
const HAIR_RIGHT_X = 44 / 64;
const SKIRT_Y0 = 64 / 96;
const SKIRT_HEM = 69 / 96;
const SKIRT_Y1 = 74 / 96;
const SWAY_PAD = 2;

let swayCanvas: HTMLCanvasElement | null = null;

/** Độ lay ±1px theo pha (vùng chết ở giữa để không rung liên tục) */
const sway = (t: number, speed: number, phase: number) => {
  const s = Math.sin(t * speed + phase);
  return s > 0.35 ? 1 : s < -0.35 ? -1 : 0;
};

/**
 * Ghép sprite + các dải tóc/váy lệch ±1px lên canvas đệm (đục) rồi mới vẽ ra,
 * để khi vẽ hologram bán trong suốt các dải chồng nhau không bị sáng gấp đôi.
 * Gương mặt (giữa vùng tóc) không bao giờ bị dịch → giữ nguyên nét mắt.
 */
export function drawSwayingFigure(ctx: CanvasRenderingContext2D, f: FrameSource, x: number, y: number, t: number, drawW = f.w, drawH = f.h) {
  if (typeof document === 'undefined') return;
  const cw = drawW + SWAY_PAD * 2;
  if (!swayCanvas) swayCanvas = document.createElement('canvas');
  if (swayCanvas.width < cw || swayCanvas.height < drawH) {
    swayCanvas.width = Math.max(swayCanvas.width, cw);
    swayCanvas.height = Math.max(swayCanvas.height, drawH);
  }
  const g = swayCanvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, swayCanvas.width, swayCanvas.height);
  g.drawImage(f.src, f.sx, f.sy, f.w, f.h, SWAY_PAD, 0, drawW, drawH);

  // Cắt một dải chữ nhật (toạ độ đích) của sprite và vẽ lệch dx
  const band = (x0: number, y0: number, x1: number, y1: number, dx: number) => {
    if (dx === 0) return;
    const bx = Math.round(x0 * drawW);
    const by = Math.round(y0 * drawH);
    const bw = Math.round(x1 * drawW) - bx;
    const bh = Math.round(y1 * drawH) - by;
    if (bw <= 0 || bh <= 0) return;
    const kx = f.w / drawW;
    const ky = f.h / drawH;
    g.drawImage(f.src, f.sx + bx * kx, f.sy + by * ky, bw * kx, bh * ky, SWAY_PAD + bx + dx, by, bw, bh);
  };

  // Tóc hai bên: phần chân tóc lay trước, đuôi tóc trễ pha (như gió thổi)
  const hairRoot = sway(t, 2.1, 0);
  const hairTip = sway(t, 2.1, -0.9);
  band(0, HAIR_Y0, HAIR_LEFT_X, HAIR_MID, hairRoot);
  band(0, HAIR_MID, HAIR_LEFT_X, HAIR_Y1, hairTip);
  band(HAIR_RIGHT_X, HAIR_Y0, 1, HAIR_MID, hairRoot);
  band(HAIR_RIGHT_X, HAIR_MID, 1, HAIR_Y1, hairTip);
  // Tà váy: thân váy lay nhẹ, gấu váy trễ pha hơn
  band(0, SKIRT_Y0, 1, SKIRT_HEM, sway(t, 1.7, -1.6));
  band(0, SKIRT_HEM, 1, SKIRT_Y1, sway(t, 1.7, -2.4));

  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(swayCanvas, 0, 0, cw, drawH, Math.round(x) - SWAY_PAD, Math.round(y), cw, drawH);
  ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * Bóng ma dưới chân Miên: lõi tối dẹt + quầng tím mộng mị.
 * float càng âm (bay càng cao) → bóng càng nhỏ & nhạt.
 */
export function drawHoloShadow(ctx: CanvasRenderingContext2D, cx: number, floorY: number, float: number, t: number) {
  const lift = (3 - float) / 6; // 0 = thấp nhất, 1 = cao nhất
  const rx = 15 - lift * 4;
  const ry = 3.2 - lift * 0.8;
  ctx.save();
  // Quầng sáng tím loang trên sàn
  const pulse = 1 + Math.sin(t * 2.4) * 0.08;
  const glowR = rx * 2 * pulse;
  ctx.translate(cx, floorY);
  ctx.scale(1, 0.32);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, glowR);
  g.addColorStop(0, 'rgba(219, 39, 119, 0.25)');
  g.addColorStop(0.55, 'rgba(219, 39, 119, 0.12)');
  g.addColorStop(1, 'rgba(219, 39, 119, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Lõi bóng dẹt
  ctx.fillStyle = `rgba(59, 7, 100, ${0.32 - lift * 0.1})`;
  ctx.beginPath();
  ctx.ellipse(cx, floorY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const DUST_COLORS = ['#fbcfe8', '#e9d5ff', '#ffffff', '#f472b6', '#c4b5fd'];

/**
 * Bụi sáng pixel bay vòng quanh Miên. Gọi 2 lần: layer 'back' trước khi vẽ sprite,
 * 'front' sau khi vẽ → hạt bay vòng ra sau lưng rồi vòng lên trước người.
 */
export function drawHoloDust(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  t: number,
  layer: 'back' | 'front',
  count = 12,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const speed = 0.5 + hash(i) * 0.7;
    const a = t * speed + i * 2.39;
    const depth = Math.sin(a);
    if ((depth < 0) !== (layer === 'back')) continue;
    const rx = w * 0.5 + hash(i + 7) * 12;
    const span = h * 1.05;
    const rise = (t * (7 + hash(i + 3) * 9) + i * 17) % span;
    const x = cx + Math.cos(a) * rx;
    const y = cy + h * 0.42 - rise;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 3.1 + i * 1.3));
    const fade = rise < 6 ? rise / 6 : 1 - (rise - 6) / (span - 6);
    ctx.globalAlpha = Math.max(0, twinkle * fade * (depth < 0 ? 0.55 : 0.95));
    ctx.fillStyle = DUST_COLORS[i % DUST_COLORS.length];
    const size = depth > 0.55 ? 2 : 1;
    const ix = Math.round(x);
    const iy = Math.round(y);
    ctx.fillRect(ix, iy, size, size);
    // Một vài hạt lấp lánh hình chữ thập
    if (layer === 'front' && i % 4 === 0 && twinkle > 0.92) {
      ctx.fillRect(ix - 1, iy, 1, 1);
      ctx.fillRect(ix + size, iy, 1, 1);
      ctx.fillRect(ix, iy - 1, 1, 1);
      ctx.fillRect(ix, iy + size, 1, 1);
    }
  }
  ctx.restore();
}
