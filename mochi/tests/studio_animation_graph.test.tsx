// Studio state-graph panel: pure edit helpers (referential cleanup) and the
// rendered surface a creator actually sees.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import type { MochiAnimationClip } from '../src/engine/animation/clip';
import type { AnimStateMachineDef } from '../src/engine/animation/stateMachine';
import {
  addCondition,
  addParameter,
  addState,
  addTransition,
  createParameter,
  emptyGraph,
  graphIssues,
  nextId,
  removeParameter,
  removeState,
  removeTransition,
  updateState,
  updateTransition
} from '../src/components/studio/animationGraphModel';
import { StudioAnimationGraphPanel } from '../src/components/studio/StudioAnimationGraphPanel';

const clip = (id: string): MochiAnimationClip => ({
  id,
  name: id,
  duration: 1,
  loop: true,
  tracks: [{ target: 'box', keyframes: [{ time: 0, position: { x: 0, y: 0, z: 0 } }] }]
});

const clips = [clip('idle'), clip('walk'), clip('jump')];

const graph = (): AnimStateMachineDef => ({
  initial: 'idle',
  parameters: [{ name: 'walking', type: 'bool', default: false }],
  states: [
    { id: 'idle', clipId: 'idle' },
    { id: 'walk', clipId: 'walk' }
  ],
  transitions: [{ from: 'idle', to: 'walk', duration: 0.2, conditions: [{ parameter: 'walking', value: true }] }]
});

const render = (element: React.ReactElement) => renderToString(<I18nProvider>{element}</I18nProvider>);

describe('animationGraphModel', () => {
  it('builds a one-state graph from the first clip', () => {
    const created = emptyGraph(clips);
    expect(created.states).toHaveLength(1);
    expect(created.states[0].clipId).toBe('idle');
    expect(created.transitions).toEqual([]);
  });

  it('produces a unique id', () => {
    expect(nextId('state', [])).toBe('state');
    expect(nextId('state', ['state'])).toBe('state2');
    expect(nextId('state', ['state', 'state2'])).toBe('state3');
  });

  it('adds and updates a state without mutating the input', () => {
    const base = graph();
    const added = addState(base, { id: 'jump', clipId: 'jump' });
    expect(base.states).toHaveLength(2);
    expect(added.states).toHaveLength(3);

    const updated = updateState(added, 'jump', { speed: 2 });
    expect(updated.states[2].speed).toBe(2);
  });

  it('follows a state rename into transitions and the initial pointer', () => {
    const renamed = updateState(graph(), 'idle', { id: 'standing' });
    expect(renamed.initial).toBe('standing');
    expect(renamed.transitions[0].from).toBe('standing');
    expect(renamed.transitions[0].to).toBe('walk');
  });

  it('drops transitions when a state is removed', () => {
    const removed = removeState(graph(), 'walk');
    expect(removed.states.map((state) => state.id)).toEqual(['idle']);
    expect(removed.transitions).toEqual([]);
  });

  it('moves the initial pointer when the initial state is removed', () => {
    const removed = removeState(graph(), 'idle');
    expect(removed.initial).toBe('walk');
  });

  it('adds and removes transitions by index', () => {
    const added = addTransition(graph(), { from: '*', to: 'idle', duration: 0 });
    expect(added.transitions).toHaveLength(2);
    const trimmed = removeTransition(added, 0);
    expect(trimmed.transitions).toHaveLength(1);
    expect(trimmed.transitions[0].from).toBe('*');
  });

  it('patches a transition', () => {
    const patched = updateTransition(graph(), 0, { duration: 0.5, exitTime: 0.8 });
    expect(patched.transitions[0].duration).toBe(0.5);
    expect(patched.transitions[0].exitTime).toBe(0.8);
  });

  it('drops conditions that read a removed parameter', () => {
    const withCondition = addCondition(graph(), 0, { parameter: 'walking', value: true });
    expect(withCondition.transitions[0].conditions).toHaveLength(2);

    const removed = removeParameter(withCondition, 'walking');
    expect(removed.parameters).toEqual([]);
    expect(removed.transitions[0].conditions).toEqual([]);
  });

  it('creates parameters with a type-appropriate default', () => {
    expect(createParameter('a', 'bool').default).toBe(false);
    expect(createParameter('b', 'number').default).toBe(0);
    expect(createParameter('c', 'trigger').default).toBeUndefined();

    const added = addParameter(graph(), 'speed', 'number');
    expect(added.parameters).toHaveLength(2);
  });

  it('reports a state that points at a missing clip', () => {
    const broken = { ...graph(), states: [{ id: 'idle', clipId: 'ghost' }] };
    expect(graphIssues(broken, clips).some((issue) => issue.includes('missing clip'))).toBe(true);
  });

  it('reports structural problems from the engine validator', () => {
    const broken = graph();
    broken.transitions[0].to = 'ghost';
    expect(graphIssues(broken, clips).some((issue) => issue.includes('unknown state'))).toBe(true);
  });

  it('passes a clean graph', () => {
    expect(graphIssues(graph(), clips)).toEqual([]);
  });
});

describe('StudioAnimationGraphPanel', () => {
  it('offers to create a graph when none exists', () => {
    const html = render(
      <StudioAnimationGraphPanel graph={null} clips={clips} onChange={() => undefined} />
    );
    expect(html).toContain('data-testid="animation-graph-empty"');
    expect(html).toContain('data-testid="animation-graph-create"');
  });

  it('disables creation until a clip exists', () => {
    const html = render(
      <StudioAnimationGraphPanel graph={null} clips={[]} onChange={() => undefined} />
    );
    expect(html).toContain('disabled');
  });

  it('renders states, parameters and transitions', () => {
    const html = render(
      <StudioAnimationGraphPanel graph={graph()} clips={clips} onChange={() => undefined} />
    );
    expect(html).toContain('data-testid="animation-graph-panel"');
    expect(html).toContain('data-testid="animation-graph-state-id-idle"');
    expect(html).toContain('data-testid="animation-graph-add-state"');
    expect(html).toContain('data-testid="animation-graph-add-parameter"');
    expect(html).toContain('data-testid="animation-graph-add-transition"');
    expect(html).toContain('data-testid="animation-graph-transitions"');
  });

  it('surfaces validation issues before a save', () => {
    const broken = graph();
    broken.states[0].clipId = 'ghost';
    const html = render(
      <StudioAnimationGraphPanel graph={broken} clips={clips} onChange={() => undefined} />
    );
    expect(html).toContain('data-testid="animation-graph-issues"');
  });

  it('hides the issues block for a clean graph', () => {
    const html = render(
      <StudioAnimationGraphPanel graph={graph()} clips={clips} onChange={() => undefined} />
    );
    expect(html).not.toContain('data-testid="animation-graph-issues"');
  });
});
