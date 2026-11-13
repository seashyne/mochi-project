// API type definitions for Mochi Web Platform

export interface UserProfile {
  id: string;
  numericId: number;
  username: string;
  email: string;
  displayName: string | null;
  role: string;
  isVerified?: boolean;
  coins?: number;
  isBanned?: boolean;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
}

export interface RegisterRequest {
  username: string;
  email?: string;
  password: string;
  displayName?: string;
  birthday?: string;
  gender?: 'male' | 'female';
  instant?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GameSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creatorId: string;
  thumbnailUrl: string | null;
  status: 'draft' | 'published' | 'archived' | 'rejected';
  playCount: number;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
  currentVersion?: string;
  isFeatured?: boolean;
  genre?: string;
}

// Admin Backoffice telemetry metrics returned by GET /api/v1/admin/stats
export interface AdminPlatformStats {
  activeOnlineUsers: number;
  totalGameplaySessions: number;
  totalGames: number;
  totalRegisteredUsers: number;
}

// Admin Backoffice user record returned by /api/v1/admin/users
export interface AdminUserItem {
  id: string;
  numericId: number;
  username: string;
  email: string;
  displayName: string | null;
  role: 'player' | 'creator' | 'admin';
  coins: number;
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
}

// Admin Backoffice game record returned by /api/v1/admin/games
export interface AdminGameItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creatorId: string;
  creatorName?: string;
  status: 'draft' | 'published' | 'archived' | 'rejected';
  isFeatured: boolean;
  playCount: number;
  createdAt: string;
  updatedAt: string;
}

// Immutable administrative action audit entry returned by /api/v1/admin/audit-logs
export interface AdminAuditLogItem {
  id: string;
  adminId: string;
  adminUsername?: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface GameVersion {
  id: string;
  gameId: string;
  versionNumber: string;
  changelog: string | null;
  bundleUrl: string;
  manifestJson: string;
  status: 'draft' | 'published' | 'deprecated';
  publishedAt: string;
  createdAt: string;
}

export interface GameDetail extends GameSummary {
  currentVersionId: string | null;
}

export interface GameDetailResponse {
  game: GameDetail;
  versions: GameVersion[];
}

export interface GameListResponse {
  games: GameSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateGameRequest {
  title: string;
  slug?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface PublishVersionRequest {
  versionNumber: string;
  changelog?: string;
  bundleUrl: string;
  manifestJson: string;
}

export interface AssetUploadRequest {
  filename: string;
  contentType: string;
  sizeBytes?: number;
}

export interface AssetUploadResponse {
  uploadUrl: string;
  publicUrl: string;
  assetKey: string;
}

export interface MultipartCreateRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
}

export interface MultipartCreateResponse {
  existing: boolean;
  assetKey: string;
  publicUrl: string;
  uploadId?: string;
  uploadToken?: string;
  partSize?: number;
  totalParts?: number;
  sizeBytes?: number;
}

export interface MultipartPartResponse {
  partNumber: number;
  etag: string;
}

export interface MultipartCompleteResponse {
  assetKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
  etag: string;
}

export type RoomEventType =
  | 'join'
  | 'leave'
  | 'player_state'
  | 'chat'
  | 'room_state'
  | 'player_joined'
  | 'player_left'
  | 'ping'
  | 'pong'
  | 'script_rpc'
  | 'state_replicate'
  | 'transform_delta'
  | 'world_op';

export interface ScriptRpcPayload {
  eventName: string;
  data?: unknown;
  targetPlayerId?: string;
}

export interface StateReplicatePayload {
  key: string;
  value: unknown;
  version?: number;
}

/** Wire shape of `transform_delta`; see docs/REPLICATION.md. */
export interface TransformDeltaPayload {
  tick: number;
  entries: Array<{ id: string; x: number; y: number; z: number; ry: number }>;
  removed: string[];
}

export interface RoomEvent<T = unknown> {
  type: RoomEventType;
  senderId?: string;
  timestamp?: number;
  data?: T;
}

export interface PlayerPresence {
  id: string;
  username: string;
  x?: number;
  y?: number;
  z?: number;
  rotation?: number;
  joinedAt: number;
}

// User 3D humanoid avatar attributes and color customizations
export interface UserAvatar {
  userId: string;
  modelType: 'humanoid_v1';
  headColor: string;
  torsoColor: string;
  leftArmColor: string;
  rightArmColor: string;
  leftLegColor: string;
  rightLegColor: string;
  hatId?: string;
  shirtId?: string;
  pantsId?: string;
  faceId?: string;
  hairId?: string;
  backId?: string;
  emoteIds?: string[];
  updatedAt: string;
}

export type UpdateAvatarRequest = Partial<Omit<UserAvatar, 'userId' | 'updatedAt'>>;

export const DEFAULT_STARTER_AVATAR: Omit<UserAvatar, 'userId' | 'updatedAt'> = {
  modelType: 'humanoid_v1',
  headColor: '#fcd34d',
  torsoColor: '#0284c7',
  leftArmColor: '#fcd34d',
  rightArmColor: '#fcd34d',
  leftLegColor: '#1e293b',
  rightLegColor: '#1e293b'
};

export interface AvatarApiResponse {
  success: boolean;
  avatar: UserAvatar;
}

export type AccessoryKind = 'hat' | 'shirt';

export interface AvatarCatalogItem {
  id: string;
  kind: AccessoryKind;
  name: string;
  style: string;
  color: string;
}

export interface AvatarCatalogResponse {
  success: boolean;
  items: AvatarCatalogItem[];
}

export interface ResolvedAccessory {
  style: string;
  color: string;
}

export interface ResolvedAccessories {
  hat?: ResolvedAccessory;
  shirt?: ResolvedAccessory;
}
