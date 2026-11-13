// Walkability grid shared by the pathfinder and the smoothing pass.
//
// Cell coordinates are integers; world coordinates are metres. The grid stores
// one byte per cell so a 512x512 map costs 256 KB, and it is mutable so the
// Studio can re-bake a region without rebuilding the whole thing.

export interface NavPoint {
  x: number;
  y: number;
}

export interface NavGridOptions {
  width: number;
  height: number;
  /** Edge length of one cell in metres. */
  cellSize: number;
  /** World position of cell (0, 0)'s corner. */
  origin?: { x: number; z: number };
  /** 1 = blocked, 0 = walkable. Defaults to fully walkable. */
  blocked?: Uint8Array;
  /** Connected-region labels from the WASM bake; 0 for blocked or unlabelled. */
  regions?: Uint32Array;
  /** Number of regions in `regions`; informational. */
  regionCount?: number;
}

export class NavGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originZ: number;
  /**
   * Connected walkable regions, when the grid came from the WASM bake. A route
   * between two different labels cannot exist, which the pathfinder uses to give
   * up before searching. Null when the bake ran in TypeScript.
   */
  readonly regions: Uint32Array | null;
  readonly regionCount: number;
  private readonly blocked: Uint8Array;

  constructor(options: NavGridOptions) {
    const width = Math.floor(options.width);
    const height = Math.floor(options.height);
    if (!Number.isFinite(width) || width <= 0) throw new Error('NavGrid width must be positive');
    if (!Number.isFinite(height) || height <= 0) throw new Error('NavGrid height must be positive');
    if (!Number.isFinite(options.cellSize) || options.cellSize <= 0) {
      throw new Error('NavGrid cellSize must be positive');
    }

    this.width = width;
    this.height = height;
    this.cellSize = options.cellSize;
    this.originX = options.origin?.x ?? 0;
    this.originZ = options.origin?.z ?? 0;

    const expected = width * height;
    this.regions = options.regions && options.regions.length === expected ? options.regions : null;
    this.regionCount = this.regions ? options.regionCount ?? 0 : 0;
    if (options.blocked && options.blocked.length === expected) {
      this.blocked = options.blocked;
    } else {
      this.blocked = new Uint8Array(expected);
      if (options.blocked) {
        // A mismatched buffer is a programming error, but silently resizing is
        // worse than copying what fits: keep the overlap.
        const limit = Math.min(expected, options.blocked.length);
        this.blocked.set(options.blocked.subarray(0, limit));
      }
    }
  }

  get cellCount(): number {
    return this.width * this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  isInside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isWalkable(x: number, y: number): boolean {
    return this.isInside(x, y) && this.blocked[this.index(x, y)] === 0;
  }

  /** Region label for a cell: 0 when blocked, outside, or unlabelled. */
  regionAt(x: number, y: number): number {
    if (!this.regions || !this.isInside(x, y)) return 0;
    return this.regions[this.index(x, y)];
  }

  setBlocked(x: number, y: number, value: boolean): void {
    if (!this.isInside(x, y)) return;
    this.blocked[this.index(x, y)] = value ? 1 : 0;
  }

  /** World metres to cell coordinates, or null when outside the grid. */
  worldToCell(worldX: number, worldZ: number): NavPoint | null {
    const x = Math.floor((worldX - this.originX) / this.cellSize);
    const y = Math.floor((worldZ - this.originZ) / this.cellSize);
    return this.isInside(x, y) ? { x, y } : null;
  }

  /** Cell centre in world metres. */
  cellToWorld(x: number, y: number): { x: number; z: number } {
    return {
      x: this.originX + (x + 0.5) * this.cellSize,
      z: this.originZ + (y + 0.5) * this.cellSize
    };
  }

  /** Builds a grid from a per-cell walkability predicate. */
  static fromPredicate(
    width: number,
    height: number,
    cellSize: number,
    walkable: (x: number, y: number) => boolean,
    origin?: { x: number; z: number }
  ): NavGrid {
    const blocked = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!walkable(x, y)) blocked[y * width + x] = 1;
      }
    }
    return new NavGrid({ width, height, cellSize, origin, blocked });
  }
}
