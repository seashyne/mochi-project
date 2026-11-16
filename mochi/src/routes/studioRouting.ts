// Studio and Play URL Route Synchronization and Parameter Parsing
// Pure routing helpers for Mochi Studio (/studio) and Play (/play, /game) pathname parsing

import { GameSummary } from '../api/types';

export interface StudioRouteResult {
  isStudio: boolean;
  mapId: string | null;
  projectId: string | null;
}

export interface PlayRouteResult {
  isPlay: boolean;
  mapId: string | null;
}

export function sanitizeMapId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return null;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function isValidMapId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function generateMapId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isStudioSubdomain(hostname?: string): boolean {
  let host = hostname;
  if (!host && typeof window !== 'undefined') {
    host = window.location.hostname;
  }
  if (!host) return false;
  const lower = host.toLowerCase();
  return (
    lower === 'studio.lenout.com' ||
    lower === 'studio-game.lenout.com' ||
    lower.startsWith('studio.') ||
    lower.startsWith('studio-')
  );
}

export function isStudioPathname(pathname: string, hostname?: string): boolean {
  if (isStudioSubdomain(hostname)) return true;
  const clean = pathname.trim();
  return clean === '/studio' || clean.startsWith('/studio/');
}

// Resolves the deployable base URL for each split app. VITE_PLAYER_URL and
// VITE_STUDIO_URL let a local dev server point at the other app explicitly.
function resolveAppBase(kind: 'player' | 'studio'): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const override = kind === 'player' ? env.VITE_PLAYER_URL : env.VITE_STUDIO_URL;
  if (override) return override.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('lenout.com')) {
      return kind === 'player' ? 'https://game.lenout.com' : 'https://studio.lenout.com';
    }
  }
  return '';
}

export function resolveStudioExternalUrl(mapId?: string | null): string {
  const sanitized = sanitizeMapId(mapId);
  const base = resolveAppBase('studio');
  const path = sanitized ? `/${sanitized}` : '';
  if (base) return `${base}${path}`;
  return resolveStudioPath(sanitized);
}

export function resolvePlayerExternalUrl(mapId?: string | null): string {
  const sanitized = sanitizeMapId(mapId);
  const base = resolveAppBase('player');
  const path = sanitized ? resolvePlayPath(sanitized) : '/';
  return base ? `${base}${path}` : path;
}

export function resolveWebPortalUrl(): string {
  const base = resolveAppBase('player');
  return base || '/';
}

export function isPlayPathname(pathname: string): boolean {
  const clean = pathname.trim();
  return (
    clean === '/play' ||
    clean.startsWith('/play/') ||
    clean === '/game' ||
    clean.startsWith('/game/')
  );
}

export function parseStudioParams(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const id = params.get('mapId') || params.get('projectId');
    if (!id) return null;
    return sanitizeMapId(id);
  } catch {
    return null;
  }
}

export function parseStudioRoute(
  pathname: string,
  search = '',
  hostname?: string
): StudioRouteResult {
  const clean = pathname.trim();
  const onSubdomain = isStudioSubdomain(hostname);
  const isStudio = onSubdomain || isStudioPathname(clean);
  if (!isStudio) {
    return { isStudio: false, mapId: null, projectId: null };
  }

  const segments = clean.split('/').filter(Boolean);
  let resolvedId: string | null = null;

  if (segments.length >= 2 && segments[0] === 'studio') {
    resolvedId = sanitizeMapId(segments[1]);
  } else if (onSubdomain && segments.length >= 1) {
    resolvedId = sanitizeMapId(segments[0] === 'studio' ? segments[1] : segments[0]);
  }

  if (!resolvedId && search) {
    resolvedId = parseStudioParams(search);
  }

  return {
    isStudio: true,
    mapId: resolvedId,
    projectId: resolvedId
  };
}

