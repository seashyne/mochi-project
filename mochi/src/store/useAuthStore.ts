// Centralized Zustand authentication store with persistent session restoration

import { create } from 'zustand';
import { UserProfile } from '../api/types';
import {
  authApi,
  getStoredToken,
  saveStoredToken,
  clearStoredToken
} from '../api/auth';
import { defaultApiClient } from '../api/client';

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
  setError: (error: string | null) => void;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Storage access restricted
  }
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Wire global 401 unauthorized interceptor to automatically wipe credentials
  defaultApiClient.setOnUnauthorized(() => {
    get().logout();
  });

  return {
    user: null,
    token: null,
    isInitialized: false,
    isLoading: false,
    error: null,

    initialize: async () => {
      let storedToken: string | null = null;
      let cachedUser: UserProfile | null = null;

      try {
        const storage = getStorage();
        if (storage) {
          const raw = storage.getItem('mochi_auth_token');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                storedToken = typeof parsed.token === 'string' ? parsed.token : null;
                cachedUser = parsed.user || null;
              } else {
                storedToken = raw;
              }
            } catch {
              // Corrupted non-JSON stored token: clean up without throwing
              clearStoredToken();
              set({
                user: null,
                token: null,
                isInitialized: true,
                isLoading: false,
                error: null
              });
              return;
            }
          }
        }
      } catch {
        // Ignore storage access errors
      }

      if (!storedToken) {
        storedToken = getStoredToken();
      }

      if (!storedToken) {
        set({
          user: null,
          token: null,
          isInitialized: true,
          isLoading: false,
          error: null
        });
        return;
      }

      if (cachedUser) {
        set({ user: cachedUser, token: storedToken });
      }

      set({ isLoading: true, error: null });
      try {
        defaultApiClient.setToken(storedToken);
        const res = await authApi.me(storedToken);
        if (res && res.user) {
          saveStoredToken(storedToken, res.user);
          set({
            user: res.user,
            token: storedToken,
            isInitialized: true,
            isLoading: false,
            error: null
          });
        } else {
          get().logout();
          set({ isInitialized: true, isLoading: false });
        }
      } catch {
        get().logout();
        set({ isInitialized: true, isLoading: false });
      }
    },

    login: (token: string, user: UserProfile) => {
      saveStoredToken(token, user);
      defaultApiClient.setToken(token);
      set({
        user,
        token,
        isInitialized: true,
        isLoading: false,
        error: null
      });
    },

    logout: () => {
      clearStoredToken();
      defaultApiClient.setToken(null);
      set({
        user: null,
        token: null,
        error: null
      });
    },

    updateUser: (updates: Partial<UserProfile>) => {
      const currentUser = get().user;
      if (currentUser) {
        const updated = {
          ...currentUser,
          ...updates
        };
        const token = get().token;
        if (token) {
          saveStoredToken(token, updated);
        }
        set({
          user: updated
        });
      }
    },

    setError: (error: string | null) => {
      set({ error });
    }
  };
});
