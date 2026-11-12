import { Hono } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';

export const healthRouter = new Hono<{
  Bindings: MochiEnv;
  Variables: AppVariables;
}>();

// Health check endpoint for monitoring and uptime probes
healthRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'mochi-cloud',
    version: '0.1.0',
    apps: {
      studio: '1.0.0-creator',
      web: '1.2.0',
      mobile: '1.0.0',
      engine: '0.9.5'
    },
    timestamp: new Date().toISOString()
  });
});
