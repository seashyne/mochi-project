// Reads the optional animation state graph out of a scene manifest.
//
// Kept separate from attachWorld so the Studio save path can validate the same
// definition without constructing a world, and so a malformed graph degrades to
// "no state machine" instead of breaking playback.

import { validateStateMachine, type AnimStateMachineDef } from './stateMachine';

export interface StateMachineParseResult {
  definition: AnimStateMachineDef | null;
  errors: string[];
}

// An absent field is not an error. A present but broken graph is: the caller
// decides whether to warn, but playback falls back to plain clips either way.
export function readAnimationStateMachine(candidate: unknown): StateMachineParseResult {
  if (candidate === null || candidate === undefined) return { definition: null, errors: [] };
  if (typeof candidate !== 'object') return { definition: null, errors: ['animationStateMachine must be an object'] };

  const definition = candidate as AnimStateMachineDef;
  if (!Array.isArray(definition.states) || definition.states.length === 0) {
    return { definition: null, errors: ['animationStateMachine has no states'] };
  }

  const errors = validateStateMachine(definition);
  return errors.length > 0 ? { definition: null, errors } : { definition, errors: [] };
}
