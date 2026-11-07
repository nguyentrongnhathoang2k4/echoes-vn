"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { block, hash } from '../pixel/pixelKit';
import { drawSpriteFrame } from '../pixel/spriteKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from '../SunsetStage';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

/**
 * TIÊU CỰ GIAO THOA HAI THỰC TẠI (Màn 2) — một thao tác: vặn núm "Tiêu Cự Ký Ức" 0–100%.
 *   0–40%  : Bến An Yên chiều tà, Miên cười rạng rỡ bên An.
 *   60–100%: hoàng hôn tan rã, phòng hồi sức lạnh lẽo, An quấn băng trên giường bệnh.
 *   48–52% : điểm giao thoa — hai ảnh chồng khít, cổ tay An lộ rõ vòng nhựa "BV TRUNG HOÀ • 17/05".
 * Dừng núm trong vùng giao thoa một nhịp: ảnh rung giật, mở đoạn hồi tưởng chân tướng.
 */
type Phase = 'focus' | 'interfere' | 'away' | 'revealed';

const W = 340;
const H = 360;
// Điểm hai thực tại chồng khít đổi chỗ mỗi lần mở (25–75%): phải nhìn ảnh, không học thuộc được
const BAND_HALF = 2;
const rollCenter = () => 25 + Math.round(Math.random() * 50);
const HOLD_S = 1.2;
const KEY_RATE = 22;          // % / giây khi giữ A/D
const WHEEL_STEP = 1;
const DRAG_RATE = 0.35;       // % / px kéo núm
const SHAKE_MS = 1300;
// Chi tiết lộ ra trên cổ tay An
const REVEAL_LINE =
  'Cổ tay mình trong ảnh đeo một cái vòng nhựa trắng. Chữ in mờ: "BV TRUNG HOÀ • 17/05". ... Mình chưa từng đến đó. Đúng không?';

interface PolaroidMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
  /** Gọi khi dừng đúng điểm giao thoa: mở đoạn hồi tưởng */
  onTriggerFlashback?: () => void;
  /** Hồi tưởng đã chiếu xong: hiện ảnh thật */
  flashbackDone?: boolean;
}

/** Tỉ lệ trộn ảnh bệnh viện theo tiêu cự */
const blendOf = (f: number, c: number) => Math.min(1, Math.max(0, (f - (c - 10)) / 20));
const inBandOf = (f: number, c: number) => Math.abs(f - c) <= BAND_HALF;

