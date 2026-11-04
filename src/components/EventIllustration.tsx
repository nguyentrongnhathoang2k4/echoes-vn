'use client';
import React, { useEffect, useRef } from 'react';
import { px, hash } from './pixel/pixelKit';
import { tx } from '../locales/tx';

// =====================================================================
// ẢNH MINH HOẠ SỰ KIỆN (EVENT CG) Ở GIỮA KHUNG THOẠI VN
// `illustration` của node thoại nhận hai dạng:
//   - 'cg:<khoá>'      : tranh pixel art vẽ sẵn bằng code (bảng CG bên dưới), không cần file ảnh
//   - '/assets/cg/...' : file ảnh thật trong public/ (vẽ tay sau này), hiển thị giữ nét pixel
// Khung: 'pixel' (viền pixel + bóng đổ), 'polaroid' (tấm ảnh trắng viền dày), 'viewer' (cửa sổ xem ảnh
// kiểu máy tính cũ, dùng cho ảnh mở ra trên máy tính phòng 314).
// =====================================================================

export type IllustrationFrame = 'pixel' | 'polaroid' | 'viewer';

const CG_W = 180;
const CG_H = 120;

interface BuiltinCg {
  frame: IllustrationFrame;
  /** Tên tệp / chú thích hiện trên khung */
  caption: string;
  /** Ảnh ngoài cần tải trước khi vẽ (vd: model chân dung của Miên), truyền vào draw theo đúng thứ tự */
  images?: string[];
  draw: (ctx: CanvasRenderingContext2D, imgs: HTMLImageElement[]) => void;
  /** Chữ trong tranh: hiện bằng HTML chồng lên canvas cho nét chữ sắc, dấu tiếng Việt đọc rõ */
  labels?: CgLabel[];
}

/** Ảnh album: Miên nhắm mắt cười dưới nắng chiều bến An Yên, xe đạp cũ dựng gốc cây */
function drawAlbumSunset(ctx: CanvasRenderingContext2D, imgs: HTMLImageElement[]) {
  // Trời hoàng hôn tím → hồng → cam (từng dải pixel)
  const sky = ['#3b1a5a', '#5b2a7a', '#8a3c8c', '#b9558f', '#df7a8a', '#f4a07a', '#f8c27a'];
  sky.forEach((c, i) => px(ctx, 0, i * 10, CG_W, 10, c));
  // Mặt trời lặn
  for (let y = 0; y < 14; y++) {
    const half = Math.round(Math.sqrt(14 * 14 - y * y));
    px(ctx, 62 - half, 66 - y, half * 2, 1, y > 9 ? '#fff4c8' : '#ffe39a');
  }
  // Sông + vệt nắng
  px(ctx, 0, 70, CG_W, 50, '#4a3270');
  for (let i = 0; i < 9; i++) px(ctx, 50 + (i % 3) * 4, 74 + i * 4, 24 - i * 2, 1, '#f8c27a');
  for (let i = 0; i < 30; i++) px(ctx, hash(i) * CG_W, 74 + hash(i * 3) * 44, 6, 1, '#6a4a92');
  // Lan can cầu gỗ
  px(ctx, 0, 84, CG_W, 3, '#3a2216');
  for (let x = 4; x < CG_W; x += 14) px(ctx, x, 84, 3, 36, '#3a2216');
  px(ctx, 0, 96, CG_W, 2, '#4a2c1c');
  // Gốc cây + xe đạp cũ dựng bên trái
  px(ctx, 8, 30, 10, 54, '#2a1810');
  for (let i = 0; i < 26; i++) px(ctx, hash(i * 5) * 40 - 4, 14 + hash(i * 7) * 22, 10, 6, i % 2 ? '#3d2a4a' : '#4a3358');
  const wheel = (cx: number, cy: number) => {
    for (let a = 0; a < 24; a++) px(ctx, cx + Math.cos((a / 24) * Math.PI * 2) * 8, cy + Math.sin((a / 24) * Math.PI * 2) * 8, 1, 1, '#1a1012');
  };
  wheel(26, 108);
  wheel(52, 108);
  px(ctx, 26, 100, 26, 1, '#4d6b3c');
  px(ctx, 36, 96, 1, 12, '#4d6b3c');
  px(ctx, 48, 96, 6, 1, '#1a1012');
  // Hạt nắng lấp lánh
  for (let i = 0; i < 14; i++) px(ctx, hash(i * 11) * CG_W, hash(i * 13) * 60, 1, 1, '#fff4c8');
  // Miên: chính model chân dung nhắm mắt cười (playful), đứng trước lan can, cắt ngang vai như ảnh chụp
  const mien = imgs[0];
  if (mien?.complete && mien.naturalWidth > 0) {
    const h = 92;
    const w = Math.round((mien.naturalWidth / mien.naturalHeight) * h);
    ctx.imageSmoothingEnabled = true;     // Thu nhỏ ảnh gốc độ phân giải cao cho mịn, canvas vẫn phóng to giữ nét
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mien, 100, CG_H - h + 2, w, h);
    ctx.imageSmoothingEnabled = false;
    // Nắng chiều hắt viền tóc bên phía mặt trời
    ctx.fillStyle = 'rgba(248,194,122,0.22)';
    ctx.fillRect(100, CG_H - h + 2, 10, h);
  }
}

