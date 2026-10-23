export type WorldState = 'REALITY' | 'DREAM' | 'GLITCH';

export type AnEmotion = 
  | 'normal' 
  | 'sad' 
  | 'exhausted' 
  | 'scared' 
  | 'panic' 
  | 'faint_smile' 
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
  /** Ẩn lựa chọn khi đã có biến này */
  forbidsFlag?: string;
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
}
