"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

interface SynapticCollapseOverlayProps {
  isOpen: boolean;
  onRevive: (newSanity: number) => void;
  onLoadLastSave: () => void;
  onRestart: () => void;
}

export const SynapticCollapseOverlay: React.FC<SynapticCollapseOverlayProps> = ({
  isOpen,
  onRevive,
  onLoadLastSave,
  onRestart,
}) => {
  // Trạng thái: 'FLATLINE' (đang cấp cứu) | 'REVIVING' (đang sốc điện lóe sáng) | 'REVIVED_SPEECH' (độc thoại sau sốc) | 'DEAD' (chết não)
  const [phase, setPhase] = useState<'FLATLINE' | 'REVIVING' | 'REVIVED_SPEECH' | 'DEAD'>('FLATLINE');
  
  // Thanh nạp năng lượng (0 - 100%)
  const [chargeProgress, setChargeProgress] = useState<number>(0);
  const [isCharged, setIsCharged] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(15.0); // 15 giây đếm ngược
  const [flashWhite, setFlashWhite] = useState<boolean>(false);
  const [screenShock, setScreenShock] = useState<boolean>(false);
  const [whisperIdx, setWhisperIdx] = useState<number>(0);

  const chargeRef = useRef<number>(0);
  chargeRef.current = chargeProgress;

  // Danh sách các câu vọng mờ ảo từ thế giới thực lọt vào ý thức
  const hospitalWhispers = [
    '„Bác sĩ! Huyết áp bệnh nhân tụt dốc không phanh! Sóng não phẳng lì rồi!‟',
    '„Chuẩn bị máy khử rung tim! Nạp 200 Jun! Mau lên, không còn nhiều thời gian đâu!‟',
    '„An ơi... anh có nghe thấy em không... Đừng bỏ em ở lại mà...‟',
    '„Tăng liều Adrenaline ngay! Sạc lên 360 Jun! Tránh xa giường bệnh!‟',
    '„An... làm ơn mở mắt ra nhìn em đi... Anh đã hứa đêm nay cùng em về nhà mà...‟',
  ];

  // Khi mở overlay: Kích hoạt Flatline audio và reset thông số
  useEffect(() => {
    if (!isOpen) {
      setPhase('FLATLINE');
      setChargeProgress(0);
      setIsCharged(false);
      setTimeLeft(15.0);
      setFlashWhite(false);
      setScreenShock(false);
      audioEngine.stopFlatline();
      return;
    }

    // Bắt đầu còi Flatline 880Hz nhói buốt
    audioEngine.startFlatline();
    setPhase('FLATLINE');
    setChargeProgress(0);
    setIsCharged(false);
    setTimeLeft(15.0);

    // Chu kỳ thay đổi tiếng vọng từ phòng cấp cứu
    const whisperInterval = setInterval(() => {
      setWhisperIdx((prev) => (prev + 1) % hospitalWhispers.length);
    }, 2800);

    // Đồng hồ đếm ngược 15 giây
    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(timerInterval);
          audioEngine.stopFlatline();
          setPhase('DEAD');
          return 0;
        }
        return Math.max(0, +(prev - 0.1).toFixed(1));
      });
    }, 100);

    // Cơ chế tiêu hao năng lượng sạc tự nhiên nếu người chơi ngừng bấm
    const decayInterval = setInterval(() => {
      setChargeProgress((prev) => {
        if (prev >= 100) return 100;
        return Math.max(0, prev - 1.2);
      });
    }, 100);

    return () => {
      clearInterval(whisperInterval);
      clearInterval(timerInterval);
      clearInterval(decayInterval);
      audioEngine.stopFlatline();
    };
  }, [isOpen]);

  // Cập nhật trạng thái sạc đầy
  useEffect(() => {
    if (chargeProgress >= 100) {
      setIsCharged(true);
    }
  }, [chargeProgress]);

  // Hành động nạp điện (khi click hoặc nhấn Space)
  const handlePumpCharge = useCallback(() => {
    if (phase !== 'FLATLINE') return;

    if (isCharged) {
      // Đã sạc đủ 100% -> Thực hiện sốc điện giải phóng xung lực!
      triggerDefibrillatorShock();
      return;
    }

    setChargeProgress((prev) => {
      const next = Math.min(100, prev + 12);
      audioEngine.playDefibCharge(next);
      if (next >= 100) {
        setIsCharged(true);
      }
      return next;
    });
  }, [phase, isCharged]);

  // Kích hoạt cú sốc điện cực mạnh
  const triggerDefibrillatorShock = () => {
    setPhase('REVIVING');
    audioEngine.stopFlatline();
    audioEngine.playDefibShock();

    // Hiệu ứng lóe sáng trắng và rung chấn màn hình
    setFlashWhite(true);
    setScreenShock(true);

    setTimeout(() => {
      setFlashWhite(false);
    }, 350);

    setTimeout(() => {
      setScreenShock(false);
      setPhase('REVIVED_SPEECH');
    }, 1200);
  };

  // Lắng nghe phím Space hoặc Enter để nạp điện
  useEffect(() => {
    if (!isOpen || phase !== 'FLATLINE') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handlePumpCharge();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, phase, handlePumpCharge]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center select-none font-mono transition-all duration-300 ${
        screenShock ? 'animate-shock' : ''
      }`}
    >
      {/* Lớp lóe sáng trắng chói lòa khi sốc tim */}
      {flashWhite && (
        <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-300" />
      )}

      {/* Background tối om với hiệu ứng lưới ECG y tế và vignette đỏ báo tử */}
      <div className="absolute inset-0 bg-black/95">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-950/40 via-black to-black" />
        {/* Lưới tọa độ Monitor ICU */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(239, 68, 68, 0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.25) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* =========================================================
          GIAI ĐOẠN 1: MÁY SỐC ĐIỆN & CƠN NGỪNG TIM (FLATLINE QTE)
         ========================================================= */}
      {phase === 'FLATLINE' && (
        <div
          onClick={handlePumpCharge}
          className="relative z-10 w-full max-w-2xl px-6 py-8 mx-4 bg-zinc-950/90 border-2 border-red-600/90 rounded-lg shadow-[0_0_60px_rgba(220,38,38,0.5)] text-center cursor-pointer"
        >
          {/* Header Báo động đỏ */}
          <div className="flex items-center justify-between border-b border-red-900/60 pb-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-ping inline-block" />
              <span className="text-red-500 font-black tracking-widest text-xs md:text-sm uppercase">
                [ CẢNH BÁO NGUY CẤP: TIM NGỪNG ĐẬP (03:14 AM) ]
              </span>
            </div>
            <div className="text-red-400 font-bold text-xs">
              0 BPM • VÔ MẠCH
            </div>
          </div>

          {/* Đồ thị sóng điện tim ECG Flatline */}
          <div className="relative w-full h-24 bg-black/80 border border-red-900/50 rounded flex items-center justify-center overflow-hidden mb-6 shadow-inner">
            {/* Đường thẳng Flatline đỏ máu */}
            <div className="w-full h-[2px] bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse" />
            <div className="absolute top-2 left-3 text-[10px] text-red-500/80 font-mono tracking-wider">
              ECG LEAD II • GAIN 1.0x • TÍN HIỆU: PHẲNG LÌ (FLATLINE)
            </div>
            <div className="absolute bottom-2 right-3 text-2xl font-black text-red-600/90 tracking-widest">
              ── 00 ──
            </div>
          </div>

          {/* Tiếng vọng mờ ảo từ thực tại */}
          <div className="min-h-[52px] flex items-center justify-center mb-6 px-4">
            <p className="text-sm md:text-base italic font-serif text-zinc-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] animate-in fade-in duration-500">
              {hospitalWhispers[whisperIdx]}
            </p>
          </div>

          {/* Thanh nạp năng lượng sốc điện (Joules) */}
          <div className="space-y-2 mb-6 text-left">
            <div className="flex justify-between text-xs font-bold font-mono">
              <span className="text-zinc-400">
                ĐIỆN ÁP MÁY KHỬ RUNG TIM (DEFIBRILLATOR CHARGE):
              </span>
              <span className={isCharged ? 'text-amber-400 font-black animate-pulse' : 'text-red-400'}>
                {Math.floor((chargeProgress / 100) * 360)} / 360 JOULES ({Math.floor(chargeProgress)}%)
              </span>
            </div>

            <div className="w-full h-6 bg-zinc-900 border border-zinc-700 rounded-sm overflow-hidden p-0.5">
              <div
                className={`h-full transition-all duration-75 rounded-xs ${
                  isCharged
                    ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 shadow-[0_0_20px_rgba(251,191,36,0.9)] animate-pulse'
                    : 'bg-gradient-to-r from-red-800 to-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                }`}
                style={{ width: `${chargeProgress}%` }}
              />
            </div>
          </div>

          {/* Nút hành động QTE: Spam phím Space hoặc Click */}
          <div className="space-y-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePumpCharge();
              }}
              className={`w-full py-3.5 px-6 font-mono font-black text-sm md:text-base tracking-widest rounded transition-all duration-150 border-2 ${
                isCharged
                  ? 'bg-amber-500 hover:bg-amber-400 text-black border-white shadow-[0_0_30px_rgba(251,191,36,0.9)] scale-105 animate-bounce'
                  : 'bg-red-950/80 hover:bg-red-900 text-red-200 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-95'
              }`}
            >
              {isCharged
                ? '⚡ [ ĐÃ ĐẠT 360J • NHẤN SPACE / CLICK ĐỂ PHÓNG ĐIỆN: "CLEAR!" ] ⚡'
                : '⚡ NHẤN LIÊN TỤC [ PHÍM CÁCH (SPACE) ] HOẶC [ CLICK ] ĐỂ NẠP ĐIỆN!'}
            </button>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono px-1">
              <span>* Giữ nhịp nhấn dồn dập trước khi điện thế bị tụt</span>
              <span className="text-red-400 font-bold">
                CÒN LẠI: {timeLeft.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Nút chấp nhận buông xuôi */}
          <div className="mt-6 pt-4 border-t border-zinc-900">
            <button
              onClick={(e) => {
                e.stopPropagation();
                audioEngine.stopFlatline();
                setPhase('DEAD');
              }}
              className="text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-wider underline underline-offset-4"
            >
              [ Chấp nhận từ bỏ • Buông xuôi ý thức ]
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 2: ĐANG KÍCH HOẠT SỐC ĐIỆN (REVIVING PULSE)
         ========================================================= */}
      {phase === 'REVIVING' && (
        <div className="relative z-10 text-center space-y-4">
          <div className="text-3xl md:text-5xl font-black text-amber-400 tracking-widest animate-pulse drop-shadow-[0_0_30px_rgba(251,191,36,0.9)]">
            ⚡ CLEAR! ⚡
          </div>
          <div className="text-sm font-mono text-white/90 tracking-widest uppercase">
            [ ĐANG GIẢI PHÓNG 360 JOULES QUA LỒNG NGỰC... ]
          </div>
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 3: ĐỘC THOẠI HỒI SINH CỦA AN (REVIVED_SPEECH)
         ========================================================= */}
      {phase === 'REVIVED_SPEECH' && (
        <div className="relative z-10 w-full max-w-xl px-6 py-8 mx-4 bg-zinc-950/95 border border-cyan-500/80 rounded-lg shadow-[0_0_50px_rgba(6,182,212,0.4)] text-center animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs font-mono tracking-widest uppercase mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span>NHỊP TIM ĐÃ TRỞ LẠI: 78 BPM • HỒI TỈNH SAU CƠN NGUY KỊCH</span>
          </div>

          <div className="w-full h-16 bg-black/60 border border-cyan-900/60 rounded flex items-center justify-center overflow-hidden mb-6">
            {/* Sóng nhịp tim xanh ngọc hồi sinh */}
            <svg className="w-full h-12 text-cyan-400" viewBox="0 0 300 50">
              <path
                d="M 0 25 L 80 25 L 90 10 L 95 40 L 100 5 L 105 45 L 110 25 L 180 25 L 190 10 L 195 40 L 200 5 L 205 45 L 210 25 L 300 25"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              />
            </svg>
          </div>

          <p className="text-base italic font-serif text-zinc-200 leading-relaxed mb-6">
            „(Hộc... Hộc... Lồng ngực mình bỏng rát như có dòng điện xé toạc... Mùi thuốc sát trùng nồng nặc...
            Vừa rồi là cái quái gì thế này? Tiếng ai vừa gọi tên mình... là Miên? Hay chỉ là ảo giác trước ngưỡng cửa cái chết?)‟
          </p>

          <div className="text-xs font-mono text-cyan-300/80 mb-6 tracking-wide">
            Chỉ số tỉnh táo (Sanity) được kéo lại mốc 30% [Thoi thóp • Cần cẩn trọng]
          </div>

          <button
            onClick={() => onRevive(30)}
            className="w-full py-3 px-6 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400 text-cyan-100 font-mono font-bold text-sm tracking-widest rounded shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all cursor-pointer"
          >
            [ HÍT MỘT HƠI THẬT SÂU • MỞ MẮT TRỞ LẠI ]
          </button>
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 4: TIM NGỪNG ĐẬP (BAD ENDING 0)
         ========================================================= */}
      {phase === 'DEAD' && (
        <div className="relative z-10 w-full max-w-lg px-6 py-8 mx-4 bg-zinc-950/95 border-2 border-zinc-800 rounded-lg shadow-[0_0_60px_rgba(0,0,0,1)] text-center animate-in fade-in duration-700">
          <div className="text-xs font-mono text-red-500 tracking-[0.3em] uppercase mb-2">
            // BAD ENDING 0: TIẾNG BÍP VÔ TẬN
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-zinc-100 tracking-wider mb-4">
            GIẤC NGỦ NGÀN THU
          </h2>

          <div className="w-16 h-[1px] bg-red-600 mx-auto mb-4" />

          <p className="text-sm font-serif italic text-zinc-400 leading-relaxed mb-6">
            Đường điện tâm đồ đã kéo dài thành một đường thẳng tắp lúc 03:14 AM. Tiếng bíp dài vô tận vang lên trong phòng hồi sức...
            Nguyễn Văn An đã vĩnh viễn chìm sâu vào giấc ngủ ngàn thu...
          </p>

          <div className="space-y-3 font-mono">
            <button
              onClick={onLoadLastSave}
              className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-cyan-600 text-cyan-300 text-xs font-bold rounded tracking-wider transition-all cursor-pointer"
            >
              ↩ TẢI LẠI ĐIỂM LƯU GẦN NHẤT (LOAD LAST SAVE)
            </button>

            <button
              onClick={onRestart}
              className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-red-950/50 border border-zinc-700 hover:border-red-600 text-zinc-400 hover:text-red-300 text-xs font-bold rounded tracking-wider transition-all cursor-pointer"
            >
              ✦ BẮT ĐẦU LẠI TỪ ĐẦU (NEW GAME)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
