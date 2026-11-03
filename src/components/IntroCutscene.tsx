"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tx } from '../locales/tx';
import { px, hash } from './pixel/pixelKit';
import { SubtitleFrame } from './StageHud';

// =====================================================================
// ĐOẠN PHIM MỞ ĐẦU — HOẠT HOẠ PIXEL 60FPS + ÂM THANH WEB AUDIO TỰ TỔNG HỢP
// 1. Cuộc gọi tan ca đêm mưa  2. Con đường đêm mưa dài vô tận  3. Mặt đường tan vào hư vô, rơi tự do
// 4. Mở mắt tỉnh dậy trong phòng trọ #314.
// Ẩn dụ một cơn ác mộng siêu thực: không xe tải, không còi, không tiếng va chạm (không để lộ cốt truyện sớm).
// =====================================================================

interface IntroCutsceneProps {
  onComplete: () => void;
  volume?: number;
}

// Độ phân giải pixel của cảnh (16:9), phóng to giữ nét bằng image-rendering: pixelated
const W = 320;
const H = 180;

// Mốc thời gian (giây) của toàn bộ đoạn phim
const T = {
  RING1: 0.6,
  RING2: 2.8,
  CONNECT: 4.6,
  HANGUP: 16.8,
  RIDE: 18.2,
  ABYSS: 27.4,     // Âm thanh bị bóp nghẹt, giọng Miên rè rè qua điện thoại
  CRACK: 30.6,     // Mặt đường nứt toác, tan vào khoảng không đen đặc
  FALL: 31.8,      // Khung hình chao đảo, rơi tự do
  STATIC: 33.1,    // Nhiễu sóng tivi một nhịp
  BLACK: 33.3,     // Tắt phụt
  WAKE: 35.8,
  BLINK1: 38.4,
  BLINK2: 40.4,
  AWAKE: 41.9,
  PROMPT: 42.8,
} as const;

type Phase = 'call' | 'ride' | 'abyss' | 'black' | 'wake';
const phaseAt = (t: number): Phase =>
  t < T.RIDE ? 'call' : t < T.ABYSS ? 'ride' : t < T.BLACK ? 'abyss' : t < T.WAKE ? 'black' : 'wake';

// Phụ đề điện ảnh theo dòng thời gian (Miên qua điện thoại: hồng nhạt; qua sóng nhiễu: chập chờn)
interface Line { from: number; to: number; who: 'an' | 'mien' | 'radio'; text: string }
const LINES: Line[] = [
  { from: 5.0, to: 8.9, who: 'an', text: 'Alo Miên à? Anh vừa xong demo AURA rồi, dắt xe qua đón em ngay đây.' },
  { from: 9.2, to: 13.1, who: 'mien', text: 'Vâng, em chuẩn bị xong rồi nè. Trời mưa to lắm, anh đi cẩn thận nha...' },
  { from: 13.4, to: 16.4, who: 'an', text: 'Yên tâm, 10 phút nữa anh có mặt dưới cổng đón em.' },
  { from: 20.6, to: 26.2, who: 'an', text: 'Gió đêm buốt lạnh... Sao đoạn đường hôm nay lại dài đến kỳ lạ thế này...?' },
  { from: 27.9, to: 31.6, who: 'radio', text: 'An ơi... anh đang ở đâu... sao em không thấy anh...' },
  { from: 36.4, to: 40.4, who: 'an', text: 'Hộc... Hộc... Thật là một cơn ác mộng tồi tệ...' },
  { from: 42.4, to: 47.9, who: 'an', text: 'Cảm giác rơi tự do nghẹt thở đó... Đầu mình đau như búa bổ. Lại là 03:14 AM...' },
];
const lineAt = (t: number) => LINES.findIndex((l) => t >= l.from && t < l.to);
const RADIO_LINE = LINES.find((l) => l.who === 'radio')!;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Độ mở của mí mắt (0 = nhắm nghiền, 1 = mở toang) */
function lidOpenAt(t: number): number {
  if (t < T.BLINK1) return 0;
  const a = t - T.BLINK1;
  if (a < 0.8) return 0.3 * easeInOut(a / 0.8);                       // Nhịp 1: hé 30%
  if (a < 1.2) return 0.3 + Math.sin(a * 40) * 0.015;                 // Chớp chớp vì chói
  if (a < 1.45) return 0.3 * (1 - (a - 1.2) / 0.25);                  // Nhắm nghiền lại vì nhức đầu
  if (t < T.BLINK2) return 0;                                         // Đen 0.5 giây
  return easeInOut(clamp01((t - T.BLINK2) / (T.AWAKE - T.BLINK2)));  // Nhịp 2: mở toang trong 1.5 giây
}

/** Độ nhoè (px CSS) của căn phòng: mờ mịt 10px lúc hé mắt, rõ dần từng pixel sau nhịp mở thứ hai */
const blurAt = (t: number) => (t < T.BLINK2 ? 10 : 10 * (1 - easeInOut(clamp01((t - T.BLINK2) / 2.4))));

/** Độ "lạ" của con đường: 0 lúc mới chạy, đầy dần tới lúc mọi thứ chìm xuống */
const weirdAt = (t: number) => clamp01((t - T.RIDE - 3) / 6);

/** Biên độ giọng nói giả lập cho sóng âm trên điện thoại */
function voiceAmp(t: number): { who: Line['who'] | null; amp: number } {
  const i = lineAt(t);
  if (i < 0 || LINES[i].from > T.HANGUP) return { who: null, amp: 0 };
  const pause = Math.sin(t * 1.7 + i) > 0.82 ? 0.15 : 1;
  return { who: LINES[i].who, amp: (0.35 + 0.65 * Math.abs(Math.sin(t * 11.3 + i) * Math.sin(t * 4.1 + i * 2))) * pause };
}

// =====================================================================
// ÂM THANH: mọi thứ tổng hợp bằng Web Audio (mưa, chuông chờ, động cơ, sóng nhiễu, gió rơi, thở, quạt)
// =====================================================================

class IntroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;         // Giai đoạn 1-3: bị cắt phụt lúc màn hình tắt đen
  private world: BiquadFilterNode | null = null; // Mưa, động cơ, gió: bị bóp nghẹt như chìm xuống nước
  private worldGain: GainNode | null = null;
  private wakeBus: GainNode | null = null;     // Giai đoạn 4: tiếng thở & quạt máy tính
  private noise: AudioBuffer | null = null;
  private loops: AudioScheduledSourceNode[] = [];
  private rain: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; out: GainNode } | null = null;
  private line: GainNode | null = null;

  constructor(volume: number) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = volume / 100;
      this.master.connect(ctx.destination);
      this.bus = ctx.createGain();
      this.bus.connect(this.master);
      this.world = ctx.createBiquadFilter();
      this.world.type = 'lowpass';
      this.world.frequency.value = 18000;
      this.worldGain = ctx.createGain();
      this.world.connect(this.worldGain).connect(this.bus);
      this.wakeBus = ctx.createGain();
      this.wakeBus.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(volume: number) {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(volume / 100, this.ctx.currentTime, 0.05);
  }

  dispose() {
    try {
      void this.ctx?.close();
    } catch {}
    this.ctx = null;
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Nguồn nhiễu trắng lặp vô hạn → bộ lọc → gain (gain bắt đầu từ 0) */
  private noiseLoop(dest: AudioNode, type: BiquadFilterType, freq: number, q = 0.7) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(dest);
    src.start();
    this.loops.push(src);
    return { src, filter, gain };
  }

  /** Một nốt dao động ngắn có bao âm lên / xuống */
  private tone(dest: AudioNode, type: OscillatorType, freq: number, at: number, dur: number, peak: number, attack = 0.01) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + Math.max(attack, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
    return o;
  }

  /** Một cú nhiễu ngắn qua bộ lọc (củ đề, hơi thở, sóng nhiễu) */
  private burst(dest: AudioNode, type: BiquadFilterType, freq: number, at: number, attack: number, dur: number, peak: number, q = 0.8, freqTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, at);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  /** Mưa rơi ngoài cửa kính văn phòng (nghe vọng qua lớp kính: trầm, xa) */
  startRain() {
    if (!this.ctx || !this.world || this.rain) return;
    const { gain, filter } = this.noiseLoop(this.world, 'lowpass', 900);
    gain.gain.setTargetAtTime(0.09, this.now(), 0.6);
    const patter = this.noiseLoop(this.world, 'highpass', 3200);
    patter.gain.gain.setTargetAtTime(0.012, this.now(), 0.6);
    this.rain = { gain, filter };
  }

  /** Chuông chờ cuộc gọi: âm kép 440Hz + 480Hz */
  ring() {
    if (!this.ctx || !this.bus) return;
    const at = this.now();
    this.tone(this.bus, 'sine', 440, at, 1.5, 0.045, 0.02);
    this.tone(this.bus, 'sine', 480, at, 1.5, 0.045, 0.02);
  }

  /** Bắt máy: tiếng tách + rè đường dây; tiếng mưa dày lên thành mưa rào rả rích */
  connect() {
    if (!this.ctx || !this.bus) return;
    this.tone(this.bus, 'square', 1250, this.now(), 0.03, 0.02, 0.003);
    const hiss = this.noiseLoop(this.bus, 'highpass', 3600);
    hiss.gain.gain.setTargetAtTime(0.006, this.now(), 0.2);
    this.line = hiss.gain;
  }

  rainSwell(level = 0.16, cutoff = 1800) {
    if (!this.ctx || !this.rain) return;
    this.rain.gain.gain.setTargetAtTime(level, this.now(), 0.8);
    this.rain.filter.frequency.setTargetAtTime(cutoff, this.now(), 0.8);
  }

  /** Cúp máy: ba tiếng tút ngắn */
  hangup() {
    if (!this.ctx || !this.bus) return;
    const at = this.now();
    this.line?.gain.setTargetAtTime(0, at, 0.05);
    for (let i = 0; i < 3; i++) this.tone(this.bus, 'sine', 425, at + 0.1 + i * 0.24, 0.14, 0.035, 0.005);
  }

  /** Đề máy + rồ ga, rồi tiếng động cơ nổ đều suốt quãng đường; gió và mưa quất rát */
  startEngine() {
    if (!this.ctx || !this.world || this.engine) return;
    const ctx = this.ctx;
    const at = this.now();
    // Củ đề lạch cạch
    for (let i = 0; i < 6; i++) this.burst(this.world, 'lowpass', 220, at + i * 0.07, 0.005, 0.06, 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    // Nhịp nổ của xi-lanh: điều biên bằng sóng vuông 27Hz
    const am = ctx.createGain();
    am.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 27;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(am.gain);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.linearRampToValueAtTime(0.11, at + 0.6);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    osc.connect(lp);
    osc2.connect(o2g).connect(lp);
    lp.connect(am).connect(out).connect(this.world);
    // Rồ ga: vọt lên rồi hạ về vòng tua đều
    osc.frequency.setValueAtTime(22, at + 0.4);
    osc.frequency.linearRampToValueAtTime(74, at + 1.0);
    osc.frequency.setTargetAtTime(46, at + 1.1, 0.4);
    osc2.frequency.setValueAtTime(44, at + 0.4);
    osc2.frequency.linearRampToValueAtTime(148, at + 1.0);
    osc2.frequency.setTargetAtTime(92, at + 1.1, 0.4);
    [osc, osc2, lfo].forEach((o) => {
      o.start(at + 0.4);
      this.loops.push(o);
    });
    this.engine = { osc, osc2, out };
    const wind = this.noiseLoop(this.world, 'bandpass', 520, 0.6);
    wind.gain.gain.setTargetAtTime(0.06, at + 0.8, 0.8);
    this.rainSwell(0.2, 2800);
  }

  /** Nhịp ga dao động nhẹ theo tay lái */
  throttle(t: number) {
    if (!this.ctx || !this.engine) return;
    const f = 46 + Math.sin(t * 0.8) * 4 + Math.sin(t * 2.3) * 1.5;
    this.engine.osc.frequency.setTargetAtTime(f, this.now(), 0.15);
    this.engine.osc2.frequency.setTargetAtTime(f * 2, this.now(), 0.15);
  }

  /** Cả thế giới chìm dần xuống đáy nước: mưa và máy xe bị bóp nghẹt */
  muffle() {
    if (!this.ctx || !this.world || !this.worldGain) return;
    const at = this.now();
    this.world.frequency.cancelScheduledValues(at);
    this.world.frequency.setValueAtTime(this.world.frequency.value, at);
    this.world.frequency.exponentialRampToValueAtTime(380, at + 2.4);
    this.worldGain.gain.setTargetAtTime(0.7, at, 0.8);
  }

  /** Giọng Miên vọng qua điện thoại như sóng radio mất tín hiệu: nhiễu rè + âm sắc giọng đứt quãng */
  radio(dur: number) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const at = this.now();
    // Nền nhiễu rè, giật cục
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100;
    bp.Q.value = 0.9;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, at);
    for (let k = 0; k < dur; k += 0.06 + Math.random() * 0.06) hg.gain.setValueAtTime(0.004 + Math.random() * 0.04, at + k);
    hg.gain.setValueAtTime(0.0001, at + dur);
    hiss.connect(bp).connect(hg).connect(this.bus);
    hiss.start(at);
    hiss.stop(at + dur + 0.05);
    // Âm sắc giọng nói qua loa nhỏ: từng âm tiết bật / tắt, cao độ chênh nhẹ, có chỗ mất sóng hẳn
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1050;
    formant.Q.value = 3;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, at);
    let k = 0.15;
    while (k < dur - 0.2) {
      const syl = 0.12 + Math.random() * 0.14;
      const drop = Math.random() < 0.18;
      voice.frequency.setValueAtTime(205 + Math.random() * 55, at + k);
      vg.gain.setValueAtTime(drop ? 0.0001 : 0.022, at + k);
      vg.gain.setValueAtTime(0.0001, at + k + syl);
      k += syl + 0.05 + Math.random() * 0.12;
    }
    voice.connect(formant).connect(vg).connect(this.bus);
    voice.start(at);
    voice.stop(at + dur);
  }

  /** Rơi tự do: luồng gió ù ù trầm dần, tiếng máy xe chậm lại rồi tắt hẳn */
  fall(dur: number) {
    if (!this.ctx || !this.bus || !this.world) return;
    const at = this.now();
    this.world.frequency.cancelScheduledValues(at);
    this.world.frequency.setValueAtTime(this.world.frequency.value, at);
    this.world.frequency.exponentialRampToValueAtTime(140, at + dur);
    if (this.engine) {
      this.engine.osc.frequency.cancelScheduledValues(at);
      this.engine.osc.frequency.exponentialRampToValueAtTime(12, at + dur);
      this.engine.osc2.frequency.cancelScheduledValues(at);
      this.engine.osc2.frequency.exponentialRampToValueAtTime(24, at + dur);
      this.engine.out.gain.setTargetAtTime(0.0001, at + 0.2, dur / 3);
    }
    this.burst(this.bus, 'lowpass', 900, at, dur * 0.7, dur + 0.2, 0.12, 0.7, 90);
    const sub = this.tone(this.bus, 'sine', 80, at, dur + 0.2, 0.16, dur * 0.5);
    sub.frequency.exponentialRampToValueAtTime(28, at + dur);
  }

  /** Một nhịp nhiễu sóng tivi rào rào */
  staticBurst() {
    if (!this.ctx || !this.bus) return;
    this.burst(this.bus, 'highpass', 300, this.now(), 0.005, 0.3, 0.14, 0.5);
  }

  /** Tắt ngấm tuyệt đối: không fade, không dư âm */
  blackout() {
    if (!this.ctx || !this.bus) return;
    const now = this.now();
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(0, now);
    for (const s of this.loops) {
      try {
        s.stop();
      } catch {}
    }
    this.loops = [];
    this.engine = null;
    this.rain = null;
  }

  /** Tiếng rù rù trầm của quạt tản nhiệt máy tính, kèm chút rè rè, nổi dần lên trong bóng tối */
  startFan() {
    if (!this.ctx || !this.wakeBus) return;
    const ctx = this.ctx;
    const at = this.now();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 58;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.045, at + 3);
    o.connect(lp).connect(g).connect(this.wakeBus);
    o.start(at);
    const air = this.noiseLoop(this.wakeBus, 'lowpass', 340);
    air.gain.gain.setTargetAtTime(0.022, at, 1.2);
    const buzz = this.noiseLoop(this.wakeBus, 'bandpass', 2400, 2);
    buzz.gain.gain.setTargetAtTime(0.006, at + 1, 1.5);
  }

  /** Một nhịp thở dốc "hộc": hít gấp như vừa ngạt thở rồi thở ra */
  breath(strength: number) {
    if (!this.ctx || !this.wakeBus) return;
    const at = this.now();
    this.burst(this.wakeBus, 'bandpass', 1300, at, 0.2, 0.34, 0.075 * strength, 1.2, 900);
    this.burst(this.wakeBus, 'bandpass', 760, at + 0.4, 0.12, 0.55, 0.06 * strength, 0.9, 480);
  }
}

