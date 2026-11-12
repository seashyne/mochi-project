// Studio server authoring panel: edit authoritative server scripts and declare
// the remote event registry that gates client/server messaging.

import React, { useState } from 'react';
import { Code2, Plus, Radio, Trash2, ShieldAlert } from 'lucide-react';
import type { RemoteEventDef, ServerScript } from '../../engine/scripting/serverManifest';

export interface StudioServerScriptsPanelProps {
  serverScripts: ServerScript[];
  remoteEvents: RemoteEventDef[];
  errors: string[];
  onAddScript: () => void;
  onUpdateScript: (id: string, patch: Partial<ServerScript>) => void;
  onRemoveScript: (id: string) => void;
  onAddEvent: () => void;
  onUpdateEvent: (id: string, patch: Partial<RemoteEventDef>) => void;
  onRemoveEvent: (id: string) => void;
  onValidate: () => void;
}

export const StudioServerScriptsPanel: React.FC<StudioServerScriptsPanelProps> = ({
  serverScripts,
  remoteEvents,
  errors,
  onAddScript,
  onUpdateScript,
  onRemoveScript,
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  onValidate
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="p-3 rounded-xl bg-studio-panel border border-studio-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-studio-accent" />
          <h3 className="text-xs font-bold text-studio-text">Server Scripts</h3>
          <span className="text-[10px] font-mono text-studio-muted">{serverScripts.length}</span>
        </div>
        <button
          type="button"
          onClick={onAddScript}
          title="Add server script"
          className="p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {serverScripts.length === 0 ? (
        <p className="text-[10px] font-mono text-studio-muted">No server scripts yet.</p>
      ) : (
        <ul className="space-y-1">
          {serverScripts.map((script) => {
            const isOpen = expandedId === script.id;
            return (
              <li key={script.id} className="rounded-lg bg-studio-card/60 border border-studio-border">
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <input
                    type="checkbox"
                    checked={script.enabled}
                    onChange={(e) => onUpdateScript(script.id, { enabled: e.target.checked })}
                    title="Enabled"
                    className="accent-studio-accent"
                  />
                  <input
                    value={script.name}
                    onChange={(e) => onUpdateScript(script.id, { name: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-studio-text focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : script.id)}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono text-studio-muted hover:text-studio-text"
                  >
                    {isOpen ? 'hide' : 'code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveScript(script.id)}
                    className="p-1 rounded text-studio-muted hover:text-studio-danger"
                    title="Remove script"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {isOpen && (
                  <textarea
                    value={script.code}
                    onChange={(e) => onUpdateScript(script.id, { code: e.target.value })}
                    spellCheck={false}
                    rows={8}
                    className="w-full px-2 py-1.5 bg-studio-bg border-t border-studio-border text-[10px] leading-relaxed font-mono text-studio-text focus:outline-none resize-y"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-studio-border">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-studio-accent" />
          <h3 className="text-xs font-bold text-studio-text">Remote Events</h3>
          <span className="text-[10px] font-mono text-studio-muted">{remoteEvents.length}</span>
        </div>
        <button
          type="button"
          onClick={onAddEvent}
          title="Add remote event"
          className="p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {remoteEvents.length === 0 ? (
        <p className="text-[10px] font-mono text-studio-muted">No remote events declared.</p>
      ) : (
        <ul className="space-y-1">
          {remoteEvents.map((event) => (
            <li key={event.id} className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-studio-card/60">
              <input
                value={event.name}
                onChange={(e) => onUpdateEvent(event.id, { name: e.target.value })}
                className="flex-1 min-w-0 bg-transparent text-[10px] font-mono text-studio-text focus:outline-none"
              />
              <select
                value={event.direction}
                onChange={(e) =>
                  onUpdateEvent(event.id, { direction: e.target.value as RemoteEventDef['direction'] })
                }
                className="px-1 py-0.5 rounded bg-studio-bg border border-studio-border text-[9px] font-mono text-studio-muted"
              >
                <option value="toServer">to server</option>
                <option value="toClient">to client</option>
              </select>
              <input
                type="number"
                min={1}
                max={120}
                value={event.rateLimitPerSecond}
                onChange={(e) =>
                  onUpdateEvent(event.id, { rateLimitPerSecond: Number(e.target.value) })
                }
                title="Rate limit per second"
                className="w-10 px-1 py-0.5 rounded bg-studio-bg border border-studio-border text-[9px] font-mono text-studio-muted"
              />
              <button
                type="button"
                onClick={() => onRemoveEvent(event.id)}
                className="p-1 rounded text-studio-muted hover:text-studio-danger"
                title="Remove event"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul className="space-y-0.5 px-2 py-1.5 rounded-lg bg-studio-danger/10 border border-studio-danger/30">
          {errors.map((error) => (
            <li key={error} className="flex items-start gap-1 text-[9px] font-mono text-studio-danger">
              <ShieldAlert className="w-3 h-3 shrink-0 mt-[1px]" />
              <span>{error}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onValidate}
        className="w-full px-2 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[10px] font-mono text-studio-text hover:border-studio-muted"
      >
        Validate manifest
      </button>
    </div>
  );
};
