// Role resolution for a Team Create session. Kept separate from the Durable
// Object so both the WebSocket route and the DO use exactly the same policy:
// the draft creator (or an admin) is owner, everyone else needs a grant row.

import { MochiEnv } from '../types/env';
import { CollaboratorPresence } from './draftCollabCore';
import { findCollaborator } from '../services/studioCollabDb';
import { loadDraftForCollab } from '../services/draftPersistence';

export type TeamRole = CollaboratorPresence['role'];

export interface ResolvedDraftAccess {
  role: TeamRole;
  title: string;
  versionNumber: string;
}

export async function resolveDraftAccess(
  env: MochiEnv,
  draftId: string,
  userId: string,
  userRole: string
): Promise<ResolvedDraftAccess | null> {
  const draft = await loadDraftForCollab(env, draftId);
  if (!draft) return null;
  const meta = { title: draft.title, versionNumber: draft.versionNumber };
  if (draft.creatorId === userId || userRole === 'admin') {
    return { role: 'owner', ...meta };
  }
  const granted = await findCollaborator(env.DB, draftId, userId);
  if (!granted) return null;
  return { role: granted === 'viewer' ? 'viewer' : 'editor', ...meta };
}
