// Build-time stamping for the service worker.
// public/sw.js ships with a __BUILD_ID__ placeholder; each build replaces it so
// every deploy gets its own cache generation. The worker then evicts the
// previous generation on activate, which keeps the cache from growing without
// bound and guarantees a fresh deploy is never served from a stale cache.

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const SW_BUILD_ID_PLACEHOLDER = '__BUILD_ID__';

export function serviceWorkerStamp(outDir: string): Plugin {
  return {
    name: 'mochi-service-worker-stamp',
    apply: 'build',
    closeBundle() {
      const target = path.join(outDir, 'sw.js');
      if (!fs.existsSync(target)) return;

      const buildId = process.env.MOCHI_BUILD_ID ?? Date.now().toString(36);
      const source = fs.readFileSync(target, 'utf8');
      fs.writeFileSync(target, source.replace(SW_BUILD_ID_PLACEHOLDER, buildId));
    }
  };
}
