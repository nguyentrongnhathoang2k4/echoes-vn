# Echoes: 03:14 AM

*Dư âm lúc 3 giờ 14 phút sáng.*

Game phiêu lưu pixel-art kết hợp visual novel, chạy trên trình duyệt. Bạn vào vai **An**, một kỹ sư phần mềm 24 tuổi sống trong căn phòng trọ #314 ở một khu tập thể cũ. Đồng hồ trong phòng đứng yên ở 03:14. Ngoài trời mưa mãi không tạnh. Và **Miên** cứ chập chờn xuất hiện như một làn sóng nhiễu trên màn hình CRT.

Mọi thứ trong căn phòng đều quen thuộc, chỉ có điều gì đó không đúng.

## Lối chơi

- **Khám phá:** đi lại trong từng màn chơi, điều tra đồ vật, nhặt và kết hợp vật phẩm, giải mã khoá.
- **Visual novel:** lời thoại với nhiều lựa chọn. Một số lựa chọn để lại hậu quả ở các chương sau.
- **Sanity (Tỉnh táo):** hầu hết lựa chọn đều làm tăng hoặc giảm chỉ số này. Sanity quyết định kết cục nào còn mở ở cuối game. Về 0 thì tâm trí sụp đổ.
- **Minigame:** hộp nhạc, ảnh Polaroid, radio bắt sóng, máy sốc tim.
- **3 kết cục.** Hãy thử chơi lại với những lựa chọn khác.

## Điều khiển

| Phím | Tác dụng |
|---|---|
| `W` `A` `S` `D` / phím mũi tên | Di chuyển |
| `E` | Tương tác |
| `I` | Mở túi đồ |
| `Space` / `Enter` | Chạy tiếp lời thoại |
| `1` `2` `3` | Chọn nhanh lựa chọn trong lời thoại |
| `Esc` | Tạm dừng |

## Chạy trên máy

Cần **Node.js 20.9 trở lên**.

```bash
git clone https://github.com/nguyentrongnhathoang2k4/echoes-vn.git
cd echoes-vn
npm install
npm run dev
```

Mở http://localhost:3000. Tiến trình chơi được lưu tự động trong trình duyệt (localStorage).

Các lệnh khác:

| Lệnh | Tác dụng |
|---|---|
| `npm run build` | Build bản production |
| `npm run start` | Chạy bản đã build |
| `npm run lint` | Kiểm tra code bằng ESLint |
| `npx tsc --noEmit` | Kiểm tra kiểu TypeScript |

### Phím tắt cho nhà phát triển

Dùng để nhảy nhanh giữa các chương khi thử nghiệm:

| Phím | Tác dụng |
|---|---|
| `K` | Nhảy tới Màn 2. Bấm lần nữa để mở sẵn đủ manh mối |
| `L` | Nhảy tới Màn 3. Bấm lần nữa để mở sẵn đủ manh mối |
| `M` | Nhảy tới Màn 4 (trạm điều khiển, hồ sơ cuối và các kết cục). Bấm lần nữa để thử Ending S: Sanity 55%, có sẵn cờ đã đọc `Đồ_án_AURA` và đã nghe tin nhắn của mẹ |

## Công nghệ

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript, Tailwind CSS 4.
- Toàn bộ đồ hoạ màn chơi vẽ bằng **Canvas 2D**: pixel-art, ánh sáng động, mưa, chớp, bụi. Không dùng game engine.
- Âm thanh dùng **Web Audio API**. Nhạc nền và hiệu ứng được tổng hợp trực tiếp trong trình duyệt, hoặc lấy từ file của bạn (xem [public/audio/README.md](public/audio/README.md)).

## Cấu trúc thư mục

```
app/page.tsx                 Vòng đời game: chương, Sanity, lưu/tải, chuyển màn
src/data/story.json          Toàn bộ cốt truyện dạng đồ thị node (thoại, lựa chọn, rẽ nhánh)
src/types/vn.ts              Kiểu dữ liệu của node và lựa chọn
src/components/
  OverworldStage.tsx         Màn 1: Phòng trọ #314
  HallwayStage.tsx           Hành lang tầng 3
  SunsetStage.tsx            Màn 2: Thị trấn Hoàng Hôn
  PixelBleedStage.tsx        Màn 3: Pixel Bleed
  Chapter4Stage.tsx          Màn 4: Trạm điều khiển AURA-NODE-314 (đọc hồ sơ, webcam, chọn kết cục)
  VNStage.tsx                Khung visual novel (thoại, lựa chọn, đếm ngược)
  PortraitActor.tsx          Chân dung "sống": nhịp thở theo cảm xúc, cử chỉ, nhún khi nói
  minigames/                 Hộp nhạc, Polaroid, radio, máy sốc tim
  pixel/pixelKit.ts          Hàm vẽ pixel-art và HUD dùng chung
  pixel/spriteKit.ts         Render sprite, chu kỳ bước đi, hiệu ứng hologram
src/services/audioEngine.ts  Bộ máy âm thanh
public/assets/               Spritesheet và chân dung nhân vật
```

### Viết thêm cốt truyện

Mỗi node trong [src/data/story.json](src/data/story.json) là một đoạn thoại. Các trường hay dùng:

- `nextNodeId`: node kế tiếp (khi không có lựa chọn).
- `choices`: danh sách lựa chọn. Mỗi lựa chọn có `text`, `nextNodeId` và `sanityImpact` (bắt buộc).
  - `minSanity` / `maxSanity`: khoá lựa chọn theo Sanity.
  - `setFlag`: ghi một biến cốt truyện khi chọn. Biến được lưu xuyên suốt các chương.
  - `requiresFlag` / `forbidsFlag`: chỉ hiện, hoặc ẩn, lựa chọn khi đã có biến.
- `flagBranches`: tự rẽ nhánh theo biến cốt truyện.
- `timeoutSeconds` + `timeoutNodeId`: đếm ngược, hết giờ thì tự chuyển node.
- `anEmotion` / `mienEmotion`: biểu cảm lúc bắt đầu đoạn thoại.
- **Nhịp diễn trong lời thoại**: chèn `{a:...}` (An) hoặc `{m:...}` (Miên) vào giữa `text` để đổi biểu cảm hoặc làm cử chỉ đúng lúc chữ gõ tới đó. Dấu nhịp không hiện ra màn hình.
  - Biểu cảm: tên như trong `anEmotion` / `mienEmotion`. Đổi biểu cảm thì nhân vật tự làm một cử chỉ hợp với cảm xúc.
  - Cử chỉ: `nod` (gật), `shake` (lắc), `flinch` (giật lùi), `hop` (nảy lên), `sink` (chùng xuống), `lean` (nghiêng tới), `turn` (quay đi), `laugh` (cười rung), `sigh` (thở dài), `tremble` (run), `glitch` (nhiễu), `step` (bước tới), `tilt` (nghiêng đầu), `sob` (nấc).
  - Ghép bằng dấu phẩy: `Rồi cô cười, {m:warm_smile,laugh}nhỏ thôi.`

Kiểu dữ liệu đầy đủ nằm trong [src/types/vn.ts](src/types/vn.ts).

## Tài liệu thiết kế

> ⚠️ **Tiết lộ toàn bộ cốt truyện.** Nên chơi hết game trước khi đọc.

[story.md](story.md) ghi lại hồ sơ nhân vật, dòng thời gian chuẩn của câu chuyện, chi tiết từng màn, điều kiện của 3 kết cục và bảng cân bằng Sanity.
