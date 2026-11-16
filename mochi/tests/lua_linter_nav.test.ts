// Unit tests for CodeMirror 6 Lua Linter Diagnostics and Jump-to-Line Navigation

import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { jumpToLine } from '../src/components/studio/editor/luaLinter';

describe('Lua Linter & Jump-to-Line Navigation', () => {
  it('navigates to the exact line and column offset in the document', () => {
    const text = 'local a = 10\nlocal b = 20\nlocal c = 30\nlocal d = 40';
    const state = EditorState.create({ doc: text });
    let dispatchedTransaction: unknown = null;
    let focused = false;

    const mockView = {
      state,
      dispatch: vi.fn((tr) => {
        dispatchedTransaction = tr;
      }),
      focus: vi.fn(() => {
        focused = true;
      })
    } as unknown as EditorView;

    // Line 3 starts at index 26 ('local c = 30')
    jumpToLine(mockView, 3, 1);

    expect(mockView.dispatch).toHaveBeenCalled();
    expect(focused).toBe(true);
    expect(dispatchedTransaction).toMatchObject({
      selection: { anchor: 26, head: 26 },
      scrollIntoView: true
    });
  });

  it('clamps out-of-bounds line numbers safely to the document boundary', () => {
    const text = 'line 1\nline 2\nline 3';
    const state = EditorState.create({ doc: text });
    let targetPos = -1;

    const mockView = {
      state,
      dispatch: vi.fn((tr: { selection: { anchor: number } }) => {
        targetPos = tr.selection.anchor;
      }),
      focus: vi.fn()
    } as unknown as EditorView;

    // Line 999 exceeds 3 lines -> clamped to line 3 (index 14)
    jumpToLine(mockView, 999);
    expect(targetPos).toBe(14);

    // Negative line clamped to line 1 (index 0)
    jumpToLine(mockView, -5);
    expect(targetPos).toBe(0);
  });

  it('clamps column offset to line length', () => {
    const text = 'short\nline 2';
    const state = EditorState.create({ doc: text });
    let targetPos = -1;

    const mockView = {
      state,
      dispatch: vi.fn((tr: { selection: { anchor: number } }) => {
        targetPos = tr.selection.anchor;
      }),
      focus: vi.fn()
    } as unknown as EditorView;

    // Line 1 is 5 chars long ('short'). Requesting col 50 clamps to end of line 1 (pos 5)
    jumpToLine(mockView, 1, 50);
    expect(targetPos).toBe(5);
  });

  it('safely handles NaN and non-finite line and column values', () => {
    const text = 'first line\nsecond line';
    const state = EditorState.create({ doc: text });
    let targetPos = -1;

    const mockView = {
      state,
      dispatch: vi.fn((tr: { selection: { anchor: number } }) => {
        targetPos = tr.selection.anchor;
      }),
      focus: vi.fn()
    } as unknown as EditorView;

    // jumpToLine with NaN line and col safely falls back to line 1, col 1 (pos 0) without throwing
    expect(() => {
      jumpToLine(mockView, NaN, NaN);
    }).not.toThrow();
    expect(targetPos).toBe(0);

    // jumpToLine with NaN line only
    jumpToLine(mockView, NaN, 1);
    expect(targetPos).toBe(0);

    // jumpToLine with NaN column on line 2 (line 2 starts at offset 11)
    jumpToLine(mockView, 2, NaN);
    expect(targetPos).toBe(11);
  });

  it('safely handles null or uninitialized view references', () => {
    expect(() => {
      jumpToLine(null as unknown as EditorView, 1);
    }).not.toThrow();

    expect(() => {
      jumpToLine({} as unknown as EditorView, 1);
    }).not.toThrow();
  });
});
