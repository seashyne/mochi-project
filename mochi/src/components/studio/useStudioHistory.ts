// Snapshot-based undo/redo history for the Studio document.
// The controller is a plain object so the behaviour can be tested without a DOM;
// the hook only adds React re-rendering on top of it.
//
// Commits that share a merge key inside the merge window collapse into a single
// entry, so one gizmo drag becomes one undo step instead of one per frame.

import { useCallback, useMemo, useReducer, useRef } from 'react';

export interface StudioHistoryOptions {
  limit?: number;
  mergeWindowMs?: number;
}

export interface CommitOptions {
  mergeKey?: string;
}

export interface HistoryEntry<T> {
  value: T;
  mergeKey: string | null;
  at: number;
}

export interface HistorySnapshot<T> {
  present: T;
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
  revision: number;
}

export interface StudioHistoryController<T> {
  getState: () => HistorySnapshot<T>;
  commit: (updater: T | ((prev: T) => T), options?: CommitOptions) => T;
  replace: (next: T) => void;
  undo: () => T | null;
  redo: () => T | null;
}

export interface StudioHistoryApi<T> {
  value: T;
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
  /** Increments on undo, redo and replace so scene mirrors know to rebuild. */
  revision: number;
  commit: (updater: T | ((prev: T) => T), options?: CommitOptions) => T;
  replace: (next: T) => void;
  undo: () => T | null;
  redo: () => T | null;
}

export const DEFAULT_HISTORY_LIMIT = 100;
export const DEFAULT_MERGE_WINDOW_MS = 600;

function pushBounded<T>(entries: HistoryEntry<T>[], entry: HistoryEntry<T>, limit: number): HistoryEntry<T>[] {
  const next = [...entries, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function createStudioHistory<T>(
  initial: T,
  options: StudioHistoryOptions = {}
): StudioHistoryController<T> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;

  let state: HistorySnapshot<T> = { present: initial, past: [], future: [], revision: 0 };

  return {
    getState: () => state,

    commit(updater, commitOptions) {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(state.present) : updater;
      if (Object.is(next, state.present)) return state.present;

      const now = Date.now();
      const mergeKey = commitOptions?.mergeKey ?? null;
      const last = state.past[state.past.length - 1];
      const merges =
        mergeKey !== null &&
        last !== undefined &&
        last.mergeKey === mergeKey &&
        now - last.at < mergeWindowMs;

      state = {
        present: next,
        past: merges
          ? state.past
          : pushBounded(state.past, { value: state.present, mergeKey, at: now }, limit),
        future: [],
        revision: state.revision
      };
      return next;
    },

    replace(next) {
      state = { present: next, past: [], future: [], revision: state.revision + 1 };
    },

    undo() {
      const entry = state.past[state.past.length - 1];
      if (!entry) return null;
      state = {
        present: entry.value,
        past: state.past.slice(0, -1),
        future: [{ value: state.present, mergeKey: entry.mergeKey, at: Date.now() }, ...state.future].slice(0, limit),
        revision: state.revision + 1
      };
      return entry.value;
    },

    redo() {
      const entry = state.future[0];
      if (!entry) return null;
      state = {
        present: entry.value,
        past: pushBounded(state.past, { value: state.present, mergeKey: entry.mergeKey, at: Date.now() }, limit),
        future: state.future.slice(1),
        revision: state.revision + 1
      };
      return entry.value;
    }
  };
}

export function useStudioHistory<T>(
  initial: T,
  options: StudioHistoryOptions = {}
): StudioHistoryApi<T> {
  const controllerRef = useRef<StudioHistoryController<T> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createStudioHistory(initial, options);
  }
  const controller = controllerRef.current;
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const commit = useCallback(
    (updater: T | ((prev: T) => T), commitOptions?: CommitOptions) => {
      const next = controller.commit(updater, commitOptions);
      bump();
      return next;
    },
    [controller]
  );

  const replace = useCallback((next: T) => {
    controller.replace(next);
    bump();
  }, [controller]);

  const undo = useCallback((): T | null => {
    const restored = controller.undo();
    if (restored !== null) bump();
    return restored;
  }, [controller]);

  const redo = useCallback((): T | null => {
    const restored = controller.redo();
    if (restored !== null) bump();
    return restored;
  }, [controller]);

  const snapshot = controller.getState();

  return useMemo(
    () => ({
      value: snapshot.present,
      canUndo: snapshot.past.length > 0,
      canRedo: snapshot.future.length > 0,
      undoDepth: snapshot.past.length,
      redoDepth: snapshot.future.length,
      revision: snapshot.revision,
      commit,
      replace,
      undo,
      redo
    }),
    [snapshot, commit, replace, undo, redo]
  );
}
