// Server script and remote event manifest contract. Pure data + validation so
// the Studio editor, the player runtime, and the Worker all agree on shape.

export type RemoteEventDirection = 'toServer' | 'toClient';

export interface ServerScript {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

export interface RemoteEventDef {
  id: string;
  name: string;
  direction: RemoteEventDirection;
  rateLimitPerSecond: number;
}

export const MAX_SERVER_SCRIPTS = 8;
export const MAX_SERVER_SCRIPT_BYTES = 64 * 1024;
export const MAX_REMOTE_EVENTS = 32;
export const DEFAULT_RATE_LIMIT = 10;
export const MAX_RATE_LIMIT = 120;
export const MAX_EVENT_PAYLOAD_BYTES = 8 * 1024;

const RESERVED_EVENT_NAMES = new Set([
  'onserverevent',
  'onclientevent',
  'fireserver',
  'fireclient',
  'statereplicate',
  'script_rpc'
]);

const EVENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;

export interface ValidationResult<T> {
  value: T;
  errors: string[];
}

export function validateRemoteEventName(name: unknown): string | null {
  if (typeof name !== 'string') return 'Event name must be a string';
  const trimmed = name.trim();
  if (!trimmed) return 'Event name is required';
  if (!EVENT_NAME_PATTERN.test(trimmed)) {
    return 'Event name must start with a letter and contain only letters, digits, or underscores (max 48)';
  }
  if (trimmed.startsWith('__')) return 'Event names cannot start with double underscore';
  if (RESERVED_EVENT_NAMES.has(trimmed.toLowerCase())) {
    return `Event name "${trimmed}" is reserved by the runtime`;
  }
  return null;
}

export function normalizeServerScripts(input: unknown): ValidationResult<ServerScript[]> {
  const errors: string[] = [];
  if (input === undefined || input === null) return { value: [], errors };
  if (!Array.isArray(input)) return { value: [], errors: ['serverScripts must be an array'] };
  if (input.length > MAX_SERVER_SCRIPTS) {
    errors.push(`At most ${MAX_SERVER_SCRIPTS} server scripts are allowed`);
  }

  const seenIds = new Set<string>();
  const value: ServerScript[] = [];

  input.slice(0, MAX_SERVER_SCRIPTS).forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`serverScripts[${index}] must be an object`);
      return;
    }
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `server_script_${index}`;
    if (seenIds.has(id)) {
      errors.push(`Duplicate server script id "${id}"`);
      return;
    }
    seenIds.add(id);

    const code = typeof raw.code === 'string' ? raw.code : '';
    if (!code.trim()) {
      errors.push(`serverScripts[${index}] has empty code`);
      return;
    }
    value.push({
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `Script ${index + 1}`,
      code,
      enabled: raw.enabled !== false
    });
  });

  const totalBytes = totalScriptBytes(value);
  if (totalBytes > MAX_SERVER_SCRIPT_BYTES) {
    errors.push(`Server script payload ${totalBytes} bytes exceeds ${MAX_SERVER_SCRIPT_BYTES} bytes`);
  }

  return { value, errors };
}

export function totalScriptBytes(scripts: ServerScript[]): number {
  const encoder = new TextEncoder();
  return scripts.reduce((sum, script) => sum + encoder.encode(script.code).length, 0);
}

export function normalizeRemoteEvents(input: unknown): ValidationResult<RemoteEventDef[]> {
  const errors: string[] = [];
  if (input === undefined || input === null) return { value: [], errors };
  if (!Array.isArray(input)) return { value: [], errors: ['remoteEvents must be an array'] };
  if (input.length > MAX_REMOTE_EVENTS) {
    errors.push(`At most ${MAX_REMOTE_EVENTS} remote events are allowed`);
  }

  const seenNames = new Set<string>();
  const value: RemoteEventDef[] = [];

  input.slice(0, MAX_REMOTE_EVENTS).forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`remoteEvents[${index}] must be an object`);
      return;
    }
    const raw = entry as Record<string, unknown>;
    const nameError = validateRemoteEventName(raw.name);
    if (nameError) {
      errors.push(`remoteEvents[${index}]: ${nameError}`);
      return;
    }
    const name = String(raw.name).trim();
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      errors.push(`Duplicate remote event name "${name}"`);
      return;
    }
    seenNames.add(key);

    const direction: RemoteEventDirection = raw.direction === 'toClient' ? 'toClient' : 'toServer';
    const rate = Number(raw.rateLimitPerSecond);
    value.push({
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `remote_event_${index}`,
      name,
      direction,
      rateLimitPerSecond: Number.isFinite(rate)
        ? Math.min(MAX_RATE_LIMIT, Math.max(1, Math.round(rate)))
        : DEFAULT_RATE_LIMIT
    });
  });

  return { value, errors };
}

export function normalizeServerManifest(input: unknown): {
  serverScripts: ServerScript[];
  remoteEvents: RemoteEventDef[];
  errors: string[];
} {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const scripts = normalizeServerScripts(raw.serverScripts);
  const events = normalizeRemoteEvents(raw.remoteEvents);
  return {
    serverScripts: scripts.value,
    remoteEvents: events.value,
    errors: [...scripts.errors, ...events.errors]
  };
}

export function serializeServerManifest(
  serverScripts: ServerScript[],
  remoteEvents: RemoteEventDef[]
): string {
  return JSON.stringify({ serverScripts, remoteEvents });
}
