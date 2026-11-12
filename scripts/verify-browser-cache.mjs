// Real-browser verification for the split apps and their service workers.
// Starts both production previews, drives the installed Chrome through CDP, and
// proves that a repeat visit is served from the service worker cache.
//
// Run from the repo root: npm run verify:browser

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCHI = path.join(ROOT, 'mochi');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const APPS = [
  { name: 'player', config: 'vite.player.config.ts', port: 5190 },
  { name: 'studio', config: 'vite.studio.config.ts', port: 5191 }
];

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

function findChrome() {
  const found = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No Chrome or Edge executable found. Set CHROME_PATH.');
  return found;
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Preview did not become ready: ${url}`);
}

function startPreview(app) {
  const child = spawn(
    process.execPath,
    [VITE_BIN, 'preview', '--config', app.config, '--port', String(app.port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: MOCHI, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  return { child, logs: () => logs };
}

async function verifyApp(browser, url, label) {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  let assetResponses = [];
  const failedAssets = [];
  cdp.on('Network.responseReceived', (event) => {
    if (event.response.url.includes('/assets/')) {
      assetResponses.push({
        url: event.response.url,
        fromServiceWorker: Boolean(event.response.fromServiceWorker)
      });
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/assets/')) failedAssets.push(request.url());
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
      null,
      { timeout: 20000 }
    );

    const initial = await page.evaluate(() => ({
      state: navigator.serviceWorker.controller?.state,
      scope: navigator.serviceWorker.controller?.scriptURL
    }));

    assetResponses = [];
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
      null,
      { timeout: 20000 }
    );

    const caches = await page.evaluate(async () => {
      const keys = await caches.keys();
      const details = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        const entries = await cache.keys();
        details.push({ key, count: entries.length, urls: entries.map((r) => r.url) });
      }
      return details;
    });

    const cachedAssets = caches.flatMap((c) => c.urls).filter((u) => u.includes('/assets/'));
    const servedFromWorker = assetResponses.filter((r) => r.fromServiceWorker);

    return {
      label,
      sw: initial,
      caches: caches.map((c) => ({ key: c.key, count: c.count })),
      cachedAssets: cachedAssets.length,
      assetResponsesOnReload: assetResponses.length,
      servedFromServiceWorker: servedFromWorker.length,
      failedAssets
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const chrome = findChrome();
  console.log(`Browser: ${chrome}`);
  console.log(`Vite:    ${VITE_BIN}\n`);

  const previews = APPS.map(startPreview);
  let browser;

  try {
    for (const app of APPS) {
      await waitForHttp(`http://127.0.0.1:${app.port}/`);
    }
    console.log('Both preview servers are up.\n');

    browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    const results = [];
    for (const app of APPS) {
      results.push(await verifyApp(browser, `http://127.0.0.1:${app.port}/`, app.name));
    }

    let failed = false;
    for (const result of results) {
      const ok =
        result.sw.state === 'activated' &&
        result.caches.some((c) => c.key.includes('immutable')) &&
        result.cachedAssets > 0 &&
        result.failedAssets.length === 0;
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${result.label}`);
      console.log(`  service worker : ${result.sw.state} (${result.sw.scope})`);
      console.log(`  caches         : ${result.caches.map((c) => `${c.key}=${c.count}`).join(', ') || 'none'}`);
      console.log(`  cached chunks  : ${result.cachedAssets}`);
      console.log(`  reload assets  : ${result.assetResponsesOnReload} responses, ${result.servedFromServiceWorker} from service worker`);
      console.log(`  failed assets  : ${result.failedAssets.length}`);
      if (!ok) failed = true;
    }

    if (failed) {
      console.error('\nBrowser cache verification FAILED');
      process.exitCode = 1;
    } else {
      console.log('\nBrowser cache verification PASSED');
    }
  } catch (err) {
    console.error(`\nBrowser cache verification ERROR: ${err instanceof Error ? err.message : String(err)}`);
    for (const preview of previews) {
      const logs = preview.logs().trim();
      if (logs) console.error(`preview log: ${logs.slice(-800)}`);
    }
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    for (const preview of previews) preview.child.kill('SIGTERM');
  }
}

main();
