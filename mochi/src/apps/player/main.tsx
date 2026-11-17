// Mochi Player entry point: the portal, catalog, social surfaces and game viewport.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../App';
import { I18nProvider } from '../../i18n/context';
import { registerServiceWorker } from '../../pwa/registerServiceWorker';
import '../../index.css';
import '../../styles/fonts.css';
import '../../theme-soft.css';
import '../../styles/studio-theme.css';
import '../../styles/landing.css';
import '../../styles/landing-grid.css';
import '../../styles/game-cards.css';
import '../../styles/auth.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>
  );
}

registerServiceWorker();
