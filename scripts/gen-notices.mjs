#!/usr/bin/env node
// Generates the third-party attribution file that ships with both apps.
//
// MIT, ISC, BSD and zlib all require the copyright notice and permission text
// to travel with the distributed binary. Vite copies `mochi/public/` into both
// `dist/` (Player) and `dist-studio/` (Studio), so writing the file there is
// enough to keep every deploy compliant.
//
// Run: npm run notices

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const outFile = path.join(root, 'mochi', 'public', 'THIRD_PARTY_NOTICES.txt');

const LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENSE-MIT',
  'LICENCE',
  'license',
  'COPYING',
  'COPYING.md'
];

// Workspace packages are ours, not third-party. They carry no license field.
const OWN_PACKAGES = new Set(['mochi', 'mochi-cloud']);

// Upstream source copied directly into mochi/src/engine/vendor/<project>/.
// Every vendored file must be represented here; see docs/OPEN_SOURCE_POLICY.md.
const VENDORED = [
  // { name: 'playcanvas', version: '2.25.0', license: 'MIT', text: '...' }
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Maps a package name to its install directory, preferring the shallowest match
// so hoisted workspaces resolve the same way Node does.
function buildIndex(lockPackages) {
  const index = new Map();
  for (const key of Object.keys(lockPackages)) {
    const marker = key.lastIndexOf('node_modules/');
    if (marker === -1) continue;
    const name = key.slice(marker + 'node_modules/'.length);
    if (!name || name.includes('/node_modules/')) continue;
    const depth = key.split('node_modules/').length;
    const current = index.get(name);
    if (!current || depth < current.depth) {
      index.set(name, { key, depth, entry: lockPackages[key] });
    }
  }
  return index;
}

// Walks the production dependency graph only: dev tooling never reaches the
// bundle, so it does not need to be attributed.
function collectProduction(index, rootDeps) {
  const seen = new Set();
  const queue = [...rootDeps];

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || seen.has(name) || OWN_PACKAGES.has(name)) continue;
    const hit = index.get(name);
    if (!hit) continue;
    seen.add(name);
    for (const child of Object.keys(hit.entry.dependencies ?? {})) {
      if (!seen.has(child)) queue.push(child);
    }
  }

  return [...seen].sort();
}

function readLicenseText(dir) {
  for (const candidate of LICENSE_FILES) {
    const file = path.join(dir, candidate);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').trim();
    if (text.length > 0) return text;
  }
  return null;
}

function normalise(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

function main() {
  const lock = readJson(path.join(root, 'package-lock.json'));
  const pkg = readJson(path.join(root, 'package.json'));
  const lockPackages = lock.packages ?? {};
  const index = buildIndex(lockPackages);

  // This repo is an npm workspace, so the shipped dependencies live on the
  // workspace packages (`mochi`, `mochi-cloud`) rather than on the root.
  const entryPoints = new Set(Object.keys(pkg.dependencies ?? {}));
  for (const workspace of pkg.workspaces ?? []) {
    const entry = lockPackages[workspace];
    if (!entry) continue;
    for (const name of Object.keys(entry.dependencies ?? {})) entryPoints.add(name);
  }

  const names = collectProduction(index, [...entryPoints]);

  const records = [];
  const missingText = [];

  for (const name of names) {
    const { key, entry } = index.get(name);
    const dir = path.join(root, key);
    const license = entry.license ?? 'UNKNOWN';
    const text = fs.existsSync(dir) ? readLicenseText(dir) : null;
    if (!text) missingText.push(`${name}@${entry.version}`);
    records.push({
      name,
      version: entry.version ?? '0.0.0',
      license,
      text: text ? normalise(text) : null
    });
  }

  for (const item of VENDORED) {
    records.push({
      name: item.name,
      version: item.version ?? '0.0.0',
      license: item.license ?? 'UNKNOWN',
      text: item.text ? normalise(item.text) : null
    });
  }

  records.sort((a, b) => a.name.localeCompare(b.name));

  // Deduplicate identical license bodies (most MIT texts differ only by the
  // copyright line, so this still keeps the file readable).
  const texts = new Map();  for (const record of records) {
    if (!record.text) continue;
    const hash = crypto.createHash('sha1').update(record.text).digest('hex').slice(0, 12);
    const bucket = texts.get(hash) ?? { text: record.text, appliesTo: [] };
    bucket.appliesTo.push(`${record.name}@${record.version}`);
    texts.set(hash, bucket);
  }

  const lines = [];
  lines.push('THIRD-PARTY SOFTWARE NOTICES');
  lines.push('');
  lines.push('Mochi Player and Mochi Studio include the third-party software listed');
  lines.push('below. Each component remains under its own license; the full text of');
  lines.push('every distinct license is reproduced at the end of this file.');
  lines.push('');
  lines.push('This file is generated by scripts/gen-notices.mjs. Do not edit by hand.');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Components: ${records.length}`);
  lines.push('');
  lines.push('='.repeat(78));
  lines.push('COMPONENT INDEX');
  lines.push('='.repeat(78));
  lines.push('');

  const width = records.reduce((max, r) => Math.max(max, r.name.length), 0);
  for (const record of records) {
    lines.push(`${record.name.padEnd(width)}  ${record.version.padEnd(12)}  ${record.license}`);
  }

  lines.push('');
  lines.push('='.repeat(78));
  lines.push('LICENSE TEXTS');
  lines.push('='.repeat(78));

  let index_no = 0;
  for (const bucket of texts.values()) {
    index_no += 1;
    lines.push('');
    lines.push('-'.repeat(78));
    lines.push(`[${index_no}] Applies to:`);
    for (const item of bucket.appliesTo) lines.push(`    ${item}`);
    lines.push('-'.repeat(78));
    lines.push('');
    lines.push(bucket.text);
    lines.push('');
  }

  if (missingText.length > 0) {
    lines.push('');
    lines.push('='.repeat(78));
    lines.push('COMPONENTS SHIPPING WITHOUT A BUNDLED LICENSE FILE');
    lines.push('='.repeat(78));
    lines.push('');
    lines.push('Resolve these before release: verify the upstream license and record it.');
    for (const item of missingText) lines.push(`    ${item}`);
  }

  const content = `${lines.join('\n')}\n`;

  // --check is used by `npm run verify:standards`: it fails when a dependency
  // changed but nobody regenerated the notices, which is easy to forget when
  // several agents touch the repo in parallel.
  if (process.argv.includes('--check')) {
    const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    const strip = (value) => value.split('\n').filter((line) => !line.startsWith('Generated: ')).join('\n');
    if (strip(existing) !== strip(content)) {
      console.error(`notices: STALE — ${outFile} does not match the dependency graph.`);
      console.error('notices: run `npm run notices` and commit the result.');
      process.exit(1);
    }
    console.log(`notices: up to date (${records.length} components)`);
    return;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, content, 'utf8');

  const kb = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`notices: ${records.length} components, ${texts.size} license texts -> ${outFile} (${kb} KB)`);
  if (missingText.length > 0) {
    console.warn(`notices: ${missingText.length} components have no license file on disk`);
  }
}

main();