/** Ảnh album tiếp theo: hai ly bạc xỉu trên bàn gỗ quán quen, ngoài cửa sổ là chiếc xe đạp cũ dựng gốc cây */
function drawAlbumCafe(ctx: CanvasRenderingContext2D) {
  // Tường quán vàng ấm + cửa sổ nhìn ra gốc cây
  px(ctx, 0, 0, CG_W, 70, '#c9925a');
  for (let i = 0; i < 40; i++) px(ctx, hash(i * 3) * CG_W, hash(i * 5) * 70, 4, 2, '#b98250');
  px(ctx, 96, 8, 74, 52, '#4a2c1c');
  px(ctx, 100, 12, 66, 44, '#f4b27a');
  px(ctx, 100, 12, 66, 14, '#e48a8a');
  px(ctx, 100, 44, 66, 12, '#7a9a5a');
  px(ctx, 132, 12, 2, 44, '#4a2c1c');
  // Gốc cây + xe đạp cũ, giỏ xe cắm hoa chuông tím
  px(ctx, 146, 14, 8, 42, '#3a2216');
  const wheel = (cx: number, cy: number) => {
    for (let a = 0; a < 20; a++) px(ctx, cx + Math.cos((a / 20) * Math.PI * 2) * 5, cy + Math.sin((a / 20) * Math.PI * 2) * 5, 1, 1, '#2a1a12');
  };
  wheel(112, 50);
  wheel(130, 50);
  px(ctx, 112, 44, 18, 1, '#4d6b3c');
  px(ctx, 120, 41, 1, 9, '#4d6b3c');
  px(ctx, 106, 40, 6, 4, '#a07040');
  [[107, 38], [109, 37], [111, 38]].forEach(([x, y]) => px(ctx, x, y, 2, 2, '#9a6ad0'));
  // Mặt bàn gỗ
  px(ctx, 0, 70, CG_W, 50, '#7a4a2a');
  for (let y = 74; y < CG_H; y += 9) px(ctx, 0, y, CG_W, 1, '#5e3820');
  for (let i = 0; i < 20; i++) px(ctx, hash(i * 7) * CG_W, 72 + hash(i * 9) * 46, 10, 1, '#8a5a34');
  // Hai ly bạc xỉu: sữa dưới, cà phê nâu trên, ống hút (ống của Miên bị cắn dẹt)
  const glass = (x: number, flat: boolean) => {
    px(ctx, x, 46, 22, 46, 'rgba(230,240,245,0.35)');
    px(ctx, x + 2, 70, 18, 20, '#f2ead8');
    px(ctx, x + 2, 54, 18, 16, '#a8744a');
    px(ctx, x + 2, 64, 18, 6, '#c89a6a');
    for (let i = 0; i < 5; i++) px(ctx, x + 4 + i * 3, 52 + (i % 2), 2, 2, '#e8f4f8');   // Đá viên
    px(ctx, x, 46, 1, 46, 'rgba(255,255,255,0.6)');
    px(ctx, x + 12, 28, flat ? 3 : 2, 30, flat ? '#f472b6' : '#60a5fa');
    if (flat) px(ctx, x + 11, 28, 5, 2, '#f472b6');
    px(ctx, x - 2, 92, 26, 3, 'rgba(0,0,0,0.25)');            // Bóng ly trên bàn
  };
  glass(34, false);
  glass(66, true);
  // Vệt nắng chiều xiên qua bàn
  ctx.fillStyle = 'rgba(255,220,160,0.16)';
  ctx.fillRect(0, 70, 90, 50);
}

