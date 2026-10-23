"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import storyDataRaw from '../data/story.json';
import { StoryNode, Choice, AnEmotion, MienEmotion } from '../types/vn';

const storyData = storyDataRaw as Record<string, StoryNode>;

export const AN_PORTRAITS: Record<AnEmotion, string> = {
  normal: '/assets/ModelAN/normalAn.png',
  sad: '/assets/ModelAN/sadAn.png',
  exhausted: '/assets/ModelAN/ExhaustedAn.png',
  scared: '/assets/ModelAN/ScaredAn.png',
  panic: '/assets/ModelAN/PanicAn.png',
  faint_smile: '/assets/ModelAN/FaintSmileAn.png',
  doubt: '/assets/ModelAN/Doubt.png',
  glitched: '/assets/ModelAN/GlitchedAn.png',
  determined: '/assets/ModelAN/determinedAn.png',
};

export const AN_EMOTION_LABELS: Record<AnEmotion, string> = {
  normal: 'Bình thường',
  sad: 'Đau buồn',
  exhausted: 'Kiệt sức',
  scared: 'Kinh sợ',
  panic: 'Hoảng loạn',
  faint_smile: 'Cười gượng',
  doubt: 'Nghi ngờ',
  glitched: 'Nhiễu loạn',
  determined: 'Kiên định',
};

export const MIEN_PORTRAITS: Record<MienEmotion, string> = {
  warm_smile: '/assets/ModelMIEN/warm_smileMien.png',
  gentle: '/assets/ModelMIEN/gentleMien.png',
  worried: '/assets/ModelMIEN/worriedMien.png',
  melancholy: '/assets/ModelMIEN/MelancholyMien.png',
  surprised: '/assets/ModelMIEN/surprisedMien.png',
  fading: '/assets/ModelMIEN/FadingMien.png',
  pleading: '/assets/ModelMIEN/PleadingMien.png',
  corrupted: '/assets/ModelMIEN/CorruptedAIMien.png',
  crying: '/assets/ModelMIEN/cryingMien.png',
  playful: '/assets/ModelMIEN/playfulMien.png',
};

export const MIEN_EMOTION_LABELS: Record<MienEmotion, string> = {
  warm_smile: 'Ấm áp',
  gentle: 'Dịu dàng',
  worried: 'Lo lắng',
  melancholy: 'U sầu',
  surprised: 'Bàng hoàng',
  fading: 'Mờ nhạt',
  pleading: 'Cầu xin',
  corrupted: 'Lỗi mã AURA',
  crying: 'Rơi lệ',
  playful: 'Tinh nghịch',
};

interface VNStageProps {
  initialNodeId: string;
  sanity: number;
  setSanity: React.Dispatch<React.SetStateAction<number>>;
  onClose: (finishedNodeId?: string) => void;
  textSpeed?: number;
  volume?: number;
  /** Biến cốt truyện đã ghi (giữ xuyên suốt các chương) */
  storyFlags?: string[];
  /** Ghi thêm một biến cốt truyện khi người chơi chọn lựa chọn có setFlag */
  onSetFlag?: (flag: string) => void;
}

const NO_FLAGS: string[] = [];

