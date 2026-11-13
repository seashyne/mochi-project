// Animation state graph wiring: manifest parsing plus the attachWorld hooks that
// let scripts drive parameters and read the current state.

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { attachWorld } from '../src/engine/scene/attachWorld';
import { readAnimationStateMachine } from '../src/engine/animation/stateMachineManifest';
import type { AnimStateMachineDef } from '../src/engine/animation/stateMachine';
import type { MochiAnimationClip } from '../src/engine/animation/clip';

const moveClip = (id: string, target: string): MochiAnimationClip => ({
  id,
  name: id,
  duration: 2,
  loop: true,
  tracks: [{
    target,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 } },
      { time: 2, position: { x: 10, y: 0, z: 0 } }
    ]
  }]
});

const graph: AnimStateMachineDef = {
  initial: 'idle',
  parameters: [
    { name: 'walking', type: 'bool' },
    { name: 'jump', type: 'trigger' }
  ],
  states: [
    { id: 'idle', clipId: 'clip-idle' },
    { id: 'walk', clipId: 'clip-walk' },
    { id: 'jump', clipId: 'clip-jump' }
  ],
  transitions: [
    { from: 'idle', to: 'walk', duration: 0.2, conditions: [{ parameter: 'walking', value: true }] },
    { from: 'walk', to: 'idle', duration: 0.2, conditions: [{ parameter: 'walking', value: false }] },
    { from: '*', to: 'jump', duration: 0.1, conditions: [{ parameter: 'jump' }] },
    { from: 'jump', to: 'idle', duration: 0.1, exitTime: 0.9 }
  ]
};

function manifestWith(extra: Record<string, unknown>): string {
  return JSON.stringify({
    version: '1.0.0',
    title: 'Wired',
    createdAt: new Date('2026-01-01').toISOString(),
    objects: [{
      id: 'box',
      name: 'Box',
      type: 'block',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#ff0000'
    }],
    animations: [moveClip('clip-idle', 'box'), moveClip('clip-walk', 'box'), moveClip('clip-jump', 'box')],
    ...extra
  });
}

describe('readAnimationStateMachine', () => {
  it('treats a missing field as no state machine', () => {
    expect(readAnimationStateMachine(undefined)).toEqual({ definition: null, errors: [] });
    expect(readAnimationStateMachine(null)).toEqual({ definition: null, errors: [] });
  });

  it('rejects a non-object value', () => {
    expect(readAnimationStateMachine('nope').errors).toContain('animationStateMachine must be an object');
  });

  it('rejects a graph with no states', () => {
    expect(readAnimationStateMachine({ transitions: [] }).errors).toContain('animationStateMachine has no states');
  });

  it('reports validation problems from a broken graph', () => {
    const { definition, errors } = readAnimationStateMachine({
      states: [{ id: 'a', clipId: 'x' }],
      transitions: [{ from: 'a', to: 'ghost' }]
    });
    expect(definition).toBeNull();
    expect(errors.some((error) => error.includes('unknown state "ghost"'))).toBe(true);
  });

  it('returns a valid graph unchanged', () => {
    const { definition, errors } = readAnimationStateMachine(graph);
    expect(errors).toEqual([]);
    expect(definition?.initial).toBe('idle');
  });
});

describe('attachWorld animation state machine', () => {
  it('exposes the initial state and transitions on parameters', () => {
    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, manifestWith({ animationStateMachine: graph }), new PhysicsWorld());

    expect(attachment.getAnimationState!()).toBe('idle');
    attachment.setAnimationParameter!('walking', true);
    attachment.tick!(0.1);
    expect(attachment.getAnimationState!()).toBe('walk');

    attachment.setAnimationParameter!('walking', false);
    attachment.tick!(0.1);
    expect(attachment.getAnimationState!()).toBe('idle');

    attachment.dispose();
  });

  it('fires trigger parameters', () => {
    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, manifestWith({ animationStateMachine: graph }), new PhysicsWorld());

    attachment.triggerAnimation!('jump');
    attachment.tick!(0.1);
    expect(attachment.getAnimationState!()).toBe('jump');

    attachment.dispose();
  });

  it('leaves the default path alone when the graph is invalid', () => {
    const scene = new THREE.Scene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { states: [{ id: 'a', clipId: 'x' }], transitions: [{ from: 'a', to: 'ghost' }] };
    const attachment = attachWorld(scene, manifestWith({ animationStateMachine: broken }), new PhysicsWorld());

    expect(attachment.getAnimationState!()).toBeNull();
    expect(warn).toHaveBeenCalled();
    // The world still loads; clip playback itself is covered by
    // animation_runtime.test.ts (blocks render as instanced batches, so there
    // is no per-object mesh here to assert a transform on).
    expect(attachment.getObjects().length).toBeGreaterThan(0);

    attachment.dispose();
    warn.mockRestore();
  });

  it('reports null when the world has no state graph', () => {
    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, manifestWith({}), new PhysicsWorld());
    expect(attachment.getAnimationState!()).toBeNull();
    expect(() => attachment.setAnimationParameter!('walking', true)).not.toThrow();
    expect(() => attachment.triggerAnimation!('jump')).not.toThrow();
    attachment.dispose();
  });
});
