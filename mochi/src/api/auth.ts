// Authentication client module for Mochi Web Platform

import { ApiClient, defaultApiClient } from './client';
import { AuthResponse, GameSummary, LoginRequest, RegisterRequest, UserProfile } from './types';

export const TOKEN_STORAGE_KEY = 'mochi_auth_token';
let inMemoryToken: string | null = null;

export interface RegisterResponse {
  success: boolean;
  message: string;
  userId?: string;
  email: string;
  expiresAt?: string;
  token?: string;
  user?: UserProfile;
}

export interface VerifyOtpResponse {
  success: boolean;
  user: UserProfile;
  token: string;
}

export interface ResendOtpResponse {
  success: boolean;
  message: string;
  expiresAt?: string;
}

// Safely resolves browser or test-injected localStorage instance without throwing in SSR/Worker contexts
function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Ignore restricted storage environments
  }
  return null;
}

export function getStoredToken(): string | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') {
            return parsed.token;
          }
        } catch {
          return stored;
        }
        return stored;
      }
    }
  } catch {
    // Ignore storage access errors
  }

  if (typeof document !== 'undefined' && document.cookie) {
    try {
      const match = document.cookie.match(/(?:^|;\s*)mochi_auth_token=([^;]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        if (decoded) {
          saveStoredToken(decoded);
          return decoded;
        }
      }
    } catch { /* Ignore cookie read error */ }
  }

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('auth_token');
      if (urlToken) {
        saveStoredToken(urlToken);
        params.delete('auth_token');
        const q = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState(null, '', window.location.pathname + q + window.location.hash);
        return urlToken;
      }
    } catch { /* Ignore URL error */ }
  }

  return inMemoryToken;
}

export function getStoredUser(): UserProfile | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(TOKEN_STORAGE_KEY);
      if (!stored) return null;
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && parsed.user) {
          return parsed.user as UserProfile;
        }
      } catch {
        return null;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

// Persists JWT token and optional cached user profile into localStorage for session retention
export function saveStoredToken(token: string, user?: UserProfile): void {
  inMemoryToken = token;
  try {
    const storage = getStorage();
    if (storage) {
      if (user) {
        storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, user }));
      } else {
        storage.setItem(TOKEN_STORAGE_KEY, token);
      }
    }
  } catch {
    // Ignore storage quota or security errors
  }

  if (typeof document !== 'undefined') {
    try {
      const isLenout = typeof window !== 'undefined' && window.location.hostname.endsWith('lenout.com');
      const domainPart = isLenout ? '; Domain=.lenout.com' : '';
      const securePart = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `mochi_auth_token=${encodeURIComponent(token)}${domainPart}; Path=/; Max-Age=2592000; SameSite=Lax${securePart}`;
    } catch { /* Cookie restricted */ }
  }
}

export function clearStoredToken(): void {
  inMemoryToken = null;
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage removal errors
  }

  if (typeof document !== 'undefined') {
    try {
      const isLenout = typeof window !== 'undefined' && window.location.hostname.endsWith('lenout.com');
      const domainPart = isLenout ? '; Domain=.lenout.com' : '';
      document.cookie = `mochi_auth_token=; Max-Age=0; Path=/${domainPart}`;
    } catch { /* Cookie restricted */ }
  }
}

export class AuthApi {
  constructor(private client: ApiClient = defaultApiClient) {
    // Sync initial token from storage if available
    const token = getStoredToken();
    if (token) {
      this.client.setToken(token);
    }
    // Automatically wipe stored credentials on 401 unauthorized
    this.client.setOnUnauthorized(() => {
      this.logout();
    });
  }

  public getClient(): ApiClient {
    return this.client;
  }

  public async register(request: RegisterRequest): Promise<RegisterResponse> {
    const res = await this.client.post<RegisterResponse>('/api/v1/auth/register', request);
    if (res && res.token) {
      saveStoredToken(res.token, res.user);
      this.client.setToken(res.token);
    }
    return res;
  }

  public async requestEmailVerification(email: string): Promise<{ success: boolean; message: string; email: string }> {
    return this.client.post('/api/v1/auth/request-email-verification', { email });
  }

  public async confirmEmailVerification(
    email: string,
    code: string
  ): Promise<{ success: boolean; message: string; user: UserProfile }> {
    return this.client.post('/api/v1/auth/confirm-email-verification', { email, code });
  }

  public async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const res = await this.client.post<VerifyOtpResponse>('/api/v1/auth/verify-otp', { email, code });
    if (res && res.token) {
      saveStoredToken(res.token);
      this.client.setToken(res.token);
    }
    return res;
  }

  public async resendOtp(email: string): Promise<ResendOtpResponse> {
    return this.client.post<ResendOtpResponse>('/api/v1/auth/resend-otp', { email });
  }

  public async login(request: LoginRequest): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/login', request);
    if (res && res.token) {
      saveStoredToken(res.token);
      this.client.setToken(res.token);
    }
    return res;
  }

  public async me(token?: string): Promise<{ user: UserProfile }> {
    const effectiveToken = token || this.client.getToken() || getStoredToken();
    const headers: Record<string, string> = {};
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }
    return this.client.get<{ user: UserProfile }>('/api/v1/auth/me', { headers });
  }

  public async getProfile(identifier: string): Promise<{ user: UserProfile; games: GameSummary[] }> {
    return this.client.get<{ user: UserProfile; games: GameSummary[] }>(
      `/api/v1/auth/users/${encodeURIComponent(identifier)}`
    );
  }

  public async updateProfile(displayName: string): Promise<{ user: UserProfile }> {
    return this.client.put<{ user: UserProfile }>('/api/v1/auth/me', { displayName });
  }

  public async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return this.client.post('/api/v1/auth/change-password', { currentPassword, newPassword });
  }

  public async forgotPassword(email: string): Promise<{ success: boolean; message: string; email: string }> {
    return this.client.post('/api/v1/auth/forgot-password', { email });
  }

  public async resetPassword(payload: { email: string; code: string; newPassword: string }): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/reset-password', payload);
    if (res && res.token) {
      saveStoredToken(res.token);
      this.client.setToken(res.token);
    }
    return res;
  }

  public async sendLoginCode(email: string): Promise<{ success: boolean; message: string }> {
    return this.client.post('/api/v1/auth/email-code-login', { email });
  }

  public async verifyLoginCode(email: string, code: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/api/v1/auth/verify-login-code', { email, code });
    if (res && res.token) {
      saveStoredToken(res.token);
      this.client.setToken(res.token);
    }
    return res;
  }

  public async addCoins(amount: number): Promise<{ success: boolean; coins: number }> {
    return this.client.post('/api/v1/auth/coins/add', { amount });
  }

  public logout(): void {
    clearStoredToken();
    this.client.setToken(null);
  }
}

export const authApi = new AuthApi();
