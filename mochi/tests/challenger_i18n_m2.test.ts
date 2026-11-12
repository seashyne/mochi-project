// Adversarial Empirical Challenger Stress Test Suite for Milestone 2 i18n Expansion

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  Language,
  SUPPORTED_LANGUAGES,
  TranslationDictionary
} from '../src/i18n/types';
import { translations } from '../src/i18n/context';
import { translations as legacyTranslations } from '../src/i18n/translations';
import { th } from '../src/i18n/locales/th';
import { en } from '../src/i18n/locales/en';
import { ja } from '../src/i18n/locales/ja';
import { zh } from '../src/i18n/locales/zh';

describe('Empirical Challenger: i18n Milestone 2 Stress Harness', () => {
  const LOCALES: Record<Language, TranslationDictionary> = { th, en, ja, zh };
  const ALL_LANGUAGES: Language[] = ['th', 'en', 'ja', 'zh'];
  const EXPECTED_DOMAINS: (keyof TranslationDictionary)[] = [
    'admin',
    'animation',
    'auth',
    'avatarEditor',
    'catalog',
    'dashboard',
    'footer',
    'landing',
    'install',
    'nav',
    'pages',
    'player',
    'profile',
    'studio',
    'team'
  ];

  const EMOJI_REGEX =
    /([\u{1F300}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}])/u;
  const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;
  const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  const CHINESE_CHAR_REGEX = /[\u4E00-\u9FFF]/;

  describe('Stress Probe 1: 100% Exhaustive Key Parity & Leaf Integrity', () => {
    it('guarantees identical domain structures across all 4 locales without exception', () => {
      for (const lang of ALL_LANGUAGES) {
        const actualDomains = Object.keys(LOCALES[lang]).sort();
        expect(actualDomains, `Domain mismatch in locale ${lang}`).toEqual(
          [...EXPECTED_DOMAINS].sort()
        );
      }
    });

    it('asserts zero missing or orphan keys between any locale pair', () => {
      for (const domain of EXPECTED_DOMAINS) {
        const enKeys = Object.keys(en[domain]).sort();
        for (const lang of ALL_LANGUAGES) {
          const langKeys = Object.keys(LOCALES[lang][domain]).sort();
          expect(langKeys, `Locale ${lang} has key mismatch in domain ${domain}`).toEqual(enKeys);
        }
      }
    });

    it('verifies every leaf node is a non-empty trimmed string with zero undefined/null values', () => {
      const enLeafCount = EXPECTED_DOMAINS.reduce(
        (sum, domain) => sum + Object.keys(en[domain]).length,
        0
      );
      let totalLeafNodes = 0;
      for (const lang of ALL_LANGUAGES) {
        for (const domain of EXPECTED_DOMAINS) {
          const dict = LOCALES[lang][domain] as Record<string, string>;
          for (const [key, value] of Object.entries(dict)) {
            totalLeafNodes++;
            expect(value, `Undefined value at ${lang}.${domain}.${key}`).toBeDefined();
            expect(typeof value, `Non-string at ${lang}.${domain}.${key}`).toBe('string');
            expect(value.trim().length, `Empty/blank string at ${lang}.${domain}.${key}`).toBeGreaterThan(0);
            expect(value, `Null string at ${lang}.${domain}.${key}`).not.toBe('null');
            expect(value, `Undefined string at ${lang}.${domain}.${key}`).not.toBe('undefined');
          }
        }
      }
      expect(totalLeafNodes).toBe(ALL_LANGUAGES.length * enLeafCount);
    });
  });

  describe('Stress Probe 2: Linguistic Script Authenticity & Cross-Locale Differentiation', () => {
    it('verifies Thai locale contains authentic Thai script in text-heavy domains', () => {
      const thaiSamples = [
        th.nav.home,
        th.landing.heroTitle,
        th.auth.signInTitle,
        th.dashboard.homeTitle,
        th.catalog.title,
        th.studio.publishBtn,
        th.player.defaultTitle,
        th.profile.title,
        th.footer.servicesOperational,
        th.admin.title
      ];
      for (const sample of thaiSamples) {
        expect(THAI_CHAR_REGEX.test(sample), `Expected Thai characters in: "${sample}"`).toBe(true);
      }
    });

    it('verifies Japanese locale contains authentic Kana/Kanji in text-heavy domains', () => {
      const jaSamples = [
        ja.nav.home,
        ja.landing.heroTitle,
        ja.auth.signInTitle,
        ja.dashboard.homeTitle,
        ja.catalog.title,
        ja.studio.publishBtn,
        ja.player.defaultTitle,
        ja.profile.title,
        ja.footer.servicesOperational,
        ja.admin.title
      ];
      for (const sample of jaSamples) {
        expect(JAPANESE_CHAR_REGEX.test(sample), `Expected Japanese characters in: "${sample}"`).toBe(true);
      }
    });

    it('verifies Simplified Chinese locale contains authentic Hanzi in text-heavy domains', () => {
      const zhSamples = [
        zh.nav.home,
        zh.landing.heroTitle,
        zh.auth.signInTitle,
        zh.dashboard.homeTitle,
        zh.catalog.title,
        zh.studio.publishBtn,
        zh.player.defaultTitle,
        zh.profile.title,
        zh.footer.servicesOperational,
        zh.admin.title
      ];
      for (const sample of zhSamples) {
        expect(CHINESE_CHAR_REGEX.test(sample), `Expected Chinese characters in: "${sample}"`).toBe(true);
      }
    });

    it('confirms that core navigational headers differ completely across all 4 locales', () => {
      const homeHeaders = new Set([th.nav.home, en.nav.home, ja.nav.home, zh.nav.home]);
      expect(homeHeaders.size).toBe(4);

      const catalogTitles = new Set([th.catalog.title, en.catalog.title, ja.catalog.title, zh.catalog.title]);
      expect(catalogTitles.size).toBe(4);
    });
  });

  describe('Stress Probe 3: Language Metadata, Switcher Contracts & Backward Compatibility', () => {
    it('validates SUPPORTED_LANGUAGES metadata integrity and uniqueness', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(4);

      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(new Set(codes).size).toBe(4);
      expect(codes).toEqual(['th', 'en', 'ja', 'zh']);

      const shortCodes = SUPPORTED_LANGUAGES.map((l) => l.shortCode);
      expect(new Set(shortCodes).size).toBe(4);
      expect(shortCodes).toEqual(['TH', 'EN', 'JA', 'ZH']);

      SUPPORTED_LANGUAGES.forEach((item) => {
        expect(translations[item.code]).toBeDefined();
        expect(item.label.trim().length).toBeGreaterThan(0);
        expect(item.englishLabel.trim().length).toBeGreaterThan(0);
      });
    });

    it('confirms translations object and legacy re-export maintain parity', () => {
      expect(legacyTranslations).toBeDefined();
      expect(Object.keys(legacyTranslations).sort()).toEqual(['en', 'ja', 'th', 'zh']);
      expect(legacyTranslations.th).toBe(th);
      expect(legacyTranslations.en).toBe(en);
      expect(legacyTranslations.ja).toBe(ja);
      expect(legacyTranslations.zh).toBe(zh);
    });
  });

  describe('Stress Probe 4: Adversarial Language Validation & Storage Oracle', () => {
    const isSupported = (code: string | null): boolean => {
      return SUPPORTED_LANGUAGES.some((item) => item.code === code);
    };

    it('correctly accepts only the 4 canonical language codes', () => {
      expect(isSupported('th')).toBe(true);
      expect(isSupported('en')).toBe(true);
      expect(isSupported('ja')).toBe(true);
      expect(isSupported('zh')).toBe(true);
    });

    it('robustly rejects invalid, untrusted, or malicious language codes', () => {
      const adversarialInputs = [
        null,
        '',
        '   ',
        'es',
        'fr',
        'de',
        'ru',
        'th-TH',
        'en-US',
        'zh-CN',
        'ja-JP',
        '__proto__',
        'constructor',
        'toString',
        'TH',
        'EN',
        'null',
        'undefined',
        '<script>alert(1)</script>'
      ];

      for (const input of adversarialInputs) {
        expect(
          isSupported(input),
          `Adversarial input "${input}" should be rejected by language validator`
        ).toBe(false);
      }
    });
  });

  describe('Stress Probe 5: Project Invariants (Line Ceiling and Zero Emojis)', () => {
    const i18nDir = path.resolve(__dirname, '../src/i18n');

    it('verifies all files in src/i18n strictly obey the <= 300 line limit', () => {
      const files: string[] = [];
      const collectFiles = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collectFiles(full);
          else files.push(full);
        }
      };
      collectFiles(i18nDir);

      const violations: { file: string; lines: number }[] = [];
      for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').length;
        if (lines > 300) {
          violations.push({ file: path.basename(file), lines });
        }
      }
      expect(violations).toEqual([]);
    });

    it('verifies zero Unicode emojis in any translation dictionary or i18n file', () => {
      const files: string[] = [];
      const collectFiles = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collectFiles(full);
          else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
        }
      };
      collectFiles(i18nDir);

      const emojiMatches: { file: string; line: number; match: string }[] = [];
      for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, idx) => {
          const found = line.match(EMOJI_REGEX);
          if (found) {
            emojiMatches.push({
              file: path.basename(file),
              line: idx + 1,
              match: found[0]
            });
          }
        });
      }
      expect(emojiMatches).toEqual([]);
    });
  });
});