/** Hộp nhung đỏ mở nắp trong balo ướt, đôi nhẫn bạc khắc tên */
function drawRingBox(ctx: CanvasRenderingContext2D) {
  // Lòng balo ướt tối, vệt bùn
  px(ctx, 0, 0, CG_W, CG_H, '#141a24');
  for (let i = 0; i < 60; i++) px(ctx, hash(i) * CG_W, hash(i * 3) * CG_H, 8, 2, i % 3 ? '#1b2230' : '#2a2418');
  // Giọt nước đọng
  for (let i = 0; i < 12; i++) px(ctx, hash(i * 7) * CG_W, hash(i * 9) * CG_H, 1, 2, '#5a7090');
  // Nắp hộp mở (lót satin trắng ngà)
  px(ctx, 46, 14, 88, 40, '#6b0f1e');
  px(ctx, 50, 18, 80, 32, '#e9dcc8');
  px(ctx, 50, 18, 80, 3, '#fff6e6');
  px(ctx, 46, 14, 88, 2, '#8a1a2c');
  // Thân hộp nhung đỏ
  px(ctx, 40, 54, 100, 46, '#7a1424');
  px(ctx, 40, 54, 100, 3, '#9a2034');
  px(ctx, 40, 97, 100, 3, '#4a0a16');
  for (let i = 0; i < 40; i++) px(ctx, 42 + hash(i * 5) * 96, 58 + hash(i * 7) * 38, 1, 1, '#8e1c30');
  // Khe nhung giữ nhẫn
  px(ctx, 56, 70, 68, 6, '#3a0610');
  // Đôi nhẫn bạc
  const ring = (cx: number, cy: number, r: number) => {
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      const lit = Math.sin(t) < -0.3;
      px(ctx, cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.8, 2, 2, lit ? '#f4f6fa' : '#a8b0bc');
    }
  };
  ring(76, 68, 9);
  ring(102, 68, 8);
  // Lấp lánh
  [[70, 58], [108, 60], [90, 52]].forEach(([x, y]) => {
    px(ctx, x, y - 2, 1, 5, '#ffffff');
    px(ctx, x - 2, y, 5, 1, '#ffffff');
  });
  // (Chữ khắc trên lót nắp là nhãn HTML — xem labels của ring_box)
}

/** Bìa bệnh án nhôm đầu giường: dấu đỏ BV TRUNG HOÀ, giờ tiếp nhận 00:52 17/05, chữ Miên nhoè nước mắt.
 *  Chữ trên tờ giấy là nhãn HTML (labels của medical_chart) để đọc rõ dấu tiếng Việt; canvas chỉ vẽ hình. */
