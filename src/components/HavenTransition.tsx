'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { px, hash } from './pixel/pixelKit';
import { drawSpriteFrame } from './pixel/spriteKit';
import { drawRoom314Ending, ROOM_314 } from './OverworldStage';
import { drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { tx } from '../locales/tx';

// =====================================================================
// CHUYỂN CẢNH MÀN 1 → MÀN 2: "BỐN BỨC TƯỜNG TAN BIẾN" (~8.5 giây, bỏ qua được)
// Phòng 314 tối, mưa, CRT le lói, An đứng kiệt sức → Miên bước ra từ làn nhiễu,
// chìa bàn tay sáng hồng tím → từ chỗ hai bàn tay chạm nhau, một vòng sáng
// cam tím lan ra, sàn và tường vỡ thành bụi pixel bay lên, để lộ Bến An Yên
// lúc hoàng hôn → ánh sáng ấm tràn khung hình, sang card Chương II.
// =====================================================================

const W = 640;
const H = 360;
const LETTERBOX = 30;
const ROOM_CROP_Y = 12;                 // Khung 640x360 cắt trên phòng 640x480
const SUN_CROP = { x: 80, y: 30 };      // Khung 640x360 cắt trên bến 800x500 (mặt trời ở giữa)

const T_MIEN = 2.0;                     // Miên hiện ra từ làn nhiễu
const T_HAND = 3.0;                     // Bàn tay sáng chìa ra
const T_WAVE = 4.0;                     // Vòng sáng lan ra, phòng tan biến
const T_REVEAL = 6.5;                   // Bến An Yên hiện trọn
const T_GLOW = 7.3;                     // Ánh sáng ấm tràn khung hình
const TOTAL = 8.5;
const CAPTION = { start: 2.3, end: 6.2, text: 'Căn phòng này lạnh lắm... Để em đưa anh đến nơi chúng mình từng hẹn ước nhé...' };

const SPRITE_W = 42;
const SPRITE_H = 63;
// Vị trí trên khung hình 640x360 (phòng đã cắt ROOM_CROP_Y)
const AN_FEET = { x: 296, y: 200 };
const MIEN_FEET = { x: 350, y: 200 };
const MIEN_FROM_X = 420;
const HAND = { x: 323, y: 172 };        // Điểm hai bàn tay chạm nhau
const WAVE_MAX_R = 720;                 // Đủ phủ kín khung hình từ điểm chạm

const ROW_DOWN = 0;
const ROW_SIDE = 2;                     // Hàng nhìn sang phải; lật ngang để nhìn sang trái

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

interface Dust { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }

const DUST_COLORS = ['#5b3a22', '#7a4e2d', '#9a6a3f', '#3b2616', '#4a3f5c', '#fbbf24', '#fdba74', '#f9a8d4'];

interface HavenTransitionProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm từng đoạn) */
  startAt?: number;
}

