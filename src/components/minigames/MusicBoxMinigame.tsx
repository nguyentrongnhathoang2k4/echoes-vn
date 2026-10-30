"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';

// =====================================================================
// GIAI ĐIỆU VALSE CỦA HỘP NHẠC (nhịp 3/4, 16 ô nhịp, lặp lại)
// Mỗi ô: [hợp âm gốc, nốt giai điệu [midi | null, số phách]...]
// =====================================================================
type Bar = { root: number; minor?: boolean; mel: Array<[number | null, number]> };
const WALTZ: Bar[] = [
  { root: 48, mel: [[76, 2], [79, 1]] },
  { root: 48, mel: [[84, 2], [83, 1]] },
  { root: 53, mel: [[81, 1], [79, 1], [77, 1]] },
  { root: 55, mel: [[79, 3]] },
  { root: 53, mel: [[77, 2], [81, 1]] },
  { root: 50, minor: true, mel: [[86, 2], [84, 1]] },
  { root: 55, mel: [[83, 1], [81, 1], [79, 1]] },
  { root: 55, mel: [[74, 3]] },
  { root: 48, mel: [[76, 2], [79, 1]] },
  { root: 57, minor: true, mel: [[84, 2], [88, 1]] },
  { root: 53, mel: [[86, 1], [84, 1], [81, 1]] },
  { root: 48, mel: [[79, 3]] },
  { root: 50, minor: true, mel: [[77, 1], [76, 1], [74, 1]] },
  { root: 55, mel: [[79, 2], [71, 1]] },
  { root: 48, mel: [[72, 3]] },
  { root: 48, mel: [[null, 3]] },
];
interface Beat { mel?: number; melLen?: number; bass?: number; chord?: number[] }
const BEATS: Beat[] = WALTZ.flatMap((bar) => {
  const beats: Beat[] = [{}, {}, {}];
  let at = 0;
  for (const [m, len] of bar.mel) {
    if (m !== null) beats[at] = { mel: m, melLen: len };
    at += len;
  }
  const third = bar.root + (bar.minor ? 3 : 4) + 12;
  beats[0].bass = bar.root;
  beats[1].chord = [third, bar.root + 19];
  beats[2].chord = [third, bar.root + 19];
  return beats;
});
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const BEAT_S = 0.4;              // Một phách lúc cót căng
const SERENE_S = 3.6;            // Mở nắp: giai điệu êm đềm bấy lâu
const DECAY_S = 4.2;             // Rồi lạc nhịp, chậm dần, méo dần thành tiếng bíp
const ECG_BEEP = 880;

interface MusicEngine {
  ctx: AudioContext;
  master: GainNode;
  dry: GainNode;
  shaper: WaveShaperNode;     // Nhánh méo tiếng (→ wet)
  wet: GainNode;
  next: number;                  // Thời điểm phách kế tiếp (giây, theo ctx)
  beat: number;
  openAt: number | null;
  ended: boolean;
  timer: ReturnType<typeof setInterval>;
}

/**
 * Một nốt: chuông hộp nhạc (sine + bội âm kim loại, gảy rồi tắt dần)
 * morph 0 → 1: dần thành tiếng bíp vuông, phẳng, cụt của máy đo điện tim
 */
function playNote(m: MusicEngine, when: number, freq: number, amp: number, morph: number) {
  const { ctx } = m;
  const out = ctx.createGain();
  out.connect(m.dry);
  out.connect(m.shaper);
  if (morph < 1) {
    for (const [mul, a, dur] of [[1, 1, 1.5], [2, 0.18, 0.6], [5.4, 0.07, 0.18]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp * a * (1 - morph), when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * (1 - morph * 0.85));
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
  }
  if (morph > 0) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp * 0.35 * morph, when + 0.005);
    g.gain.setValueAtTime(amp * 0.35 * morph, when + 0.11);
    g.gain.linearRampToValueAtTime(0, when + 0.13);
    o.connect(lp).connect(g).connect(out);
    o.start(when);
    o.stop(when + 0.15);
  }
}

/** Bíp máy đo nhịp tim (sạch, lạnh), dài = flatline */
function playMonitorBeep(m: MusicEngine, when: number, dur: number, amp: number) {
  const { ctx } = m;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = ECG_BEEP;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + 0.01);
  g.gain.setValueAtTime(amp, when + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.connect(lp).connect(g).connect(m.master);
  o.start(when);
  o.stop(when + dur + 0.05);
}

