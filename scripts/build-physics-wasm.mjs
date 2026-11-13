#!/usr/bin/env node
// Builds the Rust physics kernel and copies the wasm binary into the web client.
// Run after editing mochi-physics-wasm/src/lib.rs so the shipped artifact never
// drifts from source.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const crateDir = path.join(root, 'mochi-physics-wasm');
const artifact = path.join(
  crateDir,
  'target',
  'wasm32-unknown-unknown',
  'release',
  'mochi_physics_wasm.wasm'
);
const destination = path.join(root, 'mochi', 'public', 'wasm', 'mochi_physics_wasm.wasm');

if (!fs.existsSync(path.join(crateDir, 'Cargo.toml'))) {
  console.error(`Rust crate not found at ${crateDir}`);
  process.exit(1);
}

console.log('Building mochi-physics-wasm (release, wasm32-unknown-unknown)...');
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
  cwd: crateDir,
  stdio: 'inherit'
});

if (!fs.existsSync(artifact)) {
  console.error(`Build produced no artifact at ${artifact}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(artifact, destination);

const bytes = fs.statSync(destination).size;
console.log(`Copied ${bytes} bytes to ${path.relative(root, destination)}`);

// Fail fast if the kernel is missing an expected export.
const expected = [
  'vec3_length',
  'test_aabb_aabb',
  'test_sphere_aabb',
  'ray_intersect_aabb',
  'ray_intersect_aabb_normal',
  'resolve_character_box_collision',
  'bake_nav_grid',
  'resolve_overlaps',
  'image_dimensions',
  'audio_duration_ms'
];

const module = await WebAssembly.instantiate(fs.readFileSync(destination), {});
const exports = Object.keys(module.instance.exports);
const missing = expected.filter((name) => !exports.includes(name));
if (missing.length > 0) {
  console.error(`WASM is missing exports: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Verified ${expected.length} kernel exports.`);
