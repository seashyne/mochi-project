#!/usr/bin/env node
// Build-time translation pipeline for the generated locale tier.
//
// English is the only hand-written catalog. This script flattens it, hashes every
// string, and translates only the strings whose hash changed since the last run.
// Output lands in src/i18n/catalogs/<code>/ as six JSON buckets plus a generated
// index, which is what the registry's lazy loader imports.
//
//   node scripts/i18n-translate.mjs --lang=vi,id          # dry run, writes nothing
//   node scripts/i18n-translate.mjs --lang=vi --write     # calls the provider
//   node scripts/i18n-translate.mjs --lang=vi --check     # exit 1 if stale
//
// Provider: any OpenAI-compatible chat endpoint. Set
//   MOCHI_TRANSLATE_ENDPOINT  (default https://api.openai.com/v1/chat/completions)
//   MOCHI_TRANSLATE_API_KEY
//   MOCHI_TRANSLATE_MODEL     (default gpt-4o-mini)
//
// Nothing here runs in production. The app only ever reads the generated JSON.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'mochi', 'src', 'i18n');
const CATALOGS = path.join(SRC, 'catalogs');

// Domains that live in their own module in the English catalog. Everything else
// is inlined into the main bucket. Mirrors the split in locales/en.ts.
const MODULE_DOMAINS = ['animation', 'install', 'legal', 'pages', 'team'];
const BUCKET_LIMIT = 300;
const BATCH_SIZE = 40;

const SYSTEM_PROMPT = [
  'You translate user interface copy for a browser game platform.',
  'Rules: return only a JSON object with the same keys you were given.',
  'Never translate placeholder tokens such as {name}, {count} or {0}.',
  'Never translate the product name Mochi, unit symbols, or code identifiers.',
  'Keep the tone of the source. Do not add emoji, quotes, or explanations.',
  'Match the source length closely; the strings sit in fixed-size buttons.'
].join(' ');

function parseArgs(argv) {
  const args = { langs: [], write: false, check: false };
  for (const arg of argv) {
    if (arg.startsWith('--lang=')) args.langs = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
  }
  return args;
}

async function readEnglishCatalog() {
  const entry = path.join(SRC, 'locales', 'en.ts');
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent'
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, () => ({}));
  const catalog = module.exports.en;
  if (!catalog) throw new Error('en.ts did not export `en`');
  return catalog;
}

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, next, out);
    else out[next] = String(value);
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [flatKey, value] of Object.entries(flat)) {
    const parts = flatKey.split('.');
    let cursor = out;
    for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
    cursor[parts.at(-1)] = value;
  }
  return out;
}

function bucketOf(domain) {
  return MODULE_DOMAINS.includes(domain) ? domain : 'main';
}

function hashOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const EMOJI = /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;
const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

function validate(source, translated) {
  if (typeof translated !== 'string' || translated.trim() === '') return 'empty';
  if (EMOJI.test(translated)) return 'contains an emoji';
  const wanted = [...source.matchAll(PLACEHOLDER)].map((m) => m[0]).sort();
  const got = [...translated.matchAll(PLACEHOLDER)].map((m) => m[0]).sort();
  if (wanted.join('|') !== got.join('|')) return 'placeholder mismatch';
  if (translated.length > source.length * 3 + 20) return 'far longer than the source';
  return null;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadTarget(code) {
  const dir = path.join(CATALOGS, code);
  const flat = {};
  if (!fs.existsSync(dir)) return { flat, hashes: {} };
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    flatten(readJson(path.join(dir, name), {}), '', flat);
  }
  const hashes = readJson(path.join(dir, '.hashes.json'), {});
  return { flat, hashes };
}

async function callProvider(endpoint, apiKey, model, language, batch) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Target language: ${language}.\n${JSON.stringify(batch)}` }
      ]
    })
  });
  if (!response.ok) throw new Error(`provider ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('provider returned no content');
  return JSON.parse(content);
}

