import { useEffect, useId } from 'react';

// =====================================================================
// SỔ ĐĂNG KÝ LỚP GIAO DIỆN ĐANG MỞ (Túi đồ, màn hình máy tính, khung PIN, minigame...)
// Trang chính đọc sổ này để biết phím Esc thuộc về một modal con hay được phép mở Pause Menu.
// Modal nào tự đóng bằng Esc chỉ cần gọi useUiLayer(isOpen); không cần truyền prop lên trang.
// =====================================================================

const openLayers = new Set<string>();

/** Có lớp giao diện con nào đang mở không */
export function hasOpenUiLayer(): boolean {
  return openLayers.size > 0;
}

/** Ghi danh một lớp giao diện trong lúc `active` = true; tự gỡ khi đóng hoặc unmount */
export function useUiLayer(active: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    openLayers.add(id);
    return () => {
      openLayers.delete(id);
    };
  }, [id, active]);
}
