// REST side of Team Create: session state, invites, role changes and removal.
// The live socket consumes `team.enabled` and never duplicates this state.

import { useCallback, useEffect, useState } from 'react';
import { InviteRole, studioTeamApi, TeamState } from '@/api/studioTeam';

export interface TeamRoomApi {
  team: TeamState | null;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  invite: (username: string, role: InviteRole) => Promise<void>;
  setRole: (userId: string, role: InviteRole) => Promise<void>;
  remove: (userId: string) => Promise<void>;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Team Create request failed';
}

export function useTeamRoom(draftId: string | null, token: string | null): TeamRoomApi {
  const [team, setTeam] = useState<TeamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!draftId || !token) {
      setTeam(null);
      return;
    }
    try {
      const result = await studioTeamApi.getTeam(draftId, token);
      setTeam(result.team);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
      setTeam(null);
    }
  }, [draftId, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (action: () => Promise<unknown>) => {
    if (!draftId || !token) return;
    setBusy(true);
    try {
      await action();
      setError(null);
      const result = await studioTeamApi.getTeam(draftId, token);
      setTeam(result.team);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [draftId, token]);

  const setEnabled = useCallback((enabled: boolean) => (
    mutate(() => studioTeamApi.setEnabled(draftId || '', enabled, token || undefined))
  ), [mutate, draftId, token]);

  const invite = useCallback((username: string, role: InviteRole) => (
    mutate(() => studioTeamApi.invite(draftId || '', { username }, role, token || undefined))
  ), [mutate, draftId, token]);

  const setRole = useCallback((userId: string, role: InviteRole) => (
    mutate(() => studioTeamApi.setRole(draftId || '', userId, role, token || undefined))
  ), [mutate, draftId, token]);

  const remove = useCallback((userId: string) => (
    mutate(() => studioTeamApi.remove(draftId || '', userId, token || undefined))
  ), [mutate, draftId, token]);

  return { team, error, busy, refresh, setEnabled, invite, setRole, remove };
}
