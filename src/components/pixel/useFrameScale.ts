'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Theo dõi khung game đang được phóng to bao nhiêu lần so với kích thước gốc của canvas,
 * để lớp giao diện HTML phủ trên canvas (HUD, khung nhắc [E], độc thoại...) phóng to theo cùng tỉ lệ.
 */
export function useFrameScale(baseWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver gọi callback ngay sau khi bắt đầu theo dõi → có tỉ lệ đúng từ khung hình đầu
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setScale(el.clientWidth / baseWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);
  return { ref, scale };
}
