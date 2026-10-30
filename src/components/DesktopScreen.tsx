'use client';
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { tx } from '../locales/tx';

// =====================================================================
// MÀN HÌNH DESKTOP MÁY TÍNH CỦA AN (Màn 1)
// Hiện ra khi bật máy, trước khung nhập PIN. Bấm icon → An nói một câu;
// bấm tệp khoá ALBUM_KỶ_NIỆM_1705 → mở khung nhập PIN.
// Icon là pixel art tự vẽ (không dùng logo thật của hãng nào).
// =====================================================================

type IconKind = 'trash' | 'lol' | 'code' | 'steam' | 'chat' | 'music' | 'folder' | 'folderGray' | 'locked';

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
  { id: 'steam', label: 'Steam', kind: 'steam', line: 'Thư viện 214 game. Chơi được 9. Còn lại đều để dành "cuối tuần rảnh thì chơi".' },
  { id: 'chat', label: 'Tin nhắn', kind: 'chat', line: 'Tin nhắn chưa đọc: Mẹ (3). Lát nữa trả lời... Lát nữa là bao giờ nhỉ.' },
  { id: 'music', label: 'Nhạc', kind: 'music', line: 'Playlist "Hoàng hôn", 12 bài, Miên chọn hết. Bài đầu tiên chỉ là tiếng một chiếc hộp nhạc.' },
  { id: 'photos', label: 'Ảnh_2_đứa', kind: 'folder', line: 'Ảnh hai đứa ở bến An Yên. Ảnh nào cũng nhoè đúng chỗ mặt mình, như bị ai xoá dở.' },
  { id: 'aura', label: 'Đồ_án_AURA', kind: 'folder', line: 'Tài liệu thiết kế AURA. Trang đầu có chữ Miên: "Mức đồng bộ 100% — KHÔNG BAO GIỜ DÙNG." Gạch chân hai lần.' },
  { id: 'backup', label: 'AURA_backup', kind: 'folderGray', line: 'Thư mục trống. Sửa đổi lần cuối: hôm nay, 03:14. Mình đâu có mở nó.' },
  { id: 'album', label: 'ALBUM_KỶ_NIỆM_1705', kind: 'locked' },
];

const START_LINE = 'Máy chậm như rùa. Ông bán ở chợ đồ cũ bảo "bền như tình đầu".';
const CLOCK_LINE = '03:14. Đồng hồ lại đứng rồi.';

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
    case 'steam':
      body = [
        r(4, 2, 8, 12, '#1b2838'), r(2, 4, 12, 8, '#1b2838'), r(3, 3, 10, 10, '#1b2838'),
        r(9, 4, 3, 3, '#c7d5e0'), r(10, 5, 1, 1, '#1b2838'), r(4, 9, 3, 3, '#c7d5e0'), r(6, 7, 4, 2, '#c7d5e0'),
      ];
      break;
    case 'chat':
      body = [
        r(2, 3, 12, 8, '#22c55e'), r(3, 2, 10, 10, '#22c55e'), r(4, 12, 2, 2, '#22c55e'), r(5, 6, 1, 2, '#f0fdf4'),
        r(8, 6, 1, 2, '#f0fdf4'), r(11, 6, 1, 2, '#f0fdf4'), r(11, 1, 4, 4, '#ef4444'), r(12, 2, 2, 2, '#fff1f2'),
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
  onOpenPin: () => void;
  onClose: () => void;
  onClickSound?: () => void;
  /** Báo icon vừa được mở (để ghi biến cốt truyện) */
  onOpenIcon?: (id: string) => void;
}

export const DesktopScreen: React.FC<DesktopScreenProps> = ({ onOpenPin, onClose, onClickSound, onOpenIcon }) => {
  useLanguage(); // vẽ lại khi đổi ngôn ngữ
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<string>('Màn hình sáng lên. Desktop vẫn bừa bộn như mọi khi.');
  const [colon, setColon] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => setColon((c) => !c), 800);
    return () => window.clearInterval(id);
  }, []);

  const press = (icon: DesktopIcon) => {
    onClickSound?.();
    setSelected(icon.id);
    onOpenIcon?.(icon.id);
    if (icon.kind === 'locked') {
      onOpenPin();
      return;
    }
    if (icon.line) setLine(icon.line);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden rounded-sm font-mono select-none">
      {/* Hình nền: Bến An Yên lúc hoàng hôn */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #2b1055 0%, #7b2f7f 38%, #d16ba5 58%, #f6b26b 70%, #3b0764 71%, #1e1b4b 100%)' }}
      />
      <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: '52%', width: 70, height: 70, background: '#ffe6b3', opacity: 0.85, clipPath: 'inset(0 0 50% 0)' }} />
      <div className="absolute left-0 right-0" style={{ top: '70%', height: 2, background: 'rgba(255,220,180,0.5)' }} />

      {/* Lưới icon */}
      <div className="relative flex-1 p-2 grid grid-flow-col grid-rows-5 auto-cols-[78px] gap-x-1 gap-y-0.5 content-start">
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

      {/* Khung lời An */}
      <div className="relative mx-2 mb-1 px-2.5 py-1.5 bg-black/80 border border-emerald-700/70 rounded-sm text-[10.5px] leading-snug text-zinc-100 min-h-[40px] text-justify">
        <span className="text-emerald-400 font-bold">An: </span>
        <span className="italic">{tx(line)}</span>
      </div>

      {/* Taskbar */}
      <div className="relative flex items-center justify-between h-7 px-1.5 bg-gradient-to-b from-zinc-700 to-zinc-800 border-t border-zinc-500 text-[10px] text-zinc-100">
        <button
          onClick={() => {
            onClickSound?.();
            setSelected(null);
            setLine(START_LINE);
          }}
          className="flex items-center gap-1 px-2 h-5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/60 rounded-sm font-bold cursor-pointer"
        >
          ▣ {tx('Bắt đầu')}
        </button>
        <div className="flex items-center gap-2 text-zinc-300">
          <span title={tx('Không có kết nối mạng')}>📶✕</span>
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
