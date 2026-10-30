'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px } from './pixel/pixelKit';
import { drawRoom314Ending, ROOM_314 } from './OverworldStage';
import { tx } from '../locales/tx';

// =====================================================================
// CUTSCENE ENDING C — TẮT TỪNG BÓNG ĐÈN (~27 giây, bỏ qua được)
// Căn phòng 314 của Màn 1, An đứng lặng trước máy tính. Không ai chạm bàn phím.
// Đèn bàn tắt → ánh hành lang dưới khe cửa tắt → màn hình CRT tắt →
// trời ngoài cửa sổ tối dần, mưa ngừng rơi → quầng sáng quanh An co lại →
// "An... ơ..." → đen.
// =====================================================================

const W = 640;
const H = 360;
const LETTERBOX = 30;
// Khung cắt trên phòng 640x480 của Màn 1
const CROP_Y = 12;
// Máy quay đẩy chậm về phía An
const FOCUS = { x: 300, y: 150 };

const T_LAMP = 2.5;
const T_HALL = 5.2;
const T_CRT = 7.8;
const T_WINDOW = 10.3;
const T_RAIN_STOP = 12.5;
const T_AROUND = 11.5;
const T_BLACK = 18.5;
const T_TITLE = 20;
const TOTAL = 27;
const CAPTION = { start: 15.8, end: 18.2, speaker: 'Miên', text: 'An... ơ...' };

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

interface EndingCCutsceneProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm từng đoạn) */
  startAt?: number;
}

