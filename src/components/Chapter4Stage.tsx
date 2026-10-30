'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getStory, getBaseStory } from '../data/storyLoader';
import { useLanguage, getStoredLanguage } from '../context/LanguageContext';
import type { Dictionary } from '../locales/vi';
import { stripBeats } from './VNStage';
import { StoryNode, Choice } from '../types/vn';
import { audioEngine, DEAD_SILENCE_EVENT, DeadSilenceDetail } from '../services/audioEngine';
import { tx } from '../locales/tx';

// =====================================================================
// MÀN 4 — HƯ VÔ KỸ THUẬT SỐ (THE TERMINAL VOID)
// Trạm điều khiển AURA-NODE-314: đọc 3 tệp log theo thứ tự → An nhìn lại
// đời mình → cuộc gọi webcam của Miên → lựa chọn kết cục.
// Toàn bộ lời thoại & ngưỡng Sanity đọc từ story.json (không chép cứng).
// =====================================================================

const story = getBaseStory();

const BOOT_NODE = 'ch4_start';
const REFLECT_NODE = 'ch4_reflect';
const CALL_NODE = 'ch4_video_call';
const CLIMAX_NODE = 'ch4_climax_choice';

const LOG_FILES = [
  { file: 'LOG_01_BENHAN_TRUNGHOA.TXT', label: 'Bệnh án cấp cứu đêm 17/05', node: 'ch4_log1' },
  { file: 'LOG_02_NHATKY_MIEN.TXT', label: 'Nhật ký của Miên', node: 'ch4_log2' },
  { file: 'LOG_03_LENH_NGATNGUON.TXT', label: 'Lệnh cưỡng chế ngắt nguồn', node: 'ch4_log3' },
] as const;

// Tin nhắn chưa gửi cho mẹ: luôn nằm ngay sau 3 log, là tệp thứ 4 trong luồng Space/Enter
// (mở được bất cứ lúc nào). Đọc xong hồi Sanity và ghi biến flag_heard_mom (một lần).
const MOM_NODE = 'ch4_log_mom';
const MOM_FLAG = 'flag_heard_mom';
const MOM_INDEX = LOG_FILES.length;
const MOM_FILE = '[⭐ BẢN NHÁP] TIN_NHAN_ME.SMS';
const CALM_TOAST_MS = 3800;

// An trả lời Miên qua micro (lựa chọn của ch4_video_call) → Miên đáp lại trên webcam → bảng quyết định
type CamMood = 'sob' | 'cover' | 'shake';
const REPLY_MOOD: Record<string, CamMood> = { ch4_call_gentle: 'cover', ch4_call_grief: 'shake' };
const CAM_RESYNC_MS = 700;

// Rời tab quá lâu khi Miên đang gọi → Ending M "Không ai ở lại"
const ABANDON_NODE = 'end_game_abandoned';
const ABANDON_MS = 20000;

// Giờ máy chủ 03:27:45 → cắt điện lúc 03:30:00 (Log #03)
const COUNTDOWN_START = 135;
const SERVER_CUT_SECONDS = 3 * 3600 + 30 * 60;
// Chưa tới bảng lựa chọn thì đồng hồ không trôi xuống dưới mốc này (người đọc chậm vẫn kịp quyết định)
const DECISION_GRACE = 30;
const TYPE_INTERVAL_MS = 18;
const TYPE_CHARS_PER_TICK = 2;
const ENDING_DELAY_MS = 2600;

// Bảng quyết định: giữ chuột / Space / phím số đủ 3 giây mới chốt kết cục; thả tay giữa chừng thì thanh tụt về 0
const HOLD_MS = 3000;
const HOLD_DECAY_MS = 260;
const HOLD_BAR: Record<EndingKind, { fill: string; edge: string }> = {
  A: { fill: 'rgba(34,211,238,0.45)', edge: '#a5f3fc' },   // Cyan sáng
  B: { fill: 'rgba(127,29,29,0.75)', edge: '#ef4444' },    // Đỏ bầm
  S: { fill: 'rgba(192,38,211,0.5)', edge: '#f0abfc' },    // Tím neon
  C: { fill: 'rgba(113,113,122,0.45)', edge: '#e4e4e7' },
};

// Máy chủ phân rã theo đồng hồ: ≤45s quá nhiệt + chữ lỗi font chớp nhoáng; ≤20s tắt nhạc, quạt gào, viền sắc sai
const OVERHEAT_SEC = 45;
const MELTDOWN_SEC = 20;
const GLITCH_MS = 80;
const HEX_JUNK = ['0x0314', '0x1705', '0xDEAD', '0x00FF', '0x7E3A'];

/** Lỗi font: vài đoạn chữ hoá thành mã hex (cố định theo seed, không nhảy giữa các lần render) */
const corruptText = (text: string, seed: number) => {
  let k = seed;
  let out = '';
  let i = 0;
  while (i < text.length) {
    k = (k * 9301 + 49297) % 233280;
    const r = k / 233280;
    if (r < 0.06 && text[i] !== '\n') {
      const junk = HEX_JUNK[Math.floor(r * 1000) % HEX_JUNK.length];
      out += junk;
      for (let n = 0; n < junk.length && i < text.length && text[i] !== '\n'; n++) i++;
    } else {
      out += text[i++];
    }
  }
  return out;
};

// Nhạc nền "Khúc bi ca số hoá": Am -> Fmaj7 -> C -> Em/G, mỗi hợp âm ngân 3.2s (60 BPM)
const ELEGY_URL = '/assets/audio/bgm_ch4.mp3';
const ELEGY_CHORD_SEC = 3.2;
const ELEGY_FADE_SEC = 2;
const ELEGY_CHORDS = [
  { bass: 110.0, pad: [220.0, 261.63, 329.63], arps: [440.0, 523.25, 659.25], melody: 659.25 }, // Am
  { bass: 87.31, pad: [174.61, 261.63, 329.63], arps: [349.23, 440.0, 523.25], melody: 523.25 }, // Fmaj7
  { bass: 130.81, pad: [196.0, 261.63, 329.63], arps: [392.0, 523.25, 659.25], melody: 392.0 }, // C
  { bass: 98.0, pad: [164.81, 246.94, 329.63], arps: [329.63, 392.0, 493.88], melody: 493.88 }, // Em/G
] as const;
// Còn dưới mốc này ở bảng lựa chọn: piano tắt dần, chỉ còn nốt trầm đếm từng giây
const ELEGY_CLIMAX_SEC = 30;
const musicLevel = (bgmVolume: number) => (bgmVolume / 100) * 0.9;

type Phase = 'files' | 'reflect' | 'call' | 'decide' | 'ending';
type EndingKind = 'A' | 'B' | 'C' | 'S';

interface Chapter4StageProps {
  sanity: number;
  setSanity?: React.Dispatch<React.SetStateAction<number>>;
  storyFlags: string[];
  /** leftAt: giờ máy chủ lúc người chơi rời tab (chỉ có ở Ending M) */
  onTriggerEnding: (endingNodeId: string, leftAt?: string) => void;
  /** Ghi một biến cốt truyện (đọc tin nhắn mẹ → flag_heard_mom) */
  onSetStoryFlag?: (flag: string) => void;
  volume?: number;
  /** Âm lượng nhạc nền (cài đặt BGM, 0-100) */
  bgmVolume?: number;
  /** Đang mở menu tạm dừng / cài đặt → dừng đồng hồ đếm ngược */
  paused?: boolean;
}

const nodeText = (id: string) => stripBeats(getStory(getStoredLanguage())[id]?.text ?? '');

const endingKindOf = (nodeId: string): EndingKind =>
  nodeId.startsWith('ending_shutdown') ? 'A'
  : nodeId.startsWith('ending_corrupt') ? 'B'
  : nodeId.startsWith('ending_stranger') ? 'S'
  : 'C';

const fmtClock = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
const fmtMMSS = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Nhãn khoá lựa chọn theo ngưỡng Sanity */
const lockLabel = (c: Choice, t: Dictionary) =>
  c.minSanity !== undefined && c.maxSanity !== undefined ? `🔒 ${t.vn.lockRange(c.minSanity, c.maxSanity)}`
  : c.minSanity !== undefined ? `🔒 ${t.vn.lockMin(c.minSanity)}`
  : c.maxSanity !== undefined ? `🔒 ${t.vn.lockMax(c.maxSanity)}`
  : '';

/** Tách "[TIÊU ĐỀ] • mô tả" thành hai phần */
const splitChoice = (text: string) => {
  const i = text.indexOf(' • ');
  return i < 0 ? { title: text, sub: '' } : { title: text.slice(0, i), sub: text.slice(i + 3) };
};

// =====================================================================
// CANVAS NỀN — HƯ VÔ: mảnh vỡ phòng trọ rơi, chuỗi mã trôi, bụi sáng
// =====================================================================

const VOID_SCALE = 3; // Vẽ ở 1/3 độ phân giải rồi phóng pixelated
const DEBRIS_COLORS = ['#5b3a22', '#7a4e2d', '#3b2616', '#2e3a4f', '#94a3b8', '#f472b6', '#e7e5e4', '#1e293b'];
const VOID_WORDS = ['0x314', 'MEMORY_CORRUPT', 'DUMP_SECTOR_1705', 'AURA-NODE-314', '03:14', 'SEGFAULT', '17/05', 'NULL', 'PHÒNG 312', '0xDEAD'];

interface Debris { x: number; y: number; vy: number; vx: number; s: number; c: string }
interface Drift { text: string; x: number; y: number; vy: number; a: number; size: number }

