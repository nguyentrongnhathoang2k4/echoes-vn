"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface DefibrillatorMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

type EnergyLevel = 100 | 200 | 360;

export const DefibrillatorMinigame: React.FC<DefibrillatorMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  // Trạng thái minigame
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyLevel>(200);
  const [chargeProgress, setChargeProgress] = useState<number>(0);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [isCharged, setIsCharged] = useState<boolean>(false);
  const [isShocked, setIsShocked] = useState<boolean>(false);
  const [flashWhite, setFlashWhite] = useState<boolean>(false);
  const [revealedAudio, setRevealedAudio] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(38);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chargeSoundOscRef = useRef<OscillatorNode | null>(null);
  const chargeSoundGainRef = useRef<GainNode | null>(null);

  // Khởi tạo AudioContext an toàn
  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current && AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Tiếng click nút bấm cơ học
  const playButtonBlip = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.04);
      g.gain.setValueAtTime((volume / 100) * 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch {}
  }, [getAudioContext, volume]);

  // Bắt đầu âm thanh nạp tụ điện tăng dần tần số
  const startChargeSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 2.5); // Rít cao dần

      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime((volume / 100) * 0.05, t + 0.2);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);

      chargeSoundOscRef.current = osc;
      chargeSoundGainRef.current = g;
    } catch {}
  }, [getAudioContext, volume]);

  // Dừng âm thanh nạp điện
  const stopChargeSound = useCallback(() => {
    if (chargeSoundOscRef.current) {
      try {
        chargeSoundOscRef.current.stop();
        chargeSoundOscRef.current.disconnect();
      } catch {}
      chargeSoundOscRef.current = null;
    }
  }, []);

  // Tiếng sốc điện giải phóng xung lực cực mạnh (CLEAR!)
  const playShockSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      // 1. Tiếng cạch công tắc hồ quang điện
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
      g.gain.setValueAtTime((volume / 100) * 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);

      // 2. Tiếng nổ xung điện trắng (White Noise Thump)
      const bufferSize = ctx.sampleRate * 0.25;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime((volume / 100) * 0.09, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng bíp hồi sinh nhịp xoang đều đặn 72 BPM
  const playNormalHeartbeatBeep = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, t); // C6 nốt cao khỏe khoắn
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      g.gain.setValueAtTime((volume / 100) * 0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {}
  }, [getAudioContext, volume]);

  // Hành động bắt đầu nạp điện
  const handleStartCharging = () => {
    if (isCharging || isCharged || isShocked) return;
    playButtonBlip();
    setIsCharging(true);
    setChargeProgress(0);
    startChargeSound();
  };

  // Tiến trình nạp năng lượng (0 -> 100% trong 2.5 giây)
  useEffect(() => {
    if (!isCharging) return;
    const interval = setInterval(() => {
      setChargeProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsCharging(false);
          setIsCharged(true);
          stopChargeSound();
          return 100;
        }
        return prev + 4;
      });
    }, 100);

    return () => {
      clearInterval(interval);
      stopChargeSound();
    };
  }, [isCharging, stopChargeSound]);

  // Hành động phóng điện sốc tim
  const handleTriggerShock = () => {
    if (!isCharged || isShocked) return;
    playShockSound();
    setIsCharged(false);
    setIsShocked(true);
    setFlashWhite(true);

    setTimeout(() => {
      setFlashWhite(false);
    }, 350);

    // Sau khi sốc: Nhịp tim hồi sinh về 72 BPM
    setTimeout(() => {
      setBpm(72);
      setRevealedAudio(true);
      playNormalHeartbeatBeep();
    }, 900);
  };

  // Vòng lặp vẽ dạng sóng điện tim trên màn hình CRT (Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let offset = 0;
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    const render = () => {
      offset = (offset + (isShocked ? 2.5 : 3.5)) % width;

      // Xóa màn hình với màu xanh ngọc sẫm của CRT y tế
      ctx.fillStyle = '#021e1a';
      ctx.fillRect(0, 0, width, height);

      // Lưới tọa độ y khoa
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vẽ sóng điện tim ECG
      ctx.strokeStyle = isShocked ? '#34d399' : '#f87171'; // Xanh lá khỏe hoặc đỏ rung thất
      ctx.lineWidth = 2;
      ctx.shadowColor = isShocked ? 'rgba(52, 211, 153, 0.8)' : 'rgba(248, 113, 113, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        let y = centerY;
        const wavePos = (x + offset) % 180;

        if (!isShocked) {
          // Dạng sóng Rung thất (Ventricular Fibrillation - VFib): Nhấp nhô hỗn loạn
          const noise1 = Math.sin((x + offset * 2) * 0.12) * 14;
          const noise2 = Math.cos((x + offset * 3) * 0.25) * 8;
          y = centerY + noise1 + noise2;
        } else {
          // Dạng sóng nhịp xoang đều đặn bình thường (Normal Sinus Rhythm): P, QRS, T
          if (wavePos > 40 && wavePos < 55) {
            // Sóng P
            y = centerY - Math.sin(((wavePos - 40) / 15) * Math.PI) * 7;
          } else if (wavePos >= 65 && wavePos <= 68) {
            // Sóng Q (chạm đáy)
            y = centerY + 6;
          } else if (wavePos > 68 && wavePos < 74) {
            // Sóng R (vọt đỉnh)
            y = centerY - 38;
          } else if (wavePos >= 74 && wavePos <= 78) {
            // Sóng S (chạm đáy sâu)
            y = centerY + 14;
          } else if (wavePos > 95 && wavePos < 120) {
            // Sóng T
            y = centerY - Math.sin(((wavePos - 95) / 25) * Math.PI) * 11;
          }
        }

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Vạch quét thời gian thực (Scanner beam)
      const sweepX = (width - offset) % width;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(sweepX, 0, 3, height);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isShocked]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none font-mono"
    >
      {/* Lóe sáng trắng khi sốc điện */}
      {flashWhite && (
        <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-300" />
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-zinc-950 border-2 border-red-600/90 rounded-lg p-5 shadow-[0_0_50px_rgba(220,38,38,0.45)] text-zinc-200 relative overflow-hidden"
      >
        {/* Header Máy Sốc Điện Y Tế */}
        <div className="flex justify-between items-center border-b border-red-900/80 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-ping inline-block" />
            <h2 className="text-xs sm:text-sm font-bold tracking-wider text-red-400 uppercase">
              MÁY KHỬ RUNG TIM & ĐIỆN TIM • LIFEPAK 9P (BV BẠCH MAI)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-white px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition-colors"
          >
            [ESC] ĐÓNG
          </button>
        </div>

        {/* Khung Màn Hình CRT Đo Điện Tim (ECG Screen) */}
        <div className="relative mb-4 rounded border-2 border-emerald-900 bg-[#021e1a] p-1 shadow-inner">
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            className="w-full h-36 sm:h-40 block rounded"
          />

          {/* Overlay thông số trên màn hình CRT */}
          <div className="absolute top-2 left-3 text-[10px] sm:text-xs text-emerald-400 font-bold tracking-wider flex items-center gap-3">
            <span>LEAD II • 1.0mV/cm</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                isShocked
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                  : 'bg-red-950 text-red-300 border border-red-500 animate-pulse'
              }`}
            >
              {isShocked ? 'NHỊP XOANG ĐỀU (SINUS)' : 'RUNG THẤT NGUY CẤP (VFIB)'}
            </span>
          </div>

          <div className="absolute top-2 right-3 text-right">
            <div className="text-[10px] text-zinc-400">NHỊP TIM HIỆN TẠI:</div>
            <div
              className={`text-xl sm:text-2xl font-black ${
                isShocked ? 'text-emerald-400 animate-pulse' : 'text-red-500 animate-bounce'
              }`}
            >
              {bpm} <span className="text-xs font-normal">BPM</span>
            </div>
          </div>
        </div>

        {/* Bảng Điều Khiển Năng Lượng & Thao Tác (Control Panel) */}
        {!revealedAudio ? (
          <div className="space-y-4">
            {/* 1. Chọn mức Joules */}
            <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-zinc-300 font-bold">1. MỨC NĂNG LƯỢNG SỐC ĐIỆN (ENERGY SELECT):</span>
                <span className="text-amber-400 font-bold">* Y lệnh cấp cứu: 200 Jun</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([100, 200, 360] as EnergyLevel[]).map((joules) => (
                  <button
                    key={joules}
                    onClick={() => {
                      if (!isCharging && !isCharged) {
                        playButtonBlip();
                        setSelectedEnergy(joules);
                      }
                    }}
                    disabled={isCharging || isCharged}
                    className={`py-2 text-xs font-bold rounded border transition-all ${
                      selectedEnergy === joules
                        ? 'bg-amber-950/80 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-102'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {joules} JOULES {joules === 200 ? '★' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Thanh trạng thái tụ điện nạp */}
            <div className="bg-zinc-900/60 p-3 rounded border border-zinc-800">
              <div className="flex justify-between items-center text-xs mb-1.5 font-bold">
                <span className="text-zinc-300">2. ĐIỆN ÁP TỤ NẠP (CAPACITOR CHARGE):</span>
                <span className={isCharged ? 'text-amber-400 font-black animate-pulse' : 'text-zinc-400'}>
                  {chargeProgress}% {isCharged ? '• READY!' : ''}
                </span>
              </div>
              <div className="w-full h-4 bg-zinc-950 border border-zinc-700 rounded-sm overflow-hidden p-0.5">
                <div
                  className={`h-full transition-all duration-75 rounded-xs ${
                    isCharged
                      ? 'bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 shadow-[0_0_15px_rgba(251,191,36,0.8)]'
                      : 'bg-gradient-to-r from-red-800 to-red-500'
                  }`}
                  style={{ width: `${chargeProgress}%` }}
                />
              </div>
            </div>

            {/* 3. Nút hành động: Nạp điện & Phóng điện */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleStartCharging}
                disabled={isCharging || isCharged}
                className={`py-3 px-4 font-bold text-xs sm:text-sm tracking-wider rounded border transition-all ${
                  isCharging
                    ? 'bg-amber-950 border-amber-500 text-amber-200 animate-pulse cursor-wait'
                    : isCharged
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] cursor-pointer active:scale-95'
                }`}
              >
                {isCharging ? '⚡ ĐANG NẠP ĐIỆN...' : isCharged ? '✓ ĐÃ NẠP ĐẦY 200J' : '⚡ 1. NẠP ĐIỆN (CHARGE)'}
              </button>

              <button
                onClick={handleTriggerShock}
                disabled={!isCharged}
                className={`py-3 px-4 font-black text-xs sm:text-sm tracking-wider rounded border transition-all ${
                  isCharged
                    ? 'bg-red-600 hover:bg-red-500 text-white border-white shadow-[0_0_25px_rgba(239,68,68,0.9)] animate-bounce cursor-pointer'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                ⚡ 2. PHÓNG ĐIỆN: "CLEAR!"
              </button>
            </div>
          </div>
        ) : (
          /* Khối thông báo thành công & Đoạn ghi âm hồi ký đêm 17/05 */
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="p-3 bg-emerald-950/60 border border-emerald-500 rounded text-emerald-200 text-xs sm:text-sm leading-relaxed">
              <div className="font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                <span>✓</span>
                <span>CẤP CỨU THÀNH CÔNG: NHỊP XOANG TÁI LẬP 72 BPM!</span>
              </div>
              <p className="italic font-serif text-zinc-300 text-xs leading-relaxed mt-2 border-t border-emerald-900/60 pt-2">
                &ldquo;Bác sĩ ơi! Có mạch bẹn lại rồi... Nhịp tim 72 lần/phút! Tiếp tục giữ huyết áp đồ thị ổn định!...
                Miên ơi, anh ấy qua cơn nguy kịch tạm thời rồi, đừng khóc nữa...&rdquo;
              </p>
            </div>

            <button
              onClick={() => {
                playButtonBlip();
                onComplete();
              }}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-black font-black text-xs sm:text-sm tracking-widest rounded shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all cursor-pointer"
            >
              [ ĐẶT BÀN SỐC XUỐNG ]
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
