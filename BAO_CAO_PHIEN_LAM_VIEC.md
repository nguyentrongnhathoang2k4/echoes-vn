# Báo cáo phiên làm việc — Echoes: 03:14 AM

**Phạm vi:** toàn bộ các yêu cầu trong đoạn chat này, từ sửa lỗi gameplay, đồng bộ UI tối giản, tới viết lại cutscene mở đầu và thoại Màn 1.

**Trạng thái chung:**
- `npx tsc --noEmit` pass.
- ESLint không có cảnh báo mới. Các lỗi còn lại có từ trước: `page.tsx` (setState trong effect, thiếu deps), `InventoryModal.tsx`, `StoryNode` không dùng ở `Chapter4Stage`, `isDoorKnocking` ở `OverworldStage`.
- **Chưa chạy thử trong trình duyệt.** Hình ảnh, âm thanh và nhịp thời gian cần chơi qua một lượt để xác nhận.
- **Chưa commit gì.** 28 tệp sửa, 6 tệp mới, 1 tệp xoá (xem mục cuối).

---

## 1. Sửa lỗi gameplay & chống spoil

| Việc | Kết quả |
|---|---|
| Khai thác Sanity | Hồi Sanity dương của mỗi node chỉ tính một lần (`sanityClaimedIds`, lưu cùng save); điểm trừ vẫn áp dụng mỗi lần. |
| Thứ tự phím Esc | Settings → Pause → lớp UI con đang mở (túi đồ, PIN, minigame…) → đóng hộp thoại → mở Pause. Lớp UI con đăng ký qua `useUiLayer`. |
| Màn 4 — 30 giây ân hạn | Đồng hồ dừng ở mốc ân hạn kèm thông báo "THỜI GIAN NGƯNG ĐỌNG" và tiếng rè định kỳ, để người chơi không tưởng game bị treo. |
| Ending M | Bỏ đi / đứng yên quá lâu ở mọi giai đoạn Màn 4 đều dẫn tới Ending M. |
| Thư mục AURA | Popup Notepad trên desktop máy tính phòng 314. |
| Spoil mã PIN | Bỏ các chỗ lộ thẳng mã; người chơi tự suy ra từ mặt dây chuyền hoặc tấm thiệp ngoài bảng tin. |

## 2. Đồng bộ giao diện theo phong cách tối giản

Nguyên tắc đã lưu vào bộ nhớ: **không gradient, không viền phát sáng, không emoji, menu chữ kiểu `MenuOption`.**

- **Menu:** Menu chính, Pause, Cài đặt, Thành tựu và màn Game over được làm lại: chữ căn giữa, lựa chọn đang chọn có gạch chân đỏ mảnh, bỏ mô tả bên phải. Thành phần dùng chung: `MenuOption`, `PauseMenu`.
- **Túi đồ:** sprite pixel 16×16 cho từng vật phẩm (`ItemSprite`), tên ngắn, điều khiển bằng bàn phím (mũi tên/WASD, Enter), mô tả ngắn gọn.
- **Emoji:** bỏ toàn bộ emoji trong game.
- **Hộp thoại VN:**
  - Khung chữ cố định chiều cao, chữ tương phản tốt hơn.
  - Bỏ huy hiệu ±Sanity trên lựa chọn và bỏ số % Sanity; thanh trên cùng chỉ còn vệt 2px hiện khi Sanity ≤ 70%.
  - Lựa chọn bị khoá nói bằng cảm xúc ("Mình chưa đủ bình tĩnh…" / "chưa đủ tuyệt vọng…" / "phải thật cân bằng…") thay vì ngưỡng %.

## 3. HUD trong màn chơi theo chuẩn Màn 1

Thành phần dùng chung mới là `src/components/StageHud.tsx`:
- **Phụ đề điện ảnh:** chữ serif nghiêng, không nền, không viền, có bóng chữ. Mờ sau khoảng 3 giây (câu dài được giữ tối đa 6 giây) hoặc khi An bước đi.
- **Đồng hồ:** `03:14 AM` ở góc trên trái. Màn 3 dùng bản đỏ nhấp nháy chập chờn.
- **Nhãn tương tác:** `[E] Tên` nổi ngay trên vật thể; vật đã xem xong thì không hiện.
- **Bộ đếm "Ký ức x/5":** chỉ sáng 3 giây khi có manh mối mới, và chờ đóng hộp thoại xong mới hiện.
- **Thanh phím tắt:** tự ẩn sau 3 giây, hiện lại khi đứng yên 10 giây hoặc rê chuột xuống đáy, nhường chỗ khi có phụ đề.

Áp dụng cho từng màn:

