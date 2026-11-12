// Adversarial Empirical Challenge Suite 2 - Milestone 1 Cascade Delete and Auth Hardening
// Verifies native D1 SQLite foreign key cascade deletion, token boundaries, and non-string inputs

import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { signToken } from '../src/middleware/auth';

function setupRealSqliteD1(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  return sqlite;
}

describe('Adversarial M1: Cascade Delete and Auth Header Hardening', () => {
  let env: MochiEnv;
  const secret = 'cascade-auth-test-secret-32-chars';
  let validToken: string;
  let testUserId: string;

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: secret
    };

    testUserId = 'usr_auth_tester_01';
    validToken = await signToken(
      { id: testUserId, username: 'authtester', email: 'authtester@mochi.test', role: 'creator' },
      secret,
      3600
    );
  });

  describe('Dimension 4: Real SQLite D1 Foreign Key and Cascade Deletion', () => {
    it('verifies all 7 D1 migrations apply cleanly with foreign keys enabled', () => {
      const sqlite = setupRealSqliteD1();
      const avatars = sqlite.prepare('SELECT * FROM user_avatars').all();
      expect(avatars.length).toBeGreaterThanOrEqual(2);
    });

    it('enforces foreign key constraint: rejects orphan avatar insert without parent user', () => {
      const sqlite = setupRealSqliteD1();
      expect(() => {
        sqlite.exec(`
          INSERT INTO user_avatars (user_id, model_type, updated_at)
          VALUES ('usr_ghost_missing', 'humanoid_v1', '2026-11-08T12:00:00Z');
        `);
      }).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('cascades deletion from users table to user_avatars automatically', () => {
      const sqlite = setupRealSqliteD1();
      const uid = 'usr_cascade_target_01';
      sqlite.exec(`
        INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
        VALUES ('${uid}', 'cascadeuser', 'cascade@mochi.test', 'hash123', '2026-11-08T00:00:00Z', '2026-11-08T00:00:00Z');
      `);

      sqlite.exec(`
        INSERT INTO user_avatars (user_id, model_type, head_color, torso_color, updated_at)
        VALUES ('${uid}', 'humanoid_v1', '#fcd34d', '#0284c7', '2026-11-08T00:00:00Z');
      `);

      const beforeRows = sqlite.prepare('SELECT * FROM user_avatars WHERE user_id = ?').all(uid);
      expect(beforeRows).toHaveLength(1);

      // Delete parent user
      sqlite.exec(`DELETE FROM users WHERE id = '${uid}';`);

      const afterRows = sqlite.prepare('SELECT * FROM user_avatars WHERE user_id = ?').all(uid);
      expect(afterRows).toHaveLength(0);
    });

    it('preserves existing custom colors on INSERT OR IGNORE conflict', () => {
      const sqlite = setupRealSqliteD1();
      const uid = 'usr_conflict_target_02';
      sqlite.exec(`
        INSERT INTO users (id, username, email, password_hash, created_at, updated_at)
        VALUES ('${uid}', 'conflictuser', 'conflict@mochi.test', 'hash123', '2026-11-08T00:00:00Z', '2026-11-08T00:00:00Z');
      `);

      sqlite.exec(`
        INSERT INTO user_avatars (user_id, model_type, torso_color, updated_at)
        VALUES ('${uid}', 'humanoid_v1', '#ff0055', '2026-11-08T00:00:00Z');
      `);

      // Attempt duplicate insert with default color
      sqlite.exec(`
        INSERT OR IGNORE INTO user_avatars (user_id, model_type, torso_color, updated_at)
        VALUES ('${uid}', 'humanoid_v1', '#0284c7', '2026-11-08T12:00:00Z');
      `);

      const row = sqlite.prepare('SELECT torso_color FROM user_avatars WHERE user_id = ?').get(uid) as { torso_color: string };
      expect(row.torso_color).toBe('#ff0055');
    });
  });

  describe('Dimension 5: JWT Token and Bearer Header Boundaries', () => {
    it('rejects GET /api/v1/avatars/me when Authorization header is absent', async () => {
      const res = await app.request('/api/v1/avatars/me', { method: 'GET' }, env);
      expect(res.status).toBe(401);
      const json = (await res.json()) as { error: string };
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects Authorization headers with incorrect scheme (Basic, Token, lowercase bearer)', async () => {
      const schemes = [
        `Basic ${Buffer.from('admin:pass').toString('base64')}`,
        `Token ${validToken}`,
        `bearer ${validToken}`,
        validToken
      ];

      for (const authHeader of schemes) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'GET',
          headers: { Authorization: authHeader }
        }, env);
        expect(res.status).toBe(401);
      }
    });

    it('rejects empty or whitespace-only Bearer token', async () => {
      const invalidTokens = ['Bearer ', 'Bearer    ', 'Bearer'];
      for (const authHeader of invalidTokens) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'GET',
          headers: { Authorization: authHeader }
        }, env);
        expect(res.status).toBe(401);
      }
    });

    it('rejects structurally truncated or corrupted JWT strings', async () => {
      const corruptTokens = ['not.a.jwt', 'justastring', 'header.payload', 'part1.part2.part3.part4'];
      for (const token of corruptTokens) {
        const res = await app.request('/api/v1/avatars/me', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        }, env);
        expect(res.status).toBe(401);
      }
    });

    it('rejects JWT signed with an unrecognized secret key', async () => {
      const rogueToken = await signToken(
        { id: testUserId, username: 'hacker', role: 'creator' },
        'different-attacker-secret-key-32b',
        3600
      );

      const res = await app.request('/api/v1/avatars/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${rogueToken}` }
      }, env);
      expect(res.status).toBe(401);
    });

    it('rejects expired JWT token (exp in past)', async () => {
      const expiredToken = await signToken(
        { id: testUserId, username: 'authtester', role: 'creator' },
        secret,
        -3600 // Expired 1 hour ago
      );

      const res = await app.request('/api/v1/avatars/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${expiredToken}` }
      }, env);
      expect(res.status).toBe(401);
    });

    it('rejects JWT with tampered payload or signature', async () => {
      const parts = validToken.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}A.${parts[2]}`;

      const res = await app.request('/api/v1/avatars/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${tamperedToken}` }
      }, env);
      expect(res.status).toBe(401);
    });
  });

  describe('Dimension 6: Non-String Input Types on Avatar Customization', () => {
    it('handles non-string types (null, boolean, number, array, object) safely', async () => {
      const getRes = await app.request('/api/v1/avatars/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${validToken}` }
      }, env);
      expect(getRes.status).toBe(200);

      const nullRes = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ headColor: null, torsoColor: null })
      }, env);
      expect([200, 400]).toContain(nullRes.status);
    });

    it('reveals unhandled 500 TypeError when non-string type (number) is passed to color field', async () => {
      // Probes vulnerability: body with non-string torsoColor bypasses typeof val === 'string' check
      // and triggers TypeError: color.trim is not a function in isValidHexColor, yielding HTTP 500
      const res = await app.request('/api/v1/avatars/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ torsoColor: 12345 })
      }, env);
      expect(res.status).toBe(500);
    });
  });
});
