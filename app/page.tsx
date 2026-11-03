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
import { PauseMenu } from '../src/components/PauseMenu';
import { AchievementsModal } from '../src/components/AchievementsModal';
import { IntroCutscene } from '../src/components/IntroCutscene';
import { ControlsTutorial } from '../src/components/ControlsTutorial';
import { EndingCutscene } from '../src/components/EndingCutscene';
import { EndingBCutscene } from '../src/components/EndingBCutscene';
import { EndingCCutscene } from '../src/components/EndingCCutscene';
import { EndingSCutscene } from '../src/components/EndingSCutscene';
import { QuietEnding } from '../src/components/QuietEnding';
import { HeartbeatOverlay } from '../src/components/HeartbeatOverlay';
import { getStory } from '../src/data/storyLoader';
import { useLanguage } from '../src/context/LanguageContext';
import { SunBreakTransition } from '../src/components/SunBreakTransition';
import { DreamTransition } from '../src/components/DreamTransition';
import { CoreDescentTransition } from '../src/components/CoreDescentTransition';
import { SynapticCollapseOverlay } from '../src/components/SynapticCollapseOverlay';
import { ContentWarning } from '../src/components/ContentWarning';
import { audioEngine, AudioScene } from '../src/services/audioEngine';
import { tx, translate } from '../src/locales/tx';
import { hasOpenUiLayer } from '../src/services/uiLayers';

// OUTRO: cutscene sau mỗi kết cục (A / B / C) trước khi về menu
type GameState = 'MENU' | 'INTRO' | 'PLAYING' | 'OUTRO';

