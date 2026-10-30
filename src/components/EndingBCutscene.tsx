'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px, block } from './pixel/pixelKit';
import { drawSpriteFrame } from './pixel/spriteKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { tx } from '../locales/tx';

// =====================================================================
// CUTSCENE ENDING B — HOÀNG HÔN KHÔNG BAO GIỜ TẮT (~49 giây, bỏ qua được)
// Soi gương với Ending A: ở A thời gian đi tiếp (03:15), ở đây thời gian đứng yên.
// 1. Đồng bộ cưỡng chế: vạch sáng hồng mở ra (ngược với màn hình tắt của A)
// 2. Bến An Yên hoàng hôn (đúng Màn 2): An và Miên ngồi trên ghế đá.
//    Miên hỏi "Anh có lạnh không?", An đáp "Không." — lặp lại y hệt,
//    mỗi vòng mục rữa thêm một chút: bồ câu biến mất → trời nhuốm đỏ →
//    hình xé, chữ lỗi → vòng cuối đứt giữa câu.
// 3. Khung hình đóng băng tan thành nhiễu → đồng hồ 03:14 (chực sang 03:15 rồi giật về)
// =====================================================================

const W = 640;
const H = 360;
const SPRITE_W = 42;
const SPRITE_H = 63;
const ROW_DOWN = 0;
const ROW_SIDE = 2;
const LETTERBOX = 30;

const INTRO_END = 3;
const CYCLE = 6.5;
const CYCLES = 5;
const LAST_CYCLE_CUT = 3.2;           // Vòng cuối đứt giữa câu
const LOOP_END = INTRO_END + (CYCLES - 1) * CYCLE + LAST_CYCLE_CUT;
const FREEZE_END = LOOP_END + 3.8;
const CLOCK_END = FREEZE_END + 6;
const TOTAL = CLOCK_END + 7;

// Trong mỗi vòng: toàn cảnh → trung cảnh; Miên hỏi → An đáp
const WIDE_UNTIL = 1.2;
const ASK = { start: 2.0, end: 3.4 };
const ANSWER = { start: 3.8, end: 5.0 };

const WIDE_CROP = { x: 80, y: 30 };      // 1:1
const MEDIUM_CROP = { x: 473, y: 190 };  // phóng 2x

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

interface Caption { speaker: string; text: string; glitch?: boolean }

/** Phụ đề tại thời điểm t (null = không có) */
function captionAt(t: number): Caption | null {
  if (t < INTRO_END || t >= LOOP_END) return null;
  const c = Math.floor((t - INTRO_END) / CYCLE);
  const u = (t - INTRO_END) % CYCLE;
  if (c === CYCLES - 1) {
    // Vòng cuối: đứt giữa câu
    if (u >= ASK.start) return { speaker: 'Miên', text: 'Anh có...', glitch: true };
    return null;
  }
  if (u >= ASK.start && u < ASK.end) {
    return { speaker: 'Miên', text: c >= 3 ? 'Anh có l̷ạnh kh0ng?' : 'Anh có lạnh không?', glitch: c >= 3 };
  }
  if (u >= ANSWER.start && u < ANSWER.end) {
    return { speaker: 'An', text: c >= 3 ? 'Kh... ông.' : 'Không.', glitch: c >= 3 };
  }
  return null;
}

// Chữ số pixel 5x7 cho đồng hồ cuối
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
};
function drawGlyphs(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, scale: number, color: string) {
  let x = cx - (text.length * 6 * scale - scale) / 2;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      g.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === '1') px(ctx, x + rx * scale, cy - 3.5 * scale + ry * scale, scale - 1, scale - 1, color);
      });
    }
    x += 6 * scale;
  }
}

