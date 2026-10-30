"use client";
import React, { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import type { OutroKind } from '../locales/vi';

export type { OutroKind };

export interface EndingMeta {
  id: OutroKind;
  code: string;
  themeColor: string;
  glowClass: string;
  borderClass: string;
  bgUnlocked: string;
  textTitle: string;
}

export const ENDINGS_CATALOG: EndingMeta[] = [
  {
    id: 'A',
    code: 'ENDING_A',
    themeColor: '#f59e0b',
    glowClass: 'shadow-[0_0_25px_rgba(245,158,11,0.25)]',
    borderClass: 'border-amber-500/80',
    bgUnlocked: 'bg-amber-950/20',
    textTitle: 'text-amber-300',
  },
  {
    id: 'B',
    code: 'ENDING_B',
    themeColor: '#f43f5e',
    glowClass: 'shadow-[0_0_25px_rgba(244,63,94,0.25)]',
    borderClass: 'border-rose-500/80',
    bgUnlocked: 'bg-rose-950/25',
    textTitle: 'text-rose-300',
  },
  {
    id: 'C',
    code: 'ENDING_C',
    themeColor: '#38bdf8',
    glowClass: 'shadow-[0_0_25px_rgba(56,189,248,0.25)]',
    borderClass: 'border-sky-500/80',
    bgUnlocked: 'bg-sky-950/20',
    textTitle: 'text-sky-300',
  },
  {
    id: 'S',
    code: 'ENDING_S',
    themeColor: '#c084fc',
    glowClass: 'shadow-[0_0_25px_rgba(192,132,252,0.25)]',
    borderClass: 'border-purple-500/80',
    bgUnlocked: 'bg-purple-950/25',
    textTitle: 'text-purple-300',
  },
  {
    id: 'M',
    code: 'ENDING_M',
    themeColor: '#34d399',
    glowClass: 'shadow-[0_0_25px_rgba(52,211,153,0.25)]',
    borderClass: 'border-emerald-500/80',
    bgUnlocked: 'bg-emerald-950/25',
    textTitle: 'text-emerald-300',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md select-none font-mono"
      onClick={onClose}
    >
      {/* Khung Terminal Modal */}
      <div
        className="relative w-full max-w-2xl bg-zinc-950/95 border-2 border-cyan-500/80 p-5 sm:p-6 shadow-[0_0_40px_rgba(6,182,212,0.35)] rounded text-zinc-200 flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Retro */}
        <div className="flex justify-between items-center border-b border-cyan-800/80 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 bg-cyan-400 animate-pulse rounded-full" />
            <h2 className="text-sm sm:text-base font-bold tracking-wider text-cyan-300 uppercase">
              {t.achievements.title}
            </h2>
          </div>
          <span className="text-[11px] text-cyan-400 font-bold tracking-widest">
            {t.achievements.unlockedCount(count, total)}
          </span>
        </div>

        {/* Thanh Tiến độ Tổng thể */}
        <div className="mb-4 p-3 bg-zinc-900/60 rounded border border-zinc-800/80">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-zinc-400 tracking-wider">
              {t.achievements.progress}
            </span>
            <span className="text-cyan-300 font-bold">{percent}%</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-amber-400 transition-all duration-500 rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Danh sách 5 kết cục */}
        <div className="space-y-3 overflow-y-auto pr-1 flex-1">
          {ENDINGS_CATALOG.map((ending) => {
            const isUnlocked = unlockedEndings.includes(ending.id);
            const text = t.achievements.endings[ending.id];

            return (
              <div
                key={ending.id}
                className={`p-3.5 rounded border transition-all duration-200 ${
                  isUnlocked
                    ? `${ending.borderClass} ${ending.bgUnlocked} ${ending.glowClass}`
                    : 'border-zinc-800/70 bg-zinc-900/30 text-zinc-500 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base">
                      {isUnlocked ? text.badge.split(' ')[0] : '🔒'}
                    </span>
                    <h3
                      className={`text-xs sm:text-sm font-bold tracking-wide uppercase ${
                        isUnlocked ? ending.textTitle : 'text-zinc-500'
                      }`}
                    >
                      {isUnlocked ? text.title : t.achievements.lockedTitle}
                    </h3>
                  </div>

                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                      isUnlocked
                        ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-300'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-600'
                    }`}
                  >
                    {isUnlocked ? text.badge : t.achievements.lockedBadge}
                  </span>
                </div>

                <p className="text-[11px] sm:text-xs leading-relaxed">
                  {isUnlocked ? text.summary : text.hint}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer Nút Đóng */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-[10px] text-zinc-500 tracking-wider">
            {t.achievements.escHint}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-cyan-950/80 border border-zinc-700 hover:border-cyan-500 text-zinc-300 hover:text-cyan-200 text-xs font-bold rounded tracking-wider transition-all cursor-pointer"
          >
            {t.achievements.close}
          </button>
        </div>
      </div>
    </div>
  );
};
