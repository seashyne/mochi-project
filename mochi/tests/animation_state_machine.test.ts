// Animation state graph: validation, transition selection, trigger consumption,
// exit-time crossing, and the mixer runtime that performs the crossfade.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  AnimStateMachine,
  validateStateMachine,
  ANY_STATE,
  type AnimStateMachineDef
} from '../src/engine/animation/stateMachine';
import { AnimationStateMachineRuntime } from '../src/engine/animation/stateMachineRuntime';
import type { MochiAnimationClip } from '../src/engine/animation/clip';

const locomotion: AnimStateMachineDef = {
  initial: 'idle',
  parameters: [
    { name: 'walking', type: 'bool' },
    { name: 'speed', type: 'number', default: 0 },
    { name: 'jump', type: 'trigger' }
  ],
  states: [
    { id: 'idle', clipId: 'clip_idle' },
    { id: 'walk', clipId: 'clip_walk', speed: 1.5 },
    { id: 'jump', clipId: 'clip_jump', loop: false }
  ],
  transitions: [
    { from: 'idle', to: 'walk', duration: 0.2, conditions: [{ parameter: 'walking', value: true }] },
    { from: 'walk', to: 'idle', duration: 0.2, conditions: [{ parameter: 'walking', value: false }] },
    { from: ANY_STATE, to: 'jump', duration: 0.1, conditions: [{ parameter: 'jump' }] },
    { from: 'jump', to: 'idle', duration: 0.15, exitTime: 0.9 }
  ]
};

describe('validateStateMachine', () => {
  it('accepts a well-formed graph', () => {
    expect(validateStateMachine(locomotion)).toEqual([]);
  });

  it('requires at least one state', () => {
    expect(validateStateMachine({ states: [], transitions: [] })).toContain('state machine needs at least one state');
  });

  it('rejects duplicate state ids', () => {
    const errors = validateStateMachine({
      states: [{ id: 'a', clipId: 'x' }, { id: 'a', clipId: 'y' }],
      transitions: []
    });
    expect(errors).toContain('duplicate state id "a"');
  });

  it('rejects states without a clip', () => {
    const errors = validateStateMachine({ states: [{ id: 'a', clipId: '' }], transitions: [] });
    expect(errors).toContain('state "a" has no clip');
  });

  it('rejects transitions to unknown states', () => {
    const errors = validateStateMachine({
      states: [{ id: 'a', clipId: 'x' }],
      transitions: [{ from: 'a', to: 'ghost' }]
    });
    expect(errors).toContain('transition to unknown state "ghost"');
  });

  it('rejects unknown parameter references', () => {
    const errors = validateStateMachine({
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }],
      transitions: [{ from: 'a', to: 'b', conditions: [{ parameter: 'nope' }] }]
    });
    expect(errors.some((error) => error.includes('unknown parameter "nope"'))).toBe(true);
  });

  it('rejects an out-of-range exitTime and offset', () => {
    const errors = validateStateMachine({
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }],
      transitions: [{ from: 'a', to: 'b', exitTime: 1.4, transitionOffset: -0.2 }]
    });
    expect(errors.some((error) => error.includes('exitTime outside 0..1'))).toBe(true);
    expect(errors.some((error) => error.includes('offset outside 0..1'))).toBe(true);
  });

  it('rejects a missing initial state', () => {
    const errors = validateStateMachine({
      initial: 'ghost',
      states: [{ id: 'a', clipId: 'x' }],
      transitions: []
    });
    expect(errors).toContain('initial state "ghost" does not exist');
  });

  it('throws from the constructor when the graph is invalid', () => {
    expect(() => new AnimStateMachine({ states: [], transitions: [] })).toThrow(/invalid state machine/);
  });
});

