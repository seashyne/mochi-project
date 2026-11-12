// Hierarchy helpers shared by the Explorer dock and the document controller.
//
// Pure array scans over `parentId`, so the grouping rules can be unit-tested
// without a scene or a DOM.

import type { StudioObject } from './types';

/**
 * True when `candidateChildId` sits anywhere below `ancestorId` in the parent
 * chain. A part is never its own descendant.
 */
export function isDescendant(
  objects: StudioObject[],
  candidateChildId: string,
  ancestorId: string
): boolean {
  if (candidateChildId === ancestorId) return false;
  let current = objects.find((object) => object.id === candidateChildId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    const parentId = current.parentId;
    current = objects.find((object) => object.id === parentId);
  }
  return false;
}

/** Groups parts by parent id; roots are not present in the map. */
export function childMap(objects: StudioObject[]): Map<string, StudioObject[]> {
  const map = new Map<string, StudioObject[]>();
  objects.forEach((object) => {
    if (!object.parentId) return;
    const list = map.get(object.parentId) ?? [];
    list.push(object);
    map.set(object.parentId, list);
  });
  return map;
}

/** Parts with no parent, in document order. */
export function rootObjects(objects: StudioObject[]): StudioObject[] {
  return objects.filter((object) => !object.parentId);
}
