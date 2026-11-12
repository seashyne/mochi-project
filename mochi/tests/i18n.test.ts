// Unit tests verifying multi-language internationalization (i18n) system

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  Language,
  TranslationDictionary
} from '../src/i18n/types';
import { translations } from '../src/i18n/context';
import { th } from '../src/i18n/locales/th';
import { en } from '../src/i18n/locales/en';
import { ja } from '../src/i18n/locales/ja';
import { zh } from '../src/i18n/locales/zh';

describe('Multi-Language i18n Architecture', () => {
  const EMOJI_REGEX =
    /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;

  it('defines 4 supported languages with valid metadata and unique shortcodes', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(4);

    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual(['th', 'en', 'ja', 'zh']);

    const shortCodes = SUPPORTED_LANGUAGES.map((l) => l.shortCode);
    expect(shortCodes).toEqual(['TH', 'EN', 'JA', 'ZH']);

    SUPPORTED_LANGUAGES.forEach((item) => {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.englishLabel.length).toBeGreaterThan(0);
    });
  });

  it('provides complete translation dictionaries for all 4 supported languages in translations map', () => {
    const supportedCodes: Language[] = ['th', 'en', 'ja', 'zh'];
    for (const code of supportedCodes) {
      expect(translations[code]).toBeDefined();
    }
  });

  it('guarantees 100% structural key parity across all 4 locales', () => {
    const locales: Record<Language, TranslationDictionary> = { th, en, ja, zh };
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

  it('guarantees all dictionary values are non-empty strings with zero undefined values', () => {
    const locales: Record<Language, TranslationDictionary> = { th, en, ja, zh };

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

  it('verifies zero emojis across all 4 translation dictionaries', () => {
    const locales: Record<Language, TranslationDictionary> = { th, en, ja, zh };
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
    expect(th.nav.home).toBe('หน้าหลัก');
    expect(en.nav.home).toBe('Home');
    expect(ja.nav.home).toBe('ホーム');
    expect(zh.nav.home).toBe('首页');

    expect(th.catalog.title).not.toEqual(en.catalog.title);
    expect(ja.catalog.title).not.toEqual(en.catalog.title);
    expect(zh.catalog.title).not.toEqual(en.catalog.title);
  });
});
