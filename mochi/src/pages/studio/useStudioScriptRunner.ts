// Runs the authoring Lua script in the browser sandbox and owns the console
// state the script tab renders. Kept out of `StudioPage` so the page only wires
// surfaces together.

import { useState } from 'react';
import { defaultLuaEngine, type LuaLogEntry } from '../../engine/lua';
import type { StudioSystemLogApi } from '../../components/studio/shell/useStudioSystemLog';

export interface StudioScriptRunnerApi {
  logs: LuaLogEntry[];
  executionTimeMs: number | null;
  hasError: boolean;
  errorMessage: string | null;
  isTesting: boolean;
  clearLogs: () => void;
  runTest: (code: string) => Promise<void>;
}

export function useStudioScriptRunner(log: StudioSystemLogApi): StudioScriptRunnerApi {
  const [logs, setLogs] = useState<LuaLogEntry[]>([]);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = async (code: string) => {
    setIsTesting(true);
    setHasError(false);
    setErrorMessage(null);
    const result = await defaultLuaEngine.executeScript(code);
    setLogs(result.logs);
    setExecutionTimeMs(result.executionTimeMs);
    setHasError(!result.success);
    if (!result.success && result.error) setErrorMessage(result.error);
    result.logs.forEach((entry) => log.push(entry.level === 'error' ? 'error' : 'info', 'Lua', entry.message));
    if (!result.success && result.error) log.push('error', 'Lua', result.error);
    log.push(result.success ? 'success' : 'error', 'Lua', `Script finished in ${result.executionTimeMs}ms`);
    setIsTesting(false);
  };

  return {
    logs,
    executionTimeMs,
    hasError,
    errorMessage,
    isTesting,
    clearLogs: () => setLogs([]),
    runTest
  };
}
