'use client';
import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { vi, type Dictionary } from '../locales/vi';
import { en } from '../locales/en';

// =====================================================================
// NGÔN NGỮ: 'vi' (mặc định) | 'en', ghi nhớ trong localStorage.
// Đọc qua useSyncExternalStore: lúc server render / hydrate luôn là 'vi',
// sau đó tự chuyển sang ngôn ngữ đã lưu mà không lệch hydrate.
// =====================================================================

export type Language = 'vi' | 'en';

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string }> = [
  { code: 'vi', label: '[ Tiếng Việt ]' },
  { code: 'en', label: '[ English ]' },
];

const STORAGE_KEY_LANG = 'echoes_0314_lang';
const LANG_EVENT = 'echoes:language';
const DICTIONARIES: Record<Language, Dictionary> = { vi, en };

/** Ngôn ngữ đang lưu (dùng được cả ngoài React, vd. hàm module của các màn chơi) */
export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'vi';
  try {
    return localStorage.getItem(STORAGE_KEY_LANG) === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

function setStoredLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY_LANG, lang);
  } catch {}
  window.dispatchEvent(new Event(LANG_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(LANG_EVENT, onChange);
  window.addEventListener('storage', onChange); // Đổi ở tab khác
  return () => {
    window.removeEventListener(LANG_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  /** Từ điển giao diện của ngôn ngữ hiện tại */
  t: Dictionary;
}

const FALLBACK: LanguageContextValue = { lang: 'vi', setLang: setStoredLanguage, t: vi };
const LanguageContext = createContext<LanguageContextValue>(FALLBACK);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getStoredLanguage, () => 'vi' as Language);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang: setStoredLanguage, t: DICTIONARIES[lang] }),
    [lang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Ngôn ngữ hiện tại + từ điển; ngoài Provider thì trả về tiếng Việt thay vì làm sập game */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