export function parsePlayRoute(pathname: string): PlayRouteResult {
  const clean = pathname.trim();
  const isPlay = isPlayPathname(clean);
  if (!isPlay) {
    return { isPlay: false, mapId: null };
  }

  const segments = clean.split('/').filter(Boolean);
  let resolvedId: string | null = null;

  if (segments.length >= 2 && (segments[0] === 'play' || segments[0] === 'game')) {
    resolvedId = sanitizeMapId(segments[1]);
  }

  return {
    isPlay: true,
    mapId: resolvedId
  };
}

export function resolveStudioPath(mapId?: string | null): string {
  const sanitized = sanitizeMapId(mapId);
  return sanitized ? `/studio/${sanitized}` : '/studio';
}

export function resolvePlayPath(mapId: string): string {
  const sanitized = sanitizeMapId(mapId);
  return sanitized ? `/play/${sanitized}` : '/play';
}

export function isShopPathname(pathname: string): boolean {
  const clean = pathname.trim();
  return clean === '/shop' || clean.startsWith('/shop/');
}

// Third-party attribution page. Its content is the generated notice file that
// Vite copies from mochi/public, so the page never drifts from the build.
export function isCreditsPathname(pathname: string): boolean {
  const clean = pathname.trim().replace(/\/+$/, '') || '/';
  return clean === '/credits';
}

export const SIMPLE_NAV_PATHS: Record<string, string> = {
  home: '/',
  catalog: '/catalog',
  shop: '/shop',
  studio: '/studio',
  admin: '/admin',
  friends: '/friends',
  messages: '/messages',
  inventory: '/inventory',
  trade: '/trade',
  groups: '/groups',
  news: '/news',
  settings: '/settings',
  plus: '/plus'
};

export function resolveNavPath(tab: string): string {
  return SIMPLE_NAV_PATHS[tab] || '/';
}

// Resolves a browser pathname back into a navigation tab key
export function getNavTabFromPathname(pathname: string): string | null {
  const clean = pathname.trim().replace(/\/+$/, '') || '/';
  if (clean === '/admin' || clean.startsWith('/admin/')) return 'admin';
  if (isStudioPathname(clean)) return 'studio';
  if (isPlayPathname(clean)) return 'player';
  const entry = Object.entries(SIMPLE_NAV_PATHS).find(([, path]) => path === clean);
  return entry ? entry[0] : null;
}

// Static policy and information pages. Each one is a plain pathname so the
// pages are linkable and survive a refresh.
export const LEGAL_PATHS: Record<string, string> = {
  about: '/about',
  jobs: '/jobs',
  newsroom: '/newsroom',
  parents: '/parents',
  'gift-cards': '/gift-cards',
  help: '/help',
  terms: '/terms',
  accessibility: '/accessibility',
  privacy: '/privacy',
  'privacy-choices': '/privacy-choices',
  sitemap: '/sitemap'
};

export function resolveLegalPath(kind: string): string {
  return LEGAL_PATHS[kind] || '/';
}

// Resolves a browser pathname back into a legal page kind
export function getLegalKindFromPathname(pathname: string): string | null {
  const clean = pathname.trim().replace(/\/+$/, '') || '/';
  const entry = Object.entries(LEGAL_PATHS).find(([, path]) => path === clean);
  return entry ? entry[0] : null;
}

export type AuthModeTag = 'signin' | 'signup' | 'forgot' | 'email_code' | 'qr';

export function getAuthModeFromHash(hash: string): AuthModeTag | null {
  const clean = hash.replace(/^#\/?/, '').toLowerCase();
  const map: Record<string, AuthModeTag> = {
    forgot: 'forgot', 'reset-password': 'forgot',
    signin: 'signin', login: 'signin',
    signup: 'signup', register: 'signup',
    'email-code': 'email_code', code: 'email_code',
    qr: 'qr'
  };
  return map[clean] || null;
}

export function buildMapGameSummary(mapId: string, creatorId = 'creator'): GameSummary {
  return {
    id: mapId,
    slug: mapId,
    title: `Map: ${mapId}`,
    description: 'Mochi Experience',
    creatorId,
    thumbnailUrl: null,
    status: 'published',
    playCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: 'v1.0.0'
  };
}
