import type { AnEmotion, MienEmotion } from '../types/vn';

// =====================================================================
// TỪ ĐIỂN GIAO DIỆN TIẾNG VIỆT (ngôn ngữ gốc).
// Kiểu Dictionary suy ra từ file này: thêm khoá ở đây thì en.ts bắt buộc phải có bản dịch.
// =====================================================================

export type OutroKind = 'A' | 'B' | 'C' | 'S' | 'M';

interface EndingText {
  badge: string;
  title: string;
  summary: string;
  hint: string;
}

export const vi = {
  common: {
    on: 'Bật',
    off: 'Tắt',
  },

  menu: {
    newGame: 'Bắt đầu',
    continue: 'Tiếp tục',
    achievements: (unlocked: number, total: number) => `Kết cục ${unlocked}/${total}`,
    settings: 'Cài đặt',
    shutdown: 'Thoát',
    hintSelect: 'chọn',
    hintConfirm: 'xác nhận',
    goodbyeTitle: 'Tạm biệt',
    goodbyeText: 'Câu chuyện của An và Miên tạm dừng tại đây. Bạn có thể đóng tab trình duyệt này hoặc bắt đầu lại bất cứ lúc nào.',
    restart: 'Chơi lại',
    cancel: 'Quay lại',
  },

  settings: {
    title: 'Cài đặt',
    language: 'Ngôn ngữ / Language',
    languageHint: 'Phần chưa dịch sẽ hiện tiếng Việt',
    master: 'Âm lượng tổng',
    masterHint: 'Âm lượng chung của cả trò chơi',
    bgm: 'Nhạc nền',
    bgmHint: 'Piano hoài niệm, valse hoàng hôn, nền âm u',
    ambient: 'Môi trường & hiệu ứng',
    ambientHint: 'Tiếng mưa, quạt máy tính, tiếng sông, tiếng phím',
    textSpeed: 'Tốc độ chữ',
    textSpeedFast: 'Nhanh',
    textSpeedSlow: 'Chậm',
    textSpeedHint: 'Tốc độ hiện từng ký tự trong hộp thoại',
    crt: 'Bộ lọc CRT',
    crtHint: 'Đường quét ngang và độ rung sáng của màn hình cũ',
    parallax: 'Góc nhìn theo chuột',
    parallaxHint: 'Khung cảnh nghiêng nhẹ theo con trỏ (tắt nếu thấy chóng mặt)',
    escHint: 'ESC để đóng',
    saveClose: 'Đóng',
  },

  achievements: {
    title: 'Kết cục',
    unlockedCount: (unlocked: number, total: number) => `${unlocked}/${total}`,
    lockedTitle: '???',
    lockedBadge: 'Chưa mở',
    escHint: 'ESC để đóng',
    close: 'Đóng',
    endings: {
      A: {
        badge: 'TRUE ENDING',
        title: 'BÌNH MINH THẬT SỰ',
        summary: 'An mỉm cười thanh thản, tự tay tắt máy chủ để giải thoát cho Miên. Giấc mộng tan biến, Miên đẩy cửa sổ đón nắng sớm sau sáu tháng giông bão.',
        hint: 'Cần Sanity ≥ 45% nếu đã đối chất với Miên ở Màn 2, hoặc ≥ 55% nếu không. Dũng cảm nhìn thẳng vào sự thật và buông bỏ mộng cảnh để người ở lại được sống tiếp.',
      },
      B: {
        badge: 'BAD ENDING',
        title: 'ĐỊA NGỤC NGỌT NGÀO',
        summary: 'An hoảng sợ trước bóng tối, xin Miên vào máy ở bên mình. Miên đồng bộ ý thức ở mức "không bao giờ dùng"; hai phút cuối trước khi mất điện kéo dài thành buổi hoàng hôn 03:14 AM không bao giờ tắt.',
        hint: 'Cần Sanity ≤ 50% nếu đã chọn ở lại cùng Miên ở Màn 2, hoặc ≤ 25% nếu không. Tâm trí suy sụp đến tận cùng, hoảng sợ trước cái chết và bám víu vào ảo mộng.',
      },
      C: {
        badge: 'NEUTRAL ENDING',
        title: 'ĐỨT ĐOẠN KÝ ỨC',
        summary: 'Cầu dao máy tính bị giật xuống phũ phàng lúc 03:30 AM khi hết giờ đếm ngược. An tê liệt buông xuôi, ký ức bị xé rách từng byte vào quên lãng, không một lời từ biệt.',
        hint: 'Buông xuôi hai tay hoặc để đồng hồ đếm ngược ở Màn 4 về 00:00.',
      },
      S: {
        badge: 'SECRET ENDING',
        title: 'NGƯỜI LẠ',
        summary: 'An chọn xóa sạch mọi ký ức về Miên để cô không còn lý do quay lại. Nhìn An xa lạ hỏi "Chị là ai ạ?", Miên chết lặng tự tay tắt máy. Cô mất An lần thứ hai ngay trước mắt mình.',
        hint: '[KẾT CỤC BÍ ẨN] Đã mở mã nguồn Đồ án AURA ở Màn 1 và giữ Sanity ở mức cân bằng (40% - 60%) ở Màn 4.',
      },
      M: {
        badge: 'META ENDING',
        title: 'KHÔNG AI Ở LẠI',
        summary: 'Người bỏ rơi An lúc 03:30 AM không phải số phận hay Miên, mà chính là bạn. Tiêu đề tab trình duyệt mãi mãi khắc ghi vết tích: "Anh cũng đi rồi à."',
        hint: '[KẾT CỤC ẨN 4TH-WALL] Rời khỏi tab trình duyệt quá 20 giây trong lúc đồng hồ Màn 4 đang đếm ngược.',
      },
    } as Record<OutroKind, EndingText>,
  },

  warning: {
    title: 'CẢNH BÁO NỘI DUNG',
    subtitle: 'ECHOES: 03:14 AM • KINH DỊ TÂM LÝ',
    items: [
      {
        title: 'Ánh sáng nhấp nháy',
        detail: 'Chớp sáng, đèn chập chờn và hiệu ứng nhiễu hình liên tục. Có thể ảnh hưởng tới người nhạy cảm với ánh sáng hoặc có tiền sử động kinh.',
      },
      {
        title: 'Âm thanh lớn đột ngột',
        detail: 'Tiếng sấm, tiếng đập cửa, còi cấp cứu và máy đo nhịp tim.',
      },
      {
        title: 'Chủ đề nặng nề',
        detail: 'Cái chết, tai nạn giao thông, mất mát và đau buồn, trầm cảm, hình ảnh y tế và máu, đề cập tới việc dùng thuốc quá liều.',
      },
    ] as Array<{ title: string; detail: string }>,
    note: 'Đây là một câu chuyện hư cấu. Nếu bạn đang thấy nặng lòng, hãy dừng lại nghỉ ngơi bất cứ lúc nào, và đừng ngại tâm sự với người bạn tin tưởng hoặc tìm tới chuyên gia tâm lý.',
    skip: 'Nhấn phím bất kỳ hoặc click để tiếp tục',
  },

  hud: {
    move: 'Di chuyển',
    explore: 'Khám phá',
    inventory: 'Túi đồ',
    inventoryTitle: 'Nhấn phím [I] để mở túi đồ',
    interact: 'Điều tra',
  },

  vn: {
    close: 'Đóng',
    system: 'HỆ THỐNG // AURA OS',
    timeout: (seconds: number) => `NGẮT NGUỒN SAU 00:${String(seconds).padStart(2, '0')}`,
    // Lựa chọn bị khoá theo ngưỡng Sanity: nói bằng cảm xúc, không lộ con số
    lockCalm: 'Mình chưa đủ bình tĩnh để làm điều này',
    lockDesperate: 'Mình chưa đủ tuyệt vọng để làm vậy',
    lockBalance: 'Tâm trí phải thật cân bằng mới làm được',
    revive: '[ SỐC ĐIỆN TIM - TÁI TẠO Ý THỨC (CHƠI LẠI ĐẦU CHƯƠNG 1) ]',
    chapter1Done: '[ HOÀN THÀNH CHƯƠNG 1 - TIẾP TỤC BƯỚC VÀO THỊ TRẤN HOÀNG HÔN ]',
    chapter2Done: '[ HOÀN THÀNH CHƯƠNG 2 - BẦU TRỜI ĐÃ SỤP ĐỔ ]',
    trueEnding: '[ TRUE ENDING: BÌNH MINH THẬT SỰ • TRỞ VỀ MENU ]',
    badEnding: '[ BAD ENDING: ĐỊA NGỤC NGỌT NGÀO • MẮC KẸT VĨNH VIỄN ]',
    neutralEnding: '[ NEUTRAL ENDING: ĐỨT ĐOẠN KÝ ỨC (MẤT KẾT NỐI VĨNH VIỄN) • TRỞ VỀ MENU ]',
    exploreSunset: '[ TIẾP TỤC DẠO QUANH THỊ TRẤN HOÀNG HÔN ]',
    exploreRoom: '[ TIẾP TỤC KHÁM PHÁ CĂN PHÒNG ]',
    continueHint: '[Nhấn Enter / Space hoặc Click để tiếp tục]',
    anEmotion: {
      normal: 'Bình thường',
      sad: 'Đau buồn',
      exhausted: 'Kiệt sức',
      scared: 'Kinh sợ',
      panic: 'Hoảng loạn',
      faint_smile: 'Cười gượng',
      smile: 'Vui vẻ',
      doubt: 'Nghi ngờ',
      glitched: 'Nhiễu loạn',
      determined: 'Kiên định',
    } as Record<AnEmotion, string>,
    mienEmotion: {
      warm_smile: 'Ấm áp',
      gentle: 'Dịu dàng',
      worried: 'Lo lắng',
      melancholy: 'U sầu',
      surprised: 'Bàng hoàng',
      fading: 'Mờ nhạt',
      pleading: 'Cầu xin',
      corrupted: 'Lỗi mã AURA',
      crying: 'Rơi lệ',
      playful: 'Tinh nghịch',
    } as Record<MienEmotion, string>,
  },
};

/** Đổi mọi kiểu chuỗi cụ thể thành string để bản dịch khác được phép mang nội dung khác */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : T extends Array<infer U>
      ? Array<Widen<U>>
      : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof vi>;
