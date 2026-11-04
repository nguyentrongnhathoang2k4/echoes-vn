'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { tx } from '../locales/tx';
import { AuraDos, DosLine } from './AuraDos';

// =====================================================================
// MÀN HÌNH DESKTOP MÁY TÍNH CỦA AN (Màn 1)
// Hiện ra khi bật máy. Bấm icon → An nói một câu;
// bấm thư mục Đồ_án_AURA → mở cửa sổ Notepad đọc trích đoạn tài liệu (manh mối Ending S);
// Mở khoá ALBUM_KỶ_NIỆM qua 3 tầng:
//   1. AURA DOS: DIR / TYPE / AURA_DIAG.EXE báo "Cluster #211 Corrupted. Check Physical Token for Offset."
//   2. README.TXT (Notepad): lời nhắn của Miên — ngày khắc trên mặt dây chuyền
//   3. DECRYPT ALBUM.KEY: hộp thoại Hex nhập lại 2 byte offset [17] [05], rồi gõ CONFIRM_OVERRIDE
// Manh mối ngoài đời: mặt dây chuyền dưới khe cửa #316 (17.05), cốc đánh răng (17.05), lịch tháng 5.
// Đồng hồ 03:14 là bẫy. Ghi đè xong: CRT giật, webcam chớp bóng Miên khóc, sập nguồn, mở album.
// Icon là pixel art tự vẽ (không dùng logo thật của hãng nào).
// =====================================================================

type IconKind = 'trash' | 'lol' | 'code' | 'music' | 'folder' | 'folderGray' | 'locked' | 'terminal';

interface DesktopIcon {
  id: string;
  label: string;
  kind: IconKind;
  /** Câu An nói khi bấm (bỏ trống với tệp khoá: mở khung PIN) */
  line?: string;
}

const ICONS: DesktopIcon[] = [
  { id: 'trash', label: 'Thùng rác', kind: 'trash', line: 'Thùng rác còn ba tệp: "deadline_final_v7_THAT_SU_FINAL.zip", "don_xin_nghi.docx", "cv_moi.pdf". Cái nào cũng viết xong rồi mà chưa gửi.' },
  { id: 'lol', label: 'LMHT', kind: 'lol', line: 'Trận gần nhất cách đây ba tuần, thua. Miên hứa leo được Vàng thì nấu cơm cho cả tuần. Vẫn kẹt Bạc.' },
  { id: 'code', label: 'VS Code', kind: 'code', line: 'Dự án AURA. 47 tab đang mở, 12 tab chưa lưu. Dòng cuối mình gõ: "// TODO: xong cái này thì ngủ."' },
  { id: 'music', label: 'Nhạc', kind: 'music', line: 'Playlist "Hoàng hôn", 12 bài, Miên chọn hết. Bài đầu tiên chỉ là tiếng một chiếc hộp nhạc.' },
  { id: 'aura', label: 'Đồ_án_AURA', kind: 'folder', line: 'Tài liệu thiết kế AURA. Trang đầu có chữ Miên: "Mức đồng bộ 100% — KHÔNG BAO GIỜ DÙNG." Gạch chân hai lần.' },
  { id: 'backup', label: 'AURA_backup', kind: 'folderGray', line: 'Thư mục trống. Sửa đổi lần cuối: hôm nay, 03:14. Mình đâu có mở nó.' },
  { id: 'dos', label: 'AURA_DOS', kind: 'terminal' },
  { id: 'album', label: 'ALBUM_KỶ_NIỆM', kind: 'locked' },
];

const START_LINE = 'Máy chậm như rùa. Ông bán ở chợ đồ cũ bảo "bền như tình đầu".';

// Trích đoạn tài liệu thiết kế trong thư mục Đồ_án_AURA (cửa sổ Notepad giả lập)
const AURA_DOC_FILE = 'AURA_thiet_ke_v3.14.txt';
const AURA_DOC_GOALS = [
  'Ghi lại sóng não trong lúc ngủ, dựng lại ký ức thành một nơi có thể bước vào.',
  'Giữ lại giọng nói, thói quen, cách một người cười — đủ để trò chuyện như thật.',
  'Để những người ở lại còn được gặp lại người đã đi.',
];
const AURA_DOC_DIAGRAM = [
  '[ NÃO CHỦ THỂ ] ──EEG──▶ [ AURA_REC ] ──▶ [ AURA-NODE ]',
  '       ▲                                       │',
  '       └────────── phản hồi cảm giác ◀─────────┘',
  '',
  'MỨC ĐỒNG BỘ:  30% quan sát  •  70% nhập vai  •  100% ???',
];
const AURA_DOC_NOTE = 'Phiên ghi #211 — chủ thể: chính mình. Tối nay thử 4 tiếng, mai báo cáo cô hướng dẫn.';
const AURA_DOC_WARNING = 'KHÔNG BAO GIỜ ĐƯỢC ĐỒNG BỘ 100%.';
const AURA_DOC_WARNING_SUB = 'Ở 100%, hệ thống không còn phân biệt được bản sao với người thật. Không quay lại được đâu.';
const AURA_TOAST_MS = 3200;
const CLOCK_LINE = '03:14. Đồng hồ lại đứng rồi.';

