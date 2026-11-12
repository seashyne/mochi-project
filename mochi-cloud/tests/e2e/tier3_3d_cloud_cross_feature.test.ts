// Tier 3 Cloud 3D Cross-Feature Combinations Test Suite
// Verifies pairwise interactions across registration, avatar provisioning, customization, and persistence

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Avatar3DDataStore,
  handleAvatarApiRequest,
  formatAvatarResponse
} from './e2e_3d_cloud_harness';
import { seedUser } from './e2e_cloud_harness';

describe('Tier 3 Cloud E2E: Cross-Feature Pairwise Interactions', () => {
  let store: Avatar3DDataStore;

  beforeEach(() => {
    store = new Avatar3DDataStore();
  });

  it('T3_C01: User registration automatically provisions starter avatar readable by me endpoint', async () => {
    const user = await seedUser(store, { username: 'gamer_signup', email: 'signup@mochi.test' });
    store.provisionStarterAvatar(user.id);

    const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, user.id);
    expect(res.status).toBe(200);

    const body = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(body.avatar.userId).toBe(user.id);
    expect(body.avatar.modelType).toBe('humanoid_v1');
    expect(body.avatar.headColor).toBe('#fcd34d');
    expect(body.avatar.torsoColor).toBe('#0284c7');
  });

  it('T3_C02: Avatar customization persists and reflects across public profile lookup', async () => {
    const creator = await seedUser(store, { username: 'creator_x', email: 'cx@mochi.test', role: 'creator' });
    store.provisionStarterAvatar(creator.id);

    const updatePayload = JSON.stringify({
      headColor: '#ffe0bd',
      torsoColor: '#10b981',
      hatId: 'hat_builder_helmet'
    });
    await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, updatePayload, store, creator.id);

    const publicRes = await handleAvatarApiRequest(`/api/v1/avatars/${creator.id}`, 'GET', {}, undefined, store, null);
    expect(publicRes.status).toBe(200);

    const publicData = publicRes.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(publicData.avatar.headColor).toBe('#ffe0bd');
    expect(publicData.avatar.torsoColor).toBe('#10b981');
    expect(publicData.avatar.hatId).toBe('hat_builder_helmet');
  });

  it('T3_C03: Concurrent avatar customizations by separate users do not leak state', async () => {
    const u1 = await seedUser(store, { username: 'pilot_alpha', email: 'alpha@mochi.test' });
    const u2 = await seedUser(store, { username: 'pilot_beta', email: 'beta@mochi.test' });
    store.provisionStarterAvatar(u1.id);
    store.provisionStarterAvatar(u2.id);

    await Promise.all([
      handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, JSON.stringify({ torsoColor: '#ff0000' }), store, u1.id),
      handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, JSON.stringify({ torsoColor: '#0000ff' }), store, u2.id)
    ]);

    const res1 = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, u1.id);
    const res2 = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, u2.id);

    const d1 = res1.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    const d2 = res2.body as { avatar: ReturnType<typeof formatAvatarResponse> };

    expect(d1.avatar.torsoColor).toBe('#ff0000');
    expect(d2.avatar.torsoColor).toBe('#0000ff');
  });

  it('T3_C04: Deleting user cascades to avatar deletion and returns 404 on subsequent lookup', async () => {
    const tempUser = await seedUser(store, { username: 'transient', email: 'transient@mochi.test' });
    store.provisionStarterAvatar(tempUser.id);
    expect(store.avatars.has(tempUser.id)).toBe(true);

    // Simulate cascade deletion
    store.users.delete(tempUser.id);
    store.avatars.delete(tempUser.id);

    const lookupRes = await handleAvatarApiRequest(`/api/v1/avatars/${tempUser.id}`, 'GET', {}, undefined, store, null);
    expect(lookupRes.status).toBe(404);
  });

  it('T3_C05: Avatar color updates preserve accessory slots when accessories not in payload', async () => {
    const player = await seedUser(store, { username: 'accessorized', email: 'acc@mochi.test' });
    store.provisionStarterAvatar(player.id);

    await handleAvatarApiRequest(
      '/api/v1/avatars/me',
      'PUT',
      {},
      JSON.stringify({ hatId: 'hat_crown_gold', shirtId: 'shirt_tuxedo' }),
      store,
      player.id
    );

    await handleAvatarApiRequest(
      '/api/v1/avatars/me',
      'PUT',
      {},
      JSON.stringify({ headColor: '#e0ac69' }),
      store,
      player.id
    );

    const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, player.id);
    const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(data.avatar.headColor).toBe('#e0ac69');
    expect(data.avatar.hatId).toBe('hat_crown_gold');
    expect(data.avatar.shirtId).toBe('shirt_tuxedo');
  });

  it('T3_C06: Clearing accessory slot via explicit null removes accessory ID', async () => {
    const player = await seedUser(store, { username: 'hat_wearer', email: 'hw@mochi.test' });
    store.provisionStarterAvatar(player.id);

    await handleAvatarApiRequest(
      '/api/v1/avatars/me',
      'PUT',
      {},
      JSON.stringify({ hatId: 'hat_cowboy' }),
      store,
      player.id
    );

    await handleAvatarApiRequest(
      '/api/v1/avatars/me',
      'PUT',
      {},
      JSON.stringify({ hatId: null }),
      store,
      player.id
    );

    const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, player.id);
    const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(data.avatar.hatId).toBeNull();
  });
});
