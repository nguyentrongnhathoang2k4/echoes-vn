"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';

interface DefibrillatorMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

type EnergyLevel = 100 | 200 | 360;

/**
 * idle     : chọn mức Joules, chờ nạp
 * charging : tụ đang nạp (2.5 giây)
 * armed    : đã nạp đầy — phải xả điện đúng lúc đỉnh R đi qua vùng tâm thu (QTE)
 * success  : sốc trúng nhịp, nhịp xoang 72 BPM
 * flatline : bấm trượt / lỡ 3 nhịp — tim ngừng, An co giật, phải nạp lại từ đầu
 */
type Phase = 'idle' | 'charging' | 'armed' | 'success' | 'flatline';

// ---- Màn hình oscilloscope ----
const SCREEN_W = 480;
const SCREEN_H = 160;
const SCROLL_SPEED = 150;              // px/giây, sóng chạy từ phải sang trái
const ZONE_X = SCREEN_W / 2;           // Tâm vùng tâm thu
const ZONE_HALF = 20;                  // Vùng rộng 40px
const HIT_GRACE = 4;                   // Nới nhẹ cho độ trễ của mắt / phím
const MAX_MISSED = 3;
const FLATLINE_MS = 2800;              // Tim ngừng bao lâu trước khi cho nạp lại
const SUCCESS_CLOSE_MS = 6000;         // Nhịp xoang ổn định bao lâu thì tự đóng (đủ đọc lời bác sĩ)
const WARMUP_LEAD = 150;               // Vừa nạp xong: đỉnh R đang cách vùng chưa tới ~1 giây không tính là lỡ

