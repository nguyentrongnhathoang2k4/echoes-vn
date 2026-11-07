'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tx } from '../locales/tx';
import { DEDUCTION, DEDUCTION_ATTEMPTS, type MemoryEntry } from '../data/memoryJournal';
import { MemoryList } from './MemoryJournal';

/**
 * GHÉP LẠI ĐÊM 17/05 (Màn 4): biểu mẫu AURA, 3 câu điền chỗ trống.
 * Chỉ báo đúng/sai cho CẢ biểu mẫu (không chỉ ra câu nào sai), 2 lần xác nhận → đoán bừa ~7%.
 * Bàn phím: ↑↓ chọn dòng, ←→ hoặc 1-3 chọn đáp án, Enter xác nhận.
 */
export function DeductionForm({ entries, onResult }: { entries: MemoryEntry[]; onResult: (ok: boolean) => void }) {
  const [picks, setPicks] = useState<(number | null)[]>(() => DEDUCTION.map(() => null));
  const [row, setRow] = useState(0);
  const [attempts, setAttempts] = useState(DEDUCTION_ATTEMPTS);
  const [rejected, setRejected] = useState(false);
  const doneRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const complete = picks.every((p) => p !== null);

  const pick = useCallback((r: number, opt: number) => {
    if (doneRef.current) return;
    setRow(r);
    setPicks((prev) => prev.map((p, i) => (i === r ? opt : p)));
  }, []);

  const submit = useCallback(() => {
    if (doneRef.current || !picks.every((p) => p !== null)) return;
    const ok = picks.every((p, i) => p === DEDUCTION[i].answer);
    if (ok) {
      doneRef.current = true;
      onResult(true);
      return;
    }
    const left = attempts - 1;
    setAttempts(left);
    if (left <= 0) {
      doneRef.current = true;
      onResult(false);
      return;
    }
    setRejected(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setRejected(false), 2600);
  }, [attempts, onResult, picks]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key;
      const n = DEDUCTION.length;
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setRow((r) => (r + (k === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const opts = DEDUCTION[row].options.length;
        const cur = picks[row];
        const next = cur === null ? 0 : (cur + (k === 'ArrowRight' ? 1 : opts - 1)) % opts;
        pick(row, next);
      } else if (/^[1-3]$/.test(k)) {
        e.stopPropagation();
        const opt = Number(k) - 1;
        if (opt < DEDUCTION[row].options.length) pick(row, opt);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [pick, picks, row, submit]);

  return (
    <div className="mt-3 space-y-3 font-mono" onClick={(e) => e.stopPropagation()}>
      <div className="text-[clamp(9px,0.85vw,12px)] tracking-widest text-cyan-500">
        {tx('[AURA • TÁI DỰNG PHIÊN 17/05 • CẦN CHỦ THỂ XÁC NHẬN]')}
      </div>

      {DEDUCTION.map((q, r) => {
        const [before, after] = tx(q.sentence).split('___');
        const chosen = picks[r];
        return (
          <div
            key={q.sentence}
            className={`px-2.5 py-2 border-l-2 ${row === r ? 'border-cyan-300 bg-cyan-950/30' : 'border-cyan-900'}`}
            onMouseEnter={() => setRow(r)}
          >
            <div className="text-[clamp(10px,1.05vw,15px)] text-cyan-100 leading-relaxed">
              {r + 1}. {before}
              <span className={`inline-block min-w-[6ch] px-1 border-b ${chosen === null ? 'border-cyan-600 text-cyan-700' : 'border-amber-300 text-amber-200'}`}>
                {chosen === null ? '______' : tx(q.options[chosen])}
              </span>
              {after}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {q.options.map((o, i) => (
                <button
                  key={o}
                  onClick={() => pick(r, i)}
                  className={`px-2 py-0.5 text-[clamp(9px,0.85vw,12px)] border cursor-pointer transition-colors ${
                    chosen === i ? 'border-amber-300 text-amber-100 bg-amber-950/40' : 'border-cyan-800 text-cyan-300 hover:border-cyan-400'
                  }`}
                >
                  {i + 1}. {tx(o)}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!complete}
          className={`px-3 py-1 border text-[clamp(9px,0.9vw,13px)] tracking-widest ${
            complete ? 'border-cyan-300 text-cyan-100 hover:bg-cyan-950/50 cursor-pointer' : 'border-zinc-700 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {tx('[ENTER] XÁC NHẬN')}
        </button>
        <span className="text-[clamp(9px,0.85vw,12px)] text-zinc-500">{tx('Còn {0} lần xác nhận', attempts)}</span>
      </div>
      {rejected && (
        <div className="text-[clamp(9px,0.9vw,13px)] text-red-400">{tx('[DỮ LIỆU KHÔNG KHỚP VỚI KÝ ỨC CHỦ THỂ]')}</div>
      )}

      <div className="pt-2 border-t border-cyan-950">
        <div className="text-[clamp(9px,0.85vw,12px)] tracking-widest text-zinc-500 mb-2">{tx('KÝ ỨC')}</div>
        <MemoryList entries={entries} />
      </div>
    </div>
  );
}
