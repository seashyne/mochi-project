// Pure collaborative-editing state machine for a studio draft. The DO owns one
// instance; every edit op funnels through applyOp which validates, mutates and
// stamps a monotonic version. Kept free of WebSocket/Cloudflare APIs so the
// conflict policy is unit-testable in plain Node.

export interface CollabObject {
  id: string;
  type: string;
  name?: string;
  parentId?: string | null;
  [key: string]: unknown;
}

export interface CollabManifest {
  objects: CollabObject[];
  [key: string]: unknown;
}

export type CollabOp =
  | { kind: 'add'; object: CollabObject }
  | { kind: 'remove'; ids: string[] }
  | { kind: 'update'; id: string; patch: Record<string, unknown> }
  | { kind: 'bulk'; ops: Exclude<CollabOp, { kind: 'bulk' }>[] }
  | { kind: 'manifest_patch'; fields: Record<string, unknown> };

export interface CollaboratorPresence {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: number;
}

/** Locks held while a collaborator drags a gizmo or sculpts terrain. */
export interface LockEntry {
  userId: string;
  username: string;
  ids: string[];
}

export interface CollabSnapshot {
  manifest: CollabManifest;
  version: number;
  collaborators: CollaboratorPresence[];
  locks: Record<string, LockEntry>;
}

const MAX_OBJECTS = 20000;
const MAX_OP_IDS = 500;

