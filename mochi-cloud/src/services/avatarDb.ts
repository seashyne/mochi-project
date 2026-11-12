// Database service operations for user 3D avatars

import {
  UserAvatar,
  UserAvatarRow,
  UpdateAvatarInput,
  DEFAULT_STARTER_AVATAR,
  mapAvatarRow,
  isValidHexColor
} from '../models/avatar';

// Fetches an avatar by user ID from D1
export async function getAvatarByUserId(
  db: D1Database,
  userId: string
): Promise<UserAvatar | null> {
  const row = await db
    .prepare('SELECT * FROM user_avatars WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<UserAvatarRow>();
  return row ? mapAvatarRow(row) : null;
}

// Automatically provisions a default starter 3D avatar if not already present
export async function provisionDefaultAvatar(
  db: D1Database,
  userId: string
): Promise<UserAvatar> {
  const existing = await getAvatarByUserId(db, userId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const avatar: UserAvatar = {
    userId,
    ...DEFAULT_STARTER_AVATAR,
    updatedAt: now
  };

  await db
    .prepare(
      `INSERT OR IGNORE INTO user_avatars (
        user_id, model_type, head_color, torso_color,
        left_arm_color, right_arm_color, left_leg_color, right_leg_color,
        hat_id, shirt_id, pants_id, face_id, hair_id, back_id, emote_ids, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      avatar.userId,
      avatar.modelType,
      avatar.headColor,
      avatar.torsoColor,
      avatar.leftArmColor,
      avatar.rightArmColor,
      avatar.leftLegColor,
      avatar.rightLegColor,
      avatar.hatId || null,
      avatar.shirtId || null,
      avatar.pantsId || null,
      avatar.faceId || null,
      avatar.hairId || null,
      avatar.backId || null,
      JSON.stringify(avatar.emoteIds || []),
      avatar.updatedAt
    )
    .run();

  const saved = await getAvatarByUserId(db, userId);
  return saved || avatar;
}

// Updates an existing avatar or provisions and applies customizations
export async function updateAvatar(
  db: D1Database,
  userId: string,
  updates: UpdateAvatarInput
): Promise<UserAvatar> {
  const current = await provisionDefaultAvatar(db, userId);

  const headColor = updates.headColor && isValidHexColor(updates.headColor)
    ? updates.headColor
    : current.headColor;
  const torsoColor = updates.torsoColor && isValidHexColor(updates.torsoColor)
    ? updates.torsoColor
    : current.torsoColor;
  const leftArmColor = updates.leftArmColor && isValidHexColor(updates.leftArmColor)
    ? updates.leftArmColor
    : current.leftArmColor;
  const rightArmColor = updates.rightArmColor && isValidHexColor(updates.rightArmColor)
    ? updates.rightArmColor
    : current.rightArmColor;
  const leftLegColor = updates.leftLegColor && isValidHexColor(updates.leftLegColor)
    ? updates.leftLegColor
    : current.leftLegColor;
  const rightLegColor = updates.rightLegColor && isValidHexColor(updates.rightLegColor)
    ? updates.rightLegColor
    : current.rightLegColor;
  const hatId = updates.hatId !== undefined ? updates.hatId : (current.hatId || null);
  const shirtId = updates.shirtId !== undefined ? updates.shirtId : (current.shirtId || null);
  const pantsId = updates.pantsId !== undefined ? updates.pantsId : (current.pantsId || null);
  const faceId = updates.faceId !== undefined ? updates.faceId : (current.faceId || null);
  const hairId = updates.hairId !== undefined ? updates.hairId : (current.hairId || null);
  const backId = updates.backId !== undefined ? updates.backId : (current.backId || null);
  const emoteIds = updates.emoteIds !== undefined ? updates.emoteIds : (current.emoteIds || []);
  const modelType = updates.modelType || current.modelType;
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE user_avatars
       SET model_type = ?, head_color = ?, torso_color = ?,
           left_arm_color = ?, right_arm_color = ?,
           left_leg_color = ?, right_leg_color = ?,
           hat_id = ?, shirt_id = ?, pants_id = ?, face_id = ?, hair_id = ?, back_id = ?, emote_ids = ?, updated_at = ?
       WHERE user_id = ?`
    )
    .bind(
      modelType,
      headColor,
      torsoColor,
      leftArmColor,
      rightArmColor,
      leftLegColor,
      rightLegColor,
      hatId,
      shirtId,
      pantsId,
      faceId,
      hairId,
      backId,
      JSON.stringify(emoteIds),
      now,
      userId
    )
    .run();

  const updated = await getAvatarByUserId(db, userId);
  return (
    updated || {
      userId,
      modelType,
      headColor,
      torsoColor,
      leftArmColor,
      rightArmColor,
      leftLegColor,
      rightLegColor,
      hatId: hatId || undefined,
      shirtId: shirtId || undefined,
      pantsId: pantsId || undefined,
      faceId: faceId || undefined,
      hairId: hairId || undefined,
      backId: backId || undefined,
      emoteIds,
      updatedAt: now
    }
  );
}
