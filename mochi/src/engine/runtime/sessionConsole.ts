// Structured session output for scripts: entries with source/level plus the script
// sources themselves, so the terminal can show code and highlight failing lines.

import type { LogMeta } from './types';

export type ConsoleLevel = 'info' | 'warn' | 'error';

export interface ConsoleEntry {
  id: string;
  level: ConsoleLevel;
  message: string;
  source?: string;
  timestamp: number;
  code?: string;
  line?: number;
}

export interface ConsoleScript {
  source: string;
  code: string;
}

export interface ConsoleSnapshot {
  entries: ConsoleEntry[];
  scripts: ConsoleScript[];
  /** Whether a live runtime is attached and can execute ad-hoc Lua. */
  canExecute: boolean;
}

export type CommandHandler = (code: string) => void | Promise<void>;

const MAX_ENTRIES = 300;
const EMPTY_SNAPSHOT: ConsoleSnapshot = { entries: [], scripts: [], canExecute: false };

/** Wasmoon reports errors as `[string "..."]:12: ...`; extract the line. */
export function parseLuaErrorLine(message: string): number | undefined {
  const match = message.match(/\[string\s+[^\]]*\]:(\d+)/) ?? message.match(/:(\d+):/);
  if (!match) return undefined;
  const line = Number(match[1]);
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

export class SessionConsole {
  private snapshot: ConsoleSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private commandHandler: CommandHandler | null = null;
  private sequence = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConsoleSnapshot => this.snapshot;

  push(level: ConsoleLevel, message: string, source?: string, meta?: LogMeta): void {
    this.sequence += 1;
    const entry: ConsoleEntry = {
      id: `entry_${this.sequence}`,
      level,
      message: String(message ?? ''),
      source,
      timestamp: Date.now(),
      code: meta?.code,
      line: meta?.line ?? parseLuaErrorLine(String(message ?? ''))
    };
    const entries = [...this.snapshot.entries, entry].slice(-MAX_ENTRIES);
    this.snapshot = { ...this.snapshot, entries };
    this.emit();
  }

  /** Registers (or refreshes) a script so the Code tab can show it. */
  registerScript(source: string, code: string): void {
    if (!code.trim()) return;
    const scripts = this.snapshot.scripts.filter((script) => script.source !== source);
    scripts.push({ source, code });
    this.snapshot = { ...this.snapshot, scripts };
    this.emit();
  }

  /** Attaches the live runtime that ad-hoc commands are forwarded to. */
  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
    this.snapshot = { ...this.snapshot, canExecute: true };
    this.emit();
  }

  clearCommandHandler(): void {
    this.commandHandler = null;
    this.snapshot = { ...this.snapshot, canExecute: false };
    this.emit();
  }

  runCommand(code: string): void | Promise<void> {
    return this.commandHandler?.(code);
  }

  clear(): void {
    if (this.snapshot.entries.length === 0) return;
    this.snapshot = { ...this.snapshot, entries: [] };
    this.emit();
  }

  dispose(): void {
    this.listeners.clear();
    this.commandHandler = null;
    this.snapshot = EMPTY_SNAPSHOT;
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('SessionConsole listener failed:', err);
      }
    });
  }
}
