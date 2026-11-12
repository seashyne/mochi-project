// Local display preferences that do not require an account.

import { create } from 'zustand';

export type Density = 'comfortable' | 'compact';

interface PreferenceState {
  reduceMotion: boolean;
  density: Density;
  setReduceMotion: (value: boolean) => void;
  setDensity: (value: Density) => void;
  initPreferences: () => void;
}

const STORAGE_KEY = 'mochi_preferences_v1';

function applyDocument(reduceMotion: boolean, density: Density): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  document.documentElement.dataset.density = density;
}

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  reduceMotion: false,
  density: 'comfortable',

  setReduceMotion: (value: boolean) => {
    applyDocument(value, get().density);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: value, density: get().density }));
    } catch {
      // Ignore storage errors
    }
    set({ reduceMotion: value });
  },

  setDensity: (value: Density) => {
    applyDocument(get().reduceMotion, value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ reduceMotion: get().reduceMotion, density: value }));
    } catch {
      // Ignore storage errors
    }
    set({ density: value });
  },

  initPreferences: () => {
    let reduceMotion = false;
    let density: Density = 'comfortable';
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PreferenceState>;
        reduceMotion = Boolean(parsed.reduceMotion);
        density = parsed.density === 'compact' ? 'compact' : 'comfortable';
      }
    } catch {
      // Ignore malformed preferences
    }
    applyDocument(reduceMotion, density);
    set({ reduceMotion, density });
  }
}));
