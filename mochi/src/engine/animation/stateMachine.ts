// Animation state graph: states, parameter-driven transitions, exit times.
//
// Mochi clips are keyframe tracks with no notion of state, so a creator has to
// script every switch by hand. This is the missing authoring layer: Idle ->
// Walk -> Jump driven by parameters, with a crossfade duration per transition.
//
// The semantics follow the glTF/PlayCanvas model (from/to, priority,
// conditions, normalized exitTime, transition offset). No upstream code was
// copied; this is a purpose-built subset. Interruption sources are deliberately
// not implemented: a transition always completes once started.

export type AnimParameterType = 'bool' | 'number' | 'trigger';

export interface AnimParameterDef {
  name: string;
  type: AnimParameterType;
  default?: boolean | number;
}

export type AnimConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export interface AnimCondition {
  parameter: string;
  // Omit the operator on a trigger parameter to mean "is set".
  op?: AnimConditionOp;
  value?: boolean | number;
}

export interface AnimStateDef {
  id: string;
  clipId: string;
  speed?: number;
  loop?: boolean;
}

export interface AnimTransitionDef {
  // '*' matches every state.
  from: string;
  to: string;
  // Crossfade duration in seconds. 0 snaps.
  duration?: number;
  priority?: number;
  conditions?: AnimCondition[];
  // Normalized progress (0..1) the source state must pass through.
  exitTime?: number;
  // Normalized start offset in the destination clip.
  transitionOffset?: number;
}

export interface AnimStateMachineDef {
  states: AnimStateDef[];
  transitions: AnimTransitionDef[];
  parameters?: AnimParameterDef[];
  initial?: string;
}

export interface AnimTransitionEvent {
  from: string;
  to: string;
  duration: number;
  offset: number;
}

export const ANY_STATE = '*';

// Validates a graph before it is saved. Returns human-readable problems, empty
// when the definition is usable.
export function validateStateMachine(def: AnimStateMachineDef): string[] {
  const errors: string[] = [];
  const states = Array.isArray(def.states) ? def.states : [];
  const transitions = Array.isArray(def.transitions) ? def.transitions : [];

  if (states.length === 0) errors.push('state machine needs at least one state');

  const stateIds = new Set<string>();
  for (const state of states) {
    if (!state?.id) { errors.push('state is missing an id'); continue; }
    if (stateIds.has(state.id)) errors.push(`duplicate state id "${state.id}"`);
    stateIds.add(state.id);
    if (!state.clipId) errors.push(`state "${state.id}" has no clip`);
    if (state.speed !== undefined && (!Number.isFinite(state.speed) || state.speed <= 0)) {
      errors.push(`state "${state.id}" has an invalid speed`);
    }
  }

  if (def.initial && !stateIds.has(def.initial)) {
    errors.push(`initial state "${def.initial}" does not exist`);
  }

  const parameterNames = new Set<string>((def.parameters ?? []).map((parameter) => parameter.name));

  for (const transition of transitions) {
    if (!transition?.to) { errors.push('transition is missing a destination'); continue; }
    if (transition.from !== ANY_STATE && !stateIds.has(transition.from)) {
      errors.push(`transition from unknown state "${transition.from}"`);
    }
    if (!stateIds.has(transition.to)) errors.push(`transition to unknown state "${transition.to}"`);
    if (transition.duration !== undefined && (!Number.isFinite(transition.duration) || transition.duration < 0)) {
      errors.push(`transition ${transition.from}->${transition.to} has an invalid duration`);
    }
    if (transition.exitTime !== undefined && (transition.exitTime < 0 || transition.exitTime > 1)) {
      errors.push(`transition ${transition.from}->${transition.to} has an exitTime outside 0..1`);
    }
    if (transition.transitionOffset !== undefined && (transition.transitionOffset < 0 || transition.transitionOffset > 1)) {
      errors.push(`transition ${transition.from}->${transition.to} has an offset outside 0..1`);
    }
    for (const condition of transition.conditions ?? []) {
      if (!parameterNames.has(condition.parameter)) {
        errors.push(`transition ${transition.from}->${transition.to} reads unknown parameter "${condition.parameter}"`);
      }
    }
  }

  return errors;
}

