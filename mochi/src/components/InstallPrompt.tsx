import { useId } from 'react';
import { Download, Share } from 'lucide-react';
import { useI18n } from '../i18n/context';
import type { InstallPromptState } from '../pwa/useInstallPrompt';
import '../styles/install.css';

interface InstallPromptProps extends InstallPromptState {
  hidden?: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallPrompt({ mode, busy, failed, hidden, onInstall, onDismiss }: InstallPromptProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  if (!mode || hidden) return null;
  const ios = mode === 'ios';

  return (
    <section className="mochi-install" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="mochi-install-heading">
        <img className="mochi-install-icon" src="/favicon.svg" width="48" height="48" alt="" />
        <div>
          <h2 id={titleId}>{ios ? t.install.iosTitle : t.install.title}</h2>
          <p id={descriptionId}>{t.install.desc}</p>
        </div>
      </div>
      {ios && (
        <p className="mochi-install-hint">
          <Share size={20} aria-hidden="true" />
          <span>{t.install.iosHint}</span>
        </p>
      )}
      {failed && <p className="mochi-install-error" role="alert">{t.install.failed}</p>}
      <div className="mochi-install-actions">
        <button type="button" className="mochi-install-later" onClick={onDismiss}>
          {t.install.notNow}
        </button>
        {!ios && !failed && (
          <button type="button" className="mochi-install-button" onClick={onInstall} disabled={busy} aria-busy={busy}>
            <Download size={17} aria-hidden="true" />
            {busy ? t.install.installing : t.install.installBtn}
          </button>
        )}
      </div>
    </section>
  );
}
