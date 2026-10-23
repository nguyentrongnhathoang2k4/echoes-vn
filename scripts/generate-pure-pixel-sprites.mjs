import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

// Kích thước chuẩn: mỗi frame 32x48 pixel art, scale lên canvas 64x96 cho sắc nét
const PIXEL_W = 32;
const PIXEL_H = 48;
const SCALE = 2; // mỗi pixel art = 2x2 px canvas -> 64x96 px mỗi frame
const FRAME_W = PIXEL_W * SCALE; // 64px
const FRAME_H = PIXEL_H * SCALE; // 96px

const COLS = 3; // 3 frames: Idle, Step 1, Step 2
const ROWS = 3; // 3 hướng: 0 = Down, 1 = Up, 2 = Right

/**
 * Helper vẽ 1 khối pixel art lên canvas
 */
function drawP(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
}

// ============================================================================
// BẢNG VẼ PIXEL ART CHO AN (The Recluse - Chàng lập trình viên mệt mỏi)
// ============================================================================
function drawAnFrame(ctx, frame, dir, ox, oy) {
  // ox, oy là toạ độ bắt đầu của frame (theo đơn vị pixel art 1x1)
  const p = (x, y, w, h, c) => drawP(ctx, ox + x, oy + y, w, h, c);

  // Bảng màu của An
  const C = {
    skin: '#e0c8b1',
    skinShadow: '#c4a68f',
    eye: '#2b232e',
    eyeBag: '#876c76', // quầng thâm mắt
    hair: '#1e1c24',
    hairLight: '#322f3b',
    hairDark: '#121117',
    hoodie: '#23232b',
    hoodieLight: '#383842',
    hoodieDark: '#16161c',
    string: '#a3a3af',
    pants: '#242a38',
    pantsDark: '#171c26',
    shoe: '#1c1b22',
    sole: '#e4e4eb',
  };

  const walkOffset = frame === 0 ? 0 : (frame === 1 ? -1 : 1);
  const legSwing = frame === 0 ? 0 : (frame === 1 ? 2 : -2);

  if (dir === 'down') {
    // ---- HƯỚNG TRỰC DIỆN (FRONT / DOWN) ----
    // 1. Tóc sau
    p(10, 8, 12, 10, C.hairDark);

    // 2. Chân & Giày
    if (frame === 0) {
      // Đứng yên
      p(11, 37, 4, 7, C.pants);
      p(17, 37, 4, 7, C.pants);
      p(10, 44, 5, 4, C.shoe);
      p(10, 46, 5, 2, C.sole);
      p(17, 44, 5, 4, C.shoe);
      p(17, 46, 5, 2, C.sole);
    } else if (frame === 1) {
      // Bước chân trái
      p(11, 36, 4, 6, C.pants);
      p(17, 37, 4, 8, C.pantsDark);
      p(10, 42, 5, 4, C.shoe);
      p(10, 44, 5, 2, C.sole);
      p(17, 45, 5, 3, C.shoe);
      p(17, 46, 5, 2, C.sole);
    } else {
      // Bước chân phải
      p(11, 37, 4, 8, C.pantsDark);
      p(17, 36, 4, 6, C.pants);
      p(10, 45, 5, 3, C.shoe);
      p(10, 46, 5, 2, C.sole);
      p(17, 42, 5, 4, C.shoe);
      p(17, 44, 5, 2, C.sole);
    }

    // 3. Áo Hoodie
    const bob = frame === 0 ? 0 : 1;
    p(9, 23 + bob, 14, 14, C.hoodie);
    p(8, 24 + bob, 2, 10, C.hoodieDark); // tay trái
    p(22, 24 + bob, 2, 10, C.hoodieDark); // tay phải
    p(8, 33 + bob, 2, 3, C.skin); // bàn tay trái
    p(22, 33 + bob, 2, 3, C.skin); // bàn tay phải
    // Túi áo kangaroo & nếp gấp
    p(12, 30 + bob, 8, 5, C.hoodieDark);
    p(13, 29 + bob, 6, 1, C.hoodieLight);
    // Dây rút hoodie
    p(13, 24 + bob, 1, 4, C.string);
    p(18, 24 + bob, 1, 4, C.string);

    // 4. Cổ & Mặt
    p(13, 20 + bob, 6, 3, C.skinShadow);
    p(10, 11 + bob, 12, 10, C.skin);
    // Quầng thâm mắt vì thức khuya code
    p(11, 16 + bob, 4, 2, C.eyeBag);
    p(17, 16 + bob, 4, 2, C.eyeBag);
    // Mắt mệt mỏi
    p(12, 15 + bob, 2, 2, C.eye);
    p(18, 15 + bob, 2, 2, C.eye);
    // Miệng trầm ngâm
    p(14, 19 + bob, 4, 1, C.skinShadow);

    // 5. Tóc đen xù bồng bềnh
    p(9, 6 + bob, 14, 6, C.hair);
    p(8, 9 + bob, 4, 6, C.hair);
    p(20, 9 + bob, 4, 6, C.hair);
    p(10, 4 + bob, 12, 3, C.hairLight);
    // Các lọn tóc xù che trán
    p(9, 10 + bob, 3, 4, C.hair);
    p(13, 10 + bob, 3, 5, C.hair);
    p(17, 10 + bob, 3, 4, C.hair);
    p(20, 10 + bob, 3, 3, C.hair);
  } else if (dir === 'up') {
    // ---- HƯỚNG SAU LƯNG (BACK / UP) ----
    const bob = frame === 0 ? 0 : 1;
    // Chân & Giày
    if (frame === 0) {
      p(11, 37, 4, 7, C.pants);
      p(17, 37, 4, 7, C.pants);
      p(11, 44, 4, 4, C.shoe);
      p(17, 44, 4, 4, C.shoe);
    } else if (frame === 1) {
      p(11, 36, 4, 6, C.pants);
      p(17, 37, 4, 8, C.pantsDark);
      p(11, 42, 4, 4, C.shoe);
      p(17, 45, 4, 3, C.shoe);
    } else {
      p(11, 37, 4, 8, C.pantsDark);
      p(17, 36, 4, 6, C.pants);
      p(11, 45, 4, 3, C.shoe);
      p(17, 42, 4, 4, C.shoe);
    }

    // Áo Hoodie lưng + Mũ trùm sau gáy
    p(9, 23 + bob, 14, 14, C.hoodie);
    p(8, 24 + bob, 2, 10, C.hoodieDark);
    p(22, 24 + bob, 2, 10, C.hoodieDark);
    // Mũ áo sau lưng hình tam giác
    p(11, 22 + bob, 10, 6, C.hoodieDark);
    p(13, 27 + bob, 6, 3, C.hoodieDark);
    p(12, 23 + bob, 8, 4, C.hoodieLight);

    // Đầu & Tóc sau gáy
    p(8, 6 + bob, 16, 14, C.hair);
    p(9, 4 + bob, 14, 4, C.hairLight);
    p(7, 10 + bob, 3, 7, C.hair);
    p(22, 10 + bob, 3, 7, C.hair);
    p(11, 18 + bob, 10, 3, C.hairDark);
  } else {
    // ---- HƯỚNG NGHIÊNG BÊN PHẢI (SIDE / RIGHT) ----
    const bob = frame === 0 ? 0 : 1;
    // Chân bước ngang
    if (frame === 0) {
      p(13, 37, 5, 7, C.pants);
      p(13, 44, 7, 4, C.shoe);
      p(13, 46, 7, 2, C.sole);
    } else if (frame === 1) {
      // Chân trước duỗi, chân sau co
      p(16, 37, 4, 7, C.pants);
      p(17, 44, 6, 3, C.shoe);
      p(17, 45, 6, 2, C.sole);
      p(10, 37, 4, 6, C.pantsDark);
      p(9, 42, 6, 3, C.shoe);
      p(9, 43, 6, 2, C.sole);
    } else {
      // Đổi chân
      p(10, 37, 4, 7, C.pants);
      p(9, 44, 6, 3, C.shoe);
      p(9, 45, 6, 2, C.sole);
      p(16, 37, 4, 6, C.pantsDark);
      p(17, 42, 6, 3, C.shoe);
      p(17, 43, 6, 2, C.sole);
    }

    // Thân nghiêng
    p(11, 23 + bob, 10, 14, C.hoodie);
    p(10, 24 + bob, 3, 10, C.hoodieDark); // tay đằng sau
    p(14, 25 + bob, 3, 9, C.hoodieLight); // tay đằng trước
    p(15, 33 + bob, 2, 2, C.skin); // bàn tay
    p(10, 22 + bob, 4, 5, C.hoodieDark); // mũ sau

    // Mặt nghiêng
    p(13, 11 + bob, 9, 10, C.skin);
    p(19, 15 + bob, 3, 2, C.eyeBag);
    p(19, 14 + bob, 2, 2, C.eye);
    p(20, 18 + bob, 2, 1, C.skinShadow);

    // Tóc nghiêng
    p(9, 5 + bob, 12, 7, C.hair);
    p(8, 8 + bob, 4, 10, C.hairDark);
    p(10, 4 + bob, 10, 3, C.hairLight);
    p(17, 8 + bob, 4, 6, C.hair);
    p(20, 11 + bob, 2, 3, C.hair);
  }
}

