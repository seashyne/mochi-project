// Publishing form component for exporting and deploying games to Mochi Cloud

import React, { useMemo, useRef } from 'react';
import { UploadCloud, CheckCircle2, Download, Package } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { StudioObject } from '../../engine/studio/types';
import { computeDownloadBudget, formatByteSize } from './packageHelpers';

export interface StudioPublishFormProps {
  title: string;
  slug: string;
  versionNumber: string;
  description: string;
  objects?: StudioObject[];
  publishNotice: string | null;
  isPublishing?: boolean;
  publishProgress?: string | null;
  onTitleChange: (val: string) => void;
  onSlugChange: (val: string) => void;
  onVersionChange: (val: string) => void;
  onDescChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onExportMochi?: () => void;
  onImportMochi?: (file: File) => void;
}

export const StudioPublishForm: React.FC<StudioPublishFormProps> = ({
  title,
  slug,
  versionNumber,
  description,
  objects,
  publishNotice,
  isPublishing = false,
  publishProgress,
  onTitleChange,
  onSlugChange,
  onVersionChange,
  onDescChange,
  onSubmit,
  onExportMochi,
  onImportMochi
}) => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const budget = useMemo(() => (objects ? computeDownloadBudget(objects) : null), [objects]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportMochi) {
      onImportMochi(file);
    }
  };

  return (
    <div className="bg-studio-panel border border-studio-border rounded-2xl p-5 space-y-4 shadow-sm transition-colors">
      <div className="flex items-center gap-x-2 border-b border-studio-border pb-3">
        <UploadCloud className="w-4 h-4 text-studio-accent" />
        <h2 className="text-sm font-bold text-studio-text">{t.studio.publishTitle}</h2>
      </div>

      {publishNotice && (
        <div className="p-3 bg-studio-success/10 dark:bg-studio-success/15 border border-studio-success/40 rounded-xl flex items-center gap-x-2 text-xs text-studio-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{publishNotice}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="block text-[11px] font-mono text-studio-muted mb-1">{t.studio.worldTitle}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            required
            className="mochi-input w-full px-3 py-2 text-xs rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-mono text-studio-muted mb-1">{t.studio.urlSlug}</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              className="mochi-input w-full px-3 py-2 text-xs rounded-xl"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-studio-muted mb-1">{t.studio.semanticVersion}</label>
            <input
              type="text"
              value={versionNumber}
              onChange={(e) => onVersionChange(e.target.value)}
              className="mochi-input w-full px-3 py-2 text-xs rounded-xl"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-mono text-studio-muted mb-1">{t.studio.description}</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => onDescChange(e.target.value)}
            className="mochi-input w-full px-3 py-2 text-xs rounded-xl resize-none"
          />
        </div>

        {budget && (
          <div className="p-3 bg-studio-card border border-studio-border rounded-xl flex items-center justify-between gap-3 text-xs">
            <span className="text-studio-muted">{t.studio.downloadBudget}</span>
            <span className="font-mono font-semibold text-studio-text">
              {budget.uniqueAssetCount === 0
                ? t.studio.downloadBudgetEmpty
                : `${formatByteSize(budget.assetBytes)} / ${budget.uniqueAssetCount} ${t.studio.assetsUnit}`}
            </span>
          </div>
        )}

        {publishProgress && (
          <div className="p-3 bg-studio-info/10 dark:bg-studio-info/15 border border-studio-info/40 rounded-xl text-xs text-studio-info">
            {publishProgress}
          </div>
        )}

        <button
          type="submit"
          disabled={isPublishing}
          className="w-full py-2.5 mochi-btn-primary rounded-xl text-xs font-bold transition-all shadow-mochi-cyan disabled:opacity-60 disabled:cursor-wait"
        >
          {isPublishing ? t.studio.publishing : t.studio.publishBtn}
        </button>

        <div className="pt-3 border-t border-studio-border flex items-center gap-2">
          {onExportMochi && (
            <button
              type="button"
              onClick={onExportMochi}
              className="flex-1 py-2 px-3 rounded-xl bg-studio-card hover:bg-studio-card/80 text-studio-text text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-studio-border"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .mochi</span>
            </button>
          )}

          {onImportMochi && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mochi,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-xl bg-studio-card hover:bg-studio-card/80 text-studio-text text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-studio-border"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Import .mochi</span>
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
