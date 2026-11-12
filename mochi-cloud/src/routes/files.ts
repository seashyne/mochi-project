// Creator file registry REST API: folder tree, asset metadata, visibility.
// Bytes stay in content-addressed R2; these routes manage ownership/access.

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { authMiddleware } from '../middleware/auth';
import {
  ASSET_KINDS, ASSET_VISIBILITIES, SYSTEM_OWNER_ID,
  createFolder, findFolderById, listFoldersByOwner, renameFolder, deleteFolder,
  findFileById, listFilesByOwner, updateFile, deleteFile,
  type AssetKind, type AssetVisibility
} from '../services/fileDb';

export const filesRouter = new Hono<{ Bindings: MochiEnv; Variables: AppVariables }>();

const MAX_NAME_LENGTH = 120;
const MAX_FOLDER_DEPTH = 8;

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

async function folderDepth(db: D1Database, folderId: string): Promise<number> {
  let depth = 0;
  let current = await findFolderById(db, folderId);
  while (current?.parentId && depth <= MAX_FOLDER_DEPTH) {
    depth++;
    current = await findFolderById(db, current.parentId);
  }
  return depth;
}

filesRouter.use('*', authMiddleware);

filesRouter.get('/', async (c) => {
  const user = c.get('user')!;
  const folderParam = c.req.query('folder');
  const kindParam = c.req.query('kind');
  const search = c.req.query('search');
  if (kindParam && !ASSET_KINDS.includes(kindParam as AssetKind)) {
    return c.json({ error: `kind must be one of ${ASSET_KINDS.join(', ')}` }, 400);
  }
  if (search && search.length > 100) return c.json({ error: 'search is too long' }, 400);
  let folderId: string | null | undefined;
  if (folderParam === 'root') folderId = null;
  else if (folderParam) {
    const folder = await findFolderById(c.env.DB, folderParam);
    if (!folder || (folder.ownerId !== user.id && user.role !== 'admin')) {
      return c.json({ error: 'Folder not found' }, 404);
    }
    folderId = folderParam;
  }
  const files = await listFilesByOwner(c.env.DB, user.id, {
    folderId,
    kind: kindParam as AssetKind | undefined,
    search: search || undefined,
    limit: Number(c.req.query('limit')) || undefined,
    offset: Number(c.req.query('offset')) || undefined
  });
  return c.json({ files });
});

filesRouter.get('/folders', async (c) => {
  const user = c.get('user')!;
  return c.json({ folders: await listFoldersByOwner(c.env.DB, user.id) });
});

filesRouter.post('/folders', async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json()) as { name?: unknown; parentId?: unknown };
  const name = cleanName(body.name);
  if (!name) return c.json({ error: 'Folder name is required (1-120 characters)' }, 400);
  let parentId: string | null = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    if (typeof body.parentId !== 'string') return c.json({ error: 'parentId must be a string' }, 400);
    const parent = await findFolderById(c.env.DB, body.parentId);
    if (!parent || parent.ownerId !== user.id) return c.json({ error: 'Parent folder not found' }, 404);
    if (await folderDepth(c.env.DB, body.parentId) >= MAX_FOLDER_DEPTH - 1) {
      return c.json({ error: `Folders cannot nest deeper than ${MAX_FOLDER_DEPTH} levels` }, 400);
    }
    parentId = body.parentId;
  }
  const now = new Date().toISOString();
  const folder = await createFolder(c.env.DB, {
    id: crypto.randomUUID(), ownerId: user.id, name, parentId, createdAt: now, updatedAt: now
  });
  return c.json({ folder }, 201);
});

filesRouter.patch('/folders/:id', async (c) => {
  const user = c.get('user')!;
  const folder = await findFolderById(c.env.DB, c.req.param('id'));
  if (!folder) return c.json({ error: 'Folder not found' }, 404);
  if (folder.ownerId !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  const body = (await c.req.json()) as { name?: unknown };
  const name = cleanName(body.name);
  if (!name) return c.json({ error: 'Folder name is required (1-120 characters)' }, 400);
  await renameFolder(c.env.DB, folder.id, folder.ownerId, name, new Date().toISOString());
  return c.json({ folder: { ...folder, name } });
});

filesRouter.delete('/folders/:id', async (c) => {
  const user = c.get('user')!;
  const folder = await findFolderById(c.env.DB, c.req.param('id'));
  if (!folder) return c.json({ error: 'Folder not found' }, 404);
  if (folder.ownerId !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await deleteFolder(c.env.DB, folder.id, folder.ownerId);
  return c.json({ success: true });
});

filesRouter.get('/:id', async (c) => {
  const user = c.get('user')!;
  const file = await findFileById(c.env.DB, c.req.param('id'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  const isOwner = file.ownerId === user.id || user.role === 'admin';
  if (!isOwner && file.visibility === 'private') return c.json({ error: 'Forbidden' }, 403);
  return c.json({ file });
});

filesRouter.patch('/:id', async (c) => {
  const user = c.get('user')!;
  const file = await findFileById(c.env.DB, c.req.param('id'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId === SYSTEM_OWNER_ID) return c.json({ error: 'Built-in assets are read-only' }, 403);
  if (file.ownerId !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const body = (await c.req.json()) as { name?: unknown; folderId?: unknown; visibility?: unknown };
  const changes: { name?: string; folderId?: string | null; visibility?: AssetVisibility } = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return c.json({ error: 'File name is required (1-120 characters)' }, 400);
    changes.name = name;
  }
  if (body.visibility !== undefined) {
    if (!ASSET_VISIBILITIES.includes(body.visibility as AssetVisibility)) {
      return c.json({ error: `visibility must be one of ${ASSET_VISIBILITIES.join(', ')}` }, 400);
    }
    changes.visibility = body.visibility as AssetVisibility;
  }
  if (body.folderId !== undefined) {
    if (body.folderId === null) changes.folderId = null;
    else if (typeof body.folderId === 'string') {
      const folder = await findFolderById(c.env.DB, body.folderId);
      if (!folder || folder.ownerId !== file.ownerId) return c.json({ error: 'Target folder not found' }, 404);
      changes.folderId = body.folderId;
    } else return c.json({ error: 'folderId must be a string or null' }, 400);
  }
  if (!Object.keys(changes).length) return c.json({ error: 'No changes provided' }, 400);
  await updateFile(c.env.DB, file.id, file.ownerId, changes, new Date().toISOString());
  return c.json({ file: { ...file, ...changes } });
});

filesRouter.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const file = await findFileById(c.env.DB, c.req.param('id'));
  if (!file) return c.json({ error: 'File not found' }, 404);
  if (file.ownerId === SYSTEM_OWNER_ID) return c.json({ error: 'Built-in assets are read-only' }, 403);
  if (file.ownerId !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  // Registry-only delete: content-addressed bytes may be shared by published games.
  await deleteFile(c.env.DB, file.id, file.ownerId);
  return c.json({ success: true });
});