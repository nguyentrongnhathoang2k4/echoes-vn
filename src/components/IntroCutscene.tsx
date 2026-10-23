"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface IntroCutsceneProps {
  onComplete: () => void;
  volume?: number;
}

interface CutsceneStep {
  tag: string;
  speaker?: string;
  lines: string[];
  theme: 'cold' | 'hospital' | 'glitch' | 'wake';
  bgGlitch?: boolean;
}

const CUTSCENE_STEPS: CutsceneStep[] = [
  {
    tag: 'TIỀM THỨC // CƠN ÁC MỘNG VỤN VỠ',
    lines: [
      'Trong bóng tối mịt mù, tiếng mưa rơi như đang gõ từng nhịp buốt lạnh vào màng nhĩ...',
      'Một tia chớp lóe lên... vệt đèn pha nhòe nhoẹt... và một bàn tay dần buông lơi trong vô vọng.',
    ],
    theme: 'cold',
  },
  {
    tag: 'TIẾNG THÌ THẦM TRONG ĐÊM',
    speaker: 'Giọng nói xa xăm',
    lines: [
      '"...An ơi... Anh có nghe thấy em không...?"',
      '"Làm ơn... Đừng bỏ cuộc... Hãy tỉnh lại đi anh..."',
    ],
    theme: 'hospital',
  },
  {
    tag: 'DƯ ÂM THỨC TỈNH // 03:14 AM',
    speaker: 'Tiềm thức',
    lines: [
      'Tiếng còi xe mơ hồ dần bị nuốt chửng bởi tiếng ù tai chói gắt...',
      'Thay vào đó... là âm thanh rù rù quen thuộc của chiếc quạt tản nhiệt máy tính.',
    ],
    theme: 'glitch',
    bgGlitch: true,
  },
  {
    tag: 'THỨC TỈNH // BÀN LÀM VIỆC',
    speaker: 'Thực tại?',
    lines: [
      'Ánh sáng xanh lét từ màn hình CRT hắt lên khuôn mặt bạn.',
      '03:14 AM. Mở mắt ra đi.',
    ],
    theme: 'wake',
  },
];

