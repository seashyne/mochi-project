// `world:Raycast` for scripts.
//
// The physics world has cast rays since the character controller needed ground checks,
// but nothing exposed it to Lua, so line-of-sight, aiming and placement had no answer.
//
// The node lookup and the proxy builder are passed in rather than imported: both live in
// `luaNodeApi`, which is the module that calls this, and importing them back would make
// the two files import each other.

import type { LiveNode } from './liveNode';
import type { RuntimeApiDeps } from './luaNodeApi';
import { toVec3 } from './types';

export interface RaycastHelpers {
  /** Resolves a value a script passed to the node behind it, if any. */
  resolveNode: (value: unknown) => LiveNode | undefined;
  /** Wraps a node so a script can read `.Name`, `.Position` and the rest. */
  wrapNode: (node: LiveNode) => Record<string, unknown>;
}

export type RaycastResult = Record<string, unknown> | undefined;

export function createRaycast(deps: RuntimeApiDeps, helpers: RaycastHelpers) {
  /**
   * The direction's length is the reach, which is how the platform this mirrors spells
   * it: `Raycast(origin, Vector3.new(0, -10, 0))` looks ten studs down. Returns nil when
   * nothing is hit, so a script can write `if hit then`.
   */
  return (originValue: unknown, directionValue: unknown, ignoreValue?: unknown): RaycastResult => {
    const origin = toVec3(originValue);
    const raw = toVec3(directionValue);
    const reach = Math.hypot(raw.x, raw.y, raw.z);
    if (!Number.isFinite(reach) || reach <= 0) return undefined;

    const ignore = helpers.resolveNode(ignoreValue);
    const result = deps.world.raycast(
      origin,
      { x: raw.x / reach, y: raw.y / reach, z: raw.z / reach },
      reach,
      ignore?.body?.id ?? null
    );
    if (!result.hit) return undefined;

    return {
      Instance: result.node ? helpers.wrapNode(result.node) : undefined,
      Position: result.point,
      Normal: result.normal,
      Distance: result.distance
    };
  };
}
