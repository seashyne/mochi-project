// Generic property grid controls used by the Properties dock. Rows are declared
// as data so services and objects share one renderer.

import React from 'react';
import type { SkyboxPresetId } from '@/engine/environment/environmentTypes';
import { SKYBOX_PRESETS } from '@/engine/environment/skyboxPresets';
import { resolveAssetBase } from '@/config/assets';
import { CodeField, SwatchField } from './propertyExtraFields';

export type PropertyControl =
  | { type: 'number'; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number; suffix?: string }
  | { type: 'slider'; value: number; onChange: (value: number) => void; min: number; max: number; step: number; format?: (value: number) => string }
  | { type: 'toggle'; value: boolean; onChange: (value: boolean) => void }
  | { type: 'color'; value: string; onChange: (value: string) => void }
  | { type: 'swatches'; value: string; onChange: (value: string) => void; presets: string[] }
  | { type: 'select'; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }
  | { type: 'text'; value: string; onChange: (value: string) => void }
  | { type: 'code'; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }
  | { type: 'vector3'; value: { x: number; y: number; z: number }; onChange: (value: { x: number; y: number; z: number }) => void; step?: number }
  | { type: 'skybox'; value: SkyboxPresetId; onChange: (value: SkyboxPresetId) => void }
  | { type: 'readonly'; value: string };

export interface PropertyRowDef {
  key: string;
  label: string;
  control: PropertyControl;
}

export interface PropertyGroupDef {
  title: string;
  rows: PropertyRowDef[];
}

const inputClass =
  'w-full min-w-0 px-1.5 py-[3px] rounded-[3px] bg-studio-bg border border-studio-border text-[11px] font-mono text-studio-text focus:outline-none focus:border-studio-accent';

const AXIS_COLORS = ['text-studio-danger', 'text-studio-success', 'text-studio-info'];

const NumberField: React.FC<{
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}> = ({ value, onChange, step = 0.1, min, max, suffix }) => (
  <div className="flex items-center gap-1">
    <input
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
      step={step}
      min={min}
      max={max}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      className={inputClass}
    />
    {suffix && <span className="text-[10px] font-mono text-studio-muted shrink-0">{suffix}</span>}
  </div>
);

const Vector3Field: React.FC<{
  value: { x: number; y: number; z: number };
  onChange: (value: { x: number; y: number; z: number }) => void;
  step?: number;
}> = ({ value, onChange, step = 0.1 }) => (
  <div className="grid grid-cols-3 gap-1">
    {(['x', 'y', 'z'] as const).map((axis, index) => (
      <div key={axis} className="flex items-center gap-0.5">
        <span className={`text-[9px] font-bold font-mono ${AXIS_COLORS[index]}`}>
          {axis.toUpperCase()}
        </span>
        <input
          type="number"
          value={Math.round(value[axis] * 1000) / 1000}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange({ ...value, [axis]: next });
          }}
          className={inputClass}
        />
      </div>
    ))}
  </div>
);

const SkyboxField: React.FC<{ value: SkyboxPresetId; onChange: (value: SkyboxPresetId) => void }> = ({
  value,
  onChange
}) => {
  const assetBase = resolveAssetBase();
  return (
    <div className="grid grid-cols-4 gap-1">
      {SKYBOX_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange(preset.id)}
          title={preset.label}
          className={`relative aspect-square rounded-[3px] overflow-hidden border transition-colors ${
            preset.id === value
              ? 'border-studio-accent ring-1 ring-studio-accent/50'
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
            <span className="block w-full h-full bg-studio-card" />
          )}
        </button>
      ))}
    </div>
  );
};

export const PropertyControlView: React.FC<{ control: PropertyControl }> = ({ control }) => {
  switch (control.type) {
    case 'number':
      return (
        <NumberField
          value={control.value}
          onChange={control.onChange}
          step={control.step}
          min={control.min}
          max={control.max}
          suffix={control.suffix}
        />
      );
    case 'slider':
      return (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value}
            onChange={(event) => control.onChange(Number(event.target.value))}
            className="w-full h-1 accent-studio-accent cursor-pointer"
          />
          <span className="text-[10px] font-mono text-studio-text w-12 text-end shrink-0">
            {control.format ? control.format(control.value) : control.value.toFixed(2)}
          </span>
        </div>
      );
    case 'toggle':
      return (
        <button
          type="button"
          onClick={() => control.onChange(!control.value)}
          className={`w-7 h-3.5 rounded-full border transition-colors relative ${
            control.value
              ? 'bg-studio-accent/70 border-studio-accent'
              : 'bg-studio-bg border-studio-border'
          }`}
          role="switch"
          aria-checked={control.value}
        >
          <span
            className={`absolute top-[1px] w-2.5 h-2.5 rounded-full bg-studio-text transition-all ${
              control.value ? 'left-[14px]' : 'left-[2px]'
            }`}
          />
        </button>
      );
    case 'color':
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={control.value}
            onChange={(event) => control.onChange(event.target.value)}
            className="w-6 h-4 rounded-[3px] bg-transparent border border-studio-border cursor-pointer p-0"
          />
          <span className="text-[10px] font-mono text-studio-muted uppercase">{control.value}</span>
        </div>
      );
    case 'select':
      return (
        <select
          value={control.value}
          onChange={(event) => control.onChange(event.target.value)}
          className={inputClass}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'text':
      return (
        <input
          value={control.value}
          onChange={(event) => control.onChange(event.target.value)}
          className={inputClass}
        />
      );
    case 'swatches':
      return <SwatchField value={control.value} onChange={control.onChange} presets={control.presets} />;
    case 'code':
      return (
        <CodeField
          value={control.value}
          onChange={control.onChange}
          rows={control.rows}
          placeholder={control.placeholder}
        />
      );
    case 'vector3':
      return <Vector3Field value={control.value} onChange={control.onChange} step={control.step} />;
    case 'skybox':
      return <SkyboxField value={control.value} onChange={control.onChange} />;
    case 'readonly':
    default:
      return <span className="text-[11px] font-mono text-studio-muted truncate">{control.value}</span>;
  }
};

export const PropertyGroupsView: React.FC<{ groups: PropertyGroupDef[]; filter?: string }> = ({
  groups,
  filter = ''
}) => {
  const needle = filter.trim().toLowerCase();
  return (
    <div className="divide-y divide-studio-border/50">
      {groups.map((group) => {
        const rows = needle
          ? group.rows.filter((row) => row.label.toLowerCase().includes(needle))
          : group.rows;
        if (rows.length === 0) return null;
        return (
          <div key={group.title} className="py-1">
            <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-studio-muted/80 bg-studio-bg/40">
              {group.title}
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center gap-2 px-2 py-[3px] hover:bg-studio-card/40"
              >
                <span className="w-[42%] shrink-0 text-[11px] text-studio-muted truncate" title={row.label}>
                  {row.label}
                </span>
                <div className="flex-1 min-w-0">
                  <PropertyControlView control={row.control} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
