// Download budget estimates shown in the Studio publish panel.

import { describe, it, expect } from 'vitest';
import { computeDownloadBudget, formatByteSize } from '../src/components/studio/packageHelpers';
import { StudioObject } from '../src/engine/studio/types';

function model(id: string, overrides: Partial<StudioObject> = {}): StudioObject {
  return {
    id,
    name: id,
    type: 'model',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#ffffff',
    assetUrl: `https://cdn.test/${id}.glb`,
    assetHash: `hash_${id}`,
    assetSizeBytes: 1024,
    ...overrides
  };
}

const block: StudioObject = {
  id: 'b1',
  name: 'Block',
  type: 'block',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  color: '#ffffff'
};

describe('computeDownloadBudget', () => {
  it('ignores non-model objects and objects without an asset url', () => {
    const budget = computeDownloadBudget([block, model('m1', { assetUrl: undefined })]);
    expect(budget).toEqual({ assetCount: 0, uniqueAssetCount: 0, assetBytes: 0 });
  });

  it('counts unique assets once when they are placed multiple times', () => {
    const budget = computeDownloadBudget([
      model('m1', { assetHash: 'shared', assetSizeBytes: 4 * 1024 * 1024 }),
      model('m2', { assetHash: 'shared', assetSizeBytes: 4 * 1024 * 1024 }),
      model('m3', { assetHash: 'other', assetSizeBytes: 1024 })
    ]);

    expect(budget.assetCount).toBe(3);
    expect(budget.uniqueAssetCount).toBe(2);
    expect(budget.assetBytes).toBe(4 * 1024 * 1024 + 1024);
  });

  it('falls back to assetKey or url for identity and treats missing sizes as zero', () => {
    const budget = computeDownloadBudget([
      model('m1', { assetHash: undefined, assetKey: 'assets/a.glb', assetSizeBytes: undefined }),
      model('m2', { assetHash: undefined, assetKey: 'assets/a.glb' }),
      model('m3', { assetHash: undefined, assetKey: undefined })
    ]);

    expect(budget.uniqueAssetCount).toBe(2);
    expect(budget.assetBytes).toBe(1024);
  });
});

describe('formatByteSize', () => {
  it('formats byte, kilobyte, megabyte and gigabyte ranges', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatByteSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});
