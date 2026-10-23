import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

async function processPortrait(srcPath, outPath, options = {}) {
  const img = await loadImage(srcPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imgData.data;

  // Xóa rác chữ ở đỉnh đầu nếu có
  const cropTop = options.cropTop || 0;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];

      // Nếu nằm ở phần đỉnh đầu có rác chữ trắng
      if (y < cropTop) {
        d[idx + 3] = 0;
        continue;
      }

      // Kiểm tra màu nền xám tối (Dark gray background)
      // Màu xám: R ~ 30-58, G ~ 35-62, B ~ 40-68
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const diff = maxC - minC;

      const isBgColor = (diff <= 15) && (r >= 28 && r <= 62) && (g >= 33 && g <= 68) && (b >= 38 && b <= 75);

      if (isBgColor) {
        d[idx + 3] = 0; // Trong suốt
      }
    }
  }

  // Tẩy các pixel đơn lẻ trôi dạt (isolated noise cleanup)
  ctx.putImageData(imgData, 0, 0);

  // Resize về kích thước chuẩn đẹp cho VN Portrait (khoảng 320px chiều cao)
  const targetH = 360;
  const targetW = Math.round((img.width / img.height) * targetH);
  const finalCanvas = createCanvas(targetW, targetH);
  const fCtx = finalCanvas.getContext('2d');
  fCtx.imageSmoothingEnabled = false; // Giữ pixel art sắc nét
  fCtx.drawImage(canvas, 0, 0, targetW, targetH);

  const buf = finalCanvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buf);
  console.log(`✅ Đã xuất Portrait thành công: ${outPath} (${targetW}x${targetH}px)`);
}

async function main() {
  // An có chữ trắng ở trên đỉnh đầu (y < 25)
  await processPortrait(
    'C:/Users/HoangBuoito i/.gemini/antigravity/brain/2d99a402-4487-43da-b838-196f13b5c244/.user_uploaded/media_1792157080925_5ab12b4a.png',
    path.join('public', 'assets', 'an_portrait.png'),
    { cropTop: 24 }
  );

  // Miên
  await processPortrait(
    'C:/Users/HoangBuoito i/.gemini/antigravity/brain/2d99a402-4487-43da-b838-196f13b5c244/.user_uploaded/media_1792157068121_079bc709.png',
    path.join('public', 'assets', 'mien_portrait.png'),
    { cropTop: 5 }
  );
}

main().catch(console.error);
