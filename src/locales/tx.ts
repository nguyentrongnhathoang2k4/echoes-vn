import { getStoredLanguage, type Language } from '../context/LanguageContext';
import { STRINGS_EN } from './strings_en';

// =====================================================================
// DỊCH CHUỖI CỐ ĐỊNH TRONG CÁC MÀN CHƠI (gợi ý [E], độc thoại, nhãn vẽ trên canvas...)
// Khoá tra cứu chính là câu tiếng Việt gốc, nên code giữ nguyên tiếng Việt và chỉ cần
// gói tx() ở chỗ hiển thị. Câu nào chưa có trong strings_en.ts thì hiện tiếng Việt.
// Câu có số thay đổi dùng chỗ trống {0}, {1}...: tx('Còn {0} giây', n)
// =====================================================================

export function translate(lang: Language, vi: string, ...args: Array<string | number>): string {
  const s = lang === 'en' ? STRINGS_EN[vi] ?? vi : vi;
  if (args.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}

/**
 * Dịch theo ngôn ngữ đang lưu. Dùng được cả trong vòng vẽ canvas lẫn JSX;
 * component dùng tx() trong JSX cần gọi useLanguage() để vẽ lại khi đổi ngôn ngữ.
 */
export function tx(vi: string, ...args: Array<string | number>): string {
  return translate(getStoredLanguage(), vi, ...args);
}
