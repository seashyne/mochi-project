// Pure edits for the animation state graph shown in the Studio panel.
//
// Every function returns a new definition and never mutates its input, so the
// panel can hand the result straight to the document without cloning. Referential
// cleanup lives here too: removing a state drops its transitions, removing a
// parameter drops conditions that read it. A graph that still points at deleted
// ids would be rejected by the server validator.

import {
  ANY_STATE,
  validateStateMachine,
  type AnimCondition,
  type AnimParameterDef,
  type AnimParameterType,
  type AnimStateDef,
  type AnimStateMachineDef,
  type AnimTransitionDef
} from '../../engine/animation/stateMachine';
import type { MochiAnimationClip } from '../../engine/animation/clip';

export function createState(id: string, clipId: string): AnimStateDef {
  return { id, clipId };
}

export function createTransition(from: string, to: string): AnimTransitionDef {
  return { from, to, duration: 0.2, conditions: [] };
}

export function createParameter(name: string, type: AnimParameterType): AnimParameterDef {
  return { name, type, default: type === 'number' ? 0 : type === 'bool' ? false : undefined };
}

export function emptyGraph(clips: MochiAnimationClip[]): AnimStateMachineDef {
  const firstClip = clips[0]?.id ?? '';
  return {
    initial: 'idle',
    parameters: [],
    states: [{ id: 'idle', clipId: firstClip }],
    transitions: []
  };
}

// Unique id that reads naturally in the panel ("state", "state2", ...).
export function nextId(prefix: string, taken: string[]): string {
  if (!taken.includes(prefix)) return prefix;
  let index = 2;
  while (taken.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export function addState(graph: AnimStateMachineDef, state: AnimStateDef): AnimStateMachineDef {
  return { ...graph, states: [...graph.states, state] };
}

export function updateState(
  graph: AnimStateMachineDef,
  stateId: string,
  patch: Partial<AnimStateDef>
): AnimStateMachineDef {
  const states = graph.states.map((state) => (state.id === stateId ? { ...state, ...patch } : state));
  // Renaming a state has to follow the transitions and the initial pointer.
  if (patch.id && patch.id !== stateId) {
    const transitions = graph.transitions.map((transition) => ({
      ...transition,
      from: transition.from === stateId ? patch.id! : transition.from,
      to: transition.to === stateId ? patch.id! : transition.to
    }));
    return { ...graph, states, transitions, initial: graph.initial === stateId ? patch.id : graph.initial };
  }
  return { ...graph, states };
}

export function removeState(graph: AnimStateMachineDef, stateId: string): AnimStateMachineDef {
  const states = graph.states.filter((state) => state.id !== stateId);
  const transitions = graph.transitions.filter(
    (transition) => transition.from !== stateId && transition.to !== stateId
  );
  const initial = graph.initial === stateId ? states[0]?.id : graph.initial;
  return { ...graph, states, transitions, initial };
}

export function addTransition(graph: AnimStateMachineDef, transition: AnimTransitionDef): AnimStateMachineDef {
  return { ...graph, transitions: [...graph.transitions, transition] };
}

export function updateTransition(
  graph: AnimStateMachineDef,
  index: number,
  patch: Partial<AnimTransitionDef>
): AnimStateMachineDef {
  const transitions = graph.transitions.map((transition, position) =>
    position === index ? { ...transition, ...patch } : transition
  );
  return { ...graph, transitions };
}

export function removeTransition(graph: AnimStateMachineDef, index: number): AnimStateMachineDef {
  return { ...graph, transitions: graph.transitions.filter((_, position) => position !== index) };
}

export function addCondition(graph: AnimStateMachineDef, index: number, condition: AnimCondition): AnimStateMachineDef {
  const transition = graph.transitions[index];
  if (!transition) return graph;
  const conditions = [...(transition.conditions ?? []), condition];
  return updateTransition(graph, index, { conditions });
}

export function updateCondition(
  graph: AnimStateMachineDef,
  index: number,
  conditionIndex: number,
  patch: Partial<AnimCondition>
): AnimStateMachineDef {
  const transition = graph.transitions[index];
  if (!transition) return graph;
  const conditions = (transition.conditions ?? []).map((condition, position) =>
    position === conditionIndex ? { ...condition, ...patch } : condition
  );
  return updateTransition(graph, index, { conditions });
}

export function removeCondition(
  graph: AnimStateMachineDef,
  index: number,
  conditionIndex: number
): AnimStateMachineDef {
  const transition = graph.transitions[index];
  if (!transition) return graph;
  const conditions = (transition.conditions ?? []).filter((_, position) => position !== conditionIndex);
  return updateTransition(graph, index, { conditions });
}

export function addParameter(graph: AnimStateMachineDef, name: string, type: AnimParameterType): AnimStateMachineDef {
  const parameters = [...(graph.parameters ?? []), createParameter(name, type)];
  return { ...graph, parameters };
}

export function removeParameter(graph: AnimStateMachineDef, name: string): AnimStateMachineDef {
  const parameters = (graph.parameters ?? []).filter((parameter) => parameter.name !== name);
  const transitions = graph.transitions.map((transition) => ({
    ...transition,
    conditions: (transition.conditions ?? []).filter((condition) => condition.parameter !== name)
  }));
  return { ...graph, parameters, transitions };
}

// Everything the panel must surface before a save: structural problems from the
// engine validator plus state clips that no longer exist.
export function graphIssues(graph: AnimStateMachineDef, clips: MochiAnimationClip[]): string[] {
  const issues = validateStateMachine(graph);
  const clipIds = new Set(clips.map((clip) => clip.id));
  for (const state of graph.states) {
    if (state.clipId && !clipIds.has(state.clipId)) {
      issues.push(`state "${state.id}" points at a missing clip`);
    }
  }
  return issues;
}

export { ANY_STATE };
