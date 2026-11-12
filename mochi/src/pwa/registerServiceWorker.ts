// Registers the Mochi service worker in production builds for offline playback.

export interface ServiceWorkerEnv {
  isProduction: boolean;
  hasServiceWorker: boolean;
}

export function shouldRegisterServiceWorker(env: ServiceWorkerEnv): boolean {
  return env.isProduction && env.hasServiceWorker;
}

export function registerServiceWorker(
  env?: ServiceWorkerEnv
): void {
  const resolved: ServiceWorkerEnv = env ?? {
    isProduction: import.meta.env.PROD,
    hasServiceWorker:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  };
  if (!shouldRegisterServiceWorker(resolved)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is optional; never block the app on registration.
    });
  });
}
