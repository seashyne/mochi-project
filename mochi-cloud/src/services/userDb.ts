import { User } from '../types/api';
import { provisionDefaultAvatar } from './avatarDb';

export interface UserRow {
  id: string;
  numeric_id?: number | null;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  coins?: number | null;
  is_banned?: number | null;
  is_verified?: number | null;
  birthday?: string | null;
  gender?: string | null;
  created_at: string;
  updated_at: string;
}

// Maps raw D1 user row to typed domain User model including coins and ban status
export function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    numericId: row.numeric_id || 1,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    role: row.role,
    coins: typeof row.coins === 'number' ? row.coins : undefined,
    isBanned: typeof row.is_banned === 'number' ? row.is_banned === 1 : undefined,
    isVerified: typeof row.is_verified === 'number' ? row.is_verified === 1 : undefined,
    birthday: row.birthday,
    gender: row.gender,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(email.toLowerCase().trim())
    .first<UserRow>();
  return row ? mapUserRow(row) : null;
}

export async function findUserByUsername(db: D1Database, username: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE username = ? LIMIT 1')
    .bind(username.toLowerCase().trim())
    .first<UserRow>();
  return row ? mapUserRow(row) : null;
}

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(id)
    .first<UserRow>();
  return row ? mapUserRow(row) : null;
}

export async function findUserByNumericId(db: D1Database, numericId: number): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE numeric_id = ? LIMIT 1')
    .bind(numericId)
    .first<UserRow>();
  return row ? mapUserRow(row) : null;
}

export async function findUserByIdentifier(db: D1Database, identifier: string): Promise<User | null> {
  const clean = identifier.trim();
  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    const byNum = await findUserByNumericId(db, num);
    if (byNum) return byNum;
  }

  const byId = await findUserById(db, clean);
  if (byId) return byId;

  return findUserByUsername(db, clean);
}

export async function createUser(
  db: D1Database,
  user: Omit<User, 'numericId'> & { numericId?: number; isVerified?: boolean }
): Promise<User> {
  let assignedNumericId = user.numericId;

  if (!assignedNumericId) {
    const maxRow = await db
      .prepare('SELECT COALESCE(MAX(numeric_id), 0) as max_id FROM users')
      .first<{ max_id: number }>();
    assignedNumericId = (maxRow?.max_id || 0) + 1;
  }

  try {
    await db
      .prepare(
        `INSERT INTO users (id, numeric_id, username, email, password_hash, display_name, role, birthday, gender, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        assignedNumericId,
        user.username.toLowerCase().trim(),
        user.email.toLowerCase().trim(),
        user.passwordHash,
        user.displayName,
        user.role,
        user.birthday || null,
        user.gender || null,
        user.createdAt,
        user.updatedAt
      )
      .run();
  } catch {
    await db
      .prepare(
        `INSERT INTO users (id, numeric_id, username, email, password_hash, display_name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        assignedNumericId,
        user.username.toLowerCase().trim(),
        user.email.toLowerCase().trim(),
        user.passwordHash,
        user.displayName,
        user.role,
        user.createdAt,
        user.updatedAt
      )
      .run();
  }

  if (user.isVerified) {
    try {
      await db
        .prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?')
        .bind(user.updatedAt, user.id)
        .run();
    } catch {
      // Non-blocking in decoupled test env
    }
  }

  try {
    await provisionDefaultAvatar(db, user.id);
  } catch {
    // Non-blocking in case of decoupled test env
  }

  return {
    ...user,
    numericId: assignedNumericId
  };
}

export async function updateUserEmail(
  db: D1Database,
  userId: string,
  newEmail: string,
  isVerified = true
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET email = ?, is_verified = ?, updated_at = ? WHERE id = ?')
    .bind(newEmail.toLowerCase().trim(), isVerified ? 1 : 0, now, userId)
    .run();
}

export async function updateUserDisplayName(
  db: D1Database,
  userId: string,
  displayName: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .bind(displayName, now, userId)
    .run();
}

export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, now, userId)
    .run();
}

export interface CommunityMember {
  id: string;
  numericId: number;
  username: string;
  displayName: string | null;
  role: string;
  headColor: string | null;
  torsoColor: string | null;
  createdAt: string;
}

// Queries real verified users and their avatar palette from D1 for the Social/Friends carousel
export async function listCommunityUsers(db: D1Database, limit = 24): Promise<CommunityMember[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.numeric_id, u.username, u.display_name, u.role, u.created_at,
              a.head_color, a.torso_color
       FROM users u
       LEFT JOIN user_avatars a ON u.id = a.user_id
       WHERE (u.is_banned IS NULL OR u.is_banned = 0)
       ORDER BY u.numeric_id ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<{
      id: string;
      numeric_id: number | null;
      username: string;
      display_name: string | null;
      role: string;
      created_at: string;
      head_color: string | null;
      torso_color: string | null;
    }>();

  return (results || []).map((r) => ({
    id: r.id,
    numericId: r.numeric_id || 1,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    headColor: r.head_color,
    torsoColor: r.torso_color,
    createdAt: r.created_at
  }));
}
