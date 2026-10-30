"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { block, hash } from '../pixel/pixelKit';
import { drawSpriteFrame } from '../pixel/spriteKit';
import { drawBenAnYenSunset, BEN_AN_YEN } from '../SunsetStage';
import { tx } from '../../locales/tx';

// Lau sạch quá ngưỡng này thì lớp bụi còn lại tự tan
const REVEAL_PERCENT = 60;
const BRUSH_RADIUS = 30;
// Ảnh đẹp đứng yên bao lâu trước khi kéo người chơi vào hồi tưởng
const HOLD_MS = 2000;
// Thời gian ảnh rỉ hạt pixel, biến thành ảnh bệnh viện
const CORRUPT_MS = 3400;
const BLOCK = 6;
// Chi tiết lộ ra trên cổ tay An ở nửa ảnh phòng hồi sức
const REVEAL_LINE =
  'Cổ tay mình trong ảnh đeo một cái vòng nhựa trắng. Chữ in mờ: "BV TRUNG HOÀ • 17/05". ... Mình chưa từng đến đó. Đúng không?';

/**
 * dust    : đang lau bụi
 * clear   : ảnh gốc hiện lên trong veo (giữ HOLD_MS, chuông reo)
 * away    : đang xem hồi tưởng; khi trở về (flashbackDone) ảnh bắt đầu rỉ pixel
 * revealed: ảnh đã biến thành An quấn băng trong bệnh viện
 */
type Phase = 'dust' | 'clear' | 'away' | 'revealed';

interface PolaroidMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
  /** Gọi sau khi ảnh đẹp đứng yên 2 giây: mở đoạn hồi tưởng */
  onTriggerFlashback?: () => void;
  /** Hồi tưởng đã chiếu xong: ảnh bắt đầu biến dạng */
  flashbackDone?: boolean;
}

