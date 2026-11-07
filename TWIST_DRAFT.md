# BẢN NHÁP: TWIST "NGƯỜI CẦM LÁI" + MÀN SUY LUẬN + SỔ KÝ ỨC

> Trạng thái: **ĐÃ CHỐT VÀ ĐÃ LÀM** (khoá kết cục True khi thiếu `truth_driver`). Chi tiết cài đặt ghi trong `story.md`, Màn 4.
> Cập nhật: thêm lớp "Anh chết vì che cho em" và câu chốt *"Em hỏi anh có lạnh không. / Hỏi suốt hai mươi phút. / ...Anh không trả lời em."* (phương án A). Câu hỏi được cài ở Màn 1–3, lựa chọn True đổi thành *'Anh không lạnh.'*, biểu mẫu suy luận có 4 câu. Xem `story.md`.
> Đánh dấu ✅ / ❌ / ghi chú ngay cạnh từng mục rồi gửi lại.

---

## 0. Sự thật đêm 16/05 → 17/05 (canon mới, chỉ thêm, không phá canon cũ)

| Giờ | Chuyện xảy ra |
|---|---|
| ~22:30 16/05 | Ăn mừng nộp đồ án xong, về phòng 314. An kiệt sức sau ba đêm thức, **uống thuốc an thần** định ngủ luôn. Rồi nhớ ra kế hoạch cầu hôn đúng 00:00 ở bến An Yên, đòi đi ngay. |
| ~22:50 | Cổng dãy trọ khoá lúc 23:00 (canon `node_hallway_stairs`), phải ra trước giờ đó. Ở bậc cầu thang An gật gù. **Miên giật chùm chìa khoá xe**: "Anh ngồi sau đi, hôm nay em chở." Cô chưa vững tay lái, nói dối là "em chạy vững lắm". |
| ~00:00 | Giông tới. Hai người trú mưa ở mái hiên đầu cầu (đã có trong `obj_ch2_umbrella`). Lỡ giờ cầu hôn. |
| ~00:32 | Mưa ngớt, lên cầu vượt. Mặt đường trơn, **Miên mất lái, xe trượt ngã** (khớp `ch4_log1`: "trượt ngã", không có xe khác). |
| 03:14 | An tử vong. Miên chấn thương phần mềm. |
| Sau đó | **Ngoài đời ai cũng biết** Miên cầm lái: công an lập biên bản, mẹ An biết. Thứ Miên giấu là **bản sao An trong máy**: khi lỡ nạp bệnh án vào AURA, cô xoá đúng những dòng nhắc tới người cầm lái rồi mới khoá SECTOR_1705. |

**Động cơ mới của Miên:** cô giữ An trong máy sáu tháng không chỉ vì nhớ, mà vì **chưa từng dám nói với anh câu ấy**. Cả thế giới biết, chỉ riêng An trong máy là không. Mọi lời van xin "đừng nhớ lại" trước giờ đều là sợ hãi, không chỉ là thương.

**Vì sao An "thấy" được cảnh đêm mưa ở Màn 2 dù ký ức dừng ở sáng 16/05:** đó không phải ký ức của An. Đêm nào Miên cũng dán điện cực bước vào, **ký ức của chính cô rò vào thế giới của anh**. Cảnh trú mưa dưới chiếc ô là góc nhìn của Miên (nên "chùm chìa khoá trong tay ai đó" là tay cô). Lời giải thích này vá luôn một chỗ lệch có sẵn trong canon cũ.

**Mồi nhử (giữ nguyên):** cả game vẫn "hét" là An hôn mê/đã chết. Người chơi đoán trúng điều đó ở Màn 3 và hạ cảnh giác. Không có hình ảnh hay âm thanh nào gợi ý **ai cầm lái**.

---

## 1. Manh mối cài thêm (đổi câu có sẵn, gần như không thêm node mới)

