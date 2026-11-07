'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { tx } from '../locales/tx';

// =====================================================================
// MÀN HÌNH DESKTOP MÁY TÍNH CỦA AN (Màn 1)
// Hiện ra khi bật máy. Bấm icon → An nói một câu;
// bấm thư mục Dự_án_AURA → mở cửa sổ Notepad đọc trích đoạn tài liệu (manh mối Ending S);
// Mở khoá ALBUM_KỶ_NIỆM (Suy luận mật mã từ ký ức): hộp thoại PIN 4 số kiểu Windows cổ.
// Lời giải không hiện sẵn: thư mục Dự_án_AURA có nhat_ky.txt ("ngày chiếc mặt dây chuyền được khắc chữ"),
// người chơi tự nối với mặt dây chuyền dưới khe cửa #316 (17.05), cốc đánh răng (17.05), lịch tháng 5.
// Đồng hồ 03:14 là bẫy. Nhập đúng: CRT rít tụ điện, rung một nhịp rồi mở album.
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
  { id: 'aura', label: 'Dự_án_AURA', kind: 'folder', line: 'Tài liệu thiết kế AURA. Trang đầu có chữ Miên: "Mức đồng bộ 100% — KHÔNG BAO GIỜ DÙNG." Gạch chân hai lần.' },
  { id: 'backup', label: 'AURA_backup', kind: 'folderGray', line: 'Thư mục trống. Sửa đổi lần cuối: hôm nay, 03:14. Mình đâu có mở nó.' },
  { id: 'album', label: 'ALBUM_KỶ_NIỆM', kind: 'locked' },
];

const START_LINE = 'Máy chậm như rùa. Ông bán ở chợ đồ cũ bảo "bền như tình đầu".';

// Trích đoạn tài liệu thiết kế trong thư mục Dự_án_AURA (cửa sổ Notepad giả lập)
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
const PIN_OPEN_LINE = 'Mật khẩu 4 số... Ngày gì quan trọng ấy nhỉ? Dạo này đãng trí quá.';
const PIN_WRONG_LINE = 'Sai rồi... Đầu nhức buốt vì cố nhớ mãi không ra.';
const PIN_TIME_LINE = 'Đây là giờ đồng hồ chết, không phải ngày kỷ niệm...';
const PIN_OK_LINE = 'Mở được rồi...';
// Tệp nhật ký trong thư mục Dự_án_AURA (manh mối PIN)
const DIARY_FILE = 'nhat_ky.txt';
const DIARY_LINE = 'Nhật ký của mình... Em dặn mã album là ngày nào nhỉ.';
const DIARY_TEXT = [
  '14/05 — 01:12',
  'Miên đặt khoá cho album ảnh rồi, còn bắt mình ghi lại đây kẻo quên.',
  'Em dặn mã mở album là ngày hai đứa ngồi ngắm hoàng hôn bên bờ sông... Không phải ngày gặp đầu tiên, mà là ngày chiếc mặt dây chuyền được khắc chữ.',
  'Ghi thế thôi, chứ ngày ấy thì quên làm sao được.',
]
const PIN_ERROR_MS = 520;          // Ô số chớp đỏ + rung rồi tự xoá
const PIN_OK_MS = 900;             // Ô số xanh + CRT rít tụ điện một nhịp rồi mở album
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
  /** Kiểm tra mã PIN của ALBUM_KỶ_NIỆM: true = đúng (phòng 314 tự đóng máy và mở album) */
  onSubmitPin: (pin: string) => boolean;
  onClose: () => void;
  onClickSound?: () => void;
  /** Tiếng 'bíp' báo lỗi khi nhập sai PIN */
  onErrorSound?: () => void;
  /** Báo icon vừa được mở (để ghi biến cốt truyện) */
  onOpenIcon?: (id: string) => void;
}