// =====================================================================
// MÔ PHỎNG & LỚP NỀN DỰNG SẴN
// =====================================================================

interface Streak { x: number; y: number; v: number; len: number }
interface GlassDrop { x: number; y: number; r: number; hold: number; vy: number; trail: number[] }
interface RadialDrop { a: number; r: number; v: number }
interface VisorDrop { x: number; y: number; r: number; life: number; vx: number; vy: number }
interface Mote { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number }

interface Sim {
  office: HTMLCanvasElement;
  officeFrame: HTMLCanvasElement;
  room: HTMLCanvasElement;
  streaks: Streak[];
  glass: GlassDrop[];
  radial: RadialDrop[];
  visor: VisorDrop[];
  roomRain: Streak[];
  motes: Mote[];       // Đốm sáng pixel vỡ ra từ cột đèn, trôi lơ lửng
  shards: Mote[];      // Mảnh mặt đường vỡ vụn rơi vào hư vô
  fallLines: Streak[]; // Vệt gió vút lên khi rơi tự do
  noise: ImageData | null;
}

const GLASS_BOTTOM = 118;   // Bậu cửa kính văn phòng
const HORIZON = 74;          // Đường chân trời khi chạy xe
const VPX = 160;             // Điểm tụ

function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Phố đêm nhìn qua cửa kính văn phòng: trời thẫm, nhà cao tầng lấm tấm đèn */
function buildOffice(): HTMLCanvasElement {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, GLASS_BOTTOM);
  sky.addColorStop(0, '#03050b');
  sky.addColorStop(1, '#0c1424');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GLASS_BOTTOM);
  for (let i = 0; i < 18; i++) {
    const bw = 14 + Math.floor(hash(i) * 22);
    const bh = 30 + Math.floor(hash(i + 40) * 64);
    const bx = Math.floor(hash(i + 80) * (W + 20)) - 10;
    const by = GLASS_BOTTOM - bh;
    px(g, bx, by, bw, bh, i % 3 === 0 ? '#070b14' : '#05080f');
    for (let wy = by + 3; wy < GLASS_BOTTOM - 3; wy += 4) {
      for (let wx = bx + 2; wx < bx + bw - 2; wx += 4) {
        const r = hash(wx * 7 + wy * 13);
        if (r < 0.22) px(g, wx, wy, 2, 2, r < 0.07 ? 'rgba(125,170,215,0.45)' : 'rgba(245,190,105,0.45)');
      }
    }
  }
  // Quầng đèn đường màu cam hắt lên từ dưới phố
  const haze = g.createLinearGradient(0, GLASS_BOTTOM - 26, 0, GLASS_BOTTOM);
  haze.addColorStop(0, 'rgba(255,150,60,0)');
  haze.addColorStop(1, 'rgba(255,150,60,0.12)');
  g.fillStyle = haze;
  g.fillRect(0, GLASS_BOTTOM - 26, W, 26);
  return c;
}

/** Khung cửa kính + bậu cửa + mặt bàn tối phía trong văn phòng (vẽ đè lên mưa) */
function buildOfficeFrame(): HTMLCanvasElement {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  const frame = '#0a0b0e';
  px(g, 0, 0, W, 5, frame);
  px(g, 0, 0, 6, GLASS_BOTTOM, frame);
  px(g, W - 6, 0, 6, GLASS_BOTTOM, frame);
  px(g, 104, 0, 5, GLASS_BOTTOM, frame);
  px(g, 211, 0, 5, GLASS_BOTTOM, frame);
  px(g, 0, GLASS_BOTTOM, W, H - GLASS_BOTTOM, '#06070a');
  px(g, 0, GLASS_BOTTOM, W, 2, '#15171c');
  px(g, 0, 150, W, 1, '#1c1a18');
  px(g, 0, 151, W, H - 151, '#0b0a09');
  // Màn hình máy tính văn phòng còn sáng mờ phía sau
  px(g, 22, 128, 46, 22, '#0d1622');
  px(g, 24, 130, 42, 18, 'rgba(90,140,190,0.18)');
  px(g, 252, 132, 40, 18, '#0d1622');
  return c;
}

