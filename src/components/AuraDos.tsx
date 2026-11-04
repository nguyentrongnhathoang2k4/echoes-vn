'use client';
import React, { useEffect, useRef, useState } from 'react';
import { tx } from '../locales/tx';

// =====================================================================
// AURA DOS: cửa sổ dòng lệnh MS-DOS giả lập trên desktop máy An (Màn 1)
// Gõ lệnh vào dòng nhắc hoặc bấm các lệnh gợi ý bên dưới. Logic lệnh nằm ở DesktopScreen.
// =====================================================================

export interface DosLine {
  text: string;
  /** 'cmd' = dòng người chơi gõ, 'err' = lỗi đỏ, 'ok' = xanh, 'warn' = vàng, 'glitch' = chữ nhiễu */
  kind?: 'cmd' | 'err' | 'ok' | 'warn' | 'glitch' | 'dim';
  /** Dòng tiếng Việt cần dịch qua tx() */
  vi?: boolean;
}

interface AuraDosProps {
  lines: DosLine[];
  /** Các lệnh đã biết (hiện thành nút bấm nhanh) */
  suggestions: string[];
  busy: boolean;
  onCommand: (cmd: string) => void;
  onClose: () => void;
}

const KIND_CLASS: Record<NonNullable<DosLine['kind']>, string> = {
  cmd: 'text-zinc-100',
  err: 'text-red-400',
  ok: 'text-emerald-400',
  warn: 'text-amber-300',
  glitch: 'text-fuchsia-300',
  dim: 'text-zinc-500',
};

export const AuraDos: React.FC<AuraDosProps> = ({ lines, suggestions, busy, onCommand, onClose }) => {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const submit = (cmd: string) => {
    if (busy || !cmd.trim()) return;
    onCommand(cmd.trim());
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div
      className="absolute inset-x-2 top-2 bottom-12 z-20 flex flex-col bg-black border-2 border-zinc-500 shadow-[4px_4px_0_rgba(0,0,0,0.6)]"
      onMouseDown={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between h-5 px-1.5 bg-zinc-700 text-[10px] text-white font-bold shrink-0">
        <span>AURA DOS — C:\AURA</span>
        <button
          onClick={onClose}
          className="px-1 leading-none bg-zinc-200 text-zinc-900 border border-zinc-500 hover:bg-red-600 hover:text-white cursor-pointer"
          title={tx('Nhấn ESC để đóng cửa sổ')}
        >
          X
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1.5 text-[11px] leading-snug text-zinc-300 whitespace-pre-wrap">
        {lines.map((l, i) => (
          <div key={i} className={l.kind ? KIND_CLASS[l.kind] : ''}>
            {l.vi ? tx(l.text) : l.text}
          </div>
        ))}
        <div className="flex items-center text-zinc-100">
          <span className="shrink-0">C:\AURA&gt;</span>
          <input
            ref={inputRef}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit(input);
              }
            }}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 ml-1 bg-transparent outline-none border-none text-zinc-100 caret-zinc-100 uppercase"
            aria-label={tx('Gõ lệnh')}
          />
        </div>
      </div>
      {/* Lệnh đã biết: bấm để gõ nhanh */}
      <div className="shrink-0 flex flex-wrap gap-1 px-2 py-1.5 border-t border-zinc-700 bg-zinc-950">
        <span className="text-[10px] text-zinc-500 mr-1 self-center">{tx('Lệnh:')}</span>
        {suggestions.map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => submit(s)}
            className="px-1.5 py-0.5 text-[10px] text-zinc-200 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 disabled:text-zinc-600 cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
