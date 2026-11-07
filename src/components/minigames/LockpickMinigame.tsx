"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface LockpickMinigameProps {
  /** Then khoá bật: ngăn kéo mở, lấy nửa đĩa mềm #2 */
  onComplete: () => void;
  /** Bỏ dở bằng Esc: không mất gì */
  onClose: () => void;
  volume?: number;
}

/**
 * LẮNG NGHE Ổ BI CƠ KHÍ (Màn 1) — một thao tác: xoay kim mặt số 0–100 bằng A/D hoặc kéo chuột ngang.
 * Ổ khoá đồng có 2 vạch then chốt, không đánh dấu trên mặt số:
 *   Điểm A: xoay THUẬN (số tăng) chạm đúng vạch → "tách...", kim giật 1px, Miên thì thầm. Dừng ở đó 1 giây.
 *   Điểm B: sau đó xoay NGƯỢC (số giảm) tới vạch thứ hai → "tách", dừng một nhịp → then bật mở.
 * Đang ở bước B mà xoay thuận trở lại → then trượt về, làm lại từ A.
 * Vạch thường chỉ có tiếng kim loại cọ rè rè mờ đục.
 */
type Stage = 'A' | 'B' | 'open';

// Hai vạch then chốt đổi chỗ mỗi lần mở (không học thuộc / tra mạng được): A ∈ [55, 85], B thấp hơn A ít nhất 25 vạch
const rollPoints = () => {
  const a = 55 + Math.round(Math.random() * 30);
  const b = 10 + Math.round(Math.random() * (a - 25 - 10));
  return { a, b };
};
const ZONE = 0.8;             // Sai số quanh vạch then chốt
const HOLD_A_S = 1;
const HOLD_B_S = 0.5;
const KEY_RATE = 9;           // Vạch / giây khi giữ A/D (chậm để kịp nghe)
const DRAG_RATE = 0.06;       // Vạch / px kéo chuột
const BACKSLIP = 2;           // Ở bước B xoay thuận quá chừng này vạch thì then trượt
const SIZE = 260;

