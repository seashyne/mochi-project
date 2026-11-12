// Tier 5 adversarial tests: asset access control policy and server script
// manifest authority checks on the edge Worker.

import { describe, it, expect } from 'vitest';
import {
  canRead,
  canWrite,
  evaluateFileAccess,
  hashShareToken,
  isGrantActive,
  permissionRank,
  validateGrantInput,
  type AccessGrant,
  type AccessViewer
} from '../src/services/assetAccess';
import { validateServerManifest } from '../src/services/serverScriptValidation';

const NOW = '2026-06-01T12:00:00.000Z';
const OWNER = 'owner-1';

function grant(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    id: 'g1',
    fileId: 'file-1',
    ownerId: OWNER,
    granteeType: 'user',
    granteeId: 'user-2',
    permission: 'read',
    tokenHash: null,
    label: null,
    expiresAt: null,
    createdAt: NOW,
    ...overrides
  };
}

describe('Tier 5: Asset Access Control Hardening', () => {
  describe('Permission ranking', () => {
    it('orders none < read < write < owner', () => {
      expect(permissionRank('none')).toBeLessThan(permissionRank('read'));
      expect(permissionRank('read')).toBeLessThan(permissionRank('write'));
      expect(permissionRank('write')).toBeLessThan(permissionRank('owner'));
    });

    it('gates read and write helpers', () => {
      expect(canRead('read')).toBe(true);
      expect(canRead('none')).toBe(false);
      expect(canWrite('read')).toBe(false);
      expect(canWrite('write')).toBe(true);
      expect(canWrite('owner')).toBe(true);
    });
  });

  describe('Grant expiry', () => {
    it('treats grants without expiry as active', () => {
      expect(isGrantActive(grant(), NOW)).toBe(true);
    });

    it('rejects expired grants', () => {
      expect(isGrantActive(grant({ expiresAt: '2026-05-31T00:00:00.000Z' }), NOW)).toBe(false);
    });

    it('rejects malformed expiry timestamps', () => {
      expect(isGrantActive(grant({ expiresAt: 'not-a-date' }), NOW)).toBe(false);
    });
  });

  describe('Effective permission matrix', () => {
    it('always grants the owner full control on a private file', () => {
      const viewer: AccessViewer = { userId: OWNER };
      expect(evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, [], NOW)).toBe(
        'owner'
      );
    });

    it('grants admins owner-level access regardless of visibility', () => {
      const viewer: AccessViewer = { userId: 'admin-9', role: 'admin' };
      expect(evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, [], NOW)).toBe(
        'owner'
      );
    });

    it('denies anonymous viewers on private files with no grants', () => {
      expect(evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, {}, [], NOW)).toBe('none');
    });

    it('allows read on public and unlisted files for anyone', () => {
      expect(evaluateFileAccess({ ownerId: OWNER, visibility: 'public' }, {}, [], NOW)).toBe('read');
      expect(evaluateFileAccess({ ownerId: OWNER, visibility: 'unlisted' }, {}, [], NOW)).toBe('read');
    });

    it('honours a user grant on a private file', () => {
      const viewer: AccessViewer = { userId: 'user-2' };
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, [grant()], NOW)
      ).toBe('read');
    });

    it('escalates to write when a write grant matches', () => {
      const viewer: AccessViewer = { userId: 'user-2' };
      expect(
        evaluateFileAccess(
          { ownerId: OWNER, visibility: 'private' },
          viewer,
          [grant({ permission: 'write' })],
          NOW
        )
      ).toBe('write');
    });

    it('ignores grants addressed to a different user', () => {
      const viewer: AccessViewer = { userId: 'user-3' };
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, [grant()], NOW)
      ).toBe('none');
    });

    it('ignores expired grants', () => {
      const viewer: AccessViewer = { userId: 'user-2' };
      const expired = grant({ expiresAt: '2026-01-01T00:00:00.000Z' });
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, [expired], NOW)
      ).toBe('none');
    });

    it('grants read to anonymous viewers via an open public grant', () => {
      const open = grant({ granteeType: 'public', granteeId: null });
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, {}, [open], NOW)
      ).toBe('read');
    });

    it('requires an exact token hash for token grants', () => {
      const tokenHash = hashShareToken('secret-token');
      const tokenGrant = grant({ granteeType: 'public', granteeId: null, tokenHash });

      expect(
        evaluateFileAccess(
          { ownerId: OWNER, visibility: 'private' },
          { shareTokenHash: tokenHash },
          [tokenGrant],
          NOW
        )
      ).toBe('read');

      expect(
        evaluateFileAccess(
          { ownerId: OWNER, visibility: 'private' },
          { shareTokenHash: hashShareToken('wrong-token') },
          [tokenGrant],
          NOW
        )
      ).toBe('none');
    });

    it('never lets a public token grant be bypassed without a token', () => {
      const tokenGrant = grant({ granteeType: 'public', tokenHash: hashShareToken('abc') });
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, {}, [tokenGrant], NOW)
      ).toBe('none');
    });

    it('picks the strongest of several matching grants', () => {
      const viewer: AccessViewer = { userId: 'user-2' };
      const grants = [grant({ permission: 'read' }), grant({ id: 'g2', permission: 'write' })];
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'private' }, viewer, grants, NOW)
      ).toBe('write');
    });

    it('does not downgrade public visibility with a read-only grant', () => {
      const viewer: AccessViewer = { userId: 'user-2' };
      expect(
        evaluateFileAccess({ ownerId: OWNER, visibility: 'public' }, viewer, [grant()], NOW)
      ).toBe('read');
    });
  });

  describe('Grant input validation', () => {
    it('accepts a valid user grant', () => {
      const result = validateGrantInput({
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'write'
      });
      expect('value' in result).toBe(true);
    });

    it('rejects unknown grantee types and permissions', () => {
      expect(validateGrantInput({ granteeType: 'group', permission: 'read' })).toHaveProperty('error');
      expect(validateGrantInput({ granteeType: 'user', granteeId: 'u', permission: 'admin' })).toHaveProperty(
        'error'
      );
    });

    it('requires a grantee id for user grants', () => {
      expect(validateGrantInput({ granteeType: 'user', permission: 'read' })).toHaveProperty('error');
    });

    it('rejects invalid expiry timestamps', () => {
      expect(
        validateGrantInput({
          granteeType: 'public',
          permission: 'read',
          expiresAt: 'never'
        })
      ).toHaveProperty('error');
    });

    it('truncates long labels and coerces withToken', () => {
      const result = validateGrantInput({
        granteeType: 'public',
        permission: 'read',
        label: 'x'.repeat(200),
        withToken: true
      });
      if ('value' in result) {
        expect(result.value.label?.length).toBe(80);
        expect(result.value.withToken).toBe(true);
      } else {
        throw new Error('expected a valid grant');
      }
    });
  });
});

