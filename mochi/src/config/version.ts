// Centralized Mochi Multi-Application Version Registry
// Distinguishes independent release cycles across Web Portal, Studio App, 3D Engine, Mobile, and Cloud API

export interface AppVersionInfo {
  name: string;
  appId: string;
  version: string;
  buildTag: string;
  channel: 'stable' | 'beta' | 'preview';
  description: string;
}

export const MOCHI_VERSIONS = {
  // Web Portal Application (game.lenout.com)
  web: {
    name: 'Mochi Web Portal',
    appId: 'mochi-web',
    version: '1.2.0',
    buildTag: 'web-2026.11',
    channel: 'stable' as const,
    description: 'Player discovery, game catalog, avatar shop, and social hub'
  },

  // Dedicated Creator Studio Application (studio-game.lenout.com)
  studio: {
    name: 'Mochi Studio',
    appId: 'mochi-studio',
    version: '1.0.0-creator',
    buildTag: 'studio-2026.11',
    channel: 'beta' as const,
    description: 'Full-screen 3D world builder, Lua 5.4 editor, and physics simulator'
  },

  // 3D Runtime & Game Player Engine
  engine: {
    name: 'Mochi 3D Engine',
    appId: 'mochi-engine',
    version: '0.9.5',
    buildTag: 'engine-wasm-r3',
    channel: 'stable' as const,
    description: 'Three.js WebGL & WebAssembly physics simulation engine'
  },

  // Cloudflare Workers Backend Services (api-game.lenout.com)
  cloud: {
    name: 'Mochi Cloud API',
    appId: 'mochi-cloud',
    version: '1.0.0',
    buildTag: 'cf-worker-prod',
    channel: 'stable' as const,
    description: 'Cloudflare Workers, D1 database, and R2 asset storage backend'
  },

  // Native Mobile App Client (iOS and Android container)
  mobile: {
    name: 'Mochi Mobile App',
    appId: 'mochi-mobile',
    version: '1.0.0',
    buildTag: 'cap-v6',
    channel: 'beta' as const,
    description: 'Cross-platform mobile player client container'
  }
} as const;

export type AppTargetKey = keyof typeof MOCHI_VERSIONS;

export function getAppVersionInfo(target: AppTargetKey): AppVersionInfo {
  return MOCHI_VERSIONS[target];
}

export function getActiveAppVersion(isStudio?: boolean): AppVersionInfo {
  if (isStudio !== undefined) {
    return isStudio ? MOCHI_VERSIONS.studio : MOCHI_VERSIONS.web;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith('studio') || host.includes('studio-game')) {
      return MOCHI_VERSIONS.studio;
    }
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith('/studio')) {
      return MOCHI_VERSIONS.studio;
    }
  }
  return MOCHI_VERSIONS.web;
}

export function formatVersionBadge(info: AppVersionInfo): string {
  return `${info.name} v${info.version}`;
}
