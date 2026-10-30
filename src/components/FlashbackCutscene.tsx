'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px, hash } from './pixel/pixelKit';
import { drawSpriteFrame } from './pixel/spriteKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { tx } from '../locales/tx';

// =====================================================================
// HỒI TƯỞNG: MỘT CHIỀU HÈ Ở BẾN AN YÊN (trước đêm 17/05)
// Nắng mật ong, bụi nắng bokeh, chuông gió, xe đạp lọc cọc — không scanline, không nhiễu.
// 1. Xe đạp chở hai người men theo bờ sông   2. Cận mặt An
// 3. Miên tựa cằm lên vai An, lời hứa         4. TÁCH! — ảnh Polaroid
// 5. Phanh rít + sấm → sắc sai 0.3s → vụt tắt về Bến An Yên tím thẫm trong máy chủ.
// Space / Enter / Click: qua câu (đang gõ thì hiện hết câu) • Esc: bỏ qua cả đoạn.
// =====================================================================

const W = 640;
const H = 360;
const ZOOM = 1.5;                       // Phóng to bến 800x500 cho xe đạp rõ người
const CAM_W = W / ZOOM;
const CAM_H = H / ZOOM;
const CAM_Y = 92;
const CAM_X_MAX = 270;                  // Không lia tới chiếc xe đạp dựng sẵn ở mép phải bến
const RIDE_FROM = 250;                  // Mép phải ô dù + bàn ghế quán cà phê (x ≈ 0–200 trên bến)
const RIDE_TO = 560;                    // Chân dốc cầu, còn cách xe đạp dựng sẵn ở mép phải
const GROUND_Y = 268;                   // Mặt đường xe chạy (toạ độ bến)
const SPRITE_W = 42;
const SPRITE_H = 63;
const ROW_SIDE = 2;                     // Hàng nhìn sang phải
const PHOTO = { w: 300, h: 225 };
const GLITCH_DUR = 0.3;

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

type Scene = 'ride' | 'an' | 'lean' | 'photo' | 'snap';
interface Step {
  scene: Scene;
  speaker?: 'Miên' | 'An';
  text?: string;
  /** Bước không có thoại: tự chuyển sau N giây */
  auto?: number;
  title?: boolean;
}

const STEPS: Step[] = [
  { scene: 'ride', auto: 3.2, title: true },
  { scene: 'ride', speaker: 'Miên', text: 'An ơi, đi chậm thôi! Gió chiều nay mát quá này!' },
  { scene: 'an', speaker: 'An', text: 'Em ngồi chắc đấy, chuẩn bị qua dốc cầu rồi nhé.' },
  { scene: 'lean', speaker: 'Miên', text: 'Sau này dù có bận đến mấy, mỗi tuần anh vẫn phải chở em ra bến sông ngắm hoàng hôn đấy nhé. Hứa chưa?' },
  { scene: 'lean', speaker: 'An', text: 'Ừ, anh hứa. Anh sẽ không bao giờ thất hứa với Miên đâu.' },
  { scene: 'photo', auto: 4.6 },
  { scene: 'snap', auto: 2.4 },
];
const SNAP_STEP = STEPS.length - 1;

const TYPE_MS = 30;
const holdFor = (text: string) => 1500 + text.length * 20;   // Gõ xong thì đợi rồi tự qua câu

// =====================================================================
// ÂM THANH (Web Audio tổng hợp): gió nhẹ, chuông gió, xe đạp, tiếng cười, máy ảnh, phanh + sấm
// =====================================================================
interface FlashbackAudio {
  bell: () => void;
  laugh: () => void;
  shutter: () => void;
  snap: () => void;
  close: () => void;
}

