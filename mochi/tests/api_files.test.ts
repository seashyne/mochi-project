// Files API client: query construction, auth headers and route paths

import { describe, expect, it, vi } from 'vitest';
import { FilesApi } from '../src/api/files';
import type { ApiClient } from '../src/api/client';

function mockClient() {
  const calls: Array<{ method: string; path: string; body?: unknown; options?: RequestInit }> = [];
  const record = (method: string) => async (path: string, bodyOrOptions?: unknown, options?: RequestInit) => {
    const body = method === 'get' || method === 'delete' ? undefined : bodyOrOptions;
    const opts = (method === 'get' || method === 'delete' ? bodyOrOptions : options) as RequestInit | undefined;
    calls.push({ method, path, body, options: opts });
    return {};
  };
  const client = {
    get: vi.fn(record('get')),
    post: vi.fn(record('post')),
    patch: vi.fn(record('patch')),
    delete: vi.fn(record('delete'))
  } as unknown as ApiClient;
  return { client, calls };
}

describe('FilesApi client', () => {
  it('builds list queries and auth headers', async () => {
    const { client, calls } = mockClient();
    const api = new FilesApi(client);
    await api.listFiles({ folder: 'root', kind: 'model', search: 'tree', limit: 20, offset: 40 }, 'tok');
    expect(calls[0].path).toBe('/api/v1/files?folder=root&kind=model&search=tree&limit=20&offset=40');
    expect((calls[0].options?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    await api.listFiles();
    expect(calls[1].path).toBe('/api/v1/files');
  });

  it('targets folder and file routes with encoded ids', async () => {
    const { client, calls } = mockClient();
    const api = new FilesApi(client);
    await api.listFolders('tok');
    await api.createFolder('Models', 'p1', 'tok');
    await api.renameFolder('f/1', 'Renamed', 'tok');
    await api.deleteFolder('f/1', 'tok');
    await api.getFile('a b', 'tok');
    await api.updateFile('a b', { visibility: 'public' }, 'tok');
    await api.deleteFile('a b', 'tok');
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'get /api/v1/files/folders',
      'post /api/v1/files/folders',
      'patch /api/v1/files/folders/f%2F1',
      'delete /api/v1/files/folders/f%2F1',
      'get /api/v1/files/a%20b',
      'patch /api/v1/files/a%20b',
      'delete /api/v1/files/a%20b'
    ]);
    expect(calls[1].body).toEqual({ name: 'Models', parentId: 'p1' });
    expect(calls[5].body).toEqual({ visibility: 'public' });
  });
});