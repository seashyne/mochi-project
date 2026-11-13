// Software occlusion culling: a coarse w-buffer rasterised from static boxes.
//
// Every pixel stores 1/w of the nearest occluder surface. 1/w is linear in screen
// space under perspective, so it interpolates across a triangle without perspective
// correction; NDC z does not, and interpolating it orders surfaces wrongly on large
// faces.
//
// This module is the pure reference: no wasm, no three.js, no DOM. The kernel
// bridge in `occlusionRaster.ts` calls it as the fallback, and the parity test
// compares the two. It keeps its arithmetic in doubles rather than emulating f32:
// the two agree on every classification, and a bit-exact f32 emulation in the
// inner loop would cost more than the pass saves.

/** Width of the occlusion buffer. Coarse on purpose: this is a cover test, not an image. */
export const OCCLUSION_WIDTH = 256;
/** Height of the occlusion buffer. */
export const OCCLUSION_HEIGHT = 144;
/** Relative 1/w margin an occluder must beat a candidate by. */
export const OCCLUSION_DEPTH_BIAS = 0.02;
/** Pixels trimmed from a candidate rectangle so a one-pixel sliver cannot save it. */
export const OCCLUSION_INSET = 1;
/** Candidate rectangles above this many pixels are drawn rather than tested. */
export const OCCLUSION_MAX_TEST_PIXELS = Math.floor(OCCLUSION_WIDTH * OCCLUSION_HEIGHT * 0.25);

export interface OcclusionView {
  /** 16 floats, column-major, already multiplied view * projection. */
  viewProjection: Float32Array;
  width: number;
  height: number;
}

export interface OcclusionTestOptions {
  depthBias?: number;
  inset?: number;
  maxPixels?: number;
}

type Projected = { x: number; y: number; invW: number };

const BOX_FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [5, 4, 7, 6],
  [4, 0, 3, 7],
  [1, 5, 6, 2],
  [4, 5, 1, 0],
  [3, 2, 6, 7]
];

function projectCorner(vp: Float32Array, x: number, y: number, z: number): Projected | null {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (!(cw > 1e-6)) return null;
  const inv = 1 / cw;
  return { x: cx * inv, y: cy * inv, invW: inv };
}

function screenX(ndcX: number, width: number): number {
  return (ndcX * 0.5 + 0.5) * width;
}

function screenY(ndcY: number, height: number): number {
  return (0.5 - ndcY * 0.5) * height;
}

function boxCorners(boxes: ArrayLike<number>, index: number): number[] | null {
  const base = index * 6;
  const minX = boxes[base];
  const minY = boxes[base + 1];
  const minZ = boxes[base + 2];
  const maxX = boxes[base + 3];
  const maxY = boxes[base + 4];
  const maxZ = boxes[base + 5];
  if (!(minX <= maxX && minY <= maxY && minZ <= maxZ)) return null;
  return [
    minX, minY, minZ,
    maxX, minY, minZ,
    maxX, maxY, minZ,
    minX, maxY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ
  ];
}

function rasterTriangle(
  depth: Float32Array,
  width: number,
  height: number,
  a: Projected,
  b: Projected,
  c: Projected
): void {
  const startX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const endX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const startY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const endY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  if (startX > endX || startY > endY) return;

  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(area) < 1e-9) return;
  const invArea = 1 / area;

  for (let py = startY; py <= endY; py += 1) {
    const cy = py + 0.5;
    for (let px = startX; px <= endX; px += 1) {
      const cx = px + 0.5;
      const b0 = ((b.x - cx) * (c.y - cy) - (c.x - cx) * (b.y - cy)) * invArea;
      const b1 = ((c.x - cx) * (a.y - cy) - (a.x - cx) * (c.y - cy)) * invArea;
      const b2 = 1 - b0 - b1;
      if (b0 < -0.0001 || b1 < -0.0001 || b2 < -0.0001) continue;
      const invW = b0 * a.invW + b1 * b.invW + b2 * c.invW;
      const index = py * width + px;
      if (invW > depth[index]) depth[index] = invW;
    }
  }
}

/** Reference rasteriser. Mirrors the kernel's face order and per-pixel rule. */
export function rasterizeOccludersTypeScript(
  boxes: ArrayLike<number>,
  view: OcclusionView,
  depth: Float32Array
): number {
  const { viewProjection: vp, width, height } = view;
  depth.fill(0);

  const boxCount = Math.floor(boxes.length / 6);
  let drawn = 0;

  for (let index = 0; index < boxCount; index += 1) {
    const corners = boxCorners(boxes, index);
    if (!corners) continue;

    const projected: Projected[] = [];
    let clipped = false;
    for (let corner = 0; corner < 8; corner += 1) {
      const point = projectCorner(
        vp,
        corners[corner * 3],
        corners[corner * 3 + 1],
        corners[corner * 3 + 2]
      );
      if (!point) {
        clipped = true;
        break;
      }
      projected.push({
        x: screenX(point.x, width),
        y: screenY(point.y, height),
        invW: point.invW
      });
    }
    if (clipped) continue;

    for (const face of BOX_FACES) {
      rasterTriangle(depth, width, height, projected[face[0]], projected[face[1]], projected[face[2]]);
      rasterTriangle(depth, width, height, projected[face[0]], projected[face[2]], projected[face[3]]);
    }
    drawn += 1;
  }

  return drawn;
}

/** Reference occlusion test. Same rectangle, inset and bias rules as the kernel. */
export function testOcclusionTypeScript(
  candidates: ArrayLike<number>,
  view: OcclusionView,
  depth: Float32Array,
  options: OcclusionTestOptions = {}
): Uint8Array {
  const { viewProjection: vp, width, height } = view;
  const bias = 1 + Math.max(0, options.depthBias ?? OCCLUSION_DEPTH_BIAS);
  const inset = options.inset ?? OCCLUSION_INSET;
  const maxPixels = options.maxPixels ?? OCCLUSION_MAX_TEST_PIXELS;

  const boxCount = Math.floor(candidates.length / 6);
  const flags = new Uint8Array(boxCount);

  for (let index = 0; index < boxCount; index += 1) {
    const corners = boxCorners(candidates, index);
    if (!corners) continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let nearest = 0;
    let clipped = false;

    for (let corner = 0; corner < 8; corner += 1) {
      const point = projectCorner(
        vp,
        corners[corner * 3],
        corners[corner * 3 + 1],
        corners[corner * 3 + 2]
      );
      if (!point) {
        clipped = true;
        break;
      }
      const sx = screenX(point.x, width);
      const sy = screenY(point.y, height);
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
      if (point.invW > nearest) nearest = point.invW;
    }
    if (clipped) continue;

    const startX = Math.max(0, Math.floor(minX + inset));
    const endX = Math.min(width - 1, Math.ceil(maxX - inset));
    const startY = Math.max(0, Math.floor(minY + inset));
    const endY = Math.min(height - 1, Math.ceil(maxY - inset));
    if (startX > endX || startY > endY) continue;

    const spanX = endX - startX + 1;
    const spanY = endY - startY + 1;
    if (maxPixels > 0 && spanX * spanY > maxPixels) continue;

    const threshold = nearest * bias;
    let covered = true;
    for (let py = startY; py <= endY && covered; py += 1) {
      const row = py * width;
      for (let px = startX; px <= endX; px += 1) {
        if (depth[row + px] <= threshold) {
          covered = false;
          break;
        }
      }
    }
    if (covered) flags[index] = 1;
  }

  return flags;
}
