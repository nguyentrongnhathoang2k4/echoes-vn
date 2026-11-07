"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { InventoryItem, CHAPTER_1_ITEMS } from '../types/inventory';
import { tx } from '../locales/tx';
import { useUiLayer } from '../services/uiLayers';
import { ItemSprite } from './pixel/ItemSprite';
import { MenuOption } from './MenuOption';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onCombineItems: (itemAId: string, itemBId: string, resultItem: InventoryItem, successMsg: string) => void;
  /** Ghép 2 nửa đĩa mềm: trang ngoài mở minigame phục chế (không ghép tức thì) */
  onRestoreDisk?: () => void;
  onUseItem?: (item: InventoryItem) => void;
  usedConsumableIds?: string[];
  selectedItemId?: string | null;
  onSelectItem?: (item: InventoryItem | null) => void;
  volume?: number;
}

const TOTAL_SLOTS = 12;
// Số cột của lưới ô đồ (grid-cols-4): ↑ ↓ nhảy đúng một hàng
const GRID_COLS = 4;

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  items,
  onCombineItems,
  onRestoreDisk,
  onUseItem,
  usedConsumableIds = [],
  volume = 80,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id || null);
  const [combineNotification, setCombineNotification] = useState<string | null>(null);
  // Ô đang chọn bằng bàn phím thì hiện viền focus sáng (bấm chuột thì tắt).
  // Túi đồ mở bằng phím [I] / [Tab] nên mỗi lần mở đều bật sẵn khung focus
  const [keyboardNav, setKeyboardNav] = useState(true);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setKeyboardNav(true);
  }
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Rời màn / đóng khung thì đóng hẳn AudioContext riêng: không còn âm nào ngân sang cảnh sau
  useEffect(() => {
    const ctxRef = audioCtxRef;
    return () => {
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

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

  // Tự động chọn item đầu tiên nếu item đang chọn bị xoá hoặc chưa chọn
  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    } else if (selectedId && !items.some(i => i.id === selectedId)) {
      setSelectedId(items[0]?.id || null);
    }
  }, [items, selectedId]);

  // Túi đồ đang mở thì Esc thuộc về túi đồ, không mở Pause Menu
  useUiLayer(isOpen);

  // Thông tin vật phẩm đang chọn tính trước early return: listener bàn phím bên dưới cần dùng tới
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
    // Đĩa mềm phải phục chế thủ công (cạo ba-via, căn Track 0, dán & hơ, gạt lẫy chống ghi)
    if (resultId === 'aura_disk' && onRestoreDisk) {
      onRestoreDisk();
      return;
    }

    playCraftSuccessSound();
    const msg = currentItem.combineSuccessMsg ? tx(currentItem.combineSuccessMsg) : tx('Đã kết hợp thành công: {0}!', tx(resultDef.name));
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

  // Hành động chính của ô đang chọn (Enter / Space): dùng nếu dùng được, không thì ghép nếu đủ mảnh
  const canUse = !!currentItem?.isConsumable && !isCurrentItemConsumed;
  const canCombine = !!currentItem?.canCombineWith && hasCombinablePartner && hasRequiredTool;
  const handlePrimaryAction = () => {
    if (canUse) handleUseItem();
    else if (canCombine) handleCombine();
  };

  // Bắt phím tắt: Esc / Tab / I đóng túi đồ • mũi tên hoặc WASD chọn ô • Enter / Space dùng hoặc ghép
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'Escape' || key === 'i' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      const step =
        e.key === 'ArrowLeft' || key === 'a' ? -1
        : e.key === 'ArrowRight' || key === 'd' ? 1
        : e.key === 'ArrowUp' || key === 'w' ? -GRID_COLS
        : e.key === 'ArrowDown' || key === 's' ? GRID_COLS
        : 0;
      if (step !== 0) {
        e.preventDefault();
        setKeyboardNav(true);
        if (items.length === 0) return;
        const cur = items.findIndex((i) => i.id === selectedId);
        const next = cur < 0 ? 0 : Math.max(0, Math.min(items.length - 1, cur + step));
        if (next !== cur) {
          playClickSound();
          setSelectedId(items[next].id);
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        // Nút vừa bấm chuột còn giữ focus: bỏ focus để Enter/Space không kích hoạt nút đó thêm lần nữa
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setKeyboardNav(true);
        handlePrimaryAction();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl flex flex-col gap-5 font-mono text-zinc-200"
      >
        {/* 1. Tiêu đề + số ô đã dùng */}
        <div className="text-center">
          <h2 className="text-lg sm:text-xl tracking-[0.3em] pl-[0.3em] uppercase text-zinc-100">{tx('Túi đồ')}</h2>
          <div className="mt-2 text-xs tracking-[0.4em] pl-[0.4em] text-red-400/80">
            {items.length}/{TOTAL_SLOTS}
          </div>
        </div>

        {/* Thông báo ghép đồ thành công */}
        {combineNotification && (
          <div className="text-xs text-center text-zinc-200">{combineNotification}</div>
        )}

        {/* 2. Thân: lưới ô đồ (trái) • chi tiết món đang chọn (phải) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 flex-1 min-h-72.5">
          <div className="sm:col-span-7 flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2">
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
                        setKeyboardNav(false);
                      }
                    }}
                    className={`aspect-square border flex flex-col items-center justify-center p-1 relative transition-colors duration-150 ${
                      item
                        ? isSelected
                          ? `border-zinc-200 bg-zinc-900 cursor-pointer ${keyboardNav ? 'outline-2 outline-offset-2 outline-zinc-300' : ''}`
                          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600 cursor-pointer'
                        : 'border-zinc-900 bg-transparent'
                    }`}
                  >
                    {item && (
                      <>
                        <ItemSprite id={item.id} size={40} />
                        <span
                          className={`text-[9px] sm:text-[10px] text-center truncate w-full mt-0.5 leading-tight px-0.5 ${
                            isSelected ? 'text-zinc-100' : 'text-zinc-500'
                          }`}
                        >
                          {tx(item.shortName)}
                        </span>
                        {/* Chấm tròn biểu thị item có thể ghép */}
                        {item.canCombineWith && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title={tx('Có thể ghép')} />
                        )}
                        {/* Chấm xanh biểu thị item có thể dùng (chỉ hiện khi chưa từng dùng) */}
                        {item.isConsumable && !usedConsumableIds.includes(`${item.id}_used`) && (
                          <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-emerald-400" title={tx('Có thể sử dụng (+Sanity)')} />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-zinc-600 space-y-0.5">
              <div>{tx('• Chấm vàng: Vật phẩm có thể ghép nối.')}</div>
              <div>{tx('• Chấm xanh lá: Vật phẩm có thể sử dụng trực tiếp để hồi Sanity.')}</div>
            </div>
          </div>

          {/* Chi tiết món đồ được chọn */}
          <div className="sm:col-span-5 flex flex-col">
            {currentItem ? (
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center gap-3 pb-3 border-b border-zinc-900">
                  <ItemSprite id={currentItem.id} size={48} />
                  <div className="overflow-hidden">
                    <h3 className="text-xs sm:text-sm tracking-[0.15em] uppercase text-zinc-100 truncate">
                      {tx(currentItem.name)}
                    </h3>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
                      {currentItem.category === 'memory'
                        ? tx('DỮ LIỆU KÝ ỨC')
                        : currentItem.category === 'medical'
                        ? tx('HỒI PHỤC TÂM TRÍ')
                        : currentItem.category === 'tool'
                        ? tx('DỤNG CỤ THỰC TẾ')
                        : tx('VẬT PHẨM')}
                    </span>
                  </div>
                </div>

                {/* Mô tả ngắn */}
                <p className="flex-1 text-[11px] sm:text-xs leading-relaxed text-zinc-400 overflow-y-auto">
                  {tx(currentItem.description)}
                </p>

                {/* Dùng (vật phẩm tiêu hao) */}
                {currentItem.isConsumable && (
                  <div className="flex justify-center">
                    {isCurrentItemConsumed ? (
                      <span className="text-[11px] tracking-[0.2em] uppercase text-zinc-600">{tx('Đã sử dụng')}</span>
                    ) : (
                      <MenuOption
                        size="sm"
                        selected
                        label={tx(currentItem.consumeActionName || 'SỬ DỤNG VẬT PHẨM')}
                        onClick={handleUseItem}
                      />
                    )}
                  </div>
                )}

                {/* Ghép khi đủ 2 mảnh (và có băng dính) */}
                {currentItem.canCombineWith && (
                  <div className="flex justify-center text-center">
                    {hasCombinablePartner ? (
                      hasRequiredTool ? (
                        <MenuOption size="sm" selected label={tx(currentItem.combineResultId === 'aura_disk' && onRestoreDisk ? 'Phục chế đĩa mềm' : 'Ghép bằng băng dính')} onClick={handleCombine} />
                      ) : (
                        <p className="text-[10px] text-amber-400/80 leading-snug">
                          {currentItem.requiredToolMsg ? tx(currentItem.requiredToolMsg) : tx('Cần có {0} để dán khít 2 mảnh!', tx(requiredToolDef?.name || 'Băng Dính'))}
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-amber-400/80 leading-snug">
                        {tx('Cần tìm thêm nửa mảnh còn lại để ghép hoàn chỉnh!')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600 gap-2 p-4">
                <span className="text-xs">{tx('Chưa chọn vật phẩm nào.')}</span>
                <span className="text-[10px]">
                  {tx('Hãy khám phá căn phòng để thu thập thêm công cụ và mảnh ký ức!')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Gợi ý phím */}
        <div className="text-center text-[10px] text-zinc-600 tracking-widest">
          {tx('←↑↓→ / WASD chọn · Enter / Space dùng / ghép · Tab / Esc đóng')}
        </div>
      </div>
    </div>
  );
};
