// Avatars API client module for Mochi Web Platform

import { ApiClient, defaultApiClient } from './client';
import {
  UserAvatar,
  UpdateAvatarRequest,
  AvatarApiResponse,
  AvatarCatalogItem,
  AvatarCatalogResponse,
  ResolvedAccessories
} from './types';

export class AvatarsApi {
  constructor(private client: ApiClient = defaultApiClient) {}

  // Retrieves the public accessory catalog of equippable hats and shirts
  public async getCatalog(): Promise<AvatarCatalogItem[]> {
    const res = await this.client.get<AvatarCatalogResponse>('/api/v1/avatars/catalog');
    return res.items;
  }

  // Retrieves the current authenticated user's 3D avatar
  public async getMyAvatar(token?: string): Promise<UserAvatar> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await this.client.get<AvatarApiResponse>('/api/v1/avatars/me', { headers });
    return res.avatar;
  }

  // Updates customization attributes for the current user's 3D avatar
  public async updateMyAvatar(
    updates: UpdateAvatarRequest,
    token?: string
  ): Promise<UserAvatar> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await this.client.put<AvatarApiResponse>(
      '/api/v1/avatars/me',
      updates,
      { headers }
    );
    return res.avatar;
  }

  // Fetches a public 3D avatar configuration by user ID
  public async getAvatarByUserId(userId: string): Promise<UserAvatar | null> {
    try {
      const endpoint = `/api/v1/avatars/${encodeURIComponent(userId)}`;
      const res = await this.client.get<AvatarApiResponse>(endpoint);
      return res.avatar;
    } catch {
      return null;
    }
  }
}

export const avatarsApi = new AvatarsApi();

// Resolves equipped accessory ids into renderable style and color definitions
export function resolveAvatarAccessories(
  avatar: Pick<UserAvatar, 'hatId' | 'shirtId'> | null | undefined,
  catalog: AvatarCatalogItem[]
): ResolvedAccessories {
  const resolved: ResolvedAccessories = {};
  if (!avatar) return resolved;

  const hat = catalog.find((item) => item.id === avatar.hatId && item.kind === 'hat');
  const shirt = catalog.find((item) => item.id === avatar.shirtId && item.kind === 'shirt');
  if (hat) resolved.hat = { style: hat.style, color: hat.color };
  if (shirt) resolved.shirt = { style: shirt.style, color: shirt.color };
  return resolved;
}
