// E2E 3D Cloud Test Harness for Mochi Platform 3D Overhaul
// Provides D1 Avatar schema verification, starter avatar provisioning, and avatar API handlers

import { MockDataStore } from './e2e_cloud_harness';

export interface StoredUserAvatar {
  user_id: string;
  model_type: 'humanoid_v1';
  head_color: string;
  torso_color: string;
  left_arm_color: string;
  right_arm_color: string;
  left_leg_color: string;
  right_leg_color: string;
  hat_id: string | null;
  shirt_id: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_STARTER_AVATAR = {
  model_type: 'humanoid_v1' as const,
  head_color: '#fcd34d',
  torso_color: '#0284c7',
  left_arm_color: '#fcd34d',
  right_arm_color: '#fcd34d',
  left_leg_color: '#1e293b',
  right_leg_color: '#1e293b'
};

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export class Avatar3DDataStore extends MockDataStore {
  public avatars = new Map<string, StoredUserAvatar>();

  public override clear(): void {
    super.clear();
    this.avatars.clear();
  }

  public provisionStarterAvatar(userId: string): StoredUserAvatar {
    const now = new Date().toISOString();
    const avatar: StoredUserAvatar = {
      user_id: userId,
      ...DEFAULT_STARTER_AVATAR,
      hat_id: null,
      shirt_id: null,
      created_at: now,
      updated_at: now
    };
    this.avatars.set(userId, avatar);
    return avatar;
  }
}

export interface AvatarUpdatePayload {
  headColor?: string;
  torsoColor?: string;
  leftArmColor?: string;
  rightArmColor?: string;
  leftLegColor?: string;
  rightLegColor?: string;
  hatId?: string | null;
  shirtId?: string | null;
}

export function validateAvatarColors(payload: AvatarUpdatePayload): { valid: boolean; error?: string } {
  const colorFields: (keyof AvatarUpdatePayload)[] = [
    'headColor',
    'torsoColor',
    'leftArmColor',
    'rightArmColor',
    'leftLegColor',
    'rightLegColor'
  ];

  for (const field of colorFields) {
    const val = payload[field];
    if (val !== undefined && typeof val === 'string') {
      if (!HEX_COLOR_REGEX.test(val)) {
        return { valid: false, error: `Invalid hex color format for ${field}: ${val}` };
      }
    }
  }
  return { valid: true };
}

export function formatAvatarResponse(avatar: StoredUserAvatar) {
  return {
    userId: avatar.user_id,
    modelType: avatar.model_type,
    headColor: avatar.head_color,
    torsoColor: avatar.torso_color,
    leftArmColor: avatar.left_arm_color,
    rightArmColor: avatar.right_arm_color,
    leftLegColor: avatar.left_leg_color,
    rightLegColor: avatar.right_leg_color,
    hatId: avatar.hat_id,
    shirtId: avatar.shirt_id,
    updatedAt: avatar.updated_at
  };
}

export async function handleAvatarApiRequest(
  path: string,
  method: string,
  _headers: Record<string, string>,
  body: string | undefined,
  store: Avatar3DDataStore,
  verifiedUserId: string | null
): Promise<{ status: number; body: unknown }> {
  if (path === '/api/v1/avatars/me') {
    if (!verifiedUserId) {
      return { status: 401, body: { error: 'Unauthorized: Missing or invalid token' } };
    }

    if (method === 'GET') {
      let avatar = store.avatars.get(verifiedUserId);
      if (!avatar) {
        avatar = store.provisionStarterAvatar(verifiedUserId);
      }
      return { status: 200, body: { avatar: formatAvatarResponse(avatar) } };
    }

    if (method === 'PUT') {
      if (!body) {
        return { status: 400, body: { error: 'Request body required' } };
      }
      let parsed: AvatarUpdatePayload;
      try {
        parsed = JSON.parse(body) as AvatarUpdatePayload;
      } catch {
        return { status: 400, body: { error: 'Invalid JSON payload' } };
      }

      const validation = validateAvatarColors(parsed);
      if (!validation.valid) {
        return { status: 400, body: { error: validation.error } };
      }

      let avatar = store.avatars.get(verifiedUserId);
      if (!avatar) {
        avatar = store.provisionStarterAvatar(verifiedUserId);
      }

      const now = new Date().toISOString();
      if (parsed.headColor) avatar.head_color = parsed.headColor;
      if (parsed.torsoColor) avatar.torso_color = parsed.torsoColor;
      if (parsed.leftArmColor) avatar.left_arm_color = parsed.leftArmColor;
      if (parsed.rightArmColor) avatar.right_arm_color = parsed.rightArmColor;
      if (parsed.leftLegColor) avatar.left_leg_color = parsed.leftLegColor;
      if (parsed.rightLegColor) avatar.right_leg_color = parsed.rightLegColor;
      if (parsed.hatId !== undefined) avatar.hat_id = parsed.hatId;
      if (parsed.shirtId !== undefined) avatar.shirt_id = parsed.shirtId;
      avatar.updated_at = now;

      store.avatars.set(verifiedUserId, avatar);
      return { status: 200, body: { avatar: formatAvatarResponse(avatar), success: true } };
    }

    return { status: 405, body: { error: 'Method not allowed' } };
  }

  const match = path.match(/^\/api\/v1\/avatars\/([^/]+)$/);
  if (match && method === 'GET') {
    const targetUserId = match[1];
    const avatar = store.avatars.get(targetUserId);
    if (!avatar) {
      return { status: 404, body: { error: 'Avatar not found for user' } };
    }
    return { status: 200, body: { avatar: formatAvatarResponse(avatar) } };
  }

  return { status: 404, body: { error: 'Not found' } };
}

export function parseSqlMigrationSchema(sqlContent: string): {
  tableName: string;
  columns: string[];
  foreignKeys: string[];
  primaryKeys: string[];
} {
  const tableMatch = sqlContent.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
  const tableName = tableMatch ? tableMatch[1] : '';

  const columns: string[] = [];
  const foreignKeys: string[] = [];
  const primaryKeys: string[] = [];

  const lines = sqlContent.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/,$/, '');
    if (line.startsWith('--') || !line) continue;

    if (/PRIMARY\s+KEY/i.test(line)) {
      primaryKeys.push(line);
    }
    if (/FOREIGN\s+KEY/i.test(line) || /REFERENCES/i.test(line)) {
      foreignKeys.push(line);
    }
    const colMatch = line.match(/^([a-zA-Z0-9_]+)\s+(TEXT|INTEGER|REAL|BLOB|DATETIME|VARCHAR)/i);
    if (colMatch) {
      columns.push(colMatch[1]);
    }
  }

  return { tableName, columns, foreignKeys, primaryKeys };
}
