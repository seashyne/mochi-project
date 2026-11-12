// One-Time Password (OTP) verification service for user email activation

export interface OtpRow {
  id: string;
  user_id: string;
  email: string;
  code: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export interface CooldownCheckResult {
  allowed: boolean;
  waitSeconds?: number;
}

// Generates a cryptographically secure 6-digit numeric OTP code
export function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = 100000 + (array[0] % 900000);
  return code.toString();
}

// Creates and stores a new 6-digit OTP code in D1, expiring in ttlMinutes (default 15)
export async function createOtpRecord(
  db: D1Database,
  userId: string,
  email: string,
  ttlMinutes = 15
): Promise<{ code: string; expiresAt: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const code = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  const createdAt = now.toISOString();
  const id = crypto.randomUUID();

  // Clear any existing active OTP codes for this user or email
  await db
    .prepare('DELETE FROM email_verification_otps WHERE user_id = ? OR email = ?')
    .bind(userId, cleanEmail)
    .run();

  // Insert the new OTP challenge record
  await db
    .prepare(
      `INSERT INTO email_verification_otps (id, user_id, email, code, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, cleanEmail, code, expiresAt, 0, createdAt)
    .run();

  return { code, expiresAt };
}

// Checks if the user is currently throttled by the 60-second resend cooldown
export async function checkResendCooldown(
  db: D1Database,
  email: string,
  cooldownSeconds = 60
): Promise<CooldownCheckResult> {
  const cleanEmail = email.trim().toLowerCase();
  const row = await db
    .prepare(
      'SELECT * FROM email_verification_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(cleanEmail)
    .first<OtpRow>();

  if (!row) {
    return { allowed: true };
  }

  const createdAtMs = new Date(row.created_at).getTime();
  const elapsedMs = Date.now() - createdAtMs;
  const cooldownMs = cooldownSeconds * 1000;

  if (elapsedMs < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
    return {
      allowed: false,
      waitSeconds: remainingSeconds > 0 ? remainingSeconds : 1
    };
  }

  return { allowed: true };
}

// Validates the submitted 6-digit OTP code against D1 records
export async function verifyOtpCode(
  db: D1Database,
  email: string,
  code: string
): Promise<VerifyOtpResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const row = await db
    .prepare(
      'SELECT * FROM email_verification_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(cleanEmail)
    .first<OtpRow>();

  if (!row) {
    return {
      success: false,
      error: 'No pending verification code found for this email'
    };
  }

  // Maximum 5 failed verification attempts before locking out the code
  if (row.attempts >= 5) {
    return {
      success: false,
      error: 'Too many failed attempts. Please request a new code.'
    };
  }

  // Check if OTP code has expired
  const now = new Date().getTime();
  const expiryTime = new Date(row.expires_at).getTime();
  if (now > expiryTime) {
    return {
      success: false,
      error: 'Verification code has expired. Please request a new code.'
    };
  }

  // Verify the code matches
  if (row.code !== cleanCode) {
    // Increment attempts counter
    await db
      .prepare('UPDATE email_verification_otps SET attempts = attempts + 1 WHERE id = ?')
      .bind(row.id)
      .run();

    const remainingAttempts = 5 - (row.attempts + 1);
    const attemptWarning = remainingAttempts > 0
      ? ` (${remainingAttempts} attempts remaining)`
      : ' (code locked)';

    return {
      success: false,
      error: `Invalid verification code${attemptWarning}`
    };
  }

  // Code is valid: Mark user as verified in users table
  const updateTime = new Date().toISOString();
  await db
    .prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?')
    .bind(updateTime, row.user_id)
    .run();

  // Invalidate and remove verified OTP record
  await db
    .prepare('DELETE FROM email_verification_otps WHERE id = ?')
    .bind(row.id)
    .run();

  return {
    success: true,
    userId: row.user_id
  };
}
