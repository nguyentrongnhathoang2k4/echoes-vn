"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { InventoryItem, CHAPTER_1_ITEMS } from '../types/inventory';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onCombineItems: (itemAId: string, itemBId: string, resultItem: InventoryItem, successMsg: string) => void;
  onUseItem?: (item: InventoryItem) => void;
  usedConsumableIds?: string[];
  selectedItemId?: string | null;
  onSelectItem?: (item: InventoryItem | null) => void;
  volume?: number;
}

const TOTAL_SLOTS = 12;

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  items,
  onCombineItems,
  onUseItem,
  usedConsumableIds = [],
  volume = 80,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id || null);
  const [combineNotification, setCombineNotification] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Khởi tạo AudioContext
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

  // Tiếng click chọn đồ
  const playClickSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(350, t + 0.03);
      g.gain.setValueAtTime((volume / 100) * 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
    } catch {}
  }, [volume, getAudioContext]);

  // Tiếng ghép đồ thành công
  const playCraftSuccessSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.07);
        g.gain.setValueAtTime((volume / 100) * 0.07, t + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.2);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.07);
        osc.stop(t + idx * 0.07 + 0.2);
      });
    } catch {}
  }, [volume, getAudioContext]);

  // Tiếng sử dụng vật phẩm (uống cà phê, ngắm ảnh)
  const playConsumeSound = useCallback(() => {
    if (volume <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      [330, 440, 550, 660].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        g.gain.setValueAtTime((volume / 100) * 0.08, t + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.25);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.25);
      });
    } catch {}
  }, [volume, getAudioContext]);

  // Tự động chọn item đầu tiên nếu item đang chọn bị xóa hoặc chưa chọn
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    } else if (selectedId && !items.some(i => i.id === selectedId)) {
      setSelectedId(items[0]?.id || null);
    }
  }, [items, selectedId]);

  // Bắt phím tắt đóng túi đồ (Esc hoặc I)
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'i') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentItem = items.find(i => i.id === selectedId) || null;

  // Kiểm tra ghép vật phẩm
  const combinablePartnerId = currentItem?.canCombineWith;
  const hasCombinablePartner = combinablePartnerId
    ? items.some(i => i.id === combinablePartnerId)
    : false;
  const partnerItem = combinablePartnerId
    ? items.find(i => i.id === combinablePartnerId)
    : null;

  // Kiểm tra điều kiện phụ trợ (VD: Cuộn Băng Dính)
  const requiredToolId = currentItem?.requiredToolId;
  const hasRequiredTool = requiredToolId
    ? items.some(i => i.id === requiredToolId)
    : true;
  const requiredToolDef = requiredToolId ? CHAPTER_1_ITEMS[requiredToolId] : null;

  const handleCombine = () => {
    if (!currentItem || !combinablePartnerId || !hasCombinablePartner || !hasRequiredTool) return;
    const resultId = currentItem.combineResultId;
    if (!resultId) return;

    const resultDef = CHAPTER_1_ITEMS[resultId];
    if (!resultDef) return;

    playCraftSuccessSound();
    const msg = currentItem.combineSuccessMsg || `Đã kết hợp thành công: ${resultDef.name}!`;
    setCombineNotification(msg);
    setTimeout(() => setCombineNotification(null), 4000);

    onCombineItems(currentItem.id, combinablePartnerId, resultDef, msg);
    setSelectedId(resultDef.id);
  };

  const isCurrentItemConsumed = currentItem
    ? usedConsumableIds.includes(`${currentItem.id}_used`)
    : false;

  const handleUseItem = () => {
    if (!currentItem || !currentItem.isConsumable || isCurrentItemConsumed) return;
    playConsumeSound();
    onUseItem?.(currentItem);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-950 border-2 border-cyan-500/80 rounded-sm shadow-[0_0_50px_rgba(6,182,212,0.35)] p-4 sm:p-6 flex flex-col gap-4 font-mono text-zinc-200 relative overflow-hidden"
      >
        {/* Scanlines CRT nhẹ */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-40" />

        {/* 1. Header Túi Đồ */}
        <div className="flex justify-between items-center border-b border-cyan-900/80 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping inline-block" />
            <h2 className="text-sm sm:text-base font-bold text-cyan-300 tracking-widest flex items-center gap-2">
              <span>🎒</span>
              <span>HÀNH TRANG KÝ ỨC // INVENTORY</span>
            </h2>
            <span className="text-[11px] bg-cyan-950/80 border border-cyan-800 text-cyan-400 px-2 py-0.5 rounded font-bold">
              {items.length}/{TOTAL_SLOTS}
            </span>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-cyan-400 text-zinc-400 hover:text-white text-xs rounded transition-colors cursor-pointer"
          >
            <span>[I / ESC]</span>
            <span className="font-bold">ĐÓNG</span>
          </button>
        </div>

        {/* Thông báo ghép đồ thành công */}
        {combineNotification && (
          <div className="text-xs text-center text-cyan-300 bg-cyan-950/90 border border-cyan-400 p-2 rounded animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.5)]">
            ✨ {combineNotification}
          </div>
        )}

        {/* 2. Thân Modal (Chia 2 cột: Lưới Slots & Bảng Chi Tiết) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 flex-1 min-h-[290px]">
          {/* CỘT TRÁI (7 Cột): Lưới các ô đồ */}
          <div className="sm:col-span-7 flex flex-col gap-2">
            <div className="text-[10px] text-zinc-400 tracking-wider uppercase font-bold">
              CÁC VẬT PHẨM ĐANG MANG THEO:
            </div>
            <div className="grid grid-cols-4 gap-2 bg-black/60 p-3 rounded border border-zinc-800">
              {Array.from({ length: TOTAL_SLOTS }).map((_, index) => {
                const item = items[index];
                const isSelected = item && item.id === selectedId;

                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (item) {
                        playClickSound();
                        setSelectedId(item.id);
                      }
                    }}
                    className={`aspect-square rounded border-2 flex flex-col items-center justify-center p-1 relative transition-all duration-150 ${
                      item
                        ? isSelected
                          ? 'border-cyan-400 bg-cyan-950/60 shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer scale-105 z-10'
                          : 'border-zinc-700/80 bg-zinc-900/80 hover:border-cyan-500/60 hover:bg-zinc-800 cursor-pointer'
                        : 'border-zinc-800/60 bg-zinc-950/40 opacity-40'
                    }`}
                  >
                    {item ? (
                      <>
                        <span className="text-2xl sm:text-3xl filter drop-shadow">
                          {item.icon}
                        </span>
                        <span className="text-[9px] text-center text-zinc-300 truncate w-full mt-1 leading-tight px-0.5">
                          {item.name.split(' ')[0]}
                        </span>
                        {/* Chấm tròn biểu thị item có thể ghép */}
                        {item.canCombineWith && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Có thể ghép" />
                        )}
                        {/* Chấm xanh biểu thị item có thể dùng (chỉ hiện khi chưa từng dùng) */}
                        {item.isConsumable && !usedConsumableIds.includes(`${item.id}_used`) && (
                          <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-emerald-400" title="Có thể sử dụng (+Sanity)" />
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-700 text-xs font-mono">•</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-zinc-500 italic mt-auto space-y-0.5">
              <div>• Chấm vàng: Vật phẩm có thể ghép nối.</div>
              <div>• Chấm xanh lá: Vật phẩm có thể sử dụng trực tiếp để hồi Sanity.</div>
            </div>
          </div>

          {/* CỘT PHẢI (5 Cột): Chi tiết món đồ được chọn */}
          <div className="sm:col-span-5 bg-zinc-900/60 border border-zinc-800 rounded p-3.5 flex flex-col justify-between">
            {currentItem ? (
              <div className="flex flex-col gap-3 h-full">
                {/* Header item */}
                <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
                  <div className="w-12 h-12 rounded border border-cyan-500/60 bg-cyan-950/40 flex items-center justify-center text-2xl shadow-inner">
                    {currentItem.icon}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-xs sm:text-sm font-bold text-cyan-300 truncate">
                      {currentItem.name}
                    </h3>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest px-1.5 py-0.2 bg-black/60 rounded border border-zinc-700">
                      {currentItem.category === 'memory'
                        ? 'DỮ LIỆU KÝ ỨC'
                        : currentItem.category === 'medical'
                        ? 'HỒI PHỤC TÂM TRÍ'
                        : currentItem.category === 'tool'
                        ? 'DỤNG CỤ THỰC TẾ'
                        : 'VẬT PHẨM'}
                    </span>
                  </div>
                </div>

                {/* Mô tả chi tiết */}
                <div className="flex-1 bg-black/50 p-2.5 rounded border border-zinc-800/80 text-[11px] sm:text-xs leading-relaxed text-zinc-300 overflow-y-auto">
                  {currentItem.description}
                </div>

                {/* Nút Sử Dụng (Consumable) */}
                {currentItem.isConsumable && (
                  <div className="pt-2 border-t border-zinc-800">
                    {isCurrentItemConsumed ? (
                      <div className="py-2 px-3 bg-zinc-950 border border-zinc-800 rounded text-center">
                        <div className="text-zinc-400 font-bold text-xs flex items-center justify-center gap-1.5 font-mono">
                          <span>✓</span>
                          <span>ĐÃ SỬ DỤNG (CHỈ HỒI TỈNH TÁO 1 LẦN DUY NHẤT)</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5 italic leading-tight">
                          Vật phẩm này đã phát huy tác dụng giúp bạn lấy lại tỉnh táo.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleUseItem}
                        className="w-full py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-black font-bold text-xs rounded border border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                      >
                        <span>⚡</span>
                        <span>[{currentItem.consumeActionName || 'SỬ DỤNG VẬT PHẨM'}]</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Nút Kết Hợp (Combine) nếu tìm đủ 2 mảnh ghép */}
                {currentItem.canCombineWith && (
                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    {hasCombinablePartner ? (
                      hasRequiredTool ? (
                        <button
                          onClick={handleCombine}
                          className="w-full py-2 px-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-bold text-xs rounded border border-yellow-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                        >
                          <span>✨</span>
                          <span>[GHÉP DÙNG BĂNG DÍNH DÁN LẠI]</span>
                        </button>
                      ) : (
                        <div className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800 p-2 rounded text-center leading-tight">
                          {currentItem.requiredToolMsg || `⚠️ Cần có ${requiredToolDef?.name || 'Băng Dính'} để dán khít 2 mảnh!`}
                        </div>
                      )
                    ) : (
                      <div className="text-[10px] text-amber-400/80 bg-amber-950/30 border border-amber-900/60 p-2 rounded text-center">
                        ⚠️ Cần tìm thêm nửa mảnh còn lại để ghép hoàn chỉnh!
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-500 gap-2 p-4">
                <span className="text-3xl opacity-30">🎒</span>
                <span className="text-xs">Chưa chọn vật phẩm nào.</span>
                <span className="text-[10px] opacity-60">
                  Hãy khám phá căn phòng để thu thập thêm công cụ và mảnh ký ức!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Footer Hướng dẫn phím */}
        <div className="flex justify-between items-center pt-2 border-t border-zinc-800 text-[10px] text-zinc-500 shrink-0">
          <div>Nhấn [I] hoặc [ESC] để đóng túi đồ</div>
          <div>ECHOES // INVENTORY PROTOCOL</div>
        </div>
      </div>
    </div>
  );
};
