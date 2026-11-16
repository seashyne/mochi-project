// Renders the landing hero background and the game-card thumbnails offline.
//
// Uses headless Chromium (playwright-core) to draw a Three.js scene from the
// HDRI + texture library in access/ and writes JPEG output into
// mochi/public/landing/. Run with: node scripts/render-landing-art.mjs
//
// Three.js and its RGBELoader are served from the local node_modules copy, so
// the script needs no network access.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ACCESS = path.join(ROOT, 'access');
const OUT = path.join(ROOT, 'mochi', 'public', 'landing');
const HDRI_1K = path.join(ACCESS, 'HDIs', 'skybox-1k');

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
  '.exr': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

// playwright-core ships no browser; reuse whatever chromium build is already on disk
function resolveBrowserPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (fs.existsSync(base)) {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      for (const rel of [
        'chrome-win64/chrome.exe',
        'chrome-win/chrome.exe',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
      ]) {
        const p = path.join(base, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  const system = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const p of system) if (fs.existsSync(p)) return p;
  return undefined;
}

function findHdri(name) {
  if (!fs.existsSync(HDRI_1K)) return null;
  const hit = fs.readdirSync(HDRI_1K).find((f) => f.toLowerCase().startsWith(name));
  return hit ? path.join(HDRI_1K, hit) : null;
}

// Serves the repo root so the page can import /node_modules/three/... and fetch /access/*.exr
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const target = path.join(ROOT, urlPath);
    if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      if (process.env.SERVE_LOG) console.log('  [404]', urlPath);
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (process.env.SERVE_LOG) console.log('  [serve]', urlPath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const SCENES = [
  {
    id: 'hero-valley',
    width: 2560,
    height: 1440,
    hdri: 'autumn_field',
    exposure: 1.12,
    // Raised + pulled back so the valley floor, rolling hills and the avatar
    // all read; a level camera let the tree canopies swallow the frame.
    camera: { x: -2.6, y: 7.4, z: 15.5 },
    look: { x: 1.2, y: 0.4, z: -6 },
    fov: 52,
    ground: 0x466f33,
    groundRough: 0.95,
    trees: 46,
    rocks: 18,
    character: true,
    fog: 0xc9d8d0,
    fogNear: 22,
    fogFar: 130
  },
  {
    id: 'thumb-obby',
    width: 960,
    height: 540,
    hdri: 'citrus_orchard',
    exposure: 1.0,
    camera: { x: 6, y: 5, z: 12 },
    look: { x: 0, y: 2, z: 0 },
    fov: 46,
    ground: 0x2f6f8f,
    groundRough: 0.6,
    trees: 0,
    rocks: 8,
    character: false,
    platforms: true,
    fog: 0x8fc6e8,
    fogNear: 18,
    fogFar: 110
  },
  {
    id: 'thumb-tycoon',
    width: 960,
    height: 540,
    hdri: 'qwantani_night',
    exposure: 1.1,
    camera: { x: 8, y: 6, z: 13 },
    look: { x: 0, y: 2.5, z: 0 },
    fov: 46,
    ground: 0x1a1d2e,
    groundRough: 0.35,
    trees: 0,
    rocks: 4,
    character: false,
    platforms: true,
    neon: true,
    fog: 0x12162b,
    fogNear: 16,
    fogFar: 100
  },
  {
    id: 'thumb-arena',
    width: 960,
    height: 540,
    hdri: 'belfast_sunset',
    exposure: 1.02,
    camera: { x: 7, y: 4.5, z: 12 },
    look: { x: 0, y: 1.8, z: 0 },
    fov: 48,
    ground: 0x3b3f4a,
    groundRough: 0.25,
    trees: 0,
    rocks: 6,
    character: false,
    platforms: true,
    neon: true,
    fog: 0x6a5a6e,
    fogNear: 16,
    fogFar: 96
  }
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await startServer();
  console.log(`asset server on http://127.0.0.1:${port}`);

  const browser = await chromium.launch({
    executablePath: resolveBrowserPath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('console', (m) => console.log('[page:' + m.type() + ']', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(`http://127.0.0.1:${port}/scripts/render-landing-art.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });

  for (const scene of SCENES) {
    const hdri = scene.hdri ? findHdri(scene.hdri) : null;
    if (scene.hdri && !hdri) {
      console.warn(`skip ${scene.id}: no HDRI for "${scene.hdri}"`);
      continue;
    }
    const hdriUrl = hdri ? `/access/HDIs/skybox-1k/${encodeURIComponent(path.basename(hdri))}` : null;
    console.log(`rendering ${scene.id} (${scene.width}x${scene.height}) hdri=${hdri ? path.basename(hdri) : 'none'}`);
    const dataUrl = await page.evaluate((cfg) => window.renderScene(cfg), { ...scene, hdriUrl });
    const base64 = dataUrl.split(',')[1];
    const file = path.join(OUT, `${scene.id}.jpg`);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
    console.log(`  -> ${path.relative(ROOT, file)}`);
  }

  await browser.close();
  server.close();
  console.log('landing art done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
