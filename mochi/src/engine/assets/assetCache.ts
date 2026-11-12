// Persistent cache for immutable game assets. Content-addressed URLs never
// change, so bytes are fetched once, stored in the Origin Private File System
// when available, and reused across sessions; an in-memory map covers browsers
// without OPFS.

const CACHE_DIR = 'mochi-assets';
export const MAX_MEMORY_CACHE_BYTES = 64 * 1024 * 1024;
const memoryCache = new Map<string, Blob>();
let memoryBytes = 0;
let directoryPromise: Promise<FileSystemDirectoryHandle | null> | null = null;
const pendingWrites = new Map<string, Promise<void>>();

interface StorageWithDirectory {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
}

function cacheFileName(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const match = /\.(glb|gltf|json|bin|ktx2|mp3|ogg|wav)$/i.exec(url.split('?')[0]);
  return `${hash.toString(16)}${match ? match[0] : ''}`;
}

async function getCacheDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (directoryPromise) return directoryPromise;
  directoryPromise = (async () => {
    const storage = (navigator as Navigator & { storage?: StorageWithDirectory })
      .storage;
    if (!storage?.getDirectory) return null;
    try {
      const root = await storage.getDirectory();
      return await root.getDirectoryHandle(CACHE_DIR, { create: true });
    } catch {
      return null;
    }
  })();
  return directoryPromise;
}

export async function readCachedAsset(url: string): Promise<Blob | null> {
  const cached = memoryCache.get(url);
  if (cached) { memoryCache.delete(url); memoryCache.set(url, cached); return cached; }
  // An in-flight OPFS write is uncommitted; reading now would see an empty file.
  await pendingWrites.get(url);
  const directory = await getCacheDirectory();
  if (!directory) return null;
  try {
    const handle = await directory.getFileHandle(cacheFileName(url));
    return await handle.getFile();
  } catch {
    return null;
  }
}

export async function writeCachedAsset(url: string, blob: Blob): Promise<void> {
  memoryBytes -= memoryCache.get(url)?.size ?? 0;
  memoryCache.delete(url);
  if (blob.size <= MAX_MEMORY_CACHE_BYTES) {
    while (memoryBytes + blob.size > MAX_MEMORY_CACHE_BYTES) {
      const oldest = memoryCache.keys().next().value!;
      memoryBytes -= memoryCache.get(oldest)!.size;
      memoryCache.delete(oldest);
    }
    memoryCache.set(url, blob);
    memoryBytes += blob.size;
  }
  const write = (async () => {
    const directory = await getCacheDirectory();
    if (!directory) return;
    try {
      const handle = await directory.getFileHandle(cacheFileName(url), {
        create: true
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch {
      // Quota or permission failures are non-fatal; the asset still loaded.
    }
  })();
  pendingWrites.set(url, write);
  try { await write; } finally {
    if (pendingWrites.get(url) === write) pendingWrites.delete(url);
  }
}

async function boundedBlob(response: Response, maxBytes: number): Promise<Blob> {
  if (Number(response.headers.get('Content-Length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('Asset exceeds download byte limit');
  }
  if (!response.body) return new Blob();
  const reader = response.body.getReader();
  const parts: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Asset exceeds download byte limit');
      }
      parts.push(value.slice().buffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(parts, { type: response.headers.get('Content-Type') || '' });
}

export async function fetchAsset(
  url: string,
  init?: RequestInit,
  maxBytes?: number
): Promise<Blob> {
  init?.signal?.throwIfAborted();
  const ranged = new Headers(init?.headers).has('Range');
  const cached = ranged ? null : await readCachedAsset(url);
  init?.signal?.throwIfAborted();
  if (cached) {
    if (maxBytes !== undefined && cached.size > maxBytes) throw new Error('Cached asset exceeds download byte limit');
    return cached;
  }

  const response = init ? await fetch(url, init) : await fetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Asset download failed (${response.status}) for ${url}`);
  }
  const blob = maxBytes === undefined ? await response.blob() : await boundedBlob(response, maxBytes);
  init?.signal?.throwIfAborted();
  if (!ranged && response.status !== 206) void writeCachedAsset(url, blob);
  return blob;
}

export async function fetchAssetJson<T>(url: string, init?: RequestInit, maxBytes?: number): Promise<T> {
  const blob = await fetchAsset(url, init, maxBytes);
  return JSON.parse(await blob.text()) as T;
}

export async function clearAssetCache(): Promise<void> {
  memoryCache.clear();
  memoryBytes = 0;
  await Promise.all([...pendingWrites.values()]);
  const directory = await getCacheDirectory();
  if (!directory) return;
  const entries = (
    directory as unknown as {
      entries?: () => AsyncIterable<[string, FileSystemHandle]>;
    }
  ).entries;
  if (!entries) return;
  try {
    for await (const [name] of entries.call(directory)) {
      await directory.removeEntry(name).catch(() => undefined);
    }
  } catch {
    // Ignore directories that cannot be enumerated.
  }
}
