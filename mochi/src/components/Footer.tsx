// Quiet platform footer: brand mark, tagline, and license line only

import React from 'react';
import { useI18n } from '../i18n/context';

export const Footer: React.FC = () => {
  const { t } = useI18n();

  return (
    <footer className="border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#090b10]/95 backdrop-blur-md px-6 py-5 text-xs text-slate-600 dark:text-slate-400 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="mochi-wordmark text-sm text-slate-900 dark:text-white">MOCHI</span>
          <span className="text-slate-700 dark:text-slate-300">{t.footer.tagline}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{t.footer.copyright} · {t.footer.allRightsReserved}</span>
          <span aria-hidden="true">·</span>
          <a href="/credits" className="underline decoration-dotted underline-offset-2 hover:text-slate-900 dark:hover:text-white transition-colors">
            {t.pages.creditsTitle}
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
