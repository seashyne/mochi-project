// E2E Web Test Harness for Mochi Platform Production Requirements
// Provides DOM/storage mocks, theme token validators, and auth store contract harness

import fs from 'node:fs';
import path from 'node:path';
import { UserProfile } from '../../src/api/types';

export class MockLocalStorage implements Storage {
  private data: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.data).length;
  }

  public getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }

  public setItem(key: string, value: string): void {
    this.data[key] = String(value);
  }

  public removeItem(key: string): void {
    delete this.data[key];
  }

  public clear(): void {
    this.data = {};
  }

  public key(index: number): string | null {
    const keys = Object.keys(this.data);
    return keys[index] || null;
  }
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateUser: (updates: Partial<UserProfile>) => void;
}

export function createContractAuthStore(storage: Storage): {
  getState: () => AuthState;
  setState: (partial: Partial<AuthState>) => void;
  subscribe: (fn: (state: AuthState) => void) => () => void;
} {
  const STORAGE_KEY = 'mochi_auth_token';
  const subscribers = new Set<(state: AuthState) => void>();

  let state: AuthState = {
    user: null,
    token: null,
    isInitialized: false,
    isLoading: false,
    error: null,
    async initialize() {
      state.isLoading = true;
      notify();
      const stored = storage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { token: string; user: UserProfile };
          state.token = parsed.token;
          state.user = parsed.user;
        } catch {
          storage.removeItem(STORAGE_KEY);
          state.token = null;
          state.user = null;
        }
      }
      state.isLoading = false;
      state.isInitialized = true;
      notify();
    },
    login(token: string, user: UserProfile) {
      state.token = token;
      state.user = user;
      state.error = null;
      storage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      notify();
    },
    logout() {
      state.token = null;
      state.user = null;
      state.error = null;
      storage.removeItem(STORAGE_KEY);
      notify();
    },
    updateUser(updates: Partial<UserProfile>) {
      if (state.user) {
        state.user = { ...state.user, ...updates };
        if (state.token) {
          storage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
        }
        notify();
      }
    }
  };

  function notify(): void {
    subscribers.forEach((fn) => fn(state));
  }

  return {
    getState: () => state,
    setState: (partial: Partial<AuthState>) => {
      state = { ...state, ...partial };
      notify();
    },
    subscribe: (fn: (s: AuthState) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

export function evaluateThemeTokenSources(): {
  cssContent: string;
  tailwindContent: string;
  hasDarkBgToken: boolean;
  hasGlassPanel: boolean;
  hasGlowBorders: boolean;
  hasAvatarFrames: boolean;
} {
  const rootDir = path.resolve(__dirname, '../../');
  const cssPath = path.join(rootDir, 'src/index.css');
  const tailwindPath = path.join(rootDir, 'tailwind.config.js');

  const cssContent = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const tailwindContent = fs.existsSync(tailwindPath) ? fs.readFileSync(tailwindPath, 'utf8') : '';

  return {
    cssContent,
    tailwindContent,
    hasDarkBgToken: cssContent.includes('--mochi-bg') || tailwindContent.includes('mochi.bg'),
    hasGlassPanel: cssContent.includes('mochi-glass-panel') || cssContent.includes('backdrop-blur'),
    hasGlowBorders: cssContent.includes('box-shadow') || cssContent.includes('border-') || cssContent.includes('--mochi-border'),
    hasAvatarFrames: cssContent.includes('avatar') || cssContent.includes('badge') || cssContent.includes('border')
  };
}

export function scanZeroEmojis(dirPath: string): { violations: { file: string; line: number }[] } {
  const violations: { file: string; line: number }[] = [];
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;

  function traverse(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        traverse(full);
      } else if (/\.(tsx?|css|html|md)$/.test(entry.name)) {
        const lines = fs.readFileSync(full, 'utf8').split('\n');
        lines.forEach((line, idx) => {
          if (emojiRegex.test(line)) {
            violations.push({ file: full, line: idx + 1 });
          }
        });
      }
    }
  }

  traverse(dirPath);
  return { violations };
}
