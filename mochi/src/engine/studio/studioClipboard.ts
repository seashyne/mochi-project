// Graph-aware clipboard helpers. Copy keeps descendants, paste re-issues ids and
// rewrites parent links (and joint attachments) so no dangling references survive.

import type { StudioObject } from './types';

export const CLIPBOARD_OFFSET = { x: 1, y: 0, z: 1 };

function cloneObject(obj: StudioObject): StudioObject {
  return JSON.parse(JSON.stringify(obj)) as StudioObject;
}

/** Expands a selection to include descendants, then deep-clones it. */
export function collectClipboard(objects: StudioObject[], ids: string[]): StudioObject[] {
  const included = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const obj of objects) {
      if (obj.parentId && included.has(obj.parentId) && !included.has(obj.id)) {
        included.add(obj.id);
        grew = true;
      }
    }
  }
  return objects.filter((obj) => included.has(obj.id)).map(cloneObject);
}

/** Fresh ids for every entry; parent/constraint references stay inside the paste. */
export function remapClipboard(
  entries: StudioObject[],
  makeId: (type: string) => string
): StudioObject[] {
  const ids = new Map<string, string>();
  for (const entry of entries) ids.set(entry.id, makeId(entry.type));

  return entries.map((source) => {
    const clone = cloneObject(source);
    clone.id = ids.get(source.id)!;
    clone.parentId = source.parentId ? (ids.get(source.parentId) ?? null) : null;
    if (clone.constraint) {
      clone.constraint = {
        ...clone.constraint,
        attachment0: ids.get(clone.constraint.attachment0) ?? clone.constraint.attachment0,
        attachment1: ids.get(clone.constraint.attachment1) ?? clone.constraint.attachment1
      };
    }
    return clone;
  });
}

/** Repeated pastes step further away so copies never stack exactly on top. */
export function offsetClipboard(
  entries: StudioObject[],
  times: number
): StudioObject[] {
  if (times <= 0) return entries.map(cloneObject);
  return entries.map((source) => {
    const clone = cloneObject(source);
    clone.position = {
      x: clone.position.x + CLIPBOARD_OFFSET.x * times,
      y: clone.position.y + CLIPBOARD_OFFSET.y * times,
      z: clone.position.z + CLIPBOARD_OFFSET.z * times
    };
    clone.name = times > 1 ? `${clone.name}_Paste${times}` : `${clone.name}_Paste`;
    return clone;
  });
}

/** True when the pasted graph would reference an object outside the workspace. */
export function hasDanglingReferences(entries: StudioObject[], existing: StudioObject[]): boolean {
  const known = new Set(existing.map((obj) => obj.id));
  for (const entry of entries) {
    if (entry.parentId && !known.has(entry.parentId)) return true;
  }
  return false;
}
