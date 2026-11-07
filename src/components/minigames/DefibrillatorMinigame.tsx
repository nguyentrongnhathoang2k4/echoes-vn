"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface DefibrillatorMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  /** Bấm trượt nhịp: tim rơi vào vô tâm thu, trang ngoài trừ Sanity */
  onMiss?: () => void;
  volume?: number;
}

/**
 * ĐỒNG BỘ ĐỈNH SÓNG R (Màn 3) — một thao tác: Space hoặc click đúng lúc.
 * Máy tự nạp tụ (tiếng rít tăng dần) → READY. Sóng rung thất chạy từ phải sang trái, thỉnh thoảng có một
 * đỉnh R co thắt cao vút. Bấm đúng lúc đỉnh R đi qua vạch đồng bộ đỏ giữa màn hình = một cú sốc trúng.
 * Trượt: vô tâm thu 2 giây (tút dài, phòng rung, −Sanity), máy tự nạp mức cao hơn (200J → 300J → 360J).
 * Đủ 3 cú sốc trúng: loé trắng, nhịp xoang đều 72 BPM.
 */
type Phase = 'charging' | 'ready' | 'shocked' | 'flatline' | 'success';

const ENERGY = [200, 300, 360] as const;
const SHOCKS_NEEDED = 3;
const CHARGE_S = 1.6;
const W = 480;
const H = 170;
const SYNC_X = W / 2;
const SCROLL = 170;            // px / giây
const HIT_WINDOW = 14;         // px quanh vạch đồng bộ
const R_GAP_MIN = 0.9;         // Giây giữa hai đỉnh R
const R_GAP_MAX = 1.7;
const FLATLINE_S = 2;
const REST_S = 1.1;
const SUCCESS_CLOSE_MS = 5000;

