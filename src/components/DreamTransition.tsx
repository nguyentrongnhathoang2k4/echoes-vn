'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { px, hash } from './pixel/pixelKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { tx } from '../locales/tx';

// =====================================================================
// CHUYỂN CẢNH MÀN 1 → MÀN 2: "CHÌM VÀO GIẤC MỘNG" (~3.5 giây, bỏ qua được)
// Nằm trên giường nhìn trần phòng 314 → An thở dài, quạt CRT và mưa lịm dần, phòng tối sầm →
// bụi mơ tím hồng bay lên, sàn gỗ tan thành thảm cỏ → sóng sông + chuông gió nổi lên,
// hai mí mắt hé mở ra bầu trời hoàng hôn Bến An Yên → vào thẳng Màn 2 (không có thẻ chương).
// =====================================================================

const W = 640;
const H = 360;
const CROP = { x: 80, y: 30 };          // Cùng khung với SunBreakTransition: mở mắt là đúng bầu trời Màn 2

const T_DARK = 1.2;                     // Phòng tối hẳn
const T_DUST = 1.2;                     // Bụi mơ bay lên, sàn gỗ tan thành cỏ
const T_WAKE = 2.5;                     // Hai mí mắt hé mở
const TOTAL = 3.5;

const CEIL_H = 230;                     // Trần nhà chiếm phần trên, sàn gỗ phía dưới
const BLOCK = 8;                        // Ô hoà tan gỗ → cỏ (pixel 2x)

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

/** Trần phòng 314 nhìn từ giường: vữa xám loang ố, quạt trần, vệt sáng xanh của màn hình CRT hắt lên */
function drawCeiling(ctx: CanvasRenderingContext2D, t: number) {
  px(ctx, 0, 0, W, CEIL_H, '#3f3f46');
  for (let i = 0; i < 60; i++) {
    px(ctx, Math.floor(hash(i * 3) * W / 4) * 4, Math.floor(hash(i * 5) * CEIL_H / 4) * 4, 4, 4, i % 2 ? '#52525b' : '#36363c');
  }
  // Vệt ố nước mưa thấm trần
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 26 + hash(i * 7) * 16;
    px(ctx, 430 + Math.cos(a) * r, 70 + Math.sin(a) * r * 0.55, 6, 4, '#4a4134');
  }
  // Quạt trần đứng yên (cúp điện)
  px(ctx, 214, 0, 4, 46, '#27272a');
  px(ctx, 200, 46, 32, 8, '#27272a');
  px(ctx, 120, 48, 82, 4, '#2f2f33');
  px(ctx, 230, 48, 82, 4, '#2f2f33');
  // Ánh xanh màn hình CRT hắt lên trần, chập chờn
  const flick = 0.12 + Math.sin(t * 23) * 0.02 + (hash(Math.floor(t * 12)) - 0.5) * 0.04;
  ctx.fillStyle = `rgba(120,170,255,${Math.max(0, flick)})`;
  ctx.fillRect(360, 150, 280, CEIL_H - 150);
}

/** Sàn gỗ dưới chân giường; ô nào đã "tan" thì vẽ thành cỏ xanh */
function drawFloor(ctx: CanvasRenderingContext2D, melt: number, t: number) {
  for (let y = CEIL_H; y < H; y += BLOCK) {
    for (let x = 0; x < W; x += BLOCK) {
      // Tan từ mép dưới lên, lệch ngẫu nhiên theo từng ô
      const id = (x / BLOCK) * 97 + y / BLOCK;
      const rise = (H - y) / (H - CEIL_H);
      const grass = melt > rise * 0.6 + hash(id) * 0.4;
      if (grass) {
        const sway = Math.sin(t * 3 + x * 0.05) > 0.6;
        px(ctx, x, y, BLOCK, BLOCK, hash(id * 3) > 0.5 ? '#3f7d3a' : '#4d9443');
        if (sway) px(ctx, x + 2, y, 2, 3, '#86c46b');
      } else {
        const plank = Math.floor((y - CEIL_H) / 16);
        px(ctx, x, y, BLOCK, BLOCK, plank % 2 ? '#5b3a24' : '#4a2f1d');
        if ((x + plank * 40) % 96 === 0) px(ctx, x, y, 2, BLOCK, '#2e1d12');
      }
    }
  }
}

interface DreamTransitionProps {
  onComplete: () => void;
  volume?: number;
}

