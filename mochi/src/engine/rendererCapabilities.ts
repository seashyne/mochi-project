// Dependency-free renderer capability detection for the web runtime.
// The engine keeps its synchronous WebGL2 renderer; this module only reports
// what the browser can do so the UI can surface it. Nothing here imports three
// or the WebGPU renderer, and every probe is guarded so detection never throws.

export interface RendererCapabilities {
  webgl2: boolean;
  webgpu: boolean;
  preferred: 'webgpu' | 'webgl2' | 'none';
  adapterInfo: string | null;
}

const NO_CAPABILITIES: RendererCapabilities = {
  webgl2: false,
  webgpu: false,
  preferred: 'none',
  adapterInfo: null
};

function globalValue(key: string): unknown {
  try {
    return Reflect.get(globalThis, key);
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const kind = typeof value;
  if (kind !== 'object' && kind !== 'function') return null;
  return value as Record<string, unknown>;
}

function detectWebgl2(): boolean {
  try {
    const doc = asObject(globalValue('document'));
    if (!doc || typeof doc.createElement !== 'function') return false;
    const canvas = asObject((doc.createElement as (tag: string) => unknown)('canvas'));
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    const context = (canvas.getContext as (kind: string) => unknown)('webgl2');
    return context !== null && context !== undefined;
  } catch {
    return false;
  }
}

function adapterLabel(info: Record<string, unknown> | null): string | null {
  if (!info) return null;
  const parts = (['vendor', 'architecture', 'device', 'description'] as const)
    .map((key) => info[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return parts.length > 0 ? parts.join(' / ') : null;
}

async function describeAdapter(adapter: unknown): Promise<string> {
  try {
    const obj = asObject(adapter);
    if (!obj) return 'WebGPU adapter';
    const infoLabel = adapterLabel(asObject(obj.info));
    if (infoLabel) return infoLabel;
    const legacy = obj.requestAdapterInfo;
    if (typeof legacy === 'function') {
      const legacyInfo = asObject(await (legacy as () => Promise<unknown>).call(adapter));
      const label = adapterLabel(legacyInfo);
      if (label) return label;
    }
  } catch {
    // Adapter metadata is best-effort; the adapter itself is already usable.
  }
  return 'WebGPU adapter';
}

export async function detectRendererCapabilities(nav?: unknown): Promise<RendererCapabilities> {
  try {
    const source = nav !== undefined ? nav : globalValue('navigator');
    const webgl2 = detectWebgl2();
    const fallback: RendererCapabilities = {
      webgl2,
      webgpu: false,
      preferred: webgl2 ? 'webgl2' : 'none',
      adapterInfo: null
    };
    const gpu = asObject(asObject(source)?.gpu);
    if (!gpu || typeof gpu.requestAdapter !== 'function') return fallback;
    let adapter: unknown;
    try {
      adapter = await (gpu.requestAdapter as () => Promise<unknown>)();
    } catch {
      return fallback;
    }
    if (!adapter) return fallback;
    return {
      webgl2,
      webgpu: true,
      preferred: 'webgpu',
      adapterInfo: await describeAdapter(adapter)
    };
  } catch {
    return { ...NO_CAPABILITIES };
  }
}