/** Phòng trọ #314 lúc 03:14 nhìn từ bàn máy tính: màn hình CRT xanh lơ, bàn phím, cửa sổ mưa */
function buildRoom(): HTMLCanvasElement {
  const c = makeCanvas();
  const g = c.getContext('2d')!;
  px(g, 0, 0, W, H, '#070b12');
  // Cửa sổ trái: trời đêm + song cửa
  px(g, 16, 16, 78, 82, '#0a1626');
  px(g, 16, 16, 78, 3, '#11141b');
  px(g, 16, 95, 78, 3, '#11141b');
  px(g, 16, 16, 3, 82, '#11141b');
  px(g, 91, 16, 3, 82, '#11141b');
  px(g, 53, 16, 3, 82, '#11141b');
  px(g, 16, 55, 78, 3, '#11141b');
  // Lịch treo tường mờ mờ
  px(g, 112, 26, 18, 22, '#1a1d24');
  px(g, 112, 26, 18, 5, '#3b1d22');
  // Màn hình CRT
  px(g, 146, 34, 120, 92, '#1d1e22');
  px(g, 148, 36, 116, 88, '#26272c');
  px(g, 158, 44, 96, 70, '#061820');
  // Mặt bàn + bàn phím
  px(g, 0, 126, W, H - 126, '#120d0a');
  px(g, 0, 126, W, 2, '#1d1611');
  px(g, 140, 140, 134, 20, '#141518');
  for (let ky = 0; ky < 4; ky++) {
    for (let kx = 0; kx < 16; kx++) px(g, 143 + kx * 8, 142 + ky * 4, 7, 3, '#1f2126');
  }
  // Cốc cà phê nguội, xấp giấy
  px(g, 92, 136, 14, 16, '#24262b');
  px(g, 106, 140, 3, 7, '#24262b');
  px(g, 40, 148, 34, 10, '#2a2a2a');
  px(g, 44, 146, 30, 10, '#33332f');
  return c;
}

function createSim(): Sim {
  const streak = (): Streak => ({ x: Math.random() * (W + 80), y: Math.random() * H, v: 260 + Math.random() * 160, len: 6 + Math.random() * 8 });
  return {
    office: buildOffice(),
    officeFrame: buildOfficeFrame(),
    room: buildRoom(),
    streaks: Array.from({ length: 140 }, streak),
    glass: Array.from({ length: 34 }, () => ({
      x: 8 + Math.random() * (W - 16),
      y: 6 + Math.random() * (GLASS_BOTTOM - 14),
      r: Math.random() < 0.3 ? 2 : 1,
      hold: Math.random() * 4,
      vy: 0,
      trail: [],
    })),
    radial: Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: 4 + Math.random() * 180, v: 120 + Math.random() * 120 })),
    visor: [],
    roomRain: Array.from({ length: 40 }, () => ({ x: 16 + Math.random() * 78, y: 16 + Math.random() * 82, v: 90 + Math.random() * 60, len: 3 + Math.random() * 4 })),
    motes: [],
    shards: [],
    fallLines: Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 260 + Math.random() * 260, len: 8 + Math.random() * 16 })),
    noise: null,
  };
}

// =====================================================================
// VẼ TỪNG GIAI ĐOẠN
// =====================================================================

/** Mưa rào chéo góc 60° ngoài kính + giọt nước đọng rồi chảy ngoằn ngoèo trên mặt kính */
function drawOffice(ctx: CanvasRenderingContext2D, sim: Sim, t: number, dt: number) {
  ctx.drawImage(sim.office, 0, 0);
  // Hướng rơi 60° so với phương ngang (lệch trái)
  const dx = -0.5;
  const dy = 0.866;
  ctx.strokeStyle = 'rgba(170,192,225,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of sim.streaks) {
    s.x += dx * s.v * dt;
    s.y += dy * s.v * dt;
    if (s.y > GLASS_BOTTOM || s.x < -10) {
      s.y = -10 - Math.random() * 30;
      s.x = Math.random() * (W + 80);
    }
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + dx * s.len, s.y + dy * s.len);
  }
  ctx.stroke();
  // Giọt nước trên kính: đứng yên một lúc rồi trượt xuống, để lại vệt mờ
  for (const d of sim.glass) {
    if (d.hold > 0) d.hold -= dt;
    else {
      d.vy = Math.min(38, d.vy + 30 * dt);
      d.y += d.vy * dt;
      d.x += Math.sin(t * 6 + d.y * 0.3) * 0.25;
      d.trail.push(d.x, d.y);
      if (d.trail.length > 36) d.trail.splice(0, 2);
      if (d.y > GLASS_BOTTOM - 2) {
        d.x = 8 + Math.random() * (W - 16);
        d.y = 6 + Math.random() * 40;
        d.vy = 0;
        d.hold = 1 + Math.random() * 4;
        d.trail = [];
      }
    }
    for (let i = 0; i < d.trail.length; i += 2) px(ctx, d.trail[i], d.trail[i + 1], 1, 1, `rgba(170,195,230,${0.05 + (i / d.trail.length) * 0.12})`);
    px(ctx, d.x, d.y, d.r + 1, d.r + 1, 'rgba(200,220,245,0.55)');
    px(ctx, d.x, d.y + d.r, d.r + 1, 1, 'rgba(20,30,50,0.6)');
  }
  ctx.drawImage(sim.officeFrame, 0, 0);
}

