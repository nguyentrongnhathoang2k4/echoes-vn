'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tx } from '../locales/tx';

// =====================================================================
// HUD TỐI GIẢN DÙNG CHUNG CHO CÁC MÀN KHÁM PHÁ (chuẩn Màn 1)
// Đồng hồ 03:14 AM góc trên trái · nhãn [E] nổi trên vật thể · phụ đề điện ảnh sát đáy khung hình
// · thanh phím tắt tự ẩn. Vẽ bằng HTML (không phải canvas) để chữ sắc nét khi khung hình phóng to.
// =====================================================================

/** Thời gian phụ đề tối thiểu; câu dài được giữ lâu hơn cho kịp đọc (tối đa 6 giây) */
export const SUBTITLE_MS = 3000;
const SUBTITLE_MS_PER_CHAR = 55;
const SUBTITLE_MAX_MS = 6000;
/** Phụ đề đã hiện ít nhất chừng này thì An bước đi sẽ làm nó mờ sớm (tránh vừa bấm E đã mất) */
const SUBTITLE_MOVE_GRACE_MS = 900;
const SUBTITLE_OUT_MS = 500;
/** Bộ đếm ký ức cạnh đồng hồ chỉ sáng lên chừng này mỗi khi có manh mối mới */
export const CLUE_FLASH_MS = 3000;

// Thanh phím tắt: 3 giây đầu, rồi chỉ hiện lại khi đứng yên 10 giây / rê chuột xuống đáy khung
const HINT_INITIAL_MS = 3000;
const HINT_SHOW_AFTER_IDLE_MS = 10000;
const HINT_MOUSE_ZONE = 0.12;

const TEXT_SHADOW = '0 2px 4px rgba(0,0,0,0.95)';
const KEYFRAMES =
  '@keyframes cine-sub { 0% { opacity: 0 } 8% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }' +
  ' @keyframes cine-sub-in { from { opacity: 0 } to { opacity: 1 } }' +
  ' @keyframes cine-sub-out { from { opacity: 1 } to { opacity: 0 } }' +
  ' @keyframes stage-colon { 50% { opacity: 0 } }' +
  ' @keyframes stage-clock-flicker { 0%, 100% { opacity: 1 } 6% { opacity: .35 } 8% { opacity: 1 } 51% { opacity: 1 } 53% { opacity: .15 } 56% { opacity: .9 } 58% { opacity: .4 } 60% { opacity: 1 } }';

export const subtitleDuration = (text: string) =>
  Math.min(SUBTITLE_MAX_MS, Math.max(SUBTITLE_MS, text.length * SUBTITLE_MS_PER_CHAR));

/** Phụ đề không hiện chỉ số máy móc kiểu "(+15 Sanity)" */
export const cleanSubtitle = (msg: string) => msg.replace(/\s*\([+-]?\d+\s*Sanity[^)]*\)/gi, '').trim();

/** Sắc chữ phụ đề: An (trắng bạc) · tiếng phòng cấp cứu (đỏ nhạt) · Miên (hồng nhạt) */
export type SubtitleTone = 'an' | 'alarm' | 'mien';
const TONE_CLASS: Record<SubtitleTone, string> = {
  an: 'text-zinc-200',
  alarm: 'text-red-200/90',
  mien: 'text-rose-100',
};

export interface SubtitleState {
  text: string;
  key: number;
  ms: number;
  tone: SubtitleTone;
  leaving: boolean;
}

