// Zustand store owning the authenticated user's 3D avatar and the accessory catalog

import { create } from 'zustand';
import { avatarsApi, resolveAvatarAccessories } from '../api/avatars';
import {
  AvatarCatalogItem,
  DEFAULT_STARTER_AVATAR,
  ResolvedAccessories,
  UpdateAvatarRequest,
  UserAvatar
} from '../api/types';
import { UserAvatarColors } from '../engine/avatar/avatarBuilder';
import { useAuthStore } from './useAuthStore';

export type AvatarErrorCode = 'loadFailed' | 'saveFailed' | 'signInRequired';

export interface AvatarBuildConfig {
  colors: Partial<UserAvatarColors>;
  accessories: ResolvedAccessories;
}

export interface AvatarState {
  avatar: UserAvatar | null;
  catalog: AvatarCatalogItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: AvatarErrorCode | null;

  load: () => Promise<void>;
  save: (updates: UpdateAvatarRequest) => Promise<boolean>;
  resetToStarter: () => Promise<boolean>;
  buildConfig: () => AvatarBuildConfig;
  clearError: () => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  avatar: null,
  catalog: [],
  isLoading: false,
  isSaving: false,
  error: null,

  load: async () => {
    const token = useAuthStore.getState().token;
    set({ isLoading: true, error: null });
    try {
      const catalog = await avatarsApi.getCatalog();
      const avatar = token ? await avatarsApi.getMyAvatar(token) : null;
      set({ catalog, avatar, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'loadFailed', avatar: token ? get().avatar : null });
    }
  },

  save: async (updates: UpdateAvatarRequest) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ error: 'signInRequired' });
      return false;
    }

    set({ isSaving: true, error: null });
    try {
      const avatar = await avatarsApi.updateMyAvatar(updates, token);
      set({ avatar, isSaving: false });
      return true;
    } catch {
      set({ isSaving: false, error: 'saveFailed' });
      return false;
    }
  },

  resetToStarter: () => get().save({
    ...DEFAULT_STARTER_AVATAR,
    hatId: '',
    shirtId: ''
  }),

  buildConfig: () => {
    const { avatar, catalog } = get();
    return {
      colors: avatar || DEFAULT_STARTER_AVATAR,
      accessories: resolveAvatarAccessories(avatar, catalog)
    };
  },

  clearError: () => set({ error: null })
}));