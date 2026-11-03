"use client";
import React, { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { MenuOption } from './MenuOption';
import type { OutroKind } from '../locales/vi';

export type { OutroKind };

export interface EndingMeta {
  id: OutroKind;
  code: string;
  themeColor: string;
}

export const ENDINGS_CATALOG: EndingMeta[] = [
  {
    id: 'A',
    code: 'ENDING_A',
    themeColor: '#f59e0b',
  },
  {
    id: 'B',
    code: 'ENDING_B',
    themeColor: '#f43f5e',
  },
  {
    id: 'C',
    code: 'ENDING_C',
    themeColor: '#38bdf8',
  },
  {
    id: 'S',
    code: 'ENDING_S',
    themeColor: '#c084fc',
  },
  {
    id: 'M',
    code: 'ENDING_M',
    themeColor: '#34d399',
  },
];

interface AchievementsModalProps {
  isOpen: boolean;
  unlockedEndings: OutroKind[];
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  isOpen,
  unlockedEndings,
  onClose,
}) => {
  const { t } = useLanguage();
  // Đóng modal khi bấm phím ESC
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

  const total = ENDINGS_CATALOG.length;
  const count = unlockedEndings.length;
  const percent = Math.round((count / total) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 select-none font-mono"
      onClick={onClose}
    >
      <div className="relative w-full max-w-xl text-zinc-200 flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {/* Tiêu đề + số kết cục đã mở */}
        <h2 className="text-center text-lg sm:text-xl tracking-[0.3em] pl-[0.3em] uppercase text-zinc-100">
          {t.achievements.title}
        </h2>
        <div className="mt-2 text-center text-xs tracking-[0.4em] pl-[0.4em] text-red-400/80">
          {t.achievements.unlockedCount(count, total)}
        </div>

        {/* Tiến độ: một vạch mảnh */}
        <div className="mt-4 mx-auto w-40 h-px bg-zinc-800">
          <div className="h-full bg-zinc-300 transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>

        {/* Danh sách 5 kết cục */}
        <div className="mt-5 overflow-y-auto pr-2 flex-1 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]">
          {ENDINGS_CATALOG.map((ending) => {
            const isUnlocked = unlockedEndings.includes(ending.id);
            const text = t.achievements.endings[ending.id];

            return (
              <div key={ending.id} className="py-3.5 border-b border-zinc-900">
                <div className="flex justify-between items-baseline gap-3 mb-1.5">
                  <h3 className={`text-xs sm:text-sm tracking-[0.15em] uppercase ${isUnlocked ? 'text-zinc-100' : 'text-zinc-600'}`}>
                    {isUnlocked ? text.title : t.achievements.lockedTitle}
                  </h3>
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: isUnlocked ? ending.themeColor : '#3f3f46' }}
                  >
                    {isUnlocked ? text.badge : t.achievements.lockedBadge}
                  </span>
                </div>
                <p className={`text-[11px] sm:text-xs leading-relaxed ${isUnlocked ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {isUnlocked ? text.summary : text.hint}
                </p>
              </div>
            );
          })}
        </div>

        {/* Đóng */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <MenuOption label={t.achievements.close} selected onClick={onClose} />
          <span className="text-[10px] text-zinc-600 tracking-widest">{t.achievements.escHint}</span>
        </div>
      </div>
    </div>
  );
};
