// Language registry: the one place a locale is declared.
//
// Adding a language is one entry in LANGUAGE_CODES plus a catalog module. No
// other file carries a hardcoded language union, a `toHaveLength(4)` assertion,
// or a per-language Intl tag map - those all read from here.
//
// Catalogs are tiered on purpose. Bundled locales ship in the main chunk because
// they are the ones worth paying for on first paint; every further locale goes
// through LAZY_LOADERS and costs nothing until it is selected. At four locales
// the difference is small, at thirty-two it is the difference between a 25 KB
// and a 900 KB first load.

import type { TranslationDictionary } from './types';
import { en } from './locales/en';
import { id } from './locales/id';
import { th } from './locales/th';
import { ja } from './locales/ja';
import { zh } from './locales/zh';

export const LANGUAGE_CODES = ['th', 'en', 'ja', 'zh', 'id'] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

export interface LanguageMeta {
  code: Language;
  label: string;
  englishLabel: string;
  shortCode: string;
  /** BCP-47 tag handed to Intl.DateTimeFormat / NumberFormat / Collator. */
  localeTag: string;
  /** Right-to-left script: drives the `dir` attribute and logical CSS. */
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'th', label: 'ไทย', englishLabel: 'Thai', shortCode: 'TH', localeTag: 'th-TH' },
  { code: 'en', label: 'English', englishLabel: 'English', shortCode: 'EN', localeTag: 'en-US' },
  { code: 'ja', label: '日本語', englishLabel: 'Japanese', shortCode: 'JA', localeTag: 'ja-JP' },
  { code: 'zh', label: '简体中文', englishLabel: 'Simplified Chinese', shortCode: 'ZH', localeTag: 'zh-CN' },
  { code: 'id', label: 'Bahasa Indonesia', englishLabel: 'Indonesian', shortCode: 'ID', localeTag: 'id-ID' }
];

export const DEFAULT_LANGUAGE: Language = 'th';

const META_BY_CODE = new Map<string, LanguageMeta>(SUPPORTED_LANGUAGES.map((meta) => [meta.code, meta]));

export function languageMeta(code: Language): LanguageMeta {
  return META_BY_CODE.get(code) ?? SUPPORTED_LANGUAGES[0];
}

/** Catalogs that ship in the main chunk. Sparse on purpose: a locale that is
 *  translated at build time lives in LAZY_LOADERS instead and must not appear
 *  here, or it would be paid for by every visitor. */
export const bundledCatalogs: Partial<Record<Language, TranslationDictionary>> = { th, en, ja, zh, id };

const FALLBACK = th;

// Machine-translated or hand-dropped catalogs are registered here and nowhere
// else. A loader must resolve to a full TranslationDictionary; a partial one is
// a compile error, which is the point.
// Empty until the first translated locale lands. A generated catalog is added
// here as `vi: () => import('./catalogs/vi').then((m) => m.vi)` - the script
// prints that exact line after it writes the files.
const LAZY_LOADERS: Partial<Record<Language, () => Promise<TranslationDictionary>>> = {};

const cache = new Map<Language, TranslationDictionary>(
  Object.entries(bundledCatalogs) as [Language, TranslationDictionary][]
);

/** Synchronous read of the bundled tier, with the default catalog as fallback.
 *  Use this instead of indexing bundledCatalogs: a lazy locale is absent there. */
export function bundledCatalog(code: Language): TranslationDictionary {
  return cache.get(code) ?? FALLBACK;
}

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return typeof value === 'string' && META_BY_CODE.has(value);
}

/**
 * Picks the startup language: an explicit override, then the stored preference,
 * then the first supported entry in the browser's language list, then the default.
 * Matching is by primary subtag, so `pt-BR` selects `pt` when `pt` exists.
 */
export function resolveInitialLanguage(explicit?: string | null, stored?: string | null): Language {
  if (isSupportedLanguage(explicit)) return explicit;
  if (isSupportedLanguage(stored)) return stored;

  const preferred =
    typeof navigator !== 'undefined'
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : [];

  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isSupportedLanguage(primary)) return primary;
  }

  return DEFAULT_LANGUAGE;
}

/** Resolves one catalog, loading it on first use. Never rejects: a failed load
 *  degrades to the default catalog rather than an empty UI. */
export async function loadCatalog(code: Language): Promise<TranslationDictionary> {
  const hit = cache.get(code);
  if (hit) return hit;

  const loader = LAZY_LOADERS[code];
  if (!loader) return FALLBACK;

  try {
    const catalog = await loader();
    cache.set(code, catalog);
    return catalog;
  } catch {
    return FALLBACK;
  }
}

/** Every declared catalog, bundled and lazy alike. This is what the parity test
 *  iterates: a locale that only ships as a chunk must still be checked. */
export async function loadAllCatalogs(): Promise<Record<Language, TranslationDictionary>> {
  const entries = await Promise.all(
    LANGUAGE_CODES.map(async (code) => [code, await loadCatalog(code)] as const)
  );
  return Object.fromEntries(entries) as Record<Language, TranslationDictionary>;
}

/** True when a loader is registered, bundled or lazy. */
export function hasCatalog(code: Language): boolean {
  return bundledCatalogs[code] !== undefined || LAZY_LOADERS[code] !== undefined;
}

/** True when the catalog ships in the main chunk, so no load is needed. */
export function isBundled(code: Language): boolean {
  return bundledCatalogs[code] !== undefined;
}