interface VoidSim {
  debris: Debris[];
  words: Drift[];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function createVoidSim(w: number, h: number): VoidSim {
  return {
    debris: Array.from({ length: 70 }, () => ({
      x: rand(0, w), y: rand(-h, h), vy: rand(0.08, 0.45), vx: rand(-0.05, 0.05), s: Math.random() < 0.2 ? 3 : Math.random() < 0.5 ? 2 : 1,
      c: DEBRIS_COLORS[Math.floor(Math.random() * DEBRIS_COLORS.length)],
    })),
    words: Array.from({ length: 12 }, (_, i) => ({
      text: tx(VOID_WORDS[i % VOID_WORDS.length]), x: rand(0, w), y: rand(0, h), vy: rand(0.03, 0.12), a: rand(0.06, 0.18), size: Math.random() < 0.3 ? 8 : 6,
    })),
  };
}

function drawVoid(g: CanvasRenderingContext2D, w: number, h: number, sim: VoidSim, t: number, ending: EndingKind | null) {
  // Nhiễu tuyết khi mất tín hiệu (Ending C)
  if (ending === 'C') {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 200;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return;
  }
  const bg = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  bg.addColorStop(0, ending === 'B' ? '#2a0508' : '#0a1220');
  bg.addColorStop(1, '#010103');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // Chuỗi mã mờ trôi ngược lên
  g.textBaseline = 'top';
  for (const d of sim.words) {
    d.y -= d.vy;
    if (d.y < -10) { d.y = h + 5; d.x = rand(0, w - 40); }
    g.font = `${d.size}px monospace`;
    g.fillStyle = ending === 'B' ? `rgba(248,113,113,${d.a * 1.6})` : `rgba(103,232,249,${d.a})`;
    g.fillText(d.text, Math.round(d.x), Math.round(d.y));
  }

  // Mảnh vỡ căn phòng trọ rơi vào hư vô (càng xa càng mờ)
  for (const p of sim.debris) {
    p.y += p.vy;
    p.x += p.vx + Math.sin(t * 0.7 + p.y * 0.05) * 0.03;
    if (p.y > h + 4) { p.y = rand(-30, -4); p.x = rand(0, w); }
    g.globalAlpha = 0.25 + p.s * 0.2;
    g.fillStyle = p.c;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  g.globalAlpha = 1;

  // Bụi sáng lấp lánh
  for (let i = 0; i < 26; i++) {
    const tw = Math.sin(t * 2 + i * 1.7);
    if (tw < 0.6) continue;
    const x = (i * 97.3 + t * 3) % w;
    const y = (i * 53.1 + Math.sin(t * 0.3 + i) * 10 + h) % h;
    g.fillStyle = `rgba(233,213,255,${(tw - 0.6) * 2})`;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // Ending B: lát cắt glitch đỏ
  if (ending === 'B') {
    for (let i = 0; i < 6; i++) {
      const y = Math.floor(Math.random() * h);
      g.drawImage(g.canvas, 0, y, w, 3, (Math.random() - 0.5) * 20, y, w, 3);
    }
    g.fillStyle = `rgba(220,20,40,${0.12 + Math.random() * 0.15})`;
    g.fillRect(0, 0, w, h);
  }
}

// =====================================================================
// CANVAS WEBCAM — PHÒNG MÁY 312 NGOÀI ĐỜI THỰC (160x120 pixel)
// =====================================================================

const CAM_W = 160;
const CAM_H = 120;

const ease = (k: number) => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const imgReady = (img: HTMLImageElement | null): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

function drawWebcam(
  g: CanvasRenderingContext2D, t: number, mien: HTMLImageElement | null, pleading: HTMLImageElement | null,
  bangAge: number, ending: EndingKind | null, frame: number, mood: CamMood, moodAge: number,
) {
  if (ending === 'C') {
    for (let y = 0; y < CAM_H; y += 2) {
      for (let x = 0; x < CAM_W; x += 2) {
        const v = Math.floor(Math.random() * 180);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 2, 2);
      }
    }
    return;
  }
  const shake = bangAge < 260 ? Math.round(Math.sin(bangAge * 0.12) * 2) : 0;
  // Tường & sàn
  g.fillStyle = '#14171d';
  g.fillRect(0, 0, CAM_W, CAM_H);
  g.fillStyle = '#0e1015';
  g.fillRect(0, 86, CAM_W, CAM_H - 86);

  // Tủ rack máy chủ hai bên + đèn LED nhấp nháy
  const rack = (x: number) => {
    g.fillStyle = '#22262e';
    g.fillRect(x - 1, 14, 30, 82);
    g.fillStyle = '#0c0e13';
    g.fillRect(x, 15, 28, 80);
    for (let r = 0; r < 9; r++) {
      g.fillStyle = '#171a21';
      g.fillRect(x + 2, 18 + r * 8, 24, 6);
      for (let l = 0; l < 3; l++) {
        const on = Math.sin(t * (3 + l + r * 0.7) + x) > 0.2;
        g.fillStyle = on ? (l === 2 ? '#f59e0b' : '#22c55e') : '#1f2937';
        g.fillRect(x + 4 + l * 3, 20 + r * 8, 1, 1);
      }
    }
  };
  rack(3);
  rack(129);

  // Cửa phòng máy (rung lên mỗi lần bị đập)
  const dx = 44 + shake;
  g.fillStyle = '#2b3038';
  g.fillRect(dx - 2, 22, 30, 66);
  g.fillStyle = '#1b1f26';
  g.fillRect(dx, 24, 26, 64);
  g.fillStyle = '#3a404a';
  g.fillRect(dx + 3, 30, 20, 14);
  g.fillStyle = '#9ca3af';
  g.fillRect(dx + 21, 58, 2, 4);
  if (bangAge < 600) {
    g.fillStyle = 'rgba(200,200,200,0.6)';
    for (let i = 0; i < 5; i++) g.fillRect(dx + 2 + ((i * 7 + frame) % 24), 22 + ((bangAge / 12 + i * 5) % 30), 1, 1);
  }

  // Đèn báo động đỏ xoay
  g.fillStyle = '#7f1d1d';
  g.fillRect(104, 6, 8, 4);
  const pulse = Math.max(0, Math.sin(t * 5));
  g.fillStyle = `rgba(239,68,68,${0.5 + pulse * 0.5})`;
  g.fillRect(105, 4, 6, 3);

  // Miên khóc trước màn hình (ánh màn hình xanh lơ hắt lên mặt).
  // Nghe An trả lời: cúi gằm nấc nghẹn (cover) hoặc lắc đầu quặn thắt (shake)
  const face = mood === 'shake' && imgReady(pleading) ? pleading : mien;
  if (imgReady(face)) {
    // Nấc nghẹn: hai vai giật lên từng cơn ngắn rồi lặng đi, không nhún đều như nhịp thở
    const gasp = (t * 1.4) % 1;
    const sob = mood === 'cover' ? (gasp < 0.1 ? 2 : gasp < 0.18 ? 1 : 0) : Math.sin(t * 6.5) > 0.55 ? 1 : 0;
    const tremble = mood === 'cover' && gasp < 0.18 ? (frame % 2 ? 1 : -1) : 0;
    const dip = mood === 'cover' ? Math.round(ease(moodAge / 900) * 5) : 0;   // Cúi gằm mặt xuống
    const head = mood === 'shake' ? Math.round(Math.sin(moodAge * 0.016) * 3 * Math.max(0, 1 - moodAge / 2800)) : tremble;
    const sh = face.naturalHeight * 0.78;
    const fw = Math.round((78 * face.naturalWidth) / sh);
    const fy = 26 + sob + dip;
    g.imageSmoothingEnabled = true;
    g.drawImage(face, 0, 0, face.naturalWidth, sh, 82 - fw / 2 + head, fy, fw, 78);
    g.imageSmoothingEnabled = false;
    if (mood === 'cover') {
      // Cúi xuống khỏi ánh màn hình: nửa trên khuôn mặt chìm vào bóng tóc
      const shade = g.createLinearGradient(0, fy + 20, 0, fy + 52);
      shade.addColorStop(0, `rgba(10,8,14,${0.45 * ease(moodAge / 900)})`);
      shade.addColorStop(1, 'rgba(10,8,14,0)');
      g.fillStyle = shade;
      g.fillRect(46, fy + 20, 72, 32);
      // Nước mắt lăn dài rồi nhỏ giọt khỏi cằm xuống mép bàn
      for (const [ex, off] of [[73, 0], [92, 0.55]] as const) {
        const k = (t * 0.6 + off) % 1;
        const ty = fy + 43;
        if (k < 0.7) {
          const run = Math.round((k / 0.7) * 18);
          g.fillStyle = 'rgba(186,240,255,0.35)';
          g.fillRect(ex + head, ty, 1, run);
          g.fillStyle = 'rgba(214,248,255,0.9)';
          g.fillRect(ex + head, ty + run, 1, 2);
        } else {
          g.fillStyle = 'rgba(214,248,255,0.8)';
          g.fillRect(ex + head + (ex < 82 ? 3 : -3), ty + 18 + Math.round(((k - 0.7) / 0.3) ** 2 * 22), 1, 1);
        }
      }
    }
  }
  // Bàn phím + mép bàn
  g.fillStyle = '#1a1d24';
  g.fillRect(0, 104, CAM_W, 16);
  g.fillStyle = '#2a2f38';
  g.fillRect(50, 106, 60, 4);
  const glow = g.createRadialGradient(82, 120, 4, 82, 120, 70);
  glow.addColorStop(0, 'rgba(103,232,249,0.22)');
  glow.addColorStop(1, 'rgba(103,232,249,0)');
  g.fillStyle = glow;
  g.fillRect(0, 40, CAM_W, 80);

  // Ánh đỏ báo động quét qua phòng
  g.fillStyle = `rgba(220,20,40,${(ending === 'B' ? 0.35 : 0.1) + pulse * 0.18})`;
  g.fillRect(0, 0, CAM_W, CAM_H);

  // Nhiễu hạt + interlace + xé hình
  for (let i = 0; i < 160; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.3)';
    g.fillRect(Math.floor(Math.random() * CAM_W), Math.floor(Math.random() * CAM_H), 1, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = frame % 2; y < CAM_H; y += 2) g.fillRect(0, y, CAM_W, 1);
  if (Math.random() < (ending === 'B' ? 0.5 : 0.05)) {
    const y = Math.floor(Math.random() * (CAM_H - 8));
    g.drawImage(g.canvas, 0, y, CAM_W, 6, (Math.random() - 0.5) * 14, y, CAM_W, 6);
  }
  // Tín hiệu micro của An tới nơi: một vệt quét đồng bộ lại khung hình từ trên xuống
  if (moodAge < CAM_RESYNC_MS) {
    const k = moodAge / CAM_RESYNC_MS;
    const by = Math.floor(k * CAM_H);
    for (let y = Math.max(0, by - 10); y < by; y += 2) {
      g.drawImage(g.canvas, 0, y, CAM_W, 2, Math.round((Math.random() - 0.5) * 8 * (1 - k)), y, CAM_W, 2);
    }
    g.fillStyle = `rgba(165,243,252,${0.35 * (1 - k)})`;
    g.fillRect(0, by, CAM_W, 2);
  }
}

// =====================================================================
// COMPONENT
// =====================================================================

export const Chapter4Stage: React.FC<Chapter4StageProps> = ({
  sanity,
  setSanity,
  storyFlags,
  onTriggerEnding,
  onSetStoryFlag,
  volume = 80,
  bgmVolume = 85,
  paused = false,
}) => {
  const [phase, setPhase] = useState<Phase>('files');
  const [viewing, setViewing] = useState<number | null>(null); // null = màn khởi động ch4_start
  const [readCount, setReadCount] = useState(0);
  const [openedFirst, setOpenedFirst] = useState(false);
  const [ending, setEnding] = useState<EndingKind | null>(null);
  const [remaining, setRemaining] = useState(COUNTDOWN_START);
  const [momRead, setMomRead] = useState(false);
  const [calmToast, setCalmToast] = useState<number | null>(null);
  const [typed, setTyped] = useState({ key: '', text: '', done: false });
  // Lời An nói qua micro (null = chưa trả lời) + node phản ứng của Miên
  const [reply, setReply] = useState<{ node: string; line: string } | null>(null);
  const camMoodRef = useRef<{ mood: CamMood; since: number }>({ mood: 'sob', since: -10000 });
  const miePanelRef = useRef<HTMLDivElement>(null);
  // Bảng quyết định: lựa chọn đang nhắm (bàn phím) + trạng thái giữ nút (chỉ sống trong ref, không re-render)
  const [focusPick, setFocusPick] = useState<number | null>(null);
  const focusRef = useRef(0);
  const holdRef = useRef({ idx: -1, active: false, start: 0, progress: 0, nextRelay: 0, nextBeat: 0, key: '' });
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flashRef = useRef<HTMLDivElement>(null);
  // Lỗi font chớp nhoáng khi quá nhiệt (0 = không lỗi)
  const [glitchSeed, setGlitchSeed] = useState(0);

  const voidCanvasRef = useRef<HTMLCanvasElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Trạng thái đọc trong vòng lặp RAF / interval (không khởi động lại loop)
  const phaseRef = useRef<Phase>('files');
  const endingRef = useRef<EndingKind | null>(null);
  const pausedRef = useRef(paused);
  const bangAtRef = useRef(-10000);
  const endedRef = useRef(false);
  const remainingRef = useRef(COUNTDOWN_START);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { endingRef.current = ending; }, [ending]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const { t: dict, lang } = useLanguage();
  // Cùng logic với bản gốc, chỉ khác chữ hiển thị
  const climax = getStory(lang)[CLIMAX_NODE];
  const callChoices = useMemo(() => getStory(lang)[CALL_NODE]?.choices ?? [], [lang]);

  const isLocked = useCallback(
    (c: Choice) => (c.minSanity !== undefined && sanity < c.minSanity) || (c.maxSanity !== undefined && sanity > c.maxSanity),
    [sanity],
  );
  // Lựa chọn hiển thị theo biến cốt truyện (giống VNStage); lựa chọn bí mật đang khoá thì ẩn hẳn
  const visibleChoices = useMemo(
    () =>
      (climax?.choices ?? []).filter(
        (c) =>
          (!c.requiresFlag || storyFlags.includes(c.requiresFlag)) &&
          (!c.forbidsFlag || !storyFlags.includes(c.forbidsFlag)) &&
          !(c.hiddenWhenLocked && isLocked(c)),
      ),
    [climax, storyFlags, isLocked],
  );

  // ===================================================================
  // ÂM THANH (Web Audio): quạt máy chủ, còi cấp cứu xa, gõ phím, tíc tắc
  // ===================================================================
  const audioRef = useRef<{
    ctx: AudioContext | null;
    master: GainNode | null;
    drone: { oscs: OscillatorNode[]; gain: GainNode; noise: AudioBufferSourceNode } | null;
    noiseBuf: AudioBuffer | null;
  }>({ ctx: null, master: null, drone: null, noiseBuf: null });

  const getAudio = useCallback(() => {
    const a = audioRef.current;
    try {
      if (!a.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        a.ctx = new Ctx();
        a.master = a.ctx.createGain();
        a.master.connect(a.ctx.destination);
        const len = a.ctx.sampleRate * 2;
        a.noiseBuf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
        const data = a.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {}); // Context có thể bị đóng trước khi resume xong (rời màn)
      return a;
    } catch {
      return null;
    }
  }, []);

  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
    const a = audioRef.current;
    if (a.master && a.ctx) a.master.gain.setTargetAtTime((volume / 100) * 0.9, a.ctx.currentTime, 0.1);
  }, [volume]);

