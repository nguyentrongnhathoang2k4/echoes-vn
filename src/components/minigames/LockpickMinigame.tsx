"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tx } from '../../locales/tx';
import { useUiLayer } from '../../services/uiLayers';

interface LockpickMinigameProps {
  /** Ba chốt đã vào gờ: ổ khoá xoay, ngăn kéo bật mở */
  onComplete: () => void;
  /** Gãy kẹp ghim lần thứ 3: kẹp rơi mất (trang ngoài trừ Sanity + rải kẹp phụ dưới sàn) */
  onFail: () => void;
  /** Bỏ dở bằng Esc: không mất gì */
  onClose: () => void;
  volume?: number;
}

/**
 * BẺ THEN KHOÁ HỘC BÀN (Màn 1)
 * Mặt cắt ổ khoá tủ gỗ cũ: 3 chốt bi rỉ sét, mỗi chốt = chốt dưới (đồng) + chốt trên (sắt gỉ) + lò xo.
 * Tay trái  (dao rọc giấy làm cờ lê): A/D hoặc kéo chuột ngang giữ lực xoay 30–70%.
 *   > 70%: chốt kẹt cứng (kèn kẹt), kẹp ghim bị bẻ cong dần → gãy.
 *   < 30%: ổ không "ăn" chốt; các chốt đã vào gờ rơi lại sau một nhịp.
 * Tay phải (kẹp ghim làm cần móc): W/S hoặc rê chuột dọc nâng chốt hiện tại, lần lượt 1 → 2 → 3.
 *   Giữ đầu chốt đúng gờ cắt (shear line) một nhịp thì CẠCH, chốt vào gờ.
 *   Đẩy lố quá gờ khi đang giữ lực: chốt kẹt lố, phải nới lực hẳn (< 15%) cho cả ổ thả lại.
 */
type Phase = 'pick' | 'snapped' | 'opening' | 'failed';

// ---- Cân chỉnh độ khó (mục tiêu 2–3 phút) ----
const TENSION_MIN = 30;
const TENSION_MAX = 70;
const TENSION_RELEASE = 15;         // Nới dưới mức này thì chốt kẹt lố được thả
const TENSION_RATE = 48;            // %/giây khi giữ A/D
const TENSION_DECAY = 9;            // %/giây tự tụt khi buông tay (phải giữ đều)
const STRAIN_RATE = 0.85;           // Tốc độ kẹp bị bẻ cong khi quá lực (đơn vị/giây ở 100%)
const STRAIN_RECOVER = 0.22;
const LOW_DROP_S = 0.7;             // Lực quá nhẹ bao lâu thì các chốt đã vào gờ rơi lại
const MAX_BREAKS = 3;

// ---- Hình học ổ khoá (canvas 480x240) ----
const W = 480;
const H = 240;
const SHEAR_Y = 120;                // Gờ cắt giữa thân ổ (trên) và lõi xoay (dưới)
const PIN_REST_BOTTOM = 160;        // Đáy chốt dưới lúc nghỉ (thò vào rãnh chìa)
const PIN_X = [176, 248, 320];
const PIN_W = 16;
const KEY_LEN = [22, 15, 27];       // Chiều dài chốt dưới → độ nâng cần thiết khác nhau
const DRIVER_LEN = 24;
const TOLERANCE = [3.4, 2.9, 2.4];  // Sai số cho phép quanh gờ (px), chốt sau khó hơn
const SET_HOLD_S = 0.32;            // Giữ đúng gờ bao lâu thì vào
const OVERSET = 7;                  // Nâng lố quá gờ bao nhiêu px thì kẹt lố
const LIFT_UP = 22;                 // px/giây khi giữ W
const LIFT_DOWN = 40;
const LIFT_SPRING = 13;             // Lò xo gỉ đẩy chốt xuống khi buông tay

const targetLift = (i: number) => PIN_REST_BOTTOM - KEY_LEN[i] - SHEAR_Y;

interface LockState {
  tension: number;
  strain: number;
  lift: number[];
  set: boolean[];
  jam: boolean;            // Chốt hiện tại bị nâng lố khi đang giữ lực
  hold: number;            // Đã giữ đúng gờ bao lâu
  low: number;             // Lực quá nhẹ bao lâu
  shake: number;           // Rung khung (giây còn lại)
  pinShake: number;        // Rung chốt vừa vào gờ
  lastSet: number;         // Chốt vừa vào gờ (để rung)
  plugTurn: number;        // 0..1 lõi xoay lúc mở
  pushing: boolean;
}

