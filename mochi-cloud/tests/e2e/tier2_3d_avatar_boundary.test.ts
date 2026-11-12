// Tier 2 Cloud 3D Avatar Boundary & Corner Cases Test Suite
// Verifies boundary conditions for F1 (Schema constraints), F2 (Provisioning edges), F3 (API boundaries), F4 (Persistence integrity)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Avatar3DDataStore,
  handleAvatarApiRequest,
  validateAvatarColors,
  parseSqlMigrationSchema
} from './e2e_3d_cloud_harness';
import { seedUser } from './e2e_cloud_harness';

describe('Tier 2 Cloud E2E: Features 1-4 Boundary & Corner Cases', () => {
  let store: Avatar3DDataStore;

  beforeEach(() => {
    store = new Avatar3DDataStore();
  });

  // Feature 1 Boundary: Schema Constraints
  describe('F1 Boundary: Schema Parsing and Constraint Edge Cases', () => {
    it('T2_F1_01: Rejects SQL migration lacking CREATE TABLE clause', () => {
      const badSql = 'ALTER TABLE users ADD COLUMN something TEXT;';
      const parsed = parseSqlMigrationSchema(badSql);
      expect(parsed.tableName).toBe('');
      expect(parsed.columns).toHaveLength(0);
    });

    it('T2_F1_02: Detects missing required columns in incomplete migration schema', () => {
      const partialSql = `
        CREATE TABLE user_avatars (
          user_id TEXT PRIMARY KEY,
          model_type TEXT NOT NULL
        );
      `;
      const parsed = parseSqlMigrationSchema(partialSql);
      expect(parsed.columns).not.toContain('head_color');
      expect(parsed.columns).not.toContain('torso_color');
      expect(parsed.columns).not.toContain('left_arm_color');
    });

    it('T2_F1_03: Handles schema containing comments and whitespace formatting variations', () => {
      const formattedSql = `
        -- Leading comment
        CREATE TABLE IF NOT EXISTS user_avatars (
          -- user primary key
          user_id TEXT PRIMARY KEY,
          head_color TEXT DEFAULT '#ffffff'
        );
      `;
      const parsed = parseSqlMigrationSchema(formattedSql);
      expect(parsed.tableName).toBe('user_avatars');
      expect(parsed.columns).toContain('user_id');
      expect(parsed.columns).toContain('head_color');
    });

    it('T2_F1_04: Verifies foreign key REFERENCES users(id) syntax resilience', () => {
      const fkSql = 'CREATE TABLE user_avatars ( user_id TEXT, FOREIGN KEY (user_id) REFERENCES users(id) );';
      const parsed = parseSqlMigrationSchema(fkSql);
      expect(parsed.foreignKeys.length).toBeGreaterThan(0);
      expect(parsed.foreignKeys[0]).toContain('users(id)');
    });

    it('T2_F1_05: Ignores malformed non-column declarations without crashing parser', () => {
      const malformedSql = `
        CREATE TABLE test_tab (
          CHECK (id > 0),
          UNIQUE (name),
          invalid_tokens_without_type
        );
      `;
      const parsed = parseSqlMigrationSchema(malformedSql);
      expect(parsed.tableName).toBe('test_tab');
      expect(parsed.columns).not.toContain('invalid_tokens_without_type');
    });
  });

  // Feature 2 Boundary: Starter Provisioning Edge Cases
  describe('F2 Boundary: Starter Avatar Provisioning Edge Cases', () => {
    it('T2_F2_01: Provisioning handles UUID with special hyphens and length variations', () => {
      const customId = 'usr_custom_uuid_00000000-1111-2222-3333-444444444444';
      const avatar = store.provisionStarterAvatar(customId);
      expect(avatar.user_id).toBe(customId);
      expect(store.avatars.get(customId)).toBeDefined();
    });

    it('T2_F2_02: Calling provisioning twice on same user overwrites or resets to starter state', () => {
      const userId = 'u_idempotent';
      const first = store.provisionStarterAvatar(userId);
      first.head_color = '#000000';
      const second = store.provisionStarterAvatar(userId);
      expect(second.head_color).toBe('#fcd34d');
      expect(store.avatars.get(userId)?.head_color).toBe('#fcd34d');
    });

    it('T2_F2_03: Supports high-volume sequential provisioning without memory corruption', () => {
      for (let i = 0; i < 50; i++) {
        store.provisionStarterAvatar(`stress_user_${i}`);
      }
      expect(store.avatars.size).toBe(50);
      expect(store.avatars.get('stress_user_49')?.model_type).toBe('humanoid_v1');
    });

    it('T2_F2_04: Provisioned avatar created_at matches valid ISO 8601 UTC string', () => {
      const avatar = store.provisionStarterAvatar('iso_test_user');
      expect(avatar.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('T2_F2_05: Handles internationalized or alphanumeric user ID keys safely', () => {
      const unicodeId = 'usr_player_99';
      const avatar = store.provisionStarterAvatar(unicodeId);
      expect(store.avatars.has(unicodeId)).toBe(true);
      expect(avatar.user_id).toBe(unicodeId);
    });
  });

  // Feature 3 Boundary: Avatar API Validation & Edge Cases
  describe('F3 Boundary: Avatar API Validation & Security Edge Cases', () => {
    it('T2_F3_01: PUT /api/v1/avatars/me returns 401 when token is missing or null', async () => {
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, '{"headColor":"#112233"}', store, null);
      expect(res.status).toBe(401);
    });

    it('T2_F3_02: PUT /api/v1/avatars/me rejects invalid hex colors without hash symbol', async () => {
      const user = await seedUser(store, { username: 'b1', email: 'b1@mochi.test' });
      const payload = JSON.stringify({ headColor: 'ff00aa' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, payload, store, user.id);
      expect(res.status).toBe(400);
      const data = res.body as { error: string };
      expect(data.error).toContain('Invalid hex color format');
    });

    it('T2_F3_03: PUT /api/v1/avatars/me rejects 3-digit shorthand or 8-digit alpha hex codes', () => {
      expect(validateAvatarColors({ headColor: '#fff' }).valid).toBe(false);
      expect(validateAvatarColors({ torsoColor: '#11223344' }).valid).toBe(false);
      expect(validateAvatarColors({ leftArmColor: 'rgb(255,0,0)' }).valid).toBe(false);
    });

    it('T2_F3_04: PUT /api/v1/avatars/me rejects malformed non-JSON request body', async () => {
      const user = await seedUser(store, { username: 'b2', email: 'b2@mochi.test' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, 'this is not json {', store, user.id);
      expect(res.status).toBe(400);
    });

    it('T2_F3_05: GET /api/v1/avatars/:userId returns 404 for non-existent user ID', async () => {
      const res = await handleAvatarApiRequest('/api/v1/avatars/non_existent_user_999', 'GET', {}, undefined, store, null);
      expect(res.status).toBe(404);
    });
  });

  // Feature 4 Boundary: Persistence & Injection Edge Cases
  describe('F4 Boundary: Persistence & Injection Defense', () => {
    it('T2_F4_01: Rejects SQL injection attempts in color fields via regex validation', () => {
      const maliciousPayload = { headColor: "'; DROP TABLE user_avatars; --" };
      const validation = validateAvatarColors(maliciousPayload);
      expect(validation.valid).toBe(false);
    });

    it('T2_F4_02: Rejects XSS script tags embedded in color parameters', () => {
      const xssPayload = { torsoColor: '<script>alert(1)</script>' };
      const validation = validateAvatarColors(xssPayload);
      expect(validation.valid).toBe(false);
    });

    it('T2_F4_03: Read-only userId field cannot be overwritten via PUT payload', async () => {
      const user = await seedUser(store, { username: 'tamperer', email: 'tamper@mochi.test' });
      store.provisionStarterAvatar(user.id);
      const maliciousPayload = JSON.stringify({ userId: 'usr_stolen_id', headColor: '#aabbcc' });
      await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, maliciousPayload, store, user.id);
      const updated = store.avatars.get(user.id);
      expect(updated?.user_id).toBe(user.id);
      expect(store.avatars.has('usr_stolen_id')).toBe(false);
    });

    it('T2_F4_04: Rejects unsupported HTTP verbs with 405 Method Not Allowed', async () => {
      const user = await seedUser(store, { username: 'verbcheck', email: 'verb@mochi.test' });
      const res = await handleAvatarApiRequest('/api/v1/avatars/me', 'DELETE', {}, undefined, store, user.id);
      expect(res.status).toBe(405);
    });

    it('T2_F4_05: Preserves unmentioned fields when updating partial avatar colors', async () => {
      const user = await seedUser(store, { username: 'partial', email: 'part@mochi.test' });
      const initial = store.provisionStarterAvatar(user.id);
      const originalTorso = initial.torso_color;
      const originalLeg = initial.left_leg_color;

      const payload = JSON.stringify({ headColor: '#999999' });
      await handleAvatarApiRequest('/api/v1/avatars/me', 'PUT', {}, payload, store, user.id);

      const modified = store.avatars.get(user.id);
      expect(modified?.head_color).toBe('#999999');
      expect(modified?.torso_color).toBe(originalTorso);
      expect(modified?.left_leg_color).toBe(originalLeg);
    });
  });
});
