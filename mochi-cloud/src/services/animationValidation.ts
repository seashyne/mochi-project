// Server-side validation of the animation state graph, plus the cross-check that
// every state points at a clip the manifest actually declares.
//
// Clip validation lives in animationClipValidation.ts and is re-exported here so
// callers keep importing one module.

import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord
} from './validationPrimitives';

export { validateAnimationClips, MAX_ANIMATION_CLIPS } from './animationClipValidation';

export const MAX_ANIMATION_STATES = 64;
export const MAX_ANIMATION_TRANSITIONS = 256;
export const MAX_ANIMATION_PARAMETERS = 32;
export const MAX_CONDITIONS_PER_TRANSITION = 16;

const PARAMETER_TYPES = new Set(['bool', 'number', 'trigger']);
const CONDITION_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
const ANY_STATE = '*';

export function validateAnimationStateMachine(candidate: unknown): string[] {
  const errors: string[] = [];
  if (candidate === undefined) return errors;
  if (!isRecord(candidate)) return ['animationStateMachine must be an object'];

  const states = candidate.states;
  if (!Array.isArray(states) || states.length === 0) return ['animationStateMachine.states must not be empty'];
  if (states.length > MAX_ANIMATION_STATES) {
    return [`animationStateMachine.states exceeds ${MAX_ANIMATION_STATES} entries`];
  }

  const stateIds = new Set<string>();
  states.forEach((state, index) => {
    const label = `animationStateMachine.states[${index}]`;
    if (!isRecord(state)) {
      errors.push(`${label} must be an object`);
      return;
    }
    if (!isNonEmptyString(state.id)) {
      errors.push(`${label}.id is required`);
    } else if (stateIds.has(state.id)) {
      errors.push(`${label}.id is duplicated`);
    } else {
      stateIds.add(state.id);
    }
    if (!isNonEmptyString(state.clipId)) errors.push(`${label}.clipId is required`);
    if (state.speed !== undefined && (!isFiniteNumber(state.speed) || state.speed <= 0)) {
      errors.push(`${label}.speed must be a positive number`);
    }
    if (state.loop !== undefined && typeof state.loop !== 'boolean') {
      errors.push(`${label}.loop must be a boolean`);
    }
  });

  if (candidate.initial !== undefined && !stateIds.has(String(candidate.initial))) {
    errors.push('animationStateMachine.initial must reference a declared state');
  }

  const parameters = candidate.parameters;
  const parameterNames = new Set<string>();
  if (parameters !== undefined) {
    if (!Array.isArray(parameters)) {
      errors.push('animationStateMachine.parameters must be an array');
    } else if (parameters.length > MAX_ANIMATION_PARAMETERS) {
      errors.push(`animationStateMachine.parameters exceeds ${MAX_ANIMATION_PARAMETERS} entries`);
    } else {
      parameters.forEach((parameter, index) => {
        const label = `animationStateMachine.parameters[${index}]`;
        if (!isRecord(parameter)) {
          errors.push(`${label} must be an object`);
          return;
        }
        if (!isNonEmptyString(parameter.name)) {
          errors.push(`${label}.name is required`);
        } else if (parameterNames.has(parameter.name)) {
          errors.push(`${label}.name is duplicated`);
        } else {
          parameterNames.add(parameter.name);
        }
        if (typeof parameter.type !== 'string' || !PARAMETER_TYPES.has(parameter.type)) {
          errors.push(`${label}.type must be bool, number or trigger`);
        }
        if (parameter.default !== undefined && parameter.type !== 'trigger') {
          const expected = parameter.type === 'number' ? 'number' : 'boolean';
          if (typeof parameter.default !== expected) {
            errors.push(`${label}.default must be a ${expected}`);
          }
        }
      });
    }
  }

  const transitions = candidate.transitions;
  if (!Array.isArray(transitions)) {
    errors.push('animationStateMachine.transitions must be an array');
    return errors;
  }
  if (transitions.length > MAX_ANIMATION_TRANSITIONS) {
    errors.push(`animationStateMachine.transitions exceeds ${MAX_ANIMATION_TRANSITIONS} entries`);
    return errors;
  }

  transitions.forEach((transition, index) => {
    const label = `animationStateMachine.transitions[${index}]`;
    if (!isRecord(transition)) {
      errors.push(`${label} must be an object`);
      return;
    }
    if (transition.from !== ANY_STATE && !stateIds.has(String(transition.from))) {
      errors.push(`${label}.from must be "*" or a declared state`);
    }
    if (!stateIds.has(String(transition.to))) {
      errors.push(`${label}.to must reference a declared state`);
    }
    if (transition.duration !== undefined && (!isFiniteNumber(transition.duration) || transition.duration < 0 || transition.duration > 60)) {
      errors.push(`${label}.duration must be between 0 and 60 seconds`);
    }
    if (transition.priority !== undefined && !isFiniteNumber(transition.priority)) {
      errors.push(`${label}.priority must be a number`);
    }
    if (transition.exitTime !== undefined && (!isFiniteNumber(transition.exitTime) || transition.exitTime < 0 || transition.exitTime > 1)) {
      errors.push(`${label}.exitTime must be between 0 and 1`);
    }
    if (transition.transitionOffset !== undefined && (!isFiniteNumber(transition.transitionOffset) || transition.transitionOffset < 0 || transition.transitionOffset > 1)) {
      errors.push(`${label}.transitionOffset must be between 0 and 1`);
    }

    const conditions = transition.conditions;
    if (conditions === undefined) return;
    if (!Array.isArray(conditions)) {
      errors.push(`${label}.conditions must be an array`);
      return;
    }
    if (conditions.length > MAX_CONDITIONS_PER_TRANSITION) {
      errors.push(`${label}.conditions exceeds ${MAX_CONDITIONS_PER_TRANSITION} entries`);
      return;
    }
    conditions.forEach((condition, conditionIndex) => {
      const conditionLabel = `${label}.conditions[${conditionIndex}]`;
      if (!isRecord(condition)) {
        errors.push(`${conditionLabel} must be an object`);
        return;
      }
      if (!parameterNames.has(String(condition.parameter))) {
        errors.push(`${conditionLabel}.parameter must reference a declared parameter`);
      }
      if (condition.op !== undefined && (typeof condition.op !== 'string' || !CONDITION_OPS.has(condition.op))) {
        errors.push(`${conditionLabel}.op is not a supported comparison`);
      }
      if (condition.value !== undefined && typeof condition.value !== 'boolean' && !isFiniteNumber(condition.value)) {
        errors.push(`${conditionLabel}.value must be a boolean or a finite number`);
      }
    });
  });

  return errors;
}

// Cross-checks that only make sense once both halves are present: a state that
// points at a clip the manifest never declares can never play.
export function validateAnimationReferences(manifest: Record<string, unknown>): string[] {
  const machine = manifest.animationStateMachine;
  const clips = manifest.animations;
  if (!isRecord(machine) || !Array.isArray(machine.states) || !Array.isArray(clips)) return [];

  const clipIds = new Set(
    clips
      .filter((clip): clip is Record<string, unknown> => isRecord(clip) && typeof clip.id === 'string')
      .map((clip) => String(clip.id))
  );
  if (clipIds.size === 0) return [];

  const errors: string[] = [];
  machine.states.forEach((state, index) => {
    if (!isRecord(state)) return;
    const clipId = String(state.clipId ?? '');
    if (clipId && !clipIds.has(clipId)) {
      errors.push(`animationStateMachine.states[${index}].clipId "${clipId}" is not a declared clip`);
    }
  });
  return errors;
}
