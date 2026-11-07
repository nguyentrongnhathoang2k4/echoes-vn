// =====================================================================
// SỔ KÝ ỨC + MÀN SUY LUẬN "GHÉP LẠI ĐÊM 17/05"
// Mỗi mục được ghi khi người chơi đọc tới node chứa nó (cờ cốt truyện mem_<id>, lưu xuyên chương).
// Manh mối thật và mồi nhử hiển thị y như nhau, không kèm lời giải thích.
// =====================================================================

export interface MemoryEntry {
  id: string;
  /** Câu gốc ghi vào sổ (tiếng Việt; hiển thị qua tx) */
  text: string;
  /** Nơi thấy */
  source: string;
}

interface EntryDef extends MemoryEntry {
  /** Node thoại chứa câu này: hiện node là ghi mục */
  nodes: string[];
  /** Save cũ chưa có cờ mem_: suy ra từ vật đã tương tác / cờ cốt truyện sẵn có */
  legacyInteract?: string;
  legacyFlag?: string;
}

const ENTRIES: EntryDef[] = [
  { id: 'K1', text: 'Lọ thuốc an thần: đêm nào không có nó là trằn trọc tới sáng.', source: 'Phòng 314', nodes: ['node_pills'], legacyInteract: 'pills' },
  { id: 'K2', text: 'Miên dặn: uống thuốc rồi thì cấm cầm lái.', source: 'Phòng 314', nodes: ['node_pills'], legacyInteract: 'pills' },
  { id: 'K3', text: 'Biên lai phạt chạy quá tốc độ: Trần Hoàng An, tháng 3.', source: 'Bảng ghim, phòng 314', nodes: ['obj_corkboard'] },
  { id: 'K9', text: "Mẹ nhắn: 'Đi đâu trời mưa thì mặc áo mưa vào nhé.'", source: 'Điện thoại', nodes: ['obj_phone_mom'] },
  { id: 'K4', text: 'Đêm ấy trú mưa ở mái hiên đầu cầu. Chùm chìa khoá móc con mèo sứt tai, trong tay ai đó.', source: 'Chiếc ô, bến An Yên', nodes: ['obj_ch2_umbrella'], legacyInteract: 'ch2_umbrella' },
  { id: 'K13', text: "Radio: '...một vụ va chạm trên cầu vượt, đường trơn...'", source: 'Đài bán dẫn, bến An Yên', nodes: ['obj_ch2_umbrella'], legacyInteract: 'ch2_umbrella' },
  { id: 'K5', text: "Miên: 'Hồi đó em nói dối là em chạy xe vững lắm.'", source: 'Bến An Yên', nodes: ['ch2_truth_confront'], legacyFlag: 'ch2_confront' },
  { id: 'K6', text: 'Bìa bệnh án: dòng cơ chế chấn thương đã bị xoá.', source: 'Phòng cấp cứu', nodes: ['obj_ch3_chart'], legacyInteract: 'ch3_chart' },
  { id: 'K7', text: 'Balo: chùm chìa khoá của mình thiếu đúng chiếc chìa xe.', source: 'Phòng cấp cứu', nodes: ['obj_ch3_bag'], legacyInteract: 'ch3_bag' },
  { id: 'K14', text: 'Áo mưa của mình bị cắt toạc từ cổ xuống, mảng lưng trầy nát như miết lên sắt.', source: 'Phòng cấp cứu', nodes: ['obj_ch3_bag'], legacyInteract: 'ch3_bag' },
  { id: 'K15', text: 'Bìa bệnh án: vùng tổn thương lưng – ngực sau, va đập vật cứng.', source: 'Phòng cấp cứu', nodes: ['obj_ch3_chart'], legacyInteract: 'ch3_chart' },
  { id: 'K10', text: 'Hộp nhẫn khắc AN & MIÊN, định trao lúc 00:00 ngày 17/05.', source: 'Phòng cấp cứu', nodes: ['obj_ch3_bag'], legacyInteract: 'ch3_bag' },
  { id: 'K11', text: 'Bệnh án: máu có thuốc an thần (diazepam).', source: 'LOG_01', nodes: ['ch4_log1'] },
  { id: 'K12', text: 'Phiếu đo nồng độ cồn người điều khiển phương tiện. Người ký: Ng. T. Miên.', source: 'LOG_01', nodes: ['ch4_log1'] },
  { id: 'K16', text: 'Biên bản hiện trường: người ngồi sau nằm ôm trùm lên người điều khiển, lưng áp vào dải phân cách.', source: 'LOG_01', nodes: ['ch4_log1'] },
  { id: 'K8', text: "Nhật ký Miên: 'Có một chuyện em chưa dám nói với anh, kể cả ở trong này.'", source: 'LOG_02', nodes: ['ch4_log2'] },
];

export const MEMORY_FLAG_PREFIX = 'mem_';
export const memoryFlag = (id: string) => `${MEMORY_FLAG_PREFIX}${id}`;

/** Các cờ mem_ cần ghi khi node này hiện ra */
export function memoryFlagsForNode(nodeId: string): string[] {
  return ENTRIES.filter((e) => e.nodes.includes(nodeId)).map((e) => memoryFlag(e.id));
}

/** Các mục người chơi đã có (theo thứ tự trong sổ) */
export function unlockedMemories(storyFlags: string[], interactedIds: string[] = []): MemoryEntry[] {
  return ENTRIES.filter(
    (e) =>
      storyFlags.includes(memoryFlag(e.id)) ||
      (e.legacyFlag !== undefined && storyFlags.includes(e.legacyFlag)) ||
      (e.legacyInteract !== undefined && interactedIds.includes(e.legacyInteract)),
  ).map(({ id, text, source }) => ({ id, text, source }));
}

// ---------------- Màn suy luận ----------------

export interface DeductionQuestion {
  /** Câu có chỗ trống, đánh dấu bằng ___ */
  sentence: string;
  options: string[];
  answer: number;
}

export const DEDUCTION: DeductionQuestion[] = [
  { sentence: 'Tối 16/05, ___ đã uống thuốc an thần.', options: ['An', 'Miên', 'Không ai cả'], answer: 0 },
  { sentence: 'Người cầm lái trên cầu vượt là ___.', options: ['An', 'Miên', 'Một người lạ tông phải'], answer: 1 },
  { sentence: 'Người hứng cú va đập vào dải phân cách là ___.', options: ['An', 'Miên', 'Không ai, xe trượt một mình'], answer: 0 },
  { sentence: 'Miên khoá ký ức đêm đó vì ___.', options: ['sợ An đau', 'sợ An đòi rời khỏi máy', 'sợ An biết người cầm lái là cô'], answer: 2 },
];
export const DEDUCTION_ATTEMPTS = 2;
export const TRUTH_FLAG = 'truth_driver';
export const TRUTH_MISSED_FLAG = 'truth_missed';
