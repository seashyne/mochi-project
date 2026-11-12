// Animation runtime: player lifecycle, world attachment wiring, GLB clip capture

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { PhysicsWorld } from '../src/engine/physics';
import { AnimationPlayer, createMeshResolver } from '../src/engine/animation/animationPlayer';
import type { MochiAnimationClip } from '../src/engine/animation/clip';
import { attachWorld } from '../src/engine/scene/attachWorld';
import { attachChunkRef, validateManifestV2, type MochiManifestV2 } from '../src/engine/package/manifestV2';
import { clearAssetCache } from '../src/engine/assets/assetCache';
import { clearModelCache, getModelAnimations } from '../src/engine/assets/modelLoader';

const moveClip = (target: string, overrides: Partial<MochiAnimationClip> = {}): MochiAnimationClip => ({
  id: 'clip-1', name: 'Move', duration: 2, loop: true,
  tracks: [{
    target,
    keyframes: [
      { time: 0, position: { x: 0, y: 0, z: 0 } },
      { time: 2, position: { x: 10, y: 0, z: 0 } }
    ]
  }],
  ...overrides
});

afterEach(async () => { vi.unstubAllGlobals(); await clearAssetCache(); clearModelCache(); });

describe('AnimationPlayer', () => {
  it('advances transforms, loops, pauses, speeds and seeks', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    object.userData = { id: 'box' };
    scene.add(object);
    const player = new AnimationPlayer();
    const handle = player.play(scene, moveClip('box'), createMeshResolver([object]))!;
    expect(handle).not.toBeNull();
    player.update(1);
    expect(object.position.x).toBeCloseTo(5, 3);
    player.update(1.5); // Loops past duration.
    expect(object.position.x).toBeCloseTo(2.5, 3);
    handle.pause();
    player.update(1);
    expect(object.position.x).toBeCloseTo(2.5, 3);
    handle.resume();
    handle.setSpeed(2);
    handle.setTime(0);
    player.update(0.5);
    expect(object.position.x).toBeCloseTo(5, 3);
    expect(handle.isRunning()).toBe(true);
    handle.stop();
    expect(player.activeCount).toBe(0);
    player.dispose();
  });

  it('clamps non-looping clips at the end', () => {
    const scene = new THREE.Scene();
    const object = new THREE.Object3D();
    object.userData = { id: 'box' };
    scene.add(object);
    const player = new AnimationPlayer();
    player.play(scene, moveClip('box', { loop: false }), createMeshResolver([object]));
    player.update(5);
    expect(object.position.x).toBeCloseTo(10, 3);
    player.dispose();
  });

  it('returns null when no target resolves and replaces duplicate clip ids', () => {
    const scene = new THREE.Scene();
    const player = new AnimationPlayer();
    expect(player.play(scene, moveClip('ghost'), () => null)).toBeNull();
    const object = new THREE.Object3D();
    object.userData = { id: 'box' };
    scene.add(object);
    player.play(scene, moveClip('box'), createMeshResolver([object]));
    player.play(scene, moveClip('box', { name: 'Second' }), createMeshResolver([object]));
    expect(player.activeCount).toBe(1);
    player.dispose();
  });

  it('resolves bone paths inside model subtrees', () => {
    const root = new THREE.Object3D();
    root.userData = { id: 'model-1' };
    const bone = new THREE.Object3D();
    bone.name = 'Arm';
    root.add(bone);
    const resolve = createMeshResolver([root]);
    expect(resolve('model-1')).toBe(root);
    expect(resolve('model-1/Arm')).toBe(bone);
    expect(resolve('model-1/Missing')).toBeNull();
    expect(resolve('unknown')).toBeNull();
  });
});

