"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getStory, getBaseStory } from '../data/storyLoader';
import { useLanguage } from '../context/LanguageContext';
import { StoryNode, Choice, AnEmotion, MienEmotion } from '../types/vn';
import { PortraitActor, Gesture, GESTURES, EMOTION_GESTURE } from './PortraitActor';
import { audioEngine, SilenceAccent } from '../services/audioEngine';
import { tx } from '../locales/tx';

// Bản gốc tiếng Việt: dùng để nhận diện người nói (bản dịch có thể đổi tên hiển thị)
const baseStory = getBaseStory();

// Nhịp diễn trong lời thoại: {a:sad} / {m:warm_smile,nod} đổi biểu cảm hoặc làm cử chỉ
// đúng lúc chữ gõ tới vị trí đó; {s:chime|click|sigh} cắt phụt mọi âm thanh (khoảng lặng chân không).
// Dấu nhịp bị lược khỏi chữ hiển thị.
interface Beat {
  at: number;
  who: 'a' | 'm' | 's';
  emotion?: string;
  gesture?: Gesture;
  silence?: SilenceAccent;
}

const SILENCE_ACCENTS: readonly string[] = ['chime', 'click', 'sigh', 'none'];

const BEAT_RE = /\{([ams]):([a-z_,]+)\}/g;

/** Lược dấu nhịp diễn cho nơi khác hiển thị lời thoại (không có chân dung) */
export const stripBeats = (raw: string) => raw.replace(BEAT_RE, '');

function parseBeats(raw: string): { text: string; beats: Beat[] } {
  const beats: Beat[] = [];
  let text = '';
  let last = 0;
  for (const m of raw.matchAll(BEAT_RE)) {
    text += raw.slice(last, m.index);
    last = m.index + m[0].length;
    const who = m[1] as Beat['who'];
    const beat: Beat = { at: text.length, who };
    for (const name of m[2].split(',')) {
      if (who === 's') {
        if (SILENCE_ACCENTS.includes(name)) beat.silence = name as SilenceAccent;
      } else if ((GESTURES as readonly string[]).includes(name)) beat.gesture = name as Gesture;
      else if (name in (who === 'a' ? AN_PORTRAITS : MIEN_PORTRAITS)) beat.emotion = name;
    }
    beats.push(beat);
  }
  return { text: text + raw.slice(last), beats };
}

/** Biểu cảm của nhịp gần nhất đã gõ tới (undefined nếu chưa có) */
function beatEmotion(beats: Beat[], who: 'a' | 'm', typed: number): string | undefined {
  let e: string | undefined;
  for (const b of beats) if (b.who === who && b.at <= typed && b.emotion) e = b.emotion;
  return e;
}

