// Tier 5 adversarial tests: asset access keys. Verifies the "upload before use"
// gate, key id shape, and the dedicated access asset domain resolution.

import { describe, it, expect } from 'vitest';
import {
  ACCESS_ID_PATTERN,
  describeFailure,
  generateAccessId,
  isValidAccessId,
  resolveAccessKey,
  statusToHttpCode,
  type AccessKeyRecord
} from '../src/services/assetAccessKeys';
import { resolveAccessAssetUrl } from '../src/services/assetPipeline';
import { collectObjectAssetRefs, formatRefFailure } from '../src/services/objectAssetRefs';
import type { AccessGrant } from '../src/services/assetAccess';

const NOW = '2026-08-01T00:00:00.000Z';

function key(overrides: Partial<AccessKeyRecord> = {}): AccessKeyRecord {
  return {
    accessId: 'acc_0123456789abcdef0123',
    fileId: 'file-1',
    ownerId: 'owner-1',
    status: 'ready',
    createdAt: NOW,
    ...overrides
  };
}

const publicSubject = { ownerId: 'owner-1', visibility: 'public' as const };
const privateSubject = { ownerId: 'owner-1', visibility: 'private' as const };

describe('Tier 5: Asset Access Key Hardening', () => {
  describe('Access id format', () => {
    it('generates ids matching the published pattern', () => {
      for (let i = 0; i < 20; i += 1) {
        const id = generateAccessId();
        expect(id).toMatch(ACCESS_ID_PATTERN);
        expect(id.startsWith('acc_')).toBe(true);
      }
    });

    it('generates unique ids', () => {
      const ids = new Set(Array.from({ length: 200 }, () => generateAccessId()));
      expect(ids.size).toBe(200);
    });

    it('rejects malformed ids', () => {
      expect(isValidAccessId('acc_0123456789abcdef0123')).toBe(true);
      expect(isValidAccessId('acc_short')).toBe(false);
      expect(isValidAccessId('acc_0123456789abcdef012G')).toBe(false);
      expect(isValidAccessId('../../assets/x')).toBe(false);
      expect(isValidAccessId('acc_0123456789abcdef0123 ')).toBe(true);
      expect(isValidAccessId(null)).toBe(false);
      expect(isValidAccessId(42)).toBe(false);
    });
  });

  describe('Upload-before-use gate', () => {
    it('refuses an unknown key', () => {
      expect(resolveAccessKey(null, publicSubject, {}, [], NOW)).toEqual({
        ok: false,
        reason: 'not_found'
      });
    });

    it('refuses keys whose upload has not finished', () => {
      expect(resolveAccessKey(key({ status: 'pending' }), publicSubject, {}, [], NOW)).toEqual({
        ok: false,
        reason: 'pending'
      });
    });

    it('refuses blocked keys even for the owner', () => {
      expect(
        resolveAccessKey(key({ status: 'blocked' }), publicSubject, { userId: 'owner-1' }, [], NOW)
      ).toEqual({ ok: false, reason: 'blocked' });
    });

    it('refuses a missing backing file', () => {
      expect(resolveAccessKey(key(), null, { userId: 'owner-1' }, [], NOW)).toEqual({
        ok: false,
        reason: 'not_found'
      });
    });

    it('allows the owner of a private file', () => {
      const result = resolveAccessKey(key(), privateSubject, { userId: 'owner-1' }, [], NOW);
      expect(result.ok).toBe(true);
    });

    it('allows anyone on a public file', () => {
      expect(resolveAccessKey(key(), publicSubject, {}, [], NOW).ok).toBe(true);
    });

    it('denies a stranger on a private file without a grant', () => {
      expect(
        resolveAccessKey(key(), privateSubject, { userId: 'stranger' }, [], NOW)
      ).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('allows a grantee on a private file', () => {
      const grant: AccessGrant = {
        id: 'g1',
        fileId: 'file-1',
        ownerId: 'owner-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'read',
        tokenHash: null,
        label: null,
        expiresAt: null,
        createdAt: NOW
      };
      expect(
        resolveAccessKey(key(), privateSubject, { userId: 'user-2' }, [grant], NOW).ok
      ).toBe(true);
    });

    it('denies an expired grant', () => {
      const expired: AccessGrant = {
        id: 'g1',
        fileId: 'file-1',
        ownerId: 'owner-1',
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'read',
        tokenHash: null,
        label: null,
        expiresAt: '2026-01-01T00:00:00.000Z',
        createdAt: NOW
      };
      expect(
        resolveAccessKey(key(), privateSubject, { userId: 'user-2' }, [expired], NOW)
      ).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('maps failures to HTTP codes and messages', () => {
      expect(statusToHttpCode('not_found')).toBe(404);
      expect(statusToHttpCode('forbidden')).toBe(403);
      expect(statusToHttpCode('pending')).toBe(409);
      expect(statusToHttpCode('blocked')).toBe(409);
      expect(describeFailure('pending')).toContain('not finished');
      expect(describeFailure('blocked')).toContain('blocked');
      expect(describeFailure('forbidden')).toContain('do not have access');
      expect(describeFailure('not_found')).toContain('Unknown');
    });
  });

  describe('Object asset reference extraction', () => {
    it('returns nothing for malformed manifests', () => {
      expect(collectObjectAssetRefs(null)).toEqual([]);
      expect(collectObjectAssetRefs({})).toEqual([]);
      expect(collectObjectAssetRefs({ objects: 'nope' })).toEqual([]);
    });

    it('collects texture and asset references with object ids', () => {
      const refs = collectObjectAssetRefs({
        objects: [
          { id: 'obj_1', textureAccessId: 'acc_0123456789abcdef0123' },
          { id: 'obj_2', assetAccessId: 'acc_abcdef0123456789abcd' },
          { id: 'obj_3' }
        ]
      });
      expect(refs).toHaveLength(2);
      expect(refs[0]).toEqual({
        objectId: 'obj_1',
        accessId: 'acc_0123456789abcdef0123',
        field: 'textureAccessId'
      });
    });

    it('ignores blank, non-string, and duplicate references', () => {
      const refs = collectObjectAssetRefs({
        objects: [
          { id: 'obj_1', textureAccessId: '   ' },
          { id: 'obj_2', textureAccessId: 42 },
          { id: 'obj_3', textureAccessId: 'acc_0123456789abcdef0123' },
          { id: 'obj_3', textureAccessId: 'acc_0123456789abcdef0123' }
        ]
      });
      expect(refs).toHaveLength(1);
    });

    it('formats failure messages with object and field context', () => {
      expect(
        formatRefFailure(
          { objectId: 'obj_1', accessId: 'acc_0123456789abcdef0123', field: 'textureAccessId' },
          'not_found'
        )
      ).toBe('obj_1.textureAccessId -> acc_0123456789abcdef0123: not_found');
    });
  });

  describe('Access asset domain resolution', () => {
    it('defaults to the dedicated access asset host', () => {
      expect(resolveAccessAssetUrl({}, 'assets/sha256/abc')).toBe(
        'https://access-game.lenout.com/api/v1/assets/file/assets/sha256/abc'
      );
    });

    it('routes through the Worker gate so private uploads stay protected', () => {
      expect(resolveAccessAssetUrl({}, 'assets/sha256/abc')).toContain('/api/v1/assets/file/');
    });

    it('honours the configured host so a domain migration is one env change', () => {
      expect(
        resolveAccessAssetUrl({ ACCESS_ASSETS_URL: 'https://cdn.example.net/' }, 'assets/x.png')
      ).toBe('https://cdn.example.net/api/v1/assets/file/assets/x.png');
    });

    it('strips leading slashes from keys to avoid double separators', () => {
      expect(resolveAccessAssetUrl({ ACCESS_ASSETS_URL: 'https://a.test' }, '/assets/x.png')).toBe(
        'https://a.test/api/v1/assets/file/assets/x.png'
      );
    });
  });
});