| Màn | Thay đổi chính |
|---|---|
| Màn 1 & Hành lang | Chuyển sang dùng `StageHud`; bỏ sprite Miên trong phòng; tên địa điểm hiện thoáng khi bước ra hành lang. |
| Màn 2 — Thị trấn Hoàng hôn | Bỏ thanh Sanity, tim, khung ngắm, khung độc thoại hồng, thanh đáy. Nhãn mini kèm bong bóng thoại pixel (`[E] Xe đạp`, `[E] Hộp nhạc`…); Miên là `[E] Miên` / `[E] Số phận`. |
| Màn 3 — Phòng cấp cứu | Chỉ còn đồng hồ đỏ chập chờn. Nhãn `[E] Máy sốc tim`, `[E] Balo ướt`… Tiếng phòng cấp cứu thành phụ đề đỏ nhạt, cách nhau 22 giây lặng; lời can ngăn của Miên cũng là phụ đề. Khi đủ điều kiện, nhãn `[E] Đối chất Miên` hiện thường trực. |
| Màn 4 — Trạm AURA | Góc trên chỉ còn một dòng `03:14 AM • NGẮT ĐIỆN VĨNH VIỄN TRONG: [mm:ss]`. Bỏ thanh bar đỏ, Sanity, nhiệt độ CPU (chỉ báo khi quá nhiệt). Terminal không viền phát sáng; danh sách tệp dạng `> [1] TÊN_TỆP [KHOÁ]`; webcam gọn, không chữ đè lên hình; lời Miên là phụ đề ở đáy màn hình. |

Tôi cũng xoá các hàm HUD vẽ trên canvas không còn dùng trong `pixelKit.ts` (`drawVitals`, `drawClock`, `drawTargetMarker`…).

## 4. Cutscene mở đầu hoạt hoạ (`IntroCutscene.tsx`)

Canvas pixel 320×180 chạy 60fps, toàn bộ âm thanh tự tổng hợp bằng Web Audio. Phiên bản cuối dùng **ẩn dụ ác mộng siêu thực**, không có tai nạn giao thông trực diện, để không lộ cốt truyện:

1. **Cuộc gọi đêm mưa:** cửa kính văn phòng, mưa rơi chéo, giọt nước chảy trên kính, điện thoại pixel với bộ đếm giây và sóng âm, chuông chờ 440+480Hz.
2. **Con đường vô tận:** góc nhìn tay lái xe máy, vạch đường cuộn liên tục. Cầu vượt không bao giờ tới gần, cột đèn nhoè rồi vỡ thành đốm sáng pixel trôi lơ lửng.
3. **Hư vô:**
   - Âm thanh bị bóp nghẹt như chìm xuống nước, giọng Miên rè rè như radio mất sóng.
   - Mặt đường nứt toác rồi tan vào khoảng đen; khung hình chao đảo, rơi tự do.
   - Nhiễu tivi một nhịp, rồi tắt phụt sang màn đen và im lặng tuyệt đối.
4. **Mở mắt:** tiếng thở dốc và quạt máy tính; mí mắt hé 30% với cảnh nhoè 10px, nhắm lại, rồi mở toang khi căn phòng rõ dần từng pixel.

**Điều khiển:** Space/Enter/Click tua qua giai đoạn cuộc gọi và con đường; đoạn hư vô không tua được. Khi đã tỉnh dậy, Space/Enter vào game. Esc bỏ qua toàn bộ.

Khi chiếu intro, nhạc nền chung chuyển sang `VOID` để cutscene tự kiểm soát âm thanh.

**Bảng hướng dẫn điều khiển** (`ControlsTutorial.tsx`) hiện một lần khi vừa vào phòng: WASD/mũi tên, E/Space, I/Tab, Esc. Tôi thêm phím **Tab** để mở và đóng túi đồ. Đóng bảng thì hiện dòng suy nghĩ đầu tiên của An (`node_pc_1`).

## 5. Viết lại thoại Màn 1 — "bình yên đời thường"

**Xoá 11 node** để Miên không còn xuất hiện ở Màn 1 và không còn hint bệnh viện:
- `node_mien_intro`, `node_mien_who`, `node_mien_time`, `node_mien_pain`;
- `node_pc_bot`, `node_pc_bot_reply`;
- `node_dream_climax`, `node_climax_truth`, `node_climax_accept`, `node_climax_wait`;
- `obj_phone_play` (tin nhắn thoại của bệnh viện).

