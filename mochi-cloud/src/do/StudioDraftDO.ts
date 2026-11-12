// Durable Object hosting one live Team Create session for a studio draft.
// Identity arrives via headers set by the authenticated route (x-mochi-user-*),
// every edit op runs through DraftCollabCore, and the draft is flushed back to
// D1/R2 on a debounced alarm so the DO stays the single writer while live.

import { MochiEnv } from '../types/env';
import { DraftCollabCore, CollabOp, CollaboratorPresence } from './draftCollabCore';
import { resolveDraftAccess } from './draftRoles';
import { loadDraftForCollab, persistCollabDraft } from '../services/draftPersistence';

const FLUSH_ALARM_MS = 2500;
const FINAL_FLUSH_ALARM_MS = 200;

interface DraftSession {
  presence: CollaboratorPresence;
  ws: WebSocket;
}

interface DraftWireMessage {
  kind: string;
  [key: string]: unknown;
}

export class StudioDraftDO {
  private state: DurableObjectState;
  private env: MochiEnv;
  private draftId: string;
  private core: DraftCollabCore | null = null;
  private loadError: string | null = null;
  private draftTitle = '';
  private draftVersion = '';
  private readonly sessions = new Map<WebSocket, DraftSession>();
  private readonly roleCache = new Map<string, CollaboratorPresence['role']>();

  constructor(state: DurableObjectState, env: MochiEnv) {
    this.state = state;
    this.env = env;
    this.draftId = this.resolveDraftId(state);
  }

