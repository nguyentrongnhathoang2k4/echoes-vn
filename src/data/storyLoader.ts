import storyVi from './story.json';
import storyEn from './story_en.json';
import type { Choice, StoryNode } from '../types/vn';
import type { Language } from '../context/LanguageContext';

// =====================================================================
// NẠP CỐT TRUYỆN THEO NGÔN NGỮ
// story.json (tiếng Việt) là bản gốc: chứa toàn bộ node và mọi logic
// (nextNodeId, sanityImpact, cờ, ngưỡng Sanity, biểu cảm...).
// story_en.json chỉ cần chứa phần chữ của những node đã dịch:
//   { "start": { "text": "...", "glitchText": "...", "speaker": "...", "choices": [{ "text": "..." }] } }
// Node / trường / lựa chọn nào chưa dịch thì tự rơi về tiếng Việt, nên dịch dở vẫn chơi được.
// Logic luôn lấy từ bản gốc: bản dịch không thể làm hỏng đồ thị cốt truyện.
// =====================================================================

export type StoryMap = Record<string, StoryNode>;

interface TranslatedNode {
  speaker?: string;
  text?: string;
  glitchText?: string;
  choices?: Array<Pick<Partial<Choice>, 'text'> | null>;
}

const BASE = storyVi as StoryMap;
const TRANSLATIONS: Partial<Record<Language, Record<string, TranslatedNode>>> = {
  en: storyEn as Record<string, TranslatedNode>,
};
const cache = new Map<Language, StoryMap>();

function mergeNode(base: StoryNode, tr: TranslatedNode | undefined): StoryNode {
  if (!tr) return base;
  return {
    ...base,
    speaker: tr.speaker || base.speaker,
    text: tr.text || base.text,
    glitchText: base.glitchText === undefined ? undefined : tr.glitchText || base.glitchText,
    choices: base.choices?.map((c, i) => ({ ...c, text: tr.choices?.[i]?.text || c.text })),
  };
}

/** Bản gốc tiếng Việt: dùng cho logic cần ổn định (nhận diện người nói, ngưỡng, tác động Sanity) */
export function getBaseStory(): StoryMap {
  return BASE;
}

/** Cốt truyện để hiển thị theo ngôn ngữ, phần chưa dịch rơi về tiếng Việt */
export function getStory(lang: Language): StoryMap {
  const tr = TRANSLATIONS[lang];
  if (lang === 'vi' || !tr || Object.keys(tr).length === 0) return BASE;
  let merged = cache.get(lang);
  if (!merged) {
    merged = {};
    for (const [id, node] of Object.entries(BASE)) merged[id] = mergeNode(node, tr[id]);
    cache.set(lang, merged);
  }
  return merged;
}
