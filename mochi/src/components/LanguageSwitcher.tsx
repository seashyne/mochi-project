// Accessible Multi-Language Switcher Dropdown Component

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { SUPPORTED_LANGUAGES, Language } from '../i18n/types';

export const LanguageSwitcher: React.FC = () => {
  const { lang, setLang, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectLanguage = (code: Language) => {
    setLang(code);
    setIsOpen(false);
  };

  const currentMeta =
    SUPPORTED_LANGUAGES.find((item) => item.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={t.nav.language}
        className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 dark:bg-[#23252b] border border-slate-200 dark:border-[#34363d] hover:border-slate-300 dark:hover:border-gray-500 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-gray-200 dark:hover:text-white transition-colors"
      >
        <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
        <span className="uppercase text-[11px] font-mono tracking-wider">
          {currentMeta.shortCode}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400 dark:text-gray-400" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white dark:bg-[#191b20] border border-slate-200 dark:border-[#2c2e35] shadow-xl py-1 z-50 overflow-hidden"
        >
          {SUPPORTED_LANGUAGES.map((item) => {
            const isSelected = item.code === lang;
            return (
              <button
                key={item.code}
                role="menuitem"
                type="button"
                onClick={() => handleSelectLanguage(item.code)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left ${
                  isSelected
                    ? 'bg-[#00a2ff]/15 text-[#00a2ff] font-bold'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-white/5'
                }`}
              >
                <div className="flex flex-col">
                  <span className="leading-tight">{item.label}</span>
                  <span className="text-[10px] text-slate-400 dark:text-gray-500 font-normal">
                    {item.englishLabel}
                  </span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#00a2ff] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
