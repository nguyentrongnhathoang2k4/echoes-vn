'use client';
import React, { useEffect, useState } from 'react';
import { tx } from '../locales/tx';
import { useLanguage } from '../context/LanguageContext';
import { MenuOption } from './MenuOption';

// =====================================================================
// MENU TẠM DỪNG TRONG LÚC CHƠI (cùng phong cách menu chính)
// W/S hoặc ↑/↓ để chọn, Enter/Space để xác nhận; Esc do trang chính xử lý (đóng menu).
// Trong lúc tạm dừng, phím không lọt xuống màn chơi phía sau.
// =====================================================================

interface PauseMenuProps {
  onResume: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
  /** false khi Cài đặt đang mở đè lên: nhường bàn phím cho Cài đặt */
  active: boolean;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onOpenSettings, onMainMenu, active }) => {
  useLanguage(); // vẽ lại khi đổi ngôn ngữ
  const [selected, setSelected] = useState(0);
  const options = [
    { label: tx('Tiếp tục'), run: onResume },
    { label: tx('Cài đặt'), run: onOpenSettings },
    { label: tx('Về menu chính'), run: onMainMenu },
  ];

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      // Pha capture + chặn lan truyền: nhân vật không đi, hộp thoại không qua câu khi đang tạm dừng
      e.stopImmediatePropagation();
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') {
        e.preventDefault();
        setSelected((i) => (i + options.length - 1) % options.length);
      } else if (key === 's' || key === 'arrowdown') {
        e.preventDefault();
        setSelected((i) => (i + 1) % options.length);
      } else if ((key === 'enter' || key === ' ') && !e.repeat) {
        e.preventDefault();
        options[selected].run();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 select-none font-mono" onClick={onResume}>
      <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg sm:text-xl tracking-[0.3em] pl-[0.3em] uppercase text-zinc-100">{tx('Tạm dừng')}</h2>
        <nav className="mt-10 flex flex-col items-center gap-2">
          {options.map((o, i) => (
            <MenuOption key={o.label} label={o.label} selected={selected === i} onHover={() => setSelected(i)} onClick={o.run} />
          ))}
        </nav>
        <div className="mt-10 text-[10px] text-zinc-600 tracking-widest">{tx('Tiến trình được lưu tự động')}</div>
      </div>
    </div>
  );
};
