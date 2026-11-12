// Loads the creator's uploaded textures joined with their access ids. Only
// images that finished uploading and are readable by players (unlisted or
// public) can be applied to a scene object.

import { useCallback, useEffect, useState } from 'react';
import { assetLibraryApi } from '@/api/assetLibrary';

export interface UploadedTexture {
  accessId: string;
  fileId: string;
  name: string;
  url: string;
  status: 'ready' | 'pending' | 'blocked';
}

export interface UploadedTexturesController {
  uploads: UploadedTexture[];
  hiddenPrivateCount: number;
  isLoading: boolean;
  errorMessage: string | null;
  refresh: () => void;
}

export function useUploadedTextures(token?: string | null): UploadedTexturesController {
  const [uploads, setUploads] = useState<UploadedTexture[]>([]);
  const [hiddenPrivateCount, setHiddenPrivateCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!token) {
      setUploads([]);
      setHiddenPrivateCount(0);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      try {
        const result = await assetLibraryApi.listAccessKeys(token);
        if (cancelled) return;

        const usable: UploadedTexture[] = [];
        let hidden = 0;
        for (const key of result.keys) {
          if (key.kind !== 'image' || !key.url) continue;
          // Private uploads cannot be fetched by an <img> tag (no auth header),
          // so they are not offered until the creator widens visibility.
          if (key.visibility === 'private') {
            hidden += 1;
            continue;
          }
          usable.push({
            accessId: key.accessId,
            fileId: key.fileId,
            name: key.name ?? 'texture',
            url: key.url,
            status: key.status
          });
        }

        setUploads(usable);
        setHiddenPrivateCount(hidden);
        setErrorMessage(null);
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Could not load uploaded textures.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  return { uploads, hiddenPrivateCount, isLoading, errorMessage, refresh };
}