export const IntroCutscene: React.FC<IntroCutsceneProps> = ({
  onComplete,
  volume = 80,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [displayedLineIndex, setDisplayedLineIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenOscRef = useRef<OscillatorNode | null>(null);

  const currentStep = CUTSCENE_STEPS[stepIndex];
  const targetText = currentStep?.lines[displayedLineIndex] || '';

  const isTypingRef = useRef(false);
  const targetTextRef = useRef('');
  targetTextRef.current = targetText;
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Khởi tạo AudioContext an toàn
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

  // 1. Tiếng gõ bàn phím terminal typewriter
  const playTypeClick = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200 + Math.random() * 600, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.018);
      g.gain.setValueAtTime((volume / 100) * 0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.018);
    } catch {}
  }, [volume, getAudioContext]);

  // 2. Tiếng bíp monitor y tế
  const playHeartMonitorBeep = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, t);
      g.gain.setValueAtTime((volume / 100) * 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } catch {}
  }, [volume, getAudioContext]);

  // 3. Tiếng quạt tản nhiệt case máy tính khởi động
  const playFanSpinUp = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(45, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 1.2);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime((volume / 100) * 0.04, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    } catch {}
  }, [volume, getAudioContext]);

  // Dọn dẹp âm thanh khi unmount
  useEffect(() => {
    return () => {
      if (sirenOscRef.current) {
        try {
          sirenOscRef.current.stop();
          sirenOscRef.current.disconnect();
        } catch {}
      }
    };
  }, []);

  // Âm thanh phụ trợ theo từng cảnh
  useEffect(() => {
    if (stepIndex === 1) {
      // Cảnh bệnh viện: Bíp tim định kỳ
      playHeartMonitorBeep();
      const timer = setInterval(playHeartMonitorBeep, 1600);
      return () => clearInterval(timer);
    } else if (stepIndex === 2 || stepIndex === 3) {
      playFanSpinUp();
    }
  }, [stepIndex, playHeartMonitorBeep, playFanSpinUp]);

  // Effect chạy chữ Typewriter
  useEffect(() => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    setDisplayedText('');
    setIsTyping(true);
    isTypingRef.current = true;
    let index = 0;

    typingTimerRef.current = setInterval(() => {
      if (index < targetText.length) {
        const char = targetText[index];
        setDisplayedText(targetText.slice(0, index + 1));
        if (char && char.trim() !== '') {
          playTypeClick();
        }
        index++;
      } else {
        setIsTyping(false);
        isTypingRef.current = false;
        if (typingTimerRef.current) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
      }
    }, 28);

    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [stepIndex, displayedLineIndex, targetText, playTypeClick]);

  // Tiến tới câu/cảnh tiếp theo
  const handleProceed = useCallback(() => {
    if (isTypingRef.current) {
      // Nếu đang gõ dở thì dừng timer ngay và hiện hết text ngay
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      isTypingRef.current = false;
      setIsTyping(false);
      setDisplayedText(targetTextRef.current);
      return;
    }

    // Nếu còn dòng tiếp theo trong cùng 1 step
    if (displayedLineIndex < currentStep.lines.length - 1) {
      setDisplayedLineIndex((prev) => prev + 1);
      return;
    }

    // Nếu còn step tiếp theo
    if (stepIndex < CUTSCENE_STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
      setDisplayedLineIndex(0);
      return;
    }

    // Hết toàn bộ cutscene -> Hoàn thành
    onComplete();
  }, [displayedLineIndex, currentStep, stepIndex, onComplete]);

  // Bỏ qua toàn bộ Cutscene (Skip)
  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Lắng nghe phím Space / Enter / Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleProceed();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleProceed, handleSkip]);

  return (
    <div
      onClick={handleProceed}
      className="relative w-screen h-screen bg-black overflow-hidden select-none flex flex-col justify-between cursor-pointer"
    >
      {/* 1. Thanh Letterbox điện ảnh phía trên */}
      <div className="w-full h-12 sm:h-16 bg-black z-30 border-b border-zinc-900/60 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2 text-xs font-mono tracking-widest text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
          <span>PROLOGUE // THỰC TẠI ẢO ẢNH</span>
        </div>

        {/* Nút BỎ QUA (SKIP) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSkip();
          }}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 hover:border-cyan-400 text-zinc-300 hover:text-cyan-300 text-xs font-mono tracking-wider transition-all shadow-md cursor-pointer"
        >
          <span>BỎ QUA</span>
          <span className="text-[10px] text-zinc-500 group-hover:text-cyan-400">[ESC / SPACE]</span>
          <span className="text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">»</span>
        </button>
      </div>

      {/* 2. Khung nội dung chính Cutscene */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 sm:px-16 max-w-4xl mx-auto text-center z-20">
        {/* Tag cảnh quay */}
        <div
          className={`text-[10px] sm:text-xs font-mono uppercase tracking-[0.25em] mb-4 sm:mb-6 transition-all ${
            currentStep.theme === 'cold'
              ? 'text-cyan-400/80'
              : currentStep.theme === 'hospital'
              ? 'text-rose-400/90'
              : currentStep.theme === 'glitch'
              ? 'text-fuchsia-400 font-bold animate-pulse'
              : 'text-amber-400/90'
          }`}
        >
          [ {currentStep.tag} ]
        </div>

        {/* Người nói (nếu có) */}
        {currentStep.speaker && (
          <div className="text-xs sm:text-sm font-mono tracking-widest text-zinc-400 mb-2 font-bold">
            &lt; {currentStep.speaker} &gt;
          </div>
        )}

        {/* Nội dung lời thoại / nhật ký */}
        <div className="min-h-[90px] sm:min-h-[110px] flex items-center justify-center">
          <p
            className={`text-base sm:text-xl md:text-2xl font-mono leading-relaxed tracking-wide transition-all ${
              currentStep.theme === 'glitch'
                ? 'text-pink-300 text-glow-glitch'
                : currentStep.theme === 'hospital'
                ? 'text-zinc-200'
                : currentStep.theme === 'wake'
                ? 'text-white font-bold tracking-widest'
                : 'text-zinc-300 italic'
            }`}
          >
            {displayedText}
            {isTyping && <span className="animate-pulse inline-block ml-1 text-cyan-400">_</span>}
          </p>
        </div>

        {/* Gợi ý tiếp tục */}
        {!isTyping && (
          <div className="mt-8 flex items-center gap-2 text-xs font-mono text-zinc-500 animate-pulse">
            <span>[Nhấp chuột hoặc bấm Space để tiếp tục]</span>
            <span className="text-cyan-400">▼</span>
          </div>
        )}
      </div>

      {/* 3. Thanh Letterbox điện ảnh phía dưới */}
      <div className="w-full h-12 sm:h-16 bg-black z-30 border-t border-zinc-900/60 flex items-center justify-between px-4 sm:px-8 text-[11px] font-mono text-zinc-600">
        <div>ECHOES OF REALITY // 2026</div>
        <div className="flex gap-1.5">
          {CUTSCENE_STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`w-6 h-1 rounded transition-all ${
                idx === stepIndex ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>
        <div>PHÒNG TRỌ 314</div>
      </div>

      {/* Background Glitch & Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,rgba(0,0,0,0.8)_80%)]" />
      {currentStep.bgGlitch && (
        <div className="absolute inset-0 pointer-events-none bg-fuchsia-950/15 mix-blend-screen animate-pulse" />
      )}
    </div>
  );
};
