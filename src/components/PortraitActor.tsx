'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// =====================================================================
// CHÂN DUNG "SỐNG" CHO KHUNG THOẠI
// Ảnh chân dung là ảnh tĩnh, nên chuyển động được dựng bằng 3 lớp lồng nhau:
//   1. idle    — nhịp thở / dáng đứng theo cảm xúc (lặp vô hạn)
//   2. talk    — nhún nhẹ khi nhân vật đang nói
//   3. gesture — cử chỉ một lần (gật đầu, giật mình, cúi xuống...)
// Đổi biểu cảm thì ảnh mới mờ dần lên trên ảnh cũ, khung giữ nguyên kích thước.
// =====================================================================

export type Gesture =
  | 'nod'
  | 'shake'
  | 'flinch'
  | 'hop'
  | 'sink'
  | 'lean'
  | 'turn'
  | 'laugh'
  | 'sigh'
  | 'tremble'
  | 'glitch'
  | 'step'
  | 'tilt'
  | 'sob';

export const GESTURES: readonly Gesture[] = [
  'nod', 'shake', 'flinch', 'hop', 'sink', 'lean', 'turn', 'laugh', 'sigh', 'tremble', 'glitch', 'step', 'tilt', 'sob',
];

/** Cử chỉ tự động khi nhân vật chuyển sang một biểu cảm */
export const EMOTION_GESTURE: Record<string, Gesture> = {
  scared: 'flinch',
  panic: 'tremble',
  surprised: 'hop',
  sad: 'sink',
  melancholy: 'sink',
  exhausted: 'sigh',
  faint_smile: 'nod',
  smile: 'laugh',
  doubt: 'tilt',
  determined: 'step',
  glitched: 'glitch',
  corrupted: 'glitch',
  warm_smile: 'laugh',
  gentle: 'nod',
  worried: 'lean',
  pleading: 'lean',
  crying: 'sob',
  fading: 'glitch',
  playful: 'hop',
  normal: 'nod',
};

type Frames = Keyframe[];

/** dir: hướng về phía nhân vật đối diện (+1: An ở trái nhìn sang phải, -1: Miên ở phải) */
function gestureFrames(g: Gesture, dir: number): { frames: Frames; ms: number } {
  const x = (v: number) => v * dir;
  switch (g) {
    case 'nod':
      return { ms: 650, frames: [{ transform: 'none' }, { transform: 'translateY(6px) rotate(0.6deg)' }, { transform: 'translateY(-1px)' }, { transform: 'translateY(3px)' }, { transform: 'none' }] };
    case 'shake':
      return { ms: 600, frames: [0, -7, 7, -5, 4, -2, 0].map((v) => ({ transform: `translateX(${v}px)` })) };
    case 'flinch':
      return { ms: 700, frames: [{ transform: 'none' }, { transform: `translateX(${x(-14)}px) scale(0.96)`, offset: 0.15 }, { transform: `translateX(${x(-10)}px) scale(0.97)`, offset: 0.5 }, { transform: 'none' }] };
    case 'hop':
      return { ms: 520, frames: [{ transform: 'none' }, { transform: 'translateY(2px) scaleY(0.97)', offset: 0.15 }, { transform: 'translateY(-14px) scaleY(1.02)', offset: 0.45 }, { transform: 'translateY(1px) scaleY(0.99)', offset: 0.8 }, { transform: 'none' }] };
    case 'sink':
      return { ms: 1400, frames: [{ transform: 'none' }, { transform: 'translateY(9px) scale(0.985)', offset: 0.45 }, { transform: 'translateY(6px) scale(0.99)', offset: 0.75 }, { transform: 'none' }] };
    case 'lean':
      return { ms: 1100, frames: [{ transform: 'none' }, { transform: `translateX(${x(12)}px) rotate(${x(1.5)}deg)`, offset: 0.35 }, { transform: `translateX(${x(9)}px) rotate(${x(1)}deg)`, offset: 0.7 }, { transform: 'none' }] };
    case 'turn':
      return { ms: 1600, frames: [{ transform: 'none' }, { transform: `translateX(${x(-10)}px) scaleX(0.9)`, offset: 0.2 }, { transform: `translateX(${x(-10)}px) scaleX(0.9)`, offset: 0.75 }, { transform: 'none' }] };
    case 'laugh':
      return { ms: 800, frames: [0, -5, 0, -4, 0, -2, 0].map((v) => ({ transform: `translateY(${v}px)` })) };
    case 'sigh':
      return { ms: 1600, frames: [{ transform: 'none' }, { transform: 'scaleY(1.03) translateY(-2px)', offset: 0.35 }, { transform: 'scaleY(0.98) translateY(4px)', offset: 0.75 }, { transform: 'none' }] };
    case 'tremble':
      return { ms: 700, frames: [0, -3, 3, -2, 3, -3, 2, -1, 0].map((v, i) => ({ transform: `translate(${v}px, ${i % 2}px)` })) };
    case 'glitch':
      return {
        ms: 450,
        frames: [
          { transform: 'none', filter: 'none' },
          { transform: 'translateX(-8px) skewX(4deg)', filter: 'drop-shadow(4px 0 0 rgba(255,0,80,0.8)) drop-shadow(-4px 0 0 rgba(0,240,255,0.8))', offset: 0.2 },
          { transform: 'translateX(6px)', filter: 'drop-shadow(-3px 0 0 rgba(255,0,80,0.8)) drop-shadow(3px 0 0 rgba(0,240,255,0.8)) brightness(1.4)', offset: 0.45 },
          { transform: 'translateX(-2px) skewX(-2deg)', filter: 'none', offset: 0.7 },
          { transform: 'none', filter: 'none' },
        ],
      };
    case 'step':
      return { ms: 900, frames: [{ transform: 'none' }, { transform: `translateX(${x(6)}px) scale(1.04)`, offset: 0.35 }, { transform: `translateX(${x(4)}px) scale(1.03)`, offset: 0.7 }, { transform: 'none' }] };
    case 'tilt':
      return { ms: 1300, frames: [{ transform: 'none' }, { transform: `rotate(${x(-3)}deg)`, offset: 0.3 }, { transform: `rotate(${x(-2.5)}deg)`, offset: 0.7 }, { transform: 'none' }] };
    case 'sob':
      return { ms: 1200, frames: [0, 4, 0, 3, 0, 4, 1, 0].map((v) => ({ transform: `translateY(${v}px) scaleY(${1 - v * 0.003})` })) };
  }
}

