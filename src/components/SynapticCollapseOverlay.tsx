"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';
import { tx } from '../locales/tx';
import { MenuOption } from './MenuOption';

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
  // Trạng thái: 'FLATLINE' (đang cấp cứu) | 'REVIVING' (đang sốc điện loé sáng) | 'REVIVED_SPEECH' (độc thoại sau sốc) | 'DEAD' (chết não)
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

    // Bắt đầu tiếng Flatline (đã hạ trầm, lọc đục cho đỡ nhức tai)
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

    // Hiệu ứng loé sáng trắng và rung chấn màn hình
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

  // Màn tim ngừng đập: chọn tải lại / chơi lại bằng W/S + Enter như menu chính
  const [deadPick, setDeadPick] = useState(0);
  useEffect(() => {
    if (!isOpen || phase !== 'DEAD') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 's' || key === 'arrowup' || key === 'arrowdown') {
        e.preventDefault();
        setDeadPick((i) => 1 - i);
      } else if ((key === 'enter' || key === ' ') && !e.repeat) {
        e.preventDefault();
        if (deadPick === 0) onLoadLastSave();
        else onRestart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, phase, deadPick, onLoadLastSave, onRestart]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center select-none font-mono transition-all duration-300 ${
        screenShock ? 'animate-shock' : ''
      }`}
    >
      {/* Lớp loé sáng trắng chói loà khi sốc tim */}
      {flashWhite && (
        <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-300" />
      )}

      {/* Background tối om với hiệu ứng lưới ECG y tế và vignette đỏ báo tử */}
      <div className="absolute inset-0 bg-black/95">
        {/* Lưới toạ độ Monitor ICU */}
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
        <div onClick={handlePumpCharge} className="relative z-10 w-full max-w-xl px-6 mx-4 text-center cursor-pointer">
          {/* Báo động */}
          <div className="text-[11px] text-red-400/80 tracking-[0.35em] pl-[0.35em] uppercase">
            {tx('Tim ngừng đập · 0 BPM')}
          </div>

          {/* Đường điện tim phẳng */}
          <div className="relative my-8 h-16 flex items-center">
            <div className="w-full h-px bg-red-500/80 animate-pulse" />
            <span className="absolute right-0 bottom-0 text-xs text-red-500/70 tracking-widest tabular-nums">00</span>
          </div>

          {/* Tiếng vọng mờ ảo từ thực tại */}
          <div className="min-h-[52px] flex items-center justify-center mb-8 px-4">
            <p className="text-sm md:text-base italic font-serif text-zinc-300 animate-in fade-in duration-500">
              {tx(hospitalWhispers[whisperIdx])}
            </p>
          </div>

          {/* Mức nạp của máy khử rung tim */}
          <div className="mb-6">
            <div className="flex justify-between text-[11px] tracking-[0.2em] uppercase mb-2">
              <span className="text-zinc-500">{tx('Nạp điện')}</span>
              <span className={`tabular-nums ${isCharged ? 'text-amber-300' : 'text-zinc-300'}`}>
                {Math.floor((chargeProgress / 100) * 360)} / 360 J
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-900">
              <div
                className={`h-full transition-all duration-75 ${isCharged ? 'bg-amber-300' : 'bg-red-500'}`}
                style={{ width: `${chargeProgress}%` }}
              />
            </div>
          </div>

          {/* Nạp / phóng điện: bấm Space liên tục hoặc click */}
          <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-2">
            <MenuOption
              size="sm"
              selected
              label={isCharged ? tx('Phóng điện · Space') : tx('Nhấn Space liên tục để nạp điện')}
              onClick={handlePumpCharge}
            />
            <div className="text-[10px] text-zinc-600 tracking-widest">
              {tx('Còn {0}s', timeLeft.toFixed(1))}
            </div>
          </div>

          {/* Buông xuôi */}
          <div onClick={(e) => e.stopPropagation()} className="mt-10 flex justify-center">
            <MenuOption
              size="sm"
              selected={false}
              label={tx('Buông xuôi')}
              onClick={() => {
                audioEngine.stopFlatline();
                setPhase('DEAD');
              }}
            />
          </div>
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 2: ĐANG KÍCH HOẠT SỐC ĐIỆN (REVIVING PULSE)
         ========================================================= */}
      {phase === 'REVIVING' && (
        <div className="relative z-10 text-center space-y-4">
          <div className="text-3xl md:text-5xl text-zinc-100 tracking-[0.3em] pl-[0.3em] animate-pulse">CLEAR!</div>
          <div className="text-xs text-zinc-500 tracking-[0.25em] uppercase">
            {tx('Đang phóng 360 J qua lồng ngực...')}
          </div>
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 3: ĐỘC THOẠI HỒI SINH CỦA AN (REVIVED_SPEECH)
         ========================================================= */}
      {phase === 'REVIVED_SPEECH' && (
        <div className="relative z-10 w-full max-w-xl px-6 mx-4 text-center animate-in fade-in duration-500">
          <div className="text-[11px] text-red-400/80 tracking-[0.35em] pl-[0.35em] uppercase">
            {tx('Nhịp tim trở lại · 78 BPM')}
          </div>

          {/* Sóng nhịp tim đập lại */}
          <svg className="w-full h-12 my-6 text-zinc-300" viewBox="0 0 300 50" aria-hidden>
            <path
              d="M 0 25 L 80 25 L 90 10 L 95 40 L 100 5 L 105 45 L 110 25 L 180 25 L 190 10 L 195 40 L 200 5 L 205 45 L 210 25 L 300 25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>

          <p className="text-base italic font-serif text-zinc-200 leading-relaxed mb-4">
            {tx('„(Hộc... Hộc... Lồng ngực mình bỏng rát như có dòng điện xé toạc... Mùi thuốc sát trùng nồng nặc... Vừa rồi là cái quái gì thế này? Tiếng ai vừa gọi tên mình... là Miên? Hay chỉ là ảo giác trước ngưỡng cửa cái chết?)‟')}
          </p>

          <div className="text-[11px] text-zinc-500 tracking-wide mb-8">
            {tx('Sanity được kéo về 30%')}
          </div>

          <MenuOption label={tx('Mở mắt')} selected onClick={() => onRevive(30)} />
        </div>
      )}

      {/* =========================================================
          GIAI ĐOẠN 4: TIM NGỪNG ĐẬP (BAD ENDING 0)
         ========================================================= */}
      {phase === 'DEAD' && (
        <div className="relative z-10 w-full max-w-lg px-6 mx-4 text-center font-mono animate-in fade-in duration-700">
          <div className="text-[11px] text-red-400/80 tracking-[0.35em] pl-[0.35em] uppercase mb-3">
            {tx('Bad Ending 0 · Tiếng bíp vô tận')}
          </div>
          <h2 className="text-2xl md:text-3xl text-zinc-100 tracking-[0.3em] pl-[0.3em] uppercase mb-6">
            {tx('GIẤC NGỦ NGÀN THU')}
          </h2>

          <p className="text-sm font-serif italic text-zinc-400 leading-relaxed mb-10">
            {tx('Đường điện tâm đồ đã kéo dài thành một đường thẳng tắp lúc 03:14 AM. Tiếng bíp dài vô tận vang lên trong phòng hồi sức... Trần Hoàng An đã vĩnh viễn chìm sâu vào giấc ngủ ngàn thu...')}
          </p>

          <nav className="flex flex-col items-center gap-2">
            <MenuOption label={tx('Tải lại điểm lưu')} selected={deadPick === 0} onHover={() => setDeadPick(0)} onClick={onLoadLastSave} />
            <MenuOption label={tx('Chơi lại từ đầu')} selected={deadPick === 1} onHover={() => setDeadPick(1)} onClick={onRestart} />
          </nav>
        </div>
      )}
    </div>
  );
};
