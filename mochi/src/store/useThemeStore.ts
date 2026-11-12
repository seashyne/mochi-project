// Mochi Dual Theme Store (Dark Gaming Obsidian & Crisp Light Quartz)
// Controls application theme, persists to localStorage, and updates documentElement classes

import { create } from 'zustand';

export type MochiTheme = 'dark' | 'light';

interface ThemeState {
  theme: MochiTheme;
  setTheme: (theme: MochiTheme) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

const THEME_STORAGE_KEY = 'mochi_theme';

function applyThemeToDocument(theme: MochiTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark', // Default to sleek obsidian dark

  setTheme: (theme: MochiTheme) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Safe fallback for restricted storage environments
      }
    }
    applyThemeToDocument(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  initTheme: () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as MochiTheme | null;
      if (saved === 'dark' || saved === 'light') {
        get().setTheme(saved);
        return;
      }
    } catch {
      // Ignore storage access errors
    }
    // Default to dark
    applyThemeToDocument('dark');
  }
}));