interface MusicBoxMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

export const MusicBoxMinigame: React.FC<MusicBoxMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  const [tension, setTension] = useState(20); // 0 -> 100%
  const [frequency, setFrequency] = useState(13.50); // Target: 17.05 MHz
  const [isLocked, setIsLocked] = useState(false);
  const [isBroken, setIsBroken] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isWindingRef = useRef(false);
  const musicRef = useRef<MusicEngine | null>(null);
  const tensionRef = useRef(tension);
  useEffect(() => {
    tensionRef.current = tension;
  }, [tension]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Tiếng ratchet khi lên dây cót (tách... tách...)
  const playRatchetSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.035);
      g.gain.setValueAtTime((volume / 100) * 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng chuông nốt nhạc nhẹ khi tần số gần đúng
  const playChimeNote = useCallback((pitchMultiplier = 1) => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25 * pitchMultiplier, t);
      g.gain.setValueAtTime((volume / 100) * 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    } catch {}
  }, [getAudioContext, volume]);

  /** Lên lịch trước ~0.25 giây: chạy theo lực căng cót, rồi theo dòng thời gian sau khi mở nắp */
  const tick = useCallback(() => {
    const m = musicRef.current;
    if (!m || m.ended) return;
    const { ctx } = m;
    const now = ctx.currentTime;
    const vol = volumeRef.current / 100;
    if (m.openAt === null) {
      // Cót sắp hết thì hộp im; vặn lại thì chạy tiếp từ chỗ dừng
      if (tensionRef.current < 25) {
        m.next = Math.max(m.next, now + 0.05);
        return;
      }
    }
    while (m.next < now + 0.25) {
      const when = m.next;
      const b = BEATS[m.beat % BEATS.length];
      let beatLen = BEAT_S;
      let pitch = 1;
      let morph = 0;
      let amp = 0.16 * vol;
      let skip = 0;
      if (m.openAt === null) {
        // Cót càng chùng nhạc càng chậm, càng nhỏ
        const k = tensionRef.current / 100;
        beatLen = BEAT_S * (1 + (1 - k) * 0.7);
        amp *= 0.55 + 0.45 * k;
      } else {
        const d = Math.max(0, Math.min(1, (when - m.openAt - SERENE_S) / DECAY_S));
        if (d >= 1) {
          // Hộp nhạc tắt hẳn: chỉ còn máy đo nhịp tim — bíp thưa dần rồi tút dài
          m.ended = true;
          [0.3, 1.3, 2.6].forEach((o) => playMonitorBeep(m, when + o, 0.13, 0.11 * vol));
          playMonitorBeep(m, when + 4.0, 3.2, 0.12 * vol);
          return;
        }
        beatLen = BEAT_S * (1 + d * 1.9) + (Math.random() - 0.5) * 0.18 * d;
        pitch = Math.pow(2, (-2.2 * d + (Math.random() - 0.5) * 1.2 * d) / 12);
        morph = Math.max(0, (d - 0.5) / 0.5);
        skip = 0.28 * d;
        m.wet.gain.setTargetAtTime(d * 0.7, when, 0.3);
        m.dry.gain.setTargetAtTime(1 - d * 0.5, when, 0.3);
      }
      const bend = (f: number) => f * pitch + (ECG_BEEP - f * pitch) * morph;
      if (b.mel !== undefined && Math.random() >= skip) playNote(m, when, bend(midiHz(b.mel)), amp, morph);
      if (b.bass !== undefined && Math.random() >= skip) playNote(m, when, midiHz(b.bass) * pitch, amp * 0.55 * (1 - morph), 0);
      if (b.chord && Math.random() >= skip) b.chord.forEach((n) => playNote(m, when, midiHz(n) * pitch, amp * 0.22 * (1 - morph), 0));
      m.next += Math.max(0.12, beatLen);
      m.beat++;
    }
  }, []);

  const ensureMusic = useCallback(() => {
    if (musicRef.current) return musicRef.current;
    const ctx = getAudioContext();
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    const dry = ctx.createGain();
    dry.connect(master);
    // Nhánh méo tiếng: bão hoà mềm, mở dần khi nhạc hỏng
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 9) * 0.6;
    }
    shaper.curve = curve;
    const wet = ctx.createGain();
    wet.gain.value = 0;
    shaper.connect(wet).connect(master);
    const m: MusicEngine = {
      ctx, master, dry, shaper, wet,
      next: ctx.currentTime + 0.05,
      beat: 0,
      openAt: null,
      ended: false,
      timer: setInterval(() => tick(), 40),
    };
    musicRef.current = m;
    return m;
  }, [getAudioContext, tick]);

  // Dừng nhạc, đóng âm thanh khi rời minigame
  useEffect(() => () => {
    if (musicRef.current) clearInterval(musicRef.current.timer);
    timersRef.current.forEach(clearTimeout);
    void audioCtxRef.current?.close().catch(() => {});
  }, []);

  // Kiểm tra tần số 17.05 MHz (ngưỡng 16.95 - 17.15)
  const isTargetFreq = Math.abs(frequency - 17.05) <= 0.12;

  useEffect(() => {
    if (isTargetFreq && !isLocked && tension >= 30) {
      setIsLocked(true);
      playChimeNote(1.2);
    } else if (!isTargetFreq && isLocked) {
      setIsLocked(false);
    }
  }, [frequency, isTargetFreq, isLocked, tension, playChimeNote]);

  // Khi người chơi ấn vặn cót: hộp nhạc bắt đầu ngân valse
  const handleWind = () => {
    if (isBroken) return;
    playRatchetSound();
    ensureMusic();
    const next = Math.min(100, tension + 15);
    tensionRef.current = next;
    setTension(next);
    if (next >= 100 && isTargetFreq) triggerTwist();
  };

  // Mở nắp: mảnh giấy viết tay + giai điệu chơi lại từ đầu, êm đềm vài giây rồi hỏng dần
  const triggerTwist = () => {
    if (isBroken) return;
    setIsBroken(true);
    const m = ensureMusic();
    if (m) {
      tensionRef.current = 100;
      m.openAt = m.ctx.currentTime + 0.1;
      m.next = m.openAt;
      m.beat = 0;
    }
    const later = (ms: number, fn: () => void) => timersRef.current.push(setTimeout(fn, ms));
    later(SERENE_S * 1000, () => setGlitchActive(true));
    // Nhạc tắt vào khoảng SERENE_S + DECAY_S (+ phần chậm dần), màn hình điện tim hiện cùng tiếng bíp đầu
    later((SERENE_S + DECAY_S + 1.6) * 1000, () => {
      setGlitchActive(false);
      setIsRevealed(true);
    });
  };

  // Giảm nhẹ cót theo thời gian nếu không vặn
  useEffect(() => {
    if (isBroken) return;
    const timer = setInterval(() => {
      if (!isWindingRef.current) {
        setTension((prev) => (prev > 15 ? prev - 2 : prev));
      }
    }, 800);
    return () => clearInterval(timer);
  }, [isBroken]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono select-none animate-fade-in">
      <div
        className={`relative w-full max-w-lg bg-zinc-950 border-2 rounded-lg shadow-[0_0_50px_rgba(244,114,182,0.3)] p-6 transition-all duration-300 ${
          glitchActive
            ? 'border-red-500 shadow-[0_0_70px_rgba(239,68,68,0.8)] animate-pulse scale-[1.02]'
            : 'border-amber-600/70'
        }`}
      >
        {/* Nút thoát / bỏ qua ở góc */}
        <div className="flex justify-between items-center pb-3 border-b border-amber-900/50 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
            <h2 className="text-sm sm:text-base font-bold text-amber-300 tracking-wider uppercase">
              {tx('Hộp Âm Nhạc Kỷ Niệm • Model 1705')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors"
          >
            {tx('[ESC] Bỏ qua')}
          </button>
        </div>

        {isBroken && !isRevealed ? (
          /* NẮP HỘP MỞ: MẢNH GIẤY VIẾT TAY */
          <div className="flex flex-col items-center py-4" style={{ animation: 'mb-fade 0.8s ease-out' }}>
            <style>{`
              @keyframes mb-fade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
              @keyframes mb-warp {
                0%, 100% { transform: rotate(-2deg) translate(0, 0); filter: none }
                20% { transform: rotate(-2.6deg) translate(-2px, 1px) skewX(2deg); filter: hue-rotate(-20deg) saturate(1.4) }
                45% { transform: rotate(-1.4deg) translate(2px, -1px); filter: blur(0.6px) contrast(1.3) }
                70% { transform: rotate(-2deg) translate(-1px, 0) skewX(-3deg); filter: hue-rotate(25deg) brightness(0.85) }
              }
            `}</style>
            <div className="text-[11px] text-amber-300/80 tracking-[0.3em] mb-3">
              {glitchActive ? tx('♪ GIAI ĐIỆU ĐANG LẠC NHỊP...') : tx('♪ NẮP HỘP BẬT MỞ ♪')}
            </div>
            <div
              className={`relative max-w-[88%] px-6 py-5 bg-[#f3ead7] text-stone-700 shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-stone-300/70 transition-colors duration-1000 ${
                glitchActive ? 'text-red-900' : ''
              }`}
              style={{
                transform: 'rotate(-2deg)',
                animation: glitchActive ? 'mb-warp 0.5s steps(2) infinite' : undefined,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 21px, rgba(120,113,108,0.18) 21px 22px)',
              }}
            >
              <p className="font-serif italic text-base sm:text-lg leading-relaxed text-center">
                {tx('[ Sinh nhật 22 tuổi • Tặng Miên của anh. Hãy luôn mỉm cười nhé! ]')}
              </p>
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 bg-amber-200/60 rotate-2" />
            </div>
            <p className={`mt-4 text-xs italic transition-colors duration-700 ${glitchActive ? 'text-red-400' : 'text-zinc-400'}`}>
              {glitchActive
                ? tx('Tiếng chuông ngân chậm dần, méo đi... như có ai đang kéo dây cót ngược lại.')
                : tx('Nét chữ của chính mình. Mình chẳng nhớ đã viết nó lúc nào.')}
            </p>
          </div>
        ) : !isRevealed ? (
          <div>
            <p className="text-xs text-zinc-300 mb-4 leading-relaxed text-justify">
              {tx('Chiếc hộp nhạc gỗ khảm hoa văn Bến An Yên. Trục cót bị kẹt cứng ở vòng quay cuối cùng và kim tần số âm thanh bị lệch.')}
              <span className="text-amber-400 font-semibold block mt-1">
                {tx('👉 Nhiệm vụ: Xoay cót lên 100% và kéo thanh trượt để đồng bộ tần số ký ức (17.05 MHz).')}
              </span>
            </p>

            {/* Khung mô phỏng Hộp Nhạc Cổ Điển */}
            <div className="bg-gradient-to-b from-amber-950/40 to-zinc-950 border border-amber-700/60 rounded p-4 mb-4 relative overflow-hidden">
              {/* Vòng quay bánh răng và gauge cót */}
              <div className="flex flex-col sm:flex-row items-center justify-around gap-4 my-2">
                {/* Núm vặn cót */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleWind}
                    disabled={isBroken}
                    className="w-20 h-20 rounded-full border-4 border-amber-500 bg-amber-900/40 hover:bg-amber-800/60 active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.3)] flex flex-col items-center justify-center transition-transform cursor-pointer group"
                  >
                    <span className="text-2xl group-hover:rotate-45 transition-transform duration-200">
                      ⚙️
                    </span>
                    <span className="text-[10px] font-bold text-amber-300 mt-0.5">{tx('VẶN CÓT')}</span>
                  </button>
                  <span className="text-[11px] text-zinc-400">
                    {tx('Lực căng cót:')} <strong className="text-amber-300">{tension}%</strong>
                  </span>
                </div>

                {/* Đồng hồ đo tần số */}
                <div className="w-full sm:w-56 bg-black/70 border border-amber-800/50 rounded p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">{tx('Tần số bộ dao động:')}</span>
                    <span
                      className={`font-bold font-mono px-2 py-0.5 rounded text-xs ${
                        isTargetFreq
                          ? 'bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse'
                          : 'bg-zinc-900 border border-zinc-700 text-amber-400'
                      }`}
                    >
                      {frequency.toFixed(2)} MHz
                    </span>
                  </div>

                  {/* Thanh trượt điều chỉnh tần số */}
                  <input
                    type="range"
                    min="12.00"
                    max="22.00"
                    step="0.05"
                    value={frequency}
                    disabled={isBroken}
                    onChange={(e) => setFrequency(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                  />

                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>12.00 MHz</span>
                    <span className="text-amber-400/80 font-bold">17.05 MHz [SYNC]</span>
                    <span>22.00 MHz</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isTargetFreq ? 'bg-emerald-400 animate-ping' : 'bg-red-500/60'
                      }`}
                    />
                    <span className="text-[10px] text-zinc-400">
                      {isTargetFreq ? tx('Tín hiệu trùng khớp (17.05 MHz)') : tx('Sóng bị lệch tần...')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Thanh tiến trình Tension Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>{tx('Trữ năng lò xo')}</span>
                  <span className={tension >= 100 ? 'text-emerald-400 font-bold' : ''}>
                    {tension >= 100 ? tx('Cực đại • Sẵn sàng phát') : `${tension}/100%`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-900 border border-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      tension >= 100
                        ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                        : isTargetFreq
                        ? 'bg-amber-400'
                        : 'bg-amber-600'
                    }`}
                    style={{ width: `${tension}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Gợi ý tương tác */}
            <div className="flex justify-between items-center text-xs text-zinc-400">
              <span>{tx('* Nhấn vặn cót liên tục và kéo thanh trượt về 17.05')}</span>
              <button
                onClick={() => {
                  setTension(100);
                  setFrequency(17.05);
                  triggerTwist();
                }}
                className="text-[11px] text-amber-400/80 hover:text-amber-300 underline cursor-pointer"
              >
                {tx('[Tự động đồng bộ]')}
              </button>
            </div>
          </div>
        ) : (
          /* MÀN HÌNH TWIST PHÁT HIỆN SỰ THẬT Y TẾ */
          <div className="animate-fade-in flex flex-col items-center text-center">
            <div className="w-full bg-red-950/40 border-2 border-red-500/80 rounded-lg p-4 mb-4 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
              <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-bold tracking-widest uppercase mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                {tx('CẢNH BÁO: TÍN HIỆU SINH HIỆU NGUY KỊCH')}
              </div>

              {/* Màn hình điện tim LCD */}
              <div className="bg-black border border-red-800 rounded p-3 text-left font-mono text-xs mb-3 text-red-400">
                <div className="flex justify-between border-b border-red-900/60 pb-1 mb-2 text-[11px] text-zinc-400">
                  <span>HOSPITAL_ECG_MONITOR // V4.1</span>
                  <span className="text-red-400 animate-pulse">ICU • BED_03</span>
                </div>
                <div className="text-sm font-bold text-red-500 mb-1">
                  PATIENT: TRẦN HOÀNG AN • AGE: 24
                </div>
                <div className="flex justify-between items-center my-1 text-xs">
                  <span>{tx('NHỊP TIM (HR):')}</span>
                  <span className="text-red-300 text-base font-bold animate-pulse">38 BPM ↓ CRITICAL</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>SPO2:</span>
                  <span className="text-amber-400">{tx('81% (SUY HÔ HẤP CẤP)')}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-2 italic">
                  {tx('[17/05 - 03:11:47] ALARM: NHỊP CHẬM NGUY KỊCH (HR < 40) — GỌI BÁC SĨ TRỰC CẤP CỨU...')}
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed italic text-justify">
                {tx('Mảnh giấy nhoè đi trong tay... Bên dưới nó không hề có bánh răng đồng hay bộ gõ nốt nhạc nào cả. Đó là một')}{' '}
                <strong className="text-red-400">{tx('bo mạch cảm biến điện tim y tế của bệnh viện')}</strong>{' '}
                {tx('đang phát ra tiếng bíp ngắt quãng, rồi rít lên một hồi tút dài ghê rợn. Giai điệu mộc mạc lúc nãy... chưa từng phát ra từ chiếc hộp này.')}
              </p>
            </div>

            <button
              onClick={onComplete}
              className="w-full py-2.5 bg-red-700 hover:bg-red-600 active:scale-98 text-white font-bold text-sm tracking-wide rounded shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all cursor-pointer"
            >
              {tx('[ĐÓNG NẮP HỘP NHẠC]')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
