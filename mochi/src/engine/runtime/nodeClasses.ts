// What a part answers to when a script asks `IsA`.
//
// `IsA` used to compare the object's raw type against the name, so `part:IsA("Part")` was
// false for a block: the type is "block", the name asked for "Part". A ported script that
// guards with `if child:IsA("BasePart")` therefore skipped every part in the world, which
// is the kind of wrong that looks like the script simply doing nothing.
//
// These are the class names a creator is likely to test for. The list is deliberately
// short and honest: it names what the object really is in this engine's terms, not every
// class the platform it mirrors happens to have.

import type { LiveNode } from './liveNode';
import type { StudioObjectType } from '../studio/types';

const PART = ['Part', 'BasePart', 'PVInstance', 'Instance'];
const MODEL = ['Model', 'PVInstance', 'Instance'];

const CLASSES: Record<StudioObjectType, string[]> = {
  block: PART,
  sphere: PART,
  cylinder: PART,
  ramp: PART,
  platform: PART,
  coin: PART,
  jump_pad: PART,
  hazard: PART,
  spawn: ['SpawnLocation', ...PART],
  terrain: ['Terrain', 'BasePart', 'PVInstance', 'Instance'],
  agent: MODEL,
  model: MODEL,
  constraint: ['Constraint', 'Instance'],
  particle: ['ParticleEmitter', 'Instance']
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

/** True when an object of `type` is of `className`, or of a class it inherits from. */
export function isA(type: string, className: string): boolean {
  const wanted = normalize(className);
  const names = CLASSES[type as StudioObjectType];
  if (!names) return normalize(type) === wanted;
  return names.some((name) => normalize(name) === wanted);
}

/**
 * Depth-first search by name. `recursive` is the second argument of `FindFirstChild`,
 * which is how a script reaches into a model without walking it by hand.
 */
export function findChild(
  children: LiveNode[],
  name: string,
  recursive: boolean
): LiveNode | undefined {
  for (const child of children) {
    if (child.name.toLowerCase() === name) return child;
    if (recursive) {
      const found = findChild(child.children, name, true);
      if (found) return found;
    }
  }
  return undefined;
}
