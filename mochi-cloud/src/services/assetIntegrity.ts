// Integrity helpers for uploaded assets: per-part hashing while streaming to R2
// and whole-object verification after multipart completion.

import { Sha256, hashStream } from './sha256';

// Whole-object verification re-reads the object; cap it so multi-gigabyte
// uploads stay within Worker CPU limits. Larger files rely on per-part hashes.
export const MAX_WHOLE_HASH_BYTES = 256 * 1024 * 1024;

export interface HashedStream {
  stream: ReadableStream<Uint8Array>;
  digestHex: () => string;
}

export function hashPassThrough(
  stream: ReadableStream<Uint8Array>
): HashedStream {
  const hasher = new Sha256();
  const hashed = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        hasher.update(chunk);
        controller.enqueue(chunk);
      }
    })
  );
  return { stream: hashed, digestHex: () => hasher.digestHex() };
}

// null means the object could not be verified here (too large or unsupported
// bucket mock); callers should treat it as "not verified", never as a failure.
export async function verifyStoredObject(
  bucket: R2Bucket,
  key: string,
  expectedSha256: string | undefined,
  sizeBytes: number
): Promise<boolean | null> {
  if (!expectedSha256 || sizeBytes > MAX_WHOLE_HASH_BYTES) return null;
  if (typeof bucket.get !== 'function') return null;
  const object = await bucket.get(key);
  if (!object || !object.body) return null;
  const digest = await hashStream(object.body);
  return digest === expectedSha256.toLowerCase();
}
