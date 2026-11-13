// Per-room interest index for replicated object transforms.
//
// A delta should only reach players near the object it describes. The client-side
// interest check is useless here: by the time it drops an entry the bytes have
// already travelled. The Durable Object is the only place that can decide.
//
// This stays in TypeScript on purpose. A Durable Object runs JS, and for the
// tens of players a room holds a spatial hash is cheaper than crossing a wasm
// boundary. See AGENTS.md section 4 and PLATFORM_ROADMAP section 8.

export interface InterestLimits {
  /** Objects farther than this from a player are not sent to them. */
  radius: number;
  /** Grid cell size. Larger cells mean fewer buckets but more candidates. */
  cellSize: number;
}

export const DEFAULT_INTEREST_LIMITS: InterestLimits = {
  radius: 60,
  cellSize: 60
};

export class InterestIndex {
  private readonly positions = new Map<string, { x: number; z: number }>();
  private readonly grid = new Map<string, Set<string>>();
  private readonly options: InterestLimits;

  constructor(options: InterestLimits = DEFAULT_INTEREST_LIMITS) {
    this.options = options;
  }

  private key(x: number, z: number): string {
    const cell = Math.max(this.options.cellSize, 0.01);
    return `${Math.floor(x / cell)}:${Math.floor(z / cell)}`;
  }

  update(playerId: string, x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const previous = this.positions.get(playerId);
    if (previous) this.grid.get(this.key(previous.x, previous.z))?.delete(playerId);

    const key = this.key(x, z);
    const bucket = this.grid.get(key) ?? new Set<string>();
    bucket.add(playerId);
    this.grid.set(key, bucket);
    this.positions.set(playerId, { x, z });
  }

  remove(playerId: string): void {
    const position = this.positions.get(playerId);
    if (!position) return;
    this.grid.get(this.key(position.x, position.z))?.delete(playerId);
    this.positions.delete(playerId);
  }

  /** Players whose avatar is within `radius` of a world point. */
  observersOf(x: number, z: number, radius = this.options.radius): string[] {
    const cell = Math.max(this.options.cellSize, 0.01);
    const span = Math.ceil(Math.max(radius, 0) / cell);
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const radiusSquared = Math.max(radius, 0) ** 2;
    const found: string[] = [];

    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        const bucket = this.grid.get(`${cx + dx}:${cz + dz}`);
        if (!bucket) continue;
        for (const playerId of bucket) {
          const position = this.positions.get(playerId);
          if (!position) continue;
          const ddx = position.x - x;
          const ddz = position.z - z;
          if (ddx * ddx + ddz * ddz <= radiusSquared) found.push(playerId);
        }
      }
    }
    return found;
  }

  playerIds(): string[] {
    return [...this.positions.keys()];
  }

  get size(): number {
    return this.positions.size;
  }
}
