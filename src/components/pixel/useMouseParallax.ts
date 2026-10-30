'use client';
import { RefObject, useEffect } from 'react';

/**
 * Nghiêng nhẹ khung canvas theo con trỏ chuột (góc nhìn như đang cúi đầu trước bàn lúc 3 giờ sáng).
 * Con trỏ chuẩn hoá -1..1 trên toàn cửa sổ, làm mượt bằng lerp 0.05 mỗi khung hình.
 * Ghi thẳng style.transform (không setState). Tắt trên màn cảm ứng, khi người dùng chọn giảm chuyển động,
 * hoặc khi enabled = false. Phóng 3% để mép canvas không lộ viền đen khi nghiêng.
 */
export function useMouseParallax(ref: RefObject<HTMLElement | null>, enabled = true, maxDeg = 2) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
    if (mq('(prefers-reduced-motion: reduce)') || !mq('(pointer: fine)')) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let lastKey = '';
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    // Chuột rời cửa sổ thì khung từ từ trở về thẳng
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };
    const loop = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      const rx = (-cy * maxDeg).toFixed(2);
      const ry = (cx * maxDeg).toFixed(2);
      const key = `${rx}|${ry}`;
      if (key !== lastKey) {
        lastKey = key;
        el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      el.style.transform = '';
    };
  }, [ref, enabled, maxDeg]);
}