| # | Node | Câu cũ | Câu mới (đề xuất) | Vai trò |
|---|---|---|---|---|
| M1 | `node_pills` (Màn 1) | "Từ hồi chạy deadline, đêm nào không có nó là trằn trọc tới sáng." | "Từ hồi chạy deadline, đêm nào không có nó là trằn trọc tới sáng. {a:faint_smile}Miên dặn đi dặn lại: uống thuốc rồi thì cấm cầm lái." | Thật |
| M2 | Bảng ghim bần trên bàn điện thoại (Màn 1) — **biến thành vật bấm được** | (trang trí) | "Bảng ghim lỉnh kỉnh. Lịch nộp đồ án, giấy note của Miên, và một **biên lai nộp phạt chạy quá tốc độ**: Trần Hoàng An, tháng 3. {a:faint_smile,laugh}Lần đó Miên dỗi cả tuần." | **Mồi nhử**: người chơi tưởng An là kẻ phóng ẩu, nên An lái |
| M3 | `ch2_truth_confront` (Màn 2) | "Hồi đó em nói dối là em không sợ độ cao, anh cũng nhận ra ngay." | "Hồi đó em nói dối là em chạy xe vững lắm, anh cũng nhận ra ngay." | Thật |
| M4 | `obj_ch2_umbrella` (Màn 2) | "...đợi mưa ngớt mới lên xe..." | "...đợi mưa ngớt mới lên xe... Tiếng chùm chìa khoá leng keng, móc con mèo sứt tai đung đưa trong tay ai đó." | Thật (mơ hồ) |
| M5 | `obj_ch3_chart` (Màn 3) | (thêm 1 dòng) | "[CƠ CHẾ CHẤN THƯƠNG: ████████ XE MÁY — DÒNG ĐÃ BỊ XOÁ]" (bệnh án thật có ghi người bệnh ngồi trước hay sau, còn "người điều khiển" là việc của công an nên không đặt vào bệnh án) | Thật |
| M6 | `obj_ch3_bag` (Màn 3, **bắt buộc**) | "áo mưa đôi rách làm hai" | "áo mưa đôi rách làm hai. Chùm chìa khoá của bạn vẫn nằm trong ngăn trước: chìa phòng, chìa cổng... **thiếu đúng chiếc chìa khoá xe**." | Thật |
| M9 | `ch4_log1` bệnh án (Màn 4, **bắt buộc**) | (thêm 1 dòng) | "> Xét nghiệm máu: phát hiện diazepam (thuốc an thần) liều điều trị." | Thật, trả lời câu 1 |
| M10 | `ch4_log1` bệnh án (Màn 4, **bắt buộc**) | (thêm 1 dòng) | "> Đính kèm: phiếu đo nồng độ cồn người điều khiển phương tiện (CSGT chuyển tới) — âm tính. Người ký: Ng. T. Miên." | Thật, trả lời câu 2. Kín đáo, người lướt sẽ bỏ qua |
| M7 | `ch4_log2` nhật ký Miên (Màn 4) | "Em ích kỷ quá phải không An?..." | "Có một chuyện em chưa dám nói với anh, kể cả ở trong này. Em ích kỷ quá phải không An?..." | Thật |
| M8 | `obj_phone_mom` (Màn 1, giữ nguyên) | "Đi đâu trời mưa thì mặc áo mưa vào nhé." | (giữ) | Nền cảm xúc |

> Chữ in đậm trong bảng chỉ để bạn dễ đọc. Trong game **không tô màu** câu manh mối, tránh lộ đáp án.

---

## 2. Sổ "Ký ức" (lớp 3)

- Mở bằng phím **[J]** (hoặc từ Túi đồ), ở mọi màn chơi.
- Đọc tới một câu manh mối thì câu đó **tự được ghi vào sổ**, góc màn hình hiện một dòng nhỏ "Đã ghi vào Ký ức" (không nói câu đó quan trọng thế nào).
- Sổ ghi đúng câu gốc kèm nơi thấy, **không kèm lời giải thích**.
- Lưu cùng tiến trình chơi.

Mục ghi vào sổ (cả thật lẫn mồi nhử, cùng một kiểu hiển thị):

