// Typed client for the creator file registry: folders, asset metadata and
// visibility. Bytes are served from the canonical asset URLs on each record.

import { ApiClient, defaultApiClient } from './client';

export type AssetVisibility = 'private' | 'unlisted' | 'public';
export type AssetKind = 'model' | 'image' | 'audio' | 'video' | 'script' | 'other';

export interface AssetFileRecord {
  id: string;
  ownerId: string;
  folderId: string | null;
  name: string;
  kind: AssetKind;
  objectKey: string;
  hash: string;
  sizeBytes: number;
  contentType: string;
  visibility: AssetVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface AssetFolderRecord {
  id: string;
  ownerId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListFilesFilter {
  folder?: string;
  kind?: AssetKind;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface FileUpdate {
  name?: string;
  folderId?: string | null;
  visibility?: AssetVisibility;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class FilesApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  public listFiles(filter: ListFilesFilter = {}, token?: string): Promise<{ files: AssetFileRecord[] }> {
    const params = new URLSearchParams();
    if (filter.folder) params.set('folder', filter.folder);
    if (filter.kind) params.set('kind', filter.kind);
    if (filter.search) params.set('search', filter.search);
    if (filter.limit !== undefined) params.set('limit', String(filter.limit));
    if (filter.offset !== undefined) params.set('offset', String(filter.offset));
    const query = params.toString();
    return this.client.get<{ files: AssetFileRecord[] }>(
      `/api/v1/files${query ? `?${query}` : ''}`,
      { headers: authHeaders(token) }
    );
  }

  public listFolders(token?: string): Promise<{ folders: AssetFolderRecord[] }> {
    return this.client.get<{ folders: AssetFolderRecord[] }>('/api/v1/files/folders', { headers: authHeaders(token) });
  }

  public createFolder(name: string, parentId?: string | null, token?: string): Promise<{ folder: AssetFolderRecord }> {
    return this.client.post<{ folder: AssetFolderRecord }>(
      '/api/v1/files/folders',
      { name, ...(parentId ? { parentId } : {}) },
      { headers: authHeaders(token) }
    );
  }

  public renameFolder(id: string, name: string, token?: string): Promise<{ folder: AssetFolderRecord }> {
    return this.client.patch<{ folder: AssetFolderRecord }>(
      `/api/v1/files/folders/${encodeURIComponent(id)}`,
      { name },
      { headers: authHeaders(token) }
    );
  }

  public deleteFolder(id: string, token?: string): Promise<{ success: boolean }> {
    return this.client.delete<{ success: boolean }>(
      `/api/v1/files/folders/${encodeURIComponent(id)}`,
      { headers: authHeaders(token) }
    );
  }

  public getFile(id: string, token?: string): Promise<{ file: AssetFileRecord }> {
    return this.client.get<{ file: AssetFileRecord }>(
      `/api/v1/files/${encodeURIComponent(id)}`,
      { headers: authHeaders(token) }
    );
  }

  public updateFile(id: string, changes: FileUpdate, token?: string): Promise<{ file: AssetFileRecord }> {
    return this.client.patch<{ file: AssetFileRecord }>(
      `/api/v1/files/${encodeURIComponent(id)}`,
      changes,
      { headers: authHeaders(token) }
    );
  }

  public deleteFile(id: string, token?: string): Promise<{ success: boolean }> {
    return this.client.delete<{ success: boolean }>(
      `/api/v1/files/${encodeURIComponent(id)}`,
      { headers: authHeaders(token) }
    );
  }
}

export const filesApi = new FilesApi();