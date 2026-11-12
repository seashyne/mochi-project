// Accessory catalog model and HTTP contract tests for avatar customization

import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import {
  AVATAR_CATALOG,
  getCatalogItem,
  isValidAccessoryId,
  listCatalogByKind
} from '../src/models/avatarCatalog';

describe('Mochi Cloud API - Avatar Accessory Catalog', () => {
  describe('Catalog Model', () => {
    it('exposes unique identifiers across both accessory kinds', () => {
      const ids = AVATAR_CATALOG.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(listCatalogByKind('hat').length).toBeGreaterThan(0);
      expect(listCatalogByKind('shirt').length).toBeGreaterThan(0);
      expect(listCatalogByKind('hat').length + listCatalogByKind('shirt').length).toBe(ids.length);
    });

    it('resolves a known identifier and returns undefined for unknown ones', () => {
      expect(getCatalogItem('hat_cyber_beanie')?.kind).toBe('hat');
      expect(getCatalogItem('shirt_space_cadet')?.kind).toBe('shirt');
      expect(getCatalogItem('hat_not_in_catalog')).toBeUndefined();
      expect(getCatalogItem('')).toBeUndefined();
    });

    it('enforces the accessory kind when validating an equipped identifier', () => {
      expect(isValidAccessoryId('hat_cyber_beanie', 'hat')).toBe(true);
      expect(isValidAccessoryId('hat_cyber_beanie', 'shirt')).toBe(false);
      expect(isValidAccessoryId('shirt_space_cadet', 'shirt')).toBe(true);
      expect(isValidAccessoryId('shirt_space_cadet', 'hat')).toBe(false);
      expect(isValidAccessoryId('usr_injection_attempt', 'hat')).toBe(false);
    });

    it('declares a renderable style and hex color for every item', () => {
      for (const item of AVATAR_CATALOG) {
        expect(item.style.trim().length).toBeGreaterThan(0);
        expect(item.name.trim().length).toBeGreaterThan(0);
        expect(item.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('HTTP Endpoints', () => {
    let env: MochiEnv;
    let authToken: string;

    beforeEach(async () => {
      env = {
        DB: createMockDb(),
        ASSETS: {} as R2Bucket,
        GAME_ROOM: {} as DurableObjectNamespace,
        ENVIRONMENT: 'test',
        ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
        API_HOSTNAME: 'api-game.lenout.com',
        PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
        JWT_SECRET: 'catalog-test-secret-key-32-bytes-minimum'
      };

      const regRes = await app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'catalogcreator',
            email: 'catalog@mochi.test',
            password: 'password123',
            displayName: 'Catalog Creator'
          })
        },
        env
      );
      expect(regRes.status).toBe(201);

      const otp = await env.DB.prepare(
        'SELECT code FROM email_verification_otps WHERE email = ?'
      )
        .bind('catalog@mochi.test')
        .first<{ code: string }>();

      const verifyRes = await app.request(
        '/api/v1/auth/verify-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'catalog@mochi.test', code: otp!.code })
        },
        env
      );
      expect(verifyRes.status).toBe(200);
      authToken = ((await verifyRes.json()) as { token: string }).token;
    });

    async function putAvatar(body: Record<string, unknown>) {
      return app.request(
        '/api/v1/avatars/me',
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        },
        env
      );
    }

    it('serves the catalog publicly without an authorization header', async () => {
      const res = await app.request('/api/v1/avatars/catalog', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; items: typeof AVATAR_CATALOG };
      expect(json.success).toBe(true);
      expect(json.items).toHaveLength(AVATAR_CATALOG.length);
    });

    it('routes /catalog ahead of the :userId parameter route', async () => {
      const res = await app.request('/api/v1/avatars/catalog', { method: 'GET' }, env);
      expect(res.status).not.toBe(404);
      const json = (await res.json()) as { items?: unknown[]; avatar?: unknown };
      expect(json.items).toBeDefined();
      expect(json.avatar).toBeUndefined();
    });

    it('rejects an unknown hat identifier with 400', async () => {
      const res = await putAvatar({ hatId: 'hat_admin_override' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain('Unknown hat identifier');
    });

    it('rejects a shirt identifier supplied in the hat slot', async () => {
      const res = await putAvatar({ hatId: 'shirt_space_cadet' });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown shirt identifier with 400', async () => {
      const res = await putAvatar({ shirtId: 'shirt_free_coins' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain('Unknown shirt identifier');
    });

    it('persists valid catalog accessories alongside body colors', async () => {
      const res = await putAvatar({
        torsoColor: '#10b981',
        hatId: 'hat_crown_royal',
        shirtId: 'shirt_vest_tech'
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        avatar: { torsoColor: string; hatId: string; shirtId: string };
      };
      expect(json.avatar.torsoColor).toBe('#10b981');
      expect(json.avatar.hatId).toBe('hat_crown_royal');
      expect(json.avatar.shirtId).toBe('shirt_vest_tech');
    });

    it('clears an equipped accessory when an empty identifier is supplied', async () => {
      expect((await putAvatar({ hatId: 'hat_halo_neon' })).status).toBe(200);
      const res = await putAvatar({ hatId: '' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { avatar: { hatId?: string } };
      expect(json.avatar.hatId).toBeUndefined();
    });

    it('leaves accessories untouched when only colors are supplied', async () => {
      expect((await putAvatar({ shirtId: 'shirt_hoodie_zip' })).status).toBe(200);
      const res = await putAvatar({ headColor: '#ffffff' });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { avatar: { headColor: string; shirtId: string } };
      expect(json.avatar.headColor).toBe('#ffffff');
      expect(json.avatar.shirtId).toBe('shirt_hoodie_zip');
    });

    it('still rejects malformed colors before accessory validation runs', async () => {
      const res = await putAvatar({ headColor: 'javascript:alert(1)', hatId: 'hat_cap_classic' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain('Invalid color format');
    });
  });
});