// ============================================================================
// BẢNG VẼ PIXEL ART CHO MIÊN (The Mirage / AURA Hologram)
// ============================================================================
function drawMienFrame(ctx, frame, dir, ox, oy) {
  const p = (x, y, w, h, c) => drawP(ctx, ox + x, oy + y, w, h, c);

  // Bảng màu của Miên
  const C = {
    skin: '#fde7df',
    skinShadow: '#eab8a9',
    eye: '#6d28d9',      // Mắt tím anime
    eyeLight: '#c084fc',
    hair: '#c05299',     // Tóc hồng tím
    hairLight: '#e879f9',
    hairDark: '#932d6d',
    sweater: '#d946ef',  // Áo len magenta
    sweaterStripe: '#fae8ff', // Sọc áo hồng trắng nhạt
    sweaterDark: '#a21caf',
    skirt: '#2e1065',    // Váy tím than
    skirtLight: '#4c1d95',
    sock: '#f3e8ff',
    shoe: '#581c87',
  };

  if (dir === 'down') {
    // ---- HƯỚNG TRỰC DIỆN (FRONT / DOWN) ----
    const bob = frame === 0 ? 0 : 1;

    // 1. Tóc sau xõa ngang vai
    p(8, 12 + bob, 16, 12, C.hairDark);

    // 2. Chân & Giày
    if (frame === 0) {
      p(12, 36, 3, 8, C.skin);
      p(17, 36, 3, 8, C.skin);
      p(11, 43, 4, 5, C.shoe);
      p(17, 43, 4, 5, C.shoe);
    } else if (frame === 1) {
      p(12, 35, 3, 7, C.skin);
      p(17, 36, 3, 9, C.skinShadow);
      p(11, 41, 4, 5, C.shoe);
      p(17, 44, 4, 4, C.shoe);
    } else {
      p(12, 36, 3, 9, C.skinShadow);
      p(17, 35, 3, 7, C.skin);
      p(11, 44, 4, 4, C.shoe);
      p(17, 41, 4, 5, C.shoe);
    }

    // 3. Váy ngắn xếp ly
    p(10, 31 + bob, 12, 6, C.skirt);
    p(9, 34 + bob, 14, 3, C.skirtLight);

    // 4. Áo len kẻ sọc
    p(10, 21 + bob, 12, 11, C.sweater);
    p(9, 22 + bob, 2, 8, C.sweaterDark);  // tay áo trái
    p(21, 22 + bob, 2, 8, C.sweaterDark); // tay áo phải
    p(9, 30 + bob, 2, 2, C.skin);         // tay
    p(21, 30 + bob, 2, 2, C.skin);
    // Sọc đặc trưng trên áo len
    p(10, 25 + bob, 12, 3, C.sweaterStripe);

    // 5. Khuôn mặt thanh tú
    p(13, 19 + bob, 6, 2, C.skinShadow);
    p(10, 11 + bob, 12, 9, C.skin);
    // Má hồng nhẹ
    p(10, 17 + bob, 2, 1, '#f472b6');
    p(20, 17 + bob, 2, 1, '#f472b6');
    // Mắt to tròn màu tím
    p(11, 14 + bob, 3, 3, C.eye);
    p(11, 14 + bob, 1, 1, C.eyeLight);
    p(18, 14 + bob, 3, 3, C.eye);
    p(18, 14 + bob, 1, 1, C.eyeLight);
    // Miệng cười mỉm bí ẩn
    p(15, 18 + bob, 2, 1, C.skinShadow);

    // 6. Tóc mái ngố + hai lọn tóc ôm má
    p(9, 6 + bob, 14, 6, C.hair);
    p(10, 4 + bob, 12, 3, C.hairLight);
    p(8, 11 + bob, 3, 9, C.hair);
    p(21, 11 + bob, 3, 9, C.hair);
    p(10, 10 + bob, 12, 3, C.hair);
    p(14, 11 + bob, 2, 2, C.hairDark); // rẽ ngôi nhẹ
  } else if (dir === 'up') {
    // ---- HƯỚNG SAU LƯNG (BACK / UP) ----
    const bob = frame === 0 ? 0 : 1;
    // Chân
    if (frame === 0) {
      p(12, 36, 3, 8, C.skin);
      p(17, 36, 3, 8, C.skin);
      p(12, 43, 3, 5, C.shoe);
      p(17, 43, 3, 5, C.shoe);
    } else if (frame === 1) {
      p(12, 35, 3, 7, C.skin);
      p(17, 36, 3, 9, C.skinShadow);
      p(12, 41, 3, 5, C.shoe);
      p(17, 44, 3, 4, C.shoe);
    } else {
      p(12, 36, 3, 9, C.skinShadow);
      p(17, 35, 3, 7, C.skin);
      p(12, 44, 3, 4, C.shoe);
      p(17, 41, 3, 5, C.shoe);
    }

    // Váy sau
    p(10, 31 + bob, 12, 6, C.skirt);
    p(9, 34 + bob, 14, 3, C.skirtLight);

    // Áo len sau lưng
    p(10, 21 + bob, 12, 11, C.sweater);
    p(9, 22 + bob, 2, 8, C.sweaterDark);
    p(21, 22 + bob, 2, 8, C.sweaterDark);
    p(10, 25 + bob, 12, 3, C.sweaterStripe);

    // Tóc bồng bềnh phủ kín sau lưng
    p(8, 6 + bob, 16, 17, C.hair);
    p(9, 4 + bob, 14, 4, C.hairLight);
    p(7, 12 + bob, 3, 10, C.hairDark);
    p(22, 12 + bob, 3, 10, C.hairDark);
  } else {
    // ---- HƯỚNG NGHIÊNG (SIDE / RIGHT) ----
    const bob = frame === 0 ? 0 : 1;
    // Chân bước ngang
    if (frame === 0) {
      p(14, 36, 4, 8, C.skin);
      p(13, 43, 6, 5, C.shoe);
    } else if (frame === 1) {
      p(16, 36, 3, 8, C.skin);
      p(16, 43, 5, 4, C.shoe);
      p(11, 36, 3, 7, C.skinShadow);
      p(10, 41, 5, 4, C.shoe);
    } else {
      p(11, 36, 3, 8, C.skin);
      p(10, 43, 5, 4, C.shoe);
      p(16, 36, 3, 7, C.skinShadow);
      p(16, 41, 5, 4, C.shoe);
    }

    // Váy nghiêng
    p(11, 31 + bob, 10, 6, C.skirt);
    p(10, 34 + bob, 11, 3, C.skirtLight);

    // Áo len nghiêng
    p(12, 21 + bob, 9, 11, C.sweater);
    p(11, 22 + bob, 3, 8, C.sweaterDark);
    p(14, 23 + bob, 3, 7, C.sweater);
    p(15, 30 + bob, 2, 2, C.skin);
    p(12, 25 + bob, 9, 3, C.sweaterStripe);

    // Mặt nghiêng
    p(13, 11 + bob, 8, 9, C.skin);
    p(18, 14 + bob, 3, 3, C.eye);
    p(18, 14 + bob, 1, 1, C.eyeLight);
    p(19, 17 + bob, 2, 1, '#f472b6'); // má hồng
    p(19, 18 + bob, 1, 1, C.skinShadow);

    // Tóc nghiêng
    p(9, 6 + bob, 11, 8, C.hair);
    p(8, 10 + bob, 4, 13, C.hairDark);
    p(10, 4 + bob, 9, 3, C.hairLight);
    p(16, 9 + bob, 4, 7, C.hair);
  }
}

// ============================================================================
// XUẤT RA FILE PNG SPRITESHEET CHUẨN LƯỚI 3x3 CHO CẢ HAI NHÂN VẬT
// ============================================================================
async function generatePixelSpritesheet(characterName, drawFn, outputPath) {
  const canvas = createCanvas(FRAME_W * COLS, FRAME_H * ROWS);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const directions = ['down', 'up', 'right'];

  for (let r = 0; r < ROWS; r++) {
    const dir = directions[r];
    for (let c = 0; c < COLS; c++) {
      const ox = c * PIXEL_W;
      const oy = r * PIXEL_H;
      drawFn(ctx, c, dir, ox, oy);
    }
  }

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buf);
  console.log(`✨ Đã tạo Sprite Sheet Pixel Art thuần túy cho [${characterName}]: ${outputPath} (${FRAME_W * COLS}x${FRAME_H * ROWS}px)`);
}

async function main() {
  await generatePixelSpritesheet('AN', drawAnFrame, path.join('public', 'assets', 'an_spritesheet.png'));
  await generatePixelSpritesheet('MIÊN', drawMienFrame, path.join('public', 'assets', 'mien_spritesheet.png'));
}

main().catch(console.error);
