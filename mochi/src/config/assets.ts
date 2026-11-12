// Resolves the origins used for static content.
// - Bundled CC0 content (skyboxes, material presets) ships with the app.
// - Creator uploads are served from a dedicated asset host so the domain can be
//   rebound for migration by changing one environment variable.

const DEFAULT_ACCESS_ASSET_HOST = 'https://access-game.lenout.com';

export function resolveAssetBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const configured = import.meta.env.VITE_CDN_URL as string | undefined;
    if (configured && configured.trim().length > 0) {
      return configured.trim().replace(/\/+$/, '');
    }
  }
  return '';
}

// Empty VITE_ACCESS_ASSETS_URL means "serve from the current origin", which is
// what local development wants; production defaults to the dedicated host.
export function resolveAccessAssetHost(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const configured = import.meta.env.VITE_ACCESS_ASSETS_URL as string | undefined;
    if (configured !== undefined) {
      return configured.trim().replace(/\/+$/, '');
    }
    if (import.meta.env.PROD === true) {
      return DEFAULT_ACCESS_ASSET_HOST;
    }
    return '';
  }
  return '';
}

export function resolveAccessAssetUrl(path: string, host = resolveAccessAssetHost()): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = host.replace(/\/+$/, '');
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
