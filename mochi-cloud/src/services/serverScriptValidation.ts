// Server-side authority check for the server script and remote event manifest.
// Deliberately duplicated from the client contract so the two projects stay
// fully decoupled (no shared package imports).

const MAX_SERVER_SCRIPTS = 8;
const MAX_SERVER_SCRIPT_BYTES = 64 * 1024;
const MAX_REMOTE_EVENTS = 32;
const MAX_RATE_LIMIT = 120;

const RESERVED_EVENT_NAMES = new Set([
  'onserverevent',
  'onclientevent',
  'fireserver',
  'fireclient',
  'statereplicate',
  'script_rpc'
]);

const EVENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;

export interface ValidatedServerManifest {
  serverScripts: Array<{ id: string; name: string; code: string; enabled: boolean }>;
  remoteEvents: Array<{
    id: string;
    name: string;
    direction: 'toServer' | 'toClient';
    rateLimitPerSecond: number;
  }>;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateServerManifest(manifest: unknown): ValidatedServerManifest {
  const errors: string[] = [];
  const root = isRecord(manifest) ? manifest : {};

  const serverScripts: ValidatedServerManifest['serverScripts'] = [];
  const remoteEvents: ValidatedServerManifest['remoteEvents'] = [];

  const rawScripts = root.serverScripts;
  if (rawScripts !== undefined) {
    if (!Array.isArray(rawScripts)) {
      errors.push('serverScripts must be an array');
    } else {
      if (rawScripts.length > MAX_SERVER_SCRIPTS) {
        errors.push(`At most ${MAX_SERVER_SCRIPTS} server scripts are allowed`);
      }
      let totalBytes = 0;
      const seen = new Set<string>();
      rawScripts.slice(0, MAX_SERVER_SCRIPTS).forEach((entry, index) => {
        if (!isRecord(entry)) {
          errors.push(`serverScripts[${index}] must be an object`);
          return;
        }
        const code = typeof entry.code === 'string' ? entry.code : '';
        if (!code.trim()) {
          errors.push(`serverScripts[${index}] has empty code`);
          return;
        }
        const id =
          typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `server_script_${index}`;
        if (seen.has(id)) {
          errors.push(`Duplicate server script id "${id}"`);
          return;
        }
        seen.add(id);
        totalBytes += new TextEncoder().encode(code).length;
        serverScripts.push({
          id,
          name:
            typeof entry.name === 'string' && entry.name.trim()
              ? entry.name.trim().slice(0, 80)
              : `Script ${index + 1}`,
          code,
          enabled: entry.enabled !== false
        });
      });
      if (totalBytes > MAX_SERVER_SCRIPT_BYTES) {
        errors.push(
          `Server script payload ${totalBytes} bytes exceeds ${MAX_SERVER_SCRIPT_BYTES} bytes`
        );
      }
    }
  }

  const rawEvents = root.remoteEvents;
  if (rawEvents !== undefined) {
    if (!Array.isArray(rawEvents)) {
      errors.push('remoteEvents must be an array');
    } else {
      if (rawEvents.length > MAX_REMOTE_EVENTS) {
        errors.push(`At most ${MAX_REMOTE_EVENTS} remote events are allowed`);
      }
      const seenNames = new Set<string>();
      rawEvents.slice(0, MAX_REMOTE_EVENTS).forEach((entry, index) => {
        if (!isRecord(entry)) {
          errors.push(`remoteEvents[${index}] must be an object`);
          return;
        }
        const rawName = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!EVENT_NAME_PATTERN.test(rawName)) {
          errors.push(`remoteEvents[${index}]: invalid event name`);
          return;
        }
        const key = rawName.toLowerCase();
        if (RESERVED_EVENT_NAMES.has(key)) {
          errors.push(`remoteEvents[${index}]: "${rawName}" is a reserved name`);
          return;
        }
        if (seenNames.has(key)) {
          errors.push(`Duplicate remote event name "${rawName}"`);
          return;
        }
        seenNames.add(key);

        const rate = Number(entry.rateLimitPerSecond);
        remoteEvents.push({
          id:
            typeof entry.id === 'string' && entry.id.trim()
              ? entry.id.trim()
              : `remote_event_${index}`,
          name: rawName,
          direction: entry.direction === 'toClient' ? 'toClient' : 'toServer',
          rateLimitPerSecond: Number.isFinite(rate)
            ? Math.min(MAX_RATE_LIMIT, Math.max(1, Math.round(rate)))
            : 10
        });
      });
    }
  }

  return { serverScripts, remoteEvents, errors };
}