  // Khoảng lặng chân không: tắt phụt cả quạt máy chủ, tiếng gõ phím, còi... rồi từ từ trả lại
  useEffect(() => {
    const onSilence = (e: Event) => {
      const { durationMs, fadeBackMs } = (e as CustomEvent<DeadSilenceDetail>).detail;
      const a = audioRef.current;
      if (!a.ctx || !a.master) return;
      const t = a.ctx.currentTime;
      const g = a.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.04);
      g.setValueAtTime(0.0001, t + durationMs / 1000);
      g.linearRampToValueAtTime((volumeRef.current / 100) * 0.9, t + (durationMs + fadeBackMs) / 1000);
    };
    window.addEventListener(DEAD_SILENCE_EVENT, onSilence);
    return () => window.removeEventListener(DEAD_SILENCE_EVENT, onSilence);
  }, []);

  /** Tiếng quạt tản nhiệt ù ù tần số thấp */
  const startDrone = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf || a.drone) return;
    const { ctx } = a;
    a.master.gain.value = (volume / 100) * 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.07, ctx.currentTime, 1.5);
    const oscs = [55, 55.7, 110.3].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    const noise = ctx.createBufferSource();
    noise.buffer = a.noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    noise.connect(bp).connect(ng).connect(lp);
    noise.start();
    lp.connect(gain).connect(a.master);
    a.drone = { oscs, gain, noise };
  }, [getAudio, volume]);

  // ===================================================================
  // NHẠC NỀN "KHÚC BI CA SỐ HOÁ": piano mộc + pad ấm, hoặc file bgm_ch4.mp3 nếu có
  // ===================================================================
  const musicRef = useRef<{
    gain: GainNode | null;
    pad: { oscs: OscillatorNode[]; filter: BiquadFilterNode; lfo: OscillatorNode; gain: GainNode } | null;
    timer: number | null;
    running: boolean;
    nextAt: number;
    step: number;
    file: { el: HTMLAudioElement; src: MediaElementAudioSourceNode } | null;
  }>({ gain: null, pad: null, timer: null, running: false, nextAt: 0, step: 0, file: null });
  const climaxRef = useRef(false);
  useEffect(() => { climaxRef.current = phase === 'decide' && remaining < ELEGY_CLIMAX_SEC; }, [phase, remaining]);
  const bgmVolumeRef = useRef(bgmVolume);
  useEffect(() => {
    bgmVolumeRef.current = bgmVolume;
    const m = musicRef.current;
    const ctx = audioRef.current.ctx;
    if (m.gain && ctx && m.running) m.gain.gain.setTargetAtTime(musicLevel(bgmVolume), ctx.currentTime, 0.1);
  }, [bgmVolume]);

  /** Một nốt piano: thân triangle ấm + hoạ âm sine quãng tám, tắt tự nhiên trong ~2.2s */
  const playPiano = useCallback((freq: number, at: number, gainVal: number, dur = 2.2) => {
    const ctx = audioRef.current.ctx;
    const out = musicRef.current.gain;
    if (!ctx || !out) return;
    const t = Math.max(ctx.currentTime, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = freq;
    const shine = ctx.createOscillator();
    shine.type = 'sine';
    shine.frequency.value = freq * 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.35;
    body.connect(g);
    shine.connect(sg).connect(g);
    g.connect(out);
    body.start(t);
    shine.start(t);
    body.stop(t + dur + 0.05);
    shine.stop(t + dur + 0.05);
    body.onended = () => {
      try { body.disconnect(); shine.disconnect(); sg.disconnect(); g.disconnect(); } catch {}
    };
  }, []);

  /** Lên lịch trước ~0.3s từng hợp âm theo đồng hồ AudioContext (không lệch nhịp như setInterval) */
  const scheduleElegy = useCallback(() => {
    const ctx = audioRef.current.ctx;
    const m = musicRef.current;
    if (!ctx || !m.gain) return;
    while (m.nextAt < ctx.currentTime + 0.3) {
      const at = Math.max(m.nextAt, ctx.currentTime);
      const chord = ELEGY_CHORDS[m.step % ELEGY_CHORDS.length];
      m.pad?.oscs.forEach((o, i) => o.frequency.setTargetAtTime(chord.pad[i % chord.pad.length] / 2, at, 0.6));
      if (!climaxRef.current) {
        // Bass dứt khoát đầu nhịp, các nốt rải buông lơi phía sau (lệch tay vài mili-giây)
        playPiano(chord.bass, at, 0.12, 3.0);
        chord.arps.forEach((f, i) => playPiano(f, at + 0.8 * (i + 1) + Math.random() * 0.03, 0.05 - i * 0.006));
        if (m.step % 2 === 1) playPiano(chord.melody * 2, at + 2.6, 0.035, 2.6);
      }
      m.nextAt = at + ELEGY_CHORD_SEC;
      m.step++;
    }
  }, [playPiano]);

  const startMusic = useCallback(() => {
    const a = getAudio();
    const m = musicRef.current;
    if (!a?.ctx || !a.master || m.gain) return;
    const { ctx } = a;
    m.running = true;
    m.gain = ctx.createGain();
    m.gain.gain.value = 0.0001;
    m.gain.gain.setTargetAtTime(musicLevel(bgmVolumeRef.current), ctx.currentTime, 1.2);
    m.gain.connect(a.master);

    // Pad ấm ngân liên tục, lọc thông thấp 350Hz cho không gian hư vô
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 60;
    lfo.connect(lfoDepth).connect(filter.frequency);
    const padGain = ctx.createGain();
    padGain.gain.value = 0.06;
    const oscs = ELEGY_CHORDS[0].pad.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'sawtooth' : 'triangle';
      o.frequency.value = f / 2;
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(padGain).connect(m.gain);
    lfo.start();
    m.pad = { oscs, filter, lfo, gain: padGain };

    m.nextAt = ctx.currentTime + 0.4;
    m.step = 0;
    scheduleElegy();
    m.timer = window.setInterval(scheduleElegy, 100);

    // Có file nhạc thì thay hẳn phần tổng hợp (nốt trầm đếm giây vẫn giữ)
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener('canplaythrough', () => {
      const c = audioRef.current.ctx;
      if (!c || !m.gain || !m.running || m.file) return;
      try {
        const src = c.createMediaElementSource(el);
        src.connect(m.gain);
        m.file = { el, src };
        if (m.timer !== null) window.clearInterval(m.timer);
        m.timer = null;
        m.pad?.gain.gain.setTargetAtTime(0, c.currentTime, 0.8);
        void el.play().catch(() => {});
      } catch {}
    }, { once: true });
    el.addEventListener('error', () => el.removeAttribute('src'), { once: true });
    el.src = ELEGY_URL;
  }, [getAudio, scheduleElegy]);

  /** Dừng nhạc (fadeSec > 0: dịu dần rồi mới tháo node) */
  const stopMusic = useCallback((fadeSec: number) => {
    const m = musicRef.current;
    const ctx = audioRef.current.ctx;
    if (m.timer !== null) window.clearInterval(m.timer);
    m.timer = null;
    m.running = false;
    const teardown = () => {
      try {
        m.pad?.oscs.forEach((o) => { o.stop(); o.disconnect(); });
        m.pad?.lfo.stop();
        m.pad?.filter.disconnect();
        m.pad?.gain.disconnect();
        if (m.file) {
          m.file.el.pause();
          m.file.el.removeAttribute('src');
          m.file.src.disconnect();
        }
        m.gain?.disconnect();
      } catch {}
      m.pad = null;
      m.file = null;
      m.gain = null;
    };
    if (ctx && m.gain && fadeSec > 0) {
      const g = m.gain.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
      g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fadeSec);
      window.setTimeout(teardown, fadeSec * 1000 + 100);
    } else {
      teardown();
    }
  }, []);

  const playKey = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = a.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 + Math.random() * 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(bp).connect(g).connect(a.master);
    src.start(t, Math.random());
    src.stop(t + 0.035);
  }, [getAudio]);

  /** Tíc tắc đếm ngược: càng gần 0 càng to và đanh; nhạc còn chạy thì thêm một nốt trầm nặng trĩu */
  const playTick = useCallback((sec: number) => {
    const a = getAudio();
    if (!a?.ctx || !a.master) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    const k = Math.max(0, Math.min(1, (ELEGY_CLIMAX_SEC - sec) / ELEGY_CLIMAX_SEC));
    if (musicRef.current.running) {
      playPiano(55, t, 0.13 + k * 0.05, 1.6);
      playPiano(110, t, 0.05, 1.2);
    }
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1000 + k * 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 + k * 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.06);
    if (sec <= MELTDOWN_SEC && a.noiseBuf) {
      // Tích... tắc: tiếng gõ gỗ đanh gọn, giây chẵn lẻ lệch tông
      const src = ctx.createBufferSource();
      src.buffer = a.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = sec % 2 ? 3200 : 2300;
      bp.Q.value = 6;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.6, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(bp).connect(cg).connect(a.master);
      src.start(t, Math.random());
      src.stop(t + 0.05);
    }
  }, [getAudio, playPiano]);

  /** Quạt tản nhiệt gào rú khi quá tải: nối vào nhánh quạt nên kết cục tắt quạt là tắt luôn tiếng gào */
  const roarFan = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.noiseBuf || !a.drone) return;
    const { ctx, drone } = a;
    const t = ctx.currentTime;
    drone.gain.gain.setTargetAtTime(0.14, t, 1.2);
    drone.oscs.forEach((o) => o.frequency.setTargetAtTime(o.frequency.value * 1.7, t, 2));
    const noise = ctx.createBufferSource();
    noise.buffer = a.noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.linearRampToValueAtTime(1500, t + 15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 3);
    noise.connect(bp).connect(g).connect(drone.gain);
    noise.start(t);
  }, [getAudio]);

  /** Rơ-le điện "tạch": giữ càng lâu càng nặng */
  const playRelay = useCallback((p: number) => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = a.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600 + p * 1600;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 + p * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    src.connect(bp).connect(g).connect(a.master);
    src.start(t, Math.random());
    src.stop(t + 0.03);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 90;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.04 + p * 0.04, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    o.connect(og).connect(a.master);
    o.start(t);
    o.stop(t + 0.02);
  }, [getAudio]);

  /** Tim đập "thình-thịch" */
  const playHeart = useCallback((p: number) => {
    const a = getAudio();
    if (!a?.ctx || !a.master) return;
    const { ctx, master } = a;
    [0, 0.16].forEach((dt, i) => {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(62, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime((0.3 + p * 0.2) * (i ? 0.7 : 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.16);
    });
  }, [getAudio]);

  /** Cầu dao ngắt "TÁCH" dứt khoát */
  const playBreaker = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = a.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(hp).connect(g).connect(a.master);
    src.start(t);
    src.stop(t + 0.07);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og).connect(a.master);
    o.start(t);
    o.stop(t + 0.36);
  }, [getAudio]);

  /** Còi xe cấp cứu vọng lại từ ký ức (rất xa, lọc trầm) */
  const playSiren = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(i % 2 === 0 ? 660 : 880, t + i * 0.55);
    }
    o.frequency.linearRampToValueAtTime(560, t + 3.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + 3.4);
    o.connect(lp).connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 3.5);
  }, [getAudio]);

  /** Tiếng an ninh đập cửa phòng máy ngoài đời thực */
  const playBang = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf) return;
    const { ctx } = a;
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i * 0.28;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(a.master);
      o.start(t);
      o.stop(t + 0.26);
    }
  }, [getAudio]);

  /** Hiệu ứng âm thanh riêng cho từng kết cục */
  const playEndingSound = useCallback((kind: EndingKind) => {
    const a = getAudio();
    if (!a?.ctx || !a.master || !a.noiseBuf) return;
    const { ctx } = a;
    const t = ctx.currentTime;
    if (kind === 'A') {
      // Quạt tản nhiệt lịm dần rồi tắt hẳn
      a.drone?.oscs.forEach((o) => o.frequency.exponentialRampToValueAtTime(18, t + 2.4));
      a.drone?.gain.gain.setTargetAtTime(0, t + 0.6, 0.6);
    } else if (kind === 'S') {
      // Tiếng xoá dữ liệu: một nốt cao trượt dần xuống rồi tắt, quạt vẫn quay đều
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1760, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.3);
      g.gain.linearRampToValueAtTime(0, t + 2.4);
      o.connect(g).connect(a.master);
      o.start(t);
      o.stop(t + 2.5);
    } else if (kind === 'B') {
      // Chuông báo động quá tải
      const o = ctx.createOscillator();
      o.type = 'square';
      for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t + i * 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t);
      g.gain.linearRampToValueAtTime(0, t + 2.3);
      o.connect(g).connect(a.master);
      o.start(t);
      o.stop(t + 2.3);
      a.drone?.oscs.forEach((osc) => osc.frequency.linearRampToValueAtTime(osc.frequency.value * 1.6, t + 2));
    } else {
      // "TẠCH" cầu dao sập + màn hình tuyết
      a.drone?.gain.gain.setValueAtTime(0, t);
      const click = ctx.createBufferSource();
      click.buffer = a.noiseBuf;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.35, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      click.connect(cg).connect(a.master);
      click.start(t);
      click.stop(t + 0.06);
      const stat = ctx.createBufferSource();
      stat.buffer = a.noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0, t + 0.15);
      sg.gain.linearRampToValueAtTime(0.06, t + 0.3);
      sg.gain.linearRampToValueAtTime(0, t + 2.4);
      stat.connect(hp).connect(sg).connect(a.master);
      stat.start(t + 0.15);
      stat.stop(t + 2.5);
    }
  }, [getAudio]);

  /** Chuông gió khẽ ngân: vài nốt ngũ cung cao rơi lệch nhau rồi tắt dần */
  const playWindChime = useCallback(() => {
    const a = getAudio();
    if (!a?.ctx || !a.master) return;
    const { ctx, master } = a;
    const notes = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < 7; i++) {
      const f = notes[Math.floor(Math.random() * notes.length)];
      [1, 2.76].forEach((mul, j) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime((j ? 0.01 : 0.04) * (1 - i * 0.08), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (j ? 0.8 : 2.4));
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 2.5);
      });
      t += 0.11 + Math.random() * 0.14;
    }
  }, [getAudio]);

  const soundRef = useRef({ playKey, playTick, playSiren, playBang, playWindChime, playRelay, playHeart, playBreaker });
  useEffect(() => {
    soundRef.current = { playKey, playTick, playSiren, playBang, playWindChime, playRelay, playHeart, playBreaker };
  }, [playKey, playTick, playSiren, playBang, playWindChime, playRelay, playHeart, playBreaker]);

  // Bật tiếng quạt khi vào màn, tắt hẳn AudioContext khi rời màn
  useEffect(() => {
    startDrone();
    startMusic();
    const a = audioRef.current;
    return () => {
      stopMusic(0);
      try {
        a.drone?.oscs.forEach((o) => o.stop());
        a.drone?.noise.stop();
        void a.ctx?.close();
      } catch {}
      a.ctx = null;
      a.master = null;
      a.drone = null;
    };
  }, [startDrone, startMusic, stopMusic]);

  // ===================================================================
  // HIỆU ỨNG GÕ CHỮ (máy in ma trận)
  // ===================================================================
  const typingRef = useRef<{ timer: number | null; key: string; full: string; idx: number; onDone?: () => void }>({
    timer: null, key: '', full: '', idx: 0,
  });

  const startTyping = useCallback((key: string, full: string, onDone?: () => void) => {
    const tr = typingRef.current;
    if (tr.timer) window.clearInterval(tr.timer);
    tr.key = key;
    tr.full = full;
    tr.idx = 0;
    tr.onDone = onDone;
    tr.timer = window.setInterval(() => {
      tr.idx = Math.min(full.length, tr.idx + TYPE_CHARS_PER_TICK);
      const ch = full[tr.idx - 1];
      if (tr.idx % 6 < TYPE_CHARS_PER_TICK && ch !== ' ' && ch !== '\n') soundRef.current.playKey();
      const done = tr.idx >= full.length;
      setTyped({ key, text: full.slice(0, tr.idx), done });
      if (done) {
        if (tr.timer) window.clearInterval(tr.timer);
        tr.timer = null;
        tr.onDone?.();
      }
    }, TYPE_INTERVAL_MS);
  }, []);

  /** Hiện ngay toàn bộ dòng đang gõ; trả về true nếu thực sự đang gõ dở */
  const finishTyping = useCallback(() => {
    const tr = typingRef.current;
    if (!tr.timer) return false;
    window.clearInterval(tr.timer);
    tr.timer = null;
    tr.idx = tr.full.length;
    setTyped({ key: tr.key, text: tr.full, done: true });
    tr.onDone?.();
    return true;
  }, []);

  // Màn khởi động: gõ lời dẫn ch4_start
  useEffect(() => {
    startTyping('boot', nodeText(BOOT_NODE));
    const tr = typingRef.current;
    return () => {
      if (tr.timer) window.clearInterval(tr.timer);
    };
  }, [startTyping]);

  // ===================================================================
  // ĐIỀU HƯỚNG
  // ===================================================================

  const openLog = useCallback((i: number) => {
    if (phaseRef.current !== 'files' || i > readCount || i < 0 || i >= LOG_FILES.length) return;
    if (!openedFirst) {
      // Lựa chọn duy nhất của ch4_start ("mở lần lượt từng tệp") mang theo sanityImpact
      const impact = story[BOOT_NODE]?.choices?.[0]?.sanityImpact ?? 0;
      if (impact !== 0) setSanity?.((prev) => Math.max(0, Math.min(100, prev + impact)));
      setOpenedFirst(true);
    }
    setViewing(i);
    startTyping(`log${i}`, nodeText(LOG_FILES[i].node), () => setReadCount((c) => Math.max(c, i + 1)));
  }, [readCount, openedFirst, setSanity, startTyping]);

  const openMom = useCallback(() => {
    if (phaseRef.current !== 'files') return;
    if (!momRead) soundRef.current.playWindChime();
    setViewing(MOM_INDEX);
    startTyping(`log${MOM_INDEX}`, nodeText(MOM_NODE), () => {
      if (momRead) return;
      setMomRead(true);
      onSetStoryFlag?.(MOM_FLAG);
      // Lựa chọn duy nhất của node ("quay lại danh sách hồ sơ") mang theo phần Sanity hồi lại
      const impact = story[MOM_NODE]?.choices?.[0]?.sanityImpact ?? 0;
      if (impact !== 0) {
        setSanity?.((prev) => Math.max(0, Math.min(100, prev + impact)));
        setCalmToast(impact);
        window.setTimeout(() => setCalmToast(null), CALM_TOAST_MS);
      }
    });
  }, [momRead, onSetStoryFlag, setSanity, startTyping]);

  /** An nói với Miên qua micro webcam; Miên đáp lại rồi mới tới bảng quyết định */
  const answer = useCallback((c: Choice | undefined) => {
    const tr = typingRef.current;
    if (!c || phaseRef.current !== 'call' || reply || tr.key !== 'call' || tr.timer) return;
    if (c.sanityImpact) setSanity?.((prev) => Math.max(0, Math.min(100, prev + c.sanityImpact)));
    setReply({ node: c.nextNodeId, line: splitChoice(c.text).sub || c.text });
    camMoodRef.current = { mood: REPLY_MOOD[c.nextNodeId] ?? 'sob', since: performance.now() };
    startTyping('reply', nodeText(c.nextNodeId));
  }, [reply, setSanity, startTyping]);

  const advance = useCallback(() => {
    if (finishTyping()) return;
    const ph = phaseRef.current;
    if (ph === 'files') {
      // Log 1 → Log 2 → Log 3 → tin nhắn mẹ → đóng thư mục
      if (readCount >= LOG_FILES.length && !momRead) {
        openMom();
      } else if (readCount >= LOG_FILES.length) {
        setPhase('reflect');
        startTyping('reflect', nodeText(REFLECT_NODE));
      } else if (viewing === null || viewing === MOM_INDEX || viewing + 1 === readCount) {
        openLog(readCount);
      }
    } else if (ph === 'reflect') {
      setPhase('call');
      // Miên hiện lên webcam: mọi âm thanh tắt phụt, chỉ còn một tiếng thở dài;
      // tiếng an ninh đập cửa chỉ vang lên khi âm thanh đã quay lại
      audioEngine.triggerDeadSilence(2000, 1200, 'sigh');
      window.setTimeout(() => {
        if (phaseRef.current === 'call' || phaseRef.current === 'decide') {
          bangAtRef.current = performance.now();
          soundRef.current.playBang();
        }
      }, 3200);
      startTyping('call', nodeText(CALL_NODE));
    } else if (ph === 'call' && reply) {
      setPhase('decide');
      startTyping('decide', nodeText(CLIMAX_NODE));
    }
  }, [finishTyping, readCount, viewing, momRead, openLog, openMom, startTyping, reply]);

  const runEnding = useCallback((nextNodeId: string, impact: number) => {
    if (endedRef.current) return;
    endedRef.current = true;
    finishTyping();
    const kind = endingKindOf(nextNodeId);
    setPhase('ending');
    setEnding(kind);
    if (impact !== 0) setSanity?.((prev) => Math.max(0, Math.min(100, prev + impact)));
    playEndingSound(kind);
    stopMusic(ELEGY_FADE_SEC);
    window.setTimeout(() => onTriggerEnding(nextNodeId), ENDING_DELAY_MS);
  }, [finishTyping, onTriggerEnding, playEndingSound, setSanity, stopMusic]);

  const choose = useCallback((c: Choice | undefined) => {
    if (!c || phaseRef.current !== 'decide' || isLocked(c)) return;
    runEnding(c.nextNodeId, c.sanityImpact);
  }, [isLocked, runEnding]);

  // Hết giờ → cầu dao bị giật (Ending C)
  const timeoutRef = useRef(() => {});
  useEffect(() => {
    timeoutRef.current = () => runEnding(climax?.timeoutNodeId ?? 'ending_segfault_1', 0);
  }, [climax, runEnding]);

  // ===================================================================
  // GIỮ 3 GIÂY ĐỂ CHỐT KẾT CỤC
  // ===================================================================
  const choicesRef = useRef(visibleChoices);
  useEffect(() => { choicesRef.current = visibleChoices; }, [visibleChoices]);
  const focusIdx = focusPick ?? Math.max(0, visibleChoices.findIndex((c) => !isLocked(c)));
  useEffect(() => { focusRef.current = focusIdx; }, [focusIdx]);

  const focusChoice = useCallback((i: number) => {
    focusRef.current = i;
    setFocusPick(i);
  }, []);

  /** Nhảy tới lựa chọn kế tiếp chưa bị khoá */
  const moveFocus = useCallback((dir: 1 | -1) => {
    const list = choicesRef.current;
    for (let k = 1; k <= list.length; k++) {
      const i = (((focusRef.current + dir * k) % list.length) + list.length) % list.length;
      if (!isLocked(list[i])) { focusChoice(i); return; }
    }
  }, [isLocked, focusChoice]);

  /** key: phím đang giữ ('' = chuột/cảm ứng) để chỉ thả đúng phím đó */
  const startHold = useCallback((idx: number, key = '') => {
    const h = holdRef.current;
    const c = choicesRef.current[idx];
    const tr = typingRef.current;
    if (h.active || !c || isLocked(c) || phaseRef.current !== 'decide' || endedRef.current || tr.key !== 'decide' || tr.timer) return;
    // "Buông xuôi hai tay" không cần giữ: chỉ đứng yên để họ giật cầu dao
    if (endingKindOf(c.nextNodeId) === 'C') { choose(c); return; }
    const now = performance.now();
    if (h.idx !== idx) h.progress = 0;   // Đổi lựa chọn thì đếm lại từ đầu
    Object.assign(h, { idx, active: true, start: now - h.progress * HOLD_MS, nextRelay: now, nextBeat: now, key });
  }, [isLocked, choose]);

  const releaseHold = useCallback(() => {
    holdRef.current.active = false;
    holdRef.current.key = '';
  }, []);

  // Giữ đủ 3 giây: chớp trắng + "TÁCH" cầu dao rồi vào kết cục
  const confirmRef = useRef<(idx: number) => void>(() => {});
  useEffect(() => {
    confirmRef.current = (idx) => {
      const c = choicesRef.current[idx];
      if (!c) return;
      soundRef.current.playBreaker();
      const fl = flashRef.current;
      if (fl) {
        fl.style.transition = 'none';
        fl.style.opacity = '1';
        void fl.offsetWidth;
        fl.style.transition = 'opacity 0.8s ease-out';
        fl.style.opacity = '0';
      }
      choose(c);
    };
  }, [choose]);

  // Vòng lặp giữ nút: thanh tiến trình + rung màn hình ghi thẳng vào DOM; rơ-le và nhịp tim dồn dập dần
  useEffect(() => {
    if (phase !== 'decide') return;
    const stage = stageRef.current;
    const h = holdRef.current;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (h.active && pausedRef.current) h.active = false;
      if (h.active) {
        h.progress = Math.min(1, (now - h.start) / HOLD_MS);
        if (now >= h.nextRelay) { soundRef.current.playRelay(h.progress); h.nextRelay = now + 240 - h.progress * 185; }
        if (now >= h.nextBeat) { soundRef.current.playHeart(h.progress); h.nextBeat = now + 820 - h.progress * 480; }
      } else if (h.progress > 0) {
        h.progress = Math.max(0, h.progress - dt / HOLD_DECAY_MS);
      }
      barRefs.current.forEach((bar, i) => {
        if (bar) bar.style.transform = `scaleX(${i === h.idx ? h.progress : 0})`;
      });
      if (stage) {
        const s = h.active ? h.progress * 3 : 0;
        stage.style.transform = s > 0 ? `translate(${((Math.random() - 0.5) * 2 * s).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * s).toFixed(1)}px)` : '';
      }
      if (h.active && h.progress >= 1) {
        h.active = false;
        if (stage) stage.style.transform = '';
        confirmRef.current(h.idx);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      h.active = false;
      h.progress = 0;
      if (stage) stage.style.transform = '';
    };
  }, [phase]);

  // Bàn phím: Space/Enter tiếp tục, phím số mở tệp / trả lời Miên.
  // Bảng quyết định: phím số hoặc ↑↓ để nhắm, giữ Space/Enter 3 giây để chốt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const confirmKey = e.key === ' ' || e.key === 'Enter';
      if (confirmKey) e.preventDefault();
      if (e.repeat) return;
      const n = parseInt(e.key, 10);
      if (phaseRef.current === 'decide') {
        if (confirmKey) {
          if (!finishTyping()) startHold(focusRef.current, e.key);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          moveFocus(e.key === 'ArrowUp' ? -1 : 1);
        } else if (n >= 1 && n <= choicesRef.current.length && !isLocked(choicesRef.current[n - 1])) {
          focusChoice(n - 1);
        }
        return;
      }
      if (confirmKey) {
        advance();
        return;
      }
      if (Number.isNaN(n) || n < 1) return;
      if (phaseRef.current === 'files') {
        if (n - 1 === MOM_INDEX) openMom();
        else openLog(n - 1);
      }
      else if (phaseRef.current === 'call') answer(callChoices[n - 1]);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (holdRef.current.key && e.key === holdRef.current.key) releaseHold();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseHold);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseHold);
    };
  }, [advance, openLog, openMom, answer, callChoices, finishTyping, startHold, releaseHold, moveFocus, focusChoice, isLocked]);

  // ===================================================================
  // ĐỒNG HỒ ĐẾM NGƯỢC 03:27:45 → 03:30:00
  // ===================================================================
  useEffect(() => {
    let endAt = performance.now() + COUNTDOWN_START * 1000;
    let last = performance.now();
    let lastSec = COUNTDOWN_START;
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const ph = phaseRef.current;
      if (ph === 'ending') return;
      if (pausedRef.current || document.hidden) { endAt += dt; return; }
      let rem = (endAt - now) / 1000;
      if (ph !== 'decide' && rem < DECISION_GRACE) {
        endAt = now + DECISION_GRACE * 1000;
        rem = DECISION_GRACE;
      }
      const sec = Math.max(0, Math.ceil(rem));
      if (sec !== lastSec) {
        lastSec = sec;
        remainingRef.current = sec;
        setRemaining(sec);
        if (sec <= 30 && sec > 0 && ph === 'decide') soundRef.current.playTick(sec);
      }
      if (rem <= 0) timeoutRef.current();
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // ===================================================================
  // ENDING M — "KHÔNG AI Ở LẠI": rời tab quá 20 giây khi Miên đang gọi / lúc quyết định.
  // Đồng hồ đã dừng khi tab ẩn, nên giờ rời đi chính là giờ trên màn hình lúc đó.
  // Hết 20 giây thì tiếng quạt tắt ngay cả khi tab còn ẩn; kết cục chỉ hiện khi quay lại.
  // ===================================================================
  const triggerRef = useRef(onTriggerEnding);
  useEffect(() => { triggerRef.current = onTriggerEnding; }, [onTriggerEnding]);
  useEffect(() => {
    let leftAt = 0;
    let leftClock = '';
    let silenceTimer: number | null = null;
    const onVisibility = () => {
      const ph = phaseRef.current;
      if (document.hidden) {
        if (endedRef.current || pausedRef.current || (ph !== 'call' && ph !== 'decide')) return;
        leftAt = Date.now();
        leftClock = fmtClock(SERVER_CUT_SECONDS - remainingRef.current);
        silenceTimer = window.setTimeout(() => {
          const a = audioRef.current;
          if (a.ctx && a.master) a.master.gain.setValueAtTime(0, a.ctx.currentTime);
        }, ABANDON_MS);
        return;
      }
      if (silenceTimer) window.clearTimeout(silenceTimer);
      silenceTimer = null;
      if (leftAt && !endedRef.current && Date.now() - leftAt >= ABANDON_MS) {
        endedRef.current = true;
        finishTyping();
        triggerRef.current(ABANDON_NODE, leftClock);
      }
      leftAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (silenceTimer) window.clearTimeout(silenceTimer);
    };
  }, [finishTyping]);

  // Còi cấp cứu xa xăm + tiếng đập cửa định kỳ
  useEffect(() => {
    const siren = window.setInterval(() => {
      if (phaseRef.current !== 'ending' && !pausedRef.current) soundRef.current.playSiren();
    }, 17000);
    const bang = window.setInterval(() => {
      const ph = phaseRef.current;
      if ((ph === 'call' || ph === 'decide') && !pausedRef.current) {
        bangAtRef.current = performance.now();
        soundRef.current.playBang();
      }
    }, 5200);
    const first = window.setTimeout(() => soundRef.current.playSiren(), 4000);
    return () => {
      window.clearInterval(siren);
      window.clearInterval(bang);
      window.clearTimeout(first);
    };
  }, []);

  // ===================================================================
  // MÁY CHỦ PHÂN RÃ THEO ĐỒNG HỒ
  // ===================================================================
  // Chỉ phân rã khi đã tới bảng quyết định (lúc còn nghe Miên thì máy vẫn gượng chạy êm)
  const overheat = remaining <= OVERHEAT_SEC && (phase === 'decide' || phase === 'ending');
  const meltdown = remaining <= MELTDOWN_SEC && phase === 'decide';

  // ≤45s: cứ 3-4 giây chữ trên terminal lại giật + lỗi font trong 80ms
  useEffect(() => {
    if (!overheat || phase === 'ending') return;
    let id = 0;
    let off = 0;
    const next = () => {
      id = window.setTimeout(() => {
        if (!pausedRef.current) {
          setGlitchSeed(1 + Math.floor(Math.random() * 100000));
          off = window.setTimeout(() => setGlitchSeed(0), GLITCH_MS);
        }
        next();
      }, 3000 + Math.random() * 1000);
    };
    next();
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(off);
    };
  }, [overheat, phase]);

  // ≤20s: piano tắt lịm, quạt tản nhiệt gào rú, chỉ còn tích tắc đếm từng giây
  useEffect(() => {
    if (!meltdown) return;
    stopMusic(1.5);
    roarFan();
  }, [meltdown, stopMusic, roarFan]);

  // ===================================================================
  // VÒNG LẶP VẼ: hư vô + webcam
  // ===================================================================
  useEffect(() => {
    const vc = voidCanvasRef.current;
    const cc = camCanvasRef.current;
    const stage = stageRef.current;
    if (!vc || !cc || !stage) return;
    const vg = vc.getContext('2d');
    const cg = cc.getContext('2d');
    if (!vg || !cg) return;
    cg.imageSmoothingEnabled = false;

    let sim = createVoidSim(1, 1);
    const resize = () => {
      const w = Math.max(80, Math.floor(stage.clientWidth / VOID_SCALE));
      const h = Math.max(45, Math.floor(stage.clientHeight / VOID_SCALE));
      if (vc.width !== w || vc.height !== h) {
        vc.width = w;
        vc.height = h;
        sim = createVoidSim(w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const mien = new Image();
    mien.src = '/assets/ModelMIEN/cryingMien.png';
    const pleading = new Image();
    pleading.src = '/assets/ModelMIEN/PleadingMien.png';

    let raf = 0;
    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      frame++;
      drawVoid(vg, vc.width, vc.height, sim, t, endingRef.current);
      const cam = camMoodRef.current;
      drawWebcam(cg, t, mien, pleading, now - bangAtRef.current, endingRef.current, frame, cam.mood, now - cam.since);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // ===================================================================
  // GIAO DIỆN
  // ===================================================================
  const shownText = (key: string) => (typed.key === key ? typed.text : '');
  const doneFor = (key: string) => typed.key === key && typed.done;

  // Khung lời Miên luôn cuộn theo dòng đang gõ
  useEffect(() => {
    const el = miePanelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [typed.text, reply]);

  const serverClock = fmtClock(SERVER_CUT_SECONDS - remaining);
  const urgent = remaining <= 30;
  const camLarge = phase === 'call' || phase === 'decide' || phase === 'ending';
  const termKey = phase === 'files' ? (viewing === null ? 'boot' : `log${viewing}`) : phase === 'reflect' ? 'reflect' : phase === 'call' ? 'call' : 'decide';
  const termTitle =
    phase === 'files'
      ? viewing === null ? tx('AURA_OS v3.14 // KHỞI ĐỘNG') : viewing === MOM_INDEX ? 'TIN_NHAN_ME.SMS' : LOG_FILES[viewing].file
      : phase === 'reflect' ? tx('AN // BẢN SAO KÝ ỨC #314')
      : phase === 'call' ? tx('KẾT NỐI WEBCAM // PHÒNG MÁY 312')
      : tx('QUYẾT ĐỊNH CUỐI CÙNG');
  const canContinue =
    (phase === 'files' && doneFor(termKey) && (readCount >= LOG_FILES.length || viewing === null || viewing === MOM_INDEX || viewing + 1 === readCount)) ||
    (phase === 'reflect' && doneFor(termKey)) ||
    (phase === 'call' && !!reply && doneFor('reply'));
  const continueLabel =
    phase === 'files'
      ? readCount < LOG_FILES.length ? tx('Mở tệp [{0}]', readCount + 1)
        : momRead ? tx('Đóng thư mục') : tx('Mở tệp [{0}]', MOM_INDEX + 1)
      : tx('Tiếp tục');
  // Nhiệt độ CPU leo dần theo đồng hồ, chạm ngưỡng thì báo quá nhiệt
  const cpuTemp = 62 + Math.round(Math.min(1, (COUNTDOWN_START - remaining) / (COUNTDOWN_START - OVERHEAT_SEC)) * 17);
  const glitching = glitchSeed > 0 && overheat && phase !== 'ending';
  const termText = phase === 'call'
    ? tx('> ĐANG NHẬN TÍN HIỆU HÌNH ẢNH TỪ THẾ GIỚI THỰC...\n> NGUỒN: CAM_02 • PHÒNG MÁY 312\n> ĐỘ TRỄ: 0.314s')
    : shownText(termKey);

  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden font-mono select-none">
      <style>{`
        @keyframes c4-flicker { 0%,100% { opacity: 1 } 47% { opacity: .96 } 50% { opacity: .9 } 53% { opacity: .97 } }
        @keyframes c4-rgb { 0% { transform: translate(0,0) } 20% { transform: translate(-3px,1px) } 40% { transform: translate(3px,-2px) } 60% { transform: translate(-2px,2px) } 80% { transform: translate(2px,0) } 100% { transform: translate(0,0) } }
        @keyframes c4-blink { 50% { opacity: .25 } }
        .c4-phosphor { text-shadow: 0 0 6px rgba(103,232,249,.55), 0 0 1px rgba(103,232,249,.9); }
        .c4-rgb-split { animation: c4-rgb .12s steps(2) infinite; text-shadow: -2px 0 rgba(255,0,60,.85), 2px 0 rgba(0,255,255,.7); }
        .c4-glitch { animation: c4-rgb ${GLITCH_MS}ms steps(2) 1; text-shadow: -2px 0 rgba(255,0,60,.8), 2px 0 rgba(0,255,255,.6) !important; }
        @keyframes c4-chroma {
          0%   { box-shadow: inset 0 0 120px rgba(0,0,0,.95), inset 5px 0 0 rgba(255,0,60,.55), inset -5px 0 0 rgba(0,255,255,.45), 0 0 46px rgba(239,68,68,.3) }
          33%  { box-shadow: inset 0 0 120px rgba(0,0,0,.95), inset -4px 2px 0 rgba(255,0,60,.65), inset 6px -2px 0 rgba(0,255,255,.5), 0 0 30px rgba(34,211,238,.25) }
          66%  { box-shadow: inset 0 0 120px rgba(0,0,0,.95), inset 2px -3px 0 rgba(255,0,60,.5), inset -3px 3px 0 rgba(0,255,255,.6), 0 0 56px rgba(239,68,68,.35) }
          100% { box-shadow: inset 0 0 120px rgba(0,0,0,.95), inset 5px 0 0 rgba(255,0,60,.55), inset -5px 0 0 rgba(0,255,255,.45), 0 0 46px rgba(239,68,68,.3) }
        }
      `}</style>

      {/* Khung CRT 16:9 cong lồi */}
      <div
        ref={stageRef}
        className={`relative w-full aspect-video max-h-full overflow-hidden rounded-[28px] ${ending === 'B' ? 'c4-rgb-split' : ''}`}
        style={{
          maxWidth: 'calc(100vh * 16 / 9)',
          animation: meltdown ? 'c4-flicker 4s infinite, c4-chroma .16s steps(3) infinite' : 'c4-flicker 4s infinite',
          boxShadow: 'inset 0 0 120px rgba(0,0,0,.95), 0 0 40px rgba(34,211,238,.08)',
        }}
      >
        <canvas ref={voidCanvasRef} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />

        {/* Thanh tiêu đề hệ thống */}
        <div className="absolute left-[4%] top-[4%] text-[clamp(9px,0.95vw,13px)] text-amber-300/80 tracking-widest">
          {tx('AURA OS v3.14 // NODE-314 • PHÒNG MÁY 312 — VIỆN NGHIÊN CỨU')}
          <div className="text-zinc-500 mt-0.5">
            SANITY: <span className={sanity <= 35 ? 'text-red-400' : 'text-cyan-300'}>{Math.round(sanity)}%</span>
            <span className="ml-5">CPU: </span>
            {overheat ? (
              <span className="text-red-500 font-bold" style={{ animation: 'c4-blink .5s steps(1) infinite', textShadow: '0 0 8px rgba(239,68,68,.8)' }}>91°C - OVERHEAT</span>
            ) : (
              <span className={cpuTemp >= 75 ? 'text-amber-300' : 'text-cyan-300'}>{cpuTemp}°C</span>
            )}
          </div>
        </div>

        {/* ===== TERMINAL CRT CHÍNH ===== */}
        <div
          className="absolute left-[4%] top-[13%] bottom-[17%] w-[58%] flex flex-col bg-[#020b10]/90 border border-cyan-800/70 rounded-md shadow-[0_0_40px_rgba(34,211,238,0.15),inset_0_0_30px_rgba(34,211,238,0.06)]"
          onClick={() => { if (phase !== 'decide' && phase !== 'ending') advance(); }}
        >
          {/* Đang đọc tin nhắn mẹ: thanh tiêu đề chuyển sang vàng hổ phách dịu */}
          <div className={`flex justify-between items-center px-3 py-1.5 border-b text-[clamp(9px,0.9vw,12px)] transition-colors duration-700 ${
            phase === 'files' && viewing === MOM_INDEX ? 'border-amber-700/70 bg-amber-950/30 text-amber-300' : 'border-cyan-900/70 text-cyan-500/90'
          }`}>
            <span>{phase === 'files' && viewing === MOM_INDEX ? 'C:\\USERS\\AN\\DRAFTS\\>' : 'C:\\MEMORY_DUMP\\SECTOR_1705\\>'}</span>
            <span className="text-amber-300/90 truncate ml-3">{termTitle}</span>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Danh sách tệp (mở khoá tuần tự) */}
            {phase === 'files' && (
              <div className="w-[36%] border-r border-cyan-900/60 p-2 space-y-1.5 text-[clamp(9px,0.85vw,12px)]">
                {LOG_FILES.map((f, i) => {
                  const unlocked = i <= readCount;
                  const read = i < readCount;
                  return (
                    <button
                      key={f.file}
                      onClick={(e) => { e.stopPropagation(); openLog(i); }}
                      disabled={!unlocked}
                      className={`w-full text-left px-2 py-1.5 rounded border transition-colors ${
                        viewing === i
                          ? 'border-cyan-400 bg-cyan-950/60 text-cyan-100'
                          : unlocked
                          ? 'border-cyan-900 hover:border-cyan-500 text-cyan-300 cursor-pointer'
                          : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      <div className="font-bold truncate">[{i + 1}] {f.file}</div>
                      <div className="opacity-70 truncate">{unlocked ? tx(f.label) : tx('🔒 Đọc tệp trước để mở')}{read ? ' ✓' : ''}</div>
                    </button>
                  );
                })}
                <button
                  onClick={(e) => { e.stopPropagation(); openMom(); }}
                  className={`w-full text-left px-2 py-1.5 rounded border transition-colors cursor-pointer shadow-[0_0_14px_rgba(245,158,11,0.25)] ${
                    viewing === MOM_INDEX
                      ? 'border-amber-300 bg-amber-950/60 text-amber-100'
                      : `border-amber-500/80 text-amber-300 bg-amber-950/30 hover:border-amber-300 ${momRead ? '' : 'animate-pulse'}`
                  }`}
                >
                  <div className="font-bold truncate">[{MOM_INDEX + 1}] {tx(MOM_FILE)}</div>
                  <div className="opacity-70 truncate">{tx('Người nhận: Mẹ')}{momRead ? tx(' • Đã gửi ✓') : ''}</div>
                </button>
              </div>
            )}

            {/* Nội dung đang gõ */}
            <div className="flex-1 min-w-0 p-3 overflow-y-auto">
              <div className={`leading-relaxed text-[clamp(10px,1.05vw,15px)] ${phase === 'reflect' ? 'text-zinc-200 italic text-justify' : 'whitespace-pre-wrap text-cyan-200 c4-phosphor'} ${glitching ? 'c4-glitch' : ''}`}>
                {glitching ? corruptText(termText, glitchSeed) : termText}
                {!doneFor(termKey) && phase !== 'call' && <span className="inline-block w-2 h-[1em] bg-cyan-300 align-middle ml-0.5" style={{ animation: 'c4-blink 1s steps(1) infinite' }} />}
              </div>

              {/* An trả lời Miên qua micro webcam */}
              {phase === 'call' && (reply || doneFor('call')) && (
                <div className="mt-3 animate-fade-in">
                  <div className="text-[clamp(9px,0.85vw,12px)] text-amber-300/90 mb-1.5 tracking-wider">
                    <span className="text-red-400" style={{ animation: 'c4-blink 1s steps(1) infinite' }}>●</span> {tx('MICRO CAM_02: ĐANG MỞ — NÓI VỚI MIÊN')}
                  </div>
                  {reply ? (
                    <div className="border-l-2 border-amber-400/70 pl-2.5 py-1 text-amber-100 italic text-justify leading-relaxed text-[clamp(10px,1vw,14px)]">
                      {reply.line}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {callChoices.map((c, i) => {
                        const { title, sub } = splitChoice(c.text);
                        return (
                          <button
                            key={c.nextNodeId}
                            onClick={(e) => { e.stopPropagation(); answer(c); }}
                            className={`w-full text-left px-3 py-2 rounded border text-[clamp(10px,0.95vw,14px)] transition-colors cursor-pointer ${
                              i === 0 ? 'border-cyan-400 hover:bg-cyan-950/70 text-cyan-100' : 'border-rose-400 hover:bg-rose-950/60 text-rose-100'
                            }`}
                          >
                            <div className="font-bold text-[clamp(9px,0.85vw,12px)] opacity-80">[{i + 1}] {title}</div>
                            <div className="italic text-justify">{sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bảng lựa chọn kết cục */}
              {phase === 'decide' && doneFor('decide') && (
                <div className={`mt-3 space-y-2 ${glitching ? 'c4-glitch' : ''}`}>
                  {visibleChoices.map((c, i) => {
                    const locked = isLocked(c);
                    const { title, sub } = splitChoice(c.text);
                    const kind = endingKindOf(c.nextNodeId);
                    const bar = HOLD_BAR[kind];
                    const tone =
                      kind === 'A' ? 'border-cyan-400 hover:bg-cyan-950/70 text-cyan-100'
                      : kind === 'B' ? 'border-red-500 hover:bg-red-950/70 text-red-200'
                      : kind === 'S' ? 'border-violet-300 hover:bg-violet-950/70 text-violet-100'
                      : 'border-zinc-500 hover:bg-zinc-900 text-zinc-200';
                    return (
                      <button
                        key={`${c.nextNodeId}-${i}`}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); focusChoice(i); startHold(i); }}
                        onMouseUp={releaseHold}
                        onMouseLeave={releaseHold}
                        onMouseEnter={() => { if (!locked) focusChoice(i); }}
                        onTouchStart={(e) => { e.stopPropagation(); focusChoice(i); startHold(i); }}
                        onTouchEnd={releaseHold}
                        onTouchCancel={releaseHold}
                        onContextMenu={(e) => e.preventDefault()}
                        disabled={locked}
                        className={`relative overflow-hidden w-full text-left px-3 py-2 rounded border text-[clamp(10px,0.95vw,14px)] transition-colors ${
                          locked ? 'border-zinc-800 text-zinc-600 cursor-not-allowed' : `${tone} cursor-pointer`
                        } ${!locked && i === focusIdx ? 'ring-1 ring-white/40' : ''}`}
                      >
                        {/* Thanh giữ nút: lấp đầy từ trái qua phải, viền sáng ở mép đang chạy */}
                        <div
                          ref={(el) => { barRefs.current[i] = el; }}
                          className="absolute inset-0 origin-left pointer-events-none"
                          style={{ transform: 'scaleX(0)', background: `linear-gradient(90deg, ${bar.fill} 0%, ${bar.fill} 96%, ${bar.edge} 100%)` }}
                        />
                        <div className="relative font-bold">[{i + 1}] {title}</div>
                        <div className="relative opacity-75">{locked ? lockLabel(c, dict) : sub}</div>
                      </button>
                    );
                  })}
                  <div className="pt-1 text-center text-[clamp(8px,0.8vw,11px)] tracking-widest text-amber-300/85" style={{ animation: 'c4-blink 1.4s steps(1) infinite' }}>
                    {tx('[ GIỮ CHUỘT HOẶC SPACE TRONG 3 GIÂY ĐỂ XÁC NHẬN SỐ PHẬN ]')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {canContinue && (
            <div className="px-3 py-1.5 border-t border-cyan-900/60 text-right text-[clamp(9px,0.85vw,12px)] text-cyan-400" style={{ animation: 'c4-blink 1.4s steps(1) infinite' }}>
              [SPACE] {continueLabel} ▸
            </div>
          )}
        </div>

        {/* ===== CỘT PHẢI: WEBCAM THẾ GIỚI THỰC + LỜI MIÊN ===== */}
        <div className="absolute right-[4%] top-[6%] bottom-[17%] w-[32%] flex flex-col items-end gap-2">
          <div
            className={`relative shrink-0 border-2 border-zinc-700 bg-black rounded-sm overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.25)] transition-all duration-700 ${camLarge ? 'w-full' : 'w-[86%]'}`}
            style={{ aspectRatio: '4 / 3' }}
          >
            <canvas ref={camCanvasRef} width={CAM_W} height={CAM_H} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
            <div className="absolute top-1 left-1.5 text-[clamp(8px,0.75vw,11px)] text-red-400 font-bold">
              <span style={{ animation: 'c4-blink 1s steps(1) infinite' }}>●</span> {tx('REC • CAM_02 • PHÒNG MÁY 312')}
            </div>
            <div className="absolute bottom-1 right-1.5 text-[clamp(8px,0.75vw,11px)] text-zinc-200">{serverClock}</div>
            <div className="absolute bottom-1 left-1.5 text-[clamp(7px,0.65vw,10px)] text-zinc-400">{tx('THẾ GIỚI THỰC • TRỰC TIẾP')}</div>
          </div>

          {(phase === 'call' || phase === 'decide') && (
            <div ref={miePanelRef} className="w-full flex-1 min-h-0 overflow-y-auto bg-black/75 border border-red-900/70 rounded p-2.5">
              <div className="text-[clamp(9px,0.85vw,12px)] text-red-300 font-bold mb-1">{getStory(lang)[CALL_NODE]?.speaker ?? 'Miên'}</div>
              <div className={`text-[clamp(10px,0.95vw,14px)] leading-relaxed text-justify transition-colors duration-700 ${reply ? 'text-zinc-400' : 'text-zinc-100'}`}>
                {phase === 'call' && !reply ? shownText('call') : nodeText(CALL_NODE)}
              </div>
              {reply && (
                <div className="mt-2.5 pt-2 border-t border-red-900/50 animate-fade-in">
                  <div className="text-[clamp(9px,0.85vw,12px)] text-amber-300/90 font-bold">{tx('An (qua micro)')}</div>
                  <div className="text-[clamp(10px,0.95vw,14px)] text-amber-100/90 italic leading-relaxed text-justify mb-2">{reply.line}</div>
                  <div className="text-[clamp(9px,0.85vw,12px)] text-red-300 font-bold">{getStory(lang)[reply.node]?.speaker ?? 'Miên'}</div>
                  <div className="text-[clamp(10px,0.95vw,14px)] text-zinc-100 leading-relaxed text-justify">
                    {typed.key === 'reply' ? typed.text : nodeText(reply.node)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== THANH ĐẾM NGƯỢC ===== */}
        <div className="absolute left-[4%] right-[4%] bottom-[5%]">
          <div className="flex justify-between text-[clamp(9px,0.95vw,13px)] mb-1">
            <span className={urgent ? 'text-red-400 font-bold' : 'text-red-300/90'}>
              {tx('THỜI GIAN TRƯỚC KHI CẮT ĐIỆN VĨNH VIỄN: [{0}]', fmtMMSS(remaining))}
            </span>
            <span className="text-zinc-400">{tx('GIỜ MÁY CHỦ:')} <span className="text-zinc-100">{serverClock}</span></span>
          </div>
          <div className="h-2.5 bg-red-950/60 border border-red-900 rounded-sm overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r from-red-700 to-red-500 ${urgent ? 'animate-pulse' : ''}`}
              style={{ width: `${(remaining / COUNTDOWN_START) * 100}%`, transition: 'width 0.3s linear' }}
            />
          </div>
        </div>

        {/* Chớp trắng lúc cầu dao ngắt */}
        <div ref={flashRef} className="absolute inset-0 z-30 bg-white pointer-events-none" style={{ opacity: 0 }} />

        {/* Đọc xong bản nháp gửi mẹ: tâm trí lắng lại */}
        {calmToast !== null && (
          <div className="absolute left-1/2 top-[13%] -translate-x-1/2 -translate-y-[130%] z-20 pointer-events-none px-4 py-1.5 rounded border border-amber-400/60 bg-amber-950/80 text-amber-200 text-[clamp(9px,0.95vw,13px)] tracking-widest whitespace-nowrap shadow-[0_0_24px_rgba(251,191,36,0.35)] animate-fade-in">
            {tx('[TÂM TRÍ BÌNH TÂM TRỞ LẠI: +{0} SANITY]', calmToast)}
          </div>
        )}

        {/* Mành quét CRT + viền tối */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)' }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)' }} />

        {/* ===== HIỆU ỨNG KẾT CỤC ===== */}
        {ending === 'A' && (
          <div className="absolute inset-0 bg-black pointer-events-none flex items-center justify-center" style={{ animation: 'c4-fade-in 2.4s ease-in forwards', opacity: 0 }}>
            <style>{'@keyframes c4-fade-in { to { opacity: 1 } }'}</style>
            <span className="text-cyan-200/70 text-sm tracking-[0.3em]">&gt; shutdown -h now</span>
          </div>
        )}
        {ending === 'B' && <div className="absolute inset-0 pointer-events-none bg-red-700/20 animate-pulse" />}
        {ending === 'S' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/70">
            <style>{'@keyframes c4-purge { from { width: 0 } to { width: 100% } }'}</style>
            <div className="w-[46%] text-violet-100 text-[clamp(10px,1vw,14px)] tracking-widest c4-phosphor">
              <div>&gt; PURGE SECTOR_MIEN --all</div>
              <div className="mt-2 h-2 border border-violet-300/70">
                <div className="h-full bg-violet-200" style={{ animation: `c4-purge ${ENDING_DELAY_MS}ms linear forwards`, width: 0 }} />
              </div>
            </div>
          </div>
        )}
        {ending === 'C' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <span className="px-3 py-1 bg-black text-zinc-100 text-lg tracking-[0.4em]">NO SIGNAL</span>
          </div>
        )}
      </div>
    </div>
  );
};
