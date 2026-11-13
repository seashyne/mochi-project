// Import guardrails: the limits, the rejection messages, and parity between the
// kernel's binary scans and the TypeScript references.

import { beforeAll, describe, expect, it } from 'vitest';
import { initWasmPhysics } from '../src/engine/physics/wasmPhysics';
import {
  DEFAULT_ASSET_LIMITS,
  describeViolations,
  validateAudio,
  validateModel
} from '../src/engine/assets/assetGuardrails';
import {
  audioDurationSeconds,
  audioDurationTypeScript,
  imageDimensions,
  imageDimensionsTypeScript
} from '../src/engine/assets/assetInspectors';

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xc0;
  bytes[4] = 0x00;
  bytes[5] = 0x11;
  bytes[6] = 8;
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

function wavFile(byteRate: number, dataSize: number): Uint8Array {
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const write = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i);
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return bytes;
}

function mp3File(audioBytes: number): Uint8Array {
  const bytes = new Uint8Array(14 + audioBytes);
  bytes[0] = 0x49;
  bytes[1] = 0x44;
  bytes[2] = 0x33;
  // ID3v2, version 3, syncsafe size 0 -> a 10 byte tag.
  bytes[3] = 3;
  // MPEG-1 Layer III frame head, 128 kbps.
  bytes[10] = 0xff;
  bytes[11] = 0xfb;
  bytes[12] = 0x90;
  bytes[13] = 0x00;
  return bytes;
}

function glbFile(triangleCount: number, meshCount = 1): ArrayBuffer {
  const json = {
    asset: { version: '2.0' },
    accessors: [{ count: triangleCount * 3 }],
    meshes: Array.from({ length: meshCount }, () => ({ primitives: [{ indices: 0 }] }))
  };
  const text = JSON.stringify(json);
  const padded = text + ' '.repeat((4 - (text.length % 4)) % 4);
  const jsonBytes = new TextEncoder().encode(padded);
  const total = 12 + 8 + jsonBytes.length;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20).set(jsonBytes);
  return buffer;
}

beforeAll(async () => {
  expect(await initWasmPhysics()).toBe(true);
});

describe('validateModel', () => {
  it('counts triangles and passes a model inside the budget', () => {
    const report = validateModel(glbFile(1200));
    expect(report.ok).toBe(true);
    expect(report.stats?.triangles).toBe(1200);
    expect(report.violations).toEqual([]);
  });

  it('rejects a model over the triangle limit and names both numbers', () => {
    const report = validateModel(glbFile(DEFAULT_ASSET_LIMITS.maxTriangles + 10));
    expect(report.ok).toBe(false);
    expect(report.violations[0].rule).toBe('maxTriangles');
    expect(report.violations[0].message).toContain(String(DEFAULT_ASSET_LIMITS.maxTriangles + 10));
    expect(report.violations[0].message).toContain('limit');
  });

  it('rejects a model with too many meshes', () => {
    const report = validateModel(glbFile(3, DEFAULT_ASSET_LIMITS.maxMeshes + 1));
    expect(report.ok).toBe(false);
    expect(report.violations.map((entry) => entry.rule)).toContain('maxMeshes');
  });

  it('honours a caller-supplied budget', () => {
    const report = validateModel(glbFile(500), { ...DEFAULT_ASSET_LIMITS, maxTriangles: 100 });
    expect(report.ok).toBe(false);
  });

  it('reports a non-GLB as unreadable instead of passing it silently', () => {
    const report = validateModel(new TextEncoder().encode('{"asset":{"version":"2.0"}}').buffer);
    expect(report.stats).toBeNull();
    expect(report.ok).toBe(false);
  });
});

describe('imageDimensions', () => {
  it('reads a PNG header through the kernel and the reference', () => {
    const bytes = pngHeader(1024, 512);
    expect(imageDimensions(bytes)).toEqual({ width: 1024, height: 512 });
    expect(imageDimensionsTypeScript(bytes)).toEqual({ width: 1024, height: 512 });
  });

  it('walks a JPEG segment chain to the start of frame', () => {
    const bytes = jpegHeader(2048, 1536);
    expect(imageDimensions(bytes)).toEqual({ width: 2048, height: 1536 });
    expect(imageDimensionsTypeScript(bytes)).toEqual({ width: 2048, height: 1536 });
  });

  it('returns null for an unknown format and agrees with the reference', () => {
    const bytes = new Uint8Array(64);
    expect(imageDimensions(bytes)).toBeNull();
    expect(imageDimensionsTypeScript(bytes)).toBeNull();
  });
});

describe('audioDuration', () => {
  it('computes an exact WAV duration and matches the reference', () => {
    const bytes = wavFile(8000, 16000);
    expect(audioDurationSeconds(bytes)).toBeCloseTo(2, 3);
    expect(audioDurationTypeScript(bytes)).toBeCloseTo(2, 3);
  });

  it('estimates an MP3 duration from the first frame and matches the reference', () => {
    const bytes = mp3File(16000);
    expect(audioDurationSeconds(bytes)).toBeCloseTo(1, 3);
    expect(audioDurationTypeScript(bytes)).toBeCloseTo(1, 3);
  });

  it('returns null for a format it cannot read', () => {
    expect(audioDurationSeconds(new Uint8Array(32))).toBeNull();
    expect(audioDurationTypeScript(new Uint8Array(32))).toBeNull();
  });
});

describe('validateAudio', () => {
  it('passes a short clip and rejects a long one', () => {
    expect(validateAudio(wavFile(8000, 16000).buffer as ArrayBuffer).ok).toBe(true);

    // 8000 bytes per second for 400 seconds is well past the default limit.
    const long = wavFile(8000, 8000 * 400);
    const report = validateAudio(long.buffer as ArrayBuffer);
    expect(report.ok).toBe(false);
    expect(report.violations[0].rule).toBe('maxAudioSeconds');
  });
});

describe('describeViolations', () => {
  it('joins every violation into one line', () => {
    const report = validateModel(glbFile(DEFAULT_ASSET_LIMITS.maxTriangles + 1));
    const line = describeViolations(report);
    expect(line).toContain('Model');
    expect(line.split(';')).toHaveLength(report.violations.length);
  });
});
