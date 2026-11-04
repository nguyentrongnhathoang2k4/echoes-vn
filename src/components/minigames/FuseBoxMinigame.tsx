"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface FuseBoxMinigameProps {
  /** Có kẹp ghim: uốn làm dây chì tạm. Không có thì rút sợi đồng từ dây bị chuột cắn */
  hasClip: boolean;
  /** Có băng dính: bọc các điểm hở. Không có thì bỏ qua bước bọc */
  hasTape: boolean;
  /** Đóng được cầu dao 314 trong dải an toàn */
  onComplete: () => void;
  /** Chập điện / át nhảy: trừ Sanity nhẹ */
  onSpark: () => void;
  /** Chần chừ quá lâu: bóng đen qua khe cửa 312 */
  onScare: () => void;
  onClose: () => void;
  volume?: number;
}

/**
 * ĐẤU NỐI HỘP CẦU DAO TẦNG 3 (Màn 1)
 * fuse    : rút cầu chì 314 cháy đen, lắp dây chì tạm (kẹp ghim uốn / sợi đồng)
 * wire    : đấu 3 dây bị chuột cắn vào đúng cọc L / N / PE (cọc thứ 4 đứt ngầm)
 * tape    : bọc băng keo các điểm hở (bỏ qua nếu không có băng dính)
 * balance : gạt tạm cầu dao phòng phụ cho kim vôn kế (điện áp tải 314) về 210–225V rồi đóng cầu dao 314
 * done    : đèn hành lang bật
 */
type Step = 'fuse' | 'wire' | 'tape' | 'balance' | 'done';

const V_MIN = 210;
const V_MAX = 225;
const SCARE_AT_S = 90;
const SPARK_COOLDOWN_MS = 1500;
const HINT_AFTER_S = 35;        // Kẹt ở một bước bao lâu thì An tự nhớ ra mẹo
const HINT_AFTER_MISTAKES = 2;  // Hoặc làm sai bao nhiêu lần

// Tải điện áp (V sụt) của từng nhánh
const LOAD_312 = 24;     // Máy chạy suốt đêm, kéo tải theo từng đợt
const LOAD_316 = 7;
const LOAD_314 = 14;

type WireId = 'L' | 'N' | 'PE';
type TermId = 'L' | 'N' | 'PE' | 'X';
const WIRES: Array<{ id: WireId; color: string; stripe?: string; label: string; root: [number, number]; loose: [number, number] }> = [
  { id: 'L', color: '#9a3412', label: 'Dây nóng (L)', root: [100, 292], loose: [150, 232] },
  { id: 'N', color: '#1d4ed8', label: 'Dây nguội (N)', root: [112, 292], loose: [176, 246] },
  { id: 'PE', color: '#ca8a04', stripe: '#15803d', label: 'Dây nối đất (PE)', root: [124, 292], loose: [200, 258] },
];
const TERMS: Array<{ id: TermId; x: number; y: number; label: string }> = [
  { id: 'L', x: 270, y: 262, label: 'L' },
  { id: 'N', x: 320, y: 262, label: 'N' },
  { id: 'PE', x: 370, y: 262, label: 'PE' },
  { id: 'X', x: 420, y: 262, label: '—' },
];
type SwitchId = 'main' | 's312' | 's314' | 's316';
const SWITCHES: Array<{ id: SwitchId; x: number; label: string }> = [
  { id: 'main', x: 250, label: 'TỔNG' },
  { id: 's312', x: 305, label: '312' },
  { id: 's314', x: 360, label: '314' },
  { id: 's316', x: 415, label: '316' },
];
// Điểm hở cần bọc băng keo (vết chuột cắn trên 3 dây + mối nối dây chì)
const TAPE_SPOTS: Array<[number, number]> = [[132, 268], [158, 272], [362, 186]];

// Vôn kế kim cơ: 0–250V trên cung 210° → -30°
const METER = { cx: 160, cy: 104, r: 58 };
const vToAngle = (v: number) => ((210 - (Math.max(0, Math.min(250, v)) / 250) * 240) * Math.PI) / 180;
const meterPoint = (v: number, r: number): [number, number] => {
  const a = vToAngle(v);
  return [METER.cx + Math.cos(a) * r, METER.cy - Math.sin(a) * r];
};

/** Ô phím bấm trong dòng hướng dẫn */
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block min-w-6 px-1.5 py-0.5 mr-1 text-center text-zinc-100 bg-zinc-800 border border-zinc-600">{children}</span>
);

export const FuseBoxMinigame: React.FC<FuseBoxMinigameProps> = ({
  hasClip, hasTape, onComplete, onSpark, onScare, onClose, volume = 80,
}) => {
  useUiLayer(true);
  const [step, setStepState] = useState<Step>('fuse');
  const stepRef = useRef<Step>('fuse');
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  // Gợi ý theo tầng: lúc đầu chỉ nói mục tiêu; kẹt lâu hoặc sai nhiều mới hiện mẹo (không bao giờ nói thẳng đáp án)
  const [hint, setHint] = useState(false);
  const hintRef = useRef(false);
  const mistakesRef = useRef(0);
  const stepStartRef = useRef(0);
  const unlockHint = useCallback(() => {
    if (hintRef.current) return;
    hintRef.current = true;
    setHint(true);
  }, []);
  const setStep = useCallback((s: Step) => {
    setStepState(s);
    hintRef.current = false;
    setHint(false);
    mistakesRef.current = 0;
    stepStartRef.current = performance.now();
  }, []);
  const addMistake = useCallback(() => {
    mistakesRef.current += 1;
    if (mistakesRef.current >= HINT_AFTER_MISTAKES) unlockHint();
  }, [unlockHint]);
  const [fuseOut, setFuseOut] = useState(false);          // Đã rút cầu chì cháy
  const [links, setLinks] = useState<Partial<Record<WireId, TermId>>>({});
  const [held, setHeld] = useState<WireId | null>(null);  // Đầu dây đang cầm
  const [taped, setTaped] = useState<boolean[]>([false, false, false]);
  const [sw, setSw] = useState<Record<SwitchId, boolean>>({ main: true, s312: true, s314: false, s316: true });
  const swRef = useRef(sw);
  useEffect(() => {
    swRef.current = sw;
  }, [sw]);
  const [voltage, setVoltage] = useState(0);
  const voltRef = useRef(0);
  // Lời nhắn riêng của bước hiện tại; sang bước mới thì hiện lời dẫn mặc định của bước đó
  const [note, setNote] = useState<{ step: Step; text: string } | null>(null);
  const setMessage = useCallback((m: string) => setNote({ step: stepRef.current, text: m }), []);
  const [sparkAt, setSparkAt] = useState<[number, number] | null>(null);
  const [shake, setShake] = useState(false);
  const [shadow, setShadow] = useState(false);              // Bóng đen đang lướt qua khe cửa 312
  const cooldownRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const cbRef = useRef({ onComplete, onSpark, onScare, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onSpark, onScare, onClose };
  }, [onComplete, onSpark, onScare, onClose]);

  // Lời dẫn đầu mỗi bước
  const intro: Record<Step, string> = {
      fuse: 'Cầu chì sứ phòng 314 nổ cháy đen. Rút nó ra trước đã.',
      wire: 'Ba sợi dây bị chuột cắn tuột khỏi cọc. Phải đấu lại cho đúng, đấu bừa là chập.',
      tape: 'Lõi đồng hở ra mấy chỗ. Bấm vào từng chỗ đỏ để quấn băng dính.',
      balance: 'Kim vôn kế đo điện áp cấp cho phòng 314. Đóng cầu dao 314 lúc kim còn ngoài vạch xanh thì chắc chắn nổ.',
      done: 'Cạch! Cầu dao 314 bám chắc. Đèn tuýp hành lang chớp chớp rồi sáng hẳn.',
  };
  const message = note && note.step === step && step !== 'done' ? note.text : intro[step];

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
  const noise = useCallback((t: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'highpass') => {
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
    src.start(ctx.currentTime + t);
  }, [ac, vol]);
  const tone = useCallback((t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'square') => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const s = ctx.currentTime + t;
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
  const playClunk = useCallback(() => {
    tone(0, 160, 70, 0.12, 0.16);
    noise(0, 0.04, 2000, 0.25);
  }, [noise, tone]);
  const playSpark = useCallback(() => {
    for (let i = 0; i < 6; i++) noise(i * 0.035, 0.03, 2500 + Math.random() * 2500, 0.5);
    tone(0, 120, 60, 0.35, 0.12, 'sawtooth');
  }, [noise, tone]);
  const playTape = useCallback(() => {
    noise(0, 0.25, 1800, 0.18, 'bandpass');
  }, [noise]);
  // Tiếng dép lê loẹt quẹt trên hành lang tối sau lưng
  const playShuffle = useCallback(() => {
    for (let i = 0; i < 4; i++) noise(i * 0.55, 0.22, 500, 0.12, 'lowpass');
  }, [noise]);
  const playScare = useCallback(() => {
    tone(0, 70, 40, 1.4, 0.2, 'sine');
    noise(0, 0.9, 300, 0.35, 'lowpass');
  }, [noise, tone]);

  // ---------------- Kim vôn kế + đồng hồ chần chừ ----------------
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let lastUi = 0;
    let nextShuffle = 12 + Math.random() * 8;
    let scared = false;
    stepStartRef.current = start;
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const s = swRef.current;
      // Điện lưới khu trọ chập chờn + phòng 312 kéo tải theo đợt
      const base = 236 + Math.sin(t * 0.7) * 6 + Math.sin(t * 2.3) * 3 + (Math.random() - 0.5) * 2;
      const surge = LOAD_312 + Math.sin(t * 1.9) * 5 + (Math.sin(t * 0.37) > 0.6 ? 6 : 0);
      const target = s.main ? base - (s.s312 ? surge : 0) - (s.s316 ? LOAD_316 : 0) - LOAD_314 : 0;
      // Kim cơ có quán tính
      voltRef.current += (target - voltRef.current) * 0.08;
      if (now - lastUi > 33) {
        lastUi = now;
        setVoltage(voltRef.current);
      }
      const st = stepRef.current;
      if (!hintRef.current && st !== 'done' && (now - stepStartRef.current) / 1000 > HINT_AFTER_S) unlockHint();
      if (st !== 'done') {
        if (t > nextShuffle) {
          nextShuffle = t + 14 + Math.random() * 10;
          playShuffle();
        }
        if (!scared && t > SCARE_AT_S) {
          scared = true;
          playScare();
          setShadow(true);
          setShake(true);
          setMessage('Ánh sáng dưới khe cửa 312 tối sầm lại một nhịp, như có ai đứng sát bên trong... rồi sáng trở lại.');
          later(900, () => setShake(false));
          later(2200, () => setShadow(false));
          cbRef.current.onScare();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [later, playScare, playShuffle, setMessage, unlockHint]);

  // ---------------- Thao tác ----------------
  const spark = useCallback((at: [number, number], msg: string) => {
    playSpark();
    setSparkAt(at);
    setShake(true);
    setMessage(msg);
    later(380, () => setShake(false));
    later(500, () => setSparkAt(null));
    cbRef.current.onSpark();
    addMistake();
  }, [later, playSpark, setMessage, addMistake]);

  const clickFuse = () => {
    if (step !== 'fuse') return;
    if (!fuseOut) {
      playClunk();
      setFuseOut(true);
      setMessage(hasClip
        ? 'Cầu chì cháy rút ra còn nóng hổi. Giờ uốn kẹp ghim thành dây chì tạm, bấm vào khe trống để lắp.'
        : 'Cầu chì cháy rút ra còn nóng hổi. Không có kẹp ghim... rút tạm một sợi đồng từ đoạn dây bị chuột cắn. Bấm vào khe trống để lắp.');
      return;
    }
    playClunk();
    setStep('wire');
  };

  const clickWire = (id: WireId) => {
    if (step !== 'wire' || links[id]) return;
    setHeld(held === id ? null : id);
  };

  const clickTerm = (term: TermId) => {
    if (step !== 'wire' || !held) return;
    const tPos = TERMS.find((x) => x.id === term)!;
    if (Object.values(links).includes(term)) {
      setMessage('Cọc này đã có dây rồi.');
      return;
    }
    if (term === 'X') {
      setHeld(null);
      setMessage('Cọc thứ tư gỉ mục, đứt ngầm bên trong. Vặn vào cũng chẳng dẫn điện.');
      addMistake();
      return;
    }
    if (term !== held) {
      setHeld(null);
      spark([tPos.x, tPos.y], held === 'L' || term === 'L'
        ? 'XOẸT! Dây nóng chạm nhầm cọc, tia lửa toé vào tay. Bình tĩnh... nhìn kỹ màu dây.'
        : 'Tạch! Đấu nhầm cọc, át rung lên. Nhìn lại màu dây đã.');
      return;
    }
    playClunk();
    const next = { ...links, [held]: term };
    setLinks(next);
    setHeld(null);
    if (Object.keys(next).length === 3) {
      if (hasTape) setStep('tape');
      else {
        setMessage('Không có băng dính để bọc chỗ hở... đành để vậy, nhớ đừng chạm tay vào.');
        later(1600, () => setStep('balance'));
      }
    }
  };

  const clickTape = (i: number) => {
    if (step !== 'tape' || taped[i]) return;
    playTape();
    const next = taped.map((v, k) => (k === i ? true : v));
    setTaped(next);
    if (next.every(Boolean)) later(500, () => setStep('balance'));
  };

  const toggleSwitch = useCallback((id: SwitchId) => {
    if (stepRef.current !== 'balance') return;
    const s = swRef.current;
    if (id === 's314') {
      if (s.s314) return;
      if (Date.now() < cooldownRef.current) return;
      if (!s.main) {
        playClunk();
        setMessage('Cầu dao tổng đang ngắt, đóng 314 cũng không có điện.');
        return;
      }
      const v = voltRef.current;
      if (v < V_MIN || v > V_MAX) {
        cooldownRef.current = Date.now() + SPARK_COOLDOWN_MS;
        spark([360, 168], v < V_MIN
          ? 'ĐOÀNG! Sụt áp quá, át nổ toé lửa rồi nhảy sập xuống. Phải kéo kim lên vạch xanh đã.'
          : 'ĐOÀNG! Quá áp, dây chì tạm đỏ rực, át nhảy sập. Chờ kim lùi về vạch xanh đã.');
        return;
      }
      playClunk();
      setSw({ ...s, s314: true });
      setStep('done');
      later(2000, () => cbRef.current.onComplete());
      return;
    }
    playClunk();
    const next = { ...s, [id]: !s[id] };
    setSw(next);
    if (id === 's312') {
      setMessage(next.s312
        ? 'Đóng lại cầu dao 312. Tiếng quạt máy bên trong phòng 312 rú lên ngay lập tức.'
        : 'Gạt cầu dao 312 xuống. Tiếng quạt máy bên trong phòng 312 tắt lịm... rồi im phăng phắc.');
    } else if (id === 'main' && !next.main) {
      setMessage('Ngắt cầu dao tổng: kim vôn kế rơi về 0.');
    }
  }, [later, playClunk, setMessage, spark, setStep]);

  // Bàn phím: Esc bỏ dở; ở bước cân tải 1-4 gạt cầu dao, Space đóng 314
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (stepRef.current !== 'done') cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (stepRef.current === 'balance') {
        const idx = ['1', '2', '3', '4'].indexOf(k);
        if (idx >= 0) toggleSwitch(SWITCHES[idx].id);
        if (k === ' ' || k === 'enter') toggleSwitch('s314');
      }
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [toggleSwitch]);

  // Đèn chập chờn bám theo chuột (bóng tối khoét một vòng sáng)
  const lightRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const el = lightRef.current;
      if (el) {
        const flick = 0.82 + Math.sin(now / 90) * 0.06 + (Math.random() < 0.04 ? -0.25 : 0);
        el.style.setProperty('--flick', String(flick));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const el = lightRef.current;
    if (!box || !el) return;
    const r = box.getBoundingClientRect();
    el.style.setProperty('--lx', `${e.clientX - r.left}px`);
    el.style.setProperty('--ly', `${e.clientY - r.top}px`);
    void ac();
  };


  const [nx, ny] = meterPoint(voltage, METER.r - 8);
  const [b0x, b0y] = meterPoint(V_MIN, METER.r - 2);
  const [b1x, b1y] = meterPoint(V_MAX, METER.r - 2);
  const termPos = (id: TermId) => TERMS.find((x) => x.id === id)!;
  const wireEnd = (w: (typeof WIRES)[number]): [number, number] => {
    const l = links[w.id];
    if (l) {
      const tp = termPos(l);
      return [tp.x, tp.y + 6];
    }
    return w.loose;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 font-mono">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-700 p-4 space-y-3" style={shake ? { animation: 'fuse-shake 0.3s linear infinite' } : undefined}>
        <style>{'@keyframes fuse-shake{0%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}50%{transform:translate(3px,-1px)}75%{transform:translate(-2px,-1px)}100%{transform:translate(0,0)}}'}</style>
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('HỘP CẦU DAO TẦNG 3')}</div>
          <div className="text-xs text-zinc-500">
            {(['fuse', 'wire', 'tape', 'balance'] as Step[]).map((s, i) => (
              <span key={s} className={`ml-2 ${step === s ? 'text-amber-300' : (['fuse', 'wire', 'tape', 'balance', 'done'].indexOf(step) > i ? 'text-emerald-400' : 'text-zinc-600')}`}>
                {i + 1}. {tx(['Dây chì', 'Đấu dây', 'Bọc băng keo', 'Cân tải'][i])}
              </span>
            ))}
          </div>
        </div>

        <div ref={boxRef} onPointerMove={onMove} className="relative w-full border border-zinc-800 overflow-hidden select-none">
          <svg viewBox="0 0 480 300" className="w-full block" shapeRendering="crispEdges">
            {/* Khe cửa phòng 312 sau lưng (mép trái): vệt sáng mờ, có lúc bóng đen lướt qua */}
            <rect x="0" y="0" width="64" height="300" fill="#07080b" />
            <rect x="26" y="20" width="4" height="270" fill="#2f5d3a" opacity="0.55" />
            {shadow && <rect x="22" y="70" width="12" height="150" fill="#000" />}
            <text x="8" y="14" fill="#4b5563" fontSize="8">{tx('CỬA 312')}</text>

            {/* Hộp sắt gỉ */}
            <rect x="72" y="10" width="400" height="285" fill="#3f3a33" stroke="#1c1917" strokeWidth="3" />
            {Array.from({ length: 70 }, (_, i) => (
              <rect key={i} x={76 + ((i * 97) % 392)} y={14 + ((i * 53) % 276)} width={2 + (i % 3)} height={1 + (i % 2)} fill={i % 3 ? 'rgba(130,64,20,0.5)' : 'rgba(90,45,15,0.6)'} />
            ))}

            {/* Vôn kế kim cơ 0–250V */}
            <circle cx={METER.cx} cy={METER.cy} r={METER.r + 6} fill="#1c1917" />
            <circle cx={METER.cx} cy={METER.cy} r={METER.r} fill="#e7e0c9" />
            <line x1={b0x} y1={b0y} x2={b1x} y2={b1y} stroke="#16a34a" strokeWidth="7" />
            {[0, 50, 100, 150, 200, 250].map((v) => {
              const [x1, y1] = meterPoint(v, METER.r - 2);
              const [x2, y2] = meterPoint(v, METER.r - 10);
              const [lx, ly] = meterPoint(v, METER.r - 20);
              return (
                <g key={v}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#292524" strokeWidth="1.5" />
                  <text x={lx - 7} y={ly + 3} fill="#292524" fontSize="8">{v}</text>
                </g>
              );
            })}
            <line x1={METER.cx} y1={METER.cy} x2={nx} y2={ny} stroke="#b91c1c" strokeWidth="2" />
            <circle cx={METER.cx} cy={METER.cy} r="4" fill="#292524" />
            <text x={METER.cx - 22} y={METER.cy + 30} fill="#292524" fontSize="9">{Math.round(voltage)} V</text>
            <text x={METER.cx - 26} y={METER.cy + 42} fill="#57534e" fontSize="7">{tx('ĐIỆN ÁP 314')}</text>

            {/* 4 cầu dao gạt + cầu chì sứ */}
            {SWITCHES.map((s) => {
              const on = sw[s.id];
              const is314 = s.id === 's314';
              const clickable = step === 'balance';
              return (
                <g key={s.id} onClick={() => toggleSwitch(s.id)} style={{ cursor: clickable ? 'pointer' : 'default' }}>
                  <rect x={s.x - 18} y="30" width="36" height="62" fill="#27241f" stroke="#57534e" />
                  <rect x={s.x - 4} y="36" width="8" height="50" fill="#0c0a09" />
                  <rect x={s.x - 9} y={on ? 38 : 66} width="18" height="18" fill={on ? '#a8a29e' : '#57534e'} stroke="#1c1917" />
                  <text x={s.x - 11} y="104" fill={is314 ? '#fbbf24' : '#d6d3d1'} fontSize="9">{tx(s.label)}</text>
                  <text x={s.x - 9} y="116" fill={on ? '#86efac' : '#78716c'} fontSize="7">{on ? 'ON' : 'OFF'}</text>
                  {/* Cầu chì sứ bên dưới */}
                  <rect x={s.x - 12} y="150" width="24" height="34" fill="#e7e5e4" stroke="#78716c" />
                  {is314 ? (
                    <g onClick={(e) => { e.stopPropagation(); clickFuse(); }} style={{ cursor: step === 'fuse' ? 'pointer' : 'default' }}>
                      {!fuseOut && <rect x={s.x - 8} y="154" width="16" height="26" fill="#1c1917" />}
                      {!fuseOut && <rect x={s.x - 3} y="158" width="2" height="18" fill="#7c2d12" />}
                      {fuseOut && step === 'fuse' && <rect x={s.x - 8} y="154" width="16" height="26" fill="#0c0a09" stroke="#fbbf24" strokeDasharray="3 2" />}
                      {step !== 'fuse' && (
                        <polyline points={`${s.x - 6},156 ${s.x + 4},162 ${s.x - 4},168 ${s.x + 6},174 ${s.x - 2},180`} fill="none" stroke={hasClip ? '#cbd5e1' : '#d97706'} strokeWidth="1.5" />
                      )}
                      {step === 'fuse' && !fuseOut && <rect x={s.x - 10} y="152" width="20" height="30" fill="none" stroke="#fbbf24" strokeDasharray="3 2" />}
                    </g>
                  ) : (
                    <rect x={s.x - 6} y="156" width="12" height="22" fill="#a8a29e" />
                  )}
                </g>
              );
            })}

            {/* Cọc đấu dây */}
            {TERMS.map((tm) => {
              const busy = Object.values(links).includes(tm.id);
              const hot = step === 'wire' && held !== null && !busy;
              return (
                <g key={tm.id} onClick={() => clickTerm(tm.id)} style={{ cursor: hot ? 'pointer' : 'default' }}>
                  <rect x={tm.x - 10} y={tm.y - 8} width="20" height="20" fill={tm.id === 'X' ? '#3f3a33' : '#78716c'} stroke={hot ? '#fbbf24' : '#1c1917'} />
                  <circle cx={tm.x} cy={tm.y + 2} r="4" fill={tm.id === 'X' ? '#7c2d12' : '#d6d3d1'} />
                  <text x={tm.x - 6} y={tm.y + 26} fill="#d6d3d1" fontSize="8">{tm.label}</text>
                </g>
              );
            })}

            {/* Ba dây bị chuột cắn: từ ống luồn dưới đáy hộp lên cọc (hoặc lủng lẳng) */}
            <rect x="92" y="284" width="40" height="11" fill="#1c1917" />
            {WIRES.map((w) => {
              const [ex, ey] = wireEnd(w);
              const [rx, ry] = w.root;
              const path = `M${rx},${ry} Q${(rx + ex) / 2 - 10},${Math.min(ry, ey) + 10} ${ex},${ey}`;
              const isHeld = held === w.id;
              return (
                <g key={w.id} onClick={() => clickWire(w.id)} style={{ cursor: step === 'wire' && !links[w.id] ? 'pointer' : 'default' }}>
                  <path d={path} fill="none" stroke={w.color} strokeWidth="5" />
                  {w.stripe && <path d={path} fill="none" stroke={w.stripe} strokeWidth="5" strokeDasharray="4 4" />}
                  {/* Đầu lõi đồng tuốt trần */}
                  <rect x={ex - 3} y={ey - 3} width="6" height="6" fill="#d97706" stroke={isHeld ? '#fde68a' : 'none'} strokeWidth="2" />
                  {!links[w.id] && step === 'wire' && <rect x={ex - 6} y={ey - 6} width="12" height="12" fill="transparent" stroke={isHeld ? '#fde68a' : '#78716c'} strokeDasharray="2 2" />}
                </g>
              );
            })}

            {/* Điểm hở cần bọc băng keo */}
            {step === 'tape' && TAPE_SPOTS.map(([x, y], i) => (
              <g key={i} onClick={() => clickTape(i)} style={{ cursor: taped[i] ? 'default' : 'pointer' }}>
                {taped[i]
                  ? <rect x={x - 7} y={y - 4} width="14" height="8" fill="#18181b" stroke="#3f3f46" />
                  : <rect x={x - 8} y={y - 8} width="16" height="16" fill="transparent" stroke="#ef4444" strokeDasharray="3 2" />}
              </g>
            ))}
            {step !== 'tape' && taped.map((v, i) => v && (
              <rect key={i} x={TAPE_SPOTS[i][0] - 7} y={TAPE_SPOTS[i][1] - 4} width="14" height="8" fill="#18181b" stroke="#3f3f46" />
            ))}

            {/* Tia lửa chập điện */}
            {sparkAt && (
              <g>
                {Array.from({ length: 8 }, (_, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return <line key={i} x1={sparkAt[0]} y1={sparkAt[1]} x2={sparkAt[0] + Math.cos(a) * 16} y2={sparkAt[1] + Math.sin(a) * 16} stroke={i % 2 ? '#fde68a' : '#ffffff'} strokeWidth="2" />;
                })}
              </g>
            )}
            {step === 'done' && <rect x="72" y="10" width="400" height="285" fill="#fef3c7" opacity="0.12" />}
          </svg>
          {/* Bóng tối hành lang, khoét vòng sáng chập chờn theo chuột */}
          <div
            ref={lightRef}
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(circle 150px at var(--lx, 50%) var(--ly, 45%), rgba(0,0,0,0) 0%, rgba(0,0,0,calc(0.55 * var(--flick, 0.85))) 60%, rgba(0,0,0,calc(0.9 * var(--flick, 0.85))) 100%)',
              opacity: step === 'done' ? 0 : 1,
              transition: 'opacity 1.2s',
            }}
          />
        </div>

        {/* Lời dẫn / phản hồi của An */}
        <div className={`text-sm min-h-10 leading-relaxed ${sparkAt ? 'text-red-400' : step === 'done' ? 'text-emerald-300' : 'text-zinc-300'}`}>{tx(message)}</div>

        {/* Việc cần làm ngay bây giờ: ghi rõ bấm vào đâu */}
        {step !== 'done' && (
          <div className="border-l-2 border-amber-400 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 leading-relaxed">
            <span className="text-amber-300 font-bold">{tx('Việc cần làm:')} </span>
            {step === 'fuse' && tx('Thay cầu chì hỏng của phòng 314.')}
            {step === 'wire' && tx('Đấu lại ba sợi dây vào cọc.')}
            {step === 'tape' && tx('Bọc hết các chỗ lõi đồng còn hở. Còn {0} chỗ.', taped.filter((v) => !v).length)}
            {step === 'balance' && tx('Đưa kim vôn kế vào vạch xanh rồi đóng cầu dao 314.')}
            {/* Mẹo: chỉ hiện khi kẹt quá lâu hoặc làm sai nhiều lần */}
            {hint && (
              <div className="mt-1.5 text-xs text-zinc-400 italic">
                {step === 'fuse' && tx('An lẩm bẩm: Cầu chì cháy thì rút ra trước, rồi mới lắp dây chì vào khe trống.')}
                {step === 'wire' && tx('Trong nắp hộp có tấm nhãn dán mờ: "L - NÂU / N - XANH / PE - VÀNG SỌC XANH". Cọc gỉ đỏ thì đừng đụng.')}
                {step === 'tape' && tx('Mấy chỗ lõi đồng lộ ra là chỗ viền đỏ.')}
                {step === 'balance' && tx('An nhớ lời cô Tư: "Phòng nào chạy máy suốt đêm là cả dãy sụt điện." Kim tụt sâu theo từng đợt, như có thứ gì đang kéo tải.')}
              </div>
            )}
          </div>
        )}

        {/* Phím điều khiển */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          {step === 'balance' ? (
            <>
              <span><Key>{tx('Chuột')}</Key><Key>1</Key><Key>2</Key><Key>3</Key><Key>4</Key>{tx('Gạt cầu dao TỔNG / 312 / 314 / 316')}</span>
              <span><Key>Space</Key>{tx('Đóng cầu dao 314')}</span>
            </>
          ) : (
            <span><Key>{tx('Chuột')}</Key>{tx('Rê để soi đèn, bấm để thao tác')}</span>
          )}
          <span><Key>Esc</Key>{tx('Thoát (làm lại từ đầu)')}</span>
        </div>
      </div>
    </div>
  );
};
