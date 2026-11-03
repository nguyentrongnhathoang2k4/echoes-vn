"use client";
import React, { useEffect } from 'react';
import { useLanguage, LANGUAGES } from '../context/LanguageContext';
import { MenuOption } from './MenuOption';

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

  // Thanh trượt âm lượng / tốc độ: nhãn trái, giá trị phải, chú thích mờ bên dưới
  const slider = (
    id: string,
    label: string,
    value: number,
    display: string,
    min: number,
    max: number,
    hint: string,
    onChange: (v: number) => void,
    ends?: [string, string],
  ) => (
    <div className="py-3 border-b border-zinc-900">
      <div className="flex justify-between items-baseline gap-4">
        <label htmlFor={id} className="text-xs tracking-[0.2em] uppercase text-zinc-300">
          {label}
        </label>
        <span className="text-xs text-zinc-400 tabular-nums">{display}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {ends && <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{ends[0]}</span>}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step="5"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 bg-zinc-800 rounded-none appearance-auto cursor-pointer accent-zinc-200"
        />
        {ends && <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{ends[1]}</span>}
      </div>
      <p className="mt-1.5 text-[10px] text-zinc-600">{hint}</p>
    </div>
  );

  // Công tắc bật / tắt: hai lựa chọn chữ như menu chính
  const toggle = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <div className="py-3 border-b border-zinc-900 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs tracking-[0.2em] uppercase text-zinc-300">{label}</div>
        <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>
      </div>
      <div className="flex shrink-0">
        <MenuOption size="sm" label={t.common.on} selected={value} onClick={() => onChange(true)} />
        <MenuOption size="sm" label={t.common.off} selected={!value} onClick={() => onChange(false)} />
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 select-none font-mono"
      onClick={onClose}
    >
      <div className="relative w-full max-w-md text-zinc-200" onClick={(e) => e.stopPropagation()}>
        {/* Tiêu đề */}
        <h2 className="text-center text-lg sm:text-xl tracking-[0.3em] pl-[0.3em] uppercase text-zinc-100">
          {t.settings.title}
        </h2>

        {/* Danh sách thiết lập */}
        <div className="mt-6 max-h-[64vh] overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]">
          {/* Ngôn ngữ / Language */}
          <div className="py-3 border-b border-zinc-900 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs tracking-[0.2em] uppercase text-zinc-300">{t.settings.language}</div>
              <p className="mt-1 text-[10px] text-zinc-600">{t.settings.languageHint}</p>
            </div>
            <div className="flex shrink-0">
              {LANGUAGES.map((l) => (
                <MenuOption key={l.code} size="sm" label={l.label} selected={lang === l.code} onClick={() => setLang(l.code)} />
              ))}
            </div>
          </div>

          {slider('volume-slider', t.settings.master, settings.masterVolume, `${settings.masterVolume}%`, 0, 100,
            t.settings.masterHint, (v) => onUpdateSettings({ masterVolume: v }))}
          {slider('bgm-slider', t.settings.bgm, settings.bgmVolume ?? 85, `${settings.bgmVolume ?? 85}%`, 0, 100,
            t.settings.bgmHint, (v) => onUpdateSettings({ bgmVolume: v }))}
          {slider('ambient-slider', t.settings.ambient, settings.ambientVolume ?? 40, `${settings.ambientVolume ?? 40}%`, 0, 100,
            t.settings.ambientHint, (v) => onUpdateSettings({ ambientVolume: v }))}
          {slider('speed-slider', t.settings.textSpeed, settings.textSpeed, `${settings.textSpeed} ms`, 15, 80,
            t.settings.textSpeedHint, (v) => onUpdateSettings({ textSpeed: v }),
            [t.settings.textSpeedFast, t.settings.textSpeedSlow])}

          {toggle(t.settings.crt, t.settings.crtHint, settings.crtEnabled, (v) => onUpdateSettings({ crtEnabled: v }))}
          {toggle(t.settings.parallax, t.settings.parallaxHint, settings.parallaxEnabled, (v) => onUpdateSettings({ parallaxEnabled: v }))}
        </div>

        {/* Đóng (thiết lập được lưu ngay khi đổi) */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <MenuOption label={t.settings.saveClose} selected onClick={onClose} />
          <span className="text-[10px] text-zinc-600 tracking-widest">{t.settings.escHint}</span>
        </div>
      </div>
    </div>
  );
};
