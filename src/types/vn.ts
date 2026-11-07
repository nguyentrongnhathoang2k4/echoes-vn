export type WorldState = 'REALITY' | 'DREAM' | 'GLITCH';

export type AnEmotion = 
  | 'normal' 
  | 'sad' 
  | 'exhausted' 
  | 'scared' 
  | 'panic' 
  | 'faint_smile' 
  | 'smile'
  | 'doubt' 
  | 'glitched'
  | 'determined';

export type MienEmotion = 
  | 'warm_smile' 
  | 'gentle' 
  | 'worried' 
  | 'melancholy' 
  | 'surprised' 
  | 'fading' 
  | 'pleading' 
  | 'corrupted'
  | 'crying'
  | 'playful';

export interface Choice {
  text: string;
  nextNodeId: string;
  sanityImpact: number;
  /** Lựa chọn chỉ mở khi Sanity >= giá trị này */
  minSanity?: number;
  /** Lựa chọn chỉ mở khi Sanity <= giá trị này */
  maxSanity?: number;
  /** Ghi một biến cốt truyện (giữ xuyên suốt các chương) khi chọn */
  setFlag?: string;
  /** Chỉ hiện lựa chọn khi đã có biến này */
  requiresFlag?: string;
  /** Chỉ hiện khi đã có ĐỦ mọi biến trong danh sách (vd: kết cục True cần đã suy luận ra người cầm lái) */
  requiresFlags?: string[];
  /** Ẩn lựa chọn khi đã có biến này */
  forbidsFlag?: string;
  /** Lựa chọn bí mật: ẩn hẳn (thay vì hiện ổ khoá) khi Sanity nằm ngoài ngưỡng */
  hiddenWhenLocked?: boolean;
  /** Ghi một vật thể là "đã xem" khi chọn (vd: đã đọc màn hình máy tính → bấm [E] vào máy không phát lại) */
  markInteracted?: string;
}

/** Rẽ nhánh tự động theo biến cốt truyện (dùng cho node không có lựa chọn) */
export interface FlagBranch {
  flag: string;
  nextNodeId: string;
}

export interface StoryNode {
  id: string;
  speaker: string;
  text: string;
  worldState: WorldState;
  glitchText?: string;
  nextNodeId?: string;
  /** Ưu tiên trước nextNodeId: nhánh đầu tiên có biến đã được ghi sẽ được đi theo */
  flagBranches?: FlagBranch[];
  choices?: Choice[];
  /** Đếm ngược (giây) sau khi thoại gõ xong; hết giờ mà chưa chọn thì nhảy tới timeoutNodeId */
  timeoutSeconds?: number;
  timeoutNodeId?: string;
  anEmotion?: AnEmotion;
  mienEmotion?: MienEmotion;
  /**
   * Ảnh minh hoạ sự kiện hiện giữa màn hình khi đọc node này:
   * 'cg:<khoá>' = tranh pixel vẽ sẵn (EventIllustration.tsx), hoặc đường dẫn file trong public/ (vd '/assets/cg/ring.png')
   */
  illustration?: string;
  /** Khung cho ảnh dạng file: 'pixel' (mặc định) | 'polaroid' | 'viewer' (cửa sổ xem ảnh máy tính) */
  illustrationFrame?: 'pixel' | 'polaroid' | 'viewer';
}
