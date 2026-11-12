// Avatar accessory geometry, rig binding, and persisted avatar store behavior

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { avatarsApi, resolveAvatarAccessories } from '../src/api/avatars';
import { AvatarCatalogItem, DEFAULT_STARTER_AVATAR, UserAvatar } from '../src/api/types';
import {
  createAccessoryGroup,
  getStylePrimitives
} from '../src/engine/avatar/avatarAccessories';
import { buildHumanoidAvatar } from '../src/engine/avatar/avatarBuilder';
import { bindPlayerAvatar } from '../src/engine/avatar/playerAvatar';
import { useAvatarStore } from '../src/store/useAvatarStore';
import { useAuthStore } from '../src/store/useAuthStore';

vi.mock('../src/api/avatars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/avatars')>();
  return {
    ...actual,
    avatarsApi: {
      getCatalog: vi.fn(),
      getMyAvatar: vi.fn(),
      updateMyAvatar: vi.fn()
    }
  };
});

const CATALOG: AvatarCatalogItem[] = [
  { id: 'hat_crown_royal', kind: 'hat', name: 'Royal Crown', style: 'crown', color: '#fbbf24' },
  { id: 'hat_halo_neon', kind: 'hat', name: 'Neon Halo', style: 'halo', color: '#a3e635' },
  { id: 'shirt_vest_tech', kind: 'shirt', name: 'Tech Vest', style: 'vest', color: '#0ea5e9' }
];

function makeAvatar(overrides: Partial<UserAvatar> = {}): UserAvatar {
  return {
    userId: 'usr_avatar_1',
    updatedAt: '2026-11-09T00:00:00.000Z',
    ...DEFAULT_STARTER_AVATAR,
    ...overrides
  };
}

describe('Avatar accessory resolution', () => {
  it('returns an empty set when no avatar is persisted', () => {
    expect(resolveAvatarAccessories(null, CATALOG)).toEqual({});
    expect(resolveAvatarAccessories(makeAvatar(), [])).toEqual({});
  });

  it('resolves equipped identifiers into style and color definitions', () => {
    const resolved = resolveAvatarAccessories(
      makeAvatar({ hatId: 'hat_crown_royal', shirtId: 'shirt_vest_tech' }),
      CATALOG
    );
    expect(resolved.hat).toEqual({ style: 'crown', color: '#fbbf24' });
    expect(resolved.shirt).toEqual({ style: 'vest', color: '#0ea5e9' });
  });

  it('drops unknown identifiers and identifiers equipped in the wrong slot', () => {
    const resolved = resolveAvatarAccessories(
      makeAvatar({ hatId: 'shirt_vest_tech', shirtId: 'shirt_not_in_catalog' }),
      CATALOG
    );
    expect(resolved.hat).toBeUndefined();
    expect(resolved.shirt).toBeUndefined();
  });
});

describe('Procedural accessory geometry', () => {
  const HAT_STYLES = ['beanie', 'cap', 'crown', 'halo', 'horns', 'bucket'];
  const SHIRT_STYLES = ['decal', 'stripes', 'hoodie', 'vest', 'tee', 'jacket'];

  it('defines primitives for every published accessory style', () => {
    for (const style of HAT_STYLES) {
      expect(getStylePrimitives('hat', style).length).toBeGreaterThan(0);
    }
    for (const style of SHIRT_STYLES) {
      expect(getStylePrimitives('shirt', style).length).toBeGreaterThan(0);
    }
  });

  it('falls back to a wearable primitive set for an unrecognized style', () => {
    expect(getStylePrimitives('hat', 'style_from_future_catalog').length).toBeGreaterThan(0);
    expect(getStylePrimitives('shirt', 'style_from_future_catalog').length).toBeGreaterThan(0);
  });

  it('builds one mesh per primitive with the catalog material color', () => {
    const crown = createAccessoryGroup('hat', { style: 'crown', color: '#fbbf24' });
    expect(crown.group.name).toBe('avatar_hat');
    expect(crown.group.children).toHaveLength(getStylePrimitives('hat', 'crown').length);
    const mesh = crown.group.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('fbbf24');
    expect(mesh.castShadow).toBe(true);
    crown.dispose();
    expect(crown.group.children).toHaveLength(0);
  });

  it('keeps every primitive position a finite three-component vector', () => {
    for (const style of [...HAT_STYLES, ...SHIRT_STYLES]) {
      const kind = HAT_STYLES.includes(style) ? 'hat' : 'shirt';
      for (const spec of getStylePrimitives(kind, style)) {
        expect(spec.position).toHaveLength(3);
        spec.position.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      }
    }
  });
});

describe('Humanoid rig accessory slots', () => {
  it('parents hats to the head and shirts to the torso so they follow animation', () => {
    const avatar = buildHumanoidAvatar(undefined, {
      hat: { style: 'halo', color: '#a3e635' },
      shirt: { style: 'vest', color: '#0ea5e9' }
    });
    expect(avatar.parts.head.getObjectByName('avatar_hat')).toBeDefined();
    expect(avatar.parts.torso.getObjectByName('avatar_shirt')).toBeDefined();
    avatar.dispose();
  });

  it('swaps, clears, and preserves accessories without duplicating meshes', () => {
    const avatar = buildHumanoidAvatar(undefined, { hat: { style: 'halo', color: '#a3e635' } });
    const first = avatar.parts.head.getObjectByName('avatar_hat');

    avatar.setAccessories({ hat: { style: 'halo', color: '#a3e635' } });
    expect(avatar.parts.head.getObjectByName('avatar_hat')).toBe(first);

    avatar.setAccessories({ hat: { style: 'crown', color: '#fbbf24' } });
    expect(avatar.parts.head.children.filter((child) => child.name === 'avatar_hat')).toHaveLength(1);
    expect(avatar.parts.head.getObjectByName('avatar_hat')).not.toBe(first);

    avatar.setAccessories({});
    expect(avatar.parts.head.getObjectByName('avatar_hat')).toBeUndefined();
    avatar.dispose();
  });
});

