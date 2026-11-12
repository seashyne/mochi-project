import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export const INSTALL_DISMISS_KEY = 'mochi_install_dismiss_until';
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPromptState {
  mode: 'native' | 'ios' | null;
  busy: boolean;
  failed: boolean;
}

export function isInstallDismissed(value: string | null, now = Date.now()): boolean {
  const until = Number(value);
  return Number.isFinite(until) && until > now;
}

export function isIosSafari(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent)
    || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return ios && /Version\/[\d.]+.*Safari\//.test(nav.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/.test(nav.userAgent);
}

export function useInstallPrompt() {
  const [state, setState] = useState<InstallPromptState>({ mode: null, busy: false, failed: false });
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const suppressed = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const displayMode = window.matchMedia(
      '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'
    );
    const standalone = displayMode.matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = isInstallDismissed(localStorage.getItem(INSTALL_DISMISS_KEY));
    } catch { /* Storage can be disabled in private browsing. */ }
    suppressed.current = Boolean(standalone || dismissed || Capacitor.isNativePlatform() || !window.isSecureContext);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (suppressed.current) return;
      deferred.current = event as BeforeInstallPromptEvent;
      setState({ mode: 'native', busy: false, failed: false });
    };
    const onInstalled = () => {
      suppressed.current = true;
      deferred.current = null;
      setState({ mode: null, busy: false, failed: false });
    };
    const onDisplayMode = () => { if (displayMode.matches) onInstalled(); };

    if (!suppressed.current && isIosSafari(navigator)) {
      setState({ mode: 'ios', busy: false, failed: false });
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', onDisplayMode);
    return () => {
      mounted.current = false;
      deferred.current = null;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', onDisplayMode);
    };
  }, []);

  const dismiss = () => {
    suppressed.current = true;
    deferred.current = null;
    setState({ mode: null, busy: false, failed: false });
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + INSTALL_DISMISS_MS));
    } catch { /* The in-memory dismissal still applies when storage is unavailable. */ }
  };

  const install = async () => {
    const event = deferred.current;
    if (!event || suppressed.current) return;
    // A browser install event is single-use and must be prompted inside the click gesture.
    deferred.current = null;
    setState({ mode: 'native', busy: true, failed: false });
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (!mounted.current || suppressed.current) return;
      if (choice.outcome === 'dismissed') dismiss();
      else {
        suppressed.current = true;
        setState({ mode: null, busy: false, failed: false });
      }
    } catch {
      if (mounted.current && !suppressed.current) {
        setState({ mode: 'native', busy: false, failed: true });
      }
    }
  };

  return { ...state, install, dismiss };
}
