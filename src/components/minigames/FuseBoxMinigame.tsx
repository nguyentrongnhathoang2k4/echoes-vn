"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface FuseBoxMinigameProps {
  /** Mạch ổn định: đèn hành lang bật, phòng 314 có điện */
  onComplete: () => void;
  /** Chần chừ quá lâu: bóng đen qua khe cửa 312 */
  onScare: () => void;
  /** Đoán bừa sai (chập điện, ghép nhầm mảnh, cót bật...): trang trừ Sanity */
  onPenalty?: () => void;
  onClose: () => void;
  volume?: number;
}

/**
 * CÂN BẰNG MẠCH CHẬP CHÉO (Màn 1) — một thao tác: bấm cần gạt.
 * 4 cầu dao: [1 Đèn hành lang] [2 Phòng 312] [3 Phòng 314] [4 Đèn cầu thang].
 * Dây rò chéo: gạt cầu dao N thì N-1 và N+1 cũng tự đảo theo.
 * Mạch ổn định (LED xanh) khi: hành lang ON, 312 OFF (máy chạy suốt đêm, bật là quá tải), 314 ON, cầu thang ON.
 * Trạng thái đầu [ON, ON, OFF, ON] cần đúng 4 lần gạt, mỗi cần một lần.
 * Chống bấm bừa: 312 và 314 cùng có điện dù chỉ một nhịp là CHẬP: cầu dao tổng nhảy, cả bảng bật về
 * trạng thái đầu, trừ Sanity. Chỉ 6/24 thứ tự gạt đi được tới đích mà không chập (phải tính trước);
 * bấm bừa trung bình chập ~15 lần mới trúng.
 */
const LABELS = ['Đèn hành lang', 'Phòng 312', 'Phòng 314', 'Đèn cầu thang'];
const START: boolean[] = [true, true, false, true];
const GOAL: boolean[] = [true, false, true, true];
const SCARE_AT_S = 90;
const HINT_AFTER_TOGGLES = 8;
const TRIP_MS = 1100;          // Cầu dao tổng nhảy: khoá tay một nhịp rồi bật cả bảng về trạng thái đầu

const solved = (s: boolean[]) => s.every((v, i) => v === GOAL[i]);

