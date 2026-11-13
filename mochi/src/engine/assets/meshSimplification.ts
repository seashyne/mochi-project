// Mesh decimation for level-of-detail generation.
//
// Vertex clustering: every vertex is snapped to a uniform grid, vertices sharing
// a cell become one cluster, and the cluster is represented by its member closest
// to the centroid. Representing a cluster by a real source vertex (rather than the
// averaged position) is what lets UVs and colours be carried over unchanged - an
// averaged UV across a texture seam smears the whole map.
//
// The pairwise loop runs in the Rust kernel. The TypeScript version below is both
// the fallback for a kernel that never loaded and the reference the parity test
// compares against, so the two cannot drift silently.

import { getWasmKernel } from '../physics/wasmPhysics';

export interface SimplifiedMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** Source vertex index per output vertex: where to read UVs and colours. */
  sources: Uint32Array;
  vertexCount: number;
  indexCount: number;
}

export interface SimplifyInput {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  vertexCount: number;
  indexCount: number;
  /** Grid cell edge in model units. Larger cells mean fewer triangles. */
  cellSize: number;
}

/** An empty result, meaning "refused or collapsed"; callers keep the original. */
export function emptySimplifiedMesh(): SimplifiedMesh {
  return {
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
    sources: new Uint32Array(0),
    vertexCount: 0,
    indexCount: 0
  };
}

function isValidInput(input: SimplifyInput): boolean {
  const { vertexCount, indexCount, cellSize } = input;
  return (
    vertexCount > 0 &&
    indexCount >= 3 &&
    indexCount % 3 === 0 &&
    cellSize > 0 &&
    Number.isFinite(cellSize) &&
    input.positions.length >= vertexCount * 3 &&
    input.indices.length >= indexCount
  );
}

/**
 * Decimates an indexed triangle mesh. Uses the WASM kernel when it is loaded and
 * returns an empty mesh when the input is refused or collapses to nothing.
 */
export function simplifyMesh(input: SimplifyInput): SimplifiedMesh {
  if (!isValidInput(input)) return emptySimplifiedMesh();

  const kernel = getWasmKernel();
  if (!kernel) return simplifyMeshTypeScript(input);

  const { vertexCount, indexCount } = input;
  const posPtr = kernel.alloc_f32_buffer(vertexCount * 3);
  // u32 slots: one allocation unit is four bytes, so N units hold N indices.
  const idxPtr = kernel.alloc_f32_buffer(indexCount);
  const outPosPtr = kernel.alloc_f32_buffer(vertexCount * 3);
  const outIdxPtr = kernel.alloc_f32_buffer(indexCount);
  const outSrcPtr = kernel.alloc_f32_buffer(vertexCount);
  const outCountPtr = kernel.alloc_f32_buffer(2);

  try {
    // Views after every allocation: growing memory detaches earlier buffers.
    const pos = new Float32Array(kernel.memory.buffer, posPtr, vertexCount * 3);
    const idx = new Uint32Array(kernel.memory.buffer, idxPtr, indexCount);
    pos.set(input.positions);
    idx.set(input.indices);

    const triangles = kernel.simplify_mesh(
      posPtr,
      vertexCount,
      idxPtr,
      indexCount,
      input.cellSize,
      outPosPtr,
      outIdxPtr,
      outSrcPtr,
      outCountPtr
    );
    if (triangles === 0) return emptySimplifiedMesh();

    const counts = new Uint32Array(kernel.memory.buffer, outCountPtr, 2);
    const outVertexCount = counts[0];
    const outIndexCount = counts[1];
    if (outVertexCount === 0 || outIndexCount === 0) return emptySimplifiedMesh();

    // Copy out before the buffers are freed.
    return {
      positions: new Float32Array(
        new Float32Array(kernel.memory.buffer, outPosPtr, outVertexCount * 3)
      ),
      indices: new Uint32Array(
        new Uint32Array(kernel.memory.buffer, outIdxPtr, outIndexCount)
      ),
      sources: new Uint32Array(
        new Uint32Array(kernel.memory.buffer, outSrcPtr, outVertexCount)
      ),
      vertexCount: outVertexCount,
      indexCount: outIndexCount
    };
  } finally {
    kernel.free_f32_buffer(posPtr, vertexCount * 3);
    kernel.free_f32_buffer(idxPtr, indexCount);
    kernel.free_f32_buffer(outPosPtr, vertexCount * 3);
    kernel.free_f32_buffer(outIdxPtr, indexCount);
    kernel.free_f32_buffer(outSrcPtr, vertexCount);
    kernel.free_f32_buffer(outCountPtr, 2);
  }
}

