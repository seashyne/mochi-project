// Always-mounted Team Create trigger and its drawer. Keeps the panel open state
// out of StudioPage so the editor shell only needs one line of JSX.

import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { useI18n } from '@/i18n/context';
import type { TeamCreateApi } from './useTeamCreate';
import { StudioTeamPanel } from './StudioTeamPanel';

export interface StudioTeamControlsProps {
  team: TeamCreateApi;
}

export const StudioTeamControls: React.FC<StudioTeamControlsProps> = ({ team }) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="team-create-open"
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-4 end-4 z-[70] px-3 py-2 rounded-xl border text-xs font-bold shadow-lg flex items-center gap-2 transition-colors ${team.isLive ? 'bg-studio-success/15 border-studio-success/50 text-studio-success' : 'bg-studio-card border-studio-border text-studio-text hover:border-studio-accent'}`}
      >
        <Users className="w-3.5 h-3.5" />
        {t.team.buttonLabel}
        {team.collaborators.length > 0 && <span className="font-mono">{team.collaborators.length}</span>}
      </button>
      {isOpen && <StudioTeamPanel team={team} onClose={() => setIsOpen(false)} />}
    </>
  );
};
