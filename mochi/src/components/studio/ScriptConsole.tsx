// Interactive Lua 5.4 script editor with CodeMirror 6, real-time diagnostics, and engine test run bridge

import React, { useRef, useMemo, useState } from 'react';
import { Terminal, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Play, Loader2, Code2, Sparkles } from 'lucide-react';
import { LuaLogEntry } from '../../engine/lua/types';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';
import { LuaSyntaxError } from './editor/luaSyntaxChecker';
import { BUILTIN_SNIPPETS } from './editor/luaSnippets';

export interface ScriptConsoleProps {
  title?: string;
  logs: LuaLogEntry[];
  executionTimeMs?: number | null;
  hasError?: boolean;
  errorMessage?: string | null;
  onClear: () => void;
  // Code editor integration
  code?: string;
  onCodeChange?: (newCode: string) => void;
  onRunTest?: () => void;
  isTesting?: boolean;
  readOnly?: boolean;
  /** Hides the built-in log list when the new Output terminal is rendered instead. */
  showLogs?: boolean;
}

export const ScriptConsole: React.FC<ScriptConsoleProps> = ({
  title = 'Lua Execution Console',
  logs,
  executionTimeMs,
  hasError,
  errorMessage,
  onClear,
  code,
  onCodeChange,
  onRunTest,
  isTesting = false,
  readOnly = false,
  showLogs = true
}) => {
  const jumpToLineRef = useRef<((line: number, col?: number) => void) | null>(null);
  const [syntaxError, setSyntaxError] = useState<LuaSyntaxError | null>(null);

  const errorLineNumber = useMemo(() => {
    if (!errorMessage) return null;
    const match = errorMessage.match(/(?:line\s*|:\s*)(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }, [errorMessage]);

  const handleSnippetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const snippetId = e.target.value;
    if (!snippetId || !onCodeChange) return;
    const found = BUILTIN_SNIPPETS.find((s) => s.id === snippetId);
    if (found) {
      onCodeChange(found.rawCode);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-studio-panel border border-studio-border text-studio-text rounded-2xl p-4 flex flex-col space-y-3 font-mono text-xs shadow-sm">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-studio-border pb-3">
        <div className="flex items-center gap-x-2">
          {code !== undefined ? (
            <Code2 className="w-4 h-4 text-studio-info" />
          ) : (
            <Terminal className="w-4 h-4 text-studio-violet" />
          )}
          <span className="font-bold text-studio-text text-xs">{title}</span>
          {executionTimeMs !== undefined && executionTimeMs !== null && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-card text-studio-muted border border-studio-border">
              {executionTimeMs.toFixed(1)}ms
            </span>
          )}
          {hasError ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-danger/20 text-studio-danger border border-studio-danger/40 flex items-center gap-x-1 font-sans">
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </span>
          ) : syntaxError ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-warning/20 text-studio-warning border border-studio-warning/40 flex items-center gap-x-1 font-sans">
              <AlertTriangle className="w-3 h-3" />
              <span>Syntax Warning</span>
            </span>
          ) : logs.length > 0 ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-success/20 text-studio-success border border-studio-success/40 flex items-center gap-x-1 font-sans">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-x-2">
          {code !== undefined && onCodeChange && !readOnly && (
            <div className="flex items-center gap-x-1 bg-studio-card rounded-xl border border-studio-border px-2 py-1">
              <Sparkles className="w-3.5 h-3.5 text-studio-accent" />
              <select
                aria-label="Insert Snippet"
                defaultValue=""
                onChange={handleSnippetSelect}
                className="bg-transparent text-studio-muted hover:text-studio-text text-[11px] font-sans outline-none cursor-pointer"
              >
                <option value="" disabled>Insert Snippet...</option>
                {BUILTIN_SNIPPETS.map((snippet) => (
                  <option key={snippet.id} value={snippet.id} className="bg-studio-panel text-studio-text">
                    {snippet.detail}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onRunTest && (
            <button
              type="button"
              disabled={isTesting}
              onClick={onRunTest}
              className="px-3.5 py-1.5 rounded-xl bg-studio-accent/20 hover:bg-studio-accent/30 border border-studio-accent/50 disabled:opacity-50 text-studio-text text-xs font-bold font-sans flex items-center gap-x-1.5 transition-all shadow-sm cursor-pointer"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-accent" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run & Test Script</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-studio-muted hover:text-studio-text p-1.5 rounded-lg hover:bg-studio-card/60 transition-colors cursor-pointer"
            title="Clear Console Output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Script Editor Section */}
      {code !== undefined && onCodeChange && (
        <div className="space-y-2">
          <CodeMirrorEditor
            code={code}
            onCodeChange={onCodeChange}
            readOnly={readOnly}
            highlightErrorLine={errorLineNumber}
            onJumpToLineRef={jumpToLineRef}
            onSyntaxError={setSyntaxError}
          />

          {/* Interactive Runtime Error Banner with Click-to-Jump */}
          {errorMessage && (
            <button
              type="button"
              onClick={() => errorLineNumber && jumpToLineRef.current?.(errorLineNumber)}
              className="w-full text-start p-3 rounded-xl bg-studio-danger/10 hover:bg-studio-danger/15 border border-studio-danger/40 text-studio-danger text-xs flex items-start gap-x-2 transition-colors cursor-pointer"
              title="Click to jump to error line"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden">
                <span className="font-bold">
                  {errorLineNumber ? `Runtime Error on Line ${errorLineNumber}:` : 'Runtime Error:'}
                </span>
                <p className="mt-0.5 break-all text-[11px] text-studio-danger/80">{errorMessage}</p>
              </div>
            </button>
          )}

          {/* Real-time Syntax Error Diagnostic Banner with Click-to-Jump */}
          {!errorMessage && syntaxError && (
            <button
              type="button"
              onClick={() => jumpToLineRef.current?.(syntaxError.line, syntaxError.column)}
              className="w-full text-start p-3 rounded-xl bg-studio-warning/10 hover:bg-studio-warning/15 border border-studio-warning/40 text-studio-warning text-xs flex items-start gap-x-2 transition-colors cursor-pointer"
              title="Click to jump to syntax error line"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden">
                <span className="font-bold">
                  Syntax Error on Line {syntaxError.line}:
                </span>
                <p className="mt-0.5 break-all text-[11px] text-studio-warning/80">{syntaxError.message}</p>
                {syntaxError.hint && (
                  <p className="mt-1 text-[11px] text-studio-text/90 italic">Tip: {syntaxError.hint}</p>
                )}
              </div>
            </button>
          )}
        </div>
      )}

      {/* Terminal Log Console */}
      <div className={`${showLogs ? '' : 'hidden '}max-h-40 overflow-y-auto space-y-1 pe-1 text-[11px] bg-studio-bg rounded-xl p-2.5 border border-studio-border text-studio-text`}>
        {logs.length === 0 ? (
          <div className="text-studio-muted italic py-1">
            No console output yet. Click 'Run & Test Script' to execute.
          </div>
        ) : (
          logs.map((log, index) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={index}
                className={`flex items-start gap-x-2 py-0.5 leading-relaxed ${
                  log.level === 'error'
                    ? 'text-studio-danger'
                    : log.level === 'warn'
                    ? 'text-studio-warning'
                    : 'text-studio-info'
                }`}
              >
                <span className="text-studio-muted shrink-0 select-none">[{timeStr}]</span>
                <span className="shrink-0 uppercase font-bold text-[9px] px-1 rounded bg-studio-card border border-studio-border text-studio-text">
                  {log.level === 'error' ? (
                    <span className="flex items-center gap-x-0.5">
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>ERR</span>
                    </span>
                  ) : log.level === 'warn' ? (
                    <span className="flex items-center gap-x-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>WARN</span>
                    </span>
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

export default ScriptConsole;
