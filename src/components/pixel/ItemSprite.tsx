'use client';
import React from 'react';

// =====================================================================
// HÌNH VẬT PHẨM PIXEL 16x16 (túi đồ Màn 1)
// Mỗi sprite là 16 hàng x 16 ký tự; '.' = trong suốt, ký tự khác tra màu trong bảng màu riêng.
// Vẽ bằng SVG crispEdges nên phóng to bao nhiêu cũng giữ nét vuông.
// =====================================================================

interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

const BLANK = '................';

// Đĩa mềm 3.5": thân xanh, nắp trượt kim loại, nhãn trắng
const DISK_ROWS = [
  BLANK,
  '..kkkkkkkkkkkk..',
  '..kbbmmmmmmbbk..',
  '..kbbmmxxmmbbk..',
  '..kbbmmxxmmbbk..',
  '..kbbmmmmmmbbk..',
  '..kbbbbbbbbbbk..',
  '..kbllllllllbk..',
  '..kblrrrrrrlbk..',
  '..kbllllllllbk..',
  '..kblgggglllbk..',
  '..kbllllllllbk..',
  '..kbbbbbbbbbbk..',
  '..kkkkkkkkkkkk..',
  BLANK,
  BLANK,
];
const DISK_PALETTE = {
  k: '#64748b', b: '#1d4ed8', m: '#cbd5e1', x: '#334155',
  l: '#f8fafc', r: '#ef4444', g: '#94a3b8', e: '#e2e8f0', t: '#71717a',
};
// Đường nứt chạy dọc giữa đĩa (cột bị gãy ở từng hàng)
const CRACK = [8, 7, 8, 9, 8, 7, 8, 9, 8, 7, 8, 9, 8, 7, 8, 9];

/** Tách đĩa theo vết nứt: nửa trái / phải lệch ra 1 ô, mép gãy sáng màu; 'taped' = vết nứt đã dán băng dính */
function crackDisk(part: 'left' | 'right' | 'taped'): string[] {
  return DISK_ROWS.map((row, y) => {
    const c = CRACK[y];
    const cells = row.split('').map((ch, x) => {
      if (ch === '.') return ch;
      if (part === 'taped') return x === c && ch !== 'k' ? 't' : ch;
      if (part === 'left') return x > c ? '.' : x === c ? 'e' : ch;
      return x < c ? '.' : x === c ? 'e' : ch;
    });
    const s = cells.join('');
    if (part === 'left') return s.slice(1) + '.';
    if (part === 'right') return '.' + s.slice(0, -1);
    return s;
  });
}