describe('Tier 5: Server Manifest Authority Checks', () => {
  it('accepts an empty manifest', () => {
    expect(validateServerManifest({}).errors).toEqual([]);
    expect(validateServerManifest(null).errors).toEqual([]);
  });

  it('rejects non-array script collections', () => {
    expect(validateServerManifest({ serverScripts: 'print(1)' }).errors).toContain(
      'serverScripts must be an array'
    );
  });

  it('rejects duplicate script ids and empty code', () => {
    const result = validateServerManifest({
      serverScripts: [
        { id: 'dup', code: 'print(1)' },
        { id: 'dup', code: 'print(2)' },
        { id: 'blank', code: '  ' }
      ]
    });
    expect(result.serverScripts).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces the aggregate script byte ceiling', () => {
    const result = validateServerManifest({
      serverScripts: [
        { id: 'a', code: 'y'.repeat(40 * 1024) },
        { id: 'b', code: 'y'.repeat(40 * 1024) }
      ]
    });
    expect(result.errors.some((e) => e.includes('exceeds'))).toBe(true);
  });

  it('rejects reserved and malformed remote event names', () => {
    const result = validateServerManifest({
      remoteEvents: [{ name: 'FireServer' }, { name: '2bad' }, { name: 'ok_name' }]
    });
    expect(result.remoteEvents).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });

  it('rejects duplicate remote event names case-insensitively', () => {
    const result = validateServerManifest({ remoteEvents: [{ name: 'Tick' }, { name: 'tick' }] });
    expect(result.remoteEvents).toHaveLength(1);
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('clamps rate limits and defaults direction to toServer', () => {
    const result = validateServerManifest({
      remoteEvents: [{ name: 'Fast', rateLimitPerSecond: 5000 }]
    });
    expect(result.remoteEvents[0].rateLimitPerSecond).toBe(120);
    expect(result.remoteEvents[0].direction).toBe('toServer');
  });

  it('caps the number of remote events', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Event${i}` }));
    const result = validateServerManifest({ remoteEvents: many });
    expect(result.remoteEvents).toHaveLength(32);
    expect(result.errors.some((e) => e.includes('At most'))).toBe(true);
  });
});