| ID | Nội dung ghi | Từ đâu |
|---|---|---|
| K1 | "Lọ thuốc an thần: đêm nào không có nó là trằn trọc tới sáng." | `node_pills` |
| K2 | "Miên dặn: uống thuốc rồi thì cấm cầm lái." | `node_pills` |
| K3 | "Biên lai phạt chạy quá tốc độ — Trần Hoàng An, tháng 3." | Bảng ghim |
| K4 | "Đêm ấy trú mưa ở mái hiên đầu cầu. Chùm chìa khoá móc con mèo sứt tai." | `obj_ch2_umbrella` |
| K5 | "Miên: 'Hồi đó em nói dối là em chạy xe vững lắm.'" | `ch2_truth_confront` |
| K6 | "Bìa bệnh án: dòng cơ chế chấn thương đã bị xoá." | `obj_ch3_chart` |
| K7 | "Balo: chùm chìa khoá của mình thiếu đúng chiếc chìa xe." | `obj_ch3_bag` |
| K11 | "Bệnh án: máu có thuốc an thần." | `ch4_log1` |
| K12 | "Phiếu đo nồng độ cồn người điều khiển — người ký: Ng. T. Miên." | `ch4_log1` |
| K13 | "Radio: '...một vụ va chạm trên cầu vượt...'" (mồi nhử cho đáp án "người lạ tông") | `obj_ch2_umbrella` |
| K8 | "Nhật ký Miên: 'Có một chuyện em chưa dám nói với anh.'" | `ch4_log2` |
| K9 | "Mẹ nhắn: 'Đi đâu trời mưa thì mặc áo mưa vào nhé.'" | `obj_phone_mom` |
| K10 | "Bến An Yên — nhẫn khắc AN & MIÊN, định trao lúc 00:00." | `obj_ch3_bag` |

---

## 3. Màn suy luận "Ghép lại đêm 17/05" (lớp 1)

**Vị trí:** Màn 4, sau cuộc gọi webcam (`ch4_call_gentle` / `ch4_call_grief`), **trước** `ch4_climax_choice`.

**Giao diện:** biểu mẫu AURA cũ trên CRT, 3 câu có chỗ trống. Bấm vào chỗ trống để chọn đáp án, bên cạnh mở sổ Ký ức để tra. Điền đủ cả 3 mới bấm được [XÁC NHẬN].

```
[AURA • TÁI DỰNG PHIÊN 17/05 • CẦN CHỦ THỂ XÁC NHẬN]

1. Tối 16/05, [ ___________ ] đã uống thuốc an thần.
      An  /  Miên  /  Không ai cả

2. Người cầm lái trên cầu vượt là [ ___________ ].
      An  /  Miên  /  Một người lạ tông phải

3. Miên khoá ký ức đêm đó vì [ _______________________ ].
      sợ An đau  /  sợ An đòi rời khỏi máy  /  sợ An biết người cầm lái là cô
```

**Mỗi đáp án có ít nhất 2 manh mối nằm trên đường bắt buộc** (không phụ thuộc lựa chọn hay vật tuỳ chọn):

| Câu | Manh mối bắt buộc | Manh mối tuỳ chọn |
|---|---|---|
| 1. An uống thuốc | K1 + K2 (`node_pills`, bắt buộc để đi ngủ), K11 (bệnh án) | — |
| 2. Miên cầm lái | K7 (balo, bắt buộc trước khi đối chất), K12 (bệnh án) | K4 (chiếc ô), K5 (nhánh đối chất Màn 2), K6 (bìa bệnh án) |
| 3. Sợ An biết | K8 (nhật ký), suy từ chuyện dòng chấn thương bị xoá | K6 |

Loại trừ mồi nhử: "người lạ tông" bị bác bởi bệnh án ghi "trượt ngã" (không có xe khác); "An lái" bị bác bởi K2 + K7 + K12.

**Đồng hồ Màn 4:** màn suy luận nằm trước pha quyết định, nên đồng hồ đếm ngược phải **dừng hẳn** trong lúc điền (coi như đang tạm dừng). Không để nó chạy tới mốc rồi nhấp nháy đỏ kèm tiếng kim kẹt: làm vậy là phạt đúng người đang đọc kỹ.

**Đáp án:** An / Miên / sợ An biết người cầm lái là cô.

**Chống điền bừa:**
- Chỉ báo đúng hoặc sai **cho cả biểu mẫu**, không chỉ ra câu nào sai.
- Có **2 lần xác nhận**: 27 tổ hợp, nên đoán bừa chỉ khoảng 7% cơ hội trúng.
- Lần sai đầu: màn hình rè, dòng chữ *"[DỮ LIỆU KHÔNG KHỚP VỚI KÝ ỨC CHỦ THỂ]"*.
- Sai lần thứ hai: vào nhánh **Miên lảng tránh**.
- Mồi nhử K3 (biên lai phạt) làm người đọc lướt chọn "An" ở câu 2.