function createFlashbackAudio(volume: number): FlashbackAudio | null {
  let ctx: AudioContext;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {}); // Bị đóng trước khi resume xong (unmount sớm) thì bỏ qua
  const now = () => ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = (volume / 100) * 0.9;
  master.connect(ctx.destination);
  // Mọi âm thanh ấm áp đi qua bus này để cắt phụt một lần khi giật về thực tại
  const warm = ctx.createGain();
  warm.gain.setValueAtTime(0, now());
  warm.gain.linearRampToValueAtTime(1, now() + 1.2);
  warm.connect(master);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = (type: BiquadFilterType, freq: number, q: number, out: AudioNode) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out);
    return { src, f, g };
  };
  const tone = (type: OscillatorType, freq: number, when: number, dur: number, peak: number, out: AudioNode, attack = 0.005) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
    return o;
  };

  // Gió chiều lộng nhẹ
  const wind = noise('lowpass', 480, 0.5, warm);
  wind.g.gain.value = 0.03;
  wind.src.start();

  const timers: ReturnType<typeof setTimeout>[] = [];
  let alive = true;

  // Chuông gió: nốt ngũ cung cao, ngân dài, rơi thưa thớt ngẫu nhiên
  const CHIME = [1318.5, 1568, 1760, 2093, 2349.3, 2637];
  const chime = () => {
    if (!alive) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const when = now() + i * (0.08 + Math.random() * 0.1);
      const f = CHIME[Math.floor(Math.random() * CHIME.length)];
      tone('sine', f, when, 2.6, 0.018, warm);
      tone('sine', f * 2.76, when, 0.9, 0.005, warm);          // Bội âm lệch của ống kim loại
    }
    timers.push(setTimeout(chime, 700 + Math.random() * 1500));
  };
  timers.push(setTimeout(chime, 400));

  // Xe đạp lọc cọc: tiếng xích lách cách + tiếng gióng xe cọc cạch khi xóc nhẹ
  let tick = 0;
  const clatter = setInterval(() => {
    if (!alive) return;
    const when = now() + 0.01;
    const click = ctx.createBufferSource();
    click.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 + Math.random() * 900;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.022 + Math.random() * 0.012, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
    click.connect(bp).connect(g).connect(warm);
    click.start(when, Math.random() * 1.5, 0.04);
    if (tick % 5 === 0) tone('triangle', 380 + Math.random() * 60, when, 0.07, 0.025, warm);
    tick++;
  }, 150);

  return {
    // "Kính coong": chuông xe đạp rung nhanh, hai hồi
    bell: () => {
      [0, 0.32].forEach((d) => {
        const when = now() + d;
        const o = tone('sine', 2650, when, 0.55, 0.05, warm);
        const trem = ctx.createOscillator();
        trem.frequency.value = 32;
        const tg = ctx.createGain();
        tg.gain.value = 600;
        trem.connect(tg).connect(o.frequency);
        trem.start(when);
        trem.stop(when + 0.6);
        tone('sine', 3975, when, 0.4, 0.015, warm);
      });
    },
    // Tiếng cười khúc khích: vài nhịp hơi thở có formant, nhỏ dần
    laugh: () => {
      for (let i = 0; i < 4; i++) {
        const when = now() + 0.05 + i * 0.16;
        const amp = 0.05 * (1 - i * 0.18);
        const breath = ctx.createBufferSource();
        breath.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1150 - i * 40;
        f.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 0.11);
        breath.connect(f).connect(g).connect(warm);
        breath.start(when, Math.random(), 0.14);
        const v = tone('sine', 540 - i * 22, when, 0.1, amp * 0.5, warm, 0.015);
        v.frequency.linearRampToValueAtTime(470 - i * 22, when + 0.1);
      }
    },
    // TÁCH! — màn trập kép, rồi mô-tơ Polaroid đẩy ảnh ra rè rè
    shutter: () => {
      const when = now() + 0.01;
      [0, 0.055].forEach((d, i) => {
        const c = ctx.createBufferSource();
        c.buffer = noiseBuf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = i ? 2200 : 3200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(i ? 0.18 : 0.3, when + d);
        g.gain.exponentialRampToValueAtTime(0.0001, when + d + 0.035);
        c.connect(hp).connect(g).connect(warm);
        c.start(when + d, Math.random(), 0.05);
      });
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 92;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(0, when + 0.25);
      mg.gain.linearRampToValueAtTime(0.028, when + 0.3);
      mg.gain.setValueAtTime(0.028, when + 1.05);
      mg.gain.linearRampToValueAtTime(0, when + 1.15);
      motor.connect(lp).connect(mg).connect(warm);
      motor.start(when + 0.25);
      motor.stop(when + 1.2);
    },
    // Phanh rít chói tai + sấm đanh gọn → mọi thứ ấm áp tắt phụt, chỉ còn tiếng ù tím thẫm
    snap: () => {
      const when = now() + 0.01;
      alive = false;
      clearInterval(clatter);
      warm.gain.cancelScheduledValues(when);
      warm.gain.setValueAtTime(warm.gain.value, when);
      warm.gain.linearRampToValueAtTime(0, when + 0.04);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3000;
      bp.Q.value = 3;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.13, when);
      sg.gain.exponentialRampToValueAtTime(0.0001, when + 0.75);
      bp.connect(sg).connect(master);
      const vib = ctx.createOscillator();
      vib.frequency.value = 11;
      const vg = ctx.createGain();
      vg.gain.value = 70;
      vib.connect(vg);
      vib.start(when);
      vib.stop(when + 0.8);
      [2850, 3130].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, when);
        o.frequency.exponentialRampToValueAtTime(f * 0.72, when + 0.75);
        vg.connect(o.frequency);
        o.connect(bp);
        o.start(when);
        o.stop(when + 0.8);
      });

      const crack = noise('lowpass', 3200, 0.7, master);
      crack.g.gain.setValueAtTime(0.5, when);
      crack.g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      crack.src.start(when);
      crack.src.stop(when + 0.25);
      const rumble = noise('lowpass', 110, 0.9, master);
      rumble.g.gain.setValueAtTime(0.4, when + 0.02);
      rumble.g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
      rumble.src.start(when);
      rumble.src.stop(when + 2.5);

      // Tiếng ù của máy chủ: hai sine trầm lệch nhịp
      [55, 58.5].forEach((f) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when + 0.3);
        g.gain.linearRampToValueAtTime(0.05, when + 0.6);
        o.connect(g).connect(master);
        o.start(when + 0.3);
      });
    },
    close: () => {
      alive = false;
      clearInterval(clatter);
      timers.forEach(clearTimeout);
      void ctx.close();
    },
  };
}

