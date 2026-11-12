// Cloudflare Worker service for validating and unpacking .mochi package bundles

export const MOCHI_MAGIC = new Uint8Array([0x4d, 0x4f, 0x43, 0x48, 0x49]); // 'MOCHI'
export const MOCHI_VERSION = 1;

export interface ServerPackageManifest {
  formatVersion: '1.0';
  gameId: string;
  slug: string;
  title: string;
  version: string;
  description?: string;
  author?: { id: string; displayName?: string };
  entry: {
    clientScript: string;
    serverScript?: string;
    sceneSnapshot?: string;
  };
  capabilities?: {
    multiplayer?: boolean;
    audio?: boolean;
    physics?: boolean;
  };
}

export interface ServerPackageContent {
  manifest: ServerPackageManifest;
  scripts: Record<string, { path: string; role: 'client' | 'server' | 'shared'; code: string }>;
  assets: Record<string, { path: string; contentType: string; data: string; size: number; hash: string }>;
  scenes: Record<string, unknown>;
}

export function unpackMochiServer(input: Uint8Array | ArrayBuffer | string): ServerPackageContent {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as ServerPackageContent;
    }
    throw new Error('Invalid .mochi text package: expected JSON');
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 10) {
    throw new Error('Invalid .mochi package: buffer too small');
  }

  // Verify magic
  for (let i = 0; i < MOCHI_MAGIC.length; i++) {
    if (bytes[i] !== MOCHI_MAGIC[i]) {
      const decoder = new TextDecoder();
      try {
        const text = decoder.decode(bytes).trim();
        if (text.startsWith('{')) {
          return JSON.parse(text) as ServerPackageContent;
        }
      } catch {
        // Continue to error
      }
      throw new Error('Invalid .mochi package: magic header mismatch');
    }
  }

  const version = bytes[5];
  if (version !== MOCHI_VERSION) {
    throw new Error(`Unsupported .mochi version: ${version}`);
  }

  const payloadLen = ((bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9]) >>> 0;
  if (bytes.length < 10 + payloadLen) {
    throw new Error(`Truncated .mochi package: expected ${payloadLen} bytes, got ${bytes.length - 10}`);
  }

  const payloadBytes = bytes.subarray(10, 10 + payloadLen);
  const decoder = new TextDecoder('utf-8');
  return JSON.parse(decoder.decode(payloadBytes)) as ServerPackageContent;
}

export function packMochiServer(content: ServerPackageContent): Uint8Array {
  const jsonStr = JSON.stringify(content);
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(jsonStr);

  const totalLength = 5 + 1 + 4 + payloadBytes.length;
  const buffer = new Uint8Array(totalLength);
  buffer.set(MOCHI_MAGIC, 0);
  buffer[5] = MOCHI_VERSION;

  const len = payloadBytes.length;
  buffer[6] = (len >>> 24) & 0xff;
  buffer[7] = (len >>> 16) & 0xff;
  buffer[8] = (len >>> 8) & 0xff;
  buffer[9] = len & 0xff;
  buffer.set(payloadBytes, 10);

  return buffer;
}

export function validateMochiServer(content: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!content || typeof content !== 'object') {
    return { valid: false, errors: ['Package content must be a non-null object'] };
  }

  const pkg = content as Partial<ServerPackageContent>;
  if (!pkg.manifest || typeof pkg.manifest !== 'object') {
    errors.push('Missing package manifest');
  } else {
    if (!pkg.manifest.title) errors.push('Manifest title is required');
    if (!pkg.manifest.version) errors.push('Manifest version is required');
    if (!pkg.manifest.entry?.clientScript) errors.push('Manifest entry.clientScript is required');
  }

  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    errors.push('Package scripts dictionary is required');
  }

  return { valid: errors.length === 0, errors };
}