export const DefibrillatorMinigame: React.FC<DefibrillatorMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyLevel>(200);
  const [chargeProgress, setChargeProgress] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [flashWhite, setFlashWhite] = useState<boolean>(false);
  const [revealedAudio, setRevealedAudio] = useState<boolean>(false);
  const revealedRef = useRef(false);
  useEffect(() => {
    revealedRef.current = revealedAudio;
  }, [revealedAudio]);
  const [bpm, setBpm] = useState<number>(38);
  const [missed, setMissed] = useState<number>(0);
  const [failCount, setFailCount] = useState<number>(0);

  const isCharging = phase === 'charging';
  const isCharged = phase === 'armed';
  const isShocked = phase === 'success';

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chargeSoundOscRef = useRef<OscillatorNode | null>(null);
  const chargeSoundGainRef = useRef<GainNode | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Vòng lặp vẽ đọc trạng thái qua ref (không khởi động lại mỗi lần đổi pha)
  const phaseRef = useRef<Phase>('idle');
  const scrollRef = useRef(0);                 // Quãng sóng đã trôi (px)
  const peaksRef = useRef<number[]>([]);        // Toạ độ "thế giới" của các đỉnh R
  const judgedRef = useRef<Set<number>>(new Set());
  const missedRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // Tự đóng sau vài giây hoặc bấm nút đặt bàn sốc xuống: chỉ báo hoàn thành một lần
  const doneRef = useRef(false);
  const complete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // Khởi tạo AudioContext an toàn
  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Tiếng click nút bấm cơ học
  const playButtonBlip = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.04);
      g.gain.setValueAtTime((volume / 100) * 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }, [getAudioContext, volume]);

  // Bắt đầu âm thanh nạp tụ điện tăng dần tần số
  const startChargeSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 2.5); // Rít cao dần

      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime((volume / 100) * 0.05, t + 0.2);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);

      chargeSoundOscRef.current = osc;
      chargeSoundGainRef.current = g;
    } catch {}
  }, [getAudioContext, volume]);

  // Dừng âm thanh nạp điện
  const stopChargeSound = useCallback(() => {
    if (chargeSoundOscRef.current) {
      try {
        chargeSoundOscRef.current.stop();
        chargeSoundOscRef.current.disconnect();
      } catch {}
      chargeSoundOscRef.current = null;
    }
  }, []);

  // Tiếng sốc điện giải phóng xung lực cực mạnh (CLEAR!)
  const playShockSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      // 1. Tiếng cạch công tắc hồ quang điện
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
      g.gain.setValueAtTime((volume / 100) * 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);

      // 2. Tiếng nổ xung điện trắng (White Noise Thump)
      const bufferSize = ctx.sampleRate * 0.25;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime((volume / 100) * 0.09, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng bíp hồi sinh nhịp xoang đều đặn 72 BPM
  const playNormalHeartbeatBeep = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, t); // C6 nốt cao khỏe khoắn
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      g.gain.setValueAtTime((volume / 100) * 0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }, [getAudioContext, volume]);

  // Bíp trầm, đục mỗi khi đỉnh R của nhịp rung thất đi qua vùng tâm thu
  const playWeakBeep = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      g.gain.setValueAtTime((volume / 100) * 0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    } catch {}
  }, [getAudioContext, volume]);

  // TÍÍÍÍÍ... — tim ngừng đập (Flatline 0 BPM)
  const playFlatlineSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(960, t);
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const dur = FLATLINE_MS / 1000 - 0.2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((volume / 100) * 0.07, t + 0.02);
      g.gain.setValueAtTime((volume / 100) * 0.07, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(lp).connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch {}
  }, [getAudioContext, volume]);

  // Giữ bản mới nhất của tiếng bíp cho vòng lặp vẽ
  const beepRef = useRef(playWeakBeep);
  useEffect(() => {
    beepRef.current = playWeakBeep;
  }, [playWeakBeep]);

  // Hành động bắt đầu nạp điện
  const handleStartCharging = () => {
    if (phase !== 'idle') return;
    playButtonBlip();
    goPhase('charging');
    setChargeProgress(0);
    startChargeSound();
  };

  // Tiến trình nạp năng lượng (0 -> 100% trong 2.5 giây) → vào trạng thái căn nhịp
  useEffect(() => {
    if (!isCharging) return;
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(100, progress + 4);
      setChargeProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        stopChargeSound();
        // Đỉnh R đã qua vùng, hoặc sắp tới quá sát để kịp phản xạ, không tính là lỡ nhịp (vẫn sốc trúng được)
        peaksRef.current.forEach((x) => {
          if (x - scrollRef.current < ZONE_X + WARMUP_LEAD) judgedRef.current.add(x);
        });
        missedRef.current = 0;
        setMissed(0);
        goPhase('armed');
      }
    }, 100);

    return () => {
      clearInterval(interval);
      stopChargeSound();
    };
  }, [isCharging, stopChargeSound, goPhase]);

  /** Sốc trúng nhịp: chớp trắng, phóng điện, nhịp xoang 72 BPM, tự đóng sau vài giây */
  const succeed = useCallback(() => {
    playShockSound();
    goPhase('success');
    setFlashWhite(true);
    later(350, () => setFlashWhite(false));
    later(900, () => {
      setBpm(72);
      setRevealedAudio(true);
      playNormalHeartbeatBeep();
    });
    later(900 + SUCCESS_CLOSE_MS, complete);
  }, [complete, goPhase, later, playNormalHeartbeatBeep, playShockSound]);

  /** Trượt nhịp: tim ngừng, còi réo, An co giật — xả hết tụ, phải nạp lại */
  const fail = useCallback((shocked: boolean) => {
    if (shocked) playShockSound();
    playFlatlineSound();
    goPhase('flatline');
    setBpm(0);
    setChargeProgress(0);
    setFailCount((n) => n + 1);
    later(FLATLINE_MS, () => {
      setBpm(38);
      goPhase('idle');
    });
  }, [goPhase, later, playFlatlineSound, playShockSound]);

  /** Space / nút CLEAR: chỉ trúng khi có đỉnh R nằm trong vùng tâm thu */
  const handleTriggerShock = useCallback(() => {
    if (phaseRef.current !== 'armed') return;
    const hit = peaksRef.current.some((x) => Math.abs(x - scrollRef.current - ZONE_X) <= ZONE_HALF + HIT_GRACE);
    if (hit) succeed();
    else fail(true);
  }, [succeed, fail]);

  // Space xả điện (sau khi cứu được: đặt bàn sốc xuống); Esc đóng máy.
  // Nghe ở pha capture và chặn phím lại để trang không mở menu tạm dừng / Màn 3 không xử lý trùng.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSpace = e.code === 'Space' || e.key === ' ';
      if (!isSpace && e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (phaseRef.current === 'success') {
        // Đã cứu được An: đóng = hoàn thành (giữ phần thưởng Sanity)
        if (revealedRef.current) complete();
      } else if (e.key === 'Escape') {
        onCloseRef.current();
      } else if (isSpace) {
        handleTriggerShock();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleTriggerShock, complete]);

  // Vòng lặp vẽ sóng điện tim trên màn hình CRT (Canvas) — chạy một lần, đọc pha qua ref
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let last = performance.now();
    let sinusOffset = 0;
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // Đỉnh R của nhịp rung thất: thưa và không đều (~38 BPM)
    const spawnPeaks = () => {
      const peaks = peaksRef.current;
      let lastX = peaks.length ? peaks[peaks.length - 1] : scrollRef.current + width * 0.8;
      while (lastX < scrollRef.current + width + 300) {
        lastX += 170 + Math.random() * 120;
        peaks.push(lastX);
      }
      // Bỏ các đỉnh đã trôi khỏi mép trái
      while (peaks.length && peaks[0] - scrollRef.current < -40) {
        judgedRef.current.delete(peaks[0]);
        peaks.shift();
      }
    };

    /** Độ lệch y của phức bộ QRS quanh một đỉnh R (dx = khoảng cách tới đỉnh) */
    const qrs = (dx: number) => {
      if (dx < -9 || dx > 9) return 0;
      if (dx < -5) return 7 * ((dx + 9) / 4);                // Q chúc xuống
      if (dx <= 0) return 7 - 62 * ((dx + 5) / 5);             // R vọt đỉnh
      if (dx < 5) return -55 + 75 * (dx / 5);                  // S rơi sâu
      return 20 * (1 - (dx - 5) / 4);                          // Về đường đẳng điện
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      const vfibMode = ph === 'idle' || ph === 'charging' || ph === 'armed';

      if (vfibMode) {
        scrollRef.current += SCROLL_SPEED * dt;
        spawnPeaks();
        // Đỉnh R vừa đi qua tâm vùng: bíp; đã qua hẳn mép trái vùng mà chưa sốc → lỡ một nhịp
        for (const x of peaksRef.current) {
          const sx = x - scrollRef.current;
          const prevSx = sx + SCROLL_SPEED * dt;
          if (prevSx > ZONE_X && sx <= ZONE_X) beepRef.current();
          if (ph === 'armed' && sx < ZONE_X - ZONE_HALF - HIT_GRACE && !judgedRef.current.has(x)) {
            judgedRef.current.add(x);
            missedRef.current += 1;
            setMissed(missedRef.current);
            if (missedRef.current >= MAX_MISSED) fail(false);
          }
        }
      } else {
        sinusOffset = (sinusOffset + 150 * dt) % width;
      }

      // Xóa màn hình với màu xanh ngọc sẫm của CRT y tế
      ctx.fillStyle = ph === 'flatline' && Math.floor(now / 250) % 2 === 0 ? '#2a0606' : '#021e1a';
      ctx.fillRect(0, 0, width, height);

      // Lưới tọa độ y khoa
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vùng tâm thu (hit-zone): sáng rực khi có đỉnh R nằm bên trong
      if (ph === 'armed') {
        const inZone = peaksRef.current.some((x) => Math.abs(x - scrollRef.current - ZONE_X) <= ZONE_HALF);
        const pulse = 0.5 + Math.sin(now / 120) * 0.2;
        ctx.fillStyle = inZone ? 'rgba(250, 204, 21, 0.32)' : `rgba(34, 211, 238, ${0.1 * pulse + 0.05})`;
        ctx.fillRect(ZONE_X - ZONE_HALF, 0, ZONE_HALF * 2, height);
        ctx.fillStyle = inZone ? '#fde047' : '#22d3ee';
        ctx.fillRect(ZONE_X - ZONE_HALF, 0, 2, height);
        ctx.fillRect(ZONE_X + ZONE_HALF - 2, 0, 2, height);
        // Ngoặc vuông ở hai đầu vùng
        ctx.fillRect(ZONE_X - ZONE_HALF, 0, 8, 2);
        ctx.fillRect(ZONE_X + ZONE_HALF - 8, 0, 8, 2);
        ctx.fillRect(ZONE_X - ZONE_HALF, height - 2, 8, 2);
        ctx.fillRect(ZONE_X + ZONE_HALF - 8, height - 2, 8, 2);
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(inZone ? '▼ CLEAR ▼' : 'R', ZONE_X, height - 6);
        ctx.textAlign = 'start';
      }

      // Vẽ sóng điện tim ECG
      const color = ph === 'success' ? '#34d399' : ph === 'flatline' ? '#ef4444' : '#f87171';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = ph === 'success' ? 'rgba(52, 211, 153, 0.8)' : 'rgba(248, 113, 113, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const peaks = peaksRef.current;
      let pi = 0;
      for (let x = 0; x < width; x++) {
        let y = centerY;
        if (vfibMode) {
          // Rung thất (VFib): nhấp nhô hỗn loạn + các phức bộ QRS rời rạc
          const wx = x + scrollRef.current;
          y = centerY + Math.sin(wx * 0.12) * 7 + Math.cos(wx * 0.31) * 4;
          while (pi < peaks.length - 1 && peaks[pi] < wx - 9) pi++;
          if (peaks[pi] !== undefined) y += qrs(wx - peaks[pi]);
        } else if (ph === 'flatline') {
          // Vô tâm thu: một đường thẳng, chỉ còn nhiễu điện cực
          y = centerY + (Math.random() - 0.5) * 1.5;
        } else {
          // Nhịp xoang đều đặn (Normal Sinus Rhythm): P, QRS, T
          const wavePos = (x + sinusOffset) % 180;
          if (wavePos > 40 && wavePos < 55) {
            y = centerY - Math.sin(((wavePos - 40) / 15) * Math.PI) * 7;
          } else if (wavePos >= 65 && wavePos <= 68) {
            y = centerY + 6;
          } else if (wavePos > 68 && wavePos < 74) {
            y = centerY - 38;
          } else if (wavePos >= 74 && wavePos <= 78) {
            y = centerY + 14;
          } else if (wavePos > 95 && wavePos < 120) {
            y = centerY - Math.sin(((wavePos - 95) / 25) * Math.PI) * 11;
          }
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Vạch quét thời gian thực khi nhịp xoang đã tái lập
      if (ph === 'success') {
        const sweepX = (width - sinusOffset) % width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(sweepX, 0, 3, height);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [fail]);

  const flat = phase === 'flatline';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none font-mono"
    >
      <style>{`
        @keyframes defib-seize {
          0%, 100% { transform: translate(0, 0) rotate(0) }
          10% { transform: translate(-6px, 2px) rotate(-0.6deg) }
          20% { transform: translate(5px, -3px) rotate(0.5deg) }
          30% { transform: translate(-4px, -1px) rotate(-0.3deg) }
          40% { transform: translate(6px, 3px) rotate(0.6deg) }
          55% { transform: translate(-3px, 0) }
          70% { transform: translate(2px, -2px) }
        }
        @keyframes defib-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0.25 } }
        @keyframes defib-redflash { 0%, 100% { opacity: 0 } 15% { opacity: 0.55 } 50% { opacity: 0.15 } 65% { opacity: 0.45 } }
      `}</style>

      {/* Lóe sáng trắng khi sốc điện */}
      {flashWhite && (
        <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-300" />
      )}
      {/* Chớp đỏ cảnh báo nguy cấp khi tim ngừng */}
      {flat && (
        <div
          key={failCount}
          className="absolute inset-0 z-50 bg-red-700 pointer-events-none"
          style={{ animation: `defib-redflash ${FLATLINE_MS}ms ease-out forwards` }}
        />
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg bg-zinc-950 border-2 rounded-lg p-5 text-zinc-200 relative overflow-hidden transition-colors ${
          flat ? 'border-red-500 shadow-[0_0_70px_rgba(239,68,68,0.9)]' : 'border-red-600/90 shadow-[0_0_50px_rgba(220,38,38,0.45)]'
        }`}
        style={flat ? { animation: 'defib-seize 0.35s linear 4' } : undefined}
      >
        {/* Header Máy Sốc Điện Y Tế */}
        <div className="flex justify-between items-center border-b border-red-900/80 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-ping inline-block" />
            <h2 className="text-xs sm:text-sm font-bold tracking-wider text-red-400 uppercase">
              {tx('MÁY KHỬ RUNG TIM & ĐIỆN TIM • LIFEPAK 9P (BV TRUNG HOÀ)')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-white px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition-colors"
          >
            {tx('[ESC] ĐÓNG')}
          </button>
        </div>

        {/* Khung Màn Hình CRT Đo Điện Tim (ECG Screen) */}
        <div className={`relative mb-4 rounded border-2 bg-[#021e1a] p-1 shadow-inner ${flat ? 'border-red-700' : 'border-emerald-900'}`}>
          <canvas
            ref={canvasRef}
            width={SCREEN_W}
            height={SCREEN_H}
            className="w-full h-36 sm:h-40 block rounded"
          />

          {/* Overlay thông số trên màn hình CRT */}
          <div className="absolute top-2 left-3 text-[10px] sm:text-xs text-emerald-400 font-bold tracking-wider flex items-center gap-3">
            <span>LEAD II • 1.0mV/cm</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                isShocked
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                  : 'bg-red-950 text-red-300 border border-red-500 animate-pulse'
              }`}
            >
              {isShocked ? tx('NHỊP XOANG ĐỀU (SINUS)') : flat ? tx('VÔ TÂM THU (ASYSTOLE)') : tx('RUNG THẤT NGUY CẤP (VFIB)')}
            </span>
          </div>

          <div className="absolute top-2 right-3 text-right">
            <div className="text-[10px] text-zinc-400">{tx('NHỊP TIM HIỆN TẠI:')}</div>
            <div
              className={`text-xl sm:text-2xl font-black ${
                isShocked ? 'text-emerald-400 animate-pulse' : flat ? 'text-red-500' : 'text-red-500 animate-bounce'
              }`}
            >
              {bpm} <span className="text-xs font-normal">BPM</span>
            </div>
          </div>

          {/* Đèn báo: xanh khi nhịp xoang tái lập */}
          <div className="absolute bottom-2 right-3 flex items-center gap-1.5 text-[9px] text-zinc-400">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isShocked ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : flat ? 'bg-red-500 animate-ping' : 'bg-zinc-700'
              }`}
            />
            {isShocked ? 'ROSC' : flat ? 'ALARM' : 'SYNC'}
          </div>
        </div>

        {/* Bảng Điều Khiển Năng Lượng & Thao Tác (Control Panel) */}
        {!revealedAudio ? (
          <div className="space-y-4">
            {/* 1. Chọn mức Joules */}
            <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-zinc-300 font-bold">{tx('1. MỨC NĂNG LƯỢNG SỐC ĐIỆN (ENERGY SELECT):')}</span>
                <span className="text-amber-400 font-bold">{tx('* Y lệnh cấp cứu: 200 Jun')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([100, 200, 360] as EnergyLevel[]).map((joules) => (
                  <button
                    key={joules}
                    onClick={() => {
                      if (phase === 'idle') {
                        playButtonBlip();
                        setSelectedEnergy(joules);
                      }
                    }}
                    disabled={phase !== 'idle'}
                    className={`py-2 text-xs font-bold rounded border transition-all ${
                      selectedEnergy === joules
                        ? 'bg-amber-950/80 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-102'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {joules} JOULES {joules === 200 ? '★' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Thanh trạng thái tụ điện nạp */}
            <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800">
              <div className="flex justify-between items-center text-xs mb-1.5 font-bold">
                <span className="text-zinc-300">{tx('2. ĐIỆN ÁP TỤ NẠP (CAPACITOR CHARGE):')}</span>
                <span className={isCharged ? 'text-amber-400 font-black animate-pulse' : 'text-zinc-400'}>
                  {chargeProgress}% {isCharged ? '• READY!' : ''}
                </span>
              </div>
              <div className="w-full h-4 bg-zinc-950 border border-zinc-700 rounded-sm overflow-hidden p-0.5">
                <div
                  className={`h-full transition-all duration-75 rounded-xs ${
                    isCharged
                      ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 shadow-[0_0_15px_rgba(251,191,36,0.8)]'
                      : 'bg-gradient-to-r from-red-800 to-red-500'
                  }`}
                  style={{ width: `${chargeProgress}%` }}
                />
              </div>
            </div>

            {/* Trạng thái căn nhịp / cảnh báo tim ngừng */}
            {isCharged && (
              <div className="text-center space-y-1">
                <div className="text-[11px] font-black tracking-[0.2em] text-cyan-300">
                  READY FOR DISCHARGE • TIMING REQUIRED
                </div>
                <div className="text-[11px] font-bold text-amber-300" style={{ animation: 'defib-blink 0.8s steps(1) infinite' }}>
                  {tx('[ BẤM SPACE ĐÚNG ĐỈNH NHỊP TIM ĐỂ XẢ ĐIỆN ]')}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {tx('Nhịp đã lỡ:')}{' '}
                  <span className={missed > 0 ? 'text-red-400 font-bold' : 'text-zinc-300'}>
                    {missed}/{MAX_MISSED}
                  </span>
                </div>
              </div>
            )}
            {flat && (
              <div className="text-center text-[11px] font-black text-red-400 tracking-wider animate-pulse">
                {tx('⚠ TIM NGỪNG ĐẬP — AN CO GIẬT! XẢ HẾT TỤ, PHẢI NẠP LẠI TỪ ĐẦU...')}
              </div>
            )}

            {/* 3. Nút hành động: Nạp điện & Phóng điện */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleStartCharging}
                disabled={phase !== 'idle'}
                className={`py-3 px-4 font-bold text-xs sm:text-sm tracking-wider rounded border transition-all ${
                  isCharging
                    ? 'bg-amber-950 border-amber-500 text-amber-200 animate-pulse cursor-wait'
                    : phase !== 'idle'
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] cursor-pointer active:scale-95'
                }`}
              >
                {isCharging
                  ? tx('⚡ ĐANG NẠP ĐIỆN...')
                  : isCharged
                  ? tx('✓ ĐÃ NẠP ĐẦY 200J')
                  : failCount > 0 && phase === 'idle'
                  ? tx('⚡ NẠP LẠI (RECHARGE)')
                  : tx('⚡ 1. NẠP ĐIỆN (CHARGE)')}
              </button>

              <button
                onClick={handleTriggerShock}
                disabled={!isCharged}
                className={`py-3 px-4 font-black text-xs sm:text-sm tracking-wider rounded border transition-all ${
                  isCharged
                    ? 'bg-red-600 hover:bg-red-500 text-white border-white shadow-[0_0_25px_rgba(239,68,68,0.9)] cursor-pointer active:scale-95'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                {tx('[ SỐC ĐIỆN - CLEAR! ]')}
              </button>
            </div>
          </div>
        ) : (
          /* Khối thông báo thành công & Đoạn ghi âm hồi ký đêm 17/05 */
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="p-3 bg-emerald-950/60 border border-emerald-500 rounded text-emerald-200 text-xs sm:text-sm leading-relaxed">
              <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                <span>✓</span>
                <span>{tx('CẤP CỨU THÀNH CÔNG: NHỊP XOANG TÁI LẬP 72 BPM!')}</span>
              </div>
              <p className="italic font-serif text-zinc-300 text-xs leading-relaxed mt-2 border-t border-emerald-900/60 pt-2 text-justify">
                {tx('“Bác sĩ ơi! Có mạch bẹn lại rồi... Nhịp tim 72 lần/phút! Tiếp tục giữ huyết áp đồ thị ổn định!... Miên ơi, anh ấy qua cơn nguy kịch tạm thời rồi, đừng khóc nữa...”')}
              </p>
            </div>

            <button
              onClick={() => {
                playButtonBlip();
                complete();
              }}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-black font-black text-xs sm:text-sm tracking-widest rounded shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all cursor-pointer"
            >
              {tx('[ ĐẶT BÀN SỐC XUỐNG ]')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