const SPRITES: Record<string, Sprite> = {
  // Bật lửa Zippo: ngọn lửa, ống chắn gió đục lỗ, thân bạc
  lighter: {
    rows: [
      BLANK,
      '........y.......',
      '.......yy.......',
      '.......yoy......',
      '......yoroy.....',
      '.......oro......',
      '.....kkkkkk.....',
      '.....kgkgkk.....',
      '....kkkkkkkk....',
      '....kSssssak....',
      '....kSssssak....',
      '....kSssssak....',
      '....kSssssak....',
      '....kaaaaaak....',
      '....kkkkkkkk....',
      BLANK,
    ],
    palette: {
      y: '#fde047', o: '#fb923c', r: '#ef4444',
      k: '#52525b', g: '#18181b', s: '#a1a1aa', S: '#e4e4e7', a: '#71717a',
    },
  },
  // Dao rọc giấy: cán vàng, nút trượt, lưỡi vát
  box_cutter: {
    rows: [
      BLANK, BLANK, BLANK, BLANK, BLANK,
      '.kkkkkkkkk......',
      'kyyyyyyyyykkkkk.',
      'kyYYYYYYyykwwwwk',
      'kyyyygyyyykwwwk.',
      'kyyyyyyyyykkkk..',
      '.kkkkkkkkk......',
      BLANK, BLANK, BLANK, BLANK, BLANK,
    ],
    palette: { k: '#57534e', y: '#facc15', Y: '#fef08a', g: '#78716c', w: '#e5e7eb' },
  },
  // Cuộn băng dính đen nhìn chính diện
  electrical_tape: {
    rows: [
      BLANK,
      BLANK,
      '.....kkkkkk.....',
      '...kkddddddkk...',
      '..khhddddddddk..',
      '..khdkkkkkkddk..',
      '.khdk......kddk.',
      '.khdk......kddk.',
      '.kddk......kddk.',
      '.kddk......kddk.',
      '..kddkkkkkkddk..',
      '..kddddddddddk..',
      '...kkddddddkk...',
      '.....kkkkkkddd..',
      '............dd..',
      BLANK,
    ],
    palette: { k: '#71717a', d: '#3f3f46', h: '#a1a1aa' },
  },
  // Kẹp ghim giấy bằng thép
  paperclip: {
    rows: [
      BLANK,
      '.....sssss......',
      '....s.....s.....',
      '....s.sss.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.s.....',
      '....s.s.s.......',
      '....s...s.......',
      '.....sss........',
      BLANK,
      BLANK,
    ],
    palette: { s: '#d4d4d8' },
  },
  // Cốc cà phê nóng bốc khói
  coffee: {
    rows: [
      BLANK,
      '.....w..w.......',
      '......w..w......',
      '.....w..w.......',
      BLANK,
      '..kkkkkkkkkk....',
      '..kbbbbbbbbk....',
      '..kcccccccckkk..',
      '..kcCcccccck.k..',
      '..kcCcccccck.k..',
      '..kcccccccckkk..',
      '..kcccccccck....',
      '...kcccccck.....',
      '....kkkkkk......',
      BLANK,
      BLANK,
    ],
    palette: { w: '#a1a1aa', k: '#78716c', b: '#5b3a1e', c: '#e7e5e4', C: '#ffffff' },
  },
  // Ảnh Polaroid bạc màu: hoàng hôn trên sông, hai bóng người
  faded_photo: {
    rows: [
      BLANK,
      '..kkkkkkkkkkkk..',
      '..kwwwwwwwwwwk..',
      '..kwppppppppwk..',
      '..kwpppyypppwk..',
      '..kwoooooooowk..',
      '..kwooaooaoowk..',
      '..kwvaaavaaawk..',
      '..kwvvavvvavwk..',
      '..kwvvvvvvvvwk..',
      '..kwwwwwwwwwwk..',
      '..kwgggwwwwwwk..',
      '..kwwwwwwwwwwk..',
      '..kkkkkkkkkkkk..',
      BLANK,
      BLANK,
    ],
    palette: {
      k: '#78716c', w: '#e7e5e4', p: '#f9a8d4', y: '#fde68a', o: '#fdba74',
      a: '#44403c', v: '#a78bfa', g: '#a8a29e',
    },
  },
  disk_part_1: { rows: crackDisk('left'), palette: DISK_PALETTE },
  disk_part_2: { rows: crackDisk('right'), palette: DISK_PALETTE },
  aura_disk: { rows: crackDisk('taped'), palette: DISK_PALETTE },
  // Mặt dây chuyền bạc hình giọt lệ trên sợi dây chữ V
  miens_pendant: {
    rows: [
      '....c......c....',
      '.....c....c.....',
      '......c..c......',
      '.......cc.......',
      '......kssk......',
      '.......kk.......',
      '.......kk.......',
      '......kWak......',
      '.....kWssak.....',
      '....kWssssak....',
      '....kWsrrsak....',
      '....kssrrsak....',
      '....ksssssak....',
      '.....kssaak.....',
      '......kkkk......',
      BLANK,
    ],
    palette: { c: '#a1a1aa', k: '#52525b', W: '#ffffff', s: '#d4d4d8', a: '#a1a1aa', r: '#f9a8d4' },
  },
};

/** Hình pixel của vật phẩm; id lạ thì không vẽ gì */
export function ItemSprite({ id, size = 32 }: { id: string; size?: number }) {
  const sprite = SPRITES[id];
  if (!sprite) return null;
  const rects: React.ReactNode[] = [];
  sprite.rows.forEach((row, y) => {
    // Gộp các ô liền nhau cùng màu thành một dải để giảm số phần tử SVG
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = sprite.palette[ch];
      if (ch !== '.' && fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={fill} />);
      x = end;
    }
  });
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  );
}
