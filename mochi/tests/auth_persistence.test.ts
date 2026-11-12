// Unit and integration test suite for persistent authentication and 401 interceptor
// Verifies localStorage persistence, session restoration, auto-logout on 401, and header injection

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../src/store/useAuthStore';
import {
  saveStoredToken,
  getStoredToken,
  getStoredUser,
  clearStoredToken,
  TOKEN_STORAGE_KEY
} from '../src/api/auth';
import { ApiClient, defaultApiClient } from '../src/api/client';
import { UserProfile } from '../src/api/types';

class MockStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
}

describe('Persistent Authentication & 401 Interceptor Verification', () => {
  let mockStorage: MockStorage;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  const sampleUser: UserProfile = {
    id: 'usr_test_100',
    numericId: 100055,
    username: 'starlight_builder',
    email: 'starlight@mochi.test',
    displayName: 'Starlight Builder',
    role: 'creator',
    isVerified: true
  };

  beforeEach(() => {
    mockStorage = new MockStorage();
    (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockStorage
    };
    clearStoredToken();
    useAuthStore.setState({
      user: null,
      token: null,
      isInitialized: false,
      isLoading: false,
      error: null
    });
    defaultApiClient.setToken(null);
  });

  afterEach(() => {
    clearStoredToken();
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('LocalStorage Token & Session Persistence', () => {
    it('saves raw token and retrieves correctly', () => {
      saveStoredToken('sample_raw_token_xyz');
      expect(getStoredToken()).toBe('sample_raw_token_xyz');
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBe('sample_raw_token_xyz');
    });

    it('saves token with user object and parses JSON structure', () => {
      saveStoredToken('jwt_token_composite', sampleUser);
      expect(getStoredToken()).toBe('jwt_token_composite');
      const retrievedUser = getStoredUser();
      expect(retrievedUser).not.toBeNull();
      expect(retrievedUser?.username).toBe('starlight_builder');
      expect(retrievedUser?.isVerified).toBe(true);
    });

    it('clears stored token and session from storage', () => {
      saveStoredToken('to_be_deleted', sampleUser);
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).not.toBeNull();
      clearStoredToken();
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });
  });

  describe('Zustand useAuthStore Workflow', () => {
    it('login action saves credentials to localStorage and sets client token', () => {
      useAuthStore.getState().login('jwt_active_session_1', sampleUser);

      expect(useAuthStore.getState().token).toBe('jwt_active_session_1');
      expect(useAuthStore.getState().user?.username).toBe('starlight_builder');
      expect(useAuthStore.getState().isInitialized).toBe(true);
      expect(defaultApiClient.getToken()).toBe('jwt_active_session_1');

      const storedRaw = mockStorage.getItem(TOKEN_STORAGE_KEY);
      expect(storedRaw).not.toBeNull();
      const parsed = JSON.parse(storedRaw!);
      expect(parsed.token).toBe('jwt_active_session_1');
      expect(parsed.user.email).toBe('starlight@mochi.test');
    });

    it('initialize restores session and updates user from backend /me endpoint', async () => {
      mockStorage.setItem(
        TOKEN_STORAGE_KEY,
        JSON.stringify({ token: 'jwt_persisted_token', user: sampleUser })
      );

      const updatedUserFromServer: UserProfile = {
        ...sampleUser,
        displayName: 'Starlight Master'
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ user: updatedUserFromServer })
      } as unknown as Response);

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().isInitialized).toBe(true);
      expect(useAuthStore.getState().token).toBe('jwt_persisted_token');
      expect(useAuthStore.getState().user?.displayName).toBe('Starlight Master');
      expect(defaultApiClient.getToken()).toBe('jwt_persisted_token');
    });

    it('initialize cleanly handles corrupted storage without throwing exceptions', async () => {
      mockStorage.setItem(TOKEN_STORAGE_KEY, '{ invalid_json_syntax: 123');

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().isInitialized).toBe(true);
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('updateUser updates both store state and persisted localStorage', () => {
      useAuthStore.getState().login('jwt_sync_token', sampleUser);
      useAuthStore.getState().updateUser({ displayName: 'Galaxy Creator' });

      expect(useAuthStore.getState().user?.displayName).toBe('Galaxy Creator');
      const parsed = JSON.parse(mockStorage.getItem(TOKEN_STORAGE_KEY)!);
      expect(parsed.user.displayName).toBe('Galaxy Creator');
    });

    it('logout action purges storage and clears client token', () => {
      useAuthStore.getState().login('jwt_logout_test', sampleUser);
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).not.toBeNull();

      useAuthStore.getState().logout();

      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(defaultApiClient.getToken()).toBeNull();
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('ApiClient 401 Unauthorized Interceptor', () => {
    it('automatically triggers logout and wipes storage upon receiving 401 response', async () => {
      useAuthStore.getState().login('expired_jwt_token', sampleUser);
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).not.toBeNull();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Unauthorized token expired' })
      } as unknown as Response);

      await expect(defaultApiClient.get('/api/v1/auth/me')).rejects.toThrow();

      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(mockStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(defaultApiClient.getToken()).toBeNull();
    });

    it('injects Authorization Bearer header when token is present in client', async () => {
      const customClient = new ApiClient({ baseUrl: 'https://test.mochi.internal' });
      customClient.setToken('auth_header_check_token');

      let capturedAuthHeader: string | null = null;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        const headers = init?.headers;
        if (headers instanceof Headers) {
          capturedAuthHeader = headers.get('Authorization');
        } else if (headers) {
          capturedAuthHeader = (headers as Record<string, string>)['Authorization'] || null;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'ok' })
        });
      });

      await customClient.get('/api/v1/ping');
      expect(capturedAuthHeader).toBe('Bearer auth_header_check_token');
    });

    it('omits Authorization header when client token is not set', async () => {
      const customClient = new ApiClient({ baseUrl: 'https://test.mochi.internal' });

      let capturedAuthHeader: string | null = null;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        const headers = init?.headers;
        if (headers instanceof Headers) {
          capturedAuthHeader = headers.get('Authorization');
        } else if (headers) {
          capturedAuthHeader = (headers as Record<string, string>)['Authorization'] || null;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ status: 'ok' })
        });
      });

      await customClient.get('/api/v1/public');
      expect(capturedAuthHeader).toBeNull();
    });
  });
});
