import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { RegisterRequest, LoginRequest } from '../types/api';
import {
  findUserByEmail,
  findUserByUsername,
  findUserById,
  findUserByIdentifier,
  createUser,
  listGames,
  provisionDefaultAvatar,
  listCommunityUsers,
  updateUserDisplayName,
  updateUserPassword
} from '../services/db';
import { hashPassword, verifyPassword, signToken, authMiddleware } from '../middleware/auth';
import { createOtpRecord } from '../services/otpService';
import { sendTransactionalEmail, buildOtpEmailTemplate } from '../services/emailService';
import { fetchUserFlags, sanitizeUser } from './authHelpers';
import { authVerificationRouter } from './authVerification';

export const authRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Mount email OTP, verification, and link routes
authRouter.route('/', authVerificationRouter);

// POST /api/v1/auth/register - Instant frictionless registration or legacy OTP flow
authRouter.post('/register', async (c) => {
  try {
    const body = (await c.req.json()) as RegisterRequest;
    const { username, password, displayName, birthday, gender } = body;
    let { email } = body;
    const instant = body.instant === true || !email || email.trim() === '';

    if (!username || username.trim().length < 3) {
      return c.json({ error: 'Username must be at least 3 characters' }, 400);
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      return c.json({ error: 'Username must be 3-20 characters (letters, numbers, underscores)' }, 400);
    }
    if (!password || password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    if (!email || email.trim() === '') {
      email = `${cleanUsername}@game.lenout.com`;
    }
    const cleanEmail = email.trim().toLowerCase();

    if (!instant && !cleanEmail.includes('@')) {
      return c.json({ error: 'Valid email is required' }, 400);
    }
    if (await findUserByUsername(c.env.DB, cleanUsername)) {
      return c.json({ error: 'Username is already taken' }, 409);
    }
    if (await findUserByEmail(c.env.DB, cleanEmail)) {
      return c.json({ error: 'Email is already registered' }, 409);
    }

    const salt = crypto.randomUUID();
    const passwordHash = `${salt}:${await hashPassword(password, salt)}`;
    const now = new Date().toISOString();

    const createdUser = await createUser(c.env.DB, {
      id: crypto.randomUUID(),
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      displayName: displayName?.trim() || cleanUsername,
      role: 'creator',
      isVerified: instant ? true : false,
      birthday: birthday?.trim() || null,
      gender: gender?.trim() || null,
      createdAt: now,
      updatedAt: now
    });

    try {
      await provisionDefaultAvatar(c.env.DB, createdUser.id);
    } catch {
      // Non-blocking in decoupled test env
    }

    if (instant) {
      const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
      const token = await signToken(
        { id: createdUser.id, numericId: createdUser.numericId, username: createdUser.username, email: createdUser.email, role: createdUser.role },
        secret,
        7 * 24 * 3600
      );
      return c.json({
        success: true,
        message: 'Account created successfully',
        userId: createdUser.id,
        email: cleanEmail,
        user: sanitizeUser(createdUser, true),
        token
      }, 201);
    }

    const { code, expiresAt } = await createOtpRecord(c.env.DB, createdUser.id, cleanEmail, 15);
    const emailTpl = buildOtpEmailTemplate(code, createdUser.displayName || createdUser.username);
    await sendTransactionalEmail(c.env, {
      toEmail: cleanEmail,
      toName: createdUser.displayName || createdUser.username,
      subject: emailTpl.subject,
      htmlContent: emailTpl.htmlContent,
      textContent: emailTpl.textContent
    });

    return c.json({
      success: true,
      message: 'Verification email sent',
      userId: createdUser.id,
      email: cleanEmail,
      expiresAt
    }, 201);
  } catch (err) {
    return c.json({ error: `Registration failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/login - Authenticate with email/username and password
authRouter.post('/login', async (c) => {
  try {
    const body = (await c.req.json()) as LoginRequest;
    const { email, password } = body;
    if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

    const cleanIdentifier = email.trim().toLowerCase();
    let user = await findUserByEmail(c.env.DB, cleanIdentifier);
    if (!user) user = await findUserByUsername(c.env.DB, cleanIdentifier);
    if (!user) return c.json({ error: 'Invalid credentials' }, 401);

    const [salt, expectedHash] = user.passwordHash.split(':');
    const isValid = await verifyPassword(password, salt, expectedHash);
    if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

    const userRow = await fetchUserFlags(c.env.DB, user.id);
    if (userRow?.is_banned === 1 || user.isBanned === true) {
      return c.json({ error: 'Account has been suspended' }, 403);
    }
    if (userRow && userRow.is_verified === 0) {
      return c.json({ error: 'Account not verified', requiresVerification: true, email: user.email }, 403);
    }

    const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
    const token = await signToken(
      { id: user.id, numericId: user.numericId, username: user.username, email: user.email, role: user.role },
      secret,
      7 * 24 * 3600
    );

    return c.json({ user: sanitizeUser(user, true, userRow), token }, 200);
  } catch (err) {
    return c.json({ error: `Login failed: ${(err as Error).message}` }, 500);
  }
});

// GET /api/v1/auth/me - Retrieve current authenticated user profile
authRouter.get('/me', authMiddleware, async (c) => {
  const sessionUser = c.get('user');
  if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

  const user = await findUserById(c.env.DB, sessionUser.id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const userRow = await fetchUserFlags(c.env.DB, user.id);
  if (userRow?.is_banned === 1 || user.isBanned === true) {
    return c.json({ error: 'Account has been suspended' }, 403);
  }

  return c.json({ user: sanitizeUser(user, userRow?.is_verified === 1, userRow) }, 200);
});

// PUT /api/v1/auth/me - Update the authenticated user's display name
authRouter.put('/me', authMiddleware, async (c) => {
  const sessionUser = c.get('user');
  if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json()) as { displayName?: string };
  const displayName = (body.displayName || '').trim();
  if (displayName.length < 1 || displayName.length > 30) {
    return c.json({ error: 'Display name must be 1-30 characters' }, 400);
  }

  const user = await findUserById(c.env.DB, sessionUser.id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  await updateUserDisplayName(c.env.DB, user.id, displayName);
  const updated = await findUserById(c.env.DB, user.id);
  const flags = await fetchUserFlags(c.env.DB, user.id);
  return c.json({ user: sanitizeUser(updated || user, flags?.is_verified === 1, flags) }, 200);
});

// POST /api/v1/auth/change-password - Rotate password after verifying the current one
authRouter.post('/change-password', authMiddleware, async (c) => {
  const sessionUser = c.get('user');
  if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json()) as { currentPassword?: string; newPassword?: string };
  if (!body.currentPassword || !body.newPassword || body.newPassword.length < 6) {
    return c.json({ error: 'New password must be at least 6 characters' }, 400);
  }

  const user = await findUserById(c.env.DB, sessionUser.id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const [salt, expectedHash] = user.passwordHash.split(':');
  if (!(await verifyPassword(body.currentPassword, salt, expectedHash))) {
    return c.json({ error: 'Current password is incorrect' }, 403);
  }

  const newSalt = crypto.randomUUID();
  const passwordHash = `${newSalt}:${await hashPassword(body.newPassword, newSalt)}`;
  await updateUserPassword(c.env.DB, user.id, passwordHash);
  return c.json({ success: true, message: 'Password updated' }, 200);
});

// GET /api/v1/auth/community - Real registered platform creators and players roster
authRouter.get('/community', async (c) => {
  const users = await listCommunityUsers(c.env.DB, 24);
  return c.json({ users }, 200);
});

// GET /api/v1/auth/users/:identifier - Public player profile by numeric ID, UUID, or username
authRouter.get('/users/:identifier', async (c) => {
  const identifier = c.req.param('identifier');
  if (!identifier) return c.json({ error: 'Identifier is required' }, 400);

  const user = await findUserByIdentifier(c.env.DB, identifier);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const userRow = await fetchUserFlags(c.env.DB, user.id);
  const gamesRes = await listGames(c.env.DB, { creatorId: user.id, limit: 12 });
  return c.json({ user: sanitizeUser(user, userRow?.is_verified === 1, userRow), games: gamesRes.games }, 200);
});
