// Level-of-detail assembly for imported models.
//
// Level 0 is the authored mesh. A heavy model gets a second level decimated by the
// kernel's vertex clustering, and beyond the proxy distance a single box stands
// in for the whole asset. Switching is driven by three.js from the render camera,
// so nothing here runs per frame.
//
// Decimation is deliberately conservative: a mesh whose material samples a texture
// keeps its full detail unless UVs survive the merge, because an averaged UV across
// a texture seam smears the whole map. A model that cannot shed at least 20% of its
// triangles keeps two levels instead of paying memory for a level nobody sees.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { simplifyMesh } from './meshSimplification';

/** Distance where the decimated level takes over, in metres. */
export const MODEL_LOD_DECIMATE_DISTANCE = 45;
/** Distance where the box proxy replaces geometry entirely, in metres. */
export const MODEL_LOD_PROXY_DISTANCE = 120;
/** Models below this triangle count are not worth a decimated level. */
export const MODEL_LOD_DECIMATE_MIN_TRIANGLES = 20_000;
/**
 * Grid resolution across the longest axis. The grid is volumetric but only surface
 * cells are occupied, so a closed model lands near `4 * PI * divisions^2` cells;
 * 32 puts a hero model at roughly 3,000 triangles.
 */
export const MODEL_LOD_DECIMATE_DIVISIONS = 32;
/** A level that saves less than this share of triangles is not added. */
export const MODEL_LOD_MIN_SAVING = 0.2;

/** Triangle count of one geometry, indexed or not. */
export function triangleCountOf(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const position = geometry.getAttribute('position');
  return position ? Math.floor(position.count / 3) : 0;
}

/** Total triangle count under an object. */
export function countTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) total += triangleCountOf(child.geometry);
  });
  return total;
}

/** True when the material samples a texture through UVs, which clustering would smear. */
function usesUvTextures(material: THREE.Material): boolean {
  for (const [key, value] of Object.entries(material)) {
    if (key === 'envMap') continue;
    if (value instanceof THREE.Texture && /Map$/.test(key)) return true;
  }
  return false;
}

function sequentialIndices(count: number): Uint32Array {
  const indices = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) indices[index] = index;
  return indices;
}

/**
 * Replaces one mesh's geometry with a decimated copy. Returns false when the mesh
 * is skipped or the reduction is not worth the memory. The original geometry is
 * never disposed: it is shared with level 0 and with every clone of this asset.
 */
export function decimateMesh(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(mesh.material)) return false;

  const material = mesh.material as THREE.Material & { vertexColors?: boolean };
  if (material.vertexColors) return false;

  const geometry = mesh.geometry;
  if (!geometry || Object.keys(geometry.morphAttributes).length > 0) return false;

  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3) return false;

  const uv = geometry.getAttribute('uv');
  if (uv && uv.itemSize !== 2) return false;
  if (!uv && usesUvTextures(material)) return false;

  const index = geometry.getIndex();
  const indexCount = index ? index.count : position.count;
  if (indexCount < 3 || indexCount % 3 !== 0) return false;

  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return false;
  const extent = Math.max(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z
  );
  if (!(extent > 0)) return false;

  const cellSize = Math.max(extent / MODEL_LOD_DECIMATE_DIVISIONS, 1e-4);
  const result = simplifyMesh({
    positions: position.array as ArrayLike<number>,
    indices: (index ? index.array : sequentialIndices(position.count)) as ArrayLike<number>,
    vertexCount: position.count,
    indexCount,
    cellSize
  });
  if (result.vertexCount === 0 || result.indexCount > indexCount * 0.9) return false;

  const next = new THREE.BufferGeometry();
  next.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
  if (uv) {
    const nextUv = new Float32Array(result.vertexCount * 2);
    for (let vertex = 0; vertex < result.vertexCount; vertex += 1) {
      const source = result.sources[vertex];
      nextUv[vertex * 2] = uv.getX(source);
      nextUv[vertex * 2 + 1] = uv.getY(source);
    }
    next.setAttribute('uv', new THREE.BufferAttribute(nextUv, 2));
  }
  next.setIndex(new THREE.BufferAttribute(result.indices, 1));
  next.computeVertexNormals();
  next.computeBoundingBox();
  next.computeBoundingSphere();

  mesh.geometry = next;
  mesh.userData.mochiDecimated = true;
  return true;
}

/** Disposes only the geometries this module created, never a shared original. */
function disposeDecimated(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.mochiDecimated) {
      child.geometry?.dispose();
    }
  });
}

/**
 * Builds a decimated copy of a model, or null when it is not heavy enough or the
 * reduction is too small to be worth the extra geometry memory.
 */
export function buildDecimatedLevel(model: THREE.Object3D): THREE.Object3D | null {
  const before = countTriangles(model);
  if (before < MODEL_LOD_DECIMATE_MIN_TRIANGLES) return null;

  const clone = cloneSkinned(model) as THREE.Object3D;
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) decimateMesh(child);
  });

  const after = countTriangles(clone);
  if (after === 0 || after > before * (1 - MODEL_LOD_MIN_SAVING)) {
    disposeDecimated(clone);
    return null;
  }
  return clone;
}

function sampleModelColor(model: THREE.Object3D): THREE.Color {
  let found: THREE.Color | undefined;
  model.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh)) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const color = (material as { color?: THREE.Color } | undefined)?.color;
    if (color instanceof THREE.Color) found = color.clone();
  });
  return found ?? new THREE.Color(0x64748b);
}

/**
 * Full mesh up close, decimated geometry at the mid distance, a bounds-fit box
 * beyond the proxy distance. Three.js drives the switch from the render camera.
 */
export function buildModelLod(model: THREE.Object3D, bounds: { x: number; y: number; z: number }): THREE.LOD {
  const lod = new THREE.LOD();
  lod.name = 'model_lod';
  lod.addLevel(model, 0);

  const decimated = buildDecimatedLevel(model);
  if (decimated) lod.addLevel(decimated, MODEL_LOD_DECIMATE_DISTANCE);

  const sizeX = Math.max(0.01, bounds.x);
  const sizeY = Math.max(0.01, bounds.y);
  const sizeZ = Math.max(0.01, bounds.z);
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
    new THREE.MeshStandardMaterial({
      color: sampleModelColor(model),
      roughness: 0.7,
      metalness: 0.1
    })
  );
  proxy.name = 'model_lod_proxy';
  proxy.position.y = sizeY / 2;
  lod.addLevel(proxy, MODEL_LOD_PROXY_DISTANCE);
  return lod;
}
