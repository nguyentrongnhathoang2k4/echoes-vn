'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { px, hash } from './pixel/pixelKit';
import { tx } from '../locales/tx';

// =====================================================================
// CHUYỂN CẢNH MÀN 3 → MÀN 4: "SỤP ĐỔ VÀO TRẠM MÁY CHỦ" (~3 giây, bỏ qua được)
// Phòng cấp cứu co rút về một điểm, điện tim kéo thẳng thành vệt Flatline rồi tắt ngấm →
// thác số nhị phân 0–1 xanh lơ đổ dọc màn hình → quạt máy chủ rú trầm, màn terminal đen
// loé con trỏ nhấp nháy → vào thẳng trạm điều khiển AURA-NODE-314 (không có thẻ chương).
// =====================================================================

const W = 640;
const H = 360;

const T_FLAT = 0.45;                    // Điện tim duỗi thẳng
const T_RAIN = 1.0;                     // Thác mã nhị phân
const T_TERMINAL = 2.0;                 // Quạt máy chủ + con trỏ terminal
const TOTAL = 3.0;

const COLS = 40;                        // Số cột mưa mã (mỗi cột 16px)
const GLYPH = 16;

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

/** Phòng cấp cứu thu nhỏ: tường đỏ bầm, đèn xoay đỏ – xanh, monitor điện tim ở giữa */
function drawErRoom(ctx: CanvasRenderingContext2D, t: number, flat: number) {
  px(ctx, 0, 0, W, H, '#1a0507');
  px(ctx, 0, 250, W, 110, '#12090a');
  // Vệt "rỉ máu" trên tường
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash(i * 3) * W / 4) * 4;
    const len = 30 + hash(i * 7) * 120;
    px(ctx, x, 0, 4, len, '#4c0b12');
    px(ctx, x, len, 4, 4, '#6b0f19');
  }
  // Đèn cấp cứu xoay: đỏ rồi xanh quét ngang phòng
  const phase = (t * 2.2) % 1;
  ctx.fillStyle = phase < 0.5 ? 'rgba(239,68,68,0.28)' : 'rgba(59,130,246,0.24)';
  const sweep = ((t * 2.2) % 1) * W * 1.4 - W * 0.2;
  ctx.fillRect(sweep - 140, 0, 280, H);
  // Monitor điện tim
  px(ctx, 220, 120, 200, 110, '#0b0f0e');
  px(ctx, 224, 124, 192, 102, '#021e1a');
  ctx.strokeStyle = flat > 0.5 ? '#ef4444' : '#34d399';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= 188; x += 2) {
    const wx = x + t * 160;
    const beat = (wx % 70) / 70;
    let y = beat > 0.42 && beat < 0.5 ? -34 * Math.sin(((beat - 0.42) / 0.08) * Math.PI) : Math.sin(wx * 0.2) * 3;
    y *= 1 - flat;
    if (x === 0) ctx.moveTo(226 + x, 175 + y);
    else ctx.lineTo(226 + x, 175 + y);
  }
  ctx.stroke();
}

interface CoreDescentTransitionProps {
  onComplete: () => void;
  volume?: number;
}

