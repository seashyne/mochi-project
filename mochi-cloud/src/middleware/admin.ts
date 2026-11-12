import { Context, Next } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { verifyToken } from './auth';

interface AdminTokenPayload {
  id: string;
  username?: string;
  email?: string;
  role?: string;
}

interface LiveAdminUserRow {
  id: string;
  username: string;
  email: string;
  role?: string | null;
  is_banned?: number | null;
}

// Role-Based Access Control (RBAC) middleware enforcing live administrator privileges
export async function adminMiddleware(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
  const payload = await verifyToken<AdminTokenPayload>(token, secret);
  if (!payload || !payload.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Verify live account status and role directly against D1 to prevent stale privilege escalation
  const dbUser = await c.env.DB
    .prepare('SELECT id, username, email, role, is_banned FROM users WHERE id = ?')
    .bind(payload.id)
    .first<LiveAdminUserRow>();

  if (!dbUser) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const effectiveRole = dbUser.role || payload.role;
  if (dbUser.is_banned === 1 || effectiveRole !== 'admin') {
    return c.json({ error: 'Forbidden: Administrator role required' }, 403);
  }

  c.set('user', {
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    role: 'admin'
  });

  await next();
}
