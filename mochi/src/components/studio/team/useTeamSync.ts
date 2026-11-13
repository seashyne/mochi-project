// Live document convergence for Team Create.
//
// Local object changes are diffed into ops and sent to the Durable Object.
// Remote ops are folded into the local object list through a silent document
// replace, tagged as a remote snapshot so the diff effect never echoes them
// back. A version gap or a rejected op triggers a full resync.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioObject } from '@/engine/studio/types';
import type { MochiAnimationClip } from '@/engine/animation/clip';
import type { AnimStateMachineDef } from '@/engine/animation/stateMachine';
import {
  getTeamWebSocketUrl,
  TeamAwareness,
  TeamCollaborator,
  TeamLock
} from '@/api/studioTeam';
import { TeamConnectionStatus, TeamCreateClient } from './TeamCreateClient';
import {
  ALLOWED_MANIFEST_PATCH_KEYS,
  applyTeamOp,
  chunkOps,
  diffManifestFields,
  diffObjects,
  TeamOp
} from './teamOps';

export interface TeamSyncOptions {
  draftId: string | null;
  token: string | null;
  enabled: boolean;
  selfId: string | null;
  objects: StudioObject[];
  scriptCode: string;
  environment: unknown;
  animations: MochiAnimationClip[];
  animationStateMachine: AnimStateMachineDef | null;
  selectedIds: string[];
  onRemoteObjects: (objects: StudioObject[]) => void;
  onRemoteFields: (fields: Record<string, unknown>) => void;
  onSaved: () => void;
}

export interface TeamSyncApi {
  status: TeamConnectionStatus;
  version: number;
  error: string | null;
  collaborators: TeamCollaborator[];
  locks: Record<string, TeamLock>;
  awareness: Record<string, TeamAwareness>;
  save: () => void;
  resync: () => void;
  /** Marks a REST-loaded snapshot as authoritative so it is not echoed as an edit. */
  markExternalSnapshot: (objects: StudioObject[]) => void;
  markExternalFields: (fields: Fields) => void;
}

type Fields = Record<string, unknown>;

function asRecord(value: unknown): Fields {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function asCollaborators(value: unknown): TeamCollaborator[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => asRecord(entry).userId).map((entry) => {
    const row = asRecord(entry);
    const role = row.role === 'owner' || row.role === 'editor' ? row.role : 'viewer';
    return {
      userId: String(row.userId),
      username: String(row.username || 'Creator'),
      role,
      joinedAt: Number(row.joinedAt) || 0
    };
  });
}

function asLocks(value: unknown): Record<string, TeamLock> {
  const result: Record<string, TeamLock> = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    const row = asRecord(entry);
    result[key] = {
      userId: String(row.userId || key),
      username: String(row.username || 'Creator'),
      ids: asStringArray(row.ids)
    };
  }
  return result;
}

function pickFields(manifest: Fields): Fields {
  const fields: Fields = {};
  for (const key of ALLOWED_MANIFEST_PATCH_KEYS) {
    if (key in manifest) fields[key] = manifest[key];
  }
  return fields;
}

