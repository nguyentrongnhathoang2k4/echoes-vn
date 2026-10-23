"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { OverworldStage } from '../src/components/OverworldStage';
import { HallwayStage } from '../src/components/HallwayStage';
import { SunsetStage } from '../src/components/SunsetStage';
import { PixelBleedStage } from '../src/components/PixelBleedStage';
import { VNStage } from '../src/components/VNStage';
import { MainMenu } from '../src/components/MainMenu';
import { SettingsModal, GameSettings } from '../src/components/SettingsModal';
import { IntroCutscene } from '../src/components/IntroCutscene';
import { SynapticCollapseOverlay } from '../src/components/SynapticCollapseOverlay';
import { audioEngine, AudioScene } from '../src/services/audioEngine';

type GameState = 'MENU' | 'INTRO' | 'PLAYING';
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
};

const STORAGE_KEY_SAVE = 'echoes_0314_save_data';
const STORAGE_KEY_SETTINGS = 'echoes_0314_settings';

export default function Home() {
  const [gameState, setGameState] = useState<GameState>('MENU');
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
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState<boolean>(false);
  const [hasSaveData, setHasSaveData] = useState<boolean>(false);
  const [devToast, setDevToast] = useState<string | null>(null);

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
  useEffect(() => {
    const handleFirstGesture = () => {
      audioEngine.init();
      audioEngine.setMasterVolume(settings.masterVolume);
      if (typeof settings.bgmVolume === 'number') audioEngine.setBgmVolume(settings.bgmVolume);
      if (typeof settings.ambientVolume === 'number') audioEngine.setAmbientVolume(settings.ambientVolume);
    };
    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, [settings.masterVolume, settings.bgmVolume, settings.ambientVolume]);

  // 2. Tự động đồng bộ Scene Âm thanh (BGM & Ambient) với trạng thái game
  useEffect(() => {
    let targetScene: AudioScene = 'MENU';
    if (gameState === 'MENU') {
      targetScene = 'MENU';
    } else if (gameState === 'INTRO') {
      targetScene = 'INTRO';
    } else if (gameState === 'PLAYING') {
      if (chapter === 1) {
        targetScene = subLocation === 'HALLWAY' ? 'HALLWAY' : 'ROOM_314';
      } else if (chapter === 2) {
        targetScene = 'SUNSET';
      } else if (chapter === 3) {
        targetScene = 'PIXEL_BLEED';
      }
    }
    audioEngine.setScene(targetScene);
  }, [gameState, chapter, subLocation]);

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

  // Chuyển sang Chương 2 / Chương 3 sau màn Card tiêu đề điện ảnh
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
      // Bật Card chuyển chương điện ảnh sang Chương 2!
      setChapterCard({
        chapterNum: 'CHƯƠNG II',
        title: 'THỊ TRẤN HOÀNG HÔN',
        subtitle: 'THE HAVEN • VÙNG AN TOÀN TRONG KÝ ỨC',
        quote: '„Căn phòng này ngột ngạt quá rồi... Hãy để em đưa anh đến nơi chúng ta từng hẹn ước...‟',
      });
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

    if (lastNode === 'end_chapter_2') {
      // Bật Card chuyển chương điện ảnh sang Chương 3!
      setChapterCard({
        chapterNum: 'CHƯƠNG III',
        title: 'SỰ XÂM THẤU CỦA ĐIỂM ẢNH',
        subtitle: 'PIXEL BLEED • KHI THỰC TẠI RÒ RỈ',
        quote: '„Cơn mơ đẹp nhất đã vỡ vụn... Những mảnh vỡ thực tại bắt đầu rỉ máu qua từng vệt điểm ảnh...‟',
      });
      return;
    }

    if (lastNode === 'end_game_true' || lastNode === 'end_game_bad' || lastNode === 'end_game_neutral') {
      setGameState('MENU');
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
      setDevToast(
        lastNode === 'end_game_true'
          ? '🌅 BẠN ĐÃ MỞ KHÓA [TRUE ENDING: BÌNH MINH THẬT SỰ]'
          : lastNode === 'end_game_bad'
          ? '🩸 BẠN ĐÃ KÍCH HOẠT [BAD ENDING: ĐỊA NGỤC NGỌT NGÀO]'
          : '⬛ BẠN ĐÃ ĐẾN [NEUTRAL ENDING: ĐỨT ĐOẠN KÝ ỨC (MẤT KẾT NỐI VĨNH VIỄN)]'
      );
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
        : '⚡ DEV: CHUYỂN SANG MÀN 2 (BẾN BÌNH AN - 0/5 MANH MỐI)'
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

  const jumpToChapter4 = useCallback(() => {
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    setChapterCard(null);
    setGameState('PLAYING');
    setChapter(3);
    setSubLocation('ROOM_314');
    setMode('VN');
    setActiveNodeId('ch4_start');
    setIsPauseMenuOpen(false);
    setIsSettingsOpen(false);
    setSanity(75);
    setInteractedIds([]);
    saveGameProgress(75, 'ch4_start', 'VN', [], 3, inventoryIds, insertedDisk, 'ROOM_314');
    setDevToast('⚡ DEV: CHUYỂN SANG CHƯƠNG 4 (HỒ SƠ ĐÊM 17/05 • 3 KẾT CỤC)');
  }, [insertedDisk, inventoryIds, saveGameProgress]);

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

  // Phá vỡ bức tường thứ 4 (4th-Wall Breaking): Thay đổi tiêu đề Tab khi người chơi rời tab
  useEffect(() => {
    const originalTitle = 'Echoes: 03:14 AM - Visual Novel';
    const creepyTitles = [
      '💔 Sao anh lại bỏ em lại một mình?...',
      '⚠️ ĐỪNG RỜI MẮT KHỎI MÀN HÌNH...',
      '💔 Quay lại đây với em đi, An...',
      '🩸 BỆNH NHÂN TRẦN HOÀNG AN... TỈNH LẠI ĐI...',
      '👁️ EM VẪN ĐANG NHÌN ANH ĐẤY...',
    ];

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (chapter === 2) {
          document.title = '💔 Sao anh lại bỏ em lại một mình ở bến sông?...';
        } else if (chapter === 3) {
          document.title = '🩸 BỆNH NHÂN TRẦN HOÀNG AN... TỈNH LẠI ĐI...';
        } else {
          const randomIndex = Math.floor(Math.random() * creepyTitles.length);
          document.title = creepyTitles[randomIndex];
        }
      } else {
        document.title = originalTitle;
        if (gameState === 'PLAYING') {
          setDevToast('👁️ BẠN VỪA QUAY LẠI CĂN PHÒNG TRỌ...');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.title = originalTitle;
    };
  }, [chapter, gameState]);

  // Lắng nghe phím ESC để mở Pause Menu trong lúc đang chơi, phím K/L/M để Skip chương & phím bỏ qua Chapter Card
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Phím tắt K dành cho dev để nhảy Màn 2
      if (e.key.toLowerCase() === 'k') {
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
      if (e.key.toLowerCase() === 'l') {
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

      // Phím tắt M dành cho dev để nhảy thẳng Màn 4 (Terminal & 3 Endings)
      if (e.key.toLowerCase() === 'm') {
        jumpToChapter4();
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
  }, [gameState, isSettingsOpen, chapterCard, handleProceedChapter, chapter, interactedIds, jumpToChapter2, jumpToChapter1, jumpToChapter3, jumpToChapter4]);

  return (
    <main
      className={`relative w-screen h-screen overflow-hidden bg-black select-none ${
        settings.crtEnabled ? 'crt-overlay crt-flicker' : ''
      } ${sanity <= 25 && gameState === 'PLAYING' ? 'vignette-low-sanity' : ''}`}
    >
      {/* Toast thông báo phím tắt Dev */}
      {devToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-400 text-black font-mono font-bold text-xs rounded-full shadow-[0_0_25px_rgba(251,191,36,0.9)] border-2 border-white animate-bounce flex items-center gap-2 pointer-events-none">
          <span className="text-sm">⚡</span>
          <span>{devToast}</span>
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
          {chapter === 1 ? (
            subLocation === 'HALLWAY' ? (
              <HallwayStage
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
                onInsertDisk={() => {
                  setInsertedDisk(true);
                  saveGameProgress(sanity, activeNodeId, mode, interactedIds, chapter, inventoryIds, true, subLocation);
                }}
                volume={settings.masterVolume}
              />
            )
          ) : chapter === 2 ? (
            <SunsetStage
              characterSprite="/assets/an_spritesheet.png"
              sanity={sanity}
              setSanity={setSanity}
              onTrigger={handleTrigger}
              interactedIds={interactedIds}
              onMarkInteracted={handleMarkInteracted}
              volume={settings.masterVolume}
            />
          ) : (
            <PixelBleedStage
              characterSprite="/assets/an_spritesheet.png"
              sanity={sanity}
              setSanity={setSanity}
              onTrigger={handleTrigger}
              interactedIds={interactedIds}
              onMarkInteracted={handleMarkInteracted}
              volume={settings.masterVolume}
            />
          )}
        </div>

        {/* ---- GIAI ĐOẠN 2: HỘP THOẠI VISUAL NOVEL ---- */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            mode === 'VN' ? 'opacity-100 pointer-events-auto z-20' : 'opacity-0 pointer-events-none'
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
          [ESC] TẠM DỪNG
        </button>

        {/* Dev Skip Toolbar (Dành cho Dev test nhanh các màn) */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 font-mono text-[11px] select-none">
          <button
            onClick={() => jumpToChapter2(false)}
            title="Nhấn phím [K] để nhảy thẳng sang Màn 2 (0/5 manh mối)"
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 2 && interactedIds.length < 5
                ? 'bg-fuchsia-900/90 border-fuchsia-400 text-fuchsia-200 shadow-[0_0_12px_rgba(217,70,239,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-pink-500 text-zinc-300 hover:text-white'
            }`}
          >
            ⚡ [K] Màn 2
          </button>
          <button
            onClick={() => jumpToChapter2(true)}
            title="Mở khóa 5/5 manh mối Màn 2 để kiểm tra bầu trời pha 3 và gặp Miên"
            className={`px-2.5 py-1 rounded border font-semibold transition-all cursor-pointer ${
              chapter === 2 &&
              interactedIds.filter(id => ['ch2_river', 'ch2_pigeon', 'ch2_coffee', 'ch2_bench', 'ch2_music_box'].includes(id)).length >= 5
                ? 'bg-amber-950 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-amber-400 text-amber-400'
            }`}
          >
            ✦ Đủ 5 Manh Mối
          </button>
          <button
            onClick={() => jumpToChapter3(true)}
            title="Nhấn phím [L] để nhảy thẳng sang Màn 3 (Pixel Bleed Stage)"
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 3 && (mode === 'OVERWORLD' || activeNodeId.startsWith('ch3'))
                ? 'bg-rose-900/90 border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-white'
            }`}
          >
            🩸 [L] Màn 3
          </button>
          <button
            onClick={jumpToChapter4}
            title="Nhấn phím [M] để nhảy thẳng sang Chương 4 (Hồi Kết & 3 Kết Cục)"
            className={`px-2.5 py-1 rounded border font-semibold shadow-md transition-all cursor-pointer ${
              chapter === 3 && activeNodeId.startsWith('ch4')
                ? 'bg-emerald-900/90 border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-emerald-500 text-zinc-300 hover:text-white'
            }`}
          >
            💻 [M] Màn 4
          </button>
          <button
            onClick={jumpToChapter1}
            title="Quay về Màn 1 (Phòng 314)"
            className={`px-2.5 py-1 rounded border font-semibold transition-all cursor-pointer ${
              chapter === 1
                ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                : 'bg-black/75 hover:bg-zinc-800 border-zinc-700 hover:border-cyan-400 text-zinc-400 hover:text-cyan-300'
            }`}
          >
            ↩ Màn 1
          </button>
          <button
            onClick={() => {
              setSanity(0);
              setDevToast('⚡ DEV: KÍCH HOẠT NGUY KỊCH TÂM TRÍ (SANITY = 0%)');
            }}
            title="Thử nghiệm khẩn cấp: Đưa Sanity về 0% để kích hoạt Máy khử rung tim (Defibrillator QTE)"
            className="px-2.5 py-1 rounded border border-red-700/80 bg-red-950/70 hover:bg-red-900 text-red-300 hover:text-red-100 font-semibold transition-all cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.4)]"
          >
            ⚡ Sanity 0%
          </button>
        </div>
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
              // TẠM DỪNG TRÒ CHƠI [PAUSED]
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setIsPauseMenuOpen(false)}
                className="w-full py-2.5 px-4 bg-cyan-950/50 hover:bg-cyan-900/70 border border-cyan-600/80 text-cyan-200 text-xs font-bold rounded tracking-wider transition-all"
              >
                TIẾP TỤC TRẢI NGHIỆM
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold rounded tracking-wider transition-all"
              >
                CÀI ĐẶT TRÒ CHƠI
              </button>

              <button
                onClick={() => {
                  saveGameProgress(sanity, activeNodeId, mode);
                  setIsPauseMenuOpen(false);
                  setGameState('MENU');
                }}
                className="w-full py-2.5 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-700/80 text-red-300 text-xs font-bold rounded tracking-wider transition-all"
              >
                LƯU & VỀ MENU CHÍNH
              </button>
            </div>

            <div className="mt-4 text-[10px] text-zinc-500">
              * Tiến trình trò chơi được tự động lưu liên tục
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
              {chapterCard.chapterNum}
            </div>

            <h1 className="text-2xl md:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-purple-200 to-amber-200 drop-shadow-[0_0_25px_rgba(216,180,254,0.6)]">
              {chapterCard.title}
            </h1>

            <div className="text-xs md:text-sm font-mono tracking-wider text-purple-300/80">
              [ {chapterCard.subtitle} ]
            </div>

            <div className="w-36 h-[1px] bg-gradient-to-r from-transparent via-pink-400/60 to-transparent mx-auto my-5" />

            <p className="text-sm md:text-base italic font-serif text-zinc-300 max-w-lg mx-auto leading-relaxed">
              {chapterCard.quote}
            </p>

            <div className="pt-8 text-[11px] md:text-xs font-mono text-zinc-500 tracking-widest uppercase animate-pulse">
              [ NHẤN PHÍM BẤT KỲ HOẶC CHẠM ĐỂ BẮT ĐẦU ]
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
