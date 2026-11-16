// Studio asset library panel: folder tree navigation, search, visibility
// control, and access sharing for creator files.

import React, { useState } from 'react';
import {
  Box, Code, Eye, File as FileIcon, Folder, Globe, Image as ImageIcon,
  Link2, Lock, Music, Plus, RefreshCw, Search, Share2, Trash2, Video
} from 'lucide-react';
import { useAssetLibrary } from './useAssetLibrary';
import { AssetAccessDialog } from './AssetAccessDialog';
import { AssetDropZone } from './AssetDropZone';
import type { AssetFile, AssetKind } from '@/api/assetLibrary';

export interface StudioAssetLibraryPanelProps {
  token?: string | null;
}

const KIND_ICONS: Record<AssetKind, React.ComponentType<{ className?: string }>> = {
  model: Box,
  image: ImageIcon,
  audio: Music,
  video: Video,
  script: Code,
  other: FileIcon
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VISIBILITY_ICON = { private: Lock, unlisted: Link2, public: Globe } as const;

export const StudioAssetLibraryPanel: React.FC<StudioAssetLibraryPanelProps> = ({ token }) => {
  const library = useAssetLibrary(token);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [activeFile, setActiveFile] = useState<AssetFile | null>(null);

  const childFolders = library.folders.filter((folder) => folder.parentId === library.currentFolderId);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const created = await library.createFolder(newFolderName);
    if (created) {
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const cycleVisibility = (file: AssetFile) => {
    const order: AssetFile['visibility'][] = ['private', 'unlisted', 'public'];
    const next = order[(order.indexOf(file.visibility) + 1) % order.length];
    void library.setVisibility(file.id, next);
  };

  if (!token) {
    return (
      <div className="p-3 rounded-xl bg-studio-panel border border-studio-border text-[11px] font-mono text-studio-muted">
        Sign in to manage your asset library.
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-studio-panel border border-studio-border space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-studio-accent" />
          <h3 className="text-xs font-bold text-studio-text">Asset Library</h3>
          <span className="text-[10px] font-mono text-studio-muted">{library.files.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCreatingFolder((v) => !v)}
            title="New folder"
            className="p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={library.refresh}
            title="Refresh"
            className="p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${library.isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3 h-3 text-studio-muted" />
        <input
          value={library.search}
          onChange={(e) => library.setSearch(e.target.value)}
          placeholder="Search assets..."
          className="w-full ps-7 pe-2 py-1.5 rounded-lg bg-studio-card border border-studio-border text-[11px] font-mono text-studio-text placeholder:text-studio-muted focus:outline-none focus:border-studio-accent"
        />
      </div>

      <AssetDropZone
        isUploading={library.isUploading}
        uploadProgress={library.uploadProgress}
        onUpload={(files) => void library.uploadFiles(files)}
      />

      {isCreatingFolder && (
        <div className="flex items-center gap-1.5">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder(); }}
            placeholder="Folder name"
            className="flex-1 px-2 py-1 rounded-lg bg-studio-card border border-studio-border text-[11px] font-mono text-studio-text focus:outline-none focus:border-studio-accent"
          />
          <button
            type="button"
            onClick={() => void handleCreateFolder()}
            className="px-2 py-1 rounded-lg bg-studio-accent/20 border border-studio-accent/40 text-[10px] font-mono text-studio-text"
          >
            Create
          </button>
        </div>
      )}

      <nav className="flex items-center gap-1 flex-wrap text-[10px] font-mono text-studio-muted">
        <button type="button" onClick={() => library.openFolder(null)} className="hover:text-studio-text">
          All Files
        </button>
        {library.breadcrumbs.map((folder) => (
          <React.Fragment key={folder.id}>
            <span>/</span>
            <button type="button" onClick={() => library.openFolder(folder.id)} className="hover:text-studio-text truncate max-w-[110px]">
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {library.errorMessage && (
        <div className="px-2 py-1.5 rounded-lg bg-studio-danger/10 border border-studio-danger/30 text-[10px] text-studio-danger">
          {library.errorMessage}
        </div>
      )}

      {childFolders.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {childFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => library.openFolder(folder.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-studio-card border border-studio-border hover:border-studio-muted text-start"
            >
              <Folder className="w-3.5 h-3.5 text-studio-accent shrink-0" />
              <span className="text-[10px] font-mono text-studio-text truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      )}

      {library.files.length === 0 && !library.isLoading ? (
        <div className="py-4 text-center text-[10px] font-mono text-studio-muted">
          No files yet. Upload an asset to get started.
        </div>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-y-auto pe-1">
          {library.files.map((file) => {
            const Icon = KIND_ICONS[file.kind] ?? FileIcon;
            const VisibilityIcon = VISIBILITY_ICON[file.visibility] ?? Lock;
            return (
              <li key={file.id} className="group flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-studio-card/60">
                <Icon className="w-3.5 h-3.5 text-studio-muted shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-mono text-studio-text truncate">{file.name}</span>
                  <span className="block text-[9px] font-mono text-studio-muted">
                    {file.kind} - {formatBytes(file.sizeBytes)}
                  </span>
                </span>
                <select
                  value={file.folderId ?? ''}
                  onChange={(e) => void library.moveFile(file.id, e.target.value || null)}
                  title="Move to folder"
                  className="max-w-[52px] px-0.5 py-0.5 rounded bg-studio-bg border border-studio-border text-[9px] font-mono text-studio-muted"
                >
                  <option value="">/</option>
                  {library.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => cycleVisibility(file)}
                  title={`Visibility: ${file.visibility}`}
                  className="p-1 rounded text-studio-muted hover:text-studio-text"
                >
                  <VisibilityIcon className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFile(file)}
                  title="Share access"
                  className="p-1 rounded text-studio-muted hover:text-studio-text"
                >
                  <Share2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void library.removeFile(file.id)}
                  title="Delete file"
                  className="p-1 rounded text-studio-muted hover:text-studio-danger"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeFile && (
        <AssetAccessDialog
          file={activeFile}
          token={token}
          onClose={() => setActiveFile(null)}
        />
      )}

      <div className="flex items-center gap-1.5 text-[9px] font-mono text-studio-muted pt-1 border-t border-studio-border">
        <Eye className="w-3 h-3" />
        <span>Private files are only reachable with an explicit grant.</span>
      </div>
    </div>
  );
};
