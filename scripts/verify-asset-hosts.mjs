#!/usr/bin/env node
// Fails the standards gate when an asset host exists in `vars` but no worker
// route serves it, or when the client points at a different host than the server
// resolves. A URL that nothing listens on is worse than a missing variable.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

// wrangler.jsonc is JSON in this repo; strip line comments just in case.
const wrangler = JSON.parse(
  read('mochi-cloud/wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '')
);
const vars = wrangler.vars ?? {};
const routes = (wrangler.routes ?? []).map((route) => route.pattern);

const hostOf = (value) => {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return null;
  }
};

const publicHost = hostOf(vars.PUBLIC_ASSETS_URL);
const accessHost = hostOf(vars.ACCESS_ASSETS_URL);
const apiHost = hostOf(`https://${vars.API_HOSTNAME}`);

check(Boolean(vars.PUBLIC_ASSETS_URL), 'PUBLIC_ASSETS_URL is missing from cloud vars');
check(Boolean(vars.ACCESS_ASSETS_URL), 'ACCESS_ASSETS_URL is missing from cloud vars');
check(String(vars.PUBLIC_ASSETS_URL ?? '').startsWith('https://'), 'PUBLIC_ASSETS_URL must be https');
check(String(vars.ACCESS_ASSETS_URL ?? '').startsWith('https://'), 'ACCESS_ASSETS_URL must be https');

for (const [name, host] of [['PUBLIC_ASSETS_URL', publicHost], ['ACCESS_ASSETS_URL', accessHost]]) {
  check(host !== null, `${name} is not a valid URL`);
  if (!host) continue;
  check(routes.includes(host), `${name} host ${host} has no custom_domain route`);
  check(host !== apiHost, `${name} must not share the API origin`);
}
check(publicHost !== accessHost, 'public and gated assets must not share an origin');

// The client must resolve access assets on the same host the server hands out.
// The .env files themselves are gitignored, so the tracked templates are the
// checked source of truth; real files are validated only when a developer has one.
const serverHost = String(vars.ACCESS_ASSETS_URL).replace(/\/+$/, '');
const validateClientEnv = (envFile, optional) => {
  const absolute = path.join(root, envFile);
  if (optional && !fs.existsSync(absolute)) return;
  const contents = read(envFile);
  const match = contents.match(/^VITE_ACCESS_ASSETS_URL=(.*)$/m);
  check(Boolean(match), `${envFile} has no VITE_ACCESS_ASSETS_URL`);
  if (!match) return;
  const configured = match[1].trim().replace(/\/+$/, '');
  // An empty value is the documented local-dev opt-out (same-origin assets).
  const devOptOut = envFile.includes('development') && configured === '';
  check(
    devOptOut || configured === serverHost,
    `${envFile} points at ${configured || 'same-origin'}, but the server resolves ${serverHost}`
  );
};

validateClientEnv('mochi/config/env.development.example', false);
validateClientEnv('mochi/config/env.production.example', false);
validateClientEnv('mochi/.env.development', true);
validateClientEnv('mochi/.env.production', true);

// The baked-in fallback in the client must match as well, or a build without the
// env file silently uses a different host.
const clientConfig = read('mochi/src/config/assets.ts');
const fallback = clientConfig.match(/DEFAULT_ACCESS_ASSET_HOST\s*=\s*'([^']+)'/);
check(Boolean(fallback), 'DEFAULT_ACCESS_ASSET_HOST not found in config/assets.ts');
if (fallback) {
  check(
    fallback[1].replace(/\/+$/, '') === String(vars.ACCESS_ASSETS_URL).replace(/\/+$/, ''),
    `config/assets.ts fallback ${fallback[1]} disagrees with ${vars.ACCESS_ASSETS_URL}`
  );
}

if (problems.length > 0) {
  console.error('Asset host configuration is inconsistent:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Asset hosts configured: ${publicHost} (public), ${accessHost} (gated), API on ${apiHost}.`
);

// `--live` probes the real hosts. A 404 from an unused key is a pass: the worker
// answered, which is exactly what a missing custom domain does not do.
if (process.argv.includes('--live')) {
  const probe = async (host) => {
    try {
      const response = await fetch(`https://${host}/api/v1/assets/file/assets/sha256/__health__`, {
        signal: AbortSignal.timeout(8000)
      });
      return response.status;
    } catch {
      return 0;
    }
  };
  const statuses = await Promise.all([probe(publicHost), probe(accessHost)]);
  const liveProblems = [];
  [publicHost, accessHost].forEach((host, index) => {
    const status = statuses[index];
    console.log(`  ${host}: ${status === 0 ? 'no answer (000)' : `HTTP ${status}`}`);
    // 404 means the route exists but the key does not; 200 would mean a real file.
    if (status !== 404 && status !== 200 && status !== 403) {
      liveProblems.push(`${host} did not answer (got ${status})`);
    }
  });
  if (liveProblems.length > 0) {
    console.error('Live asset hosts are not bound yet:');
    for (const problem of liveProblems) console.error(`  - ${problem}`);
    console.error('See docs/PLATFORM_ROADMAP.md section 12 for the deploy step.');
    process.exit(1);
  }
  console.log('Live asset hosts verified.');
}
