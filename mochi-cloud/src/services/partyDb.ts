// Persistence for short-lived lobby / party matchmaking codes. A code pins a
// game to one room shard so a group of players can join the same Durable Object.

export interface Party {
  code: string;
  gameId: string;
  roomId: string;
  shard: number;
  hostUserId: string | null;
  createdAt: string;
  expiresAt: string;
}

interface PartyRow {
  code: string;
  game_id: string;
  room_id: string;
  shard: number;
  host_user_id: string | null;
  created_at: string;
  expires_at: string;
}

// Uppercase alphanumeric alphabet with look-alike characters removed so codes
// can be read aloud or typed without confusion (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 8;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function mapParty(row: PartyRow): Party {
  return {
    code: row.code,
    gameId: row.game_id,
    roomId: row.room_id,
    shard: Number(row.shard),
    hostUserId: row.host_user_id ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

/** Creates a party with a fresh 6-char code, retrying on the rare collision. */
export async function createParty(
  db: D1Database,
  gameId: string,
  roomId: string,
  shard: number,
  hostUserId: string | null,
  ttlSeconds: number
): Promise<Party> {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode();
    const existing = await db
      .prepare('SELECT code FROM room_parties WHERE code = ?')
      .bind(code)
      .first();
    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO room_parties
           (code, game_id, room_id, shard, host_user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(code, gameId, roomId, shard, hostUserId, createdAt, expiresAt)
      .run();

    return { code, gameId, roomId, shard, hostUserId, createdAt, expiresAt };
  }

  throw new Error('Unable to allocate a unique party code');
}

/** Returns the raw party row for a code, or null when absent. */
export async function getParty(db: D1Database, code: string): Promise<Party | null> {
  const row = await db
    .prepare('SELECT * FROM room_parties WHERE code = ?')
    .bind(code)
    .first<PartyRow>();
  return row ? mapParty(row) : null;
}

/** Deletes every party whose expiry is at or before the given ISO timestamp. */
export async function deleteExpiredParties(db: D1Database, nowIso: string): Promise<void> {
  await db
    .prepare('DELETE FROM room_parties WHERE expires_at <= ?')
    .bind(nowIso)
    .run();
}
