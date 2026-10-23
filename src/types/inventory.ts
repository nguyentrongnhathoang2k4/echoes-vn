export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: 'tool' | 'key' | 'memory' | 'medical';
  icon: string;
  canCombineWith?: string; // ID item khác có thể ghép chung
  combineResultId?: string; // ID item mới tạo ra sau khi ghép
  combineSuccessMsg?: string; // Thông báo khi ghép thành công
  requiredToolId?: string; // Item phụ trợ cần có trong túi đồ để tiến hành ghép (ví dụ: cuộn băng dính)
  requiredToolMsg?: string; // Thông báo nếu thiếu item phụ trợ khi ghép
  usableOn?: string[]; // IDs của các đối tượng có thể sử dụng item lên
  isConsumable?: boolean; // Có thể kích hoạt dùng trực tiếp trong túi đồ
  consumeActionName?: string; // Tên nút bấm dùng (VD: "UỐNG CÀ PHÊ", "NGẮM ẢNH")
  consumeSanityGain?: number; // Sanity phục hồi khi dùng
  consumeMonologue?: string; // Lời thoại An độc thoại khi dùng vật phẩm
}

export const CHAPTER_1_ITEMS: Record<string, InventoryItem> = {
  lighter: {
    id: 'lighter',
    name: 'Bật Lửa Gỉ Cũ',
    description: 'Chiếc bật lửa Zippo kim loại đã trầy xước, nhặt trên bàn trà cạnh bát mì tôm. Bấc đèn vẫn còn xăng, ngọn lửa vàng có thể soi sáng những góc tối tăm như gầm giường.',
    category: 'tool',
    icon: '🔥',
    usableOn: ['under_bed'],
  },
  box_cutter: {
    id: 'box_cutter',
    name: 'Dao Rọc Giấy Cũ',
    description: 'Con dao rọc giấy cán nhựa màu vàng, lưỡi kim loại sắc nhọn nhặt trên bàn trà. Dùng để rạch đứt các lớp băng keo dán kín thùng đồ.',
    category: 'tool',
    icon: '🔪',
    usableOn: ['cardboard_box'],
  },
  electrical_tape: {
    id: 'electrical_tape',
    name: 'Cuộn Băng Dính Đen',
    description: 'Cuộn băng dính cách điện màu đen dẻo dai tìm thấy trong thùng carton của Miên. Độ dính cao, dùng để dán khít 2 nửa đĩa mềm bị gãy vụn lại với nhau.',
    category: 'tool',
    icon: '🩹',
  },
  paperclip: {
    id: 'paperclip',
    name: 'Kẹp Ghim Kim Loại',
    description: 'Chiếc kẹp ghim giấy bằng thép uốn tìm thấy kẹp trong cuốn sổ tay bìa da trên kệ sách. Độ cứng vừa đủ để cạy then khóa cơ của hộc bàn máy tính.',
    category: 'tool',
    icon: '📎',
    usableOn: ['pc_drawer'],
  },
  coffee: {
    id: 'coffee',
    name: 'Cốc Cà Phê Đen Đặc',
    description: 'Cốc cà phê phin còn âm ấm đặt cạnh bàn phím máy tính. Vị đắng chát giúp kích thích não bộ, xua tan cơn hoang tưởng mộng mị. Nhấn nút bên dưới để uống (+15 Sanity, chỉ sử dụng 1 lần duy nhất).',
    category: 'medical',
    icon: '☕',
    isConsumable: true,
    consumeActionName: 'UỐNG CÀ PHÊ (+15 SANITY - 1 LẦN)',
    consumeSanityGain: 15,
    consumeMonologue: 'Vị cà phê đắng ngắt tràn vào cuống họng... Cơn buồn ngủ và tiếng ù tai rùng rợn tạm thời lắng xuống (+15 Sanity).',
  },
  faded_photo: {
    id: 'faded_photo',
    name: 'Ảnh Polaroid Cũ: An & Miên',
    description: 'Tấm ảnh polaroid ố vàng kẹp trong cuốn album kỷ niệm. Chụp An và Miên đang cười rạng rỡ dưới chân tháp chuông. Mặt sau nắn nót dòng chữ: "Hẹn ước 17/05 - Đừng quên nhé anh". Nhấn để ngắm (+20 Sanity, chỉ hồi phục 1 lần duy nhất).',
    category: 'memory',
    icon: '📷',
    isConsumable: true,
    consumeActionName: 'NGẮM ẢNH KỶ NIỆM (+20 SANITY - 1 LẦN)',
    consumeSanityGain: 20,
    consumeMonologue: 'Bạn ngắm nhìn nụ cười của Miên trong bức ảnh... Trái tim bạn ấm áp lạ kỳ giữa căn phòng lạnh giá. Dòng chữ 17/05 như khắc sâu vào tâm trí bạn (+20 Sanity).',
  },
  disk_part_1: {
    id: 'disk_part_1',
    name: 'Mảnh Đĩa Mềm Bị Gãy (Nửa Trái)',
    description: 'Nửa bên trái của chiếc đĩa mềm 3.5 inch tìm thấy dưới gầm giường tối. Trên nhãn ghi nắn nót nét chữ quen thuộc của Miên: "Kỷ niệm của chúng mình...".',
    category: 'memory',
    icon: '💾',
    canCombineWith: 'disk_part_2',
    combineResultId: 'aura_disk',
    requiredToolId: 'electrical_tape',
    requiredToolMsg: '⚠️ 2 nửa đĩa mềm bị vỡ rời! Bạn cần tìm Cuộn Băng Dính (trong thùng carton) để dán khít chúng lại.',
    combineSuccessMsg: 'Bạn khéo léo dùng Cuộn Băng Dính dán khít 2 nửa đĩa mềm lại thành ĐĨA MỀM KỶ NIỆM hoàn chỉnh!',
  },
  disk_part_2: {
    id: 'disk_part_2',
    name: 'Mảnh Đĩa Mềm Bị Gãy (Nửa Phải)',
    description: 'Nửa bên phải của chiếc đĩa mềm 3.5 inch tìm thấy trong hộc bàn máy tính kẹt chốt. Phần từ tính vẫn còn nguyên vẹn, dường như chứa những thước phim và hình ảnh cũ.',
    category: 'memory',
    icon: '💾',
    canCombineWith: 'disk_part_1',
    combineResultId: 'aura_disk',
    requiredToolId: 'electrical_tape',
    requiredToolMsg: '⚠️ 2 nửa đĩa mềm bị vỡ rời! Bạn cần tìm Cuộn Băng Dính (trong thùng carton) để dán khít chúng lại.',
    combineSuccessMsg: 'Bạn khéo léo dùng Cuộn Băng Dính dán khít 2 nửa đĩa mềm lại thành ĐĨA MỀM KỶ NIỆM hoàn chỉnh!',
  },
  aura_disk: {
    id: 'aura_disk',
    name: 'Đĩa Mềm Kỷ Niệm Hoàn Chỉnh',
    description: 'Chiếc đĩa mềm 3.5 inch hoàn chỉnh sau khi ghép 2 nửa và dán keo cố định. Nhãn dán nắn nót: "Kỷ niệm của chúng mình - 17/05". Cần đưa vào ổ đĩa máy tính để mở khóa dữ liệu.',
    category: 'memory',
    icon: '💽',
    usableOn: ['pc'],
  },
  miens_pendant: {
    id: 'miens_pendant',
    name: 'Mặt Dây Chuyền Bạc Của Miên',
    description: 'Mặt dây chuyền bạc hình giọt lệ nhặt dưới khe cửa phòng #316 niêm phong — căn phòng trọ của Miên ở sát vách phòng bạn. Mặt sau khắc chìm dòng chữ: "A & M - Kỷ Niệm 17/05. Dù ở thực tại nào, ta vẫn sẽ tìm thấy nhau". Con số 1705 chính là mã PIN mật khẩu máy tính của An!',
    category: 'memory',
    icon: '✨',
    isConsumable: true,
    consumeActionName: 'SOI MẶT DÂY CHUYỀN (+10 SANITY)',
    consumeSanityGain: 10,
    consumeMonologue: 'Bạn vuốt nhẹ mặt dây chuyền bạc còn vương chút hơi ấm... Dòng số 1705 khắc chìm lóe sáng trong tâm trí. Bạn nhớ ra mật mã mở máy tính rồi (+10 Sanity)!',
  },
};
