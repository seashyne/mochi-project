// Streaming SHA-256 used for upload integrity checks

import { describe, it, expect } from 'vitest';
import { Sha256, sha256Hex } from '../src/services/sha256';

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('streaming SHA-256', () => {
  it('matches the empty-input digest', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('matches the abc digest', () => {
    expect(sha256Hex(toBytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches the multi-block digest', () => {
    expect(
      sha256Hex(toBytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('produces the same digest when fed in arbitrary chunks', () => {
    const text = 'Mochi streaming hash test '.repeat(37);
    const bytes = toBytes(text);
    const hasher = new Sha256();
    let offset = 0;
    const sizes = [1, 7, 64, 3, 128, 5];
    let index = 0;
    while (offset < bytes.length) {
      const take = sizes[index++ % sizes.length];
      hasher.update(bytes.subarray(offset, offset + take));
      offset += take;
    }
    expect(hasher.digestHex()).toBe(sha256Hex(bytes));
  });
});
