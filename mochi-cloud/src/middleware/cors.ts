import { Context, Next } from 'hono';
import { MochiEnv, AppVariables } from '../types/env';

// Parameterized dynamic CORS middleware supporting game.lenout.com and custom domains
export async function corsMiddleware(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>,
  next: Next
) {
  const origin = c.req.header('Origin') || '';
  const configured =
    c.env.ALLOWED_ORIGINS ||
    'https://game.lenout.com,https://studio-game.lenout.com,http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost,https://localhost';

  const allowedList = configured
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const isWildcard = allowedList.includes('*');
  const isMatch = origin && allowedList.includes(origin.toLowerCase());

  let resolvedOrigin: string;
  if (isWildcard) {
    resolvedOrigin = origin || '*';
  } else if (isMatch) {
    resolvedOrigin = origin;
  } else {
    resolvedOrigin = allowedList[0] || 'https://game.lenout.com';
  }

  c.header('Access-Control-Allow-Origin', resolvedOrigin);
  c.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS'
  );
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-Upload-Token, X-Part-Sha256'
  );
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}