function drawMedicalChart(ctx: CanvasRenderingContext2D) {
  // Tường phòng cấp cứu xanh xám, ánh đèn đỏ hắt
  px(ctx, 0, 0, CG_W, CG_H, '#1f2a2c');
  px(ctx, 0, 0, 22, CG_H, '#3a1a1c');
  // Bìa nhôm + kẹp
  px(ctx, 22, 6, 136, 112, '#9aa4ac');
  px(ctx, 22, 6, 136, 2, '#c4ccd2');
  px(ctx, 74, 2, 32, 10, '#5a646c');
  px(ctx, 78, 4, 24, 4, '#2c3236');
  // Tờ giấy
  px(ctx, 28, 14, 124, 102, '#f2efe6');
  px(ctx, 34, 26, 112, 1, '#3a3a3a');                  // Gạch dưới tiêu đề
  // Dòng kẻ ghi chép (phía dưới các dòng chữ)
  for (let y = 70; y < 90; y += 6) px(ctx, 34, y, 74 - hash(y) * 26, 1, '#b4b0a6');
  // Điện tim yếu vẽ tay
  let py = 103;
  for (let x = 34; x < 146; x++) {
    const beat = (x - 34) % 28;
    const y = beat === 13 ? 95 : beat === 14 ? 110 : 103 + Math.round(Math.sin(x * 0.6));
    px(ctx, x, Math.min(py, y), 1, Math.abs(y - py) + 1, '#2a2a2a');
    py = y;
  }
  // Giọt nước mắt nhoè mực ở lề
  [[40, 80], [46, 86], [36, 88]].forEach(([x, y]) => {
    px(ctx, x - 2, y - 1, 5, 3, 'rgba(110,130,170,0.35)');
    px(ctx, x - 1, y - 2, 3, 5, 'rgba(110,130,170,0.35)');
  });
}

/** Nhãn chữ đặt chồng lên tranh (toạ độ theo lưới canvas 180×120, cỡ chữ theo đơn vị canvas) */
interface CgLabel {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bold?: boolean;
  center?: boolean;
  /** Độ nghiêng (độ) */
  rotate?: number;
  font?: 'mono' | 'serif';
  /** Viền khung (dấu mộc) */
  boxed?: boolean;
}

const CG: Record<string, BuiltinCg> = {
  album_sunset: { frame: 'viewer', caption: 'BEN_AN_YEN_1705.BMP', images: ['/assets/ModelMIEN/playfulMien.png'], draw: drawAlbumSunset },
  album_cafe: { frame: 'viewer', caption: 'BAC_XIU_QUAN_QUEN.BMP', draw: drawAlbumCafe },
  ring_box: {
    frame: 'polaroid',
    caption: 'AN & MIÊN • BẾN AN YÊN',
    draw: drawRingBox,
    labels: [
      { text: 'AN & MIÊN', x: 90, y: 22, size: 8, color: '#7a5038', center: true, font: 'serif', bold: true },
      { text: 'BẾN AN YÊN', x: 90, y: 33, size: 6.5, color: '#8a6a50', center: true, font: 'serif' },
    ],
  },
  medical_chart: {
    frame: 'pixel',
    caption: 'BV TRUNG HOÀ • 17/05',
    draw: drawMedicalChart,
    labels: [
      { text: 'BỆNH ÁN CẤP CỨU', x: 34, y: 16, size: 8, color: '#1c1c1c', bold: true },
      { text: 'TRẦN HOÀNG AN • 24 TUỔI', x: 34, y: 31, size: 6.5, color: '#1c1c1c' },
      { text: 'TIẾP NHẬN 00:52 • 17/05', x: 34, y: 41, size: 6.5, color: '#1c1c1c' },
      { text: 'GLASGOW 3/15', x: 34, y: 51, size: 6.5, color: '#9a1010', bold: true },
      { text: 'BV TRUNG HOÀ', x: 124, y: 74, size: 6.5, color: 'rgba(190,30,40,0.85)', bold: true, center: true, rotate: -14, boxed: true },
    ],
  },
};