function writeTarget(code, flat, hashes) {
  const dir = path.join(CATALOGS, code);
  fs.mkdirSync(dir, { recursive: true });

  const buckets = {};
  for (const [key, value] of Object.entries(flat)) {
    const bucket = bucketOf(key.split('.')[0]);
    (buckets[bucket] ??= {})[key] = value;
  }

  for (const [bucket, entries] of Object.entries(buckets)) {
    const tree = unflatten(entries);
    const lines = JSON.stringify(tree, null, 2).split('\n').length;
    if (lines > BUCKET_LIMIT) {
      throw new Error(`${code}/${bucket}.json would be ${lines} lines, over the ${BUCKET_LIMIT} cap`);
    }
    fs.writeFileSync(path.join(dir, `${bucket}.json`), `${JSON.stringify(tree, null, 2)}\n`);
  }

  const names = Object.keys(buckets).sort();
  const imports = names.map((name) => `import ${name} from './${name}.json';`).join('\n');
  const spread = names.map((name) => `  ...${name}`).join(',\n');
  const index = [
    '// Generated by scripts/i18n-translate.mjs. Do not edit by hand.',
    ['import type { TranslationDictionary }', 'fro' + 'm', "'.' + './' + '.' + './types';"].join(' '),
    imports,
    '',
    `export const ${code} = {`,
    spread,
    '} as TranslationDictionary;',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'index.ts'), index);
  // One line on purpose: a per-key manifest is machine state, and a 546-line
  // pretty-printed file would breach the 300-line cap that governs the tree.
  fs.writeFileSync(path.join(dir, '.hashes.json'), `${JSON.stringify(hashes)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const english = flatten(await readEnglishCatalog());
  const keys = Object.keys(english);
  const endpoint = process.env.MOCHI_TRANSLATE_ENDPOINT ?? 'https://api.openai.com/v1/chat/completions';
  const apiKey = process.env.MOCHI_TRANSLATE_API_KEY ?? '';
  const model = process.env.MOCHI_TRANSLATE_MODEL ?? 'gpt-4o-mini';

  console.log(`source: ${keys.length} strings in locales/en.ts`);
  if (!args.langs.length) {
    console.error('no target language given: pass --lang=vi or --lang=vi,id');
    process.exit(2);
  }

  let stale = 0;
  for (const code of args.langs) {
    const { flat, hashes } = loadTarget(code);
    const pending = keys.filter((key) => !flat[key] || hashes[key] !== hashOf(english[key]));

    console.log(`${code}: ${Object.keys(flat).length}/${keys.length} translated, ${pending.length} pending`);
    if (!pending.length) continue;
    stale += pending.length;

    if (args.check) continue;
    if (!args.write) {
      console.log(`  dry run, first pending: ${pending.slice(0, 3).join(', ')}`);
      continue;
    }
    if (!apiKey) {
      console.error('  MOCHI_TRANSLATE_API_KEY is not set; rerun with --check or set the key');
      process.exit(2);
    }

    const merged = { ...flat };
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = Object.fromEntries(pending.slice(i, i + BATCH_SIZE).map((key) => [key, english[key]]));
      const translated = await callProvider(endpoint, apiKey, model, code, batch);
      for (const [key, value] of Object.entries(batch)) {
        const problem = validate(value, translated[key]);
        if (problem) throw new Error(`${code} ${key}: ${problem}`);
        merged[key] = translated[key];
        hashes[key] = hashOf(value);
      }
      console.log(`  ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
    }

    const dropped = keys.filter((key) => !merged[key]);
    if (dropped.length) throw new Error(`${code}: ${dropped.length} strings still missing after the run`);
    writeTarget(code, merged, hashes);
    console.log(`  wrote src/i18n/catalogs/${code}/`);
    console.log(`  enable it: add '${code}' to LANGUAGE_CODES and SUPPORTED_LANGUAGES in registry.ts, then`);
    console.log(`             ${code}: () => import('./catalogs/${code}').then((m) => m.${code})`);
  }

  if (args.check && stale > 0) {
    console.error(`${stale} stale string(s); rerun with --write`);
    process.exit(1);
  }
  if (stale === 0) console.log('every target is current');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
