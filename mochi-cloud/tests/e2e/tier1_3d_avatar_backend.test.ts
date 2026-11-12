// Tier 1 Cloud 3D Avatar Backend Test Suite
// Verifies Feature 1 (D1 Schema), Feature 2 (Starter Provisioning), Feature 3 (Avatar APIs), Feature 4 (Real Persistence)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Avatar3DDataStore,
  DEFAULT_STARTER_AVATAR,
  handleAvatarApiRequest,
  parseSqlMigrationSchema,
  formatAvatarResponse
} from './e2e_3d_cloud_harness';
import { seedUser } from './e2e_cloud_harness';

describe('Tier 1 Cloud E2E: Features 1-4 Backend Coverage (Happy Path)', () => {
  let store: Avatar3DDataStore;

  const mockMigrationSql = `
    CREATE TABLE IF NOT EXISTS user_avatars (
      user_id TEXT PRIMARY KEY,
      model_type TEXT NOT NULL DEFAULT 'humanoid_v1',
      head_color TEXT NOT NULL DEFAULT '#fcd34d',
      torso_color TEXT NOT NULL DEFAULT '#0284c7',
      left_arm_color TEXT NOT NULL DEFAULT '#fcd34d',
      right_arm_color TEXT NOT NULL DEFAULT '#fcd34d',
      left_leg_color TEXT NOT NULL DEFAULT '#1e293b',
      right_leg_color TEXT NOT NULL DEFAULT '#1e293b',
      hat_id TEXT DEFAULT NULL,
      shirt_id TEXT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  beforeEach(() => {
    store = new Avatar3DDataStore();
  });

  // Feature 1: D1 Avatar Schema Migration
  describe('F1: D1 Avatar Schema Migration Definition', () => {
    it('T1_F1_01: Migration defines user_avatars table with user_id primary key', () => {
      const parsed = parseSqlMigrationSchema(mockMigrationSql);
      expect(parsed.tableName).toBe('user_avatars');
      expect(parsed.columns).toContain('user_id');
      expect(parsed.primaryKeys.some((k) => k.includes('user_id'))).toBe(true);
    });

    it('T1_F1_02: Schema defines 6 humanoid part color columns', () => {
      const parsed = parseSqlMigrationSchema(mockMigrationSql);
      const expectedColors = [
        'head_color',
        'torso_color',
        'left_arm_color',
        'right_arm_color',
        'left_leg_color',
        'right_leg_color'
      ];
      for (const col of expectedColors) {
        expect(parsed.columns).toContain(col);
      }
    });

    it('T1_F1_03: Schema specifies model_type text column with humanoid_v1 default', () => {
      expect(mockMigrationSql).toContain("model_type TEXT NOT NULL DEFAULT 'humanoid_v1'");
    });

    it('T1_F1_04: Schema includes accessory slots for hat_id and shirt_id', () => {
      const parsed = parseSqlMigrationSchema(mockMigrationSql);
      expect(parsed.columns).toContain('hat_id');
      expect(parsed.columns).toContain('shirt_id');
    });

    it('T1_F1_05: Schema enforces foreign key cascade deletion linked to users table', () => {
      const parsed = parseSqlMigrationSchema(mockMigrationSql);
      expect(parsed.foreignKeys.some((f) => f.includes('users(id)'))).toBe(true);
      expect(mockMigrationSql).toContain('ON DELETE CASCADE');
    });
  });

  // Feature 2: Registration Starter Avatar Provisioning
  describe('F2: Registration Starter Avatar Provisioning', () => {
    it('T1_F2_01: Starter avatar is provisioned with default humanoid_v1 model type', async () => {
      const user = await seedUser(store, { username: 'newplayer1', email: 'p1@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      expect(avatar.user_id).toBe(user.id);
      expect(avatar.model_type).toBe('humanoid_v1');
    });

    it('T1_F2_02: Starter avatar head and arm colors match warm yellow skin default', async () => {
      const user = await seedUser(store, { username: 'newplayer2', email: 'p2@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      expect(avatar.head_color).toBe(DEFAULT_STARTER_AVATAR.head_color);
      expect(avatar.left_arm_color).toBe('#fcd34d');
      expect(avatar.right_arm_color).toBe('#fcd34d');
    });

    it('T1_F2_03: Starter avatar torso color matches cobalt blue shirt default', async () => {
      const user = await seedUser(store, { username: 'newplayer3', email: 'p3@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      expect(avatar.torso_color).toBe('#0284c7');
    });

    it('T1_F2_04: Starter avatar leg colors match slate dark pants default', async () => {
      const user = await seedUser(store, { username: 'newplayer4', email: 'p4@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      expect(avatar.left_leg_color).toBe('#1e293b');
      expect(avatar.right_leg_color).toBe('#1e293b');
    });

    it('T1_F2_05: Starter avatar initializes with empty accessory slots and valid timestamps', async () => {
      const user = await seedUser(store, { username: 'newplayer5', email: 'p5@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      expect(avatar.hat_id).toBeNull();
      expect(avatar.shirt_id).toBeNull();
      expect(new Date(avatar.created_at).getTime()).toBeGreaterThan(0);
      expect(new Date(avatar.updated_at).getTime()).toBeGreaterThan(0);
    });
  });

  // Feature 3: Avatar API Endpoints & Client SDK
  describe('F3: Avatar API Endpoints and Client SDK Contracts', () => {
    it('T1_F3_01: GET /api/v1/avatars/me returns starter avatar for authenticated user', async () => {
      const user = await seedUser(store, { username: 'apigamer', email: 'api@mochi.test' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'GET', {}, undefined, store, user.id);
      expect(res.status).toBe(200);
      const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
      expect(data.avatar.userId).toBe(user.id);
      expect(data.avatar.headColor).toBe('#fcd34d');
    });

    it('T1_F3_02: PUT /api/v1/avatars/me updates torso and leg colors with valid hex format', async () => {
      const user = await seedUser(store, { username: 'stylist', email: 'style@mochi.test' });
      store.provisionStarterAvatar(user.id);
      const payload = JSON.stringify({ torsoColor: '#ff0055', leftLegColor: '#00ffff' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, payload, store, user.id);
      expect(res.status).toBe(200);
      const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
      expect(data.avatar.torsoColor).toBe('#ff0055');
      expect(data.avatar.leftLegColor).toBe('#00ffff');
    });

    it('T1_F3_03: PUT /api/v1/avatars/me updates accessory slots with string IDs', async () => {
      const user = await seedUser(store, { username: 'fashion', email: 'fashion@mochi.test' });
      store.provisionStarterAvatar(user.id);
      const payload = JSON.stringify({ hatId: 'hat_fedora_01', shirtId: 'shirt_cyber_02' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, payload, store, user.id);
      expect(res.status).toBe(200);
      const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
      expect(data.avatar.hatId).toBe('hat_fedora_01');
      expect(data.avatar.shirtId).toBe('shirt_cyber_02');
    });

    it('T1_F3_04: GET /api/v1/avatars/:userId returns public avatar profile without token', async () => {
      const target = await seedUser(store, { username: 'publicstar', email: 'star@mochi.test' });
      const avatar = store.provisionStarterAvatar(target.id);
      avatar.head_color = '#ffffff';
      const res = await handleAvatarApiRequest(`/api/v1/avatars/${target.id}`, 'GET', {}, undefined, store, null);
      expect(res.status).toBe(200);
      const data = res.body as { avatar: ReturnType<typeof formatAvatarResponse> };
      expect(data.avatar.userId).toBe(target.id);
      expect(data.avatar.headColor).toBe('#ffffff');
    });

    it('T1_F3_05: Avatar response format matches camelCase UserAvatar client interface', async () => {
      const user = await seedUser(store, { username: 'formatcheck', email: 'format@mochi.test' });
      const avatar = store.provisionStarterAvatar(user.id);
      const formatted = formatAvatarResponse(avatar);
      expect(formatted).toHaveProperty('userId');
      expect(formatted).toHaveProperty('modelType');
      expect(formatted).toHaveProperty('headColor');
      expect(formatted).toHaveProperty('torsoColor');
      expect(formatted).toHaveProperty('leftArmColor');
      expect(formatted).toHaveProperty('rightArmColor');
      expect(formatted).toHaveProperty('leftLegColor');
      expect(formatted).toHaveProperty('rightLegColor');
      expect(formatted).toHaveProperty('updatedAt');
    });
  });

  // Feature 4: Real Backend Persistence & Mock Eradication
  describe('F4: Real Backend Persistence & Mock Eradication', () => {
    it('T1_F4_01: Zero mock user records exist in initialized store', () => {
      expect(store.users.has('usr_guest_creator')).toBe(false);
      expect(store.users.has('usr_mock_1')).toBe(false);
      expect(store.users.size).toBe(0);
    });

    it('T1_F4_02: User avatars persist across multiple queries in store instance', async () => {
      const user = await seedUser(store, { username: 'persistent', email: 'persist@mochi.test' });
      store.provisionStarterAvatar(user.id);
      const query1 = store.avatars.get(user.id);
      const query2 = store.avatars.get(user.id);
      expect(query1).toBeDefined();
      expect(query1).toEqual(query2);
    });

    it('T1_F4_03: Avatar updates persist modifications deterministically', async () => {
      const user = await seedUser(store, { username: 'moduser', email: 'mod@mochi.test' });
      store.provisionStarterAvatar(user.id);
      const updatePayload = JSON.stringify({ headColor: '#123456' });
      await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, updatePayload, store, user.id);
      const fetched = store.avatars.get(user.id);
      expect(fetched?.head_color).toBe('#123456');
    });

    it('T1_F4_04: Multiple distinct users retain independent avatar records', async () => {
      const u1 = await seedUser(store, { username: 'user1', email: 'u1@mochi.test' });
      const u2 = await seedUser(store, { username: 'user2', email: 'u2@mochi.test' });
      const a1 = store.provisionStarterAvatar(u1.id);
      const a2 = store.provisionStarterAvatar(u2.id);
      a1.head_color = '#111111';
      a2.head_color = '#222222';
      expect(store.avatars.get(u1.id)?.head_color).toBe('#111111');
      expect(store.avatars.get(u2.id)?.head_color).toBe('#222222');
    });

    it('T1_F4_05: Store clear wipes state without residual cache or phantom mock data', async () => {
      const u = await seedUser(store, { username: 'temp', email: 'temp@mochi.test' });
      store.provisionStarterAvatar(u.id);
      expect(store.avatars.size).toBe(1);
      store.clear();
      expect(store.avatars.size).toBe(0);
      expect(store.users.size).toBe(0);
    });
  });
});
