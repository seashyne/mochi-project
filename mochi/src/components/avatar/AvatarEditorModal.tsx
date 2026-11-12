// Avatar editor modal composing the live preview, body colors, and accessory catalog

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Save, Shirt, X } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { UserAvatar } from '../../api/types';
import { resolveAvatarAccessories } from '../../api/avatars';
import {
  DEFAULT_AVATAR_COLORS,
  HumanoidPart,
  UserAvatarColors
} from '../../engine/avatar/avatarBuilder';
import { useAvatarStore } from '../../store/useAvatarStore';
import { AvatarPreviewCanvas } from './AvatarPreviewCanvas';
import { AvatarColorControls } from './AvatarColorControls';
import { AvatarCatalogPicker } from './AvatarCatalogPicker';

export interface AvatarEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function toDraft(avatar: UserAvatar | null): UserAvatarColors {
  return {
    headColor: avatar?.headColor || DEFAULT_AVATAR_COLORS.headColor,
    torsoColor: avatar?.torsoColor || DEFAULT_AVATAR_COLORS.torsoColor,
    leftArmColor: avatar?.leftArmColor || DEFAULT_AVATAR_COLORS.leftArmColor,
    rightArmColor: avatar?.rightArmColor || DEFAULT_AVATAR_COLORS.rightArmColor,
    leftLegColor: avatar?.leftLegColor || DEFAULT_AVATAR_COLORS.leftLegColor,
    rightLegColor: avatar?.rightLegColor || DEFAULT_AVATAR_COLORS.rightLegColor,
    hatId: avatar?.hatId || '',
    shirtId: avatar?.shirtId || ''
  };
}

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const avatar = useAvatarStore((state) => state.avatar);
  const catalog = useAvatarStore((state) => state.catalog);
  const isLoading = useAvatarStore((state) => state.isLoading);
  const isSaving = useAvatarStore((state) => state.isSaving);
  const error = useAvatarStore((state) => state.error);
  const load = useAvatarStore((state) => state.load);
  const save = useAvatarStore((state) => state.save);
  const resetToStarter = useAvatarStore((state) => state.resetToStarter);

  const [draft, setDraft] = useState<UserAvatarColors>(() => toDraft(null));
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setJustSaved(false);
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (isOpen) setDraft(toDraft(avatar));
  }, [isOpen, avatar]);

  const accessories = useMemo(
    () => resolveAvatarAccessories({ hatId: draft.hatId, shirtId: draft.shirtId }, catalog),
    [draft.hatId, draft.shirtId, catalog]
  );

  if (!isOpen) return null;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(toDraft(avatar));

  const handleColorChange = (part: HumanoidPart, hexColor: string) => {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, [`${part}Color`]: hexColor }));
  };

  const handleAccessorySelect = (field: 'hatId' | 'shirtId', id: string) => {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, [field]: id }));
  };

  const handleSave = async () => {
    const succeeded = await save({
      headColor: draft.headColor,
      torsoColor: draft.torsoColor,
      leftArmColor: draft.leftArmColor,
      rightArmColor: draft.rightArmColor,
      leftLegColor: draft.leftLegColor,
      rightLegColor: draft.rightLegColor,
      hatId: draft.hatId || '',
      shirtId: draft.shirtId || ''
    });
    if (succeeded) setJustSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090b10]/85 backdrop-blur-md">
      <div className="mochi-glass-panel rounded-2xl w-full max-w-4xl overflow-hidden shadow-mochi-glass flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-100/70 dark:bg-[#090b10]/45">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#00a2ff]/15 border border-[#00a2ff]/30 flex items-center justify-center text-[#38bdf8] shrink-0">
              <Shirt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                {t.avatarEditor.title}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {t.avatarEditor.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.avatarEditor.close}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-6 overflow-y-auto">
          <div className="space-y-2">
            <div className="relative rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-gradient-to-b from-slate-100 to-slate-200 dark:from-[#1e1e24] dark:to-[#090b10] overflow-hidden">
              <AvatarPreviewCanvas
                colors={draft}
                accessories={accessories}
                className="w-full h-[320px] lg:h-[420px]"
              />
              {isLoading && !avatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#090b10]/60 text-xs text-slate-300 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.avatarEditor.loading}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 font-mono">
              {t.avatarEditor.previewHint}
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t.avatarEditor.bodyColors}
              </div>
              <AvatarColorControls colors={draft} onChange={handleColorChange} />
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t.avatarEditor.accessories}
              </div>
              <AvatarCatalogPicker
                kind="hat"
                items={catalog}
                selectedId={draft.hatId || ''}
                onSelect={(id) => handleAccessorySelect('hatId', id)}
              />
              <AvatarCatalogPicker
                kind="shirt"
                items={catalog}
                selectedId={draft.shirtId || ''}
                onSelect={(id) => handleAccessorySelect('shirtId', id)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-3 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 dark:text-rose-300">
            <span>{t.avatarEditor[error]}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="font-bold underline shrink-0 hover:text-rose-400"
            >
              {t.avatarEditor.retry}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-white/[0.08] bg-slate-100/70 dark:bg-[#090b10]/45">
          <button
            type="button"
            onClick={() => void resetToStarter()}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-white/[0.1] hover:bg-slate-200/60 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.avatarEditor.reset}</span>
          </button>

          <div className="flex items-center gap-3">
            {justSaved && !isDirty && (
              <span className="text-xs font-bold text-emerald-500 dark:text-emerald-400">
                {t.avatarEditor.saved}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !isDirty}
              className="mochi-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSaving ? t.avatarEditor.saving : t.avatarEditor.save}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarEditorModal;