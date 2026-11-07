"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface MusicBoxMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  /** Đoán bừa sai (chập điện, ghép nhầm mảnh, cót bật...): trang trừ Sanity */
  onPenalty?: () => void;
  volume?: number;
}

/**
 * KHÔI PHỤC GIAI ĐIỆU VALSE (Màn 2) — một thao tác: bấm 2 thanh nốt để đổi chỗ cho nhau.
 * Lược đồng có 4 thanh gảy. Trục gai quét lần lượt từ trái sang phải, nên giai điệu đúng phải đi lên đều:
 * Đồ → Mi → Sol → Đố. Hai thanh giữa bị va đập cắm lộn chỗ (Sol nằm trước Mi) nên valse bị chỏi một nốt.
 * Gợi ý vật lý: thanh càng ngắn kêu càng cao. Bấm một thanh để nghe riêng nó, [CHẠY THỬ] để nghe cả đoạn.
 * Xếp đúng: valse trong veo, rồi tới cuối câu nhạc thì vấp: hai nốt cuối lặp mãi như đĩa xước, lệch dần cao độ,
 * rồi nắp hộp bật mở. (Cài ngầm cho vòng lặp hộp nhạc ở Ending B; Màn 2 không nhắc gì tới bệnh viện.)
 * Chống bấm bừa: thứ tự đầu xáo ngẫu nhiên mỗi lần mở (không thanh nào đúng chỗ); chỉ thắng khi bấm
 * [CHẠY THỬ] với đúng thứ tự; chạy thử sai 3 lần thì dây cót bật, lược bị xáo lại và trừ Sanity.
 */
const NOTES = [
  { id: 'C5', name: 'Đồ', f: 523.25, len: 1 },
  { id: 'E5', name: 'Mi', f: 659.25, len: 0.84 },
  { id: 'G5', name: 'Sol', f: 783.99, len: 0.72 },
  { id: 'C6', name: 'Đố', f: 1046.5, len: 0.56 },
] as const;
const MAX_WRONG_TESTS = 3;
// Xáo thứ tự thanh: không thanh nào nằm đúng chỗ (gọi lúc mở hộp / lúc cót bật, không gọi trong render)
const shuffleTines = (): number[] => {
  for (;;) {
    const a = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.every((n, i) => n !== i)) return a;
  }
};
// Đoạn valse 3/4: chỉ số VỊ TRÍ thanh trên lược (trục gai quét theo vị trí)
const PHRASE = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 1];
const BEAT_S = 0.24;
// Vòng lặp kẹt: hai nốt cuối của câu (vị trí 2 rồi 1) lặp lại, mỗi lượt chùng xuống một chút
const STUCK_REPEATS = 10;
const STUCK_DETUNE = 0.006;

