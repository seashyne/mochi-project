// Client-side authentication recovery and hash-based navigation tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authApi } from '../src/api/auth';
import { defaultApiClient } from '../src/api/client';

describe('Auth Recovery and Verification Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes forgotPassword and resetPassword endpoints with correct payloads', async () => {
    const postSpy = vi.spyOn(defaultApiClient, 'post').mockResolvedValue({
      success: true,
      message: 'Password reset code sent',
      email: 'test@game.lenout.com'
    });

    const res = await authApi.forgotPassword('test@game.lenout.com');
    expect(res.success).toBe(true);
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/forgot-password', {
      email: 'test@game.lenout.com'
    });

    postSpy.mockResolvedValueOnce({
      token: 'jwt.token.mock',
      user: { id: 'usr_01', email: 'test@game.lenout.com', username: 'testuser' }
    });

    const resetRes = await authApi.resetPassword({
      email: 'test@game.lenout.com',
      code: '123456',
      newPassword: 'MyNewSecurePassword!'
    });
    expect(resetRes.token).toBe('jwt.token.mock');
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/reset-password', {
      email: 'test@game.lenout.com',
      code: '123456',
      newPassword: 'MyNewSecurePassword!'
    });
  });

  it('invokes sendLoginCode and verifyLoginCode for passwordless auth', async () => {
    const postSpy = vi.spyOn(defaultApiClient, 'post').mockResolvedValue({
      success: true,
      message: 'Login code sent'
    });

    const sendRes = await authApi.sendLoginCode('player@game.lenout.com');
    expect(sendRes.success).toBe(true);
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/email-code-login', {
      email: 'player@game.lenout.com'
    });

    postSpy.mockResolvedValueOnce({
      token: 'jwt.passwordless.mock',
      user: { id: 'usr_02', email: 'player@game.lenout.com', username: 'player' }
    });

    const verifyRes = await authApi.verifyLoginCode('player@game.lenout.com', '654321');
    expect(verifyRes.token).toBe('jwt.passwordless.mock');
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/verify-login-code', {
      email: 'player@game.lenout.com',
      code: '654321'
    });
  });

  it('invokes addCoins to persist gameplay currency in Cloudflare D1', async () => {
    const postSpy = vi.spyOn(defaultApiClient, 'post').mockResolvedValue({
      success: true,
      coins: 150
    });

    const res = await authApi.addCoins(20);
    expect(res.success).toBe(true);
    expect(res.coins).toBe(150);
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/coins/add', {
      amount: 20
    });
  });
});
