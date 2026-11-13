import { Context, Next } from 'hono';
import {
  CSRF_HEADER,
  hasCsrfHeader,
  readSessionToken,
  requiresCsrfGuard
} from '../services/sessionCookie';
import { MochiEnv, AppVariables } from '../types/env';

// Base64url utilities
function base64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Import HMAC key using Web Crypto API
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Genuine password hashing with salt and SHA-256
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await hashPassword(password, salt);
  return actualHash === expectedHash;
}

// Generate base64url signed HMAC token
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 86400
): Promise<string> {
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getCryptoKey(secret);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${encodedSignature}`;
}

// Verify token signature and expiration
export async function verifyToken<T>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const encoder = new TextEncoder();

    const key = await getCryptoKey(secret);
    const signatureBytes = base64UrlDecode(encodedSignature);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as BufferSource,
      encoder.encode(signingInput)
    );

    if (!isValid) {
      return null;
    }

    const payloadBytes = base64UrlDecode(encodedPayload);
    const decoder = new TextDecoder();
    const payload = JSON.parse(decoder.decode(payloadBytes)) as T & { exp?: number };

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * The session token for a request: a Bearer header wins, then the session cookie.
 * `fromCookie` drives the CSRF guard, because only a cookie is attached by the
 * browser without the page asking.
 */
export function resolveRequestToken(c: {
  req: { header: (name: string) => string | undefined };
}): { token: string; fromCookie: boolean } | null {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return { token, fromCookie: false };
  }
  const cookieToken = readSessionToken(c.req.header('Cookie'));
  return cookieToken ? { token: cookieToken, fromCookie: true } : null;
}

// Authentication middleware: Bearer token or session cookie.
export async function authMiddleware(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>,
  next: Next
) {
  const resolved = resolveRequestToken(c);
  if (!resolved) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  // A cookie is attached by the browser on any cross-site request, so an unsafe
  // method must prove the call came from our own page.
  if (
    resolved.fromCookie &&
    requiresCsrfGuard(c.req.method) &&
    !hasCsrfHeader(c.req.header(CSRF_HEADER))
  ) {
    return c.json({ error: 'Forbidden: cookie session requires the CSRF header' }, 403);
  }

  const token = resolved.token;
  const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
  const payload = await verifyToken<{
    id: string;
    username: string;
    email: string;
    role: string;
  }>(token, secret);

  if (!payload) {
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  c.set('user', {
    id: payload.id,
    username: payload.username,
    email: payload.email,
    role: payload.role
  });

  await next();
}

// Sets user when a valid Bearer token is present, but never rejects: public
// asset serving must stay open while private objects check ownership.
export async function optionalAuthMiddleware(
  c: Context<{ Bindings: MochiEnv; Variables: AppVariables }>,
  next: Next
) {
  const resolved = resolveRequestToken(c);
  if (resolved) {
    const secret = c.env.JWT_SECRET || 'mochi-dev-secret-key-change-in-production';
    const payload = await verifyToken<{
      id: string;
      username: string;
      email: string;
      role: string;
    }>(resolved.token, secret);
    if (payload) {
      c.set('user', {
        id: payload.id,
        username: payload.username,
        email: payload.email,
        role: payload.role
      });
    }
  }
  await next();
}
