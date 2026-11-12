// Per-part body color editor with preset swatches and a custom color input

import React from 'react';
import { useI18n } from '../../i18n/context';
import { HumanoidPart, UserAvatarColors } from '../../engine/avatar/avatarBuilder';

const PARTS: HumanoidPart[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

const PRESET_COLORS = [
  '#fcd34d', '#0284c7', '#1e293b', '#ef4444',
  '#10b981', '#8b5cf6', '#f8fafc', '#f472b6'
];

export interface AvatarColorControlsProps {
  colors: UserAvatarColors;
  onChange: (part: HumanoidPart, hexColor: string) => void;
}

// The API accepts 3-digit hex, but input[type=color] only understands #rrggbb
function toInputColor(hex: string): string {
  const value = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  }
  return value.toLowerCase();
}

export const AvatarColorControls: React.FC<AvatarColorControlsProps> = ({ colors, onChange }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-3" data-testid="avatar-color-controls">
      {PARTS.map((part) => {
        const colorKey = `${part}Color` as keyof UserAvatarColors;
        const value = String(colors[colorKey] || '#ffffff');
        const label = t.avatarEditor[part];

        return (
          <div key={part} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{label}</span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{value}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange(part, hex)}
                  aria-label={`${label} ${hex}`}
                  aria-pressed={toInputColor(value) === hex}
                  style={{ backgroundColor: hex }}
                  className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                    toInputColor(value) === hex
                      ? 'border-[#00a2ff] ring-2 ring-[#00a2ff]/40'
                      : 'border-slate-300 dark:border-white/[0.12]'
                  }`}
                />
              ))}
              <input
                type="color"
                value={toInputColor(value)}
                onChange={(event) => onChange(part, event.target.value)}
                aria-label={`${label} ${t.avatarEditor.customColor}`}
                title={t.avatarEditor.customColor}
                className="w-7 h-6 rounded-md cursor-pointer bg-transparent border border-slate-300 dark:border-white/[0.12]"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AvatarColorControls;