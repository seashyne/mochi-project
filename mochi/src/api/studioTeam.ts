// Typed client SDK for Team Create: collaborator management, shared drafts and
// the authenticated live-editing WebSocket endpoint.

import { ApiClient, defaultApiClient, resolveDefaultApiUrl } from './client';
import type { StudioProjectDraft } from './studioDrafts';

export type TeamRole = 'owner' | 'editor' | 'viewer';
export type InviteRole = 'editor' | 'viewer';

export interface TeamMember {
  userId: string;
  username: string;
  role: InviteRole;
  invitedBy: string | null;
  createdAt: string;
}

export interface TeamState {
  draftId: string;
  ownerId: string;
  role: TeamRole;
  enabled: boolean;
  members: TeamMember[];
  websocketPath: string;
}

export interface SharedDraft extends StudioProjectDraft {
  accessRole?: TeamRole;
}

export interface TeamCollaborator {
  userId: string;
  username: string;
  role: TeamRole;
  joinedAt: number;
}

export interface TeamLock {
  userId: string;
  username: string;
  ids: string[];
}

export interface TeamAwareness {
  userId: string;
  username: string;
  selectedIds: string[];
}

export class StudioTeamApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  private auth(token?: string): RequestInit {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }

  public getTeam(draftId: string, token?: string): Promise<{ team: TeamState }> {
    return this.client.get(`/api/v1/games/drafts/${encodeURIComponent(draftId)}/team`, this.auth(token));
  }

  public setEnabled(draftId: string, enabled: boolean, token?: string): Promise<{ team: TeamState }> {
    return this.client.post(`/api/v1/games/drafts/${encodeURIComponent(draftId)}/team`, { enabled }, this.auth(token));
  }

  public listMembers(draftId: string, token?: string): Promise<{ members: TeamMember[]; total: number }> {
    return this.client.get(`/api/v1/games/drafts/${encodeURIComponent(draftId)}/team/members`, this.auth(token));
  }

  public invite(
    draftId: string,
    identifier: { username?: string; userId?: string },
    role: InviteRole,
    token?: string
  ): Promise<{ member: TeamMember | null; members: TeamMember[] }> {
    return this.client.post(
      `/api/v1/games/drafts/${encodeURIComponent(draftId)}/team/members`,
      { ...identifier, role },
      this.auth(token)
    );
  }

  public setRole(
    draftId: string,
    userId: string,
    role: InviteRole,
    token?: string
  ): Promise<{ members: TeamMember[] }> {
    return this.client.patch(
      `/api/v1/games/drafts/${encodeURIComponent(draftId)}/team/members/${encodeURIComponent(userId)}`,
      { role },
      this.auth(token)
    );
  }

  public remove(draftId: string, userId: string, token?: string): Promise<{ success: boolean }> {
    return this.client.delete(
      `/api/v1/games/drafts/${encodeURIComponent(draftId)}/team/members/${encodeURIComponent(userId)}`,
      this.auth(token)
    );
  }

  public listShared(token?: string): Promise<{ drafts: SharedDraft[]; total: number }> {
    return this.client.get('/api/v1/games/drafts/shared', this.auth(token));
  }
}

export const studioTeamApi = new StudioTeamApi();

/** Builds the wss/ws URL. The token travels in the query because browser
 * WebSocket constructors cannot set an Authorization header. */
export function getTeamWebSocketUrl(draftId: string, token: string, baseUrl?: string): string {
  const base = (baseUrl || resolveDefaultApiUrl()).trim().replace(/\/+$/, '');
  const wsProto = base.startsWith('https:') ? 'wss:' : 'ws:';
  const host = base.replace(/^https?:\/\//, '');
  const query = new URLSearchParams({ token });
  return `${wsProto}//${host}/api/v1/games/drafts/${encodeURIComponent(draftId)}/team/ws?${query}`;
}
