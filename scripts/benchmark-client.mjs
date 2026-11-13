// Client render benchmark: loads a fixed chunked world in a real browser and
// reports what the culling passes change.
//
// Draw calls and triangle counts are exact and hardware independent. Frame time is
// reported too, but a headless browser rasterises in software (SwiftShader), so that
// column describes the CPU rasteriser - it is not a frame-rate result and must not
// be quoted as one.
//
// Run from the repo root: npm run benchmark:client

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCHI = path.join(ROOT, 'mochi');
const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const PORT = 5193;
const URL = `http://127.0.0.1:${PORT}/benchmark/index.html`;

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

function formatRow(label, before, after, digits = 0) {
  const delta = after - before;
  const share = before > 0 ? ` (${((delta / before) * 100).toFixed(1)}%)` : '';
  return `  ${label.padEnd(12)} ${before.toFixed(digits).padStart(9)} -> ${after.toFixed(digits).padStart(9)}${share}`;
}

async function main() {
  const chrome = findChrome();
  const server = startDevServer();
  let browser;

  try {
    await waitForHttp(URL);
    console.log(`Browser: ${chrome}`);
    console.log(`Page:    ${URL}\n`);

    browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'
      ]
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (error) => console.error(`page error: ${error.message}`));

    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(
      () => Boolean(window.__mochiBenchmark && window.__mochiBenchmark.done),
      null,
      { timeout: 180000 }
    );

    const outcome = await page.evaluate(() => window.__mochiBenchmark);
    if (!outcome || outcome.error) {
      throw new Error(outcome?.error ?? 'benchmark produced no result');
    }

    const result = outcome.result;
    console.log('Fixed 6x6 room world, one chunk per room\n');
    console.log(`  renderer    ${result.renderer}`);
    console.log(`  chunks      ${result.chunks}`);
    console.log(`  objects     ${result.objects}`);
    console.log(`  occluders   ${result.occluders}\n`);

    let regressed = false;
    for (const viewpoint of result.viewpoints) {
      console.log(`  ${viewpoint.name}: ${viewpoint.occluded.toFixed(0)} of ${viewpoint.targets} targets occluded`);
      console.log(`  ${''.padEnd(12)}   ${'without'.padStart(9)}   ${'with'.padStart(9)}`);
      console.log(formatRow('draw calls', viewpoint.withoutOcclusion.drawCalls, viewpoint.withOcclusion.drawCalls));
      console.log(formatRow('triangles', viewpoint.withoutOcclusion.triangles, viewpoint.withOcclusion.triangles));
      console.log(formatRow('submit ms', viewpoint.withoutOcclusion.submitMs, viewpoint.withOcclusion.submitMs, 3));
      console.log(`  pass cost    rebuild ${viewpoint.rebuildMs.toFixed(3)} ms, test ${viewpoint.testMs.toFixed(3)} ms per frame\n`);
      if (viewpoint.withOcclusion.drawCalls > viewpoint.withoutOcclusion.drawCalls + 0.001) {
        regressed = true;
      }
    }

    console.log('  submit ms is CPU command submission, not frame rate: the headless');
    console.log('  browser rasterises in software (SwiftShader). Draw calls and triangle');
    console.log('  counts are exact and hardware independent.');

    if (regressed) {
      console.error('\nFAILED: the occlusion pass increased draw calls');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nBenchmark ERROR: ${error instanceof Error ? error.message : String(error)}`);
    const logs = server.logs().trim();
    if (logs) console.error(`dev server log: ${logs.slice(-800)}`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.child.kill('SIGTERM');
  }
}

main();