export const EndingCCutscene: React.FC<EndingCCutsceneProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captionOn, setCaptionOn] = useState(false);
  const [titleOn, setTitleOn] = useState(false);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);
  const startAtRef = useRef(startAt);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh =====
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

    // Tiếng mưa trên mái tôn: nhiễu lọc dải, tắt hẳn lúc mưa ngừng
    if (t0 + T_RAIN_STOP > ctx.currentTime) {
      const rain = ctx.createBufferSource();
      rain.buffer = noiseBuf;
      rain.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 0.4;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.05, at(0));
      rg.gain.setValueAtTime(0.05, at(T_RAIN_STOP - 0.6));
      rg.gain.linearRampToValueAtTime(0, at(T_RAIN_STOP));
      rain.connect(bp).connect(rg).connect(master);
      rain.start(at(0));
      rain.stop(at(T_RAIN_STOP) + 0.1);
    }
    // Tiếng ù của quạt case + màn hình CRT, tắt cùng màn hình
    if (t0 + T_CRT > ctx.currentTime) {
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 58;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.04, at(0));
      hg.gain.setValueAtTime(0.04, at(T_CRT));
      hg.gain.linearRampToValueAtTime(0, at(T_CRT + 0.25));
      hum.connect(lp).connect(hg).connect(master);
      hum.start(at(0));
      hum.stop(at(T_CRT) + 0.3);
    }
    /** Tiếng tách công tắc */
    const click = (when: number, gain: number, freq: number) => {
      if (!ctx || when < ctx.currentTime - 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      src.connect(f).connect(g).connect(master);
      src.start(when, Math.random());
      src.stop(when + 0.06);
    };
    click(at(T_LAMP), 0.25, 3200);
    click(at(T_HALL), 0.12, 1400);
    // Màn hình CRT tắt: tiếng "bụp" + âm rít tụt xuống
    click(at(T_CRT), 0.3, 900);
    if (t0 + T_CRT > ctx.currentTime) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, at(T_CRT));
      o.frequency.exponentialRampToValueAtTime(70, at(T_CRT + 0.45));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, at(T_CRT));
      g.gain.exponentialRampToValueAtTime(0.0001, at(T_CRT + 0.5));
      o.connect(g).connect(master);
      o.start(at(T_CRT));
      o.stop(at(T_CRT + 0.55));
    }
    // Một nốt trầm duy nhất khi hiện tên kết cục
    if (t0 + T_TITLE > ctx.currentTime) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 130.81;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at(T_TITLE));
      g.gain.linearRampToValueAtTime(0.06, at(T_TITLE + 0.05));
      g.gain.exponentialRampToValueAtTime(0.0001, at(T_TITLE + 4));
      o.connect(g).connect(master);
      o.start(at(T_TITLE));
      o.stop(at(T_TITLE + 4.1));
    }
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
    const room = document.createElement('canvas');
    room.width = ROOM_314.width;
    room.height = ROOM_314.height;
    const r = room.getContext('2d');
    if (!r) return;
    r.imageSmoothingEnabled = false;
    const light = document.createElement('canvas');
    light.width = ROOM_314.width;
    light.height = ROOM_314.height;

    let raf = 0;
    let lastCaption = false;
    let lastTitle = false;
    const start = performance.now() - startAtRef.current * 1000;
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (t >= TOTAL) {
        finish();
        return;
      }
      px(ctx, 0, 0, W, H, '#000');
      if (t < T_BLACK) {
        // Đèn bàn chập chờn một nhịp rồi tắt hẳn
        const lamp = t < T_LAMP ? 1 : t < T_LAMP + 0.1 ? 0.35 : t < T_LAMP + 0.16 ? 0.8 : 0;
        drawRoom314Ending(r, light, t, {
          lamp,
          crt: t < T_CRT,
          hall: 1 - ease((t - T_HALL) / 0.3),
          window: 1 - ease((t - T_WINDOW) / 2.2),
          around: 1 - ease((t - T_AROUND) / 4.5),
          rainStopAt: T_RAIN_STOP,
        }, an);
        // Màn hình CRT tắt: vạch sáng co lại thành chấm
        const k = (t - T_CRT) / 0.45;
        if (k >= 0 && k < 1) {
          const sx = 276;
          const sy = 90;
          px(r, sx, sy, 42, 28, '#030303');
          const lw = 40 * (1 - ease(k * 1.4));
          r.globalAlpha = 1 - ease((k - 0.6) / 0.4);
          px(r, sx + 21 - lw / 2, sy + 13, Math.max(2, lw), 2, '#e2fbe8');
          r.globalAlpha = 1;
        }
        // Máy quay đẩy chậm về phía An
        const z = 1 + 0.16 * ease(t / T_BLACK);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(FOCUS.x, FOCUS.y - CROP_Y);
        ctx.scale(z, z);
        ctx.translate(-FOCUS.x, -(FOCUS.y - CROP_Y));
        ctx.drawImage(room, 0, CROP_Y, W, H, 0, 0, W, H);
        ctx.restore();
        // Khoảng tối cuối cùng nuốt nốt quầng sáng quanh An
        const fade = ease((t - (T_BLACK - 2)) / 2);
        if (fade > 0) {
          ctx.fillStyle = `rgba(0,0,0,${fade})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      // Dải đen điện ảnh
      const titleK = t >= T_TITLE ? ease((t - T_TITLE) / 1.5) : 0;
      const bars = LETTERBOX * Math.min(ease(t / 1.5), 1 - titleK);
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');

      const cap = t >= CAPTION.start && t < CAPTION.end;
      if (cap !== lastCaption) {
        lastCaption = cap;
        setCaptionOn(cap);
      }
      const title = t >= T_TITLE;
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

        {captionOn && (
          <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 text-center px-5 py-1" style={{ animation: 'outro-fade 1.2s ease-out' }}>
            <div className="text-lg sm:text-xl italic font-serif text-pink-100/80 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              &ldquo;{tx(CAPTION.text)}&rdquo;
            </div>
          </div>
        )}

        {titleOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: 'outro-fade 2s ease-out' }}>
            <div className="text-2xl sm:text-4xl tracking-[0.3em] text-zinc-100 font-mono">ECHOES: 03:14 AM</div>
            <div className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-zinc-400 font-mono">{tx('ENDING C • ĐỨT ĐOẠN KÝ ỨC')}</div>
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
