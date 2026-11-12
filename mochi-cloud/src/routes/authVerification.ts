// Email verification, OTP confirmation, and email link routes for Mochi Cloud

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { findUserByEmail, findUserById, updateUserEmail, provisionDefaultAvatar } from '../services/db';
import { signToken, authMiddleware } from '../middleware/auth';
import { createOtpRecord, verifyOtpCode, checkResendCooldown } from '../services/otpService';
import { sendTransactionalEmail, buildOtpEmailTemplate } from '../services/emailService';
import { sanitizeUser } from './authHelpers';

export const authVerificationRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// POST /api/v1/auth/verify-otp - Validate 6-digit OTP code and issue session JWT
authVerificationRouter.post('/verify-otp', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string };
    const { email, code } = body;
    if (!email || !code) return c.json({ error: 'Email and verification code are required' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const result = await verifyOtpCode(c.env.DB, cleanEmail, code.trim());
    if (!result.success || !result.userId) {
      return c.json({ error: result.error || 'Invalid or expired verification code' }, 400);
    }

    const user = await findUserById(c.env.DB, result.userId);
    if (!user) return c.json({ error: 'User record not found' }, 404);

    try {
      await provisionDefaultAvatar(c.env.DB, user.id);
    } catch {
      // Non-blocking in decoupled test env
    }

    const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
    const token = await signToken(
      { id: user.id, numericId: user.numericId, username: user.username, email: user.email, role: user.role },
      secret,
      7 * 24 * 3600
    );

    return c.json({ success: true, user: sanitizeUser(user, true), token }, 200);
  } catch (err) {
    return c.json({ error: `Verification failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/resend-otp - Re-dispatch fresh OTP code enforcing 60s cooldown
authVerificationRouter.post('/resend-otp', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const { email } = body;
    if (!email || !email.includes('@')) return c.json({ error: 'Valid email is required' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(c.env.DB, cleanEmail);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const userRow = await c.env.DB
      .prepare('SELECT is_verified FROM users WHERE id = ?')
      .bind(user.id)
      .first<{ is_verified: number }>();
    if (userRow?.is_verified === 1) return c.json({ error: 'Account is already verified' }, 400);

    const cooldown = await checkResendCooldown(c.env.DB, cleanEmail, 60);
    if (!cooldown.allowed) {
      return c.json({ error: 'Please wait before requesting another verification code', retryAfterSeconds: cooldown.waitSeconds }, 429);
    }

    const { code, expiresAt } = await createOtpRecord(c.env.DB, user.id, cleanEmail, 15);
    const emailTpl = buildOtpEmailTemplate(code, user.displayName || user.username);
    await sendTransactionalEmail(c.env, {
      toEmail: cleanEmail,
      toName: user.displayName || user.username,
      subject: emailTpl.subject,
      htmlContent: emailTpl.htmlContent,
      textContent: emailTpl.textContent
    });

    return c.json({ success: true, message: 'New OTP sent', expiresAt }, 200);
  } catch (err) {
    return c.json({ error: `Failed to resend verification code: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/request-email-verification - Send OTP to link / verify email later
authVerificationRouter.post('/request-email-verification', authMiddleware, async (c) => {
  try {
    const sessionUser = c.get('user');
    if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const { email } = body;
    if (!email || !email.includes('@')) return c.json({ error: 'Valid email is required' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const existing = await findUserByEmail(c.env.DB, cleanEmail);
    if (existing && existing.id !== sessionUser.id) {
      return c.json({ error: 'Email is already registered' }, 409);
    }

    const cooldown = await checkResendCooldown(c.env.DB, cleanEmail, 60);
    if (!cooldown.allowed) {
      return c.json({ error: 'Please wait before requesting another verification code', retryAfterSeconds: cooldown.waitSeconds }, 429);
    }

    const { code, expiresAt } = await createOtpRecord(c.env.DB, sessionUser.id, cleanEmail, 15);
    const emailTpl = buildOtpEmailTemplate(code, sessionUser.username);
    await sendTransactionalEmail(c.env, {
      toEmail: cleanEmail,
      toName: sessionUser.username,
      subject: emailTpl.subject,
      htmlContent: emailTpl.htmlContent,
      textContent: emailTpl.textContent
    });

    return c.json({ success: true, message: 'Verification code sent', email: cleanEmail, expiresAt }, 200);
  } catch (err) {
    return c.json({ error: `Failed to send code: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/confirm-email-verification - Confirm OTP and set verified email
authVerificationRouter.post('/confirm-email-verification', authMiddleware, async (c) => {
  try {
    const sessionUser = c.get('user');
    if (!sessionUser) return c.json({ error: 'Unauthorized' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string };
    const { email, code } = body;
    if (!email || !code) return c.json({ error: 'Email and verification code are required' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const result = await verifyOtpCode(c.env.DB, cleanEmail, code.trim());
    if (!result.success || !result.userId || result.userId !== sessionUser.id) {
      return c.json({ error: result.error || 'Invalid or expired verification code' }, 400);
    }

    await updateUserEmail(c.env.DB, sessionUser.id, cleanEmail, true);
    const updated = await findUserById(c.env.DB, sessionUser.id);
    if (!updated) return c.json({ error: 'User not found' }, 404);

    return c.json({ success: true, message: 'Email verified successfully', user: sanitizeUser(updated, true) }, 200);
  } catch (err) {
    return c.json({ error: `Failed to confirm email: ${(err as Error).message}` }, 500);
  }
});
