// Team Create frontend: op convergence, typed REST/WS SDK, reconnecting
// transport and CSS-token/SRP compliance of the new Studio UI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiClient } from '../src/api/client';
import type { StudioObject } from '../src/engine/studio/types';
import {
  StudioTeamApi,
  getTeamWebSocketUrl
} from '../src/api/studioTeam';
import {
  ALLOWED_MANIFEST_PATCH_KEYS,
  MAX_BULK_OPS,
  applyTeamOp,
  chunkOps,
  diffManifestFields,
  diffObjects
} from '../src/components/studio/team/teamOps';
import { TeamCreateClient } from '../src/components/studio/team/TeamCreateClient';

function object(id: string, name: string): StudioObject {
  return {
    id,
    name,
    type: 'block',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: '#ffffff',
    material: 'plastic',
    anchored: true,
    canCollide: true
  } as StudioObject;
}

describe('Team Create op convergence', () => {
  it('diffs into removes first, then adds, then updates', () => {
    const before = [object('a', 'A'), object('b', 'B')];
    const after = [object('a', 'Renamed'), object('c', 'C')];
    const ops = diffObjects(before, after);
    expect(ops.map((op) => op.kind)).toEqual(['remove', 'add', 'update']);
    expect(ops[0]).toEqual({ kind: 'remove', ids: ['b'] });
    expect(ops[1]).toEqual({ kind: 'add', object: object('c', 'C') });
    expect(ops[2]).toEqual({ kind: 'update', id: 'a', patch: { name: 'Renamed' } });
    expect(diffObjects(before, before)).toEqual([]);
  });

  it('applies remote ops without mutating the source array', () => {
    const initial = [object('a', 'A'), object('b', 'B')];
    const added = applyTeamOp(initial, { kind: 'add', object: object('c', 'C') });
    expect(added).toHaveLength(3);
    expect(initial).toHaveLength(2);
    expect(applyTeamOp(initial, { kind: 'add', object: object('a', 'dup') })).toBe(initial);

    const updated = applyTeamOp(initial, {
      kind: 'update', id: 'a', patch: { name: 'Remote', id: 'hacked' }
    });
    expect(updated[0].name).toBe('Remote');
    expect(updated[0].id).toBe('a');

    const bulk = applyTeamOp(initial, {
      kind: 'bulk',
      ops: [
        { kind: 'remove', ids: ['b'] },
        { kind: 'add', object: object('d', 'D') }
      ]
    });
    expect(bulk.map((o) => o.id)).toEqual(['a', 'd']);
    expect(applyTeamOp(initial, {
      kind: 'manifest_patch', fields: { scriptCode: 'x' }
    })).toBe(initial);
  });

  it('chunks large diffs and only syncs allowlisted manifest fields', () => {
    const ops = Array.from({ length: 405 }, (_, i) => ({
      kind: 'remove' as const,
      ids: [`obj_${i}`]
    }));
    const chunks = chunkOps(ops);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(MAX_BULK_OPS);
    expect(chunks[2]).toHaveLength(5);
    expect(chunkOps([])).toEqual([]);

    expect([...ALLOWED_MANIFEST_PATCH_KEYS]).toEqual([
      'scriptCode', 'language', 'environment', 'animations', 'animationStateMachine'
    ]);
    expect(diffManifestFields(
      { scriptCode: 'a', language: 'lua', title: 'ignored' },
      { scriptCode: 'b', language: 'lua', title: 'changed' }
    )).toEqual({ scriptCode: 'b' });
    expect(diffManifestFields(
      { environment: { sky: 'day' } },
      { environment: { sky: 'night' } }
    )).toEqual({ environment: { sky: 'night' } });
    expect(diffManifestFields(
      { animationStateMachine: { states: [{ id: 'idle', clipId: 'idle' }], transitions: [] } },
      { animationStateMachine: { states: [{ id: 'walk', clipId: 'walk' }], transitions: [] } }
    )).toEqual({ animationStateMachine: { states: [{ id: 'walk', clipId: 'walk' }], transitions: [] } });
    expect(diffManifestFields(
      { animations: [{ id: 'a' }] },
      { animations: [{ id: 'a' }, { id: 'b' }] }
    )).toEqual({ animations: [{ id: 'a' }, { id: 'b' }] });
  });
});

