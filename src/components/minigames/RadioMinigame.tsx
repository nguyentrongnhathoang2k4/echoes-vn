"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface RadioMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

/**
 * DÒ SÓNG GIAO THOA (Màn 2) — một thao tác: vặn núm tần số 88.0–108.0 MHz.
 * Màn oscilloscope có sóng mục tiêu vàng nhạt (cố định) và sóng tín hiệu xanh lá (đổi theo tần số đang dò).
 * Dò qua các đài khác: mưa rào, rè rè, nhạc tiền chiến méo. Lại gần 104.5 MHz (Đài Giao thông): sóng xanh
 * dao động mạnh rồi bị "hút" dần vào sóng vàng. Đồng bộ ≥ 90% một nhịp: tiếng rè tắt hẳn, loa phát còi 115
 * và tiếng Miên khóc nghẹn.
 */
const F_MIN = 88;
const F_MAX = 108;
const TARGET = 104.5;
const LOCK_SYNC = 90;
const LOCK_HOLD_S = 1.2;
const PULL_RANGE = 0.2;          // MHz: chỉ hút nhẹ khi đã chỉnh rất sát (không cứu người quét bừa)
const KEY_RATE = 1.6;            // MHz / giây khi giữ A/D
const WHEEL_STEP = 0.1;
const DRAG_RATE = 0.02;          // MHz / px kéo núm
const SCOPE_W = 420;
const SCOPE_H = 140;
// Các đài "nhiễu" trên đường dò
const STATIONS: Array<{ f: number; kind: 'rain' | 'music' }> = [
  { f: 92.3, kind: 'rain' },
  { f: 97.8, kind: 'music' },
];

const syncOf = (f: number) => Math.max(0, Math.round(100 - Math.abs(f - TARGET) * 55));

