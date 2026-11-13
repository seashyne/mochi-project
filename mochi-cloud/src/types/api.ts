// Data models and API contract interfaces for Mochi Cloud API

export interface User {
  id: string;
  numericId: number;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: string;
  coins?: number;
  isBanned?: boolean;
  isVerified?: boolean;
  birthday?: string | null;
  gender?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  numericId: number;
  username: string;
  email: string;
  displayName: string | null;
  role: string;
  coins?: number;
  isBanned?: boolean;
  isVerified?: boolean;
  birthday?: string | null;
  gender?: string | null;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  creatorId: string;
  thumbnailUrl: string | null;
  status: 'draft' | 'published' | 'rejected' | 'archived';
  currentVersionId: string | null;
  playCount: number;
  isFeatured?: boolean;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
  currentVersion?: string;
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

export interface GameSession {
  id: string;
  gameId: string;
  userId: string | null;
  sessionToken: string;
  ipHash: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

// Request and Response contracts

export interface RegisterRequest {
  username: string;
  email?: string;
  password: string;
  displayName?: string;
  birthday?: string;
  gender?: 'male' | 'female';
  instant?: boolean;
}

export interface RequestEmailVerificationRequest {
  email: string;
}

export interface ConfirmEmailVerificationRequest {
  email: string;
  code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserPublic;
  token: string;
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

export interface GameDetailResponse {
  game: Game;
  versions: GameVersion[];
}

export interface GameListResponse {
  games: Game[];
  total: number;
  page: number;
  limit: number;
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

// Resumable multipart asset upload contracts. Assets are chunked into fixed-size
// parts so packages larger than the Worker request body limit can be uploaded.
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

export interface MultipartCompleteRequest {
  parts: Array<{ partNumber: number; etag: string }>;
}

export interface MultipartCompleteResponse {
  assetKey: string;
  publicUrl: string;
  sizeBytes: number;
  contentType: string;
  etag: string;
  hashVerified?: boolean;
}

// Realtime room message contracts

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

/** Runtime world edits (objects created or destroyed by a script) relayed to peers. */
export interface WorldOpPayload {
  kind: 'spawn' | 'destroy';
  object?: Record<string, unknown>;
  id?: string;
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