describe('Team Create client SDK', () => {
  it('builds wss/ws URLs with an encoded token query', () => {
    expect(getTeamWebSocketUrl('draft 1', 'a b&c', 'https://api.example.com/')).toBe(
      'wss://api.example.com/api/v1/games/drafts/draft%201/team/ws?token=a+b%26c'
    );
    expect(getTeamWebSocketUrl('d1', 'tok', 'http://localhost:8787')).toBe(
      'ws://localhost:8787/api/v1/games/drafts/d1/team/ws?token=tok'
    );
  });

  it('calls the correct REST endpoints with the auth header', async () => {
    const calls: { method: string; path: string; body?: unknown; options?: unknown }[] = [];
    const client = {
      get: vi.fn(async (path: string, options?: unknown) => {
        calls.push({ method: 'GET', path, options });
        return { drafts: [], total: 0 };
      }),
      post: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
        calls.push({ method: 'POST', path, body, options });
        return { members: [] };
      }),
      patch: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
        calls.push({ method: 'PATCH', path, body, options });
        return { members: [] };
      }),
      delete: vi.fn(async (path: string, options?: unknown) => {
        calls.push({ method: 'DELETE', path, options });
        return { success: true };
      })
    } as unknown as ApiClient;
    const api = new StudioTeamApi(client);

    await api.getTeam('d 1', 'tok');
    await api.setEnabled('d 1', true, 'tok');
    await api.listMembers('d 1');
    await api.invite('d 1', { username: 'guest' }, 'viewer', 'tok');
    await api.setRole('d 1', 'u 2', 'editor', 'tok');
    await api.remove('d 1', 'u 2', 'tok');
    await api.listShared('tok');

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/v1/games/drafts/d%201/team',
      'POST /api/v1/games/drafts/d%201/team',
      'GET /api/v1/games/drafts/d%201/team/members',
      'POST /api/v1/games/drafts/d%201/team/members',
      'PATCH /api/v1/games/drafts/d%201/team/members/u%202',
      'DELETE /api/v1/games/drafts/d%201/team/members/u%202',
      'GET /api/v1/games/drafts/shared'
    ]);
    expect(calls[1].body).toEqual({ enabled: true });
    expect(calls[3].body).toEqual({ username: 'guest', role: 'viewer' });
    expect(calls[4].body).toEqual({ role: 'editor' });
    expect(calls[0].options).toEqual({ headers: { Authorization: 'Bearer tok' } });
    expect(calls[2].options).toEqual({});
  });
});

class FakeSocket {
  public static OPEN = 1;
  public static instances: FakeSocket[] = [];
  public readyState = 1;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public sent: string[] = [];

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('Team Create WebSocket transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens, delivers JSON frames and sends only while live', () => {
    const messages: Record<string, unknown>[] = [];
    const statuses: string[] = [];
    const client = new TeamCreateClient({
      url: 'wss://example/ws',
      onMessage: (message) => messages.push(message),
      onStatus: (status) => statuses.push(status)
    });
    client.connect();
    expect(statuses).toEqual(['connecting']);
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe('wss://example/ws');

    socket.onopen?.();
    expect(client.getStatus()).toBe('live');
    expect(client.isOpen()).toBe(true);
    expect(client.send({ kind: 'ping' })).toBe(true);
    expect(socket.sent[0]).toBe('{"kind":"ping"}');

    socket.onmessage?.({ data: '{"type":"saved"}' });
    socket.onmessage?.({ data: 'not json' });
    socket.onmessage?.({ data: 'null' });
    expect(messages).toEqual([{ type: 'saved' }]);

    client.close();
    expect(client.getStatus()).toBe('closed');
    expect(client.send({ kind: 'op' })).toBe(false);
  });

  it('reconnects with backoff after an unexpected close', () => {
    const statuses: string[] = [];
    const client = new TeamCreateClient({
      url: 'wss://example/ws',
      onMessage: () => undefined,
      onStatus: (status) => statuses.push(status),
      maxRetryDelayMs: 1000
    });
    client.connect();
    FakeSocket.instances[0].onclose?.();
    expect(statuses).toEqual(['connecting', 'reconnecting']);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);
    // Status is deduplicated: the retry stays "reconnecting" until the socket opens.
    expect(client.getStatus()).toBe('reconnecting');
    FakeSocket.instances[1].onopen?.();
    expect(client.getStatus()).toBe('live');
    expect(statuses).toEqual(['connecting', 'reconnecting', 'live']);
    client.close();
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('reports closed when WebSockets are unavailable', () => {
    vi.stubGlobal('WebSocket', undefined);
    const statuses: string[] = [];
    const client = new TeamCreateClient({
      url: 'wss://example/ws',
      onMessage: () => undefined,
      onStatus: (status) => statuses.push(status)
    });
    client.connect();
    expect(statuses).toEqual(['closed']);
    client.close();
  });
});

describe('Team Create UI compliance', () => {
  const dir = join(__dirname, '..', 'src', 'components', 'studio', 'team');

  it('uses CSS design tokens only and keeps every file under the SRP ceiling', () => {
    const forbidden = /(bg|text|border)-(emerald|amber|rose|violet|indigo|sky|red|green|purple|pink|orange)-[0-9]{3}|bg-black|bg-white|text-white|slate-|\[#[0-9a-fA-F]{6}\]|from ['"]\.\.\/\.\.\/\.\.\//;
    const files = readdirSync(dir).filter((file) => /\.(ts|tsx)$/.test(file));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content.split('\n').length, `${file} exceeds 300 lines`).toBeLessThanOrEqual(300);
      expect(forbidden.test(content), `${file} has a raw colour or forbidden import`).toBe(false);
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(content), `${file} has an emoji`).toBe(false);
    }
  });
});
