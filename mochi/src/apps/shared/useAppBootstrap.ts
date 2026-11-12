// Shared boot sequence for both split apps: theme, preferences, session and the
// physics kernel. Kept in one place so Studio and Player can never drift apart.

import { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { usePreferenceStore } from '../../store/usePreferenceStore';
import { initWasmPhysics } from '../../engine/physics/wasmPhysics';
import type { UserProfile } from '../../api/types';

export interface AppBootstrapState {
  user: UserProfile | null;
  isInitialized: boolean;
  logout: () => void;
}

export function useAppBootstrap(): AppBootstrapState {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const initialize = useAuthStore((s) => s.initialize);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    useThemeStore.getState().initTheme();
    usePreferenceStore.getState().initPreferences();
    void initialize();
    void initWasmPhysics();
  }, [initialize]);

  return { user, isInitialized, logout };
}
