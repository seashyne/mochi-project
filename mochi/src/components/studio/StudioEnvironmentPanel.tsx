// Studio environment panel: starter skybox picker plus sun, ambient, and fog
// controls. Mirrors the object inspector styling so it can sit in the same
// right-hand column as the hierarchy and inspector.

import React from 'react';
import { Cloud, Sun, RotateCcw, Wind, Loader2 } from 'lucide-react';
import type { EnvironmentState } from '../../engine/environment/environmentTypes';
import { SKYBOX_PRESETS } from '../../engine/environment/skyboxPresets';
import { resolveAssetBase } from '../../config/assets';

export interface StudioEnvironmentPanelProps {
  environment: EnvironmentState;
  onChange: (patch: Partial<EnvironmentState>) => void;
  onReset: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}) => (
  <label className="block space-y-1">
    <span className="flex items-center justify-between text-[11px] font-mono text-studio-muted">
      <span>{label}</span>
      <span className="text-studio-text">
        {value.toFixed(step < 1 ? 2 : 0)}
        {suffix ?? ''}
      </span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 rounded-full appearance-none bg-studio-card accent-studio-accent cursor-pointer"
    />
  </label>
);

export const StudioEnvironmentPanel: React.FC<StudioEnvironmentPanelProps> = ({
  environment,
  onChange,
  onReset,
  isLoading = false,
  errorMessage = null
}) => {
  const assetBase = resolveAssetBase();

  return (
    <div className="p-3 rounded-xl bg-studio-panel border border-studio-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-studio-accent" />
          <h3 className="text-xs font-bold text-studio-text">Environment</h3>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-studio-muted" />}
        </div>
        <button
          type="button"
          onClick={onReset}
          title="Reset to starter environment"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-studio-muted hover:text-studio-text hover:bg-studio-card/60 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Starter</span>
        </button>
      </div>

      {errorMessage && (
        <div className="px-2 py-1.5 rounded-lg bg-studio-danger/10 border border-studio-danger/40 text-[10px] text-studio-danger">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {SKYBOX_PRESETS.map((preset) => {
          const selected = preset.id === environment.skyboxId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ skyboxId: preset.id })}
              title={preset.label}
              className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${
                selected
                  ? 'border-studio-accent ring-1 ring-studio-accent/60'
                  : 'border-studio-border hover:border-studio-muted'
              }`}
            >
              {preset.preview ? (
                <img
                  src={`${assetBase}${preset.preview}`}
                  alt={preset.label}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="w-full h-full block bg-studio-card" />
              )}
              <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-studio-overlay/60 text-[9px] font-mono text-studio-text truncate">
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 pt-1">
        <SliderRow
          label="Exposure"
          value={environment.exposure}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(exposure) => onChange({ exposure })}
        />
        <SliderRow
          label="Sun Azimuth"
          value={environment.sunAzimuth}
          min={0}
          max={360}
          step={1}
          suffix=" deg"
          onChange={(sunAzimuth) => onChange({ sunAzimuth })}
        />
        <SliderRow
          label="Sun Elevation"
          value={environment.sunElevation}
          min={-10}
          max={90}
          step={1}
          suffix=" deg"
          onChange={(sunElevation) => onChange({ sunElevation })}
        />
        <SliderRow
          label="Ambient"
          value={environment.ambientIntensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(ambientIntensity) => onChange({ ambientIntensity })}
        />
      </div>

      <div className="pt-1 border-t border-studio-border space-y-2">
        <label className="flex items-center justify-between text-[11px] font-mono text-studio-muted">
          <span className="flex items-center gap-1.5">
            <Wind className="w-3 h-3" />
            <span>Fog</span>
          </span>
          <input
            type="checkbox"
            checked={environment.fogEnabled}
            onChange={(e) => onChange({ fogEnabled: e.target.checked })}
            className="accent-studio-accent cursor-pointer"
          />
        </label>
        {environment.fogEnabled && (
          <SliderRow
            label="Fog Density"
            value={environment.fogDensity}
            min={0}
            max={0.05}
            step={0.001}
            onChange={(fogDensity) => onChange({ fogDensity })}
          />
        )}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-studio-muted">
          <Sun className="w-3 h-3" />
          <span>Starter skyboxes are CC0 and bundled locally.</span>
        </div>
      </div>
    </div>
  );
};
