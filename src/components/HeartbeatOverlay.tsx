'use client';
import React, { useEffect, useRef } from 'react';
import { audioEngine, HEARTBEAT_SANITY } from '../services/audioEngine';

// =====================================================================
// LỚP CO THẮT NHỊP TIM (Sanity ≤ 35%)
// Bốn góc màn hình là bóng tối pha đỏ bầm, phập phồng "thình... thịch" đúng từng
// nhịp tim mà audioEngine phát ra (nhịp nhanh dần khi Sanity tụt).
// Dưới 15%: viền đỏ giật nhẹ như mạch máu căng ở thái dương.
// =====================================================================

interface HeartbeatOverlayProps {
  sanity: number;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const HeartbeatOverlay: React.FC<HeartbeatOverlayProps> = ({ sanity }) => {
  const vignetteRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<HTMLDivElement>(null);
  const sanityRef = useRef(sanity);
  useEffect(() => {
    sanityRef.current = sanity;
  }, [sanity]);

  useEffect(() => {
    return audioEngine.onHeartbeat((bpm) => {
      const v = vignetteRef.current;
      if (!v) return;
      const s = sanityRef.current;
      // Sanity càng thấp, bóng tối càng đặc
      const depth = Math.min(1, (HEARTBEAT_SANITY - s) / HEARTBEAT_SANITY + 0.25);
      const lo = 0.35 + 0.15 * depth;
      const hi = 0.55 + 0.2 * depth;
      const period = 60000 / bpm;
      const calm = reducedMotion();
      // "Thình" mạnh → "thịch" nhẹ hơn → thả lỏng
      v.animate(
        [
          { opacity: lo, transform: 'scale(1)' },
          { opacity: hi, transform: calm ? 'scale(1)' : 'scale(1.04)', offset: 0.12 },
          { opacity: lo + (hi - lo) * 0.4, transform: calm ? 'scale(1)' : 'scale(1.015)', offset: 0.24 },
          { opacity: lo + (hi - lo) * 0.75, transform: calm ? 'scale(1)' : 'scale(1.03)', offset: 0.34 },
          { opacity: lo, transform: 'scale(1)' },
        ],
        { duration: Math.min(period, 900), easing: 'ease-out', fill: 'forwards' },
      );
      // Dưới 15%: viền đỏ giật lệch như mạch máu căng
      const rim = rimRef.current;
      if (rim && s < 15 && !calm) {
        rim.animate(
          [
            { opacity: 0, transform: 'translate(0,0)' },
            { opacity: 0.9, transform: 'translate(-3px,1px)', offset: 0.1 },
            { opacity: 0.5, transform: 'translate(2px,-1px)', offset: 0.22 },
            { opacity: 0.7, transform: 'translate(-1px,0)', offset: 0.34 },
            { opacity: 0, transform: 'translate(0,0)' },
          ],
          { duration: Math.min(period, 700), easing: 'linear' },
        );
      }
    });
  }, []);

  if (sanity > HEARTBEAT_SANITY) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[35] overflow-hidden" aria-hidden>
      <div
        ref={vignetteRef}
        className="absolute -inset-[3%]"
        style={{
          opacity: 0.35,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(40,0,6,0.55) 68%, rgba(70,0,10,0.92) 100%)',
        }}
      />
      <div
        ref={rimRef}
        className="absolute inset-0"
        style={{ opacity: 0, boxShadow: 'inset 0 0 60px 12px rgba(220,20,40,0.55), inset 6px 0 0 rgba(255,0,60,0.25), inset -6px 0 0 rgba(0,220,255,0.12)' }}
      />
    </div>
  );
};
