// Mochi Studio entry point: creator workspace only, no portal or service worker.
// Lives beside its own document so the studio build keeps a self-contained root.

import React from 'react';
import ReactDOM from 'react-dom/client';
import StudioApp from '../../src/apps/studio/StudioApp';
import { I18nProvider } from '../../src/i18n/context';
import { registerServiceWorker } from '../../src/pwa/registerServiceWorker';
import { useThemeStore } from '../../src/store/useThemeStore';
import '../../src/index.css';
import '../../src/theme-soft.css';
import '../../src/styles/studio-theme.css';
import '../../src/styles/auth.css';

// Sync the theme store with the class the document script already applied.
useThemeStore.getState().initTheme();

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <I18nProvider>
        <StudioApp />
      </I18nProvider>
    </React.StrictMode>
  );
}

// The editor chunk is large, so cache it: a repeat visit should not re-download it.
registerServiceWorker();
