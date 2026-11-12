// .mochi binary and JSON bundle packager, unpacker, and validator
// Format: 5 bytes 'MOCHI' + 1 byte version (0x01) + 4 bytes payload length + UTF-8 JSON content

import {
  MochiPackageContent,
  MochiPackageManifest,
  MochiValidationResult,
  MochiScriptEntry
} from './types';

export const MOCHI_MAGIC = new Uint8Array([0x4d, 0x4f, 0x43, 0x48, 0x49]); // 'MOCHI'
export const MOCHI_VERSION = 1;

export function packMochi(content: MochiPackageContent): Uint8Array {
  const jsonStr = JSON.stringify(content);
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(jsonStr);

  const totalLength = 5 + 1 + 4 + payloadBytes.length;
  const buffer = new Uint8Array(totalLength);

  // Write Magic: 'MOCHI'
  buffer.set(MOCHI_MAGIC, 0);

  // Write Version: 0x01
  buffer[5] = MOCHI_VERSION;

  // Write 32-bit big-endian payload length
  const len = payloadBytes.length;
  buffer[6] = (len >>> 24) & 0xff;
  buffer[7] = (len >>> 16) & 0xff;
  buffer[8] = (len >>> 8) & 0xff;
  buffer[9] = len & 0xff;

  // Write JSON payload
  buffer.set(payloadBytes, 10);

  return buffer;
}

export function unpackMochi(input: Uint8Array | ArrayBuffer | string): MochiPackageContent {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as MochiPackageContent;
    }
    throw new Error('Invalid .mochi text package format: expected JSON');
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 10) {
    throw new Error('Invalid .mochi package: file buffer too small');
  }

  // Check Magic
  for (let i = 0; i < MOCHI_MAGIC.length; i++) {
    if (bytes[i] !== MOCHI_MAGIC[i]) {
      // Fallback: check if raw JSON without binary header was passed
      const decoder = new TextDecoder();
      try {
        const text = decoder.decode(bytes).trim();
        if (text.startsWith('{')) {
          return JSON.parse(text) as MochiPackageContent;
        }
      } catch {
        // Continue to magic mismatch error
      }
      throw new Error('Invalid .mochi package: magic header mismatch');
    }
  }

  const version = bytes[5];
  if (version !== MOCHI_VERSION) {
    throw new Error(`Unsupported .mochi version: ${version} (expected ${MOCHI_VERSION})`);
  }

  const payloadLen = ((bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9]) >>> 0;
  if (bytes.length < 10 + payloadLen) {
    throw new Error(`Truncated .mochi package: expected ${payloadLen} bytes, got ${bytes.length - 10}`);
  }

  const payloadBytes = bytes.subarray(10, 10 + payloadLen);
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(payloadBytes);

  return JSON.parse(jsonStr) as MochiPackageContent;
}

export function validateMochi(content: unknown): MochiValidationResult {
  const errors: string[] = [];
  if (!content || typeof content !== 'object') {
    return { valid: false, errors: ['Package content must be a non-null object'] };
  }

  const pkg = content as Partial<MochiPackageContent>;

  // Validate Manifest
  if (!pkg.manifest || typeof pkg.manifest !== 'object') {
    errors.push('Missing package manifest');
  } else {
    const m = pkg.manifest as Partial<MochiPackageManifest>;
    if (!m.title || typeof m.title !== 'string') errors.push('Manifest title is required');
    if (!m.version || typeof m.version !== 'string') errors.push('Manifest version is required');
    if (!m.entry || typeof m.entry !== 'object') {
      errors.push('Manifest entry is required');
    } else {
      if (!m.entry.clientScript) errors.push('Manifest entry.clientScript is required');
    }
  }

  // Validate Scripts
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    errors.push('Package scripts dictionary is required');
  } else {
    for (const [key, script] of Object.entries(pkg.scripts)) {
      const entry = script as Partial<MochiScriptEntry>;
      if (!entry.code || typeof entry.code !== 'string') {
        errors.push(`Script ${key} has missing or invalid code`);
      }
      if (!entry.role || !['client', 'server', 'shared'].includes(entry.role)) {
        errors.push(`Script ${key} has invalid role (expected client, server, or shared)`);
      }
    }

    if (pkg.manifest?.entry?.clientScript) {
      const clientEntry = pkg.manifest.entry.clientScript;
      if (!pkg.scripts[clientEntry]) {
        errors.push(`Entry client script "${clientEntry}" not found in package scripts`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createMochiBlob(content: MochiPackageContent): Blob {
  const packed = packMochi(content);
  return new Blob([packed.buffer as ArrayBuffer], { type: 'application/x-mochi' });
}
