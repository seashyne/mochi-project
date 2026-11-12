// Incremental SHA-256 used to hash multi-gigabyte files without loading them
// into memory. Small payloads use WebCrypto for speed.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export class Sha256Hasher {
  private hash = new Uint32Array(INITIAL_HASH);
  private buffer = new Uint8Array(64);
  private bufferLength = 0;
  private bytesHashed = 0;
  private finished = false;

  update(data: Uint8Array): this {
    if (this.finished) throw new Error('SHA-256 digest already finalized');
    this.bytesHashed += data.length;
    let offset = 0;

    if (this.bufferLength > 0) {
      const take = Math.min(64 - this.bufferLength, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.compress(this.buffer, 0);
        this.bufferLength = 0;
      }
    }

    while (offset + 64 <= data.length) {
      this.compress(data, offset);
      offset += 64;
    }

    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0);
      this.bufferLength = data.length - offset;
    }
    return this;
  }

  digestHex(): string {
    if (!this.finished) {
      const bitLength = this.bytesHashed * 8;
      const padLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength;
      const padding = new Uint8Array(padLength + 8);
      padding[0] = 0x80;
      writeU32(padding, padLength, Math.floor(bitLength / 0x100000000));
      writeU32(padding, padLength + 4, bitLength >>> 0);
      this.update(padding);
      this.finished = true;
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) writeU32(out, i * 4, this.hash[i]);
    return toHex(out);
  }

  private compress(block: Uint8Array, offset: number): void {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = this.hash[0], b = this.hash[1], c = this.hash[2], d = this.hash[3];
    let e = this.hash[4], f = this.hash[5], g = this.hash[6], h = this.hash[7];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    this.hash[0] = (this.hash[0] + a) >>> 0;
    this.hash[1] = (this.hash[1] + b) >>> 0;
    this.hash[2] = (this.hash[2] + c) >>> 0;
    this.hash[3] = (this.hash[3] + d) >>> 0;
    this.hash[4] = (this.hash[4] + e) >>> 0;
    this.hash[5] = (this.hash[5] + f) >>> 0;
    this.hash[6] = (this.hash[6] + g) >>> 0;
    this.hash[7] = (this.hash[7] + h) >>> 0;
  }
}

const WEBCRYPTO_LIMIT_BYTES = 64 * 1024 * 1024;

export async function hashBlob(
  blob: Blob,
  onProgress?: (hashedBytes: number, totalBytes: number) => void
): Promise<string> {
  if (
    blob.size <= WEBCRYPTO_LIMIT_BYTES &&
    typeof crypto !== 'undefined' &&
    crypto.subtle
  ) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    onProgress?.(blob.size, blob.size);
    return toHex(new Uint8Array(digest));
  }

  const hasher = new Sha256Hasher();
  const reader = blob.stream().getReader();
  let hashed = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hasher.update(value);
      hashed += value.length;
      onProgress?.(hashed, blob.size);
    }
  } finally {
    reader.releaseLock();
  }
  return hasher.digestHex();
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return toHex(new Uint8Array(digest));
  }
  return new Sha256Hasher().update(data).digestHex();
}
