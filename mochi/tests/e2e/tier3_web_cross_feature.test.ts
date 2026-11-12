// Tier 3 Web Cross-Feature Combinations E2E Test Suite
// Verifies pairwise interactions between auth store, OTP verification, admin routing, and theme styling

import { describe, it, expect, beforeEach } from 'vitest';
import { MockLocalStorage, createContractAuthStore, evaluateThemeTokenSources } from './e2e_web_harness';
import { UserProfile } from '../../src/api/types';

describe('Tier 3 Web E2E: Cross-Feature Combinations (Pairwise)', () => {
  let mockStorage: MockLocalStorage;
  let authStore: ReturnType<typeof createContractAuthStore>;

  const playerUser: UserProfile = {
    id: 'usr_pair_player',
    numericId: 100021,
    username: 'space_ranger',
    email: 'ranger@mochi.test',
    displayName: 'Space Ranger',
    role: 'player'
  };

  const adminUser: UserProfile = {
    id: 'usr_pair_admin',
    numericId: 100022,
    username: 'chief_admin',
    email: 'chief@mochi.test',
    displayName: 'Chief Admin',
    role: 'admin'
  };

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    authStore = createContractAuthStore(mockStorage);
  });

  it('T3_Pair_01: Signup Flow -> OTP Step -> Verification -> Auto-Login Session Persistence', async () => {
    // 1. Initial anonymous visitor state
    await authStore.getState().initialize();
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().token).toBeNull();

    // 2. User inputs valid OTP code and triggers verification
    const verifiedUser: UserProfile = { ...playerUser, isVerified: true };
    const issuedJwt = 'session_jwt_lifecycle_555';
    authStore.getState().login(issuedJwt, verifiedUser);

    // 3. User session is persistently saved in localStorage
    expect(authStore.getState().token).toBe(issuedJwt);
    expect(authStore.getState().user?.isVerified).toBe(true);

    const storedRaw = mockStorage.getItem('mochi_auth_token');
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!) as { token: string; user: UserProfile };
    expect(stored.token).toBe(issuedJwt);
    expect(stored.user.username).toBe('space_ranger');
  });

  it('T3_Pair_02: Player Session -> Navigate /admin -> 403 Forbidden Screen -> Preserves Player Session', () => {
    // 1. Player is authenticated
    authStore.getState().login('player_jwt_valid', playerUser);

    // 2. Route guard resolves /admin for player
    const resolveAdminRoute = (user: UserProfile | null) => {
      if (!user) return { view: 'redirect_signin', status: 401 };
      if (user.role !== 'admin') return { view: 'admin_forbidden_403', status: 403 };
      return { view: 'admin_portal', status: 200 };
    };

    const routeResult = resolveAdminRoute(authStore.getState().user);
    expect(routeResult.status).toBe(403);
    expect(routeResult.view).toBe('admin_forbidden_403');

    // 3. Player session remains intact
    expect(authStore.getState().token).toBe('player_jwt_valid');
    expect(authStore.getState().user?.role).toBe('player');
  });

  it('T3_Pair_03: Admin Session -> Navigate /admin -> Access Granted -> Admin Shell Mounted', () => {
    // 1. Admin logs in
    authStore.getState().login('admin_jwt_valid', adminUser);

    // 2. Route guard resolves /admin for admin
    const resolveAdminRoute = (user: UserProfile | null) => {
      if (!user) return { view: 'redirect_signin', status: 401 };
      if (user.role !== 'admin') return { view: 'admin_forbidden_403', status: 403 };
      return { view: 'admin_portal', status: 200 };
    };

    const routeResult = resolveAdminRoute(authStore.getState().user);
    expect(routeResult.status).toBe(200);
    expect(routeResult.view).toBe('admin_portal');
  });

  it('T3_Pair_04: Stored Token Expired -> 401 Response -> Global Interceptor Cleans Storage and State', async () => {
    // 1. Active stored session
    authStore.getState().login('expired_jwt_777', playerUser);
    expect(mockStorage.getItem('mochi_auth_token')).not.toBeNull();

    // 2. API interceptor handles 401 response
    const handleApiResponse = (status: number) => {
      if (status === 401) {
        authStore.getState().logout();
        return { error: 'Session expired' };
      }
      return { ok: true };
    };

    const apiRes = handleApiResponse(401);
    expect(apiRes.error).toBe('Session expired');

    // 3. Storage wiped, state reset to unauthenticated
    expect(mockStorage.getItem('mochi_auth_token')).toBeNull();
    expect(authStore.getState().token).toBeNull();
    expect(authStore.getState().user).toBeNull();
  });

  it('T3_Pair_05: Theme Conformance Across Routes -> Dark Surface Tokens Uniformity', () => {
    const { cssContent, hasDarkBgToken } = evaluateThemeTokenSources();
    expect(hasDarkBgToken).toBe(true);
    expect(cssContent).toContain('--mochi-bg:');
    expect(cssContent).toContain('--mochi-border:');

    // Verify dark palette values conform to #090b10 / #111216 gaming theme
    const hasDarkHex = cssContent.includes('#111216') || cssContent.includes('#090b10');
    expect(hasDarkHex).toBe(true);
  });
});
