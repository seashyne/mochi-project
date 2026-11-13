// Delta state replication with per-object authority.
//
// One channel per peer. `publish` turns the objects this peer owns into a delta of
// what actually changed since the last publish; `apply` takes a peer's delta and
// refuses entries for objects this peer owns, so two peers can never fight over the
// same transform. Quantisation happens before the change test, so a value that is
// below the wire resolution is not "changed" and does not cost bandwidth.

export interface TransformSample {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Yaw in radians; pitch and roll are not replicated. */
  ry: number;
  /** Who owns this object. Falls back to the channel's authority map. */
  owner?: string;
}

export interface DeltaEntry {
  id: string;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface DeltaPayload {
  tick: number;
  entries: DeltaEntry[];
  /** Objects that left the replicated set. */
  removed: string[];
}

export interface ReplicationOptions {
  /** Movement below this many metres is not a change. Defaults to 0.01. */
  positionEpsilon?: number;
  /** Yaw change below this many radians is not a change. Defaults to 0.02. */
  rotationEpsilon?: number;
  /** Wire resolution for positions, in metres. Defaults to 0.01 (1 cm). */
  positionStep?: number;
  /** Wire resolution for yaw, in radians. Defaults to 0.0017 (about 0.1 degrees). */
  rotationStep?: number;
}

export interface ApplyResult {
  applied: string[];
  /** Entries dropped because this peer owns the object. */
  ignored: string[];
}

const DEFAULTS: Required<ReplicationOptions> = {
  positionEpsilon: 0.01,
  rotationEpsilon: 0.02,
  positionStep: 0.01,
  rotationStep: 0.0017
};

const quantise = (value: number, step: number): number =>
  step > 0 ? Math.round(value / step) * step : value;

/** Shortest signed difference between two angles, in radians. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export class ReplicationChannel {
  private readonly options: Required<ReplicationOptions>;
  private readonly authority = new Map<string, string>();
  /** Last state this peer published or accepted, so deltas stay small. */
  private readonly shadow = new Map<string, DeltaEntry>();

  constructor(options: ReplicationOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  setAuthority(id: string, owner: string): void {
    this.authority.set(id, owner);
  }

  authorityOf(id: string): string | null {
    return this.authority.get(id) ?? null;
  }

  canWrite(id: string, owner: string): boolean {
    const assigned = this.authority.get(id);
    return assigned === undefined || assigned === owner;
  }

  /** Drops an object from both the authority map and the shadow state. */
  forget(id: string): void {
    this.authority.delete(id);
    this.shadow.delete(id);
  }

  /**
   * Delta of the owned objects that changed since the last publish. Returns null
   * when nothing moved, so an idle peer sends no packets at all.
   */
  publish(tick: number, samples: TransformSample[], owner: string): DeltaPayload | null {
    const entries: DeltaEntry[] = [];
    const present = new Set<string>();

    for (const sample of samples) {
      const sampleOwner = sample.owner ?? owner;
      if (!this.canWrite(sample.id, sampleOwner) || sampleOwner !== owner) continue;
      present.add(sample.id);

      const next: DeltaEntry = {
        id: sample.id,
        x: quantise(sample.x, this.options.positionStep),
        y: quantise(sample.y, this.options.positionStep),
        z: quantise(sample.z, this.options.positionStep),
        ry: quantise(sample.ry, this.options.rotationStep)
      };

      const previous = this.shadow.get(sample.id);
      if (!previous || this.changed(previous, next)) {
        entries.push(next);
        this.shadow.set(sample.id, next);
      }
    }

    const removed: string[] = [];
    for (const id of [...this.shadow.keys()]) {
      if (present.has(id)) continue;
      // Only report removals for objects this peer owned.
      if (!this.canWrite(id, owner)) continue;
      this.shadow.delete(id);
      this.authority.delete(id);
      removed.push(id);
    }

    if (entries.length === 0 && removed.length === 0) return null;
    return { tick, entries, removed };
  }

  /**
   * Applies a peer's delta. Entries for objects this peer owns are refused: local
   * authority wins, which is what stops two peers overwriting each other.
   */
  apply(payload: DeltaPayload, owner: string): ApplyResult {
    const applied: string[] = [];
    const ignored: string[] = [];

    for (const entry of payload.entries) {
      if (!this.canWrite(entry.id, owner)) {
        ignored.push(entry.id);
        continue;
      }
      this.shadow.set(entry.id, entry);
      applied.push(entry.id);
    }

    for (const id of payload.removed) {
      if (!this.canWrite(id, owner)) continue;
      this.shadow.delete(id);
    }

    return { applied, ignored };
  }

  /** Last known state of an object, local or remote. */
  peek(id: string): DeltaEntry | null {
    return this.shadow.get(id) ?? null;
  }

  get size(): number {
    return this.shadow.size;
  }

  reset(): void {
    this.shadow.clear();
    this.authority.clear();
  }

  private changed(previous: DeltaEntry, next: DeltaEntry): boolean {
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const dz = next.z - previous.z;
    const moved = Math.hypot(dx, dy, dz) > this.options.positionEpsilon;
    const turned = Math.abs(angleDelta(previous.ry, next.ry)) > this.options.rotationEpsilon;
    return moved || turned;
  }
}

/**
 * Splits a payload so no message carries more than `maxEntries` transforms. Order
 * is preserved; an empty payload yields no chunks.
 */
export function chunkPayload(payload: DeltaPayload, maxEntries: number): DeltaPayload[] {
  const limit = Math.max(1, Math.floor(maxEntries));
  if (payload.entries.length === 0 && payload.removed.length === 0) return [];

  const chunks: DeltaPayload[] = [];
  for (let index = 0; index < payload.entries.length; index += limit) {
    chunks.push({
      tick: payload.tick,
      entries: payload.entries.slice(index, index + limit),
      removed: index === 0 ? [...payload.removed] : []
    });
  }
  if (chunks.length === 0) {
    chunks.push({ tick: payload.tick, entries: [], removed: [...payload.removed] });
  }
  return chunks;
}
