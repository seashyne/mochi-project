import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { serviceWorkerStamp } from './vite.plugins.ts';

// Studio app build: creator workspace only. Rooted at apps/studio so both the
// dev server and the SPA fallback resolve to the Studio document, while the
// shared engine, API client and auth store are read from ../src.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'apps/studio'),
  envDir: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, 'public'),
  plugins: [react(), serviceWorkerStamp(path.resolve(import.meta.dirname, 'dist-studio'))],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src')
    }
  },
  server: {
    port: 5174,
    host: true,
    fs: {
      allow: [path.resolve(import.meta.dirname, '..')]
    }
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-studio'),
    emptyOutDir: true
  }
});
