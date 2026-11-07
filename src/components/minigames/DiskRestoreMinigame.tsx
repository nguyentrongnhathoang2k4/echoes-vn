"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface DiskRestoreMinigameProps {
  /** Hai nửa phim từ khớp đúng góc: đĩa liền lại thành aura_disk */
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
  /** Đoán bừa sai (chập điện, ghép nhầm mảnh, cót bật...): trang trừ Sanity */
  onPenalty?: () => void;
}

/**
 * GHÉP MA TRẬN TỪ TÍNH (Màn 1) — một màn hình, một thao tác: xoay nửa phim từ bên phải.
 * Mặt cắt đĩa phim nâu chia đôi theo vết nứt. Nửa trái cố định, in đoạn mã bị cắt "AU".
 * Nửa phải xoay được 0–360°, trên đó có nhiều mảnh mã (mồi nhử) và đúng một mảnh "RA_314".
 * Lời giải: xoay tới khi chữ đọc liền thành "AURA_314" và vết xước hai nửa nối thẳng hàng (134° ± 3°).
 * Không hiện góc đích, người chơi phải đọc chữ. Nhãn đĩa chỉ còn "AURA_3__" (phòng 314) để phân biệt mảnh thật.
 * Chống quét bừa: góc xuất phát ngẫu nhiên; dừng đúng chỗ một mảnh mồi (AURA_000, AURE_0F1...) thì đầu từ
 * rít lên, nửa phim bị đẩy văng lệch đi và trừ Sanity.
 */
const W = 420;
const H = 300;
const C = { x: 210, y: 150 };
const R = 118;
const TARGET = 134;
const TOL = 4;
const LOCK_HOLD_S = 0.6;
const WHEEL_STEP = 2;
const KEY_RATE = 30;          // Độ / giây khi giữ A/D
// Mảnh mã trên nửa phải (góc đặt tính theo hệ toạ độ của nửa phải; mảnh đúng nằm ngay mép vết nứt khi xoay đúng)
const FRAGMENTS: Array<{ text: string; at: number; r: number; real?: boolean }> = [
  { text: 'RA_314', at: -TARGET, r: 0, real: true },
  { text: 'RE_0F1', at: -TARGET + 72, r: 0 },
  { text: 'XX_211', at: -TARGET + 150, r: 0 },
  { text: 'RA_000', at: -TARGET + 215, r: 0 },
  { text: 'ME_N__', at: -TARGET + 288, r: 0 },
];

const norm = (a: number) => ((a % 360) + 360) % 360;
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return Math.min(d, 360 - d);
};
// Góc mà mỗi mảnh mồi nằm ngay mép vết nứt
const DECOY_ANGLES = FRAGMENTS.filter((f) => !f.real).map((f) => norm(-f.at));
// Góc xuất phát ngẫu nhiên, cách mọi điểm khớp (thật lẫn mồi) ít nhất 25°
const rollStartAngle = () => {
  for (;;) {
    const a = Math.round(Math.random() * 360);
    if (FRAGMENTS.every((f) => angleDiff(a, norm(-f.at)) >= 25)) return a;
  }
};

