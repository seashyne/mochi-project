import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import { adminMiddleware } from '../middleware/admin';
import {
  AdminUserRole,
  AdminGameStatus,
  getAdminStats,
  listAdminUsers,
  updateAdminUser,
  listAdminGames,
  moderateAdminGame,
  listAdminAuditLogs
} from '../services/adminDb';

const VALID_ROLES: ReadonlySet<string> = new Set(['player', 'creator', 'admin']);
const VALID_GAME_STATUSES: ReadonlySet<string> = new Set(['draft', 'published', 'rejected', 'archived']);

export const adminRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Protect all Administrative Backoffice endpoints with live RBAC verification
adminRouter.use('*', adminMiddleware);

// GET /api/v1/admin/stats - Retrieve real-time platform KPIs and telemetry counts
adminRouter.get('/stats', async (c) => {
  const stats = await getAdminStats(c.env.DB);
  return c.json({ ok: true, stats }, 200);
});

// GET /api/v1/admin/users - Paginated user directory with optional search filter
adminRouter.get('/users', async (c) => {
  const query = c.req.query('query') ?? c.req.query('search') ?? '';
  const page = parseInt(c.req.query('page') || '1', 10) || 1;
  const limit = parseInt(c.req.query('limit') || '20', 10) || 20;

  const result = await listAdminUsers(c.env.DB, { query, page, limit });
  return c.json({ ok: true, ...result }, 200);
});

// PATCH /api/v1/admin/users/:id - Update user suspension, coins, or role with audit logging
adminRouter.patch('/users/:id', async (c) => {
  const admin = c.get('user');
  if (!admin) return c.json({ error: 'Unauthorized' }, 401);

  const userId = c.req.param('id');
  if (!userId) return c.json({ error: 'User ID is required' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    isBanned?: unknown;
    coins?: unknown;
    role?: unknown;
  } | null;

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Valid JSON payload is required' }, 400);
  }

  if (body.role !== undefined && (typeof body.role !== 'string' || !VALID_ROLES.has(body.role))) {
    return c.json({ error: 'Invalid role. Allowed roles: player, creator, admin' }, 400);
  }
  if (body.coins !== undefined && (typeof body.coins !== 'number' || !Number.isFinite(body.coins))) {
    return c.json({ error: 'Invalid coins value' }, 400);
  }
  if (body.isBanned !== undefined && typeof body.isBanned !== 'boolean') {
    return c.json({ error: 'Invalid isBanned flag' }, 400);
  }

  const updated = await updateAdminUser(
    c.env.DB,
    userId,
    {
      isBanned: body.isBanned as boolean | undefined,
      coins: body.coins as number | undefined,
      role: body.role as AdminUserRole | undefined
    },
    { id: admin.id, username: admin.username }
  );

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ ok: true, user: updated }, 200);
});

// GET /api/v1/admin/games - Paginated game submissions across draft/published/rejected/archived
adminRouter.get('/games', async (c) => {
  const query = c.req.query('query') ?? c.req.query('search') ?? '';
  const status = c.req.query('status') || undefined;
  const page = parseInt(c.req.query('page') || '1', 10) || 1;
  const limit = parseInt(c.req.query('limit') || '20', 10) || 20;

  const result = await listAdminGames(c.env.DB, { query, status, page, limit });
  return c.json({ ok: true, ...result }, 200);
});

// PATCH /api/v1/admin/games/:id - Approve, reject, archive, or feature a game submission
adminRouter.patch('/games/:id', async (c) => {
  const admin = c.get('user');
  if (!admin) return c.json({ error: 'Unauthorized' }, 401);

  const gameId = c.req.param('id');
  if (!gameId) return c.json({ error: 'Game ID is required' }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    status?: unknown;
    isFeatured?: unknown;
  } | null;

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Valid JSON payload is required' }, 400);
  }

  if (body.status !== undefined && (typeof body.status !== 'string' || !VALID_GAME_STATUSES.has(body.status))) {
    return c.json({ error: 'Invalid game status' }, 400);
  }
  if (body.isFeatured !== undefined && typeof body.isFeatured !== 'boolean') {
    return c.json({ error: 'Invalid isFeatured flag' }, 400);
  }

  const moderated = await moderateAdminGame(
    c.env.DB,
    gameId,
    {
      status: body.status as AdminGameStatus | undefined,
      isFeatured: body.isFeatured as boolean | undefined
    },
    { id: admin.id, username: admin.username }
  );

  if (!moderated) {
    return c.json({ error: 'Game not found' }, 404);
  }

  return c.json({ ok: true, game: moderated }, 200);
});

// GET /api/v1/admin/audit-logs - Paginated administrative audit logs ordered newest first
adminRouter.get('/audit-logs', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10) || 1;
  const limit = parseInt(c.req.query('limit') || '50', 10) || 50;

  const result = await listAdminAuditLogs(c.env.DB, { page, limit });
  return c.json({ ok: true, ...result }, 200);
});
