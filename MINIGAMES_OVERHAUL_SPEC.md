# TÀI LIỆU YÊU CẦU KỸ THUẬT: TÁI CẤU TRÚC TOÀN DIỆN 8 MINIGAME & CÂU ĐỐ
**Dự án:** Echoes: 03:14 AM (Echoes VN)  
**Mục tiêu:** Tinh giản triệt để thao tác cơ học rườm rà (tối đa 1–2 thao tác/minigame), chuyển hóa độ khó thành suy luận logic, lắng nghe âm thanh và giải mã ký ức tâm lý kinh dị.

---

## 🎯 I. NGUYÊN TẮC THIẾT KẾ DÀNH CHO AI / DEVELOPER (CORE DESIGN RULES)

1. **Quy tắc "1 Màn Hình – Tối đa 2 Thao Tác" (Zero Friction / Zero Chores):**
   - ❌ **CẤM:** Không chia nhỏ câu đố thành quy trình thủ công 4–5 bước (cạo ba-via, bôi gel, hơ lửa, uốn kẹp ghim, gạt lẫy chống ghi...). Người chơi phàn nàn đây là "độ khó giả tạo, lắt nhắt như làm việc vặt".
   - ✅ **ĐÚNG:** Mỗi minigame hiển thị trong 1 modal canvas/HTML trực quan duy nhất. Người chơi thao tác bằng 1 cơ chế thanh lịch (xoay góc, đổi vị trí, căn vạch sóng, gạt công tắc...).

2. **Độ Khó Trí Tuệ Thực Chất (Cognitive Depth & Aha! Moment):**
   - Lời giải không hiển thị sẵn qua mũi tên hay checklist hướng dẫn.
   - Lời giải được giấu trong **môi trường phòng trọ, lời thoại, bài hát, tờ lịch, đồ vật ký ức** hoặc dựa trên **quy luật logic toán học / vật lý / âm thanh**.

3. **Kinh Dị Tâm Lý Diegetic (Không Dùng Màu Tím Rẻ Tiền):**
   - ❌ **CẤM:** Không dùng màu tím neon (`#a855f7`), không làm bóng tím dưới chân nhân vật.
   - ✅ **ĐÚNG:** Sử dụng bóng tối tro tàn lạnh (`rgba(6, 7, 12)`), co thắt tầm nhìn (Tunnel Vision) khi Sanity tụt thấp, tiếng thở dốc, âm thanh tim đập trầm, méo tiếng audio low-pass filter.

4. **Kiến Trúc Kỹ Thuật (Architecture & Tech Stack):**
   - React 19 / Next.js 16 (Turbopack, Functional Components + Hooks).
   - TypeScript Strict (`npx tsc --noEmit` đạt 0 lỗi).
   - Hỗ trợ cả **Chuột** (Click/Drag/Wheel) lẫn **Bàn phím** (WASD, Mũi tên, Space, Enter, ESC để thoát an toàn).
   - AudioContext độc lập, tự động hủy dọn dẹp (cleanup) khi unmount, không để rò rỉ âm thanh (Zero Audio Bleed).

---

## 🧩 II. CHI TIẾT ĐẶC TẢ KỸ THUẬT 8 MINIGAME

---

### 1. PHỤC CHẾ ĐĨA MỀM AURA (CHAPTER 1 - PHÒNG 314)
* **File liên quan:** `src/components/InventoryModal.tsx` hoặc `src/components/minigames/DiskRepairMinigame.tsx`.
* **Bối cảnh:** Đĩa mềm $3.5$ inch chứa dữ liệu AURA bị gãy đôi thành 2 mảnh (`disk_part_1`, `disk_part_2`).
* **Vấn đề cũ:** Bắt cạo nhựa $\rightarrow$ xoay rãnh $\rightarrow$ hơ lửa $\rightarrow$ gạt lẫy chống ghi.
* **Cơ chế mới: Ghép Ma Trận Từ Tính (Magnetic Data Alignment)**
  - **Giao diện:** 1 mặt cắt đĩa từ tính tròn màu nâu sẫm chia làm 2 nửa. Trên mặt đĩa có các rãnh xước quang học và các cụm khối dữ liệu Hex bị cắt đứt.
  - **Thao tác duy nhất:** Kéo chuột hoặc lăn chuột để xoay đĩa phim bên trong tìm đúng góc xoay $0^\circ - 360^\circ$.
  - **Logic giải đố:** 
    - Khi xoay, 2 nửa rãnh nứt sẽ trượt qua nhau. Người chơi phải quan sát các ký tự code bị cắt đứt:
      $$\text{Nửa trái: } \texttt{AU} \quad + \quad \text{Nửa phải: } \texttt{RA\_314}$$
    - Góc đúng: Góc chính xác (ví dụ $134^\circ \pm 3^\circ$).
  - **Phản hồi:** Khi xoay đúng góc, âm thanh cơ khí kim loại *"CẠCH"* đanh gọn vang lên, các khối dữ liệu chớp xanh lá, đĩa mềm liền lại thành vật phẩm `aura_disk`. Xong ngay trong 1 màn hình!

