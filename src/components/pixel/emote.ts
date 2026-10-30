// =====================================================================
// BONG BÓNG CẢM XÚC PIXEL trên đầu nhân vật (!, ?, …, ♥, ♪, giọt mồ hôi)
// Dùng chung cho cả 4 màn chơi. Mỗi nhân vật giữ một bong bóng tại một thời điểm;
// bong bóng mới thay bong bóng cũ.
// =====================================================================

export type EmoteKind = 'exclaim' | 'question' | 'dots' | 'heart' | 'note' | 'sweat';

export interface Emote {
  kind: EmoteKind;
  /** Thời điểm bắt đầu (giây, cùng đồng hồ với vòng lặp vẽ của màn) */
  at: number;
  dur: number;
}

export interface EmoteSlots {
  an: Emote | null;
  mien: Emote | null;
}

export const createEmoteSlots = (): EmoteSlots => ({ an: null, mien: null });

const DEFAULT_DUR: Record<EmoteKind, number> = {
  exclaim: 1.3,
  question: 1.6,
  dots: 2.4,
  heart: 1.8,
  note: 2.2,
  sweat: 1.6,
};

/** Đặt bong bóng cho một nhân vật */
export function showEmote(slots: EmoteSlots, who: keyof EmoteSlots, kind: EmoteKind, t: number, dur = DEFAULT_DUR[kind]) {
  slots[who] = { kind, at: t, dur };
}

// =====================================================================
// ĐIỀU PHỐI: khi nào ai hiện bong bóng gì (dùng chung cho các màn chơi)
// =====================================================================

export interface EmoteDirector {
  slots: EmoteSlots;
  /** Đồng hồ của vòng lặp vẽ (cập nhật mỗi khung hình) */
  t: number;
  /** Đồ vật An đã tò mò (mỗi món chỉ hiện "?" một lần) */
  seen: Set<string>;
  lastNearId: string | null;
  mienGreeted: boolean;
  nextMienIdle: number;
  nextSweat: number;
}

export const createEmoteDirector = (): EmoteDirector => ({
  slots: createEmoteSlots(),
  t: 0,
  seen: new Set(),
  lastNearId: null,
  mienGreeted: false,
  nextMienIdle: 10,
  nextSweat: 6,
});

const active = (e: Emote | null, t: number) => !!e && t - e.at < e.dur;

/** Gọi từ sự kiện (nhặt đồ, độc thoại...) — dùng đồng hồ khung hình gần nhất */
export function emoteNow(d: EmoteDirector, who: keyof EmoteSlots, kind: EmoteKind) {
  showEmote(d.slots, who, kind, d.t);
}

export interface EmoteFrameInput {
  t: number;
  /** id vật thể gần nhất trong tầm tương tác (null nếu không có) */
  nearId: string | null;
  /** vật thể đó đã xem xong chưa */
  nearDone: boolean;
  sanity: number;
  moving: boolean;
  /** khoảng cách An → Miên (null nếu màn này không có Miên) */
  distToMien: number | null;
  /** bong bóng Miên khi An lại gần */
  mienGreet?: EmoteKind;
  /** bong bóng Miên thỉnh thoảng hiện khi An ở xa (null = không) */
  mienIdle?: EmoteKind | null;
}

/** Gọi mỗi khung hình */
export function updateEmotes(d: EmoteDirector, o: EmoteFrameInput) {
  const t = o.t;
  d.t = t;
  // An tò mò khi lần đầu lại gần một đồ vật chưa xem
  if (o.nearId !== d.lastNearId) {
    d.lastNearId = o.nearId;
    if (o.nearId && o.nearId !== 'mien' && !o.nearDone && !d.seen.has(o.nearId)) {
      d.seen.add(o.nearId);
      showEmote(d.slots, 'an', 'question', t);
    }
  }
  if (o.distToMien !== null) {
    // Miên phản ứng khi An lại gần; đi xa hẳn thì lần sau lại phản ứng
    if (o.distToMien < 85 && !d.mienGreeted) {
      d.mienGreeted = true;
      if (o.mienGreet) showEmote(d.slots, 'mien', o.mienGreet, t);
    } else if (o.distToMien > 170) {
      d.mienGreeted = false;
    }
    // Thỉnh thoảng Miên tự có bong bóng riêng khi An đang ở xa
    if (o.mienIdle && t >= d.nextMienIdle && o.distToMien > 120 && !active(d.slots.mien, t)) {
      showEmote(d.slots, 'mien', o.mienIdle, t);
      d.nextMienIdle = t + 14 + Math.random() * 8;
    }
  }
  // Sanity thấp: đứng yên một lúc là toát mồ hôi
  if (o.sanity <= 35 && !o.moving && t >= d.nextSweat && !active(d.slots.an, t)) {
    showEmote(d.slots, 'an', 'sweat', t);
    d.nextSweat = t + 9 + Math.random() * 6;
  }
}

