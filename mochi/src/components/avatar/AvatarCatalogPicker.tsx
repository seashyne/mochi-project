// Accessory picker grid for equippable hats and shirts from the cloud catalog

import React from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { AccessoryKind, AvatarCatalogItem } from '../../api/types';

export interface AvatarCatalogPickerProps {
  kind: AccessoryKind;
  items: AvatarCatalogItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const AvatarCatalogPicker: React.FC<AvatarCatalogPickerProps> = ({
  kind,
  items,
  selectedId,
  onSelect
}) => {
  const { t } = useI18n();
  const options = items.filter((item) => item.kind === kind);
  const heading = kind === 'hat' ? t.avatarEditor.hats : t.avatarEditor.shirts;

  return (
    <div className="space-y-2" data-testid={`avatar-catalog-${kind}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {heading}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelect('')}
          aria-pressed={selectedId === ''}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left text-[11px] font-semibold transition-colors ${
            selectedId === ''
              ? 'border-[#00a2ff]/50 bg-[#00a2ff]/10 text-[#00a2ff]'
              : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
          }`}
        >
          <span className="w-4 h-4 rounded-md border border-dashed border-slate-400 dark:border-slate-500 shrink-0" />
          <span className="truncate">{t.avatarEditor.none}</span>
          {selectedId === '' && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
        </button>

        {options.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-pressed={isSelected}
              title={item.name}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left text-[11px] font-semibold transition-colors ${
                isSelected
                  ? 'border-[#00a2ff]/50 bg-[#00a2ff]/10 text-[#00a2ff]'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-white/[0.04]'
              }`}
            >
              <span
                className="w-4 h-4 rounded-md border border-slate-300 dark:border-white/[0.15] shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.name}</span>
              {isSelected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AvatarCatalogPicker;