export const PolaroidMinigame: React.FC<PolaroidMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
  onTriggerFlashback,
  flashbackDone = false,
}) => {
  useUiLayer(true);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sweetRef = useRef<HTMLCanvasElement | null>(null);
  const hospitalRef = useRef<HTMLCanvasElement | null>(null);
  const labelRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [center] = useState(rollCenter);
  const centerRef = useRef(center);
  const focusRef = useRef(12);
  const [focus, setFocus] = useState(12);
  const [phase, setPhaseState] = useState<Phase>('focus');
  const phaseRef = useRef<Phase>('focus');
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const [shake, setShake] = useState(false);
  const holdRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const triggerRef = useRef(onTriggerFlashback);
  useEffect(() => {
    triggerRef.current = onTriggerFlashback;
  }, [onTriggerFlashback]);
  const cbRef = useRef({ onComplete, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onClose };
  }, [onComplete, onClose]);
  // Không có hồi tưởng để xem thì hiện ảnh thật ngay
  const returned = onTriggerFlashback ? flashbackDone : true;

  // ---------------- Âm thanh ----------------
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close().catch(() => {});
      ref.current = null;
    };
  }, []);
  const ac = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current && Ctor) audioRef.current = new Ctor();
      if (audioRef.current?.state === 'suspended') void audioRef.current.resume();
      return audioRef.current;
    } catch {
      return null;
    }
  }, []);
  const vol = volume / 100;
  // Lạch cạch nhẹ của núm vặn ống kính
  const lastTickRef = useRef(0);
  const playTick = useCallback(() => {
    const now = performance.now();
    if (now - lastTickRef.current < 60) return;
    lastTickRef.current = now;
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1300 + Math.random() * 200, t);
    g.gain.setValueAtTime(0.025 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.03);
  }, [ac, vol]);
  // Cú sốc thị giác: rít lên rồi ù tai
  const playShock = useCallback(() => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.9);
    g.gain.setValueAtTime(0.14 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1);
  }, [ac, vol]);

  // ---------------- Vẽ ảnh theo tiêu cự ----------------
  const redraw = useCallback(() => {
    const canvas = photoCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sweet = sweetRef.current;
    const hospital = hospitalRef.current;
    if (!canvas || !ctx || !sweet || !hospital) return;
    const ph = phaseRef.current;
    const f = focusRef.current;
    ctx.globalAlpha = 1;
    if (ph === 'revealed') {
      ctx.drawImage(hospital, 0, 0);
      return;
    }
    const c = centerRef.current;
    const k = blendOf(f, c);
    const inBand = inBandOf(f, c);
    // Lệch tiêu cự: hai lớp ảnh đang chồng dở thì nhoè đôi, chỉ sắc nét đúng điểm khớp
    const blur = inBand || ph === 'interfere' ? 0 : 3;
    ctx.drawImage(sweet, 0, 0);
    if (k > 0) {
      ctx.globalAlpha = k;
      ctx.drawImage(hospital, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (blur > 0 && k > 0 && k < 1) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(canvas, blur, 0);
      ctx.drawImage(canvas, -blur, 0);
      ctx.globalAlpha = 1;
    }
    // Giao thoa: cổ tay An và nhãn vòng nhựa hiện rõ nét giữa hai thực tại
    const r = labelRectRef.current;
    if (r && (inBand || ph === 'interfere')) {
      ctx.drawImage(hospital, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    }
  }, []);
  const redrawRef = useRef(redraw);
  useEffect(() => {
    redrawRef.current = redraw;
  }, [redraw]);

  // Vẽ bức ảnh Polaroid bằng chính đồ hoạ trong game, hai phiên bản cùng bố cục:
  // ảnh gốc (Miên và An trên ghế đá Bến An Yên lúc hoàng hôn) và ảnh thật (An quấn băng trong phòng hồi sức)
  useEffect(() => {
    const canvas = photoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pad = 16;
    const imgW = w - pad * 2;              // 308
    const imgH = h - pad * 2 - 40;         // 288 (40px cho dòng chữ viết tay)
    // Vẽ ở độ phân giải pixel 1/2 rồi phóng 2x cho sắc nét
    const PW = imgW / 2;                   // 154
    const PH = imgH / 2;                   // 144

    const an = new Image();
    an.src = '/assets/an_spritesheet.png';
    const mien = new Image();
    mien.src = '/assets/mien_spritesheet.png';
    let cancelled = false;

    const mk = (cw: number, ch: number) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d');
      if (g) g.imageSmoothingEnabled = false;
      return { c, g };
    };

    // Bố cục chung: ghế đá dài, Miên (trái) và An (phải) ngồi cạnh nhau
    const seatY = 112;
    const benchX = 27;
    const mienX = benchX + 6;
    const anX = benchX + 52;
    const anY = seatY - 50;

    /** Ghép ảnh pixel lên khung giấy Polaroid + dòng chữ viết tay */
    const frame = (photo: HTMLCanvasElement, caption: string, fade: string) => {
      const { c, g } = mk(w, h);
      if (!g) return c;
      g.fillStyle = '#f5f0e6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e2dccf';
      g.fillRect(pad - 1, pad - 1, imgW + 2, imgH + 2);
      g.drawImage(photo, 0, 0, PW, PH, pad, pad, imgW, imgH);
      const vg = g.createRadialGradient(pad + imgW / 2, pad + imgH / 2, imgH * 0.35, pad + imgW / 2, pad + imgH / 2, imgW * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, fade);
      g.fillStyle = vg;
      g.fillRect(pad, pad, imgW, imgH);
      const lora = getComputedStyle(document.body).getPropertyValue('--font-lora').trim();
      g.font = `italic 600 17px ${lora ? `${lora}, ` : ''}Georgia, serif`;
      g.fillStyle = '#3f3a33';
      g.textAlign = 'center';
      g.fillText(caption, w / 2, h - 18);
      return c;
    };

    const render = () => {
      if (cancelled) return;
      const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
      if (!ready(an) || !ready(mien)) return;

      // ---- Ảnh gốc: trời hoàng hôn + sông phía sau, vỉa hè phía trước ----
      const world = mk(BEN_AN_YEN.width, BEN_AN_YEN.height);
      if (!world.g) return;
      drawBenAnYenSunset(world.g, 2.4, { pigeons: false, bridge: false });
      const sweet = mk(PW, PH);
      const g = sweet.g;
      if (!g) return;
      const SPLIT = 96;                         // Ranh giới sông → vỉa hè trong ảnh
      const skyX = BEN_AN_YEN.sun.x - PW / 2;   // Mặt trời ở giữa khung, sau lưng hai người
      g.drawImage(world.c, skyX, BEN_AN_YEN.horizon - 58, PW, SPLIT, 0, 0, PW, SPLIT);
      g.drawImage(world.c, skyX, BEN_AN_YEN.promenadeTop - 4, PW, PH - SPLIT, 0, SPLIT, PW, PH - SPLIT);
      block(g, benchX, seatY - 12, 101, 8, '#a8a29e', '#d6d3d1', '#78716c');
      const seat = (img: HTMLImageElement, x: number) => {
        g.save();
        g.beginPath();
        g.rect(x - 4, 0, 50, seatY + 2);
        g.clip();
        drawSpriteFrame(g, img, 1, 0, false, x, seatY - 50, 42, 63);
        g.restore();
      };
      seat(mien, mienX);
      seat(an, anX);
      block(g, benchX - 2, seatY, 105, 9, '#a8a29e', '#d6d3d1', '#78716c');
      block(g, benchX + 5, seatY + 9, 8, 13, '#57534e', '#78716c', '#3f3a36');
      block(g, benchX + 88, seatY + 9, 8, 13, '#57534e', '#78716c', '#3f3a36');
      // Nắng ấm trong veo + vệt loé sáng ở góc như phim in liền
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = 'rgba(255,205,130,0.55)';
      g.fillRect(0, 0, PW, PH);
      g.globalCompositeOperation = 'screen';
      const leak = g.createLinearGradient(PW, 0, PW * 0.55, PH * 0.5);
      leak.addColorStop(0, 'rgba(255,170,90,0.55)');
      leak.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = leak;
      g.fillRect(0, 0, PW, PH);
      g.restore();

      // ---- Ảnh thật: phòng hồi sức, cùng bố cục. Ghế đá thành giường bệnh, chỗ Miên ngồi trống trơn ----
      const icu = mk(PW, PH);
      const k = icu.g;
      if (!k) return;
      k.fillStyle = '#a7c4c0';
      k.fillRect(0, 0, PW, PH);
      k.fillStyle = '#8fb0ab';
      for (let y = 0; y < PH * 0.72; y += 10) k.fillRect(0, y, PW, 1);
      for (let x = 0; x < PW; x += 12) k.fillRect(x, 0, 1, PH * 0.72);
      k.fillStyle = '#6b8580';
      k.fillRect(0, PH * 0.72, PW, PH * 0.28);
      // Máy đo nhịp tim trên tường
      k.fillStyle = '#1f2937';
      k.fillRect(PW - 40, 12, 32, 20);
      k.fillStyle = '#052e16';
      k.fillRect(PW - 38, 14, 28, 14);
      k.fillStyle = '#4ade80';
      [[0, 6], [4, 6], [6, 2], [8, 10], [10, 6], [16, 6], [18, 3], [20, 9], [22, 6], [27, 6]].forEach(([dx, dy]) => k.fillRect(PW - 37 + dx, 14 + dy, 2, 1));
      // Cọc truyền dịch + túi dịch
      k.fillStyle = '#cbd5e1';
      k.fillRect(PW - 10, 8, 1, PH * 0.72);
      k.fillStyle = 'rgba(226,240,255,0.85)';
      k.fillRect(PW - 14, 10, 7, 11);
      k.fillStyle = '#93c5fd';
      k.fillRect(PW - 13, 15, 5, 5);
      // Giường bệnh (ga trắng) thay cho ghế đá
      const bedY = seatY + 2;
      k.fillStyle = '#e5e7eb';
      k.fillRect(0, bedY - 12, PW, 14);
      k.fillStyle = '#9ca3af';
      k.fillRect(0, bedY + 2, PW, 3);
      // An ngồi trên giường, quấn băng trán
      k.save();
      k.beginPath();
      k.rect(anX - 4, anY - 4, 50, bedY - 12 - anY + 4);
      k.clip();
      drawSpriteFrame(k, an, 1, 0, false, anX, anY, 42, 63);
      k.restore();
      k.fillStyle = '#f8fafc';
      k.fillRect(anX + 11, anY + 12, 21, 3);
      k.fillStyle = '#b91c1c';
      k.fillRect(anX + 25, anY + 12, 3, 2);
      // Vòng tay nhựa bệnh viện trên cổ tay phải (nhãn trắng + vạch đỏ)
      k.fillStyle = '#f1f5f9';
      k.fillRect(anX + 32, anY + 36, 5, 2);
      k.fillStyle = '#dc2626';
      k.fillRect(anX + 34, anY + 36, 1, 2);
      // Chỗ Miên từng ngồi: vài hạt pixel hồng còn sót lại
      for (let i = 0; i < 9; i++) {
        k.fillStyle = i % 2 ? '#f9a8d4' : '#e7e5e4';
        k.fillRect(mienX + 12 + Math.floor(hash(i * 7) * 20), seatY - 44 + Math.floor(hash(i * 3 + 1) * 40), 1, 1);
      }
      // Ánh sáng lạnh, tái nhợt
      k.fillStyle = 'rgba(30,58,80,0.28)';
      k.fillRect(0, 0, PW, PH);

      const sweetFramed = frame(sweet.c, tx('Bến An Yên cùng em'), 'rgba(90,50,10,0.25)');
      const hospitalFramed = frame(icu.c, tx('Bến An Yên cùng em... 17/05'), 'rgba(10,20,30,0.45)');
      // Nhãn vòng tay phóng to, đọc được: chú thích ngay cạnh cổ tay
      const hg = hospitalFramed.getContext('2d');
      if (hg) {
        const wx = pad + (anX + 34) * 2;
        const wy = pad + (anY + 37) * 2;
        const label = tx('BV TRUNG HOÀ • 17/05');
        hg.font = 'bold 10px monospace';
        const tw = hg.measureText(label).width;
        const lx = Math.min(w - pad - tw - 10, wx + 14);
        const ly = wy + 34;
        hg.strokeStyle = 'rgba(220,38,38,0.85)';
        hg.lineWidth = 1;
        hg.beginPath();
        hg.moveTo(wx, wy + 3);
        hg.lineTo(lx + 4, ly - 6);
        hg.stroke();
        hg.fillStyle = '#f8fafc';
        hg.fillRect(lx, ly - 11, tw + 8, 15);
        hg.fillStyle = '#dc2626';
        hg.fillRect(lx, ly - 11, 3, 15);
        hg.fillStyle = '#1f2937';
        hg.fillText(label, lx + 6, ly);
        // Vùng nhãn vòng tay + cổ tay: ở điểm giao thoa vùng này hiện rõ nét
        labelRectRef.current = { x: Math.max(0, wx - 14), y: Math.max(0, wy - 14), w: lx + tw + 12 - (wx - 14), h: ly + 8 - (wy - 14) };
      }
      sweetRef.current = sweetFramed;
      hospitalRef.current = hospitalFramed;
      redrawRef.current();
    };

    an.onload = render;
    mien.onload = render;
    render();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- Vặn núm tiêu cự ----------------
  const turn = useCallback((delta: number) => {
    if (phaseRef.current !== 'focus' || delta === 0) return;
    focusRef.current = Math.max(0, Math.min(100, focusRef.current + delta));
    holdRef.current = 0;
    setFocus(focusRef.current);
    playTick();
    redrawRef.current();
  }, [playTick]);

  // Dừng đúng vùng giao thoa đủ lâu → ảnh rung giật, mở hồi tưởng
  const interfere = useCallback(() => {
    setPhase('interfere');
    setShake(true);
    playShock();
    redrawRef.current();
    window.setTimeout(() => {
      setShake(false);
      setPhase('away');
      triggerRef.current?.();
    }, SHAKE_MS);
  }, [playShock, setPhase]);

  // Hồi tưởng xong (hoặc không có hồi tưởng): ảnh thật hiện hẳn
  useEffect(() => {
    if (phase !== 'away' || !returned) return;
    const id = window.setTimeout(() => {
      setPhase('revealed');
      redrawRef.current();
    }, 200);
    return () => window.clearTimeout(id);
  }, [phase, returned, setPhase]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      let d = 0;
      if (keys.has('d') || keys.has('arrowright') || keys.has('arrowup')) d += KEY_RATE * dt;
      if (keys.has('a') || keys.has('arrowleft') || keys.has('arrowdown')) d -= KEY_RATE * dt;
      if (d !== 0) turn(d);
      const f = focusRef.current;
      if (phaseRef.current === 'focus' && d === 0 && dragRef.current === null && inBandOf(f, centerRef.current)) {
        holdRef.current += dt;
        if (holdRef.current >= HOLD_S) interfere();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [interfere, turn]);

  // ---------------- Chuột / bàn phím ----------------
  const onKnobDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    void ac();
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onKnobMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Kéo lên hoặc sang phải là tăng tiêu cự
    turn(((e.clientX - d.x) - (e.clientY - d.y)) * DRAG_RATE);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onKnobUp = () => {
    dragRef.current = null;
  };
  const knobRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      void ac();
      turn(-Math.sign(e.deltaY) * WHEEL_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ac, turn]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        // Chưa khớp tiêu cự: thoát, không tính là xong. Đã lộ vòng tay: coi như cất ảnh (đã giải xong)
        if (phaseRef.current === 'focus') cbRef.current.onClose();
        else if (phaseRef.current === 'revealed') cbRef.current.onComplete();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if ((k === ' ' || k === 'enter') && phaseRef.current === 'revealed') {
        cbRef.current.onComplete();
        return;
      }
      keysRef.current.add(k);
      void ac();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [ac]);

  const inBand = inBandOf(focus, center);
  const angle = -135 + (focus / 100) * 270;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 font-mono select-none overflow-y-auto">
      <style>{'@keyframes pol-shake{0%,100%{transform:translate(0,0) rotate(0)}20%{transform:translate(-5px,2px) rotate(-1deg)}40%{transform:translate(4px,-3px) rotate(1deg)}60%{transform:translate(-3px,-1px)}80%{transform:translate(3px,2px)}}'}</style>
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('Bức Ảnh Kỷ Niệm • Ghế Đá Hoàng Hôn')}</div>
          <div className="text-xs text-zinc-500 tabular-nums">{tx('Tiêu cự')} {Math.round(focus)}%</div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Tấm ảnh Polaroid trên bàn gỗ */}
          <div
            className="relative w-[300px] max-w-full aspect-340/360 border border-zinc-700 bg-black shrink-0"
            style={shake ? { animation: 'pol-shake 0.12s linear infinite' } : undefined}
          >
            <canvas ref={photoCanvasRef} width={W} height={H} className="absolute inset-0 block w-full h-full" />
          </div>
          {/* Núm "Tiêu Cự Ký Ức" */}
          <div className="flex flex-col items-center gap-2">
            <div
              ref={knobRef}
              onPointerDown={onKnobDown}
              onPointerMove={onKnobMove}
              onPointerUp={onKnobUp}
              onPointerCancel={onKnobUp}
              className="relative w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-600 cursor-grab active:cursor-grabbing touch-none"
              style={{ transform: `rotate(${angle}deg)` }}
              title={tx('Kéo hoặc lăn chuột để vặn tiêu cự')}
            >
              <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-1.5 h-6 bg-zinc-200" />
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="absolute left-1/2 top-1/2 w-0.5 h-2 bg-zinc-500" style={{ transform: `rotate(${i * 30}deg) translateY(-44px)` }} />
              ))}
            </div>
            <div className="text-xs text-zinc-400 text-center">{tx('TIÊU CỰ KÝ ỨC')}</div>
            <div className="w-24 h-1.5 bg-zinc-800 relative">
              <div className="absolute inset-y-0 left-0 bg-zinc-400" style={{ width: `${focus}%` }} />
            </div>
          </div>
        </div>

        <div className={`text-sm leading-relaxed min-h-10 ${phase === 'revealed' ? 'text-zinc-100' : phase === 'interfere' ? 'text-red-400' : 'text-zinc-300'}`}>
          {phase === 'revealed' ? (
            <><span className="text-emerald-400 font-bold">An: </span><span className="italic">{tx(REVEAL_LINE)}</span></>
          ) : phase === 'interfere' || phase === 'away' ? (
            tx('Hai thực tại chồng khít lên nhau. Tay Miên bên hoàng hôn đang nắm lấy cổ tay mình bên giường bệnh...')
          ) : inBand ? (
            tx('Khoan... ngay giữa hai lớp ảnh, trên cổ tay mình có thứ gì đó hiện rõ dần.')
          ) : focus < 40 ? (
            tx('Bến An Yên chiều tà. Miên cười híp mắt bên cạnh mình. Tấm ảnh này... hình như còn một lớp nữa bên dưới.')
          ) : focus > 60 ? (
            tx('Hoàng hôn tan đi. Một căn phòng trắng lạnh, mình nằm đó, đầu quấn băng.')
          ) : (
            tx('Hai cảnh chồng nhoè lên nhau, chưa khớp.')
          )}
        </div>

        {phase === 'revealed' && (
          <button
            onClick={() => cbRef.current.onComplete()}
            className="w-full py-2 text-sm font-bold text-zinc-100 bg-zinc-800 border border-zinc-600 hover:bg-zinc-700 cursor-pointer"
          >
            {tx('[ CẤT BỨC ẢNH VÀO TÚI ]')}
          </button>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>{tx('Kéo núm')}</Key><Key>{tx('Lăn chuột')}</Key><Key>A</Key><Key>D</Key>{tx('Vặn tiêu cự')}</span>
          <span><Key>Esc</Key>{tx('Thoát')}</span>
        </div>
      </div>
    </div>
  );
};

/** Ô phím bấm trong dòng hướng dẫn */
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block min-w-6 px-1.5 py-0.5 mr-1 text-center text-zinc-100 bg-zinc-800 border border-zinc-600">{children}</span>
);
