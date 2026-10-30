'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

// =====================================================================
// CẢNH BÁO NỘI DUNG: hiện khi mở game, tự tắt sau 5 giây.
// Sau 1 giây có thể bấm phím / click để bỏ qua; phím bấm bị chặn lại
// để không lọt xuống menu chính bên dưới.
// =====================================================================

const SHOW_MS = 5000;
const SKIP_AFTER_MS = 1000;
const FADE_MS = 600;

interface ContentWarningProps {
  /** Gọi khi màn cảnh báo đã tắt hẳn */
  onDone: () => void;
  /** Gọi ngay trong lúc người chơi bấm bỏ qua (còn trong cử chỉ người dùng, dùng để bật âm thanh) */
  onSkipGesture?: () => void;
}

export const ContentWarning: React.FC<ContentWarningProps> = ({ onDone, onSkipGesture }) => {
  const { t } = useLanguage();
  const [leaving, setLeaving] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const doneRef = useRef(onDone);
  const skipRef = useRef(onSkipGesture);
  useEffect(() => {
    doneRef.current = onDone;
    skipRef.current = onSkipGesture;
  }, [onDone, onSkipGesture]);

  useEffect(() => {
    let finished = false;
    let fadeTimer = 0;
    const leave = () => {
      if (finished) return;
      finished = true;
      setLeaving(true);
      fadeTimer = window.setTimeout(() => doneRef.current(), FADE_MS);
    };
    const showTimer = window.setTimeout(leave, SHOW_MS);
    const skipTimer = window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    const start = performance.now();
    // Chặn ở pha capture: phím / click bỏ qua cảnh báo không được lọt xuống menu
    const onInput = (e: Event) => {
      e.stopPropagation();
      if (finished || performance.now() - start < SKIP_AFTER_MS) return;
      skipRef.current?.();
      leave();
    };
    window.addEventListener('keydown', onInput, true);
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('click', onInput, true);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(skipTimer);
      window.clearTimeout(fadeTimer);
      window.removeEventListener('keydown', onInput, true);
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('click', onInput, true);
    };
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby="content-warning-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black px-4 font-mono select-none cursor-default"
      style={{ opacity: leaving ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
    >
      <style>{'@keyframes cw-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } } @keyframes cw-bar { from { transform: scaleX(1) } to { transform: scaleX(0) } }'}</style>
      <div className="w-full max-w-xl" style={{ animation: 'cw-in 0.8s ease-out' }}>
        <div className="border-b border-red-900/70 pb-3">
          <div>
            <h1 id="content-warning-title" className="text-red-400 font-bold tracking-[0.25em] text-sm sm:text-base">
              {t.warning.title}
            </h1>
            <p className="text-[11px] text-zinc-500 tracking-wider mt-0.5">{t.warning.subtitle}</p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {t.warning.items.map((w) => (
            <li key={w.title}>
              <div className="text-zinc-100 text-xs sm:text-sm font-bold">{w.title}</div>
              <div className="text-zinc-400 text-[11px] sm:text-xs leading-relaxed">{w.detail}</div>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[11px] sm:text-xs leading-relaxed text-zinc-400 border-l-2 border-zinc-700 pl-3">
          {t.warning.note}
        </p>

        <div className="mt-6 h-[2px] w-full bg-zinc-900 overflow-hidden">
          <div className="h-full bg-red-700 origin-left" style={{ animation: `cw-bar ${SHOW_MS}ms linear forwards` }} />
        </div>
        <p className={`mt-2 text-right text-[10px] tracking-wider text-zinc-500 transition-opacity duration-500 ${canSkip ? 'opacity-100' : 'opacity-0'}`}>
          {t.warning.skip}
        </p>
      </div>
    </div>
  );
};
