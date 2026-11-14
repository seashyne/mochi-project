// Multi-Language Internationalization (i18n) Context Provider and Hook

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TranslationDictionary } from './types';
import {
  Language,
  bundledCatalog,
  bundledCatalogs,
  isBundled,
  languageMeta,
  loadCatalog,
  resolveInitialLanguage
} from './registry';

// Kept for tests and legacy imports: the bundled tier, resolved synchronously.
export const translations = bundledCatalogs;

export interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationDictionary;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'mochi_lang_pref';

function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore local storage write errors
  }
}

export const I18nProvider: React.FC<{ children: React.ReactNode; initialLocale?: Language }> = ({
  children,
  initialLocale
}) => {
  const [lang, setLangState] = useState<Language>(() =>
    resolveInitialLanguage(initialLocale, readStoredLanguage())
  );
  // Always a complete dictionary: a bundled locale resolves instantly, so the
  // first paint is never a flash of empty strings while a chunk loads.
  const [catalog, setCatalog] = useState<TranslationDictionary>(() => bundledCatalog(lang));

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    writeStoredLanguage(newLang);
  };

  useEffect(() => {
    let alive = true;
    if (isBundled(lang)) {
      setCatalog(bundledCatalog(lang));
      return;
    }
    void loadCatalog(lang).then((next) => {
      if (alive) setCatalog(next);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = languageMeta(lang).rtl ? 'rtl' : 'ltr';
  }, [lang]);

  const value: I18nContextType = {
    lang,
    setLang,
    t: catalog
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