/** Điện thoại pixel ở giữa khung hình: ảnh đại diện, sóng âm theo giọng nói, nút kết thúc */
function drawPhone(ctx: CanvasRenderingContext2D, t: number) {
  const x = 134;
  const y = 30;
  const w = 52;
  const h = 120;
  // Ánh sáng màn hình hắt ra xung quanh
  const glow = ctx.createRadialGradient(160, 90, 10, 160, 90, 90);
  glow.addColorStop(0, 'rgba(120,190,255,0.12)');
  glow.addColorStop(1, 'rgba(120,190,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(60, 0, 200, H);
  // Thân máy (bo góc bằng cách cắt pixel)
  px(ctx, x + 2, y, w - 4, h, '#0b0b10');
  px(ctx, x, y + 2, w, h - 4, '#0b0b10');
  px(ctx, x + 1, y + 1, 1, 1, '#0b0b10');
  px(ctx, x + w - 2, y + 1, 1, 1, '#0b0b10');
  px(ctx, x + 2, y, w - 4, 1, '#2b2c36');
  px(ctx, x, y + 2, 1, h - 4, '#22232b');
  // Màn hình
  const ended = t >= T.HANGUP;
  px(ctx, x + 3, y + 8, w - 6, h - 16, ended ? '#06090e' : '#08121d');
  px(ctx, 156, y + 4, 8, 1, '#1d1e26');
  // Ảnh đại diện tròn
  const av = ended ? '#2a2c38' : '#3d3550';
  px(ctx, 155, 48, 10, 1, av);
  px(ctx, 153, 49, 14, 10, av);
  px(ctx, 155, 59, 10, 1, av);
  px(ctx, 157, 51, 6, 4, ended ? '#3a3c48' : '#d7a6b8');
  px(ctx, 156, 55, 8, 3, ended ? '#3a3c48' : '#b07a90');
  // Sóng âm: dao động theo giọng đang nói, chấm mờ khi đang đổ chuông
  const { who, amp } = voiceAmp(t);
  for (let i = 0; i < 13; i++) {
    const bx = 141 + i * 3;
    let hgt = 1;
    if (t < T.CONNECT) hgt = Math.sin(t * 5 - i * 0.6) > 0.6 ? 2 : 1;
    else if (!ended && who) hgt = Math.max(1, Math.round(amp * (0.4 + 0.6 * Math.abs(Math.sin(t * 17 + i * 1.9))) * 9));
    const col = ended ? '#20242c' : who === 'mien' ? '#f9a8d4' : who === 'an' ? '#7dd3fc' : '#3b4a5c';
    px(ctx, bx, 109 - Math.floor(hgt / 2), 2, hgt, col);
  }
  // Nút kết thúc cuộc gọi
  const red = ended ? '#3a1414' : '#dc2626';
  px(ctx, 157, 126, 6, 1, red);
  px(ctx, 155, 127, 10, 6, red);
  px(ctx, 157, 133, 6, 1, red);
  px(ctx, 157, 129, 6, 2, '#fee2e2');
}

/** Phép chiếu phối cảnh mặt đường: z = khoảng cách (1 = sát đầu xe), X = lệch ngang, Y = độ cao */
const projY = (z: number, Y = 0) => HORIZON + (1 - Y) * ((H - HORIZON) / z);
const projX = (X: number, z: number) => VPX + (X * 150) / z;

/** Mép hư vô đang ăn dần mặt đường: răng cưa cố định theo x, rung nhẹ theo thời gian */
const voidEdgeAt = (x: number, base: number, t: number) =>
  base + (hash(Math.floor(x / 4) * 7.3) - 0.5) * 10 + Math.sin(t * 9 + x * 0.2) * 0.8;

/**
 * Góc nhìn thứ nhất trên xe máy: đường nhựa ướt cuộn về phía người chơi, mưa quất.
 * `weird` (0..1): cầu vượt không hề tới gần, cột đèn nhoè đi rồi vỡ thành đốm sáng trôi lơ lửng.
 * `voidK` (0..1): mặt đường nứt toác, khoảng không đen đặc nuốt dần từ chân trời về phía đầu xe.
 */
function drawRide(ctx: CanvasRenderingContext2D, sim: Sim, t: number, dt: number, weird: number, voidK: number) {
  const rt = Math.max(0, t - T.RIDE);
  const travel = rt * 14;
  // Trời đêm + quầng sáng thành phố nơi chân trời
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#04050a');
  sky.addColorStop(1, '#151520');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);
  px(ctx, 0, HORIZON - 6, W, 6, 'rgba(255,140,60,0.06)');
  // Cầu vượt phía xa: chạy mãi vẫn đứng nguyên một chỗ, thậm chí lùi xa dần
  const near = 0.2 - weird * 0.08 + Math.sin(t * 0.6) * 0.01;
  const deckY = HORIZON - 7 - near * 12;
  const deckH = 2 + near * 5;
  px(ctx, 0, deckY, W, deckH, '#07080c');
  for (let i = 0; i < 6; i++) px(ctx, 18 + i * 58, deckY + deckH, 3 + near * 3, HORIZON - deckY - deckH, '#07080c');
  for (let i = 0; i < 12; i++) if (Math.sin(t * 2 + i) > -0.3) px(ctx, 10 + i * 27, deckY - 1, 1, 1, 'rgba(255,190,90,0.7)');
  // Mặt đường nhựa đen ướt
  ctx.fillStyle = '#0b0c10';
  ctx.beginPath();
  ctx.moveTo(projX(-2.2, 60), HORIZON);
  ctx.lineTo(projX(1.4, 60), HORIZON);
  ctx.lineTo(projX(1.4, 0.9), H);
  ctx.lineTo(projX(-2.2, 0.9), H);
  ctx.closePath();
  ctx.fill();
  px(ctx, 0, HORIZON, projX(-2.2, 60), H - HORIZON, '#07080a');
  // Vạch mép đường liền
  ctx.strokeStyle = 'rgba(210,205,190,0.35)';
  ctx.beginPath();
  ctx.moveTo(projX(1.15, 60), HORIZON);
  ctx.lineTo(projX(1.15, 0.9), H);
  ctx.moveTo(projX(-1.95, 60), HORIZON);
  ctx.lineTo(projX(-1.95, 0.9), H);
  ctx.stroke();
  // Vạch đứt tim đường cuộn liên tục về phía người chơi
  const SEG = 4;
  const off = travel % SEG;
  ctx.fillStyle = 'rgba(225,220,200,0.75)';
  for (let k = 0; k < 18; k++) {
    const z0 = 1 + k * SEG - off;
    const z1 = z0 + 1.6;
    if (z0 < 0.95) continue;
    const ya = projY(z0);
    const yb = projY(z1);
    const hw0 = 4.5 / z0;
    const hw1 = 4.5 / z1;
    const xa = projX(-0.4, z0);
    const xb = projX(-0.4, z1);
    ctx.globalAlpha = clamp01(1.4 - z0 / 50);
    ctx.beginPath();
    ctx.moveTo(xa - hw0, ya);
    ctx.lineTo(xa + hw0, ya);
    ctx.lineTo(xb + hw1, yb);
    ctx.lineTo(xb - hw1, yb);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Cột đèn đường hai bên: quầng vàng mờ + vũng sáng loang trên mặt đường ướt;
  // càng về sau cột đèn càng nhoè, vỡ dần thành những đốm sáng pixel trôi lơ lửng
  const GAP = 10;
  for (const side of [1, -1]) {
    const X = side > 0 ? 1.9 : -2.8;
    const shift = side > 0 ? 0 : GAP / 2;
    for (let k = 0; k < 7; k++) {
      const z = 1 + k * GAP - ((travel + shift) % GAP);
      if (z < 1.05) continue;
      const fade = clamp01(1.3 - z / 60);
      const bx = projX(X, z);
      const by = projY(z);
      const ty = projY(z, 3);
      const pw = Math.max(1, 1.6 / z * 3);
      const hx = projX(X - side * 0.5, z);
      ctx.globalAlpha = fade * (1 - weird * 0.85);
      px(ctx, bx - pw / 2, ty, pw, by - ty, '#15161a');
      px(ctx, Math.min(bx, hx), ty, Math.abs(hx - bx) + 1, Math.max(1, pw * 0.6), '#15161a');
      ctx.globalAlpha = fade;
      const rad = (4 + 26 / z) * (1 + weird * 1.4);
      const halo = ctx.createRadialGradient(hx, ty + 1, 0, hx, ty + 1, rad);
      halo.addColorStop(0, `rgba(255,214,140,${0.65 * (1 - weird * 0.55)})`);
      halo.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(hx - rad, ty + 1 - rad, rad * 2, rad * 2);
      // Vệt phản chiếu dọc trên mặt nhựa ướt
      const ry = projY(z);
      for (let r = 0; r < 6; r++) {
        if (Math.sin(t * 9 + r * 2 + k) > 0.2) px(ctx, hx - 1 + Math.sin(t * 3 + r) * 0.8, ry + r * (3 / z + 1), Math.max(1, 3 / z), 2, 'rgba(255,200,120,0.18)');
      }
      ctx.globalAlpha = 1;
      if (weird > 0 && sim.motes.length < 180 && Math.random() < weird * 0.25 * dt * 60) {
        sim.motes.push({ x: hx + (Math.random() - 0.5) * 8, y: ty + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 9, life: 2.6, max: 2.6, s: Math.random() < 0.3 ? 2 : 1 });
      }
    }
  }
  // Đốm sáng pixel trôi lơ lửng, tắt dần
  sim.motes = sim.motes.filter((m) => (m.life -= dt) > 0);
  for (const m of sim.motes) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    px(ctx, m.x, m.y, m.s, m.s, `rgba(255,214,140,${0.8 * (m.life / m.max)})`);
  }
  // Đèn pha xe máy rọi mặt đường phía trước
  ctx.fillStyle = 'rgba(255,240,205,0.05)';
  ctx.beginPath();
  ctx.moveTo(projX(-0.2, 1.1), H);
  ctx.lineTo(projX(-0.6, 9), projY(9));
  ctx.lineTo(projX(0.9, 9), projY(9));
  ctx.lineTo(projX(1.1, 1.1), H);
  ctx.closePath();
  ctx.fill();

  // Khoảng không đen đặc nuốt dần mặt đường, mép nứt toác + mảnh vụn rơi vào hư vô
  if (voidK > 0) {
    const base = HORIZON - 6 + (H + 16 - HORIZON) * voidK ** 1.6;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    for (let x = W; x >= 0; x -= 4) ctx.lineTo(x, voidEdgeAt(x, base, t));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,195,210,0.45)';
    ctx.beginPath();
    for (let x = 2; x < W; x += 11) {
      const ey = voidEdgeAt(x, base, t);
      if (ey >= H) continue;
      const len = 4 + hash(x * 3.1) * 12;
      ctx.moveTo(x, ey);
      ctx.lineTo(x + (hash(x) - 0.5) * 8, ey + len);
    }
    ctx.stroke();
    if (sim.shards.length < 90 && base < H) {
      for (let i = 0; i < 3; i++) {
        const x = Math.random() * W;
        sim.shards.push({ x, y: voidEdgeAt(x, base, t), vx: (x - VPX) * -0.05, vy: -12 - Math.random() * 18, life: 1.2, max: 1.2, s: 1 + Math.floor(Math.random() * 3) });
      }
    }
  }
  sim.shards = sim.shards.filter((s) => (s.life -= dt) > 0);
  for (const s of sim.shards) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const k = s.life / s.max;
    px(ctx, s.x, s.y, Math.max(1, s.s * k), Math.max(1, s.s * k), `rgba(40,42,50,${k})`);
    px(ctx, s.x, s.y, 1, 1, `rgba(150,155,170,${0.6 * k})`);
  }

  // Mưa quất rát: hạt toả ra từ điểm tụ, lao vút qua hai bên
  ctx.strokeStyle = 'rgba(200,212,232,0.35)';
  ctx.beginPath();
  for (const d of sim.radial) {
    d.r += d.v * (1 + d.r / 50) * dt;
    if (d.r > 230) {
      d.r = 2 + Math.random() * 10;
      d.a = Math.random() * Math.PI * 2;
    }
    const ca = Math.cos(d.a);
    const sa = Math.sin(d.a);
    const len = 2 + d.r * 0.07;
    ctx.moveTo(VPX + ca * d.r, HORIZON + sa * d.r * 0.7);
    ctx.lineTo(VPX + ca * (d.r + len), HORIZON + sa * (d.r + len) * 0.7);
  }
  ctx.stroke();

  drawHandlebars(ctx, t);

  // Hạt nước loang trên kính mũ bảo hiểm
  if (Math.random() < 0.25 && sim.visor.length < 26) {
    const vx = Math.random() * W;
    const vy = Math.random() * (H - 50);
    sim.visor.push({ x: vx, y: vy, r: 1 + Math.floor(Math.random() * 2), life: 1.5 + Math.random() * 2, vx: (vx - VPX) * 0.08, vy: 6 + Math.random() * 8 });
  }
  sim.visor = sim.visor.filter((d) => (d.life -= dt) > 0);
  for (const d of sim.visor) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const a = Math.min(1, d.life);
    px(ctx, d.x, d.y, d.r + 1, d.r + 1, `rgba(210,225,245,${0.28 * a})`);
    px(ctx, d.x, d.y, 1, 1, `rgba(255,255,255,${0.5 * a})`);
  }
}

