// Studio environment state hook: owns the EnvironmentState, coerces untrusted
// manifest input, and exposes a patch/reset API for the inspector panels.

import { useCallback, useState } from 'react';
import {
  STARTER_ENVIRONMENT,
  normalizeEnvironmentState,
  type EnvironmentState
} from '../../engine/environment/environmentTypes';
import { isValidSkyboxId } from '../../engine/environment/skyboxPresets';

export interface StudioEnvironmentController {
  environment: EnvironmentState;
  updateEnvironment: (patch: Partial<EnvironmentState>) => void;
  resetEnvironment: () => void;
  replaceEnvironment: (next: unknown) => void;
}

export function useStudioEnvironment(initial?: unknown): StudioEnvironmentController {
  const [environment, setEnvironment] = useState<EnvironmentState>(() =>
    normalizeEnvironmentState(initial, isValidSkyboxId)
  );

  const updateEnvironment = useCallback((patch: Partial<EnvironmentState>) => {
    setEnvironment((prev) => normalizeEnvironmentState({ ...prev, ...patch }, isValidSkyboxId));
  }, []);

  const resetEnvironment = useCallback(() => {
    setEnvironment({ ...STARTER_ENVIRONMENT });
  }, []);

  const replaceEnvironment = useCallback((next: unknown) => {
    setEnvironment(normalizeEnvironmentState(next, isValidSkyboxId));
  }, []);

  return { environment, updateEnvironment, resetEnvironment, replaceEnvironment };
}
