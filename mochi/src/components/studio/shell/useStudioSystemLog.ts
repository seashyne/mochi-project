// Studio output log: a bounded, timestamped message buffer shared by the chrome,
// the script runner and the draft loader.

import { useCallback, useRef, useState } from 'react';

export type StudioLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface StudioLogEntry {
  id: string;
  time: string;
  level: StudioLogLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 200;

function stamp(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export interface StudioSystemLogApi {
  logs: StudioLogEntry[];
  push: (level: StudioLogLevel, source: string, message: string) => void;
  clear: () => void;
}

export function useStudioSystemLog(seed: Omit<StudioLogEntry, 'id' | 'time'>[] = []): StudioSystemLogApi {
  const counter = useRef(0);
  const [logs, setLogs] = useState<StudioLogEntry[]>(() =>
    seed.slice(-MAX_ENTRIES).map((entry) => {
      counter.current += 1;
      return { ...entry, id: `log_${counter.current}`, time: stamp() };
    })
  );

  const push = useCallback((level: StudioLogLevel, source: string, message: string) => {
    counter.current += 1;
    const entry: StudioLogEntry = {
      id: `log_${counter.current}`,
      time: stamp(),
      level,
      source,
      message
    };
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, push, clear };
}