export const DiskRestoreMinigame: React.FC<DiskRestoreMinigameProps> = ({ onComplete, onClose, onPenalty, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [startAngle] = useState(rollStartAngle);
  const angleRef = useRef(startAngle);
  const [angle, setAngle] = useState(startAngle);
  const [rejected, setRejected] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const holdRef = useRef(0);
  const dragRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const lastTickRef = useRef(0);
  const cbRef = useRef({ onComplete, onClose, onPenalty });
  useEffect(() => {
    cbRef.current = { onComplete, onClose, onPenalty };
  }, [onComplete, onClose, onPenalty]);

  // ---------------- Âm thanh ----------------
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close().catch(() => {});
      ref.current = null;
    };
  }, []);
  const ac = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current && Ctor) audioRef.current = new Ctor();
      if (audioRef.current?.state === 'suspended') void audioRef.current.resume();
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);
  const vol = volume / 100;
  const blip = useCallback((f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'square') => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }, [ac, vol]);
  // Lạch cạch nhẹ mỗi vài độ xoay (như phim từ cọ vào vỏ)
  const tick = useCallback(() => {
    const now = performance.now();
    if (now - lastTickRef.current < 45) return;
    lastTickRef.current = now;
    blip(1700 + Math.random() * 300, 1200, 0.025, 0.035);
  }, [blip]);
  // Ghép nhầm mảnh mồi: đầu từ rít khàn
  const playReject = useCallback(() => {
    blip(260, 80, 0.4, 0.16, 'sawtooth');
    blip(1500, 400, 0.14, 0.08);
  }, [blip]);
  // CẠCH: kim loại đanh gọn khi khớp
  const playLock = useCallback(() => {
    blip(2400, 700, 0.09, 0.14);
    blip(180, 70, 0.16, 0.16);
  }, [blip]);

  const rotate = useCallback((delta: number) => {
    if (doneRef.current || delta === 0) return;
    angleRef.current = norm(angleRef.current + delta);
    holdRef.current = 0;
    setAngle(angleRef.current);
    tick();
  }, [tick]);

  // ---------------- Chuột ----------------
  const pointerAngle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - C.x;
    const y = ((e.clientY - r.top) / r.height) * H - C.y;
    return (Math.atan2(y, x) * 180) / Math.PI;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    void ac();
    dragRef.current = pointerAngle(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === null) return;
    const a = pointerAngle(e);
    let d = a - dragRef.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    dragRef.current = a;
    rotate(d);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      void ac();
      rotate(Math.sign(e.deltaY) * WHEEL_STEP);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [ac, rotate]);

  // ---------------- Bàn phím ----------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (!doneRef.current) cbRef.current.onClose();
        return;
      }
      if (['a', 'd', 'w', 's', 'e', 'i', 'tab', ' ', 'enter', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
      keysRef.current.add(k);
      void ac();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [ac]);

  // ---------------- Vòng lặp: phím giữ + kiểm tra khớp + vẽ ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();

    // Phim từ: rãnh đồng tâm + vết xước chéo (cùng một hệ toạ độ cho hai nửa: khớp góc là xước liền)
    const drawFilm = (rot: number, right: boolean, lit: number) => {
      ctx.save();
      ctx.translate(C.x, C.y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.fillStyle = '#4a2a12';
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 26; r < R; r += 6) {
        ctx.strokeStyle = r % 12 ? 'rgba(150,95,50,0.28)' : 'rgba(30,14,4,0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(214,180,140,0.45)';
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(-R, k * 22 - 30);
        ctx.lineTo(R, k * 22 + 18);
        ctx.stroke();
      }
      // Khối dữ liệu hex mờ rải trên phim
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(214,180,140,0.35)';
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rr = 86 + (i % 3) * 8;
        ctx.fillText(((i * 37 + 11) % 256).toString(16).toUpperCase().padStart(2, '0'), Math.cos(a) * rr - 6, Math.sin(a) * rr + 3);
      }
      if (right) {
        // Mảnh mã của nửa phải: mỗi mảnh xoay theo phim; mảnh đúng nằm ngang ngay mép nứt khi khớp
        ctx.font = 'bold 15px monospace';
        for (const f of FRAGMENTS) {
          ctx.save();
          ctx.rotate((f.at * Math.PI) / 180);
          ctx.fillStyle = f.real && lit > 0 ? `rgba(134,239,172,${0.6 + lit * 0.4})` : 'rgba(235,215,180,0.85)';
          ctx.fillText(f.text, 16, 5);
          ctx.restore();
        }
      } else {
        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = lit > 0 ? `rgba(134,239,172,${0.6 + lit * 0.4})` : 'rgba(235,215,180,0.85)';
        ctx.textAlign = 'right';
        ctx.fillText('AU', -16, 5);
        ctx.textAlign = 'left';
      }
      // Lõi kim loại giữa đĩa
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-12, -12, 24, 24);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    };

    // Nửa trái / phải: cắt theo vết nứt dọc hơi nghiêng qua tâm
    const half = (right: boolean) => {
      ctx.beginPath();
      if (right) {
        ctx.moveTo(C.x + 4, 0);
        ctx.lineTo(W, 0);
        ctx.lineTo(W, H);
        ctx.lineTo(C.x - 4, H);
      } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(C.x + 4, 0);
        ctx.lineTo(C.x - 4, H);
        ctx.lineTo(0, H);
      }
      ctx.closePath();
    };

    let litT = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      let d = 0;
      if (keys.has('a') || keys.has('arrowleft')) d -= KEY_RATE * dt;
      if (keys.has('d') || keys.has('arrowright')) d += KEY_RATE * dt;
      if (d !== 0) rotate(d);

      // Khớp đúng góc và đứng yên một nhịp: CẠCH
      // Giữ chuột trên đĩa mà không xoay cũng tính là đứng yên
      if (!doneRef.current && angleDiff(angleRef.current, TARGET) <= TOL && d === 0) {
        holdRef.current += dt;
        if (holdRef.current >= LOCK_HOLD_S) {
          doneRef.current = true;
          angleRef.current = TARGET;
          setAngle(TARGET);
          setDone(true);
          playLock();
          window.setTimeout(() => cbRef.current.onComplete(), 1500);
        }
      } else if (!doneRef.current && d === 0 && DECOY_ANGLES.some((a) => angleDiff(angleRef.current, a) <= TOL)) {
        // Dừng đúng chỗ một mảnh mồi: ghép nhầm, nửa phim bị đẩy văng lệch đi
        holdRef.current += dt;
        if (holdRef.current >= LOCK_HOLD_S) {
          holdRef.current = 0;
          playReject();
          angleRef.current = norm(angleRef.current + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 80));
          setAngle(angleRef.current);
          setRejected(true);
          window.setTimeout(() => setRejected(false), 2600);
          cbRef.current.onPenalty?.();
        }
      }
      if (doneRef.current) litT = Math.min(1, litT + dt * 2);

      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, W, H);
      // Vỏ đĩa đen
      ctx.fillStyle = '#0c0c0e';
      ctx.fillRect(C.x - R - 14, C.y - R - 14, (R + 14) * 2, (R + 14) * 2);
      ctx.save();
      half(false);
      ctx.clip();
      drawFilm(0, false, litT);
      ctx.restore();
      ctx.save();
      half(true);
      ctx.clip();
      drawFilm(angleRef.current, true, litT);
      ctx.restore();
      // Vết nứt
      ctx.strokeStyle = doneRef.current ? `rgba(134,239,172,${0.4 + litT * 0.5})` : '#020202';
      ctx.lineWidth = doneRef.current ? 1 : 3;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const y = (H * i) / 24;
        const x = C.x + 4 - (8 * i) / 24 + (i % 2 ? 1.5 : -1.5);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playLock, playReject, rotate]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-3 font-mono overflow-y-auto">
      <div className="w-full max-w-lg my-auto bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('GHÉP MA TRẬN TỪ TÍNH')}</div>
          <div className="text-xs text-zinc-500 tabular-nums">{Math.round(angle)}°</div>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="w-full border border-zinc-800 cursor-grab active:cursor-grabbing touch-none"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className={`text-sm leading-relaxed min-h-10 ${done ? 'text-emerald-300' : rejected ? 'text-red-300' : 'text-zinc-300'}`}>
          {done
            ? tx('CẠCH. Đoạn mã liền lại: AURA_314. Hai nửa phim khớp khít, đĩa mềm nguyên vẹn trở lại.')
            : rejected
            ? tx('Rè rè! Đoạn mã ghép vào không khớp, đầu từ rít lên rồi đẩy văng nửa phim lệch đi. Đọc kỹ chữ đã.')
            : tx('Đĩa gãy đôi, nửa phim bên phải lệch khỏi rãnh. Nhãn giấy trên vỏ chỉ còn nét bút dạ mờ: "AURA_3__".')}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>{tx('Kéo chuột')}</Key><Key>{tx('Lăn chuột')}</Key><Key>A</Key><Key>D</Key>{tx('Xoay nửa phim bên phải')}</span>
          <span><Key>Esc</Key>{tx('Thoát')}</span>
        </div>
      </div>
    </div>
  );
};

/** Ô phím bấm trong dòng hướng dẫn */
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block min-w-6 px-1.5 py-0.5 mr-1 text-center text-zinc-100 bg-zinc-800 border border-zinc-600">{children}</span>
);