/** Dáng đứng lặp vô hạn theo cảm xúc */
function idleFrames(emotion: string): { frames: Frames; ms: number } {
  const breathe = (amp: number, base = '') => [
    { transform: `${base} scaleY(1)` },
    { transform: `${base} scaleY(${1 + amp})` },
    { transform: `${base} scaleY(1)` },
  ];
  switch (emotion) {
    case 'panic':
      return { ms: 900, frames: [0, 1, -1, 1, 0].map((v, i) => ({ transform: `translateX(${v}px) scaleY(${i === 2 ? 1.018 : 1})` })) };
    case 'scared':
      return { ms: 1700, frames: breathe(0.014, 'scale(0.99)') };
    case 'exhausted':
      return {
        ms: 5200,
        frames: [
          { transform: 'translateY(3px) rotate(0deg) scaleY(1)' },
          { transform: 'translateY(3px) rotate(-0.7deg) scaleY(1.012)' },
          { transform: 'translateY(4px) rotate(0.4deg) scaleY(1)' },
          { transform: 'translateY(3px) rotate(0deg) scaleY(1)' },
        ],
      };
    case 'sad':
    case 'melancholy':
      return { ms: 5000, frames: breathe(0.01, 'translateY(4px)') };
    case 'crying':
      return {
        ms: 2600,
        frames: [
          { transform: 'translateY(3px) scaleY(1)' },
          { transform: 'translateY(5px) scaleY(0.995)', offset: 0.08 },
          { transform: 'translateY(3px) scaleY(1)', offset: 0.16 },
          { transform: 'translateY(5px) scaleY(0.995)', offset: 0.24 },
          { transform: 'translateY(3px) scaleY(1.012)', offset: 0.6 },
          { transform: 'translateY(3px) scaleY(1)' },
        ],
      };
    case 'playful':
      return { ms: 2200, frames: [{ transform: 'rotate(-1.2deg)' }, { transform: 'rotate(1.2deg) translateY(-2px)' }, { transform: 'rotate(-1.2deg)' }] };
    case 'warm_smile':
    case 'gentle':
      return { ms: 3800, frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px) scaleY(1.008)' }, { transform: 'translateY(0)' }] };
    case 'fading':
      return {
        ms: 3100,
        frames: [
          { opacity: 1, transform: 'none' },
          { opacity: 0.55, transform: 'translateY(-3px)', offset: 0.4 },
          { opacity: 0.9, transform: 'translateY(-2px)', offset: 0.55 },
          { opacity: 0.4, transform: 'translateY(-4px)', offset: 0.62 },
          { opacity: 1, transform: 'none' },
        ],
      };
    case 'corrupted':
    case 'glitched':
      return {
        ms: 2800,
        frames: [
          { transform: 'none', filter: 'none' },
          { transform: 'none', filter: 'none', offset: 0.82 },
          { transform: 'translateX(-5px)', filter: 'drop-shadow(3px 0 0 rgba(255,0,80,0.7)) drop-shadow(-3px 0 0 rgba(0,240,255,0.7))', offset: 0.85 },
          { transform: 'translateX(4px) skewX(3deg)', filter: 'hue-rotate(60deg)', offset: 0.88 },
          { transform: 'none', filter: 'none', offset: 0.9 },
          { transform: 'none', filter: 'none' },
        ],
      };
    case 'worried':
    case 'pleading':
      return { ms: 2800, frames: breathe(0.014, 'scale(1.01)') };
    case 'determined':
      return { ms: 4600, frames: breathe(0.01, 'scale(1.02)') };
    case 'doubt':
      return { ms: 4200, frames: breathe(0.01, 'rotate(-0.8deg)') };
    case 'surprised':
      return { ms: 2000, frames: breathe(0.016, 'translateY(-2px)') };
    default:
      return { ms: 3600, frames: breathe(0.012) };
  }
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface PortraitActorProps {
  src: string;
  alt: string;
  emotion: string;
  /** Cử chỉ một lần; đổi `id` để phát lại cùng một cử chỉ */
  gesture: { name: Gesture; id: number } | null;
  /** Nhân vật đang nói (chữ còn đang gõ) */
  talking: boolean;
  /** +1: nhân vật đứng bên trái, -1: bên phải */
  dir: 1 | -1;
  imgClassName?: string;
}

export const PortraitActor: React.FC<PortraitActorProps> = ({ src, alt, emotion, gesture, talking, dir, imgClassName = '' }) => {
  const idleRef = useRef<HTMLDivElement>(null);
  const talkRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<HTMLDivElement>(null);
  const curImgRef = useRef<HTMLImageElement>(null);

  // Ảnh trước đó được giữ lại một nhịp để mờ dần (derived state, không cần effect)
  const [cur, setCur] = useState(src);
  const [prev, setPrev] = useState<string | null>(null);
  if (src !== cur) {
    setPrev(cur);
    setCur(src);
  }

  // Layout effect: bắt đầu mờ dần trước khi trình duyệt vẽ, tránh chớp ảnh mới ở độ đậm 100%
  useLayoutEffect(() => {
    if (!prev) return;
    const img = curImgRef.current;
    if (img && !reducedMotion()) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    const t = window.setTimeout(() => setPrev(null), 300);
    return () => window.clearTimeout(t);
  }, [prev]);

  useEffect(() => {
    const el = idleRef.current;
    if (!el || reducedMotion()) return;
    const { frames, ms } = idleFrames(emotion);
    const anim = el.animate(frames, { duration: ms, iterations: Infinity, easing: 'ease-in-out' });
    return () => anim.cancel();
  }, [emotion]);

  useEffect(() => {
    const el = talkRef.current;
    if (!el || !talking || reducedMotion()) return;
    const anim = el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }],
      { duration: 280, iterations: Infinity, easing: 'ease-in-out' }
    );
    return () => anim.cancel();
  }, [talking]);

  useEffect(() => {
    const el = gestureRef.current;
    if (!el || !gesture || reducedMotion()) return;
    const { frames, ms } = gestureFrames(gesture.name, dir);
    const anim = el.animate(frames, { duration: ms, easing: 'ease-in-out' });
    return () => anim.cancel();
  }, [gesture, dir]);

  return (
    <div ref={idleRef} className="origin-bottom will-change-transform">
      <div ref={talkRef} className="origin-bottom">
        <div ref={gestureRef} className="relative origin-bottom h-[40vh] sm:h-[46vh] aspect-[0.92] max-w-[250px] sm:max-w-[320px]">
          {prev && (
            <img src={prev} alt="" aria-hidden className={`absolute inset-0 w-full h-full object-contain object-bottom ${imgClassName}`} />
          )}
          <img ref={curImgRef} src={cur} alt={alt} className={`absolute inset-0 w-full h-full object-contain object-bottom ${imgClassName}`} />
        </div>
      </div>
    </div>
  );
};