/** Đầu xe & tay lái: rung theo nhịp ga, đồng hồ công-tơ-mét sáng đèn vàng cam */
function drawHandlebars(ctx: CanvasRenderingContext2D, t: number) {
  const ox = Math.round(Math.sin(t * 31) * 0.6 + (Math.random() - 0.5) * 0.8);
  const oy = Math.round(Math.abs(Math.sin(t * 23)) * 0.9);
  const dark = '#101114';
  const edge = '#2c2e36';
  // Thân đầu xe
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(118 + ox, H);
  ctx.lineTo(128 + ox, 150 + oy);
  ctx.lineTo(192 + ox, 150 + oy);
  ctx.lineTo(202 + ox, H);
  ctx.closePath();
  ctx.fill();
  px(ctx, 128 + ox, 150 + oy, 64, 1, edge);
  // Ghi-đông hai bên
  ctx.strokeStyle = dark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(30 + ox, 176 + oy);
  ctx.lineTo(130 + ox, 156 + oy);
  ctx.moveTo(190 + ox, 156 + oy);
  ctx.lineTo(290 + ox, 176 + oy);
  ctx.stroke();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30 + ox, 173 + oy);
  ctx.lineTo(130 + ox, 153 + oy);
  ctx.moveTo(190 + ox, 153 + oy);
  ctx.lineTo(290 + ox, 173 + oy);
  ctx.stroke();
  // Tay nắm + bàn tay đeo găng
  px(ctx, 14 + ox, 168 + oy, 34, 12, '#08090b');
  px(ctx, 272 + ox, 168 + oy, 34, 12, '#08090b');
  px(ctx, 20 + ox, 166 + oy, 22, 3, '#1a1b20');
  px(ctx, 278 + ox, 166 + oy, 22, 3, '#1a1b20');
  // Gương chiếu hậu
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(84 + ox, 165 + oy);
  ctx.lineTo(66 + ox, 138 + oy);
  ctx.moveTo(236 + ox, 165 + oy);
  ctx.lineTo(254 + ox, 138 + oy);
  ctx.stroke();
  ctx.lineWidth = 1;
  px(ctx, 52 + ox, 128 + oy, 22, 12, dark);
  px(ctx, 54 + ox, 130 + oy, 18, 8, '#14161d');
  px(ctx, 246 + ox, 128 + oy, 22, 12, dark);
  px(ctx, 248 + ox, 130 + oy, 18, 8, '#14161d');
  if (Math.sin(t * 1.3) > 0.4) px(ctx, 60 + ox, 133 + oy, 2, 1, 'rgba(255,200,120,0.6)');
  // Đồng hồ công-tơ-mét
  const cx = 160 + ox;
  const cy = 166 + oy;
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
  glow.addColorStop(0, 'rgba(245,158,11,0.28)');
  glow.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 24, cy - 24, 48, 30);
  ctx.fillStyle = '#1a0f05';
  ctx.beginPath();
  ctx.arc(cx, cy, 11, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(cx, cy, 11, Math.PI, 0);
  ctx.stroke();
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    px(ctx, cx + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5, 1, 1, '#fbbf24');
  }
  const speed = 0.55 + Math.sin(t * 0.8) * 0.05;
  const na = Math.PI + clamp01(speed) * Math.PI;
  ctx.strokeStyle = '#fde68a';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * 9, cy + Math.sin(na) * 9);
  ctx.stroke();
  px(ctx, cx - 1, cy - 1, 2, 2, '#fbbf24');
}

