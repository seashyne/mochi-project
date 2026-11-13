// Decoded sample cache for uploaded audio.
//
// Uploaded sounds are decoded once and shared by every play call. Decoding is
// injected so the cache can be tested without an AudioContext, and so the bus stays
// the only place that touches WebAudio.

export type SampleState = 'idle' | 'loading' | 'ready' | 'failed';

export interface SampleEntry {
  url: string;
  state: SampleState;
  buffer: AudioBuffer | null;
}

export interface SampleLibraryOptions {
  /** Decodes a URL. Returning null marks the sample failed. */
  decode: (url: string) => Promise<AudioBuffer | null>;
  /** Turns an access id into a URL. Absent means ids are not resolvable. */
  resolve?: (accessId: string) => Promise<string | null>;
  /** Entries kept before the oldest idle one is dropped. Defaults to 24. */
  capacity?: number;
}

export interface SampleLibrary {
  /** Starts loading if needed and resolves true once the buffer is ready. */
  load: (url: string) => Promise<boolean>;
  /** The decoded buffer if it is ready right now, without starting work. */
  peek: (url: string) => AudioBuffer | null;
  state: (url: string) => SampleState;
  /** Drops a sample so the next play decodes it again. */
  forget: (url: string) => void;
  size: () => number;
}

export function createSampleLibrary(options: SampleLibraryOptions): SampleLibrary {
  const capacity = Math.max(1, options.capacity ?? 24);
  const entries = new Map<string, SampleEntry>();
  const pending = new Map<string, Promise<boolean>>();

  const touch = (entry: SampleEntry): void => {
    // Re-insert so Map order tracks recency for eviction.
    entries.delete(entry.url);
    entries.set(entry.url, entry);
  };

  const evict = (): void => {
    if (entries.size <= capacity) return;
    for (const [url, entry] of entries) {
      if (entry.state === 'loading') continue;
      entries.delete(url);
      if (entries.size <= capacity) return;
    }
  };

  const load = (url: string): Promise<boolean> => {
    const key = String(url ?? '').trim();
    if (!key) return Promise.resolve(false);

    const existing = entries.get(key);
    if (existing?.state === 'ready') {
      touch(existing);
      return Promise.resolve(true);
    }
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;

    const entry: SampleEntry = existing ?? { url: key, state: 'idle', buffer: null };
    entry.state = 'loading';
    entries.set(key, entry);

    const task = resolveSampleUrl(key, options.resolve ?? (async () => null))
      .then((url) => (url ? options.decode(url) : null))
      .then((buffer) => {
        if (buffer) {
          entry.buffer = buffer;
          entry.state = 'ready';
          touch(entry);
          evict();
          return true;
        }
        entry.state = 'failed';
        return false;
      })
      .catch(() => {
        entry.state = 'failed';
        return false;
      })
      .finally(() => {
        pending.delete(key);
      });

    pending.set(key, task);
    return task;
  };

  return {
    load,
    peek(url) {
      const entry = entries.get(String(url ?? '').trim());
      if (!entry || entry.state !== 'ready' || !entry.buffer) return null;
      touch(entry);
      return entry.buffer;
    },
    state(url) {
      return entries.get(String(url ?? '').trim())?.state ?? 'idle';
    },
    forget(url) {
      const key = String(url ?? '').trim();
      entries.delete(key);
      pending.delete(key);
    },
    size: () => entries.size
  };
}

// Access ids are the creator-facing handle for an uploaded file. The pattern
// mirrors the cloud validator (services/assetAccessKeys.ts) so an id that the
// server would reject is never treated as one here.
const ACCESS_ID_PATTERN = /^acc_[0-9a-f]{20}$/;

export type SampleSource = 'access-id' | 'url' | 'recipe';

export function isAccessId(value: string): boolean {
  return ACCESS_ID_PATTERN.test(String(value ?? '').trim());
}

/**
 * Classifies a `playSound` argument. An access id names an uploaded file through
 * the asset service; a URL is a file to fetch directly; anything else is a
 * built-in recipe name.
 */
export function classifySampleSource(value: string): SampleSource {
  const text = String(value ?? '').trim();
  if (!text) return 'recipe';
  if (isAccessId(text)) return 'access-id';
  if (/^(https?:|blob:|data:audio\/)/i.test(text)) return 'url';
  if (text.includes('/') && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(text)) return 'url';
  return 'recipe';
}

/** Kept for callers that only care whether it is a file. */
export function looksLikeSampleUrl(value: string): boolean {
  return classifySampleSource(value) !== 'recipe';
}

/**
 * Turns an access id into a servable URL through `resolve`, which is the asset
 * service in the app and a fake in tests. Plain URLs pass straight through.
 */
export async function resolveSampleUrl(
  source: string,
  resolve: (accessId: string) => Promise<string | null>
): Promise<string | null> {
  const text = String(source ?? '').trim();
  if (!text) return null;
  if (!isAccessId(text)) return text;
  return resolve(text);
}