// Giải mã ALBUM_KỶ_NIỆM (3 tầng)
const PIN_LEN = 4;
const ALBUM_KEY = '1705';
const PIN_OPEN_LINE = 'Hai byte bị mất... Offset in trên token vật lý? Thứ gì của hai đứa có khắc số nhỉ. Dạo này đãng trí quá.';
const PIN_WRONG_LINE = 'Sai rồi... Đầu nhức buốt vì cố nhớ mãi không ra.';
const PIN_TIME_LINE = '03:14 là giờ trên đồng hồ, đâu phải ngày. Ngày gì cơ chứ...';
const KEY_OK_LINE = 'Khớp rồi... Giờ chỉ cần xác nhận ghi đè.';
const DOS_LINE = 'Cái DOS giả lập này mình viết hồi năm ba để chạy AURA. Gõ HELP nếu quên lệnh.';
const ALBUM_LOCKED_LINE = 'Thư mục bị mã hoá, báo lỗi khoá hỏng. Mở AURA DOS chẩn đoán xem sao.';
const ALBUM_READY_LINE = 'Khoá đã dựng lại. Phải xác nhận ghi đè trong AURA DOS.';
const README_LINE = 'Chữ Miên... Cô ấy đặt mật mã từ hồi nào thế này.';
const LOG_LINE = 'Kênh 2 lúc 03:14? Đêm qua mình chỉ dán một bộ điện cực thôi mà...';
const DIAG_LINE = 'Token vật lý... thứ gì đó cầm được trên tay. Có khắc số.';
const CAM_LINE = 'Ai... vừa ở trên màn hình thế? Miên?';
const DOS_BOOT: DosLine[] = [
  { text: 'AURA DOS 3.14  (C) Tran Hoang An', kind: 'dim' },
  { text: 'Gõ HELP để xem lệnh.', kind: 'dim', vi: true },
];
const README_TEXT = [
  'Gửi chàng kỹ sư ngốc phòng 314,',
  'Em đặt khoá cho album rồi nhé. Mật mã là ngày ta hứa cùng nhau đi ngắm hoàng hôn bên bờ sông.',
  'Không phải ngày gặp nhau lần đầu đâu, mà là ngày được khắc lên mặt dây chuyền ấy.',
  'Ngày trước, tháng sau. Anh mà quên thì cả tuần đừng hòng em nấu cơm.',
  '— M.',
];
const PIN_ERROR_MS = 520;          // Ô số chớp đỏ + rung rồi tự xoá
const PIN_OK_MS = 700;             // Ô số xanh lại một nhịp rồi đóng hộp thoại
const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'] as const;
// Viền nổi / lõm 3D kiểu Windows cổ
const BEVEL_UP = 'border-2 border-t-white border-l-white border-b-zinc-700 border-r-zinc-700';
const BEVEL_DOWN = 'border-2 border-t-zinc-700 border-l-zinc-700 border-b-white border-r-white';
const KEY_3D = `${BEVEL_UP} bg-[#d4d0c8] active:border-t-zinc-700 active:border-l-zinc-700 active:border-b-white active:border-r-white cursor-pointer`;

/** Ổ khoá vàng pixel 12x12 ở góc hộp thoại */
function PixelLock() {
  return (
    <svg viewBox="0 0 12 12" width={24} height={24} shapeRendering="crispEdges" aria-hidden>
      <rect x={3} y={1} width={6} height={1} fill="#57534e" />
      <rect x={2} y={2} width={1} height={4} fill="#57534e" />
      <rect x={9} y={2} width={1} height={4} fill="#57534e" />
      <rect x={1} y={5} width={10} height={6} fill="#ca8a04" />
      <rect x={1} y={5} width={10} height={1} fill="#fde047" />
      <rect x={1} y={10} width={10} height={1} fill="#854d0e" />
      <rect x={5} y={7} width={2} height={2} fill="#1c1917" />
    </svg>
  );
}

