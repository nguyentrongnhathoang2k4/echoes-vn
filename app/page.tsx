"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OverworldStage } from '../src/components/OverworldStage';
import { HallwayStage } from '../src/components/HallwayStage';
import { SunsetStage } from '../src/components/SunsetStage';
import { PixelBleedStage } from '../src/components/PixelBleedStage';
import { Chapter4Stage } from '../src/components/Chapter4Stage';
import { VNStage } from '../src/components/VNStage';
import { MainMenu } from '../src/components/MainMenu';
import { SettingsModal, GameSettings } from '../src/components/SettingsModal';
import { AchievementsModal } from '../src/components/AchievementsModal';
import { IntroCutscene } from '../src/components/IntroCutscene';
import { EndingCutscene } from '../src/components/EndingCutscene';
import { EndingBCutscene } from '../src/components/EndingBCutscene';
import { EndingCCutscene } from '../src/components/EndingCCutscene';
import { EndingSCutscene } from '../src/components/EndingSCutscene';
import { QuietEnding } from '../src/components/QuietEnding';
import { HeartbeatOverlay } from '../src/components/HeartbeatOverlay';
import { getStory } from '../src/data/storyLoader';
import { useLanguage } from '../src/context/LanguageContext';
import { SunBreakTransition } from '../src/components/SunBreakTransition';
import { HavenTransition } from '../src/components/HavenTransition';
import { SynapticCollapseOverlay } from '../src/components/SynapticCollapseOverlay';
import { ContentWarning } from '../src/components/ContentWarning';
import { audioEngine, AudioScene } from '../src/services/audioEngine';
import { tx, translate } from '../src/locales/tx';

// OUTRO: cutscene sau mỗi kết cục (A / B / C) trước khi về menu
type GameState = 'MENU' | 'INTRO' | 'PLAYING' | 'OUTRO';
type GameMode = 'OVERWORLD' | 'VN';
export type SubLocation = 'ROOM_314' | 'HALLWAY';

interface SaveData {
  sanity: number;
  activeNodeId: string;
  mode: GameMode;
  chapter?: number;
  subLocation?: SubLocation;
  interactedIds?: string[];
  inventoryIds?: string[];
  insertedDisk?: boolean;
  /** Biến cốt truyện (vd: lựa chọn cuối Màn 2) — không bị xoá khi sang chương */
  storyFlags?: string[];
  timestamp: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 80,
  bgmVolume: 85,
  ambientVolume: 40,
  textSpeed: 28,
  crtEnabled: true,
  parallaxEnabled: true,
};

// Quay lại sau ít nhất 15 giây mới thì thầm; mỗi lần cách nhau ít nhất 3 phút
const WHISPER_MIN_AWAY_MS = 15000;
const WHISPER_COOLDOWN_MS = 180000;
// Lời Miên khi người chơi rời tab (tiêu đề tab) và khi quay lại (thì thầm) — không lộ twist trước chương tương ứng
const AWAY_LINES: Record<number, { titles: readonly string[]; returns: readonly string[] }> = {
  1: {
    titles: ['An ơi, anh đi đâu thế?', 'Đèn vẫn sáng mà, anh về đi.', '03:14 · Phòng 314 · Không có ai'],
    returns: ['Anh về rồi à. Em tưởng anh đi luôn.', 'Căn phòng im lắm lúc anh không ở đây.'],
  },
  2: {
    titles: ['Hoàng hôn sắp tắt rồi đấy...', 'Em vẫn ngồi ở ghế đá chờ anh.'],
    returns: ['Anh đi đâu vậy? Mặt trời vẫn chờ anh mà.', 'Em tưởng anh không quay lại bến sông nữa.'],
  },
  3: {
    titles: ['Anh đừng đi... đừng như đêm đó.', 'Ở đây lạnh lắm, An.'],
    returns: ['Lúc anh đi, tiếng còi xe lại vang lên.', 'Đừng để em một mình trong căn phòng này.'],
  },
  4: {
    titles: ['Còn chưa tới ba phút đâu, An.', 'Anh đừng để em một mình lần nữa.'],
    returns: ['Em tưởng anh đã tắt máy rồi.', 'Anh vẫn ở đây. May quá.'],
  },
};

const STORAGE_KEY_SAVE = 'echoes_0314_save_data';
// Node "giả" đánh dấu người chơi đang ở trạm điều khiển Màn 4 (không có trong story.json)
const CH4_STAGE_NODE = 'ch4_terminal_void';
const STORAGE_KEY_SETTINGS = 'echoes_0314_settings';
const STORAGE_KEY_ACHIEVEMENTS = 'echoes_0314_unlocked_endings';
// Ending M "Không ai ở lại": tiêu đề tab bị đổi và giữ nguyên (kể cả khi tải lại trang) cho tới ván mới
const STORAGE_KEY_ABANDONED = 'echoes_0314_abandoned';
const ABANDONED_TAB_TITLE = 'Anh cũng đi rồi à.';
const DEFAULT_TAB_TITLE = 'Echoes: 03:14 AM - Visual Novel';

type OutroKind = 'A' | 'B' | 'C' | 'S' | 'M';


