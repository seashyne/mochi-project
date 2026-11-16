// Platform footer: policy link row, language heading, and the attribution line.

import React from 'react';
import { Globe } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { SUPPORTED_LANGUAGES } from '../i18n/types';
import { LegalPageKind } from './legal/LegalPage';

export interface FooterProps {
  onNavigateLegal?: (kind: LegalPageKind) => void;
}

const LINK_GROUPS: { kind: LegalPageKind; labelKey: keyof ReturnType<typeof useI18n>['t']['legal'] }[] = [
  { kind: 'about', labelKey: 'footerAboutUs' },
  { kind: 'jobs', labelKey: 'footerJobs' },
  { kind: 'newsroom', labelKey: 'footerNewsroom' },
  { kind: 'parents', labelKey: 'footerParents' },
  { kind: 'gift-cards', labelKey: 'footerGiftCards' },
  { kind: 'help', labelKey: 'footerHelp' },
  { kind: 'terms', labelKey: 'footerTerms' },
  { kind: 'accessibility', labelKey: 'footerAccessibility' },
  { kind: 'privacy', labelKey: 'footerPrivacy' },
  { kind: 'privacy-choices', labelKey: 'footerPrivacyChoices' },
  { kind: 'sitemap', labelKey: 'footerSitemap' }
];

export const Footer: React.FC<FooterProps> = ({ onNavigateLegal }) => {
  const { t, lang, setLang } = useI18n();
  const L = t.legal;

  return (
    <footer className="border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#090b10]/95 backdrop-blur-md px-6 py-8 text-xs text-slate-600 dark:text-slate-400 transition-colors">
      <div className="max-w-7xl mx-auto">
        <nav
          aria-label={L.footerChooseLanguage}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-medium"
        >
          {LINK_GROUPS.map((group) => (
            <button
              key={group.kind}
              type="button"
              onClick={() => onNavigateLegal?.(group.kind)}
              className="text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              {L[group.labelKey]}
            </button>
          ))}
        </nav>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-white/[0.08] pt-6">
          <div className="flex items-center gap-2.5">
            <Globe className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">{L.footerLanguageHeading}</span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as typeof lang)}
              aria-label={L.footerChooseLanguage}
              className="rounded-lg border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#12151c] px-2 py-1 text-[12px] font-medium text-slate-700 dark:text-slate-200 focus:border-[#00a2ff] focus:outline-none transition-colors"
            >
              {SUPPORTED_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="mochi-wordmark text-sm text-slate-900 dark:text-white">MOCHI</span>
            <span aria-hidden="true">·</span>
            <span>{t.footer.tagline}</span>
            <span aria-hidden="true">·</span>
            <span>{t.footer.copyright}</span>
            <span>{L.footerRights}</span>
            <a
              href="/credits"
              className="underline decoration-dotted underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {t.pages.creditsTitle}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