  // The DO id is created by the route as "draft/<draftId>".
  private resolveDraftId(state: DurableObjectState): string {
    const raw = (state.id?.name as string | undefined) ?? '';
    if (raw.startsWith('draft/')) return raw.slice('draft/'.length);
    return raw || 'unknown';
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      // Internal control plane: the REST route asks the live room to evict a
      // collaborator whose invite was revoked, so access changes take effect
      // immediately instead of lingering in the cached session.
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname.endsWith('/revoke')) {
        const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
        const removed = typeof body.userId === 'string' ? this.revokeUser(body.userId) : 0;
        return new Response(JSON.stringify({ removed }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    if (typeof WebSocketPair === 'undefined') {
      return new Response('WebSocketPair is not supported in this runtime', { status: 501 });
    }

    const url = new URL(request.url);
    const userId = request.headers.get('x-mochi-user-id') || url.searchParams.get('userId') || '';
    const username = request.headers.get('x-mochi-user-name') || url.searchParams.get('username') || 'Guest';
    const userRole = request.headers.get('x-mochi-user-role') || 'user';

    if (!userId) return new Response('Missing user identity', { status: 401 });

    const role = await this.resolveRole(userId, userRole);
    if (!role) return new Response('Forbidden: no collaborator access to this draft', { status: 403 });

    await this.ensureLoaded();
    if (this.loadError || !this.core) {
      return new Response(this.loadError || 'Draft failed to load', { status: 404 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    await this.attachSession(server, { userId, username, role });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Attaches an authenticated socket to the live session. Split from fetch so
   * the flow is testable without a 101 response (same seam as GameRoomDO).
   */
  public async attachSession(
    ws: WebSocket,
    identity: { userId: string; username: string; role: CollaboratorPresence['role'] }
  ): Promise<void> {
    await this.ensureLoaded();
    if (this.loadError || !this.core) return;

    ws.accept();
    const presence: CollaboratorPresence = {
      userId: identity.userId,
      username: identity.username,
      role: identity.role,
      joinedAt: Date.now()
    };
    this.core.setPresence(presence);
    this.sessions.set(ws, { presence, ws });

    this.send(ws, { type: 'init', state: this.core.snapshot() });
    this.broadcast({ type: 'presence', collaborators: this.core.getCollaborators() }, ws);

    ws.addEventListener('message', (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        void this.handleMessage(ws, presence, JSON.parse(raw) as DraftWireMessage);
      } catch {
        // Discard malformed JSON packets
      }
    });
    ws.addEventListener('close', () => this.closeSession(ws));
    ws.addEventListener('error', () => this.closeSession(ws));
  }

  // Cloudflare alarm handler: flush the authoritative state to D1/R2.
  async alarm(): Promise<void> {
    await this.flush();
  }

  private async handleMessage(ws: WebSocket, presence: CollaboratorPresence, message: DraftWireMessage): Promise<void> {
    if (!this.core) return;
    switch (message.kind) {
      case 'op': {
        const result = this.core.applyOp(message.op as CollabOp, presence);
        if (!result.ok) {
          this.send(ws, { type: 'error', message: result.reason });
          return;
        }
        // Everyone (including the origin) sees the same version. The origin
        // discards its own op because it already applied it optimistically.
        this.broadcast({ type: 'op', op: message.op, version: this.core.getVersion(), origin: presence.userId });
        this.scheduleFlush(FLUSH_ALARM_MS);
        return;
      }
      case 'resync': {
        this.send(ws, { type: 'init', state: this.core.snapshot() });
        return;
      }
      case 'lock': {
        const ids = Array.isArray(message.ids) ? (message.ids as string[]) : [];
        this.core.setLock(presence.userId, presence.username, ids);
        this.broadcast({ type: 'locks', locks: this.core.getLocks() }, ws);
        return;
      }
      case 'unlock': {
        this.core.releaseLocks(presence.userId);
        this.broadcast({ type: 'locks', locks: this.core.getLocks() }, ws);
        return;
      }
      case 'awareness': {
        this.broadcast({
          type: 'awareness',
          userId: presence.userId,
          username: presence.username,
          selectedIds: Array.isArray(message.selectedIds) ? (message.selectedIds as string[]) : []
        }, ws);
        return;
      }
      case 'save': {
        if (presence.role === 'viewer') {
          this.send(ws, { type: 'error', message: 'viewers cannot trigger saves' });
          return;
        }
        await this.flush();
        this.broadcast({ type: 'saved', version: this.core.getVersion(), at: new Date().toISOString() });
        return;
      }
      case 'ping': {
        this.send(ws, { type: 'pong' });
        return;
      }
      default:
        this.send(ws, { type: 'error', message: `unsupported message kind ${message.kind}` });
    }
  }

  private closeSession(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (!session) return;
    this.sessions.delete(ws);
    this.core?.dropPresence(session.presence.userId);
    try { ws.close(); } catch { /* socket already closed */ }
    if (this.core) {
      this.broadcast({ type: 'presence', collaborators: this.core.getCollaborators() });
      // Last one out: flush soon so nothing is lost before eviction.
      if (this.sessions.size === 0 && this.core.isDirty()) {
        this.scheduleFlush(FINAL_FLUSH_ALARM_MS);
      }
    }
  }

  private async resolveRole(userId: string, userRole: string): Promise<CollaboratorPresence['role'] | null> {
    const cached = this.roleCache.get(userId);
    if (cached) return cached;
    const access = await resolveDraftAccess(this.env, this.draftId, userId, userRole);
    if (!access) return null;
    this.draftTitle = access.title;
    this.draftVersion = access.versionNumber;
    this.roleCache.set(userId, access.role);
    return access.role;
  }

  /** Drops a revoked collaborator's presence, locks and sockets right away. */
  public revokeUser(userId: string): number {
    const all = userId === '*';
    if (all) this.roleCache.clear();
    else this.roleCache.delete(userId);
    const targets = all ? this.core?.getCollaborators().map((c) => c.userId) || [] : [userId];
    targets.forEach((id) => this.core?.dropPresence(id));
    let removed = 0;
    for (const [ws, session] of this.sessions) {
      if (!all && session.presence.userId !== userId) continue;
      removed += 1;
      this.sessions.delete(ws);
      try {
        ws.close(1008, 'Team Create access revoked');
      } catch {
        // Socket may already be closing.
      }
    }
    if (this.core && removed > 0) {
      this.broadcast({ type: 'presence', collaborators: this.core.getCollaborators() });
      this.broadcast({ type: 'locks', locks: this.core.getLocks() });
    }
    return removed;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.core || this.loadError) return;
    const draft = await loadDraftForCollab(this.env, this.draftId);
    if (!draft) {
      this.loadError = 'Draft not found';
      return;
    }
    this.draftTitle = draft.title;
    this.draftVersion = draft.versionNumber;
    try {
      this.core = new DraftCollabCore(draft.manifestJson);
    } catch (err) {
      this.loadError = `Draft manifest failed to load: ${(err as Error).message}`;
    }
  }

  private scheduleFlush(delayMs: number): void {
    try { this.state.storage.setAlarm?.(Date.now() + delayMs); } catch { /* no alarms in test doubles */ }
  }

  /** Writes the authoritative manifest back to D1 (and R2 for large bodies). */
  private async flush(): Promise<void> {
    if (!this.core || !this.core.isDirty()) return;
    try {
      const saved = await persistCollabDraft(this.env, {
        draftId: this.draftId,
        manifestJson: this.core.serializeManifest(),
        title: this.draftTitle,
        versionNumber: this.draftVersion
      });
      if (saved) this.core.clearDirty();
    } catch (err) {
      console.warn(`Collab flush failed for draft ${this.draftId}: ${(err as Error).message}`);
      this.scheduleFlush(FLUSH_ALARM_MS);
    }
  }

  private broadcast(payload: unknown, excludeWs?: WebSocket): void {
    const text = JSON.stringify(payload);
    for (const [ws] of this.sessions) {
      if (ws === excludeWs) continue;
      try { ws.send(text); } catch { this.closeSession(ws); }
    }
  }

  private send(ws: WebSocket, payload: unknown): void {
    try { ws.send(JSON.stringify(payload)); } catch { this.closeSession(ws); }
  }
}
