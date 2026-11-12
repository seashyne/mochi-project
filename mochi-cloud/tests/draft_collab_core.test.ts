// Pure collaborative state machine: server-authority guardrails, object locks
// and manifest patch permissions for Team Create Durable Objects.

import { describe, it, expect } from 'vitest';
import {
  CollabOp,
  CollaboratorPresence,
  DraftCollabCore
} from '../src/do/draftCollabCore';

const MANIFEST = JSON.stringify({
  title: 'Original',
  objects: [
    { id: 'a', type: 'block', name: 'A', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', type: 'coin', name: 'B', position: { x: 1, y: 0, z: 0 } }
  ],
  scriptCode: 'print(1)',
  serverScripts: []
});

const owner: CollaboratorPresence = {
  userId: 'owner', username: 'Owner', role: 'owner', joinedAt: 1
};
const editor: CollaboratorPresence = {
  userId: 'editor', username: 'Editor', role: 'editor', joinedAt: 2
};
const viewer: CollaboratorPresence = {
  userId: 'viewer', username: 'Viewer', role: 'viewer', joinedAt: 3
};

function core(): DraftCollabCore {
  return new DraftCollabCore(MANIFEST);
}

function asOp(value: unknown): CollabOp {
  return value as CollabOp;
}

describe('DraftCollabCore', () => {
  it('rejects malformed manifests and non-object ops', () => {
    expect(() => new DraftCollabCore('{"title":"no objects"}')).toThrow(/malformed/);
    expect(() => new DraftCollabCore('[]')).toThrow(/malformed/);
    const room = core();
    expect(room.applyOp(asOp(null), editor).ok).toBe(false);
    expect(room.applyOp(asOp('add'), editor).ok).toBe(false);
    expect(room.applyOp(asOp({ kind: 'unknown' }), editor).ok).toBe(false);
    expect(room.getVersion()).toBe(0);
  });

  it('applies add, update, remove and bulk ops with a monotonic version', () => {
    const room = core();
    expect(room.applyOp({ kind: 'add', object: { id: 'c', type: 'sphere' } }, editor).ok).toBe(true);
    expect(room.applyOp({ kind: 'update', id: 'a', patch: { name: 'Renamed' } }, editor).ok).toBe(true);
    expect(room.applyOp({ kind: 'remove', ids: ['b'] }, editor).ok).toBe(true);
    expect(room.getVersion()).toBe(3);
    expect(room.isDirty()).toBe(true);
    expect(room.getObjects().map((o) => o.id)).toEqual(['a', 'c']);
    expect(room.getObjects()[0].name).toBe('Renamed');

    room.clearDirty();
    expect(room.isDirty()).toBe(false);
    const bulk = room.applyOp({
      kind: 'bulk',
      ops: [
        { kind: 'add', object: { id: 'd', type: 'block' } },
        { kind: 'update', id: 'c', patch: { name: 'C' } }
      ]
    }, editor);
    expect(bulk.ok).toBe(true);
    expect(room.getVersion()).toBe(5);
  });

  it('rejects duplicate ids, missing targets and nested bulk ops', () => {
    const room = core();
    expect(room.applyOp({ kind: 'add', object: { id: 'a', type: 'block' } }, editor).reason)
      .toMatch(/duplicate/);
    expect(room.applyOp({ kind: 'add', object: {} as never }, editor).ok).toBe(false);
    expect(room.applyOp({ kind: 'update', id: 'missing', patch: { name: 'x' } }, editor).reason)
      .toMatch(/unknown object/);
    expect(room.applyOp({ kind: 'remove', ids: ['missing'] }, editor).reason)
      .toMatch(/no matching objects/);
    expect(room.applyOp(asOp({
      kind: 'bulk',
      ops: [{ kind: 'bulk', ops: [{ kind: 'remove', ids: ['a'] }] }]
    }), editor).reason).toMatch(/cannot nest/);
    expect(room.getVersion()).toBe(0);
  });

  it('forbids viewers from editing anything', () => {
    const room = core();
    expect(room.applyOp({ kind: 'remove', ids: ['a'] }, viewer).reason).toMatch(/viewers/);
    expect(room.applyOp({ kind: 'manifest_patch', fields: { scriptCode: 'x' } }, viewer).ok)
      .toBe(false);
    expect(room.getVersion()).toBe(0);
  });

  it('restricts manifest patches by role and never replaces the object array', () => {
    const room = core();
    expect(room.applyOp({
      kind: 'manifest_patch', fields: { scriptCode: 'print(2)', language: 'lua' }
    }, editor).ok).toBe(true);
    expect(JSON.parse(room.serializeManifest()).scriptCode).toBe('print(2)');

    const denied = room.applyOp({
      kind: 'manifest_patch', fields: { title: 'Hijacked' }
    }, editor);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/not patchable by editor/);
    expect(room.applyOp({
      kind: 'manifest_patch', fields: { objects: [] }
    }, editor).ok).toBe(false);
    expect(room.applyOp({
      kind: 'manifest_patch', fields: { serverScripts: [{ name: 'x' }] }
    }, editor).ok).toBe(false);

    expect(room.applyOp({
      kind: 'manifest_patch', fields: { title: 'Owner title', remoteEvents: [] }
    }, owner).ok).toBe(true);
    expect(JSON.parse(room.serializeManifest()).title).toBe('Owner title');
  });

  it('blocks prototype-pollution keys and keeps object ids immutable', () => {
    const room = core();
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const fields = JSON.parse(`{"${key}":{}}`) as Record<string, unknown>;
      expect(room.applyOp({ kind: 'manifest_patch', fields }, owner).ok).toBe(false);
      expect(room.applyOp({ kind: 'update', id: 'a', patch: fields }, editor).ok).toBe(false);
    }
    expect(room.applyOp({
      kind: 'update', id: 'a', patch: { id: 'hacked', name: 'Still A' }
    }, editor).ok).toBe(true);
    expect(room.getObjects()[0].id).toBe('a');
    expect(room.getObjects()[0].name).toBe('Still A');
  });

  it('enforces per-object locks against other editors but not the holder', () => {
    const room = core();
    room.setLock('other', 'Other', ['a']);
    expect(room.applyOp({ kind: 'update', id: 'a', patch: { name: 'x' } }, editor).reason)
      .toMatch(/locked by another editor/);
    expect(room.applyOp({ kind: 'remove', ids: ['a'] }, editor).reason)
      .toMatch(/locked by another editor/);
    const holder: CollaboratorPresence = { ...editor, userId: 'other' };
    expect(room.applyOp({ kind: 'update', id: 'a', patch: { name: 'ok' } }, holder).ok)
      .toBe(true);
    expect(room.lockHolderFor('a', 'editor')?.userId).toBe('other');
    expect(room.lockHolderFor('a', 'other')).toBeNull();

    room.releaseLocks('other');
    expect(room.getLocks()).toEqual({});
  });

  it('tracks presence, drops locks on disconnect and snapshots cleanly', () => {
    const room = core();
    room.setPresence(owner);
    room.setPresence(editor);
    room.setLock('editor', 'Editor', ['b']);
    expect(room.getCollaborators()).toHaveLength(2);
    room.dropPresence('editor');
    expect(room.getCollaborators().map((c) => c.userId)).toEqual(['owner']);
    expect(room.getLocks()).toEqual({});
    const snapshot = room.snapshot();
    expect(snapshot.version).toBe(0);
    expect(snapshot.manifest.objects).toHaveLength(2);
    expect(snapshot.collaborators).toHaveLength(1);
    expect(snapshot.manifest).not.toBe(room.getObjects());
  });
});