---

### 2. BẺ THEN KHÓA HỘC BÀN MÁY TÍNH (CHAPTER 1 - PHÒNG 314)
* **File liên quan:** `src/components/minigames/DrawerLockMinigame.tsx` hoặc tích hợp vào `OverworldStage.tsx` (`pc_drawer`).
* **Bối cảnh:** Hộc bàn máy tính kẹt then khóa rỉ sét, bên trong chứa Nửa đĩa mềm #2.
* **Vấn đề cũ:** Bắt giữ lực tension + chọc từng chốt 1, 2, 3 kiểu Skyrim rườm rà.
* **Cơ chế mới: Lắng Nghe Ổ Bi Cơ Khí (Acoustic Tumbler)**
  - **Giao diện:** Mặt trước ổ khóa tròn bằng đồng cổ điển với 1 kim chỉ vạch ($0 - 100$).
  - **Thao tác duy nhất:** Dùng phím `A`/`D` hoặc rê chuột ngang để xoay kim chỉ vạch từ từ.
  - **Logic giải đố (Thính giác & Rung vi mô):**
    - Ổ khóa có 2 điểm then chốt: **Điểm A** (chiều thuận) và **Điểm B** (chiều nghịch).
    - Khi xoay qua các vạch thường: Tiếng kim loại cọ rè rè mờ đục.
    - Khi chạm đúng vạch then chốt: Phát ra tiếng kim loại rơi nhẹ *"tách..."*, kim rung giật nhẹ $1\text{px}$, và có tiếng thì thầm rất khẽ của Miên: *"Ngăn kéo này... đừng mở ra..."*.
    - Người chơi dừng lại ở Điểm A trong 1 giây, sau đó xoay ngược lại Điểm B để then khóa bật mở.

---

### 3. HỘP CẦU DAO ĐIỆN TẦNG 3 (CHAPTER 1 - HÀNH LANG)
* **File liên quan:** `src/components/minigames/FuseBoxMinigame.tsx` (gọi từ `HallwayStage.tsx` tại `fuse_box`).
* **Bối cảnh:** Phòng 314 bị mất điện, máy tính CRT không bật được. Cần cấp nguồn điện cho phòng.
* **Vấn đề cũ:** Chỉ bấm [E] 1 giây là xong hoặc bắt uốn kẹp ghim đo vôn kế rườm rà.
* **Cơ chế mới: Cân Bằng Mạch Logic Chập Chéo (Lights-Out Circuit Relay)**
  - **Giao diện:** Bảng điện sắt gồm 4 cần gạt cầu dao tương ứng:
    `[1: Đèn Hành Lang] - [2: Phòng 312] - [3: Phòng 314] - [4: Đèn Cầu Thang]`.
    Phía trên là 1 đèn LED tổng báo trạng thái: Đỏ (Chập mạch/Quá tải) - Xanh (Ổn định).
  - **Thao tác duy nhất:** Click chuột vào cần gạt để bật/tắt (Toggle Switch).
  - **Logic giải đố:**
    - Mạch điện bị rò rỉ chéo: Gạt công tắc $N$ sẽ tự động đảo trạng thái của công tắc $(N-1)$ và $(N+1)$.
    - **Mục tiêu thắng:** `[Đèn Hành Lang: ON]`, `[Phòng 314: ON]`, và `[Phòng 312: OFF]` (vì phòng 312 chứa máy chủ ngầm, nếu bật sẽ quá tải nhảy át ngay).
    - Người chơi phải tính toán chuỗi gạt trong 3–4 bước logic. Khi đúng, đèn hành lang sáng rực, phòng 314 có điện.

---