export const AN_PORTRAITS: Record<AnEmotion, string> = {
  normal: '/assets/ModelAN/normalAn.png',
  sad: '/assets/ModelAN/sadAn.png',
  exhausted: '/assets/ModelAN/ExhaustedAn.png',
  scared: '/assets/ModelAN/ScaredAn.png',
  panic: '/assets/ModelAN/PanicAn.png',
  faint_smile: '/assets/ModelAN/FaintSmileAn.png',
  smile: '/assets/ModelAN/SmileAn.png',
  doubt: '/assets/ModelAN/Doubt.png',
  glitched: '/assets/ModelAN/GlitchedAn.png',
  determined: '/assets/ModelAN/determinedAn.png',
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
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number>(0);
  const [sanityDamageFlash, setSanityDamageFlash] = useState<boolean>(false);
  const [recentDamage, setRecentDamage] = useState<number | null>(null);
  const damageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Refs quản lý Typewriter chống đè state khi click / ấn phím bỏ qua
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef<boolean>(false);
  const activeTextRef = useRef<string>('');
  // Khung chữ: lời thoại dài hơn khung thì tự cuộn theo dòng đang gõ
  const textBoxRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const box = textBoxRef.current;
    if (!box) return;
    // Phần chưa gõ vẫn chiếm chỗ (ẩn), nên cuộn theo con trỏ chứ không cuộn xuống đáy
    const caret = caretRef.current;
    box.scrollTop = caret ? Math.max(0, caret.offsetTop + caret.offsetHeight - box.clientHeight) : box.scrollHeight;
  }, [displayedText, isTyping]);

  // Luôn đồng bộ currentNodeId khi initialNodeId từ prop thay đổi
  useEffect(() => {
    setCurrentNodeId(initialNodeId);
    setSelectedChoiceIndex(0);
  }, [initialNodeId]);

  // Reset lựa chọn đang focus về đầu tiên khi sang câu thoại mới
  useEffect(() => {
    setSelectedChoiceIndex(0);
  }, [currentNodeId]);

  const { t, lang } = useLanguage();
  const storyData = useMemo(() => getStory(lang), [lang]);
  const currentNode = storyData[currentNodeId] || storyData['start'];
  const baseSpeaker = (baseStory[currentNodeId] || baseStory['start']).speaker;
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
  const rawActiveText = (sanity <= 40 && currentNode.glitchText) ? currentNode.glitchText : currentNode.text;
  const { text: activeText, beats } = useMemo(() => parseBeats(rawActiveText), [rawActiveText]);
  activeTextRef.current = activeText;
  // Số ký tự đã gõ của node hiện tại (chữ của node trước còn sót một nhịp render thì tính là 0)
  const typedLen = activeText.startsWith(displayedText) ? displayedText.length : 0;

  // Xác định chân dung nhân vật đang nói & bối cảnh hội thoại
  const isAn = baseSpeaker.includes('An');
  // So khớp đầu tên người nói: "Phòng #316 (Phòng Trọ Cũ Của Miên)" là một cánh cửa, không phải Miên đang nói
  const isMien = /^(Miên|AURA)\b/u.test(baseSpeaker);
  const isMonologue = baseSpeaker.includes('Độc thoại');
  const isSystem = baseSpeaker.includes('Hệ thống');

  // Ai đang thoại thì chỉ model người đó hiện, ở một ô duy nhất bên trái (khung lựa chọn nằm bên phải).
  // Hệ thống / đồ vật / người nói khác: không hiện model nào
  const activeSpeaker: 'an' | 'mien' | null = isMien ? 'mien' : isAn || isMonologue ? 'an' : null;

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

    // 3. Phản ứng tức thì khi bị trừ điểm tỉnh táo: đau đầu, hoang mang — không tự nhảy sang mặt kinh sợ
    if (sanityDamageFlash || recentDamage !== null) {
      if (sanity <= 35) return 'panic';
      return sanity > 60 ? 'doubt' : 'exhausted';
    }

    // 4. Khi môi trường ở trạng thái GLITCH MODE:
    // Không dùng model glitched cho An; phản ánh sự kiệt quệ, tê liệt của một người bệnh
    if (currentNode.worldState === 'GLITCH') {
      if (sanity <= 25) return 'panic';
      return 'exhausted';
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

  const anEmotion = (beatEmotion(beats, 'a', typedLen) as AnEmotion | undefined) ?? getAnEmotion();
  const mienEmotion = (beatEmotion(beats, 'm', typedLen) as MienEmotion | undefined) ?? getMienEmotion();

  // Khoảng lặng chân không: chạy một lần khi chữ gõ tới dấu {s:...}
  const firedSilenceRef = useRef<string>('');
  useEffect(() => {
    beats.forEach((b, i) => {
      if (b.who !== 's' || !b.silence || b.at > typedLen) return;
      const key = `${currentNodeId}#${i}`;
      if (firedSilenceRef.current.includes(key)) return;
      firedSilenceRef.current += `|${key}`;
      audioEngine.triggerDeadSilence(2000, 1200, b.silence);
    });
  }, [beats, typedLen, currentNodeId]);

  // Cử chỉ: nhịp có cử chỉ riêng thì dùng nó, không thì tự chọn theo biểu cảm vừa đổi.
  // Tính ngay trong render (derived state) để cử chỉ khớp đúng khung hình đổi ảnh.
  const [anGesture, setAnGesture] = useState<{ name: Gesture; id: number } | null>(null);
  const [mienGesture, setMienGesture] = useState<{ name: Gesture; id: number } | null>(null);
  const [beatState, setBeatState] = useState({ key: '', applied: 0, an: anEmotion as string, mien: mienEmotion as string });
  const beatKey = `${currentNodeId}|${activeText}`;
  const applied = beats.filter((b) => b.at <= typedLen).length;
  if (beatState.key !== beatKey || beatState.applied !== applied || beatState.an !== anEmotion || beatState.mien !== mienEmotion) {
    const from = beatState.key === beatKey ? beatState.applied : 0;
    const fresh = beats.filter((b) => b.at <= typedLen).slice(from);
    const pick = (who: 'a' | 'm', emotion: string, prevEmotion: string) =>
      [...fresh].reverse().find((b) => b.who === who && b.gesture)?.gesture ??
      (emotion !== prevEmotion ? EMOTION_GESTURE[emotion] : undefined);
    const ag = pick('a', anEmotion, beatState.an);
    const mg = pick('m', mienEmotion, beatState.mien);
    if (ag) setAnGesture((g) => ({ name: ag, id: (g?.id ?? 0) + 1 }));
    if (mg) setMienGesture((g) => ({ name: mg, id: (g?.id ?? 0) + 1 }));
    setBeatState({ key: beatKey, applied, an: anEmotion, mien: mienEmotion });
  }

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

  // Âm thanh di chuyển con trỏ lựa chọn (Retro Cursor Move)
  const playChoiceHoverSound = useCallback(() => {
    if (volume <= 0 || audioEngine.isDeadSilent()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.exponentialRampToValueAtTime(950, t + 0.025);
      gain.gain.setValueAtTime((volume / 100) * 0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.025);
    } catch {}
  }, [volume, getAudioContext]);

  // 1. Âm thanh gõ máy đánh chữ / phím cơ lách cách (Typewriter Click)
  const playTypewriterClick = useCallback(() => {
    if (volume <= 0 || audioEngine.isDeadSilent()) return;
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
    } else if (!visibleChoices || visibleChoices.length === 0) {
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
        if (!visibleChoices || visibleChoices.length === 0 || isTypingRef.current) {
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

  // Khung thoại trầm, tối giản: không nhuộm đỏ rực khi GLITCH hay khi bị trừ Sanity
  const getThemeClasses = () => {
    // Chỉ khi Sanity cực kỳ nguy cấp (<= 20%) mới cho viền đỏ thẫm nhẹ
    if (sanity <= 20) {
      return 'bg-black/95 border-red-900/80 text-zinc-100 shadow-[0_0_25px_rgba(185,28,28,0.3)]';
    }
    if (currentNode.worldState === 'DREAM') {
      return 'bg-indigo-950/90 border-pink-500/70 text-pink-100 shadow-[0_0_25px_rgba(236,72,153,0.25)]';
    }
    // Mặc định (kể cả GLITCH hay bị trừ Sanity): khung đen mờ, viền xám tro
    return 'bg-black/90 border-zinc-700/80 text-zinc-100 shadow-[0_0_30px_rgba(0,0,0,0.9)]';
  };

  return (
    <div
      onClick={handleNext}
      className="relative w-full h-screen max-h-screen overflow-hidden flex flex-col justify-between p-3 sm:p-5 select-none font-mono cursor-pointer"
      // Bị trừ Sanity: khung hình giật lệch 2px trong 150ms (thay cho nhuộm đỏ cả màn hình)
      style={sanityDamageFlash ? { animation: 'vn-jolt 150ms linear' } : undefined}
    >
      {/* ...kèm một nhịp tối sầm ở viền màn hình rồi sáng lại */}
      {sanityDamageFlash && (
        <div
          className="pointer-events-none absolute inset-0 z-40"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.85) 100%)',
            animation: 'vn-vignette 600ms ease-out forwards',
          }}
        />
      )}
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
            {t.vn.sanity}
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
              {t.vn.damage(recentDamage)}
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
          {t.vn.close}
        </button>
      </div>

      {/* Vùng giữa: chân dung đứng sát trên khung chat; bảng lựa chọn nổi đè góc phải, không chiếm chỗ */}
      <div className="relative flex-1 w-full min-h-0 flex flex-col">
      {/* 2. CHÂN DUNG NGƯỜI ĐANG NÓI (một ô bên trái) - Model luôn giữ nguyên màu gốc */}
      <div className="relative flex-1 w-full flex items-end justify-start px-4 sm:px-12 pointer-events-none z-10 min-h-0 overflow-hidden pb-1">
        {activeSpeaker === 'an' && (
          // key đổi theo người nói → mờ dần vào mỗi khi đổi lượt
          <div key="an" className="relative transition-all duration-300 transform origin-bottom flex flex-col items-center justify-end max-h-[48vh] animate-fade-in">
            <PortraitActor
              src={AN_PORTRAITS[anEmotion]}
              alt={`An (${t.vn.anEmotion[anEmotion]})`}
              emotion={anEmotion}
              gesture={anGesture}
              talking={isTyping && isAn && !isMonologue}
              dir={1}
              imgClassName="drop-shadow-[0_0_15px_rgba(100,116,139,0.4)]"
            />
            <div className="absolute top-1 left-1 bg-black/85 border border-zinc-700/80 px-2 py-0.5 text-[10px] text-zinc-300 font-bold rounded backdrop-blur-sm shadow flex items-center gap-1.5">
              <span>AN</span>
              <span className="text-[9px] text-cyan-400 font-normal">[{t.vn.anEmotion[anEmotion]}]</span>
            </div>
          </div>
        )}

        {activeSpeaker === 'mien' && (
          <div key="mien" className="relative transition-all duration-300 transform origin-bottom flex flex-col items-center justify-end max-h-[48vh] animate-fade-in">
            {/* Hào quang hologram */}
            <div className="absolute inset-0 bg-pink-500/20 blur-2xl rounded-full -z-10 animate-pulse" />
            <PortraitActor
              src={MIEN_PORTRAITS[mienEmotion]}
              alt={`${tx('Miên')} (${t.vn.mienEmotion[mienEmotion]})`}
              emotion={mienEmotion}
              gesture={mienGesture}
              talking={isTyping}
              dir={1}
              imgClassName="drop-shadow-[0_0_20px_rgba(236,72,153,0.5)]"
            />
            <div className="absolute top-1 left-1 bg-pink-950/85 border border-pink-500 px-2 py-0.5 text-[10px] text-pink-200 font-bold rounded shadow-[0_0_10px_rgba(236,72,153,0.4)] backdrop-blur-sm flex items-center gap-1.5">
              <span>{tx('MIÊN')}</span>
              <span className="text-[9px] text-pink-300 font-normal">[{t.vn.mienEmotion[mienEmotion]}]</span>
            </div>
          </div>
        )}
      </div>

      {/* 2.5. HỘP LỰA CHỌN PHÂN NHÁNH NỔI (FEAR & HUNGER / RETRO RPG STYLE) */}
      {!isTyping && visibleChoices && visibleChoices.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-3 max-h-full overflow-y-auto z-40 flex flex-col items-end gap-2.5 px-2 sm:px-6 pointer-events-auto animate-fade-in"
        >
          <div className="flex flex-col gap-2.5 w-full sm:w-auto min-w-[280px] sm:min-w-[380px] max-w-xl">
            {visibleChoices.map((choice, index) => {
              const locked = isChoiceLocked(choice);
              const isSelected = selectedChoiceIndex === index;
              return (
                <button
                  key={index}
                  disabled={locked}
                  onMouseEnter={() => {
                    if (!locked && selectedChoiceIndex !== index) {
                      setSelectedChoiceIndex(index);
                      playChoiceHoverSound();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChoice(choice);
                  }}
                  className={`w-full text-left font-mono px-4 py-2.5 sm:px-5 sm:py-3 rounded-lg border-2 transition-all duration-150 flex items-center justify-between group shadow-xl ${
                    locked
                      ? 'bg-zinc-900/60 border-zinc-700/50 text-zinc-600 cursor-not-allowed opacity-60'
                      : isSelected
                      ? 'bg-black border-white text-white shadow-[0_0_20px_rgba(255,255,255,0.35)] scale-[1.01]'
                      : 'bg-[#2d2d33]/90 border-zinc-400/80 text-zinc-100 hover:border-zinc-200 hover:bg-[#383840]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs transition-all duration-150 ${
                        isSelected ? 'text-white opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
                      }`}
                    >
                      ▶
                    </span>
                    <span
                      className={`text-xs sm:text-sm tracking-wide leading-snug ${
                        isSelected ? 'font-bold text-white' : 'font-medium text-zinc-200'
                      }`}
                    >
                      {choice.text}
                    </span>
                  </div>

                  {locked ? (
                    <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded ml-2 shrink-0 text-zinc-500 bg-zinc-900/90 border border-zinc-700/60">
                      🔒 {choice.minSanity !== undefined && choice.maxSanity !== undefined
                        ? t.vn.lockRange(choice.minSanity, choice.maxSanity)
                        : choice.minSanity !== undefined
                        ? t.vn.lockMin(choice.minSanity)
                        : t.vn.lockMax(choice.maxSanity ?? 0)}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      {choice.sanityImpact !== 0 && (
                        <span
                          className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            choice.sanityImpact < 0
                              ? 'text-red-400 bg-red-950/70 border border-red-900/50'
                              : 'text-emerald-400 bg-emerald-950/70 border border-emerald-900/50'
                          }`}
                        >
                          {t.vn.impact(choice.sanityImpact)}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                          isSelected
                            ? 'border-white/60 bg-white/10 text-white font-bold'
                            : 'border-zinc-600/50 bg-black/40 text-zinc-400 group-hover:text-zinc-200'
                        }`}
                      >
                        [{index + 1}]
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* 3. HỘP THOẠI VISUAL NOVEL (Dialogue Box) */}
      <div
        className={`z-30 shrink-0 border-2 p-3.5 sm:p-5 rounded-lg transition-all duration-300 backdrop-blur-md min-h-[110px] sm:min-h-[125px] max-h-[190px] flex flex-col justify-between overflow-y-auto ${getThemeClasses()}`}
      >
        {/* Header Tên người nói */}
        <div className="flex justify-between items-center mb-1.5 border-b border-current/30 pb-1 shrink-0">
          <span className="text-xs uppercase tracking-widest font-bold flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-current animate-ping" />
            {isSystem ? t.vn.system : currentNode.speaker}
          </span>
          <span className="text-[10px] opacity-60 uppercase tracking-widest font-mono">
            {currentNode.worldState} MODE
          </span>
        </div>

        {/* Nội dung lời thoại với hiệu ứng Typewriter */}
        <div ref={textBoxRef} className="relative flex-1 min-h-[48px] my-1 overflow-y-auto pr-1">
          {/* Các đoạn chảy liền nhau, căn đều hai bên. Phần chưa gõ vẫn chiếm chỗ (ẩn) để chữ đang gõ
              không nhảy xuống dòng giữa chừng khi một từ chạm mép khung */}
          <p className="text-xs sm:text-sm leading-relaxed font-sans font-medium text-justify">
            {displayedText}
            {isTyping && (
              <span ref={caretRef} className="inline-block w-0 overflow-visible animate-pulse text-cyan-400 font-mono">▌</span>
            )}
            {isTyping && activeText.startsWith(displayedText) && (
              <span className="invisible" aria-hidden="true">{activeText.slice(displayedText.length)}</span>
            )}
          </p>
        </div>

        {/* Thanh đếm ngược (node có timeoutSeconds) */}
        {!isTyping && currentNode.timeoutSeconds && countdown !== null && (
          <div className="mt-2 shrink-0 flex items-center gap-2 font-mono text-[11px] text-red-300">
            <span className="font-bold animate-pulse whitespace-nowrap">
              {t.vn.timeout(countdown)}
            </span>
            <div className="flex-1 h-1.5 bg-red-950/80 rounded overflow-hidden border border-red-900">
              <div
                className="h-full bg-red-500 transition-[width] duration-200"
                style={{ width: `${(countdown / currentNode.timeoutSeconds) * 100}%` }}
              />
            </div>
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
              <span>{t.vn.revive}</span>
              <span>⚡</span>
            </button>
          </div>
        )}

        {/* Gợi ý tiếp tục mặc định (nhấn Enter/Space hoặc click để tiếp tục / qua cutscene) */}
        {!isTyping &&
          (!visibleChoices || visibleChoices.length === 0) &&
          currentNode.id !== 'bad_ending_0' && (
            <div className="mt-1 flex justify-between items-center text-[10px] sm:text-xs opacity-50 font-mono shrink-0">
              <span>{t.vn.continueHint}</span>
              <span className="animate-bounce">▼</span>
            </div>
          )}
      </div>
    </div>
  );
};
