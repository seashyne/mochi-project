// In-memory D1 stand-in for the Team Create collaborator/session tables.
// Draft rows and user rows still flow through the existing mocks; this layer
// only intercepts the SQL introduced by the Team Create migration.

import { createDraftMockDb, DraftMockDb } from './mockDraftDb';

interface CollaboratorRow {
  map_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

interface SessionRow {
  map_id: string;
  owner_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMockDb extends DraftMockDb {
  __collaborators: Map<string, CollaboratorRow>;
  __sessions: Map<string, SessionRow>;
}

const rowKey = (mapId: string, userId: string) => `${mapId}:${userId}`;

export function createTeamMockDb(): TeamMockDb {
  const base = createDraftMockDb();
  const collaborators = new Map<string, CollaboratorRow>();
  const sessions = new Map<string, SessionRow>();
  const draftPrepare = base.prepare.bind(base);

  async function usernameOf(userId: string): Promise<string> {
    const row = await draftPrepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first<{ username: string }>();
    return row?.username || 'Creator';
  }

  base.prepare = (query: string) => {
    const q = query.trim();
    const isCollabQuery =
      q.includes('studio_collaborators') || q.includes('studio_collab_sessions');
    if (!isCollabQuery) return draftPrepare(query);

    let bound: unknown[] = [];
    const stmt = {
      bind(...params: unknown[]) {
        bound = params;
        return stmt;
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        let rows: unknown[] = [];
        if (q.startsWith('SELECT role FROM studio_collaborators')) {
          const row = collaborators.get(rowKey(String(bound[0]), String(bound[1])));
          rows = row ? [{ role: row.role }] : [];
        } else if (q.startsWith('SELECT c.user_id')) {
          const matching = Array.from(collaborators.values())
            .filter((row) => row.map_id === String(bound[0]))
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          rows = await Promise.all(matching.map(async (row) => ({
            user_id: row.user_id,
            username: await usernameOf(row.user_id),
            role: row.role,
            invited_by: row.invited_by,
            created_at: row.created_at
          })));
        } else if (q.startsWith('SELECT * FROM studio_collab_sessions')) {
          const row = sessions.get(String(bound[0]));
          rows = row ? [row] : [];
        } else if (q.startsWith('SELECT d.* FROM studio_project_drafts')) {
          const userId = String(bound[0]);
          const limit = Number(bound[2]) || 50;
          rows = Array.from(base.__drafts.values())
            .filter((draft) =>
              draft.creator_id !== userId && collaborators.has(rowKey(draft.id, userId))
            )
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, limit);
        }
        return {
          results: rows as T[],
          success: true,
          meta: {} as D1Result<T>['meta']
        };
      },
      async first<T = unknown>(): Promise<T | null> {
        const result = await stmt.all<T>();
        return result.results.length > 0 ? result.results[0] : null;
      },
      async run(): Promise<D1Result<unknown>> {
        if (q.startsWith('INSERT INTO studio_collaborators')) {
          const [map_id, user_id, role, invited_by, created_at] = bound;
          const id = rowKey(String(map_id), String(user_id));
          const existing = collaborators.get(id);
          collaborators.set(id, {
            map_id: String(map_id),
            user_id: String(user_id),
            role: String(role),
            invited_by: invited_by ? String(invited_by) : null,
            created_at: existing?.created_at || String(created_at)
          });
        } else if (q.startsWith('DELETE FROM studio_collaborators')) {
          collaborators.delete(rowKey(String(bound[0]), String(bound[1])));
        } else if (q.startsWith('INSERT INTO studio_collab_sessions')) {
          const [map_id, owner_id, enabled, created_at, updated_at] = bound;
          sessions.set(String(map_id), {
            map_id: String(map_id),
            owner_id: String(owner_id),
            enabled: Number(enabled),
            created_at: String(created_at),
            updated_at: String(updated_at)
          });
        }
        return {
          results: [],
          success: true,
          meta: {} as D1Result<unknown>['meta']
        };
      }
    };
    return stmt as unknown as D1PreparedStatement;
  };

  const db = base as TeamMockDb;
  db.__collaborators = collaborators;
  db.__sessions = sessions;
  return db;
}