/** Icon pixel 16x16 vẽ bằng SVG, giữ nét sắc khi phóng to */
function PixelIcon({ kind }: { kind: IconKind }) {
  const r = (x: number, y: number, w: number, h: number, fill: string, key?: string) => (
    <rect key={key ?? `${x}-${y}-${w}-${h}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} />
  );
  let body: React.ReactNode;
  switch (kind) {
    case 'trash':
      body = [
        r(4, 2, 8, 1, '#d4d4d8'), r(6, 1, 4, 1, '#a1a1aa'), r(3, 3, 10, 2, '#a1a1aa'),
        r(4, 5, 8, 9, '#d4d4d8'), r(5, 6, 1, 7, '#71717a'), r(7, 6, 1, 7, '#71717a'), r(9, 6, 1, 7, '#71717a'),
        r(11, 5, 1, 9, '#71717a'), r(4, 14, 8, 1, '#52525b'),
        r(6, 7, 3, 2, '#fde68a', 'paper'),
      ];
      break;
    case 'lol':
      body = [
        r(3, 1, 10, 14, '#1e293b'), r(4, 2, 8, 12, '#0f172a'), r(3, 1, 10, 1, '#c8aa6e'), r(3, 14, 10, 1, '#c8aa6e'),
        r(3, 1, 1, 14, '#c8aa6e'), r(12, 1, 1, 14, '#c8aa6e'), r(6, 4, 2, 7, '#c8aa6e'), r(6, 10, 5, 2, '#c8aa6e'),
      ];
      break;
    case 'code':
      body = [
        r(2, 2, 12, 12, '#1d4ed8'), r(3, 3, 10, 10, '#2563eb'), r(4, 7, 1, 2, '#e0f2fe'), r(5, 6, 1, 1, '#e0f2fe'),
        r(5, 9, 1, 1, '#e0f2fe'), r(11, 7, 1, 2, '#e0f2fe'), r(10, 6, 1, 1, '#e0f2fe'), r(10, 9, 1, 1, '#e0f2fe'),
        r(8, 5, 1, 2, '#e0f2fe'), r(7, 7, 1, 2, '#e0f2fe'), r(7, 9, 1, 2, '#e0f2fe'),
      ];
      break;
    case 'music':
      body = [
        r(6, 2, 7, 2, '#f472b6'), r(6, 2, 2, 10, '#f472b6'), r(11, 2, 2, 8, '#f472b6'),
        r(3, 10, 5, 4, '#f472b6'), r(8, 8, 5, 4, '#f472b6'),
      ];
      break;
    case 'folder':
    case 'folderGray': {
      const c = kind === 'folder' ? ['#facc15', '#eab308', '#fde68a'] : ['#a1a1aa', '#71717a', '#d4d4d8'];
      body = [r(1, 3, 6, 2, c[1]), r(1, 4, 14, 10, c[1]), r(1, 6, 14, 8, c[0]), r(1, 6, 14, 1, c[2])];
      break;
    }
    case 'terminal':
      body = [
        r(1, 2, 14, 12, '#a1a1aa'), r(2, 3, 12, 9, '#000000'), r(3, 5, 1, 1, '#e5e5e5'), r(4, 6, 1, 1, '#e5e5e5'),
        r(3, 7, 1, 1, '#e5e5e5'), r(6, 8, 4, 1, '#e5e5e5'), r(5, 13, 6, 2, '#71717a'),
      ];
      break;
    case 'locked':
      body = [
        r(3, 1, 9, 14, '#f8fafc'), r(9, 1, 3, 3, '#cbd5e1'), r(4, 4, 6, 1, '#94a3b8'), r(4, 6, 6, 1, '#94a3b8'),
        r(8, 8, 7, 7, '#f59e0b'), r(9, 6, 5, 3, '#f59e0b'), r(10, 7, 3, 2, '#1c1917'), r(11, 10, 1, 3, '#1c1917'),
      ];
      break;
  }
  return (
    <svg viewBox="0 0 16 16" width={32} height={32} shapeRendering="crispEdges" aria-hidden>
      {body}
    </svg>
  );
}

interface DesktopScreenProps {
  /**
   * Kiểm tra mã PIN của ALBUM_KỶ_NIỆM: true = đúng (phòng 314 tự đóng máy và mở album).
   * Mã sai được gọi ngay để trang ngoài trừ Sanity; mã đúng chỉ được gửi sau khi gõ CONFIRM_OVERRIDE.
   */
  onSubmitPin: (pin: string) => boolean;
  onClose: () => void;
  onClickSound?: () => void;
  /** Tiếng 'bíp' báo lỗi khi nhập sai PIN */
  onErrorSound?: () => void;
  /** Báo icon vừa được mở (để ghi biến cốt truyện) */
  onOpenIcon?: (id: string) => void;
}

/** Hex nhiễu cho màn giải mã */
const randHex = () => Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0');
const noiseRow = (n: number) => Array.from({ length: n }, randHex).join(' ');

export const DesktopScreen: React.FC<DesktopScreenProps> = ({ onSubmitPin, onClose, onClickSound, onErrorSound, onOpenIcon }) => {
  useLanguage(); // vẽ lại khi đổi ngôn ngữ
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<string>('Màn hình sáng lên. Desktop vẫn bừa bộn như mọi khi.');
  const [colon, setColon] = useState(true);
  // Cửa sổ Notepad của thư mục Đồ_án_AURA + thông báo mở khoá manh mối
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraToast, setAuraToast] = useState(false);
  // Tầng 1: AURA DOS
  const [dosOpen, setDosOpen] = useState(false);
  const [dosLines, setDosLines] = useState<DosLine[]>(DOS_BOOT);
  const [dosBusy, setDosBusy] = useState(false);
  const [known, setKnown] = useState<string[]>(['HELP', 'DIR']);
  const [diagDone, setDiagDone] = useState(false);
  // Tầng 2: README.TXT của Miên (Notepad)
  const [readmeOpen, setReadmeOpen] = useState(false);
  // Tầng 3: hộp thoại giải mã Hex (2 byte offset = 4 số)
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinState, setPinState] = useState<'idle' | 'error' | 'ok'>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [hexNoise, setHexNoise] = useState<string[]>(() => ['', '', '', '']);
  const [keyRebuilt, setKeyRebuilt] = useState(false);
  // Ghi đè: CRT giật → webcam chớp bóng Miên → sập nguồn
  const [override, setOverride] = useState<'none' | 'shake' | 'cam' | 'black'>('none');
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => timersRef.current.forEach((id) => window.clearTimeout(id)), []);
  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ---- Âm thanh nhiễu riêng cho màn ghi đè (AudioContext riêng, đóng khi tắt máy) ----
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close().catch(() => {});
      ref.current = null;
    };
  }, []);
  const playStatic = useCallback((dur: number, gain = 0.25) => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current && Ctor) audioRef.current = new Ctor();
      const ctx = audioRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.35);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
    } catch {}
  }, []);

  const print = useCallback((...ls: DosLine[]) => setDosLines((prev) => [...prev, ...ls].slice(-80)), []);
  const learn = useCallback((...cmds: string[]) => setKnown((prev) => [...prev, ...cmds.filter((c) => !prev.includes(c))]), []);

  const closePin = useCallback(() => {
    setPinOpen(false);
    setPin('');
    setPinState('idle');
  }, []);

  const typeDigit = useCallback((d: string) => {
    if (pinState !== 'idle') return;
    onClickSound?.();
    setPin((p) => (p.length < PIN_LEN ? p + d : p));
  }, [pinState, onClickSound]);

  const backspace = useCallback(() => {
    if (pinState !== 'idle') return;
    onClickSound?.();
    setPin((p) => p.slice(0, -1));
  }, [pinState, onClickSound]);

  // Dựng lại khoá: đúng thì chờ CONFIRM_OVERRIDE; sai thì trang ngoài trừ Sanity (trừ 03:14)
  const submitPin = useCallback(() => {
    if (pinState !== 'idle' || pin.length !== PIN_LEN) return;
    if (pin === ALBUM_KEY) {
      setPinState('ok');
      setLine(KEY_OK_LINE);
      setKeyRebuilt(true);
      learn('CONFIRM_OVERRIDE');
      print(
        { text: 'ALBUM.KEY  >> OFFSET 17 05 ... REBUILT', kind: 'ok' },
        { text: 'Khoá đã dựng lại. Gõ CONFIRM_OVERRIDE để ghi đè khoá cũ.', kind: 'warn', vi: true },
      );
      later(PIN_OK_MS, closePin);
      return;
    }
    onSubmitPin(pin);
    onErrorSound?.();
    setPinState('error');
    setShakeKey((k) => k + 1);
    setLine(pin === '0314' ? PIN_TIME_LINE : PIN_WRONG_LINE);
    later(PIN_ERROR_MS, () => {
      setPin('');
      setPinState('idle');
    });
  }, [pinState, pin, onSubmitPin, onErrorSound, closePin, learn, print, later]);

  // Phím thật khi hộp thoại giải mã mở: 0-9, Backspace, Enter (Esc do bộ bắt Esc chung bên dưới xử lý).
  // Pha capture + chặn lan truyền để ô gõ lệnh DOS / phòng 314 không nhận cùng lần bấm.
  useEffect(() => {
    if (!pinOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) typeDigit(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') submitPin();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [pinOpen, typeDigit, backspace, submitPin]);

  // Hex nhiễu nhấp nháy trong hộp thoại giải mã
  useEffect(() => {
    if (!pinOpen) return;
    const id = window.setInterval(() => setHexNoise([noiseRow(8), noiseRow(8), noiseRow(8), noiseRow(8)]), 180);
    return () => window.clearInterval(id);
  }, [pinOpen]);

  useEffect(() => {
    const id = window.setInterval(() => setColon((c) => !c), 800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!auraToast) return;
    const id = window.setTimeout(() => setAuraToast(false), AURA_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [auraToast]);

  // Esc đóng cửa sổ trên cùng trước (giải mã → README → DOS → tài liệu AURA), chưa tắt màn hình máy tính.
  // Pha capture + chặn lan truyền để listener tắt màn hình của phòng 314 không nhận cùng lần bấm.
  useEffect(() => {
    const anyOpen = pinOpen || readmeOpen || dosOpen || auraOpen || override !== 'none';
    if (!anyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (override !== 'none') return; // Đang sập nguồn: không thoát được
      onClickSound?.();
      if (pinOpen) closePin();
      else if (readmeOpen) setReadmeOpen(false);
      else if (dosOpen) setDosOpen(false);
      else setAuraOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [pinOpen, readmeOpen, dosOpen, auraOpen, override, closePin, onClickSound]);

  // ---- Chuỗi ghi đè: CRT giật dữ dội → webcam chớp bóng Miên khóc → sập nguồn → mở album ----
  const runOverride = useCallback(() => {
    setDosBusy(true);
    setOverride('shake');
    playStatic(1.2, 0.3);
    later(1200, () => {
      setOverride('cam');
      setLine(CAM_LINE);
      playStatic(1.8, 0.18);
    });
    later(3100, () => {
      setOverride('black');
      playStatic(0.25, 0.4);
    });
    later(3900, () => onSubmitPin(ALBUM_KEY));
  }, [later, onSubmitPin, playStatic]);

  // ---- Tầng 1: lệnh DOS ----
  const runCommand = useCallback((raw: string) => {
    onClickSound?.();
    const cmd = raw.trim().toUpperCase().replace(/\s+/g, ' ');
    print({ text: `C:\\AURA>${cmd}`, kind: 'cmd' });
    const is = (...alts: string[]) => alts.includes(cmd);

    if (is('HELP', '?', '/?')) {
      print(
        { text: 'DIR              Liệt kê tệp trong thư mục', vi: true },
        { text: 'TYPE <tệp>       Đọc tệp văn bản', vi: true },
        { text: '<tên>.EXE        Chạy chương trình', vi: true },
        { text: 'CLS / EXIT       Xoá màn hình / đóng cửa sổ', vi: true },
      );
      return;
    }
    if (is('CLS')) {
      setDosLines([]);
      return;
    }
    if (is('EXIT')) {
      setDosOpen(false);
      return;
    }
    if (is('DIR', 'DIR C:', 'DIR C:\\AURA', 'LS')) {
      print(
        { text: ' Volume in drive C is AURA_314', kind: 'dim' },
        { text: ' Directory of C:\\AURA', kind: 'dim' },
        { text: 'README     TXT        1,204  15-05  22:41' },
        { text: 'SESSION211 LOG       98,304  16-05  03:14' },
        { text: 'AURA_DIAG  EXE       44,032  02-03  09:12' },
        { text: 'ALBUM      KEY           16  ??-??  ??:??   <CORRUPT>', kind: 'err' },
        { text: '        4 file(s)     143,556 bytes', kind: 'dim' },
      );
      learn('TYPE README.TXT', 'TYPE SESSION211.LOG', 'AURA_DIAG.EXE');
      return;
    }
    if (is('TYPE README.TXT', 'TYPE README', 'README.TXT', 'NOTEPAD README.TXT')) {
      print({ text: 'Mở README.TXT bằng Notepad...', kind: 'dim', vi: true });
      setReadmeOpen(true);
      setLine(README_LINE);
      return;
    }
    if (is('TYPE SESSION211.LOG', 'TYPE SESSION211', 'SESSION211.LOG')) {
      print(
        { text: '[23:58:02] SESSION #211 SAVED. SUBJECT: TRAN HOANG AN', kind: 'ok' },
        { text: '[23:58:03] EEG CH1 ........ OK' },
        { text: '[03:14:00] EEG CH2 ........ SIGNAL DETECTED ???', kind: 'warn' },
        { text: '[03:14:00] SUBJECT #2: UNKNOWN', kind: 'warn' },
        { text: '[03:14:01] ..A.N.. ..ơ.i.. ..a.n.h.. ..c.ó.. ..n.g.h.e..', kind: 'glitch' },
        { text: '[??:??:??] END OF LOG', kind: 'dim' },
      );
      setLine(LOG_LINE);
      return;
    }
    if (is('AURA_DIAG.EXE', 'AURA_DIAG', 'DIAG')) {
      setDosBusy(true);
      print({ text: 'AURA Diagnostic v3.14 — scanning sectors...', kind: 'dim' });
      const steps: DosLine[] = [
        { text: '[OK]   Cluster #001 - #210', kind: 'ok' },
        { text: '[FAIL] Cluster #211 Corrupted.', kind: 'err' },
        { text: '       ALBUM.KEY: offset lost (2 bytes).', kind: 'err' },
        { text: '       >> Check Physical Token for Offset.', kind: 'warn' },
        { text: 'Gợi ý: chạy DECRYPT ALBUM.KEY để dựng lại khoá.', kind: 'dim', vi: true },
      ];
      steps.forEach((s, i) => later(450 + i * 450, () => print(s)));
      later(450 + steps.length * 450, () => {
        setDosBusy(false);
        setDiagDone(true);
        learn('DECRYPT ALBUM.KEY');
        setLine(DIAG_LINE);
      });
      return;
    }
    if (is('DECRYPT ALBUM.KEY', 'DECRYPT', 'DECRYPT ALBUM')) {
      if (keyRebuilt) {
        print({ text: 'Khoá đã dựng lại rồi. Gõ CONFIRM_OVERRIDE.', kind: 'warn', vi: true });
        return;
      }
      if (!diagDone) {
        print({ text: 'Chưa rõ lỗi của ALBUM.KEY. Chạy AURA_DIAG.EXE trước.', kind: 'err', vi: true });
        return;
      }
      print({ text: 'Mở trình giải mã ALBUM.KEY...', kind: 'dim', vi: true });
      setPin('');
      setPinState('idle');
      setPinOpen(true);
      setLine(PIN_OPEN_LINE);
      return;
    }
    if (is('CONFIRM_OVERRIDE', 'CONFIRM OVERRIDE')) {
      if (!keyRebuilt) {
        print({ text: 'Không có khoá nào để ghi đè. ALBUM.KEY vẫn hỏng.', kind: 'err', vi: true });
        return;
      }
      print(
        { text: 'OVERRIDE ACCEPTED. Writing ALBUM.KEY...', kind: 'ok' },
        { text: 'WARNING: EEG CH2 ACTIVE', kind: 'err' },
      );
      runOverride();
      return;
    }
    print({ text: 'Bad command or file name', kind: 'err' });
  }, [onClickSound, print, learn, later, keyRebuilt, diagDone, runOverride]);

  const press = (icon: DesktopIcon) => {
    onClickSound?.();
    setSelected(icon.id);
    onOpenIcon?.(icon.id);
    if (icon.kind === 'locked') {
      // Thư mục mã hoá: không còn hộp nhập PIN thẳng, phải chẩn đoán trong AURA DOS
      setLine(keyRebuilt ? ALBUM_READY_LINE : ALBUM_LOCKED_LINE);
      setDosOpen(true);
      return;
    }
    if (icon.id === 'dos') {
      setLine(DOS_LINE);
      setDosOpen(true);
      return;
    }
    if (icon.line) setLine(icon.line);
    if (icon.id === 'aura') {
      setAuraOpen(true);
      setAuraToast(true);
    }
  };

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden rounded-sm font-mono select-none"
      style={override === 'shake' ? { animation: 'crt-shake 0.09s linear infinite' } : undefined}
    >
      <style>{`
        @keyframes crt-shake {
          0% { transform: translate(0,0) skewX(0) } 25% { transform: translate(-6px,3px) skewX(2deg) }
          50% { transform: translate(5px,-4px) skewX(-3deg) } 75% { transform: translate(-3px,-2px) skewX(1deg) } 100% { transform: translate(0,0) }
        }
        @keyframes cam-flick { 0%,100% { opacity: .9 } 20% { opacity: .2 } 40% { opacity: .85 } 55% { opacity: 0 } 70% { opacity: .7 } }
      `}</style>
      {/* Hình nền: Bến An Yên lúc hoàng hôn */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #2b1055 0%, #7b2f7f 38%, #d16ba5 58%, #f6b26b 70%, #3b0764 71%, #1e1b4b 100%)' }}
      />
      <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: '52%', width: 70, height: 70, background: '#ffe6b3', opacity: 0.85, clipPath: 'inset(0 0 50% 0)' }} />
      <div className="absolute left-0 right-0" style={{ top: '70%', height: 2, background: 'rgba(255,220,180,0.5)' }} />

      {/* Lưới icon */}
      <div className="relative flex-1 p-2 grid grid-flow-col grid-rows-5 auto-cols-19.5 gap-x-1 gap-y-0.5 content-start">
        {ICONS.map((icon) => (
          <button
            key={icon.id}
            onClick={() => press(icon)}
            className={`flex flex-col items-center gap-0.5 p-1 rounded-sm cursor-pointer outline-none ${
              selected === icon.id ? 'bg-sky-500/40 ring-1 ring-sky-300/70' : 'hover:bg-white/15'
            }`}
            title={tx(icon.label)}
          >
            <PixelIcon kind={icon.kind} />
            <span
              className="text-[9px] leading-tight text-white text-center break-all"
              style={{ textShadow: '1px 1px 0 #000, -1px 0 0 #000' }}
            >
              {tx(icon.label)}
            </span>
          </button>
        ))}
      </div>

      {/* Tắt màn hình */}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-1.5 text-[10px] text-zinc-100 bg-black/50 hover:bg-red-900/80 border border-white/30 px-1.5 py-0.5 rounded-sm cursor-pointer"
        title={tx('Nhấn ESC để tắt màn hình')}
      >
        ✕ [ESC]
      </button>

      {/* Cửa sổ Notepad: trích đoạn tài liệu thiết kế AURA */}
      {auraOpen && (
        <div className="absolute inset-x-3 top-3 bottom-12 z-10 flex flex-col bg-[#f5f1e6] border-2 border-zinc-500 rounded-sm shadow-[4px_4px_0_rgba(0,0,0,0.6)] text-zinc-900">
          <div className="flex items-center justify-between h-5 px-1.5 bg-linear-to-r from-sky-800 to-sky-600 text-[10px] text-white font-bold shrink-0">
            <span className="truncate">{AURA_DOC_FILE} — Notepad</span>
            <button
              onClick={() => {
                onClickSound?.();
                setAuraOpen(false);
              }}
              className="px-1 leading-none bg-zinc-200 text-zinc-900 border border-zinc-500 hover:bg-red-600 hover:text-white cursor-pointer"
              title={tx('Nhấn ESC để đóng tài liệu')}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-2 text-[10px] leading-snug">
            <div className="font-bold tracking-wide">{tx('ĐỒ ÁN TỐT NGHIỆP — DỰ ÁN AURA')}</div>
            <div className="text-zinc-600 mb-1.5">{tx('Sinh viên thực hiện: Trần Hoàng An • Bản nháp v3.14')}</div>

            <div className="font-bold">{tx('1. MỤC TIÊU HỆ THỐNG')}</div>
            <ul className="mb-1.5 pl-3 list-disc">
              {AURA_DOC_GOALS.map((g) => (
                <li key={g}>{tx(g)}</li>
              ))}
            </ul>

            <div className="font-bold">{tx('2. SƠ ĐỒ ĐỒNG BỘ NÃO BỘ')}</div>
            <pre className="mb-1.5 px-1.5 py-1 bg-zinc-900 text-emerald-300 text-[9px] leading-tight overflow-x-auto whitespace-pre">
              {AURA_DOC_DIAGRAM.map((l) => tx(l)).join('\n')}
            </pre>

            <div className="font-bold">{tx('3. GHI CHÚ')}</div>
            <div className="mb-2 italic text-zinc-700">{tx(AURA_DOC_NOTE)}</div>

            <div className="px-2 py-1.5 border-2 border-red-700 bg-red-100 text-red-800">
              <div className="font-extrabold tracking-wider animate-pulse">{tx(AURA_DOC_WARNING)}</div>
              <div className="mt-0.5">{tx(AURA_DOC_WARNING_SUB)}</div>
              <div className="mt-0.5 text-right italic underline decoration-double">— M.</div>
            </div>
          </div>
        </div>
      )}

      {/* Mở thư mục AURA lần nào cũng báo rõ: manh mối đã được ghi nhận */}
      {auraToast && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 z-20 pointer-events-none px-2.5 py-1 bg-black/90 border border-amber-400/80 text-amber-200 text-[10px] font-bold tracking-widest whitespace-nowrap rounded-sm shadow-[0_0_16px_rgba(251,191,36,0.4)] animate-fade-in">
          {tx('[ĐÃ MỞ KHÓA MANH MỐI: DỰ ÁN AURA]')}
        </div>
      )}

      {/* Tầng 1: cửa sổ AURA DOS */}
      {dosOpen && (
        <AuraDos
          lines={dosLines}
          suggestions={known}
          busy={dosBusy}
          onCommand={runCommand}
          onClose={() => {
            onClickSound?.();
            setDosOpen(false);
          }}
        />
      )}

      {/* Tầng 2: README.TXT của Miên trong Notepad */}
      {readmeOpen && (
        <div className="absolute inset-x-6 top-6 bottom-14 z-30 flex flex-col bg-[#f5f1e6] border-2 border-zinc-500 rounded-sm shadow-[4px_4px_0_rgba(0,0,0,0.6)] text-zinc-900">
          <div className="flex items-center justify-between h-5 px-1.5 bg-linear-to-r from-sky-800 to-sky-600 text-[10px] text-white font-bold shrink-0">
            <span className="truncate">README.TXT — Notepad</span>
            <button
              onClick={() => {
                onClickSound?.();
                setReadmeOpen(false);
              }}
              className="px-1 leading-none bg-zinc-200 text-zinc-900 border border-zinc-500 hover:bg-red-600 hover:text-white cursor-pointer"
              title={tx('Nhấn ESC để đóng tài liệu')}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap">
            {README_TEXT.map((l, i) => (
              <div key={i} className={i === README_TEXT.length - 1 ? 'mt-2 text-right italic' : ''}>
                {tx(l)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tầng 3: hộp thoại giải mã ALBUM.KEY kiểu Windows cổ */}
      {pinOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-2">
          <style>{`
            @keyframes pin-shake {
              0%, 100% { transform: translateX(0) }
              15% { transform: translateX(-6px) } 30% { transform: translateX(5px) }
              45% { transform: translateX(-4px) } 60% { transform: translateX(3px) } 75% { transform: translateX(-2px) }
            }
          `}</style>
          <div
            key={shakeKey}
            role="dialog"
            aria-label={tx('ALBUM.KEY — Trình giải mã')}
            className={`w-[340px] max-w-full flex flex-col bg-[#d4d0c8] ${BEVEL_UP} shadow-[3px_3px_0_rgba(0,0,0,0.6)] text-zinc-900`}
            style={pinState === 'error' ? { animation: 'pin-shake 0.4s linear' } : undefined}
          >
            {/* Thanh tiêu đề */}
            <div className="flex items-center justify-between h-5 pl-1 pr-0.5 bg-linear-to-r from-blue-900 to-blue-700 text-[10px] text-white font-bold shrink-0">
              <span className="flex items-center gap-1 truncate">
                <svg viewBox="0 0 16 16" width={12} height={12} shapeRendering="crispEdges" aria-hidden>
                  <rect x={1} y={3} width={6} height={2} fill="#eab308" />
                  <rect x={1} y={4} width={14} height={10} fill="#eab308" />
                  <rect x={1} y={6} width={14} height={8} fill="#facc15" />
                </svg>
                {tx('ALBUM.KEY — Trình giải mã')}
              </span>
              <button
                onClick={() => {
                  onClickSound?.();
                  closePin();
                }}
                className={`w-4 h-3.5 flex items-center justify-center text-[9px] leading-none font-black ${KEY_3D}`}
                title={tx('Nhấn ESC để đóng hộp thoại')}
              >
                X
              </button>
            </div>

            <div className="flex gap-3 p-2.5">
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-start gap-2">
                  <PixelLock />
                  <p className="text-[10px] leading-snug">{tx('Cluster #211 hỏng. Nhập lại 2 byte offset in trên token vật lý:')}</p>
                </div>
                {/* Hex nhiễu: dòng có 2 byte mất */}
                <div className={`px-1.5 py-1 bg-black text-[9px] leading-tight ${BEVEL_DOWN}`}>
                  {hexNoise.map((row, i) => (
                    <div key={i} className="text-emerald-700 whitespace-nowrap overflow-hidden">{row}</div>
                  ))}
                  <div className="text-emerald-300 whitespace-nowrap">
                    4E 2F A1 <span className="text-amber-300">[{pin[0] ?? '?'}{pin[1] ?? '?'}] [{pin[2] ?? '?'}{pin[3] ?? '?'}]</span> 0D 0A
                  </div>
                </div>
                <div className="flex gap-1.5 justify-center items-center">
                  {Array.from({ length: PIN_LEN }).map((_, i) => (
                    <React.Fragment key={i}>
                      {i === 2 && <span className="text-sm font-bold">.</span>}
                      <div
                        className={`w-7 h-8 flex items-center justify-center text-base font-bold ${BEVEL_DOWN} ${
                          pinState === 'error'
                            ? 'bg-red-300 text-red-900'
                            : pinState === 'ok'
                            ? 'bg-emerald-200 text-emerald-900'
                            : 'bg-white text-zinc-900'
                        }`}
                      >
                        {pin[i] ?? ''}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex flex-col gap-1 mt-auto">
                  <button
                    onClick={submitPin}
                    disabled={pin.length !== PIN_LEN || pinState !== 'idle'}
                    className={`h-5 text-[9px] font-bold ${KEY_3D} disabled:text-zinc-500 disabled:cursor-default`}
                  >
                    {tx('[ DỰNG LẠI KHOÁ / Enter ]')}
                  </button>
                  <button
                    onClick={() => {
                      onClickSound?.();
                      closePin();
                    }}
                    className={`h-5 text-[9px] font-bold ${KEY_3D}`}
                  >
                    {tx('[ HỦY / Esc ]')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 shrink-0 content-start">
                {NUMPAD.map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      if (k === 'back') backspace();
                      else if (k === 'clear') {
                        if (pinState !== 'idle') return;
                        onClickSound?.();
                        setPin('');
                      } else typeDigit(k);
                    }}
                    className={`w-8 h-7 text-xs font-bold ${KEY_3D}`}
                    title={k === 'back' ? 'Backspace' : k === 'clear' ? tx('Xoá hết') : undefined}
                  >
                    {k === 'back' ? '←' : k === 'clear' ? 'C' : k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ghi đè: webcam giả lập bật lên, chớp bóng Miên đang khóc */}
      {override === 'cam' && (
        <div className="absolute right-3 top-3 z-50 w-40 bg-black border-2 border-zinc-500">
          <div className="h-4 px-1 bg-zinc-700 text-[9px] text-white font-bold flex items-center justify-between">
            <span>CAM_02 — LIVE</span>
            <span className="text-red-400">● REC</span>
          </div>
          <div className="relative h-28 overflow-hidden" style={{ animation: 'cam-flick 0.5s steps(2) infinite' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/ModelMIEN/cryingMien.png" alt="" className="absolute inset-0 w-full h-full object-cover object-top" style={{ filter: 'grayscale(1) contrast(1.4) brightness(0.7)' }} />
            <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0 1px, transparent 1px 3px)' }} />
            <div className="absolute bottom-0.5 left-1 text-[8px] text-zinc-300">03:14:07</div>
          </div>
        </div>
      )}

      {/* Sập nguồn */}
      {override === 'black' && (
        <div className="absolute inset-0 z-60 bg-black flex items-center justify-center">
          <span className="text-[10px] text-zinc-600 tracking-widest">NO SIGNAL</span>
        </div>
      )}

      {/* Khung lời An */}
      <div className="relative mx-2 mb-1 px-2.5 py-1.5 bg-black/80 border border-emerald-700/70 rounded-sm text-[10.5px] leading-snug text-zinc-100 min-h-10 text-justify">
        <span className="text-emerald-400 font-bold">An: </span>
        <span className="italic">{tx(line)}</span>
      </div>

      {/* Taskbar */}
      <div className="relative flex items-center justify-between h-7 px-1.5 bg-linear-to-b from-zinc-700 to-zinc-800 border-t border-zinc-500 text-[10px] text-zinc-100">
        <button
          onClick={() => {
            onClickSound?.();
            setSelected(null);
            setLine(START_LINE);
          }}
          className="flex items-center gap-1 px-2 h-5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/60 rounded-sm font-bold cursor-pointer"
        >
          {tx('Bắt đầu')}
        </button>
        <div className="flex items-center gap-2 text-zinc-300">
          <span title={tx('Không có kết nối mạng')}>OFFLINE</span>
          <button
            onClick={() => {
              onClickSound?.();
              setSelected(null);
              setLine(CLOCK_LINE);
            }}
            className="px-1.5 h-5 bg-zinc-900/70 border border-zinc-600 rounded-sm text-red-300 font-bold cursor-pointer"
          >
            03{colon ? ':' : ' '}14 AM
          </button>
        </div>
      </div>
    </div>
  );
};
