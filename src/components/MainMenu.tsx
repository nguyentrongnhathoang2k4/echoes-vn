"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';

interface MainMenuProps {
  onStartNewGame: () => void;
  onContinueGame: () => void;
  onOpenSettings: () => void;
  hasSaveData: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  desc: string;
  disabled?: boolean;
  action: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartNewGame,
  onContinueGame,
  onOpenSettings,
  hasSaveData,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [shutdownTriggered, setShutdownTriggered] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Khởi tạo & khôi phục AudioContext an toàn
  const getAudioContext = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // 1. Tiếng click / beep tĩnh điện 8-bit khi hover hoặc di chuyển phím (Terminal Static Blip)
  const playTerminalBlip = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // Xung vuông 8-bit trượt tần số ngắn
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.022);

      gain.gain.setValueAtTime(0.035, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.022);

      // Xung nhiễu tĩnh điện nhỏ (White noise burst) tạo cảm giác rơ-le / CRT cathode
      const bufferSize = Math.floor(ctx.sampleRate * 0.012); // 12ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.02, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
    } catch {
      // Bỏ qua lỗi audio policy
    }
  }, [getAudioContext]);

  // 2. Tiếng xác nhận chọn nút (Confirm Retro Chime)
  const playTerminalConfirm = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      [587, 880].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
      });
    } catch {
      // Bỏ qua
    }
  }, [getAudioContext]);

  // 3. Tiếng từ chối / nút bị khóa (Deny Buzz)
  const playTerminalDeny = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch {
      // Bỏ qua
    }
  }, [getAudioContext]);

  // Danh sách nút menu
  const menuItems: MenuItem[] = [
    {
      id: 'new_game',
      label: '[ BẮT ĐẦU HÀNH TRÌNH ]',
      desc: 'Bắt đầu câu chuyện mới tại căn phòng trọ số 314',
      action: () => {
        playTerminalConfirm();
        onStartNewGame();
      },
    },
    {
      id: 'continue_game',
      label: '[ TIẾP TỤC HÀNH TRÌNH ]',
      desc: hasSaveData
        ? 'Tải lại điểm lưu gần nhất của bạn'
        : 'Chưa có dữ liệu lưu (No Save Data)',
      disabled: !hasSaveData,
      action: () => {
        if (!hasSaveData) {
          playTerminalDeny();
          return;
        }
        playTerminalConfirm();
        onContinueGame();
      },
    },
    {
      id: 'settings',
      label: '[ CÀI ĐẶT TRÒ CHƠI ]',
      desc: 'Tùy chỉnh âm lượng, hiệu ứng hình ảnh CRT & tốc độ chữ',
      action: () => {
        playTerminalConfirm();
        onOpenSettings();
      },
    },
    {
      id: 'shutdown',
      label: '[ THOÁT TRÒ CHƠI ]',
      desc: 'Dừng hành trình và khép lại phiên chơi',
      action: () => {
        playTerminalDeny();
        setShutdownTriggered(true);
      },
    },
  ];

  // Xử lý phím điều hướng W/S, Mũi tên và Enter
  useEffect(() => {
    if (shutdownTriggered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === 'w' || key === 'arrowup') {
        e.preventDefault();
        playTerminalBlip();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
      } else if (key === 's' || key === 'arrowdown') {
        e.preventDefault();
        playTerminalBlip();
        setSelectedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
      } else if (key === 'enter' || key === ' ') {
        e.preventDefault();
        const currentItem = menuItems[selectedIndex];
        if (currentItem && !currentItem.disabled) {
          currentItem.action();
        } else {
          playTerminalDeny();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, menuItems, shutdownTriggered, playTerminalBlip, playTerminalDeny]);

  return (
    <div className="relative w-full h-full flex flex-col justify-between items-center p-6 sm:p-10 select-none font-mono text-zinc-300 overflow-hidden bg-black/95">
      {/* Background Grid Pattern Cyberpunk */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c0c16_1px,transparent_1px),linear-gradient(to_bottom,#0c0c16_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 pointer-events-none" />

      {/* Header Info */}
      <div className="z-10 w-full max-w-4xl flex justify-between items-center text-[10px] sm:text-xs text-zinc-500 border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
          <span>PHÒNG TRỌ SỐ 314 // 03:14 AM</span>
        </div>
        <div className="tracking-widest">
          TRẠNG THÁI: <span className="text-red-400 font-bold">BẤT THƯỜNG</span>
        </div>
      </div>

      {/* Main Logo & Menu Section (Tăng max-w-2xl để thoáng đãng hơn) */}
      <div className="z-10 flex flex-col items-center my-auto w-full max-w-2xl px-2">
        {/* LOGO: ECHOES */}
        <div className="relative mb-4 text-center">
          <h1
            className="text-5xl sm:text-7xl font-extrabold tracking-[0.25em] text-white font-mono drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]"
            style={{
              textShadow:
                '-3px -1px 0px rgba(255, 0, 80, 0.85), 3px 1px 0px rgba(0, 240, 255, 0.85)',
            }}
          >
            ECHOES
          </h1>

          {/* Sub-logo: PROJECT 03:14 AM */}
          <div className="mt-2 text-xs sm:text-sm tracking-[0.35em] text-cyan-300/90 font-bold flex items-center justify-center gap-1">
            <span>PROJECT 03</span>
            <span className="text-pink-500 animate-ping inline-block mx-0.5">:</span>
            <span>14 AM</span>
          </div>

          <div className="mt-1 text-[10px] tracking-widest text-zinc-500 uppercase">
            // DƯ ÂM LÚC 3 GIỜ 14 PHÚT //
          </div>
        </div>

        {/* Menu Items (CLI Terminal List) */}
        <div className="w-full mt-6 sm:mt-10 space-y-3">
          {menuItems.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            return (
              <div
                key={item.id}
                onMouseEnter={() => {
                  if (selectedIndex !== idx) {
                    playTerminalBlip();
                    setSelectedIndex(idx);
                  }
                }}
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                  } else {
                    playTerminalDeny();
                  }
                }}
                className={`relative px-4 py-3 sm:py-3.5 border transition-all duration-150 cursor-pointer rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  item.disabled
                    ? 'border-zinc-800/60 bg-zinc-950/40 text-zinc-600 cursor-not-allowed opacity-50'
                    : isSelected
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.35)] translate-x-1.5'
                    : 'border-zinc-800/90 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {/* Tên Nút - Khóa min-w-[270px] và whitespace-nowrap chống rớt dấu ngoặc ']' */}
                <div className="flex items-center gap-3 min-w-[270px] shrink-0 whitespace-nowrap">
                  <span
                    className={`text-xs sm:text-sm font-bold tracking-wider transition-opacity ${
                      isSelected && !item.disabled ? 'text-cyan-400 opacity-100' : 'opacity-0'
                    }`}
                  >
                    ▶
                  </span>
                  <span
                    className={`text-xs sm:text-sm font-bold tracking-widest whitespace-nowrap ${
                      isSelected && !item.disabled ? 'text-white' : ''
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                {/* Mô tả phụ bên phải */}
                <span className="text-[10px] sm:text-xs font-sans opacity-70 sm:text-right leading-tight">
                  {item.desc}
                </span>

                {/* Vạch sáng bên mép khi active */}
                {isSelected && !item.disabled && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
                )}
              </div>
            );
          })}
        </div>

        {/* Hotkey hint */}
        <div className="mt-8 text-[11px] text-zinc-500 tracking-wider flex items-center gap-3">
          <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 font-bold">[W / S / ↑ / ↓]</span>
          <span>CHỌN</span>
          <span className="text-zinc-700">·</span>
          <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 font-bold">[ENTER]</span>
          <span>XÁC NHẬN</span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="z-10 w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center text-[10px] sm:text-[11px] text-zinc-500 border-t border-zinc-800/80 pt-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-semibold">BUILD:</span>
          <span className="text-cyan-400 font-mono">v0.3.14-ALPHA</span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-400 font-semibold">TRẠNG THÁI:</span>
          <span className="text-red-400 font-bold animate-pulse">KÝ ỨC ĐỨT ĐOẠN</span>
        </div>
        <div className="text-zinc-600 text-center sm:text-right">
          PSYCHOLOGICAL HORROR VISUAL NOVEL &copy; 2026
        </div>
      </div>

      {/* Shutdown Modal Effect khi người dùng bấm Thoát trò chơi */}
      {shutdownTriggered && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center animate-fade-in font-mono">
          <div className="w-16 h-16 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 text-2xl mb-4 animate-ping">
            !
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-red-400 tracking-widest uppercase mb-2">
            [ TẠM BIỆT ]
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md leading-relaxed mb-6">
            Câu chuyện của An và Miên tạm dừng tại đây. Bạn có thể đóng tab trình duyệt này hoặc bắt đầu lại bất cứ lúc nào.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 border border-red-500 bg-red-950/60 hover:bg-red-900 text-red-200 text-xs font-bold rounded tracking-wider transition-all"
            >
              [ CHƠI LẠI TỪ ĐẦU ]
            </button>
            <button
              onClick={() => setShutdownTriggered(false)}
              className="px-5 py-2 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded tracking-wider transition-all"
            >
              [ HỦY BỎ ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