export default function Home() {
  const [gameState, setGameState] = useState<GameState>('MENU');
  // Cảnh báo nội dung (ánh sáng nhấp nháy, chủ đề nặng nề) hiện mỗi lần mở game
  const [showContentWarning, setShowContentWarning] = useState(true);
  const [mode, setMode] = useState<GameMode>('OVERWORLD');
  const [chapter, setChapter] = useState<number>(1);
  const [subLocation, setSubLocation] = useState<SubLocation>('ROOM_314');
  const [sanity, setSanity] = useState<number>(100);
  const [activeNodeId, setActiveNodeId] = useState<string>('start');
  const [interactedIds, setInteractedIds] = useState<string[]>([]);
  const [inventoryIds, setInventoryIds] = useState<string[]>([]);
  // Biến cốt truyện xuyên chương; ref giúp saveGameProgress luôn ghi bản mới nhất
  const [storyFlags, setStoryFlags] = useState<string[]>([]);
  const storyFlagsRef = useRef<string[]>([]);
  const applyStoryFlags = useCallback((flags: string[]) => {
    storyFlagsRef.current = flags;
    setStoryFlags(flags);
  }, []);
  const [insertedDisk, setInsertedDisk] = useState<boolean>(false);
  const [chapterCard, setChapterCard] = useState<{
    chapterNum: string;
    title: string;
    subtitle: string;
    quote: string;
  } | null>(null);
  const cardTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Quản lý Settings & Modal
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState<boolean>(false);
  const [unlockedEndings, setUnlockedEndings] = useState<OutroKind[]>([]);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState<boolean>(false);
  const [hasSaveData, setHasSaveData] = useState<boolean>(false);
  const [devToast, setDevToast] = useState<string | null>(null);
  // Thanh Dev (nhảy chương, Sanity 0%) ẩn với người chơi; bật/tắt bằng phím ~ hoặc F2
  const [showDevToolbar, setShowDevToolbar] = useState(false);
  // Kết cục đang chiếu cutscene (trạng thái OUTRO)
  const [outroEnding, setOutroEnding] = useState<OutroKind>('A');
  // Giờ máy chủ lúc người chơi rời tab (Ending M)
  const [abandonedAt, setAbandonedAt] = useState('03:29:12');
  // Chuyển cảnh Màn 2 → Màn 3 "Mặt trời vỡ ra" (chiếu trước card Chương III)
  const [sunBreak, setSunBreak] = useState(false);
  // Chuyển cảnh Màn 1 → Màn 2 "Bốn bức tường tan biến" (chiếu trước card Chương II)
  const [havenTransition, setHavenTransition] = useState(false);
  // Màn 2 đang chiếu cutscene riêng (hồi tưởng sau tấm ảnh Polaroid): tắt nhạc nền, chặn phím tắt của trang
  const [stageCutscene, setStageCutscene] = useState(false);

  // Đọc Settings & Save Data từ localStorage khi mount
  useEffect(() => {
    try {
      // 1. Đọc Settings
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        const merged: GameSettings = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(merged);
        if (typeof merged.masterVolume === 'number') audioEngine.setMasterVolume(merged.masterVolume);
        if (typeof merged.bgmVolume === 'number') audioEngine.setBgmVolume(merged.bgmVolume);
        if (typeof merged.ambientVolume === 'number') audioEngine.setAmbientVolume(merged.ambientVolume);
      }

      // 2. Kiểm tra Save Data
      const existingSave = localStorage.getItem(STORAGE_KEY_SAVE);
      if (existingSave) {
        setHasSaveData(true);
      }

      // 4. Đọc danh sách kết cục đã mở khóa
      const savedEndings = localStorage.getItem(STORAGE_KEY_ACHIEVEMENTS);
      if (savedEndings) {
        try {
          const parsedEndings = JSON.parse(savedEndings);
          if (Array.isArray(parsedEndings)) setUnlockedEndings(parsedEndings);
        } catch {}
      }

      // 3. Đã từng bỏ An lại ở Ending M: tiêu đề tab vẫn chưa được trả lại
      if (localStorage.getItem(STORAGE_KEY_ABANDONED)) {
        document.title = tx(ABANDONED_TAB_TITLE);
      }
    } catch {
      // Bỏ qua nếu localStorage bị vô hiệu hóa
    }
  }, []);

  // Cập nhật Settings và lưu vào localStorage
  const handleUpdateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (typeof newSettings.masterVolume === 'number') {
        audioEngine.setMasterVolume(newSettings.masterVolume);
      }
      if (typeof newSettings.bgmVolume === 'number') {
        audioEngine.setBgmVolume(newSettings.bgmVolume);
      }
      if (typeof newSettings.ambientVolume === 'number') {
        audioEngine.setAmbientVolume(newSettings.ambientVolume);
      }
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
      } catch {
        // Handle error silently
      }
      return updated;
    });
  };

  // 1. Khởi tạo AudioContext ngay lần tương tác đầu tiên của người dùng
  const initAudio = useCallback(() => {
    audioEngine.init();
    audioEngine.setMasterVolume(settings.masterVolume);
    if (typeof settings.bgmVolume === 'number') audioEngine.setBgmVolume(settings.bgmVolume);
    if (typeof settings.ambientVolume === 'number') audioEngine.setAmbientVolume(settings.ambientVolume);
  }, [settings.masterVolume, settings.bgmVolume, settings.ambientVolume]);
  useEffect(() => {
    const handleFirstGesture = initAudio;
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [initAudio]);

  // 2. Tự động đồng bộ Scene Âm thanh (BGM & Ambient) với trạng thái game
  useEffect(() => {
    let targetScene: AudioScene = 'MENU';
    if (gameState === 'MENU') {
      targetScene = 'MENU';
    } else if (gameState === 'INTRO') {
      targetScene = 'INTRO';
    } else if (gameState === 'OUTRO') {
      targetScene = 'VOID'; // Cutscene tự phát âm thanh riêng
    } else if (gameState === 'PLAYING') {
      if (havenTransition || stageCutscene) {
        targetScene = 'VOID'; // Chuyển cảnh / hồi tưởng tự phát âm thanh riêng
      } else if (chapter === 1) {
        targetScene = subLocation === 'HALLWAY' ? 'HALLWAY' : 'ROOM_314';
      } else if (chapter === 2) {
        targetScene = 'SUNSET';
      } else if (chapter === 3) {
        targetScene = 'PIXEL_BLEED';
      } else if (chapter === 4) {
        targetScene = 'VOID';
      }
    }
    audioEngine.setScene(targetScene);
  }, [gameState, chapter, subLocation, havenTransition, stageCutscene]);

  // 3. Tự động đồng bộ độ biến dạng âm thanh theo Sanity (DSP Lowpass & Tinnitus)
  useEffect(() => {
    audioEngine.setSanity(sanity);
  }, [sanity]);

  // Lưu Game vào localStorage
  const saveGameProgress = useCallback((
    currentSanity: number,
    currentNode: string,
    currentMode: GameMode,
    currentInteracted = interactedIds,
    currentChap = chapter,
    currentInventory = inventoryIds,
    currentInserted = insertedDisk,
    currentSubLocation = subLocation
  ) => {
    try {
      const savePayload: SaveData = {
        sanity: currentSanity,
        activeNodeId: currentNode,
        mode: currentMode,
        chapter: currentChap,
        subLocation: currentSubLocation,
        interactedIds: currentInteracted,
        inventoryIds: currentInventory,
        insertedDisk: currentInserted,
        storyFlags: storyFlagsRef.current,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY_SAVE, JSON.stringify(savePayload));
      setHasSaveData(true);
    } catch {
      // Handle error silently
    }
  }, [interactedIds, chapter, inventoryIds, insertedDisk, subLocation]);

  // Ghi một biến cốt truyện từ lựa chọn trong hộp thoại VN
  const handleSetStoryFlag = useCallback((flag: string) => {
    if (storyFlagsRef.current.includes(flag)) return;
    applyStoryFlags([...storyFlagsRef.current, flag]);
  }, [applyStoryFlags]);

  // Đánh dấu đồ vật đã hoàn thành tương tác
  const handleMarkInteracted = (id: string) => {
    setInteractedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      saveGameProgress(sanity, activeNodeId, mode, next, chapter, inventoryIds, insertedDisk, subLocation);
      return next;
    });
  };

  // Chuyển vị trí: Phòng trọ #314 -> Hành lang tầng 3
  const handleExitToHallway = () => {
    setSubLocation('HALLWAY');
    saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, 'HALLWAY');
  };

  // Chuyển vị trí: Hành lang tầng 3 -> Phòng trọ #314
  const handleEnterRoom314 = () => {
    setSubLocation('ROOM_314');
    saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, 'ROOM_314');
  };

  // Bắt đầu phiên chơi mới [KHỞI TẠO Ý THỨC]
  const handleStartNewGame = () => {
    setChapter(1);
    setSubLocation('ROOM_314');
    setSanity(100);
    setActiveNodeId('start');
    setMode('OVERWORLD');
    setInteractedIds([]);
    setInventoryIds([]);
    setInsertedDisk(false);
    applyStoryFlags([]);
    try {
      localStorage.removeItem(STORAGE_KEY_ABANDONED);
    } catch {}
    document.title = DEFAULT_TAB_TITLE;
    setGameState('INTRO'); // Mở đoạn mở đầu Cinematic Prologue!
    setIsPauseMenuOpen(false);
    saveGameProgress(100, 'start', 'OVERWORLD', [], 1, [], false, 'ROOM_314');
  };

  // Khi kết thúc Cutscene mở màn (hoặc bấm Skip) -> Chuyển sang hộp thoại VN để An độc thoại mở đầu!
  const handleCompleteIntro = () => {
    setGameState('PLAYING');
    setMode('VN');
    setActiveNodeId('start');
  };

  // Tải lại phiên chơi cũ [PHỤC HỒI ĐIỂM NHỚ]
  const handleContinueGame = () => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY_SAVE);
      if (savedRaw) {
        const parsed: SaveData = JSON.parse(savedRaw);
        setChapter(parsed.chapter ?? 1);
        setSubLocation(parsed.subLocation ?? 'ROOM_314');
        setSanity(parsed.sanity ?? 100);
        setActiveNodeId(parsed.activeNodeId ?? 'start');
        setMode(parsed.mode ?? 'OVERWORLD');
        setInteractedIds(parsed.interactedIds ?? []);
        setInventoryIds(parsed.inventoryIds ?? []);
        setInsertedDisk(parsed.insertedDisk ?? false);
        applyStoryFlags(parsed.storyFlags ?? []);
        setGameState('PLAYING');
        setIsPauseMenuOpen(false);
      }
    } catch {
      handleStartNewGame();
    }
  };

  // Khi người chơi bước vào ô trigger trên bản đồ
  const handleTrigger = (nodeId: string) => {
    setActiveNodeId(nodeId);
    setMode('VN');
    saveGameProgress(sanity, nodeId, 'VN', interactedIds, chapter, inventoryIds, insertedDisk, subLocation);
  };

  // Kết thúc ván: chiếu màn kết cục, xoá điểm lưu (ván sau bắt đầu lại từ đầu)
  const finishRun = (kind: OutroKind) => {
    setOutroEnding(kind);
    // Ghi nhận kết cục vào hồ sơ thành tựu (giữ qua các ván)
    setUnlockedEndings((prev) => {
      if (prev.includes(kind)) return prev;
      const updated = [...prev, kind];
      try {
        localStorage.setItem(STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setGameState('OUTRO');
    setMode('OVERWORLD');
    setChapter(1);
    setActiveNodeId('start');
    setSanity(100);
    setInteractedIds([]);
    setInventoryIds([]);
    setInsertedDisk(false);
    applyStoryFlags([]);
    try {
      localStorage.removeItem(STORAGE_KEY_SAVE);
    } catch {}
    setHasSaveData(false);
  };

  // Màn 4: người chơi chọn kết cục trên trạm điều khiển → phát chuỗi thoại kết cục trong VN
  const handleTriggerEnding = (endingNodeId: string, leftAt?: string) => {
    if (endingNodeId === 'end_game_abandoned') {
      // Ending M: không qua hộp thoại, vào thẳng màn đen
      if (leftAt) setAbandonedAt(leftAt);
      try {
        localStorage.setItem(STORAGE_KEY_ABANDONED, '1');
      } catch {}
      finishRun('M');
      return;
    }
    setActiveNodeId(endingNodeId);
    setMode('VN');
    saveGameProgress(sanity, endingNodeId, 'VN', interactedIds, 4, inventoryIds, insertedDisk, subLocation);
  };

  // Chuyển sang Chương 2 / Chương 3 / Chương 4 sau màn Card tiêu đề điện ảnh
  const handleProceedChapter = useCallback(() => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    if (chapter === 1) {
      setChapterCard(null);
      setChapter(2);
      setSubLocation('ROOM_314');
      setActiveNodeId('ch2_start');
      setInteractedIds([]);
      setMode('VN'); // Mở đoạn mở đầu thơ mộng của Chương 2
      saveGameProgress(sanity, 'ch2_start', 'VN', [], 2, inventoryIds, insertedDisk, 'ROOM_314');
    } else if (chapter === 2) {
      setChapterCard(null);
      setChapter(3);
      setSubLocation('ROOM_314');
      setActiveNodeId('ch3_start');
      setInteractedIds([]);
      setMode('VN'); // Mở đầu Chương 3
      saveGameProgress(sanity, 'ch3_start', 'VN', [], 3, inventoryIds, insertedDisk, 'ROOM_314');
    } else if (chapter === 3) {
      setChapterCard(null);
      setChapter(4);
      setSubLocation('ROOM_314');
      setActiveNodeId(CH4_STAGE_NODE);
      setInteractedIds([]);
      setMode('OVERWORLD'); // Trạm điều khiển AURA-NODE-314 (Chapter4Stage)
      saveGameProgress(sanity, CH4_STAGE_NODE, 'OVERWORLD', [], 4, inventoryIds, insertedDisk, 'ROOM_314');
    }
  }, [chapter, insertedDisk, inventoryIds, sanity, saveGameProgress]);

  // Tự động chuyển tiếp card sau 4.5s
  useEffect(() => {
    if (chapterCard) {
      cardTimerRef.current = setTimeout(() => {
        handleProceedChapter();
      }, 4500);
      return () => {
        if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
      };
    }
  }, [chapterCard, handleProceedChapter]);

  // Khi đóng hộp thoại VN, trở về bản đồ
  const handleCloseVN = (finishedNodeId?: string) => {
    const lastNode = finishedNodeId || activeNodeId;
    if (lastNode === 'end_chapter_1') {
      // Miên làm tan bốn bức tường → card Chương II (bật trong onComplete của chuyển cảnh)
      setHavenTransition(true);
      return;
    }

    if (lastNode === 'restart_game') {
      // Hồi sinh sau Bad Ending 0 (Flatline)
      setChapter(1);
      setSubLocation('ROOM_314');
      setSanity(100);
      setActiveNodeId('start');
      setInteractedIds([]);
      setInventoryIds([]);
      setInsertedDisk(false);
      applyStoryFlags([]);
      setMode('OVERWORLD');
      saveGameProgress(100, 'start', 'OVERWORLD', [], 1, [], false, 'ROOM_314');
      return;
    }

    if (lastNode === 'ch3_crack_server') {
      // Máy tính nổ tung, thư mục bí mật bung mở → Card sang Chương 4
      setChapterCard({
        chapterNum: 'CHƯƠNG IV',
        title: 'HƯ VÔ KỸ THUẬT SỐ',
        subtitle: 'THE TERMINAL VOID • AURA-NODE-314',
        quote: '„Căn phòng vỡ vụn thành từng điểm ảnh rơi vào khoảng không... chỉ còn lại một con trỏ nhấp nháy.‟',
      });
      return;
    }

    if (lastNode === 'ch2_truth_confront' || lastNode === 'ch2_ending_stay' || lastNode === 'end_chapter_2') {
      // Lời cuối của Miên ở Màn 2 → chuyển cảnh "Mặt trời vỡ ra" → Card Chương 3
      setSunBreak(true);
      return;
    }

    const outroOf: Record<string, OutroKind> = {
      end_game_true: 'A',
      end_game_bad: 'B',
      end_game_neutral: 'C',
      end_game_stranger: 'S',
    };
    if (outroOf[lastNode]) {
      // Mỗi kết cục chiếu cutscene riêng, toast hiện khi cutscene kết thúc
      finishRun(outroOf[lastNode]);
      return;
    }

    setMode('OVERWORLD');
    saveGameProgress(sanity, activeNodeId, 'OVERWORLD', interactedIds, chapter, inventoryIds, insertedDisk, subLocation);
  };

  // ==========================================
  // CÁC HÀM ĐIỀU HƯỚNG NHANH CHO DEV (SKIP CHƯƠNG)
  // ==========================================
  const jumpToChapter2 = useCallback((withAllClues = false) => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    setChapterCard(null);
    setGameState('PLAYING');
    setChapter(2);
    setSubLocation('ROOM_314');
    setMode('OVERWORLD');
    setActiveNodeId('end_to_explore_sunset');
    setIsPauseMenuOpen(false);
    setIsSettingsOpen(false);
    setSanity(100);
    const clues = withAllClues
      ? ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box']
      : [];
    setInteractedIds(clues);
    saveGameProgress(100, 'end_to_explore_sunset', 'OVERWORLD', clues, 2, inventoryIds, insertedDisk, 'ROOM_314');
    setDevToast(
      withAllClues
        ? '⚡ DEV: MÀN 2 (ĐÃ KÍCH HOẠT 5/5 MANH MỐI • SẴN SÀNG GẶP MIÊN)'
        : '⚡ DEV: CHUYỂN SANG MÀN 2 (BẾN AN YÊN - 0/5 MANH MỐI)'
    );
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  const jumpToChapter1 = useCallback(() => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    setChapterCard(null);
    setGameState('PLAYING');
    setChapter(1);
    setSubLocation('ROOM_314');
    setMode('OVERWORLD');
    setActiveNodeId('start');
    setIsPauseMenuOpen(false);
    setIsSettingsOpen(false);
    setSanity(100);
    setInteractedIds([]);
    saveGameProgress(100, 'start', 'OVERWORLD', [], 1, inventoryIds, insertedDisk, 'ROOM_314');
    setDevToast('⚡ DEV: CHUYỂN VỀ MÀN 1 (PHÒNG 314)');
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  const jumpToChapter3 = useCallback((toOverworld = true, withAllClues = false) => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    setChapterCard(null);
    setGameState('PLAYING');
    setChapter(3);
    setSubLocation('ROOM_314');
    if (toOverworld) {
      setMode('OVERWORLD');
      setActiveNodeId('end_to_explore_pixel_bleed');
    } else {
      setMode('VN');
      setActiveNodeId('ch3_start');
    }
    setIsPauseMenuOpen(false);
    setIsSettingsOpen(false);
    setSanity(85);
    const clues = withAllClues
      ? ['ch3_bed', 'ch3_chart', 'ch3_monitor', 'ch3_mirror', 'ch3_window', 'ch3_door', 'ch3_bag']
      : [];
    setInteractedIds(clues);
    saveGameProgress(
      85,
      toOverworld ? 'end_to_explore_pixel_bleed' : 'ch3_start',
      toOverworld ? 'OVERWORLD' : 'VN',
      clues,
      3,
      inventoryIds,
      insertedDisk,
      'ROOM_314'
    );
    setDevToast(
      withAllClues
        ? '⚡ DEV: MÀN 3 (ĐÃ MỞ KHÓA TẤT CẢ MANH MỐI BỆNH VIỆN • ĐỐI CHẤT MIÊN)'
        : '⚡ DEV: CHUYỂN SANG MÀN 3 (PIXEL BLEED • XÂM THẤU BỆNH VIỆN)'
    );
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  // Mỗi lần nhảy vào Màn 4 thì dựng lại trạm điều khiển từ đầu (đồng hồ, hồ sơ, lựa chọn)
  const [ch4RunId, setCh4RunId] = useState(0);
  // secretTest: Sanity 55% + cờ thư mục AURA + cờ tin nhắn mẹ → thử Ending S "Người lạ"
  // (mở tệp đầu −5 → 50%, đọc tin nhắn mẹ +10 → 60%, vẫn nằm trong khoảng 40–60%)
  const jumpToChapter4 = useCallback((secretTest = false) => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    setChapterCard(null);
    setGameState('PLAYING');
    setChapter(4);
    setSubLocation('ROOM_314');
    setMode('OVERWORLD');
    setActiveNodeId(CH4_STAGE_NODE);
    setIsPauseMenuOpen(false);
    setIsSettingsOpen(false);
    const startSanity = secretTest ? 55 : 75;
    setSanity(startSanity);
    setInteractedIds([]);
    if (secretTest) {
      const flags = storyFlagsRef.current;
      applyStoryFlags([...flags, ...['flag_read_aura_project', 'flag_heard_mom'].filter((f) => !flags.includes(f))]);
    }
    setCh4RunId((n) => n + 1);
    saveGameProgress(startSanity, CH4_STAGE_NODE, 'OVERWORLD', [], 4, inventoryIds, insertedDisk, 'ROOM_314');
    setDevToast(
      secretTest
        ? '⚡ DEV: MÀN 4 • THỬ ENDING S (SANITY 55% • ĐÃ ĐỌC ĐỒ ÁN AURA • ĐÃ NGHE TIN NHẮN MẸ)'
        : '⚡ DEV: CHUYỂN SANG CHƯƠNG 4 (HỒ SƠ ĐÊM 17/05 • 3 KẾT CỤC)'
    );
  }, [applyStoryFlags, insertedDisk, inventoryIds, saveGameProgress]);

  // Khôi phục sau khi sốc điện tim cấp cứu (Sanity = 30%)
  const handleReviveFromCollapse = useCallback((newSanity: number) => {
    setSanity(newSanity);
    saveGameProgress(newSanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, subLocation);
    setDevToast('⚡ BẠN ĐÃ ĐƯỢC CẤP CỨU HỒI TỈNH (SANITY = 30%)');
  }, [activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, subLocation, saveGameProgress]);

  // Khôi phục điểm lưu gần nhất sau khi chết não
  const handleLoadLastSaveFromCollapse = useCallback(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY_SAVE);
      if (savedRaw) {
        const parsed: SaveData = JSON.parse(savedRaw);
        const restoredSanity = Math.max(40, parsed.sanity ?? 100);
        setChapter(parsed.chapter ?? 1);
        setSubLocation(parsed.subLocation ?? 'ROOM_314');
        setSanity(restoredSanity);
        setActiveNodeId(parsed.activeNodeId ?? 'start');
        setMode(parsed.mode ?? 'OVERWORLD');
        setInteractedIds(parsed.interactedIds ?? []);
        setInventoryIds(parsed.inventoryIds ?? []);
        setInsertedDisk(parsed.insertedDisk ?? false);
        applyStoryFlags(parsed.storyFlags ?? []);
        setGameState('PLAYING');
        setIsPauseMenuOpen(false);
        saveGameProgress(
          restoredSanity,
          parsed.activeNodeId ?? 'start',
          parsed.mode ?? 'OVERWORLD',
          parsed.interactedIds ?? [],
          parsed.chapter ?? 1,
          parsed.inventoryIds ?? [],
          parsed.insertedDisk ?? false,
          parsed.subLocation ?? 'ROOM_314'
        );
        setDevToast('↩ ĐÃ PHỤC HỒI ĐIỂM NHỚ GẦN NHẤT');
      } else {
        handleStartNewGame();
      }
    } catch {
      handleStartNewGame();
    }
  }, [saveGameProgress]);

  // Tự tắt thông báo Dev Toast sau 3.2 giây
  useEffect(() => {
    if (devToast) {
      const timer = setTimeout(() => setDevToast(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [devToast]);

  // Phá vỡ bức tường thứ 4: rời tab khi đang chơi → tiêu đề tab thành lời Miên gọi;
  // quay lại sau vài giây → Miên thì thầm một câu (không dùng toast dev)
  const [returnWhisper, setReturnWhisper] = useState<string | null>(null);
  // Lần thì thầm gần nhất (giữ qua các chương để không lặp lại dồn dập)
  const lastWhisperAtRef = useRef(0);
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const originalTitle = document.title;
    let leftAt = 0;
    let whisperTimer: ReturnType<typeof setTimeout> | null = null;
    const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)];

    const handleVisibilityChange = () => {
      const lines = AWAY_LINES[chapter] ?? AWAY_LINES[1];
      if (document.hidden) {
        leftAt = Date.now();
        document.title = tx(pick(lines.titles));
        return;
      }
      document.title = originalTitle;
      // Trình duyệt cũng báo "ẩn" khi cửa sổ khác che kín / thu nhỏ / đổi tab trong VS Code,
      // nên chỉ thì thầm khi rời đi đủ lâu và không quá dày
      const now = Date.now();
      if (leftAt && now - leftAt >= WHISPER_MIN_AWAY_MS && now - lastWhisperAtRef.current >= WHISPER_COOLDOWN_MS) {
        lastWhisperAtRef.current = now;
        setReturnWhisper(tx(pick(lines.returns)));
        if (whisperTimer) clearTimeout(whisperTimer);
        whisperTimer = setTimeout(() => setReturnWhisper(null), 3600);
      }
      leftAt = 0;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (whisperTimer) clearTimeout(whisperTimer);
      document.title = originalTitle;
    };
  }, [chapter, gameState]);

  // Lắng nghe phím ESC để mở Pause Menu trong lúc đang chơi, phím K/L/M để Skip chương (chỉ khi bật thanh Dev) & phím bỏ qua Chapter Card
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Phím ~ (Backquote) hoặc F2: bật/tắt thanh Dev (không tính khi đang gõ vào ô nhập)
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (!typing && !e.repeat && (e.code === 'Backquote' || e.key === 'F2')) {
        e.preventDefault();
        setShowDevToolbar((prev) => !prev);
        return;
      }
      // Đang chiếu chuyển cảnh: Esc/Enter thuộc về cutscene (bỏ qua), không mở menu hay nhảy chương
      if (sunBreak || havenTransition || stageCutscene) return;
      const devKey = showDevToolbar && !typing;
      // Phím tắt K dành cho dev để nhảy Màn 2
      if (devKey && e.key.toLowerCase() === 'k') {
        const coreAnomalies = ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box'];
        const foundCount = interactedIds.filter(id => coreAnomalies.includes(id)).length;
        if (chapter !== 2 || gameState !== 'PLAYING') {
          jumpToChapter2(false);
        } else if (foundCount < 5) {
          jumpToChapter2(true);
        } else {
          jumpToChapter1();
        }
        return;
      }

      // Phím tắt L dành cho dev để nhảy thẳng Màn 3
      if (devKey && e.key.toLowerCase() === 'l') {
        const coreCh3 = ['ch3_bed', 'ch3_chart', 'ch3_monitor', 'ch3_mirror', 'ch3_window', 'ch3_door', 'ch3_bag'];
        const foundCount = interactedIds.filter(id => coreCh3.includes(id)).length;
        if (chapter !== 3 || gameState !== 'PLAYING') {
          jumpToChapter3(true, false);
        } else if (foundCount < 5) {
          jumpToChapter3(true, true);
        } else {
          jumpToChapter1();
        }
        return;
      }

      // Phím tắt M dành cho dev để nhảy thẳng Màn 4; bấm lần nữa khi đang ở Màn 4 → thử Ending S
      if (devKey && e.key.toLowerCase() === 'm') {
        jumpToChapter4(chapter === 4 && gameState === 'PLAYING');
        return;
      }

      if (chapterCard) {
        handleProceedChapter();
        return;
      }

      if (e.key === 'Escape') {
        if (gameState === 'PLAYING') {
          // Nếu đang mở modal Settings thì đóng Settings trước
          if (isSettingsOpen) {
            setIsSettingsOpen(false);
            return;
          }
          // Bật/tắt Pause Menu
          setIsPauseMenuOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isSettingsOpen, chapterCard, handleProceedChapter, chapter, interactedIds, jumpToChapter2, jumpToChapter1, jumpToChapter3, jumpToChapter4, sunBreak, havenTransition, stageCutscene, showDevToolbar]);

  const { lang } = useLanguage();
  // Chữ trong JSX dịch theo `lang` của context (lúc hydrate luôn là 'vi') để không lệch với HTML server
  const tr = (vi: string) => translate(lang, vi);
  // Lời kết Ending M lấy theo ngôn ngữ đang chọn (chưa dịch thì dùng tiếng Việt)
  const abandonedText = getStory(lang)['end_game_abandoned']?.text ?? '';

  return (
    <main
      className={`relative w-screen h-screen overflow-hidden bg-black select-none ${
        // Hồi tưởng là ký ức thật: không scanline, không nhấp nháy CRT
        settings.crtEnabled && !stageCutscene ? 'crt-overlay crt-flicker' : ''
      }`}
    >
      {/* Co thắt nhịp tim khi Sanity ≤ 35%: vignette đỏ bầm đập đúng nhịp tim của audioEngine */}
      {gameState === 'PLAYING' && <HeartbeatOverlay sanity={sanity} />}
      {showContentWarning && (
        <ContentWarning onDone={() => setShowContentWarning(false)} onSkipGesture={initAudio} />
      )}

      {/* Lời Miên thì thầm khi người chơi quay lại tab */}
      {returnWhisper && gameState === 'PLAYING' && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 text-sm italic text-pink-200/90 bg-black/70 border border-pink-900/60 rounded pointer-events-none animate-pulse">
          &ldquo;{returnWhisper}&rdquo;
        </div>
      )}

      {/* Toast thông báo phím tắt Dev */}
      {devToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-400 text-black font-mono font-bold text-xs rounded-full shadow-[0_0_25px_rgba(251,191,36,0.9)] border-2 border-white animate-bounce flex items-center gap-2 pointer-events-none">
          <span className="text-sm">⚡</span>
          <span>{tr(devToast)}</span>
        </div>
      )}

      {/* =========================================================
          1. MÀN HÌNH CHÍNH (MAIN MENU)
         ========================================================= */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          gameState === 'MENU' ? 'opacity-100 pointer-events-auto z-40' : 'opacity-0 pointer-events-none -z-10'
        }`}
      >
        {gameState === 'MENU' && (
          <MainMenu
            onStartNewGame={handleStartNewGame}
            onContinueGame={handleContinueGame}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAchievements={() => setIsAchievementsOpen(true)}
            unlockedEndingsCount={unlockedEndings.length}
            totalEndingsCount={5}
            hasSaveData={hasSaveData}
          />
        )}
      </div>

      {/* =========================================================
          2. MÀN HÌNH ĐOẠN PHIM MỞ ĐẦU (INTRO CUTSCENE)
         ========================================================= */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          gameState === 'INTRO' ? 'opacity-100 pointer-events-auto z-40' : 'opacity-0 pointer-events-none -z-10'
        }`}
      >
        {gameState === 'INTRO' && (
          <IntroCutscene
            onComplete={handleCompleteIntro}
            volume={settings.masterVolume}
          />
        )}
      </div>

      {/* Chuyển cảnh Màn 1 → Màn 2: Bốn bức tường tan biến */}
      {havenTransition && (
        <div className="absolute inset-0 z-50">
          <HavenTransition
            volume={settings.masterVolume}
            onComplete={() => {
              setHavenTransition(false);
              setChapterCard({
                chapterNum: 'CHƯƠNG II',
                title: 'THỊ TRẤN HOÀNG HÔN',
                subtitle: 'THE HAVEN • VÙNG AN TOÀN TRONG KÝ ỨC',
                quote: '„Căn phòng này ngột ngạt quá rồi... Hãy để em đưa anh đến nơi chúng ta từng hẹn ước...‟',
              });
            }}
          />
        </div>
      )}

      {/* Chuyển cảnh Màn 2 → Màn 3: Mặt trời vỡ ra */}
      {sunBreak && (
        <div className="absolute inset-0 z-50">
          <SunBreakTransition
            volume={settings.masterVolume}
            onComplete={() => {
              setSunBreak(false);
              setChapterCard({
                chapterNum: 'CHƯƠNG III',
                title: 'SỰ XÂM THẤU CỦA ĐIỂM ẢNH',
                subtitle: 'PIXEL BLEED • KHI THỰC TẠI RÒ RỈ',
                quote: '„Cơn mơ đẹp nhất đã vỡ vụn... Những mảnh vỡ thực tại bắt đầu rỉ máu qua từng vệt điểm ảnh...‟',
              });
            }}
          />
        </div>
      )}

      {/* =========================================================
          2B. CUTSCENE KẾT CỤC (A: BÌNH MINH • B: ĐỊA NGỤC NGỌT NGÀO • C: ĐỨT ĐOẠN KÝ ỨC)
         ========================================================= */}
      {gameState === 'OUTRO' && (
        <div className="absolute inset-0 z-40">
          {outroEnding === 'A' ? (
            <EndingCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('🌅 BẠN ĐÃ MỞ KHÓA [TRUE ENDING: BÌNH MINH THẬT SỰ]');
              }}
            />
          ) : outroEnding === 'S' ? (
            <EndingSCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('🕯 BẠN ĐÃ MỞ KHÓA [SECRET ENDING: NGƯỜI LẠ]');
              }}
            />
          ) : outroEnding === 'M' ? (
            <QuietEnding
              lines={abandonedText.replace('{LEFT_AT}', abandonedAt).split('\n')}
              buttonLabel={tr('[ KHỞI ĐỘNG LẠI Ý THỨC ]')}
              tabTitle={tr(ABANDONED_TAB_TITLE)}
              onDone={handleStartNewGame}
            />
          ) : outroEnding === 'B' ? (
            <EndingBCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('🩸 BẠN ĐÃ KÍCH HOẠT [BAD ENDING: ĐỊA NGỤC NGỌT NGÀO]');
              }}
            />
          ) : (
            <EndingCCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('⬛ BẠN ĐÃ ĐẾN [NEUTRAL ENDING: ĐỨT ĐOẠN KÝ ỨC (MẤT KẾT NỐI VĨNH VIỄN)]');
              }}
            />
          )}
        </div>
      )}

      {/* =========================================================
          3. MÀN HÌNH CHƠI GAME (PLAYING STATE)
         ========================================================= */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          gameState === 'PLAYING' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ---- GIAI ĐOẠN 1: BẢN ĐỒ OVERWORLD (PHÒNG TRỌ HOẶC THỊ TRẤN HOÀNG HÔN) ---- */}
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${
            mode === 'OVERWORLD' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Chỉ dựng màn chơi khi đang chơi: finishRun đặt lại chapter = 1, nếu không phòng 314 sẽ chạy ngầm
              (cả chớp lẫn tiếng sấm) dưới cutscene kết cục và menu */}
          {gameState !== 'PLAYING' ? null : chapter === 1 ? (
            subLocation === 'HALLWAY' ? (
              <HallwayStage
                parallax={settings.parallaxEnabled}
                characterSprite="/assets/an_spritesheet.png"
                sanity={sanity}
                setSanity={setSanity}
                onTrigger={handleTrigger}
                onEnterRoom314={handleEnterRoom314}
                interactedIds={interactedIds}
                onMarkInteracted={handleMarkInteracted}
                inventoryIds={inventoryIds}
                onUpdateInventory={(newIds) => {
                  setInventoryIds(newIds);
                  saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, newIds, insertedDisk, subLocation);
                }}
                volume={settings.masterVolume}
              />
            ) : (
              <OverworldStage
                parallax={settings.parallaxEnabled}
                characterSprite="/assets/an_spritesheet.png"
                sanity={sanity}
                setSanity={setSanity}
                onTrigger={handleTrigger}
                onExitToHallway={handleExitToHallway}
                interactedIds={interactedIds}
                onMarkInteracted={handleMarkInteracted}
                inventoryIds={inventoryIds}
                onUpdateInventory={(newIds) => {
                  setInventoryIds(newIds);
                  saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, newIds, insertedDisk, subLocation);
                }}
                insertedDisk={insertedDisk}
                onSetFlag={handleSetStoryFlag}
                onInsertDisk={() => {
                  setInsertedDisk(true);
                  saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, true, subLocation);
                }}
                volume={settings.masterVolume}
              />
            )
          ) : chapter === 2 ? (
            <SunsetStage
                parallax={settings.parallaxEnabled}
              characterSprite="/assets/an_spritesheet.png"
              sanity={sanity}
              setSanity={setSanity}
              onTrigger={handleTrigger}
              interactedIds={interactedIds}
              onMarkInteracted={handleMarkInteracted}
              volume={settings.masterVolume}
              onCutsceneChange={setStageCutscene}
            />
          ) : chapter === 4 ? (
            // Chỉ dựng khi đang ở trạm điều khiển: đồng hồ đếm ngược không được chạy ngầm dưới hộp thoại kết cục
            mode === 'OVERWORLD' && (
              <Chapter4Stage
                key={ch4RunId}
                sanity={sanity}
                setSanity={setSanity}
                storyFlags={storyFlags}
                onTriggerEnding={handleTriggerEnding}
                onSetStoryFlag={handleSetStoryFlag}
                volume={settings.masterVolume}
                bgmVolume={settings.bgmVolume}
                paused={isPauseMenuOpen || isSettingsOpen}
              />
            )
          ) : (
            <PixelBleedStage
                parallax={settings.parallaxEnabled}
              characterSprite="/assets/an_spritesheet.png"
              sanity={sanity}
              setSanity={setSanity}
              onTrigger={handleTrigger}
              interactedIds={interactedIds}
              onMarkInteracted={handleMarkInteracted}
              volume={settings.masterVolume}
              active={mode === 'OVERWORLD' && !isPauseMenuOpen && !isSettingsOpen && !chapterCard}
            />
          )}
        </div>

        {/* ---- GIAI ĐOẠN 2: HỘP THOẠI VISUAL NOVEL ---- */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            // Thẻ chương đang hiện thì giấu khung thoại cũ ("HẾT CHƯƠNG…") phía sau
            mode === 'VN' && !chapterCard ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 pointer-events-none'
          }`}
        >
          {mode === 'VN' && (
            <VNStage
              key={`${chapter}-${mode}-${activeNodeId}`}
              initialNodeId={activeNodeId}
              sanity={sanity}
              setSanity={setSanity}
              onClose={handleCloseVN}
              textSpeed={settings.textSpeed}
              volume={settings.masterVolume}
              storyFlags={storyFlags}
              onSetFlag={handleSetStoryFlag}
            />
          )}
        </div>

        {/* Nút Pause nhanh ở góc màn hình */}
        <button
          onClick={() => setIsPauseMenuOpen(true)}
          className="absolute top-3 left-3 z-30 bg-black/70 hover:bg-zinc-800 text-zinc-400 hover:text-white px-2.5 py-1 text-xs font-mono border border-zinc-700/80 rounded backdrop-blur-sm transition-all"
        >
          {tr('[ESC] TẠM DỪNG')}
        </button>

        {/* Dev Skip Toolbar (Dành cho Dev test nhanh các màn) — ẩn mặc định, bật bằng ~ hoặc F2 */}
        {showDevToolbar && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 font-mono text-[11px] select-none">
          <button
            onClick={() => jumpToChapter2(false)}
            title={tr('Nhấn phím [K] để nhảy thẳng sang Màn 2 (0/5 manh mối)')}
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 2 && interactedIds.length < 5
                ? 'bg-fuchsia-900/90 border-fuchsia-400 text-fuchsia-200 shadow-[0_0_12px_rgba(217,70,239,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-pink-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('⚡ [K] Màn 2')}
          </button>
          <button
            onClick={() => jumpToChapter2(true)}
            title={tr('Mở khóa 5/5 manh mối Màn 2 để kiểm tra bầu trời pha 3 và gặp Miên')}
            className={`px-2.5 py-1 rounded border font-semibold transition-all cursor-pointer ${
              chapter === 2 &&
              interactedIds.filter(id => ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box'].includes(id)).length >= 5
                ? 'bg-amber-950 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-amber-400 text-amber-400'
            }`}
          >
            {tr('✦ Đủ 5 Manh Mối')}
          </button>
          <button
            onClick={() => jumpToChapter3(true)}
            title={tr('Nhấn phím [L] để nhảy thẳng sang Màn 3 (Pixel Bleed Stage)')}
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 3 && (mode === 'OVERWORLD' || activeNodeId.startsWith('ch3'))
                ? 'bg-rose-900/90 border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('🩸 [L] Màn 3')}
          </button>
          <button
            onClick={() => jumpToChapter4(chapter === 4 && gameState === 'PLAYING')}
            title={tr('Nhấn phím [M] để nhảy thẳng sang Chương 4; bấm lần nữa để thử Ending S')}
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 4
                ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-emerald-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('💻 [M] Màn 4')}
          </button>
          <button
            onClick={jumpToChapter1}
            title={tr('Quay về Màn 1 (Phòng 314)')}
            className={`px-2.5 py-1 rounded border font-semibold transition-all cursor-pointer ${
              chapter === 1
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-cyan-400 text-zinc-400 hover:text-cyan-300'
            }`}
          >
            {tr('↩ Màn 1')}
          </button>
          <button
            onClick={() => {
              setSanity(0);
              setDevToast('⚡ DEV: KÍCH HOẠT NGUY KỊCH TÂM TRÍ (SANITY = 0%)');
            }}
            title={tr('Thử nghiệm khẩn cấp: Đưa Sanity về 0% để kích hoạt Máy khử rung tim (Defibrillator QTE)')}
            className="px-2.5 py-1 rounded border border-red-700/80 bg-red-950/70 hover:bg-red-900 text-red-300 hover:text-red-100 font-semibold transition-all cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.4)]"
          >
            ⚡ Sanity 0%
          </button>
        </div>
        )}
      </div>

      {/* =========================================================
          3. PAUSE MENU TRONG TRÒ CHƠI
         ========================================================= */}
      {isPauseMenuOpen && gameState === 'PLAYING' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none font-mono"
          onClick={() => setIsPauseMenuOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-zinc-950/95 border-2 border-zinc-700 p-6 rounded shadow-[0_0_30px_rgba(0,0,0,0.9)] text-center text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold tracking-widest text-cyan-400 uppercase mb-4 border-b border-zinc-800 pb-2">
              {tr('// TẠM DỪNG TRÒ CHƠI [PAUSED]')}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setIsPauseMenuOpen(false)}
                className="w-full py-2.5 px-4 bg-cyan-950/50 hover:bg-cyan-900/70 border border-cyan-600/80 text-cyan-200 text-xs font-bold rounded tracking-wider transition-all"
              >
                {tr('TIẾP TỤC TRẢI NGHIỆM')}
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold rounded tracking-wider transition-all"
              >
                {tr('CÀI ĐẶT TRÒ CHƠI')}
              </button>

              <button
                onClick={() => {
                  saveGameProgress(sanity, activeNodeId, mode);
                  setIsPauseMenuOpen(false);
                  setGameState('MENU');
                }}
                className="w-full py-2.5 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-700/80 text-red-300 text-xs font-bold rounded tracking-wider transition-all"
              >
                {tr('LƯU & VỀ MENU CHÍNH')}
              </button>
            </div>

            <div className="mt-4 text-[10px] text-zinc-500">
              {tr('* Tiến trình trò chơi được tự động lưu liên tục')}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          4. MODAL THIẾT LẬP (SETTINGS MODAL)
         ========================================================= */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* =========================================================
          4B. MODAL THÀNH TỰU & HỒ SƠ KẾT CỤC (ACHIEVEMENTS MODAL)
         ========================================================= */}
      <AchievementsModal
        isOpen={isAchievementsOpen}
        unlockedEndings={unlockedEndings}
        onClose={() => setIsAchievementsOpen(false)}
      />

      {/* =========================================================
          5. BẢNG TIÊU ĐỀ CHUYỂN CHƯƠNG ĐIỆN ẢNH (CINEMATIC CHAPTER CARD)
         ========================================================= */}
      {chapterCard && (
        <div
          onClick={handleProceedChapter}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 text-center cursor-pointer select-none px-6 transition-all duration-700 animate-in fade-in"
        >
          {/* Hào quang tím hoàng hôn ấm áp */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/40 via-black/80 to-black pointer-events-none" />

          <div className="relative z-10 max-w-xl space-y-5">
            <div className="text-xs md:text-sm font-mono tracking-[0.35em] text-pink-400 uppercase">
              {tr(chapterCard.chapterNum)}
            </div>

            <h1 className="text-2xl md:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-amber-200 drop-shadow-[0_0_25px_rgba(216,180,254,0.6)]">
              {tr(chapterCard.title)}
            </h1>

            <div className="text-xs md:text-sm font-mono tracking-wider text-purple-300/80">
              [ {tr(chapterCard.subtitle)} ]
            </div>

            <div className="w-36 h-[1px] bg-gradient-to-r from-transparent via-pink-400/60 to-transparent mx-auto my-5" />

            <p className="text-sm md:text-base italic font-serif text-zinc-300 max-w-lg mx-auto leading-relaxed">
              {tr(chapterCard.quote)}
            </p>

            <div className="pt-8 text-[11px] md:text-xs font-mono text-zinc-500 tracking-widest uppercase animate-pulse">
              {tr('[ NHẤN PHÍM BẤT KỲ HOẶC CHẠM ĐỂ BẮT ĐẦU ]')}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          6. CƠN SẬP NGUỒN Ý THỨC KHI SANITY = 0% (SYNAPTIC COLLAPSE & DEFIBRILLATOR)
         ========================================================= */}
      <SynapticCollapseOverlay
        isOpen={sanity <= 0 && gameState === 'PLAYING'}
        onRevive={handleReviveFromCollapse}
        onLoadLastSave={handleLoadLastSaveFromCollapse}
        onRestart={handleStartNewGame}
      />
    </main>
  );
}