/** An và Miên ngồi trên ghế đá (nối dài cho đủ hai người) — vẽ trên bản đồ 800x500 */
function drawCouple(w: CanvasRenderingContext2D, u: number, an: HTMLImageElement | null, mien: HTMLImageElement | null, cycle: number) {
  const B = BEN_AN_YEN.bench;
  const x0 = B.x - 54;
  const seatY = B.y + 2;
  // Lưng ghế + mặt ghế dài hơn ghế gốc để đủ chỗ hai người
  block(w, x0, B.y - 10, 101, 8, '#a8a29e', '#d6d3d1', '#78716c');
  const ready = (img: HTMLImageElement | null): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;
  // Quay mặt sang nhau đúng nhịp hỏi – đáp (vòng cuối Miên quay rồi đứng yên)
  const mienTurn = u >= ASK.start - 0.2 && (u < ANSWER.end || cycle === CYCLES - 1);
  const anTurn = u >= ANSWER.start - 0.2 && u < ANSWER.end + 0.4 && cycle < CYCLES - 1;
  const seat = (img: HTMLImageElement | null, x: number, turned: boolean, faceLeft: boolean) => {
    if (!ready(img)) return;
    w.save();
    w.beginPath();
    w.rect(x - 4, B.y - 60, SPRITE_W + 8, 62);
    w.clip();
    drawSpriteFrame(w, img, 1, turned ? ROW_SIDE : ROW_DOWN, turned && faceLeft, x, B.y - 50, SPRITE_W, SPRITE_H);
    w.restore();
  };
  seat(an, x0 + 6, anTurn, false);
  seat(mien, x0 + 52, mienTurn, true);
  block(w, x0 - 2, seatY, 105, 9, '#a8a29e', '#d6d3d1', '#78716c');
  block(w, x0 + 5, seatY + 9, 8, 13, '#57534e', '#78716c', '#3f3a36');
  block(w, x0 + 88, seatY + 9, 8, 13, '#57534e', '#78716c', '#3f3a36');
}

interface EndingBCutsceneProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm từng cảnh) */
  startAt?: number;
}

// Câu nhạc hộp nhạc lặp mỗi vòng (4 ô nhịp đầu của bài ở Ending A) — mỗi vòng lệch tông thêm
const LOOP_MELODY: Array<[number, number]> = [
  [659.25, 2], [783.99, 1], [880.0, 2], [659.25, 1], [698.46, 2], [880.0, 1], [783.99, 3],
];
const LOOP_BEAT = 0.5;

