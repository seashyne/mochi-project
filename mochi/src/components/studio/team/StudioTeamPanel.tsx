// Team Create management drawer: session switch, invitations, roles, live
// presence, object locks and a manual save for the shared draft.

import React, { useState } from 'react';
import { X, Users, Save, RefreshCw, UserPlus, Lock, Radio } from 'lucide-react';
import type { InviteRole } from '@/api/studioTeam';
import { useI18n } from '@/i18n/context';
import type { TeamCreateApi } from './useTeamCreate';

export interface StudioTeamPanelProps {
  team: TeamCreateApi;
  onClose: () => void;
}

export const StudioTeamPanel: React.FC<StudioTeamPanelProps> = ({ team, onClose }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const members = team.team?.members || [];
  const lockedCount = Object.values(team.locks).reduce((sum, entry) => sum + entry.ids.length, 0);
  const labels = t.team;

  const statusLabel = (status: string): string => {
    if (status === 'idle') return labels.statusIdle;
    if (status === 'connecting') return labels.statusConnecting;
    if (status === 'reconnecting') return labels.statusReconnecting;
    if (status === 'closed') return labels.statusOffline;
    return labels.statusLive;
  };

  const roleLabel = (value: string): string => {
    if (value === 'owner') return labels.ownerLabel;
    if (value === 'viewer') return labels.roleViewer;
    return labels.roleEditor;
  };

  const handleInvite = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = username.trim();
    if (!clean || team.busy) return;
    void team.invite(clean, role).then(() => setUsername(''));
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-studio-overlay/60" data-testid="team-panel-overlay">
      <div className="w-full max-w-sm h-full bg-studio-panel border-l border-studio-border shadow-2xl flex flex-col text-studio-text">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-studio-border bg-studio-ribbon">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-studio-accent" />
            <div>
              <h2 className="text-sm font-bold">{labels.panelTitle}</h2>
              <p className="text-[10px] text-studio-muted">{labels.panelSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closePanel}
            data-testid="team-panel-close"
            className="p-1.5 rounded-lg text-studio-muted hover:text-studio-text hover:bg-studio-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section data-testid="team-session-section" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">{labels.sessionTitle}</h3>
                <p className="text-[11px] text-studio-muted mt-0.5">
                  {team.isEnabled ? labels.sessionSharedOn : labels.sessionSharedOff}
                </p>
              </div>
              <span
                data-testid="team-connection-status"
                className={`text-[10px] font-semibold px-2 py-1 rounded border ${team.isLive ? 'text-studio-success border-studio-success/40 bg-studio-success/10' : 'text-studio-muted border-studio-border'}`}
              >
                {statusLabel(team.isLive ? 'live' : team.status).toUpperCase()}
              </span>
            </div>
            {team.isOwner && (
              <button
                type="button"
                data-testid="team-toggle"
                disabled={team.busy}
                onClick={() => void team.setEnabled(!team.isEnabled)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${team.isEnabled ? 'bg-studio-success/10 border-studio-success/40 text-studio-success' : 'bg-studio-card border-studio-border text-studio-text hover:border-studio-accent'}`}
              >
                {team.isEnabled ? labels.pauseTeam : labels.enableTeam}
              </button>
            )}
            {!team.isOwner && team.role && (
              <p className="text-[11px] text-studio-muted">{labels.yourRole}: {roleLabel(team.role)}</p>
            )}
          </section>

          {team.isOwner && (
            <section data-testid="team-invite-section" className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider">{labels.inviteTitle}</h3>
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={labels.usernamePlaceholder}
                  aria-label={labels.usernameLabel}
                  data-testid="team-invite-input"
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-studio-card border border-studio-border text-xs text-studio-text placeholder-studio-muted focus:outline-none focus:border-studio-accent"
                />
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as InviteRole)}
                  aria-label={labels.inviteRoleLabel}
                  data-testid="team-invite-role"
                  className="px-2 py-2 rounded-lg bg-studio-card border border-studio-border text-xs text-studio-text"
                >
                  <option value="editor">{labels.roleEditor}</option>
                  <option value="viewer">{labels.roleViewer}</option>
                </select>
                <button
                  type="submit"
                  disabled={team.busy || !username.trim()}
                  data-testid="team-invite-submit"
                  className="px-2.5 py-2 rounded-lg bg-studio-accent text-studio-on-accent disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {labels.inviteBtn}
                </button>
              </form>
            </section>
          )}

          <section data-testid="team-members-section" className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {labels.membersTitle} ({members.length + 1})
            </h3>
            <div className="rounded-xl bg-studio-card border border-studio-border px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold">{labels.ownerLabel}</span>
              <span className="text-[10px] text-studio-muted">{labels.ownerAccess}</span>
            </div>
            {members.length === 0 && (
              <p className="text-[11px] text-studio-muted" data-testid="team-members-empty">
                {labels.membersEmpty}
              </p>
            )}
            {members.map((member) => (
              <div
                key={member.userId}
                data-testid={`team-member-${member.userId}`}
                className="rounded-xl bg-studio-card border border-studio-border px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-semibold truncate">{member.username}</span>
                {team.isOwner ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={member.role}
                      aria-label={`${labels.roleFor} ${member.username}`}
                      onChange={(event) => void team.setRole(member.userId, event.target.value as InviteRole)}
                      className="px-1.5 py-1 rounded bg-studio-panel border border-studio-border text-[10px] text-studio-text"
                    >
                      <option value="editor">{labels.roleEditor}</option>
                      <option value="viewer">{labels.roleViewer}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void team.remove(member.userId)}
                      aria-label={`${labels.removeLabel} ${member.username}`}
                      className="px-1.5 py-1 rounded text-[10px] text-studio-danger hover:bg-studio-danger/10"
                    >
                      {labels.removeLabel}
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-studio-muted">{roleLabel(member.role)}</span>
                )}
              </div>
            ))}
          </section>

          <section data-testid="team-live-section" className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {labels.liveTitle} ({team.collaborators.length})
            </h3>
            {team.collaborators.length === 0 && (
              <p className="text-[11px] text-studio-muted">{labels.liveEmpty}</p>
            )}
            {team.collaborators.map((person) => (
              <div key={person.userId} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3 text-studio-success" />
                  {person.username}
                </span>
                <span className="text-[10px] text-studio-muted">
                  {roleLabel(person.role)}
                  {team.awareness[person.userId]?.selectedIds.length
                    ? ` - ${team.awareness[person.userId].selectedIds.length} ${labels.selected}`
                    : ''}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-studio-muted flex items-center gap-1">
              <Lock className="w-3 h-3" /> {lockedCount} {labels.lockedObjects}
            </p>
          </section>

          {(team.error || team.syncError) && (
            <p data-testid="team-error" className="text-[11px] text-studio-danger">
              {team.error || team.syncError}
            </p>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-studio-border flex gap-2">
          <button
            type="button"
            onClick={team.save}
            disabled={!team.isLive}
            data-testid="team-save"
            className="flex-1 px-3 py-2 rounded-xl bg-studio-card border border-studio-border text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> {labels.saveNow}
          </button>
          <button
            type="button"
            onClick={team.resync}
            disabled={!team.isLive}
            data-testid="team-resync"
            className="px-3 py-2 rounded-xl bg-studio-card border border-studio-border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {labels.resync}
          </button>
        </footer>
      </div>
    </div>
  );
};