/**
 * Grid coordinate of one axis. Mirrors the kernel exactly: the subtraction and
 * division happen in f32, the clamp runs before the floor, and a negative or NaN
 * result folds into cell 0.
 */
function cellIndex(value: number, min: number, cellSize: number): number {
  const raw = Math.fround(Math.fround(value - min) / cellSize);
  if (!(raw > 0)) return 0;
  const clamped = raw > 1_000_000 ? 1_000_000 : raw;
  return Math.floor(clamped);
}

/** Reference implementation. Same cluster order, same representative, same drops. */
export function simplifyMeshTypeScript(input: SimplifyInput): SimplifiedMesh {
  if (!isValidInput(input)) return emptySimplifiedMesh();

  const { positions, indices, vertexCount, indexCount } = input;
  const cellSize = Math.fround(input.cellSize);

  const min = [Infinity, Infinity, Infinity];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[vertex * 3 + axis];
      if (!Number.isFinite(value)) return emptySimplifiedMesh();
      if (value < min[axis]) min[axis] = value;
    }
  }

  const clusterByKey = new Map<string, number>();
  const clusterOfVertex = new Uint32Array(vertexCount);
  const sums: number[][] = [];
  const counts: number[] = [];

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const base = vertex * 3;
    const key =
      `${cellIndex(positions[base], min[0], cellSize)},` +
      `${cellIndex(positions[base + 1], min[1], cellSize)},` +
      `${cellIndex(positions[base + 2], min[2], cellSize)}`;

    let slot = clusterByKey.get(key);
    if (slot === undefined) {
      slot = sums.length;
      clusterByKey.set(key, slot);
      sums.push([0, 0, 0]);
      counts.push(0);
    }
    clusterOfVertex[vertex] = slot;
    for (let axis = 0; axis < 3; axis += 1) {
      sums[slot][axis] += positions[base + axis];
    }
    counts[slot] += 1;
  }

  const clusterCount = sums.length;
  const bestSource = new Uint32Array(clusterCount);
  const bestDistance = new Float64Array(clusterCount).fill(Infinity);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const slot = clusterOfVertex[vertex];
    const divisor = Math.max(1, counts[slot]);
    const base = vertex * 3;
    let distance = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const delta = positions[base + axis] - sums[slot][axis] / divisor;
      distance += delta * delta;
    }
    if (distance < bestDistance[slot]) {
      bestDistance[slot] = distance;
      bestSource[slot] = vertex;
    }
  }

  const outPositions = new Float32Array(clusterCount * 3);
  for (let slot = 0; slot < clusterCount; slot += 1) {
    const source = bestSource[slot];
    for (let axis = 0; axis < 3; axis += 1) {
      outPositions[slot * 3 + axis] = positions[source * 3 + axis];
    }
  }

  const seen = new Set<string>();
  const outIndices = new Uint32Array(indexCount);
  let written = 0;
  for (let triangle = 0; triangle < indexCount / 3; triangle += 1) {
    const base = triangle * 3;
    const corners = [0, 0, 0];
    for (let corner = 0; corner < 3; corner += 1) {
      const raw = indices[base + corner];
      if (!Number.isInteger(raw) || raw < 0 || raw >= vertexCount) {
        return emptySimplifiedMesh();
      }
      corners[corner] = clusterOfVertex[raw];
    }
    if (corners[0] === corners[1] || corners[1] === corners[2] || corners[0] === corners[2]) {
      continue;
    }
    const sorted = [corners[0], corners[1], corners[2]].sort((a, b) => a - b);
    const key = `${sorted[0]},${sorted[1]},${sorted[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outIndices[written] = corners[0];
    outIndices[written + 1] = corners[1];
    outIndices[written + 2] = corners[2];
    written += 3;
  }

  if (written === 0) return emptySimplifiedMesh();
  return {
    positions: outPositions,
    indices: outIndices.subarray(0, written),
    sources: bestSource,
    vertexCount: clusterCount,
    indexCount: written
  };
}