### 4. TERMINAL MÁY TÍNH CRT & MÃ PIN (CHAPTER 1 - PHÒNG 314)
* **File liên quan:** `src/components/DesktopScreen.tsx`.
* **Bối cảnh:** Máy tính khởi động Windows 98/2000 cổ, thư mục `ALBUM_KỶ_NIỆM` bị khóa PIN 4 số.
* **Vấn đề cũ:** Nhập 1705 đơn điệu vào một popup đơn giản.
* **Cơ chế mới: Suy Luận Mật Mã Từ Ký Ức (Memory Fragment Deduction)**
  - **Giao diện:** Màn hình CRT cong scanline cổ điển, cửa sổ nhập PIN gồm 4 ô số với bàn phím số retro.
  - **Logic giải đố (Không cung cấp đáp án lộ liễu, buộc người chơi phải liên kết manh mối):**
    - Trong thư mục `Đồ_án_AURA`, tệp nhật ký `nhat_ky.txt` viết:
      *"Em dặn mã mở album là ngày hai đứa ngồi ngắm hoàng hôn bên bờ sông... Không phải ngày gặp đầu tiên, mà là ngày chiếc mặt dây chuyền được khắc chữ."*
    - Người chơi liên kết với các manh mối thực tế trong phòng:
      + Tờ lịch treo tường: Tháng 5 khoanh tròn (`05`).
      + Mặt dây chuyền bạc rơi ngoài hành lang cửa phòng 316: Khắc số `17`.
      + Đồng hồ chết góc phòng: `03:14` (nếu nhập `0314` máy sẽ báo: *"Đây là giờ đồng hồ chết, không phải ngày kỷ niệm"*).
    - Mã chính xác: **`1705`**.
    - Nhập đúng: Màn hình CRT phát tiếng rít tụ điện, giải mã thành công mở ra ảnh chụp đôi và bản ghi sóng não.

---

### 5. HỘP ÂM NHẠC BẾN AN YÊN (CHAPTER 2 - HOÀNG HÔN)
* **File liên quan:** `src/components/minigames/MusicBoxMinigame.tsx`.
* **Bối cảnh:** Hộp nhạc gỗ trên ghế đá Bến An Yên bị trật nốt nhạc do va đập.
* **Vấn đề cũ:** Lắp 3 bánh răng A-B-C, vặn cót lắt nhắt.
* **Cơ chế mới: Khôi Phục Giai Điệu Valse (Melodic Sequence Restoration)**
  - **Giao diện:** Mặt trong hộp nhạc lộ ra trục gai quay tròn và **4 thanh gảy nốt kim loại bằng đồng** (Nốt 1: Đồ, Nốt 2: Mi, Nốt 3: Sol, Nốt 4: Đố cao).
  - **Thao tác duy nhất:** Click chọn 2 thanh nốt để **hoán đổi vị trí (Swap)** cho nhau. Có 1 nút `[CHẠY THỬ]` để nghe giai điệu.
  - **Logic giải đố:**
    - 2 trong 4 thanh nốt đang bị cắm lộn chỗ, làm giai điệu valse bị lỗi một nốt chói tai.
    - Người chơi nghe và hoán đổi thanh nốt về đúng trật tự cao độ (*Đồ $\rightarrow$ Mi $\rightarrow$ Sol $\rightarrow$ Đố*).
  - **Phản hồi Kinh dị Tâm lý:**
    - Khi xếp đúng, điệu Valse du dương vang lên trong veo 3 giây $\rightarrow$ rồi nốt Đố cao bất ngờ ngân dài, méo dần thành tiếng **BÍP phẳng lì (Flatline 880Hz)** của máy đo điện tim ICU. Nắp hộp bật mở bức thư tay định mệnh!

---

### 6. BỨC ẢNH POLAROID TRÊN BĂNG GHẾ (CHAPTER 2 - HOÀNG HÔN)
* **File liên quan:** `src/components/minigames/PolaroidMinigame.tsx`.
* **Bối cảnh:** Tấm ảnh chụp đôi dính bụi trên băng ghế đá bên bờ sông.
* **Vấn đề cũ:** Quét chuột lau bụi 60% rồi kéo thanh phơi sáng rời rạc.
* **Cơ chế mới: Tiêu Cự Giao Thoa Hai Thực Tại (Dual-Reality Focus)**
  - **Giao diện:** Tấm ảnh Polaroid vuông đặt trên bàn gỗ, bên cạnh có 1 núm xoay **"Tiêu Cự Ký Ức"**.
  - **Thao tác duy nhất:** Kéo hoặc xoay núm Tiêu Cự từ $0\% \rightarrow 100\%$.
  - **Logic & Cú sốc thị giác (Visual Horror Twist):**
    - Ở $0\% - 40\%$: Bức ảnh hiện khung cảnh Bến An Yên chiều tà ấm áp, Miên đang cười rạng rỡ.
    - Ở $60\% - 100\%$: Cảnh hoàng hôn tan rã, hiện rõ buồng bệnh nhân ICU lạnh lẽo, An đang nằm bất động quấn băng trắng khắp đầu.
    - **Điểm thắng cốt lõi (Vùng giao thoa $48\% - 52\%$):**
      + Người chơi phải dừng núm xoay ở đúng điểm giao thoa giữa hai thực tại.
      + Tại điểm này, cánh tay Miên bên hoàng hôn đang nắm lấy cánh tay An bên giường bệnh $\rightarrow$ làm lộ rõ **chiếc vòng nhựa trắng bệnh nhân trên cổ tay**:
        **`BV TRUNG HOÀ • 17/05/2004`**.
      + Tấm ảnh rung giật mạnh, kích hoạt đoạn hồi tưởng chân tướng.

