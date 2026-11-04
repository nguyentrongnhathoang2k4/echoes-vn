export interface InventoryItem {
  id: string;
  name: string;
  shortName: string; // Tên ngắn hiện dưới ô đồ
  description: string; // Mô tả ngắn: vật gì + dùng vào việc gì
  category: 'tool' | 'key' | 'memory' | 'medical';
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
    shortName: 'Bật lửa',
    description: 'Bật lửa Zippo cũ trầy xước, nhặt trên bàn trà cạnh bát mì. Vẫn còn xăng để soi sáng.',
    category: 'tool',
    usableOn: ['under_bed'],
  },
  box_cutter: {
    id: 'box_cutter',
    name: 'Dao Rọc Giấy Cũ',
    shortName: 'Dao rọc giấy',
    description: 'Dao rọc giấy cán vàng sắc bén. Dùng để rạch băng keo dán thùng đồ.',
    category: 'tool',
    usableOn: ['cardboard_box'],
  },
  electrical_tape: {
    id: 'electrical_tape',
    name: 'Cuộn Băng Dính Đen',
    shortName: 'Băng dính',
    description: 'Cuộn băng dính cách điện màu đen dẻo dai.',
    category: 'tool',
  },
  paperclip: {
    id: 'paperclip',
    name: 'Kẹp Ghim Kim Loại',
    shortName: 'Kẹp ghim',
    description: 'Chiếc kẹp ghim giấy kim loại kẹp trong cuốn sổ tay.',
    category: 'tool',
    usableOn: ['pc_drawer'],
  },
  coffee: {
    id: 'coffee',
    name: 'Cốc Cà Phê Đen Đặc',
    shortName: 'Cà phê',
    description: 'Cốc cà phê phin còn âm ấm. Uống một ngụm xua tan cơn đau đầu.',
    category: 'medical',
    isConsumable: true,
    consumeActionName: 'UỐNG CÀ PHÊ (+15 SANITY - 1 LẦN)',
    consumeSanityGain: 15,
    consumeMonologue: 'Đắng ngắt. Nhưng đầu óc tỉnh hẳn ra.',
  },
  faded_photo: {
    id: 'faded_photo',
    name: 'Ảnh Polaroid Cũ: An & Miên',
    shortName: 'Ảnh Polaroid',
    description: 'Tấm ảnh polaroid ố vàng cất trong thùng đồ kỷ niệm. An và Miên cười rạng rỡ trên ghế đá dưới tán tử đằng bến An Yên.',
    category: 'memory',
    isConsumable: true,
    consumeActionName: 'NGẮM ẢNH KỶ NIỆM (+20 SANITY - 1 LẦN)',
    consumeSanityGain: 20,
    consumeMonologue: 'Miên cười trong ảnh. Lồng ngực bớt nặng một chút.',
  },
  disk_part_1: {
    id: 'disk_part_1',
    name: 'Mảnh Đĩa Mềm Bị Gãy (Nửa Trái)',
    shortName: 'Nửa đĩa trái',
    description: 'Nửa trái của đĩa mềm, nhãn ghi chữ Miên: "Kỷ niệm của chúng mình...". Đủ nửa còn lại thì ngồi bàn trà phục chế (dao rọc giấy, băng dính, bật lửa).',
    category: 'memory',
    canCombineWith: 'disk_part_2',
    combineResultId: 'aura_disk',
    requiredToolId: 'electrical_tape',
    requiredToolMsg: '2 nửa đĩa mềm bị vỡ rời! Bạn cần tìm Cuộn Băng Dính (trong thùng carton) để dán khít chúng lại.',
    combineSuccessMsg: 'Dán xong. Hai nửa đĩa lại thành một.',
  },
  disk_part_2: {
    id: 'disk_part_2',
    name: 'Mảnh Đĩa Mềm Bị Gãy (Nửa Phải)',
    shortName: 'Nửa đĩa phải',
    description: 'Nửa phải của đĩa mềm, phần từ tính còn nguyên. Đủ nửa còn lại thì ngồi bàn trà phục chế (dao rọc giấy, băng dính, bật lửa).',
    category: 'memory',
    canCombineWith: 'disk_part_1',
    combineResultId: 'aura_disk',
    requiredToolId: 'electrical_tape',
    requiredToolMsg: '2 nửa đĩa mềm bị vỡ rời! Bạn cần tìm Cuộn Băng Dính (trong thùng carton) để dán khít chúng lại.',
    combineSuccessMsg: 'Dán xong. Hai nửa đĩa lại thành một.',
  },
  aura_disk: {
    id: 'aura_disk',
    name: 'Đĩa Mềm Kỷ Niệm Hoàn Chỉnh',
    shortName: 'Đĩa mềm',
    description: 'Đĩa mềm đã dán lành, nhãn ghi "Kỷ niệm của chúng mình" bằng nét chữ Miên. Cắm vào máy tính để đọc.',
    category: 'memory',
    usableOn: ['pc'],
  },
  miens_pendant: {
    id: 'miens_pendant',
    name: 'Mặt Dây Chuyền Bạc Của Miên',
    shortName: 'Dây chuyền',
    description: 'Mặt dây chuyền bạc hình giọt lệ. Mặt sau khắc nắn nót: "A & M — Kỷ Niệm 17.05".',
    category: 'memory',
    isConsumable: true,
    consumeActionName: 'SOI MẶT DÂY CHUYỀN (+10 SANITY)',
    consumeSanityGain: 10,
    consumeMonologue: 'Mặt dây còn ấm. 17.05... ngày ấy hẳn quan trọng lắm.',
  },
};