describe('world attachment animation wiring', () => {
  it('plays v1 manifest clips through tick and disposes cleanly', () => {
    const scene = new THREE.Scene();
    const manifest = JSON.stringify({
      objects: [{ id: 'h1', name: 'Animated', type: 'block', luaScript: '-- animated', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#ff0000' }],
      animations: [moveClip('h1')]
    });
    const attachment = attachWorld(scene, manifest, new PhysicsWorld());
    const mesh = scene.children.find(child => (child.userData as { id?: string }).id === 'h1')!;
    expect(mesh).toBeTruthy();
    attachment.tick!(1);
    expect(mesh.position.x).toBeCloseTo(5, 3);
    attachment.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('ignores invalid clips without breaking the world', () => {
    const scene = new THREE.Scene();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manifest = JSON.stringify({
      objects: [{ id: 'h1', name: 'H', type: 'block', luaScript: '-- animated', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#ff0000' }],
      animations: [{ id: 'bad' }]
    });
    const attachment = attachWorld(scene, manifest, new PhysicsWorld());
    attachment.tick!(0.5);
    expect(warn).toHaveBeenCalled();
    attachment.dispose();
    warn.mockRestore();
  });

  it('rebinds v2 clips when chunk residency changes', async () => {
    const payloads = new Map<string, string>();
    const refs = [0, 1000].map((x, i) => {
      const payload = {
        chunkId: `chunk-${i}`,
        objects: [{ id: `h${i}`, name: 'H', type: 'block', luaScript: '-- animated', position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#ff0000' }]
      };
      const json = JSON.stringify(payload);
      const url = `https://cdn.test/anim-chunk-${i}.json`;
      payloads.set(url, json);
      return attachChunkRef(payload, { url, key: `assets/anim-chunk-${i}`, hash: 'd'.repeat(64), sizeBytes: new TextEncoder().encode(json).length, contentType: 'application/json' });
    });
    const manifest: MochiManifestV2 = {
      manifestVersion: '2.0', title: 'Anim', version: '1.0.0', spawn: { x: 0, y: 2, z: 0 },
      chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 },
      chunks: refs,
      animations: [
        moveClip('h0'),
        { ...moveClip('h1', { id: 'clip-2' }), tracks: [{ target: 'h1', keyframes: [
          { time: 0, position: { x: 1000, y: 0, z: 0 } },
          { time: 2, position: { x: 1010, y: 0, z: 0 } }
        ] }] }
      ]
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(payloads.get(String(url)) ?? 'missing', { status: payloads.has(String(url)) ? 200 : 404 })));
    const scene = new THREE.Scene();
    const attachment = attachWorld(scene, JSON.stringify(manifest), new PhysicsWorld());
    await attachment.ready;
    attachment.tick!(1);
    const first = scene.children.find(child => (child.userData as { id?: string }).id === 'h0')!;
    expect(first.position.x).toBeCloseTo(5, 3);

    const target = { x: 1000, y: 2, z: 0 };
    for (let i = 0; i < 30; i++) {
      if (attachment.update(target)) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    // Residency remounts run on the throttled update cadence (200ms).
    await new Promise(resolve => setTimeout(resolve, 220));
    attachment.update(target);
    attachment.tick!(1);
    const second = scene.children.find(child => (child.userData as { id?: string }).id === 'h1')!;
    expect(second).toBeTruthy();
    expect(second.position.x).toBeCloseTo(1005, 3);
    attachment.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('manifest animation validation', () => {
  const base = (): MochiManifestV2 => ({
    manifestVersion: '2.0', title: 'T', version: '1.0.0',
    chunking: { strategy: 'grid', cellSize: 64, objectLimitPerChunk: 200 },
    chunks: [], chunkIndex: { hash: 'e'.repeat(64), key: 'assets/sha256/x', url: 'https://cdn.test/x', sizeBytes: 10, contentType: 'application/json' }
  });

  it('accepts valid clips and rejects malformed sections', () => {
    expect(validateManifestV2({ ...base(), animations: [moveClip('h0')] })).toEqual([]);
    expect(validateManifestV2({ ...base(), animations: 'x' })).toContain('animations must be an array');
    expect(validateManifestV2({ ...base(), animations: [{ id: 'bad' }] }).join(' ')).toContain('animations[0]');
    const many = Array.from({ length: 65 }, (_, i) => moveClip('h0', { id: `c${i}` }));
    expect(validateManifestV2({ ...base(), animations: many }).join(' ')).toContain('64 entry ceiling');
  });
});

describe('GLB animation capture', () => {
  it('exposes skeletal clips shipped inside a GLB', async () => {
    // GLTFExporter expects a browser FileReader; node needs a minimal stand-in.
    class NodeFileReader {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); });
      }
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onloadend?.();
        });
      }
    }
    vi.stubGlobal('FileReader', NodeFileReader);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    box.name = 'Box';
    const group = new THREE.Group();
    group.add(box);
    const track = new THREE.VectorKeyframeTrack('Box.position', [0, 1], [0, 0, 0, 3, 0, 0]);
    const clip = new THREE.AnimationClip('Walk', 1, [track]);
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(group, { binary: true, animations: [clip] }) as ArrayBuffer;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(glb, { status: 200 })));
    const { loadModelAsset } = await import('../src/engine/assets/modelLoader');
    await loadModelAsset('https://cdn.test/animated.glb');
    const clips = await getModelAnimations('https://cdn.test/animated.glb');
    expect(clips).toHaveLength(1);
    expect(clips[0].name).toBe('Walk');
    expect(clips[0].tracks[0].name).toContain('position');
  });
});