export const MusicBoxMinigame: React.FC<MusicBoxMinigameProps> = ({ onComplete, onClose, onPenalty, volume = 80 }) => {
  useUiLayer(true);
  const [order, setOrder] = useState<number[]>(shuffleTines);
  const wrongTestsRef = useRef(0);
  const [wrongTests, setWrongTests] = useState(0);
  const orderRef = useRef(order);
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);   // Vị trí thanh đang được gảy
  const [phase, setPhase] = useState<'idle' | 'test' | 'win' | 'stuck' | 'open'>('idle');
  const phaseRef = useRef(phase);
  const [note, setNote] = useState('Nắp hộp nhạc hé mở. Lược đồng bên trong có 4 thanh gảy, bị va đập cắm lộn xộn cả.');
  const cbRef = useRef({ onComplete, onClose, onPenalty });
  useEffect(() => {
    cbRef.current = { onComplete, onClose, onPenalty };
  }, [onComplete, onClose, onPenalty]);
  const timersRef = useRef<number[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const go = useCallback((p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

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
  // Nốt hộp nhạc: sine + bồi âm bậc 4, tắt dần như lá đồng rung
  const pluck = useCallback((f: number, delay = 0, decay = 1.2) => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime + delay;
    for (const [mul, amp] of [[1, 0.12], [4, 0.02]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }, [ac, vol]);
  const clack = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    g.gain.setValueAtTime(0.05 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.08);
  }, [ac, vol]);
  // Trục gai quét đoạn valse theo thứ tự thanh hiện tại
  const playPhrase = useCallback((ord: number[], onEnd: () => void, repeats = 1) => {
    const seq = Array.from({ length: repeats }, () => PHRASE).flat();
    seq.forEach((pos, i) => {
      pluck(NOTES[ord[pos]].f, i * BEAT_S, 1.1);
      later(i * BEAT_S * 1000, () => setPlaying(pos));
    });
    later(seq.length * BEAT_S * 1000, () => {
      setPlaying(null);
      onEnd();
    });
    return seq.length * BEAT_S;
  }, [later, pluck]);

  const isCorrect = (ord: number[]) => ord.every((n, i) => n === i);

  const win = useCallback(() => {
    go('win');
    setNote('Điệu valse vang lên trong veo, đúng như buổi chiều hôm ấy...');
    const ord = [0, 1, 2, 3];
    const len = playPhrase(ord, () => {}, 1);
    // Cuối câu nhạc: trục gai vấp, hai nốt cuối lặp mãi như đĩa xước, cao độ chùng dần
    const tail = [PHRASE[PHRASE.length - 2], PHRASE[PHRASE.length - 1]];
    for (let i = 0; i < STUCK_REPEATS; i++) {
      const pos = tail[i % 2];
      const at = len + i * BEAT_S;
      pluck(NOTES[ord[pos]].f * (1 - i * STUCK_DETUNE), at, 0.5);
      later(at * 1000, () => setPlaying(pos));
    }
    later(len * 1000, () => {
      go('stuck');
      setNote('Tới cuối câu nhạc thì vấp. Hai nốt cuối cứ lặp đi lặp lại... như đĩa xước.');
    });
    const end = len + STUCK_REPEATS * BEAT_S;
    later(end * 1000, () => {
      setPlaying(null);
      clack();
      go('open');
      setNote('Nắp hộp bật mở.');
    });
    later((end + 1.4) * 1000, () => cbRef.current.onComplete());
  }, [clack, go, later, playPhrase, pluck]);

  const pressBar = useCallback((pos: number) => {
    if (phaseRef.current !== 'idle') return;
    void ac();
    pluck(NOTES[orderRef.current[pos]].f);
    setPlaying(pos);
    later(250, () => setPlaying(null));
    const prev = pickedRef.current;
    if (prev === null || prev === pos) {
      pickedRef.current = prev === pos ? null : pos;
      setPicked(pickedRef.current);
      return;
    }
    const next = [...orderRef.current];
    [next[prev], next[pos]] = [next[pos], next[prev]];
    orderRef.current = next;
    pickedRef.current = null;
    setOrder(next);
    setPicked(null);
    clack();
    // Không tự thắng khi đổi đúng: phải tự tin bấm [CHẠY THỬ]
    setNote('Đổi chỗ hai thanh. Bấm [CHẠY THỬ] để nghe lại cả đoạn.');
  }, [ac, clack, later, pluck]);

  const test = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    void ac();
    pickedRef.current = null;
    setPicked(null);
    if (isCorrect(orderRef.current)) {
      win();
      return;
    }
    go('test');
    wrongTestsRef.current += 1;
    setWrongTests(wrongTestsRef.current);
    const snapped = wrongTestsRef.current >= MAX_WRONG_TESTS;
    setNote(snapped
      ? 'Trục gai quay lạc nhịp... dây cót căng quá, sắp bật rồi!'
      : 'Trục gai quay... có chỗ chỏi tai, như ai hát lạc giọng giữa bài. Dây cót căng thêm một nấc.');
    playPhrase(orderRef.current, () => {
      if (!snapped) {
        go('idle');
        return;
      }
      // Cót bật: lược đồng xô lệch, thứ tự thanh bị xáo lại từ đầu
      const next = shuffleTines();
      orderRef.current = next;
      setOrder(next);
      wrongTestsRef.current = 0;
      setWrongTests(0);
      clack();
      cbRef.current.onPenalty?.();
      setNote('PHỰT! Dây cót bật tung, lược đồng xô lệch hết cả. Phải nghe lại từng thanh từ đầu.');
      go('idle');
    });
  }, [ac, clack, go, playPhrase, win]);

  // ---------------- Bàn phím ----------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (phaseRef.current === 'idle' || phaseRef.current === 'test') cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      const idx = ['1', '2', '3', '4'].indexOf(k);
      if (idx >= 0) pressBar(idx);
      if (k === ' ' || k === 'enter') test();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [pressBar, test]);

  const spinning = phase === 'test' || phase === 'win' || phase === 'stuck';

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-start justify-center p-3 font-mono overflow-y-auto">
      <style>{'@keyframes mb-spin{from{background-position:0 0}to{background-position:0 24px}}'}</style>
      <div className="w-full max-w-lg my-auto bg-zinc-950 border border-zinc-700 p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('HỘP NHẠC GỖ • BẾN AN YÊN')}</div>
          <div className="text-xs text-zinc-500">{`${tx('Dây cót')} ${'■'.repeat(wrongTests)}${'□'.repeat(MAX_WRONG_TESTS - wrongTests)}`}</div>
        </div>

        {/* Lòng hộp nhạc: trục gai quay + lược đồng 4 thanh */}
        <div className="relative bg-[#3b2414] border-4 border-[#5b3a22] p-3">
          <div
            className="h-6 mb-2 border border-[#8a6a2f]"
            style={{
              background: 'repeating-linear-gradient(180deg, #b08d3c 0 3px, #8a6a2f 3px 6px), #a07a35',
              backgroundSize: '100% 24px',
              animation: spinning ? 'mb-spin 0.4s linear infinite' : undefined,
              filter: phase === 'stuck' || phase === 'open' ? 'grayscale(1) brightness(0.6)' : undefined,
            }}
          />
          <div className="flex items-start justify-center gap-6 h-28">
            {order.map((n, pos) => {
              const nt = NOTES[n];
              const isPicked = picked === pos;
              const isPlaying = playing === pos;
              return (
                <button
                  key={pos}
                  onClick={() => pressBar(pos)}
                  disabled={phase !== 'idle'}
                  className="flex flex-col items-center gap-1 cursor-pointer disabled:cursor-default"
                  title={tx('Bấm để nghe / chọn đổi chỗ')}
                >
                  <span
                    className={`block w-6 border-2 transition-transform ${isPicked ? 'border-amber-300' : 'border-[#5b3a22]'}`}
                    style={{
                      height: `${nt.len * 92}px`,
                      background: phase === 'stuck' || phase === 'open' ? '#6b7280' : '#c9a24a',
                      transform: isPlaying ? 'translateX(2px)' : undefined,
                    }}
                  />
                  <span className="text-[10px] text-zinc-400">{pos + 1}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`text-sm leading-relaxed min-h-10 ${phase === 'stuck' || phase === 'open' ? 'text-red-400' : phase === 'win' ? 'text-emerald-300' : 'text-zinc-300'}`}>{tx(note)}</div>

        <button
          onClick={test}
          disabled={phase !== 'idle'}
          className="w-full py-2 text-sm font-bold text-zinc-100 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 disabled:text-zinc-600 cursor-pointer"
        >
          {tx('[ CHẠY THỬ ]')}
        </button>

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>{tx('Chuột')}</Key><Key>1</Key><Key>2</Key><Key>3</Key><Key>4</Key>{tx('Nghe / chọn 2 thanh để đổi chỗ')}</span>
          <span><Key>Space</Key>{tx('Chạy thử')}</span>
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
