'use client';
import React, { useEffect, useRef, useCallback } from 'react';
import { px, hash } from './pixel/pixelKit';
import { drawSpriteFrame } from './pixel/spriteKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from './SunsetStage';
import { tx } from '../locales/tx';

// =====================================================================
// CHUYỂN CẢNH MÀN 2 → MÀN 3: "MẶT TRỜI VỠ RA" (~9 giây, bỏ qua được)
// Bến An Yên lúc hoàng hôn → Miên tan thành hạt sáng → mặt trời nứt →
// vỡ thành mảnh kính rơi xuống sông, không một tiếng động → trời tắt màu,
// cây cầu gỗ trôi đi → từ rất xa, tiếng còi xe cấp cứu.
// =====================================================================

const W = 640;
const H = 360;
const LETTERBOX = 30;
const CROP = { x: 80, y: 30 };          // Toàn cảnh 1:1, mặt trời ở giữa khung

const T_MIEN_FADE = 0.5;                // Miên bắt đầu tan
const T_CRACK = 1.6;                    // Mặt trời nứt
const T_SHATTER = 3.0;                  // Vỡ — mọi âm thanh tắt phụt
const T_BRIDGE = 4.0;                   // Cây cầu trôi đi
const T_SIREN = 5.5;                    // Còi cấp cứu vọng lên
const T_FADE = 7.8;
const TOTAL = 9;

const SPRITE_W = 42;
const SPRITE_H = 63;

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };

/** Đường thẳng pixel (từng ô vuông, không khử răng cưa) */
function pxLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, size = 1) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    px(ctx, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), size, size, color);
  }
}

// Vết nứt trên mặt trời: 8 nhánh gãy khúc toả lên từ một điểm gần tâm (toạ độ tương đối, y âm = lên trên)
const CRACKS: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>> = Array.from({ length: 8 }, (_, i) => {
  const pts = [{ x: 0, y: 0 }];
  let a = -Math.PI * (0.06 + 0.88 * (i / 7));
  let x = 0;
  let y = 0;
  for (let s = 0; s < 6; s++) {
    a += (hash(i * 13 + s) - 0.5) * 0.9;
    const len = 6 + hash(i * 7 + s) * 6;
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    pts.push({ x, y });
  }
  return pts;
});

interface Shard { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; splash: number }

/** Mảnh vỡ của mặt trời và mảng trời quanh nó */
function createShards(): Shard[] {
  const { sun } = BEN_AN_YEN;
  const colors = ['#fff1c1', '#fed7aa', '#fb7185', '#f472b6', '#fdba74', '#e07a8f', '#9d4a8e'];
  return Array.from({ length: 46 }, (_, i) => {
    const a = hash(i * 3) * Math.PI;                    // Nửa trên (mặt trời đang lặn)
    const r = hash(i * 7) * (sun.r + 30);
    return {
      x: sun.x + Math.cos(a) * r * (hash(i) > 0.5 ? 1 : -1),
      y: sun.y - Math.sin(a) * r,
      vx: (hash(i * 11) - 0.5) * 0.8,
      vy: -hash(i * 13) * 0.6,
      rot: hash(i * 17) * Math.PI,
      vr: (hash(i * 19) - 0.5) * 0.12,
      size: 4 + Math.floor(hash(i * 23) * 9),
      color: colors[i % colors.length],
      splash: 0,
    };
  });
}

interface SunBreakTransitionProps {
  onComplete: () => void;
  volume?: number;
  /** Bắt đầu từ giây thứ N (dùng khi thử nghiệm) */
  startAt?: number;
}