const freshLock = (): LockState => ({
  tension: 0, strain: 0, lift: [0, 0, 0], set: [false, false, false],
  jam: false, hold: 0, low: 0, shake: 0, pinShake: 0, lastSet: -1, plugTurn: 0, pushing: false,
});

/** Ô phím bấm trong dòng hướng dẫn */
const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block min-w-6 px-1.5 py-0.5 mr-1 text-center text-zinc-100 bg-zinc-800 border border-zinc-600">{children}</span>
);

export const LockpickMinigame: React.FC<LockpickMinigameProps> = ({ onComplete, onFail, onClose, volume = 80 }) => {
  useUiLayer(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lockRef = useRef<LockState>(freshLock());
  const phaseRef = useRef<Phase>('pick');
  const [phase, setPhase] = useState<Phase>('pick');
  const [breaks, setBreaks] = useState(0);
  const breaksRef = useRef(0);
  // Thông báo = khoá dịch + tham số ({0}, {1}) để tx() dịch được cả câu có số chốt
  const [message, setMessageState] = useState<[string, ...number[]]>(['Giữ lực xoay vừa phải, nâng từng chốt tới gờ.']);
  const setMessage = useCallback((key: string, ...args: number[]) => setMessageState([key, ...args]), []);
  // Số liệu cho HUD HTML (cập nhật ~15 lần/giây, không phải mỗi khung hình)
  const [hud, setHud] = useState({ tension: 0, strain: 0, setCount: 0, jam: false });
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const mouseDeltaRef = useRef({ dx: 0, dy: 0 });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cbRef = useRef({ onComplete, onFail, onClose });
  useEffect(() => {
    cbRef.current = { onComplete, onFail, onClose };
  }, [onComplete, onFail, onClose]);

  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ---------------- Âm thanh (AudioContext riêng, đóng khi rời minigame) ----------------
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

  const noiseBurst = useCallback((ctx: AudioContext, t: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'highpass') => {
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
    src.start(t);
  }, [vol]);

  // CẠCH: chốt vào gờ, kim loại đanh sắc
  const playClick = useCallback(() => {
    const ctx = ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(ctx, t, 0.03, 3200, 0.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(2100, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    g.gain.setValueAtTime(0.12 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.08);
  }, [ac, noiseBurst, vol]);

  // Kèn kẹt: chốt gỉ cạ vào thành rãnh khi lực xoay sai
  const lastCreakRef = useRef(0);
  const playCreak = useCallback(() => {
    const now = performance.now();
    if (now - lastCreakRef.current < 420) return;
    lastCreakRef.current = now;
    const ctx = ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.12);
    o.frequency.linearRampToValueAtTime(95, t + 0.26);
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 3;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 8; i++) g.gain.setValueAtTime((i % 2 ? 0.02 : 0.09) * vol, t + i * 0.032);
    g.gain.linearRampToValueAtTime(0, t + 0.28);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.3);
  }, [ac, vol]);

  // Tách tách: các chốt rơi về chỗ cũ
  const playDrop = useCallback(() => {
    const ctx = ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) noiseBurst(ctx, t + i * 0.06, 0.02, 2400 - i * 300, 0.25);
  }, [ac, noiseBurst]);

  // Rắc: kẹp ghim gãy
  const playSnap = useCallback(() => {
    const ctx = ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(ctx, t, 0.06, 1800, 0.7);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    g.gain.setValueAtTime(0.16 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.24);
    // Mẩu kẹp rơi leng keng xuống sàn gỗ
    for (let i = 0; i < 3; i++) noiseBurst(ctx, t + 0.32 + i * 0.11, 0.015, 4200, 0.18 / (i + 1));
  }, [ac, noiseBurst, vol]);

  // Lõi xoay hết vòng + ngăn kéo gỗ trượt ra
  const playOpen = useCallback(() => {
    const ctx = ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    g.gain.setValueAtTime(0.14 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.18);
    noiseBurst(ctx, t + 0.25, 0.55, 500, 0.35, 'lowpass');
  }, [ac, noiseBurst, vol]);

  // ---------------- Sự kiện trong vòng chơi ----------------
  const snapClip = useCallback(() => {
    playSnap();
    const n = breaksRef.current + 1;
    breaksRef.current = n;
    setBreaks(n);
    lockRef.current = { ...freshLock(), shake: 0.45 };
    if (n >= MAX_BREAKS) {
      goPhase('failed');
      setMessage('Kẹp ghim gãy vụn rồi... Tay run quá, mảnh kẹp cuối văng xuống chân bàn.');
      later(2600, () => cbRef.current.onFail());
      return;
    }
    goPhase('snapped');
    setMessage(n === 1 ? 'Rắc! Kẹp ghim gãy đầu. Uốn lại phần còn lại... nhẹ tay thôi.' : 'Lại gãy... chỉ còn một khúc ngắn. Lần này phải thật nhẹ.');
    later(1400, () => {
      goPhase('pick');
      setMessage('Giữ lực xoay vừa phải, nâng từng chốt tới gờ.');
    });
  }, [goPhase, later, playSnap, setMessage]);

  // ---------------- Bàn phím & chuột ----------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        if (phaseRef.current !== 'opening' && phaseRef.current !== 'failed') cbRef.current.onClose();
        return;
      }
      if (['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'e', 'enter', 'i', 'tab'].includes(k)) {
        e.preventDefault();
        e.stopPropagation();
      }
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

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
    void ac();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    mouseDeltaRef.current.dx += e.clientX - dragRef.current.x;
    mouseDeltaRef.current.dy += e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // ---------------- Vòng lặp mô phỏng + vẽ ----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let hudTick = 0;

    const step = (dt: number) => {
      const L = lockRef.current;
      L.shake = Math.max(0, L.shake - dt);
      L.pinShake = Math.max(0, L.pinShake - dt);
      const ph = phaseRef.current;
      if (ph === 'opening') {
        L.plugTurn = Math.min(1, L.plugTurn + dt * 1.4);
        return;
      }
      if (ph !== 'pick') return;
      const keys = keysRef.current;
      const md = mouseDeltaRef.current;

      // Tay trái: lực xoay
      let dT = 0;
      if (keys.has('d') || keys.has('arrowright')) dT += TENSION_RATE * dt;
      if (keys.has('a') || keys.has('arrowleft')) dT -= TENSION_RATE * dt;
      dT += md.dx * 0.3;
      const manual = dT !== 0 || dragRef.current !== null;
      L.tension = Math.max(0, Math.min(100, L.tension + dT - (manual ? 0 : TENSION_DECAY * dt)));

      // Chốt đang làm việc = chốt đầu tiên chưa vào gờ
      const cur = L.set.indexOf(false);
      if (cur < 0) return;
      const target = targetLift(cur);
      const tension = L.tension;
      const inBand = tension >= TENSION_MIN && tension <= TENSION_MAX;

      // Tay phải: nâng chốt
      let dL = 0;
      const pushUp = keys.has('w') || keys.has('arrowup') || md.dy < 0;
      if (keys.has('w') || keys.has('arrowup')) dL += LIFT_UP * dt;
      if (keys.has('s') || keys.has('arrowdown')) dL -= LIFT_DOWN * dt;
      dL += -md.dy * 0.16;
      md.dx = 0;
      md.dy = 0;
      L.pushing = pushUp;
      if (tension > TENSION_MAX && dL > 0) {
        // Quá lực: chốt gỉ kẹt cứng, nhích không nổi
        dL *= 0.18;
        playCreak();
      }
      // Gỉ sét: chốt nhích giật cục
      if (dL > 0) dL *= 0.55 + Math.random() * 0.6;
      if (L.jam) {
        // Chốt kẹt lố: không hạ xuống được cho tới khi nới hẳn lực
        dL = Math.max(0, dL) * 0.1;
        if (pushUp) playCreak();
      } else if (dL === 0) {
        // Đúng lực + đầu chốt đang ở gờ: ma sát giữ chốt đứng yên (thả tay chờ CẠCH); còn lại lò xo gỉ đẩy xuống
        const binding = inBand && Math.abs(L.lift[cur] - target) <= TOLERANCE[cur] + 1;
        if (!binding) dL = -LIFT_SPRING * dt;
      }
      L.lift[cur] = Math.max(0, Math.min(target + OVERSET + 7, L.lift[cur] + dL));

      // Nâng lố khi đang giữ lực → kẹt lố
      if (!L.jam && tension >= TENSION_MIN && L.lift[cur] > target + OVERSET) {
        L.jam = true;
        playCreak();
        setMessage('Đẩy lố quá gờ, chốt kẹt cứng! Nới hẳn lực xoay cho ổ thả lại.');
      }
      if (L.jam && tension < TENSION_RELEASE) {
        L.jam = false;
        L.lift = [0, 0, 0];
        if (L.set.some(Boolean)) playDrop();
        L.set = [false, false, false];
        setMessage('Các chốt rơi về chỗ cũ. Làm lại từ chốt 1.');
      }

      // Đúng gờ + đúng lực → giữ một nhịp là CẠCH
      if (!L.jam && inBand && Math.abs(L.lift[cur] - target) <= TOLERANCE[cur]) {
        L.hold += dt;
        if (L.hold >= SET_HOLD_S) {
          L.set[cur] = true;
          L.lift[cur] = target;
          L.hold = 0;
          L.pinShake = 0.18;
          L.lastSet = cur;
          playClick();
          const remaining = L.set.filter((s) => !s).length;
          if (remaining === 0) {
            goPhase('opening');
            playOpen();
            setMessage('Cạch! Lõi khoá xoay trọn một vòng. Ngăn kéo bật ra.');
            later(1800, () => cbRef.current.onComplete());
          } else {
            setMessage('Cạch! Chốt {0} vào gờ. Giữ nguyên lực, sang chốt {1}.', cur + 1, cur + 2);
          }
        }
      } else {
        L.hold = 0;
      }

      // Lực quá nhẹ: các chốt đã vào gờ rơi lại
      if (tension < TENSION_MIN && L.set.some(Boolean)) {
        L.low += dt;
        if (L.low >= LOW_DROP_S) {
          L.low = 0;
          L.set = [false, false, false];
          L.lift = [0, 0, 0];
          playDrop();
          setMessage('Lực xoay nhẹ quá, các chốt tụt hết xuống. Làm lại từ chốt 1.');
        }
      } else {
        L.low = 0;
      }

      // Quá lực: kẹp ghim cong dần rồi gãy
      if (tension > TENSION_MAX) {
        L.strain += ((tension - TENSION_MAX) / (100 - TENSION_MAX)) * STRAIN_RATE * dt * (pushUp ? 1.8 : 1);
        if (L.strain >= 1) snapClip();
      } else {
        L.strain = Math.max(0, L.strain - STRAIN_RECOVER * dt);
      }
    };

    const draw = (t: number) => {
      const L = lockRef.current;
      const ph = phaseRef.current;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (L.shake > 0) ctx.translate((Math.random() - 0.5) * 6 * L.shake * 2, (Math.random() - 0.5) * 4 * L.shake * 2);
      // Nền: mặt gỗ hộc bàn
      ctx.fillStyle = '#24170e';
      ctx.fillRect(0, 0, W, H);
      for (let y = 6; y < H; y += 11) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, y, W, 1);
      }
      // Thân ổ khoá (sắt xám gỉ)
      ctx.fillStyle = '#4b463f';
      ctx.fillRect(110, 40, 290, 160);
      ctx.fillStyle = '#5d574e';
      ctx.fillRect(110, 40, 290, 3);
      for (let i = 0; i < 60; i++) {
        const rx = 112 + ((i * 97) % 286);
        const ry = 44 + ((i * 53) % 150);
        ctx.fillStyle = i % 3 === 0 ? 'rgba(140,70,20,0.55)' : 'rgba(90,50,20,0.4)';
        ctx.fillRect(rx, ry, 2 + (i % 3), 1 + (i % 2));
      }
      // Lõi xoay (đồng thau), nghiêng nhẹ theo lực xoay
      const turn = (L.tension / 100) * 3 + L.plugTurn * 10;
      ctx.save();
      ctx.translate(turn * 0.6, 0);
      ctx.fillStyle = '#a3823a';
      ctx.fillRect(120, SHEAR_Y, 270, 64);
      ctx.fillStyle = '#c29d4c';
      ctx.fillRect(120, SHEAR_Y, 270, 2);
      // Rãnh chìa khoá
      ctx.fillStyle = '#0d0906';
      ctx.fillRect(120, PIN_REST_BOTTOM - 2, 270, 18);
      ctx.restore();
      // Gờ cắt (shear line)
      ctx.strokeStyle = 'rgba(250,250,240,0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(110, SHEAR_Y + 0.5);
      ctx.lineTo(400, SHEAR_Y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      const cur = L.set.indexOf(false);
      PIN_X.forEach((x, i) => {
        const lift = L.lift[i];
        // Chốt vừa CẠCH rung nhẹ một nhịp
        const jit = i === L.lastSet && L.pinShake > 0 ? (Math.random() - 0.5) * 2.5 : 0;
        // Rãnh chốt xuyên thân ổ + lõi
        ctx.fillStyle = '#120d09';
        ctx.fillRect(x - PIN_W / 2 - 2, 46, PIN_W + 4, PIN_REST_BOTTOM - 46);
        if (i === cur && ph === 'pick') {
          ctx.strokeStyle = L.jam ? 'rgba(239,68,68,0.8)' : 'rgba(229,231,235,0.45)';
          ctx.strokeRect(x - PIN_W / 2 - 2.5, 45.5, PIN_W + 5, PIN_REST_BOTTOM - 45);
        }
        const keyBottom = PIN_REST_BOTTOM - lift;
        const keyTop = keyBottom - KEY_LEN[i];
        // Chốt trên: vào gờ thì nằm trên mép lõi; chưa thì tì lên chốt dưới
        const driverBottom = L.set[i] ? SHEAR_Y : keyTop;
        const driverTop = driverBottom - DRIVER_LEN;
        // Lò xo nén từ đỉnh rãnh xuống chốt trên
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const coils = 7;
        const springTop = 48;
        for (let c = 0; c <= coils * 2; c++) {
          const yy = springTop + ((driverTop - springTop) * c) / (coils * 2);
          const xx = x + (c % 2 === 0 ? -5 : 5);
          if (c === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        // Chốt trên sắt gỉ
        ctx.fillStyle = '#7c4a24';
        ctx.fillRect(x - PIN_W / 2 + jit, driverTop, PIN_W, DRIVER_LEN);
        ctx.fillStyle = 'rgba(180,90,30,0.6)';
        ctx.fillRect(x - PIN_W / 2 + 3 + jit, driverTop + 5, 3, 2);
        ctx.fillRect(x - PIN_W / 2 + 9 + jit, driverTop + 14, 2, 3);
        // Chốt dưới đồng, đầu nhọn
        if (!L.set[i]) {
          ctx.fillStyle = '#d4a94a';
          ctx.fillRect(x - PIN_W / 2 + jit, keyTop, PIN_W, KEY_LEN[i] - 4);
          ctx.beginPath();
          ctx.moveTo(x - PIN_W / 2 + jit, keyBottom - 4);
          ctx.lineTo(x + jit, keyBottom);
          ctx.lineTo(x + PIN_W / 2 + jit, keyBottom - 4);
          ctx.closePath();
          ctx.fill();
        } else {
          // Đã vào gờ: chốt dưới thả lỏng nằm trong lõi
          ctx.fillStyle = '#b8913d';
          ctx.fillRect(x - PIN_W / 2 + 1, SHEAR_Y + 2, PIN_W - 2, KEY_LEN[i] - 6);
        }
        // Số chốt
        ctx.font = '10px monospace';
        ctx.fillStyle = L.set[i] ? '#86efac' : i === cur ? '#e5e7eb' : '#6b7280';
        ctx.fillText(String(i + 1), x - 3, 36);
      });

      // Cần móc: kẹp ghim bạc từ bên trái luồn vào rãnh chìa, đầu móc tì dưới chốt hiện tại
      if (ph !== 'failed') {
        const ci = cur < 0 ? 2 : cur;
        const tipX = PIN_X[ci];
        const tipY = PIN_REST_BOTTOM - L.lift[ci] + 1;
        const bend = Math.min(1, L.strain);
        ctx.strokeStyle = bend > 0.6 && Math.sin(t * 30) > 0 ? '#fca5a5' : '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 168);
        ctx.lineTo(tipX - 22, 170 + bend * 3);
        ctx.lineTo(tipX - 6, tipY + 5 + bend * 2);
        ctx.lineTo(tipX + 2, tipY);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      // Cờ lê: lưỡi dao rọc giấy cắm ở mép dưới rãnh chìa, cán vàng nghiêng theo lực xoay
      const wrenchDrop = (L.tension / 100) * 10 + L.plugTurn * 12;
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(112, PIN_REST_BOTTOM + 10, 30, 4);
      ctx.save();
      ctx.translate(112, PIN_REST_BOTTOM + 12);
      ctx.rotate(0.35 + wrenchDrop * 0.02);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(-70, -6, 70, 12);
      ctx.fillStyle = '#854d0e';
      for (let g = -64; g < -6; g += 8) ctx.fillRect(g, -6, 2, 12);
      ctx.restore();
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw(now / 1000);
      hudTick += dt;
      if (hudTick > 0.066) {
        hudTick = 0;
        const L = lockRef.current;
        setHud({ tension: Math.round(L.tension), strain: L.strain, setCount: L.set.filter(Boolean).length, jam: L.jam });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [goPhase, later, playClick, playCreak, playDrop, playOpen, snapClip, setMessage]);

  const tensionColor =
    hud.tension > TENSION_MAX ? 'bg-red-500' : hud.tension >= TENSION_MIN ? 'bg-emerald-500' : 'bg-zinc-500';
  const clipsLeft = MAX_BREAKS - breaks;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 font-mono">
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-zinc-200 text-sm font-bold tracking-widest">{tx('HỘC BÀN KẸT KHOÁ')}</div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span>{tx('Kẹp ghim:')}</span>
            {Array.from({ length: MAX_BREAKS }, (_, i) => (
              <span key={i} className={`inline-block w-3 h-1.5 ${i < clipsLeft ? 'bg-zinc-300' : 'bg-zinc-800'}`} />
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
          className="w-full border border-zinc-800 cursor-grab active:cursor-grabbing touch-none"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Lực xoay: vạch xanh là vùng an toàn 30–70% */}
        <div>
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>{tx('LỰC XOAY (DAO RỌC GIẤY)')}</span>
            <span className={hud.tension > TENSION_MAX ? 'text-red-400' : hud.tension >= TENSION_MIN ? 'text-emerald-400' : 'text-zinc-400'}>
              {hud.tension}%
            </span>
          </div>
          <div className="relative w-full h-3 bg-zinc-900 border border-zinc-700">
            <div className="absolute inset-y-0 bg-emerald-950" style={{ left: `${TENSION_MIN}%`, width: `${TENSION_MAX - TENSION_MIN}%` }} />
            <div className={`absolute inset-y-0 left-0 ${tensionColor}`} style={{ width: `${hud.tension}%`, opacity: 0.85 }} />
          </div>
        </div>
        {/* Độ cong của kẹp ghim: đầy là gãy */}
        <div>
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>{tx('ĐỘ CONG KẸP GHIM')}</span>
            <span>{tx('Chốt đã vào gờ:')} {hud.setCount}/3</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 border border-zinc-800">
            <div className="h-full bg-red-500" style={{ width: `${Math.min(100, hud.strain * 100)}%` }} />
          </div>
        </div>

        <div className={`text-sm min-h-10 leading-relaxed ${phase === 'failed' ? 'text-red-400' : hud.jam ? 'text-amber-300' : 'text-zinc-300'}`}>
          {tx(message[0], ...message.slice(1))}
        </div>

        {/* Việc cần làm ngay bây giờ, theo lực xoay đang giữ */}
        {phase === 'pick' && (
          <div className="border-l-2 border-amber-400 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 leading-relaxed">
            <span className="text-amber-300 font-bold">{tx('Việc cần làm:')} </span>
            {hud.jam
              ? tx('Chốt kẹt lố. Giữ A để nhả gần hết lực xoay, ổ sẽ thả các chốt xuống.')
              : hud.tension > TENSION_MAX
              ? tx('Lực mạnh quá, kẹp sắp gãy! Nhả D, bấm A cho thanh lực lùi về vùng xanh.')
              : hud.tension < TENSION_MIN
              ? tx('Giữ D để tăng lực xoay vào vùng xanh (30–70%). Buông tay là lực tự tụt.')
              : tx('Giữ W để nâng chốt {0} (viền trắng). Khi đầu chốt chạm vạch đứt nét, thả W và giữ yên tới khi nghe CẠCH.', hud.setCount + 1)}
          </div>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
          <span><Key>A</Key><Key>D</Key>{tx('Giảm / tăng lực xoay')}</span>
          <span><Key>W</Key><Key>S</Key>{tx('Nâng / hạ chốt')}</span>
          <span><Key>{tx('Chuột')}</Key>{tx('Kéo ngang: lực xoay, kéo dọc: chốt')}</span>
          <span><Key>Esc</Key>{tx('Thoát')}</span>
        </div>
      </div>
    </div>
  );
};