**Viết lại theo yêu cầu:**
- `start`, `node_pc_1`, `node_pc_log`.
- Điện thoại: tin nhắn của mẹ, và tin mới của Miên lúc 23:15 (`obj_phone_mien`). Cờ `flag_heard_mom` mà Màn 4 cần vẫn hoạt động.
- Lọ thuốc an thần mua ở hiệu thuốc, bỏ nhãn bệnh viện.

**Đường chuyển Màn 2:** mở khoá 1705 → xem album bến An Yên → "Uống một viên thuốc an thần rồi lên giường ngủ tiếp…" → An chìm vào giấc ngủ → thẻ Chương II → `ch2_start` (An mở mắt giữa trời chiều).

**Viết lại thêm cho đồng bộ giọng:**
- Phòng 314: cửa sổ, gương, bàn trà, tiếng gõ cửa.
- Hành lang: phòng #312 của hàng xóm chạy deadline; #316 là phòng trống cho thuê, hồi năm nhất Miên ở đây; cửa sổ; cầu thang khoá lúc 23 giờ; gương cầu lồi; đồng hồ hết pin.

**Gỡ khỏi code và hình vẽ:**
- Bóng Miên thoáng qua ở Hành lang.
- Tiếng bước chân ướt bám sau lưng và vệt chân ướt trên sàn.
- Xích sắt trên cửa #312.
- Băng gạc dính máu trong gương cầu lồi.
- Tờ "TÌM NGƯỜI MẤT TÍCH" (thay bằng tờ "CÚP ĐIỆN 23H").
- Quầng sáng còn sót ở chỗ Miên từng đứng trong phòng.
- Cảnh chuyển `HavenTransition` (đã xoá file).

**Vật phẩm:** 7 mô tả mới trong `inventory.ts`; bỏ mọi nhãn `(+N Sanity)` trong mô tả và câu nhặt đồ.

**Cân bằng Sanity:** cuối Màn 1 trước cho tối đa +45, giờ là +30. Sanity được mang sang Màn 2, nên tỉ lệ ra các kết cục có thể lệch nhẹ.

**Chủ ý giữ lại:**
- Bad Ending 0 vẫn có tiếng bác sĩ cấp cứu. Đây là kết cục chết khi người chơi cố tình uống cả lọ thuốc.
- Ngày `[17/05]` trên thiệp bảng tin: đường gợi ý thứ hai cho mã PIN, đúng như ghi chú trên màn hình PIN.
- Ánh màn hình dưới khe cửa #312: giờ đã hợp lý vì phòng bên cũng chạy deadline.

## 6. Bản dịch tiếng Anh

Mọi câu mới hoặc đổi đều đã có bản dịch trong `strings_en.ts` và `story_en.json`. Khoá thừa đã dọn theo từng lần sửa. Hai khoá mà công cụ kiểm tra báo thiếu (`Chapter4Stage` có ký tự xuống dòng, `tx.ts`) là báo nhầm, có từ trước.

---

## Việc nên làm tiếp

1. **Chơi thử một lượt:** từ Menu → cutscene → bảng hướng dẫn → Màn 1 → Màn 4. Cần chú ý nhất:
   - âm lượng và nhịp của cutscene;
   - cỡ phụ đề trên màn hình thật;
   - vị trí nhãn `[E]` ở Màn 2 và 3;
   - bố cục Màn 4 ở màn hình nhỏ.
2. **Commit** khi đã ưng. Nên tách ít nhất thành:
   - UI tối giản;
   - HUD màn chơi;
   - cutscene mở đầu;
   - thoại Màn 1.
3. **Dọn lint cũ** nếu muốn: setState trong effect ở `page.tsx`, biến không dùng.

## Tệp thay đổi

**Mới**
- `src/components/StageHud.tsx`
- `src/components/ControlsTutorial.tsx`
- `src/components/MenuOption.tsx`
- `src/components/PauseMenu.tsx`
- `src/components/pixel/ItemSprite.tsx`
- `src/services/uiLayers.ts`

**Xoá**
- `src/components/HavenTransition.tsx`

**Sửa**
- `app/page.tsx`
- Thành phần trong `src/components/`:
  - `IntroCutscene`, `OverworldStage`, `HallwayStage`, `SunsetStage`, `PixelBleedStage`, `Chapter4Stage`;
  - `VNStage`, `InventoryModal`, `MainMenu`, `SettingsModal`, `AchievementsModal`;
  - `SynapticCollapseOverlay`, `DesktopScreen`, `FlashbackCutscene`, `QuietEnding`;
  - bốn minigame trong `minigames/`;
  - `pixel/pixelKit.ts`.
- `src/data/story.json`, `src/data/story_en.json`
- `src/locales/vi.ts`, `src/locales/en.ts`, `src/locales/strings_en.ts`
- `src/types/inventory.ts`
