// Studio server-authoring state: server scripts plus the remote event registry,
// with manifest coercion and validation on demand.

import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_RATE_LIMIT,
  normalizeServerManifest,
  normalizeRemoteEvents,
  normalizeServerScripts,
  type RemoteEventDef,
  type ServerScript
} from '../../engine/scripting/serverManifest';

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`;
}

export interface ServerManifestController {
  serverScripts: ServerScript[];
  remoteEvents: RemoteEventDef[];
  errors: string[];
  addScript: () => string;
  updateScript: (id: string, patch: Partial<ServerScript>) => void;
  removeScript: (id: string) => void;
  addEvent: () => string;
  updateEvent: (id: string, patch: Partial<RemoteEventDef>) => void;
  removeEvent: (id: string) => void;
  replaceManifest: (manifest: unknown) => void;
  validate: () => string[];
}

const STARTER_SERVER_SCRIPT = `-- Server authoritative script
players.PlayerAdded.Connect(function(player)
  print("Joined: " .. player.name)
  player.setReplicatedState("score", 0)
end)`;

export function useServerManifest(initial?: unknown): ServerManifestController {
  const initialManifest = useMemo(() => normalizeServerManifest(initial), [initial]);
  const [serverScripts, setServerScripts] = useState<ServerScript[]>(initialManifest.serverScripts);
  const [remoteEvents, setRemoteEvents] = useState<RemoteEventDef[]>(initialManifest.remoteEvents);
  const [errors, setErrors] = useState<string[]>([]);

  const addScript = useCallback(() => {
    const id = nextId('server_script');
    setServerScripts((prev) => [
      ...prev,
      { id, name: `ServerScript${prev.length + 1}`, code: STARTER_SERVER_SCRIPT, enabled: true }
    ]);
    return id;
  }, []);

  const updateScript = useCallback((id: string, patch: Partial<ServerScript>) => {
    setServerScripts((prev) => prev.map((script) => (script.id === id ? { ...script, ...patch } : script)));
  }, []);

  const removeScript = useCallback((id: string) => {
    setServerScripts((prev) => prev.filter((script) => script.id !== id));
  }, []);

  const addEvent = useCallback(() => {
    const id = nextId('remote_event');
    setRemoteEvents((prev) => [
      ...prev,
      {
        id,
        name: `RemoteEvent${prev.length + 1}`,
        direction: 'toServer',
        rateLimitPerSecond: DEFAULT_RATE_LIMIT
      }
    ]);
    return id;
  }, []);

  const updateEvent = useCallback((id: string, patch: Partial<RemoteEventDef>) => {
    setRemoteEvents((prev) => prev.map((event) => (event.id === id ? { ...event, ...patch } : event)));
  }, []);

  const removeEvent = useCallback((id: string) => {
    setRemoteEvents((prev) => prev.filter((event) => event.id !== id));
  }, []);

  const replaceManifest = useCallback((manifest: unknown) => {
    const normalized = normalizeServerManifest(manifest);
    setServerScripts(normalized.serverScripts);
    setRemoteEvents(normalized.remoteEvents);
    setErrors([]);
  }, []);

  const validate = useCallback(() => {
    const scriptResult = normalizeServerScripts(serverScripts);
    const eventResult = normalizeRemoteEvents(remoteEvents);
    const nextErrors = [...scriptResult.errors, ...eventResult.errors];
    setErrors(nextErrors);
    return nextErrors;
  }, [serverScripts, remoteEvents]);

  return {
    serverScripts,
    remoteEvents,
    errors,
    addScript,
    updateScript,
    removeScript,
    addEvent,
    updateEvent,
    removeEvent,
    replaceManifest,
    validate
  };
}