/** Quản lý một dòng phụ đề: hiện, tự mờ theo độ dài câu, mờ sớm khi An bước đi */
export function useCinematicSubtitle() {
  const [subtitle, setSubtitle] = useState<SubtitleState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAtRef = useRef(0);   // 0 = không có phụ đề đang hiện
  const keyRef = useRef(0);

  const show = useCallback((msg: string, tone: SubtitleTone = 'an') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const text = cleanSubtitle(msg);
    if (!text) {
      shownAtRef.current = 0;
      setSubtitle(null);
      return;
    }
    const ms = subtitleDuration(tx(text));
    keyRef.current += 1;
    shownAtRef.current = performance.now();
    setSubtitle({ text, key: keyRef.current, ms, tone, leaving: false });
    timerRef.current = setTimeout(() => {
      shownAtRef.current = 0;
      setSubtitle(null);
    }, ms);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    shownAtRef.current = 0;
    setSubtitle(null);
  }, []);

  /** Gọi từ vòng lặp game mỗi khung hình An đang bước đi (chỉ setState đúng một lần) */
  const fadeOnMove = useCallback(() => {
    const at = shownAtRef.current;
    if (!at || performance.now() - at < SUBTITLE_MOVE_GRACE_MS) return;
    shownAtRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSubtitle((s) => (s ? { ...s, leaving: true } : s));
    timerRef.current = setTimeout(() => setSubtitle(null), SUBTITLE_OUT_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { subtitle, show, hide, fadeOnMove };
}

/** Khung phụ đề điện ảnh: không viền, không nền, chữ serif nghiêng có bóng mờ, sát đáy khung hình */
export function SubtitleFrame({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-max max-w-[86%] pointer-events-none font-serif italic text-sm sm:text-base leading-snug text-center ${className}`}
      style={{ textShadow: TEXT_SHADOW, ...style }}
    >
      <style>{KEYFRAMES}</style>
      {children}
    </div>
  );
}

/** Phụ đề lấy từ useCinematicSubtitle: hiện rồi tự mờ dần */
export function CinematicSubtitle({ subtitle }: { subtitle: SubtitleState | null }) {
  if (!subtitle) return null;
  return (
    <SubtitleFrame
      key={subtitle.key}
      className={TONE_CLASS[subtitle.tone]}
      style={{
        animation: subtitle.leaving
          ? `cine-sub-out ${SUBTITLE_OUT_MS}ms ease-out forwards`
          : `cine-sub ${subtitle.ms}ms ease-out forwards`,
      }}
    >
      <p>{tx(subtitle.text)}</p>
    </SubtitleFrame>
  );
}

/** Đồng hồ 03:14 AM góc trên trái; `alarm` = đỏ nhấp nháy chập chờn như đèn hỏng (Màn 3) */
export function StageClock({ tone = 'pale', children }: { tone?: 'pale' | 'alarm'; children?: React.ReactNode }) {
  return (
    <div
      className={`absolute z-10 font-mono text-[13px] leading-none font-bold tracking-wider pointer-events-none whitespace-nowrap ${
        tone === 'alarm' ? 'text-red-400' : 'text-zinc-100'
      }`}
      style={{
        top: 10,
        left: 10,
        textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 1px rgba(0,0,0,1)',
        animation: tone === 'alarm' ? 'stage-clock-flicker 2.7s linear infinite' : undefined,
      }}
    >
      <style>{KEYFRAMES}</style>
      03<span style={{ animation: 'stage-colon 1s steps(1) infinite' }}>:</span>14 AM
      {children}
    </div>
  );
}

/** Bộ đếm ký ức cạnh đồng hồ: chỉ hiện 3 giây mỗi khi có manh mối mới */
export function ClueFlash({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`absolute z-10 font-mono text-[11px] leading-none text-zinc-300 pointer-events-none transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ top: 11, left: 92, textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
    >
      {children}
    </div>
  );
}

/**
 * Bật ClueFlash khi số manh mối tăng. `active = false` (đang mở hộp thoại / tạm dừng) thì hoãn lại,
 * tới lúc người chơi quay về màn chơi mới sáng lên để không bị khung thoại che mất.
 */
export function useClueFlash(count: number, active = true) {
  const [flash, setFlash] = useState(false);
  const shownRef = useRef(count);
  useEffect(() => {
    if (!active) return;
    if (count <= shownRef.current) {
      shownRef.current = count;
      return;
    }
    shownRef.current = count;
    const on = window.setTimeout(() => setFlash(true), 0);
    const off = window.setTimeout(() => setFlash(false), CLUE_FLASH_MS);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
      setFlash(false);
    };
  }, [count, active]);
  return flash;
}

export interface NearLabel {
  x: number;
  y: number;
  text: string;
}

/** Bong bóng thoại pixel 9x7 (dùng cho nhãn tương tác của các vật kỷ niệm) */
const BUBBLE_PIXELS = [
  '.XXXXXXX.',
  'X.......X',
  'X.X.X.X.X',
  'X.......X',
  '.XXXXXXX.',
  '..XX.....',
  '..X......',
];

function PixelBubble() {
  return (
    <svg width={11} height={9} viewBox="0 0 9 7" shapeRendering="crispEdges" className="shrink-0 text-zinc-300" aria-hidden>
      {BUBBLE_PIXELS.flatMap((row, y) =>
        [...row].map((c, x) => (c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
}

/** Nhãn [E] nổi ngay trên vật thể đang nhắm tới (toạ độ theo khung canvas gốc) */
export function InteractLabel({ label, bubble = false }: { label: NearLabel | null; bubble?: boolean }) {
  if (!label) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none flex items-center gap-1.5 px-1.5 py-1 bg-black/75 font-mono text-[12px] leading-none text-zinc-100 whitespace-nowrap"
      style={{ left: label.x, top: Math.max(24, label.y - 6), transform: 'translate(-50%, -100%)' }}
    >
      <span className="px-1 py-px border border-zinc-400 text-[10px] leading-none text-zinc-100">E</span>
      {bubble && <PixelBubble />}
      <span>{tx(label.text)}</span>
    </div>
  );
}

/** Thanh phím tắt tự ẩn: 3 giây đầu, hiện lại khi An đứng yên lâu hoặc rê chuột xuống đáy khung hình */
export function useAutoHideHints(
  frameRef: React.RefObject<HTMLElement | null>,
  playerRef: React.RefObject<{ isMoving: boolean }>,
) {
  const [hintsVisible, setHintsVisible] = useState(true);
  useEffect(() => {
    let visible = true;
    const startedAt = performance.now();
    let lastMoveAt = startedAt;
    let mouseNearBottom = false;
    const onMouseMove = (e: MouseEvent) => {
      const el = frameRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      mouseNearBottom =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.bottom - r.height * HINT_MOUSE_ZONE && e.clientY <= r.bottom + 24;
    };
    const id = window.setInterval(() => {
      const now = performance.now();
      if (playerRef.current.isMoving) lastMoveAt = now;
      const show =
        mouseNearBottom ||
        now - startedAt < HINT_INITIAL_MS ||
        now - lastMoveAt >= HINT_SHOW_AFTER_IDLE_MS;
      if (show !== visible) {
        visible = show;
        setHintsVisible(show);
      }
    }, 250);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [frameRef, playerRef]);
  return hintsVisible;
}

/** Thanh phím tắt ở đáy khung hình (nhường chỗ cho phụ đề khi có câu thoại) */
export function HintBar({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-black/50 transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 whitespace-nowrap">{children}</div>
    </div>
  );
}

/** Một phím trong thanh phím tắt: "WASD Di chuyển" */
export function HintKey({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span>
      <span className="text-zinc-100 font-bold">{k}</span> {children}
    </span>
  );
}
