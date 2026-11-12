// Tier 4 Cloud 3D Real-World Application Scenarios Test Suite
// Verifies end-to-end player onboarding, creator workflows, and cross-session avatar lifecycle

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Avatar3DDataStore,
  handleAvatarApiRequest,
  formatAvatarResponse
} from './e2e_3d_cloud_harness';
import { seedUser } from './e2e_cloud_harness';

describe('Tier 4 Cloud E2E: Real-World Backend Application Scenarios', () => {
  let store: Avatar3DDataStore;

  beforeEach(() => {
    store = new Avatar3DDataStore();
  });

  // Scenario 1: Complete New Player Onboarding
  it('T4_C01: Full Player Onboarding: Register, verify starter avatar, customize colors, view profile', async () => {
    // Step 1: User registers
    const newUser = await seedUser(store, { username: 'robloxian_prime', email: 'prime@mochi.test', role: 'player' });
    expect(newUser.id).toBeDefined();

    // Step 2: Starter avatar provisioned automatically
    const starterAvatar = store.provisionStarterAvatar(newUser.id);
    expect(starterAvatar.model_type).toBe('humanoid_v1');
    expect(starterAvatar.head_color).toBe('#fcd34d');
    expect(starterAvatar.torso_color).toBe('#0284c7');

    // Step 3: Fetch personal avatar via authenticated endpoint
    const meRes = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, newUser.id);
    expect(meRes.status).toBe(200);

    // Step 4: Player customizes avatar in Profile Modal
    const customPayload = JSON.stringify({
      headColor: '#ffe4c4',
      torsoColor: '#dc2626',
      leftLegColor: '#0f172a',
      rightLegColor: '#0f172a'
    });
    const putRes = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, customPayload, store, newUser.id);
    expect(putRes.status).toBe(200);

    // Step 5: Friend views player profile publicly
    const friendRes = await handleAvatarApiRequest(`/api/v1/avatars/${newUser.id}`, 'GET', {}, undefined, store, null);
    expect(friendRes.status).toBe(200);
    const friendData = friendRes.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(friendData.avatar.headColor).toBe('#ffe4c4');
    expect(friendData.avatar.torsoColor).toBe('#dc2626');
  });

  // Scenario 2: 3D Creator Publishing & World Identity
  it('T4_C02: Creator Lifecycle: Register, equip builder outfit, create game record, and bind avatar', async () => {
    const creator = await seedUser(store, { username: 'world_architect', email: 'builder@mochi.test', role: 'creator' });
    store.provisionStarterAvatar(creator.id);

    // Customize to builder helmet & hi-vis jacket
    const builderPayload = JSON.stringify({
      torsoColor: '#eab308',
      hatId: 'hat_hard_hat_yellow',
      shirtId: 'shirt_safety_vest'
    });
    await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, builderPayload, store, creator.id);

    // Create game record linked to creator
    const gameId = 'game_cyber_parkour_01';
    store.games.set(gameId, {
      id: gameId,
      slug: 'cyber-parkour-01',
      title: 'Cyber Parkour 3D',
      description: 'Futuristic parkour obstacle course',
      creator_id: creator.id,
      thumbnail_url: 'https://assets-game.lenout.com/thumbnails/cyber.png',
      status: 'published',
      current_version_id: 'v1.0.0',
      play_count: 0,
      is_featured: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const gameRecord = store.games.get(gameId);
    expect(gameRecord).toBeDefined();
    expect(gameRecord?.creator_id).toBe(creator.id);

    // Verify creator's avatar is retrievable by players entering the game
    const avatarRes = await handleAvatarApiRequest(`/api/v1/avatars/${gameRecord!.creator_id}`, 'GET', {}, undefined, store, null);
    const avatarData = avatarRes.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(avatarData.avatar.torsoColor).toBe('#eab308');
    expect(avatarData.avatar.hatId).toBe('hat_hard_hat_yellow');
  });

  // Scenario 3: Cross-Session Token Refresh & Avatar Continuity
  it('T4_C03: Cross-Session Persistence: User modifies avatar, logs in on another device, state intact', async () => {
    const user = await seedUser(store, { username: 'multidevice_gamer', email: 'multi@mochi.test' });
    store.provisionStarterAvatar(user.id);

    // Device 1 (Desktop): User chooses neon theme avatar
    await handleAvatarApiRequest(
      '/api/v1/avatars/me',
      'PUT',
      {},
      JSON.stringify({ headColor: '#22c55e', torsoColor: '#6366f1' }),
      store,
      user.id
    );

    // Device 2 (Mobile Tablet): User signs in and fetches current avatar
    const tabletFetch = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, user.id);
    const tabletData = tabletFetch.body as { avatar: ReturnType<typeof formatAvatarResponse> };

    expect(tabletData.avatar.headColor).toBe('#22c55e');
    expect(tabletData.avatar.torsoColor).toBe('#6366f1');
    expect(tabletData.avatar.userId).toBe(user.id);
  });

  // Scenario 4: Defense Against Input Tampering & Injection during Customization
  it('T4_C04: Security Defense: Malicious payloads are rejected without altering stored avatar state', async () => {
    const user = await seedUser(store, { username: 'defended_user', email: 'defended@mochi.test' });
    const initial = store.provisionStarterAvatar(user.id);
    const initialUpdatedAt = initial.updated_at;

    // Attempt invalid color injections
    const attacks = [
      JSON.stringify({ headColor: 'javascript:alert(1)' }),
      JSON.stringify({ torsoColor: '#gggggg' }),
      JSON.stringify({ leftArmColor: '#12345' }),
      JSON.stringify({ rightArmColor: '#1234567' })
    ];

    for (const attack of attacks) {
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, attack, store, user.id);
      expect(res.status).toBe(400);
    }

    // Confirm stored avatar was not corrupted
    const cleanAvatar = store.avatars.get(user.id);
    expect(cleanAvatar?.head_color).toBe('#fcd34d');
    expect(cleanAvatar?.updated_at).toBe(initialUpdatedAt);
  });

  // Scenario 5: High-Frequency Avatar Re-theming Under Rapid Updates
  it('T4_C05: Rapid Theme Customization: Sequential color updates maintain correct state and order', async () => {
    const user = await seedUser(store, { username: 'rapid_customizer', email: 'rapid@mochi.test' });
    store.provisionStarterAvatar(user.id);

    const colorSequence = ['#111111', '#222222', '#333333', '#444444', '#555555'];

    for (const color of colorSequence) {
      const res = await handleAvatarApiRequest(
        '/api/v1/avatars/me',
        'PUT',
        {},
        JSON.stringify({ torsoColor: color }),
        store,
        user.id
      );
      expect(res.status).toBe(200);
    }

    const finalRes = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, user.id);
    const finalData = finalRes.body as { avatar: ReturnType<typeof formatAvatarResponse> };
    expect(finalData.avatar.torsoColor).toBe('#555555');
  });
});
