// Shared game card helpers: cover art fallback, category matching, and compact player telemetry

import { GameSummary } from '../../api/types';
import type { PagesTranslations } from '../../i18n/pagesTypes';

export type WorldCategory = 'All' | 'Featured' | 'Parkour' | 'Tycoon' | 'Arena';
export type CoreWorldCategory = Exclude<WorldCategory, 'All' | 'Featured'>;

const CATEGORY_THUMBS = [
  '/landing/thumb-obby.jpg',
  '/landing/thumb-tycoon.jpg',
  '/landing/thumb-arena.jpg'
] as const;

export function inferWorldCategory(game: GameSummary): CoreWorldCategory {
  const haystack = `${game.genre || ''} ${game.slug} ${game.title} ${game.description || ''}`.toLowerCase();
  if (haystack.includes('obby') || haystack.includes('parkour')) return 'Parkour';
  if (haystack.includes('tycoon') || haystack.includes('star') || haystack.includes('station')) return 'Tycoon';
  return 'Arena';
}

export function resolveGameThumbnail(game: GameSummary, index = 0): string {
  if (game.thumbnailUrl) return game.thumbnailUrl;
  const cat = inferWorldCategory(game);
  if (cat === 'Parkour') return '/landing/thumb-obby.jpg';
  if (cat === 'Tycoon') return '/landing/thumb-tycoon.jpg';
  if (cat === 'Arena') return '/landing/thumb-arena.jpg';
  return CATEGORY_THUMBS[index % CATEGORY_THUMBS.length];
}

export function formatCompactCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function getCategoryLabel(category: WorldCategory, pages: PagesTranslations): string {
  switch (category) {
    case 'Featured':
      return pages.categoryFeatured;
    case 'Parkour':
      return pages.categoryParkour;
    case 'Tycoon':
      return pages.categoryTycoon;
    case 'Arena':
      return pages.categoryArena;
    case 'All':
    default:
      return pages.categoryAll;
  }
}
