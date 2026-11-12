// Studio material library: bundled CC0 PBR presets plus the creator's own
// uploaded textures, which are only usable once they have an access id.

import React from 'react';
import { Layers, Upload, X } from 'lucide-react';
import { MATERIAL_PRESETS, resolveMaterialUrl } from '../../engine/materials/materialPresets';
import { resolveAssetBase } from '../../config/assets';
import type { UploadedTexture } from './assets/useUploadedTextures';

export interface MaterialSelection {
  presetId?: string | null;
  accessId?: string | null;
  url?: string | null;
}

export interface StudioMaterialLibraryPanelProps {
  activeTexture?: string | null;
  activeAccessId?: string | null;
  uploads?: UploadedTexture[];
  hiddenPrivateCount?: number;
  disabled?: boolean;
  onApply: (selection: MaterialSelection) => void;
}

export const StudioMaterialLibraryPanel: React.FC<StudioMaterialLibraryPanelProps> = ({
  activeTexture,
  activeAccessId,
  uploads = [],
  hiddenPrivateCount = 0,
  disabled = false,
  onApply
}) => {
  const assetBase = resolveAssetBase();
  const hasSelection = Boolean(activeTexture || activeAccessId);

  return (
    <div className={`p-3 rounded-xl bg-studio-panel border border-studio-border space-y-2 ${
      disabled ? 'opacity-60' : ''
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-studio-accent" />
          <h3 className="text-xs font-bold text-studio-text">Materials</h3>
          <span className="text-[10px] font-mono text-studio-muted">{MATERIAL_PRESETS.length}</span>
        </div>
        {hasSelection && !disabled && (
          <button
            type="button"
            onClick={() => onApply({ presetId: null, accessId: null, url: null })}
            title="Clear texture"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono text-studio-muted hover:text-studio-text hover:bg-studio-card/60"
          >
            <X className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {disabled && (
        <p className="text-[10px] font-mono text-studio-muted">
          Select an object to apply a material.
        </p>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        {MATERIAL_PRESETS.map((preset) => {
          const selected = activeTexture === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onApply({ presetId: preset.id, accessId: null, url: null })}
              title={`${preset.name} (${preset.category})`}
              className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                selected
                  ? 'border-studio-accent ring-1 ring-studio-accent/60'
                  : 'border-studio-border hover:border-studio-muted'
              } ${disabled ? 'cursor-not-allowed' : ''}`}
            >
              <img
                src={resolveMaterialUrl(preset.maps.color, assetBase)}
                alt={preset.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          );
        })}
      </div>

      <div className="pt-1 border-t border-studio-border space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Upload className="w-3 h-3 text-studio-accent" />
          <span className="text-[10px] font-bold text-studio-text">My uploads</span>
          <span className="text-[9px] font-mono text-studio-muted">{uploads.length}</span>
        </div>

        {uploads.length === 0 ? (
          <p className="text-[9px] font-mono text-studio-muted">
            Upload an image in the asset library first. Unuploaded files cannot be used.
          </p>
        ) : (          <div className="grid grid-cols-5 gap-1.5">
            {uploads.map((upload) => {
              const selected = activeAccessId === upload.accessId;
              const blocked = upload.status !== 'ready';
              return (
                <button
                  key={upload.accessId}
                  type="button"
                  disabled={disabled || blocked}
                  onClick={() =>
                    onApply({ presetId: null, accessId: upload.accessId, url: upload.url })
                  }
                  title={`${upload.name} - ${upload.accessId}`}
                  className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                    selected
                      ? 'border-studio-success ring-1 ring-studio-success/60'
                      : 'border-studio-border hover:border-studio-muted'
                  } ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <img
                    src={upload.url}
                    alt={upload.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-studio-overlay/60 text-[8px] font-mono text-studio-text truncate px-0.5">
                    {upload.accessId.slice(-6)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {hiddenPrivateCount > 0 && (
          <p className="text-[9px] font-mono text-studio-warning/80">
            {hiddenPrivateCount} private upload(s) hidden. Set visibility to Unlisted or Public to
            use them in a scene.
          </p>
        )}
      </div>

      <p className="text-[9px] font-mono text-studio-muted">
        Bundled presets are CC0. Uploads are served from the access asset domain.
      </p>
    </div>
  );
};
