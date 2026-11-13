// Verifies that the self-hosted fonts actually load in a real browser.
//
// File checks can prove the woff2 files exist and the CSS points at them; they cannot
// prove the browser accepts the bytes and registers the face. This loads the player
// shell in Chrome, asks the font set directly, and fails if anything still reaches a
// third-party font host.
//
// Run from the repo root: npm run verify:fonts

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCHI = path.join(ROOT, 'mochi');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const PORT = 5194;
const URL = `http://127.0.0.1:${PORT}/`;

// Thai text so the browser resolves the thai subset, not just latin.
const SAMPLE = 'สวัสดี';

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
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not become ready: ${url}`);
}

function startDevServer() {
  const child = spawn(
    process.execPath,
    [VITE_BIN, '--config', 'vite.player.config.ts', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: MOCHI, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  return { child, logs: () => logs };
}

async function main() {
  const chrome = findChrome();
  const server = startDevServer();
  let browser;

  try {
    await waitForHttp(URL);
    browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');

    const externalFontRequests = [];
    const fontResponses = [];
    cdp.on('Network.responseReceived', (event) => {
      const url = event.response.url;
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) externalFontRequests.push(url);
      if (url.includes('/fonts/') && url.endsWith('.woff2')) {
        fontResponses.push({ url, status: event.response.status });
      }
    });

    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 30000 });

    const result = await page.evaluate(async (sample) => {
      const load = async (descriptor) => {
        try {
          const faces = await document.fonts.load(descriptor, sample);
          return faces.length;
        } catch (error) {
          return `error: ${error instanceof Error ? error.message : String(error)}`;
        }
      };
      return {
        plexThai: await load('400 16px "IBM Plex Sans Thai"'),
        plexThaiBold: await load('600 16px "IBM Plex Sans Thai"'),
        mitr: await load('500 16px "Mitr"'),
        mitrSemibold: await load('600 16px "Mitr"'),
        declared: [...document.fonts].map((face) => `${face.family}:${face.weight}:${face.status}`)
      };
    }, SAMPLE);

    const failures = [];
    const expectLoaded = (label, value) => {
      if (typeof value !== 'number' || value < 1) failures.push(`${label} did not load (${value})`);
    };
    expectLoaded('IBM Plex Sans Thai 400', result.plexThai);
    expectLoaded('IBM Plex Sans Thai 600', result.plexThaiBold);
    expectLoaded('Mitr 500', result.mitr);
    expectLoaded('Mitr 600', result.mitrSemibold);

    if (externalFontRequests.length > 0) {
      failures.push(`${externalFontRequests.length} request(s) still reach a font CDN`);
    }
    const served = fontResponses.filter((response) => response.status === 200);
    if (served.length === 0) failures.push('no /fonts/*.woff2 response returned 200');

    console.log(`Browser: ${chrome}`);
    console.log(`Faces declared: ${result.declared.length}`);
    console.log(`Font files served: ${served.length} (200)`);
    console.log(`External font requests: ${externalFontRequests.length}`);
    console.log(`Loaded: plex 400/600, mitr 500/600`);

    if (failures.length > 0) {
      for (const failure of failures) console.error(`  FAIL ${failure}`);
      console.error('\nFont verification FAILED');
      process.exitCode = 1;
    } else {
      console.log('\nFont verification PASSED');
    }
  } catch (error) {
    console.error(`\nFont verification ERROR: ${error instanceof Error ? error.message : String(error)}`);
    const logs = server.logs().trim();
    if (logs) console.error(`dev server log: ${logs.slice(-800)}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.child.kill('SIGTERM');
  }
}

main();
