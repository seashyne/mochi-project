// Multi-Language Internationalization (i18n) Context Provider and Hook

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, TranslationDictionary, SUPPORTED_LANGUAGES } from './types';
import { th } from './locales/th';
import { en } from './locales/en';
import { ja } from './locales/ja';
import { zh } from './locales/zh';

export const translations: Record<Language, TranslationDictionary> = {
  th,
  en,
  ja,
  zh
};

export interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationDictionary;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'mochi_lang_pref';

function isValidLanguage(val: string | null): val is Language {
  return SUPPORTED_LANGUAGES.some((item) => item.code === val);
}

export const I18nProvider: React.FC<{ children: React.ReactNode; initialLocale?: Language }> = ({
  children,
  initialLocale
}) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (initialLocale) return initialLocale;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidLanguage(stored)) return stored;
    } catch {
      // Ignore local storage read errors
    }
    return 'th';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // Ignore local storage write errors
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value: I18nContextType = {
    lang,
    setLang,
    t: translations[lang]
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