export const DefibrillatorMinigame: React.FC<DefibrillatorMinigameProps> = ({ onComplete, onClose, onMiss, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhaseState] = useState<Phase>('charging');
  const phaseRef = useRef<Phase>('charging');
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [hits, setHits] = useState(0);
  const hitsRef = useRef(0);
  const levelRef = useRef(0);          // Mức Joules đang nạp (tăng sau mỗi cú sốc, kể cả trượt)
  const [level, setLevel] = useState(0);
  const [charge, setCharge] = useState(0);
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);
  const sim = useRef({ t: 0, phaseT: 0, scroll: 0, peaks: [] as number[], nextPeak: 1.2, charge: 0 });
  const cbRef = useRef({ onComplete, onClose, onMiss });
  useEffect(() => {
    cbRef.current = { onComplete, onClose, onMiss };
  }, [onComplete, onClose, onMiss]);
  const timersRef = useRef<number[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // ---------------- Âm thanh ----------------
  const audioRef = useRef<AudioContext | null>(null);
  const whineRef = useRef<{ o: OscillatorNode; g: GainNode } | null>(null);
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
  const beep = useCallback((f: number, dur: number, gain: number, type: OscillatorType = 'sine') => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.setValueAtTime(gain * vol, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }, [ac, vol]);
  // Tụ nạp: tiếng rít tăng dần âm lượng và cao độ
  const startWhine = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    whineRef.current?.o.stop();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(3200, t + CHARGE_S);
    g.gain.setValueAtTime(0.01 * vol, t);
    g.gain.linearRampToValueAtTime(0.06 * vol, t + CHARGE_S);
    g.gain.linearRampToValueAtTime(0.02 * vol, t + CHARGE_S + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + CHARGE_S + 0.25);
    whineRef.current = { o, g };
  }, [ac, vol]);
  const playShock = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.35 * vol;
    src.connect(g).connect(ctx.destination);
    src.start(t);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    og.gain.setValueAtTime(0.18 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.36);
  }, [ac, vol]);

  const charge0 = useCallback(() => {
    sim.current.charge = 0;
    sim.current.phaseT = 0;
    setPhase('charging');
    startWhine();
  }, [setPhase, startWhine]);

  // Khởi động: nạp mức 200J ngay khi mở máy
  useEffect(() => {
    const id = window.setTimeout(() => charge0(), 300);
    return () => window.clearTimeout(id);
  }, [charge0]);

  // ---------------- Bấm sốc ----------------
  const shock = useCallback(() => {
    const ph = phaseRef.current;
    if (ph === 'success') {
      cbRef.current.onComplete();
      return;
    }
    if (ph !== 'ready') return;
    void ac();
    const s = sim.current;
    // Đỉnh R nào đang nằm gần vạch đồng bộ?
    const onLine = s.peaks.some((wx) => Math.abs(wx - s.scroll - SYNC_X) <= HIT_WINDOW);
    playShock();
    setFlash(true);
    later(120, () => setFlash(false));
    levelRef.current = Math.min(ENERGY.length - 1, levelRef.current + 1);
    if (onLine) {
      hitsRef.current += 1;
      setHits(hitsRef.current);
      if (hitsRef.current >= SHOCKS_NEEDED) {
        setPhase('success');
        later(SUCCESS_CLOSE_MS, () => cbRef.current.onComplete());
        return;
      }
      setPhase('shocked');
      s.phaseT = 0;
      later(REST_S * 1000, () => {
        setLevel(levelRef.current);
        charge0();
      });
      return;
    }
    // Trượt nhịp: vô tâm thu, tút dài, phòng rung; tim lại rung thất từ đầu (mất hết cú trúng)
    hitsRef.current = 0;
    setHits(0);
    setPhase('flatline');
    s.phaseT = 0;
    setShake(true);
    later(500, () => setShake(false));
    beep(880, FLATLINE_S, 0.05);
    cbRef.current.onMiss?.();
    later(FLATLINE_S * 1000, () => {
      setLevel(levelRef.current);
      charge0();
    });
  }, [ac, beep, charge0, later, playShock, setPhase]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (phaseRef.current !== 'success') cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if ((k === ' ' || k === 'enter') && !e.repeat) shock();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [shock]);

  // ---------------- Vòng lặp sóng điện tim ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let uiT = 0;
    let beepT = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;
      const ph = phaseRef.current;
      s.t += dt;
      s.phaseT += dt;
      s.scroll += SCROLL * dt;
      if (ph === 'charging') {
        s.charge = Math.min(1, s.phaseT / CHARGE_S);
        if (s.charge >= 1) setPhase('ready');
      }
      // Sinh đỉnh R mới ở mép phải (toạ độ "thế giới")
      if (ph !== 'success' && ph !== 'flatline' && s.t >= s.nextPeak) {
        s.peaks.push(s.scroll + W + 10);
        s.nextPeak = s.t + R_GAP_MIN + Math.random() * (R_GAP_MAX - R_GAP_MIN);
      }
      s.peaks = s.peaks.filter((wx) => wx - s.scroll > -40);
      // Nhịp xoang: bíp đều 72 BPM
      if (ph === 'success') {
        beepT += dt;
        if (beepT > 60 / 72) {
          beepT = 0;
          beep(1000, 0.08, 0.04);
        }
      }
      uiT += dt;
      if (uiT > 0.05) {
        uiT = 0;
        setCharge(Math.round(s.charge * 100));
      }

      // ---- Vẽ ----
      ctx.fillStyle = '#020a05';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(34,197,94,0.1)';
      for (let x = 0; x < W; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
        ctx.stroke();
      }
      // Vạch đồng bộ đỏ
      ctx.fillStyle = 'rgba(239,68,68,0.15)';
      ctx.fillRect(SYNC_X - HIT_WINDOW, 0, HIT_WINDOW * 2, H);
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(SYNC_X + 0.5, 0);
      ctx.lineTo(SYNC_X + 0.5, H);
      ctx.stroke();
      // Sóng
      const mid = H / 2 + 10;
      ctx.strokeStyle = ph === 'success' ? '#4ade80' : '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const amp = 1 - hitsRef.current * 0.22;
      for (let x = 0; x <= W; x += 2) {
        const wx = x + s.scroll;
        let y = mid;
        if (ph === 'flatline') {
          y = mid;
        } else if (ph === 'success') {
          // Nhịp xoang: phức bộ QRS đều đặn
          const beat = (wx % 140) / 140;
          y = mid - (beat > 0.46 && beat < 0.5 ? 55 : beat > 0.5 && beat < 0.53 ? -14 : beat > 0.7 && beat < 0.8 ? 10 : 0);
        } else {
          // Rung thất: dao động hỗn loạn + đỉnh R co thắt
          y = mid + (Math.sin(wx * 0.09) * 14 + Math.sin(wx * 0.23 + 1.3) * 9 + Math.sin(wx * 0.041) * 6) * amp;
          for (const px of s.peaks) {
            const dx = wx - px;
            if (Math.abs(dx) < 10) y -= (1 - Math.abs(dx) / 10) * 62;
          }
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beep, setPhase]);

  const energy = ENERGY[level];
  const status =
    phase === 'success'
      ? tx('NHỊP XOANG ĐỀU • 72 BPM')
      : phase === 'flatline'
      ? tx('VÔ TÂM THU (ASYSTOLE)')
      : tx('RUNG THẤT (V-FIB)');

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-3 font-mono overflow-y-auto">
      <style>{'@keyframes defib-shake{0%,100%{transform:translate(0,0)}25%{transform:translate(-6px,2px)}50%{transform:translate(5px,-3px)}75%{transform:translate(-3px,-2px)}}'}</style>
      {flash && <div className="fixed inset-0 z-60 bg-white pointer-events-none" />}
      <div className="w-full max-w-xl my-auto bg-zinc-950 border border-zinc-700 p-4 space-y-3" style={shake ? { animation: 'defib-shake 0.12s linear infinite' } : undefined}>
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('MÁY SỐC TIM • PHÒNG CẤP CỨU')}</div>
          <div className={`text-xs font-bold ${phase === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{status}</div>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={() => shock()}
          className="w-full border border-zinc-800 cursor-pointer"
        />
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-zinc-500">{tx('Năng lượng')}</div>
            <div className="text-amber-300 font-bold text-base">{energy}J</div>
          </div>
          <div>
            <div className="text-zinc-500">{tx('Tụ nạp')}</div>
            <div className="w-full h-2.5 mt-1 bg-zinc-900 border border-zinc-700">
              <div className={`h-full ${phase === 'ready' ? 'bg-amber-400' : 'bg-red-700'}`} style={{ width: `${phase === 'ready' ? 100 : charge}%` }} />
            </div>
          </div>
          <div>
            <div className="text-zinc-500">{tx('Cú sốc trúng')}</div>
            <div className="text-zinc-100 font-bold text-base">{hits}/{SHOCKS_NEEDED}</div>
          </div>
        </div>
        <div className={`text-sm leading-relaxed min-h-10 ${phase === 'success' ? 'text-emerald-300' : phase === 'flatline' ? 'text-red-400' : 'text-zinc-300'}`}>
          {phase === 'success'
            ? tx('"Có mạch lại rồi! Nhịp xoang 72... Miên ơi, anh ấy qua cơn nguy kịch tạm thời rồi, đừng khóc nữa..."')
            : phase === 'flatline'
            ? tx('Trượt nhịp! Đường điện tim phẳng lì, tiếng tút dài... Tim lại rung thất từ đầu. "Nạp lại!"')
            : phase === 'charging'
            ? tx('Tụ đang nạp {0}J...', energy)
            : phase === 'shocked'
            ? tx('CLEAR! Tim giật mạnh... vẫn còn rung thất.')
            : tx('{0}J READY. Chờ đỉnh sóng R chạm vạch đỏ.', energy)}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>Space</Key><Key>{tx('Click')}</Key>{phase === 'success' ? tx('Đặt bàn sốc xuống') : tx('Sốc điện')}</span>
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
