// The kernel's export surface, kept apart from the bridge so the bridge stays
// under the size ceiling and this file can grow with the kernel.
//
// Every entry is a flat C ABI signature: scalars by value, arrays by pointer into
// the kernel's linear memory. Buffer lengths are always passed alongside, never
// inferred.

export interface WasmPhysicsExports {
  memory: WebAssembly.Memory;
  alloc_f32_buffer: (count: number) => number;
  free_f32_buffer: (ptr: number, count: number) => void;
  vec3_length: (x: number, y: number, z: number) => number;
  vec3_distance: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => number;
  vec3_dot: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => number;
  integrate_body: (
    posPtr: number,
    velPtr: number,
    accelX: number,
    accelY: number,
    accelZ: number,
    dt: number,
    damping: number
  ) => void;
  test_sphere_sphere: (
    ax: number, ay: number, az: number, ar: number,
    bx: number, by: number, bz: number, br: number,
    outContactPtr: number
  ) => number;
  test_sphere_aabb: (
    sx: number, sy: number, sz: number, sr: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    outContactPtr: number
  ) => number;
  test_aabb_aabb: (
    minAx: number, minAy: number, minAz: number,
    maxAx: number, maxAy: number, maxAz: number,
    minBx: number, minBy: number, minBz: number,
    maxBx: number, maxBy: number, maxBz: number
  ) => number;
  ray_intersect_aabb: (
    origX: number, origY: number, origZ: number,
    dirX: number, dirY: number, dirZ: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    maxDist: number
  ) => number;
  ray_intersect_aabb_normal: (
    origX: number, origY: number, origZ: number,
    dirX: number, dirY: number, dirZ: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    maxDist: number,
    outNormalPtr: number
  ) => number;
  resolve_character_box_collision: (
    px: number, py: number, pz: number,
    radius: number, halfHeight: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    outPosPtr: number
  ) => number;
  bake_nav_grid: (
    boxesPtr: number, boxCount: number,
    originX: number, originZ: number,
    cellSize: number, width: number, height: number,
    agentRadius: number,
    walkablePtr: number, regionPtr: number
  ) => number;
  resolve_overlaps: (
    positionsPtr: number, radiiPtr: number, weightsPtr: number,
    count: number, maxStep: number, iterations: number
  ) => number;
  image_dimensions: (dataPtr: number, len: number, outPtr: number) => number;
  audio_duration_ms: (dataPtr: number, len: number) => number;
  simplify_mesh: (
    positionsPtr: number, vertexCount: number,
    indicesPtr: number, indexCount: number,
    cellSize: number,
    outPositionsPtr: number, outIndicesPtr: number,
    outSourcePtr: number, outCountsPtr: number
  ) => number;
  rasterize_occluders: (
    boxesPtr: number, boxCount: number,
    viewProjPtr: number,
    width: number, height: number,
    depthPtr: number
  ) => number;
  test_occlusion: (
    boxesPtr: number, boxCount: number,
    viewProjPtr: number,
    width: number, height: number,
    depthPtr: number,
    depthBias: number,
    inset: number,
    maxPixels: number,
    outFlagsPtr: number
  ) => number;
}
