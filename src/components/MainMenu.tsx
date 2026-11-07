"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { MenuOption } from './MenuOption';


interface MainMenuProps {
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onOpenSettings: () => void;
  onOpenAchievements?: () => void;
  unlockedEndingsCount?: number;
  totalEndingsCount?: number;
  hasSaveData: boolean;
}

type MenuId = 'new_game' | 'continue_game' | 'achievements' | 'settings' | 'shutdown';

interface MenuItem {
  id: MenuId;
  label: string;
  disabled?: boolean;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartNewGame,
  onContinueGame,
  onOpenSettings,
  onOpenAchievements,
  unlockedEndingsCount = 0,
  totalEndingsCount = 5,
  hasSaveData,
}) => {
  const { t } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [shutdownTriggered, setShutdownTriggered] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Rời màn / đóng khung thì đóng hẳn AudioContext riêng: không còn âm nào ngân sang cảnh sau
  useEffect(() => {
    const ctxRef = audioCtxRef;
    return () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // Khởi tạo & khôi phục AudioContext an toàn
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

  // 1. Tiếng click / beep tĩnh điện 8-bit khi hover hoặc di chuyển phím (Terminal Static Blip)
  const playTerminalBlip = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Xung vuông 8-bit trượt tần số ngắn
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.022);

      gain.gain.setValueAtTime(0.035, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.022);

      // Xung nhiễu tĩnh điện nhỏ (White noise burst) tạo cảm giác rơ-le / CRT cathode
      const bufferSize = Math.floor(ctx.sampleRate * 0.012); // 12ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.02, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
    } catch {
      // Bỏ qua lỗi audio policy
    }
  }, [getAudioContext]);

  // 2. Tiếng xác nhận chọn nút (Confirm Retro Chime)
  const playTerminalConfirm = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      [587, 880].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      });
    } catch {
      // Bỏ qua
    }
  }, [getAudioContext]);

  // 3. Tiếng từ chối / nút bị khoá (Deny Buzz)
  const playTerminalDeny = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {
      // Bỏ qua
    }
  }, [getAudioContext]);

  // Danh sách nút menu (chỉ dữ liệu hiển thị; hành động nằm ở activate)
  const menuItems = useMemo<MenuItem[]>(() => [
    { id: 'new_game', label: t.menu.newGame },
    { id: 'continue_game', label: t.menu.continue, disabled: !hasSaveData },
    { id: 'achievements', label: t.menu.achievements(unlockedEndingsCount, totalEndingsCount) },
    { id: 'settings', label: t.menu.settings },
    { id: 'shutdown', label: t.menu.shutdown },
  ], [t, hasSaveData, unlockedEndingsCount, totalEndingsCount]);

  // Chạy lựa chọn: mục bị khoá (chưa có điểm lưu) chỉ kêu tiếng từ chối
  const activate = useCallback((item: MenuItem | undefined) => {
    if (!item || item.disabled) {
      playTerminalDeny();
      return;
    }
    switch (item.id) {
      case 'new_game':
        playTerminalConfirm();
        onStartNewGame();
        break;
      case 'continue_game':
        playTerminalConfirm();
        onContinueGame();
        break;
      case 'achievements':
        playTerminalConfirm();
        onOpenAchievements?.();
        break;
      case 'settings':
        playTerminalConfirm();
        onOpenSettings();
        break;
      case 'shutdown':
        playTerminalDeny();
        setShutdownTriggered(true);
        break;
    }
  }, [onStartNewGame, onContinueGame, onOpenAchievements, onOpenSettings, playTerminalConfirm, playTerminalDeny]);

  // Xử lý phím điều hướng W/S, Mũi tên và Enter
  useEffect(() => {
    if (shutdownTriggered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === 'w' || key === 'arrowup') {
        e.preventDefault();
        playTerminalBlip();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
      } else if (key === 's' || key === 'arrowdown') {
        e.preventDefault();
        playTerminalBlip();
        setSelectedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
      } else if (key === 'enter' || key === ' ') {
        e.preventDefault();
        activate(menuItems[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, menuItems, shutdownTriggered, playTerminalBlip, activate]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 select-none font-mono text-zinc-300 overflow-hidden bg-black">
      {/* Viền tối quanh màn hình, không lưới, không khung */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(24,24,27,0.35) 0%, transparent 45%, rgba(0,0,0,0.9) 100%)' }}
      />

      <div className="z-10 flex flex-col items-center w-full max-w-md">
        {/* Tiêu đề */}
        <h1 className="text-5xl sm:text-7xl font-bold tracking-[0.3em] pl-[0.3em] text-zinc-100">
          ECHOES
        </h1>
        <div className="mt-3 text-xs sm:text-sm tracking-[0.5em] pl-[0.5em] text-red-400/80">03:14 AM</div>

        {/* Danh sách lựa chọn: chữ căn giữa, mục đang chọn sáng lên kèm vạch đỏ mảnh bên dưới */}
        <nav className="mt-14 sm:mt-16 flex flex-col items-center gap-2">
          {menuItems.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <MenuOption
                key={item.id}
                label={item.label}
                selected={isSelected}
                disabled={item.disabled}
                onHover={() => {
                  if (selectedIndex !== idx) {
                    playTerminalBlip();
                    setSelectedIndex(idx);
                  }
                }}
                onClick={() => activate(item)}
              />
            );
          })}
        </nav>

        {/* Gợi ý phím */}
        <div className="mt-14 text-[10px] sm:text-[11px] text-zinc-600 tracking-widest">
          W / S {t.menu.hintSelect} <span className="mx-2 text-zinc-700">·</span> ENTER {t.menu.hintConfirm}
        </div>
      </div>

      {/* Shutdown Modal Effect khi người dùng bấm Thoát trò chơi */}
      {shutdownTriggered && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center animate-fade-in font-mono">
          <h2 className="text-xl sm:text-2xl text-zinc-100 tracking-[0.3em] uppercase mb-3">
            {t.menu.goodbyeTitle}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md leading-relaxed mb-6">
            {t.menu.goodbyeText}
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs tracking-[0.25em] uppercase text-zinc-300 hover:text-white transition-colors"
            >
              {t.menu.restart}
            </button>
            <button
              onClick={() => setShutdownTriggered(false)}
              className="px-4 py-2 text-xs tracking-[0.25em] uppercase text-zinc-500 hover:text-white transition-colors"
            >
              {t.menu.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
