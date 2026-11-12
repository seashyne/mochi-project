// Patch history contract: the editor stores deltas, not snapshots, so memory
// must scale with the edit rather than with the scene.

import { describe, it, expect } from 'vitest';

import {
  applyPatch,
  createPatchHistory,
  diffObjects,
  invertPatch,
  isEmptyPatch,
  mergeObjectPatches
} from '../src/components/studio/studioPatchHistory';
import type { StudioObject } from '../src/engine/studio/types';

function obj(id: string, overrides: Partial<StudioObject> = {}): StudioObject {
  return {
    id,
    name: id,
    type: 'block',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#6366f1',
    ...overrides
  };
}

const move = (object: StudioObject, x: number): StudioObject => ({
  ...object,
  position: { ...object.position, x }
});

describe('diffObjects', () => {
  it('returns null when nothing changed', () => {
    const objects = [obj('a'), obj('b')];
    expect(diffObjects(objects, objects)).toBeNull();
  });

  it('records an added object with its index', () => {
    const a = obj('a');
    const b = obj('b');
    const patch = diffObjects([a], [a, b]);
    expect(patch?.added).toEqual([{ index: 1, object: b }]);
    expect(patch?.removed).toEqual([]);
    expect(patch?.updated).toEqual([]);
  });

  it('records a removed object with its original index', () => {
    const patch = diffObjects([obj('a'), obj('b'), obj('c')], [obj('a'), obj('c')]);
    expect(patch?.removed.map((entry) => [entry.index, entry.object.id])).toEqual([[1, 'b']]);
  });

  it('records a changed object as a before/after pair', () => {
    const before = obj('a');
    const after = move(before, 5);
    const patch = diffObjects([before], [after]);
    expect(patch?.updated).toEqual([{ before, after }]);
  });

  it('keeps a single edit out of a large scene', () => {
    const objects = Array.from({ length: 500 }, (_, index) => obj(`o${index}`));
    const next = objects.map((object) => (object.id === 'o250' ? move(object, 9) : object));
    const patch = diffObjects(objects, next);
    expect(patch?.updated).toHaveLength(1);
    expect(patch?.added).toHaveLength(0);
    expect(patch?.removed).toHaveLength(0);
  });
});

describe('applyPatch', () => {
  it('reproduces the edited document', () => {
    const prev = [obj('a'), obj('b')];
    const next = [obj('a'), move(obj('b'), 3), obj('c')];
    const patch = diffObjects(prev, next);
    expect(patch).not.toBeNull();
    expect(applyPatch(prev, patch!)).toEqual(next);
  });

  it('restores a removed object at its original position', () => {
    const prev = [obj('a'), obj('b'), obj('c')];
    const next = [obj('a'), obj('c')];
    const inverse = invertPatch(diffObjects(prev, next)!);
    expect(applyPatch(next, inverse).map((object) => object.id)).toEqual(['a', 'b', 'c']);
  });

  it('round-trips every kind of edit through the inverse patch', () => {
    const prev = [obj('keep'), obj('gone'), obj('edit')];
    const next = [obj('keep'), move(obj('edit'), 7), obj('fresh')];
    const patch = diffObjects(prev, next)!;
    const restored = applyPatch(applyPatch(prev, patch), invertPatch(patch));
    expect(restored).toEqual(prev);
  });

  it('leaves the document alone for an empty patch', () => {
    const objects = [obj('a')];
    expect(applyPatch(objects, { added: [], removed: [], updated: [] })).toEqual(objects);
  });
});

describe('mergeObjectPatches', () => {
  it('keeps the first before and the last after for a drag', () => {
    const start = obj('a');
    const middle = move(start, 1);
    const end = move(middle, 2);
    const merged = mergeObjectPatches(diffObjects([start], [middle])!, diffObjects([middle], [end])!);
    expect(merged?.updated).toEqual([{ before: start, after: end }]);
  });

  it('refuses to merge structural edits', () => {
    const a = obj('a');
    const b = obj('b');
    const add = diffObjects([a], [a, b])!;
    const update = diffObjects([a, b], [a, move(b, 2)])!;
    expect(mergeObjectPatches(add, update)).toBeNull();
    expect(isEmptyPatch({ added: [], removed: [], updated: [] })).toBe(true);
  });
});

describe('createPatchHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createPatchHistory();
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('hands back the inverse on undo and the forward patch on redo', () => {
    const history = createPatchHistory();
    const prev = [obj('a')];
    const next = [obj('a'), obj('b')];
    const patch = diffObjects(prev, next)!;

    history.record(patch);
    const inverse = history.undo()!;
    expect(applyPatch(next, inverse)).toEqual(prev);
    expect(history.getState()).toMatchObject({ canUndo: false, canRedo: true });

    const forward = history.redo()!;
    expect(applyPatch(prev, forward)).toEqual(next);
    expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('collapses a drag inside the merge window into one entry', () => {
    const history = createPatchHistory({ mergeWindowMs: 10_000 });
    const start = obj('a');
    let current = start;
    for (let step = 1; step <= 5; step += 1) {
      const next = move(current, step);
      history.record(diffObjects([current], [next])!, { mergeKey: 'transform:a' });
      current = next;
    }
    expect(history.getState().undoDepth).toBe(1);
    const inverse = history.undo()!;
    expect(applyPatch([current], inverse)).toEqual([start]);
  });

  it('starts a new entry when the merge key changes', () => {
    const history = createPatchHistory({ mergeWindowMs: 10_000 });
    const start = obj('a');
    const once = move(start, 1);
    const twice = move(once, 2);
    history.record(diffObjects([start], [once])!, { mergeKey: 'transform:a' });
    history.record(diffObjects([once], [twice])!, { mergeKey: 'transform:b' });
    expect(history.getState().undoDepth).toBe(2);
  });

  it('drops the oldest entries past the limit', () => {
    const history = createPatchHistory({ limit: 2, mergeWindowMs: 0 });
    let current = [obj('a')];
    for (let step = 0; step < 5; step += 1) {
      const next = [move(current[0], step + 1)];
      history.record(diffObjects(current, next)!);
      current = next;
    }
    expect(history.getState().undoDepth).toBe(2);
  });

  it('clears the redo stack when a new edit lands', () => {
    const history = createPatchHistory();
    const a = [obj('a')];
    const b = [obj('a'), obj('b')];
    history.record(diffObjects(a, b)!);
    history.undo();
    expect(history.getState().canRedo).toBe(true);
    history.record(diffObjects(a, [move(obj('a'), 4)])!);
    expect(history.getState().canRedo).toBe(false);
  });

  it('ignores empty patches', () => {
    const history = createPatchHistory();
    history.record({ added: [], removed: [], updated: [] });
    expect(history.getState().undoDepth).toBe(0);
  });

  it('forgets everything on clear', () => {
    const history = createPatchHistory();
    history.record(diffObjects([obj('a')], [obj('a'), obj('b')])!);
    history.clear();
    expect(history.getState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  });
});
