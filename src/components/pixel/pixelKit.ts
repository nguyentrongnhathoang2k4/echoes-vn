// =====================================================================
// PIXEL KIT DÙNG CHUNG — Màn 1 (Phòng trọ #314) & Màn 3 (Pixel Bleed)
// Mọi chi tiết "phòng trọ" (sàn gỗ, giấy dán tường, poster, lịch 17/05)
// được vẽ từ cùng một nguồn để người chơi nhận ra ngay đó là MỘT căn phòng.
// =====================================================================

import { tx } from '../../locales/tx';

export interface RoomRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Bảng màu phòng trọ
export const DORM_PAL = {
  outline: '#0b0710',
  woodGap: '#1f120a',
  woodA: '#5b3a22',
  woodB: '#4e311c',
  woodC: '#67432a',
  woodHi: '#7d5534',
  wallDorm: '#4a3a2b',
  wallDormStripe: '#544231',
  baseboard: '#2e1d10',
  baseboardHi: '#5b3a22',
  sideWall: '#1b130c',
  sideWallEdge: '#3a2716',
  metal: '#8f9aa6',
  metalDark: '#56606b',
  metalHi: '#cfd6dd',
} as const;

/** Hàm băm giả ngẫu nhiên tất định (chi tiết tĩnh giống hệt nhau mỗi lần dựng) */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Tô một khối pixel (làm tròn toạ độ để giữ nét pixel art) */
export const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** Khối có viền outline tối + highlight cạnh trên/trái + bóng cạnh dưới/phải */
export const block = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, hi: string, shade: string, outline: string = DORM_PAL.outline,
) => {
  px(ctx, x - 1, y - 1, w + 2, h + 2, outline);
  px(ctx, x, y, w, h, fill);
  px(ctx, x, y, w, 1, hi);
  px(ctx, x, y, 1, h, hi);
  px(ctx, x, y + h - 1, w, 1, shade);
  px(ctx, x + w - 1, y, 1, h, shade);
};

/** Bóng đổ elip mềm dưới chân vật thể */
export const dropShadow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha = 0.45) => {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

/** Chữ pixel có viền đen để đọc rõ trên nền tối */
export const outlinedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = '#000') => {
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
};

/** Sàn gỗ phòng trọ: ván so le, khe tối, đinh và vân gỗ (vùng x0..x1, y0..y1) */
export function drawWoodFloor(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const plankH = 12;
  let row = 0;
  for (let y = y0; y < y1; y += plankH, row++) {
    let x = x0 - Math.floor(hash(row) * 60);
    let n = 0;
    while (x < x1) {
      const len = 48 + Math.floor(hash(row * 31 + n) * 56);
      const tone = hash(row * 7 + n * 13);
      const base = tone < 0.33 ? DORM_PAL.woodA : tone < 0.66 ? DORM_PAL.woodB : DORM_PAL.woodC;
      px(ctx, x, y, len, plankH, DORM_PAL.woodGap);
      px(ctx, x + 1, y + 1, len - 2, plankH - 2, base);
      px(ctx, x + 1, y + 1, len - 2, 1, DORM_PAL.woodHi);            // Mép sáng
      // Vân gỗ
      const gy = y + 4 + Math.floor(hash(n + row) * 4);
      px(ctx, x + 6, gy, Math.max(4, len * 0.4), 1, 'rgba(30,16,8,0.45)');
      px(ctx, x + len * 0.55, gy + 2, Math.max(3, len * 0.25), 1, 'rgba(30,16,8,0.35)');
      // Đinh
      px(ctx, x + 3, y + 5, 1, 1, '#1a0f08');
      px(ctx, x + len - 4, y + 5, 1, 1, '#1a0f08');
      x += len;
      n++;
    }
  }
}

