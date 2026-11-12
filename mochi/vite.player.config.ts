import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { serviceWorkerStamp } from './vite.plugins.ts';

// Player app build: portal, catalog, social surfaces and the game viewport.
// Deliberately excludes every Studio component so players never download the editor.
export default defineConfig({
  plugins: [react(), serviceWorkerStamp(path.resolve(import.meta.dirname, 'dist'))],
  envDir: import.meta.dirname,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
