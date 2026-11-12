// Output dock: timestamped editor log with the All / Output / Errors filters and
// a clear action, mirroring the console every scene editor ships.

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { StudioLogEntry } from './useStudioSystemLog';

export type StudioOutputFilter = 'all' | 'output' | 'errors';

export interface StudioOutputPanelProps {
  logs: StudioLogEntry[];
  filter: StudioOutputFilter;
  onFilter: (filter: StudioOutputFilter) => void;
  onClear: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const LEVEL_COLOR: Record<StudioLogEntry['level'], string> = {
  info: 'text-studio-muted',
  success: 'text-studio-success',
  warn: 'text-studio-warning',
  error: 'text-studio-danger'
};

const FILTERS: { id: StudioOutputFilter; label: string }[] = [
  { id: 'all', label: 'All Messages' },
  { id: 'output', label: 'Output' },
  { id: 'errors', label: 'Errors' }
];

export const StudioOutputPanel: React.FC<StudioOutputPanelProps> = ({
  logs,
  filter,
  onFilter,
  onClear,
  collapsed = false,
  onToggleCollapse
}) => {
  const [query, setQuery] = useState('');
  const visible = logs.filter((entry) => {
    if (filter === 'errors' && entry.level !== 'error' && entry.level !== 'warn') return false;
    if (filter === 'output' && entry.level === 'error') return false;
    if (query && !`${entry.source} ${entry.message}`.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    return true;
  });
  const errorCount = logs.filter((entry) => entry.level === 'error').length;

  return (
    <div className="flex flex-col min-h-0 bg-studio-panel border-t border-studio-border">
      <div className="flex items-center gap-2 px-2 h-6 border-b border-studio-border bg-studio-ribbon shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Output</span>
        <div className="flex items-center gap-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilter(item.id)}
              className={`px-1.5 py-[1px] rounded-[3px] text-[10px] transition-colors ${
                filter === item.id
                  ? 'bg-studio-accent/20 text-studio-text border border-studio-accent/40'
                  : 'text-studio-muted border border-transparent hover:text-studio-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {errorCount > 0 && (
          <span className="text-[9px] font-mono px-1 rounded bg-studio-danger/15 text-studio-danger border border-studio-danger/30">
            {errorCount} errors
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
            className="w-28 px-1.5 py-[1px] rounded-[3px] bg-studio-bg border border-studio-border text-[10px] text-studio-text placeholder:text-studio-muted/70 focus:outline-none focus:border-studio-accent"
          />
          <button
            type="button"
            onClick={onClear}
            title="Clear output"
            className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-card transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand output' : 'Collapse output'}
              className="p-1 rounded text-studio-muted hover:text-studio-text hover:bg-studio-card transition-colors"
            >
              {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-[15px]">
          {visible.length === 0 ? (
            <div className="text-studio-muted/70 py-2">No messages yet.</div>
          ) : (
            visible.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 hover:bg-studio-card/40 px-1 rounded-[2px]">
                <span className="text-studio-muted/70 shrink-0">{entry.time}</span>
                <span className={`shrink-0 ${LEVEL_COLOR[entry.level]}`}>{entry.source}</span>
                <span className={`${LEVEL_COLOR[entry.level]} break-words`}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