/** Tường phòng trọ: giấy dán tường sọc bong tróc, ẩm mốc, chân tường gỗ, tường bao */
export function drawDormWalls(ctx: CanvasRenderingContext2D, room: RoomRect, width: number, height: number) {
  px(ctx, 0, 0, width, room.top, DORM_PAL.wallDorm);
  for (let x = 0; x < width; x += 10) px(ctx, x, 8, 4, room.top - 16, DORM_PAL.wallDormStripe);
  for (let i = 0; i < 9; i++) {
    const bx = room.left + hash(i * 5) * 260;
    const by = 14 + hash(i * 9) * 50;
    px(ctx, bx, by, 6 + hash(i) * 10, 4 + hash(i + 2) * 6, '#3a2c20'); // Mảng bong
  }
  // Vệt ẩm mốc loang
  ctx.fillStyle = 'rgba(30,40,20,0.35)';
  ctx.beginPath();
  ctx.ellipse(95, 20, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chân tường gỗ
  px(ctx, 0, room.top - 8, width, 8, DORM_PAL.baseboard);
  px(ctx, 0, room.top - 8, width, 1, DORM_PAL.baseboardHi);
  // Tường bao trái/phải/dưới
  px(ctx, 0, 0, room.left, height, DORM_PAL.sideWall);
  px(ctx, room.right, 0, width - room.right, height, DORM_PAL.sideWall);
  px(ctx, 0, room.bottom, width, height - room.bottom, DORM_PAL.sideWall);
  px(ctx, room.left - 3, room.top - 8, 3, room.bottom - room.top + 8, DORM_PAL.sideWallEdge);
  px(ctx, room.right, room.top - 8, 3, room.bottom - room.top + 8, DORM_PAL.sideWallEdge);
  px(ctx, room.left - 3, room.bottom, room.right - room.left + 6, 3, DORM_PAL.sideWallEdge);
  // Dải trần tối phía trên cùng
  px(ctx, 0, 0, width, 4, '#050307');
}

/** Lịch treo tường tháng 5, ngày 17 khoanh đỏ (28x32) */
export function drawCalendar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  block(ctx, x, y, 28, 32, '#e8e0cc', '#fff8e6', '#b8ae96');
  px(ctx, x, y, 28, 7, '#b91c1c');
  ctx.font = '6px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText('THG 5', x + 3, y + 6);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) px(ctx, x + 3 + c * 5, y + 11 + r * 5, 3, 3, '#8a8170');
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 11.5, y + 20.5, 6, 6);
}

/** Poster "PHỐ CŨ MÙA HẠ" phai màu, rách góc, dán băng keo (38x50) */
export function drawPoster(ctx: CanvasRenderingContext2D, x: number, y: number, wallColor: string = DORM_PAL.wallDorm) {
  block(ctx, x, y, 38, 50, '#2c3e63', '#3d5385', '#1e2b45');
  px(ctx, x + 3, y + 4, 32, 24, '#c96b3c');                    // Mặt trời hoàng hôn
  px(ctx, x + 3, y + 20, 32, 8, '#7a3b52');
  px(ctx, x + 12, y + 10, 14, 10, '#f2b15b');
  px(ctx, x + 3, y + 28, 32, 2, '#111');
  ctx.font = 'bold 6px monospace';
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(tx('PHỐ CŨ'), x + 6, y + 37);
  ctx.fillText(tx('MÙA HẠ'), x + 6, y + 45);
  ctx.fillStyle = wallColor;                                    // Góc rách
  ctx.beginPath();
  ctx.moveTo(x + 38, y + 50); ctx.lineTo(x + 26, y + 50); ctx.lineTo(x + 38, y + 38); ctx.closePath();
  ctx.fill();
  px(ctx, x - 2, y - 2, 7, 3, 'rgba(240,230,200,0.7)');        // Băng keo
  px(ctx, x + 33, y - 2, 7, 3, 'rgba(240,230,200,0.7)');
}