export const VNStage: React.FC<VNStageProps> = ({
  initialNodeId,
  sanity,
  setSanity,
  onClose,
  textSpeed = 28,
  volume = 80,
  storyFlags = NO_FLAGS,
  onSetFlag,
}) => {
  const [currentNodeId, setCurrentNodeId] = useState<string>(initialNodeId);
  const [displayedText, setDisplayedText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [sanityDamageFlash, setSanityDamageFlash] = useState<boolean>(false);
  const [recentDamage, setRecentDamage] = useState<number | null>(null);
  const damageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Refs quản lý Typewriter chống đè state khi click / ấn phím bỏ qua
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const activeTextRef = useRef<string>('');

  // Luôn đồng bộ currentNodeId khi initialNodeId từ prop thay đổi
  useEffect(() => {
    setCurrentNodeId(initialNodeId);
  }, [initialNodeId]);

  const currentNode = storyData[currentNodeId] || storyData['start'];
  // Lựa chọn hiển thị: lọc theo biến cốt truyện (requiresFlag / forbidsFlag)
  const visibleChoices = useMemo<Choice[] | undefined>(
    () =>
      currentNode.choices?.filter(
        (c) =>
          (!c.requiresFlag || storyFlags.includes(c.requiresFlag)) &&
          (!c.forbidsFlag || !storyFlags.includes(c.forbidsFlag))
      ),
    [currentNode, storyFlags]
  );
  const activeText = (sanity <= 40 && currentNode.glitchText) ? currentNode.glitchText : currentNode.text;
  activeTextRef.current = activeText;

  // Xác định chân dung nhân vật đang nói & bối cảnh hội thoại
  const isAn = currentNode.speaker.includes('An');
  const isMien = currentNode.speaker.includes('Miên') || currentNode.speaker.includes('AURA');
  const isMonologue = currentNode.speaker.includes('Độc thoại');
  const isSystem = currentNode.speaker.includes('Hệ thống');

  // Chỉ hiển thị model Miên khi có Miên tham gia cuộc trò chuyện
  const hasMien =
    isMien ||
    currentNodeId.startsWith('node_mien_') ||
    currentNodeId.startsWith('node_dream_') ||
    currentNodeId.startsWith('node_climax_') ||
    currentNodeId.startsWith('node_chapter_1_') ||
    currentNodeId.startsWith('ch2_mien_');

  // Xác định biểu cảm động của An dựa vào node và trạng thái tâm trí
  const getAnEmotion = (): AnEmotion => {
    // 1. Nếu node có cấu hình biểu cảm riêng rõ ràng
    if (currentNode.anEmotion) return currentNode.anEmotion;

    // 2. Model Glitched (Nhiễu loạn) CHỈ dùng khi ý thức sập nguồn / chết não / sốc thuốc cực độ:
    if (
      currentNodeId === 'bad_ending_0' ||
      currentNodeId.includes('overdose') ||
      currentNodeId.includes('flatline')
    ) {
      return 'glitched';
    }

    // 3. Phản ứng tức thì khi bị trừ điểm tỉnh táo (Sanity Damage Flash)
    if (sanityDamageFlash || recentDamage !== null) {
      return sanity <= 35 ? 'panic' : 'scared';
    }

    // 4. Khi môi trường ở trạng thái GLITCH MODE:
    // Tuyệt đối không dùng model glitched cho An, mà phản ánh tâm lý con người
    if (currentNode.worldState === 'GLITCH') {
      if (sanity <= 30) return 'panic';
      if (sanity <= 65) return 'scared';
      return 'doubt';
    }

    // 5. Theo ngưỡng Tỉnh Táo (Sanity)
    if (sanity <= 20) return 'panic';      // Dưới 20%: Hoảng loạn tột độ (toát mồ hôi, mắt mở to)
    if (sanity <= 45) return 'scared';     // Dưới 45%: Kinh sợ, hoang mang
    if (sanity <= 70) return 'exhausted';  // Dưới 70%: Mệt mỏi, kiệt sức

    // 6. Theo ngữ cảnh tương tác và cốt truyện
    if (
      currentNodeId.includes('terminal') ||
      currentNodeId.includes('who') ||
      currentNodeId.includes('mirror') ||
      currentNodeId.includes('door_312') ||
      currentNodeId.includes('stairs') ||
      currentNodeId.includes('notice_board') ||
      currentNodeId.includes('door_316')
    ) {
      return 'doubt';
    }
    if (currentNodeId.includes('accept') || currentNodeId.includes('reconnect')) {
      return 'faint_smile';
    }
    if (currentNodeId.includes('truth') || currentNodeId.includes('report') || currentNodeId.includes('grief')) {
      return 'sad';
    }
    return 'normal';
  };

  // Xác định biểu cảm động của Miên dựa vào node và trạng thái tâm trí
  const getMienEmotion = (): MienEmotion => {
    if (currentNode.mienEmotion) return currentNode.mienEmotion;
    if (currentNode.worldState === 'GLITCH') return 'corrupted';
    if (sanity <= 25) return 'fading';
    if (sanity <= 55) return 'worried';
    if (currentNodeId.includes('truth') || currentNodeId.includes('pain') || currentNodeId.includes('who')) {
      return 'melancholy';
    }
    if (currentNodeId.includes('accept') || currentNodeId.includes('climax')) {
      return 'warm_smile';
    }
    if (currentNodeId.includes('knock') || currentNodeId.includes('surprised')) {
      return 'surprised';
    }
    if (currentNodeId.includes('intro') || currentNodeId.includes('time')) {
      return 'pleading';
    }
    return 'gentle';
  };

  const anEmotion = getAnEmotion();
  const mienEmotion = getMienEmotion();

  // Khởi tạo AudioContext an toàn
  const getAudioContext = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // 1. Âm thanh gõ máy đánh chữ / phím cơ lách cách (Typewriter Click)
  const playTypewriterClick = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const masterGain = (volume / 100) * 0.04;

      // Tiếng "tách" đanh của thanh kim loại
      const randomPitch = 1800 + Math.random() * 700;
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(randomPitch, t);
      osc.frequency.exponentialRampToValueAtTime(randomPitch * 0.35, t + 0.016);

      oscGain.gain.setValueAtTime(masterGain, t);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.016);

      // Tiếng "thump" đáy phím
      const thump = ctx.createOscillator();
      const thumpGain = ctx.createGain();

      thump.type = 'sine';
      thump.frequency.setValueAtTime(160 + Math.random() * 50, t);
      thump.frequency.exponentialRampToValueAtTime(50, t + 0.02);

      thumpGain.gain.setValueAtTime(masterGain * 0.7, t);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);

      thump.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thump.start(t);
      thump.stop(t + 0.02);
    } catch {
      // Bỏ qua lỗi audio
    }
  }, [volume, getAudioContext]);

  // 2. Âm thanh nhịp tim đập dồn dập khi Sanity < 25% (Heartbeat Thump-Thump)
  const playHeartbeat = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const hbGainVal = (volume / 100) * 0.09;

      // Nhịp 1 (Thịch...)
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(75, t);
      osc1.frequency.exponentialRampToValueAtTime(40, t + 0.12);

      g1.gain.setValueAtTime(hbGainVal, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc1.connect(g1);
      g1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.12);

      // Nhịp 2 (...Thịch sau 160ms)
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(65, t + 0.16);
      osc2.frequency.exponentialRampToValueAtTime(35, t + 0.28);

      g2.gain.setValueAtTime(hbGainVal * 0.75, t + 0.16);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.start(t + 0.16);
      osc2.stop(t + 0.28);
    } catch {
      // Bỏ qua
    }
  }, [volume, getAudioContext]);

  // 3. Âm thanh rè tĩnh điện / cảnh báo khi bị trừ Sanity
  const playSanityLossSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.28);

      gain.gain.setValueAtTime((volume / 100) * 0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    } catch {
      // Bỏ qua lỗi audio
    }
  }, [volume, getAudioContext]);

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (damageTimerRef.current) clearTimeout(damageTimerRef.current);
    };
  }, []);

  // Vòng lặp âm thanh nhịp tim dồn dập khi Sanity < 25%
  useEffect(() => {
    if (sanity >= 25) return;

    // Sanity càng thấp thì tim đập càng nhanh (650ms - 850ms)
    const intervalMs = Math.max(600, 650 + (sanity / 25) * 250);
    playHeartbeat();
    const timer = setInterval(playHeartbeat, intervalMs);

    return () => clearInterval(timer);
  }, [sanity, playHeartbeat]);

  // Vòng lặp Typewriter
  useEffect(() => {
    // Xóa interval đang chạy nếu có
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    setDisplayedText('');
    setIsTyping(true);
    isTypingRef.current = true;
    let currentIndex = 0;

    typingIntervalRef.current = setInterval(() => {
      if (currentIndex < activeText.length) {
        const nextChar = activeText[currentIndex];
        setDisplayedText(activeText.slice(0, currentIndex + 1));

        if (nextChar && nextChar.trim() !== '') {
          playTypewriterClick();
        }

        currentIndex++;
      } else {
        setIsTyping(false);
        isTypingRef.current = false;
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }
    }, textSpeed);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [currentNodeId, activeText, textSpeed, playTypewriterClick]);

  // Âm thanh Flatline của máy đo điện tim khi ở bad_ending_0
  const flatlineOscRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    if (currentNodeId === 'bad_ending_0' && volume > 0) {
      const ctx = getAudioContext();
      if (ctx) {
        try {
          const t = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, t);
          gain.gain.setValueAtTime((volume / 100) * 0.07, t);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          flatlineOscRef.current = osc;
        } catch {}
      }
    } else {
      if (flatlineOscRef.current) {
        try {
          flatlineOscRef.current.stop();
          flatlineOscRef.current.disconnect();
        } catch {}
        flatlineOscRef.current = null;
      }
    }

    return () => {
      if (flatlineOscRef.current) {
        try {
          flatlineOscRef.current.stop();
          flatlineOscRef.current.disconnect();
        } catch {}
        flatlineOscRef.current = null;
      }
    };
  }, [currentNodeId, volume, getAudioContext]);

  const handleNext = useCallback(() => {
    // Nếu chữ đang chạy: BẬT NGAY TOÀN BỘ CÂU VÀ DỪNG TIMER
    if (isTypingRef.current) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      isTypingRef.current = false;
      setIsTyping(false);
      setDisplayedText(activeTextRef.current);
      return;
    }

    // Khi gặp node kết thúc khám phá phòng hoặc kết thúc chương 1 & 2 hoặc các Ending
    if (
      currentNode.id === 'end_to_explore' ||
      currentNode.id === 'end_to_explore_sunset' ||
      currentNode.id === 'end_chapter_1' ||
      currentNode.id === 'end_chapter_2' ||
      currentNode.id === 'bad_ending_0' ||
      currentNode.id === 'end_game_true' ||
      currentNode.id === 'end_game_bad' ||
      currentNode.id === 'end_game_neutral'
    ) {
      if (currentNode.id === 'bad_ending_0') {
        onClose('restart_game');
      } else {
        onClose(currentNode.id);
      }
      return;
    }
    // Rẽ nhánh theo biến cốt truyện (nhánh đầu tiên khớp được ưu tiên)
    const branch = currentNode.flagBranches?.find((b) => storyFlags.includes(b.flag));
    if (branch) {
      setCurrentNodeId(branch.nextNodeId);
    } else if (currentNode.nextNodeId) {
      setCurrentNodeId(currentNode.nextNodeId);
    } else if (!visibleChoices) {
      onClose(currentNode.id);
    }
  }, [currentNode, onClose, storyFlags, visibleChoices]);

  // Lựa chọn bị khóa khi Sanity nằm ngoài ngưỡng minSanity / maxSanity
  const isChoiceLocked = useCallback(
    (choice: Choice) =>
      (choice.minSanity !== undefined && sanity < choice.minSanity) ||
      (choice.maxSanity !== undefined && sanity > choice.maxSanity),
    [sanity]
  );

  // Đếm ngược của node có timeoutSeconds: hết giờ mà chưa chọn thì tự nhảy sang timeoutNodeId
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    const secs = currentNode.timeoutSeconds;
    const target = currentNode.timeoutNodeId;
    if (!secs || !target || isTyping) return;
    const deadline = Date.now() + secs * 1000;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(left);
      if (left <= 0) {
        if (intervalId) clearInterval(intervalId);
        setCurrentNodeId(target);
      }
    };
    const firstTick = setTimeout(tick, 0);
    intervalId = setInterval(tick, 250);
    return () => {
      clearTimeout(firstTick);
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentNode, isTyping]);

  const handleChoice = useCallback((choice: Choice) => {
    if (isChoiceLocked(choice)) return;
    if (choice.sanityImpact < 0) {
      setSanityDamageFlash(true);
      setRecentDamage(choice.sanityImpact);
      playSanityLossSound();
      if (damageTimerRef.current) clearTimeout(damageTimerRef.current);
      damageTimerRef.current = setTimeout(() => {
        setSanityDamageFlash(false);
        setRecentDamage(null);
      }, 1400);
    }
    setSanity((prev) => Math.max(0, Math.min(100, prev + choice.sanityImpact)));
    if (choice.setFlag) onSetFlag?.(choice.setFlag);
    setCurrentNodeId(choice.nextNodeId);
  }, [setSanity, playSanityLossSound, isChoiceLocked, onSetFlag]);

  // Lắng nghe phím Space / Enter để qua câu thoại & Phím 1, 2, 3 để chọn lựa chọn nhanh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Phím Space hoặc Enter để qua câu thoại
      if (e.key === ' ' || e.key === 'Enter') {
        if (!visibleChoices || isTypingRef.current) {
          e.preventDefault();
          handleNext();
          return;
        }
      }

      // 2. Phím số 1, 2, 3... để chọn choices khi đã gõ xong
      if (!isTypingRef.current && visibleChoices && visibleChoices.length > 0) {
        const choiceIndex = parseInt(e.key, 10) - 1;
        if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < visibleChoices.length) {
          e.preventDefault();
          handleChoice(visibleChoices[choiceIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentNode, visibleChoices, handleNext, handleChoice]);

  const getThemeClasses = () => {
    if (sanityDamageFlash || currentNode.worldState === 'GLITCH' || sanity <= 25) {
      return 'bg-red-950/95 border-red-500 text-red-100 animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.65)] ring-1 ring-red-500/50';
    }
    if (currentNode.worldState === 'DREAM') {
      return 'bg-indigo-950/90 border-pink-500 text-pink-100 shadow-[0_0_30px_rgba(236,72,153,0.35)]';
    }
    return 'bg-zinc-950/95 border-cyan-800 text-zinc-200 shadow-[0_0_25px_rgba(6,182,212,0.2)]';
  };

  return (
    <div
      onClick={handleNext}
      className="relative w-full h-screen max-h-screen overflow-hidden flex flex-col justify-between p-3 sm:p-5 select-none font-mono cursor-pointer"
    >
      {/* 1. HUD: Sanity bar & Close - Chỉ đỏ cảnh báo ở thanh này khi bị trừ Sanity */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`z-30 shrink-0 flex justify-between items-center bg-black/85 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-2.5 border rounded shadow-md transition-all duration-300 ${
          sanityDamageFlash || sanity <= 25
            ? 'border-red-600/90 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
            : 'border-zinc-700/80'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`text-[11px] sm:text-xs uppercase tracking-widest font-bold transition-colors ${
              sanityDamageFlash || sanity <= 25
                ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                : 'text-zinc-400'
            }`}
          >
            ĐỘ TỈNH TÁO:
          </span>
          <span
            className={`text-xs sm:text-sm font-bold ${
              sanityDamageFlash || sanity <= 25
                ? 'text-red-500 font-extrabold animate-pulse'
                : sanity < 50
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {sanity}%
          </span>
          {recentDamage !== null && (
            <span className="text-[10px] sm:text-xs font-mono font-bold text-red-400 bg-red-950/90 border border-red-500 px-1.5 py-0.5 rounded animate-bounce">
              {recentDamage} SANITY
            </span>
          )}
        </div>

        <div
          className={`w-36 sm:w-56 h-2 bg-zinc-800 rounded-full overflow-hidden border transition-all duration-300 ${
            sanityDamageFlash || sanity <= 25
              ? 'border-red-500 shadow-[0_0_10px_#ef4444]'
              : 'border-zinc-700'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              sanityDamageFlash || sanity <= 25
                ? 'bg-red-600 shadow-[0_0_12px_#ef4444] animate-pulse'
                : sanity < 50
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${sanity}%` }}
          />
        </div>

        <button
          onClick={() => onClose()}
          className="text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 px-2.5 py-1 border border-zinc-700 transition-colors uppercase tracking-widest rounded"
        >
          [Đóng]
        </button>
      </div>

      {/* 2. KHU VỰC HIỂN THỊ CHÂN DUNG NHÂN VẬT - Model luôn giữ nguyên màu gốc */}
      <div className="relative flex-1 w-full flex items-end justify-between px-4 sm:px-12 pointer-events-none z-10 min-h-0 overflow-hidden pb-1">
        
        {/* MODEL AN (Góc trái) - Dynamic Emotion Portrait */}
        <div
          className={`relative transition-all duration-300 transform origin-bottom flex flex-col items-center justify-end max-h-[48vh] ${
            isAn || isMonologue
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-40 translate-y-3 scale-95 blur-[0.5px]'
          }`}
        >
          <img
            src={AN_PORTRAITS[anEmotion]}
            alt={`An (${AN_EMOTION_LABELS[anEmotion]})`}
            key={`an-${anEmotion}`}
            className="max-h-[40vh] sm:max-h-[46vh] h-auto w-auto max-w-[250px] sm:max-w-[320px] object-contain drop-shadow-[0_0_15px_rgba(100,116,139,0.4)] animate-fade-in transition-all duration-300"
          />
          <div className="absolute top-1 left-1 bg-black/85 border border-zinc-700/80 px-2 py-0.5 text-[10px] text-zinc-300 font-bold rounded backdrop-blur-sm shadow flex items-center gap-1.5">
            <span>AN</span>
            <span className="text-[9px] text-cyan-400 font-normal">[{AN_EMOTION_LABELS[anEmotion]}]</span>
          </div>
        </div>

        {/* MODEL MIÊN / AURA (Góc phải) - Dynamic Emotion Portrait */}
        {hasMien && (
          <div
            className={`relative transition-all duration-300 transform origin-bottom flex flex-col items-center justify-end max-h-[48vh] animate-fade-in ${
              isMien
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-50 translate-y-2 scale-95 blur-[0.5px]'
            }`}
          >
            {/* Hào quang hologram */}
            <div className="absolute inset-0 bg-pink-500/20 blur-2xl rounded-full -z-10 animate-pulse" />
            
            <img
              src={MIEN_PORTRAITS[mienEmotion]}
              alt={`Miên (${MIEN_EMOTION_LABELS[mienEmotion]})`}
              key={`mien-${mienEmotion}`}
              className={`max-h-[40vh] sm:max-h-[46vh] h-auto w-auto max-w-[250px] sm:max-w-[320px] object-contain drop-shadow-[0_0_20px_rgba(236,72,153,0.5)] transition-all duration-300 animate-fade-in ${
                isMien ? 'animate-bounce-slow' : ''
              }`}
            />
            <div className="absolute top-1 right-1 bg-pink-950/85 border border-pink-500 px-2 py-0.5 text-[10px] text-pink-200 font-bold rounded shadow-[0_0_10px_rgba(236,72,153,0.4)] backdrop-blur-sm flex items-center gap-1.5">
              <span>MIÊN</span>
              <span className="text-[9px] text-pink-300 font-normal">[{MIEN_EMOTION_LABELS[mienEmotion]}]</span>
            </div>
          </div>
        )}

      </div>

      {/* 3. HỘP THOẠI VISUAL NOVEL (Dialogue Box - Chiều cao thích ứng khi có nhiều lựa chọn) */}
      <div
        className={`z-30 shrink-0 border-2 p-3 sm:p-4 rounded transition-all duration-300 backdrop-blur-md ${
          !isTyping && visibleChoices && visibleChoices.length > 0
            ? 'min-h-[175px] max-h-[320px] sm:max-h-[360px]'
            : 'min-h-[130px] max-h-[220px] sm:max-h-[240px]'
        } flex flex-col justify-between overflow-y-auto ${getThemeClasses()}`}
      >
        {/* Header Tên người nói */}
        <div className="flex justify-between items-center mb-1.5 border-b border-current/30 pb-1 shrink-0">
          <span className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-current animate-ping" />
            {isSystem ? 'HỆ THỐNG // AURA OS' : currentNode.speaker}
          </span>
          <span className="text-[10px] opacity-60 uppercase tracking-widest font-mono">
            {currentNode.worldState} MODE
          </span>
        </div>

        {/* Nội dung lời thoại với hiệu ứng Typewriter */}
        <div className="flex-1 min-h-[48px] my-1 overflow-y-auto pr-1">
          <p className="text-xs sm:text-sm leading-relaxed font-sans font-medium">
            {displayedText}
            {isTyping && <span className="animate-pulse ml-1 text-cyan-400 font-mono">▌</span>}
          </p>
        </div>

        {/* Các lựa chọn phân nhánh (Choices) kèm phím tắt [1], [2] */}
        {/* Thanh đếm ngược (node có timeoutSeconds) */}
        {!isTyping && currentNode.timeoutSeconds && countdown !== null && (
          <div className="mt-2 shrink-0 flex items-center gap-2 font-mono text-[11px] text-red-300">
            <span className="font-bold animate-pulse whitespace-nowrap">
              ⏳ NGẮT NGUỒN SAU 00:{String(countdown).padStart(2, '0')}
            </span>
            <div className="flex-1 h-1.5 bg-red-950/80 rounded overflow-hidden border border-red-900">
              <div
                className="h-full bg-red-500 transition-[width] duration-200"
                style={{ width: `${(countdown / currentNode.timeoutSeconds) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!isTyping && visibleChoices && (
          <div className="mt-2 space-y-1.5 shrink-0 pt-1.5 border-t border-current/20">
            {visibleChoices.map((choice, index) => {
              const locked = isChoiceLocked(choice);
              return (
              <button
                key={index}
                disabled={locked}
                onClick={(e) => {
                  e.stopPropagation();
                  handleChoice(choice);
                }}
                className={`w-full text-left text-xs px-3 py-1.5 sm:py-2 border rounded transition-all duration-150 flex justify-between items-center group ${
                  locked
                    ? 'border-zinc-800 bg-black/60 text-zinc-600 cursor-not-allowed opacity-60'
                    : currentNode.worldState === 'DREAM'
                    ? 'border-pink-600/80 bg-pink-950/60 hover:bg-pink-900/90 hover:border-pink-300 text-pink-100'
                    : 'border-zinc-700 bg-zinc-900/70 hover:bg-zinc-800 hover:border-cyan-400 text-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-black/60 border border-current/40 rounded text-[10px] font-mono text-cyan-400 font-bold group-hover:border-cyan-300">
                    [{index + 1}]
                  </span>
                  <span className="font-sans font-medium text-xs sm:text-sm group-hover:translate-x-0.5 transition-transform leading-relaxed">
                    {choice.text}
                  </span>
                </div>
                {locked ? (
                  <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-2 text-zinc-500 bg-zinc-900 border border-zinc-800">
                    🔒 {choice.minSanity !== undefined ? `CẦN SANITY ≥ ${choice.minSanity}%` : `CHỈ KHI SANITY ≤ ${choice.maxSanity}%`}
                  </span>
                ) : (
                <span
                  className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                    choice.sanityImpact < 0 ? 'text-red-400 bg-red-950/80' : 'text-emerald-400 bg-emerald-950/80'
                  }`}
                >
                  {choice.sanityImpact < 0 ? `${choice.sanityImpact} Sanity` : `+${choice.sanityImpact} Sanity`}
                </span>
                )}
              </button>
              );
            })}
          </div>
        )}

        {/* Nút hồi sinh khi dính Bad Ending 0: Chết não / Flatline */}
        {currentNode.id === 'bad_ending_0' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose('restart_game');
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-red-700 via-rose-800 to-zinc-900 hover:from-red-600 hover:to-rose-700 text-white font-bold tracking-widest text-xs sm:text-sm rounded border border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.85)] animate-pulse transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>⚡</span>
              <span>[ SỐC ĐIỆN TIM - TÁI TẠO Ý THỨC (CHƠI LẠI ĐẦU CHƯƠNG 1) ]</span>
              <span>⚡</span>
            </button>
          </div>
        )}

        {/* Nút nổi bật khi hoàn thành Chương 1 */}
        {currentNode.id === 'end_chapter_1' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-bold tracking-widest text-xs sm:text-sm rounded border border-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.6)] animate-pulse transition-all flex items-center justify-center gap-2"
            >
              <span>✨</span>
              <span>[ HOÀN THÀNH CHƯƠNG 1 - TIẾP TỤC BƯỚC VÀO THỊ TRẤN HOÀNG HÔN ]</span>
              <span>✨</span>
            </button>
          </div>
        )}

        {/* Nút nổi bật khi hoàn thành Chương 2 */}
        {currentNode.id === 'end_chapter_2' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-red-600 via-fuchsia-700 to-purple-900 hover:from-red-500 text-white font-bold tracking-widest text-xs sm:text-sm rounded border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse transition-all flex items-center justify-center gap-2"
            >
              <span>⚠️</span>
              <span>[ HOÀN THÀNH CHƯƠNG 2 - BẦU TRỜI ĐÃ SỤP ĐỔ ]</span>
              <span>⚠️</span>
            </button>
          </div>
        )}

        {/* Nút hoàn thành True Ending */}
        {currentNode.id === 'end_game_true' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-500 hover:to-cyan-600 text-white font-bold tracking-widest text-xs sm:text-sm rounded border border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.8)] animate-pulse transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🌅</span>
              <span>[ TRUE ENDING: BÌNH MINH THẬT SỰ • TRỞ VỀ MENU ]</span>
              <span>🌅</span>
            </button>
          </div>
        )}

        {/* Nút hoàn thành Bad Ending */}
        {currentNode.id === 'end_game_bad' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-red-800 via-rose-950 to-black hover:from-red-700 text-red-200 font-bold tracking-widest text-xs sm:text-sm rounded border border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.8)] animate-pulse transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🩸</span>
              <span>[ BAD ENDING: ĐỊA NGỤC NGỌT NGÀO • MẮC KẸT VĨNH VIỄN ]</span>
              <span>🩸</span>
            </button>
          </div>
        )}

        {/* Nút hoàn thành Neutral Ending */}
        {currentNode.id === 'end_game_neutral' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-zinc-800 via-zinc-900 to-black hover:bg-zinc-700 text-zinc-300 font-bold tracking-widest text-xs sm:text-sm rounded border border-zinc-600 shadow-[0_0_20px_rgba(113,113,122,0.6)] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>⬛</span>
              <span>[ NEUTRAL ENDING: ĐỨT ĐOẠN KÝ ỨC (MẤT KẾT NỐI VĨNH VIỄN) • TRỞ VỀ MENU ]</span>
              <span>⬛</span>
            </button>
          </div>
        )}

        {/* Nút khi quay lại dạo quanh Thị trấn Hoàng Hôn */}
        {currentNode.id === 'end_to_explore_sunset' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2 px-3 bg-fuchsia-950/80 hover:bg-fuchsia-900 border border-pink-500/80 text-pink-200 text-xs font-bold rounded tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <span>[ TIẾP TỤC DẠO QUANH THỊ TRẤN HOÀNG HÔN ]</span>
            </button>
          </div>
        )}

        {/* Nút khi quay lại khám phá phòng */}
        {currentNode.id === 'end_to_explore' && !isTyping && (
          <div className="mt-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(currentNode.id);
              }}
              className="w-full py-2 px-3 bg-zinc-900/90 hover:bg-zinc-800 border border-cyan-500/80 text-cyan-300 text-xs font-bold rounded tracking-wider transition-all flex items-center justify-center gap-2"
            >
              <span>[ TIẾP TỤC KHÁM PHÁ CĂN PHÒNG ]</span>
            </button>
          </div>
        )}

        {/* Gợi ý tiếp tục mặc định */}
        {!isTyping &&
          !visibleChoices &&
          currentNode.id !== 'end_chapter_1' &&
          currentNode.id !== 'end_chapter_2' &&
          currentNode.id !== 'end_to_explore' &&
          currentNode.id !== 'end_to_explore_sunset' && (
            <div className="mt-1 flex justify-between items-center text-[10px] sm:text-xs opacity-50 font-mono shrink-0">
              <span>[Phím Space / Enter để tiếp tục]</span>
              <span className="animate-bounce">▼</span>
            </div>
          )}
      </div>
    </div>
  );
};
