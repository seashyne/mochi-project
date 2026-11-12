// Uniform-grid spatial hash broadphase. Bodies are bucketed by AABB into fixed
// cells so collision pairs and ray queries only examine nearby bodies instead
// of every pair in the world. Oversized bodies fall back to a short list that
// is tested against all dynamic bodies.

import type { RigidBody } from './body';
import type { AABB, PhysicsVec3 } from './types';

const MAX_CELL_SPAN = 4;

export class SpatialHash {
  private cells = new Map<string, RigidBody[]>();
  private large: RigidBody[] = [];
  private indices = new Map<RigidBody, number>();
  private snapshots = new Map<RigidBody, AABB>();
  private placements = new Map<RigidBody, string[]>();
  private list: RigidBody[] = [];

  constructor(private readonly cellSize = 16) {}

  clear(): void {
    this.cells.clear();
    this.large.length = 0;
    this.indices.clear();
    this.snapshots.clear();
    this.placements.clear();
    this.list = [];
  }

  rebuild(bodies: RigidBody[]): void {
    if (bodies.length !== this.indices.size || bodies.some(body => !this.indices.has(body))) {
      this.clear();
      this.list = bodies;
      bodies.forEach((body, index) => {
        this.indices.set(body, index);
        this.insert(body);
      });
      return;
    }
    // Static scenery keeps its cells; only bodies whose AABB changed move.
    this.list = bodies;
    bodies.forEach((body, index) => {
      this.indices.set(body, index);
      if (this.snapshots.get(body) === body.getAABB()) return;
      this.remove(body);
      this.insert(body);
    });
  }

  // updateAABB replaces the cached AABB object, so reference equality detects
  // any movement since the last rebuild without touching RigidBody internals.
  isFresh(bodies: RigidBody[]): boolean {
    if (bodies.length !== this.indices.size) return false;
    for (const body of bodies) {
      if (this.snapshots.get(body) !== body.getAABB()) return false;
    }
    return true;
  }

  forEachPair(visit: (a: RigidBody, b: RigidBody) => void): void {
    const seen = new Set<RigidBody>();
    const consider = (a: RigidBody, b: RigidBody): void => {
      if (b === a || seen.has(b)) return;
      seen.add(b);
      const ia = this.indices.get(a)!;
      const ib = this.indices.get(b)!;
      if (b.type === 'dynamic' && ib <= ia) return;
      // Keep the original lower-index-first pair orientation.
      if (ib < ia) visit(b, a);
      else visit(a, b);
    };
    for (const a of this.list) {
      if (a.type !== 'dynamic') continue;
      seen.clear();
      if (this.large.includes(a)) {
        for (const b of this.list) consider(a, b);
        continue;
      }
      this.forCells(a.getAABB(), (cell) => {
        for (const b of cell) consider(a, b);
      });
      for (const b of this.large) consider(a, b);
    }
  }

  queryRay(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance: number): RigidBody[] {
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const end = {
      x: origin.x + (direction.x / length) * maxDistance,
      y: origin.y + (direction.y / length) * maxDistance,
      z: origin.z + (direction.z / length) * maxDistance
    };
    const bounds: AABB = {
      min: { x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), z: Math.min(origin.z, end.z) },
      max: { x: Math.max(origin.x, end.x), y: Math.max(origin.y, end.y), z: Math.max(origin.z, end.z) }
    };
    const found = new Set<RigidBody>(this.large);
    this.forCells(bounds, (cell) => {
      for (const body of cell) found.add(body);
    });
    return [...found];
  }

  private insert(body: RigidBody): void {
    const aabb = body.getAABB();
    this.snapshots.set(body, aabb);
    const min = this.cellOf(aabb.min);
    const max = this.cellOf(aabb.max);
    if (
      max.x - min.x >= MAX_CELL_SPAN ||
      max.y - min.y >= MAX_CELL_SPAN ||
      max.z - min.z >= MAX_CELL_SPAN
    ) {
      this.large.push(body);
      return;
    }
    const keys: string[] = [];
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (let z = min.z; z <= max.z; z++) {
          const key = `${x},${y},${z}`;
          keys.push(key);
          const cell = this.cells.get(key);
          if (cell) cell.push(body);
          else this.cells.set(key, [body]);
        }
      }
    }
    this.placements.set(body, keys);
  }

  private remove(body: RigidBody): void {
    const keys = this.placements.get(body);
    if (keys) {
      for (const key of keys) {
        const cell = this.cells.get(key);
        if (!cell) continue;
        const index = cell.indexOf(body);
        if (index >= 0) cell.splice(index, 1);
        if (cell.length === 0) this.cells.delete(key);
      }
      this.placements.delete(body);
    } else {
      const index = this.large.indexOf(body);
      if (index >= 0) this.large.splice(index, 1);
    }
    this.snapshots.delete(body);
  }

  private forCells(aabb: AABB, visit: (cell: RigidBody[]) => void): void {
    const min = this.cellOf(aabb.min);
    const max = this.cellOf(aabb.max);
    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (let z = min.z; z <= max.z; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (cell) visit(cell);
        }
      }
    }
  }

  private cellOf(point: PhysicsVec3): { x: number; y: number; z: number } {
    return {
      x: Math.floor(point.x / this.cellSize),
      y: Math.floor(point.y / this.cellSize),
      z: Math.floor(point.z / this.cellSize)
    };
  }
}