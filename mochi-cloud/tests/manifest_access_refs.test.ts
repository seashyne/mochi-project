// Access-id references in a manifest: what gets found, and what publish refuses.

import { describe, expect, it } from 'vitest';
import {
  collectAccessIds,
  validateAccessRefs,
  type AccessRefLookup
} from '../src/services/assetRefs';
import type { AccessKeyRecord } from '../src/services/assetAccessKeys';

const OWN_ID = 'acc_0123456789abcdef0123';
const OTHER_ID = 'acc_ffffffffffffffffffff';
const BLOCKED_ID = 'acc_11111111111111111111';
const PENDING_ID = 'acc_22222222222222222222';
const MISSING_FILE_ID = 'acc_33333333333333333333';

const OWNER = { userId: 'user-1', role: 'user', shareTokenHash: null };
const NOW = '2026-11-13T00:00:00.000Z';

function key(accessId: string, fileId: string, status: AccessKeyRecord['status'] = 'ready'): AccessKeyRecord {
  return { accessId, fileId, ownerId: 'user-1', status, createdAt: NOW };
}

function lookup(): AccessRefLookup {
  const keys = new Map<string, AccessKeyRecord>([
    [OWN_ID, key(OWN_ID, 'file-own')],
    [OTHER_ID, key(OTHER_ID, 'file-other')],
    [BLOCKED_ID, key(BLOCKED_ID, 'file-own', 'blocked')],
    [PENDING_ID, key(PENDING_ID, 'file-own', 'pending')],
    [MISSING_FILE_ID, key(MISSING_FILE_ID, 'file-gone')]
  ]);
  const files = new Map([
    ['file-own', { id: 'file-own', ownerId: 'user-1', visibility: 'private' as const }],
    ['file-other', { id: 'file-other', ownerId: 'user-2', visibility: 'private' as const }]
  ]);

  return {
    findKey: async (accessId) => keys.get(accessId) ?? null,
    findFile: async (fileId) => files.get(fileId) ?? null,
    grantsFor: async () => []
  };
}

const manifestWith = (...ids: string[]) =>
  JSON.stringify({ objects: ids.map((id, index) => ({ id: `o${index}`, textureAccessId: id })) });

describe('collectAccessIds', () => {
  it('finds ids in properties and in script text, deduped in order', () => {
    const text = JSON.stringify({
      objects: [{ id: 'a', textureAccessId: OWN_ID }],
      luaScript: `world.playSound("${OWN_ID}", part.position)\nworld.playSound("${OTHER_ID}")`
    });
    expect(collectAccessIds(text)).toEqual([OWN_ID, OTHER_ID]);
  });

  it('ignores malformed ids', () => {
    const text = 'acc_short acc_0123456789ABCDEF0123 acc_0123456789abcdef0123';
    expect(collectAccessIds(text)).toEqual([OWN_ID]);
  });

  it('caps how many it will look up', () => {
    const ids = Array.from({ length: 600 }, (_, index) => `acc_${index.toString(16).padStart(20, '0')}`);
    expect(collectAccessIds(ids.join(' '), 10)).toHaveLength(10);
  });

  it('returns nothing for text with no ids', () => {
    expect(collectAccessIds('world.playSound("coin_pickup")')).toEqual([]);
  });
});

describe('validateAccessRefs', () => {
  it('accepts a manifest that references nothing', async () => {
    await expect(validateAccessRefs(lookup(), manifestWith(), OWNER, NOW)).resolves.toEqual([]);
  });

  it('accepts the publisher own, ready asset', async () => {
    await expect(validateAccessRefs(lookup(), manifestWith(OWN_ID), OWNER, NOW)).resolves.toEqual([]);
  });

  it('rejects an unknown id', async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith('acc_99999999999999999999'), OWNER, NOW);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknown asset access id');
  });

  it('rejects a blocked key', async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith(BLOCKED_ID), OWNER, NOW);
    expect(errors[0]).toContain('blocked');
  });

  it('rejects a key whose upload never finished', async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith(PENDING_ID), OWNER, NOW);
    expect(errors[0]).toContain('pending');
  });

  it('rejects an id whose file is gone', async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith(MISSING_FILE_ID), OWNER, NOW);
    expect(errors[0]).toContain('no longer exists');
  });

  it("rejects another creator's private asset", async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith(OTHER_ID), OWNER, NOW);
    expect(errors[0]).toContain('forbidden');
  });

  it('reports every problem, not just the first', async () => {
    const errors = await validateAccessRefs(
      lookup(),
      manifestWith(BLOCKED_ID, OTHER_ID),
      OWNER,
      NOW
    );
    expect(errors).toHaveLength(2);
  });

  it('lets an admin publish with another creator asset', async () => {
    const errors = await validateAccessRefs(lookup(), manifestWith(OTHER_ID), { ...OWNER, role: 'admin' }, NOW);
    expect(errors).toEqual([]);
  });
});
