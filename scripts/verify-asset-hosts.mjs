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
for (const envFile of ['mochi/.env.development', 'mochi/.env.production']) {
  const contents = read(envFile);
  const match = contents.match(/^VITE_ACCESS_ASSETS_URL=(.*)$/m);
  check(Boolean(match), `${envFile} has no VITE_ACCESS_ASSETS_URL`);
  if (match) {
    const configured = match[1].trim().replace(/\/+$/, '');
    const serverHost = String(vars.ACCESS_ASSETS_URL).replace(/\/+$/, '');
    // An explicit empty value is the documented local-dev opt-out: assets are
    // served from the app's own origin there. Production must match exactly.
    const devOptOut = envFile.endsWith('.development') && configured === '';
    check(
      devOptOut || configured === serverHost,
      `${envFile} points at ${configured || 'same-origin'}, but the server resolves ${serverHost}`
    );
  }
}

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
  `Asset hosts verified: ${publicHost} (public), ${accessHost} (gated), API on ${apiHost}.`
);
