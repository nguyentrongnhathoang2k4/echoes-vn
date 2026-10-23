"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PolaroidMinigameProps {
  onComplete: () => void;
  onClose: () => void;
  volume?: number;
}

export const PolaroidMinigame: React.FC<PolaroidMinigameProps> = ({
  onComplete,
  onClose,
  volume = 80,
}) => {
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dustCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cleanedPercent, setCleanedPercent] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [glitchFlash, setGlitchFlash] = useState(false);
  const isInteractingRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef<number>(0);

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

  // Tiếng chà xát / lau bụi (white noise có filter dải thông)
  const playWipeSound = useCallback(() => {
    if (volume <= 0) return;
    const now = performance.now();
    if (now - lastSoundTimeRef.current < 80) return; // Debounce
    lastSoundTimeRef.current = now;

    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 + Math.random() * 400, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime((volume / 100) * 0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch {}
  }, [getAudioContext, volume]);

  // Tiếng sốc thị giác (rùng mình / tiếng ù tai chói lòa)
  const playShockSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.3);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.8);

      g.gain.setValueAtTime((volume / 100) * 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.9);
    } catch {}
  }, [getAudioContext, volume]);

  // Vẽ bức ảnh nền (Ưu tiên ảnh nghệ thuật Polaroid /assets/polaroid_memory.png)
  useEffect(() => {
    const canvas = photoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Viền khung giấy Polaroid cổ điển
    const pad = 16;
    const imgW = w - pad * 2;
    const imgH = h - pad * 2 - 40; // Dành 40px cho ghi chú viết tay phía dưới

    // 1. Kiểm tra ảnh Pixel Art nghệ thuật chân thực (/assets/polaroid_pixel.png)
    const artImg = new Image();
    artImg.src = '/assets/polaroid_pixel.png';
    artImg.onload = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false; // Giữ nguyên độ sắc nét của từng điểm ảnh Pixel Art
      ctx.drawImage(artImg, 0, 0, w, h);
    };

    artImg.onerror = () => {
      // Fallback 1: Thử ảnh polaroid_memory.png
      const memImg = new Image();
      memImg.src = '/assets/polaroid_memory.png';
      memImg.onload = () => {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(memImg, 0, 0, w, h);
      };
      memImg.onerror = () => {
        renderFallback();
      };
    };

    // Tải ảnh chân dung thật của Miên và An từ assets cho fallback
    const imgMien = new Image();
    imgMien.src = '/assets/ModelMIEN/warm_smileMien.png';

    const imgAn = new Image();
    imgAn.src = '/assets/ModelAN/ExhaustedAn.png';

    let mienLoaded = false;
    let anLoaded = false;

    const renderFallback = () => {
      // 1. Viền giấy ảnh Polaroid trắng ngà
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      // Viền shadow nhẹ quanh ảnh
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pad - 1, pad - 1, imgW + 2, imgH + 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, pad, imgW, imgH);
      ctx.clip();

      // ==========================================
      // 1. NỬA TRÁI (Ký ức của Miên: Hoàng hôn rực rỡ bên bến sông)
      // ==========================================
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad, pad, imgW / 2 + 1, imgH);
      ctx.clip();

      // Background Hoàng hôn ấm áp
      const sunsetGrad = ctx.createLinearGradient(pad, pad, pad + imgW / 2, pad + imgH);
      sunsetGrad.addColorStop(0, '#581c87');
      sunsetGrad.addColorStop(0.4, '#ea580c');
      sunsetGrad.addColorStop(0.8, '#f59e0b');
      sunsetGrad.addColorStop(1, '#fef08a');
      ctx.fillStyle = sunsetGrad;
      ctx.fillRect(pad, pad, imgW / 2 + 2, imgH);

      // Ghế đá công viên mờ ảo phía xa
      ctx.fillStyle = '#78350f';
      ctx.fillRect(pad + 10, pad + imgH * 0.65, imgW / 2 - 20, 8);

      // Cánh hoa tím chuông gió bay lơ lửng
      ctx.fillStyle = '#e9d5ff';
      const petals = [
        { x: 25, y: 35 }, { x: 70, y: 65 }, { x: 40, y: 110 },
        { x: 110, y: 55 }, { x: 85, y: 140 }, { x: 130, y: 170 },
        { x: 50, y: 200 }, { x: 95, y: 230 }
      ];
      petals.forEach(p => {
        ctx.beginPath();
        ctx.ellipse(pad + p.x * 0.9, pad + p.y * 0.9, 4.5, 2.8, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Vẽ chân dung thật của Miên
      if (mienLoaded) {
        const dw = imgW * 0.65;
        const dh = imgH * 0.96;
        const dx = pad - 12;
        const dy = pad + imgH - dh + 6;
        ctx.drawImage(imgMien, 0, 0, imgMien.width, imgMien.height, dx, dy, dw, dh);

        // Lớp lọc nắng vàng hoàng hôn nhẹ nhàng lên Miên
        ctx.fillStyle = 'rgba(251, 146, 60, 0.14)';
        ctx.fillRect(pad, pad, imgW / 2 + 1, imgH);
      } else {
        // Fallback bóng dáng Miên
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.arc(pad + imgW * 0.28, pad + imgH * 0.44, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ==========================================
      // 2. NỬA PHẢI (Thực tại nghiệt ngã: Phòng cấp cứu ICU bệnh viện)
      // ==========================================
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad + imgW / 2, pad, imgW / 2, imgH);
      ctx.clip();

      // Background ICU lạnh lẽo, tối tăm
      const icuGrad = ctx.createLinearGradient(pad + imgW / 2, pad, pad + imgW, pad + imgH);
      icuGrad.addColorStop(0, '#042f2e');
      icuGrad.addColorStop(0.35, '#0f172a');
      icuGrad.addColorStop(0.8, '#1e1b4b');
      icuGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = icuGrad;
      ctx.fillRect(pad + imgW / 2, pad, imgW / 2, imgH);

      // Cột truyền dịch y tế kim loại sáng loáng
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad + imgW * 0.9, pad + 15);
      ctx.lineTo(pad + imgW * 0.9, pad + imgH - 10);
      ctx.stroke();

      // Bình dịch truyền nhỏ giọt y tế
      ctx.fillStyle = 'rgba(103, 232, 249, 0.7)';
      ctx.fillRect(pad + imgW * 0.86, pad + 25, 14, 28);
      ctx.fillStyle = '#0891b2';
      ctx.fillRect(pad + imgW * 0.88, pad + 53, 10, 4);

      // Màn hình điện tâm đồ nhấp nháy ECG
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(pad + imgW * 0.55, pad + 18, 62, 24);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pad + imgW * 0.56, pad + 30);
      ctx.lineTo(pad + imgW * 0.62, pad + 30);
      ctx.lineTo(pad + imgW * 0.64, pad + 22);
      ctx.lineTo(pad + imgW * 0.66, pad + 36);
      ctx.lineTo(pad + imgW * 0.68, pad + 30);
      ctx.lineTo(pad + imgW * 0.73, pad + 30);
      ctx.stroke();

      // Vẽ chân dung thật của An trong cơn nguy kịch
      if (anLoaded) {
        const dw = imgW * 0.65;
        const dh = imgH * 0.96;
        const dx = pad + imgW * 0.45;
        const dy = pad + imgH - dh + 6;
        ctx.drawImage(imgAn, 0, 0, imgAn.width, imgAn.height, dx, dy, dw, dh);

        // Vẽ dải băng gạc y tế quấn kín trán An (Bandage & Bloodstain)
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        // Quấn băng chéo trán
        ctx.moveTo(dx + dw * 0.22, dy + dh * 0.28);
        ctx.lineTo(dx + dw * 0.78, dy + dh * 0.24);
        ctx.lineTo(dx + dw * 0.8, dy + dh * 0.36);
        ctx.lineTo(dx + dw * 0.24, dy + dh * 0.4);
        ctx.closePath();
        ctx.fill();

        // Vết máu đỏ sẫm thấm ra ở mép băng gạc
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.arc(dx + dw * 0.62, dy + dh * 0.31, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.arc(dx + dw * 0.64, dy + dh * 0.32, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Dây điện cực nối từ đầu An sang máy thở
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx + dw * 0.65, dy + dh * 0.26);
        ctx.bezierCurveTo(dx + dw * 0.8, dy + dh * 0.2, pad + imgW * 0.82, pad + 40, pad + imgW * 0.86, pad + 35);
        ctx.stroke();

        // Lớp lọc màu lạnh tái nhợt của phòng hồi sức cấp cứu
        ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
        ctx.fillRect(pad + imgW / 2, pad, imgW / 2, imgH);
      } else {
        // Fallback bóng dáng An
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(pad + imgW * 0.68, pad + imgH * 0.44, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vòng nhựa định danh bệnh nhân trên cổ tay An
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(pad + imgW * 0.54, pad + imgH * 0.75, 88, 19);
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1;
      ctx.strokeRect(pad + imgW * 0.54, pad + imgH * 0.75, 88, 19);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px monospace';
      ctx.fillText('BV BẠCH MAI • ICU • AN', pad + imgW * 0.56, pad + imgH * 0.82);
      ctx.fillText('17/05/2024 • CODE_314', pad + imgW * 0.56, pad + imgH * 0.88);

      ctx.restore();

      // ==========================================
      // 3. ĐƯỜNG RANH GIỚI RẠN NỨT XÉ TOẠC 2 THỰC TẠI
      // ==========================================
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(244, 63, 94, 0.9)';
      ctx.shadowBlur = 6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(pad + imgW / 2, pad);
      ctx.lineTo(pad + imgW / 2, pad + imgH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      ctx.restore();

      // ==========================================
      // 4. GHI CHÚ VIẾT TAY DƯỚI CHÂN ẢNH POLAROID
      // ==========================================
      ctx.font = 'italic 600 13px var(--font-lora), var(--font-serif), "Times New Roman", Georgia, serif';
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.fillText('„Bến Bình An cùng em... 17/05/2024‟', w / 2, h - 14);
    };

    imgMien.onload = () => {
      mienLoaded = true;
      if (!artImg.complete || artImg.naturalWidth === 0) renderFallback();
    };
    imgAn.onload = () => {
      anLoaded = true;
      if (!artImg.complete || artImg.naturalWidth === 0) renderFallback();
    };
  }, []);

  // Khởi tạo Canvas lớp bụi tĩnh điện (Scratch layer)
  useEffect(() => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Phủ lớp sương mờ tĩnh điện CRT xám xịt
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, w, h);

    // Hạt nhiễu grain / static
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = 50 + Math.random() * 80;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v + 15;
      data[i + 3] = 245; // Đục gần như hoàn toàn
    }
    ctx.putImageData(imgData, 0, 0);

    // Dòng chữ hướng dẫn ở giữa lớp bụi
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('✦ BỤI THỜI GIAN CHE PHỦ ✦', w / 2, h / 2 - 10);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#fbcfe8';
    ctx.fillText('(Dùng chuột hoặc chạm tay để lau sạch)', w / 2, h / 2 + 12);
  }, []);

  // Tính toán phần trăm diện tích đã được lau sạch
  const checkProgress = useCallback(() => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      let transparentCount = 0;
      const totalPixels = data.length / 4;
      const step = 8; // Lấy mẫu bước nhảy để tối ưu hiệu năng
      for (let i = 3; i < data.length; i += 4 * step) {
        if (data[i] < 60) transparentCount++;
      }
      const percent = Math.min(100, Math.round((transparentCount / (totalPixels / step)) * 100));
      setCleanedPercent(percent);

      if (percent >= 65 && !isRevealed) {
        setIsRevealed(true);
        setGlitchFlash(true);
        playShockSound();
        setTimeout(() => setGlitchFlash(false), 800);
      }
    } catch {}
  }, [isRevealed, playShockSound]);

  // Hành vi lau sạch khi di chuyển chuột / ngón tay
  const wipeAt = (clientX: number, clientY: number) => {
    const canvas = dustCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    playWipeSound();
    checkProgress();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isInteractingRef.current = true;
    wipeAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isInteractingRef.current) {
      wipeAt(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = () => {
    isInteractingRef.current = false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md font-mono select-none animate-fade-in overflow-y-auto">
      <div
        className={`relative w-full max-w-lg max-h-[94vh] overflow-y-auto bg-zinc-950 border-2 rounded-lg shadow-[0_0_50px_rgba(244,114,182,0.3)] p-4 sm:p-5 transition-all duration-300 ${
          glitchFlash
            ? 'border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.8)] animate-pulse'
            : 'border-fuchsia-800/80'
        }`}
      >
        {/* Tiêu đề & Nút bỏ qua (Đảm bảo không bao giờ rớt chữ xuống dòng) */}
        <div className="flex justify-between items-center pb-2.5 border-b border-fuchsia-900/50 mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 animate-ping inline-block shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold text-fuchsia-300 uppercase tracking-wider truncate">
              Bức Ảnh Kỷ Niệm • Ghế Đá Hoàng Hôn
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded transition-colors shrink-0 cursor-pointer"
          >
            [ESC] Bỏ qua
          </button>
        </div>

        <p className="text-xs text-zinc-300 mb-3 leading-relaxed font-sans">
          Tấm ảnh Polaroid đặt trên ghế đá ven sông bị phủ một lớp bụi tĩnh điện mờ mịt.
          <span className="text-fuchsia-300 font-semibold block mt-0.5">
            👉 Lau sạch bề mặt bức ảnh để khôi phục lại khoảnh khắc ngày 17/05.
          </span>
        </p>

        {/* Khung xếp chồng Canvas Polaroid & Lớp bụi (Tỉ lệ chuẩn ảnh crop 895x950) */}
        <div className="relative mx-auto w-[330px] h-[350px] sm:w-[340px] sm:h-[360px] max-w-full rounded shadow-2xl overflow-hidden border border-zinc-700 bg-black flex items-center justify-center shrink-0">
          {/* Canvas bức ảnh bên dưới */}
          <canvas
            ref={photoCanvasRef}
            width={340}
            height={360}
            className="absolute inset-0 block w-full h-full"
          />

          {/* Canvas lớp bụi phủ bên trên để lau */}
          <canvas
            ref={dustCanvasRef}
            width={340}
            height={360}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`absolute inset-0 block w-full h-full cursor-crosshair touch-none transition-opacity duration-700 ${
              isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          />
        </div>

        {/* Tiến trình lau sạch */}
        <div className="mt-2.5 flex justify-between items-center text-xs text-zinc-400">
          <span>Tiến độ làm sạch: <strong className="text-fuchsia-400">{cleanedPercent}%</strong></span>
          {!isRevealed ? (
            <button
              onClick={() => {
                setCleanedPercent(100);
                setIsRevealed(true);
                playShockSound();
              }}
              className="text-[11px] text-fuchsia-400/80 hover:text-fuchsia-300 underline cursor-pointer"
            >
              [Tự động lau sạch]
            </button>
          ) : (
            <span className="text-red-400 font-bold animate-pulse">ĐÃ LAU SẠCH 100%</span>
          )}
        </div>

        {/* NÚT HOÀN TẤT KHI LAU XONG */}
        {isRevealed && (
          <button
            onClick={onComplete}
            className="w-full mt-3.5 py-2.5 px-4 bg-gradient-to-r from-red-800 via-rose-900 to-zinc-900 hover:from-red-700 hover:to-rose-800 active:scale-98 text-white font-bold text-xs sm:text-sm rounded border border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse transition-all cursor-pointer flex items-center justify-center gap-2 tracking-wider"
          >
            <span>📸</span>
            <span>[ CẤT BỨC ẢNH VÀO TÚI ]</span>
          </button>
        )}
      </div>
    </div>
  );
};