export const FuseBoxMinigame: React.FC<FuseBoxMinigameProps> = ({ onComplete, onScare, onClose, onPenalty, volume = 80 }) => {
  useUiLayer(true);
  const [sw, setSw] = useState<boolean[]>(START);
  const swRef = useRef(sw);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const trippedRef = useRef(false);
  const [toggles, setToggles] = useState(0);
  const [moving, setMoving] = useState<number[]>([]);   // Cần vừa bị kéo theo (rung một nhịp)
  const [note, setNote] = useState('Bảng điện tầng 3 chập chờn, LED tổng đỏ lòm. Gạt thử từng cầu dao xem.');
  const [shadow, setShadow] = useState(false);
  const [shake, setShake] = useState(false);
  const cbRef = useRef({ onComplete, onScare, onClose, onPenalty });
  useEffect(() => {
    cbRef.current = { onComplete, onScare, onClose, onPenalty };
  }, [onComplete, onScare, onClose, onPenalty]);
  const timersRef = useRef<number[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

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
  const noise = useCallback((delay: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'highpass') => {
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
    src.start(ctx.currentTime + delay);
  }, [ac, vol]);
  const tone = useCallback((delay: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'square') => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const s = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, s);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), s + dur);
    g.gain.setValueAtTime(gain * vol, s);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g).connect(ctx.destination);
    o.start(s);
    o.stop(s + dur + 0.02);
  }, [ac, vol]);
  const playClack = useCallback((n: number) => {
    // Cần chính + các cần bị kéo theo trễ một chút
    for (let i = 0; i < n; i++) {
      tone(i * 0.06, 160 - i * 15, 70, 0.1, 0.14);
      noise(i * 0.06, 0.03, 2200, 0.2);
    }
  }, [noise, tone]);
  const playSpark = useCallback(() => {
    for (let i = 0; i < 5; i++) noise(0.1 + i * 0.035, 0.03, 2600 + Math.random() * 2000, 0.4);
  }, [noise]);
  const playHum = useCallback(() => tone(0.15, 100, 100, 1.4, 0.06, 'sawtooth'), [tone]);
  const playShuffle = useCallback(() => {
    for (let i = 0; i < 4; i++) noise(i * 0.55, 0.22, 500, 0.12, 'lowpass');
  }, [noise]);
  const playScare = useCallback(() => {
    tone(0, 70, 40, 1.4, 0.2, 'sine');
    noise(0, 0.9, 300, 0.35, 'lowpass');
  }, [noise, tone]);

  // ---------------- Gạt cầu dao: N đảo cả N-1, N+1 ----------------
  const toggle = useCallback((n: number) => {
    if (doneRef.current || trippedRef.current) return;
    void ac();
    const next = [...swRef.current];
    const touched = [n - 1, n, n + 1].filter((i) => i >= 0 && i < 4);
    touched.forEach((i) => (next[i] = !next[i]));
    swRef.current = next;
    setSw(next);
    setToggles((t) => t + 1);
    setMoving(touched.filter((i) => i !== n));
    later(260, () => setMoving([]));
    playClack(touched.length);
    if (solved(next)) {
      doneRef.current = true;
      setDone(true);
      playHum();
      setNote('LED tổng chuyển xanh. Rơ-le đóng tách... tách... Đèn tuýp hành lang bừng sáng.');
      later(1900, () => cbRef.current.onComplete());
      return;
    }
    if (next[1] && next[2]) {
      // 312 và 314 cùng ăn điện: quá tải, toé lửa
      playSpark();
      setShake(true);
      later(300, () => setShake(false));
      setNote('Xẹt! Phòng 312 và 314 cùng kéo điện, toé lửa. Cầu dao tổng nhảy, cả bảng bật ngược về như cũ.');
      cbRef.current.onPenalty?.();
      trippedRef.current = true;
      later(TRIP_MS, () => {
        swRef.current = START;
        setSw(START);
        playClack(4);
        trippedRef.current = false;
      });
    } else if (n === 1) {
      setNote(next[1]
        ? 'Tiếng quạt máy bên trong phòng 312 rú lên ngay lập tức.'
        : 'Tiếng quạt máy bên trong phòng 312 tắt lịm... rồi im phăng phắc.');
    } else {
      setNote('Cạch. Mấy cần bên cạnh cũng giật theo... dây rò chéo sang nhau.');
    }
  }, [ac, later, playClack, playHum, playSpark]);

  // ---------------- Bàn phím: 1-4 gạt, Esc thoát ----------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (!doneRef.current) cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      const idx = ['1', '2', '3', '4'].indexOf(k);
      if (idx >= 0) toggle(idx);
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [toggle]);

  // ---------------- Hành lang tối sau lưng: dép lê + bóng đen lúc 90 giây ----------------
  useEffect(() => {
    const start = performance.now();
    let nextShuffle = 12 + Math.random() * 8;
    let scared = false;
    const id = window.setInterval(() => {
      if (doneRef.current) return;
      const t = (performance.now() - start) / 1000;
      if (t > nextShuffle) {
        nextShuffle = t + 14 + Math.random() * 10;
        playShuffle();
      }
      if (!scared && t > SCARE_AT_S) {
        scared = true;
        playScare();
        setShadow(true);
        setShake(true);
        setNote('Ánh sáng dưới khe cửa 312 tối sầm lại một nhịp, như có ai đứng sát bên trong... rồi sáng trở lại.');
        later(900, () => setShake(false));
        later(2200, () => setShadow(false));
        cbRef.current.onScare();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [later, playScare, playShuffle]);

  const overload = sw[1] && sw[2];
  const ok = done;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-3 font-mono overflow-y-auto">
      <style>{'@keyframes fuse-shake{0%,100%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}50%{transform:translate(3px,-1px)}75%{transform:translate(-2px,-1px)}}'}</style>
      <div className="w-full max-w-xl my-auto bg-zinc-950 border border-zinc-700 p-4 space-y-3" style={shake ? { animation: 'fuse-shake 0.3s linear infinite' } : undefined}>
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('HỘP CẦU DAO TẦNG 3')}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">{tx('LED tổng')}</span>
            <span className={`inline-block w-3 h-3 ${ok ? 'bg-emerald-500' : overload ? 'bg-red-500 animate-pulse' : 'bg-red-800'}`} />
          </div>
        </div>

        <div className="relative flex border border-zinc-800 bg-[#2b2722]">
          {/* Khe cửa phòng 312 sau lưng: vệt sáng mờ, có lúc bóng đen che mất */}
          <div className="relative w-10 shrink-0 bg-[#07080b] border-r border-zinc-800">
            <div className="absolute left-1/2 -translate-x-1/2 top-3 bottom-3 w-1 bg-[#2f5d3a]" style={{ opacity: shadow ? 0.05 : 0.55 }} />
            <div className="absolute top-1 left-0 right-0 text-center text-[9px] text-zinc-600">312</div>
          </div>
          {/* 4 cần gạt */}
          <div className="flex-1 grid grid-cols-4 gap-2 p-3">
            {LABELS.map((label, i) => {
              const on = sw[i];
              const jolt = moving.includes(i);
              return (
                <button
                  key={label}
                  onClick={() => toggle(i)}
                  className="flex flex-col items-center gap-1.5 py-2 bg-[#3a352e] border border-zinc-700 hover:border-zinc-500 cursor-pointer disabled:cursor-default"
                  disabled={done}
                >
                  <span className="text-[10px] text-zinc-400">{i + 1}</span>
                  <span className="relative block w-7 h-20 bg-[#0c0a09] border border-zinc-600">
                    <span
                      className={`absolute left-0.5 right-0.5 h-8 border border-zinc-900 transition-all duration-150 ${on ? 'top-0.5 bg-zinc-300' : 'bottom-0.5 bg-zinc-600'}`}
                      style={jolt ? { transform: 'translateX(1px)' } : undefined}
                    />
                  </span>
                  <span className={`text-[10px] font-bold ${on ? 'text-emerald-400' : 'text-zinc-500'}`}>{on ? 'ON' : 'OFF'}</span>
                  <span className={`text-xs text-center leading-tight ${i === 1 ? 'text-amber-300' : 'text-zinc-300'}`}>{tx(label)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`text-sm leading-relaxed min-h-10 ${ok ? 'text-emerald-300' : overload ? 'text-red-400' : 'text-zinc-300'}`}>{tx(note)}</div>
        {!done && toggles >= HINT_AFTER_TOGGLES && (
          <div className="text-xs italic text-zinc-400">
            {tx('An lẩm bẩm: mỗi cần kéo theo cả hai cần sát bên. 312 với 314 mà cùng có điện dù một nhịp là chập... phải tính trước thứ tự gạt.')}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>{tx('Chuột')}</Key><Key>1</Key><Key>2</Key><Key>3</Key><Key>4</Key>{tx('Gạt cầu dao')}</span>
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