/** Tranh pixel vẽ sẵn: canvas 180×120 phóng to giữ nét */
function BuiltinCanvas({ cg }: { cg: BuiltinCg }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    let alive = true;
    const imgs = (cg.images ?? []).map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    const paint = () => {
      if (!alive) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, CG_W, CG_H);
      cg.draw(ctx, imgs);
    };
    paint();
    // Ảnh ngoài tải xong thì vẽ lại (lần đầu vẽ nền trước để khung không trống)
    imgs.forEach((img) => {
      if (!img.complete) img.onload = paint;
    });
    return () => {
      alive = false;
    };
  }, [cg]);
  return (
    <canvas
      ref={ref}
      width={CG_W}
      height={CG_H}
      className="block w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

interface EventIllustrationProps {
  /** 'cg:<khoá>' hoặc đường dẫn ảnh trong public/ */
  src: string;
  /** Khung cho ảnh file (tranh vẽ sẵn tự chọn khung riêng) */
  frame?: IllustrationFrame;
}

export const EventIllustration: React.FC<EventIllustrationProps> = ({ src, frame }) => {
  const builtin = src.startsWith('cg:') ? CG[src.slice(3)] : undefined;
  if (src.startsWith('cg:') && !builtin) return null;
  const kind: IllustrationFrame = builtin?.frame ?? frame ?? 'pixel';
  const caption = builtin?.caption;
  // Ảnh 3:2, 280×187 → 360×240; cỡ nhãn chữ tính theo bề rộng khung (cqw) nên luôn khớp với tranh
  const picture = (
    <div className="relative w-70 sm:w-90 aspect-3/2 bg-black overflow-hidden" style={{ containerType: 'inline-size' }}>
      {builtin ? (
        <>
          <BuiltinCanvas cg={builtin} />
          {builtin.labels?.map((l) => (
            <span
              key={l.text}
              className={`absolute whitespace-nowrap leading-none ${l.font === 'serif' ? 'font-serif italic' : 'font-mono'} ${
                l.bold ? 'font-bold' : ''
              } ${l.boxed ? 'border-2 border-current px-[0.3em] py-[0.25em]' : ''}`}
              style={{
                left: `${(l.x / CG_W) * 100}%`,
                top: `${(l.y / CG_H) * 100}%`,
                fontSize: `${(l.size / CG_W) * 100}cqw`,
                color: l.color,
                transform: `${l.center ? 'translateX(-50%) ' : ''}${l.rotate ? `rotate(${l.rotate}deg)` : ''}`,
              }}
            >
              {tx(l.text)}
            </span>
          ))}
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="block w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
      )}
    </div>
  );

  return (
    <div className="pointer-events-none select-none" style={{ animation: 'vn-cg-in 450ms ease-out both' }}>
      <style>{`@keyframes vn-cg-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
      {kind === 'viewer' ? (
        // Cửa sổ xem ảnh kiểu máy tính cũ (cùng kiểu viền nổi với desktop phòng 314)
        <div className="bg-[#d4d0c8] border-2 border-t-white border-l-white border-b-zinc-700 border-r-zinc-700 shadow-[4px_4px_0_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between h-5 px-1.5 bg-linear-to-r from-blue-900 to-blue-700 text-[10px] font-mono font-bold text-white">
            <span className="truncate">{caption ?? 'image.bmp'} — {tx('Xem ảnh')}</span>
            <span className="w-4 h-3.5 flex items-center justify-center text-[9px] text-zinc-900 bg-[#d4d0c8] border border-t-white border-l-white border-b-zinc-700 border-r-zinc-700">X</span>
          </div>
          <div className="p-1.5">
            <div className="border-2 border-t-zinc-700 border-l-zinc-700 border-b-white border-r-white">{picture}</div>
          </div>
        </div>
      ) : kind === 'polaroid' ? (
        // Tấm ảnh lấy liền: viền trắng ngà, đáy dày ghi chú bằng tay
        <div className="bg-[#f4f1ea] p-2.5 pb-1 shadow-[4px_4px_0_rgba(0,0,0,0.6)] -rotate-1">
          {picture}
          <div className="h-7 flex items-center justify-center font-serif italic text-xs text-zinc-600">{caption ?? ''}</div>
        </div>
      ) : (
        // Khung pixel: viền sáng một lớp + viền tối một lớp, bóng đổ khối
        <div className="p-0.5 bg-zinc-200 shadow-[4px_4px_0_rgba(0,0,0,0.6)]">
          <div className="p-0.5 bg-zinc-900">{picture}</div>
          {caption && (
            <div className="px-1.5 py-0.5 bg-zinc-200 text-[10px] font-mono tracking-widest text-zinc-800 text-center">{caption}</div>
          )}
        </div>
      )}
    </div>
  );
};
