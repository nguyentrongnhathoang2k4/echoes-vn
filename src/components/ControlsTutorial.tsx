'use client';

import React, { useEffect } from 'react';
import { tx } from '../locales/tx';
import { useUiLayer } from '../services/uiLayers';

// Bảng hướng dẫn điều khiển mini hiện một lần khi An vừa tỉnh dậy trong phòng trọ #314

const ROWS: Array<{ keys: string[][]; label: string }> = [
  { keys: [['W', 'A', 'S', 'D'], ['←', '↑', '→', '↓']], label: 'Di chuyển' },
  { keys: [['E'], ['Space']], label: 'Tương tác vật thể' },
  { keys: [['I'], ['Tab']], label: 'Túi đồ' },
  { keys: [['Esc']], label: 'Đóng / Tạm dừng' },
];

function Key({ k }: { k: string }) {
  return <span className="inline-block min-w-[18px] px-1 py-px border border-zinc-500 text-center text-[10px] leading-[14px] text-zinc-100">{k}</span>;
}

export function ControlsTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Esc của trang nhường cho bảng này (Esc = đóng bảng, không mở Pause Menu)
  useUiLayer(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Bảng đang mở: giữ mọi phím lại để An không đi / tương tác ở phía sau
      e.stopImmediatePropagation();
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div
        onClick={onClose}
        className="pointer-events-auto cursor-pointer bg-black/80 border border-zinc-800 px-6 py-5 font-mono text-[12px] text-zinc-300 animate-fade-in"
      >
        <div className="mb-3 text-[10px] tracking-[0.35em] uppercase text-zinc-500">{tx('Điều khiển')}</div>
        <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-2 items-center">
          {ROWS.map((r) => (
            <React.Fragment key={r.label}>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                {r.keys.map((group, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 && <span>/</span>}
                    <span className="flex gap-0.5">{group.map((k) => <Key key={k} k={k} />)}</span>
                  </React.Fragment>
                ))}
              </div>
              <div>{tx(r.label)}</div>
            </React.Fragment>
          ))}
        </div>
        <div className="mt-4 text-[10px] tracking-[0.25em] uppercase text-zinc-500 animate-pulse">{tx('Space / Enter để bắt đầu')}</div>
      </div>
    </div>
  );
}