**Lời mở màn suy luận** (node `ch4_reconstruct`, An độc thoại):
> Màn hình CRT tối lại. Một biểu mẫu cũ của AURA hiện lên, bỏ trống từng dòng.
> {a:doubt,tilt}Ký ức của mình dừng ở sáng 16/05. Đêm ấy mình không nhớ được... chỉ ghép lại được từ những gì còn sót trong máy.

---

## 4. Hai nhánh sau màn suy luận

### 4a. Điền đúng → `ch4_confession` (TWIST)

> {m:frozen}Miên nhìn biểu mẫu rất lâu. Ngón tay cô đặt lên bàn phím, rồi rút lại.
>
> 'Anh uống thuốc lúc mười rưỡi. Em thấy anh gật gù ngay ở bậc cầu thang... mà anh vẫn đòi đi, bảo phải ra trước khi cô Tư khoá cổng, phải kịp mười hai giờ.'
>
> {m:pleading}'Em giật chùm chìa khoá trong tay anh. Em bảo: anh ngồi sau đi, hôm nay em chở. Em nói dối là em chạy vững lắm.'
>
> {m:crying,sob}'...Đêm đó, người cầm lái là em.'
>
> glitchText: **NGƯỜI CẦM LÁI LÀ EM.**

> `ch4_confession_2`:
> 'Công an biết. Mẹ anh biết. Mẹ không trách em câu nào, thế còn khó chịu hơn.'
>
> 'Chỉ có anh ở trong này là không biết. Lúc nạp bệnh án vào máy, em xoá đúng những dòng ấy... rồi khoá cả đêm đó lại.'
>
> {m:melancholy}'Sáu tháng nay em giữ anh ở đây... không phải vì em không buông được anh. Mà vì em chưa từng dám nói với anh câu ấy.'
>
> {a:sad,sink}Ngoài cửa phòng 312, tiếng cô Tư đập cửa lại vang lên.

→ đặt cờ `truth_driver`, sang `ch4_climax_choice`.

### 4b. Sai 2 lần → `ch4_deflect` (Miên lảng)

> {m:gentle}Miên thở ra, nhẹ nhõm thấy rõ.
>
> 'Ừ... anh mệt quá nên ngủ gật trên xe thôi mà. Trời mưa, đường trơn. Không phải lỗi ai cả đâu, An.'
>
> {a:doubt}Cô cười. Nụ cười ấy nhanh quá.

→ đặt cờ `truth_missed`, sang `ch4_climax_choice`. Người chơi **không bao giờ biết mình vừa bỏ lỡ điều gì**, trừ khi chơi lại.

---

## 5. Thay đổi ở kết cục

| Kết cục | Có `truth_driver` | Không có |
|---|---|---|
| **True (tắt máy chủ)** | Lựa chọn đổi chữ thành: *"[TỰ TAY TẮT MÁY CHỦ] • 'Không phải lỗi em.' Giải thoát cho Miên."* Thêm vào `ending_shutdown_1`: *"'Miên. Anh là người uống thuốc. Anh là người đòi đi cho kịp mười hai giờ. Không phải lỗi em.'"* | Như cũ |
| **Corrupt (ở bên nhau)** | Thêm 1 câu ở `ending_corrupt_3`: *"Cứ vài phút, Miên lại hỏi: 'Anh có giận em không?' Bạn vẫn trả lời: 'Không.'"* (thay "Anh có lạnh không?") | Như cũ |
| **Người Lạ (xoá Miên)** | Thêm vào `end_game_stranger`: *"Người duy nhất có thể tha thứ cho cô vừa quên mất tên cô."* | Như cũ |
| **Neutral / Abandoned** | Như cũ | Như cũ |

**Câu hỏi cho bạn:** có khoá kết cục True nếu thiếu `truth_driver` không?
- **Khoá:** người đọc lướt không bao giờ lấy được kết cục tốt nhất. Ép đọc mạnh nhất.
- **Không khoá:** True vẫn mở, nhưng thiếu câu "Không phải lỗi em". Nhẹ tay hơn.

---

## 6. Phạm vi công việc (sau khi chốt)

1. `story.json` + `story_en.json`: sửa M1–M7, thêm 4 node (`ch4_reconstruct`, `ch4_confession`, `ch4_confession_2`, `ch4_deflect`), sửa các kết cục ở mục 5.
2. Bảng ghim bần trong phòng 314: thành vật bấm được (M2).
3. Sổ Ký ức: component mới, phím [J], lưu vào save, hook "đọc tới node X thì ghi mục K".
4. Màn suy luận: component mới (biểu mẫu CRT, 2 lần xác nhận).
5. Cập nhật `story.md` theo canon mới.

