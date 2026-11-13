// The published environment: what a creator picked in Studio has to survive publish
// and reach the game. The renderer half needs a GPU, so this covers the data path and
// the rule that a game does not inherit the demo scene.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/engine/physics';
import { attachWorld, resolveWorldEnvironment } from '../src/engine/scene/attachWorld';
import { buildShowcaseScene } from '../src/engine/scene/showcaseScene';
import { STARTER_ENVIRONMENT } from '../src/engine/environment/environmentTypes';
import type { MochiManifestV2 } from '../src/engine/package/manifestV2';

// A v1 manifest: no manifestVersion, so it takes the inline path. A v2 without a
// valid chunking block is rejected by the chunked loader, which is a different test.
function manifest(environment?: unknown): string {
  return JSON.stringify({
    title: 'Env',
    version: '1.0.0',
    objects: [],
    ...(environment ? { environment } : {})
  });
}

describe('world environment', () => {
  it('uses the skybox and lighting the creator chose', () => {
    const chosen = {
      ...STARTER_ENVIRONMENT,
      skyboxId: 'sunset',
      exposure: 1.6,
      fogEnabled: true,
      fogDensity: 0.01
    };
    const resolved = resolveWorldEnvironment(manifest(chosen), null);
    expect(resolved.skyboxId).toBe('sunset');
    expect(resolved.exposure).toBeCloseTo(1.6);
    expect(resolved.fogEnabled).toBe(true);
    expect(resolved.fogDensity).toBeCloseTo(0.01);
  });

  it('falls back to the starter scene when the manifest has none', () => {
    expect(resolveWorldEnvironment(manifest(), null)).toEqual(STARTER_ENVIRONMENT);
    expect(resolveWorldEnvironment(undefined, null)).toEqual(STARTER_ENVIRONMENT);
  });

  it('survives a malformed manifest instead of throwing', () => {
    expect(resolveWorldEnvironment('{ not json', null)).toEqual(STARTER_ENVIRONMENT);
    expect(resolveWorldEnvironment(manifest({ skyboxId: 'no_such_sky' }), null).skyboxId)
      .toBe(STARTER_ENVIRONMENT.skyboxId);
  });

  it('prefers the chunked manifest field over the raw JSON', () => {
    const chunked = {
      manifestVersion: '2.0',
      title: 'Chunked',
      version: '1.0.0',
      chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 },
      chunks: [],
      environment: { ...STARTER_ENVIRONMENT, skyboxId: 'night_stars' }
    } as MochiManifestV2;

    expect(resolveWorldEnvironment(undefined, chunked).skyboxId).toBe('night_stars');
  });

  it('does not light a world without a renderer', () => {
    // The demo lights used to be added unconditionally by RuntimeEngine; this asserts
    // the world itself adds nothing when there is no renderer to light for.
    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, manifest(), new PhysicsWorld());
    const lights = scene.children.filter((child) => (child as THREE.Light).isLight === true);
    expect(lights).toEqual([]);
    attachment.dispose();
  });
});

describe('showcase scene', () => {
  it('is a self-contained bundle a game can decline', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const showcase = buildShowcaseScene(scene, physics);

    expect(scene.children.length).toBeGreaterThan(0);
    expect(scene.children).toContain(showcase.centralMesh);
    expect(scene.children).toContain(showcase.orbitingLight);
    expect(physics.getBody('ground_floor')).toBeDefined();
  });
});