export const PolaroidMinigame: React.FC<PolaroidMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
  onTriggerFlashback,
  flashbackDone = false,
}) => {
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dustCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Hai phiên bản của cùng một tấm ảnh (dựng sẵn, khung 340x360)
  const sweetRef = useRef<HTMLCanvasElement | null>(null);
  const hospitalRef = useRef<HTMLCanvasElement | null>(null);

  const [cleanedPercent, setCleanedPercent] = useState(0);
  const [phase, setPhase] = useState<Phase>('dust');
  const phaseRef = useRef<Phase>('dust');
  const isInteractingRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef(onTriggerFlashback);
  useEffect(() => {
    triggerRef.current = onTriggerFlashback;
  }, [onTriggerFlashback]);
  // Không có hồi tưởng để xem thì biến dạng ngay sau khi giữ ảnh
  const returned = onTriggerFlashback ? flashbackDone : true;
  const corrupting = phase === 'away' && returned;
  const revealed = phase !== 'dust';

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Tiếng chà xát / lau bụi (white noise có filter dải thông)
  const playWipeSound = useCallback(() => {
    if (volume <= 0) return;
    const now = performance.now();
    if (now - lastSoundTimeRef.current < 80) return; // Debounce
    lastSoundTimeRef.current = now;

    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 + Math.random() * 400, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime((volume / 100) * 0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng sốc thị giác (rùng mình / tiếng ù tai chói lòa)
  const playShockSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.8);

      g.gain.setValueAtTime((volume / 100) * 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.9);
    } catch {}
  }, [getAudioContext, volume]);

  // Chuông reo hoài niệm: chuỗi celesta đi lên, ngân dài
  const playNostalgiaChime = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + 0.05;
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => {
        for (const [mul, amp] of [[1, 0.05], [4, 0.008]] as const) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f * mul;
          const at = t + i * 0.16;
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime((volume / 100) * amp, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(at);
          osc.stop(at + 1.85);
        }
      });
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng ảnh mục rữa: lạo xạo như phim cháy, nhỏ dần
  const playCrackleSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const len = Math.floor(ctx.sampleRate * (CORRUPT_MS / 1000));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() < 0.004 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.05;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime((volume / 100) * 0.35, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + CORRUPT_MS / 1000);
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch {}
  }, [getAudioContext, volume]);

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
        k.fillStyle = i % 2 ? '#f9a8d4' : '#c4b5fd';
        k.fillRect(mienX + 12 + Math.floor(hash(i * 7) * 20), seatY - 44 + Math.floor(hash(i * 3 + 1) * 40), 1, 1);
      }
      // Ánh sáng lạnh, tái nhợt
      k.fillStyle = 'rgba(30,58,80,0.28)';
      k.fillRect(0, 0, PW, PH);

      const sweetFramed = frame(sweet.c, tx('Bến An Yên cùng em ♡'), 'rgba(90,50,10,0.25)');
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
      }
      sweetRef.current = sweetFramed;
      hospitalRef.current = hospitalFramed;
      // Bên dưới lớp bụi luôn là ảnh gốc (ảnh thật chỉ lộ ra sau hồi tưởng)
      if (phaseRef.current !== 'revealed') ctx.drawImage(sweetFramed, 0, 0);
      else ctx.drawImage(hospitalFramed, 0, 0);
    };

    an.onload = render;
    mien.onload = render;
    render();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ảnh rỉ hạt pixel: từng ô nhỏ chảy xuống rồi để lộ ảnh bệnh viện bên dưới
  useEffect(() => {
    if (!corrupting) return;
    const canvas = photoCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sweet = sweetRef.current;
    const hospital = hospitalRef.current;
    if (!canvas || !ctx || !sweet || !hospital) return;
    playShockSound();
    playCrackleSound();
    const cols = Math.ceil(canvas.width / BLOCK);
    const rows = Math.ceil(canvas.height / BLOCK);
    // Ngưỡng mục rữa từng ô: ngẫu nhiên, thiên về phía trên trước (như màu đang chảy xuống)
    const th = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) th[r * cols + c] = 0.6 * hash(c * 7 + r * 131) + 0.32 * (r / rows);
    }
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const k = Math.min(1, (now - start) / CORRUPT_MS);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sweet, 0, 0);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = (k * 1.08 - th[r * cols + c]) / 0.14;
          if (p <= 0) continue;
          const x = c * BLOCK;
          const y = r * BLOCK;
          if (p >= 1) {
            ctx.drawImage(hospital, x, y, BLOCK, BLOCK, x, y, BLOCK, BLOCK);
            continue;
          }
          // Đang rỉ: ảnh thật hiện dần, hạt cũ trượt xuống, nhiễm sắc hồng / xanh lơ
          ctx.globalAlpha = p;
          ctx.drawImage(hospital, x, y, BLOCK, BLOCK, x, y, BLOCK, BLOCK);
          ctx.globalAlpha = 1 - p;
          ctx.drawImage(sweet, x, y, BLOCK, BLOCK, x, y + p * 16, BLOCK, BLOCK);
          ctx.globalAlpha = 1;
          if (hash(c * 13 + r * 17) > 0.86) {
            ctx.fillStyle = hash(c + r) > 0.5 ? 'rgba(244,114,182,0.7)' : 'rgba(103,232,249,0.6)';
            ctx.fillRect(x, y + p * 16, BLOCK / 2, BLOCK / 2);
          }
        }
      }
      if (k < 1) {
        raf = requestAnimationFrame(loop);
      } else {
        ctx.drawImage(hospital, 0, 0);
        phaseRef.current = 'revealed';
        setPhase('revealed');
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [corrupting, playShockSound, playCrackleSound]);

  // Lớp bụi tan → ảnh gốc trong veo, chuông reo → 2 giây sau mở hồi tưởng
  const revealPhoto = useCallback(() => {
    if (phaseRef.current !== 'dust') return;
    phaseRef.current = 'clear';
    setPhase('clear');
    setCleanedPercent(100);
    playNostalgiaChime();
    holdTimerRef.current = setTimeout(() => {
      phaseRef.current = 'away';
      setPhase('away');
      triggerRef.current?.();
    }, HOLD_MS);
  }, [playNostalgiaChime]);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  // Khởi tạo Canvas lớp bụi tĩnh điện (Scratch layer)
  useEffect(() => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Lớp bụi tro xám phủ kín: hạt mịn + vệt bụi đóng dày hơn ở mép
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const edge = Math.min(x, y, w - x, h - y) / 60;
        const v = 92 + Math.random() * 46 - Math.max(0, 1 - edge) * 22;
        data[i] = v + 6;
        data[i + 1] = v + 2;
        data[i + 2] = v - 4;
        data[i + 3] = 248;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    // Vài vệt bụi xước ngang
    ctx.strokeStyle = 'rgba(70,64,58,0.35)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      const y0 = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w * 0.3, y0);
      ctx.lineTo(w * (0.5 + Math.random() * 0.5), y0 + (Math.random() - 0.5) * 30);
      ctx.stroke();
    }

    // Dòng chữ hướng dẫn ở giữa lớp bụi
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tx('✦ BỤI THỜI GIAN PHỦ KÍN ✦'), w / 2, h / 2 - 10);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#fbcfe8';
    ctx.fillText(tx('(Dùng chuột hoặc chạm tay để lau sạch)'), w / 2, h / 2 + 12);
  }, []);

  // Tính toán phần trăm diện tích đã được lau sạch (đọc lại cả lớp bụi nên giới hạn ~8 lần/giây)
  const lastCheckRef = useRef(0);
  const checkProgress = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - lastCheckRef.current < 120) return;
    lastCheckRef.current = now;
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let transparentCount = 0;
      const totalPixels = data.length / 4;
      const step = 8; // Lấy mẫu bước nhảy để tối ưu hiệu năng
      for (let i = 3; i < data.length; i += 4 * step) {
        if (data[i] < 60) transparentCount++;
      }
      const percent = Math.min(100, Math.round((transparentCount / (totalPixels / step)) * 100));
      setCleanedPercent(percent);

      if (percent >= REVEAL_PERCENT) revealPhoto();
    } catch {}
  }, [revealPhoto]);

  // Hành vi lau sạch khi di chuyển chuột / ngón tay: cọ mềm (gradient tròn), rải đều trên đường kéo
  const lastWipeRef = useRef<{ x: number; y: number } | null>(null);
  const wipeAt = (clientX: number, clientY: number) => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const from = lastWipeRef.current ?? { x, y };
    lastWipeRef.current = { x, y };

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const dist = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(dist / (BRUSH_RADIUS * 0.35)));
    for (let i = 1; i <= steps; i++) {
      const px = from.x + ((x - from.x) * i) / steps;
      const py = from.y + ((y - from.y) * i) / steps;
      const brush = ctx.createRadialGradient(px, py, 0, px, py, BRUSH_RADIUS);
      brush.addColorStop(0, 'rgba(0,0,0,0.55)');
      brush.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      brush.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = brush;
      ctx.fillRect(px - BRUSH_RADIUS, py - BRUSH_RADIUS, BRUSH_RADIUS * 2, BRUSH_RADIUS * 2);
    }
    ctx.restore();

    playWipeSound();
    checkProgress();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isInteractingRef.current = true;
    lastWipeRef.current = null;
    wipeAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isInteractingRef.current) {
      wipeAt(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = () => {
    isInteractingRef.current = false;
    lastWipeRef.current = null;
    checkProgress(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md font-mono select-none animate-fade-in overflow-y-auto">
      <div
        className={`relative w-full max-w-lg max-h-[94vh] overflow-y-auto bg-zinc-950 border-2 rounded-lg shadow-[0_0_50px_rgba(244,114,182,0.3)] p-4 sm:p-5 transition-all duration-300 ${
          corrupting
            ? 'border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.8)] animate-pulse'
            : phase === 'clear' || phase === 'away'
            ? 'border-amber-400/80 shadow-[0_0_50px_rgba(251,191,36,0.45)]'
            : 'border-fuchsia-800/80'
        }`}
      >
        {/* Tiêu đề & Nút bỏ qua (Đảm bảo không bao giờ rớt chữ xuống dòng) */}
        <div className="flex justify-between items-center pb-2.5 border-b border-fuchsia-900/50 mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 animate-ping inline-block shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-fuchsia-300 uppercase tracking-wider truncate">
              {tx('Bức Ảnh Kỷ Niệm • Ghế Đá Hoàng Hôn')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors shrink-0 cursor-pointer"
          >
            {tx('[ESC] Bỏ qua')}
          </button>
        </div>

        <p className="text-xs text-zinc-300 mb-3 leading-relaxed font-sans text-justify">
          {tx('Tấm ảnh Polaroid đặt trên ghế đá ven sông bị phủ một lớp bụi tro dày, như đã nằm đó rất lâu.')}
          <span className="text-fuchsia-300 font-semibold block mt-0.5">
            {tx('👉 Lau sạch bề mặt bức ảnh để khôi phục lại khoảnh khắc ngày 17/05.')}
          </span>
        </p>

        {/* Khung xếp chồng Canvas Polaroid & Lớp bụi (Tỉ lệ chuẩn ảnh crop 895x950) */}
        <div className="relative mx-auto w-[330px] h-[350px] sm:w-[340px] sm:h-[360px] max-w-full rounded shadow-2xl overflow-hidden border border-zinc-700 bg-black flex items-center justify-center shrink-0">
          {/* Canvas bức ảnh bên dưới */}
          <canvas
            ref={photoCanvasRef}
            width={340}
            height={360}
            className="absolute inset-0 block w-full h-full"
          />

          {/* Canvas lớp bụi phủ bên trên để lau */}
          <canvas
            ref={dustCanvasRef}
            width={340}
            height={360}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`absolute inset-0 block w-full h-full cursor-crosshair touch-none transition-opacity duration-700 ${
              revealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          />
        </div>

        {/* Tiến trình lau sạch */}
        <div className="mt-2.5 flex justify-between items-center text-xs text-zinc-400">
          <span>{tx('Tiến độ làm sạch:')} <strong className="text-fuchsia-400">{cleanedPercent}%</strong></span>
          {!revealed ? (
            <button
              onClick={revealPhoto}
              className="text-[11px] text-fuchsia-400/80 hover:text-fuchsia-300 underline cursor-pointer"
            >
              {tx('[Tự động lau sạch]')}
            </button>
          ) : corrupting ? (
            <span className="text-red-400 font-bold animate-pulse">{tx('BỨC ẢNH ĐANG BIẾN DẠNG...')}</span>
          ) : phase === 'revealed' ? (
            <span className="text-red-400 font-bold">{tx('ĐÃ LAU SẠCH 100%')}</span>
          ) : (
            <span className="text-amber-300 font-bold">{tx('ĐÃ LAU SẠCH 100%')}</span>
          )}
        </div>

        {/* Độc thoại của An khi ảnh thật lộ ra */}
        {phase === 'revealed' && (
          <div className="mt-3 px-3 py-2 bg-black/80 border border-emerald-800/70 rounded text-xs leading-relaxed text-zinc-100 text-justify" style={{ animation: 'polaroid-line-in 1.2s ease-out' }}>
            <style>{'@keyframes polaroid-line-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }'}</style>
            <span className="text-emerald-400 font-bold">An: </span>
            <span className="italic">{tx(REVEAL_LINE)}</span>
          </div>
        )}

        {/* NÚT HOÀN TẤT KHI ẢNH ĐÃ BIẾN DẠNG XONG */}
        {phase === 'revealed' && (
          <button
            onClick={onComplete}
            className="w-full mt-3.5 py-2.5 px-4 bg-gradient-to-r from-red-800 via-rose-900 to-zinc-900 hover:from-red-700 hover:to-rose-800 active:scale-98 text-white font-bold text-xs sm:text-sm rounded border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse transition-all cursor-pointer flex items-center justify-center gap-2 tracking-wider"
          >
            <span>📸</span>
            <span>{tx('[ CẤT BỨC ẢNH VÀO TÚI ]')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
