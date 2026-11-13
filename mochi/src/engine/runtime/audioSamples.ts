// WebAudio side of uploaded samples: fetching, decoding, and turning an access id
// into a servable URL. Kept out of AudioBus so the bus stays routing and mixing.

/** Resolves `acc_...` through the asset service. Returns null when it refuses. */
export async function resolveAccessAssetUrl(accessId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/v1/access/assets/${encodeURIComponent(accessId)}`, {
      credentials: 'include'
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { url?: unknown };
    return typeof body.url === 'string' && body.url.length > 0 ? body.url : null;
  } catch {
    return null;
  }
}

/** Fetches and decodes an audio file. Returns null on any failure, never throws. */
export async function decodeSampleFromUrl(
  ctx: AudioContext,
  url: string
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}
