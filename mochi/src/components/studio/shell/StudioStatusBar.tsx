// Bottom status bar: the command line plus the live scene readout.

import React, { useState } from 'react';
import { Terminal } from 'lucide-react';

export interface StudioStatusBarProps {
  partCount: number;
  selectionLabel: string | null;
  clockLabel: string;
  skyLabel: string;
  isDirty: boolean;
  lastSavedAt?: string | null;
  onCommand: (command: string) => void;
}

export const StudioStatusBar: React.FC<StudioStatusBarProps> = ({
  partCount,
  selectionLabel,
  clockLabel,
  skyLabel,
  isDirty,
  lastSavedAt = null,
  onCommand
}) => {
  const [command, setCommand] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    onCommand(value);
    setCommand('');
  };

  return (
    <div className="flex items-center gap-3 h-6 px-2 bg-studio-ribbon border-t border-studio-border shrink-0">
      <form onSubmit={submit} className="flex items-center gap-1.5 flex-1 min-w-0">
        <Terminal className="w-3 h-3 text-studio-muted shrink-0" />
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Execute a command with Ctrl+/ - try: play, save, clear, select all"
          className="w-full bg-transparent text-[10px] font-mono text-studio-text placeholder:text-studio-muted/70 focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-3 text-[10px] font-mono text-studio-muted shrink-0">
        {selectionLabel && <span className="text-studio-accent truncate max-w-[180px]">{selectionLabel}</span>}
        <span>{partCount} parts</span>
        <span className="text-studio-warning">{clockLabel}</span>
        <span className="hidden sm:inline">{skyLabel}</span>
        <span className={isDirty ? 'text-studio-warning' : 'text-studio-success'}>
          {isDirty ? 'Unsaved' : lastSavedAt ? `Saved ${lastSavedAt}` : 'Saved'}
        </span>
      </div>
    </div>
  );
};
