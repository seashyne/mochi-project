// In-memory D1 stand-in for the creator file registry tests

import { createMockDb } from './mockDb';

interface FolderRow {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  kind: string;
  object_key: string;
  hash: string;
  size_bytes: number;
  content_type: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

function likeMatch(value: string, pattern: string): boolean {
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      regex += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '%') regex += '.*';
    else if (ch === '_') regex += '.';
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${regex}$`, 'i').test(value);
}

function result<T>(rows: T[], changes = 0): D1Result<T> {
  return { results: rows, success: true, meta: { changes } as D1Result<T>['meta'] };
}

export function createFileMockDb(): D1Database {
  const base = createMockDb();
  const folders = new Map<string, FolderRow>();
  const files = new Map<string, FileRow>();
  const originalPrepare = base.prepare.bind(base);

  base.prepare = (query: string) => {
    const q = query.trim().replace(/\s+/g, ' ');
    const isFolders = q.includes('asset_folders');
    const isFiles = q.includes('asset_files');
    if (!isFolders && !isFiles) return originalPrepare(query);

    let bound: unknown[] = [];
    const stmt = {
      bind(...params: unknown[]) { bound = params; return stmt; },
      async first<T>(): Promise<T | null> {
        const res = await stmt.all<T>();
        return res.results?.length ? res.results[0] : null;
      },
      async all<T>(): Promise<D1Result<T>> {
        if (isFolders && q.includes('WHERE id = ?')) {
          const row = folders.get(String(bound[0]));
          return result((row ? [row] : []) as unknown as T[]);
        }
        if (isFolders && q.includes('WHERE owner_id = ?')) {
          const list = [...folders.values()]
            .filter(f => f.owner_id === String(bound[0]))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, Number(bound[1]));
          return result(list as unknown as T[]);
        }
        if (isFiles && q.includes('WHERE id = ?')) {
          const row = files.get(String(bound[0]));
          return result((row ? [row] : []) as unknown as T[]);
        }
        if (isFiles && q.includes('WHERE object_key = ?')) {
          const list = [...files.values()].filter(f => f.object_key === String(bound[0])).slice(0, Number(bound[1]));
          return result(list as unknown as T[]);
        }
        if (isFiles && q.includes('WHERE owner_id = ? AND object_key = ?')) {
          const row = [...files.values()].find(f => f.owner_id === String(bound[0]) && f.object_key === String(bound[1]));
          return result((row ? [row] : []) as unknown as T[]);
        }
        if (isFiles && q.includes('ORDER BY updated_at DESC')) {
          let index = 0;
          const ownerId = String(bound[index++]);
          let folder: string | null | undefined;
          if (q.includes('folder_id IS NULL')) folder = null;
          else if (q.includes('folder_id = ?')) folder = String(bound[index++]);
          const kind = q.includes('kind = ?') ? String(bound[index++]) : undefined;
          const search = q.includes('name LIKE') ? String(bound[index++]) : undefined;
          const limit = Number(bound[index++]);
          const offset = Number(bound[index++]);
          const list = [...files.values()]
            .filter(f => f.owner_id === ownerId)
            .filter(f => folder === undefined || f.folder_id === folder)
            .filter(f => !kind || f.kind === kind)
            .filter(f => !search || likeMatch(f.name, search))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(offset, offset + limit);
          return result(list as unknown as T[]);
        }
        return result([] as unknown as T[]);
      },
      async run(): Promise<D1Result<unknown>> {
        if (q.startsWith('INSERT INTO asset_folders')) {
          const [id, owner_id, name, parent_id, created_at, updated_at] = bound;
          folders.set(String(id), {
            id: String(id), owner_id: String(owner_id), name: String(name),
            parent_id: parent_id ? String(parent_id) : null,
            created_at: String(created_at), updated_at: String(updated_at)
          });
          return result([], 1);
        }
        if (q.startsWith('UPDATE asset_folders')) {
          const [name, updated_at, id, owner_id] = bound;
          const row = folders.get(String(id));
          if (!row || row.owner_id !== String(owner_id)) return result([], 0);
          row.name = String(name);
          row.updated_at = String(updated_at);
          return result([], 1);
        }
        if (q.startsWith('DELETE FROM asset_folders')) {
          const [id, owner_id] = bound;
          const root = folders.get(String(id));
          if (!root || root.owner_id !== String(owner_id)) return result([], 0);
          const doomed = new Set<string>([root.id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const f of folders.values()) {
              if (f.parent_id && doomed.has(f.parent_id) && !doomed.has(f.id)) { doomed.add(f.id); grew = true; }
            }
          }
          for (const folderId of doomed) folders.delete(folderId);
          for (const f of files.values()) {
            if (f.folder_id && doomed.has(f.folder_id)) f.folder_id = null;
          }
          return result([], doomed.size);
        }
        if (q.startsWith('INSERT INTO asset_files')) {
          const [id, owner_id, folder_id, name, kind, object_key, hash, size_bytes, content_type, visibility, created_at, updated_at] = bound;
          files.set(String(id), {
            id: String(id), owner_id: String(owner_id),
            folder_id: folder_id ? String(folder_id) : null,
            name: String(name), kind: String(kind), object_key: String(object_key),
            hash: String(hash), size_bytes: Number(size_bytes), content_type: String(content_type),
            visibility: String(visibility), created_at: String(created_at), updated_at: String(updated_at)
          });
          return result([], 1);
        }
        if (q.startsWith('UPDATE asset_files')) {
          let index = 0;
          const name = q.includes('name = ?') ? String(bound[index++]) : undefined;
          const folderId = q.includes('folder_id = ?') ? (bound[index++] as string | null) : undefined;
          const visibility = q.includes('visibility = ?') ? String(bound[index++]) : undefined;
          const updated_at = String(bound[index++]);
          const id = String(bound[index++]);
          const owner_id = String(bound[index++]);
          const row = files.get(id);
          if (!row || row.owner_id !== owner_id) return result([], 0);
          if (name !== undefined) row.name = name;
          if (folderId !== undefined) row.folder_id = folderId ? String(folderId) : null;
          if (visibility !== undefined) row.visibility = visibility;
          row.updated_at = updated_at;
          return result([], 1);
        }
        if (q.startsWith('DELETE FROM asset_files')) {
          const [id, owner_id] = bound;
          const row = files.get(String(id));
          if (!row || row.owner_id !== String(owner_id)) return result([], 0);
          files.delete(String(id));
          return result([], 1);
        }
        return result([], 0);
      }
    };
    return stmt as unknown as D1PreparedStatement;
  };

  return base;
}