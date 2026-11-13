// Server-side validation of creator animation data: clips and the optional
// parameter-driven state graph, plus the cross-reference between them.

import { describe, it, expect } from 'vitest';
import {
  MAX_ANIMATION_STATES,
  MAX_ANIMATION_TRANSITIONS,
  validateAnimationClips,
  validateAnimationReferences,
  validateAnimationStateMachine
} from '../src/services/animationValidation';
import { inspectManifest, validateManifestV2 } from '../src/services/manifestValidation';

const clip = (id: string) => ({
  id,
  name: id,
  duration: 1,
  loop: true,
  tracks: [{
    target: 'box',
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 } },
      { time: 1, position: { x: 1, y: 0, z: 0 } }
    ]
  }]
});

interface DraftMachine {
  initial: string;
  parameters: Array<Record<string, unknown>>;
  states: Array<Record<string, unknown>>;
  transitions: Array<Record<string, unknown>>;
}

const machine = (): DraftMachine => ({
  initial: 'idle',
  parameters: [
    { name: 'walking', type: 'bool' },
    { name: 'speed', type: 'number', default: 0 },
    { name: 'jump', type: 'trigger' }
  ],
  states: [
    { id: 'idle', clipId: 'idle' },
    { id: 'walk', clipId: 'walk' },
    { id: 'jump', clipId: 'jump', loop: false }
  ],
  transitions: [
    { from: 'idle', to: 'walk', duration: 0.2, conditions: [{ parameter: 'walking', value: true }] },
    { from: '*', to: 'jump', duration: 0.1, conditions: [{ parameter: 'jump' }] },
    { from: 'jump', to: 'idle', duration: 0.1, exitTime: 0.9 }
  ]
});

describe('validateAnimationClips', () => {
  it('accepts a well-formed clip list', () => {
    expect(validateAnimationClips([clip('idle'), clip('walk')])).toEqual([]);
  });

  it('treats a missing list as absent, not broken', () => {
    expect(validateAnimationClips(undefined)).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(validateAnimationClips({})).toEqual(['animations must be an array']);
  });

  it('rejects duplicate clip ids', () => {
    expect(validateAnimationClips([clip('a'), clip('a')])).toContain('animations[1].id is duplicated');
  });

  it('rejects an out-of-range duration', () => {
    const bad = { ...clip('a'), duration: 0 };
    expect(validateAnimationClips([bad]).some((error) => error.includes('duration'))).toBe(true);
  });

  it('allows an empty track list (a static clip)', () => {
    expect(validateAnimationClips([{ ...clip('a'), tracks: [] }])).toEqual([]);
  });

  it('rejects a duplicated track target', () => {
    const track = clip('a').tracks[0];
    const bad = { ...clip('a'), tracks: [track, track] };
    expect(validateAnimationClips([bad])).toContain('animations[0].tracks[1].target is duplicated');
  });

  it('rejects keyframe times that do not increase', () => {
    const bad = {
      ...clip('a'),
      tracks: [{
        target: 'box',
        keyframes: [
          { time: 0.5, position: { x: 0, y: 0, z: 0 } },
          { time: 0.5, position: { x: 1, y: 0, z: 0 } }
        ]
      }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('strictly increasing'))).toBe(true);
  });

  it('rejects a keyframe past the clip duration', () => {
    const bad = {
      ...clip('a'),
      tracks: [{ target: 'box', keyframes: [{ time: 5, position: { x: 0, y: 0, z: 0 } }] }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('within [0, duration]'))).toBe(true);
  });

  it('accepts bezier easing with control points', () => {
    const eased = {
      ...clip('a'),
      tracks: [{
        target: 'box',
        keyframes: [
          { time: 0, position: { x: 0, y: 0, z: 0 }, easing: 'bezier', ease: [0.42, 0, 0.58, 1] },
          { time: 1, position: { x: 1, y: 0, z: 0 } }
        ]
      }]
    };
    expect(validateAnimationClips([eased])).toEqual([]);
  });

  it('rejects bezier control points with an out-of-range x', () => {
    const bad = {
      ...clip('a'),
      tracks: [{
        target: 'box',
        keyframes: [
          { time: 0, position: { x: 0, y: 0, z: 0 }, easing: 'bezier', ease: [1.4, 0, 0.5, 1] },
          { time: 1, position: { x: 1, y: 0, z: 0 } }
        ]
      }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('.ease'))).toBe(true);
  });

  it('rejects an unsupported easing', () => {
    const bad = {
      ...clip('a'),
      tracks: [{ target: 'box', keyframes: [{ time: 0, position: { x: 0, y: 0, z: 0 }, easing: 'bounce' }] }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('easing'))).toBe(true);
  });

  it('rejects keyframes that set no channel', () => {
    const bad = {
      ...clip('a'),
      tracks: [{ target: 'box', keyframes: [{ time: 0 }] }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('must key at least one channel'))).toBe(true);
  });

  it('rejects a negative keyframe time', () => {
    const bad = {
      ...clip('a'),
      tracks: [{ target: 'box', keyframes: [{ time: -1, position: { x: 0, y: 0, z: 0 } }] }]
    };
    expect(validateAnimationClips([bad]).some((error) => error.includes('time'))).toBe(true);
  });
});