export const DesktopScreen: React.FC<DesktopScreenProps> = ({ onSubmitPin, onClose, onClickSound, onErrorSound, onOpenIcon }) => {
  useLanguage(); // vẽ lại khi đổi ngôn ngữ
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<string>('Màn hình sáng lên. Desktop vẫn bừa bộn như mọi khi.');
  const [colon, setColon] = useState(true);
  // Cửa sổ Notepad của thư mục Dự_án_AURA (2 tệp: tài liệu thiết kế + nhật ký) + thông báo mở khoá manh mối
  const [auraOpen, setAuraOpen] = useState(false);
  const [auraTab, setAuraTab] = useState<'doc' | 'diary'>('doc');
  const [auraToast, setAuraToast] = useState(false);
  // Hộp thoại PIN: 'error' = ô số chớp đỏ + rung, 'ok' = ô số xanh, CRT rít tụ điện rồi mở album
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinState, setPinState] = useState<'idle' | 'error' | 'ok'>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [crtShake, setCrtShake] = useState(false);
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => timersRef.current.forEach((id) => window.clearTimeout(id)), []);

  // Tiếng rít tụ điện CRT lúc giải mã thành công (AudioContext riêng, đóng khi tắt máy)
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const ref = audioRef;
    return () => {
      void ref.current?.close().catch(() => {});
      ref.current = null;
    };
  }, []);
  const playCapacitorWhine = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current && Ctor) audioRef.current = new Ctor();
      const ctx = audioRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(6000, t);
      o.frequency.linearRampToValueAtTime(15600, t + 0.8);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.3);
      g.gain.linearRampToValueAtTime(0, t + 0.95);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    } catch {}
  }, []);

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

  const submitPin = useCallback(() => {
    if (pinState !== 'idle' || pin.length !== PIN_LEN) return;
    if (pin === ALBUM_KEY) {
      // Đúng: CRT rít tụ điện, rung một nhịp rồi mới báo phòng 314 mở album
      setPinState('ok');
      setLine(PIN_OK_LINE);
      setCrtShake(true);
      playCapacitorWhine();
      timersRef.current.push(window.setTimeout(() => onSubmitPin(pin), PIN_OK_MS));
      return;
    }
    onSubmitPin(pin);
    onErrorSound?.();
    setPinState('error');
    setShakeKey((k) => k + 1);
    setLine(pin === '0314' ? PIN_TIME_LINE : PIN_WRONG_LINE);
    timersRef.current.push(
      window.setTimeout(() => {
        setPin('');
        setPinState('idle');
      }, PIN_ERROR_MS),
    );
  }, [pinState, pin, onSubmitPin, onErrorSound, playCapacitorWhine]);

  // Phím thật khi hộp thoại PIN mở: 0-9, Backspace, Enter, Esc (đóng hộp thoại, chưa tắt màn hình).
  // Pha capture + chặn lan truyền để phòng 314 / Pause Menu không nhận cùng lần bấm.
  useEffect(() => {
    if (!pinOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) typeDigit(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') submitPin();
      else if (e.key === 'Escape') {
        if (pinState === 'idle') {
          onClickSound?.();
          closePin();
        }
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [pinOpen, pinState, typeDigit, backspace, submitPin, closePin, onClickSound]);

  useEffect(() => {
    const id = window.setInterval(() => setColon((c) => !c), 800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!auraToast) return;
    const id = window.setTimeout(() => setAuraToast(false), AURA_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [auraToast]);

  // Esc đóng cửa sổ tài liệu trước, chưa tắt màn hình máy tính.
  // Pha capture + chặn lan truyền để listener tắt màn hình của phòng 314 không nhận cùng lần bấm.
  useEffect(() => {
    if (!auraOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setAuraOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [auraOpen]);

  const press = (icon: DesktopIcon) => {
    onClickSound?.();
    setSelected(icon.id);
    onOpenIcon?.(icon.id);
    if (icon.kind === 'locked') {
      setPin('');
      setPinState('idle');
      setPinOpen(true);
      setLine(PIN_OPEN_LINE);
      return;
    }
    if (icon.line) setLine(icon.line);
    if (icon.id === 'aura') {
      setAuraTab('doc');
      setAuraOpen(true);
      setAuraToast(true);
    }
  };

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden rounded-sm font-mono select-none"
      style={crtShake ? { animation: 'crt-shake 0.09s linear infinite' } : undefined}
    >
      <style>{`
        @keyframes crt-shake {
          0% { transform: translate(0,0) } 25% { transform: translate(-4px,2px) }
          50% { transform: translate(3px,-3px) } 75% { transform: translate(-2px,-1px) } 100% { transform: translate(0,0) }
        }
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

      {/* Cửa sổ Notepad thư mục Dự_án_AURA: tài liệu thiết kế + nhật ký của An */}
      {auraOpen && (
        <div className="absolute inset-x-3 top-3 bottom-12 z-10 flex flex-col bg-[#f5f1e6] border-2 border-zinc-500 rounded-sm shadow-[4px_4px_0_rgba(0,0,0,0.6)] text-zinc-900">
          <div className="flex items-center justify-between h-5 px-1.5 bg-linear-to-r from-sky-800 to-sky-600 text-[10px] text-white font-bold shrink-0">
            <span className="truncate">{auraTab === 'doc' ? AURA_DOC_FILE : DIARY_FILE} — Notepad</span>
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
          {/* Hai tệp trong thư mục */}
          <div className="flex gap-1 px-1.5 pt-1 shrink-0 text-[10px]">
            {([['doc', AURA_DOC_FILE], ['diary', DIARY_FILE]] as const).map(([id, name]) => (
              <button
                key={id}
                onClick={() => {
                  onClickSound?.();
                  setAuraTab(id);
                  if (id === 'diary') setLine(DIARY_LINE);
                }}
                className={`px-1.5 py-0.5 border cursor-pointer ${auraTab === id ? 'bg-white border-zinc-500 font-bold' : 'bg-zinc-200 border-zinc-400 text-zinc-600'}`}
              >
                {name}
              </button>
            ))}
          </div>
          {auraTab === 'doc' ? (
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
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap">
              {DIARY_TEXT.map((l, i) => (
                <div key={i} className={i === 0 ? 'text-zinc-500 mb-1' : 'mb-1'}>
                  {tx(l)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mở thư mục AURA lần nào cũng báo rõ: manh mối đã được ghi nhận */}
      {auraToast && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 z-20 pointer-events-none px-2.5 py-1 bg-black/90 border border-amber-400/80 text-amber-200 text-[10px] font-bold tracking-widest whitespace-nowrap rounded-sm shadow-[0_0_16px_rgba(251,191,36,0.4)] animate-fade-in">
          {tx('[ĐÃ MỞ KHOÁ MANH MỐI: DỰ ÁN AURA]')}
        </div>
      )}

      {/* Hộp thoại nhập PIN kiểu Windows cổ: nổi giữa desktop, hình nền và icon vẫn thấy xung quanh.
          Lớp trong suốt phía sau chặn click xuống desktop như một hộp thoại modal thật. */}
      {pinOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-2">
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
            aria-label={tx('ALBUM_KỶ_NIỆM — Yêu cầu mã PIN')}
            className={`w-[320px] max-w-full flex flex-col bg-[#d4d0c8] ${BEVEL_UP} shadow-[3px_3px_0_rgba(0,0,0,0.6)] text-zinc-900`}
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
                {tx('ALBUM_KỶ_NIỆM — Yêu cầu mã PIN')}
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

            {/* Thân hộp thoại: trái = hướng dẫn + 4 ô số + nút hành động, phải = numpad 3×4 */}
            <div className="flex gap-3 p-2.5">
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-start gap-2">
                  <PixelLock />
                  <p className="text-[10px] leading-snug">{tx('Thư mục được bảo vệ. Vui lòng nhập mã PIN (4 số):')}</p>
                </div>
                <div className="flex gap-1.5 justify-center">
                  {Array.from({ length: PIN_LEN }).map((_, i) => (
                    <div
                      key={i}
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
                  ))}
                </div>
                <div className="flex flex-col gap-1 mt-auto">
                  <button
                    onClick={submitPin}
                    disabled={pin.length !== PIN_LEN || pinState !== 'idle'}
                    className={`h-5 text-[9px] font-bold ${KEY_3D} disabled:text-zinc-500 disabled:cursor-default`}
                  >
                    {tx('[ MỞ KHOÁ / Enter ]')}
                  </button>
                  <button
                    onClick={() => {
                      onClickSound?.();
                      closePin();
                    }}
                    className={`h-5 text-[9px] font-bold ${KEY_3D}`}
                  >
                    {tx('[ HUỶ / Esc ]')}
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
