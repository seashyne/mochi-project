// genre-standard Studio-style Output terminal: structured log rows with source, filters,
// clear/copy, and a code view that highlights the failing Lua line.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal, Trash2, Copy, ChevronDown, ChevronRight, FileCode2,
  AlertTriangle, Info, CircleAlert
} from 'lucide-react';
import { ConsoleEntry, ConsoleSnapshot, SessionConsole } from '../../engine/runtime/sessionConsole';

export interface SessionTerminalProps {
  session: SessionConsole | null;
  title?: string;
  /** Positioning for the dock wrapper; `className` sizes the expanded panel. */
  containerClassName?: string;
  className?: string;
  defaultOpen?: boolean;
  hotkey?: boolean;
}

type Filter = 'all' | 'info' | 'warn' | 'error';

const EMPTY: ConsoleSnapshot = { entries: [], scripts: [], canExecute: false };

function CodeView({ code, highlightLine }: { code: string; highlightLine?: number }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  return (
    <div className="mt-1.5 rounded-lg border border-white/[0.08] bg-black/40 overflow-x-auto max-h-48 overflow-y-auto">
      <pre className="py-1 text-[11px] leading-[1.55] font-mono text-slate-300">
        {lines.map((line, index) => {
          const active = highlightLine === index + 1;
          return (
            <div key={index} className={`flex ${active ? 'bg-rose-500/15 text-rose-200' : ''}`}>
              <span className="w-9 shrink-0 text-right pr-2 text-slate-600 select-none tabular-nums">{index + 1}</span>
              <span className="pr-3 whitespace-pre">{line || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function LevelIcon({ level }: { level: ConsoleEntry['level'] }) {
  if (level === 'error') return <CircleAlert className="w-3 h-3 text-rose-400" />;
  if (level === 'warn') return <AlertTriangle className="w-3 h-3 text-amber-400" />;
  return <Info className="w-3 h-3 text-[#38bdf8]" />;
}

export const SessionTerminal: React.FC<SessionTerminalProps> = ({
  session,
  title = 'Output',
  containerClassName = '',
  className = '',
  defaultOpen = true,
  hotkey = false
}) => {
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot>(() => session?.getSnapshot() ?? EMPTY);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<'output' | 'scripts'>('output');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!session) {
      setSnapshot(EMPTY);
      return;
    }
    setSnapshot(session.getSnapshot());
    return session.subscribe(() => setSnapshot(session.getSnapshot()));
  }, [session]);

  useEffect(() => {
    if (!hotkey) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F9') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkey]);

  const entries = useMemo(
    () => snapshot.entries.filter((entry) => filter === 'all' || entry.level === filter),
    [snapshot.entries, filter]
  );

  useEffect(() => {
    const list = listRef.current;
    if (list && tab === 'output') list.scrollTop = list.scrollHeight;
  }, [entries.length, tab]);

  const handleClear = useCallback(() => {
    session?.clear();
    setExpanded(null);
  }, [session]);

  const handleCopy = useCallback(() => {
    const text = entries
      .map((entry) => `[${new Date(entry.timestamp).toLocaleTimeString()}] [${entry.level}] ${entry.source ?? ''}: ${entry.message}`)
      .join('\n');
    if (text.trim()) void navigator.clipboard?.writeText(text).catch(() => undefined);
  }, [entries]);

  const openScript = (source: string) => {
    setSelectedScript(source);
    setTab('scripts');
  };

  const submitCommand = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || !session || !snapshot.canExecute) return;
    session.push('info', `> ${trimmed}`, 'command');
    setHistory((previous) => [...previous.slice(-29), trimmed]);
    setHistoryIndex(-1);
    setCommand('');
    void session.runCommand(trimmed);
  };

  const browseHistory = (event: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => {
    if (history.length === 0) return;
    event.preventDefault();
    const next = historyIndex < 0 ? history.length - 1 : Math.max(0, Math.min(history.length - 1, historyIndex + direction));
    setHistoryIndex(next);
    setCommand(history[next]);
  };

  if (!isOpen) {
    return (
      <div className={`pointer-events-none ${containerClassName}`}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#090b10]/90 border border-white/10 text-[11px] font-mono text-slate-300 hover:text-white hover:border-[#38bdf8]/40 transition-colors"
          title="Open Output (F9)"
        >
          <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />
          {title}
          <span className="ml-1 text-slate-500 tabular-nums">{snapshot.entries.length}</span>
        </button>
      </div>
    );
  }

  const counts = {
    all: snapshot.entries.length,
    info: snapshot.entries.filter((entry) => entry.level === 'info').length,
    warn: snapshot.entries.filter((entry) => entry.level === 'warn').length,
    error: snapshot.entries.filter((entry) => entry.level === 'error').length
  };
  const activeScript = snapshot.scripts.find((script) => script.source === selectedScript) ?? snapshot.scripts[0];

  return (
    <div className={`pointer-events-none ${containerClassName}`}>
    <div className={`pointer-events-auto flex flex-col rounded-xl overflow-hidden border border-white/[0.1] bg-[#090b10]/95 backdrop-blur-md shadow-2xl ${className}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/[0.08] bg-black/30">
        <Terminal className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
        <span className="text-[11px] font-bold text-slate-200 mr-1">{title}</span>
        <button type="button" onClick={() => setTab('output')} className={`px-2 py-0.5 rounded text-[10px] font-mono ${tab === 'output' ? 'bg-[#38bdf8]/20 text-[#7dd3fc]' : 'text-slate-500 hover:text-slate-300'}`}>Output</button>
        <button type="button" onClick={() => setTab('scripts')} className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${tab === 'scripts' ? 'bg-[#38bdf8]/20 text-[#7dd3fc]' : 'text-slate-500 hover:text-slate-300'}`}>
          <FileCode2 className="w-3 h-3" /> Scripts ({snapshot.scripts.length})
        </button>
        <div className="flex-1" />
        {tab === 'output' && (
          <>
            <button type="button" onClick={handleCopy} className="p-1 rounded text-slate-500 hover:text-white" title="Copy output"><Copy className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={handleClear} className="p-1 rounded text-slate-500 hover:text-white" title="Clear output"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        )}
        <button type="button" onClick={() => setIsOpen(false)} className="p-1 rounded text-slate-500 hover:text-white" title="Collapse (F9)"><ChevronDown className="w-3.5 h-3.5" /></button>
      </div>

      {tab === 'output' ? (
        <>
          <div className="flex items-center gap-1 px-2.5 py-1 border-b border-white/[0.06]">
            {(['all', 'info', 'warn', 'error'] as Filter[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFilter(level)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono capitalize ${filter === level ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {level} {counts[level]}
              </button>
            ))}
          </div>
          <div ref={listRef} className="flex-1 min-h-[120px] max-h-[220px] overflow-y-auto px-1.5 py-1 font-mono text-[11px]">
            {entries.length === 0 && <div className="px-2 py-3 text-slate-600">No output yet. Scripts print here as they run.</div>}
            {entries.map((entry) => {
              const isExpanded = expanded === entry.id;
              const hasCode = Boolean(entry.code || snapshot.scripts.some((script) => script.source === entry.source));
              return (
                <div key={entry.id} className="border-b border-white/[0.04] last:border-0">
                  <button
                    type="button"
                    onClick={() => hasCode && setExpanded(isExpanded ? null : entry.id)}
                    className="w-full flex items-start gap-1.5 px-1.5 py-1 text-left hover:bg-white/[0.03] rounded"
                  >
                    {hasCode ? (isExpanded ? <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" /> : <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />) : <span className="w-3 shrink-0" />}
                    <LevelIcon level={entry.level} />
                    <span className="text-slate-600 shrink-0 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    {entry.source && <span className={`shrink-0 ${entry.level === 'error' ? 'text-rose-300' : 'text-[#7dd3fc]'}`}>[{entry.source}]</span>}
                    <span className={`break-all ${entry.level === 'error' ? 'text-rose-200' : entry.level === 'warn' ? 'text-amber-200' : 'text-slate-300'}`}>{entry.message}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-2 pb-2 pl-6">
                      {entry.code ? (
                        <CodeView code={entry.code} highlightLine={entry.line} />
                      ) : (
                        <button type="button" onClick={() => entry.source && openScript(entry.source)} className="text-[10px] text-[#7dd3fc] hover:underline">
                          View {entry.source} source
                        </button>
                      )}
                      {entry.code && entry.source && (
                        <button type="button" onClick={() => openScript(entry.source!)} className="mt-1 block text-[10px] text-slate-500 hover:text-white">
                          Open in Scripts tab
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {snapshot.canExecute && (
            <form onSubmit={submitCommand} className="flex items-center gap-1.5 px-2 py-1.5 border-t border-white/[0.08] bg-black/30">
              <span className="font-mono text-xs text-[#38bdf8]">&gt;</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') browseHistory(event, -1);
                  else if (event.key === 'ArrowDown') browseHistory(event, 1);
                }}
                placeholder="Run Lua in this session…"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[11px] text-slate-200 placeholder:text-slate-600"
              />
              <button type="submit" className="px-2 py-0.5 rounded bg-[#38bdf8]/15 text-[#7dd3fc] text-[10px] font-mono hover:bg-[#38bdf8]/25">Run</button>
            </form>
          )}
        </>
      ) : (
        <div className="flex min-h-[140px] max-h-[240px]">
          <div className="w-36 shrink-0 border-r border-white/[0.08] overflow-y-auto py-1">
            {snapshot.scripts.length === 0 && <div className="px-2 py-2 text-[10px] text-slate-600">No scripts</div>}
            {snapshot.scripts.map((script) => (
              <button
                key={script.source}
                type="button"
                onClick={() => setSelectedScript(script.source)}
                className={`w-full text-left px-2 py-1 truncate text-[11px] font-mono ${activeScript?.source === script.source ? 'bg-[#38bdf8]/15 text-[#7dd3fc]' : 'text-slate-400 hover:text-white'}`}
              >
                {script.source}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-auto p-2">
            {activeScript ? <CodeView code={activeScript.code} /> : <div className="text-[11px] text-slate-600">Select a script to view its Lua source.</div>}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