describe('AnimStateMachine', () => {
  it('starts at the declared initial state, or the first one', () => {
    expect(new AnimStateMachine(locomotion).currentState).toBe('idle');
    const implicit = new AnimStateMachine({
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }],
      transitions: []
    });
    expect(implicit.currentState).toBe('a');
  });

  it('fires a transition when its conditions pass', () => {
    const machine = new AnimStateMachine(locomotion);
    expect(machine.update(0.016, 0)).toBeNull();
    machine.setBool('walking', true);
    const event = machine.update(0.016, 0);
    expect(event).toMatchObject({ from: 'idle', to: 'walk', duration: 0.2, offset: 0 });
    expect(machine.currentState).toBe('walk');
  });

  it('keeps the state when conditions fail', () => {
    const machine = new AnimStateMachine(locomotion);
    machine.setBool('walking', false);
    expect(machine.update(0.016, 0.5)).toBeNull();
    expect(machine.currentState).toBe('idle');
  });

  it('honours priority before declaration order', () => {
    const machine = new AnimStateMachine({
      initial: 'a',
      parameters: [{ name: 'go', type: 'bool', default: true }],
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }, { id: 'c', clipId: 'z' }],
      transitions: [
        { from: 'a', to: 'b', conditions: [{ parameter: 'go', value: true }], priority: 5 },
        { from: 'a', to: 'c', conditions: [{ parameter: 'go', value: true }], priority: 1 }
      ]
    });
    machine.update(0.016, 0);
    expect(machine.currentState).toBe('c');
  });

  it('applies ANY_STATE transitions from any current state', () => {
    const machine = new AnimStateMachine(locomotion);
    machine.setBool('walking', true);
    machine.update(0.016, 0);
    expect(machine.currentState).toBe('walk');
    machine.setTrigger('jump');
    machine.update(0.016, 0);
    expect(machine.currentState).toBe('jump');
  });

  it('consumes a trigger after it fires', () => {
    const machine = new AnimStateMachine(locomotion);
    machine.setTrigger('jump');
    expect(machine.update(0.016, 0)?.to).toBe('jump');
    expect(machine.getParameter('jump')?.value).toBe(false);
    machine.setTrigger('jump');
    machine.update(0.016, 0);
    expect(machine.currentState).toBe('jump');
  });

  it('ignores parameter writes of the wrong type', () => {
    const machine = new AnimStateMachine(locomotion);
    machine.setBool('speed', true);
    expect(machine.getParameter('speed')?.value).toBe(0);
    machine.setNumber('unknown', 5);
    expect(machine.getParameter('unknown')).toBeUndefined();
  });

  it('waits for the exit time before leaving a state', () => {
    const machine = new AnimStateMachine(locomotion);
    machine.setTrigger('jump');
    machine.update(0.016, 0);
    expect(machine.currentState).toBe('jump');

    expect(machine.update(0.016, 0.5)).toBeNull();
    expect(machine.currentState).toBe('jump');

    expect(machine.update(0.016, 0.92)?.to).toBe('idle');
    expect(machine.currentState).toBe('idle');
  });

  it('treats a looping wrap as crossing the exit time', () => {
    const machine = new AnimStateMachine({
      initial: 'a',
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }],
      transitions: [{ from: 'a', to: 'b', exitTime: 0.9 }]
    });
    machine.update(0.016, 0.95);
    expect(machine.currentState).toBe('b');
  });

  it('never transitions to the state it is already in', () => {
    const machine = new AnimStateMachine({
      initial: 'a',
      parameters: [{ name: 'always', type: 'bool', default: true }],
      states: [{ id: 'a', clipId: 'x' }],
      transitions: [{ from: ANY_STATE, to: 'a', conditions: [{ parameter: 'always', value: true }] }]
    });
    expect(machine.update(0.016, 0)).toBeNull();
  });

  it('defaults duration and offset to zero', () => {
    const machine = new AnimStateMachine({
      initial: 'a',
      states: [{ id: 'a', clipId: 'x' }, { id: 'b', clipId: 'y' }],
      transitions: [{ from: 'a', to: 'b' }]
    });
    expect(machine.update(0.016, 0)).toEqual({ from: 'a', to: 'b', duration: 0, offset: 0 });
  });
});

function makeClip(id: string, target: string): MochiAnimationClip {
  return {
    id,
    name: id,
    duration: 1,
    loop: true,
    tracks: [
      {
        target,
        keyframes: [
          { time: 0, position: { x: 0, y: 0, z: 0 } },
          { time: 1, position: { x: 1, y: 0, z: 0 } }
        ]
      }
    ]
  };
}

function buildRuntime(definition: AnimStateMachineDef) {
  const root = new THREE.Group();
  const box = new THREE.Object3D();
  box.name = 'box';
  root.add(box);
  const clips = [makeClip('clip_idle', 'box'), makeClip('clip_walk', 'box'), makeClip('clip_jump', 'box')];
  const runtime = new AnimationStateMachineRuntime(root, definition, clips, (target) => (target === 'box' ? box : null));
  return { root, box, runtime };
}

describe('AnimationStateMachineRuntime', () => {
  it('starts on the initial state clip', () => {
    const { runtime } = buildRuntime(locomotion);
    expect(runtime.state).toBe('idle');
    expect(runtime.clipId).toBe('clip_idle');
  });

  it('switches clip when a transition fires', () => {
    const { runtime } = buildRuntime(locomotion);
    runtime.setBool('walking', true);
    runtime.update(0.016);
    expect(runtime.state).toBe('walk');
    expect(runtime.clipId).toBe('clip_walk');
  });

  it('stays put while conditions are unmet', () => {
    const { runtime } = buildRuntime(locomotion);
    for (let i = 0; i < 5; i += 1) runtime.update(0.016);
    expect(runtime.state).toBe('idle');
  });

  it('does nothing after dispose', () => {
    const { runtime } = buildRuntime(locomotion);
    runtime.dispose();
    runtime.setBool('walking', true);
    expect(() => runtime.update(0.016)).not.toThrow();
  });

  it('reports a missing clip without crashing', () => {
    const root = new THREE.Group();
    const box = new THREE.Object3D();
    root.add(box);
    const definition: AnimStateMachineDef = {
      initial: 'a',
      states: [{ id: 'a', clipId: 'nope' }],
      transitions: []
    };
    const runtime = new AnimationStateMachineRuntime(root, definition, [], () => box);
    expect(runtime.clipId).toBeNull();
    expect(runtime.state).toBe('a');
  });
});
