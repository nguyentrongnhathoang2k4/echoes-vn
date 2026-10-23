import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

/**
 * Tách nền xám/xanh xám từ ảnh sprite bằng Color Distance / Floodfill hoặc Threshold
 */
async function removeBackground(inputPath, outputPath) {
  const img = await loadImage(inputPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  // Lấy màu nền mẫu từ các góc (thường là màu xám nền ô grid)
  // Trong ảnh gốc, nền là màu xám tối: khoảng R: 40-75, G: 50-85, B: 60-95
  // Ta kiểm tra khoảng cách màu (color distance) với màu nền
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Kiểm tra xem có phải màu nền xám tối / xám xanh của khung không
      // Màu nhân vật: tóc đen (r<30, g<30, b<30), áo đen, da (r>150), áo hồng (Miên r>180), tóc tím
      // Màu nền xám của khung thường nằm trong khoảng R: 45-75, G: 55-85, B: 65-95 và r ~ g ~ b (độ bão hòa thấp)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const diff = maxC - minC;

      // Nền là xám trung tính (diff nhỏ < 25) và nằm trong dải độ sáng 45 - 90
      const isGrayBg = diff < 20 && r >= 40 && r <= 95 && g >= 45 && g <= 100 && b >= 55 && b <= 110;
      
      // Hoặc màu nền ngoài viền đen kịt
      const isBlackBorder = r < 12 && g < 12 && b < 15;

      if (isGrayBg) {
        data[idx + 3] = 0; // Trong suốt hoàn toàn
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buf);
  console.log(`Đã tách nền thành công: ${outputPath}`);
}

async function run() {
  await removeBackground('public/assets/an_spritesheet.png', 'public/assets/an_spritesheet.png');
  await removeBackground('public/assets/mien_spritesheet.png', 'public/assets/mien_spritesheet.png');
}

run().catch(console.error);
