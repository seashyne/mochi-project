import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/index';
import { createMockDb } from './mockDb';
import { MochiEnv } from '../src/types/env';

describe('Adversarial Challenge Probe 1 & 2: Leak, Symlink & CORS', () => {
  let env: MochiEnv;
  const projectRoot = path.resolve(__dirname, '../..');
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    '.wrangler',
    '.tmp',
    'coverage'
  ]);

  beforeEach(() => {
    env = {
      DB: createMockDb(),
      ASSETS: {
        put: async () => ({}) as R2Object,
        get: async () => null,
        delete: async () => {},
        head: async () => null
      } as unknown as R2Bucket,
      GAME_ROOM: {
        idFromName: () => ({} as DurableObjectId),
        get: () => ({
          fetch: async () => new Response(null, { status: 101 })
        } as unknown as DurableObjectStub)
      } as unknown as DurableObjectNamespace,
      ALLOWED_ORIGINS: 'https://game.lenout.com,http://localhost:5173',
      API_HOSTNAME: 'api-game.lenout.com',
      PUBLIC_ASSETS_URL: 'https://assets-game.lenout.com',
      JWT_SECRET: 'super-secure-jwt-secret-key-32-chars-min'
    };
  });

  function getProjectFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        results.push(fullPath);
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          results.push(...getProjectFiles(fullPath));
        }
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('Probe 1A: confirms zero symlinks exist across the workspace', () => {
    const files = getProjectFiles(projectRoot);
    const symlinks: string[] = [];
    for (const f of files) {
      if (fs.lstatSync(f).isSymbolicLink()) {
        symlinks.push(f);
      }
    }
    expect(symlinks).toEqual([]);
  });

  it('Probe 1B: confirms zero forbidden framework imports in source code', () => {
    const srcFiles = getProjectFiles(projectRoot).filter((f) => {
      const rel = path.relative(projectRoot, f);
      return (
        (rel.startsWith('mochi' + path.sep + 'src') ||
          rel.startsWith('mochi-cloud' + path.sep + 'src')) &&
        /\.(ts|tsx|js)$/.test(f)
      );
    });

    const forbiddenImports: { file: string; line: string }[] = [];
    const forbidden = ['lenout-cloud', 'Alenout Project', ['@', 'arlay'].join('')];

    for (const f of srcFiles) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((line) => {
        if (/import|require|from/.test(line)) {
          for (const pattern of forbidden) {
            if (line.includes(pattern)) {
              forbiddenImports.push({
                file: path.relative(projectRoot, f),
                line: line.trim()
              });
            }
          }
        }
      });
    }
    expect(forbiddenImports).toEqual([]);
  });

  it('Probe 1C: confirms zero path traversals escaping workspace root in imports', () => {
    const srcFiles = getProjectFiles(projectRoot).filter((f) =>
      /\.(ts|tsx|js|mjs|cjs|json)$/.test(f)
    );

    const escapes: { file: string; line: string }[] = [];
    for (const f of srcFiles) {
      const rel = path.relative(projectRoot, f);
      const depth = rel.split(path.sep).length - 1;
      const lines = fs.readFileSync(f, 'utf8').split('\n');

      lines.forEach((line) => {
        if (/import|require|from/.test(line)) {
          const dots = line.match(/\.\.\//g);
          if (dots && dots.length > depth) {
            escapes.push({ file: rel, line: line.trim() });
          }
        }
      });
    }
    expect(escapes).toEqual([]);
  });

  it('Probe 2A: evaluates CORS with game.lenout.com and custom domain https://mochigame.com', async () => {
    // 1. Default domain game.lenout.com
    const defaultRes = await app.request(
      '/api/v1/health',
      { method: 'GET', headers: { Origin: 'https://game.lenout.com' } },
      env
    );
    expect(defaultRes.status).toBe(200);
    expect(defaultRes.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://game.lenout.com'
    );

    // 2. Custom domain rebinding via ALLOWED_ORIGINS
    const customEnv = {
      ...env,
      ALLOWED_ORIGINS: 'https://mochigame.com,https://studio.mochigame.com'
    };
    const customRes = await app.request(
      '/api/v1/health',
      { method: 'GET', headers: { Origin: 'https://mochigame.com' } },
      customEnv
    );
    expect(customRes.status).toBe(200);
    expect(customRes.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://mochigame.com'
    );

    // Old domain is no longer permitted
    const staleRes = await app.request(
      '/api/v1/health',
      { method: 'GET', headers: { Origin: 'https://game.lenout.com' } },
      customEnv
    );
    expect(staleRes.headers.get('Access-Control-Allow-Origin')).not.toBe(
      'https://game.lenout.com'
    );
  });

  it('Probe 2B: rejects unauthorized origins and subdomain spoofing', async () => {
    const maliciousOrigins = [
      'https://evil.com',
      'https://attacker.org',
      'https://game.lenout.com.evil.com',
      'https://not-game.lenout.com',
      'null'
    ];

    for (const origin of maliciousOrigins) {
      const res = await app.request(
        '/api/v1/health',
        { method: 'GET', headers: { Origin: origin } },
        env
      );
      // Invariant: Response ACAO header must never match the unauthorized origin
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
    }
  });

  it('permits multipart hash headers without widening the allowed origins', async () => {
    for (const origin of ['https://game.lenout.com', 'https://untrusted.example']) {
      const response = await app.request('/api/v1/assets/multipart/part', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type,x-upload-token,x-part-sha256'
        }
      }, env);
      expect(response.status).toBe(204);
      const headers = response.headers.get('Access-Control-Allow-Headers')!.toLowerCase().split(/,\s*/);
      expect(headers).toEqual(expect.arrayContaining(['content-type', 'x-upload-token', 'x-part-sha256']));
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      expect(response.headers.get('Access-Control-Allow-Origin') === origin).toBe(origin === 'https://game.lenout.com');
    }
  });

  it('Probe 2C: handles OPTIONS preflight for allowed vs unauthorized origins', async () => {
    const validPreflight = await app.request(
      '/api/v1/games',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://game.lenout.com',
          'Access-Control-Request-Method': 'POST'
        }
      },
      env
    );
    expect(validPreflight.status).toBe(204);
    expect(validPreflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://game.lenout.com'
    );

    const evilPreflight = await app.request(
      '/api/v1/games',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.com',
          'Access-Control-Request-Method': 'POST'
        }
      },
      env
    );
    expect(evilPreflight.status).toBe(204);
    expect(evilPreflight.headers.get('Access-Control-Allow-Origin')).not.toBe(
      'https://evil.com'
    );
  });
});
