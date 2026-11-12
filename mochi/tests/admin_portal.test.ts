// Unit Tests for AdminApi Normalization, RBAC Guards, /admin Routing, and File Invariants

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ApiClient } from '../src/api/client';
import {
  AdminApi,
  canAccessAdminPortal,
  isAdminPathname
} from '../src/api/admin';

describe('Admin Backoffice API, RBAC Guards, and Route Resolution', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  let api: AdminApi;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new ApiClient({
      baseUrl: 'https://api-game.lenout.com',
      authToken: 'test-admin-jwt'
    });
    api = new AdminApi(client);
  });

  function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  it('fetches and normalizes GET /api/v1/admin/stats across snake_case fields', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        stats: {
          active_online_users: '42',
          total_gameplay_sessions: 1280,
          total_games: '19',
          total_registered_users: 350
        }
      })
    );

    const res = await api.getStats();
    expect(res.ok).toBe(true);
    expect(res.stats).toEqual({
      activeOnlineUsers: 42,
      totalGameplaySessions: 1280,
      totalGames: 19,
      totalRegisteredUsers: 350
    });

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api-game.lenout.com/api/v1/admin/stats');
    expect(init.method).toBe('GET');
  });

  it('searches users and updates role, coin balance, and suspension via PATCH', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        users: [
          {
            id: 'usr_01',
            numeric_id: 7,
            username: 'skybuilder',
            email: 'sky@mochi.dev',
            display_name: 'Sky Builder',
            role: 'creator',
            coin_balance: 500,
            is_banned: 0,
            is_verified: 1,
            created_at: '2026-11-08T00:00:00.000Z'
          }
        ],
        total: 1,
        page: 1,
        total_pages: 1
      })
    );

    const listRes = await api.listUsers({ query: 'sky', page: 1, limit: 10 });
    expect(listRes.users).toHaveLength(1);
    expect(listRes.users[0]).toEqual({
      id: 'usr_01',
      numericId: 7,
      username: 'skybuilder',
      email: 'sky@mochi.dev',
      displayName: 'Sky Builder',
      role: 'creator',
      coins: 500,
      isBanned: false,
      isVerified: true,
      createdAt: '2026-11-08T00:00:00.000Z'
    });
    expect(mockFetch.mock.calls[0]?.[0]).toContain(
      '/api/v1/admin/users?query=sky&page=1&limit=10'
    );

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        user: {
          id: 'usr_01',
          numericId: 7,
          username: 'skybuilder',
          email: 'sky@mochi.dev',
          displayName: 'Sky Builder',
          role: 'admin',
          coins: 1250,
          is_banned: 1,
          is_verified: 1,
          created_at: '2026-11-08T00:00:00.000Z'
        }
      })
    );

    const patchRes = await api.updateUser('usr_01', {
      role: 'admin',
      coins: 1250,
      isBanned: true
    });
    expect(patchRes.user.role).toBe('admin');
    expect(patchRes.user.coins).toBe(1250);
    expect(patchRes.user.isBanned).toBe(true);

    const [patchUrl, patchInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toBe('https://api-game.lenout.com/api/v1/admin/users/usr_01');
    expect(patchInit.method).toBe('PATCH');
    expect(JSON.parse(String(patchInit.body))).toEqual({
      role: 'admin',
      coins: 1250,
      isBanned: true
    });
  });

  it('lists games and moderates status (approve/unpublish) and featured flag', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        games: [
          {
            id: 'game_77',
            slug: 'nebula-race',
            title: 'Nebula Race',
            description: 'Zero-gravity circuit',
            creator_id: 'usr_02',
            creator_name: 'nova',
            status: 'draft',
            is_featured: 0,
            play_count: 95,
            created_at: '2026-11-08T01:00:00.000Z',
            updated_at: '2026-11-08T02:00:00.000Z'
          }
        ],
        total: 1,
        page: 1
      })
    );

    const listRes = await api.listGames({ query: 'nebula', status: 'draft', page: 1, limit: 10 });
    expect(listRes.games[0]?.isFeatured).toBe(false);
    expect(listRes.games[0]?.playCount).toBe(95);
    expect(listRes.games[0]?.creatorName).toBe('nova');

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        game: {
          id: 'game_77',
          slug: 'nebula-race',
          title: 'Nebula Race',
          description: 'Zero-gravity circuit',
          creatorId: 'usr_02',
          status: 'published',
          is_featured: 1,
          play_count: 96,
          createdAt: '2026-11-08T01:00:00.000Z',
          updatedAt: '2026-11-08T03:00:00.000Z'
        }
      })
    );

    const approved = await api.moderateGame('game_77', {
      status: 'published',
      isFeatured: true
    });
    expect(approved.game.status).toBe('published');
    expect(approved.game.isFeatured).toBe(true);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        game: {
          id: 'game_77',
          slug: 'nebula-race',
          title: 'Nebula Race',
          description: null,
          creatorId: 'usr_02',
          status: 'rejected',
          isFeatured: false,
          playCount: 96,
          createdAt: '2026-11-08T01:00:00.000Z',
          updatedAt: '2026-11-08T04:00:00.000Z'
        }
      })
    );

    const unpublished = await api.moderateGame('game_77', {
      status: 'rejected',
      isFeatured: false
    });
    expect(unpublished.game.status).toBe('rejected');
    expect(unpublished.game.isFeatured).toBe(false);
  });

  it('normalizes immutable audit log records from GET /api/v1/admin/audit-logs', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        audit_logs: [
          {
            id: 'log_01',
            admin_id: 'adm_01',
            admin_username: 'rootadmin',
            action: 'GAME_MODERATE',
            target_type: 'game',
            target_id: 'game_77',
            details: { status: 'published', isFeatured: true },
            created_at: '2026-11-08T05:00:00.000Z'
          }
        ],
        total: 1
      })
    );

    const res = await api.listAuditLogs({ page: 1, limit: 15 });
    expect(res.total).toBe(1);
    expect(res.logs[0]).toEqual({
      id: 'log_01',
      adminId: 'adm_01',
      adminUsername: 'rootadmin',
      action: 'GAME_MODERATE',
      targetType: 'game',
      targetId: 'game_77',
      details: JSON.stringify({ status: 'published', isFeatured: true }),
      createdAt: '2026-11-08T05:00:00.000Z'
    });
  });

  it('enforces strict RBAC access checks and /admin pathname matching', () => {
    expect(canAccessAdminPortal(null)).toBe(false);
    expect(canAccessAdminPortal(undefined)).toBe(false);
    expect(canAccessAdminPortal({ role: 'player' })).toBe(false);
    expect(canAccessAdminPortal({ role: 'creator' })).toBe(false);
    expect(canAccessAdminPortal({ role: 'admin', isBanned: true })).toBe(false);
    expect(canAccessAdminPortal({ role: 'admin', isBanned: false })).toBe(true);
    expect(canAccessAdminPortal({ role: 'admin' })).toBe(true);

    expect(isAdminPathname('/admin')).toBe(true);
    expect(isAdminPathname('/admin/users')).toBe(true);
    expect(isAdminPathname('/')).toBe(false);
    expect(isAdminPathname('/administrator')).toBe(false);
    expect(isAdminPathname('/catalog')).toBe(false);
  });

  it('verifies admin components and API modules obey <= 300 lines and zero emojis', () => {
    const emojiRegex =
      /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;
    const filesToCheck = [
      '../src/api/admin.ts',
      '../src/components/admin/AdminPortal.tsx',
      '../src/components/admin/AdminDashboard.tsx',
      '../src/components/admin/AdminUserManagement.tsx',
      '../src/components/admin/AdminGameModeration.tsx',
      '../src/components/admin/AdminAuditLogs.tsx',
      '../src/components/admin/AdminForbidden.tsx',
      '../src/components/MochiNavbar.tsx',
      '../src/components/Sidebar.tsx',
      '../src/App.tsx'
    ];

    for (const rel of filesToCheck) {
      const fullPath = path.resolve(__dirname, rel);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lineCount = content.split('\n').length;
      expect(lineCount, `${rel} exceeded 300 lines (${lineCount})`).toBeLessThanOrEqual(300);
      expect(emojiRegex.test(content), `${rel} contains a forbidden emoji`).toBe(false);
    }
  });
});
