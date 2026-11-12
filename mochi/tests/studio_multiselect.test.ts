// Verifies batch selection in the Studio scene: multi-object highlight, primary
// object resolution, toggle semantics, and history-friendly bulk rebuilds.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StudioScene } from '../src/engine/studio/studioScene';
import { StudioObject, StudioObjectType } from '../src/engine/studio/types';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas?: HTMLCanvasElement } = {}) {
      this.domElement = canvas || (document.createElement('canvas') as HTMLCanvasElement);
    }
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer
  };
});

function makeObject(id: string, type: StudioObjectType = 'block'): StudioObject {
  return {
    id,
    name: `Obj_${id}`,
    type,
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#00a2ff'
  };
}

describe('StudioScene batch selection', () => {
  let scene: StudioScene;
  let mockCanvas: HTMLCanvasElement;
  let selectionSets: string[][];

  beforeEach(() => {
    selectionSets = [];
    mockCanvas = {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    } as unknown as HTMLCanvasElement;

    scene = new StudioScene();
    scene.init(mockCanvas);
    scene.setSelectionSetCallback((ids) => selectionSets.push(ids));
    scene.addObject(makeObject('a'));
    scene.addObject(makeObject('b'));
    scene.addObject(makeObject('c'));
    selectionSets = [];
  });

  afterEach(() => {
    scene?.destroy();
  });

  it('selects several objects and reports the first one as primary', () => {
    scene.selectObjects(['a', 'c']);

    expect(scene.getSelectedIds()).toEqual(['a', 'c']);
    expect(scene.getSelectedId()).toBe('a');
    expect(selectionSets.at(-1)).toEqual(['a', 'c']);
  });

  it('drops duplicate and unknown ids from a selection request', () => {
    scene.selectObjects(['a', 'a', 'ghost', 'b']);

    expect(scene.getSelectedIds()).toEqual(['a', 'b']);
  });

  it('replaces the whole selection when selecting a single object', () => {
    scene.selectObjects(['a', 'b']);
    scene.selectObject('c');

    expect(scene.getSelectedIds()).toEqual(['c']);
    expect(scene.getSelectedId()).toBe('c');
  });

  it('adds on toggle when absent and removes when present', () => {
    scene.selectObject('a');

    scene.toggleSelection('b');
    expect(scene.getSelectedIds()).toEqual(['a', 'b']);

    scene.toggleSelection('a');
    expect(scene.getSelectedIds()).toEqual(['b']);

    scene.toggleSelection('b');
    expect(scene.getSelectedIds()).toEqual([]);
    expect(scene.getSelectedId()).toBeNull();
  });

  it('clears the selection entirely', () => {
    scene.selectObjects(['a', 'b', 'c']);
    scene.clearSelection();

    expect(scene.getSelectedIds()).toEqual([]);
    expect(scene.getSelectedId()).toBeNull();
    expect(selectionSets.at(-1)).toEqual([]);
  });

  it('removes a deleted object from the active selection', () => {
    scene.selectObjects(['a', 'b']);
    scene.removeObject('a');

    expect(scene.getSelectedIds()).toEqual(['b']);
    expect(scene.getSelectedId()).toBe('b');
  });

  it('rebuilds the mirror without stealing focus during a history restore', () => {
    scene.selectObjects(['b']);
    const before = selectionSets.length;

    scene.replaceAll([makeObject('x'), makeObject('y')]);

    expect(scene.getSelectedIds()).toEqual([]);
    expect(scene.exportSnapshot('t').objects.map((o) => o.id)).toEqual(['x', 'y']);
    expect(selectionSets.length).toBe(before + 1);
  });

  it('keeps the snapshot order stable across a rebuild', () => {
    scene.replaceAll([makeObject('z'), makeObject('a'), makeObject('m')]);
    expect(scene.exportSnapshot('t').objects.map((o) => o.id)).toEqual(['z', 'a', 'm']);
  });
});
