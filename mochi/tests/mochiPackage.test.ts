// Automated test suite for .mochi bundle packaging, unpacking, and validation

import { describe, it, expect } from 'vitest';
import {
  packMochi,
  unpackMochi,
  validateMochi,
  createMochiBlob,
  MOCHI_MAGIC,
  MOCHI_VERSION,
  MochiPackageContent,
  createSampleMochiPackage
} from '../src/engine/package';

describe('.mochi Package Management Suite', () => {
  it('correctly creates binary header with magic bytes MOCHI and version 1', () => {
    const pkg = createSampleMochiPackage();
    const binary = packMochi(pkg);

    expect(binary.length).toBeGreaterThan(10);
    expect(Array.from(binary.subarray(0, 5))).toEqual(Array.from(MOCHI_MAGIC));
    expect(binary[5]).toBe(MOCHI_VERSION);

    // Read payload length from bytes 6..9
    const payloadLen = ((binary[6] << 24) | (binary[7] << 16) | (binary[8] << 8) | binary[9]) >>> 0;
    expect(binary.length).toBe(10 + payloadLen);
  });

  it('performs lossless roundtrip packaging and unpacking of full .mochi package', () => {
    const original = createSampleMochiPackage();
    const packed = packMochi(original);
    const unpacked = unpackMochi(packed);

    expect(unpacked.manifest.title).toBe(original.manifest.title);
    expect(unpacked.manifest.version).toBe(original.manifest.version);
    expect(unpacked.manifest.entry.clientScript).toBe(original.manifest.entry.clientScript);
    expect(unpacked.manifest.entry.serverScript).toBe(original.manifest.entry.serverScript);

    expect(Object.keys(unpacked.scripts)).toEqual(Object.keys(original.scripts));
    expect(unpacked.scripts['scripts/main.client.lua'].code).toBe(
      original.scripts['scripts/main.client.lua'].code
    );
    expect(unpacked.scripts['scripts/main.server.lua'].role).toBe('server');
    expect(unpacked.scripts['scripts/shared/constants.lua'].role).toBe('shared');

    expect(unpacked.assets['textures/cyber_grid.png'].hash).toBe(
      original.assets['textures/cyber_grid.png'].hash
    );
  });

  it('supports unpacking raw JSON string formatted packages gracefully', () => {
    const original = createSampleMochiPackage();
    const jsonStr = JSON.stringify(original);
    const unpacked = unpackMochi(jsonStr);

    expect(unpacked.manifest.gameId).toBe(original.manifest.gameId);
    expect(unpacked.manifest.title).toBe('Cyber Obby Arena');
  });

  it('validates package contents and rejects corrupt or incomplete packages', () => {
    const valid = validateMochi(createSampleMochiPackage());
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    // Missing manifest
    const noManifest = validateMochi({ scripts: {}, assets: {}, scenes: {} });
    expect(noManifest.valid).toBe(false);
    expect(noManifest.errors).toContain('Missing package manifest');

    // Missing entry client script in scripts dict
    const invalidEntry: MochiPackageContent = {
      manifest: {
        formatVersion: '1.0',
        gameId: 'g1',
        slug: 'g1',
        title: 'Title',
        version: '1.0.0',
        author: { id: 'u1', displayName: 'Dev' },
        entry: { clientScript: 'scripts/missing.lua' }
      },
      scripts: {},
      assets: {},
      scenes: {}
    };
    const entryRes = validateMochi(invalidEntry);
    expect(entryRes.valid).toBe(false);
    expect(entryRes.errors.some((e) => e.includes('missing.lua'))).toBe(true);
  });

  it('throws descriptive errors on truncated or invalid binary buffers', () => {
    const tooSmall = new Uint8Array([0x4d, 0x4f, 0x43]);
    expect(() => unpackMochi(tooSmall)).toThrow(/buffer too small/i);

    const badMagic = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0, 0, 0, 0]);
    expect(() => unpackMochi(badMagic)).toThrow(/magic header mismatch/i);

    // Truncated payload length
    const sample = packMochi(createSampleMochiPackage());
    const truncated = sample.subarray(0, 20); // only 20 bytes when payload is much larger
    expect(() => unpackMochi(truncated)).toThrow(/truncated \.mochi package/i);
  });

  it('creates valid application/x-mochi Blob for web download', () => {
    const pkg = createSampleMochiPackage();
    const blob = createMochiBlob(pkg);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/x-mochi');
    expect(blob.size).toBeGreaterThan(100);
  });
});
