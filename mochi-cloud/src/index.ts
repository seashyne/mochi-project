import { Hono } from 'hono';
import { MochiEnv, AppVariables } from './types/env';
import { corsMiddleware } from './middleware/cors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { authRecoveryRouter } from './routes/authRecovery';
import { draftsRouter } from './routes/drafts';
import { studioTeamRouter } from './routes/studioTeam';
import { gamesRouter } from './routes/games';
import { assetsRouter } from './routes/assets';
import { assetsMultipartRouter } from './routes/assetsMultipart';
import { assetFilesRouter } from './routes/assetFiles';
import { filesRouter } from './routes/files';
import { assetAccessRouter } from './routes/assetAccess';
import { roomsRouter } from './routes/rooms';
import { adminRouter } from './routes/admin';
import { avatarsRouter } from './routes/avatars';
import { shopRouter } from './routes/shop';
import { partiesRouter } from './routes/parties';
import { telemetryRouter } from './routes/telemetry';
import { GameRoomDO } from './do/GameRoomDO';
import { StudioDraftDO } from './do/StudioDraftDO';

// Create central Hono application instance
export const app = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Global parameterized CORS middleware
app.use('*', corsMiddleware);

// Root informational endpoint
app.get('/', (c) => {
  return c.json({
    name: 'mochi-cloud-api',
    description: 'Mochi Project Standalone Cloud Backend API',
    version: '0.1.0',
    docs: '/api/v1/health'
  });
});

// Modular sub-routers
app.route('/api/v1/health', healthRouter);
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/auth', authRecoveryRouter);
// Team Create routes are mounted first: "/shared" and "/:id/team/*" must not
// be swallowed by the draft router's "/:id" catch-all.
app.route('/api/v1/games/drafts', studioTeamRouter);
app.route('/api/v1/games/drafts', draftsRouter);
app.route('/api/v1/games', gamesRouter);
app.route('/api/v1/assets', assetsMultipartRouter);
app.route('/api/v1/assets', assetFilesRouter);
app.route('/api/v1/assets', assetsRouter);
app.route('/api/v1/files', filesRouter);
app.route('/api/v1/access', assetAccessRouter);
app.route('/api/v1/rooms', roomsRouter);
app.route('/api/v1/admin', adminRouter);
app.route('/api/v1/avatars', avatarsRouter);
app.route('/api/v1/shop', shopRouter);
app.route('/api/v1/parties', partiesRouter);
app.route('/api/v1/telemetry', telemetryRouter);

// Global 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      path: c.req.path
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message
    },
    500
  );
});

// Export Durable Object class binding for Cloudflare Workers runtime
export { GameRoomDO, StudioDraftDO };

// Export standard Worker fetch handler
export default app;