// Tên chương: một dòng phụ đề nhỏ ở góc dưới, hiện 2.5 giây khi người chơi vừa được tự do đi lại trong màn mới
// (không còn thẻ chương che màn hình bắt bấm phím)
const CHAPTER_TITLES: Record<number, string> = {
  2: 'Chương II — Thị Trấn Hoàng Hôn',
  3: 'Chương III — Sự Xâm Thấu Của Điểm Ảnh',
  4: 'Chương IV — Trạm Lệnh Cuối Cùng',
};
const CHAPTER_TITLE_MS = 2500;
// Chuyển cảnh hoạt hoạ giữa các màn: Màn 1→2 chìm vào giấc mộng • Màn 2→3 mặt trời vỡ • Màn 3→4 sụp vào trạm máy chủ
type ChapterTransition = 'dream' | 'sunbreak' | 'core';
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
  /** Node hội thoại đã nhận Sanity dương (mỗi node chỉ hồi một lần mỗi ván) */
  sanityClaimedIds?: string[];
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
// Ra vào cửa phòng 314 ↔ hành lang: tối dần, đổi cảnh dưới màn đen, rồi sáng lại
const DOOR_FADE_SWAP_MS = 250;
const DOOR_FADE_HOLD_MS = 60;
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
  // Chống hồi Sanity vô hạn: node thoại đã cộng Sanity dương thì lần sau chỉ phát thoại, không cộng nữa
  const [sanityClaimedIds, setSanityClaimedIds] = useState<string[]>([]);
  const sanityClaimedRef = useRef<string[]>([]);
  const applySanityClaims = useCallback((ids: string[]) => {
    sanityClaimedRef.current = ids;
    setSanityClaimedIds(ids);
  }, []);
  const [insertedDisk, setInsertedDisk] = useState<boolean>(false);
  // Chuyển cảnh giữa các màn đang chiếu (thay cho thẻ chương cũ)
  const [transition, setTransition] = useState<ChapterTransition | null>(null);
  // Đoạn thoại mở đầu chương đang phát: hộp thoại nổi ngay trên màn chơi mới (không che bằng nền đen),
  // đóng xong thì hiện phụ đề tên chương
  const [chapterOpening, setChapterOpening] = useState<number | null>(null);
  const [chapterTitle, setChapterTitle] = useState<{ chapter: number; id: number } | null>(null);

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
  // Màn 2 đang chiếu cutscene riêng (hồi tưởng sau tấm ảnh Polaroid): tắt nhạc nền, chặn phím tắt của trang
  const [stageCutscene, setStageCutscene] = useState(false);
  // Bảng hướng dẫn điều khiển: hiện một lần khi An vừa tỉnh dậy sau đoạn phim mở đầu
  const [showTutorial, setShowTutorial] = useState(false);

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
      targetScene = 'VOID'; // Đoạn phim mở đầu tự tổng hợp toàn bộ âm thanh (kể cả khoảng tắt ngấm sau va chạm)
    } else if (gameState === 'OUTRO') {
      targetScene = 'VOID'; // Cutscene tự phát âm thanh riêng
    } else if (gameState === 'PLAYING') {
      if (stageCutscene || transition) {
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
  }, [gameState, chapter, subLocation, stageCutscene, transition]);

  // 3. Tự động đồng bộ độ biến dạng âm thanh theo Sanity (DSP Lowpass, ù tai, nhịp tim) — chỉ khi đang chơi:
  // về Menu / xem cutscene thì trả về 100% để nhịp tim, ù tai của màn chơi không theo sang
  useEffect(() => {
    audioEngine.setSanity(gameState === 'PLAYING' ? sanity : 100);
  }, [sanity, gameState]);

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
        sanityClaimedIds: sanityClaimedRef.current,
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

  // Ghi nhận node thoại vừa hồi Sanity (lần đầu tiên)
  const handleClaimSanity = useCallback((nodeId: string) => {
    if (sanityClaimedRef.current.includes(nodeId)) return;
    applySanityClaims([...sanityClaimedRef.current, nodeId]);
  }, [applySanityClaims]);

  // Đánh dấu đồ vật đã hoàn thành tương tác
  const handleMarkInteracted = (id: string) => {
    setInteractedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      saveGameProgress(sanity, activeNodeId, mode, next, chapter, inventoryIds, insertedDisk, subLocation);
      return next;
    });
  };

  // Màn đen chuyển cảnh khi đi qua cửa (thay cho cắt cảnh tức thì)
  const [isDoorTransitioning, setIsDoorTransitioning] = useState(false);
  const doorTimersRef = useRef<number[]>([]);
  const doorBusyRef = useRef(false);
  useEffect(() => () => doorTimersRef.current.forEach((id) => window.clearTimeout(id)), []);
  const transitionThroughDoor = (to: SubLocation) => {
    if (doorBusyRef.current) return;
    doorBusyRef.current = true;
    setIsDoorTransitioning(true);
    const swap = window.setTimeout(() => {
      setSubLocation(to);
      saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, to);
      // Giữ màn đen thêm một nhịp để cảnh mới kịp vẽ khung đầu tiên rồi mới sáng lại
      const reveal = window.setTimeout(() => {
        setIsDoorTransitioning(false);
        doorBusyRef.current = false;
        doorTimersRef.current = [];
      }, DOOR_FADE_HOLD_MS);
      doorTimersRef.current.push(reveal);
    }, DOOR_FADE_SWAP_MS);
    doorTimersRef.current = [swap];
  };

  // Chuyển vị trí: Phòng trọ #314 -> Hành lang tầng 3
  const handleExitToHallway = () => transitionThroughDoor('HALLWAY');

  // Chuyển vị trí: Hành lang tầng 3 -> Phòng trọ #314
  const handleEnterRoom314 = () => transitionThroughDoor('ROOM_314');

  // Bắt đầu phiên chơi mới [KHỞI TẠO Ý THỨC]
  const handleStartNewGame = () => {
    setTransition(null);
    setChapterOpening(null);
    setChapterTitle(null);
    setChapter(1);
    setSubLocation('ROOM_314');
    setSanity(100);
    setActiveNodeId('start');
    setMode('OVERWORLD');
    setInteractedIds([]);
    setInventoryIds([]);
    setInsertedDisk(false);
    applyStoryFlags([]);
    applySanityClaims([]);
    try {
      localStorage.removeItem(STORAGE_KEY_ABANDONED);
    } catch {}
    document.title = DEFAULT_TAB_TITLE;
    setGameState('INTRO'); // Mở đoạn mở đầu Cinematic Prologue!
    setIsPauseMenuOpen(false);
    saveGameProgress(100, 'start', 'OVERWORLD', [], 1, [], false, 'ROOM_314');
  };

  // Khi kết thúc Cutscene mở màn (hoặc bấm Skip) -> Chuyển sang hộp thoại VN để An độc thoại mở đầu!
  // Hết đoạn phim mở đầu: mở mắt là đã đứng trong phòng trọ #314 (cảnh tỉnh dậy đã chiếu trong phim,
  // nên bỏ qua node tự sự 'start'), bật bảng hướng dẫn điều khiển
  const handleCompleteIntro = () => {
    setGameState('PLAYING');
    setChapter(1);
    setSubLocation('ROOM_314');
    setMode('OVERWORLD');
    setActiveNodeId('start');
    setShowTutorial(true);
  };

  // Đóng bảng hướng dẫn → dòng suy nghĩ đầu tiên của An bên bàn phím (giữ nhánh đọc log AURA của cốt truyện)
  const handleCloseTutorial = () => {
    setShowTutorial(false);
    window.setTimeout(() => handleTrigger('node_pc_1'), 600);
  };

  // Tải lại phiên chơi cũ [PHỤC HỒI ĐIỂM NHỚ]
  const handleContinueGame = () => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY_SAVE);
      if (savedRaw) {
        const parsed: SaveData = JSON.parse(savedRaw);
        setTransition(null);
        setChapterOpening(null);
        setChapterTitle(null);
        setChapter(parsed.chapter ?? 1);
        setSubLocation(parsed.subLocation ?? 'ROOM_314');
        setSanity(parsed.sanity ?? 100);
        setActiveNodeId(parsed.activeNodeId ?? 'start');
        setMode(parsed.mode ?? 'OVERWORLD');
        setInteractedIds(parsed.interactedIds ?? []);
        setInventoryIds(parsed.inventoryIds ?? []);
        setInsertedDisk(parsed.insertedDisk ?? false);
        applyStoryFlags(parsed.storyFlags ?? []);
        applySanityClaims(parsed.sanityClaimedIds ?? []);
        setGameState('PLAYING');
        setIsPauseMenuOpen(false);
      }
    } catch {
      handleStartNewGame();
    }
  };

  // Vật thể vừa mở hộp thoại chỉ được ghi "đã xong" khi hộp thoại được giải quyết (đã chọn phương án
  // hoặc đọc hết); đóng ngang bằng Esc / [Đóng] thì vật thể vẫn bấm [E] lại được
  const pendingMarkRef = useRef<string | null>(null);
  const vnResolvedRef = useRef(false);
  const handleVNChoice = useCallback(() => {
    vnResolvedRef.current = true;
  }, []);

  // Khi người chơi bước vào ô trigger trên bản đồ (markId: vật thể cần đánh dấu khi xong hộp thoại)
  const handleTrigger = (nodeId: string, markId?: string) => {
    pendingMarkRef.current = markId ?? null;
    vnResolvedRef.current = false;
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
    applySanityClaims([]);
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

  // Hiện phụ đề tên chương (tự mờ dần sau CHAPTER_TITLE_MS)
  const showChapterTitle = (n: number) => {
    if (CHAPTER_TITLES[n]) setChapterTitle({ chapter: n, id: Date.now() });
  };

  /** Hết chuyển cảnh Màn 1→2 / 2→3: vào thẳng màn mới, đoạn thoại mở đầu nổi ngay trên màn chơi */
  const enterChapterOpening = (next: 2 | 3) => {
    const node = next === 2 ? 'ch2_start' : 'ch3_start';
    setTransition(null);
    setChapter(next);
    setSubLocation('ROOM_314');
    setActiveNodeId(node);
    setInteractedIds([]);
    setChapterOpening(next);
    setMode('VN');
    saveGameProgress(sanity, node, 'VN', [], next, inventoryIds, insertedDisk, 'ROOM_314');
  };

  /** Hết chuyển cảnh Màn 3→4: vào thẳng trạm điều khiển AURA-NODE-314 */
  const enterChapter4 = () => {
    setTransition(null);
    setChapter(4);
    setSubLocation('ROOM_314');
    setActiveNodeId(CH4_STAGE_NODE);
    setInteractedIds([]);
    setMode('OVERWORLD');
    showChapterTitle(4);
    saveGameProgress(sanity, CH4_STAGE_NODE, 'OVERWORLD', [], 4, inventoryIds, insertedDisk, 'ROOM_314');
  };

  // Khi đóng hộp thoại VN, trở về bản đồ
  const handleCloseVN = (finishedNodeId?: string) => {
    const lastNode = finishedNodeId || activeNodeId;
    // Không có finishedNodeId = đóng ngang (Esc / nút [Đóng]); chỉ ghi vật thể nếu đã chọn phương án
    let nextIds = interactedIds;
    const markId = pendingMarkRef.current;
    pendingMarkRef.current = null;
    if (markId && (finishedNodeId || vnResolvedRef.current) && !nextIds.includes(markId)) {
      nextIds = [...nextIds, markId];
      setInteractedIds(nextIds);
    }
    // Xong đoạn thoại mở đầu chương → người chơi được tự do đi lại: hiện tên chương ở góc dưới
    if (chapterOpening !== null) {
      setChapterOpening(null);
      showChapterTitle(chapterOpening);
    }
    if (lastNode === 'node_chapter_1_transition') {
      // An uống thuốc an thần, ngả lưng xuống giường → chìm vào giấc mộng → mở mắt ở Thị Trấn Hoàng Hôn
      setTransition('dream');
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
      applySanityClaims([]);
      setMode('OVERWORLD');
      saveGameProgress(100, 'start', 'OVERWORLD', [], 1, [], false, 'ROOM_314');
      return;
    }

    if (lastNode === 'ch3_crack_server') {
      // SECTOR_1705 bung mở → phòng cấp cứu sụp đổ vào trạm máy chủ → Màn 4
      setTransition('core');
      return;
    }

    if (lastNode === 'ch2_truth_confront' || lastNode === 'ch2_ending_stay') {
      // Lời cuối của Miên ở Màn 2 → chuyển cảnh "Mặt trời vỡ ra" → vào thẳng phòng cấp cứu Màn 3
      setTransition('sunbreak');
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
    saveGameProgress(sanity, activeNodeId, 'OVERWORLD', nextIds, chapter, inventoryIds, insertedDisk, subLocation);
  };

  // ==========================================
  // CÁC HÀM ĐIỀU HƯỚNG NHANH CHO DEV (SKIP CHƯƠNG)
  // ==========================================
  const jumpToChapter2 = useCallback((withAllClues = false) => {
    setTransition(null);
    setChapterOpening(null);
    setChapterTitle(null);
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
        ? 'DEV: MÀN 2 (ĐÃ KÍCH HOẠT 5/5 MANH MỐI • SẴN SÀNG GẶP MIÊN)'
        : 'DEV: CHUYỂN SANG MÀN 2 (BẾN AN YÊN - 0/5 MANH MỐI)'
    );
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  const jumpToChapter1 = useCallback(() => {
    setTransition(null);
    setChapterOpening(null);
    setChapterTitle(null);
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
    setDevToast('DEV: CHUYỂN VỀ MÀN 1 (PHÒNG 314)');
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  const jumpToChapter3 = useCallback((toOverworld = true, withAllClues = false) => {
    setTransition(null);
    setChapterOpening(null);
    setChapterTitle(null);
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
        ? 'DEV: MÀN 3 (ĐÃ MỞ KHÓA TẤT CẢ MANH MỐI BỆNH VIỆN • ĐỐI CHẤT MIÊN)'
        : 'DEV: CHUYỂN SANG MÀN 3 (PIXEL BLEED • XÂM THẤU BỆNH VIỆN)'
    );
  }, [insertedDisk, inventoryIds, saveGameProgress]);

  // Mỗi lần nhảy vào Màn 4 thì dựng lại trạm điều khiển từ đầu (đồng hồ, hồ sơ, lựa chọn)
  const [ch4RunId, setCh4RunId] = useState(0);
  // secretTest: Sanity 55% + cờ thư mục AURA + cờ tin nhắn mẹ → thử Ending S "Người lạ"
  // (mở tệp đầu −5 → 50%, đọc tin nhắn mẹ +10 → 60%, vẫn nằm trong khoảng 40–60%)
  const jumpToChapter4 = useCallback((secretTest = false) => {
    setTransition(null);
    setChapterOpening(null);
    setChapterTitle(null);
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
        ? 'DEV: MÀN 4 • THỬ ENDING S (SANITY 55% • ĐÃ ĐỌC ĐỒ ÁN AURA • ĐÃ NGHE TIN NHẮN MẸ)'
        : 'DEV: CHUYỂN SANG CHƯƠNG 4 (HỒ SƠ ĐÊM 17/05 • 3 KẾT CỤC)'
    );
  }, [applyStoryFlags, insertedDisk, inventoryIds, saveGameProgress]);

  // Khôi phục sau khi sốc điện tim cấp cứu (Sanity = 30%)
  const handleReviveFromCollapse = useCallback((newSanity: number) => {
    setSanity(newSanity);
    saveGameProgress(newSanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, insertedDisk, subLocation);
    setDevToast('BẠN ĐÃ ĐƯỢC CẤP CỨU HỒI TỈNH (SANITY = 30%)');
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
        applySanityClaims(parsed.sanityClaimedIds ?? []);
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

  // Esc trong hộp thoại gọi bản handleCloseVN mới nhất (listener không cần đăng ký lại mỗi lần render)
  const closeVNRef = useRef(handleCloseVN);
  useEffect(() => {
    closeVNRef.current = handleCloseVN;
  });

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
      if (transition || stageCutscene) return;
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

      if (e.key === 'Escape') {
        if (gameState === 'PLAYING') {
          // Nếu đang mở modal Settings thì đóng Settings trước
          if (isSettingsOpen) {
            setIsSettingsOpen(false);
            return;
          }
          // Pause Menu đang mở thì Esc chỉ đóng nó
          if (isPauseMenuOpen) {
            setIsPauseMenuOpen(false);
            return;
          }
          // Modal con (Túi đồ, màn hình máy tính, khung PIN, minigame manh mối) tự đóng bằng Esc của nó
          if (hasOpenUiLayer()) return;
          // Đang hội thoại: Esc đóng khung thoại (như nút [Đóng]), không đè Pause Menu lên
          if (mode === 'VN') {
            closeVNRef.current();
            return;
          }
          // Chỉ mở Pause Menu khi đang tự do đi lại, không còn popup nào
          setIsPauseMenuOpen(true);
        }
      }
    };

    // Pha capture: đọc trạng thái modal trước khi listener của modal kịp đóng nó trong cùng lần bấm
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [gameState, isSettingsOpen, isPauseMenuOpen, mode, chapter, interactedIds, jumpToChapter2, jumpToChapter1, jumpToChapter3, jumpToChapter4, transition, stageCutscene, showDevToolbar]);

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
      {/* Màn đen khi đi qua cửa phòng 314 ↔ hành lang */}
      <div
        aria-hidden
        className={`fixed inset-0 z-50 bg-black pointer-events-none transition-opacity duration-200 ease-in-out ${
          isDoorTransitioning ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {showContentWarning && (
        <ContentWarning onDone={() => setShowContentWarning(false)} onSkipGesture={initAudio} />
      )}

      {/* Lời Miên thì thầm khi người chơi quay lại tab */}
      {returnWhisper && gameState === 'PLAYING' && (
        <div
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 text-sm italic font-serif text-zinc-200 pointer-events-none animate-pulse"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
        >
          &ldquo;{returnWhisper}&rdquo;
        </div>
      )}

      {/* Toast thông báo phím tắt Dev */}
      {devToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-black/90 border-b border-zinc-700 text-zinc-200 font-mono text-[11px] tracking-[0.15em] uppercase whitespace-nowrap pointer-events-none animate-fade-in">
          {tr(devToast)}
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

      {/* Chuyển cảnh liền mạch giữa các màn (không có thẻ chương, không bắt bấm phím) */}
      {transition === 'dream' && (
        <div className="absolute inset-0 z-50">
          <DreamTransition volume={settings.masterVolume} onComplete={() => enterChapterOpening(2)} />
        </div>
      )}
      {transition === 'sunbreak' && (
        <div className="absolute inset-0 z-50">
          <SunBreakTransition volume={settings.masterVolume} onComplete={() => enterChapterOpening(3)} />
        </div>
      )}
      {transition === 'core' && (
        <div className="absolute inset-0 z-50">
          <CoreDescentTransition volume={settings.masterVolume} onComplete={enterChapter4} />
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
                setDevToast('BẠN ĐÃ MỞ KHÓA [TRUE ENDING: BÌNH MINH THẬT SỰ]');
              }}
            />
          ) : outroEnding === 'S' ? (
            <EndingSCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('BẠN ĐÃ MỞ KHÓA [SECRET ENDING: NGƯỜI LẠ]');
              }}
            />
          ) : outroEnding === 'M' ? (
            <QuietEnding
              lines={abandonedText.replace('{LEFT_AT}', abandonedAt).split('\n')}
              buttonLabel={tr('Khởi động lại')}
              tabTitle={tr(ABANDONED_TAB_TITLE)}
              onDone={handleStartNewGame}
            />
          ) : outroEnding === 'B' ? (
            <EndingBCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('BẠN ĐÃ KÍCH HOẠT [BAD ENDING: ĐỊA NGỤC NGỌT NGÀO]');
              }}
            />
          ) : (
            <EndingCCutscene
              volume={settings.masterVolume}
              onComplete={() => {
                setGameState('MENU');
                setDevToast('BẠN ĐÃ ĐẾN [NEUTRAL ENDING: ĐỨT ĐOẠN KÝ ỨC (MẤT KẾT NỐI VĨNH VIỄN)]');
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
            mode === 'OVERWORLD'
              ? 'opacity-100 pointer-events-auto'
              : // Đang hội thoại: màn chơi vẫn hiện mờ phía sau lớp phủ của khung VN (phòng 314, bến hoàng hôn,
                // phòng cấp cứu...) thay vì màn đen trống; chỉ ẩn khi đang chiếu chuyển cảnh
                !transition
                ? 'opacity-100 pointer-events-none'
                : 'opacity-0 pointer-events-none'
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
              active={mode === 'OVERWORLD' && !isPauseMenuOpen && !isSettingsOpen && !transition}
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
              active={mode === 'OVERWORLD' && !isPauseMenuOpen && !isSettingsOpen && !transition}
            />
          )}
        </div>

        <ControlsTutorial open={showTutorial && gameState === 'PLAYING' && mode === 'OVERWORLD'} onClose={handleCloseTutorial} />

        {/* ---- GIAI ĐOẠN 2: HỘP THOẠI VISUAL NOVEL ---- */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            // Đang chiếu chuyển cảnh thì gỡ khung thoại cũ ra (không nhận phím Space/Enter lặp lại lời cuối)
            // Lớp phủ tối mờ + làm nhoè nhẹ màn chơi phía sau (không phủ đen 100%)
            mode === 'VN' && !transition ? 'opacity-100 pointer-events-auto z-20 bg-black/60 backdrop-blur-sm' : 'opacity-0 pointer-events-none'
          }`}
        >
          {mode === 'VN' && !transition && (
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
              sanityClaimedIds={sanityClaimedIds}
              onClaimSanity={handleClaimSanity}
              onChoice={handleVNChoice}
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
                ? 'bg-fuchsia-900/90 border-fuchsia-400 text-fuchsia-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-pink-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('[K] Màn 2')}
          </button>
          <button
            onClick={() => jumpToChapter2(true)}
            title={tr('Mở khóa 5/5 manh mối Màn 2 để kiểm tra bầu trời pha 3 và gặp Miên')}
            className={`px-2.5 py-1 rounded border font-semibold transition-all cursor-pointer ${
              chapter === 2 &&
              interactedIds.filter(id => ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box'].includes(id)).length >= 5
                ? 'bg-amber-950 border-amber-400 text-amber-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-amber-400 text-amber-400'
            }`}
          >
            {tr('Đủ 5 Manh Mối')}
          </button>
          <button
            onClick={() => jumpToChapter3(true)}
            title={tr('Nhấn phím [L] để nhảy thẳng sang Màn 3 (Pixel Bleed Stage)')}
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 3 && (mode === 'OVERWORLD' || activeNodeId.startsWith('ch3'))
                ? 'bg-rose-900/90 border-rose-400 text-rose-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('[L] Màn 3')}
          </button>
          <button
            onClick={() => jumpToChapter4(chapter === 4 && gameState === 'PLAYING')}
            title={tr('Nhấn phím [M] để nhảy thẳng sang Chương 4; bấm lần nữa để thử Ending S')}
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 4
                ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-emerald-500 text-zinc-300 hover:text-white'
            }`}
          >
            {tr('[M] Màn 4')}
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
              setDevToast('DEV: KÍCH HOẠT NGUY KỊCH TÂM TRÍ (SANITY = 0%)');
            }}
            title={tr('Thử nghiệm khẩn cấp: Đưa Sanity về 0% để kích hoạt Máy khử rung tim (Defibrillator QTE)')}
            className="px-2.5 py-1 rounded border border-red-700/80 bg-red-950/70 hover:bg-red-900 text-red-300 hover:text-red-100 font-semibold transition-all cursor-pointer"
          >
            Sanity 0%
          </button>
        </div>
        )}
      </div>

      {/* =========================================================
          3. PAUSE MENU TRONG TRÒ CHƠI
         ========================================================= */}
      {isPauseMenuOpen && gameState === 'PLAYING' && (
        <PauseMenu
          active={!isSettingsOpen}
          onResume={() => setIsPauseMenuOpen(false)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onMainMenu={() => {
            saveGameProgress(sanity, activeNodeId, mode);
            setIsPauseMenuOpen(false);
            setGameState('MENU');
          }}
        />
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
          5. PHỤ ĐỀ TÊN CHƯƠNG: một dòng nhỏ góc dưới trái, tự mờ dần, không chặn điều khiển
         ========================================================= */}
      {chapterTitle && gameState === 'PLAYING' && (
        <div
          key={chapterTitle.id}
          onAnimationEnd={() => setChapterTitle(null)}
          className="pointer-events-none fixed left-6 bottom-16 z-40 font-serif italic text-sm sm:text-base tracking-wide text-zinc-200 select-none"
          style={{ animation: `chapter-title ${CHAPTER_TITLE_MS}ms ease-in-out forwards`, textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}
        >
          <style>{`@keyframes chapter-title { 0% { opacity: 0; transform: translateY(4px) } 16% { opacity: 1; transform: none } 76% { opacity: 1 } 100% { opacity: 0 } }`}</style>
          {tr(CHAPTER_TITLES[chapterTitle.chapter])}
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
