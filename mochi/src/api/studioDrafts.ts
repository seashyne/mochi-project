// Typed Client SDK for Mochi Studio Project Drafts Persistence

import { ApiClient, defaultApiClient } from './client';
import { StudioObject } from '../engine/studio/types';
import type { EnvironmentState } from '../engine/environment/environmentTypes';
import type { MochiAnimationClip } from '../engine/animation/clip';

export interface StudioProjectDraft {
  id: string;
  creatorId: string;
  gameId: string | null;
  title: string;
  description: string | null;
  slug: string | null;
  manifestJson: string;
  versionNumber: string;
  isAutosave: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present when the draft was shared through Team Create. */
  accessRole?: 'owner' | 'editor' | 'viewer';
}

export interface SaveDraftPayload {
  id?: string;
  title: string;
  description?: string;
  slug?: string;
  gameId?: string;
  objects: StudioObject[];
  scriptCode: string;
  language?: string;
  versionNumber?: string;
  isAutosave?: boolean;
  environment?: EnvironmentState;
  serverScripts?: unknown[];
  remoteEvents?: unknown[];
  animations?: MochiAnimationClip[];
}

export class StudioDraftsApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  public async save(
    payload: SaveDraftPayload,
    token?: string
  ): Promise<{ draft: StudioProjectDraft }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const manifestJson = JSON.stringify({
      objects: payload.objects,
      scriptCode: payload.scriptCode,
      language: payload.language || 'lua',
      version: payload.versionNumber || '0.1.0',
      ...(payload.environment ? { environment: payload.environment } : {}),
      ...(payload.serverScripts ? { serverScripts: payload.serverScripts } : {}),
      ...(payload.remoteEvents ? { remoteEvents: payload.remoteEvents } : {}),
      ...(payload.animations?.length ? { animations: payload.animations } : {})
    });

    return this.client.post<{ draft: StudioProjectDraft }>(
      '/api/v1/games/drafts',
      {
        id: payload.id,
        title: payload.title,
        description: payload.description,
        slug: payload.slug,
        gameId: payload.gameId,
        manifestJson,
        versionNumber: payload.versionNumber,
        isAutosave: payload.isAutosave
      },
      { headers }
    );
  }

  public async listMine(
    token?: string
  ): Promise<{ drafts: StudioProjectDraft[]; total: number }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this.client.get<{ drafts: StudioProjectDraft[]; total: number }>(
      '/api/v1/games/drafts/mine',
      { headers }
    );
  }

  public async get(
    id: string,
    token?: string
  ): Promise<{ draft: StudioProjectDraft }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this.client.get<{ draft: StudioProjectDraft }>(
      `/api/v1/games/drafts/${encodeURIComponent(id)}`,
      { headers }
    );
  }

  public async delete(
    id: string,
    token?: string
  ): Promise<{ success: boolean; deletedId: string }> {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this.client.delete<{ success: boolean; deletedId: string }>(
      `/api/v1/games/drafts/${encodeURIComponent(id)}`,
      { headers }
    );
  }
}

export const studioDraftsApi = new StudioDraftsApi();
