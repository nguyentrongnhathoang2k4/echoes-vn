"use client";
import React, { useEffect } from 'react';

export interface GameSettings {
  masterVolume: number;   // 0 - 100 (Tổng)
  bgmVolume: number;      // 0 - 100 (Nhạc nền BGM)
  ambientVolume: number;  // 0 - 100 (Môi trường & SFX)
  textSpeed: number;      // 15 - 80 ms
  crtEnabled: boolean;    // true | false
}

interface SettingsModalProps {
  isOpen: boolean;
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  // Lắng nghe phím ESC để đóng modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none font-mono"
      onClick={onClose}
    >
      {/* Bảng điều khiển Modal */}
      <div
        className="relative w-full max-w-lg bg-zinc-950/95 border-2 border-cyan-500/80 p-6 shadow-[0_0_35px_rgba(6,182,212,0.35)] rounded text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Retro Terminal */}
        <div className="flex justify-between items-center border-b border-cyan-800/80 pb-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-cyan-400 animate-pulse rounded-full" />
            <h2 className="text-sm sm:text-base font-bold tracking-wider text-cyan-300 uppercase">
              // CÀI ĐẶT TRÒ CHƠI [SETTINGS]
            </h2>
          </div>
          <span className="text-[10px] text-zinc-500 tracking-widest uppercase">
            SETTINGS
          </span>
        </div>

        {/* Danh sách thiết lập */}
        <div className="space-y-5 text-xs sm:text-sm max-h-[68vh] overflow-y-auto pr-1">
          {/* 1. Master Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="volume-slider" className="text-zinc-200 font-semibold flex items-center gap-2">
                <span>🔊 ÂM LƯỢNG TỔNG (MASTER)</span>
              </label>
              <span className="text-cyan-400 font-bold">{settings.masterVolume}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 text-xs">0%</span>
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.masterVolume}
                onChange={(e) => onUpdateSettings({ masterVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-zinc-600 text-xs">100%</span>
            </div>
            <p className="text-[10px] text-zinc-500 italic">
              * Âm lượng tổng thể cho toàn bộ trò chơi
            </p>
          </div>

          {/* 2. BGM Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="bgm-slider" className="text-pink-300 font-semibold flex items-center gap-2">
                <span>🎵 NHẠC NỀN (BGM)</span>
              </label>
              <span className="text-pink-400 font-bold">{settings.bgmVolume ?? 85}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 text-xs">0%</span>
              <input
                id="bgm-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.bgmVolume ?? 85}
                onChange={(e) => onUpdateSettings({ bgmVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-400"
              />
              <span className="text-zinc-600 text-xs">100%</span>
            </div>
            <p className="text-[10px] text-zinc-500 italic">
              * Điều chỉnh độ lớn các bản nhạc Piano hoài niệm, Valse hoàng hôn & Ambient Drones
            </p>
          </div>

          {/* 3. Ambient & SFX Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="ambient-slider" className="text-teal-300 font-semibold flex items-center gap-2">
                <span>🌧️ MÔI TRƯỜNG & HIỆU ỨNG (AMBIENT / SFX)</span>
              </label>
              <span className="text-teal-400 font-bold">{settings.ambientVolume ?? 40}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 text-xs">0%</span>
              <input
                id="ambient-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.ambientVolume ?? 40}
                onChange={(e) => onUpdateSettings({ ambientVolume: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
              <span className="text-zinc-600 text-xs">100%</span>
            </div>
            <p className="text-[10px] text-zinc-500 italic">
              * Điều chỉnh tiếng mưa rơi, quạt máy tính, tiếng nước sông và hiệu ứng phím
            </p>
          </div>

          {/* 2. Text Speed */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="speed-slider" className="text-zinc-300 font-semibold flex items-center gap-2">
                <span>⌨️ TỐC ĐỘ GÕ CHỮ (TYPEWRITER)</span>
              </label>
              <span className="text-cyan-400 font-bold">{settings.textSpeed} ms</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 text-xs">Nhanh (15ms)</span>
              <input
                id="speed-slider"
                type="range"
                min="15"
                max="80"
                step="5"
                value={settings.textSpeed}
                onChange={(e) => onUpdateSettings({ textSpeed: Number(e.target.value) })}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-zinc-600 text-xs">Chậm (80ms)</span>
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              * Tốc độ hiển thị từng ký tự trong hộp thoại Visual Novel
            </p>
          </div>

          {/* 3. CRT Screen Filter Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800 rounded">
            <div>
              <div className="text-zinc-200 font-semibold flex items-center gap-2">
                <span>📺 BỘ LỌC MÀN HÌNH CRT</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Đường quét ngang (Scanlines) & rung giật ánh sáng CRT 1998
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ crtEnabled: !settings.crtEnabled })}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-all duration-200 border ${
                settings.crtEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {settings.crtEnabled ? '[BẬT]' : '[TẮT]'}
            </button>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-[10px] text-zinc-600">
            [ESC] ĐÓNG NHANH
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-wider text-xs rounded transition-all shadow-[0_0_15px_rgba(6,182,212,0.5)] active:scale-95"
          >
            LƯU & ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
};
