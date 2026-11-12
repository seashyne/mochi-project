// Typed client SDK for the creator file registry and asset access grants.
// Mirrors the Worker routes mounted at /api/v1/files and /api/v1/access.

import { ApiClient, defaultApiClient } from './client';

export type AssetVisibility = 'private' | 'unlisted' | 'public';
export type AssetKind = 'model' | 'image' | 'audio' | 'video' | 'script' | 'other';
export type GrantPermission = 'read' | 'write';
export type GranteeType = 'user' | 'public';
export type AccessPermission = 'none' | 'read' | 'write' | 'owner';

export interface AssetFolder {
  id: string;
  ownerId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetFile {
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

export interface AccessGrant {
  id: string;
  fileId: string;
  ownerId: string;
  granteeType: GranteeType;
  granteeId: string | null;
  permission: GrantPermission;
  tokenHash: string | null;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ListFilesParams {
  folderId?: string | null;
  kind?: AssetKind;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface GrantPayload {
  granteeType: GranteeType;
  granteeId?: string | null;
  permission: GrantPermission;
  label?: string | null;
  expiresAt?: string | null;
  withToken?: boolean;
}

export interface AccessKeyRecord {
  accessId: string;
  fileId: string;
  ownerId: string;
  status: 'pending' | 'ready' | 'blocked';
  createdAt: string;
  name?: string;
  kind?: AssetKind;
  objectKey?: string;
  visibility?: AssetVisibility;
  url?: string;
}

export interface ResolvedAccessAsset {
  accessId: string;
  fileId: string;
  name: string;
  kind: AssetKind;
  contentType: string;
  sizeBytes: number;
  visibility: AssetVisibility;
  status: 'ready';
  url: string;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function buildListFilesQuery(params: ListFilesParams = {}): string {
  const query = new URLSearchParams();
  if (params.folderId === null) query.set('folder', 'root');
  else if (typeof params.folderId === 'string') query.set('folder', params.folderId);
  if (params.kind) query.set('kind', params.kind);
  if (params.search) query.set('search', params.search);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export class AssetLibraryApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  async listFolders(token?: string): Promise<{ folders: AssetFolder[] }> {
    return this.client.get('/api/v1/files/folders', { headers: authHeaders(token) });
  }

  async createFolder(
    name: string,
    parentId: string | null = null,
    token?: string
  ): Promise<{ folder: AssetFolder }> {
    return this.client.post('/api/v1/files/folders', { name, parentId }, {
      headers: authHeaders(token)
    });
  }

  async renameFolder(id: string, name: string, token?: string): Promise<{ folder: AssetFolder }> {
    return this.client.request(`/api/v1/files/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
      headers: authHeaders(token)
    });
  }

  async deleteFolder(id: string, token?: string): Promise<{ success: boolean }> {
    return this.client.delete(`/api/v1/files/folders/${encodeURIComponent(id)}`, {
      headers: authHeaders(token)
    });
  }

  async listFiles(params: ListFilesParams = {}, token?: string): Promise<{ files: AssetFile[] }> {
    return this.client.get(`/api/v1/files${buildListFilesQuery(params)}`, {
      headers: authHeaders(token)
    });
  }

  async updateFile(
    id: string,
    changes: { name?: string; folderId?: string | null; visibility?: AssetVisibility },
    token?: string
  ): Promise<{ file: AssetFile }> {
    return this.client.request(`/api/v1/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
      headers: authHeaders(token)
    });
  }

  async deleteFile(id: string, token?: string): Promise<{ success: boolean }> {
    return this.client.delete(`/api/v1/files/${encodeURIComponent(id)}`, {
      headers: authHeaders(token)
    });
  }

  async listGrants(fileId: string, token?: string): Promise<{ grants: AccessGrant[]; total: number }> {
    return this.client.get(`/api/v1/access/files/${encodeURIComponent(fileId)}/grants`, {
      headers: authHeaders(token)
    });
  }

  async createGrant(
    fileId: string,
    payload: GrantPayload,
    token?: string
  ): Promise<{ grant: AccessGrant; token?: string }> {
    return this.client.post(`/api/v1/access/files/${encodeURIComponent(fileId)}/grants`, payload, {
      headers: authHeaders(token)
    });
  }

  async revokeGrant(
    fileId: string,
    grantId: string,
    token?: string
  ): Promise<{ success: boolean; revokedId: string }> {
    return this.client.delete(
      `/api/v1/access/files/${encodeURIComponent(fileId)}/grants/${encodeURIComponent(grantId)}`,
      { headers: authHeaders(token) }
    );
  }

  async resolvePermission(
    fileId: string,
    shareToken?: string | null,
    token?: string
  ): Promise<{ permission: AccessPermission; fileId: string }> {
    const headers: Record<string, string> = authHeaders(token);
    if (shareToken) headers['X-Access-Token'] = shareToken;
    return this.client.get(`/api/v1/access/files/${encodeURIComponent(fileId)}/permission`, {
      headers
    });
  }

  async issueAccessKey(
    fileId: string,
    token?: string
  ): Promise<{ key: AccessKeyRecord; url: string }> {
    return this.client.post(
      `/api/v1/access/files/${encodeURIComponent(fileId)}/key`,
      {},
      { headers: authHeaders(token) }
    );
  }

  async listAccessKeys(token?: string): Promise<{ keys: AccessKeyRecord[]; total: number }> {
    return this.client.get('/api/v1/access/keys', { headers: authHeaders(token) });
  }

  async setAccessKeyStatus(
    accessId: string,
    status: 'ready' | 'blocked',
    token?: string
  ): Promise<{ accessId: string; status: string }> {
    return this.client.request(`/api/v1/access/keys/${encodeURIComponent(accessId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      headers: authHeaders(token)
    });
  }

  async resolveAccessAsset(
    accessId: string,
    shareToken?: string | null,
    token?: string
  ): Promise<ResolvedAccessAsset> {
    const headers: Record<string, string> = authHeaders(token);
    if (shareToken) headers['X-Access-Token'] = shareToken;
    return this.client.get(`/api/v1/access/assets/${encodeURIComponent(accessId)}`, { headers });
  }
}

export const assetLibraryApi = new AssetLibraryApi();