// =====================================================================
// VẼ PIXEL
// =====================================================================

/** Đường thẳng pixel (vẽ từng ô vuông, không khử răng cưa) */
function pxLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, size = 1) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    px(ctx, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), size, size, color);
  }
}

function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number) {
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * Math.PI) / 3;
    pxLine(ctx, cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r, '#d6d3d1');
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    px(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2, '#1c1917');
  }
  px(ctx, cx - 1, cy - 1, 2, 2, '#a8a29e');
}

/**
 * Xe đạp chở hai người: An đạp xe, Miên ngồi sau tựa vào lưng anh.
 * x = tâm xe, gy = mặt đường (toạ độ khung hình), angle = góc quay bánh.
 */
function drawRiders(
  ctx: CanvasRenderingContext2D,
  an: HTMLImageElement,
  mien: HTMLImageElement,
  x: number,
  gy: number,
  angle: number,
  t: number,
) {
  const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
  const bump = hash(Math.floor(angle * 2)) > 0.82 ? 1 : 0;      // Xóc nhẹ trên mặt đường lát gạch
  const y = gy - bump;
  const R = 9;
  const rear = { x: x - 17, y: y - R };
  const front = { x: x + 17, y: y - R };
  const seat = { x: x - 5, y: y - 25 };
  const crank = { x: x - 1, y: y - R };
  const bar = { x: x + 13, y: y - 28 };

  // Bóng xe
  ctx.fillStyle = 'rgba(80,40,10,0.25)';
  ctx.fillRect(x - 28, gy - 1, 56, 3);

  // Miên ngồi sau (vẽ trước để An che một phần), hơi nghiêng tựa vào lưng anh
  if (ready(mien)) {
    const mx = x - 24 - SPRITE_W / 2;
    const my = seat.y - 38 + 3 + Math.round(Math.sin(t * 2) * 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx - 4, my - 4, SPRITE_W + 8, seat.y + 4 - my);
    ctx.clip();
    drawSpriteFrame(ctx, mien, 1, ROW_SIDE, false, mx + 2, my, SPRITE_W, SPRITE_H);
    ctx.restore();
    // Hai chân ngồi nghiêng một bên, đung đưa theo nhịp xe
    const swing = Math.round(Math.sin(t * 3) * 1);
    pxLine(ctx, x - 21, seat.y + 2, x - 18 + swing, y - 6, '#f1c9a5', 2);
    pxLine(ctx, x - 25, seat.y + 2, x - 23 + swing, y - 5, '#f1c9a5', 2);
    px(ctx, x - 19 + swing, y - 6, 3, 2, '#f5f5f4');
    px(ctx, x - 24 + swing, y - 5, 3, 2, '#f5f5f4');
  }

  // Khung xe xanh rêu kiểu cũ, gác-ba-ga sau, giỏ mây phía trước có hoa
  const frame = '#2f6f5e';
  pxLine(ctx, rear.x, rear.y, seat.x, seat.y, frame, 2);
  pxLine(ctx, seat.x, seat.y, crank.x, crank.y, frame, 2);
  pxLine(ctx, crank.x, crank.y, rear.x, rear.y, frame, 2);
  pxLine(ctx, seat.x, seat.y + 2, bar.x - 1, bar.y + 4, frame, 2);
  pxLine(ctx, crank.x, crank.y, bar.x - 1, bar.y + 5, frame, 2);
  pxLine(ctx, bar.x, bar.y, front.x, front.y, '#9ca3af', 2);
  pxLine(ctx, rear.x - 4, seat.y + 4, seat.x - 1, seat.y + 4, '#57534e', 2);   // Gác-ba-ga
  px(ctx, seat.x - 4, seat.y - 2, 9, 3, '#3f2a1d');                            // Yên xe
  pxLine(ctx, bar.x - 3, bar.y - 1, bar.x + 4, bar.y - 2, '#44403c', 2);     // Ghi-đông
  px(ctx, bar.x + 3, bar.y + 1, 11, 8, '#a16207');                            // Giỏ mây
  px(ctx, bar.x + 3, bar.y + 3, 11, 1, '#854d0e');
  px(ctx, bar.x + 3, bar.y + 6, 11, 1, '#854d0e');
  px(ctx, bar.x + 5, bar.y - 1, 2, 2, '#f9a8d4');
  px(ctx, bar.x + 8, bar.y - 2, 2, 2, '#fde68a');
  px(ctx, bar.x + 11, bar.y - 1, 2, 2, '#f9a8d4');
  px(ctx, bar.x + 7, bar.y, 5, 1, '#65a30d');

  drawWheel(ctx, rear.x, rear.y, R, angle);
  drawWheel(ctx, front.x, front.y, R, angle);

  // An: nửa người trên trên yên, hai chân đạp theo vòng quay của bàn đạp
  if (ready(an)) {
    const ax = seat.x + 2 - SPRITE_W / 2;
    const ay = seat.y - 38;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax - 4, ay - 4, SPRITE_W + 8, seat.y + 2 - ay);
    ctx.clip();
    drawSpriteFrame(ctx, an, 1, ROW_SIDE, false, ax, ay, SPRITE_W, SPRITE_H);
    ctx.restore();
  }
  for (const phase of [0, Math.PI]) {
    const a = angle * 0.7 + phase;
    const pdx = crank.x + Math.cos(a) * 5;
    const pdy = crank.y + Math.sin(a) * 5;
    const knee = { x: (seat.x + pdx) / 2 + 5, y: (seat.y + pdy) / 2 - 2 };
    pxLine(ctx, seat.x, seat.y, knee.x, knee.y, '#27272a', 2);
    pxLine(ctx, knee.x, knee.y, pdx, pdy, '#27272a', 2);
    px(ctx, pdx - 1, pdy, 4, 2, '#e7e5e4');
  }
}