export const CoreDescentTransition: React.FC<CoreDescentTransitionProps> = ({ onComplete, volume = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh: còi phòng cấp cứu → tiếng Flatline trầm đục tắt ngấm → lách tách dữ liệu → quạt máy chủ rú =====
  useEffect(() => {
    let ctx: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) ctx = new Ctx();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const c = ctx;
    const t0 = c.currentTime + 0.05;
    const at = (s: number) => t0 + s;
    const master = c.createGain();
    master.gain.value = (volumeRef.current / 100) * 0.9;
    master.connect(c.destination);
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Còi cấp cứu xa, nghẹt lại khi căn phòng co rút
    const siren = c.createOscillator();
    siren.type = 'triangle';
    for (let i = 0; i < 3; i++) siren.frequency.setValueAtTime(i % 2 === 0 ? 650 : 870, at(i * 0.3));
    const sirenLp = c.createBiquadFilter();
    sirenLp.type = 'lowpass';
    sirenLp.frequency.setValueAtTime(1200, at(0));
    sirenLp.frequency.exponentialRampToValueAtTime(200, at(T_FLAT));
    const sirenG = c.createGain();
    sirenG.gain.setValueAtTime(0.03, at(0));
    sirenG.gain.linearRampToValueAtTime(0.0001, at(T_FLAT + 0.1));
    siren.connect(sirenLp).connect(sirenG).connect(master);
    siren.start(at(0));
    siren.stop(at(T_FLAT + 0.15));

    // Flatline: một vệt âm dài, trầm và đục (440Hz lọc dưới 500Hz), tắt ngấm khi màn hình tối
    const flat = c.createOscillator();
    flat.type = 'sine';
    flat.frequency.value = 440;
    const flatLp = c.createBiquadFilter();
    flatLp.type = 'lowpass';
    flatLp.frequency.value = 500;
    const flatG = c.createGain();
    flatG.gain.setValueAtTime(0.0001, at(T_FLAT));
    flatG.gain.linearRampToValueAtTime(0.035, at(T_FLAT + 0.08));
    flatG.gain.setValueAtTime(0.035, at(T_RAIN - 0.15));
    flatG.gain.linearRampToValueAtTime(0.0001, at(T_RAIN));
    flat.connect(flatLp).connect(flatG).connect(master);
    flat.start(at(T_FLAT));
    flat.stop(at(T_RAIN) + 0.05);

    // Thác dữ liệu: lách tách nhỏ, ngẫu nhiên
    for (let i = 0; i < 18; i++) {
      const when = T_RAIN + 0.05 + hash(i * 11) * (T_TERMINAL - T_RAIN);
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + hash(i * 5) * 1600;
      bp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.03, at(when));
      g.gain.exponentialRampToValueAtTime(0.0001, at(when) + 0.03);
      src.connect(bp).connect(g).connect(master);
      src.start(at(when), hash(i) * 1.5);
      src.stop(at(when) + 0.04);
    }

    // Quạt làm mát máy chủ công nghiệp rú lên trầm thấp
    const fan = c.createBufferSource();
    fan.buffer = buf;
    fan.loop = true;
    const fanLp = c.createBiquadFilter();
    fanLp.type = 'lowpass';
    fanLp.frequency.setValueAtTime(180, at(T_TERMINAL - 0.3));
    fanLp.frequency.linearRampToValueAtTime(420, at(TOTAL));
    const fanG = c.createGain();
    fanG.gain.setValueAtTime(0.0001, at(T_TERMINAL - 0.3));
    fanG.gain.linearRampToValueAtTime(0.07, at(TOTAL));
    fan.connect(fanLp).connect(fanG).connect(master);
    fan.start(at(T_TERMINAL - 0.3));
    fan.stop(at(TOTAL) + 0.05);
    const hum = c.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 60;
    const humLp = c.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 140;
    const humG = c.createGain();
    humG.gain.setValueAtTime(0.0001, at(T_TERMINAL - 0.3));
    humG.gain.linearRampToValueAtTime(0.025, at(TOTAL));
    hum.connect(humLp).connect(humG).connect(master);
    hum.start(at(T_TERMINAL - 0.3));
    hum.stop(at(TOTAL) + 0.05);

    return () => {
      void c.close().catch(() => {});
    };
  }, []);

  // ===== Vẽ =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const room = document.createElement('canvas');
    room.width = W;
    room.height = H;
    const r = room.getContext('2d');
    if (!r) return;
    const font = `bold ${GLYPH - 2}px monospace`;

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      px(ctx, 0, 0, W, H, '#000');

      // 1. Phòng cấp cứu co rút về một điểm, điện tim duỗi thẳng rồi tắt
      if (t < T_RAIN) {
        drawErRoom(r, t, ease((t - T_FLAT) / 0.25));
        const shrink = 1 - ease(t / T_RAIN) * 0.96;
        const sw = W * shrink;
        const sh = H * Math.max(0.006, shrink * (1 - ease((t - 0.7) / 0.3) * 0.98));
        ctx.globalAlpha = 1 - ease((t - 0.85) / 0.15);
        ctx.drawImage(room, (W - sw) / 2, (H - sh) / 2, sw, sh);
        ctx.globalAlpha = 1;
      }

      // 2. Thác mã nhị phân xanh lơ (vẫn đổ mờ sau lưng con trỏ terminal rồi tắt)
      if (t >= T_RAIN) {
        const rt = t - T_RAIN;
        const fadeOut = 1 - ease((t - T_TERMINAL) / 0.6);
        ctx.font = font;
        for (let col = 0; col < COLS; col++) {
          const speed = 260 + hash(col * 7) * 320;
          const head = rt * speed - hash(col * 3) * 200;
          const x = col * GLYPH;
          for (let k = 0; k < 14; k++) {
            const y = Math.floor((head - k * GLYPH) / GLYPH) * GLYPH;
            if (y < 0 || y > H) continue;
            const a = (k === 0 ? 1 : 0.85 - k * 0.06) * fadeOut;
            if (a <= 0) continue;
            ctx.fillStyle = k === 0 ? `rgba(224,255,255,${a})` : `rgba(34,211,238,${a})`;
            ctx.fillText(hash(col * 31 + Math.floor(y / GLYPH) + Math.floor(t * 8)) > 0.5 ? '1' : '0', x + 3, y);
          }
        }
      }

      // 3. Terminal đen tuyền, con trỏ nhấp nháy
      if (t >= T_TERMINAL) {
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = '#67e8f9';
        ctx.globalAlpha = ease((t - T_TERMINAL) / 0.3);
        ctx.fillText('AURA-NODE-314 >', 40, H / 2);
        if (Math.floor(t * 4) % 2 === 0) px(ctx, 182, H / 2 - 12, 9, 14, '#67e8f9');
        ctx.globalAlpha = 1;
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
      <div className="relative w-full aspect-video max-h-full" style={{ maxWidth: 'calc(100vh * 16 / 9)' }}>
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
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