/** Rơi tự do: cả khung hình chao đảo, trôi vụt lên rồi mất hút; vệt gió vút qua trong bóng tối */
function drawFall(ctx: CanvasRenderingContext2D, sim: Sim, t: number, dt: number) {
  const k = clamp01((t - T.FALL) / (T.STATIC - T.FALL));
  px(ctx, 0, 0, W, H, '#000');
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(k ** 1.4 * 0.9 + Math.sin(t * 7) * 0.04 * k);
  ctx.scale(1 - k * 0.35, 1 - k * 0.35);
  ctx.translate(-W / 2, -H / 2 - k * k * H * 1.5);
  drawRide(ctx, sim, t, dt, 1, 1);
  ctx.restore();
  ctx.strokeStyle = 'rgba(150,160,190,0.28)';
  ctx.beginPath();
  for (const l of sim.fallLines) {
    l.y -= l.v * dt * (0.4 + k);
    if (l.y < -20) {
      l.y = H + Math.random() * 20;
      l.x = Math.random() * W;
    }
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x, l.y + l.len);
  }
  ctx.stroke();
}

/** Một nhịp nhiễu sóng tivi rào rào phủ kín khung hình */
function drawStatic(ctx: CanvasRenderingContext2D, sim: Sim) {
  sim.noise ??= ctx.createImageData(W, H);
  const d = sim.noise.data;
  const roll = Math.floor(Math.random() * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const row = Math.floor(i / W);
    const v = Math.random() * (Math.abs(row - roll) < 6 ? 255 : 190);
    d[p] = v;
    d[p + 1] = v;
    d[p + 2] = v;
    d[p + 3] = 255;
  }
  ctx.putImageData(sim.noise, 0, 0);
}

// Phông số pixel 3x5 cho đồng hồ trên màn hình CRT
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  ':': ['0', '1', '0', '1', '0'],
};

function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, color: string) {
  let cx = x;
  for (const ch of text) {
    const g = DIGITS[ch];
    if (!g) continue;
    g.forEach((row, ry) => [...row].forEach((v, rx) => v === '1' && px(ctx, cx + rx * s, y + ry * s, s, s, color)));
    cx += (g[0].length + 1) * s;
  }
}

/** Phòng trọ #314 lúc tỉnh dậy: màn hình CRT nhấp nháy 03:14, mưa ngoài cửa sổ */
function drawRoom(ctx: CanvasRenderingContext2D, sim: Sim, t: number, dt: number) {
  ctx.drawImage(sim.room, 0, 0);
  // Mưa ngoài cửa sổ
  ctx.strokeStyle = 'rgba(150,175,210,0.3)';
  ctx.beginPath();
  for (const s of sim.roomRain) {
    s.y += s.v * dt;
    s.x -= s.v * dt * 0.3;
    if (s.y > 95 || s.x < 19) {
      s.y = 19;
      s.x = 22 + Math.random() * 70;
    }
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.len * 0.3, s.y + s.len);
  }
  ctx.stroke();
  // Màn hình CRT: nền xanh lơ, vạch quét, giờ 03:14, con trỏ nhấp nháy
  const flick = 0.85 + Math.sin(t * 50) * 0.04 + (Math.random() < 0.02 ? -0.2 : 0);
  ctx.globalAlpha = flick;
  px(ctx, 158, 44, 96, 70, '#0a3442');
  for (let y = 44; y < 114; y += 2) px(ctx, 158, y, 96, 1, 'rgba(0,0,0,0.18)');
  drawPixelText(ctx, '03:14', 178, 66, 4, '#7dd3fc');
  if (Math.sin(t * 6) > 0) px(ctx, 230, 98, 6, 2, '#7dd3fc');
  ctx.globalAlpha = 1;
  // Ánh sáng xanh lơ hắt lên tường & mặt bàn
  const glow = ctx.createRadialGradient(206, 80, 10, 206, 100, 150);
  glow.addColorStop(0, `rgba(80,190,230,${0.16 * flick})`);
  glow.addColorStop(1, 'rgba(80,190,230,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let kx = 0; kx < 16; kx += 3) px(ctx, 143 + kx * 8, 142, 7, 1, 'rgba(125,211,252,0.25)');
}

