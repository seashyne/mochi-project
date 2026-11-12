// Tier 5 adversarial tests: creator asset library client contract. Verifies the
// SDK builds the exact Worker paths, verbs, and headers the API expects.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetLibraryApi,
  buildListFilesQuery,
  type AssetFile
} from '../src/api/assetLibrary';

interface Call {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class FakeClient {
  public calls: Call[] = [];
  public response: unknown = {};

  async get(path: string, options?: RequestInit): Promise<unknown> {
    this.calls.push({ method: 'GET', path, headers: options?.headers as Record<string, string> });
    return this.response;
  }

  async post(path: string, body?: unknown, options?: RequestInit): Promise<unknown> {
    this.calls.push({ method: 'POST', path, body, headers: options?.headers as Record<string, string> });
    return this.response;
  }

  async delete(path: string, options?: RequestInit): Promise<unknown> {
    this.calls.push({ method: 'DELETE', path, headers: options?.headers as Record<string, string> });
    return this.response;
  }

  async request(path: string, options: RequestInit = {}): Promise<unknown> {
    this.calls.push({
      method: options.method ?? 'GET',
      path,
      body: options.body ? JSON.parse(String(options.body)) : undefined,
      headers: options.headers as Record<string, string>
    });
    return this.response;
  }
}

const sampleFile: AssetFile = {
  id: 'file-1',
  ownerId: 'owner-1',
  folderId: null,
  name: 'crate.glb',
  kind: 'model',
  objectKey: 'assets/sha256/abc',
  hash: 'abc',
  sizeBytes: 2048,
  contentType: 'model/gltf-binary',
  visibility: 'private',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('Tier 5: Asset Library Client Hardening', () => {
  let client: FakeClient;
  let api: AssetLibraryApi;

  beforeEach(() => {
    client = new FakeClient();
    api = new AssetLibraryApi(client as never);
  });

  describe('Query construction', () => {
    it('produces an empty query for defaults', () => {
      expect(buildListFilesQuery()).toBe('');
    });

    it('maps null folder to the root sentinel', () => {
      expect(buildListFilesQuery({ folderId: null })).toBe('?folder=root');
    });

    it('encodes folder, kind, and search safely', () => {
      const query = buildListFilesQuery({
        folderId: 'f 1&2',
        kind: 'model',
        search: 'a b&c=d'
      });
      const params = new URLSearchParams(query);
      expect(params.get('folder')).toBe('f 1&2');
      expect(params.get('kind')).toBe('model');
      expect(params.get('search')).toBe('a b&c=d');
    });

    it('includes pagination when provided', () => {
      const params = new URLSearchParams(buildListFilesQuery({ limit: 50, offset: 100 }));
      expect(params.get('limit')).toBe('50');
      expect(params.get('offset')).toBe('100');
    });

    it('omits falsy pagination values', () => {
      expect(buildListFilesQuery({ limit: 0, offset: 0 })).toBe('');
    });
  });

  describe('Endpoint mapping', () => {
    it('lists folders with the bearer token', async () => {
      await api.listFolders('tok');
      expect(client.calls[0].path).toBe('/api/v1/files/folders');
      expect(client.calls[0].headers?.Authorization).toBe('Bearer tok');
    });

    it('lists files under the query string', async () => {
      await api.listFiles({ folderId: 'f1', kind: 'image' }, 'tok');
      expect(client.calls[0].path).toBe('/api/v1/files?folder=f1&kind=image');
    });

    it('creates folders with name and parent', async () => {
      await api.createFolder('Props', 'parent-1', 'tok');
      expect(client.calls[0].method).toBe('POST');
      expect(client.calls[0].body).toEqual({ name: 'Props', parentId: 'parent-1' });
    });

    it('renames files through PATCH', async () => {
      await api.updateFile('file-1', { name: 'renamed.glb' }, 'tok');
      expect(client.calls[0].method).toBe('PATCH');
      expect(client.calls[0].path).toBe('/api/v1/files/file-1');
      expect(client.calls[0].body).toEqual({ name: 'renamed.glb' });
    });

    it('encodes ids in file and grant paths', async () => {
      await api.deleteFile('a/b c', 'tok');
      expect(client.calls[0].path).toBe('/api/v1/files/a%2Fb%20c');

      await api.revokeGrant('f/1', 'g 2', 'tok');
      expect(client.calls[1].path).toBe('/api/v1/access/files/f%2F1/grants/g%202');
      expect(client.calls[1].method).toBe('DELETE');
    });

    it('posts grant payloads to the access endpoint', async () => {
      await api.createGrant(
        'file-1',
        { granteeType: 'user', granteeId: 'user-2', permission: 'write' },
        'tok'
      );
      expect(client.calls[0].path).toBe('/api/v1/access/files/file-1/grants');
      expect(client.calls[0].body).toEqual({
        granteeType: 'user',
        granteeId: 'user-2',
        permission: 'write'
      });
    });

    it('attaches the share token header when resolving permission', async () => {
      await api.resolvePermission('file-1', 'share-token', 'tok');
      expect(client.calls[0].path).toBe('/api/v1/access/files/file-1/permission');
      expect(client.calls[0].headers?.['X-Access-Token']).toBe('share-token');
      expect(client.calls[0].headers?.Authorization).toBe('Bearer tok');
    });

    it('omits both headers when neither token is supplied', async () => {
      await api.resolvePermission('file-1');
      expect(client.calls[0].headers?.['X-Access-Token']).toBeUndefined();
      expect(client.calls[0].headers?.Authorization).toBeUndefined();
    });

    it('returns the server payload untouched', async () => {
      client.response = { files: [sampleFile] };
      const result = await api.listFiles({}, 'tok');
      expect(result.files[0].name).toBe('crate.glb');
    });
  });

  describe('Access key endpoints', () => {
    it('issues an access key for a file', async () => {
      await api.issueAccessKey('file-1', 'tok');
      expect(client.calls[0].method).toBe('POST');
      expect(client.calls[0].path).toBe('/api/v1/access/files/file-1/key');
    });

    it('lists the caller keys', async () => {
      await api.listAccessKeys('tok');
      expect(client.calls[0].path).toBe('/api/v1/access/keys');
      expect(client.calls[0].headers?.Authorization).toBe('Bearer tok');
    });

    it('updates key status through PATCH', async () => {
      await api.setAccessKeyStatus('acc_0123456789abcdef0123', 'blocked', 'tok');
      expect(client.calls[0].method).toBe('PATCH');
      expect(client.calls[0].path).toBe('/api/v1/access/keys/acc_0123456789abcdef0123');
      expect(client.calls[0].body).toEqual({ status: 'blocked' });
    });

    it('resolves an access id with the share token header', async () => {
      await api.resolveAccessAsset('acc_0123456789abcdef0123', 'share-me', 'tok');
      expect(client.calls[0].path).toBe('/api/v1/access/assets/acc_0123456789abcdef0123');
      expect(client.calls[0].headers?.['X-Access-Token']).toBe('share-me');
    });

    it('encodes hostile access ids instead of interpolating them raw', async () => {
      await api.resolveAccessAsset('../../admin', undefined, 'tok');
      expect(client.calls[0].path).toBe('/api/v1/access/assets/..%2F..%2Fadmin');
    });
  });
});
