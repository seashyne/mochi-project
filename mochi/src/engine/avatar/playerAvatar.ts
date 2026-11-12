// Binds the persisted user avatar to a live player rig and hot-applies editor changes

import { HumanoidAvatarInstance, buildHumanoidAvatar } from './avatarBuilder';
import { useAvatarStore } from '../../store/useAvatarStore';

export interface PlayerAvatarBinding {
  avatar: HumanoidAvatarInstance;
  dispose: () => void;
}

export function bindPlayerAvatar(): PlayerAvatarBinding {
  const initial = useAvatarStore.getState().buildConfig();
  const avatar = buildHumanoidAvatar(initial.colors, initial.accessories);

  const unsubscribe = useAvatarStore.subscribe((state, previous) => {
    if (state.avatar === previous.avatar && state.catalog === previous.catalog) return;
    const next = state.buildConfig();
    avatar.updateColors(next.colors);
    avatar.setAccessories(next.accessories);
  });

  return {
    avatar,
    dispose: () => {
      unsubscribe();
      avatar.dispose();
    }
  };
}