export const LockpickMinigame: React.FC<LockpickMinigameProps> = ({ onComplete, onClose, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sim = useRef({
    v: 50, stage: 'A' as Stage, dir: 0, hold: 0, inZone: false, jitter: 0,
    bMin: 100, lastTick: 50, whispered: false,
  });
  const [stage, setStage] = useState<Stage>('A');
  const [points] = useState(rollPoints);
  const [note, setNote] = useState<string>('Xoay thật chậm. Áp tai sát vào mặt ổ khoá.');
  const [whisper, setWhisper] = useState(false);
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<number | null>(null);
  const cbRef = useRef({ onComplete, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onClose };
  }, [onComplete, onClose]);

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
  const noise = useCallback((dur: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass') => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain * vol;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }, [ac, vol]);
  // Rè rè mờ đục: kim loại cọ qua vạch thường (lọc thấp, rất nhỏ)
  const playScrape = useCallback(() => noise(0.04, 600, 0.12, 'lowpass'), [noise]);
  // "Tách...": viên bi rơi vào rãnh — sáng, ngắn, khác hẳn tiếng cọ
  const playTach = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    noise(0.02, 4200, 0.4, 'highpass');
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(3100, t);
    o.frequency.exponentialRampToValueAtTime(2200, t + 0.06);
    g.gain.setValueAtTime(0.09 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  }, [ac, noise, vol]);
  const playClunk = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.14);
    g.gain.setValueAtTime(0.14 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.2);
    noise(0.5, 450, 0.3, 'lowpass');
  }, [ac, noise, vol]);
  // Tiếng thì thầm rất khẽ của Miên (hơi thở qua lọc dải)
  const playWhisper = useCallback(() => noise(1.4, 1100, 0.08), [noise]);

  const move = useCallback((delta: number) => {
    const s = sim.current;
    if (s.stage === 'open' || delta === 0) return;
    const prev = s.v;
    s.v = Math.max(0, Math.min(100, s.v + delta));
    s.dir = Math.sign(s.v - prev);
    s.hold = 0;
    // Tiếng cọ mỗi lần kim đi qua một vạch nguyên
    if (Math.floor(s.v) !== Math.floor(s.lastTick)) {
      s.lastTick = s.v;
      playScrape();
    }
    if (s.stage === 'B') {
      s.bMin = Math.min(s.bMin, s.v);
      if (s.v - s.bMin > BACKSLIP) {
        s.stage = 'A';
        s.bMin = 100;
        setStage('A');
        setNote('Xoay ngược chiều rồi... then thứ nhất trượt về chỗ cũ. Làm lại từ đầu.');
        playScrape();
      }
    }
  }, [playScrape]);

  // ---------------- Chuột / bàn phím ----------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    void ac();
    dragRef.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current === null) return;
    move((e.clientX - dragRef.current) * DRAG_RATE);
    dragRef.current = e.clientX;
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (sim.current.stage !== 'open') cbRef.current.onClose();
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

  // ---------------- Vòng lặp ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const toAngle = (v: number) => (-225 + (v / 100) * 270) * (Math.PI / 180);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      const keys = keysRef.current;
      let d = 0;
      if (keys.has('d') || keys.has('arrowright')) d += KEY_RATE * dt;
      if (keys.has('a') || keys.has('arrowleft')) d -= KEY_RATE * dt;
      if (d !== 0) move(d);
      const still = d === 0 && dragRef.current === null;

      // Vạch then chốt của bước hiện tại, chỉ "ăn" khi xoay đúng chiều
      const target = s.stage === 'A' ? points.a : points.b;
      const rightDir = s.stage === 'A' ? 1 : -1;
      const inZone = s.stage !== 'open' && Math.abs(s.v - target) <= ZONE;
      if (inZone && !s.inZone && s.dir === rightDir) {
        playTach();
        s.jitter = 0.25;
        if (s.stage === 'A' && !s.whispered) {
          s.whispered = true;
          playWhisper();
          setWhisper(true);
          window.setTimeout(() => setWhisper(false), 3200);
        }
      }
      s.inZone = inZone && (s.inZone || s.dir === rightDir);
      if (s.inZone && still) {
        s.hold += dt;
        if (s.stage === 'A' && s.hold >= HOLD_A_S) {
          s.stage = 'B';
          s.hold = 0;
          s.bMin = s.v;
          s.inZone = false;
          playClunk();
          setStage('B');
          setNote('Cạch khẽ. Then thứ nhất nhả ra... còn một nấc nữa.');
        } else if (s.stage === 'B' && s.hold >= HOLD_B_S) {
          s.stage = 'open';
          playClunk();
          setStage('open');
          setNote('Then khoá bật. Ngăn kéo trượt ra một khe.');
          window.setTimeout(() => cbRef.current.onComplete(), 1400);
        }
      }
      s.jitter = Math.max(0, s.jitter - dt);

      // ---- Vẽ mặt ổ khoá đồng ----
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#1c1410';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#7c5a24';
      ctx.beginPath();
      ctx.arc(cx, cy, 112, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a07a35';
      ctx.beginPath();
      ctx.arc(cx, cy, 100, 0, Math.PI * 2);
      ctx.fill();
      // Rỉ xanh đồng
      for (let i = 0; i < 40; i++) {
        const a = i * 2.4;
        const r = 30 + ((i * 37) % 68);
        ctx.fillStyle = 'rgba(64,110,90,0.35)';
        ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
      }
      // Vạch chia 0–100 (không đánh dấu vạch then chốt)
      ctx.strokeStyle = '#2a1d0c';
      for (let v = 0; v <= 100; v += 2) {
        const a = toAngle(v);
        const long = v % 10 === 0;
        ctx.lineWidth = long ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 94, cy + Math.sin(a) * 94);
        ctx.lineTo(cx + Math.cos(a) * (long ? 80 : 86), cy + Math.sin(a) * (long ? 80 : 86));
        ctx.stroke();
        if (long) {
          ctx.fillStyle = '#2a1d0c';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(v), cx + Math.cos(a) * 68, cy + Math.sin(a) * 68 + 3);
        }
      }
      ctx.lineWidth = 1;
      // Lỗ khoá giữa
      ctx.fillStyle = '#0a0705';
      ctx.beginPath();
      ctx.arc(cx, cy - 6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 3, cy - 6, 6, 20);
      // Kim chỉ vạch (giật 1px khi trúng vạch then chốt)
      const j = s.jitter > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      const a = toAngle(s.v);
      ctx.strokeStyle = s.stage === 'open' ? '#86efac' : '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + j, cy);
      ctx.lineTo(cx + Math.cos(a) * 88 + j, cy + Math.sin(a) * 88);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [move, playClunk, playTach, playWhisper, points]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 font-mono">
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('Ổ KHOÁ HỘC BÀN')}</div>
          <div className="text-xs text-zinc-500">{stage === 'open' ? tx('Đã mở') : stage === 'B' ? tx('Then 1/2') : tx('Then 0/2')}</div>
        </div>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="w-full border border-zinc-800 cursor-ew-resize touch-none"
        />
        {/* Miên thì thầm rất khẽ khi kim chạm vạch đầu tiên */}
        <div className="min-h-5 text-xs italic text-zinc-500 transition-opacity duration-700" style={{ opacity: whisper ? 1 : 0 }}>
          {tx('"Ngăn kéo này... đừng mở ra..."')}
        </div>
        <div className={`text-sm leading-relaxed min-h-10 ${stage === 'open' ? 'text-emerald-300' : 'text-zinc-300'}`}>{tx(note)}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>A</Key><Key>D</Key><Key>{tx('Kéo ngang')}</Key>{tx('Xoay kim')}</span>
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
