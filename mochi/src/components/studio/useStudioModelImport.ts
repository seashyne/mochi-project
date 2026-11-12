// Uploads GLB/GLTF files through the multipart pipeline and turns them into
// placeable Studio model objects.

import { useCallback, useState } from 'react';
import { assetsApi } from '../../api/assets';
import { StudioObject } from '../../engine/studio/types';
import {
  createModelObject,
  isModelFileName,
  modelContentType
} from '../../engine/studio/modelObject';

export type ModelImportError = 'auth' | 'unsupported' | 'failed';

export interface UseStudioModelImportOptions {
  token: string | null;
  onImported: (object: StudioObject) => void;
}

export function useStudioModelImport(options: UseStudioModelImportOptions) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ModelImportError | null>(null);

  const importModel = useCallback(
    async (file: File): Promise<boolean> => {
      setError(null);
      if (!options.token) {
        setError('auth');
        return false;
      }
      if (!isModelFileName(file.name)) {
        setError('unsupported');
        return false;
      }

      const contentType = modelContentType(file.name) || 'application/octet-stream';
      setIsImporting(true);
      setProgress(0);
      try {
        const asset = await assetsApi.uploadBlob(file, {
          filename: file.name,
          contentType,
          token: options.token,
          onProgress: (state) => {
            const ratio = state.totalBytes > 0 ? state.uploadedBytes / state.totalBytes : 0;
            setProgress(Math.min(1, Math.max(0, ratio)));
          }
        });
        options.onImported(createModelObject({ filename: file.name, asset }));
        return true;
      } catch {
        setError('failed');
        return false;
      } finally {
        setIsImporting(false);
        setProgress(0);
      }
    },
    [options.token, options.onImported]
  );

  return { isImporting, progress, error, importModel };
}
