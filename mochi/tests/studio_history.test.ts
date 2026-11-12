// Verifies the Studio undo/redo history: snapshot fidelity, merge-key coalescing,
// bounded stack depth, redo invalidation and revision signalling.

import { describe, it, expect } from 'vitest';
import {
  createStudioHistory,
  DEFAULT_HISTORY_LIMIT
} from '../src/components/studio/useStudioHistory';

interface Doc {
  objects: string[];
}

const doc = (...objects: string[]): Doc => ({ objects });

describe('Studio history: undo and redo', () => {
  it('starts empty and refuses to undo or redo', () => {
    const history = createStudioHistory(doc('a'));
    expect(history.getState().present).toEqual(doc('a'));
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('restores the previous snapshot on undo', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'));
    history.commit(doc('a', 'b', 'c'));

    expect(history.undo()).toEqual(doc('a', 'b'));
    expect(history.getState().present).toEqual(doc('a', 'b'));
    expect(history.undo()).toEqual(doc('a'));
    expect(history.undo()).toBeNull();
  });

  it('replays undone commits on redo and clears redo after a new commit', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'));
    history.undo();
    expect(history.getState().future).toHaveLength(1);

    expect(history.redo()).toEqual(doc('a', 'b'));
    expect(history.getState().future).toHaveLength(0);

    history.undo();
    history.commit(doc('a', 'z'));
    expect(history.getState().future).toHaveLength(0);
    expect(history.redo()).toBeNull();
  });

  it('accepts an updater function and ignores no-op commits', () => {
    const history = createStudioHistory(doc('a'));
    const same = history.getState().present;
    history.commit((prev) => prev);
    expect(history.getState().past).toHaveLength(0);
    expect(history.getState().present).toBe(same);

    history.commit((prev) => doc(...prev.objects, 'b'));
    expect(history.getState().present).toEqual(doc('a', 'b'));
  });
});

describe('Studio history: merge keys', () => {
  it('collapses repeated commits that share a merge key into one undo step', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'), { mergeKey: 'transform:x' });
    history.commit(doc('a', 'b', 'c'), { mergeKey: 'transform:x' });
    history.commit(doc('a', 'b', 'c', 'd'), { mergeKey: 'transform:x' });

    expect(history.getState().past).toHaveLength(1);
    expect(history.undo()).toEqual(doc('a'));
  });

  it('keeps a separate entry when the merge key changes', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'), { mergeKey: 'transform:x' });
    history.commit(doc('a', 'b', 'c'), { mergeKey: 'transform:y' });

    expect(history.getState().past).toHaveLength(2);
  });

  it('never merges commits without a merge key', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'));
    history.commit(doc('a', 'b', 'c'));
    expect(history.getState().past).toHaveLength(2);
  });

  it('stops merging once the merge window has elapsed', () => {
    const history = createStudioHistory(doc('a'), { mergeWindowMs: 0 });
    history.commit(doc('a', 'b'), { mergeKey: 'transform:x' });
    history.commit(doc('a', 'b', 'c'), { mergeKey: 'transform:x' });
    expect(history.getState().past).toHaveLength(2);
  });
});

describe('Studio history: bounds and signalling', () => {
  it('drops the oldest entries past the limit', () => {
    const history = createStudioHistory(doc('start'), { limit: 3 });
    for (let i = 0; i < 6; i += 1) {
      history.commit(doc(`v${i}`));
    }
    expect(history.getState().past).toHaveLength(3);
    expect(history.getState().present).toEqual(doc('v5'));
  });

  it('exposes a sane default limit', () => {
    const history = createStudioHistory(doc('start'));
    for (let i = 0; i < DEFAULT_HISTORY_LIMIT + 5; i += 1) {
      history.commit(doc(`v${i}`));
    }
    expect(history.getState().past).toHaveLength(DEFAULT_HISTORY_LIMIT);
  });

  it('bumps the revision only on undo, redo and replace', () => {
    const history = createStudioHistory(doc('a'));
    expect(history.getState().revision).toBe(0);

    history.commit(doc('a', 'b'));
    expect(history.getState().revision).toBe(0);

    history.undo();
    expect(history.getState().revision).toBe(1);

    history.redo();
    expect(history.getState().revision).toBe(2);

    history.replace(doc('remote'));
    expect(history.getState().revision).toBe(3);
  });

  it('treats replace as a hard reset that clears both stacks', () => {
    const history = createStudioHistory(doc('a'));
    history.commit(doc('a', 'b'));
    history.undo();
    history.replace(doc('remote'));

    expect(history.getState().present).toEqual(doc('remote'));
    expect(history.getState().past).toHaveLength(0);
    expect(history.getState().future).toHaveLength(0);
    expect(history.undo()).toBeNull();
  });
});
