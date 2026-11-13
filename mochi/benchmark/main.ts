// Client render benchmark: a fixed chunked world, measured with and without the
// occlusion pass.
//
// Draw calls and triangle counts are what the culling passes actually change, and
// they are hardware independent. Frame time is reported too, but a headless browser
// rasterises in software (SwiftShader), so that number describes the CPU rasteriser,
// not a laptop GPU - do not quote it as a frame-rate result.
//
// Run with: npm run benchmark:client

import * as THREE from 'three';
import { PhysicsWorld } from '@/engine/physics';
import { loadChunkedWorld } from '@/engine/scene/chunkedWorldLoader';
import { updateDistanceCulling } from '@/engine/scene/distanceCulling';
import {
  getOcclusionStats,
  setOccluderBoxes,
  setOccludersFromPhysics,
  updateOcclusionCulling
} from '@/engine/scene/occlusionCulling';
import { VIEWPOINTS, buildManifest } from './world';

const WARMUP_FRAMES = 20;
const MEASURE_FRAMES = 120;

interface FrameStats {
  drawCalls: number;
  triangles: number;
  submitMs: number;
}

interface ViewpointResult {
  name: string;
  occluded: number;
  targets: number;
  rebuildMs: number;
  testMs: number;
  withOcclusion: FrameStats;
  withoutOcclusion: FrameStats;
}

interface BenchmarkResult {
  renderer: string;
  chunks: number;
  objects: number;
  occluders: number;
  viewpoints: ViewpointResult[];
}


function measure(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  frames: number,
  collectOcclusion = false
): FrameStats & { rebuildMs: number; testMs: number; occluded: number; targets: number } {
  let drawCalls = 0;
  let triangles = 0;
  let submitMs = 0;
  let rebuildMs = 0;
  let testMs = 0;
  let occluded = 0;
  let targets = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const started = performance.now();
    updateDistanceCulling(camera);
    updateOcclusionCulling(camera);
    renderer.render(scene, camera);
    submitMs += performance.now() - started;
    drawCalls += renderer.info.render.calls;
    triangles += renderer.info.render.triangles;

    if (collectOcclusion) {
      const stats = getOcclusionStats();
      if (stats) {
        rebuildMs += stats.rebuildMs;
        testMs += stats.testMs;
        occluded += stats.occluded;
        targets = stats.targets;
      }
    }
  }

  return {
    drawCalls: drawCalls / frames,
    triangles: triangles / frames,
    submitMs: submitMs / frames,
    rebuildMs: rebuildMs / frames,
    testMs: testMs / frames,
    occluded: occluded / frames,
    targets
  };
}

async function run(): Promise<BenchmarkResult> {
  const { manifest, objectCount } = buildManifest();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  const physics = new PhysicsWorld();

  const world = await loadChunkedWorld(scene, manifest, physics, {
    loadRadius: 10_000,
    unloadRadius: 10_000,
    maxResidentChunks: 256,
    maxResidentBytes: 512 * 1024 * 1024,
    concurrency: 8
  });
  await world.whenIdle();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223044, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(1280, 720, false);
  renderer.setPixelRatio(1);
  document.body.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(65, 1280 / 720, 0.1, 600);
  const occluders = setOccludersFromPhysics(physics);
  const viewpoints: ViewpointResult[] = [];

  for (const viewpoint of VIEWPOINTS) {
    camera.position.copy(viewpoint.position);
    camera.lookAt(viewpoint.target);
    camera.updateMatrixWorld();

    // Warm up: shader compilation and first upload must not land in the measurement.
    measure(renderer, scene, camera, WARMUP_FRAMES);

    setOccludersFromPhysics(physics);
    const withOcclusion = measure(renderer, scene, camera, MEASURE_FRAMES, true);

    // Empty occluder set makes the pass self-gate off and release every flag.
    setOccluderBoxes(new Float32Array(0));
    const withoutOcclusion = measure(renderer, scene, camera, MEASURE_FRAMES);

    viewpoints.push({
      name: viewpoint.name,
      occluded: withOcclusion.occluded,
      targets: withOcclusion.targets,
      rebuildMs: withOcclusion.rebuildMs,
      testMs: withOcclusion.testMs,
      withOcclusion: {
        drawCalls: withOcclusion.drawCalls,
        triangles: withOcclusion.triangles,
        submitMs: withOcclusion.submitMs
      },
      withoutOcclusion: {
        drawCalls: withoutOcclusion.drawCalls,
        triangles: withoutOcclusion.triangles,
        submitMs: withoutOcclusion.submitMs
      }
    });
  }

  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));

  renderer.dispose();
  const chunks = world.loadedChunkIds.length;
  world.dispose();

  return {
    renderer: rendererName,
    chunks,
    objects: objectCount,
    occluders,
    viewpoints
  };
}

declare global {
  interface Window {
    __mochiBenchmark?: { done: boolean; result?: BenchmarkResult; error?: string };
  }
}

const output = document.getElementById('out');

run()
  .then((result) => {
    window.__mochiBenchmark = { done: true, result };
    if (output) {
      const lines = [`renderer  ${result.renderer}`, `chunks    ${result.chunks}`, `objects   ${result.objects}`];
      for (const viewpoint of result.viewpoints) {
        lines.push(
          `${viewpoint.name}: ${viewpoint.occluded.toFixed(0)}/${viewpoint.targets} occluded, ` +
          `${viewpoint.withoutOcclusion.drawCalls.toFixed(0)} -> ${viewpoint.withOcclusion.drawCalls.toFixed(0)} draw calls`
        );
      }
      output.textContent = lines.join('\n');
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    window.__mochiBenchmark = { done: true, error: message };
    if (output) output.textContent = `failed: ${message}`;
  });
