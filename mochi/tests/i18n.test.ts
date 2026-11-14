// Unit tests verifying multi-language internationalization (i18n) system

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CODES,
  TranslationDictionary
} from '../src/i18n/types';
import { bundledCatalog, hasCatalog, loadAllCatalogs } from '../src/i18n/registry';
import { en } from '../src/i18n/locales/en';

describe('Multi-Language i18n Architecture', () => {
  const EMOJI_REGEX =
    /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;

  it('declares a supported language list with valid metadata and unique shortcodes', () => {
    // The count is the registry's, not a magic number: adding a locale must not
    // require editing this assertion.
    expect(SUPPORTED_LANGUAGES).toHaveLength(LANGUAGE_CODES.length);

    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual([...LANGUAGE_CODES]);

    const shortCodes = SUPPORTED_LANGUAGES.map((l) => l.shortCode);
    expect(new Set(shortCodes).size).toBe(shortCodes.length);

    SUPPORTED_LANGUAGES.forEach((item) => {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.englishLabel.length).toBeGreaterThan(0);
      expect(item.localeTag.length).toBeGreaterThan(0);
    });
  });

  it('resolves a catalog for every declared language, bundled or lazy', async () => {
    const all = await loadAllCatalogs();
    for (const code of LANGUAGE_CODES) {
      expect(hasCatalog(code), `${code} has neither a bundled catalog nor a loader`).toBe(true);
      expect(all[code]).toBeDefined();
    }
  });

  it('guarantees 100% structural key parity across every declared locale', async () => {
    const locales = await loadAllCatalogs();
    const referenceDomains = Object.keys(en).sort() as (keyof TranslationDictionary)[];

    expect(referenceDomains).toEqual([
      'admin',
      'animation',
      'auth',
      'avatarEditor',
      'catalog',
      'dashboard',
      'footer',
      'install',
      'landing',
      'legal',
      'nav',
      'pages',
      'player',
      'profile',
      'studio',
      'team'
    ]);

    for (const [langCode, dict] of Object.entries(locales)) {
      const domains = Object.keys(dict).sort() as (keyof TranslationDictionary)[];
      expect(domains, `Locale ${langCode} has domain mismatch`).toEqual(referenceDomains);

      for (const domain of referenceDomains) {
        const refKeys = Object.keys(en[domain]).sort();
        const dictKeys = Object.keys(dict[domain]).sort();
        expect(dictKeys, `Locale ${langCode} domain ${domain} missing or extra keys`).toEqual(refKeys);
      }
    }
  });

  it('guarantees all dictionary values are non-empty strings with zero undefined values', async () => {
    const locales = await loadAllCatalogs();

    for (const [langCode, dict] of Object.entries(locales)) {
      for (const [domain, subDict] of Object.entries(dict)) {
        for (const [key, val] of Object.entries(subDict as Record<string, string>)) {
          expect(
            typeof val,
            `Expected ${langCode}.${domain}.${key} to be a string`
          ).toBe('string');
          expect(
            val.trim().length,
            `Expected ${langCode}.${domain}.${key} not to be empty`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('verifies zero emojis across every translation dictionary', async () => {
    const locales = await loadAllCatalogs();
    const emojiViolations: string[] = [];

    for (const [langCode, dict] of Object.entries(locales)) {
      for (const [domain, subDict] of Object.entries(dict)) {
        for (const [key, val] of Object.entries(subDict as Record<string, string>)) {
          if (EMOJI_REGEX.test(val)) {
            emojiViolations.push(`${langCode}.${domain}.${key}: "${val}"`);
          }
        }
      }
    }

    expect(emojiViolations).toEqual([]);
  });

  it('verifies authentic localized text across different languages', () => {
    expect(bundledCatalog('th').nav.home).toBe('หน้าหลัก');
    expect(bundledCatalog('en').nav.home).toBe('Home');
    expect(bundledCatalog('ja').nav.home).toBe('ホーム');
    expect(bundledCatalog('zh').nav.home).toBe('首页');

    for (const code of LANGUAGE_CODES) {
      if (code === 'en') continue;
      expect(bundledCatalog(code).catalog.title, `${code} catalog title is untranslated`).not.toEqual(
        bundledCatalog('en').catalog.title
      );
    }
  });
});