function conditionPasses(condition: AnimCondition, machine: AnimStateMachine): boolean {
  const entry = machine.getParameter(condition.parameter);
  if (!entry) return false;

  if (entry.type === 'trigger') {
    if (condition.op === undefined || condition.op === 'eq') return entry.value === true;
    if (condition.op === 'neq') return entry.value !== true;
    return false;
  }

  const op = condition.op ?? 'eq';
  const actual = entry.value;
  const expected = condition.value;

  switch (op) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    default: return false;
  }
}

// True when progress moved past the requested normalized point, including the
// wrap that happens when a looping clip restarts.
function crossedExitTime(exitTime: number, previous: number, current: number): boolean {
  if (exitTime <= 0) return true;
  if (current < previous) return exitTime >= previous || exitTime <= current;
  return previous < exitTime && exitTime <= current;
}

export class AnimStateMachine {
  private readonly states = new Map<string, AnimStateDef>();
  private readonly transitions: AnimTransitionDef[];
  private readonly parameters = new Map<string, { type: AnimParameterType; value: boolean | number }>();
  private current: string;
  private previousProgress = 0;

  constructor(def: AnimStateMachineDef) {
    const errors = validateStateMachine(def);
    if (errors.length > 0) throw new Error(`invalid state machine: ${errors.join('; ')}`);

    for (const state of def.states) this.states.set(state.id, state);
    // Declaration order is the tie-breaker when priorities match.
    this.transitions = def.transitions
      .map((transition, order) => ({ transition, order }))
      .sort((a, b) => (a.transition.priority ?? 0) - (b.transition.priority ?? 0) || a.order - b.order)
      .map((entry) => entry.transition);

    for (const parameter of def.parameters ?? []) {
      this.parameters.set(parameter.name, {
        type: parameter.type,
        value: parameter.default ?? (parameter.type === 'number' ? 0 : false)
      });
    }

    this.current = def.initial ?? def.states[0].id;
  }

  get currentState(): string { return this.current; }
  get currentStateDef(): AnimStateDef { return this.states.get(this.current)!; }
  get stateIds(): string[] { return [...this.states.keys()]; }

  getParameter(name: string): { type: AnimParameterType; value: boolean | number } | undefined {
    return this.parameters.get(name);
  }

  setBool(name: string, value: boolean): void { this.write(name, 'bool', value); }
  setNumber(name: string, value: number): void { this.write(name, 'number', value); }
  setTrigger(name: string): void { this.write(name, 'trigger', true); }

  resetTrigger(name: string): void { this.write(name, 'trigger', false); }

  private write(name: string, type: AnimParameterType, value: boolean | number): void {
    const entry = this.parameters.get(name);
    if (!entry || entry.type !== type) return;
    entry.value = value;
  }

  // Advances one frame. `progress` is the source state's normalized playback
  // position (0..1). Returns the transition that fired, or null.
  update(dt: number, progress: number): AnimTransitionEvent | null {
    const clamped = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;

    for (const transition of this.transitions) {
      if (transition.from !== ANY_STATE && transition.from !== this.current) continue;
      if (transition.to === this.current) continue;
      if (!this.conditionsPass(transition)) continue;

      const exitTime = transition.exitTime;
      if (exitTime !== undefined && !crossedExitTime(exitTime, this.previousProgress, clamped)) continue;

      const from = this.current;
      this.current = transition.to;
      this.previousProgress = 0;
      this.consumeTriggers();

      return {
        from,
        to: transition.to,
        duration: Math.max(transition.duration ?? 0, 0),
        offset: Math.min(Math.max(transition.transitionOffset ?? 0, 0), 1)
      };
    }

    this.previousProgress = clamped;
    void dt;
    return null;
  }

  private conditionsPass(transition: AnimTransitionDef): boolean {
    const conditions = transition.conditions ?? [];
    return conditions.every((condition) => conditionPasses(condition, this));
  }

  // Triggers are edge events: the first transition that reads one consumes all
  // of them, so a stale trigger cannot fire a second state change.
  private consumeTriggers(): void {
    for (const entry of this.parameters.values()) {
      if (entry.type === 'trigger') entry.value = false;
    }
  }
}