export const DreamTransition: React.FC<DreamTransitionProps> = ({ onComplete, volume = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh: mưa + quạt CRT lịm dần theo tiếng thở dài → sóng sông + chuông gió nổi lên =====
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
    const noise = (filter: BiquadFilterType, freq: number, from: number, to: number, startAt: number, endAt: number) => {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(from, at(startAt));
      g.gain.linearRampToValueAtTime(to, at(endAt));
      src.connect(f).connect(g).connect(master);
      src.start(at(startAt));
      src.stop(at(TOTAL) + 0.05);
    };

    // Mưa rào + quạt tản nhiệt 55Hz lịm dần tới lúc phòng tối hẳn
    noise('lowpass', 620, 0.05, 0.0001, 0, T_DARK);
    const fan = c.createOscillator();
    fan.type = 'sawtooth';
    fan.frequency.value = 55;
    const fanLp = c.createBiquadFilter();
    fanLp.type = 'lowpass';
    fanLp.frequency.value = 120;
    const fanG = c.createGain();
    fanG.gain.setValueAtTime(0.03, at(0));
    fanG.gain.linearRampToValueAtTime(0.0001, at(T_DARK));
    fan.connect(fanLp).connect(fanG).connect(master);
    fan.start(at(0));
    fan.stop(at(T_DARK) + 0.05);

    // Tiếng thở dài của An: luồng hơi lọc trầm phồng lên rồi tắt
    const sigh = c.createBufferSource();
    sigh.buffer = buf;
    const sighBp = c.createBiquadFilter();
    sighBp.type = 'bandpass';
    sighBp.frequency.setValueAtTime(850, at(0.15));
    sighBp.frequency.exponentialRampToValueAtTime(360, at(1.4));
    sighBp.Q.value = 0.8;
    const sighG = c.createGain();
    sighG.gain.setValueAtTime(0.0001, at(0.15));
    sighG.gain.exponentialRampToValueAtTime(0.06, at(0.55));
    sighG.gain.exponentialRampToValueAtTime(0.0001, at(1.45));
    sigh.connect(sighBp).connect(sighG).connect(master);
    sigh.start(at(0.15), 0.3);
    sigh.stop(at(1.5));

    // Bụi mơ: hai nốt pad mờ ngân lên
    [[392, 0.012], [587.33, 0.008]].forEach(([f, g]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, at(T_DUST));
      e.gain.linearRampToValueAtTime(g, at(T_DUST + 0.6));
      e.gain.linearRampToValueAtTime(0.0001, at(TOTAL));
      o.connect(e).connect(master);
      o.start(at(T_DUST));
      o.stop(at(TOTAL) + 0.05);
    });

    // Sóng nước bến sông nổi lên + chuông gió leng keng
    noise('lowpass', 520, 0.0001, 0.035, T_WAKE - 0.2, TOTAL);
    [[2.6, 1568], [2.95, 1760], [3.25, 2093]].forEach(([when, f]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const e = c.createGain();
      e.gain.setValueAtTime(0, at(when));
      e.gain.linearRampToValueAtTime(0.025, at(when) + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, at(when) + 1.1);
      o.connect(e).connect(master);
      o.start(at(when));
      o.stop(at(when) + 1.15);
    });

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
    const world = document.createElement('canvas');
    world.width = BEN_AN_YEN.width;
    world.height = BEN_AN_YEN.height;
    const w = world.getContext('2d');
    if (!w) return;
    w.imageSmoothingEnabled = false;

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }

      if (t < T_WAKE) {
        // 1–2. Phòng 314 tối sầm; sàn gỗ tan thành cỏ khi bụi mơ bay lên
        drawCeiling(ctx, t);
        drawFloor(ctx, ease((t - T_DUST) / (T_WAKE - T_DUST)), t);
        const dark = ease(t / T_DARK) * 0.92;
        ctx.fillStyle = `rgba(4,2,10,${dark})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        // 3. Bầu trời hoàng hôn Bến An Yên
        drawBenAnYenSunset(w, t - T_WAKE);
        ctx.drawImage(world, CROP.x, CROP.y, W, H, 0, 0, W, H);
      }

      // Bụi mơ tím hồng bay lơ lửng từ dưới lên (vẫn còn vương lúc vừa mở mắt)
      if (t > T_DUST) {
        const life = t - T_DUST;
        for (let i = 0; i < 70; i++) {
          const speed = 40 + hash(i * 5) * 70;
          const y = H + 10 - ((life * speed + hash(i * 9) * H) % (H + 20));
          const x = hash(i * 3) * W + Math.sin(t * 1.5 + i) * 10;
          const a = Math.min(1, life / 0.4) * (t > T_WAKE ? 1 - ease((t - T_WAKE) / 0.9) : 1) * (0.4 + hash(i) * 0.6);
          if (a <= 0) continue;
          ctx.globalAlpha = a;
          px(ctx, x, y, 2 + (i % 3 === 0 ? 2 : 0), 2 + (i % 3 === 0 ? 2 : 0), i % 2 ? '#f9a8d4' : '#c4b5fd');
        }
        ctx.globalAlpha = 1;
      }

      // Hai mí mắt: khép kín lúc chuyển sang mơ, rồi hé mở (mép cong như mí mắt)
      if (t >= T_WAKE - 0.25) {
        const open = ease((t - T_WAKE) / (TOTAL - T_WAKE - 0.15));
        const gap = open * (H / 2 + 30);
        ctx.fillStyle = '#000';
        for (let x = 0; x < W; x += 4) {
          const curve = Math.sin((x / W) * Math.PI) * 26 * open;
          const lid = Math.max(0, H / 2 - gap - curve);
          ctx.fillRect(x, 0, 4, lid + 1);
          ctx.fillRect(x, H - lid - 1, 4, lid + 1);
        }
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
