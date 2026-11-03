'use client';
import React from 'react';

// =====================================================================
// MỘT DÒNG LỰA CHỌN KIỂU MENU CHÍNH (dùng chung cho menu chính, tạm dừng, cài đặt)
// Chữ căn giữa không khung viền: mục đang chọn sáng trắng kèm vạch đỏ mảnh bên dưới,
// mục khác xám, mục bị khoá mờ hẳn.
// =====================================================================

interface MenuOptionProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  /** Rê chuột vào → chọn mục này */
  onHover?: () => void;
  onClick: () => void;
  size?: 'md' | 'sm';
}

export const MenuOption: React.FC<MenuOptionProps> = ({ label, selected, disabled, onHover, onClick, size = 'md' }) => (
  <button
    type="button"
    onMouseEnter={onHover}
    onClick={onClick}
    aria-pressed={selected}
    className={`relative uppercase outline-none transition-colors duration-150 ${
      size === 'md'
        ? 'px-6 py-2 text-sm sm:text-base tracking-[0.25em] pl-[calc(1.5rem+0.25em)]'
        : 'px-3 py-1.5 text-xs sm:text-sm tracking-[0.2em] pl-[calc(0.75rem+0.2em)]'
    } ${
      disabled
        ? 'text-zinc-700 cursor-not-allowed'
        : selected
        ? 'text-white cursor-pointer'
        : 'text-zinc-500 hover:text-zinc-300 cursor-pointer'
    }`}
  >
    {label}
    <span
      className={`absolute left-1/2 -translate-x-1/2 bottom-0.5 h-px bg-red-500/80 transition-all duration-200 ${
        selected && !disabled ? (size === 'md' ? 'w-8' : 'w-5') + ' opacity-100' : 'w-0 opacity-0'
      }`}
    />
  </button>
);
