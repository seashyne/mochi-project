// Studio panel for importing GLB/GLTF assets through the resumable upload
// pipeline. Successful imports are placed as model objects in the world.

import React, { useRef } from 'react';
import { Upload, Box, Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { StudioObject } from '../../engine/studio/types';
import { useStudioModelImport } from './useStudioModelImport';

export interface StudioModelImportProps {
  token: string | null;
  onImported: (object: StudioObject) => void;
}

export const StudioModelImport: React.FC<StudioModelImportProps> = ({ token, onImported }) => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { isImporting, progress, error, importModel } = useStudioModelImport({
    token,
    onImported
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importModel(file);
  };

  return (
    <div className="p-3.5 rounded-xl bg-studio-panel border border-studio-border text-studio-text space-y-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-studio-border">
        <span className="text-[11px] font-mono uppercase tracking-wider text-studio-muted font-bold">
          {t.studio.importModel}
        </span>
        <Box className="w-3.5 h-3.5 text-studio-accent" />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={handleFileChange}
      />

      <button
        type="button"
        disabled={isImporting}
        onClick={() => fileInputRef.current?.click()}
        className="w-full px-3 py-2.5 rounded-xl bg-studio-card hover:bg-studio-card/80 border border-studio-border hover:border-studio-accent/50 text-xs font-bold text-studio-text flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-wait"
      >
        {isImporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-studio-accent" />
        ) : (
          <Upload className="w-3.5 h-3.5 text-studio-accent" />
        )}
        <span>{isImporting ? t.studio.importingModel : t.studio.importModel}</span>
      </button>

      <p className="text-[10px] text-studio-muted leading-relaxed">{t.studio.importModelHint}</p>

      {isImporting && (
        <div className="h-1.5 rounded-full bg-studio-card overflow-hidden">
          <div
            className="h-full bg-studio-accent transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-studio-danger">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>
            {error === 'unsupported'
              ? t.studio.importModelUnsupported
              : t.studio.importModelFailed}
          </span>
        </div>
      )}
    </div>
  );
};
