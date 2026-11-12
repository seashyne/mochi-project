// Real Authentication Recovery, Password Reset, and Passwordless OTP Login Routes
// Connects to Cloudflare D1 and transactional email service

import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { findUserByEmail, findUserById, createUser } from '../services/db';
import { createOtpRecord, verifyOtpCode, checkResendCooldown } from '../services/otpService';
import { sendTransactionalEmail } from '../services/emailService';
import { hashPassword, signToken, authMiddleware } from '../middleware/auth';

export const authRecoveryRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

function buildResetEmailHtml(code: string, username: string): { subject: string; htmlContent: string; textContent: string } {
  const subject = `${code} is your Mochi password reset code`;
  const textContent = `Hello ${username},\n\nYour password reset code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this, please ignore this email.`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, sans-serif; background-color: #0b0e14; color: #e2e8f0; margin: 0; padding: 32px 16px;">
  <div style="max-width: 500px; margin: 0 auto; background: #111520; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 32px;">
    <h2 style="color: #ffffff; margin-top: 0;">Reset Your Mochi Password</h2>
    <p style="color: #94a3b8; font-size: 14px;">Hello <strong>${username}</strong>,</p>
    <p style="color: #94a3b8; font-size: 14px;">Use the verification code below to reset your password:</p>
    <div style="background: #171d2c; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
      <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #38bdf8;">${code}</span>
    </div>
    <p style="color: #64748b; font-size: 12px;">This code expires in 15 minutes. Never share this code with anyone.</p>
  </div>
</body>
</html>`.trim();
  return { subject, htmlContent, textContent };
}

// POST /api/v1/auth/forgot-password - Dispatch real password reset OTP code
authRecoveryRouter.post('/forgot-password', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const { email } = body;
    if (!email || !email.includes('@')) {
      return c.json({ error: 'Valid email is required' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(c.env.DB, cleanEmail);
    if (!user) {
      // Return 200 with generic message for privacy protection
      return c.json({ success: true, message: 'If an account exists, a reset code was sent', email: cleanEmail }, 200);
    }

    const cooldown = await checkResendCooldown(c.env.DB, cleanEmail, 60);
    if (!cooldown.allowed) {
      return c.json({ error: 'Please wait before requesting another code', retryAfterSeconds: cooldown.waitSeconds }, 429);
    }

    const { code, expiresAt } = await createOtpRecord(c.env.DB, user.id, cleanEmail, 15);
    const emailTpl = buildResetEmailHtml(code, user.displayName || user.username);
    await sendTransactionalEmail(c.env, {
      toEmail: cleanEmail,
      toName: user.displayName || user.username,
      subject: emailTpl.subject,
      htmlContent: emailTpl.htmlContent,
      textContent: emailTpl.textContent
    });

    return c.json({ success: true, message: 'Password reset code sent', email: cleanEmail, expiresAt }, 200);
  } catch (err) {
    return c.json({ error: `Password reset request failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/reset-password - Verify OTP and update password
authRecoveryRouter.post('/reset-password', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
      newPassword?: string;
    };
    const { email, code, newPassword } = body;
    if (!email || !code || !newPassword) {
      return c.json({ error: 'Email, code, and newPassword are required' }, 400);
    }
    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const otpRes = await verifyOtpCode(c.env.DB, cleanEmail, code.trim());
    if (!otpRes.success || !otpRes.userId) {
      return c.json({ error: otpRes.error || 'Invalid or expired verification code' }, 400);
    }

    const salt = crypto.randomUUID();
    const passwordHash = `${salt}:${await hashPassword(newPassword, salt)}`;
    const now = new Date().toISOString();

    await c.env.DB
      .prepare('UPDATE users SET password_hash = ?, is_verified = 1, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, otpRes.userId)
      .run();

    const user = await findUserById(c.env.DB, otpRes.userId);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
    const token = await signToken(
      { id: user.id, numericId: user.numericId, username: user.username, email: user.email, role: user.role },
      secret,
      7 * 24 * 3600
    );

    return c.json({
      success: true,
      message: 'Password reset successfully',
      user: {
        id: user.id,
        numericId: user.numericId,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isVerified: true
      },
      token
    }, 200);
  } catch (err) {
    return c.json({ error: `Password reset failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/email-code-login - Dispatch 6-digit login OTP for passwordless sign-in
authRecoveryRouter.post('/email-code-login', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const { email } = body;
    if (!email || !email.includes('@')) {
      return c.json({ error: 'Valid email is required' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await findUserByEmail(c.env.DB, cleanEmail);

    // Auto-provision verified player account if first time
    if (!user) {
      const generatedUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16) || `user_${Date.now().toString().slice(-4)}`;
      const salt = crypto.randomUUID();
      const tempHash = `${salt}:${await hashPassword(crypto.randomUUID(), salt)}`;
      const now = new Date().toISOString();
      user = await createUser(c.env.DB, {
        id: crypto.randomUUID(),
        username: generatedUsername,
        email: cleanEmail,
        passwordHash: tempHash,
        displayName: generatedUsername,
        role: 'player',
        createdAt: now,
        updatedAt: now
      });
      // Mark verified
      await c.env.DB.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').bind(user.id).run();
    }

    const { code, expiresAt } = await createOtpRecord(c.env.DB, user.id, cleanEmail, 15);
    const subject = `${code} is your Mochi sign-in code`;
    const textContent = `Your sign-in code is: ${code}\nExpires in 15 minutes.`;
    const htmlContent = `
<!DOCTYPE html><html><body style="font-family: sans-serif; background: #0b0e14; color: #e2e8f0; padding: 24px;">
<div style="max-width: 480px; margin: 0 auto; background: #111520; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px;">
  <h2 style="color: #fff; margin-top: 0;">Sign In to Mochi</h2>
  <p style="color: #94a3b8;">Your 6-digit login code is:</p>
  <div style="background: #171d2c; border: 1px solid #38bdf8; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
    <span style="font-family: monospace; font-size: 32px; font-weight: 800; color: #38bdf8; letter-spacing: 0.2em;">${code}</span>
  </div>
  <p style="color: #64748b; font-size: 12px;">Expires in 15 minutes.</p>
</div></body></html>`.trim();

    await sendTransactionalEmail(c.env, {
      toEmail: cleanEmail,
      toName: user.displayName || user.username,
      subject,
      htmlContent,
      textContent
    });

    return c.json({ success: true, message: 'Login code sent to email', email: cleanEmail, expiresAt }, 200);
  } catch (err) {
    return c.json({ error: `Login code dispatch failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/verify-login-code - Validate login code and issue JWT token
authRecoveryRouter.post('/verify-login-code', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; code?: string };
    const { email, code } = body;
    if (!email || !code) return c.json({ error: 'Email and code are required' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const result = await verifyOtpCode(c.env.DB, cleanEmail, code.trim());
    if (!result.success || !result.userId) {
      return c.json({ error: result.error || 'Invalid or expired code' }, 400);
    }

    const user = await findUserById(c.env.DB, result.userId);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
    const token = await signToken(
      { id: user.id, numericId: user.numericId, username: user.username, email: user.email, role: user.role },
      secret,
      7 * 24 * 3600
    );

    return c.json({
      success: true,
      user: {
        id: user.id,
        numericId: user.numericId,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        coins: user.coins,
        isVerified: true
      },
      token
    }, 200);
  } catch (err) {
    return c.json({ error: `Login verification failed: ${(err as Error).message}` }, 500);
  }
});

// POST /api/v1/auth/coins/add - Real-time coin award on gameplay rewards
authRecoveryRouter.post('/coins/add', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { amount?: number };
  const amount = Math.max(1, Math.min(1000, Number(body.amount) || 10));

  await c.env.DB
    .prepare('UPDATE users SET coins = coins + ?, updated_at = ? WHERE id = ?')
    .bind(amount, new Date().toISOString(), user.id)
    .run();

  const row = await c.env.DB.prepare('SELECT coins FROM users WHERE id = ?').bind(user.id).first<{ coins: number }>();
  return c.json({ success: true, coins: row?.coins ?? 100 }, 200);
});
