"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface DiskRestoreMinigameProps {
  /** Đĩa đã phục chế xong (2 nửa → Đĩa Mềm Kỷ Niệm Hoàn Chỉnh) */
  onComplete: () => void;
  /** Hơ lửa quá lâu làm phim từ cong vênh: trừ Sanity */
  onWarp: () => void;
  onClose: () => void;
  volume?: number;
}

/**
 * PHỤC CHẾ ĐĨA MỀM 1.44MB BỊ NỨT (Màn 1) — bàn làm việc trên tấm thớt cắt giấy
 * scrape : cầm dao rọc giấy kéo dọc vết nứt, cạo sạch ba-via nhựa vỡ
 * align  : lăn chuột (hoặc A/D) xoay nửa phim từ bên phải cho vết xước Track 0 liền mạch với nửa trái
 * tape   : bấm dán 2 dải băng dính ngang vết nứt, rồi giữ chuột hơ bật lửa từng dải 1.2–2.5 giây
 *          (quá 2.5 giây: phim từ cong vênh → mất dải băng đó, phải căn lại Track 0)
 * protect: kéo lẫy chống ghi góc dưới trái xuống vị trí Read-Only
 * done   : đĩa liền, sẵn sàng đút vào ổ A:
 */
type Step = 'scrape' | 'align' | 'tape' | 'protect' | 'done';

const W = 480;
const H = 300;
const DISK = { x: 150, y: 57, w: 180, h: 186 };
const CENTER = { x: 240, y: 150 };
const FILM_R = 64;
// Vết nứt vát xéo chạy từ mép trên xuống mép dưới vỏ đĩa
const CRACK_A = { x: 207, y: DISK.y };
const CRACK_B = { x: 273, y: DISK.y + DISK.h };
const BURR_COUNT = 14;
const SCRAPE_R = 10;
const ALIGN_TOL = 0.6;          // Độ lệch cho phép (độ) để coi là khớp 100%
const ALIGN_HOLD_S = 0.8;       // Giữ khớp bao lâu thì khoá
const WHEEL_STEP = 1;           // Độ / nấc lăn chuột
const FINE_RATE = 6;            // Độ / giây khi giữ A/D
const HEAT_MIN = 1.2;
const HEAT_MAX = 2.5;
// Hai dải băng dính vắt ngang vết nứt, gần mép trên và mép dưới vỏ
const TAPE_Y = [78, 222];
const TAPE_HALF_W = 32;
const TAPE_H = 14;
// Lẫy chống ghi (write-protect) góc dưới trái
const WP = { x: 160, y: 214, w: 12, h: 18 };

/** Toạ độ x của vết nứt tại độ cao y */
const crackX = (y: number) => CRACK_A.x + ((y - CRACK_A.y) / (CRACK_B.y - CRACK_A.y)) * (CRACK_B.x - CRACK_A.x);

/** Ba-via nham nhở dọc vết nứt */
const makeBurrs = () =>
  Array.from({ length: BURR_COUNT }, (_, i) => {
    const y = DISK.y + 8 + ((DISK.h - 16) * (i + 0.5)) / BURR_COUNT;
    // Lệch giả ngẫu nhiên cố định (không gọi Math.random lúc render)
    const j = (k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5;
    return { x: crackX(y) + (i % 2 ? 4 : -4) + j(1) * 3, y: y + j(2) * 4, size: 4.5 + j(3) * 3, gone: false };
  });

/** Ô phím bấm trong dòng hướng dẫn */
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block min-w-6 px-1.5 py-0.5 mr-1 text-center text-zinc-100 bg-zinc-800 border border-zinc-600">{children}</span>
);