export const SunBreakTransition: React.FC<SunBreakTransitionProps> = ({ onComplete, volume = 80, startAt = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);
  const volumeRef = useRef(volume);
  const startAtRef = useRef(startAt);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // ===== Âm thanh: sông + phong linh → im bặt khi mặt trời vỡ → còi cấp cứu xa =====
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

    if (t0 + T_SHATTER > ctx.currentTime) {
      // Tiếng sông
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const water = ctx.createBufferSource();
      water.buffer = buf;
      water.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const wg = ctx.createGain();
      wg.gain.value = 0.03;
      water.connect(lp).connect(wg).connect(master);
      water.start(at(0));
      water.stop(at(T_SHATTER));
      // Phong linh leng keng, lệch dần trong lúc mặt trời nứt
      for (let i = 0; i < 7; i++) {
        const when = 0.2 + i * 0.4;
        if (when >= T_SHATTER) break;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = [1568, 1760, 2093, 1975, 1760, 1661, 1480][i] * (when > T_CRACK ? 0.97 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at(when));
        g.gain.linearRampToValueAtTime(0.03, at(when) + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, Math.min(at(when) + 1.2, at(T_SHATTER)));
        o.connect(g).connect(master);
        o.start(at(when));
        o.stop(Math.min(at(when) + 1.25, at(T_SHATTER) + 0.01));
      }
    }
    // Còi xe cấp cứu vọng lên từ rất xa
    if (t0 + TOTAL > ctx.currentTime) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(i % 2 === 0 ? 660 : 880, at(T_SIREN + i * 0.5));
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at(T_SIREN));
      g.gain.linearRampToValueAtTime(0.045, at(TOTAL - 0.4));
      g.gain.linearRampToValueAtTime(0, at(TOTAL));
      o.connect(lp).connect(g).connect(master);
      o.start(at(T_SIREN));
      o.stop(at(TOTAL) + 0.05);
    }
    return () => {
      void ctx?.close();
    };
  }, []);

  // ===== Vẽ =====
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
    // Bến không có cầu (để lấp chỗ cầu cũ) + lớp chỉ có cây cầu (để nó trôi đi)
    const B = BEN_AN_YEN.bridge;
    const BR = { x: B.x - 14, y: B.y - 24, w: B.w + 28, h: B.h + 40 };   // Cầu + cột, bồ câu, hộp nhạc
    const noBridge = document.createElement('canvas');
    noBridge.width = BEN_AN_YEN.width;
    noBridge.height = BEN_AN_YEN.height;
    const nb = noBridge.getContext('2d');
    const bridgeOnly = document.createElement('canvas');
    bridgeOnly.width = BR.w;
    bridgeOnly.height = BR.h;
    const bo = bridgeOnly.getContext('2d');
    let bridgeTaken = false;
    const shards = createShards();
    const { sun, mien: M } = BEN_AN_YEN;
    const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

    let raf = 0;
    let last = performance.now();
    const start = performance.now() - startAtRef.current * 1000;
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      if (t >= TOTAL) {
        finish();
        return;
      }
      // Sau khi vỡ, thời gian của thế giới đứng lại (mây, nước thôi trôi)
      drawBenAnYenSunset(w, Math.min(t, T_SHATTER));

      // Cây cầu gỗ tách khỏi bờ và trôi đi
      if (t >= T_BRIDGE && nb && bo) {
        if (!bridgeTaken) {
          // Thời gian đã đứng lại từ lúc vỡ nên hai bản vẽ trùng khớp: điểm nào khác nhau là thuộc cây cầu
          nb.imageSmoothingEnabled = false;
          drawBenAnYenSunset(nb, T_SHATTER, { bridge: false });
          const withB = w.getImageData(BR.x, BR.y, BR.w, BR.h);
          const without = nb.getImageData(BR.x, BR.y, BR.w, BR.h);
          const a = withB.data;
          const b = without.data;
          for (let i = 0; i < a.length; i += 4) {
            if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) < 12) a[i + 3] = 0;
          }
          bo.putImageData(withB, 0, 0);
          bridgeTaken = true;
        }
        const drift = ease((t - T_BRIDGE) / 3.5);
        // Chỗ cầu cũ lấp bằng chính bến không cầu (biển tên, bờ xa, mặt sông, kè đá còn nguyên)
        w.drawImage(noBridge, BR.x, BR.y, BR.w, BR.h, BR.x, BR.y, BR.w, BR.h);
        w.globalAlpha = 1 - drift;
        w.drawImage(bridgeOnly, BR.x + drift * 120, BR.y + drift * 18);
        w.globalAlpha = 1;
      }

      // An đứng quay lưng nhìn về phía mặt trời; Miên tan dần thành hạt sáng
      if (ready(an)) drawSpriteFrame(w, an, 1, 1, false, M.x - 70, M.y + 24, SPRITE_W, SPRITE_H);
      const mienA = 1 - ease((t - T_MIEN_FADE) / 1.6);
      if (ready(mien) && mienA > 0) {
        w.globalAlpha = mienA;
        drawSpriteFrame(w, mien, 1, 0, false, M.x, M.y, SPRITE_W, SPRITE_H);
        w.globalAlpha = 1;
      }
      if (t > T_MIEN_FADE && t < T_MIEN_FADE + 3) {
        for (let i = 0; i < 30; i++) {
          const p = (t - T_MIEN_FADE) * (0.5 + hash(i) * 0.6);
          const x = M.x + 6 + hash(i * 3) * 30 + Math.sin(t * 2 + i) * 4;
          const y = M.y + 10 + hash(i * 5) * 50 - p * 40;
          w.globalAlpha = Math.max(0, 1 - p / 1.6);
          px(w, x, y, 2, 2, i % 2 ? '#f9a8d4' : '#fde68a');
        }
        w.globalAlpha = 1;
      }

      // Mặt trời nứt: khe nứt tối viền trắng nóng lan dần trong lòng mặt trời, ánh sáng gắt lên trước khi vỡ
      if (t >= T_CRACK && t < T_SHATTER) {
        const c = ease((t - T_CRACK) / (T_SHATTER - T_CRACK));
        w.save();
        w.beginPath();
        w.arc(sun.x, sun.y, sun.r, Math.PI, 0);
        w.closePath();
        w.clip();
        // Lõi mặt trời chói dần, chập chờn
        const glare = w.createRadialGradient(sun.x, sun.y - 14, 2, sun.x, sun.y - 14, sun.r);
        const flick = 0.75 + Math.sin(t * 40) * 0.25;
        glare.addColorStop(0, `rgba(255,255,240,${0.75 * c * flick})`);
        glare.addColorStop(1, 'rgba(255,240,220,0)');
        w.fillStyle = glare;
        w.fillRect(sun.x - sun.r, sun.y - sun.r, sun.r * 2, sun.r);
        const ox = sun.x + 4;
        const oy = sun.y - 14;
        const reach = c * 6;                       // Số đoạn đã lan (có phần lẻ)
        for (const crack of CRACKS) {
          for (let sgi = 0; sgi < crack.length - 1 && sgi < reach; sgi++) {
            const a = crack[sgi];
            const b = crack[sgi + 1];
            const f = Math.min(1, reach - sgi);
            const bx = a.x + (b.x - a.x) * f;
            const by = a.y + (b.y - a.y) * f;
            pxLine(w, ox + a.x, oy + a.y, ox + bx, oy + by, '#3b0a1e', 2);
            pxLine(w, ox + a.x + 1, oy + a.y - 1, ox + bx + 1, oy + by - 1, '#fffbe8', 1);
          }
        }
        w.restore();
      }

      // Vỡ: bầu trời tắt màu, chỗ mặt trời thành lỗ đen, mảnh kính rơi xuống sông không tiếng động
      if (t >= T_SHATTER) {
        const dk = ease((t - T_SHATTER) / 2.2);
        w.fillStyle = `rgba(8,0,16,${0.88 * dk})`;
        w.fillRect(0, 0, BEN_AN_YEN.width, BEN_AN_YEN.horizon);
        // Chỗ mặt trời thành hố tối sâu, viền than hồng âm ỉ rồi tàn dần
        const hole = w.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, sun.r * 0.92);
        hole.addColorStop(0, '#000000');
        hole.addColorStop(0.75, '#07010d');
        hole.addColorStop(1, '#1a0614');
        w.fillStyle = hole;
        w.beginPath();
        w.arc(sun.x, sun.y, sun.r * 0.92, Math.PI, 0);
        w.fill();
        const ember = 1 - ease((t - T_SHATTER) / 3.5);
        if (ember > 0) {
          for (let i = 0; i < 40; i++) {
            const a = Math.PI + (i / 39) * Math.PI;
            if (hash(i * 7 + Math.floor(t * 6)) < 0.35) continue;    // Than lập loè
            const rr = sun.r * 0.92 + (hash(i * 3) - 0.5) * 3;
            w.globalAlpha = ember * (0.5 + hash(i) * 0.5);
            px(w, sun.x + Math.cos(a) * rr, sun.y + Math.sin(a) * rr, 2, 2, i % 3 ? '#fb7185' : '#fdba74');
          }
          w.globalAlpha = 1;
        }
        // Phần còn lại của thế giới cũng tối dần
        w.fillStyle = `rgba(8,0,16,${0.45 * dk})`;
        w.fillRect(0, BEN_AN_YEN.horizon, BEN_AN_YEN.width, BEN_AN_YEN.height);
        for (const s of shards) {
          if (s.splash > 0) {
            // Gợn nước tròn nơi mảnh kính chìm xuống
            s.splash += k;
            const r = s.splash * 0.6;
            if (r < 16) {
              w.strokeStyle = `rgba(255,220,230,${0.5 * (1 - r / 16)})`;
              w.beginPath();
              w.ellipse(s.x, BEN_AN_YEN.riverTop + 30, r, r * 0.3, 0, 0, Math.PI * 2);
              w.stroke();
            }
            continue;
          }
          s.vy += 0.09 * k;
          s.x += s.vx * k;
          s.y += s.vy * k;
          s.rot += s.vr * k;
          if (s.y > BEN_AN_YEN.riverTop + 30) {
            s.splash = 1;
            continue;
          }
          w.save();
          w.translate(s.x, s.y);
          w.rotate(s.rot);
          w.fillStyle = s.color;
          w.beginPath();
          w.moveTo(-s.size / 2, -s.size / 3);
          w.lineTo(s.size / 2, -s.size / 2);
          w.lineTo(s.size / 4, s.size / 2);
          w.closePath();
          w.fill();
          w.fillStyle = 'rgba(255,255,255,0.5)';
          w.fillRect(-1, -1, 2, 1);
          w.restore();
        }
      }

      px(ctx, 0, 0, W, H, '#000');
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      // Khung hình rung nhẹ, mạnh dần khi mặt trời sắp vỡ
      if (t >= T_CRACK && t < T_SHATTER + 0.25) {
        const sh = 2.5 * ease((t - T_CRACK) / (T_SHATTER - T_CRACK));
        ctx.translate(Math.round((Math.random() - 0.5) * 2 * sh), Math.round((Math.random() - 0.5) * 2 * sh));
      }
      ctx.drawImage(world, CROP.x, CROP.y, W, H, 0, 0, W, H);
      ctx.restore();
      // Khoảnh khắc vỡ: một chớp trắng rồi tắt lịm (không một tiếng động)
      const flash = t >= T_SHATTER ? 1 - ease((t - T_SHATTER) / 0.45) : 0;
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,248,235,${0.85 * flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Tối hẳn ở cuối, chuyển sang card Chương III
      const fade = ease((t - T_FADE) / (TOTAL - T_FADE));
      if (fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${fade})`;
        ctx.fillRect(0, 0, W, H);
      }
      const bars = LETTERBOX * ease(t / 1);
      px(ctx, 0, 0, W, bars, '#000');
      px(ctx, 0, H - bars, W, bars, '#000');
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
