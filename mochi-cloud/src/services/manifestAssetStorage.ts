// Publication-time evidence comes from R2 checksums or bounded real-byte hashing,
// never client-declared customMetadata or optional multipart part hashes.
import { MAX_WHOLE_HASH_BYTES } from './assetIntegrity';
import { ManifestAssetRef } from './manifestValidation';
import { Sha256 } from './sha256';

export const MAX_INDEX_BYTES = 4 * 1024 * 1024;
export class AssetReferenceError extends Error {}
export interface HashReadBudget { remainingBytes: number }

function fail(ref: ManifestAssetRef, message: string): never {
  throw new AssetReferenceError(`${ref.key}: ${message}`);
}

function storedDigest(object: R2Object, ref: ManifestAssetRef): string | undefined {
  const checksum = object.checksums.sha256;
  if (checksum === undefined) return undefined;
  if (checksum.byteLength !== 32) fail(ref, 'invalid R2 SHA-256 checksum');
  const digest = Array.from(new Uint8Array(checksum), (b) => b.toString(16).padStart(2, '0')).join('');
  if (digest !== ref.hash.toLowerCase()) fail(ref, 'R2 SHA-256 checksum mismatch');
  return digest;
}

function checkMetadata(object: R2Object, ref: ManifestAssetRef): void {
  if (object.key !== ref.key) fail(ref, 'R2 key mismatch');
  if (object.size !== ref.sizeBytes) fail(ref, 'R2 size mismatch');
  if (object.httpMetadata?.contentType?.trim().toLowerCase() !== ref.contentType.trim().toLowerCase()) {
    fail(ref, 'R2 content type mismatch');
  }
  if (!object.etag || !object.version) fail(ref, 'R2 object version is unavailable');
  if (object.range) fail(ref, 'partial R2 objects cannot prove whole-object integrity');
}

async function readBody(
  body: ReadableStream<Uint8Array>,
  ref: ManifestAssetRef,
  budget: HashReadBudget,
  nativeDigest: string | undefined,
  collect: boolean
): Promise<Uint8Array | undefined> {
  const reader = body.getReader();
  const hasher = nativeDigest ? undefined : new Sha256();
  const bytes = collect ? new Uint8Array(ref.sizeBytes) : undefined;
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > ref.sizeBytes) fail(ref, 'body exceeds declared byte size');
      if (hasher) {
        if (value.byteLength > budget.remainingBytes) fail(ref, 'fallback hash read budget exceeded');
        budget.remainingBytes -= value.byteLength;
        hasher.update(value);
      }
      bytes?.set(value, size);
      size += value.byteLength;
    }
    if (size !== ref.sizeBytes) fail(ref, 'body size mismatch');
    if (hasher && hasher.digestHex() !== ref.hash.toLowerCase()) fail(ref, 'content SHA-256 mismatch');
    return bytes;
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

// The caller shares one budget across ALL references in a publication. Native
// checksum-only assets incur no body reads; index bodies are always <= 4 MiB.
export async function verifyManifestAsset(
  bucket: R2Bucket,
  ref: ManifestAssetRef,
  budget: HashReadBudget,
  readIndex = false
): Promise<Uint8Array | undefined> {
  if (readIndex && ref.sizeBytes > MAX_INDEX_BYTES) fail(ref, `index exceeds ${MAX_INDEX_BYTES} byte ceiling`);
  const head = await bucket.head(ref.key);
  if (!head) fail(ref, 'R2 object is missing');
  checkMetadata(head, ref);
  const checksum = storedDigest(head, ref);
  if (checksum && !readIndex) return undefined;
  if (!checksum && ref.sizeBytes > Math.min(budget.remainingBytes, MAX_WHOLE_HASH_BYTES)) {
    fail(ref, `no storage-validated SHA-256; object exceeds remaining fallback hash budget ` +
      `(${budget.remainingBytes} bytes; ${MAX_WHOLE_HASH_BYTES} byte aggregate ceiling per publication)`);
  }
  const object = await bucket.get(ref.key, { onlyIf: { etagMatches: head.etag } });
  if (!object) fail(ref, 'R2 object disappeared during verification');
  if (!('body' in object)) fail(ref, 'R2 object changed during verification');
  try {
    if (object.etag !== head.etag || object.version !== head.version) {
      fail(ref, 'R2 object changed during verification');
    }
    checkMetadata(object, ref);
    if (storedDigest(object, ref) !== checksum) fail(ref, 'R2 checksum changed during verification');
    // Compressed index bytes must not be parsed differently from the public URL.
    if (readIndex && object.httpMetadata?.contentEncoding && object.httpMetadata.contentEncoding !== 'identity') {
      fail(ref, 'encoded indexes are not supported');
    }
  } catch (error) {
    await object.body.cancel(error).catch(() => undefined);
    throw error;
  }
  return readBody(object.body, ref, budget, checksum, readIndex);
}
