// Drag-and-drop upload surface for the Studio asset library. Owns the hidden
// file input, drag state, and upload progress bar.

import React, { useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';

export interface AssetDropZoneProps {
  isUploading: boolean;
  uploadProgress: number;
  onUpload: (files: File[]) => void;
  disabled?: boolean;
}

export const AssetDropZone: React.FC<AssetDropZoneProps> = ({
  isUploading,
  uploadProgress,
  onUpload,
  disabled = false
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onUpload(Array.from(list));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !isUploading) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled || isUploading) return;
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border border-dashed transition-colors ${
        isDragging ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-card/40'
      }`}
    >
      <button
        type="button"
        disabled={disabled || isUploading}
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-mono text-studio-muted hover:text-studio-text disabled:opacity-60"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Uploading {Math.round(uploadProgress * 100)}%</span>
          </>
        ) : (
          <>
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Drop files or click to upload</span>
          </>
        )}
      </button>

      {isUploading && (
        <div className="h-1 mx-2 mb-2 rounded-full bg-studio-bg overflow-hidden">
          <div
            className="h-full bg-studio-accent transition-all"
            style={{ width: `${Math.round(uploadProgress * 100)}%` }}
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};