/** Lớp scanline + vignette dựng sẵn (một lần drawImage thay vì hàng trăm fillRect/frame) */
export function buildPostLayer(width: number, height: number, vignette = 0.6, innerRadius = 180): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
  // vignette = 0: bỏ viền tối tĩnh (stage dùng drawFollowVignette bám theo An)
  if (vignette > 0) {
    const vg = ctx.createRadialGradient(width / 2, height / 2, innerRadius, width / 2, height / 2, 420);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, width, height);
  }
  return c;
}

// =====================================================================
// VIGNETTE ĐỘNG BÁM THEO BƯỚC CHÂN AN
// Tâm vùng sáng trôi trễ phía sau An; mỗi bước chân chạm sàn vùng sáng co nhẹ
// rồi nở ra; Sanity càng thấp vùng sáng càng hẹp, viền càng đặc và rung.
// =====================================================================

export interface FollowLight {
  x: number;
  y: number;
  /** 1 ngay lúc chân chạm sàn, tắt dần về 0 */
  pulse: number;
  ready: boolean;
}

export const createFollowLight = (): FollowLight => ({ x: 0, y: 0, pulse: 0, ready: false });

/** Kéo tâm vùng sáng về phía (tx, ty) với độ trễ; k = hệ số chuẩn hoá 60 FPS */
export function updateFollowLight(fl: FollowLight, tx: number, ty: number, k: number) {
  if (!fl.ready) {
    fl.x = tx;
    fl.y = ty;
    fl.ready = true;
  }
  const a = 1 - Math.pow(1 - 0.09, k);
  fl.x += (tx - fl.x) * a;
  fl.y += (ty - fl.y) * a;
  fl.pulse *= Math.pow(0.86, k);
}

export interface VignetteStyle {
  /** Màu viền tối (r, g, b) */
  tint: readonly [number, number, number];
  /** Độ đặc ở mép khi Sanity 100 (0..1) */
  strength: number;
  /** Bán kính vùng sáng trọn vẹn khi Sanity 100 */
  inner: number;
  /** Bán kính bắt đầu tối hẳn khi Sanity 100 */
  outer: number;
}

export function drawFollowVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fl: FollowLight,
  sanity: number,
  t: number,
  style: VignetteStyle,
) {
  const insanity = Math.max(0, Math.min(1, 1 - sanity / 100));
  // Thở chậm khi đứng yên + co lại theo nhịp bước
  const inner = Math.max(12, style.inner * (1 - 0.4 * insanity) - fl.pulse * 7 + Math.sin(t * 1.3) * 2);
  const outer = Math.max(inner + 50, style.outer * (1 - 0.25 * insanity) - fl.pulse * 4);
  // Sanity dưới 40%: tâm vùng sáng run rẩy
  const shake = insanity > 0.6 ? (insanity - 0.6) * 10 : 0;
  const cx = fl.x + (Math.random() - 0.5) * shake;
  const cy = fl.y + (Math.random() - 0.5) * shake;
  const edge = Math.min(0.96, style.strength + 0.25 * insanity);
  const [r, g, b] = style.tint;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},${edge * 0.45})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},${edge})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/** Khung ngắm 4 góc + mũi tên pixel nhấp nhô phía trên vật thể đang nhắm tới */
export function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  color: string,
  t: number,
) {
  const pad = 3;
  const x0 = rect.x - pad;
  const y0 = rect.y - pad;
  const x1 = rect.x + rect.w + pad;
  const y1 = rect.y + rect.h + pad;
  const c = 5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0);
  ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + c);
  ctx.moveTo(x1, y1 - c); ctx.lineTo(x1, y1); ctx.lineTo(x1 - c, y1);
  ctx.moveTo(x0 + c, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - c);
  ctx.stroke();
  const ax = Math.round(rect.x + rect.w / 2);
  const ay = Math.round(Math.max(8, rect.y - 10 + Math.sin(t * 6) * 2));
  px(ctx, ax - 3, ay, 7, 1, color);
  px(ctx, ax - 2, ay + 1, 5, 1, color);
  px(ctx, ax - 1, ay + 2, 3, 1, color);
  px(ctx, ax, ay + 3, 1, 1, color);
}