describe('Persisted avatar store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ token: null });
    useAvatarStore.setState({
      avatar: null,
      catalog: [],
      isLoading: false,
      isSaving: false,
      error: null
    });
  });

  it('builds starter defaults when nothing is persisted', () => {
    const config = useAvatarStore.getState().buildConfig();
    expect(config.colors.headColor).toBe(DEFAULT_STARTER_AVATAR.headColor);
    expect(config.accessories).toEqual({});
  });

  it('refuses to save without a session and reports signInRequired', async () => {
    expect(await useAvatarStore.getState().save({ torsoColor: '#10b981' })).toBe(false);
    expect(useAvatarStore.getState().error).toBe('signInRequired');
    expect(avatarsApi.updateMyAvatar).not.toHaveBeenCalled();
  });

  it('loads the public catalog and the authenticated avatar together', async () => {
    useAuthStore.setState({ token: 'token-abc' });
    vi.mocked(avatarsApi.getCatalog).mockResolvedValue(CATALOG);
    vi.mocked(avatarsApi.getMyAvatar).mockResolvedValue(makeAvatar({ hatId: 'hat_crown_royal' }));

    await useAvatarStore.getState().load();

    const state = useAvatarStore.getState();
    expect(state.catalog).toHaveLength(3);
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.buildConfig().accessories.hat).toEqual({ style: 'crown', color: '#fbbf24' });
    expect(avatarsApi.getMyAvatar).toHaveBeenCalledWith('token-abc');
  });

  it('keeps the catalog usable for guests without requesting a private avatar', async () => {
    vi.mocked(avatarsApi.getCatalog).mockResolvedValue(CATALOG);
    await useAvatarStore.getState().load();
    expect(useAvatarStore.getState().avatar).toBeNull();
    expect(useAvatarStore.getState().catalog).toHaveLength(3);
    expect(avatarsApi.getMyAvatar).not.toHaveBeenCalled();
  });

  it('reports loadFailed and preserves the last known avatar on network error', async () => {
    useAuthStore.setState({ token: 'token-abc' });
    useAvatarStore.setState({ avatar: makeAvatar({ torsoColor: '#10b981' }) });
    vi.mocked(avatarsApi.getCatalog).mockRejectedValue(new Error('offline'));

    await useAvatarStore.getState().load();

    expect(useAvatarStore.getState().error).toBe('loadFailed');
    expect(useAvatarStore.getState().isLoading).toBe(false);
    expect(useAvatarStore.getState().avatar?.torsoColor).toBe('#10b981');
  });

  it('persists edits and reports saveFailed when the API rejects them', async () => {
    useAuthStore.setState({ token: 'token-abc' });
    vi.mocked(avatarsApi.updateMyAvatar).mockResolvedValue(makeAvatar({ torsoColor: '#10b981' }));
    expect(await useAvatarStore.getState().save({ torsoColor: '#10b981' })).toBe(true);
    expect(useAvatarStore.getState().avatar?.torsoColor).toBe('#10b981');
    expect(useAvatarStore.getState().isSaving).toBe(false);

    vi.mocked(avatarsApi.updateMyAvatar).mockRejectedValue(new Error('server error'));
    expect(await useAvatarStore.getState().save({ torsoColor: '#ffffff' })).toBe(false);
    expect(useAvatarStore.getState().error).toBe('saveFailed');
    expect(useAvatarStore.getState().isSaving).toBe(false);
  });

  it('resets to starter colors and clears both accessory slots', async () => {
    useAuthStore.setState({ token: 'token-abc' });
    vi.mocked(avatarsApi.updateMyAvatar).mockResolvedValue(makeAvatar());
    await useAvatarStore.getState().resetToStarter();
    expect(avatarsApi.updateMyAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        torsoColor: DEFAULT_STARTER_AVATAR.torsoColor,
        hatId: '',
        shirtId: ''
      }),
      'token-abc'
    );
  });
});

describe('Live player avatar binding', () => {
  beforeEach(() => {
    useAvatarStore.setState({ avatar: null, catalog: CATALOG, error: null });
  });

  it('hot-applies persisted edits to the running rig without a rebuild', () => {
    const binding = bindPlayerAvatar();
    const torsoMaterial = binding.avatar.materials.torso;

    useAvatarStore.setState({
      avatar: makeAvatar({ torsoColor: '#10b981', hatId: 'hat_crown_royal' })
    });

    expect(torsoMaterial.color.getHexString()).toBe('10b981');
    expect(binding.avatar.parts.head.getObjectByName('avatar_hat')).toBeDefined();
    binding.dispose();
  });

  it('stops observing the store once disposed', () => {
    const binding = bindPlayerAvatar();
    const torsoMaterial = binding.avatar.materials.torso;
    binding.dispose();

    useAvatarStore.setState({ avatar: makeAvatar({ torsoColor: '#ff0000' }) });
    expect(torsoMaterial.color.getHexString()).not.toBe('ff0000');
  });
});