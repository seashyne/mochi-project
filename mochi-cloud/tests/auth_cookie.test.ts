// Session cookie auth: issuance, reading, the CSRF guard, and logout.

import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signToken } from '../src/middleware/auth';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import {
  SESSION_COOKIE,
  buildSessionCookie,
  clearSessionCookie,
  parseCookieHeader,
  readSessionToken,
  requiresCsrfGuard
} from '../src/services/sessionCookie';

const SECRET = 'test-secret-key-32-bytes-minimum-length';

function makeEnv(): MochiEnv {
  return {
    DB: createMockDb(),
    ASSETS: {} as R2Bucket,
    GAME_ROOM: {} as DurableObjectNamespace,
    ALLOWED_ORIGINS: 'https://game.lenout.com',
    API_HOSTNAME: 'api-game.lenout.com',
    PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
    JWT_SECRET: SECRET
  };
}

async function sessionCookie(): Promise<string> {
  const token = await signToken(
    { id: 'user-1', numericId: 1, username: 'Somchai', email: 's@example.com', role: 'user' },
    SECRET,
    3600
  );
  return `${SESSION_COOKIE}=${token}`;
}

describe('cookie helpers', () => {
  it('parses a Cookie header and ignores malformed pairs', () => {
    expect(parseCookieHeader('a=1; b=2; broken; =x')).toEqual({ a: '1', b: '2' });
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('reads only the session cookie', () => {
    expect(readSessionToken('other=1; mochi_session=abc')).toBe('abc');
    expect(readSessionToken('other=1')).toBeNull();
    expect(readSessionToken('')).toBeNull();
  });

  it('marks the cookie httpOnly, lax and secure by default', () => {
    const cookie = buildSessionCookie('abc');
    expect(cookie).toContain(`${SESSION_COOKIE}=abc`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
  });

  it('can drop Secure for a local http server', () => {
    expect(buildSessionCookie('abc', { secure: false })).not.toContain('Secure');
  });

  it('clears with Max-Age=0', () => {
    const cookie = clearSessionCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });

  it('guards every unsafe method', () => {
    expect(requiresCsrfGuard('GET')).toBe(false);
    expect(requiresCsrfGuard('head')).toBe(false);
    expect(requiresCsrfGuard('OPTIONS')).toBe(false);
    expect(requiresCsrfGuard('POST')).toBe(true);
    expect(requiresCsrfGuard('put')).toBe(true);
    expect(requiresCsrfGuard('DELETE')).toBe(true);
  });
});

describe('cookie authentication', () => {
  it('accepts a cookie on a safe method', async () => {
    const res = await app.request('/api/v1/auth/me', {
      method: 'GET',
      headers: { Cookie: await sessionCookie() }
    }, makeEnv());
    // The mock DB has no user row, so a 404 proves authentication succeeded.
    expect(res.status).toBe(404);
  });

  it('rejects a request with no token at all', async () => {
    const res = await app.request('/api/v1/auth/me', { method: 'GET' }, makeEnv());
    expect(res.status).toBe(401);
  });

  it('refuses an unsafe method from a cookie without the CSRF header', async () => {
    const res = await app.request('/api/v1/auth/me', {
      method: 'PUT',
      headers: { Cookie: await sessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Name' })
    }, makeEnv());
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('CSRF');
  });

  it('allows the same call once the CSRF header is present', async () => {
    const res = await app.request('/api/v1/auth/me', {
      method: 'PUT',
      headers: {
        Cookie: await sessionCookie(),
        'Content-Type': 'application/json',
        'X-Requested-With': 'mochi'
      },
      body: JSON.stringify({ displayName: 'New Name' })
    }, makeEnv());
    // Past the guard: the mock DB answers 404 for the missing user.
    expect(res.status).toBe(404);
  });

  it('does not require the CSRF header for a Bearer request', async () => {
    const token = await signToken(
      { id: 'user-1', numericId: 1, username: 'Somchai', email: 's@example.com', role: 'user' },
      SECRET,
      3600
    );
    const res = await app.request('/api/v1/auth/me', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Name' })
    }, makeEnv());
    expect(res.status).toBe(404);
  });

  it('clears the cookie on logout', async () => {
    const res = await app.request('/api/v1/auth/logout', { method: 'POST' }, makeEnv());
    expect(res.status).toBe(200);
    const header = res.headers.get('Set-Cookie') ?? '';
    expect(header).toContain(`${SESSION_COOKIE}=`);
    expect(header).toContain('Max-Age=0');
  });
});
