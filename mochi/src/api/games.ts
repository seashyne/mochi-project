// Games API client module for Mochi Web Platform

import { ApiClient, defaultApiClient } from './client';
import {
  CreateGameRequest,
  GameDetail,
  GameDetailResponse,
  GameListResponse,
  GameVersion,
  PublishVersionRequest
} from './types';

export class GamesApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  public async list(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<GameListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) {
      searchParams.set('search', params.search);
    }
    if (params?.page) {
      searchParams.set('page', String(params.page));
    }
    if (params?.limit) {
      searchParams.set('limit', String(params.limit));
    }
    const query = searchParams.toString();
    const endpoint = query ? `/api/v1/games?${query}` : '/api/v1/games';
    return this.client.get<GameListResponse>(endpoint);
  }

  public async get(id: string): Promise<GameDetailResponse> {
    const endpoint = `/api/v1/games/${encodeURIComponent(id)}`;
    return this.client.get<GameDetailResponse>(endpoint);
  }

  public async create(
    data: CreateGameRequest,
    token?: string
  ): Promise<{ game: GameDetail }> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.client.post<{ game: GameDetail }>('/api/v1/games', data, { headers });
  }

  public async publish(
    gameId: string,
    data: PublishVersionRequest,
    token?: string
  ): Promise<{ version: GameVersion }> {
    const endpoint = `/api/v1/games/${encodeURIComponent(gameId)}/publish`;
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return this.client.post<{ version: GameVersion }>(endpoint, data, { headers });
  }

  public async recordPlay(
    gameId: string
  ): Promise<{ success: boolean; playCount: number }> {
    return this.client.post<{ success: boolean; playCount: number }>(
      `/api/v1/games/${encodeURIComponent(gameId)}/play`,
      {}
    );
  }
}

export const gamesApi = new GamesApi();
