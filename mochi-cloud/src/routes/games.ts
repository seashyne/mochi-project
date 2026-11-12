import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';
import {
  Game,
  GameVersion,
  CreateGameRequest,
  PublishVersionRequest,
  GameListResponse,
  GameDetailResponse
} from '../types/api';
import {
  listGames,
  findGameByIdOrSlug,
  createGame,
  createGameVersion,
  listGameVersionsByGameId
} from '../services/db';
import { authMiddleware } from '../middleware/auth';
import { inspectManifest } from '../services/manifestValidation';
import { validateManifestAssets } from '../services/manifestAssets';

export const gamesRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/v1/games - Discover and list games
gamesRouter.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const status = c.req.query('status') || 'published';
  const search = c.req.query('search') || undefined;

  const result = await listGames(c.env.DB, { page, limit, status, search });
  const response: GameListResponse = {
    games: result.games,
    total: result.total,
    page,
    limit
  };

  return c.json(response, 200);
});

// GET /api/v1/games/:id - Fetch game details and published versions by ID or slug
gamesRouter.get('/:id', async (c) => {
  const idOrSlug = c.req.param('id');
  if (!idOrSlug) {
    return c.json({ error: 'Game ID or slug is required' }, 400);
  }
  const game = await findGameByIdOrSlug(c.env.DB, idOrSlug);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  const versions = await listGameVersionsByGameId(c.env.DB, game.id);
  const response: GameDetailResponse = {
    game,
    versions
  };

  return c.json(response, 200);
});

// POST /api/v1/games - Create a new draft game (Creator authentication required)
gamesRouter.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = (await c.req.json()) as CreateGameRequest;
    const { title, description, thumbnailUrl } = body;

    if (!title || title.trim().length === 0) {
      return c.json({ error: 'Game title is required' }, 400);
    }

    let baseSlug = body.slug ? slugify(body.slug) : slugify(title);
    if (!baseSlug) {
      baseSlug = `game-${Math.random().toString(36).substring(2, 8)}`;
    }

    // Check slug collision and append random suffix if needed
    const existing = await findGameByIdOrSlug(c.env.DB, baseSlug);
    const finalSlug = existing
      ? `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`
      : baseSlug;

    const now = new Date().toISOString();
    const newGame: Game = {
      id: crypto.randomUUID(),
      slug: finalSlug,
      title: title.trim(),
      description: description?.trim() || null,
      creatorId: user.id,
      thumbnailUrl: thumbnailUrl?.trim() || null,
      status: 'draft',
      currentVersionId: null,
      playCount: 0,
      createdAt: now,
      updatedAt: now
    };

    await createGame(c.env.DB, newGame);
    return c.json({ game: newGame }, 201);
  } catch (err) {
    return c.json(
      { error: `Game creation failed: ${(err as Error).message}` },
      500
    );
  }
});

// POST /api/v1/games/:id/publish - Publish a new game release version
gamesRouter.post('/:id/publish', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const idOrSlug = c.req.param('id');
    if (!idOrSlug) {
      return c.json({ error: 'Game ID or slug is required' }, 400);
    }
    const game = await findGameByIdOrSlug(c.env.DB, idOrSlug);

    if (!game) {
      return c.json({ error: 'Game not found' }, 404);
    }

    // Enforce creator ownership
    if (game.creatorId !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden: You do not own this game' }, 403);
    }

    const body = (await c.req.json()) as PublishVersionRequest;
    const { versionNumber, changelog, bundleUrl, manifestJson } = body;

    if (!versionNumber || !bundleUrl || !manifestJson) {
      return c.json(
        { error: 'versionNumber, bundleUrl, and manifestJson are required' },
        400
      );
    }

    const inspection = inspectManifest(manifestJson);
    if (!inspection.valid) {
      const syntaxError = inspection.errors.some(
        (entry) => entry.includes('not valid JSON') || entry.includes('must be a JSON object')
      );
      return c.json(
        {
          error: syntaxError ? 'manifestJson must be valid JSON' : 'Invalid game manifest',
          details: inspection.errors,
          manifestVersion: inspection.manifestVersion
        },
        400
      );
    }

    if (inspection.manifestVersion === '2.0') {
      const errors = await validateManifestAssets(c.env, manifestJson);
      if (errors.length) {
        return c.json({
          error: 'Invalid game asset references',
          details: errors,
          manifestVersion: inspection.manifestVersion
        }, 400);
      }
    }

    const now = new Date().toISOString();
    const newVersion: GameVersion = {
      id: crypto.randomUUID(),
      gameId: game.id,
      versionNumber: versionNumber.trim(),
      changelog: changelog?.trim() || null,
      bundleUrl: bundleUrl.trim(),
      manifestJson,
      status: 'published',
      publishedAt: now,
      createdAt: now
    };

    const publishedVersion = await createGameVersion(c.env.DB, newVersion);
    const updatedGame = await findGameByIdOrSlug(c.env.DB, game.id);

    return c.json(
      {
        version: publishedVersion,
        game: updatedGame
      },
      200
    );
  } catch (err) {
    return c.json(
      { error: `Publish failed: ${(err as Error).message}` },
      500
    );
  }
});

// POST /api/v1/games/:id/play - Increment real play count in D1
gamesRouter.post('/:id/play', async (c) => {
  const idOrSlug = c.req.param('id');
  if (!idOrSlug) return c.json({ error: 'Game ID or slug is required' }, 400);
  const game = await findGameByIdOrSlug(c.env.DB, idOrSlug);
  if (!game) return c.json({ error: 'Game not found' }, 404);

  await c.env.DB
    .prepare('UPDATE games SET play_count = play_count + 1, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), game.id)
    .run();

  return c.json({
    success: true,
    gameId: game.id,
    playCount: game.playCount + 1,
    newPlayCount: game.playCount + 1
  }, 200);
});
