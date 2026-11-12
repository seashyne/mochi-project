// In-memory D1 stand-in for studio project draft tests

import { createMockDb } from './mockDb';

export interface StudioDraftRow {
  id: string;
  creator_id: string;
  game_id: string | null;
  title: string;
  description: string | null;
  slug: string | null;
  manifest_json: string;
  manifest_key: string | null;
  manifest_hash: string | null;
  manifest_size: number | null;
  version_number: string;
  is_autosave: number;
  created_at: string;
  updated_at: string;
}

export interface DraftMockDb extends D1Database {
  /** Exposed so Team Create mocks can resolve shared-draft joins. */
  __drafts: Map<string, StudioDraftRow>;
}

export function createDraftMockDb(): DraftMockDb {
  const base = createMockDb();
  const drafts = new Map<string, StudioDraftRow>();
  const originalPrepare = base.prepare.bind(base);

  base.prepare = (query: string) => {
    const q = query.trim();
    if (q.includes('studio_project_drafts')) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          bound = params;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const res = await stmt.all<T>();
          return res.results && res.results.length > 0 ? res.results[0] : null;
        },
        async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
          if (q.includes('WHERE id = ?')) {
            const id = String(bound[0]);
            const row = drafts.get(id);
            return {
              results: (row ? [row] : []) as unknown as T[],
              success: true,
              meta: {} as D1Result<T>['meta']
            };
          }
          if (q.includes('WHERE creator_id = ?')) {
            const creatorId = String(bound[0]);
            const list = Array.from(drafts.values()).filter((d) => d.creator_id === creatorId);
            list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
            return {
              results: list as unknown as T[],
              success: true,
              meta: {} as D1Result<T>['meta']
            };
          }
          return { results: [] as unknown as T[], success: true, meta: {} as D1Result<T>['meta'] };
        },
        async run(): Promise<D1Result<unknown>> {
          if (q.startsWith('INSERT INTO studio_project_drafts')) {
            const [
              id, creator_id, game_id, title, description, slug, manifest_json,
              manifest_key, manifest_hash, manifest_size, version_number, is_autosave,
              created_at, updated_at
            ] = bound;
            const existing = drafts.get(String(id));
            const row: StudioDraftRow = {
              id: String(id),
              creator_id: String(creator_id),
              game_id: game_id ? String(game_id) : null,
              title: String(title),
              description: description ? String(description) : null,
              slug: slug ? String(slug) : null,
              manifest_json: String(manifest_json),
              manifest_key: manifest_key ? String(manifest_key) : null,
              manifest_hash: manifest_hash ? String(manifest_hash) : null,
              manifest_size: manifest_size === null || manifest_size === undefined ? null : Number(manifest_size),
              version_number: String(version_number),
              is_autosave: Number(is_autosave),
              created_at: existing ? existing.created_at : String(created_at),
              updated_at: String(updated_at)
            };
            drafts.set(String(id), row);
            return { results: [], success: true, meta: { changes: 1 } as D1Result<unknown>['meta'] };
          }
          if (q.startsWith('DELETE FROM studio_project_drafts')) {
            const [id, creator_id] = bound;
            const existing = drafts.get(String(id));
            if (existing && existing.creator_id === String(creator_id)) {
              drafts.delete(String(id));
              return { results: [], success: true, meta: { changes: 1 } as D1Result<unknown>['meta'] };
            }
            return { results: [], success: true, meta: { changes: 0 } as D1Result<unknown>['meta'] };
          }
          return { results: [], success: true, meta: { changes: 0 } as D1Result<unknown>['meta'] };
        }
      };
      return stmt as unknown as D1PreparedStatement;
    }
    return originalPrepare(query);
  };

  const db = base as DraftMockDb;
  db.__drafts = drafts;
  return db;
}
