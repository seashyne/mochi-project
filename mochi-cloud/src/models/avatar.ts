// User 3D avatar domain model and database row mapping

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

export type UpdateAvatarInput = Partial<Omit<UserAvatar, 'userId' | 'updatedAt'>>;

export const DEFAULT_STARTER_AVATAR: Omit<UserAvatar, 'userId' | 'updatedAt'> = {
  modelType: 'humanoid_v1',
  headColor: '#fcd34d',
  torsoColor: '#0284c7',
  leftArmColor: '#fcd34d',
  rightArmColor: '#fcd34d',
  leftLegColor: '#1e293b',
  rightLegColor: '#1e293b',
  emoteIds: []
};

export interface UserAvatarRow {
  user_id: string;
  model_type: string;
  head_color: string;
  torso_color: string;
  left_arm_color: string;
  right_arm_color: string;
  left_leg_color: string;
  right_leg_color: string;
  hat_id?: string | null;
  shirt_id?: string | null;
  pants_id?: string | null;
  face_id?: string | null;
  hair_id?: string | null;
  back_id?: string | null;
  emote_ids?: string | null;
  updated_at: string;
}

function parseEmoteIds(jsonString?: string | null): string[] {
  if (!jsonString) return [];
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Maps raw D1 user_avatars database row to typed UserAvatar domain model
export function mapAvatarRow(row: UserAvatarRow): UserAvatar {
  return {
    userId: row.user_id,
    modelType: (row.model_type as 'humanoid_v1') || 'humanoid_v1',
    headColor: row.head_color,
    torsoColor: row.torso_color,
    leftArmColor: row.left_arm_color,
    rightArmColor: row.right_arm_color,
    leftLegColor: row.left_leg_color,
    rightLegColor: row.right_leg_color,
    hatId: row.hat_id || undefined,
    shirtId: row.shirt_id || undefined,
    pantsId: row.pants_id || undefined,
    faceId: row.face_id || undefined,
    hairId: row.hair_id || undefined,
    backId: row.back_id || undefined,
    emoteIds: parseEmoteIds(row.emote_ids),
    updatedAt: row.updated_at
  };
}

// Validates 3 or 6 digit hex color strings (e.g. #fcd34d)
export function isValidHexColor(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim());
}
