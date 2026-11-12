// Extra property controls that need more markup than a one-line input: the
// colour swatch palette and the inline Lua editor. Split out of
// propertyControls.tsx so both files stay small.

import React from 'react';

export const SwatchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  presets: string[];
}> = ({ value, onChange, presets }) => (
  <div className="flex items-center gap-1 flex-wrap">
    {presets.map((preset) => (
      <button
        key={preset}
        type="button"
        onClick={() => onChange(preset)}
        title={preset}
        aria-label={`Use colour ${preset}`}
        aria-pressed={value.toLowerCase() === preset.toLowerCase()}
        className={`w-4 h-4 rounded-full border transition-transform ${
          value.toLowerCase() === preset.toLowerCase()
            ? 'scale-125 border-studio-text ring-1 ring-studio-accent'
            : 'border-studio-border hover:scale-110'
        }`}
        style={{ backgroundColor: preset }}
      />
    ))}
    <input
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Custom colour"
      className="w-5 h-4 rounded-[3px] bg-transparent border border-studio-border cursor-pointer p-0"
    />
  </div>
);

export const CodeField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}> = ({ value, onChange, rows = 3, placeholder }) => (
  <textarea
    rows={rows}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    spellCheck={false}
    className="w-full px-1.5 py-1 rounded-[3px] resize-y leading-relaxed bg-studio-bg border border-studio-border text-[11px] font-mono text-studio-text placeholder:text-studio-muted/60 focus:outline-none focus:border-studio-accent"
  />
);