/** Phông chữ cụm chỉ số góc trên trái (đủ lớn để đọc rõ khi canvas bị thu nhỏ) */
export const HUD_FONT = {
  clock: 'bold 14px monospace',
  label: 'bold 11px monospace',
  sub: 'bold 10px monospace',
} as const;

/** Đồng hồ góc trên trái "03:14 AM" với dấu hai chấm nhấp nháy */
export function drawClock(ctx: CanvasRenderingContext2D, t: number, x = 10, y = 20, color = '#f87171') {
  ctx.font = HUD_FONT.clock;
  outlinedText(ctx, Math.sin(t * 3.14) > 0 ? '03:14 AM' : '03 14 AM', x, y, color);
}

/** Dòng trạng thái nhỏ ngay dưới cụm chỉ số (Phase, điện áp, cấp độ xâm thực...) */
export function drawHudSubtitle(ctx: CanvasRenderingContext2D, text: string, color: string, y = 54) {
  ctx.font = HUD_FONT.sub;
  outlinedText(ctx, text, 10, y, color);
}

/**
 * Cụm chỉ số góc trên trái (dùng chung Màn 1, Màn 2 & Hành lang):
 * đồng hồ 03:14 AM + trái tim đập theo nhịp (càng mất tỉnh táo càng nhanh) + thanh SANITY
 */
export interface VitalsTheme {
  clock: string;   // Màu chữ đồng hồ
  heart: string;   // Màu tim khi tỉnh táo
  label: string;   // Màu chữ "SANITY"
  bar: string;     // Màu thanh khi tỉnh táo
}

export function drawVitals(ctx: CanvasRenderingContext2D, t: number, sanity: number, theme?: Partial<VitalsTheme>) {
  drawClock(ctx, t, 10, 20, theme?.clock ?? '#f87171');
  const bpm = 60 + (100 - sanity) * 0.8;
  const pulse = ((t * bpm) / 60) % 1 < 0.12 ? 1 : 0;
  const heart = sanity <= 35 ? '#ef4444' : theme?.heart ?? '#fb7185';
  // Trái tim pixel 7x6 phóng 2x (14x12), phình ra 1 ô mỗi nhịp đập
  const S = 2;
  const hx = 10;
  const hy = 27;
  const cell = (cx: number, cy: number, w: number, h: number) => px(ctx, hx + cx * S, hy + cy * S, w * S, h * S, heart);
  ctx.fillStyle = '#000';
  ctx.fillRect(hx - 1 - pulse * S, hy - 1, 7 * S + 2 + pulse * S * 2, 6 * S + 2);
  cell(1 - pulse, 0, 2 + pulse, 1);
  cell(4, 0, 2 + pulse, 1);
  cell(-pulse, 1, 7 + pulse * 2, 2);
  cell(1, 3, 5, 1);
  cell(2, 4, 3, 1);
  cell(3, 5, 1, 1);
  px(ctx, hx + 2, hy + 2, 2, 2, 'rgba(255,255,255,0.6)');
  ctx.font = HUD_FONT.label;
  outlinedText(ctx, 'SANITY', 30, 38, theme?.label ?? '#fdba74');
  const barX = 78;
  const barW = 60;
  px(ctx, barX - 1, 28, barW + 2, 11, '#000');
  px(ctx, barX, 29, barW, 9, '#27150a');
  const fill = Math.max(0, Math.min(1, sanity / 100));
  px(ctx, barX, 29, barW * fill, 9, sanity <= 35 ? '#ef4444' : sanity <= 65 ? '#f59e0b' : theme?.bar ?? '#fb923c');
  px(ctx, barX, 29, barW * fill, 2, 'rgba(255,255,255,0.35)');
  outlinedText(ctx, `${Math.round(sanity)}`, barX + barW + 5, 38, '#fed7aa');
}
