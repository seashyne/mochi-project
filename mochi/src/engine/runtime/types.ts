// Shared contracts for the live runtime world (playtest and, later, published sessions).
// Kept free of Three.js so HUD/UI layers can consume it without pulling WebGL in.

import type { StudioObject, StudioObjectType } from '../studio/types';
import type { TransformDeltaPayload } from '../../api/types';

export interface RuntimeVec3 {
  x: number;
  y: number;
  z: number;
}

export type RuntimeLogLevel = 'info' | 'warn' | 'error';

/** Extra context (script source, failing line) attached to a log entry. */
export interface LogMeta {
  code?: string;
  line?: number;
}

/** Console sink shared by every script context of one running session. */
export type RuntimeLogSink = (level: RuntimeLogLevel, message: string, source?: string, meta?: LogMeta) => void;

/** Narrow player surface scripts are allowed to touch. */
export interface RuntimePlayerHandle {
  readonly id: string;
  readonly name: string;
  getPosition(): RuntimeVec3;
  setPosition(x: number, y: number, z: number): void;
  setVelocity(x: number, y: number, z: number): void;
  applyImpulse(x: number, y: number, z: number): void;
  respawn(): void;
  damage(amount: number): void;
  heal(amount: number): void;
  getHealth(): number;
  setHealth(value: number): void;
  getMaxHealth(): number;
  /** Jump launch velocity in metres per second. Absent on a handle that cannot jump. */
  getJumpVelocity?(): number;
  setJumpVelocity?(value: number): void;
  /** Queues one jump, consumed on the next update. */
  jump?(): void;
}

export interface HudNotification {
  id: string;
  message: string;
  at: number;
}

export interface HudSnapshot {
  scores: Record<string, number>;
  leaderboard: Array<{ category: string; score: number }>;
  notifications: HudNotification[];
}

/** A world edit that peers must replay (runtime-spawned or destroyed object). */
export type WorldOp =
  | { kind: 'spawn'; object: StudioObject }
  | { kind: 'destroy'; id: string };

/** Networking surface a session can expose to scripts (`network.FireServer`). */
export interface RuntimeNetworkAdapter {
  fireServer(event: string, data?: unknown): void;
  onClientEvent(event: string, handler: (data: unknown) => void): () => void;
  getState?(key: string): unknown;
  sendWorldOp?(op: WorldOp): void;
  onWorldOp?(handler: (op: WorldOp) => void): () => void;
  /** Replicated object transforms; absent when the transport cannot carry them. */
  sendTransformDelta?(payload: TransformDeltaPayload): void;
  onTransformDelta?(
    handler: (payload: TransformDeltaPayload, senderId: string) => void
  ): () => void;
}

/** Declarative spawn request used by `Instance.new` and `world.createPart`. */
export interface NodeSpawnSpec {
  type: StudioObjectType;
  name?: string;
  position?: Partial<RuntimeVec3>;
  rotation?: Partial<RuntimeVec3>;
  scale?: Partial<RuntimeVec3>;
  color?: string;
  material?: StudioObject['material'];
  anchored?: boolean;
  canCollide?: boolean;
  parentId?: string | null;
  script?: string;
}

export const DEFAULT_PLAYER_SPAWN: RuntimeVec3 = { x: 0, y: 2, z: 0 };

/** Formats arbitrary Lua values for the console without throwing on userdata. */
export function formatLuaArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg === null || arg === undefined) return String(arg);
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return '[table]';
        }
      }
      return String(arg);
    })
    .join(' ');
}

/** Reads a property from a Lua table proxy without assuming it exists. */
export function readProp(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Picks the first defined numeric field from a table-ish value. */
export function readNumber(source: unknown, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readProp(source, key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function toVec3(source: unknown, fallback: RuntimeVec3 = { x: 0, y: 0, z: 0 }): RuntimeVec3 {
  if (typeof source === 'string') {
    const parts = source.split(',').map((part) => Number(part.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      return { x: parts[0], y: parts[1], z: parts[2] };
    }
    return { ...fallback };
  }
  return {
    x: readNumber(source, ['x', 'X']) ?? fallback.x,
    y: readNumber(source, ['y', 'Y']) ?? fallback.y,
    z: readNumber(source, ['z', 'Z']) ?? fallback.z
  };
}

/** Accepts '#rrggbb', 0xRRGGBB or a Color3-shaped { r, g, b } in 0..1. */
export function parseColor(source: unknown, fallback = '#94a3b8'): string {
  if (typeof source === 'string' && /^#?[0-9a-f]{6}$/i.test(source)) {
    return source.startsWith('#') ? source.toLowerCase() : `#${source.toLowerCase()}`;
  }
  if (typeof source === 'number' && Number.isFinite(source)) {
    return `#${Math.max(0, Math.min(0xffffff, Math.round(source))).toString(16).padStart(6, '0')}`;
  }
  const r = readNumber(source, ['r', 'R']);
  const g = readNumber(source, ['g', 'G']);
  const b = readNumber(source, ['b', 'B']);
  if (r !== undefined && g !== undefined && b !== undefined) {
    const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
    return `#${[channel(r), channel(g), channel(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return fallback;
}