/** Mí mắt: nền đen khoét một khe hình bầu dục theo độ mở */
function drawLids(ctx: CanvasRenderingContext2D, open: number) {
  ctx.clearRect(0, 0, W, H);
  if (open >= 0.999) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (open <= 0.001) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W * (0.6 + open * 0.5), H * 0.78 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Viền mi mờ tối dần vào trong
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W * (0.6 + open * 0.5), H * 0.78 * open, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// =====================================================================
// COMPONENT
// =====================================================================

interface AudioEvent { at: number; once: boolean; fn: (au: IntroAudio) => void }
const AUDIO_EVENTS: AudioEvent[] = [
  { at: 0, once: false, fn: (au) => au.startRain() },
  { at: T.RING1, once: true, fn: (au) => au.ring() },
  { at: T.RING2, once: true, fn: (au) => au.ring() },
  { at: T.CONNECT, once: true, fn: (au) => au.connect() },
  { at: T.CONNECT, once: false, fn: (au) => au.rainSwell() },
  { at: T.HANGUP, once: true, fn: (au) => au.hangup() },
  { at: T.RIDE, once: false, fn: (au) => au.startEngine() },
  { at: T.ABYSS, once: false, fn: (au) => au.muffle() },
  { at: RADIO_LINE.from, once: true, fn: (au) => au.radio(RADIO_LINE.to - RADIO_LINE.from) },
  { at: T.FALL, once: true, fn: (au) => au.fall(T.STATIC - T.FALL) },
  { at: T.STATIC, once: true, fn: (au) => au.staticBurst() },
  { at: T.BLACK, once: false, fn: (au) => au.blackout() },
  { at: T.WAKE, once: false, fn: (au) => au.startFan() },
];

const fmtCall = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

const LINE_CLASS: Record<Line['who'], string> = {
  an: 'text-zinc-200',
  mien: 'text-rose-100',
  radio: 'text-rose-200/90',
};

export const IntroCutscene: React.FC<IntroCutsceneProps> = ({ onComplete, volume = 80 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lidsRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<IntroAudio | null>(null);
  const volumeRef = useRef(volume);
  const clockRef = useRef({ offset: 0, t: 0 });
  const doneRef = useRef(false);

  // State giao diện HTML: chỉ đổi khi thực sự khác (vòng lặp 60fps không re-render liên tục)
  const [lineIdx, setLineIdx] = useState(-1);
  const [phoneLabel, setPhoneLabel] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // Space / Enter / Click: tua qua giai đoạn đang chiếu; lúc đã tỉnh dậy thì vào game
  const advance = useCallback(() => {
    const c = clockRef.current;
    const t = c.t;
    const jump = (to: number) => {
      c.offset += to - t;
    };
    const ph = phaseAt(t);
    if (ph === 'call') jump(T.RIDE);
    else if (ph === 'ride') jump(T.ABYSS);
    else if (ph === 'wake') {
      if (t < T.BLINK2) jump(T.BLINK2);
      else finish();
    }
    // Lúc chìm xuống hư vô & màn đen: không cho tua
  }, [finish]);

  // Âm lượng đổi giữa chừng: chỉnh bus tổng, không dựng lại cả đoạn phim
  useEffect(() => {
    volumeRef.current = volume;
    audioRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const lids = lidsRef.current;
    const ctx = canvas?.getContext('2d');
    const lctx = lids?.getContext('2d');
    if (!canvas || !lids || !ctx || !lctx) return;
    const au = new IntroAudio(volumeRef.current);
    audioRef.current = au;
    const sim = createSim();
    const fired = new Set<AudioEvent>();
    let shownLine = -1;
    let shownPhone: string | null = null;
    let shownPrompt = false;
    let lastBlur = -1;
    let nextBreath = 0;
    let nextThrottle = 0;
    let animId = 0;
    let last = performance.now();
    const start = last;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = clockRef.current;
      const t = (now - start) / 1000 + c.offset;
      c.t = t;
      const ph = phaseAt(t);

      // Âm thanh theo mốc: sự kiện một lần bị bỏ qua nếu đã tua quá; sự kiện nền (mưa, động cơ...) luôn chạy
      for (const e of AUDIO_EVENTS) {
        if (fired.has(e) || t < e.at) continue;
        fired.add(e);
        if (!e.once || t - e.at < 0.3) e.fn(au);
      }
      if ((ph === 'ride' || (ph === 'abyss' && t < T.FALL)) && t >= nextThrottle) {
        au.throttle(t);
        nextThrottle = t + 0.1;
      }
      if (ph === 'wake' && t >= nextBreath) {
        const since = t - T.WAKE;
        au.breath(Math.max(0.35, 1.2 - since * 0.07));
        nextBreath = t + Math.min(3.2, 1.1 + since * 0.13);
      }

      // Vẽ
      ctx.imageSmoothingEnabled = false;
      if (ph === 'call') {
        drawOffice(ctx, sim, t, dt);
        drawPhone(ctx, t);
        const fade = t < 0.6 ? 1 - t / 0.6 : t > T.HANGUP + 0.4 ? clamp01((t - T.HANGUP - 0.4) / (T.RIDE - T.HANGUP - 0.6)) : 0;
        if (fade > 0) px(ctx, 0, 0, W, H, `rgba(0,0,0,${fade})`);
      } else if (ph === 'ride' || (ph === 'abyss' && t < T.FALL)) {
        drawRide(ctx, sim, t, dt, weirdAt(t), clamp01((t - T.CRACK) / (T.FALL - T.CRACK)));
        // Thế giới chìm dần xuống đáy nước: tối lại, lạnh màu
        if (ph === 'abyss') px(ctx, 0, 0, W, H, `rgba(2,4,14,${0.35 * clamp01((t - T.ABYSS) / 2.6)})`);
        const fade = 1 - clamp01((t - T.RIDE - 0.3) / 0.6);
        if (fade > 0) px(ctx, 0, 0, W, H, `rgba(0,0,0,${fade})`);
      } else if (ph === 'abyss' && t < T.STATIC) {
        drawFall(ctx, sim, t, dt);
      } else if (ph === 'abyss') {
        drawStatic(ctx, sim);
      } else if (ph === 'black') {
        px(ctx, 0, 0, W, H, '#000');
      } else {
        drawRoom(ctx, sim, t, dt);
      }

      // Mí mắt & độ nhoè của căn phòng
      if (ph === 'wake') {
        drawLids(lctx, lidOpenAt(t));
        const b = Math.round(blurAt(t) * 10) / 10;
        if (b !== lastBlur) {
          canvas.style.filter = b > 0 ? `blur(${b}px)` : 'none';
          lastBlur = b;
        }
      } else if (lastBlur !== -1) {
        lctx.clearRect(0, 0, W, H);
        canvas.style.filter = 'none';
        lastBlur = -1;
      }

      // Nhịp nhiễu sóng: khung hình giật lệch vài pixel
      const box = boxRef.current;
      if (box) {
        if (ph === 'abyss' && t >= T.STATIC) {
          box.style.transform = `translate(${(Math.random() - 0.5) * 8}px, ${(Math.random() - 0.5) * 4}px)`;
        } else if (box.style.transform) {
          box.style.transform = '';
        }
      }

      // Đồng bộ phần HTML (phụ đề, chữ trên điện thoại, gợi ý phím) khi thay đổi
      const li = lineAt(t);
      if (li !== shownLine) {
        shownLine = li;
        setLineIdx(li);
      }
      const phone = ph !== 'call' ? null
        : t < T.CONNECT ? 'Đang gọi...'
        : t < T.HANGUP ? fmtCall(Math.floor(t - T.CONNECT))
        : 'Kết thúc cuộc gọi';
      if (phone !== shownPhone) {
        shownPhone = phone;
        setPhoneLabel(phone);
      }
      const prompt = t >= T.PROMPT;
      if (prompt !== shownPrompt) {
        shownPrompt = prompt;
        setShowPrompt(prompt);
      }

      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      au.dispose();
      audioRef.current = null;
    };
  }, []);

  // Phím: Space / Enter tua tiếp hoặc vào game, Esc bỏ qua cả đoạn phim
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) advance();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, finish]);

  const line = lineIdx >= 0 ? LINES[lineIdx] : null;

  return (
    <div onClick={advance} className="relative w-screen h-screen bg-black overflow-hidden select-none flex items-center justify-center cursor-pointer">
      <div
        ref={boxRef}
        className="relative w-full aspect-video max-h-full"
        style={{ maxWidth: 'calc(100vh * 16 / 9)', containerType: 'inline-size' }}
      >
        <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
        <canvas ref={lidsRef} width={W} height={H} className="absolute inset-0 w-full h-full pointer-events-none" style={{ imageRendering: 'pixelated' }} />

        {/* Chữ trên màn hình điện thoại (HTML cho sắc nét, đặt theo toạ độ khung canvas) */}
        {phoneLabel !== null && (
          <div className="absolute left-1/2 -translate-x-1/2 text-center font-mono pointer-events-none" style={{ top: `${(66 / H) * 100}%` }}>
            <div className="text-zinc-100" style={{ fontSize: '2.3cqw', lineHeight: 1.2 }}>Miên</div>
            <div className="text-zinc-400" style={{ fontSize: '1.45cqw', lineHeight: 1.6 }}>{tx(phoneLabel)}</div>
          </div>
        )}

        {/* Phụ đề điện ảnh: An (trắng bạc) / Miên qua điện thoại (hồng nhạt) / qua sóng nhiễu (chập chờn) */}
        {line && (
          <SubtitleFrame
            key={lineIdx}
            className={LINE_CLASS[line.who]}
            style={{ animation: `cine-sub ${Math.round((line.to - line.from) * 1000)}ms ease-out forwards` }}
          >
            {line.who === 'radio' && (
              <style>{'@keyframes intro-radio { 0%, 100% { opacity: 1; transform: none } 22% { opacity: .35 } 24% { opacity: .9; transform: translateX(1px) } 61% { opacity: 1 } 63% { opacity: .2; transform: translateX(-2px) } 66% { opacity: .85; transform: none } }'}</style>
            )}
            <p style={line.who === 'radio' ? { animation: 'intro-radio 0.9s steps(1) infinite' } : undefined}>{tx(line.text)}</p>
          </SubtitleFrame>
        )}

        {showPrompt && (
          <div className="absolute bottom-3 right-4 font-mono text-[11px] tracking-[0.25em] text-zinc-500 pointer-events-none animate-pulse">
            SPACE · ENTER
          </div>
        )}
      </div>

      {/* Bỏ qua cả đoạn phim */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute top-3 right-4 px-2 py-1 text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-600 hover:text-zinc-200 transition-colors cursor-pointer"
      >
        {tx('BỎ QUA')} <span className="text-zinc-700">· Esc</span>
      </button>
    </div>
  );
};
