// React binding for the patch history: owns the document array, records a delta
// per edit and applies inverse/forward patches on undo/redo.

import { useCallback, useReducer, useRef, useState } from 'react';
import type { StudioObject } from '../../engine/studio/types';
import {
  applyPatch,
  createPatchHistory,
  diffObjects,
  type PatchHistoryOptions
} from './studioPatchHistory';

export interface CommitOptions {
  mergeKey?: string;
}

export interface StudioPatchHistoryApi {
  objects: StudioObject[];
  /** Increments on every applied change so scene mirrors know to rebuild. */
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  commit: (updater: StudioObject[] | ((prev: StudioObject[]) => StudioObject[]), options?: CommitOptions) => StudioObject[];
  replace: (next: StudioObject[]) => void;
  undo: () => StudioObject[] | null;
  redo: () => StudioObject[] | null;
}

export function useStudioPatchHistory(
  initial: StudioObject[],
  options: PatchHistoryOptions = {}
): StudioPatchHistoryApi {
  const controllerRef = useRef<ReturnType<typeof createPatchHistory> | null>(null);
  if (controllerRef.current === null) controllerRef.current = createPatchHistory(options);
  const controller = controllerRef.current;

  const [objects, setObjects] = useState<StudioObject[]>(initial);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const [revision, setRevision] = useState(0);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const publish = useCallback((next: StudioObject[]) => {
    objectsRef.current = next;
    setObjects(next);
    setRevision((current) => current + 1);
    bump();
  }, []);

  const commit = useCallback(
    (
      updater: StudioObject[] | ((prev: StudioObject[]) => StudioObject[]),
      commitOptions?: CommitOptions
    ): StudioObject[] => {
      const prev = objectsRef.current;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      const patch = diffObjects(prev, next);
      if (!patch) return prev;
      controller.record(patch, commitOptions);
      publish(next);
      return next;
    },
    [controller, publish]
  );

  const replace = useCallback((next: StudioObject[]) => {
    controller.clear();
    publish(next);
  }, [controller, publish]);

  const undo = useCallback((): StudioObject[] | null => {
    const inverse = controller.undo();
    if (!inverse) return null;
    const next = applyPatch(objectsRef.current, inverse);
    publish(next);
    return next;
  }, [controller, publish]);

  const redo = useCallback((): StudioObject[] | null => {
    const forward = controller.redo();
    if (!forward) return null;
    const next = applyPatch(objectsRef.current, forward);
    publish(next);
    return next;
  }, [controller, publish]);

  const state = controller.getState();

  return {
    objects,
    revision,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    commit,
    replace,
    undo,
    redo
  };
}
