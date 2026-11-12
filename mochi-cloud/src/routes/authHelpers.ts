// Authentication route helpers: user sanitization and D1 account flag lookups

import { User, UserPublic } from '../types/api';

export interface UserAccountFlags {
  is_verified?: number;
  is_banned?: number;
  coins?: number;
}

// Defensively loads verification, suspension, and coin columns from D1 or legacy mocks
export async function fetchUserFlags(db: D1Database, userId: string): Promise<UserAccountFlags | null> {
  try {
    return await db
      .prepare('SELECT is_verified, is_banned, coins FROM users WHERE id = ?')
      .bind(userId)
      .first<UserAccountFlags>();
  } catch {
    return await db
      .prepare('SELECT is_verified FROM users WHERE id = ?')
      .bind(userId)
      .first<UserAccountFlags>();
  }
}

// Strips sensitive password fields and attaches verification, coin, and ban metadata
export function sanitizeUser(user: User, isVerified = true, flags?: UserAccountFlags | null): UserPublic {
  const result: UserPublic = {
    id: user.id,
    numericId: user.numericId,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isVerified,
    birthday: user.birthday,
    gender: user.gender
  };
  const resolvedCoins = typeof flags?.coins === 'number' ? flags.coins : user.coins;
  if (typeof resolvedCoins === 'number') {
    result.coins = resolvedCoins;
  }
  if (typeof flags?.is_banned === 'number') {
    result.isBanned = flags.is_banned === 1;
  } else if (typeof user.isBanned === 'boolean') {
    result.isBanned = user.isBanned;
  }
  return result;
}
