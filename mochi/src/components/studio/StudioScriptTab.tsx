// Script tab body of the Studio shell: the Lua console plus run/test wiring.

import React from 'react';
import { ScriptConsole } from './ScriptConsole';
import type { LuaLogEntry } from '../../engine/lua';

export interface StudioScriptTabProps {
  code: string;
  onCodeChange: (code: string) => void;
  onRunTest: () => void;
  isTesting: boolean;
  logs: LuaLogEntry[];
  executionTimeMs: number | null;
  hasError: boolean;
  errorMessage: string | null;
  onClear: () => void;
}

export const StudioScriptTab: React.FC<StudioScriptTabProps> = (props) => (
  <div className="flex-1 max-w-5xl w-full mx-auto overflow-y-auto">
    <ScriptConsole
      title="Studio Lua 5.4 Script Editor"
      code={props.code}
      onCodeChange={props.onCodeChange}
      onRunTest={props.onRunTest}
      isTesting={props.isTesting}
      logs={props.logs}
      executionTimeMs={props.executionTimeMs}
      hasError={props.hasError}
      errorMessage={props.errorMessage}
      onClear={props.onClear}
    />
  </div>
);