/** Vẽ bong bóng của cả hai nhân vật (Miên có thể vắng mặt) */
export function drawEmotes(
  ctx: CanvasRenderingContext2D,
  d: EmoteDirector,
  an: { cx: number; headY: number },
  mien?: { cx: number; headY: number } | null,
) {
  drawEmote(ctx, d.slots.an, d.t, an.cx, an.headY);
  if (mien) drawEmote(ctx, d.slots.mien, d.t, mien.cx, mien.headY);
}

const r = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

/** Ảnh 7x7 của từng biểu tượng (ký tự '#' = tô màu) */
const ICONS: Record<Exclude<EmoteKind, 'sweat' | 'dots'>, { color: string; rows: string[] }> = {
  exclaim: { color: '#dc2626', rows: ['..##...', '..##...', '..##...', '..##...', '.......', '..##...', '..##...'] },
  question: { color: '#2563eb', rows: ['.####..', '##..##.', '....##.', '...##..', '..##...', '.......', '..##...'] },
  heart: { color: '#ec4899', rows: ['.......', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] },
  note: { color: '#7c3aed', rows: ['...####', '...#..#', '...#..#', '...#..#', '.###.##', '####.##', '.##....'] },
};

/**
 * Vẽ bong bóng của một nhân vật; cx = tâm ngang của đầu, headY = đỉnh đầu (toạ độ canvas).
 * Bong bóng nảy lên khi xuất hiện, lơ lửng nhẹ, rồi mờ dần ở cuối.
 */
export function drawEmote(ctx: CanvasRenderingContext2D, e: Emote | null, t: number, cx: number, headY: number) {
  if (!e) return;
  const age = t - e.at;
  if (age < 0 || age > e.dur) return;
  const pop = age < 0.18 ? Math.sin((age / 0.18) * Math.PI) * 3 : 0;
  const float = Math.sin(age * 4) * 0.8;
  const alpha = Math.min(1, (e.dur - age) / 0.3, age / 0.06);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);

  if (e.kind === 'sweat') {
    // Giọt mồ hôi chảy xuống bên thái dương, không có bong bóng
    const x = Math.round(cx + 9);
    const y = Math.round(headY + 4 + Math.min(age, 1) * 5);
    r(ctx, x + 1, y, 1, 1, '#bfdbfe');
    r(ctx, x, y + 1, 3, 2, '#60a5fa');
    r(ctx, x + 1, y + 3, 1, 1, '#2563eb');
    r(ctx, x + 1, y + 1, 1, 1, '#eff6ff');
    ctx.restore();
    return;
  }

  // Khung bong bóng 13x11 + đuôi nhọn chỉ xuống đầu
  const w = 13;
  const h = 11;
  const bx = Math.round(cx - w / 2);
  const by = Math.round(headY - h - 6 - pop + float);
  r(ctx, bx + 1, by, w - 2, 1, '#18181b');
  r(ctx, bx + 1, by + h - 1, w - 2, 1, '#18181b');
  r(ctx, bx, by + 1, 1, h - 2, '#18181b');
  r(ctx, bx + w - 1, by + 1, 1, h - 2, '#18181b');
  r(ctx, bx + 1, by + 1, w - 2, h - 2, '#fafafa');
  r(ctx, bx + 1, by + h - 2, w - 2, 1, '#d4d4d8');
  // Đuôi
  r(ctx, bx + 5, by + h - 1, 3, 1, '#fafafa');
  r(ctx, bx + 5, by + h, 1, 1, '#18181b');
  r(ctx, bx + 6, by + h, 1, 1, '#fafafa');
  r(ctx, bx + 7, by + h, 1, 1, '#18181b');
  r(ctx, bx + 6, by + h + 1, 1, 1, '#18181b');

  if (e.kind === 'dots') {
    // Ba chấm hiện lần lượt
    const n = Math.min(3, Math.floor(age / 0.28) + 1);
    for (let i = 0; i < n; i++) r(ctx, bx + 3 + i * 3, by + 6, 2, 2, '#3f3f46');
  } else {
    const icon = ICONS[e.kind];
    // Tim đập nhẹ: thêm viền sáng ở nhịp đập
    icon.rows.forEach((row, iy) => {
      for (let ix = 0; ix < row.length; ix++) if (row[ix] === '#') r(ctx, bx + 3 + ix, by + 2 + iy, 1, 1, icon.color);
    });
    if (e.kind === 'heart' && Math.sin(age * 9) > 0.4) r(ctx, bx + 5, by + 4, 1, 1, '#fce7f3');
  }
  ctx.restore();
}
