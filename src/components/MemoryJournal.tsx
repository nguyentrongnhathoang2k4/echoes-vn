'use client';
import React, { useEffect } from 'react';
import { tx } from '../locales/tx';
import { useUiLayer } from '../services/uiLayers';
import type { MemoryEntry } from '../data/memoryJournal';

/**
 * SỔ KÝ ỨC [J]: những câu An đã đọc được, ghi nguyên văn kèm nơi thấy.
 * Không đánh dấu câu nào là manh mối thật: người chơi tự cân nhắc.
 * Đang mở thì nuốt mọi phím (không cho khung thoại / màn chơi phía sau nhận), Esc hoặc J để đóng.
 */
export function MemoryJournal({ open, entries, onClose }: { open: boolean; entries: MemoryEntry[]; onClose: () => void }) {
  useUiLayer(open);
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      e.stopPropagation();
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'j') {
        e.preventDefault();
        onClose();
      } else if ([' ', 'enter', 'tab', 'arrowup', 'arrowdown'].includes(k)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4 font-mono" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[80vh] flex flex-col bg-zinc-950 border border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-bold tracking-[0.3em] text-zinc-100">{tx('KÝ ỨC')}</span>
          <span className="text-xs text-zinc-500">{entries.length} {tx('mục')}</span>
        </div>
        <MemoryList entries={entries} className="flex-1 min-h-0 overflow-y-auto px-4 py-3" />
        <div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500 text-right">
          <span className="inline-block px-1.5 mr-1 border border-zinc-600 text-zinc-300">J</span>
          <span className="inline-block px-1.5 mr-1 border border-zinc-600 text-zinc-300">Esc</span>
          {tx('Đóng')}
        </div>
      </div>
    </div>
  );
}

/** Danh sách mục ký ức (dùng chung cho sổ [J] và màn suy luận Màn 4) */
export function MemoryList({ entries, className = '' }: { entries: MemoryEntry[]; className?: string }) {
  return (
    <div className={className}>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">{tx('Chưa ghi được gì.')}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((m) => (
            <li key={m.id} className="border-l-2 border-zinc-700 pl-3">
              <div className="text-[11px] uppercase tracking-widest text-zinc-500">{tx(m.source)}</div>
              <div className="text-sm leading-relaxed text-zinc-200 font-sans">{tx(m.text)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
