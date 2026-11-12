import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';
import { assetRef, bytesOf, chunkRef, manifest, ManifestBucket } from './manifestAssetFixtures';

describe('Mochi Cloud API - Game Management & Publishing', () => {
  let env: MochiEnv;
  let authToken: string;

  beforeEach(async () => {
    env = {
      DB: createMockDb(),
      ASSETS: {} as R2Bucket,
      GAME_ROOM: {} as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'test-secret-key-32-bytes-minimum-length'
    };

    await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'gamemaker',
          email: 'maker@mochi.dev',
          password: 'secretpassword',
          displayName: 'Game Maker'
        })
      },
      env
    );
    const otp = await env.DB.prepare('SELECT code FROM email_verification_otps WHERE email = ?')
      .bind('maker@mochi.dev').first<{ code: string }>();
    const verifyRes = await app.request('/api/v1/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'maker@mochi.dev', code: otp!.code })
    }, env);
    const json = (await verifyRes.json()) as { token: string };
    authToken = json.token;
  });

  it('blocks invalid v2 refs before creating a version, then publishes verified bytes', async () => {
    const bucket = new ManifestBucket();
    env.ASSETS = bucket.binding;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };
    const created = await app.request('/api/v1/games', {
      method: 'POST', headers, body: JSON.stringify({ title: 'Verified v2' })
    }, env);
    const { game } = await created.json() as { game: { id: string } };
    const ref = assetRef();
    const invalidManifests = [
      manifest(), // Missing chunk.
      manifest({ assets: [ref] }), // Missing binary asset.
      manifest({ assetIndex: ref }), // Non-JSON index.
      manifest({ chunks: [{ ...chunkRef(), url: 'https://evil.example/chunk' }] })
    ];
    for (const manifestJson of invalidManifests) {
      const response = await app.request(`/api/v1/games/${game.id}/publish`, {
        method: 'POST', headers, body: JSON.stringify({ versionNumber: '1.0.0', bundleUrl: 'https://example.com/bundle', manifestJson })
      }, env);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'Invalid game asset references', manifestVersion: '2.0' });
      bucket.storeChunk();
    }
    bucket.store(ref, bytesOf('wrong')); // Matching forged metadata must not publish.
    const rejected = await app.request(`/api/v1/games/${game.id}/publish`, {
      method: 'POST', headers,
      body: JSON.stringify({ versionNumber: '1.0.0', bundleUrl: 'https://example.com/bundle', manifestJson: manifest({ assets: [ref] }) })
    }, env);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ details: [expect.stringContaining('SHA-256 mismatch')] });
    const detail = await app.request(`/api/v1/games/${game.id}`, {}, env);
    expect(await detail.json()).toMatchObject({ game: { status: 'draft', currentVersionId: null }, versions: [] });

    bucket.store(ref, bytesOf('hello'));
    const accepted = await app.request(`/api/v1/games/${game.id}/publish`, {
      method: 'POST', headers,
      body: JSON.stringify({ versionNumber: '1.0.0', bundleUrl: 'https://example.com/bundle', manifestJson: manifest({ assets: [ref] }) })
    }, env);
    expect(accepted.status).toBe(200);
    const published = await app.request(`/api/v1/games/${game.id}`, {}, env);
    const result = await published.json() as { game: { status: string }; versions: unknown[] };
    expect(result.game.status).toBe('published');
    expect(result.versions).toHaveLength(1);
  });

  it('creates a draft game, retrieves it, publishes a version, and lists it', async () => {
    // 1. Create draft game
    const createRes = await app.request(
      '/api/v1/games',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: 'Cosmic Drift',
          description: '3D high-speed space racer',
          thumbnailUrl: 'https://assets-game.lenout.com/thumbnails/cosmic.png'
        })
      },
      env
    );
    expect(createRes.status).toBe(201);
    const { game } = (await createRes.json()) as {
      game: { id: string; slug: string; status: string };
    };
    expect(game.slug).toBe('cosmic-drift');
    expect(game.status).toBe('draft');

    // 2. Fetch game details by slug
    const getRes = await app.request(
      `/api/v1/games/${game.slug}`,
      { method: 'GET' },
      env
    );
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as {
      game: { title: string };
      versions: unknown[];
    };
    expect(getJson.game.title).toBe('Cosmic Drift');
    expect(getJson.versions.length).toBe(0);

    // 3. Publish initial version 0.1.0
    const publishRes = await app.request(
      `/api/v1/games/${game.id}/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          versionNumber: '0.1.0',
          changelog: 'Initial public alpha release',
          bundleUrl: 'https://assets-game.lenout.com/bundles/cosmic-0.1.0.zip',
          manifestJson: JSON.stringify({ entry: 'main.js', scene: 'orbit' })
        })
      },
      env
    );
    expect(publishRes.status).toBe(200);
    const publishJson = (await publishRes.json()) as {
      version: { versionNumber: string };
      game: { status: string; current_version_id: string };
    };
    expect(publishJson.version.versionNumber).toBe('0.1.0');
    expect(publishJson.game.status).toBe('published');

    // 4. List published games
    const listRes = await app.request('/api/v1/games', { method: 'GET' }, env);
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      games: unknown[];
      total: number;
    };
    expect(listJson.total).toBeGreaterThan(0);
  });
});