---

## 7. Cần bạn chốt

- [ ] Canon "Miên cầm lái" (mục 0)
- [ ] Các manh mối M1–M7, đặc biệt mồi nhử M2 (biên lai phạt của An)
- [ ] Lời thoại twist (mục 4a) và nhánh lảng (mục 4b)
- [ ] Màn suy luận: 3 câu, 2 lần xác nhận
- [ ] Có khoá kết cục True khi thiếu `truth_driver` không
- [ ] Phím mở sổ Ký ức: [J] được không

---

## 8. Nhật ký rà soát (lỗ hổng đã vá trong bản nháp này)

| # | Lỗ hổng | Cách vá |
|---|---|---|
| 1 | Mốc 23:20 rời dãy trọ, nhưng canon ghi cô Tư **khoá cổng lúc 23:00** | Lùi mốc: uống thuốc 22:30, ra cổng 22:50 |
| 2 | "Không ai biết ai cầm lái" là phi thực tế, vì công an phải lập biên bản | Ngoài đời ai cũng biết. Miên chỉ giấu **bản sao An trong máy** |
| 3 | Bệnh án viện không có mục "người điều khiển phương tiện" | Đổi thành dòng "cơ chế chấn thương" bị xoá, cộng phiếu đo nồng độ cồn do CSGT chuyển tới |
| 4 | Chìa khoá xe của Miên nằm trong balo của An là vô lý | Đảo lại: chùm chìa khoá **của An** nằm trong balo, **thiếu đúng chìa xe** |
| 5 | Ký ức An dừng ở sáng 16/05 mà Màn 2 lại cho An "thấy" cảnh đêm mưa (lệch có sẵn từ canon cũ) | Đó là ký ức **của Miên** rò vào qua điện cực. Câu mở màn suy luận đổi "tự nhớ lại" thành "ghép lại" |
| 6 | Câu 1 chỉ dựa vào thói quen "đêm nào cũng uống", chưa chứng minh được đêm đó có uống | Thêm kết quả xét nghiệm máu có diazepam (M9) |
| 7 | Câu 2 phần lớn dựa vào manh mối **tuỳ chọn**: chiếc ô không thuộc 5 dị tượng bắt buộc, câu "chạy xe vững" chỉ có ở nhánh đối chất Màn 2, bìa bệnh án chỉ là 1 trong 7 manh mối Màn 3 | Thêm 2 manh mối bắt buộc: chùm chìa khoá trong balo (M6) và phiếu nồng độ cồn (M10) |
| 8 | Đáp án nhiễu "máy chủ không đủ dung lượng" lộ liễu, ai cũng loại được | Đổi thành "sợ An đòi rời khỏi máy", hợp với động cơ cũ của Miên |
| 9 | Đồng hồ Màn 4 chạy tới mốc rồi nhấp nháy đỏ kèm tiếng kim kẹt: phạt người đọc kỹ | Dừng hẳn đồng hồ trong lúc suy luận |
| 10 | "Va chạm" (radio, mẩu báo) lệch với "trượt ngã" (bệnh án) | Giữ làm mồi nhử cho "người lạ tông"; bệnh án "trượt ngã" là thứ bác bỏ nó |

## 9. Còn mở, cần bạn quyết

- **Save cũ:** người đang ở Màn 3–4 từ bản trước sẽ có sổ Ký ức trống. Đề xuất: lúc tải save, tự điền sổ từ danh sách đồ vật đã tương tác; còn các lựa chọn trong màn suy luận thì luôn hiện đủ, sổ chỉ để tra cứu.
- **`ch3_mien_need_bag`:** Miên tự nhắc An đi tìm balo, mà balo giờ chứa manh mối chống lại cô. Đề xuất giữ nguyên, vì đúng tâm lý giằng xé (cô nói ra rồi vội rút lại: "quên nó đi"). Sau twist, câu này đọc lại sẽ thấy đau.
- **`ending_shutdown_3`:** An nhờ Miên về thăm mẹ. Với canon mới, mẹ biết Miên cầm lái. Đề xuất thêm một câu cho nhánh có `truth_driver`: *"Mẹ không giận em đâu. Mẹ chỉ sợ em cũng không về nữa."*