export const RadioMinigame: React.FC<RadioMinigameProps> = ({ onComplete, onClose, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const freqRef = useRef(90.2);
  const [freq, setFreq] = useState(90.2);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const holdRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<number | null>(null);
  const cbRef = useRef({ onComplete, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onClose };
  }, [onComplete, onClose]);

  // ---------------- Âm thanh: rè nền + đài nhiễu, gain chỉnh theo tần số ----------------
  const audioRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ staticG: GainNode; rainG: GainNode; musicG: GainNode; musicOsc: OscillatorNode } | null>(null);
  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close().catch(() => {});
      ref.current = null;
      nodesRef.current = null;
    };
  }, []);
  const vol = volume / 100;
  const ensureAudio = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current && Ctor) audioRef.current = new Ctor();
      const ctx = audioRef.current;
      if (!ctx) return null;
      if (ctx.state === 'suspended') void ctx.resume();
      if (!nodesRef.current) {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const mkNoise = (type: BiquadFilterType, freq: number) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          const f = ctx.createBiquadFilter();
          f.type = type;
          f.frequency.value = freq;
          const g = ctx.createGain();
          g.gain.value = 0;
          src.connect(f).connect(g).connect(ctx.destination);
          src.start();
          return g;
        };
        const staticG = mkNoise('bandpass', 2200);
        const rainG = mkNoise('lowpass', 900);
        // Nhạc tiền chiến méo: sóng vuông chậm, cao độ chao đảo
        const musicOsc = ctx.createOscillator();
        musicOsc.type = 'square';
        musicOsc.frequency.value = 330;
        const mf = ctx.createBiquadFilter();
        mf.type = 'lowpass';
        mf.frequency.value = 900;
        const musicG = ctx.createGain();
        musicG.gain.value = 0;
        musicOsc.connect(mf).connect(musicG).connect(ctx.destination);
        musicOsc.start();
        nodesRef.current = { staticG, rainG, musicG, musicOsc };
      }
      return ctx;
    } catch {
      return null;
    }
  }, []);
  // Còi 115 réo khi bắt đúng đài
  const playSiren = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(640, t + i * 0.6);
      o.frequency.linearRampToValueAtTime(960, t + i * 0.6 + 0.3);
      o.frequency.linearRampToValueAtTime(640, t + i * 0.6 + 0.6);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * vol, t + 0.3);
    g.gain.setValueAtTime(0.06 * vol, t + 3.2);
    g.gain.linearRampToValueAtTime(0, t + 3.6);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 3.7);
  }, [vol]);

  const tune = useCallback((delta: number) => {
    if (lockedRef.current || delta === 0) return;
    freqRef.current = Math.max(F_MIN, Math.min(F_MAX, freqRef.current + delta));
    holdRef.current = 0;
    setFreq(freqRef.current);
  }, []);

  // ---------------- Chuột / bàn phím ----------------
  const onKnobDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    ensureAudio();
    dragRef.current = e.clientX;
  };
  const onKnobMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) return;
    tune((e.clientX - dragRef.current) * DRAG_RATE);
    dragRef.current = e.clientX;
  };
  const onKnobUp = () => {
    dragRef.current = null;
  };
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      ensureAudio();
      tune(-Math.sign(e.deltaY) * WHEEL_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ensureAudio, tune]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (!lockedRef.current) cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      keysRef.current.add(k);
      ensureAudio();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [ensureAudio]);

  // ---------------- Vòng lặp: phím giữ, lực hút đài, âm thanh, oscilloscope ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const keys = keysRef.current;
      let d = 0;
      if (keys.has('d') || keys.has('arrowright') || keys.has('arrowup')) d += KEY_RATE * dt;
      if (keys.has('a') || keys.has('arrowleft') || keys.has('arrowdown')) d -= KEY_RATE * dt;
      if (d !== 0) tune(d);
      const idle = d === 0 && dragRef.current === null;
      // Lại gần đài: sóng bị hút dần vào (núm tự trôi nhẹ khi người chơi buông tay)
      const off = TARGET - freqRef.current;
      if (!lockedRef.current && idle && Math.abs(off) < PULL_RANGE && Math.abs(off) > 0.01) {
        freqRef.current += off * Math.min(1, dt * 1.5);
        setFreq(freqRef.current);
      }
      const sync = syncOf(freqRef.current);
      if (!lockedRef.current && sync >= LOCK_SYNC && idle) {
        holdRef.current += dt;
        if (holdRef.current >= LOCK_HOLD_S) {
          lockedRef.current = true;
          freqRef.current = TARGET;
          setFreq(TARGET);
          setLocked(true);
          playSiren();
          window.setTimeout(() => cbRef.current.onComplete(), 4200);
        }
      }

      // Âm lượng các lớp tiếng theo tần số đang dò
      const n = nodesRef.current;
      const actx = audioRef.current;
      if (n && actx) {
        const at = actx.currentTime;
        const s = lockedRef.current ? 0 : 1 - sync / 100;
        n.staticG.gain.setTargetAtTime(0.09 * vol * s, at, 0.05);
        const near = (f0: number) => Math.max(0, 1 - Math.abs(freqRef.current - f0) / 0.5);
        n.rainG.gain.setTargetAtTime(lockedRef.current ? 0 : 0.12 * vol * near(STATIONS[0].f), at, 0.05);
        n.musicG.gain.setTargetAtTime(lockedRef.current ? 0 : 0.03 * vol * near(STATIONS[1].f), at, 0.05);
        n.musicOsc.frequency.setTargetAtTime(330 + Math.sin(t * 2.3) * 40 + (Math.sin(t * 0.7) > 0 ? 110 : 0), at, 0.05);
      }

      // ---- Oscilloscope ----
      ctx.fillStyle = '#031a0b';
      ctx.fillRect(0, 0, SCOPE_W, SCOPE_H);
      ctx.strokeStyle = 'rgba(74,222,128,0.12)';
      for (let x = 0; x < SCOPE_W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, SCOPE_H);
        ctx.stroke();
      }
      for (let y = 0; y < SCOPE_H; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(SCOPE_W, y + 0.5);
        ctx.stroke();
      }
      const mid = SCOPE_H / 2;
      const k = sync / 100;
      // Sóng mục tiêu vàng nhạt
      ctx.strokeStyle = 'rgba(253,230,138,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= SCOPE_W; x += 2) {
        const y = mid + Math.sin(x * 0.045 + t * 3) * 34;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Sóng tín hiệu xanh: lệch tần số + nhiễu, càng gần đài càng trùng sóng vàng
      const df = (freqRef.current - TARGET) * 0.018;
      ctx.strokeStyle = lockedRef.current ? '#86efac' : '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= SCOPE_W; x += 2) {
        const noise = (Math.random() - 0.5) * 50 * (1 - k);
        const swing = 1 + (k > 0.5 && k < 0.9 ? Math.sin(t * 25) * 0.35 : 0);
        const y = mid + Math.sin(x * (0.045 + df) + t * 3 + (1 - k) * 2) * 34 * swing + noise;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playSiren, tune, vol]);

  const sync = syncOf(freq);
  const angle = -135 + ((freq - F_MIN) / (F_MAX - F_MIN)) * 270;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 font-mono">
      <div ref={panelRef} className="w-full max-w-xl bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('ĐÀI BÁN DẪN • DƯỚI CỘT ĐÈN')}</div>
          <div className="text-xs text-zinc-500">{tx('Đồng bộ')} {sync}%</div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#2a2420] border-4 border-[#4a3a2a] p-3">
          <div className="flex-1 w-full">
            <canvas ref={canvasRef} width={SCOPE_W} height={SCOPE_H} className="w-full border border-zinc-800" />
            <div className="mt-1 text-center text-lg font-bold text-amber-200 tabular-nums">{freq.toFixed(1)} MHz</div>
          </div>
          {/* Núm dò tần số lớn */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              onPointerDown={onKnobDown}
              onPointerMove={onKnobMove}
              onPointerUp={onKnobUp}
              onPointerCancel={onKnobUp}
              className="relative w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-600 cursor-grab active:cursor-grabbing touch-none"
              style={{ transform: `rotate(${angle}deg)` }}
              title={tx('Kéo ngang hoặc lăn chuột để dò đài')}
            >
              <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-1.5 h-6 bg-zinc-200" />
            </div>
            <div className="text-xs text-zinc-400">{tx('DÒ ĐÀI')}</div>
          </div>
        </div>
        <div className={`text-sm leading-relaxed min-h-10 ${locked ? 'text-red-300' : 'text-zinc-300'}`}>
          {locked
            ? tx('Tiếng rè tắt hẳn. Còi 115 réo inh ỏi, rồi giọng Miên khóc nghẹn: "Bác sĩ ơi... tim anh ấy ngừng đập rồi... Đừng tắt máy thở mà!"')
            : sync >= 60
            ? tx('Sóng xanh giật mạnh, đang bị hút dần vào đường sóng vàng...')
            : Math.abs(freq - STATIONS[0].f) < 0.4
            ? tx('Chỉ có tiếng mưa rào xối xả...')
            : Math.abs(freq - STATIONS[1].f) < 0.4
            ? tx('Một bản nhạc tiền chiến méo mó, chậm như băng cát-xét bị nhão.')
            : tx('Rè rè... Chiếc đài cũ dựng cạnh chiếc ô trong suốt. Vạch dò kẹt đâu đó giữa băng tần FM.')}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>{tx('Kéo núm')}</Key><Key>{tx('Lăn chuột')}</Key><Key>A</Key><Key>D</Key>{tx('Dò tần số')}</span>
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
