"use client";
import React, { useEffect } from 'react';
import { useLanguage, LANGUAGES } from '../context/LanguageContext';

export interface GameSettings {
  masterVolume: number;   // 0 - 100 (Tổng)
  bgmVolume: number;      // 0 - 100 (Nhạc nền BGM)
  ambientVolume: number;  // 0 - 100 (Môi trường & SFX)
  textSpeed: number;      // 15 - 80 ms
  crtEnabled: boolean;    // true | false
  parallaxEnabled: boolean; // Khung hình nghiêng nhẹ theo con trỏ chuột
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
  const { t, lang, setLang } = useLanguage();
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
              {t.settings.title}
            </h2>
          </div>
          <span className="text-[10px] text-zinc-500 tracking-widest uppercase">
            {t.settings.tag}
          </span>
        </div>

        {/* Danh sách thiết lập */}
        <div className="space-y-5 text-xs sm:text-sm max-h-[68vh] overflow-y-auto pr-1">
          {/* 0. Ngôn ngữ / Language */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
            <div className="text-zinc-200 font-semibold">{t.settings.language}</div>
            <p className="text-[11px] text-zinc-500 mt-0.5">{t.settings.languageHint}</p>
            <div className="mt-2 flex gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded transition-all duration-200 border ${
                    lang === l.code
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* 1. Master Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="volume-slider" className="text-zinc-200 font-semibold flex items-center gap-2">
                <span>{t.settings.master}</span>
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
              {t.settings.masterHint}
            </p>
          </div>

          {/* 2. BGM Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="bgm-slider" className="text-pink-300 font-semibold flex items-center gap-2">
                <span>{t.settings.bgm}</span>
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
              {t.settings.bgmHint}
            </p>
          </div>

          {/* 3. Ambient & SFX Volume */}
          <div className="space-y-1.5 p-2.5 bg-zinc-900/40 rounded border border-zinc-800/60">
            <div className="flex justify-between items-center">
              <label htmlFor="ambient-slider" className="text-teal-300 font-semibold flex items-center gap-2">
                <span>{t.settings.ambient}</span>
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
              {t.settings.ambientHint}
            </p>
          </div>

          {/* 2. Text Speed */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="speed-slider" className="text-zinc-300 font-semibold flex items-center gap-2">
                <span>{t.settings.textSpeed}</span>
              </label>
              <span className="text-cyan-400 font-bold">{settings.textSpeed} ms</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-zinc-600 text-xs">{t.settings.textSpeedFast}</span>
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
              <span className="text-zinc-600 text-xs">{t.settings.textSpeedSlow}</span>
            </div>
            <p className="text-[11px] text-zinc-500 italic">
              {t.settings.textSpeedHint}
            </p>
          </div>

          {/* 3. CRT Screen Filter Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800 rounded">
            <div>
              <div className="text-zinc-200 font-semibold flex items-center gap-2">
                <span>{t.settings.crt}</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {t.settings.crtHint}
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
              {settings.crtEnabled ? t.common.on : t.common.off}
            </button>
          </div>

          {/* 4. Mouse Parallax Toggle */}
          <div className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800 rounded">
            <div>
              <div className="text-zinc-200 font-semibold flex items-center gap-2">
                <span>{t.settings.parallax}</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {t.settings.parallaxHint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ parallaxEnabled: !settings.parallaxEnabled })}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-all duration-200 border ${
                settings.parallaxEnabled
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {settings.parallaxEnabled ? t.common.on : t.common.off}
            </button>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-[10px] text-zinc-600">
            {t.settings.escHint}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-wider text-xs rounded transition-all shadow-[0_0_15px_rgba(6,182,212,0.5)] active:scale-95"
          >
            {t.settings.saveClose}
          </button>
        </div>
      </div>
    </div>
  );
};
