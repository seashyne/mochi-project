// Compact presence strip shown inside the Studio toolbar ribbon.

import React from 'react';
import { useI18n } from '@/i18n/context';
import type { TeamCreateApi } from './useTeamCreate';

export interface StudioTeamPresenceProps {
  team: TeamCreateApi;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || 'C').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

export const StudioTeamPresence: React.FC<StudioTeamPresenceProps> = ({ team }) => {
  const { t } = useI18n();
  const labels = t.team;
  const statusLabel = (status: string): string => {
    if (status === 'idle') return labels.statusIdle;
    if (status === 'connecting') return labels.statusConnecting;
    if (status === 'reconnecting') return labels.statusReconnecting;
    if (status === 'closed') return labels.statusOffline;
    return labels.statusLive;
  };
  const people = team.collaborators.slice(0, 4);
  const extra = Math.max(0, team.collaborators.length - people.length);
  return (
    <div
      data-testid="team-presence"
      className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-studio-card border border-studio-border"
    >
      <span
        data-testid="team-status-dot"
        className={`w-2 h-2 rounded-full ${team.isLive ? 'bg-studio-success' : team.status === 'reconnecting' ? 'bg-studio-warning' : 'bg-studio-muted'}`}
      />
      {people.map((person) => (
        <span
          key={person.userId}
          title={`${person.username} - ${person.role}`}
          className="w-5 h-5 rounded-full bg-studio-accent/20 border border-studio-accent/50 text-studio-accent text-[9px] font-bold flex items-center justify-center"
        >
          {initials(person.username)}
        </span>
      ))}
      {extra > 0 && <span className="text-[10px] text-studio-muted">+{extra}</span>}
      <span className="text-[10px] font-semibold text-studio-muted">
        {statusLabel(team.status)}
      </span>
      {team.error && (
        <span data-testid="team-presence-error" className="text-[10px] text-studio-danger" title={team.error}>
          !
        </span>
      )}
    </div>
  );
};
