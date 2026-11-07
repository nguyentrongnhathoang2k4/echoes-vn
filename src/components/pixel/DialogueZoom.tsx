'use client';
import React from 'react';

/** Tâm đồ vật vừa tương tác, theo toạ độ canvas */
export type FocusPoint = { x: number; y: number };

// Độ phóng khi đang hội thoại
const ZOOM = 1.7;
// Khung thoại che phần dưới màn hình: đặt đồ vật cao hơn tâm một chút (0 = mép trên, 1 = mép dưới)
const VIEW_Y = 0.4;

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/** Phím di chuyển: bước đi là bỏ điểm nhắm cũ, thoại tự bật sau đó (gõ cửa...) sẽ không zoom nhầm chỗ */
export function isMoveKey(key: string): boolean {
  return MOVE_KEYS.has(key.toLowerCase());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Camera tiến về đồ vật đang được nói tới khi khung thoại mở, lùi về khi đóng.
 * Phóng quanh gốc trên-trái rồi dịch: điểm p → ZOOM·p + t. Kẹp t để mép canvas không lộ nền đen.
 */
export function DialogueZoom({
  focus,
  active,
  width,
  height,
  children,
}: {
  focus: FocusPoint | null;
  active: boolean;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  let transform = 'none';
  if (active && focus) {
    const tx = clamp(0.5 - ZOOM * (focus.x / width), 1 - ZOOM, 0);
    const ty = clamp(VIEW_Y - ZOOM * (focus.y / height), 1 - ZOOM, 0);
    transform = `translate(${(tx * 100).toFixed(2)}%, ${(ty * 100).toFixed(2)}%) scale(${ZOOM})`;
  }
  return (
    <div
      className="absolute inset-0 motion-reduce:transition-none"
      style={{ transform, transformOrigin: '0 0', transition: 'transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}
    >
      {children}
    </div>
  );
}
