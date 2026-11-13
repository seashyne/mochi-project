// Bridges the node transform and the Lua `CFrame` value.
//
// The type itself is defined in the Lua prelude, because `*` needs a metamethod and
// only Lua can attach one. That means a CFrame can only be *created* by the VM that
// will use it - a table built in one engine is not a value in another.
//
// A script context therefore publishes its factory here for the duration of a
// synchronous run, and the node proxy asks for the active one. Execution is
// single-threaded and never interleaves two VMs, so a module-level slot is enough;
// the context clears it in a `finally` so a suspended script leaves nothing behind.

import { eulerFromMatrix } from './cframeMath';
import type { RuntimeVec3 } from './types';

type CFrameFactory = (...args: number[]) => unknown;

let activeFactory: CFrameFactory | null = null;

/** Called by a script context around a synchronous run. */
export function setActiveCFrameFactory(factory: CFrameFactory | null): void {
  activeFactory = factory;
}

/**
 * Builds a CFrame for a node transform, or `undefined` when no script is running -
 * which is the honest answer in a headless context, where there is no Lua VM to own
 * the value.
 */
export function makeCFrameValue(position: RuntimeVec3, matrix: number[]): unknown {
  if (!activeFactory) return undefined;
  return activeFactory(
    position.x, position.y, position.z,
    matrix[0], matrix[1], matrix[2],
    matrix[3], matrix[4], matrix[5],
    matrix[6], matrix[7], matrix[8]
  );
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const raw = Number(source[key]);
  return Number.isFinite(raw) ? raw : null;
}

/**
 * Reads a Lua CFrame back into a node transform. Returns null for anything that is
 * not a CFrame, so assigning junk to `part.CFrame` is a no-op rather than a crash.
 */
export function readCFrameValue(value: unknown): { position: RuntimeVec3; rotation: RuntimeVec3 } | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;

  const x = readNumber(source, 'x');
  const y = readNumber(source, 'y');
  const z = readNumber(source, 'z');
  const matrix = [
    readNumber(source, 'm00'), readNumber(source, 'm01'), readNumber(source, 'm02'),
    readNumber(source, 'm10'), readNumber(source, 'm11'), readNumber(source, 'm12'),
    readNumber(source, 'm20'), readNumber(source, 'm21'), readNumber(source, 'm22')
  ];
  if (x === null || y === null || z === null || matrix.some((entry) => entry === null)) {
    return null;
  }

  return {
    position: { x, y, z },
    rotation: eulerFromMatrix(matrix as number[])
  };
}