/** Nắng mật ong: kéo cả cảnh về tông vàng ấm, ráng sáng từ phía mặt trời, viền nâu */
function gradeHoney(ctx: CanvasRenderingContext2D, sunX: number, sunY: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = 'rgba(232,160,72,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,214,140,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'screen';
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 380);
  sun.addColorStop(0, 'rgba(255,236,190,0.55)');
  sun.addColorStop(0.4, 'rgba(255,200,120,0.18)');
  sun.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 420);
  vig.addColorStop(0, 'rgba(60,30,8,0)');
  vig.addColorStop(1, 'rgba(60,30,8,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Lớp nắng mỏng cho ảnh chụp: ấm lên, hơi phai như ảnh in liền */
function gradeHoneyOn(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,200,120,0.5)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(60,40,20,0.18)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

interface Bokeh { x: number; y: number; r: number; vx: number; vy: number; phase: number; hue: number }

const makeBokeh = (): Bokeh[] =>
  Array.from({ length: 28 }, (_, i) => ({
    x: hash(i * 3 + 1) * W,
    y: hash(i * 7 + 2) * H,
    r: 4 + hash(i * 11 + 3) * 16,
    vx: (hash(i * 13 + 4) - 0.3) * 6,
    vy: -3 - hash(i * 17 + 5) * 7,
    phase: hash(i * 19 + 6) * Math.PI * 2,
    hue: hash(i * 23 + 7),
  }));

/** Bụi nắng: đốm sáng tròn mờ trôi lên chậm, lấp lánh */
function drawBokeh(ctx: CanvasRenderingContext2D, list: Bokeh[], dt: number, t: number, alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of list) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y < -b.r) { b.y = H + b.r; b.x = Math.random() * W; }
    if (b.x > W + b.r) b.x = -b.r;
    if (b.x < -b.r) b.x = W + b.r;
    const a = alpha * (0.18 + 0.14 * Math.sin(t * 1.3 + b.phase));
    const col = b.hue < 0.6 ? '255,214,140' : b.hue < 0.85 ? '255,240,215' : '253,186,170';
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.6, `rgba(${col},${a * 0.6})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  ctx.restore();
}

// =====================================================================
// COMPONENT
// =====================================================================

interface FlashbackCutsceneProps {
  onComplete: () => void;
  volume?: number;
}

export const FlashbackCutscene: React.FC<FlashbackCutsceneProps> = ({ onComplete, volume = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const stepRef = useRef(0);
  const stepStartRef = useRef(0);
  const doneRef = useRef(false);
  const audioRef = useRef<FlashbackAudio | null>(null);
  const volumeRef = useRef(volume);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cur = STEPS[step];
  const fullText = cur.text ? tx(cur.text) : '';
  const typing = !!cur.text && typed < fullText.length;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  const goTo = useCallback((next: number) => {
    if (next >= STEPS.length) {
      finish();
      return;
    }
    stepRef.current = next;
    stepStartRef.current = performance.now();
    setTyped(0);
    setStep(next);
  }, [finish]);

  /** Space / Enter / Click: đang gõ thì hiện hết câu, gõ xong thì sang câu tiếp */
  const advance = useCallback(() => {
    if (stepRef.current === SNAP_STEP) return;            // Cú giật về thực tại không cắt ngang được
    if (typing) {
      setTyped(fullText.length);
      return;
    }
    goTo(stepRef.current + 1);
  }, [typing, fullText, goTo]);

  // Âm thanh sống suốt đoạn hồi tưởng
  useEffect(() => {
    stepStartRef.current = performance.now();
    audioRef.current = createFlashbackAudio(volumeRef.current);
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  // Hiệu ứng âm thanh theo từng lát cắt
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (step === 1) { a.bell(); a.laugh(); }
    if (step === 3) a.laugh();
    if (STEPS[step].scene === 'photo') a.shutter();
    if (step === SNAP_STEP) a.snap();
  }, [step]);

  // Máy chữ
  useEffect(() => {
    if (!typing) return;
    const id = setInterval(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearInterval(id);
  }, [typing]);

  // Tự chuyển: bước không thoại theo thời lượng, bước có thoại sau khi gõ xong một lúc
  useEffect(() => {
    if (typing) return;
    const ms = cur.auto !== undefined ? cur.auto * 1000 : holdFor(fullText);
    const id = setTimeout(() => goTo(step + 1), ms);
    return () => clearTimeout(id);
  }, [step, typing, cur.auto, fullText, goTo]);

  // Phím điều khiển (bỏ qua phím đang giữ từ màn trước)
  useEffect(() => {
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - opened < 400) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, finish]);

  // ===== Vòng lặp vẽ =====
  useEffect(() => {
    const canvas = canvasRef.current;
    const fx = fxRef.current;
    const ctx = canvas?.getContext('2d');
    const fctx = fx?.getContext('2d');
    if (!ctx || !fctx) return;
    const an = new Image();
    an.src = '/assets/an_spritesheet.png';
    const mien = new Image();
    mien.src = '/assets/mien_spritesheet.png';
    // Chân dung cho ảnh Polaroid: hai người chụp chung, cười rạng rỡ
    const anFace = new Image();
    anFace.src = '/assets/ModelAN/BrightSmileAn.png';
    const mienFace = new Image();
    mienFace.src = '/assets/ModelMIEN/playfulMien.png';

    const mk = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    const world = mk(BEN_AN_YEN.width, BEN_AN_YEN.height);
    const shot = mk(W, H);                 // Khung hình ký ức đã chỉnh màu (dùng lại cho ảnh và cú giật)
    const chan = [mk(W, H), mk(W, H), mk(W, H)];
    const w = world.getContext('2d');
    const s = shot.getContext('2d');
    if (!w || !s) return;
    w.imageSmoothingEnabled = false;
    s.imageSmoothingEnabled = false;

    const bokeh = makeBokeh();
    const begin = performance.now();
    let last = begin;
    let raf = 0;
    let photoTaken = false;
    let sunScreen = { x: W / 2, y: 0 };

    /** Vẽ khung hình ký ức: bến sông nắng vàng + xe đạp đang chạy */
    const renderMemory = (t: number) => {
      drawBenAnYenSunset(w, t, { pigeons: true, bridge: true });
      // Xe xuất phát bên phải quầy cà phê (không đi xuyên ô dù), chậm dần khi tới gần chân dốc cầu, máy quay lia theo
      const wx = RIDE_FROM + (RIDE_TO - RIDE_FROM) * (1 - Math.exp(-t / 12));
      drawRiders(w, an, mien, wx, GROUND_Y, wx / 9, t);
      const camX = Math.max(0, Math.min(CAM_X_MAX, wx - 150));
      s.drawImage(world, camX, CAM_Y, CAM_W, CAM_H, 0, 0, W, H);
      sunScreen = { x: (BEN_AN_YEN.sun.x - camX) * ZOOM, y: (BEN_AN_YEN.sun.y - CAM_Y) * ZOOM };
      gradeHoney(s, sunScreen.x, sunScreen.y);
      // Nắng phủ thêm một lớp mỏng lên người
      s.save();
      s.globalCompositeOperation = 'soft-light';
      s.fillStyle = 'rgba(255,200,120,0.35)';
      s.fillRect(0, 0, W, H);
      s.restore();
    };

    /** Sắc sai cực mạnh: tách kênh đỏ/lục/lam lệch nhau + xé ngang từng dải */
    const drawAberration = (u: number) => {
      const amp = 6 + 14 * (1 - u / GLITCH_DUR);
      const tints = ['#ff0000', '#00ff00', '#0000ff'];
      chan.forEach((c, i) => {
        const g = c.getContext('2d');
        if (!g) return;
        g.globalCompositeOperation = 'source-over';
        g.drawImage(shot, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = tints[i];
        g.fillRect(0, 0, W, H);
      });
      px(ctx, 0, 0, W, H, '#000');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(chan[0], -amp, (Math.random() - 0.5) * 6);
      ctx.drawImage(chan[1], 0, 0);
      ctx.drawImage(chan[2], amp, (Math.random() - 0.5) * 6);
      ctx.restore();
      for (let i = 0; i < 7; i++) {
        const y = Math.floor(Math.random() * H);
        const h = 4 + Math.floor(Math.random() * 22);
        const off = (Math.random() - 0.5) * 80;
        ctx.drawImage(canvas!, 0, y, W, h, off, y, W, h);
      }
      if (Math.random() < 0.35) px(ctx, 0, 0, W, H, Math.random() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)');
    };

    /** Bến An Yên giả lập trong máy chủ: cùng khung cảnh, tím thẫm, vắng người */
    const drawServerHaven = (t: number, u: number) => {
      drawBenAnYenSunset(w, t, { pigeons: false, bridge: true });
      ctx.drawImage(world, CAM_X_MAX, CAM_Y, CAM_W, CAM_H, 0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#4c2a7a';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(18,6,36,0.45)';
      ctx.fillRect(0, 0, W, H);
      // Thỉnh thoảng một vệt nhiễu mảnh chạy qua: nơi này không có thật
      if (hash(Math.floor(t * 9)) > 0.8) px(ctx, 0, Math.floor(hash(Math.floor(t * 9) + 1) * H), W, 1, 'rgba(196,181,253,0.35)');
      ctx.restore();
      // Tắt dần về đen ở cuối
      const out = ease((u - 1.5) / 0.9);
      if (out > 0) px(ctx, 0, 0, W, H, `rgba(0,0,0,${out})`);
    };

    /** Ảnh chụp chung: nền hoàng hôn nhoè sau lưng, Miên nghiêng đầu sát vai An */
    const takePhoto = (pc: CanvasRenderingContext2D) => {
      const sx = Math.max(0, Math.min(W - PHOTO.w, sunScreen.x - PHOTO.w / 2));
      pc.save();
      pc.filter = 'blur(2px)';
      pc.drawImage(shot, sx, 0, PHOTO.w, PHOTO.h, -6, -6, PHOTO.w + 12, PHOTO.h + 12);
      pc.restore();
      const ok = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
      pc.save();
      pc.imageSmoothingEnabled = true;
      pc.filter = 'brightness(1.1) saturate(1.12) sepia(0.15)';
      if (ok(mienFace)) {
        const h = 196;
        const wd = (h * mienFace.naturalWidth) / mienFace.naturalHeight;
        pc.save();
        pc.translate(40 + wd / 2, PHOTO.h - h + 22 + h / 2);
        pc.rotate(-0.1);
        pc.drawImage(mienFace, -wd / 2, -h / 2, wd, h);
        pc.restore();
      }
      if (ok(anFace)) {
        const h = 206;
        const wd = (h * anFace.naturalWidth) / anFace.naturalHeight;
        pc.drawImage(anFace, 128, PHOTO.h - h + 14, wd, h);
      }
      pc.restore();
      gradeHoneyOn(pc, PHOTO.w, PHOTO.h);
    };

    const loop = (now: number) => {
      const t = (now - begin) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = STEPS[stepRef.current];
      const u = (now - stepStartRef.current) / 1000;
      fctx.clearRect(0, 0, W, H);

      if (st.scene === 'snap') {
        if (u < GLITCH_DUR) drawAberration(u);
        else drawServerHaven(t, u);
      } else {
        renderMemory(t);
        px(ctx, 0, 0, W, H, '#000');
        if (st.scene === 'ride') {
          ctx.drawImage(shot, 0, 0);
        } else {
          // Cận cảnh: nền nhoè như ống kính mở to, phóng nhẹ vào giữa
          const z = st.scene === 'photo' ? 1.12 : 1.18;
          ctx.save();
          ctx.filter = 'blur(4px) brightness(0.92)';
          ctx.drawImage(shot, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
          ctx.restore();
        }

        // Chụp ảnh Polaroid đúng khoảnh khắc chớp sáng
        if (st.scene === 'photo' && !photoTaken) {
          const pc = photoRef.current?.getContext('2d');
          if (pc) {
            photoTaken = true;
            takePhoto(pc);
          }
        }

        const intro = ease(t / 1.2);
        drawBokeh(fctx, bokeh, dt, t, intro);
        if (intro < 1) px(fctx, 0, 0, W, H, `rgba(0,0,0,${1 - intro})`);
        if (st.scene === 'photo' && u < 0.9) {
          // Chớp sáng trắng ấm của đèn flash
          fctx.fillStyle = `rgba(255,250,235,${1 - ease(u / 0.9)})`;
          fctx.fillRect(0, 0, W, H);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scene = cur.scene;
  const inMemory = scene !== 'snap';
  const closeUp = scene === 'an' || scene === 'lean';
  const portraitFilter = 'saturate(1.05) drop-shadow(0 0 18px rgba(251,191,36,0.35))';
  const nameColor = cur.speaker === 'Miên' ? 'text-pink-300' : 'text-amber-200';

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center overflow-hidden select-none cursor-pointer ${
        inMemory ? 'bg-gradient-to-b from-amber-950/80 via-black to-black' : 'bg-black'
      }`}
      onClick={advance}
    >
      <style>{`
        @keyframes fb-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fb-title { 0% { opacity: 0; transform: translateY(6px) } 25%, 75% { opacity: 1; transform: none } 100% { opacity: 0 } }
        @keyframes fb-develop { from { filter: brightness(2.4) saturate(0) blur(1px) } to { filter: none } }
        @keyframes fb-polaroid { from { opacity: 0; transform: translate(-50%, 30px) rotate(2deg) scale(0.92) } to { opacity: 1; transform: translate(-50%, 0) rotate(-3deg) scale(1) } }
        @keyframes fb-click { 0% { opacity: 0; transform: scale(0.6) rotate(-8deg) } 15% { opacity: 1; transform: scale(1.05) rotate(-8deg) } 100% { opacity: 0; transform: scale(1.2) rotate(-8deg) } }
      `}</style>

      <div className="relative w-full aspect-video max-h-full" style={{ maxWidth: 'calc(100vh * 16 / 9)' }}>
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />

        {/* Chân dung cận mặt: An ở giữa / Miên tựa cằm lên vai anh (vẽ trước để nằm sau An) */}
        <img
          src={step === 3 ? '/assets/ModelMIEN/playfulMien.png' : '/assets/ModelMIEN/warm_smileMien.png'}
          alt=""
          draggable={false}
          className={`absolute bottom-[15%] left-[27%] h-[76%] w-auto transition-all duration-700 ease-out ${
            scene === 'lean' ? 'opacity-100 -rotate-6' : 'opacity-0 -translate-x-8 rotate-0'
          }`}
          style={{ imageRendering: 'pixelated', filter: portraitFilter }}
        />

        <img
          src="/assets/ModelAN/BrightSmileAn.png"
          alt=""
          draggable={false}
          className={`absolute bottom-[8%] h-[84%] w-auto transition-all duration-700 ease-out ${
            closeUp ? 'opacity-100' : 'opacity-0 translate-y-6'
          } ${scene === 'lean' ? 'left-[46%]' : 'left-1/2 -translate-x-1/2'}`}
          style={{ imageRendering: 'pixelated', filter: portraitFilter }}
        />
        <canvas ref={fxRef} width={W} height={H} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Mở đầu: thời gian, địa điểm */}
        {cur.title && (
          // Dải nền tối mờ phía sau chữ, đặt ở vùng trời cho khỏi che xe đạp
          <div className="absolute inset-x-0 top-[9%] flex justify-center pointer-events-none" style={{ animation: 'fb-title 3.2s ease-in-out forwards' }}>
            <div className="flex flex-col items-center px-8 sm:px-12 py-2.5 sm:py-3.5 bg-gradient-to-r from-transparent via-black/55 to-transparent backdrop-blur-[2px]">
              <div className="text-[10px] sm:text-xs tracking-[0.4em] text-amber-100 font-mono mb-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{tx('BẾN AN YÊN')}</div>
              <div className="text-lg sm:text-2xl italic font-serif text-amber-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                {tx('Một chiều hè, năm hai mươi hai tuổi')}
              </div>
            </div>
          </div>
        )}

        {/* TÁCH! — ảnh Polaroid hiện dần */}
        {scene === 'photo' && (
          <>
            <div
              className="absolute top-[10%] right-[14%] text-3xl sm:text-5xl font-black font-mono text-white drop-shadow-[0_0_12px_rgba(255,236,190,0.9)] pointer-events-none"
              style={{ animation: 'fb-click 1s ease-out forwards' }}
            >
              {tx('TÁCH!')}
            </div>
            <div
              className="absolute left-1/2 top-[12%] w-[40%] bg-[#fbf7ee] p-[2%] pb-[7%] shadow-[0_12px_40px_rgba(0,0,0,0.6)] pointer-events-none"
              style={{ animation: 'fb-polaroid 0.9s 0.35s ease-out both' }}
            >
              <canvas
                ref={photoRef}
                width={PHOTO.w}
                height={PHOTO.h}
                className="w-full h-auto block"
                style={{ imageRendering: 'pixelated', animation: 'fb-develop 2.6s 0.5s ease-out both' }}
              />
              <div className="absolute bottom-[1.5%] left-0 right-0 text-center font-serif italic text-[10px] sm:text-sm text-stone-600">
                {tx('Bến An Yên, một chiều hè ♡')}
              </div>
            </div>
          </>
        )}

        {/* Khung thoại ấm, không scanline */}
        {cur.text && (
          <div
            key={step}
            className="absolute bottom-[4%] left-1/2 -translate-x-1/2 w-[88%] rounded-lg border border-amber-200/25 bg-gradient-to-t from-black/75 to-amber-950/45 backdrop-blur-sm px-4 py-2 sm:px-5 sm:py-3"
            style={{ animation: 'fb-fade 0.4s ease-out' }}
          >
            <div className={`text-[11px] sm:text-xs tracking-[0.2em] font-mono mb-1 ${nameColor}`}>{tx(cur.speaker ?? '').toUpperCase()}</div>
            <p className="text-sm sm:text-base leading-relaxed text-amber-50 min-h-[2.8em] text-justify">
              {fullText.slice(0, typed)}
              {typing && <span className="opacity-60">▍</span>}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute bottom-4 right-4 px-3 py-1 text-[11px] font-mono text-amber-200/50 hover:text-amber-100 border border-amber-200/15 hover:border-amber-200/40 rounded transition-colors"
      >
        {tx('BỎ QUA ▸▸')}
      </button>
    </div>
  );
};