export const EndingBCutscene: React.FC<EndingBCutsceneProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
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
    const t0 = ctx.currentTime + 0.05 - startAtRef.current;
    const at = (s: number) => Math.max(ctx!.currentTime, t0 + s);
    const master = ctx.createGain();
    master.gain.value = (volumeRef.current / 100) * 0.9;
    master.connect(ctx.destination);

    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

    // Vang cho hộp nhạc
    const reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.4);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);

    const bell = (f: number, when: number, gain: number, dur: number, type: OscillatorType = 'sine') => {
      if (!ctx || when + dur < ctx.currentTime) return;
      [[1, 1], [3.01, 0.16]].forEach(([mul, g]) => {
        const o = ctx!.createOscillator();
        o.type = type;
        o.frequency.value = f * mul;
        const env = ctx!.createGain();
        env.gain.setValueAtTime(0, when);
        env.gain.linearRampToValueAtTime(gain * g, when + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(env);
        env.connect(master);
        env.connect(reverb);
        o.start(when);
        o.stop(when + dur + 0.05);
      });
    };
    const burst = (when: number, gain: number, dur: number, hp = 1500) => {
      if (!ctx || when + dur < ctx.currentTime) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(f).connect(g).connect(master);
      src.start(when, Math.random());
      src.stop(when + dur + 0.02);
    };

    // 1. Đồng bộ cưỡng chế: tiếng ù dâng lên rồi tắt phụt
    if (t0 + INTRO_END > ctx.currentTime) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, at(0));
      o.frequency.exponentialRampToValueAtTime(620, at(2.6));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at(0));
      g.gain.linearRampToValueAtTime(0.06, at(2.5));
      g.gain.setValueAtTime(0, at(2.9));
      o.connect(lp).connect(g).connect(master);
      o.start(at(0));
      o.stop(at(3));
    }

    // 2. Tiếng sóng nước liên tục suốt các vòng lặp
    const water = ctx.createBufferSource();
    water.buffer = noiseBuf;
    water.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 480;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0, at(INTRO_END));
    wg.gain.linearRampToValueAtTime(0.025, at(INTRO_END + 1));
    wg.gain.setValueAtTime(0.025, at(LOOP_END));
    wg.gain.linearRampToValueAtTime(0, at(FREEZE_END));
    water.connect(wlp).connect(wg).connect(master);
    water.start(at(INTRO_END));
    water.stop(at(FREEZE_END) + 0.1);

    // Câu nhạc hộp nhạc mỗi vòng, lệch tông và méo dần; tiếng giật hình ở ranh giới vòng
    for (let c = 0; c < CYCLES; c++) {
      const base = INTRO_END + c * CYCLE + 0.3;
      const detune = 1 - c * 0.014;
      let beat = 0;
      for (const [f, len] of LOOP_MELODY) {
        const when = base + beat * LOOP_BEAT;
        if (c === CYCLES - 1 && when > INTRO_END + c * CYCLE + LAST_CYCLE_CUT) break;
        bell(f * detune, at(when), 0.08, Math.max(1.1, len * LOOP_BEAT * 1.5), c >= 3 ? 'triangle' : 'sine');
        beat += len;
      }
      if (c > 0) burst(at(INTRO_END + c * CYCLE), 0.12, 0.08);
    }
    // Đứt giữa câu: một tiếng rè dài rồi im lặng
    burst(at(LOOP_END), 0.2, 1.6, 600);

    // 3. Đồng hồ: một tiếng tích nặng; khoảnh khắc chực sang 03:15 rồi giật về
    bell(220, at(FREEZE_END + 0.4), 0.06, 1.4);
    burst(at(FREEZE_END + 3.6), 0.1, 0.06, 2500);

    return () => {
      void ctx?.close();
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
    const world = document.createElement('canvas');
    world.width = BEN_AN_YEN.width;
    world.height = BEN_AN_YEN.height;
    const w = world.getContext('2d');
    if (!w) return;
    w.imageSmoothingEnabled = false;
    // Khung hình đóng băng của vòng cuối
    const frozen = document.createElement('canvas');
    frozen.width = W;
    frozen.height = H;
    const fz = frozen.getContext('2d');
    if (!fz) return;
    let frozenTaken = false;

    let raf = 0;
    let lastCap: string | null = null;
    let lastTitle = false;
    const start = performance.now() - startAtRef.current * 1000;

    /** Một khung hình của vòng lặp c tại thời điểm u trong vòng */
    const drawLoopFrame = (c: number, u: number) => {
      // Mặt trời, mây, hộp nhạc... chạy cùng một khoảng thời gian ở mọi vòng → cảnh y hệt nhau
      drawBenAnYenSunset(w, u, { pigeons: c < 1 });
      drawCouple(w, u, an, mien, c);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (u < WIDE_UNTIL) ctx.drawImage(world, WIDE_CROP.x, WIDE_CROP.y, W, H, 0, 0, W, H);
      else ctx.drawImage(world, MEDIUM_CROP.x, MEDIUM_CROP.y, W / 2, H / 2, 0, 0, W, H);
      ctx.restore();
      // Mục rữa theo từng vòng
      if (c >= 2) {
        ctx.fillStyle = `rgba(140,0,40,${0.12 + (c - 2) * 0.08})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (c >= 3) {
        // Hình bị xé ngang + tách kênh màu
        for (let i = 0; i < 3 + (c - 3) * 4; i++) {
          const y = Math.floor(Math.random() * (H - 8));
          ctx.drawImage(canvas, 0, y, W, 6, (Math.random() - 0.5) * 24, y, W, 6);
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18;
        ctx.drawImage(canvas, -3, 0);
        ctx.restore();
      }
      // Lóe trắng lúc giật về đầu vòng
      if (c > 0 && u < 0.12) {
        ctx.fillStyle = 'rgba(255,240,250,0.85)';
        ctx.fillRect(0, 0, W, H);
      }
    };

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      px(ctx, 0, 0, W, H, '#000');

      if (t < INTRO_END) {
        // Vạch sáng hồng mở rộng ra thành khung hình (ngược với màn hình tắt ở Ending A)
        // Vạch sáng mảnh lan ngang, cuối cùng lóe trắng mở vào cảnh
        const k = t / INTRO_END;
        const lineW = 4 + (W - 4) * ease(k * 1.5);
        ctx.fillStyle = '#f9a8d4';
        ctx.fillRect(W / 2 - lineW / 2, H / 2 - 1, lineW, 2 + Math.sin(t * 30) * 0.5);
        if (k > 0.86) {
          ctx.fillStyle = `rgba(255,236,246,${ease((k - 0.86) / 0.14)})`;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.fillStyle = '#fbcfe8';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        if (t > 0.6) ctx.fillText(tx('[ĐỒNG BỘ CƯỠNG CHẾ: {0}%]', Math.min(100, Math.floor(t / 2.6 * 100))), W / 2, H / 2 + 34);
        ctx.textAlign = 'start';
      } else if (t < LOOP_END) {
        const c = Math.floor((t - INTRO_END) / CYCLE);
        const u = (t - INTRO_END) % CYCLE;
        drawLoopFrame(c, u);
      } else if (t < FREEZE_END) {
        // Khung hình đóng băng tan dần thành nhiễu
        if (!frozenTaken) {
          drawLoopFrame(CYCLES - 1, LAST_CYCLE_CUT);
          fz.drawImage(canvas, 0, 0);
          frozenTaken = true;
        }
        const k = (t - LOOP_END) / (FREEZE_END - LOOP_END);
        ctx.drawImage(frozen, 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.6})`;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 900 * k; i++) {
          const v = Math.floor(Math.random() * 200);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 2, 2);
        }
      } else if (t < CLOCK_END) {
        // 03:14 đứng yên — một khoảnh khắc chực sang 03:15 rồi giật về
        const u = t - FREEZE_END;
        const slip = u > 3.55 && u < 3.68;
        const glow = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 220);
        glow.addColorStop(0, 'rgba(248,113,113,0.1)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = Math.min(1, u / 0.8, (CLOCK_END - t) / 0.8);
        drawGlyphs(ctx, slip ? '03:15' : '03:14', W / 2, H / 2, 12, slip ? '#fde68a' : '#f87171');
        ctx.globalAlpha = 1;
      }

      // Dải đen điện ảnh (giữ suốt cutscene, rút ra ở màn tên)
      const titleK = t >= CLOCK_END ? ease((t - CLOCK_END) / 1.5) : 0;
      const bars = LETTERBOX * Math.min(ease(t / 1.5), 1 - titleK);
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');

      const cap = captionAt(t);
      const key = cap ? `${cap.speaker}:${cap.text}:${Math.floor((t - INTRO_END) / CYCLE)}` : null;
      if (key !== lastCap) {
        lastCap = key;
        setCaption(cap);
      }
      const title = t >= CLOCK_END;
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

        {caption && (
          <div key={`${caption.speaker}${caption.text}`} className="absolute bottom-[3%] left-1/2 -translate-x-1/2 text-center px-5 py-1">
            <div
              className={`text-lg sm:text-xl italic font-serif drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${caption.speaker === 'Miên' ? 'text-pink-100' : 'text-zinc-100'}`}
              style={caption.glitch ? { textShadow: '-2px 0 rgba(255,0,80,0.8), 2px 0 rgba(0,255,255,0.6)' } : undefined}
            >
              &ldquo;{tx(caption.text)}&rdquo;
            </div>
          </div>
        )}

        {titleOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: 'outro-fade 2s ease-out' }}>
            <div className="text-2xl sm:text-4xl tracking-[0.3em] text-zinc-100 font-mono">ECHOES: 03:14 AM</div>
            <div className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-rose-300/70 font-mono">{tx('ENDING B • ĐỊA NGỤC NGỌT NGÀO')}</div>
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
