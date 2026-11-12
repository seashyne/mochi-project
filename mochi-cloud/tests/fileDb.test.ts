// File registry data layer: folders, metadata, visibility, ownership scoping

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createFolder, deleteFolder, findFolderById, listFoldersByOwner, renameFolder,
  registerFile, findFileById, findFilesByObjectKey, listFilesByOwner, updateFile, deleteFile,
  kindFromContentType, type AssetFileRecord, type AssetFolderRecord
} from '../src/services/fileDb';
import { createFileMockDb } from './mockFileDb';

let db: D1Database;
beforeEach(() => { db = createFileMockDb(); });

const folder = (id: string, ownerId: string, parentId: string | null = null, name = id): AssetFolderRecord => ({
  id, ownerId, name, parentId, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
});

const file = (id: string, ownerId: string, overrides: Partial<AssetFileRecord> = {}): AssetFileRecord => ({
  id, ownerId, folderId: null, name: `${id}.glb`, kind: 'model',
  objectKey: `assets/sha256/${id.padEnd(64, 'a')}`, hash: id.padEnd(64, 'a'),
  sizeBytes: 1024, contentType: 'model/gltf-binary', visibility: 'private',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides
});

describe('kindFromContentType', () => {
  it.each([
    ['model/gltf-binary', 'model'], ['model/gltf+json', 'model'],
    ['image/ktx2', 'image'], ['image/png; charset=binary', 'image'],
    ['audio/mpeg', 'audio'], ['video/mp4', 'video'],
    ['application/lua', 'script'], ['text/x-lua', 'script'],
    ['application/octet-stream', 'other'], ['application/zip', 'other']
  ])('maps %s to %s', (mime, kind) => {
    expect(kindFromContentType(mime)).toBe(kind);
  });
});

describe('asset folders', () => {
  it('creates, lists, renames and deletes with ownership scoping', async () => {
    await createFolder(db, folder('f1', 'u1', null, 'Models'));
    await createFolder(db, folder('f2', 'u1', 'f1', 'Trees'));
    await createFolder(db, folder('f3', 'u2', null, 'Other'));
    expect((await listFoldersByOwner(db, 'u1')).map(f => f.id)).toEqual(['f1', 'f2']);
    expect(await findFolderById(db, 'f2')).toMatchObject({ parentId: 'f1' });
    expect(await renameFolder(db, 'f1', 'u2', 'Hacked', 'now')).toBe(false);
    expect(await renameFolder(db, 'f1', 'u1', 'Renamed', 'now')).toBe(true);
    expect(await findFolderById(db, 'f1')).toMatchObject({ name: 'Renamed', updatedAt: 'now' });
    expect(await deleteFolder(db, 'f1', 'u2')).toBe(false);
    expect(await deleteFolder(db, 'f1', 'u1')).toBe(true);
    expect(await findFolderById(db, 'f2')).toBeNull(); // Cascaded child.
  });

  it('moves orphaned files to root when their folder is deleted', async () => {
    await createFolder(db, folder('f1', 'u1'));
    await registerFile(db, file('a1', 'u1', { folderId: 'f1' }));
    await deleteFolder(db, 'f1', 'u1');
    expect(await findFileById(db, 'a1')).toMatchObject({ folderId: null });
  });
});

describe('asset files', () => {
  it('registers and finds by id and object key', async () => {
    const record = file('a1', 'u1');
    await registerFile(db, record);
    expect(await findFileById(db, 'a1')).toEqual(record);
    expect(await findFilesByObjectKey(db, record.objectKey)).toEqual([record]);
    expect(await findFileById(db, 'missing')).toBeNull();
  });

  it('filters by folder, kind and search with pagination', async () => {
    await createFolder(db, folder('f1', 'u1'));
    await registerFile(db, file('a1', 'u1', { name: 'Oak Tree.glb', updatedAt: '2026-01-03' }));
    await registerFile(db, file('a2', 'u1', { folderId: 'f1', name: 'Pine Tree.glb', updatedAt: '2026-01-02' }));
    await registerFile(db, file('a3', 'u1', { name: 'theme.mp3', kind: 'audio', contentType: 'audio/mpeg', updatedAt: '2026-01-01' }));
    await registerFile(db, file('a4', 'u2', { name: 'Oak Tree.glb' }));

    expect((await listFilesByOwner(db, 'u1')).map(f => f.id)).toEqual(['a1', 'a2', 'a3']);
    expect((await listFilesByOwner(db, 'u1', { folderId: null })).map(f => f.id)).toEqual(['a1', 'a3']);
    expect((await listFilesByOwner(db, 'u1', { folderId: 'f1' })).map(f => f.id)).toEqual(['a2']);
    expect((await listFilesByOwner(db, 'u1', { kind: 'audio' })).map(f => f.id)).toEqual(['a3']);
    expect((await listFilesByOwner(db, 'u1', { search: 'tree' })).map(f => f.id)).toEqual(['a1', 'a2']);
    expect((await listFilesByOwner(db, 'u1', { limit: 1, offset: 1 })).map(f => f.id)).toEqual(['a2']);
  });

  it('treats LIKE wildcards in search as literal characters', async () => {
    await registerFile(db, file('a1', 'u1', { name: '100%_done.glb' }));
    await registerFile(db, file('a2', 'u1', { name: '100Xdone.glb' }));
    expect((await listFilesByOwner(db, 'u1', { search: '%_' })).map(f => f.id)).toEqual(['a1']);
  });

  it('updates name, folder and visibility only for the owner', async () => {
    await createFolder(db, folder('f1', 'u1'));
    await registerFile(db, file('a1', 'u1'));
    expect(await updateFile(db, 'a1', 'u2', { name: 'Hacked' }, 'now')).toBe(false);
    expect(await updateFile(db, 'a1', 'u1', {}, 'now')).toBe(false);
    expect(await updateFile(db, 'a1', 'u1', { name: 'Renamed', folderId: 'f1', visibility: 'public' }, 'now')).toBe(true);
    expect(await findFileById(db, 'a1')).toMatchObject({ name: 'Renamed', folderId: 'f1', visibility: 'public', updatedAt: 'now' });
    expect(await updateFile(db, 'a1', 'u1', { folderId: null }, 'later')).toBe(true);
    expect(await findFileById(db, 'a1')).toMatchObject({ folderId: null });
  });

  it('deletes only for the owner', async () => {
    await registerFile(db, file('a1', 'u1'));
    expect(await deleteFile(db, 'a1', 'u2')).toBe(false);
    expect(await deleteFile(db, 'a1', 'u1')).toBe(true);
    expect(await findFileById(db, 'a1')).toBeNull();
  });
});