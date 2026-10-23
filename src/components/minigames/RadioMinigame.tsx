"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface RadioMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

export const RadioMinigame: React.FC<RadioMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  const [frequency, setFrequency] = useState(90.2); // 88.0 -> 108.0 MHz. Target: 104.5 MHz
  const [signalStrength, setSignalStrength] = useState(10); // 0 -> 100%
  const [activeStation, setActiveStation] = useState<'NONE' | 'CAFE' | 'WHISPER' | 'EMERGENCY'>('NONE');
  const [isLocked, setIsLocked] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenOscRef = useRef<OscillatorNode | null>(null);
  const sirenGainRef = useRef<GainNode | null>(null);
  const sirenTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getAudioContext = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Tiếng rè rè radio (Static white noise) khi xoay núm
  const playStaticBurst = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime((volume / 100) * 0.035, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng còi xe cấp cứu inh ỏi (Siren 115)
  const startSirenSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (sirenOscRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime((volume / 100) * 0.09, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      sirenOscRef.current = osc;
      sirenGainRef.current = gain;

      // Chu kỳ hú còi 750Hz <-> 960Hz
      let high = false;
      sirenTimerRef.current = setInterval(() => {
        if (!audioCtxRef.current || !sirenOscRef.current) return;
        high = !high;
        sirenOscRef.current.frequency.setValueAtTime(
          high ? 960 : 720,
          audioCtxRef.current.currentTime
        );
      }, 450);
    } catch {}
  }, [getAudioContext, volume]);

  const stopSirenSound = useCallback(() => {
    if (sirenTimerRef.current) clearInterval(sirenTimerRef.current);
    if (sirenOscRef.current) {
      try {
        sirenOscRef.current.stop();
        sirenOscRef.current.disconnect();
      } catch {}
      sirenOscRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSirenSound();
    };
  }, [stopSirenSound]);

  // Phân tích dải tần số khi người dùng chỉnh núm
  useEffect(() => {
    playStaticBurst();

    // 1. Kênh Cà phê sinh viên: 92.5 MHz (92.2 - 92.8)
    if (Math.abs(frequency - 92.5) <= 0.35) {
      setActiveStation('CAFE');
      setSignalStrength(85 - Math.abs(frequency - 92.5) * 100);
      setIsLocked(false);
      stopSirenSound();
    }
    // 2. Kênh Lời thì thầm của Miên: 98.0 MHz (97.7 - 98.3)
    else if (Math.abs(frequency - 98.0) <= 0.35) {
      setActiveStation('WHISPER');
      setSignalStrength(90 - Math.abs(frequency - 98.0) * 100);
      setIsLocked(false);
      stopSirenSound();
    }
    // 3. KÊNH KHẨN CẤP VOV & CẤP CỨU 115: 104.5 MHz (104.2 - 104.8)
    else if (Math.abs(frequency - 104.5) <= 0.3) {
      setActiveStation('EMERGENCY');
      const strength = Math.max(70, Math.round(100 - Math.abs(frequency - 104.5) * 80));
      setSignalStrength(strength);
      setIsLocked(true);
      startSirenSound();
    } else {
      setActiveStation('NONE');
      setSignalStrength(Math.floor(10 + Math.random() * 15));
      setIsLocked(false);
      stopSirenSound();
    }
  }, [frequency, playStaticBurst, startSirenSound, stopSirenSound]);

  // Xử lý xác nhận tín hiệu
  const handleConfirmSignal = () => {
    stopSirenSound();
    setIsRevealed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono select-none animate-fade-in">
      <div
        className={`relative w-full max-w-lg bg-zinc-950 border-2 rounded-lg shadow-[0_0_50px_rgba(244,114,182,0.3)] p-5 transition-all duration-300 ${
          isLocked
            ? 'border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.8)]'
            : 'border-cyan-800/80'
        }`}
      >
        {/* Tiêu đề & Nút bỏ qua */}
        <div className="flex justify-between items-center pb-3 border-b border-cyan-900/50 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full inline-block ${
                isLocked ? 'bg-red-500 animate-ping' : 'bg-cyan-400'
              }`}
            />
            <h2 className="text-sm sm:text-base font-bold text-cyan-300 uppercase tracking-wider">
              Đài Transistor Đêm Mưa • VOV-1705
            </h2>
          </div>
          <button
            onClick={() => {
              stopSirenSound();
              onClose();
            }}
            className="text-xs text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors"
          >
            [ESC] Bỏ qua
          </button>
        </div>

        {!isRevealed ? (
          <div>
            <p className="text-xs text-zinc-300 mb-3 leading-relaxed">
              Chiếc đài bán dẫn gác cạnh chiếc ô ướt sũng dưới chân cột đèn. Nước mưa đọng trên mặt kính thang đo tần số.
              <span className="text-cyan-300 font-semibold block mt-0.5">
                👉 Xoay núm dò sóng từ 88 đến 108 MHz để bắt sóng bản tin thời tiết đêm 17/05.
              </span>
            </p>

            {/* Mô phỏng Thân Đài Bán Dẫn (Transistor Radio Chassis) */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border-2 border-zinc-700 rounded-lg p-4 mb-4 shadow-inner relative">
              {/* Thước đo kim tần số Analog */}
              <div className="bg-black/80 border border-zinc-600 rounded p-3 mb-4 relative overflow-hidden">
                <div className="flex justify-between items-center text-[10px] text-zinc-400 mb-1">
                  <span>FM BAND (MHz)</span>
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      isLocked
                        ? 'bg-red-950 border border-red-500 text-red-300 animate-pulse'
                        : 'bg-zinc-800 text-cyan-400'
                    }`}
                  >
                    {frequency.toFixed(1)} MHz
                  </span>
                </div>

                {/* Thang chia vạch kim */}
                <div className="relative h-10 w-full border-t border-b border-zinc-700 my-1 flex items-center justify-between px-2 text-[9px] text-zinc-500">
                  <span>88</span>
                  <span>92</span>
                  <span>96</span>
                  <span>100</span>
                  <span className="text-red-400 font-bold">104.5</span>
                  <span>108</span>

                  {/* Kim đỏ di chuyển theo tần số */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] transition-all duration-75"
                    style={{
                      left: `${((frequency - 88) / (108 - 88)) * 100}%`,
                    }}
                  >
                    <div className="w-2 h-2 -ml-[3px] bg-red-500 rotate-45" />
                  </div>
                </div>

                {/* Đèn chỉ báo tín hiệu & Đồng hồ VU */}
                <div className="flex justify-between items-center mt-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isLocked ? 'bg-red-500 animate-ping' : signalStrength > 60 ? 'bg-amber-400' : 'bg-zinc-700'
                      }`}
                    />
                    <span className="text-zinc-400">
                      {isLocked ? 'KÊNH KHẨN CẤP [LOCKED]' : `Tín hiệu: ${signalStrength}%`}
                    </span>
                  </div>

                  {/* Thanh VU đo dB */}
                  <div className="w-28 h-2 bg-zinc-900 border border-zinc-700 rounded overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        isLocked ? 'bg-red-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${signalStrength}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Thanh trượt điều khiển tần số */}
              <div className="mb-3">
                <input
                  type="range"
                  min="88.0"
                  max="108.0"
                  step="0.1"
                  value={frequency}
                  onChange={(e) => setFrequency(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-2.5 bg-zinc-800 rounded-lg"
                />
              </div>

              {/* Màn hình hiển thị nội dung thu được từ sóng radio */}
              <div
                className={`p-3 rounded border text-xs min-h-[75px] flex items-center justify-center text-center transition-all ${
                  activeStation === 'EMERGENCY'
                    ? 'bg-red-950/70 border-red-500 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                    : activeStation === 'WHISPER'
                    ? 'bg-pink-950/40 border-pink-700 text-pink-200'
                    : activeStation === 'CAFE'
                    ? 'bg-amber-950/40 border-amber-700 text-amber-200'
                    : 'bg-black/60 border-zinc-800 text-zinc-500 italic'
                }`}
              >
                {activeStation === 'NONE' && (
                  <p>... Rè rè rè ... Tiếng mưa rào xào xạc trong gió ...</p>
                )}
                {activeStation === 'CAFE' && (
                  <p>
                    🎵 [FM 92.5 - Quán Cà Phê Sinh Viên]: Bản nhạc Jazz nhẹ nhàng vang lên mờ ảo giữa tiếng cười nói của các bạn trẻ...
                  </p>
                )}
                {activeStation === 'WHISPER' && (
                  <p className="italic text-pink-300">
                    &ldquo;An ơi... trời bắt đầu mưa to rồi... Anh có lạnh không? Em ôm anh nhé...&rdquo;
                  </p>
                )}
                {activeStation === 'EMERGENCY' && (
                  <div className="text-left font-mono">
                    <div className="font-bold text-red-400 flex items-center gap-1.5 mb-1">
                      <span>🚨</span> [VOV GIAO THÔNG 00:41 - RẠNG SÁNG 17/05]
                    </div>
                    <p className="text-[11px] leading-snug">
                      &ldquo;Khẩn cấp: Tai nạn trên cầu vượt trong cơn mưa giông lớn... Xe máy chở 2 người trượt bánh va chạm dải phân cách...&rdquo;
                    </p>
                    <p className="text-[11px] text-red-300 font-bold mt-1">
                      &ldquo;[115]: Bệnh nhân nam chấn thương sọ não, mạch tụt sâu! Chuyển thẳng cấp cứu Bạch Mai!...&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Nút hành động */}
            {isLocked ? (
              <button
                onClick={handleConfirmSignal}
                className="w-full py-2.5 bg-red-700 hover:bg-red-600 active:scale-98 text-white font-bold text-xs sm:text-sm tracking-wide rounded shadow-[0_0_20px_rgba(239,68,68,0.7)] transition-all cursor-pointer animate-pulse"
              >
                [GIỮ SÓNG 104.5 MHz]
              </button>
            ) : (
              <div className="flex justify-between items-center text-xs text-zinc-400">
                <span>* Kéo kim tần số tới 104.5 MHz</span>
                <button
                  onClick={() => setFrequency(104.5)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  [Bắt sóng 104.5]
                </button>
              </div>
            )}
          </div>
        ) : (
          /* MÀN HÌNH TWIST CHIẾC Ô ƯỚT */
          <div className="animate-fade-in flex flex-col items-center text-center">
            <div className="w-full bg-red-950/40 border-2 border-red-500/80 rounded-lg p-4 mb-4 shadow-[0_0_30px_rgba(239,68,68,0.4)] text-left">
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase mb-2">
                <span>⚠️</span> KÝ ỨC ĐÊM MƯA 17/05 BỊ GIẢI MÃ
              </div>
              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed italic mb-3">
                Tiếng còi xe cấp cứu và tiếng bộ đàm 115 dội thẳng vào màng nhĩ... Chiếc ô trong suốt này ướt sũng
                không phải vì cơn mưa chiều nay. Nó đã rơi xuống mặt đường lạnh ngắt vào đêm 17/05,
                bên cạnh chiếc xe máy biến dạng sau cú va chạm định mệnh.
              </p>
              <div className="bg-black/80 border border-red-900 rounded p-2.5 text-[11px] text-red-300 font-mono">
                [TRÍ NHỚ PHỤC HỒI]: Bạn không phải đang đi dạo cùng Miên ở một bến sông bình yên.
                Bạn đang trong cơn hôn mê sâu sau tai nạn giao thông nghiêm trọng trên cầu vượt đêm 17/05.
              </div>
            </div>

            <button
              onClick={() => {
                stopSirenSound();
                onComplete();
              }}
              className="w-full py-2.5 bg-red-700 hover:bg-red-600 active:scale-98 text-white font-bold text-sm tracking-wide rounded shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all cursor-pointer"
            >
              [TẮT ĐÀI]
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
