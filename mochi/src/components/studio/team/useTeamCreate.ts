// Single entry point for Studio: combines the REST team state with the live
// document sync so pages only need one hook.

import type { TeamRole } from '@/api/studioTeam';
import { useTeamRoom, TeamRoomApi } from './useTeamRoom';
import { useTeamSync, TeamSyncApi, TeamSyncOptions } from './useTeamSync';

export interface TeamCreateApi extends TeamRoomApi, TeamSyncApi {
  syncError: string | null;
  isLive: boolean;
  isOwner: boolean;
  isEnabled: boolean;
  role: TeamRole | null;
}

export function useTeamCreate(options: Omit<TeamSyncOptions, 'enabled'>): TeamCreateApi {
  const room = useTeamRoom(options.draftId, options.token);
  const enabled = Boolean(room.team?.enabled);
  const sync = useTeamSync({ ...options, enabled });
  return {
    ...room,
    ...sync,
    error: room.error || sync.error,
    syncError: sync.error,
    isLive: enabled && sync.status === 'live',
    isOwner: room.team?.role === 'owner',
    isEnabled: enabled,
    role: room.team?.role ?? null
  };
}
