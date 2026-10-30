'use client';
import React, { useEffect, useState } from 'react';

// =====================================================================
// MÀN KẾT LẶNG — dùng cho Ending S "Người lạ" và Ending M "Không ai ở lại".
// Màn CRT đen, không âm thanh, chữ gõ chậm từng ký tự, cuối cùng chỉ còn một nút.
// =====================================================================

interface QuietEndingProps {
  lines: string[];
  /** Tiêu đề kết cục hiện sau khi gõ xong (bỏ trống thì không hiện) */
  title?: string;
  buttonLabel: string;
  onDone: () => void;
  /** Đổi tiêu đề tab và KHÔNG trả lại khi rời màn (tiêu đề được giữ cho tới ván mới) */
  tabTitle?: string;
}

const TYPE_MS = 55;
const LINE_PAUSE_MS = 900;
const START_DELAY_MS = 1600;

export const QuietEnding: React.FC<QuietEndingProps> = ({ lines, title, buttonLabel, onDone, tabTitle }) => {
  const [shown, setShown] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (tabTitle) document.title = tabTitle;
  }, [tabTitle]);

  useEffect(() => {
    let line = 0;
    let ch = 0;
    let timer = window.setTimeout(function tick() {
      if (line >= lines.length) {
        timer = window.setTimeout(() => setDone(true), LINE_PAUSE_MS);
        return;
      }
      ch++;
      const cur = lines[line];
      setShown([...lines.slice(0, line), cur.slice(0, ch)]);
      if (ch >= cur.length) {
        line++;
        ch = 0;
        timer = window.setTimeout(tick, LINE_PAUSE_MS);
      } else {
        timer = window.setTimeout(tick, TYPE_MS);
      }
    }, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [lines]);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center font-mono select-none overflow-hidden">
      <style>{`
        @keyframes qe-blink { 50% { opacity: 0 } }
        @keyframes qe-in { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
      <div className="w-full max-w-2xl px-6">
        <div
          className="whitespace-pre-wrap text-cyan-200 text-[clamp(13px,1.6vw,19px)] leading-loose"
          style={{ textShadow: '0 0 6px rgba(103,232,249,.55)' }}
        >
          {shown.join('\n')}
          {!done && (
            <span className="inline-block w-[0.6em] h-[1.1em] bg-cyan-300 align-middle ml-1" style={{ animation: 'qe-blink 1s steps(1) infinite' }} />
          )}
        </div>
        {done && (
          <div className="mt-12 flex flex-col items-center gap-6" style={{ animation: 'qe-in 2.4s ease-out' }}>
            {title && <div className="text-zinc-400 text-xs sm:text-sm tracking-[0.4em] text-center">{title}</div>}
            <button
              onClick={onDone}
              className="px-5 py-2 border border-cyan-800 text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-100 text-xs sm:text-sm tracking-[0.3em] transition-colors cursor-pointer"
            >
              {buttonLabel}
            </button>
          </div>
        )}
      </div>
      {/* Mành quét CRT + viền tối */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 3px)' }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.8) 100%)' }} />
    </div>
  );
};
