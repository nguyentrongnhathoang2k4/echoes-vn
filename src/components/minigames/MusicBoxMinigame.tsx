"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MusicBoxMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

export const MusicBoxMinigame: React.FC<MusicBoxMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  const [tension, setTension] = useState(20); // 0 -> 100%
  const [frequency, setFrequency] = useState(13.50); // Target: 17.05 MHz
  const [isLocked, setIsLocked] = useState(false);
  const [isBroken, setIsBroken] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isWindingRef = useRef(false);

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

  // Tiếng ratchet khi lên dây cót (tách... tách...)
  const playRatchetSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.035);
      g.gain.setValueAtTime((volume / 100) * 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng chuông nốt nhạc nhẹ khi tần số gần đúng
  const playChimeNote = useCallback((pitchMultiplier = 1) => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25 * pitchMultiplier, t);
      g.gain.setValueAtTime((volume / 100) * 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng tim đập và flatline kinh hoàng của phòng ICU
  const playFlatlineSequence = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      // 1. Tiếng kẹt cót cơ học
      const noise = ctx.createOscillator();
      const nGain = ctx.createGain();
      noise.type = 'sawtooth';
      noise.frequency.setValueAtTime(80, t);
      nGain.gain.setValueAtTime((volume / 100) * 0.15, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      noise.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.2);

      // 2. Tiếng nhịp tim máy đo ECG: Bíp... (t+0.5s), Bíp... (t+1.3s)
      [0.5, 1.4].forEach((offset) => {
        const beepOsc = ctx.createOscillator();
        const beepG = ctx.createGain();
        beepOsc.type = 'sine';
        beepOsc.frequency.setValueAtTime(880, t + offset);
        beepG.gain.setValueAtTime((volume / 100) * 0.12, t + offset);
        beepG.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.12);
        beepOsc.connect(beepG);
        beepG.connect(ctx.destination);
        beepOsc.start(t + offset);
        beepOsc.stop(t + offset + 0.12);
      });

      // 3. Tiếng Flatline tút dài liên tục (t+2.4s -> 4.5s)
      const flatOsc = ctx.createOscillator();
      const flatG = ctx.createGain();
      flatOsc.type = 'sine';
      flatOsc.frequency.setValueAtTime(880, t + 2.4);
      flatG.gain.setValueAtTime(0.001, t + 2.3);
      flatG.gain.linearRampToValueAtTime((volume / 100) * 0.14, t + 2.45);
      flatG.gain.setValueAtTime((volume / 100) * 0.14, t + 4.2);
      flatG.gain.exponentialRampToValueAtTime(0.001, t + 4.8);
      flatOsc.connect(flatG);
      flatG.connect(ctx.destination);
      flatOsc.start(t + 2.4);
      flatOsc.stop(t + 4.8);
    } catch {}
  }, [getAudioContext, volume]);

  // Kiểm tra tần số 17.05 MHz (ngưỡng 16.95 - 17.15)
  const isTargetFreq = Math.abs(frequency - 17.05) <= 0.12;

  useEffect(() => {
    if (isTargetFreq && !isLocked && tension >= 30) {
      setIsLocked(true);
      playChimeNote(1.2);
    } else if (!isTargetFreq && isLocked) {
      setIsLocked(false);
    }
  }, [frequency, isTargetFreq, isLocked, tension, playChimeNote]);

  // Khi người chơi ấn vặn cót
  const handleWind = () => {
    if (isBroken) return;
    playRatchetSound();
    setTension((prev) => {
      const next = Math.min(100, prev + 15);
      if (next >= 100 && isTargetFreq) {
        triggerTwist();
      }
      return next;
    });
  };

  // Kích hoạt cú sốc tâm lý khi hoàn thành
  const triggerTwist = () => {
    setIsBroken(true);
    setGlitchActive(true);
    playFlatlineSequence();
    setTimeout(() => {
      setGlitchActive(false);
      setIsRevealed(true);
    }, 2400);
  };

  // Giảm nhẹ cót theo thời gian nếu không vặn
  useEffect(() => {
    if (isBroken) return;
    const timer = setInterval(() => {
      if (!isWindingRef.current) {
        setTension((prev) => (prev > 15 ? prev - 2 : prev));
      }
    }, 800);
    return () => clearInterval(timer);
  }, [isBroken]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md font-mono select-none animate-fade-in">
      <div
        className={`relative w-full max-w-lg bg-zinc-950 border-2 rounded-lg shadow-[0_0_50px_rgba(244,114,182,0.3)] p-6 transition-all duration-300 ${
          glitchActive
            ? 'border-red-500 shadow-[0_0_70px_rgba(239,68,68,0.8)] animate-pulse scale-[1.02]'
            : 'border-amber-600/70'
        }`}
      >
        {/* Nút thoát / bỏ qua ở góc */}
        <div className="flex justify-between items-center pb-3 border-b border-amber-900/50 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
            <h2 className="text-sm sm:text-base font-bold text-amber-300 tracking-wider uppercase">
              Hộp Âm Nhạc Kỷ Niệm • Model 1705
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors"
          >
            [ESC] Bỏ qua
          </button>
        </div>

        {!isRevealed ? (
          <div>
            <p className="text-xs text-zinc-300 mb-4 leading-relaxed">
              Chiếc hộp nhạc gỗ khảm hoa văn Bến Bình An. Trục cót bị kẹt cứng ở vòng quay cuối cùng và kim tần số âm thanh bị lệch.
              <span className="text-amber-400 font-semibold block mt-1">
                👉 Nhiệm vụ: Xoay cót lên 100% và kéo thanh trượt để đồng bộ tần số ký ức (17.05 MHz).
              </span>
            </p>

            {/* Khung mô phỏng Hộp Nhạc Cổ Điển */}
            <div className="bg-gradient-to-b from-amber-950/40 to-zinc-950 border border-amber-700/60 rounded p-4 mb-4 relative overflow-hidden">
              {/* Vòng quay bánh răng và gauge cót */}
              <div className="flex flex-col sm:flex-row items-center justify-around gap-4 my-2">
                {/* Núm vặn cót */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleWind}
                    disabled={isBroken}
                    className="w-20 h-20 rounded-full border-4 border-amber-500 bg-amber-900/40 hover:bg-amber-800/60 active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.3)] flex flex-col items-center justify-center transition-transform cursor-pointer group"
                  >
                    <span className="text-2xl group-hover:rotate-45 transition-transform duration-200">
                      ⚙️
                    </span>
                    <span className="text-[10px] font-bold text-amber-300 mt-0.5">VẶN CÓT</span>
                  </button>
                  <span className="text-[11px] text-zinc-400">
                    Lực căng cót: <strong className="text-amber-300">{tension}%</strong>
                  </span>
                </div>

                {/* Đồng hồ đo tần số */}
                <div className="w-full sm:w-56 bg-black/70 border border-amber-800/50 rounded p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Tần số bộ dao động:</span>
                    <span
                      className={`font-bold font-mono px-2 py-0.5 rounded text-xs ${
                        isTargetFreq
                          ? 'bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse'
                          : 'bg-zinc-900 border border-zinc-700 text-amber-400'
                      }`}
                    >
                      {frequency.toFixed(2)} MHz
                    </span>
                  </div>

                  {/* Thanh trượt điều chỉnh tần số */}
                  <input
                    type="range"
                    min="12.00"
                    max="22.00"
                    step="0.05"
                    value={frequency}
                    disabled={isBroken}
                    onChange={(e) => setFrequency(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                  />

                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>12.00 MHz</span>
                    <span className="text-amber-400/80 font-bold">17.05 MHz [SYNC]</span>
                    <span>22.00 MHz</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isTargetFreq ? 'bg-emerald-400 animate-ping' : 'bg-red-500/60'
                      }`}
                    />
                    <span className="text-[10px] text-zinc-400">
                      {isTargetFreq ? 'Tín hiệu trùng khớp (17.05 MHz)' : 'Sóng bị lệch tần...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Thanh tiến trình Tension Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Trữ năng lò xo</span>
                  <span className={tension >= 100 ? 'text-emerald-400 font-bold' : ''}>
                    {tension >= 100 ? 'Cực đại • Sẵn sàng phát' : `${tension}/100%`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-900 border border-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      tension >= 100
                        ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                        : isTargetFreq
                        ? 'bg-amber-400'
                        : 'bg-amber-600'
                    }`}
                    style={{ width: `${tension}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Gợi ý tương tác */}
            <div className="flex justify-between items-center text-xs text-zinc-400">
              <span>* Nhấn vặn cót liên tục và kéo thanh trượt về 17.05</span>
              <button
                onClick={() => {
                  setTension(100);
                  setFrequency(17.05);
                  triggerTwist();
                }}
                className="text-[11px] text-amber-400/80 hover:text-amber-300 underline cursor-pointer"
              >
                [Tự động đồng bộ]
              </button>
            </div>
          </div>
        ) : (
          /* MÀN HÌNH TWIST PHÁT HIỆN SỰ THẬT Y TẾ */
          <div className="animate-fade-in flex flex-col items-center text-center">
            <div className="w-full bg-red-950/40 border-2 border-red-500/80 rounded-lg p-4 mb-4 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
              <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-bold tracking-widest uppercase mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                CẢNH BÁO: TÍN HIỆU SINH HIỆU NGUY KỊCH
              </div>

              {/* Màn hình điện tim LCD */}
              <div className="bg-black border border-red-800 rounded p-3 text-left font-mono text-xs mb-3 text-red-400">
                <div className="flex justify-between border-b border-red-900/60 pb-1 mb-2 text-[11px] text-zinc-400">
                  <span>HOSPITAL_ECG_MONITOR // V4.1</span>
                  <span className="text-red-400 animate-pulse">ICU • BED_03</span>
                </div>
                <div className="text-sm font-bold text-red-500 mb-1">
                  PATIENT: TRẦN HOÀNG AN • AGE: 24
                </div>
                <div className="flex justify-between items-center my-1 text-xs">
                  <span>NHỊP TIM (HR):</span>
                  <span className="text-red-300 text-base font-bold animate-pulse">38 BPM ↓ CRITICAL</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>SPO2:</span>
                  <span className="text-amber-400">81% (SUY HÔ HẤP CẤP)</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-2 italic">
                  [17/05/2024 - 03:11:47] ALARM: NHỊP CHẬM NGUY KỊCH (HR &lt; 40) — GỌI BÁC SĨ TRỰC CẤP CỨU...
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed italic text-left">
                Chiếc nắp gỗ bật mở... Bên trong không hề có bánh răng đồng hay bộ gõ nốt nhạc nào cả.
                Đó là một <strong className="text-red-400">bo mạch cảm biến điện tim y tế của bệnh viện</strong> đang phát ra tiếng bíp ngắt quãng,
                rồi rít lên một hồi tút dài ghê rợn. Giai điệu mộc mạc lúc nãy... chưa từng phát ra từ chiếc hộp này.
              </p>
            </div>

            <button
              onClick={onComplete}
              className="w-full py-2.5 bg-red-700 hover:bg-red-600 active:scale-98 text-white font-bold text-sm tracking-wide rounded shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all cursor-pointer"
            >
              [ĐÓNG NẮP HỘP NHẠC]
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
