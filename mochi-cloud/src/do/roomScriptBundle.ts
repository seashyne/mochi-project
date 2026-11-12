// Resolves the server-side script bundle for a published game and loads it into
// a room's Lua runtime. The bundle is cached in Durable Object storage so a room
// that restarts does not re-read the manifest from D1.

import type { MochiEnv } from '../types/env';
import type { ServerLuaRuntime } from '../services/serverLua';

export interface RoomScriptBundle {
  versionId: string;
  code: string;
  events: string[];
}

interface ScriptEntry {
  id?: string;
  name?: string;
  code?: string;
  enabled?: boolean;
}

interface EventEntry {
  name?: string;
  direction?: string;
}

const CACHE_PREFIX = 'script_bundle:';

/** Extracts enabled server scripts and the toServer event registry from a manifest. */
export function extractScriptBundle(versionId: string, manifestJson: string): RoomScriptBundle | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;

  const scripts = Array.isArray(root.serverScripts) ? (root.serverScripts as ScriptEntry[]) : [];
  const code = scripts
    .filter((entry) => entry && typeof entry.code === 'string' && entry.enabled !== false)
    .map((entry) => `-- ${entry.name || entry.id || 'server script'}\n${entry.code}`)
    .join('\n\n');

  const events = (Array.isArray(root.remoteEvents) ? (root.remoteEvents as EventEntry[]) : [])
    .filter((entry) => entry && typeof entry.name === 'string')
    .filter((entry) => entry.direction === undefined || entry.direction === 'toServer')
    .map((entry) => entry.name as string);

  if (!code.trim()) return null;
  return { versionId, code, events };
}

export async function fetchScriptBundle(
  env: MochiEnv,
  gameId: string
): Promise<RoomScriptBundle | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT v.id AS version_id, v.manifest_json
       FROM games g
       JOIN game_versions v ON v.id = g.current_version_id
      WHERE g.id = ? AND g.status = 'published'`
  )
    .bind(gameId)
    .first<{ version_id: string; manifest_json: string }>();

  if (!row) return null;
  return extractScriptBundle(row.version_id, row.manifest_json);
}

/** Cheap pointer read so a republished game invalidates the cached bundle. */
export async function fetchCurrentVersionId(
  env: MochiEnv,
  gameId: string
): Promise<string | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT current_version_id FROM games WHERE id = ? AND status = 'published'`
  )
    .bind(gameId)
    .first<{ current_version_id: string | null }>();
  return row?.current_version_id ?? null;
}

type BundleStorage = DurableObjectStorage | undefined;

async function readCachedBundle(storage: BundleStorage, key: string): Promise<RoomScriptBundle | null> {
  if (!storage || typeof storage.get !== 'function') return null;
  try {
    return (await storage.get<RoomScriptBundle>(key)) ?? null;
  } catch {
    return null;
  }
}

async function writeCachedBundle(storage: BundleStorage, key: string, bundle: RoomScriptBundle): Promise<void> {
  if (!storage || typeof storage.put !== 'function') return;
  try {
    await storage.put(key, bundle);
  } catch {
    // Cache failures are non-fatal: the next connection re-reads D1.
  }
}

export interface RoomScriptResult {
  status: 'loaded' | 'cached' | 'none' | 'error';
  versionId?: string;
  handlers?: string[];
  error?: string;
}

/**
 * Loads the published script bundle into the room runtime. The cache is keyed by
 * game and validated against `current_version_id`, so republishing takes effect
 * on the next room start. Returns `none` when the game has no server scripts.
 */
export async function ensureRoomScript(
  env: MochiEnv,
  storage: BundleStorage,
  runtime: ServerLuaRuntime,
  gameId: string
): Promise<RoomScriptResult> {
  const key = CACHE_PREFIX + gameId;

  let currentVersion: string | null = null;
  try {
    currentVersion = await fetchCurrentVersionId(env, gameId);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  if (!currentVersion) return { status: 'none' };

  const cached = await readCachedBundle(storage, key);
  if (cached && cached.versionId === currentVersion) {
    return applyBundle(runtime, cached, 'cached');
  }

  let bundle: RoomScriptBundle | null = null;
  try {
    bundle = await fetchScriptBundle(env, gameId);
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  if (!bundle) return { status: 'none' };

  await writeCachedBundle(storage, key, bundle);
  return applyBundle(runtime, bundle, 'loaded');
}

async function applyBundle(
  runtime: ServerLuaRuntime,
  bundle: RoomScriptBundle,
  status: 'loaded' | 'cached'
): Promise<RoomScriptResult> {
  runtime.setEventAllowlist(bundle.events);
  const result = await runtime.loadScript(bundle.code);
  if (!result.success) {
    return { status: 'error', error: result.error, versionId: bundle.versionId };
  }
  return {
    status,
    versionId: bundle.versionId,
    handlers: runtime.getHandlerNames()
  };
}
