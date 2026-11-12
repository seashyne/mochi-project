// M16 Editor Parity: clipboard, multi-select transform, camera rig, snap config

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  collectClipboard,
  remapClipboard,
  offsetClipboard,
  hasDanglingReferences,
  CLIPBOARD_OFFSET
} from '../src/engine/studio/studioClipboard';
import {
  computeMultiTransform,
  TransformSnapshot
} from '../src/engine/studio/multiTransform';
import {
  StudioCameraRig,
  VIEW_PRESETS,
  ViewPreset
} from '../src/engine/studio/studioCameraRig';
import {
  DEFAULT_SNAP_CONFIG,
  GizmoSnapConfig
} from '../src/engine/studio/transformGizmo';
import type { StudioObject } from '../src/engine/studio/types';

function makeObject(id: string, type: string, parentId: string | null = null): StudioObject {
  return {
    id,
    type: type as StudioObject['type'],
    name: id,
    parentId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#ffffff',
    canCollide: true,
    anchored: false
  };
}

describe('M16 Clipboard', () => {
  it('collectClipboard includes descendants of selected parents', () => {
    const objects: StudioObject[] = [
      makeObject('a', 'block'),
      makeObject('b', 'block', 'a'),
      makeObject('c', 'block', 'b'),
      makeObject('d', 'block')
    ];
    const result = collectClipboard(objects, ['a']);
    expect(result.map((o) => o.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('collectClipboard does not include unselected roots', () => {
    const objects: StudioObject[] = [
      makeObject('a', 'block'),
      makeObject('b', 'block')
    ];
    const result = collectClipboard(objects, ['a']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('remapClipboard issues fresh ids and preserves parent links', () => {
    const objects: StudioObject[] = [
      makeObject('parent', 'block'),
      makeObject('child', 'block', 'parent')
    ];
    let counter = 0;
    const makeId = () => `new_${++counter}`;
    const remapped = remapClipboard(objects, makeId);
    expect(remapped).toHaveLength(2);
    expect(remapped[0].id).toBe('new_1');
    expect(remapped[1].id).toBe('new_2');
    expect(remapped[1].parentId).toBe('new_1');
  });

  it('remapClipboard rewrites constraint attachments', () => {
    const objects: StudioObject[] = [
      { ...makeObject('partA', 'block'), constraint: { kind: 'weld', attachment0: 'partA', attachment1: 'partB', stiffness: 0.5, damping: 0.1, restLength: 4, axis: { x: 0, y: 1, z: 0 } } },
      makeObject('partB', 'block')
    ];
    const makeId = (type: string) => `${type}_copy`;
    const remapped = remapClipboard(objects, makeId);
    const constraint = remapped[0].constraint!;
    expect(constraint.attachment0).toBe('block_copy');
    expect(constraint.attachment1).toBe('block_copy');
  });

  it('offsetClipboard shifts position by offset times', () => {
    const objects: StudioObject[] = [
      makeObject('a', 'block')
    ];
    const offset1 = offsetClipboard(objects, 1);
    expect(offset1[0].position.x).toBe(CLIPBOARD_OFFSET.x);
    expect(offset1[0].position.z).toBe(CLIPBOARD_OFFSET.z);
    expect(offset1[0].name).toContain('Paste');

    const offset3 = offsetClipboard(objects, 3);
    expect(offset3[0].position.x).toBe(CLIPBOARD_OFFSET.x * 3);
    expect(offset3[0].name).toContain('3');
  });

  it('offsetClipboard with times=0 returns clones without offset', () => {
    const objects: StudioObject[] = [makeObject('a', 'block')];
    const result = offsetClipboard(objects, 0);
    expect(result[0].position.x).toBe(0);
    expect(result[0].name).toBe('a');
  });

  it('hasDanglingReferences detects orphaned parentId', () => {
    const pasted: StudioObject[] = [
      makeObject('new', 'block', 'missing_parent')
    ];
    const existing: StudioObject[] = [makeObject('other', 'block')];
    expect(hasDanglingReferences(pasted, existing)).toBe(true);
  });

  it('hasDanglingReferences returns false when all parents exist', () => {
    const pasted: StudioObject[] = [
      makeObject('child', 'block', 'parent')
    ];
    const existing: StudioObject[] = [
      makeObject('parent', 'block'),
      makeObject('child', 'block', 'parent')
    ];
    expect(hasDanglingReferences(pasted, existing)).toBe(false);
  });
});

describe('M16 Multi-Select Transform', () => {
  function makeSnapshot(): TransformSnapshot {
    const map: TransformSnapshot = new Map();
    map.set('a', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
    map.set('b', {
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 2 }
    });
    return map;
  }

  it('translate applies the same delta to all selected objects', () => {
    const snapshot = makeSnapshot();
    const next = {
      position: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const updates = computeMultiTransform(snapshot, 'a', next, 'translate');
    expect(updates).toHaveLength(2);
    const b = updates.find((u) => u.id === 'b')!;
    expect(b.transform.position.x).toBe(8); // 5 + (3-0) = 8
  });

  it('rotate applies the same rotation delta to all selected', () => {
    const snapshot = makeSnapshot();
    const next = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 1.5, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const updates = computeMultiTransform(snapshot, 'a', next, 'rotate');
    const b = updates.find((u) => u.id === 'b')!;
    expect(b.transform.rotation.y).toBe(1.5);
  });

  it('scale applies proportional ratio based on primary base scale', () => {
    const snapshot = makeSnapshot();
    const next = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 2, z: 2 }
    };
    const updates = computeMultiTransform(snapshot, 'a', next, 'scale');
    const b = updates.find((u) => u.id === 'b')!;
    // ratio = 2/1 = 2; b scale = 2 * 2 = 4
    expect(b.transform.scale.x).toBe(4);
    expect(b.transform.scale.y).toBe(4);
  });

  it('returns just the primary if snapshot has only one entry', () => {
    const snapshot: TransformSnapshot = new Map();
    snapshot.set('a', {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    });
    const next = {
      position: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    const updates = computeMultiTransform(snapshot, 'a', next, 'translate');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('a');
  });
});

describe('M16 Camera Rig', () => {
  function makeCamera(): THREE.PerspectiveCamera {
    return new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  }

  it('constructor sets default state', () => {
    const rig = new StudioCameraRig(makeCamera());
    const state = rig.getState();
    expect(state.radius).toBe(22);
    expect(state.target.y).toBe(2);
  });

  it('orbit changes phi/theta and clamps phi to prevent gimbal flip', () => {
    const rig = new StudioCameraRig(makeCamera());
    const before = rig.getState();
    rig.orbit(100, 50);
    const after = rig.getState();
    expect(after.theta).not.toBe(before.theta);
    expect(after.phi).not.toBe(before.phi);
    rig.orbit(0, 10000);
    expect(rig.getState().phi).toBeLessThanOrEqual(Math.PI / 2 - 0.05);
    rig.orbit(0, -10000);
    expect(rig.getState().phi).toBeGreaterThanOrEqual(0.1);
  });

  it('zoom clamps radius', () => {
    const rig = new StudioCameraRig(makeCamera());
    rig.zoom(10000);
    expect(rig.getState().radius).toBe(200);
    rig.zoom(-10000);
    expect(rig.getState().radius).toBe(2);
  });

  it('setView presets set distinct phi/theta', () => {
    const rig = new StudioCameraRig(makeCamera());
    const states: number[] = [];
    for (const preset of VIEW_PRESETS) {
      rig.setView(preset as ViewPreset);
      states.push(rig.getState().phi);
    }
    // At least top and front should differ
    expect(new Set(states).size).toBeGreaterThan(1);
  });

  it('focus moves target and adjusts radius', () => {
    const rig = new StudioCameraRig(makeCamera());
    rig.focus({ x: 10, y: 5, z: -3 }, 50);
    const state = rig.getState();
    expect(state.target.x).toBe(10);
    expect(state.target.y).toBe(5);
    expect(state.target.z).toBe(-3);
    expect(state.radius).toBe(50);
  });

  it('fly keys move the target; non-fly keys are ignored', () => {
    const rig = new StudioCameraRig(makeCamera());
    rig.setKey('x', true);
    rig.advance(0.1);
    expect(rig.getState().target.x).toBe(0);
    const before = rig.getState();
    rig.setKey('w', true);
    rig.advance(0.1);
    expect(rig.getState().target.z).not.toBe(before.target.z);
  });

  it('VIEW_PRESETS contains iso, top, front, right', () => {
    expect(VIEW_PRESETS).toContain('iso');
    expect(VIEW_PRESETS).toContain('top');
    expect(VIEW_PRESETS).toContain('front');
    expect(VIEW_PRESETS).toContain('right');
  });
});

describe('M16 Snap Config', () => {
  it('DEFAULT_SNAP_CONFIG has sensible defaults', () => {
    expect(DEFAULT_SNAP_CONFIG.translation).toBe(1);
    expect(DEFAULT_SNAP_CONFIG.rotationDegrees).toBe(15);
    expect(DEFAULT_SNAP_CONFIG.scale).toBe(0.25);
  });

  it('snap config can be overridden', () => {
    const custom: GizmoSnapConfig = {
      translation: 0.5,
      rotationDegrees: 45,
      scale: 0.1
    };
    expect(custom.translation).toBe(0.5);
    expect(custom.rotationDegrees).toBe(45);
    expect(custom.scale).toBe(0.1);
  });
});
