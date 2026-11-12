import type { ManifestChunkRef } from '../package/manifestV2';
import type { StudioVec3 } from '../studio/types';
import type { WorldLoadResult } from './sceneLoader';

export interface ChunkStreamOptions {
  concurrency?: number;
  loadRadius?: number;
  unloadRadius?: number;
  maxResidentChunks?: number;
  maxResidentBytes?: number;
  onProgress?: (loadedChunks: number, totalChunks: number) => void;
  onError?: (error: Error, chunkId: string) => void;
}

export function chunkDistance(ref: ManifestChunkRef, point: StudioVec3): number {
  const { min, max } = ref.bounds;
  return Math.hypot(Math.max(min.x - point.x, 0, point.x - max.x), Math.max(min.z - point.z, 0, point.z - max.z));
}

export class ChunkStream {
  private resident = new Map<string, WorldLoadResult>();
  private pending = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  private failures = new Map<string, { error: Error; retryAt: number }>();
  private wanted: ManifestChunkRef[] = [];
  private disposed = false;
  private readonly concurrency: number;
  private readonly loadRadius: number;
  private readonly unloadRadius: number;
  private readonly maxChunks: number;
  private readonly maxBytes: number;

  constructor(
    readonly refs: ManifestChunkRef[],
    private readonly load: (ref: ManifestChunkRef, signal: AbortSignal) => Promise<WorldLoadResult>,
    private readonly options: ChunkStreamOptions = {}
  ) {
    this.concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 4)));
    this.loadRadius = options.loadRadius ?? 128;
    this.unloadRadius = Math.max(this.loadRadius, options.unloadRadius ?? this.loadRadius * 1.5);
    this.maxChunks = Math.max(1, options.maxResidentChunks ?? 32);
    this.maxBytes = Math.max(1, options.maxResidentBytes ?? 64 * 1024 * 1024);
  }

  get results(): WorldLoadResult[] { return [...this.resident.values()]; }
  get loadedChunkIds(): string[] { return [...this.resident.keys()]; }
  get residentBytes(): number { return this.refs.reduce((sum, ref) => sum + (this.resident.has(ref.id) ? ref.sizeBytes : 0), 0); }

  update(point: StudioVec3): void {
    if (this.disposed) return;
    const candidates = this.refs.map(ref => ({ ref, distance: chunkDistance(ref, point) }))
      .filter(({ ref, distance }) => distance <= (this.resident.has(ref.id) ? this.unloadRadius : this.loadRadius))
      .sort((a, b) => a.distance - b.distance || a.ref.id.localeCompare(b.ref.id));
    let bytes = 0;
    this.wanted = [];
    for (const { ref } of candidates) {
      if (this.wanted.length >= this.maxChunks || bytes + ref.sizeBytes > this.maxBytes) break;
      bytes += ref.sizeBytes;
      this.wanted.push(ref);
    }
    const ids = new Set(this.wanted.map(ref => ref.id));
    for (const [id, result] of this.resident) {
      if (!ids.has(id)) { result.dispose(); this.resident.delete(id); }
    }
    for (const [id, request] of this.pending) {
      if (!ids.has(id)) request.abort.abort();
    }
    for (const id of this.failures.keys()) {
      if (!ids.has(id)) this.failures.delete(id);
    }
    this.fill();
  }

  isReadyAt(point: StudioVec3): boolean {
    return !this.disposed && this.refs.every(ref => chunkDistance(ref, point) > 4 || this.resident.has(ref.id));
  }

  async whenIdle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending.values()].map(request => request.promise));
    const failure = this.wanted.map(ref => this.failures.get(ref.id)).find(Boolean);
    if (failure) throw failure.error;
  }

  dispose(): void {
    this.disposed = true;
    for (const request of this.pending.values()) request.abort.abort();
    for (const result of this.resident.values()) result.dispose();
    this.resident.clear();
    this.wanted = [];
    this.failures.clear();
  }

  private fill(): void {
    if (this.disposed) return;
    for (const ref of this.wanted) {
      if (this.pending.size >= this.concurrency) break;
      if (this.resident.has(ref.id) || this.pending.has(ref.id)) continue;
      if ((this.failures.get(ref.id)?.retryAt ?? 0) > Date.now()) continue;
      const abort = new AbortController();
      const promise = Promise.resolve().then(() => this.load(ref, abort.signal))
        .then(result => {
          if (this.disposed || abort.signal.aborted || !this.wanted.some(item => item.id === ref.id)) {
            result.dispose();
            return;
          }
          this.resident.set(ref.id, result);
          this.failures.delete(ref.id);
          this.options.onProgress?.(this.resident.size, this.wanted.length);
        })
        .catch((cause: unknown) => {
          if (this.disposed || abort.signal.aborted) return;
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failures.set(ref.id, { error, retryAt: Date.now() + 3000 });
          this.options.onError?.(error, ref.id);
        })
        .finally(() => { this.pending.delete(ref.id); this.fill(); });
      this.pending.set(ref.id, { abort, promise });
    }
  }
}