---

### 7. ĐÀI BÁN DẪN ĐỒI THÔNG (CHAPTER 2 - HOÀNG HÔN)
* **File liên quan:** `src/components/minigames/RadioMinigame.tsx`.
* **Bối cảnh:** Chiếc đài radio cassette bên cạnh chiếc ô rơi dưới đồi thông mưa.
* **Vấn đề cũ:** Đổi băng tần AM/FM/SW, vặn thô, vặn tinh, giữ 5 giây rườm rà.
* **Cơ chế mới: Dò Sóng Giao Thoa Dạng Sóng (Waveform Resonance Tuning)**
  - **Giao diện:** Mặt máy radio với **1 Núm dò tần số lớn** và **1 Màn hình sóng Oscilloscope xanh lá**.
  - **Thao tác duy nhất:** Xoay núm tần số để căn chỉnh đường sóng tín hiệu (màu xanh lá) trùng khớp với đường sóng mục tiêu (màu vàng nhạt) in trên màn hình.
  - **Logic giải đố & Âm thanh đa tầng:**
    - Dò qua các tần số khác: Nghe tiếng mưa rào, tiếng rè rè white noise, tiếng nhạc tiền chiến méo mó.
    - Khi xoay tới gần tần số **`104.2 MHz`**: Sóng xanh bắt đầu dao động mạnh và hút dần vào sóng mục tiêu.
    - Khi 2 sóng đồng bộ $\ge 90\%$: Tiếng rè biến mất hoàn toàn, loa đài phát ra tiếng còi xe cấp cứu 115 réo inh ỏi cùng giọng Miên khóc nghẹn:
      *"Bác sĩ ơi... tim anh ấy ngừng đập rồi... Đừng tắt máy thở mà!"*.

---

### 8. MÁY SỐC TIM PHÒNG CẤP CỨU ICU (CHAPTER 3 - PIXEL BLEED)
* **File liên quan:** `src/components/minigames/DefibrillatorMinigame.tsx` (gọi từ `PixelBleedStage.tsx` tại `ch3_monitor`).
* **Bối cảnh:** Màn hình monitor ICU báo động rung thất nguy kịch, An giằng xé giữa sự sống và cái chết.
* **Vấn đề cũ:** Bôi gel, đặt 2 bản cực, giữ sạc, bấm cả 2 chuột... Quá nhiều thao tác nút bấm cơ học gây ức chế.
* **Cơ chế mới: Đồng Bộ Đỉnh Sóng R Sinh Tử (Synchronized Shock Rhythm)**
  - **Giao diện:** Màn hình Oscilloscope hiển thị đường sóng điện tim đang co giật hỗn loạn (Rung Thất - V-Fib). Máy tự động nạp năng lượng: tiếng rít tụ điện tăng dần âm lượng và cao độ (*Wheeeeeze... 200J READY*).
  - **Thao tác duy nhất:** Nhấn **PHÍM CÁCH (SPACEBAR)** hoặc **CLICK CHUỘT** đúng thời điểm.
  - **Logic giải đố (Timing & Căng thẳng nhịp tim):**
    - Sóng điện tim chạy liên tục từ phải sang trái. Thỉnh thoảng xuất hiện một đỉnh sóng co thắt cao vút (Đỉnh sóng R).
    - Người chơi phải căn bấm đúng tích tắc đỉnh sóng R đi qua **vạch đồng bộ màu đỏ (Sync Line)** ở giữa màn hình.
    - **Phạt trượt:** Nếu bấm trượt đỉnh sóng $\rightarrow$ Tim rơi vào vô tâm thu (Flatline 2 giây) kèm tiếng tút dài chói tai, phòng bệnh rung giật, giảm Sanity, sau đó máy tự nạp mức Joules cao hơn ($300\text{J} \rightarrow 360\text{J}$).
    - **Thành công:** Đủ 3 cú sốc trúng nhịp $\rightarrow$ Toàn màn hình lóe sáng trắng, tiếng còi cấp cứu chuyển thành nhịp xoang đều đặn 72 BPM, bức tường phòng bệnh viện vỡ vụn, mở ra cánh cổng sang Chương 4.

