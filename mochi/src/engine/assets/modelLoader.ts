// GLB/GLTF asset loader with KTX2, Draco, and meshopt decoding.
// Parsed scenes are cached per URL and cloned per placement so multiple
// objects share GPU geometry while keeping independent transforms.

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describeViolations, validateModel } from './assetGuardrails';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { fetchAsset } from './assetCache';
import { registerMaterialVariants } from './materialVariants';

type ProgressCallback = (loadedBytes: number, totalBytes: number) => void;

export interface ModelBounds {
  x: number;
  y: number;
  z: number;
}

export interface ModelColliderPart {
  center: ModelBounds;
  halfExtents: ModelBounds;
}

export interface ModelColliderData {
  bounds: ModelBounds;
  parts: ModelColliderPart[];
}

// Largest meshes kept as separate collider boxes; the rest are ignored so a
// detailed asset still produces a small compound shape.
export const MAX_COLLIDER_PARTS = 6;

const FALLBACK_BOUNDS: ModelBounds = { x: 1, y: 1, z: 1 };

let gltfLoader: GLTFLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;
let dracoLoader: DRACOLoader | null = null;
let ktx2RendererReady = false;

const sceneCache = new Map<string, Promise<THREE.Group>>();
const boundsCache = new Map<string, ModelBounds>();
const colliderPartsCache = new Map<string, ModelColliderPart[]>();
const animationsCache = new Map<string, THREE.AnimationClip[]>();

function ensureLoader(): GLTFLoader {
  if (gltfLoader) return gltfLoader;

  dracoLoader = new DRACOLoader().setDecoderPath('/draco/');
  ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/');
  gltfLoader = new GLTFLoader()
    .setDRACOLoader(dracoLoader)
    .setKTX2Loader(ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);
  // Creator assets ship material skins through KHR_materials_variants, which
  // three's loader does not implement on its own.
  registerMaterialVariants(gltfLoader);
  return gltfLoader;
}

// KTX2 transcoding needs GPU format capabilities, so the first renderer that
// draws models reports itself here.
export function configureModelLoader(renderer: THREE.WebGLRenderer): void {
  ensureLoader();
  if (ktx2RendererReady || !ktx2Loader) return;
  // Headless test renderers expose no extension registry; skip GPU probing.
  const extensions = (renderer as unknown as { extensions?: { has?: unknown } }).extensions;
  if (!extensions || typeof extensions.has !== 'function') return;
  ktx2Loader.detectSupport(renderer);
  ktx2RendererReady = true;
}

// Normalizes a loaded scene to a 1-unit footprint centered on the container
// origin with its base at y=0, so the object's scale property behaves like the
// primitive objects.
function normalizeModel(model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) model.scale.multiplyScalar(1 / maxDim);

  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material?.dispose();
  });
}

async function parseModel(url: string): Promise<THREE.Group> {
  const loader = ensureLoader();
  const basePath = url.slice(0, url.lastIndexOf('/') + 1);
  let data: ArrayBuffer | string | null = null;
  try {
    const blob = await fetchAsset(url);
    data = /\.gltf(\?|$)/i.test(url) ? await blob.text() : await blob.arrayBuffer();
  } catch {
    // Cache/fetch unavailable: let the loader own the network request.
    data = null;
  }

  // Guardrails run on the bytes we already have, so an oversized model is refused
  // before three.js decodes a single triangle.
  if (data instanceof ArrayBuffer) {
    const report = validateModel(data);
    if (report.violations.length > 0) {
      throw new Error(`Model rejected: ${describeViolations(report)}`);
    }
  }

  return new Promise<THREE.Group>((resolve, reject) => {
    const onLoad = (gltf: GLTF) => {
      normalizeModel(gltf.scene);
      animationsCache.set(url, gltf.animations ?? []);
      resolve(gltf.scene);
    };
    if (data !== null) loader.parse(data, basePath, onLoad, reject);
    else loader.load(url, onLoad, undefined, reject);
  });
}

function collectColliderParts(scene: THREE.Group): ModelColliderPart[] {
  const parts: Array<{ box: THREE.Box3; volume: number }> = [];
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    parts.push({ box, volume: size.x * size.y * size.z });
  });

  parts.sort((a, b) => b.volume - a.volume);
  return parts.slice(0, MAX_COLLIDER_PARTS).map(({ box }) => {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      center: { x: center.x, y: center.y, z: center.z },
      halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 }
    };
  });
}

function loadMaster(url: string): Promise<THREE.Group> {
  let cached = sceneCache.get(url);
  if (!cached) {
    cached = parseModel(url).then((scene) => {
      const size = new THREE.Box3()
        .setFromObject(scene)
        .getSize(new THREE.Vector3());
      boundsCache.set(url, { x: size.x, y: size.y, z: size.z });
      colliderPartsCache.set(url, collectColliderParts(scene));
      return scene;
    });
    cached.catch(() => sceneCache.delete(url));
    sceneCache.set(url, cached);
  }
  return cached;
}

export function loadModelAsset(
  url: string,
  onProgress?: ProgressCallback
): Promise<THREE.Group> {
  return loadMaster(url).then((master) => {
    onProgress?.(1, 1);
    return cloneSkinned(master) as THREE.Group;
  });
}

// Local-space size of the normalized model. Shared by the collider fitter so
// physics and rendering agree on the same footprint.
export async function getModelBounds(url: string): Promise<ModelBounds> {
  await loadMaster(url);
  return boundsCache.get(url) ?? FALLBACK_BOUNDS;
}

// Bounds plus per-mesh boxes for a compound collider. Parts are already in the
// normalized model space, so callers only apply the object transform.
export async function getModelColliderData(url: string): Promise<ModelColliderData> {
  await loadMaster(url);
  return {
    bounds: boundsCache.get(url) ?? FALLBACK_BOUNDS,
    parts: colliderPartsCache.get(url) ?? []
  };
}

// Skeletal clips shipped inside the GLB. Bind by node name, so they play on
// any skinned clone of the cached master scene.
export async function getModelAnimations(url: string): Promise<THREE.AnimationClip[]> {
  await loadMaster(url);
  return animationsCache.get(url) ?? [];
}

export interface MountModelOptions {
  lod?: boolean;
}

// Full mesh up close, decimated geometry at the mid distance, box proxy beyond.
// Three.js drives level switching from the render camera automatically.
import { buildModelLod } from './modelLod';

export {
  buildModelLod,
  MODEL_LOD_DECIMATE_DISTANCE,
  MODEL_LOD_PROXY_DISTANCE
} from './modelLod';

// Mounts a model inside a container object. Returns a cancel handle so callers
// can avoid attaching meshes after the container has been removed.
export function mountModel(
  container: THREE.Object3D,
  url: string,
  options: MountModelOptions = {}
): () => void {
  const useLod = options.lod !== false;
  let cancelled = false;
  loadModelAsset(url)
    .then((model) => {
      if (cancelled || !container.parent) {
        disposeTree(model);
        return;
      }
      if (useLod) {
        container.add(buildModelLod(model, boundsCache.get(url) ?? FALLBACK_BOUNDS));
      } else {
        container.add(model);
      }
    })
    .catch((error) => {
      console.warn(`Model asset failed to load: ${url}`, error);
    });
  return () => {
    cancelled = true;
  };
}

export function clearModelCache(): void {
  sceneCache.clear();
  boundsCache.clear();
  colliderPartsCache.clear();
  animationsCache.clear();
}