export function useTeamSync(options: TeamSyncOptions): TeamSyncApi {
  const [status, setStatus] = useState<TeamConnectionStatus>('idle');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<TeamCollaborator[]>([]);
  const [locks, setLocks] = useState<Record<string, TeamLock>>({});
  const [awareness, setAwareness] = useState<Record<string, TeamAwareness>>({});

  const callbacks = useRef(options);
  callbacks.current = options;
  const objectsRef = useRef(options.objects);
  const fieldsRef = useRef<Fields>({
    scriptCode: options.scriptCode, language: 'lua', environment: options.environment,
    animations: options.animations, animationStateMachine: options.animationStateMachine
  });
  const lastObjectsRef = useRef(options.objects);
  const lastFieldsRef = useRef<Fields>(fieldsRef.current);
  const remoteSnapshots = useRef(new Set<StudioObject[]>());
  const clientRef = useRef<TeamCreateClient | null>(null);
  const versionRef = useRef(0);
  const selectionRef = useRef<string[]>(options.selectedIds);
  const environmentKey = useMemo(() => JSON.stringify(options.environment ?? null), [options.environment]);

  const applySnapshot = useCallback((objects: StudioObject[], manifest: Fields) => {
    objectsRef.current = objects;
    remoteSnapshots.current.add(objects);
    callbacks.current.onRemoteObjects(objects);
    const fields = pickFields(manifest);
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    lastFieldsRef.current = { ...fieldsRef.current };
    if (Object.keys(fields).length > 0) callbacks.current.onRemoteFields(fields);
  }, []);

  const handleMessage = useCallback((message: Fields) => {
    const client = clientRef.current;
    switch (message.type) {
      case 'init': {
        const state = asRecord(message.state);
        const manifest = asRecord(state.manifest);
        const objects = Array.isArray(manifest.objects) ? manifest.objects as StudioObject[] : [];
        versionRef.current = Number(state.version) || 0;
        setVersion(versionRef.current);
        setCollaborators(asCollaborators(state.collaborators));
        setLocks(asLocks(state.locks));
        setError(null);
        applySnapshot(objects, manifest);
        client?.send({ kind: 'awareness', selectedIds: selectionRef.current });
        break;
      }
      case 'op': {
        const nextVersion = Number(message.version) || 0;
        if (versionRef.current > 0 && nextVersion !== versionRef.current + 1) {
          client?.send({ kind: 'resync' });
        }
        versionRef.current = nextVersion;
        setVersion(nextVersion);
        const origin = typeof message.origin === 'string' ? message.origin : '';
        if (origin && origin === callbacks.current.selfId) break;
        const op = asRecord(message.op) as unknown as TeamOp;
        if (typeof op.kind !== 'string') break;
        const next = applyTeamOp(objectsRef.current, op);
        if (next !== objectsRef.current) {
          objectsRef.current = next;
          remoteSnapshots.current.add(next);
          callbacks.current.onRemoteObjects(next);
        }
        if (op.kind === 'manifest_patch') {
          const fields = pickFields(asRecord(op.fields));
          fieldsRef.current = { ...fieldsRef.current, ...fields };
          lastFieldsRef.current = { ...fieldsRef.current };
          if (Object.keys(fields).length > 0) callbacks.current.onRemoteFields(fields);
        }
        break;
      }
      case 'presence': setCollaborators(asCollaborators(message.collaborators)); break;
      case 'locks': setLocks(asLocks(message.locks)); break;
      case 'awareness': {
        const userId = String(message.userId || '');
        if (!userId) break;
        setAwareness((prev) => ({
          ...prev,
          [userId]: {
            userId,
            username: String(message.username || 'Creator'),
            selectedIds: asStringArray(message.selectedIds)
          }
        }));
        break;
      }
      case 'saved': callbacks.current.onSaved(); break;
      case 'error': {
        setError(String(message.message || 'The room rejected an edit'));
        client?.send({ kind: 'resync' });
        break;
      }
      default: break;
    }
  }, [applySnapshot]);

  // Local object edits become ops; remote snapshots are absorbed silently.
  useEffect(() => {
    objectsRef.current = options.objects;
    if (remoteSnapshots.current.has(options.objects)) {
      remoteSnapshots.current.delete(options.objects);
      lastObjectsRef.current = options.objects;
      return;
    }
    const ops = diffObjects(lastObjectsRef.current, options.objects);
    lastObjectsRef.current = options.objects;
    const client = clientRef.current;
    if (ops.length === 0 || !client?.isOpen()) return;
    for (const chunk of chunkOps(ops)) client.send({ kind: 'op', op: { kind: 'bulk', ops: chunk } });
  }, [options.objects]);

  // Script, environment, clips and the state graph are patchable manifest fields.
  useEffect(() => {
    const next: Fields = {
      scriptCode: options.scriptCode, language: 'lua', environment: options.environment,
      animations: options.animations, animationStateMachine: options.animationStateMachine
    };
    fieldsRef.current = next;
    const fields = diffManifestFields(lastFieldsRef.current, next);
    lastFieldsRef.current = next;
    if (Object.keys(fields).length === 0) return;
    clientRef.current?.send({ kind: 'op', op: { kind: 'manifest_patch', fields } });
    // environmentKey keeps the effect stable when the object is re-created.
  }, [options.scriptCode, environmentKey, options.animations, options.animationStateMachine]);

  // Selection doubles as an object lock so two editors cannot fight a drag.
  useEffect(() => {
    selectionRef.current = options.selectedIds;
    const client = clientRef.current;
    if (!client?.isOpen()) return;
    const ids = options.selectedIds.slice(0, 200);
    if (ids.length === 0) client.send({ kind: 'unlock' });
    else client.send({ kind: 'lock', ids });
    client.send({ kind: 'awareness', selectedIds: ids });
  }, [options.selectedIds]);

  useEffect(() => {
    if (!options.enabled || !options.draftId || !options.token) {
      setStatus('closed');
      return undefined;
    }
    lastObjectsRef.current = objectsRef.current;
    lastFieldsRef.current = { ...fieldsRef.current };
    versionRef.current = 0;
    const client = new TeamCreateClient({
      url: getTeamWebSocketUrl(options.draftId, options.token),
      onMessage: handleMessage,
      onStatus: setStatus
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
      setCollaborators([]);
      setLocks({});
      setAwareness({});
      setStatus('closed');
    };
  }, [options.enabled, options.draftId, options.token, handleMessage]);

  const save = useCallback(() => { clientRef.current?.send({ kind: 'save' }); }, []);
  const resync = useCallback(() => { clientRef.current?.send({ kind: 'resync' }); }, []);
  const markExternalSnapshot = useCallback((objects: StudioObject[]) => {
    remoteSnapshots.current.add(objects);
  }, []);
  const markExternalFields = useCallback((fields: Fields) => {
    fieldsRef.current = { ...fieldsRef.current, ...fields };
    lastFieldsRef.current = { ...fieldsRef.current };
  }, []);

  return {
    status, version, error, collaborators, locks, awareness,
    save, resync, markExternalSnapshot, markExternalFields
  };
}