export const HavenTransition: React.FC<HavenTransitionProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [captionOn, setCaptionOn] = useState(false);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);
  const startAtRef = useRef(startAt);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh: mưa + quạt case tắt dần → gió ấm, sóng nước, chuông celesta =====
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
    master.gain.setValueAtTime((volumeRef.current / 100) * 0.9, ctx.currentTime);
    master.gain.setValueAtTime((volumeRef.current / 100) * 0.9, at(TOTAL - 0.8));
    master.gain.linearRampToValueAtTime(0, at(TOTAL));
    master.connect(ctx.destination);

    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    const noise = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx!.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx!.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx!.createGain();
      src.connect(f).connect(g).connect(master);
      return { src, g };
    };

    // Phòng trọ: mưa quất vào kính + tiếng ù quạt case, lặng dần khi tường tan
    const fadeOutEnd = T_WAVE + 2.0;
    if (t0 + fadeOutEnd > ctx.currentTime) {
      const rain = noise('bandpass', 2200, 0.4);
      rain.g.gain.setValueAtTime(0.05, at(0));
      rain.g.gain.setValueAtTime(0.05, at(T_WAVE));
      rain.g.gain.linearRampToValueAtTime(0, at(fadeOutEnd));
      rain.src.start(at(0));
      rain.src.stop(at(fadeOutEnd) + 0.1);
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 58;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.035, at(0));
      hg.gain.setValueAtTime(0.035, at(T_WAVE));
      hg.gain.linearRampToValueAtTime(0, at(fadeOutEnd));
      hum.connect(lp).connect(hg).connect(master);
      hum.start(at(0));
      hum.stop(at(fadeOutEnd) + 0.1);
    }

    // Bến An Yên: gió ấm thổi lên + sóng nước vỗ bờ (dâng nhẹ theo nhịp)
    const wind = noise('lowpass', 420, 0.5);
    wind.g.gain.setValueAtTime(0, at(T_WAVE));
    wind.g.gain.linearRampToValueAtTime(0.035, at(T_REVEAL));
    wind.src.start(at(T_WAVE));
    wind.src.stop(at(TOTAL) + 0.1);
    const river = noise('lowpass', 560, 0.7);
    river.g.gain.setValueAtTime(0, at(T_WAVE + 0.5));
    for (let s = T_WAVE + 0.5; s < TOTAL; s += 1.4) {
      river.g.gain.linearRampToValueAtTime(0.04, at(s + 0.6));
      river.g.gain.linearRampToValueAtTime(0.015, at(s + 1.4));
    }
    river.src.start(at(T_WAVE + 0.5));
    river.src.stop(at(TOTAL) + 0.1);

    /** Một nốt celesta: sine + bội âm bậc 4, tắt nhanh như chuông nhỏ */
    const celesta = (when: number, freq: number, gain: number) => {
      if (t0 + when < ctx!.currentTime - 0.01) return;
      for (const [mul, g0] of [[1, gain], [4, gain * 0.18]] as const) {
        const o = ctx!.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mul;
        const g = ctx!.createGain();
        g.gain.setValueAtTime(0, at(when));
        g.gain.linearRampToValueAtTime(g0, at(when) + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, at(when) + 1.6);
        o.connect(g).connect(master);
        o.start(at(when));
        o.stop(at(when) + 1.65);
      }
    };
    // Một nốt khi bàn tay chìa ra, rồi chuỗi celesta đi lên khi vòng sáng lan ra
    celesta(T_HAND, 1046.5, 0.03);
    const arp = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98, 1318.5, 1046.5, 1174.66, 1567.98];
    arp.forEach((f, i) => celesta(T_WAVE + i * 0.32, f, 0.028));
    // Phong linh leng keng thưa thớt khi bến sông hiện ra
    [1568, 1760, 2093, 1975].forEach((f, i) => celesta(T_REVEAL + 0.2 + i * 0.45, f, 0.018));

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
    const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

    const room = document.createElement('canvas');
    room.width = ROOM_314.width;
    room.height = ROOM_314.height;
    const r = room.getContext('2d');
    const light = document.createElement('canvas');
    light.width = ROOM_314.width;
    light.height = ROOM_314.height;
    const world = document.createElement('canvas');
    world.width = BEN_AN_YEN.width;
    world.height = BEN_AN_YEN.height;
    const w = world.getContext('2d');
    if (!r || !w) return;
    r.imageSmoothingEnabled = false;
    w.imageSmoothingEnabled = false;

    const dust: Dust[] = [];
    let raf = 0;
    let last = performance.now();
    let lastCaption = false;
    const start = performance.now() - startAtRef.current * 1000;

    /** Miên: lướt vào từ làn nhiễu (lát cắt lệch ngang, nhấp nháy), rồi đứng yên */
    const drawMien = (t: number) => {
      if (!ready(mien) || t < T_MIEN) return;
      const k = ease((t - T_MIEN) / 1.0);
      const x = MIEN_FROM_X + (MIEN_FEET.x - MIEN_FROM_X) * k - SPRITE_W / 2;
      const y = MIEN_FEET.y - SPRITE_H;
      const noisy = 1 - k;
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.25 + k);
      // Quầng sáng hồng tím quanh Miên
      const halo = ctx.createRadialGradient(x + SPRITE_W / 2, y + 30, 2, x + SPRITE_W / 2, y + 30, 46);
      halo.addColorStop(0, 'rgba(244,114,182,0.32)');
      halo.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 30, y - 20, SPRITE_W + 60, SPRITE_H + 40);
      if (noisy > 0.05) {
        // Đang bước ra khỏi làn nhiễu: vẽ từng lát ngang lệch nhau
        for (let sy = 0; sy < SPRITE_H; sy += 3) {
          const off = (hash(sy + Math.floor(t * 30)) - 0.5) * 18 * noisy;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + off - 2, y + sy, SPRITE_W + 4, 3);
          ctx.clip();
          drawSpriteFrame(ctx, mien, 1, ROW_SIDE, true, x + off, y, SPRITE_W, SPRITE_H);
          ctx.restore();
        }
      } else {
        drawSpriteFrame(ctx, mien, 1, ROW_SIDE, true, x, y, SPRITE_W, SPRITE_H);
      }
      ctx.restore();
    };

    /** An: cúi đầu kiệt sức nhìn xuống, quay sang Miên khi cô chìa tay */
    const drawAn = (t: number) => {
      if (!ready(an)) return;
      const facing = t >= T_HAND - 0.3;
      const slump = facing ? 0 : Math.round(1 + Math.sin(t * 1.6));   // Vai chùng xuống, thở nặng
      drawSpriteFrame(ctx, an, 1, facing ? ROW_SIDE : ROW_DOWN, false, AN_FEET.x - SPRITE_W / 2, AN_FEET.y - SPRITE_H + slump, SPRITE_W, SPRITE_H);
    };

    /** Đốm sáng nơi hai bàn tay chạm nhau */
    const drawHandGlow = (t: number) => {
      if (t < T_HAND) return;
      const k = ease((t - T_HAND) / 0.8);
      const pulse = 1 + Math.sin(t * 6) * 0.15;
      const rad = (6 + 10 * k) * pulse;
      const g = ctx.createRadialGradient(HAND.x, HAND.y, 0, HAND.x, HAND.y, rad * 3);
      g.addColorStop(0, `rgba(255,240,250,${0.95 * k})`);
      g.addColorStop(0.25, `rgba(244,114,182,${0.7 * k})`);
      g.addColorStop(0.6, `rgba(167,139,250,${0.3 * k})`);
      g.addColorStop(1, 'rgba(167,139,250,0)');
      ctx.fillStyle = g;
      ctx.fillRect(HAND.x - rad * 3, HAND.y - rad * 3, rad * 6, rad * 6);
      // Vài hạt sáng nhỏ bay quanh tay
      for (let i = 0; i < 8; i++) {
        const a = t * (1 + hash(i) * 2) + i;
        const rr = 8 + hash(i * 5) * 14 * k;
        px(ctx, HAND.x + Math.cos(a) * rr, HAND.y + Math.sin(a) * rr * 0.6, 1, 1, i % 2 ? '#fde68a' : '#f9a8d4');
      }
    };

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      if (t >= TOTAL) {
        finish();
        return;
      }

      // 1. Phòng 314: đèn bàn yếu, CRT le lói, mưa ngoài cửa sổ
      const crtFlicker = Math.sin(t * 23) > 0.85 ? 0.55 : 1;
      drawRoom314Ending(r, light, t, {
        lamp: 0.35 * crtFlicker,
        crt: true,
        hall: 0.25,
        window: 0.7,
        around: 0.55 + 0.45 * ease((t - T_HAND) / 1),
      }, null, { pose: { x: AN_FEET.x, y: AN_FEET.y + ROOM_CROP_Y - 18 } });
      px(ctx, 0, 0, W, H, '#000');
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(room, 0, ROOM_CROP_Y, W, H, 0, 0, W, H);
      ctx.restore();

      // 2. Vòng sáng lan ra: bên trong vòng là Bến An Yên lúc hoàng hôn
      const waveR = t >= T_WAVE ? WAVE_MAX_R * ease((t - T_WAVE) / (T_REVEAL - T_WAVE)) : 0;
      if (waveR > 0) {
        drawBenAnYenSunset(w, t, { pigeons: true, bridge: true });
        ctx.save();
        ctx.beginPath();
        ctx.arc(HAND.x, HAND.y, waveR, 0, Math.PI * 2);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(world, SUN_CROP.x, SUN_CROP.y, W, H, 0, 0, W, H);
        ctx.restore();
        // Viền sóng sáng cam tím
        if (waveR < WAVE_MAX_R) {
          const ring = ctx.createRadialGradient(HAND.x, HAND.y, Math.max(0, waveR - 26), HAND.x, HAND.y, waveR + 8);
          ring.addColorStop(0, 'rgba(253,186,116,0)');
          ring.addColorStop(0.7, 'rgba(253,186,116,0.55)');
          ring.addColorStop(0.9, 'rgba(216,180,254,0.45)');
          ring.addColorStop(1, 'rgba(216,180,254,0)');
          ctx.fillStyle = ring;
          ctx.fillRect(0, 0, W, H);
          // Sàn và tường vỡ thành bụi pixel ngay mép sóng, bay lên
          const spawn = Math.round(26 * k);
          for (let i = 0; i < spawn; i++) {
            const a = Math.random() * Math.PI * 2;
            const x = HAND.x + Math.cos(a) * waveR;
            const y = HAND.y + Math.sin(a) * waveR;
            if (x < 0 || x > W || y < 0 || y > H) continue;
            dust.push({
              x, y,
              vx: Math.cos(a) * 0.4 + (Math.random() - 0.5) * 0.4,
              vy: -0.5 - Math.random() * 1.1,
              life: 1,
              size: Math.random() < 0.3 ? 3 : 2,
              color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
            });
          }
        }
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.x += d.vx * k;
        d.y += d.vy * k;
        d.vy -= 0.01 * k;
        d.life -= 0.012 * k;
        if (d.life <= 0) {
          dust.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = d.life;
        px(ctx, d.x, d.y, d.size, d.size, d.color);
      }
      ctx.globalAlpha = 1;

      // 3. Hai người vẫn đứng đó, nắm tay nhau giữa căn phòng đang tan
      drawAn(t);
      drawMien(t);
      drawHandGlow(t);

      // 4. Ánh sáng ấm tràn khung hình rồi kết thúc
      const glow = ease((t - T_GLOW) / (TOTAL - T_GLOW));
      if (glow > 0) {
        ctx.fillStyle = `rgba(255,228,196,${glow})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Dải đen điện ảnh: khép lại dần khi hoàng hôn mở ra
      const bars = LETTERBOX * ease(t / 1) * (1 - ease((t - T_REVEAL) / 1.2));
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');

      const cap = t >= CAPTION.start && t < CAPTION.end;
      if (cap !== lastCaption) {
        lastCaption = cap;
        setCaptionOn(cap);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  // Space / Enter / Esc để bỏ qua (bỏ qua phím đang giữ từ hộp thoại trước)
  useEffect(() => {
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - opened < 400) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
      <style>{'@keyframes haven-fade { from { opacity: 0 } to { opacity: 1 } }'}</style>
      <div className="relative w-full aspect-video max-h-full" style={{ maxWidth: 'calc(100vh * 16 / 9)' }}>
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />

        {captionOn && (
          <div className="absolute bottom-[4%] left-1/2 -translate-x-1/2 w-[90%] text-center px-5 py-1" style={{ animation: 'haven-fade 1s ease-out' }}>
            <div className="text-[11px] tracking-[0.25em] text-pink-300/80 font-mono mb-1">{tx('Miên thì thầm')}</div>
            <div className="text-base sm:text-xl italic font-serif text-pink-50 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              &ldquo;{tx(CAPTION.text)}&rdquo;
            </div>
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
