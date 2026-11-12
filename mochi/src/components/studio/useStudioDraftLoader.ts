// Extracted cloud draft hydration for the Studio editor. Keeping this out of
// StudioPage leaves room for the collaborative session wiring.

import { useEffect } from 'react';
import { studioDraftsApi, StudioProjectDraft } from '../../api/studioDrafts';
import { parseStudioRoute } from '../../routes/studioRouting';

export interface StudioDraftLoaderOptions {
  mapId: string | null;
  token: string | null;
  onLoaded: (draft: StudioProjectDraft, manifest: Record<string, unknown>) => void;
}

export function useStudioDraftLoader({ mapId, token, onLoaded }: StudioDraftLoaderOptions): void {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const parsed = parseStudioRoute(window.location.pathname, window.location.search);
    const targetId = mapId || parsed.mapId || parsed.projectId;
    if (!targetId || !token) return undefined;
    let cancelled = false;
    void studioDraftsApi.get(targetId, token).then(({ draft }) => {
      if (cancelled || !draft) return;
      let manifest: Record<string, unknown> = {};
      try {
        manifest = JSON.parse(draft.manifestJson) as Record<string, unknown>;
      } catch { /* a malformed draft still loads its metadata */ }
      onLoaded(draft, manifest);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [mapId, token, onLoaded]);
}