---

## 📋 III. BẢNG TỔNG HỢP SO SÁNH TRẢI NGHIỆM

| STT | Tên Minigame | Cơ chế CŨ (Bị chê nhiều bước) | Cơ chế MỚI (Tinh gọn, sâu sắc) | Thao tác chính |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Đĩa mềm AURA** | 4 bước: cạo bavia, hơ lửa, xoay, gạt lẫy | Xếp góc xoay khớp đoạn code `AURA_314` | Lăn chuột / Kéo chuột |
| **2** | **Hộc bàn máy tính** | Giữ lực tension + pick 3 chốt Skyrim | Lắng nghe tiếng "tách" cơ học & rung vi mô | Phím A/D hoặc Kéo chuột |
| **3** | **Cầu dao điện** | Uốn kẹp ghim, bọc băng keo, đo vôn kế | Giải đố mạch logic 4 công tắc chập chéo | Click chuột gạt công tắc |
| **4** | **Máy tính CRT** | Popup nhập số đơn điệu | Liên kết manh mối ngày sinh, hoa, phòng | Bàn phím số / Numpad |
| **5** | **Hộp âm nhạc** | Lắp 3 bánh răng A-B-C, gỡ kẹt lò xo | Đổi chỗ 2 thanh nốt khôi phục điệu Valse | Click đổi chỗ 2 nốt |
| **6** | **Ảnh Polaroid** | Lăn con lăn ép thuốc, lắc chuột, kéo slider | 1 Núm xoay: Lấy nét điểm giao thoa 2 thực tại | Kéo núm xoay Tiêu cự |
| **7** | **Đài bán dẫn** | Chọn AM/FM, vặn thô, vặn tinh, giữ 5s | 1 Núm tần số: Căn dạng sóng triệt tiêu nhiễu | Xoay núm Tần số |
| **8** | **Máy sốc tim** | Bôi gel, đặt 2 bản cực, giữ nút nạp sạc | 1 Nhịp bấm: Đồng bộ đỉnh sóng R sinh tử | Phím Space / Click chuột |

---

## 🛠️ IV. CHECKLIST TRIỂN KHAI CHO AI / DEVELOPER (IMPLEMENTATION STEPS)

- [ ] **Bước 1: Làm sạch Visual Sanity**
  - Trong `OverworldStage.tsx`: Xóa triệt để elip tím `rgba(168, 85, 247, 0.35)` dưới chân An và lớp ám tím `rgba(20, 3, 20, 0.9)`.
  - Thay bằng bóng đôi xám tro `rgba(0, 0, 0, 0.22)` lệch $2\text{px}$ và viền tối co rút tầm nhìn (Tunnel Vision) khi Sanity thấp.
- [ ] **Bước 2: Cập nhật Minigame Chapter 1**
  - Cập nhật logic `DesktopScreen.tsx`: Đảm bảo câu đố PIN gắn liền với manh mối tờ lịch/mặt dây chuyền/nhành hoa.
  - Cập nhật `HallwayStage.tsx`: Tích hợp logic câu đố mạch 4 công tắc cầu dao thay vì chỉ bấm [E] nhận diện vật phẩm.
- [ ] **Bước 3: Tinh giản Minigame Chapter 2**
  - Refactor `MusicBoxMinigame.tsx`: Bỏ bánh răng, chuyển thành hoán đổi 2 thanh nốt giai điệu Valse.
  - Refactor `PolaroidMinigame.tsx`: Bỏ thao tác chà lau chuột, thay bằng núm lấy nét tiêu cự giao thoa 2 thực tại.
  - Refactor `RadioMinigame.tsx`: Tinh giản thành 1 núm tần số đồng bộ dạng sóng oscilloscope.
- [ ] **Bước 4: Tinh giản Minigame Chapter 3**
  - Refactor `DefibrillatorMinigame.tsx`: Bỏ thao tác chuột phức tạp, tập trung vào 1 phím Space canh đúng đỉnh sóng R.
- [ ] **Bước 5: Kiểm thử toàn diện (Zero Regression & Type Check)**
  - Chạy `npx tsc --noEmit` đạt 0 lỗi.
  - Test chuyển cảnh giữa các chương, túi đồ, hội thoại và âm thanh BGM/SFX.
