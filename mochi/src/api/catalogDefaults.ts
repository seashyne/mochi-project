// Default Initial Games and Published Catalog Merger for Mochi Platform

import { GameSummary } from './types';

export const INITIAL_GAMES: GameSummary[] = [
  {
    id: 'game_obby_01',
    slug: 'neon-sky-obby',
    title: 'Neon Sky Obby',
    description: 'High-altitude 3D parkour course with moving platforms, jump pads, and races.',
    creatorId: 'usr_admin_master_001',
    thumbnailUrl: null,
    status: 'published',
    playCount: 1420,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    currentVersion: 'v1.2.0'
  },
  {
    id: 'game_tycoon_02',
    slug: 'starforge-tycoon',
    title: 'Starforge Tycoon',
    description: 'Build modular orbital stations, harvest asteroids, and trade resources.',
    creatorId: 'usr_test_player_002',
    thumbnailUrl: null,
    status: 'published',
    playCount: 980,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    currentVersion: 'v1.0.4'
  },
  {
    id: 'game_arena_03',
    slug: 'cyber-drift-arena',
    title: 'Cyber Drift 3D',
    description: 'Physics-driven vehicle arena with custom impulse boosters and matchmaking.',
    creatorId: 'usr_admin_master_001',
    thumbnailUrl: null,
    status: 'published',
    playCount: 2150,
    createdAt: '2026-11-07T00:00:00.000Z',
    updatedAt: '2026-11-07T00:00:00.000Z',
    currentVersion: 'v1.1.0'
  }
];

// Merges live published cloud games ahead of fallback starter worlds without duplicates
export function mergePublishedCatalog(liveGames: GameSummary[]): GameSummary[] {
  const published = liveGames.filter((g) => !g.status || g.status === 'published');
  if (published.length === 0) return INITIAL_GAMES;
  const seenIds = new Set(published.map((g) => g.id));
  const seenSlugs = new Set(published.map((g) => g.slug));
  const extras = INITIAL_GAMES.filter(
    (item) => !seenIds.has(item.id) && !seenSlugs.has(item.slug)
  );
  return [...published, ...extras];
}
