// Binary header scans for import guardrails: image dimensions and audio duration.
//
// The WASM kernel does the scanning; the TypeScript versions here are the fallback
// when the kernel is not loaded and the reference the parity test compares against.

import { getWasmKernel } from '../physics/wasmPhysics';

/** Pixel dimensions of a PNG or JPEG header, or null when unrecognised. */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const kernel = getWasmKernel();
  if (!kernel || bytes.length < 24) return imageDimensionsTypeScript(bytes);

  const dataPtr = kernel.alloc_f32_buffer(Math.ceil(bytes.length / 4));
  const outPtr = kernel.alloc_f32_buffer(2);
  try {
    new Uint8Array(kernel.memory.buffer, dataPtr, bytes.length).set(bytes);
    const ok = kernel.image_dimensions(dataPtr, bytes.length, outPtr);
    if (ok !== 1) return null;
    const out = new Uint32Array(kernel.memory.buffer, outPtr, 2);
    return { width: out[0], height: out[1] };
  } finally {
    kernel.free_f32_buffer(dataPtr, Math.ceil(bytes.length / 4));
    kernel.free_f32_buffer(outPtr, 2);
  }
}

/** Reference implementation of the kernel's header scan. */
export function imageDimensionsTypeScript(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const be32 = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const be16 = (at: number) => (bytes[at] << 8) | bytes[at + 1];

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = be32(16);
    const height = be32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let index = 2;
    while (index + 9 < bytes.length) {
      if (bytes[index] !== 0xff) {
        index += 1;
        continue;
      }
      const marker = bytes[index + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        index += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segmentLength = be16(index + 2);
      if (segmentLength < 2) return null;
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = be16(index + 5);
        const width = be16(index + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      index += 2 + segmentLength;
    }
  }

  return null;
}

/** Duration of a WAV or MP3 file in seconds, or null when unknown. */
export function audioDurationSeconds(bytes: Uint8Array): number | null {
  const kernel = getWasmKernel();
  if (!kernel || bytes.length < 16) return audioDurationTypeScript(bytes);

  const units = Math.ceil(bytes.length / 4);
  const dataPtr = kernel.alloc_f32_buffer(units);
  try {
    new Uint8Array(kernel.memory.buffer, dataPtr, bytes.length).set(bytes);
    const ms = kernel.audio_duration_ms(dataPtr, bytes.length);
    return ms > 0 ? ms / 1000 : null;
  } finally {
    kernel.free_f32_buffer(dataPtr, units);
  }
}

/** Reference implementation of the kernel's duration estimate. */
export function audioDurationTypeScript(bytes: Uint8Array): number | null {
  if (bytes.length < 16) return null;
  const le32 = (at: number) =>
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

  if (tag(0) === 'RIFF' && tag(8) === 'WAVE') {
    let index = 12;
    let byteRate = 0;
    while (index + 8 <= bytes.length) {
      const id = tag(index);
      const size = le32(index + 4);
      if (id === 'fmt ' && index + 20 <= bytes.length) {
        byteRate = le32(index + 16);
      } else if (id === 'data' && byteRate > 0) {
        const dataSize = Math.min(size, bytes.length - (index + 8));
        return Math.floor((dataSize * 1000) / byteRate) / 1000;
      }
      index += 8 + size + (size & 1);
    }
    return null;
  }

  const bitrates = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  let start = 0;
  if (bytes.length > 10 && tag(0).startsWith('ID3')) {
    start =
      10 +
      (((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f));
  }
  while (start + 4 <= bytes.length) {
    if (bytes[start] === 0xff && (bytes[start + 1] & 0xe0) === 0xe0) {
      const version = (bytes[start + 1] >> 3) & 0x03;
      const layer = (bytes[start + 1] >> 1) & 0x03;
      const bitrateIndex = (bytes[start + 2] >> 4) & 0x0f;
      if (layer === 1 && version === 3 && bitrateIndex > 0 && bitrateIndex < 15) {
        const kbps = bitrates[bitrateIndex - 1];
        return Math.floor(((bytes.length - start) * 8) / kbps) / 1000;
      }
      break;
    }
    start += 1;
  }
  return null;
}