describe('validateAnimationStateMachine', () => {
  it('accepts a well-formed graph', () => {
    expect(validateAnimationStateMachine(machine())).toEqual([]);
  });

  it('treats a missing graph as absent', () => {
    expect(validateAnimationStateMachine(undefined)).toEqual([]);
  });

  it('requires at least one state', () => {
    expect(validateAnimationStateMachine({ states: [], transitions: [] }))
      .toContain('animationStateMachine.states must not be empty');
  });

  it('rejects duplicate state ids', () => {
    const bad = machine();
    bad.states.push({ id: 'idle', clipId: 'idle' });
    expect(validateAnimationStateMachine(bad)).toContain('animationStateMachine.states[3].id is duplicated');
  });

  it('rejects a transition to an undeclared state', () => {
    const bad = machine();
    bad.transitions[0].to = 'ghost';
    expect(validateAnimationStateMachine(bad).some((error) => error.includes('to must reference'))).toBe(true);
  });

  it('rejects a condition on an undeclared parameter', () => {
    const bad = machine();
    bad.transitions[0].conditions = [{ parameter: 'nope', value: true }];
    expect(validateAnimationStateMachine(bad).some((error) => error.includes('parameter must reference'))).toBe(true);
  });

  it('rejects an out-of-range exitTime', () => {
    const bad = machine();
    bad.transitions[2].exitTime = 1.5;
    expect(validateAnimationStateMachine(bad).some((error) => error.includes('exitTime'))).toBe(true);
  });

  it('rejects an initial state that does not exist', () => {
    const bad = machine();
    bad.initial = 'ghost';
    expect(validateAnimationStateMachine(bad)).toContain('animationStateMachine.initial must reference a declared state');
  });

  it('rejects an unsupported parameter type', () => {
    const bad = machine();
    bad.parameters[0].type = 'string';
    expect(validateAnimationStateMachine(bad).some((error) => error.includes('type must be'))).toBe(true);
  });

  it('rejects a default that does not match the parameter type', () => {
    const bad = machine();
    bad.parameters[1].default = true;
    expect(validateAnimationStateMachine(bad).some((error) => error.includes('default must be a number'))).toBe(true);
  });

  it('caps the number of states and transitions', () => {
    const manyStates = {
      states: Array.from({ length: MAX_ANIMATION_STATES + 1 }, (_, i) => ({ id: `s${i}`, clipId: 'c' })),
      transitions: []
    };
    expect(validateAnimationStateMachine(manyStates)[0]).toContain(`exceeds ${MAX_ANIMATION_STATES}`);

    const manyTransitions = machine();
    manyTransitions.transitions = Array.from({ length: MAX_ANIMATION_TRANSITIONS + 1 }, () => ({ from: '*', to: 'idle' }));
    expect(validateAnimationStateMachine(manyTransitions).some((error) => error.includes('exceeds'))).toBe(true);
  });
});

describe('validateAnimationReferences', () => {
  it('rejects a state pointing at a clip the manifest never declares', () => {
    const errors = validateAnimationReferences({
      animations: [clip('idle'), clip('walk')],
      animationStateMachine: machine()
    });
    expect(errors).toContain('animationStateMachine.states[2].clipId "jump" is not a declared clip');
  });

  it('passes when every state clip is declared', () => {
    const errors = validateAnimationReferences({
      animations: [clip('idle'), clip('walk'), clip('jump')],
      animationStateMachine: machine()
    });
    expect(errors).toEqual([]);
  });

  it('skips the check when either half is missing', () => {
    expect(validateAnimationReferences({ animationStateMachine: machine() })).toEqual([]);
    expect(validateAnimationReferences({ animations: [clip('idle')] })).toEqual([]);
  });
});

describe('manifest integration', () => {
  it('inspectManifest rejects a v1 manifest with a broken graph', () => {
    const bad = machine();
    bad.transitions[0].to = 'ghost';
    const result = inspectManifest(JSON.stringify({
      manifestVersion: '1.0',
      animations: [clip('idle'), clip('walk'), clip('jump')],
      animationStateMachine: bad
    }));

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('to must reference'))).toBe(true);
  });

  it('inspectManifest accepts a v1 manifest with a valid graph', () => {
    const result = inspectManifest(JSON.stringify({
      manifestVersion: '1.0',
      animations: [clip('idle'), clip('walk'), clip('jump')],
      animationStateMachine: machine()
    }));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('validateManifestV2 reports animation problems alongside chunk problems', () => {
    const errors = validateManifestV2({
      title: 'World',
      version: '1.0.0',
      chunking: { strategy: 'grid', cellSize: 32, objectLimitPerChunk: 100 },
      chunks: [],
      animations: [clip('idle')],
      animationStateMachine: { states: [{ id: 'a', clipId: 'missing' }], transitions: [] }
    });
    expect(errors.some((error) => error.includes('chunkIndex'))).toBe(true);
    expect(errors.some((error) => error.includes('"missing" is not a declared clip'))).toBe(true);
  });
});