export const DiskRestoreMinigame: React.FC<DiskRestoreMinigameProps> = ({ onComplete, onWarp, onClose, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [step, setStepState] = useState<Step>('scrape');
  const stepRef = useRef<Step>('scrape');
  const setStep = useCallback((s: Step) => {
    stepRef.current = s;
    setStepState(s);
  }, []);
  const [note, setNote] = useState<{ step: Step; text: string } | null>(null);
  const say = useCallback((text: string) => setNote({ step: stepRef.current, text }), []);
  // Số liệu cho HUD (cập nhật ~15 lần/giây)
  const [hud, setHud] = useState({ burrsLeft: BURR_COUNT, align: 0, heat: [0, 0], taped: [false, false], sealed: [false, false] });

  // Trạng thái mô phỏng trong ref (vòng lặp vẽ không khởi động lại)
  const sim = useRef({
    burrs: makeBurrs(),
    angle: 37, // Nửa phim phải lệch tâm lúc đầu
    alignHold: 0,
    taped: [false, false],
    sealed: [false, false],
    heat: [0, 0],
    heating: -1,               // Đang hơ dải nào (-1: không)
    wpPos: 0,                  // 0 = đóng (R/W), 1 = mở (Read-Only)
    wpDrag: false,
    pointer: { x: -100, y: -100, down: false },
    lastScrape: 0,
    doneAt: -1,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const cbRef = useRef({ onComplete, onWarp, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onWarp, onClose };
  }, [onComplete, onWarp, onClose]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

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
  const noise = useCallback((dur: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0) => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain * vol;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  }, [ac, vol]);
  const tick = useCallback((f = 1800, gain = 0.08) => {
    const ctx = ac();
    if (!ctx || vol <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.05);
  }, [ac, vol]);
  const playScrape = useCallback(() => noise(0.06, 3500, 0.25), [noise]);
  const playTape = useCallback(() => noise(0.35, 1400, 0.3), [noise]);
  const playFlick = useCallback(() => {
    noise(0.03, 4000, 0.4, 'highpass');
    noise(0.18, 900, 0.15, 'lowpass', 0.04);
  }, [noise]);
  const playHiss = useCallback(() => noise(0.12, 700, 0.06, 'lowpass'), [noise]);
  const playWarp = useCallback(() => {
    noise(0.5, 300, 0.3, 'lowpass');
    tick(120, 0.12);
  }, [noise, tick]);
  const playLock = useCallback(() => {
    tick(1200, 0.1);
    noise(0.05, 2200, 0.2, 'highpass', 0.02);
  }, [noise, tick]);

  // ---------------- Chuột ----------------
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const inTapeZone = (x: number, y: number, i: number) =>
    Math.abs(y - TAPE_Y[i]) <= TAPE_H / 2 + 3 && Math.abs(x - crackX(TAPE_Y[i])) <= TAPE_HALF_W;

  const releaseHeat = useCallback(() => {
    const s = sim.current;
    const i = s.heating;
    if (i < 0) return;
    s.heating = -1;
    const h = s.heat[i];
    if (h >= HEAT_MIN && h < HEAT_MAX) {
      s.sealed[i] = true;
      playLock();
      say(s.sealed.every(Boolean) ? 'Keo co lại ôm khít mép vỏ. Hai nửa đĩa không còn xộc xệch nữa.' : 'Mép keo co lại, bám chặt. Còn dải kia.');
      if (s.sealed.every(Boolean)) timersRef.current.push(setTimeout(() => setStep('protect'), 700));
    } else if (h > 0.05) {
      s.heat[i] = 0;
      say('Hơ chưa đủ nóng, mép keo vẫn còn bong. Hơ lại lâu hơn một chút.');
    }
  }, [playLock, say, setStep]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    void ac();
    const p = toCanvas(e);
    const s = sim.current;
    s.pointer = { ...p, down: true };
    const st = stepRef.current;
    if (st === 'tape') {
      for (let i = 0; i < 2; i++) {
        if (!inTapeZone(p.x, p.y, i)) continue;
        if (!s.taped[i]) {
          s.taped[i] = true;
          playTape();
          say(s.taped.every(Boolean) ? 'Hai dải băng dính đã gá. Giờ hơ bật lửa lướt qua từng dải cho keo co lại.' : 'Dán xong một dải. Còn dải kia.');
        } else if (!s.sealed[i]) {
          s.heating = i;
          s.heat[i] = 0;
          playFlick();
        }
        return;
      }
    }
    if (st === 'protect') {
      if (p.x >= WP.x - 6 && p.x <= WP.x + WP.w + 6 && p.y >= WP.y - 6 && p.y <= WP.y + WP.h + 6) s.wpDrag = true;
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    const s = sim.current;
    const prev = s.pointer;
    s.pointer = { ...p, down: prev.down };
    if (stepRef.current === 'protect' && s.wpDrag) {
      s.wpPos = Math.max(0, Math.min(1, s.wpPos + (p.y - prev.y) / (WP.h * 0.5)));
    }
  };
  const onPointerUp = () => {
    const s = sim.current;
    s.pointer.down = false;
    s.wpDrag = false;
    releaseHeat();
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (stepRef.current !== 'align') return;
    const s = sim.current;
    s.angle += Math.sign(e.deltaY) * WHEEL_STEP;
    tick(1500 + Math.random() * 200, 0.05);
  };

  // Chặn cuộn trang khi lăn chuột trên bàn làm việc
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    c.addEventListener('wheel', stop, { passive: false });
    return () => c.removeEventListener('wheel', stop);
  }, []);

  // Bàn phím: Esc thoát; A/D xoay mịn ở bước căn Track 0
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      e.stopPropagation();
      if (k === 'escape') {
        e.preventDefault();
        if (stepRef.current !== 'done') cbRef.current.onClose();
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'i', 'tab', ' ', 'enter', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
      keysRef.current.add(k);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);

  // ---------------- Vòng lặp ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let hudT = 0;
    let hissT = 0;

    // Cắt vùng bên trái / phải vết nứt (kéo dài đường nứt ra ngoài khung)
    const sidePath = (left: boolean) => {
      const dx = CRACK_B.x - CRACK_A.x;
      const dy = CRACK_B.y - CRACK_A.y;
      const top = { x: CRACK_A.x - (dx / dy) * 200, y: CRACK_A.y - 200 };
      const bot = { x: CRACK_B.x + (dx / dy) * 200, y: CRACK_B.y + 200 };
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bot.x, bot.y);
      const edge = left ? -400 : W + 400;
      ctx.lineTo(edge, bot.y);
      ctx.lineTo(edge, top.y);
      ctx.closePath();
    };

    // Phim từ nâu: vòng rãnh đồng tâm + 5 vết xước thẳng song song (dấu Track 0) + vạch chỉ mục
    const drawFilm = (rot: number) => {
      ctx.save();
      ctx.translate(CENTER.x, CENTER.y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.fillStyle = '#5b3418';
      ctx.beginPath();
      ctx.arc(0, 0, FILM_R, 0, Math.PI * 2);
      ctx.fill();
      for (let r = 18; r < FILM_R; r += 5) {
        ctx.strokeStyle = r % 2 ? 'rgba(140,90,50,0.35)' : 'rgba(40,20,8,0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(214,180,140,0.55)';
      ctx.lineWidth = 1.2;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(-FILM_R, k * 11 - 18);
        ctx.lineTo(FILM_R, k * 11 + 10);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // Vạch Track 0
      ctx.fillStyle = '#e7d8b8';
      ctx.fillRect(FILM_R - 12, -1, 10, 2);
      ctx.fillRect(-FILM_R + 2, -1, 10, 2);
      // Lõi kim loại giữa đĩa
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillRect(4, -8, 4, 6);
      ctx.restore();
    };

    const step = (dt: number) => {
      const s = sim.current;
      const st = stepRef.current;
      const keys = keysRef.current;
      if (st === 'scrape' && s.pointer.down) {
        let removed = 0;
        for (const b of s.burrs) {
          if (!b.gone && Math.hypot(b.x - s.pointer.x, b.y - s.pointer.y) < SCRAPE_R) {
            b.gone = true;
            removed++;
          }
        }
        if (removed && performance.now() - s.lastScrape > 50) {
          s.lastScrape = performance.now();
          playScrape();
        }
        if (s.burrs.every((b) => b.gone)) {
          say('Vết nứt đã nhẵn. Giờ hai nửa phim từ phải khớp rãnh với nhau.');
          setStep('align');
        }
      }
      if (st === 'align') {
        if (keys.has('a') || keys.has('arrowleft')) s.angle -= FINE_RATE * dt;
        if (keys.has('d') || keys.has('arrowright')) s.angle += FINE_RATE * dt;
        if (Math.abs(s.angle) <= ALIGN_TOL) {
          s.alignHold += dt;
          if (s.alignHold >= ALIGN_HOLD_S) {
            s.angle = 0;
            s.alignHold = 0;
            playLock();
            say(s.taped.some(Boolean) ? 'Rãnh Track 0 liền lại. Dán lại phần băng bị hỏng.' : 'Khớp! Vết xước hai bên liền thành một đường. Giữ nguyên, dán cố định vỏ lại.');
            setStep('tape');
          }
        } else {
          s.alignHold = 0;
        }
      }
      if (st === 'tape' && s.heating >= 0) {
        const i = s.heating;
        if (s.pointer.down && inTapeZone(s.pointer.x, s.pointer.y, i)) {
          s.heat[i] += dt;
          hissT += dt;
          if (hissT > 0.12) {
            hissT = 0;
            playHiss();
          }
          if (s.heat[i] >= HEAT_MAX) {
            // Hơ quá lâu: phim từ cong vênh, dải băng chảy nhão → bóc ra, căn lại Track 0
            s.heating = -1;
            s.heat[i] = 0;
            s.taped[i] = false;
            s.sealed[i] = false;
            s.angle = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8);
            playWarp();
            say('Nóng quá! Mùi nhựa khét, phim từ bên trong cong vênh lệch hẳn đi. Phải bóc dải băng ra, căn lại rãnh.');
            cbRef.current.onWarp();
            setStep('align');
          }
        }
      }
      if (st === 'protect' && s.wpPos >= 0.85 && !s.wpDrag) {
        s.wpPos = 1;
        playLock();
        say('Tách. Lẫy chống ghi đã mở: READ-ONLY. Ổ đĩa sẽ không ghi đè lên kỷ niệm nào nữa.');
        setStep('done');
        s.doneAt = performance.now();
        timersRef.current.push(setTimeout(() => cbRef.current.onComplete(), 1900));
      }
    };

    const draw = (t: number) => {
      const s = sim.current;
      const st = stepRef.current;
      // Tấm thớt cắt giấy xanh rêu có lưới
      ctx.fillStyle = '#1f3b2d';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(180,220,190,0.12)';
      for (let x = 0; x < W; x += 20) ctx.fillRect(x, 0, 1, H);
      for (let y = 0; y < H; y += 20) ctx.fillRect(0, y, W, 1);
      ctx.fillStyle = 'rgba(180,220,190,0.25)';
      for (let x = 0; x < W; x += 100) ctx.fillRect(x, 0, 1, H);
      // Vỏ đĩa đen + bóng
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(DISK.x + 5, DISK.y + 6, DISK.w, DISK.h);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(DISK.x, DISK.y, DISK.w, DISK.h);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(DISK.x, DISK.y, DISK.w, 3);
      // Nắp trượt kim loại phía trên
      ctx.fillStyle = '#a1a1aa';
      ctx.fillRect(DISK.x + 50, DISK.y, 80, 44);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(DISK.x + 96, DISK.y + 8, 16, 30);
      // Nhãn giấy của Miên
      ctx.fillStyle = '#e5e1d6';
      ctx.fillRect(DISK.x + 20, DISK.y + DISK.h - 52, DISK.w - 40, 42);
      ctx.fillStyle = '#3f3f46';
      ctx.font = '9px monospace';
      ctx.fillText(tx('Kỷ niệm của chúng mình'), DISK.x + 28, DISK.y + DISK.h - 30);
      // Phim từ lộ qua khoang vỏ vỡ: nửa trái cố định, nửa phải xoay theo góc lệch
      ctx.save();
      sidePath(true);
      ctx.clip();
      drawFilm(0);
      ctx.restore();
      ctx.save();
      sidePath(false);
      ctx.clip();
      drawFilm(st === 'align' || st === 'scrape' ? s.angle : 0);
      ctx.restore();
      // Khớp gần đúng: vạch từ tính mờ sáng dọc Track 0
      if (st === 'align' && Math.abs(s.angle) <= ALIGN_TOL * 2) {
        ctx.strokeStyle = `rgba(190,230,255,${0.25 + (1 - Math.abs(s.angle) / (ALIGN_TOL * 2)) * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(CENTER.x - FILM_R, CENTER.y);
        ctx.lineTo(CENTER.x + FILM_R, CENTER.y);
        ctx.stroke();
      }
      // Vết nứt
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const y = CRACK_A.y + ((CRACK_B.y - CRACK_A.y) * i) / 20;
        const x = crackX(y) + (i % 2 ? 1.5 : -1.5);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      // Ba-via nhựa vỡ
      for (const b of s.burrs) {
        if (b.gone) continue;
        ctx.fillStyle = '#71717a';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - b.size);
        ctx.lineTo(b.x + b.size, b.y + b.size * 0.6);
        ctx.lineTo(b.x - b.size * 0.7, b.y + b.size * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a1a1aa';
        ctx.fillRect(b.x - 1, b.y - 1, 2, 1);
      }
      // Dải băng dính + vùng dán
      for (let i = 0; i < 2; i++) {
        const cx = crackX(TAPE_Y[i]);
        const x0 = cx - TAPE_HALF_W;
        const y0 = TAPE_Y[i] - TAPE_H / 2;
        if (s.taped[i]) {
          ctx.fillStyle = s.sealed[i] ? '#0c0c0e' : '#232327';
          ctx.fillRect(x0, y0, TAPE_HALF_W * 2, TAPE_H);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x0, y0 + 2, TAPE_HALF_W * 2, 1);
          // Mép keo co nhiệt: nhăn nhẹ
          if (s.sealed[i]) for (let k = 0; k < 6; k++) ctx.fillRect(x0 + 6 + k * 10, y0 + TAPE_H - 3, 4, 1);
          // Đang hơ: vạch nhiệt đỏ dần
          if (s.heating === i) {
            const k = Math.min(1, s.heat[i] / HEAT_MAX);
            ctx.fillStyle = `rgba(239,${Math.round(120 - k * 90)},40,${0.25 + k * 0.4})`;
            ctx.fillRect(x0, y0, TAPE_HALF_W * 2, TAPE_H);
          }
        } else if (st === 'tape') {
          ctx.strokeStyle = 'rgba(250,204,21,0.8)';
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, TAPE_HALF_W * 2, TAPE_H);
          ctx.setLineDash([]);
        }
      }
      // Lẫy chống ghi: khe vuông + nút trượt
      ctx.fillStyle = '#050505';
      ctx.fillRect(WP.x, WP.y, WP.w, WP.h);
      const knobY = WP.y + 1 + s.wpPos * (WP.h / 2 - 1);
      ctx.fillStyle = '#52525b';
      ctx.fillRect(WP.x + 1, knobY, WP.w - 2, WP.h / 2 - 1);
      if (st === 'protect') {
        ctx.strokeStyle = 'rgba(250,204,21,0.8)';
        ctx.strokeRect(WP.x - 2.5, WP.y - 2.5, WP.w + 5, WP.h + 5);
      }
      ctx.font = '8px monospace';
      ctx.fillStyle = s.wpPos >= 1 ? '#86efac' : '#a1a1aa';
      ctx.fillText(s.wpPos >= 1 ? 'READ-ONLY' : 'R/W', WP.x + WP.w + 5, WP.y + 12);

      // Dụng cụ ở con trỏ: dao rọc giấy (cạo) / ngọn lửa bật lửa (hơ)
      const p = s.pointer;
      if (st === 'scrape' && p.x > 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(-0.7);
        ctx.fillStyle = '#d4d4d8';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(10, -3);
        ctx.lineTo(10, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(10, -4, 34, 8);
        ctx.restore();
      }
      // Bước dán & hơ: bật lửa Zippo luôn bám theo chuột; chỉ bùng lửa khi đang giữ chuột hơ
      if (st === 'tape' && p.x > 0) {
        if (s.heating >= 0 && p.down) {
          const fl = 1 + Math.sin(t * 40) * 0.15;
          ctx.fillStyle = 'rgba(253,186,116,0.9)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - 8 * fl, 4, 9 * fl, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(96,165,250,0.85)';
          ctx.fillRect(p.x - 2, p.y - 2, 4, 3);
        } else {
          // Chấm ngắm nhỏ ở đầu bật lửa để biết đang trỏ vào đâu
          ctx.fillStyle = '#fde68a';
          ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
        }
        ctx.fillStyle = '#a1a1aa';
        ctx.fillRect(p.x - 6, p.y + 2, 12, 16);
        ctx.fillStyle = '#d4d4d8';
        ctx.fillRect(p.x - 6, p.y + 2, 12, 4);
        ctx.fillStyle = '#52525b';
        ctx.fillRect(p.x - 6, p.y + 6, 12, 1);
      }
      if (st === 'done') {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(DISK.x, DISK.y, DISK.w, DISK.h);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw(now / 1000);
      hudT += dt;
      if (hudT > 0.066) {
        hudT = 0;
        const s = sim.current;
        setHud({
          burrsLeft: s.burrs.filter((b) => !b.gone).length,
          align: Math.max(0, Math.round(100 - Math.abs(s.angle) * 2.2)),
          heat: [...s.heat],
          taped: [...s.taped],
          sealed: [...s.sealed],
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playHiss, playLock, playScrape, playWarp, say, setStep]);

  const intro: Record<Step, string> = {
    scrape: 'Hai nửa vỏ đĩa gãy vát xéo, mép nứt lởm chởm mạt nhựa. Còn để thế này đĩa sẽ kẹt không quay được.',
    align: 'Nửa phim từ bên phải bị lệch tâm. Vết xước Track 0 hai bên phải liền thành một đường.',
    tape: 'Gá hai dải băng dính ngang vết nứt, rồi hơ bật lửa cho mép keo co lại.',
    protect: 'Lẫy chống ghi ở góc dưới đang đóng. Ổ đĩa mà ghi đè lên thì mất sạch.',
    done: 'Xong. Đĩa liền lại, sẵn sàng cho vào ổ A:.',
  };
  const message = note && note.step === step && step !== 'done' ? note.text : intro[step];
  const task: Record<Step, string> = {
    scrape: tx('Giữ chuột và kéo dao dọc theo vết nứt để cạo hết ba-via. Còn {0}.', hud.burrsLeft),
    align: tx('Lăn chuột (hoặc giữ A/D để chỉnh mịn) xoay nửa phim bên phải cho các vết xước khớp với bên trái. Độ khớp: {0}%.', hud.align),
    tape: !hud.taped.every(Boolean)
      ? tx('Bấm vào khung viền vàng để dán băng dính.')
      : tx('Giữ chuột trên từng dải băng để hơ lửa. Thả tay khi thanh nhiệt vào vạch xanh, đừng để sang đỏ.'),
    protect: tx('Kéo lẫy nhựa nhỏ ở góc dưới trái xuống để mở chế độ chỉ đọc.'),
    done: '',
  };
  const STEPS: Step[] = ['scrape', 'align', 'tape', 'protect'];
  const order = ['scrape', 'align', 'tape', 'protect', 'done'];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 font-mono">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('PHỤC CHẾ ĐĨA MỀM 1.44MB')}</div>
          <div className="text-xs text-zinc-500">
            {STEPS.map((s, i) => (
              <span key={s} className={`ml-2 ${step === s ? 'text-amber-300' : order.indexOf(step) > i ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {i + 1}. {tx(['Cạo ba-via', 'Căn Track 0', 'Dán & hơ', 'Chống ghi'][i])}
              </span>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            sim.current.pointer.x = -100;
          }}
          onWheel={onWheel}
          className="w-full border border-zinc-800 touch-none"
          style={{ imageRendering: 'pixelated', cursor: step === 'scrape' || step === 'tape' ? 'none' : 'default' }}
        />

        {/* Thanh nhiệt của 2 dải băng khi đang hơ */}
        {step === 'tape' && hud.taped.every(Boolean) && (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>{tx(i === 0 ? 'Dải trên' : 'Dải dưới')}</span>
                  <span className={hud.sealed[i] ? 'text-emerald-400' : ''}>{hud.sealed[i] ? tx('Đã co keo') : `${hud.heat[i].toFixed(1)}s`}</span>
                </div>
                <div className="relative h-2.5 bg-zinc-900 border border-zinc-700">
                  <div className="absolute inset-y-0 bg-emerald-950" style={{ left: `${(HEAT_MIN / 3) * 100}%`, width: `${((HEAT_MAX - HEAT_MIN) / 3) * 100}%` }} />
                  <div className="absolute inset-y-0 bg-red-950" style={{ left: `${(HEAT_MAX / 3) * 100}%`, right: 0 }} />
                  <div
                    className={`absolute inset-y-0 left-0 ${hud.heat[i] >= HEAT_MAX ? 'bg-red-500' : hud.heat[i] >= HEAT_MIN ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (hud.heat[i] / 3) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`text-sm min-h-10 leading-relaxed ${step === 'done' ? 'text-emerald-300' : 'text-zinc-300'}`}>{tx(message)}</div>

        {step !== 'done' && (
          <div className="border-l-2 border-amber-400 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 leading-relaxed">
            <span className="text-amber-300 font-bold">{tx('Việc cần làm:')} </span>
            {task[step]}
          </div>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          {step === 'align' ? (
            <>
              <span><Key>{tx('Lăn chuột')}</Key>{tx('Xoay từng nấc')}</span>
              <span><Key>A</Key><Key>D</Key>{tx('Xoay mịn')}</span>
            </>
          ) : (
            <span><Key>{tx('Chuột')}</Key>{step === 'scrape' ? tx('Giữ và kéo dao') : step === 'tape' ? tx('Bấm để dán, giữ để hơ') : tx('Kéo lẫy')}</span>
          )}
          <span><Key>Esc</Key>{tx('Thoát (làm lại từ đầu)')}</span>
        </div>
      </div>
    </div>
  );
};
