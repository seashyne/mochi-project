import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

describe('Profile display name and password management', () => {
  let env: MochiEnv;

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: 'https://game.lenout.com',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };
  });

  const register = async () => {
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'profileuser',
          email: 'profileuser@mochi.dev',
          password: 'password123',
          instant: true
        })
      },
      env
    );
    const json = (await res.json()) as { token: string; user: { id: string } };
    return json;
  };

  const authHeaders = (token: string) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  });

  it('updates the display name and reflects it in /me', async () => {
    const { token } = await register();
    const res = await app.request(
      '/api/v1/auth/me',
      { method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ displayName: 'Mochi Fan' }) },
      env
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { user: { displayName: string } };
    expect(json.user.displayName).toBe('Mochi Fan');

    const me = await app.request('/api/v1/auth/me', { headers: authHeaders(token) }, env);
    const meJson = (await me.json()) as { user: { displayName: string } };
    expect(meJson.user.displayName).toBe('Mochi Fan');
  });

  it('rejects empty and overlong display names', async () => {
    const { token } = await register();
    for (const displayName of ['', '   ', 'x'.repeat(31)]) {
      const res = await app.request(
        '/api/v1/auth/me',
        { method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ displayName }) },
        env
      );
      expect(res.status).toBe(400);
    }
  });

  it('requires authentication for profile updates', async () => {
    const res = await app.request(
      '/api/v1/auth/me',
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Nope' }) },
      env
    );
    expect(res.status).toBe(401);
  });

  it('rejects password change when the current password is wrong', async () => {
    const { token } = await register();
    const res = await app.request(
      '/api/v1/auth/change-password',
      { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpassword1' }) },
      env
    );
    expect(res.status).toBe(403);
  });

  it('rotates the password and invalidates the old one', async () => {
    const { token } = await register();
    const res = await app.request(
      '/api/v1/auth/change-password',
      { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ currentPassword: 'password123', newPassword: 'newpassword1' }) },
      env
    );
    expect(res.status).toBe(200);

    const oldLogin = await app.request(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'profileuser', password: 'password123' }) },
      env
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await app.request(
      '/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'profileuser', password: 'newpassword1' }) },
      env
    );
    expect(newLogin.status).toBe(200);
  });

  it('rejects short new passwords', async () => {
    const { token } = await register();
    const res = await app.request(
      '/api/v1/auth/change-password',
      { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ currentPassword: 'password123', newPassword: '123' }) },
      env
    );
    expect(res.status).toBe(400);
  });
});
