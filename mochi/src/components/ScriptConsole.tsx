// Interactive script console displaying Lua runtime logs and diagnostics

import React from 'react';
import { Terminal, Trash2, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { LuaLogEntry } from '../engine/lua/types';

export interface ScriptConsoleProps {
  title: string;
  logs: LuaLogEntry[];
  executionTimeMs?: number | null;
  hasError?: boolean;
  onClear: () => void;
}

export const ScriptConsole: React.FC<ScriptConsoleProps> = ({
  title,
  logs,
  executionTimeMs,
  hasError,
  onClear
}) => {
  return (
    <div className="bg-[#090b10] border border-gray-800 rounded-lg p-3 flex flex-col space-y-2 text-xs font-mono">
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
        <div className="flex items-center space-x-2">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-gray-200">{title}</span>
          {executionTimeMs !== undefined && executionTimeMs !== null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
              {executionTimeMs.toFixed(1)}ms
            </span>
          )}
          {hasError ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center space-x-1">
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </span>
          ) : logs.length > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="Clear Console"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="max-h-36 overflow-y-auto space-y-1 pr-1 text-[11px]">
        {logs.length === 0 ? (
          <div className="text-gray-500 italic py-1">No console output yet. Click 'Run & Test Script' to execute.</div>
        ) : (
          logs.map((log, index) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={index}
                className={`flex items-start space-x-2 py-0.5 leading-relaxed ${
                  log.level === 'error'
                    ? 'text-red-400'
                    : log.level === 'warn'
                    ? 'text-amber-400'
                    : 'text-indigo-200'
                }`}
              >
                <span className="text-gray-600 shrink-0 select-none">[{timeStr}]</span>
                <span className="shrink-0 uppercase font-bold text-[9px] px-1 rounded bg-white/5">
                  {log.level === 'error' ? (
                    <span className="flex items-center space-x-0.5"><AlertCircle className="w-2.5 h-2.5" /><span>ERR</span></span>
                  ) : log.level === 'warn' ? (
                    <span className="flex items-center space-x-0.5"><AlertTriangle className="w-2.5 h-2.5" /><span>WARN</span></span>
                  ) : (
                    <span>INFO</span>
                  )}
                </span>
                <span className="break-all">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