// Editors may co-author client-side content; only the owner may touch the
// server-authority declarations. Nothing here may replace the object array,
// because that would bypass the per-object lock policy.
const EDITOR_PATCH_FIELDS = new Set([
  'scriptCode', 'language', 'environment', 'version', 'animations', 'animationStateMachine'
]);
const OWNER_PATCH_FIELDS = new Set([
  ...EDITOR_PATCH_FIELDS,
  'serverScripts',
  'remoteEvents',
  'title'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnsafeKey(fields: Record<string, unknown>): boolean {
  return Object.keys(fields).some(
    (key) => key.startsWith('__') || key === 'constructor' || key === 'prototype'
  );
}

export class DraftCollabCore {
  private manifest: CollabManifest;
  private objectIndex = new Map<string, CollabObject>();
  private versionCounter = 0;
  private readonly collaborators = new Map<string, CollaboratorPresence>();
  private readonly locks = new Map<string, LockEntry>();
  private dirty = false;

  constructor(manifestJson: string) {
    const parsed = JSON.parse(manifestJson) as unknown;
    if (!isPlainObject(parsed) || !Array.isArray(parsed.objects)) {
      throw new Error('Draft manifest is malformed');
    }
    this.manifest = parsed as CollabManifest;
    this.reindex();
  }

  private reindex(): void {
    this.objectIndex.clear();
    for (const object of this.manifest.objects) {
      this.objectIndex.set(object.id, object);
    }
  }

  getVersion(): number {
    return this.versionCounter;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  getObjects(): CollabObject[] {
    return this.manifest.objects;
  }

  getLocks(): Record<string, LockEntry> {
    const snapshot: Record<string, LockEntry> = {};
    for (const [userId, entry] of this.locks) snapshot[userId] = entry;
    return snapshot;
  }

  getCollaborators(): CollaboratorPresence[] {
    return Array.from(this.collaborators.values());
  }

  setPresence(presence: CollaboratorPresence): void {
    this.collaborators.set(presence.userId, presence);
  }

  dropPresence(userId: string): void {
    this.collaborators.delete(userId);
    this.releaseLocks(userId);
  }

  setLock(userId: string, username: string, ids: string[]): void {
    if (ids.length === 0) return;
    this.locks.set(userId, { userId, username, ids: ids.slice(0, MAX_OP_IDS) });
  }

  releaseLocks(userId: string): void {
    this.locks.delete(userId);
  }

  /** Lock holder for a given object id, excluding the user themselves. */
  lockHolderFor(objectId: string, exceptUserId: string): LockEntry | null {
    for (const entry of this.locks.values()) {
      if (entry.userId !== exceptUserId && entry.ids.includes(objectId)) return entry;
    }
    return null;
  }

  serializeManifest(): string {
    return JSON.stringify(this.manifest);
  }

  snapshot(): CollabSnapshot {
    return {
      manifest: JSON.parse(this.serializeManifest()) as CollabManifest,
      version: this.versionCounter,
      collaborators: this.getCollaborators(),
      locks: this.getLocks()
    };
  }

  /**
   * Applies an op from `sender`. Returns { ok: true } when the op mutated
   * state (version bumped); a rejection reason otherwise. Lock policy: an
   * editor may not update or remove an object another collaborator holds.
   */
  applyOp(op: CollabOp, sender: CollaboratorPresence): { ok: boolean; reason?: string } {
    if (!isPlainObject(op)) return { ok: false, reason: 'op must be an object' };
    if (sender.role === 'viewer') return { ok: false, reason: 'viewers cannot edit' };
    return this.applyInner(op, sender);
  }

  private applyInner(op: CollabOp, sender: CollaboratorPresence): { ok: boolean; reason?: string } {
    switch (op.kind) {
      case 'add': {
        if (!isPlainObject(op.object) || typeof op.object.id !== 'string' || !op.object.id) {
          return { ok: false, reason: 'add requires an object with a string id' };
        }
        if (this.objectIndex.has(op.object.id)) {
          return { ok: false, reason: `duplicate object id ${op.object.id}` };
        }
        if (this.manifest.objects.length >= MAX_OBJECTS) {
          return { ok: false, reason: 'object ceiling reached' };
        }
        this.manifest.objects.push(op.object);
        this.objectIndex.set(op.object.id, op.object);
        return this.bump();
      }
      case 'remove': {
        if (!Array.isArray(op.ids) || op.ids.length === 0 || op.ids.length > MAX_OP_IDS) {
          return { ok: false, reason: 'invalid remove ids' };
        }
        const doomed = new Set<string>();
        for (const id of op.ids) {
          if (!this.objectIndex.has(id)) continue;
          if (this.lockHolderFor(id, sender.userId)) {
            return { ok: false, reason: `object ${id} is locked by another editor` };
          }
          doomed.add(id);
        }
        if (doomed.size === 0) return { ok: false, reason: 'no matching objects' };
        this.manifest.objects = this.manifest.objects.filter((o) => !doomed.has(o.id));
        this.reindex();
        return this.bump();
      }
      case 'update': {
        const target = this.objectIndex.get(op.id);
        if (!target) return { ok: false, reason: `unknown object ${op.id}` };
        if (this.lockHolderFor(op.id, sender.userId)) {
          return { ok: false, reason: `object ${op.id} is locked by another editor` };
        }
        if (!isPlainObject(op.patch) || hasUnsafeKey(op.patch)) {
          return { ok: false, reason: 'patch must be a safe object' };
        }
        if ('id' in op.patch) delete op.patch.id;
        Object.assign(target, op.patch);
        return this.bump();
      }
      case 'bulk': {
        if (!Array.isArray(op.ops) || op.ops.length === 0 || op.ops.length > MAX_OP_IDS) {
          return { ok: false, reason: 'invalid bulk ops' };
        }
        const nested = op.ops.some((inner) => {
          const raw = inner as unknown as Record<string, unknown>;
          return !isPlainObject(raw) || raw.kind === 'bulk';
        });
        if (nested) return { ok: false, reason: 'bulk ops cannot nest' };
        let applied = 0;
        for (const inner of op.ops) {
          const result = this.applyInner(inner, sender);
          if (result.ok) applied += 1;
        }
        return applied > 0 ? { ok: true } : { ok: false, reason: 'bulk applied nothing' };
      }
      case 'manifest_patch': {
        if (!isPlainObject(op.fields) || hasUnsafeKey(op.fields)) {
          return { ok: false, reason: 'fields must be a safe object' };
        }
        const allowed = sender.role === 'owner' ? OWNER_PATCH_FIELDS : EDITOR_PATCH_FIELDS;
        const denied = Object.keys(op.fields).find((key) => !allowed.has(key));
        if (denied) return { ok: false, reason: `field ${denied} is not patchable by ${sender.role}` };
        for (const [key, value] of Object.entries(op.fields)) {
          this.manifest[key] = value;
        }
        return this.bump();
      }
      default:
        return { ok: false, reason: 'unsupported op kind' };
    }
  }

  private bump(): { ok: true } {
    this.versionCounter += 1;
    this.dirty = true;
    return { ok: true };
  }
}
