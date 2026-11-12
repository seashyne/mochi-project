// Interactive Lua 5.4 script editor with line numbers, syntax styling, runtime error display, and test run bridge

import React, { useRef, useMemo } from 'react';
import { Terminal, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Play, Loader2, Code2 } from 'lucide-react';
import { LuaLogEntry } from '../../engine/lua/types';
import { tokenizeLuaLine, LuaTokenType } from './luaTokenizer';

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

const TOKEN_COLOR_MAP: Record<LuaTokenType, string> = {
  keyword: 'text-studio-violet font-semibold',
  builtin: 'text-studio-info font-semibold',
  string: 'text-studio-success',
  comment: 'text-studio-muted italic',
  number: 'text-studio-warning',
  operator: 'text-studio-muted',
  text: 'text-studio-text'
};

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => (code || '').split('\n'), [code]);

  const errorLineNumber = useMemo(() => {
    if (!errorMessage) return null;
    const match = errorMessage.match(/(?:line\s*|:\s*)(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }, [errorMessage]);

  const handleScroll = () => {
    if (textareaRef.current) {
      const top = textareaRef.current.scrollTop;
      if (gutterRef.current) gutterRef.current.scrollTop = top;
      if (overlayRef.current) overlayRef.current.scrollTop = top;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && onCodeChange && textareaRef.current) {
      e.preventDefault();
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const current = textareaRef.current.value;
      const updated = current.substring(0, start) + '  ' + current.substring(end);
      onCodeChange(updated);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  return (
    <div className="bg-studio-panel border border-studio-border text-studio-text rounded-2xl p-4 flex flex-col space-y-3 font-mono text-xs shadow-sm">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-studio-border pb-3">
        <div className="flex items-center space-x-2">
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
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-danger/20 text-studio-danger border border-studio-danger/40 flex items-center space-x-1 font-sans">
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </span>
          ) : logs.length > 0 ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-studio-success/20 text-studio-success border border-studio-success/40 flex items-center space-x-1 font-sans">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center space-x-2">
          {onRunTest && (
            <button
              type="button"
              disabled={isTesting}
              onClick={onRunTest}
              className="px-3.5 py-1.5 rounded-xl bg-studio-accent/20 hover:bg-studio-accent/30 border border-studio-accent/50 disabled:opacity-50 text-studio-text text-xs font-bold font-sans flex items-center space-x-1.5 transition-all shadow-sm"
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
            className="text-studio-muted hover:text-studio-text p-1.5 rounded-lg hover:bg-studio-card/60 transition-colors"
            title="Clear Console Output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Script Editor Section with Line Numbers & Syntax Overlay */}
      {code !== undefined && onCodeChange && (
        <div className="space-y-2">
          <div className="relative flex rounded-xl border border-studio-border bg-studio-bg overflow-hidden h-72">
            {/* Gutter with line numbers */}
            <div
              ref={gutterRef}
              className="w-11 shrink-0 bg-studio-panel/70 border-r border-studio-border select-none text-studio-muted text-right pr-2.5 py-3 font-mono text-xs leading-6 overflow-hidden"
            >
              {lines.map((_, idx) => {
                const lineNum = idx + 1;
                const isError = lineNum === errorLineNumber;
                return (
                  <div
                    key={idx}
                    className={`h-6 ${isError ? 'text-studio-danger font-bold bg-studio-danger/20 rounded' : ''}`}
                  >
                    {lineNum}
                  </div>
                );
              })}
            </div>

            {/* Syntax Overlay Pre */}
            <div
              ref={overlayRef}
              className="absolute left-11 right-0 top-0 bottom-0 p-3 font-mono text-xs leading-6 pointer-events-none overflow-hidden whitespace-pre text-studio-text"
              aria-hidden="true"
            >
              {lines.map((line, idx) => {
                const isError = idx + 1 === errorLineNumber;
                const tokens = tokenizeLuaLine(line);
                return (
                  <div key={idx} className={`h-6 ${isError ? 'bg-studio-danger/10' : ''}`}>
                    {tokens.map((tok, tIdx) => (
                      <span key={tIdx} className={TOKEN_COLOR_MAP[tok.type]}>
                        {tok.value}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              value={code}
              readOnly={readOnly}
              onChange={(e) => onCodeChange(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="relative w-full h-full p-3 font-mono text-xs leading-6 bg-transparent text-transparent caret-studio-text resize-none outline-none overflow-auto whitespace-pre z-10 selection:bg-studio-accent/30"
            />
          </div>

          {/* Inline Runtime Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-studio-danger/10 border border-studio-danger/40 text-studio-danger text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 overflow-hidden">
                <span className="font-bold">
                  {errorLineNumber ? `Runtime Error on Line ${errorLineNumber}:` : 'Runtime Error:'}
                </span>
                <p className="mt-0.5 break-all text-[11px] text-studio-danger/80">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terminal Log Console */}
      <div className={`${showLogs ? '' : 'hidden '}max-h-40 overflow-y-auto space-y-1 pr-1 text-[11px] bg-studio-bg rounded-xl p-2.5 border border-studio-border text-studio-text`}>
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
                className={`flex items-start space-x-2 py-0.5 leading-relaxed ${
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
                    <span className="flex items-center space-x-0.5">
                      <AlertCircle className="w-2.5 h-2.5" />
                      <span>ERR</span>
                    </span>
                  ) : log.level === 'warn' ? (
                    <span className="flex items-center space-x-0.5">
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
