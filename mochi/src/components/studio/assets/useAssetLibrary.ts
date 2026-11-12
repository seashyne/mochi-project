// State controller for the Studio asset library: folder navigation, search,
// and file mutations against the creator file registry.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assetLibraryApi,
  type AssetFile,
  type AssetFolder,
  type AssetVisibility
} from '@/api/assetLibrary';
import { assetsApi } from '@/api/assets';

export interface UploadOutcome {
  uploaded: number;
  failed: number;
}

export interface AssetLibraryController {
  folders: AssetFolder[];
  files: AssetFile[];
  currentFolderId: string | null;
  breadcrumbs: AssetFolder[];
  search: string;
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  errorMessage: string | null;
  setSearch: (value: string) => void;
  openFolder: (folderId: string | null) => void;
  refresh: () => void;
  createFolder: (name: string) => Promise<boolean>;
  renameFile: (fileId: string, name: string) => Promise<boolean>;
  moveFile: (fileId: string, folderId: string | null) => Promise<boolean>;
  removeFile: (fileId: string) => Promise<boolean>;
  setVisibility: (fileId: string, visibility: AssetVisibility) => Promise<boolean>;
  uploadFiles: (files: File[]) => Promise<UploadOutcome>;
}

function buildBreadcrumbs(folders: AssetFolder[], folderId: string | null): AssetFolder[] {
  if (!folderId) return [];
  const byId = new Map<string, AssetFolder>(
    folders.map((folder) => [folder.id, folder] as [string, AssetFolder])
  );
  const trail: AssetFolder[] = [];
  let cursor: string | null = folderId;
  const guard = new Set<string>();
  while (cursor && byId.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor);
    const folder: AssetFolder = byId.get(cursor)!;
    trail.unshift(folder);
    cursor = folder.parentId;
  }
  return trail;
}

export function useAssetLibrary(token?: string | null): AssetLibraryController {
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!token) {
      setFolders([]);
      setFiles([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const load = async () => {
      try {
        const [folderResult, fileResult] = await Promise.all([
          assetLibraryApi.listFolders(token),
          assetLibraryApi.listFiles(
            {
              folderId: debouncedSearch ? undefined : currentFolderId,
              search: debouncedSearch || undefined,
              limit: 200
            },
            token
          )
        ]);
        if (cancelled) return;
        setFolders(folderResult.folders);
        setFiles(fileResult.files);
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Could not load assets.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, currentFolderId, debouncedSearch, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const createFolder = useCallback(
    async (name: string) => {
      if (!token || !name.trim()) return false;
      try {
        await assetLibraryApi.createFolder(name.trim(), currentFolderId, token);
        refresh();
        return true;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not create folder.');
        return false;
      }
    },
    [token, currentFolderId, refresh]
  );

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      if (!token || !name.trim()) return false;
      try {
        await assetLibraryApi.updateFile(fileId, { name: name.trim() }, token);
        refresh();
        return true;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not rename file.');
        return false;
      }
    },
    [token, refresh]
  );

  const removeFile = useCallback(
    async (fileId: string) => {
      if (!token) return false;
      try {
        await assetLibraryApi.deleteFile(fileId, token);
        refresh();
        return true;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not delete file.');
        return false;
      }
    },
    [token, refresh]
  );

  const setVisibility = useCallback(
    async (fileId: string, visibility: AssetVisibility) => {
      if (!token) return false;
      try {
        await assetLibraryApi.updateFile(fileId, { visibility }, token);
        setFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, visibility } : file)));
        return true;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not update visibility.');
        return false;
      }
    },
    [token]
  );

  const moveFile = useCallback(
    async (fileId: string, folderId: string | null) => {
      if (!token) return false;
      try {
        await assetLibraryApi.updateFile(fileId, { folderId }, token);
        refresh();
        return true;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not move file.');
        return false;
      }
    },
    [token, refresh]
  );

  // Uploads run sequentially so progress is monotonic and the registry lookup
  // for the freshly stored object key stays unambiguous.
  const uploadFiles = useCallback(
    async (incoming: File[]): Promise<UploadOutcome> => {
      if (!token || incoming.length === 0) return { uploaded: 0, failed: incoming.length };
      setIsUploading(true);
      setUploadProgress(0);
      setErrorMessage(null);
      let uploaded = 0;
      let failed = 0;

      for (let index = 0; index < incoming.length; index += 1) {
        const file = incoming[index];
        try {
          const asset = await assetsApi.uploadBlob(file, {
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            token,
            onProgress: (state) => {
              const ratio = state.totalBytes > 0 ? state.uploadedBytes / state.totalBytes : 0;
              setUploadProgress(Math.min(1, (index + ratio) / incoming.length));
            }
          });

          if (currentFolderId) {
            const listing = await assetLibraryApi.listFiles({ folderId: null, limit: 200 }, token);
            const registered = listing.files.find((entry) => entry.objectKey === asset.assetKey);
            if (registered) {
              await assetLibraryApi.updateFile(registered.id, { folderId: currentFolderId }, token);
            }
          }
          uploaded += 1;
        } catch (err) {
          failed += 1;
          setErrorMessage(err instanceof Error ? err.message : `Upload failed for ${file.name}.`);
        }
      }

      setIsUploading(false);
      setUploadProgress(0);
      refresh();
      return { uploaded, failed };
    },
    [token, currentFolderId, refresh]
  );

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(folders, currentFolderId),
    [folders, currentFolderId]
  );

  return {
    folders,
    files,
    currentFolderId,
    breadcrumbs,
    search,
    isLoading,
    isUploading,
    uploadProgress,
    errorMessage,
    setSearch,
    openFolder: setCurrentFolderId,
    refresh,
    createFolder,
    renameFile,
    moveFile,
    removeFile,
    setVisibility,
    uploadFiles
  };
}
